import { z } from 'zod';

/**
 * Public feedback intake (Issue #54).
 *
 * General users can submit a report (wrong location, broken source link,
 * quality doubts, other) through the public API. Reports are stored in a
 * dedicated table so an admin can review them and convert them into
 * quality issues or dismiss them. The public endpoint is rate-limited and
 * the payload is length-bounded; no PII is required or expected.
 */

export const FEEDBACK_CATEGORIES = ['location', 'link', 'quality', 'other'] as const;
export const FeedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;

export const FEEDBACK_STATUSES = ['open', 'converted', 'dismissed'] as const;
export const FeedbackStatusSchema = z.enum(FEEDBACK_STATUSES);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

/** Public submission — intentionally small and anonymous. */
export const FeedbackSubmitSchema = z.object({
  category: FeedbackCategorySchema,
  /** Free text; bounded so the public endpoint stays cheap. */
  detail: z.string().trim().min(1).max(1000),
  /** Optional URL of the page the user was looking at. */
  pageUrl: z.string().trim().max(500).optional(),
});
export type FeedbackSubmit = z.infer<typeof FeedbackSubmitSchema>;

export const FeedbackReportSchema = z.object({
  id: z.uuid(),
  category: FeedbackCategorySchema,
  detail: z.string(),
  pageUrl: z.string().nullable(),
  status: FeedbackStatusSchema,
  /** Admin resolution note when the report is converted or dismissed. */
  resolutionNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type FeedbackReport = z.infer<typeof FeedbackReportSchema>;

export const FeedbackSubmitResponseSchema = z.object({
  id: z.uuid(),
  status: z.literal('received'),
  message: z.string(),
});
export type FeedbackSubmitResponse = z.infer<typeof FeedbackSubmitResponseSchema>;

export const AdminFeedbackListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: FeedbackStatusSchema.optional(),
});
export type AdminFeedbackListQuery = z.infer<typeof AdminFeedbackListQuerySchema>;

export const AdminFeedbackListSchema = z.object({
  items: z.array(FeedbackReportSchema),
});
export type AdminFeedbackList = z.infer<typeof AdminFeedbackListSchema>;

export const AdminResolveFeedbackSchema = z.object({
  /** 'converted' | 'dismissed' — 'open' cannot be written back. */
  status: z.enum(['converted', 'dismissed']),
  reason: z.string().trim().min(1).max(500),
});
export type AdminResolveFeedback = z.infer<typeof AdminResolveFeedbackSchema>;
