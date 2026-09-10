# libcascade — MathInteg

4 top-level symbols. Signatures are verbatim typescript.

MathInteg_DoubleExpConfig: declare class MathInteg_DoubleExpConfig extends MathUtils_IntegConfig

constructor

NbLevels: number

StepFactor: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MathInteg_KronrodConfig: declare class MathInteg_KronrodConfig extends MathUtils_IntegConfig

constructor

NbGaussPoints: number

Adaptive: boolean

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MathInteg_MultipleConfig: declare class MathInteg_MultipleConfig

constructor

MaxOrder: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MathInteg_SetResult: declare class MathInteg_SetResult

constructor

Status: MathUtils_Status

Values: math_VectorBase_double | null | undefined

NbEquations: number

IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
