# libcascade — LProp

9 top-level symbols. Signatures are verbatim typescript.

LProp_SurfaceUtils_DirectAccess: declare class LProp_SurfaceUtils_DirectAccess

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LProp_BadContinuity: declare class LProp_BadContinuity extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Identifies the type of a particular point on a curve
LProp_CIType: typeof LProp_CIType[keyof typeof LProp_CIType]

// Implementation class for computing local properties of a curve
LProp_CLProps3d: declare class LProp_CLProps3d

constructor

// Initializes the local properties of the curve for the parameter value
SetParameter(U: number): void;

// Initializes the local properties of the curve for the new curve
SetCurve(C: Adaptor3d_Curve): void;

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

// Stores the parameters of a curve 2d or 3d corresponding to the curvature's extremas and the Inflection's Points
LProp_CurAndInf: declare class LProp_CurAndInf

constructor

AddInflection(Param: number): void;

AddExtCur(Param: number, IsMin: boolean): void;

Clear(): void;

IsEmpty(): boolean;

// Returns the number of points
NbPoints(): number;

// Returns the parameter of the Nth point
Parameter(N: number): number;

// Returns
Type(N: number): LProp_CIType;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LProp_CurveUtils_DirectAccess: declare class LProp_CurveUtils_DirectAccess

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LProp_NotDefined: declare class LProp_NotDefined extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template class for computing local properties of a 3D surface
LProp_SLProps3d: declare class LProp_SLProps3d

constructor

// Initializes the local properties of the surface S for the new surface
SetSurface(S: Adaptor3d_Surface): void;

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

LProp_Status: typeof LProp_Status[keyof typeof LProp_Status]
