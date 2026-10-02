# build123d — TCollection (2)

1 top-level symbols. Signatures are verbatim python.

// Category: TCollection
// A variable-length sequence of "extended" (UNICODE) characters (16-bit character type)
TCollection_ExtendedString

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> None 2. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: str, isMultiByte: bool = False) -> None 3. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: str) -> None 4. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, theStringUtf: str) -> None 5. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, aChar: str) -> None 6. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, aChar: str) -> None 7. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, length: int, filler: str) -> None 8. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, value: int) -> None 9. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, value: float) -> None 10. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: OCP.OCP.TCollection.TCollection_ExtendedString) -> None 11. __init__(self: OCP.OCP.TCollection.TCollection_ExtendedString, astring: OCP.OCP.TCollection.TCollection_AsciiString, isMultiByte: bool = True) -> None
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
  // Remarks: Overloaded function. 1. AssignCat(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> None Appends the other extended string to this extended string. Note that this method is an alias of operator +=. Example: aString += anotherString 2. AssignCat(self: OCP.OCP.TCollection.TCollection_ExtendedString, theChar: str) -> None Appends the utf16 char to this extended string.
  AssignCat(*args, **kwargs)
  AssignCat(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_ExtendedString, theChar: str) -> None

  // Cat(self
  // Remarks: Appends <other> to me.
  Cat(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // ChangeAll(self
  // Remarks: Substitutes all the characters equal to aChar by NewChar in the ExtendedString <me>. The substitution can be case sensitive. If you don't use default case sensitive, no matter whether aChar is uppercase or not.
  ChangeAll(self: OCP.OCP.TCollection.TCollection_ExtendedString, aChar: str, NewChar: str) -> None

  // Clear(self
  // Remarks: Removes all characters contained in <me>. This produces an empty ExtendedString.
  Clear(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // Copy(self
  // Remarks: Copy <fromwhere> to <me>. Used as operator =
  Copy(self: OCP.OCP.TCollection.TCollection_ExtendedString, fromwhere: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // Swap(self
  // Remarks: Exchange the data of two strings (without reallocating memory).
  Swap(self: OCP.OCP.TCollection.TCollection_ExtendedString, theOther: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // Insert(*args, **kwargs)
  // Remarks: Overloaded function. 1. Insert(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: str) -> None Insert a Character at position <where>. 2. Insert(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> None Insert a ExtendedString at position <where>.
  Insert(*args, **kwargs)
  Insert(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: str) -> None
  Insert(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // IsEmpty(self
  // Remarks: Returns True if this string contains no characters.
  IsEmpty(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // IsEqual(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsEqual(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool Returns true if the characters in this extended string are identical to the characters in the other extended string. Note that this method is an alias of operator == 2. IsEqual(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool Returns true if the characters in this extended string are identical to the characters in the other extended string. Note that this method is an alias of operator ==
  IsEqual(*args, **kwargs)
  IsEqual(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
  IsEqual(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // IsDifferent(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsDifferent(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool Returns true if there are differences between the characters in this extended string and the other extended string. Note that this method is an alias of operator !=. 2. IsDifferent(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool Returns true if there are differences between the characters in this extended string and the other extended string. Note that this method is an alias of operator !=.
  IsDifferent(*args, **kwargs)
  IsDifferent(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
  IsDifferent(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // IsLess(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsLess(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool Returns TRUE if <me> is less than <other>. 2. IsLess(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool Returns TRUE if <me> is less than <other>.
  IsLess(*args, **kwargs)
  IsLess(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
  IsLess(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // IsGreater(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsGreater(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool Returns TRUE if <me> is greater than <other>. 2. IsGreater(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool Returns TRUE if <me> is greater than <other>.
  IsGreater(*args, **kwargs)
  IsGreater(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: str) -> bool
  IsGreater(self: OCP.OCP.TCollection.TCollection_ExtendedString, other: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // StartsWith(self
  // Remarks: Determines whether the beginning of this string instance matches the specified string.
  StartsWith(self: OCP.OCP.TCollection.TCollection_ExtendedString, theStartString: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // EndsWith(self
  // Remarks: Determines whether the end of this string instance matches the specified string.
  EndsWith(self: OCP.OCP.TCollection.TCollection_ExtendedString, theEndString: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // IsAscii(self
  // Remarks: Returns True if the ExtendedString contains only "Ascii Range" characters .
  IsAscii(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool

  // Length(self
  // Remarks: Returns the number of 16-bit code units (might be greater than number of Unicode symbols if string contains surrogate pairs).
  Length(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

  // Print(self
  // Remarks: Displays <me> .
  Print(self: OCP.OCP.TCollection.TCollection_ExtendedString, astream: io.BytesIO) -> None

  // RemoveAll(self
  // Remarks: Removes every <what> characters from <me>.
  RemoveAll(self: OCP.OCP.TCollection.TCollection_ExtendedString, what: str) -> None

  // Remove(self
  // Remarks: Erases <ahowmany> characters from position <where>,<where> included.
  Remove(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, ahowmany: int = 1) -> None

  // Search(self
  // Remarks: Searches a ExtendedString in <me> from the beginning and returns position of first item <what> matching. it returns -1 if not found.
  Search(self: OCP.OCP.TCollection.TCollection_ExtendedString, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

  // SearchFromEnd(self
  // Remarks: Searches a ExtendedString in another ExtendedString from the end and returns position of first item <what> matching. it returns -1 if not found.
  SearchFromEnd(self: OCP.OCP.TCollection.TCollection_ExtendedString, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

  // SetValue(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetValue(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: str) -> None Replaces one character in the ExtendedString at position <where>. If <where> is less than zero or greater than the length of <me> an exception is raised. 2. SetValue(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> None Replaces a part of <me> by another ExtendedString see above.
  SetValue(*args, **kwargs)
  SetValue(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: str) -> None
  SetValue(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int, what: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // Split(self
  // Remarks: Splits this extended string into two sub-strings at position where. - The second sub-string (from position where + 1 of this string to the end) is returned in a new extended string. - this extended string is modified: its last characters are removed, it becomes equal to the first sub-string (from the first character to position where). Example: aString contains "abcdefg" aString.Split(3) gives <me> = "abc" and returns "defg"
  Split(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // Token(self
  // Remarks: Extracts <whichone> token from <me>. By default, the <separators> is set to space and tabulation. By default, the token extracted is the first one (whichone = 1). <separators> contains all separators you need. If no token indexed by <whichone> is found, it returns an empty AsciiString. Example: aString contains "This is a message" aString.Token() returns "This" aString.Token(" ",4) returns "message" aString.Token(" ",2) returns "is" aString.Token(" ",9) returns "" Other separators than space character and tabulation are allowed : aString contains "1234; test:message , value" aString.Token("; :,",4) returns "value" aString.Token("; :,",2) returns "test"
  Token(self: OCP.OCP.TCollection.TCollection_ExtendedString, separators: str, whichone: int = 1) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // ToExtString(self
  // Remarks: Returns pointer to ExtString
  ToExtString(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> str

  // Trunc(self
  // Remarks: Truncates <me> to <ahowmany> characters. Example: me = "Hello Dolly" -> Trunc(3) -> me = "Hel" Exceptions Standard_OutOfRange if ahowmany is greater than the length of this string.
  Trunc(self: OCP.OCP.TCollection.TCollection_ExtendedString, ahowmany: int) -> None

  // Value(self
  // Remarks: Returns character at position <where> in <me>. If <where> is less than zero or greater than the length of <me>, an exception is raised. Example: aString contains "Hello" aString.Value(2) returns 'e' Exceptions Standard_OutOfRange if where lies outside the bounds of this extended string.
  Value(self: OCP.OCP.TCollection.TCollection_ExtendedString, where: int) -> str

  // HashCode(self
  // Remarks: Returns a hashed value for the extended string. Note: if string is ASCII, the computed value is the same as the value computed with the HashCode function on a TCollection_AsciiString string composed with equivalent ASCII characters.
  HashCode(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

  // LengthOfCString(self
  // Remarks: Returns expected CString length in UTF8 coding. It can be used for memory calculation before converting to CString containing symbols in UTF8 coding.
  LengthOfCString(self: OCP.OCP.TCollection.TCollection_ExtendedString) -> int

  // IsEqual_s(theString1
  // Remarks: Returns true if the characters in this extended string are identical to the characters in the other extended string. Note that this method is an alias of operator ==.
  IsEqual_s(theString1: OCP.OCP.TCollection.TCollection_ExtendedString, theString2: OCP.OCP.TCollection.TCollection_ExtendedString) -> bool
