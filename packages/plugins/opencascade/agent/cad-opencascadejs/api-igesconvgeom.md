# libcascade — IGESConvGeom

2 top-level symbols. Signatures are verbatim typescript.

IGESConvGeom: declare class IGESConvGeom

  constructor

  static SplineCurveFromIGES(igesent: IGESGeom_SplineCurve, epscoef: number, epsgeom: number): { returnValue: number; result: Geom_BSplineCurve; [Symbol.dispose](): void };

  static IncreaseCurveContinuity(curve: Geom_BSplineCurve, epsgeom: number, continuity: number): number;
  static IncreaseCurveContinuity(curve: Geom2d_BSplineCurve, epsgeom: number, continuity: number): number;
  static IncreaseCurveContinuity(curve: Geom_BSplineCurve, epsgeom: number, continuity: number): number;
  static IncreaseCurveContinuity(curve: Geom2d_BSplineCurve, epsgeom: number, continuity: number): number;

  static SplineSurfaceFromIGES(igesent: IGESGeom_SplineSurface, epscoef: number, epsgeom: number): { returnValue: number; result: Geom_BSplineSurface; [Symbol.dispose](): void };

  static IncreaseSurfaceContinuity(surface: Geom_BSplineSurface, epsgeom: number, continuity?: number): number;

  delete(): void;

  [Symbol.dispose](): void;

IGESConvGeom_GeomBuilder: declare class IGESConvGeom_GeomBuilder

  constructor

  Clear(): void;

  AddXY(val: gp_XY): void;

  AddXYZ(val: gp_XYZ): void;

  AddVec(val: gp_XYZ): void;

  NbPoints(): number;

  Point(num: number): gp_XYZ;

  MakeCopiousData(datatype: number, polyline?: boolean): IGESGeom_CopiousData;

  Position(): gp_Trsf;

  SetPosition(pos: gp_Trsf): void;
  SetPosition(pos: gp_Ax3): void;
  SetPosition(pos: gp_Ax2): void;
  SetPosition(pos: gp_Ax1): void;
  SetPosition(pos: gp_Trsf): void;
  SetPosition(pos: gp_Ax3): void;
  SetPosition(pos: gp_Ax2): void;
  SetPosition(pos: gp_Ax1): void;
  SetPosition(pos: gp_Trsf): void;
  SetPosition(pos: gp_Ax3): void;
  SetPosition(pos: gp_Ax2): void;
  SetPosition(pos: gp_Ax1): void;
  SetPosition(pos: gp_Trsf): void;
  SetPosition(pos: gp_Ax3): void;
  SetPosition(pos: gp_Ax2): void;
  SetPosition(pos: gp_Ax1): void;

  IsIdentity(): boolean;

  IsTranslation(): boolean;

  IsZOnly(): boolean;

  EvalXYZ(val: gp_XYZ, X?: number, Y?: number, Z?: number): { X: number; Y: number; Z: number };

  MakeTransformation(unit?: number): IGESGeom_TransformationMatrix;

  delete(): void;

  [Symbol.dispose](): void;
