# libcascade — Draft

6 top-level symbols. Signatures are verbatim typescript.

Draft: declare class Draft

constructor

// Returns the draft angle of the face <F> using the direction <Direction>
static Angle(F: TopoDS_Face, Direction: gp_Dir): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Draft_EdgeInfo: declare class Draft_EdgeInfo

constructor

Add(F: TopoDS_Face): void;

RootFace(F: TopoDS_Face): void;
RootFace(): TopoDS_Face;
RootFace(F: TopoDS_Face): void;
RootFace(): TopoDS_Face;

Tangent(P: gp_Pnt): void;

IsTangent(P: gp_Pnt): boolean;

NewGeometry(): boolean;

SetNewGeometry(NewGeom: boolean): void;

Geometry(): Geom_Curve;

FirstFace(): TopoDS_Face;

SecondFace(): TopoDS_Face;

FirstPC(): Geom2d_Curve;

SecondPC(): Geom2d_Curve;

ChangeGeometry(): Geom_Curve;

ChangeFirstPC(): Geom2d_Curve;

ChangeSecondPC(): Geom2d_Curve;

Tolerance(tol: number): void;
Tolerance(): number;
Tolerance(tol: number): void;
Tolerance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Draft_ErrorStatus: typeof Draft_ErrorStatus[keyof typeof Draft_ErrorStatus]

Draft_FaceInfo: declare class Draft_FaceInfo

constructor

RootFace(F: TopoDS_Face): void;
RootFace(): TopoDS_Face;
RootFace(F: TopoDS_Face): void;
RootFace(): TopoDS_Face;

NewGeometry(): boolean;

Add(F: TopoDS_Face): void;

FirstFace(): TopoDS_Face;

SecondFace(): TopoDS_Face;

Geometry(): Geom_Surface;

ChangeGeometry(): Geom_Surface;

ChangeCurve(): Geom_Curve;

Curve(): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Draft_Modification: declare class Draft_Modification extends BRepTools_Modification

constructor

// Resets on the same shape
Clear(): void;

// Changes the basis shape and resets
Init(S: TopoDS_Shape): void;

// Adds the face F and propagates the draft modification to its neighbour faces if they are tangent
Add(F: TopoDS_Face, Direction: gp_Dir, Angle: number, NeutralPlane: gp_Pln, Flag?: boolean): boolean;

// Removes the face F and the neighbour faces if they are tangent
Remove(F: TopoDS_Face): void;

// Performs the draft angle modification and sets the value returned by the method IsDone
Perform(): void;

// Returns True if Perform has been successfully called
IsDone(): boolean;

Error(): Draft_ErrorStatus;

// Returns the shape (Face, Edge or Vertex) on which an error occurred
ProblematicShape(): TopoDS_Shape;

// Returns all the faces which have been added together with the face <F>
ConnectedFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

// Returns all the faces on which a modification has been given
ModifiedFaces(): NCollection_List_TopoDS_Shape;

// Returns true if the face <F> has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the edge <E> has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the vertex <V> has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the edge <E> has a new curve on surface on the face <F>.In this case, `is the new geometric support of the edge, <L> the new location, <Tol> the new tolerance.`
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the Vertex <V> has a new parameter on the edge <E>
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Draft_VertexInfo: declare class Draft_VertexInfo

constructor

Add(E: TopoDS_Edge): void;

Geometry(): gp_Pnt;

Parameter(E: TopoDS_Edge): number;

InitEdgeIterator(): void;

Edge(): TopoDS_Edge;

NextEdge(): void;

MoreEdge(): boolean;

ChangeGeometry(): gp_Pnt;

ChangeParameter(E: TopoDS_Edge): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
