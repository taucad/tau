# libcascade — Geom2dConvert

8 top-level symbols. Signatures are verbatim typescript.

Geom2dConvert: declare class Geom2dConvert

  // Geom2dConvert.constructor (constructor)
  constructor();

  // Geom2dConvert.SplitBSplineCurve (method)
  static SplitBSplineCurve(C: Geom2d_BSplineCurve, FromK1: number, ToK2: number, SameOrientation: boolean): Geom2d_BSplineCurve;
  static SplitBSplineCurve(C: Geom2d_BSplineCurve, FromU1: number, ToU2: number, ParametricTolerance: number, SameOrientation: boolean): Geom2d_BSplineCurve;

  // Geom2dConvert.CurveToBSplineCurve (method)
  static CurveToBSplineCurve(C: Geom2d_Curve, Parameterisation?: Convert_ParameterisationType): Geom2d_BSplineCurve;

  // Geom2dConvert.ConcatG1 (method)
  static ConcatG1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };

  // Geom2dConvert.ConcatC1 (method)
  static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
  static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number, AngularTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };

  // Geom2dConvert.C0BSplineToC1BSplineCurve (method)
  static C0BSplineToC1BSplineCurve(Tolerance: number): { BS: Geom2d_BSplineCurve; [Symbol.dispose](): void };

  // Geom2dConvert.C0BSplineToArrayOfC1BSplineCurve (method)
  static C0BSplineToArrayOfC1BSplineCurve(BS: Geom2d_BSplineCurve, Tolerance: number): { tabBS: NCollection_HArray1_handle_Geom2d_BSplineCurve; [Symbol.dispose](): void };
  static C0BSplineToArrayOfC1BSplineCurve(BS: Geom2d_BSplineCurve, AngularTolerance: number, Tolerance: number): { tabBS: NCollection_HArray1_handle_Geom2d_BSplineCurve; [Symbol.dispose](): void };

  // Geom2dConvert.delete (method)
  delete(): void;

  // Geom2dConvert.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dConvert_ApproxArcsSegments: declare class Geom2dConvert_ApproxArcsSegments

  // Geom2dConvert_ApproxArcsSegments.constructor (constructor)
  constructor(theCurve: Adaptor2d_Curve2d, theTolerance: number, theAngleTol: number);

  // Geom2dConvert_ApproxArcsSegments.GetResult (method)
  GetResult(): NCollection_Sequence_handle_Geom2d_Curve;

  // Geom2dConvert_ApproxArcsSegments.delete (method)
  delete(): void;

  // Geom2dConvert_ApproxArcsSegments.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dConvert_ApproxArcsSegments_Status: typeof Geom2dConvert_ApproxArcsSegments_Status[keyof typeof Geom2dConvert_ApproxArcsSegments_Status]

  readonly StatusOK: 'StatusOK'

  readonly StatusNotDone: 'StatusNotDone'

  readonly StatusError: 'StatusError'

Geom2dConvert_ApproxCurve: declare class Geom2dConvert_ApproxCurve

  // Geom2dConvert_ApproxCurve.constructor (constructor)
  constructor(Curve: Geom2d_Curve, Tol2d: number, Order: GeomAbs_Shape, MaxSegments: number, MaxDegree: number);
  constructor(Curve: Adaptor2d_Curve2d, Tol2d: number, Order: GeomAbs_Shape, MaxSegments: number, MaxDegree: number);

  // Geom2dConvert_ApproxCurve.Curve (method)
  Curve(): Geom2d_BSplineCurve;

  // Geom2dConvert_ApproxCurve.IsDone (method)
  IsDone(): boolean;

  // Geom2dConvert_ApproxCurve.HasResult (method)
  HasResult(): boolean;

  // Geom2dConvert_ApproxCurve.MaxError (method)
  MaxError(): number;

  // Geom2dConvert_ApproxCurve.delete (method)
  delete(): void;

  // Geom2dConvert_ApproxCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dConvert_BSplineCurveKnotSplitting: declare class Geom2dConvert_BSplineCurveKnotSplitting

  // Geom2dConvert_BSplineCurveKnotSplitting.constructor (constructor)
  constructor(BasisCurve: Geom2d_BSplineCurve, ContinuityRange: number);

  // Geom2dConvert_BSplineCurveKnotSplitting.NbSplits (method)
  NbSplits(): number;

  // Geom2dConvert_BSplineCurveKnotSplitting.Splitting (method)
  Splitting(SplitValues: NCollection_Array1_int): void;

  // Geom2dConvert_BSplineCurveKnotSplitting.SplitValue (method)
  SplitValue(Index: number): number;

  // Geom2dConvert_BSplineCurveKnotSplitting.delete (method)
  delete(): void;

  // Geom2dConvert_BSplineCurveKnotSplitting.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dConvert_BSplineCurveToBezierCurve: declare class Geom2dConvert_BSplineCurveToBezierCurve

  // Geom2dConvert_BSplineCurveToBezierCurve.constructor (constructor)
  constructor(BasisCurve: Geom2d_BSplineCurve);
  constructor(BasisCurve: Geom2d_BSplineCurve, U1: number, U2: number, ParametricTolerance: number);

  // Geom2dConvert_BSplineCurveToBezierCurve.Arc (method)
  Arc(Index: number): Geom2d_BezierCurve;

  // Geom2dConvert_BSplineCurveToBezierCurve.Arcs (method)
  Arcs(Curves: NCollection_Array1_handle_Geom2d_BezierCurve): void;

  // Geom2dConvert_BSplineCurveToBezierCurve.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // Geom2dConvert_BSplineCurveToBezierCurve.NbArcs (method)
  NbArcs(): number;

  // Geom2dConvert_BSplineCurveToBezierCurve.delete (method)
  delete(): void;

  // Geom2dConvert_BSplineCurveToBezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dConvert_CompCurveToBSplineCurve: declare class Geom2dConvert_CompCurveToBSplineCurve

  // Geom2dConvert_CompCurveToBSplineCurve.constructor (constructor)
  constructor(Parameterisation?: Convert_ParameterisationType);
  constructor(BasisCurve: Geom2d_BoundedCurve, Parameterisation?: Convert_ParameterisationType);

  // Geom2dConvert_CompCurveToBSplineCurve.Add (method)
  Add(NewCurve: Geom2d_BoundedCurve, Tolerance: number, After: boolean): boolean;

  // Geom2dConvert_CompCurveToBSplineCurve.BSplineCurve (method)
  BSplineCurve(): Geom2d_BSplineCurve;

  // Geom2dConvert_CompCurveToBSplineCurve.Clear (method)
  Clear(): void;

  // Geom2dConvert_CompCurveToBSplineCurve.delete (method)
  delete(): void;

  // Geom2dConvert_CompCurveToBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dConvert_PPoint: declare class Geom2dConvert_PPoint

  // Geom2dConvert_PPoint.constructor (constructor)
  constructor();
  constructor(theParameter: number, theAdaptor: Adaptor2d_Curve2d);
  constructor(theParameter: number, thePoint: gp_XY, theD1: gp_XY);

  // Geom2dConvert_PPoint.Dist (method)
  Dist(theOth: Geom2dConvert_PPoint): number;

  // Geom2dConvert_PPoint.Parameter (method)
  Parameter(): number;

  // Geom2dConvert_PPoint.Point (method)
  Point(): gp_XY;

  // Geom2dConvert_PPoint.D1 (method)
  D1(): gp_XY;

  // Geom2dConvert_PPoint.SetD1 (method)
  SetD1(theD1: gp_XY): void;

  // Geom2dConvert_PPoint.delete (method)
  delete(): void;

  // Geom2dConvert_PPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
