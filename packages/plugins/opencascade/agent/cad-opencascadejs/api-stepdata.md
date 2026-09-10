# libcascade — StepData

18 top-level symbols. Signatures are verbatim typescript.

// Gives basic data definition for Step Interface
StepData: declare class StepData

constructor

// Returns the recorded HeaderProtocol, which can be
static HeaderProtocol(): StepData_Protocol;

// Adds a new Header Protocol to the Header Definition
static AddHeaderProtocol(headerproto: StepData_Protocol): void;

// Prepares General Data required to work with this package, which are the Protocol and Modules to be loaded into Libraries
static Init(): void;

// Returns a Protocol from {@link StepData`StepData`} (avoids to create it)
static Protocol(): StepData_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// General frame to describe entities with Description (Simple or Complex)
StepData_Described: declare class StepData_Described extends Standard_Transient

// Returns the Description used to define this entity
Description(): StepData_EDescr;

// Tells if a described entity is complex
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

// Fills a Check by using its Description
Check(): { ach: Interface_Check; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a Complex Entity (Plex) as a list of Simple ones
StepData_ECDescr: declare class StepData_ECDescr extends StepData_EDescr

constructor

// Adds a member Warning
Add(member: StepData_ESDescr): void;

// Returns the count of members
NbMembers(): number;

// Returns a Member from its rank
Member(num: number): StepData_ESDescr;

// Returns the ordered list of types
TypeList(): NCollection_HSequence_TCollection_AsciiString;

// Tells if a ESDescr matches a step type
Matches(steptype: string): boolean;

// Returns True
IsComplex(): boolean;

// Creates a described entity (i.e
NewEntity(): StepData_Described;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to describe the authorized form for an entity, either Simple or Plex
StepData_EDescr: declare class StepData_EDescr extends Standard_Transient

// Tells if a ESDescr matches a step type
Matches(steptype: string): boolean;

// Tells if a EDescr is complex (ECDescr) or simple (ESDescr)
IsComplex(): boolean;

// Creates a described entity (i.e
NewEntity(): StepData_Described;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to describe the authorized form for a Simple (not Plex) Entity, as a list of fields
StepData_ESDescr: declare class StepData_ESDescr extends StepData_EDescr

constructor

// Sets a new count of fields Each one is described by a PDescr
SetNbFields(nb: number): void;

// Sets a PDescr to describe a field A Field is designated by its rank and name
SetField(num: number, name: string, descr: StepData_PDescr): void;

// Sets an ESDescr as based on another one Hence, if there are inherited fields, the derived ESDescr cumulates all them, while the base just records its own ones
SetBase(base: StepData_ESDescr): void;

// Sets an ESDescr as "super-type"
SetSuper(super\_: StepData_ESDescr): void;

// Returns the type name given at creation time
TypeName(): string;

// Returns the type name as an AsciiString
StepType(): TCollection_AsciiString;

// Returns the basic ESDescr, null if <me> is not derived
Base(): StepData_ESDescr;

// Returns the super-type ESDescr, null if <me> is root
Super(): StepData_ESDescr;

// Tells if <me> is sub-type of (or equal to) another one
IsSub(other: StepData_ESDescr): boolean;

// Returns the count of fields
NbFields(): number;

// Returns the rank of a field from its name
Rank(name: string): number;

// Returns the name of a field from its rank
Name(num: number): string;

// Returns the PDescr for the field <num> (or Null)
Field(num: number): StepData_PDescr;

// Returns the PDescr for the field named <name> (or Null)
NamedField(name: string): StepData_PDescr;

// Tells if a ESDescr matches a step type
Matches(steptype: string): boolean;

// Returns False
IsComplex(): boolean;

// Creates a described entity (i.e
NewEntity(): StepData_Described;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives a way of conversion between the value of an enumeration and its representation in STEP An enumeration corresponds to an integer with reserved values, which begin to 0 In STEP, it is represented by a name in capital letter and limited by two dots, e.g
StepData_EnumTool: declare class StepData_EnumTool

constructor

// Processes a definition, splits it according blanks if any empty definitions are ignored A null definition can be input by given "$" :the corresponding position is attached to "null/undefined" value (as one particular item of the enumeration list) See also IsSet
AddDefinition(term: string): void;

// Returns True if at least one definition has been entered after creation time (i.e
IsSet(): boolean;

// Returns the maximum integer for a suitable value Remark
MaxValue(): number;

// Sets or Unsets the EnumTool to accept undefined value (for optional field)
Optional(mode: boolean): void;

// Returns the value attached to "null/undefined value" If none is specified or if Optional has been set to False, returns -1 Null Value has been specified by definition "$"
NullValue(): number;

// Returns the text which corresponds to a given numeric value It is limited by dots If num is out of range, returns an empty string
Text(num: number): TCollection_AsciiString;

// Returns the numeric value found for a text The text must be in capitals and limited by dots A non-suitable text gives a negative value to be returned
Value(txt: string): number;
Value(txt: TCollection_AsciiString): number;
Value(txt: string): number;
Value(txt: TCollection_AsciiString): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class for using units variables
StepData_Factors: declare class StepData_Factors

constructor

// Initializes the 3 factors for the conversion of units
InitializeFactors(theLengthFactor: number, thePlaneAngleFactor: number, theSolidAngleFactor: number): void;

// Sets length unit for current transfer process
SetCascadeUnit(theUnit: number): void;

// Returns length unit for current transfer process (mm by default)
CascadeUnit(): number;

// Returns transient length factor for scaling of shapes at one stage of transfer process
LengthFactor(): number;

// Returns transient plane angle factor for conversion of angles at one stage of transfer process
PlaneAngleFactor(): number;

// Returns transient solid angle factor for conversion of angles at one stage of transfer process
SolidAngleFactor(): number;

// Returns transient factor radian degree for conversion of angles at one stage of transfer process
FactorRadianDegree(): number;

// Returns transient factor degree radian for conversion of angles at one stage of transfer process
FactorDegreeRadian(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a generally defined Field for STEP data
StepData_Field: declare class StepData_Field

constructor

// Gets the copy of the values of another field
CopyFrom(other: StepData_Field): void;

// Clears the field, to set it as "no value defined" Just before SetList, predeclares it as "any" A Kind can be directly set here to declare a type
Clear(kind?: number): void;

// Codes a Field as derived (no proper value)
SetDerived(): void;

// Directly sets the Integer value, if its Kind matches Integer, Boolean, Logical, or Enum (does not change Kind) Internal access to an Integer Value for a list, plus its kind
SetInt(val: number): void;
SetInt(num: number, val: number, kind: number): void;
SetInt(val: number): void;
SetInt(num: number, val: number, kind: number): void;

// Sets an Integer value (before SetList\* declares it as Integer) Sets an Integer Value for a list (rank num) (recognizes a SelectMember)
SetInteger(val: number): void;
SetInteger(num: number, val: number): void;
SetInteger(val: number): void;
SetInteger(num: number, val: number): void;

// Sets a Boolean value (or predeclares a list as boolean)
SetBoolean(val: boolean): void;
SetBoolean(num: number, val: boolean): void;
SetBoolean(val: boolean): void;
SetBoolean(num: number, val: boolean): void;

// Sets a Logical Value (or predeclares a list as logical)
SetLogical(val: StepData_Logical): void;
SetLogical(num: number, val: StepData_Logical): void;
SetLogical(val: StepData_Logical): void;
SetLogical(num: number, val: StepData_Logical): void;

// Sets a Real Value (or predeclares a list as Real);
SetReal(val: number): void;
SetReal(num: number, val: number): void;
SetReal(val: number): void;
SetReal(num: number, val: number): void;

// Sets a String Value (or predeclares a list as String) Does not redefine the Kind if it is already String or Enum
SetString(val: string): void;
SetString(num: number, val: string): void;
SetString(val: string): void;
SetString(num: number, val: string): void;

// Sets an Enum Value (as its integer counterpart) (or predeclares a list as Enum) If <text> is given , also sets its textual expression <val> negative means unknown (known values begin at 0) Sets an Enum Value (Integer counterpart), also its text expression if known (if list has been set as "any")
SetEnum(val: number, text: string): void;
SetEnum(num: number, val: number, text: string): void;
SetEnum(val: number, text: string): void;
SetEnum(num: number, val: number, text: string): void;

// Sets a SelectMember (for Integer,Boolean,Enum,Real,Logical) Hence, the value of the field is accessed through this member
SetSelectMember(val: StepData_SelectMember): void;

// Sets an Entity Value
SetEntity(val: Standard_Transient): void;
SetEntity(): void;
SetEntity(num: number, val: Standard_Transient): void;
SetEntity(val: Standard_Transient): void;
SetEntity(): void;
SetEntity(num: number, val: Standard_Transient): void;
SetEntity(val: Standard_Transient): void;
SetEntity(): void;
SetEntity(num: number, val: Standard_Transient): void;

// Declares a field as a list, with an initial size Initial lower is defaulted as 1, can be defined The list starts empty, typed by the last Set* If no Set* before, sets it as "any" (transient/select)
SetList(size: number, first?: number): void;

// Declares a field as an homogeneous square list, with initial sizes, and initial lowers
SetList2(siz1: number, siz2: number, f1?: number, f2?: number): void;

// Sets an undetermined value
Set(val: Standard_Transient): void;

// Declares an item of the list as undefined (ignored if list not defined as String,Entity or Any)
ClearItem(num: number): void;

IsSet(n1?: number, n2?: number): boolean;

// Returns the kind of an item in a list or double list It is the kind of the list, except if it is "Any", in such a case the true kind is determined and returned
ItemKind(n1?: number, n2?: number): number;

// Returns the kind of the field <type> True (D)
Kind(type\_?: boolean): number;

Arity(): number;

Length(index?: number): number;

Lower(index?: number): number;

Int(): number;

Integer(n1?: number, n2?: number): number;

Boolean(n1?: number, n2?: number): boolean;

Logical(n1?: number, n2?: number): StepData_Logical;

Real(n1?: number, n2?: number): number;

String(n1: number, n2: number): string;

Enum(n1?: number, n2?: number): number;

EnumText(n1: number, n2: number): string;

Entity(n1?: number, n2?: number): Standard_Transient;

Transient(): Standard_Transient;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a list of fields, in a general way This basic class is for a null size list Subclasses are for 1, N (fixed) or Dynamic sizes
StepData_FieldList: declare class StepData_FieldList

constructor

// Returns the count of fields
NbFields(): number;

// Returns the field n0 <num> between 1 and NbFields (read only)
Field(num: number): StepData_Field;

// Returns the field n0 <num> between 1 and NbFields, in order to modify its content
CField(num: number): StepData_Field;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a list of ONE field
StepData_FieldList1: declare class StepData_FieldList1 extends StepData_FieldList

constructor

// Returns the count of fields
NbFields(): number;

// Returns the field n0 <num> between 1 and NbFields (read only)
Field(num: number): StepData_Field;

// Returns the field n0 <num> between 1 and NbFields, in order to modify its content
CField(num: number): StepData_Field;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a list of fields, in a general way This basic class is for a null size list Subclasses are for 1, N (fixed) or Dynamic sizes
StepData_FieldListD: declare class StepData_FieldListD extends StepData_FieldList

constructor

// Sets a new count of Fields
SetNb(nb: number): void;

// Returns the count of fields
NbFields(): number;

// Returns the field n0 <num> between 1 and NbFields (read only)
Field(num: number): StepData_Field;

// Returns the field n0 <num> between 1 and NbFields, in order to modify its content
CField(num: number): StepData_Field;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a list of fields, in a general way This basic class is for a null size list Subclasses are for 1, N (fixed) or Dynamic sizes
StepData_FieldListN: declare class StepData_FieldListN extends StepData_FieldList

constructor

// Returns the count of fields
NbFields(): number;

// Returns the field n0 <num> between 1 and NbFields (read only)
Field(num: number): StepData_Field;

// Returns the field n0 <num> between 1 and NbFields, in order to modify its content
CField(num: number): StepData_Field;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A FileProtocol is defined as the addition of several already existing Protocols
StepData_FileProtocol: declare class StepData_FileProtocol extends StepData_Protocol

constructor

// Adds a Protocol to the definition list of the FileProtocol But ensures that each class of Protocol is present only once in this list
Add(protocol: StepData_Protocol): void;

// Gives the count of Protocols used as Resource (can be zero) i.e
NbResources(): number;

// Returns a Resource, given a rank
Resource(num: number): Interface_Protocol;

// Returns a Case Number, specific of each recognized Type Here, NO Type at all is recognized properly
TypeNumber(atype: Standard_Type): number;

// Returns the Schema Name attached to each class of Protocol To be redefined by each sub-class Here, SchemaName returns "" (empty String) was C++
SchemaName(theModel: Interface_InterfaceModel): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepData_FileRecognizer: declare class StepData_FileRecognizer extends Standard_Transient

// Evaluates if recognition has a result, returns it if yes In case of success, Returns True and puts result in "res" In case of Failure, simply Returns False Works by calling deferred method Eval, and in case of failure, looks for Added Recognizers to work
Evaluate(akey: TCollection_AsciiString): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

// Returns result of last recognition (call of Evaluate)
Result(): Standard_Transient;

// Adds a new Recognizer to the Compound, at the end Several calls to Add work by adding in the order of calls
Add(reco: StepData_FileRecognizer): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepData_GlobalNodeOfWriterLib: declare class StepData_GlobalNodeOfWriterLib extends Standard_Transient

constructor

// Adds a Module bound with a Protocol to the list
Add(amodule: StepData_ReadWriteModule, aprotocol: StepData_Protocol): void;

// Returns the Module stored in a given GlobalNode
Module(): StepData_ReadWriteModule;

// Returns the attached Protocol stored in a given GlobalNode
Protocol(): StepData_Protocol;

// Returns the Next GlobalNode
Next(): StepData_GlobalNodeOfWriterLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A {@link Standard `Standard`} Definition for STEP (which knows Boolean too)
StepData_Logical: typeof StepData_Logical[keyof typeof StepData_Logical]

StepData_NodeOfWriterLib: declare class StepData_NodeOfWriterLib extends Standard_Transient

constructor

// Adds a couple (Module,Protocol), that is, stores it into itself if not yet done, else creates a Next Node to do it
AddNode(anode: StepData_GlobalNodeOfWriterLib): void;

// Returns the Module designated by a precise Node
Module(): StepData_ReadWriteModule;

// Returns the Protocol designated by a precise Node
Protocol(): StepData_Protocol;

// Returns the Next Node
Next(): StepData_NodeOfWriterLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to describe the authorized form for a parameter, as a type or a value for a field
StepData_PDescr: declare class StepData_PDescr extends Standard_Transient

constructor

SetName(name: string): void;

Name(): string;

// Declares this PDescr to be a Select, hence to have members <me> itself can be the first member
SetSelect(): void;

// Adds a member to a SELECT description
AddMember(member: StepData_PDescr): void;

// Sets a name for SELECT member
SetMemberName(memname: string): void;

// Sets <me> for an Integer value
SetInteger(): void;

// Sets <me> for a Real value
SetReal(): void;

// Sets <me> for a String value
SetString(): void;

// Sets <me> for a Boolean value (false,true)
SetBoolean(): void;

// Sets <me> for a Logical value (false,true,unknown)
SetLogical(): void;

// Sets <me> for an Enum value Then, call AddEnumDef ordered from the first one (value 0)
SetEnum(): void;

// Adds an enum value as a string
AddEnumDef(enumdef: string): void;

// Sets <me> for an Entity which must match a Type (early-bound)
SetType(atype: Standard_Type): void;

// Sets <me> for a Described Entity, whose Description must match the type name <dscnam>
SetDescr(dscnam: string): void;

// Adds an arity count to <me>, by default 1 1
AddArity(arity?: number): void;

// Directly sets the arity count 0
SetArity(arity?: number): void;

// Sets <me> as <other> but duplicated Hence, some definition may be changed
SetFrom(other: StepData_PDescr): void;

// Sets/Unsets <me> to accept undefined values
SetOptional(opt?: boolean): void;

// Sets/Unsets <me> to be for a derived field
SetDerived(der?: boolean): void;

// Sets <me> to describe a field of an entity With a name and a rank
SetField(name: string, rank: number): void;

// Tells if <me> is for a SELECT
IsSelect(): boolean;

// For a SELECT, returns the member whose name matches <name> To this member, the following question can then be asked Null Handle if <name> not matched or <me> not a SELECT
Member(name: string): StepData_PDescr;

// Tells if <me> is for an Integer
IsInteger(): boolean;

// Tells if <me> is for a Real value
IsReal(): boolean;

// Tells if <me> is for a String value
IsString(): boolean;

// Tells if <me> is for a Boolean value (false,true)
IsBoolean(): boolean;

// Tells if <me> is for a Logical value (false,true,unknown)
IsLogical(): boolean;

// Tells if <me> is for an Enum value Then, call AddEnumDef ordered from the first one (value 0) Managed by an EnumTool
IsEnum(): boolean;

// Returns the maximum integer for a suitable value (count - 1)
EnumMax(): number;

// Returns the numeric value found for an enum text The text must be in capitals and limited by dots A non-suitable text gives a negative value to be returned
EnumValue(name: string): number;

// Returns the text which corresponds to a numeric value, between 0 and EnumMax
EnumText(val: number): string;

// Tells if <me> is for an Entity, either Described or CDL Type
IsEntity(): boolean;

// Tells if <me> is for an entity of a given CDL type (early-bnd) (works for <me> + nexts if <me> is a Select)
IsType(atype: Standard_Type): boolean;

// Returns the type to match (IsKind), for a CDL Entity (else, null handle)
Type(): Standard_Type;

// Tells if <me> is for a Described entity of a given EDescr (does this EDescr match description name ?)
IsDescr(descr: StepData_EDescr): boolean;

// Returns the description (type name) to match, for a Described (else, empty string)
DescrName(): string;

// Returns the arity of <me>
Arity(): number;

// For a LIST or LIST OF LIST, Returns the PDescr for the simpler PDescr
Simple(): StepData_PDescr;

// Tells if <me> is Optional
IsOptional(): boolean;

// Tells if <me> is Derived
IsDerived(): boolean;

// Tells if <me> is a Field
IsField(): boolean;

FieldName(): string;

FieldRank(): number;

// Semantic Check of a Field
Check(afild: StepData_Field): { ach: Interface_Check; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
