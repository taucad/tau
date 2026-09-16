# libcascade — Interface

28 top-level symbols. Signatures are verbatim typescript.

Interface_BitMap: declare class Interface_BitMap

  constructor

  Initialize(nbitems: number, resflags: number): void;
  Initialize(other: Interface_BitMap, copied: boolean): void;
  Initialize(nbitems: number, resflags: number): void;
  Initialize(other: Interface_BitMap, copied: boolean): void;

  Reservate(moreflags: number): void;

  SetLength(nbitems: number): void;

  AddFlag(name?: string): number;

  AddSomeFlags(more: number): number;

  RemoveFlag(num: number): boolean;

  SetFlagName(num: number, name: string): boolean;

  NbFlags(): number;

  Length(): number;

  FlagName(num: number): string;

  FlagNumber(name: string): number;

  Value(item: number, flag?: number): boolean;

  SetValue(item: number, val: boolean, flag?: number): void;

  SetTrue(item: number, flag?: number): void;

  SetFalse(item: number, flag?: number): void;

  CTrue(item: number, flag?: number): boolean;

  CFalse(item: number, flag?: number): boolean;

  Init(val: boolean, flag?: number): void;

  Clear(): void;

  delete(): void;

  [Symbol.dispose](): void;

Interface_Category: declare class Interface_Category

  constructor

  SetProtocol(theProtocol: Interface_Protocol): void;

  CatNum(theEnt: Standard_Transient, theShares: Interface_ShareTool): number;

  ClearNums(): void;

  Compute(theModel: Interface_InterfaceModel, theShares: Interface_ShareTool): void;

  Num(theNumEnt: number): number;

  static AddCategory(theName: string): number;

  static NbCategories(): number;

  static Name(theNum: number): string;

  static Number(theName: string): number;

  static Init(): void;

  delete(): void;

  [Symbol.dispose](): void;

Interface_Check: declare class Interface_Check extends Standard_Transient

  constructor

  SendFail(amsg: Message_Msg): void;

  AddFail(amess: TCollection_HAsciiString): void;
  AddFail(amsg: Message_Msg): void;
  AddFail(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
  AddFail(amess: string, orig: string): void;
  AddFail(amess: TCollection_HAsciiString): void;
  AddFail(amsg: Message_Msg): void;
  AddFail(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
  AddFail(amess: string, orig: string): void;
  AddFail(amess: TCollection_HAsciiString): void;
  AddFail(amsg: Message_Msg): void;
  AddFail(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
  AddFail(amess: string, orig: string): void;
  AddFail(amess: TCollection_HAsciiString): void;
  AddFail(amsg: Message_Msg): void;
  AddFail(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
  AddFail(amess: string, orig: string): void;

  HasFailed(): boolean;

  NbFails(): number;

  Fail(num: number, final?: boolean): TCollection_HAsciiString;

  CFail(num: number, final: boolean): string;

  Fails(final?: boolean): NCollection_HSequence_handle_TCollection_HAsciiString;

  SendWarning(amsg: Message_Msg): void;

  AddWarning(amess: TCollection_HAsciiString): void;
  AddWarning(amsg: Message_Msg): void;
  AddWarning(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
  AddWarning(amess: string, orig: string): void;
  AddWarning(amess: TCollection_HAsciiString): void;
  AddWarning(amsg: Message_Msg): void;
  AddWarning(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
  AddWarning(amess: string, orig: string): void;
  AddWarning(amess: TCollection_HAsciiString): void;
  AddWarning(amsg: Message_Msg): void;
  AddWarning(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
  AddWarning(amess: string, orig: string): void;
  AddWarning(amess: TCollection_HAsciiString): void;
  AddWarning(amsg: Message_Msg): void;
  AddWarning(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
  AddWarning(amess: string, orig: string): void;

  HasWarnings(): boolean;

  NbWarnings(): number;

  Warning(num: number, final?: boolean): TCollection_HAsciiString;

  CWarning(num: number, final: boolean): string;

  Warnings(final?: boolean): NCollection_HSequence_handle_TCollection_HAsciiString;

  SendMsg(amsg: Message_Msg): void;

  NbInfoMsgs(): number;

  InfoMsg(num: number, final?: boolean): TCollection_HAsciiString;

  CInfoMsg(num: number, final: boolean): string;

  InfoMsgs(final?: boolean): NCollection_HSequence_handle_TCollection_HAsciiString;

  Status(): Interface_CheckStatus;

  Complies(status: Interface_CheckStatus): boolean;
  Complies(mess: TCollection_HAsciiString, incl: number, status: Interface_CheckStatus): boolean;
  Complies(status: Interface_CheckStatus): boolean;
  Complies(mess: TCollection_HAsciiString, incl: number, status: Interface_CheckStatus): boolean;

  HasEntity(): boolean;

  Entity(): Standard_Transient;

  Clear(): void;

  ClearFails(): void;

  ClearWarnings(): void;

  ClearInfoMsgs(): void;

  Remove(mess: TCollection_HAsciiString, incl: number, status: Interface_CheckStatus): boolean;

  Mend(pref: string, num?: number): boolean;

  SetEntity(anentity: Standard_Transient): void;

  GetEntity(anentity: Standard_Transient): void;

  GetMessages(other: Interface_Check): void;

  GetAsWarning(other: Interface_Check, failsonly: boolean): void;

  Trace(level?: number, final?: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Interface_CheckFailure: declare class Interface_CheckFailure extends Interface_InterfaceError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Interface_CheckIterator: declare class Interface_CheckIterator

  constructor

  SetName(name: string): void;

  Name(): string;

  SetModel(model: Interface_InterfaceModel): void;

  Model(): Interface_InterfaceModel;

  Clear(): void;

  Add(ach: Interface_Check, num?: number): void;

  Check(num: number): Interface_Check;
  Check(ent: Standard_Transient): Interface_Check;
  Check(num: number): Interface_Check;
  Check(ent: Standard_Transient): Interface_Check;

  CCheck(num: number): Interface_Check;
  CCheck(ent: Standard_Transient): Interface_Check;
  CCheck(num: number): Interface_Check;
  CCheck(ent: Standard_Transient): Interface_Check;

  IsEmpty(failsonly: boolean): boolean;

  Status(): Interface_CheckStatus;

  Complies(status: Interface_CheckStatus): boolean;

  Remove(mess: string, incl: number, status: Interface_CheckStatus): boolean;

  Checkeds(failsonly: boolean, global: boolean): NCollection_HSequence_handle_Standard_Transient;

  Start(): void;

  More(): boolean;

  Next(): void;

  Value(): Interface_Check;

  Number(): number;

  Destroy(): void;

  delete(): void;

  [Symbol.dispose](): void;

Interface_CheckStatus: typeof Interface_CheckStatus[keyof typeof Interface_CheckStatus]

Interface_CheckTool: declare class Interface_CheckTool

  constructor

  FillCheck(ent: Standard_Transient, sh: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  Check(num: number): Interface_Check;

  CheckSuccess(reset?: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

Interface_CopyControl: declare class Interface_CopyControl extends Standard_Transient

  Clear(): void;

  Bind(ent: Standard_Transient, res: Standard_Transient): void;

  Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Interface_CopyMap: declare class Interface_CopyMap extends Interface_CopyControl

  constructor

  Clear(): void;

  Model(): Interface_InterfaceModel;

  Bind(ent: Standard_Transient, res: Standard_Transient): void;

  Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Interface_CopyTool: declare class Interface_CopyTool

  constructor

  Model(): Interface_InterfaceModel;

  SetControl(othermap: Interface_CopyControl): void;

  Control(): Interface_CopyControl;

  Clear(): void;

  Copy(entfrom: Standard_Transient, mapped: boolean, errstat: boolean): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  Transferred(ent: Standard_Transient): Standard_Transient;

  Bind(ent: Standard_Transient, res: Standard_Transient): void;

  Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

  ClearLastFlags(): void;

  LastCopiedAfter(numfrom: number): { returnValue: number; ent: Standard_Transient; res: Standard_Transient; [Symbol.dispose](): void };

  TransferEntity(ent: Standard_Transient): void;

  RenewImpliedRefs(): void;

  FillModel(bmodel: Interface_InterfaceModel): void;

  delete(): void;

  [Symbol.dispose](): void;

Interface_DataState: typeof Interface_DataState[keyof typeof Interface_DataState]

Interface_EntityCluster: declare class Interface_EntityCluster extends Standard_Transient

  constructor

  Append(ent: Standard_Transient): void;

  Remove(ent: Standard_Transient): boolean;
  Remove(num: number): boolean;
  Remove(ent: Standard_Transient): boolean;
  Remove(num: number): boolean;

  NbEntities(): number;

  Value(num: number): Standard_Transient;

  SetValue(num: number, ent: Standard_Transient): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Interface_EntityIterator: declare class Interface_EntityIterator

  constructor

  AddList(list: NCollection_HSequence_handle_Standard_Transient): void;

  AddItem(anentity: Standard_Transient): void;

  GetOneItem(anentity: Standard_Transient): void;

  SelectType(atype: Standard_Type, keep: boolean): void;

  NbEntities(): number;

  NbTyped(type_: Standard_Type): number;

  Start(): void;

  More(): boolean;

  Next(): void;

  Value(): Standard_Transient;

  Content(): NCollection_HSequence_handle_Standard_Transient;

  Destroy(): void;

  delete(): void;

  [Symbol.dispose](): void;

Interface_EntityList: declare class Interface_EntityList

  constructor

  Clear(): void;

  Append(ent: Standard_Transient): void;

  Add(ent: Standard_Transient): void;

  Remove(ent: Standard_Transient): void;
  Remove(num: number): void;
  Remove(ent: Standard_Transient): void;
  Remove(num: number): void;

  IsEmpty(): boolean;

  NbEntities(): number;

  Value(num: number): Standard_Transient;

  SetValue(num: number, ent: Standard_Transient): void;

  NbTypedEntities(atype: Standard_Type): number;

  TypedEntity(atype: Standard_Type, num?: number): Standard_Transient;

  delete(): void;

  [Symbol.dispose](): void;

Interface_FileParameter: declare class Interface_FileParameter

  constructor

  Init(val: TCollection_AsciiString, typ: Interface_ParamType): void;
  Init(val: string, typ: Interface_ParamType): void;
  Init(val: TCollection_AsciiString, typ: Interface_ParamType): void;
  Init(val: string, typ: Interface_ParamType): void;

  CValue(): string;

  ParamType(): Interface_ParamType;

  SetEntityNumber(num: number): void;

  EntityNumber(): number;

  Clear(): void;

  Destroy(): void;

  delete(): void;

  [Symbol.dispose](): void;

Interface_FileReaderTool: declare class Interface_FileReaderTool

  Protocol(): Interface_Protocol;

  SetModel(amodel: Interface_InterfaceModel): void;

  Model(): Interface_InterfaceModel;

  SetTraceLevel(tracelev: number): void;

  TraceLevel(): number;

  SetErrorHandle(err: boolean): void;

  ErrorHandle(): boolean;

  SetEntities(): void;

  Recognize(num: number): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

  RecognizeByLib(num: number, glib: Interface_GeneralLib, rlib: Interface_ReaderLib): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

  UnknownEntity(): Standard_Transient;

  NewModel(): Interface_InterfaceModel;

  LoadModel(amodel: Interface_InterfaceModel): void;

  LoadedEntity(num: number): Standard_Transient;

  BeginRead(amodel: Interface_InterfaceModel): void;

  AnalyseRecord(num: number, anent: Standard_Transient): { returnValue: boolean; acheck: Interface_Check; [Symbol.dispose](): void };

  EndRead(amodel: Interface_InterfaceModel): void;

  Clear(): void;

  delete(): void;

  [Symbol.dispose](): void;

Interface_FloatWriter: declare class Interface_FloatWriter

  constructor

  SetFormat(form: string, reset?: boolean): void;

  SetFormatForRange(form: string, R1: number, R2: number): void;

  SetZeroSuppress(mode: boolean): void;

  SetDefaults(chars?: number): void;

  Options(zerosup?: boolean, range?: boolean, R1?: number, R2?: number): { zerosup: boolean; range: boolean; R1: number; R2: number };

  MainFormat(): string;

  FormatForRange(): string;

  Write(val: number, text: string): number;

  static Convert(val: number, text: string, zerosup: boolean, Range1: number, Range2: number, mainform: string, rangeform: string): number;

  delete(): void;

  [Symbol.dispose](): void;

Interface_GTool: declare class Interface_GTool extends Standard_Transient

  constructor

  SetSignType(sign: Interface_SignType): void;

  SignType(): Interface_SignType;

  SignValue(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  SignName(): string;

  SetProtocol(proto: Interface_Protocol, enforce?: boolean): void;

  Protocol(): Interface_Protocol;

  Lib(): Interface_GeneralLib;

  Reservate(nb: number, enforce?: boolean): void;

  ClearEntities(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Interface_GeneralLib: declare class Interface_GeneralLib

  constructor

  AddProtocol(aprotocol: Standard_Transient): void;

  Clear(): void;

  SetComplete(): void;

  Start(): void;

  More(): boolean;

  Next(): void;

  Protocol(): Interface_Protocol;

  delete(): void;

  [Symbol.dispose](): void;

Interface_GlobalNodeOfGeneralLib: declare class Interface_GlobalNodeOfGeneralLib extends Standard_Transient

  constructor

  Protocol(): Interface_Protocol;

  Next(): Interface_GlobalNodeOfGeneralLib;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Interface_GlobalNodeOfReaderLib: declare class Interface_GlobalNodeOfReaderLib extends Standard_Transient

  constructor

  Add(amodule: Interface_ReaderModule, aprotocol: Interface_Protocol): void;

  Module(): Interface_ReaderModule;

  Protocol(): Interface_Protocol;

  Next(): Interface_GlobalNodeOfReaderLib;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Interface_GraphContent: declare class Interface_GraphContent extends Interface_EntityIterator

  constructor

  Begin(): void;

  Evaluate(): void;

  delete(): void;

  [Symbol.dispose](): void;

Interface_IntList: declare class Interface_IntList

  constructor

  Initialize(nbe: number): void;

  NbReferences(): number;

  Entities(): NCollection_HArray1_int;

  References(): NCollection_HArray1_int;

  // DEPRECATED
  Internals(nbrefs?: number): { nbrefs: number; ents: NCollection_HArray1_int; refs: NCollection_HArray1_int; [Symbol.dispose](): void };

  NbEntities(): number;

  SetNbEntities(nbe: number): void;

  SetNumber(number_: number): void;

  Number(): number;

  List(number_: number, copied?: boolean): Interface_IntList;

  SetRedefined(mode: boolean): void;

  Reservate(count: number): void;

  Add(ref: number): void;

  Length(): number;

  IsRedefined(num?: number): boolean;

  Value(num: number): number;

  Remove(num: number): boolean;

  Clear(): void;

  AdjustSize(margin?: number): void;

  delete(): void;

  [Symbol.dispose](): void;

Interface_IntVal: declare class Interface_IntVal extends Standard_Transient

  constructor

  Value(): number;

  CValue(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Interface_InterfaceError: declare class Interface_InterfaceError extends Standard_Failure

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Interface_InterfaceMismatch: declare class Interface_InterfaceMismatch extends Interface_InterfaceError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Interface_InterfaceModel: declare class Interface_InterfaceModel extends Standard_Transient

  Destroy(): void;

  SetProtocol(proto: Interface_Protocol): void;

  Protocol(): Interface_Protocol;

  SetGTool(gtool: Interface_GTool): void;

  GTool(): Interface_GTool;

  DispatchStatus(): boolean;

  Clear(): void;

  ClearEntities(): void;

  ClearLabels(): void;

  ClearHeader(): void;

  NbEntities(): number;

  Contains(anentity: Standard_Transient): boolean;

  Number(anentity: Standard_Transient): number;

  Value(num: number): Standard_Transient;

  NbTypes(ent: Standard_Transient): number;

  Type(ent: Standard_Transient, num?: number): Standard_Type;

  TypeName(ent: Standard_Transient, complete: boolean): string;

  static ClassName(typnam: string): string;

  EntityState(num: number): Interface_DataState;

  IsReportEntity(num: number, semantic?: boolean): boolean;

  ReportEntity(num: number, semantic?: boolean): Interface_ReportEntity;

  IsErrorEntity(num: number): boolean;

  IsRedefinedContent(num: number): boolean;

  ClearReportEntity(num: number): boolean;

  SetReportEntity(num: number, rep: Interface_ReportEntity): boolean;

  AddReportEntity(rep: Interface_ReportEntity, semantic?: boolean): boolean;

  IsUnknownEntity(num: number): boolean;

  HasSemanticChecks(): boolean;

  Check(num: number, syntactic: boolean): Interface_Check;

  Reservate(nbent: number): void;

  AddEntity(anentity: Standard_Transient): void;

  AddWithRefs(anent: Standard_Transient, level: number, listall: boolean): void;
  AddWithRefs(anent: Standard_Transient, proto: Interface_Protocol, level: number, listall: boolean): void;
  AddWithRefs(anent: Standard_Transient, lib: Interface_GeneralLib, level: number, listall: boolean): void;
  AddWithRefs(anent: Standard_Transient, level: number, listall: boolean): void;
  AddWithRefs(anent: Standard_Transient, proto: Interface_Protocol, level: number, listall: boolean): void;
  AddWithRefs(anent: Standard_Transient, lib: Interface_GeneralLib, level: number, listall: boolean): void;
  AddWithRefs(anent: Standard_Transient, level: number, listall: boolean): void;
  AddWithRefs(anent: Standard_Transient, proto: Interface_Protocol, level: number, listall: boolean): void;
  AddWithRefs(anent: Standard_Transient, lib: Interface_GeneralLib, level: number, listall: boolean): void;

  ReplaceEntity(nument: number, anent: Standard_Transient): void;

  ReverseOrders(after?: number): void;

  ChangeOrder(oldnum: number, newnum: number, count?: number): void;

  GetFromAnother(other: Interface_InterfaceModel): void;

  NewEmptyModel(): Interface_InterfaceModel;

  SetCategoryNumber(num: number, val: number): boolean;

  CategoryNumber(num: number): number;

  GlobalCheck(syntactic?: boolean): Interface_Check;

  SetGlobalCheck(ach: Interface_Check): void;

  VerifyCheck(): { ach: Interface_Check; [Symbol.dispose](): void };

  StringLabel(ent: Standard_Transient): TCollection_HAsciiString;

  NextNumberForLabel(label: string, lastnum?: number, exact?: boolean): number;

  static HasTemplate(name: string): boolean;

  static Template(name: string): Interface_InterfaceModel;

  static SetTemplate(name: string, model: Interface_InterfaceModel): boolean;

  static ListTemplates(): NCollection_HSequence_handle_TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Interface_LineBuffer: declare class Interface_LineBuffer

  constructor

  SetMax(max: number): void;

  SetInitial(initial: number): void;

  SetKeep(): void;

  CanGet(more: number): boolean;

  Content(): string;

  Length(): number;

  Clear(): void;

  FreezeInitial(): void;

  Move(str: TCollection_AsciiString): void;
  Move(str: TCollection_HAsciiString): void;
  Move(str: TCollection_AsciiString): void;
  Move(str: TCollection_HAsciiString): void;

  Moved(): TCollection_HAsciiString;

  Add(text: string): void;
  Add(text: TCollection_AsciiString): void;
  Add(text: string): void;
  Add(text: string, lntext: number): void;
  Add(text: string): void;
  Add(text: TCollection_AsciiString): void;
  Add(text: string): void;
  Add(text: string, lntext: number): void;
  Add(text: string): void;
  Add(text: TCollection_AsciiString): void;
  Add(text: string): void;
  Add(text: string, lntext: number): void;
  Add(text: string): void;
  Add(text: TCollection_AsciiString): void;
  Add(text: string): void;
  Add(text: string, lntext: number): void;

  delete(): void;

  [Symbol.dispose](): void;
