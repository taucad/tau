# libcascade — Geom (3)

6 top-level symbols. Signatures are verbatim typescript.

// Describes a rational or non-rational Bezier curve
Geom_BezierCurve: declare class Geom_BezierCurve extends Geom_BoundedCurve

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): GeomEval_RepCurveDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: GeomEval_RepCurveDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Increases the degree of a bezier curve
Increase(Degree: number): void;

// Inserts a pole P after the pole of range Index
InsertPoleAfter(Index: number, P: gp_Pnt): void;
InsertPoleAfter(Index: number, P: gp_Pnt, Weight: number): void;
InsertPoleAfter(Index: number, P: gp_Pnt): void;
InsertPoleAfter(Index: number, P: gp_Pnt, Weight: number): void;

// Inserts a pole P before the pole of range Index
InsertPoleBefore(Index: number, P: gp_Pnt): void;
InsertPoleBefore(Index: number, P: gp_Pnt, Weight: number): void;
InsertPoleBefore(Index: number, P: gp_Pnt): void;
InsertPoleBefore(Index: number, P: gp_Pnt, Weight: number): void;

// Removes the pole of range Index
RemovePole(Index: number): void;

// Reverses the direction of parametrization of <me> Value (NewU) = Value (1 - OldU)
Reverse(): void;

// Returns the parameter on the reversed curve for the point of parameter U on <me>
ReversedParameter(U: number): number;

// Segments the curve between U1 and U2 which can be out of the bounds of the curve
Segment(U1: number, U2: number): void;

// Substitutes the pole of range index with P
SetPole(Index: number, P: gp_Pnt): void;
SetPole(Index: number, P: gp_Pnt, Weight: number): void;
SetPole(Index: number, P: gp_Pnt): void;
SetPole(Index: number, P: gp_Pnt, Weight: number): void;

// Changes the weight of the pole of range Index
SetWeight(Index: number, Weight: number): void;

// Returns True if the distance between the first point and the last point of the curve is lower or equal to the Resolution from package gp
IsClosed(): boolean;

// Continuity of the curve, returns True
IsCN(N: number): boolean;

// Returns True if the parametrization of a curve is periodic
IsPeriodic(): boolean;

// Returns false if all the weights are identical
IsRational(): boolean;

// a Bezier curve is CN
Continuity(): GeomAbs_Shape;

// Returns the polynomial degree of the curve
Degree(): number;

// Computes the point of parameter U
EvalD0(U: number): gp_Pnt;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom_Curve_ResD2;

// For this Bezier curve, computes
EvalD3(U: number): Geom_Curve_ResD3;

// For the point of parameter U of this Bezier curve, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec;

// Returns Value (U=0.), it is the first control point of the curve
StartPoint(): gp_Pnt;

// Returns Value (U=1.), it is the last control point of the Bezier curve
EndPoint(): gp_Pnt;

// Returns the value of the first parameter of this Bezier curve
FirstParameter(): number;

// Returns the value of the last parameter of this Bezier curve
LastParameter(): number;

// Returns the number of poles of this Bezier curve
NbPoles(): number;

// Returns the pole of range Index
Pole(Index: number): gp_Pnt;

// Returns all the poles of the curve
// DEPRECATED
Poles(P: NCollection_Array1_gp_Pnt): void;
Poles(): NCollection_Array1_gp_Pnt;
Poles(P: NCollection_Array1_gp_Pnt): void;
Poles(): NCollection_Array1_gp_Pnt;
// P: Mutated in place

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
Transform(T: gp_Trsf): void;

// Returns the value of the maximum polynomial degree of any {@link Geom_BezierCurve`Geom_BezierCurve`} curve
static MaxDegree(): number;

// Computes for this Bezier curve the parametric tolerance UTolerance for a given 3D tolerance Tolerance3D
Resolution(Tolerance3D: number, UTolerance?: number): { UTolerance: number };

// Creates a new object which is a copy of this Bezier curve
Copy(): Geom_Geometry;

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

// Describes a rational or non-rational Bezier surface
Geom_BezierSurface: declare class Geom_BezierSurface extends Geom_BoundedSurface

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Exchanges the direction U and V on a Bezier surface As a consequence
ExchangeUV(): void;

// Increases the degree of this Bezier surface in the two parametric directions
Increase(UDeg: number, VDeg: number): void;

// Inserts a column of poles
InsertPoleColAfter(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleColAfter(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
InsertPoleColAfter(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleColAfter(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

// Inserts a column of poles
InsertPoleColBefore(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleColBefore(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
InsertPoleColBefore(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleColBefore(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

// Inserts a row of poles
InsertPoleRowAfter(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleRowAfter(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
InsertPoleRowAfter(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleRowAfter(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

// Inserts a row of poles
InsertPoleRowBefore(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleRowBefore(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
InsertPoleRowBefore(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
InsertPoleRowBefore(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

// Removes a column of poles
RemovePoleCol(VIndex: number): void;

// Removes a row of poles
RemovePoleRow(UIndex: number): void;

// Modifies this Bezier surface by segmenting it between U1 and U2 in the u parametric direction, and between V1 and V2 in the v parametric direction
Segment(U1: number, U2: number, V1: number, V2: number): void;

// Modifies a pole value
SetPole(UIndex: number, VIndex: number, P: gp_Pnt): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt, Weight: number): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt, Weight: number): void;

// Modifies a column of poles
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

// Modifies a row of poles
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

// Modifies the weight of the pole of range UIndex, VIndex
SetWeight(UIndex: number, VIndex: number, Weight: number): void;

// Modifies a column of weights
SetWeightCol(VIndex: number, CPoleWeights: NCollection_Array1_double): void;

// Modifies a row of weights
SetWeightRow(UIndex: number, CPoleWeights: NCollection_Array1_double): void;

// Changes the orientation of this Bezier surface in the u parametric direction
UReverse(): void;

// Computes the u (or v) parameter on the modified surface, produced by reversing its u (or v) parametric direction, for any point of u parameter U (or of v parameter V) on this Bezier surface
UReversedParameter(U: number): number;

// Changes the orientation of this Bezier surface in the v parametric direction
VReverse(): void;

// Computes the u (or v) parameter on the modified surface, produced by reversing its u (or v) parametric direction, for any point of u parameter U (or of v parameter V) on this Bezier surface
VReversedParameter(V: number): number;

// Returns the parametric bounds U1, U2, V1 and V2 of this Bezier surface
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Returns the continuity of the surface CN
Continuity(): GeomAbs_Shape;

// Computes the point of parameter (U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in the u parametric direction, and Nv in the v parametric direction, at the point of parameters (U, V) of this Bezier surface
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Returns the number of poles in the U direction
NbUPoles(): number;

// Returns the number of poles in the V direction
NbVPoles(): number;

// Returns the pole of range UIndex, VIndex Raised if UIndex < 1 or UIndex > NbUPoles, or VIndex < 1 or VIndex > NbVPoles
Pole(UIndex: number, VIndex: number): gp_Pnt;

// Returns the poles of the Bezier surface
// DEPRECATED
Poles(P: NCollection_Array2_gp_Pnt): void;
Poles(): NCollection_Array2_gp_Pnt;
Poles(P: NCollection_Array2_gp_Pnt): void;
Poles(): NCollection_Array2_gp_Pnt;
// P: Mutated in place

// Returns the degree of the surface in the U direction it is NbUPoles - 1
UDegree(): number;

// Computes the U isoparametric curve
UIso(U: number): Geom_Curve;

// Returns the degree of the surface in the V direction it is NbVPoles - 1
VDegree(): number;

// Computes the V isoparametric curve
VIso(V: number): Geom_Curve;

// Returns the weight of range UIndex, VIndex
Weight(UIndex: number, VIndex: number): number;

// Returns the weights of the Bezier surface
// DEPRECATED
Weights(W: NCollection_Array2_double): void;
Weights(): NCollection_Array2_double;
Weights(W: NCollection_Array2_double): void;
Weights(): NCollection_Array2_double;
// W: Mutated in place

// Returns a const reference to the weights array
WeightsArray(): NCollection_Array2_double;

// Returns True if the first control points row and the last control points row are identical
IsUClosed(): boolean;

// Returns True if the first control points column and the last control points column are identical
IsVClosed(): boolean;

// Returns True, a Bezier surface is always CN
IsCNu(N: number): boolean;

// Returns True, a BezierSurface is always CN
IsCNv(N: number): boolean;

// Returns False
IsUPeriodic(): boolean;

// Returns False
IsVPeriodic(): boolean;

// Returns False if the weights are identical in the U direction, The tolerance criterion is Resolution from package gp
IsURational(): boolean;

// Returns False if the weights are identical in the V direction, The tolerance criterion is Resolution from package gp
IsVRational(): boolean;

// Applies the transformation T to this Bezier surface
Transform(T: gp_Trsf): void;

// Returns the value of the maximum polynomial degree of a Bezier surface
static MaxDegree(): number;

// Computes two tolerance values for this Bezier surface, based on the given tolerance in 3D space Tolerance3D
Resolution(Tolerance3D: number, UTolerance?: number, VTolerance?: number): { UTolerance: number; VTolerance: number };

// Creates a new object which is a copy of this Bezier surface
Copy(): Geom_Geometry;

// Returns Bezier knots {0.0, 1.0} as a static array
UKnots(): NCollection_Array1_double;

// Returns Bezier knots {0.0, 1.0} as a static array
VKnots(): NCollection_Array1_double;

// Returns Bezier multiplicities for the U degree
UMultiplicities(): NCollection_Array1_int;

// Returns Bezier multiplicities for the V degree
VMultiplicities(): NCollection_Array1_int;

// Returns Bezier flat knots for the U degree
UKnotSequence(): NCollection_Array1_double;

// Returns Bezier flat knots for the V degree
VKnotSequence(): NCollection_Array1_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class BoundedCurve describes the common behavior of bounded curves in 3D space
Geom_BoundedCurve: declare class Geom_BoundedCurve extends Geom_Curve

// Returns the end point of the curve
EndPoint(): gp_Pnt;

// Returns the start point of the curve
StartPoint(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The root class for bounded surfaces in 3D space
Geom_BoundedSurface: declare class Geom_BoundedSurface extends Geom_Surface

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a point in 3D space
Geom_CartesianPoint: declare class Geom_CartesianPoint extends Geom_Point

constructor

// Assigns the coordinates X, Y and Z to this point
SetCoord(X: number, Y: number, Z: number): void;

// Set <me> to P.X(), P.Y(), P.Z() coordinates
SetPnt(P: gp_Pnt): void;

// Changes the X coordinate of <me>
SetX(X: number): void;

// Changes the Y coordinate of <me>
SetY(Y: number): void;

// Changes the Z coordinate of <me>
SetZ(Z: number): void;

// Returns the coordinates of <me>
Coord(X: number, Y: number, Z: number): { X: number; Y: number; Z: number };

// Returns a non transient cartesian point with the same coordinates as <me>
Pnt(): gp_Pnt;

// Returns the X coordinate of <me>
X(): number;

// Returns the Y coordinate of <me>
Y(): number;

// Returns the Z coordinate of <me>
Z(): number;

// Applies the transformation T to this point
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this point
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a circle in 3D space
Geom_Circle: declare class Geom_Circle extends Geom_Conic

constructor

// Set <me> so that <me> has the same geometric properties as C
SetCirc(C: gp_Circ): void;

// Assigns the value R to the radius of this circle
SetRadius(R: number): void;

// returns the non transient circle from gp with the same geometric properties as <me>
Circ(): gp_Circ;

// Returns the radius of this circle
Radius(): number;

// Computes the parameter on the reversed circle for the point of parameter U on this circle
ReversedParameter(U: number): number;

// Returns the eccentricity e = 0 for a circle
Eccentricity(): number;

// Returns the value of the first parameter of this circle
FirstParameter(): number;

// Returns the value of the last parameter of this circle
LastParameter(): number;

// returns True
IsClosed(): boolean;

// returns True
IsPeriodic(): boolean;

// Returns the point of parameter U
EvalD0(U: number): gp_Pnt;

// Returns the point of parameter U and the first derivative
EvalD1(U: number): Geom_Curve_ResD1;

// Returns the point of parameter U, the first and second derivatives
EvalD2(U: number): Geom_Curve_ResD2;

// Returns the point of parameter U, the first, second and third derivatives
EvalD3(U: number): Geom_Curve_ResD3;

// Returns the vector corresponding to the derivative for the order of derivation N
EvalDN(U: number, N: number): gp_Vec;

// Applies the transformation T to this circle
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this circle
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
