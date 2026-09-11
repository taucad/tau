# libcascade — MathSys

2 top-level symbols. Signatures are verbatim typescript.

MathSys_LMConfig: declare class MathSys_LMConfig extends MathUtils_Config

constructor

LambdaInit: number

LambdaIncrease: number

LambdaDecrease: number

LambdaMax: number

LambdaMin: number

delete(): void;

[Symbol.dispose](): void;

MathSys_NewtonOptions: declare class MathSys_NewtonOptions extends MathUtils_Config

constructor

MaxStepRatio: number

EnableLineSearch: boolean

AllowSoftBounds: boolean

SoftBoundsExtension: number

delete(): void;

[Symbol.dispose](): void;
