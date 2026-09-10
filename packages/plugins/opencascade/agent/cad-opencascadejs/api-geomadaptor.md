# libcascade — GeomAdaptor

6 top-level symbols. Signatures are verbatim typescript.

// this package contains the geometric definition of curve and surface necessary to use algorithms
GeomAdaptor: declare class GeomAdaptor

constructor

// Inherited from GHCurve
static MakeCurve(C: Adaptor3d_Curve): Geom_Curve;

// Build a {@link Geom_Surface`Geom_Surface`} using the information from the Surface from Adaptor3d
static MakeSurface(theS: Adaptor3d_Surface, theTrimFlag?: boolean): Geom_Surface;
// theS: Surface adaptor to convert
// theTrimFlag: True if perform trim surface values by adaptor and false otherwise

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides an interface between the services provided by any curve from the package Geom and those required of the curve by algorithms which use it
GeomAdaptor_Curve: declare class GeomAdaptor_Curve extends Adaptor3d_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Curve;

// Reset currently loaded curve (undone `Load()`)
Reset(): void;

// Standard_ConstructionError is raised if theUFirst > theULast + `Precision::PConfusion()`
Load(theCurve: Geom_Curve): void;
Load(theCurve: Geom_Curve, theUFirst: number, theULast: number): void;
Load(theCurve: Geom_Curve): void;
Load(theCurve: Geom_Curve, theUFirst: number, theULast: number): void;

// Provides a curve inherited from Hcurve from Adaptor
Curve(): Geom_Curve;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

// returns the parametric resolution
Resolution(R3d: number): number;

// Returns the type of the curve in the current interval
GetType(): GeomAbs_CurveType;

Line(): gp_Lin;

Circle(): gp_Circ;

Ellipse(): gp_Elips;

Hyperbola(): gp_Hypr;

Parabola(): gp_Parab;

// this should NEVER make a copy of the underlying curve to read the relevant information
Degree(): number;

// this should NEVER make a copy of the underlying curve to read the relevant information
IsRational(): boolean;

// this should NEVER make a copy of the underlying curve to read the relevant information
NbPoles(): number;

// this should NEVER make a copy of the underlying curve to read the relevant information
NbKnots(): number;

// this will NOT make a copy of the Bezier Curve
Bezier(): Geom_BezierCurve;

// this will NOT make a copy of the BSpline Curve
BSpline(): Geom_BSplineCurve;

OffsetCurve(): Geom_OffsetCurve;

// Point evaluation
EvalD0(theU: number): gp_Pnt;

// D1 evaluation
EvalD1(theU: number): Geom_Curve_ResD1;

// D2 evaluation
EvalD2(theU: number): Geom_Curve_ResD2;

// D3 evaluation
EvalD3(theU: number): Geom_Curve_ResD3;

// DN evaluation
EvalDN(theU: number, theN: number): gp_Vec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An interface between the services provided by any surface from the package Geom and those required of the surface by algorithms which use it
GeomAdaptor_Surface: declare class GeomAdaptor_Surface extends Adaptor3d_Surface

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Surface;

// Standard_ConstructionError is raised if theUFirst>theULast or theVFirst>theVLast
Load(theSurf: Geom_Surface): void;
Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
Load(theSurf: Geom_Surface): void;
Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;

Surface(): Geom_Surface;

FirstUParameter(): number;

LastUParameter(): number;

FirstVParameter(): number;

LastVParameter(): number;

// Returns the parametric bounds of the surface
Bounds(theU1?: number, theU2?: number, theV1?: number, theV2?: number): { theU1: number; theU2: number; theV1: number; theV2: number };
// theU1: minimum U parameter
// theU2: maximum U parameter
// theV1: minimum V parameter
// theV2: maximum V parameter

// Returns tolerance in U direction
ToleranceU(): number;

// Returns tolerance in V direction
ToleranceV(): number;

UContinuity(): GeomAbs_Shape;

VContinuity(): GeomAbs_Shape;

// Returns the number of U intervals for continuity
NbUIntervals(S: GeomAbs_Shape): number;

// Returns the number of V intervals for continuity
NbVIntervals(S: GeomAbs_Shape): number;

// Returns the intervals with the requested continuity in the U direction
UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the intervals with the requested continuity in the V direction
VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a surface trimmed in the U direction equivalent of <me> between parameters <First> and <Last>
UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

// Returns a surface trimmed in the V direction between parameters <First> and <Last>
VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

IsUClosed(): boolean;

IsVClosed(): boolean;

IsUPeriodic(): boolean;

UPeriod(): number;

IsVPeriodic(): boolean;

VPeriod(): number;

// Point evaluation
EvalD0(theU: number, theV: number): gp_Pnt;

// D1 evaluation
EvalD1(theU: number, theV: number): Geom_Surface_ResD1;

// D2 evaluation
EvalD2(theU: number, theV: number): Geom_Surface_ResD2;

// D3 evaluation
EvalD3(theU: number, theV: number): Geom_Surface_ResD3;

// DN evaluation
EvalDN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

// Returns the parametric U resolution corresponding to the real space resolution <R3d>
UResolution(R3d: number): number;

// Returns the parametric V resolution corresponding to the real space resolution <R3d>
VResolution(R3d: number): number;

// Returns the type of the surface
GetType(): GeomAbs_SurfaceType;

Plane(): gp_Pln;

Cylinder(): gp_Cylinder;

Cone(): gp_Cone;

Sphere(): gp_Sphere;

Torus(): gp_Torus;

UDegree(): number;

NbUPoles(): number;

VDegree(): number;

NbVPoles(): number;

NbUKnots(): number;

NbVKnots(): number;

IsURational(): boolean;

IsVRational(): boolean;

// This will NOT make a copy of the Bezier Surface
Bezier(): Geom_BezierSurface;

// This will NOT make a copy of the BSpline Surface
BSpline(): Geom_BSplineSurface;

AxeOfRevolution(): gp_Ax1;

Direction(): gp_Dir;

BasisCurve(): Adaptor3d_Curve;

BasisSurface(): Adaptor3d_Surface;

OffsetValue(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Generalised cylinder
GeomAdaptor_SurfaceOfLinearExtrusion: declare class GeomAdaptor_SurfaceOfLinearExtrusion extends GeomAdaptor_Surface

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Surface;

// Changes the Curve
Load(C: Adaptor3d_Curve): void;
Load(V: gp_Dir): void;
Load(theSurf: Geom_Surface): void;
Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
Load(C: Adaptor3d_Curve): void;
Load(V: gp_Dir): void;
Load(theSurf: Geom_Surface): void;
Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
Load(C: Adaptor3d_Curve): void;
Load(V: gp_Dir): void;
Load(theSurf: Geom_Surface): void;
Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
Load(C: Adaptor3d_Curve): void;
Load(V: gp_Dir): void;
Load(theSurf: Geom_Surface): void;
Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;

FirstUParameter(): number;

LastUParameter(): number;

FirstVParameter(): number;

LastVParameter(): number;

UContinuity(): GeomAbs_Shape;

// Return CN
VContinuity(): GeomAbs_Shape;

// Returns the number of U intervals for continuity
NbUIntervals(S: GeomAbs_Shape): number;

// Returns the number of V intervals for continuity
NbVIntervals(S: GeomAbs_Shape): number;

// Returns the intervals with the requested continuity in the U direction
UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the intervals with the requested continuity in the V direction
VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a surface trimmed in the U direction equivalent of <me> between parameters <First> and <Last>
UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

// Returns a surface trimmed in the V direction between parameters <First> and <Last>
VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

IsUClosed(): boolean;

IsVClosed(): boolean;

IsUPeriodic(): boolean;

UPeriod(): number;

IsVPeriodic(): boolean;

VPeriod(): number;

// Returns the parametric U resolution corresponding to the real space resolution <R3d>
UResolution(R3d: number): number;

// Returns the parametric V resolution corresponding to the real space resolution <R3d>
VResolution(R3d: number): number;

// Returns the type of the surface
GetType(): GeomAbs_SurfaceType;

Plane(): gp_Pln;

Cylinder(): gp_Cylinder;

Cone(): gp_Cone;

Sphere(): gp_Sphere;

Torus(): gp_Torus;

UDegree(): number;

NbUPoles(): number;

IsURational(): boolean;

IsVRational(): boolean;

// This will NOT make a copy of the Bezier Surface
Bezier(): Geom_BezierSurface;

// This will NOT make a copy of the BSpline Surface
BSpline(): Geom_BSplineSurface;

AxeOfRevolution(): gp_Ax1;

Direction(): gp_Dir;

BasisCurve(): Adaptor3d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines a complete surface of revolution
GeomAdaptor_SurfaceOfRevolution: declare class GeomAdaptor_SurfaceOfRevolution extends GeomAdaptor_Surface

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Surface;

// Changes the Curve
Load(C: Adaptor3d_Curve): void;
Load(V: gp_Ax1): void;
Load(theSurf: Geom_Surface): void;
Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
Load(C: Adaptor3d_Curve): void;
Load(V: gp_Ax1): void;
Load(theSurf: Geom_Surface): void;
Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
Load(C: Adaptor3d_Curve): void;
Load(V: gp_Ax1): void;
Load(theSurf: Geom_Surface): void;
Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
Load(C: Adaptor3d_Curve): void;
Load(V: gp_Ax1): void;
Load(theSurf: Geom_Surface): void;
Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;

AxeOfRevolution(): gp_Ax1;

FirstUParameter(): number;

LastUParameter(): number;

FirstVParameter(): number;

LastVParameter(): number;

UContinuity(): GeomAbs_Shape;

// Return CN
VContinuity(): GeomAbs_Shape;

// Returns the number of U intervals for continuity
NbUIntervals(S: GeomAbs_Shape): number;

// Returns the number of V intervals for continuity
NbVIntervals(S: GeomAbs_Shape): number;

// Returns the intervals with the requested continuity in the U direction
UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the intervals with the requested continuity in the V direction
VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a surface trimmed in the U direction equivalent of <me> between parameters <First> and <Last>
UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

// Returns a surface trimmed in the V direction between parameters <First> and <Last>
VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

IsUClosed(): boolean;

IsVClosed(): boolean;

IsUPeriodic(): boolean;

UPeriod(): number;

IsVPeriodic(): boolean;

VPeriod(): number;

// Returns the parametric U resolution corresponding to the real space resolution <R3d>
UResolution(R3d: number): number;

// Returns the parametric V resolution corresponding to the real space resolution <R3d>
VResolution(R3d: number): number;

// Returns the type of the surface
GetType(): GeomAbs_SurfaceType;

Plane(): gp_Pln;

Cylinder(): gp_Cylinder;

// Apex of the Cone = Cone.Position().Location() ==> ReferenceRadius = 0
Cone(): gp_Cone;

Sphere(): gp_Sphere;

Torus(): gp_Torus;

VDegree(): number;

NbVPoles(): number;

NbVKnots(): number;

IsURational(): boolean;

IsVRational(): boolean;

// This will NOT make a copy of the Bezier Surface
Bezier(): Geom_BezierSurface;

// This will NOT make a copy of the BSpline Surface
BSpline(): Geom_BSplineSurface;

Axis(): gp_Ax3;

BasisCurve(): Adaptor3d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An adaptor for curves with an applied transformation
GeomAdaptor_TransformedCurve: declare class GeomAdaptor_TransformedCurve extends Adaptor3d_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Curve;

// Loads the curve geometry
Load(theCurve: Geom_Curve): void;
Load(theCurve: Geom_Curve, theFirst: number, theLast: number): void;
Load(theCurve: Geom_Curve): void;
Load(theCurve: Geom_Curve, theFirst: number, theLast: number): void;
// theCurve: underlying geometry

// Sets the curve on surface adaptor
LoadCurveOnSurface(theConSurf: Adaptor3d_CurveOnSurface): void;
// theConSurf: curve on surface adaptor

// Sets the transformation
SetTrsf(theTrsf: gp_Trsf): void;
// theTrsf: transformation to apply

// Returns the transformation
Trsf(): gp_Trsf;

// Returns true if the geometry is a 3D curve (not curve on surface)
Is3DCurve(): boolean;

// Returns true if the geometry is a curve on surface
IsCurveOnSurface(): boolean;

// Returns the underlying {@link GeomAdaptor_Curve`GeomAdaptor_Curve`}
Curve(): GeomAdaptor_Curve;

// Returns the underlying {@link GeomAdaptor_Curve`GeomAdaptor_Curve`} for modification
ChangeCurve(): GeomAdaptor_Curve;

// Returns the CurveOnSurface adaptor
CurveOnSurface(): Adaptor3d_CurveOnSurface;

// Returns the underlying {@link Geom_Curve`Geom_Curve`}
GeomCurve(): Geom_Curve;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

// Point evaluation
EvalD0(theU: number): gp_Pnt;

// D1 evaluation
EvalD1(theU: number): Geom_Curve_ResD1;

// D2 evaluation
EvalD2(theU: number): Geom_Curve_ResD2;

// D3 evaluation
EvalD3(theU: number): Geom_Curve_ResD3;

// DN evaluation
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

Bezier(): Geom_BezierCurve;

BSpline(): Geom_BSplineCurve;

OffsetCurve(): Geom_OffsetCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
