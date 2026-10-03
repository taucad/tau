# libcascade — TDF

35 top-level symbols. Signatures are verbatim typescript.

TDF: declare class TDF

  // TDF.constructor (constructor)
  constructor();

  // TDF.LowestID (method)
  static LowestID(): Standard_GUID;

  // TDF.UppestID (method)
  static UppestID(): Standard_GUID;

  // TDF.AddLinkGUIDToProgID (method)
  static AddLinkGUIDToProgID(ID: Standard_GUID, ProgID: TCollection_ExtendedString): void;

  // TDF.GUIDFromProgID (method)
  static GUIDFromProgID(ProgID: TCollection_ExtendedString, ID: Standard_GUID): boolean;

  // TDF.ProgIDFromGUID (method)
  static ProgIDFromGUID(ID: Standard_GUID, ProgID: TCollection_ExtendedString): boolean;

  // TDF.delete (method)
  delete(): void;

  // TDF.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_Attribute: declare class TDF_Attribute extends Standard_Transient

  // TDF_Attribute.ID (method)
  ID(): Standard_GUID;

  // TDF_Attribute.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDF_Attribute.Label (method)
  Label(): TDF_Label;

  // TDF_Attribute.Transaction (method)
  Transaction(): number;

  // TDF_Attribute.UntilTransaction (method)
  UntilTransaction(): number;

  // TDF_Attribute.IsValid (method)
  IsValid(): boolean;

  // TDF_Attribute.IsNew (method)
  IsNew(): boolean;

  // TDF_Attribute.IsForgotten (method)
  IsForgotten(): boolean;

  // TDF_Attribute.IsAttribute (method)
  IsAttribute(anID: Standard_GUID): boolean;

  // TDF_Attribute.FindAttribute (method)
  FindAttribute(anID: Standard_GUID): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };

  // TDF_Attribute.AddAttribute (method)
  AddAttribute(other: TDF_Attribute): void;

  // TDF_Attribute.ForgetAttribute (method)
  ForgetAttribute(aguid: Standard_GUID): boolean;

  // TDF_Attribute.ForgetAllAttributes (method)
  ForgetAllAttributes(clearChildren?: boolean): void;

  // TDF_Attribute.AfterAddition (method)
  AfterAddition(): void;

  // TDF_Attribute.BeforeRemoval (method)
  BeforeRemoval(): void;

  // TDF_Attribute.BeforeForget (method)
  BeforeForget(): void;

  // TDF_Attribute.AfterResume (method)
  AfterResume(): void;

  // TDF_Attribute.AfterRetrieval (method)
  AfterRetrieval(forceIt?: boolean): boolean;

  // TDF_Attribute.BeforeUndo (method)
  BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  // TDF_Attribute.AfterUndo (method)
  AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  // TDF_Attribute.BeforeCommitTransaction (method)
  BeforeCommitTransaction(): void;

  // TDF_Attribute.Backup (method)
  Backup(): void;

  // TDF_Attribute.IsBackuped (method)
  IsBackuped(): boolean;

  // TDF_Attribute.BackupCopy (method)
  BackupCopy(): TDF_Attribute;

  // TDF_Attribute.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDF_Attribute.DeltaOnAddition (method)
  DeltaOnAddition(): TDF_DeltaOnAddition;

  // TDF_Attribute.DeltaOnForget (method)
  DeltaOnForget(): TDF_DeltaOnForget;

  // TDF_Attribute.DeltaOnResume (method)
  DeltaOnResume(): TDF_DeltaOnResume;

  // TDF_Attribute.DeltaOnModification (method)
  DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
  DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

  // TDF_Attribute.DeltaOnRemoval (method)
  DeltaOnRemoval(): TDF_DeltaOnRemoval;

  // TDF_Attribute.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDF_Attribute.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDF_Attribute.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TDF_Attribute.Forget (method)
  Forget(aTransaction: number): void;

  // TDF_Attribute.get_type_name (method)
  static get_type_name(): string;

  // TDF_Attribute.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_Attribute.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_Attribute.delete (method)
  delete(): void;

  // TDF_Attribute.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_AttributeDelta: declare class TDF_AttributeDelta extends Standard_Transient

  // TDF_AttributeDelta.Apply (method)
  Apply(): void;

  // TDF_AttributeDelta.Label (method)
  Label(): TDF_Label;

  // TDF_AttributeDelta.Attribute (method)
  Attribute(): TDF_Attribute;

  // TDF_AttributeDelta.ID (method)
  ID(): Standard_GUID;

  // TDF_AttributeDelta.get_type_name (method)
  static get_type_name(): string;

  // TDF_AttributeDelta.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_AttributeDelta.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_AttributeDelta.delete (method)
  delete(): void;

  // TDF_AttributeDelta.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_AttributeIterator: declare class TDF_AttributeIterator

  // TDF_AttributeIterator.constructor (constructor)
  constructor();
  constructor(aLabel: TDF_Label, withoutForgotten?: boolean);

  // TDF_AttributeIterator.Initialize (method)
  Initialize(aLabel: TDF_Label, withoutForgotten?: boolean): void;

  // TDF_AttributeIterator.More (method)
  More(): boolean;

  // TDF_AttributeIterator.Next (method)
  Next(): void;

  // TDF_AttributeIterator.Value (method)
  Value(): TDF_Attribute;

  // TDF_AttributeIterator.PtrValue (method)
  PtrValue(): TDF_Attribute;

  // TDF_AttributeIterator.delete (method)
  delete(): void;

  // TDF_AttributeIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_ChildIDIterator: declare class TDF_ChildIDIterator

  // TDF_ChildIDIterator.constructor (constructor)
  constructor();
  constructor(aLabel: TDF_Label, anID: Standard_GUID, allLevels?: boolean);

  // TDF_ChildIDIterator.Initialize (method)
  Initialize(aLabel: TDF_Label, anID: Standard_GUID, allLevels?: boolean): void;

  // TDF_ChildIDIterator.More (method)
  More(): boolean;

  // TDF_ChildIDIterator.Next (method)
  Next(): void;

  // TDF_ChildIDIterator.NextBrother (method)
  NextBrother(): void;

  // TDF_ChildIDIterator.Value (method)
  Value(): TDF_Attribute;

  // TDF_ChildIDIterator.delete (method)
  delete(): void;

  // TDF_ChildIDIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_ChildIterator: declare class TDF_ChildIterator

  // TDF_ChildIterator.constructor (constructor)
  constructor();
  constructor(aLabel: TDF_Label, allLevels?: boolean);

  // TDF_ChildIterator.Initialize (method)
  Initialize(aLabel: TDF_Label, allLevels?: boolean): void;

  // TDF_ChildIterator.More (method)
  More(): boolean;

  // TDF_ChildIterator.Next (method)
  Next(): void;

  // TDF_ChildIterator.NextBrother (method)
  NextBrother(): void;

  // TDF_ChildIterator.Value (method)
  Value(): TDF_Label;

  // TDF_ChildIterator.delete (method)
  delete(): void;

  // TDF_ChildIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_ClosureMode: declare class TDF_ClosureMode

  // TDF_ClosureMode.constructor (constructor)
  constructor(aMode?: boolean);

  // TDF_ClosureMode.Descendants (method)
  Descendants(aStatus: boolean): void;
  Descendants(): boolean;

  // TDF_ClosureMode.References (method)
  References(aStatus: boolean): void;
  References(): boolean;

  // TDF_ClosureMode.delete (method)
  delete(): void;

  // TDF_ClosureMode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_ClosureTool: declare class TDF_ClosureTool

  // TDF_ClosureTool.constructor (constructor)
  constructor();

  // TDF_ClosureTool.Closure (method)
  static Closure(aDataSet: TDF_DataSet): void;
  static Closure(aDataSet: TDF_DataSet, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;
  static Closure(aLabel: TDF_Label, aLabMap: NCollection_Map_TDF_Label, anAttMap: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter, aMode: TDF_ClosureMode): void;

  // TDF_ClosureTool.delete (method)
  delete(): void;

  // TDF_ClosureTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_ComparisonTool: declare class TDF_ComparisonTool

  // TDF_ComparisonTool.constructor (constructor)
  constructor();

  // TDF_ComparisonTool.Compare (method)
  static Compare(aSourceDataSet: TDF_DataSet, aTargetDataSet: TDF_DataSet, aFilter: TDF_IDFilter, aRelocationTable: TDF_RelocationTable): void;

  // TDF_ComparisonTool.SourceUnbound (method)
  static SourceUnbound(aRefDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aFilter: TDF_IDFilter, aDiffDataSet: TDF_DataSet, anOption?: number): boolean;

  // TDF_ComparisonTool.TargetUnbound (method)
  static TargetUnbound(aRefDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aFilter: TDF_IDFilter, aDiffDataSet: TDF_DataSet, anOption?: number): boolean;

  // TDF_ComparisonTool.Cut (method)
  static Cut(aDataSet: TDF_DataSet): void;

  // TDF_ComparisonTool.IsSelfContained (method)
  static IsSelfContained(aLabel: TDF_Label, aDataSet: TDF_DataSet): boolean;

  // TDF_ComparisonTool.delete (method)
  delete(): void;

  // TDF_ComparisonTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_CopyLabel: declare class TDF_CopyLabel

  // TDF_CopyLabel.constructor (constructor)
  constructor();
  constructor(aSource: TDF_Label, aTarget: TDF_Label);

  // TDF_CopyLabel.Load (method)
  Load(aSource: TDF_Label, aTarget: TDF_Label): void;

  // TDF_CopyLabel.UseFilter (method)
  UseFilter(aFilter: TDF_IDFilter): void;

  // TDF_CopyLabel.ExternalReferences (method)
  static ExternalReferences(Lab: TDF_Label, aExternals: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter): boolean;
  static ExternalReferences(aRefLab: TDF_Label, Lab: TDF_Label, aExternals: NCollection_Map_handle_TDF_Attribute, aFilter: TDF_IDFilter): { aDataSet: TDF_DataSet; [Symbol.dispose](): void };

  // TDF_CopyLabel.Perform (method)
  Perform(): void;

  // TDF_CopyLabel.IsDone (method)
  IsDone(): boolean;

  // TDF_CopyLabel.RelocationTable (method)
  RelocationTable(): TDF_RelocationTable;

  // TDF_CopyLabel.delete (method)
  delete(): void;

  // TDF_CopyLabel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_CopyTool: declare class TDF_CopyTool

  // TDF_CopyTool.constructor (constructor)
  constructor();

  // TDF_CopyTool.Copy (method)
  static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable): void;
  static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter): void;
  static Copy(aSourceDataSet: TDF_DataSet, aRelocationTable: TDF_RelocationTable, aPrivilegeFilter: TDF_IDFilter, aRefFilter: TDF_IDFilter, setSelfContained: boolean): void;

  // TDF_CopyTool.delete (method)
  delete(): void;

  // TDF_CopyTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_Data: declare class TDF_Data extends Standard_Transient

  // TDF_Data.constructor (constructor)
  constructor();

  // TDF_Data.Root (method)
  Root(): TDF_Label;

  // TDF_Data.Transaction (method)
  Transaction(): number;

  // TDF_Data.Time (method)
  Time(): number;

  // TDF_Data.IsApplicable (method)
  IsApplicable(aDelta: TDF_Delta): boolean;

  // TDF_Data.Undo (method)
  Undo(aDelta: TDF_Delta, withDelta?: boolean): TDF_Delta;

  // TDF_Data.Destroy (method)
  Destroy(): void;

  // TDF_Data.NotUndoMode (method)
  NotUndoMode(): boolean;

  // TDF_Data.AllowModification (method)
  AllowModification(isAllowed: boolean): void;

  // TDF_Data.IsModificationAllowed (method)
  IsModificationAllowed(): boolean;

  // TDF_Data.SetAccessByEntries (method)
  SetAccessByEntries(aSet: boolean): void;

  // TDF_Data.IsAccessByEntries (method)
  IsAccessByEntries(): boolean;

  // TDF_Data.GetLabel (method)
  GetLabel(anEntry: TCollection_AsciiString, aLabel: TDF_Label): boolean;

  // TDF_Data.RegisterLabel (method)
  RegisterLabel(aLabel: TDF_Label): void;

  // TDF_Data.LabelNodeAllocator (method)
  LabelNodeAllocator(): unknown;

  // TDF_Data.get_type_name (method)
  static get_type_name(): string;

  // TDF_Data.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_Data.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_Data.delete (method)
  delete(): void;

  // TDF_Data.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_DataSet: declare class TDF_DataSet extends Standard_Transient

  // TDF_DataSet.constructor (constructor)
  constructor();

  // TDF_DataSet.Clear (method)
  Clear(): void;

  // TDF_DataSet.IsEmpty (method)
  IsEmpty(): boolean;

  // TDF_DataSet.AddLabel (method)
  AddLabel(aLabel: TDF_Label): void;

  // TDF_DataSet.ContainsLabel (method)
  ContainsLabel(aLabel: TDF_Label): boolean;

  // TDF_DataSet.Labels (method)
  Labels(): NCollection_Map_TDF_Label;

  // TDF_DataSet.AddAttribute (method)
  AddAttribute(anAttribute: TDF_Attribute): void;

  // TDF_DataSet.ContainsAttribute (method)
  ContainsAttribute(anAttribute: TDF_Attribute): boolean;

  // TDF_DataSet.Attributes (method)
  Attributes(): NCollection_Map_handle_TDF_Attribute;

  // TDF_DataSet.AddRoot (method)
  AddRoot(aLabel: TDF_Label): void;

  // TDF_DataSet.Roots (method)
  Roots(): NCollection_List_TDF_Label;

  // TDF_DataSet.get_type_name (method)
  static get_type_name(): string;

  // TDF_DataSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_DataSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_DataSet.delete (method)
  delete(): void;

  // TDF_DataSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_DefaultDeltaOnModification: declare class TDF_DefaultDeltaOnModification extends TDF_DeltaOnModification

  // TDF_DefaultDeltaOnModification.constructor (constructor)
  constructor(anAttribute: TDF_Attribute);

  // TDF_DefaultDeltaOnModification.Apply (method)
  Apply(): void;

  // TDF_DefaultDeltaOnModification.get_type_name (method)
  static get_type_name(): string;

  // TDF_DefaultDeltaOnModification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_DefaultDeltaOnModification.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_DefaultDeltaOnModification.delete (method)
  delete(): void;

  // TDF_DefaultDeltaOnModification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_DefaultDeltaOnRemoval: declare class TDF_DefaultDeltaOnRemoval extends TDF_DeltaOnRemoval

  // TDF_DefaultDeltaOnRemoval.constructor (constructor)
  constructor(anAttribute: TDF_Attribute);

  // TDF_DefaultDeltaOnRemoval.Apply (method)
  Apply(): void;

  // TDF_DefaultDeltaOnRemoval.get_type_name (method)
  static get_type_name(): string;

  // TDF_DefaultDeltaOnRemoval.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_DefaultDeltaOnRemoval.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_DefaultDeltaOnRemoval.delete (method)
  delete(): void;

  // TDF_DefaultDeltaOnRemoval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_Delta: declare class TDF_Delta extends Standard_Transient

  // TDF_Delta.constructor (constructor)
  constructor();

  // TDF_Delta.IsEmpty (method)
  IsEmpty(): boolean;

  // TDF_Delta.IsApplicable (method)
  IsApplicable(aCurrentTime: number): boolean;

  // TDF_Delta.BeginTime (method)
  BeginTime(): number;

  // TDF_Delta.EndTime (method)
  EndTime(): number;

  // TDF_Delta.Labels (method)
  Labels(aLabelList: NCollection_List_TDF_Label): void;

  // TDF_Delta.AttributeDeltas (method)
  AttributeDeltas(): NCollection_List_handle_TDF_AttributeDelta;

  // TDF_Delta.Name (method)
  Name(): TCollection_ExtendedString;

  // TDF_Delta.SetName (method)
  SetName(theName: TCollection_ExtendedString): void;

  // TDF_Delta.get_type_name (method)
  static get_type_name(): string;

  // TDF_Delta.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_Delta.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_Delta.delete (method)
  delete(): void;

  // TDF_Delta.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_DeltaOnAddition: declare class TDF_DeltaOnAddition extends TDF_AttributeDelta

  // TDF_DeltaOnAddition.constructor (constructor)
  constructor(anAtt: TDF_Attribute);

  // TDF_DeltaOnAddition.Apply (method)
  Apply(): void;

  // TDF_DeltaOnAddition.get_type_name (method)
  static get_type_name(): string;

  // TDF_DeltaOnAddition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_DeltaOnAddition.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_DeltaOnAddition.delete (method)
  delete(): void;

  // TDF_DeltaOnAddition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_DeltaOnForget: declare class TDF_DeltaOnForget extends TDF_AttributeDelta

  // TDF_DeltaOnForget.constructor (constructor)
  constructor(anAtt: TDF_Attribute);

  // TDF_DeltaOnForget.Apply (method)
  Apply(): void;

  // TDF_DeltaOnForget.get_type_name (method)
  static get_type_name(): string;

  // TDF_DeltaOnForget.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_DeltaOnForget.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_DeltaOnForget.delete (method)
  delete(): void;

  // TDF_DeltaOnForget.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_DeltaOnModification: declare class TDF_DeltaOnModification extends TDF_AttributeDelta

  // TDF_DeltaOnModification.Apply (method)
  Apply(): void;

  // TDF_DeltaOnModification.get_type_name (method)
  static get_type_name(): string;

  // TDF_DeltaOnModification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_DeltaOnModification.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_DeltaOnModification.delete (method)
  delete(): void;

  // TDF_DeltaOnModification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_DeltaOnRemoval: declare class TDF_DeltaOnRemoval extends TDF_AttributeDelta

  // TDF_DeltaOnRemoval.get_type_name (method)
  static get_type_name(): string;

  // TDF_DeltaOnRemoval.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_DeltaOnRemoval.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_DeltaOnRemoval.delete (method)
  delete(): void;

  // TDF_DeltaOnRemoval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_DeltaOnResume: declare class TDF_DeltaOnResume extends TDF_AttributeDelta

  // TDF_DeltaOnResume.constructor (constructor)
  constructor(anAtt: TDF_Attribute);

  // TDF_DeltaOnResume.Apply (method)
  Apply(): void;

  // TDF_DeltaOnResume.get_type_name (method)
  static get_type_name(): string;

  // TDF_DeltaOnResume.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_DeltaOnResume.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_DeltaOnResume.delete (method)
  delete(): void;

  // TDF_DeltaOnResume.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_IDFilter: declare class TDF_IDFilter

  // TDF_IDFilter.constructor (constructor)
  constructor(ignoreMode?: boolean);

  // TDF_IDFilter.IgnoreAll (method)
  IgnoreAll(ignore: boolean): void;
  IgnoreAll(): boolean;

  // TDF_IDFilter.Keep (method)
  Keep(anID: Standard_GUID): void;
  Keep(anIDList: NCollection_List_Standard_GUID): void;

  // TDF_IDFilter.Ignore (method)
  Ignore(anID: Standard_GUID): void;
  Ignore(anIDList: NCollection_List_Standard_GUID): void;

  // TDF_IDFilter.IsKept (method)
  IsKept(anID: Standard_GUID): boolean;
  IsKept(anAtt: TDF_Attribute): boolean;

  // TDF_IDFilter.IsIgnored (method)
  IsIgnored(anID: Standard_GUID): boolean;
  IsIgnored(anAtt: TDF_Attribute): boolean;

  // TDF_IDFilter.IDList (method)
  IDList(anIDList: NCollection_List_Standard_GUID): void;

  // TDF_IDFilter.Copy (method)
  Copy(fromFilter: TDF_IDFilter): void;

  // TDF_IDFilter.Assign (method)
  Assign(theFilter: TDF_IDFilter): void;

  // TDF_IDFilter.delete (method)
  delete(): void;

  // TDF_IDFilter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_Label: declare class TDF_Label

  // TDF_Label.constructor (constructor)
  constructor();

  // TDF_Label.Nullify (method)
  Nullify(): void;

  // TDF_Label.Data (method)
  Data(): TDF_Data;

  // TDF_Label.Tag (method)
  Tag(): number;

  // TDF_Label.Father (method)
  Father(): TDF_Label;

  // TDF_Label.IsNull (method)
  IsNull(): boolean;

  // TDF_Label.Imported (method)
  Imported(aStatus: boolean): void;

  // TDF_Label.IsImported (method)
  IsImported(): boolean;

  // TDF_Label.IsEqual (method)
  IsEqual(aLabel: TDF_Label): boolean;

  // TDF_Label.IsDifferent (method)
  IsDifferent(aLabel: TDF_Label): boolean;

  // TDF_Label.IsRoot (method)
  IsRoot(): boolean;

  // TDF_Label.IsAttribute (method)
  IsAttribute(anID: Standard_GUID): boolean;

  // TDF_Label.AddAttribute (method)
  AddAttribute(anAttribute: TDF_Attribute, append?: boolean): void;

  // TDF_Label.ForgetAttribute (method)
  ForgetAttribute(anAttribute: TDF_Attribute): void;
  ForgetAttribute(aguid: Standard_GUID): boolean;

  // TDF_Label.ForgetAllAttributes (method)
  ForgetAllAttributes(clearChildren?: boolean): void;

  // TDF_Label.ResumeAttribute (method)
  ResumeAttribute(anAttribute: TDF_Attribute): void;

  // TDF_Label.FindAttribute (method)
  FindAttribute(anID: Standard_GUID): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };
  FindAttribute(anID: Standard_GUID, aTransaction: number): { returnValue: boolean; anAttribute: TDF_Attribute; [Symbol.dispose](): void };

  // TDF_Label.MayBeModified (method)
  MayBeModified(): boolean;

  // TDF_Label.AttributesModified (method)
  AttributesModified(): boolean;

  // TDF_Label.HasAttribute (method)
  HasAttribute(): boolean;

  // TDF_Label.NbAttributes (method)
  NbAttributes(): number;

  // TDF_Label.Depth (method)
  Depth(): number;

  // TDF_Label.IsDescendant (method)
  IsDescendant(aLabel: TDF_Label): boolean;

  // TDF_Label.Root (method)
  Root(): TDF_Label;

  // TDF_Label.HasChild (method)
  HasChild(): boolean;

  // TDF_Label.NbChildren (method)
  NbChildren(): number;

  // TDF_Label.FindChild (method)
  FindChild(aTag: number, create?: boolean): TDF_Label;

  // TDF_Label.NewChild (method)
  NewChild(): TDF_Label;

  // TDF_Label.Transaction (method)
  Transaction(): number;

  // TDF_Label.HasLowerNode (method)
  HasLowerNode(otherLabel: TDF_Label): boolean;

  // TDF_Label.HasGreaterNode (method)
  HasGreaterNode(otherLabel: TDF_Label): boolean;

  // TDF_Label.delete (method)
  delete(): void;

  // TDF_Label.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_Reference: declare class TDF_Reference extends TDF_Attribute

  // TDF_Reference.constructor (constructor)
  constructor();

  // TDF_Reference.GetID (method)
  static GetID(): Standard_GUID;

  // TDF_Reference.Set (method)
  static Set(I: TDF_Label, Origin: TDF_Label): TDF_Reference;
  Set(Origin: TDF_Label): void;

  // TDF_Reference.Get (method)
  Get(): TDF_Label;

  // TDF_Reference.ID (method)
  ID(): Standard_GUID;

  // TDF_Reference.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDF_Reference.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDF_Reference.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDF_Reference.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TDF_Reference.get_type_name (method)
  static get_type_name(): string;

  // TDF_Reference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_Reference.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_Reference.delete (method)
  delete(): void;

  // TDF_Reference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_RelocationTable: declare class TDF_RelocationTable extends Standard_Transient

  // TDF_RelocationTable.constructor (constructor)
  constructor(selfRelocate?: boolean);

  // TDF_RelocationTable.SelfRelocate (method)
  SelfRelocate(selfRelocate: boolean): void;
  SelfRelocate(): boolean;

  // TDF_RelocationTable.AfterRelocate (method)
  AfterRelocate(afterRelocate: boolean): void;
  AfterRelocate(): boolean;

  // TDF_RelocationTable.SetRelocation (method)
  SetRelocation(aSourceLabel: TDF_Label, aTargetLabel: TDF_Label): void;
  SetRelocation(aSourceAttribute: TDF_Attribute, aTargetAttribute: TDF_Attribute): void;

  // TDF_RelocationTable.HasRelocation (method)
  HasRelocation(aSourceLabel: TDF_Label, aTargetLabel: TDF_Label): boolean;
  HasRelocation(aSourceAttribute: TDF_Attribute): { returnValue: boolean; aTargetAttribute: TDF_Attribute; [Symbol.dispose](): void };

  // TDF_RelocationTable.SetTransientRelocation (method)
  SetTransientRelocation(aSourceTransient: Standard_Transient, aTargetTransient: Standard_Transient): void;

  // TDF_RelocationTable.HasTransientRelocation (method)
  HasTransientRelocation(aSourceTransient: Standard_Transient): { returnValue: boolean; aTargetTransient: Standard_Transient; [Symbol.dispose](): void };

  // TDF_RelocationTable.Clear (method)
  Clear(): void;

  // TDF_RelocationTable.TargetLabelMap (method)
  TargetLabelMap(aLabelMap: NCollection_Map_TDF_Label): void;

  // TDF_RelocationTable.TargetAttributeMap (method)
  TargetAttributeMap(anAttributeMap: NCollection_Map_handle_TDF_Attribute): void;

  // TDF_RelocationTable.LabelTable (method)
  LabelTable(): NCollection_DataMap_TDF_Label_TDF_Label;

  // TDF_RelocationTable.AttributeTable (method)
  AttributeTable(): NCollection_DataMap_handle_TDF_Attribute_handle_TDF_Attribute;

  // TDF_RelocationTable.TransientTable (method)
  TransientTable(): NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient;

  // TDF_RelocationTable.get_type_name (method)
  static get_type_name(): string;

  // TDF_RelocationTable.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_RelocationTable.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_RelocationTable.delete (method)
  delete(): void;

  // TDF_RelocationTable.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_TagSource: declare class TDF_TagSource extends TDF_Attribute

  // TDF_TagSource.constructor (constructor)
  constructor();

  // TDF_TagSource.GetID (method)
  static GetID(): Standard_GUID;

  // TDF_TagSource.Set (method)
  static Set(label: TDF_Label): TDF_TagSource;
  Set(T: number): void;

  // TDF_TagSource.NewChild (method)
  static NewChild(L: TDF_Label): TDF_Label;
  NewChild(): TDF_Label;

  // TDF_TagSource.NewTag (method)
  NewTag(): number;

  // TDF_TagSource.Get (method)
  Get(): number;

  // TDF_TagSource.ID (method)
  ID(): Standard_GUID;

  // TDF_TagSource.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDF_TagSource.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDF_TagSource.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDF_TagSource.get_type_name (method)
  static get_type_name(): string;

  // TDF_TagSource.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDF_TagSource.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDF_TagSource.delete (method)
  delete(): void;

  // TDF_TagSource.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_Tool: declare class TDF_Tool

  // TDF_Tool.constructor (constructor)
  constructor();

  // TDF_Tool.NbLabels (method)
  static NbLabels(aLabel: TDF_Label): number;

  // TDF_Tool.NbAttributes (method)
  static NbAttributes(aLabel: TDF_Label): number;
  static NbAttributes(aLabel: TDF_Label, aFilter: TDF_IDFilter): number;

  // TDF_Tool.IsSelfContained (method)
  static IsSelfContained(aLabel: TDF_Label): boolean;
  static IsSelfContained(aLabel: TDF_Label, aFilter: TDF_IDFilter): boolean;

  // TDF_Tool.OutReferers (method)
  static OutReferers(theLabel: TDF_Label, theAtts: NCollection_Map_handle_TDF_Attribute): void;
  static OutReferers(aLabel: TDF_Label, aFilterForReferers: TDF_IDFilter, aFilterForReferences: TDF_IDFilter, atts: NCollection_Map_handle_TDF_Attribute): void;

  // TDF_Tool.OutReferences (method)
  static OutReferences(aLabel: TDF_Label, atts: NCollection_Map_handle_TDF_Attribute): void;
  static OutReferences(aLabel: TDF_Label, aFilterForReferers: TDF_IDFilter, aFilterForReferences: TDF_IDFilter, atts: NCollection_Map_handle_TDF_Attribute): void;

  // TDF_Tool.RelocateLabel (method)
  static RelocateLabel(aSourceLabel: TDF_Label, fromRoot: TDF_Label, toRoot: TDF_Label, aTargetLabel: TDF_Label, create: boolean): void;

  // TDF_Tool.Entry (method)
  static Entry(aLabel: TDF_Label, anEntry: TCollection_AsciiString): void;

  // TDF_Tool.TagList (method)
  static TagList(aLabel: TDF_Label, aTagList: NCollection_List_int): void;
  static TagList(anEntry: TCollection_AsciiString, aTagList: NCollection_List_int): void;

  // TDF_Tool.Label (method)
  static Label(aDF: TDF_Data, anEntry: TCollection_AsciiString, aLabel: TDF_Label, create: boolean): void;
  static Label(aDF: TDF_Data, anEntry: string, aLabel: TDF_Label, create: boolean): void;
  static Label(aDF: TDF_Data, aTagList: NCollection_List_int, aLabel: TDF_Label, create: boolean): void;

  // TDF_Tool.CountLabels (method)
  static CountLabels(aLabelList: NCollection_List_TDF_Label, aLabelMap: NCollection_DataMap_TDF_Label_int): void;

  // TDF_Tool.DeductLabels (method)
  static DeductLabels(aLabelList: NCollection_List_TDF_Label, aLabelMap: NCollection_DataMap_TDF_Label_int): void;

  // TDF_Tool.delete (method)
  delete(): void;

  // TDF_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_Transaction: declare class TDF_Transaction

  // TDF_Transaction.constructor (constructor)
  constructor(aName?: TCollection_AsciiString);
  constructor(aDF: TDF_Data, aName?: TCollection_AsciiString);

  // TDF_Transaction.Initialize (method)
  Initialize(aDF: TDF_Data): void;

  // TDF_Transaction.Open (method)
  Open(): number;

  // TDF_Transaction.Commit (method)
  Commit(withDelta?: boolean): TDF_Delta;

  // TDF_Transaction.Abort (method)
  Abort(): void;

  // TDF_Transaction.Data (method)
  Data(): TDF_Data;

  // TDF_Transaction.Transaction (method)
  Transaction(): number;

  // TDF_Transaction.Name (method)
  Name(): TCollection_AsciiString;

  // TDF_Transaction.IsOpen (method)
  IsOpen(): boolean;

  // TDF_Transaction.delete (method)
  delete(): void;

  // TDF_Transaction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDF_AttributeDeltaList: NCollection_List_handle_TDF_AttributeDelta

TDF_AttributeList: NCollection_List_handle_TDF_Attribute

TDF_AttributeSequence: NCollection_Sequence_handle_TDF_Attribute

TDF_DeltaList: NCollection_List_handle_TDF_Delta

TDF_IDList: NCollection_List_Standard_GUID

TDF_LabelList: NCollection_List_TDF_Label

TDF_LabelSequence: NCollection_Sequence_TDF_Label
