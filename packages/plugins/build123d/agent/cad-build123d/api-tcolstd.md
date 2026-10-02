# build123d — TColStd

1 top-level symbols. Signatures are verbatim python.

// Category: TColStd
// Purpose
TColStd_IndexedDataMapOfStringString

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None 2. __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theNbBuckets: int, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator = None) -> None 3. __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theOther: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None
  __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theNbBuckets: int, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator = None) -> None
  __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theOther: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None

  // Exchange(self
  // Remarks: Exchange the content of two maps without re-allocations. Notice that allocators will be swapped as well!
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Exchange (method)
  Exchange(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theOther: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None

  // Assign(self
  // Remarks: Assignment. This method does not change the internal allocator.
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Assign (method)
  Assign(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theOther: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString

  // ReSize(self
  // Remarks: ReSize
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.ReSize (method)
  ReSize(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, N: int) -> None

  // Add(self
  // Remarks: Returns the Index of already bound Key or appends new Key with specified Item value.
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Add (method)
  Add(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString, theItem: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // Contains(self
  // Remarks: Contains
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Contains (method)
  Contains(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // Substitute(self
  // Remarks: Substitute
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Substitute (method)
  Substitute(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int, theKey1: OCP.OCP.TCollection.TCollection_AsciiString, theItem: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Swap(self
  // Remarks: Swaps two elements with the given indices.
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Swap (method)
  Swap(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex1: int, theIndex2: int) -> None

  // RemoveLast(self
  // Remarks: RemoveLast
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.RemoveLast (method)
  RemoveLast(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None

  // RemoveFromIndex(self
  // Remarks: Remove the key of the given index. Caution! The index of the last key can be changed.
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.RemoveFromIndex (method)
  RemoveFromIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> None

  // RemoveKey(self
  // Remarks: Remove the given key. Caution! The index of the last key can be changed.
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.RemoveKey (method)
  RemoveKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // FindKey(self
  // Remarks: FindKey
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.FindKey (method)
  FindKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // FindFromIndex(self
  // Remarks: FindFromIndex
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.FindFromIndex (method)
  FindFromIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // ChangeFromIndex(self
  // Remarks: ChangeFromIndex
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.ChangeFromIndex (method)
  ChangeFromIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // FindIndex(self
  // Remarks: FindIndex
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.FindIndex (method)
  FindIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // FindFromKey(*args, **kwargs)
  // Remarks: Overloaded function. 1. FindFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString FindFromKey 2. FindFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString, theValue: OCP.OCP.TCollection.TCollection_AsciiString) -> bool Find value for key with copying.
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.FindFromKey (method)
  FindFromKey(*args, **kwargs)
  FindFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString
  FindFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString, theValue: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // ChangeFromKey(self
  // Remarks: ChangeFromKey
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.ChangeFromKey (method)
  ChangeFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Seek(self
  // Remarks: Seek returns pointer to Item by Key. Returns NULL if Key was not found.
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Seek (method)
  Seek(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // ChangeSeek(self
  // Remarks: ChangeSeek returns modifiable pointer to Item by Key. Returns NULL if Key was not found.
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.ChangeSeek (method)
  ChangeSeek(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Clear(*args, **kwargs)
  // Remarks: Overloaded function. 1. Clear(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, doReleaseMemory: bool = False) -> None Clear data. If doReleaseMemory is false then the table of buckets is not released and will be reused. 2. Clear(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None Clear data and reset allocator
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Clear (method)
  Clear(*args, **kwargs)
  Clear(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, doReleaseMemory: bool = False) -> None
  Clear(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None

  // Size(self
  // Remarks: Size
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Size (method)
  Size(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> int
