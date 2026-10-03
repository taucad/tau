# libcascade — IGESSolid

40 top-level symbols. Signatures are verbatim typescript.

IGESSolid: declare class IGESSolid

  // IGESSolid.constructor (constructor)
  constructor();

  // IGESSolid.Init (method)
  static Init(): void;

  // IGESSolid.Protocol (method)
  static Protocol(): IGESSolid_Protocol;

  // IGESSolid.delete (method)
  delete(): void;

  // IGESSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_Block: declare class IGESSolid_Block extends IGESData_IGESEntity

  // IGESSolid_Block.constructor (constructor)
  constructor();

  // IGESSolid_Block.Init (method)
  Init(aSize: gp_XYZ, aCorner: gp_XYZ, aXAxis: gp_XYZ, aZAxis: gp_XYZ): void;

  // IGESSolid_Block.Size (method)
  Size(): gp_XYZ;

  // IGESSolid_Block.XLength (method)
  XLength(): number;

  // IGESSolid_Block.YLength (method)
  YLength(): number;

  // IGESSolid_Block.ZLength (method)
  ZLength(): number;

  // IGESSolid_Block.Corner (method)
  Corner(): gp_Pnt;

  // IGESSolid_Block.TransformedCorner (method)
  TransformedCorner(): gp_Pnt;

  // IGESSolid_Block.XAxis (method)
  XAxis(): gp_Dir;

  // IGESSolid_Block.TransformedXAxis (method)
  TransformedXAxis(): gp_Dir;

  // IGESSolid_Block.YAxis (method)
  YAxis(): gp_Dir;

  // IGESSolid_Block.TransformedYAxis (method)
  TransformedYAxis(): gp_Dir;

  // IGESSolid_Block.ZAxis (method)
  ZAxis(): gp_Dir;

  // IGESSolid_Block.TransformedZAxis (method)
  TransformedZAxis(): gp_Dir;

  // IGESSolid_Block.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_Block.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_Block.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_Block.delete (method)
  delete(): void;

  // IGESSolid_Block.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_BooleanTree: declare class IGESSolid_BooleanTree extends IGESData_IGESEntity

  // IGESSolid_BooleanTree.constructor (constructor)
  constructor();

  // IGESSolid_BooleanTree.Init (method)
  Init(operands: NCollection_HArray1_handle_IGESData_IGESEntity, operations: NCollection_HArray1_int): void;

  // IGESSolid_BooleanTree.Length (method)
  Length(): number;

  // IGESSolid_BooleanTree.IsOperand (method)
  IsOperand(Index: number): boolean;

  // IGESSolid_BooleanTree.Operand (method)
  Operand(Index: number): IGESData_IGESEntity;

  // IGESSolid_BooleanTree.Operation (method)
  Operation(Index: number): number;

  // IGESSolid_BooleanTree.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_BooleanTree.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_BooleanTree.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_BooleanTree.delete (method)
  delete(): void;

  // IGESSolid_BooleanTree.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ConeFrustum: declare class IGESSolid_ConeFrustum extends IGESData_IGESEntity

  // IGESSolid_ConeFrustum.constructor (constructor)
  constructor();

  // IGESSolid_ConeFrustum.Init (method)
  Init(Ht: number, R1: number, R2: number, Center: gp_XYZ, anAxis: gp_XYZ): void;

  // IGESSolid_ConeFrustum.Height (method)
  Height(): number;

  // IGESSolid_ConeFrustum.LargerRadius (method)
  LargerRadius(): number;

  // IGESSolid_ConeFrustum.SmallerRadius (method)
  SmallerRadius(): number;

  // IGESSolid_ConeFrustum.FaceCenter (method)
  FaceCenter(): gp_Pnt;

  // IGESSolid_ConeFrustum.TransformedFaceCenter (method)
  TransformedFaceCenter(): gp_Pnt;

  // IGESSolid_ConeFrustum.Axis (method)
  Axis(): gp_Dir;

  // IGESSolid_ConeFrustum.TransformedAxis (method)
  TransformedAxis(): gp_Dir;

  // IGESSolid_ConeFrustum.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_ConeFrustum.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_ConeFrustum.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_ConeFrustum.delete (method)
  delete(): void;

  // IGESSolid_ConeFrustum.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ConicalSurface: declare class IGESSolid_ConicalSurface extends IGESData_IGESEntity

  // IGESSolid_ConicalSurface.constructor (constructor)
  constructor();

  // IGESSolid_ConicalSurface.Init (method)
  Init(aLocation: IGESGeom_Point, anAxis: IGESGeom_Direction, aRadius: number, anAngle: number, aRefdir: IGESGeom_Direction): void;

  // IGESSolid_ConicalSurface.LocationPoint (method)
  LocationPoint(): IGESGeom_Point;

  // IGESSolid_ConicalSurface.Axis (method)
  Axis(): IGESGeom_Direction;

  // IGESSolid_ConicalSurface.Radius (method)
  Radius(): number;

  // IGESSolid_ConicalSurface.SemiAngle (method)
  SemiAngle(): number;

  // IGESSolid_ConicalSurface.ReferenceDir (method)
  ReferenceDir(): IGESGeom_Direction;

  // IGESSolid_ConicalSurface.IsParametrised (method)
  IsParametrised(): boolean;

  // IGESSolid_ConicalSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_ConicalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_ConicalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_ConicalSurface.delete (method)
  delete(): void;

  // IGESSolid_ConicalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_Cylinder: declare class IGESSolid_Cylinder extends IGESData_IGESEntity

  // IGESSolid_Cylinder.constructor (constructor)
  constructor();

  // IGESSolid_Cylinder.Init (method)
  Init(aHeight: number, aRadius: number, aCenter: gp_XYZ, anAxis: gp_XYZ): void;

  // IGESSolid_Cylinder.Height (method)
  Height(): number;

  // IGESSolid_Cylinder.Radius (method)
  Radius(): number;

  // IGESSolid_Cylinder.FaceCenter (method)
  FaceCenter(): gp_Pnt;

  // IGESSolid_Cylinder.TransformedFaceCenter (method)
  TransformedFaceCenter(): gp_Pnt;

  // IGESSolid_Cylinder.Axis (method)
  Axis(): gp_Dir;

  // IGESSolid_Cylinder.TransformedAxis (method)
  TransformedAxis(): gp_Dir;

  // IGESSolid_Cylinder.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_Cylinder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_Cylinder.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_Cylinder.delete (method)
  delete(): void;

  // IGESSolid_Cylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_CylindricalSurface: declare class IGESSolid_CylindricalSurface extends IGESData_IGESEntity

  // IGESSolid_CylindricalSurface.constructor (constructor)
  constructor();

  // IGESSolid_CylindricalSurface.Init (method)
  Init(aLocation: IGESGeom_Point, anAxis: IGESGeom_Direction, aRadius: number, aRefdir: IGESGeom_Direction): void;

  // IGESSolid_CylindricalSurface.LocationPoint (method)
  LocationPoint(): IGESGeom_Point;

  // IGESSolid_CylindricalSurface.Axis (method)
  Axis(): IGESGeom_Direction;

  // IGESSolid_CylindricalSurface.Radius (method)
  Radius(): number;

  // IGESSolid_CylindricalSurface.IsParametrised (method)
  IsParametrised(): boolean;

  // IGESSolid_CylindricalSurface.ReferenceDir (method)
  ReferenceDir(): IGESGeom_Direction;

  // IGESSolid_CylindricalSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_CylindricalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_CylindricalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_CylindricalSurface.delete (method)
  delete(): void;

  // IGESSolid_CylindricalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_EdgeList: declare class IGESSolid_EdgeList extends IGESData_IGESEntity

  // IGESSolid_EdgeList.constructor (constructor)
  constructor();

  // IGESSolid_EdgeList.Init (method)
  Init(curves: NCollection_HArray1_handle_IGESData_IGESEntity, startVertexList: NCollection_HArray1_handle_IGESSolid_VertexList, startVertexIndex: NCollection_HArray1_int, endVertexList: NCollection_HArray1_handle_IGESSolid_VertexList, endVertexIndex: NCollection_HArray1_int): void;

  // IGESSolid_EdgeList.NbEdges (method)
  NbEdges(): number;

  // IGESSolid_EdgeList.Curve (method)
  Curve(num: number): IGESData_IGESEntity;

  // IGESSolid_EdgeList.StartVertexList (method)
  StartVertexList(num: number): IGESSolid_VertexList;

  // IGESSolid_EdgeList.StartVertexIndex (method)
  StartVertexIndex(num: number): number;

  // IGESSolid_EdgeList.EndVertexList (method)
  EndVertexList(num: number): IGESSolid_VertexList;

  // IGESSolid_EdgeList.EndVertexIndex (method)
  EndVertexIndex(num: number): number;

  // IGESSolid_EdgeList.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_EdgeList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_EdgeList.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_EdgeList.delete (method)
  delete(): void;

  // IGESSolid_EdgeList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_Ellipsoid: declare class IGESSolid_Ellipsoid extends IGESData_IGESEntity

  // IGESSolid_Ellipsoid.constructor (constructor)
  constructor();

  // IGESSolid_Ellipsoid.Init (method)
  Init(aSize: gp_XYZ, aCenter: gp_XYZ, anXAxis: gp_XYZ, anZAxis: gp_XYZ): void;

  // IGESSolid_Ellipsoid.Size (method)
  Size(): gp_XYZ;

  // IGESSolid_Ellipsoid.XLength (method)
  XLength(): number;

  // IGESSolid_Ellipsoid.YLength (method)
  YLength(): number;

  // IGESSolid_Ellipsoid.ZLength (method)
  ZLength(): number;

  // IGESSolid_Ellipsoid.Center (method)
  Center(): gp_Pnt;

  // IGESSolid_Ellipsoid.TransformedCenter (method)
  TransformedCenter(): gp_Pnt;

  // IGESSolid_Ellipsoid.XAxis (method)
  XAxis(): gp_Dir;

  // IGESSolid_Ellipsoid.TransformedXAxis (method)
  TransformedXAxis(): gp_Dir;

  // IGESSolid_Ellipsoid.YAxis (method)
  YAxis(): gp_Dir;

  // IGESSolid_Ellipsoid.TransformedYAxis (method)
  TransformedYAxis(): gp_Dir;

  // IGESSolid_Ellipsoid.ZAxis (method)
  ZAxis(): gp_Dir;

  // IGESSolid_Ellipsoid.TransformedZAxis (method)
  TransformedZAxis(): gp_Dir;

  // IGESSolid_Ellipsoid.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_Ellipsoid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_Ellipsoid.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_Ellipsoid.delete (method)
  delete(): void;

  // IGESSolid_Ellipsoid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_Face: declare class IGESSolid_Face extends IGESData_IGESEntity

  // IGESSolid_Face.constructor (constructor)
  constructor();

  // IGESSolid_Face.Init (method)
  Init(aSurface: IGESData_IGESEntity, outerLoopFlag: boolean, loops: NCollection_HArray1_handle_IGESSolid_Loop): void;

  // IGESSolid_Face.Surface (method)
  Surface(): IGESData_IGESEntity;

  // IGESSolid_Face.NbLoops (method)
  NbLoops(): number;

  // IGESSolid_Face.HasOuterLoop (method)
  HasOuterLoop(): boolean;

  // IGESSolid_Face.Loop (method)
  Loop(Index: number): IGESSolid_Loop;

  // IGESSolid_Face.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_Face.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_Face.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_Face.delete (method)
  delete(): void;

  // IGESSolid_Face.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_GeneralModule: declare class IGESSolid_GeneralModule extends IGESData_GeneralModule

  // IGESSolid_GeneralModule.constructor (constructor)
  constructor();

  // IGESSolid_GeneralModule.DirChecker (method)
  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  // IGESSolid_GeneralModule.OwnCheckCase (method)
  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_GeneralModule.NewVoid (method)
  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESSolid_GeneralModule.OwnCopyCase (method)
  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESSolid_GeneralModule.CategoryNumber (method)
  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  // IGESSolid_GeneralModule.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_GeneralModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_GeneralModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_GeneralModule.delete (method)
  delete(): void;

  // IGESSolid_GeneralModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_Loop: declare class IGESSolid_Loop extends IGESData_IGESEntity

  // IGESSolid_Loop.constructor (constructor)
  constructor();

  // IGESSolid_Loop.Init (method)
  Init(types: NCollection_HArray1_int, edges: NCollection_HArray1_handle_IGESData_IGESEntity, index: NCollection_HArray1_int, orient: NCollection_HArray1_int, nbParameterCurves: NCollection_HArray1_int, isoparametricFlags: IGESBasic_HArray1OfHArray1OfInteger, curves: IGESBasic_HArray1OfHArray1OfIGESEntity): void;

  // IGESSolid_Loop.IsBound (method)
  IsBound(): boolean;

  // IGESSolid_Loop.SetBound (method)
  SetBound(bound: boolean): void;

  // IGESSolid_Loop.NbEdges (method)
  NbEdges(): number;

  // IGESSolid_Loop.EdgeType (method)
  EdgeType(Index: number): number;

  // IGESSolid_Loop.Edge (method)
  Edge(Index: number): IGESData_IGESEntity;

  // IGESSolid_Loop.Orientation (method)
  Orientation(Index: number): boolean;

  // IGESSolid_Loop.NbParameterCurves (method)
  NbParameterCurves(Index: number): number;

  // IGESSolid_Loop.IsIsoparametric (method)
  IsIsoparametric(EdgeIndex: number, CurveIndex: number): boolean;

  // IGESSolid_Loop.ParametricCurve (method)
  ParametricCurve(EdgeIndex: number, CurveIndex: number): IGESData_IGESEntity;

  // IGESSolid_Loop.ListIndex (method)
  ListIndex(num: number): number;

  // IGESSolid_Loop.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_Loop.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_Loop.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_Loop.delete (method)
  delete(): void;

  // IGESSolid_Loop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ManifoldSolid: declare class IGESSolid_ManifoldSolid extends IGESData_IGESEntity

  // IGESSolid_ManifoldSolid.constructor (constructor)
  constructor();

  // IGESSolid_ManifoldSolid.Init (method)
  Init(aShell: IGESSolid_Shell, shellflag: boolean, voidShells: NCollection_HArray1_handle_IGESSolid_Shell, voidShellFlags: NCollection_HArray1_int): void;

  // IGESSolid_ManifoldSolid.Shell (method)
  Shell(): IGESSolid_Shell;

  // IGESSolid_ManifoldSolid.OrientationFlag (method)
  OrientationFlag(): boolean;

  // IGESSolid_ManifoldSolid.NbVoidShells (method)
  NbVoidShells(): number;

  // IGESSolid_ManifoldSolid.VoidShell (method)
  VoidShell(Index: number): IGESSolid_Shell;

  // IGESSolid_ManifoldSolid.VoidOrientationFlag (method)
  VoidOrientationFlag(Index: number): boolean;

  // IGESSolid_ManifoldSolid.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_ManifoldSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_ManifoldSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_ManifoldSolid.delete (method)
  delete(): void;

  // IGESSolid_ManifoldSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_PlaneSurface: declare class IGESSolid_PlaneSurface extends IGESData_IGESEntity

  // IGESSolid_PlaneSurface.constructor (constructor)
  constructor();

  // IGESSolid_PlaneSurface.Init (method)
  Init(aLocation: IGESGeom_Point, aNormal: IGESGeom_Direction, refdir: IGESGeom_Direction): void;

  // IGESSolid_PlaneSurface.LocationPoint (method)
  LocationPoint(): IGESGeom_Point;

  // IGESSolid_PlaneSurface.Normal (method)
  Normal(): IGESGeom_Direction;

  // IGESSolid_PlaneSurface.ReferenceDir (method)
  ReferenceDir(): IGESGeom_Direction;

  // IGESSolid_PlaneSurface.IsParametrised (method)
  IsParametrised(): boolean;

  // IGESSolid_PlaneSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_PlaneSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_PlaneSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_PlaneSurface.delete (method)
  delete(): void;

  // IGESSolid_PlaneSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_Protocol: declare class IGESSolid_Protocol extends IGESData_Protocol

  // IGESSolid_Protocol.constructor (constructor)
  constructor();

  // IGESSolid_Protocol.NbResources (method)
  NbResources(): number;

  // IGESSolid_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // IGESSolid_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // IGESSolid_Protocol.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_Protocol.delete (method)
  delete(): void;

  // IGESSolid_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ReadWriteModule: declare class IGESSolid_ReadWriteModule extends IGESData_ReadWriteModule

  // IGESSolid_ReadWriteModule.constructor (constructor)
  constructor();

  // IGESSolid_ReadWriteModule.CaseIGES (method)
  CaseIGES(typenum: number, formnum: number): number;

  // IGESSolid_ReadWriteModule.WriteOwnParams (method)
  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  // IGESSolid_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_ReadWriteModule.delete (method)
  delete(): void;

  // IGESSolid_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_RightAngularWedge: declare class IGESSolid_RightAngularWedge extends IGESData_IGESEntity

  // IGESSolid_RightAngularWedge.constructor (constructor)
  constructor();

  // IGESSolid_RightAngularWedge.Init (method)
  Init(aSize: gp_XYZ, lowX: number, aCorner: gp_XYZ, anXAxis: gp_XYZ, anZAxis: gp_XYZ): void;

  // IGESSolid_RightAngularWedge.Size (method)
  Size(): gp_XYZ;

  // IGESSolid_RightAngularWedge.XBigLength (method)
  XBigLength(): number;

  // IGESSolid_RightAngularWedge.XSmallLength (method)
  XSmallLength(): number;

  // IGESSolid_RightAngularWedge.YLength (method)
  YLength(): number;

  // IGESSolid_RightAngularWedge.ZLength (method)
  ZLength(): number;

  // IGESSolid_RightAngularWedge.Corner (method)
  Corner(): gp_Pnt;

  // IGESSolid_RightAngularWedge.TransformedCorner (method)
  TransformedCorner(): gp_Pnt;

  // IGESSolid_RightAngularWedge.XAxis (method)
  XAxis(): gp_Dir;

  // IGESSolid_RightAngularWedge.TransformedXAxis (method)
  TransformedXAxis(): gp_Dir;

  // IGESSolid_RightAngularWedge.YAxis (method)
  YAxis(): gp_Dir;

  // IGESSolid_RightAngularWedge.TransformedYAxis (method)
  TransformedYAxis(): gp_Dir;

  // IGESSolid_RightAngularWedge.ZAxis (method)
  ZAxis(): gp_Dir;

  // IGESSolid_RightAngularWedge.TransformedZAxis (method)
  TransformedZAxis(): gp_Dir;

  // IGESSolid_RightAngularWedge.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_RightAngularWedge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_RightAngularWedge.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_RightAngularWedge.delete (method)
  delete(): void;

  // IGESSolid_RightAngularWedge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_SelectedComponent: declare class IGESSolid_SelectedComponent extends IGESData_IGESEntity

  // IGESSolid_SelectedComponent.constructor (constructor)
  constructor();

  // IGESSolid_SelectedComponent.Init (method)
  Init(anEntity: IGESSolid_BooleanTree, selectPnt: gp_XYZ): void;

  // IGESSolid_SelectedComponent.Component (method)
  Component(): IGESSolid_BooleanTree;

  // IGESSolid_SelectedComponent.SelectPoint (method)
  SelectPoint(): gp_Pnt;

  // IGESSolid_SelectedComponent.TransformedSelectPoint (method)
  TransformedSelectPoint(): gp_Pnt;

  // IGESSolid_SelectedComponent.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_SelectedComponent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_SelectedComponent.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_SelectedComponent.delete (method)
  delete(): void;

  // IGESSolid_SelectedComponent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_Shell: declare class IGESSolid_Shell extends IGESData_IGESEntity

  // IGESSolid_Shell.constructor (constructor)
  constructor();

  // IGESSolid_Shell.Init (method)
  Init(allFaces: NCollection_HArray1_handle_IGESSolid_Face, allOrient: NCollection_HArray1_int): void;

  // IGESSolid_Shell.IsClosed (method)
  IsClosed(): boolean;

  // IGESSolid_Shell.SetClosed (method)
  SetClosed(closed: boolean): void;

  // IGESSolid_Shell.NbFaces (method)
  NbFaces(): number;

  // IGESSolid_Shell.Face (method)
  Face(Index: number): IGESSolid_Face;

  // IGESSolid_Shell.Orientation (method)
  Orientation(Index: number): boolean;

  // IGESSolid_Shell.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_Shell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_Shell.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_Shell.delete (method)
  delete(): void;

  // IGESSolid_Shell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_SolidAssembly: declare class IGESSolid_SolidAssembly extends IGESData_IGESEntity

  // IGESSolid_SolidAssembly.constructor (constructor)
  constructor();

  // IGESSolid_SolidAssembly.Init (method)
  Init(allItems: NCollection_HArray1_handle_IGESData_IGESEntity, allMatrices: NCollection_HArray1_handle_IGESGeom_TransformationMatrix): void;

  // IGESSolid_SolidAssembly.HasBrep (method)
  HasBrep(): boolean;

  // IGESSolid_SolidAssembly.SetBrep (method)
  SetBrep(hasbrep: boolean): void;

  // IGESSolid_SolidAssembly.NbItems (method)
  NbItems(): number;

  // IGESSolid_SolidAssembly.Item (method)
  Item(Index: number): IGESData_IGESEntity;

  // IGESSolid_SolidAssembly.TransfMatrix (method)
  TransfMatrix(Index: number): IGESGeom_TransformationMatrix;

  // IGESSolid_SolidAssembly.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_SolidAssembly.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_SolidAssembly.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_SolidAssembly.delete (method)
  delete(): void;

  // IGESSolid_SolidAssembly.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_SolidInstance: declare class IGESSolid_SolidInstance extends IGESData_IGESEntity

  // IGESSolid_SolidInstance.constructor (constructor)
  constructor();

  // IGESSolid_SolidInstance.Init (method)
  Init(anEntity: IGESData_IGESEntity): void;

  // IGESSolid_SolidInstance.IsBrep (method)
  IsBrep(): boolean;

  // IGESSolid_SolidInstance.SetBrep (method)
  SetBrep(brep: boolean): void;

  // IGESSolid_SolidInstance.Entity (method)
  Entity(): IGESData_IGESEntity;

  // IGESSolid_SolidInstance.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_SolidInstance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_SolidInstance.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_SolidInstance.delete (method)
  delete(): void;

  // IGESSolid_SolidInstance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_SolidOfLinearExtrusion: declare class IGESSolid_SolidOfLinearExtrusion extends IGESData_IGESEntity

  // IGESSolid_SolidOfLinearExtrusion.constructor (constructor)
  constructor();

  // IGESSolid_SolidOfLinearExtrusion.Init (method)
  Init(aCurve: IGESData_IGESEntity, aLength: number, aDirection: gp_XYZ): void;

  // IGESSolid_SolidOfLinearExtrusion.Curve (method)
  Curve(): IGESData_IGESEntity;

  // IGESSolid_SolidOfLinearExtrusion.ExtrusionLength (method)
  ExtrusionLength(): number;

  // IGESSolid_SolidOfLinearExtrusion.ExtrusionDirection (method)
  ExtrusionDirection(): gp_Dir;

  // IGESSolid_SolidOfLinearExtrusion.TransformedExtrusionDirection (method)
  TransformedExtrusionDirection(): gp_Dir;

  // IGESSolid_SolidOfLinearExtrusion.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_SolidOfLinearExtrusion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_SolidOfLinearExtrusion.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_SolidOfLinearExtrusion.delete (method)
  delete(): void;

  // IGESSolid_SolidOfLinearExtrusion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_SolidOfRevolution: declare class IGESSolid_SolidOfRevolution extends IGESData_IGESEntity

  // IGESSolid_SolidOfRevolution.constructor (constructor)
  constructor();

  // IGESSolid_SolidOfRevolution.Init (method)
  Init(aCurve: IGESData_IGESEntity, aFract: number, aAxisPnt: gp_XYZ, aDirection: gp_XYZ): void;

  // IGESSolid_SolidOfRevolution.SetClosedToAxis (method)
  SetClosedToAxis(mode: boolean): void;

  // IGESSolid_SolidOfRevolution.IsClosedToAxis (method)
  IsClosedToAxis(): boolean;

  // IGESSolid_SolidOfRevolution.Curve (method)
  Curve(): IGESData_IGESEntity;

  // IGESSolid_SolidOfRevolution.Fraction (method)
  Fraction(): number;

  // IGESSolid_SolidOfRevolution.AxisPoint (method)
  AxisPoint(): gp_Pnt;

  // IGESSolid_SolidOfRevolution.TransformedAxisPoint (method)
  TransformedAxisPoint(): gp_Pnt;

  // IGESSolid_SolidOfRevolution.Axis (method)
  Axis(): gp_Dir;

  // IGESSolid_SolidOfRevolution.TransformedAxis (method)
  TransformedAxis(): gp_Dir;

  // IGESSolid_SolidOfRevolution.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_SolidOfRevolution.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_SolidOfRevolution.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_SolidOfRevolution.delete (method)
  delete(): void;

  // IGESSolid_SolidOfRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_SpecificModule: declare class IGESSolid_SpecificModule extends IGESData_SpecificModule

  // IGESSolid_SpecificModule.constructor (constructor)
  constructor();

  // IGESSolid_SpecificModule.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_SpecificModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_SpecificModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_SpecificModule.delete (method)
  delete(): void;

  // IGESSolid_SpecificModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_Sphere: declare class IGESSolid_Sphere extends IGESData_IGESEntity

  // IGESSolid_Sphere.constructor (constructor)
  constructor();

  // IGESSolid_Sphere.Init (method)
  Init(aRadius: number, aCenter: gp_XYZ): void;

  // IGESSolid_Sphere.Radius (method)
  Radius(): number;

  // IGESSolid_Sphere.Center (method)
  Center(): gp_Pnt;

  // IGESSolid_Sphere.TransformedCenter (method)
  TransformedCenter(): gp_Pnt;

  // IGESSolid_Sphere.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_Sphere.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_Sphere.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_Sphere.delete (method)
  delete(): void;

  // IGESSolid_Sphere.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_SphericalSurface: declare class IGESSolid_SphericalSurface extends IGESData_IGESEntity

  // IGESSolid_SphericalSurface.constructor (constructor)
  constructor();

  // IGESSolid_SphericalSurface.Init (method)
  Init(aCenter: IGESGeom_Point, aRadius: number, anAxis: IGESGeom_Direction, aRefdir: IGESGeom_Direction): void;

  // IGESSolid_SphericalSurface.Center (method)
  Center(): IGESGeom_Point;

  // IGESSolid_SphericalSurface.TransformedCenter (method)
  TransformedCenter(): gp_Pnt;

  // IGESSolid_SphericalSurface.Radius (method)
  Radius(): number;

  // IGESSolid_SphericalSurface.Axis (method)
  Axis(): IGESGeom_Direction;

  // IGESSolid_SphericalSurface.ReferenceDir (method)
  ReferenceDir(): IGESGeom_Direction;

  // IGESSolid_SphericalSurface.IsParametrised (method)
  IsParametrised(): boolean;

  // IGESSolid_SphericalSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESSolid_SphericalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSolid_SphericalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSolid_SphericalSurface.delete (method)
  delete(): void;

  // IGESSolid_SphericalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolBlock: declare class IGESSolid_ToolBlock

  // IGESSolid_ToolBlock.constructor (constructor)
  constructor();

  // IGESSolid_ToolBlock.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_Block, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolBlock.DirChecker (method)
  DirChecker(ent: IGESSolid_Block): IGESData_DirChecker;

  // IGESSolid_ToolBlock.OwnCheck (method)
  OwnCheck(ent: IGESSolid_Block, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolBlock.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_Block, entto: IGESSolid_Block, TC: Interface_CopyTool): void;

  // IGESSolid_ToolBlock.delete (method)
  delete(): void;

  // IGESSolid_ToolBlock.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolBooleanTree: declare class IGESSolid_ToolBooleanTree

  // IGESSolid_ToolBooleanTree.constructor (constructor)
  constructor();

  // IGESSolid_ToolBooleanTree.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_BooleanTree, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolBooleanTree.DirChecker (method)
  DirChecker(ent: IGESSolid_BooleanTree): IGESData_DirChecker;

  // IGESSolid_ToolBooleanTree.OwnCheck (method)
  OwnCheck(ent: IGESSolid_BooleanTree, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolBooleanTree.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_BooleanTree, entto: IGESSolid_BooleanTree, TC: Interface_CopyTool): void;

  // IGESSolid_ToolBooleanTree.delete (method)
  delete(): void;

  // IGESSolid_ToolBooleanTree.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolConeFrustum: declare class IGESSolid_ToolConeFrustum

  // IGESSolid_ToolConeFrustum.constructor (constructor)
  constructor();

  // IGESSolid_ToolConeFrustum.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_ConeFrustum, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolConeFrustum.DirChecker (method)
  DirChecker(ent: IGESSolid_ConeFrustum): IGESData_DirChecker;

  // IGESSolid_ToolConeFrustum.OwnCheck (method)
  OwnCheck(ent: IGESSolid_ConeFrustum, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolConeFrustum.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_ConeFrustum, entto: IGESSolid_ConeFrustum, TC: Interface_CopyTool): void;

  // IGESSolid_ToolConeFrustum.delete (method)
  delete(): void;

  // IGESSolid_ToolConeFrustum.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolConicalSurface: declare class IGESSolid_ToolConicalSurface

  // IGESSolid_ToolConicalSurface.constructor (constructor)
  constructor();

  // IGESSolid_ToolConicalSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_ConicalSurface, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolConicalSurface.DirChecker (method)
  DirChecker(ent: IGESSolid_ConicalSurface): IGESData_DirChecker;

  // IGESSolid_ToolConicalSurface.OwnCheck (method)
  OwnCheck(ent: IGESSolid_ConicalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolConicalSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_ConicalSurface, entto: IGESSolid_ConicalSurface, TC: Interface_CopyTool): void;

  // IGESSolid_ToolConicalSurface.delete (method)
  delete(): void;

  // IGESSolid_ToolConicalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolCylinder: declare class IGESSolid_ToolCylinder

  // IGESSolid_ToolCylinder.constructor (constructor)
  constructor();

  // IGESSolid_ToolCylinder.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_Cylinder, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolCylinder.DirChecker (method)
  DirChecker(ent: IGESSolid_Cylinder): IGESData_DirChecker;

  // IGESSolid_ToolCylinder.OwnCheck (method)
  OwnCheck(ent: IGESSolid_Cylinder, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolCylinder.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_Cylinder, entto: IGESSolid_Cylinder, TC: Interface_CopyTool): void;

  // IGESSolid_ToolCylinder.delete (method)
  delete(): void;

  // IGESSolid_ToolCylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolCylindricalSurface: declare class IGESSolid_ToolCylindricalSurface

  // IGESSolid_ToolCylindricalSurface.constructor (constructor)
  constructor();

  // IGESSolid_ToolCylindricalSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_CylindricalSurface, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolCylindricalSurface.DirChecker (method)
  DirChecker(ent: IGESSolid_CylindricalSurface): IGESData_DirChecker;

  // IGESSolid_ToolCylindricalSurface.OwnCheck (method)
  OwnCheck(ent: IGESSolid_CylindricalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolCylindricalSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_CylindricalSurface, entto: IGESSolid_CylindricalSurface, TC: Interface_CopyTool): void;

  // IGESSolid_ToolCylindricalSurface.delete (method)
  delete(): void;

  // IGESSolid_ToolCylindricalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolEdgeList: declare class IGESSolid_ToolEdgeList

  // IGESSolid_ToolEdgeList.constructor (constructor)
  constructor();

  // IGESSolid_ToolEdgeList.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_EdgeList, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolEdgeList.DirChecker (method)
  DirChecker(ent: IGESSolid_EdgeList): IGESData_DirChecker;

  // IGESSolid_ToolEdgeList.OwnCheck (method)
  OwnCheck(ent: IGESSolid_EdgeList, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolEdgeList.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_EdgeList, entto: IGESSolid_EdgeList, TC: Interface_CopyTool): void;

  // IGESSolid_ToolEdgeList.delete (method)
  delete(): void;

  // IGESSolid_ToolEdgeList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolEllipsoid: declare class IGESSolid_ToolEllipsoid

  // IGESSolid_ToolEllipsoid.constructor (constructor)
  constructor();

  // IGESSolid_ToolEllipsoid.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_Ellipsoid, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolEllipsoid.DirChecker (method)
  DirChecker(ent: IGESSolid_Ellipsoid): IGESData_DirChecker;

  // IGESSolid_ToolEllipsoid.OwnCheck (method)
  OwnCheck(ent: IGESSolid_Ellipsoid, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolEllipsoid.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_Ellipsoid, entto: IGESSolid_Ellipsoid, TC: Interface_CopyTool): void;

  // IGESSolid_ToolEllipsoid.delete (method)
  delete(): void;

  // IGESSolid_ToolEllipsoid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolFace: declare class IGESSolid_ToolFace

  // IGESSolid_ToolFace.constructor (constructor)
  constructor();

  // IGESSolid_ToolFace.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_Face, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolFace.DirChecker (method)
  DirChecker(ent: IGESSolid_Face): IGESData_DirChecker;

  // IGESSolid_ToolFace.OwnCheck (method)
  OwnCheck(ent: IGESSolid_Face, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolFace.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_Face, entto: IGESSolid_Face, TC: Interface_CopyTool): void;

  // IGESSolid_ToolFace.delete (method)
  delete(): void;

  // IGESSolid_ToolFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolLoop: declare class IGESSolid_ToolLoop

  // IGESSolid_ToolLoop.constructor (constructor)
  constructor();

  // IGESSolid_ToolLoop.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_Loop, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolLoop.DirChecker (method)
  DirChecker(ent: IGESSolid_Loop): IGESData_DirChecker;

  // IGESSolid_ToolLoop.OwnCheck (method)
  OwnCheck(ent: IGESSolid_Loop, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolLoop.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_Loop, entto: IGESSolid_Loop, TC: Interface_CopyTool): void;

  // IGESSolid_ToolLoop.delete (method)
  delete(): void;

  // IGESSolid_ToolLoop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolManifoldSolid: declare class IGESSolid_ToolManifoldSolid

  // IGESSolid_ToolManifoldSolid.constructor (constructor)
  constructor();

  // IGESSolid_ToolManifoldSolid.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_ManifoldSolid, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolManifoldSolid.DirChecker (method)
  DirChecker(ent: IGESSolid_ManifoldSolid): IGESData_DirChecker;

  // IGESSolid_ToolManifoldSolid.OwnCheck (method)
  OwnCheck(ent: IGESSolid_ManifoldSolid, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolManifoldSolid.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_ManifoldSolid, entto: IGESSolid_ManifoldSolid, TC: Interface_CopyTool): void;

  // IGESSolid_ToolManifoldSolid.delete (method)
  delete(): void;

  // IGESSolid_ToolManifoldSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolPlaneSurface: declare class IGESSolid_ToolPlaneSurface

  // IGESSolid_ToolPlaneSurface.constructor (constructor)
  constructor();

  // IGESSolid_ToolPlaneSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_PlaneSurface, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolPlaneSurface.DirChecker (method)
  DirChecker(ent: IGESSolid_PlaneSurface): IGESData_DirChecker;

  // IGESSolid_ToolPlaneSurface.OwnCheck (method)
  OwnCheck(ent: IGESSolid_PlaneSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolPlaneSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_PlaneSurface, entto: IGESSolid_PlaneSurface, TC: Interface_CopyTool): void;

  // IGESSolid_ToolPlaneSurface.delete (method)
  delete(): void;

  // IGESSolid_ToolPlaneSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolRightAngularWedge: declare class IGESSolid_ToolRightAngularWedge

  // IGESSolid_ToolRightAngularWedge.constructor (constructor)
  constructor();

  // IGESSolid_ToolRightAngularWedge.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_RightAngularWedge, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolRightAngularWedge.DirChecker (method)
  DirChecker(ent: IGESSolid_RightAngularWedge): IGESData_DirChecker;

  // IGESSolid_ToolRightAngularWedge.OwnCheck (method)
  OwnCheck(ent: IGESSolid_RightAngularWedge, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolRightAngularWedge.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_RightAngularWedge, entto: IGESSolid_RightAngularWedge, TC: Interface_CopyTool): void;

  // IGESSolid_ToolRightAngularWedge.delete (method)
  delete(): void;

  // IGESSolid_ToolRightAngularWedge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSolid_ToolSelectedComponent: declare class IGESSolid_ToolSelectedComponent

  // IGESSolid_ToolSelectedComponent.constructor (constructor)
  constructor();

  // IGESSolid_ToolSelectedComponent.WriteOwnParams (method)
  WriteOwnParams(ent: IGESSolid_SelectedComponent, IW: IGESData_IGESWriter): void;

  // IGESSolid_ToolSelectedComponent.DirChecker (method)
  DirChecker(ent: IGESSolid_SelectedComponent): IGESData_DirChecker;

  // IGESSolid_ToolSelectedComponent.OwnCheck (method)
  OwnCheck(ent: IGESSolid_SelectedComponent, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESSolid_ToolSelectedComponent.OwnCopy (method)
  OwnCopy(entfrom: IGESSolid_SelectedComponent, entto: IGESSolid_SelectedComponent, TC: Interface_CopyTool): void;

  // IGESSolid_ToolSelectedComponent.delete (method)
  delete(): void;

  // IGESSolid_ToolSelectedComponent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
