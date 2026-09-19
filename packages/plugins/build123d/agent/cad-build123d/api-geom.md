# build123d — Geom

2 top-level symbols. Signatures are verbatim python.

// Definition of the B_spline curve
Geom_BSplineCurve

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Geom.Geom_BSplineCurve, Poles: OCP.OCP.TColgp.TColgp_Array1OfPnt, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Multiplicities: OCP.OCP.TColStd.TColStd_Array1OfInteger, Degree: int, Periodic: bool = False) -> None
  __init__(self: OCP.OCP.Geom.Geom_BSplineCurve, Poles: OCP.OCP.TColgp.TColgp_Array1OfPnt, Weights: OCP.OCP.TColStd.TColStd_Array1OfReal, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Multiplicities: OCP.OCP.TColStd.TColStd_Array1OfInteger, Degree: int, Periodic: bool = False, CheckRational: bool = True) -> None

  // IncreaseDegree(self
  IncreaseDegree(self: OCP.OCP.Geom.Geom_BSplineCurve, Degree: int) -> None

  // IncreaseMultiplicity(*args, **kwargs)
  IncreaseMultiplicity(*args, **kwargs)
  IncreaseMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, M: int) -> None
  IncreaseMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, I1: int, I2: int, M: int) -> None

  // IncrementMultiplicity(self
  IncrementMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, I1: int, I2: int, M: int) -> None

  // InsertKnot(self
  InsertKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, M: int = 1, ParametricTolerance: float = 0.0, Add: bool = True) -> None

  // InsertKnots(self
  InsertKnots(self: OCP.OCP.Geom.Geom_BSplineCurve, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Mults: OCP.OCP.TColStd.TColStd_Array1OfInteger, ParametricTolerance: float = 0.0, Add: bool = False) -> None

  // RemoveKnot(self
  RemoveKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, M: int, Tolerance: float) -> bool

  // Reverse(self
  Reverse(self: OCP.OCP.Geom.Geom_BSplineCurve) -> None

  // ReversedParameter(self
  ReversedParameter(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float) -> float

  // Segment(self
  Segment(self: OCP.OCP.Geom.Geom_BSplineCurve, U1: float, U2: float, theTolerance: float = 1e-09) -> None

  // SetKnot(*args, **kwargs)
  SetKnot(*args, **kwargs)
  SetKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, K: float) -> None
  SetKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, K: float, M: int) -> None

  // SetKnots(self
  SetKnots(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // SetPeriodic(self
  SetPeriodic(self: OCP.OCP.Geom.Geom_BSplineCurve) -> None

  // SetOrigin(*args, **kwargs)
  SetOrigin(*args, **kwargs)
  SetOrigin(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> None
  SetOrigin(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, Tol: float) -> None

  // SetNotPeriodic(self
  SetNotPeriodic(self: OCP.OCP.Geom.Geom_BSplineCurve) -> None

  // SetPole(*args, **kwargs)
  SetPole(*args, **kwargs)
  SetPole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  SetPole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // SetWeight(self
  SetWeight(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, Weight: float) -> None

  // IsCN(self
  IsCN(self: OCP.OCP.Geom.Geom_BSplineCurve, N: int) -> bool

  // IsG1(self
  IsG1(self: OCP.OCP.Geom.Geom_BSplineCurve, theTf: float, theTl: float, theAngTol: float) -> bool

  // IsClosed(self
  IsClosed(self: OCP.OCP.Geom.Geom_BSplineCurve) -> bool

  // IsPeriodic(self
  IsPeriodic(self: OCP.OCP.Geom.Geom_BSplineCurve) -> bool

  // IsRational(self
  IsRational(self: OCP.OCP.Geom.Geom_BSplineCurve) -> bool

  // Continuity(self
  Continuity(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // Degree(self
  Degree(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // D0(self
  D0(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt) -> None

  // D1(self
  D1(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // D2(self
  D2(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // D3(self
  D3(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // DN(self
  DN(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, N: int) -> OCP.OCP.gp.gp_Vec

  // LocalValue(self
  LocalValue(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int) -> OCP.OCP.gp.gp_Pnt

  // LocalD0(self
  LocalD0(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt) -> None

  // LocalD1(self
  LocalD1(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // LocalD2(self
  LocalD2(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // LocalD3(self
  LocalD3(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // LocalDN(self
  LocalDN(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, N: int) -> OCP.OCP.gp.gp_Vec

  // EndPoint(self
  EndPoint(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.gp.gp_Pnt

  // FirstUKnotIndex(self
  FirstUKnotIndex(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // FirstParameter(self
  FirstParameter(self: OCP.OCP.Geom.Geom_BSplineCurve) -> float

  // Knot(self
  Knot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> float

  // Knots(*args, **kwargs)
  Knots(*args, **kwargs)
  Knots(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  Knots(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // KnotSequence(*args, **kwargs)
  KnotSequence(*args, **kwargs)
  KnotSequence(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  KnotSequence(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // KnotDistribution(self
  KnotDistribution(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.GeomAbs.GeomAbs_BSplKnotDistribution

  // LastUKnotIndex(self
  LastUKnotIndex(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // LastParameter(self
  LastParameter(self: OCP.OCP.Geom.Geom_BSplineCurve) -> float

  // Multiplicity(self
  Multiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> int

  // Multiplicities(*args, **kwargs)
  Multiplicities(*args, **kwargs)
  Multiplicities(self: OCP.OCP.Geom.Geom_BSplineCurve, M: OCP.OCP.TColStd.TColStd_Array1OfInteger) -> None
  Multiplicities(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfInteger

  // NbKnots(self
  NbKnots(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // NbPoles(self
  NbPoles(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // Pole(self
  Pole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> OCP.OCP.gp.gp_Pnt

  // Poles(*args, **kwargs)
  Poles(*args, **kwargs)
  Poles(self: OCP.OCP.Geom.Geom_BSplineCurve, P: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None
  Poles(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColgp.TColgp_Array1OfPnt

  // StartPoint(self
  StartPoint(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.gp.gp_Pnt

  // Weight(self
  Weight(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> float

  // Weights(*args, **kwargs)
  Weights(*args, **kwargs)
  Weights(self: OCP.OCP.Geom.Geom_BSplineCurve, W: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  Weights(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // Transform(self
  Transform(self: OCP.OCP.Geom.Geom_BSplineCurve, T: OCP.OCP.gp.gp_Trsf) -> None

  // Copy(self
  Copy(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.Geom.Geom_Geometry

  // IsEqual(self
  IsEqual(self: OCP.OCP.Geom.Geom_BSplineCurve, theOther: OCP.OCP.Geom.Geom_BSplineCurve, thePreci: float) -> bool

  // DumpJson(self
  DumpJson(self: OCP.OCP.Geom.Geom_BSplineCurve, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // PeriodicNormalization(self
  PeriodicNormalization(self: OCP.OCP.Geom.Geom_BSplineCurve) -> tuple[float]

  // MovePoint(self
  MovePoint(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, Index1: int, Index2: int) -> tuple[int, int]

  // MovePointAndTangent(self
  MovePointAndTangent(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, Tangent: OCP.OCP.gp.gp_Vec, Tolerance: float, StartingCondition: int, EndingCondition: int) -> tuple[int]

  // LocateU(self
  LocateU(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, ParametricTolerance: float, WithKnotRepetition: bool = False) -> tuple[int, int]

  // Resolution(self
  Resolution(self: OCP.OCP.Geom.Geom_BSplineCurve, Tolerance3D: float) -> tuple[float]

  // MaxDegree_s() -> int
  MaxDegree_s() -> int

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.Standard.Standard_Type

// Describes a rational or non-rational Bezier curve - a non-rational Bezier curve is defined by a table of poles (also called control points), - a rational Bezier curve is defined by a table of poles with varying weights
Geom_BezierCurve

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Geom.Geom_BezierCurve, CurvePoles: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None
  __init__(self: OCP.OCP.Geom.Geom_BezierCurve, CurvePoles: OCP.OCP.TColgp.TColgp_Array1OfPnt, PoleWeights: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // Increase(self
  Increase(self: OCP.OCP.Geom.Geom_BezierCurve, Degree: int) -> None

  // InsertPoleAfter(*args, **kwargs)
  InsertPoleAfter(*args, **kwargs)
  InsertPoleAfter(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  InsertPoleAfter(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // InsertPoleBefore(*args, **kwargs)
  InsertPoleBefore(*args, **kwargs)
  InsertPoleBefore(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  InsertPoleBefore(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // RemovePole(self
  RemovePole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int) -> None

  // Reverse(self
  Reverse(self: OCP.OCP.Geom.Geom_BezierCurve) -> None

  // ReversedParameter(self
  ReversedParameter(self: OCP.OCP.Geom.Geom_BezierCurve, U: float) -> float

  // Segment(self
  Segment(self: OCP.OCP.Geom.Geom_BezierCurve, U1: float, U2: float) -> None

  // SetPole(*args, **kwargs)
  SetPole(*args, **kwargs)
  SetPole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  SetPole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // SetWeight(self
  SetWeight(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, Weight: float) -> None

  // IsClosed(self
  IsClosed(self: OCP.OCP.Geom.Geom_BezierCurve) -> bool

  // IsCN(self
  IsCN(self: OCP.OCP.Geom.Geom_BezierCurve, N: int) -> bool

  // IsPeriodic(self
  IsPeriodic(self: OCP.OCP.Geom.Geom_BezierCurve) -> bool

  // IsRational(self
  IsRational(self: OCP.OCP.Geom.Geom_BezierCurve) -> bool

  // Continuity(self
  Continuity(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // Degree(self
  Degree(self: OCP.OCP.Geom.Geom_BezierCurve) -> int

  // D0(self
  D0(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt) -> None

  // D1(self
  D1(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // D2(self
  D2(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // D3(self
  D3(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // DN(self
  DN(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, N: int) -> OCP.OCP.gp.gp_Vec

  // StartPoint(self
  StartPoint(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.gp.gp_Pnt

  // EndPoint(self
  EndPoint(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.gp.gp_Pnt

  // FirstParameter(self
  FirstParameter(self: OCP.OCP.Geom.Geom_BezierCurve) -> float

  // LastParameter(self
  LastParameter(self: OCP.OCP.Geom.Geom_BezierCurve) -> float

  // NbPoles(self
  NbPoles(self: OCP.OCP.Geom.Geom_BezierCurve) -> int

  // Pole(self
  Pole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int) -> OCP.OCP.gp.gp_Pnt

  // Poles(*args, **kwargs)
  Poles(*args, **kwargs)
  Poles(self: OCP.OCP.Geom.Geom_BezierCurve, P: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None
  Poles(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.TColgp.TColgp_Array1OfPnt

  // Weight(self
  Weight(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int) -> float

  // Weights(*args, **kwargs)
  Weights(*args, **kwargs)
  Weights(self: OCP.OCP.Geom.Geom_BezierCurve, W: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  Weights(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // Transform(self
  Transform(self: OCP.OCP.Geom.Geom_BezierCurve, T: OCP.OCP.gp.gp_Trsf) -> None

  // Copy(self
  Copy(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.Geom.Geom_Geometry

  // DumpJson(self
  DumpJson(self: OCP.OCP.Geom.Geom_BezierCurve, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Resolution(self
  Resolution(self: OCP.OCP.Geom.Geom_BezierCurve, Tolerance3D: float) -> tuple[float]

  // MaxDegree_s() -> int
  MaxDegree_s() -> int

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.Standard.Standard_Type
