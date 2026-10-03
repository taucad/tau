# build123d — Bnd

2 top-level symbols. Signatures are verbatim python.

// Category: Bnd
// Describes a bounding box in 3D space
Bnd_Box

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.Bnd.Bnd_Box) -> None 2. __init__(self: OCP.OCP.Bnd.Bnd_Box, theMin: OCP.OCP.gp.gp_Pnt, theMax: OCP.OCP.gp.gp_Pnt) -> None
  // OCP.OCP.Bnd.Bnd_Box.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Bnd.Bnd_Box) -> None
  __init__(self: OCP.OCP.Bnd.Bnd_Box, theMin: OCP.OCP.gp.gp_Pnt, theMax: OCP.OCP.gp.gp_Pnt) -> None

  // SetWhole(self
  // Remarks: Sets this bounding box so that it covers the whole of 3D space. It is infinitely long in all directions.
  // OCP.OCP.Bnd.Bnd_Box.SetWhole (method)
  SetWhole(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // SetVoid(self
  // Remarks: Sets this bounding box so that it is empty. All points are outside a void box.
  // OCP.OCP.Bnd.Bnd_Box.SetVoid (method)
  SetVoid(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // Set(*args, **kwargs)
  // Remarks: Overloaded function. 1. Set(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> None Sets this bounding box so that it bounds - the point P. This involves first setting this bounding box to be void and then adding the point P. 2. Set(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> None Sets this bounding box so that it bounds the half-line defined by point P and direction D, i.e. all points M defined by M=P+u*D, where u is greater than or equal to 0, are inside the bounding volume. This involves first setting this box to be void and then adding the half-line.
  // OCP.OCP.Bnd.Bnd_Box.Set (method)
  Set(*args, **kwargs)
  Set(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> None
  Set(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> None

  // Update(*args, **kwargs)
  // Remarks: Overloaded function. 1. Update(self: OCP.OCP.Bnd.Bnd_Box, aXmin: float, aYmin: float, aZmin: float, aXmax: float, aYmax: float, aZmax: float) -> None Enlarges this bounding box, if required, so that it contains at least: - interval [ aXmin,aXmax ] in the "X Direction", - interval [ aYmin,aYmax ] in the "Y Direction", - interval [ aZmin,aZmax ] in the "Z Direction"; 2. Update(self: OCP.OCP.Bnd.Bnd_Box, X: float, Y: float, Z: float) -> None Adds a point of coordinates (X,Y,Z) to this bounding box.
  // OCP.OCP.Bnd.Bnd_Box.Update (method)
  Update(*args, **kwargs)
  Update(self: OCP.OCP.Bnd.Bnd_Box, aXmin: float, aYmin: float, aZmin: float, aXmax: float, aYmax: float, aZmax: float) -> None
  Update(self: OCP.OCP.Bnd.Bnd_Box, X: float, Y: float, Z: float) -> None

  // GetGap(self
  // Remarks: Returns the gap of this bounding box.
  // OCP.OCP.Bnd.Bnd_Box.GetGap (method)
  GetGap(self: OCP.OCP.Bnd.Bnd_Box) -> float

  // SetGap(self
  // Remarks: Set the gap of this bounding box to abs(Tol).
  // OCP.OCP.Bnd.Bnd_Box.SetGap (method)
  SetGap(self: OCP.OCP.Bnd.Bnd_Box, Tol: float) -> None

  // Enlarge(self
  // Remarks: Enlarges the box with a tolerance value. (minvalues-Abs(<tol>) and maxvalues+Abs(<tol>)) This means that the minimum values of its X, Y and Z intervals of definition, when they are finite, are reduced by the absolute value of Tol, while the maximum values are increased by the same amount.
  // OCP.OCP.Bnd.Bnd_Box.Enlarge (method)
  Enlarge(self: OCP.OCP.Bnd.Bnd_Box, Tol: float) -> None

  // CornerMin(self
  // Remarks: Returns the lower corner of this bounding box. The gap is included. If this bounding box is infinite (i.e. "open"), returned values may be equal to +/- Precision::Infinite(). Standard_ConstructionError exception will be thrown if the box is void. if IsVoid()
  // OCP.OCP.Bnd.Bnd_Box.CornerMin (method)
  CornerMin(self: OCP.OCP.Bnd.Bnd_Box) -> OCP.OCP.gp.gp_Pnt

  // CornerMax(self
  // Remarks: Returns the upper corner of this bounding box. The gap is included. If this bounding box is infinite (i.e. "open"), returned values may be equal to +/- Precision::Infinite(). Standard_ConstructionError exception will be thrown if the box is void. if IsVoid()
  // OCP.OCP.Bnd.Bnd_Box.CornerMax (method)
  CornerMax(self: OCP.OCP.Bnd.Bnd_Box) -> OCP.OCP.gp.gp_Pnt

  // OpenXmin(self
  // Remarks: The Box will be infinitely long in the Xmin direction.
  // OCP.OCP.Bnd.Bnd_Box.OpenXmin (method)
  OpenXmin(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenXmax(self
  // Remarks: The Box will be infinitely long in the Xmax direction.
  // OCP.OCP.Bnd.Bnd_Box.OpenXmax (method)
  OpenXmax(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenYmin(self
  // Remarks: The Box will be infinitely long in the Ymin direction.
  // OCP.OCP.Bnd.Bnd_Box.OpenYmin (method)
  OpenYmin(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenYmax(self
  // Remarks: The Box will be infinitely long in the Ymax direction.
  // OCP.OCP.Bnd.Bnd_Box.OpenYmax (method)
  OpenYmax(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenZmin(self
  // Remarks: The Box will be infinitely long in the Zmin direction.
  // OCP.OCP.Bnd.Bnd_Box.OpenZmin (method)
  OpenZmin(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenZmax(self
  // Remarks: The Box will be infinitely long in the Zmax direction.
  // OCP.OCP.Bnd.Bnd_Box.OpenZmax (method)
  OpenZmax(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // IsOpen(self
  // Remarks: Returns true if this bounding box has at least one open direction.
  // OCP.OCP.Bnd.Bnd_Box.IsOpen (method)
  IsOpen(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenXmin(self
  // Remarks: Returns true if this bounding box is open in the Xmin direction.
  // OCP.OCP.Bnd.Bnd_Box.IsOpenXmin (method)
  IsOpenXmin(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenXmax(self
  // Remarks: Returns true if this bounding box is open in the Xmax direction.
  // OCP.OCP.Bnd.Bnd_Box.IsOpenXmax (method)
  IsOpenXmax(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenYmin(self
  // Remarks: Returns true if this bounding box is open in the Ymix direction.
  // OCP.OCP.Bnd.Bnd_Box.IsOpenYmin (method)
  IsOpenYmin(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenYmax(self
  // Remarks: Returns true if this bounding box is open in the Ymax direction.
  // OCP.OCP.Bnd.Bnd_Box.IsOpenYmax (method)
  IsOpenYmax(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenZmin(self
  // Remarks: Returns true if this bounding box is open in the Zmin direction.
  // OCP.OCP.Bnd.Bnd_Box.IsOpenZmin (method)
  IsOpenZmin(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenZmax(self
  // Remarks: Returns true if this bounding box is open in the Zmax direction.
  // OCP.OCP.Bnd.Bnd_Box.IsOpenZmax (method)
  IsOpenZmax(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsWhole(self
  // Remarks: Returns true if this bounding box is infinite in all 6 directions (WholeSpace flag).
  // OCP.OCP.Bnd.Bnd_Box.IsWhole (method)
  IsWhole(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsVoid(self
  // Remarks: Returns true if this bounding box is empty (Void flag).
  // OCP.OCP.Bnd.Bnd_Box.IsVoid (method)
  IsVoid(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsXThin(self
  // Remarks: true if xmax-xmin < tol.
  // OCP.OCP.Bnd.Bnd_Box.IsXThin (method)
  IsXThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // IsYThin(self
  // Remarks: true if ymax-ymin < tol.
  // OCP.OCP.Bnd.Bnd_Box.IsYThin (method)
  IsYThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // IsZThin(self
  // Remarks: true if zmax-zmin < tol.
  // OCP.OCP.Bnd.Bnd_Box.IsZThin (method)
  IsZThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // IsThin(self
  // Remarks: Returns true if IsXThin, IsYThin and IsZThin are all true, i.e. if the box is thin in all three dimensions.
  // OCP.OCP.Bnd.Bnd_Box.IsThin (method)
  IsThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // Transformed(self
  // Remarks: Returns a bounding box which is the result of applying the transformation T to this bounding box. Warning Applying a geometric transformation (for example, a rotation) to a bounding box generally increases its dimensions. This is not optimal for algorithms which use it.
  // OCP.OCP.Bnd.Bnd_Box.Transformed (method)
  Transformed(self: OCP.OCP.Bnd.Bnd_Box, T: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.Bnd.Bnd_Box

  // Add(*args, **kwargs)
  // Remarks: Overloaded function. 1. Add(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> None Adds the box <Other> to <me>. 2. Add(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> None Adds a Pnt to the box. 3. Add(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> None Extends <me> from the Pnt <P> in the direction <D>. 4. Add(self: OCP.OCP.Bnd.Bnd_Box, D: OCP.OCP.gp.gp_Dir) -> None Extends the Box in the given Direction, i.e. adds an half-line. The box may become infinite in 1,2 or 3 directions.
  // OCP.OCP.Bnd.Bnd_Box.Add (method)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> None
  Add(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> None
  Add(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> None
  Add(self: OCP.OCP.Bnd.Bnd_Box, D: OCP.OCP.gp.gp_Dir) -> None

  // IsOut(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsOut(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> bool Returns True if the Pnt is out the box. 2. IsOut(self: OCP.OCP.Bnd.Bnd_Box, L: OCP.OCP.gp.gp_Lin) -> bool Returns False if the line intersects the box. 3. IsOut(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pln) -> bool Returns False if the plane intersects the box. 4. IsOut(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> bool Returns False if the <Box> intersects or is inside <me>. 5. IsOut(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box, T: OCP.OCP.gp.gp_Trsf) -> bool Returns False if the transformed <Box> intersects or is inside <me>. 6. IsOut(self: OCP.OCP.Bnd.Bnd_Box, T1: OCP.OCP.gp.gp_Trsf, Other: OCP.OCP.Bnd.Bnd_Box, T2: OCP.OCP.gp.gp_Trsf) -> bool Returns False if the transformed <Box> intersects or is inside the transformed box <me>. 7. IsOut(self: OCP.OCP.Bnd.Bnd_Box, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> bool Returns False if the flat band lying between two parallel lines represented by their reference points <P1>, <P2> and direction <D> intersects the box.
  // OCP.OCP.Bnd.Bnd_Box.IsOut (method)
  IsOut(*args, **kwargs)
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, L: OCP.OCP.gp.gp_Lin) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pln) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box, T: OCP.OCP.gp.gp_Trsf) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, T1: OCP.OCP.gp.gp_Trsf, Other: OCP.OCP.Bnd.Bnd_Box, T2: OCP.OCP.gp.gp_Trsf) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> bool

  // Distance(self
  // Remarks: Computes the minimum distance between two boxes.
  // OCP.OCP.Bnd.Bnd_Box.Distance (method)
  Distance(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> float

  // Dump(self
  // OCP.OCP.Bnd.Bnd_Box.Dump (method)
  Dump(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // SquareExtent(self
  // Remarks: Computes the squared diagonal of me.
  // OCP.OCP.Bnd.Bnd_Box.SquareExtent (method)
  SquareExtent(self: OCP.OCP.Bnd.Bnd_Box) -> float

  // FinitePart(self
  // Remarks: Returns a finite part of an infinite bounding box (returns self if this is already finite box). This can be a Void box in case if its sides has been defined as infinite (Open) without adding any finite points. WARNING! This method relies on Open flags, the infinite points added using Add() method will be returned as is.
  // OCP.OCP.Bnd.Bnd_Box.FinitePart (method)
  FinitePart(self: OCP.OCP.Bnd.Bnd_Box) -> OCP.OCP.Bnd.Bnd_Box

  // HasFinitePart(self
  // Remarks: Returns TRUE if this box has finite part.
  // OCP.OCP.Bnd.Bnd_Box.HasFinitePart (method)
  HasFinitePart(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.Bnd.Bnd_Box.DumpJson (method)
  DumpJson(self: OCP.OCP.Bnd.Bnd_Box, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // Remarks: Inits the content of me from the stream
  // OCP.OCP.Bnd.Bnd_Box.InitFromJson (method)
  InitFromJson(self: OCP.OCP.Bnd.Bnd_Box, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Get(self
  // Remarks: Returns the bounds of this bounding box. The gap is included. If this bounding box is infinite (i.e. "open"), returned values may be equal to +/- Precision::Infinite(). Standard_ConstructionError exception will be thrown if the box is void. if IsVoid()
  // OCP.OCP.Bnd.Bnd_Box.Get (method)
  Get(self: OCP.OCP.Bnd.Bnd_Box) -> tuple[float, float, float, float, float, float]

// Category: Bnd
// The class describes the Oriented Bounding Box (OBB), much tighter enclosing volume for the shape than the Axis Aligned Bounding Box (AABB)
Bnd_OBB

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.Bnd.Bnd_OBB) -> None 2. __init__(self: OCP.OCP.Bnd.Bnd_OBB, theCenter: OCP.OCP.gp.gp_Pnt, theXDirection: OCP.OCP.gp.gp_Dir, theYDirection: OCP.OCP.gp.gp_Dir, theZDirection: OCP.OCP.gp.gp_Dir, theHXSize: float, theHYSize: float, theHZSize: float) -> None 3. __init__(self: OCP.OCP.Bnd.Bnd_OBB, theBox: OCP.OCP.Bnd.Bnd_Box) -> None
  // OCP.OCP.Bnd.Bnd_OBB.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Bnd.Bnd_OBB) -> None
  __init__(self: OCP.OCP.Bnd.Bnd_OBB, theCenter: OCP.OCP.gp.gp_Pnt, theXDirection: OCP.OCP.gp.gp_Dir, theYDirection: OCP.OCP.gp.gp_Dir, theZDirection: OCP.OCP.gp.gp_Dir, theHXSize: float, theHYSize: float, theHZSize: float) -> None
  __init__(self: OCP.OCP.Bnd.Bnd_OBB, theBox: OCP.OCP.Bnd.Bnd_Box) -> None

  // ReBuild(self
  // Remarks: Creates new OBB covering every point in theListOfPoints. Tolerance of every such point is set by *theListOfTolerances array. If this array is not void (not null-pointer) then the resulted Bnd_OBB will be enlarged using tolerances of points lying on the box surface. <theIsOptimal> flag defines the mode in which the OBB will be built. Constructing Optimal box takes more time, but the resulting box is usually more tight. In case of construction of Optimal OBB more possible axes are checked.
  // OCP.OCP.Bnd.Bnd_OBB.ReBuild (method)
  ReBuild(self: OCP.OCP.Bnd.Bnd_OBB, theListOfPoints: OCP.OCP.TColgp.TColgp_Array1OfPnt, theListOfTolerances: OCP.OCP.TColStd.TColStd_Array1OfReal = None, theIsOptimal: bool = False) -> None

  // SetCenter(self
  // Remarks: Sets the center of OBB
  // OCP.OCP.Bnd.Bnd_OBB.SetCenter (method)
  SetCenter(self: OCP.OCP.Bnd.Bnd_OBB, theCenter: OCP.OCP.gp.gp_Pnt) -> None

  // SetXComponent(self
  // Remarks: Sets the X component of OBB - direction and size
  // OCP.OCP.Bnd.Bnd_OBB.SetXComponent (method)
  SetXComponent(self: OCP.OCP.Bnd.Bnd_OBB, theXDirection: OCP.OCP.gp.gp_Dir, theHXSize: float) -> None

  // SetYComponent(self
  // Remarks: Sets the Y component of OBB - direction and size
  // OCP.OCP.Bnd.Bnd_OBB.SetYComponent (method)
  SetYComponent(self: OCP.OCP.Bnd.Bnd_OBB, theYDirection: OCP.OCP.gp.gp_Dir, theHYSize: float) -> None

  // SetZComponent(self
  // Remarks: Sets the Z component of OBB - direction and size
  // OCP.OCP.Bnd.Bnd_OBB.SetZComponent (method)
  SetZComponent(self: OCP.OCP.Bnd.Bnd_OBB, theZDirection: OCP.OCP.gp.gp_Dir, theHZSize: float) -> None

  // Position(self
  // Remarks: Returns the local coordinates system of this oriented box. So that applying it to axis-aligned box ((-XHSize, -YHSize, -ZHSize), (XHSize, YHSize, ZHSize)) will produce this oriented box.
  // OCP.OCP.Bnd.Bnd_OBB.Position (method)
  Position(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_Ax3

  // XHSize(self
  // Remarks: Returns the X Dimension of OBB
  // OCP.OCP.Bnd.Bnd_OBB.XHSize (method)
  XHSize(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // YHSize(self
  // Remarks: Returns the Y Dimension of OBB
  // OCP.OCP.Bnd.Bnd_OBB.YHSize (method)
  YHSize(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // ZHSize(self
  // Remarks: Returns the Z Dimension of OBB
  // OCP.OCP.Bnd.Bnd_OBB.ZHSize (method)
  ZHSize(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // IsVoid(self
  // Remarks: Checks if the box is empty.
  // OCP.OCP.Bnd.Bnd_OBB.IsVoid (method)
  IsVoid(self: OCP.OCP.Bnd.Bnd_OBB) -> bool

  // SetVoid(self
  // Remarks: Clears this box
  // OCP.OCP.Bnd.Bnd_OBB.SetVoid (method)
  SetVoid(self: OCP.OCP.Bnd.Bnd_OBB) -> None

  // SetAABox(self
  // Remarks: Sets the flag for axes aligned box
  // OCP.OCP.Bnd.Bnd_OBB.SetAABox (method)
  SetAABox(self: OCP.OCP.Bnd.Bnd_OBB, theFlag: bool) -> None

  // IsAABox(self
  // Remarks: Returns TRUE if the box is axes aligned
  // OCP.OCP.Bnd.Bnd_OBB.IsAABox (method)
  IsAABox(self: OCP.OCP.Bnd.Bnd_OBB) -> bool

  // Enlarge(self
  // Remarks: Enlarges the box with the given value
  // OCP.OCP.Bnd.Bnd_OBB.Enlarge (method)
  Enlarge(self: OCP.OCP.Bnd.Bnd_OBB, theGapAdd: float) -> None

  // GetVertex(self
  // Remarks: Returns the array of vertices in <this>. The local coordinate of the vertex depending on the index of the array are follow: Index == 0: (-XHSize(), -YHSize(), -ZHSize()) Index == 1: ( XHSize(), -YHSize(), -ZHSize()) Index == 2: (-XHSize(), YHSize(), -ZHSize()) Index == 3: ( XHSize(), YHSize(), -ZHSize()) Index == 4: (-XHSize(), -YHSize(), ZHSize()) Index == 5: ( XHSize(), -YHSize(), ZHSize()) Index == 6: (-XHSize(), YHSize(), ZHSize()) Index == 7: ( XHSize(), YHSize(), ZHSize()).
  // OCP.OCP.Bnd.Bnd_OBB.GetVertex (method)
  GetVertex(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> bool

  // SquareExtent(self
  // Remarks: Returns square diagonal of this box
  // OCP.OCP.Bnd.Bnd_OBB.SquareExtent (method)
  SquareExtent(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // IsOut(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsOut(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> bool Check if the box do not interfere the other box. 2. IsOut(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> bool Check if the point is inside of <this>.
  // OCP.OCP.Bnd.Bnd_OBB.IsOut (method)
  IsOut(*args, **kwargs)
  IsOut(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> bool

  // IsCompletelyInside(self
  // Remarks: Check if the theOther is completely inside *this.
  // OCP.OCP.Bnd.Bnd_OBB.IsCompletelyInside (method)
  IsCompletelyInside(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> bool

  // Add(*args, **kwargs)
  // Remarks: Overloaded function. 1. Add(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> None Rebuilds this in order to include all previous objects (which it was created from) and theOther. 2. Add(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> None Rebuilds this in order to include all previous objects (which it was created from) and theP.
  // OCP.OCP.Bnd.Bnd_OBB.Add (method)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> None
  Add(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> None

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.Bnd.Bnd_OBB.DumpJson (method)
  DumpJson(self: OCP.OCP.Bnd.Bnd_OBB, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Center(self
  // Remarks: Returns the center of OBB
  // OCP.OCP.Bnd.Bnd_OBB.Center (method)
  Center(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ

  // XDirection(self
  // Remarks: Returns the X Direction of OBB
  // OCP.OCP.Bnd.Bnd_OBB.XDirection (method)
  XDirection(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ

  // YDirection(self
  // Remarks: Returns the Y Direction of OBB
  // OCP.OCP.Bnd.Bnd_OBB.YDirection (method)
  YDirection(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ

  // ZDirection(self
  // Remarks: Returns the Z Direction of OBB
  // OCP.OCP.Bnd.Bnd_OBB.ZDirection (method)
  ZDirection(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ
