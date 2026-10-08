# libcascade — LocOpe

19 top-level symbols. Signatures are verbatim typescript.

LocOpe: declare class LocOpe

  // LocOpe.constructor (constructor)
  constructor();

  // LocOpe.Closed (method)
  static Closed(W: TopoDS_Wire, OnF: TopoDS_Face): boolean;
  static Closed(E: TopoDS_Edge, OnF: TopoDS_Face): boolean;

  // LocOpe.TgtFaces (method)
  static TgtFaces(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): boolean;

  // LocOpe.SampleEdges (method)
  static SampleEdges(S: TopoDS_Shape, Pt: NCollection_Sequence_gp_Pnt): void;

  // LocOpe.delete (method)
  delete(): void;

  // LocOpe.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_BuildShape: declare class LocOpe_BuildShape

  // LocOpe_BuildShape.constructor (constructor)
  constructor();
  constructor(L: NCollection_List_TopoDS_Shape);

  // LocOpe_BuildShape.Perform (method)
  Perform(L: NCollection_List_TopoDS_Shape): void;

  // LocOpe_BuildShape.Shape (method)
  Shape(): TopoDS_Shape;

  // LocOpe_BuildShape.delete (method)
  delete(): void;

  // LocOpe_BuildShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_BuildWires: declare class LocOpe_BuildWires

  // LocOpe_BuildWires.constructor (constructor)
  constructor();
  constructor(Ledges: NCollection_List_TopoDS_Shape, PW: LocOpe_WiresOnShape);

  // LocOpe_BuildWires.Perform (method)
  Perform(Ledges: NCollection_List_TopoDS_Shape, PW: LocOpe_WiresOnShape): void;

  // LocOpe_BuildWires.IsDone (method)
  IsDone(): boolean;

  // LocOpe_BuildWires.Result (method)
  Result(): NCollection_List_TopoDS_Shape;

  // LocOpe_BuildWires.delete (method)
  delete(): void;

  // LocOpe_BuildWires.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_DPrism: declare class LocOpe_DPrism

  // LocOpe_DPrism.constructor (constructor)
  constructor(Spine: TopoDS_Face, Height: number, Angle: number);
  constructor(Spine: TopoDS_Face, Height1: number, Height2: number, Angle: number);

  // LocOpe_DPrism.IsDone (method)
  IsDone(): boolean;

  // LocOpe_DPrism.Spine (method)
  Spine(): TopoDS_Shape;

  // LocOpe_DPrism.Profile (method)
  Profile(): TopoDS_Shape;

  // LocOpe_DPrism.FirstShape (method)
  FirstShape(): TopoDS_Shape;

  // LocOpe_DPrism.LastShape (method)
  LastShape(): TopoDS_Shape;

  // LocOpe_DPrism.Shape (method)
  Shape(): TopoDS_Shape;

  // LocOpe_DPrism.Shapes (method)
  Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // LocOpe_DPrism.Curves (method)
  Curves(SCurves: NCollection_Sequence_handle_Geom_Curve): void;

  // LocOpe_DPrism.BarycCurve (method)
  BarycCurve(): Geom_Curve;

  // LocOpe_DPrism.delete (method)
  delete(): void;

  // LocOpe_DPrism.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_FindEdges: declare class LocOpe_FindEdges

  // LocOpe_FindEdges.constructor (constructor)
  constructor();
  constructor(FFrom: TopoDS_Shape, FTo: TopoDS_Shape);

  // LocOpe_FindEdges.Set (method)
  Set(FFrom: TopoDS_Shape, FTo: TopoDS_Shape): void;

  // LocOpe_FindEdges.InitIterator (method)
  InitIterator(): void;

  // LocOpe_FindEdges.More (method)
  More(): boolean;

  // LocOpe_FindEdges.EdgeFrom (method)
  EdgeFrom(): TopoDS_Edge;

  // LocOpe_FindEdges.EdgeTo (method)
  EdgeTo(): TopoDS_Edge;

  // LocOpe_FindEdges.Next (method)
  Next(): void;

  // LocOpe_FindEdges.delete (method)
  delete(): void;

  // LocOpe_FindEdges.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_FindEdgesInFace: declare class LocOpe_FindEdgesInFace

  // LocOpe_FindEdgesInFace.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, F: TopoDS_Face);

  // LocOpe_FindEdgesInFace.Set (method)
  Set(S: TopoDS_Shape, F: TopoDS_Face): void;

  // LocOpe_FindEdgesInFace.Init (method)
  Init(): void;

  // LocOpe_FindEdgesInFace.More (method)
  More(): boolean;

  // LocOpe_FindEdgesInFace.Edge (method)
  Edge(): TopoDS_Edge;

  // LocOpe_FindEdgesInFace.Next (method)
  Next(): void;

  // LocOpe_FindEdgesInFace.delete (method)
  delete(): void;

  // LocOpe_FindEdgesInFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_GeneratedShape: declare class LocOpe_GeneratedShape extends Standard_Transient

  // LocOpe_GeneratedShape.GeneratingEdges (method)
  GeneratingEdges(): NCollection_List_TopoDS_Shape;

  // LocOpe_GeneratedShape.Generated (method)
  Generated(V: TopoDS_Vertex): TopoDS_Edge;
  Generated(E: TopoDS_Edge): TopoDS_Face;

  // LocOpe_GeneratedShape.OrientedFaces (method)
  OrientedFaces(): NCollection_List_TopoDS_Shape;

  // LocOpe_GeneratedShape.get_type_name (method)
  static get_type_name(): string;

  // LocOpe_GeneratedShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // LocOpe_GeneratedShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // LocOpe_GeneratedShape.delete (method)
  delete(): void;

  // LocOpe_GeneratedShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_Generator: declare class LocOpe_Generator

  // LocOpe_Generator.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // LocOpe_Generator.Init (method)
  Init(S: TopoDS_Shape): void;

  // LocOpe_Generator.Perform (method)
  Perform(G: LocOpe_GeneratedShape): void;

  // LocOpe_Generator.IsDone (method)
  IsDone(): boolean;

  // LocOpe_Generator.ResultingShape (method)
  ResultingShape(): TopoDS_Shape;

  // LocOpe_Generator.Shape (method)
  Shape(): TopoDS_Shape;

  // LocOpe_Generator.DescendantFace (method)
  DescendantFace(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // LocOpe_Generator.delete (method)
  delete(): void;

  // LocOpe_Generator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_GluedShape: declare class LocOpe_GluedShape extends LocOpe_GeneratedShape

  // LocOpe_GluedShape.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // LocOpe_GluedShape.Init (method)
  Init(S: TopoDS_Shape): void;

  // LocOpe_GluedShape.GlueOnFace (method)
  GlueOnFace(F: TopoDS_Face): void;

  // LocOpe_GluedShape.GeneratingEdges (method)
  GeneratingEdges(): NCollection_List_TopoDS_Shape;

  // LocOpe_GluedShape.Generated (method)
  Generated(V: TopoDS_Vertex): TopoDS_Edge;
  Generated(E: TopoDS_Edge): TopoDS_Face;

  // LocOpe_GluedShape.OrientedFaces (method)
  OrientedFaces(): NCollection_List_TopoDS_Shape;

  // LocOpe_GluedShape.get_type_name (method)
  static get_type_name(): string;

  // LocOpe_GluedShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // LocOpe_GluedShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // LocOpe_GluedShape.delete (method)
  delete(): void;

  // LocOpe_GluedShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_Gluer: declare class LocOpe_Gluer

  // LocOpe_Gluer.constructor (constructor)
  constructor();
  constructor(Sbase: TopoDS_Shape, Snew: TopoDS_Shape);

  // LocOpe_Gluer.Init (method)
  Init(Sbase: TopoDS_Shape, Snew: TopoDS_Shape): void;

  // LocOpe_Gluer.Bind (method)
  Bind(Fnew: TopoDS_Face, Fbase: TopoDS_Face): void;
  Bind(Enew: TopoDS_Edge, Ebase: TopoDS_Edge): void;

  // LocOpe_Gluer.OpeType (method)
  OpeType(): LocOpe_Operation;

  // LocOpe_Gluer.Perform (method)
  Perform(): void;

  // LocOpe_Gluer.IsDone (method)
  IsDone(): boolean;

  // LocOpe_Gluer.ResultingShape (method)
  ResultingShape(): TopoDS_Shape;

  // LocOpe_Gluer.DescendantFaces (method)
  DescendantFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // LocOpe_Gluer.BasisShape (method)
  BasisShape(): TopoDS_Shape;

  // LocOpe_Gluer.GluedShape (method)
  GluedShape(): TopoDS_Shape;

  // LocOpe_Gluer.Edges (method)
  Edges(): NCollection_List_TopoDS_Shape;

  // LocOpe_Gluer.TgtEdges (method)
  TgtEdges(): NCollection_List_TopoDS_Shape;

  // LocOpe_Gluer.delete (method)
  delete(): void;

  // LocOpe_Gluer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_LinearForm: declare class LocOpe_LinearForm

  // LocOpe_LinearForm.constructor (constructor)
  constructor();
  constructor(Base: TopoDS_Shape, V: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt);
  constructor(Base: TopoDS_Shape, V: gp_Vec, Vectra: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt);

  // LocOpe_LinearForm.Perform (method)
  Perform(Base: TopoDS_Shape, V: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt): void;
  Perform(Base: TopoDS_Shape, V: gp_Vec, Vectra: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt): void;

  // LocOpe_LinearForm.FirstShape (method)
  FirstShape(): TopoDS_Shape;

  // LocOpe_LinearForm.LastShape (method)
  LastShape(): TopoDS_Shape;

  // LocOpe_LinearForm.Shape (method)
  Shape(): TopoDS_Shape;

  // LocOpe_LinearForm.Shapes (method)
  Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // LocOpe_LinearForm.delete (method)
  delete(): void;

  // LocOpe_LinearForm.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_Operation: typeof LocOpe_Operation[keyof typeof LocOpe_Operation]

  readonly LocOpe_FUSE: 'LocOpe_FUSE'

  readonly LocOpe_CUT: 'LocOpe_CUT'

  readonly LocOpe_INVALID: 'LocOpe_INVALID'

LocOpe_Pipe: declare class LocOpe_Pipe

  // LocOpe_Pipe.constructor (constructor)
  constructor(Spine: TopoDS_Wire, Profile: TopoDS_Shape);

  // LocOpe_Pipe.Spine (method)
  Spine(): TopoDS_Shape;

  // LocOpe_Pipe.Profile (method)
  Profile(): TopoDS_Shape;

  // LocOpe_Pipe.FirstShape (method)
  FirstShape(): TopoDS_Shape;

  // LocOpe_Pipe.LastShape (method)
  LastShape(): TopoDS_Shape;

  // LocOpe_Pipe.Shape (method)
  Shape(): TopoDS_Shape;

  // LocOpe_Pipe.Shapes (method)
  Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // LocOpe_Pipe.Curves (method)
  Curves(Spt: NCollection_Sequence_gp_Pnt): NCollection_Sequence_handle_Geom_Curve;

  // LocOpe_Pipe.BarycCurve (method)
  BarycCurve(): Geom_Curve;

  // LocOpe_Pipe.delete (method)
  delete(): void;

  // LocOpe_Pipe.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_PntFace: declare class LocOpe_PntFace

  // LocOpe_PntFace.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, F: TopoDS_Face, Or: TopAbs_Orientation, Param: number, UPar: number, VPar: number);

  // LocOpe_PntFace.Pnt (method)
  Pnt(): gp_Pnt;

  // LocOpe_PntFace.Face (method)
  Face(): TopoDS_Face;

  // LocOpe_PntFace.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // LocOpe_PntFace.ChangeOrientation (method)
  ChangeOrientation(): TopAbs_Orientation;

  // LocOpe_PntFace.Parameter (method)
  Parameter(): number;

  // LocOpe_PntFace.UParameter (method)
  UParameter(): number;

  // LocOpe_PntFace.VParameter (method)
  VParameter(): number;

  // LocOpe_PntFace.delete (method)
  delete(): void;

  // LocOpe_PntFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_Prism: declare class LocOpe_Prism

  // LocOpe_Prism.constructor (constructor)
  constructor();
  constructor(Base: TopoDS_Shape, V: gp_Vec);
  constructor(Base: TopoDS_Shape, V: gp_Vec, Vectra: gp_Vec);

  // LocOpe_Prism.Perform (method)
  Perform(Base: TopoDS_Shape, V: gp_Vec): void;
  Perform(Base: TopoDS_Shape, V: gp_Vec, Vtra: gp_Vec): void;

  // LocOpe_Prism.FirstShape (method)
  FirstShape(): TopoDS_Shape;

  // LocOpe_Prism.LastShape (method)
  LastShape(): TopoDS_Shape;

  // LocOpe_Prism.Shape (method)
  Shape(): TopoDS_Shape;

  // LocOpe_Prism.Shapes (method)
  Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // LocOpe_Prism.Curves (method)
  Curves(SCurves: NCollection_Sequence_handle_Geom_Curve): void;

  // LocOpe_Prism.BarycCurve (method)
  BarycCurve(): Geom_Curve;

  // LocOpe_Prism.delete (method)
  delete(): void;

  // LocOpe_Prism.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_SplitDrafts: declare class LocOpe_SplitDrafts

  // LocOpe_SplitDrafts.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // LocOpe_SplitDrafts.Init (method)
  Init(S: TopoDS_Shape): void;

  // LocOpe_SplitDrafts.Perform (method)
  Perform(F: TopoDS_Face, W: TopoDS_Wire, Extractg: gp_Dir, NPlg: gp_Pln, Angleg: number, Extractd: gp_Dir, NPld: gp_Pln, Angled: number, ModifyLeft: boolean, ModifyRight: boolean): void;
  Perform(F: TopoDS_Face, W: TopoDS_Wire, Extract: gp_Dir, NPl: gp_Pln, Angle: number): void;

  // LocOpe_SplitDrafts.IsDone (method)
  IsDone(): boolean;

  // LocOpe_SplitDrafts.OriginalShape (method)
  OriginalShape(): TopoDS_Shape;

  // LocOpe_SplitDrafts.Shape (method)
  Shape(): TopoDS_Shape;

  // LocOpe_SplitDrafts.ShapesFromShape (method)
  ShapesFromShape(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // LocOpe_SplitDrafts.delete (method)
  delete(): void;

  // LocOpe_SplitDrafts.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_SplitShape: declare class LocOpe_SplitShape

  // LocOpe_SplitShape.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // LocOpe_SplitShape.Init (method)
  Init(S: TopoDS_Shape): void;

  // LocOpe_SplitShape.CanSplit (method)
  CanSplit(E: TopoDS_Edge): boolean;

  // LocOpe_SplitShape.Add (method)
  Add(W: TopoDS_Wire, F: TopoDS_Face): boolean;
  Add(Lwires: NCollection_List_TopoDS_Shape, F: TopoDS_Face): boolean;
  Add(V: TopoDS_Vertex, P: number, E: TopoDS_Edge): void;

  // LocOpe_SplitShape.Shape (method)
  Shape(): TopoDS_Shape;

  // LocOpe_SplitShape.DescendantShapes (method)
  DescendantShapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // LocOpe_SplitShape.LeftOf (method)
  LeftOf(W: TopoDS_Wire, F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // LocOpe_SplitShape.delete (method)
  delete(): void;

  // LocOpe_SplitShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_Spliter: declare class LocOpe_Spliter

  // LocOpe_Spliter.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // LocOpe_Spliter.Init (method)
  Init(S: TopoDS_Shape): void;

  // LocOpe_Spliter.Perform (method)
  Perform(PW: LocOpe_WiresOnShape): void;

  // LocOpe_Spliter.IsDone (method)
  IsDone(): boolean;

  // LocOpe_Spliter.ResultingShape (method)
  ResultingShape(): TopoDS_Shape;

  // LocOpe_Spliter.Shape (method)
  Shape(): TopoDS_Shape;

  // LocOpe_Spliter.DirectLeft (method)
  DirectLeft(): NCollection_List_TopoDS_Shape;

  // LocOpe_Spliter.Left (method)
  Left(): NCollection_List_TopoDS_Shape;

  // LocOpe_Spliter.DescendantShapes (method)
  DescendantShapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // LocOpe_Spliter.delete (method)
  delete(): void;

  // LocOpe_Spliter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocOpe_WiresOnShape: declare class LocOpe_WiresOnShape extends Standard_Transient

  // LocOpe_WiresOnShape.constructor (constructor)
  constructor(S: TopoDS_Shape);

  // LocOpe_WiresOnShape.Init (method)
  Init(S: TopoDS_Shape): void;

  // LocOpe_WiresOnShape.Add (method)
  Add(theEdges: NCollection_Sequence_TopoDS_Shape): boolean;

  // LocOpe_WiresOnShape.SetCheckInterior (method)
  SetCheckInterior(ToCheckInterior: boolean): void;

  // LocOpe_WiresOnShape.Bind (method)
  Bind(W: TopoDS_Wire, F: TopoDS_Face): void;
  Bind(Comp: TopoDS_Compound, F: TopoDS_Face): void;
  Bind(E: TopoDS_Edge, F: TopoDS_Face): void;
  Bind(EfromW: TopoDS_Edge, EonFace: TopoDS_Edge): void;

  // LocOpe_WiresOnShape.BindAll (method)
  BindAll(): void;

  // LocOpe_WiresOnShape.IsDone (method)
  IsDone(): boolean;

  // LocOpe_WiresOnShape.InitEdgeIterator (method)
  InitEdgeIterator(): void;

  // LocOpe_WiresOnShape.MoreEdge (method)
  MoreEdge(): boolean;

  // LocOpe_WiresOnShape.Edge (method)
  Edge(): TopoDS_Edge;

  // LocOpe_WiresOnShape.OnFace (method)
  OnFace(): TopoDS_Face;

  // LocOpe_WiresOnShape.OnEdge (method)
  OnEdge(E: TopoDS_Edge): boolean;
  OnEdge(V: TopoDS_Vertex, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
  OnEdge(V: TopoDS_Vertex, EdgeFrom: TopoDS_Edge, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };

  // LocOpe_WiresOnShape.NextEdge (method)
  NextEdge(): void;

  // LocOpe_WiresOnShape.OnVertex (method)
  OnVertex(Vwire: TopoDS_Vertex, Vshape: TopoDS_Vertex): boolean;

  // LocOpe_WiresOnShape.IsFaceWithSection (method)
  IsFaceWithSection(aFace: TopoDS_Shape): boolean;

  // LocOpe_WiresOnShape.get_type_name (method)
  static get_type_name(): string;

  // LocOpe_WiresOnShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // LocOpe_WiresOnShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // LocOpe_WiresOnShape.delete (method)
  delete(): void;

  // LocOpe_WiresOnShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
