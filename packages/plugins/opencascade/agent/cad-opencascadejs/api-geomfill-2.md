# libcascade — GeomFill (2)

16 top-level symbols. Signatures are verbatim typescript.

// Class (should be a structure) storing the information about continuity, normals parallelism, coons conditions and bounds tangents angle on the corner of contour to be filled
GeomFill_CornerState: declare class GeomFill_CornerState

constructor

Gap(): number;
Gap(G: number): void;
Gap(): number;
Gap(G: number): void;

TgtAng(): number;
TgtAng(Ang: number): void;
TgtAng(): number;
TgtAng(Ang: number): void;

HasConstraint(): boolean;

Constraint(): void;

NorAng(): number;
NorAng(Ang: number): void;
NorAng(): number;
NorAng(Ang: number): void;

IsToKill(Scal?: number): { returnValue: boolean; Scal: number };

DoKill(Scal: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defined an Corrected Frenet Trihedron {@link Law`Law`} It is like Frenet with an Torsion's minimization
GeomFill_CorrectedFrenet: declare class GeomFill_CorrectedFrenet extends GeomFill_TrihedronLaw

constructor

Copy(): GeomFill_TrihedronLaw;

// initialize curve of frenet law
SetCurve(C: Adaptor3d_Curve): boolean;

// Sets the bounds of the parametric interval on the function This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

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

// Tries to define the best trihedron mode for the curve
EvaluateBestMode(): GeomFill_Trihedron;

// Get average value of Tangent(t) and Normal(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;
// ATangent: Mutated in place
// ANormal: Mutated in place
// ABiNormal: Mutated in place

// Say if the law is Constant
IsConstant(): boolean;

// Return True
IsOnlyBy3dCurve(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Define location law with an TrihedronLaw and an curve Definition Location is
GeomFill_CurveAndTrihedron: declare class GeomFill_CurveAndTrihedron extends GeomFill_LocationLaw

constructor

// initialize curve of trihedron law
SetCurve(C: Adaptor3d_Curve): boolean;

GetCurve(): Adaptor3d_Curve;

// Set a transformation Matrix like the law M(t) become Mat \* M(t)
SetTrsf(Transfo: gp_Mat): void;

Copy(): GeomFill_LocationLaw;

// compute Location and 2d points
D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
// M: Mutated in place
// V: Mutated in place

// compute location 2d points and associated first derivatives
D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;
// M: Mutated in place
// V: Mutated in place
// DM: Mutated in place
// DV: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place

// compute location 2d points and associated first and second derivatives
D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;
// M: Mutated in place
// V: Mutated in place
// DM: Mutated in place
// DV: Mutated in place
// D2M: Mutated in place
// D2V: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// D2Poles2d: Mutated in place

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

// Get the maximum Norm of the matrix-location part
GetMaximalNorm(): number;

// Get average value of M(t) and V(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;
// AM: Mutated in place
// AV: Mutated in place

// Say if the Location {@link Law`Law`}, is an translation of Location The default implementation is " returns False "
IsTranslation(Error: number): { returnValue: boolean; Error: number };

// Say if the Location {@link Law`Law`}, is a rotation of Location The default implementation is " returns False "
IsRotation(Error: number): { returnValue: boolean; Error: number };

Rotation(Center: gp_Pnt): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_Curved: declare class GeomFill_Curved extends GeomFill_Filling

constructor

Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Darboux case of Frenet Trihedron {@link Law`Law`}
GeomFill_Darboux: declare class GeomFill_Darboux extends GeomFill_TrihedronLaw

constructor

Copy(): GeomFill_TrihedronLaw;

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

// Get average value of Tangent(t) and Normal(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;
// ATangent: Mutated in place
// ANormal: Mutated in place
// ABiNormal: Mutated in place

// Say if the law is Constant
IsConstant(): boolean;

// Return False
IsOnlyBy3dCurve(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of a degenerated boundary (a point)
GeomFill_DegeneratedBound: declare class GeomFill_DegeneratedBound extends GeomFill_Boundary

constructor

Value(U: number): gp_Pnt;

D1(U: number, P: gp_Pnt, V: gp_Vec): void;

Reparametrize(First: number, Last: number, HasDF: boolean, HasDL: boolean, DF: number, DL: number, Rev: boolean): void;

Bounds(First: number, Last: number): { First: number; Last: number };

IsDegenerated(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defined Discrete Trihedron {@link Law`Law`}
GeomFill_DiscreteTrihedron: declare class GeomFill_DiscreteTrihedron extends GeomFill_TrihedronLaw

constructor

Copy(): GeomFill_TrihedronLaw;

Init(): void;

// initialize curve of trihedron law
SetCurve(C: Adaptor3d_Curve): boolean;

// compute Trihedron on curve at parameter
D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// Normal: Mutated in place
// BiNormal: Mutated in place

// compute Trihedron and derivative Trihedron on curve at parameter Warning
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

// Get average value of Tangent(t) and Normal(t) it is usful to make fast approximation of rational surfaces
GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;
// ATangent: Mutated in place
// ANormal: Mutated in place
// ABiNormal: Mutated in place

// Say if the law is Constant
IsConstant(): boolean;

// Return True
IsOnlyBy3dCurve(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_DraftTrihedron: declare class GeomFill_DraftTrihedron extends GeomFill_TrihedronLaw

constructor

SetAngle(Angle: number): void;

Copy(): GeomFill_TrihedronLaw;

// compute Triedrhon and derivative Trihedron on curve at parameter Warning
D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// Normal: Mutated in place
// BiNormal: Mutated in place

// compute Trihedron on curve first and second derivatives
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

// Get average value of Tangent(t) and Normal(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;
// ATangent: Mutated in place
// ANormal: Mutated in place
// ABiNormal: Mutated in place

// Say if the law is Constant
IsConstant(): boolean;

// Return True
IsOnlyBy3dCurve(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Define an Constant Section {@link Law`Law`}
GeomFill_EvolvedSection: declare class GeomFill_EvolvedSection extends GeomFill_SectionLaw

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

// return True If the {@link Law`Law`} isConstant
IsConstant(Error: number): { returnValue: boolean; Error: number };

// Return the constant Section if <me> IsConstant
ConstantSection(): Geom_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for Filling;
GeomFill_Filling: declare class GeomFill_Filling

constructor

NbUPoles(): number;

NbVPoles(): number;

Poles(Poles: NCollection_Array2_gp_Pnt): void;

isRational(): boolean;

Weights(Weights: NCollection_Array2_double): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines the three filling styles used in this package
GeomFill_FillingStyle: typeof GeomFill_FillingStyle[keyof typeof GeomFill_FillingStyle]

// Defined an constant TrihedronLaw
GeomFill_Fixed: declare class GeomFill_Fixed extends GeomFill_TrihedronLaw

constructor

Copy(): GeomFill_TrihedronLaw;

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

// Get average value of Tangent(t) and Normal(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;
// ATangent: Mutated in place
// ANormal: Mutated in place
// ABiNormal: Mutated in place

// Return True
IsConstant(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defined Frenet Trihedron {@link Law`Law`}
GeomFill_Frenet: declare class GeomFill_Frenet extends GeomFill_TrihedronLaw

constructor

Copy(): GeomFill_TrihedronLaw;

Init(): void;

// initialize curve of frenet law
SetCurve(C: Adaptor3d_Curve): boolean;

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

// Get average value of Tangent(t) and Normal(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;
// ATangent: Mutated in place
// ANormal: Mutated in place
// ABiNormal: Mutated in place

// Say if the law is Constant
IsConstant(): boolean;

// Return True
IsOnlyBy3dCurve(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_FunctionDraft: declare class GeomFill_FunctionDraft extends math_FunctionSetWithDerivatives

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

// returns the values <F> of the T derivatives for the parameter Param
DerivT(C: Adaptor3d_Curve, Param: number, W: number, dN: gp_Vec, teta: number, F: math_VectorBase_double): boolean;

// returns the values <F> of the T2 derivatives for the parameter Param
Deriv2T(C: Adaptor3d_Curve, Param: number, W: number, d2N: gp_Vec, teta: number, F: math_VectorBase_double): boolean;

// returns the values <D> of the TX derivatives for the parameter Param
DerivTX(dN: gp_Vec, teta: number, D: math_Matrix): boolean;

// returns the values <T> of the X2 derivatives for the parameter Param
Deriv2X(X: math_VectorBase_double, T: GeomFill_Tensor): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_FunctionGuide: declare class GeomFill_FunctionGuide extends math_FunctionSetWithDerivatives

constructor

SetParam(Param: number, Centre: gp_Pnt, Dir: gp_XYZ, XDir: gp_XYZ): void;

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

// returns the values <F> of the T derivatives for the parameter Param
DerivT(X: math_VectorBase_double, DCentre: gp_XYZ, DDir: gp_XYZ, DFDT: math_VectorBase_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Create a surface using generating lines
GeomFill_Generator: declare class GeomFill_Generator extends GeomFill_Profiler

constructor

// Converts all curves to BSplineCurves
Perform(PTol: number): void;

Surface(): Geom_Surface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
