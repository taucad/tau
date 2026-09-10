# libcascade — LocOpe

19 top-level symbols. Signatures are verbatim typescript.

// Provides tools to implement local topological operations on a shape
LocOpe: declare class LocOpe

constructor

// Returns true when the wire <W> is closed on the face <OnF>
static Closed(W: TopoDS_Wire, OnF: TopoDS_Face): boolean;
static Closed(E: TopoDS_Edge, OnF: TopoDS_Face): boolean;
static Closed(W: TopoDS_Wire, OnF: TopoDS_Face): boolean;
static Closed(E: TopoDS_Edge, OnF: TopoDS_Face): boolean;

// Returns true when the faces are tangent
static TgtFaces(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): boolean;

static SampleEdges(S: TopoDS_Shape, Pt: NCollection_Sequence_gp_Pnt): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_BuildShape: declare class LocOpe_BuildShape

constructor

// Builds shape(s) from the list <L>
Perform(L: NCollection_List_TopoDS_Shape): void;

Shape(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_BuildWires: declare class LocOpe_BuildWires

constructor

Perform(Ledges: NCollection_List_TopoDS_Shape, PW: LocOpe_WiresOnShape): void;

IsDone(): boolean;

Result(): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a pipe (near from Pipe from {@link BRepFill `BRepFill`}), with modifications provided for the Pipe feature
LocOpe_DPrism: declare class LocOpe_DPrism

constructor

IsDone(): boolean;

Spine(): TopoDS_Shape;

Profile(): TopoDS_Shape;

FirstShape(): TopoDS_Shape;

LastShape(): TopoDS_Shape;

Shape(): TopoDS_Shape;

Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Curves(SCurves: NCollection_Sequence_handle_Geom_Curve): void;

BarycCurve(): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_FindEdges: declare class LocOpe_FindEdges

constructor

Set(FFrom: TopoDS_Shape, FTo: TopoDS_Shape): void;

InitIterator(): void;

More(): boolean;

EdgeFrom(): TopoDS_Edge;

EdgeTo(): TopoDS_Edge;

Next(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_FindEdgesInFace: declare class LocOpe_FindEdgesInFace

constructor

Set(S: TopoDS_Shape, F: TopoDS_Face): void;

Init(): void;

More(): boolean;

Edge(): TopoDS_Edge;

Next(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_GeneratedShape: declare class LocOpe_GeneratedShape extends Standard_Transient

GeneratingEdges(): NCollection_List_TopoDS_Shape;

// Returns the edge created by the vertex <V>
Generated(V: TopoDS_Vertex): TopoDS_Edge;
Generated(E: TopoDS_Edge): TopoDS_Face;
Generated(V: TopoDS_Vertex): TopoDS_Edge;
Generated(E: TopoDS_Edge): TopoDS_Face;

// Returns the list of correctly oriented generated faces
OrientedFaces(): NCollection_List_TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_Generator: declare class LocOpe_Generator

constructor

// Initializes the algorithm on the shape
Init(S: TopoDS_Shape): void;

Perform(G: LocOpe_GeneratedShape): void;

IsDone(): boolean;

// Returns the new shape
ResultingShape(): TopoDS_Shape;

// Returns the initial shape
Shape(): TopoDS_Shape;

// Returns the descendant face of <F>
DescendantFace(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_GluedShape: declare class LocOpe_GluedShape extends LocOpe_GeneratedShape

constructor

Init(S: TopoDS_Shape): void;

GlueOnFace(F: TopoDS_Face): void;

GeneratingEdges(): NCollection_List_TopoDS_Shape;

// Returns the edge created by the vertex <V>
Generated(V: TopoDS_Vertex): TopoDS_Edge;
Generated(E: TopoDS_Edge): TopoDS_Face;
Generated(V: TopoDS_Vertex): TopoDS_Edge;
Generated(E: TopoDS_Edge): TopoDS_Face;

// Returns the list of correctly oriented generated faces
OrientedFaces(): NCollection_List_TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_Gluer: declare class LocOpe_Gluer

constructor

Init(Sbase: TopoDS_Shape, Snew: TopoDS_Shape): void;

Bind(Fnew: TopoDS_Face, Fbase: TopoDS_Face): void;
Bind(Enew: TopoDS_Edge, Ebase: TopoDS_Edge): void;
Bind(Fnew: TopoDS_Face, Fbase: TopoDS_Face): void;
Bind(Enew: TopoDS_Edge, Ebase: TopoDS_Edge): void;

OpeType(): LocOpe_Operation;

Perform(): void;

IsDone(): boolean;

ResultingShape(): TopoDS_Shape;

DescendantFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

BasisShape(): TopoDS_Shape;

GluedShape(): TopoDS_Shape;

Edges(): NCollection_List_TopoDS_Shape;

TgtEdges(): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a linear form (using Prism from BRepSweep) with modifications provided for the LinearForm feature
LocOpe_LinearForm: declare class LocOpe_LinearForm

constructor

Perform(Base: TopoDS_Shape, V: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt): void;
Perform(Base: TopoDS_Shape, V: gp_Vec, Vectra: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt): void;
Perform(Base: TopoDS_Shape, V: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt): void;
Perform(Base: TopoDS_Shape, V: gp_Vec, Vectra: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt): void;

FirstShape(): TopoDS_Shape;

LastShape(): TopoDS_Shape;

Shape(): TopoDS_Shape;

Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_Operation: typeof LocOpe_Operation[keyof typeof LocOpe_Operation]

// Defines a pipe (near from Pipe from {@link BRepFill `BRepFill`}), with modifications provided for the Pipe feature
LocOpe_Pipe: declare class LocOpe_Pipe

constructor

Spine(): TopoDS_Shape;

Profile(): TopoDS_Shape;

FirstShape(): TopoDS_Shape;

LastShape(): TopoDS_Shape;

Shape(): TopoDS_Shape;

Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Curves(Spt: NCollection_Sequence_gp_Pnt): NCollection_Sequence_handle_Geom_Curve;

BarycCurve(): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_PntFace: declare class LocOpe_PntFace

constructor

Pnt(): gp_Pnt;

Face(): TopoDS_Face;

Orientation(): TopAbs_Orientation;

ChangeOrientation(): TopAbs_Orientation;

Parameter(): number;

UParameter(): number;

VParameter(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a prism (using Prism from BRepSweep) with modifications provided for the Prism feature
LocOpe_Prism: declare class LocOpe_Prism

constructor

Perform(Base: TopoDS_Shape, V: gp_Vec): void;
Perform(Base: TopoDS_Shape, V: gp_Vec, Vtra: gp_Vec): void;
Perform(Base: TopoDS_Shape, V: gp_Vec): void;
Perform(Base: TopoDS_Shape, V: gp_Vec, Vtra: gp_Vec): void;

FirstShape(): TopoDS_Shape;

LastShape(): TopoDS_Shape;

Shape(): TopoDS_Shape;

Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Curves(SCurves: NCollection_Sequence_handle_Geom_Curve): void;

BarycCurve(): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a tool to realize the following operations on a shape
LocOpe_SplitDrafts: declare class LocOpe_SplitDrafts

constructor

// Initializes the algorithm with the shape
Init(S: TopoDS_Shape): void;

// Splits the face <F> of the former given shape with the wire <W>
Perform(F: TopoDS_Face, W: TopoDS_Wire, Extractg: gp_Dir, NPlg: gp_Pln, Angleg: number, Extractd: gp_Dir, NPld: gp_Pln, Angled: number, ModifyLeft: boolean, ModifyRight: boolean): void;
Perform(F: TopoDS_Face, W: TopoDS_Wire, Extract: gp_Dir, NPl: gp_Pln, Angle: number): void;
Perform(F: TopoDS_Face, W: TopoDS_Wire, Extractg: gp_Dir, NPlg: gp_Pln, Angleg: number, Extractd: gp_Dir, NPld: gp_Pln, Angled: number, ModifyLeft: boolean, ModifyRight: boolean): void;
Perform(F: TopoDS_Face, W: TopoDS_Wire, Extract: gp_Dir, NPl: gp_Pln, Angle: number): void;

// Returns <true> if the modification has been successfully performed
IsDone(): boolean;

OriginalShape(): TopoDS_Shape;

// Returns the modified shape
Shape(): TopoDS_Shape;

// Manages the descendant shapes
ShapesFromShape(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a tool to cut
LocOpe_SplitShape: declare class LocOpe_SplitShape

constructor

// Initializes the process on the shape
Init(S: TopoDS_Shape): void;

// Tests if it is possible to split the edge <E>
CanSplit(E: TopoDS_Edge): boolean;

// Adds the wire <W> on the face <F>
Add(W: TopoDS_Wire, F: TopoDS_Face): boolean;
Add(Lwires: NCollection_List_TopoDS_Shape, F: TopoDS_Face): boolean;
Add(V: TopoDS_Vertex, P: number, E: TopoDS_Edge): void;
Add(W: TopoDS_Wire, F: TopoDS_Face): boolean;
Add(Lwires: NCollection_List_TopoDS_Shape, F: TopoDS_Face): boolean;
Add(V: TopoDS_Vertex, P: number, E: TopoDS_Edge): void;
Add(W: TopoDS_Wire, F: TopoDS_Face): boolean;
Add(Lwires: NCollection_List_TopoDS_Shape, F: TopoDS_Face): boolean;
Add(V: TopoDS_Vertex, P: number, E: TopoDS_Edge): void;

// Returns the "original" shape
Shape(): TopoDS_Shape;

// Returns the list of descendant shapes of
DescendantShapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the "left" part defined by the wire <W> on the face <F>
LeftOf(W: TopoDS_Wire, F: TopoDS_Face): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_Spliter: declare class LocOpe_Spliter

constructor

// Initializes the algorithm on the shape
Init(S: TopoDS_Shape): void;

Perform(PW: LocOpe_WiresOnShape): void;

IsDone(): boolean;

// Returns the new shape
ResultingShape(): TopoDS_Shape;

// Returns the initial shape
Shape(): TopoDS_Shape;

// Returns the faces which are the left of the projected wires and which are
DirectLeft(): NCollection_List_TopoDS_Shape;

// Returns the faces of the "left" part on the shape
Left(): NCollection_List_TopoDS_Shape;

// Returns the list of descendant shapes of
DescendantShapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LocOpe_WiresOnShape: declare class LocOpe_WiresOnShape extends Standard_Transient

constructor

Init(S: TopoDS_Shape): void;

// Add splitting edges or wires for whole initial shape without additional specification edge->face, edge->edge This method puts edge on the corresponding faces from initial shape
Add(theEdges: NCollection_Sequence_TopoDS_Shape): boolean;

// Set the flag of check internal intersections default value is True (to check)
SetCheckInterior(ToCheckInterior: boolean): void;

Bind(W: TopoDS_Wire, F: TopoDS_Face): void;
Bind(Comp: TopoDS_Compound, F: TopoDS_Face): void;
Bind(E: TopoDS_Edge, F: TopoDS_Face): void;
Bind(EfromW: TopoDS_Edge, EonFace: TopoDS_Edge): void;
Bind(W: TopoDS_Wire, F: TopoDS_Face): void;
Bind(Comp: TopoDS_Compound, F: TopoDS_Face): void;
Bind(E: TopoDS_Edge, F: TopoDS_Face): void;
Bind(EfromW: TopoDS_Edge, EonFace: TopoDS_Edge): void;
Bind(W: TopoDS_Wire, F: TopoDS_Face): void;
Bind(Comp: TopoDS_Compound, F: TopoDS_Face): void;
Bind(E: TopoDS_Edge, F: TopoDS_Face): void;
Bind(EfromW: TopoDS_Edge, EonFace: TopoDS_Edge): void;
Bind(W: TopoDS_Wire, F: TopoDS_Face): void;
Bind(Comp: TopoDS_Compound, F: TopoDS_Face): void;
Bind(E: TopoDS_Edge, F: TopoDS_Face): void;
Bind(EfromW: TopoDS_Edge, EonFace: TopoDS_Edge): void;

BindAll(): void;

IsDone(): boolean;

InitEdgeIterator(): void;

MoreEdge(): boolean;

Edge(): TopoDS_Edge;

// Returns the face of the shape on which the current edge is projected
OnFace(): TopoDS_Face;

// If the current edge is projected on an edge, returns <true> and sets the value of <E>
OnEdge(E: TopoDS_Edge): boolean;
OnEdge(V: TopoDS_Vertex, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
OnEdge(V: TopoDS_Vertex, EdgeFrom: TopoDS_Edge, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
OnEdge(E: TopoDS_Edge): boolean;
OnEdge(V: TopoDS_Vertex, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
OnEdge(V: TopoDS_Vertex, EdgeFrom: TopoDS_Edge, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
OnEdge(E: TopoDS_Edge): boolean;
OnEdge(V: TopoDS_Vertex, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
OnEdge(V: TopoDS_Vertex, EdgeFrom: TopoDS_Edge, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
// E: Mutated in place

NextEdge(): void;

OnVertex(Vwire: TopoDS_Vertex, Vshape: TopoDS_Vertex): boolean;

// tells is the face to be split by section or not
IsFaceWithSection(aFace: TopoDS_Shape): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
