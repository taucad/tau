# libcascade — NCollection (48)

8 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship: declare class NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: StepFEA_ElementGeometricRelationship): void;
Append(theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
Append(theItem: StepFEA_ElementGeometricRelationship): void;
Append(theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

// Prepend one item
Prepend(theItem: StepFEA_ElementGeometricRelationship): void;
Prepend(theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
Prepend(theItem: StepFEA_ElementGeometricRelationship): void;
Prepend(theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
InsertBefore(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
InsertAfter(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
InsertAfter(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship): void;
// theSeq: Mutated in place

// First item access
First(): StepFEA_ElementGeometricRelationship;

// First item access
ChangeFirst(): StepFEA_ElementGeometricRelationship;

// Last item access
Last(): StepFEA_ElementGeometricRelationship;

// Last item access
ChangeLast(): StepFEA_ElementGeometricRelationship;

// Constant item access by theIndex
Value(theIndex: number): StepFEA_ElementGeometricRelationship;

// Variable item access by theIndex
ChangeValue(theIndex: number): StepFEA_ElementGeometricRelationship;

// Set item value by theIndex
SetValue(theIndex: number, theItem: StepFEA_ElementGeometricRelationship): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepFEA_ElementGeometricRelationship;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepFEA_ElementGeometricRelationship;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_StepFEA_ElementRepresentation: declare class NCollection_Sequence_handle_StepFEA_ElementRepresentation extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_StepFEA_ElementRepresentation): NCollection_Sequence_handle_StepFEA_ElementRepresentation;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: StepFEA_ElementRepresentation): void;
Append(theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
Append(theItem: StepFEA_ElementRepresentation): void;
Append(theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

// Prepend one item
Prepend(theItem: StepFEA_ElementRepresentation): void;
Prepend(theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
Prepend(theItem: StepFEA_ElementRepresentation): void;
Prepend(theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: StepFEA_ElementRepresentation): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
InsertBefore(theIndex: number, theItem: StepFEA_ElementRepresentation): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
InsertAfter(theIndex: number, theItem: StepFEA_ElementRepresentation): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
InsertAfter(theIndex: number, theItem: StepFEA_ElementRepresentation): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
// theSeq: Mutated in place

// First item access
First(): StepFEA_ElementRepresentation;

// First item access
ChangeFirst(): StepFEA_ElementRepresentation;

// Last item access
Last(): StepFEA_ElementRepresentation;

// Last item access
ChangeLast(): StepFEA_ElementRepresentation;

// Constant item access by theIndex
Value(theIndex: number): StepFEA_ElementRepresentation;

// Variable item access by theIndex
ChangeValue(theIndex: number): StepFEA_ElementRepresentation;

// Set item value by theIndex
SetValue(theIndex: number, theItem: StepFEA_ElementRepresentation): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepFEA_ElementRepresentation;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepFEA_ElementRepresentation;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Storage_Root: declare class NCollection_Sequence_handle_Storage_Root extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Storage_Root): NCollection_Sequence_handle_Storage_Root;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Storage_Root): void;
Append(theSeq: NCollection_Sequence_handle_Storage_Root): void;
Append(theItem: Storage_Root): void;
Append(theSeq: NCollection_Sequence_handle_Storage_Root): void;

// Prepend one item
Prepend(theItem: Storage_Root): void;
Prepend(theSeq: NCollection_Sequence_handle_Storage_Root): void;
Prepend(theItem: Storage_Root): void;
Prepend(theSeq: NCollection_Sequence_handle_Storage_Root): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Storage_Root): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;
InsertBefore(theIndex: number, theItem: Storage_Root): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;
InsertAfter(theIndex: number, theItem: Storage_Root): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;
InsertAfter(theIndex: number, theItem: Storage_Root): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;
// theSeq: Mutated in place

// First item access
First(): Storage_Root;

// First item access
ChangeFirst(): Storage_Root;

// Last item access
Last(): Storage_Root;

// Last item access
ChangeLast(): Storage_Root;

// Constant item access by theIndex
Value(theIndex: number): Storage_Root;

// Variable item access by theIndex
ChangeValue(theIndex: number): Storage_Root;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Storage_Root): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Storage_Root;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Storage_Root;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_TCollection_HAsciiString: declare class NCollection_Sequence_handle_TCollection_HAsciiString extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_TCollection_HAsciiString): NCollection_Sequence_handle_TCollection_HAsciiString;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: TCollection_HAsciiString): void;
Append(theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
Append(theItem: TCollection_HAsciiString): void;
Append(theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

// Prepend one item
Prepend(theItem: TCollection_HAsciiString): void;
Prepend(theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
Prepend(theItem: TCollection_HAsciiString): void;
Prepend(theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: TCollection_HAsciiString): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
InsertBefore(theIndex: number, theItem: TCollection_HAsciiString): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
InsertAfter(theIndex: number, theItem: TCollection_HAsciiString): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
InsertAfter(theIndex: number, theItem: TCollection_HAsciiString): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
// theSeq: Mutated in place

// First item access
First(): TCollection_HAsciiString;

// First item access
ChangeFirst(): TCollection_HAsciiString;

// Last item access
Last(): TCollection_HAsciiString;

// Last item access
ChangeLast(): TCollection_HAsciiString;

// Constant item access by theIndex
Value(theIndex: number): TCollection_HAsciiString;

// Variable item access by theIndex
ChangeValue(theIndex: number): TCollection_HAsciiString;

// Set item value by theIndex
SetValue(theIndex: number, theItem: TCollection_HAsciiString): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TCollection_HAsciiString;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TCollection_HAsciiString;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_TCollection_HExtendedString: declare class NCollection_Sequence_handle_TCollection_HExtendedString extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_TCollection_HExtendedString): NCollection_Sequence_handle_TCollection_HExtendedString;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: TCollection_HExtendedString): void;
Append(theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
Append(theItem: TCollection_HExtendedString): void;
Append(theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

// Prepend one item
Prepend(theItem: TCollection_HExtendedString): void;
Prepend(theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
Prepend(theItem: TCollection_HExtendedString): void;
Prepend(theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: TCollection_HExtendedString): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
InsertBefore(theIndex: number, theItem: TCollection_HExtendedString): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
InsertAfter(theIndex: number, theItem: TCollection_HExtendedString): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
InsertAfter(theIndex: number, theItem: TCollection_HExtendedString): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
// theSeq: Mutated in place

// First item access
First(): TCollection_HExtendedString;

// First item access
ChangeFirst(): TCollection_HExtendedString;

// Last item access
Last(): TCollection_HExtendedString;

// Last item access
ChangeLast(): TCollection_HExtendedString;

// Constant item access by theIndex
Value(theIndex: number): TCollection_HExtendedString;

// Variable item access by theIndex
ChangeValue(theIndex: number): TCollection_HExtendedString;

// Set item value by theIndex
SetValue(theIndex: number, theItem: TCollection_HExtendedString): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TCollection_HExtendedString;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TCollection_HExtendedString;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_TDF_Attribute: declare class NCollection_Sequence_handle_TDF_Attribute extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_TDF_Attribute): NCollection_Sequence_handle_TDF_Attribute;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: TDF_Attribute): void;
Append(theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
Append(theItem: TDF_Attribute): void;
Append(theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

// Prepend one item
Prepend(theItem: TDF_Attribute): void;
Prepend(theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
Prepend(theItem: TDF_Attribute): void;
Prepend(theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: TDF_Attribute): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
InsertBefore(theIndex: number, theItem: TDF_Attribute): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
InsertAfter(theIndex: number, theItem: TDF_Attribute): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
InsertAfter(theIndex: number, theItem: TDF_Attribute): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
// theSeq: Mutated in place

// First item access
First(): TDF_Attribute;

// First item access
ChangeFirst(): TDF_Attribute;

// Last item access
Last(): TDF_Attribute;

// Last item access
ChangeLast(): TDF_Attribute;

// Constant item access by theIndex
Value(theIndex: number): TDF_Attribute;

// Variable item access by theIndex
ChangeValue(theIndex: number): TDF_Attribute;

// Set item value by theIndex
SetValue(theIndex: number, theItem: TDF_Attribute): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TDF_Attribute;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TDF_Attribute;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_TDocStd_ApplicationDelta: declare class NCollection_Sequence_handle_TDocStd_ApplicationDelta extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_TDocStd_ApplicationDelta): NCollection_Sequence_handle_TDocStd_ApplicationDelta;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: TDocStd_ApplicationDelta): void;
Append(theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
Append(theItem: TDocStd_ApplicationDelta): void;
Append(theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

// Prepend one item
Prepend(theItem: TDocStd_ApplicationDelta): void;
Prepend(theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
Prepend(theItem: TDocStd_ApplicationDelta): void;
Prepend(theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: TDocStd_ApplicationDelta): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
InsertBefore(theIndex: number, theItem: TDocStd_ApplicationDelta): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
InsertAfter(theIndex: number, theItem: TDocStd_ApplicationDelta): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
InsertAfter(theIndex: number, theItem: TDocStd_ApplicationDelta): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
// theSeq: Mutated in place

// First item access
First(): TDocStd_ApplicationDelta;

// First item access
ChangeFirst(): TDocStd_ApplicationDelta;

// Last item access
Last(): TDocStd_ApplicationDelta;

// Last item access
ChangeLast(): TDocStd_ApplicationDelta;

// Constant item access by theIndex
Value(theIndex: number): TDocStd_ApplicationDelta;

// Variable item access by theIndex
ChangeValue(theIndex: number): TDocStd_ApplicationDelta;

// Set item value by theIndex
SetValue(theIndex: number, theItem: TDocStd_ApplicationDelta): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TDocStd_ApplicationDelta;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TDocStd_ApplicationDelta;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_TDocStd_Document: declare class NCollection_Sequence_handle_TDocStd_Document extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_TDocStd_Document): NCollection_Sequence_handle_TDocStd_Document;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: TDocStd_Document): void;
Append(theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
Append(theItem: TDocStd_Document): void;
Append(theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

// Prepend one item
Prepend(theItem: TDocStd_Document): void;
Prepend(theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
Prepend(theItem: TDocStd_Document): void;
Prepend(theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: TDocStd_Document): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
InsertBefore(theIndex: number, theItem: TDocStd_Document): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
InsertAfter(theIndex: number, theItem: TDocStd_Document): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
InsertAfter(theIndex: number, theItem: TDocStd_Document): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
// theSeq: Mutated in place

// First item access
First(): TDocStd_Document;

// First item access
ChangeFirst(): TDocStd_Document;

// Last item access
Last(): TDocStd_Document;

// Last item access
ChangeLast(): TDocStd_Document;

// Constant item access by theIndex
Value(theIndex: number): TDocStd_Document;

// Variable item access by theIndex
ChangeValue(theIndex: number): TDocStd_Document;

// Set item value by theIndex
SetValue(theIndex: number, theItem: TDocStd_Document): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TDocStd_Document;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TDocStd_Document;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
