# libcascade — HLRBRep

26 top-level symbols. Signatures are verbatim typescript.

HLRBRep: declare class HLRBRep

  // HLRBRep.constructor (constructor)
  constructor();

  // HLRBRep.MakeEdge (method)
  static MakeEdge(ec: HLRBRep_Curve, U1: number, U2: number): TopoDS_Edge;

  // HLRBRep.MakeEdge3d (method)
  static MakeEdge3d(ec: HLRBRep_Curve, U1: number, U2: number): TopoDS_Edge;

  // HLRBRep.PolyHLRAngleAndDeflection (method)
  static PolyHLRAngleAndDeflection(InAngl: number, OutAngl?: number, OutDefl?: number): { OutAngl: number; OutDefl: number };

  // HLRBRep.delete (method)
  delete(): void;

  // HLRBRep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_Algo: declare class HLRBRep_Algo extends HLRBRep_InternalAlgo

  // HLRBRep_Algo.constructor (constructor)
  constructor();
  constructor(A: HLRBRep_Algo);

  // HLRBRep_Algo.Add (method)
  Add(S: TopoDS_Shape, SData: Standard_Transient, nbIso: number): void;
  Add(S: TopoDS_Shape, nbIso: number): void;

  // HLRBRep_Algo.Index (method)
  Index(S: TopoDS_Shape): number;
  Index(S: HLRTopoBRep_OutLiner): number;

  // HLRBRep_Algo.OutLinedShapeNullify (method)
  OutLinedShapeNullify(): void;

  // HLRBRep_Algo.get_type_name (method)
  static get_type_name(): string;

  // HLRBRep_Algo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRBRep_Algo.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRBRep_Algo.delete (method)
  delete(): void;

  // HLRBRep_Algo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_AreaLimit: declare class HLRBRep_AreaLimit extends Standard_Transient

  // HLRBRep_AreaLimit.constructor (constructor)
  constructor(V: HLRAlgo_Intersection, Boundary: boolean, Interference: boolean, StateBefore: TopAbs_State, StateAfter: TopAbs_State, EdgeBefore: TopAbs_State, EdgeAfter: TopAbs_State);

  // HLRBRep_AreaLimit.StateBefore (method)
  StateBefore(St: TopAbs_State): void;
  StateBefore(): TopAbs_State;

  // HLRBRep_AreaLimit.StateAfter (method)
  StateAfter(St: TopAbs_State): void;
  StateAfter(): TopAbs_State;

  // HLRBRep_AreaLimit.EdgeBefore (method)
  EdgeBefore(St: TopAbs_State): void;
  EdgeBefore(): TopAbs_State;

  // HLRBRep_AreaLimit.EdgeAfter (method)
  EdgeAfter(St: TopAbs_State): void;
  EdgeAfter(): TopAbs_State;

  // HLRBRep_AreaLimit.Previous (method)
  Previous(P: HLRBRep_AreaLimit): void;
  Previous(): HLRBRep_AreaLimit;

  // HLRBRep_AreaLimit.Next (method)
  Next(N: HLRBRep_AreaLimit): void;
  Next(): HLRBRep_AreaLimit;

  // HLRBRep_AreaLimit.Vertex (method)
  Vertex(): HLRAlgo_Intersection;

  // HLRBRep_AreaLimit.IsBoundary (method)
  IsBoundary(): boolean;

  // HLRBRep_AreaLimit.IsInterference (method)
  IsInterference(): boolean;

  // HLRBRep_AreaLimit.Clear (method)
  Clear(): void;

  // HLRBRep_AreaLimit.get_type_name (method)
  static get_type_name(): string;

  // HLRBRep_AreaLimit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRBRep_AreaLimit.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRBRep_AreaLimit.delete (method)
  delete(): void;

  // HLRBRep_AreaLimit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_BCurveTool: declare class HLRBRep_BCurveTool

  // HLRBRep_BCurveTool.constructor (constructor)
  constructor();

  // HLRBRep_BCurveTool.FirstParameter (method)
  static FirstParameter(C: BRepAdaptor_Curve): number;

  // HLRBRep_BCurveTool.LastParameter (method)
  static LastParameter(C: BRepAdaptor_Curve): number;

  // HLRBRep_BCurveTool.Continuity (method)
  static Continuity(C: BRepAdaptor_Curve): GeomAbs_Shape;

  // HLRBRep_BCurveTool.NbIntervals (method)
  static NbIntervals(C: BRepAdaptor_Curve, S: GeomAbs_Shape): number;

  // HLRBRep_BCurveTool.Intervals (method)
  static Intervals(C: BRepAdaptor_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // HLRBRep_BCurveTool.IsClosed (method)
  static IsClosed(C: BRepAdaptor_Curve): boolean;

  // HLRBRep_BCurveTool.IsPeriodic (method)
  static IsPeriodic(C: BRepAdaptor_Curve): boolean;

  // HLRBRep_BCurveTool.Period (method)
  static Period(C: BRepAdaptor_Curve): number;

  // HLRBRep_BCurveTool.Value (method)
  static Value(C: BRepAdaptor_Curve, U: number): gp_Pnt;

  // HLRBRep_BCurveTool.D0 (method)
  static D0(C: BRepAdaptor_Curve, U: number, P: gp_Pnt): void;

  // HLRBRep_BCurveTool.D1 (method)
  static D1(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V: gp_Vec): void;

  // HLRBRep_BCurveTool.D2 (method)
  static D2(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  // HLRBRep_BCurveTool.D3 (method)
  static D3(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

  // HLRBRep_BCurveTool.DN (method)
  static DN(C: BRepAdaptor_Curve, U: number, N: number): gp_Vec;

  // HLRBRep_BCurveTool.Resolution (method)
  static Resolution(C: BRepAdaptor_Curve, R3d: number): number;

  // HLRBRep_BCurveTool.GetType (method)
  static GetType(C: BRepAdaptor_Curve): GeomAbs_CurveType;

  // HLRBRep_BCurveTool.Line (method)
  static Line(C: BRepAdaptor_Curve): gp_Lin;

  // HLRBRep_BCurveTool.Circle (method)
  static Circle(C: BRepAdaptor_Curve): gp_Circ;

  // HLRBRep_BCurveTool.Ellipse (method)
  static Ellipse(C: BRepAdaptor_Curve): gp_Elips;

  // HLRBRep_BCurveTool.Hyperbola (method)
  static Hyperbola(C: BRepAdaptor_Curve): gp_Hypr;

  // HLRBRep_BCurveTool.Parabola (method)
  static Parabola(C: BRepAdaptor_Curve): gp_Parab;

  // HLRBRep_BCurveTool.Bezier (method)
  static Bezier(C: BRepAdaptor_Curve): Geom_BezierCurve;

  // HLRBRep_BCurveTool.BSpline (method)
  static BSpline(C: BRepAdaptor_Curve): Geom_BSplineCurve;

  // HLRBRep_BCurveTool.Degree (method)
  static Degree(C: BRepAdaptor_Curve): number;

  // HLRBRep_BCurveTool.IsRational (method)
  static IsRational(C: BRepAdaptor_Curve): boolean;

  // HLRBRep_BCurveTool.NbPoles (method)
  static NbPoles(C: BRepAdaptor_Curve): number;

  // HLRBRep_BCurveTool.NbKnots (method)
  static NbKnots(C: BRepAdaptor_Curve): number;

  // HLRBRep_BCurveTool.Poles (method)
  static Poles(C: BRepAdaptor_Curve, T: NCollection_Array1_gp_Pnt): void;

  // HLRBRep_BCurveTool.PolesAndWeights (method)
  static PolesAndWeights(C: BRepAdaptor_Curve, T: NCollection_Array1_gp_Pnt, W: NCollection_Array1_double): void;

  // HLRBRep_BCurveTool.NbSamples (method)
  static NbSamples(C: BRepAdaptor_Curve, U0: number, U1: number): number;

  // HLRBRep_BCurveTool.delete (method)
  delete(): void;

  // HLRBRep_BCurveTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_BiPnt2D: declare class HLRBRep_BiPnt2D

  // HLRBRep_BiPnt2D.constructor (constructor)
  constructor();
  constructor(thePoint1: gp_XY, thePoint2: gp_XY, S: TopoDS_Shape, reg1: boolean, regn: boolean, outl: boolean, intl: boolean);
  constructor(x1: number, y1: number, x2: number, y2: number, S: TopoDS_Shape, reg1: boolean, regn: boolean, outl: boolean, intl: boolean);

  // HLRBRep_BiPnt2D.P1 (method)
  P1(): gp_Pnt2d;

  // HLRBRep_BiPnt2D.P2 (method)
  P2(): gp_Pnt2d;

  // HLRBRep_BiPnt2D.Shape (method)
  Shape(): TopoDS_Shape;
  Shape(S: TopoDS_Shape): void;

  // HLRBRep_BiPnt2D.Rg1Line (method)
  Rg1Line(): boolean;
  Rg1Line(B: boolean): void;

  // HLRBRep_BiPnt2D.RgNLine (method)
  RgNLine(): boolean;
  RgNLine(B: boolean): void;

  // HLRBRep_BiPnt2D.OutLine (method)
  OutLine(): boolean;
  OutLine(B: boolean): void;

  // HLRBRep_BiPnt2D.IntLine (method)
  IntLine(): boolean;
  IntLine(B: boolean): void;

  // HLRBRep_BiPnt2D.delete (method)
  delete(): void;

  // HLRBRep_BiPnt2D.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_BiPoint: declare class HLRBRep_BiPoint

  // HLRBRep_BiPoint.constructor (constructor)
  constructor();
  constructor(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, S: TopoDS_Shape, reg1: boolean, regn: boolean, outl: boolean, intl: boolean);

  // HLRBRep_BiPoint.P1 (method)
  P1(): gp_Pnt;

  // HLRBRep_BiPoint.P2 (method)
  P2(): gp_Pnt;

  // HLRBRep_BiPoint.Shape (method)
  Shape(): TopoDS_Shape;
  Shape(S: TopoDS_Shape): void;

  // HLRBRep_BiPoint.Rg1Line (method)
  Rg1Line(): boolean;
  Rg1Line(B: boolean): void;

  // HLRBRep_BiPoint.RgNLine (method)
  RgNLine(): boolean;
  RgNLine(B: boolean): void;

  // HLRBRep_BiPoint.OutLine (method)
  OutLine(): boolean;
  OutLine(B: boolean): void;

  // HLRBRep_BiPoint.IntLine (method)
  IntLine(): boolean;
  IntLine(B: boolean): void;

  // HLRBRep_BiPoint.delete (method)
  delete(): void;

  // HLRBRep_BiPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_CInter: declare class HLRBRep_CInter extends IntRes2d_Intersection

  // HLRBRep_CInter.constructor (constructor)
  constructor();

  // HLRBRep_CInter.SetMinNbSamples (method)
  SetMinNbSamples(theMinNbSamples: number): void;

  // HLRBRep_CInter.GetMinNbSamples (method)
  GetMinNbSamples(): number;

  // HLRBRep_CInter.delete (method)
  delete(): void;

  // HLRBRep_CInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_CLPropsATool: declare class HLRBRep_CLPropsATool

  // HLRBRep_CLPropsATool.constructor (constructor)
  constructor();

  // HLRBRep_CLPropsATool.Value (method)
  static Value(A: HLRBRep_Curve, U: number, P: gp_Pnt2d): void;

  // HLRBRep_CLPropsATool.D1 (method)
  static D1(A: HLRBRep_Curve, U: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

  // HLRBRep_CLPropsATool.D2 (method)
  static D2(A: HLRBRep_Curve, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // HLRBRep_CLPropsATool.D3 (method)
  static D3(A: HLRBRep_Curve, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // HLRBRep_CLPropsATool.Continuity (method)
  static Continuity(A: HLRBRep_Curve): number;

  // HLRBRep_CLPropsATool.FirstParameter (method)
  static FirstParameter(A: HLRBRep_Curve): number;

  // HLRBRep_CLPropsATool.LastParameter (method)
  static LastParameter(A: HLRBRep_Curve): number;

  // HLRBRep_CLPropsATool.delete (method)
  delete(): void;

  // HLRBRep_CLPropsATool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_Curve: declare class HLRBRep_Curve

  // HLRBRep_Curve.constructor (constructor)
  constructor();

  // HLRBRep_Curve.Projector (method)
  Projector(Proj: HLRAlgo_Projector): void;

  // HLRBRep_Curve.Curve (method)
  Curve(): BRepAdaptor_Curve;
  Curve(E: TopoDS_Edge): void;

  // HLRBRep_Curve.GetCurve (method)
  GetCurve(): BRepAdaptor_Curve;

  // HLRBRep_Curve.Parameter2d (method)
  Parameter2d(P3d: number): number;

  // HLRBRep_Curve.Parameter3d (method)
  Parameter3d(P2d: number): number;

  // HLRBRep_Curve.Update (method)
  Update(TotMin: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], TotMax: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): number;

  // HLRBRep_Curve.UpdateMinMax (method)
  UpdateMinMax(TotMin: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], TotMax: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): number;

  // HLRBRep_Curve.Z (method)
  Z(U: number): number;

  // HLRBRep_Curve.Value3D (method)
  Value3D(U: number): gp_Pnt;

  // HLRBRep_Curve.D0 (method)
  D0(U: number, P: gp_Pnt): void;
  D0(U: number, P: gp_Pnt2d): void;

  // HLRBRep_Curve.D1 (method)
  D1(U: number, P: gp_Pnt, V: gp_Vec): void;
  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  // HLRBRep_Curve.Tangent (method)
  Tangent(AtStart: boolean, P: gp_Pnt2d, D: gp_Dir2d): void;

  // HLRBRep_Curve.FirstParameter (method)
  FirstParameter(): number;

  // HLRBRep_Curve.LastParameter (method)
  LastParameter(): number;

  // HLRBRep_Curve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // HLRBRep_Curve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // HLRBRep_Curve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // HLRBRep_Curve.IsClosed (method)
  IsClosed(): boolean;

  // HLRBRep_Curve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // HLRBRep_Curve.Period (method)
  Period(): number;

  // HLRBRep_Curve.Value (method)
  Value(U: number): gp_Pnt2d;

  // HLRBRep_Curve.D2 (method)
  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // HLRBRep_Curve.D3 (method)
  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // HLRBRep_Curve.DN (method)
  DN(U: number, N: number): gp_Vec2d;

  // HLRBRep_Curve.Resolution (method)
  Resolution(R3d: number): number;

  // HLRBRep_Curve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // HLRBRep_Curve.Line (method)
  Line(): gp_Lin2d;

  // HLRBRep_Curve.Circle (method)
  Circle(): gp_Circ2d;

  // HLRBRep_Curve.Ellipse (method)
  Ellipse(): gp_Elips2d;

  // HLRBRep_Curve.Hyperbola (method)
  Hyperbola(): gp_Hypr2d;

  // HLRBRep_Curve.Parabola (method)
  Parabola(): gp_Parab2d;

  // HLRBRep_Curve.IsRational (method)
  IsRational(): boolean;

  // HLRBRep_Curve.Degree (method)
  Degree(): number;

  // HLRBRep_Curve.NbPoles (method)
  NbPoles(): number;

  // HLRBRep_Curve.Poles (method)
  Poles(TP: NCollection_Array1_gp_Pnt2d): void;
  Poles(aCurve: Geom_BSplineCurve, TP: NCollection_Array1_gp_Pnt2d): void;

  // HLRBRep_Curve.PolesAndWeights (method)
  PolesAndWeights(TP: NCollection_Array1_gp_Pnt2d, TW: NCollection_Array1_double): void;
  PolesAndWeights(aCurve: Geom_BSplineCurve, TP: NCollection_Array1_gp_Pnt2d, TW: NCollection_Array1_double): void;

  // HLRBRep_Curve.NbKnots (method)
  NbKnots(): number;

  // HLRBRep_Curve.Knots (method)
  Knots(kn: NCollection_Array1_double): void;

  // HLRBRep_Curve.Multiplicities (method)
  Multiplicities(mu: NCollection_Array1_int): void;

  // HLRBRep_Curve.delete (method)
  delete(): void;

  // HLRBRep_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_CurveTool: declare class HLRBRep_CurveTool

  // HLRBRep_CurveTool.constructor (constructor)
  constructor();

  // HLRBRep_CurveTool.delete (method)
  delete(): void;

  // HLRBRep_CurveTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_EdgeBuilder: declare class HLRBRep_EdgeBuilder

  // HLRBRep_EdgeBuilder.constructor (constructor)
  constructor(VList: HLRBRep_VertexList);

  // HLRBRep_EdgeBuilder.InitAreas (method)
  InitAreas(): void;

  // HLRBRep_EdgeBuilder.NextArea (method)
  NextArea(): void;

  // HLRBRep_EdgeBuilder.PreviousArea (method)
  PreviousArea(): void;

  // HLRBRep_EdgeBuilder.HasArea (method)
  HasArea(): boolean;

  // HLRBRep_EdgeBuilder.AreaState (method)
  AreaState(): TopAbs_State;

  // HLRBRep_EdgeBuilder.AreaEdgeState (method)
  AreaEdgeState(): TopAbs_State;

  // HLRBRep_EdgeBuilder.LeftLimit (method)
  LeftLimit(): HLRBRep_AreaLimit;

  // HLRBRep_EdgeBuilder.RightLimit (method)
  RightLimit(): HLRBRep_AreaLimit;

  // HLRBRep_EdgeBuilder.Builds (method)
  Builds(ToBuild: TopAbs_State): void;

  // HLRBRep_EdgeBuilder.MoreEdges (method)
  MoreEdges(): boolean;

  // HLRBRep_EdgeBuilder.NextEdge (method)
  NextEdge(): void;

  // HLRBRep_EdgeBuilder.MoreVertices (method)
  MoreVertices(): boolean;

  // HLRBRep_EdgeBuilder.NextVertex (method)
  NextVertex(): void;

  // HLRBRep_EdgeBuilder.Current (method)
  Current(): HLRAlgo_Intersection;

  // HLRBRep_EdgeBuilder.IsBoundary (method)
  IsBoundary(): boolean;

  // HLRBRep_EdgeBuilder.IsInterference (method)
  IsInterference(): boolean;

  // HLRBRep_EdgeBuilder.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // HLRBRep_EdgeBuilder.Destroy (method)
  Destroy(): void;

  // HLRBRep_EdgeBuilder.delete (method)
  delete(): void;

  // HLRBRep_EdgeBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_EdgeData: declare class HLRBRep_EdgeData

  // HLRBRep_EdgeData.constructor (constructor)
  constructor();

  // HLRBRep_EdgeData.Set (method)
  Set(Reg1: boolean, RegN: boolean, EG: TopoDS_Edge, V1: number, V2: number, Out1: boolean, Out2: boolean, Cut1: boolean, Cut2: boolean, Start: number, TolStart: number, End: number, TolEnd: number): void;

  // HLRBRep_EdgeData.Selected (method)
  Selected(): boolean;
  Selected(B: boolean): void;

  // HLRBRep_EdgeData.Rg1Line (method)
  Rg1Line(): boolean;
  Rg1Line(B: boolean): void;

  // HLRBRep_EdgeData.RgNLine (method)
  RgNLine(): boolean;
  RgNLine(B: boolean): void;

  // HLRBRep_EdgeData.Vertical (method)
  Vertical(): boolean;
  Vertical(B: boolean): void;

  // HLRBRep_EdgeData.Simple (method)
  Simple(): boolean;
  Simple(B: boolean): void;

  // HLRBRep_EdgeData.OutLVSta (method)
  OutLVSta(): boolean;
  OutLVSta(B: boolean): void;

  // HLRBRep_EdgeData.OutLVEnd (method)
  OutLVEnd(): boolean;
  OutLVEnd(B: boolean): void;

  // HLRBRep_EdgeData.CutAtSta (method)
  CutAtSta(): boolean;
  CutAtSta(B: boolean): void;

  // HLRBRep_EdgeData.CutAtEnd (method)
  CutAtEnd(): boolean;
  CutAtEnd(B: boolean): void;

  // HLRBRep_EdgeData.VerAtSta (method)
  VerAtSta(): boolean;
  VerAtSta(B: boolean): void;

  // HLRBRep_EdgeData.VerAtEnd (method)
  VerAtEnd(): boolean;
  VerAtEnd(B: boolean): void;

  // HLRBRep_EdgeData.AutoIntersectionDone (method)
  AutoIntersectionDone(): boolean;
  AutoIntersectionDone(B: boolean): void;

  // HLRBRep_EdgeData.Used (method)
  Used(): boolean;
  Used(B: boolean): void;

  // HLRBRep_EdgeData.HideCount (method)
  HideCount(): number;
  HideCount(I: number): void;

  // HLRBRep_EdgeData.VSta (method)
  VSta(): number;
  VSta(I: number): void;

  // HLRBRep_EdgeData.VEnd (method)
  VEnd(): number;
  VEnd(I: number): void;

  // HLRBRep_EdgeData.UpdateMinMax (method)
  UpdateMinMax(theTotMinMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

  // HLRBRep_EdgeData.MinMax (method)
  MinMax(): HLRAlgo_EdgesBlock_MinMaxIndices;

  // HLRBRep_EdgeData.Status (method)
  Status(): HLRAlgo_EdgeStatus;

  // HLRBRep_EdgeData.ChangeGeometry (method)
  ChangeGeometry(): HLRBRep_Curve;

  // HLRBRep_EdgeData.Geometry (method)
  Geometry(): HLRBRep_Curve;

  // HLRBRep_EdgeData.Curve (method)
  Curve(): HLRBRep_Curve;

  // HLRBRep_EdgeData.Tolerance (method)
  Tolerance(): number;

  // HLRBRep_EdgeData.delete (method)
  delete(): void;

  // HLRBRep_EdgeData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_EdgeFaceTool: declare class HLRBRep_EdgeFaceTool

  // HLRBRep_EdgeFaceTool.constructor (constructor)
  constructor();

  // HLRBRep_EdgeFaceTool.delete (method)
  delete(): void;

  // HLRBRep_EdgeFaceTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_EdgeIList: declare class HLRBRep_EdgeIList

  // HLRBRep_EdgeIList.constructor (constructor)
  constructor();

  // HLRBRep_EdgeIList.AddInterference (method)
  static AddInterference(IL: NCollection_List_HLRAlgo_Interference, I: HLRAlgo_Interference, T: HLRBRep_EdgeInterferenceTool): void;

  // HLRBRep_EdgeIList.ProcessComplex (method)
  static ProcessComplex(IL: NCollection_List_HLRAlgo_Interference, T: HLRBRep_EdgeInterferenceTool): void;

  // HLRBRep_EdgeIList.delete (method)
  delete(): void;

  // HLRBRep_EdgeIList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_EdgeInterferenceTool: declare class HLRBRep_EdgeInterferenceTool

  // HLRBRep_EdgeInterferenceTool.LoadEdge (method)
  LoadEdge(): void;

  // HLRBRep_EdgeInterferenceTool.InitVertices (method)
  InitVertices(): void;

  // HLRBRep_EdgeInterferenceTool.MoreVertices (method)
  MoreVertices(): boolean;

  // HLRBRep_EdgeInterferenceTool.NextVertex (method)
  NextVertex(): void;

  // HLRBRep_EdgeInterferenceTool.CurrentVertex (method)
  CurrentVertex(): HLRAlgo_Intersection;

  // HLRBRep_EdgeInterferenceTool.CurrentOrientation (method)
  CurrentOrientation(): TopAbs_Orientation;

  // HLRBRep_EdgeInterferenceTool.CurrentParameter (method)
  CurrentParameter(): number;

  // HLRBRep_EdgeInterferenceTool.IsPeriodic (method)
  IsPeriodic(): boolean;

  // HLRBRep_EdgeInterferenceTool.EdgeGeometry (method)
  EdgeGeometry(Param: number, Tgt: gp_Dir, Nrm: gp_Dir, Curv?: number): { Curv: number };

  // HLRBRep_EdgeInterferenceTool.ParameterOfInterference (method)
  ParameterOfInterference(I: HLRAlgo_Interference): number;

  // HLRBRep_EdgeInterferenceTool.SameInterferences (method)
  SameInterferences(I1: HLRAlgo_Interference, I2: HLRAlgo_Interference): boolean;

  // HLRBRep_EdgeInterferenceTool.SameVertexAndInterference (method)
  SameVertexAndInterference(I: HLRAlgo_Interference): boolean;

  // HLRBRep_EdgeInterferenceTool.InterferenceBoundaryGeometry (method)
  InterferenceBoundaryGeometry(I: HLRAlgo_Interference, Tang: gp_Dir, Norm: gp_Dir, Curv?: number): { Curv: number };

  // HLRBRep_EdgeInterferenceTool.delete (method)
  delete(): void;

  // HLRBRep_EdgeInterferenceTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter: declare class HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter

  // HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter.Perform (method)
  Perform(Poly1: HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter, Poly2: HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter, NumSegOn1: number, NumSegOn2: number, ParamOnSeg1: number, ParamOnSeg2: number): { NumSegOn1: number; NumSegOn2: number; ParamOnSeg1: number; ParamOnSeg2: number };
  Perform(Uo: number, Vo: number, UInf: number, VInf: number, USup: number, VSup: number): void;

  // HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter.NbRoots (method)
  NbRoots(): number;

  // HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter.Roots (method)
  Roots(U?: number, V?: number): { U: number; V: number };

  // HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter.AnErrorOccurred (method)
  AnErrorOccurred(): boolean;

  // HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter.delete (method)
  delete(): void;

  // HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_FaceData: declare class HLRBRep_FaceData

  // HLRBRep_FaceData.constructor (constructor)
  constructor();

  // HLRBRep_FaceData.Set (method)
  Set(FG: TopoDS_Face, Or: TopAbs_Orientation, Cl: boolean, NW: number): void;

  // HLRBRep_FaceData.SetWire (method)
  SetWire(WI: number, NE: number): void;

  // HLRBRep_FaceData.SetWEdge (method)
  SetWEdge(WI: number, EWI: number, EI: number, Or: TopAbs_Orientation, OutL: boolean, Inte: boolean, Dble: boolean, IsoL: boolean): void;

  // HLRBRep_FaceData.Selected (method)
  Selected(): boolean;
  Selected(B: boolean): void;

  // HLRBRep_FaceData.Back (method)
  Back(): boolean;
  Back(B: boolean): void;

  // HLRBRep_FaceData.Side (method)
  Side(): boolean;
  Side(B: boolean): void;

  // HLRBRep_FaceData.Closed (method)
  Closed(): boolean;
  Closed(B: boolean): void;

  // HLRBRep_FaceData.Hiding (method)
  Hiding(): boolean;
  Hiding(B: boolean): void;

  // HLRBRep_FaceData.Simple (method)
  Simple(): boolean;
  Simple(B: boolean): void;

  // HLRBRep_FaceData.Cut (method)
  Cut(): boolean;
  Cut(B: boolean): void;

  // HLRBRep_FaceData.WithOutL (method)
  WithOutL(): boolean;
  WithOutL(B: boolean): void;

  // HLRBRep_FaceData.Plane (method)
  Plane(): boolean;
  Plane(B: boolean): void;

  // HLRBRep_FaceData.Cylinder (method)
  Cylinder(): boolean;
  Cylinder(B: boolean): void;

  // HLRBRep_FaceData.Cone (method)
  Cone(): boolean;
  Cone(B: boolean): void;

  // HLRBRep_FaceData.Sphere (method)
  Sphere(): boolean;
  Sphere(B: boolean): void;

  // HLRBRep_FaceData.Torus (method)
  Torus(): boolean;
  Torus(B: boolean): void;

  // HLRBRep_FaceData.Size (method)
  Size(): number;
  Size(S: number): void;

  // HLRBRep_FaceData.Orientation (method)
  Orientation(): TopAbs_Orientation;
  Orientation(O: TopAbs_Orientation): void;

  // HLRBRep_FaceData.Wires (method)
  Wires(): HLRAlgo_WiresBlock;

  // HLRBRep_FaceData.Tolerance (method)
  Tolerance(): number;

  // HLRBRep_FaceData.delete (method)
  delete(): void;

  // HLRBRep_FaceData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_FaceIterator: declare class HLRBRep_FaceIterator

  // HLRBRep_FaceIterator.constructor (constructor)
  constructor();

  // HLRBRep_FaceIterator.InitEdge (method)
  InitEdge(fd: HLRBRep_FaceData): void;

  // HLRBRep_FaceIterator.MoreEdge (method)
  MoreEdge(): boolean;

  // HLRBRep_FaceIterator.NextEdge (method)
  NextEdge(): void;

  // HLRBRep_FaceIterator.BeginningOfWire (method)
  BeginningOfWire(): boolean;

  // HLRBRep_FaceIterator.EndOfWire (method)
  EndOfWire(): boolean;

  // HLRBRep_FaceIterator.SkipWire (method)
  SkipWire(): void;

  // HLRBRep_FaceIterator.Wire (method)
  Wire(): HLRAlgo_EdgesBlock;

  // HLRBRep_FaceIterator.Edge (method)
  Edge(): number;

  // HLRBRep_FaceIterator.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // HLRBRep_FaceIterator.OutLine (method)
  OutLine(): boolean;

  // HLRBRep_FaceIterator.Internal (method)
  Internal(): boolean;

  // HLRBRep_FaceIterator.Double (method)
  Double(): boolean;

  // HLRBRep_FaceIterator.IsoLine (method)
  IsoLine(): boolean;

  // HLRBRep_FaceIterator.delete (method)
  delete(): void;

  // HLRBRep_FaceIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_HLRToShape: declare class HLRBRep_HLRToShape

  // HLRBRep_HLRToShape.constructor (constructor)
  constructor(A: HLRBRep_Algo);

  // HLRBRep_HLRToShape.VCompound (method)
  VCompound(): TopoDS_Shape;
  VCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_HLRToShape.Rg1LineVCompound (method)
  Rg1LineVCompound(): TopoDS_Shape;
  Rg1LineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_HLRToShape.RgNLineVCompound (method)
  RgNLineVCompound(): TopoDS_Shape;
  RgNLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_HLRToShape.OutLineVCompound (method)
  OutLineVCompound(): TopoDS_Shape;
  OutLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_HLRToShape.OutLineVCompound3d (method)
  OutLineVCompound3d(): TopoDS_Shape;

  // HLRBRep_HLRToShape.IsoLineVCompound (method)
  IsoLineVCompound(): TopoDS_Shape;
  IsoLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_HLRToShape.HCompound (method)
  HCompound(): TopoDS_Shape;
  HCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_HLRToShape.Rg1LineHCompound (method)
  Rg1LineHCompound(): TopoDS_Shape;
  Rg1LineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_HLRToShape.RgNLineHCompound (method)
  RgNLineHCompound(): TopoDS_Shape;
  RgNLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_HLRToShape.OutLineHCompound (method)
  OutLineHCompound(): TopoDS_Shape;
  OutLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_HLRToShape.IsoLineHCompound (method)
  IsoLineHCompound(): TopoDS_Shape;
  IsoLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_HLRToShape.CompoundOfEdges (method)
  CompoundOfEdges(type_: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;
  CompoundOfEdges(S: TopoDS_Shape, type_: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;

  // HLRBRep_HLRToShape.delete (method)
  delete(): void;

  // HLRBRep_HLRToShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_Hider: declare class HLRBRep_Hider

  // HLRBRep_Hider.OwnHiding (method)
  OwnHiding(FI: number): void;

  // HLRBRep_Hider.Hide (method)
  Hide(FI: number, MST: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher): void;

  // HLRBRep_Hider.delete (method)
  delete(): void;

  // HLRBRep_Hider.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_IntConicCurveOfCInter: declare class HLRBRep_IntConicCurveOfCInter extends IntRes2d_Intersection

  // HLRBRep_IntConicCurveOfCInter.constructor (constructor)
  constructor();

  // HLRBRep_IntConicCurveOfCInter.delete (method)
  delete(): void;

  // HLRBRep_IntConicCurveOfCInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_InterCSurf: declare class HLRBRep_InterCSurf extends IntCurveSurface_Intersection

  // HLRBRep_InterCSurf.constructor (constructor)
  constructor();

  // HLRBRep_InterCSurf.delete (method)
  delete(): void;

  // HLRBRep_InterCSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_InternalAlgo: declare class HLRBRep_InternalAlgo extends Standard_Transient

  // HLRBRep_InternalAlgo.constructor (constructor)
  constructor();
  constructor(A: HLRBRep_InternalAlgo);

  // HLRBRep_InternalAlgo.Projector (method)
  Projector(P: HLRAlgo_Projector): void;
  Projector(): HLRAlgo_Projector;

  // HLRBRep_InternalAlgo.Update (method)
  Update(): void;

  // HLRBRep_InternalAlgo.Load (method)
  Load(S: HLRTopoBRep_OutLiner, SData: Standard_Transient, nbIso: number): void;
  Load(S: HLRTopoBRep_OutLiner, nbIso: number): void;

  // HLRBRep_InternalAlgo.Index (method)
  Index(S: HLRTopoBRep_OutLiner): number;

  // HLRBRep_InternalAlgo.Remove (method)
  Remove(I: number): void;

  // HLRBRep_InternalAlgo.ShapeData (method)
  ShapeData(I: number, SData: Standard_Transient): void;

  // HLRBRep_InternalAlgo.SeqOfShapeBounds (method)
  SeqOfShapeBounds(): NCollection_Sequence_HLRBRep_ShapeBounds;

  // HLRBRep_InternalAlgo.NbShapes (method)
  NbShapes(): number;

  // HLRBRep_InternalAlgo.ShapeBounds (method)
  ShapeBounds(I: number): HLRBRep_ShapeBounds;

  // HLRBRep_InternalAlgo.InitEdgeStatus (method)
  InitEdgeStatus(): void;

  // HLRBRep_InternalAlgo.Select (method)
  Select(): void;
  Select(I: number): void;

  // HLRBRep_InternalAlgo.SelectEdge (method)
  SelectEdge(I: number): void;

  // HLRBRep_InternalAlgo.SelectFace (method)
  SelectFace(I: number): void;

  // HLRBRep_InternalAlgo.ShowAll (method)
  ShowAll(): void;
  ShowAll(I: number): void;

  // HLRBRep_InternalAlgo.HideAll (method)
  HideAll(): void;
  HideAll(I: number): void;

  // HLRBRep_InternalAlgo.PartialHide (method)
  PartialHide(): void;

  // HLRBRep_InternalAlgo.Hide (method)
  Hide(): void;
  Hide(I: number): void;
  Hide(I: number, J: number): void;

  // HLRBRep_InternalAlgo.Debug (method)
  Debug(deb: boolean): void;
  Debug(): boolean;

  // HLRBRep_InternalAlgo.get_type_name (method)
  static get_type_name(): string;

  // HLRBRep_InternalAlgo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRBRep_InternalAlgo.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRBRep_InternalAlgo.delete (method)
  delete(): void;

  // HLRBRep_InternalAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_LineTool: declare class HLRBRep_LineTool

  // HLRBRep_LineTool.constructor (constructor)
  constructor();

  // HLRBRep_LineTool.FirstParameter (method)
  static FirstParameter(C: gp_Lin): number;

  // HLRBRep_LineTool.LastParameter (method)
  static LastParameter(C: gp_Lin): number;

  // HLRBRep_LineTool.Continuity (method)
  static Continuity(C: gp_Lin): GeomAbs_Shape;

  // HLRBRep_LineTool.NbIntervals (method)
  static NbIntervals(C: gp_Lin, S: GeomAbs_Shape): number;

  // HLRBRep_LineTool.Intervals (method)
  static Intervals(C: gp_Lin, T: NCollection_Array1_double, Sh: GeomAbs_Shape): void;

  // HLRBRep_LineTool.IntervalFirst (method)
  static IntervalFirst(C: gp_Lin): number;

  // HLRBRep_LineTool.IntervalLast (method)
  static IntervalLast(C: gp_Lin): number;

  // HLRBRep_LineTool.IntervalContinuity (method)
  static IntervalContinuity(C: gp_Lin): GeomAbs_Shape;

  // HLRBRep_LineTool.IsClosed (method)
  static IsClosed(C: gp_Lin): boolean;

  // HLRBRep_LineTool.IsPeriodic (method)
  static IsPeriodic(C: gp_Lin): boolean;

  // HLRBRep_LineTool.Period (method)
  static Period(C: gp_Lin): number;

  // HLRBRep_LineTool.Value (method)
  static Value(C: gp_Lin, U: number): gp_Pnt;

  // HLRBRep_LineTool.D0 (method)
  static D0(C: gp_Lin, U: number, P: gp_Pnt): void;

  // HLRBRep_LineTool.D1 (method)
  static D1(C: gp_Lin, U: number, P: gp_Pnt, V: gp_Vec): void;

  // HLRBRep_LineTool.D2 (method)
  static D2(C: gp_Lin, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  // HLRBRep_LineTool.D3 (method)
  static D3(C: gp_Lin, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

  // HLRBRep_LineTool.DN (method)
  static DN(C: gp_Lin, U: number, N: number): gp_Vec;

  // HLRBRep_LineTool.Resolution (method)
  static Resolution(C: gp_Lin, R3d: number): number;

  // HLRBRep_LineTool.GetType (method)
  static GetType(C: gp_Lin): GeomAbs_CurveType;

  // HLRBRep_LineTool.Line (method)
  static Line(C: gp_Lin): gp_Lin;

  // HLRBRep_LineTool.Circle (method)
  static Circle(C: gp_Lin): gp_Circ;

  // HLRBRep_LineTool.Ellipse (method)
  static Ellipse(C: gp_Lin): gp_Elips;

  // HLRBRep_LineTool.Hyperbola (method)
  static Hyperbola(C: gp_Lin): gp_Hypr;

  // HLRBRep_LineTool.Parabola (method)
  static Parabola(C: gp_Lin): gp_Parab;

  // HLRBRep_LineTool.Bezier (method)
  static Bezier(C: gp_Lin): Geom_BezierCurve;

  // HLRBRep_LineTool.BSpline (method)
  static BSpline(C: gp_Lin): Geom_BSplineCurve;

  // HLRBRep_LineTool.Degree (method)
  static Degree(C: gp_Lin): number;

  // HLRBRep_LineTool.NbPoles (method)
  static NbPoles(C: gp_Lin): number;

  // HLRBRep_LineTool.Poles (method)
  static Poles(C: gp_Lin, TP: NCollection_Array1_gp_Pnt): void;

  // HLRBRep_LineTool.IsRational (method)
  static IsRational(C: gp_Lin): boolean;

  // HLRBRep_LineTool.PolesAndWeights (method)
  static PolesAndWeights(C: gp_Lin, TP: NCollection_Array1_gp_Pnt, TW: NCollection_Array1_double): void;

  // HLRBRep_LineTool.NbKnots (method)
  static NbKnots(C: gp_Lin): number;

  // HLRBRep_LineTool.KnotsAndMultiplicities (method)
  static KnotsAndMultiplicities(C: gp_Lin, TK: NCollection_Array1_double, TM: NCollection_Array1_int): void;

  // HLRBRep_LineTool.NbSamples (method)
  static NbSamples(C: gp_Lin, U0: number, U1: number): number;

  // HLRBRep_LineTool.SamplePars (method)
  static SamplePars(C: gp_Lin, U0: number, U1: number, Defl: number, NbMin: number): NCollection_HArray1_double;

  // HLRBRep_LineTool.delete (method)
  delete(): void;

  // HLRBRep_LineTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter: declare class HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter extends math_FunctionWithDerivative

  // HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter.delete (method)
  delete(): void;

  // HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_PolyAlgo: declare class HLRBRep_PolyAlgo extends Standard_Transient

  // HLRBRep_PolyAlgo.constructor (constructor)
  constructor();
  constructor(A: HLRBRep_PolyAlgo);
  constructor(S: TopoDS_Shape);

  // HLRBRep_PolyAlgo.NbShapes (method)
  NbShapes(): number;

  // HLRBRep_PolyAlgo.Shape (method)
  Shape(I: number): TopoDS_Shape;

  // HLRBRep_PolyAlgo.Remove (method)
  Remove(I: number): void;

  // HLRBRep_PolyAlgo.Index (method)
  Index(S: TopoDS_Shape): number;

  // HLRBRep_PolyAlgo.Load (method)
  Load(theShape: TopoDS_Shape): void;

  // HLRBRep_PolyAlgo.Algo (method)
  Algo(): HLRAlgo_PolyAlgo;

  // HLRBRep_PolyAlgo.Projector (method)
  Projector(): HLRAlgo_Projector;
  Projector(theProj: HLRAlgo_Projector): void;

  // HLRBRep_PolyAlgo.TolAngular (method)
  TolAngular(): number;
  TolAngular(theTol: number): void;

  // HLRBRep_PolyAlgo.TolCoef (method)
  TolCoef(): number;
  TolCoef(theTol: number): void;

  // HLRBRep_PolyAlgo.Update (method)
  Update(): void;

  // HLRBRep_PolyAlgo.InitHide (method)
  InitHide(): void;

  // HLRBRep_PolyAlgo.MoreHide (method)
  MoreHide(): boolean;

  // HLRBRep_PolyAlgo.NextHide (method)
  NextHide(): void;

  // HLRBRep_PolyAlgo.Hide (method)
  Hide(status: HLRAlgo_EdgeStatus, S: TopoDS_Shape, reg1?: boolean, regn?: boolean, outl?: boolean, intl?: boolean): { returnValue: HLRAlgo_BiPoint_PointsT; reg1: boolean; regn: boolean; outl: boolean; intl: boolean; [Symbol.dispose](): void };

  // HLRBRep_PolyAlgo.InitShow (method)
  InitShow(): void;

  // HLRBRep_PolyAlgo.MoreShow (method)
  MoreShow(): boolean;

  // HLRBRep_PolyAlgo.NextShow (method)
  NextShow(): void;

  // HLRBRep_PolyAlgo.Show (method)
  Show(S: TopoDS_Shape, reg1?: boolean, regn?: boolean, outl?: boolean, intl?: boolean): { returnValue: HLRAlgo_BiPoint_PointsT; reg1: boolean; regn: boolean; outl: boolean; intl: boolean; [Symbol.dispose](): void };

  // HLRBRep_PolyAlgo.OutLinedShape (method)
  OutLinedShape(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_PolyAlgo.Debug (method)
  Debug(): boolean;
  Debug(theDebug: boolean): void;

  // HLRBRep_PolyAlgo.get_type_name (method)
  static get_type_name(): string;

  // HLRBRep_PolyAlgo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRBRep_PolyAlgo.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRBRep_PolyAlgo.delete (method)
  delete(): void;

  // HLRBRep_PolyAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
