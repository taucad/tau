# libcascade — BRepLib (2)

13 top-level symbols. Signatures are verbatim typescript.

// Provides methods to build faces
BRepLib_MakeFace: declare class BRepLib_MakeFace extends BRepLib_MakeShape

constructor

// Load the face
Init(F: TopoDS_Face): void;
Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;
Init(F: TopoDS_Face): void;
Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;
Init(F: TopoDS_Face): void;
Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;

// Adds the wire <W> in the current face
Add(W: TopoDS_Wire): void;

Error(): BRepLib_FaceError;

// Returns the new face
Face(): TopoDS_Face;

// Checks the specified curve is degenerated according to specified tolerance
static IsDegenerated(theCurve: Geom_Curve, theMaxTol: number, theActTol?: number): { returnValue: boolean; theActTol: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class to build polygonal wires
BRepLib_MakePolygon: declare class BRepLib_MakePolygon extends BRepLib_MakeShape

constructor

Add(P: gp_Pnt): void;
Add(V: TopoDS_Vertex): void;
Add(P: gp_Pnt): void;
Add(V: TopoDS_Vertex): void;

// Returns True if the last vertex or point was successfully added
Added(): boolean;

Close(): void;

FirstVertex(): TopoDS_Vertex;

LastVertex(): TopoDS_Vertex;

// Returns the last edge added to the polygon
Edge(): TopoDS_Edge;

Wire(): TopoDS_Wire;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This is the root class for all shape constructions
BRepLib_MakeShape: declare class BRepLib_MakeShape extends BRepLib_Command

// This is called by `Shape()`
Build(): void;

Shape(): TopoDS_Shape;

// returns the status of the Face after the shape creation
FaceStatus(F: TopoDS_Face): BRepLib_ShapeModification;

// Returns True if the Face generates new topology
HasDescendants(F: TopoDS_Face): boolean;

// returns the list of generated Faces
DescendantFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

// returns the number of surfaces after the shape creation
NbSurfaces(): number;

// Return the faces created for surface I
NewFaces(I: number): NCollection_List_TopoDS_Shape;

// returns a list of the created faces from the edge <E>
FacesFromEdges(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to build shells
BRepLib_MakeShell: declare class BRepLib_MakeShell extends BRepLib_MakeShape

constructor

// Creates the shell from the surface and the min-max values
Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Segment?: boolean): void;

Error(): BRepLib_ShellError;

// Returns the new Shell
Shell(): TopoDS_Shell;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Makes a solid from compsolid or shells
BRepLib_MakeSolid: declare class BRepLib_MakeSolid extends BRepLib_MakeShape

constructor

// Add the shell to the current solid
Add(S: TopoDS_Shell): void;

// Returns the new Solid
Solid(): TopoDS_Solid;

// returns the status of the Face after the shape creation
FaceStatus(F: TopoDS_Face): BRepLib_ShapeModification;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to build vertices
BRepLib_MakeVertex: declare class BRepLib_MakeVertex extends BRepLib_MakeShape

constructor

Vertex(): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to build wires
BRepLib_MakeWire: declare class BRepLib_MakeWire extends BRepLib_MakeShape

constructor

// Add the edge <E> to the current wire
Add(E: TopoDS_Edge): void;
Add(W: TopoDS_Wire): void;
Add(L: NCollection_List_TopoDS_Shape): void;
Add(E: TopoDS_Edge): void;
Add(W: TopoDS_Wire): void;
Add(L: NCollection_List_TopoDS_Shape): void;
Add(E: TopoDS_Edge): void;
Add(W: TopoDS_Wire): void;
Add(L: NCollection_List_TopoDS_Shape): void;

Error(): BRepLib_WireError;

// Returns the new wire
Wire(): TopoDS_Wire;

// Returns the last edge added to the wire
Edge(): TopoDS_Edge;

// Returns the last connecting vertex
Vertex(): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This tool is intended to get points from shape with specified distance from shape along normal
BRepLib_PointCloudShape: declare class BRepLib_PointCloudShape

// Return loaded shape
Shape(): TopoDS_Shape;

// Set shape
SetShape(theShape: TopoDS_Shape): void;

// Return tolerance
Tolerance(): number;

// Set tolerance
SetTolerance(theTol: number): void;

// Returns value of the distance to define deflection of points from shape along normal to shape
GetDistance(): number;

// Sets value of the distance to define deflection of points from shape along normal to shape
SetDistance(theDist: number): void;

// Returns size of the point cloud for specified density
NbPointsByDensity(theDensity?: number): number;

// Returns size of the point cloud for using triangulation
NbPointsByTriangulation(): number;

// Computes points with specified density for initial shape
GeneratePointsByDensity(theDensity?: number): boolean;

// Get points from triangulation existing in the shape
GeneratePointsByTriangulation(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Modification type after a topologic operation
BRepLib_ShapeModification: typeof BRepLib_ShapeModification[keyof typeof BRepLib_ShapeModification]

// Errors that can occur at shell construction
BRepLib_ShellError: typeof BRepLib_ShellError[keyof typeof BRepLib_ShellError]

// Provides methods for calculating normals to {@link Poly_Triangulation`Poly_Triangulation`} of {@link TopoDS_Face`TopoDS_Face`}
BRepLib_ToolTriangulatedShape: declare class BRepLib_ToolTriangulatedShape

constructor

// Computes nodal normals for {@link Poly_Triangulation`Poly_Triangulation`} structure using UV coordinates and surface
static ComputeNormals(theFace: TopoDS_Face, theTris: Poly_Triangulation): void;
static ComputeNormals(theFace: TopoDS_Face, theTris: Poly_Triangulation, thePolyConnect: Poly_Connect): void;
static ComputeNormals(theFace: TopoDS_Face, theTris: Poly_Triangulation): void;
static ComputeNormals(theFace: TopoDS_Face, theTris: Poly_Triangulation, thePolyConnect: Poly_Connect): void;
// theFace: the face
// theTris: the definition of a face triangulation

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the max distance between 3D-curve and curve on surface
BRepLib_ValidateEdge: declare class BRepLib_ValidateEdge

constructor

// Sets method to calculate distance
SetExactMethod(theIsExact: boolean): void;

// Returns true if exact method selected
IsExactMethod(): boolean;

// Sets parallel flag
SetParallel(theIsMultiThread: boolean): void;

// Returns true if parallel flag is set
IsParallel(): boolean;

// Set control points number (if you need a value other than 22)
SetControlPointsNumber(theControlPointsNumber: number): void;

// Sets limit to compute a distance in the `Process()` function
SetExitIfToleranceExceeded(theToleranceForChecking: number): void;

// Computes the max distance for the 3d curve <myReferenceCurve> and curve on surface <myOtherCurve>
Process(): void;

// Returns true if the distance has been found for all points
IsDone(): boolean;

// Returns true if computed distance is less than <theToleranceToCheck>
CheckTolerance(theToleranceToCheck: number): boolean;

// Returns max distance
GetMaxDistance(): number;

// Increase <theToleranceToUpdate> if max distance is greater than <theToleranceToUpdate>
UpdateTolerance(theToleranceToUpdate?: number): { theToleranceToUpdate: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Errors that can occur at wire construction
BRepLib_WireError: typeof BRepLib_WireError[keyof typeof BRepLib_WireError]
