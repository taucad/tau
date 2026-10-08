# libcascade — BiTgte

4 top-level symbols. Signatures are verbatim typescript.

BiTgte_Blend: declare class BiTgte_Blend

  // BiTgte_Blend.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, Radius: number, Tol: number, NUBS: boolean);

  // BiTgte_Blend.Init (method)
  Init(S: TopoDS_Shape, Radius: number, Tol: number, NUBS: boolean): void;

  // BiTgte_Blend.Clear (method)
  Clear(): void;

  // BiTgte_Blend.SetFaces (method)
  SetFaces(F1: TopoDS_Face, F2: TopoDS_Face): void;

  // BiTgte_Blend.SetEdge (method)
  SetEdge(Edge: TopoDS_Edge): void;

  // BiTgte_Blend.SetStoppingFace (method)
  SetStoppingFace(Face: TopoDS_Face): void;

  // BiTgte_Blend.Perform (method)
  Perform(BuildShape?: boolean): void;

  // BiTgte_Blend.IsDone (method)
  IsDone(): boolean;

  // BiTgte_Blend.Shape (method)
  Shape(): TopoDS_Shape;

  // BiTgte_Blend.NbSurfaces (method)
  NbSurfaces(): number;

  // BiTgte_Blend.Surface (method)
  Surface(Index: number): Geom_Surface;
  Surface(CenterLine: TopoDS_Shape): Geom_Surface;

  // BiTgte_Blend.Face (method)
  Face(Index: number): TopoDS_Face;
  Face(CenterLine: TopoDS_Shape): TopoDS_Face;

  // BiTgte_Blend.CenterLines (method)
  CenterLines(LC: NCollection_List_TopoDS_Shape): void;

  // BiTgte_Blend.ContactType (method)
  ContactType(Index: number): BiTgte_ContactType;

  // BiTgte_Blend.SupportShape1 (method)
  SupportShape1(Index: number): TopoDS_Shape;

  // BiTgte_Blend.SupportShape2 (method)
  SupportShape2(Index: number): TopoDS_Shape;

  // BiTgte_Blend.CurveOnShape1 (method)
  CurveOnShape1(Index: number): Geom_Curve;

  // BiTgte_Blend.CurveOnShape2 (method)
  CurveOnShape2(Index: number): Geom_Curve;

  // BiTgte_Blend.PCurveOnFace1 (method)
  PCurveOnFace1(Index: number): Geom2d_Curve;

  // BiTgte_Blend.PCurve1OnFillet (method)
  PCurve1OnFillet(Index: number): Geom2d_Curve;

  // BiTgte_Blend.PCurveOnFace2 (method)
  PCurveOnFace2(Index: number): Geom2d_Curve;

  // BiTgte_Blend.PCurve2OnFillet (method)
  PCurve2OnFillet(Index: number): Geom2d_Curve;

  // BiTgte_Blend.NbBranches (method)
  NbBranches(): number;

  // BiTgte_Blend.IndicesOfBranche (method)
  IndicesOfBranche(Index: number, From?: number, To?: number): { From: number; To: number };

  // BiTgte_Blend.ComputeCenters (method)
  ComputeCenters(): void;

  // BiTgte_Blend.delete (method)
  delete(): void;

  // BiTgte_Blend.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BiTgte_ContactType: typeof BiTgte_ContactType[keyof typeof BiTgte_ContactType]

  readonly BiTgte_FaceFace: 'BiTgte_FaceFace'

  readonly BiTgte_FaceEdge: 'BiTgte_FaceEdge'

  readonly BiTgte_FaceVertex: 'BiTgte_FaceVertex'

  readonly BiTgte_EdgeEdge: 'BiTgte_EdgeEdge'

  readonly BiTgte_EdgeVertex: 'BiTgte_EdgeVertex'

  readonly BiTgte_VertexVertex: 'BiTgte_VertexVertex'

BiTgte_CurveOnEdge: declare class BiTgte_CurveOnEdge extends Adaptor3d_Curve

  // BiTgte_CurveOnEdge.constructor (constructor)
  constructor();
  constructor(EonF: TopoDS_Edge, Edge: TopoDS_Edge);

  // BiTgte_CurveOnEdge.get_type_name (method)
  static get_type_name(): string;

  // BiTgte_CurveOnEdge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BiTgte_CurveOnEdge.DynamicType (method)
  DynamicType(): Standard_Type;

  // BiTgte_CurveOnEdge.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // BiTgte_CurveOnEdge.Init (method)
  Init(EonF: TopoDS_Edge, Edge: TopoDS_Edge): void;

  // BiTgte_CurveOnEdge.FirstParameter (method)
  FirstParameter(): number;

  // BiTgte_CurveOnEdge.LastParameter (method)
  LastParameter(): number;

  // BiTgte_CurveOnEdge.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // BiTgte_CurveOnEdge.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BiTgte_CurveOnEdge.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BiTgte_CurveOnEdge.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // BiTgte_CurveOnEdge.IsClosed (method)
  IsClosed(): boolean;

  // BiTgte_CurveOnEdge.IsPeriodic (method)
  IsPeriodic(): boolean;

  // BiTgte_CurveOnEdge.Period (method)
  Period(): number;

  // BiTgte_CurveOnEdge.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // BiTgte_CurveOnEdge.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // BiTgte_CurveOnEdge.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // BiTgte_CurveOnEdge.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // BiTgte_CurveOnEdge.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // BiTgte_CurveOnEdge.Resolution (method)
  Resolution(R3d: number): number;

  // BiTgte_CurveOnEdge.GetType (method)
  GetType(): GeomAbs_CurveType;

  // BiTgte_CurveOnEdge.Line (method)
  Line(): gp_Lin;

  // BiTgte_CurveOnEdge.Circle (method)
  Circle(): gp_Circ;

  // BiTgte_CurveOnEdge.Ellipse (method)
  Ellipse(): gp_Elips;

  // BiTgte_CurveOnEdge.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // BiTgte_CurveOnEdge.Parabola (method)
  Parabola(): gp_Parab;

  // BiTgte_CurveOnEdge.Degree (method)
  Degree(): number;

  // BiTgte_CurveOnEdge.IsRational (method)
  IsRational(): boolean;

  // BiTgte_CurveOnEdge.NbPoles (method)
  NbPoles(): number;

  // BiTgte_CurveOnEdge.NbKnots (method)
  NbKnots(): number;

  // BiTgte_CurveOnEdge.Bezier (method)
  Bezier(): Geom_BezierCurve;

  // BiTgte_CurveOnEdge.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // BiTgte_CurveOnEdge.delete (method)
  delete(): void;

  // BiTgte_CurveOnEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BiTgte_CurveOnVertex: declare class BiTgte_CurveOnVertex extends Adaptor3d_Curve

  // BiTgte_CurveOnVertex.constructor (constructor)
  constructor();
  constructor(EonF: TopoDS_Edge, V: TopoDS_Vertex);

  // BiTgte_CurveOnVertex.get_type_name (method)
  static get_type_name(): string;

  // BiTgte_CurveOnVertex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BiTgte_CurveOnVertex.DynamicType (method)
  DynamicType(): Standard_Type;

  // BiTgte_CurveOnVertex.Init (method)
  Init(EonF: TopoDS_Edge, V: TopoDS_Vertex): void;

  // BiTgte_CurveOnVertex.FirstParameter (method)
  FirstParameter(): number;

  // BiTgte_CurveOnVertex.LastParameter (method)
  LastParameter(): number;

  // BiTgte_CurveOnVertex.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // BiTgte_CurveOnVertex.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BiTgte_CurveOnVertex.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BiTgte_CurveOnVertex.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // BiTgte_CurveOnVertex.IsClosed (method)
  IsClosed(): boolean;

  // BiTgte_CurveOnVertex.IsPeriodic (method)
  IsPeriodic(): boolean;

  // BiTgte_CurveOnVertex.Period (method)
  Period(): number;

  // BiTgte_CurveOnVertex.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // BiTgte_CurveOnVertex.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // BiTgte_CurveOnVertex.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // BiTgte_CurveOnVertex.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // BiTgte_CurveOnVertex.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // BiTgte_CurveOnVertex.Resolution (method)
  Resolution(R3d: number): number;

  // BiTgte_CurveOnVertex.GetType (method)
  GetType(): GeomAbs_CurveType;

  // BiTgte_CurveOnVertex.Line (method)
  Line(): gp_Lin;

  // BiTgte_CurveOnVertex.Circle (method)
  Circle(): gp_Circ;

  // BiTgte_CurveOnVertex.Ellipse (method)
  Ellipse(): gp_Elips;

  // BiTgte_CurveOnVertex.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // BiTgte_CurveOnVertex.Parabola (method)
  Parabola(): gp_Parab;

  // BiTgte_CurveOnVertex.Degree (method)
  Degree(): number;

  // BiTgte_CurveOnVertex.IsRational (method)
  IsRational(): boolean;

  // BiTgte_CurveOnVertex.NbPoles (method)
  NbPoles(): number;

  // BiTgte_CurveOnVertex.NbKnots (method)
  NbKnots(): number;

  // BiTgte_CurveOnVertex.Bezier (method)
  Bezier(): Geom_BezierCurve;

  // BiTgte_CurveOnVertex.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // BiTgte_CurveOnVertex.delete (method)
  delete(): void;

  // BiTgte_CurveOnVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
