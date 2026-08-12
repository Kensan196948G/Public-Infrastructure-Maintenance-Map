#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve, resolveNs } from 'node:dns/promises';

const WEB_HOST = 'pimm.mirai-dx-platform.com';
const API_HOST = 'api.pimm.mirai-dx-platform.com';
const WEB_URL = `https://${WEB_HOST}`;
const API_BASE_URL = `https://${API_HOST}/api/v1`;
const ADMIN_PROBE_URL = `${API_BASE_URL}/admin/ingestions?limit=1`;
const ALLOW_PENDING_DNS = process.argv.includes('--allow-pending-dns');
const SKIP_WRANGLER = process.argv.includes('--skip-wrangler');
// Scheduled monitoring (GitHub Actions) has no local wrangler credentials.
// wrangler-auth is intentionally not counted as a check in this mode.
const MONITOR_MODE = process.argv.includes('--monitor');

const results = [];

async function resolveDoh(host, type) {
  const url = new URL('https://cloudflare-dns.com/dns-query');
  url.searchParams.set('name', host);
  url.searchParams.set('type', type);
  const response = await fetch(url, {
    headers: { Accept: 'application/dns-json' },
  });
  if (!response.ok) {
    throw new Error(`DNS-over-HTTPS returned HTTP ${response.status}`);
  }
  const body = await response.json();
  return (body.Answer ?? [])
    .filter((answer) => answer.type === (type === 'NS' ? 2 : type === 'A' ? 1 : 28))
    .map((answer) => String(answer.data).replace(/\.$/, '').toLowerCase());
}

function pass(name, detail) {
  results.push({ status: 'pass', name, detail });
  console.log(`PASS ${name}: ${detail}`);
}

function fail(name, detail) {
  results.push({ status: 'fail', name, detail });
  console.error(`FAIL ${name}: ${detail}`);
}

// A deferred check is NOT a passing check. Reporting it as PASS would let a
// preflight run read as production verification, which is precisely the
// mistake this script exists to prevent.
function skip(name, detail) {
  results.push({ status: 'skip', name, detail });
  console.log(`SKIP ${name}: ${detail}`);
}

async function checkZoneDelegation() {
  try {
    const records = (await resolveNs('mirai-dx-platform.com')).map((record) =>
      record.toLowerCase(),
    );
    const expected = ['kareem.ns.cloudflare.com', 'nia.ns.cloudflare.com'];
    if (expected.every((record) => records.includes(record))) {
      pass('zone-nameservers', records.sort().join(', '));
      return;
    }
    fail('zone-nameservers', `unexpected NS records: ${records.sort().join(', ')}`);
  } catch (error) {
    try {
      const records = await resolveDoh('mirai-dx-platform.com', 'NS');
      const expected = ['kareem.ns.cloudflare.com', 'nia.ns.cloudflare.com'];
      if (expected.every((record) => records.includes(record))) {
        pass('zone-nameservers', `${records.sort().join(', ')} (DNS-over-HTTPS fallback)`);
        return;
      }
      fail('zone-nameservers', `unexpected NS records: ${records.sort().join(', ')}`);
    } catch (fallbackError) {
      fail('zone-nameservers', `${error.message}; fallback failed: ${fallbackError.message}`);
    }
  }
}

function checkWranglerAuth() {
  if (MONITOR_MODE) return;
  if (SKIP_WRANGLER) {
    skip('wrangler-auth', 'not checked (--skip-wrangler)');
    return;
  }

  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['wrangler', 'whoami'],
    {
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status === 0 && !output.includes('not authenticated')) {
    pass('wrangler-auth', 'wrangler reports an authenticated context');
    return;
  }
  fail('wrangler-auth', 'wrangler is not authenticated; run `wrangler login` before deployment');
}

async function checkDns(name, host) {
  try {
    const records = await resolve(host);
    pass(name, `${host} -> ${records.join(', ')}`);
    return true;
  } catch (error) {
    try {
      const records = [...(await resolveDoh(host, 'A')), ...(await resolveDoh(host, 'AAAA'))];
      if (records.length > 0) {
        pass(name, `${host} -> ${records.join(', ')} (DNS-over-HTTPS fallback)`);
        return true;
      }
    } catch {
      // Local DNS failure is reported below; unresolved pending domains are expected before rollout.
    }
    const detail = `${host} unresolved (${error.code ?? error.message})`;
    if (ALLOW_PENDING_DNS) {
      skip(name, `${detail}; tolerated by --allow-pending-dns`);
      return false;
    }
    fail(name, detail);
    return false;
  }
}

async function checkJson(name, url, validate) {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      fail(name, `${url} returned HTTP ${response.status}`);
      return;
    }
    const body = await response.json();
    const validation = validate(body);
    if (validation === true) {
      pass(name, `${url} returned expected JSON`);
    } else {
      fail(name, `${url} returned unexpected JSON: ${validation}`);
    }
  } catch (error) {
    fail(name, `${url} failed: ${error.message}`);
  }
}

async function checkAdminUnauthenticatedRejection() {
  try {
    const response = await fetch(ADMIN_PROBE_URL, {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
    });
    if ([401, 403, 302, 303].includes(response.status)) {
      pass(
        'admin-unauthenticated-rejection',
        `${ADMIN_PROBE_URL} rejected unauthenticated access with HTTP ${response.status}`,
      );
      return;
    }
    // Until the Cloudflare Access application exists (Issue #38 / DL-008), the
    // Worker fails closed: REQUIRE_ACCESS_JWT=true with no AUD/team domain
    // yields a Problem Details 500. That is the designed rejection, not an
    // outage — but only accept it when the body really is a problem response.
    if (response.status === 500) {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('json')) {
        pass(
          'admin-unauthenticated-rejection',
          `${ADMIN_PROBE_URL} failed closed with HTTP 500 problem response (Access not configured yet; DL-008)`,
        );
        return;
      }
    }
    fail(
      'admin-unauthenticated-rejection',
      `${ADMIN_PROBE_URL} returned HTTP ${response.status}; expected 401/403/302/303 or a fail-closed 500 problem response`,
    );
  } catch (error) {
    fail('admin-unauthenticated-rejection', `${ADMIN_PROBE_URL} failed: ${error.message}`);
  }
}

async function checkWeb() {
  try {
    const response = await fetch(WEB_URL, { headers: { Accept: 'text/html' } });
    if (!response.ok) {
      fail('web-ui', `${WEB_URL} returned HTTP ${response.status}`);
      return;
    }
    const html = await response.text();
    if (html.includes('root') || html.includes('公開インフラ維持管理マップ')) {
      pass('web-ui', `${WEB_URL} returned an application shell`);
      return;
    }
    fail('web-ui', `${WEB_URL} did not look like the app shell`);
  } catch (error) {
    fail('web-ui', `${WEB_URL} failed: ${error.message}`);
  }
}

/**
 * 2026-07-30 障害(DL-014)の再発防止: 配信中の JS バンドルへ本番 API base が
 * 焼き込まれており、検証用 .env.local のローカル URL が混入していないことを検証する。
 */
async function checkWebBundleApiBase() {
  const name = 'web-bundle-api-base';
  try {
    const shell = await fetch(WEB_URL);
    const html = await shell.text();
    const asset = (html.match(/assets\/(index-[\w-]+\.js)/) ?? [])[1];
    if (!asset) {
      fail(name, `${WEB_URL} の HTML から asset バンドル名を特定できませんでした`);
      return;
    }
    const bundle = await (await fetch(`${WEB_URL}/assets/${asset}`)).text();
    const contaminated = bundle.match(
      /http:\/\/(?:192\.168\.[\d.:]+|10\.[\d.:]+|172\.(?:1[6-9]|2\d|3[01])\.[\d.:]+|localhost[\d.:]*|127\.[\d.:]+)[^"'\s]*/,
    );
    if (contaminated) {
      fail(name, `${asset} に非本番の API base が混入しています: ${contaminated[0]}`);
      return;
    }
    if (!bundle.includes(API_BASE_URL)) {
      fail(name, `${asset} に本番 API base (${API_BASE_URL}) が焼き込まれていません`);
      return;
    }
    pass(name, `${asset} uses the production API base (no local URL contamination)`);
  } catch (error) {
    fail(name, `bundle verification failed: ${error.message}`);
  }
}

await checkZoneDelegation();
checkWranglerAuth();

const webDnsOk = await checkDns('web-dns', WEB_HOST);
const apiDnsOk = await checkDns('api-dns', API_HOST);

if (apiDnsOk) {
  await checkJson('api-health', `${API_BASE_URL}/health`, (body) =>
    body?.status === 'ok' ? true : `status=${body?.status}`,
  );
  await checkJson('api-readiness', `${API_BASE_URL}/health/ready`, (body) =>
    body?.status === 'ok' && body?.database === 'ok'
      ? true
      : `status=${body?.status} database=${body?.database}`,
  );
  // Shape must match the AssetCountSummary contract: { total, byType }.
  await checkJson('api-summary', `${API_BASE_URL}/assets/summary`, (body) =>
    Number.isFinite(body?.total) && body?.byType && typeof body.byType === 'object'
      ? true
      : `unexpected shape: total=${body?.total} byType=${typeof body?.byType}`,
  );
  await checkAdminUnauthenticatedRejection();
} else {
  skip('api-health', 'API hostname is not resolvable yet');
  skip('api-readiness', 'API hostname is not resolvable yet');
  skip('api-summary', 'API hostname is not resolvable yet');
  skip('admin-unauthenticated-rejection', 'API hostname is not resolvable yet');
}

if (webDnsOk) {
  await checkWeb();
  await checkWebBundleApiBase();
} else {
  skip('web-ui', 'Web hostname is not resolvable yet');
  skip('web-bundle-api-base', 'Web hostname is not resolvable yet');
}

const failed = results.filter((result) => result.status === 'fail');
const skipped = results.filter((result) => result.status === 'skip');
const passed = results.filter((result) => result.status === 'pass');

console.log(`\n${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed.`);

if (failed.length > 0) {
  console.error(`\n${failed.length} production smoke check(s) FAILED.`);
  process.exitCode = 1;
} else if (skipped.length > 0) {
  if (!MONITOR_MODE) {
    // Exit 0 keeps preflight usable as a pre-deployment gate, but the banner must
    // make it impossible to read this run as production verification.
    console.log(
      '\nPREFLIGHT ONLY — production was NOT verified.\n' +
        `Deferred check(s): ${skipped.map((result) => result.name).join(', ')}.\n` +
        'Run `pnpm smoke:cloudflare` (no flags) after deployment and DNS propagation ' +
        'to obtain a production verification result.',
    );
  }
} else {
  console.log('\nAll production smoke checks passed.');
}
