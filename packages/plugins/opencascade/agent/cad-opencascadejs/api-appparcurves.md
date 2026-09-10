# libcascade — AppParCurves

10 top-level symbols. Signatures are verbatim typescript.

// Parallel Approximation in n curves
AppParCurves: declare class AppParCurves

constructor

static BernsteinMatrix(NbPoles: number, U: math_VectorBase_double, A: math_Matrix): void;

static Bernstein(NbPoles: number, U: math_VectorBase_double, A: math_Matrix, DA: math_Matrix): void;

static SecondDerivativeBernstein(U: number, DDA: math_VectorBase_double): void;

static SplineFunction(NbPoles: number, Degree: number, Parameters: math_VectorBase_double, FlatKnots: math_VectorBase_double, A: math_Matrix, DA: math_Matrix, Index: math_VectorBase_int): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// - NoConstraint
AppParCurves_Constraint: typeof AppParCurves_Constraint[keyof typeof AppParCurves_Constraint]

// associates an index and a constraint for an object
AppParCurves_ConstraintCouple: declare class AppParCurves_ConstraintCouple

constructor

// returns the index of the constraint object
Index(): number;

// returns the constraint of the object
Constraint(): AppParCurves_Constraint;

// Changes the index of the constraint object
SetIndex(TheIndex: number): void;

// Changes the constraint of the object
SetConstraint(Cons: AppParCurves_Constraint): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes a MultiBSpCurve approximating a Multiline
AppParCurves_MultiBSpCurve: declare class AppParCurves_MultiBSpCurve extends AppParCurves_MultiCurve

constructor

// Knots of the multiBSpCurve are assigned to <theknots>
SetKnots(theKnots: NCollection_Array1_double): void;

// Multiplicities of the multiBSpCurve are assigned to <theMults>
SetMultiplicities(theMults: NCollection_Array1_int): void;

// Returns an array of Reals containing the multiplicities of curves resulting from the approximation
Knots(): NCollection_Array1_double;

// Returns an array of Reals containing the multiplicities of curves resulting from the approximation
Multiplicities(): NCollection_Array1_int;

// returns the degree of the curve(s)
Degree(): number;

// returns the value of the point with a parameter U on the BSpline curve number CuIndex
Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
Value(Index: number): AppParCurves_MultiPoint;
Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
Value(Index: number): AppParCurves_MultiPoint;
Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
Value(Index: number): AppParCurves_MultiPoint;
// Pt: Mutated in place

// returns the value of the point with a parameter U on the BSpline curve number CuIndex
D1(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec): void;
D1(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d): void;
D1(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec): void;
D1(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d): void;
// Pt: Mutated in place
// V1: Mutated in place

// returns the value of the point with a parameter U on the BSpline curve number CuIndex
D2(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
D2(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
D2(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
D2(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
// Pt: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes a MultiCurve approximating a Multiline
AppParCurves_MultiCurve: declare class AppParCurves_MultiCurve

constructor

// The number of poles of the MultiCurve will be set to <nbPoles>
SetNbPoles(nbPoles: number): void;

// sets the MultiPoint of range Index to the value <MPoint>
SetValue(Index: number, MPoint: AppParCurves_MultiPoint): void;

// Returns the number of curves resulting from the approximation of a MultiLine
NbCurves(): number;

// Returns the number of poles on curves resulting from the approximation of a MultiLine
NbPoles(): number;

// returns the degree of the curves
Degree(): number;

// returns the dimension of the CuIndex curve
Dimension(CuIndex: number): number;

// returns the Pole array of the curve of range CuIndex
Curve(CuIndex: number, TabPnt: NCollection_Array1_gp_Pnt): void;
Curve(CuIndex: number, TabPnt: NCollection_Array1_gp_Pnt2d): void;
Curve(CuIndex: number, TabPnt: NCollection_Array1_gp_Pnt): void;
Curve(CuIndex: number, TabPnt: NCollection_Array1_gp_Pnt2d): void;
// TabPnt: Mutated in place

// returns the Index MultiPoint
Value(Index: number): AppParCurves_MultiPoint;
Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
Value(Index: number): AppParCurves_MultiPoint;
Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
Value(Index: number): AppParCurves_MultiPoint;
Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;

// returns the Nieme pole of the CuIndex curve
Pole(CuIndex: number, Nieme: number): gp_Pnt;

// returns the Nieme pole of the CuIndex curve
Pole2d(CuIndex: number, Nieme: number): gp_Pnt2d;

// Applies a transformation to the curve of range <CuIndex>
Transform(CuIndex: number, x: number, dx: number, y: number, dy: number, z: number, dz: number): void;

// Applies a transformation to the Curve of range <CuIndex>
Transform2d(CuIndex: number, x: number, dx: number, y: number, dy: number): void;

// returns the value of the point with a parameter U on the Bezier curve number CuIndex
D1(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec): void;
D1(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d): void;
D1(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec): void;
D1(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d): void;
// Pt: Mutated in place
// V1: Mutated in place

// returns the value of the point with a parameter U on the Bezier curve number CuIndex
D2(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
D2(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
D2(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
D2(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
// Pt: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes Points composing a MultiPoint
AppParCurves_MultiPoint: declare class AppParCurves_MultiPoint

constructor

// the 3d Point of range Index of this MultiPoint is set to <Point>
SetPoint(Index: number, Point: gp_Pnt): void;

// returns the 3d Point of range Index
Point(Index: number): gp_Pnt;

// The 2d Point of range Index is set to <Point>
SetPoint2d(Index: number, Point: gp_Pnt2d): void;

// returns the 2d Point of range Index
Point2d(Index: number): gp_Pnt2d;

// returns the dimension of the point of range Index
Dimension(Index: number): number;

// returns the number of points of dimension 3D
NbPoints(): number;

// returns the number of points of dimension 2D
NbPoints2d(): number;

// Applies a transformation to the curve of range <CuIndex>
Transform(CuIndex: number, x: number, dx: number, y: number, dy: number, z: number, dz: number): void;

// Applies a transformation to the Curve of range <CuIndex>
Transform2d(CuIndex: number, x: number, dx: number, y: number, dy: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

AppParCurves_Array1OfConstraintCouple: NCollection_Array1_AppParCurves_ConstraintCouple

AppParCurves_Array1OfMultiPoint: NCollection_Array1_AppParCurves_MultiPoint

AppParCurves_HArray1OfConstraintCouple: NCollection_HArray1_AppParCurves_ConstraintCouple

AppParCurves_SequenceOfMultiCurve: NCollection_Sequence_AppParCurves_MultiCurve
