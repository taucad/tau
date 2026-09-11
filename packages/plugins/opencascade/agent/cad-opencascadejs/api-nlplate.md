# libcascade — NLPlate

9 top-level symbols. Signatures are verbatim typescript.

NLPlate_HGPPConstraint: declare class NLPlate_HGPPConstraint extends Standard_Transient

SetUVFreeSliding(UVFree: boolean): void;

SetIncrementalLoadAllowed(ILA: boolean): void;

SetActiveOrder(ActiveOrder: number): void;

SetUV(UV: gp_XY): void;

SetOrientation(Orient?: number): void;

SetG0Criterion(TolDist: number): void;

SetG1Criterion(TolAng: number): void;

SetG2Criterion(TolCurv: number): void;

SetG3Criterion(TolG3: number): void;

UVFreeSliding(): boolean;

IncrementalLoadAllowed(): boolean;

ActiveOrder(): number;

UV(): gp_XY;

Orientation(): number;

IsG0(): boolean;

G0Target(): gp_XYZ;

G1Target(): Plate_D1;

G2Target(): Plate_D2;

G3Target(): Plate_D3;

G0Criterion(): number;

G1Criterion(): number;

G2Criterion(): number;

G3Criterion(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NLPlate_HPG0Constraint: declare class NLPlate_HPG0Constraint extends NLPlate_HGPPConstraint

constructor

SetUVFreeSliding(UVFree: boolean): void;

SetIncrementalLoadAllowed(ILA: boolean): void;

UVFreeSliding(): boolean;

IncrementalLoadAllowed(): boolean;

ActiveOrder(): number;

IsG0(): boolean;

G0Target(): gp_XYZ;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NLPlate_HPG0G1Constraint: declare class NLPlate_HPG0G1Constraint extends NLPlate_HPG0Constraint

constructor

SetOrientation(Orient?: number): void;

ActiveOrder(): number;

Orientation(): number;

G1Target(): Plate_D1;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NLPlate_HPG0G2Constraint: declare class NLPlate_HPG0G2Constraint extends NLPlate_HPG0G1Constraint

constructor

ActiveOrder(): number;

G2Target(): Plate_D2;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NLPlate_HPG0G3Constraint: declare class NLPlate_HPG0G3Constraint extends NLPlate_HPG0G2Constraint

constructor

ActiveOrder(): number;

G3Target(): Plate_D3;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NLPlate_HPG1Constraint: declare class NLPlate_HPG1Constraint extends NLPlate_HGPPConstraint

constructor

SetIncrementalLoadAllowed(ILA: boolean): void;

SetOrientation(Orient?: number): void;

IncrementalLoadAllowed(): boolean;

ActiveOrder(): number;

IsG0(): boolean;

Orientation(): number;

G1Target(): Plate_D1;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NLPlate_HPG2Constraint: declare class NLPlate_HPG2Constraint extends NLPlate_HPG1Constraint

constructor

ActiveOrder(): number;

G2Target(): Plate_D2;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NLPlate_HPG3Constraint: declare class NLPlate_HPG3Constraint extends NLPlate_HPG2Constraint

constructor

ActiveOrder(): number;

G3Target(): Plate_D3;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NLPlate_NLPlate: declare class NLPlate_NLPlate

constructor

Load(GConst: NLPlate_HGPPConstraint): void;

Solve(ord?: number, InitialConsraintOrder?: number): void;

Solve2(ord?: number, InitialConsraintOrder?: number): void;

IncrementalSolve(ord?: number, InitialConsraintOrder?: number, NbIncrements?: number, UVSliding?: boolean): void;

IsDone(): boolean;

destroy(): void;

Init(): void;

Evaluate(point2d: gp_XY): gp_XYZ;

EvaluateDerivative(point2d: gp_XY, iu: number, iv: number): gp_XYZ;

Continuity(): number;

ConstraintsSliding(NbIterations?: number): void;

MaxActiveConstraintOrder(): number;

delete(): void;

[Symbol.dispose](): void;
