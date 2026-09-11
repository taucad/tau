# libcascade — Geom

6 top-level symbols. Signatures are verbatim typescript.

Geom_Axis1Placement: declare class Geom_Axis1Placement extends Geom_AxisPlacement

constructor

Ax1(): gp_Ax1;

Reverse(): void;

Reversed(): Geom_Axis1Placement;

SetDirection(V: gp_Dir): void;

Transform(T: gp_Trsf): void;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_Axis2Placement: declare class Geom_Axis2Placement extends Geom_AxisPlacement

constructor

SetAx2(A2: gp_Ax2): void;

SetDirection(V: gp_Dir): void;

SetXDirection(Vx: gp_Dir): void;

SetYDirection(Vy: gp_Dir): void;

Ax2(): gp_Ax2;

XDirection(): gp_Dir;

YDirection(): gp_Dir;

Transform(T: gp_Trsf): void;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_AxisPlacement: declare class Geom_AxisPlacement extends Geom_Geometry

SetAxis(A1: gp_Ax1): void;

SetDirection(V: gp_Dir): void;

SetLocation(P: gp_Pnt): void;

Angle(Other: Geom_AxisPlacement): number;

Axis(): gp_Ax1;

Direction(): gp_Dir;

Location(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_BSplineCurve: declare class Geom_BSplineCurve extends Geom_BoundedCurve

constructor

HasEvalRepresentation(): boolean;

EvalRepresentation(): GeomEval_RepCurveDesc_Base;

SetEvalRepresentation(theDesc: GeomEval_RepCurveDesc_Base): void;

ClearEvalRepresentation(): void;

IncreaseDegree(Degree: number): void;

IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;
IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;

IncrementMultiplicity(I1: number, I2: number, M: number): void;

InsertKnot(U: number, M?: number, ParametricTolerance?: number, Add?: boolean): void;

InsertKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

RemoveKnot(Index: number, M: number, Tolerance: number): boolean;

Reverse(): void;

ReversedParameter(U: number): number;

Segment(U1: number, U2: number, theTolerance?: number): void;

SetKnot(Index: number, K: number): void;
SetKnot(Index: number, K: number, M: number): void;
SetKnot(Index: number, K: number): void;
SetKnot(Index: number, K: number, M: number): void;

SetKnots(K: NCollection_Array1_double): void;

PeriodicNormalization(U?: number): { U: number };

SetPeriodic(): void;

SetOrigin(Index: number): void;
SetOrigin(U: number, Tol: number): void;
SetOrigin(Index: number): void;
SetOrigin(U: number, Tol: number): void;

SetNotPeriodic(): void;

SetPole(Index: number, P: gp_Pnt): void;
SetPole(Index: number, P: gp_Pnt, Weight: number): void;
SetPole(Index: number, P: gp_Pnt): void;
SetPole(Index: number, P: gp_Pnt, Weight: number): void;

SetWeight(Index: number, Weight: number): void;

MovePoint(U: number, P: gp_Pnt, Index1: number, Index2: number, FirstModifiedPole?: number, LastModifiedPole?: number): { FirstModifiedPole: number; LastModifiedPole: number };

MovePointAndTangent(U: number, P: gp_Pnt, Tangent: gp_Vec, Tolerance: number, StartingCondition: number, EndingCondition: number, ErrorStatus?: number): { ErrorStatus: number };

IsCN(N: number): boolean;

IsG1(theTf: number, theTl: number, theAngTol: number): boolean;

IsClosed(): boolean;

IsPeriodic(): boolean;

IsRational(): boolean;

Continuity(): GeomAbs_Shape;

Degree(): number;

EvalD0(U: number): gp_Pnt;

EvalD1(U: number): Geom_Curve_ResD1;

EvalD2(U: number): Geom_Curve_ResD2;

EvalD3(U: number): Geom_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec;

LocalValue(U: number, FromK1: number, ToK2: number): gp_Pnt;

LocalD0(U: number, FromK1: number, ToK2: number, P: gp_Pnt): void;

LocalD1(U: number, FromK1: number, ToK2: number, P: gp_Pnt, V1: gp_Vec): void;

LocalD2(U: number, FromK1: number, ToK2: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

LocalD3(U: number, FromK1: number, ToK2: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

LocalDN(U: number, FromK1: number, ToK2: number, N: number): gp_Vec;

EndPoint(): gp_Pnt;

FirstUKnotIndex(): number;

FirstParameter(): number;

Knot(Index: number): number;

// DEPRECATED
Knots(K: NCollection_Array1_double): void;
Knots(): NCollection_Array1_double;
Knots(K: NCollection_Array1_double): void;
Knots(): NCollection_Array1_double;

// DEPRECATED
KnotSequence(K: NCollection_Array1_double): void;
KnotSequence(): NCollection_Array1_double;
KnotSequence(K: NCollection_Array1_double): void;
KnotSequence(): NCollection_Array1_double;

KnotDistribution(): GeomAbs_BSplKnotDistribution;

LastUKnotIndex(): number;

LastParameter(): number;

LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

Multiplicity(Index: number): number;

// DEPRECATED
Multiplicities(M: NCollection_Array1_int): void;
Multiplicities(): NCollection_Array1_int;
Multiplicities(M: NCollection_Array1_int): void;
Multiplicities(): NCollection_Array1_int;

NbKnots(): number;

NbPoles(): number;

Pole(Index: number): gp_Pnt;

// DEPRECATED
Poles(P: NCollection_Array1_gp_Pnt): void;
Poles(): NCollection_Array1_gp_Pnt;
Poles(P: NCollection_Array1_gp_Pnt): void;
Poles(): NCollection_Array1_gp_Pnt;

StartPoint(): gp_Pnt;

Weight(Index: number): number;

// DEPRECATED
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;

WeightsArray(): NCollection_Array1_double;

Transform(T: gp_Trsf): void;

static MaxDegree(): number;

Resolution(Tolerance3D: number, UTolerance?: number): { UTolerance: number };

Copy(): Geom_Geometry;

IsEqual(theOther: Geom_BSplineCurve, thePreci: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_BSplineSurface: declare class Geom_BSplineSurface extends Geom_BoundedSurface

constructor

HasEvalRepresentation(): boolean;

EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

ClearEvalRepresentation(): void;

ExchangeUV(): void;

SetUPeriodic(): void;

SetVPeriodic(): void;

PeriodicNormalization(U?: number, V?: number): { U: number; V: number };

SetUOrigin(Index: number): void;

SetVOrigin(Index: number): void;

SetUNotPeriodic(): void;

SetVNotPeriodic(): void;

UReverse(): void;

VReverse(): void;

UReversedParameter(U: number): number;

VReversedParameter(V: number): number;

IncreaseDegree(UDegree: number, VDegree: number): void;

InsertUKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

InsertVKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

RemoveUKnot(Index: number, M: number, Tolerance: number): boolean;

RemoveVKnot(Index: number, M: number, Tolerance: number): boolean;

IncreaseUMultiplicity(UIndex: number, M: number): void;
IncreaseUMultiplicity(FromI1: number, ToI2: number, M: number): void;
IncreaseUMultiplicity(UIndex: number, M: number): void;
IncreaseUMultiplicity(FromI1: number, ToI2: number, M: number): void;

IncrementUMultiplicity(FromI1: number, ToI2: number, Step: number): void;

IncreaseVMultiplicity(VIndex: number, M: number): void;
IncreaseVMultiplicity(FromI1: number, ToI2: number, M: number): void;
IncreaseVMultiplicity(VIndex: number, M: number): void;
IncreaseVMultiplicity(FromI1: number, ToI2: number, M: number): void;

IncrementVMultiplicity(FromI1: number, ToI2: number, Step: number): void;

InsertUKnot(U: number, M: number, ParametricTolerance: number, Add?: boolean): void;

InsertVKnot(V: number, M: number, ParametricTolerance: number, Add?: boolean): void;

Segment(U1: number, U2: number, V1: number, V2: number, theUTolerance?: number, theVTolerance?: number): void;

CheckAndSegment(U1: number, U2: number, V1: number, V2: number, theUTolerance?: number, theVTolerance?: number): void;

SetUKnot(UIndex: number, K: number): void;
SetUKnot(UIndex: number, K: number, M: number): void;
SetUKnot(UIndex: number, K: number): void;
SetUKnot(UIndex: number, K: number, M: number): void;

SetUKnots(UK: NCollection_Array1_double): void;

SetVKnot(VIndex: number, K: number): void;
SetVKnot(VIndex: number, K: number, M: number): void;
SetVKnot(VIndex: number, K: number): void;
SetVKnot(VIndex: number, K: number, M: number): void;

SetVKnots(VK: NCollection_Array1_double): void;

LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

LocateV(V: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

SetPole(UIndex: number, VIndex: number, P: gp_Pnt): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt, Weight: number): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt, Weight: number): void;

SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;

SetWeight(UIndex: number, VIndex: number, Weight: number): void;

SetWeightCol(VIndex: number, CPoleWeights: NCollection_Array1_double): void;

SetWeightRow(UIndex: number, CPoleWeights: NCollection_Array1_double): void;

MovePoint(U: number, V: number, P: gp_Pnt, UIndex1: number, UIndex2: number, VIndex1: number, VIndex2: number, UFirstIndex?: number, ULastIndex?: number, VFirstIndex?: number, VLastIndex?: number): { UFirstIndex: number; ULastIndex: number; VFirstIndex: number; VLastIndex: number };

IsUClosed(): boolean;

IsVClosed(): boolean;

IsCNu(N: number): boolean;

IsCNv(N: number): boolean;

IsUPeriodic(): boolean;

IsURational(): boolean;

IsVPeriodic(): boolean;

IsVRational(): boolean;

Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

Continuity(): GeomAbs_Shape;

FirstUKnotIndex(): number;

FirstVKnotIndex(): number;

LastUKnotIndex(): number;

LastVKnotIndex(): number;

NbUKnots(): number;

NbUPoles(): number;

NbVKnots(): number;

NbVPoles(): number;

Pole(UIndex: number, VIndex: number): gp_Pnt;

// DEPRECATED
Poles(P: NCollection_Array2_gp_Pnt): void;
Poles(): NCollection_Array2_gp_Pnt;
Poles(P: NCollection_Array2_gp_Pnt): void;
Poles(): NCollection_Array2_gp_Pnt;

UDegree(): number;

UKnot(UIndex: number): number;

UKnotDistribution(): GeomAbs_BSplKnotDistribution;

// DEPRECATED
UKnots(Ku: NCollection_Array1_double): void;
UKnots(): NCollection_Array1_double;
UKnots(Ku: NCollection_Array1_double): void;
UKnots(): NCollection_Array1_double;

// DEPRECATED
UKnotSequence(Ku: NCollection_Array1_double): void;
UKnotSequence(): NCollection_Array1_double;
UKnotSequence(Ku: NCollection_Array1_double): void;
UKnotSequence(): NCollection_Array1_double;

UMultiplicity(UIndex: number): number;

// DEPRECATED
UMultiplicities(Mu: NCollection_Array1_int): void;
UMultiplicities(): NCollection_Array1_int;
UMultiplicities(Mu: NCollection_Array1_int): void;
UMultiplicities(): NCollection_Array1_int;

VDegree(): number;

VKnot(VIndex: number): number;

VKnotDistribution(): GeomAbs_BSplKnotDistribution;

// DEPRECATED
VKnots(Kv: NCollection_Array1_double): void;
VKnots(): NCollection_Array1_double;
VKnots(Kv: NCollection_Array1_double): void;
VKnots(): NCollection_Array1_double;

// DEPRECATED
VKnotSequence(Kv: NCollection_Array1_double): void;
VKnotSequence(): NCollection_Array1_double;
VKnotSequence(Kv: NCollection_Array1_double): void;
VKnotSequence(): NCollection_Array1_double;

VMultiplicity(VIndex: number): number;

// DEPRECATED
VMultiplicities(Mv: NCollection_Array1_int): void;
VMultiplicities(): NCollection_Array1_int;
VMultiplicities(Mv: NCollection_Array1_int): void;
VMultiplicities(): NCollection_Array1_int;

Weight(UIndex: number, VIndex: number): number;

// DEPRECATED
Weights(W: NCollection_Array2_double): void;
Weights(): NCollection_Array2_double;
Weights(W: NCollection_Array2_double): void;
Weights(): NCollection_Array2_double;

WeightsArray(): NCollection_Array2_double;

EvalD0(U: number, V: number): gp_Pnt;

EvalD1(U: number, V: number): Geom_Surface_ResD1;

EvalD2(U: number, V: number): Geom_Surface_ResD2;

EvalD3(U: number, V: number): Geom_Surface_ResD3;

EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

LocalD0(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt): void;

LocalD1(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;

LocalD2(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec): void;

LocalD3(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec, D3U: gp_Vec, D3V: gp_Vec, D3UUV: gp_Vec, D3UVV: gp_Vec): void;

LocalDN(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, Nu: number, Nv: number): gp_Vec;

LocalValue(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number): gp_Pnt;

UIso(U: number): Geom_Curve;
UIso(U: number, CheckRational: boolean): Geom_Curve;
UIso(U: number): Geom_Curve;
UIso(U: number, CheckRational: boolean): Geom_Curve;

VIso(V: number): Geom_Curve;
VIso(V: number, CheckRational: boolean): Geom_Curve;
VIso(V: number): Geom_Curve;
VIso(V: number, CheckRational: boolean): Geom_Curve;

Transform(T: gp_Trsf): void;

static MaxDegree(): number;

Resolution(Tolerance3D: number, UTolerance?: number, VTolerance?: number): { UTolerance: number; VTolerance: number };

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_BezierCurve: declare class Geom_BezierCurve extends Geom_BoundedCurve

constructor

HasEvalRepresentation(): boolean;

EvalRepresentation(): GeomEval_RepCurveDesc_Base;

SetEvalRepresentation(theDesc: GeomEval_RepCurveDesc_Base): void;

ClearEvalRepresentation(): void;

Increase(Degree: number): void;

InsertPoleAfter(Index: number, P: gp_Pnt): void;
InsertPoleAfter(Index: number, P: gp_Pnt, Weight: number): void;
InsertPoleAfter(Index: number, P: gp_Pnt): void;
InsertPoleAfter(Index: number, P: gp_Pnt, Weight: number): void;

InsertPoleBefore(Index: number, P: gp_Pnt): void;
InsertPoleBefore(Index: number, P: gp_Pnt, Weight: number): void;
InsertPoleBefore(Index: number, P: gp_Pnt): void;
InsertPoleBefore(Index: number, P: gp_Pnt, Weight: number): void;

RemovePole(Index: number): void;

Reverse(): void;

ReversedParameter(U: number): number;

Segment(U1: number, U2: number): void;

SetPole(Index: number, P: gp_Pnt): void;
SetPole(Index: number, P: gp_Pnt, Weight: number): void;
SetPole(Index: number, P: gp_Pnt): void;
SetPole(Index: number, P: gp_Pnt, Weight: number): void;

SetWeight(Index: number, Weight: number): void;

IsClosed(): boolean;

IsCN(N: number): boolean;

IsPeriodic(): boolean;

IsRational(): boolean;

Continuity(): GeomAbs_Shape;

Degree(): number;

EvalD0(U: number): gp_Pnt;

EvalD1(U: number): Geom_Curve_ResD1;

EvalD2(U: number): Geom_Curve_ResD2;

EvalD3(U: number): Geom_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec;

StartPoint(): gp_Pnt;

EndPoint(): gp_Pnt;

FirstParameter(): number;

LastParameter(): number;

NbPoles(): number;

Pole(Index: number): gp_Pnt;

// DEPRECATED
Poles(P: NCollection_Array1_gp_Pnt): void;
Poles(): NCollection_Array1_gp_Pnt;
Poles(P: NCollection_Array1_gp_Pnt): void;
Poles(): NCollection_Array1_gp_Pnt;

Weight(Index: number): number;

// DEPRECATED
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;

WeightsArray(): NCollection_Array1_double;

Transform(T: gp_Trsf): void;

static MaxDegree(): number;

Resolution(Tolerance3D: number, UTolerance?: number): { UTolerance: number };

Copy(): Geom_Geometry;

Knots(): NCollection_Array1_double;

Multiplicities(): NCollection_Array1_int;

KnotSequence(): NCollection_Array1_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
