# libcascade — BRepToIGESBRep

1 top-level symbols. Signatures are verbatim typescript.

BRepToIGESBRep_Entity: declare class BRepToIGESBRep_Entity extends BRepToIGES_BREntity

  // BRepToIGESBRep_Entity.constructor (constructor)
  constructor();

  // BRepToIGESBRep_Entity.Clear (method)
  Clear(): void;

  // BRepToIGESBRep_Entity.TransferVertexList (method)
  TransferVertexList(): void;

  // BRepToIGESBRep_Entity.IndexVertex (method)
  IndexVertex(myvertex: TopoDS_Vertex): number;

  // BRepToIGESBRep_Entity.AddVertex (method)
  AddVertex(myvertex: TopoDS_Vertex): number;

  // BRepToIGESBRep_Entity.TransferEdgeList (method)
  TransferEdgeList(): void;

  // BRepToIGESBRep_Entity.IndexEdge (method)
  IndexEdge(myedge: TopoDS_Edge): number;

  // BRepToIGESBRep_Entity.AddEdge (method)
  AddEdge(myedge: TopoDS_Edge, mycurve3d: IGESData_IGESEntity): number;

  // BRepToIGESBRep_Entity.TransferShape (method)
  TransferShape(start: TopoDS_Shape, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

  // BRepToIGESBRep_Entity.TransferEdge (method)
  TransferEdge(myedge: TopoDS_Edge): IGESData_IGESEntity;
  TransferEdge(myedge: TopoDS_Edge, myface: TopoDS_Face, length: number): IGESData_IGESEntity;

  // BRepToIGESBRep_Entity.TransferWire (method)
  TransferWire(mywire: TopoDS_Wire, myface: TopoDS_Face, length: number): IGESSolid_Loop;

  // BRepToIGESBRep_Entity.TransferFace (method)
  TransferFace(start: TopoDS_Face): IGESSolid_Face;

  // BRepToIGESBRep_Entity.TransferShell (method)
  TransferShell(start: TopoDS_Shell, theProgress?: Message_ProgressRange): IGESSolid_Shell;

  // BRepToIGESBRep_Entity.TransferSolid (method)
  TransferSolid(start: TopoDS_Solid, theProgress?: Message_ProgressRange): IGESSolid_ManifoldSolid;

  // BRepToIGESBRep_Entity.TransferCompSolid (method)
  TransferCompSolid(start: TopoDS_CompSolid, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

  // BRepToIGESBRep_Entity.TransferCompound (method)
  TransferCompound(start: TopoDS_Compound, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

  // BRepToIGESBRep_Entity.delete (method)
  delete(): void;

  // BRepToIGESBRep_Entity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
