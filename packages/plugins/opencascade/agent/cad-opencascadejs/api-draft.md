# libcascade — Draft

6 top-level symbols. Signatures are verbatim typescript.

Draft: declare class Draft

  constructor

  static Angle(F: TopoDS_Face, Direction: gp_Dir): number;

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

  delete(): void;

  [Symbol.dispose](): void;

Draft_Modification: declare class Draft_Modification extends BRepTools_Modification

  constructor

  Clear(): void;

  Init(S: TopoDS_Shape): void;

  Add(F: TopoDS_Face, Direction: gp_Dir, Angle: number, NeutralPlane: gp_Pln, Flag?: boolean): boolean;

  Remove(F: TopoDS_Face): void;

  Perform(): void;

  IsDone(): boolean;

  Error(): Draft_ErrorStatus;

  ProblematicShape(): TopoDS_Shape;

  ConnectedFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  ModifiedFaces(): NCollection_List_TopoDS_Shape;

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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

  delete(): void;

  [Symbol.dispose](): void;
