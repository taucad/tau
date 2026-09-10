# libcascade — Hermit

1 top-level symbols. Signatures are verbatim typescript.

// This is used to reparameterize Rational BSpline Curves so that we can concatenate them later to build C1 Curves It builds and 1D-reparameterizing function starting from an Hermite interpolation and adding knots and modifying poles of the 1D BSpline obtained that way
Hermit: declare class Hermit

constructor

// returns the correct spline a(u) which will be multiplicated with BS later
static Solution(BS: Geom_BSplineCurve, TolPoles: number, TolKnots: number): Geom2d_BSplineCurve;
static Solution(BS: Geom2d_BSplineCurve, TolPoles: number, TolKnots: number): Geom2d_BSplineCurve;
static Solution(BS: Geom_BSplineCurve, TolPoles: number, TolKnots: number): Geom2d_BSplineCurve;
static Solution(BS: Geom2d_BSplineCurve, TolPoles: number, TolKnots: number): Geom2d_BSplineCurve;

// returns the knots to insert to a(u) to stay with a constant sign and in the tolerances
static Solutionbis(BS: Geom_BSplineCurve, Knotmin: number, Knotmax: number, TolPoles: number, TolKnots: number): { Knotmin: number; Knotmax: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
