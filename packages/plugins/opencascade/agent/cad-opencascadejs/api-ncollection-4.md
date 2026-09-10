# libcascade — NCollection (4)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_StepAP203_CertifiedItem: declare class NCollection_Array1_StepAP203_CertifiedItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP203_CertifiedItem): void;

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
Assign(theOther: NCollection_Array1_StepAP203_CertifiedItem): NCollection_Array1_StepAP203_CertifiedItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP203_CertifiedItem): NCollection_Array1_StepAP203_CertifiedItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP203_CertifiedItem): NCollection_Array1_StepAP203_CertifiedItem;
// theOther: Mutated in place

First(): StepAP203_CertifiedItem;

ChangeFirst(): StepAP203_CertifiedItem;

Last(): StepAP203_CertifiedItem;

ChangeLast(): StepAP203_CertifiedItem;

// Constant value access
Value(theIndex: number): StepAP203_CertifiedItem;

// Variable value access
ChangeValue(theIndex: number): StepAP203_CertifiedItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP203_CertifiedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP203_CertifiedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP203_CertifiedItem): void;

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
NCollection_Array1_StepAP203_ChangeRequestItem: declare class NCollection_Array1_StepAP203_ChangeRequestItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP203_ChangeRequestItem): void;

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
Assign(theOther: NCollection_Array1_StepAP203_ChangeRequestItem): NCollection_Array1_StepAP203_ChangeRequestItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP203_ChangeRequestItem): NCollection_Array1_StepAP203_ChangeRequestItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP203_ChangeRequestItem): NCollection_Array1_StepAP203_ChangeRequestItem;
// theOther: Mutated in place

First(): StepAP203_ChangeRequestItem;

ChangeFirst(): StepAP203_ChangeRequestItem;

Last(): StepAP203_ChangeRequestItem;

ChangeLast(): StepAP203_ChangeRequestItem;

// Constant value access
Value(theIndex: number): StepAP203_ChangeRequestItem;

// Variable value access
ChangeValue(theIndex: number): StepAP203_ChangeRequestItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP203_ChangeRequestItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP203_ChangeRequestItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP203_ChangeRequestItem): void;

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
NCollection_Array1_StepAP203_ClassifiedItem: declare class NCollection_Array1_StepAP203_ClassifiedItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP203_ClassifiedItem): void;

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
Assign(theOther: NCollection_Array1_StepAP203_ClassifiedItem): NCollection_Array1_StepAP203_ClassifiedItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP203_ClassifiedItem): NCollection_Array1_StepAP203_ClassifiedItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP203_ClassifiedItem): NCollection_Array1_StepAP203_ClassifiedItem;
// theOther: Mutated in place

First(): StepAP203_ClassifiedItem;

ChangeFirst(): StepAP203_ClassifiedItem;

Last(): StepAP203_ClassifiedItem;

ChangeLast(): StepAP203_ClassifiedItem;

// Constant value access
Value(theIndex: number): StepAP203_ClassifiedItem;

// Variable value access
ChangeValue(theIndex: number): StepAP203_ClassifiedItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP203_ClassifiedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP203_ClassifiedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP203_ClassifiedItem): void;

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
NCollection_Array1_StepAP203_ContractedItem: declare class NCollection_Array1_StepAP203_ContractedItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP203_ContractedItem): void;

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
Assign(theOther: NCollection_Array1_StepAP203_ContractedItem): NCollection_Array1_StepAP203_ContractedItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP203_ContractedItem): NCollection_Array1_StepAP203_ContractedItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP203_ContractedItem): NCollection_Array1_StepAP203_ContractedItem;
// theOther: Mutated in place

First(): StepAP203_ContractedItem;

ChangeFirst(): StepAP203_ContractedItem;

Last(): StepAP203_ContractedItem;

ChangeLast(): StepAP203_ContractedItem;

// Constant value access
Value(theIndex: number): StepAP203_ContractedItem;

// Variable value access
ChangeValue(theIndex: number): StepAP203_ContractedItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP203_ContractedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP203_ContractedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP203_ContractedItem): void;

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
NCollection_Array1_StepAP203_DateTimeItem: declare class NCollection_Array1_StepAP203_DateTimeItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP203_DateTimeItem): void;

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
Assign(theOther: NCollection_Array1_StepAP203_DateTimeItem): NCollection_Array1_StepAP203_DateTimeItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP203_DateTimeItem): NCollection_Array1_StepAP203_DateTimeItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP203_DateTimeItem): NCollection_Array1_StepAP203_DateTimeItem;
// theOther: Mutated in place

First(): StepAP203_DateTimeItem;

ChangeFirst(): StepAP203_DateTimeItem;

Last(): StepAP203_DateTimeItem;

ChangeLast(): StepAP203_DateTimeItem;

// Constant value access
Value(theIndex: number): StepAP203_DateTimeItem;

// Variable value access
ChangeValue(theIndex: number): StepAP203_DateTimeItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP203_DateTimeItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP203_DateTimeItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP203_DateTimeItem): void;

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
NCollection_Array1_StepAP203_PersonOrganizationItem: declare class NCollection_Array1_StepAP203_PersonOrganizationItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP203_PersonOrganizationItem): void;

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
Assign(theOther: NCollection_Array1_StepAP203_PersonOrganizationItem): NCollection_Array1_StepAP203_PersonOrganizationItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP203_PersonOrganizationItem): NCollection_Array1_StepAP203_PersonOrganizationItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP203_PersonOrganizationItem): NCollection_Array1_StepAP203_PersonOrganizationItem;
// theOther: Mutated in place

First(): StepAP203_PersonOrganizationItem;

ChangeFirst(): StepAP203_PersonOrganizationItem;

Last(): StepAP203_PersonOrganizationItem;

ChangeLast(): StepAP203_PersonOrganizationItem;

// Constant value access
Value(theIndex: number): StepAP203_PersonOrganizationItem;

// Variable value access
ChangeValue(theIndex: number): StepAP203_PersonOrganizationItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP203_PersonOrganizationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP203_PersonOrganizationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP203_PersonOrganizationItem): void;

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
NCollection_Array1_StepAP203_SpecifiedItem: declare class NCollection_Array1_StepAP203_SpecifiedItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP203_SpecifiedItem): void;

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
Assign(theOther: NCollection_Array1_StepAP203_SpecifiedItem): NCollection_Array1_StepAP203_SpecifiedItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP203_SpecifiedItem): NCollection_Array1_StepAP203_SpecifiedItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP203_SpecifiedItem): NCollection_Array1_StepAP203_SpecifiedItem;
// theOther: Mutated in place

First(): StepAP203_SpecifiedItem;

ChangeFirst(): StepAP203_SpecifiedItem;

Last(): StepAP203_SpecifiedItem;

ChangeLast(): StepAP203_SpecifiedItem;

// Constant value access
Value(theIndex: number): StepAP203_SpecifiedItem;

// Variable value access
ChangeValue(theIndex: number): StepAP203_SpecifiedItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP203_SpecifiedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP203_SpecifiedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP203_SpecifiedItem): void;

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
NCollection_Array1_StepAP203_StartRequestItem: declare class NCollection_Array1_StepAP203_StartRequestItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP203_StartRequestItem): void;

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
Assign(theOther: NCollection_Array1_StepAP203_StartRequestItem): NCollection_Array1_StepAP203_StartRequestItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP203_StartRequestItem): NCollection_Array1_StepAP203_StartRequestItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP203_StartRequestItem): NCollection_Array1_StepAP203_StartRequestItem;
// theOther: Mutated in place

First(): StepAP203_StartRequestItem;

ChangeFirst(): StepAP203_StartRequestItem;

Last(): StepAP203_StartRequestItem;

ChangeLast(): StepAP203_StartRequestItem;

// Constant value access
Value(theIndex: number): StepAP203_StartRequestItem;

// Variable value access
ChangeValue(theIndex: number): StepAP203_StartRequestItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP203_StartRequestItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP203_StartRequestItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP203_StartRequestItem): void;

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
