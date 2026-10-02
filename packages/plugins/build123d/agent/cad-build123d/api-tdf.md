# build123d — TDF

2 top-level symbols. Signatures are verbatim python.

// Category: TDF
// This class provides basic operations to define a label in a data structure
TDF_Label

  // __init__(self
  __init__(self: OCP.OCP.TDF.TDF_Label) -> None

  // Nullify(*args, **kwargs)
  // Remarks: Overloaded function. 1. Nullify(self: OCP.OCP.TDF.TDF_Label) -> None Nullifies the label. 2. Nullify(self: OCP.OCP.TDF.TDF_Label) -> None Nullifies the label.
  Nullify(*args, **kwargs)
  Nullify(self: OCP.OCP.TDF.TDF_Label) -> None
  Nullify(self: OCP.OCP.TDF.TDF_Label) -> None

  // Data(*args, **kwargs)
  // Remarks: Overloaded function. 1. Data(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Data Returns the Data owning <me>. 2. Data(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Data Returns the Data owning <me>.
  Data(*args, **kwargs)
  Data(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Data
  Data(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Data

  // Tag(*args, **kwargs)
  // Remarks: Overloaded function. 1. Tag(self: OCP.OCP.TDF.TDF_Label) -> int Returns the tag of the label. This is the integer assigned randomly to a label in a data framework. This integer is used to identify this label in an entry. 2. Tag(self: OCP.OCP.TDF.TDF_Label) -> int Returns the tag of the label. This is the integer assigned randomly to a label in a data framework. This integer is used to identify this label in an entry.
  Tag(*args, **kwargs)
  Tag(self: OCP.OCP.TDF.TDF_Label) -> int
  Tag(self: OCP.OCP.TDF.TDF_Label) -> int

  // Father(*args, **kwargs)
  // Remarks: Overloaded function. 1. Father(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label Returns the label father. This label may be null if the label is root. 2. Father(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label Returns the label father. This label may be null if the label is root.
  Father(*args, **kwargs)
  Father(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label
  Father(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // IsNull(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsNull(self: OCP.OCP.TDF.TDF_Label) -> bool Returns True if the <aLabel> is null, i.e. it has not been included in the data framework. 2. IsNull(self: OCP.OCP.TDF.TDF_Label) -> bool Returns True if the <aLabel> is null, i.e. it has not been included in the data framework.
  IsNull(*args, **kwargs)
  IsNull(self: OCP.OCP.TDF.TDF_Label) -> bool
  IsNull(self: OCP.OCP.TDF.TDF_Label) -> bool

  // Imported(self
  // Remarks: Sets or unsets <me> and all its descendants as imported label, according to <aStatus>.
  Imported(self: OCP.OCP.TDF.TDF_Label, aStatus: bool) -> None

  // IsImported(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsImported(self: OCP.OCP.TDF.TDF_Label) -> bool Returns True if the <aLabel> is imported. 2. IsImported(self: OCP.OCP.TDF.TDF_Label) -> bool Returns True if the <aLabel> is imported.
  IsImported(*args, **kwargs)
  IsImported(self: OCP.OCP.TDF.TDF_Label) -> bool
  IsImported(self: OCP.OCP.TDF.TDF_Label) -> bool

  // IsEqual(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsEqual(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool Returns True if the <aLabel> is equal to me (same LabelNode*). 2. IsEqual(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool Returns True if the <aLabel> is equal to me (same LabelNode*).
  IsEqual(*args, **kwargs)
  IsEqual(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool
  IsEqual(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // IsDifferent(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsDifferent(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool 2. IsDifferent(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool
  IsDifferent(*args, **kwargs)
  IsDifferent(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool
  IsDifferent(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // IsRoot(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsRoot(self: OCP.OCP.TDF.TDF_Label) -> bool 2. IsRoot(self: OCP.OCP.TDF.TDF_Label) -> bool
  IsRoot(*args, **kwargs)
  IsRoot(self: OCP.OCP.TDF.TDF_Label) -> bool
  IsRoot(self: OCP.OCP.TDF.TDF_Label) -> bool

  // IsAttribute(self
  // Remarks: Returns true if <me> owns an attribute with <anID> as ID.
  IsAttribute(self: OCP.OCP.TDF.TDF_Label, anID: OCP.OCP.Standard.Standard_GUID) -> bool

  // AddAttribute(self
  // Remarks: Adds an Attribute to the current label. Raises if there is already one.
  AddAttribute(self: OCP.OCP.TDF.TDF_Label, anAttribute: OCP.OCP.TDF.TDF_Attribute, append: bool = True) -> None

  // ForgetAttribute(*args, **kwargs)
  // Remarks: Overloaded function. 1. ForgetAttribute(self: OCP.OCP.TDF.TDF_Label, anAttribute: OCP.OCP.TDF.TDF_Attribute) -> None Forgets an Attribute from the current label, setting its forgotten status true and its valid status false. Raises if the attribute is not in the structure. 2. ForgetAttribute(self: OCP.OCP.TDF.TDF_Label, aguid: OCP.OCP.Standard.Standard_GUID) -> bool Forgets the Attribute of GUID <aguid> from the current label . If the attribute doesn't exist returns False. Otherwise returns True.
  ForgetAttribute(*args, **kwargs)
  ForgetAttribute(self: OCP.OCP.TDF.TDF_Label, anAttribute: OCP.OCP.TDF.TDF_Attribute) -> None
  ForgetAttribute(self: OCP.OCP.TDF.TDF_Label, aguid: OCP.OCP.Standard.Standard_GUID) -> bool

  // ForgetAllAttributes(self
  // Remarks: Forgets all the attributes. Does it on also on the sub-labels if <clearChildren> is set to true. Of course, this method is compatible with Transaction & Delta mechanisms.
  ForgetAllAttributes(self: OCP.OCP.TDF.TDF_Label, clearChildren: bool = True) -> None

  // ResumeAttribute(self
  // Remarks: Undo Forget action, setting its forgotten status false and its valid status true. Raises if the attribute is not in the structure.
  ResumeAttribute(self: OCP.OCP.TDF.TDF_Label, anAttribute: OCP.OCP.TDF.TDF_Attribute) -> None

  // MayBeModified(*args, **kwargs)
  // Remarks: Overloaded function. 1. MayBeModified(self: OCP.OCP.TDF.TDF_Label) -> bool Returns true if <me> or a DESCENDANT of <me> owns attributes not yet available in transaction 0. It means at least one of their attributes is new, modified or deleted. 2. MayBeModified(self: OCP.OCP.TDF.TDF_Label) -> bool Returns true if <me> or a DESCENDANT of <me> owns attributes not yet available in transaction 0. It means at least one of their attributes is new, modified or deleted.
  MayBeModified(*args, **kwargs)
  MayBeModified(self: OCP.OCP.TDF.TDF_Label) -> bool
  MayBeModified(self: OCP.OCP.TDF.TDF_Label) -> bool

  // AttributesModified(*args, **kwargs)
  // Remarks: Overloaded function. 1. AttributesModified(self: OCP.OCP.TDF.TDF_Label) -> bool Returns true if <me> owns attributes not yet available in transaction 0. It means at least one attribute is new, modified or deleted. 2. AttributesModified(self: OCP.OCP.TDF.TDF_Label) -> bool Returns true if <me> owns attributes not yet available in transaction 0. It means at least one attribute is new, modified or deleted.
  AttributesModified(*args, **kwargs)
  AttributesModified(self: OCP.OCP.TDF.TDF_Label) -> bool
  AttributesModified(self: OCP.OCP.TDF.TDF_Label) -> bool

  // HasAttribute(self
  // Remarks: Returns true if this label has at least one attribute.
  HasAttribute(self: OCP.OCP.TDF.TDF_Label) -> bool

  // NbAttributes(self
  // Remarks: Returns the number of attributes.
  NbAttributes(self: OCP.OCP.TDF.TDF_Label) -> int

  // Depth(self
  // Remarks: Returns the depth of the label in the data framework. This corresponds to the number of fathers which this label has, and is used in determining whether a label is root, null or equivalent to another label. Exceptions: Standard_NullObject if this label is null. This is because a null object can have no depth.
  Depth(self: OCP.OCP.TDF.TDF_Label) -> int

  // IsDescendant(self
  // Remarks: Returns True if <me> is a descendant of <aLabel>. Attention: every label is its own descendant.
  IsDescendant(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // Root(self
  // Remarks: Returns the root label Root of the data structure. This has a depth of 0. Exceptions: Standard_NullObject if this label is null. This is because a null object can have no depth.
  Root(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // HasChild(*args, **kwargs)
  // Remarks: Overloaded function. 1. HasChild(self: OCP.OCP.TDF.TDF_Label) -> bool Returns true if this label has at least one child. 2. HasChild(self: OCP.OCP.TDF.TDF_Label) -> bool Returns true if this label has at least one child.
  HasChild(*args, **kwargs)
  HasChild(self: OCP.OCP.TDF.TDF_Label) -> bool
  HasChild(self: OCP.OCP.TDF.TDF_Label) -> bool

  // NbChildren(self
  // Remarks: Returns the number of children.
  NbChildren(self: OCP.OCP.TDF.TDF_Label) -> int

  // FindChild(self
  // Remarks: Finds a child label having <aTag> as tag. Creates The tag aTag identifies the label which will be the parent. If create is true and no child label is found, a new one is created. Example: //creating a label with tag 10 at Root TDF_Label lab1 = aDF->Root().FindChild(10); //creating labels 7 and 2 on label 10 TDF_Label lab2 = lab1.FindChild(7); TDF_Label lab3 = lab1.FindChild(2);
  FindChild(self: OCP.OCP.TDF.TDF_Label, aTag: int, create: bool = True) -> OCP.OCP.TDF.TDF_Label

  // NewChild(*args, **kwargs)
  // Remarks: Overloaded function. 1. NewChild(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label Create a new child label of me using autoamtic delivery tags provided by TagSource. 2. NewChild(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label Create a new child label of me using autoamtic delivery tags provided by TagSource.
  NewChild(*args, **kwargs)
  NewChild(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label
  NewChild(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // Transaction(self
  // Remarks: Returns the current transaction index.
  Transaction(self: OCP.OCP.TDF.TDF_Label) -> int

  // HasLowerNode(self
  // Remarks: Returns true if node address of <me> is lower than <otherLabel> one. Used to quickly sort labels (not on entry criterion).
  HasLowerNode(self: OCP.OCP.TDF.TDF_Label, otherLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // HasGreaterNode(self
  // Remarks: Returns true if node address of <me> is greater than <otherLabel> one. Used to quickly sort labels (not on entry criterion).
  HasGreaterNode(self: OCP.OCP.TDF.TDF_Label, otherLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // Dump(self
  // Remarks: Dumps the minimum information about <me> on <aStream>.
  Dump(self: OCP.OCP.TDF.TDF_Label, anOS: io.BytesIO) -> io.BytesIO

  // ExtendedDump(self
  // Remarks: Dumps the label on <aStream> and its attributes rank in <aMap> if their IDs are kept by <IDFilter>.
  ExtendedDump(self: OCP.OCP.TDF.TDF_Label, anOS: io.BytesIO, aFilter: OCP.OCP.TDF.TDF_IDFilter, aMap: OCP.OCP.TDF.TDF_AttributeIndexedMap) -> None

  // EntryDump(self
  // Remarks: Dumps the label entry.
  EntryDump(self: OCP.OCP.TDF.TDF_Label, anOS: io.BytesIO) -> None

  // FindAttribute(self
  // Remarks: Finds an attributes according to an ID.
  FindAttribute(self: OCP.OCP.TDF.TDF_Label, GUID: OCP.OCP.Standard.Standard_GUID, Attribute: OCP.OCP.TDF.TDF_Attribute) -> bool

// Category: TDF
// Purpose
TDF_LabelSequence

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.TDF.TDF_LabelSequence) -> None 2. __init__(self: OCP.OCP.TDF.TDF_LabelSequence, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None 3. __init__(self: OCP.OCP.TDF.TDF_LabelSequence, theOther: OCP.OCP.TDF.TDF_LabelSequence) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TDF.TDF_LabelSequence) -> None
  __init__(self: OCP.OCP.TDF.TDF_LabelSequence, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None
  __init__(self: OCP.OCP.TDF.TDF_LabelSequence, theOther: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // Size(self
  // Remarks: Number of items
  Size(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // Length(self
  // Remarks: Number of items
  Length(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // Lower(self
  // Remarks: Method for consistency with other collections.
  Lower(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // Upper(self
  // Remarks: Method for consistency with other collections.
  Upper(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // IsEmpty(self
  // Remarks: Empty query
  IsEmpty(self: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // Reverse(self
  // Remarks: Reverse sequence
  Reverse(self: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // Exchange(self
  // Remarks: Exchange two members
  Exchange(self: OCP.OCP.TDF.TDF_LabelSequence, I: int, J: int) -> None

  // Clear(self
  // Remarks: Clear the items out, take a new allocator if non null
  Clear(self: OCP.OCP.TDF.TDF_LabelSequence, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator = None) -> None

  // Assign(self
  // Remarks: Replace this sequence by the items of theOther. This method does not change the internal allocator.
  Assign(self: OCP.OCP.TDF.TDF_LabelSequence, theOther: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_LabelSequence

  // Remove(*args, **kwargs)
  // Remarks: Overloaded function. 1. Remove(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int) -> None Remove one item 2. Remove(self: OCP.OCP.TDF.TDF_LabelSequence, theFromIndex: int, theToIndex: int) -> None Remove range of items
  Remove(*args, **kwargs)
  Remove(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int) -> None
  Remove(self: OCP.OCP.TDF.TDF_LabelSequence, theFromIndex: int, theToIndex: int) -> None

  // Append(*args, **kwargs)
  // Remarks: Overloaded function. 1. Append(self: OCP.OCP.TDF.TDF_LabelSequence, theItem: OCP.OCP.TDF.TDF_Label) -> None Append one item 2. Append(self: OCP.OCP.TDF.TDF_LabelSequence, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None Append another sequence (making it empty)
  Append(*args, **kwargs)
  Append(self: OCP.OCP.TDF.TDF_LabelSequence, theItem: OCP.OCP.TDF.TDF_Label) -> None
  Append(self: OCP.OCP.TDF.TDF_LabelSequence, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // Prepend(*args, **kwargs)
  // Remarks: Overloaded function. 1. Prepend(self: OCP.OCP.TDF.TDF_LabelSequence, theItem: OCP.OCP.TDF.TDF_Label) -> None Prepend one item 2. Prepend(self: OCP.OCP.TDF.TDF_LabelSequence, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None Prepend another sequence (making it empty)
  Prepend(*args, **kwargs)
  Prepend(self: OCP.OCP.TDF.TDF_LabelSequence, theItem: OCP.OCP.TDF.TDF_Label) -> None
  Prepend(self: OCP.OCP.TDF.TDF_LabelSequence, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // InsertBefore(*args, **kwargs)
  // Remarks: Overloaded function. 1. InsertBefore(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None InsertBefore theIndex theItem 2. InsertBefore(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None InsertBefore theIndex another sequence (making it empty)
  InsertBefore(*args, **kwargs)
  InsertBefore(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None
  InsertBefore(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // InsertAfter(*args, **kwargs)
  // Remarks: Overloaded function. 1. InsertAfter(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None InsertAfter theIndex another sequence (making it empty) 2. InsertAfter(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None InsertAfter theIndex theItem
  InsertAfter(*args, **kwargs)
  InsertAfter(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None
  InsertAfter(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None

  // Split(self
  // Remarks: Split in two sequences
  Split(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // First(self
  // Remarks: First item access
  First(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // ChangeFirst(self
  // Remarks: First item access
  ChangeFirst(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // Last(self
  // Remarks: Last item access
  Last(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // ChangeLast(self
  // Remarks: Last item access
  ChangeLast(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // Value(self
  // Remarks: Constant item access by theIndex
  Value(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int) -> OCP.OCP.TDF.TDF_Label

  // ChangeValue(self
  // Remarks: Variable item access by theIndex
  ChangeValue(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int) -> OCP.OCP.TDF.TDF_Label

  // SetValue(self
  // Remarks: Set item value by theIndex
  SetValue(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None

  // delNode_s(theNode
  // Remarks: Static deleter to be passed to BaseSequence
  delNode_s(theNode: NCollection_SeqNode, theAl: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None
