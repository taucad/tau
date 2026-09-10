# libcascade — NCollection (41)

8 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Sequence_AppParCurves_MultiCurve: declare class NCollection_Sequence_AppParCurves_MultiCurve extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_AppParCurves_MultiCurve): NCollection_Sequence_AppParCurves_MultiCurve;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: AppParCurves_MultiCurve): void;
Append(theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
Append(theItem: AppParCurves_MultiCurve): void;
Append(theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;

// Prepend one item
Prepend(theItem: AppParCurves_MultiCurve): void;
Prepend(theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
Prepend(theItem: AppParCurves_MultiCurve): void;
Prepend(theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: AppParCurves_MultiCurve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
InsertBefore(theIndex: number, theItem: AppParCurves_MultiCurve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
InsertAfter(theIndex: number, theItem: AppParCurves_MultiCurve): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
InsertAfter(theIndex: number, theItem: AppParCurves_MultiCurve): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
// theSeq: Mutated in place

// First item access
First(): AppParCurves_MultiCurve;

// First item access
ChangeFirst(): AppParCurves_MultiCurve;

// Last item access
Last(): AppParCurves_MultiCurve;

// Last item access
ChangeLast(): AppParCurves_MultiCurve;

// Constant item access by theIndex
Value(theIndex: number): AppParCurves_MultiCurve;

// Variable item access by theIndex
ChangeValue(theIndex: number): AppParCurves_MultiCurve;

// Set item value by theIndex
SetValue(theIndex: number, theItem: AppParCurves_MultiCurve): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): AppParCurves_MultiCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): AppParCurves_MultiCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_BRepExtrema_SolutionElem: declare class NCollection_Sequence_BRepExtrema_SolutionElem extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_BRepExtrema_SolutionElem): NCollection_Sequence_BRepExtrema_SolutionElem;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: BRepExtrema_SolutionElem): void;
Append(theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
Append(theItem: BRepExtrema_SolutionElem): void;
Append(theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;

// Prepend one item
Prepend(theItem: BRepExtrema_SolutionElem): void;
Prepend(theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
Prepend(theItem: BRepExtrema_SolutionElem): void;
Prepend(theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: BRepExtrema_SolutionElem): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
InsertBefore(theIndex: number, theItem: BRepExtrema_SolutionElem): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
InsertAfter(theIndex: number, theItem: BRepExtrema_SolutionElem): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
InsertAfter(theIndex: number, theItem: BRepExtrema_SolutionElem): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
// theSeq: Mutated in place

// First item access
First(): BRepExtrema_SolutionElem;

// First item access
ChangeFirst(): BRepExtrema_SolutionElem;

// Last item access
Last(): BRepExtrema_SolutionElem;

// Last item access
ChangeLast(): BRepExtrema_SolutionElem;

// Constant item access by theIndex
Value(theIndex: number): BRepExtrema_SolutionElem;

// Variable item access by theIndex
ChangeValue(theIndex: number): BRepExtrema_SolutionElem;

// Set item value by theIndex
SetValue(theIndex: number, theItem: BRepExtrema_SolutionElem): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepExtrema_SolutionElem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepExtrema_SolutionElem;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_Extrema_POnCurv: declare class NCollection_Sequence_Extrema_POnCurv extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_Extrema_POnCurv): NCollection_Sequence_Extrema_POnCurv;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Extrema_POnCurv): void;
Append(theSeq: NCollection_Sequence_Extrema_POnCurv): void;
Append(theItem: Extrema_POnCurv): void;
Append(theSeq: NCollection_Sequence_Extrema_POnCurv): void;

// Prepend one item
Prepend(theItem: Extrema_POnCurv): void;
Prepend(theSeq: NCollection_Sequence_Extrema_POnCurv): void;
Prepend(theItem: Extrema_POnCurv): void;
Prepend(theSeq: NCollection_Sequence_Extrema_POnCurv): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Extrema_POnCurv): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv): void;
InsertBefore(theIndex: number, theItem: Extrema_POnCurv): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv): void;
InsertAfter(theIndex: number, theItem: Extrema_POnCurv): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv): void;
InsertAfter(theIndex: number, theItem: Extrema_POnCurv): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv): void;
// theSeq: Mutated in place

// First item access
First(): Extrema_POnCurv;

// First item access
ChangeFirst(): Extrema_POnCurv;

// Last item access
Last(): Extrema_POnCurv;

// Last item access
ChangeLast(): Extrema_POnCurv;

// Constant item access by theIndex
Value(theIndex: number): Extrema_POnCurv;

// Variable item access by theIndex
ChangeValue(theIndex: number): Extrema_POnCurv;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Extrema_POnCurv): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Extrema_POnCurv;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Extrema_POnCurv;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_Extrema_POnCurv2d: declare class NCollection_Sequence_Extrema_POnCurv2d extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_Extrema_POnCurv2d): NCollection_Sequence_Extrema_POnCurv2d;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Extrema_POnCurv2d): void;
Append(theSeq: NCollection_Sequence_Extrema_POnCurv2d): void;
Append(theItem: Extrema_POnCurv2d): void;
Append(theSeq: NCollection_Sequence_Extrema_POnCurv2d): void;

// Prepend one item
Prepend(theItem: Extrema_POnCurv2d): void;
Prepend(theSeq: NCollection_Sequence_Extrema_POnCurv2d): void;
Prepend(theItem: Extrema_POnCurv2d): void;
Prepend(theSeq: NCollection_Sequence_Extrema_POnCurv2d): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Extrema_POnCurv2d): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv2d): void;
InsertBefore(theIndex: number, theItem: Extrema_POnCurv2d): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv2d): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv2d): void;
InsertAfter(theIndex: number, theItem: Extrema_POnCurv2d): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv2d): void;
InsertAfter(theIndex: number, theItem: Extrema_POnCurv2d): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv2d): void;
// theSeq: Mutated in place

// First item access
First(): Extrema_POnCurv2d;

// First item access
ChangeFirst(): Extrema_POnCurv2d;

// Last item access
Last(): Extrema_POnCurv2d;

// Last item access
ChangeLast(): Extrema_POnCurv2d;

// Constant item access by theIndex
Value(theIndex: number): Extrema_POnCurv2d;

// Variable item access by theIndex
ChangeValue(theIndex: number): Extrema_POnCurv2d;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Extrema_POnCurv2d): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Extrema_POnCurv2d;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Extrema_POnCurv2d;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_Extrema_POnSurf: declare class NCollection_Sequence_Extrema_POnSurf extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_Extrema_POnSurf): NCollection_Sequence_Extrema_POnSurf;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Extrema_POnSurf): void;
Append(theSeq: NCollection_Sequence_Extrema_POnSurf): void;
Append(theItem: Extrema_POnSurf): void;
Append(theSeq: NCollection_Sequence_Extrema_POnSurf): void;

// Prepend one item
Prepend(theItem: Extrema_POnSurf): void;
Prepend(theSeq: NCollection_Sequence_Extrema_POnSurf): void;
Prepend(theItem: Extrema_POnSurf): void;
Prepend(theSeq: NCollection_Sequence_Extrema_POnSurf): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Extrema_POnSurf): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnSurf): void;
InsertBefore(theIndex: number, theItem: Extrema_POnSurf): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnSurf): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnSurf): void;
InsertAfter(theIndex: number, theItem: Extrema_POnSurf): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnSurf): void;
InsertAfter(theIndex: number, theItem: Extrema_POnSurf): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnSurf): void;
// theSeq: Mutated in place

// First item access
First(): Extrema_POnSurf;

// First item access
ChangeFirst(): Extrema_POnSurf;

// Last item access
Last(): Extrema_POnSurf;

// Last item access
ChangeLast(): Extrema_POnSurf;

// Constant item access by theIndex
Value(theIndex: number): Extrema_POnSurf;

// Variable item access by theIndex
ChangeValue(theIndex: number): Extrema_POnSurf;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Extrema_POnSurf): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Extrema_POnSurf;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Extrema_POnSurf;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_HLRBRep_ShapeBounds: declare class NCollection_Sequence_HLRBRep_ShapeBounds extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_HLRBRep_ShapeBounds): NCollection_Sequence_HLRBRep_ShapeBounds;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: HLRBRep_ShapeBounds): void;
Append(theSeq: NCollection_Sequence_HLRBRep_ShapeBounds): void;
Append(theItem: HLRBRep_ShapeBounds): void;
Append(theSeq: NCollection_Sequence_HLRBRep_ShapeBounds): void;

// Prepend one item
Prepend(theItem: HLRBRep_ShapeBounds): void;
Prepend(theSeq: NCollection_Sequence_HLRBRep_ShapeBounds): void;
Prepend(theItem: HLRBRep_ShapeBounds): void;
Prepend(theSeq: NCollection_Sequence_HLRBRep_ShapeBounds): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: HLRBRep_ShapeBounds): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_HLRBRep_ShapeBounds): void;
InsertBefore(theIndex: number, theItem: HLRBRep_ShapeBounds): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_HLRBRep_ShapeBounds): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_HLRBRep_ShapeBounds): void;
InsertAfter(theIndex: number, theItem: HLRBRep_ShapeBounds): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_HLRBRep_ShapeBounds): void;
InsertAfter(theIndex: number, theItem: HLRBRep_ShapeBounds): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_HLRBRep_ShapeBounds): void;
// theSeq: Mutated in place

// First item access
First(): HLRBRep_ShapeBounds;

// First item access
ChangeFirst(): HLRBRep_ShapeBounds;

// Last item access
Last(): HLRBRep_ShapeBounds;

// Last item access
ChangeLast(): HLRBRep_ShapeBounds;

// Constant item access by theIndex
Value(theIndex: number): HLRBRep_ShapeBounds;

// Variable item access by theIndex
ChangeValue(theIndex: number): HLRBRep_ShapeBounds;

// Set item value by theIndex
SetValue(theIndex: number, theItem: HLRBRep_ShapeBounds): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): HLRBRep_ShapeBounds;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): HLRBRep_ShapeBounds;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_IntPatch_Point: declare class NCollection_Sequence_IntPatch_Point extends NCollection_BaseSequence

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
Append(theItem: IntPatch_Point): void;
Append(theSeq: unknown): void;
Append(theItem: IntPatch_Point): void;
Append(theSeq: unknown): void;

// Prepend one item
Prepend(theItem: IntPatch_Point): void;
Prepend(theSeq: unknown): void;
Prepend(theItem: IntPatch_Point): void;
Prepend(theSeq: unknown): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IntPatch_Point): void;
InsertBefore(theIndex: number, theSeq: unknown): void;
InsertBefore(theIndex: number, theItem: IntPatch_Point): void;
InsertBefore(theIndex: number, theSeq: unknown): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: unknown): void;
InsertAfter(theIndex: number, theItem: IntPatch_Point): void;
InsertAfter(theIndex: number, theSeq: unknown): void;
InsertAfter(theIndex: number, theItem: IntPatch_Point): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: unknown): void;
// theSeq: Mutated in place

// First item access
First(): IntPatch_Point;

// First item access
ChangeFirst(): IntPatch_Point;

// Last item access
Last(): IntPatch_Point;

// Last item access
ChangeLast(): IntPatch_Point;

// Constant item access by theIndex
Value(theIndex: number): IntPatch_Point;

// Variable item access by theIndex
ChangeValue(theIndex: number): IntPatch_Point;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IntPatch_Point): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IntPatch_Point;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IntPatch_Point;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_IntRes2d_IntersectionPoint: declare class NCollection_Sequence_IntRes2d_IntersectionPoint extends NCollection_BaseSequence

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
Append(theItem: IntRes2d_IntersectionPoint): void;
Append(theSeq: unknown): void;
Append(theItem: IntRes2d_IntersectionPoint): void;
Append(theSeq: unknown): void;

// Prepend one item
Prepend(theItem: IntRes2d_IntersectionPoint): void;
Prepend(theSeq: unknown): void;
Prepend(theItem: IntRes2d_IntersectionPoint): void;
Prepend(theSeq: unknown): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: IntRes2d_IntersectionPoint): void;
InsertBefore(theIndex: number, theSeq: unknown): void;
InsertBefore(theIndex: number, theItem: IntRes2d_IntersectionPoint): void;
InsertBefore(theIndex: number, theSeq: unknown): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: unknown): void;
InsertAfter(theIndex: number, theItem: IntRes2d_IntersectionPoint): void;
InsertAfter(theIndex: number, theSeq: unknown): void;
InsertAfter(theIndex: number, theItem: IntRes2d_IntersectionPoint): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: unknown): void;
// theSeq: Mutated in place

// First item access
First(): IntRes2d_IntersectionPoint;

// First item access
ChangeFirst(): IntRes2d_IntersectionPoint;

// Last item access
Last(): IntRes2d_IntersectionPoint;

// Last item access
ChangeLast(): IntRes2d_IntersectionPoint;

// Constant item access by theIndex
Value(theIndex: number): IntRes2d_IntersectionPoint;

// Variable item access by theIndex
ChangeValue(theIndex: number): IntRes2d_IntersectionPoint;

// Set item value by theIndex
SetValue(theIndex: number, theItem: IntRes2d_IntersectionPoint): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IntRes2d_IntersectionPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IntRes2d_IntersectionPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
