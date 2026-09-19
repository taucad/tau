# build123d — GeomConvert

2 top-level symbols. Signatures are verbatim python.

// The GeomConvert package provides some global functions as follows - converting classical Geom curves into BSpline curves, - segmenting BSpline curves, particularly at knots values
GeomConvert

  // __init__(self
  __init__(self: OCP.OCP.GeomConvert.GeomConvert) -> None

  // SplitBSplineCurve_s(*args, **kwargs)
  SplitBSplineCurve_s(*args, **kwargs)
  SplitBSplineCurve_s(C: OCP.OCP.Geom.Geom_BSplineCurve, FromK1: int, ToK2: int, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineCurve
  SplitBSplineCurve_s(C: OCP.OCP.Geom.Geom_BSplineCurve, FromU1: float, ToU2: float, ParametricTolerance: float, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineCurve

  // SplitBSplineSurface_s(*args, **kwargs)
  SplitBSplineSurface_s(*args, **kwargs)
  SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromUK1: int, ToUK2: int, FromVK1: int, ToVK2: int, SameUOrientation: bool = True, SameVOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface
  SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromK1: int, ToK2: int, USplit: bool, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface
  SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromU1: float, ToU2: float, FromV1: float, ToV2: float, ParametricTolerance: float, SameUOrientation: bool = True, SameVOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface
  SplitBSplineSurface_s(S: OCP.OCP.Geom.Geom_BSplineSurface, FromParam1: float, ToParam2: float, USplit: bool, ParametricTolerance: float, SameOrientation: bool = True) -> OCP.OCP.Geom.Geom_BSplineSurface

  // CurveToBSplineCurve_s(C
  CurveToBSplineCurve_s(C: OCP.OCP.Geom.Geom_Curve, Parameterisation: OCP.OCP.Convert.Convert_ParameterisationType = <Convert_ParameterisationType.Convert_TgtThetaOver2: 0>) -> OCP.OCP.Geom.Geom_BSplineCurve

  // SurfaceToBSplineSurface_s(S
  SurfaceToBSplineSurface_s(S: OCP.OCP.Geom.Geom_Surface) -> OCP.OCP.Geom.Geom_BSplineSurface

  // ConcatG1_s(ArrayOfCurves
  ConcatG1_s(ArrayOfCurves: OCP.OCP.TColGeom.TColGeom_Array1OfBSplineCurve, ArrayOfToler: OCP.OCP.TColStd.TColStd_Array1OfReal, ArrayOfConcatenated: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, ClosedTolerance: float) -> tuple[bool]

  // ConcatC1_s(*args, **kwargs)
  ConcatC1_s(*args, **kwargs)
  ConcatC1_s(ArrayOfCurves: OCP.OCP.TColGeom.TColGeom_Array1OfBSplineCurve, ArrayOfToler: OCP.OCP.TColStd.TColStd_Array1OfReal, ArrayOfIndices: OCP.OCP.TColStd.TColStd_HArray1OfInteger, ArrayOfConcatenated: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, ClosedTolerance: float) -> tuple[bool]
  ConcatC1_s(ArrayOfCurves: OCP.OCP.TColGeom.TColGeom_Array1OfBSplineCurve, ArrayOfToler: OCP.OCP.TColStd.TColStd_Array1OfReal, ArrayOfIndices: OCP.OCP.TColStd.TColStd_HArray1OfInteger, ArrayOfConcatenated: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, ClosedTolerance: float, AngularTolerance: float) -> tuple[bool]

  // C0BSplineToC1BSplineCurve_s(BS
  C0BSplineToC1BSplineCurve_s(BS: OCP.OCP.Geom.Geom_BSplineCurve, tolerance: float, AngularTolerance: float = 1e-07) -> None

  // C0BSplineToArrayOfC1BSplineCurve_s(*args, **kwargs)
  C0BSplineToArrayOfC1BSplineCurve_s(*args, **kwargs)
  C0BSplineToArrayOfC1BSplineCurve_s(BS: OCP.OCP.Geom.Geom_BSplineCurve, tabBS: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, tolerance: float) -> None
  C0BSplineToArrayOfC1BSplineCurve_s(BS: OCP.OCP.Geom.Geom_BSplineCurve, tabBS: OCP.OCP.TColGeom.TColGeom_HArray1OfBSplineCurve, AngularTolerance: float, tolerance: float) -> None

// An algorithm to convert a BSpline curve into a series of adjacent Bezier curves
GeomConvert_BSplineCurveToBezierCurve

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, BasisCurve: OCP.OCP.Geom.Geom_BSplineCurve) -> None
  __init__(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, BasisCurve: OCP.OCP.Geom.Geom_BSplineCurve, U1: float, U2: float, ParametricTolerance: float) -> None

  // Arc(self
  Arc(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, Index: int) -> OCP.OCP.Geom.Geom_BezierCurve

  // Arcs(self
  Arcs(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, Curves: OCP.OCP.TColGeom.TColGeom_Array1OfBezierCurve) -> None

  // Knots(self
  Knots(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve, TKnots: OCP.OCP.TColStd.TColStd_Array1OfReal) -> None

  // NbArcs(self
  NbArcs(self: OCP.OCP.GeomConvert.GeomConvert_BSplineCurveToBezierCurve) -> int
