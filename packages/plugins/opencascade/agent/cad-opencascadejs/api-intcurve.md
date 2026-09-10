# libcascade — IntCurve

4 top-level symbols. Signatures are verbatim typescript.

// Implementation of the ImpTool from `IntImpParGen` for conics of gp
IntCurve_IConicTool: declare class IntCurve_IConicTool

constructor

Value(X: number): gp_Pnt2d;

D1(U: number, P: gp_Pnt2d, T: gp_Vec2d): void;

D2(U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d): void;

// Computes the value of the signed distance between the point P and the implicit curve
Distance(P: gp_Pnt2d): number;

// Computes the Gradient of the Signed Distance between a point and the implicit curve, at the point P
GradDistance(P: gp_Pnt2d): gp_Vec2d;

// Returns the parameter U of the point on the implicit curve corresponding to the point P
FindParameter(P: gp_Pnt2d): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to intersect two conics
IntCurve_IntConicConic: declare class IntCurve_IntConicConic extends IntRes2d_Intersection

constructor

// Intersection between 2 lines from gp
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurve_IntImpConicParConic: declare class IntCurve_IntImpConicParConic extends IntRes2d_Intersection

constructor

// Intersection between an implicit curve and a parametrised curve
Perform(ITool: IntCurve_IConicTool, Dom1: IntRes2d_Domain, PCurve: IntCurve_PConic, Dom2: IntRes2d_Domain, TolConf: number, Tol: number): void;

FindU(parameter: number, point: gp_Pnt2d, TheParCurev: IntCurve_PConic, TheImpTool: IntCurve_IConicTool): number;

FindV(parameter: number, point: gp_Pnt2d, TheImpTool: IntCurve_IConicTool, ParCurve: IntCurve_PConic, TheParCurveDomain: IntRes2d_Domain, V0: number, V1: number, Tolerance: number): number;

And_Domaine_Objet1_Intersections(TheImpTool: IntCurve_IConicTool, TheParCurve: IntCurve_PConic, TheImpCurveDomain: IntRes2d_Domain, TheParCurveDomain: IntRes2d_Domain, NbResultats: number, Inter2_And_Domain2: NCollection_Array1_double, Inter1: NCollection_Array1_double, Resultat1: NCollection_Array1_double, Resultat2: NCollection_Array1_double, EpsNul: number): { NbResultats: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurve_MyImpParToolOfIntImpConicParConic: declare class IntCurve_MyImpParToolOfIntImpConicParConic extends math_FunctionWithDerivative

constructor

// Computes the value of the signed distance between the implicit curve and the point at parameter Param on the parametrised curve
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative of the previous function at parameter Param
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value and the derivative of the function
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
