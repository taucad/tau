# libcascade — NCollection (46)

8 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Sequence_handle_Geom_BoundedCurve: declare class NCollection_Sequence_handle_Geom_BoundedCurve extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Geom_BoundedCurve): NCollection_Sequence_handle_Geom_BoundedCurve;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Geom_BoundedCurve): void;
Append(theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
Append(theItem: Geom_BoundedCurve): void;
Append(theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

// Prepend one item
Prepend(theItem: Geom_BoundedCurve): void;
Prepend(theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
Prepend(theItem: Geom_BoundedCurve): void;
Prepend(theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Geom_BoundedCurve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
InsertBefore(theIndex: number, theItem: Geom_BoundedCurve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
InsertAfter(theIndex: number, theItem: Geom_BoundedCurve): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
InsertAfter(theIndex: number, theItem: Geom_BoundedCurve): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_BoundedCurve): void;
// theSeq: Mutated in place

// First item access
First(): Geom_BoundedCurve;

// First item access
ChangeFirst(): Geom_BoundedCurve;

// Last item access
Last(): Geom_BoundedCurve;

// Last item access
ChangeLast(): Geom_BoundedCurve;

// Constant item access by theIndex
Value(theIndex: number): Geom_BoundedCurve;

// Variable item access by theIndex
ChangeValue(theIndex: number): Geom_BoundedCurve;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Geom_BoundedCurve): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom_BoundedCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom_BoundedCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Geom_Curve: declare class NCollection_Sequence_handle_Geom_Curve extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Geom_Curve): NCollection_Sequence_handle_Geom_Curve;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Geom_Curve): void;
Append(theSeq: NCollection_Sequence_handle_Geom_Curve): void;
Append(theItem: Geom_Curve): void;
Append(theSeq: NCollection_Sequence_handle_Geom_Curve): void;

// Prepend one item
Prepend(theItem: Geom_Curve): void;
Prepend(theSeq: NCollection_Sequence_handle_Geom_Curve): void;
Prepend(theItem: Geom_Curve): void;
Prepend(theSeq: NCollection_Sequence_handle_Geom_Curve): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Geom_Curve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;
InsertBefore(theIndex: number, theItem: Geom_Curve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;
InsertAfter(theIndex: number, theItem: Geom_Curve): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;
InsertAfter(theIndex: number, theItem: Geom_Curve): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom_Curve): void;
// theSeq: Mutated in place

// First item access
First(): Geom_Curve;

// First item access
ChangeFirst(): Geom_Curve;

// Last item access
Last(): Geom_Curve;

// Last item access
ChangeLast(): Geom_Curve;

// Constant item access by theIndex
Value(theIndex: number): Geom_Curve;

// Variable item access by theIndex
ChangeValue(theIndex: number): Geom_Curve;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Geom_Curve): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom_Curve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom_Curve;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_IFSelect_Selection: declare class NCollection_Sequence_handle_IFSelect_Selection extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_IFSelect_Selection): NCollection_Sequence_handle_IFSelect_Selection;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: IFSelect_Selection): void;
Append(theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
Append(theItem: IFSelect_Selection): void;
Append(theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

// Prepend one item
Prepend(theItem: IFSelect_Selection): void;
Prepend(theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
Prepend(theItem: IFSelect_Selection): void;
Prepend(theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IFSelect_Selection): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
InsertBefore(theIndex: number, theItem: IFSelect_Selection): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
InsertAfter(theIndex: number, theItem: IFSelect_Selection): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
InsertAfter(theIndex: number, theItem: IFSelect_Selection): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_IFSelect_Selection): void;
// theSeq: Mutated in place

// First item access
First(): IFSelect_Selection;

// First item access
ChangeFirst(): IFSelect_Selection;

// Last item access
Last(): IFSelect_Selection;

// Last item access
ChangeLast(): IFSelect_Selection;

// Constant item access by theIndex
Value(theIndex: number): IFSelect_Selection;

// Variable item access by theIndex
ChangeValue(theIndex: number): IFSelect_Selection;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IFSelect_Selection): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IFSelect_Selection;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IFSelect_Selection;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_IntPatch_Line: declare class NCollection_Sequence_handle_IntPatch_Line extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_IntPatch_Line): NCollection_Sequence_handle_IntPatch_Line;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: IntPatch_Line): void;
Append(theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
Append(theItem: IntPatch_Line): void;
Append(theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

// Prepend one item
Prepend(theItem: IntPatch_Line): void;
Prepend(theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
Prepend(theItem: IntPatch_Line): void;
Prepend(theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IntPatch_Line): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
InsertBefore(theIndex: number, theItem: IntPatch_Line): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
InsertAfter(theIndex: number, theItem: IntPatch_Line): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
InsertAfter(theIndex: number, theItem: IntPatch_Line): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_IntPatch_Line): void;
// theSeq: Mutated in place

// First item access
First(): IntPatch_Line;

// First item access
ChangeFirst(): IntPatch_Line;

// Last item access
Last(): IntPatch_Line;

// Last item access
ChangeLast(): IntPatch_Line;

// Constant item access by theIndex
Value(theIndex: number): IntPatch_Line;

// Variable item access by theIndex
ChangeValue(theIndex: number): IntPatch_Line;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IntPatch_Line): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IntPatch_Line;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IntPatch_Line;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_MAT2d_Connexion: declare class NCollection_Sequence_handle_MAT2d_Connexion extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_MAT2d_Connexion): NCollection_Sequence_handle_MAT2d_Connexion;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: MAT2d_Connexion): void;
Append(theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
Append(theItem: MAT2d_Connexion): void;
Append(theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

// Prepend one item
Prepend(theItem: MAT2d_Connexion): void;
Prepend(theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
Prepend(theItem: MAT2d_Connexion): void;
Prepend(theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: MAT2d_Connexion): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
InsertBefore(theIndex: number, theItem: MAT2d_Connexion): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
InsertAfter(theIndex: number, theItem: MAT2d_Connexion): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
InsertAfter(theIndex: number, theItem: MAT2d_Connexion): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_MAT2d_Connexion): void;
// theSeq: Mutated in place

// First item access
First(): MAT2d_Connexion;

// First item access
ChangeFirst(): MAT2d_Connexion;

// Last item access
Last(): MAT2d_Connexion;

// Last item access
ChangeLast(): MAT2d_Connexion;

// Constant item access by theIndex
Value(theIndex: number): MAT2d_Connexion;

// Variable item access by theIndex
ChangeValue(theIndex: number): MAT2d_Connexion;

// Set item value by theIndex
SetValue(theIndex: number, theItem: MAT2d_Connexion): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): MAT2d_Connexion;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): MAT2d_Connexion;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_MAT_Arc: declare class NCollection_Sequence_handle_MAT_Arc extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_MAT_Arc): NCollection_Sequence_handle_MAT_Arc;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: MAT_Arc): void;
Append(theSeq: NCollection_Sequence_handle_MAT_Arc): void;
Append(theItem: MAT_Arc): void;
Append(theSeq: NCollection_Sequence_handle_MAT_Arc): void;

// Prepend one item
Prepend(theItem: MAT_Arc): void;
Prepend(theSeq: NCollection_Sequence_handle_MAT_Arc): void;
Prepend(theItem: MAT_Arc): void;
Prepend(theSeq: NCollection_Sequence_handle_MAT_Arc): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: MAT_Arc): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;
InsertBefore(theIndex: number, theItem: MAT_Arc): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;
InsertAfter(theIndex: number, theItem: MAT_Arc): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;
InsertAfter(theIndex: number, theItem: MAT_Arc): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_Arc): void;
// theSeq: Mutated in place

// First item access
First(): MAT_Arc;

// First item access
ChangeFirst(): MAT_Arc;

// Last item access
Last(): MAT_Arc;

// Last item access
ChangeLast(): MAT_Arc;

// Constant item access by theIndex
Value(theIndex: number): MAT_Arc;

// Variable item access by theIndex
ChangeValue(theIndex: number): MAT_Arc;

// Set item value by theIndex
SetValue(theIndex: number, theItem: MAT_Arc): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): MAT_Arc;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): MAT_Arc;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_MAT_BasicElt: declare class NCollection_Sequence_handle_MAT_BasicElt extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_MAT_BasicElt): NCollection_Sequence_handle_MAT_BasicElt;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: MAT_BasicElt): void;
Append(theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
Append(theItem: MAT_BasicElt): void;
Append(theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

// Prepend one item
Prepend(theItem: MAT_BasicElt): void;
Prepend(theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
Prepend(theItem: MAT_BasicElt): void;
Prepend(theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: MAT_BasicElt): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
InsertBefore(theIndex: number, theItem: MAT_BasicElt): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
InsertAfter(theIndex: number, theItem: MAT_BasicElt): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
InsertAfter(theIndex: number, theItem: MAT_BasicElt): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_MAT_BasicElt): void;
// theSeq: Mutated in place

// First item access
First(): MAT_BasicElt;

// First item access
ChangeFirst(): MAT_BasicElt;

// Last item access
Last(): MAT_BasicElt;

// Last item access
ChangeLast(): MAT_BasicElt;

// Constant item access by theIndex
Value(theIndex: number): MAT_BasicElt;

// Variable item access by theIndex
ChangeValue(theIndex: number): MAT_BasicElt;

// Set item value by theIndex
SetValue(theIndex: number, theItem: MAT_BasicElt): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): MAT_BasicElt;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): MAT_BasicElt;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt: declare class NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: unknown): void;
Append(theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
Append(theItem: unknown): void;
Append(theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

// Prepend one item
Prepend(theItem: unknown): void;
Prepend(theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
Prepend(theItem: unknown): void;
Prepend(theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: unknown): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
InsertBefore(theIndex: number, theItem: unknown): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
InsertAfter(theIndex: number, theItem: unknown): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
InsertAfter(theIndex: number, theItem: unknown): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt): void;
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
