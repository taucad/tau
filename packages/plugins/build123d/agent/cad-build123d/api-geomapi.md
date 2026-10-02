# build123d — GeomAPI

3 top-level symbols. Signatures are verbatim python.

// Category: GeomAPI
// This class implements methods for computing intersection points and segments between a
GeomAPI_IntCS

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> None

2. __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, C: OCP.OCP.Geom.Geom_Curve, S: OCP.OCP.Geom.Geom_Surface) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, C: OCP.OCP.Geom.Geom_Curve, S: OCP.OCP.Geom.Geom_Surface) -> None

  // Perform(self
  // Remarks: This function Initializes an algorithm with the curve C and the surface S and computes the intersections between C and S. Warning Use function IsDone to verify that the intersections are computed successfully.
  Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, C: OCP.OCP.Geom.Geom_Curve, S: OCP.OCP.Geom.Geom_Surface) -> None

  // IsDone(self
  // Remarks: Returns true if the intersections are successfully computed.
  IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> bool

  // NbPoints(self
  // Remarks: Returns the number of Intersection Points if IsDone returns True. else NotDone is raised.
  NbPoints(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> int

  // Point(self
  // Remarks: Returns the Intersection Point of range <Index>in case of cross intersection. Raises NotDone if the computation has failed or if the computation has not been done raises OutOfRange if Index is not in the range <1..NbPoints>
  Point(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> OCP.OCP.gp.gp_Pnt

  // NbSegments(self
  // Remarks: Returns the number of computed intersection segments in case of tangential intersection. Exceptions StdFail_NotDone if the intersection algorithm fails or is not initialized.
  NbSegments(self: OCP.OCP.GeomAPI.GeomAPI_IntCS) -> int

  // Segment(self
  // Remarks: Returns the computed intersection segment of index Index in case of tangential intersection. Intersection segment is a portion of the initial curve tangent to surface. Exceptions StdFail_NotDone if intersection algorithm fails or is not initialized. Standard_OutOfRange if Index is not in the range [ 1,NbSegments ], where NbSegments is the number of computed intersection segments.
  Segment(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> OCP.OCP.Geom.Geom_Curve

  // Parameters(*args, **kwargs)
  // Remarks: Overloaded function.

1. Parameters(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> tuple[float, float, float]

Returns parameter W on the curve and (parameters U,V) on the surface of the computed intersection point of index Index in case of cross intersection. Exceptions StdFail_NotDone if intersection algorithm fails or is not initialized. Standard_OutOfRange if Index is not in the range [ 1,NbPoints ], where NbPoints is the number of computed intersection points.

2. Parameters(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> tuple[float, float, float, float]

Returns the parameters of the first (U1,V1) and the last (U2,V2) points of curve's segment on the surface in case of tangential intersection. Index is the number of computed intersection segments. Exceptions StdFail_NotDone if intersection algorithm fails or is not initialized. Standard_OutOfRange if Index is not in the range [ 1,NbSegments ], where NbSegments is the number of computed intersection segments.
  Parameters(*args, **kwargs)
  Parameters(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> tuple[float, float, float]
  Parameters(self: OCP.OCP.GeomAPI.GeomAPI_IntCS, Index: int) -> tuple[float, float, float, float]

// Category: GeomAPI
// This class implements methods for computing the intersection curves between two surfaces
GeomAPI_IntSS

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> None

2. __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None

  // Perform(*args, **kwargs)
  // Remarks: Overloaded function.

1. Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None

Initializes an algorithm with the given arguments and computes the intersection curves between the two surfaces S1 and S2. Parameter Tol defines the precision of curves computation. For most cases the value 1.0e-7 is recommended to use. Warning Use function IsDone to verify that the intersections are successfully computed.

2. Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None

Initializes an algorithm with the given arguments and computes the intersection curves between the two surfaces S1 and S2. Parameter Tol defines the precision of curves computation. For most cases the value 1.0e-7 is recommended to use. Warning Use function IsDone to verify that the intersections are successfully computed.
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None
  Perform(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None

  // IsDone(*args, **kwargs)
  // Remarks: Overloaded function.

1. IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> bool

Returns True if the intersection was successful.

2. IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> bool

Returns True if the intersection was successful.
  IsDone(*args, **kwargs)
  IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> bool
  IsDone(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> bool

  // NbLines(*args, **kwargs)
  // Remarks: Overloaded function.

1. NbLines(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> int

Returns the number of computed intersection curves. Exceptions StdFail_NotDone if the computation fails.

2. NbLines(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> int

Returns the number of computed intersection curves. Exceptions StdFail_NotDone if the computation fails.
  NbLines(*args, **kwargs)
  NbLines(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> int
  NbLines(self: OCP.OCP.GeomAPI.GeomAPI_IntSS) -> int

  // Line(*args, **kwargs)
  // Remarks: Overloaded function.

1. Line(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, Index: int) -> OCP.OCP.Geom.Geom_Curve

Returns the computed intersection curve of index Index. Exceptions StdFail_NotDone if the computation fails. Standard_OutOfRange if Index is out of range [1, NbLines] where NbLines is the number of computed intersection curves.

2. Line(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, I: int) -> OCP.OCP.Geom.Geom_Curve

Returns the computed intersection curve of index Index. Exceptions StdFail_NotDone if the computation fails. Standard_OutOfRange if Index is out of range [1, NbLines] where NbLines is the number of computed intersection curves.
  Line(*args, **kwargs)
  Line(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, Index: int) -> OCP.OCP.Geom.Geom_Curve
  Line(self: OCP.OCP.GeomAPI.GeomAPI_IntSS, I: int) -> OCP.OCP.Geom.Geom_Curve

// Category: GeomAPI
// This class implements methods for computing all the orthogonal projections of a point onto a surface
GeomAPI_ProjectPointOnSurf

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> None

2. __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

3. __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

4. __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

5. __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  __init__(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

  // Init(*args, **kwargs)
  // Remarks: Overloaded function.

1. Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

2. Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

Init the projection of a point <P> on a surface <Surface>. The solution are computed in the domain [Umin,Usup] [Vmin,Vsup] of the surface.

3. Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

4. Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

Init the projection for many points on a surface <Surface>. The solutions will be computed in the domain [Umin,Usup] [Vmin,Vsup] of the surface.

5. Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

6. Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(*args, **kwargs)
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Tolerance: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None
  Init(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Surface: OCP.OCP.Geom.Geom_Surface, Umin: float, Usup: float, Vmin: float, Vsup: float, Algo: OCP.OCP.Extrema.Extrema_ExtAlgo = <Extrema_ExtAlgo.Extrema_ExtAlgo_Grad: 0>) -> None

  // SetExtremaAlgo(self
  // Remarks: Sets the Extrema search algorithm - Grad or Tree. By default the Extrema is initialized with Grad algorithm.
  SetExtremaAlgo(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, theAlgo: OCP.OCP.Extrema.Extrema_ExtAlgo) -> None

  // SetExtremaFlag(self
  // Remarks: Sets the Extrema search flag - MIN or MAX or MINMAX. By default the Extrema is set to search the MinMax solutions.
  SetExtremaFlag(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, theExtFlag: OCP.OCP.Extrema.Extrema_ExtFlag) -> None

  // Perform(self
  // Remarks: Performs the projection of a point on the current surface.
  Perform(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, P: OCP.OCP.gp.gp_Pnt) -> None

  // IsDone(self
  IsDone(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> bool

  // NbPoints(self
  // Remarks: Returns the number of computed orthogonal projection points. Note: if projection fails, NbPoints returns 0.
  NbPoints(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> int

  // Point(self
  // Remarks: Returns the orthogonal projection on the surface. Index is a number of a computed point. Exceptions Standard_OutOfRange if Index is not in the range [ 1,NbPoints ], where NbPoints is the number of solution points.
  Point(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Index: int) -> OCP.OCP.gp.gp_Pnt

  // Distance(self
  // Remarks: Computes the distance between the point and its orthogonal projection on the surface. Index is a number of a computed point. Exceptions Standard_OutOfRange if Index is not in the range [ 1,NbPoints ], where NbPoints is the number of solution points.
  Distance(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Index: int) -> float

  // NearestPoint(self
  // Remarks: Returns the nearest orthogonal projection of the point on the surface. Exceptions StdFail_NotDone if projection fails.
  NearestPoint(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.gp.gp_Pnt

  // LowerDistance(self
  // Remarks: Computes the distance between the point and its nearest orthogonal projection on the surface. Exceptions StdFail_NotDone if projection fails.
  LowerDistance(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> float

  // Parameters(self
  // Remarks: Returns the parameters (U,V) on the surface of the orthogonal projection. Index is a number of a computed point. Exceptions Standard_OutOfRange if Index is not in the range [ 1,NbPoints ], where NbPoints is the number of solution points.
  Parameters(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf, Index: int) -> tuple[float, float]

  // LowerDistanceParameters(self
  // Remarks: Returns the parameters (U,V) on the surface of the nearest computed orthogonal projection of the point. Exceptions StdFail_NotDone if projection fails.
  LowerDistanceParameters(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> tuple[float, float]

  // Extrema(*args, **kwargs)
  // Remarks: Overloaded function.

1. Extrema(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.Extrema.Extrema_ExtPS

return the algorithmic object from Extrema

2. Extrema(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.Extrema.Extrema_ExtPS

return the algorithmic object from Extrema
  Extrema(*args, **kwargs)
  Extrema(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.Extrema.Extrema_ExtPS
  Extrema(self: OCP.OCP.GeomAPI.GeomAPI_ProjectPointOnSurf) -> OCP.OCP.Extrema.Extrema_ExtPS
