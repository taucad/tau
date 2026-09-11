# libcascade — NCollection (24)

15 top-level symbols. Signatures are verbatim typescript.

NCollection_List_handle_TNaming_NamedShape: declare class NCollection_List_handle_TNaming_NamedShape extends NCollection_BaseList

constructor

Assign(theOther: NCollection_List_handle_TNaming_NamedShape): NCollection_List_handle_TNaming_NamedShape;

Clear(theAllocator?: NCollection_BaseAllocator): void;

First(): TNaming_NamedShape;

Last(): TNaming_NamedShape;

Append(theItem: TNaming_NamedShape): TNaming_NamedShape;
Append(theOther: NCollection_List_handle_TNaming_NamedShape): void;
Append(theItem: TNaming_NamedShape): TNaming_NamedShape;
Append(theOther: NCollection_List_handle_TNaming_NamedShape): void;

Prepend(theItem: TNaming_NamedShape): TNaming_NamedShape;
Prepend(theOther: NCollection_List_handle_TNaming_NamedShape): void;
Prepend(theItem: TNaming_NamedShape): TNaming_NamedShape;
Prepend(theOther: NCollection_List_handle_TNaming_NamedShape): void;

RemoveFirst(): void;

Reverse(): void;

Exchange(theOther: NCollection_List_handle_TNaming_NamedShape): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_List_int: declare class NCollection_List_int extends NCollection_BaseList

constructor

Assign(theOther: NCollection_List_int): NCollection_List_int;

Clear(theAllocator?: NCollection_BaseAllocator): void;

First(): number;

Last(): number;

Append(theItem: number): number;
Append(theOther: NCollection_List_int): void;
Append(theItem: number): number;
Append(theOther: NCollection_List_int): void;

Prepend(theItem: number): number;
Prepend(theOther: NCollection_List_int): void;
Prepend(theItem: number): number;
Prepend(theOther: NCollection_List_int): void;

RemoveFirst(): void;

Reverse(): void;

Exchange(theOther: NCollection_List_int): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_List_uint8_t: declare class NCollection_List_uint8_t extends NCollection_BaseList

constructor

Assign(theOther: NCollection_List_uint8_t): NCollection_List_uint8_t;

Clear(theAllocator?: NCollection_BaseAllocator): void;

First(): number;

Last(): number;

Append(theItem: number): number;
Append(theOther: NCollection_List_uint8_t): void;
Append(theItem: number): number;
Append(theOther: NCollection_List_uint8_t): void;

Prepend(theItem: number): number;
Prepend(theOther: NCollection_List_uint8_t): void;
Prepend(theItem: number): number;
Prepend(theOther: NCollection_List_uint8_t): void;

RemoveFirst(): void;

Reverse(): void;

Exchange(theOther: NCollection_List_uint8_t): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_Map_BOPDS_Pair: declare class NCollection_Map_BOPDS_Pair extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Add(theKey: BOPDS_Pair): boolean;

Added(theKey: BOPDS_Pair): BOPDS_Pair;

// DEPRECATED
Contains(theKey: BOPDS_Pair): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: BOPDS_Pair): boolean;
Contains(theOther: unknown): boolean;

Remove(K: BOPDS_Pair): boolean;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// DEPRECATED
IsEqual(theOther: unknown): boolean;

// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Unite(theOther: unknown): boolean;

// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Intersect(theOther: unknown): boolean;

// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Subtract(theOther: unknown): boolean;

// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Differ(theOther: unknown): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Map_TCollection_AsciiString: declare class NCollection_Map_TCollection_AsciiString extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Add(theKey: TCollection_AsciiString): boolean;

Added(theKey: TCollection_AsciiString): TCollection_AsciiString;

// DEPRECATED
Contains(theKey: TCollection_AsciiString): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: TCollection_AsciiString): boolean;
Contains(theOther: unknown): boolean;

Remove(K: TCollection_AsciiString): boolean;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// DEPRECATED
IsEqual(theOther: unknown): boolean;

// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Unite(theOther: unknown): boolean;

// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Intersect(theOther: unknown): boolean;

// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Subtract(theOther: unknown): boolean;

// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Differ(theOther: unknown): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Map_TDF_Label: declare class NCollection_Map_TDF_Label extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Add(theKey: TDF_Label): boolean;

Added(theKey: TDF_Label): TDF_Label;

// DEPRECATED
Contains(theKey: TDF_Label): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: TDF_Label): boolean;
Contains(theOther: unknown): boolean;

Remove(K: TDF_Label): boolean;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// DEPRECATED
IsEqual(theOther: unknown): boolean;

// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Unite(theOther: unknown): boolean;

// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Intersect(theOther: unknown): boolean;

// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Subtract(theOther: unknown): boolean;

// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Differ(theOther: unknown): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher: declare class NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher extends NCollection_BaseMap

constructor

Exchange(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

GetHasher(): TopTools_ShapeMapHasher;

Assign(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher;

ReSize(N: number): void;

Add(theKey: TopoDS_Shape): boolean;

Added(theKey: TopoDS_Shape): TopoDS_Shape;

// DEPRECATED
Contains(theKey: TopoDS_Shape): boolean;
Contains(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;
Contains(theKey: TopoDS_Shape): boolean;
Contains(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

Remove(K: TopoDS_Shape): boolean;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// DEPRECATED
IsEqual(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// DEPRECATED
Union(theLeft: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theRight: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// DEPRECATED
Unite(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// DEPRECATED
HasIntersection(theMap: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// DEPRECATED
Intersection(theLeft: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theRight: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// DEPRECATED
Intersect(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// DEPRECATED
Subtraction(theLeft: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theRight: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// DEPRECATED
Subtract(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// DEPRECATED
Difference(theLeft: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theRight: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

// DEPRECATED
Differ(theOther: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Map_handle_BOPDS_PaveBlock: declare class NCollection_Map_handle_BOPDS_PaveBlock extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Add(theKey: BOPDS_PaveBlock): boolean;

Added(theKey: BOPDS_PaveBlock): BOPDS_PaveBlock;

// DEPRECATED
Contains(theKey: BOPDS_PaveBlock): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: BOPDS_PaveBlock): boolean;
Contains(theOther: unknown): boolean;

Remove(K: BOPDS_PaveBlock): boolean;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// DEPRECATED
IsEqual(theOther: unknown): boolean;

// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Unite(theOther: unknown): boolean;

// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Intersect(theOther: unknown): boolean;

// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Subtract(theOther: unknown): boolean;

// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Differ(theOther: unknown): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Map_handle_TDF_Attribute: declare class NCollection_Map_handle_TDF_Attribute extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Add(theKey: TDF_Attribute): boolean;

Added(theKey: TDF_Attribute): TDF_Attribute;

// DEPRECATED
Contains(theKey: TDF_Attribute): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: TDF_Attribute): boolean;
Contains(theOther: unknown): boolean;

Remove(K: TDF_Attribute): boolean;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// DEPRECATED
IsEqual(theOther: unknown): boolean;

// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Unite(theOther: unknown): boolean;

// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Intersect(theOther: unknown): boolean;

// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Subtract(theOther: unknown): boolean;

// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Differ(theOther: unknown): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Map_handle_TNaming_NamedShape: declare class NCollection_Map_handle_TNaming_NamedShape extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Add(theKey: TNaming_NamedShape): boolean;

Added(theKey: TNaming_NamedShape): TNaming_NamedShape;

// DEPRECATED
Contains(theKey: TNaming_NamedShape): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: TNaming_NamedShape): boolean;
Contains(theOther: unknown): boolean;

Remove(K: TNaming_NamedShape): boolean;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// DEPRECATED
IsEqual(theOther: unknown): boolean;

// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Unite(theOther: unknown): boolean;

// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Intersect(theOther: unknown): boolean;

// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Subtract(theOther: unknown): boolean;

// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Differ(theOther: unknown): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Map_int: declare class NCollection_Map_int extends NCollection_BaseMap

constructor

Exchange(theOther: unknown): void;

GetHasher(): unknown;

Assign(theOther: unknown): unknown;

ReSize(N: number): void;

Add(theKey: number): boolean;

Added(theKey: number): number;

// DEPRECATED
Contains(theKey: number): boolean;
Contains(theOther: unknown): boolean;
Contains(theKey: number): boolean;
Contains(theOther: unknown): boolean;

Remove(K: number): boolean;

Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;
Clear(doReleaseMemory: boolean): void;
Clear(theAllocator: NCollection_BaseAllocator): void;

// DEPRECATED
IsEqual(theOther: unknown): boolean;

// DEPRECATED
Union(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Unite(theOther: unknown): boolean;

// DEPRECATED
HasIntersection(theMap: unknown): boolean;

// DEPRECATED
Intersection(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Intersect(theOther: unknown): boolean;

// DEPRECATED
Subtraction(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Subtract(theOther: unknown): boolean;

// DEPRECATED
Difference(theLeft: unknown, theRight: unknown): void;

// DEPRECATED
Differ(theOther: unknown): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_PackedMap_int: declare class NCollection_PackedMap_int

constructor

Assign(theOther: TColStd_PackedMapOfInteger): TColStd_PackedMapOfInteger;

ReSize(theNbBuckets: number): void;

Clear(): void;

Add(theKey: number): boolean;

Contains(theKey: number): boolean;
Contains(theOther: TColStd_PackedMapOfInteger): boolean;
Contains(theKey: number): boolean;
Contains(theOther: TColStd_PackedMapOfInteger): boolean;

Remove(theKey: number): boolean;

NbBuckets(): number;

Extent(): number;

Length(): number;

Size(): number;

IsEmpty(): boolean;

GetMinimalMapped(): number;

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

delete(): void;

[Symbol.dispose](): void;

NCollection_Sequence_AppParCurves_MultiCurve: declare class NCollection_Sequence_AppParCurves_MultiCurve extends NCollection_BaseSequence

constructor

static Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Reverse(): void;

Exchange(I: number, J: number): void;

Clear(theAllocator?: NCollection_BaseAllocator): void;

Assign(theOther: NCollection_Sequence_AppParCurves_MultiCurve): NCollection_Sequence_AppParCurves_MultiCurve;

Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

Append(theItem: AppParCurves_MultiCurve): void;
Append(theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
Append(theItem: AppParCurves_MultiCurve): void;
Append(theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;

Prepend(theItem: AppParCurves_MultiCurve): void;
Prepend(theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
Prepend(theItem: AppParCurves_MultiCurve): void;
Prepend(theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;

InsertBefore(theIndex: number, theItem: AppParCurves_MultiCurve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
InsertBefore(theIndex: number, theItem: AppParCurves_MultiCurve): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;

InsertAfter(theIndex: number, theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
InsertAfter(theIndex: number, theItem: AppParCurves_MultiCurve): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
InsertAfter(theIndex: number, theItem: AppParCurves_MultiCurve): void;

Split(theIndex: number, theSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;

First(): AppParCurves_MultiCurve;

ChangeFirst(): AppParCurves_MultiCurve;

Last(): AppParCurves_MultiCurve;

ChangeLast(): AppParCurves_MultiCurve;

Value(theIndex: number): AppParCurves_MultiCurve;

ChangeValue(theIndex: number): AppParCurves_MultiCurve;

SetValue(theIndex: number, theItem: AppParCurves_MultiCurve): void;

At(theIndex: number): AppParCurves_MultiCurve;

ChangeAt(theIndex: number): AppParCurves_MultiCurve;

delete(): void;

[Symbol.dispose](): void;

NCollection_Sequence_BRepExtrema_SolutionElem: declare class NCollection_Sequence_BRepExtrema_SolutionElem extends NCollection_BaseSequence

constructor

static Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Reverse(): void;

Exchange(I: number, J: number): void;

Clear(theAllocator?: NCollection_BaseAllocator): void;

Assign(theOther: NCollection_Sequence_BRepExtrema_SolutionElem): NCollection_Sequence_BRepExtrema_SolutionElem;

Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

Append(theItem: BRepExtrema_SolutionElem): void;
Append(theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
Append(theItem: BRepExtrema_SolutionElem): void;
Append(theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;

Prepend(theItem: BRepExtrema_SolutionElem): void;
Prepend(theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
Prepend(theItem: BRepExtrema_SolutionElem): void;
Prepend(theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;

InsertBefore(theIndex: number, theItem: BRepExtrema_SolutionElem): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
InsertBefore(theIndex: number, theItem: BRepExtrema_SolutionElem): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;

InsertAfter(theIndex: number, theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
InsertAfter(theIndex: number, theItem: BRepExtrema_SolutionElem): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;
InsertAfter(theIndex: number, theItem: BRepExtrema_SolutionElem): void;

Split(theIndex: number, theSeq: NCollection_Sequence_BRepExtrema_SolutionElem): void;

First(): BRepExtrema_SolutionElem;

ChangeFirst(): BRepExtrema_SolutionElem;

Last(): BRepExtrema_SolutionElem;

ChangeLast(): BRepExtrema_SolutionElem;

Value(theIndex: number): BRepExtrema_SolutionElem;

ChangeValue(theIndex: number): BRepExtrema_SolutionElem;

SetValue(theIndex: number, theItem: BRepExtrema_SolutionElem): void;

At(theIndex: number): BRepExtrema_SolutionElem;

ChangeAt(theIndex: number): BRepExtrema_SolutionElem;

delete(): void;

[Symbol.dispose](): void;

NCollection_Sequence_Extrema_POnCurv: declare class NCollection_Sequence_Extrema_POnCurv extends NCollection_BaseSequence

constructor

static Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Reverse(): void;

Exchange(I: number, J: number): void;

Clear(theAllocator?: NCollection_BaseAllocator): void;

Assign(theOther: NCollection_Sequence_Extrema_POnCurv): NCollection_Sequence_Extrema_POnCurv;

Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

Append(theItem: Extrema_POnCurv): void;
Append(theSeq: NCollection_Sequence_Extrema_POnCurv): void;
Append(theItem: Extrema_POnCurv): void;
Append(theSeq: NCollection_Sequence_Extrema_POnCurv): void;

Prepend(theItem: Extrema_POnCurv): void;
Prepend(theSeq: NCollection_Sequence_Extrema_POnCurv): void;
Prepend(theItem: Extrema_POnCurv): void;
Prepend(theSeq: NCollection_Sequence_Extrema_POnCurv): void;

InsertBefore(theIndex: number, theItem: Extrema_POnCurv): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv): void;
InsertBefore(theIndex: number, theItem: Extrema_POnCurv): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv): void;

InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv): void;
InsertAfter(theIndex: number, theItem: Extrema_POnCurv): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv): void;
InsertAfter(theIndex: number, theItem: Extrema_POnCurv): void;

Split(theIndex: number, theSeq: NCollection_Sequence_Extrema_POnCurv): void;

First(): Extrema_POnCurv;

ChangeFirst(): Extrema_POnCurv;

Last(): Extrema_POnCurv;

ChangeLast(): Extrema_POnCurv;

Value(theIndex: number): Extrema_POnCurv;

ChangeValue(theIndex: number): Extrema_POnCurv;

SetValue(theIndex: number, theItem: Extrema_POnCurv): void;

At(theIndex: number): Extrema_POnCurv;

ChangeAt(theIndex: number): Extrema_POnCurv;

delete(): void;

[Symbol.dispose](): void;
