# libcascade — BRepAlgo

6 top-level symbols. Signatures are verbatim typescript.

BRepAlgo: declare class BRepAlgo

  // BRepAlgo.constructor (constructor)
  constructor();

  // BRepAlgo.ConcatenateWire (method)
  static ConcatenateWire(Wire: TopoDS_Wire, Option: GeomAbs_Shape, AngularTolerance?: number): TopoDS_Wire;

  // BRepAlgo.ConcatenateWireC0 (method)
  static ConcatenateWireC0(Wire: TopoDS_Wire): TopoDS_Edge;

  // BRepAlgo.ConvertWire (method)
  static ConvertWire(theWire: TopoDS_Wire, theAngleTolerance: number, theFace: TopoDS_Face): TopoDS_Wire;

  // BRepAlgo.ConvertFace (method)
  static ConvertFace(theFace: TopoDS_Face, theAngleTolerance: number): TopoDS_Face;

  // BRepAlgo.IsValid (method)
  static IsValid(S: TopoDS_Shape): boolean;
  static IsValid(theArgs: NCollection_List_TopoDS_Shape, theResult: TopoDS_Shape, closedSolid: boolean, GeomCtrl: boolean): boolean;

  // BRepAlgo.IsTopologicallyValid (method)
  static IsTopologicallyValid(S: TopoDS_Shape): boolean;

  // BRepAlgo.delete (method)
  delete(): void;

  // BRepAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgo_AsDes: declare class BRepAlgo_AsDes extends Standard_Transient

  // BRepAlgo_AsDes.constructor (constructor)
  constructor();

  // BRepAlgo_AsDes.Clear (method)
  Clear(): void;

  // BRepAlgo_AsDes.Add (method)
  Add(S: TopoDS_Shape, SS: TopoDS_Shape): void;
  Add(S: TopoDS_Shape, SS: NCollection_List_TopoDS_Shape): void;

  // BRepAlgo_AsDes.HasAscendant (method)
  HasAscendant(S: TopoDS_Shape): boolean;

  // BRepAlgo_AsDes.HasDescendant (method)
  HasDescendant(S: TopoDS_Shape): boolean;

  // BRepAlgo_AsDes.Ascendant (method)
  Ascendant(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepAlgo_AsDes.Descendant (method)
  Descendant(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepAlgo_AsDes.ChangeDescendant (method)
  ChangeDescendant(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepAlgo_AsDes.Replace (method)
  Replace(theOldS: TopoDS_Shape, theNewS: TopoDS_Shape): void;

  // BRepAlgo_AsDes.Remove (method)
  Remove(theS: TopoDS_Shape): void;

  // BRepAlgo_AsDes.HasCommonDescendant (method)
  HasCommonDescendant(S1: TopoDS_Shape, S2: TopoDS_Shape, LC: NCollection_List_TopoDS_Shape): boolean;

  // BRepAlgo_AsDes.get_type_name (method)
  static get_type_name(): string;

  // BRepAlgo_AsDes.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepAlgo_AsDes.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepAlgo_AsDes.delete (method)
  delete(): void;

  // BRepAlgo_AsDes.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgo_FaceRestrictor: declare class BRepAlgo_FaceRestrictor

  // BRepAlgo_FaceRestrictor.constructor (constructor)
  constructor();

  // BRepAlgo_FaceRestrictor.Init (method)
  Init(F: TopoDS_Face, Proj?: boolean, ControlOrientation?: boolean): void;

  // BRepAlgo_FaceRestrictor.Add (method)
  Add(W: TopoDS_Wire): void;

  // BRepAlgo_FaceRestrictor.Clear (method)
  Clear(): void;

  // BRepAlgo_FaceRestrictor.Perform (method)
  Perform(): void;

  // BRepAlgo_FaceRestrictor.IsDone (method)
  IsDone(): boolean;

  // BRepAlgo_FaceRestrictor.More (method)
  More(): boolean;

  // BRepAlgo_FaceRestrictor.Next (method)
  Next(): void;

  // BRepAlgo_FaceRestrictor.Current (method)
  Current(): TopoDS_Face;

  // BRepAlgo_FaceRestrictor.delete (method)
  delete(): void;

  // BRepAlgo_FaceRestrictor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgo_Image: declare class BRepAlgo_Image

  // BRepAlgo_Image.constructor (constructor)
  constructor();

  // BRepAlgo_Image.SetRoot (method)
  SetRoot(S: TopoDS_Shape): void;

  // BRepAlgo_Image.Bind (method)
  Bind(OldS: TopoDS_Shape, NewS: TopoDS_Shape): void;
  Bind(OldS: TopoDS_Shape, NewS: NCollection_List_TopoDS_Shape): void;

  // BRepAlgo_Image.Add (method)
  Add(OldS: TopoDS_Shape, NewS: TopoDS_Shape): void;
  Add(OldS: TopoDS_Shape, NewS: NCollection_List_TopoDS_Shape): void;

  // BRepAlgo_Image.Clear (method)
  Clear(): void;

  // BRepAlgo_Image.Remove (method)
  Remove(S: TopoDS_Shape): void;

  // BRepAlgo_Image.RemoveRoot (method)
  RemoveRoot(Root: TopoDS_Shape): void;

  // BRepAlgo_Image.ReplaceRoot (method)
  ReplaceRoot(OldRoot: TopoDS_Shape, NewRoot: TopoDS_Shape): void;

  // BRepAlgo_Image.Roots (method)
  Roots(): NCollection_List_TopoDS_Shape;

  // BRepAlgo_Image.IsImage (method)
  IsImage(S: TopoDS_Shape): boolean;

  // BRepAlgo_Image.ImageFrom (method)
  ImageFrom(S: TopoDS_Shape): TopoDS_Shape;

  // BRepAlgo_Image.Root (method)
  Root(S: TopoDS_Shape): TopoDS_Shape;

  // BRepAlgo_Image.HasImage (method)
  HasImage(S: TopoDS_Shape): boolean;

  // BRepAlgo_Image.Image (method)
  Image(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepAlgo_Image.LastImage (method)
  LastImage(S: TopoDS_Shape, L: NCollection_List_TopoDS_Shape): void;

  // BRepAlgo_Image.Compact (method)
  Compact(): void;

  // BRepAlgo_Image.Filter (method)
  Filter(S: TopoDS_Shape, ShapeType: TopAbs_ShapeEnum): void;

  // BRepAlgo_Image.delete (method)
  delete(): void;

  // BRepAlgo_Image.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgo_Loop: declare class BRepAlgo_Loop

  // BRepAlgo_Loop.constructor (constructor)
  constructor();

  // BRepAlgo_Loop.Init (method)
  Init(F: TopoDS_Face): void;

  // BRepAlgo_Loop.AddEdge (method)
  AddEdge(E: TopoDS_Edge, LV: NCollection_List_TopoDS_Shape): void;

  // BRepAlgo_Loop.AddConstEdge (method)
  AddConstEdge(E: TopoDS_Edge): void;

  // BRepAlgo_Loop.AddConstEdges (method)
  AddConstEdges(LE: NCollection_List_TopoDS_Shape): void;

  // BRepAlgo_Loop.SetImageVV (method)
  SetImageVV(theImageVV: BRepAlgo_Image): void;

  // BRepAlgo_Loop.Perform (method)
  Perform(): void;

  // BRepAlgo_Loop.UpdateVEmap (method)
  UpdateVEmap(theVEmap: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // BRepAlgo_Loop.CutEdge (method)
  CutEdge(E: TopoDS_Edge, VonE: NCollection_List_TopoDS_Shape, NE: NCollection_List_TopoDS_Shape): void;

  // BRepAlgo_Loop.NewWires (method)
  NewWires(): NCollection_List_TopoDS_Shape;

  // BRepAlgo_Loop.WiresToFaces (method)
  WiresToFaces(): void;

  // BRepAlgo_Loop.NewFaces (method)
  NewFaces(): NCollection_List_TopoDS_Shape;

  // BRepAlgo_Loop.NewEdges (method)
  NewEdges(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

  // BRepAlgo_Loop.GetVerticesForSubstitute (method)
  GetVerticesForSubstitute(VerVerMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // BRepAlgo_Loop.VerticesForSubstitute (method)
  VerticesForSubstitute(VerVerMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // BRepAlgo_Loop.SetTolConf (method)
  SetTolConf(theTolConf: number): void;

  // BRepAlgo_Loop.GetTolConf (method)
  GetTolConf(): number;

  // BRepAlgo_Loop.delete (method)
  delete(): void;

  // BRepAlgo_Loop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgo_NormalProjection: declare class BRepAlgo_NormalProjection

  // BRepAlgo_NormalProjection.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // BRepAlgo_NormalProjection.Init (method)
  Init(S: TopoDS_Shape): void;

  // BRepAlgo_NormalProjection.Add (method)
  Add(ToProj: TopoDS_Shape): void;

  // BRepAlgo_NormalProjection.SetParams (method)
  SetParams(Tol3D: number, Tol2D: number, InternalContinuity: GeomAbs_Shape, MaxDegree: number, MaxSeg: number): void;

  // BRepAlgo_NormalProjection.SetDefaultParams (method)
  SetDefaultParams(): void;

  // BRepAlgo_NormalProjection.SetMaxDistance (method)
  SetMaxDistance(MaxDist: number): void;

  // BRepAlgo_NormalProjection.Compute3d (method)
  Compute3d(With3d?: boolean): void;

  // BRepAlgo_NormalProjection.SetLimit (method)
  SetLimit(FaceBoundaries?: boolean): void;

  // BRepAlgo_NormalProjection.Build (method)
  Build(): void;

  // BRepAlgo_NormalProjection.IsDone (method)
  IsDone(): boolean;

  // BRepAlgo_NormalProjection.Projection (method)
  Projection(): TopoDS_Shape;

  // BRepAlgo_NormalProjection.Ancestor (method)
  Ancestor(E: TopoDS_Edge): TopoDS_Shape;

  // BRepAlgo_NormalProjection.Couple (method)
  Couple(E: TopoDS_Edge): TopoDS_Shape;

  // BRepAlgo_NormalProjection.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepAlgo_NormalProjection.IsElementary (method)
  IsElementary(C: Adaptor3d_Curve): boolean;

  // BRepAlgo_NormalProjection.BuildWire (method)
  BuildWire(Liste: NCollection_List_TopoDS_Shape): boolean;

  // BRepAlgo_NormalProjection.delete (method)
  delete(): void;

  // BRepAlgo_NormalProjection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
