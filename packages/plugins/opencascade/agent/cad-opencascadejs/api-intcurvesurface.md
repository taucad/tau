# libcascade — IntCurveSurface

13 top-level symbols. Signatures are verbatim typescript.

IntCurveSurface_HInter: declare class IntCurveSurface_HInter extends IntCurveSurface_Intersection

  constructor

  Perform(Curve: Adaptor3d_Curve, Surface: Adaptor3d_Surface): void;
  Perform(Curve: Adaptor3d_Curve, Polygon: IntCurveSurface_ThePolygonOfHInter, Surface: Adaptor3d_Surface): void;
  Perform(Curve: Adaptor3d_Curve, Surface: Adaptor3d_Surface): void;
  Perform(Curve: Adaptor3d_Curve, Polygon: IntCurveSurface_ThePolygonOfHInter, Surface: Adaptor3d_Surface): void;

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_Intersection: declare class IntCurveSurface_Intersection

  IsDone(): boolean;

  NbPoints(): number;

  NbSegments(): number;

  Segment(Index: number): IntCurveSurface_IntersectionSegment;

  IsParallel(): boolean;

  Dump(): void;

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_IntersectionSegment: declare class IntCurveSurface_IntersectionSegment

  constructor

  Dump(): void;

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_TheCSFunctionOfHInter: declare class IntCurveSurface_TheCSFunctionOfHInter extends math_FunctionSetWithDerivatives

  constructor

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Point(): gp_Pnt;

  Root(): number;

  AuxillarSurface(): Adaptor3d_Surface;

  AuxillarCurve(): Adaptor3d_Curve;

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_TheExactHInter: declare class IntCurveSurface_TheExactHInter

  constructor

  Perform(U: number, V: number, W: number, Rsnld: math_FunctionSetRoot, u0: number, v0: number, u1: number, v1: number, w0: number, w1: number): void;

  IsDone(): boolean;

  IsEmpty(): boolean;

  Point(): gp_Pnt;

  ParameterOnCurve(): number;

  ParameterOnSurface(U?: number, V?: number): { U: number; V: number };

  Function(): IntCurveSurface_TheCSFunctionOfHInter;

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_TheHCurveTool: declare class IntCurveSurface_TheHCurveTool

  constructor

  static FirstParameter(C: Adaptor3d_Curve): number;

  static LastParameter(C: Adaptor3d_Curve): number;

  static Continuity(C: Adaptor3d_Curve): GeomAbs_Shape;

  static NbIntervals(C: Adaptor3d_Curve, S: GeomAbs_Shape): number;

  static Intervals(C: Adaptor3d_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  static IsClosed(C: Adaptor3d_Curve): boolean;

  static IsPeriodic(C: Adaptor3d_Curve): boolean;

  static Period(C: Adaptor3d_Curve): number;

  static Value(C: Adaptor3d_Curve, U: number): gp_Pnt;

  static D0(C: Adaptor3d_Curve, U: number, P: gp_Pnt): void;

  static D1(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V: gp_Vec): void;

  static D2(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  static D3(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

  static DN(C: Adaptor3d_Curve, U: number, N: number): gp_Vec;

  static Resolution(C: Adaptor3d_Curve, R3d: number): number;

  static GetType(C: Adaptor3d_Curve): GeomAbs_CurveType;

  static Line(C: Adaptor3d_Curve): gp_Lin;

  static Circle(C: Adaptor3d_Curve): gp_Circ;

  static Ellipse(C: Adaptor3d_Curve): gp_Elips;

  static Hyperbola(C: Adaptor3d_Curve): gp_Hypr;

  static Parabola(C: Adaptor3d_Curve): gp_Parab;

  static Bezier(C: Adaptor3d_Curve): Geom_BezierCurve;

  static BSpline(C: Adaptor3d_Curve): Geom_BSplineCurve;

  static NbSamples(C: Adaptor3d_Curve, U0: number, U1: number): number;

  static SamplePars(C: Adaptor3d_Curve, U0: number, U1: number, Defl: number, NbMin: number): NCollection_HArray1_double;

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_TheInterferenceOfHInter: declare class IntCurveSurface_TheInterferenceOfHInter extends Intf_Interference

  constructor

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_ThePolygonOfHInter: declare class IntCurveSurface_ThePolygonOfHInter

  constructor

  Bounding(): Bnd_Box;

  DeflectionOverEstimation(): number;

  SetDeflectionOverEstimation(x: number): void;

  Closed(flag: boolean): void;
  Closed(): boolean;
  Closed(flag: boolean): void;
  Closed(): boolean;

  NbSegments(): number;

  BeginOfSeg(theIndex: number): gp_Pnt;

  EndOfSeg(theIndex: number): gp_Pnt;

  InfParameter(): number;

  SupParameter(): number;

  ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

  Dump(): void;

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_ThePolygonToolOfHInter: declare class IntCurveSurface_ThePolygonToolOfHInter

  constructor

  static Bounding(thePolygon: IntCurveSurface_ThePolygonOfHInter): Bnd_Box;

  static DeflectionOverEstimation(thePolygon: IntCurveSurface_ThePolygonOfHInter): number;

  static Closed(thePolygon: IntCurveSurface_ThePolygonOfHInter): boolean;

  static NbSegments(thePolygon: IntCurveSurface_ThePolygonOfHInter): number;

  static BeginOfSeg(thePolygon: IntCurveSurface_ThePolygonOfHInter, Index: number): gp_Pnt;

  static EndOfSeg(thePolygon: IntCurveSurface_ThePolygonOfHInter, Index: number): gp_Pnt;

  static Dump(thePolygon: IntCurveSurface_ThePolygonOfHInter): void;

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_ThePolyhedronToolOfHInter: declare class IntCurveSurface_ThePolyhedronToolOfHInter

  constructor

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_TheQuadCurvExactHInter: declare class IntCurveSurface_TheQuadCurvExactHInter

  constructor

  IsDone(): boolean;

  NbRoots(): number;

  Root(Index: number): number;

  NbIntervals(): number;

  Intervals(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter: declare class IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter extends math_FunctionWithDerivative

  constructor

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  delete(): void;

  [Symbol.dispose](): void;

IntCurveSurface_TransitionOnCurve: typeof IntCurveSurface_TransitionOnCurve[keyof typeof IntCurveSurface_TransitionOnCurve]
