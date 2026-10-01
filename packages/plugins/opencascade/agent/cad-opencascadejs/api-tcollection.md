# libcascade — TCollection

5 top-level symbols. Signatures are verbatim typescript.

TCollection: declare class TCollection

  // TCollection.constructor (constructor)
  constructor();

  // TCollection.NextPrimeForMap (method)
  static NextPrimeForMap(I: number): number;

  // TCollection.delete (method)
  delete(): void;

  // TCollection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TCollection_AsciiString: declare class TCollection_AsciiString

  // TCollection_AsciiString.constructor (constructor)
  constructor();
  constructor(theStringView: string);
  constructor(theMessage: string);
  constructor(theValue: number);
  constructor(theString: TCollection_AsciiString);
  constructor(theMessage: string, theLength: number);
  constructor(theLength: number, theFiller: string);
  constructor(theString: TCollection_AsciiString, theChar: string);
  constructor(theString: TCollection_AsciiString, theMessage: string);
  constructor(theString: TCollection_AsciiString, theOtherString: TCollection_AsciiString);
  constructor(theExtendedString: TCollection_ExtendedString, theReplaceNonAscii?: string);

  // TCollection_AsciiString.AssignCat (method)
  AssignCat(theOther: string): void;
  AssignCat(theOther: number): void;
  AssignCat(theOther: TCollection_AsciiString): void;
  AssignCat(theCString: string): void;
  AssignCat(theStringView: string): void;
  AssignCat(theOther: TCollection_ExtendedString, theReplaceNonAscii: string): void;
  AssignCat(theString: string, theLength: number): void;

  // TCollection_AsciiString.Capitalize (method)
  Capitalize(): void;

  // TCollection_AsciiString.Cat (method)
  Cat(theOther: string): TCollection_AsciiString;
  Cat(theOther: number): TCollection_AsciiString;
  Cat(theOther: TCollection_AsciiString): TCollection_AsciiString;
  Cat(theCString: string): TCollection_AsciiString;
  Cat(theStringView: string): TCollection_AsciiString;
  Cat(theString: string, theLength: number): TCollection_AsciiString;
  Cat(theOther: TCollection_ExtendedString, theReplaceNonAscii: string): TCollection_AsciiString;

  // TCollection_AsciiString.Center (method)
  Center(theWidth: number, theFiller: string): void;

  // TCollection_AsciiString.ChangeAll (method)
  ChangeAll(theChar: string, theNewChar: string, theCaseSensitive?: boolean): void;

  // TCollection_AsciiString.Clear (method)
  Clear(): void;

  // TCollection_AsciiString.Copy (method)
  Copy(theCString: string): void;
  Copy(theStringView: string): void;
  Copy(theFromWhere: TCollection_AsciiString): void;
  Copy(theString: string, theLength: number): void;

  // TCollection_AsciiString.Swap (method)
  Swap(theOther: TCollection_AsciiString): void;

  // TCollection_AsciiString.FirstLocationInSet (method)
  FirstLocationInSet(theSet: TCollection_AsciiString, theFromIndex: number, theToIndex: number): number;
  FirstLocationInSet(theSet: string, theFromIndex: number, theToIndex: number): number;
  FirstLocationInSet(theSet: string, theSetLength: number, theFromIndex: number, theToIndex: number): number;

  // TCollection_AsciiString.FirstLocationNotInSet (method)
  FirstLocationNotInSet(theSet: TCollection_AsciiString, theFromIndex: number, theToIndex: number): number;
  FirstLocationNotInSet(theSet: string, theFromIndex: number, theToIndex: number): number;
  FirstLocationNotInSet(theSet: string, theSetLength: number, theFromIndex: number, theToIndex: number): number;

  // TCollection_AsciiString.Insert (method)
  Insert(theWhere: number, theWhat: string): void;
  Insert(theWhere: number, theWhat: TCollection_AsciiString): void;
  Insert(theWhere: number, theCString: string): void;
  Insert(theWhere: number, theStringView: string): void;
  Insert(theWhere: number, theString: string, theLength: number): void;

  // TCollection_AsciiString.InsertAfter (method)
  InsertAfter(theIndex: number, theOther: TCollection_AsciiString): void;
  InsertAfter(theIndex: number, theCString: string): void;
  InsertAfter(theIndex: number, theStringView: string): void;
  InsertAfter(theIndex: number, theString: string, theLength: number): void;

  // TCollection_AsciiString.InsertBefore (method)
  InsertBefore(theIndex: number, theOther: TCollection_AsciiString): void;
  InsertBefore(theIndex: number, theCString: string): void;
  InsertBefore(theIndex: number, theStringView: string): void;
  InsertBefore(theIndex: number, theString: string, theLength: number): void;

  // TCollection_AsciiString.IsEmpty (method)
  IsEmpty(): boolean;

  // TCollection_AsciiString.IsEqual (method)
  IsEqual(theOther: TCollection_AsciiString): boolean;
  IsEqual(theCString: string): boolean;
  IsEqual(theStringView: string): boolean;
  IsEqual(theString: string, theLength: number): boolean;
  static IsEqual(string1: TCollection_AsciiString, string2: TCollection_AsciiString): boolean;
  static IsEqual(string1: TCollection_AsciiString, string2: string): boolean;
  static IsEqual(theString1: TCollection_AsciiString, theStringView: string): boolean;
  static IsEqual(theStringView: string, theString2: TCollection_AsciiString): boolean;

  // TCollection_AsciiString.IsDifferent (method)
  IsDifferent(theOther: TCollection_AsciiString): boolean;
  IsDifferent(theCString: string): boolean;
  IsDifferent(theStringView: string): boolean;
  IsDifferent(theString: string, theLength: number): boolean;

  // TCollection_AsciiString.IsLess (method)
  IsLess(theOther: TCollection_AsciiString): boolean;
  IsLess(theCString: string): boolean;
  IsLess(theStringView: string): boolean;
  IsLess(theString: string, theLength: number): boolean;

  // TCollection_AsciiString.IsGreater (method)
  IsGreater(theOther: TCollection_AsciiString): boolean;
  IsGreater(theCString: string): boolean;
  IsGreater(theStringView: string): boolean;
  IsGreater(theString: string, theLength: number): boolean;

  // TCollection_AsciiString.StartsWith (method)
  StartsWith(theStartString: TCollection_AsciiString): boolean;
  StartsWith(theCString: string): boolean;
  StartsWith(theStartString: string): boolean;
  StartsWith(theStartString: string, theStartLength: number): boolean;

  // TCollection_AsciiString.EndsWith (method)
  EndsWith(theEndString: TCollection_AsciiString): boolean;
  EndsWith(theEndString: string): boolean;
  EndsWith(theEndString: string, theEndLength: number): boolean;

  // TCollection_AsciiString.IntegerValue (method)
  IntegerValue(): number;

  // TCollection_AsciiString.IsIntegerValue (method)
  IsIntegerValue(): boolean;

  // TCollection_AsciiString.IsRealValue (method)
  IsRealValue(theToCheckFull?: boolean): boolean;

  // TCollection_AsciiString.IsAscii (method)
  IsAscii(): boolean;

  // TCollection_AsciiString.LeftAdjust (method)
  LeftAdjust(): void;

  // TCollection_AsciiString.LeftJustify (method)
  LeftJustify(theWidth: number, theFiller: string): void;

  // TCollection_AsciiString.Length (method)
  Length(): number;

  // TCollection_AsciiString.Location (method)
  Location(theOther: TCollection_AsciiString, theFromIndex: number, theToIndex: number): number;
  Location(theN: number, theC: string, theFromIndex: number, theToIndex: number): number;

  // TCollection_AsciiString.LowerCase (method)
  LowerCase(): void;

  // TCollection_AsciiString.Prepend (method)
  Prepend(theOther: TCollection_AsciiString): void;

  // TCollection_AsciiString.RealValue (method)
  RealValue(): number;

  // TCollection_AsciiString.RemoveAll (method)
  RemoveAll(theC: string, theCaseSensitive: boolean): void;
  RemoveAll(theWhat: string): void;

  // TCollection_AsciiString.Remove (method)
  Remove(theWhere: number, theHowMany?: number): void;

  // TCollection_AsciiString.RightAdjust (method)
  RightAdjust(): void;

  // TCollection_AsciiString.RightJustify (method)
  RightJustify(theWidth: number, theFiller: string): void;

  // TCollection_AsciiString.Search (method)
  Search(theWhat: TCollection_AsciiString): number;
  Search(theCString: string): number;
  Search(theWhat: string): number;
  Search(theWhat: string, theWhatLength: number): number;

  // TCollection_AsciiString.SearchFromEnd (method)
  SearchFromEnd(theWhat: TCollection_AsciiString): number;
  SearchFromEnd(theCString: string): number;
  SearchFromEnd(theWhat: string): number;
  SearchFromEnd(theWhat: string, theWhatLength: number): number;

  // TCollection_AsciiString.SetValue (method)
  SetValue(theWhere: number, theWhat: string): void;
  SetValue(theWhere: number, theWhat: TCollection_AsciiString): void;
  SetValue(theWhere: number, theCString: string): void;
  SetValue(theWhere: number, theStringView: string): void;
  SetValue(theWhere: number, theString: string, theLength: number): void;

  // TCollection_AsciiString.Split (method)
  Split(theWhere: number): TCollection_AsciiString;

  // TCollection_AsciiString.SubString (method)
  SubString(theFromIndex: number, theToIndex: number): TCollection_AsciiString;

  // TCollection_AsciiString.ToCString (method)
  ToCString(): string;

  // TCollection_AsciiString.Token (method)
  Token(theSeparators?: string, theWhichOne?: number): TCollection_AsciiString;

  // TCollection_AsciiString.Trunc (method)
  Trunc(theHowMany: number): void;

  // TCollection_AsciiString.UpperCase (method)
  UpperCase(): void;

  // TCollection_AsciiString.UsefullLength (method)
  UsefullLength(): number;

  // TCollection_AsciiString.Value (method)
  Value(theWhere: number): string;

  // TCollection_AsciiString.HashCode (method)
  HashCode(): number;

  // TCollection_AsciiString.EmptyString (method)
  static EmptyString(): TCollection_AsciiString;

  // TCollection_AsciiString.IsSameString (method)
  static IsSameString(theString1: TCollection_AsciiString, theString2: TCollection_AsciiString, theIsCaseSensitive: boolean): boolean;
  static IsSameString(theString1: TCollection_AsciiString, theCString: string, theIsCaseSensitive: boolean): boolean;
  static IsSameString(theCString: string, theString2: TCollection_AsciiString, theIsCaseSensitive: boolean): boolean;
  static IsSameString(theString1: TCollection_AsciiString, theStringView: string, theIsCaseSensitive: boolean): boolean;
  static IsSameString(theStringView: string, theString2: TCollection_AsciiString, theIsCaseSensitive: boolean): boolean;
  static IsSameString(theCString1: string, theCString2: string, theIsCaseSensitive: boolean): boolean;
  static IsSameString(theStringView1: string, theStringView2: string, theIsCaseSensitive: boolean): boolean;
  static IsSameString(theString1: string, theLength1: number, theString2: string, theLength2: number, theIsCaseSensitive: boolean): boolean;

  // TCollection_AsciiString.delete (method)
  delete(): void;

  // TCollection_AsciiString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TCollection_ExtendedString: declare class TCollection_ExtendedString

  // TCollection_ExtendedString.constructor (constructor)
  constructor();
  constructor(theValue: number);
  constructor(theString: TCollection_ExtendedString);
  constructor(theStringView: string);
  constructor(theString: string, theIsMultiByte?: boolean);
  constructor(theString: TCollection_AsciiString, theIsMultiByte?: boolean);

  // TCollection_ExtendedString.AssignCat (method)
  AssignCat(theOther: TCollection_ExtendedString): void;
  AssignCat(theOther: number): void;
  AssignCat(theChar: string): void;
  AssignCat(theStringView: string): void;
  AssignCat(theString: string, theLength: number): void;

  // TCollection_ExtendedString.Cat (method)
  Cat(theOther: number): TCollection_ExtendedString;
  Cat(theOther: TCollection_ExtendedString): TCollection_ExtendedString;
  Cat(theOther: string, theLength: number): TCollection_ExtendedString;

  // TCollection_ExtendedString.Cat_2 (method)
  Cat_2(theOther: string): TCollection_ExtendedString;

  // TCollection_ExtendedString.ChangeAll (method)
  ChangeAll(theChar: string, theNewChar: string): void;

  // TCollection_ExtendedString.Clear (method)
  Clear(): void;

  // TCollection_ExtendedString.Copy (method)
  Copy(theFromWhere: TCollection_ExtendedString): void;
  Copy(theString: string, theLength: number): void;

  // TCollection_ExtendedString.Copy_2 (method)
  Copy_2(theString: string): void;

  // TCollection_ExtendedString.Swap (method)
  Swap(theOther: TCollection_ExtendedString): void;

  // TCollection_ExtendedString.Insert (method)
  Insert(theWhere: number, theWhat: string): void;
  Insert(theWhere: number, theWhat: TCollection_ExtendedString): void;
  Insert(theWhere: number, theWhat: string, theLength: number): void;

  // TCollection_ExtendedString.IsEmpty (method)
  IsEmpty(): boolean;

  // TCollection_ExtendedString.IsEqual (method)
  IsEqual(theOther: TCollection_ExtendedString): boolean;
  static IsEqual(theString1: TCollection_ExtendedString, theString2: TCollection_ExtendedString): boolean;

  // TCollection_ExtendedString.IsEqual_2 (method)
  IsEqual_2(theOther: string): boolean;

  // TCollection_ExtendedString.IsEqual_1 (method)
  IsEqual_1(theOther: string, theLength: number): boolean;

  // TCollection_ExtendedString.IsDifferent (method)
  IsDifferent(theOther: TCollection_ExtendedString): boolean;
  IsDifferent(theOther: string, theLength: number): boolean;

  // TCollection_ExtendedString.IsDifferent_2 (method)
  IsDifferent_2(theOther: string): boolean;

  // TCollection_ExtendedString.IsLess (method)
  IsLess(theOther: TCollection_ExtendedString): boolean;
  IsLess(theOther: string, theLength: number): boolean;

  // TCollection_ExtendedString.IsLess_2 (method)
  IsLess_2(theOther: string): boolean;

  // TCollection_ExtendedString.IsGreater (method)
  IsGreater(theOther: TCollection_ExtendedString): boolean;
  IsGreater(theOther: string, theLength: number): boolean;

  // TCollection_ExtendedString.IsGreater_2 (method)
  IsGreater_2(theOther: string): boolean;

  // TCollection_ExtendedString.StartsWith (method)
  StartsWith(theStartString: TCollection_ExtendedString): boolean;
  StartsWith(theStartString: string, theLength: number): boolean;

  // TCollection_ExtendedString.StartsWith_2 (method)
  StartsWith_2(theStartString: string): boolean;

  // TCollection_ExtendedString.EndsWith (method)
  EndsWith(theEndString: TCollection_ExtendedString): boolean;
  EndsWith(theEndString: string, theLength: number): boolean;

  // TCollection_ExtendedString.EndsWith_2 (method)
  EndsWith_2(theEndString: string): boolean;

  // TCollection_ExtendedString.IsAscii (method)
  IsAscii(): boolean;

  // TCollection_ExtendedString.Length (method)
  Length(): number;

  // TCollection_ExtendedString.RemoveAll (method)
  RemoveAll(theWhat: string): void;

  // TCollection_ExtendedString.Remove (method)
  Remove(theWhere: number, theHowMany?: number): void;

  // TCollection_ExtendedString.Search (method)
  Search(theWhat: TCollection_ExtendedString): number;
  Search(theWhat: string, theLength: number): number;

  // TCollection_ExtendedString.Search_2 (method)
  Search_2(theWhat: string): number;

  // TCollection_ExtendedString.SearchFromEnd (method)
  SearchFromEnd(theWhat: TCollection_ExtendedString): number;
  SearchFromEnd(theWhat: string, theLength: number): number;

  // TCollection_ExtendedString.SearchFromEnd_2 (method)
  SearchFromEnd_2(theWhat: string): number;

  // TCollection_ExtendedString.SetValue (method)
  SetValue(theWhere: number, theWhat: string): void;
  SetValue(theWhere: number, theWhat: TCollection_ExtendedString): void;
  SetValue(theWhere: number, theWhat: string, theLength: number): void;

  // TCollection_ExtendedString.SubString (method)
  SubString(theFromIndex: number, theToIndex: number): TCollection_ExtendedString;

  // TCollection_ExtendedString.Split (method)
  Split(theWhere: number): TCollection_ExtendedString;

  // TCollection_ExtendedString.Token (method)
  Token(theSeparators: string, theWhichOne?: number): TCollection_ExtendedString;

  // TCollection_ExtendedString.ToExtString (method)
  ToExtString(): string;

  // TCollection_ExtendedString.Trunc (method)
  Trunc(theHowMany: number): void;

  // TCollection_ExtendedString.Value (method)
  Value(theWhere: number): string;

  // TCollection_ExtendedString.HashCode (method)
  HashCode(): number;

  // TCollection_ExtendedString.EmptyString (method)
  static EmptyString(): TCollection_ExtendedString;

  // TCollection_ExtendedString.LengthOfCString (method)
  LengthOfCString(): number;

  // TCollection_ExtendedString.LeftAdjust (method)
  LeftAdjust(): void;

  // TCollection_ExtendedString.RightAdjust (method)
  RightAdjust(): void;

  // TCollection_ExtendedString.LeftJustify (method)
  LeftJustify(theWidth: number, theFiller: string): void;

  // TCollection_ExtendedString.RightJustify (method)
  RightJustify(theWidth: number, theFiller: string): void;

  // TCollection_ExtendedString.Center (method)
  Center(theWidth: number, theFiller: string): void;

  // TCollection_ExtendedString.Capitalize (method)
  Capitalize(): void;

  // TCollection_ExtendedString.Prepend (method)
  Prepend(theOther: TCollection_ExtendedString): void;
  Prepend(theOther: string, theLength: number): void;

  // TCollection_ExtendedString.Prepend_2 (method)
  Prepend_2(theOther: string): void;

  // TCollection_ExtendedString.FirstLocationInSet (method)
  FirstLocationInSet(theSet: TCollection_ExtendedString, theFromIndex: number, theToIndex: number): number;

  // TCollection_ExtendedString.FirstLocationNotInSet (method)
  FirstLocationNotInSet(theSet: TCollection_ExtendedString, theFromIndex: number, theToIndex: number): number;

  // TCollection_ExtendedString.IntegerValue (method)
  IntegerValue(): number;

  // TCollection_ExtendedString.IsIntegerValue (method)
  IsIntegerValue(): boolean;

  // TCollection_ExtendedString.RealValue (method)
  RealValue(): number;

  // TCollection_ExtendedString.IsRealValue (method)
  IsRealValue(theToCheckFull?: boolean): boolean;

  // TCollection_ExtendedString.IsSameString (method)
  IsSameString(theOther: TCollection_ExtendedString, theIsCaseSensitive: boolean): boolean;

  // TCollection_ExtendedString.delete (method)
  delete(): void;

  // TCollection_ExtendedString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TCollection_HAsciiString: declare class TCollection_HAsciiString extends Standard_Transient

  // TCollection_HAsciiString.constructor (constructor)
  constructor();
  constructor(message: string);
  constructor(value: number);
  constructor(aString: TCollection_AsciiString);
  constructor(aString: TCollection_HAsciiString);
  constructor(length: number, filler: string);
  constructor(aString: TCollection_HExtendedString, replaceNonAscii: string);

  // TCollection_HAsciiString.AssignCat (method)
  AssignCat(other: string): void;
  AssignCat(other: TCollection_HAsciiString): void;

  // TCollection_HAsciiString.Capitalize (method)
  Capitalize(): void;

  // TCollection_HAsciiString.Cat (method)
  Cat(other: string): TCollection_HAsciiString;
  Cat(other: TCollection_HAsciiString): TCollection_HAsciiString;

  // TCollection_HAsciiString.Center (method)
  Center(Width: number, Filler: string): void;

  // TCollection_HAsciiString.ChangeAll (method)
  ChangeAll(aChar: string, NewChar: string, CaseSensitive?: boolean): void;

  // TCollection_HAsciiString.Clear (method)
  Clear(): void;

  // TCollection_HAsciiString.FirstLocationInSet (method)
  FirstLocationInSet(Set: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;

  // TCollection_HAsciiString.FirstLocationNotInSet (method)
  FirstLocationNotInSet(Set: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;

  // TCollection_HAsciiString.Insert (method)
  Insert(where: number, what: string): void;
  Insert(where: number, what: TCollection_HAsciiString): void;

  // TCollection_HAsciiString.InsertAfter (method)
  InsertAfter(Index: number, other: TCollection_HAsciiString): void;

  // TCollection_HAsciiString.InsertBefore (method)
  InsertBefore(Index: number, other: TCollection_HAsciiString): void;

  // TCollection_HAsciiString.IsEmpty (method)
  IsEmpty(): boolean;

  // TCollection_HAsciiString.IsLess (method)
  IsLess(other: TCollection_HAsciiString): boolean;

  // TCollection_HAsciiString.IsGreater (method)
  IsGreater(other: TCollection_HAsciiString): boolean;

  // TCollection_HAsciiString.IntegerValue (method)
  IntegerValue(): number;

  // TCollection_HAsciiString.IsIntegerValue (method)
  IsIntegerValue(): boolean;

  // TCollection_HAsciiString.IsRealValue (method)
  IsRealValue(): boolean;

  // TCollection_HAsciiString.IsAscii (method)
  IsAscii(): boolean;

  // TCollection_HAsciiString.IsDifferent (method)
  IsDifferent(S: TCollection_HAsciiString): boolean;

  // TCollection_HAsciiString.IsSameString (method)
  IsSameString(S: TCollection_HAsciiString): boolean;
  IsSameString(S: TCollection_HAsciiString, CaseSensitive: boolean): boolean;

  // TCollection_HAsciiString.LeftAdjust (method)
  LeftAdjust(): void;

  // TCollection_HAsciiString.LeftJustify (method)
  LeftJustify(Width: number, Filler: string): void;

  // TCollection_HAsciiString.Length (method)
  Length(): number;

  // TCollection_HAsciiString.Location (method)
  Location(other: TCollection_HAsciiString, FromIndex: number, ToIndex: number): number;
  Location(N: number, C: string, FromIndex: number, ToIndex: number): number;

  // TCollection_HAsciiString.LowerCase (method)
  LowerCase(): void;

  // TCollection_HAsciiString.Prepend (method)
  Prepend(other: TCollection_HAsciiString): void;

  // TCollection_HAsciiString.RealValue (method)
  RealValue(): number;

  // TCollection_HAsciiString.RemoveAll (method)
  RemoveAll(C: string, CaseSensitive: boolean): void;
  RemoveAll(what: string): void;

  // TCollection_HAsciiString.Remove (method)
  Remove(where: number, ahowmany?: number): void;

  // TCollection_HAsciiString.RightAdjust (method)
  RightAdjust(): void;

  // TCollection_HAsciiString.RightJustify (method)
  RightJustify(Width: number, Filler: string): void;

  // TCollection_HAsciiString.Search (method)
  Search(what: string): number;
  Search(what: TCollection_HAsciiString): number;

  // TCollection_HAsciiString.SearchFromEnd (method)
  SearchFromEnd(what: string): number;
  SearchFromEnd(what: TCollection_HAsciiString): number;

  // TCollection_HAsciiString.SetValue (method)
  SetValue(where: number, what: string): void;
  SetValue(where: number, what: TCollection_HAsciiString): void;

  // TCollection_HAsciiString.Split (method)
  Split(where: number): TCollection_HAsciiString;

  // TCollection_HAsciiString.SubString (method)
  SubString(FromIndex: number, ToIndex: number): TCollection_HAsciiString;

  // TCollection_HAsciiString.ToCString (method)
  ToCString(): string;

  // TCollection_HAsciiString.Token (method)
  Token(separators?: string, whichone?: number): TCollection_HAsciiString;

  // TCollection_HAsciiString.Trunc (method)
  Trunc(ahowmany: number): void;

  // TCollection_HAsciiString.UpperCase (method)
  UpperCase(): void;

  // TCollection_HAsciiString.UsefullLength (method)
  UsefullLength(): number;

  // TCollection_HAsciiString.Value (method)
  Value(where: number): string;

  // TCollection_HAsciiString.String (method)
  String(): TCollection_AsciiString;

  // TCollection_HAsciiString.IsSameState (method)
  IsSameState(other: TCollection_HAsciiString): boolean;

  // TCollection_HAsciiString.get_type_name (method)
  static get_type_name(): string;

  // TCollection_HAsciiString.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TCollection_HAsciiString.DynamicType (method)
  DynamicType(): Standard_Type;

  // TCollection_HAsciiString.delete (method)
  delete(): void;

  // TCollection_HAsciiString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TCollection_HExtendedString: declare class TCollection_HExtendedString extends Standard_Transient

  // TCollection_HExtendedString.constructor (constructor)
  constructor();
  constructor(message: string);
  constructor(aString: TCollection_ExtendedString);
  constructor(aString: TCollection_HAsciiString);
  constructor(aString: TCollection_HExtendedString);

  // TCollection_HExtendedString.AssignCat (method)
  AssignCat(other: TCollection_HExtendedString): void;

  // TCollection_HExtendedString.Cat (method)
  Cat(other: TCollection_HExtendedString): TCollection_HExtendedString;

  // TCollection_HExtendedString.ChangeAll (method)
  ChangeAll(aChar: string, NewChar: string): void;

  // TCollection_HExtendedString.Clear (method)
  Clear(): void;

  // TCollection_HExtendedString.IsEmpty (method)
  IsEmpty(): boolean;

  // TCollection_HExtendedString.Insert (method)
  Insert(where: number, what: string): void;
  Insert(where: number, what: TCollection_HExtendedString): void;

  // TCollection_HExtendedString.IsLess (method)
  IsLess(other: TCollection_HExtendedString): boolean;

  // TCollection_HExtendedString.IsGreater (method)
  IsGreater(other: TCollection_HExtendedString): boolean;

  // TCollection_HExtendedString.IsAscii (method)
  IsAscii(): boolean;

  // TCollection_HExtendedString.Length (method)
  Length(): number;

  // TCollection_HExtendedString.Remove (method)
  Remove(where: number, ahowmany?: number): void;

  // TCollection_HExtendedString.RemoveAll (method)
  RemoveAll(what: string): void;

  // TCollection_HExtendedString.SetValue (method)
  SetValue(where: number, what: string): void;
  SetValue(where: number, what: TCollection_HExtendedString): void;

  // TCollection_HExtendedString.Split (method)
  Split(where: number): TCollection_HExtendedString;

  // TCollection_HExtendedString.Search (method)
  Search(what: TCollection_HExtendedString): number;

  // TCollection_HExtendedString.SearchFromEnd (method)
  SearchFromEnd(what: TCollection_HExtendedString): number;

  // TCollection_HExtendedString.ToExtString (method)
  ToExtString(): string;

  // TCollection_HExtendedString.Token (method)
  Token(separators: string, whichone?: number): TCollection_HExtendedString;

  // TCollection_HExtendedString.Trunc (method)
  Trunc(ahowmany: number): void;

  // TCollection_HExtendedString.Value (method)
  Value(where: number): string;

  // TCollection_HExtendedString.String (method)
  String(): TCollection_ExtendedString;

  // TCollection_HExtendedString.IsSameState (method)
  IsSameState(other: TCollection_HExtendedString): boolean;

  // TCollection_HExtendedString.get_type_name (method)
  static get_type_name(): string;

  // TCollection_HExtendedString.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TCollection_HExtendedString.DynamicType (method)
  DynamicType(): Standard_Type;

  // TCollection_HExtendedString.delete (method)
  delete(): void;

  // TCollection_HExtendedString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
