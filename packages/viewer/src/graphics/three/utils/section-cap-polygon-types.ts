/**
 * A point on a section plane as an `[x, y]` pair in the plane's 2D basis.
 *
 * @public
 */
export type CapPoint2 = readonly [number, number];

/**
 * A ring of points bounding a polygon or one of its holes.
 *
 * @public
 */
export type CapRing = CapPoint2[];

/**
 * A polygon as an outer ring followed by any hole rings.
 *
 * @public
 */
export type CapPolygon = CapRing[];

/**
 * A set of polygons that together make one cap region.
 *
 * @public
 */
export type CapMultiPolygon = CapPolygon[];

/**
 * An axis-aligned bounding box in a section plane's 2D basis.
 *
 * @public
 */
export type SectionCapBbox = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

/**
 * A problem found while building section caps, with an optional source key and details.
 *
 * @public
 */
export type SectionCapDiagnostic = Readonly<{
  code: string;
  message: string;
  sourceKey?: string;
  details?: Record<string, number | string | boolean>;
}>;
