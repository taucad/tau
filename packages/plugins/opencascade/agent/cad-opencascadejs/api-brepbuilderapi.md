# libcascade — BRepBuilderAPI

19 top-level symbols. Signatures are verbatim typescript.

// The {@link BRepBuilderAPI`BRepBuilderAPI`} package provides an Application Programming Interface for the BRep topology data structure
BRepBuilderAPI: declare class BRepBuilderAPI

constructor

// Sets the current plane
static Plane(P: Geom_Plane): void;
static Plane(): Geom_Plane;
static Plane(P: Geom_Plane): void;
static Plane(): Geom_Plane;

// Sets the default precision
static Precision(P: number): void;
static Precision(): number;
static Precision(P: number): void;
static Precision(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class {@link BRepBuilderAPI_BndBoxTreeSelector`BRepBuilderAPI_BndBoxTreeSelector`} derived from UBTree::Selector This class is used to select overlapping boxes, stored in NCollection::UBTree
BRepBuilderAPI_BndBoxTreeSelector: declare class BRepBuilderAPI_BndBoxTreeSelector

constructor

// Implementation of rejection method
Reject(argNo0: Bnd_Box): boolean;

// Implementation of acceptance method This method is called when the bounding box intersect with the current
Accept(argNo0: number): boolean;

// Clear the list of intersecting boxes
ClearResList(): void;

// Set current box to search for overlapping with him
SetCurrent(theBox: Bnd_Box): void;

// Get list of indexes of boxes intersecting with the current box
ResInd(): NCollection_List_int;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepBuilderAPI_Collect: declare class BRepBuilderAPI_Collect

constructor

Add(SI: TopoDS_Shape, MKS: BRepBuilderAPI_MakeShape): void;

AddGenerated(S: TopoDS_Shape, Gen: TopoDS_Shape): void;

AddModif(S: TopoDS_Shape, Mod: TopoDS_Shape): void;

Filter(SF: TopoDS_Shape): void;

Modification(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

Generated(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for all commands in {@link BRepBuilderAPI`BRepBuilderAPI`}
BRepBuilderAPI_Command: declare class BRepBuilderAPI_Command

IsDone(): boolean;

// Raises NotDone if done is false
Check(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Duplication of a shape
BRepBuilderAPI_Copy: declare class BRepBuilderAPI_Copy extends BRepBuilderAPI_ModifyShape

constructor

// Copies the shape S
Perform(S: TopoDS_Shape, copyGeom?: boolean, copyMesh?: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Indicates the outcome of the construction of an edge, i.e
BRepBuilderAPI_EdgeError: typeof BRepBuilderAPI_EdgeError[keyof typeof BRepBuilderAPI_EdgeError]

// Indicates the outcome of the construction of a face, i.e
BRepBuilderAPI_FaceError: typeof BRepBuilderAPI_FaceError[keyof typeof BRepBuilderAPI_FaceError]

// Created on
BRepBuilderAPI_FastSewing: declare class BRepBuilderAPI_FastSewing extends Standard_Transient

constructor

// Adds faces of a shape
Add(theShape: TopoDS_Shape): boolean;
Add(theSurface: Geom_Surface): boolean;
Add(theShape: TopoDS_Shape): boolean;
Add(theSurface: Geom_Surface): boolean;

// Compute resulted shape
Perform(): void;

// Sets tolerance
SetTolerance(theToler: number): void;

// Returns tolerance
GetTolerance(): number;

// Returns resulted shape
GetResult(): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumeration of result statuses
BRepBuilderAPI_FastSewing_FS_Statuses: typeof BRepBuilderAPI_FastSewing_FS_Statuses[keyof typeof BRepBuilderAPI_FastSewing_FS_Statuses]

// Describes functions to find the plane in which the edges of a given shape are located
BRepBuilderAPI_FindPlane: declare class BRepBuilderAPI_FindPlane

constructor

// Constructs the plane containing the edges of the shape S
Init(S: TopoDS_Shape, Tol?: number): void;

// Returns true if a plane containing the edges of the shape is found and built
Found(): boolean;

// Returns the plane containing the edges of the shape
Plane(): Geom_Plane;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Geometric transformation on a shape
BRepBuilderAPI_GTransform: declare class BRepBuilderAPI_GTransform extends BRepBuilderAPI_ModifyShape

constructor

// Applies the geometric transformation defined at the time of construction of this framework to the shape S
Perform(S: TopoDS_Shape, Copy?: boolean): void;

// Returns the list of shapes modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the modified shape corresponding to
ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to build edges
BRepBuilderAPI_MakeEdge: declare class BRepBuilderAPI_MakeEdge extends BRepBuilderAPI_MakeShape

constructor

// Defines or redefines the arguments for the construction of an edge
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom_Curve): void;
Init(C: Geom2d_Curve, S: Geom_Surface): void;
Init(C: Geom_Curve, p1: number, p2: number): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;

// Returns true if the edge is built
IsDone(): boolean;

// Returns the construction status
Error(): BRepBuilderAPI_EdgeError;

// Returns the constructed edge
Edge(): TopoDS_Edge;

// Returns the first vertex of the edge
Vertex1(): TopoDS_Vertex;

// Returns the second vertex of the edge
Vertex2(): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to build edges
BRepBuilderAPI_MakeEdge2d: declare class BRepBuilderAPI_MakeEdge2d extends BRepBuilderAPI_MakeShape

constructor

Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
Init(C: Geom2d_Curve): void;
Init(C: Geom2d_Curve, p1: number, p2: number): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;

IsDone(): boolean;

// Returns the error description when NotDone
Error(): BRepBuilderAPI_EdgeError;

Edge(): TopoDS_Edge;

// Returns the first vertex of the edge
Vertex1(): TopoDS_Vertex;

// Returns the second vertex of the edge
Vertex2(): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to build faces
BRepBuilderAPI_MakeFace: declare class BRepBuilderAPI_MakeFace extends BRepBuilderAPI_MakeShape

constructor

// Initializes (or reinitializes) the construction of a face by creating a new object which is a copy of the face F, in order to add wires to it, using the function Add
Init(F: TopoDS_Face): void;
Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;
Init(F: TopoDS_Face): void;
Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;
Init(F: TopoDS_Face): void;
Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;

// Adds the wire W to the constructed face as a hole
Add(W: TopoDS_Wire): void;

// Returns true if this algorithm has a valid face
IsDone(): boolean;

// Returns the construction status BRepBuilderAPI_FaceDone if the face is built, or
Error(): BRepBuilderAPI_FaceError;

// Returns the constructed face
Face(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build polygonal wires
BRepBuilderAPI_MakePolygon: declare class BRepBuilderAPI_MakePolygon extends BRepBuilderAPI_MakeShape

constructor

// Adds the point P or the vertex V at the end of the polygonal wire under construction
Add(P: gp_Pnt): void;
Add(V: TopoDS_Vertex): void;
Add(P: gp_Pnt): void;
Add(V: TopoDS_Vertex): void;

// Returns true if the last vertex added to the constructed polygonal wire is not coincident with the previous one
Added(): boolean;

// Closes the polygonal wire under construction
Close(): void;

FirstVertex(): TopoDS_Vertex;

// Returns the first or the last vertex of the polygonal wire under construction
LastVertex(): TopoDS_Vertex;

// Returns true if this algorithm contains a valid polygonal wire (i.e
IsDone(): boolean;

// Returns the edge built between the last two points or vertices added to the constructed polygonal wire under construction
Edge(): TopoDS_Edge;

// Returns the constructed polygonal wire, or the already built part of the polygonal wire under construction
Wire(): TopoDS_Wire;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This is the root class for all shape constructions
BRepBuilderAPI_MakeShape: declare class BRepBuilderAPI_MakeShape extends BRepBuilderAPI_Command

// This is called by `Shape()`
Build(theRange?: Message_ProgressRange): void;

// Returns a shape built by the shape construction algorithm
Shape(): TopoDS_Shape;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the list of shapes modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns true if the shape S has been deleted
IsDeleted(S: TopoDS_Shape): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Builds shape on per-facet basis on the input mesh
BRepBuilderAPI_MakeShapeOnMesh: declare class BRepBuilderAPI_MakeShapeOnMesh extends BRepBuilderAPI_MakeShape

constructor

// Builds shape on mesh
Build(theRange?: Message_ProgressRange): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build a shape corresponding to the skin of a surface
BRepBuilderAPI_MakeShell: declare class BRepBuilderAPI_MakeShell extends BRepBuilderAPI_MakeShape

constructor

// Defines or redefines the arguments for the construction of a shell
Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Segment?: boolean): void;

// Returns true if the shell is built
IsDone(): boolean;

// Returns the construction status
Error(): BRepBuilderAPI_ShellError;

// Returns the new Shell
Shell(): TopoDS_Shell;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build a solid from shells
BRepBuilderAPI_MakeSolid: declare class BRepBuilderAPI_MakeSolid extends BRepBuilderAPI_MakeShape

constructor

// Adds the shell to the current solid
Add(S: TopoDS_Shell): void;

// Returns true if the solid is built
IsDone(): boolean;

// Returns the new Solid
Solid(): TopoDS_Solid;

// Returns true if the shape S has been deleted
IsDeleted(S: TopoDS_Shape): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
