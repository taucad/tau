# libcascade — BRepClass

6 top-level symbols. Signatures are verbatim typescript.

BRepClass_Edge: declare class BRepClass_Edge

  // BRepClass_Edge.constructor (constructor)
  constructor();
  constructor(E: TopoDS_Edge, F: TopoDS_Face);

  // BRepClass_Edge.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepClass_Edge.Face (method)
  Face(): TopoDS_Face;

  // BRepClass_Edge.NextEdge (method)
  NextEdge(): TopoDS_Edge;

  // BRepClass_Edge.SetNextEdge (method)
  SetNextEdge(theMapVE: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // BRepClass_Edge.MaxTolerance (method)
  MaxTolerance(): number;

  // BRepClass_Edge.SetMaxTolerance (method)
  SetMaxTolerance(theValue: number): void;

  // BRepClass_Edge.UseBndBox (method)
  UseBndBox(): boolean;

  // BRepClass_Edge.SetUseBndBox (method)
  SetUseBndBox(theValue: boolean): void;

  // BRepClass_Edge.delete (method)
  delete(): void;

  // BRepClass_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass_FClass2dOfFClassifier: declare class BRepClass_FClass2dOfFClassifier

  // BRepClass_FClass2dOfFClassifier.constructor (constructor)
  constructor();

  // BRepClass_FClass2dOfFClassifier.Reset (method)
  Reset(L: gp_Lin2d, P: number, Tol: number): void;

  // BRepClass_FClass2dOfFClassifier.Compare (method)
  Compare(E: BRepClass_Edge, Or: TopAbs_Orientation): void;

  // BRepClass_FClass2dOfFClassifier.Parameter (method)
  Parameter(): number;

  // BRepClass_FClass2dOfFClassifier.Intersector (method)
  Intersector(): BRepClass_Intersector;

  // BRepClass_FClass2dOfFClassifier.ClosestIntersection (method)
  ClosestIntersection(): number;

  // BRepClass_FClass2dOfFClassifier.State (method)
  State(): TopAbs_State;

  // BRepClass_FClass2dOfFClassifier.IsHeadOrEnd (method)
  IsHeadOrEnd(): boolean;

  // BRepClass_FClass2dOfFClassifier.delete (method)
  delete(): void;

  // BRepClass_FClass2dOfFClassifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass_FClassifier: declare class BRepClass_FClassifier

  // BRepClass_FClassifier.constructor (constructor)
  constructor();

  // BRepClass_FClassifier.State (method)
  State(): TopAbs_State;

  // BRepClass_FClassifier.Rejected (method)
  Rejected(): boolean;

  // BRepClass_FClassifier.NoWires (method)
  NoWires(): boolean;

  // BRepClass_FClassifier.Edge (method)
  Edge(): BRepClass_Edge;

  // BRepClass_FClassifier.EdgeParameter (method)
  EdgeParameter(): number;

  // BRepClass_FClassifier.Position (method)
  Position(): IntRes2d_Position;

  // BRepClass_FClassifier.delete (method)
  delete(): void;

  // BRepClass_FClassifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass_FaceClassifier: declare class BRepClass_FaceClassifier extends BRepClass_FClassifier

  // BRepClass_FaceClassifier.constructor (constructor)
  constructor();
  constructor(theF: TopoDS_Face, theP: gp_Pnt2d, theTol: number, theUseBndBox?: boolean, theGapCheckTol?: number);
  constructor(theF: TopoDS_Face, theP: gp_Pnt, theTol: number, theUseBndBox?: boolean, theGapCheckTol?: number);

  // BRepClass_FaceClassifier.Perform (method)
  Perform(theF: TopoDS_Face, theP: gp_Pnt2d, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
  Perform(theF: TopoDS_Face, theP: gp_Pnt, theTol: number, theUseBndBox: boolean, theGapCheckTol: number): void;
  Perform(F: unknown, P: gp_Pnt2d, Tol: number): void;

  // BRepClass_FaceClassifier.delete (method)
  delete(): void;

  // BRepClass_FaceClassifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass_FacePassiveClassifier: declare class BRepClass_FacePassiveClassifier

  // BRepClass_FacePassiveClassifier.constructor (constructor)
  constructor();

  // BRepClass_FacePassiveClassifier.Reset (method)
  Reset(L: gp_Lin2d, P: number, Tol: number): void;

  // BRepClass_FacePassiveClassifier.Compare (method)
  Compare(E: BRepClass_Edge, Or: TopAbs_Orientation): void;

  // BRepClass_FacePassiveClassifier.Parameter (method)
  Parameter(): number;

  // BRepClass_FacePassiveClassifier.Intersector (method)
  Intersector(): BRepClass_Intersector;

  // BRepClass_FacePassiveClassifier.ClosestIntersection (method)
  ClosestIntersection(): number;

  // BRepClass_FacePassiveClassifier.State (method)
  State(): TopAbs_State;

  // BRepClass_FacePassiveClassifier.IsHeadOrEnd (method)
  IsHeadOrEnd(): boolean;

  // BRepClass_FacePassiveClassifier.delete (method)
  delete(): void;

  // BRepClass_FacePassiveClassifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepClass_Intersector: declare class BRepClass_Intersector extends Geom2dInt_IntConicCurveOfGInter

  // BRepClass_Intersector.constructor (constructor)
  constructor();

  // BRepClass_Intersector.Perform (method)
  Perform(L: gp_Lin2d, P: number, Tol: number, E: BRepClass_Edge): void;
  Perform(L: gp_Lin2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C: gp_Circ2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(E: gp_Elips2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(Prb: gp_Parab2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(H: gp_Hypr2d, D1: IntRes2d_Domain, PCurve: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  // BRepClass_Intersector.LocalGeometry (method)
  LocalGeometry(E: BRepClass_Edge, U: number, T: gp_Dir2d, N: gp_Dir2d, C?: number): { C: number };

  // BRepClass_Intersector.delete (method)
  delete(): void;

  // BRepClass_Intersector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
