# build123d — TColStd

1 top-level symbols. Signatures are verbatim python.

// Purpose
TColStd_IndexedDataMapOfStringString

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None
  __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theNbBuckets: int, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator = None) -> None
  __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theOther: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None

  // Exchange(self
  Exchange(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theOther: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None

  // Assign(self
  Assign(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theOther: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString

  // ReSize(self
  ReSize(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, N: int) -> None

  // Add(self
  Add(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString, theItem: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // Contains(self
  Contains(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // Substitute(self
  Substitute(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int, theKey1: OCP.OCP.TCollection.TCollection_AsciiString, theItem: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Swap(self
  Swap(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex1: int, theIndex2: int) -> None

  // RemoveLast(self
  RemoveLast(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None

  // RemoveFromIndex(self
  RemoveFromIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> None

  // RemoveKey(self
  RemoveKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // FindKey(self
  FindKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // FindFromIndex(self
  FindFromIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // ChangeFromIndex(self
  ChangeFromIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // FindIndex(self
  FindIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // FindFromKey(*args, **kwargs)
  FindFromKey(*args, **kwargs)
  FindFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString
  FindFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString, theValue: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // ChangeFromKey(self
  ChangeFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Seek(self
  Seek(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // ChangeSeek(self
  ChangeSeek(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Clear(*args, **kwargs)
  Clear(*args, **kwargs)
  Clear(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, doReleaseMemory: bool = False) -> None
  Clear(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None

  // Size(self
  Size(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> int
