# build123d — Geom

1 top-level symbols. Signatures are verbatim python.

// Category: Geom
// Definition of the B_spline curve
Geom_BSplineCurve

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.Geom.Geom_BSplineCurve, Poles: OCP.OCP.TColgp.TColgp_Array1OfPnt, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Multiplicities: OCP.OCP.TColStd.TColStd_Array1OfInteger, Degree: int, Periodic: bool = False) -> None 2. __init__(self: OCP.OCP.Geom.Geom_BSplineCurve, Poles: OCP.OCP.TColgp.TColgp_Array1OfPnt, Weights: OCP.OCP.TColStd.TColStd_Array1OfReal, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Multiplicities: OCP.OCP.TColStd.TColStd_Array1OfInteger, Degree: int, Periodic: bool = False, CheckRational: bool = True) -> None
  // OCP.OCP.Geom.Geom_BSplineCurve.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Geom.Geom_BSplineCurve, Poles: OCP.OCP.TColgp.TColgp_Array1OfPnt, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Multiplicities: OCP.OCP.TColStd.TColStd_Array1OfInteger, Degree: int, Periodic: bool = False) -> None
  __init__(self: OCP.OCP.Geom.Geom_BSplineCurve, Poles: OCP.OCP.TColgp.TColgp_Array1OfPnt, Weights: OCP.OCP.TColStd.TColStd_Array1OfReal, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Multiplicities: OCP.OCP.TColStd.TColStd_Array1OfInteger, Degree: int, Periodic: bool = False, CheckRational: bool = True) -> None

  // IncreaseDegree(self
  // Remarks: Increases the degree of this BSpline curve to Degree. As a result, the poles, weights and multiplicities tables are modified; the knots table is not changed. Nothing is done if Degree is less than or equal to the current degree. Exceptions Standard_ConstructionError if Degree is greater than Geom_BSplineCurve::MaxDegree().
  // OCP.OCP.Geom.Geom_BSplineCurve.IncreaseDegree (method)
  IncreaseDegree(self: OCP.OCP.Geom.Geom_BSplineCurve, Degree: int) -> None

  // IncreaseMultiplicity(*args, **kwargs)
  // Remarks: Overloaded function. 1. IncreaseMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, M: int) -> None Increases the multiplicity of the knot <Index> to <M>. 2. IncreaseMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, I1: int, I2: int, M: int) -> None Increases the multiplicities of the knots in [I1,I2] to <M>.
  // OCP.OCP.Geom.Geom_BSplineCurve.IncreaseMultiplicity (method)
  IncreaseMultiplicity(*args, **kwargs)
  IncreaseMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, M: int) -> None
  IncreaseMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, I1: int, I2: int, M: int) -> None

  // IncrementMultiplicity(self
  // Remarks: Increment the multiplicities of the knots in [I1,I2] by <M>.
  // OCP.OCP.Geom.Geom_BSplineCurve.IncrementMultiplicity (method)
  IncrementMultiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, I1: int, I2: int, M: int) -> None

  // InsertKnot(self
  // Remarks: Inserts a knot value in the sequence of knots. If <U> is an existing knot the multiplicity is increased by <M>.
  // OCP.OCP.Geom.Geom_BSplineCurve.InsertKnot (method)
  InsertKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, M: int = 1, ParametricTolerance: float = 0.0, Add: bool = True) -> None

  // InsertKnots(self
  // Remarks: Inserts a set of knots values in the sequence of knots.
  // OCP.OCP.Geom.Geom_BSplineCurve.InsertKnots (method)
  InsertKnots(self: OCP.OCP.Geom.Geom_BSplineCurve, Knots: OCP.OCP.TColStd.TColStd_Array1OfReal, Mults: OCP.OCP.TColStd.TColStd_Array1OfInteger, ParametricTolerance: float = 0.0, Add: bool = False) -> None

  // RemoveKnot(self
  // Remarks: Reduces the multiplicity of the knot of index Index to M. If M is equal to 0, the knot is removed. With a modification of this type, the array of poles is also modified. Two different algorithms are systematically used to compute the new poles of the curve. If, for each pole, the distance between the pole calculated using the first algorithm and the same pole calculated using the second algorithm, is less than Tolerance, this ensures that the curve is not modified by more than Tolerance. Under these conditions, true is returned; otherwise, false is returned. A low tolerance is used to prevent modification of the curve. A high tolerance is used to "smooth" the curve. Exceptions Standard_OutOfRange if Index is outside the bounds of the knots table. pole insertion and pole removing this operation is limited to the Uniform or QuasiUniform BSplineCurve. The knot values are modified . If the BSpline is NonUniform or Piecewise Bezier an exception Construction error is raised.
  // OCP.OCP.Geom.Geom_BSplineCurve.RemoveKnot (method)
  RemoveKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, M: int, Tolerance: float) -> bool

  // Reverse(self
  // Remarks: Changes the direction of parametrization of <me>. The Knot sequence is modified, the FirstParameter and the LastParameter are not modified. The StartPoint of the initial curve becomes the EndPoint of the reversed curve and the EndPoint of the initial curve becomes the StartPoint of the reversed curve.
  // OCP.OCP.Geom.Geom_BSplineCurve.Reverse (method)
  Reverse(self: OCP.OCP.Geom.Geom_BSplineCurve) -> None

  // ReversedParameter(self
  // Remarks: Returns the parameter on the reversed curve for the point of parameter U on <me>.
  // OCP.OCP.Geom.Geom_BSplineCurve.ReversedParameter (method)
  ReversedParameter(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float) -> float

  // Segment(self
  // Remarks: Modifies this BSpline curve by segmenting it between U1 and U2. Either of these values can be outside the bounds of the curve, but U2 must be greater than U1. All data structure tables of this BSpline curve are modified, but the knots located between U1 and U2 are retained. The degree of the curve is not modified.
  // OCP.OCP.Geom.Geom_BSplineCurve.Segment (method)
  Segment(self: OCP.OCP.Geom.Geom_BSplineCurve, U1: float, U2: float, theTolerance: float = 1e-09) -> None

  // SetKnot(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, K: float) -> None Modifies this BSpline curve by assigning the value K to the knot of index Index in the knots table. This is a relatively local modification because K must be such that: Knots(Index - 1) < K < Knots(Index + 1) The second syntax allows you also to increase the multiplicity of the knot to M (but it is not possible to decrease the multiplicity of the knot with this function). Standard_ConstructionError if: - K is not such that: Knots(Index - 1) < K < Knots(Index + 1) - M is greater than the degree of this BSpline curve or lower than the previous multiplicity of knot of index Index in the knots table. Standard_OutOfRange if Index is outside the bounds of the knots table. 2. SetKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, K: float, M: int) -> None Changes the knot of range Index with its multiplicity. You can increase the multiplicity of a knot but it is not allowed to decrease the multiplicity of an existing knot.
  // OCP.OCP.Geom.Geom_BSplineCurve.SetKnot (method)
  SetKnot(*args, **kwargs)
  SetKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, K: float) -> None
  SetKnot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, K: float, M: int) -> None

  // SetKnots(self
  // Remarks: Modifies this BSpline curve by assigning the array K to its knots table. The multiplicity of the knots is not modified. Exceptions Standard_ConstructionError if the values in the array K are not in ascending order. Standard_OutOfRange if the bounds of the array K are not respectively 1 and the number of knots of this BSpline curve.
  // OCP.OCP.Geom.Geom_BSplineCurve.SetKnots (method)
  SetKnots(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // SetPeriodic(self
  // Remarks: Changes this BSpline curve into a periodic curve. To become periodic, the curve must first be closed. Next, the knot sequence must be periodic. For this, FirstUKnotIndex and LastUKnotIndex are used to compute I1 and I2, the indexes in the knots array of the knots corresponding to the first and last parameters of this BSpline curve. The period is therefore: Knots(I2) - Knots(I1). Consequently, the knots and poles tables are modified. Exceptions Standard_ConstructionError if this BSpline curve is not closed.
  // OCP.OCP.Geom.Geom_BSplineCurve.SetPeriodic (method)
  SetPeriodic(self: OCP.OCP.Geom.Geom_BSplineCurve) -> None

  // SetOrigin(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetOrigin(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> None Assigns the knot of index Index in the knots table as the origin of this periodic BSpline curve. As a consequence, the knots and poles tables are modified. Exceptions Standard_NoSuchObject if this curve is not periodic. Standard_DomainError if Index is outside the bounds of the knots table. 2. SetOrigin(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, Tol: float) -> None Set the origin of a periodic curve at Knot U. If U is not a knot of the BSpline a new knot is inserted. KnotVector and poles are modified. Raised if the curve is not periodic
  // OCP.OCP.Geom.Geom_BSplineCurve.SetOrigin (method)
  SetOrigin(*args, **kwargs)
  SetOrigin(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> None
  SetOrigin(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, Tol: float) -> None

  // SetNotPeriodic(self
  // Remarks: Changes this BSpline curve into a non-periodic curve. If this curve is already non-periodic, it is not modified. Note: the poles and knots tables are modified. Warning If this curve is periodic, as the multiplicity of the first and last knots is not modified, and is not equal to Degree + 1, where Degree is the degree of this BSpline curve, the start and end points of the curve are not its first and last poles.
  // OCP.OCP.Geom.Geom_BSplineCurve.SetNotPeriodic (method)
  SetNotPeriodic(self: OCP.OCP.Geom.Geom_BSplineCurve) -> None

  // SetPole(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetPole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None Modifies this BSpline curve by assigning P to the pole of index Index in the poles table. Exceptions Standard_OutOfRange if Index is outside the bounds of the poles table. Standard_ConstructionError if Weight is negative or null. 2. SetPole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None Modifies this BSpline curve by assigning P to the pole of index Index in the poles table. This syntax also allows you to modify the weight of the modified pole, which becomes Weight. In this case, if this BSpline curve is non-rational, it can become rational and vice versa. Exceptions Standard_OutOfRange if Index is outside the bounds of the poles table. Standard_ConstructionError if Weight is negative or null.
  // OCP.OCP.Geom.Geom_BSplineCurve.SetPole (method)
  SetPole(*args, **kwargs)
  SetPole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, P: OCP.OCP.gp.gp_Pnt) -> None
  SetPole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, P: OCP.OCP.gp.gp_Pnt, Weight: float) -> None

  // SetWeight(self
  // Remarks: Changes the weight for the pole of range Index. If the curve was non rational it can become rational. If the curve was rational it can become non rational.
  // OCP.OCP.Geom.Geom_BSplineCurve.SetWeight (method)
  SetWeight(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int, Weight: float) -> None

  // IsCN(self
  // Remarks: Returns the continuity of the curve, the curve is at least C0. Raised if N < 0.
  // OCP.OCP.Geom.Geom_BSplineCurve.IsCN (method)
  IsCN(self: OCP.OCP.Geom.Geom_BSplineCurve, N: int) -> bool

  // IsG1(self
  // Remarks: Check if curve has at least G1 continuity in interval [theTf, theTl] Returns true if IsCN(1) or angle between "left" and "right" first derivatives at knots with C0 continuity is less then theAngTol only knots in interval [theTf, theTl] is checked
  // OCP.OCP.Geom.Geom_BSplineCurve.IsG1 (method)
  IsG1(self: OCP.OCP.Geom.Geom_BSplineCurve, theTf: float, theTl: float, theAngTol: float) -> bool

  // IsClosed(self
  // Remarks: Returns true if the distance between the first point and the last point of the curve is lower or equal to Resolution from package gp. Warnings : The first and the last point can be different from the first pole and the last pole of the curve.
  // OCP.OCP.Geom.Geom_BSplineCurve.IsClosed (method)
  IsClosed(self: OCP.OCP.Geom.Geom_BSplineCurve) -> bool

  // IsPeriodic(self
  // Remarks: Returns True if the curve is periodic.
  // OCP.OCP.Geom.Geom_BSplineCurve.IsPeriodic (method)
  IsPeriodic(self: OCP.OCP.Geom.Geom_BSplineCurve) -> bool

  // IsRational(self
  // Remarks: Returns True if the weights are not identical. The tolerance criterion is Epsilon of the class Real.
  // OCP.OCP.Geom.Geom_BSplineCurve.IsRational (method)
  IsRational(self: OCP.OCP.Geom.Geom_BSplineCurve) -> bool

  // Continuity(self
  // Remarks: Returns the global continuity of the curve : C0 : only geometric continuity, C1 : continuity of the first derivative all along the Curve, C2 : continuity of the second derivative all along the Curve, C3 : continuity of the third derivative all along the Curve, CN : the order of continuity is infinite. For a B-spline curve of degree d if a knot Ui has a multiplicity p the B-spline curve is only Cd-p continuous at Ui. So the global continuity of the curve can't be greater than Cd-p where p is the maximum multiplicity of the interior Knots. In the interior of a knot span the curve is infinitely continuously differentiable.
  // OCP.OCP.Geom.Geom_BSplineCurve.Continuity (method)
  Continuity(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // Degree(self
  // Remarks: Returns the degree of this BSpline curve. The degree of a Geom_BSplineCurve curve cannot be greater than Geom_BSplineCurve::MaxDegree(). Computation of value and derivatives
  // OCP.OCP.Geom.Geom_BSplineCurve.Degree (method)
  Degree(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // D0(self
  // Remarks: Returns in P the point of parameter U.
  // OCP.OCP.Geom.Geom_BSplineCurve.D0 (method)
  D0(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt) -> None

  // D1(self
  // Remarks: Raised if the continuity of the curve is not C1.
  // OCP.OCP.Geom.Geom_BSplineCurve.D1 (method)
  D1(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // D2(self
  // Remarks: Raised if the continuity of the curve is not C2.
  // OCP.OCP.Geom.Geom_BSplineCurve.D2 (method)
  D2(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // D3(self
  // Remarks: Raised if the continuity of the curve is not C3.
  // OCP.OCP.Geom.Geom_BSplineCurve.D3 (method)
  D3(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // DN(self
  // Remarks: For the point of parameter U of this BSpline curve, computes the vector corresponding to the Nth derivative. Warning On a point where the continuity of the curve is not the one requested, this function impacts the part defined by the parameter with a value greater than U, i.e. the part of the curve to the "right" of the singularity. Exceptions Standard_RangeError if N is less than 1.
  // OCP.OCP.Geom.Geom_BSplineCurve.DN (method)
  DN(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, N: int) -> OCP.OCP.gp.gp_Vec

  // LocalValue(self
  // Remarks: Raised if FromK1 = ToK2.
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalValue (method)
  LocalValue(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int) -> OCP.OCP.gp.gp_Pnt

  // LocalD0(self
  // Remarks: Raised if FromK1 = ToK2.
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalD0 (method)
  LocalD0(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt) -> None

  // LocalD1(self
  // Remarks: Raised if the local continuity of the curve is not C1 between the knot K1 and the knot K2. Raised if FromK1 = ToK2.
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalD1 (method)
  LocalD1(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // LocalD2(self
  // Remarks: Raised if the local continuity of the curve is not C2 between the knot K1 and the knot K2. Raised if FromK1 = ToK2.
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalD2 (method)
  LocalD2(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // LocalD3(self
  // Remarks: Raised if the local continuity of the curve is not C3 between the knot K1 and the knot K2. Raised if FromK1 = ToK2.
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalD3 (method)
  LocalD3(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // LocalDN(self
  // Remarks: Raised if the local continuity of the curve is not CN between the knot K1 and the knot K2. Raised if FromK1 = ToK2. Raised if N < 1.
  // OCP.OCP.Geom.Geom_BSplineCurve.LocalDN (method)
  LocalDN(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, FromK1: int, ToK2: int, N: int) -> OCP.OCP.gp.gp_Vec

  // EndPoint(self
  // Remarks: Returns the last point of the curve. Warnings : The last point of the curve is different from the last pole of the curve if the multiplicity of the last knot is lower than Degree.
  // OCP.OCP.Geom.Geom_BSplineCurve.EndPoint (method)
  EndPoint(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.gp.gp_Pnt

  // FirstUKnotIndex(self
  // Remarks: Returns the index in the knot array of the knot corresponding to the first or last parameter of this BSpline curve. For a BSpline curve, the first (or last) parameter (which gives the start (or end) point of the curve) is a knot value. However, if the multiplicity of the first (or last) knot is less than Degree + 1, where Degree is the degree of the curve, it is not the first (or last) knot of the curve.
  // OCP.OCP.Geom.Geom_BSplineCurve.FirstUKnotIndex (method)
  FirstUKnotIndex(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // FirstParameter(self
  // Remarks: Returns the value of the first parameter of this BSpline curve. This is a knot value. The first parameter is the one of the start point of the BSpline curve.
  // OCP.OCP.Geom.Geom_BSplineCurve.FirstParameter (method)
  FirstParameter(self: OCP.OCP.Geom.Geom_BSplineCurve) -> float

  // Knot(self
  // Remarks: Returns the knot of range Index. When there is a knot with a multiplicity greater than 1 the knot is not repeated. The method Multiplicity can be used to get the multiplicity of the Knot. Raised if Index < 1 or Index > NbKnots
  // OCP.OCP.Geom.Geom_BSplineCurve.Knot (method)
  Knot(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> float

  // Knots(*args, **kwargs)
  // Remarks: Overloaded function. 1. Knots(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None returns the knot values of the B-spline curve; Warning A knot with a multiplicity greater than 1 is not repeated in the knot table. The Multiplicity function can be used to obtain the multiplicity of each knot. 2. Knots(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal returns the knot values of the B-spline curve; Warning A knot with a multiplicity greater than 1 is not repeated in the knot table. The Multiplicity function can be used to obtain the multiplicity of each knot.
  // OCP.OCP.Geom.Geom_BSplineCurve.Knots (method)
  Knots(*args, **kwargs)
  Knots(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  Knots(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // KnotSequence(*args, **kwargs)
  // Remarks: Overloaded function. 1. KnotSequence(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None Returns K, the knots sequence of this BSpline curve. In this sequence, knots with a multiplicity greater than 1 are repeated. In the case of a non-periodic curve the length of the sequence must be equal to the sum of the NbKnots multiplicities of the knots of the curve (where NbKnots is the number of knots of this BSpline curve). This sum is also equal to : NbPoles + Degree + 1 where NbPoles is the number of poles and Degree the degree of this BSpline curve. In the case of a periodic curve, if there are k periodic knots, the period is Knot(k+1) - Knot(1). The initial sequence is built by writing knots 1 to k+1, which are repeated according to their corresponding multiplicities. If Degree is the degree of the curve, the degree of continuity of the curve at the knot of index 1 (or k+1) is equal to c = Degree + 1 - Mult(1). c knots are then inserted at the beginning and end of the initial sequence: - the c values of knots preceding the first item Knot(k+1) in the initial sequence are inserted at the beginning; the period is subtracted from these c values; - the c values of knots following the last item Knot(1) in the initial sequence are inserted at the end; the period is added to these c values. The length of the sequence must therefore be equal to: NbPoles + 2*Degree - Mult(1) + 2. Example For a non-periodic BSpline curve of degree 2 where: - the array of knots is: { k1 k2 k3 k4 }, - with associated multiplicities: { 3 1 2 3 }, the knot sequence is: K = { k1 k1 k1 k2 k3 k3 k4 k4 k4 } For a periodic BSpline curve of degree 4 , which is "C1" continuous at the first knot, and where : - the periodic knots are: { k1 k2 k3 (k4) } (3 periodic knots: the points of parameter k1 and k4 are identical, the period is p = k4 - k1), - with associated multiplicities: { 3 1 2 (3) }, the degree of continuity at knots k1 and k4 is: Degree + 1 - Mult(i) = 2. 2 supplementary knots are added at the beginning and end of the sequence: - at the beginning: the 2 knots preceding k4 minus the period; in this example, this is k3 - p both times; - at the end: the 2 knots following k1 plus the period; in this example, this is k2 + p and k3 + p. The knot sequence is therefore: K = { k3-p k3-p k1 k1 k1 k2 k3 k3 k4 k4 k4 k2+p k3+p } Exceptions Raised if K.Lower() is less than number of first knot in knot sequence with repetitions or K.Upper() is more than number of last knot in knot sequence with repetitions. 2. KnotSequence(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal returns the knots of the B-spline curve. Knots with multiplicit greater than 1 are repeated
  // OCP.OCP.Geom.Geom_BSplineCurve.KnotSequence (method)
  KnotSequence(*args, **kwargs)
  KnotSequence(self: OCP.OCP.Geom.Geom_BSplineCurve, K: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  KnotSequence(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // KnotDistribution(self
  // Remarks: Returns NonUniform or Uniform or QuasiUniform or PiecewiseBezier. If all the knots differ by a positive constant from the preceding knot the BSpline Curve can be : - Uniform if all the knots are of multiplicity 1, - QuasiUniform if all the knots are of multiplicity 1 except for the first and last knot which are of multiplicity Degree + 1, - PiecewiseBezier if the first and last knots have multiplicity Degree + 1 and if interior knots have multiplicity Degree A piecewise Bezier with only two knots is a BezierCurve. else the curve is non uniform. The tolerance criterion is Epsilon from class Real.
  // OCP.OCP.Geom.Geom_BSplineCurve.KnotDistribution (method)
  KnotDistribution(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.GeomAbs.GeomAbs_BSplKnotDistribution

  // LastUKnotIndex(self
  // Remarks: For a BSpline curve the last parameter (which gives the end point of the curve) is a knot value but if the multiplicity of the last knot index is lower than Degree + 1 it is not the last knot of the curve. This method computes the index of the knot corresponding to the last parameter.
  // OCP.OCP.Geom.Geom_BSplineCurve.LastUKnotIndex (method)
  LastUKnotIndex(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // LastParameter(self
  // Remarks: Computes the parametric value of the end point of the curve. It is a knot value.
  // OCP.OCP.Geom.Geom_BSplineCurve.LastParameter (method)
  LastParameter(self: OCP.OCP.Geom.Geom_BSplineCurve) -> float

  // Multiplicity(self
  // Remarks: Returns the multiplicity of the knots of range Index. Raised if Index < 1 or Index > NbKnots
  // OCP.OCP.Geom.Geom_BSplineCurve.Multiplicity (method)
  Multiplicity(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> int

  // Multiplicities(*args, **kwargs)
  // Remarks: Overloaded function. 1. Multiplicities(self: OCP.OCP.Geom.Geom_BSplineCurve, M: OCP.OCP.TColStd.TColStd_Array1OfInteger) -> None Returns the multiplicity of the knots of the curve. 2. Multiplicities(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfInteger returns the multiplicity of the knots of the curve.
  // OCP.OCP.Geom.Geom_BSplineCurve.Multiplicities (method)
  Multiplicities(*args, **kwargs)
  Multiplicities(self: OCP.OCP.Geom.Geom_BSplineCurve, M: OCP.OCP.TColStd.TColStd_Array1OfInteger) -> None
  Multiplicities(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfInteger

  // NbKnots(self
  // Remarks: Returns the number of knots. This method returns the number of knot without repetition of multiple knots.
  // OCP.OCP.Geom.Geom_BSplineCurve.NbKnots (method)
  NbKnots(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // NbPoles(self
  // Remarks: Returns the number of poles
  // OCP.OCP.Geom.Geom_BSplineCurve.NbPoles (method)
  NbPoles(self: OCP.OCP.Geom.Geom_BSplineCurve) -> int

  // Pole(self
  // Remarks: Returns the pole of range Index. Raised if Index < 1 or Index > NbPoles.
  // OCP.OCP.Geom.Geom_BSplineCurve.Pole (method)
  Pole(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> OCP.OCP.gp.gp_Pnt

  // Poles(*args, **kwargs)
  // Remarks: Overloaded function. 1. Poles(self: OCP.OCP.Geom.Geom_BSplineCurve, P: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None Returns the poles of the B-spline curve; 2. Poles(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColgp.TColgp_Array1OfPnt Returns the poles of the B-spline curve;
  // OCP.OCP.Geom.Geom_BSplineCurve.Poles (method)
  Poles(*args, **kwargs)
  Poles(self: OCP.OCP.Geom.Geom_BSplineCurve, P: OCP.OCP.TColgp.TColgp_Array1OfPnt) -> None
  Poles(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColgp.TColgp_Array1OfPnt

  // StartPoint(self
  // Remarks: Returns the start point of the curve. Warnings : This point is different from the first pole of the curve if the multiplicity of the first knot is lower than Degree.
  // OCP.OCP.Geom.Geom_BSplineCurve.StartPoint (method)
  StartPoint(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.gp.gp_Pnt

  // Weight(self
  // Remarks: Returns the weight of the pole of range Index . Raised if Index < 1 or Index > NbPoles.
  // OCP.OCP.Geom.Geom_BSplineCurve.Weight (method)
  Weight(self: OCP.OCP.Geom.Geom_BSplineCurve, Index: int) -> float

  // Weights(*args, **kwargs)
  // Remarks: Overloaded function. 1. Weights(self: OCP.OCP.Geom.Geom_BSplineCurve, W: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None Returns the weights of the B-spline curve; 2. Weights(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal Returns the weights of the B-spline curve;
  // OCP.OCP.Geom.Geom_BSplineCurve.Weights (method)
  Weights(*args, **kwargs)
  Weights(self: OCP.OCP.Geom.Geom_BSplineCurve, W: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None
  Weights(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.TColStd.TColStd_Array1OfReal

  // Transform(self
  // Remarks: Applies the transformation T to this BSpline curve.
  // OCP.OCP.Geom.Geom_BSplineCurve.Transform (method)
  Transform(self: OCP.OCP.Geom.Geom_BSplineCurve, T: OCP.OCP.gp.gp_Trsf) -> None

  // Copy(self
  // Remarks: Creates a new object which is a copy of this BSpline curve.
  // OCP.OCP.Geom.Geom_BSplineCurve.Copy (method)
  Copy(self: OCP.OCP.Geom.Geom_BSplineCurve) -> OCP.OCP.Geom.Geom_Geometry

  // IsEqual(self
  // Remarks: Compare two Bspline curve on identity;
  // OCP.OCP.Geom.Geom_BSplineCurve.IsEqual (method)
  IsEqual(self: OCP.OCP.Geom.Geom_BSplineCurve, theOther: OCP.OCP.Geom.Geom_BSplineCurve, thePreci: float) -> bool

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.Geom.Geom_BSplineCurve.DumpJson (method)
  DumpJson(self: OCP.OCP.Geom.Geom_BSplineCurve, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // PeriodicNormalization(self
  // Remarks: returns the parameter normalized within the period if the curve is periodic : otherwise does not do anything
  // OCP.OCP.Geom.Geom_BSplineCurve.PeriodicNormalization (method)
  PeriodicNormalization(self: OCP.OCP.Geom.Geom_BSplineCurve) -> tuple[float]

  // MovePoint(self
  // Remarks: Moves the point of parameter U of this BSpline curve to P. Index1 and Index2 are the indexes in the table of poles of this BSpline curve of the first and last poles designated to be moved. FirstModifiedPole and LastModifiedPole are the indexes of the first and last poles which are effectively modified. In the event of incompatibility between Index1, Index2 and the value U: - no change is made to this BSpline curve, and - the FirstModifiedPole and LastModifiedPole are returned null. Exceptions Standard_OutOfRange if: - Index1 is greater than or equal to Index2, or - Index1 or Index2 is less than 1 or greater than the number of poles of this BSpline curve.
  // OCP.OCP.Geom.Geom_BSplineCurve.MovePoint (method)
  MovePoint(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, Index1: int, Index2: int) -> tuple[int, int]

  // MovePointAndTangent(self
  // Remarks: Move a point with parameter U to P. and makes it tangent at U be Tangent. StartingCondition = -1 means first can move EndingCondition = -1 means last point can move StartingCondition = 0 means the first point cannot move EndingCondition = 0 means the last point cannot move StartingCondition = 1 means the first point and tangent cannot move EndingCondition = 1 means the last point and tangent cannot move and so forth ErrorStatus != 0 means that there are not enough degree of freedom with the constrain to deform the curve accordingly
  // OCP.OCP.Geom.Geom_BSplineCurve.MovePointAndTangent (method)
  MovePointAndTangent(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, P: OCP.OCP.gp.gp_Pnt, Tangent: OCP.OCP.gp.gp_Vec, Tolerance: float, StartingCondition: int, EndingCondition: int) -> tuple[int]

  // LocateU(self
  // Remarks: Locates the parametric value U in the sequence of knots. If "WithKnotRepetition" is True we consider the knot's representation with repetition of multiple knot value, otherwise we consider the knot's representation with no repetition of multiple knot values. Knots (I1) <= U <= Knots (I2) . if I1 = I2 U is a knot value (the tolerance criterion ParametricTolerance is used). . if I1 < 1 => U < Knots (1) - Abs(ParametricTolerance) . if I2 > NbKnots => U > Knots (NbKnots) + Abs(ParametricTolerance)
  // OCP.OCP.Geom.Geom_BSplineCurve.LocateU (method)
  LocateU(self: OCP.OCP.Geom.Geom_BSplineCurve, U: float, ParametricTolerance: float, WithKnotRepetition: bool = False) -> tuple[int, int]

  // Resolution(self
  // Remarks: Computes for this BSpline curve the parametric tolerance UTolerance for a given 3D tolerance Tolerance3D. If f(t) is the equation of this BSpline curve, UTolerance ensures that: | t1 - t0| < Utolerance ===> |f(t1) - f(t0)| < Tolerance3D
  // OCP.OCP.Geom.Geom_BSplineCurve.Resolution (method)
  Resolution(self: OCP.OCP.Geom.Geom_BSplineCurve, Tolerance3D: float) -> tuple[float]

  // MaxDegree_s() -> int
  // Remarks: Returns the value of the maximum degree of the normalized B-spline basis functions in this package.
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
