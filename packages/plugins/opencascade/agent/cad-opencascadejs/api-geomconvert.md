# libcascade — GeomConvert

16 top-level symbols. Signatures are verbatim typescript.

GeomConvert: declare class GeomConvert

  // GeomConvert.constructor (constructor)
  constructor();

  // GeomConvert.SplitBSplineCurve (method)
  static SplitBSplineCurve(C: Geom_BSplineCurve, FromK1: number, ToK2: number, SameOrientation: boolean): Geom_BSplineCurve;
  static SplitBSplineCurve(C: Geom_BSplineCurve, FromU1: number, ToU2: number, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineCurve;

  // GeomConvert.SplitBSplineSurface (method)
  static SplitBSplineSurface(S: Geom_BSplineSurface, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
  static SplitBSplineSurface(S: Geom_BSplineSurface, FromK1: number, ToK2: number, USplit: boolean, SameOrientation: boolean): Geom_BSplineSurface;
  static SplitBSplineSurface(S: Geom_BSplineSurface, FromU1: number, ToU2: number, FromV1: number, ToV2: number, ParametricTolerance: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
  static SplitBSplineSurface(S: Geom_BSplineSurface, FromParam1: number, ToParam2: number, USplit: boolean, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineSurface;

  // GeomConvert.CurveToBSplineCurve (method)
  static CurveToBSplineCurve(C: Geom_Curve, Parameterisation?: Convert_ParameterisationType): Geom_BSplineCurve;

  // GeomConvert.SurfaceToBSplineSurface (method)
  static SurfaceToBSplineSurface(S: Geom_Surface): Geom_BSplineSurface;

  // GeomConvert.ConcatG1 (method)
  static ConcatG1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };

  // GeomConvert.ConcatC1 (method)
  static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
  static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number, AngularTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };

  // GeomConvert.C0BSplineToC1BSplineCurve (method)
  static C0BSplineToC1BSplineCurve(tolerance: number, AngularTolerance: number): { BS: Geom_BSplineCurve; [Symbol.dispose](): void };

  // GeomConvert.C0BSplineToArrayOfC1BSplineCurve (method)
  static C0BSplineToArrayOfC1BSplineCurve(BS: Geom_BSplineCurve, tolerance: number): { tabBS: NCollection_HArray1_handle_Geom_BSplineCurve; [Symbol.dispose](): void };
  static C0BSplineToArrayOfC1BSplineCurve(BS: Geom_BSplineCurve, AngularTolerance: number, tolerance: number): { tabBS: NCollection_HArray1_handle_Geom_BSplineCurve; [Symbol.dispose](): void };

  // GeomConvert.delete (method)
  delete(): void;

  // GeomConvert.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_ApproxCurve: declare class GeomConvert_ApproxCurve

  // GeomConvert_ApproxCurve.constructor (constructor)
  constructor(Curve: Geom_Curve, Tol3d: number, Order: GeomAbs_Shape, MaxSegments: number, MaxDegree: number);
  constructor(Curve: Adaptor3d_Curve, Tol3d: number, Order: GeomAbs_Shape, MaxSegments: number, MaxDegree: number);

  // GeomConvert_ApproxCurve.Curve (method)
  Curve(): Geom_BSplineCurve;

  // GeomConvert_ApproxCurve.IsDone (method)
  IsDone(): boolean;

  // GeomConvert_ApproxCurve.HasResult (method)
  HasResult(): boolean;

  // GeomConvert_ApproxCurve.MaxError (method)
  MaxError(): number;

  // GeomConvert_ApproxCurve.delete (method)
  delete(): void;

  // GeomConvert_ApproxCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_ApproxSurface: declare class GeomConvert_ApproxSurface

  // GeomConvert_ApproxSurface.constructor (constructor)
  constructor(Surf: Geom_Surface, Tol3d: number, UContinuity: GeomAbs_Shape, VContinuity: GeomAbs_Shape, MaxDegU: number, MaxDegV: number, MaxSegments: number, PrecisCode: number);
  constructor(Surf: Adaptor3d_Surface, Tol3d: number, UContinuity: GeomAbs_Shape, VContinuity: GeomAbs_Shape, MaxDegU: number, MaxDegV: number, MaxSegments: number, PrecisCode: number);

  // GeomConvert_ApproxSurface.Surface (method)
  Surface(): Geom_BSplineSurface;

  // GeomConvert_ApproxSurface.IsDone (method)
  IsDone(): boolean;

  // GeomConvert_ApproxSurface.HasResult (method)
  HasResult(): boolean;

  // GeomConvert_ApproxSurface.MaxError (method)
  MaxError(): number;

  // GeomConvert_ApproxSurface.delete (method)
  delete(): void;

  // GeomConvert_ApproxSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_BSplineCurveKnotSplitting: declare class GeomConvert_BSplineCurveKnotSplitting

  // GeomConvert_BSplineCurveKnotSplitting.constructor (constructor)
  constructor(BasisCurve: Geom_BSplineCurve, ContinuityRange: number);

  // GeomConvert_BSplineCurveKnotSplitting.NbSplits (method)
  NbSplits(): number;

  // GeomConvert_BSplineCurveKnotSplitting.Splitting (method)
  Splitting(SplitValues: NCollection_Array1_int): void;

  // GeomConvert_BSplineCurveKnotSplitting.SplitValue (method)
  SplitValue(Index: number): number;

  // GeomConvert_BSplineCurveKnotSplitting.delete (method)
  delete(): void;

  // GeomConvert_BSplineCurveKnotSplitting.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_BSplineCurveToBezierCurve: declare class GeomConvert_BSplineCurveToBezierCurve

  // GeomConvert_BSplineCurveToBezierCurve.constructor (constructor)
  constructor(BasisCurve: Geom_BSplineCurve);
  constructor(BasisCurve: Geom_BSplineCurve, U1: number, U2: number, ParametricTolerance: number);

  // GeomConvert_BSplineCurveToBezierCurve.Arc (method)
  Arc(Index: number): Geom_BezierCurve;

  // GeomConvert_BSplineCurveToBezierCurve.Arcs (method)
  Arcs(Curves: NCollection_Array1_handle_Geom_BezierCurve): void;

  // GeomConvert_BSplineCurveToBezierCurve.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // GeomConvert_BSplineCurveToBezierCurve.NbArcs (method)
  NbArcs(): number;

  // GeomConvert_BSplineCurveToBezierCurve.delete (method)
  delete(): void;

  // GeomConvert_BSplineCurveToBezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_BSplineSurfaceKnotSplitting: declare class GeomConvert_BSplineSurfaceKnotSplitting

  // GeomConvert_BSplineSurfaceKnotSplitting.constructor (constructor)
  constructor(BasisSurface: Geom_BSplineSurface, UContinuityRange: number, VContinuityRange: number);

  // GeomConvert_BSplineSurfaceKnotSplitting.NbUSplits (method)
  NbUSplits(): number;

  // GeomConvert_BSplineSurfaceKnotSplitting.NbVSplits (method)
  NbVSplits(): number;

  // GeomConvert_BSplineSurfaceKnotSplitting.Splitting (method)
  Splitting(USplit: NCollection_Array1_int, VSplit: NCollection_Array1_int): void;

  // GeomConvert_BSplineSurfaceKnotSplitting.USplitValue (method)
  USplitValue(UIndex: number): number;

  // GeomConvert_BSplineSurfaceKnotSplitting.VSplitValue (method)
  VSplitValue(VIndex: number): number;

  // GeomConvert_BSplineSurfaceKnotSplitting.delete (method)
  delete(): void;

  // GeomConvert_BSplineSurfaceKnotSplitting.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_BSplineSurfaceToBezierSurface: declare class GeomConvert_BSplineSurfaceToBezierSurface

  // GeomConvert_BSplineSurfaceToBezierSurface.constructor (constructor)
  constructor(BasisSurface: Geom_BSplineSurface);
  constructor(BasisSurface: Geom_BSplineSurface, U1: number, U2: number, V1: number, V2: number, ParametricTolerance: number);

  // GeomConvert_BSplineSurfaceToBezierSurface.Patch (method)
  Patch(UIndex: number, VIndex: number): Geom_BezierSurface;

  // GeomConvert_BSplineSurfaceToBezierSurface.Patches (method)
  Patches(Surfaces: NCollection_Array2_handle_Geom_BezierSurface): void;

  // GeomConvert_BSplineSurfaceToBezierSurface.UKnots (method)
  UKnots(TKnots: NCollection_Array1_double): void;

  // GeomConvert_BSplineSurfaceToBezierSurface.VKnots (method)
  VKnots(TKnots: NCollection_Array1_double): void;

  // GeomConvert_BSplineSurfaceToBezierSurface.NbUPatches (method)
  NbUPatches(): number;

  // GeomConvert_BSplineSurfaceToBezierSurface.NbVPatches (method)
  NbVPatches(): number;

  // GeomConvert_BSplineSurfaceToBezierSurface.delete (method)
  delete(): void;

  // GeomConvert_BSplineSurfaceToBezierSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_CompBezierSurfacesToBSplineSurface: declare class GeomConvert_CompBezierSurfacesToBSplineSurface

  // GeomConvert_CompBezierSurfacesToBSplineSurface.constructor (constructor)
  constructor(Beziers: NCollection_Array2_handle_Geom_BezierSurface);
  constructor(Beziers: NCollection_Array2_handle_Geom_BezierSurface, Tolerance: number, RemoveKnots?: boolean);
  constructor(Beziers: NCollection_Array2_handle_Geom_BezierSurface, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UContinuity?: GeomAbs_Shape, VContinuity?: GeomAbs_Shape, Tolerance?: number);

  // GeomConvert_CompBezierSurfacesToBSplineSurface.NbUKnots (method)
  NbUKnots(): number;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.NbUPoles (method)
  NbUPoles(): number;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.NbVKnots (method)
  NbVKnots(): number;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.NbVPoles (method)
  NbVPoles(): number;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.Poles (method)
  Poles(): NCollection_HArray2_gp_Pnt;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.UKnots (method)
  UKnots(): NCollection_HArray1_double;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.UDegree (method)
  UDegree(): number;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.VKnots (method)
  VKnots(): NCollection_HArray1_double;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.VDegree (method)
  VDegree(): number;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.UMultiplicities (method)
  UMultiplicities(): NCollection_HArray1_int;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.VMultiplicities (method)
  VMultiplicities(): NCollection_HArray1_int;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.IsDone (method)
  IsDone(): boolean;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.delete (method)
  delete(): void;

  // GeomConvert_CompBezierSurfacesToBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_CompCurveToBSplineCurve: declare class GeomConvert_CompCurveToBSplineCurve

  // GeomConvert_CompCurveToBSplineCurve.constructor (constructor)
  constructor(Parameterisation?: Convert_ParameterisationType);
  constructor(BasisCurve: Geom_BoundedCurve, Parameterisation?: Convert_ParameterisationType);

  // GeomConvert_CompCurveToBSplineCurve.Add (method)
  Add(NewCurve: Geom_BoundedCurve, Tolerance: number, After: boolean, WithRatio: boolean, MinM: number): boolean;

  // GeomConvert_CompCurveToBSplineCurve.BSplineCurve (method)
  BSplineCurve(): Geom_BSplineCurve;

  // GeomConvert_CompCurveToBSplineCurve.Clear (method)
  Clear(): void;

  // GeomConvert_CompCurveToBSplineCurve.delete (method)
  delete(): void;

  // GeomConvert_CompCurveToBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_ConvType: typeof GeomConvert_ConvType[keyof typeof GeomConvert_ConvType]

  readonly GeomConvert_Target: 'GeomConvert_Target'

  readonly GeomConvert_Simplest: 'GeomConvert_Simplest'

  readonly GeomConvert_MinGap: 'GeomConvert_MinGap'

GeomConvert_CurveToAnaCurve: declare class GeomConvert_CurveToAnaCurve

  // GeomConvert_CurveToAnaCurve.constructor (constructor)
  constructor();
  constructor(C: Geom_Curve);

  // GeomConvert_CurveToAnaCurve.Init (method)
  Init(C: Geom_Curve): void;

  // GeomConvert_CurveToAnaCurve.ConvertToAnalytical (method)
  ConvertToAnalytical(theTol: number, F: number, L: number, newF?: number, newL?: number): { returnValue: boolean; theResultCurve: Geom_Curve; newF: number; newL: number; [Symbol.dispose](): void };

  // GeomConvert_CurveToAnaCurve.ComputeCurve (method)
  static ComputeCurve(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf: number, cl: number, theGap: number, theCurvType: GeomConvert_ConvType, theTarget: GeomAbs_CurveType): { returnValue: Geom_Curve; cf: number; cl: number; theGap: number; [Symbol.dispose](): void };

  // GeomConvert_CurveToAnaCurve.ComputeCircle (method)
  static ComputeCircle(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf?: number, cl?: number, Deviation?: number): { returnValue: Geom_Curve; cf: number; cl: number; Deviation: number; [Symbol.dispose](): void };

  // GeomConvert_CurveToAnaCurve.ComputeEllipse (method)
  static ComputeEllipse(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf?: number, cl?: number, Deviation?: number): { returnValue: Geom_Curve; cf: number; cl: number; Deviation: number; [Symbol.dispose](): void };

  // GeomConvert_CurveToAnaCurve.ComputeLine (method)
  static ComputeLine(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf?: number, cl?: number, Deviation?: number): { returnValue: Geom_Line; cf: number; cl: number; Deviation: number; [Symbol.dispose](): void };

  // GeomConvert_CurveToAnaCurve.IsLinear (method)
  static IsLinear(aPoints: NCollection_Array1_gp_Pnt, tolerance: number, Deviation?: number): { returnValue: boolean; Deviation: number };

  // GeomConvert_CurveToAnaCurve.GetLine (method)
  static GetLine(P1: gp_Pnt, P2: gp_Pnt, cf?: number, cl?: number): { returnValue: gp_Lin; cf: number; cl: number; [Symbol.dispose](): void };

  // GeomConvert_CurveToAnaCurve.GetCircle (method)
  static GetCircle(Circ: gp_Circ, P0: gp_Pnt, P1: gp_Pnt, P2: gp_Pnt): boolean;

  // GeomConvert_CurveToAnaCurve.Gap (method)
  Gap(): number;

  // GeomConvert_CurveToAnaCurve.GetConvType (method)
  GetConvType(): GeomConvert_ConvType;

  // GeomConvert_CurveToAnaCurve.SetConvType (method)
  SetConvType(theConvType: GeomConvert_ConvType): void;

  // GeomConvert_CurveToAnaCurve.GetTarget (method)
  GetTarget(): GeomAbs_CurveType;

  // GeomConvert_CurveToAnaCurve.SetTarget (method)
  SetTarget(theTarget: GeomAbs_CurveType): void;

  // GeomConvert_CurveToAnaCurve.delete (method)
  delete(): void;

  // GeomConvert_CurveToAnaCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_FuncConeLSDist: declare class GeomConvert_FuncConeLSDist extends math_MultipleVarFunction

  // GeomConvert_FuncConeLSDist.constructor (constructor)
  constructor();
  constructor(thePoints: NCollection_HArray1_gp_XYZ, theDir: gp_Dir);

  // GeomConvert_FuncConeLSDist.SetPoints (method)
  SetPoints(thePoints: NCollection_HArray1_gp_XYZ): void;

  // GeomConvert_FuncConeLSDist.SetDir (method)
  SetDir(theDir: gp_Dir): void;

  // GeomConvert_FuncConeLSDist.NbVariables (method)
  NbVariables(): number;

  // GeomConvert_FuncConeLSDist.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // GeomConvert_FuncConeLSDist.delete (method)
  delete(): void;

  // GeomConvert_FuncConeLSDist.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_FuncCylinderLSDist: declare class GeomConvert_FuncCylinderLSDist extends math_MultipleVarFunctionWithGradient

  // GeomConvert_FuncCylinderLSDist.constructor (constructor)
  constructor();
  constructor(thePoints: NCollection_HArray1_gp_XYZ, theDir: gp_Dir);

  // GeomConvert_FuncCylinderLSDist.SetPoints (method)
  SetPoints(thePoints: NCollection_HArray1_gp_XYZ): void;

  // GeomConvert_FuncCylinderLSDist.SetDir (method)
  SetDir(theDir: gp_Dir): void;

  // GeomConvert_FuncCylinderLSDist.NbVariables (method)
  NbVariables(): number;

  // GeomConvert_FuncCylinderLSDist.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // GeomConvert_FuncCylinderLSDist.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // GeomConvert_FuncCylinderLSDist.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // GeomConvert_FuncCylinderLSDist.delete (method)
  delete(): void;

  // GeomConvert_FuncCylinderLSDist.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_FuncSphereLSDist: declare class GeomConvert_FuncSphereLSDist extends math_MultipleVarFunctionWithGradient

  // GeomConvert_FuncSphereLSDist.constructor (constructor)
  constructor();
  constructor(thePoints: NCollection_HArray1_gp_XYZ);

  // GeomConvert_FuncSphereLSDist.SetPoints (method)
  SetPoints(thePoints: NCollection_HArray1_gp_XYZ): void;

  // GeomConvert_FuncSphereLSDist.NbVariables (method)
  NbVariables(): number;

  // GeomConvert_FuncSphereLSDist.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // GeomConvert_FuncSphereLSDist.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // GeomConvert_FuncSphereLSDist.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // GeomConvert_FuncSphereLSDist.delete (method)
  delete(): void;

  // GeomConvert_FuncSphereLSDist.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_SurfToAnaSurf: declare class GeomConvert_SurfToAnaSurf

  // GeomConvert_SurfToAnaSurf.constructor (constructor)
  constructor();
  constructor(S: Geom_Surface);

  // GeomConvert_SurfToAnaSurf.Init (method)
  Init(S: Geom_Surface): void;

  // GeomConvert_SurfToAnaSurf.SetConvType (method)
  SetConvType(theConvType?: GeomConvert_ConvType): void;

  // GeomConvert_SurfToAnaSurf.SetTarget (method)
  SetTarget(theSurfType?: GeomAbs_SurfaceType): void;

  // GeomConvert_SurfToAnaSurf.Gap (method)
  Gap(): number;

  // GeomConvert_SurfToAnaSurf.ConvertToAnalytical (method)
  ConvertToAnalytical(InitialToler: number): Geom_Surface;
  ConvertToAnalytical(InitialToler: number, Umin: number, Umax: number, Vmin: number, Vmax: number): Geom_Surface;

  // GeomConvert_SurfToAnaSurf.IsSame (method)
  static IsSame(S1: Geom_Surface, S2: Geom_Surface, tol: number): boolean;

  // GeomConvert_SurfToAnaSurf.IsCanonical (method)
  static IsCanonical(S: Geom_Surface): boolean;

  // GeomConvert_SurfToAnaSurf.delete (method)
  delete(): void;

  // GeomConvert_SurfToAnaSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomConvert_Units: declare class GeomConvert_Units

  // GeomConvert_Units.constructor (constructor)
  constructor();

  // GeomConvert_Units.RadianToDegree (method)
  static RadianToDegree(theCurve: Geom2d_Curve, theSurface: Geom_Surface, theLengthFactor: number, theFactorRadianDegree: number): Geom2d_Curve;

  // GeomConvert_Units.DegreeToRadian (method)
  static DegreeToRadian(theCurve: Geom2d_Curve, theSurface: Geom_Surface, theLengthFactor: number, theFactorRadianDegree: number): Geom2d_Curve;

  // GeomConvert_Units.MirrorPCurve (method)
  static MirrorPCurve(theCurve: Geom2d_Curve): Geom2d_Curve;

  // GeomConvert_Units.delete (method)
  delete(): void;

  // GeomConvert_Units.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
