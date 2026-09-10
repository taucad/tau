# libcascade — NCollection (2)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_BRepGraph_ItemUID: declare class NCollection_Array1_BRepGraph_ItemUID

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_ItemUID): void;

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
Assign(theOther: NCollection_Array1_BRepGraph_ItemUID): NCollection_Array1_BRepGraph_ItemUID;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_ItemUID): NCollection_Array1_BRepGraph_ItemUID;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_ItemUID): NCollection_Array1_BRepGraph_ItemUID;
// theOther: Mutated in place

First(): BRepGraph_ItemUID;

ChangeFirst(): BRepGraph_ItemUID;

Last(): BRepGraph_ItemUID;

ChangeLast(): BRepGraph_ItemUID;

// Constant value access
Value(theIndex: number): BRepGraph_ItemUID;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_ItemUID;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_ItemUID;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_ItemUID;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_ItemUID): void;

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
NCollection_Array1_BRepGraph_NodeId: declare class NCollection_Array1_BRepGraph_NodeId

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_NodeId): void;

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
Assign(theOther: NCollection_Array1_BRepGraph_NodeId): NCollection_Array1_BRepGraph_NodeId;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_NodeId): NCollection_Array1_BRepGraph_NodeId;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_NodeId): NCollection_Array1_BRepGraph_NodeId;
// theOther: Mutated in place

First(): BRepGraph_NodeId;

ChangeFirst(): BRepGraph_NodeId;

Last(): BRepGraph_NodeId;

ChangeLast(): BRepGraph_NodeId;

// Constant value access
Value(theIndex: number): BRepGraph_NodeId;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_NodeId;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_NodeId;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_NodeId;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_NodeId): void;

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
NCollection_Array1_BRepGraph_OccurrenceRefId: declare class NCollection_Array1_BRepGraph_OccurrenceRefId

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_OccurrenceRefId): void;

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
Assign(theOther: NCollection_Array1_BRepGraph_OccurrenceRefId): NCollection_Array1_BRepGraph_OccurrenceRefId;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_OccurrenceRefId): NCollection_Array1_BRepGraph_OccurrenceRefId;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_OccurrenceRefId): NCollection_Array1_BRepGraph_OccurrenceRefId;
// theOther: Mutated in place

First(): BRepGraph_OccurrenceRefId;

ChangeFirst(): BRepGraph_OccurrenceRefId;

Last(): BRepGraph_OccurrenceRefId;

ChangeLast(): BRepGraph_OccurrenceRefId;

// Constant value access
Value(theIndex: number): BRepGraph_OccurrenceRefId;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_OccurrenceRefId;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_OccurrenceRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_OccurrenceRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_OccurrenceRefId): void;

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
NCollection_Array1_BRepGraph_RefId: declare class NCollection_Array1_BRepGraph_RefId

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_RefId): void;

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
Assign(theOther: NCollection_Array1_BRepGraph_RefId): NCollection_Array1_BRepGraph_RefId;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_RefId): NCollection_Array1_BRepGraph_RefId;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_RefId): NCollection_Array1_BRepGraph_RefId;
// theOther: Mutated in place

First(): BRepGraph_RefId;

ChangeFirst(): BRepGraph_RefId;

Last(): BRepGraph_RefId;

ChangeLast(): BRepGraph_RefId;

// Constant value access
Value(theIndex: number): BRepGraph_RefId;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_RefId;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_RefId;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_RefId;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_RefId): void;

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
NCollection_Array1_BRepGraph_ShellRefId: declare class NCollection_Array1_BRepGraph_ShellRefId

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_ShellRefId): void;

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
Assign(theOther: NCollection_Array1_BRepGraph_ShellRefId): NCollection_Array1_BRepGraph_ShellRefId;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_ShellRefId): NCollection_Array1_BRepGraph_ShellRefId;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_ShellRefId): NCollection_Array1_BRepGraph_ShellRefId;
// theOther: Mutated in place

First(): BRepGraph_ShellRefId;

ChangeFirst(): BRepGraph_ShellRefId;

Last(): BRepGraph_ShellRefId;

ChangeLast(): BRepGraph_ShellRefId;

// Constant value access
Value(theIndex: number): BRepGraph_ShellRefId;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_ShellRefId;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_ShellRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_ShellRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_ShellRefId): void;

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
NCollection_Array1_BRepGraph_SolidRefId: declare class NCollection_Array1_BRepGraph_SolidRefId

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_SolidRefId): void;

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
Assign(theOther: NCollection_Array1_BRepGraph_SolidRefId): NCollection_Array1_BRepGraph_SolidRefId;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_SolidRefId): NCollection_Array1_BRepGraph_SolidRefId;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_SolidRefId): NCollection_Array1_BRepGraph_SolidRefId;
// theOther: Mutated in place

First(): BRepGraph_SolidRefId;

ChangeFirst(): BRepGraph_SolidRefId;

Last(): BRepGraph_SolidRefId;

ChangeLast(): BRepGraph_SolidRefId;

// Constant value access
Value(theIndex: number): BRepGraph_SolidRefId;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_SolidRefId;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_SolidRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_SolidRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_SolidRefId): void;

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
NCollection_Array1_BRepGraph_UID: declare class NCollection_Array1_BRepGraph_UID

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_UID): void;

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
Assign(theOther: NCollection_Array1_BRepGraph_UID): NCollection_Array1_BRepGraph_UID;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_UID): NCollection_Array1_BRepGraph_UID;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_UID): NCollection_Array1_BRepGraph_UID;
// theOther: Mutated in place

First(): BRepGraph_UID;

ChangeFirst(): BRepGraph_UID;

Last(): BRepGraph_UID;

ChangeLast(): BRepGraph_UID;

// Constant value access
Value(theIndex: number): BRepGraph_UID;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_UID;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_UID;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_UID;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_UID): void;

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
NCollection_Array1_BRepGraph_WireRefId: declare class NCollection_Array1_BRepGraph_WireRefId

constructor

// Initialise the items with theValue
Init(theValue: BRepGraph_WireRefId): void;

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
Assign(theOther: NCollection_Array1_BRepGraph_WireRefId): NCollection_Array1_BRepGraph_WireRefId;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_BRepGraph_WireRefId): NCollection_Array1_BRepGraph_WireRefId;

// Move assignment
Move(theOther: NCollection_Array1_BRepGraph_WireRefId): NCollection_Array1_BRepGraph_WireRefId;
// theOther: Mutated in place

First(): BRepGraph_WireRefId;

ChangeFirst(): BRepGraph_WireRefId;

Last(): BRepGraph_WireRefId;

ChangeLast(): BRepGraph_WireRefId;

// Constant value access
Value(theIndex: number): BRepGraph_WireRefId;

// Variable value access
ChangeValue(theIndex: number): BRepGraph_WireRefId;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): BRepGraph_WireRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): BRepGraph_WireRefId;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: BRepGraph_WireRefId): void;

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
