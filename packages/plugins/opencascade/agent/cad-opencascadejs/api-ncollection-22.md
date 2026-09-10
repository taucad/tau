# libcascade — NCollection (22)

5 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Array2_double: declare class NCollection_Array2_double

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
Assign(theOther: NCollection_Array2_double): NCollection_Array2_double;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_double): NCollection_Array2_double;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_double): NCollection_Array2_double;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_double): NCollection_Array2_double;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_double): NCollection_Array2_double;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_double): NCollection_Array2_double;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: number): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: number): void;
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

// Purpose
NCollection_Array2_gp_Pnt: declare class NCollection_Array2_gp_Pnt

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
Assign(theOther: NCollection_Array2_gp_Pnt): NCollection_Array2_gp_Pnt;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_gp_Pnt): NCollection_Array2_gp_Pnt;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_gp_Pnt): NCollection_Array2_gp_Pnt;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_gp_Pnt): NCollection_Array2_gp_Pnt;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_gp_Pnt): NCollection_Array2_gp_Pnt;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_gp_Pnt): NCollection_Array2_gp_Pnt;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: gp_Pnt): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: gp_Pnt): void;
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

// Purpose
NCollection_Array2_gp_Pnt2d: declare class NCollection_Array2_gp_Pnt2d

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
Assign(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: gp_Pnt2d): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: gp_Pnt2d): void;
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

// Purpose
NCollection_Array2_gp_Vec: declare class NCollection_Array2_gp_Vec

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
Assign(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: gp_Vec): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: gp_Vec): void;
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

// Purpose
NCollection_Array2_gp_XYZ: declare class NCollection_Array2_gp_XYZ

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
Assign(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: gp_XYZ): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: gp_XYZ): void;
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
