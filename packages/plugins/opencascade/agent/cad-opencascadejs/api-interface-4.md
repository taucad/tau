# libcascade — Interface (4)

10 top-level symbols. Signatures are verbatim typescript.

// A ReportEntity is produced to acknowledge and memorize the binding between a Check and an Entity
Interface_ReportEntity: declare class Interface_ReportEntity extends Standard_Transient

constructor

// Sets a Content
SetContent(content: Standard_Transient): void;

// Returns the stored Check
Check(): Interface_Check;

// Returns the stored Check in order to change it
CCheck(): Interface_Check;

// Returns the stored Concerned Entity
Concerned(): Standard_Transient;

// Returns True if a Content is stored (it can equate Concerned)
HasContent(): boolean;

// Returns True if a Content is stored AND differs from Concerned (i.e
HasNewContent(): boolean;

// Returns the stored Content, or a Null Handle Remark that it must be an "Unknown Entity" suitable for the norm of the containing Model
Content(): Standard_Transient;

// Returns True for an Error Entity, i.e
IsError(): boolean;

// Returns True for an Unknown Entity, i,e
IsUnknown(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class manages statistics to be queried asynchronously
Interface_STAT: declare class Interface_STAT

constructor

// Returns fields in once, without copying them, used for copy when starting
Internals(total?: number): { tit: TCollection_HAsciiString; total: number; phn: NCollection_HSequence_TCollection_AsciiString; phw: NCollection_HSequence_double; phdeb: NCollection_HSequence_int; phfin: NCollection_HSequence_int; stw: NCollection_HSequence_double; [Symbol.dispose](): void };

// Adds a new phase to the description
AddPhase(weight: number, name?: string): void;

// Adds a new step for the last added phase, the default unique one if no AddPhase has already been added Warning
AddStep(weight?: number): void;

// Returns weight of a Step, related to the cumul given for the phase
Step(num: number): number;

// Starts a STAT on its first phase (or its default one) <items> gives the total count of items, <cycles> the count of cycles If <cycles> is more than one, the first Cycle must then be started by NextCycle (NextStep/NextItem are ignored)
Start(items: number, cycles?: number): void;

// Starts a default STAT, with no phase, no step, ready to just count items
static StartCount(items: number, title?: string): void;

// Commands to resume the preceding phase and start a new one <items> and <cycles> as for Start, but for this new phase Ignored if count of phases is already passed If <cycles> is more than one, the first Cycle must then be started by NextCycle (NextStep/NextItem are ignored)
static NextPhase(items: number, cycles?: number): void;

// Changes the parameters of the phase to start To be used before first counting (i.e
static SetPhase(items: number, cycles?: number): void;

// Commands to resume the preceding cycle and start a new one, with a count of items Ignored if count of cycles is already passed Then, first step is started (or default one) NextItem can be called for the first step, or NextStep to pass to the next one
static NextCycle(items: number): void;

// Commands to resume the preceding step of the cycle Ignored if count of steps is already passed NextItem can be called for this step, NextStep passes to next
static NextStep(): void;

// Commands to add an item in the current step of the current cycle of the current phase By default, one item per call, can be overpassed Ignored if count of items of this cycle is already passed
static NextItem(nbitems?: number): void;

// Commands to declare the process ended (hence, advancement is forced to 100 %)
static End(): void;

// Returns an identification of the STAT
static Where(phase: boolean): string;

// Returns the advancement as a percentage
static Percent(phase?: boolean): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class only says for each Entity of a Model, if it is Shared or not by one or more other(s) of this Model It uses the General Service "Shared"
Interface_ShareFlags: declare class Interface_ShareFlags

constructor

// Returns the Model used for the evaluation
Model(): Interface_InterfaceModel;

// Returns True if <ent> is Shared by one or more other Entity(ies) of the Model
IsShared(ent: Standard_Transient): boolean;

// Returns the count of root entities
NbRoots(): number;

// Returns a root entity according its rank in the list of roots By default, it returns the first one
Root(num?: number): Standard_Transient;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Builds the Graph of Dependencies, from the General Service "Shared" -> builds for each Entity of a Model, the Shared and Sharing Lists, and gives access to them
Interface_ShareTool: declare class Interface_ShareTool

constructor

// Returns the Model used for Creation (directly or for Graph)
Model(): Interface_InterfaceModel;

// Returns True if <ent> is Shared by other Entities in the Model
IsShared(ent: Standard_Transient): boolean;

// Returns the count of Sharing Entities of an Entity, which are Kind of a given Type
NbTypedSharings(ent: Standard_Transient, atype: Standard_Type): number;

// Returns the Sharing Entity of an Entity, which is Kind of a given Type
TypedSharing(ent: Standard_Transient, atype: Standard_Type): Standard_Transient;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Signature to give the Label from the Model
Interface_SignLabel: declare class Interface_SignLabel extends MoniTool_SignText

constructor

// Returns "Entity Label"
Name(): string;

// Considers context as an InterfaceModel and returns the Label computed by it
Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides the basic service to get a type name, according to a norm It can be used for other classes (general signatures ...)
Interface_SignType: declare class Interface_SignType extends MoniTool_SignText

// Returns an identification of the Signature (a word), given at initialization time Specialised to consider context as an InterfaceModel
Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

// Returns the Signature for a Transient object
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

// From a CDL Type Name, returns the Class part (package dropped) WARNING
static ClassName(typnam: string): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives a way to manage meaningful static variables, used as "global" parameters in various procedures
Interface_Static: declare class Interface_Static extends Interface_TypedValue

constructor

// Returns the family
Family(): string;

// Sets a "wild-card" static
SetWild(wildcard: Interface_Static): void;

// Returns the wildcard static, which can be (is most often) null
Wild(): Interface_Static;

// Records a Static has "uptodate", i.e
SetUptodate(): void;

// Returns the status "uptodate"
UpdatedStatus(): boolean;

// Declares a new Static (by calling its constructor) If this name is already taken, does nothing and returns False Else, creates it and returns True For additional definitions, get the Static then edit it
static Init(family: string, name: string, type*: Interface_ParamType, init: string): boolean;
static Init(family: string, name: string, type*: string, init: string): boolean;
static Init(family: string, name: string, type*: Interface_ParamType, init: string): boolean;
static Init(family: string, name: string, type*: string, init: string): boolean;

// Returns a Static from its name
static Static(name: string): Interface_Static;

// Returns True if a Static named <name> is present, False else
static IsPresent(name: string): boolean;

// Returns a part of the definition of a Static, as a CString The part is designated by its name, as a CString If the required value is not a string, it is converted to a CString then returned If <name> is not present, or <part> not defined for <name>, this function returns an empty string
static CDef(name: string, part: string): string;

// Returns a part of the definition of a Static, as an Integer The part is designated by its name, as a CString If the required value is not a string, returns zero For a Boolean, 0 for false, 1 for true If <name> is not present, or <part> not defined for <name>, this function returns zero
static IDef(name: string, part: string): number;

// Returns True if <name> is present AND set <proper> True (D)
static IsSet(name: string, proper?: boolean): boolean;

// Returns the value of the parameter identified by the string name
static CVal(name: string): string;

// Returns the integer value of the translation parameter identified by the string name
static IVal(name: string): number;

// Returns the value of a static translation parameter identified by the string name
static RVal(name: string): number;

// Modifies the value of the parameter identified by name
static SetCVal(name: string, val: string): boolean;

// Modifies the value of the parameter identified by name
static SetIVal(name: string, val: number): boolean;

// Modifies the value of a translation parameter
static SetRVal(name: string, val: number): boolean;

// Sets a Static to be "uptodate" Returns False if <name> is not present This status can be used by a reinitialisation procedure to rerun if a value has been changed
static Update(name: string): boolean;

// Returns the status "uptodate" from a Static Returns False if <name> is not present
static IsUpdated(name: string): boolean;

// Returns a list of names of statics
static Items(mode?: number, criter?: string): NCollection_HSequence_handle_TCollection_HAsciiString;

// Initializes all standard static parameters, which can be used by every function
static Standards(): void;

// Fills given string-to-string map with all static data
static FillMap(theMap: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;
// theMap: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Now strictly equivalent to TypedValue from MoniTool, except for ParamType which remains for compatibility reasons
Interface_TypedValue: declare class Interface_TypedValue extends MoniTool_TypedValue

constructor

// Returns the type I.E
Type(): Interface_ParamType;

// Correspondence ParamType from Interface to ValueType from MoniTool
static ParamTypeToValueType(typ: Interface_ParamType): MoniTool_ValueType;

// Correspondence ParamType from Interface to ValueType from MoniTool
static ValueTypeToParamType(typ: MoniTool_ValueType): Interface_ParamType;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_Array1OfHAsciiString: NCollection_Array1_handle_TCollection_HAsciiString

Interface_HArray1OfHAsciiString: NCollection_HArray1_handle_TCollection_HAsciiString
