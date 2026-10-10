# libcascade — Interface

29 top-level symbols. Signatures are verbatim typescript.

Interface_BitMap: declare class Interface_BitMap

  // Interface_BitMap.constructor (constructor)
  constructor();
  constructor(nbitems: number, resflags?: number);
  constructor(other: Interface_BitMap, copied?: boolean);

  // Interface_BitMap.Initialize (method)
  Initialize(nbitems: number, resflags: number): void;
  Initialize(other: Interface_BitMap, copied: boolean): void;

  // Interface_BitMap.Reservate (method)
  Reservate(moreflags: number): void;

  // Interface_BitMap.SetLength (method)
  SetLength(nbitems: number): void;

  // Interface_BitMap.AddFlag (method)
  AddFlag(name?: string): number;

  // Interface_BitMap.AddSomeFlags (method)
  AddSomeFlags(more: number): number;

  // Interface_BitMap.RemoveFlag (method)
  RemoveFlag(num: number): boolean;

  // Interface_BitMap.SetFlagName (method)
  SetFlagName(num: number, name: string): boolean;

  // Interface_BitMap.NbFlags (method)
  NbFlags(): number;

  // Interface_BitMap.Length (method)
  Length(): number;

  // Interface_BitMap.FlagName (method)
  FlagName(num: number): string;

  // Interface_BitMap.FlagNumber (method)
  FlagNumber(name: string): number;

  // Interface_BitMap.Value (method)
  Value(item: number, flag?: number): boolean;

  // Interface_BitMap.SetValue (method)
  SetValue(item: number, val: boolean, flag?: number): void;

  // Interface_BitMap.SetTrue (method)
  SetTrue(item: number, flag?: number): void;

  // Interface_BitMap.SetFalse (method)
  SetFalse(item: number, flag?: number): void;

  // Interface_BitMap.CTrue (method)
  CTrue(item: number, flag?: number): boolean;

  // Interface_BitMap.CFalse (method)
  CFalse(item: number, flag?: number): boolean;

  // Interface_BitMap.Init (method)
  Init(val: boolean, flag?: number): void;

  // Interface_BitMap.Clear (method)
  Clear(): void;

  // Interface_BitMap.delete (method)
  delete(): void;

  // Interface_BitMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_Category: declare class Interface_Category

  // Interface_Category.constructor (constructor)
  constructor();
  constructor(theProtocol: Interface_Protocol);
  constructor(theGTool: Interface_GTool);

  // Interface_Category.SetProtocol (method)
  SetProtocol(theProtocol: Interface_Protocol): void;

  // Interface_Category.CatNum (method)
  CatNum(theEnt: Standard_Transient, theShares: Interface_ShareTool): number;

  // Interface_Category.ClearNums (method)
  ClearNums(): void;

  // Interface_Category.Compute (method)
  Compute(theModel: Interface_InterfaceModel, theShares: Interface_ShareTool): void;

  // Interface_Category.Num (method)
  Num(theNumEnt: number): number;

  // Interface_Category.AddCategory (method)
  static AddCategory(theName: string): number;

  // Interface_Category.NbCategories (method)
  static NbCategories(): number;

  // Interface_Category.Name (method)
  static Name(theNum: number): string;

  // Interface_Category.Number (method)
  static Number(theName: string): number;

  // Interface_Category.Init (method)
  static Init(): void;

  // Interface_Category.delete (method)
  delete(): void;

  // Interface_Category.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_Check: declare class Interface_Check extends Standard_Transient

  // Interface_Check.constructor (constructor)
  constructor();
  constructor(anentity: Standard_Transient);

  // Interface_Check.SendFail (method)
  SendFail(amsg: Message_Msg): void;

  // Interface_Check.AddFail (method)
  AddFail(amess: TCollection_HAsciiString): void;
  AddFail(amsg: Message_Msg): void;
  AddFail(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
  AddFail(amess: string, orig: string): void;

  // Interface_Check.HasFailed (method)
  HasFailed(): boolean;

  // Interface_Check.NbFails (method)
  NbFails(): number;

  // Interface_Check.Fail (method)
  Fail(num: number, final?: boolean): TCollection_HAsciiString;

  // Interface_Check.CFail (method)
  CFail(num: number, final: boolean): string;

  // Interface_Check.Fails (method)
  Fails(final?: boolean): NCollection_HSequence_handle_TCollection_HAsciiString;

  // Interface_Check.SendWarning (method)
  SendWarning(amsg: Message_Msg): void;

  // Interface_Check.AddWarning (method)
  AddWarning(amess: TCollection_HAsciiString): void;
  AddWarning(amsg: Message_Msg): void;
  AddWarning(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
  AddWarning(amess: string, orig: string): void;

  // Interface_Check.HasWarnings (method)
  HasWarnings(): boolean;

  // Interface_Check.NbWarnings (method)
  NbWarnings(): number;

  // Interface_Check.Warning (method)
  Warning(num: number, final?: boolean): TCollection_HAsciiString;

  // Interface_Check.CWarning (method)
  CWarning(num: number, final: boolean): string;

  // Interface_Check.Warnings (method)
  Warnings(final?: boolean): NCollection_HSequence_handle_TCollection_HAsciiString;

  // Interface_Check.SendMsg (method)
  SendMsg(amsg: Message_Msg): void;

  // Interface_Check.NbInfoMsgs (method)
  NbInfoMsgs(): number;

  // Interface_Check.InfoMsg (method)
  InfoMsg(num: number, final?: boolean): TCollection_HAsciiString;

  // Interface_Check.CInfoMsg (method)
  CInfoMsg(num: number, final: boolean): string;

  // Interface_Check.InfoMsgs (method)
  InfoMsgs(final?: boolean): NCollection_HSequence_handle_TCollection_HAsciiString;

  // Interface_Check.Status (method)
  Status(): Interface_CheckStatus;

  // Interface_Check.Complies (method)
  Complies(status: Interface_CheckStatus): boolean;
  Complies(mess: TCollection_HAsciiString, incl: number, status: Interface_CheckStatus): boolean;

  // Interface_Check.HasEntity (method)
  HasEntity(): boolean;

  // Interface_Check.Entity (method)
  Entity(): Standard_Transient;

  // Interface_Check.Clear (method)
  Clear(): void;

  // Interface_Check.ClearFails (method)
  ClearFails(): void;

  // Interface_Check.ClearWarnings (method)
  ClearWarnings(): void;

  // Interface_Check.ClearInfoMsgs (method)
  ClearInfoMsgs(): void;

  // Interface_Check.Remove (method)
  Remove(mess: TCollection_HAsciiString, incl: number, status: Interface_CheckStatus): boolean;

  // Interface_Check.Mend (method)
  Mend(pref: string, num?: number): boolean;

  // Interface_Check.SetEntity (method)
  SetEntity(anentity: Standard_Transient): void;

  // Interface_Check.GetEntity (method)
  GetEntity(anentity: Standard_Transient): void;

  // Interface_Check.GetMessages (method)
  GetMessages(other: Interface_Check): void;

  // Interface_Check.GetAsWarning (method)
  GetAsWarning(other: Interface_Check, failsonly: boolean): void;

  // Interface_Check.Trace (method)
  Trace(level?: number, final?: number): void;

  // Interface_Check.get_type_name (method)
  static get_type_name(): string;

  // Interface_Check.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_Check.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_Check.delete (method)
  delete(): void;

  // Interface_Check.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_CheckFailure: declare class Interface_CheckFailure extends Interface_InterfaceError

  // Interface_CheckFailure.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Interface_CheckFailure.ExceptionType (method)
  ExceptionType(): string;

  // Interface_CheckFailure.delete (method)
  delete(): void;

  // Interface_CheckFailure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_CheckIterator: declare class Interface_CheckIterator

  // Interface_CheckIterator.constructor (constructor)
  constructor();
  constructor(name: string);

  // Interface_CheckIterator.SetName (method)
  SetName(name: string): void;

  // Interface_CheckIterator.Name (method)
  Name(): string;

  // Interface_CheckIterator.SetModel (method)
  SetModel(model: Interface_InterfaceModel): void;

  // Interface_CheckIterator.Model (method)
  Model(): Interface_InterfaceModel;

  // Interface_CheckIterator.Clear (method)
  Clear(): void;

  // Interface_CheckIterator.Add (method)
  Add(ach: Interface_Check, num?: number): void;

  // Interface_CheckIterator.Check (method)
  Check(num: number): Interface_Check;
  Check(ent: Standard_Transient): Interface_Check;

  // Interface_CheckIterator.CCheck (method)
  CCheck(num: number): Interface_Check;
  CCheck(ent: Standard_Transient): Interface_Check;

  // Interface_CheckIterator.IsEmpty (method)
  IsEmpty(failsonly: boolean): boolean;

  // Interface_CheckIterator.Status (method)
  Status(): Interface_CheckStatus;

  // Interface_CheckIterator.Complies (method)
  Complies(status: Interface_CheckStatus): boolean;

  // Interface_CheckIterator.Remove (method)
  Remove(mess: string, incl: number, status: Interface_CheckStatus): boolean;

  // Interface_CheckIterator.Checkeds (method)
  Checkeds(failsonly: boolean, global: boolean): NCollection_HSequence_handle_Standard_Transient;

  // Interface_CheckIterator.Start (method)
  Start(): void;

  // Interface_CheckIterator.More (method)
  More(): boolean;

  // Interface_CheckIterator.Next (method)
  Next(): void;

  // Interface_CheckIterator.Value (method)
  Value(): Interface_Check;

  // Interface_CheckIterator.Number (method)
  Number(): number;

  // Interface_CheckIterator.Destroy (method)
  Destroy(): void;

  // Interface_CheckIterator.delete (method)
  delete(): void;

  // Interface_CheckIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_CheckStatus: typeof Interface_CheckStatus[keyof typeof Interface_CheckStatus]

  readonly Interface_CheckOK: 'Interface_CheckOK'

  readonly Interface_CheckWarning: 'Interface_CheckWarning'

  readonly Interface_CheckFail: 'Interface_CheckFail'

  readonly Interface_CheckAny: 'Interface_CheckAny'

  readonly Interface_CheckMessage: 'Interface_CheckMessage'

  readonly Interface_CheckNoFail: 'Interface_CheckNoFail'

Interface_CheckTool: declare class Interface_CheckTool

  // Interface_CheckTool.constructor (constructor)
  constructor(model: Interface_InterfaceModel);
  constructor(model: Interface_InterfaceModel, protocol: Interface_Protocol);

  // Interface_CheckTool.FillCheck (method)
  FillCheck(ent: Standard_Transient, sh: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // Interface_CheckTool.Check (method)
  Check(num: number): Interface_Check;

  // Interface_CheckTool.CheckSuccess (method)
  CheckSuccess(reset?: boolean): void;

  // Interface_CheckTool.delete (method)
  delete(): void;

  // Interface_CheckTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_CopyControl: declare class Interface_CopyControl extends Standard_Transient

  // Interface_CopyControl.Clear (method)
  Clear(): void;

  // Interface_CopyControl.Bind (method)
  Bind(ent: Standard_Transient, res: Standard_Transient): void;

  // Interface_CopyControl.Search (method)
  Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

  // Interface_CopyControl.get_type_name (method)
  static get_type_name(): string;

  // Interface_CopyControl.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_CopyControl.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_CopyControl.delete (method)
  delete(): void;

  // Interface_CopyControl.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_CopyMap: declare class Interface_CopyMap extends Interface_CopyControl

  // Interface_CopyMap.constructor (constructor)
  constructor(amodel: Interface_InterfaceModel);

  // Interface_CopyMap.Clear (method)
  Clear(): void;

  // Interface_CopyMap.Model (method)
  Model(): Interface_InterfaceModel;

  // Interface_CopyMap.Bind (method)
  Bind(ent: Standard_Transient, res: Standard_Transient): void;

  // Interface_CopyMap.Search (method)
  Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

  // Interface_CopyMap.get_type_name (method)
  static get_type_name(): string;

  // Interface_CopyMap.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_CopyMap.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_CopyMap.delete (method)
  delete(): void;

  // Interface_CopyMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_CopyTool: declare class Interface_CopyTool

  // Interface_CopyTool.constructor (constructor)
  constructor(amodel: Interface_InterfaceModel);
  constructor(amodel: Interface_InterfaceModel, lib: Interface_GeneralLib);
  constructor(amodel: Interface_InterfaceModel, protocol: Interface_Protocol);

  // Interface_CopyTool.Model (method)
  Model(): Interface_InterfaceModel;

  // Interface_CopyTool.SetControl (method)
  SetControl(othermap: Interface_CopyControl): void;

  // Interface_CopyTool.Control (method)
  Control(): Interface_CopyControl;

  // Interface_CopyTool.Clear (method)
  Clear(): void;

  // Interface_CopyTool.Copy (method)
  Copy(entfrom: Standard_Transient, mapped: boolean, errstat: boolean): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // Interface_CopyTool.Transferred (method)
  Transferred(ent: Standard_Transient): Standard_Transient;

  // Interface_CopyTool.Bind (method)
  Bind(ent: Standard_Transient, res: Standard_Transient): void;

  // Interface_CopyTool.Search (method)
  Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

  // Interface_CopyTool.ClearLastFlags (method)
  ClearLastFlags(): void;

  // Interface_CopyTool.LastCopiedAfter (method)
  LastCopiedAfter(numfrom: number): { returnValue: number; ent: Standard_Transient; res: Standard_Transient; [Symbol.dispose](): void };

  // Interface_CopyTool.TransferEntity (method)
  TransferEntity(ent: Standard_Transient): void;

  // Interface_CopyTool.RenewImpliedRefs (method)
  RenewImpliedRefs(): void;

  // Interface_CopyTool.FillModel (method)
  FillModel(bmodel: Interface_InterfaceModel): void;

  // Interface_CopyTool.delete (method)
  delete(): void;

  // Interface_CopyTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_DataState: typeof Interface_DataState[keyof typeof Interface_DataState]

  readonly Interface_StateOK: 'Interface_StateOK'

  readonly Interface_LoadWarning: 'Interface_LoadWarning'

  readonly Interface_LoadFail: 'Interface_LoadFail'

  readonly Interface_DataWarning: 'Interface_DataWarning'

  readonly Interface_DataFail: 'Interface_DataFail'

  readonly Interface_StateUnloaded: 'Interface_StateUnloaded'

  readonly Interface_StateUnknown: 'Interface_StateUnknown'

Interface_EntityCluster: declare class Interface_EntityCluster extends Standard_Transient

  // Interface_EntityCluster.constructor (constructor)
  constructor();
  constructor(ent: Standard_Transient);
  constructor(ec: Interface_EntityCluster);
  constructor(ant: Standard_Transient, ec: Interface_EntityCluster);

  // Interface_EntityCluster.Append (method)
  Append(ent: Standard_Transient): void;

  // Interface_EntityCluster.Remove (method)
  Remove(ent: Standard_Transient): boolean;
  Remove(num: number): boolean;

  // Interface_EntityCluster.NbEntities (method)
  NbEntities(): number;

  // Interface_EntityCluster.Value (method)
  Value(num: number): Standard_Transient;

  // Interface_EntityCluster.SetValue (method)
  SetValue(num: number, ent: Standard_Transient): void;

  // Interface_EntityCluster.get_type_name (method)
  static get_type_name(): string;

  // Interface_EntityCluster.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_EntityCluster.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_EntityCluster.delete (method)
  delete(): void;

  // Interface_EntityCluster.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_EntityIterator: declare class Interface_EntityIterator

  // Interface_EntityIterator.constructor (constructor)
  constructor();
  constructor(list: NCollection_HSequence_handle_Standard_Transient);

  // Interface_EntityIterator.AddList (method)
  AddList(list: NCollection_HSequence_handle_Standard_Transient): void;

  // Interface_EntityIterator.AddItem (method)
  AddItem(anentity: Standard_Transient): void;

  // Interface_EntityIterator.GetOneItem (method)
  GetOneItem(anentity: Standard_Transient): void;

  // Interface_EntityIterator.SelectType (method)
  SelectType(atype: Standard_Type, keep: boolean): void;

  // Interface_EntityIterator.NbEntities (method)
  NbEntities(): number;

  // Interface_EntityIterator.NbTyped (method)
  NbTyped(type_: Standard_Type): number;

  // Interface_EntityIterator.Start (method)
  Start(): void;

  // Interface_EntityIterator.More (method)
  More(): boolean;

  // Interface_EntityIterator.Next (method)
  Next(): void;

  // Interface_EntityIterator.Value (method)
  Value(): Standard_Transient;

  // Interface_EntityIterator.Content (method)
  Content(): NCollection_HSequence_handle_Standard_Transient;

  // Interface_EntityIterator.Destroy (method)
  Destroy(): void;

  // Interface_EntityIterator.delete (method)
  delete(): void;

  // Interface_EntityIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_EntityList: declare class Interface_EntityList

  // Interface_EntityList.constructor (constructor)
  constructor();

  // Interface_EntityList.Clear (method)
  Clear(): void;

  // Interface_EntityList.Append (method)
  Append(ent: Standard_Transient): void;

  // Interface_EntityList.Add (method)
  Add(ent: Standard_Transient): void;

  // Interface_EntityList.Remove (method)
  Remove(ent: Standard_Transient): void;
  Remove(num: number): void;

  // Interface_EntityList.IsEmpty (method)
  IsEmpty(): boolean;

  // Interface_EntityList.NbEntities (method)
  NbEntities(): number;

  // Interface_EntityList.Value (method)
  Value(num: number): Standard_Transient;

  // Interface_EntityList.SetValue (method)
  SetValue(num: number, ent: Standard_Transient): void;

  // Interface_EntityList.NbTypedEntities (method)
  NbTypedEntities(atype: Standard_Type): number;

  // Interface_EntityList.TypedEntity (method)
  TypedEntity(atype: Standard_Type, num?: number): Standard_Transient;

  // Interface_EntityList.delete (method)
  delete(): void;

  // Interface_EntityList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_FileParameter: declare class Interface_FileParameter

  // Interface_FileParameter.constructor (constructor)
  constructor();

  // Interface_FileParameter.Init (method)
  Init(val: TCollection_AsciiString, typ: Interface_ParamType): void;
  Init(val: string, typ: Interface_ParamType): void;

  // Interface_FileParameter.CValue (method)
  CValue(): string;

  // Interface_FileParameter.ParamType (method)
  ParamType(): Interface_ParamType;

  // Interface_FileParameter.SetEntityNumber (method)
  SetEntityNumber(num: number): void;

  // Interface_FileParameter.EntityNumber (method)
  EntityNumber(): number;

  // Interface_FileParameter.Clear (method)
  Clear(): void;

  // Interface_FileParameter.Destroy (method)
  Destroy(): void;

  // Interface_FileParameter.delete (method)
  delete(): void;

  // Interface_FileParameter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_FileReaderTool: declare class Interface_FileReaderTool

  // Interface_FileReaderTool.Protocol (method)
  Protocol(): Interface_Protocol;

  // Interface_FileReaderTool.SetModel (method)
  SetModel(amodel: Interface_InterfaceModel): void;

  // Interface_FileReaderTool.Model (method)
  Model(): Interface_InterfaceModel;

  // Interface_FileReaderTool.SetTraceLevel (method)
  SetTraceLevel(tracelev: number): void;

  // Interface_FileReaderTool.TraceLevel (method)
  TraceLevel(): number;

  // Interface_FileReaderTool.SetErrorHandle (method)
  SetErrorHandle(err: boolean): void;

  // Interface_FileReaderTool.ErrorHandle (method)
  ErrorHandle(): boolean;

  // Interface_FileReaderTool.SetEntities (method)
  SetEntities(): void;

  // Interface_FileReaderTool.Recognize (method)
  Recognize(num: number): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

  // Interface_FileReaderTool.RecognizeByLib (method)
  RecognizeByLib(num: number, glib: Interface_GeneralLib, rlib: Interface_ReaderLib): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

  // Interface_FileReaderTool.UnknownEntity (method)
  UnknownEntity(): Standard_Transient;

  // Interface_FileReaderTool.NewModel (method)
  NewModel(): Interface_InterfaceModel;

  // Interface_FileReaderTool.LoadModel (method)
  LoadModel(amodel: Interface_InterfaceModel): void;

  // Interface_FileReaderTool.LoadedEntity (method)
  LoadedEntity(num: number): Standard_Transient;

  // Interface_FileReaderTool.BeginRead (method)
  BeginRead(amodel: Interface_InterfaceModel): void;

  // Interface_FileReaderTool.AnalyseRecord (method)
  AnalyseRecord(num: number, anent: Standard_Transient): { returnValue: boolean; acheck: Interface_Check; [Symbol.dispose](): void };

  // Interface_FileReaderTool.EndRead (method)
  EndRead(amodel: Interface_InterfaceModel): void;

  // Interface_FileReaderTool.Clear (method)
  Clear(): void;

  // Interface_FileReaderTool.delete (method)
  delete(): void;

  // Interface_FileReaderTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_FloatWriter: declare class Interface_FloatWriter

  // Interface_FloatWriter.constructor (constructor)
  constructor(chars?: number);

  // Interface_FloatWriter.SetFormat (method)
  SetFormat(form: string, reset?: boolean): void;

  // Interface_FloatWriter.SetFormatForRange (method)
  SetFormatForRange(form: string, R1: number, R2: number): void;

  // Interface_FloatWriter.SetZeroSuppress (method)
  SetZeroSuppress(mode: boolean): void;

  // Interface_FloatWriter.SetDefaults (method)
  SetDefaults(chars?: number): void;

  // Interface_FloatWriter.Options (method)
  Options(zerosup?: boolean, range?: boolean, R1?: number, R2?: number): { zerosup: boolean; range: boolean; R1: number; R2: number };

  // Interface_FloatWriter.MainFormat (method)
  MainFormat(): string;

  // Interface_FloatWriter.FormatForRange (method)
  FormatForRange(): string;

  // Interface_FloatWriter.Write (method)
  Write(val: number, text: string): number;

  // Interface_FloatWriter.Convert (method)
  static Convert(val: number, text: string, zerosup: boolean, Range1: number, Range2: number, mainform: string, rangeform: string): number;

  // Interface_FloatWriter.delete (method)
  delete(): void;

  // Interface_FloatWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_GTool: declare class Interface_GTool extends Standard_Transient

  // Interface_GTool.constructor (constructor)
  constructor();
  constructor(proto: Interface_Protocol, nbent?: number);

  // Interface_GTool.SetSignType (method)
  SetSignType(sign: Interface_SignType): void;

  // Interface_GTool.SignType (method)
  SignType(): Interface_SignType;

  // Interface_GTool.SignValue (method)
  SignValue(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // Interface_GTool.SignName (method)
  SignName(): string;

  // Interface_GTool.SetProtocol (method)
  SetProtocol(proto: Interface_Protocol, enforce?: boolean): void;

  // Interface_GTool.Protocol (method)
  Protocol(): Interface_Protocol;

  // Interface_GTool.Lib (method)
  Lib(): Interface_GeneralLib;

  // Interface_GTool.Reservate (method)
  Reservate(nb: number, enforce?: boolean): void;

  // Interface_GTool.ClearEntities (method)
  ClearEntities(): void;

  // Interface_GTool.get_type_name (method)
  static get_type_name(): string;

  // Interface_GTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_GTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_GTool.delete (method)
  delete(): void;

  // Interface_GTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_GeneralLib: declare class Interface_GeneralLib

  // Interface_GeneralLib.constructor (constructor)
  constructor();
  constructor(aprotocol: Interface_Protocol);

  // Interface_GeneralLib.AddProtocol (method)
  AddProtocol(aprotocol: Standard_Transient): void;

  // Interface_GeneralLib.Clear (method)
  Clear(): void;

  // Interface_GeneralLib.SetComplete (method)
  SetComplete(): void;

  // Interface_GeneralLib.Start (method)
  Start(): void;

  // Interface_GeneralLib.More (method)
  More(): boolean;

  // Interface_GeneralLib.Next (method)
  Next(): void;

  // Interface_GeneralLib.Protocol (method)
  Protocol(): Interface_Protocol;

  // Interface_GeneralLib.delete (method)
  delete(): void;

  // Interface_GeneralLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_GlobalNodeOfGeneralLib: declare class Interface_GlobalNodeOfGeneralLib extends Standard_Transient

  // Interface_GlobalNodeOfGeneralLib.constructor (constructor)
  constructor();

  // Interface_GlobalNodeOfGeneralLib.Protocol (method)
  Protocol(): Interface_Protocol;

  // Interface_GlobalNodeOfGeneralLib.Next (method)
  Next(): Interface_GlobalNodeOfGeneralLib;

  // Interface_GlobalNodeOfGeneralLib.get_type_name (method)
  static get_type_name(): string;

  // Interface_GlobalNodeOfGeneralLib.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_GlobalNodeOfGeneralLib.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_GlobalNodeOfGeneralLib.delete (method)
  delete(): void;

  // Interface_GlobalNodeOfGeneralLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_GlobalNodeOfReaderLib: declare class Interface_GlobalNodeOfReaderLib extends Standard_Transient

  // Interface_GlobalNodeOfReaderLib.constructor (constructor)
  constructor();

  // Interface_GlobalNodeOfReaderLib.Add (method)
  Add(amodule: Interface_ReaderModule, aprotocol: Interface_Protocol): void;

  // Interface_GlobalNodeOfReaderLib.Module (method)
  Module(): Interface_ReaderModule;

  // Interface_GlobalNodeOfReaderLib.Protocol (method)
  Protocol(): Interface_Protocol;

  // Interface_GlobalNodeOfReaderLib.Next (method)
  Next(): Interface_GlobalNodeOfReaderLib;

  // Interface_GlobalNodeOfReaderLib.get_type_name (method)
  static get_type_name(): string;

  // Interface_GlobalNodeOfReaderLib.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_GlobalNodeOfReaderLib.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_GlobalNodeOfReaderLib.delete (method)
  delete(): void;

  // Interface_GlobalNodeOfReaderLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_GraphContent: declare class Interface_GraphContent extends Interface_EntityIterator

  // Interface_GraphContent.constructor (constructor)
  constructor();

  // Interface_GraphContent.Begin (method)
  Begin(): void;

  // Interface_GraphContent.Evaluate (method)
  Evaluate(): void;

  // Interface_GraphContent.delete (method)
  delete(): void;

  // Interface_GraphContent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_IntList: declare class Interface_IntList

  // Interface_IntList.constructor (constructor)
  constructor();
  constructor(nbe: number);
  constructor(other: Interface_IntList, copied: boolean);

  // Interface_IntList.Initialize (method)
  Initialize(nbe: number): void;

  // Interface_IntList.NbReferences (method)
  NbReferences(): number;

  // Interface_IntList.Entities (method)
  Entities(): NCollection_HArray1_int;

  // Interface_IntList.References (method)
  References(): NCollection_HArray1_int;

  // DEPRECATED
  // Interface_IntList.Internals (method)
  Internals(nbrefs?: number): { nbrefs: number; ents: NCollection_HArray1_int; refs: NCollection_HArray1_int; [Symbol.dispose](): void };

  // Interface_IntList.NbEntities (method)
  NbEntities(): number;

  // Interface_IntList.SetNbEntities (method)
  SetNbEntities(nbe: number): void;

  // Interface_IntList.SetNumber (method)
  SetNumber(number_: number): void;

  // Interface_IntList.Number (method)
  Number(): number;

  // Interface_IntList.List (method)
  List(number_: number, copied?: boolean): Interface_IntList;

  // Interface_IntList.SetRedefined (method)
  SetRedefined(mode: boolean): void;

  // Interface_IntList.Reservate (method)
  Reservate(count: number): void;

  // Interface_IntList.Add (method)
  Add(ref: number): void;

  // Interface_IntList.Length (method)
  Length(): number;

  // Interface_IntList.IsRedefined (method)
  IsRedefined(num?: number): boolean;

  // Interface_IntList.Value (method)
  Value(num: number): number;

  // Interface_IntList.Remove (method)
  Remove(num: number): boolean;

  // Interface_IntList.Clear (method)
  Clear(): void;

  // Interface_IntList.AdjustSize (method)
  AdjustSize(margin?: number): void;

  // Interface_IntList.delete (method)
  delete(): void;

  // Interface_IntList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_IntVal: declare class Interface_IntVal extends Standard_Transient

  // Interface_IntVal.constructor (constructor)
  constructor();

  // Interface_IntVal.Value (method)
  Value(): number;

  // Interface_IntVal.CValue (method)
  CValue(): number;

  // Interface_IntVal.get_type_name (method)
  static get_type_name(): string;

  // Interface_IntVal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_IntVal.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_IntVal.delete (method)
  delete(): void;

  // Interface_IntVal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_InterfaceError: declare class Interface_InterfaceError extends Standard_Failure

  // Interface_InterfaceError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Interface_InterfaceError.ExceptionType (method)
  ExceptionType(): string;

  // Interface_InterfaceError.delete (method)
  delete(): void;

  // Interface_InterfaceError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_InterfaceMismatch: declare class Interface_InterfaceMismatch extends Interface_InterfaceError

  // Interface_InterfaceMismatch.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Interface_InterfaceMismatch.ExceptionType (method)
  ExceptionType(): string;

  // Interface_InterfaceMismatch.delete (method)
  delete(): void;

  // Interface_InterfaceMismatch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_InterfaceModel: declare class Interface_InterfaceModel extends Standard_Transient

  // Interface_InterfaceModel.Destroy (method)
  Destroy(): void;

  // Interface_InterfaceModel.SetProtocol (method)
  SetProtocol(proto: Interface_Protocol): void;

  // Interface_InterfaceModel.Protocol (method)
  Protocol(): Interface_Protocol;

  // Interface_InterfaceModel.SetGTool (method)
  SetGTool(gtool: Interface_GTool): void;

  // Interface_InterfaceModel.GTool (method)
  GTool(): Interface_GTool;

  // Interface_InterfaceModel.DispatchStatus (method)
  DispatchStatus(): boolean;

  // Interface_InterfaceModel.Clear (method)
  Clear(): void;

  // Interface_InterfaceModel.ClearEntities (method)
  ClearEntities(): void;

  // Interface_InterfaceModel.ClearLabels (method)
  ClearLabels(): void;

  // Interface_InterfaceModel.ClearHeader (method)
  ClearHeader(): void;

  // Interface_InterfaceModel.NbEntities (method)
  NbEntities(): number;

  // Interface_InterfaceModel.Contains (method)
  Contains(anentity: Standard_Transient): boolean;

  // Interface_InterfaceModel.Number (method)
  Number(anentity: Standard_Transient): number;

  // Interface_InterfaceModel.Value (method)
  Value(num: number): Standard_Transient;

  // Interface_InterfaceModel.NbTypes (method)
  NbTypes(ent: Standard_Transient): number;

  // Interface_InterfaceModel.Type (method)
  Type(ent: Standard_Transient, num?: number): Standard_Type;

  // Interface_InterfaceModel.TypeName (method)
  TypeName(ent: Standard_Transient, complete: boolean): string;

  // Interface_InterfaceModel.ClassName (method)
  static ClassName(typnam: string): string;

  // Interface_InterfaceModel.EntityState (method)
  EntityState(num: number): Interface_DataState;

  // Interface_InterfaceModel.IsReportEntity (method)
  IsReportEntity(num: number, semantic?: boolean): boolean;

  // Interface_InterfaceModel.ReportEntity (method)
  ReportEntity(num: number, semantic?: boolean): Interface_ReportEntity;

  // Interface_InterfaceModel.IsErrorEntity (method)
  IsErrorEntity(num: number): boolean;

  // Interface_InterfaceModel.IsRedefinedContent (method)
  IsRedefinedContent(num: number): boolean;

  // Interface_InterfaceModel.ClearReportEntity (method)
  ClearReportEntity(num: number): boolean;

  // Interface_InterfaceModel.SetReportEntity (method)
  SetReportEntity(num: number, rep: Interface_ReportEntity): boolean;

  // Interface_InterfaceModel.AddReportEntity (method)
  AddReportEntity(rep: Interface_ReportEntity, semantic?: boolean): boolean;

  // Interface_InterfaceModel.IsUnknownEntity (method)
  IsUnknownEntity(num: number): boolean;

  // Interface_InterfaceModel.HasSemanticChecks (method)
  HasSemanticChecks(): boolean;

  // Interface_InterfaceModel.Check (method)
  Check(num: number, syntactic: boolean): Interface_Check;

  // Interface_InterfaceModel.Reservate (method)
  Reservate(nbent: number): void;

  // Interface_InterfaceModel.AddEntity (method)
  AddEntity(anentity: Standard_Transient): void;

  // Interface_InterfaceModel.AddWithRefs (method)
  AddWithRefs(anent: Standard_Transient, level: number, listall: boolean): void;
  AddWithRefs(anent: Standard_Transient, proto: Interface_Protocol, level: number, listall: boolean): void;
  AddWithRefs(anent: Standard_Transient, lib: Interface_GeneralLib, level: number, listall: boolean): void;

  // Interface_InterfaceModel.ReplaceEntity (method)
  ReplaceEntity(nument: number, anent: Standard_Transient): void;

  // Interface_InterfaceModel.ReverseOrders (method)
  ReverseOrders(after?: number): void;

  // Interface_InterfaceModel.ChangeOrder (method)
  ChangeOrder(oldnum: number, newnum: number, count?: number): void;

  // Interface_InterfaceModel.GetFromAnother (method)
  GetFromAnother(other: Interface_InterfaceModel): void;

  // Interface_InterfaceModel.NewEmptyModel (method)
  NewEmptyModel(): Interface_InterfaceModel;

  // Interface_InterfaceModel.SetCategoryNumber (method)
  SetCategoryNumber(num: number, val: number): boolean;

  // Interface_InterfaceModel.CategoryNumber (method)
  CategoryNumber(num: number): number;

  // Interface_InterfaceModel.GlobalCheck (method)
  GlobalCheck(syntactic?: boolean): Interface_Check;

  // Interface_InterfaceModel.SetGlobalCheck (method)
  SetGlobalCheck(ach: Interface_Check): void;

  // Interface_InterfaceModel.VerifyCheck (method)
  VerifyCheck(): { ach: Interface_Check; [Symbol.dispose](): void };

  // Interface_InterfaceModel.StringLabel (method)
  StringLabel(ent: Standard_Transient): TCollection_HAsciiString;

  // Interface_InterfaceModel.NextNumberForLabel (method)
  NextNumberForLabel(label: string, lastnum?: number, exact?: boolean): number;

  // Interface_InterfaceModel.HasTemplate (method)
  static HasTemplate(name: string): boolean;

  // Interface_InterfaceModel.Template (method)
  static Template(name: string): Interface_InterfaceModel;

  // Interface_InterfaceModel.SetTemplate (method)
  static SetTemplate(name: string, model: Interface_InterfaceModel): boolean;

  // Interface_InterfaceModel.ListTemplates (method)
  static ListTemplates(): NCollection_HSequence_handle_TCollection_HAsciiString;

  // Interface_InterfaceModel.get_type_name (method)
  static get_type_name(): string;

  // Interface_InterfaceModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_InterfaceModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_InterfaceModel.delete (method)
  delete(): void;

  // Interface_InterfaceModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_LineBuffer: declare class Interface_LineBuffer

  // Interface_LineBuffer.constructor (constructor)
  constructor(size?: number);

  // Interface_LineBuffer.SetMax (method)
  SetMax(max: number): void;

  // Interface_LineBuffer.SetInitial (method)
  SetInitial(initial: number): void;

  // Interface_LineBuffer.SetKeep (method)
  SetKeep(): void;

  // Interface_LineBuffer.CanGet (method)
  CanGet(more: number): boolean;

  // Interface_LineBuffer.Content (method)
  Content(): string;

  // Interface_LineBuffer.Length (method)
  Length(): number;

  // Interface_LineBuffer.Clear (method)
  Clear(): void;

  // Interface_LineBuffer.FreezeInitial (method)
  FreezeInitial(): void;

  // Interface_LineBuffer.Move (method)
  Move(str: TCollection_AsciiString): void;
  Move(str: TCollection_HAsciiString): void;

  // Interface_LineBuffer.Moved (method)
  Moved(): TCollection_HAsciiString;

  // Interface_LineBuffer.Add (method)
  Add(text: string): void;
  Add(text: TCollection_AsciiString): void;
  Add(text: string, lntext: number): void;

  // Interface_LineBuffer.delete (method)
  delete(): void;

  // Interface_LineBuffer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_MSG: declare class Interface_MSG

  // Interface_MSG.constructor (constructor)
  constructor(key: string);
  constructor(key: string, i1: number);
  constructor(key: string, str: string);
  constructor(key: string, i1: number, i2: number);
  constructor(key: string, r1: number, intervals?: number);
  constructor(key: string, ival: number, str: string);

  // Interface_MSG.Destroy (method)
  Destroy(): void;

  // Interface_MSG.Value (method)
  Value(): string;

  // Interface_MSG.Read (method)
  static Read(file: string): number;

  // Interface_MSG.IsKey (method)
  static IsKey(mess: string): boolean;

  // Interface_MSG.Translated (method)
  static Translated(key: string): string;

  // Interface_MSG.Record (method)
  static Record(key: string, item: string): void;

  // Interface_MSG.SetTrace (method)
  static SetTrace(toprint: boolean, torecord: boolean): void;

  // Interface_MSG.SetMode (method)
  static SetMode(running: boolean, raising: boolean): void;

  // Interface_MSG.Intervalled (method)
  static Intervalled(val: number, order?: number, upper?: boolean): number;

  // Interface_MSG.TDate (method)
  static TDate(text: string, yy: number, mm: number, dd: number, hh: number, mn: number, ss: number, format?: string): void;

  // Interface_MSG.NDate (method)
  static NDate(text: string, yy?: number, mm?: number, dd?: number, hh?: number, mn?: number, ss?: number): { returnValue: boolean; yy: number; mm: number; dd: number; hh: number; mn: number; ss: number };

  // Interface_MSG.CDate (method)
  static CDate(text1: string, text2: string): number;

  // Interface_MSG.Blanks (method)
  static Blanks(count: number): string;
  static Blanks(val: number, max: number): string;
  static Blanks(val: string, max: number): string;

  // Interface_MSG.delete (method)
  delete(): void;

  // Interface_MSG.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
