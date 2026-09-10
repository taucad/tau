# libcascade — IGESSolid (3)

12 top-level symbols. Signatures are verbatim typescript.

// This class manages the creation of an IGES Topologic entity (BREP
IGESSolid_TopoBuilder: declare class IGESSolid_TopoBuilder

constructor

// Resets the TopoBuilder for an entirely new operation (with a new EdgeList, a new VertexList, new Shells, ...)
Clear(): void;

// Adds a Vertex to the VertexList
AddVertex(val: gp_XYZ): void;

// Returns the count of already recorded Vertices
NbVertices(): number;

// Returns a Vertex, given its rank
Vertex(num: number): gp_XYZ;

// Returns the VertexList
VertexList(): IGESSolid_VertexList;

// Adds an Edge (3D) to the EdgeList, defined by a Curve and two number of Vertex, for start and end
AddEdge(curve: IGESData_IGESEntity, vstart: number, vend: number): void;

// Returns the count of recorded Edges (3D)
NbEdges(): number;

// Returns the definition of an Edge (3D) given its rank
Edge(num: number, vstart?: number, vend?: number): { curve: IGESData_IGESEntity; vstart: number; vend: number; [Symbol.dispose](): void };

// Returns the EdgeList
EdgeList(): IGESSolid_EdgeList;

// Begins the definition of a new Loop
MakeLoop(): void;

// Defines an Edge(UV), to be added in the current Loop by EndEdge <edgetype> gives the type of the edge <edge3d> identifies the Edge(3D) used as support The EdgeList is always the current one <orientation gives the orientation flag It is then necessary to
MakeEdge(edgetype: number, edge3d: number, orientation: number): void;

// Adds a Parametric Curve (UV) to the current Edge(UV)
AddCurveUV(curve: IGESData_IGESEntity, iso: number): void;

// Closes the definition of an Edge(UV) and adds it to the current Loop
EndEdge(): void;

// Begins the definition of a new Face, on a surface All Loops defined by MakeLoop will be added in it, according the closing call
MakeFace(surface: IGESData_IGESEntity): void;

// Closes the current Loop and sets it Loop as Outer Loop
SetOuter(): void;

// Closes the current Loop and adds it to the list of Inner Loops for the current Face
AddInner(): void;

// Closes the definition of the current Face, fills it and adds it to the current Shell with an orientation flag (0/1)
EndFace(orientation: number): void;

// Begins the definition of a new Shell (either Simple or in a Solid)
MakeShell(): void;

// Closes the whole definition as that of a simple Shell
EndSimpleShell(): void;

// Closes the definition of the current Shell as for the Main Shell of a Solid, with an orientation flag (0/1)
SetMainShell(orientation: number): void;

// Closes the definition of the current Shell and adds it to the list of Void Shells of a Solid, with an orientation flag (0/1)
AddVoidShell(orientation: number): void;

// Closes the whole definition as that of a ManifoldSolid Its call is exclusive from that of EndSimpleShell
EndSolid(): void;

// Returns the current Shell
Shell(): IGESSolid_Shell;

// Returns the current ManifoldSolid
Solid(): IGESSolid_ManifoldSolid;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ToroidalSurface, Type <198> Form Number <0,1> in package {@link IGESSolid`IGESSolid`} This entity is defined by the center point, the axis direction and the major and minor radii
IGESSolid_ToroidalSurface: declare class IGESSolid_ToroidalSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ToroidalSurface
Init(aCenter: IGESGeom_Point, anAxis: IGESGeom_Direction, majRadius: number, minRadius: number, Refdir: IGESGeom_Direction): void;

// returns the center point coordinates of the surface
Center(): IGESGeom_Point;

// returns the center point coordinates of the surface after applying TransformationMatrix
TransformedCenter(): gp_Pnt;

// returns the direction of the axis
Axis(): IGESGeom_Direction;

// returns the major radius of the surface
MajorRadius(): number;

// returns the minor radius of the surface
MinorRadius(): number;

// returns the reference direction (parametrised surface) Null is returned if the surface is not parametrised
ReferenceDir(): IGESGeom_Direction;

// Returns True if the surface is parametrised, else False
IsParametrised(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Torus, Type <160> Form Number <0> in package {@link IGESSolid`IGESSolid`} A Torus is a solid formed by revolving a circular disc about a specified coplanar axis
IGESSolid_Torus: declare class IGESSolid_Torus extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Torus
Init(R1: number, R2: number, aPoint: gp_XYZ, anAxisdir: gp_XYZ): void;

// returns the distance from the center of torus to the center of the disc to be revolved
MajorRadius(): number;

// returns the radius of the disc to be revolved
DiscRadius(): number;

// returns the center of torus
AxisPoint(): gp_Pnt;

// returns the center of torus after applying TransformationMatrix
TransformedAxisPoint(): gp_Pnt;

// returns direction of the axis
Axis(): gp_Dir;

// returns direction of the axis after applying TransformationMatrix
TransformedAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines VertexList, Type <502> Form Number <1> in package {@link IGESSolid`IGESSolid`} A vertex is a point in R3
IGESSolid_VertexList: declare class IGESSolid_VertexList extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class VertexList
Init(vertices: NCollection_HArray1_gp_XYZ): void;

// return the number of vertices in the list
NbVertices(): number;

// returns the num'th vertex in the list raises exception if num <= 0 or num > `NbVertices()`
Vertex(num: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESSolid_Array1OfFace: NCollection_Array1_handle_IGESSolid_Face

IGESSolid_Array1OfLoop: NCollection_Array1_handle_IGESSolid_Loop

IGESSolid_Array1OfShell: NCollection_Array1_handle_IGESSolid_Shell

IGESSolid_Array1OfVertexList: NCollection_Array1_handle_IGESSolid_VertexList

IGESSolid_HArray1OfFace: NCollection_HArray1_handle_IGESSolid_Face

IGESSolid_HArray1OfLoop: NCollection_HArray1_handle_IGESSolid_Loop

IGESSolid_HArray1OfShell: NCollection_HArray1_handle_IGESSolid_Shell

IGESSolid_HArray1OfVertexList: NCollection_HArray1_handle_IGESSolid_VertexList
