# libcascade — BRepTopAdaptor

4 top-level symbols. Signatures are verbatim typescript.

BRepTopAdaptor_HVertex: declare class BRepTopAdaptor_HVertex extends Adaptor3d_HVertex

  // BRepTopAdaptor_HVertex.constructor (constructor)
  constructor(Vtx: TopoDS_Vertex, Curve: BRepAdaptor_Curve2d);

  // BRepTopAdaptor_HVertex.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // BRepTopAdaptor_HVertex.ChangeVertex (method)
  ChangeVertex(): TopoDS_Vertex;

  // BRepTopAdaptor_HVertex.Value (method)
  Value(): gp_Pnt2d;

  // BRepTopAdaptor_HVertex.Parameter (method)
  Parameter(C: Adaptor2d_Curve2d): number;

  // BRepTopAdaptor_HVertex.Resolution (method)
  Resolution(C: Adaptor2d_Curve2d): number;

  // BRepTopAdaptor_HVertex.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // BRepTopAdaptor_HVertex.IsSame (method)
  IsSame(Other: Adaptor3d_HVertex): boolean;

  // BRepTopAdaptor_HVertex.get_type_name (method)
  static get_type_name(): string;

  // BRepTopAdaptor_HVertex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepTopAdaptor_HVertex.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepTopAdaptor_HVertex.delete (method)
  delete(): void;

  // BRepTopAdaptor_HVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTopAdaptor_Tool: declare class BRepTopAdaptor_Tool

  // BRepTopAdaptor_Tool.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face, Tol2d: number);
  constructor(Surface: Adaptor3d_Surface, Tol2d: number);

  // BRepTopAdaptor_Tool.Init (method)
  Init(F: TopoDS_Face, Tol2d: number): void;
  Init(Surface: Adaptor3d_Surface, Tol2d: number): void;

  // BRepTopAdaptor_Tool.GetTopolTool (method)
  GetTopolTool(): BRepTopAdaptor_TopolTool;

  // BRepTopAdaptor_Tool.SetTopolTool (method)
  SetTopolTool(TT: BRepTopAdaptor_TopolTool): void;

  // BRepTopAdaptor_Tool.GetSurface (method)
  GetSurface(): Adaptor3d_Surface;

  // BRepTopAdaptor_Tool.Destroy (method)
  Destroy(): void;

  // BRepTopAdaptor_Tool.delete (method)
  delete(): void;

  // BRepTopAdaptor_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTopAdaptor_TopolTool: declare class BRepTopAdaptor_TopolTool extends Adaptor3d_TopolTool

  // BRepTopAdaptor_TopolTool.constructor (constructor)
  constructor();
  constructor(Surface: Adaptor3d_Surface);

  // BRepTopAdaptor_TopolTool.Initialize (method)
  Initialize(): void;
  Initialize(S: Adaptor3d_Surface): void;
  Initialize(Curve: Adaptor2d_Curve2d): void;

  // BRepTopAdaptor_TopolTool.Init (method)
  Init(): void;

  // BRepTopAdaptor_TopolTool.More (method)
  More(): boolean;

  // BRepTopAdaptor_TopolTool.Value (method)
  Value(): Adaptor2d_Curve2d;

  // BRepTopAdaptor_TopolTool.Next (method)
  Next(): void;

  // BRepTopAdaptor_TopolTool.InitVertexIterator (method)
  InitVertexIterator(): void;

  // BRepTopAdaptor_TopolTool.MoreVertex (method)
  MoreVertex(): boolean;

  // BRepTopAdaptor_TopolTool.Vertex (method)
  Vertex(): Adaptor3d_HVertex;

  // BRepTopAdaptor_TopolTool.NextVertex (method)
  NextVertex(): void;

  // BRepTopAdaptor_TopolTool.Classify (method)
  Classify(P: gp_Pnt2d, Tol: number, ReacdreOnPeriodic?: boolean): TopAbs_State;

  // BRepTopAdaptor_TopolTool.IsThePointOn (method)
  IsThePointOn(P: gp_Pnt2d, Tol: number, ReacdreOnPeriodic?: boolean): boolean;

  // BRepTopAdaptor_TopolTool.Orientation (method)
  Orientation(C: Adaptor2d_Curve2d): TopAbs_Orientation;
  Orientation(V: Adaptor3d_HVertex): TopAbs_Orientation;

  // BRepTopAdaptor_TopolTool.Destroy (method)
  Destroy(): void;

  // BRepTopAdaptor_TopolTool.Has3d (method)
  Has3d(): boolean;

  // BRepTopAdaptor_TopolTool.Tol3d (method)
  Tol3d(C: Adaptor2d_Curve2d): number;
  Tol3d(V: Adaptor3d_HVertex): number;

  // BRepTopAdaptor_TopolTool.Pnt (method)
  Pnt(V: Adaptor3d_HVertex): gp_Pnt;

  // BRepTopAdaptor_TopolTool.ComputeSamplePoints (method)
  ComputeSamplePoints(): void;

  // BRepTopAdaptor_TopolTool.NbSamplesU (method)
  NbSamplesU(): number;

  // BRepTopAdaptor_TopolTool.NbSamplesV (method)
  NbSamplesV(): number;

  // BRepTopAdaptor_TopolTool.NbSamples (method)
  NbSamples(): number;

  // BRepTopAdaptor_TopolTool.SamplePoint (method)
  SamplePoint(Index: number, P2d: gp_Pnt2d, P3d: gp_Pnt): void;

  // BRepTopAdaptor_TopolTool.DomainIsInfinite (method)
  DomainIsInfinite(): boolean;

  // BRepTopAdaptor_TopolTool.get_type_name (method)
  static get_type_name(): string;

  // BRepTopAdaptor_TopolTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepTopAdaptor_TopolTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepTopAdaptor_TopolTool.delete (method)
  delete(): void;

  // BRepTopAdaptor_TopolTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTopAdaptor_MapOfShapeTool: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher
