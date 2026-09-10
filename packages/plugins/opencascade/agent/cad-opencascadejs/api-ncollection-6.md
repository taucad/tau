# libcascade — NCollection (6)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_StepAP214_AutoDesignReferencingItem: declare class NCollection_Array1_StepAP214_AutoDesignReferencingItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_AutoDesignReferencingItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_AutoDesignReferencingItem): NCollection_Array1_StepAP214_AutoDesignReferencingItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignReferencingItem): NCollection_Array1_StepAP214_AutoDesignReferencingItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_AutoDesignReferencingItem): NCollection_Array1_StepAP214_AutoDesignReferencingItem;
// theOther: Mutated in place

First(): StepAP214_AutoDesignReferencingItem;

ChangeFirst(): StepAP214_AutoDesignReferencingItem;

Last(): StepAP214_AutoDesignReferencingItem;

ChangeLast(): StepAP214_AutoDesignReferencingItem;

// Constant value access
Value(theIndex: number): StepAP214_AutoDesignReferencingItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_AutoDesignReferencingItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_AutoDesignReferencingItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_AutoDesignReferencingItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_AutoDesignReferencingItem): void;

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
NCollection_Array1_StepAP214_DateAndTimeItem: declare class NCollection_Array1_StepAP214_DateAndTimeItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_DateAndTimeItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_DateAndTimeItem): NCollection_Array1_StepAP214_DateAndTimeItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_DateAndTimeItem): NCollection_Array1_StepAP214_DateAndTimeItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_DateAndTimeItem): NCollection_Array1_StepAP214_DateAndTimeItem;
// theOther: Mutated in place

First(): StepAP214_DateAndTimeItem;

ChangeFirst(): StepAP214_DateAndTimeItem;

Last(): StepAP214_DateAndTimeItem;

ChangeLast(): StepAP214_DateAndTimeItem;

// Constant value access
Value(theIndex: number): StepAP214_DateAndTimeItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_DateAndTimeItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_DateAndTimeItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_DateAndTimeItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_DateAndTimeItem): void;

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
NCollection_Array1_StepAP214_DateItem: declare class NCollection_Array1_StepAP214_DateItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_DateItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_DateItem): NCollection_Array1_StepAP214_DateItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_DateItem): NCollection_Array1_StepAP214_DateItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_DateItem): NCollection_Array1_StepAP214_DateItem;
// theOther: Mutated in place

First(): StepAP214_DateItem;

ChangeFirst(): StepAP214_DateItem;

Last(): StepAP214_DateItem;

ChangeLast(): StepAP214_DateItem;

// Constant value access
Value(theIndex: number): StepAP214_DateItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_DateItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_DateItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_DateItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_DateItem): void;

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
NCollection_Array1_StepAP214_DocumentReferenceItem: declare class NCollection_Array1_StepAP214_DocumentReferenceItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_DocumentReferenceItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_DocumentReferenceItem): NCollection_Array1_StepAP214_DocumentReferenceItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_DocumentReferenceItem): NCollection_Array1_StepAP214_DocumentReferenceItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_DocumentReferenceItem): NCollection_Array1_StepAP214_DocumentReferenceItem;
// theOther: Mutated in place

First(): StepAP214_DocumentReferenceItem;

ChangeFirst(): StepAP214_DocumentReferenceItem;

Last(): StepAP214_DocumentReferenceItem;

ChangeLast(): StepAP214_DocumentReferenceItem;

// Constant value access
Value(theIndex: number): StepAP214_DocumentReferenceItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_DocumentReferenceItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_DocumentReferenceItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_DocumentReferenceItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_DocumentReferenceItem): void;

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
NCollection_Array1_StepAP214_ExternalIdentificationItem: declare class NCollection_Array1_StepAP214_ExternalIdentificationItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_ExternalIdentificationItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_ExternalIdentificationItem): NCollection_Array1_StepAP214_ExternalIdentificationItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_ExternalIdentificationItem): NCollection_Array1_StepAP214_ExternalIdentificationItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_ExternalIdentificationItem): NCollection_Array1_StepAP214_ExternalIdentificationItem;
// theOther: Mutated in place

First(): StepAP214_ExternalIdentificationItem;

ChangeFirst(): StepAP214_ExternalIdentificationItem;

Last(): StepAP214_ExternalIdentificationItem;

ChangeLast(): StepAP214_ExternalIdentificationItem;

// Constant value access
Value(theIndex: number): StepAP214_ExternalIdentificationItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_ExternalIdentificationItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_ExternalIdentificationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_ExternalIdentificationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_ExternalIdentificationItem): void;

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
NCollection_Array1_StepAP214_GroupItem: declare class NCollection_Array1_StepAP214_GroupItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_GroupItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_GroupItem): NCollection_Array1_StepAP214_GroupItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_GroupItem): NCollection_Array1_StepAP214_GroupItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_GroupItem): NCollection_Array1_StepAP214_GroupItem;
// theOther: Mutated in place

First(): StepAP214_GroupItem;

ChangeFirst(): StepAP214_GroupItem;

Last(): StepAP214_GroupItem;

ChangeLast(): StepAP214_GroupItem;

// Constant value access
Value(theIndex: number): StepAP214_GroupItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_GroupItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_GroupItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_GroupItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_GroupItem): void;

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
NCollection_Array1_StepAP214_OrganizationItem: declare class NCollection_Array1_StepAP214_OrganizationItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_OrganizationItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_OrganizationItem): NCollection_Array1_StepAP214_OrganizationItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_OrganizationItem): NCollection_Array1_StepAP214_OrganizationItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_OrganizationItem): NCollection_Array1_StepAP214_OrganizationItem;
// theOther: Mutated in place

First(): StepAP214_OrganizationItem;

ChangeFirst(): StepAP214_OrganizationItem;

Last(): StepAP214_OrganizationItem;

ChangeLast(): StepAP214_OrganizationItem;

// Constant value access
Value(theIndex: number): StepAP214_OrganizationItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_OrganizationItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_OrganizationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_OrganizationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_OrganizationItem): void;

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
NCollection_Array1_StepAP214_PersonAndOrganizationItem: declare class NCollection_Array1_StepAP214_PersonAndOrganizationItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_PersonAndOrganizationItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_PersonAndOrganizationItem): NCollection_Array1_StepAP214_PersonAndOrganizationItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_PersonAndOrganizationItem): NCollection_Array1_StepAP214_PersonAndOrganizationItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_PersonAndOrganizationItem): NCollection_Array1_StepAP214_PersonAndOrganizationItem;
// theOther: Mutated in place

First(): StepAP214_PersonAndOrganizationItem;

ChangeFirst(): StepAP214_PersonAndOrganizationItem;

Last(): StepAP214_PersonAndOrganizationItem;

ChangeLast(): StepAP214_PersonAndOrganizationItem;

// Constant value access
Value(theIndex: number): StepAP214_PersonAndOrganizationItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_PersonAndOrganizationItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_PersonAndOrganizationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_PersonAndOrganizationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_PersonAndOrganizationItem): void;

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
