# libcascade — NCollection (14)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_IGESData_IGESEntity: declare class NCollection_Array1_handle_IGESData_IGESEntity

constructor

// Initialise the items with theValue
Init(theValue: IGESData_IGESEntity): void;

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
Assign(theOther: NCollection_Array1_handle_IGESData_IGESEntity): NCollection_Array1_handle_IGESData_IGESEntity;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESData_IGESEntity): NCollection_Array1_handle_IGESData_IGESEntity;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESData_IGESEntity): NCollection_Array1_handle_IGESData_IGESEntity;
// theOther: Mutated in place

First(): IGESData_IGESEntity;

ChangeFirst(): IGESData_IGESEntity;

Last(): IGESData_IGESEntity;

ChangeLast(): IGESData_IGESEntity;

// Constant value access
Value(theIndex: number): IGESData_IGESEntity;

// Variable value access
ChangeValue(theIndex: number): IGESData_IGESEntity;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESData_IGESEntity;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESData_IGESEntity;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESData_IGESEntity): void;

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
NCollection_Array1_handle_IGESData_LineFontEntity: declare class NCollection_Array1_handle_IGESData_LineFontEntity

constructor

// Initialise the items with theValue
Init(theValue: IGESData_LineFontEntity): void;

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
Assign(theOther: NCollection_Array1_handle_IGESData_LineFontEntity): NCollection_Array1_handle_IGESData_LineFontEntity;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESData_LineFontEntity): NCollection_Array1_handle_IGESData_LineFontEntity;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESData_LineFontEntity): NCollection_Array1_handle_IGESData_LineFontEntity;
// theOther: Mutated in place

First(): IGESData_LineFontEntity;

ChangeFirst(): IGESData_LineFontEntity;

Last(): IGESData_LineFontEntity;

ChangeLast(): IGESData_LineFontEntity;

// Constant value access
Value(theIndex: number): IGESData_LineFontEntity;

// Variable value access
ChangeValue(theIndex: number): IGESData_LineFontEntity;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESData_LineFontEntity;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESData_LineFontEntity;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESData_LineFontEntity): void;

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
NCollection_Array1_handle_IGESData_ViewKindEntity: declare class NCollection_Array1_handle_IGESData_ViewKindEntity

constructor

// Initialise the items with theValue
Init(theValue: IGESData_ViewKindEntity): void;

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
Assign(theOther: NCollection_Array1_handle_IGESData_ViewKindEntity): NCollection_Array1_handle_IGESData_ViewKindEntity;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESData_ViewKindEntity): NCollection_Array1_handle_IGESData_ViewKindEntity;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESData_ViewKindEntity): NCollection_Array1_handle_IGESData_ViewKindEntity;
// theOther: Mutated in place

First(): IGESData_ViewKindEntity;

ChangeFirst(): IGESData_ViewKindEntity;

Last(): IGESData_ViewKindEntity;

ChangeLast(): IGESData_ViewKindEntity;

// Constant value access
Value(theIndex: number): IGESData_ViewKindEntity;

// Variable value access
ChangeValue(theIndex: number): IGESData_ViewKindEntity;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESData_ViewKindEntity;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESData_ViewKindEntity;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESData_ViewKindEntity): void;

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
NCollection_Array1_handle_IGESDefs_TabularData: declare class NCollection_Array1_handle_IGESDefs_TabularData

constructor

// Initialise the items with theValue
Init(theValue: IGESDefs_TabularData): void;

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
Assign(theOther: NCollection_Array1_handle_IGESDefs_TabularData): NCollection_Array1_handle_IGESDefs_TabularData;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESDefs_TabularData): NCollection_Array1_handle_IGESDefs_TabularData;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESDefs_TabularData): NCollection_Array1_handle_IGESDefs_TabularData;
// theOther: Mutated in place

First(): IGESDefs_TabularData;

ChangeFirst(): IGESDefs_TabularData;

Last(): IGESDefs_TabularData;

ChangeLast(): IGESDefs_TabularData;

// Constant value access
Value(theIndex: number): IGESDefs_TabularData;

// Variable value access
ChangeValue(theIndex: number): IGESDefs_TabularData;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESDefs_TabularData;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESDefs_TabularData;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESDefs_TabularData): void;

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
NCollection_Array1_handle_IGESDimen_GeneralNote: declare class NCollection_Array1_handle_IGESDimen_GeneralNote

constructor

// Initialise the items with theValue
Init(theValue: IGESDimen_GeneralNote): void;

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
Assign(theOther: NCollection_Array1_handle_IGESDimen_GeneralNote): NCollection_Array1_handle_IGESDimen_GeneralNote;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESDimen_GeneralNote): NCollection_Array1_handle_IGESDimen_GeneralNote;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESDimen_GeneralNote): NCollection_Array1_handle_IGESDimen_GeneralNote;
// theOther: Mutated in place

First(): IGESDimen_GeneralNote;

ChangeFirst(): IGESDimen_GeneralNote;

Last(): IGESDimen_GeneralNote;

ChangeLast(): IGESDimen_GeneralNote;

// Constant value access
Value(theIndex: number): IGESDimen_GeneralNote;

// Variable value access
ChangeValue(theIndex: number): IGESDimen_GeneralNote;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESDimen_GeneralNote;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESDimen_GeneralNote;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESDimen_GeneralNote): void;

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
NCollection_Array1_handle_IGESDimen_LeaderArrow: declare class NCollection_Array1_handle_IGESDimen_LeaderArrow

constructor

// Initialise the items with theValue
Init(theValue: IGESDimen_LeaderArrow): void;

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
Assign(theOther: NCollection_Array1_handle_IGESDimen_LeaderArrow): NCollection_Array1_handle_IGESDimen_LeaderArrow;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESDimen_LeaderArrow): NCollection_Array1_handle_IGESDimen_LeaderArrow;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESDimen_LeaderArrow): NCollection_Array1_handle_IGESDimen_LeaderArrow;
// theOther: Mutated in place

First(): IGESDimen_LeaderArrow;

ChangeFirst(): IGESDimen_LeaderArrow;

Last(): IGESDimen_LeaderArrow;

ChangeLast(): IGESDimen_LeaderArrow;

// Constant value access
Value(theIndex: number): IGESDimen_LeaderArrow;

// Variable value access
ChangeValue(theIndex: number): IGESDimen_LeaderArrow;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESDimen_LeaderArrow;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESDimen_LeaderArrow;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESDimen_LeaderArrow): void;

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
NCollection_Array1_handle_IGESDraw_ConnectPoint: declare class NCollection_Array1_handle_IGESDraw_ConnectPoint

constructor

// Initialise the items with theValue
Init(theValue: IGESDraw_ConnectPoint): void;

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

First(): IGESDraw_ConnectPoint;

ChangeFirst(): IGESDraw_ConnectPoint;

Last(): IGESDraw_ConnectPoint;

ChangeLast(): IGESDraw_ConnectPoint;

// Constant value access
Value(theIndex: number): IGESDraw_ConnectPoint;

// Variable value access
ChangeValue(theIndex: number): IGESDraw_ConnectPoint;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESDraw_ConnectPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESDraw_ConnectPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESDraw_ConnectPoint): void;

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
NCollection_Array1_handle_IGESGeom_Boundary: declare class NCollection_Array1_handle_IGESGeom_Boundary

constructor

// Initialise the items with theValue
Init(theValue: IGESGeom_Boundary): void;

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
Assign(theOther: NCollection_Array1_handle_IGESGeom_Boundary): NCollection_Array1_handle_IGESGeom_Boundary;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESGeom_Boundary): NCollection_Array1_handle_IGESGeom_Boundary;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESGeom_Boundary): NCollection_Array1_handle_IGESGeom_Boundary;
// theOther: Mutated in place

First(): IGESGeom_Boundary;

ChangeFirst(): IGESGeom_Boundary;

Last(): IGESGeom_Boundary;

ChangeLast(): IGESGeom_Boundary;

// Constant value access
Value(theIndex: number): IGESGeom_Boundary;

// Variable value access
ChangeValue(theIndex: number): IGESGeom_Boundary;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESGeom_Boundary;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESGeom_Boundary;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESGeom_Boundary): void;

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
