# libcascade — PeriodicInterval

1 top-level symbols. Signatures are verbatim typescript.

PeriodicInterval: declare class PeriodicInterval

constructor

Binf: number

Bsup: number

isnull: boolean

SetNull(): void;

IsNull(): boolean;

Complement(): void;

Length(): number;

SetValues(a: number, b: number): void;

Normalize(): void;

FirstIntersection(I1: PeriodicInterval): PeriodicInterval;

SecondIntersection(I2: PeriodicInterval): PeriodicInterval;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
