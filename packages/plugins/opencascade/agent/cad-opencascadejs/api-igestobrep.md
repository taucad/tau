# libcascade — IGESToBRep

11 top-level symbols. Signatures are verbatim typescript.

IGESToBRep: declare class IGESToBRep

  // IGESToBRep.constructor (constructor)
  constructor();

  // IGESToBRep.Init (method)
  static Init(): void;

  // IGESToBRep.SetAlgoContainer (method)
  static SetAlgoContainer(aContainer: IGESToBRep_AlgoContainer): void;

  // IGESToBRep.AlgoContainer (method)
  static AlgoContainer(): IGESToBRep_AlgoContainer;

  // IGESToBRep.IsCurveAndSurface (method)
  static IsCurveAndSurface(start: IGESData_IGESEntity): boolean;

  // IGESToBRep.IsBasicCurve (method)
  static IsBasicCurve(start: IGESData_IGESEntity): boolean;

  // IGESToBRep.IsBasicSurface (method)
  static IsBasicSurface(start: IGESData_IGESEntity): boolean;

  // IGESToBRep.IsTopoCurve (method)
  static IsTopoCurve(start: IGESData_IGESEntity): boolean;

  // IGESToBRep.IsTopoSurface (method)
  static IsTopoSurface(start: IGESData_IGESEntity): boolean;

  // IGESToBRep.IsBRepEntity (method)
  static IsBRepEntity(start: IGESData_IGESEntity): boolean;

  // IGESToBRep.IGESCurveToSequenceOfIGESCurve (method)
  static IGESCurveToSequenceOfIGESCurve(curve: IGESData_IGESEntity): { returnValue: number; sequence: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

  // IGESToBRep.TransferPCurve (method)
  static TransferPCurve(fromedge: TopoDS_Edge, toedge: TopoDS_Edge, face: TopoDS_Face): boolean;

  // IGESToBRep.delete (method)
  delete(): void;

  // IGESToBRep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESToBRep_Actor: declare class IGESToBRep_Actor extends Transfer_ActorOfTransientProcess

  // IGESToBRep_Actor.constructor (constructor)
  constructor();

  // IGESToBRep_Actor.SetModel (method)
  SetModel(model: Interface_InterfaceModel): void;

  // IGESToBRep_Actor.SetContinuity (method)
  SetContinuity(continuity?: number): void;

  // IGESToBRep_Actor.GetContinuity (method)
  GetContinuity(): number;

  // IGESToBRep_Actor.Recognize (method)
  Recognize(start: Standard_Transient): boolean;

  // IGESToBRep_Actor.Transfer (method)
  Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

  // IGESToBRep_Actor.UsedTolerance (method)
  UsedTolerance(): number;

  // IGESToBRep_Actor.get_type_name (method)
  static get_type_name(): string;

  // IGESToBRep_Actor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESToBRep_Actor.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESToBRep_Actor.delete (method)
  delete(): void;

  // IGESToBRep_Actor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESToBRep_AlgoContainer: declare class IGESToBRep_AlgoContainer extends Standard_Transient

  // IGESToBRep_AlgoContainer.constructor (constructor)
  constructor();

  // IGESToBRep_AlgoContainer.SetToolContainer (method)
  SetToolContainer(TC: IGESToBRep_ToolContainer): void;

  // IGESToBRep_AlgoContainer.ToolContainer (method)
  ToolContainer(): IGESToBRep_ToolContainer;

  // IGESToBRep_AlgoContainer.get_type_name (method)
  static get_type_name(): string;

  // IGESToBRep_AlgoContainer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESToBRep_AlgoContainer.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESToBRep_AlgoContainer.delete (method)
  delete(): void;

  // IGESToBRep_AlgoContainer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESToBRep_BRepEntity: declare class IGESToBRep_BRepEntity extends IGESToBRep_CurveAndSurface

  // IGESToBRep_BRepEntity.constructor (constructor)
  constructor();
  constructor(CS: IGESToBRep_CurveAndSurface);
  constructor(eps: number, epsGeom: number, epsCoeff: number, mode: boolean, modeapprox: boolean, optimized: boolean);

  // IGESToBRep_BRepEntity.TransferBRepEntity (method)
  TransferBRepEntity(start: IGESData_IGESEntity, theProgress?: Message_ProgressRange): TopoDS_Shape;

  // IGESToBRep_BRepEntity.TransferVertex (method)
  TransferVertex(start: IGESSolid_VertexList, index: number): TopoDS_Vertex;

  // IGESToBRep_BRepEntity.TransferEdge (method)
  TransferEdge(start: IGESSolid_EdgeList, index: number): TopoDS_Shape;

  // IGESToBRep_BRepEntity.TransferLoop (method)
  TransferLoop(start: IGESSolid_Loop, Face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  // IGESToBRep_BRepEntity.TransferFace (method)
  TransferFace(start: IGESSolid_Face): TopoDS_Shape;

  // IGESToBRep_BRepEntity.TransferShell (method)
  TransferShell(start: IGESSolid_Shell, theProgress?: Message_ProgressRange): TopoDS_Shape;

  // IGESToBRep_BRepEntity.TransferManifoldSolid (method)
  TransferManifoldSolid(start: IGESSolid_ManifoldSolid, theProgress?: Message_ProgressRange): TopoDS_Shape;

  // IGESToBRep_BRepEntity.delete (method)
  delete(): void;

  // IGESToBRep_BRepEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESToBRep_BasicCurve: declare class IGESToBRep_BasicCurve extends IGESToBRep_CurveAndSurface

  // IGESToBRep_BasicCurve.constructor (constructor)
  constructor();
  constructor(CS: IGESToBRep_CurveAndSurface);
  constructor(eps: number, epsGeom: number, epsCoeff: number, mode: boolean, modeapprox: boolean, optimized: boolean);

  // IGESToBRep_BasicCurve.TransferBasicCurve (method)
  TransferBasicCurve(start: IGESData_IGESEntity): Geom_Curve;

  // IGESToBRep_BasicCurve.Transfer2dBasicCurve (method)
  Transfer2dBasicCurve(start: IGESData_IGESEntity): Geom2d_Curve;

  // IGESToBRep_BasicCurve.TransferBSplineCurve (method)
  TransferBSplineCurve(start: IGESGeom_BSplineCurve): Geom_Curve;

  // IGESToBRep_BasicCurve.Transfer2dBSplineCurve (method)
  Transfer2dBSplineCurve(start: IGESGeom_BSplineCurve): Geom2d_Curve;

  // IGESToBRep_BasicCurve.TransferCircularArc (method)
  TransferCircularArc(start: IGESGeom_CircularArc): Geom_Curve;

  // IGESToBRep_BasicCurve.Transfer2dCircularArc (method)
  Transfer2dCircularArc(start: IGESGeom_CircularArc): Geom2d_Curve;

  // IGESToBRep_BasicCurve.TransferConicArc (method)
  TransferConicArc(start: IGESGeom_ConicArc): Geom_Curve;

  // IGESToBRep_BasicCurve.Transfer2dConicArc (method)
  Transfer2dConicArc(start: IGESGeom_ConicArc): Geom2d_Curve;

  // IGESToBRep_BasicCurve.TransferCopiousData (method)
  TransferCopiousData(start: IGESGeom_CopiousData): Geom_BSplineCurve;

  // IGESToBRep_BasicCurve.Transfer2dCopiousData (method)
  Transfer2dCopiousData(start: IGESGeom_CopiousData): Geom2d_BSplineCurve;

  // IGESToBRep_BasicCurve.TransferLine (method)
  TransferLine(start: IGESGeom_Line): Geom_Curve;

  // IGESToBRep_BasicCurve.Transfer2dLine (method)
  Transfer2dLine(start: IGESGeom_Line): Geom2d_Curve;

  // IGESToBRep_BasicCurve.TransferSplineCurve (method)
  TransferSplineCurve(start: IGESGeom_SplineCurve): Geom_BSplineCurve;

  // IGESToBRep_BasicCurve.Transfer2dSplineCurve (method)
  Transfer2dSplineCurve(start: IGESGeom_SplineCurve): Geom2d_BSplineCurve;

  // IGESToBRep_BasicCurve.TransferTransformation (method)
  TransferTransformation(start: IGESGeom_TransformationMatrix): Geom_Transformation;

  // IGESToBRep_BasicCurve.delete (method)
  delete(): void;

  // IGESToBRep_BasicCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESToBRep_BasicSurface: declare class IGESToBRep_BasicSurface extends IGESToBRep_CurveAndSurface

  // IGESToBRep_BasicSurface.constructor (constructor)
  constructor();
  constructor(CS: IGESToBRep_CurveAndSurface);
  constructor(eps: number, epsGeom: number, epsCoeff: number, mode: boolean, modeapprox: boolean, optimized: boolean);

  // IGESToBRep_BasicSurface.TransferBasicSurface (method)
  TransferBasicSurface(start: IGESData_IGESEntity): Geom_Surface;

  // IGESToBRep_BasicSurface.TransferPlaneSurface (method)
  TransferPlaneSurface(start: IGESSolid_PlaneSurface): Geom_Plane;

  // IGESToBRep_BasicSurface.TransferRigthCylindricalSurface (method)
  TransferRigthCylindricalSurface(start: IGESSolid_CylindricalSurface): Geom_CylindricalSurface;

  // IGESToBRep_BasicSurface.TransferRigthConicalSurface (method)
  TransferRigthConicalSurface(start: IGESSolid_ConicalSurface): Geom_ConicalSurface;

  // IGESToBRep_BasicSurface.TransferSphericalSurface (method)
  TransferSphericalSurface(start: IGESSolid_SphericalSurface): Geom_SphericalSurface;

  // IGESToBRep_BasicSurface.TransferToroidalSurface (method)
  TransferToroidalSurface(start: IGESSolid_ToroidalSurface): Geom_ToroidalSurface;

  // IGESToBRep_BasicSurface.TransferSplineSurface (method)
  TransferSplineSurface(start: IGESGeom_SplineSurface): Geom_BSplineSurface;

  // IGESToBRep_BasicSurface.TransferBSplineSurface (method)
  TransferBSplineSurface(start: IGESGeom_BSplineSurface): Geom_BSplineSurface;

  // IGESToBRep_BasicSurface.delete (method)
  delete(): void;

  // IGESToBRep_BasicSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESToBRep_CurveAndSurface: declare class IGESToBRep_CurveAndSurface

  // IGESToBRep_CurveAndSurface.constructor (constructor)
  constructor();
  constructor(eps: number, epsGeom: number, epsCoeff: number, mode: boolean, modeapprox: boolean, optimized: boolean);

  // IGESToBRep_CurveAndSurface.Init (method)
  Init(): void;

  // IGESToBRep_CurveAndSurface.SetEpsilon (method)
  SetEpsilon(eps: number): void;

  // IGESToBRep_CurveAndSurface.GetEpsilon (method)
  GetEpsilon(): number;

  // IGESToBRep_CurveAndSurface.SetEpsCoeff (method)
  SetEpsCoeff(eps: number): void;

  // IGESToBRep_CurveAndSurface.GetEpsCoeff (method)
  GetEpsCoeff(): number;

  // IGESToBRep_CurveAndSurface.SetEpsGeom (method)
  SetEpsGeom(eps: number): void;

  // IGESToBRep_CurveAndSurface.GetEpsGeom (method)
  GetEpsGeom(): number;

  // IGESToBRep_CurveAndSurface.SetMinTol (method)
  SetMinTol(mintol: number): void;

  // IGESToBRep_CurveAndSurface.SetMaxTol (method)
  SetMaxTol(maxtol: number): void;

  // IGESToBRep_CurveAndSurface.UpdateMinMaxTol (method)
  UpdateMinMaxTol(): void;

  // IGESToBRep_CurveAndSurface.GetMinTol (method)
  GetMinTol(): number;

  // IGESToBRep_CurveAndSurface.GetMaxTol (method)
  GetMaxTol(): number;

  // IGESToBRep_CurveAndSurface.SetModeApprox (method)
  SetModeApprox(mode: boolean): void;

  // IGESToBRep_CurveAndSurface.GetModeApprox (method)
  GetModeApprox(): boolean;

  // IGESToBRep_CurveAndSurface.SetModeTransfer (method)
  SetModeTransfer(mode: boolean): void;

  // IGESToBRep_CurveAndSurface.GetModeTransfer (method)
  GetModeTransfer(): boolean;

  // IGESToBRep_CurveAndSurface.SetOptimized (method)
  SetOptimized(optimized: boolean): void;

  // IGESToBRep_CurveAndSurface.GetOptimized (method)
  GetOptimized(): boolean;

  // IGESToBRep_CurveAndSurface.GetUnitFactor (method)
  GetUnitFactor(): number;

  // IGESToBRep_CurveAndSurface.SetSurfaceCurve (method)
  SetSurfaceCurve(ival: number): void;

  // IGESToBRep_CurveAndSurface.GetSurfaceCurve (method)
  GetSurfaceCurve(): number;

  // IGESToBRep_CurveAndSurface.SetModel (method)
  SetModel(model: IGESData_IGESModel): void;

  // IGESToBRep_CurveAndSurface.GetModel (method)
  GetModel(): IGESData_IGESModel;

  // IGESToBRep_CurveAndSurface.SetContinuity (method)
  SetContinuity(continuity: number): void;

  // IGESToBRep_CurveAndSurface.GetContinuity (method)
  GetContinuity(): number;

  // IGESToBRep_CurveAndSurface.SetTransferProcess (method)
  SetTransferProcess(TP: Transfer_TransientProcess): void;

  // IGESToBRep_CurveAndSurface.GetTransferProcess (method)
  GetTransferProcess(): Transfer_TransientProcess;

  // IGESToBRep_CurveAndSurface.TransferCurveAndSurface (method)
  TransferCurveAndSurface(start: IGESData_IGESEntity, theProgress?: Message_ProgressRange): TopoDS_Shape;

  // IGESToBRep_CurveAndSurface.TransferGeometry (method)
  TransferGeometry(start: IGESData_IGESEntity, theProgress?: Message_ProgressRange): TopoDS_Shape;

  // IGESToBRep_CurveAndSurface.SendFail (method)
  SendFail(start: IGESData_IGESEntity, amsg: Message_Msg): void;

  // IGESToBRep_CurveAndSurface.SendWarning (method)
  SendWarning(start: IGESData_IGESEntity, amsg: Message_Msg): void;

  // IGESToBRep_CurveAndSurface.SendMsg (method)
  SendMsg(start: IGESData_IGESEntity, amsg: Message_Msg): void;

  // IGESToBRep_CurveAndSurface.HasShapeResult (method)
  HasShapeResult(start: IGESData_IGESEntity): boolean;

  // IGESToBRep_CurveAndSurface.GetShapeResult (method)
  GetShapeResult(start: IGESData_IGESEntity): TopoDS_Shape;
  GetShapeResult(start: IGESData_IGESEntity, num: number): TopoDS_Shape;

  // IGESToBRep_CurveAndSurface.SetShapeResult (method)
  SetShapeResult(start: IGESData_IGESEntity, result: TopoDS_Shape): void;

  // IGESToBRep_CurveAndSurface.NbShapeResult (method)
  NbShapeResult(start: IGESData_IGESEntity): number;

  // IGESToBRep_CurveAndSurface.AddShapeResult (method)
  AddShapeResult(start: IGESData_IGESEntity, result: TopoDS_Shape): void;

  // IGESToBRep_CurveAndSurface.SetSurface (method)
  SetSurface(theSurface: Geom_Surface): void;

  // IGESToBRep_CurveAndSurface.Surface (method)
  Surface(): Geom_Surface;

  // IGESToBRep_CurveAndSurface.GetUVResolution (method)
  GetUVResolution(): number;

  // IGESToBRep_CurveAndSurface.delete (method)
  delete(): void;

  // IGESToBRep_CurveAndSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESToBRep_IGESBoundary: declare class IGESToBRep_IGESBoundary extends Standard_Transient

  // IGESToBRep_IGESBoundary.constructor (constructor)
  constructor();
  constructor(CS: IGESToBRep_CurveAndSurface);

  // IGESToBRep_IGESBoundary.Init (method)
  Init(CS: IGESToBRep_CurveAndSurface, entity: IGESData_IGESEntity, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number, filepreference: number): void;

  // IGESToBRep_IGESBoundary.WireData (method)
  WireData(): ShapeExtend_WireData;

  // IGESToBRep_IGESBoundary.WireData3d (method)
  WireData3d(): ShapeExtend_WireData;

  // IGESToBRep_IGESBoundary.WireData2d (method)
  WireData2d(): ShapeExtend_WireData;

  // IGESToBRep_IGESBoundary.Transfer (method)
  Transfer(okCurve: boolean, okCurve3d: boolean, okCurve2d: boolean, curve3d: IGESData_IGESEntity, toreverse3d: boolean, curves2d: NCollection_HArray1_handle_IGESData_IGESEntity, number_: number): { returnValue: boolean; okCurve: boolean; okCurve3d: boolean; okCurve2d: boolean };
  Transfer(okCurve: boolean, okCurve3d: boolean, okCurve2d: boolean, curve3d: ShapeExtend_WireData, curves2d: NCollection_HArray1_handle_IGESData_IGESEntity, toreverse2d: boolean, number_: number): { returnValue: boolean; okCurve: boolean; okCurve3d: boolean; okCurve2d: boolean; lsewd: ShapeExtend_WireData; [Symbol.dispose](): void };

  // IGESToBRep_IGESBoundary.Check (method)
  Check(result: boolean, checkclosure: boolean, okCurve3d: boolean, okCurve2d: boolean): void;

  // IGESToBRep_IGESBoundary.get_type_name (method)
  static get_type_name(): string;

  // IGESToBRep_IGESBoundary.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESToBRep_IGESBoundary.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESToBRep_IGESBoundary.delete (method)
  delete(): void;

  // IGESToBRep_IGESBoundary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESToBRep_Reader: declare class IGESToBRep_Reader

  // IGESToBRep_Reader.constructor (constructor)
  constructor();

  // IGESToBRep_Reader.LoadFile (method)
  LoadFile(filename: string): number;

  // IGESToBRep_Reader.SetModel (method)
  SetModel(model: IGESData_IGESModel): void;

  // IGESToBRep_Reader.Model (method)
  Model(): IGESData_IGESModel;

  // IGESToBRep_Reader.SetTransientProcess (method)
  SetTransientProcess(TP: Transfer_TransientProcess): void;

  // IGESToBRep_Reader.TransientProcess (method)
  TransientProcess(): Transfer_TransientProcess;

  // IGESToBRep_Reader.Actor (method)
  Actor(): IGESToBRep_Actor;

  // IGESToBRep_Reader.Clear (method)
  Clear(): void;

  // IGESToBRep_Reader.Check (method)
  Check(withprint: boolean): boolean;

  // IGESToBRep_Reader.TransferRoots (method)
  TransferRoots(onlyvisible?: boolean, theProgress?: Message_ProgressRange): void;

  // IGESToBRep_Reader.Transfer (method)
  Transfer(num: number, theProgress?: Message_ProgressRange): boolean;

  // IGESToBRep_Reader.IsDone (method)
  IsDone(): boolean;

  // IGESToBRep_Reader.UsedTolerance (method)
  UsedTolerance(): number;

  // IGESToBRep_Reader.NbShapes (method)
  NbShapes(): number;

  // IGESToBRep_Reader.Shape (method)
  Shape(num?: number): TopoDS_Shape;

  // IGESToBRep_Reader.OneShape (method)
  OneShape(): TopoDS_Shape;

  // IGESToBRep_Reader.SetShapeFixParameters (method)
  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  // IGESToBRep_Reader.GetShapeFixParameters (method)
  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  // IGESToBRep_Reader.SetShapeProcessFlags (method)
  SetShapeProcessFlags(theFlags: any): void;

  // IGESToBRep_Reader.GetShapeProcessFlags (method)
  GetShapeProcessFlags(): any;

  // IGESToBRep_Reader.delete (method)
  delete(): void;

  // IGESToBRep_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESToBRep_ToolContainer: declare class IGESToBRep_ToolContainer extends Standard_Transient

  // IGESToBRep_ToolContainer.constructor (constructor)
  constructor();

  // IGESToBRep_ToolContainer.IGESBoundary (method)
  IGESBoundary(): IGESToBRep_IGESBoundary;

  // IGESToBRep_ToolContainer.get_type_name (method)
  static get_type_name(): string;

  // IGESToBRep_ToolContainer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESToBRep_ToolContainer.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESToBRep_ToolContainer.delete (method)
  delete(): void;

  // IGESToBRep_ToolContainer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESToBRep_TopoCurve: declare class IGESToBRep_TopoCurve extends IGESToBRep_CurveAndSurface

  // IGESToBRep_TopoCurve.constructor (constructor)
  constructor();
  constructor(CS: IGESToBRep_CurveAndSurface);
  constructor(CS: IGESToBRep_TopoCurve);
  constructor(eps: number, epsGeom: number, epsCoeff: number, mode: boolean, modeapprox: boolean, optimized: boolean);

  // IGESToBRep_TopoCurve.TransferTopoCurve (method)
  TransferTopoCurve(start: IGESData_IGESEntity): TopoDS_Shape;

  // IGESToBRep_TopoCurve.Transfer2dTopoCurve (method)
  Transfer2dTopoCurve(start: IGESData_IGESEntity, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  // IGESToBRep_TopoCurve.TransferTopoBasicCurve (method)
  TransferTopoBasicCurve(start: IGESData_IGESEntity): TopoDS_Shape;

  // IGESToBRep_TopoCurve.Transfer2dTopoBasicCurve (method)
  Transfer2dTopoBasicCurve(start: IGESData_IGESEntity, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  // IGESToBRep_TopoCurve.TransferPoint (method)
  TransferPoint(start: IGESGeom_Point): TopoDS_Vertex;

  // IGESToBRep_TopoCurve.Transfer2dPoint (method)
  Transfer2dPoint(start: IGESGeom_Point): TopoDS_Vertex;

  // IGESToBRep_TopoCurve.TransferCompositeCurve (method)
  TransferCompositeCurve(start: IGESGeom_CompositeCurve): TopoDS_Shape;

  // IGESToBRep_TopoCurve.Transfer2dCompositeCurve (method)
  Transfer2dCompositeCurve(start: IGESGeom_CompositeCurve, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  // IGESToBRep_TopoCurve.TransferOffsetCurve (method)
  TransferOffsetCurve(start: IGESGeom_OffsetCurve): TopoDS_Shape;

  // IGESToBRep_TopoCurve.Transfer2dOffsetCurve (method)
  Transfer2dOffsetCurve(start: IGESGeom_OffsetCurve, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  // IGESToBRep_TopoCurve.TransferCurveOnSurface (method)
  TransferCurveOnSurface(start: IGESGeom_CurveOnSurface): TopoDS_Shape;

  // IGESToBRep_TopoCurve.TransferCurveOnFace (method)
  TransferCurveOnFace(face: TopoDS_Face, start: IGESGeom_CurveOnSurface, trans: gp_Trsf2d, uFact: number, IsCurv: boolean): TopoDS_Shape;

  // IGESToBRep_TopoCurve.TransferBoundary (method)
  TransferBoundary(start: IGESGeom_Boundary): TopoDS_Shape;

  // IGESToBRep_TopoCurve.TransferBoundaryOnFace (method)
  TransferBoundaryOnFace(face: TopoDS_Face, start: IGESGeom_Boundary, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  // IGESToBRep_TopoCurve.ApproxBSplineCurve (method)
  ApproxBSplineCurve(start: Geom_BSplineCurve): void;

  // IGESToBRep_TopoCurve.NbCurves (method)
  NbCurves(): number;

  // IGESToBRep_TopoCurve.Curve (method)
  Curve(num?: number): Geom_Curve;

  // IGESToBRep_TopoCurve.Approx2dBSplineCurve (method)
  Approx2dBSplineCurve(start: Geom2d_BSplineCurve): void;

  // IGESToBRep_TopoCurve.NbCurves2d (method)
  NbCurves2d(): number;

  // IGESToBRep_TopoCurve.Curve2d (method)
  Curve2d(num?: number): Geom2d_Curve;

  // IGESToBRep_TopoCurve.SetBadCase (method)
  SetBadCase(value: boolean): void;

  // IGESToBRep_TopoCurve.BadCase (method)
  BadCase(): boolean;

  // IGESToBRep_TopoCurve.delete (method)
  delete(): void;

  // IGESToBRep_TopoCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
