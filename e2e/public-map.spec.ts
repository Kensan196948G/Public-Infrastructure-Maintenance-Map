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
  await page.getByRole('button', { name: '🔍 検索' }).click();

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

test('shows admin entry points and settings when Access-authenticated', async ({ page }) => {
  // Cloudflare Access 相当の認証を模擬: 管理APIリクエストへ認証済みメールを注入する。
  // （dev サーバは Access JWT 検証がオフで、ADMIN_EMAILS allowlist のみで判定する）
  await page.route('**/api/v1/admin/**', async (route) => {
    const headers = await route.request().allHeaders();
    await route.continue({
      headers: {
        ...headers,
        'cf-access-authenticated-user-email': 'admin@example.com',
      },
    });
  });

  await page.goto('/');
  await waitForPublicResults(page);

  await expect(page.getByRole('button', { name: /システム設定/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /監査ログ/ })).toBeVisible();
  await expect(page.getByText(/管理機能は認証後に表示されます/)).toHaveCount(0);

  await page.getByRole('button', { name: /システム設定/ }).click();
  const dialog = page.getByRole('dialog', { name: 'システム設定' });
  await expect(dialog).toContainText('データソース登録 / 編集');
  await expect(dialog.getByRole('heading', { name: /運用ダッシュボード/ })).toBeVisible();
});

test('submits public feedback through the dialog (Issue #54)', async ({ page }) => {
  await page.goto('/');
  await waitForPublicResults(page);

  await page.getByRole('button', { name: /誤りを報告/ }).click();
  const dialog = page.getByRole('dialog', { name: '📣 誤りを報告' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('カテゴリ').selectOption('location');
  await dialog.getByLabel(/詳細/).fill('E2E テスト用: 位置がずれているように見えます');
  await dialog.getByRole('button', { name: '📤 送信' }).click();

  await expect(dialog.getByText(/受け付けました/)).toBeVisible();
});

test('shows audit events and feedback in the audit log when authenticated', async ({ page }) => {
  await page.route('**/api/v1/admin/**', async (route) => {
    const headers = await route.request().allHeaders();
    await route.continue({
      headers: {
        ...headers,
        'cf-access-authenticated-user-email': 'admin@example.com',
      },
    });
  });

  await page.goto('/');
  await waitForPublicResults(page);

  await page.getByRole('button', { name: /監査ログ/ }).click();
  const dialog = page.getByRole('dialog', { name: '監査ログ（取込状況）' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: '一覧を更新' }).click();
  await expect(dialog.getByRole('heading', { name: /監査イベント/ })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /フィードバック/ })).toBeVisible();
  // 管理API応答のチェーン整合性表示が現れる（fixture は valid である前提でなく、
  // 表示自体が存在することのみを検証する）。
  await expect(dialog.getByText(/チェーン整合性/).first()).toBeVisible();
});
