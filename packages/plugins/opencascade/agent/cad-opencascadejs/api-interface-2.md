# libcascade — Interface (2)

18 top-level symbols. Signatures are verbatim typescript.

Interface_NodeOfGeneralLib: declare class Interface_NodeOfGeneralLib extends Standard_Transient

  // Interface_NodeOfGeneralLib.constructor (constructor)
  constructor();

  // Interface_NodeOfGeneralLib.AddNode (method)
  AddNode(anode: Interface_GlobalNodeOfGeneralLib): void;

  // Interface_NodeOfGeneralLib.Protocol (method)
  Protocol(): Interface_Protocol;

  // Interface_NodeOfGeneralLib.Next (method)
  Next(): Interface_NodeOfGeneralLib;

  // Interface_NodeOfGeneralLib.get_type_name (method)
  static get_type_name(): string;

  // Interface_NodeOfGeneralLib.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_NodeOfGeneralLib.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_NodeOfGeneralLib.delete (method)
  delete(): void;

  // Interface_NodeOfGeneralLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_NodeOfReaderLib: declare class Interface_NodeOfReaderLib extends Standard_Transient

  // Interface_NodeOfReaderLib.constructor (constructor)
  constructor();

  // Interface_NodeOfReaderLib.AddNode (method)
  AddNode(anode: Interface_GlobalNodeOfReaderLib): void;

  // Interface_NodeOfReaderLib.Module (method)
  Module(): Interface_ReaderModule;

  // Interface_NodeOfReaderLib.Protocol (method)
  Protocol(): Interface_Protocol;

  // Interface_NodeOfReaderLib.Next (method)
  Next(): Interface_NodeOfReaderLib;

  // Interface_NodeOfReaderLib.get_type_name (method)
  static get_type_name(): string;

  // Interface_NodeOfReaderLib.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_NodeOfReaderLib.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_NodeOfReaderLib.delete (method)
  delete(): void;

  // Interface_NodeOfReaderLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_ParamList: declare class Interface_ParamList extends Standard_Transient

  // Interface_ParamList.constructor (constructor)
  constructor(theIncrement?: number);

  // Interface_ParamList.Length (method)
  Length(): number;

  // Interface_ParamList.Lower (method)
  Lower(): number;

  // Interface_ParamList.Upper (method)
  Upper(): number;

  // Interface_ParamList.SetValue (method)
  SetValue(Index: number, Value: Interface_FileParameter): void;

  // Interface_ParamList.Value (method)
  Value(Index: number): Interface_FileParameter;

  // Interface_ParamList.ChangeValue (method)
  ChangeValue(Index: number): Interface_FileParameter;

  // Interface_ParamList.Clear (method)
  Clear(): void;

  // Interface_ParamList.get_type_name (method)
  static get_type_name(): string;

  // Interface_ParamList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_ParamList.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_ParamList.delete (method)
  delete(): void;

  // Interface_ParamList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_ParamSet: declare class Interface_ParamSet extends Standard_Transient

  // Interface_ParamSet.constructor (constructor)
  constructor(nres: number, nst?: number);

  // Interface_ParamSet.Append (method)
  Append(val: string, lnval: number, typ: Interface_ParamType, nument: number): number;
  Append(FP: Interface_FileParameter): number;

  // Interface_ParamSet.NbParams (method)
  NbParams(): number;

  // Interface_ParamSet.Param (method)
  Param(num: number): Interface_FileParameter;

  // Interface_ParamSet.ChangeParam (method)
  ChangeParam(num: number): Interface_FileParameter;

  // Interface_ParamSet.SetParam (method)
  SetParam(num: number, FP: Interface_FileParameter): void;

  // Interface_ParamSet.Params (method)
  Params(num: number, nb: number): Interface_ParamList;

  // Interface_ParamSet.Destroy (method)
  Destroy(): void;

  // Interface_ParamSet.get_type_name (method)
  static get_type_name(): string;

  // Interface_ParamSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_ParamSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_ParamSet.delete (method)
  delete(): void;

  // Interface_ParamSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_ParamType: typeof Interface_ParamType[keyof typeof Interface_ParamType]

  readonly Interface_ParamMisc: 'Interface_ParamMisc'

  readonly Interface_ParamInteger: 'Interface_ParamInteger'

  readonly Interface_ParamReal: 'Interface_ParamReal'

  readonly Interface_ParamIdent: 'Interface_ParamIdent'

  readonly Interface_ParamVoid: 'Interface_ParamVoid'

  readonly Interface_ParamText: 'Interface_ParamText'

  readonly Interface_ParamEnum: 'Interface_ParamEnum'

  readonly Interface_ParamLogical: 'Interface_ParamLogical'

  readonly Interface_ParamSub: 'Interface_ParamSub'

  readonly Interface_ParamHexa: 'Interface_ParamHexa'

  readonly Interface_ParamBinary: 'Interface_ParamBinary'

Interface_Protocol: declare class Interface_Protocol extends Standard_Transient

  // Interface_Protocol.Active (method)
  static Active(): Interface_Protocol;

  // Interface_Protocol.SetActive (method)
  static SetActive(aprotocol: Interface_Protocol): void;

  // Interface_Protocol.ClearActive (method)
  static ClearActive(): void;

  // Interface_Protocol.NbResources (method)
  NbResources(): number;

  // Interface_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // Interface_Protocol.CaseNumber (method)
  CaseNumber(obj: Standard_Transient): number;

  // Interface_Protocol.IsDynamicType (method)
  IsDynamicType(obj: Standard_Transient): boolean;

  // Interface_Protocol.NbTypes (method)
  NbTypes(obj: Standard_Transient): number;

  // Interface_Protocol.Type (method)
  Type(obj: Standard_Transient, nt?: number): Standard_Type;

  // Interface_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // Interface_Protocol.NewModel (method)
  NewModel(): Interface_InterfaceModel;

  // Interface_Protocol.IsSuitableModel (method)
  IsSuitableModel(model: Interface_InterfaceModel): boolean;

  // Interface_Protocol.UnknownEntity (method)
  UnknownEntity(): Standard_Transient;

  // Interface_Protocol.IsUnknownEntity (method)
  IsUnknownEntity(ent: Standard_Transient): boolean;

  // Interface_Protocol.get_type_name (method)
  static get_type_name(): string;

  // Interface_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_Protocol.delete (method)
  delete(): void;

  // Interface_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_ReaderLib: declare class Interface_ReaderLib

  // Interface_ReaderLib.constructor (constructor)
  constructor();
  constructor(aprotocol: Interface_Protocol);

  // Interface_ReaderLib.SetGlobal (method)
  static SetGlobal(amodule: Interface_ReaderModule, aprotocol: Interface_Protocol): void;

  // Interface_ReaderLib.AddProtocol (method)
  AddProtocol(aprotocol: Standard_Transient): void;

  // Interface_ReaderLib.Clear (method)
  Clear(): void;

  // Interface_ReaderLib.SetComplete (method)
  SetComplete(): void;

  // Interface_ReaderLib.Select (method)
  Select(obj: Standard_Transient, CN?: number): { returnValue: boolean; module_: Interface_ReaderModule; CN: number; [Symbol.dispose](): void };

  // Interface_ReaderLib.Start (method)
  Start(): void;

  // Interface_ReaderLib.More (method)
  More(): boolean;

  // Interface_ReaderLib.Next (method)
  Next(): void;

  // Interface_ReaderLib.Module (method)
  Module(): Interface_ReaderModule;

  // Interface_ReaderLib.Protocol (method)
  Protocol(): Interface_Protocol;

  // Interface_ReaderLib.delete (method)
  delete(): void;

  // Interface_ReaderLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_ReaderModule: declare class Interface_ReaderModule extends Standard_Transient

  // Interface_ReaderModule.get_type_name (method)
  static get_type_name(): string;

  // Interface_ReaderModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_ReaderModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_ReaderModule.delete (method)
  delete(): void;

  // Interface_ReaderModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_ReportEntity: declare class Interface_ReportEntity extends Standard_Transient

  // Interface_ReportEntity.constructor (constructor)
  constructor(unknown: Standard_Transient);
  constructor(acheck: Interface_Check, concerned: Standard_Transient);

  // Interface_ReportEntity.SetContent (method)
  SetContent(content: Standard_Transient): void;

  // Interface_ReportEntity.Check (method)
  Check(): Interface_Check;

  // Interface_ReportEntity.CCheck (method)
  CCheck(): Interface_Check;

  // Interface_ReportEntity.Concerned (method)
  Concerned(): Standard_Transient;

  // Interface_ReportEntity.HasContent (method)
  HasContent(): boolean;

  // Interface_ReportEntity.HasNewContent (method)
  HasNewContent(): boolean;

  // Interface_ReportEntity.Content (method)
  Content(): Standard_Transient;

  // Interface_ReportEntity.IsError (method)
  IsError(): boolean;

  // Interface_ReportEntity.IsUnknown (method)
  IsUnknown(): boolean;

  // Interface_ReportEntity.get_type_name (method)
  static get_type_name(): string;

  // Interface_ReportEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_ReportEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_ReportEntity.delete (method)
  delete(): void;

  // Interface_ReportEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_STAT: declare class Interface_STAT

  // Interface_STAT.constructor (constructor)
  constructor(title?: string);
  constructor(other: Interface_STAT);

  // Interface_STAT.Internals (method)
  Internals(total?: number): { tit: TCollection_HAsciiString; total: number; phn: NCollection_HSequence_TCollection_AsciiString; phw: NCollection_HSequence_double; phdeb: NCollection_HSequence_int; phfin: NCollection_HSequence_int; stw: NCollection_HSequence_double; [Symbol.dispose](): void };

  // Interface_STAT.AddPhase (method)
  AddPhase(weight: number, name?: string): void;

  // Interface_STAT.AddStep (method)
  AddStep(weight?: number): void;

  // Interface_STAT.Step (method)
  Step(num: number): number;

  // Interface_STAT.Start (method)
  Start(items: number, cycles?: number): void;

  // Interface_STAT.StartCount (method)
  static StartCount(items: number, title?: string): void;

  // Interface_STAT.NextPhase (method)
  static NextPhase(items: number, cycles?: number): void;

  // Interface_STAT.SetPhase (method)
  static SetPhase(items: number, cycles?: number): void;

  // Interface_STAT.NextCycle (method)
  static NextCycle(items: number): void;

  // Interface_STAT.NextStep (method)
  static NextStep(): void;

  // Interface_STAT.NextItem (method)
  static NextItem(nbitems?: number): void;

  // Interface_STAT.End (method)
  static End(): void;

  // Interface_STAT.Where (method)
  static Where(phase: boolean): string;

  // Interface_STAT.Percent (method)
  static Percent(phase?: boolean): number;

  // Interface_STAT.delete (method)
  delete(): void;

  // Interface_STAT.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_ShareFlags: declare class Interface_ShareFlags

  // Interface_ShareFlags.constructor (constructor)
  constructor(amodel: Interface_InterfaceModel);
  constructor(amodel: Interface_InterfaceModel, lib: Interface_GeneralLib);
  constructor(amodel: Interface_InterfaceModel, gtool: Interface_GTool);
  constructor(amodel: Interface_InterfaceModel, protocol: Interface_Protocol);

  // Interface_ShareFlags.Model (method)
  Model(): Interface_InterfaceModel;

  // Interface_ShareFlags.IsShared (method)
  IsShared(ent: Standard_Transient): boolean;

  // Interface_ShareFlags.NbRoots (method)
  NbRoots(): number;

  // Interface_ShareFlags.Root (method)
  Root(num?: number): Standard_Transient;

  // Interface_ShareFlags.delete (method)
  delete(): void;

  // Interface_ShareFlags.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_ShareTool: declare class Interface_ShareTool

  // Interface_ShareTool.constructor (constructor)
  constructor(amodel: Interface_InterfaceModel);
  constructor(amodel: Interface_InterfaceModel, lib: Interface_GeneralLib);
  constructor(amodel: Interface_InterfaceModel, gtool: Interface_GTool);
  constructor(amodel: Interface_InterfaceModel, protocol: Interface_Protocol);

  // Interface_ShareTool.Model (method)
  Model(): Interface_InterfaceModel;

  // Interface_ShareTool.IsShared (method)
  IsShared(ent: Standard_Transient): boolean;

  // Interface_ShareTool.NbTypedSharings (method)
  NbTypedSharings(ent: Standard_Transient, atype: Standard_Type): number;

  // Interface_ShareTool.TypedSharing (method)
  TypedSharing(ent: Standard_Transient, atype: Standard_Type): Standard_Transient;

  // Interface_ShareTool.delete (method)
  delete(): void;

  // Interface_ShareTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_SignLabel: declare class Interface_SignLabel extends MoniTool_SignText

  // Interface_SignLabel.constructor (constructor)
  constructor();

  // Interface_SignLabel.Name (method)
  Name(): string;

  // Interface_SignLabel.Text (method)
  Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

  // Interface_SignLabel.get_type_name (method)
  static get_type_name(): string;

  // Interface_SignLabel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_SignLabel.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_SignLabel.delete (method)
  delete(): void;

  // Interface_SignLabel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_SignType: declare class Interface_SignType extends MoniTool_SignText

  // Interface_SignType.Text (method)
  Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

  // Interface_SignType.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // Interface_SignType.ClassName (method)
  static ClassName(typnam: string): string;

  // Interface_SignType.get_type_name (method)
  static get_type_name(): string;

  // Interface_SignType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_SignType.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_SignType.delete (method)
  delete(): void;

  // Interface_SignType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_Static: declare class Interface_Static extends Interface_TypedValue

  // Interface_Static.constructor (constructor)
  constructor(family: string, name: string, other: Interface_Static);
  constructor(family: string, name: string, type_?: Interface_ParamType, init?: string);

  // Interface_Static.Family (method)
  Family(): string;

  // Interface_Static.SetWild (method)
  SetWild(wildcard: Interface_Static): void;

  // Interface_Static.Wild (method)
  Wild(): Interface_Static;

  // Interface_Static.SetUptodate (method)
  SetUptodate(): void;

  // Interface_Static.UpdatedStatus (method)
  UpdatedStatus(): boolean;

  // Interface_Static.Init (method)
  static Init(family: string, name: string, type_: Interface_ParamType, init: string): boolean;
  static Init(family: string, name: string, type_: string, init: string): boolean;

  // Interface_Static.Static (method)
  static Static(name: string): Interface_Static;

  // Interface_Static.IsPresent (method)
  static IsPresent(name: string): boolean;

  // Interface_Static.CDef (method)
  static CDef(name: string, part: string): string;

  // Interface_Static.IDef (method)
  static IDef(name: string, part: string): number;

  // Interface_Static.IsSet (method)
  static IsSet(name: string, proper?: boolean): boolean;

  // Interface_Static.CVal (method)
  static CVal(name: string): string;

  // Interface_Static.IVal (method)
  static IVal(name: string): number;

  // Interface_Static.RVal (method)
  static RVal(name: string): number;

  // Interface_Static.SetCVal (method)
  static SetCVal(name: string, val: string): boolean;

  // Interface_Static.SetIVal (method)
  static SetIVal(name: string, val: number): boolean;

  // Interface_Static.SetRVal (method)
  static SetRVal(name: string, val: number): boolean;

  // Interface_Static.Update (method)
  static Update(name: string): boolean;

  // Interface_Static.IsUpdated (method)
  static IsUpdated(name: string): boolean;

  // Interface_Static.Items (method)
  static Items(mode?: number, criter?: string): NCollection_HSequence_handle_TCollection_HAsciiString;

  // Interface_Static.Standards (method)
  static Standards(): void;

  // Interface_Static.FillMap (method)
  static FillMap(theMap: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  // Interface_Static.get_type_name (method)
  static get_type_name(): string;

  // Interface_Static.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_Static.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_Static.delete (method)
  delete(): void;

  // Interface_Static.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_TypedValue: declare class Interface_TypedValue extends MoniTool_TypedValue

  // Interface_TypedValue.constructor (constructor)
  constructor(name: string, type_?: Interface_ParamType, init?: string);

  // Interface_TypedValue.Type (method)
  Type(): Interface_ParamType;

  // Interface_TypedValue.ParamTypeToValueType (method)
  static ParamTypeToValueType(typ: Interface_ParamType): MoniTool_ValueType;

  // Interface_TypedValue.ValueTypeToParamType (method)
  static ValueTypeToParamType(typ: MoniTool_ValueType): Interface_ParamType;

  // Interface_TypedValue.get_type_name (method)
  static get_type_name(): string;

  // Interface_TypedValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Interface_TypedValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // Interface_TypedValue.delete (method)
  delete(): void;

  // Interface_TypedValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Interface_Array1OfHAsciiString: NCollection_Array1_handle_TCollection_HAsciiString

Interface_HArray1OfHAsciiString: NCollection_HArray1_handle_TCollection_HAsciiString
