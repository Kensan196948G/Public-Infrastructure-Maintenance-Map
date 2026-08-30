#!/usr/bin/env node
/**
 * 本番 DB（ローカル PostgreSQL）の論理バックアップを .backup/ へ保存する。
 *   node scripts/tools/pimm-backup.mjs
 * apps/api/.env の DATABASE_URL を使用する（本番 pimm を対象）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = join(root, 'apps', 'api', '.env');
if (!existsSync(envPath)) {
  console.error('❌ apps/api/.env がありません。');
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const databaseUrl = env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('❌ DATABASE_URL が .env にありません。');
  process.exit(1);
}
const dir = join(root, '.backup');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = join(dir, `pimm-${stamp}.dump`);
execFileSync('/usr/lib/postgresql/16/bin/pg_dump', ['-Fc', databaseUrl, '-f', out], {
  stdio: 'inherit',
});
console.log(`✅ ${out}`);
