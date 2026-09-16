# libcascade — IMeshTools

11 top-level symbols. Signatures are verbatim typescript.

IMeshTools_Context: declare class IMeshTools_Context extends IMeshData_Shape

  constructor

  BuildModel(): boolean;

  DiscretizeEdges(): boolean;

  HealModel(): boolean;

  PreProcessModel(): boolean;

  DiscretizeFaces(theRange: Message_ProgressRange): boolean;

  PostProcessModel(): boolean;

  Clean(): void;

  GetModelBuilder(): IMeshTools_ModelBuilder;

  SetModelBuilder(theBuilder: IMeshTools_ModelBuilder): void;

  GetEdgeDiscret(): IMeshTools_ModelAlgo;

  SetEdgeDiscret(theEdgeDiscret: IMeshTools_ModelAlgo): void;

  GetModelHealer(): IMeshTools_ModelAlgo;

  SetModelHealer(theModelHealer: IMeshTools_ModelAlgo): void;

  GetPreProcessor(): IMeshTools_ModelAlgo;

  SetPreProcessor(thePreProcessor: IMeshTools_ModelAlgo): void;

  GetFaceDiscret(): IMeshTools_ModelAlgo;

  SetFaceDiscret(theFaceDiscret: IMeshTools_ModelAlgo): void;

  GetPostProcessor(): IMeshTools_ModelAlgo;

  SetPostProcessor(thePostProcessor: IMeshTools_ModelAlgo): void;

  GetParameters(): IMeshTools_Parameters;

  ChangeParameters(): IMeshTools_Parameters;

  GetModel(): IMeshData_Model;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IMeshTools_CurveTessellator: declare class IMeshTools_CurveTessellator extends Standard_Transient

  PointsNb(): number;

  Value(theIndex: number, thePoint: gp_Pnt, theParameter: number): { returnValue: boolean; theParameter: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IMeshTools_MeshAlgo: declare class IMeshTools_MeshAlgo extends Standard_Transient

  Perform(theDFace: unknown, theParameters: IMeshTools_Parameters, theRange: Message_ProgressRange): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IMeshTools_MeshAlgoFactory: declare class IMeshTools_MeshAlgoFactory extends Standard_Transient

  GetAlgo(theSurfaceType: GeomAbs_SurfaceType, theParameters: IMeshTools_Parameters): IMeshTools_MeshAlgo;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IMeshTools_MeshAlgoType: typeof IMeshTools_MeshAlgoType[keyof typeof IMeshTools_MeshAlgoType]

IMeshTools_MeshBuilder: declare class IMeshTools_MeshBuilder extends Message_Algorithm

  constructor

  SetContext(theContext: IMeshTools_Context): void;

  GetContext(): IMeshTools_Context;

  Perform(theRange: Message_ProgressRange): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IMeshTools_ModelAlgo: declare class IMeshTools_ModelAlgo extends Standard_Transient

  Perform(theModel: IMeshData_Model, theParameters: IMeshTools_Parameters, theRange: Message_ProgressRange): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IMeshTools_ModelBuilder: declare class IMeshTools_ModelBuilder extends Message_Algorithm

  Perform(theShape: TopoDS_Shape, theParameters: IMeshTools_Parameters): IMeshData_Model;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IMeshTools_Parameters: declare class IMeshTools_Parameters

  constructor

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

  static RelMinSize(): number;

  delete(): void;

  [Symbol.dispose](): void;

IMeshTools_ShapeExplorer: declare class IMeshTools_ShapeExplorer extends IMeshData_Shape

  constructor

  Accept(theVisitor: IMeshTools_ShapeVisitor): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IMeshTools_ShapeVisitor: declare class IMeshTools_ShapeVisitor extends Standard_Transient

  Visit(theFace: TopoDS_Face): void;
  Visit(theEdge: TopoDS_Edge): void;
  Visit(theFace: TopoDS_Face): void;
  Visit(theEdge: TopoDS_Edge): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
