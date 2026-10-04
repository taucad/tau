# libcascade — StepSelect

6 top-level symbols. Signatures are verbatim typescript.

StepSelect_Activator: declare class StepSelect_Activator extends IFSelect_Activator

  // StepSelect_Activator.constructor (constructor)
  constructor();

  // StepSelect_Activator.Do (method)
  Do(number_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

  // StepSelect_Activator.Help (method)
  Help(number_: number): string;

  // StepSelect_Activator.get_type_name (method)
  static get_type_name(): string;

  // StepSelect_Activator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepSelect_Activator.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepSelect_Activator.delete (method)
  delete(): void;

  // StepSelect_Activator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepSelect_FileModifier: declare class StepSelect_FileModifier extends IFSelect_GeneralModifier

  // StepSelect_FileModifier.Perform (method)
  Perform(ctx: IFSelect_ContextWrite, writer: StepData_StepWriter): void;

  // StepSelect_FileModifier.get_type_name (method)
  static get_type_name(): string;

  // StepSelect_FileModifier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepSelect_FileModifier.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepSelect_FileModifier.delete (method)
  delete(): void;

  // StepSelect_FileModifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepSelect_FloatFormat: declare class StepSelect_FloatFormat extends StepSelect_FileModifier

  // StepSelect_FloatFormat.constructor (constructor)
  constructor();

  // StepSelect_FloatFormat.SetDefault (method)
  SetDefault(digits?: number): void;

  // StepSelect_FloatFormat.SetZeroSuppress (method)
  SetZeroSuppress(mode: boolean): void;

  // StepSelect_FloatFormat.SetFormat (method)
  SetFormat(format?: string): void;

  // StepSelect_FloatFormat.SetFormatForRange (method)
  SetFormatForRange(format?: string, Rmin?: number, Rmax?: number): void;

  // StepSelect_FloatFormat.Format (method)
  Format(zerosup: boolean, mainform: TCollection_AsciiString, hasrange: boolean, forminrange: TCollection_AsciiString, rangemin?: number, rangemax?: number): { zerosup: boolean; hasrange: boolean; rangemin: number; rangemax: number };

  // StepSelect_FloatFormat.Perform (method)
  Perform(ctx: IFSelect_ContextWrite, writer: StepData_StepWriter): void;

  // StepSelect_FloatFormat.Label (method)
  Label(): TCollection_AsciiString;

  // StepSelect_FloatFormat.get_type_name (method)
  static get_type_name(): string;

  // StepSelect_FloatFormat.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepSelect_FloatFormat.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepSelect_FloatFormat.delete (method)
  delete(): void;

  // StepSelect_FloatFormat.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepSelect_ModelModifier: declare class StepSelect_ModelModifier extends IFSelect_Modifier

  // StepSelect_ModelModifier.get_type_name (method)
  static get_type_name(): string;

  // StepSelect_ModelModifier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepSelect_ModelModifier.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepSelect_ModelModifier.delete (method)
  delete(): void;

  // StepSelect_ModelModifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepSelect_StepType: declare class StepSelect_StepType extends IFSelect_Signature

  // StepSelect_StepType.constructor (constructor)
  constructor();

  // StepSelect_StepType.SetProtocol (method)
  SetProtocol(proto: Interface_Protocol): void;

  // StepSelect_StepType.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // StepSelect_StepType.get_type_name (method)
  static get_type_name(): string;

  // StepSelect_StepType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepSelect_StepType.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepSelect_StepType.delete (method)
  delete(): void;

  // StepSelect_StepType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepSelect_WorkLibrary: declare class StepSelect_WorkLibrary extends IFSelect_WorkLibrary

  // StepSelect_WorkLibrary.constructor (constructor)
  constructor(copymode?: boolean);

  // StepSelect_WorkLibrary.SetDumpLabel (method)
  SetDumpLabel(mode: number): void;

  // StepSelect_WorkLibrary.ReadFile (method)
  ReadFile(name: string, protocol: Interface_Protocol): { returnValue: number; model: Interface_InterfaceModel; [Symbol.dispose](): void };

  // StepSelect_WorkLibrary.WriteFile (method)
  WriteFile(ctx: IFSelect_ContextWrite): boolean;

  // StepSelect_WorkLibrary.get_type_name (method)
  static get_type_name(): string;

  // StepSelect_WorkLibrary.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepSelect_WorkLibrary.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepSelect_WorkLibrary.delete (method)
  delete(): void;

  // StepSelect_WorkLibrary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
