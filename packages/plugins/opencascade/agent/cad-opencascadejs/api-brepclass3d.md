# libcascade — BRepClass3d

10 top-level symbols. Signatures are verbatim typescript.

BRepClass3d: declare class BRepClass3d

constructor

// Returns the outer most shell of
static OuterShell(S: TopoDS_Solid): TopoDS_Shell;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepClass3d_BndBoxTreeSelectorLine: declare class BRepClass3d_BndBoxTreeSelectorLine

constructor

Reject(argNo0: Bnd_Box): boolean;

Accept(argNo0: number): boolean;

SetCurrentLine(theL: gp_Lin, theMaxParam: number): void;

GetEdgeParam(i: number, theOutE: TopoDS_Edge, theOutParam?: number, outLParam?: number): { theOutParam: number; outLParam: number };

GetVertParam(i: number, theOutV: TopoDS_Vertex, outLParam?: number): { outLParam: number };

GetNbEdgeParam(): number;

GetNbVertParam(): number;

ClearResults(): void;

// Returns TRUE if correct classification is possible
IsCorrect(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepClass3d_BndBoxTreeSelectorPoint: declare class BRepClass3d_BndBoxTreeSelectorPoint

constructor

Reject(argNo0: Bnd_Box): boolean;

Accept(argNo0: number): boolean;

SetCurrentPoint(theP: gp_Pnt): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepClass3d_Intersector3d: declare class BRepClass3d_Intersector3d

constructor

// Perform the intersection between the segment L(0) ..
Perform(L: gp_Lin, Prm: number, Tol: number, F: TopoDS_Face): void;

// True is returned when the intersection have been computed
IsDone(): boolean;

// True is returned if a point has been found
HasAPoint(): boolean;

// Returns the U parameter of the intersection point on the surface
UParameter(): number;

// Returns the V parameter of the intersection point on the surface
VParameter(): number;

// Returns the parameter of the intersection point on the line
WParameter(): number;

// Returns the geometric point of the intersection between the line and the surface
Pnt(): gp_Pnt;

// Returns the transition of the line on the surface
Transition(): IntCurveSurface_TransitionOnCurve;

// Returns the state of the point on the face
State(): TopAbs_State;

// Returns the significant face used to determine the intersection
Face(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides an algorithm to classify a point in a solid
BRepClass3d_SClassifier: declare class BRepClass3d_SClassifier

constructor

// Classify the point P with the tolerance Tol on the solid S
Perform(S: BRepClass3d_SolidExplorer, P: gp_Pnt, Tol: number): void;

// Classify an infinite point with the tolerance Tol on the solid S
PerformInfinitePoint(S: BRepClass3d_SolidExplorer, Tol: number): void;

// Returns True if the classification has been computed by rejection
Rejected(): boolean;

// Returns the result of the classification
State(): TopAbs_State;

// Returns True when the point is a point of a face
IsOnAFace(): boolean;

// Returns the face used to determine the classification
Face(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides an algorithm to classify a point in a solid
BRepClass3d_SolidClassifier: declare class BRepClass3d_SolidClassifier extends BRepClass3d_SClassifier

constructor

Load(S: TopoDS_Shape): void;

// Classify the point P with the tolerance Tol on the solid S
Perform(P: gp_Pnt, Tol: number): void;
Perform(S: BRepClass3d_SolidExplorer, P: gp_Pnt, Tol: number): void;
Perform(P: gp_Pnt, Tol: number): void;
Perform(S: BRepClass3d_SolidExplorer, P: gp_Pnt, Tol: number): void;

// Classify an infinite point with the tolerance Tol on the solid S
PerformInfinitePoint(Tol: number): void;
PerformInfinitePoint(S: BRepClass3d_SolidExplorer, Tol: number): void;
PerformInfinitePoint(Tol: number): void;
PerformInfinitePoint(S: BRepClass3d_SolidExplorer, Tol: number): void;

Destroy(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provide an exploration of a BRep Shape for the classification
BRepClass3d_SolidExplorer: declare class BRepClass3d_SolidExplorer

constructor

InitShape(S: TopoDS_Shape): void;

// Should return True if P outside of bounding vol
Reject(P: gp_Pnt): boolean;

// compute a point P in the face F
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt): boolean;
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, Param: number): { returnValue: boolean; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, u: number, v: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt): boolean;
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, Param: number): { returnValue: boolean; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, u: number, v: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt): boolean;
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, Param: number): { returnValue: boolean; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, u: number, v: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt): boolean;
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, Param: number): { returnValue: boolean; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, u: number, v: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt): boolean;
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, Param: number): { returnValue: boolean; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, u: number, v: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt): boolean;
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, Param: number): { returnValue: boolean; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, u: number, v: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number): { returnValue: boolean; u: number; v: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number): { returnValue: boolean; u: number; v: number; Param: number };
static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number };

// <Index> gives point index to search from and returns point index of succeseful search
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number, Index?: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number, Index?: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number, Index?: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number; Index: number };

// Starts an exploration of the shells
InitShell(): void;

// Returns True if there is a current shell
MoreShell(): boolean;

// Sets the explorer to the next shell
NextShell(): void;

// Returns the current shell
CurrentShell(): TopoDS_Shell;

// Returns True if the Shell is rejected
RejectShell(L: gp_Lin): boolean;

// Starts an exploration of the faces of the current shell
InitFace(): void;

// Returns True if current face in current shell
MoreFace(): boolean;

// Sets the explorer to the next Face of the current shell
NextFace(): void;

// Returns the current face
CurrentFace(): TopoDS_Face;

// returns True if the face is rejected
RejectFace(L: gp_Lin): boolean;

// Returns in <L>, <Par> a segment having at least one intersection with the shape boundary to compute intersections
Segment(P: gp_Pnt, L: gp_Lin, Par?: number): { returnValue: number; Par: number };
// L: Mutated in place

// Returns in <L>, <Par> a segment having at least one intersection with the shape boundary to compute intersections
OtherSegment(P: gp_Pnt, L: gp_Lin, Par?: number): { returnValue: number; Par: number };
// L: Mutated in place

// Returns the index of face for which last segment is calculated
GetFaceSegmentIndex(): number;

DumpSegment(P: gp_Pnt, L: gp_Lin, Par: number, S: TopAbs_State): void;

GetShape(): TopoDS_Shape;

// Return edge/vertices map for current shape
GetMapEV(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

Destroy(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepClass3d_SolidPassiveClassifier: declare class BRepClass3d_SolidPassiveClassifier

constructor

// Starts a classification process
Reset(L: gp_Lin, P: number, Tol: number): void;

// Updates the classification process with the face <F> from the boundary
Compare(F: TopoDS_Face, Or: TopAbs_Orientation): void;

// Returns the current value of the parameter
Parameter(): number;

// Returns True if an intersection is computed
HasIntersection(): boolean;

// Returns the intersecting algorithm
Intersector(): BRepClass3d_Intersector3d;

// Returns the current state of the point
State(): TopAbs_State;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepClass3d_BndBoxTreeSelectorLine_EdgeParam: interface BRepClass3d_BndBoxTreeSelectorLine_EdgeParam

myE: TopoDS_Edge

myParam: number

myLParam: number

BRepClass3d_BndBoxTreeSelectorLine_VertParam: interface BRepClass3d_BndBoxTreeSelectorLine_VertParam

myV: TopoDS_Vertex

myLParam: number
