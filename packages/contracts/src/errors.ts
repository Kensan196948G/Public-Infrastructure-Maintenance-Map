import { z } from 'zod';

/** Application error codes mapped to HTTP statuses (設計書 §12). */
export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  EXPORT_FORBIDDEN: 403,
  RATE_LIMITED: 429,
  SOURCE_UNAVAILABLE: 502,
  INGESTION_SCHEMA_CHANGED: 409,
  INTERNAL_ERROR: 500,
} as const;
export type ErrorCode = keyof typeof ERROR_CODES;

function isKnownErrorCode(code: string): code is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
}

/** RFC 9457 Problem Details payload. Never leaks internals; carries requestId instead. */
export const ProblemDetailsSchema = z
  .object({
    type: z.string().default('about:blank'),
    title: z.string(),
    status: z.number().int(),
    code: z.string(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    requestId: z.string().optional(),
    /** Field-level validation errors. */
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .superRefine((val, ctx) => {
    if (!isKnownErrorCode(val.code)) return;
    const expectedStatus = ERROR_CODES[val.code];
    if (val.status !== expectedStatus) {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: `status ${val.status} does not match the status mapped for code "${val.code}" (expected ${expectedStatus})`,
      });
    }
  });
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export function problem(
  code: ErrorCode,
  title: string,
  options: {
    detail?: string;
    requestId?: string;
    instance?: string;
    errors?: { path: string; message: string }[];
  } = {},
): ProblemDetails {
  const p: ProblemDetails = {
    type: `https://pimm.example/errors/${code.toLowerCase()}`,
    title,
    status: ERROR_CODES[code],
    code,
  };
  if (options.detail !== undefined) p.detail = options.detail;
  if (options.requestId !== undefined) p.requestId = options.requestId;
  if (options.instance !== undefined) p.instance = options.instance;
  if (options.errors !== undefined) p.errors = options.errors;
  return p;
}
