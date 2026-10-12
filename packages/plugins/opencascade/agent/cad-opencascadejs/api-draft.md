# libcascade — Draft

6 top-level symbols. Signatures are verbatim typescript.

Draft: declare class Draft

  // Draft.constructor (constructor)
  constructor();

  // Draft.Angle (method)
  static Angle(F: TopoDS_Face, Direction: gp_Dir): number;

  // Draft.delete (method)
  delete(): void;

  // Draft.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Draft_EdgeInfo: declare class Draft_EdgeInfo

  // Draft_EdgeInfo.constructor (constructor)
  constructor();
  constructor(HasNewGeometry: boolean);

  // Draft_EdgeInfo.Add (method)
  Add(F: TopoDS_Face): void;

  // Draft_EdgeInfo.RootFace (method)
  RootFace(F: TopoDS_Face): void;
  RootFace(): TopoDS_Face;

  // Draft_EdgeInfo.Tangent (method)
  Tangent(P: gp_Pnt): void;

  // Draft_EdgeInfo.IsTangent (method)
  IsTangent(P: gp_Pnt): boolean;

  // Draft_EdgeInfo.NewGeometry (method)
  NewGeometry(): boolean;

  // Draft_EdgeInfo.SetNewGeometry (method)
  SetNewGeometry(NewGeom: boolean): void;

  // Draft_EdgeInfo.Geometry (method)
  Geometry(): Geom_Curve;

  // Draft_EdgeInfo.FirstFace (method)
  FirstFace(): TopoDS_Face;

  // Draft_EdgeInfo.SecondFace (method)
  SecondFace(): TopoDS_Face;

  // Draft_EdgeInfo.FirstPC (method)
  FirstPC(): Geom2d_Curve;

  // Draft_EdgeInfo.SecondPC (method)
  SecondPC(): Geom2d_Curve;

  // Draft_EdgeInfo.ChangeGeometry (method)
  ChangeGeometry(): Geom_Curve;

  // Draft_EdgeInfo.ChangeFirstPC (method)
  ChangeFirstPC(): Geom2d_Curve;

  // Draft_EdgeInfo.ChangeSecondPC (method)
  ChangeSecondPC(): Geom2d_Curve;

  // Draft_EdgeInfo.Tolerance (method)
  Tolerance(tol: number): void;
  Tolerance(): number;

  // Draft_EdgeInfo.delete (method)
  delete(): void;

  // Draft_EdgeInfo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Draft_ErrorStatus: typeof Draft_ErrorStatus[keyof typeof Draft_ErrorStatus]

  readonly Draft_NoError: 'Draft_NoError'

  readonly Draft_FaceRecomputation: 'Draft_FaceRecomputation'

  readonly Draft_EdgeRecomputation: 'Draft_EdgeRecomputation'

  readonly Draft_VertexRecomputation: 'Draft_VertexRecomputation'

Draft_FaceInfo: declare class Draft_FaceInfo

  // Draft_FaceInfo.constructor (constructor)
  constructor();
  constructor(S: Geom_Surface, HasNewGeometry: boolean);

  // Draft_FaceInfo.RootFace (method)
  RootFace(F: TopoDS_Face): void;
  RootFace(): TopoDS_Face;

  // Draft_FaceInfo.NewGeometry (method)
  NewGeometry(): boolean;

  // Draft_FaceInfo.Add (method)
  Add(F: TopoDS_Face): void;

  // Draft_FaceInfo.FirstFace (method)
  FirstFace(): TopoDS_Face;

  // Draft_FaceInfo.SecondFace (method)
  SecondFace(): TopoDS_Face;

  // Draft_FaceInfo.Geometry (method)
  Geometry(): Geom_Surface;

  // Draft_FaceInfo.ChangeGeometry (method)
  ChangeGeometry(): Geom_Surface;

  // Draft_FaceInfo.ChangeCurve (method)
  ChangeCurve(): Geom_Curve;

  // Draft_FaceInfo.Curve (method)
  Curve(): Geom_Curve;

  // Draft_FaceInfo.delete (method)
  delete(): void;

  // Draft_FaceInfo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Draft_Modification: declare class Draft_Modification extends BRepTools_Modification

  // Draft_Modification.constructor (constructor)
  constructor(S: TopoDS_Shape);

  // Draft_Modification.Clear (method)
  Clear(): void;

  // Draft_Modification.Init (method)
  Init(S: TopoDS_Shape): void;

  // Draft_Modification.Add (method)
  Add(F: TopoDS_Face, Direction: gp_Dir, Angle: number, NeutralPlane: gp_Pln, Flag?: boolean): boolean;

  // Draft_Modification.Remove (method)
  Remove(F: TopoDS_Face): void;

  // Draft_Modification.Perform (method)
  Perform(): void;

  // Draft_Modification.IsDone (method)
  IsDone(): boolean;

  // Draft_Modification.Error (method)
  Error(): Draft_ErrorStatus;

  // Draft_Modification.ProblematicShape (method)
  ProblematicShape(): TopoDS_Shape;

  // Draft_Modification.ConnectedFaces (method)
  ConnectedFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // Draft_Modification.ModifiedFaces (method)
  ModifiedFaces(): NCollection_List_TopoDS_Shape;

  // Draft_Modification.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // Draft_Modification.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // Draft_Modification.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // Draft_Modification.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // Draft_Modification.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // Draft_Modification.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // Draft_Modification.get_type_name (method)
  static get_type_name(): string;

  // Draft_Modification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Draft_Modification.DynamicType (method)
  DynamicType(): Standard_Type;

  // Draft_Modification.delete (method)
  delete(): void;

  // Draft_Modification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Draft_VertexInfo: declare class Draft_VertexInfo

  // Draft_VertexInfo.constructor (constructor)
  constructor();

  // Draft_VertexInfo.Add (method)
  Add(E: TopoDS_Edge): void;

  // Draft_VertexInfo.Geometry (method)
  Geometry(): gp_Pnt;

  // Draft_VertexInfo.Parameter (method)
  Parameter(E: TopoDS_Edge): number;

  // Draft_VertexInfo.InitEdgeIterator (method)
  InitEdgeIterator(): void;

  // Draft_VertexInfo.Edge (method)
  Edge(): TopoDS_Edge;

  // Draft_VertexInfo.NextEdge (method)
  NextEdge(): void;

  // Draft_VertexInfo.MoreEdge (method)
  MoreEdge(): boolean;

  // Draft_VertexInfo.ChangeGeometry (method)
  ChangeGeometry(): gp_Pnt;

  // Draft_VertexInfo.ChangeParameter (method)
  ChangeParameter(E: TopoDS_Edge): number;

  // Draft_VertexInfo.delete (method)
  delete(): void;

  // Draft_VertexInfo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
