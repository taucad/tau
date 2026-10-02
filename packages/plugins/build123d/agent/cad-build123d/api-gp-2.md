# build123d — gp (2)

1 top-level symbols. Signatures are verbatim python.

// Category: gp
// Describes a coordinate system in 3D space
gp_Ax3

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.gp.gp_Ax3) -> None 2. __init__(self: OCP.OCP.gp.gp_Ax3, theA: OCP.OCP.gp.gp_Ax2) -> None 3. __init__(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theN: OCP.OCP.gp.gp_Dir, theVx: OCP.OCP.gp.gp_Dir) -> None 4. __init__(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None
  // OCP.OCP.gp.gp_Ax3.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Ax3) -> None
  __init__(self: OCP.OCP.gp.gp_Ax3, theA: OCP.OCP.gp.gp_Ax2) -> None
  __init__(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theN: OCP.OCP.gp.gp_Dir, theVx: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None

  // XReverse(self
  // Remarks: Reverses the X direction of <me>.
  // OCP.OCP.gp.gp_Ax3.XReverse (method)
  XReverse(self: OCP.OCP.gp.gp_Ax3) -> None

  // YReverse(self
  // Remarks: Reverses the Y direction of <me>.
  // OCP.OCP.gp.gp_Ax3.YReverse (method)
  YReverse(self: OCP.OCP.gp.gp_Ax3) -> None

  // ZReverse(self
  // Remarks: Reverses the Z direction of <me>.
  // OCP.OCP.gp.gp_Ax3.ZReverse (method)
  ZReverse(self: OCP.OCP.gp.gp_Ax3) -> None

  // SetAxis(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetAxis(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None Assigns the origin and "main Direction" of the axis theA1 to this coordinate system, then recomputes its "X Direction" and "Y Direction". Note: - The new "X Direction" is computed as follows: new "X Direction" = V1 ^(previous "X Direction" ^ V) where V is the "Direction" of theA1. - The orientation of this coordinate system (right-handed or left-handed) is not modified. Raises ConstructionError if the "Direction" of <theA1> and the "XDirection" of <me> are parallel (same or opposite orientation) because it is impossible to calculate the new "XDirection" and the new "YDirection". 2. SetAxis(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None Assigns the origin and "main Direction" of the axis theA1 to this coordinate system, then recomputes its "X Direction" and "Y Direction". Note: - The new "X Direction" is computed as follows: new "X Direction" = V1 ^(previous "X Direction" ^ V) where V is the "Direction" of theA1. - The orientation of this coordinate system (right-handed or left-handed) is not modified. Raises ConstructionError if the "Direction" of <theA1> and the "XDirection" of <me> are parallel (same or opposite orientation) because it is impossible to calculate the new "XDirection" and the new "YDirection".
  // OCP.OCP.gp.gp_Ax3.SetAxis (method)
  SetAxis(*args, **kwargs)
  SetAxis(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None
  SetAxis(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetDirection(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetDirection(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Dir) -> None Changes the main direction of this coordinate system, then recomputes its "X Direction" and "Y Direction". Note: - The new "X Direction" is computed as follows: new "X Direction" = theV ^ (previous "X Direction" ^ theV). - The orientation of this coordinate system (left- or right-handed) is not modified. Raises ConstructionError if <theV> and the previous "XDirection" are parallel because it is impossible to calculate the new "XDirection" and the new "YDirection". 2. SetDirection(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Dir) -> None Changes the main direction of this coordinate system, then recomputes its "X Direction" and "Y Direction". Note: - The new "X Direction" is computed as follows: new "X Direction" = theV ^ (previous "X Direction" ^ theV). - The orientation of this coordinate system (left- or right-handed) is not modified. Raises ConstructionError if <theV> and the previous "XDirection" are parallel because it is impossible to calculate the new "XDirection" and the new "YDirection".
  // OCP.OCP.gp.gp_Ax3.SetDirection (method)
  SetDirection(*args, **kwargs)
  SetDirection(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Dir) -> None
  SetDirection(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  // Remarks: Changes the "Location" point (origin) of <me>.
  // OCP.OCP.gp.gp_Ax3.SetLocation (method)
  SetLocation(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetXDirection(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetXDirection(self: OCP.OCP.gp.gp_Ax3, theVx: OCP.OCP.gp.gp_Dir) -> None Changes the "Xdirection" of <me>. The main direction "Direction" is not modified, the "Ydirection" is modified. If <theVx> is not normal to the main direction then <XDirection> is computed as follows XDirection = Direction ^ (theVx ^ Direction). Raises ConstructionError if <theVx> is parallel (same or opposite orientation) to the main direction of <me> 2. SetXDirection(self: OCP.OCP.gp.gp_Ax3, theVx: OCP.OCP.gp.gp_Dir) -> None Changes the "Xdirection" of <me>. The main direction "Direction" is not modified, the "Ydirection" is modified. If <theVx> is not normal to the main direction then <XDirection> is computed as follows XDirection = Direction ^ (theVx ^ Direction). Raises ConstructionError if <theVx> is parallel (same or opposite orientation) to the main direction of <me>
  // OCP.OCP.gp.gp_Ax3.SetXDirection (method)
  SetXDirection(*args, **kwargs)
  SetXDirection(self: OCP.OCP.gp.gp_Ax3, theVx: OCP.OCP.gp.gp_Dir) -> None
  SetXDirection(self: OCP.OCP.gp.gp_Ax3, theVx: OCP.OCP.gp.gp_Dir) -> None

  // SetYDirection(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetYDirection(self: OCP.OCP.gp.gp_Ax3, theVy: OCP.OCP.gp.gp_Dir) -> None Changes the "Ydirection" of <me>. The main direction is not modified but the "Xdirection" is changed. If <theVy> is not normal to the main direction then "YDirection" is computed as follows YDirection = Direction ^ (<theVy> ^ Direction). Raises ConstructionError if <theVy> is parallel to the main direction of <me> 2. SetYDirection(self: OCP.OCP.gp.gp_Ax3, theVy: OCP.OCP.gp.gp_Dir) -> None Changes the "Ydirection" of <me>. The main direction is not modified but the "Xdirection" is changed. If <theVy> is not normal to the main direction then "YDirection" is computed as follows YDirection = Direction ^ (<theVy> ^ Direction). Raises ConstructionError if <theVy> is parallel to the main direction of <me>
  // OCP.OCP.gp.gp_Ax3.SetYDirection (method)
  SetYDirection(*args, **kwargs)
  SetYDirection(self: OCP.OCP.gp.gp_Ax3, theVy: OCP.OCP.gp.gp_Dir) -> None
  SetYDirection(self: OCP.OCP.gp.gp_Ax3, theVy: OCP.OCP.gp.gp_Dir) -> None

  // Angle(self
  // Remarks: Computes the angular value between the main direction of <me> and the main direction of <theOther>. Returns the angle between 0 and PI in radians.
  // OCP.OCP.gp.gp_Ax3.Angle (method)
  Angle(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3) -> float

  // Ax2(*args, **kwargs)
  // Remarks: Overloaded function. 1. Ax2(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax2 Computes a right-handed coordinate system with the same "X Direction" and "Y Direction" as those of this coordinate system, then recomputes the "main Direction". If this coordinate system is right-handed, the result returned is the same coordinate system. If this coordinate system is left-handed, the result is reversed. 2. Ax2(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax2 Computes a right-handed coordinate system with the same "X Direction" and "Y Direction" as those of this coordinate system, then recomputes the "main Direction". If this coordinate system is right-handed, the result returned is the same coordinate system. If this coordinate system is left-handed, the result is reversed.
  // OCP.OCP.gp.gp_Ax3.Ax2 (method)
  Ax2(*args, **kwargs)
  Ax2(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax2
  Ax2(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax2

  // Direct(self
  // Remarks: Returns True if the coordinate system is right-handed. i.e. XDirection().Crossed(YDirection()).Dot(Direction()) > 0
  // OCP.OCP.gp.gp_Ax3.Direct (method)
  Direct(self: OCP.OCP.gp.gp_Ax3) -> bool

  // IsCoplanar(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3, theLinearTolerance: float, theAngularTolerance: float) -> bool Returns True if . the distance between the "Location" point of <me> and <theOther> is lower or equal to theLinearTolerance and . the distance between the "Location" point of <theOther> and <me> is lower or equal to theLinearTolerance and . the main direction of <me> and the main direction of <theOther> are parallel (same or opposite orientation). 2. IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool Returns True if . the distance between <me> and the "Location" point of theA1 is lower of equal to theLinearTolerance and . the distance between theA1 and the "Location" point of <me> is lower or equal to theLinearTolerance and . the main direction of <me> and the direction of theA1 are normal. 3. IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3, theLinearTolerance: float, theAngularTolerance: float) -> bool Returns True if . the distance between the "Location" point of <me> and <theOther> is lower or equal to theLinearTolerance and . the distance between the "Location" point of <theOther> and <me> is lower or equal to theLinearTolerance and . the main direction of <me> and the main direction of <theOther> are parallel (same or opposite orientation). 4. IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool Returns True if . the distance between <me> and the "Location" point of theA1 is lower of equal to theLinearTolerance and . the distance between theA1 and the "Location" point of <me> is lower or equal to theLinearTolerance and . the main direction of <me> and the direction of theA1 are normal.
  // OCP.OCP.gp.gp_Ax3.IsCoplanar (method)
  IsCoplanar(*args, **kwargs)
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // Mirror(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirror(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> None 2. Mirror(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None 3. Mirror(self: OCP.OCP.gp.gp_Ax3, theA2: OCP.OCP.gp.gp_Ax2) -> None
  // OCP.OCP.gp.gp_Ax3.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax3, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirrored(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax3 Performs the symmetrical transformation of an axis placement with respect to the point theP which is the center of the symmetry. Warnings : The main direction of the axis placement is not changed. The "XDirection" and the "YDirection" are reversed. So the axis placement stay right handed. 2. Mirrored(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax3 Performs the symmetrical transformation of an axis placement with respect to an axis placement which is the axis of the symmetry. The transformation is performed on the "Location" point, on the "XDirection" and "YDirection". The resulting main "Direction" is the cross product between the "XDirection" and the "YDirection" after transformation. 3. Mirrored(self: OCP.OCP.gp.gp_Ax3, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax3 Performs the symmetrical transformation of an axis placement with respect to a plane. The axis placement <theA2> locates the plane of the symmetry : (Location, XDirection, YDirection). The transformation is performed on the "Location" point, on the "XDirection" and "YDirection". The resulting main "Direction" is the cross product between the "XDirection" and the "YDirection" after transformation.
  // OCP.OCP.gp.gp_Ax3.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax3
  Mirrored(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax3
  Mirrored(self: OCP.OCP.gp.gp_Ax3, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax3

  // Rotate(self
  // OCP.OCP.gp.gp_Ax3.Rotate (method)
  Rotate(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // Remarks: Rotates an axis placement. <theA1> is the axis of the rotation . theAng is the angular value of the rotation in radians.
  // OCP.OCP.gp.gp_Ax3.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Ax3

  // Scale(self
  // OCP.OCP.gp.gp_Ax3.Scale (method)
  Scale(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // Remarks: Applies a scaling transformation on the axis placement. The "Location" point of the axisplacement is modified. Warnings : If the scale <theS> is negative : . the main direction of the axis placement is not changed. . The "XDirection" and the "YDirection" are reversed. So the axis placement stay right handed.
  // OCP.OCP.gp.gp_Ax3.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Ax3

  // Transform(self
  // OCP.OCP.gp.gp_Ax3.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Ax3, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // Remarks: Transforms an axis placement with a Trsf. The "Location" point, the "XDirection" and the "YDirection" are transformed with theT. The resulting main "Direction" of <me> is the cross product between the "XDirection" and the "YDirection" after transformation.
  // OCP.OCP.gp.gp_Ax3.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Ax3, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Ax3

  // Translate(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translate(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Vec) -> None 2. Translate(self: OCP.OCP.gp.gp_Ax3, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  // OCP.OCP.gp.gp_Ax3.Translate (method)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Ax3, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translated(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax3 Translates an axis plaxement in the direction of the vector <theV>. The magnitude of the translation is the vector's magnitude. 2. Translated(self: OCP.OCP.gp.gp_Ax3, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax3 Translates an axis placement from the point <theP1> to the point <theP2>.
  // OCP.OCP.gp.gp_Ax3.Translated (method)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax3
  Translated(self: OCP.OCP.gp.gp_Ax3, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax3

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.gp.gp_Ax3.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Ax3, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // Remarks: Inits the content of me from the stream
  // OCP.OCP.gp.gp_Ax3.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Ax3, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Axis(self
  // Remarks: Returns the main axis of <me>. It is the "Location" point and the main "Direction".
  // OCP.OCP.gp.gp_Ax3.Axis (method)
  Axis(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax1

  // Direction(self
  // Remarks: Returns the main direction of <me>.
  // OCP.OCP.gp.gp_Ax3.Direction (method)
  Direction(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Dir

  // Location(self
  // Remarks: Returns the "Location" point (origin) of <me>.
  // OCP.OCP.gp.gp_Ax3.Location (method)
  Location(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Pnt

  // XDirection(self
  // Remarks: Returns the "XDirection" of <me>.
  // OCP.OCP.gp.gp_Ax3.XDirection (method)
  XDirection(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Dir

  // YDirection(self
  // Remarks: Returns the "YDirection" of <me>.
  // OCP.OCP.gp.gp_Ax3.YDirection (method)
  YDirection(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Dir
