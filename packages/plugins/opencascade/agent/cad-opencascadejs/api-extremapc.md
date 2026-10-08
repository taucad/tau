# libcascade — ExtremaPC

20 top-level symbols. Signatures are verbatim typescript.

ExtremaPC_Config: declare class ExtremaPC_Config

  // ExtremaPC_Config.constructor (constructor)
  constructor();

  Tolerance: number

  Domain: unknown | null | undefined

  NbSamples: number

  Mode: ExtremaPC_SearchMode

  IncludeEndpoints: boolean

  // ExtremaPC_Config.delete (method)
  delete(): void;

  // ExtremaPC_Config.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_ExtremumResult: declare class ExtremaPC_ExtremumResult

  // ExtremaPC_ExtremumResult.constructor (constructor)
  constructor();

  Parameter: number

  Point: gp_Pnt

  SquareDistance: number

  IsMinimum: boolean

  // ExtremaPC_ExtremumResult.delete (method)
  delete(): void;

  // ExtremaPC_ExtremumResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_Result: declare class ExtremaPC_Result

  // ExtremaPC_Result.constructor (constructor)
  constructor();

  Status: ExtremaPC_Status

  Extrema: NCollection_DynamicArray_ExtremaPC_ExtremumResult

  InfiniteSquareDistance: number

  // ExtremaPC_Result.IsDone (method)
  IsDone(): boolean;

  // ExtremaPC_Result.IsInfinite (method)
  IsInfinite(): boolean;

  // ExtremaPC_Result.NbExt (method)
  NbExt(): number;

  // ExtremaPC_Result.MinSquareDistance (method)
  MinSquareDistance(): number;

  // ExtremaPC_Result.MinIndex (method)
  MinIndex(): number;

  // ExtremaPC_Result.MaxSquareDistance (method)
  MaxSquareDistance(): number;

  // ExtremaPC_Result.MaxIndex (method)
  MaxIndex(): number;

  // ExtremaPC_Result.Clear (method)
  Clear(): void;

  // ExtremaPC_Result.delete (method)
  delete(): void;

  // ExtremaPC_Result.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_SearchMode: typeof ExtremaPC_SearchMode[keyof typeof ExtremaPC_SearchMode]

  readonly MinMax: 'MinMax'

  readonly Min: 'Min'

  readonly Max: 'Max'

ExtremaPC_Status: typeof ExtremaPC_Status[keyof typeof ExtremaPC_Status]

  readonly OK: 'OK'

  readonly NotDone: 'NotDone'

  readonly InfiniteSolutions: 'InfiniteSolutions'

  readonly NoSolution: 'NoSolution'

  readonly NumericalError: 'NumericalError'

ExtremaPC_BSplineCurve: declare class ExtremaPC_BSplineCurve

  // ExtremaPC_BSplineCurve.constructor (constructor)
  constructor(theCurve: Geom_BSplineCurve);
  constructor(theCurve: Geom_BSplineCurve, theDomain: unknown);

  // ExtremaPC_BSplineCurve.Value (method)
  Value(theU: number): gp_Pnt;

  // ExtremaPC_BSplineCurve.IsBounded (method)
  IsBounded(): boolean;

  // ExtremaPC_BSplineCurve.Domain (method)
  Domain(): unknown;

  // ExtremaPC_BSplineCurve.Perform (method)
  Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_BSplineCurve.PerformWithEndpoints (method)
  PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_BSplineCurve.Curve (method)
  Curve(): Geom_BSplineCurve;

  // ExtremaPC_BSplineCurve.delete (method)
  delete(): void;

  // ExtremaPC_BSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_BezierCurve: declare class ExtremaPC_BezierCurve

  // ExtremaPC_BezierCurve.constructor (constructor)
  constructor(theCurve: Geom_BezierCurve);
  constructor(theCurve: Geom_BezierCurve, theDomain: unknown);

  // ExtremaPC_BezierCurve.Value (method)
  Value(theU: number): gp_Pnt;

  // ExtremaPC_BezierCurve.IsBounded (method)
  IsBounded(): boolean;

  // ExtremaPC_BezierCurve.Domain (method)
  Domain(): unknown;

  // ExtremaPC_BezierCurve.Perform (method)
  Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_BezierCurve.PerformWithEndpoints (method)
  PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_BezierCurve.Curve (method)
  Curve(): Geom_BezierCurve;

  // ExtremaPC_BezierCurve.delete (method)
  delete(): void;

  // ExtremaPC_BezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_Circle: declare class ExtremaPC_Circle

  // ExtremaPC_Circle.constructor (constructor)
  constructor(theCircle: gp_Circ);
  constructor(theCircle: gp_Circ, theDomain: unknown);

  // ExtremaPC_Circle.Value (method)
  Value(theU: number): gp_Pnt;

  // ExtremaPC_Circle.IsBounded (method)
  IsBounded(): boolean;

  // ExtremaPC_Circle.Domain (method)
  Domain(): unknown;

  // ExtremaPC_Circle.Perform (method)
  Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Circle.PerformWithEndpoints (method)
  PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Circle.Circle (method)
  Circle(): gp_Circ;

  // ExtremaPC_Circle.delete (method)
  delete(): void;

  // ExtremaPC_Circle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_Curve: declare class ExtremaPC_Curve

  // ExtremaPC_Curve.constructor (constructor)
  constructor(theCurve: GeomAdaptor_Curve);
  constructor(theCurve: GeomAdaptor_TransformedCurve);
  constructor(theCurve: Geom_Curve);
  constructor(theCurve: GeomAdaptor_Curve, theUMin: number, theUMax: number);
  constructor(theCurve: GeomAdaptor_TransformedCurve, theUMin: number, theUMax: number);
  constructor(theCurve: Geom_Curve, theUMin: number, theUMax: number);

  // ExtremaPC_Curve.Perform (method)
  Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Curve.PerformWithEndpoints (method)
  PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Curve.IsInitialized (method)
  IsInitialized(): boolean;

  // ExtremaPC_Curve.delete (method)
  delete(): void;

  // ExtremaPC_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_DistanceFunction: declare class ExtremaPC_DistanceFunction

  // ExtremaPC_DistanceFunction.constructor (constructor)
  constructor(theCurve: Adaptor3d_Curve, theP: gp_Pnt);

  // ExtremaPC_DistanceFunction.Value (method)
  Value(theU: number, theF?: number): { returnValue: boolean; theF: number };

  // ExtremaPC_DistanceFunction.Values (method)
  Values(theU: number, theF?: number, theDF?: number): { returnValue: boolean; theF: number; theDF: number };

  // ExtremaPC_DistanceFunction.Derivative (method)
  Derivative(theU: number, theDF?: number): { returnValue: boolean; theDF: number };

  // ExtremaPC_DistanceFunction.FirstParameter (method)
  FirstParameter(): number;

  // ExtremaPC_DistanceFunction.LastParameter (method)
  LastParameter(): number;

  // ExtremaPC_DistanceFunction.Point (method)
  Point(): gp_Pnt;

  // ExtremaPC_DistanceFunction.Curve (method)
  Curve(): Adaptor3d_Curve;

  // ExtremaPC_DistanceFunction.delete (method)
  delete(): void;

  // ExtremaPC_DistanceFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_Ellipse: declare class ExtremaPC_Ellipse

  // ExtremaPC_Ellipse.constructor (constructor)
  constructor(theEllipse: gp_Elips);
  constructor(theEllipse: gp_Elips, theDomain: unknown);

  // ExtremaPC_Ellipse.Value (method)
  Value(theU: number): gp_Pnt;

  // ExtremaPC_Ellipse.IsBounded (method)
  IsBounded(): boolean;

  // ExtremaPC_Ellipse.Domain (method)
  Domain(): unknown;

  // ExtremaPC_Ellipse.Perform (method)
  Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Ellipse.PerformWithEndpoints (method)
  PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Ellipse.Ellipse (method)
  Ellipse(): gp_Elips;

  // ExtremaPC_Ellipse.delete (method)
  delete(): void;

  // ExtremaPC_Ellipse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_GridEvaluator: declare class ExtremaPC_GridEvaluator

  // ExtremaPC_GridEvaluator.constructor (constructor)
  constructor();

  // ExtremaPC_GridEvaluator.Grid (method)
  Grid(): any;

  // ExtremaPC_GridEvaluator.Result (method)
  Result(): ExtremaPC_Result;

  // ExtremaPC_GridEvaluator.Perform (method)
  Perform(theCurve: Adaptor3d_Curve, theP: gp_Pnt, theDomain: unknown, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_GridEvaluator.BuildUniformParams (method)
  static BuildUniformParams(theUMin: number, theUMax: number, theNbSamples: number): math_VectorBase_double;

  // ExtremaPC_GridEvaluator.delete (method)
  delete(): void;

  // ExtremaPC_GridEvaluator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_GridEvaluator_CandidateType: typeof ExtremaPC_GridEvaluator_CandidateType[keyof typeof ExtremaPC_GridEvaluator_CandidateType]

  readonly SignChange: 'SignChange'

  readonly NearZero: 'NearZero'

ExtremaPC_Hyperbola: declare class ExtremaPC_Hyperbola

  // ExtremaPC_Hyperbola.constructor (constructor)
  constructor(theHyperbola: gp_Hypr);
  constructor(theHyperbola: gp_Hypr, theDomain: unknown);

  // ExtremaPC_Hyperbola.Value (method)
  Value(theU: number): gp_Pnt;

  // ExtremaPC_Hyperbola.IsBounded (method)
  IsBounded(): boolean;

  // ExtremaPC_Hyperbola.Domain (method)
  Domain(): unknown;

  // ExtremaPC_Hyperbola.Perform (method)
  Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Hyperbola.PerformWithEndpoints (method)
  PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Hyperbola.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // ExtremaPC_Hyperbola.delete (method)
  delete(): void;

  // ExtremaPC_Hyperbola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_Line: declare class ExtremaPC_Line

  // ExtremaPC_Line.constructor (constructor)
  constructor(theLine: gp_Lin);
  constructor(theLine: gp_Lin, theDomain: unknown);

  // ExtremaPC_Line.Value (method)
  Value(theU: number): gp_Pnt;

  // ExtremaPC_Line.IsBounded (method)
  IsBounded(): boolean;

  // ExtremaPC_Line.Domain (method)
  Domain(): unknown;

  // ExtremaPC_Line.Perform (method)
  Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Line.PerformWithEndpoints (method)
  PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Line.Line (method)
  Line(): gp_Lin;

  // ExtremaPC_Line.delete (method)
  delete(): void;

  // ExtremaPC_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_OffsetCurve: declare class ExtremaPC_OffsetCurve

  // ExtremaPC_OffsetCurve.constructor (constructor)
  constructor(theCurve: Adaptor3d_Curve);
  constructor(theCurve: Adaptor3d_Curve, theDomain: unknown);

  // ExtremaPC_OffsetCurve.Value (method)
  Value(theU: number): gp_Pnt;

  // ExtremaPC_OffsetCurve.IsBounded (method)
  IsBounded(): boolean;

  // ExtremaPC_OffsetCurve.Domain (method)
  Domain(): unknown;

  // ExtremaPC_OffsetCurve.Perform (method)
  Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_OffsetCurve.PerformWithEndpoints (method)
  PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_OffsetCurve.delete (method)
  delete(): void;

  // ExtremaPC_OffsetCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_OtherCurve: declare class ExtremaPC_OtherCurve

  // ExtremaPC_OtherCurve.constructor (constructor)
  constructor(theCurve: Adaptor3d_Curve);
  constructor(theCurve: Adaptor3d_Curve, theDomain: unknown);

  // ExtremaPC_OtherCurve.Value (method)
  Value(theU: number): gp_Pnt;

  // ExtremaPC_OtherCurve.IsBounded (method)
  IsBounded(): boolean;

  // ExtremaPC_OtherCurve.Domain (method)
  Domain(): unknown;

  // ExtremaPC_OtherCurve.Perform (method)
  Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_OtherCurve.PerformWithEndpoints (method)
  PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_OtherCurve.delete (method)
  delete(): void;

  // ExtremaPC_OtherCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_Parabola: declare class ExtremaPC_Parabola

  // ExtremaPC_Parabola.constructor (constructor)
  constructor(theParabola: gp_Parab);
  constructor(theParabola: gp_Parab, theDomain: unknown);

  // ExtremaPC_Parabola.Value (method)
  Value(theU: number): gp_Pnt;

  // ExtremaPC_Parabola.IsBounded (method)
  IsBounded(): boolean;

  // ExtremaPC_Parabola.Domain (method)
  Domain(): unknown;

  // ExtremaPC_Parabola.Perform (method)
  Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Parabola.PerformWithEndpoints (method)
  PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

  // ExtremaPC_Parabola.Parabola (method)
  Parabola(): gp_Parab;

  // ExtremaPC_Parabola.delete (method)
  delete(): void;

  // ExtremaPC_Parabola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExtremaPC_GridEvaluator_GridPoint: interface ExtremaPC_GridEvaluator_GridPoint

  Param: number

  Point: gp_Pnt

  D1: gp_Vec

ExtremaPC_GridEvaluator_Candidate: interface ExtremaPC_GridEvaluator_Candidate

  Type: ExtremaPC_GridEvaluator_CandidateType

  IdxLo: number

  IdxHi: number

  StartU: number
