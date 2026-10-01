# build123d — GeomAPI

3 top-level symbols. Signatures are verbatim python.

// This class implements methods for computing intersection points and segments between a
GeomAPI_IntCS

  // __init__(*args, **kwargs)
  // OCP.OCP.GeomAPI.GeomAPI_IntCS.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, C: OCP.OCP.Geom.Geom_Curve, S: OCP.OCP.Geom.Geom_Surface) -> None

  // Perform(self
  // OCP.OCP.GeomAPI.GeomAPI_IntCS.Perform (method)
  Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, C: OCP.OCP.Geom.Geom_Curve, S: OCP.OCP.Geom.Geom_Surface) -> None

  // IsDone(self
  // OCP.OCP.GeomAPI.GeomAPI_IntCS.IsDone (method)
  IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> bool

  // NbPoints(self
  // OCP.OCP.GeomAPI.GeomAPI_IntCS.NbPoints (method)
  NbPoints(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> int

  // Point(self
  // OCP.OCP.GeomAPI.GeomAPI_IntCS.Point (method)
  Point(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> OCP.OCP.gp.gp_Pnt

  // NbSegments(self
  // OCP.OCP.GeomAPI.GeomAPI_IntCS.NbSegments (method)
  NbSegments(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> int

  // Segment(self
  // OCP.OCP.GeomAPI.GeomAPI_IntCS.Segment (method)
  Segment(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> OCP.OCP.Geom.Geom_Curve

  // Parameters(*args, **kwargs)
  // OCP.OCP.GeomAPI.GeomAPI_IntCS.Parameters (method)
  Parameters(*args, **kwargs)
  Parameters(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> tuple[float, float, float]
  Parameters(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> tuple[float, float, float, float]

// This class implements methods for computing the intersection curves between two surfaces
GeomAPI_IntSS

  // __init__(*args, **kwargs)
  // OCP.OCP.GeomAPI.GeomAPI_IntSS.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None

  // Perform(*args, **kwargs)
  // OCP.OCP.GeomAPI.GeomAPI_IntSS.Perform (method)
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None
  Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None

  // IsDone(*args, **kwargs)
  // OCP.OCP.GeomAPI.GeomAPI_IntSS.IsDone (method)
  IsDone(*args, **kwargs)
  IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> bool
  IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> bool

  // NbLines(*args, **kwargs)
  // OCP.OCP.GeomAPI.GeomAPI_IntSS.NbLines (method)
  NbLines(*args, **kwargs)
  NbLines(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> int
  NbLines(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> int

  // Line(*args, **kwargs)
  // OCP.OCP.GeomAPI.GeomAPI_IntSS.Line (method)
  Line(*args, **kwargs)
  Line(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, Index: int) -> OCP.OCP.Geom.Geom_Curve
  Line(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, I: int) -> OCP.OCP.Geom.Geom_Curve

// This class implements methods for computing all the orthogonal projections of a point onto a surface
GeomAPI_ProjectPointOnSurf

  // __init__(*args, **kwargs)
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

  // Init(*args, **kwargs)
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.Init (method)
  Init(*args, **kwargs)
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

  // SetExtremaAlgo(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.SetExtremaAlgo (method)
  SetExtremaAlgo(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, theAlgo: OCP.OCP.Extrema.Extrema_ExtAlgo) -> None

  // SetExtremaFlag(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.SetExtremaFlag (method)
  SetExtremaFlag(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, theExtFlag: OCP.OCP.Extrema.Extrema_ExtFlag) -> None

  // Perform(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.Perform (method)
  Perform(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt) -> None

  // IsDone(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.IsDone (method)
  IsDone(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> bool

  // NbPoints(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.NbPoints (method)
  NbPoints(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> int

  // Point(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.Point (method)
  Point(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Index: int) -> OCP.OCP.gp.gp_Pnt

  // Distance(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.Distance (method)
  Distance(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Index: int) -> float

  // NearestPoint(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.NearestPoint (method)
  NearestPoint(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.gp.gp_Pnt

  // LowerDistance(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.LowerDistance (method)
  LowerDistance(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> float

  // Parameters(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.Parameters (method)
  Parameters(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Index: int) -> tuple[float, float]

  // LowerDistanceParameters(self
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.LowerDistanceParameters (method)
  LowerDistanceParameters(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> tuple[float, float]

  // Extrema(*args, **kwargs)
  // OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf.Extrema (method)
  Extrema(*args, **kwargs)
  Extrema(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.Extrema.Extrema_ExtPS
  Extrema(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.Extrema.Extrema_ExtPS
