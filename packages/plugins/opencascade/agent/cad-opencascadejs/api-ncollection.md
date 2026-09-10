# libcascade — NCollection

26 top-level symbols. Signatures are verbatim typescript.

// Class {@link NCollection_AccAllocator`NCollection_AccAllocator`} - accumulating memory allocator
NCollection_AccAllocator: declare class NCollection_AccAllocator extends NCollection_BaseAllocator

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// NCollection allocator with managed memory alignment capabilities
NCollection_AlignedAllocator: declare class NCollection_AlignedAllocator extends NCollection_BaseAllocator

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_BaseAllocator: declare class NCollection_BaseAllocator extends Standard_Transient

// CommonBaseAllocator This method is designed to have the only one BaseAllocator (to avoid useless copying of collections)
static CommonBaseAllocator(): NCollection_BaseAllocator;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

NCollection_BaseList: declare class NCollection_BaseList

Extent(): number;

// Length - number of nodes (legacy int-returning API, synonym of `Extent()`)
Length(): number;

// Size - number of nodes
Size(): number;

IsEmpty(): boolean;

// Returns attached allocator
Allocator(): NCollection_BaseAllocator;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

NCollection_BaseList_Iterator: declare class NCollection_BaseList_Iterator

constructor

Init(theList: NCollection_BaseList): void;

Initialize(theList: NCollection_BaseList): void;

More(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_BaseMap: declare class NCollection_BaseMap

// NbBuckets
NbBuckets(): number;

// Extent (number of elements, legacy int-returning API)
Extent(): number;

// Length - number of elements (legacy int-returning API, synonym of `Extent()`)
Length(): number;

// Size - number of elements
Size(): number;

// IsEmpty
IsEmpty(): boolean;

// Returns attached allocator
Allocator(): NCollection_BaseAllocator;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

NCollection_BaseMap_Iterator: declare class NCollection_BaseMap_Iterator

Initialize(theMap: NCollection_BaseMap): void;

Reset(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_BaseSequence: declare class NCollection_BaseSequence

IsEmpty(): boolean;

// Number of items (legacy int-returning API)
Length(): number;

// Size - number of items
Size(): number;

// Returns attached allocator
Allocator(): NCollection_BaseAllocator;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

NCollection_BaseSequence_Iterator: declare class NCollection_BaseSequence_Iterator

constructor

Init(theSeq: NCollection_BaseSequence, isStart?: boolean): void;

Previous(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Low-level buffer object
NCollection_Buffer: declare class NCollection_Buffer extends Standard_Transient

constructor

Data(): number;

ChangeData(): number;

IsEmpty(): boolean;

// Return buffer length in bytes
Size(): number;

Allocator(): NCollection_BaseAllocator;

// Assign new buffer allocator with de-allocation of buffer
SetAllocator(theAlloc: NCollection_BaseAllocator): void;

// Allocate the buffer
Allocate(theSize: number): boolean;
// theSize: buffer length in bytes

// De-allocate buffer
Free(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary enumeration serving as response from method Inspect
NCollection_CellFilter_Action: typeof NCollection_CellFilter_Action[keyof typeof NCollection_CellFilter_Action]

// Empty sentinel type used as the end marker for range-for loops
NCollection_ForwardRangeSentinel: declare class NCollection_ForwardRangeSentinel

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Allocator that uses the global dynamic heap (malloc / free)
NCollection_HeapAllocator: declare class NCollection_HeapAllocator extends NCollection_BaseAllocator

static GlobalHeapAllocator(): NCollection_HeapAllocator;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class {@link NCollection_IncAllocator`NCollection_IncAllocator`} - incremental memory allocator
NCollection_IncAllocator: declare class NCollection_IncAllocator extends NCollection_BaseAllocator

constructor

// Setup mutex for thread-safe allocations
SetThreadSafe(theIsThreadSafe?: boolean): void;

// Re-initialize the allocator so that the next Allocate call should start allocating in the very beginning as though the allocator is just constructed
Reset(theReleaseMemory?: boolean): void;
// theReleaseMemory: True - release all previously allocated memory, False - preserve it for future allocations

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

NCollection_IncAllocator_IBlock: interface NCollection_IncAllocator_IBlock

CurPointer: any

AvailableSize: any

NextBlock: NCollection_IncAllocator_IBlock

NextOrderedBlock: NCollection_IncAllocator_IBlock

CurPointer: any

AvailableSize: any

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description ability to next growing size each 5-th new block
NCollection_IncAllocator_IBlockSizeLevel: typeof NCollection_IncAllocator_IBlockSizeLevel[keyof typeof NCollection_IncAllocator_IBlockSizeLevel]

// Base class for `NCollection_SparseArray`
NCollection_SparseArrayBase: declare class NCollection_SparseArrayBase

Size(): number;

HasValue(theIndex: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

NCollection_SparseArrayBase_Iterator: declare class NCollection_SparseArrayBase_Iterator

Restart(): void;

More(): boolean;

Next(): void;

Index(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This template class represent constant UTF-\* string
NCollection_String: declare class NCollection_String

constructor

Size(): number;

Length(): number;

// Retrieve Unicode symbol at specified position
GetChar(theCharIndex: number): string;
// theCharIndex: the index of the symbol, should be lesser than `Length()`

// Retrieve string buffer at specified position
GetCharBuffer(theCharIndex: number): string;
// theCharIndex: the index of the symbol, should be less than `Length()` (first symbol of the string has index 0)

// Copy from multibyte string in current system locale
FromLocale(theString: string, theLength?: number): void;
// theString: multibyte string
// theLength: the length limit in Unicode symbols The string is copied till NULL symbol or, if theLength >0, till either NULL or theLength-th symbol (which comes first)

// Compares this string with another one
IsEqual(theCompare: NCollection_String): boolean;

// Returns the substring
SubString(theStart: number, theEnd: number): NCollection_String;
// theStart: start index (inclusive) of subString
// theEnd: end index (exclusive) of subString

// Returns NULL-terminated Unicode string
ToCString(): string;

ToUtf8(): string;

ToUtf16(): string;

ToUtf32(): string;

ToUtfWide(): string;

// Converts the string into string in the current system locale
ToLocale(theBuffer: string, theSizeBytes: number): boolean;
// theBuffer: output buffer
// theSizeBytes: buffer size in bytes

IsEmpty(): boolean;

// Zero string
Clear(): void;

Assign(theOther: NCollection_String): NCollection_String;

Swap(theOther: NCollection_String): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

NCollection_UtfStringTool: declare class NCollection_UtfStringTool

constructor

FromLocale(theString: string): string;

static ToLocale(theWideString: string, theBuffer: string, theSizeBytes: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This memory allocator creates dedicated heap for allocations
NCollection_WinHeapAllocator: declare class NCollection_WinHeapAllocator extends NCollection_BaseAllocator

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_AppParCurves_ConstraintCouple: declare class NCollection_Array1_AppParCurves_ConstraintCouple

constructor

// Initialise the items with theValue
Init(theValue: AppParCurves_ConstraintCouple): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_AppParCurves_ConstraintCouple): NCollection_Array1_AppParCurves_ConstraintCouple;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_AppParCurves_ConstraintCouple): NCollection_Array1_AppParCurves_ConstraintCouple;

// Move assignment
Move(theOther: NCollection_Array1_AppParCurves_ConstraintCouple): NCollection_Array1_AppParCurves_ConstraintCouple;
// theOther: Mutated in place

First(): AppParCurves_ConstraintCouple;

ChangeFirst(): AppParCurves_ConstraintCouple;

Last(): AppParCurves_ConstraintCouple;

ChangeLast(): AppParCurves_ConstraintCouple;

// Constant value access
Value(theIndex: number): AppParCurves_ConstraintCouple;

// Variable value access
ChangeValue(theIndex: number): AppParCurves_ConstraintCouple;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): AppParCurves_ConstraintCouple;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): AppParCurves_ConstraintCouple;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: AppParCurves_ConstraintCouple): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_AppParCurves_MultiPoint: declare class NCollection_Array1_AppParCurves_MultiPoint

constructor

// Initialise the items with theValue
Init(theValue: AppParCurves_MultiPoint): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: unknown): unknown;
// theOther: Mutated in place

First(): AppParCurves_MultiPoint;

ChangeFirst(): AppParCurves_MultiPoint;

Last(): AppParCurves_MultiPoint;

ChangeLast(): AppParCurves_MultiPoint;

// Constant value access
Value(theIndex: number): AppParCurves_MultiPoint;

// Variable value access
ChangeValue(theIndex: number): AppParCurves_MultiPoint;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): AppParCurves_MultiPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): AppParCurves_MultiPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: AppParCurves_MultiPoint): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_BRepGraph_ChildRefId: declare class NCollection_Array1_BRepGraph_ChildRefId

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_ChildRefId): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_BRepGraph_ChildRefId): NCollection_Array1_BRepGraph_ChildRefId;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_ChildRefId): NCollection_Array1_BRepGraph_ChildRefId;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_ChildRefId): NCollection_Array1_BRepGraph_ChildRefId;
// theOther: Mutated in place

First(): BRepGraph_ChildRefId;

ChangeFirst(): BRepGraph_ChildRefId;

Last(): BRepGraph_ChildRefId;

ChangeLast(): BRepGraph_ChildRefId;

// Constant value access
Value(theIndex: number): BRepGraph_ChildRefId;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_ChildRefId;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_ChildRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_ChildRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_ChildRefId): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_BRepGraph_CoEdgeId: declare class NCollection_Array1_BRepGraph_CoEdgeId

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_CoEdgeId): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_BRepGraph_CoEdgeId): NCollection_Array1_BRepGraph_CoEdgeId;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_CoEdgeId): NCollection_Array1_BRepGraph_CoEdgeId;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_CoEdgeId): NCollection_Array1_BRepGraph_CoEdgeId;
// theOther: Mutated in place

First(): BRepGraph_CoEdgeId;

ChangeFirst(): BRepGraph_CoEdgeId;

Last(): BRepGraph_CoEdgeId;

ChangeLast(): BRepGraph_CoEdgeId;

// Constant value access
Value(theIndex: number): BRepGraph_CoEdgeId;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_CoEdgeId;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_CoEdgeId;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_CoEdgeId;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_CoEdgeId): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_BRepGraph_FaceRefId: declare class NCollection_Array1_BRepGraph_FaceRefId

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_FaceRefId): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_BRepGraph_FaceRefId): NCollection_Array1_BRepGraph_FaceRefId;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_FaceRefId): NCollection_Array1_BRepGraph_FaceRefId;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_FaceRefId): NCollection_Array1_BRepGraph_FaceRefId;
// theOther: Mutated in place

First(): BRepGraph_FaceRefId;

ChangeFirst(): BRepGraph_FaceRefId;

Last(): BRepGraph_FaceRefId;

ChangeLast(): BRepGraph_FaceRefId;

// Constant value access
Value(theIndex: number): BRepGraph_FaceRefId;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_FaceRefId;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_FaceRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_FaceRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_FaceRefId): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
