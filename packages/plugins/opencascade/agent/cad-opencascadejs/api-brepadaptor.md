# libcascade — BRepAdaptor

4 top-level symbols. Signatures are verbatim typescript.

BRepAdaptor_CompCurve: declare class BRepAdaptor_CompCurve extends Adaptor3d_Curve

  // BRepAdaptor_CompCurve.constructor (constructor)
  constructor();
  constructor(W: TopoDS_Wire, KnotByCurvilinearAbcissa?: boolean);
  constructor(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean, First: number, Last: number, Tol: number);

  // BRepAdaptor_CompCurve.get_type_name (method)
  static get_type_name(): string;

  // BRepAdaptor_CompCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepAdaptor_CompCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepAdaptor_CompCurve.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // BRepAdaptor_CompCurve.Initialize (method)
  Initialize(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean): void;
  Initialize(W: TopoDS_Wire, KnotByCurvilinearAbcissa: boolean, First: number, Last: number, Tol: number): void;

  // BRepAdaptor_CompCurve.Wire (method)
  Wire(): TopoDS_Wire;

  // BRepAdaptor_CompCurve.Edge (method)
  Edge(U: number, E: TopoDS_Edge, UonE?: number): { UonE: number };

  // BRepAdaptor_CompCurve.FirstParameter (method)
  FirstParameter(): number;

  // BRepAdaptor_CompCurve.LastParameter (method)
  LastParameter(): number;

  // BRepAdaptor_CompCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // BRepAdaptor_CompCurve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BRepAdaptor_CompCurve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BRepAdaptor_CompCurve.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // BRepAdaptor_CompCurve.IsClosed (method)
  IsClosed(): boolean;

  // BRepAdaptor_CompCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // BRepAdaptor_CompCurve.Period (method)
  Period(): number;

  // BRepAdaptor_CompCurve.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // BRepAdaptor_CompCurve.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // BRepAdaptor_CompCurve.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // BRepAdaptor_CompCurve.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // BRepAdaptor_CompCurve.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // BRepAdaptor_CompCurve.Resolution (method)
  Resolution(R3d: number): number;

  // BRepAdaptor_CompCurve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // BRepAdaptor_CompCurve.Line (method)
  Line(): gp_Lin;

  // BRepAdaptor_CompCurve.Circle (method)
  Circle(): gp_Circ;

  // BRepAdaptor_CompCurve.Ellipse (method)
  Ellipse(): gp_Elips;

  // BRepAdaptor_CompCurve.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // BRepAdaptor_CompCurve.Parabola (method)
  Parabola(): gp_Parab;

  // BRepAdaptor_CompCurve.Degree (method)
  Degree(): number;

  // BRepAdaptor_CompCurve.IsRational (method)
  IsRational(): boolean;

  // BRepAdaptor_CompCurve.NbPoles (method)
  NbPoles(): number;

  // BRepAdaptor_CompCurve.NbKnots (method)
  NbKnots(): number;

  // BRepAdaptor_CompCurve.Bezier (method)
  Bezier(): Geom_BezierCurve;

  // BRepAdaptor_CompCurve.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // BRepAdaptor_CompCurve.delete (method)
  delete(): void;

  // BRepAdaptor_CompCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAdaptor_Curve: declare class BRepAdaptor_Curve extends GeomAdaptor_TransformedCurve

  // BRepAdaptor_Curve.constructor (constructor)
  constructor();
  constructor(E: TopoDS_Edge);
  constructor(E: TopoDS_Edge, F: TopoDS_Face);

  // BRepAdaptor_Curve.get_type_name (method)
  static get_type_name(): string;

  // BRepAdaptor_Curve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepAdaptor_Curve.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepAdaptor_Curve.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // BRepAdaptor_Curve.Reset (method)
  Reset(): void;

  // BRepAdaptor_Curve.Initialize (method)
  Initialize(E: TopoDS_Edge): void;
  Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;

  // BRepAdaptor_Curve.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepAdaptor_Curve.Tolerance (method)
  Tolerance(): number;

  // BRepAdaptor_Curve.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // BRepAdaptor_Curve.delete (method)
  delete(): void;

  // BRepAdaptor_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAdaptor_Curve2d: declare class BRepAdaptor_Curve2d extends Geom2dAdaptor_Curve

  // BRepAdaptor_Curve2d.constructor (constructor)
  constructor();
  constructor(E: TopoDS_Edge, F: TopoDS_Face);

  // BRepAdaptor_Curve2d.get_type_name (method)
  static get_type_name(): string;

  // BRepAdaptor_Curve2d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepAdaptor_Curve2d.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepAdaptor_Curve2d.ShallowCopy (method)
  ShallowCopy(): Adaptor2d_Curve2d;

  // BRepAdaptor_Curve2d.Initialize (method)
  Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;

  // BRepAdaptor_Curve2d.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepAdaptor_Curve2d.Face (method)
  Face(): TopoDS_Face;

  // BRepAdaptor_Curve2d.delete (method)
  delete(): void;

  // BRepAdaptor_Curve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAdaptor_Surface: declare class BRepAdaptor_Surface extends GeomAdaptor_TransformedSurface

  // BRepAdaptor_Surface.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face, R?: boolean);

  // BRepAdaptor_Surface.get_type_name (method)
  static get_type_name(): string;

  // BRepAdaptor_Surface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepAdaptor_Surface.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepAdaptor_Surface.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Surface;

  // BRepAdaptor_Surface.Initialize (method)
  Initialize(F: TopoDS_Face, Restriction?: boolean): void;

  // BRepAdaptor_Surface.Face (method)
  Face(): TopoDS_Face;

  // BRepAdaptor_Surface.Tolerance (method)
  Tolerance(): number;

  // BRepAdaptor_Surface.delete (method)
  delete(): void;

  // BRepAdaptor_Surface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
