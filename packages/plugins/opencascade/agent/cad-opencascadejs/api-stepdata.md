# libcascade — StepData

31 top-level symbols. Signatures are verbatim typescript.

StepData: declare class StepData

  constructor

  static HeaderProtocol(): StepData_Protocol;

  static AddHeaderProtocol(headerproto: StepData_Protocol): void;

  static Init(): void;

  static Protocol(): StepData_Protocol;

  delete(): void;

  [Symbol.dispose](): void;

StepData_Described: declare class StepData_Described extends Standard_Transient

  Description(): StepData_EDescr;

  IsComplex(): boolean;

  Matches(steptype: string): boolean;

  As(steptype: string): StepData_Simple;

  HasField(name: string): boolean;

  Field(name: string): StepData_Field;

  CField(name: string): StepData_Field;

  Check(): { ach: Interface_Check; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_ECDescr: declare class StepData_ECDescr extends StepData_EDescr

  constructor

  Add(member: StepData_ESDescr): void;

  NbMembers(): number;

  Member(num: number): StepData_ESDescr;

  TypeList(): NCollection_HSequence_TCollection_AsciiString;

  Matches(steptype: string): boolean;

  IsComplex(): boolean;

  NewEntity(): StepData_Described;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_EDescr: declare class StepData_EDescr extends Standard_Transient

  Matches(steptype: string): boolean;

  IsComplex(): boolean;

  NewEntity(): StepData_Described;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_ESDescr: declare class StepData_ESDescr extends StepData_EDescr

  constructor

  SetNbFields(nb: number): void;

  SetField(num: number, name: string, descr: StepData_PDescr): void;

  SetBase(base: StepData_ESDescr): void;

  SetSuper(super_: StepData_ESDescr): void;

  TypeName(): string;

  StepType(): TCollection_AsciiString;

  Base(): StepData_ESDescr;

  Super(): StepData_ESDescr;

  IsSub(other: StepData_ESDescr): boolean;

  NbFields(): number;

  Rank(name: string): number;

  Name(num: number): string;

  Field(num: number): StepData_PDescr;

  NamedField(name: string): StepData_PDescr;

  Matches(steptype: string): boolean;

  IsComplex(): boolean;

  NewEntity(): StepData_Described;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_EnumTool: declare class StepData_EnumTool

  constructor

  AddDefinition(term: string): void;

  IsSet(): boolean;

  MaxValue(): number;

  Optional(mode: boolean): void;

  NullValue(): number;

  Text(num: number): TCollection_AsciiString;

  Value(txt: string): number;
  Value(txt: TCollection_AsciiString): number;
  Value(txt: string): number;
  Value(txt: TCollection_AsciiString): number;

  delete(): void;

  [Symbol.dispose](): void;

StepData_Factors: declare class StepData_Factors

  constructor

  InitializeFactors(theLengthFactor: number, thePlaneAngleFactor: number, theSolidAngleFactor: number): void;

  SetCascadeUnit(theUnit: number): void;

  CascadeUnit(): number;

  LengthFactor(): number;

  PlaneAngleFactor(): number;

  SolidAngleFactor(): number;

  FactorRadianDegree(): number;

  FactorDegreeRadian(): number;

  delete(): void;

  [Symbol.dispose](): void;

StepData_Field: declare class StepData_Field

  constructor

  CopyFrom(other: StepData_Field): void;

  Clear(kind?: number): void;

  SetDerived(): void;

  SetInt(val: number): void;
  SetInt(num: number, val: number, kind: number): void;
  SetInt(val: number): void;
  SetInt(num: number, val: number, kind: number): void;

  SetInteger(val: number): void;
  SetInteger(num: number, val: number): void;
  SetInteger(val: number): void;
  SetInteger(num: number, val: number): void;

  SetBoolean(val: boolean): void;
  SetBoolean(num: number, val: boolean): void;
  SetBoolean(val: boolean): void;
  SetBoolean(num: number, val: boolean): void;

  SetLogical(val: StepData_Logical): void;
  SetLogical(num: number, val: StepData_Logical): void;
  SetLogical(val: StepData_Logical): void;
  SetLogical(num: number, val: StepData_Logical): void;

  SetReal(val: number): void;
  SetReal(num: number, val: number): void;
  SetReal(val: number): void;
  SetReal(num: number, val: number): void;

  SetString(val: string): void;
  SetString(num: number, val: string): void;
  SetString(val: string): void;
  SetString(num: number, val: string): void;

  SetEnum(val: number, text: string): void;
  SetEnum(num: number, val: number, text: string): void;
  SetEnum(val: number, text: string): void;
  SetEnum(num: number, val: number, text: string): void;

  SetSelectMember(val: StepData_SelectMember): void;

  SetEntity(val: Standard_Transient): void;
  SetEntity(): void;
  SetEntity(num: number, val: Standard_Transient): void;
  SetEntity(val: Standard_Transient): void;
  SetEntity(): void;
  SetEntity(num: number, val: Standard_Transient): void;
  SetEntity(val: Standard_Transient): void;
  SetEntity(): void;
  SetEntity(num: number, val: Standard_Transient): void;

  SetList(size: number, first?: number): void;

  SetList2(siz1: number, siz2: number, f1?: number, f2?: number): void;

  Set(val: Standard_Transient): void;

  ClearItem(num: number): void;

  IsSet(n1?: number, n2?: number): boolean;

  ItemKind(n1?: number, n2?: number): number;

  Kind(type_?: boolean): number;

  Arity(): number;

  Length(index?: number): number;

  Lower(index?: number): number;

  Int(): number;

  Integer(n1?: number, n2?: number): number;

  Boolean(n1?: number, n2?: number): boolean;

  Logical(n1?: number, n2?: number): StepData_Logical;

  Real(n1?: number, n2?: number): number;

  String(n1: number, n2: number): string;

  Enum(n1?: number, n2?: number): number;

  EnumText(n1: number, n2: number): string;

  Entity(n1?: number, n2?: number): Standard_Transient;

  Transient(): Standard_Transient;

  delete(): void;

  [Symbol.dispose](): void;

StepData_FieldList: declare class StepData_FieldList

  constructor

  NbFields(): number;

  Field(num: number): StepData_Field;

  CField(num: number): StepData_Field;

  delete(): void;

  [Symbol.dispose](): void;

StepData_FieldList1: declare class StepData_FieldList1 extends StepData_FieldList

  constructor

  NbFields(): number;

  Field(num: number): StepData_Field;

  CField(num: number): StepData_Field;

  delete(): void;

  [Symbol.dispose](): void;

StepData_FieldListD: declare class StepData_FieldListD extends StepData_FieldList

  constructor

  SetNb(nb: number): void;

  NbFields(): number;

  Field(num: number): StepData_Field;

  CField(num: number): StepData_Field;

  delete(): void;

  [Symbol.dispose](): void;

StepData_FieldListN: declare class StepData_FieldListN extends StepData_FieldList

  constructor

  NbFields(): number;

  Field(num: number): StepData_Field;

  CField(num: number): StepData_Field;

  delete(): void;

  [Symbol.dispose](): void;

StepData_FileProtocol: declare class StepData_FileProtocol extends StepData_Protocol

  constructor

  Add(protocol: StepData_Protocol): void;

  NbResources(): number;

  Resource(num: number): Interface_Protocol;

  TypeNumber(atype: Standard_Type): number;

  SchemaName(theModel: Interface_InterfaceModel): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_FileRecognizer: declare class StepData_FileRecognizer extends Standard_Transient

  Evaluate(akey: TCollection_AsciiString): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

  Result(): Standard_Transient;

  Add(reco: StepData_FileRecognizer): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_GlobalNodeOfWriterLib: declare class StepData_GlobalNodeOfWriterLib extends Standard_Transient

  constructor

  Add(amodule: StepData_ReadWriteModule, aprotocol: StepData_Protocol): void;

  Module(): StepData_ReadWriteModule;

  Protocol(): StepData_Protocol;

  Next(): StepData_GlobalNodeOfWriterLib;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_Logical: typeof StepData_Logical[keyof typeof StepData_Logical]

StepData_NodeOfWriterLib: declare class StepData_NodeOfWriterLib extends Standard_Transient

  constructor

  AddNode(anode: StepData_GlobalNodeOfWriterLib): void;

  Module(): StepData_ReadWriteModule;

  Protocol(): StepData_Protocol;

  Next(): StepData_NodeOfWriterLib;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_PDescr: declare class StepData_PDescr extends Standard_Transient

  constructor

  SetName(name: string): void;

  Name(): string;

  SetSelect(): void;

  AddMember(member: StepData_PDescr): void;

  SetMemberName(memname: string): void;

  SetInteger(): void;

  SetReal(): void;

  SetString(): void;

  SetBoolean(): void;

  SetLogical(): void;

  SetEnum(): void;

  AddEnumDef(enumdef: string): void;

  SetType(atype: Standard_Type): void;

  SetDescr(dscnam: string): void;

  AddArity(arity?: number): void;

  SetArity(arity?: number): void;

  SetFrom(other: StepData_PDescr): void;

  SetOptional(opt?: boolean): void;

  SetDerived(der?: boolean): void;

  SetField(name: string, rank: number): void;

  IsSelect(): boolean;

  Member(name: string): StepData_PDescr;

  IsInteger(): boolean;

  IsReal(): boolean;

  IsString(): boolean;

  IsBoolean(): boolean;

  IsLogical(): boolean;

  IsEnum(): boolean;

  EnumMax(): number;

  EnumValue(name: string): number;

  EnumText(val: number): string;

  IsEntity(): boolean;

  IsType(atype: Standard_Type): boolean;

  Type(): Standard_Type;

  IsDescr(descr: StepData_EDescr): boolean;

  DescrName(): string;

  Arity(): number;

  Simple(): StepData_PDescr;

  IsOptional(): boolean;

  IsDerived(): boolean;

  IsField(): boolean;

  FieldName(): string;

  FieldRank(): number;

  Check(afild: StepData_Field): { ach: Interface_Check; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_Plex: declare class StepData_Plex extends StepData_Described

  constructor

  Add(member: StepData_Simple): void;

  ECDescr(): StepData_ECDescr;

  IsComplex(): boolean;

  Matches(steptype: string): boolean;

  As(steptype: string): StepData_Simple;

  HasField(name: string): boolean;

  Field(name: string): StepData_Field;

  CField(name: string): StepData_Field;

  NbMembers(): number;

  Member(num: number): StepData_Simple;

  TypeList(): NCollection_HSequence_TCollection_AsciiString;

  Check(): { ach: Interface_Check; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_Protocol: declare class StepData_Protocol extends Interface_Protocol

  constructor

  NbResources(): number;

  Resource(num: number): Interface_Protocol;

  CaseNumber(obj: Standard_Transient): number;

  TypeNumber(atype: Standard_Type): number;

  SchemaName(theModel: Interface_InterfaceModel): string;

  NewModel(): Interface_InterfaceModel;

  IsSuitableModel(model: Interface_InterfaceModel): boolean;

  UnknownEntity(): Standard_Transient;

  IsUnknownEntity(ent: Standard_Transient): boolean;

  DescrNumber(adescr: StepData_EDescr): number;

  AddDescr(adescr: StepData_EDescr, CN: number): void;

  HasDescr(): boolean;

  Descr(num: number): StepData_EDescr;
  Descr(name: string, anylevel: boolean): StepData_EDescr;
  Descr(num: number): StepData_EDescr;
  Descr(name: string, anylevel: boolean): StepData_EDescr;

  ESDescr(name: string, anylevel?: boolean): StepData_ESDescr;

  ECDescr(names: NCollection_Sequence_TCollection_AsciiString, anylevel?: boolean): StepData_ECDescr;

  AddPDescr(pdescr: StepData_PDescr): void;

  PDescr(name: string, anylevel?: boolean): StepData_PDescr;

  AddBasicDescr(esdescr: StepData_ESDescr): void;

  BasicDescr(name: string, anylevel?: boolean): StepData_EDescr;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_ReadWriteModule: declare class StepData_ReadWriteModule extends Interface_ReaderModule

  CaseStep(atype: TCollection_AsciiString): number;
  CaseStep(types: NCollection_Sequence_TCollection_AsciiString): number;
  CaseStep(atype: TCollection_AsciiString): number;
  CaseStep(types: NCollection_Sequence_TCollection_AsciiString): number;

  IsComplex(CN: number): boolean;

  StepType(CN: number): string;

  ShortType(CN: number): TCollection_AsciiString;

  ComplexType(CN: number, types: NCollection_Sequence_TCollection_AsciiString): boolean;

  WriteStep(CN: number, SW: StepData_StepWriter, ent: Standard_Transient): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_SelectArrReal: declare class StepData_SelectArrReal extends StepData_SelectNamed

  constructor

  Kind(): number;

  ArrReal(): NCollection_HArray1_double;

  SetArrReal(arr: NCollection_HArray1_double): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_SelectInt: declare class StepData_SelectInt extends StepData_SelectMember

  constructor

  Kind(): number;

  SetKind(kind: number): void;

  Int(): number;

  SetInt(val: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_SelectMember: declare class StepData_SelectMember extends Standard_Transient

  constructor

  HasName(): boolean;

  Name(): string;

  SetName(name: string): boolean;

  Matches(name: string): boolean;

  Kind(): number;

  SetKind(kind: number): void;

  ParamType(): Interface_ParamType;

  Int(): number;

  SetInt(val: number): void;

  Integer(): number;

  SetInteger(val: number): void;

  Boolean(): boolean;

  SetBoolean(val: boolean): void;

  Logical(): StepData_Logical;

  SetLogical(val: StepData_Logical): void;

  Real(): number;

  SetReal(val: number): void;

  String(): string;

  SetString(val: string): void;

  Enum(): number;

  EnumText(): string;

  SetEnum(val: number, text?: string): void;

  SetEnumText(val: number, text: string): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_SelectNamed: declare class StepData_SelectNamed extends StepData_SelectMember

  constructor

  HasName(): boolean;

  Name(): string;

  SetName(name: string): boolean;

  Field(): StepData_Field;

  CField(): StepData_Field;

  Kind(): number;

  SetKind(kind: number): void;

  Int(): number;

  SetInt(val: number): void;

  Real(): number;

  SetReal(val: number): void;

  String(): string;

  SetString(val: string): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_SelectReal: declare class StepData_SelectReal extends StepData_SelectMember

  constructor

  Kind(): number;

  Real(): number;

  SetReal(val: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_SelectType: declare class StepData_SelectType

  CaseNum(ent: Standard_Transient): number;

  Matches(ent: Standard_Transient): boolean;

  SetValue(ent: Standard_Transient): void;

  Nullify(): void;

  Value(): Standard_Transient;

  IsNull(): boolean;

  Type(): Standard_Type;

  CaseNumber(): number;

  Description(): StepData_PDescr;

  NewMember(): StepData_SelectMember;

  CaseMem(ent: StepData_SelectMember): number;

  CaseMember(): number;

  Member(): StepData_SelectMember;

  SelectName(): string;

  Int(): number;

  SetInt(val: number): void;

  Integer(): number;

  SetInteger(val: number, name?: string): void;

  Boolean(): boolean;

  SetBoolean(val: boolean, name?: string): void;

  Logical(): StepData_Logical;

  SetLogical(val: StepData_Logical, name?: string): void;

  Real(): number;

  SetReal(val: number, name?: string): void;

  delete(): void;

  [Symbol.dispose](): void;

StepData_Simple: declare class StepData_Simple extends StepData_Described

  constructor

  ESDescr(): StepData_ESDescr;

  StepType(): string;

  IsComplex(): boolean;

  Matches(steptype: string): boolean;

  As(steptype: string): StepData_Simple;

  HasField(name: string): boolean;

  Field(name: string): StepData_Field;

  CField(name: string): StepData_Field;

  NbFields(): number;

  FieldNum(num: number): StepData_Field;

  CFieldNum(num: number): StepData_Field;

  Fields(): StepData_FieldListN;

  CFields(): StepData_FieldListN;

  Check(): { ach: Interface_Check; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_StepDumper: declare class StepData_StepDumper

  constructor

  StepWriter(): StepData_StepWriter;

  delete(): void;

  [Symbol.dispose](): void;

StepData_StepModel: declare class StepData_StepModel extends Interface_InterfaceModel

  constructor

  InternalParameters: unknown

  Entity(num: number): Standard_Transient;

  GetFromAnother(other: Interface_InterfaceModel): void;

  NewEmptyModel(): Interface_InterfaceModel;

  HasHeaderEntity(atype: Standard_Type): boolean;

  HeaderEntity(atype: Standard_Type): Standard_Transient;

  ClearHeader(): void;

  AddHeaderEntity(ent: Standard_Transient): void;

  VerifyCheck(): { ach: Interface_Check; [Symbol.dispose](): void };

  ClearLabels(): void;

  SetIdentLabel(ent: Standard_Transient, ident: number): void;

  IdentLabel(ent: Standard_Transient): number;

  StringLabel(ent: Standard_Transient): TCollection_HAsciiString;

  SourceCodePage(): Resource_FormatType;

  SetSourceCodePage(theCode: Resource_FormatType): void;

  SetLocalLengthUnit(theUnit: number): void;

  LocalLengthUnit(): number;

  SetWriteLengthUnit(theUnit: number): void;

  WriteLengthUnit(): number;

  IsInitializedUnit(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepData_StepReaderTool: declare class StepData_StepReaderTool extends Interface_FileReaderTool

  Prepare(optimize: boolean): void;
  Prepare(reco: StepData_FileRecognizer, optimize: boolean): void;
  Prepare(optimize: boolean): void;
  Prepare(reco: StepData_FileRecognizer, optimize: boolean): void;

  Recognize(num: number): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

  PrepareHeader(reco: StepData_FileRecognizer): void;

  BeginRead(amodel: Interface_InterfaceModel): void;

  AnalyseRecord(num: number, anent: Standard_Transient): { returnValue: boolean; acheck: Interface_Check; [Symbol.dispose](): void };

  EndRead(amodel: Interface_InterfaceModel): void;

  delete(): void;

  [Symbol.dispose](): void;
