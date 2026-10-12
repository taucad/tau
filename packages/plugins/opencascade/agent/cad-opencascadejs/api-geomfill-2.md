# libcascade — GeomFill (2)

27 top-level symbols. Signatures are verbatim typescript.

GeomFill_EvolvedSection: declare class GeomFill_EvolvedSection extends GeomFill_SectionLaw

  // GeomFill_EvolvedSection.constructor (constructor)
  constructor(C: Geom_Curve, L: Law_Function);

  // GeomFill_EvolvedSection.D0 (method)
  D0(Param: number, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): boolean;

  // GeomFill_EvolvedSection.D1 (method)
  D1(Param: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  // GeomFill_EvolvedSection.D2 (method)
  D2(Param: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // GeomFill_EvolvedSection.BSplineSurface (method)
  BSplineSurface(): Geom_BSplineSurface;

  // GeomFill_EvolvedSection.SectionShape (method)
  SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

  // GeomFill_EvolvedSection.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // GeomFill_EvolvedSection.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // GeomFill_EvolvedSection.IsRational (method)
  IsRational(): boolean;

  // GeomFill_EvolvedSection.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomFill_EvolvedSection.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomFill_EvolvedSection.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_EvolvedSection.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_EvolvedSection.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_EvolvedSection.GetInterval (method)
  GetInterval(First: number, Last: number): { First: number; Last: number };

  // GeomFill_EvolvedSection.GetDomain (method)
  GetDomain(First: number, Last: number): { First: number; Last: number };

  // GeomFill_EvolvedSection.GetTolerance (method)
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;

  // GeomFill_EvolvedSection.BarycentreOfSurf (method)
  BarycentreOfSurf(): gp_Pnt;

  // GeomFill_EvolvedSection.MaximalSection (method)
  MaximalSection(): number;

  // GeomFill_EvolvedSection.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // GeomFill_EvolvedSection.IsConstant (method)
  IsConstant(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_EvolvedSection.ConstantSection (method)
  ConstantSection(): Geom_Curve;

  // GeomFill_EvolvedSection.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_EvolvedSection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_EvolvedSection.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_EvolvedSection.delete (method)
  delete(): void;

  // GeomFill_EvolvedSection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Filling: declare class GeomFill_Filling

  // GeomFill_Filling.constructor (constructor)
  constructor();

  // GeomFill_Filling.NbUPoles (method)
  NbUPoles(): number;

  // GeomFill_Filling.NbVPoles (method)
  NbVPoles(): number;

  // GeomFill_Filling.Poles (method)
  Poles(Poles: NCollection_Array2_gp_Pnt): void;

  // GeomFill_Filling.isRational (method)
  isRational(): boolean;

  // GeomFill_Filling.Weights (method)
  Weights(Weights: NCollection_Array2_double): void;

  // GeomFill_Filling.delete (method)
  delete(): void;

  // GeomFill_Filling.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_FillingStyle: typeof GeomFill_FillingStyle[keyof typeof GeomFill_FillingStyle]

  readonly GeomFill_StretchStyle: 'GeomFill_StretchStyle'

  readonly GeomFill_CoonsStyle: 'GeomFill_CoonsStyle'

  readonly GeomFill_CurvedStyle: 'GeomFill_CurvedStyle'

GeomFill_Fixed: declare class GeomFill_Fixed extends GeomFill_TrihedronLaw

  // GeomFill_Fixed.constructor (constructor)
  constructor(Tangent: gp_Vec, Normal: gp_Vec);

  // GeomFill_Fixed.Copy (method)
  Copy(): GeomFill_TrihedronLaw;

  // GeomFill_Fixed.D0 (method)
  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  // GeomFill_Fixed.D1 (method)
  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  // GeomFill_Fixed.D2 (method)
  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  // GeomFill_Fixed.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_Fixed.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_Fixed.GetAverageLaw (method)
  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  // GeomFill_Fixed.IsConstant (method)
  IsConstant(): boolean;

  // GeomFill_Fixed.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_Fixed.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_Fixed.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_Fixed.delete (method)
  delete(): void;

  // GeomFill_Fixed.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Frenet: declare class GeomFill_Frenet extends GeomFill_TrihedronLaw

  // GeomFill_Frenet.constructor (constructor)
  constructor();

  // GeomFill_Frenet.Copy (method)
  Copy(): GeomFill_TrihedronLaw;

  // GeomFill_Frenet.Init (method)
  Init(): void;

  // GeomFill_Frenet.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_Frenet.D0 (method)
  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  // GeomFill_Frenet.D1 (method)
  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  // GeomFill_Frenet.D2 (method)
  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  // GeomFill_Frenet.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_Frenet.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_Frenet.GetAverageLaw (method)
  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  // GeomFill_Frenet.IsConstant (method)
  IsConstant(): boolean;

  // GeomFill_Frenet.IsOnlyBy3dCurve (method)
  IsOnlyBy3dCurve(): boolean;

  // GeomFill_Frenet.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_Frenet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_Frenet.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_Frenet.delete (method)
  delete(): void;

  // GeomFill_Frenet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_FunctionDraft: declare class GeomFill_FunctionDraft extends math_FunctionSetWithDerivatives

  // GeomFill_FunctionDraft.constructor (constructor)
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // GeomFill_FunctionDraft.NbVariables (method)
  NbVariables(): number;

  // GeomFill_FunctionDraft.NbEquations (method)
  NbEquations(): number;

  // GeomFill_FunctionDraft.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // GeomFill_FunctionDraft.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // GeomFill_FunctionDraft.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // GeomFill_FunctionDraft.DerivT (method)
  DerivT(C: Adaptor3d_Curve, Param: number, W: number, dN: gp_Vec, teta: number, F: math_VectorBase_double): boolean;

  // GeomFill_FunctionDraft.Deriv2T (method)
  Deriv2T(C: Adaptor3d_Curve, Param: number, W: number, d2N: gp_Vec, teta: number, F: math_VectorBase_double): boolean;

  // GeomFill_FunctionDraft.DerivTX (method)
  DerivTX(dN: gp_Vec, teta: number, D: math_Matrix): boolean;

  // GeomFill_FunctionDraft.Deriv2X (method)
  Deriv2X(X: math_VectorBase_double, T: GeomFill_Tensor): boolean;

  // GeomFill_FunctionDraft.delete (method)
  delete(): void;

  // GeomFill_FunctionDraft.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_FunctionGuide: declare class GeomFill_FunctionGuide extends math_FunctionSetWithDerivatives

  // GeomFill_FunctionGuide.constructor (constructor)
  constructor(S: GeomFill_SectionLaw, Guide: Adaptor3d_Curve, ParamOnLaw?: number);

  // GeomFill_FunctionGuide.SetParam (method)
  SetParam(Param: number, Centre: gp_Pnt, Dir: gp_XYZ, XDir: gp_XYZ): void;

  // GeomFill_FunctionGuide.NbVariables (method)
  NbVariables(): number;

  // GeomFill_FunctionGuide.NbEquations (method)
  NbEquations(): number;

  // GeomFill_FunctionGuide.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // GeomFill_FunctionGuide.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // GeomFill_FunctionGuide.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // GeomFill_FunctionGuide.DerivT (method)
  DerivT(X: math_VectorBase_double, DCentre: gp_XYZ, DDir: gp_XYZ, DFDT: math_VectorBase_double): boolean;

  // GeomFill_FunctionGuide.delete (method)
  delete(): void;

  // GeomFill_FunctionGuide.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Generator: declare class GeomFill_Generator extends GeomFill_Profiler

  // GeomFill_Generator.constructor (constructor)
  constructor();

  // GeomFill_Generator.Perform (method)
  Perform(PTol: number): void;

  // GeomFill_Generator.Surface (method)
  Surface(): Geom_Surface;

  // GeomFill_Generator.delete (method)
  delete(): void;

  // GeomFill_Generator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Gordon: declare class GeomFill_Gordon

  // GeomFill_Gordon.constructor (constructor)
  constructor();

  // GeomFill_Gordon.Init (method)
  Init(theProfiles: NCollection_Array1_handle_Geom_Curve, theGuides: NCollection_Array1_handle_Geom_Curve, theTolerance: number): void;

  // GeomFill_Gordon.Perform (method)
  Perform(): void;

  // GeomFill_Gordon.SetParallelMode (method)
  SetParallelMode(theToUseParallel: boolean): void;

  // GeomFill_Gordon.SetApproximationMode (method)
  SetApproximationMode(theMode: GeomFill_Gordon_ApproximationMode): void;

  // GeomFill_Gordon.GetApproximationMode (method)
  GetApproximationMode(): GeomFill_Gordon_ApproximationMode;

  // GeomFill_Gordon.IsParallelMode (method)
  IsParallelMode(): boolean;

  // GeomFill_Gordon.IsDone (method)
  IsDone(): boolean;

  // GeomFill_Gordon.IsApproximate (method)
  IsApproximate(): boolean;

  // GeomFill_Gordon.Status (method)
  Status(): GeomFill_Gordon_ResultStatus;

  // GeomFill_Gordon.Report (method)
  Report(): GeomFill_Gordon_BuildReport;

  // GeomFill_Gordon.Surface (method)
  Surface(): Geom_BSplineSurface;

  // GeomFill_Gordon.delete (method)
  delete(): void;

  // GeomFill_Gordon.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Gordon_ResultStatus: typeof GeomFill_Gordon_ResultStatus[keyof typeof GeomFill_Gordon_ResultStatus]

  readonly NotStarted: 'NotStarted'

  readonly Done: 'Done'

  readonly InvalidInput: 'InvalidInput'

  readonly ConversionFailed: 'ConversionFailed'

  readonly IntersectionFailed: 'IntersectionFailed'

  readonly OrderingFailed: 'OrderingFailed'

  readonly ReparametrizationFailed: 'ReparametrizationFailed'

  readonly CompatibilityFailed: 'CompatibilityFailed'

  readonly CurveCompatibilityFailed: 'CurveCompatibilityFailed'

  readonly RationalReparametrizationFailed: 'RationalReparametrizationFailed'

  readonly SkinningFailed: 'SkinningFailed'

  readonly ReferenceSurfaceFailed: 'ReferenceSurfaceFailed'

  readonly KnotAlignmentFailed: 'KnotAlignmentFailed'

  readonly RationalDegreeOverflow: 'RationalDegreeOverflow'

  readonly RationalConstructionFailed: 'RationalConstructionFailed'

  readonly PeriodicityFailed: 'PeriodicityFailed'

  readonly ApproximationFailed: 'ApproximationFailed'

  readonly ConstructionFailed: 'ConstructionFailed'

GeomFill_Gordon_ApproximationMode: typeof GeomFill_Gordon_ApproximationMode[keyof typeof GeomFill_Gordon_ApproximationMode]

  readonly ExactOnly: 'ExactOnly'

  readonly AllowApproximateFallback: 'AllowApproximateFallback'

GeomFill_Gordon_BuildStage: typeof GeomFill_Gordon_BuildStage[keyof typeof GeomFill_Gordon_BuildStage]

  readonly NotStarted: 'NotStarted'

  readonly InputConversion: 'InputConversion'

  readonly ContactDiscovery: 'ContactDiscovery'

  readonly NetworkOrdering: 'NetworkOrdering'

  readonly Reparametrization: 'Reparametrization'

  readonly ExactConstruction: 'ExactConstruction'

  readonly Validation: 'Validation'

  readonly Approximation: 'Approximation'

GeomFill_GuideTrihedronAC: declare class GeomFill_GuideTrihedronAC extends GeomFill_TrihedronWithGuide

  // GeomFill_GuideTrihedronAC.constructor (constructor)
  constructor(guide: Adaptor3d_Curve);

  // GeomFill_GuideTrihedronAC.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_GuideTrihedronAC.Copy (method)
  Copy(): GeomFill_TrihedronLaw;

  // GeomFill_GuideTrihedronAC.Guide (method)
  Guide(): Adaptor3d_Curve;

  // GeomFill_GuideTrihedronAC.D0 (method)
  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  // GeomFill_GuideTrihedronAC.D1 (method)
  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  // GeomFill_GuideTrihedronAC.D2 (method)
  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  // GeomFill_GuideTrihedronAC.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_GuideTrihedronAC.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_GuideTrihedronAC.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_GuideTrihedronAC.GetAverageLaw (method)
  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  // GeomFill_GuideTrihedronAC.IsConstant (method)
  IsConstant(): boolean;

  // GeomFill_GuideTrihedronAC.IsOnlyBy3dCurve (method)
  IsOnlyBy3dCurve(): boolean;

  // GeomFill_GuideTrihedronAC.Origine (method)
  Origine(Param1: number, Param2: number): void;

  // GeomFill_GuideTrihedronAC.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_GuideTrihedronAC.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_GuideTrihedronAC.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_GuideTrihedronAC.delete (method)
  delete(): void;

  // GeomFill_GuideTrihedronAC.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_GuideTrihedronPlan: declare class GeomFill_GuideTrihedronPlan extends GeomFill_TrihedronWithGuide

  // GeomFill_GuideTrihedronPlan.constructor (constructor)
  constructor(theGuide: Adaptor3d_Curve);

  // GeomFill_GuideTrihedronPlan.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_GuideTrihedronPlan.Copy (method)
  Copy(): GeomFill_TrihedronLaw;

  // GeomFill_GuideTrihedronPlan.ErrorStatus (method)
  ErrorStatus(): GeomFill_PipeError;

  // GeomFill_GuideTrihedronPlan.Guide (method)
  Guide(): Adaptor3d_Curve;

  // GeomFill_GuideTrihedronPlan.D0 (method)
  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  // GeomFill_GuideTrihedronPlan.D1 (method)
  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  // GeomFill_GuideTrihedronPlan.D2 (method)
  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  // GeomFill_GuideTrihedronPlan.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_GuideTrihedronPlan.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_GuideTrihedronPlan.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_GuideTrihedronPlan.GetAverageLaw (method)
  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  // GeomFill_GuideTrihedronPlan.IsConstant (method)
  IsConstant(): boolean;

  // GeomFill_GuideTrihedronPlan.IsOnlyBy3dCurve (method)
  IsOnlyBy3dCurve(): boolean;

  // GeomFill_GuideTrihedronPlan.Origine (method)
  Origine(Param1: number, Param2: number): void;

  // GeomFill_GuideTrihedronPlan.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_GuideTrihedronPlan.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_GuideTrihedronPlan.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_GuideTrihedronPlan.delete (method)
  delete(): void;

  // GeomFill_GuideTrihedronPlan.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Line: declare class GeomFill_Line extends Standard_Transient

  // GeomFill_Line.constructor (constructor)
  constructor();
  constructor(NbPoints: number);

  // GeomFill_Line.NbPoints (method)
  NbPoints(): number;

  // GeomFill_Line.Point (method)
  Point(Index: number): number;

  // GeomFill_Line.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_Line.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_Line.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_Line.delete (method)
  delete(): void;

  // GeomFill_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_LocFunction: declare class GeomFill_LocFunction

  // GeomFill_LocFunction.constructor (constructor)
  constructor(Law: GeomFill_LocationLaw);

  // GeomFill_LocFunction.D0 (method)
  D0(Param: number, First: number, Last: number): boolean;

  // GeomFill_LocFunction.D1 (method)
  D1(Param: number, First: number, Last: number): boolean;

  // GeomFill_LocFunction.D2 (method)
  D2(Param: number, First: number, Last: number): boolean;

  // GeomFill_LocFunction.DN (method)
  DN(Param: number, First: number, Last: number, Order: number, Result?: number, Ier?: number): { Result: number; Ier: number };

  // GeomFill_LocFunction.delete (method)
  delete(): void;

  // GeomFill_LocFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_LocationDraft: declare class GeomFill_LocationDraft extends GeomFill_LocationLaw

  // GeomFill_LocationDraft.constructor (constructor)
  constructor(Direction: gp_Dir, Angle: number);

  // GeomFill_LocationDraft.SetStopSurf (method)
  SetStopSurf(Surf: Adaptor3d_Surface): void;

  // GeomFill_LocationDraft.SetAngle (method)
  SetAngle(Angle: number): void;

  // GeomFill_LocationDraft.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_LocationDraft.GetCurve (method)
  GetCurve(): Adaptor3d_Curve;

  // GeomFill_LocationDraft.SetTrsf (method)
  SetTrsf(Transfo: gp_Mat): void;

  // GeomFill_LocationDraft.Copy (method)
  Copy(): GeomFill_LocationLaw;

  // GeomFill_LocationDraft.D0 (method)
  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;

  // GeomFill_LocationDraft.D1 (method)
  D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomFill_LocationDraft.D2 (method)
  D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomFill_LocationDraft.HasFirstRestriction (method)
  HasFirstRestriction(): boolean;

  // GeomFill_LocationDraft.HasLastRestriction (method)
  HasLastRestriction(): boolean;

  // GeomFill_LocationDraft.TraceNumber (method)
  TraceNumber(): number;

  // GeomFill_LocationDraft.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_LocationDraft.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_LocationDraft.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_LocationDraft.GetInterval (method)
  GetInterval(First: number, Last: number): { First: number; Last: number };

  // GeomFill_LocationDraft.GetDomain (method)
  GetDomain(First: number, Last: number): { First: number; Last: number };

  // GeomFill_LocationDraft.Resolution (method)
  Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // GeomFill_LocationDraft.GetMaximalNorm (method)
  GetMaximalNorm(): number;

  // GeomFill_LocationDraft.GetAverageLaw (method)
  GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;

  // GeomFill_LocationDraft.IsTranslation (method)
  IsTranslation(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_LocationDraft.IsRotation (method)
  IsRotation(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_LocationDraft.Rotation (method)
  Rotation(Center: gp_Pnt): void;

  // GeomFill_LocationDraft.IsIntersec (method)
  IsIntersec(): boolean;

  // GeomFill_LocationDraft.Direction (method)
  Direction(): gp_Dir;

  // GeomFill_LocationDraft.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_LocationDraft.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_LocationDraft.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_LocationDraft.delete (method)
  delete(): void;

  // GeomFill_LocationDraft.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_LocationGuide: declare class GeomFill_LocationGuide extends GeomFill_LocationLaw

  // GeomFill_LocationGuide.constructor (constructor)
  constructor(Triedre: GeomFill_TrihedronWithGuide);

  // GeomFill_LocationGuide.Set (method)
  Set(Section: GeomFill_SectionLaw, rotat: boolean, SFirst: number, SLast: number, PrecAngle: number, LastAngle?: number): { LastAngle: number };

  // GeomFill_LocationGuide.EraseRotation (method)
  EraseRotation(): void;

  // GeomFill_LocationGuide.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_LocationGuide.GetCurve (method)
  GetCurve(): Adaptor3d_Curve;

  // GeomFill_LocationGuide.SetTrsf (method)
  SetTrsf(Transfo: gp_Mat): void;

  // GeomFill_LocationGuide.Copy (method)
  Copy(): GeomFill_LocationLaw;

  // GeomFill_LocationGuide.D0 (method)
  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;

  // GeomFill_LocationGuide.D1 (method)
  D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomFill_LocationGuide.D2 (method)
  D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomFill_LocationGuide.HasFirstRestriction (method)
  HasFirstRestriction(): boolean;

  // GeomFill_LocationGuide.HasLastRestriction (method)
  HasLastRestriction(): boolean;

  // GeomFill_LocationGuide.TraceNumber (method)
  TraceNumber(): number;

  // GeomFill_LocationGuide.ErrorStatus (method)
  ErrorStatus(): GeomFill_PipeError;

  // GeomFill_LocationGuide.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_LocationGuide.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_LocationGuide.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_LocationGuide.GetInterval (method)
  GetInterval(First: number, Last: number): { First: number; Last: number };

  // GeomFill_LocationGuide.GetDomain (method)
  GetDomain(First: number, Last: number): { First: number; Last: number };

  // GeomFill_LocationGuide.SetTolerance (method)
  SetTolerance(Tol3d: number, Tol2d: number): void;

  // GeomFill_LocationGuide.Resolution (method)
  Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // GeomFill_LocationGuide.GetMaximalNorm (method)
  GetMaximalNorm(): number;

  // GeomFill_LocationGuide.GetAverageLaw (method)
  GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;

  // GeomFill_LocationGuide.IsTranslation (method)
  IsTranslation(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_LocationGuide.IsRotation (method)
  IsRotation(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_LocationGuide.Rotation (method)
  Rotation(Center: gp_Pnt): void;

  // GeomFill_LocationGuide.Section (method)
  Section(): Geom_Curve;

  // GeomFill_LocationGuide.Guide (method)
  Guide(): Adaptor3d_Curve;

  // GeomFill_LocationGuide.SetOrigine (method)
  SetOrigine(Param1: number, Param2: number): void;

  // GeomFill_LocationGuide.ComputeAutomaticLaw (method)
  ComputeAutomaticLaw(): { returnValue: GeomFill_PipeError; ParAndRad: NCollection_HArray1_gp_Pnt2d; [Symbol.dispose](): void };

  // GeomFill_LocationGuide.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_LocationGuide.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_LocationGuide.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_LocationGuide.delete (method)
  delete(): void;

  // GeomFill_LocationGuide.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_LocationLaw: declare class GeomFill_LocationLaw extends Standard_Transient

  // GeomFill_LocationLaw.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_LocationLaw.GetCurve (method)
  GetCurve(): Adaptor3d_Curve;

  // GeomFill_LocationLaw.SetTrsf (method)
  SetTrsf(Transfo: gp_Mat): void;

  // GeomFill_LocationLaw.Copy (method)
  Copy(): GeomFill_LocationLaw;

  // GeomFill_LocationLaw.D0 (method)
  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;

  // GeomFill_LocationLaw.D1 (method)
  D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomFill_LocationLaw.D2 (method)
  D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomFill_LocationLaw.Nb2dCurves (method)
  Nb2dCurves(): number;

  // GeomFill_LocationLaw.HasFirstRestriction (method)
  HasFirstRestriction(): boolean;

  // GeomFill_LocationLaw.HasLastRestriction (method)
  HasLastRestriction(): boolean;

  // GeomFill_LocationLaw.TraceNumber (method)
  TraceNumber(): number;

  // GeomFill_LocationLaw.ErrorStatus (method)
  ErrorStatus(): GeomFill_PipeError;

  // GeomFill_LocationLaw.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_LocationLaw.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_LocationLaw.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_LocationLaw.GetInterval (method)
  GetInterval(First: number, Last: number): { First: number; Last: number };

  // GeomFill_LocationLaw.GetDomain (method)
  GetDomain(First: number, Last: number): { First: number; Last: number };

  // GeomFill_LocationLaw.Resolution (method)
  Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // GeomFill_LocationLaw.SetTolerance (method)
  SetTolerance(Tol3d: number, Tol2d: number): void;

  // GeomFill_LocationLaw.GetMaximalNorm (method)
  GetMaximalNorm(): number;

  // GeomFill_LocationLaw.GetAverageLaw (method)
  GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;

  // GeomFill_LocationLaw.IsTranslation (method)
  IsTranslation(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_LocationLaw.IsRotation (method)
  IsRotation(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_LocationLaw.Rotation (method)
  Rotation(Center: gp_Pnt): void;

  // GeomFill_LocationLaw.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_LocationLaw.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_LocationLaw.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_LocationLaw.delete (method)
  delete(): void;

  // GeomFill_LocationLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_NetworkSurface: declare class GeomFill_NetworkSurface

  // GeomFill_NetworkSurface.constructor (constructor)
  constructor();

  // GeomFill_NetworkSurface.Init (method)
  Init(theProfiles: NCollection_Array1_handle_Geom_BSplineCurve, theGuides: NCollection_Array1_handle_Geom_BSplineCurve, theProfileParameters: NCollection_Array1_double, theGuideParameters: NCollection_Array1_double, theIntersectionPoints: NCollection_Array2_gp_Pnt, theIntersectionWeights: NCollection_Array2_double, theTolerance: number, theIsUClosed: boolean, theIsVClosed: boolean): void;

  // GeomFill_NetworkSurface.Perform (method)
  Perform(): void;

  // GeomFill_NetworkSurface.IsDone (method)
  IsDone(): boolean;

  // GeomFill_NetworkSurface.Status (method)
  Status(): GeomFill_NetworkSurface_ResultStatus;

  // GeomFill_NetworkSurface.Surface (method)
  Surface(): Geom_BSplineSurface;

  // GeomFill_NetworkSurface.delete (method)
  delete(): void;

  // GeomFill_NetworkSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_NetworkSurface_ResultStatus: typeof GeomFill_NetworkSurface_ResultStatus[keyof typeof GeomFill_NetworkSurface_ResultStatus]

  readonly NotStarted: 'NotStarted'

  readonly Done: 'Done'

  readonly InvalidInput: 'InvalidInput'

  readonly CurveCompatibilityFailed: 'CurveCompatibilityFailed'

  readonly SkinningFailed: 'SkinningFailed'

  readonly ReferenceSurfaceFailed: 'ReferenceSurfaceFailed'

  readonly KnotAlignmentFailed: 'KnotAlignmentFailed'

  readonly RationalDegreeOverflow: 'RationalDegreeOverflow'

  readonly RationalConstructionFailed: 'RationalConstructionFailed'

  readonly ConstructionFailed: 'ConstructionFailed'

  readonly PeriodicityFailed: 'PeriodicityFailed'

GeomFill_Pipe: declare class GeomFill_Pipe

  // GeomFill_Pipe.constructor (constructor)
  constructor();
  constructor(Path: Geom_Curve, Radius: number);
  constructor(Path: Geom_Curve, NSections: NCollection_Sequence_handle_Geom_Curve);
  constructor(Path: Geom_Curve, FirstSect: Geom_Curve, Option?: GeomFill_Trihedron);
  constructor(Path: Geom2d_Curve, Support: Geom_Surface, FirstSect: Geom_Curve);
  constructor(Path: Geom_Curve, FirstSect: Geom_Curve, Dir: gp_Dir);
  constructor(Path: Geom_Curve, FirstSect: Geom_Curve, LastSect: Geom_Curve);
  constructor(Path: Geom_Curve, Curve1: Geom_Curve, Curve2: Geom_Curve, Radius: number);
  constructor(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number);
  constructor(Path: Geom_Curve, Guide: Adaptor3d_Curve, FirstSect: Geom_Curve, ByACR: boolean, rotat: boolean);

  // GeomFill_Pipe.Init (method)
  Init(Path: Geom_Curve, Radius: number): void;
  Init(Path: Geom_Curve, NSections: NCollection_Sequence_handle_Geom_Curve): void;
  Init(Path: Geom_Curve, FirstSect: Geom_Curve, Option: GeomFill_Trihedron): void;
  Init(Path: Geom2d_Curve, Support: Geom_Surface, FirstSect: Geom_Curve): void;
  Init(Path: Geom_Curve, FirstSect: Geom_Curve, Dir: gp_Dir): void;
  Init(Path: Geom_Curve, FirstSect: Geom_Curve, LastSect: Geom_Curve): void;
  Init(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number): void;
  Init(Path: Geom_Curve, Guide: Adaptor3d_Curve, FirstSect: Geom_Curve, ByACR: boolean, rotat: boolean): void;

  // GeomFill_Pipe.Perform (method)
  Perform(WithParameters: boolean, myPolynomial: boolean): void;
  Perform(Tol: number, Polynomial: boolean, Conti: GeomAbs_Shape, MaxDegree: number, NbMaxSegment: number): void;

  // GeomFill_Pipe.Surface (method)
  Surface(): Geom_Surface;

  // GeomFill_Pipe.ExchangeUV (method)
  ExchangeUV(): boolean;

  // GeomFill_Pipe.GenerateParticularCase (method)
  GenerateParticularCase(B: boolean): void;
  GenerateParticularCase(): boolean;

  // GeomFill_Pipe.ErrorOnSurf (method)
  ErrorOnSurf(): number;

  // GeomFill_Pipe.IsDone (method)
  IsDone(): boolean;

  // GeomFill_Pipe.GetStatus (method)
  GetStatus(): GeomFill_PipeError;

  // GeomFill_Pipe.delete (method)
  delete(): void;

  // GeomFill_Pipe.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_PipeError: typeof GeomFill_PipeError[keyof typeof GeomFill_PipeError]

  readonly GeomFill_PipeOk: 'GeomFill_PipeOk'

  readonly GeomFill_PipeNotOk: 'GeomFill_PipeNotOk'

  readonly GeomFill_PlaneNotIntersectGuide: 'GeomFill_PlaneNotIntersectGuide'

  readonly GeomFill_ImpossibleContact: 'GeomFill_ImpossibleContact'

GeomFill_PlanFunc: declare class GeomFill_PlanFunc extends math_FunctionWithDerivative

  // GeomFill_PlanFunc.constructor (constructor)
  constructor(P: gp_Pnt, V: gp_Vec, C: Adaptor3d_Curve);

  // GeomFill_PlanFunc.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // GeomFill_PlanFunc.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // GeomFill_PlanFunc.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // GeomFill_PlanFunc.D2 (method)
  D2(X: number, F?: number, D1?: number, D2?: number): { F: number; D1: number; D2: number };

  // GeomFill_PlanFunc.DEDT (method)
  DEDT(X: number, DP: gp_Vec, DV: gp_Vec, DF?: number): { DF: number };

  // GeomFill_PlanFunc.D2E (method)
  D2E(X: number, DP: gp_Vec, D2P: gp_Vec, DV: gp_Vec, D2V: gp_Vec, DFDT?: number, D2FDT2?: number, D2FDTDX?: number): { DFDT: number; D2FDT2: number; D2FDTDX: number };

  // GeomFill_PlanFunc.delete (method)
  delete(): void;

  // GeomFill_PlanFunc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_PolynomialConvertor: declare class GeomFill_PolynomialConvertor

  // GeomFill_PolynomialConvertor.constructor (constructor)
  constructor();

  // GeomFill_PolynomialConvertor.Initialized (method)
  Initialized(): boolean;

  // GeomFill_PolynomialConvertor.Init (method)
  Init(): void;

  // GeomFill_PolynomialConvertor.Section (method)
  Section(FirstPnt: gp_Pnt, Center: gp_Pnt, Dir: gp_Vec, Angle: number, Poles: NCollection_Array1_gp_Pnt): void;
  Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, Angle: number, DAngle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec): void;
  Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, D2FirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, D2Dir: gp_Vec, Angle: number, DAngle: number, D2Angle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec): void;

  // GeomFill_PolynomialConvertor.delete (method)
  delete(): void;

  // GeomFill_PolynomialConvertor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Profiler: declare class GeomFill_Profiler

  // GeomFill_Profiler.constructor (constructor)
  constructor();

  // GeomFill_Profiler.AddCurve (method)
  AddCurve(Curve: Geom_Curve): void;

  // GeomFill_Profiler.Perform (method)
  Perform(PTol: number): void;

  // GeomFill_Profiler.Degree (method)
  Degree(): number;

  // GeomFill_Profiler.IsPeriodic (method)
  IsPeriodic(): boolean;

  // GeomFill_Profiler.NbPoles (method)
  NbPoles(): number;

  // GeomFill_Profiler.Poles (method)
  Poles(Index: number, Poles: NCollection_Array1_gp_Pnt): void;

  // GeomFill_Profiler.Weights (method)
  Weights(Index: number, Weights: NCollection_Array1_double): void;

  // GeomFill_Profiler.NbKnots (method)
  NbKnots(): number;

  // GeomFill_Profiler.KnotsAndMults (method)
  KnotsAndMults(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int): void;

  // GeomFill_Profiler.Curve (method)
  Curve(Index: number): Geom_Curve;

  // GeomFill_Profiler.delete (method)
  delete(): void;

  // GeomFill_Profiler.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_QuasiAngularConvertor: declare class GeomFill_QuasiAngularConvertor

  // GeomFill_QuasiAngularConvertor.constructor (constructor)
  constructor();

  // GeomFill_QuasiAngularConvertor.Initialized (method)
  Initialized(): boolean;

  // GeomFill_QuasiAngularConvertor.Init (method)
  Init(): void;

  // GeomFill_QuasiAngularConvertor.Section (method)
  Section(FirstPnt: gp_Pnt, Center: gp_Pnt, Dir: gp_Vec, Angle: number, Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double): void;
  Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, Angle: number, DAngle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weights: NCollection_Array1_double, DWeights: NCollection_Array1_double): void;
  Section(FirstPnt: gp_Pnt, DFirstPnt: gp_Vec, D2FirstPnt: gp_Vec, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Dir: gp_Vec, DDir: gp_Vec, D2Dir: gp_Vec, Angle: number, DAngle: number, D2Angle: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weights: NCollection_Array1_double, DWeights: NCollection_Array1_double, D2Weights: NCollection_Array1_double): void;

  // GeomFill_QuasiAngularConvertor.delete (method)
  delete(): void;

  // GeomFill_QuasiAngularConvertor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
