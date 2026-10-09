# libcascade — StepData

31 top-level symbols. Signatures are verbatim typescript.

StepData: declare class StepData

  // StepData.constructor (constructor)
  constructor();

  // StepData.HeaderProtocol (method)
  static HeaderProtocol(): StepData_Protocol;

  // StepData.AddHeaderProtocol (method)
  static AddHeaderProtocol(headerproto: StepData_Protocol): void;

  // StepData.Init (method)
  static Init(): void;

  // StepData.Protocol (method)
  static Protocol(): StepData_Protocol;

  // StepData.delete (method)
  delete(): void;

  // StepData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_Described: declare class StepData_Described extends Standard_Transient

  // StepData_Described.Description (method)
  Description(): StepData_EDescr;

  // StepData_Described.IsComplex (method)
  IsComplex(): boolean;

  // StepData_Described.Matches (method)
  Matches(steptype: string): boolean;

  // StepData_Described.As (method)
  As(steptype: string): StepData_Simple;

  // StepData_Described.HasField (method)
  HasField(name: string): boolean;

  // StepData_Described.Field (method)
  Field(name: string): StepData_Field;

  // StepData_Described.CField (method)
  CField(name: string): StepData_Field;

  // StepData_Described.Check (method)
  Check(): { ach: Interface_Check; [Symbol.dispose](): void };

  // StepData_Described.get_type_name (method)
  static get_type_name(): string;

  // StepData_Described.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_Described.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_Described.delete (method)
  delete(): void;

  // StepData_Described.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_ECDescr: declare class StepData_ECDescr extends StepData_EDescr

  // StepData_ECDescr.constructor (constructor)
  constructor();

  // StepData_ECDescr.Add (method)
  Add(member: StepData_ESDescr): void;

  // StepData_ECDescr.NbMembers (method)
  NbMembers(): number;

  // StepData_ECDescr.Member (method)
  Member(num: number): StepData_ESDescr;

  // StepData_ECDescr.TypeList (method)
  TypeList(): NCollection_HSequence_TCollection_AsciiString;

  // StepData_ECDescr.Matches (method)
  Matches(steptype: string): boolean;

  // StepData_ECDescr.IsComplex (method)
  IsComplex(): boolean;

  // StepData_ECDescr.NewEntity (method)
  NewEntity(): StepData_Described;

  // StepData_ECDescr.get_type_name (method)
  static get_type_name(): string;

  // StepData_ECDescr.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_ECDescr.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_ECDescr.delete (method)
  delete(): void;

  // StepData_ECDescr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_EDescr: declare class StepData_EDescr extends Standard_Transient

  // StepData_EDescr.Matches (method)
  Matches(steptype: string): boolean;

  // StepData_EDescr.IsComplex (method)
  IsComplex(): boolean;

  // StepData_EDescr.NewEntity (method)
  NewEntity(): StepData_Described;

  // StepData_EDescr.get_type_name (method)
  static get_type_name(): string;

  // StepData_EDescr.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_EDescr.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_EDescr.delete (method)
  delete(): void;

  // StepData_EDescr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_ESDescr: declare class StepData_ESDescr extends StepData_EDescr

  // StepData_ESDescr.constructor (constructor)
  constructor(name: string);

  // StepData_ESDescr.SetNbFields (method)
  SetNbFields(nb: number): void;

  // StepData_ESDescr.SetField (method)
  SetField(num: number, name: string, descr: StepData_PDescr): void;

  // StepData_ESDescr.SetBase (method)
  SetBase(base: StepData_ESDescr): void;

  // StepData_ESDescr.SetSuper (method)
  SetSuper(super_: StepData_ESDescr): void;

  // StepData_ESDescr.TypeName (method)
  TypeName(): string;

  // StepData_ESDescr.StepType (method)
  StepType(): TCollection_AsciiString;

  // StepData_ESDescr.Base (method)
  Base(): StepData_ESDescr;

  // StepData_ESDescr.Super (method)
  Super(): StepData_ESDescr;

  // StepData_ESDescr.IsSub (method)
  IsSub(other: StepData_ESDescr): boolean;

  // StepData_ESDescr.NbFields (method)
  NbFields(): number;

  // StepData_ESDescr.Rank (method)
  Rank(name: string): number;

  // StepData_ESDescr.Name (method)
  Name(num: number): string;

  // StepData_ESDescr.Field (method)
  Field(num: number): StepData_PDescr;

  // StepData_ESDescr.NamedField (method)
  NamedField(name: string): StepData_PDescr;

  // StepData_ESDescr.Matches (method)
  Matches(steptype: string): boolean;

  // StepData_ESDescr.IsComplex (method)
  IsComplex(): boolean;

  // StepData_ESDescr.NewEntity (method)
  NewEntity(): StepData_Described;

  // StepData_ESDescr.get_type_name (method)
  static get_type_name(): string;

  // StepData_ESDescr.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_ESDescr.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_ESDescr.delete (method)
  delete(): void;

  // StepData_ESDescr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_EnumTool: declare class StepData_EnumTool

  // StepData_EnumTool.constructor (constructor)
  constructor(e0?: string, e1?: string, e2?: string, e3?: string, e4?: string, e5?: string, e6?: string, e7?: string, e8?: string, e9?: string, e10?: string, e11?: string, e12?: string, e13?: string, e14?: string, e15?: string, e16?: string, e17?: string, e18?: string, e19?: string, e20?: string, e21?: string, e22?: string, e23?: string, e24?: string, e25?: string, e26?: string, e27?: string, e28?: string, e29?: string, e30?: string, e31?: string, e32?: string, e33?: string, e34?: string, e35?: string, e36?: string, e37?: string, e38?: string, e39?: string);

  // StepData_EnumTool.AddDefinition (method)
  AddDefinition(term: string): void;

  // StepData_EnumTool.IsSet (method)
  IsSet(): boolean;

  // StepData_EnumTool.MaxValue (method)
  MaxValue(): number;

  // StepData_EnumTool.Optional (method)
  Optional(mode: boolean): void;

  // StepData_EnumTool.NullValue (method)
  NullValue(): number;

  // StepData_EnumTool.Text (method)
  Text(num: number): TCollection_AsciiString;

  // StepData_EnumTool.Value (method)
  Value(txt: string): number;
  Value(txt: TCollection_AsciiString): number;

  // StepData_EnumTool.delete (method)
  delete(): void;

  // StepData_EnumTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_Factors: declare class StepData_Factors

  // StepData_Factors.constructor (constructor)
  constructor();

  // StepData_Factors.InitializeFactors (method)
  InitializeFactors(theLengthFactor: number, thePlaneAngleFactor: number, theSolidAngleFactor: number): void;

  // StepData_Factors.SetCascadeUnit (method)
  SetCascadeUnit(theUnit: number): void;

  // StepData_Factors.CascadeUnit (method)
  CascadeUnit(): number;

  // StepData_Factors.LengthFactor (method)
  LengthFactor(): number;

  // StepData_Factors.PlaneAngleFactor (method)
  PlaneAngleFactor(): number;

  // StepData_Factors.SolidAngleFactor (method)
  SolidAngleFactor(): number;

  // StepData_Factors.FactorRadianDegree (method)
  FactorRadianDegree(): number;

  // StepData_Factors.FactorDegreeRadian (method)
  FactorDegreeRadian(): number;

  // StepData_Factors.delete (method)
  delete(): void;

  // StepData_Factors.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_Field: declare class StepData_Field

  // StepData_Field.constructor (constructor)
  constructor();
  constructor(other: StepData_Field, copy?: boolean);

  // StepData_Field.CopyFrom (method)
  CopyFrom(other: StepData_Field): void;

  // StepData_Field.Clear (method)
  Clear(kind?: number): void;

  // StepData_Field.SetDerived (method)
  SetDerived(): void;

  // StepData_Field.SetInt (method)
  SetInt(val: number): void;
  SetInt(num: number, val: number, kind: number): void;

  // StepData_Field.SetInteger (method)
  SetInteger(val: number): void;
  SetInteger(num: number, val: number): void;

  // StepData_Field.SetBoolean (method)
  SetBoolean(val: boolean): void;
  SetBoolean(num: number, val: boolean): void;

  // StepData_Field.SetLogical (method)
  SetLogical(val: StepData_Logical): void;
  SetLogical(num: number, val: StepData_Logical): void;

  // StepData_Field.SetReal (method)
  SetReal(val: number): void;
  SetReal(num: number, val: number): void;

  // StepData_Field.SetString (method)
  SetString(val: string): void;
  SetString(num: number, val: string): void;

  // StepData_Field.SetEnum (method)
  SetEnum(val: number, text: string): void;
  SetEnum(num: number, val: number, text: string): void;

  // StepData_Field.SetSelectMember (method)
  SetSelectMember(val: StepData_SelectMember): void;

  // StepData_Field.SetEntity (method)
  SetEntity(val: Standard_Transient): void;
  SetEntity(): void;
  SetEntity(num: number, val: Standard_Transient): void;

  // StepData_Field.SetList (method)
  SetList(size: number, first?: number): void;

  // StepData_Field.SetList2 (method)
  SetList2(siz1: number, siz2: number, f1?: number, f2?: number): void;

  // StepData_Field.Set (method)
  Set(val: Standard_Transient): void;

  // StepData_Field.ClearItem (method)
  ClearItem(num: number): void;

  // StepData_Field.IsSet (method)
  IsSet(n1?: number, n2?: number): boolean;

  // StepData_Field.ItemKind (method)
  ItemKind(n1?: number, n2?: number): number;

  // StepData_Field.Kind (method)
  Kind(type_?: boolean): number;

  // StepData_Field.Arity (method)
  Arity(): number;

  // StepData_Field.Length (method)
  Length(index?: number): number;

  // StepData_Field.Lower (method)
  Lower(index?: number): number;

  // StepData_Field.Int (method)
  Int(): number;

  // StepData_Field.Integer (method)
  Integer(n1?: number, n2?: number): number;

  // StepData_Field.Boolean (method)
  Boolean(n1?: number, n2?: number): boolean;

  // StepData_Field.Logical (method)
  Logical(n1?: number, n2?: number): StepData_Logical;

  // StepData_Field.Real (method)
  Real(n1?: number, n2?: number): number;

  // StepData_Field.String (method)
  String(n1: number, n2: number): string;

  // StepData_Field.Enum (method)
  Enum(n1?: number, n2?: number): number;

  // StepData_Field.EnumText (method)
  EnumText(n1: number, n2: number): string;

  // StepData_Field.Entity (method)
  Entity(n1?: number, n2?: number): Standard_Transient;

  // StepData_Field.Transient (method)
  Transient(): Standard_Transient;

  // StepData_Field.delete (method)
  delete(): void;

  // StepData_Field.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_FieldList: declare class StepData_FieldList

  // StepData_FieldList.constructor (constructor)
  constructor();

  // StepData_FieldList.NbFields (method)
  NbFields(): number;

  // StepData_FieldList.Field (method)
  Field(num: number): StepData_Field;

  // StepData_FieldList.CField (method)
  CField(num: number): StepData_Field;

  // StepData_FieldList.delete (method)
  delete(): void;

  // StepData_FieldList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_FieldList1: declare class StepData_FieldList1 extends StepData_FieldList

  // StepData_FieldList1.constructor (constructor)
  constructor();

  // StepData_FieldList1.NbFields (method)
  NbFields(): number;

  // StepData_FieldList1.Field (method)
  Field(num: number): StepData_Field;

  // StepData_FieldList1.CField (method)
  CField(num: number): StepData_Field;

  // StepData_FieldList1.delete (method)
  delete(): void;

  // StepData_FieldList1.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_FieldListD: declare class StepData_FieldListD extends StepData_FieldList

  // StepData_FieldListD.constructor (constructor)
  constructor(nb: number);

  // StepData_FieldListD.SetNb (method)
  SetNb(nb: number): void;

  // StepData_FieldListD.NbFields (method)
  NbFields(): number;

  // StepData_FieldListD.Field (method)
  Field(num: number): StepData_Field;

  // StepData_FieldListD.CField (method)
  CField(num: number): StepData_Field;

  // StepData_FieldListD.delete (method)
  delete(): void;

  // StepData_FieldListD.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_FieldListN: declare class StepData_FieldListN extends StepData_FieldList

  // StepData_FieldListN.constructor (constructor)
  constructor(nb: number);

  // StepData_FieldListN.NbFields (method)
  NbFields(): number;

  // StepData_FieldListN.Field (method)
  Field(num: number): StepData_Field;

  // StepData_FieldListN.CField (method)
  CField(num: number): StepData_Field;

  // StepData_FieldListN.delete (method)
  delete(): void;

  // StepData_FieldListN.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_FileProtocol: declare class StepData_FileProtocol extends StepData_Protocol

  // StepData_FileProtocol.constructor (constructor)
  constructor();

  // StepData_FileProtocol.Add (method)
  Add(protocol: StepData_Protocol): void;

  // StepData_FileProtocol.NbResources (method)
  NbResources(): number;

  // StepData_FileProtocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // StepData_FileProtocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // StepData_FileProtocol.SchemaName (method)
  SchemaName(theModel: Interface_InterfaceModel): string;

  // StepData_FileProtocol.get_type_name (method)
  static get_type_name(): string;

  // StepData_FileProtocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_FileProtocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_FileProtocol.delete (method)
  delete(): void;

  // StepData_FileProtocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_FileRecognizer: declare class StepData_FileRecognizer extends Standard_Transient

  // StepData_FileRecognizer.Evaluate (method)
  Evaluate(akey: TCollection_AsciiString): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

  // StepData_FileRecognizer.Result (method)
  Result(): Standard_Transient;

  // StepData_FileRecognizer.Add (method)
  Add(reco: StepData_FileRecognizer): void;

  // StepData_FileRecognizer.get_type_name (method)
  static get_type_name(): string;

  // StepData_FileRecognizer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_FileRecognizer.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_FileRecognizer.delete (method)
  delete(): void;

  // StepData_FileRecognizer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_GlobalNodeOfWriterLib: declare class StepData_GlobalNodeOfWriterLib extends Standard_Transient

  // StepData_GlobalNodeOfWriterLib.constructor (constructor)
  constructor();

  // StepData_GlobalNodeOfWriterLib.Add (method)
  Add(amodule: StepData_ReadWriteModule, aprotocol: StepData_Protocol): void;

  // StepData_GlobalNodeOfWriterLib.Module (method)
  Module(): StepData_ReadWriteModule;

  // StepData_GlobalNodeOfWriterLib.Protocol (method)
  Protocol(): StepData_Protocol;

  // StepData_GlobalNodeOfWriterLib.Next (method)
  Next(): StepData_GlobalNodeOfWriterLib;

  // StepData_GlobalNodeOfWriterLib.get_type_name (method)
  static get_type_name(): string;

  // StepData_GlobalNodeOfWriterLib.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_GlobalNodeOfWriterLib.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_GlobalNodeOfWriterLib.delete (method)
  delete(): void;

  // StepData_GlobalNodeOfWriterLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_Logical: typeof StepData_Logical[keyof typeof StepData_Logical]

  readonly StepData_LFalse: 'StepData_LFalse'

  readonly StepData_LTrue: 'StepData_LTrue'

  readonly StepData_LUnknown: 'StepData_LUnknown'

StepData_NodeOfWriterLib: declare class StepData_NodeOfWriterLib extends Standard_Transient

  // StepData_NodeOfWriterLib.constructor (constructor)
  constructor();

  // StepData_NodeOfWriterLib.AddNode (method)
  AddNode(anode: StepData_GlobalNodeOfWriterLib): void;

  // StepData_NodeOfWriterLib.Module (method)
  Module(): StepData_ReadWriteModule;

  // StepData_NodeOfWriterLib.Protocol (method)
  Protocol(): StepData_Protocol;

  // StepData_NodeOfWriterLib.Next (method)
  Next(): StepData_NodeOfWriterLib;

  // StepData_NodeOfWriterLib.get_type_name (method)
  static get_type_name(): string;

  // StepData_NodeOfWriterLib.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_NodeOfWriterLib.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_NodeOfWriterLib.delete (method)
  delete(): void;

  // StepData_NodeOfWriterLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_PDescr: declare class StepData_PDescr extends Standard_Transient

  // StepData_PDescr.constructor (constructor)
  constructor();

  // StepData_PDescr.SetName (method)
  SetName(name: string): void;

  // StepData_PDescr.Name (method)
  Name(): string;

  // StepData_PDescr.SetSelect (method)
  SetSelect(): void;

  // StepData_PDescr.AddMember (method)
  AddMember(member: StepData_PDescr): void;

  // StepData_PDescr.SetMemberName (method)
  SetMemberName(memname: string): void;

  // StepData_PDescr.SetInteger (method)
  SetInteger(): void;

  // StepData_PDescr.SetReal (method)
  SetReal(): void;

  // StepData_PDescr.SetString (method)
  SetString(): void;

  // StepData_PDescr.SetBoolean (method)
  SetBoolean(): void;

  // StepData_PDescr.SetLogical (method)
  SetLogical(): void;

  // StepData_PDescr.SetEnum (method)
  SetEnum(): void;

  // StepData_PDescr.AddEnumDef (method)
  AddEnumDef(enumdef: string): void;

  // StepData_PDescr.SetType (method)
  SetType(atype: Standard_Type): void;

  // StepData_PDescr.SetDescr (method)
  SetDescr(dscnam: string): void;

  // StepData_PDescr.AddArity (method)
  AddArity(arity?: number): void;

  // StepData_PDescr.SetArity (method)
  SetArity(arity?: number): void;

  // StepData_PDescr.SetFrom (method)
  SetFrom(other: StepData_PDescr): void;

  // StepData_PDescr.SetOptional (method)
  SetOptional(opt?: boolean): void;

  // StepData_PDescr.SetDerived (method)
  SetDerived(der?: boolean): void;

  // StepData_PDescr.SetField (method)
  SetField(name: string, rank: number): void;

  // StepData_PDescr.IsSelect (method)
  IsSelect(): boolean;

  // StepData_PDescr.Member (method)
  Member(name: string): StepData_PDescr;

  // StepData_PDescr.IsInteger (method)
  IsInteger(): boolean;

  // StepData_PDescr.IsReal (method)
  IsReal(): boolean;

  // StepData_PDescr.IsString (method)
  IsString(): boolean;

  // StepData_PDescr.IsBoolean (method)
  IsBoolean(): boolean;

  // StepData_PDescr.IsLogical (method)
  IsLogical(): boolean;

  // StepData_PDescr.IsEnum (method)
  IsEnum(): boolean;

  // StepData_PDescr.EnumMax (method)
  EnumMax(): number;

  // StepData_PDescr.EnumValue (method)
  EnumValue(name: string): number;

  // StepData_PDescr.EnumText (method)
  EnumText(val: number): string;

  // StepData_PDescr.IsEntity (method)
  IsEntity(): boolean;

  // StepData_PDescr.IsType (method)
  IsType(atype: Standard_Type): boolean;

  // StepData_PDescr.Type (method)
  Type(): Standard_Type;

  // StepData_PDescr.IsDescr (method)
  IsDescr(descr: StepData_EDescr): boolean;

  // StepData_PDescr.DescrName (method)
  DescrName(): string;

  // StepData_PDescr.Arity (method)
  Arity(): number;

  // StepData_PDescr.Simple (method)
  Simple(): StepData_PDescr;

  // StepData_PDescr.IsOptional (method)
  IsOptional(): boolean;

  // StepData_PDescr.IsDerived (method)
  IsDerived(): boolean;

  // StepData_PDescr.IsField (method)
  IsField(): boolean;

  // StepData_PDescr.FieldName (method)
  FieldName(): string;

  // StepData_PDescr.FieldRank (method)
  FieldRank(): number;

  // StepData_PDescr.Check (method)
  Check(afild: StepData_Field): { ach: Interface_Check; [Symbol.dispose](): void };

  // StepData_PDescr.get_type_name (method)
  static get_type_name(): string;

  // StepData_PDescr.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_PDescr.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_PDescr.delete (method)
  delete(): void;

  // StepData_PDescr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_Plex: declare class StepData_Plex extends StepData_Described

  // StepData_Plex.constructor (constructor)
  constructor(descr: StepData_ECDescr);

  // StepData_Plex.Add (method)
  Add(member: StepData_Simple): void;

  // StepData_Plex.ECDescr (method)
  ECDescr(): StepData_ECDescr;

  // StepData_Plex.IsComplex (method)
  IsComplex(): boolean;

  // StepData_Plex.Matches (method)
  Matches(steptype: string): boolean;

  // StepData_Plex.As (method)
  As(steptype: string): StepData_Simple;

  // StepData_Plex.HasField (method)
  HasField(name: string): boolean;

  // StepData_Plex.Field (method)
  Field(name: string): StepData_Field;

  // StepData_Plex.CField (method)
  CField(name: string): StepData_Field;

  // StepData_Plex.NbMembers (method)
  NbMembers(): number;

  // StepData_Plex.Member (method)
  Member(num: number): StepData_Simple;

  // StepData_Plex.TypeList (method)
  TypeList(): NCollection_HSequence_TCollection_AsciiString;

  // StepData_Plex.Check (method)
  Check(): { ach: Interface_Check; [Symbol.dispose](): void };

  // StepData_Plex.get_type_name (method)
  static get_type_name(): string;

  // StepData_Plex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_Plex.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_Plex.delete (method)
  delete(): void;

  // StepData_Plex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_Protocol: declare class StepData_Protocol extends Interface_Protocol

  // StepData_Protocol.constructor (constructor)
  constructor();

  // StepData_Protocol.NbResources (method)
  NbResources(): number;

  // StepData_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // StepData_Protocol.CaseNumber (method)
  CaseNumber(obj: Standard_Transient): number;

  // StepData_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // StepData_Protocol.SchemaName (method)
  SchemaName(theModel: Interface_InterfaceModel): string;

  // StepData_Protocol.NewModel (method)
  NewModel(): Interface_InterfaceModel;

  // StepData_Protocol.IsSuitableModel (method)
  IsSuitableModel(model: Interface_InterfaceModel): boolean;

  // StepData_Protocol.UnknownEntity (method)
  UnknownEntity(): Standard_Transient;

  // StepData_Protocol.IsUnknownEntity (method)
  IsUnknownEntity(ent: Standard_Transient): boolean;

  // StepData_Protocol.DescrNumber (method)
  DescrNumber(adescr: StepData_EDescr): number;

  // StepData_Protocol.AddDescr (method)
  AddDescr(adescr: StepData_EDescr, CN: number): void;

  // StepData_Protocol.HasDescr (method)
  HasDescr(): boolean;

  // StepData_Protocol.Descr (method)
  Descr(num: number): StepData_EDescr;
  Descr(name: string, anylevel: boolean): StepData_EDescr;

  // StepData_Protocol.ESDescr (method)
  ESDescr(name: string, anylevel?: boolean): StepData_ESDescr;

  // StepData_Protocol.ECDescr (method)
  ECDescr(names: NCollection_Sequence_TCollection_AsciiString, anylevel?: boolean): StepData_ECDescr;

  // StepData_Protocol.AddPDescr (method)
  AddPDescr(pdescr: StepData_PDescr): void;

  // StepData_Protocol.PDescr (method)
  PDescr(name: string, anylevel?: boolean): StepData_PDescr;

  // StepData_Protocol.AddBasicDescr (method)
  AddBasicDescr(esdescr: StepData_ESDescr): void;

  // StepData_Protocol.BasicDescr (method)
  BasicDescr(name: string, anylevel?: boolean): StepData_EDescr;

  // StepData_Protocol.get_type_name (method)
  static get_type_name(): string;

  // StepData_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_Protocol.delete (method)
  delete(): void;

  // StepData_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_ReadWriteModule: declare class StepData_ReadWriteModule extends Interface_ReaderModule

  // StepData_ReadWriteModule.CaseStep (method)
  CaseStep(atype: TCollection_AsciiString): number;
  CaseStep(types: NCollection_Sequence_TCollection_AsciiString): number;

  // StepData_ReadWriteModule.IsComplex (method)
  IsComplex(CN: number): boolean;

  // StepData_ReadWriteModule.StepType (method)
  StepType(CN: number): string;

  // StepData_ReadWriteModule.ShortType (method)
  ShortType(CN: number): TCollection_AsciiString;

  // StepData_ReadWriteModule.ComplexType (method)
  ComplexType(CN: number, types: NCollection_Sequence_TCollection_AsciiString): boolean;

  // StepData_ReadWriteModule.WriteStep (method)
  WriteStep(CN: number, SW: StepData_StepWriter, ent: Standard_Transient): void;

  // StepData_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // StepData_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_ReadWriteModule.delete (method)
  delete(): void;

  // StepData_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_SelectArrReal: declare class StepData_SelectArrReal extends StepData_SelectNamed

  // StepData_SelectArrReal.constructor (constructor)
  constructor();

  // StepData_SelectArrReal.Kind (method)
  Kind(): number;

  // StepData_SelectArrReal.ArrReal (method)
  ArrReal(): NCollection_HArray1_double;

  // StepData_SelectArrReal.SetArrReal (method)
  SetArrReal(arr: NCollection_HArray1_double): void;

  // StepData_SelectArrReal.get_type_name (method)
  static get_type_name(): string;

  // StepData_SelectArrReal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_SelectArrReal.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_SelectArrReal.delete (method)
  delete(): void;

  // StepData_SelectArrReal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_SelectInt: declare class StepData_SelectInt extends StepData_SelectMember

  // StepData_SelectInt.constructor (constructor)
  constructor();

  // StepData_SelectInt.Kind (method)
  Kind(): number;

  // StepData_SelectInt.SetKind (method)
  SetKind(kind: number): void;

  // StepData_SelectInt.Int (method)
  Int(): number;

  // StepData_SelectInt.SetInt (method)
  SetInt(val: number): void;

  // StepData_SelectInt.get_type_name (method)
  static get_type_name(): string;

  // StepData_SelectInt.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_SelectInt.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_SelectInt.delete (method)
  delete(): void;

  // StepData_SelectInt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_SelectMember: declare class StepData_SelectMember extends Standard_Transient

  // StepData_SelectMember.constructor (constructor)
  constructor();

  // StepData_SelectMember.HasName (method)
  HasName(): boolean;

  // StepData_SelectMember.Name (method)
  Name(): string;

  // StepData_SelectMember.SetName (method)
  SetName(name: string): boolean;

  // StepData_SelectMember.Matches (method)
  Matches(name: string): boolean;

  // StepData_SelectMember.Kind (method)
  Kind(): number;

  // StepData_SelectMember.SetKind (method)
  SetKind(kind: number): void;

  // StepData_SelectMember.ParamType (method)
  ParamType(): Interface_ParamType;

  // StepData_SelectMember.Int (method)
  Int(): number;

  // StepData_SelectMember.SetInt (method)
  SetInt(val: number): void;

  // StepData_SelectMember.Integer (method)
  Integer(): number;

  // StepData_SelectMember.SetInteger (method)
  SetInteger(val: number): void;

  // StepData_SelectMember.Boolean (method)
  Boolean(): boolean;

  // StepData_SelectMember.SetBoolean (method)
  SetBoolean(val: boolean): void;

  // StepData_SelectMember.Logical (method)
  Logical(): StepData_Logical;

  // StepData_SelectMember.SetLogical (method)
  SetLogical(val: StepData_Logical): void;

  // StepData_SelectMember.Real (method)
  Real(): number;

  // StepData_SelectMember.SetReal (method)
  SetReal(val: number): void;

  // StepData_SelectMember.String (method)
  String(): string;

  // StepData_SelectMember.SetString (method)
  SetString(val: string): void;

  // StepData_SelectMember.Enum (method)
  Enum(): number;

  // StepData_SelectMember.EnumText (method)
  EnumText(): string;

  // StepData_SelectMember.SetEnum (method)
  SetEnum(val: number, text?: string): void;

  // StepData_SelectMember.SetEnumText (method)
  SetEnumText(val: number, text: string): void;

  // StepData_SelectMember.get_type_name (method)
  static get_type_name(): string;

  // StepData_SelectMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_SelectMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_SelectMember.delete (method)
  delete(): void;

  // StepData_SelectMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_SelectNamed: declare class StepData_SelectNamed extends StepData_SelectMember

  // StepData_SelectNamed.constructor (constructor)
  constructor();

  // StepData_SelectNamed.HasName (method)
  HasName(): boolean;

  // StepData_SelectNamed.Name (method)
  Name(): string;

  // StepData_SelectNamed.SetName (method)
  SetName(name: string): boolean;

  // StepData_SelectNamed.Field (method)
  Field(): StepData_Field;

  // StepData_SelectNamed.CField (method)
  CField(): StepData_Field;

  // StepData_SelectNamed.Kind (method)
  Kind(): number;

  // StepData_SelectNamed.SetKind (method)
  SetKind(kind: number): void;

  // StepData_SelectNamed.Int (method)
  Int(): number;

  // StepData_SelectNamed.SetInt (method)
  SetInt(val: number): void;

  // StepData_SelectNamed.Real (method)
  Real(): number;

  // StepData_SelectNamed.SetReal (method)
  SetReal(val: number): void;

  // StepData_SelectNamed.String (method)
  String(): string;

  // StepData_SelectNamed.SetString (method)
  SetString(val: string): void;

  // StepData_SelectNamed.get_type_name (method)
  static get_type_name(): string;

  // StepData_SelectNamed.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_SelectNamed.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_SelectNamed.delete (method)
  delete(): void;

  // StepData_SelectNamed.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_SelectReal: declare class StepData_SelectReal extends StepData_SelectMember

  // StepData_SelectReal.constructor (constructor)
  constructor();

  // StepData_SelectReal.Kind (method)
  Kind(): number;

  // StepData_SelectReal.Real (method)
  Real(): number;

  // StepData_SelectReal.SetReal (method)
  SetReal(val: number): void;

  // StepData_SelectReal.get_type_name (method)
  static get_type_name(): string;

  // StepData_SelectReal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_SelectReal.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_SelectReal.delete (method)
  delete(): void;

  // StepData_SelectReal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_SelectType: declare class StepData_SelectType

  // StepData_SelectType.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepData_SelectType.Matches (method)
  Matches(ent: Standard_Transient): boolean;

  // StepData_SelectType.SetValue (method)
  SetValue(ent: Standard_Transient): void;

  // StepData_SelectType.Nullify (method)
  Nullify(): void;

  // StepData_SelectType.Value (method)
  Value(): Standard_Transient;

  // StepData_SelectType.IsNull (method)
  IsNull(): boolean;

  // StepData_SelectType.Type (method)
  Type(): Standard_Type;

  // StepData_SelectType.CaseNumber (method)
  CaseNumber(): number;

  // StepData_SelectType.Description (method)
  Description(): StepData_PDescr;

  // StepData_SelectType.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepData_SelectType.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepData_SelectType.CaseMember (method)
  CaseMember(): number;

  // StepData_SelectType.Member (method)
  Member(): StepData_SelectMember;

  // StepData_SelectType.SelectName (method)
  SelectName(): string;

  // StepData_SelectType.Int (method)
  Int(): number;

  // StepData_SelectType.SetInt (method)
  SetInt(val: number): void;

  // StepData_SelectType.Integer (method)
  Integer(): number;

  // StepData_SelectType.SetInteger (method)
  SetInteger(val: number, name?: string): void;

  // StepData_SelectType.Boolean (method)
  Boolean(): boolean;

  // StepData_SelectType.SetBoolean (method)
  SetBoolean(val: boolean, name?: string): void;

  // StepData_SelectType.Logical (method)
  Logical(): StepData_Logical;

  // StepData_SelectType.SetLogical (method)
  SetLogical(val: StepData_Logical, name?: string): void;

  // StepData_SelectType.Real (method)
  Real(): number;

  // StepData_SelectType.SetReal (method)
  SetReal(val: number, name?: string): void;

  // StepData_SelectType.delete (method)
  delete(): void;

  // StepData_SelectType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_Simple: declare class StepData_Simple extends StepData_Described

  // StepData_Simple.constructor (constructor)
  constructor(descr: StepData_ESDescr);

  // StepData_Simple.ESDescr (method)
  ESDescr(): StepData_ESDescr;

  // StepData_Simple.StepType (method)
  StepType(): string;

  // StepData_Simple.IsComplex (method)
  IsComplex(): boolean;

  // StepData_Simple.Matches (method)
  Matches(steptype: string): boolean;

  // StepData_Simple.As (method)
  As(steptype: string): StepData_Simple;

  // StepData_Simple.HasField (method)
  HasField(name: string): boolean;

  // StepData_Simple.Field (method)
  Field(name: string): StepData_Field;

  // StepData_Simple.CField (method)
  CField(name: string): StepData_Field;

  // StepData_Simple.NbFields (method)
  NbFields(): number;

  // StepData_Simple.FieldNum (method)
  FieldNum(num: number): StepData_Field;

  // StepData_Simple.CFieldNum (method)
  CFieldNum(num: number): StepData_Field;

  // StepData_Simple.Fields (method)
  Fields(): StepData_FieldListN;

  // StepData_Simple.CFields (method)
  CFields(): StepData_FieldListN;

  // StepData_Simple.Check (method)
  Check(): { ach: Interface_Check; [Symbol.dispose](): void };

  // StepData_Simple.get_type_name (method)
  static get_type_name(): string;

  // StepData_Simple.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_Simple.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_Simple.delete (method)
  delete(): void;

  // StepData_Simple.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_StepDumper: declare class StepData_StepDumper

  // StepData_StepDumper.constructor (constructor)
  constructor(amodel: StepData_StepModel, protocol: StepData_Protocol, mode?: number);

  // StepData_StepDumper.StepWriter (method)
  StepWriter(): StepData_StepWriter;

  // StepData_StepDumper.delete (method)
  delete(): void;

  // StepData_StepDumper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_StepModel: declare class StepData_StepModel extends Interface_InterfaceModel

  // StepData_StepModel.constructor (constructor)
  constructor();

  InternalParameters: unknown

  // StepData_StepModel.Entity (method)
  Entity(num: number): Standard_Transient;

  // StepData_StepModel.GetFromAnother (method)
  GetFromAnother(other: Interface_InterfaceModel): void;

  // StepData_StepModel.NewEmptyModel (method)
  NewEmptyModel(): Interface_InterfaceModel;

  // StepData_StepModel.HasHeaderEntity (method)
  HasHeaderEntity(atype: Standard_Type): boolean;

  // StepData_StepModel.HeaderEntity (method)
  HeaderEntity(atype: Standard_Type): Standard_Transient;

  // StepData_StepModel.ClearHeader (method)
  ClearHeader(): void;

  // StepData_StepModel.AddHeaderEntity (method)
  AddHeaderEntity(ent: Standard_Transient): void;

  // StepData_StepModel.VerifyCheck (method)
  VerifyCheck(): { ach: Interface_Check; [Symbol.dispose](): void };

  // StepData_StepModel.ClearLabels (method)
  ClearLabels(): void;

  // StepData_StepModel.SetIdentLabel (method)
  SetIdentLabel(ent: Standard_Transient, ident: number): void;

  // StepData_StepModel.IdentLabel (method)
  IdentLabel(ent: Standard_Transient): number;

  // StepData_StepModel.StringLabel (method)
  StringLabel(ent: Standard_Transient): TCollection_HAsciiString;

  // StepData_StepModel.SourceCodePage (method)
  SourceCodePage(): Resource_FormatType;

  // StepData_StepModel.SetSourceCodePage (method)
  SetSourceCodePage(theCode: Resource_FormatType): void;

  // StepData_StepModel.SetLocalLengthUnit (method)
  SetLocalLengthUnit(theUnit: number): void;

  // StepData_StepModel.LocalLengthUnit (method)
  LocalLengthUnit(): number;

  // StepData_StepModel.SetWriteLengthUnit (method)
  SetWriteLengthUnit(theUnit: number): void;

  // StepData_StepModel.WriteLengthUnit (method)
  WriteLengthUnit(): number;

  // StepData_StepModel.IsInitializedUnit (method)
  IsInitializedUnit(): boolean;

  // StepData_StepModel.get_type_name (method)
  static get_type_name(): string;

  // StepData_StepModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepData_StepModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepData_StepModel.delete (method)
  delete(): void;

  // StepData_StepModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_StepReaderTool: declare class StepData_StepReaderTool extends Interface_FileReaderTool

  // StepData_StepReaderTool.Prepare (method)
  Prepare(optimize: boolean): void;
  Prepare(reco: StepData_FileRecognizer, optimize: boolean): void;

  // StepData_StepReaderTool.Recognize (method)
  Recognize(num: number): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

  // StepData_StepReaderTool.PrepareHeader (method)
  PrepareHeader(reco: StepData_FileRecognizer): void;

  // StepData_StepReaderTool.BeginRead (method)
  BeginRead(amodel: Interface_InterfaceModel): void;

  // StepData_StepReaderTool.AnalyseRecord (method)
  AnalyseRecord(num: number, anent: Standard_Transient): { returnValue: boolean; acheck: Interface_Check; [Symbol.dispose](): void };

  // StepData_StepReaderTool.EndRead (method)
  EndRead(amodel: Interface_InterfaceModel): void;

  // StepData_StepReaderTool.delete (method)
  delete(): void;

  // StepData_StepReaderTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
