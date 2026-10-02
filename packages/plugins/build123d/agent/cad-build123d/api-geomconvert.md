# build123d — GeomConvert

2 top-level symbols. Signatures are verbatim python.

// Category: GeomConvert
// The GeomConvert package provides some global functions as follows - converting classical Geom curves into BSpline curves, - segmenting BSpline curves, particularly at knots values
GeomConvert

  // __init__(self
  __init__(self: OCP.OCP.GeomConvert.GeomConvert) -> None

  // SplitBSplineCurve_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. SplitBSplineCurve_s(C: OCP.OCP.Geom.Geom_BSplineCurve, FromK1: int, ToK2: int, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineCurve Convert a curve from Geom by an approximation method 2. SplitBSplineCurve_s(C: OCP.OCP.Geom.Geom_BSplineCurve, FromU1: float, ToU2: float, ParametricTolerance: float, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineCurve This function computes the segment of B-spline curve between the parametric values FromU1, ToU2. If C is periodic the arc has the same orientation as C if SameOrientation = True. If C is not periodic SameOrientation is not used for the computation and C is oriented fromU1 toU2. If U1 and U2 and two parametric values we consider that U1 = U2 if Abs (U1 - U2) <= ParametricTolerance and ParametricTolerance must be greater or equal to Resolution from package gp.
  SplitBSplineCurve_s(*args, **kwargs)
  SplitBSplineCurve_s(C: OCP.OCP.Geom.Geom_BSplineCurve, FromK1: int, ToK2: int, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineCurve
  SplitBSplineCurve_s(C: OCP.OCP.Geom.Geom_BSplineCurve, FromU1: float, ToU2: float, ParametricTolerance: float, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineCurve

  // SplitBSplineSurface_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromUK1: int, ToUK2: int, FromVK1: int, ToVK2: int, SameUOrientation: bool = True, SameVOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface Computes the B-spline surface patche between the knots values FromUK1, ToUK2, FromVK1, ToVK2. If S is periodic in one direction the patche has the same orientation as S in this direction if the flag is true in this direction (SameUOrientation, SameVOrientation). If S is not periodic SameUOrientation and SameVOrientation are not used for the computation and S is oriented FromUK1 ToUK2 and FromVK1 ToVK2. Raised if FromUK1 = ToUK2 or FromVK1 = ToVK2 FromUK1 or ToUK2 are out of the bounds [FirstUKnotIndex, LastUKnotIndex] FromVK1 or ToVK2 are out of the bounds [FirstVKnotIndex, LastVKnotIndex] 2. SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromK1: int, ToK2: int, USplit: bool, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface This method splits a B-spline surface patche between the knots values FromK1, ToK2 in one direction. If USplit = True then the splitting direction is the U parametric direction else it is the V parametric direction. If S is periodic in the considered direction the patche has the same orientation as S in this direction if SameOrientation is True If S is not periodic in this direction SameOrientation is not used for the computation and S is oriented FromK1 ToK2. Raised if FromK1 = ToK2 or if FromK1 or ToK2 are out of the bounds [FirstUKnotIndex, LastUKnotIndex] in the considered parametric direction. 3. SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromU1: float, ToU2: float, FromV1: float, ToV2: float, ParametricTolerance: float, SameUOrientation: bool = True, SameVOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface This method computes the B-spline surface patche between the parametric values FromU1, ToU2, FromV1, ToV2. If S is periodic in one direction the patche has the same orientation as S in this direction if the flag is True in this direction (SameUOrientation, SameVOrientation). If S is not periodic SameUOrientation and SameVOrientation are not used for the computation and S is oriented FromU1 ToU2 and FromV1 ToV2. If U1 and U2 and two parametric values we consider that U1 = U2 if Abs (U1 - U2) <= ParametricTolerance and ParametricTolerance must be greater or equal to Resolution from package gp. 4. SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromParam1: float, ToParam2: float, USplit: bool, ParametricTolerance: float, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface This method splits the B-spline surface S in one direction between the parametric values FromParam1, ToParam2. If USplit = True then the Splitting direction is the U parametric direction else it is the V parametric direction. If S is periodic in the considered direction the patche has the same orientation as S in this direction if SameOrientation is true. If S is not periodic in the considered direction SameOrientation is not used for the computation and S is oriented FromParam1 ToParam2. If U1 and U2 and two parametric values we consider that U1 = U2 if Abs (U1 - U2) <= ParametricTolerance and ParametricTolerance must be greater or equal to Resolution from package gp.
  SplitBSplineSurface_s(*args, **kwargs)
  SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromUK1: int, ToUK2: int, FromVK1: int, ToVK2: int, SameUOrientation: bool = True, SameVOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface
  SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromK1: int, ToK2: int, USplit: bool, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface
  SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromU1: float, ToU2: float, FromV1: float, ToV2: float, ParametricTolerance: float, SameUOrientation: bool = True, SameVOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface
  SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromParam1: float, ToParam2: float, USplit: bool, ParametricTolerance: float, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface

  // CurveToBSplineCurve_s(C
  // Remarks: This function converts a non infinite curve from Geom into a B-spline curve. C must be an ellipse or a circle or a trimmed conic or a trimmed line or a Bezier curve or a trimmed Bezier curve or a BSpline curve or a trimmed BSpline curve or an OffsetCurve. The returned B-spline is not periodic except if C is a Circle or an Ellipse. If the Parameterisation is QuasiAngular than the returned curve is NOT periodic in case a periodic Geom_Circle or Geom_Ellipse. For TgtThetaOver2_1 and TgtThetaOver2_2 the method raises an exception in case of a periodic Geom_Circle or a Geom_Ellipse ParameterisationType applies only if the curve is a Circle or an ellipse : TgtThetaOver2, -- TgtThetaOver2_1, -- TgtThetaOver2_2, -- TgtThetaOver2_3, -- TgtThetaOver2_4,
  CurveToBSplineCurve_s(C: OCP.OCP.Geom.Geom_Curve, Parameterisation: OCP.OCP.Convert.Convert_ParameterisationType = <Convert_ParameterisationType.Convert_TgtThetaOver2: 0>) -> OCP.OCP.Geom.Geom_BSplineCurve

  // SurfaceToBSplineSurface_s(S
  // Remarks: This algorithm converts a non infinite surface from Geom into a B-spline surface. S must be a trimmed plane or a trimmed cylinder or a trimmed cone or a trimmed sphere or a trimmed torus or a sphere or a torus or a Bezier surface of a trimmed Bezier surface or a trimmed swept surface with a corresponding basis curve which can be turned into a B-spline curve (see the method CurveToBSplineCurve). Raises DomainError if the type of the surface is not previously defined.
  SurfaceToBSplineSurface_s(S: OCP.OCP.Geom.Geom_Surface) -> OCP.OCP.Geom.Geom_BSplineSurface

  // ConcatG1_s(ArrayOfCurves
  // Remarks: This Method concatenates G1 the ArrayOfCurves as far as it is possible. ArrayOfCurves[0..N-1] ArrayOfToler contains the biggest tolerance of the two points shared by two consecutives curves. Its dimension: [0..N-2] ClosedFlag indicates if the ArrayOfCurves is closed. In this case ClosedTolerance contains the biggest tolerance of the two points which are at the closure. Otherwise its value is 0.0 ClosedFlag becomes False on the output if it is impossible to build closed curve.
  ConcatG1_s(ArrayOfCurves: OCP.OCP.TColGeom.TColGeom_Array1OfBSplineCurve, ArrayOfToler: OCP.OCP.TColStd.TColStd_Array1OfReal, ArrayOfConcatenated: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, ClosedTolerance: float) -> tuple[bool]

  // ConcatC1_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. ConcatC1_s(ArrayOfCurves: OCP.OCP.TColGeom.TColGeom_Array1OfBSplineCurve, ArrayOfToler: OCP.OCP.TColStd.TColStd_Array1OfReal, ArrayOfIndices: OCP.OCP.TColStd.TColStd_HArray1OfInteger, ArrayOfConcatenated: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, ClosedTolerance: float) -> tuple[bool] This Method concatenates C1 the ArrayOfCurves as far as it is possible. ArrayOfCurves[0..N-1] ArrayOfToler contains the biggest tolerance of the two points shared by two consecutives curves. Its dimension: [0..N-2] ClosedFlag indicates if the ArrayOfCurves is closed. In this case ClosedTolerance contains the biggest tolerance of the two points which are at the closure. Otherwise its value is 0.0 ClosedFlag becomes False on the output if it is impossible to build closed curve. 2. ConcatC1_s(ArrayOfCurves: OCP.OCP.TColGeom.TColGeom_Array1OfBSplineCurve, ArrayOfToler: OCP.OCP.TColStd.TColStd_Array1OfReal, ArrayOfIndices: OCP.OCP.TColStd.TColStd_HArray1OfInteger, ArrayOfConcatenated: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, ClosedTolerance: float, AngularTolerance: float) -> tuple[bool] This Method concatenates C1 the ArrayOfCurves as far as it is possible. ArrayOfCurves[0..N-1] ArrayOfToler contains the biggest tolerance of the two points shared by two consecutives curves. Its dimension: [0..N-2] ClosedFlag indicates if the ArrayOfCurves is closed. In this case ClosedTolerance contains the biggest tolerance of the two points which are at the closure. Otherwise its value is 0.0 ClosedFlag becomes False on the output if it is impossible to build closed curve.
  ConcatC1_s(*args, **kwargs)
  ConcatC1_s(ArrayOfCurves: OCP.OCP.TColGeom.TColGeom_Array1OfBSplineCurve, ArrayOfToler: OCP.OCP.TColStd.TColStd_Array1OfReal, ArrayOfIndices: OCP.OCP.TColStd.TColStd_HArray1OfInteger, ArrayOfConcatenated: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, ClosedTolerance: float) -> tuple[bool]
  ConcatC1_s(ArrayOfCurves: OCP.OCP.TColGeom.TColGeom_Array1OfBSplineCurve, ArrayOfToler: OCP.OCP.TColStd.TColStd_Array1OfReal, ArrayOfIndices: OCP.OCP.TColStd.TColStd_HArray1OfInteger, ArrayOfConcatenated: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, ClosedTolerance: float, AngularTolerance: float) -> tuple[bool]

  // C0BSplineToC1BSplineCurve_s(BS
  // Remarks: This Method reduces as far as it is possible the multiplicities of the knots of the BSpline BS.(keeping the geometry). It returns a new BSpline which could still be C0. tolerance is a geometrical tolerance. The Angular toleranceis in radians and measures the angle of the tangents on the left and on the right to decide if the curve is G1 or not at a given point
  C0BSplineToC1BSplineCurve_s(BS: OCP.OCP.Geom.Geom_BSplineCurve, tolerance: float, AngularTolerance: float = 1e-07) -> None

  // C0BSplineToArrayOfC1BSplineCurve_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. C0BSplineToArrayOfC1BSplineCurve_s(BS: OCP.OCP.Geom.Geom_BSplineCurve, tabBS: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, tolerance: float) -> None This Method reduces as far as it is possible the multiplicities of the knots of the BSpline BS.(keeping the geometry). It returns an array of BSpline C1. tolerance is a geometrical tolerance. 2. C0BSplineToArrayOfC1BSplineCurve_s(BS: OCP.OCP.Geom.Geom_BSplineCurve, tabBS: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, AngularTolerance: float, tolerance: float) -> None This Method reduces as far as it is possible the multiplicities of the knots of the BSpline BS.(keeping the geometry). It returns an array of BSpline C1. tolerance is a geometrical tolerance : it allows for the maximum deformation The Angular tolerance is in radians and measures the angle of the tangents on the left and on the right to decide if the curve is C1 or not at a given point
  C0BSplineToArrayOfC1BSplineCurve_s(*args, **kwargs)
  C0BSplineToArrayOfC1BSplineCurve_s(BS: OCP.OCP.Geom.Geom_BSplineCurve, tabBS: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, tolerance: float) -> None
  C0BSplineToArrayOfC1BSplineCurve_s(BS: OCP.OCP.Geom.Geom_BSplineCurve, tabBS: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, AngularTolerance: float, tolerance: float) -> None

// Category: GeomConvert
// An algorithm to convert a BSpline curve into a series of adjacent Bezier curves
GeomConvert_BSplineCurveToBezierCurve

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, BasisCurve: OCP.OCP.Geom.Geom_BSplineCurve) -> None 2. __init__(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, BasisCurve: OCP.OCP.Geom.Geom_BSplineCurve, U1: float, U2: float, ParametricTolerance: float) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, BasisCurve: OCP.OCP.Geom.Geom_BSplineCurve) -> None
  __init__(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, BasisCurve: OCP.OCP.Geom.Geom_BSplineCurve, U1: float, U2: float, ParametricTolerance: float) -> None

  // Arc(self
  // Remarks: Constructs and returns the Bezier curve of index Index to the table of adjacent Bezier arcs computed by this algorithm. This Bezier curve has the same orientation as the BSpline curve analyzed in this framework. Exceptions Standard_OutOfRange if Index is less than 1 or greater than the number of adjacent Bezier arcs computed by this algorithm.
  Arc(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, Index: int) -> OCP.OCP.Geom.Geom_BezierCurve

  // Arcs(self
  // Remarks: Constructs all the Bezier curves whose data is computed by this algorithm and loads these curves into the Curves table. The Bezier curves have the same orientation as the BSpline curve analyzed in this framework. Exceptions Standard_DimensionError if the Curves array was not created with the following bounds: - 1 , and - the number of adjacent Bezier arcs computed by this algorithm (as given by the function NbArcs).
  Arcs(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, Curves: OCP.OCP.TColGeom.TColGeom_Array1OfBezierCurve) -> None

  // Knots(self
  // Remarks: This methode returns the bspline's knots associated to the converted arcs Raised if the length of Curves is not equal to NbArcs + 1.
  Knots(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, TKnots: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // NbArcs(self
  // Remarks: Returns the number of BezierCurve arcs. If at the creation time you have decomposed the basis curve between the parametric values UFirst, ULast the number of BezierCurve arcs depends on the number of knots included inside the interval [UFirst, ULast]. If you have decomposed the whole basis B-spline curve the number of BezierCurve arcs NbArcs is equal to the number of knots less one.
  NbArcs(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve) -> int
