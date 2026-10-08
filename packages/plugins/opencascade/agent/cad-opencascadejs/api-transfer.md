# libcascade — Transfer

27 top-level symbols. Signatures are verbatim typescript.

Transfer_ActorDispatch: declare class Transfer_ActorDispatch extends Transfer_ActorOfTransientProcess

  // Transfer_ActorDispatch.constructor (constructor)
  constructor(amodel: Interface_InterfaceModel);
  constructor(amodel: Interface_InterfaceModel, lib: Interface_GeneralLib);
  constructor(amodel: Interface_InterfaceModel, protocol: Interface_Protocol);

  // Transfer_ActorDispatch.AddActor (method)
  AddActor(actor: Transfer_ActorOfTransientProcess): void;

  // Transfer_ActorDispatch.TransferDispatch (method)
  TransferDispatch(): Transfer_TransferDispatch;

  // Transfer_ActorDispatch.Transfer (method)
  Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

  // Transfer_ActorDispatch.get_type_name (method)
  static get_type_name(): string;

  // Transfer_ActorDispatch.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_ActorDispatch.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_ActorDispatch.delete (method)
  delete(): void;

  // Transfer_ActorDispatch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_ActorOfFinderProcess: declare class Transfer_ActorOfFinderProcess extends Transfer_ActorOfProcessForFinder

  // Transfer_ActorOfFinderProcess.constructor (constructor)
  constructor();

  // Transfer_ActorOfFinderProcess.ModeTrans (method)
  ModeTrans(): number;

  // Transfer_ActorOfFinderProcess.Transferring (method)
  Transferring(start: Transfer_Finder, TP: Transfer_ProcessForFinder, theProgress?: Message_ProgressRange): Transfer_Binder;

  // Transfer_ActorOfFinderProcess.Transfer (method)
  Transfer(start: Transfer_Finder, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

  // Transfer_ActorOfFinderProcess.TransferTransient (method)
  TransferTransient(start: Standard_Transient, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Standard_Transient;

  // Transfer_ActorOfFinderProcess.SetShapeFixParameters (method)
  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  // Transfer_ActorOfFinderProcess.GetShapeFixParameters (method)
  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  // Transfer_ActorOfFinderProcess.SetShapeProcessFlags (method)
  SetShapeProcessFlags(theFlags: any): void;

  // Transfer_ActorOfFinderProcess.GetShapeProcessFlags (method)
  GetShapeProcessFlags(): [any, boolean];

  // Transfer_ActorOfFinderProcess.get_type_name (method)
  static get_type_name(): string;

  // Transfer_ActorOfFinderProcess.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_ActorOfFinderProcess.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_ActorOfFinderProcess.delete (method)
  delete(): void;

  // Transfer_ActorOfFinderProcess.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_ActorOfProcessForFinder: declare class Transfer_ActorOfProcessForFinder extends Standard_Transient

  // Transfer_ActorOfProcessForFinder.constructor (constructor)
  constructor();

  // Transfer_ActorOfProcessForFinder.Recognize (method)
  Recognize(start: Transfer_Finder): boolean;

  // Transfer_ActorOfProcessForFinder.Transferring (method)
  Transferring(start: Transfer_Finder, TP: Transfer_ProcessForFinder, theProgress?: Message_ProgressRange): Transfer_Binder;

  // Transfer_ActorOfProcessForFinder.TransientResult (method)
  TransientResult(res: Standard_Transient): Transfer_SimpleBinderOfTransient;

  // Transfer_ActorOfProcessForFinder.NullResult (method)
  NullResult(): Transfer_Binder;

  // Transfer_ActorOfProcessForFinder.SetLast (method)
  SetLast(mode?: boolean): void;

  // Transfer_ActorOfProcessForFinder.IsLast (method)
  IsLast(): boolean;

  // Transfer_ActorOfProcessForFinder.SetNext (method)
  SetNext(next: Transfer_ActorOfProcessForFinder): void;

  // Transfer_ActorOfProcessForFinder.Next (method)
  Next(): Transfer_ActorOfProcessForFinder;

  // Transfer_ActorOfProcessForFinder.get_type_name (method)
  static get_type_name(): string;

  // Transfer_ActorOfProcessForFinder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_ActorOfProcessForFinder.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_ActorOfProcessForFinder.delete (method)
  delete(): void;

  // Transfer_ActorOfProcessForFinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_ActorOfProcessForTransient: declare class Transfer_ActorOfProcessForTransient extends Standard_Transient

  // Transfer_ActorOfProcessForTransient.constructor (constructor)
  constructor();

  // Transfer_ActorOfProcessForTransient.Recognize (method)
  Recognize(start: Standard_Transient): boolean;

  // Transfer_ActorOfProcessForTransient.Transferring (method)
  Transferring(start: Standard_Transient, TP: Transfer_ProcessForTransient, theProgress?: Message_ProgressRange): Transfer_Binder;

  // Transfer_ActorOfProcessForTransient.TransientResult (method)
  TransientResult(res: Standard_Transient): Transfer_SimpleBinderOfTransient;

  // Transfer_ActorOfProcessForTransient.NullResult (method)
  NullResult(): Transfer_Binder;

  // Transfer_ActorOfProcessForTransient.SetLast (method)
  SetLast(mode?: boolean): void;

  // Transfer_ActorOfProcessForTransient.IsLast (method)
  IsLast(): boolean;

  // Transfer_ActorOfProcessForTransient.SetNext (method)
  SetNext(next: Transfer_ActorOfProcessForTransient): void;

  // Transfer_ActorOfProcessForTransient.Next (method)
  Next(): Transfer_ActorOfProcessForTransient;

  // Transfer_ActorOfProcessForTransient.get_type_name (method)
  static get_type_name(): string;

  // Transfer_ActorOfProcessForTransient.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_ActorOfProcessForTransient.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_ActorOfProcessForTransient.delete (method)
  delete(): void;

  // Transfer_ActorOfProcessForTransient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_ActorOfTransientProcess: declare class Transfer_ActorOfTransientProcess extends Transfer_ActorOfProcessForTransient

  // Transfer_ActorOfTransientProcess.constructor (constructor)
  constructor();

  // Transfer_ActorOfTransientProcess.Transferring (method)
  Transferring(start: Standard_Transient, TP: Transfer_ProcessForTransient, theProgress?: Message_ProgressRange): Transfer_Binder;

  // Transfer_ActorOfTransientProcess.Transfer (method)
  Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

  // Transfer_ActorOfTransientProcess.TransferTransient (method)
  TransferTransient(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Standard_Transient;

  // Transfer_ActorOfTransientProcess.SetShapeFixParameters (method)
  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  // Transfer_ActorOfTransientProcess.GetShapeFixParameters (method)
  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  // Transfer_ActorOfTransientProcess.SetProcessingFlags (method)
  SetProcessingFlags(theFlags: any): void;

  // Transfer_ActorOfTransientProcess.GetProcessingFlags (method)
  GetProcessingFlags(): [any, boolean];

  // Transfer_ActorOfTransientProcess.get_type_name (method)
  static get_type_name(): string;

  // Transfer_ActorOfTransientProcess.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_ActorOfTransientProcess.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_ActorOfTransientProcess.delete (method)
  delete(): void;

  // Transfer_ActorOfTransientProcess.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_Binder: declare class Transfer_Binder extends Standard_Transient

  // Transfer_Binder.Merge (method)
  Merge(other: Transfer_Binder): void;

  // Transfer_Binder.IsMultiple (method)
  IsMultiple(): boolean;

  // Transfer_Binder.ResultType (method)
  ResultType(): Standard_Type;

  // Transfer_Binder.ResultTypeName (method)
  ResultTypeName(): string;

  // Transfer_Binder.AddResult (method)
  AddResult(next: Transfer_Binder): void;

  // Transfer_Binder.NextResult (method)
  NextResult(): Transfer_Binder;

  // Transfer_Binder.HasResult (method)
  HasResult(): boolean;

  // Transfer_Binder.SetAlreadyUsed (method)
  SetAlreadyUsed(): void;

  // Transfer_Binder.Status (method)
  Status(): Transfer_StatusResult;

  // Transfer_Binder.StatusExec (method)
  StatusExec(): Transfer_StatusExec;

  // Transfer_Binder.SetStatusExec (method)
  SetStatusExec(stat: Transfer_StatusExec): void;

  // Transfer_Binder.AddFail (method)
  AddFail(mess: string, orig?: string): void;

  // Transfer_Binder.AddWarning (method)
  AddWarning(mess: string, orig?: string): void;

  // Transfer_Binder.Check (method)
  Check(): Interface_Check;

  // Transfer_Binder.CCheck (method)
  CCheck(): Interface_Check;

  // Transfer_Binder.get_type_name (method)
  static get_type_name(): string;

  // Transfer_Binder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_Binder.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_Binder.delete (method)
  delete(): void;

  // Transfer_Binder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_BinderOfTransientInteger: declare class Transfer_BinderOfTransientInteger extends Transfer_SimpleBinderOfTransient

  // Transfer_BinderOfTransientInteger.constructor (constructor)
  constructor();

  // Transfer_BinderOfTransientInteger.SetInteger (method)
  SetInteger(value: number): void;

  // Transfer_BinderOfTransientInteger.Integer (method)
  Integer(): number;

  // Transfer_BinderOfTransientInteger.get_type_name (method)
  static get_type_name(): string;

  // Transfer_BinderOfTransientInteger.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_BinderOfTransientInteger.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_BinderOfTransientInteger.delete (method)
  delete(): void;

  // Transfer_BinderOfTransientInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_DataInfo: declare class Transfer_DataInfo

  // Transfer_DataInfo.constructor (constructor)
  constructor();

  // Transfer_DataInfo.Type (method)
  static Type(ent: Standard_Transient): Standard_Type;

  // Transfer_DataInfo.TypeName (method)
  static TypeName(ent: Standard_Transient): string;

  // Transfer_DataInfo.delete (method)
  delete(): void;

  // Transfer_DataInfo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_DispatchControl: declare class Transfer_DispatchControl extends Interface_CopyControl

  // Transfer_DispatchControl.constructor (constructor)
  constructor(model: Interface_InterfaceModel, TP: Transfer_TransientProcess);

  // Transfer_DispatchControl.TransientProcess (method)
  TransientProcess(): Transfer_TransientProcess;

  // Transfer_DispatchControl.StartingModel (method)
  StartingModel(): Interface_InterfaceModel;

  // Transfer_DispatchControl.Clear (method)
  Clear(): void;

  // Transfer_DispatchControl.Bind (method)
  Bind(ent: Standard_Transient, res: Standard_Transient): void;

  // Transfer_DispatchControl.Search (method)
  Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

  // Transfer_DispatchControl.get_type_name (method)
  static get_type_name(): string;

  // Transfer_DispatchControl.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_DispatchControl.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_DispatchControl.delete (method)
  delete(): void;

  // Transfer_DispatchControl.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_FindHasher: declare class Transfer_FindHasher

  // Transfer_FindHasher.constructor (constructor)
  constructor();

  // Transfer_FindHasher.delete (method)
  delete(): void;

  // Transfer_FindHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_Finder: declare class Transfer_Finder extends Standard_Transient

  // Transfer_Finder.GetHashCode (method)
  GetHashCode(): number;

  // Transfer_Finder.Equates (method)
  Equates(other: Transfer_Finder): boolean;

  // Transfer_Finder.ValueType (method)
  ValueType(): Standard_Type;

  // Transfer_Finder.ValueTypeName (method)
  ValueTypeName(): string;

  // Transfer_Finder.SetAttribute (method)
  SetAttribute(name: string, val: Standard_Transient): void;

  // Transfer_Finder.RemoveAttribute (method)
  RemoveAttribute(name: string): boolean;

  // Transfer_Finder.GetAttribute (method)
  GetAttribute(name: string, type_: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

  // Transfer_Finder.Attribute (method)
  Attribute(name: string): Standard_Transient;

  // Transfer_Finder.AttributeType (method)
  AttributeType(name: string): Interface_ParamType;

  // Transfer_Finder.SetIntegerAttribute (method)
  SetIntegerAttribute(name: string, val: number): void;

  // Transfer_Finder.GetIntegerAttribute (method)
  GetIntegerAttribute(name: string, val?: number): { returnValue: boolean; val: number };

  // Transfer_Finder.IntegerAttribute (method)
  IntegerAttribute(name: string): number;

  // Transfer_Finder.SetRealAttribute (method)
  SetRealAttribute(name: string, val: number): void;

  // Transfer_Finder.GetRealAttribute (method)
  GetRealAttribute(name: string, val?: number): { returnValue: boolean; val: number };

  // Transfer_Finder.RealAttribute (method)
  RealAttribute(name: string): number;

  // Transfer_Finder.SetStringAttribute (method)
  SetStringAttribute(name: string, val: string): void;

  // Transfer_Finder.StringAttribute (method)
  StringAttribute(name: string): string;

  // Transfer_Finder.AttrList (method)
  AttrList(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

  // Transfer_Finder.SameAttributes (method)
  SameAttributes(other: Transfer_Finder): void;

  // Transfer_Finder.GetAttributes (method)
  GetAttributes(other: Transfer_Finder, fromname?: string, copied?: boolean): void;

  // Transfer_Finder.get_type_name (method)
  static get_type_name(): string;

  // Transfer_Finder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_Finder.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_Finder.delete (method)
  delete(): void;

  // Transfer_Finder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_FinderProcess: declare class Transfer_FinderProcess extends Transfer_ProcessForFinder

  // Transfer_FinderProcess.constructor (constructor)
  constructor(nb?: number);

  // Transfer_FinderProcess.SetModel (method)
  SetModel(model: Interface_InterfaceModel): void;

  // Transfer_FinderProcess.Model (method)
  Model(): Interface_InterfaceModel;

  // Transfer_FinderProcess.NextMappedWithAttribute (method)
  NextMappedWithAttribute(name: string, num0: number): number;

  // Transfer_FinderProcess.TransientMapper (method)
  TransientMapper(obj: Standard_Transient): Transfer_TransientMapper;

  // Transfer_FinderProcess.get_type_name (method)
  static get_type_name(): string;

  // Transfer_FinderProcess.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_FinderProcess.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_FinderProcess.delete (method)
  delete(): void;

  // Transfer_FinderProcess.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_IteratorOfProcessForFinder: declare class Transfer_IteratorOfProcessForFinder extends Transfer_TransferIterator

  // Transfer_IteratorOfProcessForFinder.constructor (constructor)
  constructor(withstarts: boolean);

  // Transfer_IteratorOfProcessForFinder.Add (method)
  Add(binder: Transfer_Binder): void;
  Add(binder: Transfer_Binder, start: Transfer_Finder): void;

  // Transfer_IteratorOfProcessForFinder.Filter (method)
  Filter(list: NCollection_HSequence_handle_Transfer_Finder, keep?: boolean): void;

  // Transfer_IteratorOfProcessForFinder.HasStarting (method)
  HasStarting(): boolean;

  // Transfer_IteratorOfProcessForFinder.Starting (method)
  Starting(): Transfer_Finder;

  // Transfer_IteratorOfProcessForFinder.delete (method)
  delete(): void;

  // Transfer_IteratorOfProcessForFinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_IteratorOfProcessForTransient: declare class Transfer_IteratorOfProcessForTransient extends Transfer_TransferIterator

  // Transfer_IteratorOfProcessForTransient.constructor (constructor)
  constructor(withstarts: boolean);

  // Transfer_IteratorOfProcessForTransient.Add (method)
  Add(binder: Transfer_Binder): void;
  Add(binder: Transfer_Binder, start: Standard_Transient): void;

  // Transfer_IteratorOfProcessForTransient.Filter (method)
  Filter(list: NCollection_HSequence_handle_Standard_Transient, keep?: boolean): void;

  // Transfer_IteratorOfProcessForTransient.HasStarting (method)
  HasStarting(): boolean;

  // Transfer_IteratorOfProcessForTransient.Starting (method)
  Starting(): Standard_Transient;

  // Transfer_IteratorOfProcessForTransient.delete (method)
  delete(): void;

  // Transfer_IteratorOfProcessForTransient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_MapContainer: declare class Transfer_MapContainer extends Standard_Transient

  // Transfer_MapContainer.constructor (constructor)
  constructor();

  // Transfer_MapContainer.SetMapObjects (method)
  SetMapObjects(theMapObjects: NCollection_DataMap_handle_Standard_Transient_handle_Standard_Transient): void;

  // Transfer_MapContainer.GetMapObjects (method)
  GetMapObjects(): NCollection_DataMap_handle_Standard_Transient_handle_Standard_Transient;

  // Transfer_MapContainer.get_type_name (method)
  static get_type_name(): string;

  // Transfer_MapContainer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_MapContainer.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_MapContainer.delete (method)
  delete(): void;

  // Transfer_MapContainer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_MultipleBinder: declare class Transfer_MultipleBinder extends Transfer_Binder

  // Transfer_MultipleBinder.constructor (constructor)
  constructor();

  // Transfer_MultipleBinder.IsMultiple (method)
  IsMultiple(): boolean;

  // Transfer_MultipleBinder.ResultType (method)
  ResultType(): Standard_Type;

  // Transfer_MultipleBinder.ResultTypeName (method)
  ResultTypeName(): string;

  // Transfer_MultipleBinder.AddResult (method)
  AddResult(res: Standard_Transient): void;
  AddResult(next: Transfer_Binder): void;

  // Transfer_MultipleBinder.NbResults (method)
  NbResults(): number;

  // Transfer_MultipleBinder.ResultValue (method)
  ResultValue(num: number): Standard_Transient;

  // Transfer_MultipleBinder.MultipleResult (method)
  MultipleResult(): NCollection_HSequence_handle_Standard_Transient;

  // Transfer_MultipleBinder.SetMultipleResult (method)
  SetMultipleResult(mulres: NCollection_HSequence_handle_Standard_Transient): void;

  // Transfer_MultipleBinder.get_type_name (method)
  static get_type_name(): string;

  // Transfer_MultipleBinder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_MultipleBinder.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_MultipleBinder.delete (method)
  delete(): void;

  // Transfer_MultipleBinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_ProcessForFinder: declare class Transfer_ProcessForFinder extends Standard_Transient

  // Transfer_ProcessForFinder.constructor (constructor)
  constructor(nb?: number);

  // Transfer_ProcessForFinder.Clear (method)
  Clear(): void;

  // Transfer_ProcessForFinder.Clean (method)
  Clean(): void;

  // Transfer_ProcessForFinder.Resize (method)
  Resize(nb: number): void;

  // Transfer_ProcessForFinder.SetActor (method)
  SetActor(actor: Transfer_ActorOfProcessForFinder): void;

  // Transfer_ProcessForFinder.Actor (method)
  Actor(): Transfer_ActorOfProcessForFinder;

  // Transfer_ProcessForFinder.Find (method)
  Find(start: Transfer_Finder): Transfer_Binder;

  // Transfer_ProcessForFinder.IsBound (method)
  IsBound(start: Transfer_Finder): boolean;

  // Transfer_ProcessForFinder.IsAlreadyUsed (method)
  IsAlreadyUsed(start: Transfer_Finder): boolean;

  // Transfer_ProcessForFinder.Bind (method)
  Bind(start: Transfer_Finder, binder: Transfer_Binder): void;

  // Transfer_ProcessForFinder.Rebind (method)
  Rebind(start: Transfer_Finder, binder: Transfer_Binder): void;

  // Transfer_ProcessForFinder.Unbind (method)
  Unbind(start: Transfer_Finder): boolean;

  // Transfer_ProcessForFinder.FindElseBind (method)
  FindElseBind(start: Transfer_Finder): Transfer_Binder;

  // Transfer_ProcessForFinder.SetTraceLevel (method)
  SetTraceLevel(tracelev: number): void;

  // Transfer_ProcessForFinder.TraceLevel (method)
  TraceLevel(): number;

  // Transfer_ProcessForFinder.SendFail (method)
  SendFail(start: Transfer_Finder, amsg: Message_Msg): void;

  // Transfer_ProcessForFinder.SendWarning (method)
  SendWarning(start: Transfer_Finder, amsg: Message_Msg): void;

  // Transfer_ProcessForFinder.SendMsg (method)
  SendMsg(start: Transfer_Finder, amsg: Message_Msg): void;

  // Transfer_ProcessForFinder.AddFail (method)
  AddFail(start: Transfer_Finder, mess: string, orig: string): void;
  AddFail(start: Transfer_Finder, amsg: Message_Msg): void;

  // Transfer_ProcessForFinder.AddError (method)
  AddError(start: Transfer_Finder, mess: string, orig?: string): void;

  // Transfer_ProcessForFinder.AddWarning (method)
  AddWarning(start: Transfer_Finder, mess: string, orig: string): void;
  AddWarning(start: Transfer_Finder, amsg: Message_Msg): void;

  // Transfer_ProcessForFinder.Mend (method)
  Mend(start: Transfer_Finder, pref?: string): void;

  // Transfer_ProcessForFinder.Check (method)
  Check(start: Transfer_Finder): Interface_Check;

  // Transfer_ProcessForFinder.BindTransient (method)
  BindTransient(start: Transfer_Finder, res: Standard_Transient): void;

  // Transfer_ProcessForFinder.FindTransient (method)
  FindTransient(start: Transfer_Finder): Standard_Transient;

  // Transfer_ProcessForFinder.BindMultiple (method)
  BindMultiple(start: Transfer_Finder): void;

  // Transfer_ProcessForFinder.AddMultiple (method)
  AddMultiple(start: Transfer_Finder, res: Standard_Transient): void;

  // Transfer_ProcessForFinder.FindTypedTransient (method)
  FindTypedTransient(start: Transfer_Finder, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

  // Transfer_ProcessForFinder.GetTypedTransient (method)
  GetTypedTransient(binder: Transfer_Binder, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

  // Transfer_ProcessForFinder.NbMapped (method)
  NbMapped(): number;

  // Transfer_ProcessForFinder.Mapped (method)
  Mapped(num: number): Transfer_Finder;

  // Transfer_ProcessForFinder.MapIndex (method)
  MapIndex(start: Transfer_Finder): number;

  // Transfer_ProcessForFinder.MapItem (method)
  MapItem(num: number): Transfer_Binder;

  // Transfer_ProcessForFinder.SetRoot (method)
  SetRoot(start: Transfer_Finder): void;

  // Transfer_ProcessForFinder.SetRootManagement (method)
  SetRootManagement(stat: boolean): void;

  // Transfer_ProcessForFinder.NbRoots (method)
  NbRoots(): number;

  // Transfer_ProcessForFinder.Root (method)
  Root(num: number): Transfer_Finder;

  // Transfer_ProcessForFinder.RootItem (method)
  RootItem(num: number): Transfer_Binder;

  // Transfer_ProcessForFinder.RootIndex (method)
  RootIndex(start: Transfer_Finder): number;

  // Transfer_ProcessForFinder.NestingLevel (method)
  NestingLevel(): number;

  // Transfer_ProcessForFinder.ResetNestingLevel (method)
  ResetNestingLevel(): void;

  // Transfer_ProcessForFinder.Recognize (method)
  Recognize(start: Transfer_Finder): boolean;

  // Transfer_ProcessForFinder.Transferring (method)
  Transferring(start: Transfer_Finder, theProgress?: Message_ProgressRange): Transfer_Binder;

  // Transfer_ProcessForFinder.Transfer (method)
  Transfer(start: Transfer_Finder, theProgress?: Message_ProgressRange): boolean;

  // Transfer_ProcessForFinder.SetErrorHandle (method)
  SetErrorHandle(err: boolean): void;

  // Transfer_ProcessForFinder.ErrorHandle (method)
  ErrorHandle(): boolean;

  // Transfer_ProcessForFinder.StartTrace (method)
  StartTrace(binder: Transfer_Binder, start: Transfer_Finder, level: number, mode: number): void;

  // Transfer_ProcessForFinder.IsLooping (method)
  IsLooping(alevel: number): boolean;

  // Transfer_ProcessForFinder.IsCheckListEmpty (method)
  IsCheckListEmpty(start: Transfer_Finder, level: number, erronly: boolean): boolean;

  // Transfer_ProcessForFinder.RemoveResult (method)
  RemoveResult(start: Transfer_Finder, level: number, compute?: boolean): void;

  // Transfer_ProcessForFinder.CheckNum (method)
  CheckNum(start: Transfer_Finder): number;

  // Transfer_ProcessForFinder.get_type_name (method)
  static get_type_name(): string;

  // Transfer_ProcessForFinder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_ProcessForFinder.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_ProcessForFinder.delete (method)
  delete(): void;

  // Transfer_ProcessForFinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_ProcessForTransient: declare class Transfer_ProcessForTransient extends Standard_Transient

  // Transfer_ProcessForTransient.constructor (constructor)
  constructor(nb?: number);

  // Transfer_ProcessForTransient.Clear (method)
  Clear(): void;

  // Transfer_ProcessForTransient.Clean (method)
  Clean(): void;

  // Transfer_ProcessForTransient.Resize (method)
  Resize(nb: number): void;

  // Transfer_ProcessForTransient.SetActor (method)
  SetActor(actor: Transfer_ActorOfProcessForTransient): void;

  // Transfer_ProcessForTransient.Actor (method)
  Actor(): Transfer_ActorOfProcessForTransient;

  // Transfer_ProcessForTransient.Find (method)
  Find(start: Standard_Transient): Transfer_Binder;

  // Transfer_ProcessForTransient.IsBound (method)
  IsBound(start: Standard_Transient): boolean;

  // Transfer_ProcessForTransient.IsAlreadyUsed (method)
  IsAlreadyUsed(start: Standard_Transient): boolean;

  // Transfer_ProcessForTransient.Bind (method)
  Bind(start: Standard_Transient, binder: Transfer_Binder): void;

  // Transfer_ProcessForTransient.Rebind (method)
  Rebind(start: Standard_Transient, binder: Transfer_Binder): void;

  // Transfer_ProcessForTransient.Unbind (method)
  Unbind(start: Standard_Transient): boolean;

  // Transfer_ProcessForTransient.FindElseBind (method)
  FindElseBind(start: Standard_Transient): Transfer_Binder;

  // Transfer_ProcessForTransient.SetTraceLevel (method)
  SetTraceLevel(tracelev: number): void;

  // Transfer_ProcessForTransient.TraceLevel (method)
  TraceLevel(): number;

  // Transfer_ProcessForTransient.SendFail (method)
  SendFail(start: Standard_Transient, amsg: Message_Msg): void;

  // Transfer_ProcessForTransient.SendWarning (method)
  SendWarning(start: Standard_Transient, amsg: Message_Msg): void;

  // Transfer_ProcessForTransient.SendMsg (method)
  SendMsg(start: Standard_Transient, amsg: Message_Msg): void;

  // Transfer_ProcessForTransient.AddFail (method)
  AddFail(start: Standard_Transient, mess: string, orig: string): void;
  AddFail(start: Standard_Transient, amsg: Message_Msg): void;

  // Transfer_ProcessForTransient.AddError (method)
  AddError(start: Standard_Transient, mess: string, orig?: string): void;

  // Transfer_ProcessForTransient.AddWarning (method)
  AddWarning(start: Standard_Transient, mess: string, orig: string): void;
  AddWarning(start: Standard_Transient, amsg: Message_Msg): void;

  // Transfer_ProcessForTransient.Mend (method)
  Mend(start: Standard_Transient, pref?: string): void;

  // Transfer_ProcessForTransient.Check (method)
  Check(start: Standard_Transient): Interface_Check;

  // Transfer_ProcessForTransient.BindTransient (method)
  BindTransient(start: Standard_Transient, res: Standard_Transient): void;

  // Transfer_ProcessForTransient.FindTransient (method)
  FindTransient(start: Standard_Transient): Standard_Transient;

  // Transfer_ProcessForTransient.BindMultiple (method)
  BindMultiple(start: Standard_Transient): void;

  // Transfer_ProcessForTransient.AddMultiple (method)
  AddMultiple(start: Standard_Transient, res: Standard_Transient): void;

  // Transfer_ProcessForTransient.FindTypedTransient (method)
  FindTypedTransient(start: Standard_Transient, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

  // Transfer_ProcessForTransient.GetTypedTransient (method)
  GetTypedTransient(binder: Transfer_Binder, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

  // Transfer_ProcessForTransient.NbMapped (method)
  NbMapped(): number;

  // Transfer_ProcessForTransient.Mapped (method)
  Mapped(num: number): Standard_Transient;

  // Transfer_ProcessForTransient.MapIndex (method)
  MapIndex(start: Standard_Transient): number;

  // Transfer_ProcessForTransient.MapItem (method)
  MapItem(num: number): Transfer_Binder;

  // Transfer_ProcessForTransient.SetRoot (method)
  SetRoot(start: Standard_Transient): void;

  // Transfer_ProcessForTransient.SetRootManagement (method)
  SetRootManagement(stat: boolean): void;

  // Transfer_ProcessForTransient.NbRoots (method)
  NbRoots(): number;

  // Transfer_ProcessForTransient.Root (method)
  Root(num: number): Standard_Transient;

  // Transfer_ProcessForTransient.RootItem (method)
  RootItem(num: number): Transfer_Binder;

  // Transfer_ProcessForTransient.RootIndex (method)
  RootIndex(start: Standard_Transient): number;

  // Transfer_ProcessForTransient.NestingLevel (method)
  NestingLevel(): number;

  // Transfer_ProcessForTransient.ResetNestingLevel (method)
  ResetNestingLevel(): void;

  // Transfer_ProcessForTransient.Recognize (method)
  Recognize(start: Standard_Transient): boolean;

  // Transfer_ProcessForTransient.Transferring (method)
  Transferring(start: Standard_Transient, theProgress?: Message_ProgressRange): Transfer_Binder;

  // Transfer_ProcessForTransient.Transfer (method)
  Transfer(start: Standard_Transient, theProgress?: Message_ProgressRange): boolean;

  // Transfer_ProcessForTransient.SetErrorHandle (method)
  SetErrorHandle(err: boolean): void;

  // Transfer_ProcessForTransient.ErrorHandle (method)
  ErrorHandle(): boolean;

  // Transfer_ProcessForTransient.StartTrace (method)
  StartTrace(binder: Transfer_Binder, start: Standard_Transient, level: number, mode: number): void;

  // Transfer_ProcessForTransient.IsLooping (method)
  IsLooping(alevel: number): boolean;

  // Transfer_ProcessForTransient.IsCheckListEmpty (method)
  IsCheckListEmpty(start: Standard_Transient, level: number, erronly: boolean): boolean;

  // Transfer_ProcessForTransient.RemoveResult (method)
  RemoveResult(start: Standard_Transient, level: number, compute?: boolean): void;

  // Transfer_ProcessForTransient.CheckNum (method)
  CheckNum(start: Standard_Transient): number;

  // Transfer_ProcessForTransient.get_type_name (method)
  static get_type_name(): string;

  // Transfer_ProcessForTransient.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_ProcessForTransient.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_ProcessForTransient.delete (method)
  delete(): void;

  // Transfer_ProcessForTransient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_ResultFromModel: declare class Transfer_ResultFromModel extends Standard_Transient

  // Transfer_ResultFromModel.constructor (constructor)
  constructor();

  // Transfer_ResultFromModel.SetModel (method)
  SetModel(model: Interface_InterfaceModel): void;

  // Transfer_ResultFromModel.SetFileName (method)
  SetFileName(filename: string): void;

  // Transfer_ResultFromModel.Model (method)
  Model(): Interface_InterfaceModel;

  // Transfer_ResultFromModel.FileName (method)
  FileName(): string;

  // Transfer_ResultFromModel.Fill (method)
  Fill(TP: Transfer_TransientProcess, ent: Standard_Transient): boolean;

  // Transfer_ResultFromModel.Strip (method)
  Strip(mode: number): void;

  // Transfer_ResultFromModel.FillBack (method)
  FillBack(TP: Transfer_TransientProcess): void;

  // Transfer_ResultFromModel.HasResult (method)
  HasResult(): boolean;

  // Transfer_ResultFromModel.MainResult (method)
  MainResult(): Transfer_ResultFromTransient;

  // Transfer_ResultFromModel.SetMainResult (method)
  SetMainResult(amain: Transfer_ResultFromTransient): void;

  // Transfer_ResultFromModel.MainLabel (method)
  MainLabel(): string;

  // Transfer_ResultFromModel.MainNumber (method)
  MainNumber(): number;

  // Transfer_ResultFromModel.ResultFromKey (method)
  ResultFromKey(start: Standard_Transient): Transfer_ResultFromTransient;

  // Transfer_ResultFromModel.Results (method)
  Results(level: number): NCollection_HSequence_handle_Standard_Transient;

  // Transfer_ResultFromModel.TransferredList (method)
  TransferredList(level?: number): NCollection_HSequence_handle_Standard_Transient;

  // Transfer_ResultFromModel.CheckedList (method)
  CheckedList(check: Interface_CheckStatus, result: boolean): NCollection_HSequence_handle_Standard_Transient;

  // Transfer_ResultFromModel.CheckStatus (method)
  CheckStatus(): Interface_CheckStatus;

  // Transfer_ResultFromModel.ComputeCheckStatus (method)
  ComputeCheckStatus(enforce: boolean): Interface_CheckStatus;

  // Transfer_ResultFromModel.get_type_name (method)
  static get_type_name(): string;

  // Transfer_ResultFromModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_ResultFromModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_ResultFromModel.delete (method)
  delete(): void;

  // Transfer_ResultFromModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_ResultFromTransient: declare class Transfer_ResultFromTransient extends Standard_Transient

  // Transfer_ResultFromTransient.constructor (constructor)
  constructor();

  // Transfer_ResultFromTransient.SetStart (method)
  SetStart(start: Standard_Transient): void;

  // Transfer_ResultFromTransient.SetBinder (method)
  SetBinder(binder: Transfer_Binder): void;

  // Transfer_ResultFromTransient.Start (method)
  Start(): Standard_Transient;

  // Transfer_ResultFromTransient.Binder (method)
  Binder(): Transfer_Binder;

  // Transfer_ResultFromTransient.HasResult (method)
  HasResult(): boolean;

  // Transfer_ResultFromTransient.Check (method)
  Check(): Interface_Check;

  // Transfer_ResultFromTransient.CheckStatus (method)
  CheckStatus(): Interface_CheckStatus;

  // Transfer_ResultFromTransient.ClearSubs (method)
  ClearSubs(): void;

  // Transfer_ResultFromTransient.AddSubResult (method)
  AddSubResult(sub: Transfer_ResultFromTransient): void;

  // Transfer_ResultFromTransient.NbSubResults (method)
  NbSubResults(): number;

  // Transfer_ResultFromTransient.SubResult (method)
  SubResult(num: number): Transfer_ResultFromTransient;

  // Transfer_ResultFromTransient.ResultFromKey (method)
  ResultFromKey(key: Standard_Transient): Transfer_ResultFromTransient;

  // Transfer_ResultFromTransient.FillMap (method)
  FillMap(map: NCollection_IndexedMap_handle_Standard_Transient): void;

  // Transfer_ResultFromTransient.Fill (method)
  Fill(TP: Transfer_TransientProcess): void;

  // Transfer_ResultFromTransient.Strip (method)
  Strip(): void;

  // Transfer_ResultFromTransient.FillBack (method)
  FillBack(TP: Transfer_TransientProcess): void;

  // Transfer_ResultFromTransient.get_type_name (method)
  static get_type_name(): string;

  // Transfer_ResultFromTransient.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_ResultFromTransient.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_ResultFromTransient.delete (method)
  delete(): void;

  // Transfer_ResultFromTransient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_SimpleBinderOfTransient: declare class Transfer_SimpleBinderOfTransient extends Transfer_Binder

  // Transfer_SimpleBinderOfTransient.constructor (constructor)
  constructor();

  // Transfer_SimpleBinderOfTransient.ResultType (method)
  ResultType(): Standard_Type;

  // Transfer_SimpleBinderOfTransient.ResultTypeName (method)
  ResultTypeName(): string;

  // Transfer_SimpleBinderOfTransient.SetResult (method)
  SetResult(res: Standard_Transient): void;

  // Transfer_SimpleBinderOfTransient.Result (method)
  Result(): Standard_Transient;

  // Transfer_SimpleBinderOfTransient.GetTypedResult (method)
  static GetTypedResult(bnd: Transfer_Binder, atype: Standard_Type): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

  // Transfer_SimpleBinderOfTransient.get_type_name (method)
  static get_type_name(): string;

  // Transfer_SimpleBinderOfTransient.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_SimpleBinderOfTransient.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_SimpleBinderOfTransient.delete (method)
  delete(): void;

  // Transfer_SimpleBinderOfTransient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_StatusExec: typeof Transfer_StatusExec[keyof typeof Transfer_StatusExec]

  readonly Transfer_StatusInitial: 'Transfer_StatusInitial'

  readonly Transfer_StatusRun: 'Transfer_StatusRun'

  readonly Transfer_StatusDone: 'Transfer_StatusDone'

  readonly Transfer_StatusError: 'Transfer_StatusError'

  readonly Transfer_StatusLoop: 'Transfer_StatusLoop'

Transfer_StatusResult: typeof Transfer_StatusResult[keyof typeof Transfer_StatusResult]

  readonly Transfer_StatusVoid: 'Transfer_StatusVoid'

  readonly Transfer_StatusDefined: 'Transfer_StatusDefined'

  readonly Transfer_StatusUsed: 'Transfer_StatusUsed'

Transfer_TransferDeadLoop: declare class Transfer_TransferDeadLoop extends Transfer_TransferFailure

  // Transfer_TransferDeadLoop.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Transfer_TransferDeadLoop.ExceptionType (method)
  ExceptionType(): string;

  // Transfer_TransferDeadLoop.delete (method)
  delete(): void;

  // Transfer_TransferDeadLoop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_TransferDispatch: declare class Transfer_TransferDispatch extends Interface_CopyTool

  // Transfer_TransferDispatch.constructor (constructor)
  constructor(amodel: Interface_InterfaceModel);
  constructor(amodel: Interface_InterfaceModel, lib: Interface_GeneralLib);
  constructor(amodel: Interface_InterfaceModel, protocol: Interface_Protocol);

  // Transfer_TransferDispatch.TransientProcess (method)
  TransientProcess(): Transfer_TransientProcess;

  // Transfer_TransferDispatch.Copy (method)
  Copy(entfrom: Standard_Transient, mapped: boolean, errstat: boolean): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // Transfer_TransferDispatch.delete (method)
  delete(): void;

  // Transfer_TransferDispatch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_TransferFailure: declare class Transfer_TransferFailure extends Interface_InterfaceError

  // Transfer_TransferFailure.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Transfer_TransferFailure.ExceptionType (method)
  ExceptionType(): string;

  // Transfer_TransferFailure.delete (method)
  delete(): void;

  // Transfer_TransferFailure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_TransferInput: declare class Transfer_TransferInput

  // Transfer_TransferInput.constructor (constructor)
  constructor();

  // Transfer_TransferInput.FillModel (method)
  FillModel(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel): void;
  FillModel(proc: Transfer_FinderProcess, amodel: Interface_InterfaceModel): void;
  FillModel(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel, proto: Interface_Protocol, roots: boolean): void;
  FillModel(proc: Transfer_FinderProcess, amodel: Interface_InterfaceModel, proto: Interface_Protocol, roots: boolean): void;

  // Transfer_TransferInput.delete (method)
  delete(): void;

  // Transfer_TransferInput.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
