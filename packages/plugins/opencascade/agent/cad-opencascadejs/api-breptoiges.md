# libcascade — BRepToIGES

4 top-level symbols. Signatures are verbatim typescript.

BRepToIGES_BREntity: declare class BRepToIGES_BREntity

constructor

Init(): void;

SetModel(model: IGESData_IGESModel): void;

GetModel(): IGESData_IGESModel;

GetUnit(): number;

SetTransferProcess(TP: Transfer_FinderProcess): void;

GetTransferProcess(): Transfer_FinderProcess;

TransferShape(start: TopoDS_Shape, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

AddFail(start: TopoDS_Shape, amess: string): void;
AddFail(start: Standard_Transient, amess: string): void;
AddFail(start: TopoDS_Shape, amess: string): void;
AddFail(start: Standard_Transient, amess: string): void;

AddWarning(start: TopoDS_Shape, amess: string): void;
AddWarning(start: Standard_Transient, amess: string): void;
AddWarning(start: TopoDS_Shape, amess: string): void;
AddWarning(start: Standard_Transient, amess: string): void;

HasShapeResult(start: TopoDS_Shape): boolean;
HasShapeResult(start: Standard_Transient): boolean;
HasShapeResult(start: TopoDS_Shape): boolean;
HasShapeResult(start: Standard_Transient): boolean;

GetShapeResult(start: TopoDS_Shape): Standard_Transient;
GetShapeResult(start: Standard_Transient): Standard_Transient;
GetShapeResult(start: TopoDS_Shape): Standard_Transient;
GetShapeResult(start: Standard_Transient): Standard_Transient;

SetShapeResult(start: TopoDS_Shape, result: Standard_Transient): void;
SetShapeResult(start: Standard_Transient, result: Standard_Transient): void;
SetShapeResult(start: TopoDS_Shape, result: Standard_Transient): void;
SetShapeResult(start: Standard_Transient, result: Standard_Transient): void;

GetConvertSurfaceMode(): boolean;

GetPCurveMode(): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepToIGES_BRShell: declare class BRepToIGES_BRShell extends BRepToIGES_BREntity

constructor

TransferShell(start: TopoDS_Shape, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferShell(start: TopoDS_Shell, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferShell(start: TopoDS_Shape, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferShell(start: TopoDS_Shell, theProgress: Message_ProgressRange): IGESData_IGESEntity;

TransferFace(start: TopoDS_Face, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

delete(): void;

[Symbol.dispose](): void;

BRepToIGES_BRSolid: declare class BRepToIGES_BRSolid extends BRepToIGES_BREntity

constructor

TransferSolid(start: TopoDS_Shape, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferSolid(start: TopoDS_Solid, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferSolid(start: TopoDS_Shape, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferSolid(start: TopoDS_Solid, theProgress: Message_ProgressRange): IGESData_IGESEntity;

TransferCompSolid(start: TopoDS_CompSolid, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

TransferCompound(start: TopoDS_Compound, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

delete(): void;

[Symbol.dispose](): void;

BRepToIGES_BRWire: declare class BRepToIGES_BRWire extends BRepToIGES_BREntity

constructor

TransferWire(start: TopoDS_Shape): IGESData_IGESEntity;
TransferWire(mywire: TopoDS_Wire): IGESData_IGESEntity;
TransferWire(theWire: TopoDS_Wire, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number): { returnValue: IGESData_IGESEntity; theCurve2d: IGESData_IGESEntity; [Symbol.dispose](): void };
TransferWire(start: TopoDS_Shape): IGESData_IGESEntity;
TransferWire(mywire: TopoDS_Wire): IGESData_IGESEntity;
TransferWire(theWire: TopoDS_Wire, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number): { returnValue: IGESData_IGESEntity; theCurve2d: IGESData_IGESEntity; [Symbol.dispose](): void };
TransferWire(start: TopoDS_Shape): IGESData_IGESEntity;
TransferWire(mywire: TopoDS_Wire): IGESData_IGESEntity;
TransferWire(theWire: TopoDS_Wire, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number): { returnValue: IGESData_IGESEntity; theCurve2d: IGESData_IGESEntity; [Symbol.dispose](): void };

TransferVertex(myvertex: TopoDS_Vertex): IGESData_IGESEntity;
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, parameter: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex, myface: TopoDS_Face, mypoint: gp_Pnt2d): IGESData_IGESEntity;
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, myface: TopoDS_Face, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, mysurface: Geom_Surface, myloc: TopLoc_Location, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex): IGESData_IGESEntity;
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, parameter: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex, myface: TopoDS_Face, mypoint: gp_Pnt2d): IGESData_IGESEntity;
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, myface: TopoDS_Face, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, mysurface: Geom_Surface, myloc: TopLoc_Location, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex): IGESData_IGESEntity;
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, parameter: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex, myface: TopoDS_Face, mypoint: gp_Pnt2d): IGESData_IGESEntity;
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, myface: TopoDS_Face, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, mysurface: Geom_Surface, myloc: TopLoc_Location, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex): IGESData_IGESEntity;
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, parameter: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex, myface: TopoDS_Face, mypoint: gp_Pnt2d): IGESData_IGESEntity;
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, myface: TopoDS_Face, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, mysurface: Geom_Surface, myloc: TopLoc_Location, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex): IGESData_IGESEntity;
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, parameter: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex, myface: TopoDS_Face, mypoint: gp_Pnt2d): IGESData_IGESEntity;
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, myface: TopoDS_Face, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };
TransferVertex(myvertex: TopoDS_Vertex, myedge: TopoDS_Edge, mysurface: Geom_Surface, myloc: TopLoc_Location, parameter?: number): { returnValue: IGESData_IGESEntity; parameter: number; [Symbol.dispose](): void };

TransferEdge(theEdge: TopoDS_Edge, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theIsBRepMode: boolean): IGESData_IGESEntity;
TransferEdge(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number, theIsBRepMode: boolean): IGESData_IGESEntity;
TransferEdge(theEdge: TopoDS_Edge, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theIsBRepMode: boolean): IGESData_IGESEntity;
TransferEdge(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number, theIsBRepMode: boolean): IGESData_IGESEntity;

delete(): void;

[Symbol.dispose](): void;
