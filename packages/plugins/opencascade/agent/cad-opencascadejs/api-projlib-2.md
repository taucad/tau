# libcascade — ProjLib (2)

10 top-level symbols. Signatures are verbatim typescript.

ProjLib_PrjFunc: declare class ProjLib_PrjFunc extends math_FunctionSetWithDerivatives

constructor

// returns the number of variables of the function
NbVariables(): number;

// returns the number of equations of the function
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// returns point on surface
Solution(): gp_Pnt2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ProjLib_PrjResolve: declare class ProjLib_PrjResolve

constructor

// Calculates the ort from C(t) to S with a close point
Perform(t: number, U: number, V: number, Tol: gp_Pnt2d, Inf: gp_Pnt2d, Sup: gp_Pnt2d, FTol?: number, StrictInside?: boolean): void;

// Returns True if the distance is found
IsDone(): boolean;

// Returns the point of the extremum distance
Solution(): gp_Pnt2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class used to project a 3d curve on a plane
ProjLib_ProjectOnPlane: declare class ProjLib_ProjectOnPlane extends Adaptor3d_Curve

constructor

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Curve;

// Sets the Curve and perform the projection
Load(C: Adaptor3d_Curve, Tolerance: number, KeepParametrization?: boolean): void;

GetPlane(): gp_Ax3;

GetDirection(): gp_Dir;

GetCurve(): Adaptor3d_Curve;

GetResult(): GeomAdaptor_Curve;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

// If necessary, breaks the curve in intervals of continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

// Computes the point of parameter theU on the curve
EvalD0(theU: number): gp_Pnt;

// Computes the point of parameter theU on the curve with its first derivative
EvalD1(theU: number): Geom_Curve_ResD1;

// Returns the point and the first and second derivatives at parameter theU
EvalD2(theU: number): Geom_Curve_ResD2;

// Returns the point and the first, second and third derivatives at parameter theU
EvalD3(theU: number): Geom_Curve_ResD3;

// Returns the derivative of order theN at parameter theU
EvalDN(theU: number, theN: number): gp_Vec;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
Resolution(R3d: number): number;

// Returns the type of the curve in the current interval
GetType(): GeomAbs_CurveType;

Line(): gp_Lin;

Circle(): gp_Circ;

Ellipse(): gp_Elips;

Hyperbola(): gp_Hypr;

Parabola(): gp_Parab;

Degree(): number;

IsRational(): boolean;

NbPoles(): number;

NbKnots(): number;

// Warning ! this will NOT make a copy of the Bezier Curve
Bezier(): Geom_BezierCurve;

// Warning ! this will NOT make a copy of the BSpline Curve
BSpline(): Geom_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Project a curve on a surface
ProjLib_ProjectOnSurface: declare class ProjLib_ProjectOnSurface

constructor

// Set the Surface to
Load(S: Adaptor3d_Surface): void;
Load(C: Adaptor3d_Curve, Tolerance: number): void;
Load(S: Adaptor3d_Surface): void;
Load(C: Adaptor3d_Curve, Tolerance: number): void;

IsDone(): boolean;

BSpline(): Geom_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Compute the 2d-curve
ProjLib_ProjectedCurve: declare class ProjLib_ProjectedCurve extends Adaptor2d_Curve2d

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor2d_Curve2d;

// Changes the tolerance used to project the curve on the surface
Load(Tolerance: number): void;
Load(S: Adaptor3d_Surface): void;
Load(Tolerance: number): void;
Load(S: Adaptor3d_Surface): void;

// Performs projecting for given curve
Perform(C: Adaptor3d_Curve): void;

// Set min and max possible degree of result BSpline curve2d, which is got by approximation
SetDegree(theDegMin: number, theDegMax: number): void;

// Set the parameter, which defines maximal value of parametric intervals the projected curve can be cut for approximation
SetMaxSegments(theMaxSegments: number): void;

// Set the parameter, which defines type of boundary condition between segments during approximation
SetBndPnt(theBndPnt: AppParCurves_Constraint): void;

// Set the parameter, which degines maximal possible distance between projected curve and surface
SetMaxDist(theMaxDist: number): void;

GetSurface(): Adaptor3d_Surface;

GetCurve(): Adaptor3d_Curve;

// returns the tolerance reached if an approximation is Done
GetTolerance(): number;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

// If necessary, breaks the curve in intervals of continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(First: number, Last: number, Tol: number): Adaptor2d_Curve2d;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

// Computes the point of parameter U on the curve
Value(U: number): gp_Pnt2d;

// Computes the point of parameter U on the curve
D0(U: number, P: gp_Pnt2d): void;
// P: Mutated in place

// Computes the point of parameter U on the curve with its first derivative
D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;
// P: Mutated in place
// V: Mutated in place

// Returns the point P of parameter U, the first and second derivatives V1 and V2
D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Returns the point P of parameter U, the first, the second and the third derivative
D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// The returned vector gives the value of the derivative for the order of derivation N
DN(U: number, N: number): gp_Vec2d;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
Resolution(R3d: number): number;

// Returns the type of the curve in the current interval
GetType(): GeomAbs_CurveType;

Line(): gp_Lin2d;

Circle(): gp_Circ2d;

Ellipse(): gp_Elips2d;

Hyperbola(): gp_Hypr2d;

Parabola(): gp_Parab2d;

Degree(): number;

IsRational(): boolean;

NbPoles(): number;

NbKnots(): number;

// Warning! This will NOT make a copy of the Bezier Curve If you want to modify the Curve please make a copy yourself
Bezier(): Geom2d_BezierCurve;

// Warning! This will NOT make a copy of the BSpline Curve If you want to modify the Curve please make a copy yourself
BSpline(): Geom2d_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for projection algorithms, stores the result
ProjLib_Projector: declare class ProjLib_Projector

constructor

IsDone(): boolean;

// Set isDone = true;
Done(): void;

GetType(): GeomAbs_CurveType;

SetBSpline(C: Geom2d_BSplineCurve): void;

SetBezier(C: Geom2d_BezierCurve): void;

SetType(Type: GeomAbs_CurveType): void;

IsPeriodic(): boolean;

SetPeriodic(): void;

Line(): gp_Lin2d;

Circle(): gp_Circ2d;

Ellipse(): gp_Elips2d;

Hyperbola(): gp_Hypr2d;

Parabola(): gp_Parab2d;

Bezier(): Geom2d_BezierCurve;

BSpline(): Geom2d_BSplineCurve;

Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;

// Translates the 2d curve to set the part of the curve [CFirst, CLast] in the range [ UFirst, UFirst + Period [
UFrame(CFirst: number, CLast: number, UFirst: number, Period: number): void;

// Translates the 2d curve to set the part of the curve [CFirst, CLast] in the range [ VFirst, VFirst + Period [
VFrame(CFirst: number, CLast: number, VFirst: number, Period: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Projects elementary curves on a sphere
ProjLib_Sphere: declare class ProjLib_Sphere extends ProjLib_Projector

constructor

Init(Sp: gp_Sphere): void;

Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;

// Set the point of parameter U on C in the natural restrictions of the sphere
SetInBounds(U: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Projects elementary curves on a torus
ProjLib_Torus: declare class ProjLib_Torus extends ProjLib_Projector

constructor

Init(To: gp_Torus): void;

Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ProjLib_HSequenceOfHSequenceOfPnt: NCollection_HSequence_handle_NCollection_HSequence_gp_Pnt

ProjLib_SequenceOfHSequenceOfPnt: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt
