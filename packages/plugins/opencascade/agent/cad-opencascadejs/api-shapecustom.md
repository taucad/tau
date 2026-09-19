# libcascade — ShapeCustom

12 top-level symbols. Signatures are verbatim typescript.

ShapeCustom: declare class ShapeCustom

  constructor

  static ApplyModifier(S: TopoDS_Shape, M: BRepTools_Modification, context: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, MD: BRepTools_Modifier, theProgress: Message_ProgressRange, aReShape: ShapeBuild_ReShape): TopoDS_Shape;

  static DirectFaces(S: TopoDS_Shape): TopoDS_Shape;

  static ScaleShape(S: TopoDS_Shape, scale: number): TopoDS_Shape;

  static BSplineRestriction(S: TopoDS_Shape, Tol3d: number, Tol2d: number, MaxDegree: number, MaxNbSegment: number, Continuity3d: GeomAbs_Shape, Continuity2d: GeomAbs_Shape, Degree: boolean, Rational: boolean, aParameters: ShapeCustom_RestrictionParameters): TopoDS_Shape;

  static ConvertToRevolution(S: TopoDS_Shape): TopoDS_Shape;

  static SweptToElementary(S: TopoDS_Shape): TopoDS_Shape;

  static ConvertToBSpline(S: TopoDS_Shape, extrMode: boolean, revolMode: boolean, offsetMode: boolean, planeMode?: boolean): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_BSplineRestriction: declare class ShapeCustom_BSplineRestriction extends ShapeCustom_Modification

  constructor

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  ConvertSurface(aSurface: Geom_Surface, UF: number, UL: number, VF: number, VL: number, IsOf: boolean): { returnValue: boolean; S: Geom_Surface; [Symbol.dispose](): void };

  ConvertCurve(aCurve: Geom_Curve, IsConvert: boolean, First: number, Last: number, TolCur: number, IsOf: boolean): { returnValue: boolean; C: Geom_Curve; TolCur: number; [Symbol.dispose](): void };

  ConvertCurve2d(aCurve: Geom2d_Curve, IsConvert: boolean, First: number, Last: number, TolCur: number, IsOf: boolean): { returnValue: boolean; C: Geom2d_Curve; TolCur: number; [Symbol.dispose](): void };

  SetTol3d(Tol3d: number): void;

  SetTol2d(Tol2d: number): void;

  ModifyApproxSurfaceFlag(): boolean;

  ModifyApproxCurve3dFlag(): boolean;

  ModifyApproxCurve2dFlag(): boolean;

  SetContinuity3d(Continuity3d: GeomAbs_Shape): void;

  SetContinuity2d(Continuity2d: GeomAbs_Shape): void;

  SetMaxDegree(MaxDegree: number): void;

  SetMaxNbSegments(MaxNbSegments: number): void;

  SetPriority(Degree: boolean): void;

  SetConvRational(Rational: boolean): void;

  GetRestrictionParameters(): ShapeCustom_RestrictionParameters;

  SetRestrictionParameters(aModes: ShapeCustom_RestrictionParameters): void;

  Curve3dError(): number;

  Curve2dError(): number;

  SurfaceError(): number;

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  MaxErrors(aCurve3dErr?: number, aCurve2dErr?: number): { returnValue: number; aCurve3dErr: number; aCurve2dErr: number };

  NbOfSpan(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_ConvertToBSpline: declare class ShapeCustom_ConvertToBSpline extends ShapeCustom_Modification

  constructor

  SetExtrusionMode(extrMode: boolean): void;

  SetRevolutionMode(revolMode: boolean): void;

  SetOffsetMode(offsetMode: boolean): void;

  SetPlaneMode(planeMode: boolean): void;

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_ConvertToRevolution: declare class ShapeCustom_ConvertToRevolution extends ShapeCustom_Modification

  constructor

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_Curve: declare class ShapeCustom_Curve

  constructor

  Init(C: Geom_Curve): void;

  ConvertToPeriodic(substitute: boolean, preci?: number): Geom_Curve;

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_Curve2d: declare class ShapeCustom_Curve2d

  constructor

  static IsLinear(thePoles: NCollection_Array1_gp_Pnt2d, theTolerance: number, theDeviation?: number): { returnValue: boolean; theDeviation: number };

  static ConvertToLine2d(theCurve: Geom2d_Curve, theFirstIn: number, theLastIn: number, theTolerance: number, theNewFirst?: number, theNewLast?: number, theDeviation?: number): { returnValue: Geom2d_Line; theNewFirst: number; theNewLast: number; theDeviation: number; [Symbol.dispose](): void };

  static SimplifyBSpline2d(theTolerance: number): { returnValue: boolean; theBSpline2d: Geom2d_BSplineCurve; [Symbol.dispose](): void };

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_DirectModification: declare class ShapeCustom_DirectModification extends ShapeCustom_Modification

  constructor

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_Modification: declare class ShapeCustom_Modification extends BRepTools_Modification

  SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

  MsgRegistrator(): ShapeExtend_BasicMsgRegistrator;

  SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity?: Message_Gravity): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_RestrictionParameters: declare class ShapeCustom_RestrictionParameters extends Standard_Transient

  constructor

  GMaxDegree(): number;

  GMaxSeg(): number;

  ConvertPlane(): boolean;

  ConvertBezierSurf(): boolean;

  ConvertRevolutionSurf(): boolean;

  ConvertExtrusionSurf(): boolean;

  ConvertOffsetSurf(): boolean;

  ConvertCylindricalSurf(): boolean;

  ConvertConicalSurf(): boolean;

  ConvertToroidalSurf(): boolean;

  ConvertSphericalSurf(): boolean;

  SegmentSurfaceMode(): boolean;

  ConvertCurve3d(): boolean;

  ConvertOffsetCurv3d(): boolean;

  ConvertCurve2d(): boolean;

  ConvertOffsetCurv2d(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_Surface: declare class ShapeCustom_Surface

  constructor

  Init(S: Geom_Surface): void;

  Gap(): number;

  ConvertToAnalytical(tol: number, substitute: boolean): Geom_Surface;

  ConvertToPeriodic(substitute: boolean, preci?: number): Geom_Surface;

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_SweptToElementary: declare class ShapeCustom_SweptToElementary extends ShapeCustom_Modification

  constructor

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeCustom_TrsfModification: declare class ShapeCustom_TrsfModification extends BRepTools_TrsfModification

  constructor

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
