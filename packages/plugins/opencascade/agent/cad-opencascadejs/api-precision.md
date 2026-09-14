# libcascade — Precision

1 top-level symbols. Signatures are verbatim typescript.

Precision: declare class Precision

  constructor

  static Angular(): number;

  static Confusion(): number;

  static SquareConfusion(): number;

  static Computational(): number;

  static SquareComputational(): number;

  static Intersection(): number;

  static Approximation(): number;

  static Parametric(P: number, T: number): number;
  static Parametric(P: number): number;
  static Parametric(P: number, T: number): number;
  static Parametric(P: number): number;

  static PConfusion(T: number): number;
  static PConfusion(): number;
  static PConfusion(T: number): number;
  static PConfusion(): number;

  static SquarePConfusion(): number;

  static PIntersection(T: number): number;
  static PIntersection(): number;
  static PIntersection(T: number): number;
  static PIntersection(): number;

  static PApproximation(T: number): number;
  static PApproximation(): number;
  static PApproximation(T: number): number;
  static PApproximation(): number;

  static IsInfinite(R: number): boolean;

  static IsPositiveInfinite(R: number): boolean;

  static IsNegativeInfinite(R: number): boolean;

  static Infinite(): number;

  delete(): void;

  [Symbol.dispose](): void;
