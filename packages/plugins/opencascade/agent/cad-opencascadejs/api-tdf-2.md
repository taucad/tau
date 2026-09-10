# libcascade — TDF (2)

14 top-level symbols. Signatures are verbatim typescript.

// This class offers filtering services around an ID list
TDF_IDFilter: declare class TDF_IDFilter

constructor

// The list of ID is cleared and the filter mode is set to ignore mode if <keep> is true
IgnoreAll(ignore: boolean): void;
IgnoreAll(): boolean;
IgnoreAll(ignore: boolean): void;
IgnoreAll(): boolean;

// An attribute with <anID> as ID is to be kept and the filter will answer true to the question IsKept(<anID>)
Keep(anID: Standard_GUID): void;
Keep(anIDList: NCollection_List_Standard_GUID): void;
Keep(anID: Standard_GUID): void;
Keep(anIDList: NCollection_List_Standard_GUID): void;

// An attribute with <anID> as ID is to be ignored and the filter will answer false to the question IsKept(<anID>)
Ignore(anID: Standard_GUID): void;
Ignore(anIDList: NCollection_List_Standard_GUID): void;
Ignore(anID: Standard_GUID): void;
Ignore(anIDList: NCollection_List_Standard_GUID): void;

// Returns true if the ID is to be kept
IsKept(anID: Standard_GUID): boolean;
IsKept(anAtt: TDF_Attribute): boolean;
IsKept(anID: Standard_GUID): boolean;
IsKept(anAtt: TDF_Attribute): boolean;

// Returns true if the ID is to be ignored
IsIgnored(anID: Standard_GUID): boolean;
IsIgnored(anAtt: TDF_Attribute): boolean;
IsIgnored(anID: Standard_GUID): boolean;
IsIgnored(anAtt: TDF_Attribute): boolean;

// Copies the list of ID to be kept or ignored in <anIDList>
IDList(anIDList: NCollection_List_Standard_GUID): void;
// anIDList: Mutated in place

// Copies into <me> the contents of <fromFilter>
Copy(fromFilter: TDF_IDFilter): void;

// Assignment
Assign(theFilter: TDF_IDFilter): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides basic operations to define a label in a data structure
TDF_Label: declare class TDF_Label

constructor

// Nullifies the label
Nullify(): void;

// Returns the Data owning <me>
Data(): TDF_Data;

// Returns the tag of the label
Tag(): number;

// Returns the label father
Father(): TDF_Label;

// Returns True if the <aLabel> is null, i.e
IsNull(): boolean;

// Sets or unsets <me> and all its descendants as imported label, according to <aStatus>
Imported(aStatus: boolean): void;

// Returns True if the <aLabel> is imported
IsImported(): boolean;

// Returns True if the <aLabel> is equal to me (same LabelNode\*)
IsEqual(aLabel: TDF_Label): boolean;

IsDifferent(aLabel: TDF_Label): boolean;

IsRoot(): boolean;

// Returns true if <me> owns an attribute with <anID> as ID
IsAttribute(anID: Standard_GUID): boolean;

// Adds an Attribute to the current label
AddAttribute(anAttribute: TDF_Attribute, append?: boolean): void;

// Forgets an Attribute from the current label, setting its forgotten status true and its valid status false
ForgetAttribute(anAttribute: TDF_Attribute): void;
ForgetAttribute(aguid: Standard_GUID): boolean;
ForgetAttribute(anAttribute: TDF_Attribute): void;
ForgetAttribute(aguid: Standard_GUID): boolean;

// Forgets all the attributes
ForgetAllAttributes(clearChildren?: boolean): void;

// Undo Forget action, setting its forgotten status false and its valid status true
ResumeAttribute(anAttribute: TDF_Attribute): void;

// Finds an attribute of the current label, according to <anID>
FindAttribute(anID: Standard_GUID): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };
FindAttribute(anID: Standard_GUID, aTransaction: number): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };
FindAttribute(anID: Standard_GUID): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };
FindAttribute(anID: Standard_GUID, aTransaction: number): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };

// Returns true if <me> or a DESCENDANT of <me> owns attributes not yet available in transaction 0
MayBeModified(): boolean;

// Returns true if <me> owns attributes not yet available in transaction 0
AttributesModified(): boolean;

// Returns true if this label has at least one attribute
HasAttribute(): boolean;

// Returns the number of attributes
NbAttributes(): number;

// Returns the depth of the label in the data framework
Depth(): number;

// Returns True if <me> is a descendant of <aLabel>
IsDescendant(aLabel: TDF_Label): boolean;

// Returns the root label Root of the data structure
Root(): TDF_Label;

// Returns true if this label has at least one child
HasChild(): boolean;

// Returns the number of children
NbChildren(): number;

// Finds a child label having <aTag> as tag
FindChild(aTag: number, create?: boolean): TDF_Label;

// Create a new child label of me using automatic delivery tags provided by TagSource
NewChild(): TDF_Label;

// Returns the current transaction index
Transaction(): number;

// Returns true if node address of <me> is lower than <otherLabel> one
HasLowerNode(otherLabel: TDF_Label): boolean;

// Returns true if node address of <me> is greater than <otherLabel> one
HasGreaterNode(otherLabel: TDF_Label): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This attribute is used to store in the framework a reference to an other label
TDF_Reference: declare class TDF_Reference extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(I: TDF_Label, Origin: TDF_Label): TDF_Reference;
Set(Origin: TDF_Label): void;

Get(): TDF_Label;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Adds the first level referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This is a relocation dictionary between source and target labels, attributes or any transient(useful for copy or paste actions)
TDF_RelocationTable: declare class TDF_RelocationTable extends Standard_Transient

constructor

// Sets <mySelfRelocate> to <selfRelocate>
SelfRelocate(selfRelocate: boolean): void;
SelfRelocate(): boolean;
SelfRelocate(selfRelocate: boolean): void;
SelfRelocate(): boolean;

// Returns <myAfterRelocate>
AfterRelocate(afterRelocate: boolean): void;
AfterRelocate(): boolean;
AfterRelocate(afterRelocate: boolean): void;
AfterRelocate(): boolean;

// Sets the relocation value of <aSourceLabel> to <aTargetLabel>
SetRelocation(aSourceLabel: TDF_Label, aTargetLabel: TDF_Label): void;
SetRelocation(aSourceAttribute: TDF_Attribute, aTargetAttribute: TDF_Attribute): void;
SetRelocation(aSourceLabel: TDF_Label, aTargetLabel: TDF_Label): void;
SetRelocation(aSourceAttribute: TDF_Attribute, aTargetAttribute: TDF_Attribute): void;

// Finds the relocation value of <aSourceLabel> and returns it into <aTargetLabel>
HasRelocation(aSourceLabel: TDF_Label, aTargetLabel: TDF_Label): boolean;
HasRelocation(aSourceAttribute: TDF_Attribute): { returnValue: boolean; aTargetAttribute: TDF_Attribute; [Symbol.dispose](): void };
HasRelocation(aSourceLabel: TDF_Label, aTargetLabel: TDF_Label): boolean;
HasRelocation(aSourceAttribute: TDF_Attribute): { returnValue: boolean; aTargetAttribute: TDF_Attribute; [Symbol.dispose](): void };
// aTargetLabel: Mutated in place

// Sets the relocation value of <aSourceTransient> to <aTargetTransient>
SetTransientRelocation(aSourceTransient: Standard_Transient, aTargetTransient: Standard_Transient): void;

// Finds the relocation value of <aSourceTransient> and returns it into <aTargetTransient>
HasTransientRelocation(aSourceTransient: Standard_Transient): { returnValue: boolean; aTargetTransient: Standard_Transient; [Symbol.dispose](): void };

// Clears the relocation dictionary, but lets the self relocation flag to its current value
Clear(): void;

// Fills <aLabelMap> with target relocation labels
TargetLabelMap(aLabelMap: NCollection_Map_TDF_Label): void;
// aLabelMap: Mutated in place

// Fills <anAttributeMap> with target relocation attributes
TargetAttributeMap(anAttributeMap: NCollection_Map_handle_TDF_Attribute): void;
// anAttributeMap: Mutated in place

// Returns <myLabelTable> to be used or updated
LabelTable(): NCollection_DataMap_TDF_Label_TDF_Label;

// Returns <myAttributeTable> to be used or updated
AttributeTable(): NCollection_DataMap_handle_TDF_Attribute_handle_TDF_Attribute;

// Returns <myTransientTable> to be used or updated
TransientTable(): NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This attribute manage a tag provider to create child labels of a given one
TDF_TagSource: declare class TDF_TagSource extends TDF_Attribute

constructor

// **class methods**
static GetID(): Standard_GUID;

// Find, or create, a TagSource attribute
static Set(label: TDF_Label): TDF_TagSource;
Set(T: number): void;

// Find (or create) a tagSource attribute located at <L> and make a new child label
static NewChild(L: TDF_Label): TDF_Label;
NewChild(): TDF_Label;

NewTag(): number;

Get(): number;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides general services for a data framework
TDF_Tool: declare class TDF_Tool

constructor

// Returns the number of labels of the tree, including <aLabel>
static NbLabels(aLabel: TDF_Label): number;

// Returns the total number of attributes attached to the labels dependent on the label aLabel
static NbAttributes(aLabel: TDF_Label): number;
static NbAttributes(aLabel: TDF_Label, aFilter: TDF_IDFilter): number;
static NbAttributes(aLabel: TDF_Label): number;
static NbAttributes(aLabel: TDF_Label, aFilter: TDF_IDFilter): number;

// Returns true if <aLabel> and its descendants reference only attributes or labels attached to themselves
static IsSelfContained(aLabel: TDF_Label): boolean;
static IsSelfContained(aLabel: TDF_Label, aFilter: TDF_IDFilter): boolean;
static IsSelfContained(aLabel: TDF_Label): boolean;
static IsSelfContained(aLabel: TDF_Label, aFilter: TDF_IDFilter): boolean;

// Returns in <theAtts> the attributes having out references
static OutReferers(theLabel: TDF_Label, theAtts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferers(aLabel: TDF_Label, aFilterForReferers: TDF_IDFilter, aFilterForReferences: TDF_IDFilter, atts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferers(theLabel: TDF_Label, theAtts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferers(aLabel: TDF_Label, aFilterForReferers: TDF_IDFilter, aFilterForReferences: TDF_IDFilter, atts: NCollection_Map_handle_TDF_Attribute): void;
// theAtts: Mutated in place

// Returns in <atts> the referenced attributes
static OutReferences(aLabel: TDF_Label, atts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferences(aLabel: TDF_Label, aFilterForReferers: TDF_IDFilter, aFilterForReferences: TDF_IDFilter, atts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferences(aLabel: TDF_Label, atts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferences(aLabel: TDF_Label, aFilterForReferers: TDF_IDFilter, aFilterForReferences: TDF_IDFilter, atts: NCollection_Map_handle_TDF_Attribute): void;
// atts: Mutated in place

// Returns the label having the same sub-entry as <aLabel> but located as descendant as <toRoot> instead of <fromRoot>
static RelocateLabel(aSourceLabel: TDF_Label, fromRoot: TDF_Label, toRoot: TDF_Label, aTargetLabel: TDF_Label, create: boolean): void;
// aTargetLabel: Mutated in place

// Returns the entry for the label aLabel in the form of the ASCII character string anEntry containing the tag list for aLabel
static Entry(aLabel: TDF_Label, anEntry: TCollection_AsciiString): void;
// anEntry: Mutated in place

// Returns the entry of <aLabel> as list of integers in <aTagList>
static TagList(aLabel: TDF_Label, aTagList: NCollection_List_int): void;
static TagList(anEntry: TCollection_AsciiString, aTagList: NCollection_List_int): void;
static TagList(aLabel: TDF_Label, aTagList: NCollection_List_int): void;
static TagList(anEntry: TCollection_AsciiString, aTagList: NCollection_List_int): void;
// aTagList: Mutated in place

// Returns the label expressed by <anEntry>
static Label(aDF: TDF_Data, anEntry: TCollection_AsciiString, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, anEntry: string, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, aTagList: NCollection_List_int, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, anEntry: TCollection_AsciiString, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, anEntry: string, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, aTagList: NCollection_List_int, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, anEntry: TCollection_AsciiString, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, anEntry: string, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, aTagList: NCollection_List_int, aLabel: TDF_Label, create: boolean): void;
// aLabel: Mutated in place

// Adds the labels of <aLabelList> to <aLabelMap> if they are unbound, or increases their reference counters
static CountLabels(aLabelList: NCollection_List_TDF_Label, aLabelMap: NCollection_DataMap_TDF_Label_int): void;
// aLabelList: Mutated in place
// aLabelMap: Mutated in place

// Decreases the reference counters of the labels of <aLabelList> to <aLabelMap>, and removes labels with null counter
static DeductLabels(aLabelList: NCollection_List_TDF_Label, aLabelMap: NCollection_DataMap_TDF_Label_int): void;
// aLabelList: Mutated in place
// aLabelMap: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class offers services to open, commit or abort a transaction in a more secure way than using Data from {@link TDF`TDF`}
TDF_Transaction: declare class TDF_Transaction

constructor

// Aborts all the transactions on <myDF> and sets <aDF> to build a transaction context on <aDF>, ready to be opened
Initialize(aDF: TDF_Data): void;

// If not yet done, opens a new transaction on <myDF>
Open(): number;

// Commits the transactions until AND including the current opened one
Commit(withDelta?: boolean): TDF_Delta;

// Aborts the transactions until AND including the current opened one
Abort(): void;

// Returns the Data from {@link TDF`TDF`}
Data(): TDF_Data;

// Returns the number of the transaction opened by <me>
Transaction(): number;

// Returns the transaction name
Name(): TCollection_AsciiString;

// Returns true if the transaction is open
IsOpen(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TDF_AttributeDeltaList: NCollection_List_handle_TDF_AttributeDelta

TDF_AttributeList: NCollection_List_handle_TDF_Attribute

TDF_AttributeSequence: NCollection_Sequence_handle_TDF_Attribute

TDF_DeltaList: NCollection_List_handle_TDF_Delta

TDF_IDList: NCollection_List_Standard_GUID

TDF_LabelList: NCollection_List_TDF_Label

TDF_LabelSequence: NCollection_Sequence_TDF_Label
