# libcascade — NCollection (49)

10 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Sequence_handle_Transfer_Finder: declare class NCollection_Sequence_handle_Transfer_Finder extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Transfer_Finder): NCollection_Sequence_handle_Transfer_Finder;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Transfer_Finder): void;
Append(theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
Append(theItem: Transfer_Finder): void;
Append(theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

// Prepend one item
Prepend(theItem: Transfer_Finder): void;
Prepend(theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
Prepend(theItem: Transfer_Finder): void;
Prepend(theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Transfer_Finder): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
InsertBefore(theIndex: number, theItem: Transfer_Finder): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
InsertAfter(theIndex: number, theItem: Transfer_Finder): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
InsertAfter(theIndex: number, theItem: Transfer_Finder): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
// theSeq: Mutated in place

// First item access
First(): Transfer_Finder;

// First item access
ChangeFirst(): Transfer_Finder;

// Last item access
Last(): Transfer_Finder;

// Last item access
ChangeLast(): Transfer_Finder;

// Constant item access by theIndex
Value(theIndex: number): Transfer_Finder;

// Variable item access by theIndex
ChangeValue(theIndex: number): Transfer_Finder;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Transfer_Finder): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Transfer_Finder;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Transfer_Finder;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Units_Quantity: declare class NCollection_Sequence_handle_Units_Quantity extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Units_Quantity): NCollection_Sequence_handle_Units_Quantity;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Units_Quantity): void;
Append(theSeq: NCollection_Sequence_handle_Units_Quantity): void;
Append(theItem: Units_Quantity): void;
Append(theSeq: NCollection_Sequence_handle_Units_Quantity): void;

// Prepend one item
Prepend(theItem: Units_Quantity): void;
Prepend(theSeq: NCollection_Sequence_handle_Units_Quantity): void;
Prepend(theItem: Units_Quantity): void;
Prepend(theSeq: NCollection_Sequence_handle_Units_Quantity): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Units_Quantity): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;
InsertBefore(theIndex: number, theItem: Units_Quantity): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;
InsertAfter(theIndex: number, theItem: Units_Quantity): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;
InsertAfter(theIndex: number, theItem: Units_Quantity): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;
// theSeq: Mutated in place

// First item access
First(): Units_Quantity;

// First item access
ChangeFirst(): Units_Quantity;

// Last item access
Last(): Units_Quantity;

// Last item access
ChangeLast(): Units_Quantity;

// Constant item access by theIndex
Value(theIndex: number): Units_Quantity;

// Variable item access by theIndex
ChangeValue(theIndex: number): Units_Quantity;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Units_Quantity): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Units_Quantity;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Units_Quantity;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Units_Token: declare class NCollection_Sequence_handle_Units_Token extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Units_Token): NCollection_Sequence_handle_Units_Token;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Units_Token): void;
Append(theSeq: NCollection_Sequence_handle_Units_Token): void;
Append(theItem: Units_Token): void;
Append(theSeq: NCollection_Sequence_handle_Units_Token): void;

// Prepend one item
Prepend(theItem: Units_Token): void;
Prepend(theSeq: NCollection_Sequence_handle_Units_Token): void;
Prepend(theItem: Units_Token): void;
Prepend(theSeq: NCollection_Sequence_handle_Units_Token): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Units_Token): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;
InsertBefore(theIndex: number, theItem: Units_Token): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;
InsertAfter(theIndex: number, theItem: Units_Token): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;
InsertAfter(theIndex: number, theItem: Units_Token): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;
// theSeq: Mutated in place

// First item access
First(): Units_Token;

// First item access
ChangeFirst(): Units_Token;

// Last item access
Last(): Units_Token;

// Last item access
ChangeLast(): Units_Token;

// Constant item access by theIndex
Value(theIndex: number): Units_Token;

// Variable item access by theIndex
ChangeValue(theIndex: number): Units_Token;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Units_Token): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Units_Token;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Units_Token;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Units_Unit: declare class NCollection_Sequence_handle_Units_Unit extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Units_Unit): NCollection_Sequence_handle_Units_Unit;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Units_Unit): void;
Append(theSeq: NCollection_Sequence_handle_Units_Unit): void;
Append(theItem: Units_Unit): void;
Append(theSeq: NCollection_Sequence_handle_Units_Unit): void;

// Prepend one item
Prepend(theItem: Units_Unit): void;
Prepend(theSeq: NCollection_Sequence_handle_Units_Unit): void;
Prepend(theItem: Units_Unit): void;
Prepend(theSeq: NCollection_Sequence_handle_Units_Unit): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Units_Unit): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;
InsertBefore(theIndex: number, theItem: Units_Unit): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;
InsertAfter(theIndex: number, theItem: Units_Unit): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;
InsertAfter(theIndex: number, theItem: Units_Unit): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;
// theSeq: Mutated in place

// First item access
First(): Units_Unit;

// First item access
ChangeFirst(): Units_Unit;

// Last item access
Last(): Units_Unit;

// Last item access
ChangeLast(): Units_Unit;

// Constant item access by theIndex
Value(theIndex: number): Units_Unit;

// Variable item access by theIndex
ChangeValue(theIndex: number): Units_Unit;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Units_Unit): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Units_Unit;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Units_Unit;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject: declare class NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: XCAFDimTolObjects_DatumObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
Append(theItem: XCAFDimTolObjects_DatumObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

// Prepend one item
Prepend(theItem: XCAFDimTolObjects_DatumObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
Prepend(theItem: XCAFDimTolObjects_DatumObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
// theSeq: Mutated in place

// First item access
First(): XCAFDimTolObjects_DatumObject;

// First item access
ChangeFirst(): XCAFDimTolObjects_DatumObject;

// Last item access
Last(): XCAFDimTolObjects_DatumObject;

// Last item access
ChangeLast(): XCAFDimTolObjects_DatumObject;

// Constant item access by theIndex
Value(theIndex: number): XCAFDimTolObjects_DatumObject;

// Variable item access by theIndex
ChangeValue(theIndex: number): XCAFDimTolObjects_DatumObject;

// Set item value by theIndex
SetValue(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): XCAFDimTolObjects_DatumObject;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): XCAFDimTolObjects_DatumObject;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject: declare class NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: XCAFDimTolObjects_DimensionObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
Append(theItem: XCAFDimTolObjects_DimensionObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

// Prepend one item
Prepend(theItem: XCAFDimTolObjects_DimensionObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
Prepend(theItem: XCAFDimTolObjects_DimensionObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
// theSeq: Mutated in place

// First item access
First(): XCAFDimTolObjects_DimensionObject;

// First item access
ChangeFirst(): XCAFDimTolObjects_DimensionObject;

// Last item access
Last(): XCAFDimTolObjects_DimensionObject;

// Last item access
ChangeLast(): XCAFDimTolObjects_DimensionObject;

// Constant item access by theIndex
Value(theIndex: number): XCAFDimTolObjects_DimensionObject;

// Variable item access by theIndex
ChangeValue(theIndex: number): XCAFDimTolObjects_DimensionObject;

// Set item value by theIndex
SetValue(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): XCAFDimTolObjects_DimensionObject;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): XCAFDimTolObjects_DimensionObject;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject: declare class NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: XCAFDimTolObjects_GeomToleranceObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
Append(theItem: XCAFDimTolObjects_GeomToleranceObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

// Prepend one item
Prepend(theItem: XCAFDimTolObjects_GeomToleranceObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
Prepend(theItem: XCAFDimTolObjects_GeomToleranceObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
// theSeq: Mutated in place

// First item access
First(): XCAFDimTolObjects_GeomToleranceObject;

// First item access
ChangeFirst(): XCAFDimTolObjects_GeomToleranceObject;

// Last item access
Last(): XCAFDimTolObjects_GeomToleranceObject;

// Last item access
ChangeLast(): XCAFDimTolObjects_GeomToleranceObject;

// Constant item access by theIndex
Value(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;

// Variable item access by theIndex
ChangeValue(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;

// Set item value by theIndex
SetValue(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_int: declare class NCollection_Sequence_int extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_int): NCollection_Sequence_int;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: number): void;
Append(theSeq: NCollection_Sequence_int): void;
Append(theItem: number): void;
Append(theSeq: NCollection_Sequence_int): void;

// Prepend one item
Prepend(theItem: number): void;
Prepend(theSeq: NCollection_Sequence_int): void;
Prepend(theItem: number): void;
Prepend(theSeq: NCollection_Sequence_int): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: number): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_int): void;
InsertBefore(theIndex: number, theItem: number): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_int): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_int): void;
InsertAfter(theIndex: number, theItem: number): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_int): void;
InsertAfter(theIndex: number, theItem: number): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_int): void;
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

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void: declare class NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void: declare class NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
