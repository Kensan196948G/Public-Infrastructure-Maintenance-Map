/**
 * OpenAPI 3.1 document for the public + admin REST API (Issue #49).
 * Hand-authored against packages/contracts so the endpoint inventory and
 * error shape stay reviewable without pulling a schema-generation dependency
 * into the Worker bundle. Component schemas mirror the Zod contracts.
 */
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
          { name: 'format', in: 'query', required: true, schema: { type: 'string', enum: ['csv', 'geojson'] } },
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
            description: 'CSV (text/csv) or GeoJSON (application/geo+json) download; X-Excluded-Sources header lists license-excluded sources',
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
              'application/json': { schema: { $ref: '#/components/schemas/AdminOperationsSummary' } },
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
    schemas: {
      ProblemDetails: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'integer' },
          code: { type: 'string' },
          detail: { type: 'string' },
          requestId: { type: 'string' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
        required: ['type', 'title', 'status', 'code'],
      },
      AssetSummary: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['bridge', 'road', 'port', 'river', 'public_facility'] },
          name: { type: 'string' },
          representativePoint: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
          },
          prefectureCode: { type: ['string', 'null'] },
          municipalityCode: { type: ['string', 'null'] },
          managingAuthority: { type: ['string', 'null'] },
          quality: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['verified', 'review', 'reference', 'hidden'] },
              updatedAtKnown: { type: 'boolean' },
              openIssueCodes: { type: 'array', items: { type: 'string' } },
            },
            required: ['status', 'updatedAtKnown', 'openIssueCodes'],
          },
          sourceSlug: { type: 'string' },
          sourceUpdatedAt: { type: ['string', 'null'], format: 'date-time' },
        },
        required: ['id', 'type', 'name', 'representativePoint', 'sourceSlug'],
      },
      AssetDetail: {
        allOf: [
          { $ref: '#/components/schemas/AssetSummary' },
          {
            type: 'object',
            properties: {
              originalName: { type: ['string', 'null'] },
              publicationStatus: { type: 'string', enum: ['draft', 'published', 'suspended'] },
              attributes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    valueText: { type: ['string', 'null'] },
                    valueNumber: { type: ['number', 'null'] },
                    unit: { type: ['string', 'null'] },
                  },
                },
              },
              source: {
                type: 'object',
                properties: {
                  slug: { type: 'string' },
                  provider: { type: 'string' },
                  dataset: { type: 'string' },
                  sourceUrl: { type: 'string' },
                  licenseName: { type: 'string' },
                  licenseUrl: { type: ['string', 'null'] },
                  redistribution: {
                    type: 'string',
                    enum: ['allowed', 'restricted', 'prohibited', 'unknown'],
                  },
                },
                required: ['slug', 'provider', 'dataset', 'sourceUrl', 'licenseName', 'redistribution'],
              },
            },
            required: ['publicationStatus', 'attributes', 'source'],
          },
        ],
      },
      AssetCountSummary: {
        type: 'object',
        properties: {
          total: { type: 'integer', minimum: 0 },
          byType: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
          byPrefecture: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
        },
        required: ['total', 'byType', 'byPrefecture'],
      },
      SourceInfo: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
          providerName: { type: 'string' },
          sourceUrl: { type: 'string', format: 'uri' },
          accessType: { type: 'string', enum: ['api', 'file', 'manual'] },
          format: { type: 'string', enum: ['csv', 'geojson', 'json', 'xml'] },
          licenseName: { type: 'string' },
          licenseUrl: { type: ['string', 'null'], format: 'uri' },
          redistribution: {
            type: 'string',
            enum: ['allowed', 'restricted', 'prohibited', 'unknown'],
          },
          attributionText: { type: ['string', 'null'] },
          refreshCron: { type: ['string', 'null'], example: '0 3 * * *' },
          enabled: { type: 'boolean' },
          lastFetchedAt: { type: ['string', 'null'], format: 'date-time' },
          sourceUpdatedAt: { type: ['string', 'null'], format: 'date-time' },
          publishedAssetCount: { type: 'integer', minimum: 0 },
        },
        required: ['slug', 'name', 'providerName', 'sourceUrl', 'enabled'],
      },
      AdminCreateSource: {
        type: 'object',
        properties: {
          slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
          name: { type: 'string' },
          providerName: { type: 'string' },
          sourceUrl: { type: 'string', format: 'uri' },
          accessType: { type: 'string', enum: ['api', 'file', 'manual'] },
          format: { type: 'string', enum: ['csv', 'geojson', 'json', 'xml'] },
          licenseName: { type: 'string' },
          licenseUrl: { type: ['string', 'null'], format: 'uri' },
          redistribution: {
            type: 'string',
            enum: ['allowed', 'restricted', 'prohibited', 'unknown'],
          },
          attributionText: { type: ['string', 'null'] },
          refreshCron: { type: ['string', 'null'] },
          enabled: { type: 'boolean', default: false },
        },
        required: ['slug', 'name', 'providerName', 'sourceUrl', 'accessType', 'format', 'licenseName', 'redistribution'],
      },
      AdminUpdateSource: {
        type: 'object',
        description: 'At least one field is required',
        properties: {
          name: { type: 'string' },
          providerName: { type: 'string' },
          sourceUrl: { type: 'string', format: 'uri' },
          accessType: { type: 'string', enum: ['api', 'file', 'manual'] },
          format: { type: 'string', enum: ['csv', 'geojson', 'json', 'xml'] },
          licenseName: { type: 'string' },
          licenseUrl: { type: ['string', 'null'] },
          redistribution: {
            type: 'string',
            enum: ['allowed', 'restricted', 'prohibited', 'unknown'],
          },
          attributionText: { type: ['string', 'null'] },
          refreshCron: { type: ['string', 'null'] },
          enabled: { type: 'boolean' },
        },
      },
      AdminOperationsSummary: {
        type: 'object',
        properties: {
          generatedAt: { type: 'string', format: 'date-time' },
          recentRunWindow: { type: 'integer' },
          totals: {
            type: 'object',
            properties: {
              sourceCount: { type: 'integer' },
              enabledSourceCount: { type: 'integer' },
              publishedCount: { type: 'integer' },
              suspendedCount: { type: 'integer' },
              hiddenCount: { type: 'integer' },
              openQualityIssueCount: { type: 'integer' },
            },
          },
          sources: { type: 'array', items: { type: 'object' } },
        },
        required: ['generatedAt', 'recentRunWindow', 'totals', 'sources'],
      },
    },
  },
} as const;

export type OpenApiDocument = typeof openapiDocument;
