# libcascade — IntCurve (2)

3 top-level symbols. Signatures are verbatim typescript.

// This class represents a conic from gp as a parametric curve ( in order to be used by the class PConicTool from IntCurve)
IntCurve_PConic: declare class IntCurve_PConic

constructor

// EpsX is a internal tolerance used in math algorithms, usually about 1e-10 (See FunctionAllRoots for more details)
SetEpsX(EpsDist: number): void;

// Accuracy is the number of samples used to approximate the parametric curve on its domain
SetAccuracy(Nb: number): void;

Accuracy(): number;

EpsX(): number;

// The Conics are manipulated as objects which only depend on three parameters
TypeCurve(): GeomAbs_CurveType;

Axis2(): gp_Ax22d;

Param1(): number;

Param2(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implementation of the ParTool from `IntImpParGen` for conics of gp, using the class PConic from IntCurve
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a tool which computes the parameter of a point near a parametric conic
IntCurve_ProjectOnPConicTool: declare class IntCurve_ProjectOnPConicTool

constructor

// Returns the parameter V of the point on the parametric curve corresponding to the Point Pnt
static FindParameter(C: IntCurve_PConic, Pnt: gp_Pnt2d, Tol: number): number;
static FindParameter(C: IntCurve_PConic, Pnt: gp_Pnt2d, LowParameter: number, HighParameter: number, Tol: number): number;
static FindParameter(C: IntCurve_PConic, Pnt: gp_Pnt2d, Tol: number): number;
static FindParameter(C: IntCurve_PConic, Pnt: gp_Pnt2d, LowParameter: number, HighParameter: number, Tol: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
