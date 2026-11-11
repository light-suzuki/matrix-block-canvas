import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { makeThesisProject, thesisColors } from './fixtures/thesis.mjs';

const figure = (page) => page.locator('.ggt-canvas-card svg').last();

const downloadedBytes = async (download) => fs.readFileSync(await download.path());

const downloadFrom = async (page, button) => {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  return downloadedBytes(await waiting);
};

const loadProject = async (page, project) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Builder', exact: true }).click();
  await page.getByLabel('Project(.json) 読み込み', { exact: true }).setInputFiles({
    name: 'synthetic-thesis.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(figure(page)).toContainText(project.rows[0].sample);
  await page.evaluate(() => document.fonts.ready);
};

const saveFigure = async (page) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  return JSON.parse((await downloadFrom(page, '図設定JSONを保存')).toString('utf8'));
};

const exportFigure = async (page, format) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('形式', { exact: true }).selectOption(format);
  return downloadFrom(page, '保存');
};

const textGeometry = async (svg) => svg.evaluate((root) => {
  const inverse = root.getCTM().inverse();
  const context = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas').getContext('2d');
  const boxes = [...root.querySelectorAll('text')].filter((node) => node.textContent.trim() && !node.closest('[data-export-exclude]')).map((node) => {
    const style = getComputedStyle(node);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    context.fontKerning = style.fontKerning;
    const metrics = context.measureText(node.textContent);
    const lineBox = node.getBBox();
    const start = node.getStartPositionOfChar(0);
    // SVG dominant-baseline adjusts the font line box. Canvas gives the actual
    // painted glyph bounds relative to its alphabetic baseline, excluding leading.
    const baseline = lineBox.y + metrics.fontBoundingBoxAscent;
    const scaleX = metrics.width ? node.getComputedTextLength() / metrics.width : 1;
    const box = {
      x: start.x - metrics.actualBoundingBoxLeft * scaleX,
      y: baseline - metrics.actualBoundingBoxAscent,
      width: (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) * scaleX,
      height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
    };
    const matrix = inverse.multiply(node.getCTM());
    const polygon = [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix)).map(({ x, y }) => ({ x, y }));
    const xs = polygon.map(({ x }) => x);
    const ys = polygon.map(({ y }) => y);
    return { text: node.textContent, x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys), polygon };
  });
  return { width: root.viewBox.baseVal.width, height: root.viewBox.baseVal.height, boxes };
});

const overlaps = (a, b) => [a, b].every((polygon) => polygon.every((start, i) => {
  const end = polygon[(i + 1) % polygon.length];
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (!length) return true;
  const normal = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
  const p = [a, b].map((points) => points.map((point) => point.x * normal.x + point.y * normal.y));
  return Math.min(Math.max(...p[0]), Math.max(...p[1])) - Math.max(Math.min(...p[0]), Math.min(...p[1])) > 1;
}));

const readable = ({ width, height, boxes }) => {
  for (const box of boxes) {
    expect(box.x, `left: ${box.text}`).toBeGreaterThanOrEqual(-1);
    expect(box.y, `top: ${box.text}`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `right: ${box.text}`).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height, `bottom: ${box.text}`).toBeLessThanOrEqual(height + 1);
  }
  const collisions = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i].polygon, boxes[j].polygon)) collisions.push([boxes[i].text, boxes[j].text]);
    }
  }
  expect(collisions, 'thesis labels must remain readable').toEqual([]);
};

const sameGeometry = (actual, expected) => {
  expect(actual.width).toBe(expected.width);
  expect(actual.height).toBe(expected.height);
  expect(actual.boxes.map(({ text }) => text)).toEqual(expected.boxes.map(({ text }) => text));
  for (let i = 0; i < expected.boxes.length; i++) {
    for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(actual.boxes[i][key] - expected.boxes[i][key]), `${expected.boxes[i].text}: ${key}`).toBeLessThan(0.5);
  }
};

const scientificValues = (project) => ({
  markers: project.markerMeta,
  rows: project.rows.map(({ sample, codes, annotations }) => ({ sample, codes, annotations })),
});

test('thesis mode keeps physical ticks distinct from equal-width genotype cells', async ({ page }, testInfo) => {
  const project = makeThesisProject();
  await loadProject(page, project);
  await testInfo.attach('thesis-figure', { body: await figure(page).screenshot(), contentType: 'image/png' });
  const savedBuilder = JSON.parse((await downloadFrom(page, 'Project(JSON) 保存')).toString('utf8'));
  expect(savedBuilder.figureMode).toBe('thesis');
  expect(scientificValues(savedBuilder)).toEqual(scientificValues(project));
  for (const key of ['thesisParentRows', 'thesisGeneMarker', 'thesisGeneLabel', 'thesisCandidateEnabled', 'thesisPositionDecimals', 'thesisFontPt', 'thesisRowPitchMm', 'thesisWidthMm']) {
    expect(savedBuilder[key], key).toBe(project[key]);
  }
  const saved = await saveFigure(page);
  const config = saved.config;
  expect(config.width).toBe(1400);
  expect(config.tracks).toHaveLength(project.rows.length);
  expect(config.legend, 'the reference uses a horizontal swatch legend').toBeFalsy();
  expect(config.overlays.some((overlay) => overlay.kind === 'line' && (overlay.markerStart || overlay.markerEnd)), 'the candidate interval belongs on the axis').toBe(false);

  const plot = config.plot;
  const centers = project.markerMeta.map((_, column) => plot.x + (column + 0.5) * plot.width / project.markers);
  const physical = project.markerMeta.map(({ pos }) => centers[0] + (pos - 10) / 10 * (centers.at(-1) - centers[0]));
  const ticks = config.overlays.filter((overlay) => overlay.id?.startsWith('thesis-marker-tick-'))
    .sort((a, b) => Number(a.id.split('-').at(-1)) - Number(b.id.split('-').at(-1)));
  expect(ticks).toHaveLength(project.markers);
  for (let i = 0; i < ticks.length; i++) {
    expect(ticks[i].x1).toBeCloseTo(physical[i], 6);
    expect(ticks[i].x2).toBeCloseTo(physical[i], 6);
  }
  expect(Math.abs(physical[1] - centers[1]), 'clustered physical coordinates must not become equally spaced').toBeGreaterThan(100);
  for (let row = 0; row < project.rows.length; row++) {
    const track = config.tracks[row];
    expect(track.segments).toHaveLength(project.markers);
    expect(track.height).toBeCloseTo(36 * 0.62, 6);
    for (let column = 0; column < project.markers; column++) {
      const cell = track.segments[column];
      expect(cell.start).toBeCloseTo(column / project.markers, 6);
      expect(cell.end).toBeCloseTo((column + 1) / project.markers, 6);
      expect(cell.fill.toUpperCase()).toBe(thesisColors[project.rows[row].codes[column]].toUpperCase());
    }
  }
  expect(config.tracks[1].gapAfter).toBeGreaterThan(config.tracks[0].gapAfter);
  const positions = config.overlays.filter((overlay) => overlay.role === 'marker-position').sort((a, b) => a.markerIndex - b.markerIndex);
  expect(positions.map(({ text }) => text)).toEqual(project.markerMeta.map(({ pos }) => pos.toFixed(3)));
  expect(positions.every(({ rotation }) => rotation === -55)).toBe(true);
  const interval = config.overlays.find((overlay) => overlay.id === 'thesis-candidate-interval');
  expect(interval).toBeTruthy();
  expect(interval.y1).toBe(interval.y2);
  expect(interval.x1).toBeCloseTo(physical[3], 6);
  expect(interval.x2).toBeCloseTo(physical[5], 6);
  const gene = config.overlays.find((overlay) => overlay.id === 'thesis-gene-column');
  expect(gene.x).toBeCloseTo(plot.x + 4 * plot.width / project.markers, 6);
  expect(gene.width).toBeCloseTo(plot.width / project.markers, 6);
  const legend = config.overlays.filter((overlay) => overlay.role === 'legend-label');
  expect(legend.map(({ text }) => text)).toEqual(['親A型', '親B型', 'ヘテロ型', '未判定']);
  expect(new Set(legend.map(({ y }) => y)).size).toBe(1);
  const samples = config.overlays.filter((overlay) => overlay.role === 'sample');
  expect(samples.slice(0, 2).every(({ fontWeight }) => fontWeight >= 700)).toBe(true);
  expect(samples.slice(2).every(({ fontWeight }) => fontWeight === 400)).toBe(true);
  const positives = config.overlays.filter((overlay) => overlay.role === 'annotation' && overlay.text === '○');
  expect(positives).toHaveLength(3);
  expect(positives.every(({ fill }) => fill.toUpperCase() === '#D7191C')).toBe(true);
  readable(await textGeometry(figure(page)));
});

test('thesis output survives Builder and figure settings round trips and standalone SVG/PNG export', async ({ page, browser }) => {
  const project = makeThesisProject();
  await loadProject(page, project);
  const initial = await textGeometry(figure(page));
  const builder = await downloadFrom(page, 'Project(JSON) 保存');
  await page.getByLabel('Project(.json) 読み込み', { exact: true }).setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: builder });
  await expect(figure(page)).toContainText(project.rows[0].sample);
  sameGeometry(await textGeometry(figure(page)), initial);
  const saved = await saveFigure(page);
  const svg = await exportFigure(page, 'svg');
  const png = await exportFigure(page, 'png');
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(width).toBe(Math.round(140 / 25.4 * 600));
  expect(height).toBeCloseTo(width * saved.config.height / saved.config.width, 0);
  const imageDifference = await page.evaluate(async ({ svgBase64, pngBase64, width, height }) => {
    const pixels = async (uri) => {
      const image = new Image();
      image.src = uri;
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
    const expected = await pixels(`data:image/svg+xml;base64,${svgBase64}`);
    const actual = await pixels(`data:image/png;base64,${pngBase64}`);
    let different = 0;
    for (let i = 0; i < expected.length; i += 4) {
      if ([0, 1, 2, 3].some((channel) => Math.abs(expected[i + channel] - actual[i + channel]) > 16)) different++;
    }
    return different / (width * height);
  }, { svgBase64: svg.toString('base64'), pngBase64: png.toString('base64'), width, height });
  expect(imageDifference, 'thesis SVG and PNG must show the same geometry and text').toBeLessThan(0.001);
  const independent = await browser.newPage();
  await independent.goto(`data:image/svg+xml;base64,${svg.toString('base64')}`);
  await independent.evaluate(() => document.fonts.ready);
  sameGeometry(await textGeometry(independent.locator('svg')), initial);
  readable(await textGeometry(independent.locator('svg')));
  await independent.close();

  const settings = Buffer.from(JSON.stringify(saved));
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.locator('textarea.seq-textarea').fill(JSON.stringify({ width: 1400, height: 500, tracks: [] }));
  await page.getByRole('button', { name: 'JSON を反映', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('図設定JSONを読み込む', { exact: true }).setInputFiles({ name: 'figure.json', mimeType: 'application/json', buffer: settings });
  await expect(figure(page)).toContainText('SyntheticGene');
  sameGeometry(await textGeometry(figure(page)), initial);
});

for (const [markers, annotations] of [[3, 1], [15, 2], [50, 1], [50, 2]]) {
  test(`thesis mode reflows ${markers} markers and ${annotations} phenotype columns without losing data`, async ({ page }, testInfo) => {
    const project = makeThesisProject(markers, annotations);
    if (markers === 50) project.thesisWidthMm = 280;
    await loadProject(page, project);
    const saved = await saveFigure(page);
    expect(saved.config.tracks).toHaveLength(project.rows.length);
    expect(saved.config.tracks.every((track) => track.segments.length === markers)).toBe(true);
    const positions = saved.config.overlays.filter((overlay) => overlay.role === 'marker-position');
    expect(positions).toHaveLength(markers);
    readable(await textGeometry(figure(page)));
    await testInfo.attach(`thesis-${markers}-markers-${annotations}-phenotypes`, { body: await figure(page).screenshot(), contentType: 'image/png' });
  });
}

test('an overcrowded thesis axis explains the limit and prevents exporting a previous figure', async ({ page }) => {
  await loadProject(page, makeThesisProject());
  const initial = await textGeometry(figure(page));
  const crowded = makeThesisProject(50);
  await page.getByLabel('Project(.json) 読み込み', { exact: true }).setInputFiles({
    name: 'overcrowded.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(crowded)),
  });
  await expect(page.getByText(/修論形式の位置ラベルがこの幅に収まりません/)).toBeVisible();
  sameGeometry(await textGeometry(figure(page)), initial);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
});

test('editing a thesis position label changes only its original marker coordinate', async ({ page }) => {
  const project = makeThesisProject();
  project.markerMeta[1].label = '10.010†';
  await loadProject(page, project);
  const label = figure(page).locator('[data-ggt-label="marker-position"][data-ggt-marker-index="1"]');
  await expect(label).toHaveText('10.010†');
  await label.click();
  const editor = page.locator('.ggt-canvas-popover');
  await expect(editor.locator('.ggt-canvas-popover-title')).toHaveText('詳細マーカー位置 • #2');
  await expect(editor.locator('input')).toHaveValue(String(project.markerMeta[1].pos));
  await editor.locator('input').fill('10.012');
  await editor.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(label).toHaveText('10.012†');
  const saved = JSON.parse((await downloadFrom(page, 'Project(JSON) 保存')).toString('utf8'));
  expect(saved.markerMeta).toEqual(project.markerMeta.map((marker, i) => i === 1 ? { ...marker, pos: 10.012, label: '10.012†' } : marker));
  expect(saved.rows.map(({ codes, annotations }) => ({ codes, annotations })))
    .toEqual(project.rows.map(({ codes, annotations }) => ({ codes, annotations })));
});

test('renaming a selected gene marker retains its column frame and explicit caption', async ({ page }) => {
  const project = makeThesisProject();
  await loadProject(page, project);
  const before = await saveFigure(page);
  const previousFrame = before.config.overlays.find((overlay) => overlay.role === 'gene-column');
  expect(previousFrame).toBeTruthy();
  await page.getByRole('button', { name: 'Builder', exact: true }).click();
  await page.getByText('表で編集（GUI）', { exact: true }).click();
  const replacement = 'renamed_synthetic_M05';
  await page.getByPlaceholder('m5', { exact: true }).fill(replacement);
  await expect(page.getByLabel('直接判定の遺伝子列', { exact: true })).toHaveValue(replacement);
  await expect(figure(page)).toContainText('SyntheticGene');
  const savedProject = JSON.parse((await downloadFrom(page, 'Project(JSON) 保存')).toString('utf8'));
  expect(savedProject.thesisGeneMarker).toBe(replacement);
  expect(savedProject.thesisGeneLabel).toBe('SyntheticGene');
  expect(savedProject.markerMeta).toEqual(project.markerMeta.map((marker, i) => i === 4 ? { ...marker, name: replacement } : marker));
  expect(savedProject.rows.map(({ codes, annotations }) => ({ codes, annotations })))
    .toEqual(project.rows.map(({ codes, annotations }) => ({ codes, annotations })));
  const after = await saveFigure(page);
  expect(after.config.overlays.find((overlay) => overlay.role === 'gene-column')).toEqual(previousFrame);
  expect(after.config.overlays.find((overlay) => overlay.role === 'gene-label').text).toBe('SyntheticGene');
});

test('applying valid Advanced JSON clears a prior thesis render error and restores export', async ({ page }) => {
  await loadProject(page, makeThesisProject());
  const valid = await saveFigure(page);
  await page.getByRole('button', { name: 'Builder', exact: true }).click();
  await page.getByLabel('Project(.json) 読み込み', { exact: true }).setInputFiles({
    name: 'overcrowded.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(makeThesisProject(50))),
  });
  await expect(page.getByText(/修論形式の位置ラベルがこの幅に収まりません/)).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.locator('textarea.seq-textarea').fill(JSON.stringify(valid.config));
  await page.getByRole('button', { name: 'JSON を反映', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '図設定JSONを保存', exact: true })).toBeEnabled();
  const exported = await exportFigure(page, 'svg');
  expect(exported.toString('utf8')).toContain('SyntheticGene');
  const restored = await saveFigure(page);
  expect(restored.config).toEqual(valid.config);
});

test('thesis marker notes, emphasis, and gene selection survive history, resizing, and cached reload', async ({ page }) => {
  const project = makeThesisProject();
  project.markerMeta[1] = { ...project.markerMeta[1], label: '10.010†', bold: true };
  await loadProject(page, project);
  const cell = figure(page).locator('[data-ggt-track]').nth(2).locator('rect').first();
  const initialFill = await cell.getAttribute('fill');
  const getProject = async () => JSON.parse((await downloadFrom(page, 'Project(JSON) 保存')).toString('utf8'));
  const history = async (shortcut) => {
    await page.getByRole('heading', { name: 'Genotype Canvas', exact: true }).click();
    await page.keyboard.press(shortcut);
  };
  await cell.click();
  await expect(cell).not.toHaveAttribute('fill', initialFill);
  const editedFill = await cell.getAttribute('fill');
  await history('Control+z');
  await expect(cell).toHaveAttribute('fill', initialFill);
  expect((await getProject()).markerMeta).toEqual(project.markerMeta);
  await history('Control+y');
  await expect(cell).toHaveAttribute('fill', editedFill);
  expect((await getProject()).markerMeta).toEqual(project.markerMeta);

  await page.getByText('表で編集（GUI）', { exact: true }).click();
  const replacement = 'history_synthetic_M05';
  await page.getByPlaceholder('m5', { exact: true }).fill(replacement);
  await expect(page.getByLabel('直接判定の遺伝子列', { exact: true })).toHaveValue(replacement);
  await history('Control+z');
  await expect(page.getByLabel('直接判定の遺伝子列', { exact: true })).toHaveValue(project.thesisGeneMarker);
  const undone = await getProject();
  expect(undone.figureMode).toBe('thesis');
  expect(undone.markerMeta).toEqual(project.markerMeta);
  expect(undone.thesisGeneLabel).toBe('SyntheticGene');
  await history('Control+y');
  await expect(page.getByLabel('直接判定の遺伝子列', { exact: true })).toHaveValue(replacement);
  const expectedMarkers = project.markerMeta.map((marker, index) => index === 4 ? { ...marker, name: replacement } : marker);
  const redone = await getProject();
  expect(redone.markerMeta).toEqual(expectedMarkers);

  await page.getByLabel('Markers（列）', { exact: true }).fill('7');
  await page.getByLabel('Markers（列）', { exact: true }).fill('6');
  await expect(figure(page)).toContainText('SyntheticGene');
  const resized = await getProject();
  expect(resized.markerMeta).toEqual(expectedMarkers);
  expect(resized.thesisGeneMarker).toBe(replacement);
  expect(resized.rows).toEqual(redone.rows);
  const notedLabel = figure(page).locator('[data-ggt-label="marker-position"][data-ggt-marker-index="1"]');
  await expect(notedLabel).toHaveText('10.010†');
  await expect(notedLabel).toHaveAttribute('font-weight', '700');
  await page.reload();
  await expect(notedLabel).toHaveText('10.010†');
  await expect(notedLabel).toHaveAttribute('font-weight', '700');
  const cached = await getProject();
  expect(cached.markerMeta).toEqual(expectedMarkers);
  expect(cached.thesisGeneMarker).toBe(replacement);
  expect(cached.thesisGeneLabel).toBe('SyntheticGene');
});
