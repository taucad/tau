# libcascade — IGESData

31 top-level symbols. Signatures are verbatim typescript.

IGESData: declare class IGESData

  constructor

  static Init(): void;

  static Protocol(): IGESData_Protocol;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_BasicEditor: declare class IGESData_BasicEditor

  constructor

  Init(protocol: IGESData_Protocol): void;
  Init(model: IGESData_IGESModel, protocol: IGESData_Protocol): void;
  Init(protocol: IGESData_Protocol): void;
  Init(model: IGESData_IGESModel, protocol: IGESData_Protocol): void;

  Model(): IGESData_IGESModel;

  SetUnitFlag(flag: number): boolean;

  SetUnitValue(val: number): boolean;

  SetUnitName(name: string): boolean;

  ApplyUnit(enforce?: boolean): void;

  ComputeStatus(): void;

  AutoCorrect(ent: IGESData_IGESEntity): boolean;

  AutoCorrectModel(): number;

  static UnitNameFlag(name: string): number;

  static UnitFlagValue(flag: number): number;

  static UnitFlagName(flag: number): string;

  static IGESVersionName(flag: number): string;

  static IGESVersionMax(): number;

  static DraftingName(flag: number): string;

  static DraftingMax(): number;

  static GetFlagByValue(theValue: number): number;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_ColorEntity: declare class IGESData_ColorEntity extends IGESData_IGESEntity

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_DefList: typeof IGESData_DefList[keyof typeof IGESData_DefList]

IGESData_DefSwitch: declare class IGESData_DefSwitch

  constructor

  SetVoid(): void;

  SetReference(): void;

  SetRank(val: number): void;

  DefType(): IGESData_DefType;

  Value(): number;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_DefType: typeof IGESData_DefType[keyof typeof IGESData_DefType]

IGESData_DefaultGeneral: declare class IGESData_DefaultGeneral extends IGESData_GeneralModule

  constructor

  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_DefaultSpecific: declare class IGESData_DefaultSpecific extends IGESData_SpecificModule

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_DirChecker: declare class IGESData_DirChecker

  constructor

  IsSet(): boolean;

  SetDefault(): void;

  Structure(crit: IGESData_DefType): void;

  LineFont(crit: IGESData_DefType): void;

  LineWeight(crit: IGESData_DefType): void;

  Color(crit: IGESData_DefType): void;

  GraphicsIgnored(hierarchy?: number): void;

  BlankStatusIgnored(): void;

  BlankStatusRequired(val: number): void;

  SubordinateStatusIgnored(): void;

  SubordinateStatusRequired(val: number): void;

  UseFlagIgnored(): void;

  UseFlagRequired(val: number): void;

  HierarchyStatusIgnored(): void;

  HierarchyStatusRequired(val: number): void;

  Check(ent: IGESData_IGESEntity): { ach: Interface_Check; [Symbol.dispose](): void };

  CheckTypeAndForm(ent: IGESData_IGESEntity): { ach: Interface_Check; [Symbol.dispose](): void };

  Correct(ent: IGESData_IGESEntity): boolean;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_DirPart: declare class IGESData_DirPart

  constructor

  Init(i1: number, i2: number, i3: number, i4: number, i5: number, i6: number, i7: number, i8: number, i9: number, i19: number, i11: number, i12: number, i13: number, i14: number, i15: number, i16: number, i17: number, res1: string, res2: string, label: string, subscript: string): void;

  Values(i1: number, i2: number, i3: number, i4: number, i5: number, i6: number, i7: number, i8: number, i9: number, i19: number, i11: number, i12: number, i13: number, i14: number, i15: number, i16: number, i17: number, res1: string, res2: string, label: string, subscript: string): { i1: number; i2: number; i3: number; i4: number; i5: number; i6: number; i7: number; i8: number; i9: number; i19: number; i11: number; i12: number; i13: number; i14: number; i15: number; i16: number; i17: number };

  Type(): IGESData_IGESType;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_FileProtocol: declare class IGESData_FileProtocol extends IGESData_Protocol

  constructor

  Add(protocol: IGESData_Protocol): void;

  NbResources(): number;

  Resource(num: number): Interface_Protocol;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_FileRecognizer: declare class IGESData_FileRecognizer extends Standard_Transient

  Evaluate(akey: IGESData_IGESType): { returnValue: boolean; res: IGESData_IGESEntity; [Symbol.dispose](): void };

  Result(): IGESData_IGESEntity;

  Add(reco: IGESData_FileRecognizer): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_GeneralModule: declare class IGESData_GeneralModule extends Standard_Transient

  CheckCase(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  CanCopy(CN: number, ent: Standard_Transient): boolean;

  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  CopyCase(CN: number, entfrom: Standard_Transient, entto: Standard_Transient, TC: Interface_CopyTool): void;

  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  RenewImpliedCase(CN: number, entfrom: Standard_Transient, entto: Standard_Transient, TC: Interface_CopyTool): void;

  OwnRenewCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  WhenDeleteCase(CN: number, ent: Standard_Transient, dispatched: boolean): void;

  OwnDeleteCase(CN: number, ent: IGESData_IGESEntity): void;

  Name(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_GlobalNodeOfSpecificLib: declare class IGESData_GlobalNodeOfSpecificLib extends Standard_Transient

  constructor

  Add(amodule: IGESData_SpecificModule, aprotocol: IGESData_Protocol): void;

  Module(): IGESData_SpecificModule;

  Protocol(): IGESData_Protocol;

  Next(): IGESData_GlobalNodeOfSpecificLib;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_GlobalNodeOfWriterLib: declare class IGESData_GlobalNodeOfWriterLib extends Standard_Transient

  constructor

  Add(amodule: IGESData_ReadWriteModule, aprotocol: IGESData_Protocol): void;

  Module(): IGESData_ReadWriteModule;

  Protocol(): IGESData_Protocol;

  Next(): IGESData_GlobalNodeOfWriterLib;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_GlobalSection: declare class IGESData_GlobalSection

  constructor

  Init(params: Interface_ParamSet): { ach: Interface_Check; [Symbol.dispose](): void };

  CopyRefs(): void;

  Params(): Interface_ParamSet;

  TranslatedFromHollerith(astr: TCollection_HAsciiString): TCollection_HAsciiString;

  Separator(): string;

  EndMark(): string;

  SendName(): TCollection_HAsciiString;

  FileName(): TCollection_HAsciiString;

  SystemId(): TCollection_HAsciiString;

  InterfaceVersion(): TCollection_HAsciiString;

  IntegerBits(): number;

  MaxPower10Single(): number;

  MaxDigitsSingle(): number;

  MaxPower10Double(): number;

  MaxDigitsDouble(): number;

  ReceiveName(): TCollection_HAsciiString;

  Scale(): number;

  CascadeUnit(): number;

  UnitFlag(): number;

  UnitName(): TCollection_HAsciiString;

  LineWeightGrad(): number;

  MaxLineWeight(): number;

  Date(): TCollection_HAsciiString;

  Resolution(): number;

  MaxCoord(): number;

  HasMaxCoord(): boolean;

  AuthorName(): TCollection_HAsciiString;

  CompanyName(): TCollection_HAsciiString;

  IGESVersion(): number;

  DraftingStandard(): number;

  LastChangeDate(): TCollection_HAsciiString;

  HasLastChangeDate(): boolean;

  SetLastChangeDate(): void;
  SetLastChangeDate(val: TCollection_HAsciiString): void;
  SetLastChangeDate(): void;
  SetLastChangeDate(val: TCollection_HAsciiString): void;

  ApplicationProtocol(): TCollection_HAsciiString;

  HasApplicationProtocol(): boolean;

  static NewDateString(year: number, month: number, day: number, hour: number, minut: number, second: number, mode: number): TCollection_HAsciiString;
  static NewDateString(date: TCollection_HAsciiString, mode: number): TCollection_HAsciiString;
  static NewDateString(year: number, month: number, day: number, hour: number, minut: number, second: number, mode: number): TCollection_HAsciiString;
  static NewDateString(date: TCollection_HAsciiString, mode: number): TCollection_HAsciiString;

  UnitValue(): number;

  SetSeparator(val: string): void;

  SetEndMark(val: string): void;

  SetSendName(val: TCollection_HAsciiString): void;

  SetFileName(val: TCollection_HAsciiString): void;

  SetSystemId(val: TCollection_HAsciiString): void;

  SetInterfaceVersion(val: TCollection_HAsciiString): void;

  SetIntegerBits(val: number): void;

  SetMaxPower10Single(val: number): void;

  SetMaxDigitsSingle(val: number): void;

  SetMaxPower10Double(val: number): void;

  SetMaxDigitsDouble(val: number): void;

  SetReceiveName(val: TCollection_HAsciiString): void;

  SetCascadeUnit(theUnit: number): void;

  SetScale(val: number): void;

  SetUnitFlag(val: number): void;

  SetUnitName(val: TCollection_HAsciiString): void;

  SetLineWeightGrad(val: number): void;

  SetMaxLineWeight(val: number): void;

  SetDate(val: TCollection_HAsciiString): void;

  SetResolution(val: number): void;

  SetMaxCoord(val?: number): void;

  MaxMaxCoord(val?: number): void;

  MaxMaxCoords(xyz: gp_XYZ): void;

  SetAuthorName(val: TCollection_HAsciiString): void;

  SetCompanyName(val: TCollection_HAsciiString): void;

  SetIGESVersion(val: number): void;

  SetDraftingStandard(val: number): void;

  SetApplicationProtocol(val: TCollection_HAsciiString): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_IGESDumper: declare class IGESData_IGESDumper

  constructor

  delete(): void;

  [Symbol.dispose](): void;

IGESData_IGESEntity: declare class IGESData_IGESEntity extends Standard_Transient

  IGESType(): IGESData_IGESType;

  TypeNumber(): number;

  FormNumber(): number;

  DirFieldEntity(fieldnum: number): IGESData_IGESEntity;

  HasStructure(): boolean;

  Structure(): IGESData_IGESEntity;

  DefLineFont(): IGESData_DefType;

  RankLineFont(): number;

  LineFont(): IGESData_LineFontEntity;

  DefLevel(): IGESData_DefList;

  Level(): number;

  LevelList(): IGESData_LevelListEntity;

  DefView(): IGESData_DefList;

  View(): IGESData_ViewKindEntity;

  SingleView(): IGESData_ViewKindEntity;

  ViewList(): IGESData_ViewKindEntity;

  HasTransf(): boolean;

  Transf(): IGESData_TransfEntity;

  HasLabelDisplay(): boolean;

  LabelDisplay(): IGESData_LabelDisplayEntity;

  BlankStatus(): number;

  SubordinateStatus(): number;

  UseFlag(): number;

  HierarchyStatus(): number;

  LineWeightNumber(): number;

  LineWeight(): number;

  DefColor(): IGESData_DefType;

  RankColor(): number;

  Color(): IGESData_ColorEntity;

  CResValues(res1: string, res2: string): boolean;

  HasShortLabel(): boolean;

  ShortLabel(): TCollection_HAsciiString;

  HasSubScriptNumber(): boolean;

  SubScriptNumber(): number;

  InitDirFieldEntity(fieldnum: number, ent: IGESData_IGESEntity): void;

  InitTransf(ent: IGESData_TransfEntity): void;

  InitView(ent: IGESData_ViewKindEntity): void;

  InitLineFont(ent: IGESData_LineFontEntity, rank?: number): void;

  InitLevel(ent: IGESData_LevelListEntity, val?: number): void;

  InitColor(ent: IGESData_ColorEntity, rank?: number): void;

  InitStatus(blank: number, subordinate: number, useflag: number, hierarchy: number): void;

  SetLabel(label: TCollection_HAsciiString, sub?: number): void;

  InitMisc(str: IGESData_IGESEntity, lab: IGESData_LabelDisplayEntity, weightnum: number): void;

  HasOneParent(): boolean;

  UniqueParent(): IGESData_IGESEntity;

  Location(): gp_GTrsf;

  VectorLocation(): gp_GTrsf;

  CompoundLocation(): gp_GTrsf;

  HasName(): boolean;

  NameValue(): TCollection_HAsciiString;

  ArePresentAssociativities(): boolean;

  NbAssociativities(): number;

  NbTypedAssociativities(atype: Standard_Type): number;

  TypedAssociativity(atype: Standard_Type): IGESData_IGESEntity;

  Associate(ent: IGESData_IGESEntity): void;

  Dissociate(ent: IGESData_IGESEntity): void;

  ArePresentProperties(): boolean;

  NbProperties(): number;

  NbTypedProperties(atype: Standard_Type): number;

  TypedProperty(atype: Standard_Type, anum?: number): IGESData_IGESEntity;

  AddProperty(ent: IGESData_IGESEntity): void;

  RemoveProperty(ent: IGESData_IGESEntity): void;

  SetLineWeight(defw: number, maxw: number, gradw: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_IGESModel: declare class IGESData_IGESModel extends Interface_InterfaceModel

  constructor

  ClearHeader(): void;

  StartSection(): NCollection_HSequence_handle_TCollection_HAsciiString;

  NbStartLines(): number;

  StartLine(num: number): string;

  ClearStartSection(): void;

  SetStartSection(list: NCollection_HSequence_handle_TCollection_HAsciiString, copy?: boolean): void;

  AddStartLine(line: string, atnum?: number): void;

  GlobalSection(): IGESData_GlobalSection;

  ChangeGlobalSection(): IGESData_GlobalSection;

  SetGlobalSection(header: IGESData_GlobalSection): void;

  ApplyStatic(param?: string): boolean;

  Entity(num: number): IGESData_IGESEntity;

  DNum(ent: IGESData_IGESEntity): number;

  GetFromAnother(other: Interface_InterfaceModel): void;

  NewEmptyModel(): Interface_InterfaceModel;

  VerifyCheck(): { ach: Interface_Check; [Symbol.dispose](): void };

  SetLineWeights(defw: number): void;

  ClearLabels(): void;

  StringLabel(ent: Standard_Transient): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_IGESReaderTool: declare class IGESData_IGESReaderTool extends Interface_FileReaderTool

  Prepare(reco: IGESData_FileRecognizer): void;

  Recognize(num: number): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

  BeginRead(amodel: Interface_InterfaceModel): void;

  AnalyseRecord(num: number, anent: Standard_Transient): { returnValue: boolean; acheck: Interface_Check; [Symbol.dispose](): void };

  EndRead(amodel: Interface_InterfaceModel): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_IGESType: declare class IGESData_IGESType

  constructor

  Type(): number;

  Form(): number;

  IsEqual(another: IGESData_IGESType): boolean;

  Nullify(): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_IGESWriter: declare class IGESData_IGESWriter

  constructor

  FloatWriter(): Interface_FloatWriter;

  WriteMode(): number;

  SendStartLine(startline: string): void;

  SendModel(protocol: IGESData_Protocol): void;

  SectionS(): void;

  SectionG(header: IGESData_GlobalSection): void;

  SectionsDP(): void;

  SectionT(): void;

  DirPart(anent: IGESData_IGESEntity): void;

  OwnParams(anent: IGESData_IGESEntity): void;

  Associativities(anent: IGESData_IGESEntity): void;

  Properties(anent: IGESData_IGESEntity): void;

  EndEntity(): void;

  SendVoid(): void;

  Send(val: number): void;
  Send(val: number): void;
  Send(val: TCollection_HAsciiString): void;
  Send(val: gp_XY): void;
  Send(val: gp_XYZ): void;
  Send(val: IGESData_IGESEntity, negative: boolean): void;
  Send(val: number): void;
  Send(val: number): void;
  Send(val: TCollection_HAsciiString): void;
  Send(val: gp_XY): void;
  Send(val: gp_XYZ): void;
  Send(val: IGESData_IGESEntity, negative: boolean): void;
  Send(val: number): void;
  Send(val: number): void;
  Send(val: TCollection_HAsciiString): void;
  Send(val: gp_XY): void;
  Send(val: gp_XYZ): void;
  Send(val: IGESData_IGESEntity, negative: boolean): void;
  Send(val: number): void;
  Send(val: number): void;
  Send(val: TCollection_HAsciiString): void;
  Send(val: gp_XY): void;
  Send(val: gp_XYZ): void;
  Send(val: IGESData_IGESEntity, negative: boolean): void;
  Send(val: number): void;
  Send(val: number): void;
  Send(val: TCollection_HAsciiString): void;
  Send(val: gp_XY): void;
  Send(val: gp_XYZ): void;
  Send(val: IGESData_IGESEntity, negative: boolean): void;
  Send(val: number): void;
  Send(val: number): void;
  Send(val: TCollection_HAsciiString): void;
  Send(val: gp_XY): void;
  Send(val: gp_XYZ): void;
  Send(val: IGESData_IGESEntity, negative: boolean): void;

  SendBoolean(val: boolean): void;

  SendString(val: TCollection_HAsciiString): void;

  SectionStrings(numsec: number): NCollection_HSequence_handle_TCollection_HAsciiString;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_LabelDisplayEntity: declare class IGESData_LabelDisplayEntity extends IGESData_IGESEntity

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_LevelListEntity: declare class IGESData_LevelListEntity extends IGESData_IGESEntity

  NbLevelNumbers(): number;

  LevelNumber(num: number): number;

  HasLevelNumber(level: number): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_LineFontEntity: declare class IGESData_LineFontEntity extends IGESData_IGESEntity

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_NameEntity: declare class IGESData_NameEntity extends IGESData_IGESEntity

  Value(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_NodeOfSpecificLib: declare class IGESData_NodeOfSpecificLib extends Standard_Transient

  constructor

  AddNode(anode: IGESData_GlobalNodeOfSpecificLib): void;

  Module(): IGESData_SpecificModule;

  Protocol(): IGESData_Protocol;

  Next(): IGESData_NodeOfSpecificLib;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_NodeOfWriterLib: declare class IGESData_NodeOfWriterLib extends Standard_Transient

  constructor

  AddNode(anode: IGESData_GlobalNodeOfWriterLib): void;

  Module(): IGESData_ReadWriteModule;

  Protocol(): IGESData_Protocol;

  Next(): IGESData_NodeOfWriterLib;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_ParamCursor: declare class IGESData_ParamCursor

  constructor

  SetTerm(size: number, autoadv?: boolean): void;

  SetOne(autoadv?: boolean): void;

  SetXY(autoadv?: boolean): void;

  SetXYZ(autoadv?: boolean): void;

  SetAdvance(advance: boolean): void;

  Start(): number;

  Limit(): number;

  Count(): number;

  ItemSize(): number;

  TermSize(): number;

  Offset(): number;

  Advance(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_Protocol: declare class IGESData_Protocol extends Interface_Protocol

  constructor

  NbResources(): number;

  Resource(num: number): Interface_Protocol;

  TypeNumber(atype: Standard_Type): number;

  NewModel(): Interface_InterfaceModel;

  IsSuitableModel(model: Interface_InterfaceModel): boolean;

  UnknownEntity(): Standard_Transient;

  IsUnknownEntity(ent: Standard_Transient): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESData_ReadStage: typeof IGESData_ReadStage[keyof typeof IGESData_ReadStage]
