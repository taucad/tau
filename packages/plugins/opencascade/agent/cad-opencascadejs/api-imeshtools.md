# libcascade — IMeshTools

11 top-level symbols. Signatures are verbatim typescript.

IMeshTools_Context: declare class IMeshTools_Context extends IMeshData_Shape

  // IMeshTools_Context.constructor (constructor)
  constructor();

  // IMeshTools_Context.BuildModel (method)
  BuildModel(): boolean;

  // IMeshTools_Context.DiscretizeEdges (method)
  DiscretizeEdges(): boolean;

  // IMeshTools_Context.HealModel (method)
  HealModel(): boolean;

  // IMeshTools_Context.PreProcessModel (method)
  PreProcessModel(): boolean;

  // IMeshTools_Context.DiscretizeFaces (method)
  DiscretizeFaces(theRange: Message_ProgressRange): boolean;

  // IMeshTools_Context.PostProcessModel (method)
  PostProcessModel(): boolean;

  // IMeshTools_Context.Clean (method)
  Clean(): void;

  // IMeshTools_Context.GetModelBuilder (method)
  GetModelBuilder(): IMeshTools_ModelBuilder;

  // IMeshTools_Context.SetModelBuilder (method)
  SetModelBuilder(theBuilder: IMeshTools_ModelBuilder): void;

  // IMeshTools_Context.GetEdgeDiscret (method)
  GetEdgeDiscret(): IMeshTools_ModelAlgo;

  // IMeshTools_Context.SetEdgeDiscret (method)
  SetEdgeDiscret(theEdgeDiscret: IMeshTools_ModelAlgo): void;

  // IMeshTools_Context.GetModelHealer (method)
  GetModelHealer(): IMeshTools_ModelAlgo;

  // IMeshTools_Context.SetModelHealer (method)
  SetModelHealer(theModelHealer: IMeshTools_ModelAlgo): void;

  // IMeshTools_Context.GetPreProcessor (method)
  GetPreProcessor(): IMeshTools_ModelAlgo;

  // IMeshTools_Context.SetPreProcessor (method)
  SetPreProcessor(thePreProcessor: IMeshTools_ModelAlgo): void;

  // IMeshTools_Context.GetFaceDiscret (method)
  GetFaceDiscret(): IMeshTools_ModelAlgo;

  // IMeshTools_Context.SetFaceDiscret (method)
  SetFaceDiscret(theFaceDiscret: IMeshTools_ModelAlgo): void;

  // IMeshTools_Context.GetPostProcessor (method)
  GetPostProcessor(): IMeshTools_ModelAlgo;

  // IMeshTools_Context.SetPostProcessor (method)
  SetPostProcessor(thePostProcessor: IMeshTools_ModelAlgo): void;

  // IMeshTools_Context.GetParameters (method)
  GetParameters(): IMeshTools_Parameters;

  // IMeshTools_Context.ChangeParameters (method)
  ChangeParameters(): IMeshTools_Parameters;

  // IMeshTools_Context.GetModel (method)
  GetModel(): IMeshData_Model;

  // IMeshTools_Context.get_type_name (method)
  static get_type_name(): string;

  // IMeshTools_Context.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshTools_Context.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshTools_Context.delete (method)
  delete(): void;

  // IMeshTools_Context.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshTools_CurveTessellator: declare class IMeshTools_CurveTessellator extends Standard_Transient

  // IMeshTools_CurveTessellator.PointsNb (method)
  PointsNb(): number;

  // IMeshTools_CurveTessellator.Value (method)
  Value(theIndex: number, thePoint: gp_Pnt, theParameter: number): { returnValue: boolean; theParameter: number };

  // IMeshTools_CurveTessellator.get_type_name (method)
  static get_type_name(): string;

  // IMeshTools_CurveTessellator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshTools_CurveTessellator.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshTools_CurveTessellator.delete (method)
  delete(): void;

  // IMeshTools_CurveTessellator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshTools_MeshAlgo: declare class IMeshTools_MeshAlgo extends Standard_Transient

  // IMeshTools_MeshAlgo.Perform (method)
  Perform(theDFace: unknown, theParameters: IMeshTools_Parameters, theRange: Message_ProgressRange): void;

  // IMeshTools_MeshAlgo.get_type_name (method)
  static get_type_name(): string;

  // IMeshTools_MeshAlgo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshTools_MeshAlgo.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshTools_MeshAlgo.delete (method)
  delete(): void;

  // IMeshTools_MeshAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshTools_MeshAlgoFactory: declare class IMeshTools_MeshAlgoFactory extends Standard_Transient

  // IMeshTools_MeshAlgoFactory.GetAlgo (method)
  GetAlgo(theSurfaceType: GeomAbs_SurfaceType, theParameters: IMeshTools_Parameters): IMeshTools_MeshAlgo;

  // IMeshTools_MeshAlgoFactory.get_type_name (method)
  static get_type_name(): string;

  // IMeshTools_MeshAlgoFactory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshTools_MeshAlgoFactory.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshTools_MeshAlgoFactory.delete (method)
  delete(): void;

  // IMeshTools_MeshAlgoFactory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshTools_MeshAlgoType: typeof IMeshTools_MeshAlgoType[keyof typeof IMeshTools_MeshAlgoType]

  readonly IMeshTools_MeshAlgoType_DEFAULT: 'IMeshTools_MeshAlgoType_DEFAULT'

  readonly IMeshTools_MeshAlgoType_Watson: 'IMeshTools_MeshAlgoType_Watson'

  readonly IMeshTools_MeshAlgoType_Delabella: 'IMeshTools_MeshAlgoType_Delabella'

IMeshTools_MeshBuilder: declare class IMeshTools_MeshBuilder extends Message_Algorithm

  // IMeshTools_MeshBuilder.constructor (constructor)
  constructor();
  constructor(theContext: IMeshTools_Context);

  // IMeshTools_MeshBuilder.SetContext (method)
  SetContext(theContext: IMeshTools_Context): void;

  // IMeshTools_MeshBuilder.GetContext (method)
  GetContext(): IMeshTools_Context;

  // IMeshTools_MeshBuilder.Perform (method)
  Perform(theRange: Message_ProgressRange): void;

  // IMeshTools_MeshBuilder.get_type_name (method)
  static get_type_name(): string;

  // IMeshTools_MeshBuilder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshTools_MeshBuilder.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshTools_MeshBuilder.delete (method)
  delete(): void;

  // IMeshTools_MeshBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshTools_ModelAlgo: declare class IMeshTools_ModelAlgo extends Standard_Transient

  // IMeshTools_ModelAlgo.Perform (method)
  Perform(theModel: IMeshData_Model, theParameters: IMeshTools_Parameters, theRange: Message_ProgressRange): boolean;

  // IMeshTools_ModelAlgo.get_type_name (method)
  static get_type_name(): string;

  // IMeshTools_ModelAlgo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshTools_ModelAlgo.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshTools_ModelAlgo.delete (method)
  delete(): void;

  // IMeshTools_ModelAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshTools_ModelBuilder: declare class IMeshTools_ModelBuilder extends Message_Algorithm

  // IMeshTools_ModelBuilder.Perform (method)
  Perform(theShape: TopoDS_Shape, theParameters: IMeshTools_Parameters): IMeshData_Model;

  // IMeshTools_ModelBuilder.get_type_name (method)
  static get_type_name(): string;

  // IMeshTools_ModelBuilder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshTools_ModelBuilder.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshTools_ModelBuilder.delete (method)
  delete(): void;

  // IMeshTools_ModelBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshTools_Parameters: declare class IMeshTools_Parameters

  // IMeshTools_Parameters.constructor (constructor)
  constructor();

  MeshAlgo: IMeshTools_MeshAlgoType

  Angle: number

  Deflection: number

  AngleInterior: number

  DeflectionInterior: number

  MinSize: number

  InParallel: boolean

  Relative: boolean

  InternalVerticesMode: boolean

  ControlSurfaceDeflection: boolean

  EnableControlSurfaceDeflectionAllSurfaces: boolean

  CleanModel: boolean

  AdjustMinSize: boolean

  ForceFaceDeflection: boolean

  AllowQualityDecrease: boolean

  // IMeshTools_Parameters.RelMinSize (method)
  static RelMinSize(): number;

  // IMeshTools_Parameters.delete (method)
  delete(): void;

  // IMeshTools_Parameters.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshTools_ShapeExplorer: declare class IMeshTools_ShapeExplorer extends IMeshData_Shape

  // IMeshTools_ShapeExplorer.constructor (constructor)
  constructor(theShape: TopoDS_Shape);

  // IMeshTools_ShapeExplorer.Accept (method)
  Accept(theVisitor: IMeshTools_ShapeVisitor): void;

  // IMeshTools_ShapeExplorer.get_type_name (method)
  static get_type_name(): string;

  // IMeshTools_ShapeExplorer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshTools_ShapeExplorer.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshTools_ShapeExplorer.delete (method)
  delete(): void;

  // IMeshTools_ShapeExplorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshTools_ShapeVisitor: declare class IMeshTools_ShapeVisitor extends Standard_Transient

  // IMeshTools_ShapeVisitor.Visit (method)
  Visit(theFace: TopoDS_Face): void;
  Visit(theEdge: TopoDS_Edge): void;

  // IMeshTools_ShapeVisitor.get_type_name (method)
  static get_type_name(): string;

  // IMeshTools_ShapeVisitor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshTools_ShapeVisitor.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshTools_ShapeVisitor.delete (method)
  delete(): void;

  // IMeshTools_ShapeVisitor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
