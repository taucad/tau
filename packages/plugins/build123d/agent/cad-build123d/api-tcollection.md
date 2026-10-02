# build123d — TCollection

1 top-level symbols. Signatures are verbatim python.

// Category: TCollection
// Class defines a variable-length sequence of 8-bit characters
TCollection_AsciiString

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

2. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, message: str) -> None

3. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, message: str, aLen: int) -> None

4. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, aChar: str) -> None

5. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, length: int, filler: str) -> None

6. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, value: int) -> None

7. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, value: float) -> None

8. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString) -> None

9. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString, message: str) -> None

10. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString, message: str) -> None

11. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_AsciiString, message: OCP.OCP.TCollection.TCollection_AsciiString) -> None

12. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, astring: OCP.OCP.TCollection.TCollection_ExtendedString, replaceNonAscii: str = '\x00') -> None

13. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, theStringUtf: str) -> None

14. __init__(self: OCP.OCP.TCollection.TCollection_AsciiString, arg0: str) -> None
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
  // Remarks: Overloaded function.

1. AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> None

Appends <other> to me. This is an unary operator.

2. AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: int) -> None

Appends <other> to me. This is an unary operator.

3. AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: float) -> None

Appends <other> to me. This is an unary operator.

4. AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> None

Appends <other> to me. This is an unary operator. ex: aString += "Dummy" To catenate more than one CString, you must put a AsciiString before. Example: aString += "Hello " + "Dolly" IS NOT VALID ! But astring += anotherString + "Hello " + "Dolly" is valid.

5. AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

Appends <other> to me. This is an unary operator. Example: aString += anotherString
  AssignCat(*args, **kwargs)
  AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: int) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: float) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> None
  AssignCat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Capitalize(self
  // Remarks: Converts the first character into its corresponding upper-case character and the other characters into lowercase Example: before me = "hellO " after me = "Hello "
  Capitalize(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Cat(*args, **kwargs)
  // Remarks: Overloaded function.

1. Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> OCP.OCP.TCollection.TCollection_AsciiString

Appends <other> to me. Syntax: aString = aString + "Dummy" Example: aString contains "I say " aString = aString + "Hello " + "Dolly" gives "I say Hello Dolly" To catenate more than one CString, you must put a String before. So the following example is WRONG ! aString = "Hello " + "Dolly" THIS IS NOT ALLOWED This rule is applicable to AssignCat (operator +=) too.

2. Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: int) -> OCP.OCP.TCollection.TCollection_AsciiString

Appends <other> to me. Syntax: aString = aString + 15; Example: aString contains "I say " gives "I say 15" To catenate more than one CString, you must put a String before. So the following example is WRONG ! aString = "Hello " + "Dolly" THIS IS NOT ALLOWED This rule is applicable to AssignCat (operator +=) too.

3. Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: float) -> OCP.OCP.TCollection.TCollection_AsciiString

Appends <other> to me. Syntax: aString = aString + 15.15; Example: aString contains "I say " gives "I say 15.15" To catenate more than one CString, you must put a String before. So the following example is WRONG ! aString = "Hello " + "Dolly" THIS IS NOT ALLOWED This rule is applicable to AssignCat (operator +=) too.

4. Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> OCP.OCP.TCollection.TCollection_AsciiString

Appends <other> to me. Syntax: aString = aString + "Dummy" Example: aString contains "I say " aString = aString + "Hello " + "Dolly" gives "I say Hello Dolly" To catenate more than one CString, you must put a String before. So the following example is WRONG ! aString = "Hello " + "Dolly" THIS IS NOT ALLOWED This rule is applicable to AssignCat (operator +=) too.

5. Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

Appends <other> to me. Example: aString = aString + anotherString

6. Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> OCP.OCP.TCollection.TCollection_AsciiString

Appends <other> to me. Example: aString = aString + anotherString

7. Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> OCP.OCP.TCollection.TCollection_AsciiString

Appends <other> to me. Syntax: aString = aString + "Dummy" Example: aString contains "I say " aString = aString + "Hello " + "Dolly" gives "I say Hello Dolly" To catenate more than one CString, you must put a String before. So the following example is WRONG ! aString = "Hello " + "Dolly" THIS IS NOT ALLOWED This rule is applicable to AssignCat (operator +=) too.

8. Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> OCP.OCP.TCollection.TCollection_AsciiString

Appends <other> to me. Syntax: aString = aString + "Dummy" Example: aString contains "I say " aString = aString + "Hello " + "Dolly" gives "I say Hello Dolly" To catenate more than one CString, you must put a String before. So the following example is WRONG ! aString = "Hello " + "Dolly" THIS IS NOT ALLOWED This rule is applicable to AssignCat (operator +=) too.

9. Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: int) -> OCP.OCP.TCollection.TCollection_AsciiString

Appends <other> to me. Syntax: aString = aString + 15; Example: aString contains "I say " gives "I say 15" To catenate more than one CString, you must put a String before. So the following example is WRONG ! aString = "Hello " + "Dolly" THIS IS NOT ALLOWED This rule is applicable to AssignCat (operator +=) too.

10. Cat(self: OCP.OCP.TCollection.TCollection_AsciiString, other: float) -> OCP.OCP.TCollection.TCollection_AsciiString

Appends <other> to me. Syntax: aString = aString + 15.15; Example: aString contains "I say " gives "I say 15.15" To catenate more than one CString, you must put a String before. So the following example is WRONG ! aString = "Hello " + "Dolly" THIS IS NOT ALLOWED This rule is applicable to AssignCat (operator +=) too.
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
  // Remarks: Modifies this ASCII string so that its length becomes equal to Width and the new characters are equal to Filler. New characters are added both at the beginning and at the end of this string. If Width is less than the length of this ASCII string, nothing happens. Example TCollection_AsciiString myAlphabet("abcdef"); myAlphabet.Center(9,' '); assert ( myAlphabet == " abcdef " );
  Center(self: OCP.OCP.TCollection.TCollection_AsciiString, Width: int, Filler: str) -> None

  // ChangeAll(self
  // Remarks: Substitutes all the characters equal to aChar by NewChar in the AsciiString <me>. The substitution can be case sensitive. If you don't use default case sensitive, no matter whether aChar is uppercase or not. Example: me = "Histake" -> ChangeAll('H','M',Standard_True) gives me = "Mistake"
  ChangeAll(self: OCP.OCP.TCollection.TCollection_AsciiString, aChar: str, NewChar: str, CaseSensitive: bool = True) -> None

  // Clear(self
  // Remarks: Removes all characters contained in <me>. This produces an empty AsciiString.
  Clear(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Copy(*args, **kwargs)
  // Remarks: Overloaded function.

1. Copy(self: OCP.OCP.TCollection.TCollection_AsciiString, fromwhere: str) -> None

Copy <fromwhere> to <me>. Used as operator = Example: aString = anotherCString;

2. Copy(self: OCP.OCP.TCollection.TCollection_AsciiString, fromwhere: OCP.OCP.TCollection.TCollection_AsciiString) -> None

Copy <fromwhere> to <me>. Used as operator = Example: aString = anotherString;
  Copy(*args, **kwargs)
  Copy(self: OCP.OCP.TCollection.TCollection_AsciiString, fromwhere: str) -> None
  Copy(self: OCP.OCP.TCollection.TCollection_AsciiString, fromwhere: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Swap(self
  // Remarks: Exchange the data of two strings (without reallocating memory).
  Swap(self: OCP.OCP.TCollection.TCollection_AsciiString, theOther: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // FirstLocationInSet(self
  // Remarks: Returns the index of the first character of <me> that is present in <Set>. The search begins to the index FromIndex and ends to the the index ToIndex. Returns zero if failure. Raises an exception if FromIndex or ToIndex is out of range. Example: before me = "aabAcAa", S = "Aa", FromIndex = 1, Toindex = 7 after me = "aabAcAa" returns 1
  FirstLocationInSet(self: OCP.OCP.TCollection.TCollection_AsciiString, Set: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> int

  // FirstLocationNotInSet(self
  // Remarks: Returns the index of the first character of <me> that is not present in the set <Set>. The search begins to the index FromIndex and ends to the the index ToIndex in <me>. Returns zero if failure. Raises an exception if FromIndex or ToIndex is out of range. Example: before me = "aabAcAa", S = "Aa", FromIndex = 1, Toindex = 7 after me = "aabAcAa" returns 3
  FirstLocationNotInSet(self: OCP.OCP.TCollection.TCollection_AsciiString, Set: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> int

  // Insert(*args, **kwargs)
  // Remarks: Overloaded function.

1. Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None

Inserts a Character at position <where>. Example: aString contains "hy not ?" aString.Insert(1,'W'); gives "Why not ?" aString contains "Wh" aString.Insert(3,'y'); gives "Why" aString contains "Way" aString.Insert(2,'h'); gives "Why"

2. Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None

Inserts a CString at position <where>. Example: aString contains "O more" aString.Insert(2,"nce"); gives "Once more"

3. Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: OCP.OCP.TCollection.TCollection_AsciiString) -> None

Inserts a AsciiString at position <where>.
  Insert(*args, **kwargs)
  Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
  Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
  Insert(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // InsertAfter(self
  // Remarks: Pushing a string after a specific index in the string <me>. Raises an exception if Index is out of bounds. - less than 0 (InsertAfter), or less than 1 (InsertBefore), or - greater than the number of characters in this ASCII string. Example: before me = "cde" , Index = 0 , other = "ab" after me = "abcde" , other = "ab"
  InsertAfter(self: OCP.OCP.TCollection.TCollection_AsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // InsertBefore(self
  // Remarks: Pushing a string before a specific index in the string <me>. Raises an exception if Index is out of bounds. - less than 0 (InsertAfter), or less than 1 (InsertBefore), or - greater than the number of characters in this ASCII string. Example: before me = "cde" , Index = 1 , other = "ab" after me = "abcde" , other = "ab"
  InsertBefore(self: OCP.OCP.TCollection.TCollection_AsciiString, Index: int, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // IsEmpty(self
  // Remarks: Returns True if the string <me> contains zero character.
  IsEmpty(self: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IsEqual(*args, **kwargs)
  // Remarks: Overloaded function.

1. IsEqual(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool

Returns true if the characters in this ASCII string are identical to the characters in ASCII string other. Note that this method is an alias of operator ==.

2. IsEqual(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

Returns true if the characters in this ASCII string are identical to the characters in ASCII string other. Note that this method is an alias of operator ==.
  IsEqual(*args, **kwargs)
  IsEqual(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
  IsEqual(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IsDifferent(*args, **kwargs)
  // Remarks: Overloaded function.

1. IsDifferent(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool

Returns true if there are differences between the characters in this ASCII string and ASCII string other. Note that this method is an alias of operator !=

2. IsDifferent(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

Returns true if there are differences between the characters in this ASCII string and ASCII string other. Note that this method is an alias of operator !=
  IsDifferent(*args, **kwargs)
  IsDifferent(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
  IsDifferent(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IsLess(*args, **kwargs)
  // Remarks: Overloaded function.

1. IsLess(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool

Returns TRUE if <me> is 'ASCII' less than <other>.

2. IsLess(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

Returns TRUE if <me> is 'ASCII' less than <other>.
  IsLess(*args, **kwargs)
  IsLess(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
  IsLess(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IsGreater(*args, **kwargs)
  // Remarks: Overloaded function.

1. IsGreater(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool

Returns TRUE if <me> is 'ASCII' greater than <other>.

2. IsGreater(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

Returns TRUE if <me> is 'ASCII' greater than <other>.
  IsGreater(*args, **kwargs)
  IsGreater(self: OCP.OCP.TCollection.TCollection_AsciiString, other: str) -> bool
  IsGreater(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // StartsWith(self
  // Remarks: Determines whether the beginning of this string instance matches the specified string.
  StartsWith(self: OCP.OCP.TCollection.TCollection_AsciiString, theStartString: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // EndsWith(self
  // Remarks: Determines whether the end of this string instance matches the specified string.
  EndsWith(self: OCP.OCP.TCollection.TCollection_AsciiString, theEndString: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IntegerValue(self
  // Remarks: Converts a AsciiString containing a numeric expression to an Integer. Example: "215" returns 215.
  IntegerValue(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // IsIntegerValue(self
  // Remarks: Returns True if the AsciiString contains an integer value. Note: an integer value is considered to be a real value as well.
  IsIntegerValue(self: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // IsRealValue(self
  // Remarks: Returns True if the AsciiString starts with some characters that can be interpreted as integer or real value.
  IsRealValue(self: OCP.OCP.TCollection.TCollection_AsciiString, theToCheckFull: bool = False) -> bool

  // IsAscii(self
  // Remarks: Returns True if the AsciiString contains only ASCII characters between ' ' and '~'. This means no control character and no extended ASCII code.
  IsAscii(self: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

  // LeftAdjust(self
  // Remarks: Removes all space characters in the beginning of the string.
  LeftAdjust(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // LeftJustify(self
  // Remarks: left justify Length becomes equal to Width and the new characters are equal to Filler. If Width < Length nothing happens. Raises an exception if Width is less than zero. Example: before me = "abcdef" , Width = 9 , Filler = ' ' after me = "abcdef "
  LeftJustify(self: OCP.OCP.TCollection.TCollection_AsciiString, Width: int, Filler: str) -> None

  // Length(*args, **kwargs)
  // Remarks: Overloaded function.

1. Length(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

Returns number of characters in <me>. This is the same functionality as 'strlen' in C. Example TCollection_AsciiString myAlphabet("abcdef"); assert ( myAlphabet.Length() == 6 ); - 1 is the position of the first character in this string. - The length of this string gives the position of its last character. - Positions less than or equal to zero, or greater than the length of this string are invalid in functions which identify a character of this string by its position.

2. Length(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

Returns number of characters in <me>. This is the same functionality as 'strlen' in C. Example TCollection_AsciiString myAlphabet("abcdef"); assert ( myAlphabet.Length() == 6 ); - 1 is the position of the first character in this string. - The length of this string gives the position of its last character. - Positions less than or equal to zero, or greater than the length of this string are invalid in functions which identify a character of this string by its position.
  Length(*args, **kwargs)
  Length(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int
  Length(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // Location(*args, **kwargs)
  // Remarks: Overloaded function.

1. Location(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> int

Returns an index in the string <me> of the first occurrence of the string S in the string <me> from the starting index FromIndex to the ending index ToIndex returns zero if failure Raises an exception if FromIndex or ToIndex is out of range. Example: before me = "aabAaAa", S = "Aa", FromIndex = 1, ToIndex = 7 after me = "aabAaAa" returns 4

2. Location(self: OCP.OCP.TCollection.TCollection_AsciiString, N: int, C: str, FromIndex: int, ToIndex: int) -> int

Returns the index of the nth occurrence of the character C in the string <me> from the starting index FromIndex to the ending index ToIndex. Returns zero if failure. Raises an exception if FromIndex or ToIndex is out of range. Example: before me = "aabAa", N = 3, C = 'a', FromIndex = 1, ToIndex = 5 after me = "aabAa" returns 5
  Location(*args, **kwargs)
  Location(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> int
  Location(self: OCP.OCP.TCollection.TCollection_AsciiString, N: int, C: str, FromIndex: int, ToIndex: int) -> int

  // LowerCase(self
  // Remarks: Converts <me> to its lower-case equivalent. Example TCollection_AsciiString myString("Hello Dolly"); myString.UpperCase(); assert ( myString == "HELLO DOLLY" ); myString.LowerCase(); assert ( myString == "hello dolly" );
  LowerCase(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Prepend(self
  // Remarks: Inserts the string other at the beginning of this ASCII string. Example TCollection_AsciiString myAlphabet("cde"); TCollection_AsciiString myBegin("ab"); myAlphabet.Prepend(myBegin); assert ( myAlphabet == "abcde" );
  Prepend(self: OCP.OCP.TCollection.TCollection_AsciiString, other: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Print(self
  // Remarks: Displays <me> on a stream.
  Print(self: OCP.OCP.TCollection.TCollection_AsciiString, astream: io.BytesIO) -> None

  // Read(self
  // Remarks: Read <me> from a stream.
  Read(self: OCP.OCP.TCollection.TCollection_AsciiString, astream: io.BytesIO) -> None

  // RealValue(self
  // Remarks: Converts an AsciiString containing a numeric expression. to a Real. Example: ex: "215" returns 215.0. ex: "3.14159267" returns 3.14159267.
  RealValue(self: OCP.OCP.TCollection.TCollection_AsciiString) -> float

  // RemoveAll(*args, **kwargs)
  // Remarks: Overloaded function.

1. RemoveAll(self: OCP.OCP.TCollection.TCollection_AsciiString, C: str, CaseSensitive: bool) -> None

Remove all the occurrences of the character C in the string. Example: before me = "HellLLo", C = 'L' , CaseSensitive = True after me = "Hello"

2. RemoveAll(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> None

Removes every <what> characters from <me>.
  RemoveAll(*args, **kwargs)
  RemoveAll(self: OCP.OCP.TCollection.TCollection_AsciiString, C: str, CaseSensitive: bool) -> None
  RemoveAll(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> None

  // Remove(self
  // Remarks: Erases <ahowmany> characters from position <where>, <where> included. Example: aString contains "Hello" aString.Remove(2,2) erases 2 characters from position 2 This gives "Hlo".
  Remove(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, ahowmany: int = 1) -> None

  // RightAdjust(self
  // Remarks: Removes all space characters at the end of the string.
  RightAdjust(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // RightJustify(self
  // Remarks: Right justify. Length becomes equal to Width and the new characters are equal to Filler. if Width < Length nothing happens. Raises an exception if Width is less than zero. Example: before me = "abcdef" , Width = 9 , Filler = ' ' after me = " abcdef"
  RightJustify(self: OCP.OCP.TCollection.TCollection_AsciiString, Width: int, Filler: str) -> None

  // Search(*args, **kwargs)
  // Remarks: Overloaded function.

1. Search(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> int

Searches a CString in <me> from the beginning and returns position of first item <what> matching. it returns -1 if not found. Example: aString contains "Sample single test" aString.Search("le") returns 5

2. Search(self: OCP.OCP.TCollection.TCollection_AsciiString, what: OCP.OCP.TCollection.TCollection_AsciiString) -> int

Searches an AsciiString in <me> from the beginning and returns position of first item <what> matching. It returns -1 if not found.
  Search(*args, **kwargs)
  Search(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> int
  Search(self: OCP.OCP.TCollection.TCollection_AsciiString, what: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // SearchFromEnd(*args, **kwargs)
  // Remarks: Overloaded function.

1. SearchFromEnd(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> int

Searches a CString in a AsciiString from the end and returns position of first item <what> matching. It returns -1 if not found. Example: aString contains "Sample single test" aString.SearchFromEnd("le") returns 12

2. SearchFromEnd(self: OCP.OCP.TCollection.TCollection_AsciiString, what: OCP.OCP.TCollection.TCollection_AsciiString) -> int

Searches a AsciiString in another AsciiString from the end and returns position of first item <what> matching. It returns -1 if not found.
  SearchFromEnd(*args, **kwargs)
  SearchFromEnd(self: OCP.OCP.TCollection.TCollection_AsciiString, what: str) -> int
  SearchFromEnd(self: OCP.OCP.TCollection.TCollection_AsciiString, what: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // SetValue(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None

Replaces one character in the AsciiString at position <where>. If <where> is less than zero or greater than the length of <me> an exception is raised. Example: aString contains "Garbake" astring.Replace(6,'g') gives <me> = "Garbage"

2. SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None

Replaces a part of <me> by a CString. If <where> is less than zero or greater than the length of <me> an exception is raised. Example: aString contains "abcde" aString.SetValue(4,"1234567") gives <me> = "abc1234567"

3. SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: OCP.OCP.TCollection.TCollection_AsciiString) -> None

Replaces a part of <me> by another AsciiString.
  SetValue(*args, **kwargs)
  SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
  SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: str) -> None
  SetValue(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int, what: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Split(self
  // Remarks: Splits a AsciiString into two sub-strings. Example: aString contains "abcdefg" aString.Split(3) gives <me> = "abc" and returns "defg"
  Split(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // SubString(*args, **kwargs)
  // Remarks: Overloaded function.

1. SubString(self: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

Creation of a sub-string of the string <me>. The sub-string starts to the index Fromindex and ends to the index ToIndex. Raises an exception if ToIndex or FromIndex is out of bounds Example: before me = "abcdefg", ToIndex=3, FromIndex=6 after me = "abcdefg" returns "cdef"

2. SubString(self: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

Creation of a sub-string of the string <me>. The sub-string starts to the index Fromindex and ends to the index ToIndex. Raises an exception if ToIndex or FromIndex is out of bounds Example: before me = "abcdefg", ToIndex=3, FromIndex=6 after me = "abcdefg" returns "cdef"
  SubString(*args, **kwargs)
  SubString(self: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString
  SubString(self: OCP.OCP.TCollection.TCollection_AsciiString, FromIndex: int, ToIndex: int) -> OCP.OCP.TCollection.TCollection_AsciiString

  // ToCString(*args, **kwargs)
  // Remarks: Overloaded function.

1. ToCString(self: OCP.OCP.TCollection.TCollection_AsciiString) -> str

Returns pointer to AsciiString (char *). This is useful for some casual manipulations. Warning: Because this "char *" is 'const', you can't modify its contents.

2. ToCString(self: OCP.OCP.TCollection.TCollection_AsciiString) -> str

Returns pointer to AsciiString (char *). This is useful for some casual manipulations. Warning: Because this "char *" is 'const', you can't modify its contents.
  ToCString(*args, **kwargs)
  ToCString(self: OCP.OCP.TCollection.TCollection_AsciiString) -> str
  ToCString(self: OCP.OCP.TCollection.TCollection_AsciiString) -> str

  // Token(self
  // Remarks: Extracts <whichone> token from <me>. By default, the <separators> is set to space and tabulation. By default, the token extracted is the first one (whichone = 1). <separators> contains all separators you need. If no token indexed by <whichone> is found, it returns empty AsciiString. Example: aString contains "This is a message" aString.Token() returns "This" aString.Token(" ",4) returns "message" aString.Token(" ",2) returns "is" aString.Token(" ",9) returns "" Other separators than space character and tabulation are allowed : aString contains "1234; test:message , value" aString.Token("; :,",4) returns "value" aString.Token("; :,",2) returns "test"
  Token(self: OCP.OCP.TCollection.TCollection_AsciiString, separators: str = ' \t', whichone: int = 1) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Trunc(self
  // Remarks: Truncates <me> to <ahowmany> characters. Example: me = "Hello Dolly" -> Trunc(3) -> me = "Hel"
  Trunc(self: OCP.OCP.TCollection.TCollection_AsciiString, ahowmany: int) -> None

  // UpperCase(self
  // Remarks: Converts <me> to its upper-case equivalent.
  UpperCase(self: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // UsefullLength(self
  // Remarks: Length of the string ignoring all spaces (' ') and the control character at the end.
  UsefullLength(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // Value(self
  // Remarks: Returns character at position <where> in <me>. If <where> is less than zero or greater than the length of <me>, an exception is raised. Example: aString contains "Hello" aString.Value(2) returns 'e'
  Value(self: OCP.OCP.TCollection.TCollection_AsciiString, where: int) -> str

  // HashCode(*args, **kwargs)
  // Remarks: Overloaded function.

1. HashCode(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

Computes a hash code for the given ASCII string Returns the same integer value as the hash function for TCollection_ExtendedString

2. HashCode(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

Computes a hash code for the given ASCII string Returns the same integer value as the hash function for TCollection_ExtendedString
  HashCode(*args, **kwargs)
  HashCode(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int
  HashCode(self: OCP.OCP.TCollection.TCollection_AsciiString) -> int

  // IsEqual_s(*args, **kwargs)
  // Remarks: Overloaded function.

1. IsEqual_s(string1: OCP.OCP.TCollection.TCollection_AsciiString, string2: OCP.OCP.TCollection.TCollection_AsciiString) -> bool

Returns True when the two strings are the same. (Just for HashCode for AsciiString)

2. IsEqual_s(string1: OCP.OCP.TCollection.TCollection_AsciiString, string2: str) -> bool

Returns True when the two strings are the same. (Just for HashCode for AsciiString)
  IsEqual_s(*args, **kwargs)
  IsEqual_s(string1: OCP.OCP.TCollection.TCollection_AsciiString, string2: OCP.OCP.TCollection.TCollection_AsciiString) -> bool
  IsEqual_s(string1: OCP.OCP.TCollection.TCollection_AsciiString, string2: str) -> bool

  // IsSameString_s(theString1
  // Remarks: Returns True if the strings contain same characters.
  IsSameString_s(theString1: OCP.OCP.TCollection.TCollection_AsciiString, theString2: OCP.OCP.TCollection.TCollection_AsciiString, theIsCaseSensitive: bool) -> bool
