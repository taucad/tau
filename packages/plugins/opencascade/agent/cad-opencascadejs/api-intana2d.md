# libcascade — IntAna2d

3 top-level symbols. Signatures are verbatim typescript.

IntAna2d_AnaIntersection: declare class IntAna2d_AnaIntersection

  // IntAna2d_AnaIntersection.constructor (constructor)
  constructor();
  constructor(L1: gp_Lin2d, L2: gp_Lin2d);
  constructor(C1: gp_Circ2d, C2: gp_Circ2d);
  constructor(L: gp_Lin2d, C: gp_Circ2d);
  constructor(L: gp_Lin2d, C: IntAna2d_Conic);
  constructor(C: gp_Circ2d, Co: IntAna2d_Conic);
  constructor(E: gp_Elips2d, C: IntAna2d_Conic);
  constructor(P: gp_Parab2d, C: IntAna2d_Conic);
  constructor(H: gp_Hypr2d, C: IntAna2d_Conic);

  // IntAna2d_AnaIntersection.Perform (method)
  Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
  Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: gp_Circ2d): void;
  Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
  Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
  Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
  Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
  Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;

  // IntAna2d_AnaIntersection.IsDone (method)
  IsDone(): boolean;

  // IntAna2d_AnaIntersection.IsEmpty (method)
  IsEmpty(): boolean;

  // IntAna2d_AnaIntersection.IdenticalElements (method)
  IdenticalElements(): boolean;

  // IntAna2d_AnaIntersection.ParallelElements (method)
  ParallelElements(): boolean;

  // IntAna2d_AnaIntersection.NbPoints (method)
  NbPoints(): number;

  // IntAna2d_AnaIntersection.Point (method)
  Point(N: number): IntAna2d_IntPoint;

  // IntAna2d_AnaIntersection.delete (method)
  delete(): void;

  // IntAna2d_AnaIntersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntAna2d_Conic: declare class IntAna2d_Conic

  // IntAna2d_Conic.constructor (constructor)
  constructor(C: gp_Circ2d);
  constructor(C: gp_Lin2d);
  constructor(C: gp_Parab2d);
  constructor(C: gp_Hypr2d);
  constructor(C: gp_Elips2d);

  // IntAna2d_Conic.Value (method)
  Value(X: number, Y: number): number;

  // IntAna2d_Conic.Grad (method)
  Grad(X: number, Y: number): gp_XY;

  // IntAna2d_Conic.ValAndGrad (method)
  ValAndGrad(X: number, Y: number, Val: number, Grd: gp_XY): { Val: number };

  // IntAna2d_Conic.Coefficients (method)
  Coefficients(A?: number, B?: number, C?: number, D?: number, E?: number, F?: number): { A: number; B: number; C: number; D: number; E: number; F: number };

  // IntAna2d_Conic.NewCoefficients (method)
  NewCoefficients(A: number, B: number, C: number, D: number, E: number, F: number, Axis: gp_Ax2d): { A: number; B: number; C: number; D: number; E: number; F: number };

  // IntAna2d_Conic.delete (method)
  delete(): void;

  // IntAna2d_Conic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntAna2d_IntPoint: declare class IntAna2d_IntPoint

  // IntAna2d_IntPoint.constructor (constructor)
  constructor();
  constructor(X: number, Y: number, U1: number);
  constructor(X: number, Y: number, U1: number, U2: number);

  // IntAna2d_IntPoint.SetValue (method)
  SetValue(X: number, Y: number, U1: number, U2: number): void;
  SetValue(X: number, Y: number, U1: number): void;

  // IntAna2d_IntPoint.Value (method)
  Value(): gp_Pnt2d;

  // IntAna2d_IntPoint.SecondIsImplicit (method)
  SecondIsImplicit(): boolean;

  // IntAna2d_IntPoint.ParamOnFirst (method)
  ParamOnFirst(): number;

  // IntAna2d_IntPoint.ParamOnSecond (method)
  ParamOnSecond(): number;

  // IntAna2d_IntPoint.delete (method)
  delete(): void;

  // IntAna2d_IntPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
