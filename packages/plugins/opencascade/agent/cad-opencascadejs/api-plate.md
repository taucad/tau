# libcascade — Plate

15 top-level symbols. Signatures are verbatim typescript.

Plate_D1: declare class Plate_D1

constructor

DU(): gp_XYZ;

DV(): gp_XYZ;

delete(): void;

[Symbol.dispose](): void;

Plate_D2: declare class Plate_D2

constructor

delete(): void;

[Symbol.dispose](): void;

Plate_D3: declare class Plate_D3

constructor

delete(): void;

[Symbol.dispose](): void;

Plate_FreeGtoCConstraint: declare class Plate_FreeGtoCConstraint

constructor

nb_PPC(): number;

GetPPC(Index: number): Plate_PinpointConstraint;

nb_LSC(): number;

LSC(Index: number): Plate_LinearScalarConstraint;

delete(): void;

[Symbol.dispose](): void;

Plate_GlobalTranslationConstraint: declare class Plate_GlobalTranslationConstraint

constructor

LXYZC(): Plate_LinearXYZConstraint;

delete(): void;

[Symbol.dispose](): void;

Plate_GtoCConstraint: declare class Plate_GtoCConstraint

constructor

nb_PPC(): number;

GetPPC(Index: number): Plate_PinpointConstraint;

D1SurfInit(): Plate_D1;

delete(): void;

[Symbol.dispose](): void;

Plate_LineConstraint: declare class Plate_LineConstraint

constructor

LSC(): Plate_LinearScalarConstraint;

delete(): void;

[Symbol.dispose](): void;

Plate_LinearScalarConstraint: declare class Plate_LinearScalarConstraint

constructor

GetPPC(): NCollection_Array1_Plate_PinpointConstraint;

Coeff(): NCollection_Array2_gp_XYZ;

SetPPC(Index: number, Value: Plate_PinpointConstraint): void;

SetCoeff(Row: number, Col: number, Value: gp_XYZ): void;

delete(): void;

[Symbol.dispose](): void;

Plate_LinearXYZConstraint: declare class Plate_LinearXYZConstraint

constructor

GetPPC(): NCollection_Array1_Plate_PinpointConstraint;

Coeff(): NCollection_Array2_double;

SetPPC(Index: number, Value: Plate_PinpointConstraint): void;

SetCoeff(Row: number, Col: number, Value: number): void;

delete(): void;

[Symbol.dispose](): void;

Plate_PinpointConstraint: declare class Plate_PinpointConstraint

constructor

Pnt2d(): gp_XY;

Idu(): number;

Idv(): number;

Value(): gp_XYZ;

delete(): void;

[Symbol.dispose](): void;

Plate_PlaneConstraint: declare class Plate_PlaneConstraint

constructor

LSC(): Plate_LinearScalarConstraint;

delete(): void;

[Symbol.dispose](): void;

Plate_Plate: declare class Plate_Plate

constructor

Copy(Ref: Plate_Plate): Plate_Plate;

Load(PConst: Plate_PinpointConstraint): void;
Load(LXYZConst: Plate_LinearXYZConstraint): void;
Load(LScalarConst: Plate_LinearScalarConstraint): void;
Load(GTConst: Plate_GlobalTranslationConstraint): void;
Load(LConst: Plate_LineConstraint): void;
Load(PConst: Plate_PlaneConstraint): void;
Load(SCConst: Plate_SampledCurveConstraint): void;
Load(GtoCConst: Plate_GtoCConstraint): void;
Load(FGtoCConst: Plate_FreeGtoCConstraint): void;
Load(PConst: Plate_PinpointConstraint): void;
Load(LXYZConst: Plate_LinearXYZConstraint): void;
Load(LScalarConst: Plate_LinearScalarConstraint): void;
Load(GTConst: Plate_GlobalTranslationConstraint): void;
Load(LConst: Plate_LineConstraint): void;
Load(PConst: Plate_PlaneConstraint): void;
Load(SCConst: Plate_SampledCurveConstraint): void;
Load(GtoCConst: Plate_GtoCConstraint): void;
Load(FGtoCConst: Plate_FreeGtoCConstraint): void;
Load(PConst: Plate_PinpointConstraint): void;
Load(LXYZConst: Plate_LinearXYZConstraint): void;
Load(LScalarConst: Plate_LinearScalarConstraint): void;
Load(GTConst: Plate_GlobalTranslationConstraint): void;
Load(LConst: Plate_LineConstraint): void;
Load(PConst: Plate_PlaneConstraint): void;
Load(SCConst: Plate_SampledCurveConstraint): void;
Load(GtoCConst: Plate_GtoCConstraint): void;
Load(FGtoCConst: Plate_FreeGtoCConstraint): void;
Load(PConst: Plate_PinpointConstraint): void;
Load(LXYZConst: Plate_LinearXYZConstraint): void;
Load(LScalarConst: Plate_LinearScalarConstraint): void;
Load(GTConst: Plate_GlobalTranslationConstraint): void;
Load(LConst: Plate_LineConstraint): void;
Load(PConst: Plate_PlaneConstraint): void;
Load(SCConst: Plate_SampledCurveConstraint): void;
Load(GtoCConst: Plate_GtoCConstraint): void;
Load(FGtoCConst: Plate_FreeGtoCConstraint): void;
Load(PConst: Plate_PinpointConstraint): void;
Load(LXYZConst: Plate_LinearXYZConstraint): void;
Load(LScalarConst: Plate_LinearScalarConstraint): void;
Load(GTConst: Plate_GlobalTranslationConstraint): void;
Load(LConst: Plate_LineConstraint): void;
Load(PConst: Plate_PlaneConstraint): void;
Load(SCConst: Plate_SampledCurveConstraint): void;
Load(GtoCConst: Plate_GtoCConstraint): void;
Load(FGtoCConst: Plate_FreeGtoCConstraint): void;
Load(PConst: Plate_PinpointConstraint): void;
Load(LXYZConst: Plate_LinearXYZConstraint): void;
Load(LScalarConst: Plate_LinearScalarConstraint): void;
Load(GTConst: Plate_GlobalTranslationConstraint): void;
Load(LConst: Plate_LineConstraint): void;
Load(PConst: Plate_PlaneConstraint): void;
Load(SCConst: Plate_SampledCurveConstraint): void;
Load(GtoCConst: Plate_GtoCConstraint): void;
Load(FGtoCConst: Plate_FreeGtoCConstraint): void;
Load(PConst: Plate_PinpointConstraint): void;
Load(LXYZConst: Plate_LinearXYZConstraint): void;
Load(LScalarConst: Plate_LinearScalarConstraint): void;
Load(GTConst: Plate_GlobalTranslationConstraint): void;
Load(LConst: Plate_LineConstraint): void;
Load(PConst: Plate_PlaneConstraint): void;
Load(SCConst: Plate_SampledCurveConstraint): void;
Load(GtoCConst: Plate_GtoCConstraint): void;
Load(FGtoCConst: Plate_FreeGtoCConstraint): void;
Load(PConst: Plate_PinpointConstraint): void;
Load(LXYZConst: Plate_LinearXYZConstraint): void;
Load(LScalarConst: Plate_LinearScalarConstraint): void;
Load(GTConst: Plate_GlobalTranslationConstraint): void;
Load(LConst: Plate_LineConstraint): void;
Load(PConst: Plate_PlaneConstraint): void;
Load(SCConst: Plate_SampledCurveConstraint): void;
Load(GtoCConst: Plate_GtoCConstraint): void;
Load(FGtoCConst: Plate_FreeGtoCConstraint): void;
Load(PConst: Plate_PinpointConstraint): void;
Load(LXYZConst: Plate_LinearXYZConstraint): void;
Load(LScalarConst: Plate_LinearScalarConstraint): void;
Load(GTConst: Plate_GlobalTranslationConstraint): void;
Load(LConst: Plate_LineConstraint): void;
Load(PConst: Plate_PlaneConstraint): void;
Load(SCConst: Plate_SampledCurveConstraint): void;
Load(GtoCConst: Plate_GtoCConstraint): void;
Load(FGtoCConst: Plate_FreeGtoCConstraint): void;

SolveTI(ord?: number, anisotropie?: number, theProgress?: Message_ProgressRange): void;

IsDone(): boolean;

destroy(): void;

Init(): void;

Evaluate(point2d: gp_XY): gp_XYZ;

EvaluateDerivative(point2d: gp_XY, iu: number, iv: number): gp_XYZ;

CoefPol(): NCollection_HArray2_gp_XYZ;

SetPolynomialPartOnly(PPOnly?: boolean): void;

Continuity(): number;

UVBox(UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };

UVConstraints(Seq: NCollection_Sequence_gp_XY): void;

delete(): void;

[Symbol.dispose](): void;

Plate_SampledCurveConstraint: declare class Plate_SampledCurveConstraint

constructor

LXYZC(): Plate_LinearXYZConstraint;

delete(): void;

[Symbol.dispose](): void;

Plate_Array1OfPinpointConstraint: NCollection_Array1_Plate_PinpointConstraint

Plate_SequenceOfPinpointConstraint: NCollection_Sequence_Plate_PinpointConstraint
