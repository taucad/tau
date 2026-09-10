# libcascade — StepSelect

6 top-level symbols. Signatures are verbatim typescript.

// Performs Actions specific to StepSelect, i.e
StepSelect_Activator: declare class StepSelect_Activator extends IFSelect_Activator

constructor

// Executes a Command Line for StepSelect
Do(number\_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

// Sends a short help message for StepSelect commands
Help(number\_: number): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepSelect_FileModifier: declare class StepSelect_FileModifier extends IFSelect_GeneralModifier

// Perform the action specific to each class of File Modifier <ctx> is the ContextWrite, which brings
Perform(ctx: IFSelect_ContextWrite, writer: StepData_StepWriter): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives control out format for floatting values
StepSelect_FloatFormat: declare class StepSelect_FloatFormat extends StepSelect_FileModifier

constructor

// Sets FloatFormat to default value (see Create) but if <digits> is given positive, it commands Formats (main and range) to ensure <digits> significant digits to be displayed
SetDefault(digits?: number): void;

// Sets ZeroSuppress mode to a new value
SetZeroSuppress(mode: boolean): void;

// Sets Main Format to a new value Remark
SetFormat(format?: string): void;

// Sets Format for Range to a new value with its range of application
SetFormatForRange(format?: string, Rmin?: number, Rmax?: number): void;

// Returns all recorded parameters
Format(zerosup: boolean, mainform: TCollection_AsciiString, hasrange: boolean, forminrange: TCollection_AsciiString, rangemin?: number, rangemax?: number): { zerosup: boolean; hasrange: boolean; rangemin: number; rangemax: number };
// mainform: Mutated in place
// forminrange: Mutated in place

// Sets the Floatting Formats of StepWriter to the recorded parameters
Perform(ctx: IFSelect_ContextWrite, writer: StepData_StepWriter): void;

// Returns specific Label
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepSelect_ModelModifier: declare class StepSelect_ModelModifier extends IFSelect_Modifier

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// StepType is a Signature specific to Step definitions
StepSelect_StepType: declare class StepSelect_StepType extends IFSelect_Signature

constructor

// Sets the StepType signature to work with a Protocol
SetProtocol(proto: Interface_Protocol): void;

// Returns the Step Type defined from the Protocol (see above)
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Performs Read and Write a STEP File with a STEP Model Following the protocols, Copy may be implemented or not
StepSelect_WorkLibrary: declare class StepSelect_WorkLibrary extends IFSelect_WorkLibrary

constructor

// Selects a mode to dump entities 0 (D)
SetDumpLabel(mode: number): void;

// Reads a STEP File and returns a STEP Model (into <mod>), or lets <mod> "Null" in case of Error Returns 0 if OK, 1 if Read Error, -1 if File not opened
ReadFile(name: string, protocol: Interface_Protocol): { returnValue: number; model: Interface_InterfaceModel; [Symbol.dispose](): void };

// Writes a File from a STEP Model Returns False (and writes no file) if <ctx> does not bring a STEP Model
WriteFile(ctx: IFSelect_ContextWrite): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
