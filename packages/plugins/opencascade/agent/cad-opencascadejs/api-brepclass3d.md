# libcascade — BRepClass3d

10 top-level symbols. Signatures are verbatim typescript.

BRepClass3d: declare class BRepClass3d

  // BRepClass3d.constructor (constructor)
  constructor();

  // BRepClass3d.OuterShell (method)
  static OuterShell(S: TopoDS_Solid): TopoDS_Shell;

  // BRepClass3d.delete (method)
  delete(): void;

  // BRepClass3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass3d_BndBoxTreeSelectorLine: declare class BRepClass3d_BndBoxTreeSelectorLine

  // BRepClass3d_BndBoxTreeSelectorLine.constructor (constructor)
  constructor(theMapOfShape: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher);

  // BRepClass3d_BndBoxTreeSelectorLine.Reject (method)
  Reject(argNo0: Bnd_Box): boolean;

  // BRepClass3d_BndBoxTreeSelectorLine.Accept (method)
  Accept(argNo0: number): boolean;

  // BRepClass3d_BndBoxTreeSelectorLine.SetCurrentLine (method)
  SetCurrentLine(theL: gp_Lin, theMaxParam: number): void;

  // BRepClass3d_BndBoxTreeSelectorLine.GetEdgeParam (method)
  GetEdgeParam(i: number, theOutE: TopoDS_Edge, theOutParam?: number, outLParam?: number): { theOutParam: number; outLParam: number };

  // BRepClass3d_BndBoxTreeSelectorLine.GetVertParam (method)
  GetVertParam(i: number, theOutV: TopoDS_Vertex, outLParam?: number): { outLParam: number };

  // BRepClass3d_BndBoxTreeSelectorLine.GetNbEdgeParam (method)
  GetNbEdgeParam(): number;

  // BRepClass3d_BndBoxTreeSelectorLine.GetNbVertParam (method)
  GetNbVertParam(): number;

  // BRepClass3d_BndBoxTreeSelectorLine.ClearResults (method)
  ClearResults(): void;

  // BRepClass3d_BndBoxTreeSelectorLine.IsCorrect (method)
  IsCorrect(): boolean;

  // BRepClass3d_BndBoxTreeSelectorLine.delete (method)
  delete(): void;

  // BRepClass3d_BndBoxTreeSelectorLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass3d_BndBoxTreeSelectorPoint: declare class BRepClass3d_BndBoxTreeSelectorPoint

  // BRepClass3d_BndBoxTreeSelectorPoint.constructor (constructor)
  constructor(theMapOfShape: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher);

  // BRepClass3d_BndBoxTreeSelectorPoint.Reject (method)
  Reject(argNo0: Bnd_Box): boolean;

  // BRepClass3d_BndBoxTreeSelectorPoint.Accept (method)
  Accept(argNo0: number): boolean;

  // BRepClass3d_BndBoxTreeSelectorPoint.SetCurrentPoint (method)
  SetCurrentPoint(theP: gp_Pnt): void;

  // BRepClass3d_BndBoxTreeSelectorPoint.delete (method)
  delete(): void;

  // BRepClass3d_BndBoxTreeSelectorPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass3d_Intersector3d: declare class BRepClass3d_Intersector3d

  // BRepClass3d_Intersector3d.constructor (constructor)
  constructor();

  // BRepClass3d_Intersector3d.Perform (method)
  Perform(L: gp_Lin, Prm: number, Tol: number, F: TopoDS_Face): void;

  // BRepClass3d_Intersector3d.IsDone (method)
  IsDone(): boolean;

  // BRepClass3d_Intersector3d.HasAPoint (method)
  HasAPoint(): boolean;

  // BRepClass3d_Intersector3d.UParameter (method)
  UParameter(): number;

  // BRepClass3d_Intersector3d.VParameter (method)
  VParameter(): number;

  // BRepClass3d_Intersector3d.WParameter (method)
  WParameter(): number;

  // BRepClass3d_Intersector3d.Pnt (method)
  Pnt(): gp_Pnt;

  // BRepClass3d_Intersector3d.Transition (method)
  Transition(): IntCurveSurface_TransitionOnCurve;

  // BRepClass3d_Intersector3d.State (method)
  State(): TopAbs_State;

  // BRepClass3d_Intersector3d.Face (method)
  Face(): TopoDS_Face;

  // BRepClass3d_Intersector3d.delete (method)
  delete(): void;

  // BRepClass3d_Intersector3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass3d_SClassifier: declare class BRepClass3d_SClassifier

  // BRepClass3d_SClassifier.constructor (constructor)
  constructor();
  constructor(S: BRepClass3d_SolidExplorer, P: gp_Pnt, Tol: number);

  // BRepClass3d_SClassifier.Perform (method)
  Perform(S: BRepClass3d_SolidExplorer, P: gp_Pnt, Tol: number): void;

  // BRepClass3d_SClassifier.PerformInfinitePoint (method)
  PerformInfinitePoint(S: BRepClass3d_SolidExplorer, Tol: number): void;

  // BRepClass3d_SClassifier.Rejected (method)
  Rejected(): boolean;

  // BRepClass3d_SClassifier.State (method)
  State(): TopAbs_State;

  // BRepClass3d_SClassifier.IsOnAFace (method)
  IsOnAFace(): boolean;

  // BRepClass3d_SClassifier.Face (method)
  Face(): TopoDS_Face;

  // BRepClass3d_SClassifier.delete (method)
  delete(): void;

  // BRepClass3d_SClassifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass3d_SolidClassifier: declare class BRepClass3d_SolidClassifier extends BRepClass3d_SClassifier

  // BRepClass3d_SolidClassifier.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);
  constructor(S: TopoDS_Shape, P: gp_Pnt, Tol: number);

  // BRepClass3d_SolidClassifier.Load (method)
  Load(S: TopoDS_Shape): void;

  // BRepClass3d_SolidClassifier.Perform (method)
  Perform(P: gp_Pnt, Tol: number): void;
  Perform(S: BRepClass3d_SolidExplorer, P: gp_Pnt, Tol: number): void;

  // BRepClass3d_SolidClassifier.PerformInfinitePoint (method)
  PerformInfinitePoint(Tol: number): void;
  PerformInfinitePoint(S: BRepClass3d_SolidExplorer, Tol: number): void;

  // BRepClass3d_SolidClassifier.Destroy (method)
  Destroy(): void;

  // BRepClass3d_SolidClassifier.delete (method)
  delete(): void;

  // BRepClass3d_SolidClassifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass3d_SolidExplorer: declare class BRepClass3d_SolidExplorer

  // BRepClass3d_SolidExplorer.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // BRepClass3d_SolidExplorer.InitShape (method)
  InitShape(S: TopoDS_Shape): void;

  // BRepClass3d_SolidExplorer.Reject (method)
  Reject(P: gp_Pnt): boolean;

  // BRepClass3d_SolidExplorer.FindAPointInTheFace (method)
  static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt): boolean;
  static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, Param: number): { returnValue: boolean; Param: number };
  static FindAPointInTheFace(F: TopoDS_Face, u: number, v: number): { returnValue: boolean; u: number; v: number };
  static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number): { returnValue: boolean; u: number; v: number };
  static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number): { returnValue: boolean; u: number; v: number; Param: number };
  static FindAPointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number };

  // BRepClass3d_SolidExplorer.PointInTheFace (method)
  PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u?: number, v?: number, Param?: number, Index?: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
  PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number): { returnValue: boolean; u: number; v: number; Param: number; Index: number };
  PointInTheFace(F: TopoDS_Face, P: gp_Pnt, u: number, v: number, Param: number, Index: number, surf: BRepAdaptor_Surface, u1: number, v1: number, u2: number, v2: number, theVecD1U: gp_Vec, theVecD1V: gp_Vec): { returnValue: boolean; u: number; v: number; Param: number; Index: number };

  // BRepClass3d_SolidExplorer.InitShell (method)
  InitShell(): void;

  // BRepClass3d_SolidExplorer.MoreShell (method)
  MoreShell(): boolean;

  // BRepClass3d_SolidExplorer.NextShell (method)
  NextShell(): void;

  // BRepClass3d_SolidExplorer.CurrentShell (method)
  CurrentShell(): TopoDS_Shell;

  // BRepClass3d_SolidExplorer.RejectShell (method)
  RejectShell(L: gp_Lin): boolean;

  // BRepClass3d_SolidExplorer.InitFace (method)
  InitFace(): void;

  // BRepClass3d_SolidExplorer.MoreFace (method)
  MoreFace(): boolean;

  // BRepClass3d_SolidExplorer.NextFace (method)
  NextFace(): void;

  // BRepClass3d_SolidExplorer.CurrentFace (method)
  CurrentFace(): TopoDS_Face;

  // BRepClass3d_SolidExplorer.RejectFace (method)
  RejectFace(L: gp_Lin): boolean;

  // BRepClass3d_SolidExplorer.Segment (method)
  Segment(P: gp_Pnt, L: gp_Lin, Par?: number): { returnValue: number; Par: number };

  // BRepClass3d_SolidExplorer.OtherSegment (method)
  OtherSegment(P: gp_Pnt, L: gp_Lin, Par?: number): { returnValue: number; Par: number };

  // BRepClass3d_SolidExplorer.GetFaceSegmentIndex (method)
  GetFaceSegmentIndex(): number;

  // BRepClass3d_SolidExplorer.DumpSegment (method)
  DumpSegment(P: gp_Pnt, L: gp_Lin, Par: number, S: TopAbs_State): void;

  // BRepClass3d_SolidExplorer.GetShape (method)
  GetShape(): TopoDS_Shape;

  // BRepClass3d_SolidExplorer.GetMapEV (method)
  GetMapEV(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

  // BRepClass3d_SolidExplorer.Destroy (method)
  Destroy(): void;

  // BRepClass3d_SolidExplorer.delete (method)
  delete(): void;

  // BRepClass3d_SolidExplorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass3d_SolidPassiveClassifier: declare class BRepClass3d_SolidPassiveClassifier

  // BRepClass3d_SolidPassiveClassifier.constructor (constructor)
  constructor();

  // BRepClass3d_SolidPassiveClassifier.Reset (method)
  Reset(L: gp_Lin, P: number, Tol: number): void;

  // BRepClass3d_SolidPassiveClassifier.Compare (method)
  Compare(F: TopoDS_Face, Or: TopAbs_Orientation): void;

  // BRepClass3d_SolidPassiveClassifier.Parameter (method)
  Parameter(): number;

  // BRepClass3d_SolidPassiveClassifier.HasIntersection (method)
  HasIntersection(): boolean;

  // BRepClass3d_SolidPassiveClassifier.Intersector (method)
  Intersector(): BRepClass3d_Intersector3d;

  // BRepClass3d_SolidPassiveClassifier.State (method)
  State(): TopAbs_State;

  // BRepClass3d_SolidPassiveClassifier.delete (method)
  delete(): void;

  // BRepClass3d_SolidPassiveClassifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass3d_BndBoxTreeSelectorLine_EdgeParam: interface BRepClass3d_BndBoxTreeSelectorLine_EdgeParam

  myE: TopoDS_Edge

  myParam: number

  myLParam: number

BRepClass3d_BndBoxTreeSelectorLine_VertParam: interface BRepClass3d_BndBoxTreeSelectorLine_VertParam

  myV: TopoDS_Vertex

  myLParam: number
