# libcascade — NCollection (27)

12 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: TopoDS_Shape, theItem: Standard_Transient): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TopoDS_Shape, theItem: Standard_Transient): Standard_Transient;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TopoDS_Shape, theItem: Standard_Transient): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TopoDS_Shape, theItem: Standard_Transient): Standard_Transient;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TopoDS_Shape): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TopoDS_Shape): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TopoDS_Shape): Standard_Transient;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TopoDS_Shape): Standard_Transient;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TopoDS_Shape): Standard_Transient;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_gp_Pnt_handle_Standard_Transient: declare class NCollection_DataMap_gp_Pnt_handle_Standard_Transient extends NCollection_BaseMap

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
Bind(theKey: gp_Pnt, theItem: Standard_Transient): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: gp_Pnt, theItem: Standard_Transient): Standard_Transient;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: gp_Pnt, theItem: Standard_Transient): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: gp_Pnt, theItem: Standard_Transient): Standard_Transient;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: gp_Pnt): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: gp_Pnt): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: gp_Pnt): Standard_Transient;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: gp_Pnt): Standard_Transient;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: gp_Pnt): Standard_Transient;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg: declare class NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg extends NCollection_BaseMap

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
Bind(theKey: Standard_Transient, theItem: NCollection_List_Message_Msg): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: Standard_Transient, theItem: NCollection_List_Message_Msg): NCollection_List_Message_Msg;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: Standard_Transient, theItem: NCollection_List_Message_Msg): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: Standard_Transient, theItem: NCollection_List_Message_Msg): NCollection_List_Message_Msg;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: Standard_Transient): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: Standard_Transient): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: Standard_Transient): NCollection_List_Message_Msg;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: Standard_Transient): NCollection_List_Message_Msg;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: Standard_Transient): NCollection_List_Message_Msg;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_handle_Standard_Transient_handle_Standard_Transient: declare class NCollection_DataMap_handle_Standard_Transient_handle_Standard_Transient extends NCollection_BaseMap

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
Bind(theKey: Standard_Transient, theItem: Standard_Transient): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: Standard_Transient, theItem: Standard_Transient): Standard_Transient;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: Standard_Transient, theItem: Standard_Transient): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: Standard_Transient, theItem: Standard_Transient): Standard_Transient;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: Standard_Transient): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: Standard_Transient): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: Standard_Transient): Standard_Transient;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: Standard_Transient): Standard_Transient;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: Standard_Transient): Standard_Transient;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_handle_StepRepr_RepresentationItem_TopoDS_Shape: declare class NCollection_DataMap_handle_StepRepr_RepresentationItem_TopoDS_Shape extends NCollection_BaseMap

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
Bind(theKey: StepRepr_RepresentationItem, theItem: TopoDS_Shape): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: StepRepr_RepresentationItem, theItem: TopoDS_Shape): TopoDS_Shape;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: StepRepr_RepresentationItem, theItem: TopoDS_Shape): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: StepRepr_RepresentationItem, theItem: TopoDS_Shape): TopoDS_Shape;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: StepRepr_RepresentationItem): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: StepRepr_RepresentationItem): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: StepRepr_RepresentationItem): TopoDS_Shape;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: StepRepr_RepresentationItem): TopoDS_Shape;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: StepRepr_RepresentationItem): TopoDS_Shape;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_handle_StepShape_TopologicalRepresentationItem_TopoDS_Shape: declare class NCollection_DataMap_handle_StepShape_TopologicalRepresentationItem_TopoDS_Shape extends NCollection_BaseMap

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
Bind(theKey: StepShape_TopologicalRepresentationItem, theItem: TopoDS_Shape): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: StepShape_TopologicalRepresentationItem, theItem: TopoDS_Shape): TopoDS_Shape;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: StepShape_TopologicalRepresentationItem, theItem: TopoDS_Shape): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: StepShape_TopologicalRepresentationItem, theItem: TopoDS_Shape): TopoDS_Shape;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: StepShape_TopologicalRepresentationItem): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: StepShape_TopologicalRepresentationItem): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: StepShape_TopologicalRepresentationItem): TopoDS_Shape;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: StepShape_TopologicalRepresentationItem): TopoDS_Shape;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: StepShape_TopologicalRepresentationItem): TopoDS_Shape;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_handle_TDF_Attribute_handle_TDF_Attribute: declare class NCollection_DataMap_handle_TDF_Attribute_handle_TDF_Attribute extends NCollection_BaseMap

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
Bind(theKey: TDF_Attribute, theItem: TDF_Attribute): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: TDF_Attribute, theItem: TDF_Attribute): TDF_Attribute;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: TDF_Attribute, theItem: TDF_Attribute): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: TDF_Attribute, theItem: TDF_Attribute): TDF_Attribute;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: TDF_Attribute): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: TDF_Attribute): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: TDF_Attribute): TDF_Attribute;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: TDF_Attribute): TDF_Attribute;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: TDF_Attribute): TDF_Attribute;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_handle_XCAFDimTolObjects_GeomToleranceObject_handle_XCAFDimTolObjects_DatumObject: declare class NCollection_DataMap_handle_XCAFDimTolObjects_GeomToleranceObject_handle_XCAFDimTolObjects_DatumObject extends NCollection_BaseMap

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
Bind(theKey: XCAFDimTolObjects_GeomToleranceObject, theItem: XCAFDimTolObjects_DatumObject): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: XCAFDimTolObjects_GeomToleranceObject, theItem: XCAFDimTolObjects_DatumObject): XCAFDimTolObjects_DatumObject;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: XCAFDimTolObjects_GeomToleranceObject, theItem: XCAFDimTolObjects_DatumObject): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: XCAFDimTolObjects_GeomToleranceObject, theItem: XCAFDimTolObjects_DatumObject): XCAFDimTolObjects_DatumObject;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: XCAFDimTolObjects_GeomToleranceObject): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: XCAFDimTolObjects_GeomToleranceObject): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: XCAFDimTolObjects_GeomToleranceObject): XCAFDimTolObjects_DatumObject;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: XCAFDimTolObjects_GeomToleranceObject): XCAFDimTolObjects_DatumObject;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: XCAFDimTolObjects_GeomToleranceObject): XCAFDimTolObjects_DatumObject;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_handle_XCAFDoc_VisMaterial_handle_XCAFDoc_VisMaterial: declare class NCollection_DataMap_handle_XCAFDoc_VisMaterial_handle_XCAFDoc_VisMaterial extends NCollection_BaseMap

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
Bind(theKey: XCAFDoc_VisMaterial, theItem: XCAFDoc_VisMaterial): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: XCAFDoc_VisMaterial, theItem: XCAFDoc_VisMaterial): XCAFDoc_VisMaterial;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: XCAFDoc_VisMaterial, theItem: XCAFDoc_VisMaterial): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: XCAFDoc_VisMaterial, theItem: XCAFDoc_VisMaterial): XCAFDoc_VisMaterial;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: XCAFDoc_VisMaterial): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: XCAFDoc_VisMaterial): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: XCAFDoc_VisMaterial): XCAFDoc_VisMaterial;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: XCAFDoc_VisMaterial): XCAFDoc_VisMaterial;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: XCAFDoc_VisMaterial): XCAFDoc_VisMaterial;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_int_NCollection_List_TopoDS_Shape: declare class NCollection_DataMap_int_NCollection_List_TopoDS_Shape extends NCollection_BaseMap

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
Bind(theKey: number, theItem: NCollection_List_TopoDS_Shape): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: number, theItem: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: number, theItem: NCollection_List_TopoDS_Shape): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: number, theItem: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: number): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: number): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: number): NCollection_List_TopoDS_Shape;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: number): NCollection_List_TopoDS_Shape;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: number): NCollection_List_TopoDS_Shape;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_int_NCollection_PackedMap_int_NCollection_DefaultHasher_int: declare class NCollection_DataMap_int_NCollection_PackedMap_int_NCollection_DefaultHasher_int extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_DataMap_int_NCollection_PackedMap_int_NCollection_DefaultHasher_int): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assignment
Assign(theOther: NCollection_DataMap_int_NCollection_PackedMap_int_NCollection_DefaultHasher_int): NCollection_DataMap_int_NCollection_PackedMap_int_NCollection_DefaultHasher_int;

// ReSize
ReSize(N: number): void;

// Bind binds Item to Key in map
Bind(theKey: number, theItem: TColStd_PackedMapOfInteger): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: number, theItem: TColStd_PackedMapOfInteger): TColStd_PackedMapOfInteger;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: number, theItem: TColStd_PackedMapOfInteger): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: number, theItem: TColStd_PackedMapOfInteger): TColStd_PackedMapOfInteger;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: number): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: number): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: number): TColStd_PackedMapOfInteger;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: number): TColStd_PackedMapOfInteger;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: number): TColStd_PackedMapOfInteger;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_int_TopoDS_Shape: declare class NCollection_DataMap_int_TopoDS_Shape extends NCollection_BaseMap

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
Bind(theKey: number, theItem: TopoDS_Shape): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: number, theItem: TopoDS_Shape): TopoDS_Shape;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: number, theItem: TopoDS_Shape): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: number, theItem: TopoDS_Shape): TopoDS_Shape;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: number): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: number): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: number): TopoDS_Shape;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: number): TopoDS_Shape;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: number): TopoDS_Shape;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
