# libcascade — IGESData

17 top-level symbols. Signatures are verbatim typescript.

// basic description of an IGES Interface
IGESData: declare class IGESData

constructor

// Prepares General dynamic data used for {@link IGESData`IGESData`} specifically
static Init(): void;

// Returns a Protocol from {@link IGESData`IGESData`} (avoids to create it)
static Protocol(): IGESData_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides various functions of basic edition, such as
IGESData_BasicEditor: declare class IGESData_BasicEditor

constructor

// Initialize a Basic Editor, with a new IGESModel, ready to run
Init(protocol: IGESData_Protocol): void;
Init(model: IGESData_IGESModel, protocol: IGESData_Protocol): void;
Init(protocol: IGESData_Protocol): void;
Init(model: IGESData_IGESModel, protocol: IGESData_Protocol): void;

// Returns the designated model
Model(): IGESData_IGESModel;

// Sets a new unit from its flag (param 14 of Global Section) Returns True if done, False if <flag> is incorrect
SetUnitFlag(flag: number): boolean;

// Sets a new unit from its value in meters (rounded to the closest one, max gap 1%) Returns True if done, False if <val> is too far from a suitable value
SetUnitValue(val: number): boolean;

// Sets a new unit from its name (param 15 of Global Section) Returns True if done, False if <name> is incorrect Remark
SetUnitName(name: string): boolean;

// Applies unit value to convert header data
ApplyUnit(enforce?: boolean): void;

// Performs the re-computation of status on the whole model (Subordinate Status and Use Flag of each IGES Entity), which can have required values according the way they are referenced (see definitions of Logical use, Physical use, etc...)
ComputeStatus(): void;

// Performs auto-correction on an IGESEntity Returns True if something has changed, False if nothing done
AutoCorrect(ent: IGESData_IGESEntity): boolean;

// Performs auto-correction on the whole Model Returns the count of modified entities
AutoCorrectModel(): number;

// From the name of unit, computes flag number, 0 if incorrect (in this case, user defined entity remains possible)
static UnitNameFlag(name: string): number;

// From the flag of unit, determines value in MM, 0 if incorrect
static UnitFlagValue(flag: number): number;

// From the flag of unit, determines its name, "" if incorrect
static UnitFlagName(flag: number): string;

// From the flag of IGES version, returns name, "" if incorrect
static IGESVersionName(flag: number): string;

// Returns the maximum allowed value for IGESVersion Flag
static IGESVersionMax(): number;

// From the flag of drafting standard, returns name, "" if incorrect
static DraftingName(flag: number): string;

// Returns the maximum allowed value for Drafting Flag
static DraftingMax(): number;

// Returns Flag corresponding to the scaling theValue
static GetFlagByValue(theValue: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines required type for Color in directory part an effective Color entity must inherits it
IGESData_ColorEntity: declare class IGESData_ColorEntity extends IGESData_IGESEntity

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Some fields of an IGES entity may be
IGESData_DefList: typeof IGESData_DefList[keyof typeof IGESData_DefList]

// description of a directory component which can be either undefined (let Void), defined as a Reference to an entity, or as a Rank, integer value addressing a builtin table The entity reference is not included here, only reference status is kept (because entity type must be adapted)
IGESData_DefSwitch: declare class IGESData_DefSwitch

constructor

// sets DefSwitch to "Void" status (in file
SetVoid(): void;

// sets DefSwitch to "Reference" Status (in file
SetReference(): void;

// sets DefSwitch to "Rank" with a Value (in file
SetRank(val: number): void;

// returns DefType status (Void,Reference,Rank)
DefType(): IGESData_DefType;

// returns Value as Integer (sensefull for a Rank)
Value(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Some fields of an IGES entity may be
IGESData_DefType: typeof IGESData_DefType[keyof typeof IGESData_DefType]

// Processes the specific case of UndefinedEntity from {@link IGESData`IGESData`} (Case Number 1)
IGESData_DefaultGeneral: declare class IGESData_DefaultGeneral extends IGESData_GeneralModule

constructor

// Returns a DirChecker, specific for each type of Entity Here, Returns an empty DirChecker (no constraint to check)
DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

// Performs Specific Semantic Check for each type of Entity Here, does nothing (no constraint to check)
OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Specific creation of a new void entity (UndefinedEntity only)
NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Copies parameters which are specific of each Type of Entity
OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Specific IGES Services for UndefinedEntity, FreeFormatEntity
IGESData_DefaultSpecific: declare class IGESData_DefaultSpecific extends IGESData_SpecificModule

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class centralizes general Checks upon an IGES Entity's Directory Part
IGESData_DirChecker: declare class IGESData_DirChecker

constructor

// Returns True if at least one criterium has already been set Allows user to store a DirChecker (static variable) then ask if it has been set before setting it
IsSet(): boolean;

// Sets a DirChecker with most current criteria, that is
SetDefault(): void;

// Sets Structure criterium
Structure(crit: IGESData_DefType): void;

// Sets LineFont criterium If crit is DefVoid, Ignored
LineFont(crit: IGESData_DefType): void;

// Sets LineWeight criterium If crit is DefVoid, Ignored
LineWeight(crit: IGESData_DefType): void;

// Sets Color criterium If crit is DefVoid, Ignored
Color(crit: IGESData_DefType): void;

// Sets Graphics data (LineFont, LineWeight, Color, Level, View) to be ignored according value of Hierarchy status
GraphicsIgnored(hierarchy?: number): void;

// Sets Blank Status to be ignored (should not be defined, or its value should be 0)
BlankStatusIgnored(): void;

// Sets Blank Status to be required at a given value
BlankStatusRequired(val: number): void;

// Sets Subordinate Status to be ignored (should not be defined, or its value should be 0)
SubordinateStatusIgnored(): void;

// Sets Subordinate Status to be required at a given value
SubordinateStatusRequired(val: number): void;

// Sets Blank Status to be ignored (should not be defined, or its value should be 0)
UseFlagIgnored(): void;

// Sets Blank Status to be required at a given value Give -1 to demand UseFlag not zero (but no precise value req.)
UseFlagRequired(val: number): void;

// Sets Hierarchy Status to be ignored (should not be defined, or its value should be 0)
HierarchyStatusIgnored(): void;

// Sets Hierarchy Status to be required at a given value
HierarchyStatusRequired(val: number): void;

// Performs the Checks on an IGESEntity, according to the recorded criteria In addition, does minimal Checks, such as admitted range for Status, or presence of Error status in some data (Color, ...)
Check(ent: IGESData_IGESEntity): { ach: Interface_Check; [Symbol.dispose](): void };

// Performs a Check only on Values of Type Number and Form Number This allows to do a check on an Entity not yet completely filled but of which Type and Form Number have been already set
CheckTypeAndForm(ent: IGESData_IGESEntity): { ach: Interface_Check; [Symbol.dispose](): void };

// Corrects the Directory Entry of an IGES Entity as far as it is possible according recorded criteria without any ambiguity
Correct(ent: IGESData_IGESEntity): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// literal/numeric description of an entity's directory section, taken from file
IGESData_DirPart: declare class IGESData_DirPart

constructor

// fills DirPart with consistent data read from file
Init(i1: number, i2: number, i3: number, i4: number, i5: number, i6: number, i7: number, i8: number, i9: number, i19: number, i11: number, i12: number, i13: number, i14: number, i15: number, i16: number, i17: number, res1: string, res2: string, label: string, subscript: string): void;

// returns values recorded in DirPart (content of cstrings are modified)
Values(i1: number, i2: number, i3: number, i4: number, i5: number, i6: number, i7: number, i8: number, i9: number, i19: number, i11: number, i12: number, i13: number, i14: number, i15: number, i16: number, i17: number, res1: string, res2: string, label: string, subscript: string): { i1: number; i2: number; i3: number; i4: number; i5: number; i6: number; i7: number; i8: number; i9: number; i19: number; i11: number; i12: number; i13: number; i14: number; i15: number; i16: number; i17: number };

// returns "type" and "form" info, used to recognize the entity
Type(): IGESData_IGESType;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class allows to define complex protocols, in order to treat various sub-sets (or the complete set) of the IGES Norm, such as Solid + Draw (which are normally independent), etc..
IGESData_FileProtocol: declare class IGESData_FileProtocol extends IGESData_Protocol

constructor

// Adds a resource
Add(protocol: IGESData_Protocol): void;

// Gives the count of Resources
NbResources(): number;

// Returns a Resource, given a rank (rank of call to Add)
Resource(num: number): Interface_Protocol;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESData_FileRecognizer: declare class IGESData_FileRecognizer extends Standard_Transient

// Evaluates if recognition has a result, returns it if yes In case of success, Returns True and puts result in "res" In case of Failure, simply Returns False Works by calling deferred method Eval, and in case of failure, looks for Added Recognizers to work
Evaluate(akey: IGESData_IGESType): { returnValue: boolean; res: IGESData_IGESEntity; [Symbol.dispose](): void };

// Returns result of last recognition (call of Evaluate)
Result(): IGESData_IGESEntity;

// Adds a new Recognizer to the Compound, at the end Several calls to Add work by adding in the order of calls
Add(reco: IGESData_FileRecognizer): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of General Services adapted to IGES
IGESData_GeneralModule: declare class IGESData_GeneralModule extends Standard_Transient

// Semantic Checking of an IGESEntity
CheckCase(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Returns a DirChecker, specific for each type of Entity (identified by its Case Number)
DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

// Performs Specific Semantic Check for each type of Entity
OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Specific answer to the question "is Copy properly implemented" For IGES, answer is always True
CanCopy(CN: number, ent: Standard_Transient): boolean;

// Specific creation of a new void entity
NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Copy ("Deep") from <entfrom> to <entto> (same type) by using a CopyTool which provides its working Map
CopyCase(CN: number, entfrom: Standard_Transient, entto: Standard_Transient, TC: Interface_CopyTool): void;

// Copies parameters which are specific of each Type of Entity
OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Renewing of Implied References
RenewImpliedCase(CN: number, entfrom: Standard_Transient, entto: Standard_Transient, TC: Interface_CopyTool): void;

// Renews parameters which are specific of each Type of Entity
OwnRenewCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Prepares an IGES Entity for delete
WhenDeleteCase(CN: number, ent: Standard_Transient, dispatched: boolean): void;

// Specific preparation for delete, acts on own parameters Default does nothing, to be redefined as required
OwnDeleteCase(CN: number, ent: IGESData_IGESEntity): void;

// Returns the name of an IGES Entity (its NameValue) Can be redefined for an even more specific case ..
Name(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESData_GlobalNodeOfSpecificLib: declare class IGESData_GlobalNodeOfSpecificLib extends Standard_Transient

constructor

// Adds a Module bound with a Protocol to the list
Add(amodule: IGESData_SpecificModule, aprotocol: IGESData_Protocol): void;

// Returns the Module stored in a given GlobalNode
Module(): IGESData_SpecificModule;

// Returns the attached Protocol stored in a given GlobalNode
Protocol(): IGESData_Protocol;

// Returns the Next GlobalNode
Next(): IGESData_GlobalNodeOfSpecificLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESData_GlobalNodeOfWriterLib: declare class IGESData_GlobalNodeOfWriterLib extends Standard_Transient

constructor

// Adds a Module bound with a Protocol to the list
Add(amodule: IGESData_ReadWriteModule, aprotocol: IGESData_Protocol): void;

// Returns the Module stored in a given GlobalNode
Module(): IGESData_ReadWriteModule;

// Returns the attached Protocol stored in a given GlobalNode
Protocol(): IGESData_Protocol;

// Returns the Next GlobalNode
Next(): IGESData_GlobalNodeOfWriterLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of a global section (corresponds to file header) used as well in IGESModel, IGESReader and IGESWriter Warning
IGESData_GlobalSection: declare class IGESData_GlobalSection

constructor

// Fills GlobalSection from a ParamSet (i.e
Init(params: Interface_ParamSet): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies data referenced by Handle (that is, Strings) useful to "isolate" a GlobalSection after copy by "=" (from a Model to another Model for instance)
CopyRefs(): void;

// Returns all contained data in the form of a ParamSet Remark
Params(): Interface_ParamSet;

// Returns a string withpout its Hollerith marks (nnnH ahead)
TranslatedFromHollerith(astr: TCollection_HAsciiString): TCollection_HAsciiString;

// Returns the parameter delimiter character
Separator(): string;

// Returns the record delimiter character
EndMark(): string;

// Returns the name of the sending system
SendName(): TCollection_HAsciiString;

// Returns the name of the IGES file
FileName(): TCollection_HAsciiString;

// Returns the Native System ID of the system that created the IGES file
SystemId(): TCollection_HAsciiString;

// Returns the name of the pre-processor used to write the IGES file
InterfaceVersion(): TCollection_HAsciiString;

// Returns the number of binary bits for integer representations
IntegerBits(): number;

// Returns the maximum power of a decimal representation of a single-precision floating point number in the sending system
MaxPower10Single(): number;

MaxDigitsSingle(): number;

// Returns the maximum power of a decimal representation of a double-precision floating point number in the sending system
MaxPower10Double(): number;

MaxDigitsDouble(): number;

// Returns the name of the receiving system
ReceiveName(): TCollection_HAsciiString;

// Returns the scale used in the IGES file
Scale(): number;

// Returns the system length unit
CascadeUnit(): number;

// Returns the unit flag that was used to write the IGES file
UnitFlag(): number;

// Returns the name of the unit the IGES file was written in
UnitName(): TCollection_HAsciiString;

// Returns the maximum number of line weight gradations
LineWeightGrad(): number;

// Returns the of maximum line weight width in IGES file units
MaxLineWeight(): number;

// Returns the IGES file creation date
Date(): TCollection_HAsciiString;

// Returns the resolution used in the IGES file
Resolution(): number;

// Returns the approximate maximum coordinate value found in the model
MaxCoord(): number;

// Returns True if the approximate maximum coordinate value found in the model is greater than 0
HasMaxCoord(): boolean;

// Returns the name of the IGES file author
AuthorName(): TCollection_HAsciiString;

// Returns the name of the company where the IGES file was written
CompanyName(): TCollection_HAsciiString;

// Returns the IGES version that the IGES file was written in
IGESVersion(): number;

DraftingStandard(): number;

// Returns the date and time when the model was created or last modified (for IGES 5.1 and later)
LastChangeDate(): TCollection_HAsciiString;

// Returns True if the date and time when the model was created or last modified are specified, i.e
HasLastChangeDate(): boolean;

SetLastChangeDate(): void;
SetLastChangeDate(val: TCollection_HAsciiString): void;
SetLastChangeDate(): void;
SetLastChangeDate(val: TCollection_HAsciiString): void;

ApplicationProtocol(): TCollection_HAsciiString;

HasApplicationProtocol(): boolean;

// Returns a string built from year, month, day, hour, minute and second values
static NewDateString(year: number, month: number, day: number, hour: number, minut: number, second: number, mode: number): TCollection_HAsciiString;
static NewDateString(date: TCollection_HAsciiString, mode: number): TCollection_HAsciiString;
static NewDateString(year: number, month: number, day: number, hour: number, minut: number, second: number, mode: number): TCollection_HAsciiString;
static NewDateString(date: TCollection_HAsciiString, mode: number): TCollection_HAsciiString;

// Returns the unit value (in meters) that the IGES file was written in
UnitValue(): number;

SetSeparator(val: string): void;

SetEndMark(val: string): void;

SetSendName(val: TCollection_HAsciiString): void;

SetFileName(val: TCollection_HAsciiString): void;

SetSystemId(val: TCollection_HAsciiString): void;

SetInterfaceVersion(val: TCollection_HAsciiString): void;

SetIntegerBits(val: number): void;

SetMaxPower10Single(val: number): void;

SetMaxDigitsSingle(val: number): void;

SetMaxPower10Double(val: number): void;

SetMaxDigitsDouble(val: number): void;

SetReceiveName(val: TCollection_HAsciiString): void;

SetCascadeUnit(theUnit: number): void;

SetScale(val: number): void;

SetUnitFlag(val: number): void;

SetUnitName(val: TCollection_HAsciiString): void;

SetLineWeightGrad(val: number): void;

SetMaxLineWeight(val: number): void;

SetDate(val: TCollection_HAsciiString): void;

SetResolution(val: number): void;

SetMaxCoord(val?: number): void;

MaxMaxCoord(val?: number): void;

MaxMaxCoords(xyz: gp_XYZ): void;

SetAuthorName(val: TCollection_HAsciiString): void;

SetCompanyName(val: TCollection_HAsciiString): void;

SetIGESVersion(val: number): void;

SetDraftingStandard(val: number): void;

SetApplicationProtocol(val: TCollection_HAsciiString): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a way to obtain a clear Dump of an IGESEntity (distinct from normalized output)
IGESData_IGESDumper: declare class IGESData_IGESDumper

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
