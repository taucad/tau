# libcascade — IMeshData

33 top-level symbols. Signatures are verbatim typescript.

IMeshData_Curve: declare class IMeshData_Curve extends IMeshData_ParametersList

InsertPoint(thePosition: number, thePoint: gp_Pnt, theParamOnPCurve: number): void;

AddPoint(thePoint: gp_Pnt, theParamOnCurve: number): void;

GetPoint(theIndex: number): gp_Pnt;

RemovePoint(theIndex: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IMeshData_Model: declare class IMeshData_Model extends IMeshData_Shape

GetMaxSize(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

FacesNb(): number;

AddFace(theFace: TopoDS_Face): unknown;

GetFace(theIndex: number): unknown;

EdgesNb(): number;

AddEdge(theEdge: TopoDS_Edge): unknown;

GetEdge(theIndex: number): unknown;

delete(): void;

[Symbol.dispose](): void;

IMeshData_PCurve: declare class IMeshData_PCurve extends IMeshData_ParametersList

InsertPoint(thePosition: number, thePoint: gp_Pnt2d, theParamOnPCurve: number): void;

AddPoint(thePoint: gp_Pnt2d, theParamOnPCurve: number): void;

GetPoint(theIndex: number): gp_Pnt2d;

GetIndex(theIndex: number): number;

RemovePoint(theIndex: number): void;

IsForward(): boolean;

IsInternal(): boolean;

GetOrientation(): TopAbs_Orientation;

GetFace(): unknown;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IMeshData_ParametersList: declare class IMeshData_ParametersList extends Standard_Transient

GetParameter(theIndex: number): number;

ParametersNb(): number;

Clear(isKeepEndPoints: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IMeshData_Shape: declare class IMeshData_Shape extends Standard_Transient

SetShape(theShape: TopoDS_Shape): void;

GetShape(): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IMeshData_Status: typeof IMeshData_Status[keyof typeof IMeshData_Status]

IMeshData_StatusOwner: declare class IMeshData_StatusOwner

IsEqual(theValue: IMeshData_Status): boolean;

IsSet(theValue: IMeshData_Status): boolean;

SetStatus(theValue: IMeshData_Status): void;

UnsetStatus(theValue: IMeshData_Status): void;

GetStatusMask(): number;

delete(): void;

[Symbol.dispose](): void;

IMeshData_TessellatedShape: declare class IMeshData_TessellatedShape extends IMeshData_Shape

GetDeflection(): number;

SetDeflection(theValue: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IMeshData_Array1OfInteger: declare class IMeshData_Array1OfInteger extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_Array1OfVertexOfDelaun: declare class IMeshData_Array1OfVertexOfDelaun extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_BndBox2dTree: declare class IMeshData_BndBox2dTree extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_BndBox2dTreeFiller: declare class IMeshData_BndBox2dTreeFiller

constructor

Add(theObj: number, theBnd: Bnd_Box2d): void;

Fill(): number;

Reset(): void;

delete(): void;

[Symbol.dispose](): void;

IMeshData_CircleCellFilter: declare class IMeshData_CircleCellFilter

constructor

Reset(theCellSize: number, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: NCollection_Array1_double, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: number, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: NCollection_Array1_double, theAlloc: NCollection_IncAllocator): void;

Add(theTarget: number, thePnt: gp_XY): void;
Add(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;
Add(theTarget: number, thePnt: gp_XY): void;
Add(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

Remove(theTarget: number, thePnt: gp_XY): void;
Remove(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;
Remove(theTarget: number, thePnt: gp_XY): void;
Remove(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

Inspect(thePnt: gp_XY, theInspector: BRepMesh_CircleInspector): void;
Inspect(thePntMin: gp_XY, thePntMax: gp_XY, theInspector: BRepMesh_CircleInspector): void;
Inspect(thePnt: gp_XY, theInspector: BRepMesh_CircleInspector): void;
Inspect(thePntMin: gp_XY, thePntMax: gp_XY, theInspector: BRepMesh_CircleInspector): void;

delete(): void;

[Symbol.dispose](): void;

IMeshData_DMapOfIFacePtrsListOfInteger: declare class IMeshData_DMapOfIFacePtrsListOfInteger extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_DMapOfIFacePtrsMapOfIEdgePtrs: declare class IMeshData_DMapOfIFacePtrsMapOfIEdgePtrs extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_DMapOfIntegerListOfInteger: declare class IMeshData_DMapOfIntegerListOfInteger extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_DMapOfShapeInteger: declare class IMeshData_DMapOfShapeInteger extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_IDMapOfIFacePtrsListOfIPCurves: declare class IMeshData_IDMapOfIFacePtrsListOfIPCurves extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_IDMapOfLink: declare class IMeshData_IDMapOfLink extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_IMapOfReal: declare class IMeshData_IMapOfReal extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_ListOfIPCurves: declare class IMeshData_ListOfIPCurves extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_ListOfInteger: declare class IMeshData_ListOfInteger extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_ListOfPnt2d: declare class IMeshData_ListOfPnt2d extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_MapOfIEdgePtr: declare class IMeshData_MapOfIEdgePtr extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_MapOfIFacePtr: declare class IMeshData_MapOfIFacePtr extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_MapOfInteger: declare class IMeshData_MapOfInteger extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_MapOfIntegerInteger: declare class IMeshData_MapOfIntegerInteger extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_MapOfOrientedEdges: declare class IMeshData_MapOfOrientedEdges extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_MapOfReal: declare class IMeshData_MapOfReal extends Standard_Transient

constructor

delete(): void;

[Symbol.dispose](): void;

IMeshData_VertexCellFilter: declare class IMeshData_VertexCellFilter

constructor

Reset(theCellSize: number, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: NCollection_Array1_double, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: number, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: NCollection_Array1_double, theAlloc: NCollection_IncAllocator): void;

Add(theTarget: number, thePnt: gp_XY): void;
Add(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;
Add(theTarget: number, thePnt: gp_XY): void;
Add(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

Remove(theTarget: number, thePnt: gp_XY): void;
Remove(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;
Remove(theTarget: number, thePnt: gp_XY): void;
Remove(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

Inspect(thePnt: gp_XY, theInspector: BRepMesh_VertexInspector): void;
Inspect(thePntMin: gp_XY, thePntMax: gp_XY, theInspector: BRepMesh_VertexInspector): void;
Inspect(thePnt: gp_XY, theInspector: BRepMesh_VertexInspector): void;
Inspect(thePntMin: gp_XY, thePntMax: gp_XY, theInspector: BRepMesh_VertexInspector): void;

delete(): void;

[Symbol.dispose](): void;

IMeshData_BndBox2dTreeFiller_ObjBnd: interface IMeshData_BndBox2dTreeFiller_ObjBnd

myObj: number

myBnd: Bnd_Box2d

IMeshData_VectorOfCircle: NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void

IMeshData_VectorOfVertex: NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void
