# libcascade — Geom

10 top-level symbols. Signatures are verbatim typescript.

Geom_Axis1Placement: declare class Geom_Axis1Placement extends Geom_AxisPlacement

  // Geom_Axis1Placement.constructor (constructor)
  constructor(A1: gp_Ax1);
  constructor(P: gp_Pnt, V: gp_Dir);

  // Geom_Axis1Placement.Ax1 (method)
  Ax1(): gp_Ax1;

  // Geom_Axis1Placement.Reverse (method)
  Reverse(): void;

  // Geom_Axis1Placement.Reversed (method)
  Reversed(): Geom_Axis1Placement;

  // Geom_Axis1Placement.SetDirection (method)
  SetDirection(V: gp_Dir): void;

  // Geom_Axis1Placement.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_Axis1Placement.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_Axis1Placement.get_type_name (method)
  static get_type_name(): string;

  // Geom_Axis1Placement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Axis1Placement.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Axis1Placement.delete (method)
  delete(): void;

  // Geom_Axis1Placement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Axis2Placement: declare class Geom_Axis2Placement extends Geom_AxisPlacement

  // Geom_Axis2Placement.constructor (constructor)
  constructor(A2: gp_Ax2);
  constructor(P: gp_Pnt, N: gp_Dir, Vx: gp_Dir);

  // Geom_Axis2Placement.SetAx2 (method)
  SetAx2(A2: gp_Ax2): void;

  // Geom_Axis2Placement.SetDirection (method)
  SetDirection(V: gp_Dir): void;

  // Geom_Axis2Placement.SetXDirection (method)
  SetXDirection(Vx: gp_Dir): void;

  // Geom_Axis2Placement.SetYDirection (method)
  SetYDirection(Vy: gp_Dir): void;

  // Geom_Axis2Placement.Ax2 (method)
  Ax2(): gp_Ax2;

  // Geom_Axis2Placement.XDirection (method)
  XDirection(): gp_Dir;

  // Geom_Axis2Placement.YDirection (method)
  YDirection(): gp_Dir;

  // Geom_Axis2Placement.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_Axis2Placement.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_Axis2Placement.get_type_name (method)
  static get_type_name(): string;

  // Geom_Axis2Placement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Axis2Placement.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Axis2Placement.delete (method)
  delete(): void;

  // Geom_Axis2Placement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_AxisPlacement: declare class Geom_AxisPlacement extends Geom_Geometry

  // Geom_AxisPlacement.SetAxis (method)
  SetAxis(A1: gp_Ax1): void;

  // Geom_AxisPlacement.SetDirection (method)
  SetDirection(V: gp_Dir): void;

  // Geom_AxisPlacement.SetLocation (method)
  SetLocation(P: gp_Pnt): void;

  // Geom_AxisPlacement.Angle (method)
  Angle(Other: Geom_AxisPlacement): number;

  // Geom_AxisPlacement.Axis (method)
  Axis(): gp_Ax1;

  // Geom_AxisPlacement.Direction (method)
  Direction(): gp_Dir;

  // Geom_AxisPlacement.Location (method)
  Location(): gp_Pnt;

  // Geom_AxisPlacement.get_type_name (method)
  static get_type_name(): string;

  // Geom_AxisPlacement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_AxisPlacement.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_AxisPlacement.delete (method)
  delete(): void;

  // Geom_AxisPlacement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_BSplineCurve: declare class Geom_BSplineCurve extends Geom_BoundedCurve

  // Geom_BSplineCurve.constructor (constructor)
  constructor(theOther: Geom_BSplineCurve);
  constructor(Poles: NCollection_Array1_gp_Pnt, Knots: NCollection_Array1_double, Multiplicities: NCollection_Array1_int, Degree: number, Periodic?: boolean);
  constructor(Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double, Knots: NCollection_Array1_double, Multiplicities: NCollection_Array1_int, Degree: number, Periodic?: boolean, CheckRational?: boolean);

  // Geom_BSplineCurve.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom_BSplineCurve.EvalRepresentation (method)
  EvalRepresentation(): GeomEval_RepCurveDesc_Base;

  // Geom_BSplineCurve.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: GeomEval_RepCurveDesc_Base): void;

  // Geom_BSplineCurve.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom_BSplineCurve.IncreaseDegree (method)
  IncreaseDegree(Degree: number): void;

  // Geom_BSplineCurve.IncreaseMultiplicity (method)
  IncreaseMultiplicity(Index: number, M: number): void;
  IncreaseMultiplicity(I1: number, I2: number, M: number): void;

  // Geom_BSplineCurve.IncrementMultiplicity (method)
  IncrementMultiplicity(I1: number, I2: number, M: number): void;

  // Geom_BSplineCurve.InsertKnot (method)
  InsertKnot(U: number, M?: number, ParametricTolerance?: number, Add?: boolean): void;

  // Geom_BSplineCurve.InsertKnots (method)
  InsertKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

  // Geom_BSplineCurve.RemoveKnot (method)
  RemoveKnot(Index: number, M: number, Tolerance: number): boolean;

  // Geom_BSplineCurve.Reverse (method)
  Reverse(): void;

  // Geom_BSplineCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_BSplineCurve.Segment (method)
  Segment(U1: number, U2: number, theTolerance?: number): void;

  // Geom_BSplineCurve.SetKnot (method)
  SetKnot(Index: number, K: number): void;
  SetKnot(Index: number, K: number, M: number): void;

  // Geom_BSplineCurve.SetKnots (method)
  SetKnots(K: NCollection_Array1_double): void;

  // Geom_BSplineCurve.PeriodicNormalization (method)
  PeriodicNormalization(U?: number): { U: number };

  // Geom_BSplineCurve.SetPeriodic (method)
  SetPeriodic(): void;

  // Geom_BSplineCurve.SetOrigin (method)
  SetOrigin(Index: number): void;
  SetOrigin(U: number, Tol: number): void;

  // Geom_BSplineCurve.SetNotPeriodic (method)
  SetNotPeriodic(): void;

  // Geom_BSplineCurve.SetPole (method)
  SetPole(Index: number, P: gp_Pnt): void;
  SetPole(Index: number, P: gp_Pnt, Weight: number): void;

  // Geom_BSplineCurve.SetWeight (method)
  SetWeight(Index: number, Weight: number): void;

  // Geom_BSplineCurve.MovePoint (method)
  MovePoint(U: number, P: gp_Pnt, Index1: number, Index2: number, FirstModifiedPole?: number, LastModifiedPole?: number): { FirstModifiedPole: number; LastModifiedPole: number };

  // Geom_BSplineCurve.MovePointAndTangent (method)
  MovePointAndTangent(U: number, P: gp_Pnt, Tangent: gp_Vec, Tolerance: number, StartingCondition: number, EndingCondition: number, ErrorStatus?: number): { ErrorStatus: number };

  // Geom_BSplineCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom_BSplineCurve.IsG1 (method)
  IsG1(theTf: number, theTl: number, theAngTol: number): boolean;

  // Geom_BSplineCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom_BSplineCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom_BSplineCurve.IsRational (method)
  IsRational(): boolean;

  // Geom_BSplineCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_BSplineCurve.Degree (method)
  Degree(): number;

  // Geom_BSplineCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // Geom_BSplineCurve.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // Geom_BSplineCurve.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // Geom_BSplineCurve.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // Geom_BSplineCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // Geom_BSplineCurve.LocalValue (method)
  LocalValue(U: number, FromK1: number, ToK2: number): gp_Pnt;

  // Geom_BSplineCurve.LocalD0 (method)
  LocalD0(U: number, FromK1: number, ToK2: number, P: gp_Pnt): void;

  // Geom_BSplineCurve.LocalD1 (method)
  LocalD1(U: number, FromK1: number, ToK2: number, P: gp_Pnt, V1: gp_Vec): void;

  // Geom_BSplineCurve.LocalD2 (method)
  LocalD2(U: number, FromK1: number, ToK2: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  // Geom_BSplineCurve.LocalD3 (method)
  LocalD3(U: number, FromK1: number, ToK2: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

  // Geom_BSplineCurve.LocalDN (method)
  LocalDN(U: number, FromK1: number, ToK2: number, N: number): gp_Vec;

  // Geom_BSplineCurve.EndPoint (method)
  EndPoint(): gp_Pnt;

  // Geom_BSplineCurve.FirstUKnotIndex (method)
  FirstUKnotIndex(): number;

  // Geom_BSplineCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom_BSplineCurve.Knot (method)
  Knot(Index: number): number;

  // DEPRECATED
  // Geom_BSplineCurve.Knots (method)
  Knots(K: NCollection_Array1_double): void;
  Knots(): NCollection_Array1_double;

  // DEPRECATED
  // Geom_BSplineCurve.KnotSequence (method)
  KnotSequence(K: NCollection_Array1_double): void;
  KnotSequence(): NCollection_Array1_double;

  // Geom_BSplineCurve.KnotDistribution (method)
  KnotDistribution(): GeomAbs_BSplKnotDistribution;

  // Geom_BSplineCurve.LastUKnotIndex (method)
  LastUKnotIndex(): number;

  // Geom_BSplineCurve.LastParameter (method)
  LastParameter(): number;

  // Geom_BSplineCurve.LocateU (method)
  LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

  // Geom_BSplineCurve.Multiplicity (method)
  Multiplicity(Index: number): number;

  // DEPRECATED
  // Geom_BSplineCurve.Multiplicities (method)
  Multiplicities(M: NCollection_Array1_int): void;
  Multiplicities(): NCollection_Array1_int;

  // Geom_BSplineCurve.NbKnots (method)
  NbKnots(): number;

  // Geom_BSplineCurve.NbPoles (method)
  NbPoles(): number;

  // Geom_BSplineCurve.Pole (method)
  Pole(Index: number): gp_Pnt;

  // DEPRECATED
  // Geom_BSplineCurve.Poles (method)
  Poles(P: NCollection_Array1_gp_Pnt): void;
  Poles(): NCollection_Array1_gp_Pnt;

  // Geom_BSplineCurve.StartPoint (method)
  StartPoint(): gp_Pnt;

  // Geom_BSplineCurve.Weight (method)
  Weight(Index: number): number;

  // DEPRECATED
  // Geom_BSplineCurve.Weights (method)
  Weights(W: NCollection_Array1_double): void;
  Weights(): NCollection_Array1_double;

  // Geom_BSplineCurve.WeightsArray (method)
  WeightsArray(): NCollection_Array1_double;

  // Geom_BSplineCurve.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_BSplineCurve.MaxDegree (method)
  static MaxDegree(): number;

  // Geom_BSplineCurve.Resolution (method)
  Resolution(Tolerance3D: number, UTolerance?: number): { UTolerance: number };

  // Geom_BSplineCurve.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_BSplineCurve.IsEqual (method)
  IsEqual(theOther: Geom_BSplineCurve, thePreci: number): boolean;

  // Geom_BSplineCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom_BSplineCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_BSplineCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_BSplineCurve.delete (method)
  delete(): void;

  // Geom_BSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_BSplineSurface: declare class Geom_BSplineSurface extends Geom_BoundedSurface

  // Geom_BSplineSurface.constructor (constructor)
  constructor(theOther: Geom_BSplineSurface);
  constructor(Poles: NCollection_Array2_gp_Pnt, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, UPeriodic?: boolean, VPeriodic?: boolean);
  constructor(Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, UPeriodic?: boolean, VPeriodic?: boolean);

  // Geom_BSplineSurface.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom_BSplineSurface.EvalRepresentation (method)
  EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

  // Geom_BSplineSurface.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

  // Geom_BSplineSurface.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom_BSplineSurface.ExchangeUV (method)
  ExchangeUV(): void;

  // Geom_BSplineSurface.SetUPeriodic (method)
  SetUPeriodic(): void;

  // Geom_BSplineSurface.SetVPeriodic (method)
  SetVPeriodic(): void;

  // Geom_BSplineSurface.PeriodicNormalization (method)
  PeriodicNormalization(U?: number, V?: number): { U: number; V: number };

  // Geom_BSplineSurface.SetUOrigin (method)
  SetUOrigin(Index: number): void;

  // Geom_BSplineSurface.SetVOrigin (method)
  SetVOrigin(Index: number): void;

  // Geom_BSplineSurface.SetUNotPeriodic (method)
  SetUNotPeriodic(): void;

  // Geom_BSplineSurface.SetVNotPeriodic (method)
  SetVNotPeriodic(): void;

  // Geom_BSplineSurface.UReverse (method)
  UReverse(): void;

  // Geom_BSplineSurface.VReverse (method)
  VReverse(): void;

  // Geom_BSplineSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_BSplineSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_BSplineSurface.IncreaseDegree (method)
  IncreaseDegree(UDegree: number, VDegree: number): void;

  // Geom_BSplineSurface.InsertUKnots (method)
  InsertUKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

  // Geom_BSplineSurface.InsertVKnots (method)
  InsertVKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

  // Geom_BSplineSurface.RemoveUKnot (method)
  RemoveUKnot(Index: number, M: number, Tolerance: number): boolean;

  // Geom_BSplineSurface.RemoveVKnot (method)
  RemoveVKnot(Index: number, M: number, Tolerance: number): boolean;

  // Geom_BSplineSurface.IncreaseUMultiplicity (method)
  IncreaseUMultiplicity(UIndex: number, M: number): void;
  IncreaseUMultiplicity(FromI1: number, ToI2: number, M: number): void;

  // Geom_BSplineSurface.IncrementUMultiplicity (method)
  IncrementUMultiplicity(FromI1: number, ToI2: number, Step: number): void;

  // Geom_BSplineSurface.IncreaseVMultiplicity (method)
  IncreaseVMultiplicity(VIndex: number, M: number): void;
  IncreaseVMultiplicity(FromI1: number, ToI2: number, M: number): void;

  // Geom_BSplineSurface.IncrementVMultiplicity (method)
  IncrementVMultiplicity(FromI1: number, ToI2: number, Step: number): void;

  // Geom_BSplineSurface.InsertUKnot (method)
  InsertUKnot(U: number, M: number, ParametricTolerance: number, Add?: boolean): void;

  // Geom_BSplineSurface.InsertVKnot (method)
  InsertVKnot(V: number, M: number, ParametricTolerance: number, Add?: boolean): void;

  // Geom_BSplineSurface.Segment (method)
  Segment(U1: number, U2: number, V1: number, V2: number, theUTolerance?: number, theVTolerance?: number): void;

  // Geom_BSplineSurface.CheckAndSegment (method)
  CheckAndSegment(U1: number, U2: number, V1: number, V2: number, theUTolerance?: number, theVTolerance?: number): void;

  // Geom_BSplineSurface.SetUKnot (method)
  SetUKnot(UIndex: number, K: number): void;
  SetUKnot(UIndex: number, K: number, M: number): void;

  // Geom_BSplineSurface.SetUKnots (method)
  SetUKnots(UK: NCollection_Array1_double): void;

  // Geom_BSplineSurface.SetVKnot (method)
  SetVKnot(VIndex: number, K: number): void;
  SetVKnot(VIndex: number, K: number, M: number): void;

  // Geom_BSplineSurface.SetVKnots (method)
  SetVKnots(VK: NCollection_Array1_double): void;

  // Geom_BSplineSurface.LocateU (method)
  LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

  // Geom_BSplineSurface.LocateV (method)
  LocateV(V: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

  // Geom_BSplineSurface.SetPole (method)
  SetPole(UIndex: number, VIndex: number, P: gp_Pnt): void;
  SetPole(UIndex: number, VIndex: number, P: gp_Pnt, Weight: number): void;

  // Geom_BSplineSurface.SetPoleCol (method)
  SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
  SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BSplineSurface.SetPoleRow (method)
  SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;
  SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;

  // Geom_BSplineSurface.SetWeight (method)
  SetWeight(UIndex: number, VIndex: number, Weight: number): void;

  // Geom_BSplineSurface.SetWeightCol (method)
  SetWeightCol(VIndex: number, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BSplineSurface.SetWeightRow (method)
  SetWeightRow(UIndex: number, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BSplineSurface.MovePoint (method)
  MovePoint(U: number, V: number, P: gp_Pnt, UIndex1: number, UIndex2: number, VIndex1: number, VIndex2: number, UFirstIndex?: number, ULastIndex?: number, VFirstIndex?: number, VLastIndex?: number): { UFirstIndex: number; ULastIndex: number; VFirstIndex: number; VLastIndex: number };

  // Geom_BSplineSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_BSplineSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_BSplineSurface.IsCNu (method)
  IsCNu(N: number): boolean;

  // Geom_BSplineSurface.IsCNv (method)
  IsCNv(N: number): boolean;

  // Geom_BSplineSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_BSplineSurface.IsURational (method)
  IsURational(): boolean;

  // Geom_BSplineSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_BSplineSurface.IsVRational (method)
  IsVRational(): boolean;

  // Geom_BSplineSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_BSplineSurface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_BSplineSurface.FirstUKnotIndex (method)
  FirstUKnotIndex(): number;

  // Geom_BSplineSurface.FirstVKnotIndex (method)
  FirstVKnotIndex(): number;

  // Geom_BSplineSurface.LastUKnotIndex (method)
  LastUKnotIndex(): number;

  // Geom_BSplineSurface.LastVKnotIndex (method)
  LastVKnotIndex(): number;

  // Geom_BSplineSurface.NbUKnots (method)
  NbUKnots(): number;

  // Geom_BSplineSurface.NbUPoles (method)
  NbUPoles(): number;

  // Geom_BSplineSurface.NbVKnots (method)
  NbVKnots(): number;

  // Geom_BSplineSurface.NbVPoles (method)
  NbVPoles(): number;

  // Geom_BSplineSurface.Pole (method)
  Pole(UIndex: number, VIndex: number): gp_Pnt;

  // DEPRECATED
  // Geom_BSplineSurface.Poles (method)
  Poles(P: NCollection_Array2_gp_Pnt): void;
  Poles(): NCollection_Array2_gp_Pnt;

  // Geom_BSplineSurface.UDegree (method)
  UDegree(): number;

  // Geom_BSplineSurface.UKnot (method)
  UKnot(UIndex: number): number;

  // Geom_BSplineSurface.UKnotDistribution (method)
  UKnotDistribution(): GeomAbs_BSplKnotDistribution;

  // DEPRECATED
  // Geom_BSplineSurface.UKnots (method)
  UKnots(Ku: NCollection_Array1_double): void;
  UKnots(): NCollection_Array1_double;

  // DEPRECATED
  // Geom_BSplineSurface.UKnotSequence (method)
  UKnotSequence(Ku: NCollection_Array1_double): void;
  UKnotSequence(): NCollection_Array1_double;

  // Geom_BSplineSurface.UMultiplicity (method)
  UMultiplicity(UIndex: number): number;

  // DEPRECATED
  // Geom_BSplineSurface.UMultiplicities (method)
  UMultiplicities(Mu: NCollection_Array1_int): void;
  UMultiplicities(): NCollection_Array1_int;

  // Geom_BSplineSurface.VDegree (method)
  VDegree(): number;

  // Geom_BSplineSurface.VKnot (method)
  VKnot(VIndex: number): number;

  // Geom_BSplineSurface.VKnotDistribution (method)
  VKnotDistribution(): GeomAbs_BSplKnotDistribution;

  // DEPRECATED
  // Geom_BSplineSurface.VKnots (method)
  VKnots(Kv: NCollection_Array1_double): void;
  VKnots(): NCollection_Array1_double;

  // DEPRECATED
  // Geom_BSplineSurface.VKnotSequence (method)
  VKnotSequence(Kv: NCollection_Array1_double): void;
  VKnotSequence(): NCollection_Array1_double;

  // Geom_BSplineSurface.VMultiplicity (method)
  VMultiplicity(VIndex: number): number;

  // DEPRECATED
  // Geom_BSplineSurface.VMultiplicities (method)
  VMultiplicities(Mv: NCollection_Array1_int): void;
  VMultiplicities(): NCollection_Array1_int;

  // Geom_BSplineSurface.Weight (method)
  Weight(UIndex: number, VIndex: number): number;

  // DEPRECATED
  // Geom_BSplineSurface.Weights (method)
  Weights(W: NCollection_Array2_double): void;
  Weights(): NCollection_Array2_double;

  // Geom_BSplineSurface.WeightsArray (method)
  WeightsArray(): NCollection_Array2_double;

  // Geom_BSplineSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_BSplineSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_BSplineSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_BSplineSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_BSplineSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_BSplineSurface.LocalD0 (method)
  LocalD0(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt): void;

  // Geom_BSplineSurface.LocalD1 (method)
  LocalD1(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;

  // Geom_BSplineSurface.LocalD2 (method)
  LocalD2(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec): void;

  // Geom_BSplineSurface.LocalD3 (method)
  LocalD3(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec, D3U: gp_Vec, D3V: gp_Vec, D3UUV: gp_Vec, D3UVV: gp_Vec): void;

  // Geom_BSplineSurface.LocalDN (method)
  LocalDN(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, Nu: number, Nv: number): gp_Vec;

  // Geom_BSplineSurface.LocalValue (method)
  LocalValue(U: number, V: number, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number): gp_Pnt;

  // Geom_BSplineSurface.UIso (method)
  UIso(U: number): Geom_Curve;
  UIso(U: number, CheckRational: boolean): Geom_Curve;

  // Geom_BSplineSurface.VIso (method)
  VIso(V: number): Geom_Curve;
  VIso(V: number, CheckRational: boolean): Geom_Curve;

  // Geom_BSplineSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_BSplineSurface.MaxDegree (method)
  static MaxDegree(): number;

  // Geom_BSplineSurface.Resolution (method)
  Resolution(Tolerance3D: number, UTolerance?: number, VTolerance?: number): { UTolerance: number; VTolerance: number };

  // Geom_BSplineSurface.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_BSplineSurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_BSplineSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_BSplineSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_BSplineSurface.delete (method)
  delete(): void;

  // Geom_BSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_BezierCurve: declare class Geom_BezierCurve extends Geom_BoundedCurve

  // Geom_BezierCurve.constructor (constructor)
  constructor(CurvePoles: NCollection_Array1_gp_Pnt);
  constructor(theOther: Geom_BezierCurve);
  constructor(CurvePoles: NCollection_Array1_gp_Pnt, PoleWeights: NCollection_Array1_double);

  // Geom_BezierCurve.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom_BezierCurve.EvalRepresentation (method)
  EvalRepresentation(): GeomEval_RepCurveDesc_Base;

  // Geom_BezierCurve.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: GeomEval_RepCurveDesc_Base): void;

  // Geom_BezierCurve.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom_BezierCurve.Increase (method)
  Increase(Degree: number): void;

  // Geom_BezierCurve.InsertPoleAfter (method)
  InsertPoleAfter(Index: number, P: gp_Pnt): void;
  InsertPoleAfter(Index: number, P: gp_Pnt, Weight: number): void;

  // Geom_BezierCurve.InsertPoleBefore (method)
  InsertPoleBefore(Index: number, P: gp_Pnt): void;
  InsertPoleBefore(Index: number, P: gp_Pnt, Weight: number): void;

  // Geom_BezierCurve.RemovePole (method)
  RemovePole(Index: number): void;

  // Geom_BezierCurve.Reverse (method)
  Reverse(): void;

  // Geom_BezierCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_BezierCurve.Segment (method)
  Segment(U1: number, U2: number): void;

  // Geom_BezierCurve.SetPole (method)
  SetPole(Index: number, P: gp_Pnt): void;
  SetPole(Index: number, P: gp_Pnt, Weight: number): void;

  // Geom_BezierCurve.SetWeight (method)
  SetWeight(Index: number, Weight: number): void;

  // Geom_BezierCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom_BezierCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom_BezierCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom_BezierCurve.IsRational (method)
  IsRational(): boolean;

  // Geom_BezierCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_BezierCurve.Degree (method)
  Degree(): number;

  // Geom_BezierCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // Geom_BezierCurve.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // Geom_BezierCurve.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // Geom_BezierCurve.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // Geom_BezierCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // Geom_BezierCurve.StartPoint (method)
  StartPoint(): gp_Pnt;

  // Geom_BezierCurve.EndPoint (method)
  EndPoint(): gp_Pnt;

  // Geom_BezierCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom_BezierCurve.LastParameter (method)
  LastParameter(): number;

  // Geom_BezierCurve.NbPoles (method)
  NbPoles(): number;

  // Geom_BezierCurve.Pole (method)
  Pole(Index: number): gp_Pnt;

  // DEPRECATED
  // Geom_BezierCurve.Poles (method)
  Poles(P: NCollection_Array1_gp_Pnt): void;
  Poles(): NCollection_Array1_gp_Pnt;

  // Geom_BezierCurve.Weight (method)
  Weight(Index: number): number;

  // DEPRECATED
  // Geom_BezierCurve.Weights (method)
  Weights(W: NCollection_Array1_double): void;
  Weights(): NCollection_Array1_double;

  // Geom_BezierCurve.WeightsArray (method)
  WeightsArray(): NCollection_Array1_double;

  // Geom_BezierCurve.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_BezierCurve.MaxDegree (method)
  static MaxDegree(): number;

  // Geom_BezierCurve.Resolution (method)
  Resolution(Tolerance3D: number, UTolerance?: number): { UTolerance: number };

  // Geom_BezierCurve.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_BezierCurve.Knots (method)
  Knots(): NCollection_Array1_double;

  // Geom_BezierCurve.Multiplicities (method)
  Multiplicities(): NCollection_Array1_int;

  // Geom_BezierCurve.KnotSequence (method)
  KnotSequence(): NCollection_Array1_double;

  // Geom_BezierCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom_BezierCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_BezierCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_BezierCurve.delete (method)
  delete(): void;

  // Geom_BezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_BezierSurface: declare class Geom_BezierSurface extends Geom_BoundedSurface

  // Geom_BezierSurface.constructor (constructor)
  constructor(SurfacePoles: NCollection_Array2_gp_Pnt);
  constructor(theOther: Geom_BezierSurface);
  constructor(SurfacePoles: NCollection_Array2_gp_Pnt, PoleWeights: NCollection_Array2_double);

  // Geom_BezierSurface.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom_BezierSurface.EvalRepresentation (method)
  EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

  // Geom_BezierSurface.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

  // Geom_BezierSurface.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom_BezierSurface.ExchangeUV (method)
  ExchangeUV(): void;

  // Geom_BezierSurface.Increase (method)
  Increase(UDeg: number, VDeg: number): void;

  // Geom_BezierSurface.InsertPoleColAfter (method)
  InsertPoleColAfter(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
  InsertPoleColAfter(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BezierSurface.InsertPoleColBefore (method)
  InsertPoleColBefore(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
  InsertPoleColBefore(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BezierSurface.InsertPoleRowAfter (method)
  InsertPoleRowAfter(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
  InsertPoleRowAfter(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BezierSurface.InsertPoleRowBefore (method)
  InsertPoleRowBefore(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
  InsertPoleRowBefore(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BezierSurface.RemovePoleCol (method)
  RemovePoleCol(VIndex: number): void;

  // Geom_BezierSurface.RemovePoleRow (method)
  RemovePoleRow(UIndex: number): void;

  // Geom_BezierSurface.Segment (method)
  Segment(U1: number, U2: number, V1: number, V2: number): void;

  // Geom_BezierSurface.SetPole (method)
  SetPole(UIndex: number, VIndex: number, P: gp_Pnt): void;
  SetPole(UIndex: number, VIndex: number, P: gp_Pnt, Weight: number): void;

  // Geom_BezierSurface.SetPoleCol (method)
  SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
  SetPoleCol(VIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BezierSurface.SetPoleRow (method)
  SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt): void;
  SetPoleRow(UIndex: number, CPoles: NCollection_Array1_gp_Pnt, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BezierSurface.SetWeight (method)
  SetWeight(UIndex: number, VIndex: number, Weight: number): void;

  // Geom_BezierSurface.SetWeightCol (method)
  SetWeightCol(VIndex: number, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BezierSurface.SetWeightRow (method)
  SetWeightRow(UIndex: number, CPoleWeights: NCollection_Array1_double): void;

  // Geom_BezierSurface.UReverse (method)
  UReverse(): void;

  // Geom_BezierSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_BezierSurface.VReverse (method)
  VReverse(): void;

  // Geom_BezierSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_BezierSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_BezierSurface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_BezierSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_BezierSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_BezierSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_BezierSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_BezierSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_BezierSurface.NbUPoles (method)
  NbUPoles(): number;

  // Geom_BezierSurface.NbVPoles (method)
  NbVPoles(): number;

  // Geom_BezierSurface.Pole (method)
  Pole(UIndex: number, VIndex: number): gp_Pnt;

  // DEPRECATED
  // Geom_BezierSurface.Poles (method)
  Poles(P: NCollection_Array2_gp_Pnt): void;
  Poles(): NCollection_Array2_gp_Pnt;

  // Geom_BezierSurface.UDegree (method)
  UDegree(): number;

  // Geom_BezierSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_BezierSurface.VDegree (method)
  VDegree(): number;

  // Geom_BezierSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_BezierSurface.Weight (method)
  Weight(UIndex: number, VIndex: number): number;

  // DEPRECATED
  // Geom_BezierSurface.Weights (method)
  Weights(W: NCollection_Array2_double): void;
  Weights(): NCollection_Array2_double;

  // Geom_BezierSurface.WeightsArray (method)
  WeightsArray(): NCollection_Array2_double;

  // Geom_BezierSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_BezierSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_BezierSurface.IsCNu (method)
  IsCNu(N: number): boolean;

  // Geom_BezierSurface.IsCNv (method)
  IsCNv(N: number): boolean;

  // Geom_BezierSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_BezierSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_BezierSurface.IsURational (method)
  IsURational(): boolean;

  // Geom_BezierSurface.IsVRational (method)
  IsVRational(): boolean;

  // Geom_BezierSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_BezierSurface.MaxDegree (method)
  static MaxDegree(): number;

  // Geom_BezierSurface.Resolution (method)
  Resolution(Tolerance3D: number, UTolerance?: number, VTolerance?: number): { UTolerance: number; VTolerance: number };

  // Geom_BezierSurface.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_BezierSurface.UKnots (method)
  UKnots(): NCollection_Array1_double;

  // Geom_BezierSurface.VKnots (method)
  VKnots(): NCollection_Array1_double;

  // Geom_BezierSurface.UMultiplicities (method)
  UMultiplicities(): NCollection_Array1_int;

  // Geom_BezierSurface.VMultiplicities (method)
  VMultiplicities(): NCollection_Array1_int;

  // Geom_BezierSurface.UKnotSequence (method)
  UKnotSequence(): NCollection_Array1_double;

  // Geom_BezierSurface.VKnotSequence (method)
  VKnotSequence(): NCollection_Array1_double;

  // Geom_BezierSurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_BezierSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_BezierSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_BezierSurface.delete (method)
  delete(): void;

  // Geom_BezierSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_BoundedCurve: declare class Geom_BoundedCurve extends Geom_Curve

  // Geom_BoundedCurve.EndPoint (method)
  EndPoint(): gp_Pnt;

  // Geom_BoundedCurve.StartPoint (method)
  StartPoint(): gp_Pnt;

  // Geom_BoundedCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom_BoundedCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_BoundedCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_BoundedCurve.delete (method)
  delete(): void;

  // Geom_BoundedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_BoundedSurface: declare class Geom_BoundedSurface extends Geom_Surface

  // Geom_BoundedSurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_BoundedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_BoundedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_BoundedSurface.delete (method)
  delete(): void;

  // Geom_BoundedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_CartesianPoint: declare class Geom_CartesianPoint extends Geom_Point

  // Geom_CartesianPoint.constructor (constructor)
  constructor(P: gp_Pnt);
  constructor(X: number, Y: number, Z: number);

  // Geom_CartesianPoint.SetCoord (method)
  SetCoord(X: number, Y: number, Z: number): void;

  // Geom_CartesianPoint.SetPnt (method)
  SetPnt(P: gp_Pnt): void;

  // Geom_CartesianPoint.SetX (method)
  SetX(X: number): void;

  // Geom_CartesianPoint.SetY (method)
  SetY(Y: number): void;

  // Geom_CartesianPoint.SetZ (method)
  SetZ(Z: number): void;

  // Geom_CartesianPoint.Coord (method)
  Coord(X: number, Y: number, Z: number): { X: number; Y: number; Z: number };

  // Geom_CartesianPoint.Pnt (method)
  Pnt(): gp_Pnt;

  // Geom_CartesianPoint.X (method)
  X(): number;

  // Geom_CartesianPoint.Y (method)
  Y(): number;

  // Geom_CartesianPoint.Z (method)
  Z(): number;

  // Geom_CartesianPoint.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_CartesianPoint.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_CartesianPoint.get_type_name (method)
  static get_type_name(): string;

  // Geom_CartesianPoint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_CartesianPoint.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_CartesianPoint.delete (method)
  delete(): void;

  // Geom_CartesianPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
