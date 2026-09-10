# libcascade — NCollection (24)

8 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Array2_handle_StepGeom_CartesianPoint: declare class NCollection_Array2_handle_StepGeom_CartesianPoint

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
Assign(theOther: unknown): unknown;
Assign(theOther: unknown): unknown;
Assign(theOther: unknown): unknown;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: unknown): unknown;
Move(theOther: unknown): unknown;
Move(theOther: unknown): unknown;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: StepGeom_CartesianPoint): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: StepGeom_CartesianPoint): void;
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
NCollection_Array2_handle_StepGeom_SurfacePatch: declare class NCollection_Array2_handle_StepGeom_SurfacePatch

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
Assign(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
Move(theOther: unknown): unknown;
// theOther: Mutated in place

// SetValue
SetValue(theRow: number, theCol: number, theItem: StepGeom_SurfacePatch): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: StepGeom_SurfacePatch): void;
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
NCollection_Array2_int: declare class NCollection_Array2_int

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
Assign(theOther: NCollection_Array2_int): NCollection_Array2_int;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_int): NCollection_Array2_int;
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array2_int): NCollection_Array2_int;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_int): NCollection_Array2_int;
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: NCollection_Array2_int): NCollection_Array2_int;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_int): NCollection_Array2_int;
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
NCollection_DataMap_TCollection_AsciiString_RWObj_Material: declare class NCollection_DataMap_TCollection_AsciiString_RWObj_Material extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assignment
Assign(theOther: unknown): unknown;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TCollection_AsciiString, theItem: RWObj_Material): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_AsciiString, theItem: RWObj_Material): RWObj_Material;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_AsciiString, theItem: RWObj_Material): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_AsciiString, theItem: RWObj_Material): RWObj_Material;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_AsciiString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_AsciiString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_AsciiString): RWObj_Material;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_AsciiString): RWObj_Material;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_AsciiString): RWObj_Material;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString: declare class NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assignment
Assign(theOther: unknown): unknown;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): TCollection_AsciiString;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): TCollection_AsciiString;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_AsciiString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_AsciiString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_AsciiString): TCollection_AsciiString;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_AsciiString): TCollection_AsciiString;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_AsciiString): TCollection_AsciiString;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape: declare class NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assignment
Assign(theOther: unknown): unknown;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): TopoDS_Shape;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): TopoDS_Shape;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_AsciiString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_AsciiString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_AsciiString): TopoDS_Shape;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_AsciiString): TopoDS_Shape;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_AsciiString): TopoDS_Shape;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile: declare class NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assignment
Assign(theOther: unknown): unknown;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): STEPCAFControl_ExternFile;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): STEPCAFControl_ExternFile;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_AsciiString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_AsciiString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_AsciiString): STEPCAFControl_ExternFile;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_AsciiString): STEPCAFControl_ExternFile;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_AsciiString): STEPCAFControl_ExternFile;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient: declare class NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assignment
Assign(theOther: unknown): unknown;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TCollection_AsciiString, theItem: Standard_Transient): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_AsciiString, theItem: Standard_Transient): Standard_Transient;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_AsciiString, theItem: Standard_Transient): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_AsciiString, theItem: Standard_Transient): Standard_Transient;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_AsciiString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_AsciiString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_AsciiString): Standard_Transient;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_AsciiString): Standard_Transient;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_AsciiString): Standard_Transient;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
