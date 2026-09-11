# libcascade — TDF

35 top-level symbols. Signatures are verbatim typescript.

TDF: declare class TDF

constructor

static LowestID(): Standard_GUID;

static UppestID(): Standard_GUID;

static AddLinkGUIDToProgID(ID: Standard_GUID, ProgID: TCollection_ExtendedString): void;

static GUIDFromProgID(ProgID: TCollection_ExtendedString, ID: Standard_GUID): boolean;

static ProgIDFromGUID(ID: Standard_GUID, ProgID: TCollection_ExtendedString): boolean;

delete(): void;

[Symbol.dispose](): void;

TDF_Attribute: declare class TDF_Attribute extends Standard_Transient

ID(): Standard_GUID;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

Label(): TDF_Label;

Transaction(): number;

UntilTransaction(): number;

IsValid(): boolean;

IsNew(): boolean;

IsForgotten(): boolean;

IsAttribute(anID: Standard_GUID): boolean;

FindAttribute(anID: Standard_GUID): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };

AddAttribute(other: TDF_Attribute): void;

ForgetAttribute(aguid: Standard_GUID): boolean;

ForgetAllAttributes(clearChildren?: boolean): void;

AfterAddition(): void;

BeforeRemoval(): void;

BeforeForget(): void;

AfterResume(): void;

AfterRetrieval(forceIt?: boolean): boolean;

BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

BeforeCommitTransaction(): void;

Backup(): void;

IsBackuped(): boolean;

BackupCopy(): TDF_Attribute;

Restore(anAttribute: TDF_Attribute): void;

DeltaOnAddition(): TDF_DeltaOnAddition;

DeltaOnForget(): TDF_DeltaOnForget;

DeltaOnResume(): TDF_DeltaOnResume;

DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

DeltaOnRemoval(): TDF_DeltaOnRemoval;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

References(aDataSet: TDF_DataSet): void;

Forget(aTransaction: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_AttributeDelta: declare class TDF_AttributeDelta extends Standard_Transient

Apply(): void;

Label(): TDF_Label;

Attribute(): TDF_Attribute;

ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_AttributeIterator: declare class TDF_AttributeIterator

constructor

Initialize(aLabel: TDF_Label, withoutForgotten?: boolean): void;

More(): boolean;

Next(): void;

Value(): TDF_Attribute;

PtrValue(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;

TDF_ChildIDIterator: declare class TDF_ChildIDIterator

constructor

Initialize(aLabel: TDF_Label, anID: Standard_GUID, allLevels?: boolean): void;

More(): boolean;

Next(): void;

NextBrother(): void;

Value(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;

TDF_ChildIterator: declare class TDF_ChildIterator

constructor

Initialize(aLabel: TDF_Label, allLevels?: boolean): void;

More(): boolean;

Next(): void;

NextBrother(): void;

Value(): TDF_Label;

delete(): void;

[Symbol.dispose](): void;

TDF_ClosureMode: declare class TDF_ClosureMode

constructor

Descendants(aStatus: boolean): void;
Descendants(): boolean;
Descendants(aStatus: boolean): void;
Descendants(): boolean;

References(aStatus: boolean): void;
References(): boolean;
References(aStatus: boolean): void;
References(): boolean;

delete(): void;

[Symbol.dispose](): void;

TDF_ClosureTool: declare class TDF_ClosureTool

constructor

static Closure(aDataSet: TDF_DataSet): void;
static Closure(aDataSet: TDF_DataSet, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
static Closure(aLabel: TDF_Label, aLabMap: NCollection_Map_TDF_Label, anAttMap: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
static Closure(aDataSet: TDF_DataSet): void;
static Closure(aDataSet: TDF_DataSet, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
static Closure(aLabel: TDF_Label, aLabMap: NCollection_Map_TDF_Label, anAttMap: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
static Closure(aDataSet: TDF_DataSet): void;
static Closure(aDataSet: TDF_DataSet, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
static Closure(aLabel: TDF_Label, aLabMap: NCollection_Map_TDF_Label, anAttMap: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;

delete(): void;

[Symbol.dispose](): void;

TDF_ComparisonTool: declare class TDF_ComparisonTool

constructor

static Compare(aSourceDataSet: TDF_DataSet, aTargetDataSet: TDF_DataSet, aFilter: TDF_IDFilter, aRelocationTable: TDF_RelocationTable): void;

static SourceUnbound(aRefDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aFilter: TDF_IDFilter, aDiffDataSet: TDF_DataSet, anOption?: number): boolean;

static TargetUnbound(aRefDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aFilter: TDF_IDFilter, aDiffDataSet: TDF_DataSet, anOption?: number): boolean;

static Cut(aDataSet: TDF_DataSet): void;

static IsSelfContained(aLabel: TDF_Label, aDataSet: TDF_DataSet): boolean;

delete(): void;

[Symbol.dispose](): void;

TDF_CopyLabel: declare class TDF_CopyLabel

constructor

Load(aSource: TDF_Label, aTarget: TDF_Label): void;

UseFilter(aFilter: TDF_IDFilter): void;

static ExternalReferences(Lab: TDF_Label, aExternals: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter): boolean;
static ExternalReferences(aRefLab: TDF_Label, Lab: TDF_Label, aExternals: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter): { aDataSet: TDF_DataSet; [Symbol.dispose](): void };
static ExternalReferences(Lab: TDF_Label, aExternals: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter): boolean;
static ExternalReferences(aRefLab: TDF_Label, Lab: TDF_Label, aExternals: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter): { aDataSet: TDF_DataSet; [Symbol.dispose](): void };

Perform(): void;

IsDone(): boolean;

RelocationTable(): TDF_RelocationTable;

delete(): void;

[Symbol.dispose](): void;

TDF_CopyTool: declare class TDF_CopyTool

constructor

static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter, aRefFilter: TDF_IDFilter, setSelfContained: boolean): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter, aRefFilter: TDF_IDFilter, setSelfContained: boolean): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter): void;
static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter, aRefFilter: TDF_IDFilter, setSelfContained: boolean): void;

delete(): void;

[Symbol.dispose](): void;

TDF_Data: declare class TDF_Data extends Standard_Transient

constructor

Root(): TDF_Label;

Transaction(): number;

Time(): number;

IsApplicable(aDelta: TDF_Delta): boolean;

Undo(aDelta: TDF_Delta, withDelta?: boolean): TDF_Delta;

Destroy(): void;

NotUndoMode(): boolean;

AllowModification(isAllowed: boolean): void;

IsModificationAllowed(): boolean;

SetAccessByEntries(aSet: boolean): void;

IsAccessByEntries(): boolean;

GetLabel(anEntry: TCollection_AsciiString, aLabel: TDF_Label): boolean;

RegisterLabel(aLabel: TDF_Label): void;

LabelNodeAllocator(): unknown;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_DataSet: declare class TDF_DataSet extends Standard_Transient

constructor

Clear(): void;

IsEmpty(): boolean;

AddLabel(aLabel: TDF_Label): void;

ContainsLabel(aLabel: TDF_Label): boolean;

Labels(): NCollection_Map_TDF_Label;

AddAttribute(anAttribute: TDF_Attribute): void;

ContainsAttribute(anAttribute: TDF_Attribute): boolean;

Attributes(): NCollection_Map_handle_TDF_Attribute;

AddRoot(aLabel: TDF_Label): void;

Roots(): NCollection_List_TDF_Label;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_DefaultDeltaOnModification: declare class TDF_DefaultDeltaOnModification extends TDF_DeltaOnModification

constructor

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_DefaultDeltaOnRemoval: declare class TDF_DefaultDeltaOnRemoval extends TDF_DeltaOnRemoval

constructor

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_Delta: declare class TDF_Delta extends Standard_Transient

constructor

IsEmpty(): boolean;

IsApplicable(aCurrentTime: number): boolean;

BeginTime(): number;

EndTime(): number;

Labels(aLabelList: NCollection_List_TDF_Label): void;

AttributeDeltas(): NCollection_List_handle_TDF_AttributeDelta;

Name(): TCollection_ExtendedString;

SetName(theName: TCollection_ExtendedString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_DeltaOnAddition: declare class TDF_DeltaOnAddition extends TDF_AttributeDelta

constructor

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_DeltaOnForget: declare class TDF_DeltaOnForget extends TDF_AttributeDelta

constructor

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_DeltaOnModification: declare class TDF_DeltaOnModification extends TDF_AttributeDelta

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_DeltaOnRemoval: declare class TDF_DeltaOnRemoval extends TDF_AttributeDelta

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_DeltaOnResume: declare class TDF_DeltaOnResume extends TDF_AttributeDelta

constructor

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_IDFilter: declare class TDF_IDFilter

constructor

IgnoreAll(ignore: boolean): void;
IgnoreAll(): boolean;
IgnoreAll(ignore: boolean): void;
IgnoreAll(): boolean;

Keep(anID: Standard_GUID): void;
Keep(anIDList: NCollection_List_Standard_GUID): void;
Keep(anID: Standard_GUID): void;
Keep(anIDList: NCollection_List_Standard_GUID): void;

Ignore(anID: Standard_GUID): void;
Ignore(anIDList: NCollection_List_Standard_GUID): void;
Ignore(anID: Standard_GUID): void;
Ignore(anIDList: NCollection_List_Standard_GUID): void;

IsKept(anID: Standard_GUID): boolean;
IsKept(anAtt: TDF_Attribute): boolean;
IsKept(anID: Standard_GUID): boolean;
IsKept(anAtt: TDF_Attribute): boolean;

IsIgnored(anID: Standard_GUID): boolean;
IsIgnored(anAtt: TDF_Attribute): boolean;
IsIgnored(anID: Standard_GUID): boolean;
IsIgnored(anAtt: TDF_Attribute): boolean;

IDList(anIDList: NCollection_List_Standard_GUID): void;

Copy(fromFilter: TDF_IDFilter): void;

Assign(theFilter: TDF_IDFilter): void;

delete(): void;

[Symbol.dispose](): void;

TDF_Label: declare class TDF_Label

constructor

Nullify(): void;

Data(): TDF_Data;

Tag(): number;

Father(): TDF_Label;

IsNull(): boolean;

Imported(aStatus: boolean): void;

IsImported(): boolean;

IsEqual(aLabel: TDF_Label): boolean;

IsDifferent(aLabel: TDF_Label): boolean;

IsRoot(): boolean;

IsAttribute(anID: Standard_GUID): boolean;

AddAttribute(anAttribute: TDF_Attribute, append?: boolean): void;

ForgetAttribute(anAttribute: TDF_Attribute): void;
ForgetAttribute(aguid: Standard_GUID): boolean;
ForgetAttribute(anAttribute: TDF_Attribute): void;
ForgetAttribute(aguid: Standard_GUID): boolean;

ForgetAllAttributes(clearChildren?: boolean): void;

ResumeAttribute(anAttribute: TDF_Attribute): void;

FindAttribute(anID: Standard_GUID): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };
FindAttribute(anID: Standard_GUID, aTransaction: number): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };
FindAttribute(anID: Standard_GUID): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };
FindAttribute(anID: Standard_GUID, aTransaction: number): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };

MayBeModified(): boolean;

AttributesModified(): boolean;

HasAttribute(): boolean;

NbAttributes(): number;

Depth(): number;

IsDescendant(aLabel: TDF_Label): boolean;

Root(): TDF_Label;

HasChild(): boolean;

NbChildren(): number;

FindChild(aTag: number, create?: boolean): TDF_Label;

NewChild(): TDF_Label;

Transaction(): number;

HasLowerNode(otherLabel: TDF_Label): boolean;

HasGreaterNode(otherLabel: TDF_Label): boolean;

delete(): void;

[Symbol.dispose](): void;

TDF_Reference: declare class TDF_Reference extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(I: TDF_Label, Origin: TDF_Label): TDF_Reference;
Set(Origin: TDF_Label): void;

Get(): TDF_Label;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_RelocationTable: declare class TDF_RelocationTable extends Standard_Transient

constructor

SelfRelocate(selfRelocate: boolean): void;
SelfRelocate(): boolean;
SelfRelocate(selfRelocate: boolean): void;
SelfRelocate(): boolean;

AfterRelocate(afterRelocate: boolean): void;
AfterRelocate(): boolean;
AfterRelocate(afterRelocate: boolean): void;
AfterRelocate(): boolean;

SetRelocation(aSourceLabel: TDF_Label, aTargetLabel: TDF_Label): void;
SetRelocation(aSourceAttribute: TDF_Attribute, aTargetAttribute: TDF_Attribute): void;
SetRelocation(aSourceLabel: TDF_Label, aTargetLabel: TDF_Label): void;
SetRelocation(aSourceAttribute: TDF_Attribute, aTargetAttribute: TDF_Attribute): void;

HasRelocation(aSourceLabel: TDF_Label, aTargetLabel: TDF_Label): boolean;
HasRelocation(aSourceAttribute: TDF_Attribute): { returnValue: boolean; aTargetAttribute: TDF_Attribute; [Symbol.dispose](): void };
HasRelocation(aSourceLabel: TDF_Label, aTargetLabel: TDF_Label): boolean;
HasRelocation(aSourceAttribute: TDF_Attribute): { returnValue: boolean; aTargetAttribute: TDF_Attribute; [Symbol.dispose](): void };

SetTransientRelocation(aSourceTransient: Standard_Transient, aTargetTransient: Standard_Transient): void;

HasTransientRelocation(aSourceTransient: Standard_Transient): { returnValue: boolean; aTargetTransient: Standard_Transient; [Symbol.dispose](): void };

Clear(): void;

TargetLabelMap(aLabelMap: NCollection_Map_TDF_Label): void;

TargetAttributeMap(anAttributeMap: NCollection_Map_handle_TDF_Attribute): void;

LabelTable(): NCollection_DataMap_TDF_Label_TDF_Label;

AttributeTable(): NCollection_DataMap_handle_TDF_Attribute_handle_TDF_Attribute;

TransientTable(): NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_TagSource: declare class TDF_TagSource extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF_Label): TDF_TagSource;
Set(T: number): void;

static NewChild(L: TDF_Label): TDF_Label;
NewChild(): TDF_Label;

NewTag(): number;

Get(): number;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDF_Tool: declare class TDF_Tool

constructor

static NbLabels(aLabel: TDF_Label): number;

static NbAttributes(aLabel: TDF_Label): number;
static NbAttributes(aLabel: TDF_Label, aFilter: TDF_IDFilter): number;
static NbAttributes(aLabel: TDF_Label): number;
static NbAttributes(aLabel: TDF_Label, aFilter: TDF_IDFilter): number;

static IsSelfContained(aLabel: TDF_Label): boolean;
static IsSelfContained(aLabel: TDF_Label, aFilter: TDF_IDFilter): boolean;
static IsSelfContained(aLabel: TDF_Label): boolean;
static IsSelfContained(aLabel: TDF_Label, aFilter: TDF_IDFilter): boolean;

static OutReferers(theLabel: TDF_Label, theAtts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferers(aLabel: TDF_Label, aFilterForReferers: TDF_IDFilter, aFilterForReferences: TDF_IDFilter, atts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferers(theLabel: TDF_Label, theAtts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferers(aLabel: TDF_Label, aFilterForReferers: TDF_IDFilter, aFilterForReferences: TDF_IDFilter, atts: NCollection_Map_handle_TDF_Attribute): void;

static OutReferences(aLabel: TDF_Label, atts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferences(aLabel: TDF_Label, aFilterForReferers: TDF_IDFilter, aFilterForReferences: TDF_IDFilter, atts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferences(aLabel: TDF_Label, atts: NCollection_Map_handle_TDF_Attribute): void;
static OutReferences(aLabel: TDF_Label, aFilterForReferers: TDF_IDFilter, aFilterForReferences: TDF_IDFilter, atts: NCollection_Map_handle_TDF_Attribute): void;

static RelocateLabel(aSourceLabel: TDF_Label, fromRoot: TDF_Label, toRoot: TDF_Label, aTargetLabel: TDF_Label, create: boolean): void;

static Entry(aLabel: TDF_Label, anEntry: TCollection_AsciiString): void;

static TagList(aLabel: TDF_Label, aTagList: NCollection_List_int): void;
static TagList(anEntry: TCollection_AsciiString, aTagList: NCollection_List_int): void;
static TagList(aLabel: TDF_Label, aTagList: NCollection_List_int): void;
static TagList(anEntry: TCollection_AsciiString, aTagList: NCollection_List_int): void;

static Label(aDF: TDF_Data, anEntry: TCollection_AsciiString, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, anEntry: string, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, aTagList: NCollection_List_int, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, anEntry: TCollection_AsciiString, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, anEntry: string, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, aTagList: NCollection_List_int, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, anEntry: TCollection_AsciiString, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, anEntry: string, aLabel: TDF_Label, create: boolean): void;
static Label(aDF: TDF_Data, aTagList: NCollection_List_int, aLabel: TDF_Label, create: boolean): void;

static CountLabels(aLabelList: NCollection_List_TDF_Label, aLabelMap: NCollection_DataMap_TDF_Label_int): void;

static DeductLabels(aLabelList: NCollection_List_TDF_Label, aLabelMap: NCollection_DataMap_TDF_Label_int): void;

delete(): void;

[Symbol.dispose](): void;

TDF_Transaction: declare class TDF_Transaction

constructor

Initialize(aDF: TDF_Data): void;

Open(): number;

Commit(withDelta?: boolean): TDF_Delta;

Abort(): void;

Data(): TDF_Data;

Transaction(): number;

Name(): TCollection_AsciiString;

IsOpen(): boolean;

delete(): void;

[Symbol.dispose](): void;

TDF_AttributeDeltaList: NCollection_List_handle_TDF_AttributeDelta

TDF_AttributeList: NCollection_List_handle_TDF_Attribute

TDF_AttributeSequence: NCollection_Sequence_handle_TDF_Attribute

TDF_DeltaList: NCollection_List_handle_TDF_Delta

TDF_IDList: NCollection_List_Standard_GUID

TDF_LabelList: NCollection_List_TDF_Label

TDF_LabelSequence: NCollection_Sequence_TDF_Label
