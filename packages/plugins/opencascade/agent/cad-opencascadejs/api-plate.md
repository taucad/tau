# libcascade — Plate

15 top-level symbols. Signatures are verbatim typescript.

// define an order 1 derivatives of a 3d valued function of a 2d variable
Plate_D1: declare class Plate_D1

constructor

DU(): gp_XYZ;

DV(): gp_XYZ;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// define an order 2 derivatives of a 3d valued function of a 2d variable
Plate_D2: declare class Plate_D2

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// define an order 3 derivatives of a 3d valued function of a 2d variable
Plate_D3: declare class Plate_D3

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// define a G1, G2 or G3 constraint on the Plate using weaker constraint than GtoCConstraint
Plate_FreeGtoCConstraint: declare class Plate_FreeGtoCConstraint

constructor

nb_PPC(): number;

GetPPC(Index: number): Plate_PinpointConstraint;

nb_LSC(): number;

LSC(Index: number): Plate_LinearScalarConstraint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// force a set of UV points to translate without deformation
Plate_GlobalTranslationConstraint: declare class Plate_GlobalTranslationConstraint

constructor

LXYZC(): Plate_LinearXYZConstraint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// define a G1, G2 or G3 constraint on the Plate
Plate_GtoCConstraint: declare class Plate_GtoCConstraint

constructor

nb_PPC(): number;

GetPPC(Index: number): Plate_PinpointConstraint;

D1SurfInit(): Plate_D1;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// constraint a point to belong to a straight line
Plate_LineConstraint: declare class Plate_LineConstraint

constructor

LSC(): Plate_LinearScalarConstraint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// define on or several constraints as linear combination of the X,Y and Z components of a set of PinPointConstraint
Plate_LinearScalarConstraint: declare class Plate_LinearScalarConstraint

constructor

GetPPC(): NCollection_Array1_Plate_PinpointConstraint;

Coeff(): NCollection_Array2_gp_XYZ;

// Sets the PinPointConstraint of index Index to Value raise if Index is greater than the length of PPC or the Row length of coeff or lower than 1
SetPPC(Index: number, Value: Plate_PinpointConstraint): void;

// Sets the coeff of index (Row,Col) to Value raise if Row (respectively Col) is greater than the Row (respectively Column) length of coeff
SetCoeff(Row: number, Col: number, Value: gp_XYZ): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// define on or several constraints as linear combination of PinPointConstraint unlike the LinearScalarConstraint, usage of this kind of constraint preserve the X,Y and Z uncoupling
Plate_LinearXYZConstraint: declare class Plate_LinearXYZConstraint

constructor

GetPPC(): NCollection_Array1_Plate_PinpointConstraint;

Coeff(): NCollection_Array2_double;

// Sets the PinPointConstraint of index Index to Value raise if Index is greater than the length of PPC or the Row length of coeff or lower than 1
SetPPC(Index: number, Value: Plate_PinpointConstraint): void;

// Sets the coeff of index (Row,Col) to Value raise if Row (respectively Col) is greater than the Row (respectively Column) length of coeff
SetCoeff(Row: number, Col: number, Value: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// define a constraint on the Plate
Plate_PinpointConstraint: declare class Plate_PinpointConstraint

constructor

Pnt2d(): gp_XY;

Idu(): number;

Idv(): number;

Value(): gp_XYZ;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// constraint a point to belong to a Plane
Plate_PlaneConstraint: declare class Plate_PlaneConstraint

constructor

LSC(): Plate_LinearScalarConstraint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implement a variational spline algorithm able to define a two variable function satisfying some constraints and minimizing an energy like criterion
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

// returns True if all has been correctly done
IsDone(): boolean;

destroy(): void;

// reset the Plate in the initial state ( same as after Create())
Init(): void;

Evaluate(point2d: gp_XY): gp_XYZ;

EvaluateDerivative(point2d: gp_XY, iu: number, iv: number): gp_XYZ;

// Returns the coefficients of the polynomial part of the Plate function
CoefPol(): NCollection_HArray2_gp_XYZ;

SetPolynomialPartOnly(PPOnly?: boolean): void;

Continuity(): number;

UVBox(UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };

UVConstraints(Seq: NCollection_Sequence_gp_XY): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// define m PinPointConstraint driven by m unknown
Plate_SampledCurveConstraint: declare class Plate_SampledCurveConstraint

constructor

LXYZC(): Plate_LinearXYZConstraint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Plate_Array1OfPinpointConstraint: NCollection_Array1_Plate_PinpointConstraint

Plate_SequenceOfPinpointConstraint: NCollection_Sequence_Plate_PinpointConstraint
