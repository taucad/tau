# libcascade — GeomFill (4)

12 top-level symbols. Signatures are verbatim typescript.

// Describes functions to construct pipes
GeomFill_Pipe: declare class GeomFill_Pipe

constructor

// Create a pipe with a constant radius with 2 guide-line
Init(Path: Geom_Curve, Radius: number): void;
Init(Path: Geom_Curve, NSections: NCollection_Sequence_handle_Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Option: GeomFill_Trihedron): void;
Init(Path: Geom2d_Curve, Support: Geom_Surface, FirstSect: Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Dir: gp_Dir): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, LastSect: Geom_Curve): void;
Init(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number): void;
Init(Path: Geom_Curve, Guide: Adaptor3d_Curve, FirstSect: Geom_Curve, ByACR: boolean, rotat: boolean): void;
Init(Path: Geom_Curve, Radius: number): void;
Init(Path: Geom_Curve, NSections: NCollection_Sequence_handle_Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Option: GeomFill_Trihedron): void;
Init(Path: Geom2d_Curve, Support: Geom_Surface, FirstSect: Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Dir: gp_Dir): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, LastSect: Geom_Curve): void;
Init(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number): void;
Init(Path: Geom_Curve, Guide: Adaptor3d_Curve, FirstSect: Geom_Curve, ByACR: boolean, rotat: boolean): void;
Init(Path: Geom_Curve, Radius: number): void;
Init(Path: Geom_Curve, NSections: NCollection_Sequence_handle_Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Option: GeomFill_Trihedron): void;
Init(Path: Geom2d_Curve, Support: Geom_Surface, FirstSect: Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Dir: gp_Dir): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, LastSect: Geom_Curve): void;
Init(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number): void;
Init(Path: Geom_Curve, Guide: Adaptor3d_Curve, FirstSect: Geom_Curve, ByACR: boolean, rotat: boolean): void;
Init(Path: Geom_Curve, Radius: number): void;
Init(Path: Geom_Curve, NSections: NCollection_Sequence_handle_Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Option: GeomFill_Trihedron): void;
Init(Path: Geom2d_Curve, Support: Geom_Surface, FirstSect: Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Dir: gp_Dir): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, LastSect: Geom_Curve): void;
Init(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number): void;
Init(Path: Geom_Curve, Guide: Adaptor3d_Curve, FirstSect: Geom_Curve, ByACR: boolean, rotat: boolean): void;
Init(Path: Geom_Curve, Radius: number): void;
Init(Path: Geom_Curve, NSections: NCollection_Sequence_handle_Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Option: GeomFill_Trihedron): void;
Init(Path: Geom2d_Curve, Support: Geom_Surface, FirstSect: Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Dir: gp_Dir): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, LastSect: Geom_Curve): void;
Init(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number): void;
Init(Path: Geom_Curve, Guide: Adaptor3d_Curve, FirstSect: Geom_Curve, ByACR: boolean, rotat: boolean): void;
Init(Path: Geom_Curve, Radius: number): void;
Init(Path: Geom_Curve, NSections: NCollection_Sequence_handle_Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Option: GeomFill_Trihedron): void;
Init(Path: Geom2d_Curve, Support: Geom_Surface, FirstSect: Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Dir: gp_Dir): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, LastSect: Geom_Curve): void;
Init(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number): void;
Init(Path: Geom_Curve, Guide: Adaptor3d_Curve, FirstSect: Geom_Curve, ByACR: boolean, rotat: boolean): void;
Init(Path: Geom_Curve, Radius: number): void;
Init(Path: Geom_Curve, NSections: NCollection_Sequence_handle_Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Option: GeomFill_Trihedron): void;
Init(Path: Geom2d_Curve, Support: Geom_Surface, FirstSect: Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Dir: gp_Dir): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, LastSect: Geom_Curve): void;
Init(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number): void;
Init(Path: Geom_Curve, Guide: Adaptor3d_Curve, FirstSect: Geom_Curve, ByACR: boolean, rotat: boolean): void;
Init(Path: Geom_Curve, Radius: number): void;
Init(Path: Geom_Curve, NSections: NCollection_Sequence_handle_Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Option: GeomFill_Trihedron): void;
Init(Path: Geom2d_Curve, Support: Geom_Surface, FirstSect: Geom_Curve): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, Dir: gp_Dir): void;
Init(Path: Geom_Curve, FirstSect: Geom_Curve, LastSect: Geom_Curve): void;
Init(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number): void;
Init(Path: Geom_Curve, Guide: Adaptor3d_Curve, FirstSect: Geom_Curve, ByACR: boolean, rotat: boolean): void;

// Builds the pipe defined at the time of initialization of this algorithm
Perform(WithParameters: boolean, myPolynomial: boolean): void;
Perform(Tol: number, Polynomial: boolean, Conti: GeomAbs_Shape, MaxDegree: number, NbMaxSegment: number): void;
Perform(WithParameters: boolean, myPolynomial: boolean): void;
Perform(Tol: number, Polynomial: boolean, Conti: GeomAbs_Shape, MaxDegree: number, NbMaxSegment: number): void;

// Returns the surface built by this algorithm
Surface(): Geom_Surface;

// The u parametric direction of the surface constructed by this algorithm usually corresponds to the evolution along the path and the v parametric direction corresponds to the evolution along the section(s)
ExchangeUV(): boolean;

// Sets a flag to try to create as many planes, cylinder,..
GenerateParticularCase(B: boolean): void;
GenerateParticularCase(): boolean;
GenerateParticularCase(B: boolean): void;
GenerateParticularCase(): boolean;

// Returns the approximation's error
ErrorOnSurf(): number;

// Returns whether approximation was done
IsDone(): boolean;

// Returns execution status
GetStatus(): GeomFill_PipeError;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_PipeError: typeof GeomFill_PipeError[keyof typeof GeomFill_PipeError]

GeomFill_PlanFunc: declare class GeomFill_PlanFunc extends math_FunctionWithDerivative

constructor

// computes the value <F>of the function for the variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// computes the derivative <D> of the function for the variable <X>
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// computes the value <F> and the derivative <D> of the function for the variable <X>
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

D2(X: number, F?: number, D1?: number, D2?: number): { F: number; D1: number; D2: number };

DEDT(X: number, DP: gp_Vec, DV: gp_Vec, DF?: number): { DF: number };

D2E(X: number, DP: gp_Vec, D2P: gp_Vec, DV: gp_Vec, D2V: gp_Vec, DFDT?: number, D2FDT2?: number, D2FDTDX?: number): { DFDT: number; D2FDT2: number; D2FDTDX: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// To convert circular section in polynome
GeomFill_PolynomialConvertor: declare class GeomFill_PolynomialConvertor

constructor

// say if <me> is Initialized
Initialized(): boolean;

Init(): void;

Section(FirstPnt: gp_Pnt, Center: gp_Pnt, Dir: gp_Vec, Angle: number, Poles: NCollection_Array1_gp_Pnt): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, Angle: number, DAngle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, D2FirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, D2Dir: gp_Vec, Angle: number, DAngle: number, D2Angle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec): void;
Section(FirstPnt: gp_Pnt, Center: gp_Pnt, Dir: gp_Vec, Angle: number, Poles: NCollection_Array1_gp_Pnt): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, Angle: number, DAngle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, D2FirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, D2Dir: gp_Vec, Angle: number, DAngle: number, D2Angle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec): void;
Section(FirstPnt: gp_Pnt, Center: gp_Pnt, Dir: gp_Vec, Angle: number, Poles: NCollection_Array1_gp_Pnt): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, Angle: number, DAngle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, D2FirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, D2Dir: gp_Vec, Angle: number, DAngle: number, D2Angle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Evaluation of the common BSplineProfile of a group of curves from Geom
GeomFill_Profiler: declare class GeomFill_Profiler

constructor

AddCurve(Curve: Geom_Curve): void;

// Converts all curves to BSplineCurves
Perform(PTol: number): void;

// Raises if not yet perform
Degree(): number;

IsPeriodic(): boolean;

// Raises if not yet perform
NbPoles(): number;

// returns in <Poles> the poles of the BSplineCurve from index <Index> adjusting to the current profile
Poles(Index: number, Poles: NCollection_Array1_gp_Pnt): void;
// Poles: Mutated in place

// returns in <Weights> the weights of the BSplineCurve from index <Index> adjusting to the current profile
Weights(Index: number, Weights: NCollection_Array1_double): void;
// Weights: Mutated in place

// Raises if not yet perform
NbKnots(): number;

// Raises if not yet perform Raises if the lengths of <Knots> and <Mults> are not equal to `NbKnots()`
KnotsAndMults(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int): void;
// Knots: Mutated in place
// Mults: Mutated in place

Curve(Index: number): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// To convert circular section in QuasiAngular Bezier form
GeomFill_QuasiAngularConvertor: declare class GeomFill_QuasiAngularConvertor

constructor

// say if <me> is Initialized
Initialized(): boolean;

Init(): void;

Section(FirstPnt: gp_Pnt, Center: gp_Pnt, Dir: gp_Vec, Angle: number, Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, Angle: number, DAngle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weights: NCollection_Array1_double, DWeights: NCollection_Array1_double): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, D2FirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, D2Dir: gp_Vec, Angle: number, DAngle: number, D2Angle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weights: NCollection_Array1_double, DWeights: NCollection_Array1_double, D2Weights: NCollection_Array1_double): void;
Section(FirstPnt: gp_Pnt, Center: gp_Pnt, Dir: gp_Vec, Angle: number, Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, Angle: number, DAngle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weights: NCollection_Array1_double, DWeights: NCollection_Array1_double): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, D2FirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, D2Dir: gp_Vec, Angle: number, DAngle: number, D2Angle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weights: NCollection_Array1_double, DWeights: NCollection_Array1_double, D2Weights: NCollection_Array1_double): void;
Section(FirstPnt: gp_Pnt, Center: gp_Pnt, Dir: gp_Vec, Angle: number, Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, Angle: number, DAngle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weights: NCollection_Array1_double, DWeights: NCollection_Array1_double): void;
Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, D2FirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, D2Dir: gp_Vec, Angle: number, DAngle: number, D2Angle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weights: NCollection_Array1_double, DWeights: NCollection_Array1_double, D2Weights: NCollection_Array1_double): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// gives the functions needed for instantiation from AppSurf in AppBlend
GeomFill_SectionGenerator: declare class GeomFill_SectionGenerator extends GeomFill_Profiler

constructor

SetParam(Params: NCollection_HArray1_double): void;

GetShape(NbPoles?: number, NbKnots?: number, Degree?: number, NbPoles2d?: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

Knots(TKnots: NCollection_Array1_double): void;

Mults(TMults: NCollection_Array1_int): void;

// Used for the first and last section The method returns true if the derivatives are computed, otherwise it returns false
Section(P: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
// Poles: Mutated in place
// DPoles: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// Weigths: Mutated in place
// DWeigths: Mutated in place

// Returns the parameter of Section
Parameter(P: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// To define section law in sweeping
GeomFill_SectionLaw: declare class GeomFill_SectionLaw extends Standard_Transient

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

// Returns if law is periodic or not
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

// Is useful, if <me> has to run numerical algorithm to perform D0, D1 or D2 The default implementation make nothing
SetTolerance(Tol3d: number, Tol2d: number): void;

// Get the barycentre of Surface
BarycentreOfSurf(): gp_Pnt;

// Returns the length of the greater section
MaximalSection(): number;

// Compute the minimal value of weight for each poles in all sections
GetMinimalWeight(Weigths: NCollection_Array1_double): void;
// Weigths: Mutated in place

// Say if all sections are equals
IsConstant(Error: number): { returnValue: boolean; Error: number };

// Return a copy of the constant Section, if <me> IsConstant
ConstantSection(): Geom_Curve;

// Returns True if all section are circle, with same plane,same center and linear radius evolution Return False by Default
IsConicalLaw(Error: number): { returnValue: boolean; Error: number };

// Return the circle section at parameter , if <me> a IsConicalLaw
CirclSection(Param: number): Geom_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// To place section in sweep Function
GeomFill_SectionPlacement: declare class GeomFill_SectionPlacement

constructor

// To change the section {@link Law`Law`}
SetLocation(L: GeomFill_LocationLaw): void;

Perform(Tol: number): void;
Perform(Path: Adaptor3d_Curve, Tol: number): void;
Perform(ParamOnPath: number, Tol: number): void;
Perform(Tol: number): void;
Perform(Path: Adaptor3d_Curve, Tol: number): void;
Perform(ParamOnPath: number, Tol: number): void;
Perform(Tol: number): void;
Perform(Path: Adaptor3d_Curve, Tol: number): void;
Perform(ParamOnPath: number, Tol: number): void;

IsDone(): boolean;

ParameterOnPath(): number;

ParameterOnSection(): number;

Distance(): number;

Angle(): number;

Transformation(WithTranslation: boolean, WithCorrection?: boolean): gp_Trsf;

// Compute the Section, in the coordinate system given by the Location {@link Law`Law`}
Section(WithTranslation: boolean): Geom_Curve;

// Compute the Section, in the coordinate system given by the Location {@link Law`Law`}
ModifiedSection(WithTranslation: boolean): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a 3d curve as a boundary for a {@link GeomFill_ConstrainedFilling`GeomFill_ConstrainedFilling`} algorithm
GeomFill_SimpleBound: declare class GeomFill_SimpleBound extends GeomFill_Boundary

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

// to represent function C'(t)^C''(t)
GeomFill_SnglrFunc: declare class GeomFill_SnglrFunc extends Adaptor3d_Curve

constructor

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Curve;

SetRatio(Ratio: number): void;

FirstParameter(): number;

LastParameter(): number;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_Stretch: declare class GeomFill_Stretch extends GeomFill_Filling

constructor

Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
