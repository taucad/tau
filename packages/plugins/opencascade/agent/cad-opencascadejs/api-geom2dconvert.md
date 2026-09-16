# libcascade — Geom2dConvert

8 top-level symbols. Signatures are verbatim typescript.

Geom2dConvert: declare class Geom2dConvert

  constructor

  static SplitBSplineCurve(C: Geom2d_BSplineCurve, FromK1: number, ToK2: number, SameOrientation: boolean): Geom2d_BSplineCurve;
  static SplitBSplineCurve(C: Geom2d_BSplineCurve, FromU1: number, ToU2: number, ParametricTolerance: number, SameOrientation: boolean): Geom2d_BSplineCurve;
  static SplitBSplineCurve(C: Geom2d_BSplineCurve, FromK1: number, ToK2: number, SameOrientation: boolean): Geom2d_BSplineCurve;
  static SplitBSplineCurve(C: Geom2d_BSplineCurve, FromU1: number, ToU2: number, ParametricTolerance: number, SameOrientation: boolean): Geom2d_BSplineCurve;

  static CurveToBSplineCurve(C: Geom2d_Curve, Parameterisation?: Convert_ParameterisationType): Geom2d_BSplineCurve;

  static ConcatG1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };

  static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
  static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number, AngularTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
  static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
  static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number, AngularTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };

  static C0BSplineToC1BSplineCurve(Tolerance: number): { BS: Geom2d_BSplineCurve; [Symbol.dispose](): void };

  static C0BSplineToArrayOfC1BSplineCurve(BS: Geom2d_BSplineCurve, Tolerance: number): { tabBS: NCollection_HArray1_handle_Geom2d_BSplineCurve; [Symbol.dispose](): void };
  static C0BSplineToArrayOfC1BSplineCurve(BS: Geom2d_BSplineCurve, AngularTolerance: number, Tolerance: number): { tabBS: NCollection_HArray1_handle_Geom2d_BSplineCurve; [Symbol.dispose](): void };
  static C0BSplineToArrayOfC1BSplineCurve(BS: Geom2d_BSplineCurve, Tolerance: number): { tabBS: NCollection_HArray1_handle_Geom2d_BSplineCurve; [Symbol.dispose](): void };
  static C0BSplineToArrayOfC1BSplineCurve(BS: Geom2d_BSplineCurve, AngularTolerance: number, Tolerance: number): { tabBS: NCollection_HArray1_handle_Geom2d_BSplineCurve; [Symbol.dispose](): void };

  delete(): void;

  [Symbol.dispose](): void;

Geom2dConvert_ApproxArcsSegments: declare class Geom2dConvert_ApproxArcsSegments

  constructor

  GetResult(): NCollection_Sequence_handle_Geom2d_Curve;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dConvert_ApproxArcsSegments_Status: typeof Geom2dConvert_ApproxArcsSegments_Status[keyof typeof Geom2dConvert_ApproxArcsSegments_Status]

Geom2dConvert_ApproxCurve: declare class Geom2dConvert_ApproxCurve

  constructor

  Curve(): Geom2d_BSplineCurve;

  IsDone(): boolean;

  HasResult(): boolean;

  MaxError(): number;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dConvert_BSplineCurveKnotSplitting: declare class Geom2dConvert_BSplineCurveKnotSplitting

  constructor

  NbSplits(): number;

  Splitting(SplitValues: NCollection_Array1_int): void;

  SplitValue(Index: number): number;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dConvert_BSplineCurveToBezierCurve: declare class Geom2dConvert_BSplineCurveToBezierCurve

  constructor

  Arc(Index: number): Geom2d_BezierCurve;

  Arcs(Curves: NCollection_Array1_handle_Geom2d_BezierCurve): void;

  Knots(TKnots: NCollection_Array1_double): void;

  NbArcs(): number;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dConvert_CompCurveToBSplineCurve: declare class Geom2dConvert_CompCurveToBSplineCurve

  constructor

  Add(NewCurve: Geom2d_BoundedCurve, Tolerance: number, After: boolean): boolean;

  BSplineCurve(): Geom2d_BSplineCurve;

  Clear(): void;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dConvert_PPoint: declare class Geom2dConvert_PPoint

  constructor

  Dist(theOth: Geom2dConvert_PPoint): number;

  Parameter(): number;

  Point(): gp_XY;

  D1(): gp_XY;

  SetD1(theD1: gp_XY): void;

  delete(): void;

  [Symbol.dispose](): void;
