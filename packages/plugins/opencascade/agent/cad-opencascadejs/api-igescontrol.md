# libcascade — IGESControl

7 top-level symbols. Signatures are verbatim typescript.

IGESControl_ActorWrite: declare class IGESControl_ActorWrite extends Transfer_ActorOfFinderProcess

  // IGESControl_ActorWrite.constructor (constructor)
  constructor();

  // IGESControl_ActorWrite.Recognize (method)
  Recognize(start: Transfer_Finder): boolean;

  // IGESControl_ActorWrite.Transfer (method)
  Transfer(start: Transfer_Finder, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

  // IGESControl_ActorWrite.get_type_name (method)
  static get_type_name(): string;

  // IGESControl_ActorWrite.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESControl_ActorWrite.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESControl_ActorWrite.delete (method)
  delete(): void;

  // IGESControl_ActorWrite.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESControl_AlgoContainer: declare class IGESControl_AlgoContainer extends IGESToBRep_AlgoContainer

  // IGESControl_AlgoContainer.constructor (constructor)
  constructor();

  // IGESControl_AlgoContainer.get_type_name (method)
  static get_type_name(): string;

  // IGESControl_AlgoContainer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESControl_AlgoContainer.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESControl_AlgoContainer.delete (method)
  delete(): void;

  // IGESControl_AlgoContainer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESControl_Controller: declare class IGESControl_Controller extends XSControl_Controller

  // IGESControl_Controller.constructor (constructor)
  constructor(modefnes?: boolean);

  // IGESControl_Controller.NewModel (method)
  NewModel(): Interface_InterfaceModel;

  // IGESControl_Controller.ActorRead (method)
  ActorRead(model: Interface_InterfaceModel): Transfer_ActorOfTransientProcess;

  // IGESControl_Controller.TransferWriteShape (method)
  TransferWriteShape(shape: TopoDS_Shape, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  // IGESControl_Controller.Init (method)
  static Init(): boolean;

  // IGESControl_Controller.Customise (method)
  Customise(): { WS: XSControl_WorkSession; [Symbol.dispose](): void };

  // IGESControl_Controller.get_type_name (method)
  static get_type_name(): string;

  // IGESControl_Controller.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESControl_Controller.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESControl_Controller.delete (method)
  delete(): void;

  // IGESControl_Controller.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESControl_IGESBoundary: declare class IGESControl_IGESBoundary extends IGESToBRep_IGESBoundary

  // IGESControl_IGESBoundary.constructor (constructor)
  constructor();
  constructor(CS: IGESToBRep_CurveAndSurface);

  // IGESControl_IGESBoundary.Check (method)
  Check(result: boolean, checkclosure: boolean, okCurve3d: boolean, okCurve2d: boolean): void;

  // IGESControl_IGESBoundary.get_type_name (method)
  static get_type_name(): string;

  // IGESControl_IGESBoundary.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESControl_IGESBoundary.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESControl_IGESBoundary.delete (method)
  delete(): void;

  // IGESControl_IGESBoundary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESControl_Reader: declare class IGESControl_Reader extends XSControl_Reader

  // IGESControl_Reader.constructor (constructor)
  constructor();
  constructor(WS: XSControl_WorkSession, scratch?: boolean);

  // IGESControl_Reader.SetReadVisible (method)
  SetReadVisible(ReadRoot: boolean): void;

  // IGESControl_Reader.GetReadVisible (method)
  GetReadVisible(): boolean;

  // IGESControl_Reader.IGESModel (method)
  IGESModel(): IGESData_IGESModel;

  // IGESControl_Reader.NbRootsForTransfer (method)
  NbRootsForTransfer(): number;

  // IGESControl_Reader.PrintTransferInfo (method)
  PrintTransferInfo(failwarn: IFSelect_PrintFail, mode: IFSelect_PrintCount): void;

  // IGESControl_Reader.delete (method)
  delete(): void;

  // IGESControl_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESControl_ToolContainer: declare class IGESControl_ToolContainer extends IGESToBRep_ToolContainer

  // IGESControl_ToolContainer.constructor (constructor)
  constructor();

  // IGESControl_ToolContainer.IGESBoundary (method)
  IGESBoundary(): IGESToBRep_IGESBoundary;

  // IGESControl_ToolContainer.get_type_name (method)
  static get_type_name(): string;

  // IGESControl_ToolContainer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESControl_ToolContainer.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESControl_ToolContainer.delete (method)
  delete(): void;

  // IGESControl_ToolContainer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESControl_Writer: declare class IGESControl_Writer

  // IGESControl_Writer.constructor (constructor)
  constructor();
  constructor(theUnit: string, theModecr?: number);
  constructor(theModel: IGESData_IGESModel, theModecr?: number);

  // IGESControl_Writer.Model (method)
  Model(): IGESData_IGESModel;

  // IGESControl_Writer.TransferProcess (method)
  TransferProcess(): Transfer_FinderProcess;

  // IGESControl_Writer.SetTransferProcess (method)
  SetTransferProcess(TP: Transfer_FinderProcess): void;

  // IGESControl_Writer.AddShape (method)
  AddShape(sh: TopoDS_Shape, theProgress?: Message_ProgressRange): boolean;

  // IGESControl_Writer.AddGeom (method)
  AddGeom(geom: Standard_Transient): boolean;

  // IGESControl_Writer.AddEntity (method)
  AddEntity(ent: IGESData_IGESEntity): boolean;

  // IGESControl_Writer.ComputeModel (method)
  ComputeModel(): void;

  // IGESControl_Writer.Write (method)
  Write(file: string, fnes: boolean): boolean;

  // IGESControl_Writer.SetShapeFixParameters (method)
  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  // IGESControl_Writer.GetShapeFixParameters (method)
  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  // IGESControl_Writer.SetShapeProcessFlags (method)
  SetShapeProcessFlags(theFlags: any): void;

  // IGESControl_Writer.GetShapeProcessFlags (method)
  GetShapeProcessFlags(): any;

  // IGESControl_Writer.delete (method)
  delete(): void;

  // IGESControl_Writer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
