# build123d — TCollection (2)

1 top-level symbols. Signatures are verbatim python.

// A variable-length sequence of ASCII characters (normal 8-bit character type)
TCollection_HAsciiString

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None
**init**(self: OCP.OCP.TCollection.TCollection_HAsciiString, message: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_HAsciiString, aChar: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_HAsciiString, length: int, filler: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_HAsciiString, value: int) -> None
**init**(self: OCP.OCP.TCollection.TCollection_HAsciiString, value: float) -> None
**init**(self: OCP.OCP.TCollection.TCollection_HAsciiString, aString: OCP.OCP.TCollection.TCollection_AsciiString) -> None
**init**(self: OCP.OCP.TCollection.TCollection_HAsciiString, aString: OCP.OCP.TCollection.TCollection_HAsciiString) -> None
**init**(self: OCP.OCP.TCollection.TCollection_HAsciiString, aString: OCP.OCP.TCollection.TCollection_HExtendedString, replaceNonAscii: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_HAsciiString, arg0: str) -> None

// AssignCat(*args, \*\*kwargs)
AssignCat(*args, \*\*kwargs)
AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> None
AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None
AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> None
AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// Capitalize(self
Capitalize(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// Cat(*args, \*\*kwargs)
Cat(*args, \*\*kwargs)
Cat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> OCP.OCP.TCollection.TCollection_HAsciiString
Cat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_HAsciiString

// Center(self
Center(self: OCP.OCP.TCollection.TCollection_HAsciiString, Width: int, Filler: str) -> None

// ChangeAll(self
ChangeAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, aChar: str, NewChar: str, CaseSensitive: bool = True) -> None

// Clear(self
Clear(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// FirstLocationInSet(self
FirstLocationInSet(self: OCP.OCP.TCollection.TCollection_HAsciiString, Set: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> int

// FirstLocationNotInSet(self
FirstLocationNotInSet(self: OCP.OCP.TCollection.TCollection_HAsciiString, Set: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> int

// Insert(*args, \*\*kwargs)
Insert(*args, \*\*kwargs)
Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// InsertAfter(self
InsertAfter(self: OCP.OCP.TCollection.TCollection_HAsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// InsertBefore(self
InsertBefore(self: OCP.OCP.TCollection.TCollection_HAsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// IsEmpty(self
IsEmpty(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

// IsLess(self
IsLess(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

// IsGreater(self
IsGreater(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

// IntegerValue(self
IntegerValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

// IsIntegerValue(self
IsIntegerValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

// IsRealValue(self
IsRealValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

// IsAscii(self
IsAscii(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

// IsDifferent(self
IsDifferent(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

// IsSameString(*args, \*\*kwargs)
IsSameString(*args, \*\*kwargs)
IsSameString(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool
IsSameString(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString, CaseSensitive: bool) -> bool

// LeftAdjust(self
LeftAdjust(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// LeftJustify(self
LeftJustify(self: OCP.OCP.TCollection.TCollection_HAsciiString, Width: int, Filler: str) -> None

// Length(*args, \*\*kwargs)
Length(*args, \*\*kwargs)
Length(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int
Length(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

// Location(*args, \*\*kwargs)
Location(*args, \*\*kwargs)
Location(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> int
Location(self: OCP.OCP.TCollection.TCollection_HAsciiString, N: int, C: str, FromIndex: int, ToIndex: int) -> int

// LowerCase(self
LowerCase(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// Prepend(self
Prepend(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// Print(self
Print(self: OCP.OCP.TCollection.TCollection_HAsciiString, astream: io.BytesIO) -> None

// RealValue(self
RealValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> float

// RemoveAll(*args, \*\*kwargs)
RemoveAll(*args, \*\*kwargs)
RemoveAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, C: str, CaseSensitive: bool) -> None
RemoveAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> None

// Remove(self
Remove(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, ahowmany: int = 1) -> None

// RightAdjust(self
RightAdjust(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// RightJustify(self
RightJustify(self: OCP.OCP.TCollection.TCollection_HAsciiString, Width: int, Filler: str) -> None

// Search(*args, \*\*kwargs)
Search(*args, \*\*kwargs)
Search(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> int
Search(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

// SearchFromEnd(*args, \*\*kwargs)
SearchFromEnd(*args, \*\*kwargs)
SearchFromEnd(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> int
SearchFromEnd(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

// SetValue(*args, \*\*kwargs)
SetValue(*args, \*\*kwargs)
SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// Split(self
Split(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

// SubString(self
SubString(self: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

// ToCString(*args, \*\*kwargs)
ToCString(*args, \*\*kwargs)
ToCString(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> str
ToCString(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> str

// Token(self
Token(self: OCP.OCP.TCollection.TCollection_HAsciiString, separators: str = ' \t', whichone: int = 1) -> OCP.OCP.TCollection.TCollection_HAsciiString

// Trunc(self
Trunc(self: OCP.OCP.TCollection.TCollection_HAsciiString, ahowmany: int) -> None

// UpperCase(self
UpperCase(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

// UsefullLength(self
UsefullLength(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

// Value(self
Value(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int) -> str

// IsSameState(self
IsSameState(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// String(*args, \*\*kwargs)
String(*args, \*\*kwargs)
String(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString
String(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

// DynamicType(self
DynamicType(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.Standard.Standard_Type
