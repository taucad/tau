# libcascade — BRepMesh

32 top-level symbols. Signatures are verbatim typescript.

// Class provides base functionality for algorithms building face triangulation
BRepMesh_BaseMeshAlgo: declare class BRepMesh_BaseMeshAlgo extends IMeshTools_MeshAlgo

// Performs processing of the given face
Perform(theDFace: unknown, theParameters: IMeshTools_Parameters, theRange?: Message_ProgressRange): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class extending UV range splitter in order to generate internal nodes for NURBS surface
BRepMesh_BoundaryParamsRangeSplitter: declare class BRepMesh_BoundaryParamsRangeSplitter extends BRepMesh_NURBSRangeSplitter

constructor

// Registers border point
AddPoint(thePoint: gp_Pnt2d): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a 2d circle with a size of only 3 double numbers instead of gp who needs 7 double numbers
BRepMesh_Circle: declare class BRepMesh_Circle

constructor

// Sets location of a circle
SetLocation(theLocation: gp_XY): void;
// theLocation: location of a circle

// Sets radius of a circle
SetRadius(theRadius: number): void;
// theRadius: radius of a circle

// Returns location of a circle
Location(): gp_XY;

// Returns radius of a circle
Radius(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class to find circles shot by the given point
BRepMesh_CircleInspector: declare class BRepMesh_CircleInspector

constructor

static Coord(i: number, thePnt: gp_XY): number;

static Shift(thePnt: gp_XY, theTol: number): gp_XY;

// Adds the circle to vector of circles at the given position
Bind(theIndex: number, theCircle: BRepMesh_Circle): void;
// theIndex: position of circle in the vector
// theCircle: circle to be added

// Resutns vector of registered circles
Circles(): VectorOfCircle;

// Returns circle with the given index
Circle(theIndex: number): BRepMesh_Circle;
// theIndex: index of circle

// Set reference point to be checked
SetPoint(thePoint: gp_XY): void;
// thePoint: bullet point

// Returns list of circles shot by the reference point
GetShotCircles(): unknown;

// Performs inspection of a circle with the given index
Inspect(theTargetIndex: number): NCollection_CellFilter_Action;
// theTargetIndex: index of a circle to be checked

// Checks indices for equality
static IsEqual(theIndex: number, theTargetIndex: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Create sort and destroy the circles used in triangulation
BRepMesh_CircleTool: declare class BRepMesh_CircleTool

constructor

// Initializes the tool
Init(argNo0: number): void;

// Sets new size for cell filter
SetCellSize(theSize: number): void;
SetCellSize(theSizeX: number, theSizeY: number): void;
SetCellSize(theSize: number): void;
SetCellSize(theSizeX: number, theSizeY: number): void;
// theSize: cell size to be set for X and Y dimensions

// Sets limits of inspection area
SetMinMaxSize(theMin: gp_XY, theMax: gp_XY): void;
// theMin: bottom left corner of inspection area
// theMax: top right corner of inspection area

// Returns true if cell filter contains no circle
IsEmpty(): boolean;

// Binds the circle to the tool
Bind(theIndex: number, theCircle: gp_Circ2d): void;
Bind(theIndex: number, thePoint1: gp_XY, thePoint2: gp_XY, thePoint3: gp_XY): boolean;
Bind(theIndex: number, theCircle: gp_Circ2d): void;
Bind(theIndex: number, thePoint1: gp_XY, thePoint2: gp_XY, thePoint3: gp_XY): boolean;
// theIndex: index a circle should be bound with
// theCircle: circle to be bound

// Computes circle on three points
static MakeCircle(thePoint1: gp_XY, thePoint2: gp_XY, thePoint3: gp_XY, theLocation: gp_XY, theRadius?: number): { returnValue: boolean; theRadius: number };
// thePoint1: first point
// thePoint2: second point
// thePoint3: third point
// theLocation: center of computed circle
// theRadius: radius of computed circle

// Binds implicit zero circle
MocBind(theIndex: number): void;
// theIndex: index a zero circle should be bound with

// Deletes a circle from the tool
Delete(theIndex: number): void;
// theIndex: index of a circle to be removed

// Select the circles shot by the given point
Select(thePoint: gp_XY): unknown;
// thePoint: bullet point

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class intended for classification of points regarding internals of discrete face
BRepMesh_Classifier: declare class BRepMesh_Classifier extends Standard_Transient

constructor

// Performs classification of the given point regarding to face internals
Perform(thePoint: gp_Pnt2d): TopAbs_State;
// thePoint: Point in parametric space to be classified

// Registers wire specified by sequence of points for further classification of points
RegisterWire(theWire: NCollection_Sequence_gp_Pnt2d, theTolUV: [number, number], theRangeU: [number, number], theRangeV: [number, number]): void;
// theWire: Wire to be registered
// theTolUV: Tolerance to be used for calculations in parametric space

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class extending default range splitter in order to generate internal nodes for conical surface
BRepMesh_ConeRangeSplitter: declare class BRepMesh_ConeRangeSplitter extends BRepMesh_DefaultRangeSplitter

constructor

// Returns split intervals along U and V direction
GetSplitSteps(theParameters: IMeshTools_Parameters, theStepsNb: [number, number]): [number, number];
// theParameters: meshing parameters
// theStepsNb: number of steps along corresponding direction

// Returns list of nodes generated using surface data and specified parameters
GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class provides base functionality to build face triangulation using Dealunay approach
BRepMesh_ConstrainedBaseMeshAlgo: declare class BRepMesh_ConstrainedBaseMeshAlgo extends BRepMesh_BaseMeshAlgo

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class implementing default context of BRepMesh algorithm
BRepMesh_Context: declare class BRepMesh_Context extends IMeshTools_Context

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class performing tessellation of passed edge according to specified parameters
BRepMesh_CurveTessellator: declare class BRepMesh_CurveTessellator extends IMeshTools_CurveTessellator

constructor

// Returns number of tessellation points
PointsNb(): number;

// Returns parameters of solution with the given index
Value(theIndex: number, thePoint: gp_Pnt, theParameter: number): { returnValue: boolean; theParameter: number };
// theIndex: index of tessellation point
// thePoint: tessellation point
// theParameter: parameters on PCurve corresponded to the solution

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class provides base functionality to build face triangulation using custom triangulation algorithm
BRepMesh_CustomBaseMeshAlgo: declare class BRepMesh_CustomBaseMeshAlgo extends BRepMesh_ConstrainedBaseMeshAlgo

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class extending default range splitter in order to generate internal nodes for cylindrical surface
BRepMesh_CylinderRangeSplitter: declare class BRepMesh_CylinderRangeSplitter extends BRepMesh_DefaultRangeSplitter

constructor

// Resets this splitter
Reset(theDFace: unknown, theParameters: IMeshTools_Parameters): void;

// Returns list of nodes generated using surface data and specified parameters
GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes the data structure necessary for the mesh algorithms in two dimensions plane or on surface by meshing in UV space
BRepMesh_DataStructureOfDelaun: declare class BRepMesh_DataStructureOfDelaun extends Standard_Transient

constructor

NbNodes(): number;

AddNode(theNode: BRepMesh_Vertex, isForceAdd?: boolean): number;

IndexOf(theNode: BRepMesh_Vertex): number;
IndexOf(theLink: BRepMesh_Edge): number;
IndexOf(theNode: BRepMesh_Vertex): number;
IndexOf(theLink: BRepMesh_Edge): number;

GetNode(theIndex: number): BRepMesh_Vertex;

SubstituteNode(theIndex: number, theNewNode: BRepMesh_Vertex): boolean;

RemoveNode(theIndex: number, isForce?: boolean): void;

LinksConnectedTo(theIndex: number): unknown;

NbLinks(): number;

AddLink(theLink: BRepMesh_Edge): number;

GetLink(theIndex: number): BRepMesh_Edge;

LinksOfDomain(): unknown;

SubstituteLink(theIndex: number, theNewLink: BRepMesh_Edge): boolean;

RemoveLink(theIndex: number, isForce?: boolean): void;

ElementsConnectedTo(theLinkIndex: number): BRepMesh_PairOfIndex;

NbElements(): number;

ElementsOfDomain(): unknown;

RemoveElement(theIndex: number): void;

Dump(theFileNameStr: string): void;

Allocator(): NCollection_IncAllocator;

Data(): BRepMesh_VertexTool;

ClearDomain(): void;

ClearDeleted(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Default tool to define range of discrete face model and obtain grid points distributed within this range
BRepMesh_DefaultRangeSplitter: declare class BRepMesh_DefaultRangeSplitter

constructor

// Resets this splitter
Reset(theDFace: unknown, theParameters: IMeshTools_Parameters): void;

// Registers border point
AddPoint(thePoint: gp_Pnt2d): void;

// Updates discrete range of surface according to its geometric range
AdjustRange(): void;

// Returns True if computed range is valid
IsValid(): boolean;

// Scales the given point from real parametric space to face basis and otherwise
Scale(thePoint: gp_Pnt2d, isToFaceBasis: boolean): gp_Pnt2d;
// thePoint: point to be scaled
// isToFaceBasis: if TRUE converts point to face basis, otherwise performs reverse conversion

// Returns list of nodes generated using surface data and specified parameters
GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

// Returns point in 3d space corresponded to the given point defined in parametric space of surface
Point(thePoint2d: gp_Pnt2d): gp_Pnt;

// Returns face model
GetDFace(): unknown;

// Returns surface
GetSurface(): BRepAdaptor_Surface;

// Returns U range
GetRangeU(): [number, number];

// Returns V range
GetRangeV(): [number, number];

// Returns delta
GetDelta(): [number, number];

GetToleranceUV(): [number, number];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary tool encompassing methods to compute deflection of shapes
BRepMesh_Deflection: declare class BRepMesh_Deflection extends Standard_Transient

constructor

// Returns absolute deflection for theShape with respect to the relative deflection and theMaxShapeSize
static ComputeAbsoluteDeflection(theShape: TopoDS_Shape, theRelativeDeflection: number, theMaxShapeSize: number): number;
// theShape: shape for that the deflection should be computed
// theRelativeDeflection: relative deflection
// theMaxShapeSize: maximum size of the whole shape

// Computes and updates deflection of the given discrete wire
static ComputeDeflection(theDWire: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDFace: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDEdge: unknown, theMaxShapeSize: number, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDWire: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDFace: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDEdge: unknown, theMaxShapeSize: number, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDWire: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDFace: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDEdge: unknown, theMaxShapeSize: number, theParameters: IMeshTools_Parameters): void;

// Checks if the deflection of current polygonal representation is consistent with the required deflection
static IsConsistent(theCurrent: number, theRequired: number, theAllowDecrease: boolean, theRatio?: number): boolean;
// theCurrent: Current deflection
// theRequired: Required deflection
// theAllowDecrease: Flag controlling the check
// theRatio: The ratio for comparison of the deflections (value from 0 to 1)

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepMesh_DegreeOfFreedom: typeof BRepMesh_DegreeOfFreedom[keyof typeof BRepMesh_DegreeOfFreedom]

// Class provides base functionality to build face triangulation using Delabella project
BRepMesh_DelabellaBaseMeshAlgo: declare class BRepMesh_DelabellaBaseMeshAlgo extends BRepMesh_CustomBaseMeshAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implementation of {@link IMeshTools_MeshAlgoFactory`IMeshTools_MeshAlgoFactory`} providing Delabella-based algorithms of different complexity depending on type of target surface
BRepMesh_DelabellaMeshAlgoFactory: declare class BRepMesh_DelabellaMeshAlgoFactory extends IMeshTools_MeshAlgoFactory

constructor

// Creates instance of meshing algorithm for the given type of surface
GetAlgo(theSurfaceType: GeomAbs_SurfaceType, theParameters: IMeshTools_Parameters): IMeshTools_MeshAlgo;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class provides base functionality to build face triangulation using Dealunay approach
BRepMesh_DelaunayBaseMeshAlgo: declare class BRepMesh_DelaunayBaseMeshAlgo extends BRepMesh_ConstrainedBaseMeshAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Abstract factory for creating meshing algorithms
BRepMesh_DiscretAlgoFactory: declare class BRepMesh_DiscretAlgoFactory extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Registers a factory in the global registry
static RegisterFactory(theFactory: BRepMesh_DiscretAlgoFactory, theIsPreferred?: boolean): void;
// theFactory: factory to register
// theIsPreferred: if TRUE, add to the beginning of the list (making it default), otherwise add to the end

// Unregisters a factory by name
static UnregisterFactory(theName: TCollection_AsciiString): void;
// theName: name of the factory to unregister

// Returns the default (first registered) factory, or NULL if none registered
static DefaultFactory(): BRepMesh_DiscretAlgoFactory;

// Finds a factory by name
static FindFactory(theName: TCollection_AsciiString): BRepMesh_DiscretAlgoFactory;
// theName: name of the factory to find

// Returns the global list of registered factories
static Factories(): NCollection_List_handle_BRepMesh_DiscretAlgoFactory;

// Creates a new meshing algorithm instance
CreateAlgorithm(theShape: TopoDS_Shape, theLinDeflection: number, theAngDeflection: number): BRepMesh_DiscretRoot;
// theShape: shape to be meshed
// theLinDeflection: linear deflection for meshing
// theAngDeflection: angular deflection for meshing

// Returns the factory name
Name(): TCollection_AsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Factory for retrieving triangulation algorithms
BRepMesh_DiscretFactory: declare class BRepMesh_DiscretFactory

// Returns the global factory instance
static Get(): BRepMesh_DiscretFactory;

// Setup meshing algorithm by name
SetDefaultName(theName: TCollection_AsciiString): boolean;
// theName: name of the algorithm to use

// Returns name of current meshing algorithm
DefaultName(): TCollection_AsciiString;

// Returns triangulation algorithm instance
Discret(theShape: TopoDS_Shape, theLinDeflection: number, theAngDeflection: number): BRepMesh_DiscretRoot;
// theShape: shape to be meshed
// theLinDeflection: linear deflection to be used for meshing
// theAngDeflection: angular deflection to be used for meshing

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This is a common interface for meshing algorithms instantiated by Mesh Factory and implemented by plugins
BRepMesh_DiscretRoot: declare class BRepMesh_DiscretRoot extends Standard_Transient

// Set the shape to triangulate
SetShape(theShape: TopoDS_Shape): void;

Shape(): TopoDS_Shape;

// Returns true if triangualtion was performed and has success
IsDone(): boolean;

// Compute triangulation for set shape
Perform(theRange?: Message_ProgressRange): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Light weighted structure representing link of the mesh
BRepMesh_Edge: declare class BRepMesh_Edge extends BRepMesh_OrientedEdge

constructor

// Returns movability flag of the Link
Movability(): BRepMesh_DegreeOfFreedom;

// Sets movability flag of the Link
SetMovability(theMovability: BRepMesh_DegreeOfFreedom): void;
// theMovability: flag to be set

// Checks if the given edge and this one have the same orientation
IsSameOrientation(theOther: BRepMesh_Edge): boolean;
// theOther: edge to be checked against this one

// Checks for equality with another edge
IsEqual(theOther: BRepMesh_Edge): boolean;
IsEqual(theOther: BRepMesh_OrientedEdge): boolean;
IsEqual(theOther: BRepMesh_Edge): boolean;
IsEqual(theOther: BRepMesh_OrientedEdge): boolean;
// theOther: edge to be checked against this one

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class implements functionality of edge discret tool
BRepMesh_EdgeDiscret: declare class BRepMesh_EdgeDiscret extends IMeshTools_ModelAlgo

constructor

// Creates instance of free edge tessellator
static CreateEdgeTessellator(theDEdge: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb: number): IMeshTools_CurveTessellator;
static CreateEdgeTessellator(theDEdge: unknown, theOrientation: TopAbs_Orientation, theDFace: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb: number): IMeshTools_CurveTessellator;
static CreateEdgeTessellator(theDEdge: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb: number): IMeshTools_CurveTessellator;
static CreateEdgeTessellator(theDEdge: unknown, theOrientation: TopAbs_Orientation, theDFace: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb: number): IMeshTools_CurveTessellator;

// Creates instance of tessellation extractor
static CreateEdgeTessellationExtractor(theDEdge: unknown, theDFace: unknown): IMeshTools_CurveTessellator;

// Updates 3d discrete edge model using the given tessellation tool
static Tessellate3d(theDEdge: unknown, theTessellator: IMeshTools_CurveTessellator, theUpdateEnds: boolean): void;

// Updates 2d discrete edge model using tessellation of 3D curve
static Tessellate2d(theDEdge: unknown, theUpdateEnds: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class implements functionality retrieving tessellated representation of an edge stored in polygon
BRepMesh_EdgeTessellationExtractor: declare class BRepMesh_EdgeTessellationExtractor extends IMeshTools_CurveTessellator

constructor

// Returns number of tessellation points
PointsNb(): number;

// Returns parameters of solution with the given index
Value(theIndex: number, thePoint: gp_Pnt, theParameter: number): { returnValue: boolean; theParameter: number };
// theIndex: index of tessellation point
// thePoint: tessellation point
// theParameter: parameters on PCurve corresponded to the solution

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class analysing extrusion surface in order to generate internal nodes
BRepMesh_ExtrusionRangeSplitter: declare class BRepMesh_ExtrusionRangeSplitter extends BRepMesh_NURBSRangeSplitter

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class checking wires of target face for self-intersections
BRepMesh_FaceChecker: declare class BRepMesh_FaceChecker extends Standard_Transient

constructor

Perform(): boolean;

GetIntersectingEdges(): any;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class implements functionality starting triangulation of model's faces
BRepMesh_FaceDiscret: declare class BRepMesh_FaceDiscret extends IMeshTools_ModelAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepMesh_FastDiscret: declare class BRepMesh_FastDiscret

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool class accumulating common geometrical functions as well as functionality using shape geometry to produce data necessary for tessellation
BRepMesh_GeomTool: declare class BRepMesh_GeomTool

constructor

// Adds point to already calculated points (or replaces existing)
AddPoint(thePoint: gp_Pnt, theParam: number, theIsReplace?: boolean): number;
// thePoint: point to be added
// theParam: parameter on the curve corresponding to the given point
// theIsReplace: if TRUE replaces existing point lying within parametric tolerance of the given point

// Returns number of discretization points
NbPoints(): number;

// Gets parameters of discretization point with the given index
Value(theIndex: number, theIsoParam: number, theParam: number, thePoint: gp_Pnt, theUV: gp_Pnt2d): { returnValue: boolean; theParam: number };
Value(theIndex: number, theSurface: BRepAdaptor_Surface, theParam: number, thePoint: gp_Pnt, theUV: gp_Pnt2d): { returnValue: boolean; theParam: number };
Value(theIndex: number, theIsoParam: number, theParam: number, thePoint: gp_Pnt, theUV: gp_Pnt2d): { returnValue: boolean; theParam: number };
Value(theIndex: number, theSurface: BRepAdaptor_Surface, theParam: number, thePoint: gp_Pnt, theUV: gp_Pnt2d): { returnValue: boolean; theParam: number };
// theIndex: index of discretization point
// theIsoParam: parameter on surface to be used as second coordinate of resulting 2d point
// theParam: parameter of the point on the iso curve
// thePoint: discretization point
// theUV: discretization point in parametric space of the surface

static Normal(theSurface: BRepAdaptor_Surface, theParamU: number, theParamV: number, thePoint: gp_Pnt, theNormal: gp_Dir): boolean;

static IntLinLin(theStartPnt1: gp_XY, theEndPnt1: gp_XY, theStartPnt2: gp_XY, theEndPnt2: gp_XY, theIntPnt: gp_XY, theParamOnSegment: [number, number]): BRepMesh_GeomTool_IntFlag;

static IntSegSeg(theStartPnt1: gp_XY, theEndPnt1: gp_XY, theStartPnt2: gp_XY, theEndPnt2: gp_XY, isConsiderEndPointTouch: boolean, isConsiderPointOnSegment: boolean, theIntPnt: gp_Pnt2d): BRepMesh_GeomTool_IntFlag;

static SquareDeflectionOfSegment(theFirstPoint: gp_Pnt, theLastPoint: gp_Pnt, theMidPoint: gp_Pnt): number;

static CellsCount(theSurface: Adaptor3d_Surface, theVerticesNb: number, theDeflection: number, theRangeSplitter: BRepMesh_DefaultRangeSplitter): [number, number];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumerates states of segments intersection check
BRepMesh_GeomTool_IntFlag: typeof BRepMesh_GeomTool_IntFlag[keyof typeof BRepMesh_GeomTool_IntFlag]

// Builds the mesh of a shape with respect of their correctly triangulated parts
BRepMesh_IncrementalMesh: declare class BRepMesh_IncrementalMesh extends BRepMesh_DiscretRoot

constructor

// Compute triangulation for set shape
Perform(theRange: Message_ProgressRange): void;
Perform(theContext: IMeshTools_Context, theRange: Message_ProgressRange): void;
Perform(theRange: Message_ProgressRange): void;
Perform(theContext: IMeshTools_Context, theRange: Message_ProgressRange): void;

Parameters(): IMeshTools_Parameters;

ChangeParameters(): IMeshTools_Parameters;

IsModified(): boolean;

GetStatusFlags(): number;

static IsParallelDefault(): boolean;

static SetParallelDefault(isInParallel: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
