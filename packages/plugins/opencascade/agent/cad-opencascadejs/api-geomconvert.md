# libcascade — GeomConvert

16 top-level symbols. Signatures are verbatim typescript.

GeomConvert: declare class GeomConvert

constructor

static SplitBSplineCurve(C: Geom_BSplineCurve, FromK1: number, ToK2: number, SameOrientation: boolean): Geom_BSplineCurve;
static SplitBSplineCurve(C: Geom_BSplineCurve, FromU1: number, ToU2: number, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineCurve;
static SplitBSplineCurve(C: Geom_BSplineCurve, FromK1: number, ToK2: number, SameOrientation: boolean): Geom_BSplineCurve;
static SplitBSplineCurve(C: Geom_BSplineCurve, FromU1: number, ToU2: number, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineCurve;

static SplitBSplineSurface(S: Geom_BSplineSurface, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromK1: number, ToK2: number, USplit: boolean, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromU1: number, ToU2: number, FromV1: number, ToV2: number, ParametricTolerance: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromParam1: number, ToParam2: number, USplit: boolean, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromK1: number, ToK2: number, USplit: boolean, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromU1: number, ToU2: number, FromV1: number, ToV2: number, ParametricTolerance: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromParam1: number, ToParam2: number, USplit: boolean, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromK1: number, ToK2: number, USplit: boolean, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromU1: number, ToU2: number, FromV1: number, ToV2: number, ParametricTolerance: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromParam1: number, ToParam2: number, USplit: boolean, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromK1: number, ToK2: number, USplit: boolean, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromU1: number, ToU2: number, FromV1: number, ToV2: number, ParametricTolerance: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromParam1: number, ToParam2: number, USplit: boolean, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineSurface;

static CurveToBSplineCurve(C: Geom_Curve, Parameterisation?: Convert_ParameterisationType): Geom_BSplineCurve;

static SurfaceToBSplineSurface(S: Geom_Surface): Geom_BSplineSurface;

static ConcatG1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };

static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number, AngularTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number, AngularTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };

static C0BSplineToC1BSplineCurve(tolerance: number, AngularTolerance: number): { BS: Geom_BSplineCurve; [Symbol.dispose](): void };

static C0BSplineToArrayOfC1BSplineCurve(BS: Geom_BSplineCurve, tolerance: number): { tabBS: NCollection_HArray1_handle_Geom_BSplineCurve; [Symbol.dispose](): void };
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom_BSplineCurve, AngularTolerance: number, tolerance: number): { tabBS: NCollection_HArray1_handle_Geom_BSplineCurve; [Symbol.dispose](): void };
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom_BSplineCurve, tolerance: number): { tabBS: NCollection_HArray1_handle_Geom_BSplineCurve; [Symbol.dispose](): void };
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom_BSplineCurve, AngularTolerance: number, tolerance: number): { tabBS: NCollection_HArray1_handle_Geom_BSplineCurve; [Symbol.dispose](): void };

delete(): void;

[Symbol.dispose](): void;

GeomConvert_ApproxCurve: declare class GeomConvert_ApproxCurve

constructor

Curve(): Geom_BSplineCurve;

IsDone(): boolean;

HasResult(): boolean;

MaxError(): number;

delete(): void;

[Symbol.dispose](): void;

GeomConvert_ApproxSurface: declare class GeomConvert_ApproxSurface

constructor

Surface(): Geom_BSplineSurface;

IsDone(): boolean;

HasResult(): boolean;

MaxError(): number;

delete(): void;

[Symbol.dispose](): void;

GeomConvert_BSplineCurveKnotSplitting: declare class GeomConvert_BSplineCurveKnotSplitting

constructor

NbSplits(): number;

Splitting(SplitValues: NCollection_Array1_int): void;

SplitValue(Index: number): number;

delete(): void;

[Symbol.dispose](): void;

GeomConvert_BSplineCurveToBezierCurve: declare class GeomConvert_BSplineCurveToBezierCurve

constructor

Arc(Index: number): Geom_BezierCurve;

Arcs(Curves: NCollection_Array1_handle_Geom_BezierCurve): void;

Knots(TKnots: NCollection_Array1_double): void;

NbArcs(): number;

delete(): void;

[Symbol.dispose](): void;

GeomConvert_BSplineSurfaceKnotSplitting: declare class GeomConvert_BSplineSurfaceKnotSplitting

constructor

NbUSplits(): number;

NbVSplits(): number;

Splitting(USplit: NCollection_Array1_int, VSplit: NCollection_Array1_int): void;

USplitValue(UIndex: number): number;

VSplitValue(VIndex: number): number;

delete(): void;

[Symbol.dispose](): void;

GeomConvert_BSplineSurfaceToBezierSurface: declare class GeomConvert_BSplineSurfaceToBezierSurface

constructor

Patch(UIndex: number, VIndex: number): Geom_BezierSurface;

Patches(Surfaces: NCollection_Array2_handle_Geom_BezierSurface): void;

UKnots(TKnots: NCollection_Array1_double): void;

VKnots(TKnots: NCollection_Array1_double): void;

NbUPatches(): number;

NbVPatches(): number;

delete(): void;

[Symbol.dispose](): void;

GeomConvert_CompBezierSurfacesToBSplineSurface: declare class GeomConvert_CompBezierSurfacesToBSplineSurface

constructor

NbUKnots(): number;

NbUPoles(): number;

NbVKnots(): number;

NbVPoles(): number;

Poles(): NCollection_HArray2_gp_Pnt;

UKnots(): NCollection_HArray1_double;

UDegree(): number;

VKnots(): NCollection_HArray1_double;

VDegree(): number;

UMultiplicities(): NCollection_HArray1_int;

VMultiplicities(): NCollection_HArray1_int;

IsDone(): boolean;

delete(): void;

[Symbol.dispose](): void;

GeomConvert_CompCurveToBSplineCurve: declare class GeomConvert_CompCurveToBSplineCurve

constructor

Add(NewCurve: Geom_BoundedCurve, Tolerance: number, After: boolean, WithRatio: boolean, MinM: number): boolean;

BSplineCurve(): Geom_BSplineCurve;

Clear(): void;

delete(): void;

[Symbol.dispose](): void;

GeomConvert_ConvType: typeof GeomConvert_ConvType[keyof typeof GeomConvert_ConvType]

GeomConvert_CurveToAnaCurve: declare class GeomConvert_CurveToAnaCurve

constructor

Init(C: Geom_Curve): void;

ConvertToAnalytical(theTol: number, F: number, L: number, newF?: number, newL?: number): { returnValue: boolean; theResultCurve: Geom_Curve; newF: number; newL: number; [Symbol.dispose](): void };

static ComputeCurve(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf: number, cl: number, theGap: number, theCurvType: GeomConvert_ConvType, theTarget: GeomAbs_CurveType): { returnValue: Geom_Curve; cf: number; cl: number; theGap: number; [Symbol.dispose](): void };

static ComputeCircle(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf?: number, cl?: number, Deviation?: number): { returnValue: Geom_Curve; cf: number; cl: number; Deviation: number; [Symbol.dispose](): void };

static ComputeEllipse(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf?: number, cl?: number, Deviation?: number): { returnValue: Geom_Curve; cf: number; cl: number; Deviation: number; [Symbol.dispose](): void };

static ComputeLine(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf?: number, cl?: number, Deviation?: number): { returnValue: Geom_Line; cf: number; cl: number; Deviation: number; [Symbol.dispose](): void };

static IsLinear(aPoints: NCollection_Array1_gp_Pnt, tolerance: number, Deviation?: number): { returnValue: boolean; Deviation: number };

static GetLine(P1: gp_Pnt, P2: gp_Pnt, cf?: number, cl?: number): { returnValue: gp_Lin; cf: number; cl: number; [Symbol.dispose](): void };

static GetCircle(Circ: gp_Circ, P0: gp_Pnt, P1: gp_Pnt, P2: gp_Pnt): boolean;

Gap(): number;

GetConvType(): GeomConvert_ConvType;

SetConvType(theConvType: GeomConvert_ConvType): void;

GetTarget(): GeomAbs_CurveType;

SetTarget(theTarget: GeomAbs_CurveType): void;

delete(): void;

[Symbol.dispose](): void;

GeomConvert_FuncConeLSDist: declare class GeomConvert_FuncConeLSDist extends math_MultipleVarFunction

constructor

SetPoints(thePoints: NCollection_HArray1_gp_XYZ): void;

SetDir(theDir: gp_Dir): void;

NbVariables(): number;

Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

delete(): void;

[Symbol.dispose](): void;

GeomConvert_FuncCylinderLSDist: declare class GeomConvert_FuncCylinderLSDist extends math_MultipleVarFunctionWithGradient

constructor

SetPoints(thePoints: NCollection_HArray1_gp_XYZ): void;

SetDir(theDir: gp_Dir): void;

NbVariables(): number;

Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

delete(): void;

[Symbol.dispose](): void;

GeomConvert_FuncSphereLSDist: declare class GeomConvert_FuncSphereLSDist extends math_MultipleVarFunctionWithGradient

constructor

SetPoints(thePoints: NCollection_HArray1_gp_XYZ): void;

NbVariables(): number;

Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

delete(): void;

[Symbol.dispose](): void;

GeomConvert_SurfToAnaSurf: declare class GeomConvert_SurfToAnaSurf

constructor

Init(S: Geom_Surface): void;

SetConvType(theConvType?: GeomConvert_ConvType): void;

SetTarget(theSurfType?: GeomAbs_SurfaceType): void;

Gap(): number;

ConvertToAnalytical(InitialToler: number): Geom_Surface;
ConvertToAnalytical(InitialToler: number, Umin: number, Umax: number, Vmin: number, Vmax: number): Geom_Surface;
ConvertToAnalytical(InitialToler: number): Geom_Surface;
ConvertToAnalytical(InitialToler: number, Umin: number, Umax: number, Vmin: number, Vmax: number): Geom_Surface;

static IsSame(S1: Geom_Surface, S2: Geom_Surface, tol: number): boolean;

static IsCanonical(S: Geom_Surface): boolean;

delete(): void;

[Symbol.dispose](): void;

GeomConvert_Units: declare class GeomConvert_Units

constructor

static RadianToDegree(theCurve: Geom2d_Curve, theSurface: Geom_Surface, theLengthFactor: number, theFactorRadianDegree: number): Geom2d_Curve;

static DegreeToRadian(theCurve: Geom2d_Curve, theSurface: Geom_Surface, theLengthFactor: number, theFactorRadianDegree: number): Geom2d_Curve;

static MirrorPCurve(theCurve: Geom2d_Curve): Geom2d_Curve;

delete(): void;

[Symbol.dispose](): void;
