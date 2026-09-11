# libcascade — BSplSLib

3 top-level symbols. Signatures are verbatim typescript.

BSplSLib: declare class BSplSLib

constructor

static RationalDerivative(UDeg: number, VDeg: number, N: number, M: number, Ders: number, RDers: number, All: boolean): { Ders: number; RDers: number };

static D0(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt): void;

static D1(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, Degree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

static D2(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

static D3(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

static DN(U: number, V: number, Nu: number, Nv: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, Vn: gp_Vec): void;

static Iso(Param: number, IsU: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Degree: number, Periodic: boolean, CPoles: NCollection_Array1_gp_Pnt, CWeights: NCollection_Array1_double): void;

static Reverse(Poles: NCollection_Array2_gp_Pnt, Last: number, UDirection: boolean): void;
static Reverse(Weights: NCollection_Array2_double, Last: number, UDirection: boolean): void;
static Reverse(Poles: NCollection_Array2_gp_Pnt, Last: number, UDirection: boolean): void;
static Reverse(Weights: NCollection_Array2_double, Last: number, UDirection: boolean): void;

static HomogeneousD0(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, W: number, P: gp_Pnt): { W: number };

static HomogeneousD1(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, N: gp_Pnt, Nu: gp_Vec, Nv: gp_Vec, D?: number, Du?: number, Dv?: number): { D: number; Du: number; Dv: number };

static IsRational(Weights: NCollection_Array2_double, I1: number, I2: number, J1: number, J2: number, Epsilon?: number): boolean;

static SetPoles(Poles: NCollection_Array2_gp_Pnt, FP: NCollection_Array1_double, UDirection: boolean): void;
static SetPoles(Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, FP: NCollection_Array1_double, UDirection: boolean): void;
static SetPoles(Poles: NCollection_Array2_gp_Pnt, FP: NCollection_Array1_double, UDirection: boolean): void;
static SetPoles(Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, FP: NCollection_Array1_double, UDirection: boolean): void;

static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, UDirection: boolean): void;
static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UDirection: boolean): void;
static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, UDirection: boolean): void;
static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UDirection: boolean): void;

static MovePoint(U: number, V: number, Displ: gp_Vec, UIndex1: number, UIndex2: number, VIndex1: number, VIndex2: number, UDegree: number, VDegree: number, Rational: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UFirstIndex: number, ULastIndex: number, VFirstIndex: number, VLastIndex: number, NewPoles: NCollection_Array2_gp_Pnt): { UFirstIndex: number; ULastIndex: number; VFirstIndex: number; VLastIndex: number };

static InsertKnots(UDirection: boolean, Degree: number, Periodic: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, AddKnots: NCollection_Array1_double, AddMults: NCollection_Array1_int, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double, NewKnots: NCollection_Array1_double, NewMults: NCollection_Array1_int, Epsilon: number, Add: boolean): void;

static RemoveKnot(UDirection: boolean, Index: number, Mult: number, Degree: number, Periodic: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double, NewKnots: NCollection_Array1_double, NewMults: NCollection_Array1_int, Tolerance: number): boolean;

static IncreaseDegree(UDirection: boolean, Degree: number, NewDegree: number, Periodic: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double, NewKnots: NCollection_Array1_double, NewMults: NCollection_Array1_int): void;

static Unperiodize(UDirection: boolean, Degree: number, Mults: NCollection_Array1_int, Knots: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, NewMults: NCollection_Array1_int, NewKnots: NCollection_Array1_double, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double): void;

static NoWeights(): NCollection_Array2_double;

static BuildCache(U: number, V: number, USpanDomain: number, VSpanDomain: number, UPeriodicFlag: boolean, VPeriodicFlag: boolean, UDegree: number, VDegree: number, UIndex: number, VIndex: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, CachePoles: NCollection_Array2_gp_Pnt, CacheWeights: NCollection_Array2_double): void;
static BuildCache(theU: number, theV: number, theUSpanDomain: number, theVSpanDomain: number, theUPeriodic: boolean, theVPeriodic: boolean, theUDegree: number, theVDegree: number, theUIndex: number, theVIndex: number, theUFlatKnots: NCollection_Array1_double, theVFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array2_gp_Pnt, theWeights: NCollection_Array2_double, theCacheArray: NCollection_Array2_double): void;
static BuildCache(U: number, V: number, USpanDomain: number, VSpanDomain: number, UPeriodicFlag: boolean, VPeriodicFlag: boolean, UDegree: number, VDegree: number, UIndex: number, VIndex: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, CachePoles: NCollection_Array2_gp_Pnt, CacheWeights: NCollection_Array2_double): void;
static BuildCache(theU: number, theV: number, theUSpanDomain: number, theVSpanDomain: number, theUPeriodic: boolean, theVPeriodic: boolean, theUDegree: number, theVDegree: number, theUIndex: number, theVIndex: number, theUFlatKnots: NCollection_Array1_double, theVFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array2_gp_Pnt, theWeights: NCollection_Array2_double, theCacheArray: NCollection_Array2_double): void;

static CacheD0(U: number, V: number, UDegree: number, VDegree: number, UCacheParameter: number, VCacheParameter: number, USpanLenght: number, VSpanLength: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt): void;

static CoefsD0(U: number, V: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt): void;

static CacheD1(U: number, V: number, UDegree: number, VDegree: number, UCacheParameter: number, VCacheParameter: number, USpanLenght: number, VSpanLength: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec): void;

static CoefsD1(U: number, V: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec): void;

static CacheD2(U: number, V: number, UDegree: number, VDegree: number, UCacheParameter: number, VCacheParameter: number, USpanLenght: number, VSpanLength: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec, VecUU: gp_Vec, VecUV: gp_Vec, VecVV: gp_Vec): void;

static CoefsD2(U: number, V: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec, VecUU: gp_Vec, VecUV: gp_Vec, VecVV: gp_Vec): void;

static PolesCoefficients(Poles: NCollection_Array2_gp_Pnt, CachePoles: NCollection_Array2_gp_Pnt): void;

static Resolution(Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, Tolerance3D: number, UTolerance?: number, VTolerance?: number): { UTolerance: number; VTolerance: number };

static Interpolate(UDegree: number, VDegree: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UParameters: NCollection_Array1_double, VParameters: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, InversionProblem?: number): { InversionProblem: number };
static Interpolate(UDegree: number, VDegree: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UParameters: NCollection_Array1_double, VParameters: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, InversionProblem?: number): { InversionProblem: number };
static Interpolate(UDegree: number, VDegree: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UParameters: NCollection_Array1_double, VParameters: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, InversionProblem?: number): { InversionProblem: number };
static Interpolate(UDegree: number, VDegree: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UParameters: NCollection_Array1_double, VParameters: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, InversionProblem?: number): { InversionProblem: number };

static FunctionMultiply(Function: BSplSLib_EvaluatorFunction, UBSplineDegree: number, VBSplineDegree: number, UBSplineKnots: NCollection_Array1_double, VBSplineKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UNewDegree: number, VNewDegree: number, NewNumerator: NCollection_Array2_gp_Pnt, NewDenominator: NCollection_Array2_double, theStatus?: number): { theStatus: number };

static UnitWeights(theNbUPoles: number, theNbVPoles: number): NCollection_Array2_double;

delete(): void;

[Symbol.dispose](): void;

BSplSLib_Cache: declare class BSplSLib_Cache extends Standard_Transient

constructor

IsCacheValid(theParameterU: number, theParameterV: number): boolean;

BuildCache(theParameterU: number, theParameterV: number, theFlatKnotsU: NCollection_Array1_double, theFlatKnotsV: NCollection_Array1_double, thePoles: NCollection_Array2_gp_Pnt, theWeights?: NCollection_Array2_double): void;

D0(theU: number, theV: number, thePoint: gp_Pnt): void;

D1(theU: number, theV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec): void;

D2(theU: number, theV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec, theCurvatureU: gp_Vec, theCurvatureV: gp_Vec, theCurvatureUV: gp_Vec): void;

D0Local(theLocalU: number, theLocalV: number, thePoint: gp_Pnt): void;

D1Local(theLocalU: number, theLocalV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec): void;

D2Local(theLocalU: number, theLocalV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec, theCurvatureU: gp_Vec, theCurvatureV: gp_Vec, theCurvatureUV: gp_Vec): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BSplSLib_EvaluatorFunction: declare class BSplSLib_EvaluatorFunction

Evaluate(theDerivativeRequest: number, theUParameter: number, theVParameter: number, theResult: number, theErrorCode: number): { theResult: number; theErrorCode: number };

delete(): void;

[Symbol.dispose](): void;
