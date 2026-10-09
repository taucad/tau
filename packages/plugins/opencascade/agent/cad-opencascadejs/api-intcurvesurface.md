# libcascade — IntCurveSurface

13 top-level symbols. Signatures are verbatim typescript.

IntCurveSurface_HInter: declare class IntCurveSurface_HInter extends IntCurveSurface_Intersection

  // IntCurveSurface_HInter.constructor (constructor)
  constructor();

  // IntCurveSurface_HInter.Perform (method)
  Perform(Curve: Adaptor3d_Curve, Surface: Adaptor3d_Surface): void;
  Perform(Curve: Adaptor3d_Curve, Polygon: IntCurveSurface_ThePolygonOfHInter, Surface: Adaptor3d_Surface): void;

  // IntCurveSurface_HInter.delete (method)
  delete(): void;

  // IntCurveSurface_HInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_Intersection: declare class IntCurveSurface_Intersection

  // IntCurveSurface_Intersection.IsDone (method)
  IsDone(): boolean;

  // IntCurveSurface_Intersection.NbPoints (method)
  NbPoints(): number;

  // IntCurveSurface_Intersection.NbSegments (method)
  NbSegments(): number;

  // IntCurveSurface_Intersection.Segment (method)
  Segment(Index: number): IntCurveSurface_IntersectionSegment;

  // IntCurveSurface_Intersection.IsParallel (method)
  IsParallel(): boolean;

  // IntCurveSurface_Intersection.Dump (method)
  Dump(): void;

  // IntCurveSurface_Intersection.delete (method)
  delete(): void;

  // IntCurveSurface_Intersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_IntersectionSegment: declare class IntCurveSurface_IntersectionSegment

  // IntCurveSurface_IntersectionSegment.constructor (constructor)
  constructor();

  // IntCurveSurface_IntersectionSegment.Dump (method)
  Dump(): void;

  // IntCurveSurface_IntersectionSegment.delete (method)
  delete(): void;

  // IntCurveSurface_IntersectionSegment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_TheCSFunctionOfHInter: declare class IntCurveSurface_TheCSFunctionOfHInter extends math_FunctionSetWithDerivatives

  // IntCurveSurface_TheCSFunctionOfHInter.constructor (constructor)
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // IntCurveSurface_TheCSFunctionOfHInter.NbVariables (method)
  NbVariables(): number;

  // IntCurveSurface_TheCSFunctionOfHInter.NbEquations (method)
  NbEquations(): number;

  // IntCurveSurface_TheCSFunctionOfHInter.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // IntCurveSurface_TheCSFunctionOfHInter.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // IntCurveSurface_TheCSFunctionOfHInter.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // IntCurveSurface_TheCSFunctionOfHInter.Point (method)
  Point(): gp_Pnt;

  // IntCurveSurface_TheCSFunctionOfHInter.Root (method)
  Root(): number;

  // IntCurveSurface_TheCSFunctionOfHInter.AuxillarSurface (method)
  AuxillarSurface(): Adaptor3d_Surface;

  // IntCurveSurface_TheCSFunctionOfHInter.AuxillarCurve (method)
  AuxillarCurve(): Adaptor3d_Curve;

  // IntCurveSurface_TheCSFunctionOfHInter.delete (method)
  delete(): void;

  // IntCurveSurface_TheCSFunctionOfHInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_TheExactHInter: declare class IntCurveSurface_TheExactHInter

  // IntCurveSurface_TheExactHInter.constructor (constructor)
  constructor(F: IntCurveSurface_TheCSFunctionOfHInter, TolTangency: number);
  constructor(U: number, V: number, W: number, F: IntCurveSurface_TheCSFunctionOfHInter, TolTangency: number, MarginCoef?: number);

  // IntCurveSurface_TheExactHInter.Perform (method)
  Perform(U: number, V: number, W: number, Rsnld: math_FunctionSetRoot, u0: number, v0: number, u1: number, v1: number, w0: number, w1: number): void;

  // IntCurveSurface_TheExactHInter.IsDone (method)
  IsDone(): boolean;

  // IntCurveSurface_TheExactHInter.IsEmpty (method)
  IsEmpty(): boolean;

  // IntCurveSurface_TheExactHInter.Point (method)
  Point(): gp_Pnt;

  // IntCurveSurface_TheExactHInter.ParameterOnCurve (method)
  ParameterOnCurve(): number;

  // IntCurveSurface_TheExactHInter.ParameterOnSurface (method)
  ParameterOnSurface(U?: number, V?: number): { U: number; V: number };

  // IntCurveSurface_TheExactHInter.Function (method)
  Function(): IntCurveSurface_TheCSFunctionOfHInter;

  // IntCurveSurface_TheExactHInter.delete (method)
  delete(): void;

  // IntCurveSurface_TheExactHInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_TheHCurveTool: declare class IntCurveSurface_TheHCurveTool

  // IntCurveSurface_TheHCurveTool.constructor (constructor)
  constructor();

  // IntCurveSurface_TheHCurveTool.FirstParameter (method)
  static FirstParameter(C: Adaptor3d_Curve): number;

  // IntCurveSurface_TheHCurveTool.LastParameter (method)
  static LastParameter(C: Adaptor3d_Curve): number;

  // IntCurveSurface_TheHCurveTool.Continuity (method)
  static Continuity(C: Adaptor3d_Curve): GeomAbs_Shape;

  // IntCurveSurface_TheHCurveTool.NbIntervals (method)
  static NbIntervals(C: Adaptor3d_Curve, S: GeomAbs_Shape): number;

  // IntCurveSurface_TheHCurveTool.Intervals (method)
  static Intervals(C: Adaptor3d_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // IntCurveSurface_TheHCurveTool.IsClosed (method)
  static IsClosed(C: Adaptor3d_Curve): boolean;

  // IntCurveSurface_TheHCurveTool.IsPeriodic (method)
  static IsPeriodic(C: Adaptor3d_Curve): boolean;

  // IntCurveSurface_TheHCurveTool.Period (method)
  static Period(C: Adaptor3d_Curve): number;

  // IntCurveSurface_TheHCurveTool.Value (method)
  static Value(C: Adaptor3d_Curve, U: number): gp_Pnt;

  // IntCurveSurface_TheHCurveTool.D0 (method)
  static D0(C: Adaptor3d_Curve, U: number, P: gp_Pnt): void;

  // IntCurveSurface_TheHCurveTool.D1 (method)
  static D1(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V: gp_Vec): void;

  // IntCurveSurface_TheHCurveTool.D2 (method)
  static D2(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  // IntCurveSurface_TheHCurveTool.D3 (method)
  static D3(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

  // IntCurveSurface_TheHCurveTool.DN (method)
  static DN(C: Adaptor3d_Curve, U: number, N: number): gp_Vec;

  // IntCurveSurface_TheHCurveTool.Resolution (method)
  static Resolution(C: Adaptor3d_Curve, R3d: number): number;

  // IntCurveSurface_TheHCurveTool.GetType (method)
  static GetType(C: Adaptor3d_Curve): GeomAbs_CurveType;

  // IntCurveSurface_TheHCurveTool.Line (method)
  static Line(C: Adaptor3d_Curve): gp_Lin;

  // IntCurveSurface_TheHCurveTool.Circle (method)
  static Circle(C: Adaptor3d_Curve): gp_Circ;

  // IntCurveSurface_TheHCurveTool.Ellipse (method)
  static Ellipse(C: Adaptor3d_Curve): gp_Elips;

  // IntCurveSurface_TheHCurveTool.Hyperbola (method)
  static Hyperbola(C: Adaptor3d_Curve): gp_Hypr;

  // IntCurveSurface_TheHCurveTool.Parabola (method)
  static Parabola(C: Adaptor3d_Curve): gp_Parab;

  // IntCurveSurface_TheHCurveTool.Bezier (method)
  static Bezier(C: Adaptor3d_Curve): Geom_BezierCurve;

  // IntCurveSurface_TheHCurveTool.BSpline (method)
  static BSpline(C: Adaptor3d_Curve): Geom_BSplineCurve;

  // IntCurveSurface_TheHCurveTool.NbSamples (method)
  static NbSamples(C: Adaptor3d_Curve, U0: number, U1: number): number;

  // IntCurveSurface_TheHCurveTool.SamplePars (method)
  static SamplePars(C: Adaptor3d_Curve, U0: number, U1: number, Defl: number, NbMin: number): NCollection_HArray1_double;

  // IntCurveSurface_TheHCurveTool.delete (method)
  delete(): void;

  // IntCurveSurface_TheHCurveTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_TheInterferenceOfHInter: declare class IntCurveSurface_TheInterferenceOfHInter extends Intf_Interference

  // IntCurveSurface_TheInterferenceOfHInter.constructor (constructor)
  constructor();

  // IntCurveSurface_TheInterferenceOfHInter.delete (method)
  delete(): void;

  // IntCurveSurface_TheInterferenceOfHInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_ThePolygonOfHInter: declare class IntCurveSurface_ThePolygonOfHInter

  // IntCurveSurface_ThePolygonOfHInter.constructor (constructor)
  constructor(Curve: Adaptor3d_Curve, NbPnt: number);
  constructor(Curve: Adaptor3d_Curve, Upars: NCollection_Array1_double);
  constructor(Curve: Adaptor3d_Curve, U1: number, U2: number, NbPnt: number);

  // IntCurveSurface_ThePolygonOfHInter.Bounding (method)
  Bounding(): Bnd_Box;

  // IntCurveSurface_ThePolygonOfHInter.DeflectionOverEstimation (method)
  DeflectionOverEstimation(): number;

  // IntCurveSurface_ThePolygonOfHInter.SetDeflectionOverEstimation (method)
  SetDeflectionOverEstimation(x: number): void;

  // IntCurveSurface_ThePolygonOfHInter.Closed (method)
  Closed(flag: boolean): void;
  Closed(): boolean;

  // IntCurveSurface_ThePolygonOfHInter.NbSegments (method)
  NbSegments(): number;

  // IntCurveSurface_ThePolygonOfHInter.BeginOfSeg (method)
  BeginOfSeg(theIndex: number): gp_Pnt;

  // IntCurveSurface_ThePolygonOfHInter.EndOfSeg (method)
  EndOfSeg(theIndex: number): gp_Pnt;

  // IntCurveSurface_ThePolygonOfHInter.InfParameter (method)
  InfParameter(): number;

  // IntCurveSurface_ThePolygonOfHInter.SupParameter (method)
  SupParameter(): number;

  // IntCurveSurface_ThePolygonOfHInter.ApproxParamOnCurve (method)
  ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

  // IntCurveSurface_ThePolygonOfHInter.Dump (method)
  Dump(): void;

  // IntCurveSurface_ThePolygonOfHInter.delete (method)
  delete(): void;

  // IntCurveSurface_ThePolygonOfHInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_ThePolygonToolOfHInter: declare class IntCurveSurface_ThePolygonToolOfHInter

  // IntCurveSurface_ThePolygonToolOfHInter.constructor (constructor)
  constructor();

  // IntCurveSurface_ThePolygonToolOfHInter.Bounding (method)
  static Bounding(thePolygon: IntCurveSurface_ThePolygonOfHInter): Bnd_Box;

  // IntCurveSurface_ThePolygonToolOfHInter.DeflectionOverEstimation (method)
  static DeflectionOverEstimation(thePolygon: IntCurveSurface_ThePolygonOfHInter): number;

  // IntCurveSurface_ThePolygonToolOfHInter.Closed (method)
  static Closed(thePolygon: IntCurveSurface_ThePolygonOfHInter): boolean;

  // IntCurveSurface_ThePolygonToolOfHInter.NbSegments (method)
  static NbSegments(thePolygon: IntCurveSurface_ThePolygonOfHInter): number;

  // IntCurveSurface_ThePolygonToolOfHInter.BeginOfSeg (method)
  static BeginOfSeg(thePolygon: IntCurveSurface_ThePolygonOfHInter, Index: number): gp_Pnt;

  // IntCurveSurface_ThePolygonToolOfHInter.EndOfSeg (method)
  static EndOfSeg(thePolygon: IntCurveSurface_ThePolygonOfHInter, Index: number): gp_Pnt;

  // IntCurveSurface_ThePolygonToolOfHInter.Dump (method)
  static Dump(thePolygon: IntCurveSurface_ThePolygonOfHInter): void;

  // IntCurveSurface_ThePolygonToolOfHInter.delete (method)
  delete(): void;

  // IntCurveSurface_ThePolygonToolOfHInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_ThePolyhedronToolOfHInter: declare class IntCurveSurface_ThePolyhedronToolOfHInter

  // IntCurveSurface_ThePolyhedronToolOfHInter.constructor (constructor)
  constructor();

  // IntCurveSurface_ThePolyhedronToolOfHInter.delete (method)
  delete(): void;

  // IntCurveSurface_ThePolyhedronToolOfHInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_TheQuadCurvExactHInter: declare class IntCurveSurface_TheQuadCurvExactHInter

  // IntCurveSurface_TheQuadCurvExactHInter.constructor (constructor)
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // IntCurveSurface_TheQuadCurvExactHInter.IsDone (method)
  IsDone(): boolean;

  // IntCurveSurface_TheQuadCurvExactHInter.NbRoots (method)
  NbRoots(): number;

  // IntCurveSurface_TheQuadCurvExactHInter.Root (method)
  Root(Index: number): number;

  // IntCurveSurface_TheQuadCurvExactHInter.NbIntervals (method)
  NbIntervals(): number;

  // IntCurveSurface_TheQuadCurvExactHInter.Intervals (method)
  Intervals(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

  // IntCurveSurface_TheQuadCurvExactHInter.delete (method)
  delete(): void;

  // IntCurveSurface_TheQuadCurvExactHInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter: declare class IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter extends math_FunctionWithDerivative

  // IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter.constructor (constructor)
  constructor(Q: IntSurf_Quadric, C: Adaptor3d_Curve);

  // IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter.delete (method)
  delete(): void;

  // IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurveSurface_TransitionOnCurve: typeof IntCurveSurface_TransitionOnCurve[keyof typeof IntCurveSurface_TransitionOnCurve]

  readonly IntCurveSurface_Tangent: 'IntCurveSurface_Tangent'

  readonly IntCurveSurface_In: 'IntCurveSurface_In'

  readonly IntCurveSurface_Out: 'IntCurveSurface_Out'
