# libcascade — LocOpe

19 top-level symbols. Signatures are verbatim typescript.

LocOpe: declare class LocOpe

  constructor

  static Closed(W: TopoDS_Wire, OnF: TopoDS_Face): boolean;
  static Closed(E: TopoDS_Edge, OnF: TopoDS_Face): boolean;
  static Closed(W: TopoDS_Wire, OnF: TopoDS_Face): boolean;
  static Closed(E: TopoDS_Edge, OnF: TopoDS_Face): boolean;

  static TgtFaces(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): boolean;

  static SampleEdges(S: TopoDS_Shape, Pt: NCollection_Sequence_gp_Pnt): void;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_BuildShape: declare class LocOpe_BuildShape

  constructor

  Perform(L: NCollection_List_TopoDS_Shape): void;

  Shape(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_BuildWires: declare class LocOpe_BuildWires

  constructor

  Perform(Ledges: NCollection_List_TopoDS_Shape, PW: LocOpe_WiresOnShape): void;

  IsDone(): boolean;

  Result(): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_DPrism: declare class LocOpe_DPrism

  constructor

  IsDone(): boolean;

  Spine(): TopoDS_Shape;

  Profile(): TopoDS_Shape;

  FirstShape(): TopoDS_Shape;

  LastShape(): TopoDS_Shape;

  Shape(): TopoDS_Shape;

  Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Curves(SCurves: NCollection_Sequence_handle_Geom_Curve): void;

  BarycCurve(): Geom_Curve;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_FindEdges: declare class LocOpe_FindEdges

  constructor

  Set(FFrom: TopoDS_Shape, FTo: TopoDS_Shape): void;

  InitIterator(): void;

  More(): boolean;

  EdgeFrom(): TopoDS_Edge;

  EdgeTo(): TopoDS_Edge;

  Next(): void;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_FindEdgesInFace: declare class LocOpe_FindEdgesInFace

  constructor

  Set(S: TopoDS_Shape, F: TopoDS_Face): void;

  Init(): void;

  More(): boolean;

  Edge(): TopoDS_Edge;

  Next(): void;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_GeneratedShape: declare class LocOpe_GeneratedShape extends Standard_Transient

  GeneratingEdges(): NCollection_List_TopoDS_Shape;

  Generated(V: TopoDS_Vertex): TopoDS_Edge;
  Generated(E: TopoDS_Edge): TopoDS_Face;
  Generated(V: TopoDS_Vertex): TopoDS_Edge;
  Generated(E: TopoDS_Edge): TopoDS_Face;

  OrientedFaces(): NCollection_List_TopoDS_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_Generator: declare class LocOpe_Generator

  constructor

  Init(S: TopoDS_Shape): void;

  Perform(G: LocOpe_GeneratedShape): void;

  IsDone(): boolean;

  ResultingShape(): TopoDS_Shape;

  Shape(): TopoDS_Shape;

  DescendantFace(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_GluedShape: declare class LocOpe_GluedShape extends LocOpe_GeneratedShape

  constructor

  Init(S: TopoDS_Shape): void;

  GlueOnFace(F: TopoDS_Face): void;

  GeneratingEdges(): NCollection_List_TopoDS_Shape;

  Generated(V: TopoDS_Vertex): TopoDS_Edge;
  Generated(E: TopoDS_Edge): TopoDS_Face;
  Generated(V: TopoDS_Vertex): TopoDS_Edge;
  Generated(E: TopoDS_Edge): TopoDS_Face;

  OrientedFaces(): NCollection_List_TopoDS_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_Gluer: declare class LocOpe_Gluer

  constructor

  Init(Sbase: TopoDS_Shape, Snew: TopoDS_Shape): void;

  Bind(Fnew: TopoDS_Face, Fbase: TopoDS_Face): void;
  Bind(Enew: TopoDS_Edge, Ebase: TopoDS_Edge): void;
  Bind(Fnew: TopoDS_Face, Fbase: TopoDS_Face): void;
  Bind(Enew: TopoDS_Edge, Ebase: TopoDS_Edge): void;

  OpeType(): LocOpe_Operation;

  Perform(): void;

  IsDone(): boolean;

  ResultingShape(): TopoDS_Shape;

  DescendantFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  BasisShape(): TopoDS_Shape;

  GluedShape(): TopoDS_Shape;

  Edges(): NCollection_List_TopoDS_Shape;

  TgtEdges(): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_LinearForm: declare class LocOpe_LinearForm

  constructor

  Perform(Base: TopoDS_Shape, V: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt): void;
  Perform(Base: TopoDS_Shape, V: gp_Vec, Vectra: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt): void;
  Perform(Base: TopoDS_Shape, V: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt): void;
  Perform(Base: TopoDS_Shape, V: gp_Vec, Vectra: gp_Vec, Pnt1: gp_Pnt, Pnt2: gp_Pnt): void;

  FirstShape(): TopoDS_Shape;

  LastShape(): TopoDS_Shape;

  Shape(): TopoDS_Shape;

  Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_Operation: typeof LocOpe_Operation[keyof typeof LocOpe_Operation]

LocOpe_Pipe: declare class LocOpe_Pipe

  constructor

  Spine(): TopoDS_Shape;

  Profile(): TopoDS_Shape;

  FirstShape(): TopoDS_Shape;

  LastShape(): TopoDS_Shape;

  Shape(): TopoDS_Shape;

  Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Curves(Spt: NCollection_Sequence_gp_Pnt): NCollection_Sequence_handle_Geom_Curve;

  BarycCurve(): Geom_Curve;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_PntFace: declare class LocOpe_PntFace

  constructor

  Pnt(): gp_Pnt;

  Face(): TopoDS_Face;

  Orientation(): TopAbs_Orientation;

  ChangeOrientation(): TopAbs_Orientation;

  Parameter(): number;

  UParameter(): number;

  VParameter(): number;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_Prism: declare class LocOpe_Prism

  constructor

  Perform(Base: TopoDS_Shape, V: gp_Vec): void;
  Perform(Base: TopoDS_Shape, V: gp_Vec, Vtra: gp_Vec): void;
  Perform(Base: TopoDS_Shape, V: gp_Vec): void;
  Perform(Base: TopoDS_Shape, V: gp_Vec, Vtra: gp_Vec): void;

  FirstShape(): TopoDS_Shape;

  LastShape(): TopoDS_Shape;

  Shape(): TopoDS_Shape;

  Shapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Curves(SCurves: NCollection_Sequence_handle_Geom_Curve): void;

  BarycCurve(): Geom_Curve;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_SplitDrafts: declare class LocOpe_SplitDrafts

  constructor

  Init(S: TopoDS_Shape): void;

  Perform(F: TopoDS_Face, W: TopoDS_Wire, Extractg: gp_Dir, NPlg: gp_Pln, Angleg: number, Extractd: gp_Dir, NPld: gp_Pln, Angled: number, ModifyLeft: boolean, ModifyRight: boolean): void;
  Perform(F: TopoDS_Face, W: TopoDS_Wire, Extract: gp_Dir, NPl: gp_Pln, Angle: number): void;
  Perform(F: TopoDS_Face, W: TopoDS_Wire, Extractg: gp_Dir, NPlg: gp_Pln, Angleg: number, Extractd: gp_Dir, NPld: gp_Pln, Angled: number, ModifyLeft: boolean, ModifyRight: boolean): void;
  Perform(F: TopoDS_Face, W: TopoDS_Wire, Extract: gp_Dir, NPl: gp_Pln, Angle: number): void;

  IsDone(): boolean;

  OriginalShape(): TopoDS_Shape;

  Shape(): TopoDS_Shape;

  ShapesFromShape(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_SplitShape: declare class LocOpe_SplitShape

  constructor

  Init(S: TopoDS_Shape): void;

  CanSplit(E: TopoDS_Edge): boolean;

  Add(W: TopoDS_Wire, F: TopoDS_Face): boolean;
  Add(Lwires: NCollection_List_TopoDS_Shape, F: TopoDS_Face): boolean;
  Add(V: TopoDS_Vertex, P: number, E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire, F: TopoDS_Face): boolean;
  Add(Lwires: NCollection_List_TopoDS_Shape, F: TopoDS_Face): boolean;
  Add(V: TopoDS_Vertex, P: number, E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire, F: TopoDS_Face): boolean;
  Add(Lwires: NCollection_List_TopoDS_Shape, F: TopoDS_Face): boolean;
  Add(V: TopoDS_Vertex, P: number, E: TopoDS_Edge): void;

  Shape(): TopoDS_Shape;

  DescendantShapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  LeftOf(W: TopoDS_Wire, F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_Spliter: declare class LocOpe_Spliter

  constructor

  Init(S: TopoDS_Shape): void;

  Perform(PW: LocOpe_WiresOnShape): void;

  IsDone(): boolean;

  ResultingShape(): TopoDS_Shape;

  Shape(): TopoDS_Shape;

  DirectLeft(): NCollection_List_TopoDS_Shape;

  Left(): NCollection_List_TopoDS_Shape;

  DescendantShapes(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

LocOpe_WiresOnShape: declare class LocOpe_WiresOnShape extends Standard_Transient

  constructor

  Init(S: TopoDS_Shape): void;

  Add(theEdges: NCollection_Sequence_TopoDS_Shape): boolean;

  SetCheckInterior(ToCheckInterior: boolean): void;

  Bind(W: TopoDS_Wire, F: TopoDS_Face): void;
  Bind(Comp: TopoDS_Compound, F: TopoDS_Face): void;
  Bind(E: TopoDS_Edge, F: TopoDS_Face): void;
  Bind(EfromW: TopoDS_Edge, EonFace: TopoDS_Edge): void;
  Bind(W: TopoDS_Wire, F: TopoDS_Face): void;
  Bind(Comp: TopoDS_Compound, F: TopoDS_Face): void;
  Bind(E: TopoDS_Edge, F: TopoDS_Face): void;
  Bind(EfromW: TopoDS_Edge, EonFace: TopoDS_Edge): void;
  Bind(W: TopoDS_Wire, F: TopoDS_Face): void;
  Bind(Comp: TopoDS_Compound, F: TopoDS_Face): void;
  Bind(E: TopoDS_Edge, F: TopoDS_Face): void;
  Bind(EfromW: TopoDS_Edge, EonFace: TopoDS_Edge): void;
  Bind(W: TopoDS_Wire, F: TopoDS_Face): void;
  Bind(Comp: TopoDS_Compound, F: TopoDS_Face): void;
  Bind(E: TopoDS_Edge, F: TopoDS_Face): void;
  Bind(EfromW: TopoDS_Edge, EonFace: TopoDS_Edge): void;

  BindAll(): void;

  IsDone(): boolean;

  InitEdgeIterator(): void;

  MoreEdge(): boolean;

  Edge(): TopoDS_Edge;

  OnFace(): TopoDS_Face;

  OnEdge(E: TopoDS_Edge): boolean;
  OnEdge(V: TopoDS_Vertex, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
  OnEdge(V: TopoDS_Vertex, EdgeFrom: TopoDS_Edge, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
  OnEdge(E: TopoDS_Edge): boolean;
  OnEdge(V: TopoDS_Vertex, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
  OnEdge(V: TopoDS_Vertex, EdgeFrom: TopoDS_Edge, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
  OnEdge(E: TopoDS_Edge): boolean;
  OnEdge(V: TopoDS_Vertex, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };
  OnEdge(V: TopoDS_Vertex, EdgeFrom: TopoDS_Edge, E: TopoDS_Edge, P?: number): { returnValue: boolean; P: number };

  NextEdge(): void;

  OnVertex(Vwire: TopoDS_Vertex, Vshape: TopoDS_Vertex): boolean;

  IsFaceWithSection(aFace: TopoDS_Shape): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
