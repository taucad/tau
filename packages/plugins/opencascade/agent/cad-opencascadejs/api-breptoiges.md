# libcascade — BRepToIGES

4 top-level symbols. Signatures are verbatim typescript.

// provides methods to transfer BRep entity from CASCADE to IGES
BRepToIGES_BREntity: declare class BRepToIGES_BREntity

constructor

// Initializes the field of the tool BREntity with default creating values
Init(): void;

// Set the value of "TheModel"
SetModel(model: IGESData_IGESModel): void;

// Returns the value of "TheModel"
GetModel(): IGESData_IGESModel;

// Returns the value of the UnitFlag of the header of the model in meters
GetUnit(): number;

// Set the value of "TheMap"
SetTransferProcess(TP: Transfer_FinderProcess): void;

// Returns the value of "TheMap"
GetTransferProcess(): Transfer_FinderProcess;

// Returns the result of the transfert of any Shape If the transfer has failed, this member return a NullEntity
TransferShape(start: TopoDS_Shape, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

// Records a new Fail message
AddFail(start: TopoDS_Shape, amess: string): void;
AddFail(start: Standard_Transient, amess: string): void;
AddFail(start: TopoDS_Shape, amess: string): void;
AddFail(start: Standard_Transient, amess: string): void;

// Records a new Warning message
AddWarning(start: TopoDS_Shape, amess: string): void;
AddWarning(start: Standard_Transient, amess: string): void;
AddWarning(start: TopoDS_Shape, amess: string): void;
AddWarning(start: Standard_Transient, amess: string): void;

// Returns True if start was already treated and has a result in "TheMap" else returns False
HasShapeResult(start: TopoDS_Shape): boolean;
HasShapeResult(start: Standard_Transient): boolean;
HasShapeResult(start: TopoDS_Shape): boolean;
HasShapeResult(start: Standard_Transient): boolean;

// Returns the result of the transfer of the Shape "start" contained in "TheMap"
GetShapeResult(start: TopoDS_Shape): Standard_Transient;
GetShapeResult(start: Standard_Transient): Standard_Transient;
GetShapeResult(start: TopoDS_Shape): Standard_Transient;
GetShapeResult(start: Standard_Transient): Standard_Transient;

// set in "TheMap" the result of the transfer of the Shape "start"
SetShapeResult(start: TopoDS_Shape, result: Standard_Transient): void;
SetShapeResult(start: Standard_Transient, result: Standard_Transient): void;
SetShapeResult(start: TopoDS_Shape, result: Standard_Transient): void;
SetShapeResult(start: Standard_Transient, result: Standard_Transient): void;

// Returns mode for conversion of surfaces (value of parameter write.convertsurface.mode)
GetConvertSurfaceMode(): boolean;

// Returns mode for writing pcurves (value of parameter write.surfacecurve.mode)
GetPCurveMode(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the transfer of Shape Entities from Geom To IGES
BRepToIGES_BRShell: declare class BRepToIGES_BRShell extends BRepToIGES_BREntity

constructor

// Transfer an Shape entity from `TopoDS` to IGES This entity must be a Face or a Shell
TransferShell(start: TopoDS_Shape, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferShell(start: TopoDS_Shell, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferShell(start: TopoDS_Shape, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferShell(start: TopoDS_Shell, theProgress: Message_ProgressRange): IGESData_IGESEntity;

// Transfer a Face entity from `TopoDS` to IGES If this Entity could not be converted, this member returns a NullEntity
TransferFace(start: TopoDS_Face, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the transfer of Shape Entities from Geom To IGES
BRepToIGES_BRSolid: declare class BRepToIGES_BRSolid extends BRepToIGES_BREntity

constructor

// Transfer a Shape entity from `TopoDS` to IGES this entity must be a Solid or a CompSolid or a Compound
TransferSolid(start: TopoDS_Shape, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferSolid(start: TopoDS_Solid, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferSolid(start: TopoDS_Shape, theProgress: Message_ProgressRange): IGESData_IGESEntity;
TransferSolid(start: TopoDS_Solid, theProgress: Message_ProgressRange): IGESData_IGESEntity;

// Transfer an CompSolid entity from `TopoDS` to IGES If this Entity could not be converted, this member returns a NullEntity
TransferCompSolid(start: TopoDS_CompSolid, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

// Transfer a Compound entity from `TopoDS` to IGES If this Entity could not be converted, this member returns a NullEntity
TransferCompound(start: TopoDS_Compound, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the transfer of Shape Entities from Geom To IGES
BRepToIGES_BRWire: declare class BRepToIGES_BRWire extends BRepToIGES_BREntity

constructor

// Transfer a Shape entity from `TopoDS` to IGES this entity must be a Vertex or an Edge or a Wire
TransferWire(start: TopoDS_Shape): IGESData_IGESEntity;
TransferWire(mywire: TopoDS_Wire): IGESData_IGESEntity;
TransferWire(theWire: TopoDS_Wire, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number): { returnValue: IGESData_IGESEntity; theCurve2d: IGESData_IGESEntity; [Symbol.dispose](): void };
TransferWire(start: TopoDS_Shape): IGESData_IGESEntity;
TransferWire(mywire: TopoDS_Wire): IGESData_IGESEntity;
TransferWire(theWire: TopoDS_Wire, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number): { returnValue: IGESData_IGESEntity; theCurve2d: IGESData_IGESEntity; [Symbol.dispose](): void };
TransferWire(start: TopoDS_Shape): IGESData_IGESEntity;
TransferWire(mywire: TopoDS_Wire): IGESData_IGESEntity;
TransferWire(theWire: TopoDS_Wire, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number): { returnValue: IGESData_IGESEntity; theCurve2d: IGESData_IGESEntity; [Symbol.dispose](): void };

// Transfer a Vertex entity from `TopoDS` to IGES If this Entity could not be converted, this member returns a NullEntity
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

// Transfer an Edge 3d entity from `TopoDS` to IGES If edge is REVERSED and isBRepMode is False 3D edge curve is reversed
TransferEdge(theEdge: TopoDS_Edge, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theIsBRepMode: boolean): IGESData_IGESEntity;
TransferEdge(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number, theIsBRepMode: boolean): IGESData_IGESEntity;
TransferEdge(theEdge: TopoDS_Edge, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theIsBRepMode: boolean): IGESData_IGESEntity;
TransferEdge(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theOriginMap: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theLength: number, theIsBRepMode: boolean): IGESData_IGESEntity;
// theEdge: input edge to transfer
// theOriginMap: shapemap contains the original shapes
// theIsBRepMode: indicates if write mode is BRep

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
