# libcascade — NCollection (13)

7 top-level symbols. Signatures are verbatim typescript.

NCollection_Array2_gp_Pnt2d: declare class NCollection_Array2_gp_Pnt2d

constructor

static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

Size(): number;

Length(): number;

NbRows(): number;

NbColumns(): number;

RowLength(): number;

ColLength(): number;

LowerRow(): number;

UpperRow(): number;

LowerCol(): number;

UpperCol(): number;

UpdateLowerRow(theLowerRow: number): void;

UpdateLowerCol(theLowerCol: number): void;

UpdateUpperRow(theUpperRow: number): void;

UpdateUpperCol(theUpperCol: number): void;

Assign(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
Assign(theOther: unknown): unknown;

CopyValues(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
CopyValues(theOther: unknown): unknown;

Move(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_gp_Pnt2d): NCollection_Array2_gp_Pnt2d;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: gp_Pnt2d): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: gp_Pnt2d): void;
SetValue(theIndex: number, theItem: unknown): void;

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

ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array2_gp_Vec: declare class NCollection_Array2_gp_Vec

constructor

static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

Size(): number;

Length(): number;

NbRows(): number;

NbColumns(): number;

RowLength(): number;

ColLength(): number;

LowerRow(): number;

UpperRow(): number;

LowerCol(): number;

UpperCol(): number;

UpdateLowerRow(theLowerRow: number): void;

UpdateLowerCol(theLowerCol: number): void;

UpdateUpperRow(theUpperRow: number): void;

UpdateUpperCol(theUpperCol: number): void;

Assign(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
Assign(theOther: unknown): unknown;

CopyValues(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
CopyValues(theOther: unknown): unknown;

Move(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_gp_Vec): NCollection_Array2_gp_Vec;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: gp_Vec): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: gp_Vec): void;
SetValue(theIndex: number, theItem: unknown): void;

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

ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array2_gp_XYZ: declare class NCollection_Array2_gp_XYZ

constructor

static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

Size(): number;

Length(): number;

NbRows(): number;

NbColumns(): number;

RowLength(): number;

ColLength(): number;

LowerRow(): number;

UpperRow(): number;

LowerCol(): number;

UpperCol(): number;

UpdateLowerRow(theLowerRow: number): void;

UpdateLowerCol(theLowerCol: number): void;

UpdateUpperRow(theUpperRow: number): void;

UpdateUpperCol(theUpperCol: number): void;

Assign(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
Assign(theOther: unknown): unknown;

CopyValues(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
CopyValues(theOther: unknown): unknown;

Move(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_gp_XYZ): NCollection_Array2_gp_XYZ;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: gp_XYZ): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: gp_XYZ): void;
SetValue(theIndex: number, theItem: unknown): void;

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

ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array2_handle_Geom_BezierSurface: declare class NCollection_Array2_handle_Geom_BezierSurface

constructor

static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

Size(): number;

Length(): number;

NbRows(): number;

NbColumns(): number;

RowLength(): number;

ColLength(): number;

LowerRow(): number;

UpperRow(): number;

LowerCol(): number;

UpperCol(): number;

UpdateLowerRow(theLowerRow: number): void;

UpdateLowerCol(theLowerCol: number): void;

UpdateUpperRow(theUpperRow: number): void;

UpdateUpperCol(theUpperCol: number): void;

Assign(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
Assign(theOther: unknown): unknown;

CopyValues(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
CopyValues(theOther: unknown): unknown;

Move(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_Geom_BezierSurface): NCollection_Array2_handle_Geom_BezierSurface;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: Geom_BezierSurface): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: Geom_BezierSurface): void;
SetValue(theIndex: number, theItem: unknown): void;

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

ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array2_handle_Geom_Surface: declare class NCollection_Array2_handle_Geom_Surface

constructor

static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

Size(): number;

Length(): number;

NbRows(): number;

NbColumns(): number;

RowLength(): number;

ColLength(): number;

LowerRow(): number;

UpperRow(): number;

LowerCol(): number;

UpperCol(): number;

UpdateLowerRow(theLowerRow: number): void;

UpdateLowerCol(theLowerCol: number): void;

UpdateUpperRow(theUpperRow: number): void;

UpdateUpperCol(theUpperCol: number): void;

Assign(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
Assign(theOther: unknown): unknown;

CopyValues(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
CopyValues(theOther: unknown): unknown;

Move(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_Geom_Surface): NCollection_Array2_handle_Geom_Surface;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: Geom_Surface): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: Geom_Surface): void;
SetValue(theIndex: number, theItem: unknown): void;

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

ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array2_handle_NCollection_HArray1_double: declare class NCollection_Array2_handle_NCollection_HArray1_double

constructor

static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

Size(): number;

Length(): number;

NbRows(): number;

NbColumns(): number;

RowLength(): number;

ColLength(): number;

LowerRow(): number;

UpperRow(): number;

LowerCol(): number;

UpperCol(): number;

UpdateLowerRow(theLowerRow: number): void;

UpdateLowerCol(theLowerCol: number): void;

UpdateUpperRow(theUpperRow: number): void;

UpdateUpperCol(theUpperCol: number): void;

Assign(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
Assign(theOther: unknown): unknown;

CopyValues(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
CopyValues(theOther: unknown): unknown;

Move(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_NCollection_HArray1_double): NCollection_Array2_handle_NCollection_HArray1_double;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: unknown): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: unknown): void;
SetValue(theIndex: number, theItem: unknown): void;

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

ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array2_handle_NCollection_HArray1_int: declare class NCollection_Array2_handle_NCollection_HArray1_int

constructor

static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

Size(): number;

Length(): number;

NbRows(): number;

NbColumns(): number;

RowLength(): number;

ColLength(): number;

LowerRow(): number;

UpperRow(): number;

LowerCol(): number;

UpperCol(): number;

UpdateLowerRow(theLowerRow: number): void;

UpdateLowerCol(theLowerCol: number): void;

UpdateUpperRow(theUpperRow: number): void;

UpdateUpperCol(theUpperCol: number): void;

Assign(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
Assign(theOther: unknown): unknown;

CopyValues(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
CopyValues(theOther: unknown): unknown;

Move(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_NCollection_HArray1_int): NCollection_Array2_handle_NCollection_HArray1_int;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: unknown): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: unknown): void;
SetValue(theIndex: number, theItem: unknown): void;

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

ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

delete(): void;

[Symbol.dispose](): void;
