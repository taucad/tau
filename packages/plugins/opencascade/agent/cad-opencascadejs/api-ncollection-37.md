# libcascade — NCollection (37)

16 top-level symbols. Signatures are verbatim typescript.

// Purpose
NCollection_IndexedMap_handle_TDF_Attribute: declare class NCollection_IndexedMap_handle_TDF_Attribute extends NCollection_BaseMap

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
Add(theKey1: TDF_Attribute): number;
// theKey1: key to add

// Added
Added(theKey1: TDF_Attribute): TDF_Attribute;
// theKey1: key to add

// Contains
Contains(theKey1: TDF_Attribute): boolean;

// Substitute
Substitute(theIndex: number, theKey1: TDF_Attribute): void;

// Swaps two elements with the given indices
Swap(theIndex1: number, theIndex2: number): void;

// RemoveLast
RemoveLast(): void;

// Remove the key of the given index
RemoveFromIndex(theIndex: number): void;

// Remove the given key
RemoveKey(theKey1: TDF_Attribute): boolean;

// FindKey
FindKey(theIndex: number): TDF_Attribute;

// FindIndex
FindIndex(theKey1: TDF_Attribute): number;

// Clear data
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_BOPAlgo_CheckResult: declare class NCollection_List_BOPAlgo_CheckResult extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_BOPAlgo_CheckResult): NCollection_List_BOPAlgo_CheckResult;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): BOPAlgo_CheckResult;

// Last item
Last(): BOPAlgo_CheckResult;

// Append one item at the end
Append(theItem: BOPAlgo_CheckResult): BOPAlgo_CheckResult;
Append(theOther: NCollection_List_BOPAlgo_CheckResult): void;
Append(theItem: BOPAlgo_CheckResult): BOPAlgo_CheckResult;
Append(theOther: NCollection_List_BOPAlgo_CheckResult): void;

// Prepend one item at the beginning
Prepend(theItem: BOPAlgo_CheckResult): BOPAlgo_CheckResult;
Prepend(theOther: NCollection_List_BOPAlgo_CheckResult): void;
Prepend(theItem: BOPAlgo_CheckResult): BOPAlgo_CheckResult;
Prepend(theOther: NCollection_List_BOPAlgo_CheckResult): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_BOPAlgo_CheckResult): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_BOPDS_Pave: declare class NCollection_List_BOPDS_Pave extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_BOPDS_Pave): NCollection_List_BOPDS_Pave;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): BOPDS_Pave;

// Last item
Last(): BOPDS_Pave;

// Append one item at the end
Append(theItem: BOPDS_Pave): BOPDS_Pave;
Append(theOther: NCollection_List_BOPDS_Pave): void;
Append(theItem: BOPDS_Pave): BOPDS_Pave;
Append(theOther: NCollection_List_BOPDS_Pave): void;

// Prepend one item at the beginning
Prepend(theItem: BOPDS_Pave): BOPDS_Pave;
Prepend(theOther: NCollection_List_BOPDS_Pave): void;
Prepend(theItem: BOPDS_Pave): BOPDS_Pave;
Prepend(theOther: NCollection_List_BOPDS_Pave): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_BOPDS_Pave): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_BOPTools_ConnexityBlock: declare class NCollection_List_BOPTools_ConnexityBlock extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_BOPTools_ConnexityBlock): NCollection_List_BOPTools_ConnexityBlock;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): BOPTools_ConnexityBlock;

// Last item
Last(): BOPTools_ConnexityBlock;

// Append one item at the end
Append(theItem: BOPTools_ConnexityBlock): BOPTools_ConnexityBlock;
Append(theOther: NCollection_List_BOPTools_ConnexityBlock): void;
Append(theItem: BOPTools_ConnexityBlock): BOPTools_ConnexityBlock;
Append(theOther: NCollection_List_BOPTools_ConnexityBlock): void;

// Prepend one item at the beginning
Prepend(theItem: BOPTools_ConnexityBlock): BOPTools_ConnexityBlock;
Prepend(theOther: NCollection_List_BOPTools_ConnexityBlock): void;
Prepend(theItem: BOPTools_ConnexityBlock): BOPTools_ConnexityBlock;
Prepend(theOther: NCollection_List_BOPTools_ConnexityBlock): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_BOPTools_ConnexityBlock): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_BOPTools_CoupleOfShape: declare class NCollection_List_BOPTools_CoupleOfShape extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_BOPTools_CoupleOfShape): NCollection_List_BOPTools_CoupleOfShape;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): BOPTools_CoupleOfShape;

// Last item
Last(): BOPTools_CoupleOfShape;

// Append one item at the end
Append(theItem: BOPTools_CoupleOfShape): BOPTools_CoupleOfShape;
Append(theOther: NCollection_List_BOPTools_CoupleOfShape): void;
Append(theItem: BOPTools_CoupleOfShape): BOPTools_CoupleOfShape;
Append(theOther: NCollection_List_BOPTools_CoupleOfShape): void;

// Prepend one item at the beginning
Prepend(theItem: BOPTools_CoupleOfShape): BOPTools_CoupleOfShape;
Prepend(theOther: NCollection_List_BOPTools_CoupleOfShape): void;
Prepend(theItem: BOPTools_CoupleOfShape): BOPTools_CoupleOfShape;
Prepend(theOther: NCollection_List_BOPTools_CoupleOfShape): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_BOPTools_CoupleOfShape): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_BRepCheck_Status: declare class NCollection_List_BRepCheck_Status extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_BRepCheck_Status): NCollection_List_BRepCheck_Status;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): BRepCheck_Status;

// Last item
Last(): BRepCheck_Status;

// Append one item at the end
Append(theItem: BRepCheck_Status): BRepCheck_Status;
Append(theOther: NCollection_List_BRepCheck_Status): void;
Append(theItem: BRepCheck_Status): BRepCheck_Status;
Append(theOther: NCollection_List_BRepCheck_Status): void;

// Prepend one item at the beginning
Prepend(theItem: BRepCheck_Status): BRepCheck_Status;
Prepend(theOther: NCollection_List_BRepCheck_Status): void;
Prepend(theItem: BRepCheck_Status): BRepCheck_Status;
Prepend(theOther: NCollection_List_BRepCheck_Status): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_BRepCheck_Status): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_BRepOffset_Interval: declare class NCollection_List_BRepOffset_Interval extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_BRepOffset_Interval): NCollection_List_BRepOffset_Interval;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): BRepOffset_Interval;

// Last item
Last(): BRepOffset_Interval;

// Append one item at the end
Append(theItem: BRepOffset_Interval): BRepOffset_Interval;
Append(theOther: NCollection_List_BRepOffset_Interval): void;
Append(theItem: BRepOffset_Interval): BRepOffset_Interval;
Append(theOther: NCollection_List_BRepOffset_Interval): void;

// Prepend one item at the beginning
Prepend(theItem: BRepOffset_Interval): BRepOffset_Interval;
Prepend(theOther: NCollection_List_BRepOffset_Interval): void;
Prepend(theItem: BRepOffset_Interval): BRepOffset_Interval;
Prepend(theOther: NCollection_List_BRepOffset_Interval): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_BRepOffset_Interval): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_Bnd_Range: declare class NCollection_List_Bnd_Range extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_Bnd_Range): NCollection_List_Bnd_Range;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): Bnd_Range;

// Last item
Last(): Bnd_Range;

// Append one item at the end
Append(theItem: Bnd_Range): Bnd_Range;
Append(theOther: NCollection_List_Bnd_Range): void;
Append(theItem: Bnd_Range): Bnd_Range;
Append(theOther: NCollection_List_Bnd_Range): void;

// Prepend one item at the beginning
Prepend(theItem: Bnd_Range): Bnd_Range;
Prepend(theOther: NCollection_List_Bnd_Range): void;
Prepend(theItem: Bnd_Range): Bnd_Range;
Prepend(theOther: NCollection_List_Bnd_Range): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_Bnd_Range): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_HLRAlgo_BiPoint: declare class NCollection_List_HLRAlgo_BiPoint extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: unknown): unknown;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): HLRAlgo_BiPoint;

// Last item
Last(): HLRAlgo_BiPoint;

// Append one item at the end
Append(theItem: HLRAlgo_BiPoint): HLRAlgo_BiPoint;
Append(theOther: unknown): void;
Append(theItem: HLRAlgo_BiPoint): HLRAlgo_BiPoint;
Append(theOther: unknown): void;

// Prepend one item at the beginning
Prepend(theItem: HLRAlgo_BiPoint): HLRAlgo_BiPoint;
Prepend(theOther: unknown): void;
Prepend(theItem: HLRAlgo_BiPoint): HLRAlgo_BiPoint;
Prepend(theOther: unknown): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: unknown): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_HLRAlgo_Interference: declare class NCollection_List_HLRAlgo_Interference extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_HLRAlgo_Interference): NCollection_List_HLRAlgo_Interference;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): HLRAlgo_Interference;

// Last item
Last(): HLRAlgo_Interference;

// Append one item at the end
Append(theItem: HLRAlgo_Interference): HLRAlgo_Interference;
Append(theOther: NCollection_List_HLRAlgo_Interference): void;
Append(theItem: HLRAlgo_Interference): HLRAlgo_Interference;
Append(theOther: NCollection_List_HLRAlgo_Interference): void;

// Prepend one item at the beginning
Prepend(theItem: HLRAlgo_Interference): HLRAlgo_Interference;
Prepend(theOther: NCollection_List_HLRAlgo_Interference): void;
Prepend(theItem: HLRAlgo_Interference): HLRAlgo_Interference;
Prepend(theOther: NCollection_List_HLRAlgo_Interference): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_HLRAlgo_Interference): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_IntSurf_PntOn2S: declare class NCollection_List_IntSurf_PntOn2S extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_IntSurf_PntOn2S): NCollection_List_IntSurf_PntOn2S;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): IntSurf_PntOn2S;

// Last item
Last(): IntSurf_PntOn2S;

// Append one item at the end
Append(theItem: IntSurf_PntOn2S): IntSurf_PntOn2S;
Append(theOther: NCollection_List_IntSurf_PntOn2S): void;
Append(theItem: IntSurf_PntOn2S): IntSurf_PntOn2S;
Append(theOther: NCollection_List_IntSurf_PntOn2S): void;

// Prepend one item at the beginning
Prepend(theItem: IntSurf_PntOn2S): IntSurf_PntOn2S;
Prepend(theOther: NCollection_List_IntSurf_PntOn2S): void;
Prepend(theItem: IntSurf_PntOn2S): IntSurf_PntOn2S;
Prepend(theOther: NCollection_List_IntSurf_PntOn2S): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_IntSurf_PntOn2S): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_IntTools_CurveRangeSample: declare class NCollection_List_IntTools_CurveRangeSample extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_IntTools_CurveRangeSample): NCollection_List_IntTools_CurveRangeSample;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): IntTools_CurveRangeSample;

// Last item
Last(): IntTools_CurveRangeSample;

// Append one item at the end
Append(theItem: IntTools_CurveRangeSample): IntTools_CurveRangeSample;
Append(theOther: NCollection_List_IntTools_CurveRangeSample): void;
Append(theItem: IntTools_CurveRangeSample): IntTools_CurveRangeSample;
Append(theOther: NCollection_List_IntTools_CurveRangeSample): void;

// Prepend one item at the beginning
Prepend(theItem: IntTools_CurveRangeSample): IntTools_CurveRangeSample;
Prepend(theOther: NCollection_List_IntTools_CurveRangeSample): void;
Prepend(theItem: IntTools_CurveRangeSample): IntTools_CurveRangeSample;
Prepend(theOther: NCollection_List_IntTools_CurveRangeSample): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_IntTools_CurveRangeSample): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_IntTools_SurfaceRangeSample: declare class NCollection_List_IntTools_SurfaceRangeSample extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_IntTools_SurfaceRangeSample): NCollection_List_IntTools_SurfaceRangeSample;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): IntTools_SurfaceRangeSample;

// Last item
Last(): IntTools_SurfaceRangeSample;

// Append one item at the end
Append(theItem: IntTools_SurfaceRangeSample): IntTools_SurfaceRangeSample;
Append(theOther: NCollection_List_IntTools_SurfaceRangeSample): void;
Append(theItem: IntTools_SurfaceRangeSample): IntTools_SurfaceRangeSample;
Append(theOther: NCollection_List_IntTools_SurfaceRangeSample): void;

// Prepend one item at the beginning
Prepend(theItem: IntTools_SurfaceRangeSample): IntTools_SurfaceRangeSample;
Prepend(theOther: NCollection_List_IntTools_SurfaceRangeSample): void;
Prepend(theItem: IntTools_SurfaceRangeSample): IntTools_SurfaceRangeSample;
Prepend(theOther: NCollection_List_IntTools_SurfaceRangeSample): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_IntTools_SurfaceRangeSample): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_Message_Msg: declare class NCollection_List_Message_Msg extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_Message_Msg): NCollection_List_Message_Msg;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): Message_Msg;

// Last item
Last(): Message_Msg;

// Append one item at the end
Append(theItem: Message_Msg): Message_Msg;
Append(theOther: NCollection_List_Message_Msg): void;
Append(theItem: Message_Msg): Message_Msg;
Append(theOther: NCollection_List_Message_Msg): void;

// Prepend one item at the beginning
Prepend(theItem: Message_Msg): Message_Msg;
Prepend(theOther: NCollection_List_Message_Msg): void;
Prepend(theItem: Message_Msg): Message_Msg;
Prepend(theOther: NCollection_List_Message_Msg): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_Message_Msg): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_NCollection_List_TopoDS_Shape: declare class NCollection_List_NCollection_List_TopoDS_Shape extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_NCollection_List_TopoDS_Shape): NCollection_List_NCollection_List_TopoDS_Shape;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): NCollection_List_TopoDS_Shape;

// Last item
Last(): NCollection_List_TopoDS_Shape;

// Append one item at the end
Append(theItem: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;
Append(theOther: NCollection_List_NCollection_List_TopoDS_Shape): void;
Append(theItem: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;
Append(theOther: NCollection_List_NCollection_List_TopoDS_Shape): void;

// Prepend one item at the beginning
Prepend(theItem: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;
Prepend(theOther: NCollection_List_NCollection_List_TopoDS_Shape): void;
Prepend(theItem: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;
Prepend(theOther: NCollection_List_NCollection_List_TopoDS_Shape): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_NCollection_List_TopoDS_Shape): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Purpose
NCollection_List_NCollection_Sequence_int: declare class NCollection_List_NCollection_Sequence_int extends NCollection_BaseList

constructor

// Replace this list by the items of another list (theOther parameter)
Assign(theOther: NCollection_List_NCollection_Sequence_int): NCollection_List_NCollection_Sequence_int;

// Clear this list
Clear(theAllocator?: NCollection_BaseAllocator): void;

// First item
First(): NCollection_Sequence_int;

// Last item
Last(): NCollection_Sequence_int;

// Append one item at the end
Append(theItem: NCollection_Sequence_int): NCollection_Sequence_int;
Append(theOther: NCollection_List_NCollection_Sequence_int): void;
Append(theItem: NCollection_Sequence_int): NCollection_Sequence_int;
Append(theOther: NCollection_List_NCollection_Sequence_int): void;

// Prepend one item at the beginning
Prepend(theItem: NCollection_Sequence_int): NCollection_Sequence_int;
Prepend(theOther: NCollection_List_NCollection_Sequence_int): void;
Prepend(theItem: NCollection_Sequence_int): NCollection_Sequence_int;
Prepend(theOther: NCollection_List_NCollection_Sequence_int): void;

// RemoveFirst item
RemoveFirst(): void;

// Reverse the list
Reverse(): void;

// Exchange the content of two lists without re-allocations
Exchange(theOther: NCollection_List_NCollection_Sequence_int): void;
// theOther: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
