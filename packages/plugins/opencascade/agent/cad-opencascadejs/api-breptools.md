# libcascade — BRepTools

10 top-level symbols. Signatures are verbatim typescript.

// The {@link BRepTools`BRepTools`} package provides utilities for BRep data structures
BRepTools: declare class BRepTools

constructor

// Returns in UMin, UMax, VMin, VMax the bounding values in the parametric space of F
static UVBounds(F: TopoDS_Face, UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };
static UVBounds(F: TopoDS_Face, W: TopoDS_Wire, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
static UVBounds(F: TopoDS_Face, E: TopoDS_Edge, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
static UVBounds(F: TopoDS_Face, UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };
static UVBounds(F: TopoDS_Face, W: TopoDS_Wire, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
static UVBounds(F: TopoDS_Face, E: TopoDS_Edge, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
static UVBounds(F: TopoDS_Face, UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };
static UVBounds(F: TopoDS_Face, W: TopoDS_Wire, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
static UVBounds(F: TopoDS_Face, E: TopoDS_Edge, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };

// Adds to the box **the bounding values in the parametric space of F.** Adds to the box **the bounding values of the wire in the parametric space of F.** Adds to the box **the bounding values of the edge in the parametric space of F.**
static AddUVBounds(F: TopoDS_Face, B: Bnd_Box2d): void;
static AddUVBounds(F: TopoDS_Face, W: TopoDS_Wire, B: Bnd_Box2d): void;
static AddUVBounds(F: TopoDS_Face, E: TopoDS_Edge, B: Bnd_Box2d): void;
static AddUVBounds(F: TopoDS_Face, B: Bnd_Box2d): void;
static AddUVBounds(F: TopoDS_Face, W: TopoDS_Wire, B: Bnd_Box2d): void;
static AddUVBounds(F: TopoDS_Face, E: TopoDS_Edge, B: Bnd_Box2d): void;
static AddUVBounds(F: TopoDS_Face, B: Bnd_Box2d): void;
static AddUVBounds(F: TopoDS_Face, W: TopoDS_Wire, B: Bnd_Box2d): void;
static AddUVBounds(F: TopoDS_Face, E: TopoDS_Edge, B: Bnd_Box2d): void;
// B: Mutated in place

// Update a vertex (nothing is done) Update an edge, compute 2d bounding boxes
static Update(V: TopoDS_Vertex): void;
static Update(E: TopoDS_Edge): void;
static Update(W: TopoDS_Wire): void;
static Update(F: TopoDS_Face): void;
static Update(S: TopoDS_Shell): void;
static Update(S: TopoDS_Solid): void;
static Update(C: TopoDS_CompSolid): void;
static Update(C: TopoDS_Compound): void;
static Update(S: TopoDS_Shape): void;
static Update(V: TopoDS_Vertex): void;
static Update(E: TopoDS_Edge): void;
static Update(W: TopoDS_Wire): void;
static Update(F: TopoDS_Face): void;
static Update(S: TopoDS_Shell): void;
static Update(S: TopoDS_Solid): void;
static Update(C: TopoDS_CompSolid): void;
static Update(C: TopoDS_Compound): void;
static Update(S: TopoDS_Shape): void;
static Update(V: TopoDS_Vertex): void;
static Update(E: TopoDS_Edge): void;
static Update(W: TopoDS_Wire): void;
static Update(F: TopoDS_Face): void;
static Update(S: TopoDS_Shell): void;
static Update(S: TopoDS_Solid): void;
static Update(C: TopoDS_CompSolid): void;
static Update(C: TopoDS_Compound): void;
static Update(S: TopoDS_Shape): void;
static Update(V: TopoDS_Vertex): void;
static Update(E: TopoDS_Edge): void;
static Update(W: TopoDS_Wire): void;
static Update(F: TopoDS_Face): void;
static Update(S: TopoDS_Shell): void;
static Update(S: TopoDS_Solid): void;
static Update(C: TopoDS_CompSolid): void;
static Update(C: TopoDS_Compound): void;
static Update(S: TopoDS_Shape): void;
static Update(V: TopoDS_Vertex): void;
static Update(E: TopoDS_Edge): void;
static Update(W: TopoDS_Wire): void;
static Update(F: TopoDS_Face): void;
static Update(S: TopoDS_Shell): void;
static Update(S: TopoDS_Solid): void;
static Update(C: TopoDS_CompSolid): void;
static Update(C: TopoDS_Compound): void;
static Update(S: TopoDS_Shape): void;
static Update(V: TopoDS_Vertex): void;
static Update(E: TopoDS_Edge): void;
static Update(W: TopoDS_Wire): void;
static Update(F: TopoDS_Face): void;
static Update(S: TopoDS_Shell): void;
static Update(S: TopoDS_Solid): void;
static Update(C: TopoDS_CompSolid): void;
static Update(C: TopoDS_Compound): void;
static Update(S: TopoDS_Shape): void;
static Update(V: TopoDS_Vertex): void;
static Update(E: TopoDS_Edge): void;
static Update(W: TopoDS_Wire): void;
static Update(F: TopoDS_Face): void;
static Update(S: TopoDS_Shell): void;
static Update(S: TopoDS_Solid): void;
static Update(C: TopoDS_CompSolid): void;
static Update(C: TopoDS_Compound): void;
static Update(S: TopoDS_Shape): void;
static Update(V: TopoDS_Vertex): void;
static Update(E: TopoDS_Edge): void;
static Update(W: TopoDS_Wire): void;
static Update(F: TopoDS_Face): void;
static Update(S: TopoDS_Shell): void;
static Update(S: TopoDS_Solid): void;
static Update(C: TopoDS_CompSolid): void;
static Update(C: TopoDS_Compound): void;
static Update(S: TopoDS_Shape): void;
static Update(V: TopoDS_Vertex): void;
static Update(E: TopoDS_Edge): void;
static Update(W: TopoDS_Wire): void;
static Update(F: TopoDS_Face): void;
static Update(S: TopoDS_Shell): void;
static Update(S: TopoDS_Solid): void;
static Update(C: TopoDS_CompSolid): void;
static Update(C: TopoDS_Compound): void;
static Update(S: TopoDS_Shape): void;

// For each edge of the face <F> reset the UV points to the bounding points of the parametric curve of the edge on the face
static UpdateFaceUVPoints(theF: TopoDS_Face): void;

// Removes all cached polygonal representation of the shape, i.e
static Clean(theShape: TopoDS_Shape, theForce?: boolean): void;
// theShape: the shape to clean
// theForce: allows removing all polygonal representations from the shape, including polygons on triangulations irrelevant for the faces of the given shape

// Removes geometry (curves and surfaces) from all edges and faces of the shape
static CleanGeometry(theShape: TopoDS_Shape): void;

// Removes all the pcurves of the edges of that refer to surfaces not belonging to any face of
static RemoveUnusedPCurves(S: TopoDS_Shape): void;

// Verifies that each Face from the shape has got a triangulation with a deflection smaller or equal to specified one and the Edges a discretization on this triangulation
static Triangulation(theShape: TopoDS_Shape, theLinDefl: number, theToCheckFreeEdges?: boolean): boolean;
// theShape: shape to verify
// theLinDefl: maximum allowed linear deflection
// theToCheckFreeEdges: if TRUE, then free Edges are required to have 3D polygon

// Releases triangulation data for each face of the shape if there is deferred storage to load it later
static UnloadTriangulation(theShape: TopoDS_Shape, theTriangulationIdx?: number): boolean;
// theShape: shape to unload triangulations
// theTriangulationIdx: index defining what triangulation should be unloaded

// Activates triangulation data for each face of the shape from some deferred storage using specified shared input file system
static ActivateTriangulation(theShape: TopoDS_Shape, theTriangulationIdx: number, theToActivateStrictly?: boolean): boolean;
// theShape: shape to activate triangulations
// theTriangulationIdx: index defining what triangulation should be activated
// theToActivateStrictly: flag to activate exactly triangulation with defined theTriangulationIdx index

// Releases all available triangulations for each face of the shape if there is deferred storage to load them later
static UnloadAllTriangulations(theShape: TopoDS_Shape): boolean;
// theShape: shape to unload triangulations

// Returns True if the distance between the two vertices is lower than their tolerance
static Compare(V1: TopoDS_Vertex, V2: TopoDS_Vertex): boolean;
static Compare(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;
static Compare(V1: TopoDS_Vertex, V2: TopoDS_Vertex): boolean;
static Compare(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

// Returns the outer most wire of <F>
static OuterWire(F: TopoDS_Face): TopoDS_Wire;

// Stores in the map <M> all the 3D topology edges of
static Map3DEdges(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// M: Mutated in place

// Verifies that the edge <E> is found two times on the face <F> before calling `BRep_Tool::IsClosed`
static IsReallyClosed(E: TopoDS_Edge, F: TopoDS_Face): boolean;

// Detect closedness of face in U and V directions
static DetectClosedness(theFace: TopoDS_Face, theUclosed?: boolean, theVclosed?: boolean): { theUclosed: boolean; theVclosed: boolean };

// Writes the shape to the file in an ASCII format TopTools_FormatVersion_VERSION_1
static Write(theShape: TopoDS_Shape, theFile: string, theProgress: Message_ProgressRange): boolean;
static Write(theShape: TopoDS_Shape, theFile: string, theWithTriangles: boolean, theWithNormals: boolean, theVersion: TopTools_FormatVersion, theProgress: Message_ProgressRange): boolean;
static Write(theShape: TopoDS_Shape, theFile: string, theProgress: Message_ProgressRange): boolean;
static Write(theShape: TopoDS_Shape, theFile: string, theWithTriangles: boolean, theWithNormals: boolean, theVersion: TopTools_FormatVersion, theProgress: Message_ProgressRange): boolean;
// theShape: the shape to write
// theFile: the path to file to output shape into
// theProgress: the range of progress indicator to fill in

// Reads a Shape from in returns it in <Sh>
static Read(Sh: TopoDS_Shape, File: string, B: BRep_Builder, theProgress: Message_ProgressRange): boolean;
// Sh: Mutated in place

// Evals real tolerance of edge <theE>
static EvalAndUpdateTol(theE: TopoDS_Edge, theC3d: Geom_Curve, theC2d: Geom2d_Curve, theS: Geom_Surface, theF: number, theL: number): number;

// returns the cumul of the orientation of <Edge> and the containing wire in <Face>
static OriEdgeInFace(theEdge: TopoDS_Edge, theFace: TopoDS_Face): TopAbs_Orientation;

// Removes internal sub-shapes from the shape
static RemoveInternals(theS: TopoDS_Shape, theForce: boolean): void;
// theS: Mutated in place

// Check all locations of shape according criterium
static CheckLocations(theS: TopoDS_Shape, theProblemShapes: NCollection_List_TopoDS_Shape): void;
// theProblemShapes: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool class implementing necessary functionality for copying geometry and triangulation
BRepTools_CopyModification: declare class BRepTools_CopyModification extends BRepTools_Modification

constructor

// Returns true if theFace has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if theEdge has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if theVertex has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if theEdge has a new curve on surface on theFace
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if theVertex has a new parameter on theEdge
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of theNewEdge between theNewFace1 and theNewFace2
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

// Returns true if the face has been modified according to changed triangulation
NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

// Returns true if the edge has been modified according to changed polygon
NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

// Returns true if the edge has been modified according to changed polygon on triangulation
NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a modification of the geometry by a GTrsf from gp
BRepTools_GTrsfModification: declare class BRepTools_GTrsfModification extends BRepTools_Modification

constructor

// Gives an access on the GTrsf
GTrsf(): gp_GTrsf;

// Returns true if the face <F> has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the edge <E> has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the vertex <V> has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the edge <E> has a new curve on surface on the face <F>.In this case, `is the new geometric support of the edge, <L> the new location, <Tol> the new tolerance
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the Vertex <V> has a new parameter on the edge <E>
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

// Returns true if the face has been modified according to changed triangulation
NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

// Returns true if the edge has been modified according to changed polygon
NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

// Returns true if the edge has been modified according to changed polygon on triangulation
NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The history keeps the following relations between the input shapes (S1, ..., Sm) and output shapes (T1, ..., Tn)
BRepTools_History: declare class BRepTools_History extends Standard_Transient

constructor

static IsSupportedType(theShape: TopoDS_Shape): boolean;

AddGenerated(theInitial: TopoDS_Shape, theGenerated: TopoDS_Shape): void;

AddModified(theInitial: TopoDS_Shape, theModified: TopoDS_Shape): void;

Remove(theRemoved: TopoDS_Shape): void;

ReplaceGenerated(theInitial: TopoDS_Shape, theGenerated: TopoDS_Shape): void;

ReplaceModified(theInitial: TopoDS_Shape, theModified: TopoDS_Shape): void;

Clear(): void;

Generated(theInitial: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Modified(theInitial: TopoDS_Shape): NCollection_List_TopoDS_Shape;

IsRemoved(theInitial: TopoDS_Shape): boolean;

HasGenerated(): boolean;

HasModified(): boolean;

HasRemoved(): boolean;

Merge(theHistory23: BRepTools_History): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepTools_History_TRelationType: typeof BRepTools_History_TRelationType[keyof typeof BRepTools_History_TRelationType]

// Defines geometric modifications to a shape, i.e
BRepTools_Modification: declare class BRepTools_Modification extends Standard_Transient

// Returns true if the face, F, has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the face has been modified according to changed triangulation
NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

// Returns true if the edge, E, has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the edge has been modified according to changed polygon
NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

// Returns true if the edge has been modified according to changed polygon on triangulation
NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

// Returns true if the vertex V has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the edge, E, has a new curve on surface on the face, F
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the vertex V has a new parameter on the edge E
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Performs geometric modifications on a shape
BRepTools_Modifier: declare class BRepTools_Modifier

constructor

// Initializes the modifier with the shape
Init(S: TopoDS_Shape): void;

// Performs the modifications described by <M>
Perform(M: BRepTools_Modification, theProgress?: Message_ProgressRange): void;

// Returns true if the modification has been computed successfully
IsDone(): boolean;

// Returns the current mutable input state
IsMutableInput(): boolean;

// Sets the mutable input state If true then the input (original) shape can be modified during modification process
SetMutableInput(theMutableInput: boolean): void;

// Returns the modified shape corresponding to
ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a modification of the geometry by a Trsf from gp
BRepTools_NurbsConvertModification: declare class BRepTools_NurbsConvertModification extends BRepTools_CopyModification

constructor

// Returns true if the face <F> has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the edge <E> has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the vertex <V> has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the edge <E> has a new curve on surface on the face <F>.In this case, `is the new geometric support of the edge, <L> the new location, <Tol> the new tolerance
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the Vertex <V> has a new parameter on the edge <E>
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

// Returns true if the face has been modified according to changed triangulation
NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

// Returns true if the edge has been modified according to changed polygon
NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

// Returns true if the edge has been modified according to changed polygon on triangulation
NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

GetUpdatedEdges(): NCollection_List_TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Removes location datums, which satisfy conditions
BRepTools_PurgeLocations: declare class BRepTools_PurgeLocations

constructor

// Removes all locations correspondingly to criterium from theShape
Perform(theShape: TopoDS_Shape): boolean;

// Returns shape with removed locations
GetResult(): TopoDS_Shape;

IsDone(): boolean;

// Returns modified shape obtained from initial shape
ModifiedShape(theInitShape: TopoDS_Shape): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Tool to glue faces at common edges and reconstruct shells
BRepTools_Quilt: declare class BRepTools_Quilt

constructor

// Binds <Enew> to be the new edge instead of <Eold>
Bind(Eold: TopoDS_Edge, Enew: TopoDS_Edge): void;
Bind(Vold: TopoDS_Vertex, Vnew: TopoDS_Vertex): void;
Bind(Eold: TopoDS_Edge, Enew: TopoDS_Edge): void;
Bind(Vold: TopoDS_Vertex, Vnew: TopoDS_Vertex): void;

// Add the faces of to the Quilt, the faces containing bounded edges are copied
Add(S: TopoDS_Shape): void;

// Returns True if has been copied (is a vertex, an edge or a face)
IsCopied(S: TopoDS_Shape): boolean;

// Returns the shape substituted to in the Quilt
Copy(S: TopoDS_Shape): TopoDS_Shape;

// Returns a Compound of shells made from the current set of faces
Shells(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
