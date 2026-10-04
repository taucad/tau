# libcascade — IGESSolid (2)

22 top-level symbols. Signatures are verbatim typescript.

IGESSolid_ToolShell: declare class IGESSolid_ToolShell

  // IGESSolid_ToolShell.constructor (constructor)
  constructor();

  // IGESSolid_ToolShell.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_Shell, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolShell.DirChecker (method)
  DirChecker(ent: IGESSolid_Shell): IGESData_DirChecker;

  // IGESSolid_ToolShell.OwnCheck (method)
  OwnCheck(ent: IGESSolid_Shell, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolShell.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_Shell, entto: IGESSolid_Shell, TC: Interface_CopyTool): void;

  // IGESSolid_ToolShell.delete (method)
  delete(): void;

  // IGESSolid_ToolShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolSolidAssembly: declare class IGESSolid_ToolSolidAssembly

  // IGESSolid_ToolSolidAssembly.constructor (constructor)
  constructor();

  // IGESSolid_ToolSolidAssembly.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_SolidAssembly, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolSolidAssembly.DirChecker (method)
  DirChecker(ent: IGESSolid_SolidAssembly): IGESData_DirChecker;

  // IGESSolid_ToolSolidAssembly.OwnCheck (method)
  OwnCheck(ent: IGESSolid_SolidAssembly, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolSolidAssembly.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_SolidAssembly, entto: IGESSolid_SolidAssembly, TC: Interface_CopyTool): void;

  // IGESSolid_ToolSolidAssembly.delete (method)
  delete(): void;

  // IGESSolid_ToolSolidAssembly.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolSolidInstance: declare class IGESSolid_ToolSolidInstance

  // IGESSolid_ToolSolidInstance.constructor (constructor)
  constructor();

  // IGESSolid_ToolSolidInstance.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_SolidInstance, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolSolidInstance.DirChecker (method)
  DirChecker(ent: IGESSolid_SolidInstance): IGESData_DirChecker;

  // IGESSolid_ToolSolidInstance.OwnCheck (method)
  OwnCheck(ent: IGESSolid_SolidInstance, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolSolidInstance.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_SolidInstance, entto: IGESSolid_SolidInstance, TC: Interface_CopyTool): void;

  // IGESSolid_ToolSolidInstance.delete (method)
  delete(): void;

  // IGESSolid_ToolSolidInstance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolSolidOfLinearExtrusion: declare class IGESSolid_ToolSolidOfLinearExtrusion

  // IGESSolid_ToolSolidOfLinearExtrusion.constructor (constructor)
  constructor();

  // IGESSolid_ToolSolidOfLinearExtrusion.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_SolidOfLinearExtrusion, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolSolidOfLinearExtrusion.DirChecker (method)
  DirChecker(ent: IGESSolid_SolidOfLinearExtrusion): IGESData_DirChecker;

  // IGESSolid_ToolSolidOfLinearExtrusion.OwnCheck (method)
  OwnCheck(ent: IGESSolid_SolidOfLinearExtrusion, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolSolidOfLinearExtrusion.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_SolidOfLinearExtrusion, entto: IGESSolid_SolidOfLinearExtrusion, TC: Interface_CopyTool): void;

  // IGESSolid_ToolSolidOfLinearExtrusion.delete (method)
  delete(): void;

  // IGESSolid_ToolSolidOfLinearExtrusion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolSolidOfRevolution: declare class IGESSolid_ToolSolidOfRevolution

  // IGESSolid_ToolSolidOfRevolution.constructor (constructor)
  constructor();

  // IGESSolid_ToolSolidOfRevolution.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_SolidOfRevolution, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolSolidOfRevolution.DirChecker (method)
  DirChecker(ent: IGESSolid_SolidOfRevolution): IGESData_DirChecker;

  // IGESSolid_ToolSolidOfRevolution.OwnCheck (method)
  OwnCheck(ent: IGESSolid_SolidOfRevolution, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolSolidOfRevolution.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_SolidOfRevolution, entto: IGESSolid_SolidOfRevolution, TC: Interface_CopyTool): void;

  // IGESSolid_ToolSolidOfRevolution.delete (method)
  delete(): void;

  // IGESSolid_ToolSolidOfRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolSphere: declare class IGESSolid_ToolSphere

  // IGESSolid_ToolSphere.constructor (constructor)
  constructor();

  // IGESSolid_ToolSphere.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_Sphere, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolSphere.DirChecker (method)
  DirChecker(ent: IGESSolid_Sphere): IGESData_DirChecker;

  // IGESSolid_ToolSphere.OwnCheck (method)
  OwnCheck(ent: IGESSolid_Sphere, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolSphere.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_Sphere, entto: IGESSolid_Sphere, TC: Interface_CopyTool): void;

  // IGESSolid_ToolSphere.delete (method)
  delete(): void;

  // IGESSolid_ToolSphere.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolSphericalSurface: declare class IGESSolid_ToolSphericalSurface

  // IGESSolid_ToolSphericalSurface.constructor (constructor)
  constructor();

  // IGESSolid_ToolSphericalSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_SphericalSurface, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolSphericalSurface.DirChecker (method)
  DirChecker(ent: IGESSolid_SphericalSurface): IGESData_DirChecker;

  // IGESSolid_ToolSphericalSurface.OwnCheck (method)
  OwnCheck(ent: IGESSolid_SphericalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolSphericalSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_SphericalSurface, entto: IGESSolid_SphericalSurface, TC: Interface_CopyTool): void;

  // IGESSolid_ToolSphericalSurface.delete (method)
  delete(): void;

  // IGESSolid_ToolSphericalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolToroidalSurface: declare class IGESSolid_ToolToroidalSurface

  // IGESSolid_ToolToroidalSurface.constructor (constructor)
  constructor();

  // IGESSolid_ToolToroidalSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_ToroidalSurface, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolToroidalSurface.DirChecker (method)
  DirChecker(ent: IGESSolid_ToroidalSurface): IGESData_DirChecker;

  // IGESSolid_ToolToroidalSurface.OwnCheck (method)
  OwnCheck(ent: IGESSolid_ToroidalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolToroidalSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_ToroidalSurface, entto: IGESSolid_ToroidalSurface, TC: Interface_CopyTool): void;

  // IGESSolid_ToolToroidalSurface.delete (method)
  delete(): void;

  // IGESSolid_ToolToroidalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolTorus: declare class IGESSolid_ToolTorus

  // IGESSolid_ToolTorus.constructor (constructor)
  constructor();

  // IGESSolid_ToolTorus.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_Torus, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolTorus.DirChecker (method)
  DirChecker(ent: IGESSolid_Torus): IGESData_DirChecker;

  // IGESSolid_ToolTorus.OwnCheck (method)
  OwnCheck(ent: IGESSolid_Torus, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolTorus.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_Torus, entto: IGESSolid_Torus, TC: Interface_CopyTool): void;

  // IGESSolid_ToolTorus.delete (method)
  delete(): void;

  // IGESSolid_ToolTorus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolVertexList: declare class IGESSolid_ToolVertexList

  // IGESSolid_ToolVertexList.constructor (constructor)
  constructor();

  // IGESSolid_ToolVertexList.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_VertexList, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolVertexList.DirChecker (method)
  DirChecker(ent: IGESSolid_VertexList): IGESData_DirChecker;

  // IGESSolid_ToolVertexList.OwnCheck (method)
  OwnCheck(ent: IGESSolid_VertexList, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolVertexList.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_VertexList, entto: IGESSolid_VertexList, TC: Interface_CopyTool): void;

  // IGESSolid_ToolVertexList.delete (method)
  delete(): void;

  // IGESSolid_ToolVertexList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_TopoBuilder: declare class IGESSolid_TopoBuilder

  // IGESSolid_TopoBuilder.constructor (constructor)
  constructor();

  // IGESSolid_TopoBuilder.Clear (method)
  Clear(): void;

  // IGESSolid_TopoBuilder.AddVertex (method)
  AddVertex(val: gp_XYZ): void;

  // IGESSolid_TopoBuilder.NbVertices (method)
  NbVertices(): number;

  // IGESSolid_TopoBuilder.Vertex (method)
  Vertex(num: number): gp_XYZ;

  // IGESSolid_TopoBuilder.VertexList (method)
  VertexList(): IGESSolid_VertexList;

  // IGESSolid_TopoBuilder.AddEdge (method)
  AddEdge(curve: IGESData_IGESEntity, vstart: number, vend: number): void;

  // IGESSolid_TopoBuilder.NbEdges (method)
  NbEdges(): number;

  // IGESSolid_TopoBuilder.Edge (method)
  Edge(num: number, vstart?: number, vend?: number): { curve: IGESData_IGESEntity; vstart: number; vend: number; [Symbol.dispose](): void };

  // IGESSolid_TopoBuilder.EdgeList (method)
  EdgeList(): IGESSolid_EdgeList;

  // IGESSolid_TopoBuilder.MakeLoop (method)
  MakeLoop(): void;

  // IGESSolid_TopoBuilder.MakeEdge (method)
  MakeEdge(edgetype: number, edge3d: number, orientation: number): void;

  // IGESSolid_TopoBuilder.AddCurveUV (method)
  AddCurveUV(curve: IGESData_IGESEntity, iso: number): void;

  // IGESSolid_TopoBuilder.EndEdge (method)
  EndEdge(): void;

  // IGESSolid_TopoBuilder.MakeFace (method)
  MakeFace(surface: IGESData_IGESEntity): void;

  // IGESSolid_TopoBuilder.SetOuter (method)
  SetOuter(): void;

  // IGESSolid_TopoBuilder.AddInner (method)
  AddInner(): void;

  // IGESSolid_TopoBuilder.EndFace (method)
  EndFace(orientation: number): void;

  // IGESSolid_TopoBuilder.MakeShell (method)
  MakeShell(): void;

  // IGESSolid_TopoBuilder.EndSimpleShell (method)
  EndSimpleShell(): void;

  // IGESSolid_TopoBuilder.SetMainShell (method)
  SetMainShell(orientation: number): void;

  // IGESSolid_TopoBuilder.AddVoidShell (method)
  AddVoidShell(orientation: number): void;

  // IGESSolid_TopoBuilder.EndSolid (method)
  EndSolid(): void;

  // IGESSolid_TopoBuilder.Shell (method)
  Shell(): IGESSolid_Shell;

  // IGESSolid_TopoBuilder.Solid (method)
  Solid(): IGESSolid_ManifoldSolid;

  // IGESSolid_TopoBuilder.delete (method)
  delete(): void;

  // IGESSolid_TopoBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToroidalSurface: declare class IGESSolid_ToroidalSurface extends IGESData_IGESEntity

  // IGESSolid_ToroidalSurface.constructor (constructor)
  constructor();

  // IGESSolid_ToroidalSurface.Init (method)
  Init(aCenter: IGESGeom_Point, anAxis: IGESGeom_Direction, majRadius: number, minRadius: number, Refdir: IGESGeom_Direction): void;

  // IGESSolid_ToroidalSurface.Center (method)
  Center(): IGESGeom_Point;

  // IGESSolid_ToroidalSurface.TransformedCenter (method)
  TransformedCenter(): gp_Pnt;

  // IGESSolid_ToroidalSurface.Axis (method)
  Axis(): IGESGeom_Direction;

  // IGESSolid_ToroidalSurface.MajorRadius (method)
  MajorRadius(): number;

  // IGESSolid_ToroidalSurface.MinorRadius (method)
  MinorRadius(): number;

  // IGESSolid_ToroidalSurface.ReferenceDir (method)
  ReferenceDir(): IGESGeom_Direction;

  // IGESSolid_ToroidalSurface.IsParametrised (method)
  IsParametrised(): boolean;

  // IGESSolid_ToroidalSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_ToroidalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_ToroidalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_ToroidalSurface.delete (method)
  delete(): void;

  // IGESSolid_ToroidalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_Torus: declare class IGESSolid_Torus extends IGESData_IGESEntity

  // IGESSolid_Torus.constructor (constructor)
  constructor();

  // IGESSolid_Torus.Init (method)
  Init(R1: number, R2: number, aPoint: gp_XYZ, anAxisdir: gp_XYZ): void;

  // IGESSolid_Torus.MajorRadius (method)
  MajorRadius(): number;

  // IGESSolid_Torus.DiscRadius (method)
  DiscRadius(): number;

  // IGESSolid_Torus.AxisPoint (method)
  AxisPoint(): gp_Pnt;

  // IGESSolid_Torus.TransformedAxisPoint (method)
  TransformedAxisPoint(): gp_Pnt;

  // IGESSolid_Torus.Axis (method)
  Axis(): gp_Dir;

  // IGESSolid_Torus.TransformedAxis (method)
  TransformedAxis(): gp_Dir;

  // IGESSolid_Torus.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_Torus.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_Torus.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_Torus.delete (method)
  delete(): void;

  // IGESSolid_Torus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_VertexList: declare class IGESSolid_VertexList extends IGESData_IGESEntity

  // IGESSolid_VertexList.constructor (constructor)
  constructor();

  // IGESSolid_VertexList.Init (method)
  Init(vertices: NCollection_HArray1_gp_XYZ): void;

  // IGESSolid_VertexList.NbVertices (method)
  NbVertices(): number;

  // IGESSolid_VertexList.Vertex (method)
  Vertex(num: number): gp_Pnt;

  // IGESSolid_VertexList.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_VertexList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_VertexList.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_VertexList.delete (method)
  delete(): void;

  // IGESSolid_VertexList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_Array1OfFace: NCollection_Array1_handle_IGESSolid_Face

IGESSolid_Array1OfLoop: NCollection_Array1_handle_IGESSolid_Loop

IGESSolid_Array1OfShell: NCollection_Array1_handle_IGESSolid_Shell

IGESSolid_Array1OfVertexList: NCollection_Array1_handle_IGESSolid_VertexList

IGESSolid_HArray1OfFace: NCollection_HArray1_handle_IGESSolid_Face

IGESSolid_HArray1OfLoop: NCollection_HArray1_handle_IGESSolid_Loop

IGESSolid_HArray1OfShell: NCollection_HArray1_handle_IGESSolid_Shell

IGESSolid_HArray1OfVertexList: NCollection_HArray1_handle_IGESSolid_VertexList
