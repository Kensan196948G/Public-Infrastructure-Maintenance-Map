import postgres from 'postgres';
import { beforeAll, beforeEach, describe } from 'vitest';
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
} as const;

const sql = databaseUrl ? postgres(databaseUrl, { max: 1, onnotice: () => {} }) : null;

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
});
