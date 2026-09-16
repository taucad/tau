# libcascade — GeomFill (2)

24 top-level symbols. Signatures are verbatim typescript.

GeomFill_DegeneratedBound: declare class GeomFill_DegeneratedBound extends GeomFill_Boundary

  constructor

  Value(U: number): gp_Pnt;

  D1(U: number, P: gp_Pnt, V: gp_Vec): void;

  Reparametrize(First: number, Last: number, HasDF: boolean, HasDL: boolean, DF: number, DL: number, Rev: boolean): void;

  Bounds(First: number, Last: number): { First: number; Last: number };

  IsDegenerated(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_DiscreteTrihedron: declare class GeomFill_DiscreteTrihedron extends GeomFill_TrihedronLaw

  constructor

  Copy(): GeomFill_TrihedronLaw;

  Init(): void;

  SetCurve(C: Adaptor3d_Curve): boolean;

  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  IsConstant(): boolean;

  IsOnlyBy3dCurve(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_DraftTrihedron: declare class GeomFill_DraftTrihedron extends GeomFill_TrihedronLaw

  constructor

  SetAngle(Angle: number): void;

  Copy(): GeomFill_TrihedronLaw;

  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  IsConstant(): boolean;

  IsOnlyBy3dCurve(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_EvolvedSection: declare class GeomFill_EvolvedSection extends GeomFill_SectionLaw

  constructor

  D0(Param: number, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): boolean;

  D1(Param: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  D2(Param: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  BSplineSurface(): Geom_BSplineSurface;

  SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  IsRational(): boolean;

  IsUPeriodic(): boolean;

  IsVPeriodic(): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  SetInterval(First: number, Last: number): void;

  GetInterval(First: number, Last: number): { First: number; Last: number };

  GetDomain(First: number, Last: number): { First: number; Last: number };

  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;

  BarycentreOfSurf(): gp_Pnt;

  MaximalSection(): number;

  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  IsConstant(Error: number): { returnValue: boolean; Error: number };

  ConstantSection(): Geom_Curve;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_Filling: declare class GeomFill_Filling

  constructor

  NbUPoles(): number;

  NbVPoles(): number;

  Poles(Poles: NCollection_Array2_gp_Pnt): void;

  isRational(): boolean;

  Weights(Weights: NCollection_Array2_double): void;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_FillingStyle: typeof GeomFill_FillingStyle[keyof typeof GeomFill_FillingStyle]

GeomFill_Fixed: declare class GeomFill_Fixed extends GeomFill_TrihedronLaw

  constructor

  Copy(): GeomFill_TrihedronLaw;

  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  IsConstant(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_Frenet: declare class GeomFill_Frenet extends GeomFill_TrihedronLaw

  constructor

  Copy(): GeomFill_TrihedronLaw;

  Init(): void;

  SetCurve(C: Adaptor3d_Curve): boolean;

  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  IsConstant(): boolean;

  IsOnlyBy3dCurve(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_FunctionDraft: declare class GeomFill_FunctionDraft extends math_FunctionSetWithDerivatives

  constructor

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  DerivT(C: Adaptor3d_Curve, Param: number, W: number, dN: gp_Vec, teta: number, F: math_VectorBase_double): boolean;

  Deriv2T(C: Adaptor3d_Curve, Param: number, W: number, d2N: gp_Vec, teta: number, F: math_VectorBase_double): boolean;

  DerivTX(dN: gp_Vec, teta: number, D: math_Matrix): boolean;

  Deriv2X(X: math_VectorBase_double, T: GeomFill_Tensor): boolean;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_FunctionGuide: declare class GeomFill_FunctionGuide extends math_FunctionSetWithDerivatives

  constructor

  SetParam(Param: number, Centre: gp_Pnt, Dir: gp_XYZ, XDir: gp_XYZ): void;

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  DerivT(X: math_VectorBase_double, DCentre: gp_XYZ, DDir: gp_XYZ, DFDT: math_VectorBase_double): boolean;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_Generator: declare class GeomFill_Generator extends GeomFill_Profiler

  constructor

  Perform(PTol: number): void;

  Surface(): Geom_Surface;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_Gordon: declare class GeomFill_Gordon

  constructor

  Init(theProfiles: NCollection_Array1_handle_Geom_Curve, theGuides: NCollection_Array1_handle_Geom_Curve, theTolerance: number): void;

  Perform(): void;

  SetParallelMode(theToUseParallel: boolean): void;

  SetApproximationMode(theMode: GeomFill_Gordon_ApproximationMode): void;

  GetApproximationMode(): GeomFill_Gordon_ApproximationMode;

  IsParallelMode(): boolean;

  IsDone(): boolean;

  IsApproximate(): boolean;

  Status(): GeomFill_Gordon_ResultStatus;

  Report(): GeomFill_Gordon_BuildReport;

  Surface(): Geom_BSplineSurface;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_Gordon_ResultStatus: typeof GeomFill_Gordon_ResultStatus[keyof typeof GeomFill_Gordon_ResultStatus]

GeomFill_Gordon_ApproximationMode: typeof GeomFill_Gordon_ApproximationMode[keyof typeof GeomFill_Gordon_ApproximationMode]

GeomFill_Gordon_BuildStage: typeof GeomFill_Gordon_BuildStage[keyof typeof GeomFill_Gordon_BuildStage]

GeomFill_GuideTrihedronAC: declare class GeomFill_GuideTrihedronAC extends GeomFill_TrihedronWithGuide

  constructor

  SetCurve(C: Adaptor3d_Curve): boolean;

  Copy(): GeomFill_TrihedronLaw;

  Guide(): Adaptor3d_Curve;

  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  SetInterval(First: number, Last: number): void;

  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  IsConstant(): boolean;

  IsOnlyBy3dCurve(): boolean;

  Origine(Param1: number, Param2: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_GuideTrihedronPlan: declare class GeomFill_GuideTrihedronPlan extends GeomFill_TrihedronWithGuide

  constructor

  SetCurve(C: Adaptor3d_Curve): boolean;

  Copy(): GeomFill_TrihedronLaw;

  ErrorStatus(): GeomFill_PipeError;

  Guide(): Adaptor3d_Curve;

  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  SetInterval(First: number, Last: number): void;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  IsConstant(): boolean;

  IsOnlyBy3dCurve(): boolean;

  Origine(Param1: number, Param2: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_Line: declare class GeomFill_Line extends Standard_Transient

  constructor

  NbPoints(): number;

  Point(Index: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_LocFunction: declare class GeomFill_LocFunction

  constructor

  D0(Param: number, First: number, Last: number): boolean;

  D1(Param: number, First: number, Last: number): boolean;

  D2(Param: number, First: number, Last: number): boolean;

  DN(Param: number, First: number, Last: number, Order: number, Result?: number, Ier?: number): { Result: number; Ier: number };

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_LocationDraft: declare class GeomFill_LocationDraft extends GeomFill_LocationLaw

  constructor

  SetStopSurf(Surf: Adaptor3d_Surface): void;

  SetAngle(Angle: number): void;

  SetCurve(C: Adaptor3d_Curve): boolean;

  GetCurve(): Adaptor3d_Curve;

  SetTrsf(Transfo: gp_Mat): void;

  Copy(): GeomFill_LocationLaw;

  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;

  D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;

  D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;

  HasFirstRestriction(): boolean;

  HasLastRestriction(): boolean;

  TraceNumber(): number;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  SetInterval(First: number, Last: number): void;

  GetInterval(First: number, Last: number): { First: number; Last: number };

  GetDomain(First: number, Last: number): { First: number; Last: number };

  Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  GetMaximalNorm(): number;

  GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;

  IsTranslation(Error: number): { returnValue: boolean; Error: number };

  IsRotation(Error: number): { returnValue: boolean; Error: number };

  Rotation(Center: gp_Pnt): void;

  IsIntersec(): boolean;

  Direction(): gp_Dir;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_LocationGuide: declare class GeomFill_LocationGuide extends GeomFill_LocationLaw

  constructor

  Set(Section: GeomFill_SectionLaw, rotat: boolean, SFirst: number, SLast: number, PrecAngle: number, LastAngle?: number): { LastAngle: number };

  EraseRotation(): void;

  SetCurve(C: Adaptor3d_Curve): boolean;

  GetCurve(): Adaptor3d_Curve;

  SetTrsf(Transfo: gp_Mat): void;

  Copy(): GeomFill_LocationLaw;

  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;

  D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;

  D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;

  HasFirstRestriction(): boolean;

  HasLastRestriction(): boolean;

  TraceNumber(): number;

  ErrorStatus(): GeomFill_PipeError;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  SetInterval(First: number, Last: number): void;

  GetInterval(First: number, Last: number): { First: number; Last: number };

  GetDomain(First: number, Last: number): { First: number; Last: number };

  SetTolerance(Tol3d: number, Tol2d: number): void;

  Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  GetMaximalNorm(): number;

  GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;

  IsTranslation(Error: number): { returnValue: boolean; Error: number };

  IsRotation(Error: number): { returnValue: boolean; Error: number };

  Rotation(Center: gp_Pnt): void;

  Section(): Geom_Curve;

  Guide(): Adaptor3d_Curve;

  SetOrigine(Param1: number, Param2: number): void;

  ComputeAutomaticLaw(): { returnValue: GeomFill_PipeError; ParAndRad: NCollection_HArray1_gp_Pnt2d; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_LocationLaw: declare class GeomFill_LocationLaw extends Standard_Transient

  SetCurve(C: Adaptor3d_Curve): boolean;

  GetCurve(): Adaptor3d_Curve;

  SetTrsf(Transfo: gp_Mat): void;

  Copy(): GeomFill_LocationLaw;

  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;

  D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;

  D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;

  Nb2dCurves(): number;

  HasFirstRestriction(): boolean;

  HasLastRestriction(): boolean;

  TraceNumber(): number;

  ErrorStatus(): GeomFill_PipeError;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  SetInterval(First: number, Last: number): void;

  GetInterval(First: number, Last: number): { First: number; Last: number };

  GetDomain(First: number, Last: number): { First: number; Last: number };

  Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  SetTolerance(Tol3d: number, Tol2d: number): void;

  GetMaximalNorm(): number;

  GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;

  IsTranslation(Error: number): { returnValue: boolean; Error: number };

  IsRotation(Error: number): { returnValue: boolean; Error: number };

  Rotation(Center: gp_Pnt): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_NetworkSurface: declare class GeomFill_NetworkSurface

  constructor

  Init(theProfiles: NCollection_Array1_handle_Geom_BSplineCurve, theGuides: NCollection_Array1_handle_Geom_BSplineCurve, theProfileParameters: NCollection_Array1_double, theGuideParameters: NCollection_Array1_double, theIntersectionPoints: NCollection_Array2_gp_Pnt, theIntersectionWeights: NCollection_Array2_double, theTolerance: number, theIsUClosed: boolean, theIsVClosed: boolean): void;

  Perform(): void;

  IsDone(): boolean;

  Status(): GeomFill_NetworkSurface_ResultStatus;

  Surface(): Geom_BSplineSurface;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_NetworkSurface_ResultStatus: typeof GeomFill_NetworkSurface_ResultStatus[keyof typeof GeomFill_NetworkSurface_ResultStatus]
