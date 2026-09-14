# libcascade — BRepBuilderAPI

31 top-level symbols. Signatures are verbatim typescript.

BRepBuilderAPI: declare class BRepBuilderAPI

  constructor

  static Plane(P: Geom_Plane): void;
  static Plane(): Geom_Plane;
  static Plane(P: Geom_Plane): void;
  static Plane(): Geom_Plane;

  static Precision(P: number): void;
  static Precision(): number;
  static Precision(P: number): void;
  static Precision(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_BndBoxTreeSelector: declare class BRepBuilderAPI_BndBoxTreeSelector

  constructor

  Reject(argNo0: Bnd_Box): boolean;

  Accept(argNo0: number): boolean;

  ClearResList(): void;

  SetCurrent(theBox: Bnd_Box): void;

  ResInd(): NCollection_List_int;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_Collect: declare class BRepBuilderAPI_Collect

  constructor

  Add(SI: TopoDS_Shape, MKS: BRepBuilderAPI_MakeShape): void;

  AddGenerated(S: TopoDS_Shape, Gen: TopoDS_Shape): void;

  AddModif(S: TopoDS_Shape, Mod: TopoDS_Shape): void;

  Filter(SF: TopoDS_Shape): void;

  Modification(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  Generated(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_Command: declare class BRepBuilderAPI_Command

  IsDone(): boolean;

  Check(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_Copy: declare class BRepBuilderAPI_Copy extends BRepBuilderAPI_ModifyShape

  constructor

  Perform(S: TopoDS_Shape, copyGeom?: boolean, copyMesh?: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_EdgeError: typeof BRepBuilderAPI_EdgeError[keyof typeof BRepBuilderAPI_EdgeError]

BRepBuilderAPI_FaceError: typeof BRepBuilderAPI_FaceError[keyof typeof BRepBuilderAPI_FaceError]

BRepBuilderAPI_FastSewing: declare class BRepBuilderAPI_FastSewing extends Standard_Transient

  constructor

  Add(theShape: TopoDS_Shape): boolean;
  Add(theSurface: Geom_Surface): boolean;
  Add(theShape: TopoDS_Shape): boolean;
  Add(theSurface: Geom_Surface): boolean;

  Perform(): void;

  SetTolerance(theToler: number): void;

  GetTolerance(): number;

  GetResult(): TopoDS_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_FastSewing_FS_Statuses: typeof BRepBuilderAPI_FastSewing_FS_Statuses[keyof typeof BRepBuilderAPI_FastSewing_FS_Statuses]

BRepBuilderAPI_FindPlane: declare class BRepBuilderAPI_FindPlane

  constructor

  Init(S: TopoDS_Shape, Tol?: number): void;

  Found(): boolean;

  Plane(): Geom_Plane;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_GTransform: declare class BRepBuilderAPI_GTransform extends BRepBuilderAPI_ModifyShape

  constructor

  Perform(S: TopoDS_Shape, Copy?: boolean): void;

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_MakeEdge: declare class BRepBuilderAPI_MakeEdge extends BRepBuilderAPI_MakeShape

  constructor

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

  IsDone(): boolean;

  Error(): BRepBuilderAPI_EdgeError;

  Edge(): TopoDS_Edge;

  Vertex1(): TopoDS_Vertex;

  Vertex2(): TopoDS_Vertex;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_MakeEdge2d: declare class BRepBuilderAPI_MakeEdge2d extends BRepBuilderAPI_MakeShape

  constructor

  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;

  IsDone(): boolean;

  Error(): BRepBuilderAPI_EdgeError;

  Edge(): TopoDS_Edge;

  Vertex1(): TopoDS_Vertex;

  Vertex2(): TopoDS_Vertex;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_MakeFace: declare class BRepBuilderAPI_MakeFace extends BRepBuilderAPI_MakeShape

  constructor

  Init(F: TopoDS_Face): void;
  Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;
  Init(F: TopoDS_Face): void;
  Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;
  Init(F: TopoDS_Face): void;
  Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;

  Add(W: TopoDS_Wire): void;

  IsDone(): boolean;

  Error(): BRepBuilderAPI_FaceError;

  Face(): TopoDS_Face;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_MakePolygon: declare class BRepBuilderAPI_MakePolygon extends BRepBuilderAPI_MakeShape

  constructor

  Add(P: gp_Pnt): void;
  Add(V: TopoDS_Vertex): void;
  Add(P: gp_Pnt): void;
  Add(V: TopoDS_Vertex): void;

  Added(): boolean;

  Close(): void;

  FirstVertex(): TopoDS_Vertex;

  LastVertex(): TopoDS_Vertex;

  IsDone(): boolean;

  Edge(): TopoDS_Edge;

  Wire(): TopoDS_Wire;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_MakeShape: declare class BRepBuilderAPI_MakeShape extends BRepBuilderAPI_Command

  Build(theRange?: Message_ProgressRange): void;

  Shape(): TopoDS_Shape;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  IsDeleted(S: TopoDS_Shape): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_MakeShapeOnMesh: declare class BRepBuilderAPI_MakeShapeOnMesh extends BRepBuilderAPI_MakeShape

  constructor

  Build(theRange?: Message_ProgressRange): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_MakeShell: declare class BRepBuilderAPI_MakeShell extends BRepBuilderAPI_MakeShape

  constructor

  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Segment?: boolean): void;

  IsDone(): boolean;

  Error(): BRepBuilderAPI_ShellError;

  Shell(): TopoDS_Shell;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_MakeSolid: declare class BRepBuilderAPI_MakeSolid extends BRepBuilderAPI_MakeShape

  constructor

  Add(S: TopoDS_Shell): void;

  IsDone(): boolean;

  Solid(): TopoDS_Solid;

  IsDeleted(S: TopoDS_Shape): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_MakeVertex: declare class BRepBuilderAPI_MakeVertex extends BRepBuilderAPI_MakeShape

  constructor

  Vertex(): TopoDS_Vertex;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_MakeWire: declare class BRepBuilderAPI_MakeWire extends BRepBuilderAPI_MakeShape

  constructor

  Add(E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire): void;
  Add(L: NCollection_List_TopoDS_Shape): void;
  Add(E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire): void;
  Add(L: NCollection_List_TopoDS_Shape): void;
  Add(E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire): void;
  Add(L: NCollection_List_TopoDS_Shape): void;

  IsDone(): boolean;

  Error(): BRepBuilderAPI_WireError;

  Wire(): TopoDS_Wire;

  Edge(): TopoDS_Edge;

  Vertex(): TopoDS_Vertex;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_ModifyShape: declare class BRepBuilderAPI_ModifyShape extends BRepBuilderAPI_MakeShape

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_NurbsConvert: declare class BRepBuilderAPI_NurbsConvert extends BRepBuilderAPI_ModifyShape

  constructor

  Perform(S: TopoDS_Shape, Copy?: boolean): void;

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_PipeError: typeof BRepBuilderAPI_PipeError[keyof typeof BRepBuilderAPI_PipeError]

BRepBuilderAPI_Sewing: declare class BRepBuilderAPI_Sewing extends Standard_Transient

  constructor

  Init(tolerance?: number, option1?: boolean, option2?: boolean, option3?: boolean, option4?: boolean): void;

  Load(shape: TopoDS_Shape): void;

  Add(shape: TopoDS_Shape): void;

  Perform(theProgress?: Message_ProgressRange): void;

  SewedShape(): TopoDS_Shape;

  SetContext(theContext: BRepTools_ReShape): void;

  GetContext(): BRepTools_ReShape;

  NbFreeEdges(): number;

  FreeEdge(index: number): TopoDS_Edge;

  NbMultipleEdges(): number;

  MultipleEdge(index: number): TopoDS_Edge;

  NbContigousEdges(): number;

  ContigousEdge(index: number): TopoDS_Edge;

  ContigousEdgeCouple(index: number): NCollection_List_TopoDS_Shape;

  IsSectionBound(section: TopoDS_Edge): boolean;

  SectionToBoundary(section: TopoDS_Edge): TopoDS_Edge;

  NbDegeneratedShapes(): number;

  DegeneratedShape(index: number): TopoDS_Shape;

  IsDegenerated(shape: TopoDS_Shape): boolean;

  IsModified(shape: TopoDS_Shape): boolean;

  Modified(shape: TopoDS_Shape): TopoDS_Shape;

  IsModifiedSubShape(shape: TopoDS_Shape): boolean;

  ModifiedSubShape(shape: TopoDS_Shape): TopoDS_Shape;

  Dump(): void;

  NbDeletedFaces(): number;

  DeletedFace(index: number): TopoDS_Face;

  WhichFace(theEdg: TopoDS_Edge, index?: number): TopoDS_Face;

  SameParameterMode(): boolean;

  SetSameParameterMode(SameParameterMode: boolean): void;

  Tolerance(): number;

  SetTolerance(theToler: number): void;

  MinTolerance(): number;

  SetMinTolerance(theMinToler: number): void;

  MaxTolerance(): number;

  SetMaxTolerance(theMaxToler: number): void;

  FaceMode(): boolean;

  SetFaceMode(theFaceMode: boolean): void;

  FloatingEdgesMode(): boolean;

  SetFloatingEdgesMode(theFloatingEdgesMode: boolean): void;

  LocalTolerancesMode(): boolean;

  SetLocalTolerancesMode(theLocalTolerancesMode: boolean): void;

  SetNonManifoldMode(theNonManifoldMode: boolean): void;

  NonManifoldMode(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_ShapeModification: typeof BRepBuilderAPI_ShapeModification[keyof typeof BRepBuilderAPI_ShapeModification]

BRepBuilderAPI_ShellError: typeof BRepBuilderAPI_ShellError[keyof typeof BRepBuilderAPI_ShellError]

BRepBuilderAPI_Transform: declare class BRepBuilderAPI_Transform extends BRepBuilderAPI_ModifyShape

  constructor

  Perform(theShape: TopoDS_Shape, theCopyGeom?: boolean, theCopyMesh?: boolean): void;

  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_TransitionMode: typeof BRepBuilderAPI_TransitionMode[keyof typeof BRepBuilderAPI_TransitionMode]

BRepBuilderAPI_VertexInspector: declare class BRepBuilderAPI_VertexInspector

  constructor

  static Coord(i: number, thePnt: gp_XYZ): number;

  static Shift(thePnt: gp_XYZ, theTol: number): gp_XYZ;

  Add(thePnt: gp_XYZ): void;

  ClearResList(): void;

  SetCurrent(theCurPnt: gp_XYZ): void;

  ResInd(): NCollection_List_int;

  Inspect(theTarget: number): NCollection_CellFilter_Action;

  delete(): void;

  [Symbol.dispose](): void;

BRepBuilderAPI_WireError: typeof BRepBuilderAPI_WireError[keyof typeof BRepBuilderAPI_WireError]
