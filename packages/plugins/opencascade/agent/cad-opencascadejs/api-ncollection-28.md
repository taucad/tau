# libcascade — NCollection (28)

17 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_DataMap_int_handle_MAT_BasicElt: declare class NCollection_DataMap_int_handle_MAT_BasicElt extends NCollection_BaseMap

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
Bind(theKey: number, theItem: MAT_BasicElt): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: number, theItem: MAT_BasicElt): MAT_BasicElt;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: number, theItem: MAT_BasicElt): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: number, theItem: MAT_BasicElt): MAT_BasicElt;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: number): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: number): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: number): MAT_BasicElt;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: number): MAT_BasicElt;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: number): MAT_BasicElt;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DataMap_int_int: declare class NCollection_DataMap_int_int extends NCollection_BaseMap

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
Bind(theKey: number, theItem: number): boolean;
// theKey: key to add/update
// theItem: new item

// Bound binds Item to Key in map
Bound(theKey: number, theItem: number): number;
// theKey: key to add/update
// theItem: new item

// TryBind binds Item to Key in map only if Key is not yet bound
TryBind(theKey: number, theItem: number): boolean;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// TryBound binds Item to Key in map only if Key is not yet bound
TryBound(theKey: number, theItem: number): number;
// theKey: key to add
// theItem: item to bind if Key is not yet bound

// IsBound
IsBound(theKey: number): boolean;

// UnBind removes Item Key pair from map
UnBind(theKey: number): boolean;

// Seek returns pointer to Item by Key
Seek(theKey: number): number;

// ChangeSeek returns modifiable pointer to Item by Key
ChangeSeek(theKey: number): number;

// ChangeFind returns modifiable Item by Key
ChangeFind(theKey: number): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_DoubleMap_int_TDF_Label: declare class NCollection_DoubleMap_int_TDF_Label extends NCollection_BaseMap

constructor

// Exchange the content of two maps without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Assignment
Assign(theOther: unknown): unknown;

// ReSize
ReSize(N: number): void;

// Bind binds the pair (Key1, Key2)
Bind(theKey1: number, theKey2: TDF_Label): void;

// TryBind binds the pair (Key1, Key2) only if neither key is already bound
TryBind(theKey1: number, theKey2: TDF_Label): boolean;
// theKey1: first key to bind
// theKey2: second key to bind

// - AreBound
AreBound(theKey1: number, theKey2: TDF_Label): boolean;

// IsBound1
IsBound1(theKey1: number): boolean;

// IsBound2
IsBound2(theKey2: TDF_Label): boolean;

// UnBind1
UnBind1(theKey1: number): boolean;

// UnBind2
UnBind2(theKey2: TDF_Label): boolean;

// Find the Key1 and return pointer to Key2 or NULL if Key1 is not bound
Seek1(theKey1: number): TDF_Label;
// theKey1: Key1 to find

// Find the Key2 and return pointer to Key1 or NULL if not bound
Seek2(theKey2: TDF_Label): number;
// theKey2: Key2 to find

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_Curve: declare class NCollection_DynamicArray_BOPDS_Curve

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_Curve, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_Curve;

Append(theValue: BOPDS_Curve): BOPDS_Curve;

InsertAfter(theIndex: number, theValue: BOPDS_Curve): BOPDS_Curve;

InsertBefore(theIndex: number, theValue: BOPDS_Curve): BOPDS_Curve;

EraseLast(): void;

Appended(): BOPDS_Curve;

Value(theIndex: number): BOPDS_Curve;

First(): BOPDS_Curve;

ChangeFirst(): BOPDS_Curve;

Last(): BOPDS_Curve;

ChangeLast(): BOPDS_Curve;

ChangeValue(theIndex: number): BOPDS_Curve;

SetValue(theIndex: number, theValue: BOPDS_Curve): BOPDS_Curve;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_FaceInfo: declare class NCollection_DynamicArray_BOPDS_FaceInfo

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_FaceInfo, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_FaceInfo;

Append(theValue: BOPDS_FaceInfo): BOPDS_FaceInfo;

InsertAfter(theIndex: number, theValue: BOPDS_FaceInfo): BOPDS_FaceInfo;

InsertBefore(theIndex: number, theValue: BOPDS_FaceInfo): BOPDS_FaceInfo;

EraseLast(): void;

Appended(): BOPDS_FaceInfo;

Value(theIndex: number): BOPDS_FaceInfo;

First(): BOPDS_FaceInfo;

ChangeFirst(): BOPDS_FaceInfo;

Last(): BOPDS_FaceInfo;

ChangeLast(): BOPDS_FaceInfo;

ChangeValue(theIndex: number): BOPDS_FaceInfo;

SetValue(theIndex: number, theValue: BOPDS_FaceInfo): BOPDS_FaceInfo;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_InterfEE: declare class NCollection_DynamicArray_BOPDS_InterfEE

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_InterfEE, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_InterfEE;

Append(theValue: BOPDS_InterfEE): BOPDS_InterfEE;

InsertAfter(theIndex: number, theValue: BOPDS_InterfEE): BOPDS_InterfEE;

InsertBefore(theIndex: number, theValue: BOPDS_InterfEE): BOPDS_InterfEE;

EraseLast(): void;

Appended(): BOPDS_InterfEE;

Value(theIndex: number): BOPDS_InterfEE;

First(): BOPDS_InterfEE;

ChangeFirst(): BOPDS_InterfEE;

Last(): BOPDS_InterfEE;

ChangeLast(): BOPDS_InterfEE;

ChangeValue(theIndex: number): BOPDS_InterfEE;

SetValue(theIndex: number, theValue: BOPDS_InterfEE): BOPDS_InterfEE;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_InterfEF: declare class NCollection_DynamicArray_BOPDS_InterfEF

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_InterfEF, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_InterfEF;

Append(theValue: BOPDS_InterfEF): BOPDS_InterfEF;

InsertAfter(theIndex: number, theValue: BOPDS_InterfEF): BOPDS_InterfEF;

InsertBefore(theIndex: number, theValue: BOPDS_InterfEF): BOPDS_InterfEF;

EraseLast(): void;

Appended(): BOPDS_InterfEF;

Value(theIndex: number): BOPDS_InterfEF;

First(): BOPDS_InterfEF;

ChangeFirst(): BOPDS_InterfEF;

Last(): BOPDS_InterfEF;

ChangeLast(): BOPDS_InterfEF;

ChangeValue(theIndex: number): BOPDS_InterfEF;

SetValue(theIndex: number, theValue: BOPDS_InterfEF): BOPDS_InterfEF;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_InterfEZ: declare class NCollection_DynamicArray_BOPDS_InterfEZ

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_InterfEZ, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_InterfEZ;

Append(theValue: BOPDS_InterfEZ): BOPDS_InterfEZ;

InsertAfter(theIndex: number, theValue: BOPDS_InterfEZ): BOPDS_InterfEZ;

InsertBefore(theIndex: number, theValue: BOPDS_InterfEZ): BOPDS_InterfEZ;

EraseLast(): void;

Appended(): BOPDS_InterfEZ;

Value(theIndex: number): BOPDS_InterfEZ;

First(): BOPDS_InterfEZ;

ChangeFirst(): BOPDS_InterfEZ;

Last(): BOPDS_InterfEZ;

ChangeLast(): BOPDS_InterfEZ;

ChangeValue(theIndex: number): BOPDS_InterfEZ;

SetValue(theIndex: number, theValue: BOPDS_InterfEZ): BOPDS_InterfEZ;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_InterfFF: declare class NCollection_DynamicArray_BOPDS_InterfFF

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_InterfFF, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_InterfFF;

Append(theValue: BOPDS_InterfFF): BOPDS_InterfFF;

InsertAfter(theIndex: number, theValue: BOPDS_InterfFF): BOPDS_InterfFF;

InsertBefore(theIndex: number, theValue: BOPDS_InterfFF): BOPDS_InterfFF;

EraseLast(): void;

Appended(): BOPDS_InterfFF;

Value(theIndex: number): BOPDS_InterfFF;

First(): BOPDS_InterfFF;

ChangeFirst(): BOPDS_InterfFF;

Last(): BOPDS_InterfFF;

ChangeLast(): BOPDS_InterfFF;

ChangeValue(theIndex: number): BOPDS_InterfFF;

SetValue(theIndex: number, theValue: BOPDS_InterfFF): BOPDS_InterfFF;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_InterfFZ: declare class NCollection_DynamicArray_BOPDS_InterfFZ

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_InterfFZ, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_InterfFZ;

Append(theValue: BOPDS_InterfFZ): BOPDS_InterfFZ;

InsertAfter(theIndex: number, theValue: BOPDS_InterfFZ): BOPDS_InterfFZ;

InsertBefore(theIndex: number, theValue: BOPDS_InterfFZ): BOPDS_InterfFZ;

EraseLast(): void;

Appended(): BOPDS_InterfFZ;

Value(theIndex: number): BOPDS_InterfFZ;

First(): BOPDS_InterfFZ;

ChangeFirst(): BOPDS_InterfFZ;

Last(): BOPDS_InterfFZ;

ChangeLast(): BOPDS_InterfFZ;

ChangeValue(theIndex: number): BOPDS_InterfFZ;

SetValue(theIndex: number, theValue: BOPDS_InterfFZ): BOPDS_InterfFZ;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_InterfVE: declare class NCollection_DynamicArray_BOPDS_InterfVE

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_InterfVE, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_InterfVE;

Append(theValue: BOPDS_InterfVE): BOPDS_InterfVE;

InsertAfter(theIndex: number, theValue: BOPDS_InterfVE): BOPDS_InterfVE;

InsertBefore(theIndex: number, theValue: BOPDS_InterfVE): BOPDS_InterfVE;

EraseLast(): void;

Appended(): BOPDS_InterfVE;

Value(theIndex: number): BOPDS_InterfVE;

First(): BOPDS_InterfVE;

ChangeFirst(): BOPDS_InterfVE;

Last(): BOPDS_InterfVE;

ChangeLast(): BOPDS_InterfVE;

ChangeValue(theIndex: number): BOPDS_InterfVE;

SetValue(theIndex: number, theValue: BOPDS_InterfVE): BOPDS_InterfVE;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_InterfVF: declare class NCollection_DynamicArray_BOPDS_InterfVF

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_InterfVF, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_InterfVF;

Append(theValue: BOPDS_InterfVF): BOPDS_InterfVF;

InsertAfter(theIndex: number, theValue: BOPDS_InterfVF): BOPDS_InterfVF;

InsertBefore(theIndex: number, theValue: BOPDS_InterfVF): BOPDS_InterfVF;

EraseLast(): void;

Appended(): BOPDS_InterfVF;

Value(theIndex: number): BOPDS_InterfVF;

First(): BOPDS_InterfVF;

ChangeFirst(): BOPDS_InterfVF;

Last(): BOPDS_InterfVF;

ChangeLast(): BOPDS_InterfVF;

ChangeValue(theIndex: number): BOPDS_InterfVF;

SetValue(theIndex: number, theValue: BOPDS_InterfVF): BOPDS_InterfVF;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_InterfVV: declare class NCollection_DynamicArray_BOPDS_InterfVV

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_InterfVV, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_InterfVV;

Append(theValue: BOPDS_InterfVV): BOPDS_InterfVV;

InsertAfter(theIndex: number, theValue: BOPDS_InterfVV): BOPDS_InterfVV;

InsertBefore(theIndex: number, theValue: BOPDS_InterfVV): BOPDS_InterfVV;

EraseLast(): void;

Appended(): BOPDS_InterfVV;

Value(theIndex: number): BOPDS_InterfVV;

First(): BOPDS_InterfVV;

ChangeFirst(): BOPDS_InterfVV;

Last(): BOPDS_InterfVV;

ChangeLast(): BOPDS_InterfVV;

ChangeValue(theIndex: number): BOPDS_InterfVV;

SetValue(theIndex: number, theValue: BOPDS_InterfVV): BOPDS_InterfVV;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_InterfVZ: declare class NCollection_DynamicArray_BOPDS_InterfVZ

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_InterfVZ, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_InterfVZ;

Append(theValue: BOPDS_InterfVZ): BOPDS_InterfVZ;

InsertAfter(theIndex: number, theValue: BOPDS_InterfVZ): BOPDS_InterfVZ;

InsertBefore(theIndex: number, theValue: BOPDS_InterfVZ): BOPDS_InterfVZ;

EraseLast(): void;

Appended(): BOPDS_InterfVZ;

Value(theIndex: number): BOPDS_InterfVZ;

First(): BOPDS_InterfVZ;

ChangeFirst(): BOPDS_InterfVZ;

Last(): BOPDS_InterfVZ;

ChangeLast(): BOPDS_InterfVZ;

ChangeValue(theIndex: number): BOPDS_InterfVZ;

SetValue(theIndex: number, theValue: BOPDS_InterfVZ): BOPDS_InterfVZ;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_InterfZZ: declare class NCollection_DynamicArray_BOPDS_InterfZZ

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_BOPDS_InterfZZ, theOwnAllocator: boolean): NCollection_DynamicArray_BOPDS_InterfZZ;

Append(theValue: BOPDS_InterfZZ): BOPDS_InterfZZ;

InsertAfter(theIndex: number, theValue: BOPDS_InterfZZ): BOPDS_InterfZZ;

InsertBefore(theIndex: number, theValue: BOPDS_InterfZZ): BOPDS_InterfZZ;

EraseLast(): void;

Appended(): BOPDS_InterfZZ;

Value(theIndex: number): BOPDS_InterfZZ;

First(): BOPDS_InterfZZ;

ChangeFirst(): BOPDS_InterfZZ;

Last(): BOPDS_InterfZZ;

ChangeLast(): BOPDS_InterfZZ;

ChangeValue(theIndex: number): BOPDS_InterfZZ;

SetValue(theIndex: number, theValue: BOPDS_InterfZZ): BOPDS_InterfZZ;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_BOPDS_Point: declare class NCollection_DynamicArray_BOPDS_Point

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: unknown, theOwnAllocator: boolean): unknown;

Append(theValue: BOPDS_Point): BOPDS_Point;

InsertAfter(theIndex: number, theValue: BOPDS_Point): BOPDS_Point;

InsertBefore(theIndex: number, theValue: BOPDS_Point): BOPDS_Point;

EraseLast(): void;

Appended(): BOPDS_Point;

Value(theIndex: number): BOPDS_Point;

First(): BOPDS_Point;

ChangeFirst(): BOPDS_Point;

Last(): BOPDS_Point;

ChangeLast(): BOPDS_Point;

ChangeValue(theIndex: number): BOPDS_Point;

SetValue(theIndex: number, theValue: BOPDS_Point): BOPDS_Point;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `NCollection_DynamicArray` (dynamic array of objects)
NCollection_DynamicArray_ExtremaPC_ExtremumResult: declare class NCollection_DynamicArray_ExtremaPC_ExtremumResult

constructor

Size(): number;

Length(): number;

Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Assign(theOther: NCollection_DynamicArray_ExtremaPC_ExtremumResult, theOwnAllocator: boolean): NCollection_DynamicArray_ExtremaPC_ExtremumResult;

Append(theValue: unknown): unknown;

InsertAfter(theIndex: number, theValue: unknown): unknown;

InsertBefore(theIndex: number, theValue: unknown): unknown;

EraseLast(): void;

Appended(): unknown;

Value(theIndex: number): unknown;

First(): unknown;

ChangeFirst(): unknown;

Last(): unknown;

ChangeLast(): unknown;

ChangeValue(theIndex: number): unknown;

SetValue(theIndex: number, theValue: unknown): unknown;

Clear(theReleaseMemory?: boolean): void;

SetIncrement(theIncrement: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
