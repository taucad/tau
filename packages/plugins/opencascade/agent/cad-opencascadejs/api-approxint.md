# libcascade — ApproxInt

2 top-level symbols. Signatures are verbatim typescript.

// This class intended to build knots sequence on discrete set of points for further approximation into bspline curve
ApproxInt_KnotTools: declare class ApproxInt_KnotTools

constructor

// Main function to build optimal knot sequence
static BuildKnots(thePntsXYZ: NCollection_Array1_gp_Pnt, thePntsU1V1: NCollection_Array1_gp_Pnt2d, thePntsU2V2: NCollection_Array1_gp_Pnt2d, thePars: math_VectorBase_double, theApproxXYZ: boolean, theApproxU1V1: boolean, theApproxU2V2: boolean, theMinNbPnts: number, theKnots: NCollection_DynamicArray_int): void;
// thePntsXYZ: Set of 3d points
// thePntsU1V1: Set of 2d points
// thePntsU2V2: Set of 2d points
// thePars: Expected parameters associated with set
// theApproxXYZ: Flag, existence of 3d set
// theApproxU1V1: Flag existence of first 2d set
// theApproxU2V2: Flag existence of second 2d set
// theMinNbPnts: Minimal number of points per knot interval
// theKnots: output knots sequence

// Builds discrete curvature
static BuildCurvature(theCoords: any, theDim: number, thePars: math_VectorBase_double, theCurv: NCollection_Array1_double, theMaxCurv?: number): { theMaxCurv: number };
// theCurv: Mutated in place

// Defines preferable parametrization type for theWL
static DefineParType(theWL: IntPatch_WLine, theFpar: number, theLpar: number, theApproxXYZ: boolean, theApproxU1V1: boolean, theApproxU2V2: boolean): Approx_ParametrizationType;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is root class for classes dedicated to calculate 2d and 3d points and tangents of intersection lines of two surfaces of different types for given u, v parameters of intersection point on two surfaces
ApproxInt_SvSurfaces: declare class ApproxInt_SvSurfaces

// returns True if Tg,Tguv1 Tguv2 can be computed
Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };
// Pt: Mutated in place
// Tg: Mutated in place
// Tguv1: Mutated in place
// Tguv2: Mutated in place

Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

// computes point on curve and parameters on the surfaces
SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;
// Point: Mutated in place

Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

SetUseSolver(theUseSol: boolean): void;

GetUseSolver(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
