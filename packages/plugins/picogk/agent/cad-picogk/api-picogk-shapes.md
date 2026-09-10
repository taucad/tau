# PicoGK — PicoGK.Shapes

15 top-level symbols. Signatures are verbatim csharp.

// A circular arc in 2D space
Arc2d

// Start coordinate
vecStart: Vector2

// End coordinate
vecEnd: Vector2

// Center point
vecCenter: Vector2

// Angle in radians (positive is counter clockwise)
rAngle: Rad

// Radius of the arc
fRadius: float

fLength: float

// Construct a new 2D arc with the specified start point, around the specified center and with the supplied angle in radians
public Arc2d(Vector2 vecStart, Vector2 vecCenter, Rad rAngle)

public Vector2 vecPtAtT(float fT)

// Class to represent an circle as a normalized path/contour
Circle

// Radius of the circle
fR: float

fLength: float

// Create a Circle contour with radius fR
public Circle(float fR)

public Vector2 vecPtAtT(float t)

public void PtAtT(in float t, out Vector2 vecPt, out Vector2 vecNormal)

// This class allows you to use a closed path as a contour
ContourFromPath

fLength: float

// Create a IContour2d-compatible contour from an existing closed path The first point in the path and the last point in the path need to be identical
public ContourFromPath(IPath2d xPath)

public Vector2 vecPtAtT(float t)

public Vector2 vecPtAtTLinear(float t)

// Implements a way to adaptively sample a contour to retrieve a) the correct length b) sample the contour in adaptive arc T vs
ContourSampler2d

// This interface enables a contour to be sampled in linear time
ISampleable

    // Return the uncorrected position at linear t (uncorrected)
    Vector2 vecPtAtTLinear(float t)

// Return sum of all arc segement lengths
fTotalLength: float

// Adaptively sample the contour to map the linear time to corrected arc-length t, for constant speed
public ContourSampler2d(ContourSampler2d.ISampleable xContour, float fPrecision = 0.01, int nMaxDepth = 100)
// xContour: Contour to sample
// fPrecision: Precision (distance between points)
// nMaxDepth: Maximum recursion depth

// Convert from linear t to arc-length t
public float fArcTFromLinearT(float fLinearT)

// Class to represent an ellipse as a normalized path/contour
Ellipse

// Rotation angle of the ellipse
fPhi: float

// Rotation angle of the ellipse
rPhi: Rad

// Half-length of the ellipse in A
fA: float

// Half-length of the ellipse in B
fB: float

fLength: float

// Constructor using axis A vector and axis B length
public Ellipse(Vector2 vecAxisA, float fLengthB)
public Ellipse(float a, float b, float fAngle = 0)
// vecAxisA: Direction and length of axis A
// fLengthB: Length of axis B (perpendicular to A)

public Vector2 vecPtAtTLinear(float t)

public Vector2 vecPtAtT(float t)

// The Frame3d object stores a local coordinate system, i.e
Frame3d

// Local frame representing the world coordinate system
frmWorld: Frame3d

// Position of the origin of the Frame3d
vecPos: Vector3

// Direction of the local X axis in world coordinates
vecLx: Vector3

// Direction of the local Y axis in world coordinates
vecLy: Vector3

// Direction of the local Z axis in world coordinates
vecLz: Vector3

// Create a Frame3d at the specified position with axes aligned with world X,Y,Z
public static Frame3d frmFromPos(Vector3 vecPos)

// Create a Frame3d at the specified position with local axes aligned with the specified world Z and X directions
public static Frame3d frmFromZX(Vector3 vecPos, Vector3 vecApproxZ, Vector3 vecApproxX)

// Creates a local coordinate system with world-aligned axes at the specified position
public Frame3d(Vector3 vecPos)
public Frame3d(Vector3 vecOrigin, Vector3 vecApproxZ, Vector3 vecApproxX)
// vecPos: Position of the origin

// Creates a Frame3d from a System.Numerics row-vector rigid transform
public static Frame3d frmFromMatrix4x4(in Matrix4x4 mat)

// Convert a local coordinate to world coordinates
public Vector3 vecPtToWorld(Vector3 vecLocal)
public Vector3 vecPtToWorld(Vector2 vecLocal)

// Convert a local direction to a world direction
public Vector3 vecDirToWorld(Vector3 vecLocalDir)
public Vector3 vecDirToWorld(Vector2 vecLocalDir)

// Return local coordinate from world coordinates
public Vector3 vecPtFromWorld(Vector3 vecWorld)

// Return local direction from world direction
public Vector3 vecDirFromWorld(Vector3 vecWorldDir)

// Create a combined Frame3d from this frame and another
public Frame3d frmCompose(in Frame3d frmOther)

// Create an inverted Frame3d object
public Frame3d frmInverse()

// Move the origin of the Frame3d object by the specified distance in local space
public Frame3d frmMovedLocal(Vector3 vecDistance)
// vecDistance: Distance to move the origin

// Move the Frame3d origin by the specified distance in X in local space
public Frame3d frmMovedLocalX(float fDistanceX)
// fDistanceX: Distance to move the origin in X local space

// Move the Frame3d origin by the specified distance in Y in local space
public Frame3d frmMovedLocalY(float fDistanceY)
// fDistanceY: Distance to move the origin in Y in local space

// Move the Frame3d origin by the specified distance in Z in local space
public Frame3d frmMovedLocalZ(float fDistanceZ)
// fDistanceZ: Distance to move the origin in Z in local space

// Rotate the Frame3d around an arbitrary (world-space) axis through the frame’s origin
public Frame3d frmRotatedWorld(Vector3 vecAxis, Rad rAngle)
// vecAxis: Rotation axis in world coordinates
// rAngle: Rotation angle in radians

// Move the origin of the Frame3d object by the specified distance in world space
public Frame3d frmMovedWorld(Vector3 vecDistance)
// vecDistance: Distance to move the origin in world space

// Move the Frame3d origin by the specified distance in X in world space
public Frame3d frmMovedWorldX(float fDistanceX)
// fDistanceX: Distance to move the origin in X in world space

// Move the Frame3d origin by the specified distance in Y in world space
public Frame3d frmMovedWorldY(float fDistanceY)
// fDistanceY: Distance to move the origin in Y in world space

// Move the Frame3d origin by the specified distance in Z in world space
public Frame3d frmMovedWorldZ(float fDistanceZ)
// fDistanceZ: Distance to move the origin in Z in world space

// Convert the Frame3d transformation to an equivalent Matrix4x4 transform (basis in rows, translation last column) This layout is compatible with typical OpenGL shaders
public Matrix4x4 matAsMatrix4x4()

// Return a frame which has been repositioned to the supplied world coordinate
public Frame3d frmRepositioned(Vector3 vecNewPos)
// vecNewPos: New origin of the local frame

// Return the transformation as Quaternion plus Origin
public void AsRigid(out Quaternion q, out Vector3 vecOrigin)
// q: Rotation component as Quaternion
// vecOrigin: Origin (same as vecPos)

// Helper function to drawing a scaled quad aligned to this Frame3d object Model = Scale \* Frame.M
public Matrix4x4 matComposeWithScale(in Vector3 vecScale)
// vecScale: Scale to apply

// Convert local point to a world coordinate (same as vecToWorld) Enables you to write vecWorld = vecLocal _ frmFrame3d
public static Vector3 operator _(in Frame3d frm, Vector3 vecLocal)
public static Frame3d operator \*(in Frame3d frmA, in Frame3d frmB)
// frm: Frame3d
// vecLocal: Local coordinate point

// Interpolate between two Frame3d pos/orientations
public static Frame3d frmInterpolate(in Frame3d frm0, in Frame3d frm1, float t)
// frm0: Frame at pos 0
// frm1: Frame at pos 1
// t: Interpolation parameter 0..1

// Test for equality (IEquatable)
public bool Equals(Frame3d frm)
public override bool Equals(object? obj)

// Create hash code (IEquatable)
public override int GetHashCode()

// Interface to represent a normalized closed contour in 2D which travels from 0..1 - Position at 0 and 1 are identical - The contour is centered around the coordinate 0/0 - The contour is in counter-clockwise winding order
IContour2d

// Function to return both point and normal at t
void PtAtT(in float t, out Vector2 vecPt, out Vector2 vecNormal)

// Sample the normal at fT Helper function used by PtAtT
Vector2 vecSampleNormalAt(float fT, float fSampleDist = 1E-05)

// A two dimensional closed contour aligned in a plane in 3D space Note
IContour3d

// Returns the point and normal at position t (0..1) As t increases monotonically, the point moves along the contour at constant speed with respect to arc length
void PtAtT(float t, out Vector3 vecPt, out Vector3 vecNormal)

// Interface to represent a normalized path in 2D space which travels from 0..1
IPath2d

// Length of the entire contour
fLength: float

// Returns the point at position t (0..1) As t increases monotonically, the point moves along the contour at constant speed with respect to arc length
Vector2 vecPtAtT(float t)

// Interface to represent a normalized path in 2D space which travels from 0..1
IPath3d

// Length of the entire contour
fLength: float

// Returns the point at position t (0..1) As t increases monotonically, the point moves along the contour at constant speed with respect to arc length
Vector3 vecPtAtT(float t)

// A 2d line
Line2d

// Start coordinate
vecA: Vector2

// End coordinate
vecB: Vector2

fLength: float

// Construct a line with the specified start and end coordinates
public Line2d(Vector2 vecA, Vector2 vecB)

public Vector2 vecPtAtT(float fT)

// Represents an oriented 2D contour placed in 3D space by a Frame3d
OrientedContour

fLength: float

// Create an oriented contour from a 2D contour and a local coordinate system
public OrientedContour(IContour2d xContour, Frame3d frm)

public Vector3 vecPtAtT(float t)

public void PtAtT(float t, out Vector3 vecPt, out Vector3 vecNormal)

// Interface to represent a normalized 2D path oriented in space which travels from 0..1 - Position at 0 and 1 are identical - The contour is centered around the coordinate 0/0 - The contour is in counter-clockwise winding order
OrientedPath

fLength: float

public OrientedPath(IPath2d xPath, Frame3d frm)

public Vector3 vecPtAtT(float t)

// A compound path which consists of a list of other paths
Path2d

fLength: float

// Add another path to the compound path Note, the start coordinate of the added path needs to be coincide with the current end point
public void Add(IPath2d xPath)

// Append a line to the specified coordinate
public void AddLine(Vector2 vecTo)

// Append a line relative to current end point
public void AddLineRel(Vector2 vecRel)

// Append an arc with the specified center and angle The start coordinate is the current end coordinate
public void AddArc(Vector2 vecCenter, Rad rAngle)

// Add an arc with the specified center, relative to the current end point The start coordinate is the current end coordinate
public void AddArcRel(Vector2 vecCenterRel, Rad rAngle)

public Vector2 vecPtAtT(float fT)

// Implements the supershape formula for interesting 2D contours
Supershape

fLength: float

// Helper function to create simple rounded polygons based on the Supershape https://en.wikipedia.org/wiki/Superformula
public static Supershape oRoundedPolygon(float fRadius, float fPolySymmery, float fOutwardCurve = 5, float fRoundness = 5)
// fRadius: Radius
// fPolySymmery: Number of polygonal sides, for example 4 for a square
// fOutwardCurve: Higher values curve the sides outwards, smaller values create lobes
// fRoundness: Roundness factor, higher values approach a circle

// Constructor for a supershape with superformula parameters and rotation
public Supershape(float a, float b, float m, float n1, float n2, float n3, float fAngle = 0)
// a: Scaling factor along x (similar to semi-major axis)
// b: Scaling factor along y (similar to semi-minor axis)
// m: Symmetry parameter (number of lobes)
// n1: Exponent for overall sharpness
// n2: Exponent for cosine term
// n3: Exponent for sine term
// fAngle: Rotation angle in radians

public Vector2 vecPtAtT(float t)

public Vector2 vecPtAtTLinear(float t)
