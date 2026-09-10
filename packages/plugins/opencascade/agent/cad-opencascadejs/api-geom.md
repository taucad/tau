# libcascade — Geom

4 top-level symbols. Signatures are verbatim typescript.

// Describes an axis in 3D space
Geom_Axis1Placement: declare class Geom_Axis1Placement extends Geom_AxisPlacement

constructor

// Returns a non transient copy of <me>
Ax1(): gp_Ax1;

// Reverses the direction of the axis placement
Reverse(): void;

// Returns a copy of <me> reversed
Reversed(): Geom_Axis1Placement;

// Assigns V to the unit vector of this axis
SetDirection(V: gp_Dir): void;

// Applies the transformation T to this axis
Transform(T: gp_Trsf): void;

// Creates a new object, which is a copy of this axis
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a right-handed coordinate system in 3D space
Geom_Axis2Placement: declare class Geom_Axis2Placement extends Geom_AxisPlacement

constructor

// Assigns the origin and the three unit vectors of A2 to this coordinate system
SetAx2(A2: gp_Ax2): void;

// Changes the main direction of the axis placement
SetDirection(V: gp_Dir): void;

// Changes the "XDirection" of the axis placement, Vx is the new "XDirection"
SetXDirection(Vx: gp_Dir): void;

// Changes the "YDirection" of the axis placement, Vy is the new "YDirection"
SetYDirection(Vy: gp_Dir): void;

// Returns a non transient copy of <me>
Ax2(): gp_Ax2;

// Returns the "XDirection"
XDirection(): gp_Dir;

// Returns the "YDirection"
YDirection(): gp_Dir;

// Transforms an axis placement with a Trsf
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this coordinate system
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class AxisPlacement describes the common behavior of positioning systems in 3D space, such as axis or coordinate systems
Geom_AxisPlacement: declare class Geom_AxisPlacement extends Geom_Geometry

// Assigns A1 as the "main Axis" of this positioning system
SetAxis(A1: gp_Ax1): void;

// Changes the direction of the axis placement
SetDirection(V: gp_Dir): void;

// Assigns the point P as the origin of this positioning system
SetLocation(P: gp_Pnt): void;

// Computes the angular value, in radians, between the "main Direction" of this positioning system and that of positioning system Other
Angle(Other: Geom_AxisPlacement): number;

// Returns the main axis of the axis placement
Axis(): gp_Ax1;

// Returns the main "Direction" of an axis placement
Direction(): gp_Dir;

// Returns the Location point (origin) of the axis placement
Location(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of the B_spline curve
Geom_BSplineCurve: declare class Geom_BSplineCurve extends Geom_BoundedCurve

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): GeomEval_RepCurveDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: GeomEval_RepCurveDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Increases the degree of this BSpline curve to Degree
IncreaseDegree(Degree: number): void;

// Increases the multiplicity of the knot <Index> to <M>
IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;
IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;

// Increment the multiplicities of the knots in [I1,I2] by <M>
IncrementMultiplicity(I1: number, I2: number, M: number): void;

// Inserts a knot value in the sequence of knots
InsertKnot(U: number, M?: number, ParametricTolerance?: number, Add?: boolean): void;

// Inserts a set of knots values in the sequence of knots
InsertKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

// Reduces the multiplicity of the knot of index Index to M
RemoveKnot(Index: number, M: number, Tolerance: number): boolean;

// Changes the direction of parametrization of <me>
Reverse(): void;

// Returns the parameter on the reversed curve for the point of parameter U on <me>
ReversedParameter(U: number): number;

// Modifies this BSpline curve by segmenting it between U1 and U2
Segment(U1: number, U2: number, theTolerance?: number): void;

// Modifies this BSpline curve by assigning the value K to the knot of index Index in the knots table
SetKnot(Index: number, K: number): void;
SetKnot(Index: number, K: number, M: number): void;
SetKnot(Index: number, K: number): void;
SetKnot(Index: number, K: number, M: number): void;

// Modifies this BSpline curve by assigning the array K to its knots table
SetKnots(K: NCollection_Array1_double): void;

// returns the parameter normalized within the period if the curve is periodic
PeriodicNormalization(U?: number): { U: number };

// Changes this BSpline curve into a periodic curve
SetPeriodic(): void;

// Assigns the knot of index Index in the knots table as the origin of this periodic BSpline curve
SetOrigin(Index: number): void;
SetOrigin(U: number, Tol: number): void;
SetOrigin(Index: number): void;
SetOrigin(U: number, Tol: number): void;

// Changes this BSpline curve into a non-periodic curve
SetNotPeriodic(): void;

// Modifies this BSpline curve by assigning P to the pole of index Index in the poles table
SetPole(Index: number, P: gp_Pnt): void;
SetPole(Index: number, P: gp_Pnt, Weight: number): void;
SetPole(Index: number, P: gp_Pnt): void;
SetPole(Index: number, P: gp_Pnt, Weight: number): void;

// Changes the weight for the pole of range Index
SetWeight(Index: number, Weight: number): void;

// Moves the point of parameter U of this BSpline curve to P
MovePoint(U: number, P: gp_Pnt, Index1: number, Index2: number, FirstModifiedPole?: number, LastModifiedPole?: number): { FirstModifiedPole: number; LastModifiedPole: number };

// Move a point with parameter U to P
MovePointAndTangent(U: number, P: gp_Pnt, Tangent: gp_Vec, Tolerance: number, StartingCondition: number, EndingCondition: number, ErrorStatus?: number): { ErrorStatus: number };

// Returns the continuity of the curve, the curve is at least C0
IsCN(N: number): boolean;

// Check if curve has at least G1 continuity in interval [theTf, theTl] Returns true if IsCN(1) or angle between "left" and "right" first derivatives at knots with C0 continuity is less then theAngTol only knots in interval [theTf, theTl] is checked
IsG1(theTf: number, theTl: number, theAngTol: number): boolean;

// Returns true if the distance between the first point and the last point of the curve is lower or equal to Resolution from package gp
IsClosed(): boolean;

// Returns True if the curve is periodic
IsPeriodic(): boolean;

// Returns True if the weights are not identical
IsRational(): boolean;

// Returns the global continuity of the curve
Continuity(): GeomAbs_Shape;

// Returns the degree of this BSpline curve
Degree(): number;

// Returns the point of parameter U
EvalD0(U: number): gp_Pnt;

// Raised if the continuity of the curve is not C1
EvalD1(U: number): Geom_Curve_ResD1;

// Raised if the continuity of the curve is not C2
EvalD2(U: number): Geom_Curve_ResD2;

// Raised if the continuity of the curve is not C3
EvalD3(U: number): Geom_Curve_ResD3;

// For the point of parameter U of this BSpline curve, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec;

// Raised if FromK1 = ToK2
LocalValue(U: number, FromK1: number, ToK2: number): gp_Pnt;

// Raised if FromK1 = ToK2
LocalD0(U: number, FromK1: number, ToK2: number, P: gp_Pnt): void;
// P: Mutated in place

// Raised if the local continuity of the curve is not C1 between the knot K1 and the knot K2
LocalD1(U: number, FromK1: number, ToK2: number, P: gp_Pnt, V1: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place

// Raised if the local continuity of the curve is not C2 between the knot K1 and the knot K2
LocalD2(U: number, FromK1: number, ToK2: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Raised if the local continuity of the curve is not C3 between the knot K1 and the knot K2
LocalD3(U: number, FromK1: number, ToK2: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// Raised if the local continuity of the curve is not CN between the knot K1 and the knot K2
LocalDN(U: number, FromK1: number, ToK2: number, N: number): gp_Vec;

// Returns the last point of the curve
EndPoint(): gp_Pnt;

// Returns the index in the knot array of the knot corresponding to the first or last parameter of this BSpline curve
FirstUKnotIndex(): number;

// Returns the value of the first parameter of this BSpline curve
FirstParameter(): number;

// Returns the knot of range Index
Knot(Index: number): number;

// returns the knot values of the B-spline curve
// DEPRECATED
Knots(K: NCollection_Array1_double): void;
Knots(): NCollection_Array1_double;
Knots(K: NCollection_Array1_double): void;
Knots(): NCollection_Array1_double;
// K: Mutated in place

// Returns K, the knots sequence of this BSpline curve
// DEPRECATED
KnotSequence(K: NCollection_Array1_double): void;
KnotSequence(): NCollection_Array1_double;
KnotSequence(K: NCollection_Array1_double): void;
KnotSequence(): NCollection_Array1_double;
// K: Mutated in place

// Returns NonUniform or Uniform or QuasiUniform or PiecewiseBezier
KnotDistribution(): GeomAbs_BSplKnotDistribution;

// For a BSpline curve the last parameter (which gives the end point of the curve) is a knot value but if the multiplicity of the last knot index is lower than Degree + 1 it is not the last knot of the curve
LastUKnotIndex(): number;

// Computes the parametric value of the end point of the curve
LastParameter(): number;

// Locates the parametric value U in the sequence of knots
LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

// Returns the multiplicity of the knots of range Index
Multiplicity(Index: number): number;

// Returns the multiplicity of the knots of the curve
// DEPRECATED
Multiplicities(M: NCollection_Array1_int): void;
Multiplicities(): NCollection_Array1_int;
Multiplicities(M: NCollection_Array1_int): void;
Multiplicities(): NCollection_Array1_int;
// M: Mutated in place

// Returns the number of knots
NbKnots(): number;

// Returns the number of poles
NbPoles(): number;

// Returns the pole of range Index
Pole(Index: number): gp_Pnt;

// Returns the poles of the B-spline curve;
// DEPRECATED
Poles(P: NCollection_Array1_gp_Pnt): void;
Poles(): NCollection_Array1_gp_Pnt;
Poles(P: NCollection_Array1_gp_Pnt): void;
Poles(): NCollection_Array1_gp_Pnt;
// P: Mutated in place

// Returns the start point of the curve
StartPoint(): gp_Pnt;

// Returns the weight of the pole of range Index
Weight(Index: number): number;

// Returns the weights of the B-spline curve;
// DEPRECATED
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;
// W: Mutated in place

// Returns a const reference to the weights array
WeightsArray(): NCollection_Array1_double;

// Applies the transformation T to this BSpline curve
Transform(T: gp_Trsf): void;

// Returns the value of the maximum degree of the normalized B-spline basis functions in this package
static MaxDegree(): number;

// Computes for this BSpline curve the parametric tolerance UTolerance for a given 3D tolerance Tolerance3D
Resolution(Tolerance3D: number, UTolerance?: number): { UTolerance: number };

// Creates a new object which is a copy of this BSpline curve
Copy(): Geom_Geometry;

// Compare two Bspline curve on identity;
IsEqual(theOther: Geom_BSplineCurve, thePreci: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
