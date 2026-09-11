# libcascade — NCollection (31)

43 top-level symbols. Signatures are verbatim typescript.

NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject: declare class NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject extends NCollection_BaseSequence

constructor

static Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Reverse(): void;

Exchange(I: number, J: number): void;

Clear(theAllocator?: NCollection_BaseAllocator): void;

Assign(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject;

Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

Append(theItem: XCAFDimTolObjects_DatumObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
Append(theItem: XCAFDimTolObjects_DatumObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

Prepend(theItem: XCAFDimTolObjects_DatumObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
Prepend(theItem: XCAFDimTolObjects_DatumObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;

Split(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

First(): XCAFDimTolObjects_DatumObject;

ChangeFirst(): XCAFDimTolObjects_DatumObject;

Last(): XCAFDimTolObjects_DatumObject;

ChangeLast(): XCAFDimTolObjects_DatumObject;

Value(theIndex: number): XCAFDimTolObjects_DatumObject;

ChangeValue(theIndex: number): XCAFDimTolObjects_DatumObject;

SetValue(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;

At(theIndex: number): XCAFDimTolObjects_DatumObject;

ChangeAt(theIndex: number): XCAFDimTolObjects_DatumObject;

delete(): void;

[Symbol.dispose](): void;

NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject: declare class NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject extends NCollection_BaseSequence

constructor

static Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Reverse(): void;

Exchange(I: number, J: number): void;

Clear(theAllocator?: NCollection_BaseAllocator): void;

Assign(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject;

Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

Append(theItem: XCAFDimTolObjects_DimensionObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
Append(theItem: XCAFDimTolObjects_DimensionObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

Prepend(theItem: XCAFDimTolObjects_DimensionObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
Prepend(theItem: XCAFDimTolObjects_DimensionObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;

Split(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

First(): XCAFDimTolObjects_DimensionObject;

ChangeFirst(): XCAFDimTolObjects_DimensionObject;

Last(): XCAFDimTolObjects_DimensionObject;

ChangeLast(): XCAFDimTolObjects_DimensionObject;

Value(theIndex: number): XCAFDimTolObjects_DimensionObject;

ChangeValue(theIndex: number): XCAFDimTolObjects_DimensionObject;

SetValue(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;

At(theIndex: number): XCAFDimTolObjects_DimensionObject;

ChangeAt(theIndex: number): XCAFDimTolObjects_DimensionObject;

delete(): void;

[Symbol.dispose](): void;

NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject: declare class NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject extends NCollection_BaseSequence

constructor

static Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Reverse(): void;

Exchange(I: number, J: number): void;

Clear(theAllocator?: NCollection_BaseAllocator): void;

Assign(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject;

Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

Append(theItem: XCAFDimTolObjects_GeomToleranceObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
Append(theItem: XCAFDimTolObjects_GeomToleranceObject): void;
Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

Prepend(theItem: XCAFDimTolObjects_GeomToleranceObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
Prepend(theItem: XCAFDimTolObjects_GeomToleranceObject): void;
Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;

Split(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

First(): XCAFDimTolObjects_GeomToleranceObject;

ChangeFirst(): XCAFDimTolObjects_GeomToleranceObject;

Last(): XCAFDimTolObjects_GeomToleranceObject;

ChangeLast(): XCAFDimTolObjects_GeomToleranceObject;

Value(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;

ChangeValue(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;

SetValue(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;

At(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;

ChangeAt(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;

delete(): void;

[Symbol.dispose](): void;

NCollection_Sequence_int: declare class NCollection_Sequence_int extends NCollection_BaseSequence

constructor

static Lower(): number;

Upper(): number;

IsEmpty(): boolean;

Reverse(): void;

Exchange(I: number, J: number): void;

Clear(theAllocator?: NCollection_BaseAllocator): void;

Assign(theOther: NCollection_Sequence_int): NCollection_Sequence_int;

Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;
Remove(theIndex: number): void;
Remove(theFromIndex: number, theToIndex: number): void;

Append(theItem: number): void;
Append(theSeq: NCollection_Sequence_int): void;
Append(theItem: number): void;
Append(theSeq: NCollection_Sequence_int): void;

Prepend(theItem: number): void;
Prepend(theSeq: NCollection_Sequence_int): void;
Prepend(theItem: number): void;
Prepend(theSeq: NCollection_Sequence_int): void;

InsertBefore(theIndex: number, theItem: number): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_int): void;
InsertBefore(theIndex: number, theItem: number): void;
InsertBefore(theIndex: number, theSeq: NCollection_Sequence_int): void;

InsertAfter(theIndex: number, theSeq: NCollection_Sequence_int): void;
InsertAfter(theIndex: number, theItem: number): void;
InsertAfter(theIndex: number, theSeq: NCollection_Sequence_int): void;
InsertAfter(theIndex: number, theItem: number): void;

Split(theIndex: number, theSeq: NCollection_Sequence_int): void;

First(): number;

ChangeFirst(): number;

Last(): number;

ChangeLast(): number;

Value(theIndex: number): number;

ChangeValue(theIndex: number): number;

SetValue(theIndex: number, theItem: number): void;

At(theIndex: number): number;

ChangeAt(theIndex: number): number;

delete(): void;

[Symbol.dispose](): void;

NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void: declare class NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void: declare class NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

NCollection_Shared_Standard_Mutex_void: declare class NCollection_Shared_Standard_Mutex_void extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

NCollection_TListIterator_HLRAlgo_Interference: declare class NCollection_TListIterator_HLRAlgo_Interference extends NCollection_BaseList_Iterator

constructor

More(): boolean;

Next(): void;

Value(): HLRAlgo_Interference;

ChangeValue(): HLRAlgo_Interference;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_BRepGraph_NodeId_Typed_BRepGraph_NodeId_Kind_CoEdge: NCollection_Array1_BRepGraph_CoEdgeId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Child: NCollection_Array1_BRepGraph_ChildRefId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Face: NCollection_Array1_BRepGraph_FaceRefId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Occurrence: NCollection_Array1_BRepGraph_OccurrenceRefId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Shell: NCollection_Array1_BRepGraph_ShellRefId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Solid: NCollection_Array1_BRepGraph_SolidRefId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Wire: NCollection_Array1_BRepGraph_WireRefId

NCollection_Array1_TFunction_DataMapOfGUIDDriver: NCollection_Array1_int

NCollection_Array1_TopOpeBRepDS_DataMapOfIntegerListOfInterference: NCollection_Array1_int

NCollection_Array1_handle_StepElement_HSequenceOfCurveElementPurposeMember: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

NCollection_Array1_handle_StepElement_HSequenceOfSurfaceElementPurposeMember: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

NCollection_Array1_uint8_t: NCollection_Array1_unsignedchar

NCollection_Array2_handle_TColStd_HArray1OfInteger: NCollection_Array2_handle_NCollection_HArray1_int

NCollection_Array2_handle_TColStd_HArray1OfReal: NCollection_Array2_handle_NCollection_HArray1_double

NCollection_DataMap_TCollection_ExtendedString_unsignedchar: NCollection_DataMap_TCollection_ExtendedString_uint8_t

NCollection_DataMap_TopoDS_Shape_Message_ListOfMsg_TopTools_ShapeMapHasher: NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher

NCollection_DataMap_TopoDS_Shape_TColStd_ListOfReal_TopTools_ShapeMapHasher: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher

NCollection_DataMap_TopoDS_Shape_TopTools_ListOfShape_TopTools_ShapeMapHasher: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher

NCollection_DataMap_TopoDS_Shape_handle_TopTools_HArray2OfShape_TopTools_ShapeMapHasher: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher

NCollection_HArray1_TFunction_DataMapOfGUIDDriver: NCollection_HArray1_int

NCollection_HArray1_TopOpeBRepDS_DataMapOfIntegerListOfInterference: NCollection_HArray1_int

NCollection_HArray1_handle_StepElement_HSequenceOfCurveElementPurposeMember: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

NCollection_HArray1_handle_StepElement_HSequenceOfSurfaceElementPurposeMember: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

NCollection_HArray1_uint8_t: NCollection_HArray1_unsignedchar

NCollection_HArray2_handle_TColStd_HArray1OfInteger: NCollection_HArray2_handle_NCollection_HArray1_int

NCollection_HArray2_handle_TColStd_HArray1OfReal: NCollection_HArray2_handle_NCollection_HArray1_double

NCollection_HSequence_handle_TColgp_HSequenceOfPnt: NCollection_HSequence_handle_NCollection_HSequence_gp_Pnt

NCollection_IndexedDataMap_TopoDS_Shape_TopTools_ListOfShape_TopTools_ShapeMapHasher: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher

NCollection_List_TopTools_ListOfShape: NCollection_List_NCollection_List_TopoDS_Shape

NCollection_List_unsignedchar: NCollection_List_uint8_t

NCollection_Sequence_TColGeom2d_SequenceOfGeometry: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry

NCollection_Sequence_handle_TColgp_HSequenceOfPnt: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt

NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle: NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void

NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex: NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void

NCollection_Shared_Standard_Mutex: NCollection_Shared_Standard_Mutex_void
