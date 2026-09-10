# libcascade — BRepLProp

4 top-level symbols. Signatures are verbatim typescript.

// These global functions compute the degree of continuity of a curve built by concatenation of two edges at their junction point
BRepLProp: declare class BRepLProp

constructor

// Computes the regularity at the junction between C1 and C2
static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number, tl: number, ta: number): GeomAbs_Shape;
static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number): GeomAbs_Shape;
static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number, tl: number, ta: number): GeomAbs_Shape;
static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number): GeomAbs_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implementation class for computing local properties of a curve
BRepLProp_CLProps: declare class BRepLProp_CLProps

constructor

// Initializes the local properties of the curve for the parameter value
SetParameter(U: number): void;

// Initializes the local properties of the curve for the new curve
SetCurve(C: BRepAdaptor_Curve): void;

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

// Template class for computing local properties of a 3D surface
BRepLProp_SLProps: declare class BRepLProp_SLProps

constructor

// Initializes the local properties of the surface S for the new surface
SetSurface(S: BRepAdaptor_Surface): void;

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

BRepLProp_SurfaceTool: declare class BRepLProp_SurfaceTool

constructor

// Computes the point
static Value(S: BRepAdaptor_Surface, U: number, V: number, P: gp_Pnt): void;
// P: Mutated in place

// Computes the point
static D1(S: BRepAdaptor_Surface, U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;
// P: Mutated in place
// D1U: Mutated in place
// D1V: Mutated in place

// Computes the point
static D2(S: BRepAdaptor_Surface, U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, DUV: gp_Vec): void;
// P: Mutated in place
// D1U: Mutated in place
// D1V: Mutated in place
// D2U: Mutated in place
// D2V: Mutated in place
// DUV: Mutated in place

static DN(S: BRepAdaptor_Surface, U: number, V: number, IU: number, IV: number): gp_Vec;

// returns the order of continuity of the Surface
static Continuity(S: BRepAdaptor_Surface): number;

// returns the bounds of the Surface
static Bounds(S: BRepAdaptor_Surface, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
