# libcascade — BRepToIGES

4 top-level symbols. Signatures are verbatim typescript.

BRepToIGES_BREntity: declare class BRepToIGES_BREntity

  // BRepToIGES_BREntity.constructor (constructor)
  constructor();

  // BRepToIGES_BREntity.Init (method)
  Init(): void;

  // BRepToIGES_BREntity.SetModel (method)
  SetModel(model: IGESData_IGESModel): void;

  // BRepToIGES_BREntity.GetModel (method)
  GetModel(): IGESData_IGESModel;

  // BRepToIGES_BREntity.GetUnit (method)
  GetUnit(): number;

  // BRepToIGES_BREntity.SetTransferProcess (method)
  SetTransferProcess(TP: Transfer_FinderProcess): void;

  // BRepToIGES_BREntity.GetTransferProcess (method)
  GetTransferProcess(): Transfer_FinderProcess;

  // BRepToIGES_BREntity.TransferShape (method)
  TransferShape(start: TopoDS_Shape, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

  // BRepToIGES_BREntity.AddFail (method)
  AddFail(start: TopoDS_Shape, amess: string): void;
  AddFail(start: Standard_Transient, amess: string): void;

  // BRepToIGES_BREntity.AddWarning (method)
  AddWarning(start: TopoDS_Shape, amess: string): void;
  AddWarning(start: Standard_Transient, amess: string): void;

  // BRepToIGES_BREntity.HasShapeResult (method)
  HasShapeResult(start: TopoDS_Shape): boolean;
  HasShapeResult(start: Standard_Transient): boolean;

  // BRepToIGES_BREntity.GetShapeResult (method)
  GetShapeResult(start: TopoDS_Shape): Standard_Transient;
  GetShapeResult(start: Standard_Transient): Standard_Transient;

  // BRepToIGES_BREntity.SetShapeResult (method)
  SetShapeResult(start: TopoDS_Shape, result: Standard_Transient): void;
  SetShapeResult(start: Standard_Transient, result: Standard_Transient): void;

  // BRepToIGES_BREntity.GetConvertSurfaceMode (method)
  GetConvertSurfaceMode(): boolean;

  // BRepToIGES_BREntity.GetPCurveMode (method)
  GetPCurveMode(): boolean;

  // BRepToIGES_BREntity.delete (method)
  delete(): void;

  // BRepToIGES_BREntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepToIGES_BRShell: declare class BRepToIGES_BRShell extends BRepToIGES_BREntity

  // BRepToIGES_BRShell.constructor (constructor)
  constructor();
  constructor(BR: BRepToIGES_BREntity);

  // BRepToIGES_BRShell.TransferShell (method)
  TransferShell(start: TopoDS_Shape, theProgress: Message_ProgressRange): IGESData_IGESEntity;
  TransferShell(start: TopoDS_Shell, theProgress: Message_ProgressRange): IGESData_IGESEntity;

  // BRepToIGES_BRShell.TransferFace (method)
  TransferFace(start: TopoDS_Face, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

  // BRepToIGES_BRShell.delete (method)
  delete(): void;

  // BRepToIGES_BRShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepToIGES_BRSolid: declare class BRepToIGES_BRSolid extends BRepToIGES_BREntity

  // BRepToIGES_BRSolid.constructor (constructor)
  constructor();
  constructor(BR: BRepToIGES_BREntity);

  // BRepToIGES_BRSolid.TransferSolid (method)
  TransferSolid(start: TopoDS_Shape, theProgress: Message_ProgressRange): IGESData_IGESEntity;
  TransferSolid(start: TopoDS_Solid, theProgress: Message_ProgressRange): IGESData_IGESEntity;

  // BRepToIGES_BRSolid.TransferCompSolid (method)
  TransferCompSolid(start: TopoDS_CompSolid, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

  // BRepToIGES_BRSolid.TransferCompound (method)
  TransferCompound(start: TopoDS_Compound, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

  // BRepToIGES_BRSolid.delete (method)
  delete(): void;

  // BRepToIGES_BRSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepToIGES_BRWire: declare class BRepToIGES_BRWire extends BRepToIGES_BREntity

  // BRepToIGES_BRWire.constructor (constructor)
  constructor();
  constructor(BR: BRepToIGES_BREntity);

  // BRepToIGES_BRWire.TransferWire (method)
  TransferWire(start: TopoDS_Shape): IGESData_IGESEntity;
  TransferWire(mywire: TopoDS_Wire): IGESData_IGESEntity;
  TransferWire(theWire: TopoDS_Wire, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number): { returnValue: IGESData_IGESEntity; theCurve2d: IGESData_IGESEntity; [Symbol.dispose](): void };

  // BRepToIGES_BRWire.TransferVertex (method)
  TransferVertex(myvertex: TopoDS_Vertex): IGESData_IGESEntity;
  TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, parameter: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
  TransferVertex(myvertex: TopoDS_Vertex, myface: TopoDS_Face, mypoint: gp_Pnt2d): IGESData_IGESEntity;
  TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, myface: TopoDS_Face, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
  TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, mysurface: Geom_Surface, myloc: TopLoc_Location, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };

  // BRepToIGES_BRWire.TransferEdge (method)
  TransferEdge(theEdge: TopoDS_Edge, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theIsBRepMode: boolean): IGESData_IGESEntity;
  TransferEdge(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number, theIsBRepMode: boolean): IGESData_IGESEntity;

  // BRepToIGES_BRWire.delete (method)
  delete(): void;

  // BRepToIGES_BRWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
