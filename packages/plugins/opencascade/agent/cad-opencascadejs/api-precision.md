# libcascade — Precision

1 top-level symbols. Signatures are verbatim typescript.

Precision: declare class Precision

  // Precision.constructor (constructor)
  constructor();

  // Precision.Angular (method)
  static Angular(): number;

  // Precision.Confusion (method)
  static Confusion(): number;

  // Precision.SquareConfusion (method)
  static SquareConfusion(): number;

  // Precision.Computational (method)
  static Computational(): number;

  // Precision.SquareComputational (method)
  static SquareComputational(): number;

  // Precision.Intersection (method)
  static Intersection(): number;

  // Precision.Approximation (method)
  static Approximation(): number;

  // Precision.Parametric (method)
  static Parametric(P: number, T: number): number;
  static Parametric(P: number): number;

  // Precision.PConfusion (method)
  static PConfusion(T: number): number;
  static PConfusion(): number;

  // Precision.SquarePConfusion (method)
  static SquarePConfusion(): number;

  // Precision.PIntersection (method)
  static PIntersection(T: number): number;
  static PIntersection(): number;

  // Precision.PApproximation (method)
  static PApproximation(T: number): number;
  static PApproximation(): number;

  // Precision.IsInfinite (method)
  static IsInfinite(R: number): boolean;

  // Precision.IsPositiveInfinite (method)
  static IsPositiveInfinite(R: number): boolean;

  // Precision.IsNegativeInfinite (method)
  static IsNegativeInfinite(R: number): boolean;

  // Precision.Infinite (method)
  static Infinite(): number;

  // Precision.delete (method)
  delete(): void;

  // Precision.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
