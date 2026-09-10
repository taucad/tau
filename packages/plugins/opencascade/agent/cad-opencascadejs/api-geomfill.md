# libcascade — GeomFill

13 top-level symbols. Signatures are verbatim typescript.

// Tools and Data to filling Surface and Sweep Surfaces
GeomFill: declare class GeomFill

constructor

// Builds a ruled surface between the two curves, Curve1 and Curve2
static Surface(Curve1: Geom_Curve, Curve2: Geom_Curve): Geom_Surface;

static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, nplan: gp_Vec, pt1: gp_Pnt, pt2: gp_Pnt, Rayon: number, Center: gp_Pnt, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): void;
static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Rayon: number, DRayon: number, Center: gp_Pnt, DCenter: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, d2n1w: gp_Vec, d2n2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, d2nplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Dtang1: gp_Vec, Dtang2: gp_Vec, Rayon: number, DRayon: number, D2Rayon: number, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, nplan: gp_Vec, pt1: gp_Pnt, pt2: gp_Pnt, Rayon: number, Center: gp_Pnt, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): void;
static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Rayon: number, DRayon: number, Center: gp_Pnt, DCenter: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, d2n1w: gp_Vec, d2n2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, d2nplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Dtang1: gp_Vec, Dtang2: gp_Vec, Rayon: number, DRayon: number, D2Rayon: number, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, nplan: gp_Vec, pt1: gp_Pnt, pt2: gp_Pnt, Rayon: number, Center: gp_Pnt, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): void;
static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Rayon: number, DRayon: number, Center: gp_Pnt, DCenter: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, d2n1w: gp_Vec, d2n2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, d2nplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Dtang1: gp_Vec, Dtang2: gp_Vec, Rayon: number, DRayon: number, D2Rayon: number, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

static Knots(TypeConv: Convert_ParameterisationType, TKnots: NCollection_Array1_double): void;

static Mults(TypeConv: Convert_ParameterisationType, TMults: NCollection_Array1_int): void;

static GetMinimalWeights(TConv: Convert_ParameterisationType, AngleMin: number, AngleMax: number, Weigths: NCollection_Array1_double): void;

// Used by the generical classes to determine Tolerance for approximation
static GetTolerance(TConv: Convert_ParameterisationType, AngleMin: number, Radius: number, AngularTol: number, SpatialTol: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Approximate a BSplineSurface passing by all the curves described in the SectionGenerator
GeomFill_AppSurf: declare class GeomFill_AppSurf extends AppBlend_Approx

constructor

Init(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean): void;

// Define the type of parametrization used in the approximation
SetParType(ParType: Approx_ParametrizationType): void;

// Define the Continuity used in the approximation
SetContinuity(C: GeomAbs_Shape): void;

// define the Weights associed to the criterium used in the optimization
SetCriteriumWeight(W1: number, W2: number, W3: number): void;

// returns the type of parametrization used in the approximation
ParType(): Approx_ParametrizationType;

// returns the Continuity used in the approximation
Continuity(): GeomAbs_Shape;

// returns the Weights (as percent) associed to the criterium used in the optimization
CriteriumWeight(W1?: number, W2?: number, W3?: number): { W1: number; W2: number; W3: number };

Perform(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator, SpApprox: boolean): void;
Perform(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator, NbMaxP: number): void;
Perform(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator, SpApprox: boolean): void;
Perform(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator, NbMaxP: number): void;

PerformSmoothing(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator): void;

IsDone(): boolean;

SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

UDegree(): number;

VDegree(): number;

SurfPoles(): NCollection_Array2_gp_Pnt;

SurfWeights(): NCollection_Array2_double;

SurfUKnots(): NCollection_Array1_double;

SurfVKnots(): NCollection_Array1_double;

SurfUMults(): NCollection_Array1_int;

SurfVMults(): NCollection_Array1_int;

NbCurves2d(): number;

Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

Curves2dDegree(): number;

Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

Curves2dKnots(): NCollection_Array1_double;

Curves2dMults(): NCollection_Array1_int;

TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

TolCurveOnSurf(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Approximate a sweep surface passing by all the curves described in the SweepSectionGenerator
GeomFill_AppSweep: declare class GeomFill_AppSweep extends AppBlend_Approx

constructor

Init(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean): void;

// Define the type of parametrization used in the approximation
SetParType(ParType: Approx_ParametrizationType): void;

// Define the Continuity used in the approximation
SetContinuity(C: GeomAbs_Shape): void;

// define the Weights associed to the criterium used in the optimization
SetCriteriumWeight(W1: number, W2: number, W3: number): void;

// returns the type of parametrization used in the approximation
ParType(): Approx_ParametrizationType;

// returns the Continuity used in the approximation
Continuity(): GeomAbs_Shape;

// returns the Weights (as percent) associed to the criterium used in the optimization
CriteriumWeight(W1?: number, W2?: number, W3?: number): { W1: number; W2: number; W3: number };

IsDone(): boolean;

SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

UDegree(): number;

VDegree(): number;

SurfPoles(): NCollection_Array2_gp_Pnt;

SurfWeights(): NCollection_Array2_double;

SurfUKnots(): NCollection_Array1_double;

SurfVKnots(): NCollection_Array1_double;

SurfUMults(): NCollection_Array1_int;

SurfVMults(): NCollection_Array1_int;

NbCurves2d(): number;

Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

Curves2dDegree(): number;

Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

Curves2dKnots(): NCollection_Array1_double;

Curves2dMults(): NCollection_Array1_int;

TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

TolCurveOnSurf(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_ApproxStyle: typeof GeomFill_ApproxStyle[keyof typeof GeomFill_ApproxStyle]

// An algorithm for constructing a BSpline surface filled from contiguous BSpline curves which form its boundaries
GeomFill_BSplineCurves: declare class GeomFill_BSplineCurves

constructor

// if the curves cannot be joined Initializes or reinitializes this algorithm with two, three, or four curves - C1, C2, C3, and C4 - and Type, one of the following filling styles
Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, C4: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, C4: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, C4: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;

// Returns the BSpline surface Surface resulting from the computation performed by this algorithm
Surface(): Geom_BSplineSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides an algorithm for constructing a Bezier surface filled from contiguous Bezier curves which form its boundaries
GeomFill_BezierCurves: declare class GeomFill_BezierCurves

constructor

// if the curves cannot be joined Initializes or reinitializes this algorithm with two, three, or four curves - C1, C2, C3, and C4 - and Type, one of the following filling styles
Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, C4: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, C4: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, C4: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;

// Returns the Bezier surface resulting from the computation performed by this algorithm
Surface(): Geom_BezierSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a 3d curve as a boundary for a {@link GeomFill_ConstrainedFilling`GeomFill_ConstrainedFilling`} algorithm
GeomFill_BoundWithSurf: declare class GeomFill_BoundWithSurf extends GeomFill_Boundary

constructor

Value(U: number): gp_Pnt;

D1(U: number, P: gp_Pnt, V: gp_Vec): void;

HasNormals(): boolean;

Norm(U: number): gp_Vec;

D1Norm(U: number, N: gp_Vec, DN: gp_Vec): void;

Reparametrize(First: number, Last: number, HasDF: boolean, HasDL: boolean, DF: number, DL: number, Rev: boolean): void;

Bounds(First: number, Last: number): { First: number; Last: number };

IsDegenerated(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class to define a boundary which will form part of a contour around a gap requiring filling
GeomFill_Boundary: declare class GeomFill_Boundary extends Standard_Transient

Value(U: number): gp_Pnt;

D1(U: number, P: gp_Pnt, V: gp_Vec): void;

HasNormals(): boolean;

Norm(U: number): gp_Vec;

D1Norm(U: number, N: gp_Vec, DN: gp_Vec): void;

Reparametrize(First: number, Last: number, HasDF: boolean, HasDL: boolean, DF: number, DL: number, Rev: boolean): void;

Points(PFirst: gp_Pnt, PLast: gp_Pnt): void;

Bounds(First: number, Last: number): { First: number; Last: number };

IsDegenerated(): boolean;

Tol3d(): number;
Tol3d(Tol: number): void;
Tol3d(): number;
Tol3d(Tol: number): void;

Tolang(): number;
Tolang(Tol: number): void;
Tolang(): number;
Tolang(Tol: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Circular Blend Function to approximate by SweepApproximation from Approx
GeomFill_CircularBlendFunc: declare class GeomFill_CircularBlendFunc extends Approx_SweepFunction

constructor

// compute the section for v = param
D0(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// Poles2d: Mutated in place
// Weigths: Mutated in place

// compute the first derivative in v direction of the section for v = param
D1(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// DPoles: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// Weigths: Mutated in place
// DWeigths: Mutated in place

// compute the second derivative in v direction of the section for v = param
D2(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// DPoles: Mutated in place
// D2Poles: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// D2Poles2d: Mutated in place
// Weigths: Mutated in place
// DWeigths: Mutated in place
// D2Weigths: Mutated in place

// get the number of 2d curves to approximate
Nb2dCurves(): number;

// get the format of an section
SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

// get the Knots of the section
Knots(TKnots: NCollection_Array1_double): void;
// TKnots: Mutated in place

// get the Multplicities of the section
Mults(TMults: NCollection_Array1_int): void;
// TMults: Mutated in place

// Returns if the section is rational or not
IsRational(): boolean;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Sets the bounds of the parametric interval on the fonction This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Returns the tolerance to reach in approximation to respect BoundTol error at the Boundary AngleTol tangent error at the Boundary (in radian) SurfTol error inside the surface
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;
// Tol3d: Mutated in place

// Is useful, if (me) has to be run numerical algorithm to perform D0, D1 or D2
SetTolerance(Tol3d: number, Tol2d: number): void;

// Get the barycentre of Surface
BarycentreOfSurf(): gp_Pnt;

// Returns the length of the maximum section
MaximalSection(): number;

// Compute the minimal value of weight for each poles of all sections
GetMinimalWeight(Weigths: NCollection_Array1_double): void;
// Weigths: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defined a Trihedron {@link Law`Law`} where the BiNormal, is fixed
GeomFill_ConstantBiNormal: declare class GeomFill_ConstantBiNormal extends GeomFill_TrihedronLaw

constructor

Copy(): GeomFill_TrihedronLaw;

// initialize curve of trihedron law
SetCurve(C: Adaptor3d_Curve): boolean;

// Computes Triedrhon on curve at parameter
D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// Normal: Mutated in place
// BiNormal: Mutated in place

// Computes Triedrhon and derivative Trihedron on curve at parameter Warning
D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// DTangent: Mutated in place
// Normal: Mutated in place
// DNormal: Mutated in place
// BiNormal: Mutated in place
// DBiNormal: Mutated in place

// compute Trihedron on curve first and second derivatives
D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// DTangent: Mutated in place
// D2Tangent: Mutated in place
// Normal: Mutated in place
// DNormal: Mutated in place
// D2Normal: Mutated in place
// BiNormal: Mutated in place
// DBiNormal: Mutated in place
// D2BiNormal: Mutated in place

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Gets average value of Tangent(t) and Normal(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;
// ATangent: Mutated in place
// ANormal: Mutated in place
// ABiNormal: Mutated in place

// Says if the law is Constant
IsConstant(): boolean;

// Return True
IsOnlyBy3dCurve(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An algorithm for constructing a BSpline surface filled from a series of boundaries which serve as path constraints and optionally, as tangency constraints
GeomFill_ConstrainedFilling: declare class GeomFill_ConstrainedFilling

constructor

// Constructs a BSpline surface filled from the series of boundaries B1, B2, B3 and, if need be, B4, which serve
Init(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, NoCheck: boolean): void;
Init(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, B4: GeomFill_Boundary, NoCheck: boolean): void;
Init(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, NoCheck: boolean): void;
Init(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, B4: GeomFill_Boundary, NoCheck: boolean): void;

// Allows to modify domain on which the blending function associated to the constrained boundary B will propag the influence of the field of tangency
SetDomain(l: number, B: GeomFill_BoundWithSurf): void;

// Computes the new poles of the surface using the new blending functions set by several calls to SetDomain
ReBuild(): void;

// Returns the bound of index i after sort
Boundary(I: number): GeomFill_Boundary;

// Returns the BSpline surface after computation of the fill by this framework
Surface(): Geom_BSplineSurface;

// Internal use for Advmath approximation call
Eval(W: number, Ord: number, Result?: number): { returnValue: number; Result: number };

// Computes the fields of tangents on 30 points along the bound I, these are not the constraint tangents but gives an idea of the coonsAlgPatch regularity
CheckCoonsAlgPatch(I: number): void;

// Computes the fields of tangents and normals on 30 points along the bound I, draw them, and computes the max dot product that must be near than 0
CheckTgteField(I: number): void;

// Computes values and normals along the bound I and compare them to the approx result curves (bound and tgte field) , draw the normals and tangents
CheckApprox(I: number): void;

// Computes values and normals along the bound I on both constraint surface and result surface, draw the normals, and computes the max distance between values and the max angle between normals
CheckResult(I: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_Coons: declare class GeomFill_Coons extends GeomFill_Filling

constructor

Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides evaluation methods on an algorithmic patch (based on 4 Curves) defined by its boundaries and blending functions
GeomFill_CoonsAlgPatch: declare class GeomFill_CoonsAlgPatch extends Standard_Transient

constructor

// Give the blending functions
Func(): { f1: Law_Function; f2: Law_Function; [Symbol.dispose](): void };
Func(I: number): Law_Function;
Func(): { f1: Law_Function; f2: Law_Function; [Symbol.dispose](): void };
Func(I: number): Law_Function;

// Set the blending functions
SetFunc(f1: Law_Function, f2: Law_Function): void;

// Computes the value on the algorithmic patch at parameters U and V
Value(U: number, V: number): gp_Pnt;

// Computes the d/dU partial derivative on the algorithmic patch at parameters U and V
D1U(U: number, V: number): gp_Vec;

// Computes the d/dV partial derivative on the algorithmic patch at parameters U and V
D1V(U: number, V: number): gp_Vec;

// Computes the d2/dUdV partial derivative on the algorithmic patch made with linear blending functions at parameter U and V
DUV(U: number, V: number): gp_Vec;

Corner(I: number): gp_Pnt;

Bound(I: number): GeomFill_Boundary;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
