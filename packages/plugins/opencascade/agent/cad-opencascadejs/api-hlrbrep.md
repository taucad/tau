# libcascade — HLRBRep

23 top-level symbols. Signatures are verbatim typescript.

HLRBRep: declare class HLRBRep

  constructor

  static MakeEdge(ec: HLRBRep_Curve, U1: number, U2: number): TopoDS_Edge;

  static MakeEdge3d(ec: HLRBRep_Curve, U1: number, U2: number): TopoDS_Edge;

  static PolyHLRAngleAndDeflection(InAngl: number, OutAngl?: number, OutDefl?: number): { OutAngl: number; OutDefl: number };

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_Algo: declare class HLRBRep_Algo extends HLRBRep_InternalAlgo

  constructor

  Add(S: TopoDS_Shape, SData: Standard_Transient, nbIso: number): void;
  Add(S: TopoDS_Shape, nbIso: number): void;
  Add(S: TopoDS_Shape, SData: Standard_Transient, nbIso: number): void;
  Add(S: TopoDS_Shape, nbIso: number): void;

  Index(S: TopoDS_Shape): number;
  Index(S: HLRTopoBRep_OutLiner): number;
  Index(S: TopoDS_Shape): number;
  Index(S: HLRTopoBRep_OutLiner): number;

  OutLinedShapeNullify(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_AreaLimit: declare class HLRBRep_AreaLimit extends Standard_Transient

  constructor

  StateBefore(St: TopAbs_State): void;
  StateBefore(): TopAbs_State;
  StateBefore(St: TopAbs_State): void;
  StateBefore(): TopAbs_State;

  StateAfter(St: TopAbs_State): void;
  StateAfter(): TopAbs_State;
  StateAfter(St: TopAbs_State): void;
  StateAfter(): TopAbs_State;

  EdgeBefore(St: TopAbs_State): void;
  EdgeBefore(): TopAbs_State;
  EdgeBefore(St: TopAbs_State): void;
  EdgeBefore(): TopAbs_State;

  EdgeAfter(St: TopAbs_State): void;
  EdgeAfter(): TopAbs_State;
  EdgeAfter(St: TopAbs_State): void;
  EdgeAfter(): TopAbs_State;

  Previous(P: HLRBRep_AreaLimit): void;
  Previous(): HLRBRep_AreaLimit;
  Previous(P: HLRBRep_AreaLimit): void;
  Previous(): HLRBRep_AreaLimit;

  Next(N: HLRBRep_AreaLimit): void;
  Next(): HLRBRep_AreaLimit;
  Next(N: HLRBRep_AreaLimit): void;
  Next(): HLRBRep_AreaLimit;

  Vertex(): HLRAlgo_Intersection;

  IsBoundary(): boolean;

  IsInterference(): boolean;

  Clear(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_BCurveTool: declare class HLRBRep_BCurveTool

  constructor

  static FirstParameter(C: BRepAdaptor_Curve): number;

  static LastParameter(C: BRepAdaptor_Curve): number;

  static Continuity(C: BRepAdaptor_Curve): GeomAbs_Shape;

  static NbIntervals(C: BRepAdaptor_Curve, S: GeomAbs_Shape): number;

  static Intervals(C: BRepAdaptor_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  static IsClosed(C: BRepAdaptor_Curve): boolean;

  static IsPeriodic(C: BRepAdaptor_Curve): boolean;

  static Period(C: BRepAdaptor_Curve): number;

  static Value(C: BRepAdaptor_Curve, U: number): gp_Pnt;

  static D0(C: BRepAdaptor_Curve, U: number, P: gp_Pnt): void;

  static D1(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V: gp_Vec): void;

  static D2(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  static D3(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

  static DN(C: BRepAdaptor_Curve, U: number, N: number): gp_Vec;

  static Resolution(C: BRepAdaptor_Curve, R3d: number): number;

  static GetType(C: BRepAdaptor_Curve): GeomAbs_CurveType;

  static Line(C: BRepAdaptor_Curve): gp_Lin;

  static Circle(C: BRepAdaptor_Curve): gp_Circ;

  static Ellipse(C: BRepAdaptor_Curve): gp_Elips;

  static Hyperbola(C: BRepAdaptor_Curve): gp_Hypr;

  static Parabola(C: BRepAdaptor_Curve): gp_Parab;

  static Bezier(C: BRepAdaptor_Curve): Geom_BezierCurve;

  static BSpline(C: BRepAdaptor_Curve): Geom_BSplineCurve;

  static Degree(C: BRepAdaptor_Curve): number;

  static IsRational(C: BRepAdaptor_Curve): boolean;

  static NbPoles(C: BRepAdaptor_Curve): number;

  static NbKnots(C: BRepAdaptor_Curve): number;

  static Poles(C: BRepAdaptor_Curve, T: NCollection_Array1_gp_Pnt): void;

  static PolesAndWeights(C: BRepAdaptor_Curve, T: NCollection_Array1_gp_Pnt, W: NCollection_Array1_double): void;

  static NbSamples(C: BRepAdaptor_Curve, U0: number, U1: number): number;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_BiPnt2D: declare class HLRBRep_BiPnt2D

  constructor

  P1(): gp_Pnt2d;

  P2(): gp_Pnt2d;

  Shape(): TopoDS_Shape;
  Shape(S: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;
  Shape(S: TopoDS_Shape): void;

  Rg1Line(): boolean;
  Rg1Line(B: boolean): void;
  Rg1Line(): boolean;
  Rg1Line(B: boolean): void;

  RgNLine(): boolean;
  RgNLine(B: boolean): void;
  RgNLine(): boolean;
  RgNLine(B: boolean): void;

  OutLine(): boolean;
  OutLine(B: boolean): void;
  OutLine(): boolean;
  OutLine(B: boolean): void;

  IntLine(): boolean;
  IntLine(B: boolean): void;
  IntLine(): boolean;
  IntLine(B: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_BiPoint: declare class HLRBRep_BiPoint

  constructor

  P1(): gp_Pnt;

  P2(): gp_Pnt;

  Shape(): TopoDS_Shape;
  Shape(S: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;
  Shape(S: TopoDS_Shape): void;

  Rg1Line(): boolean;
  Rg1Line(B: boolean): void;
  Rg1Line(): boolean;
  Rg1Line(B: boolean): void;

  RgNLine(): boolean;
  RgNLine(B: boolean): void;
  RgNLine(): boolean;
  RgNLine(B: boolean): void;

  OutLine(): boolean;
  OutLine(B: boolean): void;
  OutLine(): boolean;
  OutLine(B: boolean): void;

  IntLine(): boolean;
  IntLine(B: boolean): void;
  IntLine(): boolean;
  IntLine(B: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_CInter: declare class HLRBRep_CInter extends IntRes2d_Intersection

  constructor

  SetMinNbSamples(theMinNbSamples: number): void;

  GetMinNbSamples(): number;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_CLPropsATool: declare class HLRBRep_CLPropsATool

  constructor

  static Value(A: HLRBRep_Curve, U: number, P: gp_Pnt2d): void;

  static D1(A: HLRBRep_Curve, U: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

  static D2(A: HLRBRep_Curve, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  static D3(A: HLRBRep_Curve, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  static Continuity(A: HLRBRep_Curve): number;

  static FirstParameter(A: HLRBRep_Curve): number;

  static LastParameter(A: HLRBRep_Curve): number;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_Curve: declare class HLRBRep_Curve

  constructor

  Projector(Proj: HLRAlgo_Projector): void;

  Curve(): BRepAdaptor_Curve;
  Curve(E: TopoDS_Edge): void;
  Curve(): BRepAdaptor_Curve;
  Curve(E: TopoDS_Edge): void;

  GetCurve(): BRepAdaptor_Curve;

  Parameter2d(P3d: number): number;

  Parameter3d(P2d: number): number;

  Update(TotMin: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], TotMax: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): number;

  UpdateMinMax(TotMin: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], TotMax: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): number;

  Z(U: number): number;

  Value3D(U: number): gp_Pnt;

  D0(U: number, P: gp_Pnt): void;
  D0(U: number, P: gp_Pnt2d): void;
  D0(U: number, P: gp_Pnt): void;
  D0(U: number, P: gp_Pnt2d): void;

  D1(U: number, P: gp_Pnt, V: gp_Vec): void;
  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;
  D1(U: number, P: gp_Pnt, V: gp_Vec): void;
  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  Tangent(AtStart: boolean, P: gp_Pnt2d, D: gp_Dir2d): void;

  FirstParameter(): number;

  LastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Period(): number;

  Value(U: number): gp_Pnt2d;

  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  DN(U: number, N: number): gp_Vec2d;

  Resolution(R3d: number): number;

  GetType(): GeomAbs_CurveType;

  Line(): gp_Lin2d;

  Circle(): gp_Circ2d;

  Ellipse(): gp_Elips2d;

  Hyperbola(): gp_Hypr2d;

  Parabola(): gp_Parab2d;

  IsRational(): boolean;

  Degree(): number;

  NbPoles(): number;

  Poles(TP: NCollection_Array1_gp_Pnt2d): void;
  Poles(aCurve: Geom_BSplineCurve, TP: NCollection_Array1_gp_Pnt2d): void;
  Poles(TP: NCollection_Array1_gp_Pnt2d): void;
  Poles(aCurve: Geom_BSplineCurve, TP: NCollection_Array1_gp_Pnt2d): void;

  PolesAndWeights(TP: NCollection_Array1_gp_Pnt2d, TW: NCollection_Array1_double): void;
  PolesAndWeights(aCurve: Geom_BSplineCurve, TP: NCollection_Array1_gp_Pnt2d, TW: NCollection_Array1_double): void;
  PolesAndWeights(TP: NCollection_Array1_gp_Pnt2d, TW: NCollection_Array1_double): void;
  PolesAndWeights(aCurve: Geom_BSplineCurve, TP: NCollection_Array1_gp_Pnt2d, TW: NCollection_Array1_double): void;

  NbKnots(): number;

  Knots(kn: NCollection_Array1_double): void;

  Multiplicities(mu: NCollection_Array1_int): void;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_CurveTool: declare class HLRBRep_CurveTool

  constructor

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_EdgeBuilder: declare class HLRBRep_EdgeBuilder

  constructor

  InitAreas(): void;

  NextArea(): void;

  PreviousArea(): void;

  HasArea(): boolean;

  AreaState(): TopAbs_State;

  AreaEdgeState(): TopAbs_State;

  LeftLimit(): HLRBRep_AreaLimit;

  RightLimit(): HLRBRep_AreaLimit;

  Builds(ToBuild: TopAbs_State): void;

  MoreEdges(): boolean;

  NextEdge(): void;

  MoreVertices(): boolean;

  NextVertex(): void;

  Current(): HLRAlgo_Intersection;

  IsBoundary(): boolean;

  IsInterference(): boolean;

  Orientation(): TopAbs_Orientation;

  Destroy(): void;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_EdgeData: declare class HLRBRep_EdgeData

  constructor

  Set(Reg1: boolean, RegN: boolean, EG: TopoDS_Edge, V1: number, V2: number, Out1: boolean, Out2: boolean, Cut1: boolean, Cut2: boolean, Start: number, TolStart: number, End: number, TolEnd: number): void;

  Selected(): boolean;
  Selected(B: boolean): void;
  Selected(): boolean;
  Selected(B: boolean): void;

  Rg1Line(): boolean;
  Rg1Line(B: boolean): void;
  Rg1Line(): boolean;
  Rg1Line(B: boolean): void;

  RgNLine(): boolean;
  RgNLine(B: boolean): void;
  RgNLine(): boolean;
  RgNLine(B: boolean): void;

  Vertical(): boolean;
  Vertical(B: boolean): void;
  Vertical(): boolean;
  Vertical(B: boolean): void;

  Simple(): boolean;
  Simple(B: boolean): void;
  Simple(): boolean;
  Simple(B: boolean): void;

  OutLVSta(): boolean;
  OutLVSta(B: boolean): void;
  OutLVSta(): boolean;
  OutLVSta(B: boolean): void;

  OutLVEnd(): boolean;
  OutLVEnd(B: boolean): void;
  OutLVEnd(): boolean;
  OutLVEnd(B: boolean): void;

  CutAtSta(): boolean;
  CutAtSta(B: boolean): void;
  CutAtSta(): boolean;
  CutAtSta(B: boolean): void;

  CutAtEnd(): boolean;
  CutAtEnd(B: boolean): void;
  CutAtEnd(): boolean;
  CutAtEnd(B: boolean): void;

  VerAtSta(): boolean;
  VerAtSta(B: boolean): void;
  VerAtSta(): boolean;
  VerAtSta(B: boolean): void;

  VerAtEnd(): boolean;
  VerAtEnd(B: boolean): void;
  VerAtEnd(): boolean;
  VerAtEnd(B: boolean): void;

  AutoIntersectionDone(): boolean;
  AutoIntersectionDone(B: boolean): void;
  AutoIntersectionDone(): boolean;
  AutoIntersectionDone(B: boolean): void;

  Used(): boolean;
  Used(B: boolean): void;
  Used(): boolean;
  Used(B: boolean): void;

  HideCount(): number;
  HideCount(I: number): void;
  HideCount(): number;
  HideCount(I: number): void;

  VSta(): number;
  VSta(I: number): void;
  VSta(): number;
  VSta(I: number): void;

  VEnd(): number;
  VEnd(I: number): void;
  VEnd(): number;
  VEnd(I: number): void;

  UpdateMinMax(theTotMinMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

  MinMax(): HLRAlgo_EdgesBlock_MinMaxIndices;

  Status(): HLRAlgo_EdgeStatus;

  ChangeGeometry(): HLRBRep_Curve;

  Geometry(): HLRBRep_Curve;

  Curve(): HLRBRep_Curve;

  Tolerance(): number;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_EdgeFaceTool: declare class HLRBRep_EdgeFaceTool

  constructor

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_EdgeIList: declare class HLRBRep_EdgeIList

  constructor

  static AddInterference(IL: NCollection_List_HLRAlgo_Interference, I: HLRAlgo_Interference, T: HLRBRep_EdgeInterferenceTool): void;

  static ProcessComplex(IL: NCollection_List_HLRAlgo_Interference, T: HLRBRep_EdgeInterferenceTool): void;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_EdgeInterferenceTool: declare class HLRBRep_EdgeInterferenceTool

  LoadEdge(): void;

  InitVertices(): void;

  MoreVertices(): boolean;

  NextVertex(): void;

  CurrentVertex(): HLRAlgo_Intersection;

  CurrentOrientation(): TopAbs_Orientation;

  CurrentParameter(): number;

  IsPeriodic(): boolean;

  EdgeGeometry(Param: number, Tgt: gp_Dir, Nrm: gp_Dir, Curv?: number): { Curv: number };

  ParameterOfInterference(I: HLRAlgo_Interference): number;

  SameInterferences(I1: HLRAlgo_Interference, I2: HLRAlgo_Interference): boolean;

  SameVertexAndInterference(I: HLRAlgo_Interference): boolean;

  InterferenceBoundaryGeometry(I: HLRAlgo_Interference, Tang: gp_Dir, Norm: gp_Dir, Curv?: number): { Curv: number };

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter: declare class HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter

  Perform(Poly1: HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter, Poly2: HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter, NumSegOn1: number, NumSegOn2: number, ParamOnSeg1: number, ParamOnSeg2: number): { NumSegOn1: number; NumSegOn2: number; ParamOnSeg1: number; ParamOnSeg2: number };
  Perform(Uo: number, Vo: number, UInf: number, VInf: number, USup: number, VSup: number): void;
  Perform(Poly1: HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter, Poly2: HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter, NumSegOn1: number, NumSegOn2: number, ParamOnSeg1: number, ParamOnSeg2: number): { NumSegOn1: number; NumSegOn2: number; ParamOnSeg1: number; ParamOnSeg2: number };
  Perform(Uo: number, Vo: number, UInf: number, VInf: number, USup: number, VSup: number): void;

  NbRoots(): number;

  Roots(U?: number, V?: number): { U: number; V: number };

  AnErrorOccurred(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_FaceData: declare class HLRBRep_FaceData

  constructor

  Set(FG: TopoDS_Face, Or: TopAbs_Orientation, Cl: boolean, NW: number): void;

  SetWire(WI: number, NE: number): void;

  SetWEdge(WI: number, EWI: number, EI: number, Or: TopAbs_Orientation, OutL: boolean, Inte: boolean, Dble: boolean, IsoL: boolean): void;

  Selected(): boolean;
  Selected(B: boolean): void;
  Selected(): boolean;
  Selected(B: boolean): void;

  Back(): boolean;
  Back(B: boolean): void;
  Back(): boolean;
  Back(B: boolean): void;

  Side(): boolean;
  Side(B: boolean): void;
  Side(): boolean;
  Side(B: boolean): void;

  Closed(): boolean;
  Closed(B: boolean): void;
  Closed(): boolean;
  Closed(B: boolean): void;

  Hiding(): boolean;
  Hiding(B: boolean): void;
  Hiding(): boolean;
  Hiding(B: boolean): void;

  Simple(): boolean;
  Simple(B: boolean): void;
  Simple(): boolean;
  Simple(B: boolean): void;

  Cut(): boolean;
  Cut(B: boolean): void;
  Cut(): boolean;
  Cut(B: boolean): void;

  WithOutL(): boolean;
  WithOutL(B: boolean): void;
  WithOutL(): boolean;
  WithOutL(B: boolean): void;

  Plane(): boolean;
  Plane(B: boolean): void;
  Plane(): boolean;
  Plane(B: boolean): void;

  Cylinder(): boolean;
  Cylinder(B: boolean): void;
  Cylinder(): boolean;
  Cylinder(B: boolean): void;

  Cone(): boolean;
  Cone(B: boolean): void;
  Cone(): boolean;
  Cone(B: boolean): void;

  Sphere(): boolean;
  Sphere(B: boolean): void;
  Sphere(): boolean;
  Sphere(B: boolean): void;

  Torus(): boolean;
  Torus(B: boolean): void;
  Torus(): boolean;
  Torus(B: boolean): void;

  Size(): number;
  Size(S: number): void;
  Size(): number;
  Size(S: number): void;

  Orientation(): TopAbs_Orientation;
  Orientation(O: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;
  Orientation(O: TopAbs_Orientation): void;

  Wires(): HLRAlgo_WiresBlock;

  Tolerance(): number;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_FaceIterator: declare class HLRBRep_FaceIterator

  constructor

  InitEdge(fd: HLRBRep_FaceData): void;

  MoreEdge(): boolean;

  NextEdge(): void;

  BeginningOfWire(): boolean;

  EndOfWire(): boolean;

  SkipWire(): void;

  Wire(): HLRAlgo_EdgesBlock;

  Edge(): number;

  Orientation(): TopAbs_Orientation;

  OutLine(): boolean;

  Internal(): boolean;

  Double(): boolean;

  IsoLine(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_HLRToShape: declare class HLRBRep_HLRToShape

  constructor

  VCompound(): TopoDS_Shape;
  VCompound(S: TopoDS_Shape): TopoDS_Shape;
  VCompound(): TopoDS_Shape;
  VCompound(S: TopoDS_Shape): TopoDS_Shape;

  Rg1LineVCompound(): TopoDS_Shape;
  Rg1LineVCompound(S: TopoDS_Shape): TopoDS_Shape;
  Rg1LineVCompound(): TopoDS_Shape;
  Rg1LineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  RgNLineVCompound(): TopoDS_Shape;
  RgNLineVCompound(S: TopoDS_Shape): TopoDS_Shape;
  RgNLineVCompound(): TopoDS_Shape;
  RgNLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  OutLineVCompound(): TopoDS_Shape;
  OutLineVCompound(S: TopoDS_Shape): TopoDS_Shape;
  OutLineVCompound(): TopoDS_Shape;
  OutLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  OutLineVCompound3d(): TopoDS_Shape;

  IsoLineVCompound(): TopoDS_Shape;
  IsoLineVCompound(S: TopoDS_Shape): TopoDS_Shape;
  IsoLineVCompound(): TopoDS_Shape;
  IsoLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  HCompound(): TopoDS_Shape;
  HCompound(S: TopoDS_Shape): TopoDS_Shape;
  HCompound(): TopoDS_Shape;
  HCompound(S: TopoDS_Shape): TopoDS_Shape;

  Rg1LineHCompound(): TopoDS_Shape;
  Rg1LineHCompound(S: TopoDS_Shape): TopoDS_Shape;
  Rg1LineHCompound(): TopoDS_Shape;
  Rg1LineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  RgNLineHCompound(): TopoDS_Shape;
  RgNLineHCompound(S: TopoDS_Shape): TopoDS_Shape;
  RgNLineHCompound(): TopoDS_Shape;
  RgNLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  OutLineHCompound(): TopoDS_Shape;
  OutLineHCompound(S: TopoDS_Shape): TopoDS_Shape;
  OutLineHCompound(): TopoDS_Shape;
  OutLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  IsoLineHCompound(): TopoDS_Shape;
  IsoLineHCompound(S: TopoDS_Shape): TopoDS_Shape;
  IsoLineHCompound(): TopoDS_Shape;
  IsoLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  CompoundOfEdges(type_: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;
  CompoundOfEdges(S: TopoDS_Shape, type_: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;
  CompoundOfEdges(type_: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;
  CompoundOfEdges(S: TopoDS_Shape, type_: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_Hider: declare class HLRBRep_Hider

  OwnHiding(FI: number): void;

  Hide(FI: number, MST: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher): void;

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_IntConicCurveOfCInter: declare class HLRBRep_IntConicCurveOfCInter extends IntRes2d_Intersection

  constructor

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_InterCSurf: declare class HLRBRep_InterCSurf extends IntCurveSurface_Intersection

  constructor

  delete(): void;

  [Symbol.dispose](): void;

HLRBRep_InternalAlgo: declare class HLRBRep_InternalAlgo extends Standard_Transient

  constructor

  Projector(P: HLRAlgo_Projector): void;
  Projector(): HLRAlgo_Projector;
  Projector(P: HLRAlgo_Projector): void;
  Projector(): HLRAlgo_Projector;

  Update(): void;

  Load(S: HLRTopoBRep_OutLiner, SData: Standard_Transient, nbIso: number): void;
  Load(S: HLRTopoBRep_OutLiner, nbIso: number): void;
  Load(S: HLRTopoBRep_OutLiner, SData: Standard_Transient, nbIso: number): void;
  Load(S: HLRTopoBRep_OutLiner, nbIso: number): void;

  Index(S: HLRTopoBRep_OutLiner): number;

  Remove(I: number): void;

  ShapeData(I: number, SData: Standard_Transient): void;

  SeqOfShapeBounds(): NCollection_Sequence_HLRBRep_ShapeBounds;

  NbShapes(): number;

  ShapeBounds(I: number): HLRBRep_ShapeBounds;

  InitEdgeStatus(): void;

  Select(): void;
  Select(I: number): void;
  Select(): void;
  Select(I: number): void;

  SelectEdge(I: number): void;

  SelectFace(I: number): void;

  ShowAll(): void;
  ShowAll(I: number): void;
  ShowAll(): void;
  ShowAll(I: number): void;

  HideAll(): void;
  HideAll(I: number): void;
  HideAll(): void;
  HideAll(I: number): void;

  PartialHide(): void;

  Hide(): void;
  Hide(I: number): void;
  Hide(I: number, J: number): void;
  Hide(): void;
  Hide(I: number): void;
  Hide(I: number, J: number): void;
  Hide(): void;
  Hide(I: number): void;
  Hide(I: number, J: number): void;

  Debug(deb: boolean): void;
  Debug(): boolean;
  Debug(deb: boolean): void;
  Debug(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
