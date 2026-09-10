# libcascade — Transfer

16 top-level symbols. Signatures are verbatim typescript.

// This class allows to work with a TransferDispatch, i.e
Transfer_ActorDispatch: declare class Transfer_ActorDispatch extends Transfer_ActorOfTransientProcess

constructor

// Utility which adds an actor to the default <me> (it calls SetActor from the TransientProcess)
AddActor(actor: Transfer_ActorOfTransientProcess): void;

// Returns the TransferDispatch, which does the work, records the intermediate data, etc..
TransferDispatch(): Transfer_TransferDispatch;

// Specific action
Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The original class was renamed
Transfer_ActorOfFinderProcess: declare class Transfer_ActorOfFinderProcess extends Transfer_ActorOfProcessForFinder

constructor

// Returns the Transfer Mode, modifiable
ModeTrans(): number;

// Specific action of Transfer
Transferring(start: Transfer_Finder, TP: Transfer_ProcessForFinder, theProgress?: Message_ProgressRange): Transfer_Binder;

Transfer(start: Transfer_Finder, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

TransferTransient(start: Standard_Transient, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Standard_Transient;

// Sets parameters for shape processing
SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;
// theParameters: the parameters for shape processing

// Returns parameters for shape processing that was set by SetParameters() method
GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

// Sets flags defining operations to be performed on shapes
SetShapeProcessFlags(theFlags: any): void;
// theFlags: The flags defining operations to be performed on shapes

// Returns flags defining operations to be performed on shapes
GetShapeProcessFlags(): [any, boolean];

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Transfer_ActorOfProcessForFinder: declare class Transfer_ActorOfProcessForFinder extends Standard_Transient

constructor

// Prerequisite for Transfer
Recognize(start: Transfer_Finder): boolean;

// Specific action of Transfer
Transferring(start: Transfer_Finder, TP: Transfer_ProcessForFinder, theProgress?: Message_ProgressRange): Transfer_Binder;

// Prepares and Returns a Binder for a Transient Result Returns a Null Handle if <res> is itself Null
TransientResult(res: Standard_Transient): Transfer_SimpleBinderOfTransient;

// Returns a Binder for No Result, i.e
NullResult(): Transfer_Binder;

// If <mode> is True, commands an Actor to be set at the end of the list of Actors (see SetNext) If it is False (creation default), each add Actor is set at the beginning of the list This allows to define default Actors (which are Last)
SetLast(mode?: boolean): void;

// Returns the Last status (see SetLast)
IsLast(): boolean;

// Defines a Next Actor
SetNext(next: Transfer_ActorOfProcessForFinder): void;

// Returns the Actor defined as Next, or a Null Handle
Next(): Transfer_ActorOfProcessForFinder;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Transfer_ActorOfProcessForTransient: declare class Transfer_ActorOfProcessForTransient extends Standard_Transient

constructor

// Prerequisite for Transfer
Recognize(start: Standard_Transient): boolean;

// Specific action of Transfer
Transferring(start: Standard_Transient, TP: Transfer_ProcessForTransient, theProgress?: Message_ProgressRange): Transfer_Binder;

// Prepares and Returns a Binder for a Transient Result Returns a Null Handle if <res> is itself Null
TransientResult(res: Standard_Transient): Transfer_SimpleBinderOfTransient;

// Returns a Binder for No Result, i.e
NullResult(): Transfer_Binder;

// If <mode> is True, commands an Actor to be set at the end of the list of Actors (see SetNext) If it is False (creation default), each add Actor is set at the beginning of the list This allows to define default Actors (which are Last)
SetLast(mode?: boolean): void;

// Returns the Last status (see SetLast)
IsLast(): boolean;

// Defines a Next Actor
SetNext(next: Transfer_ActorOfProcessForTransient): void;

// Returns the Actor defined as Next, or a Null Handle
Next(): Transfer_ActorOfProcessForTransient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The original class was renamed
Transfer_ActorOfTransientProcess: declare class Transfer_ActorOfTransientProcess extends Transfer_ActorOfProcessForTransient

constructor

// Specific action of Transfer
Transferring(start: Standard_Transient, TP: Transfer_ProcessForTransient, theProgress?: Message_ProgressRange): Transfer_Binder;

Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

TransferTransient(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Standard_Transient;

// Sets parameters for shape processing
SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;
// theParameters: the parameters for shape processing

// Returns parameters for shape processing that was set by SetParameters() method
GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

// Sets flags defining operations to be performed on shapes
SetProcessingFlags(theFlags: any): void;
// theFlags: The flags defining operations to be performed on shapes

// Returns flags defining operations to be performed on shapes
GetProcessingFlags(): [any, boolean];

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Binder is an auxiliary object to Map the Result of the Transfer of a given Object
Transfer_Binder: declare class Transfer_Binder extends Standard_Transient

// Merges basic data (Check, ExecStatus) from another Binder but keeps its result
Merge(other: Transfer_Binder): void;

// Returns True if a Binder has several results, either by itself or because it has next results Can be defined by sub-classes
IsMultiple(): boolean;

// Returns the Type which characterizes the Result (if known)
ResultType(): Standard_Type;

// Returns the Name of the Type which characterizes the Result Can be returned even if ResultType itself is unknown
ResultTypeName(): string;

// Adds a next result (at the end of the list) Remark
AddResult(next: Transfer_Binder): void;

// Returns the next result, Null if none
NextResult(): Transfer_Binder;

// Returns True if a Result is available (StatusResult = Defined) A Unique Result will be gotten by Result (which must be defined in each sub-class according to result type) For a Multiple Result, see class MultipleBinder For other case, specific access has to be forecast
HasResult(): boolean;

// Declares that result is now used by another one, it means that it cannot be modified (by Rebind)
SetAlreadyUsed(): void;

// Returns status, which can be Initial (not yet done), Made (a result is recorded, not yet shared), Used (it is shared and cannot be modified)
Status(): Transfer_StatusResult;

// Returns execution status
StatusExec(): Transfer_StatusExec;

// Modifies execution status
SetStatusExec(stat: Transfer_StatusExec): void;

// Used to declare an individual transfer as being erroneous (Status is set to Void, StatusExec is set to Error, <errmess> is added to Check's list of Fails) It is possible to record several messages of error
AddFail(mess: string, orig?: string): void;

// Used to attach a Warning `Message` to an individual Transfer It has no effect on the Status
AddWarning(mess: string, orig?: string): void;

// Returns Check which stores Fail messages Note that no Entity is associated in this Check
Check(): Interface_Check;

// Returns Check which stores Fail messages, in order to modify it (adding messages, or replacing it)
CCheck(): Interface_Check;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This type of Binder allows to attach as result, besides a Transient Object, an Integer Value, which can be an Index in the Object if it defines a List, for instance
Transfer_BinderOfTransientInteger: declare class Transfer_BinderOfTransientInteger extends Transfer_SimpleBinderOfTransient

constructor

// Sets a value for the integer part
SetInteger(value: number): void;

// Returns the value set for the integer part
Integer(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Gives information on an object Used as template to instantiate Mapper and SimpleBinder This class is for Transient
Transfer_DataInfo: declare class Transfer_DataInfo

constructor

// Returns the Type attached to an object Here, the Dynamic Type of a Transient
static Type(ent: Standard_Transient): Standard_Type;

// Returns Type Name (string) Allows to name type of non-handled objects
static TypeName(ent: Standard_Transient): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This is an auxiliary class for TransferDispatch, which allows to record simple copies, as CopyControl from Interface, but based on a TransientProcess
Transfer_DispatchControl: declare class Transfer_DispatchControl extends Interface_CopyControl

constructor

// Returns the content of the DispatchControl
TransientProcess(): Transfer_TransientProcess;

// Returns the Model from which the transfer is to be done
StartingModel(): Interface_InterfaceModel;

// Clears the List of Copied Results
Clear(): void;

// Binds a (Transient) Result to a (Transient) Starting Entity
Bind(ent: Standard_Transient, res: Standard_Transient): void;

// Searches for the Result bound to a Starting Entity If Found, returns True and fills <res> Else, returns False and nullifies <res>
Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// FindHasher defines HashCode for Finder, which is
Transfer_FindHasher: declare class Transfer_FindHasher

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// a Finder allows to map any kind of object as a Key for a Map
Transfer_Finder: declare class Transfer_Finder extends Standard_Transient

// Returns the HashCode which has been stored by SetHashCode (remark that HashCode could be deferred then be defined by sub-classes, the result is the same)
GetHashCode(): number;

// Specific testof equality
Equates(other: Transfer_Finder): boolean;

// Returns the Type of the Value
ValueType(): Standard_Type;

// Returns the name of the Type of the Value
ValueTypeName(): string;

// Adds an attribute with a given name (replaces the former one with the same name if already exists)
SetAttribute(name: string, val: Standard_Transient): void;

// Removes an attribute Returns True when done, False if this attribute did not exist
RemoveAttribute(name: string): boolean;

// Returns an attribute from its name, filtered by a type If no attribute has this name, or if it is not kind of this type, <val> is Null and returned value is False Else, it is True
GetAttribute(name: string, type\_: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

// Returns an attribute from its name
Attribute(name: string): Standard_Transient;

// Returns the type of an attribute
AttributeType(name: string): Interface_ParamType;

// Adds an integer value for an attribute
SetIntegerAttribute(name: string, val: number): void;

// Returns an attribute from its name, as integer If no attribute has this name, or not an integer, <val> is 0 and returned value is False Else, it is True
GetIntegerAttribute(name: string, val?: number): { returnValue: boolean; val: number };

// Returns an integer attribute from its name
IntegerAttribute(name: string): number;

// Adds a real value for an attribute
SetRealAttribute(name: string, val: number): void;

// Returns an attribute from its name, as real If no attribute has this name, or not a real <val> is 0.0 and returned value is False Else, it is True
GetRealAttribute(name: string, val?: number): { returnValue: boolean; val: number };

// Returns a real attribute from its name
RealAttribute(name: string): number;

// Adds a String value for an attribute
SetStringAttribute(name: string, val: string): void;

// Returns a String attribute from its name
StringAttribute(name: string): string;

// Returns the exhaustive list of attributes
AttrList(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

// Gets the list of attributes from <other>, as such, i.e
SameAttributes(other: Transfer_Finder): void;

// Gets the list of attributes from <other>, by copying it By default, considers all the attributes from <other> If <fromname> is given, considers only the attributes with name beginning by <fromname>
GetAttributes(other: Transfer_Finder, fromname?: string, copied?: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Adds specific features to the generic definition
Transfer_FinderProcess: declare class Transfer_FinderProcess extends Transfer_ProcessForFinder

constructor

// Sets an InterfaceModel, which can be used during transfer for instance if a context must be managed, it is in the Model
SetModel(model: Interface_InterfaceModel): void;

// Returns the Model which can be used for context
Model(): Interface_InterfaceModel;

// In the list of mapped items (between 1 and NbMapped), searches for the first mapped item which follows <num0> (not included) and which has an attribute named <name> The considered Attributes are those brought by Finders,i.e
NextMappedWithAttribute(name: string, num0: number): number;

// Returns a TransientMapper for a given Transient Object Either <obj> is already mapped, then its Mapper is returned Or it is not, then a new one is created then returned, BUT it is not mapped here (use Bind or FindElseBind to do this)
TransientMapper(obj: Standard_Transient): Transfer_TransientMapper;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Transfer_IteratorOfProcessForFinder: declare class Transfer_IteratorOfProcessForFinder extends Transfer_TransferIterator

constructor

// Adds a Binder to the iteration list (construction) with no corresponding Starting Object (note that Result is brought by Binder) Adds a Binder to the iteration list, associated with its corresponding Starting Object "start" Starting Object is ignored if not required at Creation time
Add(binder: Transfer_Binder): void;
Add(binder: Transfer_Binder, start: Transfer_Finder): void;
Add(binder: Transfer_Binder): void;
Add(binder: Transfer_Binder, start: Transfer_Finder): void;

// After having added all items, keeps or rejects items which are attached to starting data given by <only> <keep> = True (D)
Filter(list: NCollection_HSequence_handle_Transfer_Finder, keep?: boolean): void;

// Returns True if Starting Object is available (defined at Creation Time)
HasStarting(): boolean;

// Returns corresponding Starting Object
Starting(): Transfer_Finder;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Transfer_IteratorOfProcessForTransient: declare class Transfer_IteratorOfProcessForTransient extends Transfer_TransferIterator

constructor

// Adds a Binder to the iteration list (construction) with no corresponding Starting Object (note that Result is brought by Binder) Adds a Binder to the iteration list, associated with its corresponding Starting Object "start" Starting Object is ignored if not required at Creation time
Add(binder: Transfer_Binder): void;
Add(binder: Transfer_Binder, start: Standard_Transient): void;
Add(binder: Transfer_Binder): void;
Add(binder: Transfer_Binder, start: Standard_Transient): void;

// After having added all items, keeps or rejects items which are attached to starting data given by <only> <keep> = True (D)
Filter(list: NCollection_HSequence_handle_Standard_Transient, keep?: boolean): void;

// Returns True if Starting Object is available (defined at Creation Time)
HasStarting(): boolean;

// Returns corresponding Starting Object
Starting(): Standard_Transient;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Transfer_MapContainer: declare class Transfer_MapContainer extends Standard_Transient

constructor

// Set map already translated geometry objects
SetMapObjects(theMapObjects: NCollection_DataMap_handle_Standard_Transient_handle_Standard_Transient): void;
// theMapObjects: Mutated in place

// Get map already translated geometry objects
GetMapObjects(): NCollection_DataMap_handle_Standard_Transient_handle_Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Allows direct binding between a starting Object and the Result of its transfer, when it can be made of several Transient Objects
Transfer_MultipleBinder: declare class Transfer_MultipleBinder extends Transfer_Binder

constructor

// Returns True if a starting object is bound with SEVERAL results
IsMultiple(): boolean;

// Returns the Type permitted for Results, i.e
ResultType(): Standard_Type;

// Returns the Name of the Type which characterizes the Result Here, returns "(list)"
ResultTypeName(): string;

// Adds a new Item to the Multiple Result
AddResult(res: Standard_Transient): void;
AddResult(next: Transfer_Binder): void;
AddResult(res: Standard_Transient): void;
AddResult(next: Transfer_Binder): void;

// Returns the actual count of recorded (Transient) results
NbResults(): number;

// Returns the value of the recorded result n0 <num>
ResultValue(num: number): Standard_Transient;

// Returns the Multiple Result, if it is defined (at least one Item)
MultipleResult(): NCollection_HSequence_handle_Standard_Transient;

// Defines a Binding with a Multiple Result, given as a Sequence Error if a Unique Result has yet been defined
SetMultipleResult(mulres: NCollection_HSequence_handle_Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
