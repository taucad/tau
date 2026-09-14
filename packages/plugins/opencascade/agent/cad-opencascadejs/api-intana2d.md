# libcascade — IntAna2d

3 top-level symbols. Signatures are verbatim typescript.

IntAna2d_AnaIntersection: declare class IntAna2d_AnaIntersection

  constructor

  Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
  Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
  Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
  Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
  Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
  Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
  Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
  Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
  Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
  Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
  Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
  Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
  Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
  Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
  Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
  Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
  Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
  Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
  Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
  Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
  Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
  Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
  Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
  Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
  Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
  Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
  Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
  Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
  Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
  Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
  Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
  Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
  Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
  Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
  Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
  Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
  Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
  Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
  Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
  Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
  Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
  Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
  Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
  Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
  Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
  Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
  Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
  Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;

  IsDone(): boolean;

  IsEmpty(): boolean;

  IdenticalElements(): boolean;

  ParallelElements(): boolean;

  NbPoints(): number;

  Point(N: number): IntAna2d_IntPoint;

  delete(): void;

  [Symbol.dispose](): void;

IntAna2d_Conic: declare class IntAna2d_Conic

  constructor

  Value(X: number, Y: number): number;

  Grad(X: number, Y: number): gp_XY;

  ValAndGrad(X: number, Y: number, Val: number, Grd: gp_XY): { Val: number };

  Coefficients(A?: number, B?: number, C?: number, D?: number, E?: number, F?: number): { A: number; B: number; C: number; D: number; E: number; F: number };

  NewCoefficients(A: number, B: number, C: number, D: number, E: number, F: number, Axis: gp_Ax2d): { A: number; B: number; C: number; D: number; E: number; F: number };

  delete(): void;

  [Symbol.dispose](): void;

IntAna2d_IntPoint: declare class IntAna2d_IntPoint

  constructor

  SetValue(X: number, Y: number, U1: number, U2: number): void;
  SetValue(X: number, Y: number, U1: number): void;
  SetValue(X: number, Y: number, U1: number, U2: number): void;
  SetValue(X: number, Y: number, U1: number): void;

  Value(): gp_Pnt2d;

  SecondIsImplicit(): boolean;

  ParamOnFirst(): number;

  ParamOnSecond(): number;

  delete(): void;

  [Symbol.dispose](): void;
