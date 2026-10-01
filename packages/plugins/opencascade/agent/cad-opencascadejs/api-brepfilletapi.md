# libcascade — BRepFilletAPI

4 top-level symbols. Signatures are verbatim typescript.

BRepFilletAPI_LocalOperation: declare class BRepFilletAPI_LocalOperation extends BRepBuilderAPI_MakeShape

  // BRepFilletAPI_LocalOperation.Add (method)
  Add(E: TopoDS_Edge): void;

  // BRepFilletAPI_LocalOperation.ResetContour (method)
  ResetContour(IC: number): void;

  // BRepFilletAPI_LocalOperation.NbContours (method)
  NbContours(): number;

  // BRepFilletAPI_LocalOperation.Contour (method)
  Contour(E: TopoDS_Edge): number;

  // BRepFilletAPI_LocalOperation.NbEdges (method)
  NbEdges(I: number): number;

  // BRepFilletAPI_LocalOperation.Edge (method)
  Edge(I: number, J: number): TopoDS_Edge;

  // BRepFilletAPI_LocalOperation.Remove (method)
  Remove(E: TopoDS_Edge): void;

  // BRepFilletAPI_LocalOperation.Length (method)
  Length(IC: number): number;

  // BRepFilletAPI_LocalOperation.FirstVertex (method)
  FirstVertex(IC: number): TopoDS_Vertex;

  // BRepFilletAPI_LocalOperation.LastVertex (method)
  LastVertex(IC: number): TopoDS_Vertex;

  // BRepFilletAPI_LocalOperation.Abscissa (method)
  Abscissa(IC: number, V: TopoDS_Vertex): number;

  // BRepFilletAPI_LocalOperation.RelativeAbscissa (method)
  RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

  // BRepFilletAPI_LocalOperation.ClosedAndTangent (method)
  ClosedAndTangent(IC: number): boolean;

  // BRepFilletAPI_LocalOperation.Closed (method)
  Closed(IC: number): boolean;

  // BRepFilletAPI_LocalOperation.Reset (method)
  Reset(): void;

  // BRepFilletAPI_LocalOperation.Simulate (method)
  Simulate(IC: number): void;

  // BRepFilletAPI_LocalOperation.NbSurf (method)
  NbSurf(IC: number): number;

  // BRepFilletAPI_LocalOperation.Sect (method)
  Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

  // BRepFilletAPI_LocalOperation.delete (method)
  delete(): void;

  // BRepFilletAPI_LocalOperation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFilletAPI_MakeChamfer: declare class BRepFilletAPI_MakeChamfer extends BRepFilletAPI_LocalOperation

  // BRepFilletAPI_MakeChamfer.constructor (constructor)
  constructor(S: TopoDS_Shape);

  // BRepFilletAPI_MakeChamfer.Add (method)
  Add(E: TopoDS_Edge): void;
  Add(Dis: number, E: TopoDS_Edge): void;
  Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;

  // BRepFilletAPI_MakeChamfer.SetDist (method)
  SetDist(Dis: number, IC: number, F: TopoDS_Face): void;

  // BRepFilletAPI_MakeChamfer.GetDist (method)
  GetDist(IC: number, Dis?: number): { Dis: number };

  // BRepFilletAPI_MakeChamfer.SetDists (method)
  SetDists(Dis1: number, Dis2: number, IC: number, F: TopoDS_Face): void;

  // BRepFilletAPI_MakeChamfer.Dists (method)
  Dists(IC: number, Dis1?: number, Dis2?: number): { Dis1: number; Dis2: number };

  // BRepFilletAPI_MakeChamfer.AddDA (method)
  AddDA(Dis: number, Angle: number, E: TopoDS_Edge, F: TopoDS_Face): void;

  // BRepFilletAPI_MakeChamfer.SetDistAngle (method)
  SetDistAngle(Dis: number, Angle: number, IC: number, F: TopoDS_Face): void;

  // BRepFilletAPI_MakeChamfer.GetDistAngle (method)
  GetDistAngle(IC: number, Dis?: number, Angle?: number): { Dis: number; Angle: number };

  // BRepFilletAPI_MakeChamfer.SetMode (method)
  SetMode(theMode: ChFiDS_ChamfMode): void;

  // BRepFilletAPI_MakeChamfer.IsSymetric (method)
  IsSymetric(IC: number): boolean;

  // BRepFilletAPI_MakeChamfer.IsTwoDistances (method)
  IsTwoDistances(IC: number): boolean;

  // BRepFilletAPI_MakeChamfer.IsDistanceAngle (method)
  IsDistanceAngle(IC: number): boolean;

  // BRepFilletAPI_MakeChamfer.ResetContour (method)
  ResetContour(IC: number): void;

  // BRepFilletAPI_MakeChamfer.NbContours (method)
  NbContours(): number;

  // BRepFilletAPI_MakeChamfer.Contour (method)
  Contour(E: TopoDS_Edge): number;

  // BRepFilletAPI_MakeChamfer.NbEdges (method)
  NbEdges(I: number): number;

  // BRepFilletAPI_MakeChamfer.Edge (method)
  Edge(I: number, J: number): TopoDS_Edge;

  // BRepFilletAPI_MakeChamfer.Remove (method)
  Remove(E: TopoDS_Edge): void;

  // BRepFilletAPI_MakeChamfer.Length (method)
  Length(IC: number): number;

  // BRepFilletAPI_MakeChamfer.FirstVertex (method)
  FirstVertex(IC: number): TopoDS_Vertex;

  // BRepFilletAPI_MakeChamfer.LastVertex (method)
  LastVertex(IC: number): TopoDS_Vertex;

  // BRepFilletAPI_MakeChamfer.Abscissa (method)
  Abscissa(IC: number, V: TopoDS_Vertex): number;

  // BRepFilletAPI_MakeChamfer.RelativeAbscissa (method)
  RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

  // BRepFilletAPI_MakeChamfer.ClosedAndTangent (method)
  ClosedAndTangent(IC: number): boolean;

  // BRepFilletAPI_MakeChamfer.Closed (method)
  Closed(IC: number): boolean;

  // BRepFilletAPI_MakeChamfer.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepFilletAPI_MakeChamfer.Reset (method)
  Reset(): void;

  // BRepFilletAPI_MakeChamfer.Builder (method)
  Builder(): unknown;

  // BRepFilletAPI_MakeChamfer.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFilletAPI_MakeChamfer.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFilletAPI_MakeChamfer.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepFilletAPI_MakeChamfer.Simulate (method)
  Simulate(IC: number): void;

  // BRepFilletAPI_MakeChamfer.NbSurf (method)
  NbSurf(IC: number): number;

  // BRepFilletAPI_MakeChamfer.Sect (method)
  Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

  // BRepFilletAPI_MakeChamfer.delete (method)
  delete(): void;

  // BRepFilletAPI_MakeChamfer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFilletAPI_MakeFillet: declare class BRepFilletAPI_MakeFillet extends BRepFilletAPI_LocalOperation

  // BRepFilletAPI_MakeFillet.constructor (constructor)
  constructor(S: TopoDS_Shape, FShape?: ChFi3d_FilletShape);

  // BRepFilletAPI_MakeFillet.SetParams (method)
  SetParams(Tang: number, Tesp: number, T2d: number, TApp3d: number, TolApp2d: number, Fleche: number): void;

  // BRepFilletAPI_MakeFillet.SetContinuity (method)
  SetContinuity(InternalContinuity: GeomAbs_Shape, AngularTolerance: number): void;

  // BRepFilletAPI_MakeFillet.Add (method)
  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;
  Add(L: Law_Function, E: TopoDS_Edge): void;
  Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
  Add(R1: number, R2: number, E: TopoDS_Edge): void;

  // BRepFilletAPI_MakeFillet.SetRadius (method)
  SetRadius(Radius: number, IC: number, IinC: number): void;
  SetRadius(L: Law_Function, IC: number, IinC: number): void;
  SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(R1: number, R2: number, IC: number, IinC: number): void;

  // BRepFilletAPI_MakeFillet.ResetContour (method)
  ResetContour(IC: number): void;

  // BRepFilletAPI_MakeFillet.IsConstant (method)
  IsConstant(IC: number): boolean;
  IsConstant(IC: number, E: TopoDS_Edge): boolean;

  // BRepFilletAPI_MakeFillet.Radius (method)
  Radius(IC: number): number;
  Radius(IC: number, E: TopoDS_Edge): number;

  // BRepFilletAPI_MakeFillet.GetBounds (method)
  GetBounds(IC: number, E: TopoDS_Edge, F?: number, L?: number): { returnValue: boolean; F: number; L: number };

  // BRepFilletAPI_MakeFillet.GetLaw (method)
  GetLaw(IC: number, E: TopoDS_Edge): Law_Function;

  // BRepFilletAPI_MakeFillet.SetLaw (method)
  SetLaw(IC: number, E: TopoDS_Edge, L: Law_Function): void;

  // BRepFilletAPI_MakeFillet.SetFilletShape (method)
  SetFilletShape(FShape: ChFi3d_FilletShape): void;

  // BRepFilletAPI_MakeFillet.GetFilletShape (method)
  GetFilletShape(): ChFi3d_FilletShape;

  // BRepFilletAPI_MakeFillet.NbContours (method)
  NbContours(): number;

  // BRepFilletAPI_MakeFillet.Contour (method)
  Contour(E: TopoDS_Edge): number;

  // BRepFilletAPI_MakeFillet.NbEdges (method)
  NbEdges(I: number): number;

  // BRepFilletAPI_MakeFillet.Edge (method)
  Edge(I: number, J: number): TopoDS_Edge;

  // BRepFilletAPI_MakeFillet.Remove (method)
  Remove(E: TopoDS_Edge): void;

  // BRepFilletAPI_MakeFillet.Length (method)
  Length(IC: number): number;

  // BRepFilletAPI_MakeFillet.FirstVertex (method)
  FirstVertex(IC: number): TopoDS_Vertex;

  // BRepFilletAPI_MakeFillet.LastVertex (method)
  LastVertex(IC: number): TopoDS_Vertex;

  // BRepFilletAPI_MakeFillet.Abscissa (method)
  Abscissa(IC: number, V: TopoDS_Vertex): number;

  // BRepFilletAPI_MakeFillet.RelativeAbscissa (method)
  RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

  // BRepFilletAPI_MakeFillet.ClosedAndTangent (method)
  ClosedAndTangent(IC: number): boolean;

  // BRepFilletAPI_MakeFillet.Closed (method)
  Closed(IC: number): boolean;

  // BRepFilletAPI_MakeFillet.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepFilletAPI_MakeFillet.Reset (method)
  Reset(): void;

  // BRepFilletAPI_MakeFillet.Builder (method)
  Builder(): unknown;

  // BRepFilletAPI_MakeFillet.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFilletAPI_MakeFillet.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFilletAPI_MakeFillet.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepFilletAPI_MakeFillet.NbSurfaces (method)
  NbSurfaces(): number;

  // BRepFilletAPI_MakeFillet.NewFaces (method)
  NewFaces(I: number): NCollection_List_TopoDS_Shape;

  // BRepFilletAPI_MakeFillet.Simulate (method)
  Simulate(IC: number): void;

  // BRepFilletAPI_MakeFillet.NbSurf (method)
  NbSurf(IC: number): number;

  // BRepFilletAPI_MakeFillet.Sect (method)
  Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

  // BRepFilletAPI_MakeFillet.NbFaultyContours (method)
  NbFaultyContours(): number;

  // BRepFilletAPI_MakeFillet.FaultyContour (method)
  FaultyContour(I: number): number;

  // BRepFilletAPI_MakeFillet.NbComputedSurfaces (method)
  NbComputedSurfaces(IC: number): number;

  // BRepFilletAPI_MakeFillet.ComputedSurface (method)
  ComputedSurface(IC: number, IS: number): Geom_Surface;

  // BRepFilletAPI_MakeFillet.NbFaultyVertices (method)
  NbFaultyVertices(): number;

  // BRepFilletAPI_MakeFillet.FaultyVertex (method)
  FaultyVertex(IV: number): TopoDS_Vertex;

  // BRepFilletAPI_MakeFillet.HasResult (method)
  HasResult(): boolean;

  // BRepFilletAPI_MakeFillet.BadShape (method)
  BadShape(): TopoDS_Shape;

  // BRepFilletAPI_MakeFillet.StripeStatus (method)
  StripeStatus(IC: number): ChFiDS_ErrorStatus;

  // BRepFilletAPI_MakeFillet.delete (method)
  delete(): void;

  // BRepFilletAPI_MakeFillet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFilletAPI_MakeFillet2d: declare class BRepFilletAPI_MakeFillet2d extends BRepBuilderAPI_MakeShape

  // BRepFilletAPI_MakeFillet2d.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face);

  // BRepFilletAPI_MakeFillet2d.Init (method)
  Init(F: TopoDS_Face): void;
  Init(RefFace: TopoDS_Face, ModFace: TopoDS_Face): void;

  // BRepFilletAPI_MakeFillet2d.AddFillet (method)
  AddFillet(V: TopoDS_Vertex, Radius: number): TopoDS_Edge;

  // BRepFilletAPI_MakeFillet2d.ModifyFillet (method)
  ModifyFillet(Fillet: TopoDS_Edge, Radius: number): TopoDS_Edge;

  // BRepFilletAPI_MakeFillet2d.RemoveFillet (method)
  RemoveFillet(Fillet: TopoDS_Edge): TopoDS_Vertex;

  // BRepFilletAPI_MakeFillet2d.AddChamfer (method)
  AddChamfer(E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
  AddChamfer(E: TopoDS_Edge, V: TopoDS_Vertex, D: number, Ang: number): TopoDS_Edge;

  // BRepFilletAPI_MakeFillet2d.ModifyChamfer (method)
  ModifyChamfer(Chamfer: TopoDS_Edge, E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
  ModifyChamfer(Chamfer: TopoDS_Edge, E: TopoDS_Edge, D: number, Ang: number): TopoDS_Edge;

  // BRepFilletAPI_MakeFillet2d.RemoveChamfer (method)
  RemoveChamfer(Chamfer: TopoDS_Edge): TopoDS_Vertex;

  // BRepFilletAPI_MakeFillet2d.IsModified (method)
  IsModified(E: TopoDS_Edge): boolean;

  // BRepFilletAPI_MakeFillet2d.FilletEdges (method)
  FilletEdges(): NCollection_Sequence_TopoDS_Shape;

  // BRepFilletAPI_MakeFillet2d.NbFillet (method)
  NbFillet(): number;

  // BRepFilletAPI_MakeFillet2d.ChamferEdges (method)
  ChamferEdges(): NCollection_Sequence_TopoDS_Shape;

  // BRepFilletAPI_MakeFillet2d.NbChamfer (method)
  NbChamfer(): number;

  // BRepFilletAPI_MakeFillet2d.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFilletAPI_MakeFillet2d.NbCurves (method)
  NbCurves(): number;

  // BRepFilletAPI_MakeFillet2d.NewEdges (method)
  NewEdges(I: number): NCollection_List_TopoDS_Shape;

  // BRepFilletAPI_MakeFillet2d.HasDescendant (method)
  HasDescendant(E: TopoDS_Edge): boolean;

  // BRepFilletAPI_MakeFillet2d.DescendantEdge (method)
  DescendantEdge(E: TopoDS_Edge): TopoDS_Edge;

  // BRepFilletAPI_MakeFillet2d.BasisEdge (method)
  BasisEdge(E: TopoDS_Edge): TopoDS_Edge;

  // BRepFilletAPI_MakeFillet2d.Status (method)
  Status(): ChFi2d_ConstructionError;

  // BRepFilletAPI_MakeFillet2d.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepFilletAPI_MakeFillet2d.delete (method)
  delete(): void;

  // BRepFilletAPI_MakeFillet2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
