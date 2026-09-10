# libcascade — BRepCheck

11 top-level symbols. Signatures are verbatim typescript.

// This package provides tools to check the validity of the BRep
BRepCheck: declare class BRepCheck

constructor

static Add(List: NCollection_List_BRepCheck_Status, Stat: BRepCheck_Status): void;

static SelfIntersection(W: TopoDS_Wire, F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

// Returns the resolution on the 3d curve
static PrecCurve(aAC3D: Adaptor3d_Curve): number;

// Returns the resolution on the surface
static PrecSurface(aAHSurf: Adaptor3d_Surface): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A framework to check the overall validity of a shape
BRepCheck_Analyzer: declare class BRepCheck_Analyzer

constructor

// is the shape to control
Init(S: TopoDS_Shape, GeomControls?: boolean): void;

// Sets method to calculate distance
SetExactMethod(theIsExact: boolean): void;

// Returns true if exact method selected
IsExactMethod(): boolean;

// Sets parallel flag
SetParallel(theIsParallel: boolean): void;

// Returns true if parallel flag is set
IsParallel(): boolean;

// is a subshape of the original shape
IsValid(S: TopoDS_Shape): boolean;
IsValid(): boolean;
IsValid(S: TopoDS_Shape): boolean;
IsValid(): boolean;

Result(theSubS: TopoDS_Shape): BRepCheck_Result;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepCheck_Edge: declare class BRepCheck_Edge extends BRepCheck_Result

constructor

InContext(ContextShape: TopoDS_Shape): void;

Minimum(): void;

Blind(): void;

GeometricControls(): boolean;
GeometricControls(B: boolean): void;
GeometricControls(): boolean;
GeometricControls(B: boolean): void;

Tolerance(): number;

// Sets status of Edge;
SetStatus(theStatus: BRepCheck_Status): void;

// Sets method to calculate distance
SetExactMethod(theIsExact: boolean): void;

// Returns true if exact method selected
IsExactMethod(): boolean;

// Checks, if polygon on triangulation of heEdge is out of 3D-curve of this edge
CheckPolygonOnTriangulation(theEdge: TopoDS_Edge): BRepCheck_Status;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepCheck_Face: declare class BRepCheck_Face extends BRepCheck_Result

constructor

InContext(ContextShape: TopoDS_Shape): void;

Minimum(): void;

Blind(): void;

IntersectWires(Update?: boolean): BRepCheck_Status;

ClassifyWires(Update?: boolean): BRepCheck_Status;

OrientationOfWires(Update?: boolean): BRepCheck_Status;

SetUnorientable(): void;

// Sets status of Face;
SetStatus(theStatus: BRepCheck_Status): void;

IsUnorientable(): boolean;

GeometricControls(): boolean;
GeometricControls(B: boolean): void;
GeometricControls(): boolean;
GeometricControls(B: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepCheck_Result: declare class BRepCheck_Result extends Standard_Transient

Init(S: TopoDS_Shape): void;

InContext(ContextShape: TopoDS_Shape): void;

Minimum(): void;

Blind(): void;

SetFailStatus(S: TopoDS_Shape): void;

Status(): NCollection_List_BRepCheck_Status;

IsMinimum(): boolean;

IsBlind(): boolean;

InitContextIterator(): void;

MoreShapeInContext(): boolean;

ContextualShape(): TopoDS_Shape;

StatusOnShape(): NCollection_List_BRepCheck_Status;
StatusOnShape(theShape: TopoDS_Shape): NCollection_List_BRepCheck_Status;
StatusOnShape(): NCollection_List_BRepCheck_Status;
StatusOnShape(theShape: TopoDS_Shape): NCollection_List_BRepCheck_Status;

NextShapeInContext(): void;

// Sets the parallel execution flag for sub-algorithms
SetParallel(theIsParallel: boolean): void;

// Returns TRUE if sub-algorithms should use parallel execution
IsParallel(): boolean;

IsStatusOnShape(theShape: TopoDS_Shape): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepCheck_Shell: declare class BRepCheck_Shell extends BRepCheck_Result

constructor

InContext(ContextShape: TopoDS_Shape): void;

Minimum(): void;

Blind(): void;

// Checks if the oriented faces of the shell give a closed shell
Closed(Update?: boolean): BRepCheck_Status;

// Checks if the oriented faces of the shell are correctly oriented
Orientation(Update?: boolean): BRepCheck_Status;

SetUnorientable(): void;

IsUnorientable(): boolean;

NbConnectedSet(theSets: NCollection_List_TopoDS_Shape): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class is to check a solid
BRepCheck_Solid: declare class BRepCheck_Solid extends BRepCheck_Result

constructor

// Checks the solid in context of the shape <theContextShape>
InContext(ContextShape: TopoDS_Shape): void;

// Checks the solid per se
Minimum(): void;

// see the parent class for more details
Blind(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepCheck_Status: typeof BRepCheck_Status[keyof typeof BRepCheck_Status]

BRepCheck_Vertex: declare class BRepCheck_Vertex extends BRepCheck_Result

constructor

InContext(ContextShape: TopoDS_Shape): void;

Minimum(): void;

Blind(): void;

Tolerance(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepCheck_Wire: declare class BRepCheck_Wire extends BRepCheck_Result

constructor

// if <ContextShape> is a face, consequently checks `SelfIntersect()`, `Closed()`, `Orientation()` and Closed2d until faulty is found
InContext(ContextShape: TopoDS_Shape): void;

// checks that the wire is not empty and "connex"
Minimum(): void;

// Does nothing
Blind(): void;

// Checks if the oriented edges of the wire give a closed wire
Closed(Update?: boolean): BRepCheck_Status;

// Checks if edges of the wire give a wire closed in 2d space
Closed2d(F: TopoDS_Face, Update?: boolean): BRepCheck_Status;

// Checks if the oriented edges of the wire are correctly oriented
Orientation(F: TopoDS_Face, Update?: boolean): BRepCheck_Status;

// Checks if the wire intersect itself on the face <F>
SelfIntersect(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, Update: boolean): BRepCheck_Status;
// E1: Mutated in place
// E2: Mutated in place

// report `SelfIntersect()` check would be (is) done set `SelfIntersect()` to be checked
GeometricControls(): boolean;
GeometricControls(B: boolean): void;
GeometricControls(): boolean;
GeometricControls(B: boolean): void;

// Sets status of Wire;
SetStatus(theStatus: BRepCheck_Status): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepCheck_ListOfStatus: NCollection_List_BRepCheck_Status
