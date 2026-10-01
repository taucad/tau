# build123d — Geom

2 top-level symbols. Signatures are verbatim python.

// Definition of the B_spline curve
Geom_BSplineCurve

  // __init__(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BSplineCurve.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Geom.Geom_BSplineCurve, Poles: OCP.OCP.TColgp.TColgp_Array1OfPnt, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Multiplicities: OCP.OCP.TColStd.TColStd_Array1OfInteger, Degree: int, Periodic: bool = False) -> None
  __init__(self: OCP.OCP.Geom.Geom_BSplineCurve, Poles: OCP.OCP.TColgp.TColgp_Array1OfPnt, Weights: OCP.OCP.TColStd.TColStd_Array1OfReal, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Multiplicities: OCP.OCP.TColStd.TColStd_Array1OfInteger, Degree: int, Periodic: bool = False, CheckRational: bool = True) -> None

  // IncreaseDegree(self
  // OCP.OCP.Geom.Geom_BSplineCurve.IncreaseDegree (method)
  IncreaseDegree(self: OCP.OCP.Geom.Geom_BSplineCurve, Degree: int) -> None

  // IncreaseMultiplicity(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BSplineCurve.IncreaseMultiplicity (method)
  IncreaseMultiplicity(*args, **kwargs)
  IncreaseMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, M: int) -> None
  IncreaseMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, I1: int, I2: int, M: int) -> None

  // IncrementMultiplicity(self
  // OCP.OCP.Geom.Geom_BSplineCurve.IncrementMultiplicity (method)
  IncrementMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, I1: int, I2: int, M: int) -> None

  // InsertKnot(self
  // OCP.OCP.Geom.Geom_BSplineCurve.InsertKnot (method)
  InsertKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, M: int = 1, ParametricTolerance: float = 0.0, Add: bool = True) -> None

  // InsertKnots(self
  // OCP.OCP.Geom.Geom_BSplineCurve.InsertKnots (method)
  InsertKnots(self: OCP.OCP.Geom.Geom_BSplineCurve, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Mults: OCP.OCP.TColStd.TColStd_Array1OfInteger, ParametricTolerance: float = 0.0, Add: bool = False) -> None

  // RemoveKnot(self
  // OCP.OCP.Geom.Geom_BSplineCurve.RemoveKnot (method)
  RemoveKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, M: int, Tolerance: float) -> bool

  // Reverse(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Reverse (method)
  Reverse(self: OCP.OCP.Geom.Geom_BSplineCurve) -> None

  // ReversedParameter(self
  // OCP.OCP.Geom.Geom_BSplineCurve.ReversedParameter (method)
  ReversedParameter(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float) -> float

  // Segment(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Segment (method)
  Segment(self: OCP.OCP.Geom.Geom_BSplineCurve, U1: float, U2: float, theTolerance: float = 1e-09) -> None

  // SetKnot(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BSplineCurve.SetKnot (method)
  SetKnot(*args, **kwargs)
  SetKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, K: float) -> None
  SetKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, K: float, M: int) -> None

  // SetKnots(self
  // OCP.OCP.Geom.Geom_BSplineCurve.SetKnots (method)
  SetKnots(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // SetPeriodic(self
  // OCP.OCP.Geom.Geom_BSplineCurve.SetPeriodic (method)
  SetPeriodic(self: OCP.OCP.Geom.Geom_BSplineCurve) -> None

  // SetOrigin(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BSplineCurve.SetOrigin (method)
  SetOrigin(*args, **kwargs)
  SetOrigin(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> None
  SetOrigin(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, Tol: float) -> None

  // SetNotPeriodic(self
  // OCP.OCP.Geom.Geom_BSplineCurve.SetNotPeriodic (method)
  SetNotPeriodic(self: OCP.OCP.Geom.Geom_BSplineCurve) -> None

  // SetPole(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BSplineCurve.SetPole (method)
  SetPole(*args, **kwargs)
  SetPole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  SetPole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // SetWeight(self
  // OCP.OCP.Geom.Geom_BSplineCurve.SetWeight (method)
  SetWeight(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, Weight: float) -> None

  // IsCN(self
  // OCP.OCP.Geom.Geom_BSplineCurve.IsCN (method)
  IsCN(self: OCP.OCP.Geom.Geom_BSplineCurve, N: int) -> bool

  // IsG1(self
  // OCP.OCP.Geom.Geom_BSplineCurve.IsG1 (method)
  IsG1(self: OCP.OCP.Geom.Geom_BSplineCurve, theTf: float, theTl: float, theAngTol: float) -> bool

  // IsClosed(self
  // OCP.OCP.Geom.Geom_BSplineCurve.IsClosed (method)
  IsClosed(self: OCP.OCP.Geom.Geom_BSplineCurve) -> bool

  // IsPeriodic(self
  // OCP.OCP.Geom.Geom_BSplineCurve.IsPeriodic (method)
  IsPeriodic(self: OCP.OCP.Geom.Geom_BSplineCurve) -> bool

  // IsRational(self
  // OCP.OCP.Geom.Geom_BSplineCurve.IsRational (method)
  IsRational(self: OCP.OCP.Geom.Geom_BSplineCurve) -> bool

  // Continuity(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Continuity (method)
  Continuity(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // Degree(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Degree (method)
  Degree(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // D0(self
  // OCP.OCP.Geom.Geom_BSplineCurve.D0 (method)
  D0(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt) -> None

  // D1(self
  // OCP.OCP.Geom.Geom_BSplineCurve.D1 (method)
  D1(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // D2(self
  // OCP.OCP.Geom.Geom_BSplineCurve.D2 (method)
  D2(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // D3(self
  // OCP.OCP.Geom.Geom_BSplineCurve.D3 (method)
  D3(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // DN(self
  // OCP.OCP.Geom.Geom_BSplineCurve.DN (method)
  DN(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, N: int) -> OCP.OCP.gp.gp_Vec

  // LocalValue(self
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalValue (method)
  LocalValue(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int) -> OCP.OCP.gp.gp_Pnt

  // LocalD0(self
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalD0 (method)
  LocalD0(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt) -> None

  // LocalD1(self
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalD1 (method)
  LocalD1(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // LocalD2(self
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalD2 (method)
  LocalD2(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // LocalD3(self
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalD3 (method)
  LocalD3(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // LocalDN(self
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalDN (method)
  LocalDN(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, N: int) -> OCP.OCP.gp.gp_Vec

  // EndPoint(self
  // OCP.OCP.Geom.Geom_BSplineCurve.EndPoint (method)
  EndPoint(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.gp.gp_Pnt

  // FirstUKnotIndex(self
  // OCP.OCP.Geom.Geom_BSplineCurve.FirstUKnotIndex (method)
  FirstUKnotIndex(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // FirstParameter(self
  // OCP.OCP.Geom.Geom_BSplineCurve.FirstParameter (method)
  FirstParameter(self: OCP.OCP.Geom.Geom_BSplineCurve) -> float

  // Knot(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Knot (method)
  Knot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> float

  // Knots(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BSplineCurve.Knots (method)
  Knots(*args, **kwargs)
  Knots(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  Knots(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // KnotSequence(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BSplineCurve.KnotSequence (method)
  KnotSequence(*args, **kwargs)
  KnotSequence(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  KnotSequence(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // KnotDistribution(self
  // OCP.OCP.Geom.Geom_BSplineCurve.KnotDistribution (method)
  KnotDistribution(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.GeomAbs.GeomAbs_BSplKnotDistribution

  // LastUKnotIndex(self
  // OCP.OCP.Geom.Geom_BSplineCurve.LastUKnotIndex (method)
  LastUKnotIndex(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // LastParameter(self
  // OCP.OCP.Geom.Geom_BSplineCurve.LastParameter (method)
  LastParameter(self: OCP.OCP.Geom.Geom_BSplineCurve) -> float

  // Multiplicity(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Multiplicity (method)
  Multiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> int

  // Multiplicities(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BSplineCurve.Multiplicities (method)
  Multiplicities(*args, **kwargs)
  Multiplicities(self: OCP.OCP.Geom.Geom_BSplineCurve, M: OCP.OCP.TColStd.TColStd_Array1OfInteger) -> None
  Multiplicities(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfInteger

  // NbKnots(self
  // OCP.OCP.Geom.Geom_BSplineCurve.NbKnots (method)
  NbKnots(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // NbPoles(self
  // OCP.OCP.Geom.Geom_BSplineCurve.NbPoles (method)
  NbPoles(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // Pole(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Pole (method)
  Pole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> OCP.OCP.gp.gp_Pnt

  // Poles(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BSplineCurve.Poles (method)
  Poles(*args, **kwargs)
  Poles(self: OCP.OCP.Geom.Geom_BSplineCurve, P: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None
  Poles(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColgp.TColgp_Array1OfPnt

  // StartPoint(self
  // OCP.OCP.Geom.Geom_BSplineCurve.StartPoint (method)
  StartPoint(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.gp.gp_Pnt

  // Weight(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Weight (method)
  Weight(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> float

  // Weights(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BSplineCurve.Weights (method)
  Weights(*args, **kwargs)
  Weights(self: OCP.OCP.Geom.Geom_BSplineCurve, W: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  Weights(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // Transform(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Transform (method)
  Transform(self: OCP.OCP.Geom.Geom_BSplineCurve, T: OCP.OCP.gp.gp_Trsf) -> None

  // Copy(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Copy (method)
  Copy(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.Geom.Geom_Geometry

  // IsEqual(self
  // OCP.OCP.Geom.Geom_BSplineCurve.IsEqual (method)
  IsEqual(self: OCP.OCP.Geom.Geom_BSplineCurve, theOther: OCP.OCP.Geom.Geom_BSplineCurve, thePreci: float) -> bool

  // DumpJson(self
  // OCP.OCP.Geom.Geom_BSplineCurve.DumpJson (method)
  DumpJson(self: OCP.OCP.Geom.Geom_BSplineCurve, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // PeriodicNormalization(self
  // OCP.OCP.Geom.Geom_BSplineCurve.PeriodicNormalization (method)
  PeriodicNormalization(self: OCP.OCP.Geom.Geom_BSplineCurve) -> tuple[float]

  // MovePoint(self
  // OCP.OCP.Geom.Geom_BSplineCurve.MovePoint (method)
  MovePoint(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, Index1: int, Index2: int) -> tuple[int, int]

  // MovePointAndTangent(self
  // OCP.OCP.Geom.Geom_BSplineCurve.MovePointAndTangent (method)
  MovePointAndTangent(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, Tangent: OCP.OCP.gp.gp_Vec, Tolerance: float, StartingCondition: int, EndingCondition: int) -> tuple[int]

  // LocateU(self
  // OCP.OCP.Geom.Geom_BSplineCurve.LocateU (method)
  LocateU(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, ParametricTolerance: float, WithKnotRepetition: bool = False) -> tuple[int, int]

  // Resolution(self
  // OCP.OCP.Geom.Geom_BSplineCurve.Resolution (method)
  Resolution(self: OCP.OCP.Geom.Geom_BSplineCurve, Tolerance3D: float) -> tuple[float]

  // MaxDegree_s() -> int
  // OCP.OCP.Geom.Geom_BSplineCurve.MaxDegree_s (method)
  MaxDegree_s() -> int

  // get_type_name_s() -> str
  // OCP.OCP.Geom.Geom_BSplineCurve.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.Geom.Geom_BSplineCurve.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.Geom.Geom_BSplineCurve.DynamicType (method)
  DynamicType(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.Standard.Standard_Type

// Describes a rational or non-rational Bezier curve - a non-rational Bezier curve is defined by a table of poles (also called control points), - a rational Bezier curve is defined by a table of poles with varying weights
Geom_BezierCurve

  // __init__(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BezierCurve.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Geom.Geom_BezierCurve, CurvePoles: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None
  __init__(self: OCP.OCP.Geom.Geom_BezierCurve, CurvePoles: OCP.OCP.TColgp.TColgp_Array1OfPnt, PoleWeights: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // Increase(self
  // OCP.OCP.Geom.Geom_BezierCurve.Increase (method)
  Increase(self: OCP.OCP.Geom.Geom_BezierCurve, Degree: int) -> None

  // InsertPoleAfter(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BezierCurve.InsertPoleAfter (method)
  InsertPoleAfter(*args, **kwargs)
  InsertPoleAfter(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  InsertPoleAfter(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // InsertPoleBefore(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BezierCurve.InsertPoleBefore (method)
  InsertPoleBefore(*args, **kwargs)
  InsertPoleBefore(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  InsertPoleBefore(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // RemovePole(self
  // OCP.OCP.Geom.Geom_BezierCurve.RemovePole (method)
  RemovePole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int) -> None

  // Reverse(self
  // OCP.OCP.Geom.Geom_BezierCurve.Reverse (method)
  Reverse(self: OCP.OCP.Geom.Geom_BezierCurve) -> None

  // ReversedParameter(self
  // OCP.OCP.Geom.Geom_BezierCurve.ReversedParameter (method)
  ReversedParameter(self: OCP.OCP.Geom.Geom_BezierCurve, U: float) -> float

  // Segment(self
  // OCP.OCP.Geom.Geom_BezierCurve.Segment (method)
  Segment(self: OCP.OCP.Geom.Geom_BezierCurve, U1: float, U2: float) -> None

  // SetPole(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BezierCurve.SetPole (method)
  SetPole(*args, **kwargs)
  SetPole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  SetPole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // SetWeight(self
  // OCP.OCP.Geom.Geom_BezierCurve.SetWeight (method)
  SetWeight(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, Weight: float) -> None

  // IsClosed(self
  // OCP.OCP.Geom.Geom_BezierCurve.IsClosed (method)
  IsClosed(self: OCP.OCP.Geom.Geom_BezierCurve) -> bool

  // IsCN(self
  // OCP.OCP.Geom.Geom_BezierCurve.IsCN (method)
  IsCN(self: OCP.OCP.Geom.Geom_BezierCurve, N: int) -> bool

  // IsPeriodic(self
  // OCP.OCP.Geom.Geom_BezierCurve.IsPeriodic (method)
  IsPeriodic(self: OCP.OCP.Geom.Geom_BezierCurve) -> bool

  // IsRational(self
  // OCP.OCP.Geom.Geom_BezierCurve.IsRational (method)
  IsRational(self: OCP.OCP.Geom.Geom_BezierCurve) -> bool

  // Continuity(self
  // OCP.OCP.Geom.Geom_BezierCurve.Continuity (method)
  Continuity(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // Degree(self
  // OCP.OCP.Geom.Geom_BezierCurve.Degree (method)
  Degree(self: OCP.OCP.Geom.Geom_BezierCurve) -> int

  // D0(self
  // OCP.OCP.Geom.Geom_BezierCurve.D0 (method)
  D0(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt) -> None

  // D1(self
  // OCP.OCP.Geom.Geom_BezierCurve.D1 (method)
  D1(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // D2(self
  // OCP.OCP.Geom.Geom_BezierCurve.D2 (method)
  D2(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // D3(self
  // OCP.OCP.Geom.Geom_BezierCurve.D3 (method)
  D3(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // DN(self
  // OCP.OCP.Geom.Geom_BezierCurve.DN (method)
  DN(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, N: int) -> OCP.OCP.gp.gp_Vec

  // StartPoint(self
  // OCP.OCP.Geom.Geom_BezierCurve.StartPoint (method)
  StartPoint(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.gp.gp_Pnt

  // EndPoint(self
  // OCP.OCP.Geom.Geom_BezierCurve.EndPoint (method)
  EndPoint(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.gp.gp_Pnt

  // FirstParameter(self
  // OCP.OCP.Geom.Geom_BezierCurve.FirstParameter (method)
  FirstParameter(self: OCP.OCP.Geom.Geom_BezierCurve) -> float

  // LastParameter(self
  // OCP.OCP.Geom.Geom_BezierCurve.LastParameter (method)
  LastParameter(self: OCP.OCP.Geom.Geom_BezierCurve) -> float

  // NbPoles(self
  // OCP.OCP.Geom.Geom_BezierCurve.NbPoles (method)
  NbPoles(self: OCP.OCP.Geom.Geom_BezierCurve) -> int

  // Pole(self
  // OCP.OCP.Geom.Geom_BezierCurve.Pole (method)
  Pole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int) -> OCP.OCP.gp.gp_Pnt

  // Poles(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BezierCurve.Poles (method)
  Poles(*args, **kwargs)
  Poles(self: OCP.OCP.Geom.Geom_BezierCurve, P: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None
  Poles(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.TColgp.TColgp_Array1OfPnt

  // Weight(self
  // OCP.OCP.Geom.Geom_BezierCurve.Weight (method)
  Weight(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int) -> float

  // Weights(*args, **kwargs)
  // OCP.OCP.Geom.Geom_BezierCurve.Weights (method)
  Weights(*args, **kwargs)
  Weights(self: OCP.OCP.Geom.Geom_BezierCurve, W: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  Weights(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // Transform(self
  // OCP.OCP.Geom.Geom_BezierCurve.Transform (method)
  Transform(self: OCP.OCP.Geom.Geom_BezierCurve, T: OCP.OCP.gp.gp_Trsf) -> None

  // Copy(self
  // OCP.OCP.Geom.Geom_BezierCurve.Copy (method)
  Copy(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.Geom.Geom_Geometry

  // DumpJson(self
  // OCP.OCP.Geom.Geom_BezierCurve.DumpJson (method)
  DumpJson(self: OCP.OCP.Geom.Geom_BezierCurve, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Resolution(self
  // OCP.OCP.Geom.Geom_BezierCurve.Resolution (method)
  Resolution(self: OCP.OCP.Geom.Geom_BezierCurve, Tolerance3D: float) -> tuple[float]

  // MaxDegree_s() -> int
  // OCP.OCP.Geom.Geom_BezierCurve.MaxDegree_s (method)
  MaxDegree_s() -> int

  // get_type_name_s() -> str
  // OCP.OCP.Geom.Geom_BezierCurve.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.Geom.Geom_BezierCurve.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.Geom.Geom_BezierCurve.DynamicType (method)
  DynamicType(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.Standard.Standard_Type
