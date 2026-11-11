import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { builderProject, makeZoomProject, markerLabels, publicationConfig } from './fixtures/publication.mjs';

const figure = (page) => page.locator('.ggt-canvas-card svg').last();

const readDownload = async (download) => {
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  return fs.readFileSync(filePath);
};

const downloadFigure = async (page, format) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('形式', { exact: true }).selectOption(format);
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  return readDownload(await waiting);
};

const applyConfig = async (page, config) => {
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.locator('textarea.seq-textarea').fill(JSON.stringify(config));
  await page.getByRole('button', { name: 'JSON を反映', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
};

const textGeometry = async (svg) => svg.evaluate((root) => {
  const round = (value) => Math.round(value * 10_000) / 10_000;
  const inverse = root.getCTM().inverse();
  const boxes = [...root.querySelectorAll('text')].filter((node) => node.textContent.trim()).map((node) => {
    const bounds = node.getBBox();
    const transform = inverse.multiply(node.getCTM());
    const corners = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y + bounds.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform));
    return { text: node.textContent, x: round(corners[0].x), y: round(corners[0].y), width: round(corners[1].x - corners[0].x), height: round(corners[1].y - corners[0].y) };
  });
  const viewBox = root.viewBox.baseVal;
  return { width: viewBox.width, height: viewBox.height, boxes };
});

const assertReadableText = ({ width, height, boxes }) => {
  for (const box of boxes) {
    expect(box.x, `left clipping: ${box.text}`).toBeGreaterThanOrEqual(-1);
    expect(box.y, `top clipping: ${box.text}`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `right clipping: ${box.text}`).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height, `bottom clipping: ${box.text}`).toBeLessThanOrEqual(height + 1);
  }
  const overlaps = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapX > 1 && overlapY > 1) overlaps.push([a.text, b.text]);
    }
  }
  expect(overlaps, 'visible labels must not overlap').toEqual([]);
};

test('Japanese headers, crowded markers, and large legend text remain complete and readable', async ({ page }, testInfo) => {
  await page.goto('/');
  await applyConfig(page, publicationConfig);
  const svg = figure(page);
  const initial = await textGeometry(svg);
  const texts = initial.boxes.map((box) => box.text);
  for (const label of [...markerLabels, '厚壁組織の形成状態', '帯化の有無', '花序の形成位置', '未判定（欠測値）']) {
    expect(texts).toContain(label);
  }
  assertReadableText(initial);
  await testInfo.attach('publication-layout', { body: await svg.screenshot(), contentType: 'image/png' });

  await page.setViewportSize({ width: 1000, height: 800 });
  expect(await textGeometry(svg), 'resizing the editor must not change figure coordinates').toEqual(initial);
});

test('standalone SVG preserves the preview coordinates and carries its own text styling', async ({ page, browser }) => {
  await page.goto('/');
  await applyConfig(page, publicationConfig);
  const initial = await textGeometry(figure(page));
  const bytes = await downloadFigure(page, 'svg');
  const xml = bytes.toString('utf8');
  expect(xml).not.toContain('data-editor-only');
  const standalone = await browser.newPage();
  await standalone.goto(`data:image/svg+xml;base64,${bytes.toString('base64')}`);
  await standalone.evaluate(() => document.fonts.ready);
  const exported = await textGeometry(standalone.locator('svg'));
  expect(exported.width).toBe(initial.width);
  expect(exported.height).toBe(initial.height);
  expect(exported.boxes.map((box) => box.text)).toEqual(initial.boxes.map((box) => box.text));
  for (let i = 0; i < initial.boxes.length; i += 1) {
    for (const key of ['x', 'y', 'width', 'height']) {
      expect(exported.boxes[i][key], `${initial.boxes[i].text}: ${key}`).toBeCloseTo(initial.boxes[i][key], 0);
    }
  }
  assertReadableText(exported);
  await standalone.close();
});

test('publication PNG uses the specified millimetres and dpi without distorting the figure', async ({ page }) => {
  await page.goto('/');
  await applyConfig(page, publicationConfig);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('印刷幅(mm)', { exact: true }).fill('140');
  await page.getByLabel('解像度(dpi)', { exact: true }).fill('600');
  const svg = await downloadFigure(page, 'svg');
  const bytes = await downloadFigure(page, 'png');
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  expect(width).toBe(Math.round(140 / 25.4 * 600));
  expect(height).toBe(Math.round(width * publicationConfig.height / publicationConfig.width));
  const differingPixelFraction = await page.evaluate(async ({ svg, png, width, height }) => {
    const rasterize = async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const expected = await rasterize(`data:image/svg+xml;base64,${svg}`);
    const actual = await rasterize(`data:image/png;base64,${png}`);
    let different = 0;
    for (let i = 0; i < expected.length; i += 4) {
      if (Math.abs(expected[i] - actual[i]) > 16 || Math.abs(expected[i + 1] - actual[i + 1]) > 16
        || Math.abs(expected[i + 2] - actual[i + 2]) > 16 || Math.abs(expected[i + 3] - actual[i + 3]) > 16) different += 1;
    }
    return different / (width * height);
  }, { svg: svg.toString('base64'), png: bytes.toString('base64'), width, height });
  expect(differingPixelFraction, 'PNG and standalone SVG must show the same figure').toBeLessThan(0.001);
});

test('figure JSON restores the exact drawing and print settings after another figure is loaded', async ({ page }) => {
  await page.goto('/');
  await applyConfig(page, publicationConfig);
  const initial = await textGeometry(figure(page));
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('印刷幅(mm)', { exact: true }).fill('150');
  await page.getByLabel('解像度(dpi)', { exact: true }).fill('300');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '図設定JSONを保存', exact: true }).click();
  const bytes = await readDownload(await waiting);
  const saved = JSON.parse(bytes.toString('utf8'));
  expect(saved.config).toEqual(publicationConfig);
  expect(saved.exportSettings).toMatchObject({ widthMm: 150, dpi: 300 });
  await applyConfig(page, { ...publicationConfig, background: '#ffeeee', tracks: [] });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('図設定JSONを読み込む', { exact: true }).setInputFiles({
    name: 'restored-figure.json', mimeType: 'application/json', buffer: bytes,
  });
  await expect(figure(page)).toContainText('合成個体F₂-001（組換え型）');
  expect(await textGeometry(figure(page))).toEqual(initial);
  await expect(page.getByLabel('印刷幅(mm)', { exact: true })).toHaveValue('150');
  await expect(page.getByLabel('解像度(dpi)', { exact: true })).toHaveValue('300');
});

test('Builder project save and restore preserves all genotypes, missing values, and annotations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Builder', exact: true }).click();
  await page.getByLabel('Project(.json) 読み込み', { exact: true }).setInputFiles({
    name: 'synthetic-publication.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(builderProject)),
  });
  await expect(figure(page)).toContainText('合成F₂-01');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Project(JSON) 保存', exact: true }).click();
  const saved = JSON.parse((await readDownload(await waiting)).toString('utf8'));
  expect(saved.markerMeta).toEqual(builderProject.markerMeta);
  expect(saved.rows.map(({ sample, codes, annotations, mark }) => ({ sample, codes, annotations, mark })))
    .toEqual(builderProject.rows.map(({ sample, codes, annotations, mark }) => ({ sample, codes, annotations, mark })));
  expect(saved.annoCols).toEqual(builderProject.annoCols);

  const initial = await textGeometry(figure(page));
  await page.reload();
  await page.getByLabel('Project(.json) 読み込み', { exact: true }).setInputFiles({
    name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(figure(page)).toContainText('合成F₂-01');
  // Runtime-only row IDs are intentionally excluded from the value comparison.
  const again = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Project(JSON) 保存', exact: true }).click();
  const restored = JSON.parse((await readDownload(await again)).toString('utf8'));
  expect(restored.rows).toEqual(saved.rows);
  expect(restored.markerMeta).toEqual(saved.markerMeta);
  expect(await textGeometry(figure(page))).toEqual(initial);
});

for (const markerCount of [3, 20]) {
  test(`numeric-window publication preset keeps all ${markerCount} markers readable and missing values distinct`, async ({ page }, testInfo) => {
    const project = makeZoomProject(markerCount);
    await page.goto('/');
    await page.getByRole('button', { name: 'Builder', exact: true }).click();
    await page.getByLabel('Project(.json) 読み込み', { exact: true }).setInputFiles({
      name: 'synthetic-zoom.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(figure(page)).toContainText(project.markerMeta[0].name);
    await page.getByRole('button', { name: '論文用に整える', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    const svg = figure(page);
    const labels = svg.locator('[data-ggt-track-id="__detail_axis__"][data-ggt-label="marker-name"]');
    await expect(labels).toHaveCount(markerCount);
    expect(await labels.allTextContents()).toEqual(project.markerMeta.map((marker) => marker.name));
    assertReadableText(await textGeometry(svg));
    await testInfo.attach(`numeric-window-${markerCount}-markers`, { body: await svg.screenshot(), contentType: 'image/png' });

    const save = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Project(JSON) 保存', exact: true }).click();
    const savedProject = JSON.parse((await readDownload(await save)).toString('utf8'));
    expect(savedProject.markerMeta).toEqual(project.markerMeta);
    expect(savedProject.rows.map((row) => row.codes)).toEqual(project.rows.map((row) => row.codes));

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const settings = page.waitForEvent('download');
    await page.getByRole('button', { name: '図設定JSONを保存', exact: true }).click();
    const savedFigure = JSON.parse((await readDownload(await settings)).toString('utf8'));
    const secondRow = savedFigure.config.tracks.find((track) => track.leftText?.text === project.rows[1].sample);
    expect(secondRow).toBeTruthy();
    const missing = secondRow.segments.find((segment) => segment.start <= 1 / markerCount && segment.end > 1 / markerCount);
    const heterozygous = secondRow.segments.find((segment) => segment.start <= 2 / markerCount && segment.end > 2 / markerCount);
    expect(missing.fill, 'missing and H must be visually distinct').not.toBe(heterozygous.fill);
    expect(savedFigure.config.overlays.some((overlay) => overlay.kind === 'text' && overlay.text === '未判定')).toBe(true);
  });
}

test('clicking a spread marker label edits that marker rather than the nearest column', async ({ page }) => {
  const project = makeZoomProject(20);
  await page.goto('/');
  await page.getByRole('button', { name: 'Builder', exact: true }).click();
  await page.getByLabel('Project(.json) 読み込み', { exact: true }).setInputFiles({
    name: 'synthetic-spread-labels.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole('button', { name: '論文用に整える', exact: true }).click();
  const svg = figure(page);
  const shiftedIndex = await svg.locator('[data-ggt-axis-track="__detail_axis__"]').evaluate((axis) => {
    for (const node of axis.querySelectorAll('[data-ggt-label="marker-name"]')) {
      const leader = node.parentElement.querySelector('[data-ggt-label-leader="top"]');
      if (leader && Math.abs(Number(leader.getAttribute('x1')) - Number(node.getAttribute('x'))) > 10) {
        return Number(node.getAttribute('data-ggt-marker-index'));
      }
    }
    return -1;
  });
  expect(shiftedIndex, 'fixture must include a label displaced from its marker anchor').toBeGreaterThanOrEqual(0);
  const target = svg.locator(`[data-ggt-track-id="__detail_axis__"][data-ggt-label="marker-name"][data-ggt-marker-index="${shiftedIndex}"]`);
  await target.click();
  const popover = page.locator('.ggt-canvas-popover');
  await expect(popover.locator('.ggt-canvas-popover-title')).toHaveText(`詳細マーカー名 • #${shiftedIndex + 1}`);
  await expect(popover.locator('input')).toHaveValue(project.markerMeta[shiftedIndex].name);
  await popover.locator('input').fill('合成マーカー名を編集');
  await popover.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(target).toHaveText('合成マーカー名を編集');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Project(JSON) 保存', exact: true }).click();
  const saved = JSON.parse((await readDownload(await waiting)).toString('utf8'));
  expect(saved.markerMeta).toEqual(project.markerMeta.map((marker, i) => i === shiftedIndex ? { ...marker, name: '合成マーカー名を編集' } : marker));
  expect(saved.rows.map((row) => row.codes)).toEqual(project.rows.map((row) => row.codes));
});
