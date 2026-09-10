# libcascade — Interface (3)

11 top-level symbols. Signatures are verbatim typescript.

// Defines an (Indexed) Set of data corresponding to a complete Transfer by a File Interface, i.e
Interface_InterfaceModel: declare class Interface_InterfaceModel extends Standard_Transient

// Clears the list of entities (service WhenDelete)
Destroy(): void;

// Sets a Protocol for this Model It is also set by a call to AddWithRefs with Protocol It is used for
SetProtocol(proto: Interface_Protocol): void;

// Returns the Protocol which has been set by SetProtocol, or AddWithRefs with Protocol
Protocol(): Interface_Protocol;

// Sets a GTool for this model, which already defines a Protocol
SetGTool(gtool: Interface_GTool): void;

// Returns the GTool, set by SetProtocol or by SetGTool
GTool(): Interface_GTool;

// Returns the Dispatch Status, either for get or set A Model which is produced from Dispatch may share entities with the original (according to the Protocol), hence these non-copied entities should not be deleted
DispatchStatus(): boolean;

// Erases contained data
Clear(): void;

// Clears the entities
ClearEntities(): void;

// Erases information about labels, if any
ClearLabels(): void;

// Clears Model's header
ClearHeader(): void;

// Returns count of contained Entities
NbEntities(): number;

// Returns True if a Model contains an Entity (for a ReportEntity, looks for the ReportEntity itself AND its Concerned Entity)
Contains(anentity: Standard_Transient): boolean;

// Returns the Number of an Entity in the Model if it contains it
Number(anentity: Standard_Transient): number;

// Returns an Entity identified by its number in the Model Each sub-class of InterfaceModel can define its own method Entity to return its specific class of Entity (e.g
Value(num: number): Standard_Transient;

// Returns the count of DISTINCT types under which an entity may be processed
NbTypes(ent: Standard_Transient): number;

// Returns a type, given its rank
Type(ent: Standard_Transient, num?: number): Standard_Type;

// Returns the type name of an entity, from the list of types (one or more ...) <complete> True (D) gives the complete type, else packages are removed WARNING
TypeName(ent: Standard_Transient, complete: boolean): string;

// From a CDL Type Name, returns the Class part (package dropped) WARNING
static ClassName(typnam: string): string;

// Returns the State of an entity, given its number
EntityState(num: number): Interface_DataState;

// Returns True if <num> identifies a ReportEntity in the Model Hence, ReportEntity can be called
IsReportEntity(num: number, semantic?: boolean): boolean;

// Returns a ReportEntity identified by its number in the Model, or a Null Handle If <num> does not identify a ReportEntity
ReportEntity(num: number, semantic?: boolean): Interface_ReportEntity;

// Returns True if <num> identifies an Error Entity
IsErrorEntity(num: number): boolean;

// Returns True if <num> identifies an Entity which content is redefined through a ReportEntity (i.e
IsRedefinedContent(num: number): boolean;

// Removes the ReportEntity attached to Entity <num>
ClearReportEntity(num: number): boolean;

// Sets or Replaces a ReportEntity for the Entity <num>
SetReportEntity(num: number, rep: Interface_ReportEntity): boolean;

// Adds a ReportEntity as such
AddReportEntity(rep: Interface_ReportEntity, semantic?: boolean): boolean;

// Returns True if <num> identifies an Unknown Entity
IsUnknownEntity(num: number): boolean;

// Returns True if semantic checks have been filled
HasSemanticChecks(): boolean;

// Returns the check attached to an entity, designated by its Number
Check(num: number, syntactic: boolean): Interface_Check;

// Does a reservation for the List of Entities (for optimized storage management)
Reservate(nbent: number): void;

// Internal method for adding an Entity
AddEntity(anentity: Standard_Transient): void;

// Same as above, but works with the Protocol of the Model
AddWithRefs(anent: Standard_Transient, level: number, listall: boolean): void;
AddWithRefs(anent: Standard_Transient, proto: Interface_Protocol, level: number, listall: boolean): void;
AddWithRefs(anent: Standard_Transient, lib: Interface_GeneralLib, level: number, listall: boolean): void;
AddWithRefs(anent: Standard_Transient, level: number, listall: boolean): void;
AddWithRefs(anent: Standard_Transient, proto: Interface_Protocol, level: number, listall: boolean): void;
AddWithRefs(anent: Standard_Transient, lib: Interface_GeneralLib, level: number, listall: boolean): void;
AddWithRefs(anent: Standard_Transient, level: number, listall: boolean): void;
AddWithRefs(anent: Standard_Transient, proto: Interface_Protocol, level: number, listall: boolean): void;
AddWithRefs(anent: Standard_Transient, lib: Interface_GeneralLib, level: number, listall: boolean): void;

// Replace Entity with Number=nument on other entity - "anent"
ReplaceEntity(nument: number, anent: Standard_Transient): void;

// Reverses the Numbers of the Entities, between <after> and the total count of Entities
ReverseOrders(after?: number): void;

// Changes the Numbers of some Entities
ChangeOrder(oldnum: number, newnum: number, count?: number): void;

// Gets header (data specific of a defined Interface) from another InterfaceModel
GetFromAnother(other: Interface_InterfaceModel): void;

// Returns a New Empty Model, same type as <me> (whatever its Type)
NewEmptyModel(): Interface_InterfaceModel;

// Records a category number for an entity number Returns True when done, False if <num> is out of range
SetCategoryNumber(num: number, val: number): boolean;

// Returns the recorded category number for a given entity number 0 if none was defined for this entity
CategoryNumber(num: number): number;

// Returns the GlobalCheck, which memorizes messages global to the file (not specific to an Entity), especially Header
GlobalCheck(syntactic?: boolean): Interface_Check;

// Allows to modify GlobalCheck, after getting then completing it Remark
SetGlobalCheck(ach: Interface_Check): void;

// Minimum Semantic Global Check on data in model (header) Can only check basic Data
VerifyCheck(): { ach: Interface_Check; [Symbol.dispose](): void };

// Returns a string with the label attached to a given entity
StringLabel(ent: Standard_Transient): TCollection_HAsciiString;

// Searches a label which matches with one entity
NextNumberForLabel(label: string, lastnum?: number, exact?: boolean): number;

// Returns true if a template is attached to a given name
static HasTemplate(name: string): boolean;

// Returns the template model attached to a name, or a Null Handle
static Template(name: string): Interface_InterfaceModel;

// Records a new template model with a name
static SetTemplate(name: string, model: Interface_InterfaceModel): boolean;

// Returns the complete list of names attached to template models
static ListTemplates(): NCollection_HSequence_handle_TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Simple Management of a Line Buffer, to be used by Interface File Writers
Interface_LineBuffer: declare class Interface_LineBuffer

constructor

// Changes Maximum allowed size of Buffer
SetMax(max: number): void;

// Sets an Initial reservation for Blank characters (this reservation is counted in the size of the current Line)
SetInitial(initial: number): void;

// Sets a Keep Status at current Length
SetKeep(): void;

// Returns True if there is room enough to add <more> characters Else, it is required to Dump the Buffer before refilling it <more> is recorded to manage SetKeep status
CanGet(more: number): boolean;

// Returns the Content of the LineBuffer
Content(): string;

// Returns the Length of the LineBuffer
Length(): number;

// Clears completely the LineBuffer
Clear(): void;

// Inhibits effect of SetInitial until the next Move (i.e
FreezeInitial(): void;

// Fills a AsciiString <str> with the Content of the Line Buffer, then Clears the LineBuffer
Move(str: TCollection_AsciiString): void;
Move(str: TCollection_HAsciiString): void;
Move(str: TCollection_AsciiString): void;
Move(str: TCollection_HAsciiString): void;
// str: Mutated in place

// Same as above, but generates the HAsciiString
Moved(): TCollection_HAsciiString;

// Adds a text as a CString
Add(text: string): void;
Add(text: TCollection_AsciiString): void;
Add(text: string): void;
Add(text: string, lntext: number): void;
Add(text: string): void;
Add(text: TCollection_AsciiString): void;
Add(text: string): void;
Add(text: string, lntext: number): void;
Add(text: string): void;
Add(text: TCollection_AsciiString): void;
Add(text: string): void;
Add(text: string, lntext: number): void;
Add(text: string): void;
Add(text: TCollection_AsciiString): void;
Add(text: string): void;
Add(text: string, lntext: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives a set of functions to manage and use a list of translated messages (messagery)
Interface_MSG: declare class Interface_MSG

constructor

// Optimised destructor (applies for additional forms of Create)
Destroy(): void;

// Returns the translated message, in a functional form with operator () was C++
Value(): string;

// Reads a list of messages from a stream, returns read count 0 means empty file, -1 means error
static Read(file: string): number;

// Returns True if a given message is surely a key (according to the form adopted for keys) (before activating messages, answer is false)
static IsKey(mess: string): boolean;

// Returns the item recorded for a key
static Translated(key: string): string;

// Fills the dictionary with a couple (key-item) If a key is already recorded, it is possible to
static Record(key: string, item: string): void;

// Sets the trace system to work when activated, as follow
static SetTrace(toprint: boolean, torecord: boolean): void;

// Sets the main modes for MSG
static SetMode(running: boolean, raising: boolean): void;

// Returns an "intervalled" value from a starting real <val>
static Intervalled(val: number, order?: number, upper?: boolean): number;

// Codes a date as a text, from its numeric value (-> seconds)
static TDate(text: string, yy: number, mm: number, dd: number, hh: number, mn: number, ss: number, format?: string): void;

// Decodes a date to numeric integer values Returns True if OK, False if text does not fit with required format
static NDate(text: string, yy?: number, mm?: number, dd?: number, hh?: number, mn?: number, ss?: number): { returnValue: boolean; yy: number; mm: number; dd: number; hh: number; mn: number; ss: number };

// Returns a value about comparison of two dates 0
static CDate(text1: string, text2: string): number;

// Returns a blank string of <count> blanks (mini 0, maxi 76) Returns a blank string, of length between 0 and <max>, to fill the printing of a numeric value <val>, i.e
static Blanks(count: number): string;
static Blanks(val: number, max: number): string;
static Blanks(val: string, max: number): string;
static Blanks(count: number): string;
static Blanks(val: number, max: number): string;
static Blanks(val: string, max: number): string;
static Blanks(count: number): string;
static Blanks(val: number, max: number): string;
static Blanks(val: string, max: number): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_NodeOfGeneralLib: declare class Interface_NodeOfGeneralLib extends Standard_Transient

constructor

// Adds a couple (Module,Protocol), that is, stores it into itself if not yet done, else creates a Next Node to do it
AddNode(anode: Interface_GlobalNodeOfGeneralLib): void;

// Returns the Protocol designated by a precise Node
Protocol(): Interface_Protocol;

// Returns the Next Node
Next(): Interface_NodeOfGeneralLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_NodeOfReaderLib: declare class Interface_NodeOfReaderLib extends Standard_Transient

constructor

// Adds a couple (Module,Protocol), that is, stores it into itself if not yet done, else creates a Next Node to do it
AddNode(anode: Interface_GlobalNodeOfReaderLib): void;

// Returns the Module designated by a precise Node
Module(): Interface_ReaderModule;

// Returns the Protocol designated by a precise Node
Protocol(): Interface_Protocol;

// Returns the Next Node
Next(): Interface_NodeOfReaderLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_ParamList: declare class Interface_ParamList extends Standard_Transient

constructor

// Returns the number of elements of <me>
Length(): number;

// Returns the lower bound
Lower(): number;

// Returns the upper bound
Upper(): number;

// Assigns the value to the <Index>-th item of this array
SetValue(Index: number, Value: Interface_FileParameter): void;

// Return the value of the <Index>th element of the array
Value(Index: number): Interface_FileParameter;

// return the value of the <Index>th element of the array
ChangeValue(Index: number): Interface_FileParameter;

Clear(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines an ordered set of FileParameters, in a way to be efficient as in memory requirement or in speed
Interface_ParamSet: declare class Interface_ParamSet extends Standard_Transient

constructor

// Adds a parameter defined as its Value (CString and length) and Type
Append(val: string, lnval: number, typ: Interface_ParamType, nument: number): number;
Append(FP: Interface_FileParameter): number;
Append(val: string, lnval: number, typ: Interface_ParamType, nument: number): number;
Append(FP: Interface_FileParameter): number;

// Returns the total count of parameters (including nexts)
NbParams(): number;

// Returns a parameter identified by its number
Param(num: number): Interface_FileParameter;

// Same as above, but in order to be modified on place
ChangeParam(num: number): Interface_FileParameter;

// Changes a parameter identified by its number
SetParam(num: number, FP: Interface_FileParameter): void;

// Builds and returns the sub-list corresponding to parameters, from "num" included, with count "nb" If <num> and <nb> are zero, returns the whole list
Params(num: number, nb: number): Interface_ParamList;

// Destructor (waiting for transparent memory management)
Destroy(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_ParamType: typeof Interface_ParamType[keyof typeof Interface_ParamType]

// General description of Interface Protocols
Interface_Protocol: declare class Interface_Protocol extends Standard_Transient

// Returns the Active Protocol, if defined (else, returns a Null Handle, which means "no defined active protocol")
static Active(): Interface_Protocol;

// Sets a given Protocol to be the Active one (for the users of Active, see just above)
static SetActive(aprotocol: Interface_Protocol): void;

// Erases the Active Protocol (hence it becomes undefined)
static ClearActive(): void;

// Returns count of Protocol used as Resources (level one)
NbResources(): number;

// Returns a Resource, given its rank (between 1 and NbResources)
Resource(num: number): Interface_Protocol;

// Returns a unique positive CaseNumber for each Recognized Object
CaseNumber(obj: Standard_Transient): number;

// Returns True if type of <obj> is that defined from CDL This is the default but it may change according implementation
IsDynamicType(obj: Standard_Transient): boolean;

// Returns the count of DISTINCT types under which an entity may be processed
NbTypes(obj: Standard_Transient): number;

// Returns a type under which <obj> can be recognized and processed, according its rank in its definition list (see NbTypes)
Type(obj: Standard_Transient, nt?: number): Standard_Type;

// Returns a unique positive CaseNumber for each Recognized Type, Returns Zero for "<type> not recognized"
TypeNumber(atype: Standard_Type): number;

// Creates an empty Model of the considered Norm
NewModel(): Interface_InterfaceModel;

// Returns True if <model> is a Model of the considered Norm
IsSuitableModel(model: Interface_InterfaceModel): boolean;

// Creates a new Unknown Entity for the considered Norm
UnknownEntity(): Standard_Transient;

// Returns True if <ent> is an Unknown Entity for the Norm, i.e
IsUnknownEntity(ent: Standard_Transient): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_ReaderLib: declare class Interface_ReaderLib

constructor

// Adds a couple (Module-Protocol) into the global definition set for this class of Library
static SetGlobal(amodule: Interface_ReaderModule, aprotocol: Interface_Protocol): void;

// Adds a couple (Module-Protocol) to the Library, given the class of a Protocol
AddProtocol(aprotocol: Standard_Transient): void;

// Clears the list of Modules of a library (can be used to redefine the order of Modules before action
Clear(): void;

// Sets a library to be defined with the complete Global list (all the couples Protocol/Modules recorded in it)
SetComplete(): void;

// Selects a Module from the Library, given an Object
Select(obj: Standard*Transient, CN?: number): { returnValue: boolean; module*: Interface_ReaderModule; CN: number; [Symbol.dispose](): void };

// Starts Iteration on the Modules (sets it on the first one)
Start(): void;

// Returns True if there are more Modules to iterate on
More(): boolean;

// Iterates by getting the next Module in the list If there is none, the exception will be raised by Value
Next(): void;

// Returns the current Module in the Iteration
Module(): Interface_ReaderModule;

// Returns the current Protocol in the Iteration
Protocol(): Interface_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines unitary operations required to read an Entity from a File (see FileReaderData, FileReaderTool), under control of a FileReaderTool
Interface_ReaderModule: declare class Interface_ReaderModule extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
