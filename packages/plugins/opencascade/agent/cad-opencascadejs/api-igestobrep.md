# libcascade — IGESToBRep

11 top-level symbols. Signatures are verbatim typescript.

IGESToBRep: declare class IGESToBRep

  constructor

  static Init(): void;

  static SetAlgoContainer(aContainer: IGESToBRep_AlgoContainer): void;

  static AlgoContainer(): IGESToBRep_AlgoContainer;

  static IsCurveAndSurface(start: IGESData_IGESEntity): boolean;

  static IsBasicCurve(start: IGESData_IGESEntity): boolean;

  static IsBasicSurface(start: IGESData_IGESEntity): boolean;

  static IsTopoCurve(start: IGESData_IGESEntity): boolean;

  static IsTopoSurface(start: IGESData_IGESEntity): boolean;

  static IsBRepEntity(start: IGESData_IGESEntity): boolean;

  static IGESCurveToSequenceOfIGESCurve(curve: IGESData_IGESEntity): { returnValue: number; sequence: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

  static TransferPCurve(fromedge: TopoDS_Edge, toedge: TopoDS_Edge, face: TopoDS_Face): boolean;

  delete(): void;

  [Symbol.dispose](): void;

IGESToBRep_Actor: declare class IGESToBRep_Actor extends Transfer_ActorOfTransientProcess

  constructor

  SetModel(model: Interface_InterfaceModel): void;

  SetContinuity(continuity?: number): void;

  GetContinuity(): number;

  Recognize(start: Standard_Transient): boolean;

  Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

  UsedTolerance(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESToBRep_AlgoContainer: declare class IGESToBRep_AlgoContainer extends Standard_Transient

  constructor

  SetToolContainer(TC: IGESToBRep_ToolContainer): void;

  ToolContainer(): IGESToBRep_ToolContainer;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESToBRep_BRepEntity: declare class IGESToBRep_BRepEntity extends IGESToBRep_CurveAndSurface

  constructor

  TransferBRepEntity(start: IGESData_IGESEntity, theProgress?: Message_ProgressRange): TopoDS_Shape;

  TransferVertex(start: IGESSolid_VertexList, index: number): TopoDS_Vertex;

  TransferEdge(start: IGESSolid_EdgeList, index: number): TopoDS_Shape;

  TransferLoop(start: IGESSolid_Loop, Face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  TransferFace(start: IGESSolid_Face): TopoDS_Shape;

  TransferShell(start: IGESSolid_Shell, theProgress?: Message_ProgressRange): TopoDS_Shape;

  TransferManifoldSolid(start: IGESSolid_ManifoldSolid, theProgress?: Message_ProgressRange): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

IGESToBRep_BasicCurve: declare class IGESToBRep_BasicCurve extends IGESToBRep_CurveAndSurface

  constructor

  TransferBasicCurve(start: IGESData_IGESEntity): Geom_Curve;

  Transfer2dBasicCurve(start: IGESData_IGESEntity): Geom2d_Curve;

  TransferBSplineCurve(start: IGESGeom_BSplineCurve): Geom_Curve;

  Transfer2dBSplineCurve(start: IGESGeom_BSplineCurve): Geom2d_Curve;

  TransferCircularArc(start: IGESGeom_CircularArc): Geom_Curve;

  Transfer2dCircularArc(start: IGESGeom_CircularArc): Geom2d_Curve;

  TransferConicArc(start: IGESGeom_ConicArc): Geom_Curve;

  Transfer2dConicArc(start: IGESGeom_ConicArc): Geom2d_Curve;

  TransferCopiousData(start: IGESGeom_CopiousData): Geom_BSplineCurve;

  Transfer2dCopiousData(start: IGESGeom_CopiousData): Geom2d_BSplineCurve;

  TransferLine(start: IGESGeom_Line): Geom_Curve;

  Transfer2dLine(start: IGESGeom_Line): Geom2d_Curve;

  TransferSplineCurve(start: IGESGeom_SplineCurve): Geom_BSplineCurve;

  Transfer2dSplineCurve(start: IGESGeom_SplineCurve): Geom2d_BSplineCurve;

  TransferTransformation(start: IGESGeom_TransformationMatrix): Geom_Transformation;

  delete(): void;

  [Symbol.dispose](): void;

IGESToBRep_BasicSurface: declare class IGESToBRep_BasicSurface extends IGESToBRep_CurveAndSurface

  constructor

  TransferBasicSurface(start: IGESData_IGESEntity): Geom_Surface;

  TransferPlaneSurface(start: IGESSolid_PlaneSurface): Geom_Plane;

  TransferRigthCylindricalSurface(start: IGESSolid_CylindricalSurface): Geom_CylindricalSurface;

  TransferRigthConicalSurface(start: IGESSolid_ConicalSurface): Geom_ConicalSurface;

  TransferSphericalSurface(start: IGESSolid_SphericalSurface): Geom_SphericalSurface;

  TransferToroidalSurface(start: IGESSolid_ToroidalSurface): Geom_ToroidalSurface;

  TransferSplineSurface(start: IGESGeom_SplineSurface): Geom_BSplineSurface;

  TransferBSplineSurface(start: IGESGeom_BSplineSurface): Geom_BSplineSurface;

  delete(): void;

  [Symbol.dispose](): void;

IGESToBRep_CurveAndSurface: declare class IGESToBRep_CurveAndSurface

  constructor

  Init(): void;

  SetEpsilon(eps: number): void;

  GetEpsilon(): number;

  SetEpsCoeff(eps: number): void;

  GetEpsCoeff(): number;

  SetEpsGeom(eps: number): void;

  GetEpsGeom(): number;

  SetMinTol(mintol: number): void;

  SetMaxTol(maxtol: number): void;

  UpdateMinMaxTol(): void;

  GetMinTol(): number;

  GetMaxTol(): number;

  SetModeApprox(mode: boolean): void;

  GetModeApprox(): boolean;

  SetModeTransfer(mode: boolean): void;

  GetModeTransfer(): boolean;

  SetOptimized(optimized: boolean): void;

  GetOptimized(): boolean;

  GetUnitFactor(): number;

  SetSurfaceCurve(ival: number): void;

  GetSurfaceCurve(): number;

  SetModel(model: IGESData_IGESModel): void;

  GetModel(): IGESData_IGESModel;

  SetContinuity(continuity: number): void;

  GetContinuity(): number;

  SetTransferProcess(TP: Transfer_TransientProcess): void;

  GetTransferProcess(): Transfer_TransientProcess;

  TransferCurveAndSurface(start: IGESData_IGESEntity, theProgress?: Message_ProgressRange): TopoDS_Shape;

  TransferGeometry(start: IGESData_IGESEntity, theProgress?: Message_ProgressRange): TopoDS_Shape;

  SendFail(start: IGESData_IGESEntity, amsg: Message_Msg): void;

  SendWarning(start: IGESData_IGESEntity, amsg: Message_Msg): void;

  SendMsg(start: IGESData_IGESEntity, amsg: Message_Msg): void;

  HasShapeResult(start: IGESData_IGESEntity): boolean;

  GetShapeResult(start: IGESData_IGESEntity): TopoDS_Shape;
  GetShapeResult(start: IGESData_IGESEntity, num: number): TopoDS_Shape;
  GetShapeResult(start: IGESData_IGESEntity): TopoDS_Shape;
  GetShapeResult(start: IGESData_IGESEntity, num: number): TopoDS_Shape;

  SetShapeResult(start: IGESData_IGESEntity, result: TopoDS_Shape): void;

  NbShapeResult(start: IGESData_IGESEntity): number;

  AddShapeResult(start: IGESData_IGESEntity, result: TopoDS_Shape): void;

  SetSurface(theSurface: Geom_Surface): void;

  Surface(): Geom_Surface;

  GetUVResolution(): number;

  delete(): void;

  [Symbol.dispose](): void;

IGESToBRep_IGESBoundary: declare class IGESToBRep_IGESBoundary extends Standard_Transient

  constructor

  Init(CS: IGESToBRep_CurveAndSurface, entity: IGESData_IGESEntity, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number, filepreference: number): void;

  WireData(): ShapeExtend_WireData;

  WireData3d(): ShapeExtend_WireData;

  WireData2d(): ShapeExtend_WireData;

  Transfer(okCurve: boolean, okCurve3d: boolean, okCurve2d: boolean, curve3d: IGESData_IGESEntity, toreverse3d: boolean, curves2d: NCollection_HArray1_handle_IGESData_IGESEntity, number_: number): { returnValue: boolean; okCurve: boolean; okCurve3d: boolean; okCurve2d: boolean };
  Transfer(okCurve: boolean, okCurve3d: boolean, okCurve2d: boolean, curve3d: ShapeExtend_WireData, curves2d: NCollection_HArray1_handle_IGESData_IGESEntity, toreverse2d: boolean, number_: number): { returnValue: boolean; okCurve: boolean; okCurve3d: boolean; okCurve2d: boolean; lsewd: ShapeExtend_WireData; [Symbol.dispose](): void };
  Transfer(okCurve: boolean, okCurve3d: boolean, okCurve2d: boolean, curve3d: IGESData_IGESEntity, toreverse3d: boolean, curves2d: NCollection_HArray1_handle_IGESData_IGESEntity, number_: number): { returnValue: boolean; okCurve: boolean; okCurve3d: boolean; okCurve2d: boolean };
  Transfer(okCurve: boolean, okCurve3d: boolean, okCurve2d: boolean, curve3d: ShapeExtend_WireData, curves2d: NCollection_HArray1_handle_IGESData_IGESEntity, toreverse2d: boolean, number_: number): { returnValue: boolean; okCurve: boolean; okCurve3d: boolean; okCurve2d: boolean; lsewd: ShapeExtend_WireData; [Symbol.dispose](): void };

  Check(result: boolean, checkclosure: boolean, okCurve3d: boolean, okCurve2d: boolean): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESToBRep_Reader: declare class IGESToBRep_Reader

  constructor

  LoadFile(filename: string): number;

  SetModel(model: IGESData_IGESModel): void;

  Model(): IGESData_IGESModel;

  SetTransientProcess(TP: Transfer_TransientProcess): void;

  TransientProcess(): Transfer_TransientProcess;

  Actor(): IGESToBRep_Actor;

  Clear(): void;

  Check(withprint: boolean): boolean;

  TransferRoots(onlyvisible?: boolean, theProgress?: Message_ProgressRange): void;

  Transfer(num: number, theProgress?: Message_ProgressRange): boolean;

  IsDone(): boolean;

  UsedTolerance(): number;

  NbShapes(): number;

  Shape(num?: number): TopoDS_Shape;

  OneShape(): TopoDS_Shape;

  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  SetShapeProcessFlags(theFlags: any): void;

  GetShapeProcessFlags(): any;

  delete(): void;

  [Symbol.dispose](): void;

IGESToBRep_ToolContainer: declare class IGESToBRep_ToolContainer extends Standard_Transient

  constructor

  IGESBoundary(): IGESToBRep_IGESBoundary;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESToBRep_TopoCurve: declare class IGESToBRep_TopoCurve extends IGESToBRep_CurveAndSurface

  constructor

  TransferTopoCurve(start: IGESData_IGESEntity): TopoDS_Shape;

  Transfer2dTopoCurve(start: IGESData_IGESEntity, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  TransferTopoBasicCurve(start: IGESData_IGESEntity): TopoDS_Shape;

  Transfer2dTopoBasicCurve(start: IGESData_IGESEntity, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  TransferPoint(start: IGESGeom_Point): TopoDS_Vertex;

  Transfer2dPoint(start: IGESGeom_Point): TopoDS_Vertex;

  TransferCompositeCurve(start: IGESGeom_CompositeCurve): TopoDS_Shape;

  Transfer2dCompositeCurve(start: IGESGeom_CompositeCurve, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  TransferOffsetCurve(start: IGESGeom_OffsetCurve): TopoDS_Shape;

  Transfer2dOffsetCurve(start: IGESGeom_OffsetCurve, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  TransferCurveOnSurface(start: IGESGeom_CurveOnSurface): TopoDS_Shape;

  TransferCurveOnFace(face: TopoDS_Face, start: IGESGeom_CurveOnSurface, trans: gp_Trsf2d, uFact: number, IsCurv: boolean): TopoDS_Shape;

  TransferBoundary(start: IGESGeom_Boundary): TopoDS_Shape;

  TransferBoundaryOnFace(face: TopoDS_Face, start: IGESGeom_Boundary, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

  ApproxBSplineCurve(start: Geom_BSplineCurve): void;

  NbCurves(): number;

  Curve(num?: number): Geom_Curve;

  Approx2dBSplineCurve(start: Geom2d_BSplineCurve): void;

  NbCurves2d(): number;

  Curve2d(num?: number): Geom2d_Curve;

  SetBadCase(value: boolean): void;

  BadCase(): boolean;

  delete(): void;

  [Symbol.dispose](): void;
