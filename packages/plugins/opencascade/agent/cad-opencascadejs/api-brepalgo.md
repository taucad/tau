# libcascade — BRepAlgo

6 top-level symbols. Signatures are verbatim typescript.

// The {@link BRepAlgo`BRepAlgo`} class provides the following tools for
BRepAlgo: declare class BRepAlgo

constructor

// this method makes a wire whose edges are C1 from a Wire whose edges could be G1
static ConcatenateWire(Wire: TopoDS_Wire, Option: GeomAbs_Shape, AngularTolerance?: number): TopoDS_Wire;

// this method makes an edge from a wire
static ConcatenateWireC0(Wire: TopoDS_Wire): TopoDS_Edge;

// Method of wire conversion, calls BRepAlgo_Approx internally
static ConvertWire(theWire: TopoDS_Wire, theAngleTolerance: number, theFace: TopoDS_Face): TopoDS_Wire;
// theWire: Input Wire object
// theAngleTolerance: Angle (in radians) defining the continuity of the wire

// Method of face conversion
static ConvertFace(theFace: TopoDS_Face, theAngleTolerance: number): TopoDS_Face;

// Checks if the shape is "correct"
static IsValid(S: TopoDS_Shape): boolean;
static IsValid(theArgs: NCollection_List_TopoDS_Shape, theResult: TopoDS_Shape, closedSolid: boolean, GeomCtrl: boolean): boolean;
static IsValid(S: TopoDS_Shape): boolean;
static IsValid(theArgs: NCollection_List_TopoDS_Shape, theResult: TopoDS_Shape, closedSolid: boolean, GeomCtrl: boolean): boolean;

// Checks if the shape is "correct"
static IsTopologicallyValid(S: TopoDS_Shape): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// SD to store descendants and ascendants of Shapes
BRepAlgo_AsDes: declare class BRepAlgo_AsDes extends Standard_Transient

constructor

Clear(): void;

// Stores <SS> as a futur subshape of
Add(S: TopoDS_Shape, SS: TopoDS_Shape): void;
Add(S: TopoDS_Shape, SS: NCollection_List_TopoDS_Shape): void;
Add(S: TopoDS_Shape, SS: TopoDS_Shape): void;
Add(S: TopoDS_Shape, SS: NCollection_List_TopoDS_Shape): void;

HasAscendant(S: TopoDS_Shape): boolean;

HasDescendant(S: TopoDS_Shape): boolean;

// Returns the Shape containing
Ascendant(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns futur subhapes of
Descendant(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns futur subhapes of
ChangeDescendant(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Replace theOldS by theNewS
Replace(theOldS: TopoDS_Shape, theNewS: TopoDS_Shape): void;

// Remove theS from me
Remove(theS: TopoDS_Shape): void;

// Returns True if (S1> and <S2> has common Descendants
HasCommonDescendant(S1: TopoDS_Shape, S2: TopoDS_Shape, LC: NCollection_List_TopoDS_Shape): boolean;
// LC: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Builds all the faces limited with a set of non jointing and planars wires
BRepAlgo_FaceRestrictor: declare class BRepAlgo_FaceRestrictor

constructor

// the surface of <F> will be the surface of each new faces built
Init(F: TopoDS_Face, Proj?: boolean, ControlOrientation?: boolean): void;

// Add the wire <W> to the set of wires
Add(W: TopoDS_Wire): void;
// W: Mutated in place

// Removes all the Wires
Clear(): void;

// Evaluate all the faces limited by the set of Wires
Perform(): void;

IsDone(): boolean;

More(): boolean;

Next(): void;

Current(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores link between a shape and a shape <NewS> obtained from
BRepAlgo_Image: declare class BRepAlgo_Image

constructor

SetRoot(S: TopoDS_Shape): void;

// Links <NewS> as image of <OldS>
Bind(OldS: TopoDS_Shape, NewS: TopoDS_Shape): void;
Bind(OldS: TopoDS_Shape, NewS: NCollection_List_TopoDS_Shape): void;
Bind(OldS: TopoDS_Shape, NewS: TopoDS_Shape): void;
Bind(OldS: TopoDS_Shape, NewS: NCollection_List_TopoDS_Shape): void;

// Add <NewS> to the image of <OldS>
Add(OldS: TopoDS_Shape, NewS: TopoDS_Shape): void;
Add(OldS: TopoDS_Shape, NewS: NCollection_List_TopoDS_Shape): void;
Add(OldS: TopoDS_Shape, NewS: TopoDS_Shape): void;
Add(OldS: TopoDS_Shape, NewS: NCollection_List_TopoDS_Shape): void;

Clear(): void;

// Remove to set of images
Remove(S: TopoDS_Shape): void;

// Removes the root <theRoot> from the list of roots and up and down maps
RemoveRoot(Root: TopoDS_Shape): void;

// Replaces the <OldRoot> with the <NewRoot>, so all images of the <OldRoot> become the images of the <NewRoot>
ReplaceRoot(OldRoot: TopoDS_Shape, NewRoot: TopoDS_Shape): void;

Roots(): NCollection_List_TopoDS_Shape;

IsImage(S: TopoDS_Shape): boolean;

// Returns the generator of
ImageFrom(S: TopoDS_Shape): TopoDS_Shape;

// Returns the upper generator of
Root(S: TopoDS_Shape): TopoDS_Shape;

HasImage(S: TopoDS_Shape): boolean;

// Returns the Image of
Image(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Stores in <L> the images of images of...images of
LastImage(S: TopoDS_Shape, L: NCollection_List_TopoDS_Shape): void;
// L: Mutated in place

// Keeps only the link between roots and lastimage
Compact(): void;

// Deletes in the images the shape of type <ShapeType> which are not in
Filter(S: TopoDS_Shape, ShapeType: TopAbs_ShapeEnum): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Builds the loops from a set of edges on a face
BRepAlgo_Loop: declare class BRepAlgo_Loop

constructor

// Init with <F> the set of edges must have pcurves on <F>
Init(F: TopoDS_Face): void;

// Add E with <LV>
AddEdge(E: TopoDS_Edge, LV: NCollection_List_TopoDS_Shape): void;
// E: Mutated in place

// Add <E> as const edge, E can be in the result
AddConstEdge(E: TopoDS_Edge): void;

// Add <LE> as a set of const edges
AddConstEdges(LE: NCollection_List_TopoDS_Shape): void;

// Sets the Image Vertex - Vertex
SetImageVV(theImageVV: BRepAlgo_Image): void;

// Make loops
Perform(): void;

// Update VE map according to Image Vertex - Vertex
UpdateVEmap(theVEmap: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// theVEmap: Mutated in place

// Cut the edge <E> in several edges <NE> on the vertices<VonE>
CutEdge(E: TopoDS_Edge, VonE: NCollection_List_TopoDS_Shape, NE: NCollection_List_TopoDS_Shape): void;
// NE: Mutated in place

// Returns the list of wires performed
NewWires(): NCollection_List_TopoDS_Shape;

// Build faces from the wires result
WiresToFaces(): void;

// Returns the list of faces
NewFaces(): NCollection_List_TopoDS_Shape;

// Returns the list of new edges built from an edge <E> it can be an empty list
NewEdges(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

// Returns the datamap of vertices with their substitutes
GetVerticesForSubstitute(VerVerMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// VerVerMap: Mutated in place

VerticesForSubstitute(VerVerMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// Set maximal tolerance used for comparing distances between vertices
SetTolConf(theTolConf: number): void;

// Get maximal tolerance used for comparing distances between vertices
GetTolConf(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class makes the projection of a wire on a shape
BRepAlgo_NormalProjection: declare class BRepAlgo_NormalProjection

constructor

Init(S: TopoDS_Shape): void;

// Add an edge or a wire to the list of shape to project
Add(ToProj: TopoDS_Shape): void;

// Set the parameters used for computation Tol3d is the required tolerance between the 3d projected curve and its 2d representation InternalContinuity is the order of constraints used for approximation
SetParams(Tol3D: number, Tol2D: number, InternalContinuity: GeomAbs_Shape, MaxDegree: number, MaxSeg: number): void;

// Set the parameters used for computation in their default values
SetDefaultParams(): void;

// Sets the maximum distance between target shape and shape to project
SetMaxDistance(MaxDist: number): void;

// if With3d = false the 3dcurve is not computed the initial 3dcurve is kept to build the resulting edges
Compute3d(With3d?: boolean): void;

// Manage limitation of projected edges
SetLimit(FaceBoundaries?: boolean): void;

// Builds the result as a compound
Build(): void;

IsDone(): boolean;

// returns the result
Projection(): TopoDS_Shape;

// For a resulting edge, returns the corresponding initial edge
Ancestor(E: TopoDS_Edge): TopoDS_Shape;

// For a projected edge, returns the corresponding initial face
Couple(E: TopoDS_Edge): TopoDS_Shape;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

IsElementary(C: Adaptor3d_Curve): boolean;

// build the result as a list of wire if possible in - a first returns a wire only if there is only a wire
BuildWire(Liste: NCollection_List_TopoDS_Shape): boolean;
// Liste: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
