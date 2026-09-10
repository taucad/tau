# libcascade — NCollection (23)

5 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Array2_handle_Geom_BezierSurface: declare class NCollection_Array2_handle_Geom_BezierSurface

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
Assign(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: Geom_BezierSurface): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: Geom_BezierSurface): void;
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
NCollection_Array2_handle_Geom_Surface: declare class NCollection_Array2_handle_Geom_Surface

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
Assign(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: Geom_Surface): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: Geom_Surface): void;
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
NCollection_Array2_handle_NCollection_HArray1_double: declare class NCollection_Array2_handle_NCollection_HArray1_double

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
Assign(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: unknown): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: unknown): void;
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
NCollection_Array2_handle_NCollection_HArray1_int: declare class NCollection_Array2_handle_NCollection_HArray1_int

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
Assign(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: unknown): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: unknown): void;
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
NCollection_Array2_handle_Standard_Transient: declare class NCollection_Array2_handle_Standard_Transient

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
Assign(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: Standard_Transient): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: Standard_Transient): void;
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
