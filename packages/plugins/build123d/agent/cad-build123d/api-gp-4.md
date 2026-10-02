# build123d — gp (4)

2 top-level symbols. Signatures are verbatim python.

// Category: gp
// Describes a line in 3D space
gp_Lin

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.gp.gp_Lin) -> None 2. __init__(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None 3. __init__(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Lin) -> None
  __init__(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None
  __init__(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None

  // Reverse(self
  Reverse(self: OCP.OCP.gp.gp_Lin) -> None

  // Reversed(self
  // Remarks: Reverses the direction of the line. Note: - Reverse assigns the result to this line, while - Reversed creates a new one.
  Reversed(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Lin

  // SetDirection(self
  // Remarks: Changes the direction of the line.
  SetDirection(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  // Remarks: Changes the location point (origin) of the line.
  SetLocation(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetPosition(self
  // Remarks: Complete redefinition of the line. The "Location" point of <theA1> is the origin of the line. The "Direction" of <theA1> is the direction of the line.
  SetPosition(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // Angle(self
  // Remarks: Computes the angle between two lines in radians.
  Angle(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float

  // Contains(self
  // Remarks: Returns true if this line contains the point theP, that is, if the distance between point theP and this line is less than or equal to theLinearTolerance..
  Contains(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theLinearTolerance: float) -> bool

  // Distance(*args, **kwargs)
  // Remarks: Overloaded function. 1. Distance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float Computes the distance between <me> and the point theP. 2. Distance(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float Computes the distance between two lines. 3. Distance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float Computes the distance between <me> and the point theP.
  Distance(*args, **kwargs)
  Distance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float
  Distance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float

  // SquareDistance(*args, **kwargs)
  // Remarks: Overloaded function. 1. SquareDistance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float Computes the square distance between <me> and the point theP. 2. SquareDistance(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float Computes the square distance between two lines. 3. SquareDistance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float Computes the square distance between <me> and the point theP.
  SquareDistance(*args, **kwargs)
  SquareDistance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float

  // Normal(*args, **kwargs)
  // Remarks: Overloaded function. 1. Normal(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin Computes the line normal to the direction of <me>, passing through the point theP. Raises ConstructionError if the distance between <me> and the point theP is lower or equal to Resolution from gp because there is an infinity of solutions in 3D space. 2. Normal(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin Computes the line normal to the direction of <me>, passing through the point theP. Raises ConstructionError if the distance between <me> and the point theP is lower or equal to Resolution from gp because there is an infinity of solutions in 3D space.
  Normal(*args, **kwargs)
  Normal(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin
  Normal(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin

  // Mirror(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirror(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> None 2. Mirror(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None 3. Mirror(self: OCP.OCP.gp.gp_Lin, theA2: OCP.OCP.gp.gp_Ax2) -> None
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Lin, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirrored(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin Performs the symmetrical transformation of a line with respect to the point theP which is the center of the symmetry. 2. Mirrored(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Lin Performs the symmetrical transformation of a line with respect to an axis placement which is the axis of the symmetry. 3. Mirrored(self: OCP.OCP.gp.gp_Lin, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Lin Performs the symmetrical transformation of a line with respect to a plane. The axis placement <theA2> locates the plane of the symmetry : (Location, XDirection, YDirection).
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin
  Mirrored(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Lin
  Mirrored(self: OCP.OCP.gp.gp_Lin, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Lin

  // Rotate(self
  Rotate(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // Remarks: Rotates a line. A1 is the axis of the rotation. Ang is the angular value of the rotation in radians.
  Rotated(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Lin

  // Scale(self
  Scale(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // Remarks: Scales a line. theS is the scaling value. The "Location" point (origin) of the line is modified. The "Direction" is reversed if the scale is negative.
  Scaled(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Lin

  // Transform(self
  Transform(self: OCP.OCP.gp.gp_Lin, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // Remarks: Transforms a line with the transformation theT from class Trsf.
  Transformed(self: OCP.OCP.gp.gp_Lin, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Lin

  // Translate(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translate(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Vec) -> None 2. Translate(self: OCP.OCP.gp.gp_Lin, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Lin, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translated(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Lin Translates a line in the direction of the vector theV. The magnitude of the translation is the vector's magnitude. 2. Translated(self: OCP.OCP.gp.gp_Lin, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin Translates a line from the point theP1 to the point theP2.
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Lin
  Translated(self: OCP.OCP.gp.gp_Lin, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin

  // Direction(self
  // Remarks: Returns the direction of the line.
  Direction(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Dir

  // Location(self
  // Remarks: Returns the location point (origin) of the line.
  Location(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Pnt

  // Position(self
  // Remarks: Returns the axis placement one axis with the same location and direction as <me>.
  Position(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Ax1

// Category: gp
// Describes a plane
gp_Pln

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.gp.gp_Pln) -> None 2. __init__(self: OCP.OCP.gp.gp_Pln, theA3: OCP.OCP.gp.gp_Ax3) -> None 3. __init__(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None 4. __init__(self: OCP.OCP.gp.gp_Pln, theA: float, theB: float, theC: float, theD: float) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Pln) -> None
  __init__(self: OCP.OCP.gp.gp_Pln, theA3: OCP.OCP.gp.gp_Ax3) -> None
  __init__(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Pln, theA: float, theB: float, theC: float, theD: float) -> None

  // SetAxis(self
  // Remarks: Modifies this plane, by redefining its local coordinate system so that - its origin and "main Direction" become those of the axis theA1 (the "X Direction" and "Y Direction" are then recomputed). Raises ConstructionError if the theA1 is parallel to the "XAxis" of the plane.
  SetAxis(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetLocation(self
  // Remarks: Changes the origin of the plane.
  SetLocation(self: OCP.OCP.gp.gp_Pln, theLoc: OCP.OCP.gp.gp_Pnt) -> None

  // SetPosition(self
  // Remarks: Changes the local coordinate system of the plane.
  SetPosition(self: OCP.OCP.gp.gp_Pln, theA3: OCP.OCP.gp.gp_Ax3) -> None

  // UReverse(self
  // Remarks: Reverses the U parametrization of the plane reversing the XAxis.
  UReverse(self: OCP.OCP.gp.gp_Pln) -> None

  // VReverse(self
  // Remarks: Reverses the V parametrization of the plane reversing the YAxis.
  VReverse(self: OCP.OCP.gp.gp_Pln) -> None

  // Direct(self
  // Remarks: returns true if the Ax3 is right handed.
  Direct(self: OCP.OCP.gp.gp_Pln) -> bool

  // Distance(*args, **kwargs)
  // Remarks: Overloaded function. 1. Distance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float Computes the distance between <me> and the point <theP>. 2. Distance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float Computes the distance between <me> and the line <theL>. 3. Distance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float Computes the distance between two planes. 4. Distance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float Computes the distance between <me> and the point <theP>. 5. Distance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float Computes the distance between <me> and the line <theL>. 6. Distance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float Computes the distance between two planes.
  Distance(*args, **kwargs)
  Distance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float

  // SquareDistance(*args, **kwargs)
  // Remarks: Overloaded function. 1. SquareDistance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float Computes the square distance between <me> and the point <theP>. 2. SquareDistance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float Computes the square distance between <me> and the line <theL>. 3. SquareDistance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float Computes the square distance between two planes.
  SquareDistance(*args, **kwargs)
  SquareDistance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float

  // XAxis(self
  // Remarks: Returns the X axis of the plane.
  XAxis(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax1

  // YAxis(self
  // Remarks: Returns the Y axis of the plane.
  YAxis(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax1

  // Contains(*args, **kwargs)
  // Remarks: Overloaded function. 1. Contains(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theLinearTolerance: float) -> bool Returns true if this plane contains the point theP. This means that - the distance between point theP and this plane is less than or equal to theLinearTolerance, or - line L is normal to the "main Axis" of the local coordinate system of this plane, within the tolerance AngularTolerance, and the distance between the origin of line L and this plane is less than or equal to theLinearTolerance. 2. Contains(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin, theLinearTolerance: float, theAngularTolerance: float) -> bool Returns true if this plane contains the line theL. This means that - the distance between point P and this plane is less than or equal to LinearTolerance, or - line theL is normal to the "main Axis" of the local coordinate system of this plane, within the tolerance theAngularTolerance, and the distance between the origin of line theL and this plane is less than or equal to theLinearTolerance.
  Contains(*args, **kwargs)
  Contains(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theLinearTolerance: float) -> bool
  Contains(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // Mirror(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirror(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> None 2. Mirror(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> None 3. Mirror(self: OCP.OCP.gp.gp_Pln, theA2: OCP.OCP.gp.gp_Ax2) -> None
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Pln, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirrored(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pln Performs the symmetrical transformation of a plane with respect to the point <theP> which is the center of the symmetry Warnings : The normal direction to the plane is not changed. The "XAxis" and the "YAxis" are reversed. 2. Mirrored(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pln Performs the symmetrical transformation of a plane with respect to an axis placement which is the axis of the symmetry. The transformation is performed on the "Location" point, on the "XAxis" and the "YAxis". The resulting normal direction is the cross product between the "XDirection" and the "YDirection" after transformation if the initial plane was right handed, else it is the opposite. 3. Mirrored(self: OCP.OCP.gp.gp_Pln, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pln Performs the symmetrical transformation of a plane with respect to an axis placement. The axis placement <A2> locates the plane of the symmetry. The transformation is performed on the "Location" point, on the "XAxis" and the "YAxis". The resulting normal direction is the cross product between the "XDirection" and the "YDirection" after transformation if the initial plane was right handed, else it is the opposite.
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pln
  Mirrored(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pln
  Mirrored(self: OCP.OCP.gp.gp_Pln, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pln

  // Rotate(self
  Rotate(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // Remarks: rotates a plane. theA1 is the axis of the rotation. theAng is the angular value of the rotation in radians.
  Rotated(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Pln

  // Scale(self
  Scale(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // Remarks: Scales a plane. theS is the scaling value.
  Scaled(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Pln

  // Transform(self
  Transform(self: OCP.OCP.gp.gp_Pln, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // Remarks: Transforms a plane with the transformation theT from class Trsf. The transformation is performed on the "Location" point, on the "XAxis" and the "YAxis". The resulting normal direction is the cross product between the "XDirection" and the "YDirection" after transformation.
  Transformed(self: OCP.OCP.gp.gp_Pln, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Pln

  // Translate(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translate(self: OCP.OCP.gp.gp_Pln, theV: OCP.OCP.gp.gp_Vec) -> None 2. Translate(self: OCP.OCP.gp.gp_Pln, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Pln, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Pln, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translated(self: OCP.OCP.gp.gp_Pln, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pln Translates a plane in the direction of the vector theV. The magnitude of the translation is the vector's magnitude. 2. Translated(self: OCP.OCP.gp.gp_Pln, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pln Translates a plane from the point theP1 to the point theP2.
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Pln, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pln
  Translated(self: OCP.OCP.gp.gp_Pln, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pln

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.gp.gp_Pln, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Coefficients(*args, **kwargs)
  // Remarks: Overloaded function. 1. Coefficients(self: OCP.OCP.gp.gp_Pln) -> tuple[float, float, float, float] Returns the coefficients of the plane's cartesian equation : 2. Coefficients(self: OCP.OCP.gp.gp_Pln) -> tuple[float, float, float, float] Returns the coefficients of the plane's cartesian equation :
  Coefficients(*args, **kwargs)
  Coefficients(self: OCP.OCP.gp.gp_Pln) -> tuple[float, float, float, float]
  Coefficients(self: OCP.OCP.gp.gp_Pln) -> tuple[float, float, float, float]

  // Axis(self
  // Remarks: Returns the plane's normal Axis.
  Axis(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax1

  // Location(self
  // Remarks: Returns the plane's location (origin).
  Location(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Pnt

  // Position(self
  // Remarks: Returns the local coordinate system of the plane .
  Position(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax3
