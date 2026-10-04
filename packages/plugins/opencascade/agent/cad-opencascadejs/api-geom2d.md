# libcascade — Geom2d

16 top-level symbols. Signatures are verbatim typescript.

Geom2d_AxisPlacement: declare class Geom2d_AxisPlacement extends Geom2d_Geometry

  // Geom2d_AxisPlacement.constructor (constructor)
  constructor(A: gp_Ax2d);
  constructor(P: gp_Pnt2d, V: gp_Dir2d);

  // Geom2d_AxisPlacement.Reverse (method)
  Reverse(): void;

  // Geom2d_AxisPlacement.Reversed (method)
  Reversed(): Geom2d_AxisPlacement;

  // Geom2d_AxisPlacement.SetAxis (method)
  SetAxis(A: gp_Ax2d): void;

  // Geom2d_AxisPlacement.SetDirection (method)
  SetDirection(V: gp_Dir2d): void;

  // Geom2d_AxisPlacement.SetLocation (method)
  SetLocation(P: gp_Pnt2d): void;

  // Geom2d_AxisPlacement.Angle (method)
  Angle(Other: Geom2d_AxisPlacement): number;

  // Geom2d_AxisPlacement.Ax2d (method)
  Ax2d(): gp_Ax2d;

  // Geom2d_AxisPlacement.Direction (method)
  Direction(): gp_Dir2d;

  // Geom2d_AxisPlacement.Location (method)
  Location(): gp_Pnt2d;

  // Geom2d_AxisPlacement.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_AxisPlacement.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_AxisPlacement.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_AxisPlacement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_AxisPlacement.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_AxisPlacement.delete (method)
  delete(): void;

  // Geom2d_AxisPlacement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_BSplineCurve: declare class Geom2d_BSplineCurve extends Geom2d_BoundedCurve

  // Geom2d_BSplineCurve.constructor (constructor)
  constructor(theOther: Geom2d_BSplineCurve);
  constructor(Poles: NCollection_Array1_gp_Pnt2d, Knots: NCollection_Array1_double, Multiplicities: NCollection_Array1_int, Degree: number, Periodic?: boolean);
  constructor(Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double, Knots: NCollection_Array1_double, Multiplicities: NCollection_Array1_int, Degree: number, Periodic?: boolean);

  // Geom2d_BSplineCurve.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom2d_BSplineCurve.EvalRepresentation (method)
  EvalRepresentation(): Geom2dEval_RepCurveDesc_Base;

  // Geom2d_BSplineCurve.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: Geom2dEval_RepCurveDesc_Base): void;

  // Geom2d_BSplineCurve.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom2d_BSplineCurve.IncreaseDegree (method)
  IncreaseDegree(Degree: number): void;

  // Geom2d_BSplineCurve.IncreaseMultiplicity (method)
  IncreaseMultiplicity(Index: number, M: number): void;
  IncreaseMultiplicity(I1: number, I2: number, M: number): void;

  // Geom2d_BSplineCurve.IncrementMultiplicity (method)
  IncrementMultiplicity(I1: number, I2: number, M: number): void;

  // Geom2d_BSplineCurve.InsertKnot (method)
  InsertKnot(U: number, M?: number, ParametricTolerance?: number): void;

  // Geom2d_BSplineCurve.InsertKnots (method)
  InsertKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

  // Geom2d_BSplineCurve.RemoveKnot (method)
  RemoveKnot(Index: number, M: number, Tolerance: number): boolean;

  // Geom2d_BSplineCurve.InsertPoleAfter (method)
  InsertPoleAfter(Index: number, P: gp_Pnt2d, Weight?: number): void;

  // Geom2d_BSplineCurve.InsertPoleBefore (method)
  InsertPoleBefore(Index: number, P: gp_Pnt2d, Weight?: number): void;

  // Geom2d_BSplineCurve.RemovePole (method)
  RemovePole(Index: number): void;

  // Geom2d_BSplineCurve.Reverse (method)
  Reverse(): void;

  // Geom2d_BSplineCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_BSplineCurve.Segment (method)
  Segment(U1: number, U2: number, theTolerance?: number): void;

  // Geom2d_BSplineCurve.SetKnot (method)
  SetKnot(Index: number, K: number): void;
  SetKnot(Index: number, K: number, M: number): void;

  // Geom2d_BSplineCurve.SetKnots (method)
  SetKnots(K: NCollection_Array1_double): void;

  // Geom2d_BSplineCurve.PeriodicNormalization (method)
  PeriodicNormalization(U?: number): { U: number };

  // Geom2d_BSplineCurve.SetPeriodic (method)
  SetPeriodic(): void;

  // Geom2d_BSplineCurve.SetOrigin (method)
  SetOrigin(Index: number): void;

  // Geom2d_BSplineCurve.SetNotPeriodic (method)
  SetNotPeriodic(): void;

  // Geom2d_BSplineCurve.SetPole (method)
  SetPole(Index: number, P: gp_Pnt2d): void;
  SetPole(Index: number, P: gp_Pnt2d, Weight: number): void;

  // Geom2d_BSplineCurve.SetWeight (method)
  SetWeight(Index: number, Weight: number): void;

  // Geom2d_BSplineCurve.MovePoint (method)
  MovePoint(U: number, P: gp_Pnt2d, Index1: number, Index2: number, FirstModifiedPole?: number, LastModifiedPole?: number): { FirstModifiedPole: number; LastModifiedPole: number };

  // Geom2d_BSplineCurve.MovePointAndTangent (method)
  MovePointAndTangent(U: number, P: gp_Pnt2d, Tangent: gp_Vec2d, Tolerance: number, StartingCondition: number, EndingCondition: number, ErrorStatus?: number): { ErrorStatus: number };

  // Geom2d_BSplineCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2d_BSplineCurve.IsG1 (method)
  IsG1(theTf: number, theTl: number, theAngTol: number): boolean;

  // Geom2d_BSplineCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2d_BSplineCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2d_BSplineCurve.IsRational (method)
  IsRational(): boolean;

  // Geom2d_BSplineCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2d_BSplineCurve.Degree (method)
  Degree(): number;

  // Geom2d_BSplineCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2d_BSplineCurve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2d_BSplineCurve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2d_BSplineCurve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2d_BSplineCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2d_BSplineCurve.LocalValue (method)
  LocalValue(U: number, FromK1: number, ToK2: number): gp_Pnt2d;

  // Geom2d_BSplineCurve.LocalD0 (method)
  LocalD0(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d): void;

  // Geom2d_BSplineCurve.LocalD1 (method)
  LocalD1(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

  // Geom2d_BSplineCurve.LocalD2 (method)
  LocalD2(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // Geom2d_BSplineCurve.LocalD3 (method)
  LocalD3(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // Geom2d_BSplineCurve.LocalDN (method)
  LocalDN(U: number, FromK1: number, ToK2: number, N: number): gp_Vec2d;

  // Geom2d_BSplineCurve.EndPoint (method)
  EndPoint(): gp_Pnt2d;

  // Geom2d_BSplineCurve.FirstUKnotIndex (method)
  FirstUKnotIndex(): number;

  // Geom2d_BSplineCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2d_BSplineCurve.Knot (method)
  Knot(Index: number): number;

  // DEPRECATED
  // Geom2d_BSplineCurve.Knots (method)
  Knots(K: NCollection_Array1_double): void;
  Knots(): NCollection_Array1_double;

  // DEPRECATED
  // Geom2d_BSplineCurve.KnotSequence (method)
  KnotSequence(K: NCollection_Array1_double): void;
  KnotSequence(): NCollection_Array1_double;

  // Geom2d_BSplineCurve.KnotDistribution (method)
  KnotDistribution(): GeomAbs_BSplKnotDistribution;

  // Geom2d_BSplineCurve.LastUKnotIndex (method)
  LastUKnotIndex(): number;

  // Geom2d_BSplineCurve.LastParameter (method)
  LastParameter(): number;

  // Geom2d_BSplineCurve.LocateU (method)
  LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

  // Geom2d_BSplineCurve.Multiplicity (method)
  Multiplicity(Index: number): number;

  // DEPRECATED
  // Geom2d_BSplineCurve.Multiplicities (method)
  Multiplicities(M: NCollection_Array1_int): void;
  Multiplicities(): NCollection_Array1_int;

  // Geom2d_BSplineCurve.NbKnots (method)
  NbKnots(): number;

  // Geom2d_BSplineCurve.NbPoles (method)
  NbPoles(): number;

  // Geom2d_BSplineCurve.Pole (method)
  Pole(Index: number): gp_Pnt2d;

  // DEPRECATED
  // Geom2d_BSplineCurve.Poles (method)
  Poles(P: NCollection_Array1_gp_Pnt2d): void;
  Poles(): NCollection_Array1_gp_Pnt2d;

  // Geom2d_BSplineCurve.StartPoint (method)
  StartPoint(): gp_Pnt2d;

  // Geom2d_BSplineCurve.Weight (method)
  Weight(Index: number): number;

  // DEPRECATED
  // Geom2d_BSplineCurve.Weights (method)
  Weights(W: NCollection_Array1_double): void;
  Weights(): NCollection_Array1_double;

  // Geom2d_BSplineCurve.WeightsArray (method)
  WeightsArray(): NCollection_Array1_double;

  // Geom2d_BSplineCurve.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_BSplineCurve.MaxDegree (method)
  static MaxDegree(): number;

  // Geom2d_BSplineCurve.Resolution (method)
  Resolution(ToleranceUV: number, UTolerance?: number): { UTolerance: number };

  // Geom2d_BSplineCurve.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_BSplineCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_BSplineCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_BSplineCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_BSplineCurve.delete (method)
  delete(): void;

  // Geom2d_BSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_BezierCurve: declare class Geom2d_BezierCurve extends Geom2d_BoundedCurve

  // Geom2d_BezierCurve.constructor (constructor)
  constructor(CurvePoles: NCollection_Array1_gp_Pnt2d);
  constructor(theOther: Geom2d_BezierCurve);
  constructor(CurvePoles: NCollection_Array1_gp_Pnt2d, PoleWeights: NCollection_Array1_double);

  // Geom2d_BezierCurve.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom2d_BezierCurve.EvalRepresentation (method)
  EvalRepresentation(): Geom2dEval_RepCurveDesc_Base;

  // Geom2d_BezierCurve.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: Geom2dEval_RepCurveDesc_Base): void;

  // Geom2d_BezierCurve.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom2d_BezierCurve.Increase (method)
  Increase(Degree: number): void;

  // Geom2d_BezierCurve.InsertPoleAfter (method)
  InsertPoleAfter(Index: number, P: gp_Pnt2d, Weight?: number): void;

  // Geom2d_BezierCurve.InsertPoleBefore (method)
  InsertPoleBefore(Index: number, P: gp_Pnt2d, Weight?: number): void;

  // Geom2d_BezierCurve.RemovePole (method)
  RemovePole(Index: number): void;

  // Geom2d_BezierCurve.Reverse (method)
  Reverse(): void;

  // Geom2d_BezierCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_BezierCurve.Segment (method)
  Segment(U1: number, U2: number): void;

  // Geom2d_BezierCurve.SetPole (method)
  SetPole(Index: number, P: gp_Pnt2d): void;
  SetPole(Index: number, P: gp_Pnt2d, Weight: number): void;

  // Geom2d_BezierCurve.SetWeight (method)
  SetWeight(Index: number, Weight: number): void;

  // Geom2d_BezierCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2d_BezierCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2d_BezierCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2d_BezierCurve.IsRational (method)
  IsRational(): boolean;

  // Geom2d_BezierCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2d_BezierCurve.Degree (method)
  Degree(): number;

  // Geom2d_BezierCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2d_BezierCurve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2d_BezierCurve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2d_BezierCurve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2d_BezierCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2d_BezierCurve.EndPoint (method)
  EndPoint(): gp_Pnt2d;

  // Geom2d_BezierCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2d_BezierCurve.LastParameter (method)
  LastParameter(): number;

  // Geom2d_BezierCurve.NbPoles (method)
  NbPoles(): number;

  // Geom2d_BezierCurve.Pole (method)
  Pole(Index: number): gp_Pnt2d;

  // DEPRECATED
  // Geom2d_BezierCurve.Poles (method)
  Poles(P: NCollection_Array1_gp_Pnt2d): void;
  Poles(): NCollection_Array1_gp_Pnt2d;

  // Geom2d_BezierCurve.StartPoint (method)
  StartPoint(): gp_Pnt2d;

  // Geom2d_BezierCurve.Weight (method)
  Weight(Index: number): number;

  // DEPRECATED
  // Geom2d_BezierCurve.Weights (method)
  Weights(W: NCollection_Array1_double): void;
  Weights(): NCollection_Array1_double;

  // Geom2d_BezierCurve.WeightsArray (method)
  WeightsArray(): NCollection_Array1_double;

  // Geom2d_BezierCurve.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_BezierCurve.MaxDegree (method)
  static MaxDegree(): number;

  // Geom2d_BezierCurve.Resolution (method)
  Resolution(ToleranceUV: number, UTolerance?: number): { UTolerance: number };

  // Geom2d_BezierCurve.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_BezierCurve.Knots (method)
  Knots(): NCollection_Array1_double;

  // Geom2d_BezierCurve.Multiplicities (method)
  Multiplicities(): NCollection_Array1_int;

  // Geom2d_BezierCurve.KnotSequence (method)
  KnotSequence(): NCollection_Array1_double;

  // Geom2d_BezierCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_BezierCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_BezierCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_BezierCurve.delete (method)
  delete(): void;

  // Geom2d_BezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_BoundedCurve: declare class Geom2d_BoundedCurve extends Geom2d_Curve

  // Geom2d_BoundedCurve.EndPoint (method)
  EndPoint(): gp_Pnt2d;

  // Geom2d_BoundedCurve.StartPoint (method)
  StartPoint(): gp_Pnt2d;

  // Geom2d_BoundedCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_BoundedCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_BoundedCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_BoundedCurve.delete (method)
  delete(): void;

  // Geom2d_BoundedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_CartesianPoint: declare class Geom2d_CartesianPoint extends Geom2d_Point

  // Geom2d_CartesianPoint.constructor (constructor)
  constructor(P: gp_Pnt2d);
  constructor(X: number, Y: number);

  // Geom2d_CartesianPoint.SetCoord (method)
  SetCoord(X: number, Y: number): void;

  // Geom2d_CartesianPoint.SetPnt2d (method)
  SetPnt2d(P: gp_Pnt2d): void;

  // Geom2d_CartesianPoint.SetX (method)
  SetX(X: number): void;

  // Geom2d_CartesianPoint.SetY (method)
  SetY(Y: number): void;

  // Geom2d_CartesianPoint.Coord (method)
  Coord(X: number, Y: number): { X: number; Y: number };

  // Geom2d_CartesianPoint.Pnt2d (method)
  Pnt2d(): gp_Pnt2d;

  // Geom2d_CartesianPoint.X (method)
  X(): number;

  // Geom2d_CartesianPoint.Y (method)
  Y(): number;

  // Geom2d_CartesianPoint.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_CartesianPoint.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_CartesianPoint.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_CartesianPoint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_CartesianPoint.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_CartesianPoint.delete (method)
  delete(): void;

  // Geom2d_CartesianPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Circle: declare class Geom2d_Circle extends Geom2d_Conic

  // Geom2d_Circle.constructor (constructor)
  constructor(C: gp_Circ2d);
  constructor(A: gp_Ax22d, Radius: number);
  constructor(A: gp_Ax2d, Radius: number, Sense?: boolean);

  // Geom2d_Circle.SetCirc2d (method)
  SetCirc2d(C: gp_Circ2d): void;

  // Geom2d_Circle.SetRadius (method)
  SetRadius(R: number): void;

  // Geom2d_Circle.Circ2d (method)
  Circ2d(): gp_Circ2d;

  // Geom2d_Circle.Radius (method)
  Radius(): number;

  // Geom2d_Circle.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_Circle.Eccentricity (method)
  Eccentricity(): number;

  // Geom2d_Circle.FirstParameter (method)
  FirstParameter(): number;

  // Geom2d_Circle.LastParameter (method)
  LastParameter(): number;

  // Geom2d_Circle.IsClosed (method)
  IsClosed(): boolean;

  // Geom2d_Circle.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2d_Circle.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2d_Circle.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2d_Circle.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2d_Circle.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2d_Circle.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2d_Circle.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_Circle.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_Circle.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Circle.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Circle.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Circle.delete (method)
  delete(): void;

  // Geom2d_Circle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Conic: declare class Geom2d_Conic extends Geom2d_Curve

  // Geom2d_Conic.SetAxis (method)
  SetAxis(theA: gp_Ax22d): void;

  // Geom2d_Conic.SetXAxis (method)
  SetXAxis(theAX: gp_Ax2d): void;

  // Geom2d_Conic.SetYAxis (method)
  SetYAxis(theAY: gp_Ax2d): void;

  // Geom2d_Conic.SetLocation (method)
  SetLocation(theP: gp_Pnt2d): void;

  // Geom2d_Conic.XAxis (method)
  XAxis(): gp_Ax2d;

  // Geom2d_Conic.YAxis (method)
  YAxis(): gp_Ax2d;

  // Geom2d_Conic.Eccentricity (method)
  Eccentricity(): number;

  // Geom2d_Conic.Location (method)
  Location(): gp_Pnt2d;

  // Geom2d_Conic.Position (method)
  Position(): gp_Ax22d;

  // Geom2d_Conic.Reverse (method)
  Reverse(): void;

  // Geom2d_Conic.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_Conic.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2d_Conic.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2d_Conic.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Conic.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Conic.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Conic.delete (method)
  delete(): void;

  // Geom2d_Conic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Curve: declare class Geom2d_Curve extends Geom2d_Geometry

  // Geom2d_Curve.Reverse (method)
  Reverse(): void;

  // Geom2d_Curve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_Curve.TransformedParameter (method)
  TransformedParameter(U: number, T: gp_Trsf2d): number;

  // Geom2d_Curve.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf2d): number;

  // Geom2d_Curve.Reversed (method)
  Reversed(): Geom2d_Curve;

  // Geom2d_Curve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2d_Curve.LastParameter (method)
  LastParameter(): number;

  // Geom2d_Curve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2d_Curve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2d_Curve.Period (method)
  Period(): number;

  // Geom2d_Curve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2d_Curve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2d_Curve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2d_Curve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2d_Curve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2d_Curve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2d_Curve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2d_Curve.D0 (method)
  D0(U: number, P: gp_Pnt2d): void;

  // Geom2d_Curve.D1 (method)
  D1(U: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

  // Geom2d_Curve.D2 (method)
  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // Geom2d_Curve.D3 (method)
  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // Geom2d_Curve.DN (method)
  DN(U: number, N: number): gp_Vec2d;

  // Geom2d_Curve.Value (method)
  Value(U: number): gp_Pnt2d;

  // Geom2d_Curve.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Curve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Curve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Curve.delete (method)
  delete(): void;

  // Geom2d_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Direction: declare class Geom2d_Direction extends Geom2d_Vector

  // Geom2d_Direction.constructor (constructor)
  constructor(V: gp_Dir2d);
  constructor(X: number, Y: number);

  // Geom2d_Direction.SetCoord (method)
  SetCoord(X: number, Y: number): void;

  // Geom2d_Direction.SetDir2d (method)
  SetDir2d(V: gp_Dir2d): void;

  // Geom2d_Direction.SetX (method)
  SetX(X: number): void;

  // Geom2d_Direction.SetY (method)
  SetY(Y: number): void;

  // Geom2d_Direction.Dir2d (method)
  Dir2d(): gp_Dir2d;

  // Geom2d_Direction.Magnitude (method)
  Magnitude(): number;

  // Geom2d_Direction.SquareMagnitude (method)
  SquareMagnitude(): number;

  // Geom2d_Direction.Crossed (method)
  Crossed(Other: Geom2d_Vector): number;

  // Geom2d_Direction.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_Direction.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_Direction.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Direction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Direction.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Direction.delete (method)
  delete(): void;

  // Geom2d_Direction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Ellipse: declare class Geom2d_Ellipse extends Geom2d_Conic

  // Geom2d_Ellipse.constructor (constructor)
  constructor(E: gp_Elips2d);
  constructor(Axis: gp_Ax22d, MajorRadius: number, MinorRadius: number);
  constructor(MajorAxis: gp_Ax2d, MajorRadius: number, MinorRadius: number, Sense?: boolean);

  // Geom2d_Ellipse.SetElips2d (method)
  SetElips2d(E: gp_Elips2d): void;

  // Geom2d_Ellipse.SetMajorRadius (method)
  SetMajorRadius(MajorRadius: number): void;

  // Geom2d_Ellipse.SetMinorRadius (method)
  SetMinorRadius(MinorRadius: number): void;

  // Geom2d_Ellipse.Elips2d (method)
  Elips2d(): gp_Elips2d;

  // Geom2d_Ellipse.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_Ellipse.Directrix1 (method)
  Directrix1(): gp_Ax2d;

  // Geom2d_Ellipse.Directrix2 (method)
  Directrix2(): gp_Ax2d;

  // Geom2d_Ellipse.Eccentricity (method)
  Eccentricity(): number;

  // Geom2d_Ellipse.Focal (method)
  Focal(): number;

  // Geom2d_Ellipse.Focus1 (method)
  Focus1(): gp_Pnt2d;

  // Geom2d_Ellipse.Focus2 (method)
  Focus2(): gp_Pnt2d;

  // Geom2d_Ellipse.MajorRadius (method)
  MajorRadius(): number;

  // Geom2d_Ellipse.MinorRadius (method)
  MinorRadius(): number;

  // Geom2d_Ellipse.Parameter (method)
  Parameter(): number;

  // Geom2d_Ellipse.FirstParameter (method)
  FirstParameter(): number;

  // Geom2d_Ellipse.LastParameter (method)
  LastParameter(): number;

  // Geom2d_Ellipse.IsClosed (method)
  IsClosed(): boolean;

  // Geom2d_Ellipse.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2d_Ellipse.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2d_Ellipse.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2d_Ellipse.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2d_Ellipse.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2d_Ellipse.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2d_Ellipse.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_Ellipse.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_Ellipse.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Ellipse.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Ellipse.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Ellipse.delete (method)
  delete(): void;

  // Geom2d_Ellipse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Geometry: declare class Geom2d_Geometry extends Standard_Transient

  // Geom2d_Geometry.Mirror (method)
  Mirror(P: gp_Pnt2d): void;
  Mirror(A: gp_Ax2d): void;

  // Geom2d_Geometry.Rotate (method)
  Rotate(P: gp_Pnt2d, Ang: number): void;

  // Geom2d_Geometry.Scale (method)
  Scale(P: gp_Pnt2d, S: number): void;

  // Geom2d_Geometry.Translate (method)
  Translate(V: gp_Vec2d): void;
  Translate(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  // Geom2d_Geometry.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_Geometry.Mirrored (method)
  Mirrored(P: gp_Pnt2d): Geom2d_Geometry;
  Mirrored(A: gp_Ax2d): Geom2d_Geometry;

  // Geom2d_Geometry.Rotated (method)
  Rotated(P: gp_Pnt2d, Ang: number): Geom2d_Geometry;

  // Geom2d_Geometry.Scaled (method)
  Scaled(P: gp_Pnt2d, S: number): Geom2d_Geometry;

  // Geom2d_Geometry.Transformed (method)
  Transformed(T: gp_Trsf2d): Geom2d_Geometry;

  // Geom2d_Geometry.Translated (method)
  Translated(V: gp_Vec2d): Geom2d_Geometry;
  Translated(P1: gp_Pnt2d, P2: gp_Pnt2d): Geom2d_Geometry;

  // Geom2d_Geometry.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_Geometry.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Geometry.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Geometry.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Geometry.delete (method)
  delete(): void;

  // Geom2d_Geometry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Hyperbola: declare class Geom2d_Hyperbola extends Geom2d_Conic

  // Geom2d_Hyperbola.constructor (constructor)
  constructor(H: gp_Hypr2d);
  constructor(Axis: gp_Ax22d, MajorRadius: number, MinorRadius: number);
  constructor(MajorAxis: gp_Ax2d, MajorRadius: number, MinorRadius: number, Sense?: boolean);

  // Geom2d_Hyperbola.SetHypr2d (method)
  SetHypr2d(H: gp_Hypr2d): void;

  // Geom2d_Hyperbola.SetMajorRadius (method)
  SetMajorRadius(MajorRadius: number): void;

  // Geom2d_Hyperbola.SetMinorRadius (method)
  SetMinorRadius(MinorRadius: number): void;

  // Geom2d_Hyperbola.Hypr2d (method)
  Hypr2d(): gp_Hypr2d;

  // Geom2d_Hyperbola.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_Hyperbola.FirstParameter (method)
  FirstParameter(): number;

  // Geom2d_Hyperbola.LastParameter (method)
  LastParameter(): number;

  // Geom2d_Hyperbola.IsClosed (method)
  IsClosed(): boolean;

  // Geom2d_Hyperbola.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2d_Hyperbola.Asymptote1 (method)
  Asymptote1(): gp_Ax2d;

  // Geom2d_Hyperbola.Asymptote2 (method)
  Asymptote2(): gp_Ax2d;

  // Geom2d_Hyperbola.ConjugateBranch1 (method)
  ConjugateBranch1(): gp_Hypr2d;

  // Geom2d_Hyperbola.ConjugateBranch2 (method)
  ConjugateBranch2(): gp_Hypr2d;

  // Geom2d_Hyperbola.Directrix1 (method)
  Directrix1(): gp_Ax2d;

  // Geom2d_Hyperbola.Directrix2 (method)
  Directrix2(): gp_Ax2d;

  // Geom2d_Hyperbola.Eccentricity (method)
  Eccentricity(): number;

  // Geom2d_Hyperbola.Focal (method)
  Focal(): number;

  // Geom2d_Hyperbola.Focus1 (method)
  Focus1(): gp_Pnt2d;

  // Geom2d_Hyperbola.Focus2 (method)
  Focus2(): gp_Pnt2d;

  // Geom2d_Hyperbola.MajorRadius (method)
  MajorRadius(): number;

  // Geom2d_Hyperbola.MinorRadius (method)
  MinorRadius(): number;

  // Geom2d_Hyperbola.OtherBranch (method)
  OtherBranch(): gp_Hypr2d;

  // Geom2d_Hyperbola.Parameter (method)
  Parameter(): number;

  // Geom2d_Hyperbola.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2d_Hyperbola.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2d_Hyperbola.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2d_Hyperbola.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2d_Hyperbola.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2d_Hyperbola.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_Hyperbola.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_Hyperbola.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Hyperbola.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Hyperbola.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Hyperbola.delete (method)
  delete(): void;

  // Geom2d_Hyperbola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Line: declare class Geom2d_Line extends Geom2d_Curve

  // Geom2d_Line.constructor (constructor)
  constructor(A: gp_Ax2d);
  constructor(L: gp_Lin2d);
  constructor(P: gp_Pnt2d, V: gp_Dir2d);

  // Geom2d_Line.SetLin2d (method)
  SetLin2d(L: gp_Lin2d): void;

  // Geom2d_Line.SetDirection (method)
  SetDirection(V: gp_Dir2d): void;

  // Geom2d_Line.Direction (method)
  Direction(): gp_Dir2d;

  // Geom2d_Line.SetLocation (method)
  SetLocation(P: gp_Pnt2d): void;

  // Geom2d_Line.Location (method)
  Location(): gp_Pnt2d;

  // Geom2d_Line.SetPosition (method)
  SetPosition(A: gp_Ax2d): void;

  // Geom2d_Line.Position (method)
  Position(): gp_Ax2d;

  // Geom2d_Line.Lin2d (method)
  Lin2d(): gp_Lin2d;

  // Geom2d_Line.Reverse (method)
  Reverse(): void;

  // Geom2d_Line.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_Line.FirstParameter (method)
  FirstParameter(): number;

  // Geom2d_Line.LastParameter (method)
  LastParameter(): number;

  // Geom2d_Line.IsClosed (method)
  IsClosed(): boolean;

  // Geom2d_Line.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2d_Line.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2d_Line.Distance (method)
  Distance(P: gp_Pnt2d): number;

  // Geom2d_Line.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2d_Line.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2d_Line.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2d_Line.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2d_Line.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2d_Line.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2d_Line.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_Line.TransformedParameter (method)
  TransformedParameter(U: number, T: gp_Trsf2d): number;

  // Geom2d_Line.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf2d): number;

  // Geom2d_Line.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_Line.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Line.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Line.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Line.delete (method)
  delete(): void;

  // Geom2d_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_OffsetCurve: declare class Geom2d_OffsetCurve extends Geom2d_Curve

  // Geom2d_OffsetCurve.constructor (constructor)
  constructor(theOther: Geom2d_OffsetCurve);
  constructor(C: Geom2d_Curve, Offset: number, isNotCheckC0?: boolean);

  // Geom2d_OffsetCurve.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom2d_OffsetCurve.EvalRepresentation (method)
  EvalRepresentation(): Geom2dEval_RepCurveDesc_Base;

  // Geom2d_OffsetCurve.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: Geom2dEval_RepCurveDesc_Base): void;

  // Geom2d_OffsetCurve.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom2d_OffsetCurve.Reverse (method)
  Reverse(): void;

  // Geom2d_OffsetCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_OffsetCurve.SetBasisCurve (method)
  SetBasisCurve(C: Geom2d_Curve, isNotCheckC0?: boolean): void;

  // Geom2d_OffsetCurve.SetOffsetValue (method)
  SetOffsetValue(D: number): void;

  // Geom2d_OffsetCurve.BasisCurve (method)
  BasisCurve(): Geom2d_Curve;

  // Geom2d_OffsetCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2d_OffsetCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2d_OffsetCurve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2d_OffsetCurve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2d_OffsetCurve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2d_OffsetCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2d_OffsetCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2d_OffsetCurve.LastParameter (method)
  LastParameter(): number;

  // Geom2d_OffsetCurve.Offset (method)
  Offset(): number;

  // Geom2d_OffsetCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2d_OffsetCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2d_OffsetCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2d_OffsetCurve.Period (method)
  Period(): number;

  // Geom2d_OffsetCurve.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_OffsetCurve.TransformedParameter (method)
  TransformedParameter(U: number, T: gp_Trsf2d): number;

  // Geom2d_OffsetCurve.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf2d): number;

  // Geom2d_OffsetCurve.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_OffsetCurve.GetBasisCurveContinuity (method)
  GetBasisCurveContinuity(): GeomAbs_Shape;

  // Geom2d_OffsetCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_OffsetCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_OffsetCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_OffsetCurve.delete (method)
  delete(): void;

  // Geom2d_OffsetCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Parabola: declare class Geom2d_Parabola extends Geom2d_Conic

  // Geom2d_Parabola.constructor (constructor)
  constructor(Prb: gp_Parab2d);
  constructor(Axis: gp_Ax22d, Focal: number);
  constructor(D: gp_Ax2d, F: gp_Pnt2d);
  constructor(MirrorAxis: gp_Ax2d, Focal: number, Sense?: boolean);

  // Geom2d_Parabola.SetFocal (method)
  SetFocal(Focal: number): void;

  // Geom2d_Parabola.SetParab2d (method)
  SetParab2d(Prb: gp_Parab2d): void;

  // Geom2d_Parabola.Parab2d (method)
  Parab2d(): gp_Parab2d;

  // Geom2d_Parabola.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_Parabola.FirstParameter (method)
  FirstParameter(): number;

  // Geom2d_Parabola.LastParameter (method)
  LastParameter(): number;

  // Geom2d_Parabola.IsClosed (method)
  IsClosed(): boolean;

  // Geom2d_Parabola.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2d_Parabola.Directrix (method)
  Directrix(): gp_Ax2d;

  // Geom2d_Parabola.Eccentricity (method)
  Eccentricity(): number;

  // Geom2d_Parabola.Focus (method)
  Focus(): gp_Pnt2d;

  // Geom2d_Parabola.Focal (method)
  Focal(): number;

  // Geom2d_Parabola.Parameter (method)
  Parameter(): number;

  // Geom2d_Parabola.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2d_Parabola.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2d_Parabola.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2d_Parabola.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2d_Parabola.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2d_Parabola.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_Parabola.TransformedParameter (method)
  TransformedParameter(U: number, T: gp_Trsf2d): number;

  // Geom2d_Parabola.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf2d): number;

  // Geom2d_Parabola.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_Parabola.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Parabola.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Parabola.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Parabola.delete (method)
  delete(): void;

  // Geom2d_Parabola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Point: declare class Geom2d_Point extends Geom2d_Geometry

  // Geom2d_Point.Coord (method)
  Coord(X: number, Y: number): { X: number; Y: number };

  // Geom2d_Point.Pnt2d (method)
  Pnt2d(): gp_Pnt2d;

  // Geom2d_Point.X (method)
  X(): number;

  // Geom2d_Point.Y (method)
  Y(): number;

  // Geom2d_Point.Distance (method)
  Distance(Other: Geom2d_Point): number;

  // Geom2d_Point.SquareDistance (method)
  SquareDistance(Other: Geom2d_Point): number;

  // Geom2d_Point.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Point.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Point.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Point.delete (method)
  delete(): void;

  // Geom2d_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
