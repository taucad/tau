# libcascade — BRepTopAdaptor

4 top-level symbols. Signatures are verbatim typescript.

BRepTopAdaptor_HVertex: declare class BRepTopAdaptor_HVertex extends Adaptor3d_HVertex

  constructor

  Vertex(): TopoDS_Vertex;

  ChangeVertex(): TopoDS_Vertex;

  Value(): gp_Pnt2d;

  Parameter(C: Adaptor2d_Curve2d): number;

  Resolution(C: Adaptor2d_Curve2d): number;

  Orientation(): TopAbs_Orientation;

  IsSame(Other: Adaptor3d_HVertex): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepTopAdaptor_Tool: declare class BRepTopAdaptor_Tool

  constructor

  Init(F: TopoDS_Face, Tol2d: number): void;
  Init(Surface: Adaptor3d_Surface, Tol2d: number): void;
  Init(F: TopoDS_Face, Tol2d: number): void;
  Init(Surface: Adaptor3d_Surface, Tol2d: number): void;

  GetTopolTool(): BRepTopAdaptor_TopolTool;

  SetTopolTool(TT: BRepTopAdaptor_TopolTool): void;

  GetSurface(): Adaptor3d_Surface;

  Destroy(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepTopAdaptor_TopolTool: declare class BRepTopAdaptor_TopolTool extends Adaptor3d_TopolTool

  constructor

  Initialize(): void;
  Initialize(S: Adaptor3d_Surface): void;
  Initialize(Curve: Adaptor2d_Curve2d): void;
  Initialize(): void;
  Initialize(S: Adaptor3d_Surface): void;
  Initialize(Curve: Adaptor2d_Curve2d): void;
  Initialize(): void;
  Initialize(S: Adaptor3d_Surface): void;
  Initialize(Curve: Adaptor2d_Curve2d): void;

  Init(): void;

  More(): boolean;

  Value(): Adaptor2d_Curve2d;

  Next(): void;

  InitVertexIterator(): void;

  MoreVertex(): boolean;

  Vertex(): Adaptor3d_HVertex;

  NextVertex(): void;

  Classify(P: gp_Pnt2d, Tol: number, ReacdreOnPeriodic?: boolean): TopAbs_State;

  IsThePointOn(P: gp_Pnt2d, Tol: number, ReacdreOnPeriodic?: boolean): boolean;

  Orientation(C: Adaptor2d_Curve2d): TopAbs_Orientation;
  Orientation(V: Adaptor3d_HVertex): TopAbs_Orientation;
  Orientation(C: Adaptor2d_Curve2d): TopAbs_Orientation;
  Orientation(V: Adaptor3d_HVertex): TopAbs_Orientation;

  Destroy(): void;

  Has3d(): boolean;

  Tol3d(C: Adaptor2d_Curve2d): number;
  Tol3d(V: Adaptor3d_HVertex): number;
  Tol3d(C: Adaptor2d_Curve2d): number;
  Tol3d(V: Adaptor3d_HVertex): number;

  Pnt(V: Adaptor3d_HVertex): gp_Pnt;

  ComputeSamplePoints(): void;

  NbSamplesU(): number;

  NbSamplesV(): number;

  NbSamples(): number;

  SamplePoint(Index: number, P2d: gp_Pnt2d, P3d: gp_Pnt): void;

  DomainIsInfinite(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepTopAdaptor_MapOfShapeTool: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher
