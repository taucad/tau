# libcascade — TransferBRep

7 top-level symbols. Signatures are verbatim typescript.

TransferBRep_BinderOfShape: declare class TransferBRep_BinderOfShape extends Transfer_Binder

  constructor

  ResultType(): Standard_Type;

  ResultTypeName(): string;

  SetResult(res: TopoDS_Shape): void;

  Result(): TopoDS_Shape;

  CResult(): TopoDS_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TransferBRep_Reader: declare class TransferBRep_Reader

  constructor

  SetProtocol(protocol: Interface_Protocol): void;

  Protocol(): Interface_Protocol;

  SetActor(actor: Transfer_ActorOfTransientProcess): void;

  Actor(): Transfer_ActorOfTransientProcess;

  SetFileStatus(status: number): void;

  FileStatus(): number;

  FileNotFound(): boolean;

  SyntaxError(): boolean;

  SetModel(model: Interface_InterfaceModel): void;

  Model(): Interface_InterfaceModel;

  Clear(): void;

  CheckStatusModel(withprint: boolean): boolean;

  ModeNewTransfer(): boolean;

  BeginTransfer(): boolean;

  EndTransfer(): void;

  PrepareTransfer(): void;

  TransferRoots(theProgress?: Message_ProgressRange): void;

  Transfer(num: number, theProgress?: Message_ProgressRange): boolean;

  TransferList(list: NCollection_HSequence_handle_Standard_Transient, theProgress?: Message_ProgressRange): void;

  IsDone(): boolean;

  NbShapes(): number;

  Shapes(): NCollection_HSequence_TopoDS_Shape;

  Shape(num?: number): TopoDS_Shape;

  ShapeResult(ent: Standard_Transient): TopoDS_Shape;

  OneShape(): TopoDS_Shape;

  NbTransients(): number;

  Transients(): NCollection_HSequence_handle_Standard_Transient;

  Transient(num?: number): Standard_Transient;

  CheckStatusResult(withprints: boolean): boolean;

  TransientProcess(): Transfer_TransientProcess;

  delete(): void;

  [Symbol.dispose](): void;

TransferBRep_ShapeBinder: declare class TransferBRep_ShapeBinder extends TransferBRep_BinderOfShape

  constructor

  ShapeType(): TopAbs_ShapeEnum;

  Vertex(): TopoDS_Vertex;

  Edge(): TopoDS_Edge;

  Wire(): TopoDS_Wire;

  Face(): TopoDS_Face;

  Shell(): TopoDS_Shell;

  Solid(): TopoDS_Solid;

  CompSolid(): TopoDS_CompSolid;

  Compound(): TopoDS_Compound;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TransferBRep_ShapeInfo: declare class TransferBRep_ShapeInfo

  constructor

  static Type(ent: TopoDS_Shape): Standard_Type;

  static TypeName(ent: TopoDS_Shape): string;

  delete(): void;

  [Symbol.dispose](): void;

TransferBRep_ShapeListBinder: declare class TransferBRep_ShapeListBinder extends Transfer_Binder

  constructor

  IsMultiple(): boolean;

  ResultType(): Standard_Type;

  ResultTypeName(): string;

  AddResult(res: TopoDS_Shape): void;
  AddResult(next: Transfer_Binder): void;
  AddResult(res: TopoDS_Shape): void;
  AddResult(next: Transfer_Binder): void;

  Result(): NCollection_HSequence_TopoDS_Shape;

  SetResult(num: number, res: TopoDS_Shape): void;

  NbShapes(): number;

  Shape(num: number): TopoDS_Shape;

  ShapeType(num: number): TopAbs_ShapeEnum;

  Vertex(num: number): TopoDS_Vertex;

  Edge(num: number): TopoDS_Edge;

  Wire(num: number): TopoDS_Wire;

  Face(num: number): TopoDS_Face;

  Shell(num: number): TopoDS_Shell;

  Solid(num: number): TopoDS_Solid;

  CompSolid(num: number): TopoDS_CompSolid;

  Compound(num: number): TopoDS_Compound;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TransferBRep_ShapeMapper: declare class TransferBRep_ShapeMapper extends Transfer_Finder

  constructor

  Value(): TopoDS_Shape;

  Equates(other: Transfer_Finder): boolean;

  ValueType(): Standard_Type;

  ValueTypeName(): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TransferBRep_TransferResultInfo: declare class TransferBRep_TransferResultInfo extends Standard_Transient

  constructor

  Clear(): void;

  Result(): number;

  ResultWarning(): number;

  ResultFail(): number;

  ResultWarningFail(): number;

  NoResult(): number;

  NoResultWarning(): number;

  NoResultFail(): number;

  NoResultWarningFail(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
