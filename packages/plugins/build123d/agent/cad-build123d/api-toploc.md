# build123d — TopLoc

1 top-level symbols. Signatures are verbatim python.

// A Location is a composite transition
TopLoc_Location

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TopLoc.TopLoc_Location) -> None
  __init__(self: OCP.OCP.TopLoc.TopLoc_Location, T: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.TopLoc.TopLoc_Location, D: OCP.OCP.TopLoc.TopLoc_Datum3D) -> None

  // IsIdentity(*args, **kwargs)
  IsIdentity(*args, **kwargs)
  IsIdentity(self: OCP.OCP.TopLoc.TopLoc_Location) -> bool
  IsIdentity(self: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // Identity(*args, **kwargs)
  Identity(*args, **kwargs)
  Identity(self: OCP.OCP.TopLoc.TopLoc_Location) -> None
  Identity(self: OCP.OCP.TopLoc.TopLoc_Location) -> None

  // FirstPower(*args, **kwargs)
  FirstPower(*args, **kwargs)
  FirstPower(self: OCP.OCP.TopLoc.TopLoc_Location) -> int
  FirstPower(self: OCP.OCP.TopLoc.TopLoc_Location) -> int

  // Inverted(self
  Inverted(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Multiplied(self
  Multiplied(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Divided(self
  Divided(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Predivided(self
  Predivided(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Powered(self
  Powered(self: OCP.OCP.TopLoc.TopLoc_Location, pwr: int) -> OCP.OCP.TopLoc.TopLoc_Location

  // HashCode(*args, **kwargs)
  HashCode(*args, **kwargs)
  HashCode(self: OCP.OCP.TopLoc.TopLoc_Location) -> int
  HashCode(self: OCP.OCP.TopLoc.TopLoc_Location) -> int

  // IsEqual(self
  IsEqual(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // IsDifferent(self
  IsDifferent(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // DumpJson(self
  DumpJson(self: OCP.OCP.TopLoc.TopLoc_Location, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // ShallowDump(self
  ShallowDump(self: OCP.OCP.TopLoc.TopLoc_Location, S: io.BytesIO) -> None

  // Clear(self
  Clear(self: OCP.OCP.TopLoc.TopLoc_Location) -> None

  // ScalePrec_s() -> float
  ScalePrec_s() -> float

  // FirstDatum(*args, **kwargs)
  FirstDatum(*args, **kwargs)
  FirstDatum(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Datum3D
  FirstDatum(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Datum3D

  // NextLocation(*args, **kwargs)
  NextLocation(*args, **kwargs)
  NextLocation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location
  NextLocation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Transformation(self
  Transformation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.gp.gp_Trsf
