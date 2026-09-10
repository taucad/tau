# libcascade — BRepAdaptor

4 top-level symbols. Signatures are verbatim typescript.

// The Curve from BRepAdaptor allows to use a Wire of the BRep topology like a 3D curve
BRepAdaptor_CompCurve: declare class BRepAdaptor_CompCurve extends Adaptor3d_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Curve;

// Sets the wire <W>
Initialize(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean): void;
Initialize(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean, First: number, Last: number, Tol: number): void;
Initialize(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean): void;
Initialize(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean, First: number, Last: number, Tol: number): void;

// Returns the wire
Wire(): TopoDS_Wire;

// returns an edge and one parameter on them corresponding to the parameter U
Edge(U: number, E: TopoDS_Edge, UonE?: number): { UonE: number };
// E: Mutated in place

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

// returns the parametric resolution
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The Curve from BRepAdaptor allows to use an Edge of the BRep topology like a 3D curve
BRepAdaptor_Curve: declare class BRepAdaptor_Curve extends GeomAdaptor_TransformedCurve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Curve;

// Reset currently loaded curve (undone `Load()`)
Reset(): void;

// Sets the Curve <me> to access the geometry of edge <E>
Initialize(E: TopoDS_Edge): void;
Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;
Initialize(E: TopoDS_Edge): void;
Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;

// Returns the edge
Edge(): TopoDS_Edge;

// Returns the edge tolerance
Tolerance(): number;

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The Curve2d from BRepAdaptor allows to use an Edge on a Face like a 2d curve (curve in the parametric space)
BRepAdaptor_Curve2d: declare class BRepAdaptor_Curve2d extends Geom2dAdaptor_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor2d_Curve2d;

// Initialize with the pcurve of <E> on <F>
Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;

// Returns the Edge
Edge(): TopoDS_Edge;

// Returns the Face
Face(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The Surface from BRepAdaptor allows to use a Face of the BRep topology look like a 3D surface
BRepAdaptor_Surface: declare class BRepAdaptor_Surface extends GeomAdaptor_TransformedSurface

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Surface;

// Sets the surface to the geometry of <F>
Initialize(F: TopoDS_Face, Restriction?: boolean): void;

// Returns the face
Face(): TopoDS_Face;

// Returns the face tolerance
Tolerance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
