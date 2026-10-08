# libcascade — ChFi3d

6 top-level symbols. Signatures are verbatim typescript.

ChFi3d: declare class ChFi3d

  // ChFi3d.constructor (constructor)
  constructor();

  // ChFi3d.DefineConnectType (method)
  static DefineConnectType(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, SinTol: number, CorrectPoint: boolean): ChFiDS_TypeOfConcavity;

  // ChFi3d.IsTangentFaces (method)
  static IsTangentFaces(theEdge: TopoDS_Edge, theFace1: TopoDS_Face, theFace2: TopoDS_Face, Order?: GeomAbs_Shape): boolean;

  // ChFi3d.delete (method)
  delete(): void;

  // ChFi3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFi3d_Builder: declare class ChFi3d_Builder

  // ChFi3d_Builder.SetParams (method)
  SetParams(Tang: number, Tesp: number, T2d: number, TApp3d: number, TolApp2d: number, Fleche: number): void;

  // ChFi3d_Builder.SetContinuity (method)
  SetContinuity(InternalContinuity: GeomAbs_Shape, AngularTolerance: number): void;

  // ChFi3d_Builder.Remove (method)
  Remove(E: TopoDS_Edge): void;

  // ChFi3d_Builder.Contains (method)
  Contains(E: TopoDS_Edge): number;
  Contains(E: TopoDS_Edge, IndexInSpine?: number): { returnValue: number; IndexInSpine: number };

  // ChFi3d_Builder.NbElements (method)
  NbElements(): number;

  // ChFi3d_Builder.Value (method)
  Value(I: number): ChFiDS_Spine;

  // ChFi3d_Builder.Length (method)
  Length(IC: number): number;

  // ChFi3d_Builder.FirstVertex (method)
  FirstVertex(IC: number): TopoDS_Vertex;

  // ChFi3d_Builder.LastVertex (method)
  LastVertex(IC: number): TopoDS_Vertex;

  // ChFi3d_Builder.Abscissa (method)
  Abscissa(IC: number, V: TopoDS_Vertex): number;

  // ChFi3d_Builder.RelativeAbscissa (method)
  RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

  // ChFi3d_Builder.ClosedAndTangent (method)
  ClosedAndTangent(IC: number): boolean;

  // ChFi3d_Builder.Closed (method)
  Closed(IC: number): boolean;

  // ChFi3d_Builder.Compute (method)
  Compute(): void;

  // ChFi3d_Builder.IsDone (method)
  IsDone(): boolean;

  // ChFi3d_Builder.Shape (method)
  Shape(): TopoDS_Shape;

  // ChFi3d_Builder.Generated (method)
  Generated(EouV: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // ChFi3d_Builder.NbFaultyContours (method)
  NbFaultyContours(): number;

  // ChFi3d_Builder.FaultyContour (method)
  FaultyContour(I: number): number;

  // ChFi3d_Builder.NbComputedSurfaces (method)
  NbComputedSurfaces(IC: number): number;

  // ChFi3d_Builder.ComputedSurface (method)
  ComputedSurface(IC: number, IS: number): Geom_Surface;

  // ChFi3d_Builder.NbFaultyVertices (method)
  NbFaultyVertices(): number;

  // ChFi3d_Builder.FaultyVertex (method)
  FaultyVertex(IV: number): TopoDS_Vertex;

  // ChFi3d_Builder.HasResult (method)
  HasResult(): boolean;

  // ChFi3d_Builder.BadShape (method)
  BadShape(): TopoDS_Shape;

  // ChFi3d_Builder.StripeStatus (method)
  StripeStatus(IC: number): ChFiDS_ErrorStatus;

  // ChFi3d_Builder.Reset (method)
  Reset(): void;

  // ChFi3d_Builder.Builder (method)
  Builder(): unknown;

  // ChFi3d_Builder.SplitKPart (method)
  SplitKPart(Data: ChFiDS_SurfData, SetData: NCollection_Sequence_handle_ChFiDS_SurfData, Spine: ChFiDS_Spine, Iedge: number, S1: Adaptor3d_Surface, I1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, I2: Adaptor3d_TopolTool, Intf?: boolean, Intl?: boolean): { returnValue: boolean; Intf: boolean; Intl: boolean };

  // ChFi3d_Builder.PerformTwoCornerbyInter (method)
  PerformTwoCornerbyInter(Index: number): boolean;

  // ChFi3d_Builder.delete (method)
  delete(): void;

  // ChFi3d_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFi3d_ChBuilder: declare class ChFi3d_ChBuilder extends ChFi3d_Builder

  // ChFi3d_ChBuilder.constructor (constructor)
  constructor(S: TopoDS_Shape, Ta?: number);

  // ChFi3d_ChBuilder.Add (method)
  Add(E: TopoDS_Edge): void;
  Add(Dis: number, E: TopoDS_Edge): void;
  Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;

  // ChFi3d_ChBuilder.SetDist (method)
  SetDist(Dis: number, IC: number, F: TopoDS_Face): void;

  // ChFi3d_ChBuilder.GetDist (method)
  GetDist(IC: number, Dis?: number): { Dis: number };

  // ChFi3d_ChBuilder.SetDists (method)
  SetDists(Dis1: number, Dis2: number, IC: number, F: TopoDS_Face): void;

  // ChFi3d_ChBuilder.Dists (method)
  Dists(IC: number, Dis1?: number, Dis2?: number): { Dis1: number; Dis2: number };

  // ChFi3d_ChBuilder.AddDA (method)
  AddDA(Dis: number, Angle: number, E: TopoDS_Edge, F: TopoDS_Face): void;

  // ChFi3d_ChBuilder.SetDistAngle (method)
  SetDistAngle(Dis: number, Angle: number, IC: number, F: TopoDS_Face): void;

  // ChFi3d_ChBuilder.GetDistAngle (method)
  GetDistAngle(IC: number, Dis?: number, Angle?: number): { Dis: number; Angle: number };

  // ChFi3d_ChBuilder.SetMode (method)
  SetMode(theMode: ChFiDS_ChamfMode): void;

  // ChFi3d_ChBuilder.IsChamfer (method)
  IsChamfer(IC: number): ChFiDS_ChamfMethod;

  // ChFi3d_ChBuilder.Mode (method)
  Mode(): ChFiDS_ChamfMode;

  // ChFi3d_ChBuilder.ResetContour (method)
  ResetContour(IC: number): void;

  // ChFi3d_ChBuilder.Simulate (method)
  Simulate(IC: number): void;

  // ChFi3d_ChBuilder.NbSurf (method)
  NbSurf(IC: number): number;

  // ChFi3d_ChBuilder.Sect (method)
  Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

  // ChFi3d_ChBuilder.SimulSurf (method)
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; First: number; Last: number; [Symbol.dispose](): void };
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };

  // ChFi3d_ChBuilder.PerformSurf (method)
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecOnS1: boolean, RecOnS2: boolean, Soldep: math_VectorBase_double, Intf: number, Intl: number): { returnValue: boolean; First: number; Last: number; Intf: number; Intl: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch2: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; Decroch2: boolean; First: number; Last: number };

  // ChFi3d_ChBuilder.delete (method)
  delete(): void;

  // ChFi3d_ChBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFi3d_FilBuilder: declare class ChFi3d_FilBuilder extends ChFi3d_Builder

  // ChFi3d_FilBuilder.constructor (constructor)
  constructor(S: TopoDS_Shape, FShape?: ChFi3d_FilletShape, Ta?: number);

  // ChFi3d_FilBuilder.SetFilletShape (method)
  SetFilletShape(FShape: ChFi3d_FilletShape): void;

  // ChFi3d_FilBuilder.GetFilletShape (method)
  GetFilletShape(): ChFi3d_FilletShape;

  // ChFi3d_FilBuilder.Add (method)
  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;

  // ChFi3d_FilBuilder.SetRadius (method)
  SetRadius(C: Law_Function, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IC: number, IinC: number): void;

  // ChFi3d_FilBuilder.IsConstant (method)
  IsConstant(IC: number): boolean;
  IsConstant(IC: number, E: TopoDS_Edge): boolean;

  // ChFi3d_FilBuilder.Radius (method)
  Radius(IC: number): number;
  Radius(IC: number, E: TopoDS_Edge): number;

  // ChFi3d_FilBuilder.ResetContour (method)
  ResetContour(IC: number): void;

  // ChFi3d_FilBuilder.UnSet (method)
  UnSet(IC: number, E: TopoDS_Edge): void;
  UnSet(IC: number, V: TopoDS_Vertex): void;

  // ChFi3d_FilBuilder.GetBounds (method)
  GetBounds(IC: number, E: TopoDS_Edge, First?: number, Last?: number): { returnValue: boolean; First: number; Last: number };

  // ChFi3d_FilBuilder.GetLaw (method)
  GetLaw(IC: number, E: TopoDS_Edge): Law_Function;

  // ChFi3d_FilBuilder.SetLaw (method)
  SetLaw(IC: number, E: TopoDS_Edge, L: Law_Function): void;

  // ChFi3d_FilBuilder.Simulate (method)
  Simulate(IC: number): void;

  // ChFi3d_FilBuilder.NbSurf (method)
  NbSurf(IC: number): number;

  // ChFi3d_FilBuilder.Sect (method)
  Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

  // ChFi3d_FilBuilder.delete (method)
  delete(): void;

  // ChFi3d_FilBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFi3d_FilletShape: typeof ChFi3d_FilletShape[keyof typeof ChFi3d_FilletShape]

  readonly ChFi3d_Rational: 'ChFi3d_Rational'

  readonly ChFi3d_QuasiAngular: 'ChFi3d_QuasiAngular'

  readonly ChFi3d_Polynomial: 'ChFi3d_Polynomial'

ChFi3d_SearchSing: declare class ChFi3d_SearchSing extends math_FunctionWithDerivative

  // ChFi3d_SearchSing.constructor (constructor)
  constructor(C1: Geom_Curve, C2: Geom_Curve);

  // ChFi3d_SearchSing.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // ChFi3d_SearchSing.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // ChFi3d_SearchSing.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // ChFi3d_SearchSing.delete (method)
  delete(): void;

  // ChFi3d_SearchSing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
