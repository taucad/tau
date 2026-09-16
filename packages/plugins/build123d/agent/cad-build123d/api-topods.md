# build123d — TopoDS

8 top-level symbols. Signatures are verbatim python.

// Describes a compound which - references an underlying compound with the potential to be given a location and an orientation - has a location for the underlying compound, giving its placement in the local coordinate system - has an orientation for the underlying compound, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Compound

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Compound) -> None

// Describes an edge which - references an underlying edge with the potential to be given a location and an orientation - has a location for the underlying edge, giving its placement in the local coordinate system - has an orientation for the underlying edge, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Edge

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Edge) -> None

// Describes a face which - references an underlying face with the potential to be given a location and an orientation - has a location for the underlying face, giving its placement in the local coordinate system - has an orientation for the underlying face, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Face

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Face) -> None

// Describes a shape which - references an underlying shape with the potential to be given a location and an orientation - has a location for the underlying shape, giving its placement in the local coordinate system - has an orientation for the underlying shape, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Shape

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // IsNull(self
  IsNull(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // Nullify(self
  Nullify(self: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Location(*args, **kwargs)
  Location(*args, **kwargs)
  Location(self: OCP.OCP.TopoDS.TopoDS_Shape, theLoc: OCP.OCP.TopLoc.TopLoc_Location, theRaiseExc: bool = False) -> None
  Location(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopLoc.TopLoc_Location

  // Located(self
  Located(self: OCP.OCP.TopoDS.TopoDS_Shape, theLoc: OCP.OCP.TopLoc.TopLoc_Location, theRaiseExc: bool = False) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Orientation(*args, **kwargs)
  Orientation(*args, **kwargs)
  Orientation(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopAbs.TopAbs_Orientation
  Orientation(self: OCP.OCP.TopoDS.TopoDS_Shape, theOrient: OCP.OCP.TopAbs.TopAbs_Orientation) -> None

  // Oriented(self
  Oriented(self: OCP.OCP.TopoDS.TopoDS_Shape, theOrient: OCP.OCP.TopAbs.TopAbs_Orientation) -> OCP.OCP.TopoDS.TopoDS_Shape

  // ShapeType(self
  ShapeType(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopAbs.TopAbs_ShapeEnum

  // Free(*args, **kwargs)
  Free(*args, **kwargs)
  Free(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Free(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsFree: bool) -> None

  // Locked(*args, **kwargs)
  Locked(*args, **kwargs)
  Locked(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Locked(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsLocked: bool) -> None

  // Modified(*args, **kwargs)
  Modified(*args, **kwargs)
  Modified(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Modified(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsModified: bool) -> None

  // Checked(*args, **kwargs)
  Checked(*args, **kwargs)
  Checked(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Checked(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsChecked: bool) -> None

  // Orientable(*args, **kwargs)
  Orientable(*args, **kwargs)
  Orientable(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Orientable(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsOrientable: bool) -> None

  // Closed(*args, **kwargs)
  Closed(*args, **kwargs)
  Closed(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Closed(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsClosed: bool) -> None

  // Infinite(*args, **kwargs)
  Infinite(*args, **kwargs)
  Infinite(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Infinite(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsInfinite: bool) -> None

  // Convex(*args, **kwargs)
  Convex(*args, **kwargs)
  Convex(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Convex(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsConvex: bool) -> None

  // Move(self
  Move(self: OCP.OCP.TopoDS.TopoDS_Shape, thePosition: OCP.OCP.TopLoc.TopLoc_Location, theRaiseExc: bool = False) -> None

  // Moved(self
  Moved(self: OCP.OCP.TopoDS.TopoDS_Shape, thePosition: OCP.OCP.TopLoc.TopLoc_Location, theRaiseExc: bool = False) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Reverse(self
  Reverse(self: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Reversed(self
  Reversed(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Complement(self
  Complement(self: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Complemented(self
  Complemented(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Compose(self
  Compose(self: OCP.OCP.TopoDS.TopoDS_Shape, theOrient: OCP.OCP.TopAbs.TopAbs_Orientation) -> None

  // Composed(self
  Composed(self: OCP.OCP.TopoDS.TopoDS_Shape, theOrient: OCP.OCP.TopAbs.TopAbs_Orientation) -> OCP.OCP.TopoDS.TopoDS_Shape

  // NbChildren(self
  NbChildren(self: OCP.OCP.TopoDS.TopoDS_Shape) -> int

  // IsPartner(self
  IsPartner(self: OCP.OCP.TopoDS.TopoDS_Shape, theOther: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // IsSame(self
  IsSame(self: OCP.OCP.TopoDS.TopoDS_Shape, theOther: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // IsEqual(self
  IsEqual(self: OCP.OCP.TopoDS.TopoDS_Shape, theOther: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // IsNotEqual(self
  IsNotEqual(self: OCP.OCP.TopoDS.TopoDS_Shape, theOther: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // EmptyCopy(self
  EmptyCopy(self: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // EmptyCopied(self
  EmptyCopied(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // TShape(*args, **kwargs)
  TShape(*args, **kwargs)
  TShape(self: OCP.OCP.TopoDS.TopoDS_Shape, theTShape: OCP.OCP.TopoDS.TopoDS_TShape) -> None
  TShape(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_TShape

  // DumpJson(self
  DumpJson(self: OCP.OCP.TopoDS.TopoDS_Shape, theOStream: io.BytesIO, theDepth: int = -1) -> None

// Describes a shell which - references an underlying shell with the potential to be given a location and an orientation - has a location for the underlying shell, giving its placement in the local coordinate system - has an orientation for the underlying shell, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Shell

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Shell) -> None

// Describes a solid shape which - references an underlying solid shape with the potential to be given a location and an orientation - has a location for the underlying shape, giving its placement in the local coordinate system - has an orientation for the underlying shape, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Solid

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Solid) -> None

// Describes a vertex which - references an underlying vertex with the potential to be given a location and an orientation - has a location for the underlying vertex, giving its placement in the local coordinate system - has an orientation for the underlying vertex, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Vertex

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Vertex) -> None

// Describes a wire which - references an underlying wire with the potential to be given a location and an orientation - has a location for the underlying wire, giving its placement in the local coordinate system - has an orientation for the underlying wire, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Wire

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Wire) -> None
