#!/usr/bin/env node
/**
 * W05 河川 47 県の一括取込（既定 dry-run）。
 *   node scripts/tools/ingest-river-w05-all.mjs [--publish] [--only 01,36]
 *
 * 逐次実行（並列にすると県別 zip ダウンロードと 149MB XML 変換で
 * メモリ/帯域が競合するため）。1 県ずつ確実に完了させて次へ進む。
 */
import { execFileSync } from 'node:child_process';

const PREFECTURES = Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0'));

const args = process.argv.slice(2);
const publish = args.includes('--publish');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? (args[onlyIndex + 1] ?? '').split(',') : null;

const targets = only ? PREFECTURES.filter((code) => only.includes(code)) : PREFECTURES;
if (targets.length === 0) {
  console.error('❌ 対象県がありません（--only のコードを確認してください）');
  process.exit(1);
}

console.log(`▶ W05 一括取込 ${targets.length} 県（${publish ? 'publish' : 'dry-run'}）`);
for (const code of targets) {
  const slug = `river-w05-${code}`;
  console.log(`\n=== ${slug} ===`);
  const args = ['ingest', '--source', slug, ...(publish ? ['--publish'] : [])];
  execFileSync('pnpm', args, { stdio: 'inherit' });
}
console.log(`\n🎉 完了: ${targets.length} 県（${publish ? 'publish' : 'dry-run'}）`);
