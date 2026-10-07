# libcascade — Interval

1 top-level symbols. Signatures are verbatim typescript.

Interval: declare class Interval

  // Interval.constructor (constructor)
  constructor();
  constructor(Domain: IntRes2d_Domain);
  constructor(a: number, b: number);
  constructor(a: number, hf: boolean, b: number, hl: boolean);

  Binf: number

  Bsup: number

  HasFirstBound: boolean

  HasLastBound: boolean

  IsNull: boolean

  // Interval.Length (method)
  Length(): number;

  // Interval.IntersectionWithBounded (method)
  IntersectionWithBounded(Inter: Interval): Interval;

  // Interval.delete (method)
  delete(): void;

  // Interval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
