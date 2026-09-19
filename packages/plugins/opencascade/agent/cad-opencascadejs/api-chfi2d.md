# libcascade — ChFi2d

7 top-level symbols. Signatures are verbatim typescript.

ChFi2d: declare class ChFi2d

  constructor

  static CommonVertex(E1: TopoDS_Edge, E2: TopoDS_Edge, V: TopoDS_Vertex): boolean;

  static FindConnectedEdges(F: TopoDS_Face, V: TopoDS_Vertex, E1: TopoDS_Edge, E2: TopoDS_Edge): ChFi2d_ConstructionError;

  delete(): void;

  [Symbol.dispose](): void;

ChFi2d_AnaFilletAlgo: declare class ChFi2d_AnaFilletAlgo

  constructor

  Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;
  Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;

  Perform(radius: number): boolean;

  Result(e1: TopoDS_Edge, e2: TopoDS_Edge): TopoDS_Edge;

  delete(): void;

  [Symbol.dispose](): void;

ChFi2d_Builder: declare class ChFi2d_Builder

  constructor

  Init(F: TopoDS_Face): void;
  Init(RefFace: TopoDS_Face, ModFace: TopoDS_Face): void;
  Init(F: TopoDS_Face): void;
  Init(RefFace: TopoDS_Face, ModFace: TopoDS_Face): void;

  AddFillet(V: TopoDS_Vertex, Radius: number): TopoDS_Edge;

  ModifyFillet(Fillet: TopoDS_Edge, Radius: number): TopoDS_Edge;

  RemoveFillet(Fillet: TopoDS_Edge): TopoDS_Vertex;

  AddChamfer(E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
  AddChamfer(E: TopoDS_Edge, V: TopoDS_Vertex, D: number, Ang: number): TopoDS_Edge;
  AddChamfer(E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
  AddChamfer(E: TopoDS_Edge, V: TopoDS_Vertex, D: number, Ang: number): TopoDS_Edge;

  ModifyChamfer(Chamfer: TopoDS_Edge, E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
  ModifyChamfer(Chamfer: TopoDS_Edge, E: TopoDS_Edge, D: number, Ang: number): TopoDS_Edge;
  ModifyChamfer(Chamfer: TopoDS_Edge, E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
  ModifyChamfer(Chamfer: TopoDS_Edge, E: TopoDS_Edge, D: number, Ang: number): TopoDS_Edge;

  RemoveChamfer(Chamfer: TopoDS_Edge): TopoDS_Vertex;

  Result(): TopoDS_Face;

  IsModified(E: TopoDS_Edge): boolean;

  FilletEdges(): NCollection_Sequence_TopoDS_Shape;

  NbFillet(): number;

  ChamferEdges(): NCollection_Sequence_TopoDS_Shape;

  NbChamfer(): number;

  HasDescendant(E: TopoDS_Edge): boolean;

  DescendantEdge(E: TopoDS_Edge): TopoDS_Edge;

  BasisEdge(E: TopoDS_Edge): TopoDS_Edge;

  Status(): ChFi2d_ConstructionError;

  delete(): void;

  [Symbol.dispose](): void;

ChFi2d_ChamferAPI: declare class ChFi2d_ChamferAPI

  constructor

  Init(theWire: TopoDS_Wire): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge): void;
  Init(theWire: TopoDS_Wire): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge): void;

  Perform(): boolean;

  Result(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, theLength1: number, theLength2: number): TopoDS_Edge;

  delete(): void;

  [Symbol.dispose](): void;

ChFi2d_ConstructionError: typeof ChFi2d_ConstructionError[keyof typeof ChFi2d_ConstructionError]

ChFi2d_FilletAPI: declare class ChFi2d_FilletAPI

  constructor

  Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;
  Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;

  Perform(theRadius: number): boolean;

  NbResults(thePoint: gp_Pnt): number;

  Result(thePoint: gp_Pnt, theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, iSolution: number): TopoDS_Edge;

  delete(): void;

  [Symbol.dispose](): void;

ChFi2d_FilletAlgo: declare class ChFi2d_FilletAlgo

  constructor

  Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;
  Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;

  Perform(theRadius: number): boolean;

  NbResults(thePoint: gp_Pnt): number;

  Result(thePoint: gp_Pnt, theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, iSolution: number): TopoDS_Edge;

  delete(): void;

  [Symbol.dispose](): void;
