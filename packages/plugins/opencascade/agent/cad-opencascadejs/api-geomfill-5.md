# libcascade — GeomFill (5)

11 top-level symbols. Signatures are verbatim typescript.

// Geometrical Sweep Algorithm
GeomFill_Sweep: declare class GeomFill_Sweep

constructor

// Set parametric information [<First>, <Last>] Sets the parametric bound of the sweeping surface to build
SetDomain(First: number, Last: number, SectionFirst: number, SectionLast: number): void;

// Set Approximation Tolerance Tol3d
SetTolerance(Tol3d: number, BoundTol?: number, Tol2d?: number, TolAngular?: number): void;

// Set the flag that indicates attempt to approximate a C1-continuous surface if a swept surface proved to be C0
SetForceApproxC1(ForceApproxC1: boolean): void;

// returns true if sections are U-Iso This can be produce in some cases when <WithKpart> is True
ExchangeUV(): boolean;

// returns true if Parametrisation sens in U is inverse of parametrisation sens of section (or of path if ExchangeUV)
UReversed(): boolean;

// returns true if Parametrisation sens in V is inverse of parametrisation sens of path (or of section if ExchangeUV)
VReversed(): boolean;

// Build the Sweeep Surface ApproxStyle defines Approximation Strategy
Build(Section: GeomFill_SectionLaw, Methode?: GeomFill_ApproxStyle, Continuity?: GeomAbs_Shape, Degmax?: number, Segmax?: number): void;

// Tells if the Surface is Built
IsDone(): boolean;

// Gets the Approximation error
ErrorOnSurface(): number;

// Gets the Approximation error
ErrorOnRestriction(IsFirst: boolean, UError?: number, VError?: number): { UError: number; VError: number };

// Gets the Approximation error
ErrorOnTrace(IndexOfTrace: number, UError?: number, VError?: number): { UError: number; VError: number };

Surface(): Geom_Surface;

Restriction(IsFirst: boolean): Geom2d_Curve;

NumberOfTrace(): number;

Trace(IndexOfTrace: number): Geom2d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function to approximate by SweepApproximation from Approx
GeomFill_SweepFunction: declare class GeomFill_SweepFunction extends Approx_SweepFunction

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

// get the format of a section
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

// Sets the bounds of the parametric interval on the function This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Returns the resolutions in the sub-space 2d <Index> This information is useful to find a good tolerance in 2d approximation
Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Returns the tolerance to reach in approximation to respect BoundTol error at the Boundary AngleTol tangent error at the Boundary (in radian) SurfTol error inside the surface
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;
// Tol3d: Mutated in place

// Is useful, if <me> has to be run numerical algorithme to perform D0, D1 or D2
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

// used to store the "gradient of gradient"
GeomFill_Tensor: declare class GeomFill_Tensor

constructor

// Initialize all the elements of a Tensor to InitialValue
Init(InitialValue: number): void;

// accesses (in read or write mode) the value of index <Row>, <Col> and <Mat> of a Tensor
Value(Row: number, Col: number, Mat: number): number;

// accesses (in read or write mode) the value of index <Row>, <Col> and <Mat> of a Tensor
ChangeValue(Row: number, Col: number, Mat: number): number;

Multiply(Right: math_VectorBase_double, Product: math_Matrix): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class defining the methods we need to make an algorithmic tangents field
GeomFill_TgtField: declare class GeomFill_TgtField extends Standard_Transient

IsScalable(): boolean;

Scale(Func: Law_BSpline): void;

// Computes the value of the field of tangency at parameter W
Value(W: number): gp_Vec;

// Computes the derivative of the field of tangency at parameter W
D1(W: number): gp_Vec;
D1(W: number, V: gp_Vec, DV: gp_Vec): void;
D1(W: number): gp_Vec;
D1(W: number, V: gp_Vec, DV: gp_Vec): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines an algorithmic tangents field on a boundary of a CoonsAlgPatch
GeomFill_TgtOnCoons: declare class GeomFill_TgtOnCoons extends GeomFill_TgtField

constructor

// Computes the value of the field of tangency at parameter W
Value(W: number): gp_Vec;

// Computes the derivative of the field of tangency at parameter W
D1(W: number): gp_Vec;
D1(W: number, V: gp_Vec, DV: gp_Vec): void;
D1(W: number): gp_Vec;
D1(W: number, V: gp_Vec, DV: gp_Vec): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_Trihedron: typeof GeomFill_Trihedron[keyof typeof GeomFill_Trihedron]

// To define Trihedron along one Curve
GeomFill_TrihedronLaw: declare class GeomFill_TrihedronLaw extends Standard_Transient

// initialize curve of trihedron law
SetCurve(C: Adaptor3d_Curve): boolean;

Copy(): GeomFill_TrihedronLaw;

// Give a status to the {@link Law`Law`} Returns PipeOk (default implementation)
ErrorStatus(): GeomFill_PipeError;

// compute Triedrhon on curve at parameter
D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// Normal: Mutated in place
// BiNormal: Mutated in place

// compute Triedrhon and derivative Trihedron on curve at parameter Warning
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

// Sets the bounds of the parametric interval on the function This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Gets the bounds of the parametric interval on the function
GetInterval(First?: number, Last?: number): { First: number; Last: number };

// Get average value of M(t) and V(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;
// ATangent: Mutated in place
// ANormal: Mutated in place
// ABiNormal: Mutated in place

// Say if the law is Constant
IsConstant(): boolean;

// Say if the law is defined, only by the 3d Geometry of the set Curve Return False by Default
IsOnlyBy3dCurve(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// To define Trihedron along one Curve with a guide
GeomFill_TrihedronWithGuide: declare class GeomFill_TrihedronWithGuide extends GeomFill_TrihedronLaw

Guide(): Adaptor3d_Curve;

Origine(Param1: number, Param2: number): void;

// Returns the current point on guide found by D0, D1 or D2
CurrentPointOnGuide(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Define an Constant Section {@link Law`Law`}
GeomFill_UniformSection: declare class GeomFill_UniformSection extends GeomFill_SectionLaw

constructor

// compute the section for v = param
D0(Param: number, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// Weigths: Mutated in place

// compute the first derivative in v direction of the section for v = param Warning
D1(Param: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// DPoles: Mutated in place
// Weigths: Mutated in place
// DWeigths: Mutated in place

// compute the second derivative in v direction of the section for v = param Warning
D2(Param: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// DPoles: Mutated in place
// D2Poles: Mutated in place
// Weigths: Mutated in place
// DWeigths: Mutated in place
// D2Weigths: Mutated in place

// give if possible an bspline Surface, like iso-v are the section
BSplineSurface(): Geom_BSplineSurface;

// get the format of an section
SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

// get the Knots of the section
Knots(TKnots: NCollection_Array1_double): void;
// TKnots: Mutated in place

// get the Multplicities of the section
Mults(TMults: NCollection_Array1_int): void;
// TMults: Mutated in place

// Returns if the sections are rational or not
IsRational(): boolean;

// Returns if the sections are periodic or not
IsUPeriodic(): boolean;

// Returns if the law isperiodic or not
IsVPeriodic(): boolean;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Sets the bounds of the parametric interval on the function This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Gets the bounds of the parametric interval on the function
GetInterval(First: number, Last: number): { First: number; Last: number };

// Gets the bounds of the function parametric domain
GetDomain(First: number, Last: number): { First: number; Last: number };

// Returns the tolerances associated at each poles to reach in approximation, to satisfy
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;
// Tol3d: Mutated in place

// Get the barycentre of Surface
BarycentreOfSurf(): gp_Pnt;

// Returns the length of the greater section
MaximalSection(): number;

// Compute the minimal value of weight for each poles in all sections
GetMinimalWeight(Weigths: NCollection_Array1_double): void;
// Weigths: Mutated in place

// return True
IsConstant(Error: number): { returnValue: boolean; Error: number };

// Return the constant Section if <me> IsConstant
ConstantSection(): Geom_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_Gordon_BuildReport: interface GeomFill_Gordon_BuildReport

Status: GeomFill_Gordon_ResultStatus

FailedStage: GeomFill_Gordon_BuildStage

IsApproximate: boolean

MaxContactGap: number

MaxReparametrizationDeviation: number

MaxProfileDeviation: number

MaxGuideDeviation: number

MaxApproximationDeviation: number

GeomFill_SequenceOfTrsf: NCollection_Sequence_gp_Trsf
