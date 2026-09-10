# libcascade — NCollection (25)

12 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_DataMap_TCollection_AsciiString_int: declare class NCollection_DataMap_TCollection_AsciiString_int extends NCollection_BaseMap

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
Bind(theKey: TCollection_AsciiString, theItem: number): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_AsciiString, theItem: number): number;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_AsciiString, theItem: number): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_AsciiString, theItem: number): number;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_AsciiString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_AsciiString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_AsciiString): number;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_AsciiString): number;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_AsciiString): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString: declare class NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString extends NCollection_BaseMap

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
Bind(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): TCollection_ExtendedString;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): TCollection_ExtendedString;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_ExtendedString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_ExtendedString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_ExtendedString): TCollection_ExtendedString;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_ExtendedString): TCollection_ExtendedString;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_ExtendedString): TCollection_ExtendedString;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_ExtendedString_double: declare class NCollection_DataMap_TCollection_ExtendedString_double extends NCollection_BaseMap

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
Bind(theKey: TCollection_ExtendedString, theItem: number): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_ExtendedString, theItem: number): number;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_ExtendedString, theItem: number): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_ExtendedString, theItem: number): number;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_ExtendedString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_ExtendedString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_ExtendedString): number;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_ExtendedString): number;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_ExtendedString): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData: declare class NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData extends NCollection_BaseMap

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
Bind(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): CDM_MetaData;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): CDM_MetaData;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_ExtendedString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_ExtendedString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_ExtendedString): CDM_MetaData;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_ExtendedString): CDM_MetaData;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_ExtendedString): CDM_MetaData;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double: declare class NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double extends NCollection_BaseMap

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
Bind(theKey: TCollection_ExtendedString, theItem: unknown): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_ExtendedString, theItem: unknown): unknown;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_ExtendedString, theItem: unknown): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_ExtendedString, theItem: unknown): unknown;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_ExtendedString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_ExtendedString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_ExtendedString): unknown;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_ExtendedString): unknown;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_ExtendedString): unknown;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int: declare class NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int extends NCollection_BaseMap

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
Bind(theKey: TCollection_ExtendedString, theItem: unknown): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_ExtendedString, theItem: unknown): unknown;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_ExtendedString, theItem: unknown): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_ExtendedString, theItem: unknown): unknown;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_ExtendedString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_ExtendedString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_ExtendedString): unknown;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_ExtendedString): unknown;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_ExtendedString): unknown;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_ExtendedString_int: declare class NCollection_DataMap_TCollection_ExtendedString_int extends NCollection_BaseMap

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
Bind(theKey: TCollection_ExtendedString, theItem: number): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_ExtendedString, theItem: number): number;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_ExtendedString, theItem: number): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_ExtendedString, theItem: number): number;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_ExtendedString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_ExtendedString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_ExtendedString): number;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_ExtendedString): number;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_ExtendedString): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TCollection_ExtendedString_uint8_t: declare class NCollection_DataMap_TCollection_ExtendedString_uint8_t extends NCollection_BaseMap

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
Bind(theKey: TCollection_ExtendedString, theItem: number): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TCollection_ExtendedString, theItem: number): number;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TCollection_ExtendedString, theItem: number): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TCollection_ExtendedString, theItem: number): number;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TCollection_ExtendedString): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TCollection_ExtendedString): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TCollection_ExtendedString): number;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TCollection_ExtendedString): number;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TCollection_ExtendedString): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TDF_Label_TDF_Label: declare class NCollection_DataMap_TDF_Label_TDF_Label extends NCollection_BaseMap

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
Bind(theKey: TDF_Label, theItem: TDF_Label): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TDF_Label, theItem: TDF_Label): TDF_Label;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TDF_Label, theItem: TDF_Label): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TDF_Label, theItem: TDF_Label): TDF_Label;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TDF_Label): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TDF_Label): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TDF_Label): TDF_Label;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TDF_Label): TDF_Label;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TDF_Label): TDF_Label;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TDF_Label_int: declare class NCollection_DataMap_TDF_Label_int extends NCollection_BaseMap

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
Bind(theKey: TDF_Label, theItem: number): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TDF_Label, theItem: number): number;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TDF_Label, theItem: number): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TDF_Label, theItem: number): number;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TDF_Label): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TDF_Label): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TDF_Label): number;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TDF_Label): number;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TDF_Label): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: BRepGraph_NodeId): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: BRepGraph_NodeId): BRepGraph_NodeId;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: BRepGraph_NodeId): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: BRepGraph_NodeId): BRepGraph_NodeId;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): BRepGraph_NodeId;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): BRepGraph_NodeId;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): BRepGraph_NodeId;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: BRepOffset_Offset): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: BRepOffset_Offset): BRepOffset_Offset;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: BRepOffset_Offset): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: BRepOffset_Offset): BRepOffset_Offset;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): BRepOffset_Offset;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): BRepOffset_Offset;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): BRepOffset_Offset;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
