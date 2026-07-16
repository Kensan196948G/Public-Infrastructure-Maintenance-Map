import { z } from 'zod';

/** GeoJSON position: [lon, lat] or [lon, lat, elevation] (EPSG:4326). */
export const PositionSchema = z.array(z.number()).min(2).max(3);
export type Position = z.infer<typeof PositionSchema>;

export const PointSchema = z.object({
  type: z.literal('Point'),
  coordinates: PositionSchema,
});
export type Point = z.infer<typeof PointSchema>;

export const MultiPointSchema = z.object({
  type: z.literal('MultiPoint'),
  coordinates: z.array(PositionSchema),
});

export const LineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(PositionSchema).min(2),
});

export const MultiLineStringSchema = z.object({
  type: z.literal('MultiLineString'),
  coordinates: z.array(z.array(PositionSchema).min(2)),
});

export const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(PositionSchema).min(4)),
});

export const MultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(PositionSchema).min(4))),
});

/** Supported GeoJSON geometries (GeometryCollection intentionally excluded). */
export const GeometrySchema = z.discriminatedUnion('type', [
  PointSchema,
  MultiPointSchema,
  LineStringSchema,
  MultiLineStringSchema,
  PolygonSchema,
  MultiPolygonSchema,
]);
export type Geometry = z.infer<typeof GeometrySchema>;

/** [minLon, minLat, maxLon, maxLat] in EPSG:4326. */
export type BBox = readonly [number, number, number, number];

/** Validates a bbox tuple: ranges and min < max. */
export const BBoxSchema = z
  .tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ])
  .refine(([minLon, minLat, maxLon, maxLat]) => minLon < maxLon && minLat < maxLat, {
    message: 'bbox must satisfy minLon < maxLon and minLat < maxLat',
  });

/**
 * Parses the `bbox=minLon,minLat,maxLon,maxLat` query string form.
 * Returns a validated numeric tuple.
 */
export const BBoxParamSchema = z
  .string()
  .transform((raw, ctx) => {
    const parts = raw.split(',').map((p) => Number(p.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      ctx.addIssue({ code: 'custom', message: 'bbox must be "minLon,minLat,maxLon,maxLat"' });
      return z.NEVER;
    }
    return parts as [number, number, number, number];
  })
  .pipe(BBoxSchema);
