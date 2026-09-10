# libcascade — NCollection (7)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_StepAP214_PresentedItemSelect: declare class NCollection_Array1_StepAP214_PresentedItemSelect

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_PresentedItemSelect): void;

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
Assign(theOther: NCollection_Array1_StepAP214_PresentedItemSelect): NCollection_Array1_StepAP214_PresentedItemSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_PresentedItemSelect): NCollection_Array1_StepAP214_PresentedItemSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_PresentedItemSelect): NCollection_Array1_StepAP214_PresentedItemSelect;
// theOther: Mutated in place

First(): StepAP214_PresentedItemSelect;

ChangeFirst(): StepAP214_PresentedItemSelect;

Last(): StepAP214_PresentedItemSelect;

ChangeLast(): StepAP214_PresentedItemSelect;

// Constant value access
Value(theIndex: number): StepAP214_PresentedItemSelect;

// Variable value access
ChangeValue(theIndex: number): StepAP214_PresentedItemSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_PresentedItemSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_PresentedItemSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_PresentedItemSelect): void;

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
NCollection_Array1_StepAP214_SecurityClassificationItem: declare class NCollection_Array1_StepAP214_SecurityClassificationItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP214_SecurityClassificationItem): void;

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
Assign(theOther: NCollection_Array1_StepAP214_SecurityClassificationItem): NCollection_Array1_StepAP214_SecurityClassificationItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP214_SecurityClassificationItem): NCollection_Array1_StepAP214_SecurityClassificationItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP214_SecurityClassificationItem): NCollection_Array1_StepAP214_SecurityClassificationItem;
// theOther: Mutated in place

First(): StepAP214_SecurityClassificationItem;

ChangeFirst(): StepAP214_SecurityClassificationItem;

Last(): StepAP214_SecurityClassificationItem;

ChangeLast(): StepAP214_SecurityClassificationItem;

// Constant value access
Value(theIndex: number): StepAP214_SecurityClassificationItem;

// Variable value access
ChangeValue(theIndex: number): StepAP214_SecurityClassificationItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP214_SecurityClassificationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP214_SecurityClassificationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP214_SecurityClassificationItem): void;

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
NCollection_Array1_StepDimTol_DatumReferenceModifier: declare class NCollection_Array1_StepDimTol_DatumReferenceModifier

constructor

// Initialise the items with theValue
Init(theValue: StepDimTol_DatumReferenceModifier): void;

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
Assign(theOther: NCollection_Array1_StepDimTol_DatumReferenceModifier): NCollection_Array1_StepDimTol_DatumReferenceModifier;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepDimTol_DatumReferenceModifier): NCollection_Array1_StepDimTol_DatumReferenceModifier;

// Move assignment
Move(theOther: NCollection_Array1_StepDimTol_DatumReferenceModifier): NCollection_Array1_StepDimTol_DatumReferenceModifier;
// theOther: Mutated in place

First(): StepDimTol_DatumReferenceModifier;

ChangeFirst(): StepDimTol_DatumReferenceModifier;

Last(): StepDimTol_DatumReferenceModifier;

ChangeLast(): StepDimTol_DatumReferenceModifier;

// Constant value access
Value(theIndex: number): StepDimTol_DatumReferenceModifier;

// Variable value access
ChangeValue(theIndex: number): StepDimTol_DatumReferenceModifier;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepDimTol_DatumReferenceModifier;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepDimTol_DatumReferenceModifier;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepDimTol_DatumReferenceModifier): void;

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
NCollection_Array1_StepDimTol_DatumSystemOrReference: declare class NCollection_Array1_StepDimTol_DatumSystemOrReference

constructor

// Initialise the items with theValue
Init(theValue: StepDimTol_DatumSystemOrReference): void;

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
Assign(theOther: NCollection_Array1_StepDimTol_DatumSystemOrReference): NCollection_Array1_StepDimTol_DatumSystemOrReference;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepDimTol_DatumSystemOrReference): NCollection_Array1_StepDimTol_DatumSystemOrReference;

// Move assignment
Move(theOther: NCollection_Array1_StepDimTol_DatumSystemOrReference): NCollection_Array1_StepDimTol_DatumSystemOrReference;
// theOther: Mutated in place

First(): StepDimTol_DatumSystemOrReference;

ChangeFirst(): StepDimTol_DatumSystemOrReference;

Last(): StepDimTol_DatumSystemOrReference;

ChangeLast(): StepDimTol_DatumSystemOrReference;

// Constant value access
Value(theIndex: number): StepDimTol_DatumSystemOrReference;

// Variable value access
ChangeValue(theIndex: number): StepDimTol_DatumSystemOrReference;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepDimTol_DatumSystemOrReference;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepDimTol_DatumSystemOrReference;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepDimTol_DatumSystemOrReference): void;

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
NCollection_Array1_StepDimTol_GeometricToleranceModifier: declare class NCollection_Array1_StepDimTol_GeometricToleranceModifier

constructor

// Initialise the items with theValue
Init(theValue: StepDimTol_GeometricToleranceModifier): void;

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
Assign(theOther: NCollection_Array1_StepDimTol_GeometricToleranceModifier): NCollection_Array1_StepDimTol_GeometricToleranceModifier;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepDimTol_GeometricToleranceModifier): NCollection_Array1_StepDimTol_GeometricToleranceModifier;

// Move assignment
Move(theOther: NCollection_Array1_StepDimTol_GeometricToleranceModifier): NCollection_Array1_StepDimTol_GeometricToleranceModifier;
// theOther: Mutated in place

First(): StepDimTol_GeometricToleranceModifier;

ChangeFirst(): StepDimTol_GeometricToleranceModifier;

Last(): StepDimTol_GeometricToleranceModifier;

ChangeLast(): StepDimTol_GeometricToleranceModifier;

// Constant value access
Value(theIndex: number): StepDimTol_GeometricToleranceModifier;

// Variable value access
ChangeValue(theIndex: number): StepDimTol_GeometricToleranceModifier;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepDimTol_GeometricToleranceModifier;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepDimTol_GeometricToleranceModifier;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepDimTol_GeometricToleranceModifier): void;

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
NCollection_Array1_StepDimTol_ToleranceZoneTarget: declare class NCollection_Array1_StepDimTol_ToleranceZoneTarget

constructor

// Initialise the items with theValue
Init(theValue: StepDimTol_ToleranceZoneTarget): void;

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

First(): StepDimTol_ToleranceZoneTarget;

ChangeFirst(): StepDimTol_ToleranceZoneTarget;

Last(): StepDimTol_ToleranceZoneTarget;

ChangeLast(): StepDimTol_ToleranceZoneTarget;

// Constant value access
Value(theIndex: number): StepDimTol_ToleranceZoneTarget;

// Variable value access
ChangeValue(theIndex: number): StepDimTol_ToleranceZoneTarget;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepDimTol_ToleranceZoneTarget;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepDimTol_ToleranceZoneTarget;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepDimTol_ToleranceZoneTarget): void;

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
NCollection_Array1_StepElement_MeasureOrUnspecifiedValue: declare class NCollection_Array1_StepElement_MeasureOrUnspecifiedValue

constructor

// Initialise the items with theValue
Init(theValue: StepElement_MeasureOrUnspecifiedValue): void;

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
Assign(theOther: NCollection_Array1_StepElement_MeasureOrUnspecifiedValue): NCollection_Array1_StepElement_MeasureOrUnspecifiedValue;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepElement_MeasureOrUnspecifiedValue): NCollection_Array1_StepElement_MeasureOrUnspecifiedValue;

// Move assignment
Move(theOther: NCollection_Array1_StepElement_MeasureOrUnspecifiedValue): NCollection_Array1_StepElement_MeasureOrUnspecifiedValue;
// theOther: Mutated in place

First(): StepElement_MeasureOrUnspecifiedValue;

ChangeFirst(): StepElement_MeasureOrUnspecifiedValue;

Last(): StepElement_MeasureOrUnspecifiedValue;

ChangeLast(): StepElement_MeasureOrUnspecifiedValue;

// Constant value access
Value(theIndex: number): StepElement_MeasureOrUnspecifiedValue;

// Variable value access
ChangeValue(theIndex: number): StepElement_MeasureOrUnspecifiedValue;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepElement_MeasureOrUnspecifiedValue;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepElement_MeasureOrUnspecifiedValue;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepElement_MeasureOrUnspecifiedValue): void;

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
NCollection_Array1_StepFEA_DegreeOfFreedom: declare class NCollection_Array1_StepFEA_DegreeOfFreedom

constructor

// Initialise the items with theValue
Init(theValue: StepFEA_DegreeOfFreedom): void;

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
Assign(theOther: NCollection_Array1_StepFEA_DegreeOfFreedom): NCollection_Array1_StepFEA_DegreeOfFreedom;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepFEA_DegreeOfFreedom): NCollection_Array1_StepFEA_DegreeOfFreedom;

// Move assignment
Move(theOther: NCollection_Array1_StepFEA_DegreeOfFreedom): NCollection_Array1_StepFEA_DegreeOfFreedom;
// theOther: Mutated in place

First(): StepFEA_DegreeOfFreedom;

ChangeFirst(): StepFEA_DegreeOfFreedom;

Last(): StepFEA_DegreeOfFreedom;

ChangeLast(): StepFEA_DegreeOfFreedom;

// Constant value access
Value(theIndex: number): StepFEA_DegreeOfFreedom;

// Variable value access
ChangeValue(theIndex: number): StepFEA_DegreeOfFreedom;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepFEA_DegreeOfFreedom;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepFEA_DegreeOfFreedom;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepFEA_DegreeOfFreedom): void;

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
