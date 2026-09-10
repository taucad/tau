# libcascade — MathRoot

6 top-level symbols. Signatures are verbatim typescript.

MathRoot_AllRootsResult: declare class MathRoot_AllRootsResult

constructor

Status: MathUtils_Status

Roots: NCollection_DynamicArray_double

RootStates: NCollection_DynamicArray_int

NullIntervals: NCollection_DynamicArray_MathRoot_NullInterval

IsDone(): boolean;

NbRoots(): number;

NbIntervals(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MathRoot_NullInterval: declare class MathRoot_NullInterval

constructor

A: number

B: number

State: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MathRoot_MultipleConfig: declare class MathRoot_MultipleConfig

constructor

NbSamples: number

XTolerance: number

FTolerance: number

NullTolerance: number

MaxIterations: number

Offset: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MathRoot_MultipleNoExtraHandler: declare class MathRoot_MultipleNoExtraHandler

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MathRoot_MultipleResult: declare class MathRoot_MultipleResult

constructor

Status: MathUtils_Status

NbIterations: number

Roots: NCollection_DynamicArray_double

Values: NCollection_DynamicArray_double

IsAllNull: boolean

IsDone(): boolean;

NbRoots(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MathRoot_TrigResult: declare class MathRoot_TrigResult

constructor

Status: MathUtils_Status

Roots: [number, number, number, number]

NbRoots: number

InfiniteRoots: boolean

IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
