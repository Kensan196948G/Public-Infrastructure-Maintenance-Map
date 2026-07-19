import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function waitForPublicResults(page: Page) {
  await expect(page.getByRole('button', { name: /みらい大橋/ })).toBeVisible();
}

test('loads the public map shell and sample assets', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '公開インフラ維持管理マップ' })).toBeVisible();
  await waitForPublicResults(page);
  await expect(page.getByText(/表示中:/)).toBeVisible();
  await expect(page.getByRole('button', { name: /データソース一覧/ })).toBeVisible();
});

test('searches assets and opens the detail panel', async ({ page }) => {
  await page.goto('/');
  await waitForPublicResults(page);

  await page.getByLabel('キーワード検索').fill('ふたご');
  await page.getByRole('button', { name: /検索/ }).click();

  const result = page.getByRole('button', { name: /ふたご橋/ }).first();
  await expect(result).toBeVisible();
  await result.click();

  const detail = page.getByRole('complementary', { name: '詳細情報' });
  await expect(detail).toContainText('ふたご橋');
  await expect(detail).toContainText('出典・利用条件');
});

test('supports public type filtering', async ({ page }) => {
  await page.goto('/');
  await waitForPublicResults(page);

  await page.getByRole('checkbox', { name: /橋梁/ }).uncheck();
  await expect(page.getByRole('button', { name: /みらい大橋/ })).toHaveCount(0);
  await expect(page).not.toHaveURL(/types=bridge/);
});

test('opens the system settings source-management form', async ({ page }) => {
  await page.goto('/');
  await waitForPublicResults(page);

  await page.getByRole('button', { name: /システム設定/ }).click();

  const dialog = page.getByRole('dialog', { name: 'システム設定' });
  await expect(dialog).toContainText('データソース登録 / 編集');
  await expect(dialog.getByLabel('対象')).toBeVisible();
  await expect(dialog.getByLabel('slug')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /登録/ })).toBeVisible();
});

test('rejects unauthenticated source registration from the settings form', async ({ page }) => {
  await page.goto('/');
  await waitForPublicResults(page);

  await page.getByRole('button', { name: /システム設定/ }).click();

  const dialog = page.getByRole('dialog', { name: 'システム設定' });
  await dialog.getByLabel('slug').fill('e2e-source');
  await dialog.getByLabel('名称').fill('E2E ソース');
  await dialog.getByLabel('提供者').fill('E2E 提供者');
  await dialog.getByLabel('URL', { exact: true }).fill('https://example.com/e2e.geojson');
  await dialog.getByLabel('ライセンス', { exact: true }).fill('CC-BY-4.0');
  await dialog.getByRole('button', { name: /登録/ }).click();

  await expect(dialog.getByRole('alert')).toContainText('401');
});
