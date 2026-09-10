# libcascade — NCollection (9)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_StepVisual_BoxCharacteristicSelect: declare class NCollection_Array1_StepVisual_BoxCharacteristicSelect

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_BoxCharacteristicSelect): void;

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
Assign(theOther: NCollection_Array1_StepVisual_BoxCharacteristicSelect): NCollection_Array1_StepVisual_BoxCharacteristicSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_BoxCharacteristicSelect): NCollection_Array1_StepVisual_BoxCharacteristicSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_BoxCharacteristicSelect): NCollection_Array1_StepVisual_BoxCharacteristicSelect;
// theOther: Mutated in place

First(): StepVisual_BoxCharacteristicSelect;

ChangeFirst(): StepVisual_BoxCharacteristicSelect;

Last(): StepVisual_BoxCharacteristicSelect;

ChangeLast(): StepVisual_BoxCharacteristicSelect;

// Constant value access
Value(theIndex: number): StepVisual_BoxCharacteristicSelect;

// Variable value access
ChangeValue(theIndex: number): StepVisual_BoxCharacteristicSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_BoxCharacteristicSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_BoxCharacteristicSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_BoxCharacteristicSelect): void;

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
NCollection_Array1_StepVisual_CameraModelD3MultiClippingInterectionSelect: declare class NCollection_Array1_StepVisual_CameraModelD3MultiClippingInterectionSelect

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_CameraModelD3MultiClippingInterectionSelect): void;

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
Assign(theOther: NCollection_Array1_StepVisual_CameraModelD3MultiClippingInterectionSelect): NCollection_Array1_StepVisual_CameraModelD3MultiClippingInterectionSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_CameraModelD3MultiClippingInterectionSelect): NCollection_Array1_StepVisual_CameraModelD3MultiClippingInterectionSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_CameraModelD3MultiClippingInterectionSelect): NCollection_Array1_StepVisual_CameraModelD3MultiClippingInterectionSelect;
// theOther: Mutated in place

First(): StepVisual_CameraModelD3MultiClippingInterectionSelect;

ChangeFirst(): StepVisual_CameraModelD3MultiClippingInterectionSelect;

Last(): StepVisual_CameraModelD3MultiClippingInterectionSelect;

ChangeLast(): StepVisual_CameraModelD3MultiClippingInterectionSelect;

// Constant value access
Value(theIndex: number): StepVisual_CameraModelD3MultiClippingInterectionSelect;

// Variable value access
ChangeValue(theIndex: number): StepVisual_CameraModelD3MultiClippingInterectionSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_CameraModelD3MultiClippingInterectionSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_CameraModelD3MultiClippingInterectionSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_CameraModelD3MultiClippingInterectionSelect): void;

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
NCollection_Array1_StepVisual_CameraModelD3MultiClippingUnionSelect: declare class NCollection_Array1_StepVisual_CameraModelD3MultiClippingUnionSelect

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_CameraModelD3MultiClippingUnionSelect): void;

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
Assign(theOther: NCollection_Array1_StepVisual_CameraModelD3MultiClippingUnionSelect): NCollection_Array1_StepVisual_CameraModelD3MultiClippingUnionSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_CameraModelD3MultiClippingUnionSelect): NCollection_Array1_StepVisual_CameraModelD3MultiClippingUnionSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_CameraModelD3MultiClippingUnionSelect): NCollection_Array1_StepVisual_CameraModelD3MultiClippingUnionSelect;
// theOther: Mutated in place

First(): StepVisual_CameraModelD3MultiClippingUnionSelect;

ChangeFirst(): StepVisual_CameraModelD3MultiClippingUnionSelect;

Last(): StepVisual_CameraModelD3MultiClippingUnionSelect;

ChangeLast(): StepVisual_CameraModelD3MultiClippingUnionSelect;

// Constant value access
Value(theIndex: number): StepVisual_CameraModelD3MultiClippingUnionSelect;

// Variable value access
ChangeValue(theIndex: number): StepVisual_CameraModelD3MultiClippingUnionSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_CameraModelD3MultiClippingUnionSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_CameraModelD3MultiClippingUnionSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_CameraModelD3MultiClippingUnionSelect): void;

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
NCollection_Array1_StepVisual_DirectionCountSelect: declare class NCollection_Array1_StepVisual_DirectionCountSelect

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_DirectionCountSelect): void;

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
Assign(theOther: NCollection_Array1_StepVisual_DirectionCountSelect): NCollection_Array1_StepVisual_DirectionCountSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_DirectionCountSelect): NCollection_Array1_StepVisual_DirectionCountSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_DirectionCountSelect): NCollection_Array1_StepVisual_DirectionCountSelect;
// theOther: Mutated in place

First(): StepVisual_DirectionCountSelect;

ChangeFirst(): StepVisual_DirectionCountSelect;

Last(): StepVisual_DirectionCountSelect;

ChangeLast(): StepVisual_DirectionCountSelect;

// Constant value access
Value(theIndex: number): StepVisual_DirectionCountSelect;

// Variable value access
ChangeValue(theIndex: number): StepVisual_DirectionCountSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_DirectionCountSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_DirectionCountSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_DirectionCountSelect): void;

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
NCollection_Array1_StepVisual_DraughtingCalloutElement: declare class NCollection_Array1_StepVisual_DraughtingCalloutElement

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_DraughtingCalloutElement): void;

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
Assign(theOther: NCollection_Array1_StepVisual_DraughtingCalloutElement): NCollection_Array1_StepVisual_DraughtingCalloutElement;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_DraughtingCalloutElement): NCollection_Array1_StepVisual_DraughtingCalloutElement;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_DraughtingCalloutElement): NCollection_Array1_StepVisual_DraughtingCalloutElement;
// theOther: Mutated in place

First(): StepVisual_DraughtingCalloutElement;

ChangeFirst(): StepVisual_DraughtingCalloutElement;

Last(): StepVisual_DraughtingCalloutElement;

ChangeLast(): StepVisual_DraughtingCalloutElement;

// Constant value access
Value(theIndex: number): StepVisual_DraughtingCalloutElement;

// Variable value access
ChangeValue(theIndex: number): StepVisual_DraughtingCalloutElement;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_DraughtingCalloutElement;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_DraughtingCalloutElement;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_DraughtingCalloutElement): void;

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
NCollection_Array1_StepVisual_FillStyleSelect: declare class NCollection_Array1_StepVisual_FillStyleSelect

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_FillStyleSelect): void;

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
Assign(theOther: NCollection_Array1_StepVisual_FillStyleSelect): NCollection_Array1_StepVisual_FillStyleSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_FillStyleSelect): NCollection_Array1_StepVisual_FillStyleSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_FillStyleSelect): NCollection_Array1_StepVisual_FillStyleSelect;
// theOther: Mutated in place

First(): StepVisual_FillStyleSelect;

ChangeFirst(): StepVisual_FillStyleSelect;

Last(): StepVisual_FillStyleSelect;

ChangeLast(): StepVisual_FillStyleSelect;

// Constant value access
Value(theIndex: number): StepVisual_FillStyleSelect;

// Variable value access
ChangeValue(theIndex: number): StepVisual_FillStyleSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_FillStyleSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_FillStyleSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_FillStyleSelect): void;

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
NCollection_Array1_StepVisual_InvisibleItem: declare class NCollection_Array1_StepVisual_InvisibleItem

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_InvisibleItem): void;

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
Assign(theOther: NCollection_Array1_StepVisual_InvisibleItem): NCollection_Array1_StepVisual_InvisibleItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_InvisibleItem): NCollection_Array1_StepVisual_InvisibleItem;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_InvisibleItem): NCollection_Array1_StepVisual_InvisibleItem;
// theOther: Mutated in place

First(): StepVisual_InvisibleItem;

ChangeFirst(): StepVisual_InvisibleItem;

Last(): StepVisual_InvisibleItem;

ChangeLast(): StepVisual_InvisibleItem;

// Constant value access
Value(theIndex: number): StepVisual_InvisibleItem;

// Variable value access
ChangeValue(theIndex: number): StepVisual_InvisibleItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_InvisibleItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_InvisibleItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_InvisibleItem): void;

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
NCollection_Array1_StepVisual_LayeredItem: declare class NCollection_Array1_StepVisual_LayeredItem

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_LayeredItem): void;

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
Assign(theOther: NCollection_Array1_StepVisual_LayeredItem): NCollection_Array1_StepVisual_LayeredItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_LayeredItem): NCollection_Array1_StepVisual_LayeredItem;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_LayeredItem): NCollection_Array1_StepVisual_LayeredItem;
// theOther: Mutated in place

First(): StepVisual_LayeredItem;

ChangeFirst(): StepVisual_LayeredItem;

Last(): StepVisual_LayeredItem;

ChangeLast(): StepVisual_LayeredItem;

// Constant value access
Value(theIndex: number): StepVisual_LayeredItem;

// Variable value access
ChangeValue(theIndex: number): StepVisual_LayeredItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_LayeredItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_LayeredItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_LayeredItem): void;

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
