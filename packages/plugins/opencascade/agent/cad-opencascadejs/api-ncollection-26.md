# libcascade — NCollection (26)

11 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: BRepTopAdaptor_Tool): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: BRepTopAdaptor_Tool): BRepTopAdaptor_Tool;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: BRepTopAdaptor_Tool): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: BRepTopAdaptor_Tool): BRepTopAdaptor_Tool;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): BRepTopAdaptor_Tool;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): BRepTopAdaptor_Tool;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): BRepTopAdaptor_Tool;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: Bnd_Box): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: Bnd_Box): Bnd_Box;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: Bnd_Box): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: Bnd_Box): Bnd_Box;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): Bnd_Box;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): Bnd_Box;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): Bnd_Box;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: NCollection_List_Message_Msg): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: NCollection_List_Message_Msg): NCollection_List_Message_Msg;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: NCollection_List_Message_Msg): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: NCollection_List_Message_Msg): NCollection_List_Message_Msg;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): NCollection_List_Message_Msg;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): NCollection_List_Message_Msg;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): NCollection_List_Message_Msg;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: NCollection_List_TopoDS_Shape): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: NCollection_List_TopoDS_Shape): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: NCollection_List_double): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: NCollection_List_double): NCollection_List_double;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: NCollection_List_double): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: NCollection_List_double): NCollection_List_double;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): NCollection_List_double;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): NCollection_List_double;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): NCollection_List_double;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: RWMesh_NodeAttributes): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: RWMesh_NodeAttributes): RWMesh_NodeAttributes;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: RWMesh_NodeAttributes): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: RWMesh_NodeAttributes): RWMesh_NodeAttributes;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): RWMesh_NodeAttributes;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): RWMesh_NodeAttributes;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): RWMesh_NodeAttributes;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: TDF_Label): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: TDF_Label): TDF_Label;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: TDF_Label): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: TDF_Label): TDF_Label;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): TDF_Label;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): TDF_Label;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): TDF_Label;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: TopoDS_Shape): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: TopoDS_Shape): TopoDS_Shape;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: TopoDS_Shape): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: TopoDS_Shape): TopoDS_Shape;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): TopoDS_Shape;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): TopoDS_Shape;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): TopoDS_Shape;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: number): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: number): number;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: number): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: number): number;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): number;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): number;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: gp_XYZ): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: gp_XYZ): gp_XYZ;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: gp_XYZ): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: gp_XYZ): gp_XYZ;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): gp_XYZ;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): gp_XYZ;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): gp_XYZ;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: unknown): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: unknown): unknown;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: unknown): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: unknown): unknown;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): unknown;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): unknown;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): unknown;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
