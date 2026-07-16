import { z } from 'zod';

/** WGS84 (EPSG:4326) longitude bounds. */
export const LongitudeSchema = z.number().min(-180).max(180);
/** WGS84 (EPSG:4326) latitude bounds. */
export const LatitudeSchema = z.number().min(-90).max(90);

/** GeoJSON position: [lon, lat] or [lon, lat, elevation] (EPSG:4326). */
export const PositionSchema = z
  .array(z.number())
  .min(2)
  .max(3)
  .refine((coords) => LongitudeSchema.safeParse(coords[0]).success, {
    message: 'longitude must be within [-180, 180]',
  })
  .refine((coords) => LatitudeSchema.safeParse(coords[1]).success, {
    message: 'latitude must be within [-90, 90]',
  });
export type Position = z.infer<typeof PositionSchema>;

/** [lon, lat] tuple for non-GeoJSON point fields (e.g. list/clustering anchors). */
export const LonLatTupleSchema = z.tuple([LongitudeSchema, LatitudeSchema]);

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

/** Maximum allowed bbox area in square degrees (性能ガード §11). */
export const MAX_BBOX_AREA_DEG2 = 4;

/** Validates a bbox tuple: ranges, min < max, and the area performance guard. */
export const BBoxSchema = z
  .tuple([LongitudeSchema, LatitudeSchema, LongitudeSchema, LatitudeSchema])
  .refine(([minLon, minLat, maxLon, maxLat]) => minLon < maxLon && minLat < maxLat, {
    message: 'bbox must satisfy minLon < maxLon and minLat < maxLat',
  })
  .refine(
    ([minLon, minLat, maxLon, maxLat]) =>
      (maxLon - minLon) * (maxLat - minLat) <= MAX_BBOX_AREA_DEG2,
    { message: `bbox area must not exceed ${MAX_BBOX_AREA_DEG2} deg^2` },
  );

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
