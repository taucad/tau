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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dInt_GInter: declare class Geom2dInt_GInter extends IntRes2d_Intersection

constructor

// Intersection between 2 curves
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

// Create a domain from a curve
ComputeDomain(C1: Adaptor2d_Curve2d, TolDomain: number): IntRes2d_Domain;

// Set / get minimum number of points in polygon intersection
SetMinNbSamples(theMinNbSamples: number): void;

GetMinNbSamples(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a Geom2dCurveTool as < Geom2dCurveTool from IntCurve > from a Tool as < Geom2dCurveTool from Adaptor3d >
Geom2dInt_Geom2dCurveTool: declare class Geom2dInt_Geom2dCurveTool

constructor

static GetType(C: Adaptor2d_Curve2d): GeomAbs_CurveType;

// Returns the Lin2d from gp corresponding to the curve C
static Line(C: Adaptor2d_Curve2d): gp_Lin2d;

// Returns the Circ2d from gp corresponding to the curve C
static Circle(C: Adaptor2d_Curve2d): gp_Circ2d;

// Returns the Elips2d from gp corresponding to the curve C
static Ellipse(C: Adaptor2d_Curve2d): gp_Elips2d;

// Returns the Parab2d from gp corresponding to the curve C
static Parabola(C: Adaptor2d_Curve2d): gp_Parab2d;

// Returns the Hypr2d from gp corresponding to the curve C
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

// output the number of interval of continuity C2 of the curve
static NbIntervals(C: Adaptor2d_Curve2d): number;

// compute Tab
static Intervals(C: Adaptor2d_Curve2d, Tab: NCollection_Array1_double): void;
// Tab: Mutated in place

// output the bounds of interval of index <Index> used if Type == Composite
static GetInterval(C: Adaptor2d_Curve2d, Index: number, Tab: NCollection_Array1_double, U1?: number, U2?: number): { U1: number; U2: number };

static Degree(C: Adaptor2d_Curve2d): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dInt_IntConicCurveOfGInter: declare class Geom2dInt_IntConicCurveOfGInter extends IntRes2d_Intersection

constructor

// Intersection between a line and a parametric curve
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter: declare class Geom2dInt_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfGInter extends math_FunctionWithDerivative

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

Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter: declare class Geom2dInt_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfGInter extends math_FunctionSetWithDerivatives

constructor

// returns 2
NbVariables(): number;

// returns 2
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dInt_TheIntConicCurveOfGInter: declare class Geom2dInt_TheIntConicCurveOfGInter extends IntRes2d_Intersection

constructor

// Intersection between a line and a parametric curve
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dInt_TheIntPCurvePCurveOfGInter: declare class Geom2dInt_TheIntPCurvePCurveOfGInter extends IntRes2d_Intersection

constructor

Perform(Curve1: Adaptor2d_Curve2d, Domain1: IntRes2d_Domain, Curve2: Adaptor2d_Curve2d, Domain2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(Curve1: Adaptor2d_Curve2d, Domain1: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(Curve1: Adaptor2d_Curve2d, Domain1: IntRes2d_Domain, Curve2: Adaptor2d_Curve2d, Domain2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(Curve1: Adaptor2d_Curve2d, Domain1: IntRes2d_Domain, TolConf: number, Tol: number): void;

// Set / get minimum number of points in polygon for intersection
SetMinNbSamples(theMinNbSamples: number): void;

GetMinNbSamples(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter: declare class Geom2dInt_TheIntersectorOfTheIntConicCurveOfGInter extends IntRes2d_Intersection

constructor

// Intersection between an implicit curve and a parametrised curve
Perform(ITool: IntCurve_IConicTool, Dom1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, Dom2: IntRes2d_Domain, TolConf: number, Tol: number): void;

FindU(parameter: number, point: gp_Pnt2d, TheParCurev: Adaptor2d_Curve2d, IntCurve_IConicTool: IntCurve_IConicTool): number;

FindV(parameter: number, point: gp_Pnt2d, IntCurve_IConicTool: IntCurve_IConicTool, ParCurve: Adaptor2d_Curve2d, TheParCurveDomain: IntRes2d_Domain, V0: number, V1: number, Tolerance: number): number;

And_Domaine_Objet1_Intersections(IntCurve_IConicTool: IntCurve_IConicTool, TheParCurve: Adaptor2d_Curve2d, TheImpCurveDomain: IntRes2d_Domain, TheParCurveDomain: IntRes2d_Domain, NbResultats: number, Inter2_And_Domain2: NCollection_Array1_double, Inter1: NCollection_Array1_double, Resultat1: NCollection_Array1_double, Resultat2: NCollection_Array1_double, EpsNul: number): { NbResultats: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter: declare class Geom2dInt_ThePolygon2dOfTheIntPCurvePCurveOfGInter extends Intf_Polygon2d

constructor

// The current polygon is modified if most of the points of the polygon are outside the box <OtherBox>
ComputeWithBox(Curve: Adaptor2d_Curve2d, OtherBox: Bnd_Box2d): void;

// Returns the tolerance of the polygon
DeflectionOverEstimation(): number;

SetDeflectionOverEstimation(x: number): void;

// Returns True if the polyline is closed
Closed(clos: boolean): void;
Closed(): boolean;
Closed(clos: boolean): void;
Closed(): boolean;

// Give the number of Segments in the polyline
NbSegments(): number;

// Returns the points of the segment <Index> in the Polygon
Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;
// theBegin: Mutated in place
// theEnd: Mutated in place

// Returns the parameter (On the curve) of the first point of the Polygon
InfParameter(): number;

// Returns the parameter (On the curve) of the last point of the Polygon
SupParameter(): number;

AutoIntersectionIsPossible(): boolean;

// Give an approximation of the parameter on the curve according to the discretization of the Curve
ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

CalculRegion(x: number, y: number, x1: number, x2: number, y1: number, y2: number): number;

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dInt_TheProjPCurOfGInter: declare class Geom2dInt_TheProjPCurOfGInter

constructor

// Returns the parameter V of the point on the parametric curve corresponding to the Point Pnt
static FindParameter(C: Adaptor2d_Curve2d, Pnt: gp_Pnt2d, Tol: number): number;
static FindParameter(C: Adaptor2d_Curve2d, Pnt: gp_Pnt2d, LowParameter: number, HighParameter: number, Tol: number): number;
static FindParameter(C: Adaptor2d_Curve2d, Pnt: gp_Pnt2d, Tol: number): number;
static FindParameter(C: Adaptor2d_Curve2d, Pnt: gp_Pnt2d, LowParameter: number, HighParameter: number, Tol: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
