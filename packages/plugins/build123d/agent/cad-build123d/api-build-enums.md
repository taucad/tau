# build123d — build_enums

29 top-level symbols. Signatures are verbatim python.

// Category: build_enums
// Align object about Axis
Align

  MIN

  CENTER

  MAX

  NONE

// Category: build_enums
// Angular rotation direction
AngularDirection

  CLOCKWISE

  COUNTER_CLOCKWISE

// Category: build_enums
// DXF export spline approximation strategy
ApproxOption

  ARC

  NONE

  SPLINE

// Category: build_enums
// Center Options
CenterOf

  GEOMETRY

  MASS

  BOUNDING_BOX

// Category: build_enums
// Continuity level for evaluating geometric connections
// Remarks: Used to determine how smoothly adjacent geometry joins together, such as at shared vertices between edges or shared edges between faces. Levels: - C0 (G0): Positional continuity—elements meet at a point but may have sharp angles. - C1 (G1): Tangent continuity—elements have the same tangent direction at the junction. - C2 (G2): Curvature continuity—elements have matching curvature at the junction. These levels correspond to common CAD definitions and are compatible with OCCT's GeomAbs_Shape.
ContinuityLevel

  C0

  C1

  C2

// Category: build_enums
// Order to apply extrinsic rotations by axis
Extrinsic

  XYZ

  XZY

  YZX

  YXZ

  ZXY

  ZYX

  XYX

  XZX

  YZY

  YXY

  ZXZ

  ZYZ

// Category: build_enums
// Text Font Styles
FontStyle

  REGULAR

  BOLD

  ITALIC

  BOLDITALIC

// Category: build_enums
// Moving frame calculation method
FrameMethod

  FRENET

  CORRECTED

// Category: build_enums
// CAD geometry object type
GeomType

  PLANE

  CYLINDER

  CONE

  SPHERE

  TORUS

  BEZIER

  BSPLINE

  REVOLUTION

  EXTRUSION

  OFFSET

  LINE

  CIRCLE

  ELLIPSE

  HYPERBOLA

  PARABOLA

  OTHER

// Category: build_enums
// Arrow head types
HeadType

  STRAIGHT

  CURVED

  FILLETED

// Category: build_enums
// Order to apply intrinsic rotations by axis
Intrinsic

  XYZ

  XZY

  YZX

  YXZ

  ZXY

  ZYX

  XYX

  XZX

  YZY

  YXY

  ZXZ

  ZYZ

// Category: build_enums
// Split options
Keep

  ALL

  BOTTOM

  BOTH

  INSIDE

  OUTSIDE

  TOP

// Category: build_enums
// Offset corner transition
Kind

  ARC

  INTERSECTION

  TANGENT

// Category: build_enums
// Method of specifying length along PolarLine
LengthMode

  DIAGONAL

  HORIZONTAL

  VERTICAL

// Category: build_enums
// 3MF mesh types typically for 3D printing
MeshType

  OTHER

  MODEL

  SUPPORT

  SOLIDSUPPORT

// Category: build_enums
// Combination Mode
Mode

  ADD

  SUBTRACT

  INTERSECT

  REPLACE

  PRIVATE

// Category: build_enums
// Methods for displaying numbers
NumberDisplay

  DECIMAL

  FRACTION

// Category: build_enums
// Align object about Axis
PageSize

  A0

  A1

  A2

  A3

  A4

  A5

  A6

  A7

  A8

  A9

  A10

  LETTER

  LEGAL

  LEDGER

// Category: build_enums
// Position along curve mode
PositionMode

  LENGTH

  PARAMETER

// Category: build_enums
// When you export a model to a STEP file, the precision of the geometric data
// Remarks: (such as the coordinates of points, the definitions of curves and surfaces, etc.) can significantly impact the file size and the fidelity of the model when it is imported into another CAD system. Higher precision means that the geometric data is described with more detail, which can improve the accuracy of the model in the target system but can also increase the file size.
PrecisionMode

  SESSION

  GREATEST

  AVERAGE

  LEAST

// Category: build_enums
// Sagitta selection
Sagitta

  SHORT

  LONG

  BOTH

// Category: build_enums
// Selector scope - all, last operation or new objects
Select

  ALL

  LAST

  NEW

// Category: build_enums
// 2D Offset types
Side

  LEFT

  RIGHT

  BOTH

// Category: build_enums
// Sorting criteria
SortBy

  LENGTH

  RADIUS

  AREA

  VOLUME

  DISTANCE

// Category: build_enums
// Tangency constraint for solvers edge selection
Tangency

  UNQUALIFIED

  ENCLOSING

  ENCLOSED

  OUTSIDE

// Category: build_enums
// Text Alignment
TextAlign

  BOTTOM

  CENTER

  LEFT

  RIGHT

  TOP

  TOPFIRSTLINE

// Category: build_enums
// Sweep discontinuity handling option
Transition

  RIGHT

  ROUND

  TRANSFORMED

// Category: build_enums
// Standard Units
Unit

  MC

  MM

  CM

  M

  IN

  FT

// Category: build_enums
// Extrude limit
Until

  NEXT

  LAST

  PREVIOUS

  FIRST
