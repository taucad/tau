# libcascade — Geom (2)

1 top-level symbols. Signatures are verbatim typescript.

// Describes a BSpline surface
Geom_BSplineSurface: declare class Geom_BSplineSurface extends Geom_BoundedSurface

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Exchanges the u and v parametric directions on this BSpline surface
ExchangeUV(): void;

// Sets the surface U periodic
SetUPeriodic(): void;

// Sets the surface V periodic
SetVPeriodic(): void;

// returns the parameter normalized within the period if the surface is periodic
PeriodicNormalization(U?: number, V?: number): { U: number; V: number };

// Assigns the knot of index Index in the knots table in the corresponding parametric direction to be the origin of this periodic BSpline surface
SetUOrigin(Index: number): void;

// Assigns the knot of index Index in the knots table in the corresponding parametric direction to be the origin of this periodic BSpline surface
SetVOrigin(Index: number): void;

// Sets the surface U not periodic
SetUNotPeriodic(): void;

// Sets the surface V not periodic
SetVNotPeriodic(): void;

// Changes the orientation of this BSpline surface in the U parametric direction
UReverse(): void;

// Changes the orientation of this BSpline surface in the V parametric direction
VReverse(): void;

// Computes the u parameter on the modified surface, produced by reversing its U parametric direction, for the point of u parameter U, on this BSpline surface
UReversedParameter(U: number): number;

// Computes the v parameter on the modified surface, produced by reversing its V parametric direction, for the point of v parameter V on this BSpline surface
VReversedParameter(V: number): number;

// Increases the degrees of this BSpline surface to UDegree and VDegree in the u and v parametric directions respectively
IncreaseDegree(UDegree: number, VDegree: number): void;

// Inserts into the knots table for the U parametric direction of this BSpline surface
InsertUKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

// Inserts into the knots table for the V parametric direction of this BSpline surface
InsertVKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

// Reduces to M the multiplicity of the knot of index Index in the U parametric direction
RemoveUKnot(Index: number, M: number, Tolerance: number): boolean;

// Reduces to M the multiplicity of the knot of index Index in the V parametric direction
RemoveVKnot(Index: number, M: number, Tolerance: number): boolean;

// Increases the multiplicity of the knot of range UIndex in the UKnots sequence
IncreaseUMultiplicity(UIndex: number, M: number): void;
IncreaseUMultiplicity(FromI1: number, ToI2: number, M: number): void;
IncreaseUMultiplicity(UIndex: number, M: number): void;
IncreaseUMultiplicity(FromI1: number, ToI2: number, M: number): void;

// Increments the multiplicity of the consecutives uknots FromI1..ToI2 by step
IncrementUMultiplicity(FromI1: number, ToI2: number, Step: number): void;

// Increases the multiplicity of a knot in the V direction
IncreaseVMultiplicity(VIndex: number, M: number): void;
IncreaseVMultiplicity(FromI1: number, ToI2: number, M: number): void;
IncreaseVMultiplicity(VIndex: number, M: number): void;
IncreaseVMultiplicity(FromI1: number, ToI2: number, M: number): void;

// Increments the multiplicity of the consecutives vknots FromI1..ToI2 by step
IncrementVMultiplicity(FromI1: number, ToI2: number, Step: number): void;

// Inserts a knot value in the sequence of UKnots
InsertUKnot(U: number, M: number, ParametricTolerance: number, Add?: boolean): void;

// Inserts a knot value in the sequence of VKnots
InsertVKnot(V: number, M: number, ParametricTolerance: number, Add?: boolean): void;

// Segments the surface between U1 and U2 in the U-Direction
Segment(U1: number, U2: number, V1: number, V2: number, theUTolerance?: number, theVTolerance?: number): void;

// Segments the surface between U1 and U2 in the U-Direction
CheckAndSegment(U1: number, U2: number, V1: number, V2: number, theUTolerance?: number, theVTolerance?: number): void;

// Substitutes the UKnots of range UIndex with K
SetUKnot(UIndex: number, K: number): void;
SetUKnot(UIndex: number, K: number, M: number): void;
SetUKnot(UIndex: number, K: number): void;
SetUKnot(UIndex: number, K: number, M: number): void;

// Changes all the U-knots of the surface
SetUKnots(UK: NCollection_Array1_double): void;

// Substitutes the VKnots of range VIndex with K
SetVKnot(VIndex: number, K: number): void;
SetVKnot(VIndex: number, K: number, M: number): void;
SetVKnot(VIndex: number, K: number): void;
SetVKnot(VIndex: number, K: number, M: number): void;

// Changes all the V-knots of the surface
SetVKnots(VK: NCollection_Array1_double): void;

// Locates the parametric value U in the sequence of UKnots
LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

// Locates the parametric value V in the sequence of knots
LocateV(V: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

// Substitutes the pole of range (UIndex, VIndex) with P
SetPole(UIndex: number, VIndex: number, P: gp_Pnt): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt, Weight: number): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt): void;
SetPole(UIndex: number, VIndex: number, P: gp_Pnt, Weight: number): void;

// Changes a column of poles or a part of this column
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

// Changes a row of poles or a part of this row with the corresponding weights
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;

// Changes the weight of the pole of range UIndex, VIndex
SetWeight(UIndex: number, VIndex: number, Weight: number): void;

// Changes a column of weights of a part of this column
SetWeightCol(VIndex: number, CPoleWeights: NCollection_Array1_double): void;

// Changes a row of weights or a part of this row
SetWeightRow(UIndex: number, CPoleWeights: NCollection_Array1_double): void;

// Move a point with parameter U and V to P
MovePoint(U: number, V: number, P: gp_Pnt, UIndex1: number, UIndex2: number, VIndex1: number, VIndex2: number, UFirstIndex?: number, ULastIndex?: number, VFirstIndex?: number, VLastIndex?: number): { UFirstIndex: number; ULastIndex: number; VFirstIndex: number; VLastIndex: number };

// Returns true if the first control points row and the last control points row are identical
IsUClosed(): boolean;

// Returns true if the first control points column and the last last control points column are identical
IsVClosed(): boolean;

// Returns True if the order of continuity of the surface in the U direction is N
IsCNu(N: number): boolean;

// Returns True if the order of continuity of the surface in the V direction is N
IsCNv(N: number): boolean;

// Returns True if the surface is closed in the U direction and if the B-spline has been turned into a periodic surface using the function SetUPeriodic
IsUPeriodic(): boolean;

// Returns False if for each row of weights all the weights are identical
IsURational(): boolean;

// Returns True if the surface is closed in the V direction and if the B-spline has been turned into a periodic surface using the function SetVPeriodic
IsVPeriodic(): boolean;

// Returns False if for each column of weights all the weights are identical
IsVRational(): boolean;

// Returns the parametric bounds of the surface
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Returns the continuity of the surface
Continuity(): GeomAbs_Shape;

// Computes the Index of the UKnots which gives the first parametric value of the surface in the U direction
FirstUKnotIndex(): number;

// Computes the Index of the VKnots which gives the first parametric value of the surface in the V direction
FirstVKnotIndex(): number;

// Computes the Index of the UKnots which gives the last parametric value of the surface in the U direction
LastUKnotIndex(): number;

// Computes the Index of the VKnots which gives the last parametric value of the surface in the V direction
LastVKnotIndex(): number;

// Returns the number of knots in the U direction
NbUKnots(): number;

// Returns number of poles in the U direction
NbUPoles(): number;

// Returns the number of knots in the V direction
NbVKnots(): number;

// Returns the number of poles in the V direction
NbVPoles(): number;

// Returns the pole of range (UIndex, VIndex)
Pole(UIndex: number, VIndex: number): gp_Pnt;

// Returns the poles of the B-spline surface
// DEPRECATED
Poles(P: NCollection_Array2_gp_Pnt): void;
Poles(): NCollection_Array2_gp_Pnt;
Poles(P: NCollection_Array2_gp_Pnt): void;
Poles(): NCollection_Array2_gp_Pnt;
// P: Mutated in place

// Returns the degree of the normalized B-splines Ni,n in the U direction
UDegree(): number;

// Returns the Knot value of range UIndex
UKnot(UIndex: number): number;

// Returns NonUniform or Uniform or QuasiUniform or PiecewiseBezier
UKnotDistribution(): GeomAbs_BSplKnotDistribution;

// Returns the knots in the U direction
// DEPRECATED
UKnots(Ku: NCollection_Array1_double): void;
UKnots(): NCollection_Array1_double;
UKnots(Ku: NCollection_Array1_double): void;
UKnots(): NCollection_Array1_double;
// Ku: Mutated in place

// Returns the uknots sequence
// DEPRECATED
UKnotSequence(Ku: NCollection_Array1_double): void;
UKnotSequence(): NCollection_Array1_double;
UKnotSequence(Ku: NCollection_Array1_double): void;
UKnotSequence(): NCollection_Array1_double;
// Ku: Mutated in place

// Returns the multiplicity value of knot of range UIndex in the u direction
UMultiplicity(UIndex: number): number;

// Returns the multiplicities of the knots in the U direction
// DEPRECATED
UMultiplicities(Mu: NCollection_Array1_int): void;
UMultiplicities(): NCollection_Array1_int;
UMultiplicities(Mu: NCollection_Array1_int): void;
UMultiplicities(): NCollection_Array1_int;
// Mu: Mutated in place

// Returns the degree of the normalized B-splines Ni,d in the V direction
VDegree(): number;

// Returns the Knot value of range VIndex
VKnot(VIndex: number): number;

// Returns NonUniform or Uniform or QuasiUniform or PiecewiseBezier
VKnotDistribution(): GeomAbs_BSplKnotDistribution;

// Returns the knots in the V direction
// DEPRECATED
VKnots(Kv: NCollection_Array1_double): void;
VKnots(): NCollection_Array1_double;
VKnots(Kv: NCollection_Array1_double): void;
VKnots(): NCollection_Array1_double;
// Kv: Mutated in place

// Returns the vknots sequence
// DEPRECATED
VKnotSequence(Kv: NCollection_Array1_double): void;
VKnotSequence(): NCollection_Array1_double;
VKnotSequence(Kv: NCollection_Array1_double): void;
VKnotSequence(): NCollection_Array1_double;
// Kv: Mutated in place

// Returns the multiplicity value of knot of range VIndex in the v direction
VMultiplicity(VIndex: number): number;

// Returns the multiplicities of the knots in the V direction
// DEPRECATED
VMultiplicities(Mv: NCollection_Array1_int): void;
VMultiplicities(): NCollection_Array1_int;
VMultiplicities(Mv: NCollection_Array1_int): void;
VMultiplicities(): NCollection_Array1_int;
// Mv: Mutated in place

// Returns the weight value of range UIndex, VIndex
Weight(UIndex: number, VIndex: number): number;

// Returns the weights of the B-spline surface
// DEPRECATED
Weights(W: NCollection_Array2_double): void;
Weights(): NCollection_Array2_double;
Weights(W: NCollection_Array2_double): void;
Weights(): NCollection_Array2_double;
// W: Mutated in place

// Returns a const reference to the weights array
WeightsArray(): NCollection_Array2_double;

// Computes the point of parameter (U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in U and Nv in V at (U, V)
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Raised if FromUK1 = ToUK2 or FromVK1 = ToVK2
LocalD0(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt): void;
// P: Mutated in place

// Raised if the local continuity of the surface is not C1 between the knots FromUK1, ToUK2 and FromVK1, ToVK2
LocalD1(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;
// P: Mutated in place
// D1U: Mutated in place
// D1V: Mutated in place

// Raised if the local continuity of the surface is not C2 between the knots FromUK1, ToUK2 and FromVK1, ToVK2
LocalD2(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec): void;
// P: Mutated in place
// D1U: Mutated in place
// D1V: Mutated in place
// D2U: Mutated in place
// D2V: Mutated in place
// D2UV: Mutated in place

// Raised if the local continuity of the surface is not C3 between the knots FromUK1, ToUK2 and FromVK1, ToVK2
LocalD3(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec, D3U: gp_Vec, D3V: gp_Vec, D3UUV: gp_Vec, D3UVV: gp_Vec): void;
// P: Mutated in place
// D1U: Mutated in place
// D1V: Mutated in place
// D2U: Mutated in place
// D2V: Mutated in place
// D2UV: Mutated in place
// D3U: Mutated in place
// D3V: Mutated in place
// D3UUV: Mutated in place
// D3UVV: Mutated in place

// Raised if the local continuity of the surface is not CNu between the knots FromUK1, ToUK2 and CNv between the knots FromVK1, ToVK2
LocalDN(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, Nu: number, Nv: number): gp_Vec;

// Computes the point of parameter U, V on the BSpline surface patch defines between the knots UK1 UK2, VK1, VK2
LocalValue(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number): gp_Pnt;

// Computes the U isoparametric curve
UIso(U: number): Geom_Curve;
UIso(U: number, CheckRational: boolean): Geom_Curve;
UIso(U: number): Geom_Curve;
UIso(U: number, CheckRational: boolean): Geom_Curve;

// Computes the V isoparametric curve
VIso(V: number): Geom_Curve;
VIso(V: number, CheckRational: boolean): Geom_Curve;
VIso(V: number): Geom_Curve;
VIso(V: number, CheckRational: boolean): Geom_Curve;

// Applies the transformation T to this BSpline surface
Transform(T: gp_Trsf): void;

// Returns the value of the maximum degree of the normalized B-spline basis functions in the u and v directions
static MaxDegree(): number;

// Computes two tolerance values for this BSpline surface, based on the given tolerance in 3D space Tolerance3D
Resolution(Tolerance3D: number, UTolerance?: number, VTolerance?: number): { UTolerance: number; VTolerance: number };

// Creates a new object which is a copy of this BSpline surface
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
