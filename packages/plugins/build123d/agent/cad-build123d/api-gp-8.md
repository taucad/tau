# build123d — gp (8)

1 top-level symbols. Signatures are verbatim python.

// Category: gp
// This class describes a cartesian coordinate entity in 3D space {X,Y,Z}
gp_XYZ

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.gp.gp_XYZ) -> None 2. __init__(self: OCP.OCP.gp.gp_XYZ, theX: float, theY: float, theZ: float) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_XYZ, theX: float, theY: float, theZ: float) -> None

  // SetCoord(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetCoord(self: OCP.OCP.gp.gp_XYZ, theX: float, theY: float, theZ: float) -> None For this XYZ object, assigns the values theX, theY and theZ to its three coordinates 2. SetCoord(self: OCP.OCP.gp.gp_XYZ, theIndex: int, theXi: float) -> None modifies the coordinate of range theIndex theIndex = 1 => X is modified theIndex = 2 => Y is modified theIndex = 3 => Z is modified Raises OutOfRange if theIndex != {1, 2, 3}.
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_XYZ, theX: float, theY: float, theZ: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_XYZ, theIndex: int, theXi: float) -> None

  // SetX(self
  // Remarks: Assigns the given value to the X coordinate
  SetX(self: OCP.OCP.gp.gp_XYZ, theX: float) -> None

  // SetY(self
  // Remarks: Assigns the given value to the Y coordinate
  SetY(self: OCP.OCP.gp.gp_XYZ, theY: float) -> None

  // SetZ(self
  // Remarks: Assigns the given value to the Z coordinate
  SetZ(self: OCP.OCP.gp.gp_XYZ, theZ: float) -> None

  // Coord(*args, **kwargs)
  // Remarks: Overloaded function. 1. Coord(self: OCP.OCP.gp.gp_XYZ, theIndex: int) -> float returns the coordinate of range theIndex : theIndex = 1 => X is returned theIndex = 2 => Y is returned theIndex = 3 => Z is returned 2. Coord(self: OCP.OCP.gp.gp_XYZ) -> tuple[float, float, float]
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_XYZ, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_XYZ) -> tuple[float, float, float]

  // ChangeCoord(self
  ChangeCoord(self: OCP.OCP.gp.gp_XYZ, theIndex: int) -> float

  // GetData(self
  // Remarks: Returns a const ptr to coordinates location. Is useful for algorithms, but DOES NOT PERFORM ANY CHECKS!
  GetData(self: OCP.OCP.gp.gp_XYZ) -> float

  // ChangeData(self
  // Remarks: Returns a ptr to coordinates location. Is useful for algorithms, but DOES NOT PERFORM ANY CHECKS!
  ChangeData(self: OCP.OCP.gp.gp_XYZ) -> float

  // X(self
  // Remarks: Returns the X coordinate
  X(self: OCP.OCP.gp.gp_XYZ) -> float

  // Y(self
  // Remarks: Returns the Y coordinate
  Y(self: OCP.OCP.gp.gp_XYZ) -> float

  // Z(self
  // Remarks: Returns the Z coordinate
  Z(self: OCP.OCP.gp.gp_XYZ) -> float

  // Modulus(self
  // Remarks: computes Sqrt (X*X + Y*Y + Z*Z) where X, Y and Z are the three coordinates of this XYZ object.
  Modulus(self: OCP.OCP.gp.gp_XYZ) -> float

  // SquareModulus(self
  // Remarks: Computes X*X + Y*Y + Z*Z where X, Y and Z are the three coordinates of this XYZ object.
  SquareModulus(self: OCP.OCP.gp.gp_XYZ) -> float

  // IsEqual(self
  // Remarks: Returns True if he coordinates of this XYZ object are equal to the respective coordinates Other, within the specified tolerance theTolerance. I.e.: abs(<me>.X() - theOther.X()) <= theTolerance and abs(<me>.Y() - theOther.Y()) <= theTolerance and abs(<me>.Z() - theOther.Z()) <= theTolerance.
  IsEqual(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ, theTolerance: float) -> bool

  // Add(self
  Add(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None

  // Added(self
  Added(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Cross(*args, **kwargs)
  // Remarks: Overloaded function. 1. Cross(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None 2. Cross(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> None
  Cross(*args, **kwargs)
  Cross(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None
  Cross(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> None

  // Crossed(self
  Crossed(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // CrossMagnitude(*args, **kwargs)
  // Remarks: Overloaded function. 1. CrossMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float Computes the magnitude of the cross product between <me> and theRight. Returns || <me> ^ theRight || 2. CrossMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float Computes the magnitude of the cross product between <me> and theRight. Returns || <me> ^ theRight ||
  CrossMagnitude(*args, **kwargs)
  CrossMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float
  CrossMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float

  // CrossSquareMagnitude(*args, **kwargs)
  // Remarks: Overloaded function. 1. CrossSquareMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float Computes the square magnitude of the cross product between <me> and theRight. Returns || <me> ^ theRight ||**2 2. CrossSquareMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float Computes the square magnitude of the cross product between <me> and theRight. Returns || <me> ^ theRight ||**2
  CrossSquareMagnitude(*args, **kwargs)
  CrossSquareMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float
  CrossSquareMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float

  // CrossCross(*args, **kwargs)
  // Remarks: Overloaded function. 1. CrossCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> None Triple vector product Computes <me> = <me>.Cross(theCoord1.Cross(theCoord2)) 2. CrossCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> None Triple vector product Computes <me> = <me>.Cross(theCoord1.Cross(theCoord2))
  CrossCross(*args, **kwargs)
  CrossCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> None
  CrossCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> None

  // CrossCrossed(self
  // Remarks: Triple vector product computes New = <me>.Cross(theCoord1.Cross(theCoord2))
  CrossCrossed(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Divide(self
  // Remarks: divides <me> by a real.
  Divide(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> None

  // Divided(self
  // Remarks: divides <me> by a real.
  Divided(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> OCP.OCP.gp.gp_XYZ

  // Dot(self
  // Remarks: computes the scalar product between <me> and theOther
  Dot(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> float

  // DotCross(*args, **kwargs)
  // Remarks: Overloaded function. 1. DotCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> float computes the triple scalar product 2. DotCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> float computes the triple scalar product
  DotCross(*args, **kwargs)
  DotCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> float
  DotCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> float

  // Multiply(*args, **kwargs)
  // Remarks: Overloaded function. 1. Multiply(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> None 2. Multiply(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None 3. Multiply(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> None <me> = theMatrix * <me> 4. Multiply(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> None <me> = theMatrix * <me>
  Multiply(*args, **kwargs)
  Multiply(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> None
  Multiply(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None
  Multiply(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> None
  Multiply(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> None

  // Multiplied(*args, **kwargs)
  // Remarks: Overloaded function. 1. Multiplied(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> OCP.OCP.gp.gp_XYZ 2. Multiplied(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ 3. Multiplied(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> OCP.OCP.gp.gp_XYZ New = theMatrix * <me>
  Multiplied(*args, **kwargs)
  Multiplied(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> OCP.OCP.gp.gp_XYZ
  Multiplied(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ
  Multiplied(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> OCP.OCP.gp.gp_XYZ

  // Normalize(*args, **kwargs)
  // Remarks: Overloaded function. 1. Normalize(self: OCP.OCP.gp.gp_XYZ) -> None Raised if <me>.Modulus() <= Resolution from gp 2. Normalize(self: OCP.OCP.gp.gp_XYZ) -> None Raised if <me>.Modulus() <= Resolution from gp
  Normalize(*args, **kwargs)
  Normalize(self: OCP.OCP.gp.gp_XYZ) -> None
  Normalize(self: OCP.OCP.gp.gp_XYZ) -> None

  // Normalized(self
  // Remarks: Raised if <me>.Modulus() <= Resolution from gp
  Normalized(self: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Reverse(self
  Reverse(self: OCP.OCP.gp.gp_XYZ) -> None

  // Reversed(self
  Reversed(self: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Subtract(self
  Subtract(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None

  // Subtracted(self
  Subtracted(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // SetLinearForm(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theA3: float, theXYZ3: OCP.OCP.gp.gp_XYZ, theXYZ4: OCP.OCP.gp.gp_XYZ) -> None <me> is set to the following linear form : 2. SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theA3: float, theXYZ3: OCP.OCP.gp.gp_XYZ) -> None <me> is set to the following linear form : 3. SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theXYZ3: OCP.OCP.gp.gp_XYZ) -> None <me> is set to the following linear form : 4. SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None <me> is set to the following linear form : 5. SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None <me> is set to the following linear form : 6. SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theXYZ1: OCP.OCP.gp.gp_XYZ, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None <me> is set to the following linear form :
  SetLinearForm(*args, **kwargs)
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theA3: float, theXYZ3: OCP.OCP.gp.gp_XYZ, theXYZ4: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theA3: float, theXYZ3: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theXYZ3: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theXYZ1: OCP.OCP.gp.gp_XYZ, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.gp.gp_XYZ, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // Remarks: Inits the content of me from the stream
  InitFromJson(self: OCP.OCP.gp.gp_XYZ, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool
