# libcascade — Interval

1 top-level symbols. Signatures are verbatim typescript.

Interval: declare class Interval

  constructor

  Binf: number

  Bsup: number

  HasFirstBound: boolean

  HasLastBound: boolean

  IsNull: boolean

  Length(): number;

  IntersectionWithBounded(Inter: Interval): Interval;

  delete(): void;

  [Symbol.dispose](): void;
