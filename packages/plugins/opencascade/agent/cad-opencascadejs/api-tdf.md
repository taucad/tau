# libcascade — TDF

21 top-level symbols. Signatures are verbatim typescript.

// This package provides data framework for binding features and data structures
TDF: declare class TDF

constructor

// Returns ID "00000000-0000-0000-0000-000000000000", sometimes used as null ID
static LowestID(): Standard_GUID;

// Returns ID "ffffffff-ffff-ffff-ffff-ffffffffffff"
static UppestID(): Standard_GUID;

// Sets link between GUID and ProgID in hidden DataMap
static AddLinkGUIDToProgID(ID: Standard_GUID, ProgID: TCollection_ExtendedString): void;

// Returns True if there is GUID for given <ProgID> then GUID is returned in <ID>
static GUIDFromProgID(ProgID: TCollection_ExtendedString, ID: Standard_GUID): boolean;
// ID: Mutated in place

// Returns True if there is ProgID for given <ID> then ProgID is returned in <ProgID>
static ProgIDFromGUID(ID: Standard_GUID, ProgID: TCollection_ExtendedString): boolean;
// ProgID: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A class each application has to implement
TDF_Attribute: declare class TDF_Attribute extends Standard_Transient

// Returns the ID of the attribute
ID(): Standard_GUID;

// Sets specific ID of the attribute (supports several attributes of one type at the same label feature)
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Returns the label to which the attribute is attached
Label(): TDF_Label;

// Returns the transaction index in which the attribute has been created or modified
Transaction(): number;

// Returns the upper transaction index until which the attribute is/was valid
UntilTransaction(): number;

// Returns true if the attribute is valid
IsValid(): boolean;

// Returns true if the attribute has no backup
IsNew(): boolean;

// Returns true if the attribute forgotten status is set
IsForgotten(): boolean;

// Returns true if it exists an associated attribute of <me> with <anID> as ID
IsAttribute(anID: Standard_GUID): boolean;

// Finds an associated attribute of <me>, according to <anID>
FindAttribute(anID: Standard_GUID): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };

// Adds an Attribute <other> to the label of <me>
AddAttribute(other: TDF_Attribute): void;

// Forgets the Attribute of GUID <aguid> associated to the label of <me>
ForgetAttribute(aguid: Standard_GUID): boolean;

// Forgets all the attributes attached to the label of <me>
ForgetAllAttributes(clearChildren?: boolean): void;

// Something to do after adding an Attribute to a label
AfterAddition(): void;

// Something to do before removing an Attribute from a label
BeforeRemoval(): void;

// Something to do before forgetting an Attribute to a label
BeforeForget(): void;

// Something to do after resuming an Attribute from a label
AfterResume(): void;

// Something to do AFTER creation of an attribute by persistent-transient translation
AfterRetrieval(forceIt?: boolean): boolean;

// Something to do before applying <anAttDelta>
BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

// Something to do after applying <anAttDelta>
AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

// A callback
BeforeCommitTransaction(): void;

// Backups the attribute
Backup(): void;

// Returns true if the attribute backup status is set
IsBackuped(): boolean;

// Copies the attribute contents into a new other attribute
BackupCopy(): TDF_Attribute;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Makes an AttributeDelta because <me> appeared
DeltaOnAddition(): TDF_DeltaOnAddition;

// Makes an AttributeDelta because <me> has been forgotten
DeltaOnForget(): TDF_DeltaOnForget;

// Makes an AttributeDelta because <me> has been resumed
DeltaOnResume(): TDF_DeltaOnResume;

// Makes a DeltaOnModification between <me> and
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

// Makes a DeltaOnRemoval on <me> because <me> has disappeared from the DS
DeltaOnRemoval(): TDF_DeltaOnRemoval;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Adds the first level referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

// Forgets the attribute
Forget(aTransaction: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes the services we need to implement Delta and Undo/Redo services
TDF_AttributeDelta: declare class TDF_AttributeDelta extends Standard_Transient

// Applies the delta to the attribute
Apply(): void;

// Returns the label concerned by <me>
Label(): TDF_Label;

// Returns the reference attribute
Attribute(): TDF_Attribute;

// Returns the ID of the attribute concerned by <me>
ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TDF_AttributeIterator: declare class TDF_AttributeIterator

constructor

Initialize(aLabel: TDF_Label, withoutForgotten?: boolean): void;

More(): boolean;

Next(): void;

Value(): TDF_Attribute;

// Provides an access to the internal pointer of the current attribute
PtrValue(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterates on the children of a label, to find attributes having ID as Attribute ID
TDF_ChildIDIterator: declare class TDF_ChildIDIterator

constructor

// Initializes the iteration on the children of the given label
Initialize(aLabel: TDF_Label, anID: Standard_GUID, allLevels?: boolean): void;

// Returns True if there is a current Item in the iteration
More(): boolean;

// Move to the next Item
Next(): void;

// Move to the next Brother
NextBrother(): void;

// Returns the current item
Value(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterates on the children of a label, at the first level only
TDF_ChildIterator: declare class TDF_ChildIterator

constructor

// Initializes the iteration on the children of the given label
Initialize(aLabel: TDF_Label, allLevels?: boolean): void;

// Returns true if a current label is found in the iteration process
More(): boolean;

// Move the current iteration to the next Item
Next(): void;

// Moves this iteration to the next brother label
NextBrother(): void;

// Returns the current label
Value(): TDF_Label;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides options closure management
TDF_ClosureMode: declare class TDF_ClosureMode

constructor

// Sets the mode "Descendants" to <aStatus>
Descendants(aStatus: boolean): void;
Descendants(): boolean;
Descendants(aStatus: boolean): void;
Descendants(): boolean;

// Sets the mode "References" to <aStatus>
References(aStatus: boolean): void;
References(): boolean;
References(aStatus: boolean): void;
References(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides services to build the closure of an information set
TDF_ClosureTool: declare class TDF_ClosureTool

constructor

// Builds the transitive closure of label and attribute sets into <aDataSet>
static Closure(aDataSet: TDF_DataSet): void;
static Closure(aDataSet: TDF_DataSet, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
static Closure(aLabel: TDF_Label, aLabMap: NCollection_Map_TDF_Label, anAttMap: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
static Closure(aDataSet: TDF_DataSet): void;
static Closure(aDataSet: TDF_DataSet, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
static Closure(aLabel: TDF_Label, aLabMap: NCollection_Map_TDF_Label, anAttMap: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
static Closure(aDataSet: TDF_DataSet): void;
static Closure(aDataSet: TDF_DataSet, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
static Closure(aLabel: TDF_Label, aLabMap: NCollection_Map_TDF_Label, anAttMap: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides services to compare sets of information
TDF_ComparisonTool: declare class TDF_ComparisonTool

constructor

// Compares <aSourceDataSet> with <aTargetDataSet>, updating <aRelocationTable> with labels and attributes found in both sets
static Compare(aSourceDataSet: TDF_DataSet, aTargetDataSet: TDF_DataSet, aFilter: TDF_IDFilter, aRelocationTable: TDF_RelocationTable): void;

// Finds from <aRefDataSet> all the keys not bound into <aRelocationTable> and put them into <aDiffDataSet>
static SourceUnbound(aRefDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aFilter: TDF_IDFilter, aDiffDataSet: TDF_DataSet, anOption?: number): boolean;

// Subtracts from <aRefDataSet> all the items bound into <aRelocationTable>
static TargetUnbound(aRefDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aFilter: TDF_IDFilter, aDiffDataSet: TDF_DataSet, anOption?: number): boolean;

// Removes attributes from <aDataSet>
static Cut(aDataSet: TDF_DataSet): void;

// Returns true if all the labels of <aDataSet> are descendant of <aLabel>
static IsSelfContained(aLabel: TDF_Label, aDataSet: TDF_DataSet): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives copy of source label hierarchy
TDF_CopyLabel: declare class TDF_CopyLabel

constructor

// Loads src and tgt labels
Load(aSource: TDF_Label, aTarget: TDF_Label): void;

// Sets filter
UseFilter(aFilter: TDF_IDFilter): void;

// Check external references and if exist fills the aExternals Map
static ExternalReferences(Lab: TDF_Label, aExternals: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter): boolean;
static ExternalReferences(aRefLab: TDF_Label, Lab: TDF_Label, aExternals: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter): { aDataSet: TDF_DataSet; [Symbol.dispose](): void };
static ExternalReferences(Lab: TDF_Label, aExternals: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter): boolean;
static ExternalReferences(aRefLab: TDF_Label, Lab: TDF_Label, aExternals: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter): { aDataSet: TDF_DataSet; [Symbol.dispose](): void };
// aExternals: Mutated in place

// performs algorithm of selfcontained copy
Perform(): void;

IsDone(): boolean;

// returns relocation table
RelocationTable(): TDF_RelocationTable;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides services to build, copy or paste a set of information
TDF_CopyTool: declare class TDF_CopyTool

constructor

// Copy <aSourceDataSet> with using and updating <aRelocationTable>
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter, aRefFilter: TDF_IDFilter, setSelfContained: boolean): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter, aRefFilter: TDF_IDFilter, setSelfContained: boolean): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter, aRefFilter: TDF_IDFilter, setSelfContained: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is used to manipulate a complete independent, self sufficient data structure and its services
TDF_Data: declare class TDF_Data extends Standard_Transient

constructor

// Returns the root label of the Data structure
Root(): TDF_Label;

// Returns the current transaction number
Transaction(): number;

// Returns the current tick
Time(): number;

// Returns true if <aDelta> is applicable HERE and NOW
IsApplicable(aDelta: TDF_Delta): boolean;

// Apply <aDelta> to undo a set of attribute modifications
Undo(aDelta: TDF_Delta, withDelta?: boolean): TDF_Delta;

Destroy(): void;

// Returns the undo mode status
NotUndoMode(): boolean;

// Sets modification mode
AllowModification(isAllowed: boolean): void;

// returns modification mode
IsModificationAllowed(): boolean;

// Initializes a mechanism for fast access to the labels by their entries
SetAccessByEntries(aSet: boolean): void;

// Returns a status of mechanism for fast access to the labels via entries
IsAccessByEntries(): boolean;

// Returns a label by an entry
GetLabel(anEntry: TCollection_AsciiString, aLabel: TDF_Label): boolean;
// aLabel: Mutated in place

// An internal method
RegisterLabel(aLabel: TDF_Label): void;

// Returns TDF_HAllocator, which is an incremental allocator used by `TDF_LabelNode`
LabelNodeAllocator(): unknown;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is a set of {@link TDF`TDF`} information like labels and attributes
TDF_DataSet: declare class TDF_DataSet extends Standard_Transient

constructor

// Clears all information
Clear(): void;

// Returns true if there is at least one label or one attribute
IsEmpty(): boolean;

// Adds <aLabel> in the current data set
AddLabel(aLabel: TDF_Label): void;

// Returns true if the label <alabel> is in the data set
ContainsLabel(aLabel: TDF_Label): boolean;

// Returns the map of labels in this data set
Labels(): NCollection_Map_TDF_Label;

// Adds <anAttribute> into the current data set
AddAttribute(anAttribute: TDF_Attribute): void;

// Returns true if <anAttribute> is in the data set
ContainsAttribute(anAttribute: TDF_Attribute): boolean;

// Returns the map of attributes in the current data set
Attributes(): NCollection_Map_handle_TDF_Attribute;

// Adds a root label to <myRootLabels>
AddRoot(aLabel: TDF_Label): void;

// Returns <myRootLabels> to be used or updated
Roots(): NCollection_List_TDF_Label;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a default implementation of a {@link TDF_DeltaOnModification`TDF_DeltaOnModification`}
TDF_DefaultDeltaOnModification: declare class TDF_DefaultDeltaOnModification extends TDF_DeltaOnModification

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a default implementation of a {@link TDF_DeltaOnRemoval`TDF_DeltaOnRemoval`}
TDF_DefaultDeltaOnRemoval: declare class TDF_DefaultDeltaOnRemoval extends TDF_DeltaOnRemoval

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A set of AttributeDelta for a given transaction number and reference time number
TDF_Delta: declare class TDF_Delta extends Standard_Transient

constructor

// Returns true if there is nothing to undo
IsEmpty(): boolean;

// Returns true if the Undo action of <me> is applicable at <aCurrentTime>
IsApplicable(aCurrentTime: number): boolean;

// Returns the field <myBeginTime>
BeginTime(): number;

// Returns the field <myEndTime>
EndTime(): number;

// Adds in <aLabelList> the labels of the attribute deltas
Labels(aLabelList: NCollection_List_TDF_Label): void;
// aLabelList: Mutated in place

// Returns the field <myAttDeltaList>
AttributeDeltas(): NCollection_List_handle_TDF_AttributeDelta;

// Returns a name associated with this delta
Name(): TCollection_ExtendedString;

// Associates a name <theName> with this delta
SetName(theName: TCollection_ExtendedString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides default services for an AttributeDelta on an ADDITION action
TDF_DeltaOnAddition: declare class TDF_DeltaOnAddition extends TDF_AttributeDelta

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides default services for an AttributeDelta on an Forget action
TDF_DeltaOnForget: declare class TDF_DeltaOnForget extends TDF_AttributeDelta

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides default services for an AttributeDelta on a MODIFICATION action
TDF_DeltaOnModification: declare class TDF_DeltaOnModification extends TDF_AttributeDelta

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides default services for an AttributeDelta on a REMOVAL action
TDF_DeltaOnRemoval: declare class TDF_DeltaOnRemoval extends TDF_AttributeDelta

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides default services for an AttributeDelta on an Resume action
TDF_DeltaOnResume: declare class TDF_DeltaOnResume extends TDF_AttributeDelta

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
