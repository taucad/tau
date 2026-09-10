# libcascade — NCollection (43)

8 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Sequence_PCDM_Reference: declare class NCollection_Sequence_PCDM_Reference extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_PCDM_Reference): NCollection_Sequence_PCDM_Reference;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: PCDM_Reference): void;
Append(theSeq: NCollection_Sequence_PCDM_Reference): void;
Append(theItem: PCDM_Reference): void;
Append(theSeq: NCollection_Sequence_PCDM_Reference): void;

// Prepend one item
Prepend(theItem: PCDM_Reference): void;
Prepend(theSeq: NCollection_Sequence_PCDM_Reference): void;
Prepend(theItem: PCDM_Reference): void;
Prepend(theSeq: NCollection_Sequence_PCDM_Reference): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: PCDM_Reference): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_PCDM_Reference): void;
InsertBefore(theIndex: number, theItem: PCDM_Reference): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_PCDM_Reference): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_PCDM_Reference): void;
InsertAfter(theIndex: number, theItem: PCDM_Reference): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_PCDM_Reference): void;
InsertAfter(theIndex: number, theItem: PCDM_Reference): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_PCDM_Reference): void;
// theSeq: Mutated in place

// First item access
First(): PCDM_Reference;

// First item access
ChangeFirst(): PCDM_Reference;

// Last item access
Last(): PCDM_Reference;

// Last item access
ChangeLast(): PCDM_Reference;

// Constant item access by theIndex
Value(theIndex: number): PCDM_Reference;

// Variable item access by theIndex
ChangeValue(theIndex: number): PCDM_Reference;

// Set item value by theIndex
SetValue(theIndex: number, theItem: PCDM_Reference): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): PCDM_Reference;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): PCDM_Reference;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_Plate_PinpointConstraint: declare class NCollection_Sequence_Plate_PinpointConstraint extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_Plate_PinpointConstraint): NCollection_Sequence_Plate_PinpointConstraint;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Plate_PinpointConstraint): void;
Append(theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;
Append(theItem: Plate_PinpointConstraint): void;
Append(theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;

// Prepend one item
Prepend(theItem: Plate_PinpointConstraint): void;
Prepend(theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;
Prepend(theItem: Plate_PinpointConstraint): void;
Prepend(theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Plate_PinpointConstraint): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;
InsertBefore(theIndex: number, theItem: Plate_PinpointConstraint): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;
InsertAfter(theIndex: number, theItem: Plate_PinpointConstraint): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;
InsertAfter(theIndex: number, theItem: Plate_PinpointConstraint): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_Plate_PinpointConstraint): void;
// theSeq: Mutated in place

// First item access
First(): Plate_PinpointConstraint;

// First item access
ChangeFirst(): Plate_PinpointConstraint;

// Last item access
Last(): Plate_PinpointConstraint;

// Last item access
ChangeLast(): Plate_PinpointConstraint;

// Constant item access by theIndex
Value(theIndex: number): Plate_PinpointConstraint;

// Variable item access by theIndex
ChangeValue(theIndex: number): Plate_PinpointConstraint;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Plate_PinpointConstraint): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Plate_PinpointConstraint;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Plate_PinpointConstraint;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_RWGltf_GltfPrimArrayData: declare class NCollection_Sequence_RWGltf_GltfPrimArrayData extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_RWGltf_GltfPrimArrayData): NCollection_Sequence_RWGltf_GltfPrimArrayData;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: RWGltf_GltfPrimArrayData): void;
Append(theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;
Append(theItem: RWGltf_GltfPrimArrayData): void;
Append(theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;

// Prepend one item
Prepend(theItem: RWGltf_GltfPrimArrayData): void;
Prepend(theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;
Prepend(theItem: RWGltf_GltfPrimArrayData): void;
Prepend(theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: RWGltf_GltfPrimArrayData): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;
InsertBefore(theIndex: number, theItem: RWGltf_GltfPrimArrayData): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;
InsertAfter(theIndex: number, theItem: RWGltf_GltfPrimArrayData): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;
InsertAfter(theIndex: number, theItem: RWGltf_GltfPrimArrayData): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_RWGltf_GltfPrimArrayData): void;
// theSeq: Mutated in place

// First item access
First(): RWGltf_GltfPrimArrayData;

// First item access
ChangeFirst(): RWGltf_GltfPrimArrayData;

// Last item access
Last(): RWGltf_GltfPrimArrayData;

// Last item access
ChangeLast(): RWGltf_GltfPrimArrayData;

// Constant item access by theIndex
Value(theIndex: number): RWGltf_GltfPrimArrayData;

// Variable item access by theIndex
ChangeValue(theIndex: number): RWGltf_GltfPrimArrayData;

// Set item value by theIndex
SetValue(theIndex: number, theItem: RWGltf_GltfPrimArrayData): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): RWGltf_GltfPrimArrayData;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): RWGltf_GltfPrimArrayData;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_ShapeFix_WireSegment: declare class NCollection_Sequence_ShapeFix_WireSegment extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_ShapeFix_WireSegment): NCollection_Sequence_ShapeFix_WireSegment;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: unknown): void;
Append(theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;
Append(theItem: unknown): void;
Append(theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;

// Prepend one item
Prepend(theItem: unknown): void;
Prepend(theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;
Prepend(theItem: unknown): void;
Prepend(theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: unknown): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;
InsertBefore(theIndex: number, theItem: unknown): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;
InsertAfter(theIndex: number, theItem: unknown): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;
InsertAfter(theIndex: number, theItem: unknown): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_ShapeFix_WireSegment): void;
// theSeq: Mutated in place

// First item access
First(): unknown;

// First item access
ChangeFirst(): unknown;

// Last item access
Last(): unknown;

// Last item access
ChangeLast(): unknown;

// Constant item access by theIndex
Value(theIndex: number): unknown;

// Variable item access by theIndex
ChangeValue(theIndex: number): unknown;

// Set item value by theIndex
SetValue(theIndex: number, theItem: unknown): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): unknown;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): unknown;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_TCollection_AsciiString: declare class NCollection_Sequence_TCollection_AsciiString extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_TCollection_AsciiString): NCollection_Sequence_TCollection_AsciiString;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: TCollection_AsciiString): void;
Append(theSeq: NCollection_Sequence_TCollection_AsciiString): void;
Append(theItem: TCollection_AsciiString): void;
Append(theSeq: NCollection_Sequence_TCollection_AsciiString): void;

// Prepend one item
Prepend(theItem: TCollection_AsciiString): void;
Prepend(theSeq: NCollection_Sequence_TCollection_AsciiString): void;
Prepend(theItem: TCollection_AsciiString): void;
Prepend(theSeq: NCollection_Sequence_TCollection_AsciiString): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: TCollection_AsciiString): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;
InsertBefore(theIndex: number, theItem: TCollection_AsciiString): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;
InsertAfter(theIndex: number, theItem: TCollection_AsciiString): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;
InsertAfter(theIndex: number, theItem: TCollection_AsciiString): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_TCollection_AsciiString): void;
// theSeq: Mutated in place

// First item access
First(): TCollection_AsciiString;

// First item access
ChangeFirst(): TCollection_AsciiString;

// Last item access
Last(): TCollection_AsciiString;

// Last item access
ChangeLast(): TCollection_AsciiString;

// Constant item access by theIndex
Value(theIndex: number): TCollection_AsciiString;

// Variable item access by theIndex
ChangeValue(theIndex: number): TCollection_AsciiString;

// Set item value by theIndex
SetValue(theIndex: number, theItem: TCollection_AsciiString): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TCollection_AsciiString;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TCollection_AsciiString;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_TCollection_ExtendedString: declare class NCollection_Sequence_TCollection_ExtendedString extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_TCollection_ExtendedString): NCollection_Sequence_TCollection_ExtendedString;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: TCollection_ExtendedString): void;
Append(theSeq: NCollection_Sequence_TCollection_ExtendedString): void;
Append(theItem: TCollection_ExtendedString): void;
Append(theSeq: NCollection_Sequence_TCollection_ExtendedString): void;

// Prepend one item
Prepend(theItem: TCollection_ExtendedString): void;
Prepend(theSeq: NCollection_Sequence_TCollection_ExtendedString): void;
Prepend(theItem: TCollection_ExtendedString): void;
Prepend(theSeq: NCollection_Sequence_TCollection_ExtendedString): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: TCollection_ExtendedString): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TCollection_ExtendedString): void;
InsertBefore(theIndex: number, theItem: TCollection_ExtendedString): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TCollection_ExtendedString): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TCollection_ExtendedString): void;
InsertAfter(theIndex: number, theItem: TCollection_ExtendedString): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TCollection_ExtendedString): void;
InsertAfter(theIndex: number, theItem: TCollection_ExtendedString): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_TCollection_ExtendedString): void;
// theSeq: Mutated in place

// First item access
First(): TCollection_ExtendedString;

// First item access
ChangeFirst(): TCollection_ExtendedString;

// Last item access
Last(): TCollection_ExtendedString;

// Last item access
ChangeLast(): TCollection_ExtendedString;

// Constant item access by theIndex
Value(theIndex: number): TCollection_ExtendedString;

// Variable item access by theIndex
ChangeValue(theIndex: number): TCollection_ExtendedString;

// Set item value by theIndex
SetValue(theIndex: number, theItem: TCollection_ExtendedString): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TCollection_ExtendedString;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TCollection_ExtendedString;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_TDF_Label: declare class NCollection_Sequence_TDF_Label extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_TDF_Label): NCollection_Sequence_TDF_Label;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: TDF_Label): void;
Append(theSeq: NCollection_Sequence_TDF_Label): void;
Append(theItem: TDF_Label): void;
Append(theSeq: NCollection_Sequence_TDF_Label): void;

// Prepend one item
Prepend(theItem: TDF_Label): void;
Prepend(theSeq: NCollection_Sequence_TDF_Label): void;
Prepend(theItem: TDF_Label): void;
Prepend(theSeq: NCollection_Sequence_TDF_Label): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: TDF_Label): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TDF_Label): void;
InsertBefore(theIndex: number, theItem: TDF_Label): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TDF_Label): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TDF_Label): void;
InsertAfter(theIndex: number, theItem: TDF_Label): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TDF_Label): void;
InsertAfter(theIndex: number, theItem: TDF_Label): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_TDF_Label): void;
// theSeq: Mutated in place

// First item access
First(): TDF_Label;

// First item access
ChangeFirst(): TDF_Label;

// Last item access
Last(): TDF_Label;

// Last item access
ChangeLast(): TDF_Label;

// Constant item access by theIndex
Value(theIndex: number): TDF_Label;

// Variable item access by theIndex
ChangeValue(theIndex: number): TDF_Label;

// Set item value by theIndex
SetValue(theIndex: number, theItem: TDF_Label): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TDF_Label;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TDF_Label;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_TopoDS_Shape: declare class NCollection_Sequence_TopoDS_Shape extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_TopoDS_Shape): NCollection_Sequence_TopoDS_Shape;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: TopoDS_Shape): void;
Append(theSeq: NCollection_Sequence_TopoDS_Shape): void;
Append(theItem: TopoDS_Shape): void;
Append(theSeq: NCollection_Sequence_TopoDS_Shape): void;

// Prepend one item
Prepend(theItem: TopoDS_Shape): void;
Prepend(theSeq: NCollection_Sequence_TopoDS_Shape): void;
Prepend(theItem: TopoDS_Shape): void;
Prepend(theSeq: NCollection_Sequence_TopoDS_Shape): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: TopoDS_Shape): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TopoDS_Shape): void;
InsertBefore(theIndex: number, theItem: TopoDS_Shape): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_TopoDS_Shape): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TopoDS_Shape): void;
InsertAfter(theIndex: number, theItem: TopoDS_Shape): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_TopoDS_Shape): void;
InsertAfter(theIndex: number, theItem: TopoDS_Shape): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_TopoDS_Shape): void;
// theSeq: Mutated in place

// First item access
First(): TopoDS_Shape;

// First item access
ChangeFirst(): TopoDS_Shape;

// Last item access
Last(): TopoDS_Shape;

// Last item access
ChangeLast(): TopoDS_Shape;

// Constant item access by theIndex
Value(theIndex: number): TopoDS_Shape;

// Variable item access by theIndex
ChangeValue(theIndex: number): TopoDS_Shape;

// Set item value by theIndex
SetValue(theIndex: number, theItem: TopoDS_Shape): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TopoDS_Shape;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TopoDS_Shape;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
