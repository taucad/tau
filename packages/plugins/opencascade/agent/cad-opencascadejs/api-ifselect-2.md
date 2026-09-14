# libcascade — IFSelect (2)

31 top-level symbols. Signatures are verbatim typescript.

IFSelect_SelectRange: declare class IFSelect_SelectRange extends IFSelect_SelectExtract

  constructor

  HasLower(): boolean;

  LowerValue(): number;

  HasUpper(): boolean;

  UpperValue(): number;

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectRootComps: declare class IFSelect_SelectRootComps extends IFSelect_SelectExtract

  constructor

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectRoots: declare class IFSelect_SelectRoots extends IFSelect_SelectExtract

  constructor

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectSent: declare class IFSelect_SelectSent extends IFSelect_SelectExtract

  constructor

  SentCount(): number;

  AtLeast(): boolean;

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectShared: declare class IFSelect_SelectShared extends IFSelect_SelectDeduct

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectSharing: declare class IFSelect_SelectSharing extends IFSelect_SelectDeduct

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectSignature: declare class IFSelect_SelectSignature extends IFSelect_SelectExtract

  constructor

  Signature(): IFSelect_Signature;

  Counter(): IFSelect_SignCounter;

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  SignatureText(): TCollection_AsciiString;

  IsExact(): boolean;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectSignedShared: declare class IFSelect_SelectSignedShared extends IFSelect_SelectExplore

  constructor

  Signature(): IFSelect_Signature;

  SignatureText(): TCollection_AsciiString;

  IsExact(): boolean;

  ExploreLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectSignedSharing: declare class IFSelect_SelectSignedSharing extends IFSelect_SelectExplore

  constructor

  Signature(): IFSelect_Signature;

  SignatureText(): TCollection_AsciiString;

  IsExact(): boolean;

  ExploreLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectSuite: declare class IFSelect_SelectSuite extends IFSelect_SelectDeduct

  constructor

  AddInput(item: IFSelect_Selection): boolean;

  AddPrevious(item: IFSelect_SelectDeduct): void;

  AddNext(item: IFSelect_SelectDeduct): void;

  NbItems(): number;

  Item(num: number): IFSelect_SelectDeduct;

  SetLabel(lab: string): void;

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectType: declare class IFSelect_SelectType extends IFSelect_SelectAnyType

  constructor

  SetType(atype: Standard_Type): void;

  TypeForMatch(): Standard_Type;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectUnion: declare class IFSelect_SelectUnion extends IFSelect_SelectCombine

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectUnknownEntities: declare class IFSelect_SelectUnknownEntities extends IFSelect_SelectExtract

  constructor

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_Selection: declare class IFSelect_Selection extends Standard_Transient

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SelectionIterator: declare class IFSelect_SelectionIterator

  constructor

  AddItem(sel: IFSelect_Selection): void;

  AddList(list: NCollection_Sequence_handle_IFSelect_Selection): void;

  More(): boolean;

  Next(): void;

  Value(): IFSelect_Selection;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SessionDumper: declare class IFSelect_SessionDumper extends Standard_Transient

  static First(): IFSelect_SessionDumper;

  Next(): IFSelect_SessionDumper;

  WriteOwn(file: IFSelect_SessionFile, item: Standard_Transient): boolean;

  ReadOwn(file: IFSelect_SessionFile, type_: TCollection_AsciiString): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SessionFile: declare class IFSelect_SessionFile

  constructor

  ClearLines(): void;

  NbLines(): number;

  Line(num: number): TCollection_AsciiString;

  AddLine(line: string): void;

  RemoveLastLine(): void;

  WriteFile(name: string): boolean;

  ReadFile(name: string): boolean;

  RecognizeFile(headerline: string): boolean;

  Write(filename: string): number;

  Read(filename: string): number;

  WriteSession(): number;

  WriteEnd(): number;

  WriteLine(line: string, follow?: string): void;

  WriteOwn(item: Standard_Transient): boolean;

  ReadSession(): number;

  ReadEnd(): number;

  ReadLine(): boolean;

  SplitLine(line: string): void;

  ReadOwn(): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

  AddItem(item: Standard_Transient, active?: boolean): void;

  IsDone(): boolean;

  WorkSession(): IFSelect_WorkSession;

  NewItem(ident: number, par: Standard_Transient): void;

  SetOwn(mode: boolean): void;

  SendVoid(): void;

  SendItem(par: Standard_Transient): void;

  SendText(text: string): void;

  SetLastGeneral(lastgen: number): void;

  NbParams(): number;

  IsVoid(num: number): boolean;

  IsText(num: number): boolean;

  ParamValue(num: number): TCollection_AsciiString;

  TextValue(num: number): TCollection_AsciiString;

  ItemValue(num: number): Standard_Transient;

  Destroy(): void;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SessionPilot: declare class IFSelect_SessionPilot extends IFSelect_Activator

  constructor

  Session(): IFSelect_WorkSession;

  Library(): IFSelect_WorkLibrary;

  RecordMode(): boolean;

  SetSession(WS: IFSelect_WorkSession): void;

  SetLibrary(WL: IFSelect_WorkLibrary): void;

  SetRecordMode(mode: boolean): void;

  SetCommandLine(command: TCollection_AsciiString): void;

  CommandLine(): TCollection_AsciiString;

  CommandPart(numarg: number): string;

  NbWords(): number;

  Word(num: number): TCollection_AsciiString;

  Arg(num: number): string;

  RemoveWord(num: number): boolean;

  NbCommands(): number;

  Command(num: number): TCollection_AsciiString;

  RecordItem(item: Standard_Transient): IFSelect_ReturnStatus;

  RecordedItem(): Standard_Transient;

  Clear(): void;

  ReadScript(file?: string): IFSelect_ReturnStatus;

  Perform(): IFSelect_ReturnStatus;

  ExecuteAlias(aliasname: TCollection_AsciiString): IFSelect_ReturnStatus;

  Execute(command: TCollection_AsciiString): IFSelect_ReturnStatus;

  ExecuteCounter(counter: IFSelect_SignCounter, numword: number, mode?: IFSelect_PrintCount): IFSelect_ReturnStatus;

  Number(val: string): number;

  Do(number_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

  Help(number_: number): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_ShareOut: declare class IFSelect_ShareOut extends Standard_Transient

  constructor

  Clear(onlydisp: boolean): void;

  ClearResult(alsoname: boolean): void;

  RemoveItem(item: Standard_Transient): boolean;

  LastRun(): number;

  SetLastRun(last: number): void;

  NbDispatches(): number;

  DispatchRank(disp: IFSelect_Dispatch): number;

  Dispatch(num: number): IFSelect_Dispatch;

  AddDispatch(disp: IFSelect_Dispatch): void;

  RemoveDispatch(rank: number): boolean;

  AddModifier(modifier: IFSelect_GeneralModifier, atnum: number): void;
  AddModifier(modifier: IFSelect_GeneralModifier, dispnum: number, atnum: number): void;
  AddModifier(modifier: IFSelect_GeneralModifier, atnum: number): void;
  AddModifier(modifier: IFSelect_GeneralModifier, dispnum: number, atnum: number): void;

  AddModif(modifier: IFSelect_GeneralModifier, formodel: boolean, atnum?: number): void;

  NbModifiers(formodel: boolean): number;

  GeneralModifier(formodel: boolean, num: number): IFSelect_GeneralModifier;

  ModelModifier(num: number): IFSelect_Modifier;

  ModifierRank(modifier: IFSelect_GeneralModifier): number;

  RemoveModifier(formodel: boolean, num: number): boolean;

  ChangeModifierRank(formodel: boolean, befor: number, after: number): boolean;

  SetRootName(num: number, name: TCollection_HAsciiString): boolean;

  HasRootName(num: number): boolean;

  RootName(num: number): TCollection_HAsciiString;

  RootNumber(name: TCollection_HAsciiString): number;

  SetPrefix(pref: TCollection_HAsciiString): void;

  SetDefaultRootName(defrt: TCollection_HAsciiString): boolean;

  SetExtension(ext: TCollection_HAsciiString): void;

  Prefix(): TCollection_HAsciiString;

  DefaultRootName(): TCollection_HAsciiString;

  Extension(): TCollection_HAsciiString;

  FileName(dnum: number, pnum: number, nbpack?: number): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_ShareOutResult: declare class IFSelect_ShareOutResult

  constructor

  ShareOut(): IFSelect_ShareOut;

  Reset(): void;

  Evaluate(): void;

  Packets(complete?: boolean): IFSelect_PacketList;

  NbPackets(): number;

  Prepare(): void;

  More(): boolean;

  Next(): void;

  NextDispatch(): void;

  Dispatch(): IFSelect_Dispatch;

  DispatchRank(): number;

  PacketsInDispatch(numpack?: number, nbpacks?: number): { numpack: number; nbpacks: number };

  FileName(): TCollection_AsciiString;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SignAncestor: declare class IFSelect_SignAncestor extends IFSelect_SignType

  constructor

  Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SignCategory: declare class IFSelect_SignCategory extends IFSelect_Signature

  constructor

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SignCounter: declare class IFSelect_SignCounter extends IFSelect_SignatureList

  constructor

  Signature(): IFSelect_Signature;

  SetMap(withmap: boolean): void;

  AddEntity(ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  AddSign(ent: Standard_Transient, model: Interface_InterfaceModel): void;

  AddList(list: NCollection_HSequence_handle_Standard_Transient, model: Interface_InterfaceModel): void;

  AddModel(model: Interface_InterfaceModel): void;

  SetSelection(sel: IFSelect_Selection): void;

  Selection(): IFSelect_Selection;

  SetSelMode(selmode: number): void;

  SelMode(): number;

  Sign(ent: Standard_Transient, model: Interface_InterfaceModel): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SignMultiple: declare class IFSelect_SignMultiple extends IFSelect_Signature

  constructor

  Add(subsign: IFSelect_Signature, width?: number, maxi?: boolean): void;

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SignType: declare class IFSelect_SignType extends IFSelect_Signature

  constructor

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SignValidity: declare class IFSelect_SignValidity extends IFSelect_Signature

  constructor

  static CVal(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_Signature: declare class IFSelect_Signature extends Interface_SignType

  SetIntCase(hasmin: boolean, valmin: number, hasmax: boolean, valmax: number): void;

  IsIntCase(hasmin?: boolean, valmin?: number, hasmax?: boolean, valmax?: number): { returnValue: boolean; hasmin: boolean; valmin: number; hasmax: boolean; valmax: number };

  AddCase(acase: string): void;

  CaseList(): NCollection_HSequence_TCollection_AsciiString;

  Name(): string;

  Label(): TCollection_AsciiString;

  Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

  static MatchValue(val: string, text: TCollection_AsciiString, exact: boolean): boolean;

  static IntValue(val: number): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_SignatureList: declare class IFSelect_SignatureList extends Standard_Transient

  constructor

  SetList(withlist: boolean): void;

  ModeSignOnly(): boolean;

  Clear(): void;

  Add(ent: Standard_Transient, sign: string): void;

  LastValue(): string;

  Init(name: string, count: NCollection_IndexedDataMap_TCollection_AsciiString_int, list: NCollection_IndexedDataMap_TCollection_AsciiString_handle_Standard_Transient, nbnuls: number): void;

  List(root?: string): NCollection_HSequence_handle_TCollection_HAsciiString;

  HasEntities(): boolean;

  NbNulls(): number;

  NbTimes(sign: string): number;

  Entities(sign: string): NCollection_HSequence_handle_Standard_Transient;

  SetName(name: string): void;

  Name(): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_TransformStandard: declare class IFSelect_TransformStandard extends IFSelect_Transformer

  constructor

  SetCopyOption(option: boolean): void;

  CopyOption(): boolean;

  SetSelection(sel: IFSelect_Selection): void;

  Selection(): IFSelect_Selection;

  NbModifiers(): number;

  Modifier(num: number): IFSelect_Modifier;

  ModifierRank(modif: IFSelect_Modifier): number;

  AddModifier(modif: IFSelect_Modifier, atnum?: number): boolean;

  RemoveModifier(modif: IFSelect_Modifier): boolean;
  RemoveModifier(num: number): boolean;
  RemoveModifier(modif: IFSelect_Modifier): boolean;
  RemoveModifier(num: number): boolean;

  Updated(entfrom: Standard_Transient): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_Transformer: declare class IFSelect_Transformer extends Standard_Transient

  ChangeProtocol(): { returnValue: boolean; newproto: Interface_Protocol; [Symbol.dispose](): void };

  Updated(entfrom: Standard_Transient): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IFSelect_WorkLibrary: declare class IFSelect_WorkLibrary extends Standard_Transient

  ReadFile(name: string, protocol: Interface_Protocol): { returnValue: number; model: Interface_InterfaceModel; [Symbol.dispose](): void };

  WriteFile(ctx: IFSelect_ContextWrite): boolean;

  SetDumpLevels(def: number, max: number): void;

  DumpLevels(def?: number, max?: number): { def: number; max: number };

  SetDumpHelp(level: number, help: string): void;

  DumpHelp(level: number): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
