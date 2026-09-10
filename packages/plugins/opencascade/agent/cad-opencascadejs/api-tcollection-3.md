# libcascade — TCollection (3)

2 top-level symbols. Signatures are verbatim typescript.

// A variable-length sequence of "extended" (UNICODE) characters (16-bit character type)
TCollection_ExtendedString: declare class TCollection_ExtendedString

constructor

// Appends the other extended string to this extended string
AssignCat(theOther: TCollection_ExtendedString): void;
AssignCat(theOther: number): void;
AssignCat(theChar: string): void;
AssignCat(theOther: number): void;
AssignCat(theStringView: string): void;
AssignCat(theString: string, theLength: number): void;
AssignCat(theOther: TCollection_ExtendedString): void;
AssignCat(theOther: number): void;
AssignCat(theChar: string): void;
AssignCat(theOther: number): void;
AssignCat(theStringView: string): void;
AssignCat(theString: string, theLength: number): void;
AssignCat(theOther: TCollection_ExtendedString): void;
AssignCat(theOther: number): void;
AssignCat(theChar: string): void;
AssignCat(theOther: number): void;
AssignCat(theStringView: string): void;
AssignCat(theString: string, theLength: number): void;
AssignCat(theOther: TCollection_ExtendedString): void;
AssignCat(theOther: number): void;
AssignCat(theChar: string): void;
AssignCat(theOther: number): void;
AssignCat(theStringView: string): void;
AssignCat(theString: string, theLength: number): void;
AssignCat(theOther: TCollection_ExtendedString): void;
AssignCat(theOther: number): void;
AssignCat(theChar: string): void;
AssignCat(theOther: number): void;
AssignCat(theStringView: string): void;
AssignCat(theString: string, theLength: number): void;
AssignCat(theOther: TCollection_ExtendedString): void;
AssignCat(theOther: number): void;
AssignCat(theChar: string): void;
AssignCat(theOther: number): void;
AssignCat(theStringView: string): void;
AssignCat(theString: string, theLength: number): void;
// theOther: the string to append

// Concatenates char16_t string and returns a new string
Cat(theOther: number): TCollection_ExtendedString;
Cat(theOther: number): TCollection_ExtendedString;
Cat(theOther: TCollection_ExtendedString): TCollection_ExtendedString;
Cat(theOther: string, theLength: number): TCollection_ExtendedString;
Cat(theOther: number): TCollection_ExtendedString;
Cat(theOther: number): TCollection_ExtendedString;
Cat(theOther: TCollection_ExtendedString): TCollection_ExtendedString;
Cat(theOther: string, theLength: number): TCollection_ExtendedString;
Cat(theOther: number): TCollection_ExtendedString;
Cat(theOther: number): TCollection_ExtendedString;
Cat(theOther: TCollection_ExtendedString): TCollection_ExtendedString;
Cat(theOther: string, theLength: number): TCollection_ExtendedString;
Cat(theOther: number): TCollection_ExtendedString;
Cat(theOther: number): TCollection_ExtendedString;
Cat(theOther: TCollection_ExtendedString): TCollection_ExtendedString;
Cat(theOther: string, theLength: number): TCollection_ExtendedString;
// theOther: the null-terminated string to append

// Appends the other extended string to this string and returns a new string
Cat_2(theOther: string): TCollection_ExtendedString;
// theOther: the string to append

// Substitutes all the characters equal to theChar by theNewChar in this ExtendedString
ChangeAll(theChar: string, theNewChar: string): void;
// theChar: the character to replace
// theNewChar: the replacement character

// Removes all characters contained in this string
Clear(): void;

// Copy theFromWhere to this string
Copy(theFromWhere: TCollection_ExtendedString): void;
Copy(theString: string, theLength: number): void;
Copy(theFromWhere: TCollection_ExtendedString): void;
Copy(theString: string, theLength: number): void;
// theFromWhere: the string to copy from

// Copy from a char16_t pointer
Copy_2(theString: string): void;
// theString: the null-terminated string to copy

// Exchange the data of two strings (without reallocating memory)
Swap(theOther: TCollection_ExtendedString): void;
// theOther: the string to exchange data with Mutated in place

// Insert a Character at position theWhere
Insert(theWhere: number, theWhat: string): void;
Insert(theWhere: number, theWhat: TCollection_ExtendedString): void;
Insert(theWhere: number, theWhat: string, theLength: number): void;
Insert(theWhere: number, theWhat: string): void;
Insert(theWhere: number, theWhat: TCollection_ExtendedString): void;
Insert(theWhere: number, theWhat: string, theLength: number): void;
Insert(theWhere: number, theWhat: string): void;
Insert(theWhere: number, theWhat: TCollection_ExtendedString): void;
Insert(theWhere: number, theWhat: string, theLength: number): void;
// theWhere: the position to insert at (1-based)
// theWhat: the character to insert

// Returns True if this string contains no characters
IsEmpty(): boolean;

// Returns true if this string equals theOther null-terminated string
IsEqual(theOther: TCollection_ExtendedString): boolean;
static IsEqual(theString1: TCollection_ExtendedString, theString2: TCollection_ExtendedString): boolean;
// theOther: the char16_t string to compare with

// Returns true if the characters in this extended string are identical to the characters in theOther extended string
IsEqual_2(theOther: string): boolean;
// theOther: the extended string to compare with

// Core implementation
IsEqual_1(theOther: string, theLength: number): boolean;
// theOther: pointer to the string to compare with
// theLength: length of the string to compare with

// Returns true if this string differs from theOther null-terminated string
IsDifferent(theOther: TCollection_ExtendedString): boolean;
IsDifferent(theOther: string, theLength: number): boolean;
IsDifferent(theOther: TCollection_ExtendedString): boolean;
IsDifferent(theOther: string, theLength: number): boolean;
// theOther: the char16_t string to compare with

// Returns true if there are differences between the characters in this extended string and theOther extended string
IsDifferent_2(theOther: string): boolean;
// theOther: the extended string to compare with

// Returns TRUE if this string is lexicographically less than theOther
IsLess(theOther: TCollection_ExtendedString): boolean;
IsLess(theOther: string, theLength: number): boolean;
IsLess(theOther: TCollection_ExtendedString): boolean;
IsLess(theOther: string, theLength: number): boolean;
// theOther: the char16_t string to compare with

// Returns TRUE if this string is lexicographically less than theOther
IsLess_2(theOther: string): boolean;
// theOther: the extended string to compare with

// Returns TRUE if this string is lexicographically greater than theOther
IsGreater(theOther: TCollection_ExtendedString): boolean;
IsGreater(theOther: string, theLength: number): boolean;
IsGreater(theOther: TCollection_ExtendedString): boolean;
IsGreater(theOther: string, theLength: number): boolean;
// theOther: the char16_t string to compare with

// Returns TRUE if this string is lexicographically greater than theOther
IsGreater_2(theOther: string): boolean;
// theOther: the extended string to compare with

// Determines whether this string starts with theStartString
StartsWith(theStartString: TCollection_ExtendedString): boolean;
StartsWith(theStartString: string, theLength: number): boolean;
StartsWith(theStartString: TCollection_ExtendedString): boolean;
StartsWith(theStartString: string, theLength: number): boolean;
// theStartString: the null-terminated string to check for

// Determines whether the beginning of this string instance matches the specified string
StartsWith_2(theStartString: string): boolean;
// theStartString: the string to check for at the beginning

// Determines whether this string ends with theEndString
EndsWith(theEndString: TCollection_ExtendedString): boolean;
EndsWith(theEndString: string, theLength: number): boolean;
EndsWith(theEndString: TCollection_ExtendedString): boolean;
EndsWith(theEndString: string, theLength: number): boolean;
// theEndString: the null-terminated string to check for

// Determines whether the end of this string instance matches the specified string
EndsWith_2(theEndString: string): boolean;
// theEndString: the string to check for at the end

// Returns True if the ExtendedString contains only "Ascii Range" characters
IsAscii(): boolean;

// Returns the number of 16-bit code units (might be greater than number of Unicode symbols if string contains surrogate pairs)
Length(): number;

// Removes every theWhat characters from this string
RemoveAll(theWhat: string): void;
// theWhat: the character to remove

// Erases theHowMany characters from position theWhere, theWhere included
Remove(theWhere: number, theHowMany?: number): void;
// theWhere: the position to start erasing from (1-based)
// theHowMany: the number of characters to erase

// Searches for theWhat null-terminated string from the beginning
Search(theWhat: TCollection_ExtendedString): number;
Search(theWhat: string, theLength: number): number;
Search(theWhat: TCollection_ExtendedString): number;
Search(theWhat: string, theLength: number): number;
// theWhat: the null-terminated string to search for

// Searches an ExtendedString in this string from the beginning and returns position of first item theWhat matching
Search_2(theWhat: string): number;
// theWhat: the string to search for

// Searches for theWhat null-terminated string from the end
SearchFromEnd(theWhat: TCollection_ExtendedString): number;
SearchFromEnd(theWhat: string, theLength: number): number;
SearchFromEnd(theWhat: TCollection_ExtendedString): number;
SearchFromEnd(theWhat: string, theLength: number): number;
// theWhat: the null-terminated string to search for

// Searches an ExtendedString in this string from the end and returns position of first item theWhat matching
SearchFromEnd_2(theWhat: string): number;
// theWhat: the string to search for

// Replaces one character in the ExtendedString at position theWhere
SetValue(theWhere: number, theWhat: string): void;
SetValue(theWhere: number, theWhat: TCollection_ExtendedString): void;
SetValue(theWhere: number, theWhat: string, theLength: number): void;
SetValue(theWhere: number, theWhat: string): void;
SetValue(theWhere: number, theWhat: TCollection_ExtendedString): void;
SetValue(theWhere: number, theWhat: string, theLength: number): void;
SetValue(theWhere: number, theWhat: string): void;
SetValue(theWhere: number, theWhat: TCollection_ExtendedString): void;
SetValue(theWhere: number, theWhat: string, theLength: number): void;
// theWhere: the position to replace at (1-based)
// theWhat: the character to replace with

// Copies characters from this string starting from index theFromIndex to the index theToIndex (inclusive)
SubString(theFromIndex: number, theToIndex: number): TCollection_ExtendedString;
// theFromIndex: the starting index (1-based)
// theToIndex: the ending index (1-based, inclusive)

// Splits this extended string into two sub-strings at position theWhere
Split(theWhere: number): TCollection_ExtendedString;
// theWhere: the position to split at (0-based)

// Extracts theWhichOne token from this string
Token(theSeparators: string, theWhichOne?: number): TCollection_ExtendedString;
// theSeparators: the separator characters
// theWhichOne: the token number to extract (1-based)

// Returns pointer to ExtString (char16_t\*)
ToExtString(): string;

// Truncates this string to theHowMany characters
Trunc(theHowMany: number): void;
// theHowMany: the number of characters to keep

// Returns character at position theWhere in this string
Value(theWhere: number): string;
// theWhere: the position to get character from (1-based)

// Returns a hashed value for the extended string
HashCode(): number;

// Returns a const reference to a single shared empty string instance
static EmptyString(): TCollection_ExtendedString;

// Returns expected CString length in UTF8 coding (like strlen, without null terminator)
LengthOfCString(): number;

// Removes all space characters in the beginning of the string
LeftAdjust(): void;

// Removes all space characters at the end of the string
RightAdjust(): void;

// Left justify
LeftJustify(theWidth: number, theFiller: string): void;
// theWidth: the desired width of the string
// theFiller: the character to fill with

// Right justify
RightJustify(theWidth: number, theFiller: string): void;
// theWidth: the desired width of the string
// theFiller: the character to fill with

// Modifies this string so that its length becomes equal to theWidth and the new characters are equal to theFiller
Center(theWidth: number, theFiller: string): void;
// theWidth: the desired width of the string
// theFiller: the character to fill with

// Converts the first character into its corresponding upper-case character and the other characters into lowercase
Capitalize(): void;

// Inserts a null-terminated char16_t string at the beginning
Prepend(theOther: TCollection_ExtendedString): void;
Prepend(theOther: string, theLength: number): void;
Prepend(theOther: TCollection_ExtendedString): void;
Prepend(theOther: string, theLength: number): void;
// theOther: the null-terminated string to prepend

// Inserts the other extended string at the beginning of this string
Prepend_2(theOther: string): void;
// theOther: the string to prepend

// Returns the index of the first character of this string that is present in theSet
FirstLocationInSet(theSet: TCollection_ExtendedString, theFromIndex: number, theToIndex: number): number;
// theSet: the set of characters to search for
// theFromIndex: the starting index for search (1-based)
// theToIndex: the ending index for search (1-based)

// Returns the index of the first character of this string that is NOT present in theSet
FirstLocationNotInSet(theSet: TCollection_ExtendedString, theFromIndex: number, theToIndex: number): number;
// theSet: the set of characters to check against
// theFromIndex: the starting index for search (1-based)
// theToIndex: the ending index for search (1-based)

// Converts this extended string containing a numeric expression to an Integer
IntegerValue(): number;

// Returns True if this extended string contains an integer value
IsIntegerValue(): boolean;

// Converts this extended string containing a numeric expression to a Real
RealValue(): number;

// Returns True if this extended string starts with characters that can be interpreted as a real value
IsRealValue(theToCheckFull?: boolean): boolean;
// theToCheckFull: when TRUE, checks if entire string defines a real value

// Returns True if the strings contain same characters
IsSameString(theOther: TCollection_ExtendedString, theIsCaseSensitive: boolean): boolean;
// theOther: the string to compare with
// theIsCaseSensitive: flag indicating case sensitivity

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A variable-length sequence of ASCII characters (normal 8-bit character type)
TCollection_HAsciiString: declare class TCollection_HAsciiString extends Standard_Transient

constructor

// Appends <other> to me
AssignCat(other: string): void;
AssignCat(other: TCollection_HAsciiString): void;
AssignCat(other: string): void;
AssignCat(other: TCollection_HAsciiString): void;

// Converts the first character into its corresponding upper-case character and the other characters into lowercase
Capitalize(): void;

// Creates a new string by concatenation of this ASCII string and the other ASCII string
Cat(other: string): TCollection_HAsciiString;
Cat(other: TCollection_HAsciiString): TCollection_HAsciiString;
Cat(other: string): TCollection_HAsciiString;
Cat(other: TCollection_HAsciiString): TCollection_HAsciiString;

// Modifies this ASCII string so that its length becomes equal to Width and the new characters are equal to Filler
Center(Width: number, Filler: string): void;

// Replaces all characters equal to aChar by NewChar in this ASCII string
ChangeAll(aChar: string, NewChar: string, CaseSensitive?: boolean): void;

// Removes all characters contained in <me>
Clear(): void;

// Returns the index of the first character of <me> that is present in <Set>
FirstLocationInSet(Set: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;

// Returns the index of the first character of <me> that is not present in the set <Set>
FirstLocationNotInSet(Set: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;

// Insert a Character at position <where>
Insert(where: number, what: string): void;
Insert(where: number, what: string): void;
Insert(where: number, what: TCollection_HAsciiString): void;
Insert(where: number, what: string): void;
Insert(where: number, what: string): void;
Insert(where: number, what: TCollection_HAsciiString): void;
Insert(where: number, what: string): void;
Insert(where: number, what: string): void;
Insert(where: number, what: TCollection_HAsciiString): void;

// Inserts the other ASCII string a after a specific index in the string <me> Example
InsertAfter(Index: number, other: TCollection_HAsciiString): void;

// Inserts the other ASCII string a before a specific index in the string <me> Raises an exception if Index is out of bounds Example
InsertBefore(Index: number, other: TCollection_HAsciiString): void;

// Returns True if the string <me> contains zero character
IsEmpty(): boolean;

// Returns TRUE if <me> is 'ASCII' less than <other>
IsLess(other: TCollection_HAsciiString): boolean;

// Returns TRUE if <me> is 'ASCII' greater than <other>
IsGreater(other: TCollection_HAsciiString): boolean;

// Converts a HAsciiString containing a numeric expression to an Integer
IntegerValue(): number;

// Returns True if the string contains an integer value
IsIntegerValue(): boolean;

// Returns True if the string contains a real value
IsRealValue(): boolean;

// Returns True if the string contains only ASCII characters between ' ' and '~'
IsAscii(): boolean;

// Returns True if the string S not contains same characters than the string <me>
IsDifferent(S: TCollection_HAsciiString): boolean;

// Returns True if the string S contains same characters than the string <me>
IsSameString(S: TCollection_HAsciiString): boolean;
IsSameString(S: TCollection_HAsciiString, CaseSensitive: boolean): boolean;
IsSameString(S: TCollection_HAsciiString): boolean;
IsSameString(S: TCollection_HAsciiString, CaseSensitive: boolean): boolean;

// Removes all space characters in the beginning of the string
LeftAdjust(): void;

// Left justify
LeftJustify(Width: number, Filler: string): void;

// Returns number of characters in <me>
Length(): number;

// returns an index in the string <me> of the first occurrence of the string S in the string <me> from the starting index FromIndex to the ending index ToIndex returns zero if failure Raises an exception if FromIndex or ToIndex is out of range
Location(other: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;
Location(N: number, C: string, FromIndex: number, ToIndex: number): number;
Location(other: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;
Location(N: number, C: string, FromIndex: number, ToIndex: number): number;

// Converts <me> to its lower-case equivalent
LowerCase(): void;

// Inserts the other string at the beginning of the string <me> Example
Prepend(other: TCollection_HAsciiString): void;

// Converts a string containing a numeric expression to a Real
RealValue(): number;

// Remove all the occurrences of the character C in the string Example
RemoveAll(C: string, CaseSensitive: boolean): void;
RemoveAll(what: string): void;
RemoveAll(C: string, CaseSensitive: boolean): void;
RemoveAll(what: string): void;

// Erases <ahowmany> characters from position <where>, <where> included
Remove(where: number, ahowmany?: number): void;

// Removes all space characters at the end of the string
RightAdjust(): void;

// Right justify
RightJustify(Width: number, Filler: string): void;

// Searches a CString in <me> from the beginning and returns position of first item <what> matching
Search(what: string): number;
Search(what: TCollection_HAsciiString): number;
Search(what: string): number;
Search(what: TCollection_HAsciiString): number;

// Searches a CString in a String from the end and returns position of first item <what> matching
SearchFromEnd(what: string): number;
SearchFromEnd(what: TCollection_HAsciiString): number;
SearchFromEnd(what: string): number;
SearchFromEnd(what: TCollection_HAsciiString): number;

// Replaces one character in the string at position <where>
SetValue(where: number, what: string): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: TCollection_HAsciiString): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: TCollection_HAsciiString): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: TCollection_HAsciiString): void;

// Splits a HAsciiString into two sub-strings
Split(where: number): TCollection_HAsciiString;

// Creation of a sub-string of the string <me>
SubString(FromIndex: number, ToIndex: number): TCollection_HAsciiString;

// Returns pointer to string (char _) This is useful for some casual manipulations Because this "char _" is 'const', you can't modify its contents
ToCString(): string;

// Extracts <whichone> token from <me>
Token(separators?: string, whichone?: number): TCollection_HAsciiString;

// Truncates <me> to <ahowmany> characters
Trunc(ahowmany: number): void;

// Converts <me> to its upper-case equivalent
UpperCase(): void;

// Length of the string ignoring all spaces (' ') and the control character at the end
UsefullLength(): number;

// Returns character at position <where> in <me>
Value(where: number): string;

// Returns the field myString
String(): TCollection_AsciiString;

IsSameState(other: TCollection_HAsciiString): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
