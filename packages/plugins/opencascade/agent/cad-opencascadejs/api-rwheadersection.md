# libcascade — RWHeaderSection

5 top-level symbols. Signatures are verbatim typescript.

RWHeaderSection: declare class RWHeaderSection

constructor

static Init(): void;

delete(): void;

[Symbol.dispose](): void;

RWHeaderSection_RWFileDescription: declare class RWHeaderSection_RWFileDescription

constructor

WriteStep(SW: StepData_StepWriter, ent: unknown): void;

delete(): void;

[Symbol.dispose](): void;

RWHeaderSection_RWFileName: declare class RWHeaderSection_RWFileName

constructor

WriteStep(SW: StepData_StepWriter, ent: unknown): void;

delete(): void;

[Symbol.dispose](): void;

RWHeaderSection_RWFileSchema: declare class RWHeaderSection_RWFileSchema

constructor

WriteStep(SW: StepData_StepWriter, ent: unknown): void;

delete(): void;

[Symbol.dispose](): void;

RWHeaderSection_ReadWriteModule: declare class RWHeaderSection_ReadWriteModule extends StepData_ReadWriteModule

constructor

CaseStep(atype: TCollection_AsciiString): number;
CaseStep(types: NCollection_Sequence_TCollection_AsciiString): number;
CaseStep(atype: TCollection_AsciiString): number;
CaseStep(types: NCollection_Sequence_TCollection_AsciiString): number;

IsComplex(CN: number): boolean;

StepType(CN: number): string;

WriteStep(CN: number, SW: StepData_StepWriter, ent: Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
