# libcascade — NCollection (40)

6 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher: declare class NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): TopTools_ShapeMapHasher;

// Assign
Assign(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher;

// ReSize
ReSize(N: number): void;

// Add
Add(theKey: TopoDS_Shape): boolean;

// Added
Added(theKey: TopoDS_Shape): TopoDS_Shape;

// Contains
// DEPRECATED
Contains(theKey: TopoDS_Shape): boolean;
Contains(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;
Contains(theKey: TopoDS_Shape): boolean;
Contains(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// Remove
Remove(K: TopoDS_Shape): boolean;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Checks if two maps contain exactly the same keys
// DEPRECATED
IsEqual(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// Sets this Map to be the result of union (aka addition, fuse, merge, boolean OR) operation between two given Maps The new Map contains the values that are contained either in the first map or in the second map or in both
// DEPRECATED
Union(theLeft: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theRight: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// Apply to this Map the boolean operation union (aka addition, fuse, merge, boolean OR) with another (given) Map
// DEPRECATED
Unite(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// Returns true if this and theMap have common elements
// DEPRECATED
HasIntersection(theMap: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// Sets this Map to be the result of intersection (aka multiplication, common, boolean AND) operation between two given Maps
// DEPRECATED
Intersection(theLeft: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theRight: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// Apply to this Map the intersection operation (aka multiplication, common, boolean AND) with another (given) Map
// DEPRECATED
Intersect(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// Sets this Map to be the result of subtraction (aka set-theoretic difference, relative complement, exclude, cut, boolean NOT) operation between two given Maps
// DEPRECATED
Subtraction(theLeft: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theRight: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// Apply to this Map the subtraction (aka set-theoretic difference, relative complement, exclude, cut, boolean NOT) operation with another (given) Map
// DEPRECATED
Subtract(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// Sets this Map to be the result of symmetric difference (aka exclusive disjunction, boolean XOR) operation between two given Maps
// DEPRECATED
Difference(theLeft: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theRight: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// Apply to this Map the symmetric difference (aka exclusive disjunction, boolean XOR) operation with another (given) Map
// DEPRECATED
Differ(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Map_handle_BOPDS_PaveBlock: declare class NCollection_Map_handle_BOPDS_PaveBlock extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assign
Assign(theOther: unknown): unknown;

// ReSize
ReSize(N: number): void;

// Add
Add(theKey: BOPDS_PaveBlock): boolean;

// Added
Added(theKey: BOPDS_PaveBlock): BOPDS_PaveBlock;

// Contains
// DEPRECATED
Contains(theKey: BOPDS_PaveBlock): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: BOPDS_PaveBlock): boolean;
Contains(theOther: unknown): boolean;

// Remove
Remove(K: BOPDS_PaveBlock): boolean;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Checks if two maps contain exactly the same keys
// DEPRECATED
IsEqual(theOther: unknown): boolean;

// Sets this Map to be the result of union (aka addition, fuse, merge, boolean OR) operation between two given Maps The new Map contains the values that are contained either in the first map or in the second map or in both
// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the boolean operation union (aka addition, fuse, merge, boolean OR) with another (given) Map
// DEPRECATED
Unite(theOther: unknown): boolean;

// Returns true if this and theMap have common elements
// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// Sets this Map to be the result of intersection (aka multiplication, common, boolean AND) operation between two given Maps
// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the intersection operation (aka multiplication, common, boolean AND) with another (given) Map
// DEPRECATED
Intersect(theOther: unknown): boolean;

// Sets this Map to be the result of subtraction (aka set-theoretic difference, relative complement, exclude, cut, boolean NOT) operation between two given Maps
// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the subtraction (aka set-theoretic difference, relative complement, exclude, cut, boolean NOT) operation with another (given) Map
// DEPRECATED
Subtract(theOther: unknown): boolean;

// Sets this Map to be the result of symmetric difference (aka exclusive disjunction, boolean XOR) operation between two given Maps
// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the symmetric difference (aka exclusive disjunction, boolean XOR) operation with another (given) Map
// DEPRECATED
Differ(theOther: unknown): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Map_handle_TDF_Attribute: declare class NCollection_Map_handle_TDF_Attribute extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assign
Assign(theOther: unknown): unknown;

// ReSize
ReSize(N: number): void;

// Add
Add(theKey: TDF_Attribute): boolean;

// Added
Added(theKey: TDF_Attribute): TDF_Attribute;

// Contains
// DEPRECATED
Contains(theKey: TDF_Attribute): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: TDF_Attribute): boolean;
Contains(theOther: unknown): boolean;

// Remove
Remove(K: TDF_Attribute): boolean;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Checks if two maps contain exactly the same keys
// DEPRECATED
IsEqual(theOther: unknown): boolean;

// Sets this Map to be the result of union (aka addition, fuse, merge, boolean OR) operation between two given Maps The new Map contains the values that are contained either in the first map or in the second map or in both
// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the boolean operation union (aka addition, fuse, merge, boolean OR) with another (given) Map
// DEPRECATED
Unite(theOther: unknown): boolean;

// Returns true if this and theMap have common elements
// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// Sets this Map to be the result of intersection (aka multiplication, common, boolean AND) operation between two given Maps
// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the intersection operation (aka multiplication, common, boolean AND) with another (given) Map
// DEPRECATED
Intersect(theOther: unknown): boolean;

// Sets this Map to be the result of subtraction (aka set-theoretic difference, relative complement, exclude, cut, boolean NOT) operation between two given Maps
// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the subtraction (aka set-theoretic difference, relative complement, exclude, cut, boolean NOT) operation with another (given) Map
// DEPRECATED
Subtract(theOther: unknown): boolean;

// Sets this Map to be the result of symmetric difference (aka exclusive disjunction, boolean XOR) operation between two given Maps
// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the symmetric difference (aka exclusive disjunction, boolean XOR) operation with another (given) Map
// DEPRECATED
Differ(theOther: unknown): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Map_handle_TNaming_NamedShape: declare class NCollection_Map_handle_TNaming_NamedShape extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assign
Assign(theOther: unknown): unknown;

// ReSize
ReSize(N: number): void;

// Add
Add(theKey: TNaming_NamedShape): boolean;

// Added
Added(theKey: TNaming_NamedShape): TNaming_NamedShape;

// Contains
// DEPRECATED
Contains(theKey: TNaming_NamedShape): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: TNaming_NamedShape): boolean;
Contains(theOther: unknown): boolean;

// Remove
Remove(K: TNaming_NamedShape): boolean;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Checks if two maps contain exactly the same keys
// DEPRECATED
IsEqual(theOther: unknown): boolean;

// Sets this Map to be the result of union (aka addition, fuse, merge, boolean OR) operation between two given Maps The new Map contains the values that are contained either in the first map or in the second map or in both
// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the boolean operation union (aka addition, fuse, merge, boolean OR) with another (given) Map
// DEPRECATED
Unite(theOther: unknown): boolean;

// Returns true if this and theMap have common elements
// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// Sets this Map to be the result of intersection (aka multiplication, common, boolean AND) operation between two given Maps
// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the intersection operation (aka multiplication, common, boolean AND) with another (given) Map
// DEPRECATED
Intersect(theOther: unknown): boolean;

// Sets this Map to be the result of subtraction (aka set-theoretic difference, relative complement, exclude, cut, boolean NOT) operation between two given Maps
// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the subtraction (aka set-theoretic difference, relative complement, exclude, cut, boolean NOT) operation with another (given) Map
// DEPRECATED
Subtract(theOther: unknown): boolean;

// Sets this Map to be the result of symmetric difference (aka exclusive disjunction, boolean XOR) operation between two given Maps
// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the symmetric difference (aka exclusive disjunction, boolean XOR) operation with another (given) Map
// DEPRECATED
Differ(theOther: unknown): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_Map_int: declare class NCollection_Map_int extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Returns const reference to the hasher
GetHasher(): unknown;

// Assign
Assign(theOther: unknown): unknown;

// ReSize
ReSize(N: number): void;

// Add
Add(theKey: number): boolean;

// Added
Added(theKey: number): number;

// Contains
// DEPRECATED
Contains(theKey: number): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: number): boolean;
Contains(theOther: unknown): boolean;

// Remove
Remove(K: number): boolean;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Checks if two maps contain exactly the same keys
// DEPRECATED
IsEqual(theOther: unknown): boolean;

// Sets this Map to be the result of union (aka addition, fuse, merge, boolean OR) operation between two given Maps The new Map contains the values that are contained either in the first map or in the second map or in both
// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the boolean operation union (aka addition, fuse, merge, boolean OR) with another (given) Map
// DEPRECATED
Unite(theOther: unknown): boolean;

// Returns true if this and theMap have common elements
// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// Sets this Map to be the result of intersection (aka multiplication, common, boolean AND) operation between two given Maps
// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the intersection operation (aka multiplication, common, boolean AND) with another (given) Map
// DEPRECATED
Intersect(theOther: unknown): boolean;

// Sets this Map to be the result of subtraction (aka set-theoretic difference, relative complement, exclude, cut, boolean NOT) operation between two given Maps
// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the subtraction (aka set-theoretic difference, relative complement, exclude, cut, boolean NOT) operation with another (given) Map
// DEPRECATED
Subtract(theOther: unknown): boolean;

// Sets this Map to be the result of symmetric difference (aka exclusive disjunction, boolean XOR) operation between two given Maps
// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// Apply to this Map the symmetric difference (aka exclusive disjunction, boolean XOR) operation with another (given) Map
// DEPRECATED
Differ(theOther: unknown): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Optimized Map for integer values of various integral types
NCollection_PackedMap_int: declare class NCollection_PackedMap_int

constructor

// Assignment operator
Assign(theOther: TColStd_PackedMapOfInteger): TColStd_PackedMapOfInteger;

// Resize the map
ReSize(theNbBuckets: number): void;

// Clear the map
Clear(): void;

// Add a key to the map
Add(theKey: number): boolean;
// theKey: the key to add

// Check if the map contains a key
Contains(theKey: number): boolean;
Contains(theOther: TColStd_PackedMapOfInteger): boolean;
Contains(theKey: number): boolean;
Contains(theOther: TColStd_PackedMapOfInteger): boolean;
// theKey: the key to check

// Remove a key from the map
Remove(theKey: number): boolean;
// theKey: the key to remove

// Returns the number of map buckets
NbBuckets(): number;

// Returns map extent (legacy int-returning API)
Extent(): number;

// Returns map extent (legacy int-returning API, synonym of `Extent()`)
Length(): number;

// Returns map extent
Size(): number;

// Returns TRUE if map is empty
IsEmpty(): boolean;

// Query the minimal contained key value
GetMinimalMapped(): number;

// Query the maximal contained key value
GetMaximalMapped(): number;

Union(theLeft: TColStd_PackedMapOfInteger, theRight: TColStd_PackedMapOfInteger): void;

Unite(theOther: TColStd_PackedMapOfInteger): boolean;

Intersection(theLeft: TColStd_PackedMapOfInteger, theRight: TColStd_PackedMapOfInteger): void;

Intersect(theOther: TColStd_PackedMapOfInteger): boolean;

Subtraction(theLeft: TColStd_PackedMapOfInteger, theRight: TColStd_PackedMapOfInteger): void;

Subtract(theOther: TColStd_PackedMapOfInteger): boolean;

Difference(theLeft: TColStd_PackedMapOfInteger, theRight: TColStd_PackedMapOfInteger): void;

Differ(theOther: TColStd_PackedMapOfInteger): boolean;

IsEqual(theOther: TColStd_PackedMapOfInteger): boolean;

IsSubset(theOther: TColStd_PackedMapOfInteger): boolean;

HasIntersection(theOther: TColStd_PackedMapOfInteger): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
