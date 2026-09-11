# libcascade — NCollection (14)

13 top-level symbols. Signatures are verbatim typescript.

NCollection_Array2_handle_Standard_Transient: declare class NCollection_Array2_handle_Standard_Transient

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

Assign(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
Assign(theOther: unknown): unknown;

CopyValues(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
CopyValues(theOther: unknown): unknown;

Move(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_Standard_Transient): NCollection_Array2_handle_Standard_Transient;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: Standard_Transient): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: Standard_Transient): void;
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

NCollection_Array2_handle_StepGeom_CartesianPoint: declare class NCollection_Array2_handle_StepGeom_CartesianPoint

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

Assign(theOther: unknown): unknown;
Assign(theOther: unknown): unknown;
Assign(theOther: unknown): unknown;
Assign(theOther: unknown): unknown;

CopyValues(theOther: unknown): unknown;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: unknown): unknown;

Move(theOther: unknown): unknown;
Move(theOther: unknown): unknown;
Move(theOther: unknown): unknown;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: StepGeom_CartesianPoint): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: StepGeom_CartesianPoint): void;
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

NCollection_Array2_handle_StepGeom_SurfacePatch: declare class NCollection_Array2_handle_StepGeom_SurfacePatch

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

Assign(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
Assign(theOther: unknown): unknown;

CopyValues(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
CopyValues(theOther: unknown): unknown;

Move(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: StepGeom_SurfacePatch): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: StepGeom_SurfacePatch): void;
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

NCollection_Array2_int: declare class NCollection_Array2_int

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

Assign(theOther: NCollection_Array2_int): NCollection_Array2_int;
Assign(theOther: unknown): unknown;
Assign(theOther: NCollection_Array2_int): NCollection_Array2_int;
Assign(theOther: unknown): unknown;

CopyValues(theOther: NCollection_Array2_int): NCollection_Array2_int;
CopyValues(theOther: unknown): unknown;
CopyValues(theOther: NCollection_Array2_int): NCollection_Array2_int;
CopyValues(theOther: unknown): unknown;

Move(theOther: NCollection_Array2_int): NCollection_Array2_int;
Move(theOther: unknown): unknown;
Move(theOther: NCollection_Array2_int): NCollection_Array2_int;
Move(theOther: unknown): unknown;

SetValue(theRow: number, theCol: number, theItem: number): void;
SetValue(theIndex: number, theItem: unknown): void;
SetValue(theRow: number, theCol: number, theItem: number): void;
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

NCollection_DataMap_TCollection_AsciiString_RWObj_Material: declare class NCollection_DataMap_TCollection_AsciiString_RWObj_Material extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Bind(theKey: TCollection_AsciiString, theItem: RWObj_Material): boolean;

Bound(theKey: TCollection_AsciiString, theItem: RWObj_Material): RWObj_Material;

TryBind(theKey: TCollection_AsciiString, theItem: RWObj_Material): boolean;

TryBound(theKey: TCollection_AsciiString, theItem: RWObj_Material): RWObj_Material;

IsBound(theKey: TCollection_AsciiString): boolean;

UnBind(theKey: TCollection_AsciiString): boolean;

Seek(theKey: TCollection_AsciiString): RWObj_Material;

ChangeSeek(theKey: TCollection_AsciiString): RWObj_Material;

ChangeFind(theKey: TCollection_AsciiString): RWObj_Material;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString: declare class NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Bind(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): boolean;

Bound(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): TCollection_AsciiString;

TryBind(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): boolean;

TryBound(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): TCollection_AsciiString;

IsBound(theKey: TCollection_AsciiString): boolean;

UnBind(theKey: TCollection_AsciiString): boolean;

Seek(theKey: TCollection_AsciiString): TCollection_AsciiString;

ChangeSeek(theKey: TCollection_AsciiString): TCollection_AsciiString;

ChangeFind(theKey: TCollection_AsciiString): TCollection_AsciiString;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape: declare class NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Bind(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): boolean;

Bound(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): TopoDS_Shape;

TryBind(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): boolean;

TryBound(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): TopoDS_Shape;

IsBound(theKey: TCollection_AsciiString): boolean;

UnBind(theKey: TCollection_AsciiString): boolean;

Seek(theKey: TCollection_AsciiString): TopoDS_Shape;

ChangeSeek(theKey: TCollection_AsciiString): TopoDS_Shape;

ChangeFind(theKey: TCollection_AsciiString): TopoDS_Shape;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile: declare class NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Bind(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): boolean;

Bound(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): STEPCAFControl_ExternFile;

TryBind(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): boolean;

TryBound(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): STEPCAFControl_ExternFile;

IsBound(theKey: TCollection_AsciiString): boolean;

UnBind(theKey: TCollection_AsciiString): boolean;

Seek(theKey: TCollection_AsciiString): STEPCAFControl_ExternFile;

ChangeSeek(theKey: TCollection_AsciiString): STEPCAFControl_ExternFile;

ChangeFind(theKey: TCollection_AsciiString): STEPCAFControl_ExternFile;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient: declare class NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Bind(theKey: TCollection_AsciiString, theItem: Standard_Transient): boolean;

Bound(theKey: TCollection_AsciiString, theItem: Standard_Transient): Standard_Transient;

TryBind(theKey: TCollection_AsciiString, theItem: Standard_Transient): boolean;

TryBound(theKey: TCollection_AsciiString, theItem: Standard_Transient): Standard_Transient;

IsBound(theKey: TCollection_AsciiString): boolean;

UnBind(theKey: TCollection_AsciiString): boolean;

Seek(theKey: TCollection_AsciiString): Standard_Transient;

ChangeSeek(theKey: TCollection_AsciiString): Standard_Transient;

ChangeFind(theKey: TCollection_AsciiString): Standard_Transient;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_int: declare class NCollection_DataMap_TCollection_AsciiString_int extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Bind(theKey: TCollection_AsciiString, theItem: number): boolean;

Bound(theKey: TCollection_AsciiString, theItem: number): number;

TryBind(theKey: TCollection_AsciiString, theItem: number): boolean;

TryBound(theKey: TCollection_AsciiString, theItem: number): number;

IsBound(theKey: TCollection_AsciiString): boolean;

UnBind(theKey: TCollection_AsciiString): boolean;

Seek(theKey: TCollection_AsciiString): number;

ChangeSeek(theKey: TCollection_AsciiString): number;

ChangeFind(theKey: TCollection_AsciiString): number;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString: declare class NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Bind(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): boolean;

Bound(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): TCollection_ExtendedString;

TryBind(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): boolean;

TryBound(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): TCollection_ExtendedString;

IsBound(theKey: TCollection_ExtendedString): boolean;

UnBind(theKey: TCollection_ExtendedString): boolean;

Seek(theKey: TCollection_ExtendedString): TCollection_ExtendedString;

ChangeSeek(theKey: TCollection_ExtendedString): TCollection_ExtendedString;

ChangeFind(theKey: TCollection_ExtendedString): TCollection_ExtendedString;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_DataMap_TCollection_ExtendedString_double: declare class NCollection_DataMap_TCollection_ExtendedString_double extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Bind(theKey: TCollection_ExtendedString, theItem: number): boolean;

Bound(theKey: TCollection_ExtendedString, theItem: number): number;

TryBind(theKey: TCollection_ExtendedString, theItem: number): boolean;

TryBound(theKey: TCollection_ExtendedString, theItem: number): number;

IsBound(theKey: TCollection_ExtendedString): boolean;

UnBind(theKey: TCollection_ExtendedString): boolean;

Seek(theKey: TCollection_ExtendedString): number;

ChangeSeek(theKey: TCollection_ExtendedString): number;

ChangeFind(theKey: TCollection_ExtendedString): number;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData: declare class NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Bind(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): boolean;

Bound(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): CDM_MetaData;

TryBind(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): boolean;

TryBound(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): CDM_MetaData;

IsBound(theKey: TCollection_ExtendedString): boolean;

UnBind(theKey: TCollection_ExtendedString): boolean;

Seek(theKey: TCollection_ExtendedString): CDM_MetaData;

ChangeSeek(theKey: TCollection_ExtendedString): CDM_MetaData;

ChangeFind(theKey: TCollection_ExtendedString): CDM_MetaData;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

delete(): void;

[Symbol.dispose](): void;
