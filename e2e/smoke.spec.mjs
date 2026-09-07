import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test.use({ channel: 'chrome' });

const collectRuntimeErrors = (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
};

const assertNoRuntimeErrors = (errors) => {
  expect(errors, errors.join('\n')).toEqual([]);
};

const readDownload = async (download) => {
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  return fs.readFileSync(downloadPath);
};

test('production web app: TSV generation, exports, and Flapjack path work', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Genotype Canvas' })).toBeVisible();

  await page.getByRole('button', { name: 'TSV', exact: true }).click();
  await page.getByRole('button', { name: '例を入れる', exact: true }).click();
  const tsv = page.locator('textarea.seq-textarea');
  await expect(tsv).toHaveValue(/row_04/);
  await page.getByRole('button', { name: 'TSV から生成', exact: true }).click();
  await expect(page.getByText(/3 markers • 4 rows/)).toBeVisible();
  await expect(page.locator('svg').first()).toBeVisible();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('形式').selectOption('svg');
  const svgDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const svgDownload = await svgDownloadPromise;
  expect(svgDownload.suggestedFilename()).toMatch(/\.svg$/i);
  const svgBytes = await readDownload(svgDownload);
  const svgText = svgBytes.toString('utf8');
  expect(svgText).toContain('<svg');
  expect(svgText).toContain('xmlns="http://www.w3.org/2000/svg"');

  await page.getByLabel('形式').selectOption('jpeg');
  const jpegDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const jpegDownload = await jpegDownloadPromise;
  expect(jpegDownload.suggestedFilename()).toMatch(/\.jpg$/i);
  const jpegBytes = await readDownload(jpegDownload);
  expect(jpegBytes.length).toBeGreaterThan(5_000);
  expect(jpegBytes[0]).toBe(0xff);
  expect(jpegBytes[1]).toBe(0xd8);

  await page.getByRole('button', { name: 'Quick', exact: true }).click();
  await page.getByRole('button', { name: 'Flapjack 例 → 生成', exact: true }).click();
  await expect(page.getByText(/3 markers • 4 rows/)).toBeVisible();
  await expect(page.locator('svg').first()).toBeVisible();

  assertNoRuntimeErrors(runtimeErrors);
});

test('portable single-file build opens directly from file:// and generates a figure', async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const runtimeErrors = collectRuntimeErrors(page);
  const portablePath = path.resolve('dist', 'MatrixBlockCanvas-portable.html');
  expect(fs.existsSync(portablePath)).toBe(true);

  await page.goto(pathToFileURL(portablePath).href, { waitUntil: 'load' });
  const heading = page.getByRole('heading', { name: 'Genotype Canvas' });
  await expect(heading).toBeVisible();
  await page.getByRole('button', { name: 'Quick', exact: true }).click();
  await page.getByRole('button', { name: 'TSV 例 → 生成', exact: true }).click();
  await expect(page.getByText(/3 markers • 4 rows/)).toBeVisible();
  await expect(page.locator('svg').first()).toBeVisible();

  assertNoRuntimeErrors(runtimeErrors);
  await context.close();
});
