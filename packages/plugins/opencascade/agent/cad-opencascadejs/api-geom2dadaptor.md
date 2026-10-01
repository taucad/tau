# libcascade — Geom2dAdaptor

5 top-level symbols. Signatures are verbatim typescript.

Geom2dAdaptor: declare class Geom2dAdaptor

  // Geom2dAdaptor.constructor (constructor)
  constructor();

  // Geom2dAdaptor.MakeCurve (method)
  static MakeCurve(HC: Adaptor2d_Curve2d): Geom2d_Curve;

  // Geom2dAdaptor.delete (method)
  delete(): void;

  // Geom2dAdaptor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dAdaptor_Curve: declare class Geom2dAdaptor_Curve extends Adaptor2d_Curve2d

  // Geom2dAdaptor_Curve.constructor (constructor)
  constructor();
  constructor(C: Geom2d_Curve);
  constructor(C: Geom2d_Curve, UFirst: number, ULast: number);

  // Geom2dAdaptor_Curve.get_type_name (method)
  static get_type_name(): string;

  // Geom2dAdaptor_Curve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dAdaptor_Curve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dAdaptor_Curve.ShallowCopy (method)
  ShallowCopy(): Adaptor2d_Curve2d;

  // Geom2dAdaptor_Curve.Reset (method)
  Reset(): void;

  // Geom2dAdaptor_Curve.Load (method)
  Load(theCurve: Geom2d_Curve): void;
  Load(theCurve: Geom2d_Curve, theUFirst: number, theULast: number): void;

  // Geom2dAdaptor_Curve.IsInitialized (method)
  IsInitialized(): boolean;

  // Geom2dAdaptor_Curve.Curve (method)
  Curve(): Geom2d_Curve;

  // Geom2dAdaptor_Curve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2dAdaptor_Curve.LastParameter (method)
  LastParameter(): number;

  // Geom2dAdaptor_Curve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2dAdaptor_Curve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Geom2dAdaptor_Curve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Geom2dAdaptor_Curve.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor2d_Curve2d;

  // Geom2dAdaptor_Curve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2dAdaptor_Curve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2dAdaptor_Curve.Period (method)
  Period(): number;

  // Geom2dAdaptor_Curve.Value (method)
  Value(U: number): gp_Pnt2d;

  // Geom2dAdaptor_Curve.D0 (method)
  D0(U: number, P: gp_Pnt2d): void;

  // Geom2dAdaptor_Curve.D1 (method)
  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  // Geom2dAdaptor_Curve.D2 (method)
  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // Geom2dAdaptor_Curve.D3 (method)
  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // Geom2dAdaptor_Curve.DN (method)
  DN(U: number, N: number): gp_Vec2d;

  // Geom2dAdaptor_Curve.Resolution (method)
  Resolution(R3d: number): number;

  // Geom2dAdaptor_Curve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // Geom2dAdaptor_Curve.Line (method)
  Line(): gp_Lin2d;

  // Geom2dAdaptor_Curve.Circle (method)
  Circle(): gp_Circ2d;

  // Geom2dAdaptor_Curve.Ellipse (method)
  Ellipse(): gp_Elips2d;

  // Geom2dAdaptor_Curve.Hyperbola (method)
  Hyperbola(): gp_Hypr2d;

  // Geom2dAdaptor_Curve.Parabola (method)
  Parabola(): gp_Parab2d;

  // Geom2dAdaptor_Curve.Degree (method)
  Degree(): number;

  // Geom2dAdaptor_Curve.IsRational (method)
  IsRational(): boolean;

  // Geom2dAdaptor_Curve.NbPoles (method)
  NbPoles(): number;

  // Geom2dAdaptor_Curve.NbKnots (method)
  NbKnots(): number;

  // Geom2dAdaptor_Curve.NbSamples (method)
  NbSamples(): number;

  // Geom2dAdaptor_Curve.Bezier (method)
  Bezier(): Geom2d_BezierCurve;

  // Geom2dAdaptor_Curve.BSpline (method)
  BSpline(): Geom2d_BSplineCurve;

  // Geom2dAdaptor_Curve.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt2d;

  // Geom2dAdaptor_Curve.EvalD1 (method)
  EvalD1(theU: number): Geom2d_Curve_ResD1;

  // Geom2dAdaptor_Curve.EvalD2 (method)
  EvalD2(theU: number): Geom2d_Curve_ResD2;

  // Geom2dAdaptor_Curve.EvalD3 (method)
  EvalD3(theU: number): Geom2d_Curve_ResD3;

  // Geom2dAdaptor_Curve.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec2d;

  // Geom2dAdaptor_Curve.delete (method)
  delete(): void;

  // Geom2dAdaptor_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dAdaptor_Curve_OffsetData: interface Geom2dAdaptor_Curve_OffsetData

  BasisAdaptor: Geom2dAdaptor_Curve

  Offset: number

  EvalRep: Geom2dEval_RepCurveDesc_Base

Geom2dAdaptor_Curve_BezierData: interface Geom2dAdaptor_Curve_BezierData

  Curve: Geom2d_BezierCurve

  Cache: BSplCLib_Cache

  EvalRep: Geom2dEval_RepCurveDesc_Base

Geom2dAdaptor_Curve_BSplineData: interface Geom2dAdaptor_Curve_BSplineData

  Curve: Geom2d_BSplineCurve

  Cache: BSplCLib_Cache

  EvalRep: Geom2dEval_RepCurveDesc_Base
