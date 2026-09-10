# libcascade — Geom2d

3 top-level symbols. Signatures are verbatim typescript.

// Describes an axis in 2D space
Geom2d_AxisPlacement: declare class Geom2d_AxisPlacement extends Geom2d_Geometry

constructor

Reverse(): void;

// Reverses the unit vector of this axis
Reversed(): Geom2d_AxisPlacement;

// Changes the complete definition of the axis placement
SetAxis(A: gp_Ax2d): void;

// Changes the "Direction" of the axis placement
SetDirection(V: gp_Dir2d): void;

// Changes the "Location" point (origin) of the axis placement
SetLocation(P: gp_Pnt2d): void;

// Computes the angle between the "Direction" of two axis placement in radians
Angle(Other: Geom2d_AxisPlacement): number;

// Converts this axis into a {@link gp_Ax2d`gp_Ax2d`} axis
Ax2d(): gp_Ax2d;

// Returns the "Direction" of <me>
Direction(): gp_Dir2d;

// Returns the "Location" point (origin) of the axis placement
Location(): gp_Pnt2d;

// Applies the transformation T to this axis
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this axis
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a BSpline curve
Geom2d_BSplineCurve: declare class Geom2d_BSplineCurve extends Geom2d_BoundedCurve

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): Geom2dEval_RepCurveDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: Geom2dEval_RepCurveDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Increases the degree of this BSpline curve to Degree
IncreaseDegree(Degree: number): void;

// Increases the multiplicity of the knot <Index> to <M>
IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;
IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;

// Increases by M the multiplicity of the knots of indexes I1 to I2 in the knots table of this BSpline curve
IncrementMultiplicity(I1: number, I2: number, M: number): void;

// Inserts a knot value in the sequence of knots
InsertKnot(U: number, M?: number, ParametricTolerance?: number): void;

// Inserts the values of the array Knots, with the respective multiplicities given by the array Mults, into the knots table of this BSpline curve
InsertKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

// Reduces the multiplicity of the knot of index Index to M
RemoveKnot(Index: number, M: number, Tolerance: number): boolean;

// The new pole is inserted after the pole of range Index
InsertPoleAfter(Index: number, P: gp_Pnt2d, Weight?: number): void;

// The new pole is inserted before the pole of range Index
InsertPoleBefore(Index: number, P: gp_Pnt2d, Weight?: number): void;

// Removes the pole of range Index If the curve was rational it can become non rational
RemovePole(Index: number): void;

// Reverses the orientation of this BSpline curve
Reverse(): void;

// Computes the parameter on the reversed curve for the point of parameter U on this BSpline curve
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

// Computes the parameter normalized within the "first" period of this BSpline curve, if it is periodic
PeriodicNormalization(U?: number): { U: number };

// Changes this BSpline curve into a periodic curve
SetPeriodic(): void;

// Assigns the knot of index Index in the knots table as the origin of this periodic BSpline curve
SetOrigin(Index: number): void;

// Changes this BSpline curve into a non-periodic curve
SetNotPeriodic(): void;

// Modifies this BSpline curve by assigning P to the pole of index Index in the poles table
SetPole(Index: number, P: gp_Pnt2d): void;
SetPole(Index: number, P: gp_Pnt2d, Weight: number): void;
SetPole(Index: number, P: gp_Pnt2d): void;
SetPole(Index: number, P: gp_Pnt2d, Weight: number): void;

// Assigns the weight Weight to the pole of index Index of the poles table
SetWeight(Index: number, Weight: number): void;

// Moves the point of parameter U of this BSpline curve to P
MovePoint(U: number, P: gp_Pnt2d, Index1: number, Index2: number, FirstModifiedPole?: number, LastModifiedPole?: number): { FirstModifiedPole: number; LastModifiedPole: number };

// Move a point with parameter U to P
MovePointAndTangent(U: number, P: gp_Pnt2d, Tangent: gp_Vec2d, Tolerance: number, StartingCondition: number, EndingCondition: number, ErrorStatus?: number): { ErrorStatus: number };

// Returns true if the degree of continuity of this BSpline curve is at least N
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

// Computes the point of parameter U
EvalD0(U: number): gp_Pnt2d;

// Raised if the continuity of the curve is not C1
EvalD1(U: number): Geom2d_Curve_ResD1;

// Raised if the continuity of the curve is not C2
EvalD2(U: number): Geom2d_Curve_ResD2;

// For this BSpline curve, computes
EvalD3(U: number): Geom2d_Curve_ResD3;

// For the point of parameter U of this BSpline curve, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec2d;

// Raised if FromK1 = ToK2
LocalValue(U: number, FromK1: number, ToK2: number): gp_Pnt2d;

// Raised if FromK1 = ToK2
LocalD0(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d): void;
// P: Mutated in place

// Raised if the local continuity of the curve is not C1 between the knot K1 and the knot K2
LocalD1(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d, V1: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place

// Raised if the local continuity of the curve is not C2 between the knot K1 and the knot K2
LocalD2(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Raised if the local continuity of the curve is not C3 between the knot K1 and the knot K2
LocalD3(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// Raised if the local continuity of the curve is not CN between the knot K1 and the knot K2
LocalDN(U: number, FromK1: number, ToK2: number, N: number): gp_Vec2d;

// Returns the last point of the curve
EndPoint(): gp_Pnt2d;

// For a B-spline curve the first parameter (which gives the start point of the curve) is a knot value but if the multiplicity of the first knot index is lower than Degree + 1 it is not the first knot of the curve
FirstUKnotIndex(): number;

// Computes the parametric value of the start point of the curve
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

// Returns the knots sequence
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
Pole(Index: number): gp_Pnt2d;

// Returns the poles of the B-spline curve;
// DEPRECATED
Poles(P: NCollection_Array1_gp_Pnt2d): void;
Poles(): NCollection_Array1_gp_Pnt2d;
Poles(P: NCollection_Array1_gp_Pnt2d): void;
Poles(): NCollection_Array1_gp_Pnt2d;
// P: Mutated in place

// Returns the start point of the curve
StartPoint(): gp_Pnt2d;

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
Transform(T: gp_Trsf2d): void;

// Returns the value of the maximum degree of the normalized B-spline basis functions in this package
static MaxDegree(): number;

// Computes for this BSpline curve the parametric tolerance UTolerance for a given tolerance Tolerance3D (relative to dimensions in the plane)
Resolution(ToleranceUV: number, UTolerance?: number): { UTolerance: number };

// Creates a new object which is a copy of this BSpline curve
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a rational or non-rational Bezier curve
Geom2d_BezierCurve: declare class Geom2d_BezierCurve extends Geom2d_BoundedCurve

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): Geom2dEval_RepCurveDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: Geom2dEval_RepCurveDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Increases the degree of a bezier curve
Increase(Degree: number): void;

// Inserts a pole with its weight in the set of poles after the pole of range Index
InsertPoleAfter(Index: number, P: gp_Pnt2d, Weight?: number): void;

// Inserts a pole with its weight in the set of poles after the pole of range Index
InsertPoleBefore(Index: number, P: gp_Pnt2d, Weight?: number): void;

// Removes the pole of range Index
RemovePole(Index: number): void;

// Reverses the direction of parametrization of <me> Value (NewU) = Value (1 - OldU)
Reverse(): void;

// Returns the parameter on the reversed curve for the point of parameter U on <me>
ReversedParameter(U: number): number;

// Segments the curve between U1 and U2 which can be out of the bounds of the curve
Segment(U1: number, U2: number): void;

// Substitutes the pole of range index with P
SetPole(Index: number, P: gp_Pnt2d): void;
SetPole(Index: number, P: gp_Pnt2d, Weight: number): void;
SetPole(Index: number, P: gp_Pnt2d): void;
SetPole(Index: number, P: gp_Pnt2d, Weight: number): void;

// Changes the weight of the pole of range Index
SetWeight(Index: number, Weight: number): void;

// Returns True if the distance between the first point and the last point of the curve is lower or equal to the Resolution from package gp
IsClosed(): boolean;

// Continuity of the curve, returns True
IsCN(N: number): boolean;

// Returns False
IsPeriodic(): boolean;

// Returns false if all the weights are identical
IsRational(): boolean;

// Returns GeomAbs_CN, which is the continuity of any Bezier curve
Continuity(): GeomAbs_Shape;

// Returns the polynomial degree of the curve
Degree(): number;

// Computes the point of parameter U
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom2d_Curve_ResD3;

// For this Bezier curve, computes
EvalDN(U: number, N: number): gp_Vec2d;

// Returns the end point or start point of this Bezier curve
EndPoint(): gp_Pnt2d;

// Returns the value of the first parameter of this Bezier curve
FirstParameter(): number;

// Returns the value of the last parameter of this Bezier curve
LastParameter(): number;

// Returns the number of poles for this Bezier curve
NbPoles(): number;

// Returns the pole of range Index
Pole(Index: number): gp_Pnt2d;

// Returns all the poles of the curve
// DEPRECATED
Poles(P: NCollection_Array1_gp_Pnt2d): void;
Poles(): NCollection_Array1_gp_Pnt2d;
Poles(P: NCollection_Array1_gp_Pnt2d): void;
Poles(): NCollection_Array1_gp_Pnt2d;
// P: Mutated in place

// Returns Value (U=1), it is the first control point of the curve
StartPoint(): gp_Pnt2d;

// Returns the weight of range Index
Weight(Index: number): number;

// Returns all the weights of the curve
// DEPRECATED
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;
// W: Mutated in place

// Returns a const reference to the weights array
WeightsArray(): NCollection_Array1_double;

// Applies the transformation T to this Bezier curve
Transform(T: gp_Trsf2d): void;

// Returns the value of the maximum polynomial degree of a BezierCurve
static MaxDegree(): number;

// Computes for this Bezier curve the parametric tolerance UTolerance for a given tolerance Tolerance3D (relative to dimensions in the plane)
Resolution(ToleranceUV: number, UTolerance?: number): { UTolerance: number };

// Creates a new object which is a copy of this Bezier curve
Copy(): Geom2d_Geometry;

// Returns Bezier knots {0.0, 1.0} as a static array
Knots(): NCollection_Array1_double;

// Returns Bezier multiplicities for the current degree
Multiplicities(): NCollection_Array1_int;

// Returns Bezier flat knots for the current degree
KnotSequence(): NCollection_Array1_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
