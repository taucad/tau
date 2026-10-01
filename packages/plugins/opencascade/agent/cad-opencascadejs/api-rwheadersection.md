# libcascade — RWHeaderSection

5 top-level symbols. Signatures are verbatim typescript.

RWHeaderSection: declare class RWHeaderSection

  // RWHeaderSection.constructor (constructor)
  constructor();

  // RWHeaderSection.Init (method)
  static Init(): void;

  // RWHeaderSection.delete (method)
  delete(): void;

  // RWHeaderSection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWHeaderSection_RWFileDescription: declare class RWHeaderSection_RWFileDescription

  // RWHeaderSection_RWFileDescription.constructor (constructor)
  constructor();

  // RWHeaderSection_RWFileDescription.WriteStep (method)
  WriteStep(SW: StepData_StepWriter, ent: unknown): void;

  // RWHeaderSection_RWFileDescription.delete (method)
  delete(): void;

  // RWHeaderSection_RWFileDescription.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWHeaderSection_RWFileName: declare class RWHeaderSection_RWFileName

  // RWHeaderSection_RWFileName.constructor (constructor)
  constructor();

  // RWHeaderSection_RWFileName.WriteStep (method)
  WriteStep(SW: StepData_StepWriter, ent: unknown): void;

  // RWHeaderSection_RWFileName.delete (method)
  delete(): void;

  // RWHeaderSection_RWFileName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWHeaderSection_RWFileSchema: declare class RWHeaderSection_RWFileSchema

  // RWHeaderSection_RWFileSchema.constructor (constructor)
  constructor();

  // RWHeaderSection_RWFileSchema.WriteStep (method)
  WriteStep(SW: StepData_StepWriter, ent: unknown): void;

  // RWHeaderSection_RWFileSchema.delete (method)
  delete(): void;

  // RWHeaderSection_RWFileSchema.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWHeaderSection_ReadWriteModule: declare class RWHeaderSection_ReadWriteModule extends StepData_ReadWriteModule

  // RWHeaderSection_ReadWriteModule.constructor (constructor)
  constructor();

  // RWHeaderSection_ReadWriteModule.CaseStep (method)
  CaseStep(atype: TCollection_AsciiString): number;
  CaseStep(types: NCollection_Sequence_TCollection_AsciiString): number;

  // RWHeaderSection_ReadWriteModule.IsComplex (method)
  IsComplex(CN: number): boolean;

  // RWHeaderSection_ReadWriteModule.StepType (method)
  StepType(CN: number): string;

  // RWHeaderSection_ReadWriteModule.WriteStep (method)
  WriteStep(CN: number, SW: StepData_StepWriter, ent: Standard_Transient): void;

  // RWHeaderSection_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // RWHeaderSection_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWHeaderSection_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWHeaderSection_ReadWriteModule.delete (method)
  delete(): void;

  // RWHeaderSection_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
