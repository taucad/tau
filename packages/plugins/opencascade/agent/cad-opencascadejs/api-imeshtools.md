# libcascade — IMeshTools

11 top-level symbols. Signatures are verbatim typescript.

// Interface class representing context of BRepMesh algorithm
IMeshTools_Context: declare class IMeshTools_Context extends IMeshData_Shape

constructor

// Builds model using assigned model builder
BuildModel(): boolean;

// Performs discretization of model edges using assigned edge discret algorithm
DiscretizeEdges(): boolean;

// Performs healing of discrete model built by `DiscretizeEdges()` method using assigned healing algorithm
HealModel(): boolean;

// Performs pre-processing of discrete model using assigned algorithm
PreProcessModel(): boolean;

// Performs meshing of faces of discrete model using assigned meshing algorithm
DiscretizeFaces(theRange: Message_ProgressRange): boolean;

// Performs post-processing of discrete model using assigned algorithm
PostProcessModel(): boolean;

// Cleans temporary context data
Clean(): void;

// Gets instance of a tool to be used to build discrete model
GetModelBuilder(): IMeshTools_ModelBuilder;

// Sets instance of a tool to be used to build discrete model
SetModelBuilder(theBuilder: IMeshTools_ModelBuilder): void;

// Gets instance of a tool to be used to discretize edges of a model
GetEdgeDiscret(): IMeshTools_ModelAlgo;

// Sets instance of a tool to be used to discretize edges of a model
SetEdgeDiscret(theEdgeDiscret: IMeshTools_ModelAlgo): void;

// Gets instance of a tool to be used to heal discrete model
GetModelHealer(): IMeshTools_ModelAlgo;

// Sets instance of a tool to be used to heal discrete model
SetModelHealer(theModelHealer: IMeshTools_ModelAlgo): void;

// Gets instance of pre-processing algorithm
GetPreProcessor(): IMeshTools_ModelAlgo;

// Sets instance of pre-processing algorithm
SetPreProcessor(thePreProcessor: IMeshTools_ModelAlgo): void;

// Gets instance of meshing algorithm
GetFaceDiscret(): IMeshTools_ModelAlgo;

// Sets instance of meshing algorithm
SetFaceDiscret(theFaceDiscret: IMeshTools_ModelAlgo): void;

// Gets instance of post-processing algorithm
GetPostProcessor(): IMeshTools_ModelAlgo;

// Sets instance of post-processing algorithm
SetPostProcessor(thePostProcessor: IMeshTools_ModelAlgo): void;

// Gets parameters to be used for meshing
GetParameters(): IMeshTools_Parameters;

// Gets reference to parameters to be used for meshing
ChangeParameters(): IMeshTools_Parameters;

// Returns discrete model of a shape
GetModel(): IMeshData_Model;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface class providing API for edge tessellation tools
IMeshTools_CurveTessellator: declare class IMeshTools_CurveTessellator extends Standard_Transient

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

// Interface class providing API for algorithms intended to create mesh for discrete face
IMeshTools_MeshAlgo: declare class IMeshTools_MeshAlgo extends Standard_Transient

// Performs processing of the given face
Perform(theDFace: unknown, theParameters: IMeshTools_Parameters, theRange: Message_ProgressRange): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Base interface for factories producing instances of triangulation algorithms taking into account type of surface of target face
IMeshTools_MeshAlgoFactory: declare class IMeshTools_MeshAlgoFactory extends Standard_Transient

// Creates instance of meshing algorithm for the given type of surface
GetAlgo(theSurfaceType: GeomAbs_SurfaceType, theParameters: IMeshTools_Parameters): IMeshTools_MeshAlgo;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumerates built-in meshing algorithms factories implementing {@link IMeshTools_MeshAlgoFactory`IMeshTools_MeshAlgoFactory`} interface
IMeshTools_MeshAlgoType: typeof IMeshTools_MeshAlgoType[keyof typeof IMeshTools_MeshAlgoType]

// Builds mesh for each face of shape without triangulation
IMeshTools_MeshBuilder: declare class IMeshTools_MeshBuilder extends Message_Algorithm

constructor

// Sets context for algorithm
SetContext(theContext: IMeshTools_Context): void;

// Gets context of algorithm
GetContext(): IMeshTools_Context;

// Performs meshing to the shape using current context
Perform(theRange: Message_ProgressRange): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface class providing API for algorithms intended to update or modify discrete model
IMeshTools_ModelAlgo: declare class IMeshTools_ModelAlgo extends Standard_Transient

// Exceptions protected processing of the given model
Perform(theModel: IMeshData_Model, theParameters: IMeshTools_Parameters, theRange: Message_ProgressRange): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface class represents API for tool building discrete model
IMeshTools_ModelBuilder: declare class IMeshTools_ModelBuilder extends Message_Algorithm

// Exceptions protected method to create discrete model for the given shape
Perform(theShape: TopoDS_Shape, theParameters: IMeshTools_Parameters): IMeshData_Model;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Structure storing meshing parameters
IMeshTools_Parameters: declare class IMeshTools_Parameters

constructor

MeshAlgo: IMeshTools_MeshAlgoType

Angle: number

Deflection: number

AngleInterior: number

DeflectionInterior: number

MinSize: number

InParallel: boolean

Relative: boolean

InternalVerticesMode: boolean

ControlSurfaceDeflection: boolean

EnableControlSurfaceDeflectionAllSurfaces: boolean

CleanModel: boolean

AdjustMinSize: boolean

ForceFaceDeflection: boolean

AllowQualityDecrease: boolean

// Returns factor used to compute default value of MinSize (minimum mesh edge length) from deflection
static RelMinSize(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Explores {@link TopoDS_Shape`TopoDS_Shape`} for parts to be meshed - faces and free edges
IMeshTools_ShapeExplorer: declare class IMeshTools_ShapeExplorer extends IMeshData_Shape

constructor

// Starts exploring of a shape
Accept(theVisitor: IMeshTools_ShapeVisitor): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface class for shape visitor
IMeshTools_ShapeVisitor: declare class IMeshTools_ShapeVisitor extends Standard_Transient

// Handles {@link TopoDS_Face`TopoDS_Face`} object
Visit(theFace: TopoDS_Face): void;
Visit(theEdge: TopoDS_Edge): void;
Visit(theFace: TopoDS_Face): void;
Visit(theEdge: TopoDS_Edge): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
