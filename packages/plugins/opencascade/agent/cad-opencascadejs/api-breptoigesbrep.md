# libcascade — BRepToIGESBRep

1 top-level symbols. Signatures are verbatim typescript.

// provides methods to transfer BRep entity from CASCADE to IGESBRep
BRepToIGESBRep_Entity: declare class BRepToIGESBRep_Entity extends BRepToIGES_BREntity

constructor

// Clears the contents of the fields
Clear(): void;

// Create the VertexList entity
TransferVertexList(): void;

// Returns the index of <myvertex> in "myVertices"
IndexVertex(myvertex: TopoDS_Vertex): number;

// Stores <myvertex> in "myVertices" Returns the index of <myvertex>
AddVertex(myvertex: TopoDS_Vertex): number;

// Transfer an Edge entity from `TopoDS` to IGES
TransferEdgeList(): void;

// Returns the index of <myedge> in "myEdges"
IndexEdge(myedge: TopoDS_Edge): number;

// Stores <myedge> in "myEdges" and <mycurve3d> in "myCurves"
AddEdge(myedge: TopoDS_Edge, mycurve3d: IGESData_IGESEntity): number;

// Returns the result of the transfert of any Shape If the transfer has failed, this member returns a NullEntity
TransferShape(start: TopoDS_Shape, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

// Transfer an Edge entity from `TopoDS` to IGES If this Entity could not be converted, this member returns a NullEntity
TransferEdge(myedge: TopoDS_Edge): IGESData_IGESEntity;
TransferEdge(myedge: TopoDS_Edge, myface: TopoDS_Face, length: number): IGESData_IGESEntity;
TransferEdge(myedge: TopoDS_Edge): IGESData_IGESEntity;
TransferEdge(myedge: TopoDS_Edge, myface: TopoDS_Face, length: number): IGESData_IGESEntity;

// Transfer a Wire entity from `TopoDS` to IGES
TransferWire(mywire: TopoDS_Wire, myface: TopoDS_Face, length: number): IGESSolid_Loop;

// Transfer a Face entity from `TopoDS` to IGES If this Entity could not be converted, this member returns a NullEntity
TransferFace(start: TopoDS_Face): IGESSolid_Face;

// Transfer an Shell entity from `TopoDS` to IGES If this Entity could not be converted, this member returns a NullEntity
TransferShell(start: TopoDS_Shell, theProgress?: Message_ProgressRange): IGESSolid_Shell;

// Transfer a Solid entity from `TopoDS` to IGES If this Entity could not be converted, this member returns a NullEntity
TransferSolid(start: TopoDS_Solid, theProgress?: Message_ProgressRange): IGESSolid_ManifoldSolid;

// Transfer an CompSolid entity from `TopoDS` to IGES If this Entity could not be converted, this member returns a NullEntity
TransferCompSolid(start: TopoDS_CompSolid, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

// Transfer a Compound entity from `TopoDS` to IGES If this Entity could not be converted, this member returns a NullEntity
TransferCompound(start: TopoDS_Compound, theProgress?: Message_ProgressRange): IGESData_IGESEntity;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
