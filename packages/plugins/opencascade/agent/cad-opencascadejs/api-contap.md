# libcascade — Contap

17 top-level symbols. Signatures are verbatim typescript.

Contap_ArcFunction: declare class Contap_ArcFunction extends math_FunctionWithDerivative

  constructor

  Set(S: Adaptor3d_Surface): void;
  Set(Direction: gp_Dir): void;
  Set(Eye: gp_Pnt): void;
  Set(A: Adaptor2d_Curve2d): void;
  Set(Direction: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;
  Set(S: Adaptor3d_Surface): void;
  Set(Direction: gp_Dir): void;
  Set(Eye: gp_Pnt): void;
  Set(A: Adaptor2d_Curve2d): void;
  Set(Direction: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;
  Set(S: Adaptor3d_Surface): void;
  Set(Direction: gp_Dir): void;
  Set(Eye: gp_Pnt): void;
  Set(A: Adaptor2d_Curve2d): void;
  Set(Direction: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;
  Set(S: Adaptor3d_Surface): void;
  Set(Direction: gp_Dir): void;
  Set(Eye: gp_Pnt): void;
  Set(A: Adaptor2d_Curve2d): void;
  Set(Direction: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;
  Set(S: Adaptor3d_Surface): void;
  Set(Direction: gp_Dir): void;
  Set(Eye: gp_Pnt): void;
  Set(A: Adaptor2d_Curve2d): void;
  Set(Direction: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;
  Set(S: Adaptor3d_Surface): void;
  Set(Direction: gp_Dir): void;
  Set(Eye: gp_Pnt): void;
  Set(A: Adaptor2d_Curve2d): void;
  Set(Direction: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  NbSamples(): number;

  GetStateNumber(): number;

  Valpoint(Index: number): gp_Pnt;

  Quadric(): IntSurf_Quadric;

  Surface(): Adaptor3d_Surface;

  LastComputedPoint(): gp_Pnt;

  delete(): void;

  [Symbol.dispose](): void;

Contap_ContAna: declare class Contap_ContAna

  constructor

  Perform(S: gp_Sphere, D: gp_Dir): void;
  Perform(S: gp_Sphere, Eye: gp_Pnt): void;
  Perform(C: gp_Cylinder, D: gp_Dir): void;
  Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
  Perform(C: gp_Cone, D: gp_Dir): void;
  Perform(C: gp_Cone, Eye: gp_Pnt): void;
  Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
  Perform(S: gp_Sphere, D: gp_Dir): void;
  Perform(S: gp_Sphere, Eye: gp_Pnt): void;
  Perform(C: gp_Cylinder, D: gp_Dir): void;
  Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
  Perform(C: gp_Cone, D: gp_Dir): void;
  Perform(C: gp_Cone, Eye: gp_Pnt): void;
  Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
  Perform(S: gp_Sphere, D: gp_Dir): void;
  Perform(S: gp_Sphere, Eye: gp_Pnt): void;
  Perform(C: gp_Cylinder, D: gp_Dir): void;
  Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
  Perform(C: gp_Cone, D: gp_Dir): void;
  Perform(C: gp_Cone, Eye: gp_Pnt): void;
  Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
  Perform(S: gp_Sphere, D: gp_Dir): void;
  Perform(S: gp_Sphere, Eye: gp_Pnt): void;
  Perform(C: gp_Cylinder, D: gp_Dir): void;
  Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
  Perform(C: gp_Cone, D: gp_Dir): void;
  Perform(C: gp_Cone, Eye: gp_Pnt): void;
  Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
  Perform(S: gp_Sphere, D: gp_Dir): void;
  Perform(S: gp_Sphere, Eye: gp_Pnt): void;
  Perform(C: gp_Cylinder, D: gp_Dir): void;
  Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
  Perform(C: gp_Cone, D: gp_Dir): void;
  Perform(C: gp_Cone, Eye: gp_Pnt): void;
  Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
  Perform(S: gp_Sphere, D: gp_Dir): void;
  Perform(S: gp_Sphere, Eye: gp_Pnt): void;
  Perform(C: gp_Cylinder, D: gp_Dir): void;
  Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
  Perform(C: gp_Cone, D: gp_Dir): void;
  Perform(C: gp_Cone, Eye: gp_Pnt): void;
  Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
  Perform(S: gp_Sphere, D: gp_Dir): void;
  Perform(S: gp_Sphere, Eye: gp_Pnt): void;
  Perform(C: gp_Cylinder, D: gp_Dir): void;
  Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
  Perform(C: gp_Cone, D: gp_Dir): void;
  Perform(C: gp_Cone, Eye: gp_Pnt): void;
  Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
  Perform(S: gp_Sphere, D: gp_Dir): void;
  Perform(S: gp_Sphere, Eye: gp_Pnt): void;
  Perform(C: gp_Cylinder, D: gp_Dir): void;
  Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
  Perform(C: gp_Cone, D: gp_Dir): void;
  Perform(C: gp_Cone, Eye: gp_Pnt): void;
  Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
  Perform(S: gp_Sphere, D: gp_Dir): void;
  Perform(S: gp_Sphere, Eye: gp_Pnt): void;
  Perform(C: gp_Cylinder, D: gp_Dir): void;
  Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
  Perform(C: gp_Cone, D: gp_Dir): void;
  Perform(C: gp_Cone, Eye: gp_Pnt): void;
  Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
  Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;

  IsDone(): boolean;

  NbContours(): number;

  TypeContour(): GeomAbs_CurveType;

  Circle(): gp_Circ;

  Line(Index: number): gp_Lin;

  delete(): void;

  [Symbol.dispose](): void;

Contap_Contour: declare class Contap_Contour

  constructor

  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Eye: gp_Pnt): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec, Angle: number): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Eye: gp_Pnt): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec, Angle: number): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Eye: gp_Pnt): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec, Angle: number): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Eye: gp_Pnt): void;
  Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec, Angle: number): void;

  Init(Direction: gp_Vec): void;
  Init(Eye: gp_Pnt): void;
  Init(Direction: gp_Vec, Angle: number): void;
  Init(Direction: gp_Vec): void;
  Init(Eye: gp_Pnt): void;
  Init(Direction: gp_Vec, Angle: number): void;
  Init(Direction: gp_Vec): void;
  Init(Eye: gp_Pnt): void;
  Init(Direction: gp_Vec, Angle: number): void;

  IsDone(): boolean;

  IsEmpty(): boolean;

  NbLines(): number;

  Line(Index: number): Contap_Line;

  SurfaceFunction(): Contap_SurfFunction;

  delete(): void;

  [Symbol.dispose](): void;

Contap_HContTool: declare class Contap_HContTool

  constructor

  static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

  static NbSamplesV(S: Adaptor3d_Surface, v1: number, v2: number): number;

  static NbSamplePoints(S: Adaptor3d_Surface): number;

  static SamplePoint(S: Adaptor3d_Surface, Index: number, U?: number, V?: number): { U: number; V: number };

  static HasBeenSeen(C: Adaptor2d_Curve2d): boolean;

  static NbSamplesOnArc(A: Adaptor2d_Curve2d): number;

  static Bounds(C: Adaptor2d_Curve2d, Ufirst?: number, Ulast?: number): { Ufirst: number; Ulast: number };

  static Project(C: Adaptor2d_Curve2d, P: gp_Pnt2d, Paramproj: number, Ptproj: gp_Pnt2d): { returnValue: boolean; Paramproj: number };

  static Tolerance(V: Adaptor3d_HVertex, C: Adaptor2d_Curve2d): number;

  static Parameter(V: Adaptor3d_HVertex, C: Adaptor2d_Curve2d): number;

  static NbPoints(C: Adaptor2d_Curve2d): number;

  static Value(C: Adaptor2d_Curve2d, Index: number, Pt: gp_Pnt, Tol?: number, U?: number): { Tol: number; U: number };

  static IsVertex(C: Adaptor2d_Curve2d, Index: number): boolean;

  static Vertex(C: Adaptor2d_Curve2d, Index: number): { V: Adaptor3d_HVertex; [Symbol.dispose](): void };

  static NbSegments(C: Adaptor2d_Curve2d): number;

  static HasFirstPoint(C: Adaptor2d_Curve2d, Index: number, IndFirst?: number): { returnValue: boolean; IndFirst: number };

  static HasLastPoint(C: Adaptor2d_Curve2d, Index: number, IndLast?: number): { returnValue: boolean; IndLast: number };

  static IsAllSolution(C: Adaptor2d_Curve2d): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Contap_HCurve2dTool: declare class Contap_HCurve2dTool

  constructor

  static FirstParameter(C: Adaptor2d_Curve2d): number;

  static LastParameter(C: Adaptor2d_Curve2d): number;

  static Continuity(C: Adaptor2d_Curve2d): GeomAbs_Shape;

  static NbIntervals(C: Adaptor2d_Curve2d, S: GeomAbs_Shape): number;

  static Intervals(C: Adaptor2d_Curve2d, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  static IsClosed(C: Adaptor2d_Curve2d): boolean;

  static IsPeriodic(C: Adaptor2d_Curve2d): boolean;

  static Period(C: Adaptor2d_Curve2d): number;

  static Value(C: Adaptor2d_Curve2d, U: number): gp_Pnt2d;

  static D0(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d): void;

  static D1(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  static D2(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  static D3(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  static DN(C: Adaptor2d_Curve2d, U: number, N: number): gp_Vec2d;

  static Resolution(C: Adaptor2d_Curve2d, R3d: number): number;

  static GetType(C: Adaptor2d_Curve2d): GeomAbs_CurveType;

  static Line(C: Adaptor2d_Curve2d): gp_Lin2d;

  static Circle(C: Adaptor2d_Curve2d): gp_Circ2d;

  static Ellipse(C: Adaptor2d_Curve2d): gp_Elips2d;

  static Hyperbola(C: Adaptor2d_Curve2d): gp_Hypr2d;

  static Parabola(C: Adaptor2d_Curve2d): gp_Parab2d;

  static Bezier(C: Adaptor2d_Curve2d): Geom2d_BezierCurve;

  static BSpline(C: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

  static NbSamples(C: Adaptor2d_Curve2d, U0: number, U1: number): number;

  delete(): void;

  [Symbol.dispose](): void;

Contap_IType: typeof Contap_IType[keyof typeof Contap_IType]

Contap_Line: declare class Contap_Line

  constructor

  SetLineOn2S(L: IntSurf_LineOn2S): void;

  Clear(): void;

  LineOn2S(): IntSurf_LineOn2S;

  ResetSeqOfVertex(): void;

  Add(P: IntSurf_PntOn2S): void;
  Add(P: Contap_Point): void;
  Add(P: IntSurf_PntOn2S): void;
  Add(P: Contap_Point): void;

  SetValue(L: gp_Lin): void;
  SetValue(C: gp_Circ): void;
  SetValue(A: Adaptor2d_Curve2d): void;
  SetValue(L: gp_Lin): void;
  SetValue(C: gp_Circ): void;
  SetValue(A: Adaptor2d_Curve2d): void;
  SetValue(L: gp_Lin): void;
  SetValue(C: gp_Circ): void;
  SetValue(A: Adaptor2d_Curve2d): void;

  NbVertex(): number;

  Vertex(Index: number): Contap_Point;

  TypeContour(): Contap_IType;

  NbPnts(): number;

  Point(Index: number): IntSurf_PntOn2S;

  Line(): gp_Lin;

  Circle(): gp_Circ;

  Arc(): Adaptor2d_Curve2d;

  SetTransitionOnS(T: IntSurf_TypeTrans): void;

  TransitionOnS(): IntSurf_TypeTrans;

  delete(): void;

  [Symbol.dispose](): void;

Contap_Point: declare class Contap_Point

  constructor

  SetValue(Pt: gp_Pnt, U: number, V: number): void;

  SetParameter(Para: number): void;

  SetVertex(V: Adaptor3d_HVertex): void;

  SetArc(A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

  SetMultiple(): void;

  SetInternal(): void;

  Value(): gp_Pnt;

  ParameterOnLine(): number;

  Parameters(U1?: number, V1?: number): { U1: number; V1: number };

  IsOnArc(): boolean;

  Arc(): Adaptor2d_Curve2d;

  ParameterOnArc(): number;

  TransitionOnLine(): IntSurf_Transition;

  TransitionOnArc(): IntSurf_Transition;

  IsVertex(): boolean;

  Vertex(): Adaptor3d_HVertex;

  IsMultiple(): boolean;

  IsInternal(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Contap_SurfFunction: declare class Contap_SurfFunction extends math_FunctionSetWithDerivatives

  constructor

  Set(S: Adaptor3d_Surface): void;
  Set(Eye: gp_Pnt): void;
  Set(Dir: gp_Dir): void;
  Set(Tolerance: number): void;
  Set(Dir: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;
  Set(S: Adaptor3d_Surface): void;
  Set(Eye: gp_Pnt): void;
  Set(Dir: gp_Dir): void;
  Set(Tolerance: number): void;
  Set(Dir: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;
  Set(S: Adaptor3d_Surface): void;
  Set(Eye: gp_Pnt): void;
  Set(Dir: gp_Dir): void;
  Set(Tolerance: number): void;
  Set(Dir: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;
  Set(S: Adaptor3d_Surface): void;
  Set(Eye: gp_Pnt): void;
  Set(Dir: gp_Dir): void;
  Set(Tolerance: number): void;
  Set(Dir: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;
  Set(S: Adaptor3d_Surface): void;
  Set(Eye: gp_Pnt): void;
  Set(Dir: gp_Dir): void;
  Set(Tolerance: number): void;
  Set(Dir: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;
  Set(S: Adaptor3d_Surface): void;
  Set(Eye: gp_Pnt): void;
  Set(Dir: gp_Dir): void;
  Set(Tolerance: number): void;
  Set(Dir: gp_Dir, Angle: number): void;
  Set(Eye: gp_Pnt, Angle: number): void;

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Root(): number;

  Tolerance(): number;

  Point(): gp_Pnt;

  IsTangent(): boolean;

  Direction3d(): gp_Vec;

  Direction2d(): gp_Dir2d;

  FunctionType(): Contap_TFunction;

  Eye(): gp_Pnt;

  Direction(): gp_Dir;

  Angle(): number;

  Surface(): Adaptor3d_Surface;

  PSurface(): Adaptor3d_Surface;

  delete(): void;

  [Symbol.dispose](): void;

Contap_SurfProps: declare class Contap_SurfProps

  constructor

  static Normale(S: Adaptor3d_Surface, U: number, V: number, P: gp_Pnt, N: gp_Vec): void;

  static DerivAndNorm(S: Adaptor3d_Surface, U: number, V: number, P: gp_Pnt, d1u: gp_Vec, d1v: gp_Vec, N: gp_Vec): void;

  static NormAndDn(S: Adaptor3d_Surface, U: number, V: number, P: gp_Pnt, N: gp_Vec, Dnu: gp_Vec, Dnv: gp_Vec): void;

  delete(): void;

  [Symbol.dispose](): void;

Contap_TFunction: typeof Contap_TFunction[keyof typeof Contap_TFunction]

Contap_TheIWLineOfTheIWalking: declare class Contap_TheIWLineOfTheIWalking extends Standard_Transient

  constructor

  Reverse(): void;

  Cut(Index: number): void;

  AddPoint(P: IntSurf_PntOn2S): void;

  AddStatusFirst(Closed: boolean, HasFirst: boolean): void;
  AddStatusFirst(Closed: boolean, HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;
  AddStatusFirst(Closed: boolean, HasFirst: boolean): void;
  AddStatusFirst(Closed: boolean, HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

  AddStatusFirstLast(Closed: boolean, HasFirst: boolean, HasLast: boolean): void;

  AddStatusLast(HasLast: boolean): void;
  AddStatusLast(HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;
  AddStatusLast(HasLast: boolean): void;
  AddStatusLast(HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

  AddIndexPassing(Index: number): void;

  SetTangentVector(V: gp_Vec, Index: number): void;

  SetTangencyAtBegining(IsTangent: boolean): void;

  SetTangencyAtEnd(IsTangent: boolean): void;

  NbPoints(): number;

  Value(Index: number): IntSurf_PntOn2S;

  Line(): IntSurf_LineOn2S;

  IsClosed(): boolean;

  HasFirstPoint(): boolean;

  HasLastPoint(): boolean;

  FirstPoint(): IntSurf_PathPoint;

  FirstPointIndex(): number;

  LastPoint(): IntSurf_PathPoint;

  LastPointIndex(): number;

  NbPassingPoint(): number;

  PassingPoint(Index: number, IndexLine?: number, IndexPnts?: number): { IndexLine: number; IndexPnts: number };

  TangentVector(Index?: number): { returnValue: gp_Vec; Index: number; [Symbol.dispose](): void };

  IsTangentAtBegining(): boolean;

  IsTangentAtEnd(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Contap_TheIWalking: declare class Contap_TheIWalking

  constructor

  SetTolerance(Epsilon: number, Deflection: number, Step: number): void;

  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Pnts2: NCollection_Sequence_IntSurf_InteriorPoint, Func: Contap_SurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Func: Contap_SurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Pnts2: NCollection_Sequence_IntSurf_InteriorPoint, Func: Contap_SurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Func: Contap_SurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;

  IsDone(): boolean;

  NbLines(): number;

  Value(Index: number): Contap_TheIWLineOfTheIWalking;

  NbSinglePnts(): number;

  SinglePnt(Index: number): IntSurf_PathPoint;

  delete(): void;

  [Symbol.dispose](): void;

Contap_ThePathPointOfTheSearch: declare class Contap_ThePathPointOfTheSearch

  constructor

  SetValue(P: gp_Pnt, Tol: number, V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d, Parameter: number): void;
  SetValue(P: gp_Pnt, Tol: number, A: Adaptor2d_Curve2d, Parameter: number): void;
  SetValue(P: gp_Pnt, Tol: number, V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d, Parameter: number): void;
  SetValue(P: gp_Pnt, Tol: number, A: Adaptor2d_Curve2d, Parameter: number): void;

  Value(): gp_Pnt;

  Tolerance(): number;

  IsNew(): boolean;

  Vertex(): Adaptor3d_HVertex;

  Arc(): Adaptor2d_Curve2d;

  Parameter(): number;

  delete(): void;

  [Symbol.dispose](): void;

Contap_TheSearch: declare class Contap_TheSearch

  constructor

  Perform(F: Contap_ArcFunction, Domain: Adaptor3d_TopolTool, TolBoundary: number, TolTangency: number, RecheckOnRegularity: boolean): void;

  IsDone(): boolean;

  AllArcSolution(): boolean;

  NbPoints(): number;

  Point(Index: number): Contap_ThePathPointOfTheSearch;

  NbSegments(): number;

  Segment(Index: number): Contap_TheSegmentOfTheSearch;

  delete(): void;

  [Symbol.dispose](): void;

Contap_TheSearchInside: declare class Contap_TheSearchInside

  constructor

  Perform(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number): void;
  Perform(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, UStart: number, VStart: number): void;
  Perform(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number): void;
  Perform(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, UStart: number, VStart: number): void;

  IsDone(): boolean;

  NbPoints(): number;

  Value(Index: number): IntSurf_InteriorPoint;

  delete(): void;

  [Symbol.dispose](): void;

Contap_TheSegmentOfTheSearch: declare class Contap_TheSegmentOfTheSearch

  constructor

  SetValue(A: Adaptor2d_Curve2d): void;

  SetLimitPoint(V: Contap_ThePathPointOfTheSearch, First: boolean): void;

  Curve(): Adaptor2d_Curve2d;

  HasFirstPoint(): boolean;

  FirstPoint(): Contap_ThePathPointOfTheSearch;

  HasLastPoint(): boolean;

  LastPoint(): Contap_ThePathPointOfTheSearch;

  delete(): void;

  [Symbol.dispose](): void;
