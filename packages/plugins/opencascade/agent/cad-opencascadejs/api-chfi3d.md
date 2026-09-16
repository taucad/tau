# libcascade — ChFi3d

6 top-level symbols. Signatures are verbatim typescript.

ChFi3d: declare class ChFi3d

  constructor

  static DefineConnectType(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, SinTol: number, CorrectPoint: boolean): ChFiDS_TypeOfConcavity;

  static IsTangentFaces(theEdge: TopoDS_Edge, theFace1: TopoDS_Face, theFace2: TopoDS_Face, Order?: GeomAbs_Shape): boolean;

  delete(): void;

  [Symbol.dispose](): void;

ChFi3d_Builder: declare class ChFi3d_Builder

  SetParams(Tang: number, Tesp: number, T2d: number, TApp3d: number, TolApp2d: number, Fleche: number): void;

  SetContinuity(InternalContinuity: GeomAbs_Shape, AngularTolerance: number): void;

  Remove(E: TopoDS_Edge): void;

  Contains(E: TopoDS_Edge): number;
  Contains(E: TopoDS_Edge, IndexInSpine?: number): { returnValue: number; IndexInSpine: number };
  Contains(E: TopoDS_Edge): number;
  Contains(E: TopoDS_Edge, IndexInSpine?: number): { returnValue: number; IndexInSpine: number };

  NbElements(): number;

  Value(I: number): ChFiDS_Spine;

  Length(IC: number): number;

  FirstVertex(IC: number): TopoDS_Vertex;

  LastVertex(IC: number): TopoDS_Vertex;

  Abscissa(IC: number, V: TopoDS_Vertex): number;

  RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

  ClosedAndTangent(IC: number): boolean;

  Closed(IC: number): boolean;

  Compute(): void;

  IsDone(): boolean;

  Shape(): TopoDS_Shape;

  Generated(EouV: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  NbFaultyContours(): number;

  FaultyContour(I: number): number;

  NbComputedSurfaces(IC: number): number;

  ComputedSurface(IC: number, IS: number): Geom_Surface;

  NbFaultyVertices(): number;

  FaultyVertex(IV: number): TopoDS_Vertex;

  HasResult(): boolean;

  BadShape(): TopoDS_Shape;

  StripeStatus(IC: number): ChFiDS_ErrorStatus;

  Reset(): void;

  Builder(): unknown;

  SplitKPart(Data: ChFiDS_SurfData, SetData: NCollection_Sequence_handle_ChFiDS_SurfData, Spine: ChFiDS_Spine, Iedge: number, S1: Adaptor3d_Surface, I1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, I2: Adaptor3d_TopolTool, Intf?: boolean, Intl?: boolean): { returnValue: boolean; Intf: boolean; Intl: boolean };

  PerformTwoCornerbyInter(Index: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

ChFi3d_ChBuilder: declare class ChFi3d_ChBuilder extends ChFi3d_Builder

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

  IsChamfer(IC: number): ChFiDS_ChamfMethod;

  Mode(): ChFiDS_ChamfMode;

  ResetContour(IC: number): void;

  Simulate(IC: number): void;

  NbSurf(IC: number): number;

  Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; First: number; Last: number; [Symbol.dispose](): void };
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; First: number; Last: number; [Symbol.dispose](): void };
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; First: number; Last: number; [Symbol.dispose](): void };
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };
  SimulSurf(Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Data: ChFiDS_SurfData; Decroch1: boolean; Decroch2: boolean; First: number; Last: number; [Symbol.dispose](): void };

  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecOnS1: boolean, RecOnS2: boolean, Soldep: math_VectorBase_double, Intf: number, Intl: number): { returnValue: boolean; First: number; Last: number; Intf: number; Intl: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch2: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; Decroch2: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecOnS1: boolean, RecOnS2: boolean, Soldep: math_VectorBase_double, Intf: number, Intl: number): { returnValue: boolean; First: number; Last: number; Intf: number; Intl: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch2: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; Decroch2: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecOnS1: boolean, RecOnS2: boolean, Soldep: math_VectorBase_double, Intf: number, Intl: number): { returnValue: boolean; First: number; Last: number; Intf: number; Intl: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch2: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; Decroch2: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecOnS1: boolean, RecOnS2: boolean, Soldep: math_VectorBase_double, Intf: number, Intl: number): { returnValue: boolean; First: number; Last: number; Intf: number; Intl: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP: boolean, RecS: boolean, RecRst: boolean, Soldep: math_VectorBase_double): { Decroch2: boolean; First: number; Last: number };
  PerformSurf(Data: NCollection_Sequence_handle_ChFiDS_SurfData, Guide: ChFiDS_ElSpine, Spine: ChFiDS_Spine, Choix: number, S1: BRepAdaptor_Surface, I1: Adaptor3d_TopolTool, PC1: BRepAdaptor_Curve2d, Sref1: BRepAdaptor_Surface, PCref1: BRepAdaptor_Curve2d, Decroch1: boolean, Or1: TopAbs_Orientation, S2: BRepAdaptor_Surface, I2: Adaptor3d_TopolTool, PC2: BRepAdaptor_Curve2d, Sref2: BRepAdaptor_Surface, PCref2: BRepAdaptor_Curve2d, Decroch2: boolean, Or2: TopAbs_Orientation, MaxStep: number, Fleche: number, TolGuide: number, First: number, Last: number, Inside: boolean, Appro: boolean, Forward: boolean, RecP1: boolean, RecRst1: boolean, RecP2: boolean, RecRst2: boolean, Soldep: math_VectorBase_double): { Decroch1: boolean; Decroch2: boolean; First: number; Last: number };

  delete(): void;

  [Symbol.dispose](): void;

ChFi3d_FilBuilder: declare class ChFi3d_FilBuilder extends ChFi3d_Builder

  constructor

  SetFilletShape(FShape: ChFi3d_FilletShape): void;

  GetFilletShape(): ChFi3d_FilletShape;

  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;
  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;

  SetRadius(C: Law_Function, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IC: number, IinC: number): void;
  SetRadius(C: Law_Function, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IC: number, IinC: number): void;
  SetRadius(C: Law_Function, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IC: number, IinC: number): void;
  SetRadius(C: Law_Function, IC: number, IinC: number): void;
  SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IC: number, IinC: number): void;

  IsConstant(IC: number): boolean;
  IsConstant(IC: number, E: TopoDS_Edge): boolean;
  IsConstant(IC: number): boolean;
  IsConstant(IC: number, E: TopoDS_Edge): boolean;

  Radius(IC: number): number;
  Radius(IC: number, E: TopoDS_Edge): number;
  Radius(IC: number): number;
  Radius(IC: number, E: TopoDS_Edge): number;

  ResetContour(IC: number): void;

  UnSet(IC: number, E: TopoDS_Edge): void;
  UnSet(IC: number, V: TopoDS_Vertex): void;
  UnSet(IC: number, E: TopoDS_Edge): void;
  UnSet(IC: number, V: TopoDS_Vertex): void;

  GetBounds(IC: number, E: TopoDS_Edge, First?: number, Last?: number): { returnValue: boolean; First: number; Last: number };

  GetLaw(IC: number, E: TopoDS_Edge): Law_Function;

  SetLaw(IC: number, E: TopoDS_Edge, L: Law_Function): void;

  Simulate(IC: number): void;

  NbSurf(IC: number): number;

  Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

  delete(): void;

  [Symbol.dispose](): void;

ChFi3d_FilletShape: typeof ChFi3d_FilletShape[keyof typeof ChFi3d_FilletShape]

ChFi3d_SearchSing: declare class ChFi3d_SearchSing extends math_FunctionWithDerivative

  constructor

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  delete(): void;

  [Symbol.dispose](): void;
