# libcascade — NCollection (11)

9 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_TDF_Label: declare class NCollection_Array1_TDF_Label

constructor

// Initialise the items with theValue
Init(theValue: TDF_Label): void;

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
Assign(theOther: NCollection_Array1_TDF_Label): NCollection_Array1_TDF_Label;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_TDF_Label): NCollection_Array1_TDF_Label;

// Move assignment
Move(theOther: NCollection_Array1_TDF_Label): NCollection_Array1_TDF_Label;
// theOther: Mutated in place

First(): TDF_Label;

ChangeFirst(): TDF_Label;

Last(): TDF_Label;

ChangeLast(): TDF_Label;

// Constant value access
Value(theIndex: number): TDF_Label;

// Variable value access
ChangeValue(theIndex: number): TDF_Label;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TDF_Label;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TDF_Label;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: TDF_Label): void;

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
NCollection_Array1_TopoDS_Shape: declare class NCollection_Array1_TopoDS_Shape

constructor

// Initialise the items with theValue
Init(theValue: TopoDS_Shape): void;

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
Assign(theOther: NCollection_Array1_TopoDS_Shape): NCollection_Array1_TopoDS_Shape;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_TopoDS_Shape): NCollection_Array1_TopoDS_Shape;

// Move assignment
Move(theOther: NCollection_Array1_TopoDS_Shape): NCollection_Array1_TopoDS_Shape;
// theOther: Mutated in place

First(): TopoDS_Shape;

ChangeFirst(): TopoDS_Shape;

Last(): TopoDS_Shape;

ChangeLast(): TopoDS_Shape;

// Constant value access
Value(theIndex: number): TopoDS_Shape;

// Variable value access
ChangeValue(theIndex: number): TopoDS_Shape;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TopoDS_Shape;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TopoDS_Shape;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: TopoDS_Shape): void;

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
NCollection_Array1_bool: declare class NCollection_Array1_bool

constructor

// Initialise the items with theValue
Init(theValue: boolean): void;

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
Assign(theOther: NCollection_Array1_bool): NCollection_Array1_bool;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_bool): NCollection_Array1_bool;

// Move assignment
Move(theOther: NCollection_Array1_bool): NCollection_Array1_bool;
// theOther: Mutated in place

First(): boolean;

ChangeFirst(): boolean;

Last(): boolean;

ChangeLast(): boolean;

// Constant value access
Value(theIndex: number): boolean;

// Variable value access
ChangeValue(theIndex: number): boolean;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): boolean;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): boolean;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: boolean): void;

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
NCollection_Array1_double: declare class NCollection_Array1_double

constructor

// Initialise the items with theValue
Init(theValue: number): void;

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
Assign(theOther: NCollection_Array1_double): NCollection_Array1_double;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_double): NCollection_Array1_double;

// Move assignment
Move(theOther: NCollection_Array1_double): NCollection_Array1_double;
// theOther: Mutated in place

First(): number;

ChangeFirst(): number;

Last(): number;

ChangeLast(): number;

// Constant value access
Value(theIndex: number): number;

// Variable value access
ChangeValue(theIndex: number): number;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): number;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): number;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: number): void;

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
NCollection_Array1_float: declare class NCollection_Array1_float

constructor

// Initialise the items with theValue
Init(theValue: number): void;

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
Assign(theOther: NCollection_Array1_float): NCollection_Array1_float;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_float): NCollection_Array1_float;

// Move assignment
Move(theOther: NCollection_Array1_float): NCollection_Array1_float;
// theOther: Mutated in place

First(): number;

ChangeFirst(): number;

Last(): number;

ChangeLast(): number;

// Constant value access
Value(theIndex: number): number;

// Variable value access
ChangeValue(theIndex: number): number;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): number;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): number;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: number): void;

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
NCollection_Array1_gp_Lin: declare class NCollection_Array1_gp_Lin

constructor

// Initialise the items with theValue
Init(theValue: gp_Lin): void;

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
Assign(theOther: NCollection_Array1_gp_Lin): NCollection_Array1_gp_Lin;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_gp_Lin): NCollection_Array1_gp_Lin;

// Move assignment
Move(theOther: NCollection_Array1_gp_Lin): NCollection_Array1_gp_Lin;
// theOther: Mutated in place

First(): gp_Lin;

ChangeFirst(): gp_Lin;

Last(): gp_Lin;

ChangeLast(): gp_Lin;

// Constant value access
Value(theIndex: number): gp_Lin;

// Variable value access
ChangeValue(theIndex: number): gp_Lin;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_Lin;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_Lin;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: gp_Lin): void;

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
NCollection_Array1_gp_Pnt: declare class NCollection_Array1_gp_Pnt

constructor

// Initialise the items with theValue
Init(theValue: gp_Pnt): void;

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
Assign(theOther: NCollection_Array1_gp_Pnt): NCollection_Array1_gp_Pnt;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_gp_Pnt): NCollection_Array1_gp_Pnt;

// Move assignment
Move(theOther: NCollection_Array1_gp_Pnt): NCollection_Array1_gp_Pnt;
// theOther: Mutated in place

First(): gp_Pnt;

ChangeFirst(): gp_Pnt;

Last(): gp_Pnt;

ChangeLast(): gp_Pnt;

// Constant value access
Value(theIndex: number): gp_Pnt;

// Variable value access
ChangeValue(theIndex: number): gp_Pnt;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_Pnt;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_Pnt;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: gp_Pnt): void;

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
NCollection_Array1_gp_Pnt2d: declare class NCollection_Array1_gp_Pnt2d

constructor

// Initialise the items with theValue
Init(theValue: gp_Pnt2d): void;

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
Assign(theOther: NCollection_Array1_gp_Pnt2d): NCollection_Array1_gp_Pnt2d;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_gp_Pnt2d): NCollection_Array1_gp_Pnt2d;

// Move assignment
Move(theOther: NCollection_Array1_gp_Pnt2d): NCollection_Array1_gp_Pnt2d;
// theOther: Mutated in place

First(): gp_Pnt2d;

ChangeFirst(): gp_Pnt2d;

Last(): gp_Pnt2d;

ChangeLast(): gp_Pnt2d;

// Constant value access
Value(theIndex: number): gp_Pnt2d;

// Variable value access
ChangeValue(theIndex: number): gp_Pnt2d;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_Pnt2d;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_Pnt2d;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: gp_Pnt2d): void;

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
NCollection_Array1_gp_Trsf: declare class NCollection_Array1_gp_Trsf

constructor

// Initialise the items with theValue
Init(theValue: gp_Trsf): void;

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
Assign(theOther: NCollection_Array1_gp_Trsf): NCollection_Array1_gp_Trsf;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_gp_Trsf): NCollection_Array1_gp_Trsf;

// Move assignment
Move(theOther: NCollection_Array1_gp_Trsf): NCollection_Array1_gp_Trsf;
// theOther: Mutated in place

First(): gp_Trsf;

ChangeFirst(): gp_Trsf;

Last(): gp_Trsf;

ChangeLast(): gp_Trsf;

// Constant value access
Value(theIndex: number): gp_Trsf;

// Variable value access
ChangeValue(theIndex: number): gp_Trsf;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_Trsf;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_Trsf;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: gp_Trsf): void;

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
