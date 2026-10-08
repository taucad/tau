# libcascade — Contap

17 top-level symbols. Signatures are verbatim typescript.

Contap_ArcFunction: declare class Contap_ArcFunction extends math_FunctionWithDerivative

  // Contap_ArcFunction.constructor (constructor)
  constructor();

  // Contap_ArcFunction.Set (method)
  Set(S: Adaptor3d_Surface): void;
  Set(Direction: gp_Dir): void;
  Set(Eye: gp_Pnt): void;
  Set(A: Adaptor2d_Curve2d): void;
  Set(Direction: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;

  // Contap_ArcFunction.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // Contap_ArcFunction.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // Contap_ArcFunction.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // Contap_ArcFunction.NbSamples (method)
  NbSamples(): number;

  // Contap_ArcFunction.GetStateNumber (method)
  GetStateNumber(): number;

  // Contap_ArcFunction.Valpoint (method)
  Valpoint(Index: number): gp_Pnt;

  // Contap_ArcFunction.Quadric (method)
  Quadric(): IntSurf_Quadric;

  // Contap_ArcFunction.Surface (method)
  Surface(): Adaptor3d_Surface;

  // Contap_ArcFunction.LastComputedPoint (method)
  LastComputedPoint(): gp_Pnt;

  // Contap_ArcFunction.delete (method)
  delete(): void;

  // Contap_ArcFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_ContAna: declare class Contap_ContAna

  // Contap_ContAna.constructor (constructor)
  constructor();

  // Contap_ContAna.Perform (method)
  Perform(S: gp_Sphere, D: gp_Dir): void;
  Perform(S: gp_Sphere, Eye: gp_Pnt): void;
  Perform(C: gp_Cylinder, D: gp_Dir): void;
  Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
  Perform(C: gp_Cone, D: gp_Dir): void;
  Perform(C: gp_Cone, Eye: gp_Pnt): void;
  Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;

  // Contap_ContAna.IsDone (method)
  IsDone(): boolean;

  // Contap_ContAna.NbContours (method)
  NbContours(): number;

  // Contap_ContAna.TypeContour (method)
  TypeContour(): GeomAbs_CurveType;

  // Contap_ContAna.Circle (method)
  Circle(): gp_Circ;

  // Contap_ContAna.Line (method)
  Line(Index: number): gp_Lin;

  // Contap_ContAna.delete (method)
  delete(): void;

  // Contap_ContAna.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_Contour: declare class Contap_Contour

  // Contap_Contour.constructor (constructor)
  constructor();
  constructor(Direction: gp_Vec);
  constructor(Eye: gp_Pnt);
  constructor(Direction: gp_Vec, Angle: number);
  constructor(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec);
  constructor(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Eye: gp_Pnt);
  constructor(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec, Angle: number);

  // Contap_Contour.Perform (method)
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Eye: gp_Pnt): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec, Angle: number): void;

  // Contap_Contour.Init (method)
  Init(Direction: gp_Vec): void;
  Init(Eye: gp_Pnt): void;
  Init(Direction: gp_Vec, Angle: number): void;

  // Contap_Contour.IsDone (method)
  IsDone(): boolean;

  // Contap_Contour.IsEmpty (method)
  IsEmpty(): boolean;

  // Contap_Contour.NbLines (method)
  NbLines(): number;

  // Contap_Contour.Line (method)
  Line(Index: number): Contap_Line;

  // Contap_Contour.SurfaceFunction (method)
  SurfaceFunction(): Contap_SurfFunction;

  // Contap_Contour.delete (method)
  delete(): void;

  // Contap_Contour.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_HContTool: declare class Contap_HContTool

  // Contap_HContTool.constructor (constructor)
  constructor();

  // Contap_HContTool.NbSamplesU (method)
  static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

  // Contap_HContTool.NbSamplesV (method)
  static NbSamplesV(S: Adaptor3d_Surface, v1: number, v2: number): number;

  // Contap_HContTool.NbSamplePoints (method)
  static NbSamplePoints(S: Adaptor3d_Surface): number;

  // Contap_HContTool.SamplePoint (method)
  static SamplePoint(S: Adaptor3d_Surface, Index: number, U?: number, V?: number): { U: number; V: number };

  // Contap_HContTool.HasBeenSeen (method)
  static HasBeenSeen(C: Adaptor2d_Curve2d): boolean;

  // Contap_HContTool.NbSamplesOnArc (method)
  static NbSamplesOnArc(A: Adaptor2d_Curve2d): number;

  // Contap_HContTool.Bounds (method)
  static Bounds(C: Adaptor2d_Curve2d, Ufirst?: number, Ulast?: number): { Ufirst: number; Ulast: number };

  // Contap_HContTool.Project (method)
  static Project(C: Adaptor2d_Curve2d, P: gp_Pnt2d, Paramproj: number, Ptproj: gp_Pnt2d): { returnValue: boolean; Paramproj: number };

  // Contap_HContTool.Tolerance (method)
  static Tolerance(V: Adaptor3d_HVertex, C: Adaptor2d_Curve2d): number;

  // Contap_HContTool.Parameter (method)
  static Parameter(V: Adaptor3d_HVertex, C: Adaptor2d_Curve2d): number;

  // Contap_HContTool.NbPoints (method)
  static NbPoints(C: Adaptor2d_Curve2d): number;

  // Contap_HContTool.Value (method)
  static Value(C: Adaptor2d_Curve2d, Index: number, Pt: gp_Pnt, Tol?: number, U?: number): { Tol: number; U: number };

  // Contap_HContTool.IsVertex (method)
  static IsVertex(C: Adaptor2d_Curve2d, Index: number): boolean;

  // Contap_HContTool.Vertex (method)
  static Vertex(C: Adaptor2d_Curve2d, Index: number): { V: Adaptor3d_HVertex; [Symbol.dispose](): void };

  // Contap_HContTool.NbSegments (method)
  static NbSegments(C: Adaptor2d_Curve2d): number;

  // Contap_HContTool.HasFirstPoint (method)
  static HasFirstPoint(C: Adaptor2d_Curve2d, Index: number, IndFirst?: number): { returnValue: boolean; IndFirst: number };

  // Contap_HContTool.HasLastPoint (method)
  static HasLastPoint(C: Adaptor2d_Curve2d, Index: number, IndLast?: number): { returnValue: boolean; IndLast: number };

  // Contap_HContTool.IsAllSolution (method)
  static IsAllSolution(C: Adaptor2d_Curve2d): boolean;

  // Contap_HContTool.delete (method)
  delete(): void;

  // Contap_HContTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_HCurve2dTool: declare class Contap_HCurve2dTool

  // Contap_HCurve2dTool.constructor (constructor)
  constructor();

  // Contap_HCurve2dTool.FirstParameter (method)
  static FirstParameter(C: Adaptor2d_Curve2d): number;

  // Contap_HCurve2dTool.LastParameter (method)
  static LastParameter(C: Adaptor2d_Curve2d): number;

  // Contap_HCurve2dTool.Continuity (method)
  static Continuity(C: Adaptor2d_Curve2d): GeomAbs_Shape;

  // Contap_HCurve2dTool.NbIntervals (method)
  static NbIntervals(C: Adaptor2d_Curve2d, S: GeomAbs_Shape): number;

  // Contap_HCurve2dTool.Intervals (method)
  static Intervals(C: Adaptor2d_Curve2d, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Contap_HCurve2dTool.IsClosed (method)
  static IsClosed(C: Adaptor2d_Curve2d): boolean;

  // Contap_HCurve2dTool.IsPeriodic (method)
  static IsPeriodic(C: Adaptor2d_Curve2d): boolean;

  // Contap_HCurve2dTool.Period (method)
  static Period(C: Adaptor2d_Curve2d): number;

  // Contap_HCurve2dTool.Value (method)
  static Value(C: Adaptor2d_Curve2d, U: number): gp_Pnt2d;

  // Contap_HCurve2dTool.D0 (method)
  static D0(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d): void;

  // Contap_HCurve2dTool.D1 (method)
  static D1(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  // Contap_HCurve2dTool.D2 (method)
  static D2(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // Contap_HCurve2dTool.D3 (method)
  static D3(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // Contap_HCurve2dTool.DN (method)
  static DN(C: Adaptor2d_Curve2d, U: number, N: number): gp_Vec2d;

  // Contap_HCurve2dTool.Resolution (method)
  static Resolution(C: Adaptor2d_Curve2d, R3d: number): number;

  // Contap_HCurve2dTool.GetType (method)
  static GetType(C: Adaptor2d_Curve2d): GeomAbs_CurveType;

  // Contap_HCurve2dTool.Line (method)
  static Line(C: Adaptor2d_Curve2d): gp_Lin2d;

  // Contap_HCurve2dTool.Circle (method)
  static Circle(C: Adaptor2d_Curve2d): gp_Circ2d;

  // Contap_HCurve2dTool.Ellipse (method)
  static Ellipse(C: Adaptor2d_Curve2d): gp_Elips2d;

  // Contap_HCurve2dTool.Hyperbola (method)
  static Hyperbola(C: Adaptor2d_Curve2d): gp_Hypr2d;

  // Contap_HCurve2dTool.Parabola (method)
  static Parabola(C: Adaptor2d_Curve2d): gp_Parab2d;

  // Contap_HCurve2dTool.Bezier (method)
  static Bezier(C: Adaptor2d_Curve2d): Geom2d_BezierCurve;

  // Contap_HCurve2dTool.BSpline (method)
  static BSpline(C: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

  // Contap_HCurve2dTool.NbSamples (method)
  static NbSamples(C: Adaptor2d_Curve2d, U0: number, U1: number): number;

  // Contap_HCurve2dTool.delete (method)
  delete(): void;

  // Contap_HCurve2dTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_IType: typeof Contap_IType[keyof typeof Contap_IType]

  readonly Contap_Lin: 'Contap_Lin'

  readonly Contap_Circle: 'Contap_Circle'

  readonly Contap_Walking: 'Contap_Walking'

  readonly Contap_Restriction: 'Contap_Restriction'

Contap_Line: declare class Contap_Line

  // Contap_Line.constructor (constructor)
  constructor();

  // Contap_Line.SetLineOn2S (method)
  SetLineOn2S(L: IntSurf_LineOn2S): void;

  // Contap_Line.Clear (method)
  Clear(): void;

  // Contap_Line.LineOn2S (method)
  LineOn2S(): IntSurf_LineOn2S;

  // Contap_Line.ResetSeqOfVertex (method)
  ResetSeqOfVertex(): void;

  // Contap_Line.Add (method)
  Add(P: IntSurf_PntOn2S): void;
  Add(P: Contap_Point): void;

  // Contap_Line.SetValue (method)
  SetValue(L: gp_Lin): void;
  SetValue(C: gp_Circ): void;
  SetValue(A: Adaptor2d_Curve2d): void;

  // Contap_Line.NbVertex (method)
  NbVertex(): number;

  // Contap_Line.Vertex (method)
  Vertex(Index: number): Contap_Point;

  // Contap_Line.TypeContour (method)
  TypeContour(): Contap_IType;

  // Contap_Line.NbPnts (method)
  NbPnts(): number;

  // Contap_Line.Point (method)
  Point(Index: number): IntSurf_PntOn2S;

  // Contap_Line.Line (method)
  Line(): gp_Lin;

  // Contap_Line.Circle (method)
  Circle(): gp_Circ;

  // Contap_Line.Arc (method)
  Arc(): Adaptor2d_Curve2d;

  // Contap_Line.SetTransitionOnS (method)
  SetTransitionOnS(T: IntSurf_TypeTrans): void;

  // Contap_Line.TransitionOnS (method)
  TransitionOnS(): IntSurf_TypeTrans;

  // Contap_Line.delete (method)
  delete(): void;

  // Contap_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_Point: declare class Contap_Point

  // Contap_Point.constructor (constructor)
  constructor();
  constructor(Pt: gp_Pnt, U: number, V: number);

  // Contap_Point.SetValue (method)
  SetValue(Pt: gp_Pnt, U: number, V: number): void;

  // Contap_Point.SetParameter (method)
  SetParameter(Para: number): void;

  // Contap_Point.SetVertex (method)
  SetVertex(V: Adaptor3d_HVertex): void;

  // Contap_Point.SetArc (method)
  SetArc(A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

  // Contap_Point.SetMultiple (method)
  SetMultiple(): void;

  // Contap_Point.SetInternal (method)
  SetInternal(): void;

  // Contap_Point.Value (method)
  Value(): gp_Pnt;

  // Contap_Point.ParameterOnLine (method)
  ParameterOnLine(): number;

  // Contap_Point.Parameters (method)
  Parameters(U1?: number, V1?: number): { U1: number; V1: number };

  // Contap_Point.IsOnArc (method)
  IsOnArc(): boolean;

  // Contap_Point.Arc (method)
  Arc(): Adaptor2d_Curve2d;

  // Contap_Point.ParameterOnArc (method)
  ParameterOnArc(): number;

  // Contap_Point.TransitionOnLine (method)
  TransitionOnLine(): IntSurf_Transition;

  // Contap_Point.TransitionOnArc (method)
  TransitionOnArc(): IntSurf_Transition;

  // Contap_Point.IsVertex (method)
  IsVertex(): boolean;

  // Contap_Point.Vertex (method)
  Vertex(): Adaptor3d_HVertex;

  // Contap_Point.IsMultiple (method)
  IsMultiple(): boolean;

  // Contap_Point.IsInternal (method)
  IsInternal(): boolean;

  // Contap_Point.delete (method)
  delete(): void;

  // Contap_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_SurfFunction: declare class Contap_SurfFunction extends math_FunctionSetWithDerivatives

  // Contap_SurfFunction.constructor (constructor)
  constructor();

  // Contap_SurfFunction.Set (method)
  Set(S: Adaptor3d_Surface): void;
  Set(Eye: gp_Pnt): void;
  Set(Dir: gp_Dir): void;
  Set(Tolerance: number): void;
  Set(Dir: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;

  // Contap_SurfFunction.NbVariables (method)
  NbVariables(): number;

  // Contap_SurfFunction.NbEquations (method)
  NbEquations(): number;

  // Contap_SurfFunction.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Contap_SurfFunction.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Contap_SurfFunction.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Contap_SurfFunction.Root (method)
  Root(): number;

  // Contap_SurfFunction.Tolerance (method)
  Tolerance(): number;

  // Contap_SurfFunction.Point (method)
  Point(): gp_Pnt;

  // Contap_SurfFunction.IsTangent (method)
  IsTangent(): boolean;

  // Contap_SurfFunction.Direction3d (method)
  Direction3d(): gp_Vec;

  // Contap_SurfFunction.Direction2d (method)
  Direction2d(): gp_Dir2d;

  // Contap_SurfFunction.FunctionType (method)
  FunctionType(): Contap_TFunction;

  // Contap_SurfFunction.Eye (method)
  Eye(): gp_Pnt;

  // Contap_SurfFunction.Direction (method)
  Direction(): gp_Dir;

  // Contap_SurfFunction.Angle (method)
  Angle(): number;

  // Contap_SurfFunction.Surface (method)
  Surface(): Adaptor3d_Surface;

  // Contap_SurfFunction.PSurface (method)
  PSurface(): Adaptor3d_Surface;

  // Contap_SurfFunction.delete (method)
  delete(): void;

  // Contap_SurfFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_SurfProps: declare class Contap_SurfProps

  // Contap_SurfProps.constructor (constructor)
  constructor();

  // Contap_SurfProps.Normale (method)
  static Normale(S: Adaptor3d_Surface, U: number, V: number, P: gp_Pnt, N: gp_Vec): void;

  // Contap_SurfProps.DerivAndNorm (method)
  static DerivAndNorm(S: Adaptor3d_Surface, U: number, V: number, P: gp_Pnt, d1u: gp_Vec, d1v: gp_Vec, N: gp_Vec): void;

  // Contap_SurfProps.NormAndDn (method)
  static NormAndDn(S: Adaptor3d_Surface, U: number, V: number, P: gp_Pnt, N: gp_Vec, Dnu: gp_Vec, Dnv: gp_Vec): void;

  // Contap_SurfProps.delete (method)
  delete(): void;

  // Contap_SurfProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_TFunction: typeof Contap_TFunction[keyof typeof Contap_TFunction]

  readonly Contap_ContourStd: 'Contap_ContourStd'

  readonly Contap_ContourPrs: 'Contap_ContourPrs'

  readonly Contap_DraftStd: 'Contap_DraftStd'

  readonly Contap_DraftPrs: 'Contap_DraftPrs'

Contap_TheIWLineOfTheIWalking: declare class Contap_TheIWLineOfTheIWalking extends Standard_Transient

  // Contap_TheIWLineOfTheIWalking.constructor (constructor)
  constructor(theAllocator?: unknown);

  // Contap_TheIWLineOfTheIWalking.Reverse (method)
  Reverse(): void;

  // Contap_TheIWLineOfTheIWalking.Cut (method)
  Cut(Index: number): void;

  // Contap_TheIWLineOfTheIWalking.AddPoint (method)
  AddPoint(P: IntSurf_PntOn2S): void;

  // Contap_TheIWLineOfTheIWalking.AddStatusFirst (method)
  AddStatusFirst(Closed: boolean, HasFirst: boolean): void;
  AddStatusFirst(Closed: boolean, HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

  // Contap_TheIWLineOfTheIWalking.AddStatusFirstLast (method)
  AddStatusFirstLast(Closed: boolean, HasFirst: boolean, HasLast: boolean): void;

  // Contap_TheIWLineOfTheIWalking.AddStatusLast (method)
  AddStatusLast(HasLast: boolean): void;
  AddStatusLast(HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

  // Contap_TheIWLineOfTheIWalking.AddIndexPassing (method)
  AddIndexPassing(Index: number): void;

  // Contap_TheIWLineOfTheIWalking.SetTangentVector (method)
  SetTangentVector(V: gp_Vec, Index: number): void;

  // Contap_TheIWLineOfTheIWalking.SetTangencyAtBegining (method)
  SetTangencyAtBegining(IsTangent: boolean): void;

  // Contap_TheIWLineOfTheIWalking.SetTangencyAtEnd (method)
  SetTangencyAtEnd(IsTangent: boolean): void;

  // Contap_TheIWLineOfTheIWalking.NbPoints (method)
  NbPoints(): number;

  // Contap_TheIWLineOfTheIWalking.Value (method)
  Value(Index: number): IntSurf_PntOn2S;

  // Contap_TheIWLineOfTheIWalking.Line (method)
  Line(): IntSurf_LineOn2S;

  // Contap_TheIWLineOfTheIWalking.IsClosed (method)
  IsClosed(): boolean;

  // Contap_TheIWLineOfTheIWalking.HasFirstPoint (method)
  HasFirstPoint(): boolean;

  // Contap_TheIWLineOfTheIWalking.HasLastPoint (method)
  HasLastPoint(): boolean;

  // Contap_TheIWLineOfTheIWalking.FirstPoint (method)
  FirstPoint(): IntSurf_PathPoint;

  // Contap_TheIWLineOfTheIWalking.FirstPointIndex (method)
  FirstPointIndex(): number;

  // Contap_TheIWLineOfTheIWalking.LastPoint (method)
  LastPoint(): IntSurf_PathPoint;

  // Contap_TheIWLineOfTheIWalking.LastPointIndex (method)
  LastPointIndex(): number;

  // Contap_TheIWLineOfTheIWalking.NbPassingPoint (method)
  NbPassingPoint(): number;

  // Contap_TheIWLineOfTheIWalking.PassingPoint (method)
  PassingPoint(Index: number, IndexLine?: number, IndexPnts?: number): { IndexLine: number; IndexPnts: number };

  // Contap_TheIWLineOfTheIWalking.TangentVector (method)
  TangentVector(Index?: number): { returnValue: gp_Vec; Index: number; [Symbol.dispose](): void };

  // Contap_TheIWLineOfTheIWalking.IsTangentAtBegining (method)
  IsTangentAtBegining(): boolean;

  // Contap_TheIWLineOfTheIWalking.IsTangentAtEnd (method)
  IsTangentAtEnd(): boolean;

  // Contap_TheIWLineOfTheIWalking.get_type_name (method)
  static get_type_name(): string;

  // Contap_TheIWLineOfTheIWalking.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Contap_TheIWLineOfTheIWalking.DynamicType (method)
  DynamicType(): Standard_Type;

  // Contap_TheIWLineOfTheIWalking.delete (method)
  delete(): void;

  // Contap_TheIWLineOfTheIWalking.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_TheIWalking: declare class Contap_TheIWalking

  // Contap_TheIWalking.constructor (constructor)
  constructor(Epsilon: number, Deflection: number, Step: number, theToFillHoles?: boolean);

  // Contap_TheIWalking.SetTolerance (method)
  SetTolerance(Epsilon: number, Deflection: number, Step: number): void;

  // Contap_TheIWalking.Perform (method)
  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Pnts2: NCollection_Sequence_IntSurf_InteriorPoint, Func: Contap_SurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Func: Contap_SurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;

  // Contap_TheIWalking.IsDone (method)
  IsDone(): boolean;

  // Contap_TheIWalking.NbLines (method)
  NbLines(): number;

  // Contap_TheIWalking.Value (method)
  Value(Index: number): Contap_TheIWLineOfTheIWalking;

  // Contap_TheIWalking.NbSinglePnts (method)
  NbSinglePnts(): number;

  // Contap_TheIWalking.SinglePnt (method)
  SinglePnt(Index: number): IntSurf_PathPoint;

  // Contap_TheIWalking.delete (method)
  delete(): void;

  // Contap_TheIWalking.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_ThePathPointOfTheSearch: declare class Contap_ThePathPointOfTheSearch

  // Contap_ThePathPointOfTheSearch.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, Tol: number, A: Adaptor2d_Curve2d, Parameter: number);
  constructor(P: gp_Pnt, Tol: number, V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d, Parameter: number);

  // Contap_ThePathPointOfTheSearch.SetValue (method)
  SetValue(P: gp_Pnt, Tol: number, V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d, Parameter: number): void;
  SetValue(P: gp_Pnt, Tol: number, A: Adaptor2d_Curve2d, Parameter: number): void;

  // Contap_ThePathPointOfTheSearch.Value (method)
  Value(): gp_Pnt;

  // Contap_ThePathPointOfTheSearch.Tolerance (method)
  Tolerance(): number;

  // Contap_ThePathPointOfTheSearch.IsNew (method)
  IsNew(): boolean;

  // Contap_ThePathPointOfTheSearch.Vertex (method)
  Vertex(): Adaptor3d_HVertex;

  // Contap_ThePathPointOfTheSearch.Arc (method)
  Arc(): Adaptor2d_Curve2d;

  // Contap_ThePathPointOfTheSearch.Parameter (method)
  Parameter(): number;

  // Contap_ThePathPointOfTheSearch.delete (method)
  delete(): void;

  // Contap_ThePathPointOfTheSearch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_TheSearch: declare class Contap_TheSearch

  // Contap_TheSearch.constructor (constructor)
  constructor();

  // Contap_TheSearch.Perform (method)
  Perform(F: Contap_ArcFunction, Domain: Adaptor3d_TopolTool, TolBoundary: number, TolTangency: number, RecheckOnRegularity: boolean): void;

  // Contap_TheSearch.IsDone (method)
  IsDone(): boolean;

  // Contap_TheSearch.AllArcSolution (method)
  AllArcSolution(): boolean;

  // Contap_TheSearch.NbPoints (method)
  NbPoints(): number;

  // Contap_TheSearch.Point (method)
  Point(Index: number): Contap_ThePathPointOfTheSearch;

  // Contap_TheSearch.NbSegments (method)
  NbSegments(): number;

  // Contap_TheSearch.Segment (method)
  Segment(Index: number): Contap_TheSegmentOfTheSearch;

  // Contap_TheSearch.delete (method)
  delete(): void;

  // Contap_TheSearch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_TheSearchInside: declare class Contap_TheSearchInside

  // Contap_TheSearchInside.constructor (constructor)
  constructor();
  constructor(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number);

  // Contap_TheSearchInside.Perform (method)
  Perform(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number): void;
  Perform(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, UStart: number, VStart: number): void;

  // Contap_TheSearchInside.IsDone (method)
  IsDone(): boolean;

  // Contap_TheSearchInside.NbPoints (method)
  NbPoints(): number;

  // Contap_TheSearchInside.Value (method)
  Value(Index: number): IntSurf_InteriorPoint;

  // Contap_TheSearchInside.delete (method)
  delete(): void;

  // Contap_TheSearchInside.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Contap_TheSegmentOfTheSearch: declare class Contap_TheSegmentOfTheSearch

  // Contap_TheSegmentOfTheSearch.constructor (constructor)
  constructor();

  // Contap_TheSegmentOfTheSearch.SetValue (method)
  SetValue(A: Adaptor2d_Curve2d): void;

  // Contap_TheSegmentOfTheSearch.SetLimitPoint (method)
  SetLimitPoint(V: Contap_ThePathPointOfTheSearch, First: boolean): void;

  // Contap_TheSegmentOfTheSearch.Curve (method)
  Curve(): Adaptor2d_Curve2d;

  // Contap_TheSegmentOfTheSearch.HasFirstPoint (method)
  HasFirstPoint(): boolean;

  // Contap_TheSegmentOfTheSearch.FirstPoint (method)
  FirstPoint(): Contap_ThePathPointOfTheSearch;

  // Contap_TheSegmentOfTheSearch.HasLastPoint (method)
  HasLastPoint(): boolean;

  // Contap_TheSegmentOfTheSearch.LastPoint (method)
  LastPoint(): Contap_ThePathPointOfTheSearch;

  // Contap_TheSegmentOfTheSearch.delete (method)
  delete(): void;

  // Contap_TheSegmentOfTheSearch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
