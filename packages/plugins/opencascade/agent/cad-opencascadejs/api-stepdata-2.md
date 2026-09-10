# libcascade — StepData (2)

13 top-level symbols. Signatures are verbatim typescript.

// A Plex (for Complex) Entity is defined as a list of Simple Members ("external mapping") The types of these members must be in alphabetic order
StepData_Plex: declare class StepData_Plex extends StepData_Described

constructor

// Adds a member to <me>
Add(member: StepData_Simple): void;

// Returns the Description as for a Plex
ECDescr(): StepData_ECDescr;

// Returns False
IsComplex(): boolean;

// Tells if a step type is matched by <me> For a Simple Entity
Matches(steptype: string): boolean;

// Returns a Simple Entity which matches with a Type in <me>
As(steptype: string): StepData_Simple;

// Tells if a Field brings a given name
HasField(name: string): boolean;

// Returns a Field from its name
Field(name: string): StepData_Field;

// Returns a Field from its name
CField(name: string): StepData_Field;

// Returns the count of simple members
NbMembers(): number;

// Returns a simple member from its rank
Member(num: number): StepData_Simple;

// Returns the actual list of members types
TypeList(): NCollection_HSequence_TCollection_AsciiString;

// Fills a Check by using its Description
Check(): { ach: Interface_Check; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of Basic Protocol for Step The class Protocol from {@link StepData`StepData`} itself describes a default Protocol, which recognizes only UnknownEntities
StepData_Protocol: declare class StepData_Protocol extends Interface_Protocol

constructor

// Gives the count of Protocols used as Resource (can be zero) Here, No resource
NbResources(): number;

// Returns a Resource, given a rank
Resource(num: number): Interface_Protocol;

// Returns a unique positive number for any recognized entity Redefined to work by calling both TypeNumber and, for a Described Entity (late binding) DescrNumber
CaseNumber(obj: Standard_Transient): number;

// Returns a Case Number, specific of each recognized Type Here, only Unknown Entity is recognized
TypeNumber(atype: Standard_Type): number;

// Returns the Schema Name attached to each class of Protocol To be redefined by each sub-class Here, SchemaName returns "(DEFAULT)" was C++
SchemaName(theModel: Interface_InterfaceModel): string;

// Creates an empty Model for Step Norm
NewModel(): Interface_InterfaceModel;

// Returns True if <model> is a Model of Step Norm
IsSuitableModel(model: Interface_InterfaceModel): boolean;

// Creates a new Unknown Entity for Step (UndefinedEntity)
UnknownEntity(): Standard_Transient;

// Returns True if <ent> is an Unknown Entity for the Norm, i.e
IsUnknownEntity(ent: Standard_Transient): boolean;

// Returns a unique positive CaseNumber for types described by an EDescr (late binding) Warning
DescrNumber(adescr: StepData_EDescr): number;

// Records an EDescr with its case number Also records its name for an ESDescr (simple type)
AddDescr(adescr: StepData_EDescr, CN: number): void;

// Tells if a Protocol brings at least one ESDescr, i.e
HasDescr(): boolean;

// Returns the description attached to a case number, or null
Descr(num: number): StepData_EDescr;
Descr(name: string, anylevel: boolean): StepData_EDescr;
Descr(num: number): StepData_EDescr;
Descr(name: string, anylevel: boolean): StepData_EDescr;

// Idem as Descr but cast to simple description
ESDescr(name: string, anylevel?: boolean): StepData_ESDescr;

// Returns a complex description according to list of names <anylevel> True (D)
ECDescr(names: NCollection_Sequence_TCollection_AsciiString, anylevel?: boolean): StepData_ECDescr;

// Records an PDescr
AddPDescr(pdescr: StepData_PDescr): void;

// Returns a parameter description according to its name <anylevel> True (D)
PDescr(name: string, anylevel?: boolean): StepData_PDescr;

// Records an ESDescr, intended to build complex descriptions
AddBasicDescr(esdescr: StepData_ESDescr): void;

// Returns a basic description according to its name <anylevel> True (D)
BasicDescr(name: string, anylevel?: boolean): StepData_EDescr;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines basic File Access Module (Recognize, Read, Write) That is
StepData_ReadWriteModule: declare class StepData_ReadWriteModule extends Interface_ReaderModule

// Defines Case Numbers corresponding to the recognized Types Called by CaseNum (data,num) above for a Simple Type Entity Warning
CaseStep(atype: TCollection_AsciiString): number;
CaseStep(types: NCollection_Sequence_TCollection_AsciiString): number;
CaseStep(atype: TCollection_AsciiString): number;
CaseStep(types: NCollection_Sequence_TCollection_AsciiString): number;

// Returns True if the Case Number corresponds to a Complex Type ("Plex")
IsComplex(CN: number): boolean;

// Function specific to STEP, which delivers the StepType as it is recorded in and read from a File compliant with STEP
StepType(CN: number): string;

// Function specific to STEP
ShortType(CN: number): TCollection_AsciiString;

// Function specific to STEP, which delivers the list of types which corresponds to a complex type
ComplexType(CN: number, types: NCollection_Sequence_TCollection_AsciiString): boolean;
// types: Mutated in place

// Write Function, switched by CaseNum
WriteStep(CN: number, SW: StepData_StepWriter, ent: Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepData_SelectArrReal: declare class StepData_SelectArrReal extends StepData_SelectNamed

constructor

Kind(): number;

ArrReal(): NCollection_HArray1_double;

SetArrReal(arr: NCollection_HArray1_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectInt is a SelectMember specialised for a basic integer type in a select which also accepts entities
StepData_SelectInt: declare class StepData_SelectInt extends StepData_SelectMember

constructor

Kind(): number;

SetKind(kind: number): void;

// This internal method gives access to a value implemented by an Integer (to read it)
Int(): number;

// This internal method gives access to a value implemented by an Integer (to set it)
SetInt(val: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The general form for a Select Member
StepData_SelectMember: declare class StepData_SelectMember extends Standard_Transient

constructor

// Tells if a SelectMember has a name
HasName(): boolean;

// Returns the name of a SelectMember
Name(): string;

// Sets the name of a SelectMember, returns True if done, False if no name is allowed Default does nothing and returns False
SetName(name: string): boolean;

// Tells if the name of a SelectMember matches a given one By default, compares the strings, can be redefined (optimised)
Matches(name: string): boolean;

Kind(): number;

SetKind(kind: number): void;

// Returns the Kind of the SelectMember, under the form of an enum ParamType
ParamType(): Interface_ParamType;

// This internal method gives access to a value implemented by an Integer (to read it)
Int(): number;

// This internal method gives access to a value implemented by an Integer (to set it)
SetInt(val: number): void;

// Gets the value as an Integer
Integer(): number;

SetInteger(val: number): void;

Boolean(): boolean;

SetBoolean(val: boolean): void;

Logical(): StepData_Logical;

SetLogical(val: StepData_Logical): void;

Real(): number;

SetReal(val: number): void;

String(): string;

SetString(val: string): void;

Enum(): number;

EnumText(): string;

SetEnum(val: number, text?: string): void;

SetEnumText(val: number, text: string): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This select member can be of any kind, and be named But its takes more memory than some specialised ones This class allows one name for the instance
StepData_SelectNamed: declare class StepData_SelectNamed extends StepData_SelectMember

constructor

// Tells if a SelectMember has a name
HasName(): boolean;

// Returns the name of a SelectMember
Name(): string;

// Sets the name of a SelectMember, returns True if done, False if no name is allowed Default does nothing and returns False
SetName(name: string): boolean;

Field(): StepData_Field;

CField(): StepData_Field;

Kind(): number;

SetKind(kind: number): void;

// This internal method gives access to a value implemented by an Integer (to read it)
Int(): number;

// This internal method gives access to a value implemented by an Integer (to set it)
SetInt(val: number): void;

Real(): number;

SetReal(val: number): void;

String(): string;

SetString(val: string): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectReal is a SelectMember specialised for a basic real type in a select which also accepts entities
StepData_SelectReal: declare class StepData_SelectReal extends StepData_SelectMember

constructor

Kind(): number;

Real(): number;

SetReal(val: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// SelectType is the basis used for SELECT_TYPE definitions from the EXPRESS form
StepData_SelectType: declare class StepData_SelectType

// Recognizes the Type of an Entity
CaseNum(ent: Standard_Transient): number;

// Returns True if the Type of an Entity complies with the definition list of the SelectType
Matches(ent: Standard_Transient): boolean;

// Stores an Entity
SetValue(ent: Standard_Transient): void;

// Nullifies the Stored Entity
Nullify(): void;

// Returns the Stored Entity
Value(): Standard_Transient;

// Returns True if there is no Stored Entity (i.e
IsNull(): boolean;

// Returns the Effective (Dynamic) Type of the Stored Entity If it is Null, returns TYPE(Transient)
Type(): Standard_Type;

// Recognizes the Type of the stored Entity, or zero if it is Null or SelectMember
CaseNumber(): number;

// Returns the Description which corresponds to <me> Null if no specific description to give
Description(): StepData_PDescr;

// Returns a preferred SelectMember
NewMember(): StepData_SelectMember;

// Recognize a SelectMember (kind, name)
CaseMem(ent: StepData_SelectMember): number;

// Returns the Type of the stored SelectMember, or zero if it is Null or Entity
CaseMember(): number;

// Returns Value as a SelectMember
Member(): StepData_SelectMember;

// Returns the type name of SelectMember
SelectName(): string;

// This internal method gives access to a value implemented by an Integer (to read it)
Int(): number;

// This internal method gives access to a value implemented by an Integer (to set it)
SetInt(val: number): void;

// Gets the value as an Integer
Integer(): number;

// Sets a new Integer value, with an optional type name Warning
SetInteger(val: number, name?: string): void;

Boolean(): boolean;

SetBoolean(val: boolean, name?: string): void;

Logical(): StepData_Logical;

SetLogical(val: StepData_Logical, name?: string): void;

Real(): number;

SetReal(val: number, name?: string): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Simple Entity is defined by a type (which can heve super types) and a list of parameters
StepData_Simple: declare class StepData_Simple extends StepData_Described

constructor

// Returns description, as for simple
ESDescr(): StepData_ESDescr;

// Returns the recorded StepType (TypeName of its ESDescr)
StepType(): string;

// Returns False
IsComplex(): boolean;

// Tells if a step type is matched by <me> For a Simple Entity
Matches(steptype: string): boolean;

// Returns a Simple Entity which matches with a Type in <me>
As(steptype: string): StepData_Simple;

// Tells if a Field brings a given name
HasField(name: string): boolean;

// Returns a Field from its name
Field(name: string): StepData_Field;

// Returns a Field from its name
CField(name: string): StepData_Field;

// Returns the count of fields
NbFields(): number;

// Returns a field from its rank, for read-only use
FieldNum(num: number): StepData_Field;

// Returns a field from its rank, in order to modify it
CFieldNum(num: number): StepData_Field;

// Returns the entire field list, read-only
Fields(): StepData_FieldListN;

// Returns the entire field list, read or write
CFields(): StepData_FieldListN;

// Fills a Check by using its Description
Check(): { ach: Interface_Check; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a way to dump entities processed through STEP, with these features
StepData_StepDumper: declare class StepData_StepDumper

constructor

// Gives an access to the tool which is used to work
StepWriter(): StepData_StepWriter;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Gives access to
StepData_StepModel: declare class StepData_StepModel extends Interface_InterfaceModel

constructor

InternalParameters: unknown

// returns entity given its rank
Entity(num: number): Standard_Transient;

// gets header from another Model (uses Header Protocol)
GetFromAnother(other: Interface_InterfaceModel): void;

// Returns a New Empty Model, same type as <me>, i.e
NewEmptyModel(): Interface_InterfaceModel;

// says if a Header entity has a specified type
HasHeaderEntity(atype: Standard_Type): boolean;

// Returns Header entity with specified type, if there is
HeaderEntity(atype: Standard_Type): Standard_Transient;

// Clears the Header
ClearHeader(): void;

// Adds an Entity to the Header
AddHeaderEntity(ent: Standard_Transient): void;

// Specific Check, checks Header Items with HeaderProtocol
VerifyCheck(): { ach: Interface_Check; [Symbol.dispose](): void };

// erases specific labels, i.e
ClearLabels(): void;

// Attaches an ident to an entity to produce a label (does nothing if <ent> is not in <me>)
SetIdentLabel(ent: Standard_Transient, ident: number): void;

// returns the label ident attached to an entity, 0 if not in me
IdentLabel(ent: Standard_Transient): number;

// Returns a string with the label attached to a given entity, same form as for PrintLabel
StringLabel(ent: Standard_Transient): TCollection_HAsciiString;

// Return the encoding of STEP file for converting names into UNICODE
SourceCodePage(): Resource_FormatType;

// Return the encoding of STEP file for converting names into UNICODE
SetSourceCodePage(theCode: Resource_FormatType): void;

// Sets local length unit using for transfer process
SetLocalLengthUnit(theUnit: number): void;

// Returns local length unit using for transfer process (1 by default)
LocalLengthUnit(): number;

// Sets length unit using for writing process
SetWriteLengthUnit(theUnit: number): void;

// Returns length unit using for writing process (1 by default)
WriteLengthUnit(): number;

// Returns the unit initialization flag True - the unit was initialized False - the unit value was not initialized, the default value is used
IsInitializedUnit(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Specific FileReaderTool for Step
StepData_StepReaderTool: declare class StepData_StepReaderTool extends Interface_FileReaderTool

// Bounds empty entities to records, uses default Recognition provided by ReaderLib and ReaderModule
Prepare(optimize: boolean): void;
Prepare(reco: StepData_FileRecognizer, optimize: boolean): void;
Prepare(optimize: boolean): void;
Prepare(reco: StepData_FileRecognizer, optimize: boolean): void;

// recognizes records, by asking either ReaderLib (default) or FileRecognizer (if defined) to do so
Recognize(num: number): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

// bounds empty entities and sub-lists to header records works like Prepare + SetEntityNumbers, but for header (N.B.
PrepareHeader(reco: StepData_FileRecognizer): void;

// fills model's header
BeginRead(amodel: Interface_InterfaceModel): void;

// fills an entity, given record no
AnalyseRecord(num: number, anent: Standard_Transient): { returnValue: boolean; acheck: Interface_Check; [Symbol.dispose](): void };

// Ends file reading after reading all the entities Here, it binds in the model, Idents to Entities (for checks)
EndRead(amodel: Interface_InterfaceModel): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
