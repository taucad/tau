# build123d — TDF

2 top-level symbols. Signatures are verbatim python.

// This class provides basic operations to define a label in a data structure
TDF_Label

  // __init__(self
  __init__(self: OCP.OCP.TDF.TDF_Label) -> None

  // Nullify(*args, **kwargs)
  Nullify(*args, **kwargs)
  Nullify(self: OCP.OCP.TDF.TDF_Label) -> None
  Nullify(self: OCP.OCP.TDF.TDF_Label) -> None

  // Data(*args, **kwargs)
  Data(*args, **kwargs)
  Data(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Data
  Data(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Data

  // Tag(*args, **kwargs)
  Tag(*args, **kwargs)
  Tag(self: OCP.OCP.TDF.TDF_Label) -> int
  Tag(self: OCP.OCP.TDF.TDF_Label) -> int

  // Father(*args, **kwargs)
  Father(*args, **kwargs)
  Father(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label
  Father(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // IsNull(*args, **kwargs)
  IsNull(*args, **kwargs)
  IsNull(self: OCP.OCP.TDF.TDF_Label) -> bool
  IsNull(self: OCP.OCP.TDF.TDF_Label) -> bool

  // Imported(self
  Imported(self: OCP.OCP.TDF.TDF_Label, aStatus: bool) -> None

  // IsImported(*args, **kwargs)
  IsImported(*args, **kwargs)
  IsImported(self: OCP.OCP.TDF.TDF_Label) -> bool
  IsImported(self: OCP.OCP.TDF.TDF_Label) -> bool

  // IsEqual(*args, **kwargs)
  IsEqual(*args, **kwargs)
  IsEqual(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool
  IsEqual(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // IsDifferent(*args, **kwargs)
  IsDifferent(*args, **kwargs)
  IsDifferent(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool
  IsDifferent(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // IsRoot(*args, **kwargs)
  IsRoot(*args, **kwargs)
  IsRoot(self: OCP.OCP.TDF.TDF_Label) -> bool
  IsRoot(self: OCP.OCP.TDF.TDF_Label) -> bool

  // IsAttribute(self
  IsAttribute(self: OCP.OCP.TDF.TDF_Label, anID: OCP.OCP.Standard.Standard_GUID) -> bool

  // AddAttribute(self
  AddAttribute(self: OCP.OCP.TDF.TDF_Label, anAttribute: OCP.OCP.TDF.TDF_Attribute, append: bool = True) -> None

  // ForgetAttribute(*args, **kwargs)
  ForgetAttribute(*args, **kwargs)
  ForgetAttribute(self: OCP.OCP.TDF.TDF_Label, anAttribute: OCP.OCP.TDF.TDF_Attribute) -> None
  ForgetAttribute(self: OCP.OCP.TDF.TDF_Label, aguid: OCP.OCP.Standard.Standard_GUID) -> bool

  // ForgetAllAttributes(self
  ForgetAllAttributes(self: OCP.OCP.TDF.TDF_Label, clearChildren: bool = True) -> None

  // ResumeAttribute(self
  ResumeAttribute(self: OCP.OCP.TDF.TDF_Label, anAttribute: OCP.OCP.TDF.TDF_Attribute) -> None

  // MayBeModified(*args, **kwargs)
  MayBeModified(*args, **kwargs)
  MayBeModified(self: OCP.OCP.TDF.TDF_Label) -> bool
  MayBeModified(self: OCP.OCP.TDF.TDF_Label) -> bool

  // AttributesModified(*args, **kwargs)
  AttributesModified(*args, **kwargs)
  AttributesModified(self: OCP.OCP.TDF.TDF_Label) -> bool
  AttributesModified(self: OCP.OCP.TDF.TDF_Label) -> bool

  // HasAttribute(self
  HasAttribute(self: OCP.OCP.TDF.TDF_Label) -> bool

  // NbAttributes(self
  NbAttributes(self: OCP.OCP.TDF.TDF_Label) -> int

  // Depth(self
  Depth(self: OCP.OCP.TDF.TDF_Label) -> int

  // IsDescendant(self
  IsDescendant(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // Root(self
  Root(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // HasChild(*args, **kwargs)
  HasChild(*args, **kwargs)
  HasChild(self: OCP.OCP.TDF.TDF_Label) -> bool
  HasChild(self: OCP.OCP.TDF.TDF_Label) -> bool

  // NbChildren(self
  NbChildren(self: OCP.OCP.TDF.TDF_Label) -> int

  // FindChild(self
  FindChild(self: OCP.OCP.TDF.TDF_Label, aTag: int, create: bool = True) -> OCP.OCP.TDF.TDF_Label

  // NewChild(*args, **kwargs)
  NewChild(*args, **kwargs)
  NewChild(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label
  NewChild(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // Transaction(self
  Transaction(self: OCP.OCP.TDF.TDF_Label) -> int

  // HasLowerNode(self
  HasLowerNode(self: OCP.OCP.TDF.TDF_Label, otherLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // HasGreaterNode(self
  HasGreaterNode(self: OCP.OCP.TDF.TDF_Label, otherLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // Dump(self
  Dump(self: OCP.OCP.TDF.TDF_Label, anOS: io.BytesIO) -> io.BytesIO

  // ExtendedDump(self
  ExtendedDump(self: OCP.OCP.TDF.TDF_Label, anOS: io.BytesIO, aFilter: OCP.OCP.TDF.TDF_IDFilter, aMap: OCP.OCP.TDF.TDF_AttributeIndexedMap) -> None

  // EntryDump(self
  EntryDump(self: OCP.OCP.TDF.TDF_Label, anOS: io.BytesIO) -> None

  // FindAttribute(self
  FindAttribute(self: OCP.OCP.TDF.TDF_Label, GUID: OCP.OCP.Standard.Standard_GUID, Attribute: OCP.OCP.TDF.TDF_Attribute) -> bool

// Purpose
TDF_LabelSequence

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TDF.TDF_LabelSequence) -> None
  __init__(self: OCP.OCP.TDF.TDF_LabelSequence, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None
  __init__(self: OCP.OCP.TDF.TDF_LabelSequence, theOther: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // Size(self
  Size(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // Length(self
  Length(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // Lower(self
  Lower(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // Upper(self
  Upper(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // IsEmpty(self
  IsEmpty(self: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // Reverse(self
  Reverse(self: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // Exchange(self
  Exchange(self: OCP.OCP.TDF.TDF_LabelSequence, I: int, J: int) -> None

  // Clear(self
  Clear(self: OCP.OCP.TDF.TDF_LabelSequence, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator = None) -> None

  // Assign(self
  Assign(self: OCP.OCP.TDF.TDF_LabelSequence, theOther: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_LabelSequence

  // Remove(*args, **kwargs)
  Remove(*args, **kwargs)
  Remove(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int) -> None
  Remove(self: OCP.OCP.TDF.TDF_LabelSequence, theFromIndex: int, theToIndex: int) -> None

  // Append(*args, **kwargs)
  Append(*args, **kwargs)
  Append(self: OCP.OCP.TDF.TDF_LabelSequence, theItem: OCP.OCP.TDF.TDF_Label) -> None
  Append(self: OCP.OCP.TDF.TDF_LabelSequence, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // Prepend(*args, **kwargs)
  Prepend(*args, **kwargs)
  Prepend(self: OCP.OCP.TDF.TDF_LabelSequence, theItem: OCP.OCP.TDF.TDF_Label) -> None
  Prepend(self: OCP.OCP.TDF.TDF_LabelSequence, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // InsertBefore(*args, **kwargs)
  InsertBefore(*args, **kwargs)
  InsertBefore(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None
  InsertBefore(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // InsertAfter(*args, **kwargs)
  InsertAfter(*args, **kwargs)
  InsertAfter(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None
  InsertAfter(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None

  // Split(self
  Split(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // First(self
  First(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // ChangeFirst(self
  ChangeFirst(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // Last(self
  Last(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // ChangeLast(self
  ChangeLast(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // Value(self
  Value(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int) -> OCP.OCP.TDF.TDF_Label

  // ChangeValue(self
  ChangeValue(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int) -> OCP.OCP.TDF.TDF_Label

  // SetValue(self
  SetValue(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None

  // delNode_s(theNode
  delNode_s(theNode: NCollection_SeqNode, theAl: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None
