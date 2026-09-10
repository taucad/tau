# libcascade — NCollection (36)

10 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_IndexedDataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher: declare class NCollection_IndexedDataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_IndexedDataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assignment
Assign(theOther: NCollection_IndexedDataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher): NCollection_IndexedDataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Returns the Index of already bound Key or appends new Key with specified Item value
Add(theKey1: TopoDS_Shape, theItem: number): number;
// theKey1: Key to search (and to bind, if it was not bound already)
// theItem: Item value to set for newly bound Key

// TryBound binds Item to Key only if Key is not yet bound
TryBound(theKey1: TopoDS_Shape, theItem: number): number;
// theKey1: key to add
// theItem: item to bind if Key is not yet bound

// TryBind binds Item to Key only if Key is not yet bound
TryBind(theKey1: TopoDS_Shape, theItem: number): boolean;
// theKey1: key to add
// theItem: item to bind if Key is not yet bound

// Bind binds Item to Key in map
Bind(theKey1: TopoDS_Shape, theItem: number): boolean;
// theKey1: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey1: TopoDS_Shape, theItem: number): number;
// theKey1: key to add/update
// theItem: new item

// Contains
Contains(theKey1: TopoDS_Shape): boolean;

// Substitute
Substitute(theIndex: number, theKey1: TopoDS_Shape, theItem: number): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: TopoDS_Shape): void;

// FindKey
FindKey(theIndex: number): TopoDS_Shape;

// FindFromIndex
FindFromIndex(theIndex: number): number;

// ChangeFromIndex
ChangeFromIndex(theIndex: number): number;

// FindIndex
FindIndex(theKey1: TopoDS_Shape): number;

// ChangeFromKey
ChangeFromKey(theKey1: TopoDS_Shape): number;

// Seek returns pointer to Item by Key
Seek(theKey1: TopoDS_Shape): number;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey1: TopoDS_Shape): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_IndexedDataMap_handle_BOPDS_PaveBlock_NCollection_List_handle_BOPDS_PaveBlock: declare class NCollection_IndexedDataMap_handle_BOPDS_PaveBlock_NCollection_List_handle_BOPDS_PaveBlock extends NCollection_BaseMap

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

// Returns the Index of already bound Key or appends new Key with specified Item value
Add(theKey1: BOPDS_PaveBlock, theItem: NCollection_List_handle_BOPDS_PaveBlock): number;
// theKey1: Key to search (and to bind, if it was not bound already)
// theItem: Item value to set for newly bound Key

// TryBound binds Item to Key only if Key is not yet bound
TryBound(theKey1: BOPDS_PaveBlock, theItem: NCollection_List_handle_BOPDS_PaveBlock): NCollection_List_handle_BOPDS_PaveBlock;
// theKey1: key to add
// theItem: item to bind if Key is not yet bound

// TryBind binds Item to Key only if Key is not yet bound
TryBind(theKey1: BOPDS_PaveBlock, theItem: NCollection_List_handle_BOPDS_PaveBlock): boolean;
// theKey1: key to add
// theItem: item to bind if Key is not yet bound

// Bind binds Item to Key in map
Bind(theKey1: BOPDS_PaveBlock, theItem: NCollection_List_handle_BOPDS_PaveBlock): boolean;
// theKey1: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey1: BOPDS_PaveBlock, theItem: NCollection_List_handle_BOPDS_PaveBlock): NCollection_List_handle_BOPDS_PaveBlock;
// theKey1: key to add/update
// theItem: new item

// Contains
Contains(theKey1: BOPDS_PaveBlock): boolean;

// Substitute
Substitute(theIndex: number, theKey1: BOPDS_PaveBlock, theItem: NCollection_List_handle_BOPDS_PaveBlock): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: BOPDS_PaveBlock): void;

// FindKey
FindKey(theIndex: number): BOPDS_PaveBlock;

// FindFromIndex
FindFromIndex(theIndex: number): NCollection_List_handle_BOPDS_PaveBlock;

// ChangeFromIndex
ChangeFromIndex(theIndex: number): NCollection_List_handle_BOPDS_PaveBlock;

// FindIndex
FindIndex(theKey1: BOPDS_PaveBlock): number;

// ChangeFromKey
ChangeFromKey(theKey1: BOPDS_PaveBlock): NCollection_List_handle_BOPDS_PaveBlock;

// Seek returns pointer to Item by Key
Seek(theKey1: BOPDS_PaveBlock): NCollection_List_handle_BOPDS_PaveBlock;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey1: BOPDS_PaveBlock): NCollection_List_handle_BOPDS_PaveBlock;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_IndexedDataMap_handle_BOPDS_PaveBlock_NCollection_List_int: declare class NCollection_IndexedDataMap_handle_BOPDS_PaveBlock_NCollection_List_int extends NCollection_BaseMap

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

// Returns the Index of already bound Key or appends new Key with specified Item value
Add(theKey1: BOPDS_PaveBlock, theItem: NCollection_List_int): number;
// theKey1: Key to search (and to bind, if it was not bound already)
// theItem: Item value to set for newly bound Key

// TryBound binds Item to Key only if Key is not yet bound
TryBound(theKey1: BOPDS_PaveBlock, theItem: NCollection_List_int): NCollection_List_int;
// theKey1: key to add
// theItem: item to bind if Key is not yet bound

// TryBind binds Item to Key only if Key is not yet bound
TryBind(theKey1: BOPDS_PaveBlock, theItem: NCollection_List_int): boolean;
// theKey1: key to add
// theItem: item to bind if Key is not yet bound

// Bind binds Item to Key in map
Bind(theKey1: BOPDS_PaveBlock, theItem: NCollection_List_int): boolean;
// theKey1: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey1: BOPDS_PaveBlock, theItem: NCollection_List_int): NCollection_List_int;
// theKey1: key to add/update
// theItem: new item

// Contains
Contains(theKey1: BOPDS_PaveBlock): boolean;

// Substitute
Substitute(theIndex: number, theKey1: BOPDS_PaveBlock, theItem: NCollection_List_int): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: BOPDS_PaveBlock): void;

// FindKey
FindKey(theIndex: number): BOPDS_PaveBlock;

// FindFromIndex
FindFromIndex(theIndex: number): NCollection_List_int;

// ChangeFromIndex
ChangeFromIndex(theIndex: number): NCollection_List_int;

// FindIndex
FindIndex(theKey1: BOPDS_PaveBlock): number;

// ChangeFromKey
ChangeFromKey(theKey1: BOPDS_PaveBlock): NCollection_List_int;

// Seek returns pointer to Item by Key
Seek(theKey1: BOPDS_PaveBlock): NCollection_List_int;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey1: BOPDS_PaveBlock): NCollection_List_int;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient: declare class NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient extends NCollection_BaseMap

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

// Returns the Index of already bound Key or appends new Key with specified Item value
Add(theKey1: Standard_Transient, theItem: Standard_Transient): number;
// theKey1: Key to search (and to bind, if it was not bound already)
// theItem: Item value to set for newly bound Key

// TryBound binds Item to Key only if Key is not yet bound
TryBound(theKey1: Standard_Transient, theItem: Standard_Transient): Standard_Transient;
// theKey1: key to add
// theItem: item to bind if Key is not yet bound

// TryBind binds Item to Key only if Key is not yet bound
TryBind(theKey1: Standard_Transient, theItem: Standard_Transient): boolean;
// theKey1: key to add
// theItem: item to bind if Key is not yet bound

// Bind binds Item to Key in map
Bind(theKey1: Standard_Transient, theItem: Standard_Transient): boolean;
// theKey1: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey1: Standard_Transient, theItem: Standard_Transient): Standard_Transient;
// theKey1: key to add/update
// theItem: new item

// Contains
Contains(theKey1: Standard_Transient): boolean;

// Substitute
Substitute(theIndex: number, theKey1: Standard_Transient, theItem: Standard_Transient): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: Standard_Transient): void;

// FindKey
FindKey(theIndex: number): Standard_Transient;

// FindFromIndex
FindFromIndex(theIndex: number): Standard_Transient;

// ChangeFromIndex
ChangeFromIndex(theIndex: number): Standard_Transient;

// FindIndex
FindIndex(theKey1: Standard_Transient): number;

// ChangeFromKey
ChangeFromKey(theKey1: Standard_Transient): Standard_Transient;

// Seek returns pointer to Item by Key
Seek(theKey1: Standard_Transient): Standard_Transient;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey1: Standard_Transient): Standard_Transient;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_IndexedMap_Message_MetricType: declare class NCollection_IndexedMap_Message_MetricType extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assign
Assign(theOther: unknown): unknown;

// ReSize
ReSize(theExtent: number): void;

// Add adds a new key to the map
Add(theKey1: Message_MetricType): number;
// theKey1: key to add

// Added
Added(theKey1: Message_MetricType): Message_MetricType;
// theKey1: key to add

// Contains
Contains(theKey1: Message_MetricType): boolean;

// Substitute
Substitute(theIndex: number, theKey1: Message_MetricType): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: Message_MetricType): boolean;

// FindKey
FindKey(theIndex: number): Message_MetricType;

// FindIndex
FindIndex(theKey1: Message_MetricType): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_IndexedMap_TCollection_AsciiString: declare class NCollection_IndexedMap_TCollection_AsciiString extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assign
Assign(theOther: unknown): unknown;

// ReSize
ReSize(theExtent: number): void;

// Add adds a new key to the map
Add(theKey1: TCollection_AsciiString): number;
// theKey1: key to add

// Added
Added(theKey1: TCollection_AsciiString): TCollection_AsciiString;
// theKey1: key to add

// Contains
Contains(theKey1: TCollection_AsciiString): boolean;

// Substitute
Substitute(theIndex: number, theKey1: TCollection_AsciiString): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: TCollection_AsciiString): boolean;

// FindKey
FindKey(theIndex: number): TCollection_AsciiString;

// FindIndex
FindIndex(theKey1: TCollection_AsciiString): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_IndexedMap_TDF_Label: declare class NCollection_IndexedMap_TDF_Label extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assign
Assign(theOther: unknown): unknown;

// ReSize
ReSize(theExtent: number): void;

// Add adds a new key to the map
Add(theKey1: TDF_Label): number;
// theKey1: key to add

// Added
Added(theKey1: TDF_Label): TDF_Label;
// theKey1: key to add

// Contains
Contains(theKey1: TDF_Label): boolean;

// Substitute
Substitute(theIndex: number, theKey1: TDF_Label): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: TDF_Label): boolean;

// FindKey
FindKey(theIndex: number): TDF_Label;

// FindIndex
FindIndex(theKey1: TDF_Label): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher: declare class NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assign
Assign(theOther: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

// ReSize
ReSize(theExtent: number): void;

// Add adds a new key to the map
Add(theKey1: TopoDS_Shape): number;
// theKey1: key to add

// Added
Added(theKey1: TopoDS_Shape): TopoDS_Shape;
// theKey1: key to add

// Contains
Contains(theKey1: TopoDS_Shape): boolean;

// Substitute
Substitute(theIndex: number, theKey1: TopoDS_Shape): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: TopoDS_Shape): boolean;

// FindKey
FindKey(theIndex: number): TopoDS_Shape;

// FindIndex
FindIndex(theKey1: TopoDS_Shape): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_IndexedMap_handle_BOPDS_PaveBlock: declare class NCollection_IndexedMap_handle_BOPDS_PaveBlock extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assign
Assign(theOther: unknown): unknown;

// ReSize
ReSize(theExtent: number): void;

// Add adds a new key to the map
Add(theKey1: BOPDS_PaveBlock): number;
// theKey1: key to add

// Added
Added(theKey1: BOPDS_PaveBlock): BOPDS_PaveBlock;
// theKey1: key to add

// Contains
Contains(theKey1: BOPDS_PaveBlock): boolean;

// Substitute
Substitute(theIndex: number, theKey1: BOPDS_PaveBlock): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: BOPDS_PaveBlock): boolean;

// FindKey
FindKey(theIndex: number): BOPDS_PaveBlock;

// FindIndex
FindIndex(theKey1: BOPDS_PaveBlock): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_IndexedMap_handle_Standard_Transient: declare class NCollection_IndexedMap_handle_Standard_Transient extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assign
Assign(theOther: unknown): unknown;

// ReSize
ReSize(theExtent: number): void;

// Add adds a new key to the map
Add(theKey1: Standard_Transient): number;
// theKey1: key to add

// Added
Added(theKey1: Standard_Transient): Standard_Transient;
// theKey1: key to add

// Contains
Contains(theKey1: Standard_Transient): boolean;

// Substitute
Substitute(theIndex: number, theKey1: Standard_Transient): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: Standard_Transient): boolean;

// FindKey
FindKey(theIndex: number): Standard_Transient;

// FindIndex
FindIndex(theKey1: Standard_Transient): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
