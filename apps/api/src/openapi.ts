/**
 * OpenAPI 3.1 document for the public + admin REST API (Issue #49).
 * Paths/security are hand-maintained; component schemas are generated from
 * the Zod contracts (packages/contracts) via Zod v4's native toJSONSchema(),
 * so schema drift between the API and its documentation is a compile/test
 * concern and no schema-generation dependency enters the Worker bundle.
 */
import {
  AdminCreateSourceSchema,
  AdminOperationsSummarySchema,
  AdminUpdateSourceSchema,
  AssetCountSummarySchema,
  AssetDetailSchema,
  AssetSummarySchema,
  GeocodeItemSchema,
  HealthResponseSchema,
  ProblemDetailsSchema,
  SourceInfoSchema,
  SuggestItemSchema,
} from '@pimm/contracts';

/**
 * Component schemas generated from the Zod contracts. Zod v4's native
 * toJSONSchema() emits JSON Schema (draft 2020-12), which OpenAPI 3.1
 * consumes directly.
 */
const generatedSchemas: Record<string, object> = {
  ProblemDetails: ProblemDetailsSchema.toJSONSchema(),
  AssetSummary: AssetSummarySchema.toJSONSchema(),
  AssetDetail: AssetDetailSchema.toJSONSchema(),
  AssetCountSummary: AssetCountSummarySchema.toJSONSchema(),
  SourceInfo: SourceInfoSchema.toJSONSchema(),
  AdminCreateSource: AdminCreateSourceSchema.toJSONSchema(),
  AdminUpdateSource: AdminUpdateSourceSchema.toJSONSchema(),
  AdminOperationsSummary: AdminOperationsSummarySchema.toJSONSchema(),
  SuggestItem: SuggestItemSchema.toJSONSchema(),
  GeocodeItem: GeocodeItemSchema.toJSONSchema(),
  HealthResponse: HealthResponseSchema.toJSONSchema(),
};

export const openapiDocument = {
  openapi: '3.1.0',
  info: {
    title: '公開インフラ維持管理マップ API',
    description:
      '公開インフラ情報の検索・地図表示・エクスポート（ライセンス制御付き）と、Cloudflare Access 配下の管理API。',
    version: '0.1.0',
  },
  servers: [{ url: 'https://api.pimm.mirai-dx-platform.com/api/v1' }],
  paths: {
    '/health': {
      get: {
        summary: 'API liveness / version',
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['ok'] },
                    version: { type: 'string' },
                    time: { type: 'string', format: 'date-time' },
                  },
                  required: ['status', 'version', 'time'],
                },
              },
            },
          },
        },
      },
    },
    '/assets': {
      get: {
        summary: 'Search published assets (bbox / filters / keyset cursor)',
        parameters: [
          { name: 'bbox', in: 'query', schema: { type: 'string', example: '139,35,140,36' } },
          { name: 'types', in: 'query', schema: { type: 'string', example: 'bridge,river' } },
          { name: 'quality', in: 'query', schema: { type: 'string', example: 'verified,review' } },
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 200 } },
          { name: 'prefectureCode', in: 'query', schema: { type: 'string', pattern: '^\\d{2}$' } },
          {
            name: 'municipalityCode',
            in: 'query',
            schema: { type: 'string', pattern: '^\\d{5}$' },
          },
          { name: 'updatedSince', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500 } },
          { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 500 } },
        ],
        responses: {
          '200': {
            description: 'Page of asset summaries + opaque keyset cursor',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/AssetSummary' } },
                    nextCursor: { type: ['string', 'null'] },
                  },
                  required: ['items', 'nextCursor'],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Problem' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/assets/summary': {
      get: {
        summary: 'Count published assets by type and prefecture',
        parameters: [
          { name: 'bbox', in: 'query', schema: { type: 'string' } },
          { name: 'types', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Counts',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssetCountSummary' },
              },
            },
          },
        },
      },
    },
    '/assets/{id}': {
      get: {
        summary: 'Asset detail with attributes and provenance',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssetDetail' },
              },
            },
          },
          '404': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/sources': {
      get: {
        summary: 'Public data-source catalogue',
        responses: {
          '200': {
            description: 'Sources',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/SourceInfo' } },
                  },
                  required: ['items'],
                },
              },
            },
          },
        },
      },
    },
    '/sources/{slug}': {
      get: {
        summary: 'Resolve one source by slug',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Source',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SourceInfo' } },
            },
          },
          '404': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/export': {
      get: {
        summary: 'License-controlled CSV / GeoJSON export',
        parameters: [
          {
            name: 'format',
            in: 'query',
            required: true,
            schema: { type: 'string', enum: ['csv', 'geojson'] },
          },
          { name: 'bbox', in: 'query', schema: { type: 'string' } },
          { name: 'types', in: 'query', schema: { type: 'string' } },
          { name: 'quality', in: 'query', schema: { type: 'string' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'prefectureCode', in: 'query', schema: { type: 'string' } },
          { name: 'municipalityCode', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 2000 } },
        ],
        responses: {
          '200': {
            description:
              'CSV (text/csv) or GeoJSON (application/geo+json) download; X-Excluded-Sources header lists license-excluded sources',
          },
          '403': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/admin/operations': {
      get: {
        summary: 'Per-source ops rollup (admin / reviewer)',
        security: [{ accessJwt: [] }],
        responses: {
          '200': {
            description: 'Operations summary',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminOperationsSummary' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Problem' },
          '403': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/admin/sources': {
      post: {
        summary: 'Register a data source (admin)',
        security: [{ accessJwt: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminCreateSource' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created source',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SourceInfo' } },
            },
          },
          '400': { $ref: '#/components/responses/Problem' },
          '401': { $ref: '#/components/responses/Problem' },
          '403': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/admin/sources/{slug}': {
      patch: {
        summary: 'Update a data source (admin)',
        security: [{ accessJwt: [] }],
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminUpdateSource' },
            },
          },
        },
        responses: {
          '200': { description: 'Updated source' },
          '404': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/admin/sources/{slug}/ingestions': {
      post: {
        summary: 'Record an ingestion run (admin)',
        security: [{ accessJwt: [] }],
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '202': { description: 'Ingestion run recorded' },
          '404': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/admin/ingestions': {
      get: {
        summary: 'List ingestion runs (admin / reviewer)',
        security: [{ accessJwt: [] }],
        responses: {
          '200': { description: 'Runs' },
          '401': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/admin/ingestions/{id}': {
      get: {
        summary: 'Ingestion run detail with quality issues',
        security: [{ accessJwt: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Run detail' },
          '404': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/admin/quality-issues': {
      get: {
        summary: 'List open quality issues (admin / reviewer)',
        security: [{ accessJwt: [] }],
        responses: {
          '200': { description: 'Issues' },
          '401': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/admin/quality-issues/{id}/resolve': {
      post: {
        summary: 'Resolve a quality issue with a reason',
        security: [{ accessJwt: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Resolved issue' },
          '404': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/admin/assets/{id}/suspend': {
      post: {
        summary: 'Suspend one published asset (admin)',
        security: [{ accessJwt: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
                required: ['reason'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Suspended' },
          '404': { $ref: '#/components/responses/Problem' },
        },
      },
    },
    '/admin/sources/{slug}/suspend-assets': {
      post: {
        summary: 'Suspend all published assets of a source (admin)',
        security: [{ accessJwt: [] }],
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Suspension summary' },
          '404': { $ref: '#/components/responses/Problem' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      accessJwt: {
        type: 'http',
        scheme: 'bearer',
        description: 'Cloudflare Access が付与する Cf-Access-Jwt-Assertion（署名検証済み）',
      },
    },
    responses: {
      Problem: {
        description: 'RFC 9457 Problem Details',
        content: {
          'application/problem+json': {
            schema: { $ref: '#/components/schemas/ProblemDetails' },
          },
        },
      },
      RateLimited: {
        description: 'Rate limit exceeded',
        content: {
          'application/problem+json': {
            schema: { $ref: '#/components/schemas/ProblemDetails' },
          },
        },
      },
    },
    schemas: generatedSchemas,
  },
};

export type OpenApiDocument = typeof openapiDocument;
