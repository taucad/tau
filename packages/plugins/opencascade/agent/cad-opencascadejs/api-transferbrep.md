# libcascade — TransferBRep

7 top-level symbols. Signatures are verbatim typescript.

TransferBRep_BinderOfShape: declare class TransferBRep_BinderOfShape extends Transfer_Binder

  // TransferBRep_BinderOfShape.constructor (constructor)
  constructor();
  constructor(res: TopoDS_Shape);

  // TransferBRep_BinderOfShape.ResultType (method)
  ResultType(): Standard_Type;

  // TransferBRep_BinderOfShape.ResultTypeName (method)
  ResultTypeName(): string;

  // TransferBRep_BinderOfShape.SetResult (method)
  SetResult(res: TopoDS_Shape): void;

  // TransferBRep_BinderOfShape.Result (method)
  Result(): TopoDS_Shape;

  // TransferBRep_BinderOfShape.CResult (method)
  CResult(): TopoDS_Shape;

  // TransferBRep_BinderOfShape.get_type_name (method)
  static get_type_name(): string;

  // TransferBRep_BinderOfShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TransferBRep_BinderOfShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // TransferBRep_BinderOfShape.delete (method)
  delete(): void;

  // TransferBRep_BinderOfShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TransferBRep_Reader: declare class TransferBRep_Reader

  // TransferBRep_Reader.constructor (constructor)
  constructor();

  // TransferBRep_Reader.SetProtocol (method)
  SetProtocol(protocol: Interface_Protocol): void;

  // TransferBRep_Reader.Protocol (method)
  Protocol(): Interface_Protocol;

  // TransferBRep_Reader.SetActor (method)
  SetActor(actor: Transfer_ActorOfTransientProcess): void;

  // TransferBRep_Reader.Actor (method)
  Actor(): Transfer_ActorOfTransientProcess;

  // TransferBRep_Reader.SetFileStatus (method)
  SetFileStatus(status: number): void;

  // TransferBRep_Reader.FileStatus (method)
  FileStatus(): number;

  // TransferBRep_Reader.FileNotFound (method)
  FileNotFound(): boolean;

  // TransferBRep_Reader.SyntaxError (method)
  SyntaxError(): boolean;

  // TransferBRep_Reader.SetModel (method)
  SetModel(model: Interface_InterfaceModel): void;

  // TransferBRep_Reader.Model (method)
  Model(): Interface_InterfaceModel;

  // TransferBRep_Reader.Clear (method)
  Clear(): void;

  // TransferBRep_Reader.CheckStatusModel (method)
  CheckStatusModel(withprint: boolean): boolean;

  // TransferBRep_Reader.ModeNewTransfer (method)
  ModeNewTransfer(): boolean;

  // TransferBRep_Reader.BeginTransfer (method)
  BeginTransfer(): boolean;

  // TransferBRep_Reader.EndTransfer (method)
  EndTransfer(): void;

  // TransferBRep_Reader.PrepareTransfer (method)
  PrepareTransfer(): void;

  // TransferBRep_Reader.TransferRoots (method)
  TransferRoots(theProgress?: Message_ProgressRange): void;

  // TransferBRep_Reader.Transfer (method)
  Transfer(num: number, theProgress?: Message_ProgressRange): boolean;

  // TransferBRep_Reader.TransferList (method)
  TransferList(list: NCollection_HSequence_handle_Standard_Transient, theProgress?: Message_ProgressRange): void;

  // TransferBRep_Reader.IsDone (method)
  IsDone(): boolean;

  // TransferBRep_Reader.NbShapes (method)
  NbShapes(): number;

  // TransferBRep_Reader.Shapes (method)
  Shapes(): NCollection_HSequence_TopoDS_Shape;

  // TransferBRep_Reader.Shape (method)
  Shape(num?: number): TopoDS_Shape;

  // TransferBRep_Reader.ShapeResult (method)
  ShapeResult(ent: Standard_Transient): TopoDS_Shape;

  // TransferBRep_Reader.OneShape (method)
  OneShape(): TopoDS_Shape;

  // TransferBRep_Reader.NbTransients (method)
  NbTransients(): number;

  // TransferBRep_Reader.Transients (method)
  Transients(): NCollection_HSequence_handle_Standard_Transient;

  // TransferBRep_Reader.Transient (method)
  Transient(num?: number): Standard_Transient;

  // TransferBRep_Reader.CheckStatusResult (method)
  CheckStatusResult(withprints: boolean): boolean;

  // TransferBRep_Reader.TransientProcess (method)
  TransientProcess(): Transfer_TransientProcess;

  // TransferBRep_Reader.delete (method)
  delete(): void;

  // TransferBRep_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TransferBRep_ShapeBinder: declare class TransferBRep_ShapeBinder extends TransferBRep_BinderOfShape

  // TransferBRep_ShapeBinder.constructor (constructor)
  constructor();
  constructor(res: TopoDS_Shape);

  // TransferBRep_ShapeBinder.ShapeType (method)
  ShapeType(): TopAbs_ShapeEnum;

  // TransferBRep_ShapeBinder.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // TransferBRep_ShapeBinder.Edge (method)
  Edge(): TopoDS_Edge;

  // TransferBRep_ShapeBinder.Wire (method)
  Wire(): TopoDS_Wire;

  // TransferBRep_ShapeBinder.Face (method)
  Face(): TopoDS_Face;

  // TransferBRep_ShapeBinder.Shell (method)
  Shell(): TopoDS_Shell;

  // TransferBRep_ShapeBinder.Solid (method)
  Solid(): TopoDS_Solid;

  // TransferBRep_ShapeBinder.CompSolid (method)
  CompSolid(): TopoDS_CompSolid;

  // TransferBRep_ShapeBinder.Compound (method)
  Compound(): TopoDS_Compound;

  // TransferBRep_ShapeBinder.get_type_name (method)
  static get_type_name(): string;

  // TransferBRep_ShapeBinder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TransferBRep_ShapeBinder.DynamicType (method)
  DynamicType(): Standard_Type;

  // TransferBRep_ShapeBinder.delete (method)
  delete(): void;

  // TransferBRep_ShapeBinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TransferBRep_ShapeInfo: declare class TransferBRep_ShapeInfo

  // TransferBRep_ShapeInfo.constructor (constructor)
  constructor();

  // TransferBRep_ShapeInfo.Type (method)
  static Type(ent: TopoDS_Shape): Standard_Type;

  // TransferBRep_ShapeInfo.TypeName (method)
  static TypeName(ent: TopoDS_Shape): string;

  // TransferBRep_ShapeInfo.delete (method)
  delete(): void;

  // TransferBRep_ShapeInfo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TransferBRep_ShapeListBinder: declare class TransferBRep_ShapeListBinder extends Transfer_Binder

  // TransferBRep_ShapeListBinder.constructor (constructor)
  constructor();
  constructor(list: NCollection_HSequence_TopoDS_Shape);

  // TransferBRep_ShapeListBinder.IsMultiple (method)
  IsMultiple(): boolean;

  // TransferBRep_ShapeListBinder.ResultType (method)
  ResultType(): Standard_Type;

  // TransferBRep_ShapeListBinder.ResultTypeName (method)
  ResultTypeName(): string;

  // TransferBRep_ShapeListBinder.AddResult (method)
  AddResult(res: TopoDS_Shape): void;
  AddResult(next: Transfer_Binder): void;

  // TransferBRep_ShapeListBinder.Result (method)
  Result(): NCollection_HSequence_TopoDS_Shape;

  // TransferBRep_ShapeListBinder.SetResult (method)
  SetResult(num: number, res: TopoDS_Shape): void;

  // TransferBRep_ShapeListBinder.NbShapes (method)
  NbShapes(): number;

  // TransferBRep_ShapeListBinder.Shape (method)
  Shape(num: number): TopoDS_Shape;

  // TransferBRep_ShapeListBinder.ShapeType (method)
  ShapeType(num: number): TopAbs_ShapeEnum;

  // TransferBRep_ShapeListBinder.Vertex (method)
  Vertex(num: number): TopoDS_Vertex;

  // TransferBRep_ShapeListBinder.Edge (method)
  Edge(num: number): TopoDS_Edge;

  // TransferBRep_ShapeListBinder.Wire (method)
  Wire(num: number): TopoDS_Wire;

  // TransferBRep_ShapeListBinder.Face (method)
  Face(num: number): TopoDS_Face;

  // TransferBRep_ShapeListBinder.Shell (method)
  Shell(num: number): TopoDS_Shell;

  // TransferBRep_ShapeListBinder.Solid (method)
  Solid(num: number): TopoDS_Solid;

  // TransferBRep_ShapeListBinder.CompSolid (method)
  CompSolid(num: number): TopoDS_CompSolid;

  // TransferBRep_ShapeListBinder.Compound (method)
  Compound(num: number): TopoDS_Compound;

  // TransferBRep_ShapeListBinder.get_type_name (method)
  static get_type_name(): string;

  // TransferBRep_ShapeListBinder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TransferBRep_ShapeListBinder.DynamicType (method)
  DynamicType(): Standard_Type;

  // TransferBRep_ShapeListBinder.delete (method)
  delete(): void;

  // TransferBRep_ShapeListBinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TransferBRep_ShapeMapper: declare class TransferBRep_ShapeMapper extends Transfer_Finder

  // TransferBRep_ShapeMapper.constructor (constructor)
  constructor(akey: TopoDS_Shape);

  // TransferBRep_ShapeMapper.Value (method)
  Value(): TopoDS_Shape;

  // TransferBRep_ShapeMapper.Equates (method)
  Equates(other: Transfer_Finder): boolean;

  // TransferBRep_ShapeMapper.ValueType (method)
  ValueType(): Standard_Type;

  // TransferBRep_ShapeMapper.ValueTypeName (method)
  ValueTypeName(): string;

  // TransferBRep_ShapeMapper.get_type_name (method)
  static get_type_name(): string;

  // TransferBRep_ShapeMapper.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TransferBRep_ShapeMapper.DynamicType (method)
  DynamicType(): Standard_Type;

  // TransferBRep_ShapeMapper.delete (method)
  delete(): void;

  // TransferBRep_ShapeMapper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TransferBRep_TransferResultInfo: declare class TransferBRep_TransferResultInfo extends Standard_Transient

  // TransferBRep_TransferResultInfo.constructor (constructor)
  constructor();

  // TransferBRep_TransferResultInfo.Clear (method)
  Clear(): void;

  // TransferBRep_TransferResultInfo.Result (method)
  Result(): number;

  // TransferBRep_TransferResultInfo.ResultWarning (method)
  ResultWarning(): number;

  // TransferBRep_TransferResultInfo.ResultFail (method)
  ResultFail(): number;

  // TransferBRep_TransferResultInfo.ResultWarningFail (method)
  ResultWarningFail(): number;

  // TransferBRep_TransferResultInfo.NoResult (method)
  NoResult(): number;

  // TransferBRep_TransferResultInfo.NoResultWarning (method)
  NoResultWarning(): number;

  // TransferBRep_TransferResultInfo.NoResultFail (method)
  NoResultFail(): number;

  // TransferBRep_TransferResultInfo.NoResultWarningFail (method)
  NoResultWarningFail(): number;

  // TransferBRep_TransferResultInfo.get_type_name (method)
  static get_type_name(): string;

  // TransferBRep_TransferResultInfo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TransferBRep_TransferResultInfo.DynamicType (method)
  DynamicType(): Standard_Type;

  // TransferBRep_TransferResultInfo.delete (method)
  delete(): void;

  // TransferBRep_TransferResultInfo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
