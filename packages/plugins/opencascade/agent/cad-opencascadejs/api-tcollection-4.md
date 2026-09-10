# libcascade — TCollection (4)

1 top-level symbols. Signatures are verbatim typescript.

// A variable-length sequence of "extended" (UNICODE) characters (16-bit character type)
TCollection_HExtendedString: declare class TCollection_HExtendedString extends Standard_Transient

constructor

// Appends <other> to me
AssignCat(other: TCollection_HExtendedString): void;

// Returns a string appending <other> to me
Cat(other: TCollection_HExtendedString): TCollection_HExtendedString;

// Substitutes all the characters equal to aChar by NewChar in the string <me>
ChangeAll(aChar: string, NewChar: string): void;

// Removes all characters contained in <me>
Clear(): void;

// Returns True if the string <me> contains zero character
IsEmpty(): boolean;

// Insert a ExtCharacter at position <where>
Insert(where: number, what: string): void;
Insert(where: number, what: TCollection_HExtendedString): void;
Insert(where: number, what: string): void;
Insert(where: number, what: TCollection_HExtendedString): void;

// Returns TRUE if <me> is less than <other>
IsLess(other: TCollection_HExtendedString): boolean;

// Returns TRUE if <me> is greater than <other>
IsGreater(other: TCollection_HExtendedString): boolean;

// Returns True if the string contains only "Ascii Range" characters
IsAscii(): boolean;

// Returns number of characters in <me>
Length(): number;

// Erases <ahowmany> characters from position <where>, <where> included
Remove(where: number, ahowmany?: number): void;

// Removes every <what> characters from <me>
RemoveAll(what: string): void;

// Replaces one character in the string at position <where>
SetValue(where: number, what: string): void;
SetValue(where: number, what: TCollection_HExtendedString): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: TCollection_HExtendedString): void;

// Splits a ExtendedString into two sub-strings
Split(where: number): TCollection_HExtendedString;

// Searches a String in <me> from the beginning and returns position of first item <what> matching
Search(what: TCollection_HExtendedString): number;

// Searches a ExtendedString in another ExtendedString from the end and returns position of first item <what> matching
SearchFromEnd(what: TCollection_HExtendedString): number;

// Returns pointer to ExtString
ToExtString(): string;

// Extracts <whichone> token from <me>
Token(separators: string, whichone?: number): TCollection_HExtendedString;

// Truncates <me> to <ahowmany> characters
Trunc(ahowmany: number): void;

// Returns ExtCharacter at position <where> in <me>
Value(where: number): string;

// Returns the field myString
String(): TCollection_ExtendedString;

IsSameState(other: TCollection_HExtendedString): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
