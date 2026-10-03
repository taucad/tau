# libcascade — HLRTopoBRep

6 top-level symbols. Signatures are verbatim typescript.

HLRTopoBRep_DSFiller: declare class HLRTopoBRep_DSFiller

  // HLRTopoBRep_DSFiller.constructor (constructor)
  constructor();

  // HLRTopoBRep_DSFiller.Insert (method)
  static Insert(S: TopoDS_Shape, FO: Contap_Contour, DS: HLRTopoBRep_Data, MST: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher, nbIso: number): void;

  // HLRTopoBRep_DSFiller.delete (method)
  delete(): void;

  // HLRTopoBRep_DSFiller.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRTopoBRep_Data: declare class HLRTopoBRep_Data

  // HLRTopoBRep_Data.constructor (constructor)
  constructor();

  // HLRTopoBRep_Data.Clear (method)
  Clear(): void;

  // HLRTopoBRep_Data.Clean (method)
  Clean(): void;

  // HLRTopoBRep_Data.EdgeHasSplE (method)
  EdgeHasSplE(E: TopoDS_Edge): boolean;

  // HLRTopoBRep_Data.FaceHasIntL (method)
  FaceHasIntL(F: TopoDS_Face): boolean;

  // HLRTopoBRep_Data.FaceHasOutL (method)
  FaceHasOutL(F: TopoDS_Face): boolean;

  // HLRTopoBRep_Data.FaceHasIsoL (method)
  FaceHasIsoL(F: TopoDS_Face): boolean;

  // HLRTopoBRep_Data.IsSplEEdgeEdge (method)
  IsSplEEdgeEdge(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

  // HLRTopoBRep_Data.IsIntLFaceEdge (method)
  IsIntLFaceEdge(F: TopoDS_Face, E: TopoDS_Edge): boolean;

  // HLRTopoBRep_Data.IsOutLFaceEdge (method)
  IsOutLFaceEdge(F: TopoDS_Face, E: TopoDS_Edge): boolean;

  // HLRTopoBRep_Data.IsIsoLFaceEdge (method)
  IsIsoLFaceEdge(F: TopoDS_Face, E: TopoDS_Edge): boolean;

  // HLRTopoBRep_Data.NewSOldS (method)
  NewSOldS(New: TopoDS_Shape): TopoDS_Shape;

  // HLRTopoBRep_Data.EdgeSplE (method)
  EdgeSplE(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_Data.FaceIntL (method)
  FaceIntL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_Data.FaceOutL (method)
  FaceOutL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_Data.FaceIsoL (method)
  FaceIsoL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_Data.IsOutV (method)
  IsOutV(V: TopoDS_Vertex): boolean;

  // HLRTopoBRep_Data.IsIntV (method)
  IsIntV(V: TopoDS_Vertex): boolean;

  // HLRTopoBRep_Data.AddOldS (method)
  AddOldS(NewS: TopoDS_Shape, OldS: TopoDS_Shape): void;

  // HLRTopoBRep_Data.AddSplE (method)
  AddSplE(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_Data.AddIntL (method)
  AddIntL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_Data.AddOutL (method)
  AddOutL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_Data.AddIsoL (method)
  AddIsoL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_Data.AddOutV (method)
  AddOutV(V: TopoDS_Vertex): void;

  // HLRTopoBRep_Data.AddIntV (method)
  AddIntV(V: TopoDS_Vertex): void;

  // HLRTopoBRep_Data.InitEdge (method)
  InitEdge(): void;

  // HLRTopoBRep_Data.MoreEdge (method)
  MoreEdge(): boolean;

  // HLRTopoBRep_Data.NextEdge (method)
  NextEdge(): void;

  // HLRTopoBRep_Data.Edge (method)
  Edge(): TopoDS_Edge;

  // HLRTopoBRep_Data.InitVertex (method)
  InitVertex(E: TopoDS_Edge): void;

  // HLRTopoBRep_Data.MoreVertex (method)
  MoreVertex(): boolean;

  // HLRTopoBRep_Data.NextVertex (method)
  NextVertex(): void;

  // HLRTopoBRep_Data.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // HLRTopoBRep_Data.Parameter (method)
  Parameter(): number;

  // HLRTopoBRep_Data.InsertBefore (method)
  InsertBefore(V: TopoDS_Vertex, P: number): void;

  // HLRTopoBRep_Data.Append (method)
  Append(V: TopoDS_Vertex, P: number): void;

  // HLRTopoBRep_Data.delete (method)
  delete(): void;

  // HLRTopoBRep_Data.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRTopoBRep_FaceData: declare class HLRTopoBRep_FaceData

  // HLRTopoBRep_FaceData.constructor (constructor)
  constructor();

  // HLRTopoBRep_FaceData.FaceIntL (method)
  FaceIntL(): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_FaceData.FaceOutL (method)
  FaceOutL(): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_FaceData.FaceIsoL (method)
  FaceIsoL(): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_FaceData.AddIntL (method)
  AddIntL(): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_FaceData.AddOutL (method)
  AddOutL(): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_FaceData.AddIsoL (method)
  AddIsoL(): NCollection_List_TopoDS_Shape;

  // HLRTopoBRep_FaceData.delete (method)
  delete(): void;

  // HLRTopoBRep_FaceData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRTopoBRep_FaceIsoLiner: declare class HLRTopoBRep_FaceIsoLiner

  // HLRTopoBRep_FaceIsoLiner.constructor (constructor)
  constructor();

  // HLRTopoBRep_FaceIsoLiner.Perform (method)
  static Perform(FI: number, F: TopoDS_Face, DS: HLRTopoBRep_Data, nbIsos: number): void;

  // HLRTopoBRep_FaceIsoLiner.MakeVertex (method)
  static MakeVertex(E: TopoDS_Edge, P: gp_Pnt, Par: number, Tol: number, DS: HLRTopoBRep_Data): TopoDS_Vertex;

  // HLRTopoBRep_FaceIsoLiner.MakeIsoLine (method)
  static MakeIsoLine(F: TopoDS_Face, Iso: Geom2d_Line, V1: TopoDS_Vertex, V2: TopoDS_Vertex, U1: number, U2: number, Tol: number, DS: HLRTopoBRep_Data): void;

  // HLRTopoBRep_FaceIsoLiner.delete (method)
  delete(): void;

  // HLRTopoBRep_FaceIsoLiner.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRTopoBRep_OutLiner: declare class HLRTopoBRep_OutLiner extends Standard_Transient

  // HLRTopoBRep_OutLiner.constructor (constructor)
  constructor();
  constructor(OriSh: TopoDS_Shape);
  constructor(OriS: TopoDS_Shape, OutS: TopoDS_Shape);

  // HLRTopoBRep_OutLiner.OriginalShape (method)
  OriginalShape(OriS: TopoDS_Shape): void;
  OriginalShape(): TopoDS_Shape;

  // HLRTopoBRep_OutLiner.OutLinedShape (method)
  OutLinedShape(OutS: TopoDS_Shape): void;
  OutLinedShape(): TopoDS_Shape;

  // HLRTopoBRep_OutLiner.DataStructure (method)
  DataStructure(): HLRTopoBRep_Data;

  // HLRTopoBRep_OutLiner.Fill (method)
  Fill(P: HLRAlgo_Projector, MST: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher, nbIso: number): void;

  // HLRTopoBRep_OutLiner.get_type_name (method)
  static get_type_name(): string;

  // HLRTopoBRep_OutLiner.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRTopoBRep_OutLiner.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRTopoBRep_OutLiner.delete (method)
  delete(): void;

  // HLRTopoBRep_OutLiner.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRTopoBRep_VData: declare class HLRTopoBRep_VData

  // HLRTopoBRep_VData.constructor (constructor)
  constructor();
  constructor(P: number, V: TopoDS_Shape);

  // HLRTopoBRep_VData.Parameter (method)
  Parameter(): number;

  // HLRTopoBRep_VData.Vertex (method)
  Vertex(): TopoDS_Shape;

  // HLRTopoBRep_VData.delete (method)
  delete(): void;

  // HLRTopoBRep_VData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
