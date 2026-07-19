import postgres from 'postgres';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresAssetPublisher, PostgresAssetRepository } from '../src/postgres.js';
import type {
  PublishableAsset,
  PublishableSourceDescriptor,
  PublishInput,
} from '../src/publisher.js';

const databaseUrl = process.env['PIMM_TEST_DATABASE_URL'];
const runIntegration = process.env['PIMM_RUN_POSTGRES_PUBLISH_INTEGRATION'] === '1' && databaseUrl;
const describeIf = runIntegration ? describe : describe.skip;

const sql = databaseUrl ? postgres(databaseUrl, { max: 4, onnotice: () => {} }) : null;

const descriptor: PublishableSourceDescriptor = {
  slug: 'publish-e2e-source',
  name: 'Publish E2E Source',
  providerName: 'PIMM Test',
  sourceUrl: 'https://example.com/publish-e2e-source',
  accessType: 'file',
  format: 'geojson',
  licenseName: 'CC-BY-4.0',
  licenseUrl: null,
  redistribution: 'allowed',
  attributionText: null,
};

function asset(
  overrides: Partial<PublishableAsset> & { sourceRecordId: string },
): PublishableAsset {
  return {
    sourceRecordId: overrides.sourceRecordId,
    assetType: overrides.assetType ?? 'bridge',
    name: overrides.name ?? '公開テスト橋',
    originalName: overrides.originalName ?? overrides.name ?? '公開テスト橋',
    geometry: overrides.geometry ?? { type: 'Point', coordinates: [139.767, 35.681] },
    prefectureCode: overrides.prefectureCode ?? '13',
    municipalityCode: overrides.municipalityCode ?? '13101',
    managingAuthority: overrides.managingAuthority ?? 'PIMM Test Authority',
    sourceUpdatedAt: overrides.sourceUpdatedAt ?? '2026-07-01T00:00:00.000Z',
    attributes: overrides.attributes ?? [
      {
        key: '橋長',
        valueText: null,
        valueNumber: 42.5,
        unit: 'm',
        originalValue: '42.5m',
        sourceLabel: 'length',
      },
    ],
    qualityStatus: overrides.qualityStatus ?? 'verified',
    issues: overrides.issues ?? [],
  };
}

async function resetDatabase() {
  if (!sql) throw new Error('PIMM_TEST_DATABASE_URL is required');
  await sql`TRUNCATE quality_issues, ingestion_runs, dataset_versions, asset_attributes,
    infrastructure_assets, data_sources RESTART IDENTITY CASCADE`;
}

describeIf('PostgresAssetPublisher integration', () => {
  beforeAll(async () => {
    if (!sql) throw new Error('PIMM_TEST_DATABASE_URL is required');
    return async () => {
      await sql.end();
    };
  });

  beforeEach(resetDatabase);

  it('publishes pipeline output and makes it readable through the public repository', async () => {
    const publisher = new PostgresAssetPublisher(databaseUrl!, sql as never);
    const repository = new PostgresAssetRepository(databaseUrl!, sql as never);

    const sourceId = await publisher.ensureDataSource(descriptor);
    const summary = await publisher.publish({
      sourceId,
      sourceUpdatedAt: '2026-07-01T00:00:00.000Z',
      contentHash: 'a'.repeat(64),
      schemaFingerprint: 'b'.repeat(64),
      fetchedCount: 2,
      droppedCount: 0,
      warningCount: 1,
      triggeredBy: 'integration-test',
      correlationId: 'publish-e2e-success',
      assets: [
        asset({ sourceRecordId: 'visible-1', name: '公開テスト橋' }),
        asset({
          sourceRecordId: 'hidden-1',
          name: '非公開テスト橋',
          qualityStatus: 'hidden',
        }),
      ],
      aborted: null,
    });

    expect(summary).toMatchObject({
      publishedCount: 1,
      hiddenCount: 1,
      status: 'partial',
    });
    expect(summary.datasetVersionId).not.toBeNull();

    const search = await repository.searchAssets({ q: '公開テスト', limit: 10 });
    expect(search.items.map((item) => item.name)).toEqual(['公開テスト橋']);

    const detail = await repository.getAssetById(search.items[0]!.id);
    expect(detail).toMatchObject({
      name: '公開テスト橋',
      source: { slug: 'publish-e2e-source', licenseName: 'CC-BY-4.0' },
    });
    expect(detail!.attributes).toEqual([
      {
        key: '橋長',
        valueText: null,
        valueNumber: 42.5,
        unit: 'm',
        originalValue: '42.5m',
        sourceLabel: 'length',
      },
    ]);

    const runRows = await sql!`
      SELECT status, fetched_count, accepted_count, rejected_count, warning_count
        FROM ingestion_runs WHERE id = ${summary.ingestionRunId}`;
    expect(runRows).toEqual([
      {
        status: 'partial',
        fetched_count: 2,
        accepted_count: 1,
        rejected_count: 1,
        warning_count: 1,
      },
    ]);
  });

  it('rolls back asset writes when publish fails before ingestion_runs is inserted', async () => {
    const publisher = new PostgresAssetPublisher(databaseUrl!, sql as never);
    const repository = new PostgresAssetRepository(databaseUrl!, sql as never);

    const sourceId = await publisher.ensureDataSource(descriptor);
    const summary = await publisher.publish({
      sourceId,
      sourceUpdatedAt: '2026-07-01T00:00:00.000Z',
      contentHash: 'c'.repeat(64),
      schemaFingerprint: 'd'.repeat(64),
      fetchedCount: 1,
      droppedCount: 0,
      warningCount: 0,
      triggeredBy: 'integration-test',
      correlationId: 'publish-e2e-rollback',
      assets: [
        asset({
          sourceRecordId: 'bad-geometry',
          name: '壊れた橋',
          sourceUpdatedAt: 'not-a-timestamp',
        }),
      ],
      aborted: null,
    });

    expect(summary).toMatchObject({
      datasetVersionId: null,
      publishedCount: 0,
      hiddenCount: 0,
      status: 'failed',
    });

    await expect(repository.searchAssets({ q: '壊れた橋', limit: 10 })).resolves.toMatchObject({
      items: [],
    });

    const failedRuns = await sql!`
      SELECT status, error_code FROM ingestion_runs WHERE id = ${summary.ingestionRunId}`;
    expect(failedRuns).toEqual([{ status: 'failed', error_code: 'PUBLISH_FAILED' }]);
  });

  it('keeps child rows attached to the persisted asset during concurrent publishes', async () => {
    const publisherA = new PostgresAssetPublisher(databaseUrl!, sql as never);
    const publisherB = new PostgresAssetPublisher(databaseUrl!, sql as never);

    const sourceId = await publisherA.ensureDataSource({
      ...descriptor,
      slug: 'publish-race-source',
      name: 'Publish Race Source',
    });

    const publishInput = (label: 'A' | 'B'): PublishInput => ({
      sourceId,
      sourceUpdatedAt: `2026-07-0${label === 'A' ? '1' : '2'}T00:00:00.000Z`,
      contentHash: label.toLowerCase().repeat(64),
      schemaFingerprint: label.toUpperCase().repeat(64),
      fetchedCount: 1,
      droppedCount: 0,
      warningCount: 1,
      triggeredBy: 'integration-test',
      correlationId: `publish-race-${label}`,
      assets: [
        asset({
          sourceRecordId: 'shared-record',
          name: `並行更新橋 ${label}`,
          attributes: [
            {
              key: 'snapshot',
              valueText: label,
              valueNumber: null,
              unit: null,
              originalValue: label,
              sourceLabel: 'race',
            },
          ],
          issues: [
            {
              ruleCode: 'Q005',
              severity: 'warning',
              fieldName: 'source_record_id',
              observedValue: 'shared-record',
              message: `並行publish検証 ${label}`,
              resolutionStatus: 'open',
            },
          ],
        }),
      ],
      aborted: null,
    });

    const summaries = await Promise.all([
      publisherA.publish(publishInput('A')),
      publisherB.publish(publishInput('B')),
    ]);

    expect(summaries).toEqual([
      expect.objectContaining({ publishedCount: 1, hiddenCount: 0, status: 'succeeded' }),
      expect.objectContaining({ publishedCount: 1, hiddenCount: 0, status: 'succeeded' }),
    ]);
    expect(summaries.map((summary) => summary.datasetVersionId)).not.toContain(null);

    const assetRows = await sql!`
      SELECT id, name FROM infrastructure_assets
       WHERE source_id = ${sourceId} AND source_record_id = 'shared-record'`;
    expect(assetRows).toHaveLength(1);
    expect(['並行更新橋 A', '並行更新橋 B']).toContain(assetRows[0]!['name']);

    const attributeRows = await sql!`
      SELECT aa.asset_id, aa.key, aa.value_text
        FROM asset_attributes aa
        JOIN infrastructure_assets a ON a.id = aa.asset_id
       WHERE a.source_id = ${sourceId} AND a.source_record_id = 'shared-record'`;
    expect(attributeRows).toEqual([
      {
        asset_id: assetRows[0]!['id'],
        key: 'snapshot',
        value_text: expect.stringMatching(/^[AB]$/),
      },
    ]);

    const issueRows = await sql!`
      SELECT count(*)::int AS issue_count,
             count(DISTINCT qi.asset_id)::int AS distinct_asset_count,
             bool_and(qi.asset_id = ${assetRows[0]!['id']}) AS all_attached_to_asset
        FROM quality_issues qi
       WHERE qi.run_id = ANY(${summaries.map((summary) => summary.ingestionRunId)})`;
    expect(issueRows).toEqual([
      {
        issue_count: 2,
        distinct_asset_count: 1,
        all_attached_to_asset: true,
      },
    ]);

    const runRows = await sql!`
      SELECT status, accepted_count, rejected_count
        FROM ingestion_runs
       WHERE id = ANY(${summaries.map((summary) => summary.ingestionRunId)})
       ORDER BY correlation_id`;
    expect(runRows).toEqual([
      { status: 'succeeded', accepted_count: 1, rejected_count: 0 },
      { status: 'succeeded', accepted_count: 1, rejected_count: 0 },
    ]);
  });
});
