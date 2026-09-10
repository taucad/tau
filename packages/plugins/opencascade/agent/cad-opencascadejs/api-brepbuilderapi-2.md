# libcascade — BRepBuilderAPI (2)

12 top-level symbols. Signatures are verbatim typescript.

// Describes functions to build BRepBuilder vertices directly from 3D geometric points
BRepBuilderAPI_MakeVertex: declare class BRepBuilderAPI_MakeVertex extends BRepBuilderAPI_MakeShape

constructor

// Returns the constructed vertex
Vertex(): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build wires from edges
BRepBuilderAPI_MakeWire: declare class BRepBuilderAPI_MakeWire extends BRepBuilderAPI_MakeShape

constructor

// Adds the edge E to the wire under construction
Add(E: TopoDS_Edge): void;
Add(W: TopoDS_Wire): void;
Add(L: NCollection_List_TopoDS_Shape): void;
Add(E: TopoDS_Edge): void;
Add(W: TopoDS_Wire): void;
Add(L: NCollection_List_TopoDS_Shape): void;
Add(E: TopoDS_Edge): void;
Add(W: TopoDS_Wire): void;
Add(L: NCollection_List_TopoDS_Shape): void;

// Returns true if this algorithm contains a valid wire
IsDone(): boolean;

// Returns the construction status
Error(): BRepBuilderAPI_WireError;

// Returns the constructed wire
Wire(): TopoDS_Wire;

// Returns the last edge added to the wire under construction
Edge(): TopoDS_Edge;

// Returns the last vertex of the last edge added to the wire under construction
Vertex(): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements the methods of MakeShape for the constant topology modifications
BRepBuilderAPI_ModifyShape: declare class BRepBuilderAPI_ModifyShape extends BRepBuilderAPI_MakeShape

// Returns the list of shapes modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the modified shape corresponding to
ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Conversion of the complete geometry of a shape (all 3D analytical representation of surfaces and curves) into NURBS geometry (except for Planes)
BRepBuilderAPI_NurbsConvert: declare class BRepBuilderAPI_NurbsConvert extends BRepBuilderAPI_ModifyShape

constructor

// Builds a new shape by converting the geometry of the shape S into NURBS geometry
Perform(S: TopoDS_Shape, Copy?: boolean): void;

// Returns the list of shapes modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the modified shape corresponding to
ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Errors that can occur at (shell)pipe construction
BRepBuilderAPI_PipeError: typeof BRepBuilderAPI_PipeError[keyof typeof BRepBuilderAPI_PipeError]

// Provides methods to
BRepBuilderAPI_Sewing: declare class BRepBuilderAPI_Sewing extends Standard_Transient

constructor

// initialize the parameters if necessary
Init(tolerance?: number, option1?: boolean, option2?: boolean, option3?: boolean, option4?: boolean): void;

// Loads the context shape
Load(shape: TopoDS_Shape): void;

// Defines the shapes to be sewed or controlled
Add(shape: TopoDS_Shape): void;

// Computing theProgress - progress indicator of algorithm
Perform(theProgress?: Message_ProgressRange): void;

// Gives the sewed shape a null shape if nothing constructed may be a face, a shell, a solid or a compound
SewedShape(): TopoDS_Shape;

// set context
SetContext(theContext: BRepTools_ReShape): void;

// return context
GetContext(): BRepTools_ReShape;

// Gives the number of free edges (edge shared by one face)
NbFreeEdges(): number;

// Gives each free edge
FreeEdge(index: number): TopoDS_Edge;

// Gives the number of multiple edges (edge shared by more than two faces)
NbMultipleEdges(): number;

// Gives each multiple edge
MultipleEdge(index: number): TopoDS_Edge;

// Gives the number of contiguous edges (edge shared by two faces)
NbContigousEdges(): number;

// Gives each contiguous edge
ContigousEdge(index: number): TopoDS_Edge;

// Gives the sections (edge) belonging to a contiguous edge
ContigousEdgeCouple(index: number): NCollection_List_TopoDS_Shape;

// Indicates if a section is bound (before use SectionToBoundary)
IsSectionBound(section: TopoDS_Edge): boolean;

// Gives the original edge (free boundary) which becomes the the section
SectionToBoundary(section: TopoDS_Edge): TopoDS_Edge;

// Gives the number of degenerated shapes
NbDegeneratedShapes(): number;

// Gives each degenerated shape
DegeneratedShape(index: number): TopoDS_Shape;

// Indicates if a input shape is degenerated
IsDegenerated(shape: TopoDS_Shape): boolean;

// Indicates if a input shape has been modified
IsModified(shape: TopoDS_Shape): boolean;

// Gives a modifieded shape
Modified(shape: TopoDS_Shape): TopoDS_Shape;

// Indicates if a input subshape has been modified
IsModifiedSubShape(shape: TopoDS_Shape): boolean;

// Gives a modifieded subshape
ModifiedSubShape(shape: TopoDS_Shape): TopoDS_Shape;

// print the information
Dump(): void;

// Gives the number of deleted faces (faces smallest than tolerance)
NbDeletedFaces(): number;

// Gives each deleted face
DeletedFace(index: number): TopoDS_Face;

// Gives a modified shape
WhichFace(theEdg: TopoDS_Edge, index?: number): TopoDS_Face;

// Gets same parameter mode
SameParameterMode(): boolean;

// Sets same parameter mode
SetSameParameterMode(SameParameterMode: boolean): void;

// Gives set tolerance
Tolerance(): number;

// Sets tolerance
SetTolerance(theToler: number): void;

// Gives set min tolerance
MinTolerance(): number;

// Sets min tolerance
SetMinTolerance(theMinToler: number): void;

// Gives set max tolerance
MaxTolerance(): number;

// Sets max tolerance
SetMaxTolerance(theMaxToler: number): void;

// Returns mode for sewing faces By default - true
FaceMode(): boolean;

// Sets mode for sewing faces By default - true
SetFaceMode(theFaceMode: boolean): void;

// Returns mode for sewing floating edges By default - false
FloatingEdgesMode(): boolean;

// Sets mode for sewing floating edges By default - false
SetFloatingEdgesMode(theFloatingEdgesMode: boolean): void;

// Returns mode for accounting of local tolerances of edges and vertices during of merging
LocalTolerancesMode(): boolean;

// Sets mode for accounting of local tolerances of edges and vertices during of merging in this case WorkTolerance = myTolerance + tolEdge1+ tolEdg2;
SetLocalTolerancesMode(theLocalTolerancesMode: boolean): void;

// Sets mode for non-manifold sewing
SetNonManifoldMode(theNonManifoldMode: boolean): void;

// Gets mode for non-manifold sewing
NonManifoldMode(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Lists the possible types of modification to a shape following a topological operation
BRepBuilderAPI_ShapeModification: typeof BRepBuilderAPI_ShapeModification[keyof typeof BRepBuilderAPI_ShapeModification]

// Indicates the outcome of the construction of a face, i.e
BRepBuilderAPI_ShellError: typeof BRepBuilderAPI_ShellError[keyof typeof BRepBuilderAPI_ShellError]

// Geometric transformation on a shape
BRepBuilderAPI_Transform: declare class BRepBuilderAPI_Transform extends BRepBuilderAPI_ModifyShape

constructor

// Applies the geometric transformation defined at the time of construction of this framework to the shape S
Perform(theShape: TopoDS_Shape, theCopyGeom?: boolean, theCopyMesh?: boolean): void;

// Returns the modified shape corresponding to
ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

// Returns the list of shapes modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Option to manage discontinuities in Sweep
BRepBuilderAPI_TransitionMode: typeof BRepBuilderAPI_TransitionMode[keyof typeof BRepBuilderAPI_TransitionMode]

// Inspector for CellFilter algorithm working with {@link gp_XYZ`gp_XYZ`} points in 3d space
BRepBuilderAPI_VertexInspector: declare class BRepBuilderAPI_VertexInspector

constructor

static Coord(i: number, thePnt: gp_XYZ): number;

static Shift(thePnt: gp_XYZ, theTol: number): gp_XYZ;

// Keep the points used for comparison
Add(thePnt: gp_XYZ): void;

// Clear the list of adjacent points
ClearResList(): void;

// Set current point to search for coincidence
SetCurrent(theCurPnt: gp_XYZ): void;

// Get list of indexes of points adjacent with the current
ResInd(): NCollection_List_int;

// Implementation of inspection method
Inspect(theTarget: number): NCollection_CellFilter_Action;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Indicates the outcome of wire construction, i.e
BRepBuilderAPI_WireError: typeof BRepBuilderAPI_WireError[keyof typeof BRepBuilderAPI_WireError]
