# libcascade — BRepBuilderAPI

31 top-level symbols. Signatures are verbatim typescript.

BRepBuilderAPI: declare class BRepBuilderAPI

  // BRepBuilderAPI.constructor (constructor)
  constructor();

  // BRepBuilderAPI.Plane (method)
  static Plane(P: Geom_Plane): void;
  static Plane(): Geom_Plane;

  // BRepBuilderAPI.Precision (method)
  static Precision(P: number): void;
  static Precision(): number;

  // BRepBuilderAPI.delete (method)
  delete(): void;

  // BRepBuilderAPI.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_BndBoxTreeSelector: declare class BRepBuilderAPI_BndBoxTreeSelector

  // BRepBuilderAPI_BndBoxTreeSelector.constructor (constructor)
  constructor();

  // BRepBuilderAPI_BndBoxTreeSelector.Reject (method)
  Reject(argNo0: Bnd_Box): boolean;

  // BRepBuilderAPI_BndBoxTreeSelector.Accept (method)
  Accept(argNo0: number): boolean;

  // BRepBuilderAPI_BndBoxTreeSelector.ClearResList (method)
  ClearResList(): void;

  // BRepBuilderAPI_BndBoxTreeSelector.SetCurrent (method)
  SetCurrent(theBox: Bnd_Box): void;

  // BRepBuilderAPI_BndBoxTreeSelector.ResInd (method)
  ResInd(): NCollection_List_int;

  // BRepBuilderAPI_BndBoxTreeSelector.delete (method)
  delete(): void;

  // BRepBuilderAPI_BndBoxTreeSelector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_Collect: declare class BRepBuilderAPI_Collect

  // BRepBuilderAPI_Collect.constructor (constructor)
  constructor();

  // BRepBuilderAPI_Collect.Add (method)
  Add(SI: TopoDS_Shape, MKS: BRepBuilderAPI_MakeShape): void;

  // BRepBuilderAPI_Collect.AddGenerated (method)
  AddGenerated(S: TopoDS_Shape, Gen: TopoDS_Shape): void;

  // BRepBuilderAPI_Collect.AddModif (method)
  AddModif(S: TopoDS_Shape, Mod: TopoDS_Shape): void;

  // BRepBuilderAPI_Collect.Filter (method)
  Filter(SF: TopoDS_Shape): void;

  // BRepBuilderAPI_Collect.Modification (method)
  Modification(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  // BRepBuilderAPI_Collect.Generated (method)
  Generated(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  // BRepBuilderAPI_Collect.delete (method)
  delete(): void;

  // BRepBuilderAPI_Collect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_Command: declare class BRepBuilderAPI_Command

  // BRepBuilderAPI_Command.IsDone (method)
  IsDone(): boolean;

  // BRepBuilderAPI_Command.Check (method)
  Check(): void;

  // BRepBuilderAPI_Command.delete (method)
  delete(): void;

  // BRepBuilderAPI_Command.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_Copy: declare class BRepBuilderAPI_Copy extends BRepBuilderAPI_ModifyShape

  // BRepBuilderAPI_Copy.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, copyGeom?: boolean, copyMesh?: boolean);

  // BRepBuilderAPI_Copy.Perform (method)
  Perform(S: TopoDS_Shape, copyGeom?: boolean, copyMesh?: boolean): void;

  // BRepBuilderAPI_Copy.delete (method)
  delete(): void;

  // BRepBuilderAPI_Copy.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_EdgeError: typeof BRepBuilderAPI_EdgeError[keyof typeof BRepBuilderAPI_EdgeError]

  readonly BRepBuilderAPI_EdgeDone: 'BRepBuilderAPI_EdgeDone'

  readonly BRepBuilderAPI_PointProjectionFailed: 'BRepBuilderAPI_PointProjectionFailed'

  readonly BRepBuilderAPI_ParameterOutOfRange: 'BRepBuilderAPI_ParameterOutOfRange'

  readonly BRepBuilderAPI_DifferentPointsOnClosedCurve: 'BRepBuilderAPI_DifferentPointsOnClosedCurve'

  readonly BRepBuilderAPI_PointWithInfiniteParameter: 'BRepBuilderAPI_PointWithInfiniteParameter'

  readonly BRepBuilderAPI_DifferentsPointAndParameter: 'BRepBuilderAPI_DifferentsPointAndParameter'

  readonly BRepBuilderAPI_LineThroughIdenticPoints: 'BRepBuilderAPI_LineThroughIdenticPoints'

BRepBuilderAPI_FaceError: typeof BRepBuilderAPI_FaceError[keyof typeof BRepBuilderAPI_FaceError]

  readonly BRepBuilderAPI_FaceDone: 'BRepBuilderAPI_FaceDone'

  readonly BRepBuilderAPI_NoFace: 'BRepBuilderAPI_NoFace'

  readonly BRepBuilderAPI_NotPlanar: 'BRepBuilderAPI_NotPlanar'

  readonly BRepBuilderAPI_CurveProjectionFailed: 'BRepBuilderAPI_CurveProjectionFailed'

  readonly BRepBuilderAPI_ParametersOutOfRange: 'BRepBuilderAPI_ParametersOutOfRange'

BRepBuilderAPI_FastSewing: declare class BRepBuilderAPI_FastSewing extends Standard_Transient

  // BRepBuilderAPI_FastSewing.constructor (constructor)
  constructor(theTolerance?: number);

  // BRepBuilderAPI_FastSewing.Add (method)
  Add(theShape: TopoDS_Shape): boolean;
  Add(theSurface: Geom_Surface): boolean;

  // BRepBuilderAPI_FastSewing.Perform (method)
  Perform(): void;

  // BRepBuilderAPI_FastSewing.SetTolerance (method)
  SetTolerance(theToler: number): void;

  // BRepBuilderAPI_FastSewing.GetTolerance (method)
  GetTolerance(): number;

  // BRepBuilderAPI_FastSewing.GetResult (method)
  GetResult(): TopoDS_Shape;

  // BRepBuilderAPI_FastSewing.get_type_name (method)
  static get_type_name(): string;

  // BRepBuilderAPI_FastSewing.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepBuilderAPI_FastSewing.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepBuilderAPI_FastSewing.delete (method)
  delete(): void;

  // BRepBuilderAPI_FastSewing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_FastSewing_FS_Statuses: typeof BRepBuilderAPI_FastSewing_FS_Statuses[keyof typeof BRepBuilderAPI_FastSewing_FS_Statuses]

  readonly FS_OK: 'FS_OK'

  readonly FS_Degenerated: 'FS_Degenerated'

  readonly FS_FindVertexError: 'FS_FindVertexError'

  readonly FS_FindEdgeError: 'FS_FindEdgeError'

  readonly FS_FaceWithNullSurface: 'FS_FaceWithNullSurface'

  readonly FS_NotNaturalBoundsFace: 'FS_NotNaturalBoundsFace'

  readonly FS_InfiniteSurface: 'FS_InfiniteSurface'

  readonly FS_EmptyInput: 'FS_EmptyInput'

  readonly FS_Exception: 'FS_Exception'

BRepBuilderAPI_FindPlane: declare class BRepBuilderAPI_FindPlane

  // BRepBuilderAPI_FindPlane.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, Tol?: number);

  // BRepBuilderAPI_FindPlane.Init (method)
  Init(S: TopoDS_Shape, Tol?: number): void;

  // BRepBuilderAPI_FindPlane.Found (method)
  Found(): boolean;

  // BRepBuilderAPI_FindPlane.Plane (method)
  Plane(): Geom_Plane;

  // BRepBuilderAPI_FindPlane.delete (method)
  delete(): void;

  // BRepBuilderAPI_FindPlane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_GTransform: declare class BRepBuilderAPI_GTransform extends BRepBuilderAPI_ModifyShape

  // BRepBuilderAPI_GTransform.constructor (constructor)
  constructor(T: gp_GTrsf);
  constructor(S: TopoDS_Shape, T: gp_GTrsf, Copy?: boolean);

  // BRepBuilderAPI_GTransform.Perform (method)
  Perform(S: TopoDS_Shape, Copy?: boolean): void;

  // BRepBuilderAPI_GTransform.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepBuilderAPI_GTransform.ModifiedShape (method)
  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  // BRepBuilderAPI_GTransform.delete (method)
  delete(): void;

  // BRepBuilderAPI_GTransform.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_MakeEdge: declare class BRepBuilderAPI_MakeEdge extends BRepBuilderAPI_MakeShape

  // BRepBuilderAPI_MakeEdge.constructor (constructor)
  constructor();
  constructor(L: gp_Lin);
  constructor(L: gp_Circ);
  constructor(L: gp_Elips);
  constructor(L: gp_Hypr);
  constructor(L: gp_Parab);
  constructor(L: Geom_Curve);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: Geom2d_Curve, S: Geom_Surface);
  constructor(L: gp_Lin, p1: number, p2: number);
  constructor(L: gp_Lin, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Lin, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Circ, p1: number, p2: number);
  constructor(L: gp_Circ, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Circ, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Elips, p1: number, p2: number);
  constructor(L: gp_Elips, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Elips, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Hypr, p1: number, p2: number);
  constructor(L: gp_Hypr, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Hypr, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Parab, p1: number, p2: number);
  constructor(L: gp_Parab, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Parab, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom_Curve, p1: number, p2: number);
  constructor(L: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number);
  constructor(L: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number);
  constructor(L: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number);
  constructor(L: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number);
  constructor(L: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number);

  // BRepBuilderAPI_MakeEdge.Init (method)
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;

  // BRepBuilderAPI_MakeEdge.IsDone (method)
  IsDone(): boolean;

  // BRepBuilderAPI_MakeEdge.Error (method)
  Error(): BRepBuilderAPI_EdgeError;

  // BRepBuilderAPI_MakeEdge.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepBuilderAPI_MakeEdge.Vertex1 (method)
  Vertex1(): TopoDS_Vertex;

  // BRepBuilderAPI_MakeEdge.Vertex2 (method)
  Vertex2(): TopoDS_Vertex;

  // BRepBuilderAPI_MakeEdge.delete (method)
  delete(): void;

  // BRepBuilderAPI_MakeEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_MakeEdge2d: declare class BRepBuilderAPI_MakeEdge2d extends BRepBuilderAPI_MakeShape

  // BRepBuilderAPI_MakeEdge2d.constructor (constructor)
  constructor(L: gp_Lin2d);
  constructor(L: gp_Circ2d);
  constructor(L: gp_Elips2d);
  constructor(L: gp_Hypr2d);
  constructor(L: gp_Parab2d);
  constructor(L: Geom2d_Curve);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Lin2d, p1: number, p2: number);
  constructor(L: gp_Lin2d, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Lin2d, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Circ2d, p1: number, p2: number);
  constructor(L: gp_Circ2d, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Circ2d, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Elips2d, p1: number, p2: number);
  constructor(L: gp_Elips2d, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Elips2d, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Hypr2d, p1: number, p2: number);
  constructor(L: gp_Hypr2d, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Hypr2d, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Parab2d, p1: number, p2: number);
  constructor(L: gp_Parab2d, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Parab2d, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom2d_Curve, p1: number, p2: number);
  constructor(L: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number);
  constructor(L: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number);

  // BRepBuilderAPI_MakeEdge2d.Init (method)
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;

  // BRepBuilderAPI_MakeEdge2d.IsDone (method)
  IsDone(): boolean;

  // BRepBuilderAPI_MakeEdge2d.Error (method)
  Error(): BRepBuilderAPI_EdgeError;

  // BRepBuilderAPI_MakeEdge2d.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepBuilderAPI_MakeEdge2d.Vertex1 (method)
  Vertex1(): TopoDS_Vertex;

  // BRepBuilderAPI_MakeEdge2d.Vertex2 (method)
  Vertex2(): TopoDS_Vertex;

  // BRepBuilderAPI_MakeEdge2d.delete (method)
  delete(): void;

  // BRepBuilderAPI_MakeEdge2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_MakeFace: declare class BRepBuilderAPI_MakeFace extends BRepBuilderAPI_MakeShape

  // BRepBuilderAPI_MakeFace.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face);
  constructor(P: gp_Pln);
  constructor(C: gp_Cylinder);
  constructor(C: gp_Cone);
  constructor(S: gp_Sphere);
  constructor(C: gp_Torus);
  constructor(S: Geom_Surface, TolDegen: number);
  constructor(W: TopoDS_Wire, OnlyPlane?: boolean);
  constructor(F: TopoDS_Face, W: TopoDS_Wire);
  constructor(P: gp_Pln, W: TopoDS_Wire, Inside?: boolean);
  constructor(C: gp_Cylinder, W: TopoDS_Wire, Inside?: boolean);
  constructor(C: gp_Cone, W: TopoDS_Wire, Inside?: boolean);
  constructor(S: gp_Sphere, W: TopoDS_Wire, Inside?: boolean);
  constructor(C: gp_Torus, W: TopoDS_Wire, Inside?: boolean);
  constructor(S: Geom_Surface, W: TopoDS_Wire, Inside?: boolean);
  constructor(P: gp_Pln, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(C: gp_Cylinder, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(C: gp_Cone, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(S: gp_Sphere, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(C: gp_Torus, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number);

  // BRepBuilderAPI_MakeFace.Init (method)
  Init(F: TopoDS_Face): void;
  Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;

  // BRepBuilderAPI_MakeFace.Add (method)
  Add(W: TopoDS_Wire): void;

  // BRepBuilderAPI_MakeFace.IsDone (method)
  IsDone(): boolean;

  // BRepBuilderAPI_MakeFace.Error (method)
  Error(): BRepBuilderAPI_FaceError;

  // BRepBuilderAPI_MakeFace.Face (method)
  Face(): TopoDS_Face;

  // BRepBuilderAPI_MakeFace.delete (method)
  delete(): void;

  // BRepBuilderAPI_MakeFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_MakePolygon: declare class BRepBuilderAPI_MakePolygon extends BRepBuilderAPI_MakeShape

  // BRepBuilderAPI_MakePolygon.constructor (constructor)
  constructor();
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, Close?: boolean);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex, V3: TopoDS_Vertex, Close?: boolean);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, P4: gp_Pnt, Close?: boolean);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex, V3: TopoDS_Vertex, V4: TopoDS_Vertex, Close?: boolean);

  // BRepBuilderAPI_MakePolygon.Add (method)
  Add(P: gp_Pnt): void;
  Add(V: TopoDS_Vertex): void;

  // BRepBuilderAPI_MakePolygon.Added (method)
  Added(): boolean;

  // BRepBuilderAPI_MakePolygon.Close (method)
  Close(): void;

  // BRepBuilderAPI_MakePolygon.FirstVertex (method)
  FirstVertex(): TopoDS_Vertex;

  // BRepBuilderAPI_MakePolygon.LastVertex (method)
  LastVertex(): TopoDS_Vertex;

  // BRepBuilderAPI_MakePolygon.IsDone (method)
  IsDone(): boolean;

  // BRepBuilderAPI_MakePolygon.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepBuilderAPI_MakePolygon.Wire (method)
  Wire(): TopoDS_Wire;

  // BRepBuilderAPI_MakePolygon.delete (method)
  delete(): void;

  // BRepBuilderAPI_MakePolygon.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_MakeShape: declare class BRepBuilderAPI_MakeShape extends BRepBuilderAPI_Command

  // BRepBuilderAPI_MakeShape.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepBuilderAPI_MakeShape.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepBuilderAPI_MakeShape.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepBuilderAPI_MakeShape.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepBuilderAPI_MakeShape.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepBuilderAPI_MakeShape.delete (method)
  delete(): void;

  // BRepBuilderAPI_MakeShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_MakeShapeOnMesh: declare class BRepBuilderAPI_MakeShapeOnMesh extends BRepBuilderAPI_MakeShape

  // BRepBuilderAPI_MakeShapeOnMesh.constructor (constructor)
  constructor(theMesh: Poly_Triangulation);

  // BRepBuilderAPI_MakeShapeOnMesh.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepBuilderAPI_MakeShapeOnMesh.delete (method)
  delete(): void;

  // BRepBuilderAPI_MakeShapeOnMesh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_MakeShell: declare class BRepBuilderAPI_MakeShell extends BRepBuilderAPI_MakeShape

  // BRepBuilderAPI_MakeShell.constructor (constructor)
  constructor();
  constructor(S: Geom_Surface, Segment?: boolean);
  constructor(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Segment?: boolean);

  // BRepBuilderAPI_MakeShell.Init (method)
  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Segment?: boolean): void;

  // BRepBuilderAPI_MakeShell.IsDone (method)
  IsDone(): boolean;

  // BRepBuilderAPI_MakeShell.Error (method)
  Error(): BRepBuilderAPI_ShellError;

  // BRepBuilderAPI_MakeShell.Shell (method)
  Shell(): TopoDS_Shell;

  // BRepBuilderAPI_MakeShell.delete (method)
  delete(): void;

  // BRepBuilderAPI_MakeShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_MakeSolid: declare class BRepBuilderAPI_MakeSolid extends BRepBuilderAPI_MakeShape

  // BRepBuilderAPI_MakeSolid.constructor (constructor)
  constructor();
  constructor(S: TopoDS_CompSolid);
  constructor(S: TopoDS_Shell);
  constructor(So: TopoDS_Solid);
  constructor(S1: TopoDS_Shell, S2: TopoDS_Shell);
  constructor(So: TopoDS_Solid, S: TopoDS_Shell);
  constructor(S1: TopoDS_Shell, S2: TopoDS_Shell, S3: TopoDS_Shell);

  // BRepBuilderAPI_MakeSolid.Add (method)
  Add(S: TopoDS_Shell): void;

  // BRepBuilderAPI_MakeSolid.IsDone (method)
  IsDone(): boolean;

  // BRepBuilderAPI_MakeSolid.Solid (method)
  Solid(): TopoDS_Solid;

  // BRepBuilderAPI_MakeSolid.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepBuilderAPI_MakeSolid.delete (method)
  delete(): void;

  // BRepBuilderAPI_MakeSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_MakeVertex: declare class BRepBuilderAPI_MakeVertex extends BRepBuilderAPI_MakeShape

  // BRepBuilderAPI_MakeVertex.constructor (constructor)
  constructor(P: gp_Pnt);

  // BRepBuilderAPI_MakeVertex.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // BRepBuilderAPI_MakeVertex.delete (method)
  delete(): void;

  // BRepBuilderAPI_MakeVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_MakeWire: declare class BRepBuilderAPI_MakeWire extends BRepBuilderAPI_MakeShape

  // BRepBuilderAPI_MakeWire.constructor (constructor)
  constructor();
  constructor(E: TopoDS_Edge);
  constructor(W: TopoDS_Wire);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge);
  constructor(W: TopoDS_Wire, E: TopoDS_Edge);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge, E3: TopoDS_Edge);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge, E3: TopoDS_Edge, E4: TopoDS_Edge);

  // BRepBuilderAPI_MakeWire.Add (method)
  Add(E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire): void;
  Add(L: NCollection_List_TopoDS_Shape): void;

  // BRepBuilderAPI_MakeWire.IsDone (method)
  IsDone(): boolean;

  // BRepBuilderAPI_MakeWire.Error (method)
  Error(): BRepBuilderAPI_WireError;

  // BRepBuilderAPI_MakeWire.Wire (method)
  Wire(): TopoDS_Wire;

  // BRepBuilderAPI_MakeWire.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepBuilderAPI_MakeWire.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // BRepBuilderAPI_MakeWire.delete (method)
  delete(): void;

  // BRepBuilderAPI_MakeWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_ModifyShape: declare class BRepBuilderAPI_ModifyShape extends BRepBuilderAPI_MakeShape

  // BRepBuilderAPI_ModifyShape.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepBuilderAPI_ModifyShape.ModifiedShape (method)
  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  // BRepBuilderAPI_ModifyShape.delete (method)
  delete(): void;

  // BRepBuilderAPI_ModifyShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_NurbsConvert: declare class BRepBuilderAPI_NurbsConvert extends BRepBuilderAPI_ModifyShape

  // BRepBuilderAPI_NurbsConvert.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, Copy?: boolean);

  // BRepBuilderAPI_NurbsConvert.Perform (method)
  Perform(S: TopoDS_Shape, Copy?: boolean): void;

  // BRepBuilderAPI_NurbsConvert.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepBuilderAPI_NurbsConvert.ModifiedShape (method)
  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  // BRepBuilderAPI_NurbsConvert.delete (method)
  delete(): void;

  // BRepBuilderAPI_NurbsConvert.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_PipeError: typeof BRepBuilderAPI_PipeError[keyof typeof BRepBuilderAPI_PipeError]

  readonly BRepBuilderAPI_PipeDone: 'BRepBuilderAPI_PipeDone'

  readonly BRepBuilderAPI_PipeNotDone: 'BRepBuilderAPI_PipeNotDone'

  readonly BRepBuilderAPI_PlaneNotIntersectGuide: 'BRepBuilderAPI_PlaneNotIntersectGuide'

  readonly BRepBuilderAPI_ImpossibleContact: 'BRepBuilderAPI_ImpossibleContact'

BRepBuilderAPI_Sewing: declare class BRepBuilderAPI_Sewing extends Standard_Transient

  // BRepBuilderAPI_Sewing.constructor (constructor)
  constructor(tolerance?: number, option1?: boolean, option2?: boolean, option3?: boolean, option4?: boolean);

  // BRepBuilderAPI_Sewing.Init (method)
  Init(tolerance?: number, option1?: boolean, option2?: boolean, option3?: boolean, option4?: boolean): void;

  // BRepBuilderAPI_Sewing.Load (method)
  Load(shape: TopoDS_Shape): void;

  // BRepBuilderAPI_Sewing.Add (method)
  Add(shape: TopoDS_Shape): void;

  // BRepBuilderAPI_Sewing.Perform (method)
  Perform(theProgress?: Message_ProgressRange): void;

  // BRepBuilderAPI_Sewing.SewedShape (method)
  SewedShape(): TopoDS_Shape;

  // BRepBuilderAPI_Sewing.SetContext (method)
  SetContext(theContext: BRepTools_ReShape): void;

  // BRepBuilderAPI_Sewing.GetContext (method)
  GetContext(): BRepTools_ReShape;

  // BRepBuilderAPI_Sewing.NbFreeEdges (method)
  NbFreeEdges(): number;

  // BRepBuilderAPI_Sewing.FreeEdge (method)
  FreeEdge(index: number): TopoDS_Edge;

  // BRepBuilderAPI_Sewing.NbMultipleEdges (method)
  NbMultipleEdges(): number;

  // BRepBuilderAPI_Sewing.MultipleEdge (method)
  MultipleEdge(index: number): TopoDS_Edge;

  // BRepBuilderAPI_Sewing.NbContigousEdges (method)
  NbContigousEdges(): number;

  // BRepBuilderAPI_Sewing.ContigousEdge (method)
  ContigousEdge(index: number): TopoDS_Edge;

  // BRepBuilderAPI_Sewing.ContigousEdgeCouple (method)
  ContigousEdgeCouple(index: number): NCollection_List_TopoDS_Shape;

  // BRepBuilderAPI_Sewing.IsSectionBound (method)
  IsSectionBound(section: TopoDS_Edge): boolean;

  // BRepBuilderAPI_Sewing.SectionToBoundary (method)
  SectionToBoundary(section: TopoDS_Edge): TopoDS_Edge;

  // BRepBuilderAPI_Sewing.NbDegeneratedShapes (method)
  NbDegeneratedShapes(): number;

  // BRepBuilderAPI_Sewing.DegeneratedShape (method)
  DegeneratedShape(index: number): TopoDS_Shape;

  // BRepBuilderAPI_Sewing.IsDegenerated (method)
  IsDegenerated(shape: TopoDS_Shape): boolean;

  // BRepBuilderAPI_Sewing.IsModified (method)
  IsModified(shape: TopoDS_Shape): boolean;

  // BRepBuilderAPI_Sewing.Modified (method)
  Modified(shape: TopoDS_Shape): TopoDS_Shape;

  // BRepBuilderAPI_Sewing.IsModifiedSubShape (method)
  IsModifiedSubShape(shape: TopoDS_Shape): boolean;

  // BRepBuilderAPI_Sewing.ModifiedSubShape (method)
  ModifiedSubShape(shape: TopoDS_Shape): TopoDS_Shape;

  // BRepBuilderAPI_Sewing.Dump (method)
  Dump(): void;

  // BRepBuilderAPI_Sewing.NbDeletedFaces (method)
  NbDeletedFaces(): number;

  // BRepBuilderAPI_Sewing.DeletedFace (method)
  DeletedFace(index: number): TopoDS_Face;

  // BRepBuilderAPI_Sewing.WhichFace (method)
  WhichFace(theEdg: TopoDS_Edge, index?: number): TopoDS_Face;

  // BRepBuilderAPI_Sewing.SameParameterMode (method)
  SameParameterMode(): boolean;

  // BRepBuilderAPI_Sewing.SetSameParameterMode (method)
  SetSameParameterMode(SameParameterMode: boolean): void;

  // BRepBuilderAPI_Sewing.Tolerance (method)
  Tolerance(): number;

  // BRepBuilderAPI_Sewing.SetTolerance (method)
  SetTolerance(theToler: number): void;

  // BRepBuilderAPI_Sewing.MinTolerance (method)
  MinTolerance(): number;

  // BRepBuilderAPI_Sewing.SetMinTolerance (method)
  SetMinTolerance(theMinToler: number): void;

  // BRepBuilderAPI_Sewing.MaxTolerance (method)
  MaxTolerance(): number;

  // BRepBuilderAPI_Sewing.SetMaxTolerance (method)
  SetMaxTolerance(theMaxToler: number): void;

  // BRepBuilderAPI_Sewing.FaceMode (method)
  FaceMode(): boolean;

  // BRepBuilderAPI_Sewing.SetFaceMode (method)
  SetFaceMode(theFaceMode: boolean): void;

  // BRepBuilderAPI_Sewing.FloatingEdgesMode (method)
  FloatingEdgesMode(): boolean;

  // BRepBuilderAPI_Sewing.SetFloatingEdgesMode (method)
  SetFloatingEdgesMode(theFloatingEdgesMode: boolean): void;

  // BRepBuilderAPI_Sewing.LocalTolerancesMode (method)
  LocalTolerancesMode(): boolean;

  // BRepBuilderAPI_Sewing.SetLocalTolerancesMode (method)
  SetLocalTolerancesMode(theLocalTolerancesMode: boolean): void;

  // BRepBuilderAPI_Sewing.SetNonManifoldMode (method)
  SetNonManifoldMode(theNonManifoldMode: boolean): void;

  // BRepBuilderAPI_Sewing.NonManifoldMode (method)
  NonManifoldMode(): boolean;

  // BRepBuilderAPI_Sewing.get_type_name (method)
  static get_type_name(): string;

  // BRepBuilderAPI_Sewing.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepBuilderAPI_Sewing.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepBuilderAPI_Sewing.delete (method)
  delete(): void;

  // BRepBuilderAPI_Sewing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_ShapeModification: typeof BRepBuilderAPI_ShapeModification[keyof typeof BRepBuilderAPI_ShapeModification]

  readonly BRepBuilderAPI_Preserved: 'BRepBuilderAPI_Preserved'

  readonly BRepBuilderAPI_Deleted: 'BRepBuilderAPI_Deleted'

  readonly BRepBuilderAPI_Trimmed: 'BRepBuilderAPI_Trimmed'

  readonly BRepBuilderAPI_Merged: 'BRepBuilderAPI_Merged'

  readonly BRepBuilderAPI_BoundaryModified: 'BRepBuilderAPI_BoundaryModified'

BRepBuilderAPI_ShellError: typeof BRepBuilderAPI_ShellError[keyof typeof BRepBuilderAPI_ShellError]

  readonly BRepBuilderAPI_ShellDone: 'BRepBuilderAPI_ShellDone'

  readonly BRepBuilderAPI_EmptyShell: 'BRepBuilderAPI_EmptyShell'

  readonly BRepBuilderAPI_DisconnectedShell: 'BRepBuilderAPI_DisconnectedShell'

  readonly BRepBuilderAPI_ShellParametersOutOfRange: 'BRepBuilderAPI_ShellParametersOutOfRange'

BRepBuilderAPI_Transform: declare class BRepBuilderAPI_Transform extends BRepBuilderAPI_ModifyShape

  // BRepBuilderAPI_Transform.constructor (constructor)
  constructor(T: gp_Trsf);
  constructor(theShape: TopoDS_Shape, theTrsf: gp_Trsf, theCopyGeom?: boolean, theCopyMesh?: boolean);

  // BRepBuilderAPI_Transform.Perform (method)
  Perform(theShape: TopoDS_Shape, theCopyGeom?: boolean, theCopyMesh?: boolean): void;

  // BRepBuilderAPI_Transform.ModifiedShape (method)
  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  // BRepBuilderAPI_Transform.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepBuilderAPI_Transform.delete (method)
  delete(): void;

  // BRepBuilderAPI_Transform.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_TransitionMode: typeof BRepBuilderAPI_TransitionMode[keyof typeof BRepBuilderAPI_TransitionMode]

  readonly BRepBuilderAPI_Transformed: 'BRepBuilderAPI_Transformed'

  readonly BRepBuilderAPI_RightCorner: 'BRepBuilderAPI_RightCorner'

  readonly BRepBuilderAPI_RoundCorner: 'BRepBuilderAPI_RoundCorner'

BRepBuilderAPI_VertexInspector: declare class BRepBuilderAPI_VertexInspector

  // BRepBuilderAPI_VertexInspector.constructor (constructor)
  constructor(theTol: number);

  // BRepBuilderAPI_VertexInspector.Coord (method)
  static Coord(i: number, thePnt: gp_XYZ): number;

  // BRepBuilderAPI_VertexInspector.Shift (method)
  static Shift(thePnt: gp_XYZ, theTol: number): gp_XYZ;

  // BRepBuilderAPI_VertexInspector.Add (method)
  Add(thePnt: gp_XYZ): void;

  // BRepBuilderAPI_VertexInspector.ClearResList (method)
  ClearResList(): void;

  // BRepBuilderAPI_VertexInspector.SetCurrent (method)
  SetCurrent(theCurPnt: gp_XYZ): void;

  // BRepBuilderAPI_VertexInspector.ResInd (method)
  ResInd(): NCollection_List_int;

  // BRepBuilderAPI_VertexInspector.Inspect (method)
  Inspect(theTarget: number): NCollection_CellFilter_Action;

  // BRepBuilderAPI_VertexInspector.delete (method)
  delete(): void;

  // BRepBuilderAPI_VertexInspector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBuilderAPI_WireError: typeof BRepBuilderAPI_WireError[keyof typeof BRepBuilderAPI_WireError]

  readonly BRepBuilderAPI_WireDone: 'BRepBuilderAPI_WireDone'

  readonly BRepBuilderAPI_EmptyWire: 'BRepBuilderAPI_EmptyWire'

  readonly BRepBuilderAPI_DisconnectedWire: 'BRepBuilderAPI_DisconnectedWire'

  readonly BRepBuilderAPI_NonManifoldWire: 'BRepBuilderAPI_NonManifoldWire'
