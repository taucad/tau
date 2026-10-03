# libcascade — ShapeAlgo

3 top-level symbols. Signatures are verbatim typescript.

ShapeAlgo: declare class ShapeAlgo

  // ShapeAlgo.constructor (constructor)
  constructor();

  // ShapeAlgo.Init (method)
  static Init(): void;

  // ShapeAlgo.SetAlgoContainer (method)
  static SetAlgoContainer(aContainer: ShapeAlgo_AlgoContainer): void;

  // ShapeAlgo.AlgoContainer (method)
  static AlgoContainer(): ShapeAlgo_AlgoContainer;

  // ShapeAlgo.delete (method)
  delete(): void;

  // ShapeAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAlgo_AlgoContainer: declare class ShapeAlgo_AlgoContainer extends Standard_Transient

  // ShapeAlgo_AlgoContainer.constructor (constructor)
  constructor();

  // ShapeAlgo_AlgoContainer.SetToolContainer (method)
  SetToolContainer(TC: ShapeAlgo_ToolContainer): void;

  // ShapeAlgo_AlgoContainer.ToolContainer (method)
  ToolContainer(): ShapeAlgo_ToolContainer;

  // ShapeAlgo_AlgoContainer.ConnectNextWire (method)
  ConnectNextWire(saw: ShapeAnalysis_Wire, nextsewd: ShapeExtend_WireData, maxtol: number, distmin: number, revsewd: boolean, revnextsewd: boolean): { returnValue: boolean; distmin: number; revsewd: boolean; revnextsewd: boolean };

  // ShapeAlgo_AlgoContainer.ApproxBSplineCurve (method)
  ApproxBSplineCurve(bspline: Geom_BSplineCurve, seq: NCollection_Sequence_handle_Geom_Curve): void;
  ApproxBSplineCurve(bspline: Geom2d_BSplineCurve, seq: NCollection_Sequence_handle_Geom2d_Curve): void;

  // ShapeAlgo_AlgoContainer.C0BSplineToSequenceOfC1BSplineCurve (method)
  C0BSplineToSequenceOfC1BSplineCurve(BS: Geom_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom_BoundedCurve; [Symbol.dispose](): void };
  C0BSplineToSequenceOfC1BSplineCurve(BS: Geom2d_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom2d_BoundedCurve; [Symbol.dispose](): void };

  // ShapeAlgo_AlgoContainer.C0ShapeToC1Shape (method)
  C0ShapeToC1Shape(shape: TopoDS_Shape, tol: number): TopoDS_Shape;

  // ShapeAlgo_AlgoContainer.ConvertSurfaceToBSpline (method)
  ConvertSurfaceToBSpline(surf: Geom_Surface, UF: number, UL: number, VF: number, VL: number): Geom_BSplineSurface;

  // ShapeAlgo_AlgoContainer.HomoWires (method)
  HomoWires(wireIn1: TopoDS_Wire, wireIn2: TopoDS_Wire, wireOut1: TopoDS_Wire, wireOut2: TopoDS_Wire, byParam: boolean): boolean;

  // ShapeAlgo_AlgoContainer.OuterWire (method)
  OuterWire(face: TopoDS_Face): TopoDS_Wire;

  // ShapeAlgo_AlgoContainer.ConvertToPeriodic (method)
  ConvertToPeriodic(surf: Geom_Surface): Geom_Surface;

  // ShapeAlgo_AlgoContainer.GetFaceUVBounds (method)
  GetFaceUVBounds(F: TopoDS_Face, Umin: number, Umax: number, Vmin: number, Vmax: number): { Umin: number; Umax: number; Vmin: number; Vmax: number };

  // ShapeAlgo_AlgoContainer.ConvertCurveToBSpline (method)
  ConvertCurveToBSpline(C3D: Geom_Curve, First: number, Last: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineCurve;

  // ShapeAlgo_AlgoContainer.get_type_name (method)
  static get_type_name(): string;

  // ShapeAlgo_AlgoContainer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeAlgo_AlgoContainer.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeAlgo_AlgoContainer.delete (method)
  delete(): void;

  // ShapeAlgo_AlgoContainer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAlgo_ToolContainer: declare class ShapeAlgo_ToolContainer extends Standard_Transient

  // ShapeAlgo_ToolContainer.constructor (constructor)
  constructor();

  // ShapeAlgo_ToolContainer.FixShape (method)
  FixShape(): ShapeFix_Shape;

  // ShapeAlgo_ToolContainer.EdgeProjAux (method)
  EdgeProjAux(): ShapeFix_EdgeProjAux;

  // ShapeAlgo_ToolContainer.get_type_name (method)
  static get_type_name(): string;

  // ShapeAlgo_ToolContainer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeAlgo_ToolContainer.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeAlgo_ToolContainer.delete (method)
  delete(): void;

  // ShapeAlgo_ToolContainer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
