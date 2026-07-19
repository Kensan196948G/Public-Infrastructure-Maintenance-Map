import postgres from 'postgres';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresAssetRepository } from '../src/postgres.js';
import { registerAssetRepositoryContract } from './repository-contract.js';

const databaseUrl = process.env['PIMM_TEST_DATABASE_URL'];
const runIntegration = process.env['PIMM_RUN_POSTGRES_INTEGRATION'] === '1' && databaseUrl;
const describeIf = runIntegration ? describe : describe.skip;

const ids = {
  source: '10000000-0000-4000-8000-000000000001',
  disabledSource: '10000000-0000-4000-8000-000000000002',
  datasetVersion: '10000000-0000-4000-8000-000000000003',
  publishedBridge: '10000000-0000-4000-8000-000000000101',
  secondBridge: '10000000-0000-4000-8000-000000000102',
  river: '10000000-0000-4000-8000-000000000103',
  facility: '10000000-0000-4000-8000-000000000104',
  hiddenBridge: '10000000-0000-4000-8000-000000000105',
  draftBridge: '10000000-0000-4000-8000-000000000106',
  openIssue: '10000000-0000-4000-8000-000000000201',
} as const;

const sql = databaseUrl ? postgres(databaseUrl, { max: 1, onnotice: () => {} }) : null;

function db() {
  if (!sql) throw new Error('PIMM_TEST_DATABASE_URL is required');
  return sql;
}

async function seedDatabase() {
  if (!sql) throw new Error('PIMM_TEST_DATABASE_URL is required');

  await sql`TRUNCATE quality_issues, ingestion_runs, dataset_versions, asset_attributes,
    infrastructure_assets, data_sources RESTART IDENTITY CASCADE`;

  await sql`
    INSERT INTO data_sources
      (id, slug, name, provider_name, source_url, access_type, format,
       license_name, license_url, redistribution, enabled)
    VALUES
      (${ids.source}, 'contract-source', '契約テストソース', '契約テスト提供者',
       'https://example.com/contract-source', 'file', 'geojson',
       'CC-BY-4.0', NULL, 'allowed', true),
      (${ids.disabledSource}, 'disabled-source', '無効ソース', '契約テスト提供者',
       'https://example.com/disabled-source', 'file', 'geojson',
       'CC-BY-4.0', NULL, 'allowed', false)`;

  await sql`
    INSERT INTO dataset_versions
      (id, source_id, source_updated_at, fetched_at, content_hash,
       schema_fingerprint, record_count, status)
    VALUES
      (${ids.datasetVersion}, ${ids.source}, '2026-06-02T00:00:00.000Z',
       '2026-07-01T00:00:00.000Z',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
       'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
       6, 'published')`;

  const insertAsset = async (asset: {
    id: string;
    sourceRecordId: string;
    type: string;
    name: string;
    lon: number;
    lat: number;
    quality: string;
    publicationStatus: string;
    sourceUpdatedAt: string | null;
  }) =>
    sql`
      INSERT INTO infrastructure_assets
        (id, source_id, source_record_id, asset_type, name, original_name, geometry,
         prefecture_code, municipality_code, managing_authority, source_updated_at,
         quality_status, publication_status)
      VALUES
        (${asset.id}, ${ids.source}, ${asset.sourceRecordId}, ${asset.type}, ${asset.name},
         ${asset.name}, ST_SetSRID(ST_MakePoint(${asset.lon}, ${asset.lat}), 4326),
         '13', '13101', '契約テスト県', ${asset.sourceUpdatedAt},
         ${asset.quality}, ${asset.publicationStatus})`;

  await insertAsset({
    id: ids.publishedBridge,
    sourceRecordId: 'tokyo-bridge-1',
    type: 'bridge',
    name: '都心橋',
    lon: 139.7,
    lat: 35.68,
    quality: 'verified',
    publicationStatus: 'published',
    sourceUpdatedAt: '2026-06-01T00:00:00.000Z',
  });
  await insertAsset({
    id: ids.secondBridge,
    sourceRecordId: 'tokyo-bridge-2',
    type: 'bridge',
    name: '都心第二橋',
    lon: 139.8,
    lat: 35.69,
    quality: 'verified',
    publicationStatus: 'published',
    sourceUpdatedAt: '2026-06-02T00:00:00.000Z',
  });
  await insertAsset({
    id: ids.river,
    sourceRecordId: 'tokyo-river-1',
    type: 'river',
    name: 'B川',
    lon: 139.75,
    lat: 35.67,
    quality: 'review',
    publicationStatus: 'published',
    sourceUpdatedAt: '2020-01-01T00:00:00.000Z',
  });
  await insertAsset({
    id: ids.facility,
    sourceRecordId: 'osaka-facility-1',
    type: 'public_facility',
    name: 'C施設',
    lon: 135.5,
    lat: 34.7,
    quality: 'reference',
    publicationStatus: 'published',
    sourceUpdatedAt: null,
  });
  await insertAsset({
    id: ids.hiddenBridge,
    sourceRecordId: 'hidden-bridge-1',
    type: 'bridge',
    name: '非公開橋',
    lon: 139.71,
    lat: 35.681,
    quality: 'hidden',
    publicationStatus: 'draft',
    sourceUpdatedAt: '2026-06-01T00:00:00.000Z',
  });
  await insertAsset({
    id: ids.draftBridge,
    sourceRecordId: 'draft-bridge-1',
    type: 'bridge',
    name: '下書き橋',
    lon: 139.72,
    lat: 35.682,
    quality: 'verified',
    publicationStatus: 'draft',
    sourceUpdatedAt: '2026-06-01T00:00:00.000Z',
  });

  await sql`
    INSERT INTO asset_attributes
      (asset_id, key, value_text, value_number, unit, original_value, source_label)
    VALUES
      (${ids.publishedBridge}, '橋長', NULL, 42.5, 'm', '42.5m', 'bridge_length')`;

  await sql`
    INSERT INTO quality_issues
      (id, asset_id, rule_code, severity, field_name, observed_value, message, resolution_status)
    VALUES
      (${ids.openIssue}, ${ids.river}, 'Q001', 'warning', 'source_updated_at',
       '2020-01-01T00:00:00.000Z', '古い更新日です', 'open')`;
}

describeIf('PostgresAssetRepository integration', () => {
  beforeAll(async () => {
    if (!sql) throw new Error('PIMM_TEST_DATABASE_URL is required');
    return async () => {
      await sql.end();
    };
  });

  beforeEach(seedDatabase);

  registerAssetRepositoryContract('PostgresAssetRepository', async () => ({
    repo: new PostgresAssetRepository(databaseUrl!, sql as never),
    ids: {
      publishedBridge: ids.publishedBridge,
      hiddenBridge: ids.hiddenBridge,
      draftBridge: ids.draftBridge,
    },
  }));

  it('upserts and partially updates admin sources', async () => {
    const dbSql = db();
    const repo = new PostgresAssetRepository(databaseUrl!, dbSql as never);

    const created = await repo.createSource({
      slug: 'admin-source',
      name: '管理ソース',
      providerName: '管理提供者',
      sourceUrl: 'https://example.com/admin-source',
      accessType: 'api',
      format: 'json',
      licenseName: 'CC-BY-4.0',
      licenseUrl: null,
      redistribution: 'restricted',
      attributionText: 'admin attribution',
      refreshCron: '0 1 * * *',
      enabled: false,
    });

    expect(created).toMatchObject({
      slug: 'admin-source',
      name: '管理ソース',
      enabled: false,
      publishedAssetCount: 0,
    });

    const upserted = await repo.createSource({
      slug: 'admin-source',
      name: '管理ソース更新',
      providerName: '管理提供者2',
      sourceUrl: 'https://example.com/admin-source-v2',
      accessType: 'file',
      format: 'csv',
      licenseName: 'ODC-BY',
      licenseUrl: 'https://example.com/license',
      redistribution: 'allowed',
      attributionText: null,
      refreshCron: '0 2 * * *',
      enabled: true,
    });

    expect(upserted).toMatchObject({
      slug: 'admin-source',
      name: '管理ソース更新',
      providerName: '管理提供者2',
      enabled: true,
    });

    const renamed = await repo.updateSource('admin-source', { name: '名称のみ更新' });
    expect(renamed).toMatchObject({ name: '名称のみ更新' });
    await expect(
      dbSql`SELECT refresh_cron FROM data_sources WHERE slug = 'admin-source'`,
    ).resolves.toMatchObject([{ refresh_cron: '0 2 * * *' }]);

    const cleared = await repo.updateSource('admin-source', { refreshCron: null });
    expect(cleared).toMatchObject({ slug: 'admin-source' });
    await expect(
      dbSql`SELECT refresh_cron FROM data_sources WHERE slug = 'admin-source'`,
    ).resolves.toMatchObject([{ refresh_cron: null }]);

    await expect(repo.updateSource('missing-source', { enabled: false })).resolves.toBeNull();
  });

  it('records and reads admin ingestion details', async () => {
    const repo = new PostgresAssetRepository(databaseUrl!, sql as never);

    const run = await repo.startIngestion('contract-source', 'admin@example.com', 'corr-admin-1');
    expect(run).toMatchObject({
      sourceSlug: 'contract-source',
      status: 'running',
      triggeredBy: 'admin@example.com',
      correlationId: 'corr-admin-1',
    });

    const detail = await repo.getIngestionDetail(run!.id);
    expect(detail?.run).toMatchObject({ id: run!.id, sourceSlug: 'contract-source' });
    expect(detail?.qualityIssues).toEqual([]);
    await expect(repo.listIngestions(10)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: run!.id, sourceSlug: 'contract-source' })],
    });
    await expect(
      repo.startIngestion('missing-source', 'admin@example.com', 'corr-missing'),
    ).resolves.toBeNull();
    await expect(
      repo.getIngestionDetail('00000000-0000-4000-8000-000000000000'),
    ).resolves.toBeNull();
  });

  it('resolves quality issues with appended reason text', async () => {
    const repo = new PostgresAssetRepository(databaseUrl!, sql as never);

    const resolved = await repo.resolveQualityIssue(
      ids.openIssue,
      { resolutionStatus: 'dismissed', reason: '公開対象外として確認済み' },
      'reviewer@example.com',
    );

    expect(resolved).toMatchObject({
      id: ids.openIssue,
      resolutionStatus: 'dismissed',
      assetId: ids.river,
    });
    expect(resolved?.message).toContain('古い更新日です');
    expect(resolved?.message).toContain('Resolution: 公開対象外として確認済み');
    expect(resolved?.resolvedAt).not.toBeNull();
    await expect(repo.listQualityIssues(10)).resolves.toMatchObject({ items: [] });
    await expect(
      repo.resolveQualityIssue(
        '00000000-0000-4000-8000-000000000000',
        { resolutionStatus: 'accepted', reason: 'missing' },
        'reviewer@example.com',
      ),
    ).resolves.toBeNull();
  });

  it('suspends an asset and atomically records Q007 quality issue', async () => {
    const dbSql = db();
    const repo = new PostgresAssetRepository(databaseUrl!, dbSql as never);

    const publication = await repo.suspendAsset(
      ids.publishedBridge,
      { reason: '点検中のため一時停止' },
      'admin@example.com',
    );

    expect(publication).toEqual({
      id: ids.publishedBridge,
      publicationStatus: 'suspended',
      reason: '点検中のため一時停止',
    });
    await expect(
      dbSql`
        SELECT publication_status
          FROM infrastructure_assets
         WHERE id = ${ids.publishedBridge}`,
    ).resolves.toMatchObject([{ publication_status: 'suspended' }]);
    await expect(
      dbSql`
        SELECT rule_code, message, resolution_status
          FROM quality_issues
         WHERE asset_id = ${ids.publishedBridge} AND rule_code = 'Q007'`,
    ).resolves.toMatchObject([
      {
        rule_code: 'Q007',
        message: 'Publication suspended by admin@example.com: 点検中のため一時停止',
        resolution_status: 'open',
      },
    ]);
    await expect(repo.listQualityIssues(10)).resolves.toMatchObject({
      items: [expect.objectContaining({ assetId: ids.publishedBridge, ruleCode: 'Q007' })],
    });
    await expect(
      repo.suspendAsset(
        '00000000-0000-4000-8000-000000000000',
        { reason: 'missing' },
        'admin@example.com',
      ),
    ).resolves.toBeNull();
  });
});
