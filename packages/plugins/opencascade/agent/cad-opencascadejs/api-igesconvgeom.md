# libcascade — IGESConvGeom

2 top-level symbols. Signatures are verbatim typescript.

IGESConvGeom: declare class IGESConvGeom

  // IGESConvGeom.constructor (constructor)
  constructor();

  // IGESConvGeom.SplineCurveFromIGES (method)
  static SplineCurveFromIGES(igesent: IGESGeom_SplineCurve, epscoef: number, epsgeom: number): { returnValue: number; result: Geom_BSplineCurve; [Symbol.dispose](): void };

  // IGESConvGeom.IncreaseCurveContinuity (method)
  static IncreaseCurveContinuity(curve: Geom_BSplineCurve, epsgeom: number, continuity: number): number;
  static IncreaseCurveContinuity(curve: Geom2d_BSplineCurve, epsgeom: number, continuity: number): number;

  // IGESConvGeom.SplineSurfaceFromIGES (method)
  static SplineSurfaceFromIGES(igesent: IGESGeom_SplineSurface, epscoef: number, epsgeom: number): { returnValue: number; result: Geom_BSplineSurface; [Symbol.dispose](): void };

  // IGESConvGeom.IncreaseSurfaceContinuity (method)
  static IncreaseSurfaceContinuity(surface: Geom_BSplineSurface, epsgeom: number, continuity?: number): number;

  // IGESConvGeom.delete (method)
  delete(): void;

  // IGESConvGeom.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESConvGeom_GeomBuilder: declare class IGESConvGeom_GeomBuilder

  // IGESConvGeom_GeomBuilder.constructor (constructor)
  constructor();

  // IGESConvGeom_GeomBuilder.Clear (method)
  Clear(): void;

  // IGESConvGeom_GeomBuilder.AddXY (method)
  AddXY(val: gp_XY): void;

  // IGESConvGeom_GeomBuilder.AddXYZ (method)
  AddXYZ(val: gp_XYZ): void;

  // IGESConvGeom_GeomBuilder.AddVec (method)
  AddVec(val: gp_XYZ): void;

  // IGESConvGeom_GeomBuilder.NbPoints (method)
  NbPoints(): number;

  // IGESConvGeom_GeomBuilder.Point (method)
  Point(num: number): gp_XYZ;

  // IGESConvGeom_GeomBuilder.MakeCopiousData (method)
  MakeCopiousData(datatype: number, polyline?: boolean): IGESGeom_CopiousData;

  // IGESConvGeom_GeomBuilder.Position (method)
  Position(): gp_Trsf;

  // IGESConvGeom_GeomBuilder.SetPosition (method)
  SetPosition(pos: gp_Trsf): void;
  SetPosition(pos: gp_Ax3): void;
  SetPosition(pos: gp_Ax2): void;
  SetPosition(pos: gp_Ax1): void;

  // IGESConvGeom_GeomBuilder.IsIdentity (method)
  IsIdentity(): boolean;

  // IGESConvGeom_GeomBuilder.IsTranslation (method)
  IsTranslation(): boolean;

  // IGESConvGeom_GeomBuilder.IsZOnly (method)
  IsZOnly(): boolean;

  // IGESConvGeom_GeomBuilder.EvalXYZ (method)
  EvalXYZ(val: gp_XYZ, X?: number, Y?: number, Z?: number): { X: number; Y: number; Z: number };

  // IGESConvGeom_GeomBuilder.MakeTransformation (method)
  MakeTransformation(unit?: number): IGESGeom_TransformationMatrix;

  // IGESConvGeom_GeomBuilder.delete (method)
  delete(): void;

  // IGESConvGeom_GeomBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
