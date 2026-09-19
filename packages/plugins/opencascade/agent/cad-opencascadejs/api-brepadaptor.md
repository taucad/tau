# libcascade — BRepAdaptor

4 top-level symbols. Signatures are verbatim typescript.

BRepAdaptor_CompCurve: declare class BRepAdaptor_CompCurve extends Adaptor3d_Curve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Curve;

  Initialize(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean): void;
  Initialize(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean, First: number, Last: number, Tol: number): void;
  Initialize(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean): void;
  Initialize(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean, First: number, Last: number, Tol: number): void;

  Wire(): TopoDS_Wire;

  Edge(U: number, E: TopoDS_Edge, UonE?: number): { UonE: number };

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

BRepAdaptor_Curve: declare class BRepAdaptor_Curve extends GeomAdaptor_TransformedCurve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Curve;

  Reset(): void;

  Initialize(E: TopoDS_Edge): void;
  Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;
  Initialize(E: TopoDS_Edge): void;
  Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;

  Edge(): TopoDS_Edge;

  Tolerance(): number;

  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  delete(): void;

  [Symbol.dispose](): void;

BRepAdaptor_Curve2d: declare class BRepAdaptor_Curve2d extends Geom2dAdaptor_Curve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor2d_Curve2d;

  Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;

  Edge(): TopoDS_Edge;

  Face(): TopoDS_Face;

  delete(): void;

  [Symbol.dispose](): void;

BRepAdaptor_Surface: declare class BRepAdaptor_Surface extends GeomAdaptor_TransformedSurface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Surface;

  Initialize(F: TopoDS_Face, Restriction?: boolean): void;

  Face(): TopoDS_Face;

  Tolerance(): number;

  delete(): void;

  [Symbol.dispose](): void;
