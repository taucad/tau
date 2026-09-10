# libcascade — IntCurvesFace

2 top-level symbols. Signatures are verbatim typescript.

IntCurvesFace_Intersector: declare class IntCurvesFace_Intersector extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Perform the intersection between the segment L and the loaded face
Perform(L: gp_Lin, PInf: number, PSup: number): void;
Perform(HCu: Adaptor3d_Curve, PInf: number, PSup: number): void;
Perform(L: gp_Lin, PInf: number, PSup: number): void;
Perform(HCu: Adaptor3d_Curve, PInf: number, PSup: number): void;

// Return the surface type
SurfaceType(): GeomAbs_SurfaceType;

// True is returned when the intersection have been computed
IsDone(): boolean;

NbPnt(): number;

// Returns the U parameter of the ith intersection point on the surface
UParameter(I: number): number;

// Returns the V parameter of the ith intersection point on the surface
VParameter(I: number): number;

// Returns the parameter of the ith intersection point on the line
WParameter(I: number): number;

// Returns the geometric point of the ith intersection between the line and the surface
Pnt(I: number): gp_Pnt;

// Returns the ith transition of the line on the surface
Transition(I: number): IntCurveSurface_TransitionOnCurve;

// Returns the ith state of the point on the face
State(I: number): TopAbs_State;

// Returns true if curve is parallel or belongs face surface This case is recognized only for some pairs of analytical curves and surfaces (plane - line, ...)
IsParallel(): boolean;

// Returns the significant face used to determine the intersection
Face(): TopoDS_Face;

ClassifyUVPoint(Puv: gp_Pnt2d): TopAbs_State;

Bounding(): Bnd_Box;

// Sets the boundary tolerance flag
SetUseBoundToler(UseBToler: boolean): void;

// Returns the boundary tolerance flag
GetUseBoundToler(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurvesFace_ShapeIntersector: declare class IntCurvesFace_ShapeIntersector

constructor

Load(Sh: TopoDS_Shape, Tol: number): void;

// Perform the intersection between the segment L and the loaded shape
Perform(L: gp_Lin, PInf: number, PSup: number): void;
Perform(HCu: Adaptor3d_Curve, PInf: number, PSup: number): void;
Perform(L: gp_Lin, PInf: number, PSup: number): void;
Perform(HCu: Adaptor3d_Curve, PInf: number, PSup: number): void;

// Perform the intersection between the segment L and the loaded shape
PerformNearest(L: gp_Lin, PInf: number, PSup: number): void;

// True when the intersection has been computed
IsDone(): boolean;

// Returns the number of the intersection points
NbPnt(): number;

// Returns the U parameter of the ith intersection point on the surface
UParameter(I: number): number;

// Returns the V parameter of the ith intersection point on the surface
VParameter(I: number): number;

// Returns the parameter of the ith intersection point on the line
WParameter(I: number): number;

// Returns the geometric point of the ith intersection between the line and the surface
Pnt(I: number): gp_Pnt;

// Returns the ith transition of the line on the surface
Transition(I: number): IntCurveSurface_TransitionOnCurve;

// Returns the ith state of the point on the face
State(I: number): TopAbs_State;

// Returns the significant face used to determine the intersection
Face(I: number): TopoDS_Face;

// Internal method
SortResult(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
