# build123d — TopoDS

8 top-level symbols. Signatures are verbatim python.

// Category: TopoDS
// Describes a compound which - references an underlying compound with the potential to be given a location and an orientation - has a location for the underlying compound, giving its placement in the local coordinate system - has an orientation for the underlying compound, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Compound

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Compound) -> None

// Category: TopoDS
// Describes an edge which - references an underlying edge with the potential to be given a location and an orientation - has a location for the underlying edge, giving its placement in the local coordinate system - has an orientation for the underlying edge, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Edge

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Edge) -> None

// Category: TopoDS
// Describes a face which - references an underlying face with the potential to be given a location and an orientation - has a location for the underlying face, giving its placement in the local coordinate system - has an orientation for the underlying face, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Face

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Face) -> None

// Category: TopoDS
// Describes a shape which - references an underlying shape with the potential to be given a location and an orientation - has a location for the underlying shape, giving its placement in the local coordinate system - has an orientation for the underlying shape, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Shape

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // IsNull(self
  // Remarks: Returns true if this shape is null. In other words, it references no underlying shape with the potential to be given a location and an orientation.
  IsNull(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // Nullify(self
  // Remarks: Destroys the reference to the underlying shape stored in this shape. As a result, this shape becomes null.
  Nullify(self: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Location(*args, **kwargs)
  // Remarks: Overloaded function.

1. Location(self: OCP.OCP.TopoDS.TopoDS_Shape, theLoc: OCP.OCP.TopLoc.TopLoc_Location, theRaiseExc: bool = False) -> None

Sets the shape local coordinate system.

2. Location(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopLoc.TopLoc_Location

Returns the shape local coordinate system.
  Location(*args, **kwargs)
  Location(self: OCP.OCP.TopoDS.TopoDS_Shape, theLoc: OCP.OCP.TopLoc.TopLoc_Location, theRaiseExc: bool = False) -> None
  Location(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopLoc.TopLoc_Location

  // Located(self
  // Remarks: Returns a shape similar to <me> with the local coordinate system set to <Loc>.
  Located(self: OCP.OCP.TopoDS.TopoDS_Shape, theLoc: OCP.OCP.TopLoc.TopLoc_Location, theRaiseExc: bool = False) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Orientation(*args, **kwargs)
  // Remarks: Overloaded function.

1. Orientation(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopAbs.TopAbs_Orientation

Returns the shape orientation.

2. Orientation(self: OCP.OCP.TopoDS.TopoDS_Shape, theOrient: OCP.OCP.TopAbs.TopAbs_Orientation) -> None

Sets the shape orientation.
  Orientation(*args, **kwargs)
  Orientation(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopAbs.TopAbs_Orientation
  Orientation(self: OCP.OCP.TopoDS.TopoDS_Shape, theOrient: OCP.OCP.TopAbs.TopAbs_Orientation) -> None

  // Oriented(self
  // Remarks: Returns a shape similar to <me> with the orientation set to <Or>.
  Oriented(self: OCP.OCP.TopoDS.TopoDS_Shape, theOrient: OCP.OCP.TopAbs.TopAbs_Orientation) -> OCP.OCP.TopoDS.TopoDS_Shape

  // ShapeType(self
  // Remarks: Returns the value of the TopAbs_ShapeEnum enumeration that corresponds to this shape, for example VERTEX, EDGE, and so on. Exceptions Standard_NullObject if this shape is null.
  ShapeType(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopAbs.TopAbs_ShapeEnum

  // Free(*args, **kwargs)
  // Remarks: Overloaded function.

1. Free(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

Returns the free flag.

2. Free(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsFree: bool) -> None

Sets the free flag.
  Free(*args, **kwargs)
  Free(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Free(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsFree: bool) -> None

  // Locked(*args, **kwargs)
  // Remarks: Overloaded function.

1. Locked(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

Returns the locked flag.

2. Locked(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsLocked: bool) -> None

Sets the locked flag.
  Locked(*args, **kwargs)
  Locked(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Locked(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsLocked: bool) -> None

  // Modified(*args, **kwargs)
  // Remarks: Overloaded function.

1. Modified(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

Returns the modification flag.

2. Modified(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsModified: bool) -> None

Sets the modification flag.
  Modified(*args, **kwargs)
  Modified(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Modified(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsModified: bool) -> None

  // Checked(*args, **kwargs)
  // Remarks: Overloaded function.

1. Checked(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

Returns the checked flag.

2. Checked(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsChecked: bool) -> None

Sets the checked flag.
  Checked(*args, **kwargs)
  Checked(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Checked(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsChecked: bool) -> None

  // Orientable(*args, **kwargs)
  // Remarks: Overloaded function.

1. Orientable(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

Returns the orientability flag.

2. Orientable(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsOrientable: bool) -> None

Sets the orientability flag.
  Orientable(*args, **kwargs)
  Orientable(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Orientable(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsOrientable: bool) -> None

  // Closed(*args, **kwargs)
  // Remarks: Overloaded function.

1. Closed(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

Returns the closedness flag.

2. Closed(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsClosed: bool) -> None

Sets the closedness flag.
  Closed(*args, **kwargs)
  Closed(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Closed(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsClosed: bool) -> None

  // Infinite(*args, **kwargs)
  // Remarks: Overloaded function.

1. Infinite(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

Returns the infinity flag.

2. Infinite(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsInfinite: bool) -> None

Sets the infinity flag.
  Infinite(*args, **kwargs)
  Infinite(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Infinite(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsInfinite: bool) -> None

  // Convex(*args, **kwargs)
  // Remarks: Overloaded function.

1. Convex(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

Returns the convexness flag.

2. Convex(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsConvex: bool) -> None

Sets the convexness flag.
  Convex(*args, **kwargs)
  Convex(self: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  Convex(self: OCP.OCP.TopoDS.TopoDS_Shape, theIsConvex: bool) -> None

  // Move(self
  // Remarks: Multiplies the Shape location by thePosition.
  Move(self: OCP.OCP.TopoDS.TopoDS_Shape, thePosition: OCP.OCP.TopLoc.TopLoc_Location, theRaiseExc: bool = False) -> None

  // Moved(self
  // Remarks: Returns a shape similar to <me> with a location multiplied by thePosition.
  Moved(self: OCP.OCP.TopoDS.TopoDS_Shape, thePosition: OCP.OCP.TopLoc.TopLoc_Location, theRaiseExc: bool = False) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Reverse(self
  // Remarks: Reverses the orientation, using the Reverse method from the TopAbs package.
  Reverse(self: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Reversed(self
  // Remarks: Returns a shape similar to <me> with the orientation reversed, using the Reverse method from the TopAbs package.
  Reversed(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Complement(self
  // Remarks: Complements the orientation, using the Complement method from the TopAbs package.
  Complement(self: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Complemented(self
  // Remarks: Returns a shape similar to <me> with the orientation complemented, using the Complement method from the TopAbs package.
  Complemented(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Compose(self
  // Remarks: Updates the Shape Orientation by composition with theOrient, using the Compose method from the TopAbs package.
  Compose(self: OCP.OCP.TopoDS.TopoDS_Shape, theOrient: OCP.OCP.TopAbs.TopAbs_Orientation) -> None

  // Composed(self
  // Remarks: Returns a shape similar to <me> with the orientation composed with theOrient, using the Compose method from the TopAbs package.
  Composed(self: OCP.OCP.TopoDS.TopoDS_Shape, theOrient: OCP.OCP.TopAbs.TopAbs_Orientation) -> OCP.OCP.TopoDS.TopoDS_Shape

  // NbChildren(self
  // Remarks: Returns the number of direct sub-shapes (children).
  NbChildren(self: OCP.OCP.TopoDS.TopoDS_Shape) -> int

  // IsPartner(self
  // Remarks: Returns True if two shapes are partners, i.e. if they share the same TShape. Locations and Orientations may differ.
  IsPartner(self: OCP.OCP.TopoDS.TopoDS_Shape, theOther: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // IsSame(self
  // Remarks: Returns True if two shapes are same, i.e. if they share the same TShape with the same Locations. Orientations may differ.
  IsSame(self: OCP.OCP.TopoDS.TopoDS_Shape, theOther: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // IsEqual(self
  // Remarks: Returns True if two shapes are equal, i.e. if they share the same TShape with the same Locations and Orientations.
  IsEqual(self: OCP.OCP.TopoDS.TopoDS_Shape, theOther: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // IsNotEqual(self
  // Remarks: Negation of the IsEqual method.
  IsNotEqual(self: OCP.OCP.TopoDS.TopoDS_Shape, theOther: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // EmptyCopy(self
  // Remarks: Replace <me> by a new Shape with the same Orientation and Location and a new TShape with the same geometry and no sub-shapes.
  EmptyCopy(self: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // EmptyCopied(self
  // Remarks: Returns a new Shape with the same Orientation and Location and a new TShape with the same geometry and no sub-shapes.
  EmptyCopied(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // TShape(*args, **kwargs)
  // Remarks: Overloaded function.

1. TShape(self: OCP.OCP.TopoDS.TopoDS_Shape, theTShape: OCP.OCP.TopoDS.TopoDS_TShape) -> None

2. TShape(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_TShape

Returns a handle to the actual shape implementation.
  TShape(*args, **kwargs)
  TShape(self: OCP.OCP.TopoDS.TopoDS_Shape, theTShape: OCP.OCP.TopoDS.TopoDS_TShape) -> None
  TShape(self: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_TShape

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.TopoDS.TopoDS_Shape, theOStream: io.BytesIO, theDepth: int = -1) -> None

// Category: TopoDS
// Describes a shell which - references an underlying shell with the potential to be given a location and an orientation - has a location for the underlying shell, giving its placement in the local coordinate system - has an orientation for the underlying shell, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Shell

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Shell) -> None

// Category: TopoDS
// Describes a solid shape which - references an underlying solid shape with the potential to be given a location and an orientation - has a location for the underlying shape, giving its placement in the local coordinate system - has an orientation for the underlying shape, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Solid

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Solid) -> None

// Category: TopoDS
// Describes a vertex which - references an underlying vertex with the potential to be given a location and an orientation - has a location for the underlying vertex, giving its placement in the local coordinate system - has an orientation for the underlying vertex, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Vertex

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Vertex) -> None

// Category: TopoDS
// Describes a wire which - references an underlying wire with the potential to be given a location and an orientation - has a location for the underlying wire, giving its placement in the local coordinate system - has an orientation for the underlying wire, in terms of its geometry (as opposed to orientation in relation to other shapes)
TopoDS_Wire

  // __init__(self
  __init__(self: OCP.OCP.TopoDS.TopoDS_Wire) -> None
