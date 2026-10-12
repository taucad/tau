# libcascade — TFunction

11 top-level symbols. Signatures are verbatim typescript.

TFunction_Driver: declare class TFunction_Driver extends Standard_Transient

  // TFunction_Driver.Init (method)
  Init(L: TDF_Label): void;

  // TFunction_Driver.Label (method)
  Label(): TDF_Label;

  // TFunction_Driver.Validate (method)
  Validate(log: TFunction_Logbook): void;

  // TFunction_Driver.MustExecute (method)
  MustExecute(log: TFunction_Logbook): boolean;

  // TFunction_Driver.Execute (method)
  Execute(): { returnValue: number; log: TFunction_Logbook; [Symbol.dispose](): void };

  // TFunction_Driver.Arguments (method)
  Arguments(args: NCollection_List_TDF_Label): void;

  // TFunction_Driver.Results (method)
  Results(res: NCollection_List_TDF_Label): void;

  // TFunction_Driver.get_type_name (method)
  static get_type_name(): string;

  // TFunction_Driver.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TFunction_Driver.DynamicType (method)
  DynamicType(): Standard_Type;

  // TFunction_Driver.delete (method)
  delete(): void;

  // TFunction_Driver.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TFunction_DriverTable: declare class TFunction_DriverTable extends Standard_Transient

  // TFunction_DriverTable.constructor (constructor)
  constructor();

  // TFunction_DriverTable.Get (method)
  static Get(): TFunction_DriverTable;

  // TFunction_DriverTable.AddDriver (method)
  AddDriver(guid: Standard_GUID, driver: TFunction_Driver, thread?: number): boolean;

  // TFunction_DriverTable.HasDriver (method)
  HasDriver(guid: Standard_GUID, thread?: number): boolean;

  // TFunction_DriverTable.FindDriver (method)
  FindDriver(guid: Standard_GUID, thread: number): { returnValue: boolean; driver: TFunction_Driver; [Symbol.dispose](): void };

  // TFunction_DriverTable.RemoveDriver (method)
  RemoveDriver(guid: Standard_GUID, thread?: number): boolean;

  // TFunction_DriverTable.Clear (method)
  Clear(): void;

  // TFunction_DriverTable.get_type_name (method)
  static get_type_name(): string;

  // TFunction_DriverTable.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TFunction_DriverTable.DynamicType (method)
  DynamicType(): Standard_Type;

  // TFunction_DriverTable.delete (method)
  delete(): void;

  // TFunction_DriverTable.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TFunction_ExecutionStatus: typeof TFunction_ExecutionStatus[keyof typeof TFunction_ExecutionStatus]

  readonly TFunction_ES_WrongDefinition: 'TFunction_ES_WrongDefinition'

  readonly TFunction_ES_NotExecuted: 'TFunction_ES_NotExecuted'

  readonly TFunction_ES_Executing: 'TFunction_ES_Executing'

  readonly TFunction_ES_Succeeded: 'TFunction_ES_Succeeded'

  readonly TFunction_ES_Failed: 'TFunction_ES_Failed'

TFunction_Function: declare class TFunction_Function extends TDF_Attribute

  // TFunction_Function.constructor (constructor)
  constructor();

  // TFunction_Function.Set (method)
  static Set(L: TDF_Label): TFunction_Function;
  static Set(L: TDF_Label, DriverID: Standard_GUID): TFunction_Function;

  // TFunction_Function.GetID (method)
  static GetID(): Standard_GUID;

  // TFunction_Function.GetDriverGUID (method)
  GetDriverGUID(): Standard_GUID;

  // TFunction_Function.SetDriverGUID (method)
  SetDriverGUID(guid: Standard_GUID): void;

  // TFunction_Function.Failed (method)
  Failed(): boolean;

  // TFunction_Function.SetFailure (method)
  SetFailure(mode?: number): void;

  // TFunction_Function.GetFailure (method)
  GetFailure(): number;

  // TFunction_Function.ID (method)
  ID(): Standard_GUID;

  // TFunction_Function.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TFunction_Function.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TFunction_Function.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TFunction_Function.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TFunction_Function.get_type_name (method)
  static get_type_name(): string;

  // TFunction_Function.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TFunction_Function.DynamicType (method)
  DynamicType(): Standard_Type;

  // TFunction_Function.delete (method)
  delete(): void;

  // TFunction_Function.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TFunction_GraphNode: declare class TFunction_GraphNode extends TDF_Attribute

  // TFunction_GraphNode.constructor (constructor)
  constructor();

  // TFunction_GraphNode.Set (method)
  static Set(L: TDF_Label): TFunction_GraphNode;

  // TFunction_GraphNode.GetID (method)
  static GetID(): Standard_GUID;

  // TFunction_GraphNode.AddPrevious (method)
  AddPrevious(funcID: number): boolean;
  AddPrevious(func: TDF_Label): boolean;

  // TFunction_GraphNode.RemovePrevious (method)
  RemovePrevious(funcID: number): boolean;
  RemovePrevious(func: TDF_Label): boolean;

  // TFunction_GraphNode.GetPrevious (method)
  GetPrevious(): NCollection_Map_int;

  // TFunction_GraphNode.RemoveAllPrevious (method)
  RemoveAllPrevious(): void;

  // TFunction_GraphNode.AddNext (method)
  AddNext(funcID: number): boolean;
  AddNext(func: TDF_Label): boolean;

  // TFunction_GraphNode.RemoveNext (method)
  RemoveNext(funcID: number): boolean;
  RemoveNext(func: TDF_Label): boolean;

  // TFunction_GraphNode.GetNext (method)
  GetNext(): NCollection_Map_int;

  // TFunction_GraphNode.RemoveAllNext (method)
  RemoveAllNext(): void;

  // TFunction_GraphNode.GetStatus (method)
  GetStatus(): TFunction_ExecutionStatus;

  // TFunction_GraphNode.SetStatus (method)
  SetStatus(status: TFunction_ExecutionStatus): void;

  // TFunction_GraphNode.ID (method)
  ID(): Standard_GUID;

  // TFunction_GraphNode.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TFunction_GraphNode.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TFunction_GraphNode.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TFunction_GraphNode.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TFunction_GraphNode.get_type_name (method)
  static get_type_name(): string;

  // TFunction_GraphNode.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TFunction_GraphNode.DynamicType (method)
  DynamicType(): Standard_Type;

  // TFunction_GraphNode.delete (method)
  delete(): void;

  // TFunction_GraphNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TFunction_IFunction: declare class TFunction_IFunction

  // TFunction_IFunction.constructor (constructor)
  constructor();
  constructor(L: TDF_Label);

  // TFunction_IFunction.NewFunction (method)
  static NewFunction(L: TDF_Label, ID: Standard_GUID): boolean;

  // TFunction_IFunction.DeleteFunction (method)
  static DeleteFunction(L: TDF_Label): boolean;

  // TFunction_IFunction.UpdateDependencies (method)
  static UpdateDependencies(Access: TDF_Label): boolean;
  UpdateDependencies(): boolean;

  // TFunction_IFunction.Init (method)
  Init(L: TDF_Label): void;

  // TFunction_IFunction.Label (method)
  Label(): TDF_Label;

  // TFunction_IFunction.Arguments (method)
  Arguments(args: NCollection_List_TDF_Label): void;

  // TFunction_IFunction.Results (method)
  Results(res: NCollection_List_TDF_Label): void;

  // TFunction_IFunction.GetPrevious (method)
  GetPrevious(prev: NCollection_List_TDF_Label): void;

  // TFunction_IFunction.GetNext (method)
  GetNext(prev: NCollection_List_TDF_Label): void;

  // TFunction_IFunction.GetStatus (method)
  GetStatus(): TFunction_ExecutionStatus;

  // TFunction_IFunction.SetStatus (method)
  SetStatus(status: TFunction_ExecutionStatus): void;

  // TFunction_IFunction.GetAllFunctions (method)
  GetAllFunctions(): NCollection_DoubleMap_int_TDF_Label;

  // TFunction_IFunction.GetLogbook (method)
  GetLogbook(): TFunction_Logbook;

  // TFunction_IFunction.GetDriver (method)
  GetDriver(thread?: number): TFunction_Driver;

  // TFunction_IFunction.GetGraphNode (method)
  GetGraphNode(): TFunction_GraphNode;

  // TFunction_IFunction.delete (method)
  delete(): void;

  // TFunction_IFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TFunction_Iterator: declare class TFunction_Iterator

  // TFunction_Iterator.constructor (constructor)
  constructor();
  constructor(Access: TDF_Label);

  // TFunction_Iterator.Init (method)
  Init(Access: TDF_Label): void;

  // TFunction_Iterator.SetUsageOfExecutionStatus (method)
  SetUsageOfExecutionStatus(usage: boolean): void;

  // TFunction_Iterator.GetUsageOfExecutionStatus (method)
  GetUsageOfExecutionStatus(): boolean;

  // TFunction_Iterator.GetMaxNbThreads (method)
  GetMaxNbThreads(): number;

  // TFunction_Iterator.Current (method)
  Current(): NCollection_List_TDF_Label;

  // TFunction_Iterator.More (method)
  More(): boolean;

  // TFunction_Iterator.Next (method)
  Next(): void;

  // TFunction_Iterator.GetStatus (method)
  GetStatus(func: TDF_Label): TFunction_ExecutionStatus;

  // TFunction_Iterator.SetStatus (method)
  SetStatus(func: TDF_Label, status: TFunction_ExecutionStatus): void;

  // TFunction_Iterator.delete (method)
  delete(): void;

  // TFunction_Iterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TFunction_Logbook: declare class TFunction_Logbook extends TDF_Attribute

  // TFunction_Logbook.constructor (constructor)
  constructor();

  // TFunction_Logbook.Set (method)
  static Set(Access: TDF_Label): TFunction_Logbook;

  // TFunction_Logbook.GetID (method)
  static GetID(): Standard_GUID;

  // TFunction_Logbook.Clear (method)
  Clear(): void;

  // TFunction_Logbook.IsEmpty (method)
  IsEmpty(): boolean;

  // TFunction_Logbook.SetTouched (method)
  SetTouched(L: TDF_Label): void;

  // TFunction_Logbook.SetImpacted (method)
  SetImpacted(L: TDF_Label, WithChildren?: boolean): void;

  // TFunction_Logbook.SetValid (method)
  SetValid(L: TDF_Label, WithChildren: boolean): void;
  SetValid(Ls: NCollection_Map_TDF_Label): void;

  // TFunction_Logbook.IsModified (method)
  IsModified(L: TDF_Label, WithChildren?: boolean): boolean;

  // TFunction_Logbook.GetTouched (method)
  GetTouched(): NCollection_Map_TDF_Label;

  // TFunction_Logbook.GetImpacted (method)
  GetImpacted(): NCollection_Map_TDF_Label;

  // TFunction_Logbook.GetValid (method)
  GetValid(): NCollection_Map_TDF_Label;
  GetValid(Ls: NCollection_Map_TDF_Label): void;

  // TFunction_Logbook.Done (method)
  Done(status: boolean): void;

  // TFunction_Logbook.IsDone (method)
  IsDone(): boolean;

  // TFunction_Logbook.ID (method)
  ID(): Standard_GUID;

  // TFunction_Logbook.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TFunction_Logbook.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TFunction_Logbook.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TFunction_Logbook.get_type_name (method)
  static get_type_name(): string;

  // TFunction_Logbook.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TFunction_Logbook.DynamicType (method)
  DynamicType(): Standard_Type;

  // TFunction_Logbook.delete (method)
  delete(): void;

  // TFunction_Logbook.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TFunction_Scope: declare class TFunction_Scope extends TDF_Attribute

  // TFunction_Scope.constructor (constructor)
  constructor();

  // TFunction_Scope.Set (method)
  static Set(Access: TDF_Label): TFunction_Scope;

  // TFunction_Scope.GetID (method)
  static GetID(): Standard_GUID;

  // TFunction_Scope.AddFunction (method)
  AddFunction(L: TDF_Label): boolean;

  // TFunction_Scope.RemoveFunction (method)
  RemoveFunction(L: TDF_Label): boolean;
  RemoveFunction(ID: number): boolean;

  // TFunction_Scope.RemoveAllFunctions (method)
  RemoveAllFunctions(): void;

  // TFunction_Scope.HasFunction (method)
  HasFunction(ID: number): boolean;
  HasFunction(L: TDF_Label): boolean;

  // TFunction_Scope.GetFunction (method)
  GetFunction(L: TDF_Label): number;
  GetFunction(ID: number): TDF_Label;

  // TFunction_Scope.GetLogbook (method)
  GetLogbook(): TFunction_Logbook;

  // TFunction_Scope.ID (method)
  ID(): Standard_GUID;

  // TFunction_Scope.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TFunction_Scope.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TFunction_Scope.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TFunction_Scope.GetFunctions (method)
  GetFunctions(): NCollection_DoubleMap_int_TDF_Label;

  // TFunction_Scope.ChangeFunctions (method)
  ChangeFunctions(): NCollection_DoubleMap_int_TDF_Label;

  // TFunction_Scope.SetFreeID (method)
  SetFreeID(ID: number): void;

  // TFunction_Scope.GetFreeID (method)
  GetFreeID(): number;

  // TFunction_Scope.get_type_name (method)
  static get_type_name(): string;

  // TFunction_Scope.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TFunction_Scope.DynamicType (method)
  DynamicType(): Standard_Type;

  // TFunction_Scope.delete (method)
  delete(): void;

  // TFunction_Scope.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TFunction_Array1OfDataMapOfGUIDDriver: NCollection_Array1_int

TFunction_HArray1OfDataMapOfGUIDDriver: NCollection_HArray1_int
