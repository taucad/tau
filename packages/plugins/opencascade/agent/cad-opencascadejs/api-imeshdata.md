# libcascade — IMeshData

33 top-level symbols. Signatures are verbatim typescript.

// Interface class representing discrete 3d curve of edge
IMeshData_Curve: declare class IMeshData_Curve extends IMeshData_ParametersList

// Inserts new discretization point at the given position
InsertPoint(thePosition: number, thePoint: gp_Pnt, theParamOnPCurve: number): void;

// Adds new discretization point to curve
AddPoint(thePoint: gp_Pnt, theParamOnCurve: number): void;

// Returns discretization point with the given index
GetPoint(theIndex: number): gp_Pnt;

// Removes point with the given index
RemovePoint(theIndex: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface class representing discrete model of a shape
IMeshData_Model: declare class IMeshData_Model extends IMeshData_Shape

// Returns maximum size of shape model
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface class representing pcurve of edge associated with discrete face
IMeshData_PCurve: declare class IMeshData_PCurve extends IMeshData_ParametersList

// Inserts new discretization point at the given position
InsertPoint(thePosition: number, thePoint: gp_Pnt2d, theParamOnPCurve: number): void;

// Adds new discretization point to pcurve
AddPoint(thePoint: gp_Pnt2d, theParamOnPCurve: number): void;

// Returns discretization point with the given index
GetPoint(theIndex: number): gp_Pnt2d;

// Returns index in mesh corresponded to discretization point with the given index
GetIndex(theIndex: number): number;

// Removes point with the given index
RemovePoint(theIndex: number): void;

// Returns forward flag of this pcurve
IsForward(): boolean;

// Returns internal flag of this pcurve
IsInternal(): boolean;

// Returns orientation of the edge associated with current pcurve
GetOrientation(): TopAbs_Orientation;

// Returns discrete face pcurve is associated to
GetFace(): unknown;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface class representing list of parameters on curve
IMeshData_ParametersList: declare class IMeshData_ParametersList extends Standard_Transient

// Returns parameter with the given index
GetParameter(theIndex: number): number;

// Returns number of parameters
ParametersNb(): number;

// Clears parameters list
Clear(isKeepEndPoints: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface class representing model with associated {@link TopoDS_Shape`TopoDS_Shape`}
IMeshData_Shape: declare class IMeshData_Shape extends Standard_Transient

// Assigns shape to discrete shape
SetShape(theShape: TopoDS_Shape): void;

// Returns shape assigned to discrete shape
GetShape(): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumerates statuses used to notify state of discrete model
IMeshData_Status: typeof IMeshData_Status[keyof typeof IMeshData_Status]

// Extension interface class providing status functionality
IMeshData_StatusOwner: declare class IMeshData_StatusOwner

// Returns true in case if status is strictly equal to the given value
IsEqual(theValue: IMeshData_Status): boolean;

// Returns true in case if status is set
IsSet(theValue: IMeshData_Status): boolean;

// Adds status to status flags of a face
SetStatus(theValue: IMeshData_Status): void;

// Adds status to status flags of a face
UnsetStatus(theValue: IMeshData_Status): void;

// Returns complete status mask
GetStatusMask(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface class representing shaped model with deflection
IMeshData_TessellatedShape: declare class IMeshData_TessellatedShape extends IMeshData_Shape

// Gets deflection value for the discrete model
GetDeflection(): number;

// Sets deflection value for the discrete model
SetDeflection(theValue: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_Array1OfInteger: declare class IMeshData_Array1OfInteger extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_Array1OfVertexOfDelaun: declare class IMeshData_Array1OfVertexOfDelaun extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_BndBox2dTree: declare class IMeshData_BndBox2dTree extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is used to fill an UBTree in a random order
IMeshData_BndBox2dTreeFiller: declare class IMeshData_BndBox2dTreeFiller

constructor

// Adds a pair (theObj, theBnd) to my sequence
Add(theObj: number, theBnd: Bnd_Box2d): void;

// Fills the tree with the objects from my sequence
Fill(): number;

// Remove all data from Filler, partculary if the Tree no more needed so the destructor of this Filler should not populate the useless Tree
Reset(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A data structure for sorting geometric objects (called targets) in n-dimensional space into cells, with associated algorithm for fast checking of coincidence (overlapping, intersection, etc.) with other objects (called here bullets)
IMeshData_CircleCellFilter: declare class IMeshData_CircleCellFilter

constructor

// Clear the data structures, set new cell size and allocator
Reset(theCellSize: number, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: NCollection_Array1_double, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: number, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: NCollection_Array1_double, theAlloc: NCollection_IncAllocator): void;

// Adds a target object for further search at a point (into only one cell) Adds a target object for further search in the range of cells defined by two points (the first point must have all coordinates equal or less than the same coordinate of the second point)
Add(theTarget: number, thePnt: gp_XY): void;
Add(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;
Add(theTarget: number, thePnt: gp_XY): void;
Add(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

// Find a target object at a point and remove it from the structures
Remove(theTarget: number, thePnt: gp_XY): void;
Remove(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;
Remove(theTarget: number, thePnt: gp_XY): void;
Remove(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

// Inspect all targets in the cell corresponding to the given point
Inspect(thePnt: gp_XY, theInspector: BRepMesh_CircleInspector): void;
Inspect(thePntMin: gp_XY, thePntMax: gp_XY, theInspector: BRepMesh_CircleInspector): void;
Inspect(thePnt: gp_XY, theInspector: BRepMesh_CircleInspector): void;
Inspect(thePntMin: gp_XY, thePntMax: gp_XY, theInspector: BRepMesh_CircleInspector): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_DMapOfIFacePtrsListOfInteger: declare class IMeshData_DMapOfIFacePtrsListOfInteger extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_DMapOfIFacePtrsMapOfIEdgePtrs: declare class IMeshData_DMapOfIFacePtrsMapOfIEdgePtrs extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_DMapOfIntegerListOfInteger: declare class IMeshData_DMapOfIntegerListOfInteger extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_DMapOfShapeInteger: declare class IMeshData_DMapOfShapeInteger extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_IDMapOfIFacePtrsListOfIPCurves: declare class IMeshData_IDMapOfIFacePtrsListOfIPCurves extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_IDMapOfLink: declare class IMeshData_IDMapOfLink extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_IMapOfReal: declare class IMeshData_IMapOfReal extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_ListOfIPCurves: declare class IMeshData_ListOfIPCurves extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_ListOfInteger: declare class IMeshData_ListOfInteger extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_ListOfPnt2d: declare class IMeshData_ListOfPnt2d extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_MapOfIEdgePtr: declare class IMeshData_MapOfIEdgePtr extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_MapOfIFacePtr: declare class IMeshData_MapOfIFacePtr extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_MapOfInteger: declare class IMeshData_MapOfInteger extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_MapOfIntegerInteger: declare class IMeshData_MapOfIntegerInteger extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_MapOfOrientedEdges: declare class IMeshData_MapOfOrientedEdges extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template defining a class derived from the specified base class and {@link Standard_Transient`Standard_Transient`}, and supporting OCCT RTTI
IMeshData_MapOfReal: declare class IMeshData_MapOfReal extends Standard_Transient

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A data structure for sorting geometric objects (called targets) in n-dimensional space into cells, with associated algorithm for fast checking of coincidence (overlapping, intersection, etc.) with other objects (called here bullets)
IMeshData_VertexCellFilter: declare class IMeshData_VertexCellFilter

constructor

// Clear the data structures, set new cell size and allocator
Reset(theCellSize: number, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: NCollection_Array1_double, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: number, theAlloc: NCollection_IncAllocator): void;
Reset(theCellSize: NCollection_Array1_double, theAlloc: NCollection_IncAllocator): void;

// Adds a target object for further search at a point (into only one cell) Adds a target object for further search in the range of cells defined by two points (the first point must have all coordinates equal or less than the same coordinate of the second point)
Add(theTarget: number, thePnt: gp_XY): void;
Add(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;
Add(theTarget: number, thePnt: gp_XY): void;
Add(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

// Find a target object at a point and remove it from the structures
Remove(theTarget: number, thePnt: gp_XY): void;
Remove(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;
Remove(theTarget: number, thePnt: gp_XY): void;
Remove(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

// Inspect all targets in the cell corresponding to the given point
Inspect(thePnt: gp_XY, theInspector: BRepMesh_VertexInspector): void;
Inspect(thePntMin: gp_XY, thePntMax: gp_XY, theInspector: BRepMesh_VertexInspector): void;
Inspect(thePnt: gp_XY, theInspector: BRepMesh_VertexInspector): void;
Inspect(thePntMin: gp_XY, thePntMax: gp_XY, theInspector: BRepMesh_VertexInspector): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IMeshData_BndBox2dTreeFiller_ObjBnd: interface IMeshData_BndBox2dTreeFiller_ObjBnd

myObj: number

myBnd: Bnd_Box2d

IMeshData_VectorOfCircle: NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void

IMeshData_VectorOfVertex: NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void
