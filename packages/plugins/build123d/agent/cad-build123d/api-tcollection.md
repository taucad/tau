# build123d — TCollection

2 top-level symbols. Signatures are verbatim python.

// Class defines a variable-length sequence of 8-bit characters
TCollection_AsciiString

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, message: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, message: str, aLen: int) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, aChar: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, length: int, filler: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, value: int) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, value: float) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString, message: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString, message: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString, message: OCP.OCP.TCollection.TCollection_AsciiString) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_ExtendedString, replaceNonAscii: str = '\x00') -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, theStringUtf: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_AsciiString, arg0: str) -> None

// AssignCat(*args, \*\*kwargs)
AssignCat(*args, \*\*kwargs)
AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> None
AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: int) -> None
AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: float) -> None
AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> None
AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// Capitalize(self
Capitalize(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// Cat(*args, \*\*kwargs)
Cat(*args, \*\*kwargs)
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
Center(self: OCP.OCP.TCollection.TCollection_AsciiString, Width: int, Filler: str) -> None

// ChangeAll(self
ChangeAll(self: OCP.OCP.TCollection.TCollection_AsciiString, aChar: str, NewChar: str, CaseSensitive: bool = True) -> None

// Clear(self
Clear(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// Copy(*args, \*\*kwargs)
Copy(*args, \*\*kwargs)
Copy(self: OCP.OCP.TCollection.TCollection_AsciiString, fromwhere: str) -> None
Copy(self: OCP.OCP.TCollection.TCollection_AsciiString, fromwhere: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// Swap(self
Swap(self: OCP.OCP.TCollection.TCollection_AsciiString, theOther: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// FirstLocationInSet(self
FirstLocationInSet(self: OCP.OCP.TCollection.TCollection_AsciiString, Set: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> int

// FirstLocationNotInSet(self
FirstLocationNotInSet(self: OCP.OCP.TCollection.TCollection_AsciiString, Set: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> int

// Insert(*args, \*\*kwargs)
Insert(*args, \*\*kwargs)
Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// InsertAfter(self
InsertAfter(self: OCP.OCP.TCollection.TCollection_AsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// InsertBefore(self
InsertBefore(self: OCP.OCP.TCollection.TCollection_AsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// IsEmpty(self
IsEmpty(self: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

// IsEqual(*args, \*\*kwargs)
IsEqual(*args, \*\*kwargs)
IsEqual(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
IsEqual(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

// IsDifferent(*args, \*\*kwargs)
IsDifferent(*args, \*\*kwargs)
IsDifferent(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
IsDifferent(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

// IsLess(*args, \*\*kwargs)
IsLess(*args, \*\*kwargs)
IsLess(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
IsLess(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

// IsGreater(*args, \*\*kwargs)
IsGreater(*args, \*\*kwargs)
IsGreater(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
IsGreater(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

// StartsWith(self
StartsWith(self: OCP.OCP.TCollection.TCollection_AsciiString, theStartString: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

// EndsWith(self
EndsWith(self: OCP.OCP.TCollection.TCollection_AsciiString, theEndString: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

// IntegerValue(self
IntegerValue(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

// IsIntegerValue(self
IsIntegerValue(self: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

// IsRealValue(self
IsRealValue(self: OCP.OCP.TCollection.TCollection_AsciiString, theToCheckFull: bool = False) -> bool

// IsAscii(self
IsAscii(self: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

// LeftAdjust(self
LeftAdjust(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// LeftJustify(self
LeftJustify(self: OCP.OCP.TCollection.TCollection_AsciiString, Width: int, Filler: str) -> None

// Length(*args, \*\*kwargs)
Length(*args, \*\*kwargs)
Length(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int
Length(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

// Location(*args, \*\*kwargs)
Location(*args, \*\*kwargs)
Location(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> int
Location(self: OCP.OCP.TCollection.TCollection_AsciiString, N: int, C: str, FromIndex: int, ToIndex: int) -> int

// LowerCase(self
LowerCase(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// Prepend(self
Prepend(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// Print(self
Print(self: OCP.OCP.TCollection.TCollection_AsciiString, astream: io.BytesIO) -> None

// Read(self
Read(self: OCP.OCP.TCollection.TCollection_AsciiString, astream: io.BytesIO) -> None

// RealValue(self
RealValue(self: OCP.OCP.TCollection.TCollection_AsciiString) -> float

// RemoveAll(*args, \*\*kwargs)
RemoveAll(*args, \*\*kwargs)
RemoveAll(self: OCP.OCP.TCollection.TCollection_AsciiString, C: str, CaseSensitive: bool) -> None
RemoveAll(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> None

// Remove(self
Remove(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, ahowmany: int = 1) -> None

// RightAdjust(self
RightAdjust(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// RightJustify(self
RightJustify(self: OCP.OCP.TCollection.TCollection_AsciiString, Width: int, Filler: str) -> None

// Search(*args, \*\*kwargs)
Search(*args, \*\*kwargs)
Search(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> int
Search(self: OCP.OCP.TCollection.TCollection_AsciiString, what: OCP.OCP.TCollection.TCollection_AsciiString) -> int

// SearchFromEnd(*args, \*\*kwargs)
SearchFromEnd(*args, \*\*kwargs)
SearchFromEnd(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> int
SearchFromEnd(self: OCP.OCP.TCollection.TCollection_AsciiString, what: OCP.OCP.TCollection.TCollection_AsciiString) -> int

// SetValue(*args, \*\*kwargs)
SetValue(*args, \*\*kwargs)
SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// Split(self
Split(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int) -> OCP.OCP.TCollection.TCollection_AsciiString

// SubString(*args, \*\*kwargs)
SubString(*args, \*\*kwargs)
SubString(self: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString
SubString(self: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

// ToCString(*args, \*\*kwargs)
ToCString(*args, \*\*kwargs)
ToCString(self: OCP.OCP.TCollection.TCollection_AsciiString) -> str
ToCString(self: OCP.OCP.TCollection.TCollection_AsciiString) -> str

// Token(self
Token(self: OCP.OCP.TCollection.TCollection_AsciiString, separators: str = ' \t', whichone: int = 1) -> OCP.OCP.TCollection.TCollection_AsciiString

// Trunc(self
Trunc(self: OCP.OCP.TCollection.TCollection_AsciiString, ahowmany: int) -> None

// UpperCase(self
UpperCase(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// UsefullLength(self
UsefullLength(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

// Value(self
Value(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int) -> str

// HashCode(*args, \*\*kwargs)
HashCode(*args, \*\*kwargs)
HashCode(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int
HashCode(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

// IsEqual_s(*args, \*\*kwargs)
IsEqual_s(*args, \*\*kwargs)
IsEqual_s(string1: OCP.OCP.TCollection.TCollection_AsciiString, string2: OCP.OCP.TCollection.TCollection_AsciiString) -> bool
IsEqual_s(string1: OCP.OCP.TCollection.TCollection_AsciiString, string2: str) -> bool

// IsSameString_s(theString1
IsSameString_s(theString1: OCP.OCP.TCollection.TCollection_AsciiString, theString2: OCP.OCP.TCollection.TCollection_AsciiString, theIsCaseSensitive: bool) -> bool

// A variable-length sequence of "extended" (UNICODE) characters (16-bit character type)
TCollection_ExtendedString

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> None
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: str, isMultiByte: bool = False) -> None
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString, theStringUtf: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString, aChar: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString, aChar: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString, length: int, filler: str) -> None
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString, value: int) -> None
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString, value: float) -> None
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: OCP.OCP.TCollection.TCollection_ExtendedString) -> None
**init**(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: OCP.OCP.TCollection.TCollection_AsciiString, isMultiByte: bool = True) -> None

// AssignCat(*args, \*\*kwargs)
AssignCat(*args, \*\*kwargs)
AssignCat(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> None
AssignCat(self: OCP.OCP.TCollection.TCollection_ExtendedString, theChar: str) -> None

// Cat(self
Cat(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TCollection.TCollection_ExtendedString

// ChangeAll(self
ChangeAll(self: OCP.OCP.TCollection.TCollection_ExtendedString, aChar: str, NewChar: str) -> None

// Clear(self
Clear(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

// Copy(self
Copy(self: OCP.OCP.TCollection.TCollection_ExtendedString, fromwhere: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

// Swap(self
Swap(self: OCP.OCP.TCollection.TCollection_ExtendedString, theOther: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

// Insert(*args, \*\*kwargs)
Insert(*args, \*\*kwargs)
Insert(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: str) -> None
Insert(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

// IsEmpty(self
IsEmpty(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

// IsEqual(*args, \*\*kwargs)
IsEqual(*args, \*\*kwargs)
IsEqual(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
IsEqual(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

// IsDifferent(*args, \*\*kwargs)
IsDifferent(*args, \*\*kwargs)
IsDifferent(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
IsDifferent(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

// IsLess(*args, \*\*kwargs)
IsLess(*args, \*\*kwargs)
IsLess(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
IsLess(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

// IsGreater(*args, \*\*kwargs)
IsGreater(*args, \*\*kwargs)
IsGreater(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
IsGreater(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

// StartsWith(self
StartsWith(self: OCP.OCP.TCollection.TCollection_ExtendedString, theStartString: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

// EndsWith(self
EndsWith(self: OCP.OCP.TCollection.TCollection_ExtendedString, theEndString: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

// IsAscii(self
IsAscii(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

// Length(self
Length(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

// Print(self
Print(self: OCP.OCP.TCollection.TCollection_ExtendedString, astream: io.BytesIO) -> None

// RemoveAll(self
RemoveAll(self: OCP.OCP.TCollection.TCollection_ExtendedString, what: str) -> None

// Remove(self
Remove(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, ahowmany: int = 1) -> None

// Search(self
Search(self: OCP.OCP.TCollection.TCollection_ExtendedString, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

// SearchFromEnd(self
SearchFromEnd(self: OCP.OCP.TCollection.TCollection_ExtendedString, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

// SetValue(*args, \*\*kwargs)
SetValue(*args, \*\*kwargs)
SetValue(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: str) -> None
SetValue(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

// Split(self
Split(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int) -> OCP.OCP.TCollection.TCollection_ExtendedString

// Token(self
Token(self: OCP.OCP.TCollection.TCollection_ExtendedString, separators: str, whichone: int = 1) -> OCP.OCP.TCollection.TCollection_ExtendedString

// ToExtString(self
ToExtString(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> str

// Trunc(self
Trunc(self: OCP.OCP.TCollection.TCollection_ExtendedString, ahowmany: int) -> None

// Value(self
Value(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int) -> str

// HashCode(self
HashCode(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

// LengthOfCString(self
LengthOfCString(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

// IsEqual_s(theString1
IsEqual_s(theString1: OCP.OCP.TCollection.TCollection_ExtendedString, theString2: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool
