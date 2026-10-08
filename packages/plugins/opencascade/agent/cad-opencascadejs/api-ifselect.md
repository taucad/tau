# libcascade — IFSelect

46 top-level symbols. Signatures are verbatim typescript.

IFSelect: declare class IFSelect

  // IFSelect.constructor (constructor)
  constructor();

  // IFSelect.SaveSession (method)
  static SaveSession(WS: IFSelect_WorkSession, file: string): boolean;

  // IFSelect.RestoreSession (method)
  static RestoreSession(WS: IFSelect_WorkSession, file: string): boolean;

  // IFSelect.delete (method)
  delete(): void;

  // IFSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_Act: declare class IFSelect_Act extends IFSelect_Activator

  // IFSelect_Act.constructor (constructor)
  constructor(name: string, help: string, func: ((arg0: IFSelect_SessionPilot) => IFSelect_ReturnStatus));

  // IFSelect_Act.Do (method)
  Do(number_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

  // IFSelect_Act.Help (method)
  Help(number_: number): string;

  // IFSelect_Act.SetGroup (method)
  static SetGroup(group: string, file?: string): void;

  // IFSelect_Act.AddFunc (method)
  static AddFunc(name: string, help: string, func: ((arg0: IFSelect_SessionPilot) => IFSelect_ReturnStatus)): void;

  // IFSelect_Act.AddFSet (method)
  static AddFSet(name: string, help: string, func: ((arg0: IFSelect_SessionPilot) => IFSelect_ReturnStatus)): void;

  // IFSelect_Act.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_Act.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_Act.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_Act.delete (method)
  delete(): void;

  // IFSelect_Act.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_Activator: declare class IFSelect_Activator extends Standard_Transient

  // IFSelect_Activator.Adding (method)
  static Adding(actor: IFSelect_Activator, number_: number, command: string, mode: number): void;

  // IFSelect_Activator.Add (method)
  Add(number_: number, command: string): void;

  // IFSelect_Activator.AddSet (method)
  AddSet(number_: number, command: string): void;

  // IFSelect_Activator.Remove (method)
  static Remove(command: string): void;

  // IFSelect_Activator.Select (method)
  static Select(command: string, number_?: number): { returnValue: boolean; number_: number; actor: IFSelect_Activator; [Symbol.dispose](): void };

  // IFSelect_Activator.Mode (method)
  static Mode(command: string): number;

  // IFSelect_Activator.Commands (method)
  static Commands(mode?: number, command?: string): NCollection_HSequence_TCollection_AsciiString;

  // IFSelect_Activator.Do (method)
  Do(number_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

  // IFSelect_Activator.Help (method)
  Help(number_: number): string;

  // IFSelect_Activator.Group (method)
  Group(): string;

  // IFSelect_Activator.File (method)
  File(): string;

  // IFSelect_Activator.SetForGroup (method)
  SetForGroup(group: string, file?: string): void;

  // IFSelect_Activator.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_Activator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_Activator.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_Activator.delete (method)
  delete(): void;

  // IFSelect_Activator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_AppliedModifiers: declare class IFSelect_AppliedModifiers extends Standard_Transient

  // IFSelect_AppliedModifiers.constructor (constructor)
  constructor(nbmax: number, nbent: number);

  // IFSelect_AppliedModifiers.AddModif (method)
  AddModif(modif: IFSelect_GeneralModifier): boolean;

  // IFSelect_AppliedModifiers.AddNum (method)
  AddNum(nument: number): boolean;

  // IFSelect_AppliedModifiers.Count (method)
  Count(): number;

  // IFSelect_AppliedModifiers.Item (method)
  Item(num: number, entcount?: number): { returnValue: boolean; modif: IFSelect_GeneralModifier; entcount: number; [Symbol.dispose](): void };

  // IFSelect_AppliedModifiers.ItemNum (method)
  ItemNum(nument: number): number;

  // IFSelect_AppliedModifiers.ItemList (method)
  ItemList(): NCollection_HSequence_int;

  // IFSelect_AppliedModifiers.IsForAll (method)
  IsForAll(): boolean;

  // IFSelect_AppliedModifiers.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_AppliedModifiers.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_AppliedModifiers.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_AppliedModifiers.delete (method)
  delete(): void;

  // IFSelect_AppliedModifiers.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_BasicDumper: declare class IFSelect_BasicDumper extends IFSelect_SessionDumper

  // IFSelect_BasicDumper.constructor (constructor)
  constructor();

  // IFSelect_BasicDumper.WriteOwn (method)
  WriteOwn(file: IFSelect_SessionFile, item: Standard_Transient): boolean;

  // IFSelect_BasicDumper.ReadOwn (method)
  ReadOwn(file: IFSelect_SessionFile, type_: TCollection_AsciiString): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

  // IFSelect_BasicDumper.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_BasicDumper.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_BasicDumper.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_BasicDumper.delete (method)
  delete(): void;

  // IFSelect_BasicDumper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_CheckCounter: declare class IFSelect_CheckCounter extends IFSelect_SignatureList

  // IFSelect_CheckCounter.constructor (constructor)
  constructor(withlist?: boolean);

  // IFSelect_CheckCounter.SetSignature (method)
  SetSignature(sign: MoniTool_SignText): void;

  // IFSelect_CheckCounter.Signature (method)
  Signature(): MoniTool_SignText;

  // IFSelect_CheckCounter.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_CheckCounter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_CheckCounter.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_CheckCounter.delete (method)
  delete(): void;

  // IFSelect_CheckCounter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_ContextWrite: declare class IFSelect_ContextWrite

  // IFSelect_ContextWrite.constructor (constructor)
  constructor(model: Interface_InterfaceModel, proto: Interface_Protocol, applieds: IFSelect_AppliedModifiers, filename: string);

  // IFSelect_ContextWrite.Model (method)
  Model(): Interface_InterfaceModel;

  // IFSelect_ContextWrite.Protocol (method)
  Protocol(): Interface_Protocol;

  // IFSelect_ContextWrite.FileName (method)
  FileName(): string;

  // IFSelect_ContextWrite.AppliedModifiers (method)
  AppliedModifiers(): IFSelect_AppliedModifiers;

  // IFSelect_ContextWrite.NbModifiers (method)
  NbModifiers(): number;

  // IFSelect_ContextWrite.SetModifier (method)
  SetModifier(numod: number): boolean;

  // IFSelect_ContextWrite.FileModifier (method)
  FileModifier(): IFSelect_GeneralModifier;

  // IFSelect_ContextWrite.IsForNone (method)
  IsForNone(): boolean;

  // IFSelect_ContextWrite.IsForAll (method)
  IsForAll(): boolean;

  // IFSelect_ContextWrite.NbEntities (method)
  NbEntities(): number;

  // IFSelect_ContextWrite.Start (method)
  Start(): void;

  // IFSelect_ContextWrite.More (method)
  More(): boolean;

  // IFSelect_ContextWrite.Next (method)
  Next(): void;

  // IFSelect_ContextWrite.Value (method)
  Value(): Standard_Transient;

  // IFSelect_ContextWrite.AddCheck (method)
  AddCheck(check: Interface_Check): void;

  // IFSelect_ContextWrite.AddWarning (method)
  AddWarning(start: Standard_Transient, mess: string, orig?: string): void;

  // IFSelect_ContextWrite.AddFail (method)
  AddFail(start: Standard_Transient, mess: string, orig?: string): void;

  // IFSelect_ContextWrite.CCheck (method)
  CCheck(num: number): Interface_Check;
  CCheck(start: Standard_Transient): Interface_Check;

  // IFSelect_ContextWrite.delete (method)
  delete(): void;

  // IFSelect_ContextWrite.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_DispGlobal: declare class IFSelect_DispGlobal extends IFSelect_Dispatch

  // IFSelect_DispGlobal.constructor (constructor)
  constructor();

  // IFSelect_DispGlobal.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_DispGlobal.LimitedMax (method)
  LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

  // IFSelect_DispGlobal.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_DispGlobal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_DispGlobal.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_DispGlobal.delete (method)
  delete(): void;

  // IFSelect_DispGlobal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_DispPerCount: declare class IFSelect_DispPerCount extends IFSelect_Dispatch

  // IFSelect_DispPerCount.constructor (constructor)
  constructor();

  // IFSelect_DispPerCount.CountValue (method)
  CountValue(): number;

  // IFSelect_DispPerCount.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_DispPerCount.LimitedMax (method)
  LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

  // IFSelect_DispPerCount.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_DispPerCount.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_DispPerCount.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_DispPerCount.delete (method)
  delete(): void;

  // IFSelect_DispPerCount.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_DispPerFiles: declare class IFSelect_DispPerFiles extends IFSelect_Dispatch

  // IFSelect_DispPerFiles.constructor (constructor)
  constructor();

  // IFSelect_DispPerFiles.CountValue (method)
  CountValue(): number;

  // IFSelect_DispPerFiles.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_DispPerFiles.LimitedMax (method)
  LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

  // IFSelect_DispPerFiles.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_DispPerFiles.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_DispPerFiles.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_DispPerFiles.delete (method)
  delete(): void;

  // IFSelect_DispPerFiles.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_DispPerOne: declare class IFSelect_DispPerOne extends IFSelect_Dispatch

  // IFSelect_DispPerOne.constructor (constructor)
  constructor();

  // IFSelect_DispPerOne.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_DispPerOne.LimitedMax (method)
  LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

  // IFSelect_DispPerOne.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_DispPerOne.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_DispPerOne.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_DispPerOne.delete (method)
  delete(): void;

  // IFSelect_DispPerOne.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_DispPerSignature: declare class IFSelect_DispPerSignature extends IFSelect_Dispatch

  // IFSelect_DispPerSignature.constructor (constructor)
  constructor();

  // IFSelect_DispPerSignature.SignCounter (method)
  SignCounter(): IFSelect_SignCounter;

  // IFSelect_DispPerSignature.SetSignCounter (method)
  SetSignCounter(sign: IFSelect_SignCounter): void;

  // IFSelect_DispPerSignature.SignName (method)
  SignName(): string;

  // IFSelect_DispPerSignature.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_DispPerSignature.LimitedMax (method)
  LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

  // IFSelect_DispPerSignature.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_DispPerSignature.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_DispPerSignature.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_DispPerSignature.delete (method)
  delete(): void;

  // IFSelect_DispPerSignature.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_Dispatch: declare class IFSelect_Dispatch extends Standard_Transient

  // IFSelect_Dispatch.SetRootName (method)
  SetRootName(name: TCollection_HAsciiString): void;

  // IFSelect_Dispatch.HasRootName (method)
  HasRootName(): boolean;

  // IFSelect_Dispatch.RootName (method)
  RootName(): TCollection_HAsciiString;

  // IFSelect_Dispatch.SetFinalSelection (method)
  SetFinalSelection(sel: IFSelect_Selection): void;

  // IFSelect_Dispatch.FinalSelection (method)
  FinalSelection(): IFSelect_Selection;

  // IFSelect_Dispatch.CanHaveRemainder (method)
  CanHaveRemainder(): boolean;

  // IFSelect_Dispatch.LimitedMax (method)
  LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

  // IFSelect_Dispatch.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_Dispatch.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_Dispatch.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_Dispatch.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_Dispatch.delete (method)
  delete(): void;

  // IFSelect_Dispatch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_EditValue: typeof IFSelect_EditValue[keyof typeof IFSelect_EditValue]

  readonly IFSelect_Optional: 'IFSelect_Optional'

  readonly IFSelect_Editable: 'IFSelect_Editable'

  readonly IFSelect_EditProtected: 'IFSelect_EditProtected'

  readonly IFSelect_EditComputed: 'IFSelect_EditComputed'

  readonly IFSelect_EditRead: 'IFSelect_EditRead'

  readonly IFSelect_EditDynamic: 'IFSelect_EditDynamic'

IFSelect_Editor: declare class IFSelect_Editor extends Standard_Transient

  // IFSelect_Editor.SetValue (method)
  SetValue(num: number, typval: Interface_TypedValue, shortname?: string, accessmode?: IFSelect_EditValue): void;

  // IFSelect_Editor.SetList (method)
  SetList(num: number, max?: number): void;

  // IFSelect_Editor.NbValues (method)
  NbValues(): number;

  // IFSelect_Editor.TypedValue (method)
  TypedValue(num: number): Interface_TypedValue;

  // IFSelect_Editor.IsList (method)
  IsList(num: number): boolean;

  // IFSelect_Editor.MaxList (method)
  MaxList(num: number): number;

  // IFSelect_Editor.Name (method)
  Name(num: number, isshort: boolean): string;

  // IFSelect_Editor.EditMode (method)
  EditMode(num: number): IFSelect_EditValue;

  // IFSelect_Editor.NameNumber (method)
  NameNumber(name: string): number;

  // IFSelect_Editor.MaxNameLength (method)
  MaxNameLength(what: number): number;

  // IFSelect_Editor.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_Editor.ListEditor (method)
  ListEditor(num: number): IFSelect_ListEditor;

  // IFSelect_Editor.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_Editor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_Editor.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_Editor.delete (method)
  delete(): void;

  // IFSelect_Editor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_Functions: declare class IFSelect_Functions

  // IFSelect_Functions.constructor (constructor)
  constructor();

  // IFSelect_Functions.GiveEntity (method)
  static GiveEntity(WS: IFSelect_WorkSession, name?: string): Standard_Transient;

  // IFSelect_Functions.GiveEntityNumber (method)
  static GiveEntityNumber(WS: IFSelect_WorkSession, name?: string): number;

  // IFSelect_Functions.GiveList (method)
  static GiveList(WS: IFSelect_WorkSession, first?: string, second?: string): NCollection_HSequence_handle_Standard_Transient;

  // IFSelect_Functions.GiveDispatch (method)
  static GiveDispatch(WS: IFSelect_WorkSession, name: string, mode?: boolean): IFSelect_Dispatch;

  // IFSelect_Functions.Init (method)
  static Init(): void;

  // IFSelect_Functions.delete (method)
  delete(): void;

  // IFSelect_Functions.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_GeneralModifier: declare class IFSelect_GeneralModifier extends Standard_Transient

  // IFSelect_GeneralModifier.MayChangeGraph (method)
  MayChangeGraph(): boolean;

  // IFSelect_GeneralModifier.SetDispatch (method)
  SetDispatch(disp: IFSelect_Dispatch): void;

  // IFSelect_GeneralModifier.Dispatch (method)
  Dispatch(): IFSelect_Dispatch;

  // IFSelect_GeneralModifier.Applies (method)
  Applies(disp: IFSelect_Dispatch): boolean;

  // IFSelect_GeneralModifier.SetSelection (method)
  SetSelection(sel: IFSelect_Selection): void;

  // IFSelect_GeneralModifier.ResetSelection (method)
  ResetSelection(): void;

  // IFSelect_GeneralModifier.HasSelection (method)
  HasSelection(): boolean;

  // IFSelect_GeneralModifier.Selection (method)
  Selection(): IFSelect_Selection;

  // IFSelect_GeneralModifier.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_GeneralModifier.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_GeneralModifier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_GeneralModifier.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_GeneralModifier.delete (method)
  delete(): void;

  // IFSelect_GeneralModifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_GraphCounter: declare class IFSelect_GraphCounter extends IFSelect_SignCounter

  // IFSelect_GraphCounter.constructor (constructor)
  constructor(withmap?: boolean, withlist?: boolean);

  // IFSelect_GraphCounter.Applied (method)
  Applied(): IFSelect_SelectDeduct;

  // IFSelect_GraphCounter.SetApplied (method)
  SetApplied(sel: IFSelect_SelectDeduct): void;

  // IFSelect_GraphCounter.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_GraphCounter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_GraphCounter.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_GraphCounter.delete (method)
  delete(): void;

  // IFSelect_GraphCounter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_ListEditor: declare class IFSelect_ListEditor extends Standard_Transient

  // IFSelect_ListEditor.constructor (constructor)
  constructor();
  constructor(def: Interface_TypedValue, max?: number);

  // IFSelect_ListEditor.LoadModel (method)
  LoadModel(model: Interface_InterfaceModel): void;

  // IFSelect_ListEditor.LoadValues (method)
  LoadValues(vals: NCollection_HSequence_handle_TCollection_HAsciiString): void;

  // IFSelect_ListEditor.SetTouched (method)
  SetTouched(): void;

  // IFSelect_ListEditor.ClearEdit (method)
  ClearEdit(): void;

  // IFSelect_ListEditor.LoadEdited (method)
  LoadEdited(list: NCollection_HSequence_handle_TCollection_HAsciiString): boolean;

  // IFSelect_ListEditor.SetValue (method)
  SetValue(num: number, val: TCollection_HAsciiString): boolean;

  // IFSelect_ListEditor.AddValue (method)
  AddValue(val: TCollection_HAsciiString, atnum?: number): boolean;

  // IFSelect_ListEditor.Remove (method)
  Remove(num?: number, howmany?: number): boolean;

  // IFSelect_ListEditor.OriginalValues (method)
  OriginalValues(): NCollection_HSequence_handle_TCollection_HAsciiString;

  // IFSelect_ListEditor.EditedValues (method)
  EditedValues(): NCollection_HSequence_handle_TCollection_HAsciiString;

  // IFSelect_ListEditor.NbValues (method)
  NbValues(edited?: boolean): number;

  // IFSelect_ListEditor.Value (method)
  Value(num: number, edited?: boolean): TCollection_HAsciiString;

  // IFSelect_ListEditor.IsChanged (method)
  IsChanged(num: number): boolean;

  // IFSelect_ListEditor.IsModified (method)
  IsModified(num: number): boolean;

  // IFSelect_ListEditor.IsAdded (method)
  IsAdded(num: number): boolean;

  // IFSelect_ListEditor.IsTouched (method)
  IsTouched(): boolean;

  // IFSelect_ListEditor.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_ListEditor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_ListEditor.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_ListEditor.delete (method)
  delete(): void;

  // IFSelect_ListEditor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_ModelCopier: declare class IFSelect_ModelCopier extends Standard_Transient

  // IFSelect_ModelCopier.constructor (constructor)
  constructor();

  // IFSelect_ModelCopier.SetShareOut (method)
  SetShareOut(sho: IFSelect_ShareOut): void;

  // IFSelect_ModelCopier.ClearResult (method)
  ClearResult(): void;

  // IFSelect_ModelCopier.AddFile (method)
  AddFile(filename: TCollection_AsciiString, content: Interface_InterfaceModel): boolean;

  // IFSelect_ModelCopier.NameFile (method)
  NameFile(num: number, filename: TCollection_AsciiString): boolean;

  // IFSelect_ModelCopier.ClearFile (method)
  ClearFile(num: number): boolean;

  // IFSelect_ModelCopier.SetAppliedModifiers (method)
  SetAppliedModifiers(num: number, applied: IFSelect_AppliedModifiers): boolean;

  // IFSelect_ModelCopier.ClearAppliedModifiers (method)
  ClearAppliedModifiers(num: number): boolean;

  // IFSelect_ModelCopier.NbFiles (method)
  NbFiles(): number;

  // IFSelect_ModelCopier.FileName (method)
  FileName(num: number): TCollection_AsciiString;

  // IFSelect_ModelCopier.FileModel (method)
  FileModel(num: number): Interface_InterfaceModel;

  // IFSelect_ModelCopier.AppliedModifiers (method)
  AppliedModifiers(num: number): IFSelect_AppliedModifiers;

  // IFSelect_ModelCopier.BeginSentFiles (method)
  BeginSentFiles(sho: IFSelect_ShareOut, record: boolean): void;

  // IFSelect_ModelCopier.AddSentFile (method)
  AddSentFile(filename: string): void;

  // IFSelect_ModelCopier.SentFiles (method)
  SentFiles(): NCollection_HSequence_handle_TCollection_HAsciiString;

  // IFSelect_ModelCopier.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_ModelCopier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_ModelCopier.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_ModelCopier.delete (method)
  delete(): void;

  // IFSelect_ModelCopier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_ModifEditForm: declare class IFSelect_ModifEditForm extends IFSelect_Modifier

  // IFSelect_ModifEditForm.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_ModifEditForm.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_ModifEditForm.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_ModifEditForm.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_ModifEditForm.delete (method)
  delete(): void;

  // IFSelect_ModifEditForm.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_ModifReorder: declare class IFSelect_ModifReorder extends IFSelect_Modifier

  // IFSelect_ModifReorder.constructor (constructor)
  constructor(rootlast?: boolean);

  // IFSelect_ModifReorder.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_ModifReorder.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_ModifReorder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_ModifReorder.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_ModifReorder.delete (method)
  delete(): void;

  // IFSelect_ModifReorder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_Modifier: declare class IFSelect_Modifier extends IFSelect_GeneralModifier

  // IFSelect_Modifier.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_Modifier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_Modifier.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_Modifier.delete (method)
  delete(): void;

  // IFSelect_Modifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_PacketList: declare class IFSelect_PacketList extends Standard_Transient

  // IFSelect_PacketList.constructor (constructor)
  constructor(model: Interface_InterfaceModel);

  // IFSelect_PacketList.SetName (method)
  SetName(name: string): void;

  // IFSelect_PacketList.Name (method)
  Name(): string;

  // IFSelect_PacketList.Model (method)
  Model(): Interface_InterfaceModel;

  // IFSelect_PacketList.AddPacket (method)
  AddPacket(): void;

  // IFSelect_PacketList.Add (method)
  Add(ent: Standard_Transient): void;

  // IFSelect_PacketList.AddList (method)
  AddList(list: NCollection_HSequence_handle_Standard_Transient): void;

  // IFSelect_PacketList.NbPackets (method)
  NbPackets(): number;

  // IFSelect_PacketList.NbEntities (method)
  NbEntities(numpack: number): number;

  // IFSelect_PacketList.HighestDuplicationCount (method)
  HighestDuplicationCount(): number;

  // IFSelect_PacketList.NbDuplicated (method)
  NbDuplicated(count: number, andmore: boolean): number;

  // IFSelect_PacketList.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_PacketList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_PacketList.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_PacketList.delete (method)
  delete(): void;

  // IFSelect_PacketList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_ParamEditor: declare class IFSelect_ParamEditor extends IFSelect_Editor

  // IFSelect_ParamEditor.constructor (constructor)
  constructor(nbmax?: number, label?: string);

  // IFSelect_ParamEditor.AddValue (method)
  AddValue(val: Interface_TypedValue, shortname?: string): void;

  // IFSelect_ParamEditor.AddConstantText (method)
  AddConstantText(val: string, shortname: string, completename?: string): void;

  // IFSelect_ParamEditor.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_ParamEditor.StaticEditor (method)
  static StaticEditor(list: NCollection_HSequence_handle_TCollection_HAsciiString, label?: string): IFSelect_ParamEditor;

  // IFSelect_ParamEditor.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_ParamEditor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_ParamEditor.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_ParamEditor.delete (method)
  delete(): void;

  // IFSelect_ParamEditor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_PrintCount: typeof IFSelect_PrintCount[keyof typeof IFSelect_PrintCount]

  readonly IFSelect_ItemsByEntity: 'IFSelect_ItemsByEntity'

  readonly IFSelect_CountByItem: 'IFSelect_CountByItem'

  readonly IFSelect_ShortByItem: 'IFSelect_ShortByItem'

  readonly IFSelect_ListByItem: 'IFSelect_ListByItem'

  readonly IFSelect_EntitiesByItem: 'IFSelect_EntitiesByItem'

  readonly IFSelect_CountSummary: 'IFSelect_CountSummary'

  readonly IFSelect_GeneralInfo: 'IFSelect_GeneralInfo'

  readonly IFSelect_Mapping: 'IFSelect_Mapping'

  readonly IFSelect_ResultCount: 'IFSelect_ResultCount'

IFSelect_PrintFail: typeof IFSelect_PrintFail[keyof typeof IFSelect_PrintFail]

  readonly IFSelect_FailOnly: 'IFSelect_FailOnly'

  readonly IFSelect_FailAndWarn: 'IFSelect_FailAndWarn'

IFSelect_RemainMode: typeof IFSelect_RemainMode[keyof typeof IFSelect_RemainMode]

  readonly IFSelect_RemainForget: 'IFSelect_RemainForget'

  readonly IFSelect_RemainCompute: 'IFSelect_RemainCompute'

  readonly IFSelect_RemainDisplay: 'IFSelect_RemainDisplay'

  readonly IFSelect_RemainUndo: 'IFSelect_RemainUndo'

IFSelect_ReturnStatus: typeof IFSelect_ReturnStatus[keyof typeof IFSelect_ReturnStatus]

  readonly IFSelect_RetVoid: 'IFSelect_RetVoid'

  readonly IFSelect_RetDone: 'IFSelect_RetDone'

  readonly IFSelect_RetError: 'IFSelect_RetError'

  readonly IFSelect_RetFail: 'IFSelect_RetFail'

  readonly IFSelect_RetStop: 'IFSelect_RetStop'

IFSelect_SelectAnyList: declare class IFSelect_SelectAnyList extends IFSelect_SelectDeduct

  // IFSelect_SelectAnyList.NbItems (method)
  NbItems(ent: Standard_Transient): number;

  // IFSelect_SelectAnyList.HasLower (method)
  HasLower(): boolean;

  // IFSelect_SelectAnyList.LowerValue (method)
  LowerValue(): number;

  // IFSelect_SelectAnyList.HasUpper (method)
  HasUpper(): boolean;

  // IFSelect_SelectAnyList.UpperValue (method)
  UpperValue(): number;

  // IFSelect_SelectAnyList.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectAnyList.ListLabel (method)
  ListLabel(): TCollection_AsciiString;

  // IFSelect_SelectAnyList.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectAnyList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectAnyList.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectAnyList.delete (method)
  delete(): void;

  // IFSelect_SelectAnyList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectAnyType: declare class IFSelect_SelectAnyType extends IFSelect_SelectExtract

  // IFSelect_SelectAnyType.TypeForMatch (method)
  TypeForMatch(): Standard_Type;

  // IFSelect_SelectAnyType.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SelectAnyType.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectAnyType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectAnyType.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectAnyType.delete (method)
  delete(): void;

  // IFSelect_SelectAnyType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectBase: declare class IFSelect_SelectBase extends IFSelect_Selection

  // IFSelect_SelectBase.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectBase.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectBase.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectBase.delete (method)
  delete(): void;

  // IFSelect_SelectBase.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectCombine: declare class IFSelect_SelectCombine extends IFSelect_Selection

  // IFSelect_SelectCombine.NbInputs (method)
  NbInputs(): number;

  // IFSelect_SelectCombine.Input (method)
  Input(num: number): IFSelect_Selection;

  // IFSelect_SelectCombine.InputRank (method)
  InputRank(sel: IFSelect_Selection): number;

  // IFSelect_SelectCombine.Add (method)
  Add(sel: IFSelect_Selection, atnum?: number): void;

  // IFSelect_SelectCombine.Remove (method)
  Remove(sel: IFSelect_Selection): boolean;
  Remove(num: number): boolean;

  // IFSelect_SelectCombine.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectCombine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectCombine.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectCombine.delete (method)
  delete(): void;

  // IFSelect_SelectCombine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectControl: declare class IFSelect_SelectControl extends IFSelect_Selection

  // IFSelect_SelectControl.MainInput (method)
  MainInput(): IFSelect_Selection;

  // IFSelect_SelectControl.HasSecondInput (method)
  HasSecondInput(): boolean;

  // IFSelect_SelectControl.SecondInput (method)
  SecondInput(): IFSelect_Selection;

  // IFSelect_SelectControl.SetMainInput (method)
  SetMainInput(sel: IFSelect_Selection): void;

  // IFSelect_SelectControl.SetSecondInput (method)
  SetSecondInput(sel: IFSelect_Selection): void;

  // IFSelect_SelectControl.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectControl.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectControl.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectControl.delete (method)
  delete(): void;

  // IFSelect_SelectControl.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectDeduct: declare class IFSelect_SelectDeduct extends IFSelect_Selection

  // IFSelect_SelectDeduct.SetInput (method)
  SetInput(sel: IFSelect_Selection): void;

  // IFSelect_SelectDeduct.Input (method)
  Input(): IFSelect_Selection;

  // IFSelect_SelectDeduct.HasInput (method)
  HasInput(): boolean;

  // IFSelect_SelectDeduct.HasAlternate (method)
  HasAlternate(): boolean;

  // IFSelect_SelectDeduct.Alternate (method)
  Alternate(): IFSelect_SelectPointed;

  // IFSelect_SelectDeduct.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectDeduct.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectDeduct.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectDeduct.delete (method)
  delete(): void;

  // IFSelect_SelectDeduct.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectDiff: declare class IFSelect_SelectDiff extends IFSelect_SelectControl

  // IFSelect_SelectDiff.constructor (constructor)
  constructor();

  // IFSelect_SelectDiff.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectDiff.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectDiff.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectDiff.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectDiff.delete (method)
  delete(): void;

  // IFSelect_SelectDiff.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectEntityNumber: declare class IFSelect_SelectEntityNumber extends IFSelect_SelectBase

  // IFSelect_SelectEntityNumber.constructor (constructor)
  constructor();

  // IFSelect_SelectEntityNumber.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectEntityNumber.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectEntityNumber.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectEntityNumber.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectEntityNumber.delete (method)
  delete(): void;

  // IFSelect_SelectEntityNumber.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectErrorEntities: declare class IFSelect_SelectErrorEntities extends IFSelect_SelectExtract

  // IFSelect_SelectErrorEntities.constructor (constructor)
  constructor();

  // IFSelect_SelectErrorEntities.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SelectErrorEntities.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IFSelect_SelectErrorEntities.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectErrorEntities.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectErrorEntities.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectErrorEntities.delete (method)
  delete(): void;

  // IFSelect_SelectErrorEntities.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectExplore: declare class IFSelect_SelectExplore extends IFSelect_SelectDeduct

  // IFSelect_SelectExplore.Level (method)
  Level(): number;

  // IFSelect_SelectExplore.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectExplore.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // IFSelect_SelectExplore.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectExplore.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectExplore.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectExplore.delete (method)
  delete(): void;

  // IFSelect_SelectExplore.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectExtract: declare class IFSelect_SelectExtract extends IFSelect_SelectDeduct

  // IFSelect_SelectExtract.IsDirect (method)
  IsDirect(): boolean;

  // IFSelect_SelectExtract.SetDirect (method)
  SetDirect(direct: boolean): void;

  // IFSelect_SelectExtract.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SelectExtract.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectExtract.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IFSelect_SelectExtract.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectExtract.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectExtract.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectExtract.delete (method)
  delete(): void;

  // IFSelect_SelectExtract.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectFlag: declare class IFSelect_SelectFlag extends IFSelect_SelectExtract

  // IFSelect_SelectFlag.constructor (constructor)
  constructor(flagname: string);

  // IFSelect_SelectFlag.FlagName (method)
  FlagName(): string;

  // IFSelect_SelectFlag.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SelectFlag.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IFSelect_SelectFlag.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectFlag.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectFlag.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectFlag.delete (method)
  delete(): void;

  // IFSelect_SelectFlag.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectInList: declare class IFSelect_SelectInList extends IFSelect_SelectAnyList

  // IFSelect_SelectInList.ListedEntity (method)
  ListedEntity(num: number, ent: Standard_Transient): Standard_Transient;

  // IFSelect_SelectInList.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectInList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectInList.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectInList.delete (method)
  delete(): void;

  // IFSelect_SelectInList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectIncorrectEntities: declare class IFSelect_SelectIncorrectEntities extends IFSelect_SelectFlag

  // IFSelect_SelectIncorrectEntities.constructor (constructor)
  constructor();

  // IFSelect_SelectIncorrectEntities.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectIncorrectEntities.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectIncorrectEntities.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectIncorrectEntities.delete (method)
  delete(): void;

  // IFSelect_SelectIncorrectEntities.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectIntersection: declare class IFSelect_SelectIntersection extends IFSelect_SelectCombine

  // IFSelect_SelectIntersection.constructor (constructor)
  constructor();

  // IFSelect_SelectIntersection.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectIntersection.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectIntersection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectIntersection.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectIntersection.delete (method)
  delete(): void;

  // IFSelect_SelectIntersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectModelEntities: declare class IFSelect_SelectModelEntities extends IFSelect_SelectBase

  // IFSelect_SelectModelEntities.constructor (constructor)
  constructor();

  // IFSelect_SelectModelEntities.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectModelEntities.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectModelEntities.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectModelEntities.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectModelEntities.delete (method)
  delete(): void;

  // IFSelect_SelectModelEntities.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectModelRoots: declare class IFSelect_SelectModelRoots extends IFSelect_SelectBase

  // IFSelect_SelectModelRoots.constructor (constructor)
  constructor();

  // IFSelect_SelectModelRoots.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectModelRoots.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectModelRoots.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectModelRoots.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectModelRoots.delete (method)
  delete(): void;

  // IFSelect_SelectModelRoots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
