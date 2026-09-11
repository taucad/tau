# libcascade — LProp

9 top-level symbols. Signatures are verbatim typescript.

LProp_SurfaceUtils_DirectAccess: declare class LProp_SurfaceUtils_DirectAccess

constructor

delete(): void;

[Symbol.dispose](): void;

LProp_BadContinuity: declare class LProp_BadContinuity extends Standard_Failure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

LProp_CIType: typeof LProp_CIType[keyof typeof LProp_CIType]

LProp_CLProps3d: declare class LProp_CLProps3d

constructor

SetParameter(U: number): void;

SetCurve(C: Adaptor3d_Curve): void;

Value(): gp_Pnt;

D1(): gp_Vec;

D2(): gp_Vec;

D3(): gp_Vec;

IsTangentDefined(): boolean;

Tangent(D: gp_Dir): void;

Curvature(): number;

Normal(N: gp_Dir): void;

CentreOfCurvature(P: gp_Pnt): void;

delete(): void;

[Symbol.dispose](): void;

LProp_CurAndInf: declare class LProp_CurAndInf

constructor

AddInflection(Param: number): void;

AddExtCur(Param: number, IsMin: boolean): void;

Clear(): void;

IsEmpty(): boolean;

NbPoints(): number;

Parameter(N: number): number;

Type(N: number): LProp_CIType;

delete(): void;

[Symbol.dispose](): void;

LProp_CurveUtils_DirectAccess: declare class LProp_CurveUtils_DirectAccess

constructor

delete(): void;

[Symbol.dispose](): void;

LProp_NotDefined: declare class LProp_NotDefined extends Standard_Failure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

LProp_SLProps3d: declare class LProp_SLProps3d

constructor

SetSurface(S: Adaptor3d_Surface): void;

SetParameters(U: number, V: number): void;

Value(): gp_Pnt;

D1U(): gp_Vec;

D1V(): gp_Vec;

D2U(): gp_Vec;

D2V(): gp_Vec;

DUV(): gp_Vec;

IsTangentUDefined(): boolean;

TangentU(D: gp_Dir): void;

IsTangentVDefined(): boolean;

TangentV(D: gp_Dir): void;

IsNormalDefined(): boolean;

Normal(): gp_Dir;

IsCurvatureDefined(): boolean;

IsUmbilic(): boolean;

MaxCurvature(): number;

MinCurvature(): number;

CurvatureDirections(MaxD: gp_Dir, MinD: gp_Dir): void;

MeanCurvature(): number;

GaussianCurvature(): number;

delete(): void;

[Symbol.dispose](): void;

LProp_Status: typeof LProp_Status[keyof typeof LProp_Status]
