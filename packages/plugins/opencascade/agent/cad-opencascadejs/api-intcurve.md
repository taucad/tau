# libcascade — IntCurve

7 top-level symbols. Signatures are verbatim typescript.

IntCurve_IConicTool: declare class IntCurve_IConicTool

  constructor

  Value(X: number): gp_Pnt2d;

  D1(U: number, P: gp_Pnt2d, T: gp_Vec2d): void;

  D2(U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d): void;

  Distance(P: gp_Pnt2d): number;

  GradDistance(P: gp_Pnt2d): gp_Vec2d;

  FindParameter(P: gp_Pnt2d): number;

  delete(): void;

  [Symbol.dispose](): void;

IntCurve_IntConicConic: declare class IntCurve_IntConicConic extends IntRes2d_Intersection

  constructor

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

  delete(): void;

  [Symbol.dispose](): void;

IntCurve_IntImpConicParConic: declare class IntCurve_IntImpConicParConic extends IntRes2d_Intersection

  constructor

  Perform(ITool: IntCurve_IConicTool, Dom1: IntRes2d_Domain, PCurve: IntCurve_PConic, Dom2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  FindU(parameter: number, point: gp_Pnt2d, TheParCurev: IntCurve_PConic, TheImpTool: IntCurve_IConicTool): number;

  FindV(parameter: number, point: gp_Pnt2d, TheImpTool: IntCurve_IConicTool, ParCurve: IntCurve_PConic, TheParCurveDomain: IntRes2d_Domain, V0: number, V1: number, Tolerance: number): number;

  And_Domaine_Objet1_Intersections(TheImpTool: IntCurve_IConicTool, TheParCurve: IntCurve_PConic, TheImpCurveDomain: IntRes2d_Domain, TheParCurveDomain: IntRes2d_Domain, NbResultats: number, Inter2_And_Domain2: NCollection_Array1_double, Inter1: NCollection_Array1_double, Resultat1: NCollection_Array1_double, Resultat2: NCollection_Array1_double, EpsNul: number): { NbResultats: number };

  delete(): void;

  [Symbol.dispose](): void;

IntCurve_MyImpParToolOfIntImpConicParConic: declare class IntCurve_MyImpParToolOfIntImpConicParConic extends math_FunctionWithDerivative

  constructor

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  delete(): void;

  [Symbol.dispose](): void;

IntCurve_PConic: declare class IntCurve_PConic

  constructor

  SetEpsX(EpsDist: number): void;

  SetAccuracy(Nb: number): void;

  Accuracy(): number;

  EpsX(): number;

  TypeCurve(): GeomAbs_CurveType;

  Axis2(): gp_Ax22d;

  Param1(): number;

  Param2(): number;

  delete(): void;

  [Symbol.dispose](): void;

IntCurve_PConicTool: declare class IntCurve_PConicTool

  constructor

  static EpsX(C: IntCurve_PConic): number;

  static NbSamples(C: IntCurve_PConic): number;
  static NbSamples(C: IntCurve_PConic, U0: number, U1: number): number;
  static NbSamples(C: IntCurve_PConic): number;
  static NbSamples(C: IntCurve_PConic, U0: number, U1: number): number;

  static Value(C: IntCurve_PConic, X: number): gp_Pnt2d;

  static D1(C: IntCurve_PConic, U: number, P: gp_Pnt2d, T: gp_Vec2d): void;

  static D2(C: IntCurve_PConic, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d): void;

  delete(): void;

  [Symbol.dispose](): void;

IntCurve_ProjectOnPConicTool: declare class IntCurve_ProjectOnPConicTool

  constructor

  static FindParameter(C: IntCurve_PConic, Pnt: gp_Pnt2d, Tol: number): number;
  static FindParameter(C: IntCurve_PConic, Pnt: gp_Pnt2d, LowParameter: number, HighParameter: number, Tol: number): number;
  static FindParameter(C: IntCurve_PConic, Pnt: gp_Pnt2d, Tol: number): number;
  static FindParameter(C: IntCurve_PConic, Pnt: gp_Pnt2d, LowParameter: number, HighParameter: number, Tol: number): number;

  delete(): void;

  [Symbol.dispose](): void;
