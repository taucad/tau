# build123d — Geom (2)

2 top-level symbols. Signatures are verbatim python.

// Category: Geom
// Describes a rational or non-rational Bezier curve - a non-rational Bezier curve is defined by a table of poles (also called control points), - a rational Bezier curve is defined by a table of poles with varying weights
Geom_BezierCurve

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.Geom.Geom_BezierCurve, CurvePoles: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None

2. __init__(self: OCP.OCP.Geom.Geom_BezierCurve, CurvePoles: OCP.OCP.TColgp.TColgp_Array1OfPnt, PoleWeights: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Geom.Geom_BezierCurve, CurvePoles: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None
  __init__(self: OCP.OCP.Geom.Geom_BezierCurve, CurvePoles: OCP.OCP.TColgp.TColgp_Array1OfPnt, PoleWeights: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // Increase(self
  // Remarks: Increases the degree of a bezier curve. Degree is the new degree of <me>. Raises ConstructionError if Degree is greater than MaxDegree or lower than 2 or lower than the initial degree of <me>.
  Increase(self: OCP.OCP.Geom.Geom_BezierCurve, Degree: int) -> None

  // InsertPoleAfter(*args, **kwargs)
  // Remarks: Overloaded function.

1. InsertPoleAfter(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None

Inserts a pole P after the pole of range Index. If the curve <me> is rational the weight value for the new pole of range Index is 1.0. raised if Index is not in the range [1, NbPoles]

2. InsertPoleAfter(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

Inserts a pole with its weight in the set of poles after the pole of range Index. If the curve was non rational it can become rational if all the weights are not identical. Raised if Index is not in the range [1, NbPoles]
  InsertPoleAfter(*args, **kwargs)
  InsertPoleAfter(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  InsertPoleAfter(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // InsertPoleBefore(*args, **kwargs)
  // Remarks: Overloaded function.

1. InsertPoleBefore(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None

Inserts a pole P before the pole of range Index. If the curve <me> is rational the weight value for the new pole of range Index is 1.0. Raised if Index is not in the range [1, NbPoles]

2. InsertPoleBefore(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

Inserts a pole with its weight in the set of poles after the pole of range Index. If the curve was non rational it can become rational if all the weights are not identical. Raised if Index is not in the range [1, NbPoles]
  InsertPoleBefore(*args, **kwargs)
  InsertPoleBefore(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  InsertPoleBefore(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // RemovePole(self
  // Remarks: Removes the pole of range Index. If the curve was rational it can become non rational. Raised if Index is not in the range [1, NbPoles] Raised if Degree is lower than 2.
  RemovePole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int) -> None

  // Reverse(self
  // Remarks: Reverses the direction of parametrization of <me> Value (NewU) = Value (1 - OldU)
  Reverse(self: OCP.OCP.Geom.Geom_BezierCurve) -> None

  // ReversedParameter(self
  // Remarks: Returns the parameter on the reversed curve for the point of parameter U on <me>.
  ReversedParameter(self: OCP.OCP.Geom.Geom_BezierCurve, U: float) -> float

  // Segment(self
  // Remarks: Segments the curve between U1 and U2 which can be out of the bounds of the curve. The curve is oriented from U1 to U2. The control points are modified, the first and the last point are not the same but the parametrization range is [0, 1] else it could not be a Bezier curve. Warnings : Even if <me> is not closed it can become closed after the segmentation for example if U1 or U2 are out of the bounds of the curve <me> or if the curve makes loop. After the segmentation the length of a curve can be null.
  Segment(self: OCP.OCP.Geom.Geom_BezierCurve, U1: float, U2: float) -> None

  // SetPole(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetPole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None

Substitutes the pole of range index with P. If the curve <me> is rational the weight of range Index is not modified. raiseD if Index is not in the range [1, NbPoles]

2. SetPole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

Substitutes the pole and the weights of range Index. If the curve <me> is not rational it can become rational if all the weights are not identical. If the curve was rational it can become non rational if all the weights are identical. Raised if Index is not in the range [1, NbPoles] Raised if Weight <= Resolution from package gp
  SetPole(*args, **kwargs)
  SetPole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  SetPole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // SetWeight(self
  // Remarks: Changes the weight of the pole of range Index. If the curve <me> is not rational it can become rational if all the weights are not identical. If the curve was rational it can become non rational if all the weights are identical. Raised if Index is not in the range [1, NbPoles] Raised if Weight <= Resolution from package gp
  SetWeight(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int, Weight: float) -> None

  // IsClosed(self
  // Remarks: Returns True if the distance between the first point and the last point of the curve is lower or equal to the Resolution from package gp.
  IsClosed(self: OCP.OCP.Geom.Geom_BezierCurve) -> bool

  // IsCN(self
  // Remarks: Continuity of the curve, returns True.
  IsCN(self: OCP.OCP.Geom.Geom_BezierCurve, N: int) -> bool

  // IsPeriodic(self
  // Remarks: Returns True if the parametrization of a curve is periodic. (P(u) = P(u + T) T = constante)
  IsPeriodic(self: OCP.OCP.Geom.Geom_BezierCurve) -> bool

  // IsRational(self
  // Remarks: Returns false if all the weights are identical. The tolerance criterion is Resolution from package gp.
  IsRational(self: OCP.OCP.Geom.Geom_BezierCurve) -> bool

  // Continuity(self
  // Remarks: a Bezier curve is CN
  Continuity(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // Degree(self
  // Remarks: Returns the polynomial degree of the curve. it is the number of poles - 1 point P and derivatives (V1, V2, V3) computation The Bezier Curve has a Polynomial representation so the parameter U can be out of the bounds of the curve.
  Degree(self: OCP.OCP.Geom.Geom_BezierCurve) -> int

  // D0(self
  D0(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt) -> None

  // D1(self
  D1(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // D2(self
  D2(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // D3(self
  // Remarks: For this Bezier curve, computes - the point P of parameter U, or - the point P and one or more of the following values: - V1, the first derivative vector, - V2, the second derivative vector, - V3, the third derivative vector. Note: the parameter U can be outside the bounds of the curve.
  D3(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // DN(self
  // Remarks: For the point of parameter U of this Bezier curve, computes the vector corresponding to the Nth derivative. Note: the parameter U can be outside the bounds of the curve. Exceptions Standard_RangeError if N is less than 1.
  DN(self: OCP.OCP.Geom.Geom_BezierCurve, U: float, N: int) -> OCP.OCP.gp.gp_Vec

  // StartPoint(self
  // Remarks: Returns Value (U=0.), it is the first control point of the curve.
  StartPoint(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.gp.gp_Pnt

  // EndPoint(self
  // Remarks: Returns Value (U=1.), it is the last control point of the Bezier curve.
  EndPoint(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.gp.gp_Pnt

  // FirstParameter(self
  // Remarks: Returns the value of the first parameter of this Bezier curve. This is 0.0, which gives the start point of this Bezier curve
  FirstParameter(self: OCP.OCP.Geom.Geom_BezierCurve) -> float

  // LastParameter(self
  // Remarks: Returns the value of the last parameter of this Bezier curve. This is 1.0, which gives the end point of this Bezier curve.
  LastParameter(self: OCP.OCP.Geom.Geom_BezierCurve) -> float

  // NbPoles(self
  // Remarks: Returns the number of poles of this Bezier curve.
  NbPoles(self: OCP.OCP.Geom.Geom_BezierCurve) -> int

  // Pole(self
  // Remarks: Returns the pole of range Index. Raised if Index is not in the range [1, NbPoles]
  Pole(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int) -> OCP.OCP.gp.gp_Pnt

  // Poles(*args, **kwargs)
  // Remarks: Overloaded function.

1. Poles(self: OCP.OCP.Geom.Geom_BezierCurve, P: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None

Returns all the poles of the curve.

2. Poles(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.TColgp.TColgp_Array1OfPnt

Returns all the poles of the curve.
  Poles(*args, **kwargs)
  Poles(self: OCP.OCP.Geom.Geom_BezierCurve, P: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None
  Poles(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.TColgp.TColgp_Array1OfPnt

  // Weight(self
  // Remarks: Returns the weight of range Index. Raised if Index is not in the range [1, NbPoles]
  Weight(self: OCP.OCP.Geom.Geom_BezierCurve, Index: int) -> float

  // Weights(*args, **kwargs)
  // Remarks: Overloaded function.

1. Weights(self: OCP.OCP.Geom.Geom_BezierCurve, W: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

Returns all the weights of the curve.

2. Weights(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

Returns all the weights of the curve.
  Weights(*args, **kwargs)
  Weights(self: OCP.OCP.Geom.Geom_BezierCurve, W: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  Weights(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // Transform(self
  // Remarks: Applies the transformation T to this Bezier curve.
  Transform(self: OCP.OCP.Geom.Geom_BezierCurve, T: OCP.OCP.gp.gp_Trsf) -> None

  // Copy(self
  // Remarks: Creates a new object which is a copy of this Bezier curve.
  Copy(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.Geom.Geom_Geometry

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.Geom.Geom_BezierCurve, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Resolution(self
  // Remarks: Computes for this Bezier curve the parametric tolerance UTolerance for a given 3D tolerance Tolerance3D. If f(t) is the equation of this Bezier curve, UTolerance ensures that: |t1-t0| < UTolerance ===> |f(t1)-f(t0)| < Tolerance3D
  Resolution(self: OCP.OCP.Geom.Geom_BezierCurve, Tolerance3D: float) -> tuple[float]

  // MaxDegree_s() -> int
  // Remarks: Returns the value of the maximum polynomial degree of any Geom_BezierCurve curve. This value is 25.
  MaxDegree_s() -> int

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.Geom.Geom_BezierCurve) -> OCP.OCP.Standard.Standard_Type

// Category: Geom
// The root class for bounded surfaces in 3D space
Geom_BoundedSurface

  // Initialize self
  Geom_BoundedSurface(*args, **kwargs)

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.Geom.Geom_BoundedSurface) -> OCP.OCP.Standard.Standard_Type
