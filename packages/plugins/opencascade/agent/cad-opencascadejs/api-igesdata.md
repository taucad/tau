# libcascade — IGESData

31 top-level symbols. Signatures are verbatim typescript.

IGESData: declare class IGESData

  // IGESData.constructor (constructor)
  constructor();

  // IGESData.Init (method)
  static Init(): void;

  // IGESData.Protocol (method)
  static Protocol(): IGESData_Protocol;

  // IGESData.delete (method)
  delete(): void;

  // IGESData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_BasicEditor: declare class IGESData_BasicEditor

  // IGESData_BasicEditor.constructor (constructor)
  constructor();
  constructor(protocol: IGESData_Protocol);
  constructor(model: IGESData_IGESModel, protocol: IGESData_Protocol);

  // IGESData_BasicEditor.Init (method)
  Init(protocol: IGESData_Protocol): void;
  Init(model: IGESData_IGESModel, protocol: IGESData_Protocol): void;

  // IGESData_BasicEditor.Model (method)
  Model(): IGESData_IGESModel;

  // IGESData_BasicEditor.SetUnitFlag (method)
  SetUnitFlag(flag: number): boolean;

  // IGESData_BasicEditor.SetUnitValue (method)
  SetUnitValue(val: number): boolean;

  // IGESData_BasicEditor.SetUnitName (method)
  SetUnitName(name: string): boolean;

  // IGESData_BasicEditor.ApplyUnit (method)
  ApplyUnit(enforce?: boolean): void;

  // IGESData_BasicEditor.ComputeStatus (method)
  ComputeStatus(): void;

  // IGESData_BasicEditor.AutoCorrect (method)
  AutoCorrect(ent: IGESData_IGESEntity): boolean;

  // IGESData_BasicEditor.AutoCorrectModel (method)
  AutoCorrectModel(): number;

  // IGESData_BasicEditor.UnitNameFlag (method)
  static UnitNameFlag(name: string): number;

  // IGESData_BasicEditor.UnitFlagValue (method)
  static UnitFlagValue(flag: number): number;

  // IGESData_BasicEditor.UnitFlagName (method)
  static UnitFlagName(flag: number): string;

  // IGESData_BasicEditor.IGESVersionName (method)
  static IGESVersionName(flag: number): string;

  // IGESData_BasicEditor.IGESVersionMax (method)
  static IGESVersionMax(): number;

  // IGESData_BasicEditor.DraftingName (method)
  static DraftingName(flag: number): string;

  // IGESData_BasicEditor.DraftingMax (method)
  static DraftingMax(): number;

  // IGESData_BasicEditor.GetFlagByValue (method)
  static GetFlagByValue(theValue: number): number;

  // IGESData_BasicEditor.delete (method)
  delete(): void;

  // IGESData_BasicEditor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_ColorEntity: declare class IGESData_ColorEntity extends IGESData_IGESEntity

  // IGESData_ColorEntity.constructor (constructor)
  constructor();

  // IGESData_ColorEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESData_ColorEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_ColorEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_ColorEntity.delete (method)
  delete(): void;

  // IGESData_ColorEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_DefList: typeof IGESData_DefList[keyof typeof IGESData_DefList]

  readonly IGESData_DefNone: 'IGESData_DefNone'

  readonly IGESData_DefOne: 'IGESData_DefOne'

  readonly IGESData_DefSeveral: 'IGESData_DefSeveral'

  readonly IGESData_ErrorOne: 'IGESData_ErrorOne'

  readonly IGESData_ErrorSeveral: 'IGESData_ErrorSeveral'

IGESData_DefSwitch: declare class IGESData_DefSwitch

  // IGESData_DefSwitch.constructor (constructor)
  constructor();

  // IGESData_DefSwitch.SetVoid (method)
  SetVoid(): void;

  // IGESData_DefSwitch.SetReference (method)
  SetReference(): void;

  // IGESData_DefSwitch.SetRank (method)
  SetRank(val: number): void;

  // IGESData_DefSwitch.DefType (method)
  DefType(): IGESData_DefType;

  // IGESData_DefSwitch.Value (method)
  Value(): number;

  // IGESData_DefSwitch.delete (method)
  delete(): void;

  // IGESData_DefSwitch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_DefType: typeof IGESData_DefType[keyof typeof IGESData_DefType]

  readonly IGESData_DefVoid: 'IGESData_DefVoid'

  readonly IGESData_DefValue: 'IGESData_DefValue'

  readonly IGESData_DefReference: 'IGESData_DefReference'

  readonly IGESData_DefAny: 'IGESData_DefAny'

  readonly IGESData_ErrorVal: 'IGESData_ErrorVal'

  readonly IGESData_ErrorRef: 'IGESData_ErrorRef'

IGESData_DefaultGeneral: declare class IGESData_DefaultGeneral extends IGESData_GeneralModule

  // IGESData_DefaultGeneral.constructor (constructor)
  constructor();

  // IGESData_DefaultGeneral.DirChecker (method)
  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  // IGESData_DefaultGeneral.OwnCheckCase (method)
  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESData_DefaultGeneral.NewVoid (method)
  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESData_DefaultGeneral.OwnCopyCase (method)
  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESData_DefaultGeneral.get_type_name (method)
  static get_type_name(): string;

  // IGESData_DefaultGeneral.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_DefaultGeneral.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_DefaultGeneral.delete (method)
  delete(): void;

  // IGESData_DefaultGeneral.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_DefaultSpecific: declare class IGESData_DefaultSpecific extends IGESData_SpecificModule

  // IGESData_DefaultSpecific.constructor (constructor)
  constructor();

  // IGESData_DefaultSpecific.get_type_name (method)
  static get_type_name(): string;

  // IGESData_DefaultSpecific.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_DefaultSpecific.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_DefaultSpecific.delete (method)
  delete(): void;

  // IGESData_DefaultSpecific.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_DirChecker: declare class IGESData_DirChecker

  // IGESData_DirChecker.constructor (constructor)
  constructor();
  constructor(atype: number);
  constructor(atype: number, aform: number);
  constructor(atype: number, aform1: number, aform2: number);

  // IGESData_DirChecker.IsSet (method)
  IsSet(): boolean;

  // IGESData_DirChecker.SetDefault (method)
  SetDefault(): void;

  // IGESData_DirChecker.Structure (method)
  Structure(crit: IGESData_DefType): void;

  // IGESData_DirChecker.LineFont (method)
  LineFont(crit: IGESData_DefType): void;

  // IGESData_DirChecker.LineWeight (method)
  LineWeight(crit: IGESData_DefType): void;

  // IGESData_DirChecker.Color (method)
  Color(crit: IGESData_DefType): void;

  // IGESData_DirChecker.GraphicsIgnored (method)
  GraphicsIgnored(hierarchy?: number): void;

  // IGESData_DirChecker.BlankStatusIgnored (method)
  BlankStatusIgnored(): void;

  // IGESData_DirChecker.BlankStatusRequired (method)
  BlankStatusRequired(val: number): void;

  // IGESData_DirChecker.SubordinateStatusIgnored (method)
  SubordinateStatusIgnored(): void;

  // IGESData_DirChecker.SubordinateStatusRequired (method)
  SubordinateStatusRequired(val: number): void;

  // IGESData_DirChecker.UseFlagIgnored (method)
  UseFlagIgnored(): void;

  // IGESData_DirChecker.UseFlagRequired (method)
  UseFlagRequired(val: number): void;

  // IGESData_DirChecker.HierarchyStatusIgnored (method)
  HierarchyStatusIgnored(): void;

  // IGESData_DirChecker.HierarchyStatusRequired (method)
  HierarchyStatusRequired(val: number): void;

  // IGESData_DirChecker.Check (method)
  Check(ent: IGESData_IGESEntity): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESData_DirChecker.CheckTypeAndForm (method)
  CheckTypeAndForm(ent: IGESData_IGESEntity): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESData_DirChecker.Correct (method)
  Correct(ent: IGESData_IGESEntity): boolean;

  // IGESData_DirChecker.delete (method)
  delete(): void;

  // IGESData_DirChecker.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_DirPart: declare class IGESData_DirPart

  // IGESData_DirPart.constructor (constructor)
  constructor();

  // IGESData_DirPart.Init (method)
  Init(i1: number, i2: number, i3: number, i4: number, i5: number, i6: number, i7: number, i8: number, i9: number, i19: number, i11: number, i12: number, i13: number, i14: number, i15: number, i16: number, i17: number, res1: string, res2: string, label: string, subscript: string): void;

  // IGESData_DirPart.Values (method)
  Values(i1: number, i2: number, i3: number, i4: number, i5: number, i6: number, i7: number, i8: number, i9: number, i19: number, i11: number, i12: number, i13: number, i14: number, i15: number, i16: number, i17: number, res1: string, res2: string, label: string, subscript: string): { i1: number; i2: number; i3: number; i4: number; i5: number; i6: number; i7: number; i8: number; i9: number; i19: number; i11: number; i12: number; i13: number; i14: number; i15: number; i16: number; i17: number };

  // IGESData_DirPart.Type (method)
  Type(): IGESData_IGESType;

  // IGESData_DirPart.delete (method)
  delete(): void;

  // IGESData_DirPart.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_FileProtocol: declare class IGESData_FileProtocol extends IGESData_Protocol

  // IGESData_FileProtocol.constructor (constructor)
  constructor();

  // IGESData_FileProtocol.Add (method)
  Add(protocol: IGESData_Protocol): void;

  // IGESData_FileProtocol.NbResources (method)
  NbResources(): number;

  // IGESData_FileProtocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // IGESData_FileProtocol.get_type_name (method)
  static get_type_name(): string;

  // IGESData_FileProtocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_FileProtocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_FileProtocol.delete (method)
  delete(): void;

  // IGESData_FileProtocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_FileRecognizer: declare class IGESData_FileRecognizer extends Standard_Transient

  // IGESData_FileRecognizer.Evaluate (method)
  Evaluate(akey: IGESData_IGESType): { returnValue: boolean; res: IGESData_IGESEntity; [Symbol.dispose](): void };

  // IGESData_FileRecognizer.Result (method)
  Result(): IGESData_IGESEntity;

  // IGESData_FileRecognizer.Add (method)
  Add(reco: IGESData_FileRecognizer): void;

  // IGESData_FileRecognizer.get_type_name (method)
  static get_type_name(): string;

  // IGESData_FileRecognizer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_FileRecognizer.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_FileRecognizer.delete (method)
  delete(): void;

  // IGESData_FileRecognizer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_GeneralModule: declare class IGESData_GeneralModule extends Standard_Transient

  // IGESData_GeneralModule.CheckCase (method)
  CheckCase(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESData_GeneralModule.DirChecker (method)
  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  // IGESData_GeneralModule.OwnCheckCase (method)
  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESData_GeneralModule.CanCopy (method)
  CanCopy(CN: number, ent: Standard_Transient): boolean;

  // IGESData_GeneralModule.NewVoid (method)
  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESData_GeneralModule.CopyCase (method)
  CopyCase(CN: number, entfrom: Standard_Transient, entto: Standard_Transient, TC: Interface_CopyTool): void;

  // IGESData_GeneralModule.OwnCopyCase (method)
  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESData_GeneralModule.RenewImpliedCase (method)
  RenewImpliedCase(CN: number, entfrom: Standard_Transient, entto: Standard_Transient, TC: Interface_CopyTool): void;

  // IGESData_GeneralModule.OwnRenewCase (method)
  OwnRenewCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESData_GeneralModule.WhenDeleteCase (method)
  WhenDeleteCase(CN: number, ent: Standard_Transient, dispatched: boolean): void;

  // IGESData_GeneralModule.OwnDeleteCase (method)
  OwnDeleteCase(CN: number, ent: IGESData_IGESEntity): void;

  // IGESData_GeneralModule.Name (method)
  Name(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): TCollection_HAsciiString;

  // IGESData_GeneralModule.get_type_name (method)
  static get_type_name(): string;

  // IGESData_GeneralModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_GeneralModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_GeneralModule.delete (method)
  delete(): void;

  // IGESData_GeneralModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_GlobalNodeOfSpecificLib: declare class IGESData_GlobalNodeOfSpecificLib extends Standard_Transient

  // IGESData_GlobalNodeOfSpecificLib.constructor (constructor)
  constructor();

  // IGESData_GlobalNodeOfSpecificLib.Add (method)
  Add(amodule: IGESData_SpecificModule, aprotocol: IGESData_Protocol): void;

  // IGESData_GlobalNodeOfSpecificLib.Module (method)
  Module(): IGESData_SpecificModule;

  // IGESData_GlobalNodeOfSpecificLib.Protocol (method)
  Protocol(): IGESData_Protocol;

  // IGESData_GlobalNodeOfSpecificLib.Next (method)
  Next(): IGESData_GlobalNodeOfSpecificLib;

  // IGESData_GlobalNodeOfSpecificLib.get_type_name (method)
  static get_type_name(): string;

  // IGESData_GlobalNodeOfSpecificLib.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_GlobalNodeOfSpecificLib.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_GlobalNodeOfSpecificLib.delete (method)
  delete(): void;

  // IGESData_GlobalNodeOfSpecificLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_GlobalNodeOfWriterLib: declare class IGESData_GlobalNodeOfWriterLib extends Standard_Transient

  // IGESData_GlobalNodeOfWriterLib.constructor (constructor)
  constructor();

  // IGESData_GlobalNodeOfWriterLib.Add (method)
  Add(amodule: IGESData_ReadWriteModule, aprotocol: IGESData_Protocol): void;

  // IGESData_GlobalNodeOfWriterLib.Module (method)
  Module(): IGESData_ReadWriteModule;

  // IGESData_GlobalNodeOfWriterLib.Protocol (method)
  Protocol(): IGESData_Protocol;

  // IGESData_GlobalNodeOfWriterLib.Next (method)
  Next(): IGESData_GlobalNodeOfWriterLib;

  // IGESData_GlobalNodeOfWriterLib.get_type_name (method)
  static get_type_name(): string;

  // IGESData_GlobalNodeOfWriterLib.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_GlobalNodeOfWriterLib.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_GlobalNodeOfWriterLib.delete (method)
  delete(): void;

  // IGESData_GlobalNodeOfWriterLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_GlobalSection: declare class IGESData_GlobalSection

  // IGESData_GlobalSection.constructor (constructor)
  constructor();

  // IGESData_GlobalSection.Init (method)
  Init(params: Interface_ParamSet): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESData_GlobalSection.CopyRefs (method)
  CopyRefs(): void;

  // IGESData_GlobalSection.Params (method)
  Params(): Interface_ParamSet;

  // IGESData_GlobalSection.TranslatedFromHollerith (method)
  TranslatedFromHollerith(astr: TCollection_HAsciiString): TCollection_HAsciiString;

  // IGESData_GlobalSection.Separator (method)
  Separator(): string;

  // IGESData_GlobalSection.EndMark (method)
  EndMark(): string;

  // IGESData_GlobalSection.SendName (method)
  SendName(): TCollection_HAsciiString;

  // IGESData_GlobalSection.FileName (method)
  FileName(): TCollection_HAsciiString;

  // IGESData_GlobalSection.SystemId (method)
  SystemId(): TCollection_HAsciiString;

  // IGESData_GlobalSection.InterfaceVersion (method)
  InterfaceVersion(): TCollection_HAsciiString;

  // IGESData_GlobalSection.IntegerBits (method)
  IntegerBits(): number;

  // IGESData_GlobalSection.MaxPower10Single (method)
  MaxPower10Single(): number;

  // IGESData_GlobalSection.MaxDigitsSingle (method)
  MaxDigitsSingle(): number;

  // IGESData_GlobalSection.MaxPower10Double (method)
  MaxPower10Double(): number;

  // IGESData_GlobalSection.MaxDigitsDouble (method)
  MaxDigitsDouble(): number;

  // IGESData_GlobalSection.ReceiveName (method)
  ReceiveName(): TCollection_HAsciiString;

  // IGESData_GlobalSection.Scale (method)
  Scale(): number;

  // IGESData_GlobalSection.CascadeUnit (method)
  CascadeUnit(): number;

  // IGESData_GlobalSection.UnitFlag (method)
  UnitFlag(): number;

  // IGESData_GlobalSection.UnitName (method)
  UnitName(): TCollection_HAsciiString;

  // IGESData_GlobalSection.LineWeightGrad (method)
  LineWeightGrad(): number;

  // IGESData_GlobalSection.MaxLineWeight (method)
  MaxLineWeight(): number;

  // IGESData_GlobalSection.Date (method)
  Date(): TCollection_HAsciiString;

  // IGESData_GlobalSection.Resolution (method)
  Resolution(): number;

  // IGESData_GlobalSection.MaxCoord (method)
  MaxCoord(): number;

  // IGESData_GlobalSection.HasMaxCoord (method)
  HasMaxCoord(): boolean;

  // IGESData_GlobalSection.AuthorName (method)
  AuthorName(): TCollection_HAsciiString;

  // IGESData_GlobalSection.CompanyName (method)
  CompanyName(): TCollection_HAsciiString;

  // IGESData_GlobalSection.IGESVersion (method)
  IGESVersion(): number;

  // IGESData_GlobalSection.DraftingStandard (method)
  DraftingStandard(): number;

  // IGESData_GlobalSection.LastChangeDate (method)
  LastChangeDate(): TCollection_HAsciiString;

  // IGESData_GlobalSection.HasLastChangeDate (method)
  HasLastChangeDate(): boolean;

  // IGESData_GlobalSection.SetLastChangeDate (method)
  SetLastChangeDate(): void;
  SetLastChangeDate(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.ApplicationProtocol (method)
  ApplicationProtocol(): TCollection_HAsciiString;

  // IGESData_GlobalSection.HasApplicationProtocol (method)
  HasApplicationProtocol(): boolean;

  // IGESData_GlobalSection.NewDateString (method)
  static NewDateString(year: number, month: number, day: number, hour: number, minut: number, second: number, mode: number): TCollection_HAsciiString;
  static NewDateString(date: TCollection_HAsciiString, mode: number): TCollection_HAsciiString;

  // IGESData_GlobalSection.UnitValue (method)
  UnitValue(): number;

  // IGESData_GlobalSection.SetSeparator (method)
  SetSeparator(val: string): void;

  // IGESData_GlobalSection.SetEndMark (method)
  SetEndMark(val: string): void;

  // IGESData_GlobalSection.SetSendName (method)
  SetSendName(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.SetFileName (method)
  SetFileName(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.SetSystemId (method)
  SetSystemId(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.SetInterfaceVersion (method)
  SetInterfaceVersion(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.SetIntegerBits (method)
  SetIntegerBits(val: number): void;

  // IGESData_GlobalSection.SetMaxPower10Single (method)
  SetMaxPower10Single(val: number): void;

  // IGESData_GlobalSection.SetMaxDigitsSingle (method)
  SetMaxDigitsSingle(val: number): void;

  // IGESData_GlobalSection.SetMaxPower10Double (method)
  SetMaxPower10Double(val: number): void;

  // IGESData_GlobalSection.SetMaxDigitsDouble (method)
  SetMaxDigitsDouble(val: number): void;

  // IGESData_GlobalSection.SetReceiveName (method)
  SetReceiveName(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.SetCascadeUnit (method)
  SetCascadeUnit(theUnit: number): void;

  // IGESData_GlobalSection.SetScale (method)
  SetScale(val: number): void;

  // IGESData_GlobalSection.SetUnitFlag (method)
  SetUnitFlag(val: number): void;

  // IGESData_GlobalSection.SetUnitName (method)
  SetUnitName(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.SetLineWeightGrad (method)
  SetLineWeightGrad(val: number): void;

  // IGESData_GlobalSection.SetMaxLineWeight (method)
  SetMaxLineWeight(val: number): void;

  // IGESData_GlobalSection.SetDate (method)
  SetDate(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.SetResolution (method)
  SetResolution(val: number): void;

  // IGESData_GlobalSection.SetMaxCoord (method)
  SetMaxCoord(val?: number): void;

  // IGESData_GlobalSection.MaxMaxCoord (method)
  MaxMaxCoord(val?: number): void;

  // IGESData_GlobalSection.MaxMaxCoords (method)
  MaxMaxCoords(xyz: gp_XYZ): void;

  // IGESData_GlobalSection.SetAuthorName (method)
  SetAuthorName(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.SetCompanyName (method)
  SetCompanyName(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.SetIGESVersion (method)
  SetIGESVersion(val: number): void;

  // IGESData_GlobalSection.SetDraftingStandard (method)
  SetDraftingStandard(val: number): void;

  // IGESData_GlobalSection.SetApplicationProtocol (method)
  SetApplicationProtocol(val: TCollection_HAsciiString): void;

  // IGESData_GlobalSection.delete (method)
  delete(): void;

  // IGESData_GlobalSection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_IGESDumper: declare class IGESData_IGESDumper

  // IGESData_IGESDumper.constructor (constructor)
  constructor(model: IGESData_IGESModel, protocol: IGESData_Protocol);

  // IGESData_IGESDumper.delete (method)
  delete(): void;

  // IGESData_IGESDumper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_IGESEntity: declare class IGESData_IGESEntity extends Standard_Transient

  // IGESData_IGESEntity.IGESType (method)
  IGESType(): IGESData_IGESType;

  // IGESData_IGESEntity.TypeNumber (method)
  TypeNumber(): number;

  // IGESData_IGESEntity.FormNumber (method)
  FormNumber(): number;

  // IGESData_IGESEntity.DirFieldEntity (method)
  DirFieldEntity(fieldnum: number): IGESData_IGESEntity;

  // IGESData_IGESEntity.HasStructure (method)
  HasStructure(): boolean;

  // IGESData_IGESEntity.Structure (method)
  Structure(): IGESData_IGESEntity;

  // IGESData_IGESEntity.DefLineFont (method)
  DefLineFont(): IGESData_DefType;

  // IGESData_IGESEntity.RankLineFont (method)
  RankLineFont(): number;

  // IGESData_IGESEntity.LineFont (method)
  LineFont(): IGESData_LineFontEntity;

  // IGESData_IGESEntity.DefLevel (method)
  DefLevel(): IGESData_DefList;

  // IGESData_IGESEntity.Level (method)
  Level(): number;

  // IGESData_IGESEntity.LevelList (method)
  LevelList(): IGESData_LevelListEntity;

  // IGESData_IGESEntity.DefView (method)
  DefView(): IGESData_DefList;

  // IGESData_IGESEntity.View (method)
  View(): IGESData_ViewKindEntity;

  // IGESData_IGESEntity.SingleView (method)
  SingleView(): IGESData_ViewKindEntity;

  // IGESData_IGESEntity.ViewList (method)
  ViewList(): IGESData_ViewKindEntity;

  // IGESData_IGESEntity.HasTransf (method)
  HasTransf(): boolean;

  // IGESData_IGESEntity.Transf (method)
  Transf(): IGESData_TransfEntity;

  // IGESData_IGESEntity.HasLabelDisplay (method)
  HasLabelDisplay(): boolean;

  // IGESData_IGESEntity.LabelDisplay (method)
  LabelDisplay(): IGESData_LabelDisplayEntity;

  // IGESData_IGESEntity.BlankStatus (method)
  BlankStatus(): number;

  // IGESData_IGESEntity.SubordinateStatus (method)
  SubordinateStatus(): number;

  // IGESData_IGESEntity.UseFlag (method)
  UseFlag(): number;

  // IGESData_IGESEntity.HierarchyStatus (method)
  HierarchyStatus(): number;

  // IGESData_IGESEntity.LineWeightNumber (method)
  LineWeightNumber(): number;

  // IGESData_IGESEntity.LineWeight (method)
  LineWeight(): number;

  // IGESData_IGESEntity.DefColor (method)
  DefColor(): IGESData_DefType;

  // IGESData_IGESEntity.RankColor (method)
  RankColor(): number;

  // IGESData_IGESEntity.Color (method)
  Color(): IGESData_ColorEntity;

  // IGESData_IGESEntity.CResValues (method)
  CResValues(res1: string, res2: string): boolean;

  // IGESData_IGESEntity.HasShortLabel (method)
  HasShortLabel(): boolean;

  // IGESData_IGESEntity.ShortLabel (method)
  ShortLabel(): TCollection_HAsciiString;

  // IGESData_IGESEntity.HasSubScriptNumber (method)
  HasSubScriptNumber(): boolean;

  // IGESData_IGESEntity.SubScriptNumber (method)
  SubScriptNumber(): number;

  // IGESData_IGESEntity.InitDirFieldEntity (method)
  InitDirFieldEntity(fieldnum: number, ent: IGESData_IGESEntity): void;

  // IGESData_IGESEntity.InitTransf (method)
  InitTransf(ent: IGESData_TransfEntity): void;

  // IGESData_IGESEntity.InitView (method)
  InitView(ent: IGESData_ViewKindEntity): void;

  // IGESData_IGESEntity.InitLineFont (method)
  InitLineFont(ent: IGESData_LineFontEntity, rank?: number): void;

  // IGESData_IGESEntity.InitLevel (method)
  InitLevel(ent: IGESData_LevelListEntity, val?: number): void;

  // IGESData_IGESEntity.InitColor (method)
  InitColor(ent: IGESData_ColorEntity, rank?: number): void;

  // IGESData_IGESEntity.InitStatus (method)
  InitStatus(blank: number, subordinate: number, useflag: number, hierarchy: number): void;

  // IGESData_IGESEntity.SetLabel (method)
  SetLabel(label: TCollection_HAsciiString, sub?: number): void;

  // IGESData_IGESEntity.InitMisc (method)
  InitMisc(str: IGESData_IGESEntity, lab: IGESData_LabelDisplayEntity, weightnum: number): void;

  // IGESData_IGESEntity.HasOneParent (method)
  HasOneParent(): boolean;

  // IGESData_IGESEntity.UniqueParent (method)
  UniqueParent(): IGESData_IGESEntity;

  // IGESData_IGESEntity.Location (method)
  Location(): gp_GTrsf;

  // IGESData_IGESEntity.VectorLocation (method)
  VectorLocation(): gp_GTrsf;

  // IGESData_IGESEntity.CompoundLocation (method)
  CompoundLocation(): gp_GTrsf;

  // IGESData_IGESEntity.HasName (method)
  HasName(): boolean;

  // IGESData_IGESEntity.NameValue (method)
  NameValue(): TCollection_HAsciiString;

  // IGESData_IGESEntity.ArePresentAssociativities (method)
  ArePresentAssociativities(): boolean;

  // IGESData_IGESEntity.NbAssociativities (method)
  NbAssociativities(): number;

  // IGESData_IGESEntity.NbTypedAssociativities (method)
  NbTypedAssociativities(atype: Standard_Type): number;

  // IGESData_IGESEntity.TypedAssociativity (method)
  TypedAssociativity(atype: Standard_Type): IGESData_IGESEntity;

  // IGESData_IGESEntity.Associate (method)
  Associate(ent: IGESData_IGESEntity): void;

  // IGESData_IGESEntity.Dissociate (method)
  Dissociate(ent: IGESData_IGESEntity): void;

  // IGESData_IGESEntity.ArePresentProperties (method)
  ArePresentProperties(): boolean;

  // IGESData_IGESEntity.NbProperties (method)
  NbProperties(): number;

  // IGESData_IGESEntity.NbTypedProperties (method)
  NbTypedProperties(atype: Standard_Type): number;

  // IGESData_IGESEntity.TypedProperty (method)
  TypedProperty(atype: Standard_Type, anum?: number): IGESData_IGESEntity;

  // IGESData_IGESEntity.AddProperty (method)
  AddProperty(ent: IGESData_IGESEntity): void;

  // IGESData_IGESEntity.RemoveProperty (method)
  RemoveProperty(ent: IGESData_IGESEntity): void;

  // IGESData_IGESEntity.SetLineWeight (method)
  SetLineWeight(defw: number, maxw: number, gradw: number): void;

  // IGESData_IGESEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESData_IGESEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_IGESEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_IGESEntity.delete (method)
  delete(): void;

  // IGESData_IGESEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_IGESModel: declare class IGESData_IGESModel extends Interface_InterfaceModel

  // IGESData_IGESModel.constructor (constructor)
  constructor();

  // IGESData_IGESModel.ClearHeader (method)
  ClearHeader(): void;

  // IGESData_IGESModel.StartSection (method)
  StartSection(): NCollection_HSequence_handle_TCollection_HAsciiString;

  // IGESData_IGESModel.NbStartLines (method)
  NbStartLines(): number;

  // IGESData_IGESModel.StartLine (method)
  StartLine(num: number): string;

  // IGESData_IGESModel.ClearStartSection (method)
  ClearStartSection(): void;

  // IGESData_IGESModel.SetStartSection (method)
  SetStartSection(list: NCollection_HSequence_handle_TCollection_HAsciiString, copy?: boolean): void;

  // IGESData_IGESModel.AddStartLine (method)
  AddStartLine(line: string, atnum?: number): void;

  // IGESData_IGESModel.GlobalSection (method)
  GlobalSection(): IGESData_GlobalSection;

  // IGESData_IGESModel.ChangeGlobalSection (method)
  ChangeGlobalSection(): IGESData_GlobalSection;

  // IGESData_IGESModel.SetGlobalSection (method)
  SetGlobalSection(header: IGESData_GlobalSection): void;

  // IGESData_IGESModel.ApplyStatic (method)
  ApplyStatic(param?: string): boolean;

  // IGESData_IGESModel.Entity (method)
  Entity(num: number): IGESData_IGESEntity;

  // IGESData_IGESModel.DNum (method)
  DNum(ent: IGESData_IGESEntity): number;

  // IGESData_IGESModel.GetFromAnother (method)
  GetFromAnother(other: Interface_InterfaceModel): void;

  // IGESData_IGESModel.NewEmptyModel (method)
  NewEmptyModel(): Interface_InterfaceModel;

  // IGESData_IGESModel.VerifyCheck (method)
  VerifyCheck(): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESData_IGESModel.SetLineWeights (method)
  SetLineWeights(defw: number): void;

  // IGESData_IGESModel.ClearLabels (method)
  ClearLabels(): void;

  // IGESData_IGESModel.StringLabel (method)
  StringLabel(ent: Standard_Transient): TCollection_HAsciiString;

  // IGESData_IGESModel.get_type_name (method)
  static get_type_name(): string;

  // IGESData_IGESModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_IGESModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_IGESModel.delete (method)
  delete(): void;

  // IGESData_IGESModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_IGESReaderTool: declare class IGESData_IGESReaderTool extends Interface_FileReaderTool

  // IGESData_IGESReaderTool.Prepare (method)
  Prepare(reco: IGESData_FileRecognizer): void;

  // IGESData_IGESReaderTool.Recognize (method)
  Recognize(num: number): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

  // IGESData_IGESReaderTool.BeginRead (method)
  BeginRead(amodel: Interface_InterfaceModel): void;

  // IGESData_IGESReaderTool.AnalyseRecord (method)
  AnalyseRecord(num: number, anent: Standard_Transient): { returnValue: boolean; acheck: Interface_Check; [Symbol.dispose](): void };

  // IGESData_IGESReaderTool.EndRead (method)
  EndRead(amodel: Interface_InterfaceModel): void;

  // IGESData_IGESReaderTool.delete (method)
  delete(): void;

  // IGESData_IGESReaderTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_IGESType: declare class IGESData_IGESType

  // IGESData_IGESType.constructor (constructor)
  constructor();
  constructor(atype: number, aform: number);

  // IGESData_IGESType.Type (method)
  Type(): number;

  // IGESData_IGESType.Form (method)
  Form(): number;

  // IGESData_IGESType.IsEqual (method)
  IsEqual(another: IGESData_IGESType): boolean;

  // IGESData_IGESType.Nullify (method)
  Nullify(): void;

  // IGESData_IGESType.delete (method)
  delete(): void;

  // IGESData_IGESType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_IGESWriter: declare class IGESData_IGESWriter

  // IGESData_IGESWriter.constructor (constructor)
  constructor();
  constructor(amodel: IGESData_IGESModel);
  constructor(other: IGESData_IGESWriter);

  // IGESData_IGESWriter.FloatWriter (method)
  FloatWriter(): Interface_FloatWriter;

  // IGESData_IGESWriter.WriteMode (method)
  WriteMode(): number;

  // IGESData_IGESWriter.SendStartLine (method)
  SendStartLine(startline: string): void;

  // IGESData_IGESWriter.SendModel (method)
  SendModel(protocol: IGESData_Protocol): void;

  // IGESData_IGESWriter.SectionS (method)
  SectionS(): void;

  // IGESData_IGESWriter.SectionG (method)
  SectionG(header: IGESData_GlobalSection): void;

  // IGESData_IGESWriter.SectionsDP (method)
  SectionsDP(): void;

  // IGESData_IGESWriter.SectionT (method)
  SectionT(): void;

  // IGESData_IGESWriter.DirPart (method)
  DirPart(anent: IGESData_IGESEntity): void;

  // IGESData_IGESWriter.OwnParams (method)
  OwnParams(anent: IGESData_IGESEntity): void;

  // IGESData_IGESWriter.Associativities (method)
  Associativities(anent: IGESData_IGESEntity): void;

  // IGESData_IGESWriter.Properties (method)
  Properties(anent: IGESData_IGESEntity): void;

  // IGESData_IGESWriter.EndEntity (method)
  EndEntity(): void;

  // IGESData_IGESWriter.SendVoid (method)
  SendVoid(): void;

  // IGESData_IGESWriter.Send (method)
  Send(val: number): void;
  Send(val: TCollection_HAsciiString): void;
  Send(val: gp_XY): void;
  Send(val: gp_XYZ): void;
  Send(val: IGESData_IGESEntity, negative: boolean): void;

  // IGESData_IGESWriter.SendBoolean (method)
  SendBoolean(val: boolean): void;

  // IGESData_IGESWriter.SendString (method)
  SendString(val: TCollection_HAsciiString): void;

  // IGESData_IGESWriter.SectionStrings (method)
  SectionStrings(numsec: number): NCollection_HSequence_handle_TCollection_HAsciiString;

  // IGESData_IGESWriter.delete (method)
  delete(): void;

  // IGESData_IGESWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_LabelDisplayEntity: declare class IGESData_LabelDisplayEntity extends IGESData_IGESEntity

  // IGESData_LabelDisplayEntity.constructor (constructor)
  constructor();

  // IGESData_LabelDisplayEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESData_LabelDisplayEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_LabelDisplayEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_LabelDisplayEntity.delete (method)
  delete(): void;

  // IGESData_LabelDisplayEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_LevelListEntity: declare class IGESData_LevelListEntity extends IGESData_IGESEntity

  // IGESData_LevelListEntity.NbLevelNumbers (method)
  NbLevelNumbers(): number;

  // IGESData_LevelListEntity.LevelNumber (method)
  LevelNumber(num: number): number;

  // IGESData_LevelListEntity.HasLevelNumber (method)
  HasLevelNumber(level: number): boolean;

  // IGESData_LevelListEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESData_LevelListEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_LevelListEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_LevelListEntity.delete (method)
  delete(): void;

  // IGESData_LevelListEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_LineFontEntity: declare class IGESData_LineFontEntity extends IGESData_IGESEntity

  // IGESData_LineFontEntity.constructor (constructor)
  constructor();

  // IGESData_LineFontEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESData_LineFontEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_LineFontEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_LineFontEntity.delete (method)
  delete(): void;

  // IGESData_LineFontEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_NameEntity: declare class IGESData_NameEntity extends IGESData_IGESEntity

  // IGESData_NameEntity.Value (method)
  Value(): TCollection_HAsciiString;

  // IGESData_NameEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESData_NameEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_NameEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_NameEntity.delete (method)
  delete(): void;

  // IGESData_NameEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_NodeOfSpecificLib: declare class IGESData_NodeOfSpecificLib extends Standard_Transient

  // IGESData_NodeOfSpecificLib.constructor (constructor)
  constructor();

  // IGESData_NodeOfSpecificLib.AddNode (method)
  AddNode(anode: IGESData_GlobalNodeOfSpecificLib): void;

  // IGESData_NodeOfSpecificLib.Module (method)
  Module(): IGESData_SpecificModule;

  // IGESData_NodeOfSpecificLib.Protocol (method)
  Protocol(): IGESData_Protocol;

  // IGESData_NodeOfSpecificLib.Next (method)
  Next(): IGESData_NodeOfSpecificLib;

  // IGESData_NodeOfSpecificLib.get_type_name (method)
  static get_type_name(): string;

  // IGESData_NodeOfSpecificLib.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_NodeOfSpecificLib.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_NodeOfSpecificLib.delete (method)
  delete(): void;

  // IGESData_NodeOfSpecificLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_NodeOfWriterLib: declare class IGESData_NodeOfWriterLib extends Standard_Transient

  // IGESData_NodeOfWriterLib.constructor (constructor)
  constructor();

  // IGESData_NodeOfWriterLib.AddNode (method)
  AddNode(anode: IGESData_GlobalNodeOfWriterLib): void;

  // IGESData_NodeOfWriterLib.Module (method)
  Module(): IGESData_ReadWriteModule;

  // IGESData_NodeOfWriterLib.Protocol (method)
  Protocol(): IGESData_Protocol;

  // IGESData_NodeOfWriterLib.Next (method)
  Next(): IGESData_NodeOfWriterLib;

  // IGESData_NodeOfWriterLib.get_type_name (method)
  static get_type_name(): string;

  // IGESData_NodeOfWriterLib.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_NodeOfWriterLib.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_NodeOfWriterLib.delete (method)
  delete(): void;

  // IGESData_NodeOfWriterLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_ParamCursor: declare class IGESData_ParamCursor

  // IGESData_ParamCursor.constructor (constructor)
  constructor(num: number);
  constructor(num: number, nb: number, size?: number);

  // IGESData_ParamCursor.SetTerm (method)
  SetTerm(size: number, autoadv?: boolean): void;

  // IGESData_ParamCursor.SetOne (method)
  SetOne(autoadv?: boolean): void;

  // IGESData_ParamCursor.SetXY (method)
  SetXY(autoadv?: boolean): void;

  // IGESData_ParamCursor.SetXYZ (method)
  SetXYZ(autoadv?: boolean): void;

  // IGESData_ParamCursor.SetAdvance (method)
  SetAdvance(advance: boolean): void;

  // IGESData_ParamCursor.Start (method)
  Start(): number;

  // IGESData_ParamCursor.Limit (method)
  Limit(): number;

  // IGESData_ParamCursor.Count (method)
  Count(): number;

  // IGESData_ParamCursor.ItemSize (method)
  ItemSize(): number;

  // IGESData_ParamCursor.TermSize (method)
  TermSize(): number;

  // IGESData_ParamCursor.Offset (method)
  Offset(): number;

  // IGESData_ParamCursor.Advance (method)
  Advance(): boolean;

  // IGESData_ParamCursor.delete (method)
  delete(): void;

  // IGESData_ParamCursor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_Protocol: declare class IGESData_Protocol extends Interface_Protocol

  // IGESData_Protocol.constructor (constructor)
  constructor();

  // IGESData_Protocol.NbResources (method)
  NbResources(): number;

  // IGESData_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // IGESData_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // IGESData_Protocol.NewModel (method)
  NewModel(): Interface_InterfaceModel;

  // IGESData_Protocol.IsSuitableModel (method)
  IsSuitableModel(model: Interface_InterfaceModel): boolean;

  // IGESData_Protocol.UnknownEntity (method)
  UnknownEntity(): Standard_Transient;

  // IGESData_Protocol.IsUnknownEntity (method)
  IsUnknownEntity(ent: Standard_Transient): boolean;

  // IGESData_Protocol.get_type_name (method)
  static get_type_name(): string;

  // IGESData_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_Protocol.delete (method)
  delete(): void;

  // IGESData_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_ReadStage: typeof IGESData_ReadStage[keyof typeof IGESData_ReadStage]

  readonly IGESData_ReadDir: 'IGESData_ReadDir'

  readonly IGESData_ReadOwn: 'IGESData_ReadOwn'

  readonly IGESData_ReadAssocs: 'IGESData_ReadAssocs'

  readonly IGESData_ReadProps: 'IGESData_ReadProps'

  readonly IGESData_ReadEnd: 'IGESData_ReadEnd'
