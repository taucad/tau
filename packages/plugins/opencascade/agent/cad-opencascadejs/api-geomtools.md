# libcascade — GeomTools

4 top-level symbols. Signatures are verbatim typescript.

GeomTools: declare class GeomTools

  // GeomTools.constructor (constructor)
  constructor();

  // GeomTools.delete (method)
  delete(): void;

  // GeomTools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomTools_Curve2dSet: declare class GeomTools_Curve2dSet

  // GeomTools_Curve2dSet.constructor (constructor)
  constructor();

  // GeomTools_Curve2dSet.Clear (method)
  Clear(): void;

  // GeomTools_Curve2dSet.Add (method)
  Add(C: Geom2d_Curve): number;

  // GeomTools_Curve2dSet.Curve2d (method)
  Curve2d(I: number): Geom2d_Curve;

  // GeomTools_Curve2dSet.Index (method)
  Index(C: Geom2d_Curve): number;

  // GeomTools_Curve2dSet.delete (method)
  delete(): void;

  // GeomTools_Curve2dSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomTools_CurveSet: declare class GeomTools_CurveSet

  // GeomTools_CurveSet.constructor (constructor)
  constructor();

  // GeomTools_CurveSet.Clear (method)
  Clear(): void;

  // GeomTools_CurveSet.Add (method)
  Add(C: Geom_Curve): number;

  // GeomTools_CurveSet.Curve (method)
  Curve(I: number): Geom_Curve;

  // GeomTools_CurveSet.Index (method)
  Index(C: Geom_Curve): number;

  // GeomTools_CurveSet.delete (method)
  delete(): void;

  // GeomTools_CurveSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomTools_SurfaceSet: declare class GeomTools_SurfaceSet

  // GeomTools_SurfaceSet.constructor (constructor)
  constructor();

  // GeomTools_SurfaceSet.Clear (method)
  Clear(): void;

  // GeomTools_SurfaceSet.Add (method)
  Add(S: Geom_Surface): number;

  // GeomTools_SurfaceSet.Surface (method)
  Surface(I: number): Geom_Surface;

  // GeomTools_SurfaceSet.Index (method)
  Index(S: Geom_Surface): number;

  // GeomTools_SurfaceSet.delete (method)
  delete(): void;

  // GeomTools_SurfaceSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
