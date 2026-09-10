# libcascade — Interface (2)

14 top-level symbols. Signatures are verbatim typescript.

// Defines an Iterator on Entities
Interface_EntityIterator: declare class Interface_EntityIterator

constructor

// Gets a list of entities and adds its to the iteration list
AddList(list: NCollection_HSequence_handle_Standard_Transient): void;

// Adds to the iteration list a defined entity
AddItem(anentity: Standard_Transient): void;

// same as AddItem (kept for compatibility)
GetOneItem(anentity: Standard_Transient): void;

// Selects entities with are Kind of a given type, keep only them (is keep is True) or reject only them (if keep is False)
SelectType(atype: Standard_Type, keep: boolean): void;

// Returns count of entities which will be iterated on Calls Start if not yet done
NbEntities(): number;

// Returns count of entities of a given type (kind of)
NbTyped(type\_: Standard_Type): number;

// Allows re-iteration (useless for the first iteration)
Start(): void;

// Says if there are other entities (vertices) to iterate the first time, calls Start
More(): boolean;

// Sets iteration to the next entity (vertex) to give
Next(): void;

// Returns the current Entity iterated, to be used by Interface tools
Value(): Standard_Transient;

// Returns the content of the Iterator, accessed through a Handle to be used by a frontal-engine logic Returns an empty Sequence if the Iterator is empty Calls Start if not yet done
Content(): NCollection_HSequence_handle_Standard_Transient;

// Clears data of iteration
Destroy(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines a list of Entities (Transient Objects), it can be used as a field of other Transient classes, with these features
Interface_EntityList: declare class Interface_EntityList

constructor

// Clears the List
Clear(): void;

// Appends an Entity, that is to the END of the list (keeps order, but works slowerly than Add, see below)
Append(ent: Standard_Transient): void;

// Adds an Entity to the list, that is, with NO REGARD about the order (faster than Append if count becomes greater than 10)
Add(ent: Standard_Transient): void;

// Removes an Entity from the list, if it is there
Remove(ent: Standard_Transient): void;
Remove(num: number): void;
Remove(ent: Standard_Transient): void;
Remove(num: number): void;

// Returns True if the list is empty
IsEmpty(): boolean;

// Returns count of recorded Entities
NbEntities(): number;

// Returns an Item given its number
Value(num: number): Standard_Transient;

// Returns an Item given its number
SetValue(num: number, ent: Standard_Transient): void;

// Returns count of Entities of a given Type (0
NbTypedEntities(atype: Standard_Type): number;

// Returns the Entity which is of a given type
TypedEntity(atype: Standard_Type, num?: number): Standard_Transient;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class to store a literal parameter in a file intermediate directory or in an UndefinedContent
Interface_FileParameter: declare class Interface_FileParameter

constructor

// Fills fields (with Entity Number set to zero) Same as above, but builds the Value from a CString
Init(val: TCollection_AsciiString, typ: Interface_ParamType): void;
Init(val: string, typ: Interface_ParamType): void;
Init(val: TCollection_AsciiString, typ: Interface_ParamType): void;
Init(val: string, typ: Interface_ParamType): void;

// Same as above, but as a CString (for immediate exploitation) was C++
CValue(): string;

// Returns the type of the parameter
ParamType(): Interface_ParamType;

// Allows to set a reference to an Entity in a numbered list
SetEntityNumber(num: number): void;

// Returns value set by SetEntityNumber
EntityNumber(): number;

// Clears stored data
Clear(): void;

// Destructor
Destroy(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines services which are required to load an InterfaceModel from a File
Interface_FileReaderTool: declare class Interface_FileReaderTool

// Returns the Protocol given at creation time
Protocol(): Interface_Protocol;

// Stores a Model
SetModel(amodel: Interface_InterfaceModel): void;

// Returns the stored Model
Model(): Interface_InterfaceModel;

// Sets trace level used for outputting messages
SetTraceLevel(tracelev: number): void;

// Returns trace level used for outputting messages
TraceLevel(): number;

// Allows controlling whether exception raisings are handled If err is False, they are not (hence, dbx can take control) If err is True, they are, and they are traced (by putting on messenger Entity's Number and file record num) Default given at Model's creation time is True
SetErrorHandle(err: boolean): void;

// Returns ErrorHandle flag
ErrorHandle(): boolean;

// Fills records with empty entities
SetEntities(): void;

// Recognizes a record, given its number
Recognize(num: number): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

// Recognizes a record with the help of Libraries
RecognizeByLib(num: number, glib: Interface_GeneralLib, rlib: Interface_ReaderLib): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };
// glib: Mutated in place
// rlib: Mutated in place

// Provides an unknown entity, specific to the Interface called by SetEntities when Recognize has failed (Unknown alone) or by LoadModel when an Entity has caused a Fail on reading (to keep at least its literal description) Uses Protocol to do it
UnknownEntity(): Standard_Transient;

// Creates an empty Model of the norm
NewModel(): Interface_InterfaceModel;

// Reads and fills Entities from the FileReaderData set by SetData to an InterfaceModel
LoadModel(amodel: Interface_InterfaceModel): void;

// Reads, Fills and Returns one Entity read from a Record of the FileReaderData
LoadedEntity(num: number): Standard_Transient;

// Fills model's header
BeginRead(amodel: Interface_InterfaceModel): void;

// Fills an Entity, given record no
AnalyseRecord(num: number, anent: Standard_Transient): { returnValue: boolean; acheck: Interface_Check; [Symbol.dispose](): void };

// Ends file reading after reading all the entities default is doing nothing
EndRead(amodel: Interface_InterfaceModel): void;

// Clear fields
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class converts a floating number (Real) to a string It can be used if the standard C-C++ output functions (Sprintf or std::cout<<) are not convenient
Interface_FloatWriter: declare class Interface_FloatWriter

constructor

// Sets a specific Format for Sending Reals (main format) (Default from Creation is "%E") If <reset> is given True (default), this call clears effects of former calls to SetFormatForRange and SetZeroSuppress
SetFormat(form: string, reset?: boolean): void;

// Sets a secondary Format for Real, to be applied between R1 and R2 (in absolute values)
SetFormatForRange(form: string, R1: number, R2: number): void;

// Sets Sending Real Parameters to suppress trailing Zeros and Null Exponent ("E+00"), if <mode> is given True, Resets this mode if <mode> is False (in addition to Real Forms) A call to SetRealFrom resets this mode to False ig <reset> is given True (Default from Creation is True)
SetZeroSuppress(mode: boolean): void;

// Sets again options to the defaults given by Create
SetDefaults(chars?: number): void;

// Returns active options
Options(zerosup?: boolean, range?: boolean, R1?: number, R2?: number): { zerosup: boolean; range: boolean; R1: number; R2: number };

// Returns the main format was C++
MainFormat(): string;

// Returns the format for range, if set Meaningful only if <range> from Options is True was C++
FormatForRange(): string;

// Writes a Real value <val> to a string <text> by using the options
Write(val: number, text: string): number;

// This class method converts a Real Value to a string, given options given as arguments
static Convert(val: number, text: string, zerosup: boolean, Range1: number, Range2: number, mainform: string, rangeform: string): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// GTool - General Tool for a Model Provides the functions performed by Protocol/GeneralModule for entities of a Model, and recorded in a GeneralLib Optimized
Interface_GTool: declare class Interface_GTool extends Standard_Transient

constructor

// Sets a new SignType
SetSignType(sign: Interface_SignType): void;

// Returns the SignType
SignType(): Interface_SignType;

// Returns the Signature for a Transient Object in a Model It calls SignType to do that If SignType is not defined, return ClassName of <ent>
SignValue(ent: Standard_Transient, model: Interface_InterfaceModel): string;

// Returns the Name of the SignType, or "Class Name"
SignName(): string;

// Sets a new Protocol if <enforce> is False and the new Protocol equates the old one then nothing is done
SetProtocol(proto: Interface_Protocol, enforce?: boolean): void;

// Returns the Protocol
Protocol(): Interface_Protocol;

// Returns the GeneralLib itself
Lib(): Interface_GeneralLib;

// Reservates maps for a count of entities <enforce> False
Reservate(nb: number, enforce?: boolean): void;

// Clears the maps which record, for each already recorded entity its Module and Case Number
ClearEntities(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_GeneralLib: declare class Interface_GeneralLib

constructor

// Adds a couple (Module-Protocol) to the Library, given the class of a Protocol
AddProtocol(aprotocol: Standard_Transient): void;

// Clears the list of Modules of a library (can be used to redefine the order of Modules before action
Clear(): void;

// Sets a library to be defined with the complete Global list (all the couples Protocol/Modules recorded in it)
SetComplete(): void;

// Starts Iteration on the Modules (sets it on the first one)
Start(): void;

// Returns True if there are more Modules to iterate on
More(): boolean;

// Iterates by getting the next Module in the list If there is none, the exception will be raised by Value
Next(): void;

// Returns the current Protocol in the Iteration
Protocol(): Interface_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_GlobalNodeOfGeneralLib: declare class Interface_GlobalNodeOfGeneralLib extends Standard_Transient

constructor

// Returns the attached Protocol stored in a given GlobalNode
Protocol(): Interface_Protocol;

// Returns the Next GlobalNode
Next(): Interface_GlobalNodeOfGeneralLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_GlobalNodeOfReaderLib: declare class Interface_GlobalNodeOfReaderLib extends Standard_Transient

constructor

// Adds a Module bound with a Protocol to the list
Add(amodule: Interface_ReaderModule, aprotocol: Interface_Protocol): void;

// Returns the Module stored in a given GlobalNode
Module(): Interface_ReaderModule;

// Returns the attached Protocol stored in a given GlobalNode
Protocol(): Interface_Protocol;

// Returns the Next GlobalNode
Next(): Interface_GlobalNodeOfReaderLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines general form for classes of graph algorithms on Interfaces, this form is that of EntityIterator Each sub-class fills it according to its own algorithm This also allows to combine any graph result to others, all being given under one unique form
Interface_GraphContent: declare class Interface_GraphContent extends Interface_EntityIterator

constructor

// Does the Evaluation before starting the iteration itself (in out)
Begin(): void;

// Evaluates list of Entities to be iterated
Evaluate(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class detains the data which describe a Graph
Interface_IntList: declare class Interface_IntList

constructor

// Initialize IntList by number of entities
Initialize(nbe: number): void;

// Returns count of stored references
NbReferences(): number;

// Returns entity headers used to describe the lists
Entities(): NCollection_HArray1_int;

// Returns the packed references storage
References(): NCollection_HArray1_int;

// Returns internal values, used for copying
// DEPRECATED
Internals(nbrefs?: number): { nbrefs: number; ents: NCollection_HArray1_int; refs: NCollection_HArray1_int; [Symbol.dispose](): void };

// Returns count of entities to be acknowledged
NbEntities(): number;

// Changes the count of entities (ignored if decreased)
SetNbEntities(nbe: number): void;

// Sets an entity number as current (for read and fill)
SetNumber(number\_: number): void;

// Returns the current entity number
Number(): number;

// Returns an IntList, identical to <me> but set to a specified entity Number By default, not copied (in order to be read) Specified <copied> to produce another list and edit it
List(number\_: number, copied?: boolean): Interface_IntList;

// Sets current entity list to be redefined or not This is used in a Graph for redefinition list
SetRedefined(mode: boolean): void;

// Makes a reservation for <count> references to be later attached to the current entity
Reservate(count: number): void;

// Adds a reference (as an integer value, an entity number) to the current entity number
Add(ref: number): void;

// Returns the count of refs attached to current entity number
Length(): number;

// Returns True if the list for a number (default is taken as current) is "redefined" (useful for empty list)
IsRedefined(num?: number): boolean;

// Returns a reference number in the list for current number, according to its rank
Value(num: number): number;

// Removes an item in the list for current number, given its rank Returns True if done, False else
Remove(num: number): boolean;

// Clears all data, hence each entity number has an empty list
Clear(): void;

// Resizes lists to exact sizes
AdjustSize(margin?: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An Integer through a Handle (i.e
Interface_IntVal: declare class Interface_IntVal extends Standard_Transient

constructor

Value(): number;

CValue(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_InterfaceError: declare class Interface_InterfaceError extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_InterfaceMismatch: declare class Interface_InterfaceMismatch extends Interface_InterfaceError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
