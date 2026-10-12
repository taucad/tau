# libcascade — MoniTool

15 top-level symbols. Signatures are verbatim typescript.

MoniTool_AttrList: declare class MoniTool_AttrList

  // MoniTool_AttrList.constructor (constructor)
  constructor();
  constructor(other: MoniTool_AttrList);

  // MoniTool_AttrList.SetAttribute (method)
  SetAttribute(name: string, val: Standard_Transient): void;

  // MoniTool_AttrList.RemoveAttribute (method)
  RemoveAttribute(name: string): boolean;

  // MoniTool_AttrList.GetAttribute (method)
  GetAttribute(name: string, type_: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

  // MoniTool_AttrList.Attribute (method)
  Attribute(name: string): Standard_Transient;

  // MoniTool_AttrList.AttributeType (method)
  AttributeType(name: string): MoniTool_ValueType;

  // MoniTool_AttrList.SetIntegerAttribute (method)
  SetIntegerAttribute(name: string, val: number): void;

  // MoniTool_AttrList.GetIntegerAttribute (method)
  GetIntegerAttribute(name: string, val?: number): { returnValue: boolean; val: number };

  // MoniTool_AttrList.IntegerAttribute (method)
  IntegerAttribute(name: string): number;

  // MoniTool_AttrList.SetRealAttribute (method)
  SetRealAttribute(name: string, val: number): void;

  // MoniTool_AttrList.GetRealAttribute (method)
  GetRealAttribute(name: string, val?: number): { returnValue: boolean; val: number };

  // MoniTool_AttrList.RealAttribute (method)
  RealAttribute(name: string): number;

  // MoniTool_AttrList.SetStringAttribute (method)
  SetStringAttribute(name: string, val: string): void;

  // MoniTool_AttrList.StringAttribute (method)
  StringAttribute(name: string): string;

  // MoniTool_AttrList.AttrList (method)
  AttrList(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

  // MoniTool_AttrList.SameAttributes (method)
  SameAttributes(other: MoniTool_AttrList): void;

  // MoniTool_AttrList.GetAttributes (method)
  GetAttributes(other: MoniTool_AttrList, fromname?: string, copied?: boolean): void;

  // MoniTool_AttrList.delete (method)
  delete(): void;

  // MoniTool_AttrList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_CaseData: declare class MoniTool_CaseData extends Standard_Transient

  // MoniTool_CaseData.constructor (constructor)
  constructor(caseid?: string, name?: string);

  // MoniTool_CaseData.SetCaseId (method)
  SetCaseId(caseid: string): void;

  // MoniTool_CaseData.SetName (method)
  SetName(name: string): void;

  // MoniTool_CaseData.CaseId (method)
  CaseId(): string;

  // MoniTool_CaseData.Name (method)
  Name(): string;
  Name(nd: number): TCollection_AsciiString;

  // MoniTool_CaseData.IsCheck (method)
  IsCheck(): boolean;

  // MoniTool_CaseData.IsWarning (method)
  IsWarning(): boolean;

  // MoniTool_CaseData.IsFail (method)
  IsFail(): boolean;

  // MoniTool_CaseData.ResetCheck (method)
  ResetCheck(): void;

  // MoniTool_CaseData.SetWarning (method)
  SetWarning(): void;

  // MoniTool_CaseData.SetFail (method)
  SetFail(): void;

  // MoniTool_CaseData.SetChange (method)
  SetChange(): void;

  // MoniTool_CaseData.SetReplace (method)
  SetReplace(num: number): void;

  // MoniTool_CaseData.AddData (method)
  AddData(val: Standard_Transient, kind: number, name?: string): void;

  // MoniTool_CaseData.AddRaised (method)
  AddRaised(theException: Standard_Failure, name?: string): void;

  // MoniTool_CaseData.AddShape (method)
  AddShape(sh: TopoDS_Shape, name?: string): void;

  // MoniTool_CaseData.AddXYZ (method)
  AddXYZ(aXYZ: gp_XYZ, name?: string): void;

  // MoniTool_CaseData.AddXY (method)
  AddXY(aXY: gp_XY, name?: string): void;

  // MoniTool_CaseData.AddReal (method)
  AddReal(val: number, name?: string): void;

  // MoniTool_CaseData.AddReals (method)
  AddReals(v1: number, v2: number, name?: string): void;

  // MoniTool_CaseData.AddCPU (method)
  AddCPU(lastCPU: number, curCPU?: number, name?: string): void;

  // MoniTool_CaseData.GetCPU (method)
  GetCPU(): number;

  // MoniTool_CaseData.LargeCPU (method)
  LargeCPU(maxCPU: number, lastCPU: number, curCPU?: number): boolean;

  // MoniTool_CaseData.AddGeom (method)
  AddGeom(geom: Standard_Transient, name?: string): void;

  // MoniTool_CaseData.AddEntity (method)
  AddEntity(ent: Standard_Transient, name?: string): void;

  // MoniTool_CaseData.AddText (method)
  AddText(text: string, name?: string): void;

  // MoniTool_CaseData.AddInteger (method)
  AddInteger(val: number, name?: string): void;

  // MoniTool_CaseData.AddAny (method)
  AddAny(val: Standard_Transient, name?: string): void;

  // MoniTool_CaseData.RemoveData (method)
  RemoveData(num: number): void;

  // MoniTool_CaseData.NbData (method)
  NbData(): number;

  // MoniTool_CaseData.Data (method)
  Data(nd: number): Standard_Transient;

  // MoniTool_CaseData.GetData (method)
  GetData(nd: number, type_: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

  // MoniTool_CaseData.Kind (method)
  Kind(nd: number): number;

  // MoniTool_CaseData.NameNum (method)
  NameNum(name: string): number;

  // MoniTool_CaseData.Shape (method)
  Shape(nd: number): TopoDS_Shape;

  // MoniTool_CaseData.XYZ (method)
  XYZ(nd: number, val: gp_XYZ): boolean;

  // MoniTool_CaseData.XY (method)
  XY(nd: number, val: gp_XY): boolean;

  // MoniTool_CaseData.Reals (method)
  Reals(nd: number, v1?: number, v2?: number): { returnValue: boolean; v1: number; v2: number };

  // MoniTool_CaseData.Real (method)
  Real(nd: number, val?: number): { returnValue: boolean; val: number };

  // MoniTool_CaseData.Integer (method)
  Integer(nd: number, val?: number): { returnValue: boolean; val: number };

  // MoniTool_CaseData.Msg (method)
  Msg(): Message_Msg;

  // MoniTool_CaseData.SetDefWarning (method)
  static SetDefWarning(acode: string): void;

  // MoniTool_CaseData.SetDefFail (method)
  static SetDefFail(acode: string): void;

  // MoniTool_CaseData.DefCheck (method)
  static DefCheck(acode: string): number;

  // MoniTool_CaseData.SetDefMsg (method)
  static SetDefMsg(casecode: string, mesdef: string): void;

  // MoniTool_CaseData.DefMsg (method)
  static DefMsg(casecode: string): string;

  // MoniTool_CaseData.get_type_name (method)
  static get_type_name(): string;

  // MoniTool_CaseData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MoniTool_CaseData.DynamicType (method)
  DynamicType(): Standard_Type;

  // MoniTool_CaseData.delete (method)
  delete(): void;

  // MoniTool_CaseData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_DataInfo: declare class MoniTool_DataInfo

  // MoniTool_DataInfo.constructor (constructor)
  constructor();

  // MoniTool_DataInfo.Type (method)
  static Type(ent: Standard_Transient): Standard_Type;

  // MoniTool_DataInfo.TypeName (method)
  static TypeName(ent: Standard_Transient): string;

  // MoniTool_DataInfo.delete (method)
  delete(): void;

  // MoniTool_DataInfo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_Element: declare class MoniTool_Element extends Standard_Transient

  // MoniTool_Element.GetHashCode (method)
  GetHashCode(): number;

  // MoniTool_Element.Equates (method)
  Equates(other: MoniTool_Element): boolean;

  // MoniTool_Element.ValueType (method)
  ValueType(): Standard_Type;

  // MoniTool_Element.ValueTypeName (method)
  ValueTypeName(): string;

  // MoniTool_Element.ListAttr (method)
  ListAttr(): MoniTool_AttrList;

  // MoniTool_Element.ChangeAttr (method)
  ChangeAttr(): MoniTool_AttrList;

  // MoniTool_Element.get_type_name (method)
  static get_type_name(): string;

  // MoniTool_Element.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MoniTool_Element.DynamicType (method)
  DynamicType(): Standard_Type;

  // MoniTool_Element.delete (method)
  delete(): void;

  // MoniTool_Element.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_IntVal: declare class MoniTool_IntVal extends Standard_Transient

  // MoniTool_IntVal.constructor (constructor)
  constructor(val?: number);

  // MoniTool_IntVal.Value (method)
  Value(): number;

  // MoniTool_IntVal.CValue (method)
  CValue(): number;

  // MoniTool_IntVal.get_type_name (method)
  static get_type_name(): string;

  // MoniTool_IntVal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MoniTool_IntVal.DynamicType (method)
  DynamicType(): Standard_Type;

  // MoniTool_IntVal.delete (method)
  delete(): void;

  // MoniTool_IntVal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_RealVal: declare class MoniTool_RealVal extends Standard_Transient

  // MoniTool_RealVal.constructor (constructor)
  constructor(val?: number);

  // MoniTool_RealVal.Value (method)
  Value(): number;

  // MoniTool_RealVal.CValue (method)
  CValue(): number;

  // MoniTool_RealVal.get_type_name (method)
  static get_type_name(): string;

  // MoniTool_RealVal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MoniTool_RealVal.DynamicType (method)
  DynamicType(): Standard_Type;

  // MoniTool_RealVal.delete (method)
  delete(): void;

  // MoniTool_RealVal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_SignShape: declare class MoniTool_SignShape extends MoniTool_SignText

  // MoniTool_SignShape.constructor (constructor)
  constructor();

  // MoniTool_SignShape.Name (method)
  Name(): string;

  // MoniTool_SignShape.Text (method)
  Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

  // MoniTool_SignShape.get_type_name (method)
  static get_type_name(): string;

  // MoniTool_SignShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MoniTool_SignShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // MoniTool_SignShape.delete (method)
  delete(): void;

  // MoniTool_SignShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_SignText: declare class MoniTool_SignText extends Standard_Transient

  // MoniTool_SignText.Name (method)
  Name(): string;

  // MoniTool_SignText.TextAlone (method)
  TextAlone(ent: Standard_Transient): TCollection_AsciiString;

  // MoniTool_SignText.Text (method)
  Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

  // MoniTool_SignText.get_type_name (method)
  static get_type_name(): string;

  // MoniTool_SignText.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MoniTool_SignText.DynamicType (method)
  DynamicType(): Standard_Type;

  // MoniTool_SignText.delete (method)
  delete(): void;

  // MoniTool_SignText.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_Stat: declare class MoniTool_Stat

  // MoniTool_Stat.constructor (constructor)
  constructor(title?: string);
  constructor(other: MoniTool_Stat);

  // MoniTool_Stat.Current (method)
  static Current(): MoniTool_Stat;

  // MoniTool_Stat.Open (method)
  Open(nb?: number): number;

  // MoniTool_Stat.OpenMore (method)
  OpenMore(id: number, nb: number): void;

  // MoniTool_Stat.Add (method)
  Add(nb?: number): void;

  // MoniTool_Stat.AddSub (method)
  AddSub(nb?: number): void;

  // MoniTool_Stat.AddEnd (method)
  AddEnd(): void;

  // MoniTool_Stat.Close (method)
  Close(id: number): void;

  // MoniTool_Stat.Level (method)
  Level(): number;

  // MoniTool_Stat.Percent (method)
  Percent(fromlev?: number): number;

  // MoniTool_Stat.delete (method)
  delete(): void;

  // MoniTool_Stat.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_Timer: declare class MoniTool_Timer extends Standard_Transient

  // MoniTool_Timer.constructor (constructor)
  constructor();

  // MoniTool_Timer.Start (method)
  Start(): void;
  static Start(name: string): void;

  // MoniTool_Timer.Stop (method)
  Stop(): void;
  static Stop(name: string): void;

  // MoniTool_Timer.Reset (method)
  Reset(): void;

  // MoniTool_Timer.Count (method)
  Count(): number;

  // MoniTool_Timer.IsRunning (method)
  IsRunning(): number;

  // MoniTool_Timer.CPU (method)
  CPU(): number;

  // MoniTool_Timer.Amend (method)
  Amend(): number;

  // MoniTool_Timer.Timer (method)
  static Timer(name: string): MoniTool_Timer;

  // MoniTool_Timer.Dictionary (method)
  static Dictionary(): any;

  // MoniTool_Timer.ClearTimers (method)
  static ClearTimers(): void;

  // MoniTool_Timer.ComputeAmendments (method)
  static ComputeAmendments(): void;

  // MoniTool_Timer.GetAmendments (method)
  static GetAmendments(Access?: number, Internal?: number, External?: number, Error10?: number): { Access: number; Internal: number; External: number; Error10: number };

  // MoniTool_Timer.get_type_name (method)
  static get_type_name(): string;

  // MoniTool_Timer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MoniTool_Timer.DynamicType (method)
  DynamicType(): Standard_Type;

  // MoniTool_Timer.delete (method)
  delete(): void;

  // MoniTool_Timer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_TimerSentry: declare class MoniTool_TimerSentry

  // MoniTool_TimerSentry.constructor (constructor)
  constructor(cname: string);
  constructor(timer: MoniTool_Timer);

  // MoniTool_TimerSentry.Timer (method)
  Timer(): MoniTool_Timer;

  // MoniTool_TimerSentry.Stop (method)
  Stop(): void;

  // MoniTool_TimerSentry.delete (method)
  delete(): void;

  // MoniTool_TimerSentry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_TransientElem: declare class MoniTool_TransientElem extends MoniTool_Element

  // MoniTool_TransientElem.constructor (constructor)
  constructor(akey: Standard_Transient);

  // MoniTool_TransientElem.Value (method)
  Value(): Standard_Transient;

  // MoniTool_TransientElem.Equates (method)
  Equates(other: MoniTool_Element): boolean;

  // MoniTool_TransientElem.ValueType (method)
  ValueType(): Standard_Type;

  // MoniTool_TransientElem.ValueTypeName (method)
  ValueTypeName(): string;

  // MoniTool_TransientElem.get_type_name (method)
  static get_type_name(): string;

  // MoniTool_TransientElem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MoniTool_TransientElem.DynamicType (method)
  DynamicType(): Standard_Type;

  // MoniTool_TransientElem.delete (method)
  delete(): void;

  // MoniTool_TransientElem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_TypedValue: declare class MoniTool_TypedValue extends Standard_Transient

  // MoniTool_TypedValue.constructor (constructor)
  constructor(other: MoniTool_TypedValue);
  constructor(name: string, type_?: MoniTool_ValueType, init?: string);

  // MoniTool_TypedValue.Name (method)
  Name(): string;

  // MoniTool_TypedValue.ValueType (method)
  ValueType(): MoniTool_ValueType;

  // MoniTool_TypedValue.Definition (method)
  Definition(): TCollection_AsciiString;

  // MoniTool_TypedValue.SetDefinition (method)
  SetDefinition(deftext: string): void;

  // MoniTool_TypedValue.AddDef (method)
  AddDef(initext: string): boolean;

  // MoniTool_TypedValue.SetLabel (method)
  SetLabel(label: string): void;

  // MoniTool_TypedValue.Label (method)
  Label(): string;

  // MoniTool_TypedValue.SetMaxLength (method)
  SetMaxLength(max: number): void;

  // MoniTool_TypedValue.MaxLength (method)
  MaxLength(): number;

  // MoniTool_TypedValue.SetIntegerLimit (method)
  SetIntegerLimit(max: boolean, val: number): void;

  // MoniTool_TypedValue.IntegerLimit (method)
  IntegerLimit(max: boolean, val?: number): { returnValue: boolean; val: number };

  // MoniTool_TypedValue.SetRealLimit (method)
  SetRealLimit(max: boolean, val: number): void;

  // MoniTool_TypedValue.RealLimit (method)
  RealLimit(max: boolean, val?: number): { returnValue: boolean; val: number };

  // MoniTool_TypedValue.SetUnitDef (method)
  SetUnitDef(def: string): void;

  // MoniTool_TypedValue.UnitDef (method)
  UnitDef(): string;

  // MoniTool_TypedValue.StartEnum (method)
  StartEnum(start?: number, match?: boolean): void;

  // MoniTool_TypedValue.AddEnum (method)
  AddEnum(v1?: string, v2?: string, v3?: string, v4?: string, v5?: string, v6?: string, v7?: string, v8?: string, v9?: string, v10?: string): void;

  // MoniTool_TypedValue.AddEnumValue (method)
  AddEnumValue(val: string, num: number): void;

  // MoniTool_TypedValue.EnumDef (method)
  EnumDef(startcase?: number, endcase?: number, match?: boolean): { returnValue: boolean; startcase: number; endcase: number; match: boolean };

  // MoniTool_TypedValue.EnumVal (method)
  EnumVal(num: number): string;

  // MoniTool_TypedValue.EnumCase (method)
  EnumCase(val: string): number;

  // MoniTool_TypedValue.SetObjectType (method)
  SetObjectType(typ: Standard_Type): void;

  // MoniTool_TypedValue.ObjectType (method)
  ObjectType(): Standard_Type;

  // MoniTool_TypedValue.SetInterpret (method)
  SetInterpret(func: ((arg0: MoniTool_TypedValue, arg1: TCollection_HAsciiString, arg2: boolean) => TCollection_HAsciiString)): void;

  // MoniTool_TypedValue.HasInterpret (method)
  HasInterpret(): boolean;

  // MoniTool_TypedValue.SetSatisfies (method)
  SetSatisfies(func: ((arg0: TCollection_HAsciiString) => boolean), name: string): void;

  // MoniTool_TypedValue.SatisfiesName (method)
  SatisfiesName(): string;

  // MoniTool_TypedValue.IsSetValue (method)
  IsSetValue(): boolean;

  // MoniTool_TypedValue.CStringValue (method)
  CStringValue(): string;

  // MoniTool_TypedValue.HStringValue (method)
  HStringValue(): TCollection_HAsciiString;

  // MoniTool_TypedValue.Interpret (method)
  Interpret(hval: TCollection_HAsciiString, native: boolean): TCollection_HAsciiString;

  // MoniTool_TypedValue.Satisfies (method)
  Satisfies(hval: TCollection_HAsciiString): boolean;

  // MoniTool_TypedValue.ClearValue (method)
  ClearValue(): void;

  // MoniTool_TypedValue.SetCStringValue (method)
  SetCStringValue(val: string): boolean;

  // MoniTool_TypedValue.SetHStringValue (method)
  SetHStringValue(hval: TCollection_HAsciiString): boolean;

  // MoniTool_TypedValue.IntegerValue (method)
  IntegerValue(): number;

  // MoniTool_TypedValue.SetIntegerValue (method)
  SetIntegerValue(ival: number): boolean;

  // MoniTool_TypedValue.RealValue (method)
  RealValue(): number;

  // MoniTool_TypedValue.SetRealValue (method)
  SetRealValue(rval: number): boolean;

  // MoniTool_TypedValue.ObjectValue (method)
  ObjectValue(): Standard_Transient;

  // MoniTool_TypedValue.GetObjectValue (method)
  GetObjectValue(): { val: Standard_Transient; [Symbol.dispose](): void };

  // MoniTool_TypedValue.SetObjectValue (method)
  SetObjectValue(obj: Standard_Transient): boolean;

  // MoniTool_TypedValue.ObjectTypeName (method)
  ObjectTypeName(): string;

  // MoniTool_TypedValue.AddLib (method)
  static AddLib(tv: MoniTool_TypedValue, def?: string): boolean;

  // MoniTool_TypedValue.Lib (method)
  static Lib(def: string): MoniTool_TypedValue;

  // MoniTool_TypedValue.FromLib (method)
  static FromLib(def: string): MoniTool_TypedValue;

  // MoniTool_TypedValue.LibList (method)
  static LibList(): NCollection_HSequence_TCollection_AsciiString;

  // MoniTool_TypedValue.StaticValue (method)
  static StaticValue(name: string): MoniTool_TypedValue;

  // MoniTool_TypedValue.get_type_name (method)
  static get_type_name(): string;

  // MoniTool_TypedValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MoniTool_TypedValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // MoniTool_TypedValue.delete (method)
  delete(): void;

  // MoniTool_TypedValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MoniTool_ValueType: typeof MoniTool_ValueType[keyof typeof MoniTool_ValueType]

  readonly MoniTool_ValueMisc: 'MoniTool_ValueMisc'

  readonly MoniTool_ValueInteger: 'MoniTool_ValueInteger'

  readonly MoniTool_ValueReal: 'MoniTool_ValueReal'

  readonly MoniTool_ValueIdent: 'MoniTool_ValueIdent'

  readonly MoniTool_ValueVoid: 'MoniTool_ValueVoid'

  readonly MoniTool_ValueText: 'MoniTool_ValueText'

  readonly MoniTool_ValueEnum: 'MoniTool_ValueEnum'

  readonly MoniTool_ValueLogical: 'MoniTool_ValueLogical'

  readonly MoniTool_ValueSub: 'MoniTool_ValueSub'

  readonly MoniTool_ValueHexa: 'MoniTool_ValueHexa'

  readonly MoniTool_ValueBinary: 'MoniTool_ValueBinary'

MoniTool_DataMapOfShapeTransient: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher
