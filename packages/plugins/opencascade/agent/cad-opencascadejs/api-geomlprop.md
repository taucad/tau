# libcascade — GeomLProp

5 top-level symbols. Signatures are verbatim typescript.

GeomLProp: declare class GeomLProp

constructor

static Continuity(C1: Geom_Curve, C2: Geom_Curve, u1: number, u2: number, r1: boolean, r2: boolean, tl: number, ta: number): GeomAbs_Shape;
static Continuity(C1: Geom_Curve, C2: Geom_Curve, u1: number, u2: number, r1: boolean, r2: boolean): GeomAbs_Shape;
static Continuity(C1: Geom_Curve, C2: Geom_Curve, u1: number, u2: number, r1: boolean, r2: boolean, tl: number, ta: number): GeomAbs_Shape;
static Continuity(C1: Geom_Curve, C2: Geom_Curve, u1: number, u2: number, r1: boolean, r2: boolean): GeomAbs_Shape;

delete(): void;

[Symbol.dispose](): void;

GeomLProp_CLProps: declare class GeomLProp_CLProps

constructor

SetParameter(U: number): void;

SetCurve(C: Geom_Curve): void;

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

GeomLProp_CLProps2d: declare class GeomLProp_CLProps2d

constructor

SetParameter(U: number): void;

SetCurve(C: Geom2d_Curve): void;

Value(): gp_Pnt2d;

D1(): gp_Vec2d;

D2(): gp_Vec2d;

D3(): gp_Vec2d;

IsTangentDefined(): boolean;

Tangent(D: gp_Dir2d): void;

Curvature(): number;

Normal(N: gp_Dir2d): void;

CentreOfCurvature(P: gp_Pnt2d): void;

delete(): void;

[Symbol.dispose](): void;

GeomLProp_CurAndInf2d: declare class GeomLProp_CurAndInf2d extends LProp_CurAndInf

constructor

Perform(C: Geom2d_Curve): void;

PerformCurExt(C: Geom2d_Curve): void;

PerformInf(C: Geom2d_Curve): void;

IsDone(): boolean;

delete(): void;

[Symbol.dispose](): void;

GeomLProp_SLProps: declare class GeomLProp_SLProps

constructor

SetSurface(S: Geom_Surface): void;

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
