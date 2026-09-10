# libcascade — NCollection (44)

8 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif: declare class NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: XCAFDimTolObjects_DatumSingleModif): void;
Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
Append(theItem: XCAFDimTolObjects_DatumSingleModif): void;
Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

// Prepend one item
Prepend(theItem: XCAFDimTolObjects_DatumSingleModif): void;
Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
Prepend(theItem: XCAFDimTolObjects_DatumSingleModif): void;
Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;
// theSeq: Mutated in place

// First item access
First(): XCAFDimTolObjects_DatumSingleModif;

// First item access
ChangeFirst(): XCAFDimTolObjects_DatumSingleModif;

// Last item access
Last(): XCAFDimTolObjects_DatumSingleModif;

// Last item access
ChangeLast(): XCAFDimTolObjects_DatumSingleModif;

// Constant item access by theIndex
Value(theIndex: number): XCAFDimTolObjects_DatumSingleModif;

// Variable item access by theIndex
ChangeValue(theIndex: number): XCAFDimTolObjects_DatumSingleModif;

// Set item value by theIndex
SetValue(theIndex: number, theItem: XCAFDimTolObjects_DatumSingleModif): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): XCAFDimTolObjects_DatumSingleModif;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): XCAFDimTolObjects_DatumSingleModif;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_XCAFDimTolObjects_DimensionModif: declare class NCollection_Sequence_XCAFDimTolObjects_DimensionModif extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): NCollection_Sequence_XCAFDimTolObjects_DimensionModif;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: XCAFDimTolObjects_DimensionModif): void;
Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
Append(theItem: XCAFDimTolObjects_DimensionModif): void;
Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

// Prepend one item
Prepend(theItem: XCAFDimTolObjects_DimensionModif): void;
Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
Prepend(theItem: XCAFDimTolObjects_DimensionModif): void;
Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;
// theSeq: Mutated in place

// First item access
First(): XCAFDimTolObjects_DimensionModif;

// First item access
ChangeFirst(): XCAFDimTolObjects_DimensionModif;

// Last item access
Last(): XCAFDimTolObjects_DimensionModif;

// Last item access
ChangeLast(): XCAFDimTolObjects_DimensionModif;

// Constant item access by theIndex
Value(theIndex: number): XCAFDimTolObjects_DimensionModif;

// Variable item access by theIndex
ChangeValue(theIndex: number): XCAFDimTolObjects_DimensionModif;

// Set item value by theIndex
SetValue(theIndex: number, theItem: XCAFDimTolObjects_DimensionModif): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): XCAFDimTolObjects_DimensionModif;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): XCAFDimTolObjects_DimensionModif;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif: declare class NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: XCAFDimTolObjects_GeomToleranceModif): void;
Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
Append(theItem: XCAFDimTolObjects_GeomToleranceModif): void;
Append(theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

// Prepend one item
Prepend(theItem: XCAFDimTolObjects_GeomToleranceModif): void;
Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
Prepend(theItem: XCAFDimTolObjects_GeomToleranceModif): void;
Prepend(theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;
// theSeq: Mutated in place

// First item access
First(): XCAFDimTolObjects_GeomToleranceModif;

// First item access
ChangeFirst(): XCAFDimTolObjects_GeomToleranceModif;

// Last item access
Last(): XCAFDimTolObjects_GeomToleranceModif;

// Last item access
ChangeLast(): XCAFDimTolObjects_GeomToleranceModif;

// Constant item access by theIndex
Value(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;

// Variable item access by theIndex
ChangeValue(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;

// Set item value by theIndex
SetValue(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceModif): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): XCAFDimTolObjects_GeomToleranceModif;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_bool: declare class NCollection_Sequence_bool extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_bool): NCollection_Sequence_bool;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: boolean): void;
Append(theSeq: NCollection_Sequence_bool): void;
Append(theItem: boolean): void;
Append(theSeq: NCollection_Sequence_bool): void;

// Prepend one item
Prepend(theItem: boolean): void;
Prepend(theSeq: NCollection_Sequence_bool): void;
Prepend(theItem: boolean): void;
Prepend(theSeq: NCollection_Sequence_bool): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: boolean): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_bool): void;
InsertBefore(theIndex: number, theItem: boolean): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_bool): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_bool): void;
InsertAfter(theIndex: number, theItem: boolean): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_bool): void;
InsertAfter(theIndex: number, theItem: boolean): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_bool): void;
// theSeq: Mutated in place

// First item access
First(): boolean;

// First item access
ChangeFirst(): boolean;

// Last item access
Last(): boolean;

// Last item access
ChangeLast(): boolean;

// Constant item access by theIndex
Value(theIndex: number): boolean;

// Variable item access by theIndex
ChangeValue(theIndex: number): boolean;

// Set item value by theIndex
SetValue(theIndex: number, theItem: boolean): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): boolean;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): boolean;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_double: declare class NCollection_Sequence_double extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_double): NCollection_Sequence_double;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: number): void;
Append(theSeq: NCollection_Sequence_double): void;
Append(theItem: number): void;
Append(theSeq: NCollection_Sequence_double): void;

// Prepend one item
Prepend(theItem: number): void;
Prepend(theSeq: NCollection_Sequence_double): void;
Prepend(theItem: number): void;
Prepend(theSeq: NCollection_Sequence_double): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: number): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_double): void;
InsertBefore(theIndex: number, theItem: number): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_double): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_double): void;
InsertAfter(theIndex: number, theItem: number): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_double): void;
InsertAfter(theIndex: number, theItem: number): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_double): void;
// theSeq: Mutated in place

// First item access
First(): number;

// First item access
ChangeFirst(): number;

// Last item access
Last(): number;

// Last item access
ChangeLast(): number;

// Constant item access by theIndex
Value(theIndex: number): number;

// Variable item access by theIndex
ChangeValue(theIndex: number): number;

// Set item value by theIndex
SetValue(theIndex: number, theItem: number): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): number;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): number;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_gp_Pnt: declare class NCollection_Sequence_gp_Pnt extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_gp_Pnt): NCollection_Sequence_gp_Pnt;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: gp_Pnt): void;
Append(theSeq: NCollection_Sequence_gp_Pnt): void;
Append(theItem: gp_Pnt): void;
Append(theSeq: NCollection_Sequence_gp_Pnt): void;

// Prepend one item
Prepend(theItem: gp_Pnt): void;
Prepend(theSeq: NCollection_Sequence_gp_Pnt): void;
Prepend(theItem: gp_Pnt): void;
Prepend(theSeq: NCollection_Sequence_gp_Pnt): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: gp_Pnt): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;
InsertBefore(theIndex: number, theItem: gp_Pnt): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;
InsertAfter(theIndex: number, theItem: gp_Pnt): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;
InsertAfter(theIndex: number, theItem: gp_Pnt): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt): void;
// theSeq: Mutated in place

// First item access
First(): gp_Pnt;

// First item access
ChangeFirst(): gp_Pnt;

// Last item access
Last(): gp_Pnt;

// Last item access
ChangeLast(): gp_Pnt;

// Constant item access by theIndex
Value(theIndex: number): gp_Pnt;

// Variable item access by theIndex
ChangeValue(theIndex: number): gp_Pnt;

// Set item value by theIndex
SetValue(theIndex: number, theItem: gp_Pnt): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_Pnt;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_Pnt;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_gp_Pnt2d: declare class NCollection_Sequence_gp_Pnt2d extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_gp_Pnt2d): NCollection_Sequence_gp_Pnt2d;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: gp_Pnt2d): void;
Append(theSeq: NCollection_Sequence_gp_Pnt2d): void;
Append(theItem: gp_Pnt2d): void;
Append(theSeq: NCollection_Sequence_gp_Pnt2d): void;

// Prepend one item
Prepend(theItem: gp_Pnt2d): void;
Prepend(theSeq: NCollection_Sequence_gp_Pnt2d): void;
Prepend(theItem: gp_Pnt2d): void;
Prepend(theSeq: NCollection_Sequence_gp_Pnt2d): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: gp_Pnt2d): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;
InsertBefore(theIndex: number, theItem: gp_Pnt2d): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;
InsertAfter(theIndex: number, theItem: gp_Pnt2d): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;
InsertAfter(theIndex: number, theItem: gp_Pnt2d): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_gp_Pnt2d): void;
// theSeq: Mutated in place

// First item access
First(): gp_Pnt2d;

// First item access
ChangeFirst(): gp_Pnt2d;

// Last item access
Last(): gp_Pnt2d;

// Last item access
ChangeLast(): gp_Pnt2d;

// Constant item access by theIndex
Value(theIndex: number): gp_Pnt2d;

// Variable item access by theIndex
ChangeValue(theIndex: number): gp_Pnt2d;

// Set item value by theIndex
SetValue(theIndex: number, theItem: gp_Pnt2d): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_Pnt2d;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_Pnt2d;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_gp_Trsf: declare class NCollection_Sequence_gp_Trsf extends NCollection_BaseSequence

constructor

// Method for consistency with other collections
static Lower(): number;

// Method for consistency with other collections
Upper(): number;

// Empty query
IsEmpty(): boolean;

// Reverse sequence
Reverse(): void;

// Exchange two members
Exchange(I: number, J: number): void;

// Clear the items out, take a new allocator if non null
Clear(theAllocator?: NCollection_BaseAllocator): void;

// Replace this sequence by the items of theOther
Assign(theOther: NCollection_Sequence_gp_Trsf): NCollection_Sequence_gp_Trsf;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: gp_Trsf): void;
Append(theSeq: NCollection_Sequence_gp_Trsf): void;
Append(theItem: gp_Trsf): void;
Append(theSeq: NCollection_Sequence_gp_Trsf): void;

// Prepend one item
Prepend(theItem: gp_Trsf): void;
Prepend(theSeq: NCollection_Sequence_gp_Trsf): void;
Prepend(theItem: gp_Trsf): void;
Prepend(theSeq: NCollection_Sequence_gp_Trsf): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: gp_Trsf): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;
InsertBefore(theIndex: number, theItem: gp_Trsf): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;
InsertAfter(theIndex: number, theItem: gp_Trsf): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;
InsertAfter(theIndex: number, theItem: gp_Trsf): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_gp_Trsf): void;
// theSeq: Mutated in place

// First item access
First(): gp_Trsf;

// First item access
ChangeFirst(): gp_Trsf;

// Last item access
Last(): gp_Trsf;

// Last item access
ChangeLast(): gp_Trsf;

// Constant item access by theIndex
Value(theIndex: number): gp_Trsf;

// Variable item access by theIndex
ChangeValue(theIndex: number): gp_Trsf;

// Set item value by theIndex
SetValue(theIndex: number, theItem: gp_Trsf): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_Trsf;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_Trsf;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
