# libcascade — GeomLProp

5 top-level symbols. Signatures are verbatim typescript.

// These global functions compute the degree of continuity of a 3D curve built by concatenation of two other curves (or portions of curves) at their junction point
GeomLProp: declare class GeomLProp

constructor

// Computes the regularity at the junction between C1 and C2
static Continuity(C1: Geom_Curve, C2: Geom_Curve, u1: number, u2: number, r1: boolean, r2: boolean, tl: number, ta: number): GeomAbs_Shape;
static Continuity(C1: Geom_Curve, C2: Geom_Curve, u1: number, u2: number, r1: boolean, r2: boolean): GeomAbs_Shape;
static Continuity(C1: Geom_Curve, C2: Geom_Curve, u1: number, u2: number, r1: boolean, r2: boolean, tl: number, ta: number): GeomAbs_Shape;
static Continuity(C1: Geom_Curve, C2: Geom_Curve, u1: number, u2: number, r1: boolean, r2: boolean): GeomAbs_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implementation class for computing local properties of a curve
GeomLProp_CLProps: declare class GeomLProp_CLProps

constructor

// Initializes the local properties of the curve for the parameter value
SetParameter(U: number): void;

// Initializes the local properties of the curve for the new curve
SetCurve(C: Geom_Curve): void;

// Returns the Point
Value(): gp_Pnt;

// Returns the first derivative
D1(): gp_Vec;

// Returns the second derivative
D2(): gp_Vec;

// Returns the third derivative
D3(): gp_Vec;

// Returns True if the tangent is defined
IsTangentDefined(): boolean;

// output the tangent direction <D>
Tangent(D: gp_Dir): void;

// Returns the curvature
Curvature(): number;

// Returns the normal direction <N>
Normal(N: gp_Dir): void;

// Returns the centre of curvature
CentreOfCurvature(P: gp_Pnt): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implementation class for computing local properties of a curve
GeomLProp_CLProps2d: declare class GeomLProp_CLProps2d

constructor

// Initializes the local properties of the curve for the parameter value
SetParameter(U: number): void;

// Initializes the local properties of the curve for the new curve
SetCurve(C: Geom2d_Curve): void;

// Returns the Point
Value(): gp_Pnt2d;

// Returns the first derivative
D1(): gp_Vec2d;

// Returns the second derivative
D2(): gp_Vec2d;

// Returns the third derivative
D3(): gp_Vec2d;

// Returns True if the tangent is defined
IsTangentDefined(): boolean;

// output the tangent direction <D>
Tangent(D: gp_Dir2d): void;

// Returns the curvature
Curvature(): number;

// Returns the normal direction <N>
Normal(N: gp_Dir2d): void;

// Returns the centre of curvature
CentreOfCurvature(P: gp_Pnt2d): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An algorithm for computing local properties of a curve
GeomLProp_CurAndInf2d: declare class GeomLProp_CurAndInf2d extends LProp_CurAndInf

constructor

// For the curve C, Computes both the inflection points and the maximum and minimum curvatures
Perform(C: Geom2d_Curve): void;

// For the curve C, Computes the locals extremas of curvature
PerformCurExt(C: Geom2d_Curve): void;

// For the curve C, Computes the inflections
PerformInf(C: Geom2d_Curve): void;

// True if the solutions are found
IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template class for computing local properties of a 3D surface
GeomLProp_SLProps: declare class GeomLProp_SLProps

constructor

// Initializes the local properties of the surface S for the new surface
SetSurface(S: Geom_Surface): void;

// Initializes the local properties of the surface S for the new parameter values (, <V>)
SetParameters(U: number, V: number): void;

// Returns the point
Value(): gp_Pnt;

// Returns the first U derivative
D1U(): gp_Vec;

// Returns the first V derivative
D1V(): gp_Vec;

// Returns the second U derivatives The derivative is computed if it has not been yet
D2U(): gp_Vec;

// Returns the second V derivative
D2V(): gp_Vec;

// Returns the second UV cross-derivative
DUV(): gp_Vec;

// returns True if the U tangent is defined
IsTangentUDefined(): boolean;

// Returns the tangent direction <D> on the iso-V
TangentU(D: gp_Dir): void;
// D: Mutated in place

// returns if the V tangent is defined
IsTangentVDefined(): boolean;

// Returns the tangent direction <D> on the iso-V
TangentV(D: gp_Dir): void;
// D: Mutated in place

// Tells if the normal is defined
IsNormalDefined(): boolean;

// Returns the normal direction
Normal(): gp_Dir;

// returns True if the curvature is defined
IsCurvatureDefined(): boolean;

// returns True if the point is umbilic (i.e
IsUmbilic(): boolean;

// Returns the maximum curvature
MaxCurvature(): number;

// Returns the minimum curvature
MinCurvature(): number;

// Returns the direction of the maximum and minimum curvature <MaxD> and <MinD>
CurvatureDirections(MaxD: gp_Dir, MinD: gp_Dir): void;
// MaxD: Mutated in place
// MinD: Mutated in place

// Returns the mean curvature
MeanCurvature(): number;

// Returns the Gaussian curvature
GaussianCurvature(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
