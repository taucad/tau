# libcascade — RWHeaderSection

5 top-level symbols. Signatures are verbatim typescript.

RWHeaderSection: declare class RWHeaderSection

constructor

// enforced the initialisation of the libraries
static Init(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Read & Write Module for FileDescription
RWHeaderSection_RWFileDescription: declare class RWHeaderSection_RWFileDescription

constructor

WriteStep(SW: StepData_StepWriter, ent: unknown): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Read & Write Module for FileName
RWHeaderSection_RWFileName: declare class RWHeaderSection_RWFileName

constructor

WriteStep(SW: StepData_StepWriter, ent: unknown): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Read & Write Module for FileSchema
RWHeaderSection_RWFileSchema: declare class RWHeaderSection_RWFileSchema

constructor

WriteStep(SW: StepData_StepWriter, ent: unknown): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// General module to read and write `HeaderSection` entities
RWHeaderSection_ReadWriteModule: declare class RWHeaderSection_ReadWriteModule extends StepData_ReadWriteModule

constructor

// associates a positive Case Number to each type of `HeaderSection` entity, given as a String defined in the EXPRESS form associates a positive Case Number to each type of `HeaderSection` Complex entity, given as a String defined in the EXPRESS form
CaseStep(atype: TCollection_AsciiString): number;
CaseStep(types: NCollection_Sequence_TCollection_AsciiString): number;
CaseStep(atype: TCollection_AsciiString): number;
CaseStep(types: NCollection_Sequence_TCollection_AsciiString): number;

// returns True if the Case Number corresponds to a Complex Type
IsComplex(CN: number): boolean;

// returns a StepType (defined in EXPRESS form which belongs to a Type of Entity, identified by its CaseNumber determined by Protocol
StepType(CN: number): string;

// Write Function, switched by CaseNum
WriteStep(CN: number, SW: StepData_StepWriter, ent: Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
