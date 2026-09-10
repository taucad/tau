# libcascade — IFSelect (2)

28 top-level symbols. Signatures are verbatim typescript.

// A ListEditor is an auxiliary operator for Editor/EditForm I.E
IFSelect_ListEditor: declare class IFSelect_ListEditor extends Standard_Transient

constructor

// Loads a Model
LoadModel(model: Interface_InterfaceModel): void;

// Loads the original values for the list
LoadValues(vals: NCollection_HSequence_handle_TCollection_HAsciiString): void;

// Declares this ListEditor to have been touched (whatever action)
SetTouched(): void;

// Clears all editions already recorded
ClearEdit(): void;

// Loads a new list to replace the older one, in once ! By default (can be redefined) checks the length of the list and the value of each item according to the def Items are all recorded as Modified
LoadEdited(list: NCollection_HSequence_handle_TCollection_HAsciiString): boolean;

// Sets a new value for the item <num> (in edited list) <val> may be a Null Handle, then the value will be cleared but not removed Returns True when done
SetValue(num: number, val: TCollection_HAsciiString): boolean;

// Adds a new item
AddValue(val: TCollection_HAsciiString, atnum?: number): boolean;

// Removes items from the list By default removes one item
Remove(num?: number, howmany?: number): boolean;

// Returns the value from which the edition started
OriginalValues(): NCollection_HSequence_handle_TCollection_HAsciiString;

// Returns the result of the edition
EditedValues(): NCollection_HSequence_handle_TCollection_HAsciiString;

// Returns count of values, edited (D) or original
NbValues(edited?: boolean): number;

// Returns a value given its rank
Value(num: number, edited?: boolean): TCollection_HAsciiString;

// Tells if a value (in edited list) has been changed, i.e
IsChanged(num: number): boolean;

// Tells if a value (in edited list) has been modified-value (not added)
IsModified(num: number): boolean;

// Tells if a value (in edited list) has been added (new one)
IsAdded(num: number): boolean;

// Tells if at least one edition (SetValue-AddValue-Remove) has been recorded
IsTouched(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class performs the Copy operations involved by the description of a ShareOut (evaluated by a ShareOutResult) plus, if there are, the Modifications on the results, with the help of Modifiers
IFSelect_ModelCopier: declare class IFSelect_ModelCopier extends Standard_Transient

constructor

// Sets the ShareOut, which is used to define Modifiers to apply
SetShareOut(sho: IFSelect_ShareOut): void;

// Clears the list of produced Models
ClearResult(): void;

// Records a new File to be sent, as a couple (Name as AsciiString, Content as InterfaceModel) Returns True if Done, False if <filename> is already attached to another File
AddFile(filename: TCollection_AsciiString, content: Interface_InterfaceModel): boolean;

// Changes the Name attached to a File which was formerly defined by a call to AddFile Returns True if Done, False else
NameFile(num: number, filename: TCollection_AsciiString): boolean;

// Clears the Name attached to a File which was formerly defined by a call to AddFile
ClearFile(num: number): boolean;

// Sets a list of File Modifiers to be applied on a file
SetAppliedModifiers(num: number, applied: IFSelect_AppliedModifiers): boolean;

// Clears the list of File Modifiers to be applied on a file
ClearAppliedModifiers(num: number): boolean;

// Returns the count of Files produced, i.e
NbFiles(): number;

// Returns the File Name for a file given its rank It is empty after a call to ClearFile on same <num>
FileName(num: number): TCollection_AsciiString;

// Returns the content of a file before sending, under the form of an InterfaceModel, given its rank
FileModel(num: number): Interface_InterfaceModel;

// Returns the list of File Modifiers to be applied on a file when it will be sent, as computed by CopiedModel
AppliedModifiers(num: number): IFSelect_AppliedModifiers;

// Begins a sequence of recording the really sent files <sho>
BeginSentFiles(sho: IFSelect_ShareOut, record: boolean): void;

// Adds the name of a just sent file, if BeginSentFiles has commanded recording
AddSentFile(filename: string): void;

// Returns the list of recorded names of sent files
SentFiles(): NCollection_HSequence_handle_TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This modifier applies an EditForm on the entities selected
IFSelect_ModifEditForm: declare class IFSelect_ModifEditForm extends IFSelect_Modifier

// Returns Label as "Apply EditForm <+ label of EditForm>"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This modifier reorders a whole model from its roots, i.e
IFSelect_ModifReorder: declare class IFSelect_ModifReorder extends IFSelect_Modifier

constructor

// Returns Label as "Reorder, Roots (last or first)"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives a frame for Actions which can work globally on a File once completely defined (i.e
IFSelect_Modifier: declare class IFSelect_Modifier extends IFSelect_GeneralModifier

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives a simple way to return then consult a list of packets, determined from the content of a Model, by various criteria
IFSelect_PacketList: declare class IFSelect_PacketList extends Standard_Transient

constructor

// Sets a name to a packet list
SetName(name: string): void;

// Returns the recorded name for a packet list
Name(): string;

// Returns the Model of reference
Model(): Interface_InterfaceModel;

// Declares a new Packet, ready to be filled The entities to be added will be added to this Packet
AddPacket(): void;

// Adds an entity from the Model into the current packet for Add
Add(ent: Standard_Transient): void;

// Adds an list of entities into the current packet for Add
AddList(list: NCollection_HSequence_handle_Standard_Transient): void;

// Returns the count of non-empty packets
NbPackets(): number;

// Returns the count of entities in a Packet given its rank, or 0
NbEntities(numpack: number): number;

// Returns the highest number of packets which know a same entity For no duplication, should be one
HighestDuplicationCount(): number;

// Returns the count of entities duplicated
NbDuplicated(count: number, andmore: boolean): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A ParamEditor gives access for edition to a list of TypedValue (i.e
IFSelect_ParamEditor: declare class IFSelect_ParamEditor extends IFSelect_Editor

constructor

// Adds a TypedValue By default, its short name equates its complete name, it can be made explicit
AddValue(val: Interface_TypedValue, shortname?: string): void;

// Adds a Constant Text, it will be Read Only By default, its long name equates its shortname
AddConstantText(val: string, shortname: string, completename?: string): void;

// Returns the specific label
Label(): TCollection_AsciiString;

// Returns a ParamEditor to work on the Static Parameters of which names are listed in Handle if null or empty
static StaticEditor(list: NCollection_HSequence_handle_TCollection_HAsciiString, label?: string): IFSelect_ParamEditor;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Lets you choose the manner in which you want to analyze an IGES or STEP file
IFSelect_PrintCount: typeof IFSelect_PrintCount[keyof typeof IFSelect_PrintCount]

// Indicates whether there will be information on warnings as well as on failures
IFSelect_PrintFail: typeof IFSelect_PrintFail[keyof typeof IFSelect_PrintFail]

IFSelect_RemainMode: typeof IFSelect_RemainMode[keyof typeof IFSelect_RemainMode]

// Qualifies an execution status
IFSelect_ReturnStatus: typeof IFSelect_ReturnStatus[keyof typeof IFSelect_ReturnStatus]

// A SelectAnyList kind Selection selects a List of an Entity, as well as this Entity contains some
IFSelect_SelectAnyList: declare class IFSelect_SelectAnyList extends IFSelect_SelectDeduct

// Returns count of Items in the list in the Entity <ent> If <ent> has not required type, returned value must be Zero
NbItems(ent: Standard_Transient): number;

// Returns True if a Lower limit is defined
HasLower(): boolean;

// Returns Integer Value of Lower Limit (0 if none)
LowerValue(): number;

// Returns True if a Lower limit is defined
HasUpper(): boolean;

// Returns Integer Value of Upper Limit (0 if none)
UpperValue(): number;

// Returns a text defining the criterium
Label(): TCollection_AsciiString;

// Returns the specific label for the list, which is included as a part of Label
ListLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectAnyType sorts the Entities of which the Type is Kind of a given Type
IFSelect_SelectAnyType: declare class IFSelect_SelectAnyType extends IFSelect_SelectExtract

// Returns the Type which has to be matched for select
TypeForMatch(): Standard_Type;

// Returns True for an Entity (model->Value(num)) which is kind of the chosen type, given by the method TypeForMatch
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// SelectBase works directly from an InterfaceModel
IFSelect_SelectBase: declare class IFSelect_SelectBase extends IFSelect_Selection

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectCombine type Selection defines algebraic operations between results of several Selections It is a deferred class
IFSelect_SelectCombine: declare class IFSelect_SelectCombine extends IFSelect_Selection

// Returns the count of Input Selections
NbInputs(): number;

// Returns an Input Selection, given its rank in the list
Input(num: number): IFSelect_Selection;

// Returns the rank of an input Selection, 0 if not in the list
InputRank(sel: IFSelect_Selection): number;

// Adds a Selection to the filling list By default, adds it to the end of the list A Positive rank less then NbInputs gives an insertion rank (InsertBefore
Add(sel: IFSelect_Selection, atnum?: number): void;

// Removes an input Selection
Remove(sel: IFSelect_Selection): boolean;
Remove(num: number): boolean;
Remove(sel: IFSelect_Selection): boolean;
Remove(num: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectControl kind Selection works with two input Selections in a dissymmetric way
IFSelect_SelectControl: declare class IFSelect_SelectControl extends IFSelect_Selection

// Returns the Main Input Selection
MainInput(): IFSelect_Selection;

// Returns True if a Control Input is defined Thus, Result can be computed differently if there is a Control Input or if there is none
HasSecondInput(): boolean;

// Returns the Control Input Selection, or a Null Handle
SecondInput(): IFSelect_Selection;

// Sets a Selection to be the Main Input
SetMainInput(sel: IFSelect_Selection): void;

// Sets a Selection to be the Control Input
SetSecondInput(sel: IFSelect_Selection): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectDeduct determines a list of Entities from an Input Selection, by a computation
IFSelect_SelectDeduct: declare class IFSelect_SelectDeduct extends IFSelect_Selection

// Defines or Changes the Input Selection
SetInput(sel: IFSelect_Selection): void;

// Returns the Input Selection
Input(): IFSelect_Selection;

// Returns True if the Input Selection is defined, False else
HasInput(): boolean;

// Tells if an Alternate List has been set, i.e
HasAlternate(): boolean;

// Returns the Alternate Definition It is returned modifiable, hence an already defined SelectPointed can be used But if it was not yet defined, it is created the first time
Alternate(): IFSelect_SelectPointed;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectDiff keeps the entities from a Selection, the Main Input, which are not listed by the Second Input
IFSelect_SelectDiff: declare class IFSelect_SelectDiff extends IFSelect_SelectControl

constructor

// Returns a text defining the criterium
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectEntityNumber gets in an InterfaceModel (through a Graph), the Entity which has a specified Number (its rank of adding into the Model)
IFSelect_SelectEntityNumber: declare class IFSelect_SelectEntityNumber extends IFSelect_SelectBase

constructor

// Returns a text defining the criterium
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectErrorEntities sorts the Entities which are qualified as "Error" (their Type has not been recognized) during reading a File
IFSelect_SelectErrorEntities: declare class IFSelect_SelectErrorEntities extends IFSelect_SelectExtract

constructor

// Returns True for an Entity which is qualified as "Error", i.e
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns a text defining the criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectExplore determines from an input list of Entities, a list obtained by a way of exploration
IFSelect_SelectExplore: declare class IFSelect_SelectExplore extends IFSelect_SelectDeduct

// Returns the required exploring level
Level(): number;

// Returns a text saying "(Recursive)" or "(Level nn)" plus specific criterium returned by ExploreLabel (see below)
Label(): TCollection_AsciiString;

// Returns a text defining the way of exploration
ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectExtract determines a list of Entities from an Input Selection, as a sub-list of the Input Result It works by applying a sort criterium on each Entity of the Input
IFSelect_SelectExtract: declare class IFSelect_SelectExtract extends IFSelect_SelectDeduct

// Returns True if Sort criterium is Direct, False if Reverse
IsDirect(): boolean;

// Sets Sort criterium sense to a new value (True
SetDirect(direct: boolean): void;

// Returns True for an Entity if it satisfies the Sort criterium It receives
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns a text saying "Picked" or "Removed", plus the specific criterium returned by ExtractLabel (see below)
Label(): TCollection_AsciiString;

// Returns a text defining the criterium for extraction
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectFlag queries a flag noted in the bitmap of the Graph
IFSelect_SelectFlag: declare class IFSelect_SelectFlag extends IFSelect_SelectExtract

constructor

// Returns the name of the flag
FlagName(): string;

// Returns always False because RootResult has done the work
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns a text defining the criterium, includes the flag name
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectInList kind Selection selects a List of an Entity, which is composed of single Entities To know the list on which to work, SelectInList has two deferred methods
IFSelect_SelectInList: declare class IFSelect_SelectInList extends IFSelect_SelectAnyList

// Returns an Entity, given its rank in the list
ListedEntity(num: number, ent: Standard_Transient): Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectIncorrectEntities sorts the Entities which have been noted as Incorrect in the Graph of the Session (flag "Incorrect") It can find a result only if ComputeCheck has formerly been called on the WorkSession
IFSelect_SelectIncorrectEntities: declare class IFSelect_SelectIncorrectEntities extends IFSelect_SelectFlag

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectIntersection filters the Entities issued from several other Selections as Intersection of results
IFSelect_SelectIntersection: declare class IFSelect_SelectIntersection extends IFSelect_SelectCombine

constructor

// Returns a text defining the criterium
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectModelEntities gets all the Entities of an InterfaceModel
IFSelect_SelectModelEntities: declare class IFSelect_SelectModelEntities extends IFSelect_SelectBase

constructor

// Returns a text defining the criterium
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectModelRoots gets all the Root Entities of an InterfaceModel
IFSelect_SelectModelRoots: declare class IFSelect_SelectModelRoots extends IFSelect_SelectBase

constructor

// Returns a text defining the criterium
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
