#!/usr/bin/env node
/**
 * Applies the shared edge rate limit for the PIMM API (Issue #41).
 *
 * The rule lives in infra/cloudflare/http-ratelimit.entrypoint.json so the
 * zone's http_ratelimit phase is reviewable IaC instead of dashboard state.
 *
 * Modes:
 *   node scripts/tools/cloudflare-rate-limit.mjs            # dry-run (default): validate config, show the planned PUT
 *   node scripts/tools/cloudflare-rate-limit.mjs --show     # read the currently deployed phase entrypoint
 *   node scripts/tools/cloudflare-rate-limit.mjs --apply    # PUT the entrypoint (production change — approval-gated)
 *   node scripts/tools/cloudflare-rate-limit.mjs --verify   # burst the live API and expect a 429 within the window
 *
 * Requires CLOUDFLARE_API_TOKEN with Zone.WAF (Zone Rulesets) edit for
 * --show/--apply. The token value is read from the environment and never
 * printed.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../infra/cloudflare/http-ratelimit.entrypoint.json',
);
const API_HEALTH_URL = 'https://api.pimm.mirai-dx-platform.com/api/v1/health';

const mode = process.argv.includes('--apply')
  ? 'apply'
  : process.argv.includes('--show')
    ? 'show'
    : process.argv.includes('--verify')
      ? 'verify'
      : 'dry-run';

const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));

function validate(cfg) {
  const problems = [];
  if (!/^[0-9a-f]{32}$/.test(cfg.zoneId ?? '')) problems.push('zoneId must be a 32-hex zone id');
  if (!Array.isArray(cfg.rules) || cfg.rules.length === 0) problems.push('rules must be non-empty');
  for (const rule of cfg.rules ?? []) {
    if (rule.action !== 'block') problems.push(`rule action must be block, got ${rule.action}`);
    const rl = rule.ratelimit ?? {};
    // Free-plan constraints: 10s fixed period/mitigation, colo+ip characteristics.
    if (rl.period !== 10) problems.push('period must be 10 (Free plan fixed window)');
    if (rl.mitigation_timeout !== 10) problems.push('mitigation_timeout must be 10 (Free plan)');
    if (!Number.isInteger(rl.requests_per_period) || rl.requests_per_period < 1) {
      problems.push('requests_per_period must be a positive integer');
    }
    const chars = rl.characteristics ?? [];
    if (!chars.includes('cf.colo.id') || !chars.includes('ip.src')) {
      problems.push('characteristics must include cf.colo.id and ip.src');
    }
    if (!rule.expression?.includes('api.pimm.mirai-dx-platform.com')) {
      problems.push('expression must target the production API hostname only');
    }
  }
  return problems;
}

const problems = validate(config);
if (problems.length > 0) {
  console.error('❌ config invalid:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `✅ config valid: ${config.rules.length} rule(s), ` +
    `${config.rules[0].ratelimit.requests_per_period} req / ${config.rules[0].ratelimit.period}s per IP`,
);

if (mode === 'dry-run') {
  console.log(
    'ℹ️ dry-run only. Use --show to read the zone, --apply to deploy, --verify to probe the live limit.',
  );
  process.exit(0);
}

if (mode === 'verify') {
  // 25 rapid hits must trip the 20/10s rule at the edge.
  const statuses = [];
  for (let i = 0; i < 25; i += 1) {
    const res = await fetch(API_HEALTH_URL, { cache: 'no-store' });
    statuses.push(res.status);
  }
  const limited = statuses.filter((s) => s === 429).length;
  console.log(`probe statuses: ${statuses.join(',')}`);
  if (limited > 0) {
    console.log(`✅ edge rate limit active: ${limited}/25 requests answered 429`);
    process.exit(0);
  }
  console.error('❌ no 429 observed — the edge rule is not limiting this client');
  process.exit(1);
}

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error('❌ CLOUDFLARE_API_TOKEN is not set.');
  process.exit(1);
}
const endpoint = `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/rulesets/phases/http_ratelimit/entrypoint`;
const init =
  mode === 'apply'
    ? {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: config.rules }),
      }
    : { headers: { Authorization: `Bearer ${token}` } };

const res = await fetch(endpoint, init);
const body = await res.json();
if (!body.success) {
  console.error(`❌ ${mode} failed (HTTP ${res.status}):`, JSON.stringify(body.errors));
  process.exit(1);
}
console.log(
  `✅ ${mode === 'apply' ? 'applied' : 'current'} http_ratelimit entrypoint: ` +
    JSON.stringify(
      (body.result.rules ?? []).map((r) => ({
        description: r.description,
        expression: r.expression,
        ratelimit: r.ratelimit,
        enabled: r.enabled,
      })),
      null,
      2,
    ),
);
