# libcascade — IntCurvesFace

2 top-level symbols. Signatures are verbatim typescript.

IntCurvesFace_Intersector: declare class IntCurvesFace_Intersector extends Standard_Transient

  // IntCurvesFace_Intersector.constructor (constructor)
  constructor(F: TopoDS_Face, aTol: number, aRestr?: boolean, UseBToler?: boolean);

  // IntCurvesFace_Intersector.get_type_name (method)
  static get_type_name(): string;

  // IntCurvesFace_Intersector.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IntCurvesFace_Intersector.DynamicType (method)
  DynamicType(): Standard_Type;

  // IntCurvesFace_Intersector.Perform (method)
  Perform(L: gp_Lin, PInf: number, PSup: number): void;
  Perform(HCu: Adaptor3d_Curve, PInf: number, PSup: number): void;

  // IntCurvesFace_Intersector.SurfaceType (method)
  SurfaceType(): GeomAbs_SurfaceType;

  // IntCurvesFace_Intersector.IsDone (method)
  IsDone(): boolean;

  // IntCurvesFace_Intersector.NbPnt (method)
  NbPnt(): number;

  // IntCurvesFace_Intersector.UParameter (method)
  UParameter(I: number): number;

  // IntCurvesFace_Intersector.VParameter (method)
  VParameter(I: number): number;

  // IntCurvesFace_Intersector.WParameter (method)
  WParameter(I: number): number;

  // IntCurvesFace_Intersector.Pnt (method)
  Pnt(I: number): gp_Pnt;

  // IntCurvesFace_Intersector.Transition (method)
  Transition(I: number): IntCurveSurface_TransitionOnCurve;

  // IntCurvesFace_Intersector.State (method)
  State(I: number): TopAbs_State;

  // IntCurvesFace_Intersector.IsParallel (method)
  IsParallel(): boolean;

  // IntCurvesFace_Intersector.Face (method)
  Face(): TopoDS_Face;

  // IntCurvesFace_Intersector.ClassifyUVPoint (method)
  ClassifyUVPoint(Puv: gp_Pnt2d): TopAbs_State;

  // IntCurvesFace_Intersector.Bounding (method)
  Bounding(): Bnd_Box;

  // IntCurvesFace_Intersector.SetUseBoundToler (method)
  SetUseBoundToler(UseBToler: boolean): void;

  // IntCurvesFace_Intersector.GetUseBoundToler (method)
  GetUseBoundToler(): boolean;

  // IntCurvesFace_Intersector.delete (method)
  delete(): void;

  // IntCurvesFace_Intersector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntCurvesFace_ShapeIntersector: declare class IntCurvesFace_ShapeIntersector

  // IntCurvesFace_ShapeIntersector.constructor (constructor)
  constructor();

  // IntCurvesFace_ShapeIntersector.Load (method)
  Load(Sh: TopoDS_Shape, Tol: number): void;

  // IntCurvesFace_ShapeIntersector.Perform (method)
  Perform(L: gp_Lin, PInf: number, PSup: number): void;
  Perform(HCu: Adaptor3d_Curve, PInf: number, PSup: number): void;

  // IntCurvesFace_ShapeIntersector.PerformNearest (method)
  PerformNearest(L: gp_Lin, PInf: number, PSup: number): void;

  // IntCurvesFace_ShapeIntersector.IsDone (method)
  IsDone(): boolean;

  // IntCurvesFace_ShapeIntersector.NbPnt (method)
  NbPnt(): number;

  // IntCurvesFace_ShapeIntersector.UParameter (method)
  UParameter(I: number): number;

  // IntCurvesFace_ShapeIntersector.VParameter (method)
  VParameter(I: number): number;

  // IntCurvesFace_ShapeIntersector.WParameter (method)
  WParameter(I: number): number;

  // IntCurvesFace_ShapeIntersector.Pnt (method)
  Pnt(I: number): gp_Pnt;

  // IntCurvesFace_ShapeIntersector.Transition (method)
  Transition(I: number): IntCurveSurface_TransitionOnCurve;

  // IntCurvesFace_ShapeIntersector.State (method)
  State(I: number): TopAbs_State;

  // IntCurvesFace_ShapeIntersector.Face (method)
  Face(I: number): TopoDS_Face;

  // IntCurvesFace_ShapeIntersector.SortResult (method)
  SortResult(): void;

  // IntCurvesFace_ShapeIntersector.delete (method)
  delete(): void;

  // IntCurvesFace_ShapeIntersector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
