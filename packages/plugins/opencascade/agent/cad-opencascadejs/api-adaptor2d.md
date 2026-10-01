# libcascade — Adaptor2d

3 top-level symbols. Signatures are verbatim typescript.

Adaptor2d_Curve2d: declare class Adaptor2d_Curve2d extends Standard_Transient

  // Adaptor2d_Curve2d.constructor (constructor)
  constructor();

  // Adaptor2d_Curve2d.get_type_name (method)
  static get_type_name(): string;

  // Adaptor2d_Curve2d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Adaptor2d_Curve2d.DynamicType (method)
  DynamicType(): Standard_Type;

  // Adaptor2d_Curve2d.ShallowCopy (method)
  ShallowCopy(): Adaptor2d_Curve2d;

  // Adaptor2d_Curve2d.FirstParameter (method)
  FirstParameter(): number;

  // Adaptor2d_Curve2d.LastParameter (method)
  LastParameter(): number;

  // Adaptor2d_Curve2d.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Adaptor2d_Curve2d.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Adaptor2d_Curve2d.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Adaptor2d_Curve2d.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor2d_Curve2d;

  // Adaptor2d_Curve2d.IsClosed (method)
  IsClosed(): boolean;

  // Adaptor2d_Curve2d.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Adaptor2d_Curve2d.Period (method)
  Period(): number;

  // Adaptor2d_Curve2d.Value (method)
  Value(U: number): gp_Pnt2d;

  // Adaptor2d_Curve2d.D0 (method)
  D0(U: number, P: gp_Pnt2d): void;

  // Adaptor2d_Curve2d.D1 (method)
  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  // Adaptor2d_Curve2d.D2 (method)
  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // Adaptor2d_Curve2d.D3 (method)
  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // Adaptor2d_Curve2d.DN (method)
  DN(U: number, N: number): gp_Vec2d;

  // Adaptor2d_Curve2d.Resolution (method)
  Resolution(R3d: number): number;

  // Adaptor2d_Curve2d.GetType (method)
  GetType(): GeomAbs_CurveType;

  // Adaptor2d_Curve2d.Line (method)
  Line(): gp_Lin2d;

  // Adaptor2d_Curve2d.Circle (method)
  Circle(): gp_Circ2d;

  // Adaptor2d_Curve2d.Ellipse (method)
  Ellipse(): gp_Elips2d;

  // Adaptor2d_Curve2d.Hyperbola (method)
  Hyperbola(): gp_Hypr2d;

  // Adaptor2d_Curve2d.Parabola (method)
  Parabola(): gp_Parab2d;

  // Adaptor2d_Curve2d.Degree (method)
  Degree(): number;

  // Adaptor2d_Curve2d.IsRational (method)
  IsRational(): boolean;

  // Adaptor2d_Curve2d.NbPoles (method)
  NbPoles(): number;

  // Adaptor2d_Curve2d.NbKnots (method)
  NbKnots(): number;

  // Adaptor2d_Curve2d.NbSamples (method)
  NbSamples(): number;

  // Adaptor2d_Curve2d.Bezier (method)
  Bezier(): Geom2d_BezierCurve;

  // Adaptor2d_Curve2d.BSpline (method)
  BSpline(): Geom2d_BSplineCurve;

  // Adaptor2d_Curve2d.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt2d;

  // Adaptor2d_Curve2d.EvalD1 (method)
  EvalD1(theU: number): Geom2d_Curve_ResD1;

  // Adaptor2d_Curve2d.EvalD2 (method)
  EvalD2(theU: number): Geom2d_Curve_ResD2;

  // Adaptor2d_Curve2d.EvalD3 (method)
  EvalD3(theU: number): Geom2d_Curve_ResD3;

  // Adaptor2d_Curve2d.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec2d;

  // Adaptor2d_Curve2d.delete (method)
  delete(): void;

  // Adaptor2d_Curve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Adaptor2d_Line2d: declare class Adaptor2d_Line2d extends Adaptor2d_Curve2d

  // Adaptor2d_Line2d.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt2d, D: gp_Dir2d, UFirst: number, ULast: number);

  // Adaptor2d_Line2d.get_type_name (method)
  static get_type_name(): string;

  // Adaptor2d_Line2d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Adaptor2d_Line2d.DynamicType (method)
  DynamicType(): Standard_Type;

  // Adaptor2d_Line2d.ShallowCopy (method)
  ShallowCopy(): Adaptor2d_Curve2d;

  // Adaptor2d_Line2d.Load (method)
  Load(L: gp_Lin2d): void;
  Load(L: gp_Lin2d, UFirst: number, ULast: number): void;

  // Adaptor2d_Line2d.FirstParameter (method)
  FirstParameter(): number;

  // Adaptor2d_Line2d.LastParameter (method)
  LastParameter(): number;

  // Adaptor2d_Line2d.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Adaptor2d_Line2d.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Adaptor2d_Line2d.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Adaptor2d_Line2d.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor2d_Curve2d;

  // Adaptor2d_Line2d.IsClosed (method)
  IsClosed(): boolean;

  // Adaptor2d_Line2d.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Adaptor2d_Line2d.Period (method)
  Period(): number;

  // Adaptor2d_Line2d.Value (method)
  Value(U: number): gp_Pnt2d;

  // Adaptor2d_Line2d.D0 (method)
  D0(U: number, P: gp_Pnt2d): void;

  // Adaptor2d_Line2d.D1 (method)
  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  // Adaptor2d_Line2d.D2 (method)
  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // Adaptor2d_Line2d.D3 (method)
  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // Adaptor2d_Line2d.DN (method)
  DN(U: number, N: number): gp_Vec2d;

  // Adaptor2d_Line2d.Resolution (method)
  Resolution(R3d: number): number;

  // Adaptor2d_Line2d.GetType (method)
  GetType(): GeomAbs_CurveType;

  // Adaptor2d_Line2d.Line (method)
  Line(): gp_Lin2d;

  // Adaptor2d_Line2d.Circle (method)
  Circle(): gp_Circ2d;

  // Adaptor2d_Line2d.Ellipse (method)
  Ellipse(): gp_Elips2d;

  // Adaptor2d_Line2d.Hyperbola (method)
  Hyperbola(): gp_Hypr2d;

  // Adaptor2d_Line2d.Parabola (method)
  Parabola(): gp_Parab2d;

  // Adaptor2d_Line2d.Degree (method)
  Degree(): number;

  // Adaptor2d_Line2d.IsRational (method)
  IsRational(): boolean;

  // Adaptor2d_Line2d.NbPoles (method)
  NbPoles(): number;

  // Adaptor2d_Line2d.NbKnots (method)
  NbKnots(): number;

  // Adaptor2d_Line2d.Bezier (method)
  Bezier(): Geom2d_BezierCurve;

  // Adaptor2d_Line2d.BSpline (method)
  BSpline(): Geom2d_BSplineCurve;

  // Adaptor2d_Line2d.delete (method)
  delete(): void;

  // Adaptor2d_Line2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Adaptor2d_OffsetCurve: declare class Adaptor2d_OffsetCurve extends Adaptor2d_Curve2d

  // Adaptor2d_OffsetCurve.constructor (constructor)
  constructor();
  constructor(C: Adaptor2d_Curve2d);
  constructor(C: Adaptor2d_Curve2d, Offset: number);
  constructor(C: Adaptor2d_Curve2d, Offset: number, WFirst: number, WLast: number);

  // Adaptor2d_OffsetCurve.get_type_name (method)
  static get_type_name(): string;

  // Adaptor2d_OffsetCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Adaptor2d_OffsetCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Adaptor2d_OffsetCurve.ShallowCopy (method)
  ShallowCopy(): Adaptor2d_Curve2d;

  // Adaptor2d_OffsetCurve.Load (method)
  Load(S: Adaptor2d_Curve2d): void;
  Load(Offset: number): void;
  Load(Offset: number, WFirst: number, WLast: number): void;

  // Adaptor2d_OffsetCurve.Curve (method)
  Curve(): Adaptor2d_Curve2d;

  // Adaptor2d_OffsetCurve.Offset (method)
  Offset(): number;

  // Adaptor2d_OffsetCurve.FirstParameter (method)
  FirstParameter(): number;

  // Adaptor2d_OffsetCurve.LastParameter (method)
  LastParameter(): number;

  // Adaptor2d_OffsetCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Adaptor2d_OffsetCurve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Adaptor2d_OffsetCurve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Adaptor2d_OffsetCurve.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor2d_Curve2d;

  // Adaptor2d_OffsetCurve.IsClosed (method)
  IsClosed(): boolean;

  // Adaptor2d_OffsetCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Adaptor2d_OffsetCurve.Period (method)
  Period(): number;

  // Adaptor2d_OffsetCurve.Value (method)
  Value(U: number): gp_Pnt2d;

  // Adaptor2d_OffsetCurve.D0 (method)
  D0(U: number, P: gp_Pnt2d): void;

  // Adaptor2d_OffsetCurve.D1 (method)
  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  // Adaptor2d_OffsetCurve.D2 (method)
  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // Adaptor2d_OffsetCurve.D3 (method)
  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // Adaptor2d_OffsetCurve.DN (method)
  DN(U: number, N: number): gp_Vec2d;

  // Adaptor2d_OffsetCurve.Resolution (method)
  Resolution(R3d: number): number;

  // Adaptor2d_OffsetCurve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // Adaptor2d_OffsetCurve.Line (method)
  Line(): gp_Lin2d;

  // Adaptor2d_OffsetCurve.Circle (method)
  Circle(): gp_Circ2d;

  // Adaptor2d_OffsetCurve.Ellipse (method)
  Ellipse(): gp_Elips2d;

  // Adaptor2d_OffsetCurve.Hyperbola (method)
  Hyperbola(): gp_Hypr2d;

  // Adaptor2d_OffsetCurve.Parabola (method)
  Parabola(): gp_Parab2d;

  // Adaptor2d_OffsetCurve.Degree (method)
  Degree(): number;

  // Adaptor2d_OffsetCurve.IsRational (method)
  IsRational(): boolean;

  // Adaptor2d_OffsetCurve.NbPoles (method)
  NbPoles(): number;

  // Adaptor2d_OffsetCurve.NbKnots (method)
  NbKnots(): number;

  // Adaptor2d_OffsetCurve.Bezier (method)
  Bezier(): Geom2d_BezierCurve;

  // Adaptor2d_OffsetCurve.BSpline (method)
  BSpline(): Geom2d_BSplineCurve;

  // Adaptor2d_OffsetCurve.NbSamples (method)
  NbSamples(): number;

  // Adaptor2d_OffsetCurve.delete (method)
  delete(): void;

  // Adaptor2d_OffsetCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
