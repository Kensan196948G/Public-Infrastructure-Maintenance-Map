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
  results.push({ ok: true, name, detail });
  console.log(`PASS ${name}: ${detail}`);
}

function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.error(`FAIL ${name}: ${detail}`);
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
  if (SKIP_WRANGLER) {
    pass('wrangler-auth', 'skipped by --skip-wrangler');
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
      pass(name, `${detail}; allowed by --allow-pending-dns`);
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
    fail(
      'admin-unauthenticated-rejection',
      `${ADMIN_PROBE_URL} returned HTTP ${response.status}; expected 401/403/302/303`,
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

await checkZoneDelegation();
checkWranglerAuth();

const webDnsOk = await checkDns('web-dns', WEB_HOST);
const apiDnsOk = await checkDns('api-dns', API_HOST);

if (apiDnsOk) {
  await checkJson('api-health', `${API_BASE_URL}/health`, (body) =>
    body?.status === 'ok' ? true : `status=${body?.status}`,
  );
  await checkJson('api-summary', `${API_BASE_URL}/assets/summary`, (body) =>
    Array.isArray(body?.counts) ? true : 'counts is not an array',
  );
  await checkAdminUnauthenticatedRejection();
} else {
  console.log('SKIP api probes: API hostname is not resolvable yet.');
}

if (webDnsOk) {
  await checkWeb();
} else {
  console.log('SKIP web probe: Web hostname is not resolvable yet.');
}

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} production smoke check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll applicable production smoke checks passed.');
}
