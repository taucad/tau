# libcascade — Adaptor2d

3 top-level symbols. Signatures are verbatim typescript.

Adaptor2d_Curve2d: declare class Adaptor2d_Curve2d extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor2d_Curve2d;

  FirstParameter(): number;

  LastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  Trim(First: number, Last: number, Tol: number): Adaptor2d_Curve2d;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Period(): number;

  Value(U: number): gp_Pnt2d;

  D0(U: number, P: gp_Pnt2d): void;

  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  DN(U: number, N: number): gp_Vec2d;

  Resolution(R3d: number): number;

  GetType(): GeomAbs_CurveType;

  Line(): gp_Lin2d;

  Circle(): gp_Circ2d;

  Ellipse(): gp_Elips2d;

  Hyperbola(): gp_Hypr2d;

  Parabola(): gp_Parab2d;

  Degree(): number;

  IsRational(): boolean;

  NbPoles(): number;

  NbKnots(): number;

  NbSamples(): number;

  Bezier(): Geom2d_BezierCurve;

  BSpline(): Geom2d_BSplineCurve;

  EvalD0(theU: number): gp_Pnt2d;

  EvalD1(theU: number): Geom2d_Curve_ResD1;

  EvalD2(theU: number): Geom2d_Curve_ResD2;

  EvalD3(theU: number): Geom2d_Curve_ResD3;

  EvalDN(theU: number, theN: number): gp_Vec2d;

  delete(): void;

  [Symbol.dispose](): void;

Adaptor2d_Line2d: declare class Adaptor2d_Line2d extends Adaptor2d_Curve2d

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor2d_Curve2d;

  Load(L: gp_Lin2d): void;
  Load(L: gp_Lin2d, UFirst: number, ULast: number): void;
  Load(L: gp_Lin2d): void;
  Load(L: gp_Lin2d, UFirst: number, ULast: number): void;

  FirstParameter(): number;

  LastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  Trim(First: number, Last: number, Tol: number): Adaptor2d_Curve2d;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Period(): number;

  Value(U: number): gp_Pnt2d;

  D0(U: number, P: gp_Pnt2d): void;

  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  DN(U: number, N: number): gp_Vec2d;

  Resolution(R3d: number): number;

  GetType(): GeomAbs_CurveType;

  Line(): gp_Lin2d;

  Circle(): gp_Circ2d;

  Ellipse(): gp_Elips2d;

  Hyperbola(): gp_Hypr2d;

  Parabola(): gp_Parab2d;

  Degree(): number;

  IsRational(): boolean;

  NbPoles(): number;

  NbKnots(): number;

  Bezier(): Geom2d_BezierCurve;

  BSpline(): Geom2d_BSplineCurve;

  delete(): void;

  [Symbol.dispose](): void;

Adaptor2d_OffsetCurve: declare class Adaptor2d_OffsetCurve extends Adaptor2d_Curve2d

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor2d_Curve2d;

  Load(S: Adaptor2d_Curve2d): void;
  Load(Offset: number): void;
  Load(Offset: number, WFirst: number, WLast: number): void;
  Load(S: Adaptor2d_Curve2d): void;
  Load(Offset: number): void;
  Load(Offset: number, WFirst: number, WLast: number): void;
  Load(S: Adaptor2d_Curve2d): void;
  Load(Offset: number): void;
  Load(Offset: number, WFirst: number, WLast: number): void;

  Curve(): Adaptor2d_Curve2d;

  Offset(): number;

  FirstParameter(): number;

  LastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  Trim(First: number, Last: number, Tol: number): Adaptor2d_Curve2d;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Period(): number;

  Value(U: number): gp_Pnt2d;

  D0(U: number, P: gp_Pnt2d): void;

  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  DN(U: number, N: number): gp_Vec2d;

  Resolution(R3d: number): number;

  GetType(): GeomAbs_CurveType;

  Line(): gp_Lin2d;

  Circle(): gp_Circ2d;

  Ellipse(): gp_Elips2d;

  Hyperbola(): gp_Hypr2d;

  Parabola(): gp_Parab2d;

  Degree(): number;

  IsRational(): boolean;

  NbPoles(): number;

  NbKnots(): number;

  Bezier(): Geom2d_BezierCurve;

  BSpline(): Geom2d_BSplineCurve;

  NbSamples(): number;

  delete(): void;

  [Symbol.dispose](): void;
