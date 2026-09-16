# libcascade — StepSelect

6 top-level symbols. Signatures are verbatim typescript.

StepSelect_Activator: declare class StepSelect_Activator extends IFSelect_Activator

  constructor

  Do(number_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

  Help(number_: number): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepSelect_FileModifier: declare class StepSelect_FileModifier extends IFSelect_GeneralModifier

  Perform(ctx: IFSelect_ContextWrite, writer: StepData_StepWriter): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepSelect_FloatFormat: declare class StepSelect_FloatFormat extends StepSelect_FileModifier

  constructor

  SetDefault(digits?: number): void;

  SetZeroSuppress(mode: boolean): void;

  SetFormat(format?: string): void;

  SetFormatForRange(format?: string, Rmin?: number, Rmax?: number): void;

  Format(zerosup: boolean, mainform: TCollection_AsciiString, hasrange: boolean, forminrange: TCollection_AsciiString, rangemin?: number, rangemax?: number): { zerosup: boolean; hasrange: boolean; rangemin: number; rangemax: number };

  Perform(ctx: IFSelect_ContextWrite, writer: StepData_StepWriter): void;

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepSelect_ModelModifier: declare class StepSelect_ModelModifier extends IFSelect_Modifier

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepSelect_StepType: declare class StepSelect_StepType extends IFSelect_Signature

  constructor

  SetProtocol(proto: Interface_Protocol): void;

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepSelect_WorkLibrary: declare class StepSelect_WorkLibrary extends IFSelect_WorkLibrary

  constructor

  SetDumpLabel(mode: number): void;

  ReadFile(name: string, protocol: Interface_Protocol): { returnValue: number; model: Interface_InterfaceModel; [Symbol.dispose](): void };

  WriteFile(ctx: IFSelect_ContextWrite): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
