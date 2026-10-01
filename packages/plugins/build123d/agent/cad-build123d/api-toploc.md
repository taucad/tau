# build123d — TopLoc

1 top-level symbols. Signatures are verbatim python.

// A Location is a composite transition
TopLoc_Location

  // __init__(*args, **kwargs)
  // OCP.OCP.TopLoc.TopLoc_Location.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TopLoc.TopLoc_Location) -> None
  __init__(self: OCP.OCP.TopLoc.TopLoc_Location, T: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.TopLoc.TopLoc_Location, D: OCP.OCP.TopLoc.TopLoc_Datum3D) -> None

  // IsIdentity(*args, **kwargs)
  // OCP.OCP.TopLoc.TopLoc_Location.IsIdentity (method)
  IsIdentity(*args, **kwargs)
  IsIdentity(self: OCP.OCP.TopLoc.TopLoc_Location) -> bool
  IsIdentity(self: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // Identity(*args, **kwargs)
  // OCP.OCP.TopLoc.TopLoc_Location.Identity (method)
  Identity(*args, **kwargs)
  Identity(self: OCP.OCP.TopLoc.TopLoc_Location) -> None
  Identity(self: OCP.OCP.TopLoc.TopLoc_Location) -> None

  // FirstPower(*args, **kwargs)
  // OCP.OCP.TopLoc.TopLoc_Location.FirstPower (method)
  FirstPower(*args, **kwargs)
  FirstPower(self: OCP.OCP.TopLoc.TopLoc_Location) -> int
  FirstPower(self: OCP.OCP.TopLoc.TopLoc_Location) -> int

  // Inverted(self
  // OCP.OCP.TopLoc.TopLoc_Location.Inverted (method)
  Inverted(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Multiplied(self
  // OCP.OCP.TopLoc.TopLoc_Location.Multiplied (method)
  Multiplied(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Divided(self
  // OCP.OCP.TopLoc.TopLoc_Location.Divided (method)
  Divided(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Predivided(self
  // OCP.OCP.TopLoc.TopLoc_Location.Predivided (method)
  Predivided(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Powered(self
  // OCP.OCP.TopLoc.TopLoc_Location.Powered (method)
  Powered(self: OCP.OCP.TopLoc.TopLoc_Location, pwr: int) -> OCP.OCP.TopLoc.TopLoc_Location

  // HashCode(*args, **kwargs)
  // OCP.OCP.TopLoc.TopLoc_Location.HashCode (method)
  HashCode(*args, **kwargs)
  HashCode(self: OCP.OCP.TopLoc.TopLoc_Location) -> int
  HashCode(self: OCP.OCP.TopLoc.TopLoc_Location) -> int

  // IsEqual(self
  // OCP.OCP.TopLoc.TopLoc_Location.IsEqual (method)
  IsEqual(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // IsDifferent(self
  // OCP.OCP.TopLoc.TopLoc_Location.IsDifferent (method)
  IsDifferent(self: OCP.OCP.TopLoc.TopLoc_Location, Other: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // DumpJson(self
  // OCP.OCP.TopLoc.TopLoc_Location.DumpJson (method)
  DumpJson(self: OCP.OCP.TopLoc.TopLoc_Location, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // ShallowDump(self
  // OCP.OCP.TopLoc.TopLoc_Location.ShallowDump (method)
  ShallowDump(self: OCP.OCP.TopLoc.TopLoc_Location, S: io.BytesIO) -> None

  // Clear(self
  // OCP.OCP.TopLoc.TopLoc_Location.Clear (method)
  Clear(self: OCP.OCP.TopLoc.TopLoc_Location) -> None

  // ScalePrec_s() -> float
  // OCP.OCP.TopLoc.TopLoc_Location.ScalePrec_s (method)
  ScalePrec_s() -> float

  // FirstDatum(*args, **kwargs)
  // OCP.OCP.TopLoc.TopLoc_Location.FirstDatum (method)
  FirstDatum(*args, **kwargs)
  FirstDatum(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Datum3D
  FirstDatum(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Datum3D

  // NextLocation(*args, **kwargs)
  // OCP.OCP.TopLoc.TopLoc_Location.NextLocation (method)
  NextLocation(*args, **kwargs)
  NextLocation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location
  NextLocation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TopLoc.TopLoc_Location

  // Transformation(self
  // OCP.OCP.TopLoc.TopLoc_Location.Transformation (method)
  Transformation(self: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.gp.gp_Trsf
