# libcascade — ChFi2d

7 top-level symbols. Signatures are verbatim typescript.

ChFi2d: declare class ChFi2d

  // ChFi2d.constructor (constructor)
  constructor();

  // ChFi2d.CommonVertex (method)
  static CommonVertex(E1: TopoDS_Edge, E2: TopoDS_Edge, V: TopoDS_Vertex): boolean;

  // ChFi2d.FindConnectedEdges (method)
  static FindConnectedEdges(F: TopoDS_Face, V: TopoDS_Vertex, E1: TopoDS_Edge, E2: TopoDS_Edge): ChFi2d_ConstructionError;

  // ChFi2d.delete (method)
  delete(): void;

  // ChFi2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFi2d_AnaFilletAlgo: declare class ChFi2d_AnaFilletAlgo

  // ChFi2d_AnaFilletAlgo.constructor (constructor)
  constructor();
  constructor(theWire: TopoDS_Wire, thePlane: gp_Pln);
  constructor(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln);

  // ChFi2d_AnaFilletAlgo.Init (method)
  Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;

  // ChFi2d_AnaFilletAlgo.Perform (method)
  Perform(radius: number): boolean;

  // ChFi2d_AnaFilletAlgo.Result (method)
  Result(e1: TopoDS_Edge, e2: TopoDS_Edge): TopoDS_Edge;

  // ChFi2d_AnaFilletAlgo.delete (method)
  delete(): void;

  // ChFi2d_AnaFilletAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFi2d_Builder: declare class ChFi2d_Builder

  // ChFi2d_Builder.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face);

  // ChFi2d_Builder.Init (method)
  Init(F: TopoDS_Face): void;
  Init(RefFace: TopoDS_Face, ModFace: TopoDS_Face): void;

  // ChFi2d_Builder.AddFillet (method)
  AddFillet(V: TopoDS_Vertex, Radius: number): TopoDS_Edge;

  // ChFi2d_Builder.ModifyFillet (method)
  ModifyFillet(Fillet: TopoDS_Edge, Radius: number): TopoDS_Edge;

  // ChFi2d_Builder.RemoveFillet (method)
  RemoveFillet(Fillet: TopoDS_Edge): TopoDS_Vertex;

  // ChFi2d_Builder.AddChamfer (method)
  AddChamfer(E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
  AddChamfer(E: TopoDS_Edge, V: TopoDS_Vertex, D: number, Ang: number): TopoDS_Edge;

  // ChFi2d_Builder.ModifyChamfer (method)
  ModifyChamfer(Chamfer: TopoDS_Edge, E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
  ModifyChamfer(Chamfer: TopoDS_Edge, E: TopoDS_Edge, D: number, Ang: number): TopoDS_Edge;

  // ChFi2d_Builder.RemoveChamfer (method)
  RemoveChamfer(Chamfer: TopoDS_Edge): TopoDS_Vertex;

  // ChFi2d_Builder.Result (method)
  Result(): TopoDS_Face;

  // ChFi2d_Builder.IsModified (method)
  IsModified(E: TopoDS_Edge): boolean;

  // ChFi2d_Builder.FilletEdges (method)
  FilletEdges(): NCollection_Sequence_TopoDS_Shape;

  // ChFi2d_Builder.NbFillet (method)
  NbFillet(): number;

  // ChFi2d_Builder.ChamferEdges (method)
  ChamferEdges(): NCollection_Sequence_TopoDS_Shape;

  // ChFi2d_Builder.NbChamfer (method)
  NbChamfer(): number;

  // ChFi2d_Builder.HasDescendant (method)
  HasDescendant(E: TopoDS_Edge): boolean;

  // ChFi2d_Builder.DescendantEdge (method)
  DescendantEdge(E: TopoDS_Edge): TopoDS_Edge;

  // ChFi2d_Builder.BasisEdge (method)
  BasisEdge(E: TopoDS_Edge): TopoDS_Edge;

  // ChFi2d_Builder.Status (method)
  Status(): ChFi2d_ConstructionError;

  // ChFi2d_Builder.delete (method)
  delete(): void;

  // ChFi2d_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFi2d_ChamferAPI: declare class ChFi2d_ChamferAPI

  // ChFi2d_ChamferAPI.constructor (constructor)
  constructor();
  constructor(theWire: TopoDS_Wire);
  constructor(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge);

  // ChFi2d_ChamferAPI.Init (method)
  Init(theWire: TopoDS_Wire): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge): void;

  // ChFi2d_ChamferAPI.Perform (method)
  Perform(): boolean;

  // ChFi2d_ChamferAPI.Result (method)
  Result(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, theLength1: number, theLength2: number): TopoDS_Edge;

  // ChFi2d_ChamferAPI.delete (method)
  delete(): void;

  // ChFi2d_ChamferAPI.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFi2d_ConstructionError: typeof ChFi2d_ConstructionError[keyof typeof ChFi2d_ConstructionError]

  readonly ChFi2d_NotPlanar: 'ChFi2d_NotPlanar'

  readonly ChFi2d_NoFace: 'ChFi2d_NoFace'

  readonly ChFi2d_InitialisationError: 'ChFi2d_InitialisationError'

  readonly ChFi2d_ParametersError: 'ChFi2d_ParametersError'

  readonly ChFi2d_Ready: 'ChFi2d_Ready'

  readonly ChFi2d_IsDone: 'ChFi2d_IsDone'

  readonly ChFi2d_ComputationError: 'ChFi2d_ComputationError'

  readonly ChFi2d_ConnexionError: 'ChFi2d_ConnexionError'

  readonly ChFi2d_TangencyError: 'ChFi2d_TangencyError'

  readonly ChFi2d_FirstEdgeDegenerated: 'ChFi2d_FirstEdgeDegenerated'

  readonly ChFi2d_LastEdgeDegenerated: 'ChFi2d_LastEdgeDegenerated'

  readonly ChFi2d_BothEdgesDegenerated: 'ChFi2d_BothEdgesDegenerated'

  readonly ChFi2d_NotAuthorized: 'ChFi2d_NotAuthorized'

ChFi2d_FilletAPI: declare class ChFi2d_FilletAPI

  // ChFi2d_FilletAPI.constructor (constructor)
  constructor();
  constructor(theWire: TopoDS_Wire, thePlane: gp_Pln);
  constructor(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln);

  // ChFi2d_FilletAPI.Init (method)
  Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;

  // ChFi2d_FilletAPI.Perform (method)
  Perform(theRadius: number): boolean;

  // ChFi2d_FilletAPI.NbResults (method)
  NbResults(thePoint: gp_Pnt): number;

  // ChFi2d_FilletAPI.Result (method)
  Result(thePoint: gp_Pnt, theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, iSolution: number): TopoDS_Edge;

  // ChFi2d_FilletAPI.delete (method)
  delete(): void;

  // ChFi2d_FilletAPI.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFi2d_FilletAlgo: declare class ChFi2d_FilletAlgo

  // ChFi2d_FilletAlgo.constructor (constructor)
  constructor();
  constructor(theWire: TopoDS_Wire, thePlane: gp_Pln);
  constructor(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln);

  // ChFi2d_FilletAlgo.Init (method)
  Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
  Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;

  // ChFi2d_FilletAlgo.Perform (method)
  Perform(theRadius: number): boolean;

  // ChFi2d_FilletAlgo.NbResults (method)
  NbResults(thePoint: gp_Pnt): number;

  // ChFi2d_FilletAlgo.Result (method)
  Result(thePoint: gp_Pnt, theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, iSolution: number): TopoDS_Edge;

  // ChFi2d_FilletAlgo.delete (method)
  delete(): void;

  // ChFi2d_FilletAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
