# build123d — TDF

2 top-level symbols. Signatures are verbatim python.

// This class provides basic operations to define a label in a data structure
TDF_Label

  // __init__(self
  // OCP.OCP.TDF.TDF_Label.__init__ (constructor)
  __init__(self: OCP.OCP.TDF.TDF_Label) -> None

  // Nullify(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.Nullify (method)
  Nullify(*args, **kwargs)
  Nullify(self: OCP.OCP.TDF.TDF_Label) -> None
  Nullify(self: OCP.OCP.TDF.TDF_Label) -> None

  // Data(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.Data (method)
  Data(*args, **kwargs)
  Data(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Data
  Data(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Data

  // Tag(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.Tag (method)
  Tag(*args, **kwargs)
  Tag(self: OCP.OCP.TDF.TDF_Label) -> int
  Tag(self: OCP.OCP.TDF.TDF_Label) -> int

  // Father(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.Father (method)
  Father(*args, **kwargs)
  Father(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label
  Father(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // IsNull(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.IsNull (method)
  IsNull(*args, **kwargs)
  IsNull(self: OCP.OCP.TDF.TDF_Label) -> bool
  IsNull(self: OCP.OCP.TDF.TDF_Label) -> bool

  // Imported(self
  // OCP.OCP.TDF.TDF_Label.Imported (method)
  Imported(self: OCP.OCP.TDF.TDF_Label, aStatus: bool) -> None

  // IsImported(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.IsImported (method)
  IsImported(*args, **kwargs)
  IsImported(self: OCP.OCP.TDF.TDF_Label) -> bool
  IsImported(self: OCP.OCP.TDF.TDF_Label) -> bool

  // IsEqual(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.IsEqual (method)
  IsEqual(*args, **kwargs)
  IsEqual(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool
  IsEqual(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // IsDifferent(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.IsDifferent (method)
  IsDifferent(*args, **kwargs)
  IsDifferent(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool
  IsDifferent(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // IsRoot(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.IsRoot (method)
  IsRoot(*args, **kwargs)
  IsRoot(self: OCP.OCP.TDF.TDF_Label) -> bool
  IsRoot(self: OCP.OCP.TDF.TDF_Label) -> bool

  // IsAttribute(self
  // OCP.OCP.TDF.TDF_Label.IsAttribute (method)
  IsAttribute(self: OCP.OCP.TDF.TDF_Label, anID: OCP.OCP.Standard.Standard_GUID) -> bool

  // AddAttribute(self
  // OCP.OCP.TDF.TDF_Label.AddAttribute (method)
  AddAttribute(self: OCP.OCP.TDF.TDF_Label, anAttribute: OCP.OCP.TDF.TDF_Attribute, append: bool = True) -> None

  // ForgetAttribute(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.ForgetAttribute (method)
  ForgetAttribute(*args, **kwargs)
  ForgetAttribute(self: OCP.OCP.TDF.TDF_Label, anAttribute: OCP.OCP.TDF.TDF_Attribute) -> None
  ForgetAttribute(self: OCP.OCP.TDF.TDF_Label, aguid: OCP.OCP.Standard.Standard_GUID) -> bool

  // ForgetAllAttributes(self
  // OCP.OCP.TDF.TDF_Label.ForgetAllAttributes (method)
  ForgetAllAttributes(self: OCP.OCP.TDF.TDF_Label, clearChildren: bool = True) -> None

  // ResumeAttribute(self
  // OCP.OCP.TDF.TDF_Label.ResumeAttribute (method)
  ResumeAttribute(self: OCP.OCP.TDF.TDF_Label, anAttribute: OCP.OCP.TDF.TDF_Attribute) -> None

  // MayBeModified(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.MayBeModified (method)
  MayBeModified(*args, **kwargs)
  MayBeModified(self: OCP.OCP.TDF.TDF_Label) -> bool
  MayBeModified(self: OCP.OCP.TDF.TDF_Label) -> bool

  // AttributesModified(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.AttributesModified (method)
  AttributesModified(*args, **kwargs)
  AttributesModified(self: OCP.OCP.TDF.TDF_Label) -> bool
  AttributesModified(self: OCP.OCP.TDF.TDF_Label) -> bool

  // HasAttribute(self
  // OCP.OCP.TDF.TDF_Label.HasAttribute (method)
  HasAttribute(self: OCP.OCP.TDF.TDF_Label) -> bool

  // NbAttributes(self
  // OCP.OCP.TDF.TDF_Label.NbAttributes (method)
  NbAttributes(self: OCP.OCP.TDF.TDF_Label) -> int

  // Depth(self
  // OCP.OCP.TDF.TDF_Label.Depth (method)
  Depth(self: OCP.OCP.TDF.TDF_Label) -> int

  // IsDescendant(self
  // OCP.OCP.TDF.TDF_Label.IsDescendant (method)
  IsDescendant(self: OCP.OCP.TDF.TDF_Label, aLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // Root(self
  // OCP.OCP.TDF.TDF_Label.Root (method)
  Root(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // HasChild(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.HasChild (method)
  HasChild(*args, **kwargs)
  HasChild(self: OCP.OCP.TDF.TDF_Label) -> bool
  HasChild(self: OCP.OCP.TDF.TDF_Label) -> bool

  // NbChildren(self
  // OCP.OCP.TDF.TDF_Label.NbChildren (method)
  NbChildren(self: OCP.OCP.TDF.TDF_Label) -> int

  // FindChild(self
  // OCP.OCP.TDF.TDF_Label.FindChild (method)
  FindChild(self: OCP.OCP.TDF.TDF_Label, aTag: int, create: bool = True) -> OCP.OCP.TDF.TDF_Label

  // NewChild(*args, **kwargs)
  // OCP.OCP.TDF.TDF_Label.NewChild (method)
  NewChild(*args, **kwargs)
  NewChild(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label
  NewChild(self: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // Transaction(self
  // OCP.OCP.TDF.TDF_Label.Transaction (method)
  Transaction(self: OCP.OCP.TDF.TDF_Label) -> int

  // HasLowerNode(self
  // OCP.OCP.TDF.TDF_Label.HasLowerNode (method)
  HasLowerNode(self: OCP.OCP.TDF.TDF_Label, otherLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // HasGreaterNode(self
  // OCP.OCP.TDF.TDF_Label.HasGreaterNode (method)
  HasGreaterNode(self: OCP.OCP.TDF.TDF_Label, otherLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // Dump(self
  // OCP.OCP.TDF.TDF_Label.Dump (method)
  Dump(self: OCP.OCP.TDF.TDF_Label, anOS: io.BytesIO) -> io.BytesIO

  // ExtendedDump(self
  // OCP.OCP.TDF.TDF_Label.ExtendedDump (method)
  ExtendedDump(self: OCP.OCP.TDF.TDF_Label, anOS: io.BytesIO, aFilter: OCP.OCP.TDF.TDF_IDFilter, aMap: OCP.OCP.TDF.TDF_AttributeIndexedMap) -> None

  // EntryDump(self
  // OCP.OCP.TDF.TDF_Label.EntryDump (method)
  EntryDump(self: OCP.OCP.TDF.TDF_Label, anOS: io.BytesIO) -> None

  // FindAttribute(self
  // OCP.OCP.TDF.TDF_Label.FindAttribute (method)
  FindAttribute(self: OCP.OCP.TDF.TDF_Label, GUID: OCP.OCP.Standard.Standard_GUID, Attribute: OCP.OCP.TDF.TDF_Attribute) -> bool

// Purpose
TDF_LabelSequence

  // __init__(*args, **kwargs)
  // OCP.OCP.TDF.TDF_LabelSequence.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TDF.TDF_LabelSequence) -> None
  __init__(self: OCP.OCP.TDF.TDF_LabelSequence, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None
  __init__(self: OCP.OCP.TDF.TDF_LabelSequence, theOther: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // Size(self
  // OCP.OCP.TDF.TDF_LabelSequence.Size (method)
  Size(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // Length(self
  // OCP.OCP.TDF.TDF_LabelSequence.Length (method)
  Length(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // Lower(self
  // OCP.OCP.TDF.TDF_LabelSequence.Lower (method)
  Lower(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // Upper(self
  // OCP.OCP.TDF.TDF_LabelSequence.Upper (method)
  Upper(self: OCP.OCP.TDF.TDF_LabelSequence) -> int

  // IsEmpty(self
  // OCP.OCP.TDF.TDF_LabelSequence.IsEmpty (method)
  IsEmpty(self: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // Reverse(self
  // OCP.OCP.TDF.TDF_LabelSequence.Reverse (method)
  Reverse(self: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // Exchange(self
  // OCP.OCP.TDF.TDF_LabelSequence.Exchange (method)
  Exchange(self: OCP.OCP.TDF.TDF_LabelSequence, I: int, J: int) -> None

  // Clear(self
  // OCP.OCP.TDF.TDF_LabelSequence.Clear (method)
  Clear(self: OCP.OCP.TDF.TDF_LabelSequence, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator = None) -> None

  // Assign(self
  // OCP.OCP.TDF.TDF_LabelSequence.Assign (method)
  Assign(self: OCP.OCP.TDF.TDF_LabelSequence, theOther: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_LabelSequence

  // Remove(*args, **kwargs)
  // OCP.OCP.TDF.TDF_LabelSequence.Remove (method)
  Remove(*args, **kwargs)
  Remove(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int) -> None
  Remove(self: OCP.OCP.TDF.TDF_LabelSequence, theFromIndex: int, theToIndex: int) -> None

  // Append(*args, **kwargs)
  // OCP.OCP.TDF.TDF_LabelSequence.Append (method)
  Append(*args, **kwargs)
  Append(self: OCP.OCP.TDF.TDF_LabelSequence, theItem: OCP.OCP.TDF.TDF_Label) -> None
  Append(self: OCP.OCP.TDF.TDF_LabelSequence, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // Prepend(*args, **kwargs)
  // OCP.OCP.TDF.TDF_LabelSequence.Prepend (method)
  Prepend(*args, **kwargs)
  Prepend(self: OCP.OCP.TDF.TDF_LabelSequence, theItem: OCP.OCP.TDF.TDF_Label) -> None
  Prepend(self: OCP.OCP.TDF.TDF_LabelSequence, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // InsertBefore(*args, **kwargs)
  // OCP.OCP.TDF.TDF_LabelSequence.InsertBefore (method)
  InsertBefore(*args, **kwargs)
  InsertBefore(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None
  InsertBefore(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // InsertAfter(*args, **kwargs)
  // OCP.OCP.TDF.TDF_LabelSequence.InsertAfter (method)
  InsertAfter(*args, **kwargs)
  InsertAfter(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None
  InsertAfter(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None

  // Split(self
  // OCP.OCP.TDF.TDF_LabelSequence.Split (method)
  Split(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theSeq: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // First(self
  // OCP.OCP.TDF.TDF_LabelSequence.First (method)
  First(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // ChangeFirst(self
  // OCP.OCP.TDF.TDF_LabelSequence.ChangeFirst (method)
  ChangeFirst(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // Last(self
  // OCP.OCP.TDF.TDF_LabelSequence.Last (method)
  Last(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // ChangeLast(self
  // OCP.OCP.TDF.TDF_LabelSequence.ChangeLast (method)
  ChangeLast(self: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TDF.TDF_Label

  // Value(self
  // OCP.OCP.TDF.TDF_LabelSequence.Value (method)
  Value(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int) -> OCP.OCP.TDF.TDF_Label

  // ChangeValue(self
  // OCP.OCP.TDF.TDF_LabelSequence.ChangeValue (method)
  ChangeValue(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int) -> OCP.OCP.TDF.TDF_Label

  // SetValue(self
  // OCP.OCP.TDF.TDF_LabelSequence.SetValue (method)
  SetValue(self: OCP.OCP.TDF.TDF_LabelSequence, theIndex: int, theItem: OCP.OCP.TDF.TDF_Label) -> None

  // delNode_s(theNode
  // OCP.OCP.TDF.TDF_LabelSequence.delNode_s (method)
  delNode_s(theNode: NCollection_SeqNode, theAl: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None
