# libcascade — BRepTools (2)

5 top-level symbols. Signatures are verbatim typescript.

// Rebuilds a Shape by making pre-defined substitutions on some of its components
BRepTools_ReShape: declare class BRepTools_ReShape extends Standard_Transient

constructor

// Clears all substitutions requests
Clear(): void;

// Sets a request to Remove a Shape whatever the orientation
Remove(shape: TopoDS_Shape): void;

// Sets a request to Replace a Shape by a new one
Replace(shape: TopoDS_Shape, newshape: TopoDS_Shape): void;

// Tells if a shape is recorded for Replace/Remove
IsRecorded(shape: TopoDS_Shape): boolean;

// Returns the new value for an individual shape If not recorded, returns the original shape itself If to be Removed, returns a Null Shape Else, returns the replacing item
Value(shape: TopoDS_Shape): TopoDS_Shape;

// Follows the replacement chain for `theShape` to its leaf without descending into sub-shapes
ValueLeaf(theShape: TopoDS_Shape): TopoDS_Shape;

// Returns a complete substitution status for a shape 0
Status(shape: TopoDS_Shape, newsh: TopoDS_Shape, last: boolean): number;
// newsh: Mutated in place

// Applies the substitutions requests to a shape
Apply(theShape: TopoDS_Shape, theUntil?: TopAbs_ShapeEnum): TopoDS_Shape;

// Returns (modifiable) the flag which defines whether Location of shape take into account during replacing shapes
ModeConsiderLocation(): boolean;

// Returns modified copy of vertex if original one is not recorded or returns modified original vertex otherwise
CopyVertex(theV: TopoDS_Vertex, theTol: number): TopoDS_Vertex;
CopyVertex(theV: TopoDS_Vertex, theNewPos: gp_Pnt, aTol: number): TopoDS_Vertex;
CopyVertex(theV: TopoDS_Vertex, theTol: number): TopoDS_Vertex;
CopyVertex(theV: TopoDS_Vertex, theNewPos: gp_Pnt, aTol: number): TopoDS_Vertex;

// Checks if shape has been recorded by reshaper as a value
IsNewShape(theShape: TopoDS_Shape): boolean;

// Returns the history of the substituted shapes
History(): BRepTools_History;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Contains a Shape and all its subshapes, locations and geometries
BRepTools_ShapeSet: declare class BRepTools_ShapeSet extends TopTools_ShapeSet

constructor

// Return true if shape should be stored with triangles
IsWithTriangles(): boolean;

// Return true if shape should be stored triangulation with normals
IsWithNormals(): boolean;

// Define if shape will be stored with triangles
SetWithTriangles(theWithTriangles: boolean): void;

// Define if shape will be stored triangulation with normals
SetWithNormals(theWithNormals: boolean): void;

// Clears the content of the set
Clear(): void;

// Stores the geometry of
AddGeometry(S: TopoDS_Shape): void;

// Inserts the shape <S2> in the shape <S1>
AddShapes(S1: TopoDS_Shape, S2: TopoDS_Shape): void;
// S1: Mutated in place

// This method is called after each new completed shape
Check(T: TopAbs_ShapeEnum, S: TopoDS_Shape): void;
// S: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A tool to substitute subshapes by other shapes
BRepTools_Substitution: declare class BRepTools_Substitution

constructor

// Reset all the fields
Clear(): void;

// <Oldshape> will be replaced by <NewShapes>
Substitute(OldShape: TopoDS_Shape, NewShapes: NCollection_List_TopoDS_Shape): void;

// Build NewShape from if its subshapes has modified
Build(S: TopoDS_Shape): void;

// Returns True if has been replaced
IsCopied(S: TopoDS_Shape): boolean;

// Returns the set of shapes substituted to
Copy(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a modification that uses a {@link gp_Trsf`gp_Trsf`} to change the geometry of a shape
BRepTools_TrsfModification: declare class BRepTools_TrsfModification extends BRepTools_Modification

constructor

// Provides access to the {@link gp_Trsf`gp_Trsf`} associated with this modification
Trsf(): gp_Trsf;

// Sets a flag to indicate the need to copy mesh
IsCopyMesh(): boolean;

// Returns true if the face F has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the face has been modified according to changed triangulation
NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

// Returns true if the edge has been modified according to changed polygon
NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

// Returns true if the edge has been modified according to changed polygon on triangulation
NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

// Always returns true indicating that the edge E is always modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the vertex V has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the edge E has a new curve on surface on the face F
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the Vertex V has a new parameter on the edge E
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The WireExplorer is a tool to explore the edges of a wire in a connection order
BRepTools_WireExplorer: declare class BRepTools_WireExplorer

constructor

// Initializes an exploration of the wire <W>
Init(W: TopoDS_Wire): void;
Init(W: TopoDS_Wire, F: TopoDS_Face): void;
Init(W: TopoDS_Wire, F: TopoDS_Face, UMin: number, UMax: number, VMin: number, VMax: number): void;
Init(W: TopoDS_Wire): void;
Init(W: TopoDS_Wire, F: TopoDS_Face): void;
Init(W: TopoDS_Wire, F: TopoDS_Face, UMin: number, UMax: number, VMin: number, VMax: number): void;
Init(W: TopoDS_Wire): void;
Init(W: TopoDS_Wire, F: TopoDS_Face): void;
Init(W: TopoDS_Wire, F: TopoDS_Face, UMin: number, UMax: number, VMin: number, VMax: number): void;

// Returns True if there is a current edge
More(): boolean;

// Proceeds to the next edge
Next(): void;

// Returns the current edge
Current(): TopoDS_Edge;

// Returns an Orientation for the current edge
Orientation(): TopAbs_Orientation;

// Returns the vertex connecting the current edge to the previous one
CurrentVertex(): TopoDS_Vertex;

// Clears the content of the explorer
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
