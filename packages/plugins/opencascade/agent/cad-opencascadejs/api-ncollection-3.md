# libcascade — NCollection (3)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_Bnd_Box: declare class NCollection_Array1_Bnd_Box

constructor

// Initialise the items with theValue
Init(theValue: Bnd_Box): void;

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
Assign(theOther: NCollection_Array1_Bnd_Box): NCollection_Array1_Bnd_Box;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_Bnd_Box): NCollection_Array1_Bnd_Box;

// Move assignment
Move(theOther: NCollection_Array1_Bnd_Box): NCollection_Array1_Bnd_Box;
// theOther: Mutated in place

First(): Bnd_Box;

ChangeFirst(): Bnd_Box;

Last(): Bnd_Box;

ChangeLast(): Bnd_Box;

// Constant value access
Value(theIndex: number): Bnd_Box;

// Variable value access
ChangeValue(theIndex: number): Bnd_Box;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Bnd_Box;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Bnd_Box;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Bnd_Box): void;

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
NCollection_Array1_ChFiDS_CircSection: declare class NCollection_Array1_ChFiDS_CircSection

constructor

// Initialise the items with theValue
Init(theValue: ChFiDS_CircSection): void;

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
Assign(theOther: NCollection_Array1_ChFiDS_CircSection): NCollection_Array1_ChFiDS_CircSection;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_ChFiDS_CircSection): NCollection_Array1_ChFiDS_CircSection;

// Move assignment
Move(theOther: NCollection_Array1_ChFiDS_CircSection): NCollection_Array1_ChFiDS_CircSection;
// theOther: Mutated in place

First(): ChFiDS_CircSection;

ChangeFirst(): ChFiDS_CircSection;

Last(): ChFiDS_CircSection;

ChangeLast(): ChFiDS_CircSection;

// Constant value access
Value(theIndex: number): ChFiDS_CircSection;

// Variable value access
ChangeValue(theIndex: number): ChFiDS_CircSection;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): ChFiDS_CircSection;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): ChFiDS_CircSection;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: ChFiDS_CircSection): void;

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
NCollection_Array1_HLRAlgo_PolyHidingData: declare class NCollection_Array1_HLRAlgo_PolyHidingData

constructor

// Initialise the items with theValue
Init(theValue: HLRAlgo_PolyHidingData): void;

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
Assign(theOther: NCollection_Array1_HLRAlgo_PolyHidingData): NCollection_Array1_HLRAlgo_PolyHidingData;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_HLRAlgo_PolyHidingData): NCollection_Array1_HLRAlgo_PolyHidingData;

// Move assignment
Move(theOther: NCollection_Array1_HLRAlgo_PolyHidingData): NCollection_Array1_HLRAlgo_PolyHidingData;
// theOther: Mutated in place

First(): HLRAlgo_PolyHidingData;

ChangeFirst(): HLRAlgo_PolyHidingData;

Last(): HLRAlgo_PolyHidingData;

ChangeLast(): HLRAlgo_PolyHidingData;

// Constant value access
Value(theIndex: number): HLRAlgo_PolyHidingData;

// Variable value access
ChangeValue(theIndex: number): HLRAlgo_PolyHidingData;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): HLRAlgo_PolyHidingData;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): HLRAlgo_PolyHidingData;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: HLRAlgo_PolyHidingData): void;

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
NCollection_Array1_HLRAlgo_TriangleData: declare class NCollection_Array1_HLRAlgo_TriangleData

constructor

// Initialise the items with theValue
Init(theValue: HLRAlgo_TriangleData): void;

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
Assign(theOther: NCollection_Array1_HLRAlgo_TriangleData): NCollection_Array1_HLRAlgo_TriangleData;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_HLRAlgo_TriangleData): NCollection_Array1_HLRAlgo_TriangleData;

// Move assignment
Move(theOther: NCollection_Array1_HLRAlgo_TriangleData): NCollection_Array1_HLRAlgo_TriangleData;
// theOther: Mutated in place

First(): HLRAlgo_TriangleData;

ChangeFirst(): HLRAlgo_TriangleData;

Last(): HLRAlgo_TriangleData;

ChangeLast(): HLRAlgo_TriangleData;

// Constant value access
Value(theIndex: number): HLRAlgo_TriangleData;

// Variable value access
ChangeValue(theIndex: number): HLRAlgo_TriangleData;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): HLRAlgo_TriangleData;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): HLRAlgo_TriangleData;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: HLRAlgo_TriangleData): void;

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
NCollection_Array1_NCollection_Vec3_float: declare class NCollection_Array1_NCollection_Vec3_float

constructor

// Initialise the items with theValue
Init(theValue: unknown): void;

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
Assign(theOther: NCollection_Array1_NCollection_Vec3_float): NCollection_Array1_NCollection_Vec3_float;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_NCollection_Vec3_float): NCollection_Array1_NCollection_Vec3_float;

// Move assignment
Move(theOther: NCollection_Array1_NCollection_Vec3_float): NCollection_Array1_NCollection_Vec3_float;
// theOther: Mutated in place

First(): unknown;

ChangeFirst(): unknown;

Last(): unknown;

ChangeLast(): unknown;

// Constant value access
Value(theIndex: number): unknown;

// Variable value access
ChangeValue(theIndex: number): unknown;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): unknown;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): unknown;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: unknown): void;

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
NCollection_Array1_Plate_PinpointConstraint: declare class NCollection_Array1_Plate_PinpointConstraint

constructor

// Initialise the items with theValue
Init(theValue: Plate_PinpointConstraint): void;

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
Assign(theOther: NCollection_Array1_Plate_PinpointConstraint): NCollection_Array1_Plate_PinpointConstraint;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_Plate_PinpointConstraint): NCollection_Array1_Plate_PinpointConstraint;

// Move assignment
Move(theOther: NCollection_Array1_Plate_PinpointConstraint): NCollection_Array1_Plate_PinpointConstraint;
// theOther: Mutated in place

First(): Plate_PinpointConstraint;

ChangeFirst(): Plate_PinpointConstraint;

Last(): Plate_PinpointConstraint;

ChangeLast(): Plate_PinpointConstraint;

// Constant value access
Value(theIndex: number): Plate_PinpointConstraint;

// Variable value access
ChangeValue(theIndex: number): Plate_PinpointConstraint;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Plate_PinpointConstraint;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Plate_PinpointConstraint;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Plate_PinpointConstraint): void;

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
NCollection_Array1_Poly_Triangle: declare class NCollection_Array1_Poly_Triangle

constructor

// Initialise the items with theValue
Init(theValue: Poly_Triangle): void;

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
Assign(theOther: NCollection_Array1_Poly_Triangle): NCollection_Array1_Poly_Triangle;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_Poly_Triangle): NCollection_Array1_Poly_Triangle;

// Move assignment
Move(theOther: NCollection_Array1_Poly_Triangle): NCollection_Array1_Poly_Triangle;
// theOther: Mutated in place

First(): Poly_Triangle;

ChangeFirst(): Poly_Triangle;

Last(): Poly_Triangle;

ChangeLast(): Poly_Triangle;

// Constant value access
Value(theIndex: number): Poly_Triangle;

// Variable value access
ChangeValue(theIndex: number): Poly_Triangle;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Poly_Triangle;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Poly_Triangle;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Poly_Triangle): void;

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
NCollection_Array1_StepAP203_ApprovedItem: declare class NCollection_Array1_StepAP203_ApprovedItem

constructor

// Initialise the items with theValue
Init(theValue: StepAP203_ApprovedItem): void;

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
Assign(theOther: NCollection_Array1_StepAP203_ApprovedItem): NCollection_Array1_StepAP203_ApprovedItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepAP203_ApprovedItem): NCollection_Array1_StepAP203_ApprovedItem;

// Move assignment
Move(theOther: NCollection_Array1_StepAP203_ApprovedItem): NCollection_Array1_StepAP203_ApprovedItem;
// theOther: Mutated in place

First(): StepAP203_ApprovedItem;

ChangeFirst(): StepAP203_ApprovedItem;

Last(): StepAP203_ApprovedItem;

ChangeLast(): StepAP203_ApprovedItem;

// Constant value access
Value(theIndex: number): StepAP203_ApprovedItem;

// Variable value access
ChangeValue(theIndex: number): StepAP203_ApprovedItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepAP203_ApprovedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepAP203_ApprovedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepAP203_ApprovedItem): void;

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
