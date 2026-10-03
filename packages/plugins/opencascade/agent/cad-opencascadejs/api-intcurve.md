# libcascade — IntCurve

7 top-level symbols. Signatures are verbatim typescript.

IntCurve_IConicTool: declare class IntCurve_IConicTool

  // IntCurve_IConicTool.constructor (constructor)
  constructor();
  constructor(IT: IntCurve_IConicTool);
  constructor(E: gp_Elips2d);
  constructor(L: gp_Lin2d);
  constructor(C: gp_Circ2d);
  constructor(P: gp_Parab2d);
  constructor(H: gp_Hypr2d);

  // IntCurve_IConicTool.Value (method)
  Value(X: number): gp_Pnt2d;

  // IntCurve_IConicTool.D1 (method)
  D1(U: number, P: gp_Pnt2d, T: gp_Vec2d): void;

  // IntCurve_IConicTool.D2 (method)
  D2(U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d): void;

  // IntCurve_IConicTool.Distance (method)
  Distance(P: gp_Pnt2d): number;

  // IntCurve_IConicTool.GradDistance (method)
  GradDistance(P: gp_Pnt2d): gp_Vec2d;

  // IntCurve_IConicTool.FindParameter (method)
  FindParameter(P: gp_Pnt2d): number;

  // IntCurve_IConicTool.delete (method)
  delete(): void;

  // IntCurve_IConicTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurve_IntConicConic: declare class IntCurve_IntConicConic extends IntRes2d_Intersection

  // IntCurve_IntConicConic.constructor (constructor)
  constructor();
  constructor(L1: gp_Lin2d, D1: IntRes2d_Domain, L2: gp_Lin2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(L: gp_Lin2d, DL: IntRes2d_Domain, C: gp_Circ2d, DC: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(L: gp_Lin2d, DL: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(L: gp_Lin2d, DL: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(L: gp_Lin2d, DL: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(C1: gp_Circ2d, D1: IntRes2d_Domain, C2: gp_Circ2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(C: gp_Circ2d, DC: IntRes2d_Domain, E: gp_Elips2d, DE: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(C: gp_Circ2d, DC: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(C: gp_Circ2d, DC: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(E1: gp_Elips2d, D1: IntRes2d_Domain, E2: gp_Elips2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(E: gp_Elips2d, DE: IntRes2d_Domain, P: gp_Parab2d, DP: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(E: gp_Elips2d, DE: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(P1: gp_Parab2d, D1: IntRes2d_Domain, P2: gp_Parab2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(P: gp_Parab2d, DP: IntRes2d_Domain, H: gp_Hypr2d, DH: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(H1: gp_Hypr2d, D1: IntRes2d_Domain, H2: gp_Hypr2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);

  // IntCurve_IntConicConic.Perform (method)
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

  // IntCurve_IntConicConic.delete (method)
  delete(): void;

  // IntCurve_IntConicConic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurve_IntImpConicParConic: declare class IntCurve_IntImpConicParConic extends IntRes2d_Intersection

  // IntCurve_IntImpConicParConic.constructor (constructor)
  constructor();
  constructor(ITool: IntCurve_IConicTool, Dom1: IntRes2d_Domain, PCurve: IntCurve_PConic, Dom2: IntRes2d_Domain, TolConf: number, Tol: number);

  // IntCurve_IntImpConicParConic.Perform (method)
  Perform(ITool: IntCurve_IConicTool, Dom1: IntRes2d_Domain, PCurve: IntCurve_PConic, Dom2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  // IntCurve_IntImpConicParConic.FindU (method)
  FindU(parameter: number, point: gp_Pnt2d, TheParCurev: IntCurve_PConic, TheImpTool: IntCurve_IConicTool): number;

  // IntCurve_IntImpConicParConic.FindV (method)
  FindV(parameter: number, point: gp_Pnt2d, TheImpTool: IntCurve_IConicTool, ParCurve: IntCurve_PConic, TheParCurveDomain: IntRes2d_Domain, V0: number, V1: number, Tolerance: number): number;

  // IntCurve_IntImpConicParConic.And_Domaine_Objet1_Intersections (method)
  And_Domaine_Objet1_Intersections(TheImpTool: IntCurve_IConicTool, TheParCurve: IntCurve_PConic, TheImpCurveDomain: IntRes2d_Domain, TheParCurveDomain: IntRes2d_Domain, NbResultats: number, Inter2_And_Domain2: NCollection_Array1_double, Inter1: NCollection_Array1_double, Resultat1: NCollection_Array1_double, Resultat2: NCollection_Array1_double, EpsNul: number): { NbResultats: number };

  // IntCurve_IntImpConicParConic.delete (method)
  delete(): void;

  // IntCurve_IntImpConicParConic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurve_MyImpParToolOfIntImpConicParConic: declare class IntCurve_MyImpParToolOfIntImpConicParConic extends math_FunctionWithDerivative

  // IntCurve_MyImpParToolOfIntImpConicParConic.constructor (constructor)
  constructor(IT: IntCurve_IConicTool, PC: IntCurve_PConic);

  // IntCurve_MyImpParToolOfIntImpConicParConic.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // IntCurve_MyImpParToolOfIntImpConicParConic.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // IntCurve_MyImpParToolOfIntImpConicParConic.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // IntCurve_MyImpParToolOfIntImpConicParConic.delete (method)
  delete(): void;

  // IntCurve_MyImpParToolOfIntImpConicParConic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurve_PConic: declare class IntCurve_PConic

  // IntCurve_PConic.constructor (constructor)
  constructor(PC: IntCurve_PConic);
  constructor(E: gp_Elips2d);
  constructor(C: gp_Circ2d);
  constructor(P: gp_Parab2d);
  constructor(H: gp_Hypr2d);
  constructor(L: gp_Lin2d);

  // IntCurve_PConic.SetEpsX (method)
  SetEpsX(EpsDist: number): void;

  // IntCurve_PConic.SetAccuracy (method)
  SetAccuracy(Nb: number): void;

  // IntCurve_PConic.Accuracy (method)
  Accuracy(): number;

  // IntCurve_PConic.EpsX (method)
  EpsX(): number;

  // IntCurve_PConic.TypeCurve (method)
  TypeCurve(): GeomAbs_CurveType;

  // IntCurve_PConic.Axis2 (method)
  Axis2(): gp_Ax22d;

  // IntCurve_PConic.Param1 (method)
  Param1(): number;

  // IntCurve_PConic.Param2 (method)
  Param2(): number;

  // IntCurve_PConic.delete (method)
  delete(): void;

  // IntCurve_PConic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurve_PConicTool: declare class IntCurve_PConicTool

  // IntCurve_PConicTool.constructor (constructor)
  constructor();

  // IntCurve_PConicTool.EpsX (method)
  static EpsX(C: IntCurve_PConic): number;

  // IntCurve_PConicTool.NbSamples (method)
  static NbSamples(C: IntCurve_PConic): number;
  static NbSamples(C: IntCurve_PConic, U0: number, U1: number): number;

  // IntCurve_PConicTool.Value (method)
  static Value(C: IntCurve_PConic, X: number): gp_Pnt2d;

  // IntCurve_PConicTool.D1 (method)
  static D1(C: IntCurve_PConic, U: number, P: gp_Pnt2d, T: gp_Vec2d): void;

  // IntCurve_PConicTool.D2 (method)
  static D2(C: IntCurve_PConic, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d): void;

  // IntCurve_PConicTool.delete (method)
  delete(): void;

  // IntCurve_PConicTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurve_ProjectOnPConicTool: declare class IntCurve_ProjectOnPConicTool

  // IntCurve_ProjectOnPConicTool.constructor (constructor)
  constructor();

  // IntCurve_ProjectOnPConicTool.FindParameter (method)
  static FindParameter(C: IntCurve_PConic, Pnt: gp_Pnt2d, Tol: number): number;
  static FindParameter(C: IntCurve_PConic, Pnt: gp_Pnt2d, LowParameter: number, HighParameter: number, Tol: number): number;

  // IntCurve_ProjectOnPConicTool.delete (method)
  delete(): void;

  // IntCurve_ProjectOnPConicTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
