# libcascade — NCollection (21)

7 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepVisual_PresentationStyleAssignment: declare class NCollection_Array1_handle_StepVisual_PresentationStyleAssignment

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_PresentationStyleAssignment): void;

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
Assign(theOther: NCollection_Array1_handle_StepVisual_PresentationStyleAssignment): NCollection_Array1_handle_StepVisual_PresentationStyleAssignment;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepVisual_PresentationStyleAssignment): NCollection_Array1_handle_StepVisual_PresentationStyleAssignment;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepVisual_PresentationStyleAssignment): NCollection_Array1_handle_StepVisual_PresentationStyleAssignment;
// theOther: Mutated in place

First(): StepVisual_PresentationStyleAssignment;

ChangeFirst(): StepVisual_PresentationStyleAssignment;

Last(): StepVisual_PresentationStyleAssignment;

ChangeLast(): StepVisual_PresentationStyleAssignment;

// Constant value access
Value(theIndex: number): StepVisual_PresentationStyleAssignment;

// Variable value access
ChangeValue(theIndex: number): StepVisual_PresentationStyleAssignment;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_PresentationStyleAssignment;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_PresentationStyleAssignment;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_PresentationStyleAssignment): void;

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
NCollection_Array1_handle_StepVisual_TessellatedItem: declare class NCollection_Array1_handle_StepVisual_TessellatedItem

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_TessellatedItem): void;

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
Assign(theOther: NCollection_Array1_handle_StepVisual_TessellatedItem): NCollection_Array1_handle_StepVisual_TessellatedItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepVisual_TessellatedItem): NCollection_Array1_handle_StepVisual_TessellatedItem;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepVisual_TessellatedItem): NCollection_Array1_handle_StepVisual_TessellatedItem;
// theOther: Mutated in place

First(): StepVisual_TessellatedItem;

ChangeFirst(): StepVisual_TessellatedItem;

Last(): StepVisual_TessellatedItem;

ChangeLast(): StepVisual_TessellatedItem;

// Constant value access
Value(theIndex: number): StepVisual_TessellatedItem;

// Variable value access
ChangeValue(theIndex: number): StepVisual_TessellatedItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_TessellatedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_TessellatedItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_TessellatedItem): void;

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
NCollection_Array1_handle_StepVisual_TessellatedStructuredItem: declare class NCollection_Array1_handle_StepVisual_TessellatedStructuredItem

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_TessellatedStructuredItem): void;

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
Assign(theOther: NCollection_Array1_handle_StepVisual_TessellatedStructuredItem): NCollection_Array1_handle_StepVisual_TessellatedStructuredItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepVisual_TessellatedStructuredItem): NCollection_Array1_handle_StepVisual_TessellatedStructuredItem;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepVisual_TessellatedStructuredItem): NCollection_Array1_handle_StepVisual_TessellatedStructuredItem;
// theOther: Mutated in place

First(): StepVisual_TessellatedStructuredItem;

ChangeFirst(): StepVisual_TessellatedStructuredItem;

Last(): StepVisual_TessellatedStructuredItem;

ChangeLast(): StepVisual_TessellatedStructuredItem;

// Constant value access
Value(theIndex: number): StepVisual_TessellatedStructuredItem;

// Variable value access
ChangeValue(theIndex: number): StepVisual_TessellatedStructuredItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_TessellatedStructuredItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_TessellatedStructuredItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_TessellatedStructuredItem): void;

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
NCollection_Array1_handle_TCollection_HAsciiString: declare class NCollection_Array1_handle_TCollection_HAsciiString

constructor

// Initialise the items with theValue
Init(theValue: TCollection_HAsciiString): void;

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
Assign(theOther: NCollection_Array1_handle_TCollection_HAsciiString): NCollection_Array1_handle_TCollection_HAsciiString;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_TCollection_HAsciiString): NCollection_Array1_handle_TCollection_HAsciiString;

// Move assignment
Move(theOther: NCollection_Array1_handle_TCollection_HAsciiString): NCollection_Array1_handle_TCollection_HAsciiString;
// theOther: Mutated in place

First(): TCollection_HAsciiString;

ChangeFirst(): TCollection_HAsciiString;

Last(): TCollection_HAsciiString;

ChangeLast(): TCollection_HAsciiString;

// Constant value access
Value(theIndex: number): TCollection_HAsciiString;

// Variable value access
ChangeValue(theIndex: number): TCollection_HAsciiString;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TCollection_HAsciiString;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TCollection_HAsciiString;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: TCollection_HAsciiString): void;

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
NCollection_Array1_int: declare class NCollection_Array1_int

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
Assign(theOther: NCollection_Array1_int): NCollection_Array1_int;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_int): NCollection_Array1_int;

// Move assignment
Move(theOther: NCollection_Array1_int): NCollection_Array1_int;
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
NCollection_Array1_unsignedchar: declare class NCollection_Array1_unsignedchar

constructor

// Initialise the items with theValue
Init(theValue: string): void;

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
Assign(theOther: NCollection_Array1_unsignedchar): NCollection_Array1_unsignedchar;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_unsignedchar): NCollection_Array1_unsignedchar;

// Move assignment
Move(theOther: NCollection_Array1_unsignedchar): NCollection_Array1_unsignedchar;
// theOther: Mutated in place

First(): string;

ChangeFirst(): string;

Last(): string;

ChangeLast(): string;

// Constant value access
Value(theIndex: number): string;

// Variable value access
ChangeValue(theIndex: number): string;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): string;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): string;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: string): void;

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

// Purpose
NCollection_Array2_TopoDS_Shape: declare class NCollection_Array2_TopoDS_Shape

constructor

static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

// Size (number of items)
Size(): number;

// Length (legacy int-returning API)
Length(): number;

// Returns number of rows
NbRows(): number;

// Returns number of columns
NbColumns(): number;

// Returns length of the row, i.e
RowLength(): number;

// Returns length of the column, i.e
ColLength(): number;

// LowerRow
LowerRow(): number;

// UpperRow
UpperRow(): number;

// LowerCol
LowerCol(): number;

// UpperCol
UpperCol(): number;

// Updates lower row
UpdateLowerRow(theLowerRow: number): void;

// Updates lower column
UpdateLowerCol(theLowerCol: number): void;

// Updates upper row
UpdateUpperRow(theUpperRow: number): void;

// Updates upper column
UpdateUpperCol(theUpperCol: number): void;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array2_TopoDS_Shape): NCollection_Array2_TopoDS_Shape;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_TopoDS_Shape): NCollection_Array2_TopoDS_Shape;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_TopoDS_Shape): NCollection_Array2_TopoDS_Shape;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_TopoDS_Shape): NCollection_Array2_TopoDS_Shape;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_TopoDS_Shape): NCollection_Array2_TopoDS_Shape;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_TopoDS_Shape): NCollection_Array2_TopoDS_Shape;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: TopoDS_Shape): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: TopoDS_Shape): void;
SetValue(theIndex: number, theItem: unknown): void;

// Resizes the array to specified bounds
Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theRowLower: new lower Row of array
// theRowUpper: new upper Row of array
// theColLower: new lower Column of array
// theColUpper: new upper Column of array
// theToCopyData: flag to copy existing data into new array

// Resizes the array preserving 2D element layout
ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
// theRowLower: new lower Row of array
// theRowUpper: new upper Row of array
// theColLower: new lower Column of array
// theColUpper: new upper Column of array
// theToCopyData: flag to copy existing data into new array

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
