# build123d — TCollection

2 top-level symbols. Signatures are verbatim python.

// Class defines a variable-length sequence of 8-bit characters
TCollection_AsciiString

  // __init__(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, message: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, message: str, aLen: int) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, aChar: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, length: int, filler: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, value: int) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, value: float) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString, message: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString, message: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString, message: OCP.OCP.TCollection.TCollection_AsciiString) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_ExtendedString, replaceNonAscii: str = '\x00') -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, theStringUtf: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, arg0: str) -> None

  // AssignCat(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.AssignCat (method)
  AssignCat(*args, **kwargs)
  AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: int) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: float) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Capitalize(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Capitalize (method)
  Capitalize(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Cat(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.Cat (method)
  Cat(*args, **kwargs)
  Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> OCP.OCP.TCollection.TCollection_AsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: int) -> OCP.OCP.TCollection.TCollection_AsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: float) -> OCP.OCP.TCollection.TCollection_AsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> OCP.OCP.TCollection.TCollection_AsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> OCP.OCP.TCollection.TCollection_AsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> OCP.OCP.TCollection.TCollection_AsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: int) -> OCP.OCP.TCollection.TCollection_AsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: float) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Center(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Center (method)
  Center(self: OCP.OCP.TCollection.TCollection_AsciiString, Width: int, Filler: str) -> None

  // ChangeAll(self
  // OCP.OCP.TCollection.TCollection_AsciiString.ChangeAll (method)
  ChangeAll(self: OCP.OCP.TCollection.TCollection_AsciiString, aChar: str, NewChar: str, CaseSensitive: bool = True) -> None

  // Clear(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Clear (method)
  Clear(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Copy(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.Copy (method)
  Copy(*args, **kwargs)
  Copy(self: OCP.OCP.TCollection.TCollection_AsciiString, fromwhere: str) -> None
  Copy(self: OCP.OCP.TCollection.TCollection_AsciiString, fromwhere: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Swap(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Swap (method)
  Swap(self: OCP.OCP.TCollection.TCollection_AsciiString, theOther: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // FirstLocationInSet(self
  // OCP.OCP.TCollection.TCollection_AsciiString.FirstLocationInSet (method)
  FirstLocationInSet(self: OCP.OCP.TCollection.TCollection_AsciiString, Set: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> int

  // FirstLocationNotInSet(self
  // OCP.OCP.TCollection.TCollection_AsciiString.FirstLocationNotInSet (method)
  FirstLocationNotInSet(self: OCP.OCP.TCollection.TCollection_AsciiString, Set: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> int

  // Insert(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.Insert (method)
  Insert(*args, **kwargs)
  Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
  Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
  Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // InsertAfter(self
  // OCP.OCP.TCollection.TCollection_AsciiString.InsertAfter (method)
  InsertAfter(self: OCP.OCP.TCollection.TCollection_AsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // InsertBefore(self
  // OCP.OCP.TCollection.TCollection_AsciiString.InsertBefore (method)
  InsertBefore(self: OCP.OCP.TCollection.TCollection_AsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // IsEmpty(self
  // OCP.OCP.TCollection.TCollection_AsciiString.IsEmpty (method)
  IsEmpty(self: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IsEqual(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.IsEqual (method)
  IsEqual(*args, **kwargs)
  IsEqual(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
  IsEqual(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IsDifferent(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.IsDifferent (method)
  IsDifferent(*args, **kwargs)
  IsDifferent(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
  IsDifferent(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IsLess(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.IsLess (method)
  IsLess(*args, **kwargs)
  IsLess(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
  IsLess(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IsGreater(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.IsGreater (method)
  IsGreater(*args, **kwargs)
  IsGreater(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
  IsGreater(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // StartsWith(self
  // OCP.OCP.TCollection.TCollection_AsciiString.StartsWith (method)
  StartsWith(self: OCP.OCP.TCollection.TCollection_AsciiString, theStartString: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // EndsWith(self
  // OCP.OCP.TCollection.TCollection_AsciiString.EndsWith (method)
  EndsWith(self: OCP.OCP.TCollection.TCollection_AsciiString, theEndString: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IntegerValue(self
  // OCP.OCP.TCollection.TCollection_AsciiString.IntegerValue (method)
  IntegerValue(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // IsIntegerValue(self
  // OCP.OCP.TCollection.TCollection_AsciiString.IsIntegerValue (method)
  IsIntegerValue(self: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IsRealValue(self
  // OCP.OCP.TCollection.TCollection_AsciiString.IsRealValue (method)
  IsRealValue(self: OCP.OCP.TCollection.TCollection_AsciiString, theToCheckFull: bool = False) -> bool

  // IsAscii(self
  // OCP.OCP.TCollection.TCollection_AsciiString.IsAscii (method)
  IsAscii(self: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // LeftAdjust(self
  // OCP.OCP.TCollection.TCollection_AsciiString.LeftAdjust (method)
  LeftAdjust(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // LeftJustify(self
  // OCP.OCP.TCollection.TCollection_AsciiString.LeftJustify (method)
  LeftJustify(self: OCP.OCP.TCollection.TCollection_AsciiString, Width: int, Filler: str) -> None

  // Length(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.Length (method)
  Length(*args, **kwargs)
  Length(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int
  Length(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // Location(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.Location (method)
  Location(*args, **kwargs)
  Location(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> int
  Location(self: OCP.OCP.TCollection.TCollection_AsciiString, N: int, C: str, FromIndex: int, ToIndex: int) -> int

  // LowerCase(self
  // OCP.OCP.TCollection.TCollection_AsciiString.LowerCase (method)
  LowerCase(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Prepend(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Prepend (method)
  Prepend(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Print(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Print (method)
  Print(self: OCP.OCP.TCollection.TCollection_AsciiString, astream: io.BytesIO) -> None

  // Read(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Read (method)
  Read(self: OCP.OCP.TCollection.TCollection_AsciiString, astream: io.BytesIO) -> None

  // RealValue(self
  // OCP.OCP.TCollection.TCollection_AsciiString.RealValue (method)
  RealValue(self: OCP.OCP.TCollection.TCollection_AsciiString) -> float

  // RemoveAll(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.RemoveAll (method)
  RemoveAll(*args, **kwargs)
  RemoveAll(self: OCP.OCP.TCollection.TCollection_AsciiString, C: str, CaseSensitive: bool) -> None
  RemoveAll(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> None

  // Remove(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Remove (method)
  Remove(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, ahowmany: int = 1) -> None

  // RightAdjust(self
  // OCP.OCP.TCollection.TCollection_AsciiString.RightAdjust (method)
  RightAdjust(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // RightJustify(self
  // OCP.OCP.TCollection.TCollection_AsciiString.RightJustify (method)
  RightJustify(self: OCP.OCP.TCollection.TCollection_AsciiString, Width: int, Filler: str) -> None

  // Search(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.Search (method)
  Search(*args, **kwargs)
  Search(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> int
  Search(self: OCP.OCP.TCollection.TCollection_AsciiString, what: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // SearchFromEnd(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.SearchFromEnd (method)
  SearchFromEnd(*args, **kwargs)
  SearchFromEnd(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> int
  SearchFromEnd(self: OCP.OCP.TCollection.TCollection_AsciiString, what: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // SetValue(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.SetValue (method)
  SetValue(*args, **kwargs)
  SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
  SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
  SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Split(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Split (method)
  Split(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // SubString(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.SubString (method)
  SubString(*args, **kwargs)
  SubString(self: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString
  SubString(self: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // ToCString(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.ToCString (method)
  ToCString(*args, **kwargs)
  ToCString(self: OCP.OCP.TCollection.TCollection_AsciiString) -> str
  ToCString(self: OCP.OCP.TCollection.TCollection_AsciiString) -> str

  // Token(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Token (method)
  Token(self: OCP.OCP.TCollection.TCollection_AsciiString, separators: str = ' \t', whichone: int = 1) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Trunc(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Trunc (method)
  Trunc(self: OCP.OCP.TCollection.TCollection_AsciiString, ahowmany: int) -> None

  // UpperCase(self
  // OCP.OCP.TCollection.TCollection_AsciiString.UpperCase (method)
  UpperCase(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // UsefullLength(self
  // OCP.OCP.TCollection.TCollection_AsciiString.UsefullLength (method)
  UsefullLength(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // Value(self
  // OCP.OCP.TCollection.TCollection_AsciiString.Value (method)
  Value(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int) -> str

  // HashCode(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.HashCode (method)
  HashCode(*args, **kwargs)
  HashCode(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int
  HashCode(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // IsEqual_s(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_AsciiString.IsEqual_s (method)
  IsEqual_s(*args, **kwargs)
  IsEqual_s(string1: OCP.OCP.TCollection.TCollection_AsciiString, string2: OCP.OCP.TCollection.TCollection_AsciiString) -> bool
  IsEqual_s(string1: OCP.OCP.TCollection.TCollection_AsciiString, string2: str) -> bool

  // IsSameString_s(theString1
  // OCP.OCP.TCollection.TCollection_AsciiString.IsSameString_s (method)
  IsSameString_s(theString1: OCP.OCP.TCollection.TCollection_AsciiString, theString2: OCP.OCP.TCollection.TCollection_AsciiString, theIsCaseSensitive: bool) -> bool

// A variable-length sequence of "extended" (UNICODE) characters (16-bit character type)
TCollection_ExtendedString

  // __init__(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_ExtendedString.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: str, isMultiByte: bool = False) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, theStringUtf: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, aChar: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, aChar: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, length: int, filler: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, value: int) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, value: float) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: OCP.OCP.TCollection.TCollection_ExtendedString) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: OCP.OCP.TCollection.TCollection_AsciiString, isMultiByte: bool = True) -> None

  // AssignCat(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_ExtendedString.AssignCat (method)
  AssignCat(*args, **kwargs)
  AssignCat(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_ExtendedString, theChar: str) -> None

  // Cat(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Cat (method)
  Cat(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // ChangeAll(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.ChangeAll (method)
  ChangeAll(self: OCP.OCP.TCollection.TCollection_ExtendedString, aChar: str, NewChar: str) -> None

  // Clear(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Clear (method)
  Clear(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // Copy(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Copy (method)
  Copy(self: OCP.OCP.TCollection.TCollection_ExtendedString, fromwhere: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // Swap(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Swap (method)
  Swap(self: OCP.OCP.TCollection.TCollection_ExtendedString, theOther: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // Insert(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_ExtendedString.Insert (method)
  Insert(*args, **kwargs)
  Insert(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: str) -> None
  Insert(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // IsEmpty(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.IsEmpty (method)
  IsEmpty(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // IsEqual(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_ExtendedString.IsEqual (method)
  IsEqual(*args, **kwargs)
  IsEqual(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
  IsEqual(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // IsDifferent(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_ExtendedString.IsDifferent (method)
  IsDifferent(*args, **kwargs)
  IsDifferent(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
  IsDifferent(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // IsLess(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_ExtendedString.IsLess (method)
  IsLess(*args, **kwargs)
  IsLess(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
  IsLess(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // IsGreater(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_ExtendedString.IsGreater (method)
  IsGreater(*args, **kwargs)
  IsGreater(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
  IsGreater(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // StartsWith(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.StartsWith (method)
  StartsWith(self: OCP.OCP.TCollection.TCollection_ExtendedString, theStartString: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // EndsWith(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.EndsWith (method)
  EndsWith(self: OCP.OCP.TCollection.TCollection_ExtendedString, theEndString: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // IsAscii(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.IsAscii (method)
  IsAscii(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // Length(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Length (method)
  Length(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

  // Print(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Print (method)
  Print(self: OCP.OCP.TCollection.TCollection_ExtendedString, astream: io.BytesIO) -> None

  // RemoveAll(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.RemoveAll (method)
  RemoveAll(self: OCP.OCP.TCollection.TCollection_ExtendedString, what: str) -> None

  // Remove(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Remove (method)
  Remove(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, ahowmany: int = 1) -> None

  // Search(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Search (method)
  Search(self: OCP.OCP.TCollection.TCollection_ExtendedString, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

  // SearchFromEnd(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.SearchFromEnd (method)
  SearchFromEnd(self: OCP.OCP.TCollection.TCollection_ExtendedString, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

  // SetValue(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_ExtendedString.SetValue (method)
  SetValue(*args, **kwargs)
  SetValue(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: str) -> None
  SetValue(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // Split(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Split (method)
  Split(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // Token(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Token (method)
  Token(self: OCP.OCP.TCollection.TCollection_ExtendedString, separators: str, whichone: int = 1) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // ToExtString(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.ToExtString (method)
  ToExtString(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> str

  // Trunc(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Trunc (method)
  Trunc(self: OCP.OCP.TCollection.TCollection_ExtendedString, ahowmany: int) -> None

  // Value(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.Value (method)
  Value(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int) -> str

  // HashCode(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.HashCode (method)
  HashCode(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

  // LengthOfCString(self
  // OCP.OCP.TCollection.TCollection_ExtendedString.LengthOfCString (method)
  LengthOfCString(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

  // IsEqual_s(theString1
  // OCP.OCP.TCollection.TCollection_ExtendedString.IsEqual_s (method)
  IsEqual_s(theString1: OCP.OCP.TCollection.TCollection_ExtendedString, theString2: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool
