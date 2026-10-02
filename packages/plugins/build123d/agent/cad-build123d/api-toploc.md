# build123d — TopLoc

1 top-level symbols. Signatures are verbatim python.

// Category: TopLoc
// A Location is a composite transition
TopLoc_Location

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.TopLoc.TopLoc_Location) -> None 2. __init__(self: OCP.OCP.TopLoc.TopLoc_Location, T: OCP.OCP.gp.gp_Trsf) -> None 3. __init__(self: OCP.OCP.TopLoc.TopLoc_Location, D: OCP.OCP.TopLoc.TopLoc_Datum3D) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TopLoc.TopLoc_Location) -> None
  __init__(self: OCP.OCP.TopLoc.TopLoc_Location, T: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.TopLoc.TopLoc_Location, D: OCP.OCP.TopLoc.TopLoc_Datum3D) -> None

  // IsIdentity(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsIdentity(self: OCP.OCP.TopLoc.TopLoc_Location) -> bool Returns true if this location is equal to the Identity transformation. 2. IsIdentity(self: OCP.OCP.TopLoc.TopLoc_Location) -> bool Returns true if this location is equal to the Identity transformation.
  IsIdentity(*args, **kwargs)
  IsIdentity(self: OCP.OCP.TopLoc.TopLoc_Location) -> bool
  IsIdentity(self: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // Identity(*args, **kwargs)
  // Remarks: Overloaded function. 1. Identity(self: OCP.OCP.TopLoc.TopLoc_Location) -> None Resets this location to the Identity transformation. 2. Identity(self: OCP.OCP.TopLoc.TopLoc_Location) -> None Resets this location to the Identity transformation.
  Identity(*args, **kwargs)
  Identity(self: OCP.OCP.TopLoc.TopLoc_Location) -> None
  Identity(self: OCP.OCP.TopLoc.TopLoc_Location) -> None

  // FirstPower(*args, **kwargs)
  // Remarks: Overloaded function. 1. FirstPower(self: OCP.OCP.TopLoc.TopLoc_Location) -> int Returns the power elevation of the first elementary datum. Exceptions Standard_NoSuchObject if this location is empty. 2. FirstPower(self: OCP.OCP.TopLoc.TopLoc_Location) -> int Returns the power elevation of the first elementary datum. Exceptions Standard_NoSuchObject if this location is empty.
  FirstPower(*args, **kwargs)
  FirstPower(self: OCP.OCP.TopLoc.TopLoc_Location) -> int
  FirstPower(self: OCP.OCP.TopLoc.TopLoc_Location) -> int

  // Inverted(self
  // Remarks: Returns the inverse of <me>.
  Inverted(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Multiplied(self
  // Remarks: Returns <me> * <Other>, the elementary datums are concatenated.
  Multiplied(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Divided(self
  // Remarks: Returns <me> / <Other>.
  Divided(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Predivided(self
  // Remarks: Returns <Other>.Inverted() * <me>.
  Predivided(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Powered(self
  // Remarks: Returns me at the power <pwr>. If <pwr> is zero returns Identity. <pwr> can be lower than zero (usual meaning for powers).
  Powered(self: OCP.OCP.TopLoc.TopLoc_Location, pwr: int) -> OCP.OCP.TopLoc.TopLoc_Location

  // HashCode(*args, **kwargs)
  // Remarks: Overloaded function. 1. HashCode(self: OCP.OCP.TopLoc.TopLoc_Location) -> int Returns a hashed value for this local coordinate system. This value is used, with map tables, to store and retrieve the object easily 2. HashCode(self: OCP.OCP.TopLoc.TopLoc_Location) -> int Returns a hashed value for this local coordinate system. This value is used, with map tables, to store and retrieve the object easily
  HashCode(*args, **kwargs)
  HashCode(self: OCP.OCP.TopLoc.TopLoc_Location) -> int
  HashCode(self: OCP.OCP.TopLoc.TopLoc_Location) -> int

  // IsEqual(self
  // Remarks: Returns true if this location and the location Other have the same elementary data, i.e. contain the same series of TopLoc_Datum3D and respective powers. This method is an alias for operator ==.
  IsEqual(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // IsDifferent(self
  // Remarks: Returns true if this location and the location Other do not have the same elementary data, i.e. do not contain the same series of TopLoc_Datum3D and respective powers. This method is an alias for operator !=.
  IsDifferent(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.TopLoc.TopLoc_Location, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // ShallowDump(self
  // Remarks: Prints the contents of <me> on the stream .
  ShallowDump(self: OCP.OCP.TopLoc.TopLoc_Location, S: io.BytesIO) -> None

  // Clear(self
  // Remarks: Clear myItems
  Clear(self: OCP.OCP.TopLoc.TopLoc_Location) -> None

  // ScalePrec_s() -> float
  ScalePrec_s() -> float

  // FirstDatum(*args, **kwargs)
  // Remarks: Overloaded function. 1. FirstDatum(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Datum3D Returns the first elementary datum of the Location. Use the NextLocation function recursively to access the other data comprising this location. Exceptions Standard_NoSuchObject if this location is empty. 2. FirstDatum(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Datum3D Returns the first elementary datum of the Location. Use the NextLocation function recursively to access the other data comprising this location. Exceptions Standard_NoSuchObject if this location is empty.
  FirstDatum(*args, **kwargs)
  FirstDatum(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Datum3D
  FirstDatum(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Datum3D

  // NextLocation(*args, **kwargs)
  // Remarks: Overloaded function. 1. NextLocation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location Returns a Location representing <me> without the first datum. We have the relation : 2. NextLocation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location Returns a Location representing <me> without the first datum. We have the relation :
  NextLocation(*args, **kwargs)
  NextLocation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location
  NextLocation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Transformation(self
  // Remarks: Returns the transformation associated to the coordinate system.
  Transformation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.gp.gp_Trsf
