# libcascade — Geom (2)

16 top-level symbols. Signatures are verbatim typescript.

Geom_BezierSurface: declare class Geom_BezierSurface extends Geom_BoundedSurface

constructor

HasEvalRepresentation(): boolean;

EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

ClearEvalRepresentation(): void;

ExchangeUV(): void;

Increase(UDeg: number, VDeg: number): void;

InsertPoleColAfter(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleColAfter(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
InsertPoleColAfter(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleColAfter(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

InsertPoleColBefore(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleColBefore(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
InsertPoleColBefore(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleColBefore(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

InsertPoleRowAfter(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleRowAfter(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
InsertPoleRowAfter(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleRowAfter(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

InsertPoleRowBefore(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleRowBefore(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
InsertPoleRowBefore(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleRowBefore(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

RemovePoleCol(VIndex: number): void;

RemovePoleRow(UIndex: number): void;

Segment(U1: number, U2: number, V1: number, V2: number): void;

SetPole(UIndex: number, VIndex: number, P: gp_Pnt): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt, Weight: number): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt, Weight: number): void;

SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

SetWeight(UIndex: number, VIndex: number, Weight: number): void;

SetWeightCol(VIndex: number, CPoleWeights: NCollection_Array1_double): void;

SetWeightRow(UIndex: number, CPoleWeights: NCollection_Array1_double): void;

UReverse(): void;

UReversedParameter(U: number): number;

VReverse(): void;

VReversedParameter(V: number): number;

Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

Continuity(): GeomAbs_Shape;

EvalD0(U: number, V: number): gp_Pnt;

EvalD1(U: number, V: number): Geom_Surface_ResD1;

EvalD2(U: number, V: number): Geom_Surface_ResD2;

EvalD3(U: number, V: number): Geom_Surface_ResD3;

EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

NbUPoles(): number;

NbVPoles(): number;

Pole(UIndex: number, VIndex: number): gp_Pnt;

// DEPRECATED
Poles(P: NCollection_Array2_gp_Pnt): void;
Poles(): NCollection_Array2_gp_Pnt;
Poles(P: NCollection_Array2_gp_Pnt): void;
Poles(): NCollection_Array2_gp_Pnt;

UDegree(): number;

UIso(U: number): Geom_Curve;

VDegree(): number;

VIso(V: number): Geom_Curve;

Weight(UIndex: number, VIndex: number): number;

// DEPRECATED
Weights(W: NCollection_Array2_double): void;
Weights(): NCollection_Array2_double;
Weights(W: NCollection_Array2_double): void;
Weights(): NCollection_Array2_double;

WeightsArray(): NCollection_Array2_double;

IsUClosed(): boolean;

IsVClosed(): boolean;

IsCNu(N: number): boolean;

IsCNv(N: number): boolean;

IsUPeriodic(): boolean;

IsVPeriodic(): boolean;

IsURational(): boolean;

IsVRational(): boolean;

Transform(T: gp_Trsf): void;

static MaxDegree(): number;

Resolution(Tolerance3D: number, UTolerance?: number, VTolerance?: number): { UTolerance: number; VTolerance: number };

Copy(): Geom_Geometry;

UKnots(): NCollection_Array1_double;

VKnots(): NCollection_Array1_double;

UMultiplicities(): NCollection_Array1_int;

VMultiplicities(): NCollection_Array1_int;

UKnotSequence(): NCollection_Array1_double;

VKnotSequence(): NCollection_Array1_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_BoundedCurve: declare class Geom_BoundedCurve extends Geom_Curve

EndPoint(): gp_Pnt;

StartPoint(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_BoundedSurface: declare class Geom_BoundedSurface extends Geom_Surface

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_CartesianPoint: declare class Geom_CartesianPoint extends Geom_Point

constructor

SetCoord(X: number, Y: number, Z: number): void;

SetPnt(P: gp_Pnt): void;

SetX(X: number): void;

SetY(Y: number): void;

SetZ(Z: number): void;

Coord(X: number, Y: number, Z: number): { X: number; Y: number; Z: number };

Pnt(): gp_Pnt;

X(): number;

Y(): number;

Z(): number;

Transform(T: gp_Trsf): void;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_Circle: declare class Geom_Circle extends Geom_Conic

constructor

SetCirc(C: gp_Circ): void;

SetRadius(R: number): void;

Circ(): gp_Circ;

Radius(): number;

ReversedParameter(U: number): number;

Eccentricity(): number;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

EvalD0(U: number): gp_Pnt;

EvalD1(U: number): Geom_Curve_ResD1;

EvalD2(U: number): Geom_Curve_ResD2;

EvalD3(U: number): Geom_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec;

Transform(T: gp_Trsf): void;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_Conic: declare class Geom_Conic extends Geom_Curve

SetAxis(theA1: gp_Ax1): void;

SetLocation(theP: gp_Pnt): void;

SetPosition(theA2: gp_Ax2): void;

Axis(): gp_Ax1;

Location(): gp_Pnt;

Position(): gp_Ax2;

Eccentricity(): number;

XAxis(): gp_Ax1;

YAxis(): gp_Ax1;

Reverse(): void;

ReversedParameter(U: number): number;

Continuity(): GeomAbs_Shape;

IsCN(N: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_ConicalSurface: declare class Geom_ConicalSurface extends Geom_ElementarySurface

constructor

SetCone(C: gp_Cone): void;

SetRadius(R: number): void;

SetSemiAngle(Ang: number): void;

Cone(): gp_Cone;

UReversedParameter(U: number): number;

VReversedParameter(V: number): number;

VReverse(): void;

TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

Apex(): gp_Pnt;

Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

RefRadius(): number;

SemiAngle(): number;

IsUClosed(): boolean;

IsVClosed(): boolean;

IsUPeriodic(): boolean;

IsVPeriodic(): boolean;

UIso(U: number): Geom_Curve;

VIso(V: number): Geom_Curve;

EvalD0(U: number, V: number): gp_Pnt;

EvalD1(U: number, V: number): Geom_Surface_ResD1;

EvalD2(U: number, V: number): Geom_Surface_ResD2;

EvalD3(U: number, V: number): Geom_Surface_ResD3;

EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

Transform(T: gp_Trsf): void;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_Curve: declare class Geom_Curve extends Geom_Geometry

Reverse(): void;

ReversedParameter(U: number): number;

TransformedParameter(U: number, T: gp_Trsf): number;

ParametricTransformation(T: gp_Trsf): number;

Reversed(): Geom_Curve;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

Continuity(): GeomAbs_Shape;

IsCN(N: number): boolean;

EvalD0(U: number): gp_Pnt;

EvalD1(U: number): Geom_Curve_ResD1;

EvalD2(U: number): Geom_Curve_ResD2;

EvalD3(U: number): Geom_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec;

D0(U: number, P: gp_Pnt): void;

D1(U: number, P: gp_Pnt, V1: gp_Vec): void;

D2(U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

D3(U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

DN(U: number, N: number): gp_Vec;

Value(U: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_CylindricalSurface: declare class Geom_CylindricalSurface extends Geom_ElementarySurface

constructor

SetCylinder(C: gp_Cylinder): void;

SetRadius(R: number): void;

Cylinder(): gp_Cylinder;

UReversedParameter(U: number): number;

VReversedParameter(V: number): number;

TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

Radius(): number;

IsUClosed(): boolean;

IsVClosed(): boolean;

IsUPeriodic(): boolean;

IsVPeriodic(): boolean;

UIso(U: number): Geom_Curve;

VIso(V: number): Geom_Curve;

EvalD0(U: number, V: number): gp_Pnt;

EvalD1(U: number, V: number): Geom_Surface_ResD1;

EvalD2(U: number, V: number): Geom_Surface_ResD2;

EvalD3(U: number, V: number): Geom_Surface_ResD3;

EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

Transform(T: gp_Trsf): void;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_Direction: declare class Geom_Direction extends Geom_Vector

constructor

SetCoord(X: number, Y: number, Z: number): void;

SetDir(V: gp_Dir): void;

SetX(X: number): void;

SetY(Y: number): void;

SetZ(Z: number): void;

Dir(): gp_Dir;

Magnitude(): number;

SquareMagnitude(): number;

Cross(Other: Geom_Vector): void;

CrossCross(V1: Geom_Vector, V2: Geom_Vector): void;

Crossed(Other: Geom_Vector): Geom_Vector;

CrossCrossed(V1: Geom_Vector, V2: Geom_Vector): Geom_Vector;

Transform(T: gp_Trsf): void;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_ElementarySurface: declare class Geom_ElementarySurface extends Geom_Surface

SetAxis(theA1: gp_Ax1): void;

SetLocation(theLoc: gp_Pnt): void;

SetPosition(theAx3: gp_Ax3): void;

Axis(): gp_Ax1;

Location(): gp_Pnt;

Position(): gp_Ax3;

UReverse(): void;

UReversedParameter(U: number): number;

VReverse(): void;

VReversedParameter(V: number): number;

Continuity(): GeomAbs_Shape;

IsCNu(N: number): boolean;

IsCNv(N: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_Ellipse: declare class Geom_Ellipse extends Geom_Conic

constructor

SetElips(E: gp_Elips): void;

SetMajorRadius(MajorRadius: number): void;

SetMinorRadius(MinorRadius: number): void;

Elips(): gp_Elips;

ReversedParameter(U: number): number;

Directrix1(): gp_Ax1;

Directrix2(): gp_Ax1;

Eccentricity(): number;

Focal(): number;

Focus1(): gp_Pnt;

Focus2(): gp_Pnt;

MajorRadius(): number;

MinorRadius(): number;

Parameter(): number;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

EvalD0(U: number): gp_Pnt;

EvalD1(U: number): Geom_Curve_ResD1;

EvalD2(U: number): Geom_Curve_ResD2;

EvalD3(U: number): Geom_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec;

Transform(T: gp_Trsf): void;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_Geometry: declare class Geom_Geometry extends Standard_Transient

Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;

Rotate(A1: gp_Ax1, Ang: number): void;

Scale(P: gp_Pnt, S: number): void;

Translate(V: gp_Vec): void;
Translate(P1: gp_Pnt, P2: gp_Pnt): void;
Translate(V: gp_Vec): void;
Translate(P1: gp_Pnt, P2: gp_Pnt): void;

Transform(T: gp_Trsf): void;

Mirrored(P: gp_Pnt): Geom_Geometry;
Mirrored(A1: gp_Ax1): Geom_Geometry;
Mirrored(A2: gp_Ax2): Geom_Geometry;
Mirrored(P: gp_Pnt): Geom_Geometry;
Mirrored(A1: gp_Ax1): Geom_Geometry;
Mirrored(A2: gp_Ax2): Geom_Geometry;
Mirrored(P: gp_Pnt): Geom_Geometry;
Mirrored(A1: gp_Ax1): Geom_Geometry;
Mirrored(A2: gp_Ax2): Geom_Geometry;

Rotated(A1: gp_Ax1, Ang: number): Geom_Geometry;

Scaled(P: gp_Pnt, S: number): Geom_Geometry;

Transformed(T: gp_Trsf): Geom_Geometry;

Translated(V: gp_Vec): Geom_Geometry;
Translated(P1: gp_Pnt, P2: gp_Pnt): Geom_Geometry;
Translated(V: gp_Vec): Geom_Geometry;
Translated(P1: gp_Pnt, P2: gp_Pnt): Geom_Geometry;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_Hyperbola: declare class Geom_Hyperbola extends Geom_Conic

constructor

SetHypr(H: gp_Hypr): void;

SetMajorRadius(MajorRadius: number): void;

SetMinorRadius(MinorRadius: number): void;

Hypr(): gp_Hypr;

ReversedParameter(U: number): number;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

Asymptote1(): gp_Ax1;

Asymptote2(): gp_Ax1;

ConjugateBranch1(): gp_Hypr;

ConjugateBranch2(): gp_Hypr;

Directrix1(): gp_Ax1;

Directrix2(): gp_Ax1;

Eccentricity(): number;

Focal(): number;

Focus1(): gp_Pnt;

Focus2(): gp_Pnt;

MajorRadius(): number;

MinorRadius(): number;

OtherBranch(): gp_Hypr;

Parameter(): number;

EvalD0(U: number): gp_Pnt;

EvalD1(U: number): Geom_Curve_ResD1;

EvalD2(U: number): Geom_Curve_ResD2;

EvalD3(U: number): Geom_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec;

Transform(T: gp_Trsf): void;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_Line: declare class Geom_Line extends Geom_Curve

constructor

SetLin(L: gp_Lin): void;

SetDirection(V: gp_Dir): void;

SetLocation(P: gp_Pnt): void;

SetPosition(A1: gp_Ax1): void;

Lin(): gp_Lin;

Position(): gp_Ax1;

Reverse(): void;

ReversedParameter(U: number): number;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

Continuity(): GeomAbs_Shape;

IsCN(N: number): boolean;

EvalD0(U: number): gp_Pnt;

EvalD1(U: number): Geom_Curve_ResD1;

EvalD2(U: number): Geom_Curve_ResD2;

EvalD3(U: number): Geom_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec;

Transform(T: gp_Trsf): void;

TransformedParameter(U: number, T: gp_Trsf): number;

ParametricTransformation(T: gp_Trsf): number;

Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom_OffsetCurve: declare class Geom_OffsetCurve extends Geom_Curve

constructor

HasEvalRepresentation(): boolean;

EvalRepresentation(): GeomEval_RepCurveDesc_Base;

SetEvalRepresentation(theDesc: GeomEval_RepCurveDesc_Base): void;

ClearEvalRepresentation(): void;

Reverse(): void;

ReversedParameter(U: number): number;

SetBasisCurve(C: Geom_Curve, isNotCheckC0?: boolean): void;

SetDirection(V: gp_Dir): void;

SetOffsetValue(D: number): void;

BasisCurve(): Geom_Curve;

Continuity(): GeomAbs_Shape;

Direction(): gp_Dir;

EvalD0(U: number): gp_Pnt;

EvalD1(U: number): Geom_Curve_ResD1;

EvalD2(U: number): Geom_Curve_ResD2;

EvalD3(U: number): Geom_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec;

FirstParameter(): number;

LastParameter(): number;

Offset(): number;

IsClosed(): boolean;

IsCN(N: number): boolean;

IsPeriodic(): boolean;

Period(): number;

Transform(T: gp_Trsf): void;

TransformedParameter(U: number, T: gp_Trsf): number;

ParametricTransformation(T: gp_Trsf): number;

Copy(): Geom_Geometry;

GetBasisCurveContinuity(): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
