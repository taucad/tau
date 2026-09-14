# libcascade — GeomFill (4)

3 top-level symbols. Signatures are verbatim typescript.

GeomFill_UniformSection: declare class GeomFill_UniformSection extends GeomFill_SectionLaw

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

GeomFill_Gordon_BuildReport: interface GeomFill_Gordon_BuildReport

  Status: GeomFill_Gordon_ResultStatus

  FailedStage: GeomFill_Gordon_BuildStage

  IsApproximate: boolean

  MaxContactGap: number

  MaxReparametrizationDeviation: number

  MaxProfileDeviation: number

  MaxGuideDeviation: number

  MaxApproximationDeviation: number

GeomFill_SequenceOfTrsf: NCollection_Sequence_gp_Trsf
