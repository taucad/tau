# libcascade — IGESSolid (2)

21 top-level symbols. Signatures are verbatim typescript.

IGESSolid_ToolSolidAssembly: declare class IGESSolid_ToolSolidAssembly

constructor

WriteOwnParams(ent: IGESSolid_SolidAssembly, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_SolidAssembly): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_SolidAssembly, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_SolidAssembly, entto: IGESSolid_SolidAssembly, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolSolidInstance: declare class IGESSolid_ToolSolidInstance

constructor

WriteOwnParams(ent: IGESSolid_SolidInstance, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_SolidInstance): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_SolidInstance, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_SolidInstance, entto: IGESSolid_SolidInstance, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolSolidOfLinearExtrusion: declare class IGESSolid_ToolSolidOfLinearExtrusion

constructor

WriteOwnParams(ent: IGESSolid_SolidOfLinearExtrusion, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_SolidOfLinearExtrusion): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_SolidOfLinearExtrusion, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_SolidOfLinearExtrusion, entto: IGESSolid_SolidOfLinearExtrusion, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolSolidOfRevolution: declare class IGESSolid_ToolSolidOfRevolution

constructor

WriteOwnParams(ent: IGESSolid_SolidOfRevolution, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_SolidOfRevolution): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_SolidOfRevolution, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_SolidOfRevolution, entto: IGESSolid_SolidOfRevolution, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolSphere: declare class IGESSolid_ToolSphere

constructor

WriteOwnParams(ent: IGESSolid_Sphere, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_Sphere): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_Sphere, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_Sphere, entto: IGESSolid_Sphere, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolSphericalSurface: declare class IGESSolid_ToolSphericalSurface

constructor

WriteOwnParams(ent: IGESSolid_SphericalSurface, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_SphericalSurface): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_SphericalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_SphericalSurface, entto: IGESSolid_SphericalSurface, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolToroidalSurface: declare class IGESSolid_ToolToroidalSurface

constructor

WriteOwnParams(ent: IGESSolid_ToroidalSurface, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_ToroidalSurface): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_ToroidalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_ToroidalSurface, entto: IGESSolid_ToroidalSurface, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolTorus: declare class IGESSolid_ToolTorus

constructor

WriteOwnParams(ent: IGESSolid_Torus, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_Torus): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_Torus, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_Torus, entto: IGESSolid_Torus, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolVertexList: declare class IGESSolid_ToolVertexList

constructor

WriteOwnParams(ent: IGESSolid_VertexList, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_VertexList): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_VertexList, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_VertexList, entto: IGESSolid_VertexList, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_TopoBuilder: declare class IGESSolid_TopoBuilder

constructor

Clear(): void;

AddVertex(val: gp_XYZ): void;

NbVertices(): number;

Vertex(num: number): gp_XYZ;

VertexList(): IGESSolid_VertexList;

AddEdge(curve: IGESData_IGESEntity, vstart: number, vend: number): void;

NbEdges(): number;

Edge(num: number, vstart?: number, vend?: number): { curve: IGESData_IGESEntity; vstart: number; vend: number; [Symbol.dispose](): void };

EdgeList(): IGESSolid_EdgeList;

MakeLoop(): void;

MakeEdge(edgetype: number, edge3d: number, orientation: number): void;

AddCurveUV(curve: IGESData_IGESEntity, iso: number): void;

EndEdge(): void;

MakeFace(surface: IGESData_IGESEntity): void;

SetOuter(): void;

AddInner(): void;

EndFace(orientation: number): void;

MakeShell(): void;

EndSimpleShell(): void;

SetMainShell(orientation: number): void;

AddVoidShell(orientation: number): void;

EndSolid(): void;

Shell(): IGESSolid_Shell;

Solid(): IGESSolid_ManifoldSolid;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToroidalSurface: declare class IGESSolid_ToroidalSurface extends IGESData_IGESEntity

constructor

Init(aCenter: IGESGeom_Point, anAxis: IGESGeom_Direction, majRadius: number, minRadius: number, Refdir: IGESGeom_Direction): void;

Center(): IGESGeom_Point;

TransformedCenter(): gp_Pnt;

Axis(): IGESGeom_Direction;

MajorRadius(): number;

MinorRadius(): number;

ReferenceDir(): IGESGeom_Direction;

IsParametrised(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_Torus: declare class IGESSolid_Torus extends IGESData_IGESEntity

constructor

Init(R1: number, R2: number, aPoint: gp_XYZ, anAxisdir: gp_XYZ): void;

MajorRadius(): number;

DiscRadius(): number;

AxisPoint(): gp_Pnt;

TransformedAxisPoint(): gp_Pnt;

Axis(): gp_Dir;

TransformedAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_VertexList: declare class IGESSolid_VertexList extends IGESData_IGESEntity

constructor

Init(vertices: NCollection_HArray1_gp_XYZ): void;

NbVertices(): number;

Vertex(num: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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
