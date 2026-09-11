# libcascade — Adaptor3d

8 top-level symbols. Signatures are verbatim typescript.

Adaptor3d_Curve: declare class Adaptor3d_Curve extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

ShallowCopy(): Adaptor3d_Curve;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

Value(theU: number): gp_Pnt;

D0(theU: number, theP: gp_Pnt): void;

D1(theU: number, theP: gp_Pnt, theV: gp_Vec): void;

D2(theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec): void;

D3(theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec, theV3: gp_Vec): void;

DN(theU: number, theN: number): gp_Vec;

Resolution(R3d: number): number;

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

EvalD0(theU: number): gp_Pnt;

EvalD1(theU: number): Geom_Curve_ResD1;

EvalD2(theU: number): Geom_Curve_ResD2;

EvalD3(theU: number): Geom_Curve_ResD3;

EvalDN(theU: number, theN: number): gp_Vec;

delete(): void;

[Symbol.dispose](): void;

Adaptor3d_CurveOnSurface: declare class Adaptor3d_CurveOnSurface extends Adaptor3d_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

ShallowCopy(): Adaptor3d_Curve;

Load(S: Adaptor3d_Surface): void;
Load(C: Adaptor2d_Curve2d): void;
Load(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface): void;
Load(S: Adaptor3d_Surface): void;
Load(C: Adaptor2d_Curve2d): void;
Load(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface): void;
Load(S: Adaptor3d_Surface): void;
Load(C: Adaptor2d_Curve2d): void;
Load(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface): void;

GetCurve(): Adaptor2d_Curve2d;

GetSurface(): Adaptor3d_Surface;

ChangeCurve(): Adaptor2d_Curve2d;

ChangeSurface(): Adaptor3d_Surface;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

EvalD0(theU: number): gp_Pnt;

EvalD1(theU: number): Geom_Curve_ResD1;

EvalD2(theU: number): Geom_Curve_ResD2;

EvalD3(theU: number): Geom_Curve_ResD3;

EvalDN(theU: number, theN: number): gp_Vec;

Resolution(R3d: number): number;

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

delete(): void;

[Symbol.dispose](): void;

Adaptor3d_HSurfaceTool: declare class Adaptor3d_HSurfaceTool

constructor

static FirstUParameter(theSurf: Adaptor3d_Surface): number;

static FirstVParameter(theSurf: Adaptor3d_Surface): number;

static LastUParameter(theSurf: Adaptor3d_Surface): number;

static LastVParameter(theSurf: Adaptor3d_Surface): number;

static NbUIntervals(theSurf: Adaptor3d_Surface, theSh: GeomAbs_Shape): number;

static NbVIntervals(theSurf: Adaptor3d_Surface, theSh: GeomAbs_Shape): number;

static UIntervals(theSurf: Adaptor3d_Surface, theTab: NCollection_Array1_double, theSh: GeomAbs_Shape): void;

static VIntervals(theSurf: Adaptor3d_Surface, theTab: NCollection_Array1_double, theSh: GeomAbs_Shape): void;

static UTrim(theSurf: Adaptor3d_Surface, theFirst: number, theLast: number, theTol: number): Adaptor3d_Surface;

static VTrim(theSurf: Adaptor3d_Surface, theFirst: number, theLast: number, theTol: number): Adaptor3d_Surface;

static IsUClosed(theSurf: Adaptor3d_Surface): boolean;

static IsVClosed(theSurf: Adaptor3d_Surface): boolean;

static IsUPeriodic(theSurf: Adaptor3d_Surface): boolean;

static UPeriod(theSurf: Adaptor3d_Surface): number;

static IsVPeriodic(theSurf: Adaptor3d_Surface): boolean;

static VPeriod(theSurf: Adaptor3d_Surface): number;

static Value(theSurf: Adaptor3d_Surface, theU: number, theV: number): gp_Pnt;

static D0(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt): void;

static D1(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec): void;

static D2(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec): void;

static D3(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec, theD3U: gp_Vec, theD3V: gp_Vec, theD3UUV: gp_Vec, theD3UVV: gp_Vec): void;

static DN(theSurf: Adaptor3d_Surface, theU: number, theV: number, theNU: number, theNV: number): gp_Vec;

static UResolution(theSurf: Adaptor3d_Surface, theR3d: number): number;

static VResolution(theSurf: Adaptor3d_Surface, theR3d: number): number;

static GetType(theSurf: Adaptor3d_Surface): GeomAbs_SurfaceType;

static Plane(theSurf: Adaptor3d_Surface): gp_Pln;

static Cylinder(theSurf: Adaptor3d_Surface): gp_Cylinder;

static Cone(theSurf: Adaptor3d_Surface): gp_Cone;

static Torus(theSurf: Adaptor3d_Surface): gp_Torus;

static Sphere(theSurf: Adaptor3d_Surface): gp_Sphere;

static Bezier(theSurf: Adaptor3d_Surface): Geom_BezierSurface;

static BSpline(theSurf: Adaptor3d_Surface): Geom_BSplineSurface;

static AxeOfRevolution(theSurf: Adaptor3d_Surface): gp_Ax1;

static Direction(theSurf: Adaptor3d_Surface): gp_Dir;

static BasisCurve(theSurf: Adaptor3d_Surface): Adaptor3d_Curve;

static BasisSurface(theSurf: Adaptor3d_Surface): Adaptor3d_Surface;

static OffsetValue(theSurf: Adaptor3d_Surface): number;

static IsSurfG1(theSurf: Adaptor3d_Surface, theAlongU: boolean, theAngTol?: number): boolean;

static NbSamplesU(S: Adaptor3d_Surface): number;
static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;
static NbSamplesU(S: Adaptor3d_Surface): number;
static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

static NbSamplesV(S: Adaptor3d_Surface): number;
static NbSamplesV(argNo0: Adaptor3d_Surface, v1: number, v2: number): number;
static NbSamplesV(S: Adaptor3d_Surface): number;
static NbSamplesV(argNo0: Adaptor3d_Surface, v1: number, v2: number): number;

delete(): void;

[Symbol.dispose](): void;

Adaptor3d_HVertex: declare class Adaptor3d_HVertex extends Standard_Transient

constructor

Value(): gp_Pnt2d;

Parameter(C: Adaptor2d_Curve2d): number;

Resolution(C: Adaptor2d_Curve2d): number;

Orientation(): TopAbs_Orientation;

IsSame(Other: Adaptor3d_HVertex): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Adaptor3d_InterFunc: declare class Adaptor3d_InterFunc extends math_FunctionWithDerivative

constructor

Value(X: number, F: number): { returnValue: boolean; F: number };

Derivative(X: number, D: number): { returnValue: boolean; D: number };

Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

delete(): void;

[Symbol.dispose](): void;

Adaptor3d_IsoCurve: declare class Adaptor3d_IsoCurve extends Adaptor3d_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

ShallowCopy(): Adaptor3d_Curve;

Load(S: Adaptor3d_Surface): void;
Load(Iso: GeomAbs_IsoType, Param: number): void;
Load(Iso: GeomAbs_IsoType, Param: number, WFirst: number, WLast: number): void;
Load(S: Adaptor3d_Surface): void;
Load(Iso: GeomAbs_IsoType, Param: number): void;
Load(Iso: GeomAbs_IsoType, Param: number, WFirst: number, WLast: number): void;
Load(S: Adaptor3d_Surface): void;
Load(Iso: GeomAbs_IsoType, Param: number): void;
Load(Iso: GeomAbs_IsoType, Param: number, WFirst: number, WLast: number): void;

Surface(): Adaptor3d_Surface;

Iso(): GeomAbs_IsoType;

Parameter(): number;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

EvalD0(theU: number): gp_Pnt;

EvalD1(theU: number): Geom_Curve_ResD1;

EvalD2(theU: number): Geom_Curve_ResD2;

EvalD3(theU: number): Geom_Curve_ResD3;

EvalDN(theU: number, theN: number): gp_Vec;

Resolution(R3d: number): number;

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

delete(): void;

[Symbol.dispose](): void;

Adaptor3d_Surface: declare class Adaptor3d_Surface extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

ShallowCopy(): Adaptor3d_Surface;

FirstUParameter(): number;

LastUParameter(): number;

FirstVParameter(): number;

LastVParameter(): number;

UContinuity(): GeomAbs_Shape;

VContinuity(): GeomAbs_Shape;

NbUIntervals(S: GeomAbs_Shape): number;

NbVIntervals(S: GeomAbs_Shape): number;

UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

IsUClosed(): boolean;

IsVClosed(): boolean;

IsUPeriodic(): boolean;

UPeriod(): number;

IsVPeriodic(): boolean;

VPeriod(): number;

Value(theU: number, theV: number): gp_Pnt;

D0(theU: number, theV: number, theP: gp_Pnt): void;

D1(theU: number, theV: number, theP: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec): void;

D2(theU: number, theV: number, theP: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec): void;

D3(theU: number, theV: number, theP: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec, theD3U: gp_Vec, theD3V: gp_Vec, theD3UUV: gp_Vec, theD3UVV: gp_Vec): void;

DN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

UResolution(R3d: number): number;

VResolution(R3d: number): number;

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

Bezier(): Geom_BezierSurface;

BSpline(): Geom_BSplineSurface;

AxeOfRevolution(): gp_Ax1;

Direction(): gp_Dir;

BasisCurve(): Adaptor3d_Curve;

BasisSurface(): Adaptor3d_Surface;

OffsetValue(): number;

EvalD0(theU: number, theV: number): gp_Pnt;

EvalD1(theU: number, theV: number): Geom_Surface_ResD1;

EvalD2(theU: number, theV: number): Geom_Surface_ResD2;

EvalD3(theU: number, theV: number): Geom_Surface_ResD3;

EvalDN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

delete(): void;

[Symbol.dispose](): void;

Adaptor3d_TopolTool: declare class Adaptor3d_TopolTool extends Standard_Transient

constructor

Initialize(): void;
Initialize(S: Adaptor3d_Surface): void;
Initialize(Curve: Adaptor2d_Curve2d): void;
Initialize(): void;
Initialize(S: Adaptor3d_Surface): void;
Initialize(Curve: Adaptor2d_Curve2d): void;
Initialize(): void;
Initialize(S: Adaptor3d_Surface): void;
Initialize(Curve: Adaptor2d_Curve2d): void;

Init(): void;

More(): boolean;

Value(): Adaptor2d_Curve2d;

Next(): void;

InitVertexIterator(): void;

MoreVertex(): boolean;

Vertex(): Adaptor3d_HVertex;

NextVertex(): void;

Classify(P: gp_Pnt2d, Tol: number, ReacdreOnPeriodic?: boolean): TopAbs_State;

IsThePointOn(P: gp_Pnt2d, Tol: number, ReacdreOnPeriodic?: boolean): boolean;

Orientation(C: Adaptor2d_Curve2d): TopAbs_Orientation;
Orientation(V: Adaptor3d_HVertex): TopAbs_Orientation;
Orientation(C: Adaptor2d_Curve2d): TopAbs_Orientation;
Orientation(V: Adaptor3d_HVertex): TopAbs_Orientation;

Identical(V1: Adaptor3d_HVertex, V2: Adaptor3d_HVertex): boolean;

Has3d(): boolean;

Tol3d(C: Adaptor2d_Curve2d): number;
Tol3d(V: Adaptor3d_HVertex): number;
Tol3d(C: Adaptor2d_Curve2d): number;
Tol3d(V: Adaptor3d_HVertex): number;

Pnt(V: Adaptor3d_HVertex): gp_Pnt;

ComputeSamplePoints(): void;

NbSamplesU(): number;

NbSamplesV(): number;

NbSamples(): number;

UParameters(theArray: NCollection_Array1_double): void;

VParameters(theArray: NCollection_Array1_double): void;

SamplePoint(Index: number, P2d: gp_Pnt2d, P3d: gp_Pnt): void;

DomainIsInfinite(): boolean;

SamplePnts(theDefl: number, theNUmin: number, theNVmin: number): void;

BSplSamplePnts(theDefl: number, theNUmin: number, theNVmin: number): void;

IsUniformSampling(): boolean;

static GetConeApexParam(theC: gp_Cone, theU?: number, theV?: number): { theU: number; theV: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
