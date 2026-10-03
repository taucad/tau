# build123d — gp

2 top-level symbols. Signatures are verbatim python.

// Category: gp
// Describes an axis in 3D space
gp_Ax1

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.gp.gp_Ax1) -> None 2. __init__(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None
  // OCP.OCP.gp.gp_Ax1.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Ax1) -> None
  __init__(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetDirection(self
  // Remarks: Assigns V as the "Direction" of this axis.
  // OCP.OCP.gp.gp_Ax1.SetDirection (method)
  SetDirection(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  // Remarks: Assigns P as the origin of this axis.
  // OCP.OCP.gp.gp_Ax1.SetLocation (method)
  SetLocation(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt) -> None

  // IsCoaxial(self
  // Remarks: Returns True if : . the angle between <me> and <Other> is lower or equal to <AngularTolerance> and . the distance between <me>.Location() and <Other> is lower or equal to <LinearTolerance> and . the distance between <Other>.Location() and <me> is lower or equal to LinearTolerance.
  // OCP.OCP.gp.gp_Ax1.IsCoaxial (method)
  IsCoaxial(self: OCP.OCP.gp.gp_Ax1, Other: OCP.OCP.gp.gp_Ax1, AngularTolerance: float, LinearTolerance: float) -> bool

  // IsNormal(self
  // Remarks: Returns True if the direction of this and another axis are normal to each other. That is, if the angle between the two axes is equal to Pi/2. Note: the tolerance criterion is given by theAngularTolerance.
  // OCP.OCP.gp.gp_Ax1.IsNormal (method)
  IsNormal(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1, theAngularTolerance: float) -> bool

  // IsOpposite(self
  // Remarks: Returns True if the direction of this and another axis are parallel with opposite orientation. That is, if the angle between the two axes is equal to Pi. Note: the tolerance criterion is given by theAngularTolerance.
  // OCP.OCP.gp.gp_Ax1.IsOpposite (method)
  IsOpposite(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1, theAngularTolerance: float) -> bool

  // IsParallel(self
  // Remarks: Returns True if the direction of this and another axis are parallel with same orientation or opposite orientation. That is, if the angle between the two axes is equal to 0 or Pi. Note: the tolerance criterion is given by theAngularTolerance.
  // OCP.OCP.gp.gp_Ax1.IsParallel (method)
  IsParallel(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1, theAngularTolerance: float) -> bool

  // Angle(self
  // Remarks: Computes the angular value, in radians, between this.Direction() and theOther.Direction(). Returns the angle between 0 and 2*PI radians.
  // OCP.OCP.gp.gp_Ax1.Angle (method)
  Angle(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1) -> float

  // Reverse(self
  // Remarks: Reverses the unit vector of this axis and assigns the result to this axis.
  // OCP.OCP.gp.gp_Ax1.Reverse (method)
  Reverse(self: OCP.OCP.gp.gp_Ax1) -> None

  // Reversed(self
  // Remarks: Reverses the unit vector of this axis and creates a new one.
  // OCP.OCP.gp.gp_Ax1.Reversed (method)
  Reversed(self: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax1

  // Mirror(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirror(self: OCP.OCP.gp.gp_Ax1, P: OCP.OCP.gp.gp_Pnt) -> None Performs the symmetrical transformation of an axis placement with respect to the point P which is the center of the symmetry and assigns the result to this axis. 2. Mirror(self: OCP.OCP.gp.gp_Ax1, A1: OCP.OCP.gp.gp_Ax1) -> None Performs the symmetrical transformation of an axis placement with respect to an axis placement which is the axis of the symmetry and assigns the result to this axis. 3. Mirror(self: OCP.OCP.gp.gp_Ax1, A2: OCP.OCP.gp.gp_Ax2) -> None Performs the symmetrical transformation of an axis placement with respect to a plane. The axis placement <A2> locates the plane of the symmetry : (Location, XDirection, YDirection) and assigns the result to this axis.
  // OCP.OCP.gp.gp_Ax1.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Ax1, P: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax1, A1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax1, A2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirrored(self: OCP.OCP.gp.gp_Ax1, P: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax1 Performs the symmetrical transformation of an axis placement with respect to the point P which is the center of the symmetry and creates a new axis. 2. Mirrored(self: OCP.OCP.gp.gp_Ax1, A1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax1 Performs the symmetrical transformation of an axis placement with respect to an axis placement which is the axis of the symmetry and creates a new axis. 3. Mirrored(self: OCP.OCP.gp.gp_Ax1, A2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax1 Performs the symmetrical transformation of an axis placement with respect to a plane. The axis placement <A2> locates the plane of the symmetry : (Location, XDirection, YDirection) and creates a new axis.
  // OCP.OCP.gp.gp_Ax1.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Ax1, P: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax1
  Mirrored(self: OCP.OCP.gp.gp_Ax1, A1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax1
  Mirrored(self: OCP.OCP.gp.gp_Ax1, A2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax1

  // Rotate(self
  // Remarks: Rotates this axis at an angle theAngRad (in radians) about the axis theA1 and assigns the result to this axis.
  // OCP.OCP.gp.gp_Ax1.Rotate (method)
  Rotate(self: OCP.OCP.gp.gp_Ax1, theA1: OCP.OCP.gp.gp_Ax1, theAngRad: float) -> None

  // Rotated(self
  // Remarks: Rotates this axis at an angle theAngRad (in radians) about the axis theA1 and creates a new one.
  // OCP.OCP.gp.gp_Ax1.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Ax1, theA1: OCP.OCP.gp.gp_Ax1, theAngRad: float) -> OCP.OCP.gp.gp_Ax1

  // Scale(self
  // Remarks: Applies a scaling transformation to this axis with: - scale factor theS, and - center theP and assigns the result to this axis.
  // OCP.OCP.gp.gp_Ax1.Scale (method)
  Scale(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // Remarks: Applies a scaling transformation to this axis with: - scale factor theS, and - center theP and creates a new axis.
  // OCP.OCP.gp.gp_Ax1.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Ax1

  // Transform(self
  // Remarks: Applies the transformation theT to this axis and assigns the result to this axis.
  // OCP.OCP.gp.gp_Ax1.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Ax1, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // Remarks: Applies the transformation theT to this axis and creates a new one.
  // OCP.OCP.gp.gp_Ax1.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Ax1, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Ax1

  // Translate(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translate(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Vec) -> None Translates this axis by the vector theV, and assigns the result to this axis. 2. Translate(self: OCP.OCP.gp.gp_Ax1, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None Translates this axis by: the vector (theP1, theP2) defined from point theP1 to point theP2. and assigns the result to this axis.
  // OCP.OCP.gp.gp_Ax1.Translate (method)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Ax1, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translated(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax1 Translates this axis by the vector theV, and creates a new one. 2. Translated(self: OCP.OCP.gp.gp_Ax1, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax1 Translates this axis by: the vector (theP1, theP2) defined from point theP1 to point theP2. and creates a new one.
  // OCP.OCP.gp.gp_Ax1.Translated (method)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax1
  Translated(self: OCP.OCP.gp.gp_Ax1, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax1

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.gp.gp_Ax1.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Ax1, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // Remarks: Inits the content of me from the stream
  // OCP.OCP.gp.gp_Ax1.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Ax1, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Direction(self
  // Remarks: Returns the direction of <me>.
  // OCP.OCP.gp.gp_Ax1.Direction (method)
  Direction(self: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Dir

  // Location(self
  // Remarks: Returns the location point of <me>.
  // OCP.OCP.gp.gp_Ax1.Location (method)
  Location(self: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pnt

// Category: gp
// Describes a right-handed coordinate system in 3D space
gp_Ax2

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.gp.gp_Ax2) -> None 2. __init__(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt, N: OCP.OCP.gp.gp_Dir, Vx: OCP.OCP.gp.gp_Dir) -> None 3. __init__(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None
  // OCP.OCP.gp.gp_Ax2.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Ax2) -> None
  __init__(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt, N: OCP.OCP.gp.gp_Dir, Vx: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None

  // SetAxis(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetAxis(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> None Assigns the origin and "main Direction" of the axis A1 to this coordinate system, then recomputes its "X Direction" and "Y Direction". Note: The new "X Direction" is computed as follows: new "X Direction" = V1 ^(previous "X Direction" ^ V) where V is the "Direction" of A1. Exceptions Standard_ConstructionError if A1 is parallel to the "X Direction" of this coordinate system. 2. SetAxis(self: OCP.OCP.gp.gp_Ax2, theA1: OCP.OCP.gp.gp_Ax1) -> None Assigns the origin and "main Direction" of the axis A1 to this coordinate system, then recomputes its "X Direction" and "Y Direction". Note: The new "X Direction" is computed as follows: new "X Direction" = V1 ^(previous "X Direction" ^ V) where V is the "Direction" of A1. Exceptions Standard_ConstructionError if A1 is parallel to the "X Direction" of this coordinate system.
  // OCP.OCP.gp.gp_Ax2.SetAxis (method)
  SetAxis(*args, **kwargs)
  SetAxis(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> None
  SetAxis(self: OCP.OCP.gp.gp_Ax2, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetDirection(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetDirection(self: OCP.OCP.gp.gp_Ax2, V: OCP.OCP.gp.gp_Dir) -> None Changes the "main Direction" of this coordinate system, then recomputes its "X Direction" and "Y Direction". Note: the new "X Direction" is computed as follows: new "X Direction" = V ^ (previous "X Direction" ^ V) Exceptions Standard_ConstructionError if V is parallel to the "X Direction" of this coordinate system. 2. SetDirection(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Dir) -> None Changes the "main Direction" of this coordinate system, then recomputes its "X Direction" and "Y Direction". Note: the new "X Direction" is computed as follows: new "X Direction" = V ^ (previous "X Direction" ^ V) Exceptions Standard_ConstructionError if V is parallel to the "X Direction" of this coordinate system.
  // OCP.OCP.gp.gp_Ax2.SetDirection (method)
  SetDirection(*args, **kwargs)
  SetDirection(self: OCP.OCP.gp.gp_Ax2, V: OCP.OCP.gp.gp_Dir) -> None
  SetDirection(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  // Remarks: Changes the "Location" point (origin) of <me>.
  // OCP.OCP.gp.gp_Ax2.SetLocation (method)
  SetLocation(self: OCP.OCP.gp.gp_Ax2, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetXDirection(self
  // Remarks: Changes the "Xdirection" of <me>. The main direction "Direction" is not modified, the "Ydirection" is modified. If <Vx> is not normal to the main direction then <XDirection> is computed as follows XDirection = Direction ^ (Vx ^ Direction). Exceptions Standard_ConstructionError if Vx or Vy is parallel to the "main Direction" of this coordinate system.
  // OCP.OCP.gp.gp_Ax2.SetXDirection (method)
  SetXDirection(self: OCP.OCP.gp.gp_Ax2, theVx: OCP.OCP.gp.gp_Dir) -> None

  // SetYDirection(self
  // Remarks: Changes the "Ydirection" of <me>. The main direction is not modified but the "Xdirection" is changed. If <Vy> is not normal to the main direction then "YDirection" is computed as follows YDirection = Direction ^ (<Vy> ^ Direction). Exceptions Standard_ConstructionError if Vx or Vy is parallel to the "main Direction" of this coordinate system.
  // OCP.OCP.gp.gp_Ax2.SetYDirection (method)
  SetYDirection(self: OCP.OCP.gp.gp_Ax2, theVy: OCP.OCP.gp.gp_Dir) -> None

  // Angle(self
  // Remarks: Computes the angular value, in radians, between the main direction of <me> and the main direction of <theOther>. Returns the angle between 0 and PI in radians.
  // OCP.OCP.gp.gp_Ax2.Angle (method)
  Angle(self: OCP.OCP.gp.gp_Ax2, theOther: OCP.OCP.gp.gp_Ax2) -> float

  // IsCoplanar(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsCoplanar(self: OCP.OCP.gp.gp_Ax2, Other: OCP.OCP.gp.gp_Ax2, LinearTolerance: float, AngularTolerance: float) -> bool 2. IsCoplanar(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1, LinearTolerance: float, AngularTolerance: float) -> bool Returns True if . the distance between <me> and the "Location" point of A1 is lower of equal to LinearTolerance and . the main direction of <me> and the direction of A1 are normal. Note: the tolerance criterion for angular equality is given by AngularTolerance. 3. IsCoplanar(self: OCP.OCP.gp.gp_Ax2, theOther: OCP.OCP.gp.gp_Ax2, theLinearTolerance: float, theAngularTolerance: float) -> bool 4. IsCoplanar(self: OCP.OCP.gp.gp_Ax2, theA: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool Returns True if . the distance between <me> and the "Location" point of A1 is lower of equal to LinearTolerance and . the main direction of <me> and the direction of A1 are normal. Note: the tolerance criterion for angular equality is given by AngularTolerance.
  // OCP.OCP.gp.gp_Ax2.IsCoplanar (method)
  IsCoplanar(*args, **kwargs)
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, Other: OCP.OCP.gp.gp_Ax2, LinearTolerance: float, AngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1, LinearTolerance: float, AngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, theOther: OCP.OCP.gp.gp_Ax2, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, theA: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // Mirror(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirror(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt) -> None Performs a symmetrical transformation of this coordinate system with respect to: - the point P, and assigns the result to this coordinate system. Warning This transformation is always performed on the origin. In case of a reflection with respect to a point: - the main direction of the coordinate system is not changed, and - the "X Direction" and the "Y Direction" are simply reversed In case of a reflection with respect to an axis or a plane: - the transformation is applied to the "X Direction" and the "Y Direction", then - the "main Direction" is recomputed as the cross product "X Direction" ^ "Y Direction". This maintains the right-handed property of the coordinate system. 2. Mirror(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> None Performs a symmetrical transformation of this coordinate system with respect to: - the axis A1, and assigns the result to this coordinate systeme. Warning This transformation is always performed on the origin. In case of a reflection with respect to a point: - the main direction of the coordinate system is not changed, and - the "X Direction" and the "Y Direction" are simply reversed In case of a reflection with respect to an axis or a plane: - the transformation is applied to the "X Direction" and the "Y Direction", then - the "main Direction" is recomputed as the cross product "X Direction" ^ "Y Direction". This maintains the right-handed property of the coordinate system. 3. Mirror(self: OCP.OCP.gp.gp_Ax2, A2: OCP.OCP.gp.gp_Ax2) -> None Performs a symmetrical transformation of this coordinate system with respect to: - the plane defined by the origin, "X Direction" and "Y Direction" of coordinate system A2 and assigns the result to this coordinate systeme. Warning This transformation is always performed on the origin. In case of a reflection with respect to a point: - the main direction of the coordinate system is not changed, and - the "X Direction" and the "Y Direction" are simply reversed In case of a reflection with respect to an axis or a plane: - the transformation is applied to the "X Direction" and the "Y Direction", then - the "main Direction" is recomputed as the cross product "X Direction" ^ "Y Direction". This maintains the right-handed property of the coordinate system.
  // OCP.OCP.gp.gp_Ax2.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax2, A2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirrored(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax2 Performs a symmetrical transformation of this coordinate system with respect to: - the point P, and creates a new one. Warning This transformation is always performed on the origin. In case of a reflection with respect to a point: - the main direction of the coordinate system is not changed, and - the "X Direction" and the "Y Direction" are simply reversed In case of a reflection with respect to an axis or a plane: - the transformation is applied to the "X Direction" and the "Y Direction", then - the "main Direction" is recomputed as the cross product "X Direction" ^ "Y Direction". This maintains the right-handed property of the coordinate system. 2. Mirrored(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax2 Performs a symmetrical transformation of this coordinate system with respect to: - the axis A1, and creates a new one. Warning This transformation is always performed on the origin. In case of a reflection with respect to a point: - the main direction of the coordinate system is not changed, and - the "X Direction" and the "Y Direction" are simply reversed In case of a reflection with respect to an axis or a plane: - the transformation is applied to the "X Direction" and the "Y Direction", then - the "main Direction" is recomputed as the cross product "X Direction" ^ "Y Direction". This maintains the right-handed property of the coordinate system. 3. Mirrored(self: OCP.OCP.gp.gp_Ax2, A2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax2 Performs a symmetrical transformation of this coordinate system with respect to: - the plane defined by the origin, "X Direction" and "Y Direction" of coordinate system A2 and creates a new one. Warning This transformation is always performed on the origin. In case of a reflection with respect to a point: - the main direction of the coordinate system is not changed, and - the "X Direction" and the "Y Direction" are simply reversed In case of a reflection with respect to an axis or a plane: - the transformation is applied to the "X Direction" and the "Y Direction", then - the "main Direction" is recomputed as the cross product "X Direction" ^ "Y Direction". This maintains the right-handed property of the coordinate system.
  // OCP.OCP.gp.gp_Ax2.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax2
  Mirrored(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax2
  Mirrored(self: OCP.OCP.gp.gp_Ax2, A2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax2

  // Rotate(self
  // OCP.OCP.gp.gp_Ax2.Rotate (method)
  Rotate(self: OCP.OCP.gp.gp_Ax2, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // Remarks: Rotates an axis placement. <theA1> is the axis of the rotation. theAng is the angular value of the rotation in radians.
  // OCP.OCP.gp.gp_Ax2.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Ax2, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Ax2

  // Scale(self
  // OCP.OCP.gp.gp_Ax2.Scale (method)
  Scale(self: OCP.OCP.gp.gp_Ax2, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // Remarks: Applies a scaling transformation on the axis placement. The "Location" point of the axisplacement is modified. Warnings : If the scale <S> is negative : . the main direction of the axis placement is not changed. . The "XDirection" and the "YDirection" are reversed. So the axis placement stay right handed.
  // OCP.OCP.gp.gp_Ax2.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Ax2, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Ax2

  // Transform(self
  // OCP.OCP.gp.gp_Ax2.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Ax2, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // Remarks: Transforms an axis placement with a Trsf. The "Location" point, the "XDirection" and the "YDirection" are transformed with theT. The resulting main "Direction" of <me> is the cross product between the "XDirection" and the "YDirection" after transformation.
  // OCP.OCP.gp.gp_Ax2.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Ax2, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Ax2

  // Translate(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translate(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Vec) -> None 2. Translate(self: OCP.OCP.gp.gp_Ax2, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  // OCP.OCP.gp.gp_Ax2.Translate (method)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Ax2, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translated(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax2 Translates an axis plaxement in the direction of the vector <theV>. The magnitude of the translation is the vector's magnitude. 2. Translated(self: OCP.OCP.gp.gp_Ax2, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax2 Translates an axis placement from the point <theP1> to the point <theP2>.
  // OCP.OCP.gp.gp_Ax2.Translated (method)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax2
  Translated(self: OCP.OCP.gp.gp_Ax2, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax2

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.gp.gp_Ax2.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Ax2, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // Remarks: Inits the content of me from the stream
  // OCP.OCP.gp.gp_Ax2.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Ax2, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Axis(self
  // Remarks: Returns the main axis of <me>. It is the "Location" point and the main "Direction".
  // OCP.OCP.gp.gp_Ax2.Axis (method)
  Axis(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax1

  // Direction(self
  // Remarks: Returns the main direction of <me>.
  // OCP.OCP.gp.gp_Ax2.Direction (method)
  Direction(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

  // Location(self
  // Remarks: Returns the "Location" point (origin) of <me>.
  // OCP.OCP.gp.gp_Ax2.Location (method)
  Location(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pnt

  // XDirection(self
  // Remarks: Returns the "XDirection" of <me>.
  // OCP.OCP.gp.gp_Ax2.XDirection (method)
  XDirection(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

  // YDirection(self
  // Remarks: Returns the "YDirection" of <me>.
  // OCP.OCP.gp.gp_Ax2.YDirection (method)
  YDirection(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir
