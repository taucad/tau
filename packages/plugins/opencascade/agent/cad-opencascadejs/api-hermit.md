# libcascade — Hermit

1 top-level symbols. Signatures are verbatim typescript.

Hermit: declare class Hermit

  constructor

  static Solution(BS: Geom_BSplineCurve, TolPoles: number, TolKnots: number): Geom2d_BSplineCurve;
  static Solution(BS: Geom2d_BSplineCurve, TolPoles: number, TolKnots: number): Geom2d_BSplineCurve;
  static Solution(BS: Geom_BSplineCurve, TolPoles: number, TolKnots: number): Geom2d_BSplineCurve;
  static Solution(BS: Geom2d_BSplineCurve, TolPoles: number, TolKnots: number): Geom2d_BSplineCurve;

  static Solutionbis(BS: Geom_BSplineCurve, Knotmin: number, Knotmax: number, TolPoles: number, TolKnots: number): { Knotmin: number; Knotmax: number };

  delete(): void;

  [Symbol.dispose](): void;
