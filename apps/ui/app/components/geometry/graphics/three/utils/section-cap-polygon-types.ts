export type CapPoint2 = readonly [number, number];

export type CapRing = CapPoint2[];

export type CapPolygon = CapRing[];

export type CapMultiPolygon = CapPolygon[];

export type SectionCapBbox = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

export type SectionCapDiagnostic = Readonly<{
  code: string;
  message: string;
  sourceKey?: string;
  details?: Record<string, number | string | boolean>;
}>;
