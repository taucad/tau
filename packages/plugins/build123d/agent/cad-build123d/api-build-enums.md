# build123d — build_enums

29 top-level symbols. Signatures are verbatim python.

# Category: build_enums
# Align object about Axis
# build123d.build_enums.Align (enum)
class Align(Enum)

  MIN

  CENTER

  MAX

  NONE

# Category: build_enums
# Angular rotation direction
# build123d.build_enums.AngularDirection (enum)
class AngularDirection(Enum)

  CLOCKWISE

  COUNTER_CLOCKWISE

# Category: build_enums
# DXF export spline approximation strategy
# build123d.build_enums.ApproxOption (enum)
class ApproxOption(Enum)

  ARC

  NONE

  SPLINE

# Category: build_enums
# Center Options
# build123d.build_enums.CenterOf (enum)
class CenterOf(Enum)

  GEOMETRY

  MASS

  BOUNDING_BOX

# Category: build_enums
# Continuity level for evaluating geometric connections
# Remarks: Used to determine how smoothly adjacent geometry joins together, such as at shared vertices between edges or shared edges between faces. Levels: - C0 (G0): Positional continuity—elements meet at a point but may have sharp angles. - C1 (G1): Tangent continuity—elements have the same tangent direction at the junction. - C2 (G2): Curvature continuity—elements have matching curvature at the junction. These levels correspond to common CAD definitions and are compatible with OCCT's GeomAbs_Shape.
# build123d.build_enums.ContinuityLevel (enum)
class ContinuityLevel(IntEnum)

  C0

  C1

  C2

# Category: build_enums
# Order to apply extrinsic rotations by axis
# build123d.build_enums.Extrinsic (enum)
class Extrinsic(Enum)

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

# Category: build_enums
# Text Font Styles
# build123d.build_enums.FontStyle (enum)
class FontStyle(Enum)

  REGULAR

  BOLD

  ITALIC

  BOLDITALIC

# Category: build_enums
# Moving frame calculation method
# build123d.build_enums.FrameMethod (enum)
class FrameMethod(Enum)

  FRENET

  CORRECTED

# Category: build_enums
# CAD geometry object type
# build123d.build_enums.GeomType (enum)
class GeomType(Enum)

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

# Category: build_enums
# Arrow head types
# build123d.build_enums.HeadType (enum)
class HeadType(Enum)

  STRAIGHT

  CURVED

  FILLETED

# Category: build_enums
# Order to apply intrinsic rotations by axis
# build123d.build_enums.Intrinsic (enum)
class Intrinsic(Enum)

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

# Category: build_enums
# Split options
# build123d.build_enums.Keep (enum)
class Keep(Enum)

  ALL

  BOTTOM

  BOTH

  INSIDE

  OUTSIDE

  TOP

# Category: build_enums
# Offset corner transition
# build123d.build_enums.Kind (enum)
class Kind(Enum)

  ARC

  INTERSECTION

  TANGENT

# Category: build_enums
# Method of specifying length along PolarLine
# build123d.build_enums.LengthMode (enum)
class LengthMode(Enum)

  DIAGONAL

  HORIZONTAL

  VERTICAL

# Category: build_enums
# 3MF mesh types typically for 3D printing
# build123d.build_enums.MeshType (enum)
class MeshType(Enum)

  OTHER

  MODEL

  SUPPORT

  SOLIDSUPPORT

# Category: build_enums
# Combination Mode
# build123d.build_enums.Mode (enum)
class Mode(Enum)

  ADD

  SUBTRACT

  INTERSECT

  REPLACE

  PRIVATE

# Category: build_enums
# Methods for displaying numbers
# build123d.build_enums.NumberDisplay (enum)
class NumberDisplay(Enum)

  DECIMAL

  FRACTION

# Category: build_enums
# Align object about Axis
# build123d.build_enums.PageSize (enum)
class PageSize(Enum)

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

# Category: build_enums
# Position along curve mode
# build123d.build_enums.PositionMode (enum)
class PositionMode(Enum)

  LENGTH

  PARAMETER

# Category: build_enums
# When you export a model to a STEP file, the precision of the geometric data
# Remarks: (such as the coordinates of points, the definitions of curves and surfaces, etc.) can significantly impact the file size and the fidelity of the model when it is imported into another CAD system. Higher precision means that the geometric data is described with more detail, which can improve the accuracy of the model in the target system but can also increase the file size.
# build123d.build_enums.PrecisionMode (enum)
class PrecisionMode(Enum)

  SESSION

  GREATEST

  AVERAGE

  LEAST

# Category: build_enums
# Sagitta selection
# build123d.build_enums.Sagitta (enum)
class Sagitta(Enum)

  SHORT

  LONG

  BOTH

# Category: build_enums
# Selector scope - all, last operation or new objects
# build123d.build_enums.Select (enum)
class Select(Enum)

  ALL

  LAST

  NEW

# Category: build_enums
# 2D Offset types
# build123d.build_enums.Side (enum)
class Side(Enum)

  LEFT

  RIGHT

  BOTH

# Category: build_enums
# Sorting criteria
# build123d.build_enums.SortBy (enum)
class SortBy(Enum)

  LENGTH

  RADIUS

  AREA

  VOLUME

  DISTANCE

# Category: build_enums
# Tangency constraint for solvers edge selection
# build123d.build_enums.Tangency (enum)
class Tangency(Enum)

  UNQUALIFIED

  ENCLOSING

  ENCLOSED

  OUTSIDE

# Category: build_enums
# Text Alignment
# build123d.build_enums.TextAlign (enum)
class TextAlign(Enum)

  BOTTOM

  CENTER

  LEFT

  RIGHT

  TOP

  TOPFIRSTLINE

# Category: build_enums
# Sweep discontinuity handling option
# build123d.build_enums.Transition (enum)
class Transition(Enum)

  RIGHT

  ROUND

  TRANSFORMED

# Category: build_enums
# Standard Units
# build123d.build_enums.Unit (enum)
class Unit(Enum)

  MC

  MM

  CM

  M

  IN

  FT

# Category: build_enums
# Extrude limit
# build123d.build_enums.Until (enum)
class Until(Enum)

  NEXT

  LAST

  PREVIOUS

  FIRST
