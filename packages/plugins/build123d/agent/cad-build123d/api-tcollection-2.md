# build123d — TCollection (2)

1 top-level symbols. Signatures are verbatim python.

// A variable-length sequence of ASCII characters (normal 8-bit character type)
TCollection_HAsciiString

  // __init__(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, message: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, aChar: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, length: int, filler: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, value: int) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, value: float) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, aString: OCP.OCP.TCollection.TCollection_AsciiString) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, aString: OCP.OCP.TCollection.TCollection_HAsciiString) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, aString: OCP.OCP.TCollection.TCollection_HExtendedString, replaceNonAscii: str) -> None
  __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, arg0: str) -> None

  // AssignCat(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.AssignCat (method)
  AssignCat(*args, **kwargs)
  AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Capitalize(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.Capitalize (method)
  Capitalize(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Cat(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.Cat (method)
  Cat(*args, **kwargs)
  Cat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> OCP.OCP.TCollection.TCollection_HAsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // Center(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.Center (method)
  Center(self: OCP.OCP.TCollection.TCollection_HAsciiString, Width: int, Filler: str) -> None

  // ChangeAll(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.ChangeAll (method)
  ChangeAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, aChar: str, NewChar: str, CaseSensitive: bool = True) -> None

  // Clear(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.Clear (method)
  Clear(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // FirstLocationInSet(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.FirstLocationInSet (method)
  FirstLocationInSet(self: OCP.OCP.TCollection.TCollection_HAsciiString, Set: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> int

  // FirstLocationNotInSet(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.FirstLocationNotInSet (method)
  FirstLocationNotInSet(self: OCP.OCP.TCollection.TCollection_HAsciiString, Set: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> int

  // Insert(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.Insert (method)
  Insert(*args, **kwargs)
  Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
  Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
  Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // InsertAfter(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.InsertAfter (method)
  InsertAfter(self: OCP.OCP.TCollection.TCollection_HAsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // InsertBefore(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.InsertBefore (method)
  InsertBefore(self: OCP.OCP.TCollection.TCollection_HAsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // IsEmpty(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsEmpty (method)
  IsEmpty(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsLess(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsLess (method)
  IsLess(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsGreater(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsGreater (method)
  IsGreater(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IntegerValue(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.IntegerValue (method)
  IntegerValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

  // IsIntegerValue(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsIntegerValue (method)
  IsIntegerValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsRealValue(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsRealValue (method)
  IsRealValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsAscii(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsAscii (method)
  IsAscii(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsDifferent(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsDifferent (method)
  IsDifferent(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsSameString(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsSameString (method)
  IsSameString(*args, **kwargs)
  IsSameString(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool
  IsSameString(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString, CaseSensitive: bool) -> bool

  // LeftAdjust(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.LeftAdjust (method)
  LeftAdjust(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // LeftJustify(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.LeftJustify (method)
  LeftJustify(self: OCP.OCP.TCollection.TCollection_HAsciiString, Width: int, Filler: str) -> None

  // Length(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.Length (method)
  Length(*args, **kwargs)
  Length(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int
  Length(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

  // Location(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.Location (method)
  Location(*args, **kwargs)
  Location(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> int
  Location(self: OCP.OCP.TCollection.TCollection_HAsciiString, N: int, C: str, FromIndex: int, ToIndex: int) -> int

  // LowerCase(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.LowerCase (method)
  LowerCase(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Prepend(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.Prepend (method)
  Prepend(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Print(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.Print (method)
  Print(self: OCP.OCP.TCollection.TCollection_HAsciiString, astream: io.BytesIO) -> None

  // RealValue(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.RealValue (method)
  RealValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> float

  // RemoveAll(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.RemoveAll (method)
  RemoveAll(*args, **kwargs)
  RemoveAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, C: str, CaseSensitive: bool) -> None
  RemoveAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> None

  // Remove(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.Remove (method)
  Remove(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, ahowmany: int = 1) -> None

  // RightAdjust(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.RightAdjust (method)
  RightAdjust(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // RightJustify(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.RightJustify (method)
  RightJustify(self: OCP.OCP.TCollection.TCollection_HAsciiString, Width: int, Filler: str) -> None

  // Search(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.Search (method)
  Search(*args, **kwargs)
  Search(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> int
  Search(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

  // SearchFromEnd(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.SearchFromEnd (method)
  SearchFromEnd(*args, **kwargs)
  SearchFromEnd(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> int
  SearchFromEnd(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

  // SetValue(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.SetValue (method)
  SetValue(*args, **kwargs)
  SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
  SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
  SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Split(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.Split (method)
  Split(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SubString(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.SubString (method)
  SubString(self: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // ToCString(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.ToCString (method)
  ToCString(*args, **kwargs)
  ToCString(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> str
  ToCString(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> str

  // Token(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.Token (method)
  Token(self: OCP.OCP.TCollection.TCollection_HAsciiString, separators: str = ' \t', whichone: int = 1) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // Trunc(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.Trunc (method)
  Trunc(self: OCP.OCP.TCollection.TCollection_HAsciiString, ahowmany: int) -> None

  // UpperCase(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.UpperCase (method)
  UpperCase(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // UsefullLength(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.UsefullLength (method)
  UsefullLength(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

  // Value(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.Value (method)
  Value(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int) -> str

  // IsSameState(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsSameState (method)
  IsSameState(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // get_type_name_s() -> str
  // OCP.OCP.TCollection.TCollection_HAsciiString.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.TCollection.TCollection_HAsciiString.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // String(*args, **kwargs)
  // OCP.OCP.TCollection.TCollection_HAsciiString.String (method)
  String(*args, **kwargs)
  String(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString
  String(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // DynamicType(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.DynamicType (method)
  DynamicType(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.Standard.Standard_Type
