# build123d — Geom (3)

3 top-level symbols. Signatures are verbatim python.

// Category: Geom
// Describes the common behavior of surfaces which have a simple parametric equation in a local coordinate system
Geom_ElementarySurface

  // Initialize self
  Geom_ElementarySurface(*args, **kwargs)

  // SetAxis(self
  // Remarks: Changes the main axis (ZAxis) of the elementary surface.
  SetAxis(self: OCP.OCP.Geom.Geom_ElementarySurface, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetLocation(self
  // Remarks: Changes the location of the local coordinates system of the surface.
  SetLocation(self: OCP.OCP.Geom.Geom_ElementarySurface, theLoc: OCP.OCP.gp.gp_Pnt) -> None

  // SetPosition(self
  // Remarks: Changes the local coordinates system of the surface.
  SetPosition(self: OCP.OCP.Geom.Geom_ElementarySurface, theAx3: OCP.OCP.gp.gp_Ax3) -> None

  // UReverse(self
  // Remarks: Reverses the U parametric direction of the surface.
  UReverse(self: OCP.OCP.Geom.Geom_ElementarySurface) -> None

  // UReversedParameter(self
  // Remarks: Return the parameter on the Ureversed surface for the point of parameter U on <me>.
  UReversedParameter(self: OCP.OCP.Geom.Geom_ElementarySurface, U: float) -> float

  // VReverse(self
  // Remarks: Reverses the V parametric direction of the surface.
  VReverse(self: OCP.OCP.Geom.Geom_ElementarySurface) -> None

  // VReversedParameter(self
  // Remarks: Return the parameter on the Vreversed surface for the point of parameter V on <me>.
  VReversedParameter(self: OCP.OCP.Geom.Geom_ElementarySurface, V: float) -> float

  // Continuity(self
  // Remarks: Returns GeomAbs_CN, the global continuity of any elementary surface.
  Continuity(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // IsCNu(self
  // Remarks: Returns True.
  IsCNu(self: OCP.OCP.Geom.Geom_ElementarySurface, N: int) -> bool

  // IsCNv(self
  // Remarks: Returns True.
  IsCNv(self: OCP.OCP.Geom.Geom_ElementarySurface, N: int) -> bool

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.Geom.Geom_ElementarySurface, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // Axis(self
  // Remarks: Returns the main axis of the surface (ZAxis).
  Axis(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.gp.gp_Ax1

  // Location(self
  // Remarks: Returns the location point of the local coordinate system of the surface.
  Location(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.gp.gp_Pnt

  // Position(self
  // Remarks: Returns the local coordinates system of the surface.
  Position(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.gp.gp_Ax3

  // DynamicType(self
  DynamicType(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.Standard.Standard_Type

// Category: Geom
// Describes an infinite line
Geom_Line

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.Geom.Geom_Line, A1: OCP.OCP.gp.gp_Ax1) -> None

2. __init__(self: OCP.OCP.Geom.Geom_Line, L: OCP.OCP.gp.gp_Lin) -> None

3. __init__(self: OCP.OCP.Geom.Geom_Line, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Geom.Geom_Line, A1: OCP.OCP.gp.gp_Ax1) -> None
  __init__(self: OCP.OCP.Geom.Geom_Line, L: OCP.OCP.gp.gp_Lin) -> None
  __init__(self: OCP.OCP.Geom.Geom_Line, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None

  // SetLin(self
  // Remarks: Set <me> so that <me> has the same geometric properties as L.
  SetLin(self: OCP.OCP.Geom.Geom_Line, L: OCP.OCP.gp.gp_Lin) -> None

  // SetDirection(self
  // Remarks: changes the direction of the line.
  SetDirection(self: OCP.OCP.Geom.Geom_Line, V: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  // Remarks: changes the "Location" point (origin) of the line.
  SetLocation(self: OCP.OCP.Geom.Geom_Line, P: OCP.OCP.gp.gp_Pnt) -> None

  // SetPosition(self
  // Remarks: changes the "Location" and a the "Direction" of <me>.
  SetPosition(self: OCP.OCP.Geom.Geom_Line, A1: OCP.OCP.gp.gp_Ax1) -> None

  // Lin(self
  // Remarks: Returns non transient line from gp with the same geometric properties as <me>
  Lin(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.gp.gp_Lin

  // Reverse(self
  // Remarks: Changes the orientation of this line. As a result, the unit vector of the positioning axis of this line is reversed.
  Reverse(self: OCP.OCP.Geom.Geom_Line) -> None

  // ReversedParameter(self
  // Remarks: Computes the parameter on the reversed line for the point of parameter U on this line. For a line, the returned value is -U.
  ReversedParameter(self: OCP.OCP.Geom.Geom_Line, U: float) -> float

  // FirstParameter(self
  // Remarks: Returns the value of the first parameter of this line. This is Standard_Real::RealFirst().
  FirstParameter(self: OCP.OCP.Geom.Geom_Line) -> float

  // LastParameter(self
  // Remarks: Returns the value of the last parameter of this line. This is Standard_Real::RealLast().
  LastParameter(self: OCP.OCP.Geom.Geom_Line) -> float

  // IsClosed(self
  // Remarks: returns False
  IsClosed(self: OCP.OCP.Geom.Geom_Line) -> bool

  // IsPeriodic(self
  // Remarks: returns False
  IsPeriodic(self: OCP.OCP.Geom.Geom_Line) -> bool

  // Continuity(self
  // Remarks: Returns GeomAbs_CN, which is the global continuity of any line.
  Continuity(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // IsCN(self
  // Remarks: returns True. Raised if N < 0.
  IsCN(self: OCP.OCP.Geom.Geom_Line, N: int) -> bool

  // D0(self
  // Remarks: Returns in P the point of parameter U. P (U) = O + U * Dir where O is the "Location" point of the line and Dir the direction of the line.
  D0(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt) -> None

  // D1(self
  // Remarks: Returns the point P of parameter u and the first derivative V1.
  D1(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // D2(self
  // Remarks: Returns the point P of parameter U, the first and second derivatives V1 and V2. V2 is a vector with null magnitude for a line.
  D2(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // D3(self
  // Remarks: V2 and V3 are vectors with null magnitude for a line.
  D3(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // DN(self
  // Remarks: The returned vector gives the value of the derivative for the order of derivation N. Raised if N < 1.
  DN(self: OCP.OCP.Geom.Geom_Line, U: float, N: int) -> OCP.OCP.gp.gp_Vec

  // Transform(self
  // Remarks: Applies the transformation T to this line.
  Transform(self: OCP.OCP.Geom.Geom_Line, T: OCP.OCP.gp.gp_Trsf) -> None

  // TransformedParameter(self
  // Remarks: Returns the parameter on the transformed curve for the transform of the point of parameter U on <me>.
  TransformedParameter(self: OCP.OCP.Geom.Geom_Line, U: float, T: OCP.OCP.gp.gp_Trsf) -> float

  // ParametricTransformation(self
  // Remarks: Returns a coefficient to compute the parameter on the transformed curve for the transform of the point on <me>.
  ParametricTransformation(self: OCP.OCP.Geom.Geom_Line, T: OCP.OCP.gp.gp_Trsf) -> float

  // Copy(self
  // Remarks: Creates a new object which is a copy of this line.
  Copy(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.Geom.Geom_Geometry

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.Geom.Geom_Line, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // Position(self
  // Remarks: Returns the positioning axis of this line; this is also its local coordinate system.
  Position(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.gp.gp_Ax1

  // DynamicType(self
  DynamicType(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.Standard.Standard_Type

// Category: Geom
// Describes a plane in 3D space
Geom_Plane

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.Geom.Geom_Plane, A3: OCP.OCP.gp.gp_Ax3) -> None

2. __init__(self: OCP.OCP.Geom.Geom_Plane, Pl: OCP.OCP.gp.gp_Pln) -> None

3. __init__(self: OCP.OCP.Geom.Geom_Plane, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None

4. __init__(self: OCP.OCP.Geom.Geom_Plane, A: float, B: float, C: float, D: float) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Geom.Geom_Plane, A3: OCP.OCP.gp.gp_Ax3) -> None
  __init__(self: OCP.OCP.Geom.Geom_Plane, Pl: OCP.OCP.gp.gp_Pln) -> None
  __init__(self: OCP.OCP.Geom.Geom_Plane, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.Geom.Geom_Plane, A: float, B: float, C: float, D: float) -> None

  // SetPln(self
  // Remarks: Set <me> so that <me> has the same geometric properties as Pl.
  SetPln(self: OCP.OCP.Geom.Geom_Plane, Pl: OCP.OCP.gp.gp_Pln) -> None

  // Pln(self
  // Remarks: Converts this plane into a gp_Pln plane.
  Pln(self: OCP.OCP.Geom.Geom_Plane) -> OCP.OCP.gp.gp_Pln

  // UReverse(self
  // Remarks: Changes the orientation of this plane in the u (or v) parametric direction. The bounds of the plane are not changed but the given parametric direction is reversed. Hence the orientation of the surface is reversed.
  UReverse(self: OCP.OCP.Geom.Geom_Plane) -> None

  // UReversedParameter(self
  // Remarks: Computes the u parameter on the modified plane, produced when reversing the u parametric of this plane, for any point of u parameter U on this plane. In the case of a plane, these methods return - -U.
  UReversedParameter(self: OCP.OCP.Geom.Geom_Plane, U: float) -> float

  // VReverse(self
  // Remarks: Changes the orientation of this plane in the u (or v) parametric direction. The bounds of the plane are not changed but the given parametric direction is reversed. Hence the orientation of the surface is reversed.
  VReverse(self: OCP.OCP.Geom.Geom_Plane) -> None

  // VReversedParameter(self
  // Remarks: Computes the v parameter on the modified plane, produced when reversing the v parametric of this plane, for any point of v parameter V on this plane. In the case of a plane, these methods return -V.
  VReversedParameter(self: OCP.OCP.Geom.Geom_Plane, V: float) -> float

  // ParametricTransformation(self
  // Remarks: Returns a 2d transformation used to find the new parameters of a point on the transformed surface. is the same point as Where U',V' are obtained by transforming U,V with the 2d transformation returned by This method returns a scale centered on the origin with T.ScaleFactor
  ParametricTransformation(self: OCP.OCP.Geom.Geom_Plane, T: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_GTrsf2d

  // IsUClosed(self
  // Remarks: return False
  IsUClosed(self: OCP.OCP.Geom.Geom_Plane) -> bool

  // IsVClosed(self
  // Remarks: return False
  IsVClosed(self: OCP.OCP.Geom.Geom_Plane) -> bool

  // IsUPeriodic(self
  // Remarks: return False.
  IsUPeriodic(self: OCP.OCP.Geom.Geom_Plane) -> bool

  // IsVPeriodic(self
  // Remarks: return False.
  IsVPeriodic(self: OCP.OCP.Geom.Geom_Plane) -> bool

  // UIso(self
  // Remarks: Computes the U isoparametric curve. This is a Line parallel to the YAxis of the plane.
  UIso(self: OCP.OCP.Geom.Geom_Plane, U: float) -> OCP.OCP.Geom.Geom_Curve

  // VIso(self
  // Remarks: Computes the V isoparametric curve. This is a Line parallel to the XAxis of the plane.
  VIso(self: OCP.OCP.Geom.Geom_Plane, V: float) -> OCP.OCP.Geom.Geom_Curve

  // D0(self
  // Remarks: Computes the point P (U, V) on <me>. where O is the "Location" point of the plane, XDir the "XDirection" and YDir the "YDirection" of the plane's local coordinate system.
  D0(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt) -> None

  // D1(self
  // Remarks: Computes the current point and the first derivatives in the directions U and V.
  D1(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, D1U: OCP.OCP.gp.gp_Vec, D1V: OCP.OCP.gp.gp_Vec) -> None

  // D2(self
  // Remarks: Computes the current point, the first and the second derivatives in the directions U and V.
  D2(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, D1U: OCP.OCP.gp.gp_Vec, D1V: OCP.OCP.gp.gp_Vec, D2U: OCP.OCP.gp.gp_Vec, D2V: OCP.OCP.gp.gp_Vec, D2UV: OCP.OCP.gp.gp_Vec) -> None

  // D3(self
  // Remarks: Computes the current point, the first,the second and the third derivatives in the directions U and V.
  D3(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, D1U: OCP.OCP.gp.gp_Vec, D1V: OCP.OCP.gp.gp_Vec, D2U: OCP.OCP.gp.gp_Vec, D2V: OCP.OCP.gp.gp_Vec, D2UV: OCP.OCP.gp.gp_Vec, D3U: OCP.OCP.gp.gp_Vec, D3V: OCP.OCP.gp.gp_Vec, D3UUV: OCP.OCP.gp.gp_Vec, D3UVV: OCP.OCP.gp.gp_Vec) -> None

  // DN(self
  // Remarks: Computes the derivative of order Nu in the direction u and Nv in the direction v. Raised if Nu + Nv < 1 or Nu < 0 or Nv < 0.
  DN(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, Nu: int, Nv: int) -> OCP.OCP.gp.gp_Vec

  // Transform(self
  // Remarks: Applies the transformation T to this plane.
  Transform(self: OCP.OCP.Geom.Geom_Plane, T: OCP.OCP.gp.gp_Trsf) -> None

  // Copy(self
  // Remarks: Creates a new object which is a copy of this plane.
  Copy(self: OCP.OCP.Geom.Geom_Plane) -> OCP.OCP.Geom.Geom_Geometry

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.Geom.Geom_Plane, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // TransformParameters(self
  // Remarks: Computes the parameters on the transformed surface for the transform of the point of parameters U,V on <me>. is the same point as Where U',V' are the new values of U,V after calling This method multiplies U and V by T.ScaleFactor()
  TransformParameters(self: OCP.OCP.Geom.Geom_Plane, T: OCP.OCP.gp.gp_Trsf) -> tuple[float, float]

  // Bounds(self
  // Remarks: Returns the parametric bounds U1, U2, V1 and V2 of this plane. Because a plane is an infinite surface, the following is always true: - U1 = V1 = Standard_Real::RealFirst() - U2 = V2 = Standard_Real::RealLast().
  Bounds(self: OCP.OCP.Geom.Geom_Plane) -> tuple[float, float, float, float]

  // Coefficients(self
  // Remarks: Computes the normalized coefficients of the plane's cartesian equation:
  Coefficients(self: OCP.OCP.Geom.Geom_Plane) -> tuple[float, float, float, float]

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.Geom.Geom_Plane) -> OCP.OCP.Standard.Standard_Type
