# libcascade — TCollection (3)

3 top-level symbols. Signatures are verbatim typescript.

TCollection_ExtendedString: declare class TCollection_ExtendedString

constructor

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

Cat_2(theOther: string): TCollection_ExtendedString;

ChangeAll(theChar: string, theNewChar: string): void;

Clear(): void;

Copy(theFromWhere: TCollection_ExtendedString): void;
Copy(theString: string, theLength: number): void;
Copy(theFromWhere: TCollection_ExtendedString): void;
Copy(theString: string, theLength: number): void;

Copy_2(theString: string): void;

Swap(theOther: TCollection_ExtendedString): void;

Insert(theWhere: number, theWhat: string): void;
Insert(theWhere: number, theWhat: TCollection_ExtendedString): void;
Insert(theWhere: number, theWhat: string, theLength: number): void;
Insert(theWhere: number, theWhat: string): void;
Insert(theWhere: number, theWhat: TCollection_ExtendedString): void;
Insert(theWhere: number, theWhat: string, theLength: number): void;
Insert(theWhere: number, theWhat: string): void;
Insert(theWhere: number, theWhat: TCollection_ExtendedString): void;
Insert(theWhere: number, theWhat: string, theLength: number): void;

IsEmpty(): boolean;

IsEqual(theOther: TCollection_ExtendedString): boolean;
static IsEqual(theString1: TCollection_ExtendedString, theString2: TCollection_ExtendedString): boolean;

IsEqual_2(theOther: string): boolean;

IsEqual_1(theOther: string, theLength: number): boolean;

IsDifferent(theOther: TCollection_ExtendedString): boolean;
IsDifferent(theOther: string, theLength: number): boolean;
IsDifferent(theOther: TCollection_ExtendedString): boolean;
IsDifferent(theOther: string, theLength: number): boolean;

IsDifferent_2(theOther: string): boolean;

IsLess(theOther: TCollection_ExtendedString): boolean;
IsLess(theOther: string, theLength: number): boolean;
IsLess(theOther: TCollection_ExtendedString): boolean;
IsLess(theOther: string, theLength: number): boolean;

IsLess_2(theOther: string): boolean;

IsGreater(theOther: TCollection_ExtendedString): boolean;
IsGreater(theOther: string, theLength: number): boolean;
IsGreater(theOther: TCollection_ExtendedString): boolean;
IsGreater(theOther: string, theLength: number): boolean;

IsGreater_2(theOther: string): boolean;

StartsWith(theStartString: TCollection_ExtendedString): boolean;
StartsWith(theStartString: string, theLength: number): boolean;
StartsWith(theStartString: TCollection_ExtendedString): boolean;
StartsWith(theStartString: string, theLength: number): boolean;

StartsWith_2(theStartString: string): boolean;

EndsWith(theEndString: TCollection_ExtendedString): boolean;
EndsWith(theEndString: string, theLength: number): boolean;
EndsWith(theEndString: TCollection_ExtendedString): boolean;
EndsWith(theEndString: string, theLength: number): boolean;

EndsWith_2(theEndString: string): boolean;

IsAscii(): boolean;

Length(): number;

RemoveAll(theWhat: string): void;

Remove(theWhere: number, theHowMany?: number): void;

Search(theWhat: TCollection_ExtendedString): number;
Search(theWhat: string, theLength: number): number;
Search(theWhat: TCollection_ExtendedString): number;
Search(theWhat: string, theLength: number): number;

Search_2(theWhat: string): number;

SearchFromEnd(theWhat: TCollection_ExtendedString): number;
SearchFromEnd(theWhat: string, theLength: number): number;
SearchFromEnd(theWhat: TCollection_ExtendedString): number;
SearchFromEnd(theWhat: string, theLength: number): number;

SearchFromEnd_2(theWhat: string): number;

SetValue(theWhere: number, theWhat: string): void;
SetValue(theWhere: number, theWhat: TCollection_ExtendedString): void;
SetValue(theWhere: number, theWhat: string, theLength: number): void;
SetValue(theWhere: number, theWhat: string): void;
SetValue(theWhere: number, theWhat: TCollection_ExtendedString): void;
SetValue(theWhere: number, theWhat: string, theLength: number): void;
SetValue(theWhere: number, theWhat: string): void;
SetValue(theWhere: number, theWhat: TCollection_ExtendedString): void;
SetValue(theWhere: number, theWhat: string, theLength: number): void;

SubString(theFromIndex: number, theToIndex: number): TCollection_ExtendedString;

Split(theWhere: number): TCollection_ExtendedString;

Token(theSeparators: string, theWhichOne?: number): TCollection_ExtendedString;

ToExtString(): string;

Trunc(theHowMany: number): void;

Value(theWhere: number): string;

HashCode(): number;

static EmptyString(): TCollection_ExtendedString;

LengthOfCString(): number;

LeftAdjust(): void;

RightAdjust(): void;

LeftJustify(theWidth: number, theFiller: string): void;

RightJustify(theWidth: number, theFiller: string): void;

Center(theWidth: number, theFiller: string): void;

Capitalize(): void;

Prepend(theOther: TCollection_ExtendedString): void;
Prepend(theOther: string, theLength: number): void;
Prepend(theOther: TCollection_ExtendedString): void;
Prepend(theOther: string, theLength: number): void;

Prepend_2(theOther: string): void;

FirstLocationInSet(theSet: TCollection_ExtendedString, theFromIndex: number, theToIndex: number): number;

FirstLocationNotInSet(theSet: TCollection_ExtendedString, theFromIndex: number, theToIndex: number): number;

IntegerValue(): number;

IsIntegerValue(): boolean;

RealValue(): number;

IsRealValue(theToCheckFull?: boolean): boolean;

IsSameString(theOther: TCollection_ExtendedString, theIsCaseSensitive: boolean): boolean;

delete(): void;

[Symbol.dispose](): void;

TCollection_HAsciiString: declare class TCollection_HAsciiString extends Standard_Transient

constructor

AssignCat(other: string): void;
AssignCat(other: TCollection_HAsciiString): void;
AssignCat(other: string): void;
AssignCat(other: TCollection_HAsciiString): void;

Capitalize(): void;

Cat(other: string): TCollection_HAsciiString;
Cat(other: TCollection_HAsciiString): TCollection_HAsciiString;
Cat(other: string): TCollection_HAsciiString;
Cat(other: TCollection_HAsciiString): TCollection_HAsciiString;

Center(Width: number, Filler: string): void;

ChangeAll(aChar: string, NewChar: string, CaseSensitive?: boolean): void;

Clear(): void;

FirstLocationInSet(Set: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;

FirstLocationNotInSet(Set: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;

Insert(where: number, what: string): void;
Insert(where: number, what: string): void;
Insert(where: number, what: TCollection_HAsciiString): void;
Insert(where: number, what: string): void;
Insert(where: number, what: string): void;
Insert(where: number, what: TCollection_HAsciiString): void;
Insert(where: number, what: string): void;
Insert(where: number, what: string): void;
Insert(where: number, what: TCollection_HAsciiString): void;

InsertAfter(Index: number, other: TCollection_HAsciiString): void;

InsertBefore(Index: number, other: TCollection_HAsciiString): void;

IsEmpty(): boolean;

IsLess(other: TCollection_HAsciiString): boolean;

IsGreater(other: TCollection_HAsciiString): boolean;

IntegerValue(): number;

IsIntegerValue(): boolean;

IsRealValue(): boolean;

IsAscii(): boolean;

IsDifferent(S: TCollection_HAsciiString): boolean;

IsSameString(S: TCollection_HAsciiString): boolean;
IsSameString(S: TCollection_HAsciiString, CaseSensitive: boolean): boolean;
IsSameString(S: TCollection_HAsciiString): boolean;
IsSameString(S: TCollection_HAsciiString, CaseSensitive: boolean): boolean;

LeftAdjust(): void;

LeftJustify(Width: number, Filler: string): void;

Length(): number;

Location(other: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;
Location(N: number, C: string, FromIndex: number, ToIndex: number): number;
Location(other: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;
Location(N: number, C: string, FromIndex: number, ToIndex: number): number;

LowerCase(): void;

Prepend(other: TCollection_HAsciiString): void;

RealValue(): number;

RemoveAll(C: string, CaseSensitive: boolean): void;
RemoveAll(what: string): void;
RemoveAll(C: string, CaseSensitive: boolean): void;
RemoveAll(what: string): void;

Remove(where: number, ahowmany?: number): void;

RightAdjust(): void;

RightJustify(Width: number, Filler: string): void;

Search(what: string): number;
Search(what: TCollection_HAsciiString): number;
Search(what: string): number;
Search(what: TCollection_HAsciiString): number;

SearchFromEnd(what: string): number;
SearchFromEnd(what: TCollection_HAsciiString): number;
SearchFromEnd(what: string): number;
SearchFromEnd(what: TCollection_HAsciiString): number;

SetValue(where: number, what: string): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: TCollection_HAsciiString): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: TCollection_HAsciiString): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: TCollection_HAsciiString): void;

Split(where: number): TCollection_HAsciiString;

SubString(FromIndex: number, ToIndex: number): TCollection_HAsciiString;

ToCString(): string;

Token(separators?: string, whichone?: number): TCollection_HAsciiString;

Trunc(ahowmany: number): void;

UpperCase(): void;

UsefullLength(): number;

Value(where: number): string;

String(): TCollection_AsciiString;

IsSameState(other: TCollection_HAsciiString): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TCollection_HExtendedString: declare class TCollection_HExtendedString extends Standard_Transient

constructor

AssignCat(other: TCollection_HExtendedString): void;

Cat(other: TCollection_HExtendedString): TCollection_HExtendedString;

ChangeAll(aChar: string, NewChar: string): void;

Clear(): void;

IsEmpty(): boolean;

Insert(where: number, what: string): void;
Insert(where: number, what: TCollection_HExtendedString): void;
Insert(where: number, what: string): void;
Insert(where: number, what: TCollection_HExtendedString): void;

IsLess(other: TCollection_HExtendedString): boolean;

IsGreater(other: TCollection_HExtendedString): boolean;

IsAscii(): boolean;

Length(): number;

Remove(where: number, ahowmany?: number): void;

RemoveAll(what: string): void;

SetValue(where: number, what: string): void;
SetValue(where: number, what: TCollection_HExtendedString): void;
SetValue(where: number, what: string): void;
SetValue(where: number, what: TCollection_HExtendedString): void;

Split(where: number): TCollection_HExtendedString;

Search(what: TCollection_HExtendedString): number;

SearchFromEnd(what: TCollection_HExtendedString): number;

ToExtString(): string;

Token(separators: string, whichone?: number): TCollection_HExtendedString;

Trunc(ahowmany: number): void;

Value(where: number): string;

String(): TCollection_ExtendedString;

IsSameState(other: TCollection_HExtendedString): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
