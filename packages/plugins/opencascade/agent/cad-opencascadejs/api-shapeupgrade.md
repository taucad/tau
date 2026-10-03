# libcascade — ShapeUpgrade

33 top-level symbols. Signatures are verbatim typescript.

ShapeUpgrade: declare class ShapeUpgrade

  // ShapeUpgrade.constructor (constructor)
  constructor();

  // ShapeUpgrade.C0BSplineToSequenceOfC1BSplineCurve (method)
  static C0BSplineToSequenceOfC1BSplineCurve(BS: Geom_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom_BoundedCurve; [Symbol.dispose](): void };
  static C0BSplineToSequenceOfC1BSplineCurve(BS: Geom2d_BSplineCurve): { returnValue: boolean; seqBS: NCollection_HSequence_handle_Geom2d_BoundedCurve; [Symbol.dispose](): void };

  // ShapeUpgrade.delete (method)
  delete(): void;

  // ShapeUpgrade.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ClosedEdgeDivide: declare class ShapeUpgrade_ClosedEdgeDivide extends ShapeUpgrade_EdgeDivide

  // ShapeUpgrade_ClosedEdgeDivide.constructor (constructor)
  constructor();

  // ShapeUpgrade_ClosedEdgeDivide.Compute (method)
  Compute(E: TopoDS_Edge): boolean;

  // ShapeUpgrade_ClosedEdgeDivide.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_ClosedEdgeDivide.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_ClosedEdgeDivide.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_ClosedEdgeDivide.delete (method)
  delete(): void;

  // ShapeUpgrade_ClosedEdgeDivide.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ClosedFaceDivide: declare class ShapeUpgrade_ClosedFaceDivide extends ShapeUpgrade_FaceDivide

  // ShapeUpgrade_ClosedFaceDivide.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face);

  // ShapeUpgrade_ClosedFaceDivide.SplitSurface (method)
  SplitSurface(theArea?: number): boolean;

  // ShapeUpgrade_ClosedFaceDivide.SetNbSplitPoints (method)
  SetNbSplitPoints(num: number): void;

  // ShapeUpgrade_ClosedFaceDivide.GetNbSplitPoints (method)
  GetNbSplitPoints(): number;

  // ShapeUpgrade_ClosedFaceDivide.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_ClosedFaceDivide.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_ClosedFaceDivide.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_ClosedFaceDivide.delete (method)
  delete(): void;

  // ShapeUpgrade_ClosedFaceDivide.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ConvertCurve2dToBezier: declare class ShapeUpgrade_ConvertCurve2dToBezier extends ShapeUpgrade_SplitCurve2d

  // ShapeUpgrade_ConvertCurve2dToBezier.constructor (constructor)
  constructor();

  // ShapeUpgrade_ConvertCurve2dToBezier.Compute (method)
  Compute(): void;

  // ShapeUpgrade_ConvertCurve2dToBezier.Build (method)
  Build(Segment: boolean): void;

  // ShapeUpgrade_ConvertCurve2dToBezier.SplitParams (method)
  SplitParams(): NCollection_HSequence_double;

  // ShapeUpgrade_ConvertCurve2dToBezier.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_ConvertCurve2dToBezier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_ConvertCurve2dToBezier.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_ConvertCurve2dToBezier.delete (method)
  delete(): void;

  // ShapeUpgrade_ConvertCurve2dToBezier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ConvertCurve3dToBezier: declare class ShapeUpgrade_ConvertCurve3dToBezier extends ShapeUpgrade_SplitCurve3d

  // ShapeUpgrade_ConvertCurve3dToBezier.constructor (constructor)
  constructor();

  // ShapeUpgrade_ConvertCurve3dToBezier.SetLineMode (method)
  SetLineMode(mode: boolean): void;

  // ShapeUpgrade_ConvertCurve3dToBezier.GetLineMode (method)
  GetLineMode(): boolean;

  // ShapeUpgrade_ConvertCurve3dToBezier.SetCircleMode (method)
  SetCircleMode(mode: boolean): void;

  // ShapeUpgrade_ConvertCurve3dToBezier.GetCircleMode (method)
  GetCircleMode(): boolean;

  // ShapeUpgrade_ConvertCurve3dToBezier.SetConicMode (method)
  SetConicMode(mode: boolean): void;

  // ShapeUpgrade_ConvertCurve3dToBezier.GetConicMode (method)
  GetConicMode(): boolean;

  // ShapeUpgrade_ConvertCurve3dToBezier.Compute (method)
  Compute(): void;

  // ShapeUpgrade_ConvertCurve3dToBezier.Build (method)
  Build(Segment: boolean): void;

  // ShapeUpgrade_ConvertCurve3dToBezier.SplitParams (method)
  SplitParams(): NCollection_HSequence_double;

  // ShapeUpgrade_ConvertCurve3dToBezier.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_ConvertCurve3dToBezier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_ConvertCurve3dToBezier.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_ConvertCurve3dToBezier.delete (method)
  delete(): void;

  // ShapeUpgrade_ConvertCurve3dToBezier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ConvertSurfaceToBezierBasis: declare class ShapeUpgrade_ConvertSurfaceToBezierBasis extends ShapeUpgrade_SplitSurface

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.constructor (constructor)
  constructor();

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.Build (method)
  Build(Segment: boolean): void;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.Compute (method)
  Compute(Segment: boolean): void;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.Segments (method)
  Segments(): ShapeExtend_CompositeSurface;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.SetPlaneMode (method)
  SetPlaneMode(mode: boolean): void;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.GetPlaneMode (method)
  GetPlaneMode(): boolean;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.SetRevolutionMode (method)
  SetRevolutionMode(mode: boolean): void;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.GetRevolutionMode (method)
  GetRevolutionMode(): boolean;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.SetExtrusionMode (method)
  SetExtrusionMode(mode: boolean): void;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.GetExtrusionMode (method)
  GetExtrusionMode(): boolean;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.SetBSplineMode (method)
  SetBSplineMode(mode: boolean): void;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.GetBSplineMode (method)
  GetBSplineMode(): boolean;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.delete (method)
  delete(): void;

  // ShapeUpgrade_ConvertSurfaceToBezierBasis.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_EdgeDivide: declare class ShapeUpgrade_EdgeDivide extends ShapeUpgrade_Tool

  // ShapeUpgrade_EdgeDivide.constructor (constructor)
  constructor();

  // ShapeUpgrade_EdgeDivide.Clear (method)
  Clear(): void;

  // ShapeUpgrade_EdgeDivide.SetFace (method)
  SetFace(F: TopoDS_Face): void;

  // ShapeUpgrade_EdgeDivide.Compute (method)
  Compute(E: TopoDS_Edge): boolean;

  // ShapeUpgrade_EdgeDivide.HasCurve2d (method)
  HasCurve2d(): boolean;

  // ShapeUpgrade_EdgeDivide.HasCurve3d (method)
  HasCurve3d(): boolean;

  // ShapeUpgrade_EdgeDivide.Knots2d (method)
  Knots2d(): NCollection_HSequence_double;

  // ShapeUpgrade_EdgeDivide.Knots3d (method)
  Knots3d(): NCollection_HSequence_double;

  // ShapeUpgrade_EdgeDivide.SetSplitCurve2dTool (method)
  SetSplitCurve2dTool(splitCurve2dTool: ShapeUpgrade_SplitCurve2d): void;

  // ShapeUpgrade_EdgeDivide.SetSplitCurve3dTool (method)
  SetSplitCurve3dTool(splitCurve3dTool: ShapeUpgrade_SplitCurve3d): void;

  // ShapeUpgrade_EdgeDivide.GetSplitCurve2dTool (method)
  GetSplitCurve2dTool(): ShapeUpgrade_SplitCurve2d;

  // ShapeUpgrade_EdgeDivide.GetSplitCurve3dTool (method)
  GetSplitCurve3dTool(): ShapeUpgrade_SplitCurve3d;

  // ShapeUpgrade_EdgeDivide.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_EdgeDivide.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_EdgeDivide.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_EdgeDivide.delete (method)
  delete(): void;

  // ShapeUpgrade_EdgeDivide.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_FaceDivide: declare class ShapeUpgrade_FaceDivide extends ShapeUpgrade_Tool

  // ShapeUpgrade_FaceDivide.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face);

  // ShapeUpgrade_FaceDivide.Init (method)
  Init(F: TopoDS_Face): void;

  // ShapeUpgrade_FaceDivide.SetSurfaceSegmentMode (method)
  SetSurfaceSegmentMode(Segment: boolean): void;

  // ShapeUpgrade_FaceDivide.Perform (method)
  Perform(theArea?: number): boolean;

  // ShapeUpgrade_FaceDivide.SplitSurface (method)
  SplitSurface(theArea?: number): boolean;

  // ShapeUpgrade_FaceDivide.SplitCurves (method)
  SplitCurves(): boolean;

  // ShapeUpgrade_FaceDivide.Result (method)
  Result(): TopoDS_Shape;

  // ShapeUpgrade_FaceDivide.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeUpgrade_FaceDivide.SetSplitSurfaceTool (method)
  SetSplitSurfaceTool(splitSurfaceTool: ShapeUpgrade_SplitSurface): void;

  // ShapeUpgrade_FaceDivide.SetWireDivideTool (method)
  SetWireDivideTool(wireDivideTool: ShapeUpgrade_WireDivide): void;

  // ShapeUpgrade_FaceDivide.GetSplitSurfaceTool (method)
  GetSplitSurfaceTool(): ShapeUpgrade_SplitSurface;

  // ShapeUpgrade_FaceDivide.GetWireDivideTool (method)
  GetWireDivideTool(): ShapeUpgrade_WireDivide;

  // ShapeUpgrade_FaceDivide.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_FaceDivide.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_FaceDivide.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_FaceDivide.delete (method)
  delete(): void;

  // ShapeUpgrade_FaceDivide.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_FaceDivideArea: declare class ShapeUpgrade_FaceDivideArea extends ShapeUpgrade_FaceDivide

  // ShapeUpgrade_FaceDivideArea.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face);

  // ShapeUpgrade_FaceDivideArea.Perform (method)
  Perform(theArea?: number): boolean;

  // ShapeUpgrade_FaceDivideArea.MaxArea (method)
  MaxArea(): number;

  // ShapeUpgrade_FaceDivideArea.NbParts (method)
  NbParts(): number;

  // ShapeUpgrade_FaceDivideArea.SetNumbersUVSplits (method)
  SetNumbersUVSplits(theNbUsplits: number, theNbVsplits: number): void;

  // ShapeUpgrade_FaceDivideArea.SetSplittingByNumber (method)
  SetSplittingByNumber(theIsSplittingByNumber: boolean): void;

  // ShapeUpgrade_FaceDivideArea.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_FaceDivideArea.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_FaceDivideArea.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_FaceDivideArea.delete (method)
  delete(): void;

  // ShapeUpgrade_FaceDivideArea.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_FixSmallBezierCurves: declare class ShapeUpgrade_FixSmallBezierCurves extends ShapeUpgrade_FixSmallCurves

  // ShapeUpgrade_FixSmallBezierCurves.constructor (constructor)
  constructor();

  // ShapeUpgrade_FixSmallBezierCurves.Approx (method)
  Approx(First: number, Last: number): { returnValue: boolean; Curve3d: Geom_Curve; Curve2d: Geom2d_Curve; Curve2dR: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };

  // ShapeUpgrade_FixSmallBezierCurves.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_FixSmallBezierCurves.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_FixSmallBezierCurves.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_FixSmallBezierCurves.delete (method)
  delete(): void;

  // ShapeUpgrade_FixSmallBezierCurves.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_FixSmallCurves: declare class ShapeUpgrade_FixSmallCurves extends ShapeUpgrade_Tool

  // ShapeUpgrade_FixSmallCurves.constructor (constructor)
  constructor();

  // ShapeUpgrade_FixSmallCurves.Init (method)
  Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;

  // ShapeUpgrade_FixSmallCurves.Approx (method)
  Approx(First: number, Last: number): { returnValue: boolean; Curve3d: Geom_Curve; Curve2d: Geom2d_Curve; Curve2dR: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };

  // ShapeUpgrade_FixSmallCurves.SetSplitCurve3dTool (method)
  SetSplitCurve3dTool(splitCurve3dTool: ShapeUpgrade_SplitCurve3d): void;

  // ShapeUpgrade_FixSmallCurves.SetSplitCurve2dTool (method)
  SetSplitCurve2dTool(splitCurve2dTool: ShapeUpgrade_SplitCurve2d): void;

  // ShapeUpgrade_FixSmallCurves.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeUpgrade_FixSmallCurves.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_FixSmallCurves.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_FixSmallCurves.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_FixSmallCurves.delete (method)
  delete(): void;

  // ShapeUpgrade_FixSmallCurves.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_RemoveInternalWires: declare class ShapeUpgrade_RemoveInternalWires extends ShapeUpgrade_Tool

  // ShapeUpgrade_RemoveInternalWires.constructor (constructor)
  constructor();
  constructor(theShape: TopoDS_Shape);

  // ShapeUpgrade_RemoveInternalWires.Init (method)
  Init(theShape: TopoDS_Shape): void;

  // ShapeUpgrade_RemoveInternalWires.Perform (method)
  Perform(): boolean;
  Perform(theSeqShapes: NCollection_Sequence_TopoDS_Shape): boolean;

  // ShapeUpgrade_RemoveInternalWires.GetResult (method)
  GetResult(): TopoDS_Shape;

  // ShapeUpgrade_RemoveInternalWires.MinArea (method)
  MinArea(): number;

  // ShapeUpgrade_RemoveInternalWires.RemoveFaceMode (method)
  RemoveFaceMode(): boolean;

  // ShapeUpgrade_RemoveInternalWires.RemovedFaces (method)
  RemovedFaces(): NCollection_Sequence_TopoDS_Shape;

  // ShapeUpgrade_RemoveInternalWires.RemovedWires (method)
  RemovedWires(): NCollection_Sequence_TopoDS_Shape;

  // ShapeUpgrade_RemoveInternalWires.Status (method)
  Status(theStatus: ShapeExtend_Status): boolean;

  // ShapeUpgrade_RemoveInternalWires.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_RemoveInternalWires.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_RemoveInternalWires.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_RemoveInternalWires.delete (method)
  delete(): void;

  // ShapeUpgrade_RemoveInternalWires.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_RemoveLocations: declare class ShapeUpgrade_RemoveLocations extends Standard_Transient

  // ShapeUpgrade_RemoveLocations.constructor (constructor)
  constructor();

  // ShapeUpgrade_RemoveLocations.Remove (method)
  Remove(theShape: TopoDS_Shape): boolean;

  // ShapeUpgrade_RemoveLocations.GetResult (method)
  GetResult(): TopoDS_Shape;

  // ShapeUpgrade_RemoveLocations.SetRemoveLevel (method)
  SetRemoveLevel(theLevel: TopAbs_ShapeEnum): void;

  // ShapeUpgrade_RemoveLocations.RemoveLevel (method)
  RemoveLevel(): TopAbs_ShapeEnum;

  // ShapeUpgrade_RemoveLocations.ModifiedShape (method)
  ModifiedShape(theInitShape: TopoDS_Shape): TopoDS_Shape;

  // ShapeUpgrade_RemoveLocations.GetModifiedShapesMap (method)
  GetModifiedShapesMap(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

  // ShapeUpgrade_RemoveLocations.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_RemoveLocations.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_RemoveLocations.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_RemoveLocations.delete (method)
  delete(): void;

  // ShapeUpgrade_RemoveLocations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ShapeConvertToBezier: declare class ShapeUpgrade_ShapeConvertToBezier extends ShapeUpgrade_ShapeDivide

  // ShapeUpgrade_ShapeConvertToBezier.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // ShapeUpgrade_ShapeConvertToBezier.Set2dConversion (method)
  Set2dConversion(mode: boolean): void;

  // ShapeUpgrade_ShapeConvertToBezier.Get2dConversion (method)
  Get2dConversion(): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.Set3dConversion (method)
  Set3dConversion(mode: boolean): void;

  // ShapeUpgrade_ShapeConvertToBezier.Get3dConversion (method)
  Get3dConversion(): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.SetSurfaceConversion (method)
  SetSurfaceConversion(mode: boolean): void;

  // ShapeUpgrade_ShapeConvertToBezier.GetSurfaceConversion (method)
  GetSurfaceConversion(): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.Set3dLineConversion (method)
  Set3dLineConversion(mode: boolean): void;

  // ShapeUpgrade_ShapeConvertToBezier.Get3dLineConversion (method)
  Get3dLineConversion(): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.Set3dCircleConversion (method)
  Set3dCircleConversion(mode: boolean): void;

  // ShapeUpgrade_ShapeConvertToBezier.Get3dCircleConversion (method)
  Get3dCircleConversion(): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.Set3dConicConversion (method)
  Set3dConicConversion(mode: boolean): void;

  // ShapeUpgrade_ShapeConvertToBezier.Get3dConicConversion (method)
  Get3dConicConversion(): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.SetPlaneMode (method)
  SetPlaneMode(mode: boolean): void;

  // ShapeUpgrade_ShapeConvertToBezier.GetPlaneMode (method)
  GetPlaneMode(): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.SetRevolutionMode (method)
  SetRevolutionMode(mode: boolean): void;

  // ShapeUpgrade_ShapeConvertToBezier.GetRevolutionMode (method)
  GetRevolutionMode(): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.SetExtrusionMode (method)
  SetExtrusionMode(mode: boolean): void;

  // ShapeUpgrade_ShapeConvertToBezier.GetExtrusionMode (method)
  GetExtrusionMode(): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.SetBSplineMode (method)
  SetBSplineMode(mode: boolean): void;

  // ShapeUpgrade_ShapeConvertToBezier.GetBSplineMode (method)
  GetBSplineMode(): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.Perform (method)
  Perform(newContext?: boolean): boolean;

  // ShapeUpgrade_ShapeConvertToBezier.delete (method)
  delete(): void;

  // ShapeUpgrade_ShapeConvertToBezier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ShapeDivide: declare class ShapeUpgrade_ShapeDivide

  // ShapeUpgrade_ShapeDivide.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // ShapeUpgrade_ShapeDivide.Init (method)
  Init(S: TopoDS_Shape): void;

  // ShapeUpgrade_ShapeDivide.SetPrecision (method)
  SetPrecision(Prec: number): void;

  // ShapeUpgrade_ShapeDivide.SetMaxTolerance (method)
  SetMaxTolerance(maxtol: number): void;

  // ShapeUpgrade_ShapeDivide.SetMinTolerance (method)
  SetMinTolerance(mintol: number): void;

  // ShapeUpgrade_ShapeDivide.SetSurfaceSegmentMode (method)
  SetSurfaceSegmentMode(Segment: boolean): void;

  // ShapeUpgrade_ShapeDivide.Perform (method)
  Perform(newContext?: boolean): boolean;

  // ShapeUpgrade_ShapeDivide.Result (method)
  Result(): TopoDS_Shape;

  // ShapeUpgrade_ShapeDivide.GetContext (method)
  GetContext(): ShapeBuild_ReShape;

  // ShapeUpgrade_ShapeDivide.SetContext (method)
  SetContext(context: ShapeBuild_ReShape): void;

  // ShapeUpgrade_ShapeDivide.SetMsgRegistrator (method)
  SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

  // ShapeUpgrade_ShapeDivide.MsgRegistrator (method)
  MsgRegistrator(): ShapeExtend_BasicMsgRegistrator;

  // ShapeUpgrade_ShapeDivide.SendMsg (method)
  SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity?: Message_Gravity): void;

  // ShapeUpgrade_ShapeDivide.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeUpgrade_ShapeDivide.SetSplitFaceTool (method)
  SetSplitFaceTool(splitFaceTool: ShapeUpgrade_FaceDivide): void;

  // ShapeUpgrade_ShapeDivide.SetEdgeMode (method)
  SetEdgeMode(aEdgeMode: number): void;

  // ShapeUpgrade_ShapeDivide.delete (method)
  delete(): void;

  // ShapeUpgrade_ShapeDivide.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideAngle: declare class ShapeUpgrade_ShapeDivideAngle extends ShapeUpgrade_ShapeDivide

  // ShapeUpgrade_ShapeDivideAngle.constructor (constructor)
  constructor(MaxAngle: number);
  constructor(MaxAngle: number, S: TopoDS_Shape);

  // ShapeUpgrade_ShapeDivideAngle.InitTool (method)
  InitTool(MaxAngle: number): void;

  // ShapeUpgrade_ShapeDivideAngle.SetMaxAngle (method)
  SetMaxAngle(MaxAngle: number): void;

  // ShapeUpgrade_ShapeDivideAngle.MaxAngle (method)
  MaxAngle(): number;

  // ShapeUpgrade_ShapeDivideAngle.delete (method)
  delete(): void;

  // ShapeUpgrade_ShapeDivideAngle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideArea: declare class ShapeUpgrade_ShapeDivideArea extends ShapeUpgrade_ShapeDivide

  // ShapeUpgrade_ShapeDivideArea.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // ShapeUpgrade_ShapeDivideArea.MaxArea (method)
  MaxArea(): number;

  // ShapeUpgrade_ShapeDivideArea.NbParts (method)
  NbParts(): number;

  // ShapeUpgrade_ShapeDivideArea.SetNumbersUVSplits (method)
  SetNumbersUVSplits(theNbUsplits: number, theNbVsplits: number): void;

  // ShapeUpgrade_ShapeDivideArea.SetSplittingByNumber (method)
  SetSplittingByNumber(theIsSplittingByNumber: boolean): void;

  // ShapeUpgrade_ShapeDivideArea.delete (method)
  delete(): void;

  // ShapeUpgrade_ShapeDivideArea.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideClosed: declare class ShapeUpgrade_ShapeDivideClosed extends ShapeUpgrade_ShapeDivide

  // ShapeUpgrade_ShapeDivideClosed.constructor (constructor)
  constructor(S: TopoDS_Shape);

  // ShapeUpgrade_ShapeDivideClosed.SetNbSplitPoints (method)
  SetNbSplitPoints(num: number): void;

  // ShapeUpgrade_ShapeDivideClosed.delete (method)
  delete(): void;

  // ShapeUpgrade_ShapeDivideClosed.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideClosedEdges: declare class ShapeUpgrade_ShapeDivideClosedEdges extends ShapeUpgrade_ShapeDivide

  // ShapeUpgrade_ShapeDivideClosedEdges.constructor (constructor)
  constructor(S: TopoDS_Shape);

  // ShapeUpgrade_ShapeDivideClosedEdges.SetNbSplitPoints (method)
  SetNbSplitPoints(num: number): void;

  // ShapeUpgrade_ShapeDivideClosedEdges.delete (method)
  delete(): void;

  // ShapeUpgrade_ShapeDivideClosedEdges.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ShapeDivideContinuity: declare class ShapeUpgrade_ShapeDivideContinuity extends ShapeUpgrade_ShapeDivide

  // ShapeUpgrade_ShapeDivideContinuity.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // ShapeUpgrade_ShapeDivideContinuity.SetTolerance (method)
  SetTolerance(Tol: number): void;

  // ShapeUpgrade_ShapeDivideContinuity.SetTolerance2d (method)
  SetTolerance2d(Tol: number): void;

  // ShapeUpgrade_ShapeDivideContinuity.SetBoundaryCriterion (method)
  SetBoundaryCriterion(Criterion?: GeomAbs_Shape): void;

  // ShapeUpgrade_ShapeDivideContinuity.SetPCurveCriterion (method)
  SetPCurveCriterion(Criterion?: GeomAbs_Shape): void;

  // ShapeUpgrade_ShapeDivideContinuity.SetSurfaceCriterion (method)
  SetSurfaceCriterion(Criterion?: GeomAbs_Shape): void;

  // ShapeUpgrade_ShapeDivideContinuity.delete (method)
  delete(): void;

  // ShapeUpgrade_ShapeDivideContinuity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_ShellSewing: declare class ShapeUpgrade_ShellSewing

  // ShapeUpgrade_ShellSewing.constructor (constructor)
  constructor();

  // ShapeUpgrade_ShellSewing.ApplySewing (method)
  ApplySewing(shape: TopoDS_Shape, tol?: number): TopoDS_Shape;

  // ShapeUpgrade_ShellSewing.delete (method)
  delete(): void;

  // ShapeUpgrade_ShellSewing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_SplitCurve: declare class ShapeUpgrade_SplitCurve extends Standard_Transient

  // ShapeUpgrade_SplitCurve.constructor (constructor)
  constructor();

  // ShapeUpgrade_SplitCurve.Init (method)
  Init(First: number, Last: number): void;

  // ShapeUpgrade_SplitCurve.SetSplitValues (method)
  SetSplitValues(SplitValues: NCollection_HSequence_double): void;

  // ShapeUpgrade_SplitCurve.Build (method)
  Build(Segment: boolean): void;

  // ShapeUpgrade_SplitCurve.SplitValues (method)
  SplitValues(): NCollection_HSequence_double;

  // ShapeUpgrade_SplitCurve.Compute (method)
  Compute(): void;

  // ShapeUpgrade_SplitCurve.Perform (method)
  Perform(Segment?: boolean): void;

  // ShapeUpgrade_SplitCurve.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeUpgrade_SplitCurve.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_SplitCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_SplitCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_SplitCurve.delete (method)
  delete(): void;

  // ShapeUpgrade_SplitCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_SplitCurve2d: declare class ShapeUpgrade_SplitCurve2d extends ShapeUpgrade_SplitCurve

  // ShapeUpgrade_SplitCurve2d.constructor (constructor)
  constructor();

  // ShapeUpgrade_SplitCurve2d.Init (method)
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, First: number, Last: number): void;
  Init(First: number, Last: number): void;

  // ShapeUpgrade_SplitCurve2d.Build (method)
  Build(Segment: boolean): void;

  // ShapeUpgrade_SplitCurve2d.GetCurves (method)
  GetCurves(): NCollection_HArray1_handle_Geom2d_Curve;

  // ShapeUpgrade_SplitCurve2d.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_SplitCurve2d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_SplitCurve2d.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_SplitCurve2d.delete (method)
  delete(): void;

  // ShapeUpgrade_SplitCurve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_SplitCurve2dContinuity: declare class ShapeUpgrade_SplitCurve2dContinuity extends ShapeUpgrade_SplitCurve2d

  // ShapeUpgrade_SplitCurve2dContinuity.constructor (constructor)
  constructor();

  // ShapeUpgrade_SplitCurve2dContinuity.SetCriterion (method)
  SetCriterion(Criterion: GeomAbs_Shape): void;

  // ShapeUpgrade_SplitCurve2dContinuity.SetTolerance (method)
  SetTolerance(Tol: number): void;

  // ShapeUpgrade_SplitCurve2dContinuity.Compute (method)
  Compute(): void;

  // ShapeUpgrade_SplitCurve2dContinuity.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_SplitCurve2dContinuity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_SplitCurve2dContinuity.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_SplitCurve2dContinuity.delete (method)
  delete(): void;

  // ShapeUpgrade_SplitCurve2dContinuity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_SplitCurve3d: declare class ShapeUpgrade_SplitCurve3d extends ShapeUpgrade_SplitCurve

  // ShapeUpgrade_SplitCurve3d.constructor (constructor)
  constructor();

  // ShapeUpgrade_SplitCurve3d.Init (method)
  Init(C: Geom_Curve): void;
  Init(C: Geom_Curve, First: number, Last: number): void;
  Init(First: number, Last: number): void;

  // ShapeUpgrade_SplitCurve3d.Build (method)
  Build(Segment: boolean): void;

  // ShapeUpgrade_SplitCurve3d.GetCurves (method)
  GetCurves(): NCollection_HArray1_handle_Geom_Curve;

  // ShapeUpgrade_SplitCurve3d.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_SplitCurve3d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_SplitCurve3d.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_SplitCurve3d.delete (method)
  delete(): void;

  // ShapeUpgrade_SplitCurve3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_SplitCurve3dContinuity: declare class ShapeUpgrade_SplitCurve3dContinuity extends ShapeUpgrade_SplitCurve3d

  // ShapeUpgrade_SplitCurve3dContinuity.constructor (constructor)
  constructor();

  // ShapeUpgrade_SplitCurve3dContinuity.SetCriterion (method)
  SetCriterion(Criterion: GeomAbs_Shape): void;

  // ShapeUpgrade_SplitCurve3dContinuity.SetTolerance (method)
  SetTolerance(Tol: number): void;

  // ShapeUpgrade_SplitCurve3dContinuity.Compute (method)
  Compute(): void;

  // ShapeUpgrade_SplitCurve3dContinuity.GetCurve (method)
  GetCurve(): Geom_Curve;

  // ShapeUpgrade_SplitCurve3dContinuity.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_SplitCurve3dContinuity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_SplitCurve3dContinuity.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_SplitCurve3dContinuity.delete (method)
  delete(): void;

  // ShapeUpgrade_SplitCurve3dContinuity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_SplitSurface: declare class ShapeUpgrade_SplitSurface extends Standard_Transient

  // ShapeUpgrade_SplitSurface.constructor (constructor)
  constructor();

  // ShapeUpgrade_SplitSurface.Init (method)
  Init(S: Geom_Surface): void;
  Init(S: Geom_Surface, UFirst: number, ULast: number, VFirst: number, VLast: number, theArea: number): void;

  // ShapeUpgrade_SplitSurface.SetUSplitValues (method)
  SetUSplitValues(UValues: NCollection_HSequence_double): void;

  // ShapeUpgrade_SplitSurface.SetVSplitValues (method)
  SetVSplitValues(VValues: NCollection_HSequence_double): void;

  // ShapeUpgrade_SplitSurface.Build (method)
  Build(Segment: boolean): void;

  // ShapeUpgrade_SplitSurface.Compute (method)
  Compute(Segment?: boolean): void;

  // ShapeUpgrade_SplitSurface.Perform (method)
  Perform(Segment?: boolean): void;

  // ShapeUpgrade_SplitSurface.USplitValues (method)
  USplitValues(): NCollection_HSequence_double;

  // ShapeUpgrade_SplitSurface.VSplitValues (method)
  VSplitValues(): NCollection_HSequence_double;

  // ShapeUpgrade_SplitSurface.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeUpgrade_SplitSurface.ResSurfaces (method)
  ResSurfaces(): ShapeExtend_CompositeSurface;

  // ShapeUpgrade_SplitSurface.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_SplitSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_SplitSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_SplitSurface.delete (method)
  delete(): void;

  // ShapeUpgrade_SplitSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_SplitSurfaceAngle: declare class ShapeUpgrade_SplitSurfaceAngle extends ShapeUpgrade_SplitSurface

  // ShapeUpgrade_SplitSurfaceAngle.constructor (constructor)
  constructor(MaxAngle: number);

  // ShapeUpgrade_SplitSurfaceAngle.SetMaxAngle (method)
  SetMaxAngle(MaxAngle: number): void;

  // ShapeUpgrade_SplitSurfaceAngle.MaxAngle (method)
  MaxAngle(): number;

  // ShapeUpgrade_SplitSurfaceAngle.Compute (method)
  Compute(Segment: boolean): void;

  // ShapeUpgrade_SplitSurfaceAngle.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_SplitSurfaceAngle.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_SplitSurfaceAngle.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_SplitSurfaceAngle.delete (method)
  delete(): void;

  // ShapeUpgrade_SplitSurfaceAngle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_SplitSurfaceArea: declare class ShapeUpgrade_SplitSurfaceArea extends ShapeUpgrade_SplitSurface

  // ShapeUpgrade_SplitSurfaceArea.constructor (constructor)
  constructor();

  // ShapeUpgrade_SplitSurfaceArea.NbParts (method)
  NbParts(): number;

  // ShapeUpgrade_SplitSurfaceArea.SetSplittingIntoSquares (method)
  SetSplittingIntoSquares(theIsSplittingIntoSquares: boolean): void;

  // ShapeUpgrade_SplitSurfaceArea.SetNumbersUVSplits (method)
  SetNumbersUVSplits(theNbUsplits: number, theNbVsplits: number): void;

  // ShapeUpgrade_SplitSurfaceArea.Compute (method)
  Compute(Segment?: boolean): void;

  // ShapeUpgrade_SplitSurfaceArea.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_SplitSurfaceArea.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_SplitSurfaceArea.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_SplitSurfaceArea.delete (method)
  delete(): void;

  // ShapeUpgrade_SplitSurfaceArea.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_SplitSurfaceContinuity: declare class ShapeUpgrade_SplitSurfaceContinuity extends ShapeUpgrade_SplitSurface

  // ShapeUpgrade_SplitSurfaceContinuity.constructor (constructor)
  constructor();

  // ShapeUpgrade_SplitSurfaceContinuity.SetCriterion (method)
  SetCriterion(Criterion: GeomAbs_Shape): void;

  // ShapeUpgrade_SplitSurfaceContinuity.SetTolerance (method)
  SetTolerance(Tol: number): void;

  // ShapeUpgrade_SplitSurfaceContinuity.Compute (method)
  Compute(Segment: boolean): void;

  // ShapeUpgrade_SplitSurfaceContinuity.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_SplitSurfaceContinuity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_SplitSurfaceContinuity.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_SplitSurfaceContinuity.delete (method)
  delete(): void;

  // ShapeUpgrade_SplitSurfaceContinuity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_Tool: declare class ShapeUpgrade_Tool extends Standard_Transient

  // ShapeUpgrade_Tool.constructor (constructor)
  constructor();

  // ShapeUpgrade_Tool.Set (method)
  Set(tool: ShapeUpgrade_Tool): void;

  // ShapeUpgrade_Tool.SetContext (method)
  SetContext(context: ShapeBuild_ReShape): void;

  // ShapeUpgrade_Tool.Context (method)
  Context(): ShapeBuild_ReShape;

  // ShapeUpgrade_Tool.SetPrecision (method)
  SetPrecision(preci: number): void;

  // ShapeUpgrade_Tool.Precision (method)
  Precision(): number;

  // ShapeUpgrade_Tool.SetMinTolerance (method)
  SetMinTolerance(mintol: number): void;

  // ShapeUpgrade_Tool.MinTolerance (method)
  MinTolerance(): number;

  // ShapeUpgrade_Tool.SetMaxTolerance (method)
  SetMaxTolerance(maxtol: number): void;

  // ShapeUpgrade_Tool.MaxTolerance (method)
  MaxTolerance(): number;

  // ShapeUpgrade_Tool.LimitTolerance (method)
  LimitTolerance(toler: number): number;

  // ShapeUpgrade_Tool.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_Tool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_Tool.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_Tool.delete (method)
  delete(): void;

  // ShapeUpgrade_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_UnifySameDomain: declare class ShapeUpgrade_UnifySameDomain extends Standard_Transient

  // ShapeUpgrade_UnifySameDomain.constructor (constructor)
  constructor();
  constructor(aShape: TopoDS_Shape, UnifyEdges?: boolean, UnifyFaces?: boolean, ConcatBSplines?: boolean);

  // ShapeUpgrade_UnifySameDomain.Initialize (method)
  Initialize(aShape: TopoDS_Shape, UnifyEdges?: boolean, UnifyFaces?: boolean, ConcatBSplines?: boolean): void;

  // ShapeUpgrade_UnifySameDomain.AllowInternalEdges (method)
  AllowInternalEdges(theValue: boolean): void;

  // ShapeUpgrade_UnifySameDomain.KeepShape (method)
  KeepShape(theShape: TopoDS_Shape): void;

  // ShapeUpgrade_UnifySameDomain.KeepShapes (method)
  KeepShapes(theShapes: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // ShapeUpgrade_UnifySameDomain.SetSafeInputMode (method)
  SetSafeInputMode(theValue: boolean): void;

  // ShapeUpgrade_UnifySameDomain.SetLinearTolerance (method)
  SetLinearTolerance(theValue: number): void;

  // ShapeUpgrade_UnifySameDomain.SetAngularTolerance (method)
  SetAngularTolerance(theValue: number): void;

  // ShapeUpgrade_UnifySameDomain.Build (method)
  Build(): void;

  // ShapeUpgrade_UnifySameDomain.Shape (method)
  Shape(): TopoDS_Shape;

  // ShapeUpgrade_UnifySameDomain.History (method)
  History(): BRepTools_History;

  // ShapeUpgrade_UnifySameDomain.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_UnifySameDomain.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_UnifySameDomain.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_UnifySameDomain.delete (method)
  delete(): void;

  // ShapeUpgrade_UnifySameDomain.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeUpgrade_WireDivide: declare class ShapeUpgrade_WireDivide extends ShapeUpgrade_Tool

  // ShapeUpgrade_WireDivide.constructor (constructor)
  constructor();

  // ShapeUpgrade_WireDivide.Init (method)
  Init(W: TopoDS_Wire, F: TopoDS_Face): void;
  Init(W: TopoDS_Wire, S: Geom_Surface): void;

  // ShapeUpgrade_WireDivide.Load (method)
  Load(W: TopoDS_Wire): void;
  Load(E: TopoDS_Edge): void;

  // ShapeUpgrade_WireDivide.SetFace (method)
  SetFace(F: TopoDS_Face): void;

  // ShapeUpgrade_WireDivide.SetSurface (method)
  SetSurface(S: Geom_Surface): void;
  SetSurface(S: Geom_Surface, L: TopLoc_Location): void;

  // ShapeUpgrade_WireDivide.Perform (method)
  Perform(): void;

  // ShapeUpgrade_WireDivide.Wire (method)
  Wire(): TopoDS_Wire;

  // ShapeUpgrade_WireDivide.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeUpgrade_WireDivide.SetSplitCurve3dTool (method)
  SetSplitCurve3dTool(splitCurve3dTool: ShapeUpgrade_SplitCurve3d): void;

  // ShapeUpgrade_WireDivide.SetSplitCurve2dTool (method)
  SetSplitCurve2dTool(splitCurve2dTool: ShapeUpgrade_SplitCurve2d): void;

  // ShapeUpgrade_WireDivide.SetTransferParamTool (method)
  SetTransferParamTool(TransferParam: ShapeAnalysis_TransferParameters): void;

  // ShapeUpgrade_WireDivide.SetEdgeDivideTool (method)
  SetEdgeDivideTool(edgeDivideTool: ShapeUpgrade_EdgeDivide): void;

  // ShapeUpgrade_WireDivide.GetEdgeDivideTool (method)
  GetEdgeDivideTool(): ShapeUpgrade_EdgeDivide;

  // ShapeUpgrade_WireDivide.GetTransferParamTool (method)
  GetTransferParamTool(): ShapeAnalysis_TransferParameters;

  // ShapeUpgrade_WireDivide.SetEdgeMode (method)
  SetEdgeMode(EdgeMode: number): void;

  // ShapeUpgrade_WireDivide.SetFixSmallCurveTool (method)
  SetFixSmallCurveTool(FixSmallCurvesTool: ShapeUpgrade_FixSmallCurves): void;

  // ShapeUpgrade_WireDivide.GetFixSmallCurveTool (method)
  GetFixSmallCurveTool(): ShapeUpgrade_FixSmallCurves;

  // ShapeUpgrade_WireDivide.get_type_name (method)
  static get_type_name(): string;

  // ShapeUpgrade_WireDivide.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeUpgrade_WireDivide.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeUpgrade_WireDivide.delete (method)
  delete(): void;

  // ShapeUpgrade_WireDivide.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
