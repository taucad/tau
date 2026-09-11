# libcascade — BRepToIGESBRep

1 top-level symbols. Signatures are verbatim typescript.

BRepToIGESBRep_Entity: declare class BRepToIGESBRep_Entity extends BRepToIGES_BREntity

constructor

Clear(): void;

TransferVertexList(): void;

IndexVertex(myvertex: TopoDS_Vertex): number;

AddVertex(myvertex: TopoDS_Vertex): number;

TransferEdgeList(): void;

IndexEdge(myedge: TopoDS_Edge): number;

AddEdge(myedge: TopoDS_Edge, mycurve3d: IGESData_IGESEntity): number;

TransferShape(start: TopoDS_Shape, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

TransferEdge(myedge: TopoDS_Edge): IGESData_IGESEntity;
TransferEdge(myedge: TopoDS_Edge, myface: TopoDS_Face, length: number): IGESData_IGESEntity;
TransferEdge(myedge: TopoDS_Edge): IGESData_IGESEntity;
TransferEdge(myedge: TopoDS_Edge, myface: TopoDS_Face, length: number): IGESData_IGESEntity;

TransferWire(mywire: TopoDS_Wire, myface: TopoDS_Face, length: number): IGESSolid_Loop;

TransferFace(start: TopoDS_Face): IGESSolid_Face;

TransferShell(start: TopoDS_Shell, theProgress?: Message_ProgressRange): IGESSolid_Shell;

TransferSolid(start: TopoDS_Solid, theProgress?: Message_ProgressRange): IGESSolid_ManifoldSolid;

TransferCompSolid(start: TopoDS_CompSolid, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

TransferCompound(start: TopoDS_Compound, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

delete(): void;

[Symbol.dispose](): void;
