# libcascade — IntPatch

29 top-level symbols. Signatures are verbatim typescript.

IntPatch_ALine: declare class IntPatch_ALine extends IntPatch_Line

  // IntPatch_ALine.constructor (constructor)
  constructor(C: IntAna_Curve, Tang: boolean);
  constructor(C: IntAna_Curve, Tang: boolean, Trans1: IntSurf_TypeTrans, Trans2: IntSurf_TypeTrans);
  constructor(C: IntAna_Curve, Tang: boolean, Situ1: IntSurf_Situation, Situ2: IntSurf_Situation);

  // IntPatch_ALine.AddVertex (method)
  AddVertex(Pnt: IntPatch_Point): void;

  // IntPatch_ALine.Replace (method)
  Replace(Index: number, Pnt: IntPatch_Point): void;

  // IntPatch_ALine.SetFirstPoint (method)
  SetFirstPoint(IndFirst: number): void;

  // IntPatch_ALine.SetLastPoint (method)
  SetLastPoint(IndLast: number): void;

  // IntPatch_ALine.FirstParameter (method)
  FirstParameter(IsIncluded?: boolean): { returnValue: number; IsIncluded: boolean };

  // IntPatch_ALine.LastParameter (method)
  LastParameter(IsIncluded?: boolean): { returnValue: number; IsIncluded: boolean };

  // IntPatch_ALine.Value (method)
  Value(U: number): gp_Pnt;

  // IntPatch_ALine.D1 (method)
  D1(U: number, P: gp_Pnt, Du: gp_Vec): boolean;

  // IntPatch_ALine.FindParameter (method)
  FindParameter(P: gp_Pnt, theParams: NCollection_List_double): void;

  // IntPatch_ALine.HasFirstPoint (method)
  HasFirstPoint(): boolean;

  // IntPatch_ALine.HasLastPoint (method)
  HasLastPoint(): boolean;

  // IntPatch_ALine.FirstPoint (method)
  FirstPoint(): IntPatch_Point;

  // IntPatch_ALine.LastPoint (method)
  LastPoint(): IntPatch_Point;

  // IntPatch_ALine.NbVertex (method)
  NbVertex(): number;

  // IntPatch_ALine.Vertex (method)
  Vertex(Index: number): IntPatch_Point;

  // IntPatch_ALine.ChangeVertex (method)
  ChangeVertex(theIndex: number): IntPatch_Point;

  // IntPatch_ALine.ComputeVertexParameters (method)
  ComputeVertexParameters(Tol: number): void;

  // IntPatch_ALine.Curve (method)
  Curve(): IntAna_Curve;

  // IntPatch_ALine.get_type_name (method)
  static get_type_name(): string;

  // IntPatch_ALine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IntPatch_ALine.DynamicType (method)
  DynamicType(): Standard_Type;

  // IntPatch_ALine.delete (method)
  delete(): void;

  // IntPatch_ALine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_ALineToWLine: declare class IntPatch_ALineToWLine

  // IntPatch_ALineToWLine.constructor (constructor)
  constructor(theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theNbPoints?: number);

  // IntPatch_ALineToWLine.SetTolOpenDomain (method)
  SetTolOpenDomain(aT: number): void;

  // IntPatch_ALineToWLine.TolOpenDomain (method)
  TolOpenDomain(): number;

  // IntPatch_ALineToWLine.SetTolTransition (method)
  SetTolTransition(aT: number): void;

  // IntPatch_ALineToWLine.TolTransition (method)
  TolTransition(): number;

  // IntPatch_ALineToWLine.SetTol3D (method)
  SetTol3D(aT: number): void;

  // IntPatch_ALineToWLine.Tol3D (method)
  Tol3D(): number;

  // IntPatch_ALineToWLine.MakeWLine (method)
  MakeWLine(aline: IntPatch_ALine, theLines: NCollection_Sequence_handle_IntPatch_Line): void;
  MakeWLine(aline: IntPatch_ALine, paraminf: number, paramsup: number, theLines: NCollection_Sequence_handle_IntPatch_Line): void;

  // IntPatch_ALineToWLine.delete (method)
  delete(): void;

  // IntPatch_ALineToWLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_ArcFunction: declare class IntPatch_ArcFunction extends math_FunctionWithDerivative

  // IntPatch_ArcFunction.constructor (constructor)
  constructor();

  // IntPatch_ArcFunction.SetQuadric (method)
  SetQuadric(Q: IntSurf_Quadric): void;

  // IntPatch_ArcFunction.Set (method)
  Set(A: Adaptor2d_Curve2d): void;
  Set(S: Adaptor3d_Surface): void;

  // IntPatch_ArcFunction.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // IntPatch_ArcFunction.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // IntPatch_ArcFunction.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // IntPatch_ArcFunction.NbSamples (method)
  NbSamples(): number;

  // IntPatch_ArcFunction.GetStateNumber (method)
  GetStateNumber(): number;

  // IntPatch_ArcFunction.Valpoint (method)
  Valpoint(Index: number): gp_Pnt;

  // IntPatch_ArcFunction.Quadric (method)
  Quadric(): IntSurf_Quadric;

  // IntPatch_ArcFunction.Arc (method)
  Arc(): Adaptor2d_Curve2d;

  // IntPatch_ArcFunction.Surface (method)
  Surface(): Adaptor3d_Surface;

  // IntPatch_ArcFunction.LastComputedPoint (method)
  LastComputedPoint(): gp_Pnt;

  // IntPatch_ArcFunction.delete (method)
  delete(): void;

  // IntPatch_ArcFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_BVHTraversal: declare class IntPatch_BVHTraversal

  // IntPatch_BVHTraversal.constructor (constructor)
  constructor();

  // IntPatch_BVHTraversal.Perform (method)
  Perform(theSet1: IntPatch_PolyhedronBVH, theSet2: IntPatch_PolyhedronBVH, theSelfInterference: boolean): number;

  // IntPatch_BVHTraversal.Pairs (method)
  Pairs(): any;

  // IntPatch_BVHTraversal.Clear (method)
  Clear(): void;

  // IntPatch_BVHTraversal.Accept (method)
  Accept(theIndex1: number, theIndex2: number): boolean;

  // IntPatch_BVHTraversal.delete (method)
  delete(): void;

  // IntPatch_BVHTraversal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_BVHTraversal_TrianglePair: interface IntPatch_BVHTraversal_TrianglePair

  First: number

  Second: number

  // IntPatch_BVHTraversal_TrianglePair.constructor (constructor)
  constructor(theFirst?: number, theSecond?: number);

  First: number

  Second: number

  // IntPatch_BVHTraversal_TrianglePair.delete (method)
  delete(): void;

  // IntPatch_BVHTraversal_TrianglePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_CSFunction: declare class IntPatch_CSFunction extends math_FunctionSetWithDerivatives

  // IntPatch_CSFunction.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, C: Adaptor2d_Curve2d, S2: Adaptor3d_Surface);

  // IntPatch_CSFunction.NbVariables (method)
  NbVariables(): number;

  // IntPatch_CSFunction.NbEquations (method)
  NbEquations(): number;

  // IntPatch_CSFunction.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // IntPatch_CSFunction.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // IntPatch_CSFunction.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // IntPatch_CSFunction.Point (method)
  Point(): gp_Pnt;

  // IntPatch_CSFunction.Root (method)
  Root(): number;

  // IntPatch_CSFunction.AuxillarSurface (method)
  AuxillarSurface(): Adaptor3d_Surface;

  // IntPatch_CSFunction.AuxillarCurve (method)
  AuxillarCurve(): Adaptor2d_Curve2d;

  // IntPatch_CSFunction.delete (method)
  delete(): void;

  // IntPatch_CSFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_CurvIntSurf: declare class IntPatch_CurvIntSurf

  // IntPatch_CurvIntSurf.constructor (constructor)
  constructor(F: IntPatch_CSFunction, TolTangency: number);
  constructor(U: number, V: number, W: number, F: IntPatch_CSFunction, TolTangency: number, MarginCoef?: number);

  // IntPatch_CurvIntSurf.Perform (method)
  Perform(U: number, V: number, W: number, Rsnld: math_FunctionSetRoot, u0: number, v0: number, u1: number, v1: number, w0: number, w1: number): void;

  // IntPatch_CurvIntSurf.IsDone (method)
  IsDone(): boolean;

  // IntPatch_CurvIntSurf.IsEmpty (method)
  IsEmpty(): boolean;

  // IntPatch_CurvIntSurf.Point (method)
  Point(): gp_Pnt;

  // IntPatch_CurvIntSurf.ParameterOnCurve (method)
  ParameterOnCurve(): number;

  // IntPatch_CurvIntSurf.ParameterOnSurface (method)
  ParameterOnSurface(U?: number, V?: number): { U: number; V: number };

  // IntPatch_CurvIntSurf.Function (method)
  Function(): IntPatch_CSFunction;

  // IntPatch_CurvIntSurf.delete (method)
  delete(): void;

  // IntPatch_CurvIntSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_GLine: declare class IntPatch_GLine extends IntPatch_Line

  // IntPatch_GLine.constructor (constructor)
  constructor(L: gp_Lin, Tang: boolean);
  constructor(C: gp_Circ, Tang: boolean);
  constructor(E: gp_Elips, Tang: boolean);
  constructor(P: gp_Parab, Tang: boolean);
  constructor(H: gp_Hypr, Tang: boolean);
  constructor(L: gp_Lin, Tang: boolean, Trans1: IntSurf_TypeTrans, Trans2: IntSurf_TypeTrans);
  constructor(L: gp_Lin, Tang: boolean, Situ1: IntSurf_Situation, Situ2: IntSurf_Situation);
  constructor(C: gp_Circ, Tang: boolean, Trans1: IntSurf_TypeTrans, Trans2: IntSurf_TypeTrans);
  constructor(C: gp_Circ, Tang: boolean, Situ1: IntSurf_Situation, Situ2: IntSurf_Situation);
  constructor(E: gp_Elips, Tang: boolean, Trans1: IntSurf_TypeTrans, Trans2: IntSurf_TypeTrans);
  constructor(E: gp_Elips, Tang: boolean, Situ1: IntSurf_Situation, Situ2: IntSurf_Situation);
  constructor(P: gp_Parab, Tang: boolean, Trans1: IntSurf_TypeTrans, Trans2: IntSurf_TypeTrans);
  constructor(P: gp_Parab, Tang: boolean, Situ1: IntSurf_Situation, Situ2: IntSurf_Situation);
  constructor(H: gp_Hypr, Tang: boolean, Trans1: IntSurf_TypeTrans, Trans2: IntSurf_TypeTrans);
  constructor(H: gp_Hypr, Tang: boolean, Situ1: IntSurf_Situation, Situ2: IntSurf_Situation);

  // IntPatch_GLine.AddVertex (method)
  AddVertex(Pnt: IntPatch_Point): void;

  // IntPatch_GLine.Replace (method)
  Replace(Index: number, Pnt: IntPatch_Point): void;

  // IntPatch_GLine.SetFirstPoint (method)
  SetFirstPoint(IndFirst: number): void;

  // IntPatch_GLine.SetLastPoint (method)
  SetLastPoint(IndLast: number): void;

  // IntPatch_GLine.Line (method)
  Line(): gp_Lin;

  // IntPatch_GLine.Circle (method)
  Circle(): gp_Circ;

  // IntPatch_GLine.Ellipse (method)
  Ellipse(): gp_Elips;

  // IntPatch_GLine.Parabola (method)
  Parabola(): gp_Parab;

  // IntPatch_GLine.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // IntPatch_GLine.HasFirstPoint (method)
  HasFirstPoint(): boolean;

  // IntPatch_GLine.HasLastPoint (method)
  HasLastPoint(): boolean;

  // IntPatch_GLine.FirstPoint (method)
  FirstPoint(): IntPatch_Point;

  // IntPatch_GLine.LastPoint (method)
  LastPoint(): IntPatch_Point;

  // IntPatch_GLine.NbVertex (method)
  NbVertex(): number;

  // IntPatch_GLine.Vertex (method)
  Vertex(Index: number): IntPatch_Point;

  // IntPatch_GLine.ComputeVertexParameters (method)
  ComputeVertexParameters(Tol: number): void;

  // IntPatch_GLine.get_type_name (method)
  static get_type_name(): string;

  // IntPatch_GLine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IntPatch_GLine.DynamicType (method)
  DynamicType(): Standard_Type;

  // IntPatch_GLine.delete (method)
  delete(): void;

  // IntPatch_GLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_HCurve2dTool: declare class IntPatch_HCurve2dTool

  // IntPatch_HCurve2dTool.constructor (constructor)
  constructor();

  // IntPatch_HCurve2dTool.FirstParameter (method)
  static FirstParameter(C: Adaptor2d_Curve2d): number;

  // IntPatch_HCurve2dTool.LastParameter (method)
  static LastParameter(C: Adaptor2d_Curve2d): number;

  // IntPatch_HCurve2dTool.Continuity (method)
  static Continuity(C: Adaptor2d_Curve2d): GeomAbs_Shape;

  // IntPatch_HCurve2dTool.NbIntervals (method)
  static NbIntervals(C: Adaptor2d_Curve2d, S: GeomAbs_Shape): number;

  // IntPatch_HCurve2dTool.Intervals (method)
  static Intervals(C: Adaptor2d_Curve2d, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // IntPatch_HCurve2dTool.IsClosed (method)
  static IsClosed(C: Adaptor2d_Curve2d): boolean;

  // IntPatch_HCurve2dTool.IsPeriodic (method)
  static IsPeriodic(C: Adaptor2d_Curve2d): boolean;

  // IntPatch_HCurve2dTool.Period (method)
  static Period(C: Adaptor2d_Curve2d): number;

  // IntPatch_HCurve2dTool.Value (method)
  static Value(C: Adaptor2d_Curve2d, U: number): gp_Pnt2d;

  // IntPatch_HCurve2dTool.D0 (method)
  static D0(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d): void;

  // IntPatch_HCurve2dTool.D1 (method)
  static D1(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  // IntPatch_HCurve2dTool.D2 (method)
  static D2(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // IntPatch_HCurve2dTool.D3 (method)
  static D3(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // IntPatch_HCurve2dTool.DN (method)
  static DN(C: Adaptor2d_Curve2d, U: number, N: number): gp_Vec2d;

  // IntPatch_HCurve2dTool.Resolution (method)
  static Resolution(C: Adaptor2d_Curve2d, R3d: number): number;

  // IntPatch_HCurve2dTool.GetType (method)
  static GetType(C: Adaptor2d_Curve2d): GeomAbs_CurveType;

  // IntPatch_HCurve2dTool.Line (method)
  static Line(C: Adaptor2d_Curve2d): gp_Lin2d;

  // IntPatch_HCurve2dTool.Circle (method)
  static Circle(C: Adaptor2d_Curve2d): gp_Circ2d;

  // IntPatch_HCurve2dTool.Ellipse (method)
  static Ellipse(C: Adaptor2d_Curve2d): gp_Elips2d;

  // IntPatch_HCurve2dTool.Hyperbola (method)
  static Hyperbola(C: Adaptor2d_Curve2d): gp_Hypr2d;

  // IntPatch_HCurve2dTool.Parabola (method)
  static Parabola(C: Adaptor2d_Curve2d): gp_Parab2d;

  // IntPatch_HCurve2dTool.Bezier (method)
  static Bezier(C: Adaptor2d_Curve2d): Geom2d_BezierCurve;

  // IntPatch_HCurve2dTool.BSpline (method)
  static BSpline(C: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

  // IntPatch_HCurve2dTool.NbSamples (method)
  static NbSamples(C: Adaptor2d_Curve2d, U0: number, U1: number): number;

  // IntPatch_HCurve2dTool.delete (method)
  delete(): void;

  // IntPatch_HCurve2dTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_HInterTool: declare class IntPatch_HInterTool

  // IntPatch_HInterTool.constructor (constructor)
  constructor();

  // IntPatch_HInterTool.SingularOnUMin (method)
  static SingularOnUMin(S: Adaptor3d_Surface): boolean;

  // IntPatch_HInterTool.SingularOnUMax (method)
  static SingularOnUMax(S: Adaptor3d_Surface): boolean;

  // IntPatch_HInterTool.SingularOnVMin (method)
  static SingularOnVMin(S: Adaptor3d_Surface): boolean;

  // IntPatch_HInterTool.SingularOnVMax (method)
  static SingularOnVMax(S: Adaptor3d_Surface): boolean;

  // IntPatch_HInterTool.NbSamplesU (method)
  static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

  // IntPatch_HInterTool.NbSamplesV (method)
  static NbSamplesV(S: Adaptor3d_Surface, v1: number, v2: number): number;

  // IntPatch_HInterTool.NbSamplePoints (method)
  NbSamplePoints(S: Adaptor3d_Surface): number;

  // IntPatch_HInterTool.SamplePoint (method)
  SamplePoint(S: Adaptor3d_Surface, Index: number, U?: number, V?: number): { U: number; V: number };

  // IntPatch_HInterTool.HasBeenSeen (method)
  static HasBeenSeen(C: Adaptor2d_Curve2d): boolean;

  // IntPatch_HInterTool.NbSamplesOnArc (method)
  static NbSamplesOnArc(A: Adaptor2d_Curve2d): number;

  // IntPatch_HInterTool.Bounds (method)
  static Bounds(C: Adaptor2d_Curve2d, Ufirst?: number, Ulast?: number): { Ufirst: number; Ulast: number };

  // IntPatch_HInterTool.Project (method)
  static Project(C: Adaptor2d_Curve2d, P: gp_Pnt2d, Paramproj: number, Ptproj: gp_Pnt2d): { returnValue: boolean; Paramproj: number };

  // IntPatch_HInterTool.Tolerance (method)
  static Tolerance(V: Adaptor3d_HVertex, C: Adaptor2d_Curve2d): number;

  // IntPatch_HInterTool.Parameter (method)
  static Parameter(V: Adaptor3d_HVertex, C: Adaptor2d_Curve2d): number;

  // IntPatch_HInterTool.NbPoints (method)
  static NbPoints(C: Adaptor2d_Curve2d): number;

  // IntPatch_HInterTool.Value (method)
  static Value(C: Adaptor2d_Curve2d, Index: number, Pt: gp_Pnt, Tol?: number, U?: number): { Tol: number; U: number };

  // IntPatch_HInterTool.IsVertex (method)
  static IsVertex(C: Adaptor2d_Curve2d, Index: number): boolean;

  // IntPatch_HInterTool.Vertex (method)
  static Vertex(C: Adaptor2d_Curve2d, Index: number): { V: Adaptor3d_HVertex; [Symbol.dispose](): void };

  // IntPatch_HInterTool.NbSegments (method)
  static NbSegments(C: Adaptor2d_Curve2d): number;

  // IntPatch_HInterTool.HasFirstPoint (method)
  static HasFirstPoint(C: Adaptor2d_Curve2d, Index: number, IndFirst?: number): { returnValue: boolean; IndFirst: number };

  // IntPatch_HInterTool.HasLastPoint (method)
  static HasLastPoint(C: Adaptor2d_Curve2d, Index: number, IndLast?: number): { returnValue: boolean; IndLast: number };

  // IntPatch_HInterTool.IsAllSolution (method)
  static IsAllSolution(C: Adaptor2d_Curve2d): boolean;

  // IntPatch_HInterTool.delete (method)
  delete(): void;

  // IntPatch_HInterTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_IType: typeof IntPatch_IType[keyof typeof IntPatch_IType]

  readonly IntPatch_Lin: 'IntPatch_Lin'

  readonly IntPatch_Circle: 'IntPatch_Circle'

  readonly IntPatch_Ellipse: 'IntPatch_Ellipse'

  readonly IntPatch_Parabola: 'IntPatch_Parabola'

  readonly IntPatch_Hyperbola: 'IntPatch_Hyperbola'

  readonly IntPatch_Analytic: 'IntPatch_Analytic'

  readonly IntPatch_Walking: 'IntPatch_Walking'

  readonly IntPatch_Restriction: 'IntPatch_Restriction'

IntPatch_ImpImpIntersection: declare class IntPatch_ImpImpIntersection

  // IntPatch_ImpImpIntersection.constructor (constructor)
  constructor();
  constructor(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, theIsReqToKeepRLine?: boolean);

  // IntPatch_ImpImpIntersection.Perform (method)
  Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, theIsReqToKeepRLine?: boolean): void;

  // IntPatch_ImpImpIntersection.IsDone (method)
  IsDone(): boolean;

  // IntPatch_ImpImpIntersection.GetStatus (method)
  GetStatus(): IntPatch_ImpImpIntersection_IntStatus;

  // IntPatch_ImpImpIntersection.IsEmpty (method)
  IsEmpty(): boolean;

  // IntPatch_ImpImpIntersection.TangentFaces (method)
  TangentFaces(): boolean;

  // IntPatch_ImpImpIntersection.OppositeFaces (method)
  OppositeFaces(): boolean;

  // IntPatch_ImpImpIntersection.NbPnts (method)
  NbPnts(): number;

  // IntPatch_ImpImpIntersection.Point (method)
  Point(Index: number): IntPatch_Point;

  // IntPatch_ImpImpIntersection.NbLines (method)
  NbLines(): number;

  // IntPatch_ImpImpIntersection.Line (method)
  Line(Index: number): IntPatch_Line;

  // IntPatch_ImpImpIntersection.delete (method)
  delete(): void;

  // IntPatch_ImpImpIntersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_ImpImpIntersection_IntStatus: typeof IntPatch_ImpImpIntersection_IntStatus[keyof typeof IntPatch_ImpImpIntersection_IntStatus]

  readonly IntStatus_OK: 'IntStatus_OK'

  readonly IntStatus_InfiniteSectionCurve: 'IntStatus_InfiniteSectionCurve'

  readonly IntStatus_Fail: 'IntStatus_Fail'

IntPatch_ImpPrmIntersection: declare class IntPatch_ImpPrmIntersection

  // IntPatch_ImpPrmIntersection.constructor (constructor)
  constructor();
  constructor(Surf1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, Surf2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, Fleche: number, Pas: number);

  // IntPatch_ImpPrmIntersection.SetStartPoint (method)
  SetStartPoint(U: number, V: number): void;

  // IntPatch_ImpPrmIntersection.Perform (method)
  Perform(Surf1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, Surf2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, Fleche: number, Pas: number): void;

  // IntPatch_ImpPrmIntersection.IsDone (method)
  IsDone(): boolean;

  // IntPatch_ImpPrmIntersection.IsEmpty (method)
  IsEmpty(): boolean;

  // IntPatch_ImpPrmIntersection.NbPnts (method)
  NbPnts(): number;

  // IntPatch_ImpPrmIntersection.Point (method)
  Point(Index: number): IntPatch_Point;

  // IntPatch_ImpPrmIntersection.NbLines (method)
  NbLines(): number;

  // IntPatch_ImpPrmIntersection.Line (method)
  Line(Index: number): IntPatch_Line;

  // IntPatch_ImpPrmIntersection.delete (method)
  delete(): void;

  // IntPatch_ImpPrmIntersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_InterferencePolyhedron: declare class IntPatch_InterferencePolyhedron extends Intf_Interference

  // IntPatch_InterferencePolyhedron.constructor (constructor)
  constructor();

  // IntPatch_InterferencePolyhedron.delete (method)
  delete(): void;

  // IntPatch_InterferencePolyhedron.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_Intersection: declare class IntPatch_Intersection

  // IntPatch_Intersection.constructor (constructor)
  constructor();
  constructor(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, TolArc: number, TolTang: number);
  constructor(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number);

  // IntPatch_Intersection.SetTolerances (method)
  SetTolerances(TolArc: number, TolTang: number, UVMaxStep: number, Fleche: number): void;

  // IntPatch_Intersection.Perform (method)
  Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, TolArc: number, TolTang: number): void;
  Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, isGeomInt: boolean, theIsReqToKeepRLine: boolean, theIsReqToPostWLProc: boolean): void;
  Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, LOfPnts: NCollection_List_IntSurf_PntOn2S, isGeomInt: boolean, theIsReqToKeepRLine: boolean, theIsReqToPostWLProc: boolean): void;
  Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolArc: number, TolTang: number): void;

  // IntPatch_Intersection.IsDone (method)
  IsDone(): boolean;

  // IntPatch_Intersection.IsEmpty (method)
  IsEmpty(): boolean;

  // IntPatch_Intersection.TangentFaces (method)
  TangentFaces(): boolean;

  // IntPatch_Intersection.OppositeFaces (method)
  OppositeFaces(): boolean;

  // IntPatch_Intersection.NbPnts (method)
  NbPnts(): number;

  // IntPatch_Intersection.Point (method)
  Point(Index: number): IntPatch_Point;

  // IntPatch_Intersection.NbLines (method)
  NbLines(): number;

  // IntPatch_Intersection.Line (method)
  Line(Index: number): IntPatch_Line;

  // IntPatch_Intersection.SequenceOfLine (method)
  SequenceOfLine(): NCollection_Sequence_handle_IntPatch_Line;

  // IntPatch_Intersection.Dump (method)
  Dump(Mode: number, S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool): void;

  // IntPatch_Intersection.CheckSingularPoints (method)
  static CheckSingularPoints(theS1: Adaptor3d_Surface, theD1: Adaptor3d_TopolTool, theS2: Adaptor3d_Surface, theDist?: number): { returnValue: boolean; theDist: number };

  // IntPatch_Intersection.DefineUVMaxStep (method)
  static DefineUVMaxStep(theS1: Adaptor3d_Surface, theD1: Adaptor3d_TopolTool, theS2: Adaptor3d_Surface, theD2: Adaptor3d_TopolTool): number;

  // IntPatch_Intersection.PrepareSurfaces (method)
  static PrepareSurfaces(theS1: Adaptor3d_Surface, theD1: Adaptor3d_TopolTool, theS2: Adaptor3d_Surface, theD2: Adaptor3d_TopolTool, Tol: number, theSeqHS1: NCollection_DynamicArray_handle_Adaptor3d_Surface, theSeqHS2: NCollection_DynamicArray_handle_Adaptor3d_Surface): void;

  // IntPatch_Intersection.delete (method)
  delete(): void;

  // IntPatch_Intersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_Line: declare class IntPatch_Line extends Standard_Transient

  // IntPatch_Line.SetValue (method)
  SetValue(Uiso1: boolean, Viso1: boolean, Uiso2: boolean, Viso2: boolean): void;

  // IntPatch_Line.ArcType (method)
  ArcType(): IntPatch_IType;

  // IntPatch_Line.IsTangent (method)
  IsTangent(): boolean;

  // IntPatch_Line.TransitionOnS1 (method)
  TransitionOnS1(): IntSurf_TypeTrans;

  // IntPatch_Line.TransitionOnS2 (method)
  TransitionOnS2(): IntSurf_TypeTrans;

  // IntPatch_Line.SituationS1 (method)
  SituationS1(): IntSurf_Situation;

  // IntPatch_Line.SituationS2 (method)
  SituationS2(): IntSurf_Situation;

  // IntPatch_Line.IsUIsoOnS1 (method)
  IsUIsoOnS1(): boolean;

  // IntPatch_Line.IsVIsoOnS1 (method)
  IsVIsoOnS1(): boolean;

  // IntPatch_Line.IsUIsoOnS2 (method)
  IsUIsoOnS2(): boolean;

  // IntPatch_Line.IsVIsoOnS2 (method)
  IsVIsoOnS2(): boolean;

  // IntPatch_Line.get_type_name (method)
  static get_type_name(): string;

  // IntPatch_Line.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IntPatch_Line.DynamicType (method)
  DynamicType(): Standard_Type;

  // IntPatch_Line.delete (method)
  delete(): void;

  // IntPatch_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_LineConstructor: declare class IntPatch_LineConstructor

  // IntPatch_LineConstructor.constructor (constructor)
  constructor(mode: number);

  // IntPatch_LineConstructor.Perform (method)
  Perform(SL: NCollection_Sequence_handle_IntPatch_Line, L: IntPatch_Line, S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, Tol: number): void;

  // IntPatch_LineConstructor.NbLines (method)
  NbLines(): number;

  // IntPatch_LineConstructor.Line (method)
  Line(index: number): IntPatch_Line;

  // IntPatch_LineConstructor.delete (method)
  delete(): void;

  // IntPatch_LineConstructor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_Point: declare class IntPatch_Point

  // IntPatch_Point.constructor (constructor)
  constructor();

  // IntPatch_Point.SetValue (method)
  SetValue(Pt: gp_Pnt): void;
  SetValue(thePOn2S: IntSurf_PntOn2S): void;
  SetValue(Pt: gp_Pnt, Tol: number, Tangent: boolean): void;

  // IntPatch_Point.SetTolerance (method)
  SetTolerance(Tol: number): void;

  // IntPatch_Point.SetParameters (method)
  SetParameters(U1: number, V1: number, U2: number, V2: number): void;

  // IntPatch_Point.SetParameter (method)
  SetParameter(Para: number): void;

  // IntPatch_Point.SetVertex (method)
  SetVertex(OnFirst: boolean, V: Adaptor3d_HVertex): void;

  // IntPatch_Point.SetArc (method)
  SetArc(OnFirst: boolean, A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

  // IntPatch_Point.SetMultiple (method)
  SetMultiple(IsMult: boolean): void;

  // IntPatch_Point.Value (method)
  Value(): gp_Pnt;

  // IntPatch_Point.ParameterOnLine (method)
  ParameterOnLine(): number;

  // IntPatch_Point.Tolerance (method)
  Tolerance(): number;

  // IntPatch_Point.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // IntPatch_Point.ParametersOnS1 (method)
  ParametersOnS1(U1?: number, V1?: number): { U1: number; V1: number };

  // IntPatch_Point.ParametersOnS2 (method)
  ParametersOnS2(U2?: number, V2?: number): { U2: number; V2: number };

  // IntPatch_Point.IsMultiple (method)
  IsMultiple(): boolean;

  // IntPatch_Point.IsOnDomS1 (method)
  IsOnDomS1(): boolean;

  // IntPatch_Point.IsVertexOnS1 (method)
  IsVertexOnS1(): boolean;

  // IntPatch_Point.VertexOnS1 (method)
  VertexOnS1(): Adaptor3d_HVertex;

  // IntPatch_Point.ArcOnS1 (method)
  ArcOnS1(): Adaptor2d_Curve2d;

  // IntPatch_Point.TransitionLineArc1 (method)
  TransitionLineArc1(): IntSurf_Transition;

  // IntPatch_Point.TransitionOnS1 (method)
  TransitionOnS1(): IntSurf_Transition;

  // IntPatch_Point.ParameterOnArc1 (method)
  ParameterOnArc1(): number;

  // IntPatch_Point.IsOnDomS2 (method)
  IsOnDomS2(): boolean;

  // IntPatch_Point.IsVertexOnS2 (method)
  IsVertexOnS2(): boolean;

  // IntPatch_Point.VertexOnS2 (method)
  VertexOnS2(): Adaptor3d_HVertex;

  // IntPatch_Point.ArcOnS2 (method)
  ArcOnS2(): Adaptor2d_Curve2d;

  // IntPatch_Point.TransitionLineArc2 (method)
  TransitionLineArc2(): IntSurf_Transition;

  // IntPatch_Point.TransitionOnS2 (method)
  TransitionOnS2(): IntSurf_Transition;

  // IntPatch_Point.ParameterOnArc2 (method)
  ParameterOnArc2(): number;

  // IntPatch_Point.PntOn2S (method)
  PntOn2S(): IntSurf_PntOn2S;

  // IntPatch_Point.Parameters (method)
  Parameters(U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  // IntPatch_Point.ReverseTransition (method)
  ReverseTransition(): void;

  // IntPatch_Point.Dump (method)
  Dump(): void;

  // IntPatch_Point.delete (method)
  delete(): void;

  // IntPatch_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_PointLine: declare class IntPatch_PointLine extends IntPatch_Line

  // IntPatch_PointLine.AddVertex (method)
  AddVertex(Pnt: IntPatch_Point, theIsPrepend?: boolean): void;

  // IntPatch_PointLine.NbPnts (method)
  NbPnts(): number;

  // IntPatch_PointLine.NbVertex (method)
  NbVertex(): number;

  // IntPatch_PointLine.Point (method)
  Point(Index: number): IntSurf_PntOn2S;

  // IntPatch_PointLine.Vertex (method)
  Vertex(Index: number): IntPatch_Point;

  // IntPatch_PointLine.ChangeVertex (method)
  ChangeVertex(Index: number): IntPatch_Point;

  // IntPatch_PointLine.ClearVertexes (method)
  ClearVertexes(): void;

  // IntPatch_PointLine.RemoveVertex (method)
  RemoveVertex(theIndex: number): void;

  // IntPatch_PointLine.Curve (method)
  Curve(): IntSurf_LineOn2S;

  // IntPatch_PointLine.IsOutSurf1Box (method)
  IsOutSurf1Box(P1: gp_Pnt2d): boolean;

  // IntPatch_PointLine.IsOutSurf2Box (method)
  IsOutSurf2Box(P2: gp_Pnt2d): boolean;

  // IntPatch_PointLine.IsOutBox (method)
  IsOutBox(P: gp_Pnt): boolean;

  // IntPatch_PointLine.CurvatureRadiusOfIntersLine (method)
  static CurvatureRadiusOfIntersLine(theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theUVPoint: IntSurf_PntOn2S): number;

  // IntPatch_PointLine.get_type_name (method)
  static get_type_name(): string;

  // IntPatch_PointLine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IntPatch_PointLine.DynamicType (method)
  DynamicType(): Standard_Type;

  // IntPatch_PointLine.delete (method)
  delete(): void;

  // IntPatch_PointLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_PolyArc: declare class IntPatch_PolyArc extends IntPatch_Polygo

  // IntPatch_PolyArc.constructor (constructor)
  constructor(A: Adaptor2d_Curve2d, NbSample: number, Pfirst: number, Plast: number, BoxOtherPolygon: Bnd_Box2d);

  // IntPatch_PolyArc.Closed (method)
  Closed(): boolean;

  // IntPatch_PolyArc.NbPoints (method)
  NbPoints(): number;

  // IntPatch_PolyArc.Point (method)
  Point(Index: number): gp_Pnt2d;

  // IntPatch_PolyArc.Parameter (method)
  Parameter(Index: number): number;

  // IntPatch_PolyArc.SetOffset (method)
  SetOffset(OffsetX: number, OffsetY: number): void;

  // IntPatch_PolyArc.delete (method)
  delete(): void;

  // IntPatch_PolyArc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_PolyLine: declare class IntPatch_PolyLine extends IntPatch_Polygo

  // IntPatch_PolyLine.constructor (constructor)
  constructor();
  constructor(InitDefle: number);

  // IntPatch_PolyLine.SetWLine (method)
  SetWLine(OnFirst: boolean, Line: IntPatch_WLine): void;

  // IntPatch_PolyLine.ResetError (method)
  ResetError(): void;

  // IntPatch_PolyLine.NbPoints (method)
  NbPoints(): number;

  // IntPatch_PolyLine.Point (method)
  Point(Index: number): gp_Pnt2d;

  // IntPatch_PolyLine.delete (method)
  delete(): void;

  // IntPatch_PolyLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_Polygo: declare class IntPatch_Polygo extends Intf_Polygon2d

  // IntPatch_Polygo.Error (method)
  Error(): number;

  // IntPatch_Polygo.NbPoints (method)
  NbPoints(): number;

  // IntPatch_Polygo.Point (method)
  Point(Index: number): gp_Pnt2d;

  // IntPatch_Polygo.DeflectionOverEstimation (method)
  DeflectionOverEstimation(): number;

  // IntPatch_Polygo.NbSegments (method)
  NbSegments(): number;

  // IntPatch_Polygo.Segment (method)
  Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;

  // IntPatch_Polygo.Dump (method)
  Dump(): void;

  // IntPatch_Polygo.delete (method)
  delete(): void;

  // IntPatch_Polygo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_PolyhedronBVH: declare class IntPatch_PolyhedronBVH

  // IntPatch_PolyhedronBVH.constructor (constructor)
  constructor();

  // IntPatch_PolyhedronBVH.Clear (method)
  Clear(): void;

  // IntPatch_PolyhedronBVH.Size (method)
  Size(): number;

  // IntPatch_PolyhedronBVH.Box (method)
  Box(theIndex: number): any;

  // IntPatch_PolyhedronBVH.Center (method)
  Center(theIndex: number, theAxis: number): number;

  // IntPatch_PolyhedronBVH.Swap (method)
  Swap(theIndex1: number, theIndex2: number): void;

  // IntPatch_PolyhedronBVH.OriginalIndex (method)
  OriginalIndex(theIndex: number): number;

  // IntPatch_PolyhedronBVH.IsInitialized (method)
  IsInitialized(): boolean;

  // IntPatch_PolyhedronBVH.delete (method)
  delete(): void;

  // IntPatch_PolyhedronBVH.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_PolyhedronTool: declare class IntPatch_PolyhedronTool

  // IntPatch_PolyhedronTool.constructor (constructor)
  constructor();

  // IntPatch_PolyhedronTool.delete (method)
  delete(): void;

  // IntPatch_PolyhedronTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_PrmPrmIntersection: declare class IntPatch_PrmPrmIntersection

  // IntPatch_PrmPrmIntersection.constructor (constructor)
  constructor();

  // IntPatch_PrmPrmIntersection.Perform (method)
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ClearFlag: boolean): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;

  // IntPatch_PrmPrmIntersection.IsDone (method)
  IsDone(): boolean;

  // IntPatch_PrmPrmIntersection.IsEmpty (method)
  IsEmpty(): boolean;

  // IntPatch_PrmPrmIntersection.NbLines (method)
  NbLines(): number;

  // IntPatch_PrmPrmIntersection.Line (method)
  Line(Index: number): IntPatch_Line;

  // IntPatch_PrmPrmIntersection.NewLine (method)
  NewLine(Caro1: Adaptor3d_Surface, Caro2: Adaptor3d_Surface, IndexLine: number, LowPoint: number, HighPoint: number, NbPoints: number): IntPatch_Line;

  // IntPatch_PrmPrmIntersection.GrilleInteger (method)
  GrilleInteger(ix: number, iy: number, iz: number): number;

  // IntPatch_PrmPrmIntersection.IntegerGrille (method)
  IntegerGrille(t: number, ix?: number, iy?: number, iz?: number): { ix: number; iy: number; iz: number };

  // IntPatch_PrmPrmIntersection.DansGrille (method)
  DansGrille(t: number): number;

  // IntPatch_PrmPrmIntersection.NbPointsGrille (method)
  NbPointsGrille(): number;

  // IntPatch_PrmPrmIntersection.RemplitLin (method)
  RemplitLin(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, Map: IntPatch_PrmPrmIntersection_T3Bits): void;

  // IntPatch_PrmPrmIntersection.RemplitTri (method)
  RemplitTri(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, x3: number, y3: number, z3: number, Map: IntPatch_PrmPrmIntersection_T3Bits): void;

  // IntPatch_PrmPrmIntersection.Remplit (method)
  Remplit(a: number, b: number, c: number, Map: IntPatch_PrmPrmIntersection_T3Bits): void;

  // IntPatch_PrmPrmIntersection.CodeReject (method)
  CodeReject(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, x3: number, y3: number, z3: number): number;

  // IntPatch_PrmPrmIntersection.PointDepart (method)
  PointDepart(S1: Adaptor3d_Surface, SU1: number, SV1: number, S2: Adaptor3d_Surface, SU2: number, SV2: number): { LineOn2S: IntSurf_LineOn2S; [Symbol.dispose](): void };

  // IntPatch_PrmPrmIntersection.delete (method)
  delete(): void;

  // IntPatch_PrmPrmIntersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_PrmPrmIntersection_T3Bits: declare class IntPatch_PrmPrmIntersection_T3Bits

  // IntPatch_PrmPrmIntersection_T3Bits.constructor (constructor)
  constructor(size: number);

  // IntPatch_PrmPrmIntersection_T3Bits.Add (method)
  Add(t: number): void;

  // IntPatch_PrmPrmIntersection_T3Bits.Val (method)
  Val(t: number): number;

  // IntPatch_PrmPrmIntersection_T3Bits.Raz (method)
  Raz(t: number): void;

  // IntPatch_PrmPrmIntersection_T3Bits.ResetAnd (method)
  ResetAnd(): void;

  // IntPatch_PrmPrmIntersection_T3Bits.And (method)
  And(Oth: IntPatch_PrmPrmIntersection_T3Bits, indiceprecedent?: number): { returnValue: number; indiceprecedent: number };

  // IntPatch_PrmPrmIntersection_T3Bits.delete (method)
  delete(): void;

  // IntPatch_PrmPrmIntersection_T3Bits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_RstInt: declare class IntPatch_RstInt

  // IntPatch_RstInt.constructor (constructor)
  constructor();

  // IntPatch_RstInt.PutVertexOnLine (method)
  static PutVertexOnLine(L: IntPatch_Line, Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, OtherSurf: Adaptor3d_Surface, OnFirst: boolean, Tol: number): void;

  // IntPatch_RstInt.delete (method)
  delete(): void;

  // IntPatch_RstInt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_SpecPntType: typeof IntPatch_SpecPntType[keyof typeof IntPatch_SpecPntType]

  readonly IntPatch_SPntNone: 'IntPatch_SPntNone'

  readonly IntPatch_SPntSeamU: 'IntPatch_SPntSeamU'

  readonly IntPatch_SPntSeamV: 'IntPatch_SPntSeamV'

  readonly IntPatch_SPntSeamUV: 'IntPatch_SPntSeamUV'

  readonly IntPatch_SPntPoleSeamU: 'IntPatch_SPntPoleSeamU'

  readonly IntPatch_SPntPole: 'IntPatch_SPntPole'
