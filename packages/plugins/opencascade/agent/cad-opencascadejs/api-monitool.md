# libcascade — MoniTool

15 top-level symbols. Signatures are verbatim typescript.

MoniTool_AttrList: declare class MoniTool_AttrList

  constructor

  SetAttribute(name: string, val: Standard_Transient): void;

  RemoveAttribute(name: string): boolean;

  GetAttribute(name: string, type_: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

  Attribute(name: string): Standard_Transient;

  AttributeType(name: string): MoniTool_ValueType;

  SetIntegerAttribute(name: string, val: number): void;

  GetIntegerAttribute(name: string, val?: number): { returnValue: boolean; val: number };

  IntegerAttribute(name: string): number;

  SetRealAttribute(name: string, val: number): void;

  GetRealAttribute(name: string, val?: number): { returnValue: boolean; val: number };

  RealAttribute(name: string): number;

  SetStringAttribute(name: string, val: string): void;

  StringAttribute(name: string): string;

  AttrList(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

  SameAttributes(other: MoniTool_AttrList): void;

  GetAttributes(other: MoniTool_AttrList, fromname?: string, copied?: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_CaseData: declare class MoniTool_CaseData extends Standard_Transient

  constructor

  SetCaseId(caseid: string): void;

  SetName(name: string): void;

  CaseId(): string;

  Name(): string;
  Name(nd: number): TCollection_AsciiString;
  Name(): string;
  Name(nd: number): TCollection_AsciiString;

  IsCheck(): boolean;

  IsWarning(): boolean;

  IsFail(): boolean;

  ResetCheck(): void;

  SetWarning(): void;

  SetFail(): void;

  SetChange(): void;

  SetReplace(num: number): void;

  AddData(val: Standard_Transient, kind: number, name?: string): void;

  AddRaised(theException: Standard_Failure, name?: string): void;

  AddShape(sh: TopoDS_Shape, name?: string): void;

  AddXYZ(aXYZ: gp_XYZ, name?: string): void;

  AddXY(aXY: gp_XY, name?: string): void;

  AddReal(val: number, name?: string): void;

  AddReals(v1: number, v2: number, name?: string): void;

  AddCPU(lastCPU: number, curCPU?: number, name?: string): void;

  GetCPU(): number;

  LargeCPU(maxCPU: number, lastCPU: number, curCPU?: number): boolean;

  AddGeom(geom: Standard_Transient, name?: string): void;

  AddEntity(ent: Standard_Transient, name?: string): void;

  AddText(text: string, name?: string): void;

  AddInteger(val: number, name?: string): void;

  AddAny(val: Standard_Transient, name?: string): void;

  RemoveData(num: number): void;

  NbData(): number;

  Data(nd: number): Standard_Transient;

  GetData(nd: number, type_: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

  Kind(nd: number): number;

  NameNum(name: string): number;

  Shape(nd: number): TopoDS_Shape;

  XYZ(nd: number, val: gp_XYZ): boolean;

  XY(nd: number, val: gp_XY): boolean;

  Reals(nd: number, v1?: number, v2?: number): { returnValue: boolean; v1: number; v2: number };

  Real(nd: number, val?: number): { returnValue: boolean; val: number };

  Integer(nd: number, val?: number): { returnValue: boolean; val: number };

  Msg(): Message_Msg;

  static SetDefWarning(acode: string): void;

  static SetDefFail(acode: string): void;

  static DefCheck(acode: string): number;

  static SetDefMsg(casecode: string, mesdef: string): void;

  static DefMsg(casecode: string): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_DataInfo: declare class MoniTool_DataInfo

  constructor

  static Type(ent: Standard_Transient): Standard_Type;

  static TypeName(ent: Standard_Transient): string;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_Element: declare class MoniTool_Element extends Standard_Transient

  GetHashCode(): number;

  Equates(other: MoniTool_Element): boolean;

  ValueType(): Standard_Type;

  ValueTypeName(): string;

  ListAttr(): MoniTool_AttrList;

  ChangeAttr(): MoniTool_AttrList;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_IntVal: declare class MoniTool_IntVal extends Standard_Transient

  constructor

  Value(): number;

  CValue(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_RealVal: declare class MoniTool_RealVal extends Standard_Transient

  constructor

  Value(): number;

  CValue(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_SignShape: declare class MoniTool_SignShape extends MoniTool_SignText

  constructor

  Name(): string;

  Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_SignText: declare class MoniTool_SignText extends Standard_Transient

  Name(): string;

  TextAlone(ent: Standard_Transient): TCollection_AsciiString;

  Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_Stat: declare class MoniTool_Stat

  constructor

  static Current(): MoniTool_Stat;

  Open(nb?: number): number;

  OpenMore(id: number, nb: number): void;

  Add(nb?: number): void;

  AddSub(nb?: number): void;

  AddEnd(): void;

  Close(id: number): void;

  Level(): number;

  Percent(fromlev?: number): number;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_Timer: declare class MoniTool_Timer extends Standard_Transient

  constructor

  Start(): void;
  static Start(name: string): void;

  Stop(): void;
  static Stop(name: string): void;

  Reset(): void;

  Count(): number;

  IsRunning(): number;

  CPU(): number;

  Amend(): number;

  static Timer(name: string): MoniTool_Timer;

  static Dictionary(): any;

  static ClearTimers(): void;

  static ComputeAmendments(): void;

  static GetAmendments(Access?: number, Internal?: number, External?: number, Error10?: number): { Access: number; Internal: number; External: number; Error10: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_TimerSentry: declare class MoniTool_TimerSentry

  constructor

  Timer(): MoniTool_Timer;

  Stop(): void;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_TransientElem: declare class MoniTool_TransientElem extends MoniTool_Element

  constructor

  Value(): Standard_Transient;

  Equates(other: MoniTool_Element): boolean;

  ValueType(): Standard_Type;

  ValueTypeName(): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_TypedValue: declare class MoniTool_TypedValue extends Standard_Transient

  constructor

  Name(): string;

  ValueType(): MoniTool_ValueType;

  Definition(): TCollection_AsciiString;

  SetDefinition(deftext: string): void;

  AddDef(initext: string): boolean;

  SetLabel(label: string): void;

  Label(): string;

  SetMaxLength(max: number): void;

  MaxLength(): number;

  SetIntegerLimit(max: boolean, val: number): void;

  IntegerLimit(max: boolean, val?: number): { returnValue: boolean; val: number };

  SetRealLimit(max: boolean, val: number): void;

  RealLimit(max: boolean, val?: number): { returnValue: boolean; val: number };

  SetUnitDef(def: string): void;

  UnitDef(): string;

  StartEnum(start?: number, match?: boolean): void;

  AddEnum(v1?: string, v2?: string, v3?: string, v4?: string, v5?: string, v6?: string, v7?: string, v8?: string, v9?: string, v10?: string): void;

  AddEnumValue(val: string, num: number): void;

  EnumDef(startcase?: number, endcase?: number, match?: boolean): { returnValue: boolean; startcase: number; endcase: number; match: boolean };

  EnumVal(num: number): string;

  EnumCase(val: string): number;

  SetObjectType(typ: Standard_Type): void;

  ObjectType(): Standard_Type;

  SetInterpret(func: ((arg0: MoniTool_TypedValue, arg1: TCollection_HAsciiString, arg2: boolean) => TCollection_HAsciiString)): void;

  HasInterpret(): boolean;

  SetSatisfies(func: ((arg0: TCollection_HAsciiString) => boolean), name: string): void;

  SatisfiesName(): string;

  IsSetValue(): boolean;

  CStringValue(): string;

  HStringValue(): TCollection_HAsciiString;

  Interpret(hval: TCollection_HAsciiString, native: boolean): TCollection_HAsciiString;

  Satisfies(hval: TCollection_HAsciiString): boolean;

  ClearValue(): void;

  SetCStringValue(val: string): boolean;

  SetHStringValue(hval: TCollection_HAsciiString): boolean;

  IntegerValue(): number;

  SetIntegerValue(ival: number): boolean;

  RealValue(): number;

  SetRealValue(rval: number): boolean;

  ObjectValue(): Standard_Transient;

  GetObjectValue(): { val: Standard_Transient; [Symbol.dispose](): void };

  SetObjectValue(obj: Standard_Transient): boolean;

  ObjectTypeName(): string;

  static AddLib(tv: MoniTool_TypedValue, def?: string): boolean;

  static Lib(def: string): MoniTool_TypedValue;

  static FromLib(def: string): MoniTool_TypedValue;

  static LibList(): NCollection_HSequence_TCollection_AsciiString;

  static StaticValue(name: string): MoniTool_TypedValue;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MoniTool_ValueType: typeof MoniTool_ValueType[keyof typeof MoniTool_ValueType]

MoniTool_DataMapOfShapeTransient: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher
