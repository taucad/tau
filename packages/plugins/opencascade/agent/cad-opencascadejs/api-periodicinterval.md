# libcascade — PeriodicInterval

1 top-level symbols. Signatures are verbatim typescript.

PeriodicInterval: declare class PeriodicInterval

  // PeriodicInterval.constructor (constructor)
  constructor();
  constructor(Domain: IntRes2d_Domain);
  constructor(a: number, b: number);

  Binf: number

  Bsup: number

  isnull: boolean

  // PeriodicInterval.SetNull (method)
  SetNull(): void;

  // PeriodicInterval.IsNull (method)
  IsNull(): boolean;

  // PeriodicInterval.Complement (method)
  Complement(): void;

  // PeriodicInterval.Length (method)
  Length(): number;

  // PeriodicInterval.SetValues (method)
  SetValues(a: number, b: number): void;

  // PeriodicInterval.Normalize (method)
  Normalize(): void;

  // PeriodicInterval.FirstIntersection (method)
  FirstIntersection(I1: PeriodicInterval): PeriodicInterval;

  // PeriodicInterval.SecondIntersection (method)
  SecondIntersection(I2: PeriodicInterval): PeriodicInterval;

  // PeriodicInterval.delete (method)
  delete(): void;

  // PeriodicInterval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
