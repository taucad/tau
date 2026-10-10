# libcascade — Transfer (2)

9 top-level symbols. Signatures are verbatim typescript.

Transfer_TransferIterator: declare class Transfer_TransferIterator

  // Transfer_TransferIterator.constructor (constructor)
  constructor();

  // Transfer_TransferIterator.AddItem (method)
  AddItem(atr: Transfer_Binder): void;

  // Transfer_TransferIterator.SelectBinder (method)
  SelectBinder(atype: Standard_Type, keep: boolean): void;

  // Transfer_TransferIterator.SelectResult (method)
  SelectResult(atype: Standard_Type, keep: boolean): void;

  // Transfer_TransferIterator.SelectUnique (method)
  SelectUnique(keep: boolean): void;

  // Transfer_TransferIterator.SelectItem (method)
  SelectItem(num: number, keep: boolean): void;

  // Transfer_TransferIterator.Number (method)
  Number(): number;

  // Transfer_TransferIterator.Start (method)
  Start(): void;

  // Transfer_TransferIterator.More (method)
  More(): boolean;

  // Transfer_TransferIterator.Next (method)
  Next(): void;

  // Transfer_TransferIterator.Value (method)
  Value(): Transfer_Binder;

  // Transfer_TransferIterator.HasResult (method)
  HasResult(): boolean;

  // Transfer_TransferIterator.HasUniqueResult (method)
  HasUniqueResult(): boolean;

  // Transfer_TransferIterator.ResultType (method)
  ResultType(): Standard_Type;

  // Transfer_TransferIterator.HasTransientResult (method)
  HasTransientResult(): boolean;

  // Transfer_TransferIterator.TransientResult (method)
  TransientResult(): Standard_Transient;

  // Transfer_TransferIterator.Status (method)
  Status(): Transfer_StatusExec;

  // Transfer_TransferIterator.HasFails (method)
  HasFails(): boolean;

  // Transfer_TransferIterator.HasWarnings (method)
  HasWarnings(): boolean;

  // Transfer_TransferIterator.Check (method)
  Check(): Interface_Check;

  // Transfer_TransferIterator.delete (method)
  delete(): void;

  // Transfer_TransferIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_TransferOutput: declare class Transfer_TransferOutput

  // Transfer_TransferOutput.constructor (constructor)
  constructor(actor: Transfer_ActorOfTransientProcess, amodel: Interface_InterfaceModel);
  constructor(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel);

  // Transfer_TransferOutput.Model (method)
  Model(): Interface_InterfaceModel;

  // Transfer_TransferOutput.TransientProcess (method)
  TransientProcess(): Transfer_TransientProcess;

  // Transfer_TransferOutput.Transfer (method)
  Transfer(obj: Standard_Transient, theProgress?: Message_ProgressRange): void;

  // Transfer_TransferOutput.TransferRoots (method)
  TransferRoots(protocol: Interface_Protocol, theProgress: Message_ProgressRange): void;
  TransferRoots(theProgress: Message_ProgressRange): void;

  // Transfer_TransferOutput.ModelForStatus (method)
  ModelForStatus(protocol: Interface_Protocol, normal: boolean, roots?: boolean): Interface_InterfaceModel;

  // Transfer_TransferOutput.delete (method)
  delete(): void;

  // Transfer_TransferOutput.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_TransientListBinder: declare class Transfer_TransientListBinder extends Transfer_Binder

  // Transfer_TransientListBinder.constructor (constructor)
  constructor();
  constructor(list: NCollection_HSequence_handle_Standard_Transient);

  // Transfer_TransientListBinder.IsMultiple (method)
  IsMultiple(): boolean;

  // Transfer_TransientListBinder.ResultType (method)
  ResultType(): Standard_Type;

  // Transfer_TransientListBinder.ResultTypeName (method)
  ResultTypeName(): string;

  // Transfer_TransientListBinder.AddResult (method)
  AddResult(res: Standard_Transient): void;
  AddResult(next: Transfer_Binder): void;

  // Transfer_TransientListBinder.Result (method)
  Result(): NCollection_HSequence_handle_Standard_Transient;

  // Transfer_TransientListBinder.SetResult (method)
  SetResult(num: number, res: Standard_Transient): void;

  // Transfer_TransientListBinder.NbTransients (method)
  NbTransients(): number;

  // Transfer_TransientListBinder.Transient (method)
  Transient(num: number): Standard_Transient;

  // Transfer_TransientListBinder.get_type_name (method)
  static get_type_name(): string;

  // Transfer_TransientListBinder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_TransientListBinder.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_TransientListBinder.delete (method)
  delete(): void;

  // Transfer_TransientListBinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_TransientMapper: declare class Transfer_TransientMapper extends Transfer_Finder

  // Transfer_TransientMapper.constructor (constructor)
  constructor(akey: Standard_Transient);

  // Transfer_TransientMapper.Value (method)
  Value(): Standard_Transient;

  // Transfer_TransientMapper.Equates (method)
  Equates(other: Transfer_Finder): boolean;

  // Transfer_TransientMapper.ValueType (method)
  ValueType(): Standard_Type;

  // Transfer_TransientMapper.ValueTypeName (method)
  ValueTypeName(): string;

  // Transfer_TransientMapper.get_type_name (method)
  static get_type_name(): string;

  // Transfer_TransientMapper.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_TransientMapper.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_TransientMapper.delete (method)
  delete(): void;

  // Transfer_TransientMapper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_TransientProcess: declare class Transfer_TransientProcess extends Transfer_ProcessForTransient

  // Transfer_TransientProcess.constructor (constructor)
  constructor(nb?: number);

  // Transfer_TransientProcess.SetModel (method)
  SetModel(model: Interface_InterfaceModel): void;

  // Transfer_TransientProcess.Model (method)
  Model(): Interface_InterfaceModel;

  // Transfer_TransientProcess.HasGraph (method)
  HasGraph(): boolean;

  // Transfer_TransientProcess.SetContext (method)
  SetContext(name: string, ctx: Standard_Transient): void;

  // Transfer_TransientProcess.GetContext (method)
  GetContext(name: string, type_: Standard_Type): { returnValue: boolean; ctx: Standard_Transient; [Symbol.dispose](): void };

  // Transfer_TransientProcess.Context (method)
  Context(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

  // Transfer_TransientProcess.CheckNum (method)
  CheckNum(start: Standard_Transient): number;

  // Transfer_TransientProcess.IsDataLoaded (method)
  IsDataLoaded(ent: Standard_Transient): boolean;

  // Transfer_TransientProcess.IsDataFail (method)
  IsDataFail(ent: Standard_Transient): boolean;

  // Transfer_TransientProcess.RootsForTransfer (method)
  RootsForTransfer(): NCollection_HSequence_handle_Standard_Transient;

  // Transfer_TransientProcess.get_type_name (method)
  static get_type_name(): string;

  // Transfer_TransientProcess.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_TransientProcess.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_TransientProcess.delete (method)
  delete(): void;

  // Transfer_TransientProcess.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_UndefMode: typeof Transfer_UndefMode[keyof typeof Transfer_UndefMode]

  readonly Transfer_UndefIgnore: 'Transfer_UndefIgnore'

  readonly Transfer_UndefFailure: 'Transfer_UndefFailure'

  readonly Transfer_UndefContent: 'Transfer_UndefContent'

  readonly Transfer_UndefUser: 'Transfer_UndefUser'

Transfer_VoidBinder: declare class Transfer_VoidBinder extends Transfer_Binder

  // Transfer_VoidBinder.constructor (constructor)
  constructor();

  // Transfer_VoidBinder.ResultType (method)
  ResultType(): Standard_Type;

  // Transfer_VoidBinder.ResultTypeName (method)
  ResultTypeName(): string;

  // Transfer_VoidBinder.get_type_name (method)
  static get_type_name(): string;

  // Transfer_VoidBinder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Transfer_VoidBinder.DynamicType (method)
  DynamicType(): Standard_Type;

  // Transfer_VoidBinder.delete (method)
  delete(): void;

  // Transfer_VoidBinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Transfer_HSequenceOfFinder: NCollection_HSequence_handle_Transfer_Finder

Transfer_SequenceOfFinder: NCollection_Sequence_handle_Transfer_Finder
