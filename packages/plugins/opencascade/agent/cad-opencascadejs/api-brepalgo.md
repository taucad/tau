# libcascade — BRepAlgo

6 top-level symbols. Signatures are verbatim typescript.

BRepAlgo: declare class BRepAlgo

  constructor

  static ConcatenateWire(Wire: TopoDS_Wire, Option: GeomAbs_Shape, AngularTolerance?: number): TopoDS_Wire;

  static ConcatenateWireC0(Wire: TopoDS_Wire): TopoDS_Edge;

  static ConvertWire(theWire: TopoDS_Wire, theAngleTolerance: number, theFace: TopoDS_Face): TopoDS_Wire;

  static ConvertFace(theFace: TopoDS_Face, theAngleTolerance: number): TopoDS_Face;

  static IsValid(S: TopoDS_Shape): boolean;
  static IsValid(theArgs: NCollection_List_TopoDS_Shape, theResult: TopoDS_Shape, closedSolid: boolean, GeomCtrl: boolean): boolean;
  static IsValid(S: TopoDS_Shape): boolean;
  static IsValid(theArgs: NCollection_List_TopoDS_Shape, theResult: TopoDS_Shape, closedSolid: boolean, GeomCtrl: boolean): boolean;

  static IsTopologicallyValid(S: TopoDS_Shape): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepAlgo_AsDes: declare class BRepAlgo_AsDes extends Standard_Transient

  constructor

  Clear(): void;

  Add(S: TopoDS_Shape, SS: TopoDS_Shape): void;
  Add(S: TopoDS_Shape, SS: NCollection_List_TopoDS_Shape): void;
  Add(S: TopoDS_Shape, SS: TopoDS_Shape): void;
  Add(S: TopoDS_Shape, SS: NCollection_List_TopoDS_Shape): void;

  HasAscendant(S: TopoDS_Shape): boolean;

  HasDescendant(S: TopoDS_Shape): boolean;

  Ascendant(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Descendant(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  ChangeDescendant(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Replace(theOldS: TopoDS_Shape, theNewS: TopoDS_Shape): void;

  Remove(theS: TopoDS_Shape): void;

  HasCommonDescendant(S1: TopoDS_Shape, S2: TopoDS_Shape, LC: NCollection_List_TopoDS_Shape): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepAlgo_FaceRestrictor: declare class BRepAlgo_FaceRestrictor

  constructor

  Init(F: TopoDS_Face, Proj?: boolean, ControlOrientation?: boolean): void;

  Add(W: TopoDS_Wire): void;

  Clear(): void;

  Perform(): void;

  IsDone(): boolean;

  More(): boolean;

  Next(): void;

  Current(): TopoDS_Face;

  delete(): void;

  [Symbol.dispose](): void;

BRepAlgo_Image: declare class BRepAlgo_Image

  constructor

  SetRoot(S: TopoDS_Shape): void;

  Bind(OldS: TopoDS_Shape, NewS: TopoDS_Shape): void;
  Bind(OldS: TopoDS_Shape, NewS: NCollection_List_TopoDS_Shape): void;
  Bind(OldS: TopoDS_Shape, NewS: TopoDS_Shape): void;
  Bind(OldS: TopoDS_Shape, NewS: NCollection_List_TopoDS_Shape): void;

  Add(OldS: TopoDS_Shape, NewS: TopoDS_Shape): void;
  Add(OldS: TopoDS_Shape, NewS: NCollection_List_TopoDS_Shape): void;
  Add(OldS: TopoDS_Shape, NewS: TopoDS_Shape): void;
  Add(OldS: TopoDS_Shape, NewS: NCollection_List_TopoDS_Shape): void;

  Clear(): void;

  Remove(S: TopoDS_Shape): void;

  RemoveRoot(Root: TopoDS_Shape): void;

  ReplaceRoot(OldRoot: TopoDS_Shape, NewRoot: TopoDS_Shape): void;

  Roots(): NCollection_List_TopoDS_Shape;

  IsImage(S: TopoDS_Shape): boolean;

  ImageFrom(S: TopoDS_Shape): TopoDS_Shape;

  Root(S: TopoDS_Shape): TopoDS_Shape;

  HasImage(S: TopoDS_Shape): boolean;

  Image(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  LastImage(S: TopoDS_Shape, L: NCollection_List_TopoDS_Shape): void;

  Compact(): void;

  Filter(S: TopoDS_Shape, ShapeType: TopAbs_ShapeEnum): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepAlgo_Loop: declare class BRepAlgo_Loop

  constructor

  Init(F: TopoDS_Face): void;

  AddEdge(E: TopoDS_Edge, LV: NCollection_List_TopoDS_Shape): void;

  AddConstEdge(E: TopoDS_Edge): void;

  AddConstEdges(LE: NCollection_List_TopoDS_Shape): void;

  SetImageVV(theImageVV: BRepAlgo_Image): void;

  Perform(): void;

  UpdateVEmap(theVEmap: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  CutEdge(E: TopoDS_Edge, VonE: NCollection_List_TopoDS_Shape, NE: NCollection_List_TopoDS_Shape): void;

  NewWires(): NCollection_List_TopoDS_Shape;

  WiresToFaces(): void;

  NewFaces(): NCollection_List_TopoDS_Shape;

  NewEdges(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

  GetVerticesForSubstitute(VerVerMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  VerticesForSubstitute(VerVerMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  SetTolConf(theTolConf: number): void;

  GetTolConf(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepAlgo_NormalProjection: declare class BRepAlgo_NormalProjection

  constructor

  Init(S: TopoDS_Shape): void;

  Add(ToProj: TopoDS_Shape): void;

  SetParams(Tol3D: number, Tol2D: number, InternalContinuity: GeomAbs_Shape, MaxDegree: number, MaxSeg: number): void;

  SetDefaultParams(): void;

  SetMaxDistance(MaxDist: number): void;

  Compute3d(With3d?: boolean): void;

  SetLimit(FaceBoundaries?: boolean): void;

  Build(): void;

  IsDone(): boolean;

  Projection(): TopoDS_Shape;

  Ancestor(E: TopoDS_Edge): TopoDS_Shape;

  Couple(E: TopoDS_Edge): TopoDS_Shape;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  IsElementary(C: Adaptor3d_Curve): boolean;

  BuildWire(Liste: NCollection_List_TopoDS_Shape): boolean;

  delete(): void;

  [Symbol.dispose](): void;
