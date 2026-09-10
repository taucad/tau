# libcascade — NCollection (45)

8 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Sequence_gp_XY: declare class NCollection_Sequence_gp_XY extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_gp_XY): NCollection_Sequence_gp_XY;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: gp_XY): void;
Append(theSeq: NCollection_Sequence_gp_XY): void;
Append(theItem: gp_XY): void;
Append(theSeq: NCollection_Sequence_gp_XY): void;

// Prepend one item
Prepend(theItem: gp_XY): void;
Prepend(theSeq: NCollection_Sequence_gp_XY): void;
Prepend(theItem: gp_XY): void;
Prepend(theSeq: NCollection_Sequence_gp_XY): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: gp_XY): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;
InsertBefore(theIndex: number, theItem: gp_XY): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;
InsertAfter(theIndex: number, theItem: gp_XY): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;
InsertAfter(theIndex: number, theItem: gp_XY): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_gp_XY): void;
// theSeq: Mutated in place

// First item access
First(): gp_XY;

// First item access
ChangeFirst(): gp_XY;

// Last item access
Last(): gp_XY;

// Last item access
ChangeLast(): gp_XY;

// Constant item access by theIndex
Value(theIndex: number): gp_XY;

// Variable item access by theIndex
ChangeValue(theIndex: number): gp_XY;

// Set item value by theIndex
SetValue(theIndex: number, theItem: gp_XY): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_XY;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_XY;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_ChFiDS_SurfData: declare class NCollection_Sequence_handle_ChFiDS_SurfData extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_ChFiDS_SurfData): NCollection_Sequence_handle_ChFiDS_SurfData;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: ChFiDS_SurfData): void;
Append(theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
Append(theItem: ChFiDS_SurfData): void;
Append(theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

// Prepend one item
Prepend(theItem: ChFiDS_SurfData): void;
Prepend(theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
Prepend(theItem: ChFiDS_SurfData): void;
Prepend(theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: ChFiDS_SurfData): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
InsertBefore(theIndex: number, theItem: ChFiDS_SurfData): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
InsertAfter(theIndex: number, theItem: ChFiDS_SurfData): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
InsertAfter(theIndex: number, theItem: ChFiDS_SurfData): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_ChFiDS_SurfData): void;
// theSeq: Mutated in place

// First item access
First(): ChFiDS_SurfData;

// First item access
ChangeFirst(): ChFiDS_SurfData;

// Last item access
Last(): ChFiDS_SurfData;

// Last item access
ChangeLast(): ChFiDS_SurfData;

// Constant item access by theIndex
Value(theIndex: number): ChFiDS_SurfData;

// Variable item access by theIndex
ChangeValue(theIndex: number): ChFiDS_SurfData;

// Set item value by theIndex
SetValue(theIndex: number, theItem: ChFiDS_SurfData): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): ChFiDS_SurfData;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): ChFiDS_SurfData;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Expr_GeneralExpression: declare class NCollection_Sequence_handle_Expr_GeneralExpression extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Expr_GeneralExpression): NCollection_Sequence_handle_Expr_GeneralExpression;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Expr_GeneralExpression): void;
Append(theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
Append(theItem: Expr_GeneralExpression): void;
Append(theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

// Prepend one item
Prepend(theItem: Expr_GeneralExpression): void;
Prepend(theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
Prepend(theItem: Expr_GeneralExpression): void;
Prepend(theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Expr_GeneralExpression): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
InsertBefore(theIndex: number, theItem: Expr_GeneralExpression): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
InsertAfter(theIndex: number, theItem: Expr_GeneralExpression): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
InsertAfter(theIndex: number, theItem: Expr_GeneralExpression): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_GeneralExpression): void;
// theSeq: Mutated in place

// First item access
First(): Expr_GeneralExpression;

// First item access
ChangeFirst(): Expr_GeneralExpression;

// Last item access
Last(): Expr_GeneralExpression;

// Last item access
ChangeLast(): Expr_GeneralExpression;

// Constant item access by theIndex
Value(theIndex: number): Expr_GeneralExpression;

// Variable item access by theIndex
ChangeValue(theIndex: number): Expr_GeneralExpression;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Expr_GeneralExpression): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Expr_GeneralExpression;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Expr_GeneralExpression;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Expr_NamedExpression: declare class NCollection_Sequence_handle_Expr_NamedExpression extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Expr_NamedExpression): NCollection_Sequence_handle_Expr_NamedExpression;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Expr_NamedExpression): void;
Append(theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
Append(theItem: Expr_NamedExpression): void;
Append(theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

// Prepend one item
Prepend(theItem: Expr_NamedExpression): void;
Prepend(theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
Prepend(theItem: Expr_NamedExpression): void;
Prepend(theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Expr_NamedExpression): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
InsertBefore(theIndex: number, theItem: Expr_NamedExpression): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
InsertAfter(theIndex: number, theItem: Expr_NamedExpression): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
InsertAfter(theIndex: number, theItem: Expr_NamedExpression): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedExpression): void;
// theSeq: Mutated in place

// First item access
First(): Expr_NamedExpression;

// First item access
ChangeFirst(): Expr_NamedExpression;

// Last item access
Last(): Expr_NamedExpression;

// Last item access
ChangeLast(): Expr_NamedExpression;

// Constant item access by theIndex
Value(theIndex: number): Expr_NamedExpression;

// Variable item access by theIndex
ChangeValue(theIndex: number): Expr_NamedExpression;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Expr_NamedExpression): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Expr_NamedExpression;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Expr_NamedExpression;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Expr_NamedFunction: declare class NCollection_Sequence_handle_Expr_NamedFunction extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Expr_NamedFunction): NCollection_Sequence_handle_Expr_NamedFunction;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Expr_NamedFunction): void;
Append(theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
Append(theItem: Expr_NamedFunction): void;
Append(theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

// Prepend one item
Prepend(theItem: Expr_NamedFunction): void;
Prepend(theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
Prepend(theItem: Expr_NamedFunction): void;
Prepend(theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Expr_NamedFunction): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
InsertBefore(theIndex: number, theItem: Expr_NamedFunction): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
InsertAfter(theIndex: number, theItem: Expr_NamedFunction): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
InsertAfter(theIndex: number, theItem: Expr_NamedFunction): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Expr_NamedFunction): void;
// theSeq: Mutated in place

// First item access
First(): Expr_NamedFunction;

// First item access
ChangeFirst(): Expr_NamedFunction;

// Last item access
Last(): Expr_NamedFunction;

// Last item access
ChangeLast(): Expr_NamedFunction;

// Constant item access by theIndex
Value(theIndex: number): Expr_NamedFunction;

// Variable item access by theIndex
ChangeValue(theIndex: number): Expr_NamedFunction;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Expr_NamedFunction): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Expr_NamedFunction;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Expr_NamedFunction;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Geom2d_BoundedCurve: declare class NCollection_Sequence_handle_Geom2d_BoundedCurve extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Geom2d_BoundedCurve): NCollection_Sequence_handle_Geom2d_BoundedCurve;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Geom2d_BoundedCurve): void;
Append(theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
Append(theItem: Geom2d_BoundedCurve): void;
Append(theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

// Prepend one item
Prepend(theItem: Geom2d_BoundedCurve): void;
Prepend(theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
Prepend(theItem: Geom2d_BoundedCurve): void;
Prepend(theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Geom2d_BoundedCurve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
InsertBefore(theIndex: number, theItem: Geom2d_BoundedCurve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
InsertAfter(theIndex: number, theItem: Geom2d_BoundedCurve): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
InsertAfter(theIndex: number, theItem: Geom2d_BoundedCurve): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_BoundedCurve): void;
// theSeq: Mutated in place

// First item access
First(): Geom2d_BoundedCurve;

// First item access
ChangeFirst(): Geom2d_BoundedCurve;

// Last item access
Last(): Geom2d_BoundedCurve;

// Last item access
ChangeLast(): Geom2d_BoundedCurve;

// Constant item access by theIndex
Value(theIndex: number): Geom2d_BoundedCurve;

// Variable item access by theIndex
ChangeValue(theIndex: number): Geom2d_BoundedCurve;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Geom2d_BoundedCurve): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom2d_BoundedCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom2d_BoundedCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Geom2d_Curve: declare class NCollection_Sequence_handle_Geom2d_Curve extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Geom2d_Curve): NCollection_Sequence_handle_Geom2d_Curve;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Geom2d_Curve): void;
Append(theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
Append(theItem: Geom2d_Curve): void;
Append(theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

// Prepend one item
Prepend(theItem: Geom2d_Curve): void;
Prepend(theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
Prepend(theItem: Geom2d_Curve): void;
Prepend(theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Geom2d_Curve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
InsertBefore(theIndex: number, theItem: Geom2d_Curve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
InsertAfter(theIndex: number, theItem: Geom2d_Curve): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
InsertAfter(theIndex: number, theItem: Geom2d_Curve): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Curve): void;
// theSeq: Mutated in place

// First item access
First(): Geom2d_Curve;

// First item access
ChangeFirst(): Geom2d_Curve;

// Last item access
Last(): Geom2d_Curve;

// Last item access
ChangeLast(): Geom2d_Curve;

// Constant item access by theIndex
Value(theIndex: number): Geom2d_Curve;

// Variable item access by theIndex
ChangeValue(theIndex: number): Geom2d_Curve;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Geom2d_Curve): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom2d_Curve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom2d_Curve;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Sequence_handle_Geom2d_Geometry: declare class NCollection_Sequence_handle_Geom2d_Geometry extends NCollection_BaseSequence

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
Assign(theOther: NCollection_Sequence_handle_Geom2d_Geometry): NCollection_Sequence_handle_Geom2d_Geometry;

// Remove one item
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

// Append one item
Append(theItem: Geom2d_Geometry): void;
Append(theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
Append(theItem: Geom2d_Geometry): void;
Append(theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

// Prepend one item
Prepend(theItem: Geom2d_Geometry): void;
Prepend(theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
Prepend(theItem: Geom2d_Geometry): void;
Prepend(theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

// InsertBefore theIndex theItem
InsertBefore(theIndex: number, theItem: Geom2d_Geometry): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
InsertBefore(theIndex: number, theItem: Geom2d_Geometry): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;

// InsertAfter the position of iterator
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
InsertAfter(theIndex: number, theItem: Geom2d_Geometry): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
InsertAfter(theIndex: number, theItem: Geom2d_Geometry): void;
// theSeq: Mutated in place

// Split in two sequences
Split(theIndex: number, theSeq: NCollection_Sequence_handle_Geom2d_Geometry): void;
// theSeq: Mutated in place

// First item access
First(): Geom2d_Geometry;

// First item access
ChangeFirst(): Geom2d_Geometry;

// Last item access
Last(): Geom2d_Geometry;

// Last item access
ChangeLast(): Geom2d_Geometry;

// Constant item access by theIndex
Value(theIndex: number): Geom2d_Geometry;

// Variable item access by theIndex
ChangeValue(theIndex: number): Geom2d_Geometry;

// Set item value by theIndex
SetValue(theIndex: number, theItem: Geom2d_Geometry): void;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom2d_Geometry;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom2d_Geometry;
// theIndex: 0-based index in [0, `Size()`-1]

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
