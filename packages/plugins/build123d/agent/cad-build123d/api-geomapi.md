# build123d — GeomAPI

3 top-level symbols. Signatures are verbatim python.

// This class implements methods for computing intersection points and segments between a
GeomAPI_IntCS

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> None
**init**(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, C: OCP.OCP.Geom.Geom_Curve, S: OCP.OCP.Geom.Geom_Surface) -> None

// Perform(self
Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, C: OCP.OCP.Geom.Geom_Curve, S: OCP.OCP.Geom.Geom_Surface) -> None

// IsDone(self
IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> bool

// NbPoints(self
NbPoints(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> int

// Point(self
Point(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> OCP.OCP.gp.gp_Pnt

// NbSegments(self
NbSegments(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> int

// Segment(self
Segment(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> OCP.OCP.Geom.Geom_Curve

// Parameters(*args, \*\*kwargs)
Parameters(*args, \*\*kwargs)
Parameters(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> tuple[float, float, float]
Parameters(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> tuple[float, float, float, float]

// This class implements methods for computing the intersection curves between two surfaces
GeomAPI_IntSS

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> None
**init**(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None

// Perform(*args, \*\*kwargs)
Perform(*args, \*\*kwargs)
Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None
Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None

// IsDone(*args, \*\*kwargs)
IsDone(*args, \*\*kwargs)
IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> bool
IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> bool

// NbLines(*args, \*\*kwargs)
NbLines(*args, \*\*kwargs)
NbLines(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> int
NbLines(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> int

// Line(*args, \*\*kwargs)
Line(*args, \*\*kwargs)
Line(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, Index: int) -> OCP.OCP.Geom.Geom_Curve
Line(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, I: int) -> OCP.OCP.Geom.Geom_Curve

// This class implements methods for computing all the orthogonal projections of a point onto a surface
GeomAPI_ProjectPointOnSurf

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> None
**init**(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
**init**(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
**init**(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
**init**(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

// Init(*args, \*\*kwargs)
Init(*args, \*\*kwargs)
Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

// SetExtremaAlgo(self
SetExtremaAlgo(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, theAlgo: OCP.OCP.Extrema.Extrema_ExtAlgo) -> None

// SetExtremaFlag(self
SetExtremaFlag(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, theExtFlag: OCP.OCP.Extrema.Extrema_ExtFlag) -> None

// Perform(self
Perform(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt) -> None

// IsDone(self
IsDone(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> bool

// NbPoints(self
NbPoints(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> int

// Point(self
Point(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Index: int) -> OCP.OCP.gp.gp_Pnt

// Distance(self
Distance(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Index: int) -> float

// NearestPoint(self
NearestPoint(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.gp.gp_Pnt

// LowerDistance(self
LowerDistance(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> float

// Parameters(self
Parameters(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Index: int) -> tuple[float, float]

// LowerDistanceParameters(self
LowerDistanceParameters(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> tuple[float, float]

// Extrema(*args, \*\*kwargs)
Extrema(*args, \*\*kwargs)
Extrema(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.Extrema.Extrema_ExtPS
Extrema(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.Extrema.Extrema_ExtPS
