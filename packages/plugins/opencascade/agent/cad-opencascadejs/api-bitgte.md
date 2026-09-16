# libcascade — BiTgte

4 top-level symbols. Signatures are verbatim typescript.

BiTgte_Blend: declare class BiTgte_Blend

  constructor

  Init(S: TopoDS_Shape, Radius: number, Tol: number, NUBS: boolean): void;

  Clear(): void;

  SetFaces(F1: TopoDS_Face, F2: TopoDS_Face): void;

  SetEdge(Edge: TopoDS_Edge): void;

  SetStoppingFace(Face: TopoDS_Face): void;

  Perform(BuildShape?: boolean): void;

  IsDone(): boolean;

  Shape(): TopoDS_Shape;

  NbSurfaces(): number;

  Surface(Index: number): Geom_Surface;
  Surface(CenterLine: TopoDS_Shape): Geom_Surface;
  Surface(Index: number): Geom_Surface;
  Surface(CenterLine: TopoDS_Shape): Geom_Surface;

  Face(Index: number): TopoDS_Face;
  Face(CenterLine: TopoDS_Shape): TopoDS_Face;
  Face(Index: number): TopoDS_Face;
  Face(CenterLine: TopoDS_Shape): TopoDS_Face;

  CenterLines(LC: NCollection_List_TopoDS_Shape): void;

  ContactType(Index: number): BiTgte_ContactType;

  SupportShape1(Index: number): TopoDS_Shape;

  SupportShape2(Index: number): TopoDS_Shape;

  CurveOnShape1(Index: number): Geom_Curve;

  CurveOnShape2(Index: number): Geom_Curve;

  PCurveOnFace1(Index: number): Geom2d_Curve;

  PCurve1OnFillet(Index: number): Geom2d_Curve;

  PCurveOnFace2(Index: number): Geom2d_Curve;

  PCurve2OnFillet(Index: number): Geom2d_Curve;

  NbBranches(): number;

  IndicesOfBranche(Index: number, From?: number, To?: number): { From: number; To: number };

  ComputeCenters(): void;

  delete(): void;

  [Symbol.dispose](): void;

BiTgte_ContactType: typeof BiTgte_ContactType[keyof typeof BiTgte_ContactType]

BiTgte_CurveOnEdge: declare class BiTgte_CurveOnEdge extends Adaptor3d_Curve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Curve;

  Init(EonF: TopoDS_Edge, Edge: TopoDS_Edge): void;

  FirstParameter(): number;

  LastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Period(): number;

  EvalD0(theU: number): gp_Pnt;

  EvalD1(theU: number): Geom_Curve_ResD1;

  EvalD2(theU: number): Geom_Curve_ResD2;

  EvalD3(theU: number): Geom_Curve_ResD3;

  EvalDN(theU: number, theN: number): gp_Vec;

  Resolution(R3d: number): number;

  GetType(): GeomAbs_CurveType;

  Line(): gp_Lin;

  Circle(): gp_Circ;

  Ellipse(): gp_Elips;

  Hyperbola(): gp_Hypr;

  Parabola(): gp_Parab;

  Degree(): number;

  IsRational(): boolean;

  NbPoles(): number;

  NbKnots(): number;

  Bezier(): Geom_BezierCurve;

  BSpline(): Geom_BSplineCurve;

  delete(): void;

  [Symbol.dispose](): void;

BiTgte_CurveOnVertex: declare class BiTgte_CurveOnVertex extends Adaptor3d_Curve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Init(EonF: TopoDS_Edge, V: TopoDS_Vertex): void;

  FirstParameter(): number;

  LastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Period(): number;

  EvalD0(theU: number): gp_Pnt;

  EvalD1(theU: number): Geom_Curve_ResD1;

  EvalD2(theU: number): Geom_Curve_ResD2;

  EvalD3(theU: number): Geom_Curve_ResD3;

  EvalDN(theU: number, theN: number): gp_Vec;

  Resolution(R3d: number): number;

  GetType(): GeomAbs_CurveType;

  Line(): gp_Lin;

  Circle(): gp_Circ;

  Ellipse(): gp_Elips;

  Hyperbola(): gp_Hypr;

  Parabola(): gp_Parab;

  Degree(): number;

  IsRational(): boolean;

  NbPoles(): number;

  NbKnots(): number;

  Bezier(): Geom_BezierCurve;

  BSpline(): Geom_BSplineCurve;

  delete(): void;

  [Symbol.dispose](): void;
