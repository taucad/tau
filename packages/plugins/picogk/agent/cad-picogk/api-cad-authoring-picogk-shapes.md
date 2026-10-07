# PicoGK — CAD authoring — PicoGK.Shapes

15 top-level symbols. Signatures are verbatim csharp.

// Category: CAD authoring
// A circular arc in 2D space
// PicoGK.Shapes.Arc2d (struct)
public readonly struct Arc2d : IPath2d

  // Start coordinate
  // PicoGK.Shapes.Arc2d.vecStart (property)
  public Vector2 vecStart { get; }

  // End coordinate
  // PicoGK.Shapes.Arc2d.vecEnd (property)
  public Vector2 vecEnd { get; }

  // Center point
  // PicoGK.Shapes.Arc2d.vecCenter (property)
  public Vector2 vecCenter { get; }

  // Angle in radians (positive is counter clockwise)
  // PicoGK.Shapes.Arc2d.rAngle (property)
  public Rad rAngle { get; }

  // Radius of the arc
  // PicoGK.Shapes.Arc2d.fRadius (property)
  public float fRadius { get; }

  // PicoGK.Shapes.Arc2d.fLength (property)
  public float fLength { get; }

  // Construct a new 2D arc with the specified start point, around the specified center and with the supplied angle in radians
  // PicoGK.Shapes.Arc2d.Arc2d (constructor)
  public Arc2d(Vector2 vecStart, Vector2 vecCenter, Rad rAngle)
  public Arc2d()

  // PicoGK.Shapes.Arc2d.vecPtAtT (method)
  public Vector2 vecPtAtT(float fT)

// Category: CAD authoring
// Class to represent an circle as a normalized path/contour
// PicoGK.Shapes.Circle (struct)
public readonly struct Circle : IContour2d

  // Radius of the circle
  // PicoGK.Shapes.Circle.fR (property)
  public float fR { get; }

  // PicoGK.Shapes.Circle.fLength (property)
  public float fLength { get; }

  // Create a Circle contour with radius fR
  // PicoGK.Shapes.Circle.Circle (constructor)
  public Circle(float fR)
  public Circle()

  // PicoGK.Shapes.Circle.vecPtAtT (method)
  public Vector2 vecPtAtT(float t)

  // PicoGK.Shapes.Circle.PtAtT (method)
  public void PtAtT(in float t, out Vector2 vecPt, out Vector2 vecNormal)

// Category: CAD authoring
// This class allows you to use a closed path as a contour
// PicoGK.Shapes.ContourFromPath (class)
public sealed class ContourFromPath : IContour2d, ContourSampler2d.ISampleable

  // PicoGK.Shapes.ContourFromPath.fLength (property)
  public float fLength { get; }

  // Create a IContour2d-compatible contour from an existing closed path The first point in the path and the last point in the path need to be identical
  // PicoGK.Shapes.ContourFromPath.ContourFromPath (constructor)
  public ContourFromPath(IPath2d xPath)

  // PicoGK.Shapes.ContourFromPath.vecPtAtT (method)
  public Vector2 vecPtAtT(float t)

  // PicoGK.Shapes.ContourFromPath.vecPtAtTLinear (method)
  public Vector2 vecPtAtTLinear(float t)

// Category: CAD authoring
// Implements a way to adaptively sample a contour to retrieve a) the correct length b) sample the contour in adaptive arc T vs
// PicoGK.Shapes.ContourSampler2d (class)
public class ContourSampler2d

  // This interface enables a contour to be sampled in linear time
  // PicoGK.Shapes.ContourSampler2d.ISampleable (interface)
  public interface ISampleable

    // Return the uncorrected position at linear t (uncorrected)
    // PicoGK.Shapes.ContourSampler2d.ISampleable.vecPtAtTLinear (method)
    Vector2 vecPtAtTLinear(float t)

  // Return sum of all arc segement lengths
  // PicoGK.Shapes.ContourSampler2d.fTotalLength (property)
  public float fTotalLength { get; }

  // Adaptively sample the contour to map the linear time to corrected arc-length t, for constant speed
  // PicoGK.Shapes.ContourSampler2d.ContourSampler2d (constructor)
  public ContourSampler2d(ISampleable xContour, float fPrecision = 0.01f, int nMaxDepth = 100)
  //   xContour: Contour to sample
  //   fPrecision: Precision (distance between points)
  //   nMaxDepth: Maximum recursion depth

  // Convert from linear t to arc-length t
  // PicoGK.Shapes.ContourSampler2d.fArcTFromLinearT (method)
  public float fArcTFromLinearT(float fLinearT)

// Category: CAD authoring
// Class to represent an ellipse as a normalized path/contour
// PicoGK.Shapes.Ellipse (class)
public sealed class Ellipse : IContour2d, ContourSampler2d.ISampleable

  // Rotation angle of the ellipse
  // PicoGK.Shapes.Ellipse.fPhi (property)
  public float fPhi { get; }

  // Rotation angle of the ellipse
  // PicoGK.Shapes.Ellipse.rPhi (property)
  public Rad rPhi { get; }

  // Half-length of the ellipse in A
  // PicoGK.Shapes.Ellipse.fA (property)
  public float fA { get; }

  // Half-length of the ellipse in B
  // PicoGK.Shapes.Ellipse.fB (property)
  public float fB { get; }

  // PicoGK.Shapes.Ellipse.fLength (property)
  public float fLength { get; }

  // Constructor using axis A vector and axis B length
  // Throws: System.ArgumentException
  // PicoGK.Shapes.Ellipse.Ellipse (constructor)
  public Ellipse(Vector2 vecAxisA, float fLengthB)
  public Ellipse(float a, float b, float fAngle = 0)
  //   vecAxisA: Direction and length of axis A
  //   fLengthB: Length of axis B (perpendicular to A)

  // PicoGK.Shapes.Ellipse.vecPtAtTLinear (method)
  public Vector2 vecPtAtTLinear(float t)

  // PicoGK.Shapes.Ellipse.vecPtAtT (method)
  public Vector2 vecPtAtT(float t)

// Category: CAD authoring
// The Frame3d object stores a local coordinate system, i.e
// PicoGK.Shapes.Frame3d (struct)
[DebuggerDisplay("O=({vecPos.X:n3},{vecPos.Y:n3},{vecPos.Z:n3})")]
public readonly struct Frame3d : IEquatable<Frame3d>

  // Local frame representing the world coordinate system
  // PicoGK.Shapes.Frame3d.frmWorld (field)
  public static readonly Frame3d frmWorld = new(Vector3.Zero, Vector3.UnitZ, Vector3.UnitX);

  // Position of the origin of the Frame3d
  // PicoGK.Shapes.Frame3d.vecPos (property)
  public Vector3 vecPos { get; }

  // Direction of the local X axis in world coordinates
  // PicoGK.Shapes.Frame3d.vecLx (property)
  public Vector3 vecLx { get; }

  // Direction of the local Y axis in world coordinates
  // PicoGK.Shapes.Frame3d.vecLy (property)
  public Vector3 vecLy { get; }

  // Direction of the local Z axis in world coordinates
  // PicoGK.Shapes.Frame3d.vecLz (property)
  public Vector3 vecLz { get; }

  // Create a Frame3d at the specified position with axes aligned with world X,Y,Z
  // PicoGK.Shapes.Frame3d.frmFromPos (method)
  public static Frame3d frmFromPos(Vector3 vecPos)

  // Create a Frame3d at the specified position with local axes aligned with the specified world Z and X directions
  // PicoGK.Shapes.Frame3d.frmFromZX (method)
  public static Frame3d frmFromZX(Vector3 vecPos, Vector3 vecApproxZ, Vector3 vecApproxX)

  // Creates a local coordinate system with world-aligned axes at the specified position
  // PicoGK.Shapes.Frame3d.Frame3d (constructor)
  public Frame3d(Vector3 vecPos)
  public Frame3d(Vector3 vecOrigin, Vector3 vecApproxZ, Vector3 vecApproxX)
  public Frame3d()
  //   vecPos: Position of the origin

  // Creates a Frame3d from a System.Numerics row-vector rigid transform
  // PicoGK.Shapes.Frame3d.frmFromMatrix4x4 (method)
  public static Frame3d frmFromMatrix4x4(in Matrix4x4 mat)

  // Convert a local coordinate to world coordinates
  // PicoGK.Shapes.Frame3d.vecPtToWorld (method)
  public Vector3 vecPtToWorld(Vector3 vecLocal)
  public Vector3 vecPtToWorld(Vector2 vecLocal)

  // Convert a local direction to a world direction
  // PicoGK.Shapes.Frame3d.vecDirToWorld (method)
  public Vector3 vecDirToWorld(Vector3 vecLocalDir)
  public Vector3 vecDirToWorld(Vector2 vecLocalDir)

  // Return local coordinate from world coordinates
  // PicoGK.Shapes.Frame3d.vecPtFromWorld (method)
  public Vector3 vecPtFromWorld(Vector3 vecWorld)

  // Return local direction from world direction
  // PicoGK.Shapes.Frame3d.vecDirFromWorld (method)
  public Vector3 vecDirFromWorld(Vector3 vecWorldDir)

  // Create a combined Frame3d from this frame and another
  // PicoGK.Shapes.Frame3d.frmCompose (method)
  public Frame3d frmCompose(in Frame3d frmOther)

  // Create an inverted Frame3d object
  // PicoGK.Shapes.Frame3d.frmInverse (method)
  public Frame3d frmInverse()

  // Move the origin of the Frame3d object by the specified distance in local space
  // PicoGK.Shapes.Frame3d.frmMovedLocal (method)
  public Frame3d frmMovedLocal(Vector3 vecDistance)
  //   vecDistance: Distance to move the origin

  // Move the Frame3d origin by the specified distance in X in local space
  // PicoGK.Shapes.Frame3d.frmMovedLocalX (method)
  public Frame3d frmMovedLocalX(float fDistanceX)
  //   fDistanceX: Distance to move the origin in X local space

  // Move the Frame3d origin by the specified distance in Y in local space
  // PicoGK.Shapes.Frame3d.frmMovedLocalY (method)
  public Frame3d frmMovedLocalY(float fDistanceY)
  //   fDistanceY: Distance to move the origin in Y in local space

  // Move the Frame3d origin by the specified distance in Z in local space
  // PicoGK.Shapes.Frame3d.frmMovedLocalZ (method)
  public Frame3d frmMovedLocalZ(float fDistanceZ)
  //   fDistanceZ: Distance to move the origin in Z in local space

  // Rotate the Frame3d around an arbitrary (world-space) axis through the frame’s origin
  // PicoGK.Shapes.Frame3d.frmRotatedWorld (method)
  public Frame3d frmRotatedWorld(Vector3 vecAxis, Rad rAngle)
  //   vecAxis: Rotation axis in world coordinates
  //   rAngle: Rotation angle in radians

  // Move the origin of the Frame3d object by the specified distance in world space
  // PicoGK.Shapes.Frame3d.frmMovedWorld (method)
  public Frame3d frmMovedWorld(Vector3 vecDistance)
  //   vecDistance: Distance to move the origin in world space

  // Move the Frame3d origin by the specified distance in X in world space
  // PicoGK.Shapes.Frame3d.frmMovedWorldX (method)
  public Frame3d frmMovedWorldX(float fDistanceX)
  //   fDistanceX: Distance to move the origin in X in world space

  // Move the Frame3d origin by the specified distance in Y in world space
  // PicoGK.Shapes.Frame3d.frmMovedWorldY (method)
  public Frame3d frmMovedWorldY(float fDistanceY)
  //   fDistanceY: Distance to move the origin in Y in world space

  // Move the Frame3d origin by the specified distance in Z in world space
  // PicoGK.Shapes.Frame3d.frmMovedWorldZ (method)
  public Frame3d frmMovedWorldZ(float fDistanceZ)
  //   fDistanceZ: Distance to move the origin in Z in world space

  // Convert the Frame3d transformation to an equivalent Matrix4x4 transform (basis in rows, translation last column) This layout is compatible with typical OpenGL shaders
  // PicoGK.Shapes.Frame3d.matAsMatrix4x4 (method)
  public Matrix4x4 matAsMatrix4x4()

  // Return a frame which has been repositioned to the supplied world coordinate
  // PicoGK.Shapes.Frame3d.frmRepositioned (method)
  public Frame3d frmRepositioned(Vector3 vecNewPos)
  //   vecNewPos: New origin of the local frame

  // Return the transformation as Quaternion plus Origin
  // PicoGK.Shapes.Frame3d.AsRigid (method)
  public void AsRigid(out Quaternion q, out Vector3 vecOrigin)
  //   q: Rotation component as Quaternion
  //   vecOrigin: Origin (same as vecPos)

  // Helper function to drawing a scaled quad aligned to this Frame3d object Model = Scale * Frame.M
  // PicoGK.Shapes.Frame3d.matComposeWithScale (method)
  public Matrix4x4 matComposeWithScale(in Vector3 vecScale)
  //   vecScale: Scale to apply

  // Convert local point to a world coordinate (same as vecToWorld) Enables you to write vecWorld = vecLocal * frmFrame3d
  // PicoGK.Shapes.Frame3d.op_Multiply (method)
  public static Vector3 operator *(in Frame3d frm, Vector3 vecLocal)
  public static Frame3d operator *(in Frame3d frmA, in Frame3d frmB)
  //   frm: Frame3d
  //   vecLocal: Local coordinate point

  // Interpolate between two Frame3d pos/orientations
  // PicoGK.Shapes.Frame3d.frmInterpolate (method)
  public static Frame3d frmInterpolate(in Frame3d frm0, in Frame3d frm1, float t)
  //   frm0: Frame at pos 0
  //   frm1: Frame at pos 1
  //   t: Interpolation parameter 0..1

  // Test for equality (IEquatable)
  // PicoGK.Shapes.Frame3d.Equals (method)
  public bool Equals(Frame3d frm)
  public override bool Equals(object? obj)

  // Create hash code (IEquatable)
  // PicoGK.Shapes.Frame3d.GetHashCode (method)
  public override int GetHashCode()

// Category: CAD authoring
// Interface to represent a normalized closed contour in 2D which travels from 0..1 - Position at 0 and 1 are identical - The contour is centered around the coordinate 0/0 - The contour is in counter-clockwise winding order
// PicoGK.Shapes.IContour2d (interface)
public interface IContour2d : IPath2d

  // Function to return both point and normal at t
  // PicoGK.Shapes.IContour2d.PtAtT (method)
  public void PtAtT(in float t, out Vector2 vecPt, out Vector2 vecNormal)

  // Sample the normal at fT Helper function used by PtAtT
  // PicoGK.Shapes.IContour2d.vecSampleNormalAt (method)
  public Vector2 vecSampleNormalAt(float fT, float fSampleDist = 1e-5f)

// Category: CAD authoring
// A two dimensional closed contour aligned in a plane in 3D space Note
// PicoGK.Shapes.IContour3d (interface)
public interface IContour3d : IPath3d

  // Returns the point and normal at position t (0..1) As t increases monotonically, the point moves along the contour at constant speed with respect to arc length
  // PicoGK.Shapes.IContour3d.PtAtT (method)
  public void PtAtT(float t, out Vector3 vecPt, out Vector3 vecNormal)

// Category: CAD authoring
// Interface to represent a normalized path in 2D space which travels from 0..1
// PicoGK.Shapes.IPath2d (interface)
public interface IPath2d

  // Length of the entire contour
  // PicoGK.Shapes.IPath2d.fLength (property)
  public float fLength { get; }

  // Returns the point at position t (0..1) As t increases monotonically, the point moves along the contour at constant speed with respect to arc length
  // PicoGK.Shapes.IPath2d.vecPtAtT (method)
  public Vector2 vecPtAtT(float t)

// Category: CAD authoring
// Interface to represent a normalized path in 2D space which travels from 0..1
// PicoGK.Shapes.IPath3d (interface)
public interface IPath3d

  // Length of the entire contour
  // PicoGK.Shapes.IPath3d.fLength (property)
  public float fLength { get; }

  // Returns the point at position t (0..1) As t increases monotonically, the point moves along the contour at constant speed with respect to arc length
  // PicoGK.Shapes.IPath3d.vecPtAtT (method)
  public Vector3 vecPtAtT(float t)

// Category: CAD authoring
// A 2d line
// PicoGK.Shapes.Line2d (struct)
public readonly struct Line2d : IPath2d

  // Start coordinate
  // PicoGK.Shapes.Line2d.vecA (property)
  public Vector2 vecA { get; }

  // End coordinate
  // PicoGK.Shapes.Line2d.vecB (property)
  public Vector2 vecB { get; }

  // PicoGK.Shapes.Line2d.fLength (property)
  public float fLength { get; }

  // Construct a line with the specified start and end coordinates
  // PicoGK.Shapes.Line2d.Line2d (constructor)
  public Line2d(Vector2 vecA, Vector2 vecB)
  public Line2d()

  // PicoGK.Shapes.Line2d.vecPtAtT (method)
  public Vector2 vecPtAtT(float fT)

// Category: CAD authoring
// Represents an oriented 2D contour placed in 3D space by a Frame3d
// PicoGK.Shapes.OrientedContour (class)
public sealed class OrientedContour : IContour3d

  // PicoGK.Shapes.OrientedContour.fLength (property)
  public float fLength { get; }

  // Create an oriented contour from a 2D contour and a local coordinate system
  // PicoGK.Shapes.OrientedContour.OrientedContour (constructor)
  public OrientedContour(IContour2d xContour, Frame3d frm)

  // PicoGK.Shapes.OrientedContour.vecPtAtT (method)
  public Vector3 vecPtAtT(float t)

  // PicoGK.Shapes.OrientedContour.PtAtT (method)
  public void PtAtT(float t, out Vector3 vecPt, out Vector3 vecNormal)

// Category: CAD authoring
// Interface to represent a normalized 2D path oriented in space which travels from 0..1 - Position at 0 and 1 are identical - The contour is centered around the coordinate 0/0 - The contour is in counter-clockwise winding order
// PicoGK.Shapes.OrientedPath (class)
public sealed class OrientedPath : IPath3d

  // PicoGK.Shapes.OrientedPath.fLength (property)
  public float fLength { get; }

  // PicoGK.Shapes.OrientedPath.OrientedPath (constructor)
  public OrientedPath(IPath2d xPath, Frame3d frm)

  // PicoGK.Shapes.OrientedPath.vecPtAtT (method)
  public Vector3 vecPtAtT(float t)

// Category: CAD authoring
// A compound path which consists of a list of other paths
// PicoGK.Shapes.Path2d (class)
public sealed class Path2d : IPath2d

  // PicoGK.Shapes.Path2d.fLength (property)
  public float fLength { get; }

  // Add another path to the compound path Note, the start coordinate of the added path needs to be coincide with the current end point
  // PicoGK.Shapes.Path2d.Add (method)
  public void Add(IPath2d xPath)

  // Append a line to the specified coordinate
  // PicoGK.Shapes.Path2d.AddLine (method)
  public void AddLine(Vector2 vecTo)

  // Append a line relative to current end point
  // PicoGK.Shapes.Path2d.AddLineRel (method)
  public void AddLineRel(Vector2 vecRel)

  // Append an arc with the specified center and angle The start coordinate is the current end coordinate
  // PicoGK.Shapes.Path2d.AddArc (method)
  public void AddArc(Vector2 vecCenter, Rad rAngle)

  // Add an arc with the specified center, relative to the current end point The start coordinate is the current end coordinate
  // PicoGK.Shapes.Path2d.AddArcRel (method)
  public void AddArcRel(Vector2 vecCenterRel, Rad rAngle)

  // PicoGK.Shapes.Path2d.vecPtAtT (method)
  public Vector2 vecPtAtT(float fT)

  // PicoGK.Shapes.Path2d.Path2d (constructor)
  public Path2d()

// Category: CAD authoring
// Implements the supershape formula for interesting 2D contours
// PicoGK.Shapes.Supershape (class)
public sealed class Supershape : IContour2d, ContourSampler2d.ISampleable

  // PicoGK.Shapes.Supershape.fLength (property)
  public float fLength { get; }

  // Helper function to create simple rounded polygons based on the Supershape https://en.wikipedia.org/wiki/Superformula
  // PicoGK.Shapes.Supershape.oRoundedPolygon (method)
  static public Supershape oRoundedPolygon(float fRadius, float fPolySymmery, float fOutwardCurve = 5f, float fRoundness = 5f)
  //   fRadius: Radius
  //   fPolySymmery: Number of polygonal sides, for example 4 for a square
  //   fOutwardCurve: Higher values curve the sides outwards, smaller values create lobes
  //   fRoundness: Roundness factor, higher values approach a circle

  // Constructor for a supershape with superformula parameters and rotation
  // PicoGK.Shapes.Supershape.Supershape (constructor)
  public Supershape(float a, float b, float m, float n1, float n2, float n3, float fAngle = 0)
  //   a: Scaling factor along x (similar to semi-major axis)
  //   b: Scaling factor along y (similar to semi-minor axis)
  //   m: Symmetry parameter (number of lobes)
  //   n1: Exponent for overall sharpness
  //   n2: Exponent for cosine term
  //   n3: Exponent for sine term
  //   fAngle: Rotation angle in radians

  // PicoGK.Shapes.Supershape.vecPtAtT (method)
  public Vector2 vecPtAtT(float t)

  // PicoGK.Shapes.Supershape.vecPtAtTLinear (method)
  public Vector2 vecPtAtTLinear(float t)
