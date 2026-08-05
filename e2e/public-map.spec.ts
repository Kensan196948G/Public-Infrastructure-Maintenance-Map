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

test('hides admin entry points from unauthenticated visitors', async ({ page }) => {
  await page.goto('/');
  await waitForPublicResults(page);

  await expect(page.getByRole('button', { name: /システム設定/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /監査ログ/ })).toHaveCount(0);
  await expect(page.getByText(/管理機能は認証後に表示されます/)).toBeVisible();
});
