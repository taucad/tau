# libcascade — NCollection (17)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepBasic_NamedUnit: declare class NCollection_Array1_handle_StepBasic_NamedUnit

constructor

// Initialise the items with theValue
Init(theValue: StepBasic_NamedUnit): void;

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
Assign(theOther: NCollection_Array1_handle_StepBasic_NamedUnit): NCollection_Array1_handle_StepBasic_NamedUnit;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepBasic_NamedUnit): NCollection_Array1_handle_StepBasic_NamedUnit;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepBasic_NamedUnit): NCollection_Array1_handle_StepBasic_NamedUnit;
// theOther: Mutated in place

First(): StepBasic_NamedUnit;

ChangeFirst(): StepBasic_NamedUnit;

Last(): StepBasic_NamedUnit;

ChangeLast(): StepBasic_NamedUnit;

// Constant value access
Value(theIndex: number): StepBasic_NamedUnit;

// Variable value access
ChangeValue(theIndex: number): StepBasic_NamedUnit;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepBasic_NamedUnit;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepBasic_NamedUnit;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepBasic_NamedUnit): void;

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
NCollection_Array1_handle_StepBasic_Organization: declare class NCollection_Array1_handle_StepBasic_Organization

constructor

// Initialise the items with theValue
Init(theValue: StepBasic_Organization): void;

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
Assign(theOther: NCollection_Array1_handle_StepBasic_Organization): NCollection_Array1_handle_StepBasic_Organization;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepBasic_Organization): NCollection_Array1_handle_StepBasic_Organization;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepBasic_Organization): NCollection_Array1_handle_StepBasic_Organization;
// theOther: Mutated in place

First(): StepBasic_Organization;

ChangeFirst(): StepBasic_Organization;

Last(): StepBasic_Organization;

ChangeLast(): StepBasic_Organization;

// Constant value access
Value(theIndex: number): StepBasic_Organization;

// Variable value access
ChangeValue(theIndex: number): StepBasic_Organization;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepBasic_Organization;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepBasic_Organization;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepBasic_Organization): void;

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
NCollection_Array1_handle_StepBasic_Person: declare class NCollection_Array1_handle_StepBasic_Person

constructor

// Initialise the items with theValue
Init(theValue: StepBasic_Person): void;

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
Assign(theOther: NCollection_Array1_handle_StepBasic_Person): NCollection_Array1_handle_StepBasic_Person;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepBasic_Person): NCollection_Array1_handle_StepBasic_Person;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepBasic_Person): NCollection_Array1_handle_StepBasic_Person;
// theOther: Mutated in place

First(): StepBasic_Person;

ChangeFirst(): StepBasic_Person;

Last(): StepBasic_Person;

ChangeLast(): StepBasic_Person;

// Constant value access
Value(theIndex: number): StepBasic_Person;

// Variable value access
ChangeValue(theIndex: number): StepBasic_Person;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepBasic_Person;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepBasic_Person;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepBasic_Person): void;

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
NCollection_Array1_handle_StepBasic_Product: declare class NCollection_Array1_handle_StepBasic_Product

constructor

// Initialise the items with theValue
Init(theValue: StepBasic_Product): void;

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
Assign(theOther: NCollection_Array1_handle_StepBasic_Product): NCollection_Array1_handle_StepBasic_Product;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepBasic_Product): NCollection_Array1_handle_StepBasic_Product;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepBasic_Product): NCollection_Array1_handle_StepBasic_Product;
// theOther: Mutated in place

First(): StepBasic_Product;

ChangeFirst(): StepBasic_Product;

Last(): StepBasic_Product;

ChangeLast(): StepBasic_Product;

// Constant value access
Value(theIndex: number): StepBasic_Product;

// Variable value access
ChangeValue(theIndex: number): StepBasic_Product;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepBasic_Product;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepBasic_Product;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepBasic_Product): void;

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
NCollection_Array1_handle_StepBasic_ProductContext: declare class NCollection_Array1_handle_StepBasic_ProductContext

constructor

// Initialise the items with theValue
Init(theValue: StepBasic_ProductContext): void;

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
Assign(theOther: NCollection_Array1_handle_StepBasic_ProductContext): NCollection_Array1_handle_StepBasic_ProductContext;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepBasic_ProductContext): NCollection_Array1_handle_StepBasic_ProductContext;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepBasic_ProductContext): NCollection_Array1_handle_StepBasic_ProductContext;
// theOther: Mutated in place

First(): StepBasic_ProductContext;

ChangeFirst(): StepBasic_ProductContext;

Last(): StepBasic_ProductContext;

ChangeLast(): StepBasic_ProductContext;

// Constant value access
Value(theIndex: number): StepBasic_ProductContext;

// Variable value access
ChangeValue(theIndex: number): StepBasic_ProductContext;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepBasic_ProductContext;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepBasic_ProductContext;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepBasic_ProductContext): void;

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
NCollection_Array1_handle_StepBasic_UncertaintyMeasureWithUnit: declare class NCollection_Array1_handle_StepBasic_UncertaintyMeasureWithUnit

constructor

// Initialise the items with theValue
Init(theValue: StepBasic_UncertaintyMeasureWithUnit): void;

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
Assign(theOther: NCollection_Array1_handle_StepBasic_UncertaintyMeasureWithUnit): NCollection_Array1_handle_StepBasic_UncertaintyMeasureWithUnit;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepBasic_UncertaintyMeasureWithUnit): NCollection_Array1_handle_StepBasic_UncertaintyMeasureWithUnit;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepBasic_UncertaintyMeasureWithUnit): NCollection_Array1_handle_StepBasic_UncertaintyMeasureWithUnit;
// theOther: Mutated in place

First(): StepBasic_UncertaintyMeasureWithUnit;

ChangeFirst(): StepBasic_UncertaintyMeasureWithUnit;

Last(): StepBasic_UncertaintyMeasureWithUnit;

ChangeLast(): StepBasic_UncertaintyMeasureWithUnit;

// Constant value access
Value(theIndex: number): StepBasic_UncertaintyMeasureWithUnit;

// Variable value access
ChangeValue(theIndex: number): StepBasic_UncertaintyMeasureWithUnit;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepBasic_UncertaintyMeasureWithUnit;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepBasic_UncertaintyMeasureWithUnit;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepBasic_UncertaintyMeasureWithUnit): void;

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
NCollection_Array1_handle_StepDimTol_DatumReference: declare class NCollection_Array1_handle_StepDimTol_DatumReference

constructor

// Initialise the items with theValue
Init(theValue: StepDimTol_DatumReference): void;

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
Assign(theOther: NCollection_Array1_handle_StepDimTol_DatumReference): NCollection_Array1_handle_StepDimTol_DatumReference;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepDimTol_DatumReference): NCollection_Array1_handle_StepDimTol_DatumReference;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepDimTol_DatumReference): NCollection_Array1_handle_StepDimTol_DatumReference;
// theOther: Mutated in place

First(): StepDimTol_DatumReference;

ChangeFirst(): StepDimTol_DatumReference;

Last(): StepDimTol_DatumReference;

ChangeLast(): StepDimTol_DatumReference;

// Constant value access
Value(theIndex: number): StepDimTol_DatumReference;

// Variable value access
ChangeValue(theIndex: number): StepDimTol_DatumReference;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepDimTol_DatumReference;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepDimTol_DatumReference;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepDimTol_DatumReference): void;

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
NCollection_Array1_handle_StepDimTol_DatumReferenceCompartment: declare class NCollection_Array1_handle_StepDimTol_DatumReferenceCompartment

constructor

// Initialise the items with theValue
Init(theValue: StepDimTol_DatumReferenceCompartment): void;

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
Assign(theOther: NCollection_Array1_handle_StepDimTol_DatumReferenceCompartment): NCollection_Array1_handle_StepDimTol_DatumReferenceCompartment;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepDimTol_DatumReferenceCompartment): NCollection_Array1_handle_StepDimTol_DatumReferenceCompartment;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepDimTol_DatumReferenceCompartment): NCollection_Array1_handle_StepDimTol_DatumReferenceCompartment;
// theOther: Mutated in place

First(): StepDimTol_DatumReferenceCompartment;

ChangeFirst(): StepDimTol_DatumReferenceCompartment;

Last(): StepDimTol_DatumReferenceCompartment;

ChangeLast(): StepDimTol_DatumReferenceCompartment;

// Constant value access
Value(theIndex: number): StepDimTol_DatumReferenceCompartment;

// Variable value access
ChangeValue(theIndex: number): StepDimTol_DatumReferenceCompartment;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepDimTol_DatumReferenceCompartment;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepDimTol_DatumReferenceCompartment;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepDimTol_DatumReferenceCompartment): void;

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
