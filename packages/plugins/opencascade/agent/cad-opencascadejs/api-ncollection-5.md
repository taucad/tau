# libcascade — NCollection (5)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_StepAP203_WorkItem: declare class NCollection_Array1_StepAP203_WorkItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP203_WorkItem): void;

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
Assign(theOther: NCollection_Array1_StepAP203_WorkItem): NCollection_Array1_StepAP203_WorkItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP203_WorkItem): NCollection_Array1_StepAP203_WorkItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP203_WorkItem): NCollection_Array1_StepAP203_WorkItem;
// theOther: Mutated in place

First(): StepAP203_WorkItem;

ChangeFirst(): StepAP203_WorkItem;

Last(): StepAP203_WorkItem;

ChangeLast(): StepAP203_WorkItem;

// Constant value access
Value(theIndex: number): StepAP203_WorkItem;

// Variable value access
ChangeValue(theIndex: number): StepAP203_WorkItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP203_WorkItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP203_WorkItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP203_WorkItem): void;

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
NCollection_Array1_StepAP214_ApprovalItem: declare class NCollection_Array1_StepAP214_ApprovalItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_ApprovalItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_ApprovalItem): NCollection_Array1_StepAP214_ApprovalItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_ApprovalItem): NCollection_Array1_StepAP214_ApprovalItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_ApprovalItem): NCollection_Array1_StepAP214_ApprovalItem;
// theOther: Mutated in place

First(): StepAP214_ApprovalItem;

ChangeFirst(): StepAP214_ApprovalItem;

Last(): StepAP214_ApprovalItem;

ChangeLast(): StepAP214_ApprovalItem;

// Constant value access
Value(theIndex: number): StepAP214_ApprovalItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_ApprovalItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_ApprovalItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_ApprovalItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_ApprovalItem): void;

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
NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem: declare class NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_AutoDesignDateAndPersonItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem): NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem): NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem): NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem;
// theOther: Mutated in place

First(): StepAP214_AutoDesignDateAndPersonItem;

ChangeFirst(): StepAP214_AutoDesignDateAndPersonItem;

Last(): StepAP214_AutoDesignDateAndPersonItem;

ChangeLast(): StepAP214_AutoDesignDateAndPersonItem;

// Constant value access
Value(theIndex: number): StepAP214_AutoDesignDateAndPersonItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_AutoDesignDateAndPersonItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_AutoDesignDateAndPersonItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_AutoDesignDateAndPersonItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_AutoDesignDateAndPersonItem): void;

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
NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem: declare class NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_AutoDesignDateAndTimeItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem): NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem): NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem): NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem;
// theOther: Mutated in place

First(): StepAP214_AutoDesignDateAndTimeItem;

ChangeFirst(): StepAP214_AutoDesignDateAndTimeItem;

Last(): StepAP214_AutoDesignDateAndTimeItem;

ChangeLast(): StepAP214_AutoDesignDateAndTimeItem;

// Constant value access
Value(theIndex: number): StepAP214_AutoDesignDateAndTimeItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_AutoDesignDateAndTimeItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_AutoDesignDateAndTimeItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_AutoDesignDateAndTimeItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_AutoDesignDateAndTimeItem): void;

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
NCollection_Array1_StepAP214_AutoDesignDatedItem: declare class NCollection_Array1_StepAP214_AutoDesignDatedItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_AutoDesignDatedItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_AutoDesignDatedItem): NCollection_Array1_StepAP214_AutoDesignDatedItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignDatedItem): NCollection_Array1_StepAP214_AutoDesignDatedItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_AutoDesignDatedItem): NCollection_Array1_StepAP214_AutoDesignDatedItem;
// theOther: Mutated in place

First(): StepAP214_AutoDesignDatedItem;

ChangeFirst(): StepAP214_AutoDesignDatedItem;

Last(): StepAP214_AutoDesignDatedItem;

ChangeLast(): StepAP214_AutoDesignDatedItem;

// Constant value access
Value(theIndex: number): StepAP214_AutoDesignDatedItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_AutoDesignDatedItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_AutoDesignDatedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_AutoDesignDatedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_AutoDesignDatedItem): void;

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
NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem: declare class NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_AutoDesignGeneralOrgItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem): NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem): NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem): NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem;
// theOther: Mutated in place

First(): StepAP214_AutoDesignGeneralOrgItem;

ChangeFirst(): StepAP214_AutoDesignGeneralOrgItem;

Last(): StepAP214_AutoDesignGeneralOrgItem;

ChangeLast(): StepAP214_AutoDesignGeneralOrgItem;

// Constant value access
Value(theIndex: number): StepAP214_AutoDesignGeneralOrgItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_AutoDesignGeneralOrgItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_AutoDesignGeneralOrgItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_AutoDesignGeneralOrgItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_AutoDesignGeneralOrgItem): void;

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
NCollection_Array1_StepAP214_AutoDesignGroupedItem: declare class NCollection_Array1_StepAP214_AutoDesignGroupedItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_AutoDesignGroupedItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_AutoDesignGroupedItem): NCollection_Array1_StepAP214_AutoDesignGroupedItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignGroupedItem): NCollection_Array1_StepAP214_AutoDesignGroupedItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_AutoDesignGroupedItem): NCollection_Array1_StepAP214_AutoDesignGroupedItem;
// theOther: Mutated in place

First(): StepAP214_AutoDesignGroupedItem;

ChangeFirst(): StepAP214_AutoDesignGroupedItem;

Last(): StepAP214_AutoDesignGroupedItem;

ChangeLast(): StepAP214_AutoDesignGroupedItem;

// Constant value access
Value(theIndex: number): StepAP214_AutoDesignGroupedItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_AutoDesignGroupedItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_AutoDesignGroupedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_AutoDesignGroupedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_AutoDesignGroupedItem): void;

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
NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect: declare class NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_AutoDesignPresentedItemSelect): void;

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
Assign(theOther: NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect): NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect): NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect): NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect;
// theOther: Mutated in place

First(): StepAP214_AutoDesignPresentedItemSelect;

ChangeFirst(): StepAP214_AutoDesignPresentedItemSelect;

Last(): StepAP214_AutoDesignPresentedItemSelect;

ChangeLast(): StepAP214_AutoDesignPresentedItemSelect;

// Constant value access
Value(theIndex: number): StepAP214_AutoDesignPresentedItemSelect;

// Variable value access
ChangeValue(theIndex: number): StepAP214_AutoDesignPresentedItemSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_AutoDesignPresentedItemSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_AutoDesignPresentedItemSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_AutoDesignPresentedItemSelect): void;

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
