# build123d — TCollection (3)

1 top-level symbols. Signatures are verbatim python.

// Category: TCollection
// A variable-length sequence of ASCII characters (normal 8-bit character type)
TCollection_HAsciiString

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None 2. __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, message: str) -> None 3. __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, aChar: str) -> None 4. __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, length: int, filler: str) -> None 5. __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, value: int) -> None 6. __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, value: float) -> None 7. __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, aString: OCP.OCP.TCollection.TCollection_AsciiString) -> None 8. __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, aString: OCP.OCP.TCollection.TCollection_HAsciiString) -> None 9. __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, aString: OCP.OCP.TCollection.TCollection_HExtendedString, replaceNonAscii: str) -> None 10. __init__(self: OCP.OCP.TCollection.TCollection_HAsciiString, arg0: str) -> None
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
  // Remarks: Overloaded function. 1. AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> None Appends <other> to me. 2. AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None Appends <other> to me. Example: aString = aString + anotherString 3. AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> None Appends <other> to me. 4. AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None Appends <other> to me. Example: aString = aString + anotherString
  // OCP.OCP.TCollection.TCollection_HAsciiString.AssignCat (method)
  AssignCat(*args, **kwargs)
  AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Capitalize(self
  // Remarks: Converts the first character into its corresponding upper-case character and the other characters into lowercase. Example: before me = "hellO " after me = "Hello "
  // OCP.OCP.TCollection.TCollection_HAsciiString.Capitalize (method)
  Capitalize(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Cat(*args, **kwargs)
  // Remarks: Overloaded function. 1. Cat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> OCP.OCP.TCollection.TCollection_HAsciiString Creates a new string by concatenation of this ASCII string and the other ASCII string. Example: aString = aString + anotherString aString = aString + "Dummy" aString contains "I say " aString = aString + "Hello " + "Dolly" gives "I say Hello Dolly" Warning: To catenate more than one CString, you must put a String before. So the following example is WRONG ! aString = "Hello " + "Dolly" THIS IS NOT ALLOWED This rule is applicable to AssignCat (operator +=) too. 2. Cat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_HAsciiString Creates a new string by concatenation of this ASCII string and the other ASCII string. Example: aString = aString + anotherString
  // OCP.OCP.TCollection.TCollection_HAsciiString.Cat (method)
  Cat(*args, **kwargs)
  Cat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: str) -> OCP.OCP.TCollection.TCollection_HAsciiString
  Cat(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // Center(self
  // Remarks: Modifies this ASCII string so that its length becomes equal to Width and the new characters are equal to Filler. New characters are added both at the beginning and at the end of this string. If Width is less than the length of this ASCII string, nothing happens. Example Handle(TCollection_HAsciiString) myAlphabet = new TCollection_HAsciiString ("abcdef"); myAlphabet->Center(9,' '); assert ( !strcmp( myAlphabet->ToCString(), " abcdef ") );
  // OCP.OCP.TCollection.TCollection_HAsciiString.Center (method)
  Center(self: OCP.OCP.TCollection.TCollection_HAsciiString, Width: int, Filler: str) -> None

  // ChangeAll(self
  // Remarks: Replaces all characters equal to aChar by NewChar in this ASCII string. The substitution is case sensitive if CaseSensitive is true (default value). If you do not use the default case sensitive option, it does not matter whether aChar is upper-case or not. Example Handle(TCollection_HAsciiString) myMistake = new TCollection_HAsciiString ("Hather"); myMistake->ChangeAll('H','F'); assert ( !strcmp( myMistake->ToCString(), "Father") );
  // OCP.OCP.TCollection.TCollection_HAsciiString.ChangeAll (method)
  ChangeAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, aChar: str, NewChar: str, CaseSensitive: bool = True) -> None

  // Clear(self
  // Remarks: Removes all characters contained in <me>. This produces an empty HAsciiString.
  // OCP.OCP.TCollection.TCollection_HAsciiString.Clear (method)
  Clear(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // FirstLocationInSet(self
  // Remarks: Returns the index of the first character of <me> that is present in <Set>. The search begins to the index FromIndex and ends to the the index ToIndex. Returns zero if failure. Raises an exception if FromIndex or ToIndex is out of range Example: before me = "aabAcAa", S = "Aa", FromIndex = 1, Toindex = 7 after me = "aabAcAa" returns 1
  // OCP.OCP.TCollection.TCollection_HAsciiString.FirstLocationInSet (method)
  FirstLocationInSet(self: OCP.OCP.TCollection.TCollection_HAsciiString, Set: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> int

  // FirstLocationNotInSet(self
  // Remarks: Returns the index of the first character of <me> that is not present in the set <Set>. The search begins to the index FromIndex and ends to the the index ToIndex in <me>. Returns zero if failure. Raises an exception if FromIndex or ToIndex is out of range. Example: before me = "aabAcAa", S = "Aa", FromIndex = 1, Toindex = 7 after me = "aabAcAa" returns 3
  // OCP.OCP.TCollection.TCollection_HAsciiString.FirstLocationNotInSet (method)
  FirstLocationNotInSet(self: OCP.OCP.TCollection.TCollection_HAsciiString, Set: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> int

  // Insert(*args, **kwargs)
  // Remarks: Overloaded function. 1. Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None Insert a Character at position <where>. Example: aString contains "hy not ?" aString.Insert(1,'W'); gives "Why not ?" aString contains "Wh" aString.Insert(3,'y'); gives "Why" aString contains "Way" aString.Insert(2,'h'); gives "Why" 2. Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None Insert a HAsciiString at position <where>. 3. Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> None Insert a HAsciiString at position <where>.
  // OCP.OCP.TCollection.TCollection_HAsciiString.Insert (method)
  Insert(*args, **kwargs)
  Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
  Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
  Insert(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // InsertAfter(self
  // Remarks: Inserts the other ASCII string a after a specific index in the string <me> Example: before me = "cde" , Index = 0 , other = "ab" after me = "abcde" , other = "ab"
  // OCP.OCP.TCollection.TCollection_HAsciiString.InsertAfter (method)
  InsertAfter(self: OCP.OCP.TCollection.TCollection_HAsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // InsertBefore(self
  // Remarks: Inserts the other ASCII string a before a specific index in the string <me> Raises an exception if Index is out of bounds Example: before me = "cde" , Index = 1 , other = "ab" after me = "abcde" , other = "ab"
  // OCP.OCP.TCollection.TCollection_HAsciiString.InsertBefore (method)
  InsertBefore(self: OCP.OCP.TCollection.TCollection_HAsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // IsEmpty(self
  // Remarks: Returns True if the string <me> contains zero character
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsEmpty (method)
  IsEmpty(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsLess(self
  // Remarks: Returns TRUE if <me> is 'ASCII' less than <other>.
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsLess (method)
  IsLess(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsGreater(self
  // Remarks: Returns TRUE if <me> is 'ASCII' greater than <other>.
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsGreater (method)
  IsGreater(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IntegerValue(self
  // Remarks: Converts a HAsciiString containing a numeric expression to an Integer. Example: "215" returns 215.
  // OCP.OCP.TCollection.TCollection_HAsciiString.IntegerValue (method)
  IntegerValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

  // IsIntegerValue(self
  // Remarks: Returns True if the string contains an integer value.
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsIntegerValue (method)
  IsIntegerValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsRealValue(self
  // Remarks: Returns True if the string contains a real value.
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsRealValue (method)
  IsRealValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsAscii(self
  // Remarks: Returns True if the string contains only ASCII characters between ' ' and '~'. This means no control character and no extended ASCII code.
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsAscii (method)
  IsAscii(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsDifferent(self
  // Remarks: Returns True if the string S not contains same characters than the string <me>.
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsDifferent (method)
  IsDifferent(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool

  // IsSameString(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsSameString(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool Returns True if the string S contains same characters than the string <me>. 2. IsSameString(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString, CaseSensitive: bool) -> bool Returns True if the string S contains same characters than the string <me>.
  // OCP.OCP.TCollection.TCollection_HAsciiString.IsSameString (method)
  IsSameString(*args, **kwargs)
  IsSameString(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString) -> bool
  IsSameString(self: OCP.OCP.TCollection.TCollection_HAsciiString, S: OCP.OCP.TCollection.TCollection_HAsciiString, CaseSensitive: bool) -> bool

  // LeftAdjust(self
  // Remarks: Removes all space characters in the beginning of the string
  // OCP.OCP.TCollection.TCollection_HAsciiString.LeftAdjust (method)
  LeftAdjust(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // LeftJustify(self
  // Remarks: Left justify. Length becomes equal to Width and the new characters are equal to Filler if Width < Length nothing happens Raises an exception if Width is less than zero Example: before me = "abcdef" , Width = 9 , Filler = ' ' after me = "abcdef "
  // OCP.OCP.TCollection.TCollection_HAsciiString.LeftJustify (method)
  LeftJustify(self: OCP.OCP.TCollection.TCollection_HAsciiString, Width: int, Filler: str) -> None

  // Length(*args, **kwargs)
  // Remarks: Overloaded function. 1. Length(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int Returns number of characters in <me>. This is the same functionality as 'strlen' in C. 2. Length(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int Returns number of characters in <me>. This is the same functionality as 'strlen' in C.
  // OCP.OCP.TCollection.TCollection_HAsciiString.Length (method)
  Length(*args, **kwargs)
  Length(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int
  Length(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

  // Location(*args, **kwargs)
  // Remarks: Overloaded function. 1. Location(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> int returns an index in the string <me> of the first occurrence of the string S in the string <me> from the starting index FromIndex to the ending index ToIndex returns zero if failure Raises an exception if FromIndex or ToIndex is out of range. Example: before me = "aabAaAa", S = "Aa", FromIndex = 1, ToIndex = 7 after me = "aabAaAa" returns 4 2. Location(self: OCP.OCP.TCollection.TCollection_HAsciiString, N: int, C: str, FromIndex: int, ToIndex: int) -> int Returns the index of the nth occurrence of the character C in the string <me> from the starting index FromIndex to the ending index ToIndex. Returns zero if failure. Raises an exception if FromIndex or ToIndex is out of range Example: before me = "aabAa", N = 3, C = 'a', FromIndex = 1, ToIndex = 5 after me = "aabAa" returns 5
  // OCP.OCP.TCollection.TCollection_HAsciiString.Location (method)
  Location(*args, **kwargs)
  Location(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> int
  Location(self: OCP.OCP.TCollection.TCollection_HAsciiString, N: int, C: str, FromIndex: int, ToIndex: int) -> int

  // LowerCase(self
  // Remarks: Converts <me> to its lower-case equivalent.
  // OCP.OCP.TCollection.TCollection_HAsciiString.LowerCase (method)
  LowerCase(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Prepend(self
  // Remarks: Inserts the other string at the beginning of the string <me> Example: before me = "cde" , S = "ab" after me = "abcde" , S = "ab"
  // OCP.OCP.TCollection.TCollection_HAsciiString.Prepend (method)
  Prepend(self: OCP.OCP.TCollection.TCollection_HAsciiString, other: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Print(self
  // Remarks: Prints this string on the stream <astream>.
  // OCP.OCP.TCollection.TCollection_HAsciiString.Print (method)
  Print(self: OCP.OCP.TCollection.TCollection_HAsciiString, astream: io.BytesIO) -> None

  // RealValue(self
  // Remarks: Converts a string containing a numeric expression to a Real. Example: "215" returns 215.0. "3.14159267" returns 3.14159267.
  // OCP.OCP.TCollection.TCollection_HAsciiString.RealValue (method)
  RealValue(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> float

  // RemoveAll(*args, **kwargs)
  // Remarks: Overloaded function. 1. RemoveAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, C: str, CaseSensitive: bool) -> None Remove all the occurrences of the character C in the string Example: before me = "HellLLo", C = 'L' , CaseSensitive = True after me = "Hello" 2. RemoveAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> None Removes every <what> characters from <me>
  // OCP.OCP.TCollection.TCollection_HAsciiString.RemoveAll (method)
  RemoveAll(*args, **kwargs)
  RemoveAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, C: str, CaseSensitive: bool) -> None
  RemoveAll(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> None

  // Remove(self
  // Remarks: Erases <ahowmany> characters from position <where>, <where> included. Example: aString contains "Hello" aString.Erase(2,2) erases 2 characters from position 1 This gives "Hlo".
  // OCP.OCP.TCollection.TCollection_HAsciiString.Remove (method)
  Remove(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, ahowmany: int = 1) -> None

  // RightAdjust(self
  // Remarks: Removes all space characters at the end of the string.
  // OCP.OCP.TCollection.TCollection_HAsciiString.RightAdjust (method)
  RightAdjust(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // RightJustify(self
  // Remarks: Right justify. Length becomes equal to Width and the new characters are equal to Filler if Width < Length nothing happens Raises an exception if Width is less than zero Example: before me = "abcdef" , Width = 9 , Filler = ' ' after me = " abcdef"
  // OCP.OCP.TCollection.TCollection_HAsciiString.RightJustify (method)
  RightJustify(self: OCP.OCP.TCollection.TCollection_HAsciiString, Width: int, Filler: str) -> None

  // Search(*args, **kwargs)
  // Remarks: Overloaded function. 1. Search(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> int Searches a CString in <me> from the beginning and returns position of first item <what> matching. It returns -1 if not found. Example: aString contains "Sample single test" aString.Search("le") returns 5 2. Search(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> int Searches a String in <me> from the beginning and returns position of first item <what> matching. it returns -1 if not found.
  // OCP.OCP.TCollection.TCollection_HAsciiString.Search (method)
  Search(*args, **kwargs)
  Search(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> int
  Search(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

  // SearchFromEnd(*args, **kwargs)
  // Remarks: Overloaded function. 1. SearchFromEnd(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> int Searches a CString in a String from the end and returns position of first item <what> matching. It returns -1 if not found. Example: aString contains "Sample single test" aString.SearchFromEnd("le") returns 12 2. SearchFromEnd(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> int Searches a HAsciiString in another HAsciiString from the end and returns position of first item <what> matching. It returns -1 if not found.
  // OCP.OCP.TCollection.TCollection_HAsciiString.SearchFromEnd (method)
  SearchFromEnd(*args, **kwargs)
  SearchFromEnd(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: str) -> int
  SearchFromEnd(self: OCP.OCP.TCollection.TCollection_HAsciiString, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

  // SetValue(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None Replaces one character in the string at position <where>. If <where> is less than zero or greater than the length of <me> an exception is raised. Example: aString contains "Garbake" astring.Replace(6,'g') gives <me> = "Garbage" 2. SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None Replaces a part of <me> in the string at position <where>. If <where> is less than zero or greater than the length of <me> an exception is raised. Example: aString contains "Garbake" astring.Replace(6,'g') gives <me> = "Garbage" 3. SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> None Replaces a part of <me> by another string.
  // OCP.OCP.TCollection.TCollection_HAsciiString.SetValue (method)
  SetValue(*args, **kwargs)
  SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
  SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: str) -> None
  SetValue(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int, what: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Split(self
  // Remarks: Splits a HAsciiString into two sub-strings. Example: aString contains "abcdefg" aString.Split(3) gives <me> = "abc" and returns "defg"
  // OCP.OCP.TCollection.TCollection_HAsciiString.Split (method)
  Split(self: OCP.OCP.TCollection.TCollection_HAsciiString, where: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SubString(self
  // Remarks: Creation of a sub-string of the string <me>. The sub-string starts to the index Fromindex and ends to the index ToIndex. Raises an exception if ToIndex or FromIndex is out of bounds Example: before me = "abcdefg", ToIndex=3, FromIndex=6 after me = "abcdefg" returns "cdef"
  // OCP.OCP.TCollection.TCollection_HAsciiString.SubString (method)
  SubString(self: OCP.OCP.TCollection.TCollection_HAsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // ToCString(*args, **kwargs)
  // Remarks: Overloaded function. 1. ToCString(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> str Returns pointer to string (char *) This is useful for some casual manipulations Because this "char *" is 'const', you can't modify its contents. 2. ToCString(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> str Returns pointer to string (char *) This is useful for some casual manipulations Because this "char *" is 'const', you can't modify its contents.
  // OCP.OCP.TCollection.TCollection_HAsciiString.ToCString (method)
  ToCString(*args, **kwargs)
  ToCString(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> str
  ToCString(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> str

  // Token(self
  // Remarks: Extracts <whichone> token from <me>. By default, the <separators> is set to space and tabulation. By default, the token extracted is the first one (whichone = 1). <separators> contains all separators you need. If no token indexed by <whichone> is found, it returns an empty String. Example: aString contains "This is a message" aString.Token() returns "This" aString.Token(" ",4) returns "message" aString.Token(" ",2) returns "is" aString.Token(" ",9) returns "" Other separators than space character and tabulation are allowed aString contains "1234; test:message , value" aString.Token("; :,",4) returns "value" aString.Token("; :,",2) returns "test"
  // OCP.OCP.TCollection.TCollection_HAsciiString.Token (method)
  Token(self: OCP.OCP.TCollection.TCollection_HAsciiString, separators: str = ' \t', whichone: int = 1) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // Trunc(self
  // Remarks: Truncates <me> to <ahowmany> characters. Example: me = "Hello Dolly" -> Trunc(3) -> me = "Hel"
  // OCP.OCP.TCollection.TCollection_HAsciiString.Trunc (method)
  Trunc(self: OCP.OCP.TCollection.TCollection_HAsciiString, ahowmany: int) -> None

  // UpperCase(self
  // Remarks: Converts <me> to its upper-case equivalent.
  // OCP.OCP.TCollection.TCollection_HAsciiString.UpperCase (method)
  UpperCase(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // UsefullLength(self
  // Remarks: Length of the string ignoring all spaces (' ') and the control character at the end.
  // OCP.OCP.TCollection.TCollection_HAsciiString.UsefullLength (method)
  UsefullLength(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> int

  // Value(self
  // Remarks: Returns character at position <where> in <me>. If <where> is less than zero or greater than the length of <me>, an exception is raised. Example: aString contains "Hello" aString.Value(2) returns 'e'
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
  // Remarks: Overloaded function. 1. String(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString Returns the field myString. 2. String(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString Returns the field myString.
  // OCP.OCP.TCollection.TCollection_HAsciiString.String (method)
  String(*args, **kwargs)
  String(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString
  String(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

  // DynamicType(self
  // OCP.OCP.TCollection.TCollection_HAsciiString.DynamicType (method)
  DynamicType(self: OCP.OCP.TCollection.TCollection_HAsciiString) -> OCP.OCP.Standard.Standard_Type
