# libcascade — Geom2dInt

11 top-level symbols. Signatures are verbatim typescript.

Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter: declare class Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter

  // Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter.constructor (constructor)
  constructor(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, Tol: number);

  // Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter.Perform (method)
  Perform(Poly1: Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter, Poly2: Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter, NumSegOn1: number, NumSegOn2: number, ParamOnSeg1: number, ParamOnSeg2: number): { NumSegOn1: number; NumSegOn2: number; ParamOnSeg1: number; ParamOnSeg2: number };
  Perform(Uo: number, Vo: number, UInf: number, VInf: number, USup: number, VSup: number): void;

  // Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter.NbRoots (method)
  NbRoots(): number;

  // Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter.Roots (method)
  Roots(U?: number, V?: number): { U: number; V: number };

  // Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter.AnErrorOccurred (method)
  AnErrorOccurred(): boolean;

  // Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter.delete (method)
  delete(): void;

  // Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dInt_GInter: declare class Geom2dInt_GInter extends IntRes2d_Intersection

  // Geom2dInt_GInter.constructor (constructor)
  constructor();
  constructor(C: Adaptor2d_Curve2d, TolConf: number, Tol: number);
  constructor(C: Adaptor2d_Curve2d, D: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number);
  constructor(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number);
  constructor(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);

  // Geom2dInt_GInter.Perform (method)
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  // Geom2dInt_GInter.ComputeDomain (method)
  ComputeDomain(C1: Adaptor2d_Curve2d, TolDomain: number): IntRes2d_Domain;

  // Geom2dInt_GInter.SetMinNbSamples (method)
  SetMinNbSamples(theMinNbSamples: number): void;

  // Geom2dInt_GInter.GetMinNbSamples (method)
  GetMinNbSamples(): number;

  // Geom2dInt_GInter.delete (method)
  delete(): void;

  // Geom2dInt_GInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dInt_Geom2dCurveTool: declare class Geom2dInt_Geom2dCurveTool

  // Geom2dInt_Geom2dCurveTool.constructor (constructor)
  constructor();

  // Geom2dInt_Geom2dCurveTool.GetType (method)
  static GetType(C: Adaptor2d_Curve2d): GeomAbs_CurveType;

  // Geom2dInt_Geom2dCurveTool.Line (method)
  static Line(C: Adaptor2d_Curve2d): gp_Lin2d;

  // Geom2dInt_Geom2dCurveTool.Circle (method)
  static Circle(C: Adaptor2d_Curve2d): gp_Circ2d;

  // Geom2dInt_Geom2dCurveTool.Ellipse (method)
  static Ellipse(C: Adaptor2d_Curve2d): gp_Elips2d;

  // Geom2dInt_Geom2dCurveTool.Parabola (method)
  static Parabola(C: Adaptor2d_Curve2d): gp_Parab2d;

  // Geom2dInt_Geom2dCurveTool.Hyperbola (method)
  static Hyperbola(C: Adaptor2d_Curve2d): gp_Hypr2d;

  // Geom2dInt_Geom2dCurveTool.EpsX (method)
  static EpsX(C: Adaptor2d_Curve2d): number;
  static EpsX(C: Adaptor2d_Curve2d, Eps_XYZ: number): number;

  // Geom2dInt_Geom2dCurveTool.NbSamples (method)
  static NbSamples(C: Adaptor2d_Curve2d): number;
  static NbSamples(C: Adaptor2d_Curve2d, U0: number, U1: number): number;

  // Geom2dInt_Geom2dCurveTool.FirstParameter (method)
  static FirstParameter(C: Adaptor2d_Curve2d): number;

  // Geom2dInt_Geom2dCurveTool.LastParameter (method)
  static LastParameter(C: Adaptor2d_Curve2d): number;

  // Geom2dInt_Geom2dCurveTool.Value (method)
  static Value(C: Adaptor2d_Curve2d, X: number): gp_Pnt2d;

  // Geom2dInt_Geom2dCurveTool.D0 (method)
  static D0(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d): void;

  // Geom2dInt_Geom2dCurveTool.D1 (method)
  static D1(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, T: gp_Vec2d): void;

  // Geom2dInt_Geom2dCurveTool.D2 (method)
  static D2(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d): void;

  // Geom2dInt_Geom2dCurveTool.D3 (method)
  static D3(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d, V: gp_Vec2d): void;

  // Geom2dInt_Geom2dCurveTool.DN (method)
  static DN(C: Adaptor2d_Curve2d, U: number, N: number): gp_Vec2d;

  // Geom2dInt_Geom2dCurveTool.NbIntervals (method)
  static NbIntervals(C: Adaptor2d_Curve2d): number;

  // Geom2dInt_Geom2dCurveTool.Intervals (method)
  static Intervals(C: Adaptor2d_Curve2d, Tab: NCollection_Array1_double): void;

  // Geom2dInt_Geom2dCurveTool.GetInterval (method)
  static GetInterval(C: Adaptor2d_Curve2d, Index: number, Tab: NCollection_Array1_double, U1?: number, U2?: number): { U1: number; U2: number };

  // Geom2dInt_Geom2dCurveTool.Degree (method)
  static Degree(C: Adaptor2d_Curve2d): number;

  // Geom2dInt_Geom2dCurveTool.delete (method)
  delete(): void;

  // Geom2dInt_Geom2dCurveTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dInt_IntConicCurveOfGInter: declare class Geom2dInt_IntConicCurveOfGInter extends IntRes2d_Intersection

  // Geom2dInt_IntConicCurveOfGInter.constructor (constructor)
  constructor();
  constructor(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);

  // Geom2dInt_IntConicCurveOfGInter.Perform (method)
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  // Geom2dInt_IntConicCurveOfGInter.delete (method)
  delete(): void;

  // Geom2dInt_IntConicCurveOfGInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter: declare class Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter extends math_FunctionWithDerivative

  // Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter.constructor (constructor)
  constructor(IT: IntCurve_IConicTool, PC: Adaptor2d_Curve2d);

  // Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter.delete (method)
  delete(): void;

  // Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter: declare class Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter extends math_FunctionSetWithDerivatives

  // Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter.constructor (constructor)
  constructor(curve1: Adaptor2d_Curve2d, curve2: Adaptor2d_Curve2d);

  // Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter.NbVariables (method)
  NbVariables(): number;

  // Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter.NbEquations (method)
  NbEquations(): number;

  // Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter.delete (method)
  delete(): void;

  // Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dInt_TheIntConicCurveOfGInter: declare class Geom2dInt_TheIntConicCurveOfGInter extends IntRes2d_Intersection

  // Geom2dInt_TheIntConicCurveOfGInter.constructor (constructor)
  constructor();
  constructor(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);
  constructor(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number);

  // Geom2dInt_TheIntConicCurveOfGInter.Perform (method)
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  // Geom2dInt_TheIntConicCurveOfGInter.delete (method)
  delete(): void;

  // Geom2dInt_TheIntConicCurveOfGInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dInt_TheIntPCurvePCurveOfGInter: declare class Geom2dInt_TheIntPCurvePCurveOfGInter extends IntRes2d_Intersection

  // Geom2dInt_TheIntPCurvePCurveOfGInter.constructor (constructor)
  constructor();

  // Geom2dInt_TheIntPCurvePCurveOfGInter.Perform (method)
  Perform(Curve1: Adaptor2d_Curve2d, Domain1: IntRes2d_Domain, Curve2: Adaptor2d_Curve2d, Domain2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Curve1: Adaptor2d_Curve2d, Domain1: IntRes2d_Domain, TolConf: number, Tol: number): void;

  // Geom2dInt_TheIntPCurvePCurveOfGInter.SetMinNbSamples (method)
  SetMinNbSamples(theMinNbSamples: number): void;

  // Geom2dInt_TheIntPCurvePCurveOfGInter.GetMinNbSamples (method)
  GetMinNbSamples(): number;

  // Geom2dInt_TheIntPCurvePCurveOfGInter.delete (method)
  delete(): void;

  // Geom2dInt_TheIntPCurvePCurveOfGInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter: declare class Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter extends IntRes2d_Intersection

  // Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter.constructor (constructor)
  constructor();
  constructor(ITool: IntCurve_IConicTool, Dom1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, Dom2: IntRes2d_Domain, TolConf: number, Tol: number);

  // Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter.Perform (method)
  Perform(ITool: IntCurve_IConicTool, Dom1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, Dom2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  // Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter.FindU (method)
  FindU(parameter: number, point: gp_Pnt2d, TheParCurev: Adaptor2d_Curve2d, IntCurve_IConicTool: IntCurve_IConicTool): number;

  // Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter.FindV (method)
  FindV(parameter: number, point: gp_Pnt2d, IntCurve_IConicTool: IntCurve_IConicTool, ParCurve: Adaptor2d_Curve2d, TheParCurveDomain: IntRes2d_Domain, V0: number, V1: number, Tolerance: number): number;

  // Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter.And_Domaine_Objet1_Intersections (method)
  And_Domaine_Objet1_Intersections(IntCurve_IConicTool: IntCurve_IConicTool, TheParCurve: Adaptor2d_Curve2d, TheImpCurveDomain: IntRes2d_Domain, TheParCurveDomain: IntRes2d_Domain, NbResultats: number, Inter2_And_Domain2: NCollection_Array1_double, Inter1: NCollection_Array1_double, Resultat1: NCollection_Array1_double, Resultat2: NCollection_Array1_double, EpsNul: number): { NbResultats: number };

  // Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter.delete (method)
  delete(): void;

  // Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter: declare class Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter extends Intf_Polygon2d

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.constructor (constructor)
  constructor(Curve: Adaptor2d_Curve2d, NbPnt: number, Domain: IntRes2d_Domain, Tol: number);

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.ComputeWithBox (method)
  ComputeWithBox(Curve: Adaptor2d_Curve2d, OtherBox: Bnd_Box2d): void;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.DeflectionOverEstimation (method)
  DeflectionOverEstimation(): number;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.SetDeflectionOverEstimation (method)
  SetDeflectionOverEstimation(x: number): void;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.Closed (method)
  Closed(clos: boolean): void;
  Closed(): boolean;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.NbSegments (method)
  NbSegments(): number;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.Segment (method)
  Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.InfParameter (method)
  InfParameter(): number;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.SupParameter (method)
  SupParameter(): number;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.AutoIntersectionIsPossible (method)
  AutoIntersectionIsPossible(): boolean;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.ApproxParamOnCurve (method)
  ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.CalculRegion (method)
  CalculRegion(x: number, y: number, x1: number, x2: number, y1: number, y2: number): number;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.Dump (method)
  Dump(): void;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.delete (method)
  delete(): void;

  // Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dInt_TheProjPCurOfGInter: declare class Geom2dInt_TheProjPCurOfGInter

  // Geom2dInt_TheProjPCurOfGInter.constructor (constructor)
  constructor();

  // Geom2dInt_TheProjPCurOfGInter.FindParameter (method)
  static FindParameter(C: Adaptor2d_Curve2d, Pnt: gp_Pnt2d, Tol: number): number;
  static FindParameter(C: Adaptor2d_Curve2d, Pnt: gp_Pnt2d, LowParameter: number, HighParameter: number, Tol: number): number;

  // Geom2dInt_TheProjPCurOfGInter.delete (method)
  delete(): void;

  // Geom2dInt_TheProjPCurOfGInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
