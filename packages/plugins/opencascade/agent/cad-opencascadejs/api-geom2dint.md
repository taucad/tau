# libcascade — Geom2dInt

11 top-level symbols. Signatures are verbatim typescript.

Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter: declare class Geom2dInt_ExactIntersectionPointOfTheIntPCurvePCurveOfGInter

  constructor

  Perform(Poly1: Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter, Poly2: Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter, NumSegOn1: number, NumSegOn2: number, ParamOnSeg1: number, ParamOnSeg2: number): { NumSegOn1: number; NumSegOn2: number; ParamOnSeg1: number; ParamOnSeg2: number };
  Perform(Uo: number, Vo: number, UInf: number, VInf: number, USup: number, VSup: number): void;
  Perform(Poly1: Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter, Poly2: Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter, NumSegOn1: number, NumSegOn2: number, ParamOnSeg1: number, ParamOnSeg2: number): { NumSegOn1: number; NumSegOn2: number; ParamOnSeg1: number; ParamOnSeg2: number };
  Perform(Uo: number, Vo: number, UInf: number, VInf: number, USup: number, VSup: number): void;

  NbRoots(): number;

  Roots(U?: number, V?: number): { U: number; V: number };

  AnErrorOccurred(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dInt_GInter: declare class Geom2dInt_GInter extends IntRes2d_Intersection

  constructor

  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  ComputeDomain(C1: Adaptor2d_Curve2d, TolDomain: number): IntRes2d_Domain;

  SetMinNbSamples(theMinNbSamples: number): void;

  GetMinNbSamples(): number;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dInt_Geom2dCurveTool: declare class Geom2dInt_Geom2dCurveTool

  constructor

  static GetType(C: Adaptor2d_Curve2d): GeomAbs_CurveType;

  static Line(C: Adaptor2d_Curve2d): gp_Lin2d;

  static Circle(C: Adaptor2d_Curve2d): gp_Circ2d;

  static Ellipse(C: Adaptor2d_Curve2d): gp_Elips2d;

  static Parabola(C: Adaptor2d_Curve2d): gp_Parab2d;

  static Hyperbola(C: Adaptor2d_Curve2d): gp_Hypr2d;

  static EpsX(C: Adaptor2d_Curve2d): number;
  static EpsX(C: Adaptor2d_Curve2d, Eps_XYZ: number): number;
  static EpsX(C: Adaptor2d_Curve2d): number;
  static EpsX(C: Adaptor2d_Curve2d, Eps_XYZ: number): number;

  static NbSamples(C: Adaptor2d_Curve2d): number;
  static NbSamples(C: Adaptor2d_Curve2d, U0: number, U1: number): number;
  static NbSamples(C: Adaptor2d_Curve2d): number;
  static NbSamples(C: Adaptor2d_Curve2d, U0: number, U1: number): number;

  static FirstParameter(C: Adaptor2d_Curve2d): number;

  static LastParameter(C: Adaptor2d_Curve2d): number;

  static Value(C: Adaptor2d_Curve2d, X: number): gp_Pnt2d;

  static D0(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d): void;

  static D1(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, T: gp_Vec2d): void;

  static D2(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d): void;

  static D3(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d, V: gp_Vec2d): void;

  static DN(C: Adaptor2d_Curve2d, U: number, N: number): gp_Vec2d;

  static NbIntervals(C: Adaptor2d_Curve2d): number;

  static Intervals(C: Adaptor2d_Curve2d, Tab: NCollection_Array1_double): void;

  static GetInterval(C: Adaptor2d_Curve2d, Index: number, Tab: NCollection_Array1_double, U1?: number, U2?: number): { U1: number; U2: number };

  static Degree(C: Adaptor2d_Curve2d): number;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dInt_IntConicCurveOfGInter: declare class Geom2dInt_IntConicCurveOfGInter extends IntRes2d_Intersection

  constructor

  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter: declare class Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter extends math_FunctionWithDerivative

  constructor

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  delete(): void;

  [Symbol.dispose](): void;

Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter: declare class Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter extends math_FunctionSetWithDerivatives

  constructor

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dInt_TheIntConicCurveOfGInter: declare class Geom2dInt_TheIntConicCurveOfGInter extends IntRes2d_Intersection

  constructor

  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dInt_TheIntPCurvePCurveOfGInter: declare class Geom2dInt_TheIntPCurvePCurveOfGInter extends IntRes2d_Intersection

  constructor

  Perform(Curve1: Adaptor2d_Curve2d, Domain1: IntRes2d_Domain, Curve2: Adaptor2d_Curve2d, Domain2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Curve1: Adaptor2d_Curve2d, Domain1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Curve1: Adaptor2d_Curve2d, Domain1: IntRes2d_Domain, Curve2: Adaptor2d_Curve2d, Domain2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Curve1: Adaptor2d_Curve2d, Domain1: IntRes2d_Domain, TolConf: number, Tol: number): void;

  SetMinNbSamples(theMinNbSamples: number): void;

  GetMinNbSamples(): number;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter: declare class Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter extends IntRes2d_Intersection

  constructor

  Perform(ITool: IntCurve_IConicTool, Dom1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, Dom2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  FindU(parameter: number, point: gp_Pnt2d, TheParCurev: Adaptor2d_Curve2d, IntCurve_IConicTool: IntCurve_IConicTool): number;

  FindV(parameter: number, point: gp_Pnt2d, IntCurve_IConicTool: IntCurve_IConicTool, ParCurve: Adaptor2d_Curve2d, TheParCurveDomain: IntRes2d_Domain, V0: number, V1: number, Tolerance: number): number;

  And_Domaine_Objet1_Intersections(IntCurve_IConicTool: IntCurve_IConicTool, TheParCurve: Adaptor2d_Curve2d, TheImpCurveDomain: IntRes2d_Domain, TheParCurveDomain: IntRes2d_Domain, NbResultats: number, Inter2_And_Domain2: NCollection_Array1_double, Inter1: NCollection_Array1_double, Resultat1: NCollection_Array1_double, Resultat2: NCollection_Array1_double, EpsNul: number): { NbResultats: number };

  delete(): void;

  [Symbol.dispose](): void;

Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter: declare class Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter extends Intf_Polygon2d

  constructor

  ComputeWithBox(Curve: Adaptor2d_Curve2d, OtherBox: Bnd_Box2d): void;

  DeflectionOverEstimation(): number;

  SetDeflectionOverEstimation(x: number): void;

  Closed(clos: boolean): void;
  Closed(): boolean;
  Closed(clos: boolean): void;
  Closed(): boolean;

  NbSegments(): number;

  Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;

  InfParameter(): number;

  SupParameter(): number;

  AutoIntersectionIsPossible(): boolean;

  ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

  CalculRegion(x: number, y: number, x1: number, x2: number, y1: number, y2: number): number;

  Dump(): void;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dInt_TheProjPCurOfGInter: declare class Geom2dInt_TheProjPCurOfGInter

  constructor

  static FindParameter(C: Adaptor2d_Curve2d, Pnt: gp_Pnt2d, Tol: number): number;
  static FindParameter(C: Adaptor2d_Curve2d, Pnt: gp_Pnt2d, LowParameter: number, HighParameter: number, Tol: number): number;
  static FindParameter(C: Adaptor2d_Curve2d, Pnt: gp_Pnt2d, Tol: number): number;
  static FindParameter(C: Adaptor2d_Curve2d, Pnt: gp_Pnt2d, LowParameter: number, HighParameter: number, Tol: number): number;

  delete(): void;

  [Symbol.dispose](): void;
