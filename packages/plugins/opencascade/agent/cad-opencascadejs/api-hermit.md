# libcascade — Hermit

1 top-level symbols. Signatures are verbatim typescript.

Hermit: declare class Hermit

  // Hermit.constructor (constructor)
  constructor();

  // Hermit.Solution (method)
  static Solution(BS: Geom_BSplineCurve, TolPoles: number, TolKnots: number): Geom2d_BSplineCurve;
  static Solution(BS: Geom2d_BSplineCurve, TolPoles: number, TolKnots: number): Geom2d_BSplineCurve;

  // Hermit.Solutionbis (method)
  static Solutionbis(BS: Geom_BSplineCurve, Knotmin: number, Knotmax: number, TolPoles: number, TolKnots: number): { Knotmin: number; Knotmax: number };

  // Hermit.delete (method)
  delete(): void;

  // Hermit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
