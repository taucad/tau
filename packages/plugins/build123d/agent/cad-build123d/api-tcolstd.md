# build123d — TColStd

1 top-level symbols. Signatures are verbatim python.

// Purpose
TColStd_IndexedDataMapOfStringString

  // __init__(*args, **kwargs)
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None
  __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theNbBuckets: int, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator = None) -> None
  __init__(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theOther: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None

  // Exchange(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Exchange (method)
  Exchange(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theOther: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None

  // Assign(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Assign (method)
  Assign(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theOther: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString

  // ReSize(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.ReSize (method)
  ReSize(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, N: int) -> None

  // Add(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Add (method)
  Add(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString, theItem: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // Contains(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Contains (method)
  Contains(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // Substitute(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Substitute (method)
  Substitute(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int, theKey1: OCP.OCP.TCollection.TCollection_AsciiString, theItem: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Swap(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Swap (method)
  Swap(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex1: int, theIndex2: int) -> None

  // RemoveLast(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.RemoveLast (method)
  RemoveLast(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> None

  // RemoveFromIndex(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.RemoveFromIndex (method)
  RemoveFromIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> None

  // RemoveKey(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.RemoveKey (method)
  RemoveKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // FindKey(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.FindKey (method)
  FindKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // FindFromIndex(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.FindFromIndex (method)
  FindFromIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // ChangeFromIndex(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.ChangeFromIndex (method)
  ChangeFromIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // FindIndex(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.FindIndex (method)
  FindIndex(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // FindFromKey(*args, **kwargs)
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.FindFromKey (method)
  FindFromKey(*args, **kwargs)
  FindFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString
  FindFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString, theValue: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // ChangeFromKey(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.ChangeFromKey (method)
  ChangeFromKey(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Seek(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Seek (method)
  Seek(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // ChangeSeek(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.ChangeSeek (method)
  ChangeSeek(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theKey1: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Clear(*args, **kwargs)
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Clear (method)
  Clear(*args, **kwargs)
  Clear(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, doReleaseMemory: bool = False) -> None
  Clear(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theAllocator: OCP.OCP.NCollection.NCollection_BaseAllocator) -> None

  // Size(self
  // OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString.Size (method)
  Size(self: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString) -> int
