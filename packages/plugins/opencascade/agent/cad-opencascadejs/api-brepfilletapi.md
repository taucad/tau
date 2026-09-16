# libcascade — BRepFilletAPI

4 top-level symbols. Signatures are verbatim typescript.

BRepFilletAPI_LocalOperation: declare class BRepFilletAPI_LocalOperation extends BRepBuilderAPI_MakeShape

  Add(E: TopoDS_Edge): void;

  ResetContour(IC: number): void;

  NbContours(): number;

  Contour(E: TopoDS_Edge): number;

  NbEdges(I: number): number;

  Edge(I: number, J: number): TopoDS_Edge;

  Remove(E: TopoDS_Edge): void;

  Length(IC: number): number;

  FirstVertex(IC: number): TopoDS_Vertex;

  LastVertex(IC: number): TopoDS_Vertex;

  Abscissa(IC: number, V: TopoDS_Vertex): number;

  RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

  ClosedAndTangent(IC: number): boolean;

  Closed(IC: number): boolean;

  Reset(): void;

  Simulate(IC: number): void;

  NbSurf(IC: number): number;

  Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

  delete(): void;

  [Symbol.dispose](): void;

BRepFilletAPI_MakeChamfer: declare class BRepFilletAPI_MakeChamfer extends BRepFilletAPI_LocalOperation

  constructor

  Add(E: TopoDS_Edge): void;
  Add(Dis: number, E: TopoDS_Edge): void;
  Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;
  Add(E: TopoDS_Edge): void;
  Add(Dis: number, E: TopoDS_Edge): void;
  Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;
  Add(E: TopoDS_Edge): void;
  Add(Dis: number, E: TopoDS_Edge): void;
  Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;

  SetDist(Dis: number, IC: number, F: TopoDS_Face): void;

  GetDist(IC: number, Dis?: number): { Dis: number };

  SetDists(Dis1: number, Dis2: number, IC: number, F: TopoDS_Face): void;

  Dists(IC: number, Dis1?: number, Dis2?: number): { Dis1: number; Dis2: number };

  AddDA(Dis: number, Angle: number, E: TopoDS_Edge, F: TopoDS_Face): void;

  SetDistAngle(Dis: number, Angle: number, IC: number, F: TopoDS_Face): void;

  GetDistAngle(IC: number, Dis?: number, Angle?: number): { Dis: number; Angle: number };

  SetMode(theMode: ChFiDS_ChamfMode): void;

  IsSymetric(IC: number): boolean;

  IsTwoDistances(IC: number): boolean;

  IsDistanceAngle(IC: number): boolean;

  ResetContour(IC: number): void;

  NbContours(): number;

  Contour(E: TopoDS_Edge): number;

  NbEdges(I: number): number;

  Edge(I: number, J: number): TopoDS_Edge;

  Remove(E: TopoDS_Edge): void;

  Length(IC: number): number;

  FirstVertex(IC: number): TopoDS_Vertex;

  LastVertex(IC: number): TopoDS_Vertex;

  Abscissa(IC: number, V: TopoDS_Vertex): number;

  RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

  ClosedAndTangent(IC: number): boolean;

  Closed(IC: number): boolean;

  Build(theRange?: Message_ProgressRange): void;

  Reset(): void;

  Builder(): unknown;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  IsDeleted(S: TopoDS_Shape): boolean;

  Simulate(IC: number): void;

  NbSurf(IC: number): number;

  Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

  delete(): void;

  [Symbol.dispose](): void;

BRepFilletAPI_MakeFillet: declare class BRepFilletAPI_MakeFillet extends BRepFilletAPI_LocalOperation

  constructor

  SetParams(Tang: number, Tesp: number, T2d: number, TApp3d: number, TolApp2d: number, Fleche: number): void;

  SetContinuity(InternalContinuity: GeomAbs_Shape, AngularTolerance: number): void;

  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;
  Add(L: Law_Function, E: TopoDS_Edge): void;
  Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
  Add(R1: number, R2: number, E: TopoDS_Edge): void;
  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;
  Add(L: Law_Function, E: TopoDS_Edge): void;
  Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
  Add(R1: number, R2: number, E: TopoDS_Edge): void;
  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;
  Add(L: Law_Function, E: TopoDS_Edge): void;
  Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
  Add(R1: number, R2: number, E: TopoDS_Edge): void;
  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;
  Add(L: Law_Function, E: TopoDS_Edge): void;
  Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
  Add(R1: number, R2: number, E: TopoDS_Edge): void;
  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;
  Add(L: Law_Function, E: TopoDS_Edge): void;
  Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
  Add(R1: number, R2: number, E: TopoDS_Edge): void;

  SetRadius(Radius: number, IC: number, IinC: number): void;
  SetRadius(L: Law_Function, IC: number, IinC: number): void;
  SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(R1: number, R2: number, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, IinC: number): void;
  SetRadius(L: Law_Function, IC: number, IinC: number): void;
  SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(R1: number, R2: number, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, IinC: number): void;
  SetRadius(L: Law_Function, IC: number, IinC: number): void;
  SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(R1: number, R2: number, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, IinC: number): void;
  SetRadius(L: Law_Function, IC: number, IinC: number): void;
  SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(R1: number, R2: number, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, IinC: number): void;
  SetRadius(L: Law_Function, IC: number, IinC: number): void;
  SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(R1: number, R2: number, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, IinC: number): void;
  SetRadius(L: Law_Function, IC: number, IinC: number): void;
  SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(R1: number, R2: number, IC: number, IinC: number): void;

  ResetContour(IC: number): void;

  IsConstant(IC: number): boolean;
  IsConstant(IC: number, E: TopoDS_Edge): boolean;
  IsConstant(IC: number): boolean;
  IsConstant(IC: number, E: TopoDS_Edge): boolean;

  Radius(IC: number): number;
  Radius(IC: number, E: TopoDS_Edge): number;
  Radius(IC: number): number;
  Radius(IC: number, E: TopoDS_Edge): number;

  GetBounds(IC: number, E: TopoDS_Edge, F?: number, L?: number): { returnValue: boolean; F: number; L: number };

  GetLaw(IC: number, E: TopoDS_Edge): Law_Function;

  SetLaw(IC: number, E: TopoDS_Edge, L: Law_Function): void;

  SetFilletShape(FShape: ChFi3d_FilletShape): void;

  GetFilletShape(): ChFi3d_FilletShape;

  NbContours(): number;

  Contour(E: TopoDS_Edge): number;

  NbEdges(I: number): number;

  Edge(I: number, J: number): TopoDS_Edge;

  Remove(E: TopoDS_Edge): void;

  Length(IC: number): number;

  FirstVertex(IC: number): TopoDS_Vertex;

  LastVertex(IC: number): TopoDS_Vertex;

  Abscissa(IC: number, V: TopoDS_Vertex): number;

  RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

  ClosedAndTangent(IC: number): boolean;

  Closed(IC: number): boolean;

  Build(theRange?: Message_ProgressRange): void;

  Reset(): void;

  Builder(): unknown;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  IsDeleted(S: TopoDS_Shape): boolean;

  NbSurfaces(): number;

  NewFaces(I: number): NCollection_List_TopoDS_Shape;

  Simulate(IC: number): void;

  NbSurf(IC: number): number;

  Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

  NbFaultyContours(): number;

  FaultyContour(I: number): number;

  NbComputedSurfaces(IC: number): number;

  ComputedSurface(IC: number, IS: number): Geom_Surface;

  NbFaultyVertices(): number;

  FaultyVertex(IV: number): TopoDS_Vertex;

  HasResult(): boolean;

  BadShape(): TopoDS_Shape;

  StripeStatus(IC: number): ChFiDS_ErrorStatus;

  delete(): void;

  [Symbol.dispose](): void;

BRepFilletAPI_MakeFillet2d: declare class BRepFilletAPI_MakeFillet2d extends BRepBuilderAPI_MakeShape

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

  IsModified(E: TopoDS_Edge): boolean;

  FilletEdges(): NCollection_Sequence_TopoDS_Shape;

  NbFillet(): number;

  ChamferEdges(): NCollection_Sequence_TopoDS_Shape;

  NbChamfer(): number;

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  NbCurves(): number;

  NewEdges(I: number): NCollection_List_TopoDS_Shape;

  HasDescendant(E: TopoDS_Edge): boolean;

  DescendantEdge(E: TopoDS_Edge): TopoDS_Edge;

  BasisEdge(E: TopoDS_Edge): TopoDS_Edge;

  Status(): ChFi2d_ConstructionError;

  Build(theRange?: Message_ProgressRange): void;

  delete(): void;

  [Symbol.dispose](): void;
