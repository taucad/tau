# libcascade — NCollection (42)

8 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Sequence_IntSurf_InteriorPoint: declare class NCollection_Sequence_IntSurf_InteriorPoint extends NCollection_BaseSequence

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
Assign(theOther: unknown): unknown;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: IntSurf_InteriorPoint): void;
Append(theSeq: unknown): void;
Append(theItem: IntSurf_InteriorPoint): void;
Append(theSeq: unknown): void;

// Prepend one item
Prepend(theItem: IntSurf_InteriorPoint): void;
Prepend(theSeq: unknown): void;
Prepend(theItem: IntSurf_InteriorPoint): void;
Prepend(theSeq: unknown): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IntSurf_InteriorPoint): void;
InsertBefore(theIndex: number, theSeq: unknown): void;
InsertBefore(theIndex: number, theItem: IntSurf_InteriorPoint): void;
InsertBefore(theIndex: number, theSeq: unknown): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: unknown): void;
InsertAfter(theIndex: number, theItem: IntSurf_InteriorPoint): void;
InsertAfter(theIndex: number, theSeq: unknown): void;
InsertAfter(theIndex: number, theItem: IntSurf_InteriorPoint): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: unknown): void;
// theSeq: Mutated in place

// First item access
First(): IntSurf_InteriorPoint;

// First item access
ChangeFirst(): IntSurf_InteriorPoint;

// Last item access
Last(): IntSurf_InteriorPoint;

// Last item access
ChangeLast(): IntSurf_InteriorPoint;

// Constant item access by theIndex
Value(theIndex: number): IntSurf_InteriorPoint;

// Variable item access by theIndex
ChangeValue(theIndex: number): IntSurf_InteriorPoint;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IntSurf_InteriorPoint): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IntSurf_InteriorPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IntSurf_InteriorPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_IntSurf_PathPoint: declare class NCollection_Sequence_IntSurf_PathPoint extends NCollection_BaseSequence

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
Assign(theOther: unknown): unknown;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: IntSurf_PathPoint): void;
Append(theSeq: unknown): void;
Append(theItem: IntSurf_PathPoint): void;
Append(theSeq: unknown): void;

// Prepend one item
Prepend(theItem: IntSurf_PathPoint): void;
Prepend(theSeq: unknown): void;
Prepend(theItem: IntSurf_PathPoint): void;
Prepend(theSeq: unknown): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IntSurf_PathPoint): void;
InsertBefore(theIndex: number, theSeq: unknown): void;
InsertBefore(theIndex: number, theItem: IntSurf_PathPoint): void;
InsertBefore(theIndex: number, theSeq: unknown): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: unknown): void;
InsertAfter(theIndex: number, theItem: IntSurf_PathPoint): void;
InsertAfter(theIndex: number, theSeq: unknown): void;
InsertAfter(theIndex: number, theItem: IntSurf_PathPoint): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: unknown): void;
// theSeq: Mutated in place

// First item access
First(): IntSurf_PathPoint;

// First item access
ChangeFirst(): IntSurf_PathPoint;

// Last item access
Last(): IntSurf_PathPoint;

// Last item access
ChangeLast(): IntSurf_PathPoint;

// Constant item access by theIndex
Value(theIndex: number): IntSurf_PathPoint;

// Variable item access by theIndex
ChangeValue(theIndex: number): IntSurf_PathPoint;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IntSurf_PathPoint): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IntSurf_PathPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IntSurf_PathPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_IntTools_CommonPrt: declare class NCollection_Sequence_IntTools_CommonPrt extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_IntTools_CommonPrt): NCollection_Sequence_IntTools_CommonPrt;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: IntTools_CommonPrt): void;
Append(theSeq: NCollection_Sequence_IntTools_CommonPrt): void;
Append(theItem: IntTools_CommonPrt): void;
Append(theSeq: NCollection_Sequence_IntTools_CommonPrt): void;

// Prepend one item
Prepend(theItem: IntTools_CommonPrt): void;
Prepend(theSeq: NCollection_Sequence_IntTools_CommonPrt): void;
Prepend(theItem: IntTools_CommonPrt): void;
Prepend(theSeq: NCollection_Sequence_IntTools_CommonPrt): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IntTools_CommonPrt): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_CommonPrt): void;
InsertBefore(theIndex: number, theItem: IntTools_CommonPrt): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_CommonPrt): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_CommonPrt): void;
InsertAfter(theIndex: number, theItem: IntTools_CommonPrt): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_CommonPrt): void;
InsertAfter(theIndex: number, theItem: IntTools_CommonPrt): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_IntTools_CommonPrt): void;
// theSeq: Mutated in place

// First item access
First(): IntTools_CommonPrt;

// First item access
ChangeFirst(): IntTools_CommonPrt;

// Last item access
Last(): IntTools_CommonPrt;

// Last item access
ChangeLast(): IntTools_CommonPrt;

// Constant item access by theIndex
Value(theIndex: number): IntTools_CommonPrt;

// Variable item access by theIndex
ChangeValue(theIndex: number): IntTools_CommonPrt;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IntTools_CommonPrt): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IntTools_CommonPrt;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IntTools_CommonPrt;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_IntTools_Curve: declare class NCollection_Sequence_IntTools_Curve extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_IntTools_Curve): NCollection_Sequence_IntTools_Curve;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: IntTools_Curve): void;
Append(theSeq: NCollection_Sequence_IntTools_Curve): void;
Append(theItem: IntTools_Curve): void;
Append(theSeq: NCollection_Sequence_IntTools_Curve): void;

// Prepend one item
Prepend(theItem: IntTools_Curve): void;
Prepend(theSeq: NCollection_Sequence_IntTools_Curve): void;
Prepend(theItem: IntTools_Curve): void;
Prepend(theSeq: NCollection_Sequence_IntTools_Curve): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IntTools_Curve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_Curve): void;
InsertBefore(theIndex: number, theItem: IntTools_Curve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_Curve): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_Curve): void;
InsertAfter(theIndex: number, theItem: IntTools_Curve): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_Curve): void;
InsertAfter(theIndex: number, theItem: IntTools_Curve): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_IntTools_Curve): void;
// theSeq: Mutated in place

// First item access
First(): IntTools_Curve;

// First item access
ChangeFirst(): IntTools_Curve;

// Last item access
Last(): IntTools_Curve;

// Last item access
ChangeLast(): IntTools_Curve;

// Constant item access by theIndex
Value(theIndex: number): IntTools_Curve;

// Variable item access by theIndex
ChangeValue(theIndex: number): IntTools_Curve;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IntTools_Curve): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IntTools_Curve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IntTools_Curve;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_IntTools_PntOn2Faces: declare class NCollection_Sequence_IntTools_PntOn2Faces extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_IntTools_PntOn2Faces): NCollection_Sequence_IntTools_PntOn2Faces;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: IntTools_PntOn2Faces): void;
Append(theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;
Append(theItem: IntTools_PntOn2Faces): void;
Append(theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;

// Prepend one item
Prepend(theItem: IntTools_PntOn2Faces): void;
Prepend(theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;
Prepend(theItem: IntTools_PntOn2Faces): void;
Prepend(theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IntTools_PntOn2Faces): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;
InsertBefore(theIndex: number, theItem: IntTools_PntOn2Faces): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;
InsertAfter(theIndex: number, theItem: IntTools_PntOn2Faces): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;
InsertAfter(theIndex: number, theItem: IntTools_PntOn2Faces): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_IntTools_PntOn2Faces): void;
// theSeq: Mutated in place

// First item access
First(): IntTools_PntOn2Faces;

// First item access
ChangeFirst(): IntTools_PntOn2Faces;

// Last item access
Last(): IntTools_PntOn2Faces;

// Last item access
ChangeLast(): IntTools_PntOn2Faces;

// Constant item access by theIndex
Value(theIndex: number): IntTools_PntOn2Faces;

// Variable item access by theIndex
ChangeValue(theIndex: number): IntTools_PntOn2Faces;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IntTools_PntOn2Faces): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IntTools_PntOn2Faces;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IntTools_PntOn2Faces;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_IntTools_Range: declare class NCollection_Sequence_IntTools_Range extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_IntTools_Range): NCollection_Sequence_IntTools_Range;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: IntTools_Range): void;
Append(theSeq: NCollection_Sequence_IntTools_Range): void;
Append(theItem: IntTools_Range): void;
Append(theSeq: NCollection_Sequence_IntTools_Range): void;

// Prepend one item
Prepend(theItem: IntTools_Range): void;
Prepend(theSeq: NCollection_Sequence_IntTools_Range): void;
Prepend(theItem: IntTools_Range): void;
Prepend(theSeq: NCollection_Sequence_IntTools_Range): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IntTools_Range): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_Range): void;
InsertBefore(theIndex: number, theItem: IntTools_Range): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_Range): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_Range): void;
InsertAfter(theIndex: number, theItem: IntTools_Range): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_Range): void;
InsertAfter(theIndex: number, theItem: IntTools_Range): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_IntTools_Range): void;
// theSeq: Mutated in place

// First item access
First(): IntTools_Range;

// First item access
ChangeFirst(): IntTools_Range;

// Last item access
Last(): IntTools_Range;

// Last item access
ChangeLast(): IntTools_Range;

// Constant item access by theIndex
Value(theIndex: number): IntTools_Range;

// Variable item access by theIndex
ChangeValue(theIndex: number): IntTools_Range;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IntTools_Range): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IntTools_Range;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IntTools_Range;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_IntTools_Root: declare class NCollection_Sequence_IntTools_Root extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_IntTools_Root): NCollection_Sequence_IntTools_Root;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: IntTools_Root): void;
Append(theSeq: NCollection_Sequence_IntTools_Root): void;
Append(theItem: IntTools_Root): void;
Append(theSeq: NCollection_Sequence_IntTools_Root): void;

// Prepend one item
Prepend(theItem: IntTools_Root): void;
Prepend(theSeq: NCollection_Sequence_IntTools_Root): void;
Prepend(theItem: IntTools_Root): void;
Prepend(theSeq: NCollection_Sequence_IntTools_Root): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IntTools_Root): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_Root): void;
InsertBefore(theIndex: number, theItem: IntTools_Root): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_IntTools_Root): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_Root): void;
InsertAfter(theIndex: number, theItem: IntTools_Root): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_IntTools_Root): void;
InsertAfter(theIndex: number, theItem: IntTools_Root): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_IntTools_Root): void;
// theSeq: Mutated in place

// First item access
First(): IntTools_Root;

// First item access
ChangeFirst(): IntTools_Root;

// Last item access
Last(): IntTools_Root;

// Last item access
ChangeLast(): IntTools_Root;

// Constant item access by theIndex
Value(theIndex: number): IntTools_Root;

// Variable item access by theIndex
ChangeValue(theIndex: number): IntTools_Root;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IntTools_Root): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IntTools_Root;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IntTools_Root;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry: declare class NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
Append(theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;
Append(theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
Append(theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;

// Prepend one item
Prepend(theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
Prepend(theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;
Prepend(theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
Prepend(theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;
InsertBefore(theIndex: number, theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;
InsertAfter(theIndex: number, theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;
InsertAfter(theIndex: number, theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry): void;
// theSeq: Mutated in place

// First item access
First(): NCollection_Sequence_handle_Geom2d_Geometry;

// First item access
ChangeFirst(): NCollection_Sequence_handle_Geom2d_Geometry;

// Last item access
Last(): NCollection_Sequence_handle_Geom2d_Geometry;

// Last item access
ChangeLast(): NCollection_Sequence_handle_Geom2d_Geometry;

// Constant item access by theIndex
Value(theIndex: number): NCollection_Sequence_handle_Geom2d_Geometry;

// Variable item access by theIndex
ChangeValue(theIndex: number): NCollection_Sequence_handle_Geom2d_Geometry;

// Set item value by theIndex
SetValue(theIndex: number, theItem: NCollection_Sequence_handle_Geom2d_Geometry): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): NCollection_Sequence_handle_Geom2d_Geometry;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): NCollection_Sequence_handle_Geom2d_Geometry;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
