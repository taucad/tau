# libcascade — BRepClass3d

10 top-level symbols. Signatures are verbatim typescript.

BRepClass3d: declare class BRepClass3d

constructor

static OuterShell(S: TopoDS_Solid): TopoDS_Shell;

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

IsCorrect(): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepClass3d_BndBoxTreeSelectorPoint: declare class BRepClass3d_BndBoxTreeSelectorPoint

constructor

Reject(argNo0: Bnd_Box): boolean;

Accept(argNo0: number): boolean;

SetCurrentPoint(theP: gp_Pnt): void;

delete(): void;

[Symbol.dispose](): void;

BRepClass3d_Intersector3d: declare class BRepClass3d_Intersector3d

constructor

Perform(L: gp_Lin, Prm: number, Tol: number, F: TopoDS_Face): void;

IsDone(): boolean;

HasAPoint(): boolean;

UParameter(): number;

VParameter(): number;

WParameter(): number;

Pnt(): gp_Pnt;

Transition(): IntCurveSurface_TransitionOnCurve;

State(): TopAbs_State;

Face(): TopoDS_Face;

delete(): void;

[Symbol.dispose](): void;

BRepClass3d_SClassifier: declare class BRepClass3d_SClassifier

constructor

Perform(S: BRepClass3d_SolidExplorer, P: gp_Pnt, Tol: number): void;

PerformInfinitePoint(S: BRepClass3d_SolidExplorer, Tol: number): void;

Rejected(): boolean;

State(): TopAbs_State;

IsOnAFace(): boolean;

Face(): TopoDS_Face;

delete(): void;

[Symbol.dispose](): void;

BRepClass3d_SolidClassifier: declare class BRepClass3d_SolidClassifier extends BRepClass3d_SClassifier

constructor

Load(S: TopoDS_Shape): void;

Perform(P: gp_Pnt, Tol: number): void;
Perform(S: BRepClass3d_SolidExplorer, P: gp_Pnt, Tol: number): void;
Perform(P: gp_Pnt, Tol: number): void;
Perform(S: BRepClass3d_SolidExplorer, P: gp_Pnt, Tol: number): void;

PerformInfinitePoint(Tol: number): void;
PerformInfinitePoint(S: BRepClass3d_SolidExplorer, Tol: number): void;
PerformInfinitePoint(Tol: number): void;
PerformInfinitePoint(S: BRepClass3d_SolidExplorer, Tol: number): void;

Destroy(): void;

delete(): void;

[Symbol.dispose](): void;

BRepClass3d_SolidExplorer: declare class BRepClass3d_SolidExplorer

constructor

InitShape(S: TopoDS_Shape): void;

Reject(P: gp_Pnt): boolean;

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

PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number, Index?: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number, Index?: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number, Index?: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number; Index: number };

InitShell(): void;

MoreShell(): boolean;

NextShell(): void;

CurrentShell(): TopoDS_Shell;

RejectShell(L: gp_Lin): boolean;

InitFace(): void;

MoreFace(): boolean;

NextFace(): void;

CurrentFace(): TopoDS_Face;

RejectFace(L: gp_Lin): boolean;

Segment(P: gp_Pnt, L: gp_Lin, Par?: number): { returnValue: number; Par: number };

OtherSegment(P: gp_Pnt, L: gp_Lin, Par?: number): { returnValue: number; Par: number };

GetFaceSegmentIndex(): number;

DumpSegment(P: gp_Pnt, L: gp_Lin, Par: number, S: TopAbs_State): void;

GetShape(): TopoDS_Shape;

GetMapEV(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

Destroy(): void;

delete(): void;

[Symbol.dispose](): void;

BRepClass3d_SolidPassiveClassifier: declare class BRepClass3d_SolidPassiveClassifier

constructor

Reset(L: gp_Lin, P: number, Tol: number): void;

Compare(F: TopoDS_Face, Or: TopAbs_Orientation): void;

Parameter(): number;

HasIntersection(): boolean;

Intersector(): BRepClass3d_Intersector3d;

State(): TopAbs_State;

delete(): void;

[Symbol.dispose](): void;

BRepClass3d_BndBoxTreeSelectorLine_EdgeParam: interface BRepClass3d_BndBoxTreeSelectorLine_EdgeParam

myE: TopoDS_Edge

myParam: number

myLParam: number

BRepClass3d_BndBoxTreeSelectorLine_VertParam: interface BRepClass3d_BndBoxTreeSelectorLine_VertParam

myV: TopoDS_Vertex

myLParam: number
