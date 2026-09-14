# build123d API index

build123d 0.11.1 · 3018 symbols · extracted by CPython 3.13.15 inspect+ast.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## abc — `api-abc.md`

ABC (class) — Helper class that provides a standard way to create an…
Callable (class)
Collection (class)
Iterable (class)
Sequence (class) [2 members] — All the operations on a read-only sequence
  Sequence.index (method) — S.index(value, [start, [stop]]) -> integer -- return first index of
  Sequence.count (method) — S.count(value) -> integer -- return number of occurrences of value
abstractmethod (function) — A decorator indicating abstract methods

## APIHeaderSection — `api-apiheadersection.md`

APIHeaderSection_MakeHeader (class) [44 members] — This class allows to consult and prepare/edit data stored in…
  APIHeaderSection_MakeHeader.__init__ (constructor) — __init__(*args, **kwargs)
  APIHeaderSection_MakeHeader.Init (method) — Init(self
  APIHeaderSection_MakeHeader.IsDone (method) — IsDone(self
  APIHeaderSection_MakeHeader.Apply (method) — Apply(self
  APIHeaderSection_MakeHeader.NewModel (method) — NewModel(self
  APIHeaderSection_MakeHeader.HasFn (method) — HasFn(self
  APIHeaderSection_MakeHeader.FnValue (method) — FnValue(self
  APIHeaderSection_MakeHeader.SetName (method) — SetName(self
  APIHeaderSection_MakeHeader.Name (method) — Name(self
  APIHeaderSection_MakeHeader.SetTimeStamp (method) — SetTimeStamp(self
  APIHeaderSection_MakeHeader.TimeStamp (method) — TimeStamp(self
  APIHeaderSection_MakeHeader.SetAuthor (method) — SetAuthor(self
  APIHeaderSection_MakeHeader.SetAuthorValue (method) — SetAuthorValue(self
  APIHeaderSection_MakeHeader.Author (method) — Author(self
  APIHeaderSection_MakeHeader.AuthorValue (method) — AuthorValue(self
  APIHeaderSection_MakeHeader.NbAuthor (method) — NbAuthor(self
  APIHeaderSection_MakeHeader.SetOrganization (method) — SetOrganization(self
  APIHeaderSection_MakeHeader.SetOrganizationValue (method) — SetOrganizationValue(self
  APIHeaderSection_MakeHeader.Organization (method) — Organization(self
  APIHeaderSection_MakeHeader.OrganizationValue (method) — OrganizationValue(self
  APIHeaderSection_MakeHeader.NbOrganization (method) — NbOrganization(self
  APIHeaderSection_MakeHeader.SetPreprocessorVersion (method) — SetPreprocessorVersion(self
  APIHeaderSection_MakeHeader.PreprocessorVersion (method) — PreprocessorVersion(self
  APIHeaderSection_MakeHeader.SetOriginatingSystem (method) — SetOriginatingSystem(self
  APIHeaderSection_MakeHeader.OriginatingSystem (method) — OriginatingSystem(self
  APIHeaderSection_MakeHeader.SetAuthorisation (method) — SetAuthorisation(self
  APIHeaderSection_MakeHeader.Authorisation (method) — Authorisation(self
  APIHeaderSection_MakeHeader.HasFs (method) — HasFs(self
  APIHeaderSection_MakeHeader.FsValue (method) — FsValue(self
  APIHeaderSection_MakeHeader.SetSchemaIdentifiers (method) — SetSchemaIdentifiers(self
  APIHeaderSection_MakeHeader.SetSchemaIdentifiersValue (method) — SetSchemaIdentifiersValue(self
  APIHeaderSection_MakeHeader.SchemaIdentifiers (method) — SchemaIdentifiers(self
  APIHeaderSection_MakeHeader.SchemaIdentifiersValue (method) — SchemaIdentifiersValue(self
  APIHeaderSection_MakeHeader.NbSchemaIdentifiers (method) — NbSchemaIdentifiers(self
  APIHeaderSection_MakeHeader.AddSchemaIdentifier (method) — AddSchemaIdentifier(self
  APIHeaderSection_MakeHeader.HasFd (method) — HasFd(self
  APIHeaderSection_MakeHeader.FdValue (method) — FdValue(self
  APIHeaderSection_MakeHeader.SetDescription (method) — SetDescription(self
  APIHeaderSection_MakeHeader.SetDescriptionValue (method) — SetDescriptionValue(self
  APIHeaderSection_MakeHeader.Description (method) — Description(self
  APIHeaderSection_MakeHeader.DescriptionValue (method) — DescriptionValue(self
  APIHeaderSection_MakeHeader.NbDescription (method) — NbDescription(self
  APIHeaderSection_MakeHeader.SetImplementationLevel (method) — SetImplementationLevel(self
  APIHeaderSection_MakeHeader.ImplementationLevel (method) — ImplementationLevel(self

## other — `api-other.md`

AddType (type)
Align2D (type)
Align3D (type)
B (type)
CLASS_REGISTRY (type)
CM (constant) — 10
ChamferFilletType (type)
ClassVar (type)
ColorLike (type)
ConvexHull (type) — Not introspectable
DEG2RAD (constant) — 0.017453292519943295
FT (constant) — 304.79999999999995
G (constant) — 1
GEOM_KEY_DIGITS (constant) — 5
GccEnt_enclosed (type)
GccEnt_enclosing (type)
GccEnt_outside (type)
GccEnt_unqualified (type)
IN (constant) — 25.4
KG (constant) — 1000
LB (constant) — 453.59237
Literal (type)
M (constant) — 1000
MC (constant) — 0.001
MM (constant) — 1
MirrorType (type)
OffsetType (type)
PathDescriptor (type)
PathSegment (type)
PointLike (type)
ProjectType (type)
RAD2DEG (constant) — 57.29577951308232
RotationLike (type)
Self (type)
ShapeT (type)
SplitType (type)
SweepType (type)
T (type)
T2 (type)
THOU (constant) — 0.0254
TOL (constant) — 0.01
TOLERANCE (constant) — 1e-06
TOL_DIGITS (constant) — 6
TYPE_CHECKING (constant) — False
TopAbs_FACE (type)
Type (type)
TypeAlias (type)
UNITS_PER_METER (type)
Vec2 (type) — Not introspectable
VectorLike (type)
Voronoi (type) — Not introspectable
XCAFDoc_ColorCurv (type)
XCAFDoc_ColorGen (type)
XCAFDoc_ColorSurf (type)
annotations (type)
inf (constant) — inf
logger (type)
operations_apply_to (type)
pi (constant) — 3.141592653589793
topods_lut (type)

## objects_curve — `api-objects-curve.md`

Airfoil (class) [3 members] — Create an airfoil described by a 4-digit (or fractional) NACA…
  Airfoil.parse_naca4 (method) — Parse NACA 4-digit (or fractional) airfoil code into parameters
  Airfoil.__init__ (constructor)
  Airfoil.camber_line (property) — Camber line of the airfoil as an Edge
ArcArcTangentArc (class) [1 members] — Line Object
  ArcArcTangentArc.__init__ (constructor)
ArcArcTangentLine (class) [1 members] — Line Object
  ArcArcTangentLine.__init__ (constructor)
BSpline (class) [1 members] — Line Object
  BSpline.__init__ (constructor)
BaseCurveObject (class) [1 members] — BaseCurveObject specialized for Curve
  BaseCurveObject.__init__ (constructor)
BaseEdgeObject (class) [1 members] — BaseEdgeObject specialized for Edge
  BaseEdgeObject.__init__ (constructor)
BaseLineObject (class) [1 members] — BaseLineObject specialized for Wire
  BaseLineObject.__init__ (constructor)
Bezier (class) [1 members] — Line Object
  Bezier.__init__ (constructor)
BlendCurve (class) [1 members] — Line Object
  BlendCurve.__init__ (constructor)
CenterArc (class) [1 members] — Line Object
  CenterArc.__init__ (constructor)
ConstrainedArcs (class) [1 members] — Line Object
  ConstrainedArcs.__init__ (constructor)
ConstrainedLines (class) [1 members] — Line Object
  ConstrainedLines.__init__ (constructor) — Create planar line(s) on XY subject to tangency/contact constraints
DoubleTangentArc (class) [1 members] — Line Object
  DoubleTangentArc.__init__ (constructor)
EllipticalCenterArc (class) [1 members] — Line Object
  EllipticalCenterArc.__init__ (constructor)
EllipticalStartArc (class) [1 members] — Line Object
  EllipticalStartArc.__init__ (constructor)
FilletPolyline (class) [1 members] — Line Object
  FilletPolyline.__init__ (constructor)
Helix (class) [1 members] — Line Object
  Helix.__init__ (constructor)
HyperbolicCenterArc (class) [1 members] — Line Object
  HyperbolicCenterArc.__init__ (constructor)
IntersectingLine (class) [1 members] — Intersecting Line Object
  IntersectingLine.__init__ (constructor)
JernArc (class) [1 members] — Line Object
  JernArc.__init__ (constructor)
Line (class) [1 members] — Line Object
  Line.__init__ (constructor)
ParabolicCenterArc (class) [1 members] — Line Object
  ParabolicCenterArc.__init__ (constructor)
PointArcTangentArc (class) [1 members] — Line Object
  PointArcTangentArc.__init__ (constructor)
PointArcTangentLine (class) [1 members] — Line Object
  PointArcTangentLine.__init__ (constructor)
PolarLine (class) [1 members] — Line Object
  PolarLine.__init__ (constructor)
Polyline (class) [1 members] — Line Object
  Polyline.__init__ (constructor)
RadiusArc (class) [1 members] — Line Object
  RadiusArc.__init__ (constructor)
SagittaArc (class) [1 members] — Line Object
  SagittaArc.__init__ (constructor)
Spline (class) [1 members] — Line Object
  Spline.__init__ (constructor)
TangentArc (class) [1 members] — Line Object
  TangentArc.__init__ (constructor)
ThreePointArc (class) [1 members] — Line Object
  ThreePointArc.__init__ (constructor)

## build_enums — `api-build-enums.md`

Align (enum) [4 members] — Align object about Axis
  Align.MIN (enumMember)
  Align.CENTER (enumMember)
  Align.MAX (enumMember)
  Align.NONE (enumMember)
AngularDirection (enum) [2 members] — Angular rotation direction
  AngularDirection.CLOCKWISE (enumMember)
  AngularDirection.COUNTER_CLOCKWISE (enumMember)
ApproxOption (enum) [3 members] — DXF export spline approximation strategy
  ApproxOption.ARC (enumMember)
  ApproxOption.NONE (enumMember)
  ApproxOption.SPLINE (enumMember)
CenterOf (enum) [3 members] — Center Options
  CenterOf.GEOMETRY (enumMember)
  CenterOf.MASS (enumMember)
  CenterOf.BOUNDING_BOX (enumMember)
ContinuityLevel (enum) [3 members] — Continuity level for evaluating geometric connections
  ContinuityLevel.C0 (enumMember)
  ContinuityLevel.C1 (enumMember)
  ContinuityLevel.C2 (enumMember)
Extrinsic (enum) [12 members] — Order to apply extrinsic rotations by axis
  Extrinsic.XYZ (enumMember)
  Extrinsic.XZY (enumMember)
  Extrinsic.YZX (enumMember)
  Extrinsic.YXZ (enumMember)
  Extrinsic.ZXY (enumMember)
  Extrinsic.ZYX (enumMember)
  Extrinsic.XYX (enumMember)
  Extrinsic.XZX (enumMember)
  Extrinsic.YZY (enumMember)
  Extrinsic.YXY (enumMember)
  Extrinsic.ZXZ (enumMember)
  Extrinsic.ZYZ (enumMember)
FontStyle (enum) [4 members] — Text Font Styles
  FontStyle.REGULAR (enumMember)
  FontStyle.BOLD (enumMember)
  FontStyle.ITALIC (enumMember)
  FontStyle.BOLDITALIC (enumMember)
FrameMethod (enum) [2 members] — Moving frame calculation method
  FrameMethod.FRENET (enumMember)
  FrameMethod.CORRECTED (enumMember)
GeomType (enum) [16 members] — CAD geometry object type
  GeomType.PLANE (enumMember)
  GeomType.CYLINDER (enumMember)
  GeomType.CONE (enumMember)
  GeomType.SPHERE (enumMember)
  GeomType.TORUS (enumMember)
  GeomType.BEZIER (enumMember)
  GeomType.BSPLINE (enumMember)
  GeomType.REVOLUTION (enumMember)
  GeomType.EXTRUSION (enumMember)
  GeomType.OFFSET (enumMember)
  GeomType.LINE (enumMember)
  GeomType.CIRCLE (enumMember)
  GeomType.ELLIPSE (enumMember)
  GeomType.HYPERBOLA (enumMember)
  GeomType.PARABOLA (enumMember)
  GeomType.OTHER (enumMember)
HeadType (enum) [3 members] — Arrow head types
  HeadType.STRAIGHT (enumMember)
  HeadType.CURVED (enumMember)
  HeadType.FILLETED (enumMember)
Intrinsic (enum) [12 members] — Order to apply intrinsic rotations by axis
  Intrinsic.XYZ (enumMember)
  Intrinsic.XZY (enumMember)
  Intrinsic.YZX (enumMember)
  Intrinsic.YXZ (enumMember)
  Intrinsic.ZXY (enumMember)
  Intrinsic.ZYX (enumMember)
  Intrinsic.XYX (enumMember)
  Intrinsic.XZX (enumMember)
  Intrinsic.YZY (enumMember)
  Intrinsic.YXY (enumMember)
  Intrinsic.ZXZ (enumMember)
  Intrinsic.ZYZ (enumMember)
Keep (enum) [6 members] — Split options
  Keep.ALL (enumMember)
  Keep.BOTTOM (enumMember)
  Keep.BOTH (enumMember)
  Keep.INSIDE (enumMember)
  Keep.OUTSIDE (enumMember)
  Keep.TOP (enumMember)
Kind (enum) [3 members] — Offset corner transition
  Kind.ARC (enumMember)
  Kind.INTERSECTION (enumMember)
  Kind.TANGENT (enumMember)
LengthMode (enum) [3 members] — Method of specifying length along PolarLine
  LengthMode.DIAGONAL (enumMember)
  LengthMode.HORIZONTAL (enumMember)
  LengthMode.VERTICAL (enumMember)
MeshType (enum) [4 members] — 3MF mesh types typically for 3D printing
  MeshType.OTHER (enumMember)
  MeshType.MODEL (enumMember)
  MeshType.SUPPORT (enumMember)
  MeshType.SOLIDSUPPORT (enumMember)
Mode (enum) [5 members] — Combination Mode
  Mode.ADD (enumMember)
  Mode.SUBTRACT (enumMember)
  Mode.INTERSECT (enumMember)
  Mode.REPLACE (enumMember)
  Mode.PRIVATE (enumMember)
NumberDisplay (enum) [2 members] — Methods for displaying numbers
  NumberDisplay.DECIMAL (enumMember)
  NumberDisplay.FRACTION (enumMember)
PageSize (enum) [14 members] — Align object about Axis
  PageSize.A0 (enumMember)
  PageSize.A1 (enumMember)
  PageSize.A2 (enumMember)
  PageSize.A3 (enumMember)
  PageSize.A4 (enumMember)
  PageSize.A5 (enumMember)
  PageSize.A6 (enumMember)
  PageSize.A7 (enumMember)
  PageSize.A8 (enumMember)
  PageSize.A9 (enumMember)
  PageSize.A10 (enumMember)
  PageSize.LETTER (enumMember)
  PageSize.LEGAL (enumMember)
  PageSize.LEDGER (enumMember)
PositionMode (enum) [2 members] — Position along curve mode
  PositionMode.LENGTH (enumMember)
  PositionMode.PARAMETER (enumMember)
PrecisionMode (enum) [4 members] — When you export a model to a STEP file, the…
  PrecisionMode.SESSION (enumMember)
  PrecisionMode.GREATEST (enumMember)
  PrecisionMode.AVERAGE (enumMember)
  PrecisionMode.LEAST (enumMember)
Sagitta (enum) [3 members] — Sagitta selection
  Sagitta.SHORT (enumMember)
  Sagitta.LONG (enumMember)
  Sagitta.BOTH (enumMember)
Select (enum) [3 members] — Selector scope - all, last operation or new objects
  Select.ALL (enumMember)
  Select.LAST (enumMember)
  Select.NEW (enumMember)
Side (enum) [3 members] — 2D Offset types
  Side.LEFT (enumMember)
  Side.RIGHT (enumMember)
  Side.BOTH (enumMember)
SortBy (enum) [5 members] — Sorting criteria
  SortBy.LENGTH (enumMember)
  SortBy.RADIUS (enumMember)
  SortBy.AREA (enumMember)
  SortBy.VOLUME (enumMember)
  SortBy.DISTANCE (enumMember)
Tangency (enum) [4 members] — Tangency constraint for solvers edge selection
  Tangency.UNQUALIFIED (enumMember)
  Tangency.ENCLOSING (enumMember)
  Tangency.ENCLOSED (enumMember)
  Tangency.OUTSIDE (enumMember)
TextAlign (enum) [6 members] — Text Alignment
  TextAlign.BOTTOM (enumMember)
  TextAlign.CENTER (enumMember)
  TextAlign.LEFT (enumMember)
  TextAlign.RIGHT (enumMember)
  TextAlign.TOP (enumMember)
  TextAlign.TOPFIRSTLINE (enumMember)
Transition (enum) [3 members] — Sweep discontinuity handling option
  Transition.RIGHT (enumMember)
  Transition.ROUND (enumMember)
  Transition.TRANSFORMED (enumMember)
Unit (enum) [6 members] — Standard Units
  Unit.MC (enumMember)
  Unit.MM (enumMember)
  Unit.CM (enumMember)
  Unit.M (enumMember)
  Unit.IN (enumMember)
  Unit.FT (enumMember)
Until (enum) [4 members] — Extrude limit
  Until.NEXT (enumMember)
  Until.LAST (enumMember)
  Until.PREVIOUS (enumMember)
  Until.FIRST (enumMember)

## typing — `api-typing.md`

Any (class) — Special type indicating an unconstrained type
BinaryIO (class) [1 members] — Typed approximation of the return of open() in binary mode
  BinaryIO.write (method)
Generic (class) — Abstract base class for generic types
TextIO (class) [5 members] — Typed approximation of the return of open() in text mode
  TextIO.buffer (property)
  TextIO.encoding (property)
  TextIO.errors (property)
  TextIO.line_buffering (property)
  TextIO.newlines (property)
TypeVar (class) [1 members] — Type variable
  TypeVar.has_default (method)
cast (function) — Cast a value to a type
overload (function) — Decorator for overloaded functions/methods
tcast (function) — Cast a value to a type

## drafting — `api-drafting.md`

Arrow (class) [1 members] — Sketch Object
  Arrow.__init__ (constructor)
ArrowHead (class) [1 members] — Sketch Object
  ArrowHead.__init__ (constructor)
DimensionLine (class) [1 members] — Sketch Object
  DimensionLine.__init__ (constructor)
Draft (class) [2 members] — Draft
  Draft.is_metric (property) — Are metric units being used
  Draft.__init__ (constructor)
ExtensionLine (class) [1 members] — Sketch Object
  ExtensionLine.__init__ (constructor)
TechnicalDrawing (class) [1 members] — Sketch Object
  TechnicalDrawing.__init__ (constructor)

## exporters — `api-exporters.md`

AutoNameEnum (enum) — An enum class that automatically sets members' value to their…
ColorIndex (enum) [9 members] — Colors
  ColorIndex.RED (enumMember)
  ColorIndex.YELLOW (enumMember)
  ColorIndex.GREEN (enumMember)
  ColorIndex.CYAN (enumMember)
  ColorIndex.BLUE (enumMember)
  ColorIndex.MAGENTA (enumMember)
  ColorIndex.BLACK (enumMember)
  ColorIndex.GRAY (enumMember)
  ColorIndex.LIGHT_GRAY (enumMember)
DotLength (enum) [3 members] — Line type dash pattern dot widths, expressed in tenths of…
  DotLength.TRUE_DOT (enumMember)
  DotLength.INKSCAPE_COMPAT (enumMember)
  DotLength.QCAD_IMPERIAL (enumMember)
Drawing (class) [1 members] — A base drawing object
  Drawing.__init__ (constructor)
Export2D (class) — Base class for 2D exporters (DXF, SVG)
ExportDXF (class) [4 members] — The ExportDXF class provides functionality for exporting 2D shapes to…
  ExportDXF.__init__ (constructor)
  ExportDXF.add_layer (method) — add_layer
  ExportDXF.add_shape (method) — add_shape
  ExportDXF.write (method) — write
ExportSVG (class) [4 members] — ExportSVG
  ExportSVG.__init__ (constructor)
  ExportSVG.add_layer (method) — add_layer
  ExportSVG.add_shape (method) — add_shape
  ExportSVG.write (method) — write
LineType (enum) [39 members] — Line Types
  LineType.CONTINUOUS (enumMember)
  LineType.BORDER (enumMember)
  LineType.BORDER2 (enumMember)
  LineType.BORDERX2 (enumMember)
  LineType.CENTER (enumMember)
  LineType.CENTER2 (enumMember)
  LineType.CENTERX2 (enumMember)
  LineType.DASHDOT (enumMember)
  LineType.DASHDOT2 (enumMember)
  LineType.DASHDOTX2 (enumMember)
  LineType.DASHED (enumMember)
  LineType.DASHED2 (enumMember)
  LineType.DASHEDX2 (enumMember)
  LineType.DIVIDE (enumMember)
  LineType.DIVIDE2 (enumMember)
  LineType.DIVIDEX2 (enumMember)
  LineType.DOT (enumMember)
  LineType.DOT2 (enumMember)
  LineType.DOTX2 (enumMember)
  LineType.HIDDEN (enumMember)
  LineType.HIDDEN2 (enumMember)
  LineType.HIDDENX2 (enumMember)
  LineType.PHANTOM (enumMember)
  LineType.PHANTOM2 (enumMember)
  LineType.PHANTOMX2 (enumMember)
  LineType.ISO_DASH (enumMember)
  LineType.ISO_DASH_SPACE (enumMember)
  LineType.ISO_LONG_DASH_DOT (enumMember)
  LineType.ISO_LONG_DASH_DOUBLE_DOT (enumMember)
  LineType.ISO_LONG_DASH_TRIPLE_DOT (enumMember)
  LineType.ISO_DOT (enumMember)
  LineType.ISO_LONG_DASH_SHORT_DASH (enumMember)
  LineType.ISO_LONG_DASH_DOUBLE_SHORT_DASH (enumMember)
  LineType.ISO_DASH_DOT (enumMember)
  LineType.ISO_DOUBLE_DASH_DOT (enumMember)
  LineType.ISO_DASH_DOUBLE_DOT (enumMember)
  LineType.ISO_DOUBLE_DASH_DOUBLE_DOT (enumMember)
  LineType.ISO_DASH_TRIPLE_DOT (enumMember)
  LineType.ISO_DOUBLE_DASH_TRIPLE_DOT (enumMember)
ansi_pattern (function) — Prepare an ANSI line pattern for ezdxf usage
iso_pattern (function) — Prepare an ISO line pattern for ezdxf usage
unit_conversion_scale (function) — Return the multiplicative conversion factor to go from from_unit to…

## geometry — `api-geometry.md`

Axis (class) [15 members] — Axis
  Axis.__init__ (constructor)
  Axis.wrapped (property) — OCP object
  Axis.position (property) — The position or origin of the Axis
  Axis.direction (property) — The normalized direction of the Axis
  Axis.location (property) — Return self as Location
  Axis.located (method) — relocates self to a new location possibly changing position and…
  Axis.to_plane (method) — Return self as Plane
  Axis.is_coaxial (method) — are axes coaxial
  Axis.is_normal (method) — are axes normal
  Axis.is_opposite (method) — are axes opposite
  Axis.is_parallel (method) — are axes parallel
  Axis.is_skew (method) — are axes skew
  Axis.angle_between (method) — calculate angle between axes
  Axis.reverse (method) — Return a copy of self with the direction reversed
  Axis.intersect (method) — Find intersection of axis and geometric object or shape
AxisMeta (class) [3 members] — Axis meta class to enable class properties
  AxisMeta.X (property) — X Axis
  AxisMeta.Y (property) — Y Axis
  AxisMeta.Z (property) — Z Axis
BoundBox (class) [10 members] — A BoundingBox for a Shape
  BoundBox.__init__ (constructor)
  BoundBox.measure (property) — Return the overall Lebesgue measure of the bounding box
  BoundBox.diagonal (property) — body diagonal length (i.e
  BoundBox.center (method) — Return center of the bounding box
  BoundBox.add (method) — Returns a modified (expanded) bounding box
  BoundBox.find_outside_box_2d (method) — Compares bounding boxes
  BoundBox.from_topo_ds (method) — Constructs a bounding box from a TopoDS_Shape
  BoundBox.is_inside (method) — Is the provided bounding box inside this one?
  BoundBox.overlaps (method) — Check if this bounding box overlaps with another
  BoundBox.to_align_offset (method) — Amount to move object to achieve the desired alignment
Color (class) [2 members] — Color object based on OCCT Quantity_ColorRGBA
  Color.__init__ (constructor)
  Color.categorical_set (method) — Generate a palette of evenly spaced colors
GeomEncoder (class) [2 members] — A JSON encoder for build123d geometry objects
  GeomEncoder.default (method) — Return a JSON-serializable representation of a known geometry object
  GeomEncoder.geometry_hook (method) — Convert dictionaries back into geometry objects for decoding
Location (class) [13 members] — Location in 3D space
  Location.__init__ (constructor)
  Location.wrapped (property) — OCP object
  Location.position (property) — Extract Position component of self
  Location.orientation (property) — Extract orientation/rotation component of self
  Location.x_axis (property) — Default X axis when used as a plane
  Location.y_axis (property) — Default Y axis when used as a plane
  Location.z_axis (property) — Default Z axis when used as a plane
  Location.inverse (method) — Inverted location
  Location.center (method) — Return center of the location - useful for sorting
  Location.mirror (method) — Return a new Location mirrored across the given plane
  Location.to_axis (method) — Convert the location into an Axis
  Location.to_tuple (method) — Convert the location to a translation, rotation tuple
  Location.intersect (method) — Find intersection of location and geometric object or shape
LocationEncoder (class) [2 members] — Custom JSON Encoder for Location values
  LocationEncoder.default (method) — Return a serializable object
  LocationEncoder.location_hook (method) — Convert Locations loaded from json to Location objects
Matrix (class) [5 members] — A 3d , 4x4 transformation matrix
  Matrix.__init__ (constructor)
  Matrix.rotate (method) — General rotate about axis by angle in degrees
  Matrix.inverse (method) — Invert Matrix
  Matrix.multiply (method) — Matrix multiplication
  Matrix.transposed_list (method) — Needed by the cqparts gltf exporter
NotAllLocationLikeError (class) [1 members] — Raised when an iterable contains objects that cannot be converted…
  NotAllLocationLikeError.__init__ (constructor)
OrientedBoundBox (class) [13 members] — An Oriented Bounding Box
  OrientedBoundBox.__init__ (constructor) — Create an oriented bounding box from either a precomputed Bnd_OBB…
  OrientedBoundBox.wrapped (property) — OCP object
  OrientedBoundBox.corners (property) — Compute and return the unique corner points of the oriented…
  OrientedBoundBox.diagonal (property) — The full length of the body diagonal of the oriented…
  OrientedBoundBox.location (property) — The Location of the center of the oriented bounding box
  OrientedBoundBox.plane (property) — The oriented coordinate system of the bounding box
  OrientedBoundBox.size (property) — The full extents of the bounding box along its primary…
  OrientedBoundBox.x_direction (property) — The primary (X) direction of the oriented bounding box
  OrientedBoundBox.y_direction (property) — The secondary (Y) direction of the oriented bounding box
  OrientedBoundBox.z_direction (property) — The tertiary (Z) direction of the oriented bounding box
  OrientedBoundBox.center (method) — Compute and return the center point of the oriented bounding…
  OrientedBoundBox.is_completely_inside (method) — Determine whether the given oriented bounding box is entirely contained
  OrientedBoundBox.is_outside (method) — Determine whether a given point lies entirely outside this oriented…
Plane (class) [23 members] — Plane
  Plane.get_topods_face_normal (method) — Find the normal at the center of a TopoDS_Face
  Plane.__init__ (constructor) — Create a plane from either an OCCT gp_pln, Face, Location,…
  Plane.wrapped (property) — The OCP object
  Plane.offset (method) — Move the Plane by amount in the direction of z_dir
  Plane.reverse (method) — Reverse z direction of plane
  Plane.origin (property) — global position of local (0,0,0) point
  Plane.z_dir (property) — Local Z direction normal to the plane
  Plane.x_dir (property) — Local X direction of the plane
  Plane.y_dir (property) — Local Y direction of the plane
  Plane.shift_origin (method) — shift plane origin
  Plane.rotated (method) — Returns a copy of this plane, rotated about the specified…
  Plane.moved (method) — Change the position & orientation of a copy of self…
  Plane.move (method) — Change the position & orientation of self by applying a…
  Plane.forward_transform (property) — forward location transformation matrix
  Plane.reverse_transform (property) — reverse location transformation matrix
  Plane.location (property) — Return Location representing the origin and z direction
  Plane.to_gp_ax3 (method) — Return gp_Ax3 version of the plane
  Plane.to_gp_ax2 (method) — Return gp_Ax2 version of the plane
  Plane.to_local_coords (method) — Reposition the object relative to this plane
  Plane.from_local_coords (method) — Reposition the object relative from this plane
  Plane.location_between (method) — Return a location representing the translation from self to other
  Plane.contains (method) — contains
  Plane.intersect (method) — Find intersection of plane and geometric object or shape
PlaneMeta (class) [13 members] — Plane meta class to enable class properties
  PlaneMeta.XY (property) — XY Plane
  PlaneMeta.YZ (property) — YZ Plane
  PlaneMeta.ZX (property) — ZX Plane
  PlaneMeta.XZ (property) — XZ Plane
  PlaneMeta.YX (property) — YX Plane
  PlaneMeta.ZY (property) — ZY Plane
  PlaneMeta.front (property) — Front Plane
  PlaneMeta.back (property) — Back Plane
  PlaneMeta.left (property) — Left Plane
  PlaneMeta.right (property) — Right Plane
  PlaneMeta.top (property) — Top Plane
  PlaneMeta.bottom (property) — Bottom Plane
  PlaneMeta.isometric (property) — Isometric Plane
Pos (class) [1 members] — A position only sub-class of Location
  Pos.__init__ (constructor)
Rot (class) [1 members] — Subclass of Location used only for object rotation
  Rot.__init__ (constructor)
Rotation (class) [1 members] — Subclass of Location used only for object rotation
  Rotation.__init__ (constructor)
Vector (class) [26 members] — Create a 3-dimensional vector
  Vector.__init__ (constructor)
  Vector.X (property) — Get x value
  Vector.Y (property) — Get y value
  Vector.Z (property) — Get z value
  Vector.wrapped (property) — OCCT object
  Vector.to_tuple (method) — Return tuple equivalent
  Vector.length (property) — Vector length
  Vector.cross (method) — Mathematical cross function
  Vector.dot (method) — Mathematical dot function
  Vector.sub (method)
  Vector.add (method)
  Vector.multiply (method) — Mathematical multiply function
  Vector.normalized (method) — Scale to length of 1
  Vector.reverse (method) — Return a vector with the same magnitude but pointing in…
  Vector.center (method) — center
  Vector.get_angle (method) — Unsigned angle between vectors
  Vector.get_signed_angle (method) — Signed Angle Between Vectors
  Vector.project_to_line (method) — Returns a new vector equal to the projection of this…
  Vector.distance_to_plane (method) — Minimum unsigned distance between vector and plane
  Vector.signed_distance_from_plane (method) — Signed distance from plane to point vector
  Vector.project_to_plane (method) — Vector is projected onto the plane provided as input
  Vector.to_pnt (method) — Convert to OCCT gp_Pnt object
  Vector.to_dir (method) — Convert to OCCT gp_Dir object
  Vector.transform (method) — Apply affine transformation
  Vector.rotate (method) — Rotate about axis
  Vector.intersect (method) — Find intersection of vector and geometric object or shape
all_location_like (function) — Returns the items as a list unless any of them…
to_align_offset (function) — Amount to move object to achieve the desired alignment

## BRepBndLib — `api-brepbndlib.md`

BRepBndLib (class) [5 members] — This package provides the bounding boxes for curves and surfaces…
  BRepBndLib.__init__ (constructor) — __init__(self
  BRepBndLib.Add_s (method) — Add_s(S
  BRepBndLib.AddClose_s (method) — AddClose_s(S
  BRepBndLib.AddOptimal_s (method) — AddOptimal_s(S
  BRepBndLib.AddOBB_s (method) — AddOBB_s(theS

## BRepBuilderAPI — `api-brepbuilderapi.md`

BRepBuilderAPI_MakeFace (class) [6 members] — Provides methods to build faces
  BRepBuilderAPI_MakeFace.__init__ (constructor) — __init__(*args, **kwargs)
  BRepBuilderAPI_MakeFace.Init (method) — Init(*args, **kwargs)
  BRepBuilderAPI_MakeFace.Add (method) — Add(self
  BRepBuilderAPI_MakeFace.IsDone (method) — IsDone(self
  BRepBuilderAPI_MakeFace.Error (method) — Error(self
  BRepBuilderAPI_MakeFace.Face (method) — Face(self
BRepBuilderAPI_MakePolygon (class) [9 members] — Describes functions to build polygonal wires
  BRepBuilderAPI_MakePolygon.__init__ (constructor) — __init__(*args, **kwargs)
  BRepBuilderAPI_MakePolygon.Add (method) — Add(*args, **kwargs)
  BRepBuilderAPI_MakePolygon.Added (method) — Added(self
  BRepBuilderAPI_MakePolygon.Close (method) — Close(self
  BRepBuilderAPI_MakePolygon.IsDone (method) — IsDone(self
  BRepBuilderAPI_MakePolygon.FirstVertex (method) — FirstVertex(self
  BRepBuilderAPI_MakePolygon.LastVertex (method) — LastVertex(self
  BRepBuilderAPI_MakePolygon.Edge (method) — Edge(self
  BRepBuilderAPI_MakePolygon.Wire (method) — Wire(self
BRepBuilderAPI_MakeSolid (class) [5 members] — Describes functions to build a solid from shells
  BRepBuilderAPI_MakeSolid.__init__ (constructor) — __init__(*args, **kwargs)
  BRepBuilderAPI_MakeSolid.Add (method) — Add(self
  BRepBuilderAPI_MakeSolid.IsDone (method) — IsDone(self
  BRepBuilderAPI_MakeSolid.IsDeleted (method) — IsDeleted(self
  BRepBuilderAPI_MakeSolid.Solid (method) — Solid(self
BRepBuilderAPI_Sewing (class) [47 members] — Provides methods toProvides methods toProvides methods to
  BRepBuilderAPI_Sewing.__init__ (constructor) — __init__(self
  BRepBuilderAPI_Sewing.Init (method) — Init(self
  BRepBuilderAPI_Sewing.Load (method) — Load(self
  BRepBuilderAPI_Sewing.Add (method) — Add(self
  BRepBuilderAPI_Sewing.Perform (method) — Perform(self
  BRepBuilderAPI_Sewing.SetContext (method) — SetContext(self
  BRepBuilderAPI_Sewing.NbFreeEdges (method) — NbFreeEdges(self
  BRepBuilderAPI_Sewing.FreeEdge (method) — FreeEdge(self
  BRepBuilderAPI_Sewing.NbMultipleEdges (method) — NbMultipleEdges(self
  BRepBuilderAPI_Sewing.MultipleEdge (method) — MultipleEdge(self
  BRepBuilderAPI_Sewing.NbContigousEdges (method) — NbContigousEdges(self
  BRepBuilderAPI_Sewing.ContigousEdge (method) — ContigousEdge(self
  BRepBuilderAPI_Sewing.ContigousEdgeCouple (method) — ContigousEdgeCouple(self
  BRepBuilderAPI_Sewing.IsSectionBound (method) — IsSectionBound(self
  BRepBuilderAPI_Sewing.SectionToBoundary (method) — SectionToBoundary(self
  BRepBuilderAPI_Sewing.NbDegeneratedShapes (method) — NbDegeneratedShapes(self
  BRepBuilderAPI_Sewing.DegeneratedShape (method) — DegeneratedShape(self
  BRepBuilderAPI_Sewing.IsDegenerated (method) — IsDegenerated(self
  BRepBuilderAPI_Sewing.IsModified (method) — IsModified(self
  BRepBuilderAPI_Sewing.Modified (method) — Modified(self
  BRepBuilderAPI_Sewing.IsModifiedSubShape (method) — IsModifiedSubShape(self
  BRepBuilderAPI_Sewing.ModifiedSubShape (method) — ModifiedSubShape(self
  BRepBuilderAPI_Sewing.Dump (method) — Dump(self
  BRepBuilderAPI_Sewing.NbDeletedFaces (method) — NbDeletedFaces(self
  BRepBuilderAPI_Sewing.DeletedFace (method) — DeletedFace(self
  BRepBuilderAPI_Sewing.WhichFace (method) — WhichFace(self
  BRepBuilderAPI_Sewing.SameParameterMode (method) — SameParameterMode(*args, **kwargs)
  BRepBuilderAPI_Sewing.SetSameParameterMode (method) — SetSameParameterMode(*args, **kwargs)
  BRepBuilderAPI_Sewing.Tolerance (method) — Tolerance(*args, **kwargs)
  BRepBuilderAPI_Sewing.SetTolerance (method) — SetTolerance(*args, **kwargs)
  BRepBuilderAPI_Sewing.MinTolerance (method) — MinTolerance(*args, **kwargs)
  BRepBuilderAPI_Sewing.SetMinTolerance (method) — SetMinTolerance(*args, **kwargs)
  BRepBuilderAPI_Sewing.MaxTolerance (method) — MaxTolerance(*args, **kwargs)
  BRepBuilderAPI_Sewing.SetMaxTolerance (method) — SetMaxTolerance(*args, **kwargs)
  BRepBuilderAPI_Sewing.FaceMode (method) — FaceMode(*args, **kwargs)
  BRepBuilderAPI_Sewing.SetFaceMode (method) — SetFaceMode(*args, **kwargs)
  BRepBuilderAPI_Sewing.FloatingEdgesMode (method) — FloatingEdgesMode(*args, **kwargs)
  BRepBuilderAPI_Sewing.SetFloatingEdgesMode (method) — SetFloatingEdgesMode(*args, **kwargs)
  BRepBuilderAPI_Sewing.LocalTolerancesMode (method) — LocalTolerancesMode(*args, **kwargs)
  BRepBuilderAPI_Sewing.SetLocalTolerancesMode (method) — SetLocalTolerancesMode(*args, **kwargs)
  BRepBuilderAPI_Sewing.SetNonManifoldMode (method) — SetNonManifoldMode(*args, **kwargs)
  BRepBuilderAPI_Sewing.NonManifoldMode (method) — NonManifoldMode(*args, **kwargs)
  BRepBuilderAPI_Sewing.get_type_name_s (method) — get_type_name_s() -> str
  BRepBuilderAPI_Sewing.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  BRepBuilderAPI_Sewing.SewedShape (method) — SewedShape(self
  BRepBuilderAPI_Sewing.GetContext (method) — GetContext(self
  BRepBuilderAPI_Sewing.DynamicType (method) — DynamicType(self
BRepBuilderAPI_Transform (class) [4 members] — Geometric transformation on a shape
  BRepBuilderAPI_Transform.__init__ (constructor) — __init__(*args, **kwargs)
  BRepBuilderAPI_Transform.Perform (method) — Perform(self
  BRepBuilderAPI_Transform.ModifiedShape (method) — ModifiedShape(self
  BRepBuilderAPI_Transform.Modified (method) — Modified(self

## BRepGProp — `api-brepgprop.md`

BRepGProp (class) [5 members] — Provides global functions to compute a shape's global properties for…
  BRepGProp.__init__ (constructor) — __init__(self
  BRepGProp.LinearProperties_s (method) — LinearProperties_s(S
  BRepGProp.SurfaceProperties_s (method) — SurfaceProperties_s(*args, **kwargs)
  BRepGProp.VolumeProperties_s (method) — VolumeProperties_s(*args, **kwargs)
  BRepGProp.VolumePropertiesGK_s (method) — VolumePropertiesGK_s(*args, **kwargs)
BRepGProp_Face (class) [23 members]
  BRepGProp_Face.__init__ (constructor) — __init__(*args, **kwargs)
  BRepGProp_Face.Load (method) — Load(*args, **kwargs)
  BRepGProp_Face.VIntegrationOrder (method) — VIntegrationOrder(self
  BRepGProp_Face.NaturalRestriction (method) — NaturalRestriction(*args, **kwargs)
  BRepGProp_Face.Value2d (method) — Value2d(*args, **kwargs)
  BRepGProp_Face.SIntOrder (method) — SIntOrder(self
  BRepGProp_Face.SVIntSubs (method) — SVIntSubs(self
  BRepGProp_Face.SUIntSubs (method) — SUIntSubs(self
  BRepGProp_Face.UKnots (method) — UKnots(self
  BRepGProp_Face.VKnots (method) — VKnots(self
  BRepGProp_Face.LIntOrder (method) — LIntOrder(self
  BRepGProp_Face.LIntSubs (method) — LIntSubs(self
  BRepGProp_Face.LKnots (method) — LKnots(self
  BRepGProp_Face.UIntegrationOrder (method) — UIntegrationOrder(self
  BRepGProp_Face.Normal (method) — Normal(self
  BRepGProp_Face.FirstParameter (method) — FirstParameter(*args, **kwargs)
  BRepGProp_Face.LastParameter (method) — LastParameter(*args, **kwargs)
  BRepGProp_Face.IntegrationOrder (method) — IntegrationOrder(self
  BRepGProp_Face.D12d (method) — D12d(*args, **kwargs)
  BRepGProp_Face.Bounds (method) — Bounds(self
  BRepGProp_Face.GetUKnots (method) — GetUKnots(self
  BRepGProp_Face.GetTKnots (method) — GetTKnots(self
  BRepGProp_Face.GetFace (method) — GetFace(*args, **kwargs)

## BRepLib — `api-breplib.md`

BRepLib (class) [23 members] — The BRepLib package provides general utilities for BRep
  BRepLib.__init__ (constructor) — __init__(self
  BRepLib.Precision_s (method) — Precision_s(*args, **kwargs)
  BRepLib.Plane_s (method) — Plane_s(*args, **kwargs)
  BRepLib.CheckSameRange_s (method) — CheckSameRange_s(E
  BRepLib.SameRange_s (method) — SameRange_s(E
  BRepLib.BuildCurve3d_s (method) — BuildCurve3d_s(E
  BRepLib.BuildCurves3d_s (method) — BuildCurves3d_s(*args, **kwargs)
  BRepLib.BuildPCurveForEdgeOnPlane_s (method) — BuildPCurveForEdgeOnPlane_s(*args, **kwargs)
  BRepLib.UpdateEdgeTol_s (method) — UpdateEdgeTol_s(E
  BRepLib.UpdateEdgeTolerance_s (method) — UpdateEdgeTolerance_s(S
  BRepLib.SameParameter_s (method) — SameParameter_s(*args, **kwargs)
  BRepLib.UpdateTolerances_s (method) — UpdateTolerances_s(*args, **kwargs)
  BRepLib.UpdateInnerTolerances_s (method) — UpdateInnerTolerances_s(S
  BRepLib.OrientClosedSolid_s (method) — OrientClosedSolid_s(solid
  BRepLib.ContinuityOfFaces_s (method) — ContinuityOfFaces_s(theEdge
  BRepLib.EncodeRegularity_s (method) — EncodeRegularity_s(*args, **kwargs)
  BRepLib.SortFaces_s (method) — SortFaces_s(S
  BRepLib.ReverseSortFaces_s (method) — ReverseSortFaces_s(S
  BRepLib.EnsureNormalConsistency_s (method) — EnsureNormalConsistency_s(S
  BRepLib.UpdateDeflection_s (method) — UpdateDeflection_s(S
  BRepLib.FindValidRange_s (method) — FindValidRange_s(*args, **kwargs)
  BRepLib.ExtendFace_s (method) — ExtendFace_s(theF
  BRepLib.BoundingVertex_s (method) — BoundingVertex_s(theLV

## BRepMesh — `api-brepmesh.md`

BRepMesh_IncrementalMesh (class) [11 members] — Builds the mesh of a shape with respect of their…
  BRepMesh_IncrementalMesh.__init__ (constructor) — __init__(*args, **kwargs)
  BRepMesh_IncrementalMesh.Perform (method) — Perform(*args, **kwargs)
  BRepMesh_IncrementalMesh.IsModified (method) — IsModified(self
  BRepMesh_IncrementalMesh.GetStatusFlags (method) — GetStatusFlags(self
  BRepMesh_IncrementalMesh.IsParallelDefault_s (method) — IsParallelDefault_s() -> bool
  BRepMesh_IncrementalMesh.SetParallelDefault_s (method) — SetParallelDefault_s(isInParallel
  BRepMesh_IncrementalMesh.get_type_name_s (method) — get_type_name_s() -> str
  BRepMesh_IncrementalMesh.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  BRepMesh_IncrementalMesh.Parameters (method) — Parameters(self
  BRepMesh_IncrementalMesh.ChangeParameters (method) — ChangeParameters(self
  BRepMesh_IncrementalMesh.DynamicType (method) — DynamicType(self

## BRepTools — `api-breptools.md`

BRepTools (class) [26 members] — The BRepTools package provides utilities for BRep data structures
  BRepTools.__init__ (constructor) — __init__(self
  BRepTools.AddUVBounds_s (method) — AddUVBounds_s(*args, **kwargs)
  BRepTools.Update_s (method) — Update_s(*args, **kwargs)
  BRepTools.UpdateFaceUVPoints_s (method) — UpdateFaceUVPoints_s(theF
  BRepTools.Clean_s (method) — Clean_s(theShape
  BRepTools.CleanGeometry_s (method) — CleanGeometry_s(theShape
  BRepTools.RemoveUnusedPCurves_s (method) — RemoveUnusedPCurves_s(S
  BRepTools.Triangulation_s (method) — Triangulation_s(theShape
  BRepTools.LoadTriangulation_s (method) — LoadTriangulation_s(theShape
  BRepTools.UnloadTriangulation_s (method) — UnloadTriangulation_s(theShape
  BRepTools.ActivateTriangulation_s (method) — ActivateTriangulation_s(theShape
  BRepTools.LoadAllTriangulations_s (method) — LoadAllTriangulations_s(theShape
  BRepTools.UnloadAllTriangulations_s (method) — UnloadAllTriangulations_s(theShape
  BRepTools.Compare_s (method) — Compare_s(*args, **kwargs)
  BRepTools.OuterWire_s (method) — OuterWire_s(F
  BRepTools.Map3DEdges_s (method) — Map3DEdges_s(S
  BRepTools.IsReallyClosed_s (method) — IsReallyClosed_s(E
  BRepTools.Dump_s (method) — Dump_s(Sh
  BRepTools.Write_s (method) — Write_s(*args, **kwargs)
  BRepTools.Read_s (method) — Read_s(*args, **kwargs)
  BRepTools.EvalAndUpdateTol_s (method) — EvalAndUpdateTol_s(theE
  BRepTools.OriEdgeInFace_s (method) — OriEdgeInFace_s(theEdge
  BRepTools.RemoveInternals_s (method) — RemoveInternals_s(theS
  BRepTools.CheckLocations_s (method) — CheckLocations_s(theS
  BRepTools.UVBounds_s (method) — UVBounds_s(*args, **kwargs)
  BRepTools.DetectClosedness_s (method) — DetectClosedness_s(theFace
BRepTools_WireExplorer (class) [8 members] — The WireExplorer is a tool to explore the edges of…
  BRepTools_WireExplorer.__init__ (constructor) — __init__(*args, **kwargs)
  BRepTools_WireExplorer.Init (method) — Init(*args, **kwargs)
  BRepTools_WireExplorer.More (method) — More(self
  BRepTools_WireExplorer.Next (method) — Next(self
  BRepTools_WireExplorer.Orientation (method) — Orientation(self
  BRepTools_WireExplorer.Clear (method) — Clear(self
  BRepTools_WireExplorer.Current (method) — Current(self
  BRepTools_WireExplorer.CurrentVertex (method) — CurrentVertex(self

## BRep — `api-brep.md`

BRep_Builder (class) [14 members] — A framework providing advanced tolerance control
  BRep_Builder.__init__ (constructor) — __init__(self
  BRep_Builder.MakeFace (method) — MakeFace(*args, **kwargs)
  BRep_Builder.UpdateFace (method) — UpdateFace(*args, **kwargs)
  BRep_Builder.NaturalRestriction (method) — NaturalRestriction(self
  BRep_Builder.MakeEdge (method) — MakeEdge(*args, **kwargs)
  BRep_Builder.UpdateEdge (method) — UpdateEdge(*args, **kwargs)
  BRep_Builder.Continuity (method) — Continuity(*args, **kwargs)
  BRep_Builder.SameParameter (method) — SameParameter(self
  BRep_Builder.SameRange (method) — SameRange(self
  BRep_Builder.Degenerated (method) — Degenerated(self
  BRep_Builder.Range (method) — Range(*args, **kwargs)
  BRep_Builder.Transfert (method) — Transfert(*args, **kwargs)
  BRep_Builder.MakeVertex (method) — MakeVertex(*args, **kwargs)
  BRep_Builder.UpdateVertex (method) — UpdateVertex(*args, **kwargs)
BRep_Tool (class) [27 members] — Provides class methods to access to the geometry of BRep…
  BRep_Tool.__init__ (constructor) — __init__(self
  BRep_Tool.IsClosed_s (method) — IsClosed_s(*args, **kwargs)
  BRep_Tool.Surface_s (method) — Surface_s(*args, **kwargs)
  BRep_Tool.Triangulation_s (method) — Triangulation_s(theFace
  BRep_Tool.Triangulations_s (method) — Triangulations_s(theFace
  BRep_Tool.Tolerance_s (method) — Tolerance_s(*args, **kwargs)
  BRep_Tool.NaturalRestriction_s (method) — NaturalRestriction_s(F
  BRep_Tool.IsGeometric_s (method) — IsGeometric_s(*args, **kwargs)
  BRep_Tool.Curve_s (method) — Curve_s(*args, **kwargs)
  BRep_Tool.Polygon3D_s (method) — Polygon3D_s(E
  BRep_Tool.CurveOnSurface_s (method) — CurveOnSurface_s(*args, **kwargs)
  BRep_Tool.CurveOnPlane_s (method) — CurveOnPlane_s(E
  BRep_Tool.PolygonOnSurface_s (method) — PolygonOnSurface_s(*args, **kwargs)
  BRep_Tool.PolygonOnTriangulation_s (method) — PolygonOnTriangulation_s(*args, **kwargs)
  BRep_Tool.SameParameter_s (method) — SameParameter_s(E
  BRep_Tool.SameRange_s (method) — SameRange_s(E
  BRep_Tool.Degenerated_s (method) — Degenerated_s(E
  BRep_Tool.UVPoints_s (method) — UVPoints_s(*args, **kwargs)
  BRep_Tool.SetUVPoints_s (method) — SetUVPoints_s(*args, **kwargs)
  BRep_Tool.HasContinuity_s (method) — HasContinuity_s(*args, **kwargs)
  BRep_Tool.Continuity_s (method) — Continuity_s(*args, **kwargs)
  BRep_Tool.MaxContinuity_s (method) — MaxContinuity_s(theEdge
  BRep_Tool.Pnt_s (method) — Pnt_s(V
  BRep_Tool.Parameter_s (method) — Parameter_s(*args, **kwargs)
  BRep_Tool.Parameters_s (method) — Parameters_s(V
  BRep_Tool.MaxTolerance_s (method) — MaxTolerance_s(theShape
  BRep_Tool.Range_s (method) — Range_s(*args, **kwargs)

## joints — `api-joints.md`

BallJoint (class) [5 members] — BallJoint
  BallJoint.location (property) — Location of joint
  BallJoint.symbol (property) — A CAD symbol representing joint as bound to part
  BallJoint.__init__ (constructor)
  BallJoint.connect_to (method) — Connect BallJoint and RigidJoint
  BallJoint.relative_to (method) — relative_to - BallJoint
CylindricalJoint (class) [5 members] — CylindricalJoint
  CylindricalJoint.location (property) — Location of joint
  CylindricalJoint.symbol (property) — A CAD symbol representing the cylindrical axis as bound to…
  CylindricalJoint.__init__ (constructor)
  CylindricalJoint.connect_to (method) — Connect CylindricalJoint and RigidJoint"
  CylindricalJoint.relative_to (method) — Relative location of CylindricalJoint to RigidJoint
LinearJoint (class) [5 members] — LinearJoint
  LinearJoint.location (property) — Location of joint
  LinearJoint.symbol (property) — A CAD symbol of the linear axis positioned relative to_part
  LinearJoint.__init__ (constructor)
  LinearJoint.connect_to (method) — Connect LinearJoint to another Joint
  LinearJoint.relative_to (method) — Relative location of LinearJoint to RevoluteJoint or RigidJoint
RevoluteJoint (class) [5 members] — RevoluteJoint
  RevoluteJoint.location (property) — Location of joint
  RevoluteJoint.symbol (property) — A CAD symbol representing the axis of rotation as bound…
  RevoluteJoint.__init__ (constructor)
  RevoluteJoint.connect_to (method) — Connect RevoluteJoint and RigidJoint
  RevoluteJoint.relative_to (method) — Relative location of RevoluteJoint to RigidJoint
RigidJoint (class) [5 members] — RigidJoint
  RigidJoint.location (property) — Location of joint
  RigidJoint.symbol (property) — A CAD symbol (XYZ indicator) as bound to part
  RigidJoint.__init__ (constructor)
  RigidJoint.connect_to (method) — Connect the RigidJoint to another Joint
  RigidJoint.relative_to (method) — Relative location of RigidJoint to another Joint

## objects_part — `api-objects-part.md`

BasePartObject (class) [1 members] — BasePartObject
  BasePartObject.__init__ (constructor)
Box (class) [1 members] — Part Object
  Box.__init__ (constructor)
Cone (class) [1 members] — Part Object
  Cone.__init__ (constructor)
ConvexPolyhedron (class) [1 members] — Part Object
  ConvexPolyhedron.__init__ (constructor)
CounterBoreHole (class) [1 members] — Part Operation
  CounterBoreHole.__init__ (constructor)
CounterSinkHole (class) [1 members] — Part Operation
  CounterSinkHole.__init__ (constructor)
Cylinder (class) [1 members] — Part Object
  Cylinder.__init__ (constructor)
Hole (class) [1 members] — Part Operation
  Hole.__init__ (constructor)
Sphere (class) [1 members] — Part Object
  Sphere.__init__ (constructor)
Torus (class) [1 members] — Part Object
  Torus.__init__ (constructor)
Wedge (class) [1 members] — Part Object
  Wedge.__init__ (constructor)

## objects_sketch — `api-objects-sketch.md`

BaseSketchObject (class) [1 members] — BaseSketchObject
  BaseSketchObject.__init__ (constructor)
Circle (class) [1 members] — Sketch Object
  Circle.__init__ (constructor)
Ellipse (class) [1 members] — Sketch Object
  Ellipse.__init__ (constructor)
Polygon (class) [1 members] — Sketch Object
  Polygon.__init__ (constructor)
Rectangle (class) [1 members] — Sketch Object
  Rectangle.__init__ (constructor)
RectangleRounded (class) [1 members] — Sketch Object
  RectangleRounded.__init__ (constructor)
RegularPolygon (class) [1 members] — Sketch Object
  RegularPolygon.__init__ (constructor)
SlotArc (class) [1 members] — Sketch Object
  SlotArc.__init__ (constructor)
SlotCenterPoint (class) [1 members] — Sketch Object
  SlotCenterPoint.__init__ (constructor)
SlotCenterToCenter (class) [1 members] — Sketch Object
  SlotCenterToCenter.__init__ (constructor)
SlotOverall (class) [1 members] — Sketch Object
  SlotOverall.__init__ (constructor)
Text (class) [1 members] — Sketch Object
  Text.__init__ (constructor)
Trapezoid (class) [1 members] — Sketch Object
  Trapezoid.__init__ (constructor)
Triangle (class) [1 members] — Sketch Object
  Triangle.__init__ (constructor)

## Bnd — `api-bnd.md`

Bnd_Box (class) [40 members] — Describes a bounding box in 3D space
  Bnd_Box.__init__ (constructor) — __init__(*args, **kwargs)
  Bnd_Box.SetWhole (method) — SetWhole(self
  Bnd_Box.SetVoid (method) — SetVoid(self
  Bnd_Box.Set (method) — Set(*args, **kwargs)
  Bnd_Box.Update (method) — Update(*args, **kwargs)
  Bnd_Box.GetGap (method) — GetGap(self
  Bnd_Box.SetGap (method) — SetGap(self
  Bnd_Box.Enlarge (method) — Enlarge(self
  Bnd_Box.CornerMin (method) — CornerMin(self
  Bnd_Box.CornerMax (method) — CornerMax(self
  Bnd_Box.OpenXmin (method) — OpenXmin(self
  Bnd_Box.OpenXmax (method) — OpenXmax(self
  Bnd_Box.OpenYmin (method) — OpenYmin(self
  Bnd_Box.OpenYmax (method) — OpenYmax(self
  Bnd_Box.OpenZmin (method) — OpenZmin(self
  Bnd_Box.OpenZmax (method) — OpenZmax(self
  Bnd_Box.IsOpen (method) — IsOpen(self
  Bnd_Box.IsOpenXmin (method) — IsOpenXmin(self
  Bnd_Box.IsOpenXmax (method) — IsOpenXmax(self
  Bnd_Box.IsOpenYmin (method) — IsOpenYmin(self
  Bnd_Box.IsOpenYmax (method) — IsOpenYmax(self
  Bnd_Box.IsOpenZmin (method) — IsOpenZmin(self
  Bnd_Box.IsOpenZmax (method) — IsOpenZmax(self
  Bnd_Box.IsWhole (method) — IsWhole(self
  Bnd_Box.IsVoid (method) — IsVoid(self
  Bnd_Box.IsXThin (method) — IsXThin(self
  Bnd_Box.IsYThin (method) — IsYThin(self
  Bnd_Box.IsZThin (method) — IsZThin(self
  Bnd_Box.IsThin (method) — IsThin(self
  Bnd_Box.Transformed (method) — Transformed(self
  Bnd_Box.Add (method) — Add(*args, **kwargs)
  Bnd_Box.IsOut (method) — IsOut(*args, **kwargs)
  Bnd_Box.Distance (method) — Distance(self
  Bnd_Box.Dump (method) — Dump(self
  Bnd_Box.SquareExtent (method) — SquareExtent(self
  Bnd_Box.FinitePart (method) — FinitePart(self
  Bnd_Box.HasFinitePart (method) — HasFinitePart(self
  Bnd_Box.DumpJson (method) — DumpJson(self
  Bnd_Box.InitFromJson (method) — InitFromJson(self
  Bnd_Box.Get (method) — Get(self
Bnd_OBB (class) [25 members] — The class describes the Oriented Bounding Box (OBB), much tighter…
  Bnd_OBB.__init__ (constructor) — __init__(*args, **kwargs)
  Bnd_OBB.ReBuild (method) — ReBuild(self
  Bnd_OBB.SetCenter (method) — SetCenter(self
  Bnd_OBB.SetXComponent (method) — SetXComponent(self
  Bnd_OBB.SetYComponent (method) — SetYComponent(self
  Bnd_OBB.SetZComponent (method) — SetZComponent(self
  Bnd_OBB.Position (method) — Position(self
  Bnd_OBB.XHSize (method) — XHSize(self
  Bnd_OBB.YHSize (method) — YHSize(self
  Bnd_OBB.ZHSize (method) — ZHSize(self
  Bnd_OBB.IsVoid (method) — IsVoid(self
  Bnd_OBB.SetVoid (method) — SetVoid(self
  Bnd_OBB.SetAABox (method) — SetAABox(self
  Bnd_OBB.IsAABox (method) — IsAABox(self
  Bnd_OBB.Enlarge (method) — Enlarge(self
  Bnd_OBB.GetVertex (method) — GetVertex(self
  Bnd_OBB.SquareExtent (method) — SquareExtent(self
  Bnd_OBB.IsOut (method) — IsOut(*args, **kwargs)
  Bnd_OBB.IsCompletelyInside (method) — IsCompletelyInside(self
  Bnd_OBB.Add (method) — Add(*args, **kwargs)
  Bnd_OBB.DumpJson (method) — DumpJson(self
  Bnd_OBB.Center (method) — Center(self
  Bnd_OBB.XDirection (method) — XDirection(self
  Bnd_OBB.YDirection (method) — YDirection(self
  Bnd_OBB.ZDirection (method) — ZDirection(self

## build_line — `api-build-line.md`

BuildLine (class) [6 members] — BuildLine
  BuildLine.__init__ (constructor)
  BuildLine.line (property) — Get the current line
  BuildLine.faces (method) — faces() not implemented
  BuildLine.face (method) — face() not implemented
  BuildLine.solids (method) — solids() not implemented
  BuildLine.solid (method) — solid() not implemented

## build_part — `api-build-part.md`

BuildPart (class) [4 members] — BuildPart
  BuildPart.__init__ (constructor)
  BuildPart.part (property) — Get the current part
  BuildPart.pending_edges_as_wire (property) — Return a wire representation of the pending edges
  BuildPart.location (property) — Builder's location

## build_sketch — `api-build-sketch.md`

BuildSketch (class) [6 members] — BuildSketch
  BuildSketch.__init__ (constructor)
  BuildSketch.sketch_local (property) — Get the builder's object
  BuildSketch.sketch (property) — The global version of the sketch - may contain multiple…
  BuildSketch.solids (method) — solids() not implemented
  BuildSketch.solid (method) — solid() not implemented
  BuildSketch.consolidate_edges (method) — Unify pending edges into one or more Wires

## build_common — `api-build-common.md`

Builder (class) [14 members] — Builder
  Builder.__init__ (constructor)
  Builder.max_dimension (property) — Maximum size of object in all directions
  Builder.new_edges (property) — Edges that changed during last operation
  Builder.vertices (method) — Return Vertices
  Builder.vertex (method) — Return Vertex
  Builder.edges (method) — Return Edges
  Builder.edge (method) — Return Edge
  Builder.wires (method) — Return Wires
  Builder.wire (method) — Return Wire
  Builder.faces (method) — Return Faces
  Builder.face (method) — Return Face
  Builder.solids (method) — Return Solids
  Builder.solid (method) — Return Solid
  Builder.validate_inputs (method) — Validate that objects/operations and parameters apply
GridLocations (class) [1 members] — Location Context
  GridLocations.__init__ (constructor)
HexLocations (class) [1 members] — Location Context
  HexLocations.__init__ (constructor)
LocationList (class) [2 members] — Location Context
  LocationList.locations (property) — Current local locations globalized with current workplanes
  LocationList.__init__ (constructor)
Locations (class) [1 members] — Location Context
  Locations.__init__ (constructor)
PolarLocations (class) [1 members] — Location Context
  PolarLocations.__init__ (constructor)
WorkplaneList (class) [2 members] — Workplane Context
  WorkplaneList.__init__ (constructor)
  WorkplaneList.localize (method) — Localize a sequence of points to the active workplane
edge (function) — Return Edge
edges (function) — Return Edges
face (function) — Return Face
faces (function) — Return Faces
flatten_sequence (function) — Convert a sequence of object potentially containing iterables into a…
solid (function) — Return Solid
solids (function) — Return Solids
validate_inputs (function) — A function to wrap the method when used outside of…
vertex (function) — Return Vertex
vertices (function) — Return Vertices
wire (function) — Return Wire
wires (function) — Return Wires

## _io — `api-io.md`

BytesIO (class) [19 members] — Buffered I/O implementation using an in-memory bytes buffer
  BytesIO.__init__ (constructor) — Initialize self
  BytesIO.readable (method) — Returns True if the IO object can be read
  BytesIO.seekable (method) — Returns True if the IO object can be seeked
  BytesIO.writable (method) — Returns True if the IO object can be written
  BytesIO.close (method) — Disable all I/O operations
  BytesIO.flush (method) — Does nothing
  BytesIO.isatty (method) — Always returns False
  BytesIO.tell (method) — Current file position, an integer
  BytesIO.write (method) — Write bytes to file
  BytesIO.writelines (method) — Write lines to the file
  BytesIO.read1 (method) — Read at most size bytes, returned as a bytes object
  BytesIO.readinto (method) — Read bytes into buffer
  BytesIO.readline (method) — Next line from the file, as a bytes object
  BytesIO.readlines (method) — List of bytes objects, each a line from the file
  BytesIO.read (method) — Read at most size bytes, returned as a bytes object
  BytesIO.getbuffer (method) — Get a read-write view over the contents of the BytesIO…
  BytesIO.getvalue (method) — Retrieve the entire contents of the BytesIO object
  BytesIO.seek (method) — Change stream position
  BytesIO.truncate (method) — Truncate the file to at most size bytes

## svg — `api-svg.md`

ColorAndLabel (class) [3 members]
  ColorAndLabel.__init__ (constructor)
  ColorAndLabel.color_for (method) — Fill color if shape should be filled stroke color otherwise
  ColorAndLabel.Label_by (method)
import_svg_document (function) — Import shapes from an SVG document as faces and/or wires

## shape_core — `api-shape-core.md`

Comparable (class) — Abstract base class that requires comparison methods
GroupBy (class) [3 members] — Result of a Shape.groupby operation
  GroupBy.__init__ (constructor)
  GroupBy.group (method) — Select group by key
  GroupBy.group_for (method) — Select group by shape
Joint (class) [5 members] — Joint
  Joint.__init__ (constructor)
  Joint.location (property) — Location of joint
  Joint.symbol (property) — A CAD object positioned in global space to illustrate the…
  Joint.connect_to (method) — All derived classes must provide a connect_to method
  Joint.relative_to (method) — Return relative location to another joint
Shape (class) [78 members] — Shape
  Shape.__init__ (constructor)
  Shape.wrapped (property) — OCP TopoDS object
  Shape.area (property) — area -the surface area of all faces in this Shape
  Shape.color (property) — Get the shape's color
  Shape.geom_type (property) — Gets the underlying geometry type
  Shape.is_manifold (property) — is_manifold
  Shape.is_null (property) — Returns true if this shape is null
  Shape.is_planar_face (property) — Is the shape a planar face even though its geom_type…
  Shape.is_valid (property) — Returns True if no defect is detected on the shape…
  Shape.global_location (property) — The location of this Shape relative to the global coordinate…
  Shape.location (property) — Get this Shape's Location
  Shape.matrix_of_inertia (property) — Compute the inertia matrix (moment of inertia tensor) of the…
  Shape.orientation (property) — Get the orientation component of this Shape's Location
  Shape.position (property) — Get the position component of this Shape's Location
  Shape.principal_properties (property) — Compute the principal moments of inertia and their corresponding axes
  Shape.shape_type (property) — Return the shape type string for this class
  Shape.static_moments (property) — Compute the static moments (first moments of mass) of the…
  Shape.cast (method) — Returns the right type of wrapper, given a OCCT object
  Shape.extrude (method) — extrude
  Shape.combined_center (method) — combined center
  Shape.compute_mass (method) — Calculates the 'mass' of an object
  Shape.get_shape_list (method) — Helper to extract entities of a specific type from a…
  Shape.get_single_shape (method) — Return the single entity of the requested type
  Shape.register_composite_factory (method) — Register a composite constructor without importing it here
  Shape.make_composite (method) — Build the registered composite for a dimension
  Shape.bounding_box (method) — Create a bounding box for this Shape
  Shape.clean (method) — clean
  Shape.closest_points (method) — Points on two shapes where the distance between them is…
  Shape.compound (method) — Return the Compound
  Shape.compounds (method) — compounds - all the compounds in this Shape
  Shape.copy_attributes_to (method) — Copy common object attributes to target
  Shape.cut (method) — Remove the positional arguments from this Shape
  Shape.distance (method) — Minimal distance between two shapes
  Shape.distance_to (method) — Minimal distance between two shapes
  Shape.distance_to_with_closest_points (method) — Minimal distance between two shapes and the points on each…
  Shape.distances (method) — Minimal distances to between self and other shapes
  Shape.edge (method) — Return the Edge
  Shape.edges (method) — edges - all the edges in this Shape - subclasses…
  Shape.entities (method) — Return all of the TopoDS sub entities of the given…
  Shape.face (method) — Return the Face
  Shape.faces (method) — faces - all the faces in this Shape
  Shape.faces_intersected_by_axis (method) — Line Intersection
  Shape.fix (method) — fix - try to fix shape if not valid
  Shape.fuse (method) — fuse
  Shape.get_top_level_shapes (method) — Retrieve the first level of child shapes from the shape
  Shape.intersect (method) — Find where bodies/interiors meet (overlap or crossing geometry)
  Shape.touch (method) — Find boundary contacts between this shape and another
  Shape.is_equal (method) — Returns True if two shapes are equal, i.e
  Shape.is_same (method) — Returns True if other and this shape are same, i.e
  Shape.locate (method) — Apply a location in absolute sense to self
  Shape.located (method) — located
  Shape.mesh (method) — Generate triangulation if none exists
  Shape.mirror (method) — Applies a mirror transform to this Shape
  Shape.move (method) — Apply a location in relative sense (i.e
  Shape.moved (method) — moved
  Shape.oriented_bounding_box (method) — Create an oriented bounding box for this Shape
  Shape.project_faces (method) — Projected Faces following the given path on Shape
  Shape.radius_of_gyration (method) — Compute the radius of gyration of the shape about a…
  Shape.relocate (method) — Change the location of self while keeping it geometrically similar
  Shape.rotate (method) — rotate a copy
  Shape.scale (method) — Scale this shape about a point
  Shape.shell (method) — Return the Shell
  Shape.shells (method) — shells - all the shells in this Shape
  Shape.show_topology (method) — Display internal topology
  Shape.solid (method) — Return the Solid
  Shape.solids (method) — solids - all the solids in this Shape
  Shape.split (method) — split
  Shape.split_by_perimeter (method) — split_by_perimeter
  Shape.tessellate (method) — General triangulated approximation
  Shape.to_splines (method) — to_splines
  Shape.transform_geometry (method) — Apply affine transform
  Shape.transform_shape (method) — Apply affine transform without changing type
  Shape.transformed (method) — Transform Shape
  Shape.translate (method) — Translates this shape through a transformation
  Shape.wire (method) — Return the Wire
  Shape.wires (method) — wires - all the wires in this Shape
  Shape.vertex (method) — Return the Vertex
  Shape.vertices (method) — vertices - all the vertices in this Shape
ShapeList (class) [23 members] — Subclass of list with custom filter and sort methods appropriate…
  ShapeList.first (property) — First element in the ShapeList
  ShapeList.last (property) — Last element in the ShapeList
  ShapeList.expand (method) — Expand by dissolving compounds, wires, and shells, filtering nulls
  ShapeList.center (method) — The average of the center of objects within the ShapeList
  ShapeList.compound (method) — Return the Compound
  ShapeList.compounds (method) — compounds - all the compounds in this ShapeList
  ShapeList.edge (method) — Return the Edge
  ShapeList.edges (method) — edges - all the edges in this ShapeList
  ShapeList.face (method) — Return the Face
  ShapeList.faces (method) — faces - all the faces in this ShapeList
  ShapeList.filter_by (method) — filter by
  ShapeList.filter_by_position (method) — filter by position
  ShapeList.group_by (method) — group by
  ShapeList.shell (method) — Return the Shell
  ShapeList.shells (method) — shells - all the shells in this ShapeList
  ShapeList.solid (method) — Return the Solid
  ShapeList.solids (method) — solids - all the solids in this ShapeList
  ShapeList.sort_by (method) — sort by
  ShapeList.sort_by_distance (method) — Sort by distance
  ShapeList.vertex (method) — Return the Vertex
  ShapeList.vertices (method) — vertices - all the vertices in this ShapeList
  ShapeList.wire (method) — Return the Wire
  ShapeList.wires (method) — wires - all the wires in this ShapeList
SkipClean (class) — Skip clean context for use in operator driven code where…
downcast (function) — Downcasts a TopoDS object to suitable specialized type
fix (function) — Fix a TopoDS object to suitable specialized type
topo_distance_to (function) — Return a key function that yields topological distance to ``other``
unwrap_topods_compound (function) — Strip unnecessary Compound wrappers

## composite — `api-composite.md`

Compound (class) [14 members] — A Compound in build123d is a topological entity representing a…
  Compound.__init__ (constructor) — Build a Compound from Shapes
  Compound.volume (property) — volume - the volume of this Compound
  Compound.cast (method) — Returns the right type of wrapper, given a OCCT object
  Compound.extrude (method) — extrude
  Compound.make_text (method) — Text that optionally follows a path
  Compound.make_triad (method) — The coordinate system triad (X, Y, Z axes)
  Compound.center (method) — Return center of object
  Compound.compound (method) — Return the Compound
  Compound.compounds (method) — compounds - all the compounds in this Shape
  Compound.do_children_intersect (method) — Do Children Intersect
  Compound.get_type (method) — get_type
  Compound.touch (method) — Distribute touch over compound elements
  Compound.project_to_viewport (method) — project_to_viewport
  Compound.unwrap (method) — Strip unnecessary Compound wrappers
Curve (class) [1 members] — A Compound containing 1D objects - aka Edges
  Curve.wires (method) — A list of wires created from the edges
Part (class) — A Compound containing 3D objects - aka Solids
Sketch (class) — A Compound containing 2D objects - aka Faces

## three_d — `api-three-d.md`

DraftAngleError (class) [1 members] — Solid.draft custom exception
  DraftAngleError.__init__ (constructor)
Solid (class) [20 members] — A Solid in build123d represents a three-dimensional solid geometry
  Solid.__init__ (constructor) — Build a solid from an OCCT TopoDS_Shape/TopoDS_Solid
  Solid.volume (property) — volume - the volume of this Solid
  Solid.touch (method) — Find where this Solid's boundary contacts another shape
  Solid.extrude (method) — extrude
  Solid.extrude_linear_with_rotation (method) — Extrude with Rotation
  Solid.extrude_taper (method) — Extrude a cross section with a taper
  Solid.extrude_until (method) — extrude_until
  Solid.from_bounding_box (method) — A box of the same dimensions and location
  Solid.make_box (method) — make box
  Solid.make_cone (method) — make cone
  Solid.make_cylinder (method) — make cylinder
  Solid.make_loft (method) — make loft
  Solid.make_sphere (method) — Sphere
  Solid.make_torus (method) — make torus
  Solid.make_wedge (method) — Make a wedge
  Solid.revolve (method) — Revolve
  Solid.sweep (method) — Sweep
  Solid.sweep_multi (method) — Multi section sweep
  Solid.thicken (method) — Thicken Face or Shell
  Solid.draft (method) — Apply a draft angle to the given faces of the…

## one_d — `api-one-d.md`

Edge (class) [35 members] — An Edge in build123d is a fundamental element in the…
  Edge.__init__ (constructor) — Build an Edge from an OCCT TopoDS_Shape/TopoDS_Edge
  Edge.arc_center (property) — center of an underlying circle or ellipse geometry
  Edge.extrude (method) — extrude
  Edge.make_bezier (method) — make_bezier
  Edge.make_circle (method) — make circle
  Edge.make_constrained_arcs (method)
  Edge.make_constrained_lines (method) — Create planar line(s) on XY subject to tangency/contact constraints
  Edge.make_ellipse (method) — make ellipse
  Edge.make_parabola (method) — make parabola
  Edge.make_hyperbola (method) — make hyperbola
  Edge.make_helix (method) — make_helix
  Edge.make_line (method) — Create a line between two points
  Edge.make_mid_way (method) — make line between edges
  Edge.make_spline (method) — Spline
  Edge.make_bspline (method) — Create an exact B-spline edge from control points and knot…
  Edge.make_spline_approx (method) — make_spline_approx
  Edge.make_tangent_arc (method) — Tangent Arc
  Edge.make_three_point_arc (method) — Three Point Arc
  Edge.close (method) — Close an Edge
  Edge.distribute_locations (method) — Distribute Locations
  Edge.find_intersection_points (method) — find_intersection_points
  Edge.find_tangent (method) — find_tangent
  Edge.geom_adaptor (method) — Return the Geom Curve from this Edge
  Edge.geom_equal (method) — Compare two edges for geometric equality within tolerance
  Edge.param_at (method) — Map a normalized arc-length position to the underlying OCCT parameter
  Edge.param_at_point (method) — Return the normalized parameter (∈ [0.0, 1.0]) of the location…
  Edge.project_to_shape (method) — Project Edge
  Edge.reversed (method) — reversed
  Edge.to_axis (method) — Translate a linear Edge to an Axis
  Edge.to_wire (method) — Edge as Wire
  Edge.trim (method) — trim
  Edge.trim_to_length (method) — trim_to_length
  Edge.trim_to_other (method) — Return the shortest Edge of self trimmed by other or…
  Edge.is_infinite (property) — Check if edge is infinite (LINE with length > 1e100)
  Edge.trim_infinite (method) — Trim an infinite line edge to a finite length
Wire (class) [23 members] — A Wire in build123d is a topological entity representing a…
  Wire.__init__ (constructor)
  Wire.combine (method) — combine
  Wire.extrude (method) — extrude - invalid operation for Wire
  Wire.make_circle (method) — make_circle
  Wire.make_convex_hull (method) — make_convex_hull
  Wire.make_ellipse (method) — make ellipse
  Wire.make_polygon (method) — make_polygon
  Wire.make_rect (method) — Make Rectangle
  Wire.order_chamfer_edges (method) — Order the edges of a chamfer relative to a reference…
  Wire.chamfer_2d (method) — chamfer_2d
  Wire.close (method) — Close a Wire
  Wire.edges (method) — edges - all the edges in this Shape
  Wire.fillet_2d (method) — fillet_2d
  Wire.fix_degenerate_edges (method) — fix_degenerate_edges
  Wire.geom_adaptor (method) — Return the Geom Comp Curve for this Wire
  Wire.order_edges (method) — Return the edges in self ordered by wire direction and…
  Wire.geom_equal (method) — Compare two wires for geometric equality within tolerance
  Wire.param_at (method) — Return the OCCT comp-curve parameter corresponding to the given wire…
  Wire.param_at_point (method) — Return the normalized wire parameter for the point closest to…
  Wire.project_to_shape (method) — Project Wire
  Wire.stitch (method) — Attempt to stitch wires
  Wire.to_wire (method) — Return Wire - used as a pair with Edge.to_wire when…
  Wire.trim (method) — Trim a wire between [start, end] normalized over total length
edges_to_wires (function) — Convert edges to a list of wires
offset_topods_face (function) — Offset a topods_face
topo_explore_connected_edges (function) — Find edges connected to the given edge with at least…
topo_explore_connected_faces (function) — Given an edge extracted from a Shape, return the topods_faces…

## enum — `api-enum.md`

Enum (enum) — Create a collection of name/value pairs
IntEnum (enum) — Enum where members are also (and must be) ints
auto (class) [1 members] — Instances are replaced with an appropriate value in Enum class…
  auto.__init__ (constructor)
unique (function) — Class decorator for enumerations ensuring unique member values

## two_d — `api-two-d.md`

Face (class) [47 members] — A Face in build123d represents a 3D bounded surface within…
  Face.__init__ (constructor)
  Face.area_without_holes (property) — Calculate the total surface area of the face, including the…
  Face.axis_of_rotation (property) — Get the rotational axis of a cylinder or torus
  Face.axes_of_symmetry (property) — Computes and returns the axes of symmetry for a planar…
  Face.center_location (property) — Location at the center of face
  Face.geometry (property) — geometry of planar face
  Face.is_circular_convex (property) — Determine whether a given face is convex relative to its…
  Face.is_circular_concave (property) — Determine whether a given face is concave relative to its…
  Face.is_planar (property) — Is the face planar even though its geom_type may not…
  Face.length (property) — length of planar face
  Face.radii (property) — Return the major and minor radii of a torus otherwise…
  Face.radius (property) — Return the radius of a cylinder or sphere, otherwise None
  Face.seams (property) — Return the seams contained within this Face
  Face.semi_angle (property) — Return the semi angle of a cone, otherwise None
  Face.uv_face (property) — Create a planar face from a face's parametric-space boundary
  Face.volume (property) — volume - the volume of this Face, which is always…
  Face.width (property) — width of planar face
  Face.extrude (method) — extrude
  Face.make_bezier_surface (method) — make_bezier_surface
  Face.make_gordon_surface (method) — Constructs a Gordon surface from a network of profile and…
  Face.make_plane (method) — Create a unlimited size Face aligned with plane
  Face.make_rect (method) — make_rect
  Face.make_surface (method) — Create Non-Planar Face
  Face.make_surface_from_array_of_points (method) — make_surface_from_array_of_points
  Face.make_surface_from_curves (method) — make_surface_from_curves
  Face.make_surface_patch (method) — make_surface_patch
  Face.revolve (method) — sweep
  Face.sew_faces (method) — sew faces
  Face.sweep (method) — sweep
  Face.center (method) — Center of Face
  Face.chamfer_2d (method) — Apply 2D chamfer to a face
  Face.fillet_2d (method) — Apply 2D fillet to a face
  Face.geom_adaptor (method) — Return the Geom Surface for this Face
  Face.inner_wires (method) — Extract the inner or hole wires from this Face
  Face.is_coplanar (method) — Is this planar face coplanar with the provided plane
  Face.is_inside (method) — Point inside Face
  Face.location_at (method) — location_at
  Face.make_holes (method) — Make Holes in Face
  Face.normal_at (method) — normal_at
  Face.outer_wire (method) — Extract the perimeter wire from this Face
  Face.position_at (method) — position_at
  Face.project_to_shape (method) — Project Face to target Object
  Face.to_arcs (method) — to_arcs
  Face.without_holes (method) — without_holes
  Face.wire (method) — Return the outerwire, generate a warning if inner_wires present
  Face.wrap (method) — wrap
  Face.wrap_faces (method) — wrap_faces
Shell (class) [8 members] — A Shell is a fundamental component in build123d's topological data…
  Shell.__init__ (constructor) — Build a shell from an OCCT TopoDS_Shape/TopoDS_Shell
  Shell.volume (property) — volume - the volume of this Shell if manifold, otherwise…
  Shell.extrude (method) — extrude
  Shell.make_loft (method) — make loft
  Shell.revolve (method) — sweep
  Shell.sweep (method) — sweep
  Shell.center (method) — Center of mass of the shell
  Shell.location_at (method) — location_at
sort_wires_by_build_order (function) — Tries to determine how wires should be combined into faces

## text — `api-text.md`

FontManager (class) [7 members] — Wrap OCP Font_FontMgr
  FontManager.__init__ (constructor) — Initialize FontManager
  FontManager.available_fonts (method) — Get list of available fonts by name and available styles…
  FontManager.check_font (method) — Check if font exists at path and return system font
  FontManager.find_font (method) — Find font in FontManager library by name and style
  FontManager.register_font (method) — Register all font faces in a font file and return…
  FontManager.register_folder (method) — Register all fonts in a folder
  FontManager.register_system_fonts (method) — Runner to (re)inititalize the OCCT FontMgr font list since user…
available_fonts (function) — Get list of available fonts by name and available styles…

## GProp — `api-gprop.md`

GProp_GProps (class) [9 members] — Implements a general mechanism to compute the global properties of…
  GProp_GProps.__init__ (constructor) — __init__(*args, **kwargs)
  GProp_GProps.Add (method) — Add(self
  GProp_GProps.Mass (method) — Mass(self
  GProp_GProps.CentreOfMass (method) — CentreOfMass(self
  GProp_GProps.MatrixOfInertia (method) — MatrixOfInertia(self
  GProp_GProps.MomentOfInertia (method) — MomentOfInertia(self
  GProp_GProps.PrincipalProperties (method) — PrincipalProperties(self
  GProp_GProps.RadiusOfGyration (method) — RadiusOfGyration(self
  GProp_GProps.StaticMoments (method) — StaticMoments(self

## GeomAPI — `api-geomapi.md`

GeomAPI_IntCS (class) [8 members] — This class implements methods for computing intersection points and segments…
  GeomAPI_IntCS.__init__ (constructor) — __init__(*args, **kwargs)
  GeomAPI_IntCS.Perform (method) — Perform(self
  GeomAPI_IntCS.IsDone (method) — IsDone(self
  GeomAPI_IntCS.NbPoints (method) — NbPoints(self
  GeomAPI_IntCS.Point (method) — Point(self
  GeomAPI_IntCS.NbSegments (method) — NbSegments(self
  GeomAPI_IntCS.Segment (method) — Segment(self
  GeomAPI_IntCS.Parameters (method) — Parameters(*args, **kwargs)
GeomAPI_IntSS (class) [5 members] — This class implements methods for computing the intersection curves between…
  GeomAPI_IntSS.__init__ (constructor) — __init__(*args, **kwargs)
  GeomAPI_IntSS.Perform (method) — Perform(*args, **kwargs)
  GeomAPI_IntSS.IsDone (method) — IsDone(*args, **kwargs)
  GeomAPI_IntSS.NbLines (method) — NbLines(*args, **kwargs)
  GeomAPI_IntSS.Line (method) — Line(*args, **kwargs)
GeomAPI_ProjectPointOnSurf (class) [14 members] — This class implements methods for computing all the orthogonal projections…
  GeomAPI_ProjectPointOnSurf.__init__ (constructor) — __init__(*args, **kwargs)
  GeomAPI_ProjectPointOnSurf.Init (method) — Init(*args, **kwargs)
  GeomAPI_ProjectPointOnSurf.SetExtremaAlgo (method) — SetExtremaAlgo(self
  GeomAPI_ProjectPointOnSurf.SetExtremaFlag (method) — SetExtremaFlag(self
  GeomAPI_ProjectPointOnSurf.Perform (method) — Perform(self
  GeomAPI_ProjectPointOnSurf.IsDone (method) — IsDone(self
  GeomAPI_ProjectPointOnSurf.NbPoints (method) — NbPoints(self
  GeomAPI_ProjectPointOnSurf.Point (method) — Point(self
  GeomAPI_ProjectPointOnSurf.Distance (method) — Distance(self
  GeomAPI_ProjectPointOnSurf.NearestPoint (method) — NearestPoint(self
  GeomAPI_ProjectPointOnSurf.LowerDistance (method) — LowerDistance(self
  GeomAPI_ProjectPointOnSurf.Parameters (method) — Parameters(self
  GeomAPI_ProjectPointOnSurf.LowerDistanceParameters (method) — LowerDistanceParameters(self
  GeomAPI_ProjectPointOnSurf.Extrema (method) — Extrema(*args, **kwargs)

## GeomConvert — `api-geomconvert.md`

GeomConvert (class) [9 members] — The GeomConvert package provides some global functions as follows -…
  GeomConvert.__init__ (constructor) — __init__(self
  GeomConvert.SplitBSplineCurve_s (method) — SplitBSplineCurve_s(*args, **kwargs)
  GeomConvert.SplitBSplineSurface_s (method) — SplitBSplineSurface_s(*args, **kwargs)
  GeomConvert.CurveToBSplineCurve_s (method) — CurveToBSplineCurve_s(C
  GeomConvert.SurfaceToBSplineSurface_s (method) — SurfaceToBSplineSurface_s(S
  GeomConvert.ConcatG1_s (method) — ConcatG1_s(ArrayOfCurves
  GeomConvert.ConcatC1_s (method) — ConcatC1_s(*args, **kwargs)
  GeomConvert.C0BSplineToC1BSplineCurve_s (method) — C0BSplineToC1BSplineCurve_s(BS
  GeomConvert.C0BSplineToArrayOfC1BSplineCurve_s (method) — C0BSplineToArrayOfC1BSplineCurve_s(*args, **kwargs)
GeomConvert_BSplineCurveToBezierCurve (class) [5 members] — An algorithm to convert a BSpline curve into a series…
  GeomConvert_BSplineCurveToBezierCurve.__init__ (constructor) — __init__(*args, **kwargs)
  GeomConvert_BSplineCurveToBezierCurve.Arc (method) — Arc(self
  GeomConvert_BSplineCurveToBezierCurve.Arcs (method) — Arcs(self
  GeomConvert_BSplineCurveToBezierCurve.Knots (method) — Knots(self
  GeomConvert_BSplineCurveToBezierCurve.NbArcs (method) — NbArcs(self

## Geom — `api-geom.md`

Geom_BSplineCurve (class) [66 members] — Definition of the B_spline curve
  Geom_BSplineCurve.__init__ (constructor) — __init__(*args, **kwargs)
  Geom_BSplineCurve.IncreaseDegree (method) — IncreaseDegree(self
  Geom_BSplineCurve.IncreaseMultiplicity (method) — IncreaseMultiplicity(*args, **kwargs)
  Geom_BSplineCurve.IncrementMultiplicity (method) — IncrementMultiplicity(self
  Geom_BSplineCurve.InsertKnot (method) — InsertKnot(self
  Geom_BSplineCurve.InsertKnots (method) — InsertKnots(self
  Geom_BSplineCurve.RemoveKnot (method) — RemoveKnot(self
  Geom_BSplineCurve.Reverse (method) — Reverse(self
  Geom_BSplineCurve.ReversedParameter (method) — ReversedParameter(self
  Geom_BSplineCurve.Segment (method) — Segment(self
  Geom_BSplineCurve.SetKnot (method) — SetKnot(*args, **kwargs)
  Geom_BSplineCurve.SetKnots (method) — SetKnots(self
  Geom_BSplineCurve.SetPeriodic (method) — SetPeriodic(self
  Geom_BSplineCurve.SetOrigin (method) — SetOrigin(*args, **kwargs)
  Geom_BSplineCurve.SetNotPeriodic (method) — SetNotPeriodic(self
  Geom_BSplineCurve.SetPole (method) — SetPole(*args, **kwargs)
  Geom_BSplineCurve.SetWeight (method) — SetWeight(self
  Geom_BSplineCurve.IsCN (method) — IsCN(self
  Geom_BSplineCurve.IsG1 (method) — IsG1(self
  Geom_BSplineCurve.IsClosed (method) — IsClosed(self
  Geom_BSplineCurve.IsPeriodic (method) — IsPeriodic(self
  Geom_BSplineCurve.IsRational (method) — IsRational(self
  Geom_BSplineCurve.Continuity (method) — Continuity(self
  Geom_BSplineCurve.Degree (method) — Degree(self
  Geom_BSplineCurve.D0 (method) — D0(self
  Geom_BSplineCurve.D1 (method) — D1(self
  Geom_BSplineCurve.D2 (method) — D2(self
  Geom_BSplineCurve.D3 (method) — D3(self
  Geom_BSplineCurve.DN (method) — DN(self
  Geom_BSplineCurve.LocalValue (method) — LocalValue(self
  Geom_BSplineCurve.LocalD0 (method) — LocalD0(self
  Geom_BSplineCurve.LocalD1 (method) — LocalD1(self
  Geom_BSplineCurve.LocalD2 (method) — LocalD2(self
  Geom_BSplineCurve.LocalD3 (method) — LocalD3(self
  Geom_BSplineCurve.LocalDN (method) — LocalDN(self
  Geom_BSplineCurve.EndPoint (method) — EndPoint(self
  Geom_BSplineCurve.FirstUKnotIndex (method) — FirstUKnotIndex(self
  Geom_BSplineCurve.FirstParameter (method) — FirstParameter(self
  Geom_BSplineCurve.Knot (method) — Knot(self
  Geom_BSplineCurve.Knots (method) — Knots(*args, **kwargs)
  Geom_BSplineCurve.KnotSequence (method) — KnotSequence(*args, **kwargs)
  Geom_BSplineCurve.KnotDistribution (method) — KnotDistribution(self
  Geom_BSplineCurve.LastUKnotIndex (method) — LastUKnotIndex(self
  Geom_BSplineCurve.LastParameter (method) — LastParameter(self
  Geom_BSplineCurve.Multiplicity (method) — Multiplicity(self
  Geom_BSplineCurve.Multiplicities (method) — Multiplicities(*args, **kwargs)
  Geom_BSplineCurve.NbKnots (method) — NbKnots(self
  Geom_BSplineCurve.NbPoles (method) — NbPoles(self
  Geom_BSplineCurve.Pole (method) — Pole(self
  Geom_BSplineCurve.Poles (method) — Poles(*args, **kwargs)
  Geom_BSplineCurve.StartPoint (method) — StartPoint(self
  Geom_BSplineCurve.Weight (method) — Weight(self
  Geom_BSplineCurve.Weights (method) — Weights(*args, **kwargs)
  Geom_BSplineCurve.Transform (method) — Transform(self
  Geom_BSplineCurve.Copy (method) — Copy(self
  Geom_BSplineCurve.IsEqual (method) — IsEqual(self
  Geom_BSplineCurve.DumpJson (method) — DumpJson(self
  Geom_BSplineCurve.PeriodicNormalization (method) — PeriodicNormalization(self
  Geom_BSplineCurve.MovePoint (method) — MovePoint(self
  Geom_BSplineCurve.MovePointAndTangent (method) — MovePointAndTangent(self
  Geom_BSplineCurve.LocateU (method) — LocateU(self
  Geom_BSplineCurve.Resolution (method) — Resolution(self
  Geom_BSplineCurve.MaxDegree_s (method) — MaxDegree_s() -> int
  Geom_BSplineCurve.get_type_name_s (method) — get_type_name_s() -> str
  Geom_BSplineCurve.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  Geom_BSplineCurve.DynamicType (method) — DynamicType(self
Geom_BezierCurve (class) [38 members] — Describes a rational or non-rational Bezier curve - a non-rational…
  Geom_BezierCurve.__init__ (constructor) — __init__(*args, **kwargs)
  Geom_BezierCurve.Increase (method) — Increase(self
  Geom_BezierCurve.InsertPoleAfter (method) — InsertPoleAfter(*args, **kwargs)
  Geom_BezierCurve.InsertPoleBefore (method) — InsertPoleBefore(*args, **kwargs)
  Geom_BezierCurve.RemovePole (method) — RemovePole(self
  Geom_BezierCurve.Reverse (method) — Reverse(self
  Geom_BezierCurve.ReversedParameter (method) — ReversedParameter(self
  Geom_BezierCurve.Segment (method) — Segment(self
  Geom_BezierCurve.SetPole (method) — SetPole(*args, **kwargs)
  Geom_BezierCurve.SetWeight (method) — SetWeight(self
  Geom_BezierCurve.IsClosed (method) — IsClosed(self
  Geom_BezierCurve.IsCN (method) — IsCN(self
  Geom_BezierCurve.IsPeriodic (method) — IsPeriodic(self
  Geom_BezierCurve.IsRational (method) — IsRational(self
  Geom_BezierCurve.Continuity (method) — Continuity(self
  Geom_BezierCurve.Degree (method) — Degree(self
  Geom_BezierCurve.D0 (method) — D0(self
  Geom_BezierCurve.D1 (method) — D1(self
  Geom_BezierCurve.D2 (method) — D2(self
  Geom_BezierCurve.D3 (method) — D3(self
  Geom_BezierCurve.DN (method) — DN(self
  Geom_BezierCurve.StartPoint (method) — StartPoint(self
  Geom_BezierCurve.EndPoint (method) — EndPoint(self
  Geom_BezierCurve.FirstParameter (method) — FirstParameter(self
  Geom_BezierCurve.LastParameter (method) — LastParameter(self
  Geom_BezierCurve.NbPoles (method) — NbPoles(self
  Geom_BezierCurve.Pole (method) — Pole(self
  Geom_BezierCurve.Poles (method) — Poles(*args, **kwargs)
  Geom_BezierCurve.Weight (method) — Weight(self
  Geom_BezierCurve.Weights (method) — Weights(*args, **kwargs)
  Geom_BezierCurve.Transform (method) — Transform(self
  Geom_BezierCurve.Copy (method) — Copy(self
  Geom_BezierCurve.DumpJson (method) — DumpJson(self
  Geom_BezierCurve.Resolution (method) — Resolution(self
  Geom_BezierCurve.MaxDegree_s (method) — MaxDegree_s() -> int
  Geom_BezierCurve.get_type_name_s (method) — get_type_name_s() -> str
  Geom_BezierCurve.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  Geom_BezierCurve.DynamicType (method) — DynamicType(self

## Geom (2) — `api-geom-2.md`

Geom_BoundedSurface (class) [4 members] — The root class for bounded surfaces in 3D space
  Geom_BoundedSurface.__init__ (constructor) — Initialize self
  Geom_BoundedSurface.get_type_name_s (method) — get_type_name_s() -> str
  Geom_BoundedSurface.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  Geom_BoundedSurface.DynamicType (method) — DynamicType(self
Geom_ElementarySurface (class) [18 members] — Describes the common behavior of surfaces which have a simple…
  Geom_ElementarySurface.__init__ (constructor) — Initialize self
  Geom_ElementarySurface.SetAxis (method) — SetAxis(self
  Geom_ElementarySurface.SetLocation (method) — SetLocation(self
  Geom_ElementarySurface.SetPosition (method) — SetPosition(self
  Geom_ElementarySurface.UReverse (method) — UReverse(self
  Geom_ElementarySurface.UReversedParameter (method) — UReversedParameter(self
  Geom_ElementarySurface.VReverse (method) — VReverse(self
  Geom_ElementarySurface.VReversedParameter (method) — VReversedParameter(self
  Geom_ElementarySurface.Continuity (method) — Continuity(self
  Geom_ElementarySurface.IsCNu (method) — IsCNu(self
  Geom_ElementarySurface.IsCNv (method) — IsCNv(self
  Geom_ElementarySurface.DumpJson (method) — DumpJson(self
  Geom_ElementarySurface.get_type_name_s (method) — get_type_name_s() -> str
  Geom_ElementarySurface.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  Geom_ElementarySurface.Axis (method) — Axis(self
  Geom_ElementarySurface.Location (method) — Location(self
  Geom_ElementarySurface.Position (method) — Position(self
  Geom_ElementarySurface.DynamicType (method) — DynamicType(self
Geom_Line (class) [28 members] — Describes an infinite line
  Geom_Line.__init__ (constructor) — __init__(*args, **kwargs)
  Geom_Line.SetLin (method) — SetLin(self
  Geom_Line.SetDirection (method) — SetDirection(self
  Geom_Line.SetLocation (method) — SetLocation(self
  Geom_Line.SetPosition (method) — SetPosition(self
  Geom_Line.Lin (method) — Lin(self
  Geom_Line.Reverse (method) — Reverse(self
  Geom_Line.ReversedParameter (method) — ReversedParameter(self
  Geom_Line.FirstParameter (method) — FirstParameter(self
  Geom_Line.LastParameter (method) — LastParameter(self
  Geom_Line.IsClosed (method) — IsClosed(self
  Geom_Line.IsPeriodic (method) — IsPeriodic(self
  Geom_Line.Continuity (method) — Continuity(self
  Geom_Line.IsCN (method) — IsCN(self
  Geom_Line.D0 (method) — D0(self
  Geom_Line.D1 (method) — D1(self
  Geom_Line.D2 (method) — D2(self
  Geom_Line.D3 (method) — D3(self
  Geom_Line.DN (method) — DN(self
  Geom_Line.Transform (method) — Transform(self
  Geom_Line.TransformedParameter (method) — TransformedParameter(self
  Geom_Line.ParametricTransformation (method) — ParametricTransformation(self
  Geom_Line.Copy (method) — Copy(self
  Geom_Line.DumpJson (method) — DumpJson(self
  Geom_Line.get_type_name_s (method) — get_type_name_s() -> str
  Geom_Line.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  Geom_Line.Position (method) — Position(self
  Geom_Line.DynamicType (method) — DynamicType(self
Geom_Plane (class) [28 members] — Describes a plane in 3D space
  Geom_Plane.__init__ (constructor) — __init__(*args, **kwargs)
  Geom_Plane.SetPln (method) — SetPln(self
  Geom_Plane.Pln (method) — Pln(self
  Geom_Plane.UReverse (method) — UReverse(self
  Geom_Plane.UReversedParameter (method) — UReversedParameter(self
  Geom_Plane.VReverse (method) — VReverse(self
  Geom_Plane.VReversedParameter (method) — VReversedParameter(self
  Geom_Plane.ParametricTransformation (method) — ParametricTransformation(self
  Geom_Plane.IsUClosed (method) — IsUClosed(self
  Geom_Plane.IsVClosed (method) — IsVClosed(self
  Geom_Plane.IsUPeriodic (method) — IsUPeriodic(self
  Geom_Plane.IsVPeriodic (method) — IsVPeriodic(self
  Geom_Plane.UIso (method) — UIso(self
  Geom_Plane.VIso (method) — VIso(self
  Geom_Plane.D0 (method) — D0(self
  Geom_Plane.D1 (method) — D1(self
  Geom_Plane.D2 (method) — D2(self
  Geom_Plane.D3 (method) — D3(self
  Geom_Plane.DN (method) — DN(self
  Geom_Plane.Transform (method) — Transform(self
  Geom_Plane.Copy (method) — Copy(self
  Geom_Plane.DumpJson (method) — DumpJson(self
  Geom_Plane.TransformParameters (method) — TransformParameters(self
  Geom_Plane.Bounds (method) — Bounds(self
  Geom_Plane.Coefficients (method) — Coefficients(self
  Geom_Plane.get_type_name_s (method) — get_type_name_s() -> str
  Geom_Plane.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  Geom_Plane.DynamicType (method) — DynamicType(self

## HLRAlgo — `api-hlralgo.md`

HLRAlgo_Projector (class) [12 members] — Implements a projector object
  HLRAlgo_Projector.__init__ (constructor) — __init__(*args, **kwargs)
  HLRAlgo_Projector.Set (method) — Set(self
  HLRAlgo_Projector.Directions (method) — Directions(*args, **kwargs)
  HLRAlgo_Projector.Scaled (method) — Scaled(self
  HLRAlgo_Projector.Perspective (method) — Perspective(*args, **kwargs)
  HLRAlgo_Projector.Focus (method) — Focus(*args, **kwargs)
  HLRAlgo_Projector.Transform (method) — Transform(*args, **kwargs)
  HLRAlgo_Projector.Project (method) — Project(*args, **kwargs)
  HLRAlgo_Projector.Shoot (method) — Shoot(self
  HLRAlgo_Projector.Transformation (method) — Transformation(self
  HLRAlgo_Projector.InvertedTransformation (method) — InvertedTransformation(*args, **kwargs)
  HLRAlgo_Projector.FullTransformation (method) — FullTransformation(*args, **kwargs)

## HLRBRep — `api-hlrbrep.md`

HLRBRep_Algo (class) [7 members] — Inherited from InternalAlgo to provide methods with Shape from TopoDS
  HLRBRep_Algo.__init__ (constructor) — __init__(*args, **kwargs)
  HLRBRep_Algo.Add (method) — Add(*args, **kwargs)
  HLRBRep_Algo.Index (method) — Index(self
  HLRBRep_Algo.OutLinedShapeNullify (method) — OutLinedShapeNullify(self
  HLRBRep_Algo.get_type_name_s (method) — get_type_name_s() -> str
  HLRBRep_Algo.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  HLRBRep_Algo.DynamicType (method) — DynamicType(self
HLRBRep_HLRToShape (class) [13 members] — A framework for filtering the computation results of an HLRBRep_Algo…
  HLRBRep_HLRToShape.__init__ (constructor) — __init__(self
  HLRBRep_HLRToShape.VCompound (method) — VCompound(*args, **kwargs)
  HLRBRep_HLRToShape.Rg1LineVCompound (method) — Rg1LineVCompound(*args, **kwargs)
  HLRBRep_HLRToShape.RgNLineVCompound (method) — RgNLineVCompound(*args, **kwargs)
  HLRBRep_HLRToShape.OutLineVCompound (method) — OutLineVCompound(*args, **kwargs)
  HLRBRep_HLRToShape.OutLineVCompound3d (method) — OutLineVCompound3d(*args, **kwargs)
  HLRBRep_HLRToShape.IsoLineVCompound (method) — IsoLineVCompound(*args, **kwargs)
  HLRBRep_HLRToShape.HCompound (method) — HCompound(*args, **kwargs)
  HLRBRep_HLRToShape.Rg1LineHCompound (method) — Rg1LineHCompound(*args, **kwargs)
  HLRBRep_HLRToShape.RgNLineHCompound (method) — RgNLineHCompound(*args, **kwargs)
  HLRBRep_HLRToShape.OutLineHCompound (method) — OutLineHCompound(*args, **kwargs)
  HLRBRep_HLRToShape.IsoLineHCompound (method) — IsoLineHCompound(*args, **kwargs)
  HLRBRep_HLRToShape.CompoundOfEdges (method) — CompoundOfEdges(*args, **kwargs)

## IFSelect — `api-ifselect.md`

IFSelect_ReturnStatus (class) [3 members] — Qualifies an execution status
  IFSelect_ReturnStatus.__init__ (constructor) — __init__(self
  IFSelect_ReturnStatus.name (property) — name(self
  IFSelect_ReturnStatus.value (property)

## IGESControl — `api-igescontrol.md`

IGESControl_Controller (class) [9 members] — Controller for IGES-5.1Controller for IGES-5.1Controller for IGES-5.1
  IGESControl_Controller.__init__ (constructor) — __init__(self
  IGESControl_Controller.NewModel (method) — NewModel(self
  IGESControl_Controller.ActorRead (method) — ActorRead(self
  IGESControl_Controller.TransferWriteShape (method) — TransferWriteShape(self
  IGESControl_Controller.Customise (method) — Customise(self
  IGESControl_Controller.Init_s (method) — Init_s() -> bool
  IGESControl_Controller.get_type_name_s (method) — get_type_name_s() -> str
  IGESControl_Controller.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  IGESControl_Controller.DynamicType (method) — DynamicType(self

## Interface — `api-interface.md`

Interface_Static (class) [27 members] — This class gives a way to manage meaningful static variables,…
  Interface_Static.__init__ (constructor) — __init__(*args, **kwargs)
  Interface_Static.PrintStatic (method) — PrintStatic(self
  Interface_Static.Family (method) — Family(self
  Interface_Static.SetWild (method) — SetWild(self
  Interface_Static.Wild (method) — Wild(self
  Interface_Static.SetUptodate (method) — SetUptodate(self
  Interface_Static.UpdatedStatus (method) — UpdatedStatus(self
  Interface_Static.Init_s (method) — Init_s(*args, **kwargs)
  Interface_Static.Static_s (method) — Static_s(name
  Interface_Static.IsPresent_s (method) — IsPresent_s(name
  Interface_Static.CDef_s (method) — CDef_s(name
  Interface_Static.IDef_s (method) — IDef_s(name
  Interface_Static.IsSet_s (method) — IsSet_s(name
  Interface_Static.CVal_s (method) — CVal_s(name
  Interface_Static.IVal_s (method) — IVal_s(name
  Interface_Static.RVal_s (method) — RVal_s(name
  Interface_Static.SetCVal_s (method) — SetCVal_s(name
  Interface_Static.SetIVal_s (method) — SetIVal_s(name
  Interface_Static.SetRVal_s (method) — SetRVal_s(name
  Interface_Static.Update_s (method) — Update_s(name
  Interface_Static.IsUpdated_s (method) — IsUpdated_s(name
  Interface_Static.Items_s (method) — Items_s(mode
  Interface_Static.Standards_s (method) — Standards_s() -> None
  Interface_Static.FillMap_s (method) — FillMap_s(theMap
  Interface_Static.get_type_name_s (method) — get_type_name_s() -> str
  Interface_Static.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  Interface_Static.DynamicType (method) — DynamicType(self

## mesher — `api-mesher.md`

Mesher (class) [15 members] — Mesher
  Mesher.__init__ (constructor)
  Mesher.model_unit (property) — Unit used in the model
  Mesher.triangle_counts (property) — Number of triangles in each of the model's meshes
  Mesher.vertex_counts (property) — Number of vertices in each of the models's meshes
  Mesher.mesh_count (property) — Number of meshes in the model
  Mesher.library_version (property) — 3MF Consortium Lib#MF version
  Mesher.add_meta_data (method) — add_meta_data
  Mesher.add_code_to_metadata (method) — Add the code calling this method to the 3MF metadata…
  Mesher.get_meta_data (method) — Retrieve all of the metadata
  Mesher.get_meta_data_by_key (method) — Retrieve the metadata value and type for the provided name…
  Mesher.get_mesh_properties (method) — Retrieve the properties from all the meshes
  Mesher.add_shape (method) — add_shape
  Mesher.read (method) — read
  Mesher.write (method) — write
  Mesher.write_stream (method) — write_stream

## Message — `api-message.md`

Message (class) [14 members] — Defines - tools to work with messages - basic tools…
  Message.__init__ (constructor) — __init__(self
  Message.DefaultMessenger_s (method) — DefaultMessenger_s() -> OCP.OCP.Message.Message_Messenger
  Message.Send_s (method) — Send_s(*args, **kwargs)
  Message.SendFail_s (method) — SendFail_s(*args, **kwargs)
  Message.SendAlarm_s (method) — SendAlarm_s(*args, **kwargs)
  Message.SendWarning_s (method) — SendWarning_s(*args, **kwargs)
  Message.SendInfo_s (method) — SendInfo_s(*args, **kwargs)
  Message.SendTrace_s (method) — SendTrace_s(*args, **kwargs)
  Message.FillTime_s (method) — FillTime_s(Hour
  Message.DefaultReport_s (method) — DefaultReport_s(theToCreate
  Message.MetricFromString_s (method) — MetricFromString_s(*args, **kwargs)
  Message.MetricToString_s (method) — MetricToString_s(theType
  Message.ToOSDMetric_s (method) — ToOSDMetric_s(theMetric
  Message.ToMessageMetric_s (method) — ToMessageMetric_s(theMemInfo
Message_Gravity (class) [3 members] — Defines gravity level of messages - Trace
  Message_Gravity.__init__ (constructor) — __init__(self
  Message_Gravity.name (property) — name(self
  Message_Gravity.value (property)
Message_ProgressRange (class) [5 members] — Auxiliary class representing a part of the global progress scale…
  Message_ProgressRange.__init__ (constructor) — __init__(*args, **kwargs)
  Message_ProgressRange.UserBreak (method) — UserBreak(*args, **kwargs)
  Message_ProgressRange.More (method) — More(self
  Message_ProgressRange.IsActive (method) — IsActive(*args, **kwargs)
  Message_ProgressRange.Close (method) — Close(*args, **kwargs)

## _local — `api-local.md`

Path (class) [28 members] — PurePath subclass that can make system calls
  Path.as_uri (method) — Return the path as a URI
  Path.__init__ (constructor)
  Path.stat (method) — Return the result of the stat() system call on this…
  Path.is_mount (method) — Check if this path is a mount point
  Path.is_junction (method) — Whether this path is a junction
  Path.open (method) — Open the file pointed to by this path and return…
  Path.read_text (method) — Open the file in text mode, read it, and close…
  Path.write_text (method) — Open the file in text mode, write to it, and…
  Path.iterdir (method) — Yield path objects of the directory contents
  Path.glob (method) — Iterate over this subtree and yield all existing files (of…
  Path.rglob (method) — Recursively yield all existing files (of any kind, including
  Path.walk (method) — Walk the directory tree from this directory, similar to os.walk()
  Path.absolute (method) — Return an absolute version of this path
  Path.resolve (method) — Make the path absolute, resolving all symlinks on the way…
  Path.owner (method) — Return the login name of the file owner
  Path.group (method) — Return the group name of the file gid
  Path.readlink (method) — Return the path to which the symbolic link points
  Path.touch (method) — Create this file with the given access mode, if it…
  Path.mkdir (method) — Create a new directory at this given path
  Path.chmod (method) — Change the permissions of the path, like os.chmod()
  Path.unlink (method) — Remove this file or link
  Path.rmdir (method) — Remove this directory
  Path.rename (method) — Rename this path to the target path
  Path.replace (method) — Rename this path to the target path, overwriting if that…
  Path.symlink_to (method) — Make this path a symlink pointing to the target path
  Path.hardlink_to (method) — Make this path a hard link pointing to the same…
  Path.expanduser (method) — Return a new path with expanded ~ and ~user constructs
  Path.from_uri (method) — Return a new path from the given 'file' URI

## os — `api-os.md`

PathLike (class) — Abstract base class for implementing the file system path protocol
fsdecode (function) — Decode filename (an os.PathLike, bytes, or str) from the filesystem

## preorderiter — `api-preorderiter.md`

PreOrderIter (class) — Iterate over tree applying pre-order strategy starting at `node`

## Quantity — `api-quantity.md`

Quantity_Color (class) [44 members] — This class allows the definition of an RGB color as…
  Quantity_Color.__init__ (constructor) — __init__(*args, **kwargs)
  Quantity_Color.Name (method) — Name(self
  Quantity_Color.SetValues (method) — SetValues(*args, **kwargs)
  Quantity_Color.Red (method) — Red(self
  Quantity_Color.Green (method) — Green(self
  Quantity_Color.Blue (method) — Blue(self
  Quantity_Color.Hue (method) — Hue(self
  Quantity_Color.Light (method) — Light(self
  Quantity_Color.ChangeIntensity (method) — ChangeIntensity(self
  Quantity_Color.Saturation (method) — Saturation(self
  Quantity_Color.ChangeContrast (method) — ChangeContrast(self
  Quantity_Color.IsDifferent (method) — IsDifferent(self
  Quantity_Color.IsEqual (method) — IsEqual(self
  Quantity_Color.Distance (method) — Distance(self
  Quantity_Color.SquareDistance (method) — SquareDistance(self
  Quantity_Color.DeltaE2000 (method) — DeltaE2000(self
  Quantity_Color.DumpJson (method) — DumpJson(self
  Quantity_Color.InitFromJson (method) — InitFromJson(self
  Quantity_Color.Values (method) — Values(self
  Quantity_Color.Delta (method) — Delta(self
  Quantity_Color.Name_s (method) — Name_s(theR
  Quantity_Color.StringName_s (method) — StringName_s(theColor
  Quantity_Color.ColorFromName_s (method) — ColorFromName_s(*args, **kwargs)
  Quantity_Color.ColorFromHex_s (method) — ColorFromHex_s(theHexColorString
  Quantity_Color.ColorToHex_s (method) — ColorToHex_s(theColor
  Quantity_Color.Convert_sRGB_To_HLS_s (method) — Convert_sRGB_To_HLS_s(theRgb
  Quantity_Color.Convert_HLS_To_sRGB_s (method) — Convert_HLS_To_sRGB_s(theHls
  Quantity_Color.Convert_LinearRGB_To_HLS_s (method) — Convert_LinearRGB_To_HLS_s(theRgb
  Quantity_Color.Convert_HLS_To_LinearRGB_s (method) — Convert_HLS_To_LinearRGB_s(theHls
  Quantity_Color.Convert_LinearRGB_To_Lab_s (method) — Convert_LinearRGB_To_Lab_s(theRgb
  Quantity_Color.Convert_Lab_To_Lch_s (method) — Convert_Lab_To_Lch_s(theLab
  Quantity_Color.Convert_Lab_To_LinearRGB_s (method) — Convert_Lab_To_LinearRGB_s(theLab
  Quantity_Color.Convert_Lch_To_Lab_s (method) — Convert_Lch_To_Lab_s(theLch
  Quantity_Color.Argb2color_s (method) — Argb2color_s(theARGB
  Quantity_Color.Convert_LinearRGB_To_sRGB_s (method) — Convert_LinearRGB_To_sRGB_s(*args, **kwargs)
  Quantity_Color.Convert_sRGB_To_LinearRGB_s (method) — Convert_sRGB_To_LinearRGB_s(*args, **kwargs)
  Quantity_Color.Convert_LinearRGB_To_sRGB_approx22_s (method) — Convert_LinearRGB_To_sRGB_approx22_s(*args, **kwargs)
  Quantity_Color.Convert_sRGB_To_LinearRGB_approx22_s (method) — Convert_sRGB_To_LinearRGB_approx22_s(*args, **kwargs)
  Quantity_Color.Epsilon_s (method) — Epsilon_s() -> float
  Quantity_Color.SetEpsilon_s (method) — SetEpsilon_s(theEpsilon
  Quantity_Color.Color2argb_s (method) — Color2argb_s(theColor
  Quantity_Color.HlsRgb_s (method) — HlsRgb_s(theH
  Quantity_Color.RgbHls_s (method) — RgbHls_s(theR
  Quantity_Color.Rgb (method) — Rgb(self
Quantity_ColorRGBA (class) [16 members] — The pair of Quantity_Color and Alpha component (1.0 opaque, 0.0…
  Quantity_ColorRGBA.__init__ (constructor) — __init__(*args, **kwargs)
  Quantity_ColorRGBA.SetValues (method) — SetValues(self
  Quantity_ColorRGBA.SetRGB (method) — SetRGB(self
  Quantity_ColorRGBA.Alpha (method) — Alpha(self
  Quantity_ColorRGBA.SetAlpha (method) — SetAlpha(self
  Quantity_ColorRGBA.IsDifferent (method) — IsDifferent(self
  Quantity_ColorRGBA.IsEqual (method) — IsEqual(self
  Quantity_ColorRGBA.DumpJson (method) — DumpJson(self
  Quantity_ColorRGBA.InitFromJson (method) — InitFromJson(self
  Quantity_ColorRGBA.ColorFromName_s (method) — ColorFromName_s(theColorNameString
  Quantity_ColorRGBA.ColorFromHex_s (method) — ColorFromHex_s(theHexColorString
  Quantity_ColorRGBA.ColorToHex_s (method) — ColorToHex_s(theColor
  Quantity_ColorRGBA.Convert_LinearRGB_To_sRGB_s (method) — Convert_LinearRGB_To_sRGB_s(theRGB
  Quantity_ColorRGBA.Convert_sRGB_To_LinearRGB_s (method) — Convert_sRGB_To_LinearRGB_s(theRGB
  Quantity_ColorRGBA.GetRGB (method) — GetRGB(self
  Quantity_ColorRGBA.ChangeRGB (method) — ChangeRGB(self
Quantity_TypeOfColor (class) [3 members] — Identifies color definition systems
  Quantity_TypeOfColor.__init__ (constructor) — __init__(self
  Quantity_TypeOfColor.name (property) — name(self
  Quantity_TypeOfColor.value (property)

## colors — `api-colors.md`

RGB (class) [5 members] — Named tuple representing an RGB color value
  RGB.to_floats (method) — Returns the color value as a tuple of floats in…
  RGB.from_floats (method) — Returns an :class:`RGB` instance from floats in range [0, 1]
  RGB.to_hex (method) — Returns the color value as hex string "#RRGGBB"
  RGB.from_hex (method) — Returns an :class:`RGB` instance from a hex color string, the…
  RGB.luminance (property) — Returns perceived luminance for an RGB color in range [0.0,…
aci2rgb (function) — Convert :ref:`ACI` into (r, g, b) tuple, based on default…

## RWGltf — `api-rwgltf.md`

RWGltf_CafWriter (class) [29 members] — glTF writer context from XCAF document
  RWGltf_CafWriter.__init__ (constructor) — __init__(self
  RWGltf_CafWriter.SetCoordinateSystemConverter (method) — SetCoordinateSystemConverter(self
  RWGltf_CafWriter.IsBinary (method) — IsBinary(self
  RWGltf_CafWriter.TransformationFormat (method) — TransformationFormat(self
  RWGltf_CafWriter.SetTransformationFormat (method) — SetTransformationFormat(self
  RWGltf_CafWriter.NodeNameFormat (method) — NodeNameFormat(self
  RWGltf_CafWriter.SetNodeNameFormat (method) — SetNodeNameFormat(self
  RWGltf_CafWriter.MeshNameFormat (method) — MeshNameFormat(self
  RWGltf_CafWriter.SetMeshNameFormat (method) — SetMeshNameFormat(self
  RWGltf_CafWriter.IsForcedUVExport (method) — IsForcedUVExport(self
  RWGltf_CafWriter.SetForcedUVExport (method) — SetForcedUVExport(self
  RWGltf_CafWriter.SetDefaultStyle (method) — SetDefaultStyle(self
  RWGltf_CafWriter.ToEmbedTexturesInGlb (method) — ToEmbedTexturesInGlb(self
  RWGltf_CafWriter.SetToEmbedTexturesInGlb (method) — SetToEmbedTexturesInGlb(self
  RWGltf_CafWriter.ToMergeFaces (method) — ToMergeFaces(self
  RWGltf_CafWriter.SetMergeFaces (method) — SetMergeFaces(self
  RWGltf_CafWriter.ToSplitIndices16 (method) — ToSplitIndices16(self
  RWGltf_CafWriter.SetSplitIndices16 (method) — SetSplitIndices16(self
  RWGltf_CafWriter.ToParallel (method) — ToParallel(self
  RWGltf_CafWriter.SetParallel (method) — SetParallel(self
  RWGltf_CafWriter.SetCompressionParameters (method) — SetCompressionParameters(self
  RWGltf_CafWriter.Perform (method) — Perform(*args, **kwargs)
  RWGltf_CafWriter.get_type_name_s (method) — get_type_name_s() -> str
  RWGltf_CafWriter.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  RWGltf_CafWriter.DynamicType (method) — DynamicType(self
  RWGltf_CafWriter.CoordinateSystemConverter (method) — CoordinateSystemConverter(self
  RWGltf_CafWriter.ChangeCoordinateSystemConverter (method) — ChangeCoordinateSystemConverter(self
  RWGltf_CafWriter.DefaultStyle (method) — DefaultStyle(self
  RWGltf_CafWriter.CompressionParameters (method) — CompressionParameters(self

## RWStl — `api-rwstl.md`

RWStl (class) [6 members] — This class provides methods to read and write triangulation from…
  RWStl.__init__ (constructor) — __init__(self
  RWStl.WriteBinary_s (method) — WriteBinary_s(theMesh
  RWStl.WriteAscii_s (method) — WriteAscii_s(theMesh
  RWStl.ReadFile_s (method) — ReadFile_s(*args, **kwargs)
  RWStl.ReadBinary_s (method) — ReadBinary_s(thePath
  RWStl.ReadAscii_s (method) — ReadAscii_s(thePath

## STEPCAFControl — `api-stepcafcontrol.md`

STEPCAFControl_Controller (class) [5 members] — Extends Controller from STEPControl in order to provide ActorWrite adapted…
  STEPCAFControl_Controller.__init__ (constructor) — __init__(self
  STEPCAFControl_Controller.Init_s (method) — Init_s() -> bool
  STEPCAFControl_Controller.get_type_name_s (method) — get_type_name_s() -> str
  STEPCAFControl_Controller.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  STEPCAFControl_Controller.DynamicType (method) — DynamicType(self
STEPCAFControl_Reader (class) [38 members] — Provides a tool to read STEP file and put it…
  STEPCAFControl_Reader.__init__ (constructor) — __init__(*args, **kwargs)
  STEPCAFControl_Reader.Init (method) — Init(self
  STEPCAFControl_Reader.ReadFile (method) — ReadFile(*args, **kwargs)
  STEPCAFControl_Reader.ReadStream (method) — ReadStream(self
  STEPCAFControl_Reader.NbRootsForTransfer (method) — NbRootsForTransfer(self
  STEPCAFControl_Reader.TransferOneRoot (method) — TransferOneRoot(self
  STEPCAFControl_Reader.Transfer (method) — Transfer(self
  STEPCAFControl_Reader.Perform (method) — Perform(*args, **kwargs)
  STEPCAFControl_Reader.ExternFile (method) — ExternFile(self
  STEPCAFControl_Reader.SetColorMode (method) — SetColorMode(self
  STEPCAFControl_Reader.GetColorMode (method) — GetColorMode(self
  STEPCAFControl_Reader.SetNameMode (method) — SetNameMode(self
  STEPCAFControl_Reader.GetNameMode (method) — GetNameMode(self
  STEPCAFControl_Reader.SetLayerMode (method) — SetLayerMode(self
  STEPCAFControl_Reader.GetLayerMode (method) — GetLayerMode(self
  STEPCAFControl_Reader.SetPropsMode (method) — SetPropsMode(self
  STEPCAFControl_Reader.GetPropsMode (method) — GetPropsMode(self
  STEPCAFControl_Reader.SetMetaMode (method) — SetMetaMode(self
  STEPCAFControl_Reader.GetMetaMode (method) — GetMetaMode(self
  STEPCAFControl_Reader.SetProductMetaMode (method) — SetProductMetaMode(self
  STEPCAFControl_Reader.GetProductMetaMode (method) — GetProductMetaMode(self
  STEPCAFControl_Reader.SetSHUOMode (method) — SetSHUOMode(self
  STEPCAFControl_Reader.GetSHUOMode (method) — GetSHUOMode(self
  STEPCAFControl_Reader.SetGDTMode (method) — SetGDTMode(self
  STEPCAFControl_Reader.GetGDTMode (method) — GetGDTMode(self
  STEPCAFControl_Reader.SetMatMode (method) — SetMatMode(self
  STEPCAFControl_Reader.GetMatMode (method) — GetMatMode(self
  STEPCAFControl_Reader.SetViewMode (method) — SetViewMode(self
  STEPCAFControl_Reader.GetViewMode (method) — GetViewMode(self
  STEPCAFControl_Reader.SetShapeFixParameters (method) — SetShapeFixParameters(*args, **kwargs)
  STEPCAFControl_Reader.SetShapeProcessFlags (method) — SetShapeProcessFlags(self
  STEPCAFControl_Reader.FindInstance_s (method) — FindInstance_s(NAUO
  STEPCAFControl_Reader.ExternFiles (method) — ExternFiles(self
  STEPCAFControl_Reader.ChangeReader (method) — ChangeReader(self
  STEPCAFControl_Reader.Reader (method) — Reader(self
  STEPCAFControl_Reader.GetShapeLabelMap (method) — GetShapeLabelMap(self
  STEPCAFControl_Reader.GetShapeFixParameters (method) — GetShapeFixParameters(self
  STEPCAFControl_Reader.GetShapeProcessFlags (method) — GetShapeProcessFlags(self
STEPCAFControl_Writer (class) [28 members] — Provides a tool to write DECAF document to the STEP…
  STEPCAFControl_Writer.__init__ (constructor) — __init__(*args, **kwargs)
  STEPCAFControl_Writer.Init (method) — Init(self
  STEPCAFControl_Writer.Write (method) — Write(self
  STEPCAFControl_Writer.WriteStream (method) — WriteStream(self
  STEPCAFControl_Writer.Transfer (method) — Transfer(*args, **kwargs)
  STEPCAFControl_Writer.Perform (method) — Perform(*args, **kwargs)
  STEPCAFControl_Writer.ExternFile (method) — ExternFile(*args, **kwargs)
  STEPCAFControl_Writer.SetColorMode (method) — SetColorMode(self
  STEPCAFControl_Writer.GetColorMode (method) — GetColorMode(self
  STEPCAFControl_Writer.SetNameMode (method) — SetNameMode(self
  STEPCAFControl_Writer.GetNameMode (method) — GetNameMode(self
  STEPCAFControl_Writer.SetLayerMode (method) — SetLayerMode(self
  STEPCAFControl_Writer.GetLayerMode (method) — GetLayerMode(self
  STEPCAFControl_Writer.SetPropsMode (method) — SetPropsMode(self
  STEPCAFControl_Writer.GetPropsMode (method) — GetPropsMode(self
  STEPCAFControl_Writer.SetSHUOMode (method) — SetSHUOMode(self
  STEPCAFControl_Writer.GetSHUOMode (method) — GetSHUOMode(self
  STEPCAFControl_Writer.SetDimTolMode (method) — SetDimTolMode(self
  STEPCAFControl_Writer.GetDimTolMode (method) — GetDimTolMode(self
  STEPCAFControl_Writer.SetMaterialMode (method) — SetMaterialMode(self
  STEPCAFControl_Writer.GetMaterialMode (method) — GetMaterialMode(self
  STEPCAFControl_Writer.SetShapeFixParameters (method) — SetShapeFixParameters(*args, **kwargs)
  STEPCAFControl_Writer.SetShapeProcessFlags (method) — SetShapeProcessFlags(self
  STEPCAFControl_Writer.ExternFiles (method) — ExternFiles(self
  STEPCAFControl_Writer.ChangeWriter (method) — ChangeWriter(self
  STEPCAFControl_Writer.Writer (method) — Writer(self
  STEPCAFControl_Writer.GetShapeFixParameters (method) — GetShapeFixParameters(self
  STEPCAFControl_Writer.GetShapeProcessFlags (method) — GetShapeProcessFlags(self

## STEPControl — `api-stepcontrol.md`

STEPControl_Controller (class) [9 members] — defines basic controller for STEP processordefines basic controller for STEP…
  STEPControl_Controller.__init__ (constructor) — __init__(self
  STEPControl_Controller.NewModel (method) — NewModel(self
  STEPControl_Controller.ActorRead (method) — ActorRead(self
  STEPControl_Controller.TransferWriteShape (method) — TransferWriteShape(self
  STEPControl_Controller.Customise (method) — Customise(self
  STEPControl_Controller.Init_s (method) — Init_s() -> bool
  STEPControl_Controller.get_type_name_s (method) — get_type_name_s() -> str
  STEPControl_Controller.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  STEPControl_Controller.DynamicType (method) — DynamicType(self
STEPControl_StepModelType (class) [3 members] — Gives you the choice of translation mode for an Open…
  STEPControl_StepModelType.__init__ (constructor) — __init__(self
  STEPControl_StepModelType.name (property) — name(self
  STEPControl_StepModelType.value (property)

## Standard — `api-standard.md`

Standard_ConstructionError (class) — Common base class for all non-exit exceptions
Standard_Failure (class) — Common base class for all non-exit exceptions

## StdFail — `api-stdfail.md`

StdFail_NotDone (class) — Common base class for all non-exit exceptions

## StlAPI — `api-stlapi.md`

StlAPI_Writer (class) [3 members] — This class creates and writes STL files from Open CASCADE…
  StlAPI_Writer.__init__ (constructor) — __init__(self
  StlAPI_Writer.Write (method) — Write(self
  StlAPI_Writer.ASCIIMode (property) — Returns the address to the flag defining the mode for…

## TColStd — `api-tcolstd.md`

TColStd_IndexedDataMapOfStringString (class) [21 members] — Purpose
  TColStd_IndexedDataMapOfStringString.__init__ (constructor) — __init__(*args, **kwargs)
  TColStd_IndexedDataMapOfStringString.Exchange (method) — Exchange(self
  TColStd_IndexedDataMapOfStringString.Assign (method) — Assign(self
  TColStd_IndexedDataMapOfStringString.ReSize (method) — ReSize(self
  TColStd_IndexedDataMapOfStringString.Add (method) — Add(self
  TColStd_IndexedDataMapOfStringString.Contains (method) — Contains(self
  TColStd_IndexedDataMapOfStringString.Substitute (method) — Substitute(self
  TColStd_IndexedDataMapOfStringString.Swap (method) — Swap(self
  TColStd_IndexedDataMapOfStringString.RemoveLast (method) — RemoveLast(self
  TColStd_IndexedDataMapOfStringString.RemoveFromIndex (method) — RemoveFromIndex(self
  TColStd_IndexedDataMapOfStringString.RemoveKey (method) — RemoveKey(self
  TColStd_IndexedDataMapOfStringString.FindKey (method) — FindKey(self
  TColStd_IndexedDataMapOfStringString.FindFromIndex (method) — FindFromIndex(self
  TColStd_IndexedDataMapOfStringString.ChangeFromIndex (method) — ChangeFromIndex(self
  TColStd_IndexedDataMapOfStringString.FindIndex (method) — FindIndex(self
  TColStd_IndexedDataMapOfStringString.FindFromKey (method) — FindFromKey(*args, **kwargs)
  TColStd_IndexedDataMapOfStringString.ChangeFromKey (method) — ChangeFromKey(self
  TColStd_IndexedDataMapOfStringString.Seek (method) — Seek(self
  TColStd_IndexedDataMapOfStringString.ChangeSeek (method) — ChangeSeek(self
  TColStd_IndexedDataMapOfStringString.Clear (method) — Clear(*args, **kwargs)
  TColStd_IndexedDataMapOfStringString.Size (method) — Size(self

## TCollection — `api-tcollection.md`

TCollection_AsciiString (class) [52 members] — Class defines a variable-length sequence of 8-bit characters
  TCollection_AsciiString.__init__ (constructor) — __init__(*args, **kwargs)
  TCollection_AsciiString.AssignCat (method) — AssignCat(*args, **kwargs)
  TCollection_AsciiString.Capitalize (method) — Capitalize(self
  TCollection_AsciiString.Cat (method) — Cat(*args, **kwargs)
  TCollection_AsciiString.Center (method) — Center(self
  TCollection_AsciiString.ChangeAll (method) — ChangeAll(self
  TCollection_AsciiString.Clear (method) — Clear(self
  TCollection_AsciiString.Copy (method) — Copy(*args, **kwargs)
  TCollection_AsciiString.Swap (method) — Swap(self
  TCollection_AsciiString.FirstLocationInSet (method) — FirstLocationInSet(self
  TCollection_AsciiString.FirstLocationNotInSet (method) — FirstLocationNotInSet(self
  TCollection_AsciiString.Insert (method) — Insert(*args, **kwargs)
  TCollection_AsciiString.InsertAfter (method) — InsertAfter(self
  TCollection_AsciiString.InsertBefore (method) — InsertBefore(self
  TCollection_AsciiString.IsEmpty (method) — IsEmpty(self
  TCollection_AsciiString.IsEqual (method) — IsEqual(*args, **kwargs)
  TCollection_AsciiString.IsDifferent (method) — IsDifferent(*args, **kwargs)
  TCollection_AsciiString.IsLess (method) — IsLess(*args, **kwargs)
  TCollection_AsciiString.IsGreater (method) — IsGreater(*args, **kwargs)
  TCollection_AsciiString.StartsWith (method) — StartsWith(self
  TCollection_AsciiString.EndsWith (method) — EndsWith(self
  TCollection_AsciiString.IntegerValue (method) — IntegerValue(self
  TCollection_AsciiString.IsIntegerValue (method) — IsIntegerValue(self
  TCollection_AsciiString.IsRealValue (method) — IsRealValue(self
  TCollection_AsciiString.IsAscii (method) — IsAscii(self
  TCollection_AsciiString.LeftAdjust (method) — LeftAdjust(self
  TCollection_AsciiString.LeftJustify (method) — LeftJustify(self
  TCollection_AsciiString.Length (method) — Length(*args, **kwargs)
  TCollection_AsciiString.Location (method) — Location(*args, **kwargs)
  TCollection_AsciiString.LowerCase (method) — LowerCase(self
  TCollection_AsciiString.Prepend (method) — Prepend(self
  TCollection_AsciiString.Print (method) — Print(self
  TCollection_AsciiString.Read (method) — Read(self
  TCollection_AsciiString.RealValue (method) — RealValue(self
  TCollection_AsciiString.RemoveAll (method) — RemoveAll(*args, **kwargs)
  TCollection_AsciiString.Remove (method) — Remove(self
  TCollection_AsciiString.RightAdjust (method) — RightAdjust(self
  TCollection_AsciiString.RightJustify (method) — RightJustify(self
  TCollection_AsciiString.Search (method) — Search(*args, **kwargs)
  TCollection_AsciiString.SearchFromEnd (method) — SearchFromEnd(*args, **kwargs)
  TCollection_AsciiString.SetValue (method) — SetValue(*args, **kwargs)
  TCollection_AsciiString.Split (method) — Split(self
  TCollection_AsciiString.SubString (method) — SubString(*args, **kwargs)
  TCollection_AsciiString.ToCString (method) — ToCString(*args, **kwargs)
  TCollection_AsciiString.Token (method) — Token(self
  TCollection_AsciiString.Trunc (method) — Trunc(self
  TCollection_AsciiString.UpperCase (method) — UpperCase(self
  TCollection_AsciiString.UsefullLength (method) — UsefullLength(self
  TCollection_AsciiString.Value (method) — Value(self
  TCollection_AsciiString.HashCode (method) — HashCode(*args, **kwargs)
  TCollection_AsciiString.IsEqual_s (method) — IsEqual_s(*args, **kwargs)
  TCollection_AsciiString.IsSameString_s (method) — IsSameString_s(theString1
TCollection_ExtendedString (class) [31 members] — A variable-length sequence of "extended" (UNICODE) characters (16-bit character type)
  TCollection_ExtendedString.__init__ (constructor) — __init__(*args, **kwargs)
  TCollection_ExtendedString.AssignCat (method) — AssignCat(*args, **kwargs)
  TCollection_ExtendedString.Cat (method) — Cat(self
  TCollection_ExtendedString.ChangeAll (method) — ChangeAll(self
  TCollection_ExtendedString.Clear (method) — Clear(self
  TCollection_ExtendedString.Copy (method) — Copy(self
  TCollection_ExtendedString.Swap (method) — Swap(self
  TCollection_ExtendedString.Insert (method) — Insert(*args, **kwargs)
  TCollection_ExtendedString.IsEmpty (method) — IsEmpty(self
  TCollection_ExtendedString.IsEqual (method) — IsEqual(*args, **kwargs)
  TCollection_ExtendedString.IsDifferent (method) — IsDifferent(*args, **kwargs)
  TCollection_ExtendedString.IsLess (method) — IsLess(*args, **kwargs)
  TCollection_ExtendedString.IsGreater (method) — IsGreater(*args, **kwargs)
  TCollection_ExtendedString.StartsWith (method) — StartsWith(self
  TCollection_ExtendedString.EndsWith (method) — EndsWith(self
  TCollection_ExtendedString.IsAscii (method) — IsAscii(self
  TCollection_ExtendedString.Length (method) — Length(self
  TCollection_ExtendedString.Print (method) — Print(self
  TCollection_ExtendedString.RemoveAll (method) — RemoveAll(self
  TCollection_ExtendedString.Remove (method) — Remove(self
  TCollection_ExtendedString.Search (method) — Search(self
  TCollection_ExtendedString.SearchFromEnd (method) — SearchFromEnd(self
  TCollection_ExtendedString.SetValue (method) — SetValue(*args, **kwargs)
  TCollection_ExtendedString.Split (method) — Split(self
  TCollection_ExtendedString.Token (method) — Token(self
  TCollection_ExtendedString.ToExtString (method) — ToExtString(self
  TCollection_ExtendedString.Trunc (method) — Trunc(self
  TCollection_ExtendedString.Value (method) — Value(self
  TCollection_ExtendedString.HashCode (method) — HashCode(self
  TCollection_ExtendedString.LengthOfCString (method) — LengthOfCString(self
  TCollection_ExtendedString.IsEqual_s (method) — IsEqual_s(theString1

## TCollection (2) — `api-tcollection-2.md`

TCollection_HAsciiString (class) [49 members] — A variable-length sequence of ASCII characters (normal 8-bit character type)
  TCollection_HAsciiString.__init__ (constructor) — __init__(*args, **kwargs)
  TCollection_HAsciiString.AssignCat (method) — AssignCat(*args, **kwargs)
  TCollection_HAsciiString.Capitalize (method) — Capitalize(self
  TCollection_HAsciiString.Cat (method) — Cat(*args, **kwargs)
  TCollection_HAsciiString.Center (method) — Center(self
  TCollection_HAsciiString.ChangeAll (method) — ChangeAll(self
  TCollection_HAsciiString.Clear (method) — Clear(self
  TCollection_HAsciiString.FirstLocationInSet (method) — FirstLocationInSet(self
  TCollection_HAsciiString.FirstLocationNotInSet (method) — FirstLocationNotInSet(self
  TCollection_HAsciiString.Insert (method) — Insert(*args, **kwargs)
  TCollection_HAsciiString.InsertAfter (method) — InsertAfter(self
  TCollection_HAsciiString.InsertBefore (method) — InsertBefore(self
  TCollection_HAsciiString.IsEmpty (method) — IsEmpty(self
  TCollection_HAsciiString.IsLess (method) — IsLess(self
  TCollection_HAsciiString.IsGreater (method) — IsGreater(self
  TCollection_HAsciiString.IntegerValue (method) — IntegerValue(self
  TCollection_HAsciiString.IsIntegerValue (method) — IsIntegerValue(self
  TCollection_HAsciiString.IsRealValue (method) — IsRealValue(self
  TCollection_HAsciiString.IsAscii (method) — IsAscii(self
  TCollection_HAsciiString.IsDifferent (method) — IsDifferent(self
  TCollection_HAsciiString.IsSameString (method) — IsSameString(*args, **kwargs)
  TCollection_HAsciiString.LeftAdjust (method) — LeftAdjust(self
  TCollection_HAsciiString.LeftJustify (method) — LeftJustify(self
  TCollection_HAsciiString.Length (method) — Length(*args, **kwargs)
  TCollection_HAsciiString.Location (method) — Location(*args, **kwargs)
  TCollection_HAsciiString.LowerCase (method) — LowerCase(self
  TCollection_HAsciiString.Prepend (method) — Prepend(self
  TCollection_HAsciiString.Print (method) — Print(self
  TCollection_HAsciiString.RealValue (method) — RealValue(self
  TCollection_HAsciiString.RemoveAll (method) — RemoveAll(*args, **kwargs)
  TCollection_HAsciiString.Remove (method) — Remove(self
  TCollection_HAsciiString.RightAdjust (method) — RightAdjust(self
  TCollection_HAsciiString.RightJustify (method) — RightJustify(self
  TCollection_HAsciiString.Search (method) — Search(*args, **kwargs)
  TCollection_HAsciiString.SearchFromEnd (method) — SearchFromEnd(*args, **kwargs)
  TCollection_HAsciiString.SetValue (method) — SetValue(*args, **kwargs)
  TCollection_HAsciiString.Split (method) — Split(self
  TCollection_HAsciiString.SubString (method) — SubString(self
  TCollection_HAsciiString.ToCString (method) — ToCString(*args, **kwargs)
  TCollection_HAsciiString.Token (method) — Token(self
  TCollection_HAsciiString.Trunc (method) — Trunc(self
  TCollection_HAsciiString.UpperCase (method) — UpperCase(self
  TCollection_HAsciiString.UsefullLength (method) — UsefullLength(self
  TCollection_HAsciiString.Value (method) — Value(self
  TCollection_HAsciiString.IsSameState (method) — IsSameState(self
  TCollection_HAsciiString.get_type_name_s (method) — get_type_name_s() -> str
  TCollection_HAsciiString.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  TCollection_HAsciiString.String (method) — String(*args, **kwargs)
  TCollection_HAsciiString.DynamicType (method) — DynamicType(self

## TDF — `api-tdf.md`

TDF_Label (class) [34 members] — This class provides basic operations to define a label in…
  TDF_Label.__init__ (constructor) — __init__(self
  TDF_Label.Nullify (method) — Nullify(*args, **kwargs)
  TDF_Label.Data (method) — Data(*args, **kwargs)
  TDF_Label.Tag (method) — Tag(*args, **kwargs)
  TDF_Label.Father (method) — Father(*args, **kwargs)
  TDF_Label.IsNull (method) — IsNull(*args, **kwargs)
  TDF_Label.Imported (method) — Imported(self
  TDF_Label.IsImported (method) — IsImported(*args, **kwargs)
  TDF_Label.IsEqual (method) — IsEqual(*args, **kwargs)
  TDF_Label.IsDifferent (method) — IsDifferent(*args, **kwargs)
  TDF_Label.IsRoot (method) — IsRoot(*args, **kwargs)
  TDF_Label.IsAttribute (method) — IsAttribute(self
  TDF_Label.AddAttribute (method) — AddAttribute(self
  TDF_Label.ForgetAttribute (method) — ForgetAttribute(*args, **kwargs)
  TDF_Label.ForgetAllAttributes (method) — ForgetAllAttributes(self
  TDF_Label.ResumeAttribute (method) — ResumeAttribute(self
  TDF_Label.MayBeModified (method) — MayBeModified(*args, **kwargs)
  TDF_Label.AttributesModified (method) — AttributesModified(*args, **kwargs)
  TDF_Label.HasAttribute (method) — HasAttribute(self
  TDF_Label.NbAttributes (method) — NbAttributes(self
  TDF_Label.Depth (method) — Depth(self
  TDF_Label.IsDescendant (method) — IsDescendant(self
  TDF_Label.Root (method) — Root(self
  TDF_Label.HasChild (method) — HasChild(*args, **kwargs)
  TDF_Label.NbChildren (method) — NbChildren(self
  TDF_Label.FindChild (method) — FindChild(self
  TDF_Label.NewChild (method) — NewChild(*args, **kwargs)
  TDF_Label.Transaction (method) — Transaction(self
  TDF_Label.HasLowerNode (method) — HasLowerNode(self
  TDF_Label.HasGreaterNode (method) — HasGreaterNode(self
  TDF_Label.Dump (method) — Dump(self
  TDF_Label.ExtendedDump (method) — ExtendedDump(self
  TDF_Label.EntryDump (method) — EntryDump(self
  TDF_Label.FindAttribute (method) — FindAttribute(self
TDF_LabelSequence (class) [24 members] — Purpose
  TDF_LabelSequence.__init__ (constructor) — __init__(*args, **kwargs)
  TDF_LabelSequence.Size (method) — Size(self
  TDF_LabelSequence.Length (method) — Length(self
  TDF_LabelSequence.Lower (method) — Lower(self
  TDF_LabelSequence.Upper (method) — Upper(self
  TDF_LabelSequence.IsEmpty (method) — IsEmpty(self
  TDF_LabelSequence.Reverse (method) — Reverse(self
  TDF_LabelSequence.Exchange (method) — Exchange(self
  TDF_LabelSequence.Clear (method) — Clear(self
  TDF_LabelSequence.Assign (method) — Assign(self
  TDF_LabelSequence.Remove (method) — Remove(*args, **kwargs)
  TDF_LabelSequence.Append (method) — Append(*args, **kwargs)
  TDF_LabelSequence.Prepend (method) — Prepend(*args, **kwargs)
  TDF_LabelSequence.InsertBefore (method) — InsertBefore(*args, **kwargs)
  TDF_LabelSequence.InsertAfter (method) — InsertAfter(*args, **kwargs)
  TDF_LabelSequence.Split (method) — Split(self
  TDF_LabelSequence.First (method) — First(self
  TDF_LabelSequence.ChangeFirst (method) — ChangeFirst(self
  TDF_LabelSequence.Last (method) — Last(self
  TDF_LabelSequence.ChangeLast (method) — ChangeLast(self
  TDF_LabelSequence.Value (method) — Value(self
  TDF_LabelSequence.ChangeValue (method) — ChangeValue(self
  TDF_LabelSequence.SetValue (method) — SetValue(self
  TDF_LabelSequence.delNode_s (method) — delNode_s(theNode

## TDataStd — `api-tdatastd.md`

TDataStd_Name (class) [10 members] — Used to define a name attribute containing a string which…
  TDataStd_Name.__init__ (constructor) — __init__(self
  TDataStd_Name.Set (method) — Set(self
  TDataStd_Name.SetID (method) — SetID(*args, **kwargs)
  TDataStd_Name.Dump (method) — Dump(self
  TDataStd_Name.NewEmpty (method) — NewEmpty(self
  TDataStd_Name.GetID_s (method) — GetID_s() -> OCP.OCP.Standard.Standard_GUID
  TDataStd_Name.Set_s (method) — Set_s(*args, **kwargs)
  TDataStd_Name.get_type_name_s (method) — get_type_name_s() -> str
  TDataStd_Name.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  TDataStd_Name.DynamicType (method) — DynamicType(self

## TDocStd — `api-tdocstd.md`

TDocStd_Document (class) [54 members] — The contents of a TDocStd_Application, a document is a container…
  TDocStd_Document.__init__ (constructor) — __init__(self
  TDocStd_Document.IsSaved (method) — IsSaved(self
  TDocStd_Document.IsChanged (method) — IsChanged(*args, **kwargs)
  TDocStd_Document.SetSaved (method) — SetSaved(*args, **kwargs)
  TDocStd_Document.SetSavedTime (method) — SetSavedTime(*args, **kwargs)
  TDocStd_Document.GetSavedTime (method) — GetSavedTime(*args, **kwargs)
  TDocStd_Document.GetName (method) — GetName(self
  TDocStd_Document.GetPath (method) — GetPath(self
  TDocStd_Document.SetData (method) — SetData(self
  TDocStd_Document.GetData (method) — GetData(self
  TDocStd_Document.Main (method) — Main(self
  TDocStd_Document.IsEmpty (method) — IsEmpty(self
  TDocStd_Document.IsValid (method) — IsValid(self
  TDocStd_Document.SetModified (method) — SetModified(self
  TDocStd_Document.PurgeModified (method) — PurgeModified(self
  TDocStd_Document.NewCommand (method) — NewCommand(self
  TDocStd_Document.HasOpenCommand (method) — HasOpenCommand(self
  TDocStd_Document.OpenCommand (method) — OpenCommand(self
  TDocStd_Document.CommitCommand (method) — CommitCommand(self
  TDocStd_Document.AbortCommand (method) — AbortCommand(self
  TDocStd_Document.GetUndoLimit (method) — GetUndoLimit(self
  TDocStd_Document.SetUndoLimit (method) — SetUndoLimit(self
  TDocStd_Document.ClearUndos (method) — ClearUndos(self
  TDocStd_Document.ClearRedos (method) — ClearRedos(self
  TDocStd_Document.GetAvailableUndos (method) — GetAvailableUndos(self
  TDocStd_Document.Undo (method) — Undo(self
  TDocStd_Document.GetAvailableRedos (method) — GetAvailableRedos(self
  TDocStd_Document.Redo (method) — Redo(self
  TDocStd_Document.RemoveFirstUndo (method) — RemoveFirstUndo(self
  TDocStd_Document.InitDeltaCompaction (method) — InitDeltaCompaction(self
  TDocStd_Document.PerformDeltaCompaction (method) — PerformDeltaCompaction(self
  TDocStd_Document.UpdateReferences (method) — UpdateReferences(self
  TDocStd_Document.Recompute (method) — Recompute(self
  TDocStd_Document.Update (method) — Update(self
  TDocStd_Document.StorageFormat (method) — StorageFormat(self
  TDocStd_Document.SetEmptyLabelsSavingMode (method) — SetEmptyLabelsSavingMode(*args, **kwargs)
  TDocStd_Document.EmptyLabelsSavingMode (method) — EmptyLabelsSavingMode(*args, **kwargs)
  TDocStd_Document.ChangeStorageFormat (method) — ChangeStorageFormat(self
  TDocStd_Document.SetNestedTransactionMode (method) — SetNestedTransactionMode(*args, **kwargs)
  TDocStd_Document.IsNestedTransactionMode (method) — IsNestedTransactionMode(*args, **kwargs)
  TDocStd_Document.SetModificationMode (method) — SetModificationMode(*args, **kwargs)
  TDocStd_Document.ModificationMode (method) — ModificationMode(*args, **kwargs)
  TDocStd_Document.BeforeClose (method) — BeforeClose(self
  TDocStd_Document.StorageFormatVersion (method) — StorageFormatVersion(self
  TDocStd_Document.ChangeStorageFormatVersion (method) — ChangeStorageFormatVersion(self
  TDocStd_Document.DumpJson (method) — DumpJson(self
  TDocStd_Document.Get_s (method) — Get_s(L
  TDocStd_Document.CurrentStorageFormatVersion_s (method) — CurrentStorageFormatVersion_s() -> OCP.OCP.TDocStd.TDocStd_FormatVersion
  TDocStd_Document.get_type_name_s (method) — get_type_name_s() -> str
  TDocStd_Document.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  TDocStd_Document.GetModified (method) — GetModified(self
  TDocStd_Document.GetUndos (method) — GetUndos(self
  TDocStd_Document.GetRedos (method) — GetRedos(self
  TDocStd_Document.DynamicType (method) — DynamicType(self

## TopAbs — `api-topabs.md`

TopAbs_Orientation (class) [3 members] — Identifies the orientation of a topological shape
  TopAbs_Orientation.__init__ (constructor) — __init__(self
  TopAbs_Orientation.name (property) — name(self
  TopAbs_Orientation.value (property)
TopAbs_ShapeEnum (class) [3 members] — Identifies various topological shapes
  TopAbs_ShapeEnum.__init__ (constructor) — __init__(self
  TopAbs_ShapeEnum.name (property) — name(self
  TopAbs_ShapeEnum.value (property)

## TopExp — `api-topexp.md`

TopExp_Explorer (class) [10 members] — An Explorer is a Tool to visit a Topological Data…
  TopExp_Explorer.__init__ (constructor) — __init__(*args, **kwargs)
  TopExp_Explorer.Init (method) — Init(self
  TopExp_Explorer.More (method) — More(self
  TopExp_Explorer.Next (method) — Next(self
  TopExp_Explorer.ReInit (method) — ReInit(self
  TopExp_Explorer.Depth (method) — Depth(self
  TopExp_Explorer.Clear (method) — Clear(self
  TopExp_Explorer.Value (method) — Value(self
  TopExp_Explorer.Current (method) — Current(self
  TopExp_Explorer.ExploredShape (method) — ExploredShape(self

## TopLoc — `api-toploc.md`

TopLoc_Location (class) [19 members] — A Location is a composite transition
  TopLoc_Location.__init__ (constructor) — __init__(*args, **kwargs)
  TopLoc_Location.IsIdentity (method) — IsIdentity(*args, **kwargs)
  TopLoc_Location.Identity (method) — Identity(*args, **kwargs)
  TopLoc_Location.FirstPower (method) — FirstPower(*args, **kwargs)
  TopLoc_Location.Inverted (method) — Inverted(self
  TopLoc_Location.Multiplied (method) — Multiplied(self
  TopLoc_Location.Divided (method) — Divided(self
  TopLoc_Location.Predivided (method) — Predivided(self
  TopLoc_Location.Powered (method) — Powered(self
  TopLoc_Location.HashCode (method) — HashCode(*args, **kwargs)
  TopLoc_Location.IsEqual (method) — IsEqual(self
  TopLoc_Location.IsDifferent (method) — IsDifferent(self
  TopLoc_Location.DumpJson (method) — DumpJson(self
  TopLoc_Location.ShallowDump (method) — ShallowDump(self
  TopLoc_Location.Clear (method) — Clear(self
  TopLoc_Location.ScalePrec_s (method) — ScalePrec_s() -> float
  TopLoc_Location.FirstDatum (method) — FirstDatum(*args, **kwargs)
  TopLoc_Location.NextLocation (method) — NextLocation(*args, **kwargs)
  TopLoc_Location.Transformation (method) — Transformation(self

## TopoDS — `api-topods.md`

TopoDS_Compound (class) [1 members] — Describes a compound which - references an underlying compound with…
  TopoDS_Compound.__init__ (constructor) — __init__(self
TopoDS_Edge (class) [1 members] — Describes an edge which - references an underlying edge with…
  TopoDS_Edge.__init__ (constructor) — __init__(self
TopoDS_Face (class) [1 members] — Describes a face which - references an underlying face with…
  TopoDS_Face.__init__ (constructor) — __init__(self
TopoDS_Shape (class) [33 members] — Describes a shape which - references an underlying shape with…
  TopoDS_Shape.__init__ (constructor) — __init__(self
  TopoDS_Shape.IsNull (method) — IsNull(self
  TopoDS_Shape.Nullify (method) — Nullify(self
  TopoDS_Shape.Location (method) — Location(*args, **kwargs)
  TopoDS_Shape.Located (method) — Located(self
  TopoDS_Shape.Orientation (method) — Orientation(*args, **kwargs)
  TopoDS_Shape.Oriented (method) — Oriented(self
  TopoDS_Shape.ShapeType (method) — ShapeType(self
  TopoDS_Shape.Free (method) — Free(*args, **kwargs)
  TopoDS_Shape.Locked (method) — Locked(*args, **kwargs)
  TopoDS_Shape.Modified (method) — Modified(*args, **kwargs)
  TopoDS_Shape.Checked (method) — Checked(*args, **kwargs)
  TopoDS_Shape.Orientable (method) — Orientable(*args, **kwargs)
  TopoDS_Shape.Closed (method) — Closed(*args, **kwargs)
  TopoDS_Shape.Infinite (method) — Infinite(*args, **kwargs)
  TopoDS_Shape.Convex (method) — Convex(*args, **kwargs)
  TopoDS_Shape.Move (method) — Move(self
  TopoDS_Shape.Moved (method) — Moved(self
  TopoDS_Shape.Reverse (method) — Reverse(self
  TopoDS_Shape.Reversed (method) — Reversed(self
  TopoDS_Shape.Complement (method) — Complement(self
  TopoDS_Shape.Complemented (method) — Complemented(self
  TopoDS_Shape.Compose (method) — Compose(self
  TopoDS_Shape.Composed (method) — Composed(self
  TopoDS_Shape.NbChildren (method) — NbChildren(self
  TopoDS_Shape.IsPartner (method) — IsPartner(self
  TopoDS_Shape.IsSame (method) — IsSame(self
  TopoDS_Shape.IsEqual (method) — IsEqual(self
  TopoDS_Shape.IsNotEqual (method) — IsNotEqual(self
  TopoDS_Shape.EmptyCopy (method) — EmptyCopy(self
  TopoDS_Shape.EmptyCopied (method) — EmptyCopied(self
  TopoDS_Shape.TShape (method) — TShape(*args, **kwargs)
  TopoDS_Shape.DumpJson (method) — DumpJson(self
TopoDS_Shell (class) [1 members] — Describes a shell which - references an underlying shell with…
  TopoDS_Shell.__init__ (constructor) — __init__(self
TopoDS_Solid (class) [1 members] — Describes a solid shape which - references an underlying solid…
  TopoDS_Solid.__init__ (constructor) — __init__(self
TopoDS_Vertex (class) [1 members] — Describes a vertex which - references an underlying vertex with…
  TopoDS_Vertex.__init__ (constructor) — __init__(self
TopoDS_Wire (class) [1 members] — Describes a wire which - references an underlying wire with…
  TopoDS_Wire.__init__ (constructor) — __init__(self

## uuid — `api-uuid.md`

UUID (class) [16 members] — Instances of the UUID class represent UUIDs as specified in…
  UUID.__init__ (constructor) — Create a UUID from either a string of 32 hexadecimal…
  UUID.bytes (property)
  UUID.bytes_le (property)
  UUID.fields (property)
  UUID.time_low (property)
  UUID.time_mid (property)
  UUID.time_hi_version (property)
  UUID.clock_seq_hi_variant (property)
  UUID.clock_seq_low (property)
  UUID.time (property)
  UUID.clock_seq (property)
  UUID.node (property)
  UUID.hex (property)
  UUID.urn (property)
  UUID.variant (property)
  UUID.version (property)

## zero_d — `api-zero-d.md`

Vertex (class) [10 members] — A Vertex in build123d represents a zero-dimensional point in the…
  Vertex.__init__ (constructor)
  Vertex.volume (property) — volume - the volume of this Vertex, which is always…
  Vertex.cast (method) — Returns the right type of wrapper, given a OCCT object
  Vertex.extrude (method) — extrude - invalid operation for Vertex
  Vertex.center (method) — The center of a vertex is itself!
  Vertex.split (method) — split - not implemented
  Vertex.to_tuple (method) — Return vertex as three tuple of floats
  Vertex.transform_shape (method) — Apply affine transform without changing type
  Vertex.vertex (method) — Return the Vertex
  Vertex.vertices (method) — vertices - all the vertices in this Shape
topo_explore_common_vertex (function) — Given two edges, find the common vertex

## XCAFApp — `api-xcafapp.md`

XCAFApp_Application (class) [8 members] — Implements an Application for the DECAF documentsImplements an Application for…
  XCAFApp_Application.__init__ (constructor) — Initialize self
  XCAFApp_Application.ResourcesName (method) — ResourcesName(self
  XCAFApp_Application.InitDocument (method) — InitDocument(self
  XCAFApp_Application.DumpJson (method) — DumpJson(self
  XCAFApp_Application.GetApplication_s (method) — GetApplication_s() -> OCP.OCP.XCAFApp.XCAFApp_Application
  XCAFApp_Application.get_type_name_s (method) — get_type_name_s() -> str
  XCAFApp_Application.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  XCAFApp_Application.DynamicType (method) — DynamicType(self

## XCAFDoc — `api-xcafdoc.md`

XCAFDoc_ColorTool (class) [31 members] — Provides tools to store and retrieve attributes (colors) of TopoDS_Shape…
  XCAFDoc_ColorTool.__init__ (constructor) — __init__(self
  XCAFDoc_ColorTool.BaseLabel (method) — BaseLabel(self
  XCAFDoc_ColorTool.IsColor (method) — IsColor(self
  XCAFDoc_ColorTool.FindColor (method) — FindColor(*args, **kwargs)
  XCAFDoc_ColorTool.AddColor (method) — AddColor(*args, **kwargs)
  XCAFDoc_ColorTool.RemoveColor (method) — RemoveColor(self
  XCAFDoc_ColorTool.GetColors (method) — GetColors(self
  XCAFDoc_ColorTool.SetColor (method) — SetColor(*args, **kwargs)
  XCAFDoc_ColorTool.UnSetColor (method) — UnSetColor(*args, **kwargs)
  XCAFDoc_ColorTool.IsSet (method) — IsSet(*args, **kwargs)
  XCAFDoc_ColorTool.GetColor (method) — GetColor(*args, **kwargs)
  XCAFDoc_ColorTool.SetVisibility (method) — SetVisibility(self
  XCAFDoc_ColorTool.IsColorByLayer (method) — IsColorByLayer(self
  XCAFDoc_ColorTool.SetColorByLayer (method) — SetColorByLayer(self
  XCAFDoc_ColorTool.SetInstanceColor (method) — SetInstanceColor(*args, **kwargs)
  XCAFDoc_ColorTool.GetInstanceColor (method) — GetInstanceColor(*args, **kwargs)
  XCAFDoc_ColorTool.IsInstanceVisible (method) — IsInstanceVisible(self
  XCAFDoc_ColorTool.ReverseChainsOfTreeNodes (method) — ReverseChainsOfTreeNodes(self
  XCAFDoc_ColorTool.DumpJson (method) — DumpJson(self
  XCAFDoc_ColorTool.NewEmpty (method) — NewEmpty(self
  XCAFDoc_ColorTool.AutoNaming_s (method) — AutoNaming_s() -> bool
  XCAFDoc_ColorTool.SetAutoNaming_s (method) — SetAutoNaming_s(theIsAutoNaming
  XCAFDoc_ColorTool.Set_s (method) — Set_s(L
  XCAFDoc_ColorTool.GetID_s (method) — GetID_s() -> OCP.OCP.Standard.Standard_GUID
  XCAFDoc_ColorTool.GetColor_s (method) — GetColor_s(*args, **kwargs)
  XCAFDoc_ColorTool.IsVisible_s (method) — IsVisible_s(L
  XCAFDoc_ColorTool.get_type_name_s (method) — get_type_name_s() -> str
  XCAFDoc_ColorTool.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  XCAFDoc_ColorTool.ShapeTool (method) — ShapeTool(self
  XCAFDoc_ColorTool.ID (method) — ID(self
  XCAFDoc_ColorTool.DynamicType (method) — DynamicType(self
XCAFDoc_ColorType (class) [3 members] — Defines types of color assignments Color of shape is defined…
  XCAFDoc_ColorType.__init__ (constructor) — __init__(self
  XCAFDoc_ColorType.name (property) — name(self
  XCAFDoc_ColorType.value (property)
XCAFDoc_DocumentTool (class) [41 members] — Defines sections structure of an XDE document
  XCAFDoc_DocumentTool.__init__ (constructor) — __init__(self
  XCAFDoc_DocumentTool.Init (method) — Init(self
  XCAFDoc_DocumentTool.AfterRetrieval (method) — AfterRetrieval(self
  XCAFDoc_DocumentTool.NewEmpty (method) — NewEmpty(self
  XCAFDoc_DocumentTool.GetID_s (method) — GetID_s() -> OCP.OCP.Standard.Standard_GUID
  XCAFDoc_DocumentTool.Set_s (method) — Set_s(L
  XCAFDoc_DocumentTool.IsXCAFDocument_s (method) — IsXCAFDocument_s(Doc
  XCAFDoc_DocumentTool.DocLabel_s (method) — DocLabel_s(acces
  XCAFDoc_DocumentTool.ShapesLabel_s (method) — ShapesLabel_s(acces
  XCAFDoc_DocumentTool.ColorsLabel_s (method) — ColorsLabel_s(acces
  XCAFDoc_DocumentTool.LayersLabel_s (method) — LayersLabel_s(acces
  XCAFDoc_DocumentTool.DGTsLabel_s (method) — DGTsLabel_s(acces
  XCAFDoc_DocumentTool.MaterialsLabel_s (method) — MaterialsLabel_s(acces
  XCAFDoc_DocumentTool.ViewsLabel_s (method) — ViewsLabel_s(acces
  XCAFDoc_DocumentTool.ClippingPlanesLabel_s (method) — ClippingPlanesLabel_s(acces
  XCAFDoc_DocumentTool.NotesLabel_s (method) — NotesLabel_s(acces
  XCAFDoc_DocumentTool.VisMaterialLabel_s (method) — VisMaterialLabel_s(theLabel
  XCAFDoc_DocumentTool.ShapeTool_s (method) — ShapeTool_s(acces
  XCAFDoc_DocumentTool.CheckShapeTool_s (method) — CheckShapeTool_s(theAcces
  XCAFDoc_DocumentTool.ColorTool_s (method) — ColorTool_s(acces
  XCAFDoc_DocumentTool.CheckColorTool_s (method) — CheckColorTool_s(theAcces
  XCAFDoc_DocumentTool.VisMaterialTool_s (method) — VisMaterialTool_s(theLabel
  XCAFDoc_DocumentTool.CheckVisMaterialTool_s (method) — CheckVisMaterialTool_s(theAcces
  XCAFDoc_DocumentTool.LayerTool_s (method) — LayerTool_s(acces
  XCAFDoc_DocumentTool.CheckLayerTool_s (method) — CheckLayerTool_s(theAcces
  XCAFDoc_DocumentTool.DimTolTool_s (method) — DimTolTool_s(acces
  XCAFDoc_DocumentTool.CheckDimTolTool_s (method) — CheckDimTolTool_s(theAcces
  XCAFDoc_DocumentTool.MaterialTool_s (method) — MaterialTool_s(acces
  XCAFDoc_DocumentTool.CheckMaterialTool_s (method) — CheckMaterialTool_s(theAcces
  XCAFDoc_DocumentTool.ViewTool_s (method) — ViewTool_s(acces
  XCAFDoc_DocumentTool.CheckViewTool_s (method) — CheckViewTool_s(theAcces
  XCAFDoc_DocumentTool.ClippingPlaneTool_s (method) — ClippingPlaneTool_s(acces
  XCAFDoc_DocumentTool.CheckClippingPlaneTool_s (method) — CheckClippingPlaneTool_s(theAcces
  XCAFDoc_DocumentTool.NotesTool_s (method) — NotesTool_s(acces
  XCAFDoc_DocumentTool.CheckNotesTool_s (method) — CheckNotesTool_s(theAcces
  XCAFDoc_DocumentTool.GetLengthUnit_s (method) — GetLengthUnit_s(*args, **kwargs)
  XCAFDoc_DocumentTool.SetLengthUnit_s (method) — SetLengthUnit_s(*args, **kwargs)
  XCAFDoc_DocumentTool.get_type_name_s (method) — get_type_name_s() -> str
  XCAFDoc_DocumentTool.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  XCAFDoc_DocumentTool.ID (method) — ID(self
  XCAFDoc_DocumentTool.DynamicType (method) — DynamicType(self

## XCAFDoc (2) — `api-xcafdoc-2.md`

XCAFDoc_ShapeTool (class) [69 members] — A tool to store shapes in an XDE document in…
  XCAFDoc_ShapeTool.__init__ (constructor) — __init__(self
  XCAFDoc_ShapeTool.IsTopLevel (method) — IsTopLevel(self
  XCAFDoc_ShapeTool.IsSubShape (method) — IsSubShape(self
  XCAFDoc_ShapeTool.SearchUsingMap (method) — SearchUsingMap(self
  XCAFDoc_ShapeTool.Search (method) — Search(self
  XCAFDoc_ShapeTool.FindShape (method) — FindShape(*args, **kwargs)
  XCAFDoc_ShapeTool.GetOneShape (method) — GetOneShape(self
  XCAFDoc_ShapeTool.NewShape (method) — NewShape(self
  XCAFDoc_ShapeTool.SetShape (method) — SetShape(self
  XCAFDoc_ShapeTool.AddShape (method) — AddShape(self
  XCAFDoc_ShapeTool.RemoveShape (method) — RemoveShape(self
  XCAFDoc_ShapeTool.Init (method) — Init(self
  XCAFDoc_ShapeTool.ComputeShapes (method) — ComputeShapes(self
  XCAFDoc_ShapeTool.ComputeSimpleShapes (method) — ComputeSimpleShapes(self
  XCAFDoc_ShapeTool.GetShapes (method) — GetShapes(self
  XCAFDoc_ShapeTool.GetFreeShapes (method) — GetFreeShapes(self
  XCAFDoc_ShapeTool.AddComponent (method) — AddComponent(*args, **kwargs)
  XCAFDoc_ShapeTool.RemoveComponent (method) — RemoveComponent(self
  XCAFDoc_ShapeTool.UpdateAssemblies (method) — UpdateAssemblies(self
  XCAFDoc_ShapeTool.FindSubShape (method) — FindSubShape(self
  XCAFDoc_ShapeTool.AddSubShape (method) — AddSubShape(*args, **kwargs)
  XCAFDoc_ShapeTool.FindMainShapeUsingMap (method) — FindMainShapeUsingMap(self
  XCAFDoc_ShapeTool.FindMainShape (method) — FindMainShape(self
  XCAFDoc_ShapeTool.BaseLabel (method) — BaseLabel(self
  XCAFDoc_ShapeTool.Dump (method) — Dump(*args, **kwargs)
  XCAFDoc_ShapeTool.SetExternRefs (method) — SetExternRefs(*args, **kwargs)
  XCAFDoc_ShapeTool.SetSHUO (method) — SetSHUO(self
  XCAFDoc_ShapeTool.RemoveSHUO (method) — RemoveSHUO(self
  XCAFDoc_ShapeTool.FindComponent (method) — FindComponent(self
  XCAFDoc_ShapeTool.GetSHUOInstance (method) — GetSHUOInstance(self
  XCAFDoc_ShapeTool.SetInstanceSHUO (method) — SetInstanceSHUO(self
  XCAFDoc_ShapeTool.GetAllSHUOInstances (method) — GetAllSHUOInstances(self
  XCAFDoc_ShapeTool.SetLocation (method) — SetLocation(self
  XCAFDoc_ShapeTool.Expand (method) — Expand(self
  XCAFDoc_ShapeTool.GetNamedProperties (method) — GetNamedProperties(*args, **kwargs)
  XCAFDoc_ShapeTool.DumpJson (method) — DumpJson(self
  XCAFDoc_ShapeTool.NewEmpty (method) — NewEmpty(self
  XCAFDoc_ShapeTool.GetID_s (method) — GetID_s() -> OCP.OCP.Standard.Standard_GUID
  XCAFDoc_ShapeTool.Set_s (method) — Set_s(L
  XCAFDoc_ShapeTool.IsFree_s (method) — IsFree_s(L
  XCAFDoc_ShapeTool.IsShape_s (method) — IsShape_s(L
  XCAFDoc_ShapeTool.IsSimpleShape_s (method) — IsSimpleShape_s(L
  XCAFDoc_ShapeTool.IsReference_s (method) — IsReference_s(L
  XCAFDoc_ShapeTool.IsAssembly_s (method) — IsAssembly_s(L
  XCAFDoc_ShapeTool.IsComponent_s (method) — IsComponent_s(L
  XCAFDoc_ShapeTool.IsCompound_s (method) — IsCompound_s(L
  XCAFDoc_ShapeTool.IsSubShape_s (method) — IsSubShape_s(L
  XCAFDoc_ShapeTool.GetShape_s (method) — GetShape_s(*args, **kwargs)
  XCAFDoc_ShapeTool.GetOneShape_s (method) — GetOneShape_s(theLabels
  XCAFDoc_ShapeTool.SetAutoNaming_s (method) — SetAutoNaming_s(V
  XCAFDoc_ShapeTool.AutoNaming_s (method) — AutoNaming_s() -> bool
  XCAFDoc_ShapeTool.GetUsers_s (method) — GetUsers_s(L
  XCAFDoc_ShapeTool.GetLocation_s (method) — GetLocation_s(L
  XCAFDoc_ShapeTool.GetReferredShape_s (method) — GetReferredShape_s(L
  XCAFDoc_ShapeTool.NbComponents_s (method) — NbComponents_s(L
  XCAFDoc_ShapeTool.GetComponents_s (method) — GetComponents_s(L
  XCAFDoc_ShapeTool.GetSubShapes_s (method) — GetSubShapes_s(L
  XCAFDoc_ShapeTool.DumpShape_s (method) — DumpShape_s(theDumpLog
  XCAFDoc_ShapeTool.IsExternRef_s (method) — IsExternRef_s(L
  XCAFDoc_ShapeTool.GetExternRefs_s (method) — GetExternRefs_s(L
  XCAFDoc_ShapeTool.GetSHUO_s (method) — GetSHUO_s(SHUOLabel
  XCAFDoc_ShapeTool.GetAllComponentSHUO_s (method) — GetAllComponentSHUO_s(CompLabel
  XCAFDoc_ShapeTool.GetSHUOUpperUsage_s (method) — GetSHUOUpperUsage_s(NextUsageL
  XCAFDoc_ShapeTool.GetSHUONextUsage_s (method) — GetSHUONextUsage_s(UpperUsageL
  XCAFDoc_ShapeTool.FindSHUO_s (method) — FindSHUO_s(Labels
  XCAFDoc_ShapeTool.get_type_name_s (method) — get_type_name_s() -> str
  XCAFDoc_ShapeTool.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  XCAFDoc_ShapeTool.ID (method) — ID(self
  XCAFDoc_ShapeTool.DynamicType (method) — DynamicType(self

## XSControl — `api-xscontrol.md`

XSControl_WorkSession (class) [28 members] — This WorkSession completes the basic one, by adding
  XSControl_WorkSession.__init__ (constructor) — __init__(self
  XSControl_WorkSession.ClearData (method) — ClearData(self
  XSControl_WorkSession.SelectNorm (method) — SelectNorm(self
  XSControl_WorkSession.SetController (method) — SetController(self
  XSControl_WorkSession.SelectedNorm (method) — SelectedNorm(self
  XSControl_WorkSession.SetAllContext (method) — SetAllContext(self
  XSControl_WorkSession.ClearContext (method) — ClearContext(self
  XSControl_WorkSession.PrintTransferStatus (method) — PrintTransferStatus(self
  XSControl_WorkSession.InitTransferReader (method) — InitTransferReader(self
  XSControl_WorkSession.SetTransferReader (method) — SetTransferReader(self
  XSControl_WorkSession.MapReader (method) — MapReader(self
  XSControl_WorkSession.SetMapReader (method) — SetMapReader(self
  XSControl_WorkSession.Result (method) — Result(self
  XSControl_WorkSession.TransferReadOne (method) — TransferReadOne(self
  XSControl_WorkSession.TransferReadRoots (method) — TransferReadRoots(self
  XSControl_WorkSession.NewModel (method) — NewModel(self
  XSControl_WorkSession.SetMapWriter (method) — SetMapWriter(self
  XSControl_WorkSession.TransferWriteShape (method) — TransferWriteShape(self
  XSControl_WorkSession.TransferWriteCheckList (method) — TransferWriteCheckList(self
  XSControl_WorkSession.SetVars (method) — SetVars(self
  XSControl_WorkSession.get_type_name_s (method) — get_type_name_s() -> str
  XSControl_WorkSession.get_type_descriptor_s (method) — get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  XSControl_WorkSession.NormAdaptor (method) — NormAdaptor(self
  XSControl_WorkSession.Context (method) — Context(self
  XSControl_WorkSession.TransferReader (method) — TransferReader(self
  XSControl_WorkSession.TransferWriter (method) — TransferWriter(self
  XSControl_WorkSession.Vars (method) — Vars(self
  XSControl_WorkSession.DynamicType (method) — DynamicType(self

## operations_generic — `api-operations-generic.md`

add (function) — Generic Object
bounding_box (function) — Generic Operation
chamfer (function) — Generic Operation
fillet (function) — Generic Operation
mirror (function) — Generic Operation
offset (function) — Generic Operation
project (function) — Generic Operation
scale (function) — Generic Operation
split (function) — Generic Operation
sweep (function) — Generic Operation

## math — `api-math.md`

atan2 (function) — Return the arc tangent (measured in radians) of y/x
copysign (function) — Return a float with the magnitude (absolute value) of x…
cos (function) — Return the cosine of x (measured in radians)
degrees (function) — Convert angle x from radians to degrees
floor (function) — Return the floor of x as an Integral
gcd (function) — Greatest Common Divisor
log10 (function) — Return the base 10 logarithm of x
log2 (function) — Return the base 2 logarithm of x
prod (function) — Calculate the product of all the elements in the input…
radians (function) — Convert angle x from degrees to radians
sin (function) — Return the sine of x (measured in radians)
sqrt (function) — Return the square root of x
tan (function) — Return the tangent of x (measured in radians)

## copy — `api-copy.md`

copy (function) — Shallow copy operation on arbitrary Python objects

## dataclasses — `api-dataclasses.md`

dataclass (function) — Add dunder methods based on the fields defined in the…

## datetime — `api-datetime.md`

date (class) [14 members] — date(year, month, day) --> date object
  date.fromtimestamp (method) — Create a date from a POSIX timestamp
  date.fromordinal (method) — int -> date corresponding to a proleptic Gregorian ordinal
  date.fromisoformat (method) — str -> Construct a date from a string in ISO…
  date.fromisocalendar (method) — int, int, int -> Construct a date from the ISO…
  date.today (method) — Current date or datetime
  date.ctime (method) — Return ctime() style string
  date.strftime (method) — format -> strftime() style string
  date.timetuple (method) — Return time tuple, compatible with time.localtime()
  date.isocalendar (method) — Return a named tuple containing ISO year, week number, and…
  date.isoformat (method) — Return string in ISO 8601 format, YYYY-MM-DD
  date.isoweekday (method) — Return the day of the week represented by the date
  date.toordinal (method) — Return proleptic Gregorian ordinal
  date.weekday (method) — Return the day of the week represented by the date
  date.replace (method) — Return date with new specified fields
datetime (class) [20 members] — datetime(year, month, day[, hour[, minute[, second[, microsecond[,tzinfo]]]]])
  datetime.now (method) — Returns new datetime object representing current time local to tz
  datetime.utcnow (method) — Return a new datetime representing UTC day and time
  datetime.fromtimestamp (method) — timestamp[, tz] -> tz's local time from POSIX timestamp
  datetime.utcfromtimestamp (method) — Construct a naive UTC datetime from a POSIX timestamp
  datetime.strptime (method) — string, format -> new datetime parsed from a string (like…
  datetime.combine (method) — date, time -> datetime with same date and time fields
  datetime.fromisoformat (method) — string -> datetime from a string in most ISO 8601…
  datetime.date (method) — Return date object with same year, month and day
  datetime.time (method) — Return time object with same time but with tzinfo=None
  datetime.timetz (method) — Return time object with same time and tzinfo
  datetime.ctime (method) — Return ctime() style string
  datetime.timetuple (method) — Return time tuple, compatible with time.localtime()
  datetime.timestamp (method) — Return POSIX timestamp as float
  datetime.utctimetuple (method) — Return UTC time tuple, compatible with time.localtime()
  datetime.isoformat (method) — [sep] -> string in ISO 8601 format, YYYY-MM-DDT[HH[:MM[:SS[.mmm[uuu]]]]][+HH:MM]
  datetime.utcoffset (method) — Return self.tzinfo.utcoffset(self)
  datetime.tzname (method) — Return self.tzinfo.tzname(self)
  datetime.dst (method) — Return self.tzinfo.dst(self)
  datetime.replace (method) — Return datetime with new specified fields
  datetime.astimezone (method) — tz -> convert to local time in new timezone tz

## utils — `api-utils.md`

delta (function) — Compare the OCCT objects of each list and return the…
find_max_dimension (function) — Return the maximum dimension of one or more shapes
isclose_b (function) — Determine whether two floating point numbers are close in value
new_edges (function) — new_edges
polar (function) — Convert polar coordinates into cartesian coordinates
tuplify (function) — Create a size tuple

## warnings — `api-warnings.md`

deprecated (class) [1 members] — Indicate that a class, function or overload is deprecated
  deprecated.__init__ (constructor)

## brep_from_stl — `api-brep-from-stl.md`

detect_primitives (function) — Detect analytic primitives in a mesh and return faces, leftovers,…

## operations_part — `api-operations-part.md`

draft (function) — Part Operation
extrude (function) — Part Operation
loft (function) — Part Operation
make_brake_formed (function) — make_brake_formed
project_workplane (function) — Part Operation
revolve (function) — Part Operation
section (function) — Part Operation
thicken (function) — Part Operation

## exporters3d — `api-exporters3d.md`

export_brep (function) — Export this shape to a BREP file
export_gltf (function) — export_gltf
export_step (function) — export_step
export_stl (function) — Export STL
export_to_pcbway (function) — Export a shape to PCBWay for quoting

## operations_sketch — `api-operations-sketch.md`

full_round (function) — Sketch Operation
make_face (function) — Sketch Operation
make_hull (function) — Sketch Operation
trace (function) — Sketch Operation

## gp — `api-gp.md`

gp_Ax1 (class) [24 members] — Describes an axis in 3D space
  gp_Ax1.__init__ (constructor) — __init__(*args, **kwargs)
  gp_Ax1.SetDirection (method) — SetDirection(self
  gp_Ax1.SetLocation (method) — SetLocation(self
  gp_Ax1.IsCoaxial (method) — IsCoaxial(self
  gp_Ax1.IsNormal (method) — IsNormal(self
  gp_Ax1.IsOpposite (method) — IsOpposite(self
  gp_Ax1.IsParallel (method) — IsParallel(self
  gp_Ax1.Angle (method) — Angle(self
  gp_Ax1.Reverse (method) — Reverse(self
  gp_Ax1.Reversed (method) — Reversed(self
  gp_Ax1.Mirror (method) — Mirror(*args, **kwargs)
  gp_Ax1.Mirrored (method) — Mirrored(*args, **kwargs)
  gp_Ax1.Rotate (method) — Rotate(self
  gp_Ax1.Rotated (method) — Rotated(self
  gp_Ax1.Scale (method) — Scale(self
  gp_Ax1.Scaled (method) — Scaled(self
  gp_Ax1.Transform (method) — Transform(self
  gp_Ax1.Transformed (method) — Transformed(self
  gp_Ax1.Translate (method) — Translate(*args, **kwargs)
  gp_Ax1.Translated (method) — Translated(*args, **kwargs)
  gp_Ax1.DumpJson (method) — DumpJson(self
  gp_Ax1.InitFromJson (method) — InitFromJson(self
  gp_Ax1.Direction (method) — Direction(self
  gp_Ax1.Location (method) — Location(self
gp_Ax2 (class) [25 members] — Describes a right-handed coordinate system in 3D space
  gp_Ax2.__init__ (constructor) — __init__(*args, **kwargs)
  gp_Ax2.SetAxis (method) — SetAxis(*args, **kwargs)
  gp_Ax2.SetDirection (method) — SetDirection(*args, **kwargs)
  gp_Ax2.SetLocation (method) — SetLocation(self
  gp_Ax2.SetXDirection (method) — SetXDirection(self
  gp_Ax2.SetYDirection (method) — SetYDirection(self
  gp_Ax2.Angle (method) — Angle(self
  gp_Ax2.IsCoplanar (method) — IsCoplanar(*args, **kwargs)
  gp_Ax2.Mirror (method) — Mirror(*args, **kwargs)
  gp_Ax2.Mirrored (method) — Mirrored(*args, **kwargs)
  gp_Ax2.Rotate (method) — Rotate(self
  gp_Ax2.Rotated (method) — Rotated(self
  gp_Ax2.Scale (method) — Scale(self
  gp_Ax2.Scaled (method) — Scaled(self
  gp_Ax2.Transform (method) — Transform(self
  gp_Ax2.Transformed (method) — Transformed(self
  gp_Ax2.Translate (method) — Translate(*args, **kwargs)
  gp_Ax2.Translated (method) — Translated(*args, **kwargs)
  gp_Ax2.DumpJson (method) — DumpJson(self
  gp_Ax2.InitFromJson (method) — InitFromJson(self
  gp_Ax2.Axis (method) — Axis(self
  gp_Ax2.Direction (method) — Direction(self
  gp_Ax2.Location (method) — Location(self
  gp_Ax2.XDirection (method) — XDirection(self
  gp_Ax2.YDirection (method) — YDirection(self
gp_Ax3 (class) [30 members] — Describes a coordinate system in 3D space
  gp_Ax3.__init__ (constructor) — __init__(*args, **kwargs)
  gp_Ax3.XReverse (method) — XReverse(self
  gp_Ax3.YReverse (method) — YReverse(self
  gp_Ax3.ZReverse (method) — ZReverse(self
  gp_Ax3.SetAxis (method) — SetAxis(*args, **kwargs)
  gp_Ax3.SetDirection (method) — SetDirection(*args, **kwargs)
  gp_Ax3.SetLocation (method) — SetLocation(self
  gp_Ax3.SetXDirection (method) — SetXDirection(*args, **kwargs)
  gp_Ax3.SetYDirection (method) — SetYDirection(*args, **kwargs)
  gp_Ax3.Angle (method) — Angle(self
  gp_Ax3.Ax2 (method) — Ax2(*args, **kwargs)
  gp_Ax3.Direct (method) — Direct(self
  gp_Ax3.IsCoplanar (method) — IsCoplanar(*args, **kwargs)
  gp_Ax3.Mirror (method) — Mirror(*args, **kwargs)
  gp_Ax3.Mirrored (method) — Mirrored(*args, **kwargs)
  gp_Ax3.Rotate (method) — Rotate(self
  gp_Ax3.Rotated (method) — Rotated(self
  gp_Ax3.Scale (method) — Scale(self
  gp_Ax3.Scaled (method) — Scaled(self
  gp_Ax3.Transform (method) — Transform(self
  gp_Ax3.Transformed (method) — Transformed(self
  gp_Ax3.Translate (method) — Translate(*args, **kwargs)
  gp_Ax3.Translated (method) — Translated(*args, **kwargs)
  gp_Ax3.DumpJson (method) — DumpJson(self
  gp_Ax3.InitFromJson (method) — InitFromJson(self
  gp_Ax3.Axis (method) — Axis(self
  gp_Ax3.Direction (method) — Direction(self
  gp_Ax3.Location (method) — Location(self
  gp_Ax3.XDirection (method) — XDirection(self
  gp_Ax3.YDirection (method) — YDirection(self
gp_Dir (class) [33 members] — Describes a unit vector in 3D space
  gp_Dir.__init__ (constructor) — __init__(*args, **kwargs)
  gp_Dir.SetCoord (method) — SetCoord(*args, **kwargs)
  gp_Dir.SetX (method) — SetX(*args, **kwargs)
  gp_Dir.SetY (method) — SetY(*args, **kwargs)
  gp_Dir.SetZ (method) — SetZ(*args, **kwargs)
  gp_Dir.SetXYZ (method) — SetXYZ(*args, **kwargs)
  gp_Dir.Coord (method) — Coord(*args, **kwargs)
  gp_Dir.X (method) — X(self
  gp_Dir.Y (method) — Y(self
  gp_Dir.Z (method) — Z(self
  gp_Dir.IsEqual (method) — IsEqual(self
  gp_Dir.IsNormal (method) — IsNormal(self
  gp_Dir.IsOpposite (method) — IsOpposite(self
  gp_Dir.IsParallel (method) — IsParallel(self
  gp_Dir.Angle (method) — Angle(self
  gp_Dir.AngleWithRef (method) — AngleWithRef(self
  gp_Dir.Cross (method) — Cross(*args, **kwargs)
  gp_Dir.Crossed (method) — Crossed(*args, **kwargs)
  gp_Dir.CrossCross (method) — CrossCross(*args, **kwargs)
  gp_Dir.CrossCrossed (method) — CrossCrossed(*args, **kwargs)
  gp_Dir.Dot (method) — Dot(self
  gp_Dir.DotCross (method) — DotCross(self
  gp_Dir.Reverse (method) — Reverse(self
  gp_Dir.Reversed (method) — Reversed(self
  gp_Dir.Mirror (method) — Mirror(*args, **kwargs)
  gp_Dir.Mirrored (method) — Mirrored(*args, **kwargs)
  gp_Dir.Rotate (method) — Rotate(*args, **kwargs)
  gp_Dir.Rotated (method) — Rotated(self
  gp_Dir.Transform (method) — Transform(self
  gp_Dir.Transformed (method) — Transformed(self
  gp_Dir.DumpJson (method) — DumpJson(self
  gp_Dir.InitFromJson (method) — InitFromJson(self
  gp_Dir.XYZ (method) — XYZ(self
gp_EulerSequence (class) [3 members] — Enumerates all 24 possible variants of generalized Euler angles, defining…
  gp_EulerSequence.__init__ (constructor) — __init__(self
  gp_EulerSequence.name (property) — name(self
  gp_EulerSequence.value (property)

## gp (2) — `api-gp-2.md`

gp_GTrsf (class) [23 members] — Defines a non-persistent transformation in 3D space
  gp_GTrsf.__init__ (constructor) — __init__(*args, **kwargs)
  gp_GTrsf.SetAffinity (method) — SetAffinity(*args, **kwargs)
  gp_GTrsf.SetValue (method) — SetValue(*args, **kwargs)
  gp_GTrsf.SetVectorialPart (method) — SetVectorialPart(self
  gp_GTrsf.SetTranslationPart (method) — SetTranslationPart(self
  gp_GTrsf.SetTrsf (method) — SetTrsf(self
  gp_GTrsf.IsNegative (method) — IsNegative(self
  gp_GTrsf.IsSingular (method) — IsSingular(self
  gp_GTrsf.Form (method) — Form(self
  gp_GTrsf.SetForm (method) — SetForm(self
  gp_GTrsf.Value (method) — Value(*args, **kwargs)
  gp_GTrsf.Invert (method) — Invert(self
  gp_GTrsf.Inverted (method) — Inverted(self
  gp_GTrsf.Multiplied (method) — Multiplied(self
  gp_GTrsf.Multiply (method) — Multiply(self
  gp_GTrsf.PreMultiply (method) — PreMultiply(self
  gp_GTrsf.Power (method) — Power(self
  gp_GTrsf.Powered (method) — Powered(self
  gp_GTrsf.Transforms (method) — Transforms(*args, **kwargs)
  gp_GTrsf.Trsf (method) — Trsf(*args, **kwargs)
  gp_GTrsf.DumpJson (method) — DumpJson(self
  gp_GTrsf.TranslationPart (method) — TranslationPart(self
  gp_GTrsf.VectorialPart (method) — VectorialPart(self
gp_Lin (class) [24 members] — Describes a line in 3D space
  gp_Lin.__init__ (constructor) — __init__(*args, **kwargs)
  gp_Lin.Reverse (method) — Reverse(self
  gp_Lin.Reversed (method) — Reversed(self
  gp_Lin.SetDirection (method) — SetDirection(self
  gp_Lin.SetLocation (method) — SetLocation(self
  gp_Lin.SetPosition (method) — SetPosition(self
  gp_Lin.Angle (method) — Angle(self
  gp_Lin.Contains (method) — Contains(self
  gp_Lin.Distance (method) — Distance(*args, **kwargs)
  gp_Lin.SquareDistance (method) — SquareDistance(*args, **kwargs)
  gp_Lin.Normal (method) — Normal(*args, **kwargs)
  gp_Lin.Mirror (method) — Mirror(*args, **kwargs)
  gp_Lin.Mirrored (method) — Mirrored(*args, **kwargs)
  gp_Lin.Rotate (method) — Rotate(self
  gp_Lin.Rotated (method) — Rotated(self
  gp_Lin.Scale (method) — Scale(self
  gp_Lin.Scaled (method) — Scaled(self
  gp_Lin.Transform (method) — Transform(self
  gp_Lin.Transformed (method) — Transformed(self
  gp_Lin.Translate (method) — Translate(*args, **kwargs)
  gp_Lin.Translated (method) — Translated(*args, **kwargs)
  gp_Lin.Direction (method) — Direction(self
  gp_Lin.Location (method) — Location(self
  gp_Lin.Position (method) — Position(self
gp_Pln (class) [27 members] — Describes a plane
  gp_Pln.__init__ (constructor) — __init__(*args, **kwargs)
  gp_Pln.SetAxis (method) — SetAxis(self
  gp_Pln.SetLocation (method) — SetLocation(self
  gp_Pln.SetPosition (method) — SetPosition(self
  gp_Pln.UReverse (method) — UReverse(self
  gp_Pln.VReverse (method) — VReverse(self
  gp_Pln.Direct (method) — Direct(self
  gp_Pln.Distance (method) — Distance(*args, **kwargs)
  gp_Pln.SquareDistance (method) — SquareDistance(*args, **kwargs)
  gp_Pln.XAxis (method) — XAxis(self
  gp_Pln.YAxis (method) — YAxis(self
  gp_Pln.Contains (method) — Contains(*args, **kwargs)
  gp_Pln.Mirror (method) — Mirror(*args, **kwargs)
  gp_Pln.Mirrored (method) — Mirrored(*args, **kwargs)
  gp_Pln.Rotate (method) — Rotate(self
  gp_Pln.Rotated (method) — Rotated(self
  gp_Pln.Scale (method) — Scale(self
  gp_Pln.Scaled (method) — Scaled(self
  gp_Pln.Transform (method) — Transform(self
  gp_Pln.Transformed (method) — Transformed(self
  gp_Pln.Translate (method) — Translate(*args, **kwargs)
  gp_Pln.Translated (method) — Translated(*args, **kwargs)
  gp_Pln.DumpJson (method) — DumpJson(self
  gp_Pln.Coefficients (method) — Coefficients(*args, **kwargs)
  gp_Pln.Axis (method) — Axis(self
  gp_Pln.Location (method) — Location(self
  gp_Pln.Position (method) — Position(self
gp_Pnt (class) [28 members] — Defines a 3D cartesian point
  gp_Pnt.__init__ (constructor) — __init__(*args, **kwargs)
  gp_Pnt.SetCoord (method) — SetCoord(*args, **kwargs)
  gp_Pnt.SetX (method) — SetX(self
  gp_Pnt.SetY (method) — SetY(self
  gp_Pnt.SetZ (method) — SetZ(self
  gp_Pnt.SetXYZ (method) — SetXYZ(self
  gp_Pnt.Coord (method) — Coord(*args, **kwargs)
  gp_Pnt.X (method) — X(self
  gp_Pnt.Y (method) — Y(self
  gp_Pnt.Z (method) — Z(self
  gp_Pnt.BaryCenter (method) — BaryCenter(self
  gp_Pnt.IsEqual (method) — IsEqual(self
  gp_Pnt.Distance (method) — Distance(*args, **kwargs)
  gp_Pnt.SquareDistance (method) — SquareDistance(*args, **kwargs)
  gp_Pnt.Mirror (method) — Mirror(*args, **kwargs)
  gp_Pnt.Mirrored (method) — Mirrored(*args, **kwargs)
  gp_Pnt.Rotate (method) — Rotate(*args, **kwargs)
  gp_Pnt.Rotated (method) — Rotated(self
  gp_Pnt.Scale (method) — Scale(*args, **kwargs)
  gp_Pnt.Scaled (method) — Scaled(self
  gp_Pnt.Transform (method) — Transform(self
  gp_Pnt.Transformed (method) — Transformed(self
  gp_Pnt.Translate (method) — Translate(*args, **kwargs)
  gp_Pnt.Translated (method) — Translated(*args, **kwargs)
  gp_Pnt.DumpJson (method) — DumpJson(self
  gp_Pnt.InitFromJson (method) — InitFromJson(self
  gp_Pnt.XYZ (method) — XYZ(self
  gp_Pnt.ChangeCoord (method) — ChangeCoord(self
gp_Quaternion (class) [35 members] — Represents operation of rotation in 3d space as quaternion and…
  gp_Quaternion.__init__ (constructor) — __init__(*args, **kwargs)
  gp_Quaternion.IsEqual (method) — IsEqual(self
  gp_Quaternion.SetRotation (method) — SetRotation(*args, **kwargs)
  gp_Quaternion.SetVectorAndAngle (method) — SetVectorAndAngle(self
  gp_Quaternion.SetMatrix (method) — SetMatrix(self
  gp_Quaternion.GetMatrix (method) — GetMatrix(self
  gp_Quaternion.SetEulerAngles (method) — SetEulerAngles(self
  gp_Quaternion.Set (method) — Set(*args, **kwargs)
  gp_Quaternion.X (method) — X(self
  gp_Quaternion.Y (method) — Y(self
  gp_Quaternion.Z (method) — Z(self
  gp_Quaternion.W (method) — W(self
  gp_Quaternion.SetIdent (method) — SetIdent(self
  gp_Quaternion.Reverse (method) — Reverse(self
  gp_Quaternion.Reversed (method) — Reversed(self
  gp_Quaternion.Invert (method) — Invert(self
  gp_Quaternion.Inverted (method) — Inverted(self
  gp_Quaternion.SquareNorm (method) — SquareNorm(self
  gp_Quaternion.Norm (method) — Norm(self
  gp_Quaternion.Scale (method) — Scale(*args, **kwargs)
  gp_Quaternion.Scaled (method) — Scaled(self
  gp_Quaternion.StabilizeLength (method) — StabilizeLength(self
  gp_Quaternion.Normalize (method) — Normalize(self
  gp_Quaternion.Normalized (method) — Normalized(self
  gp_Quaternion.Negated (method) — Negated(self
  gp_Quaternion.Added (method) — Added(self
  gp_Quaternion.Subtracted (method) — Subtracted(self
  gp_Quaternion.Multiplied (method) — Multiplied(*args, **kwargs)
  gp_Quaternion.Add (method) — Add(*args, **kwargs)
  gp_Quaternion.Subtract (method) — Subtract(*args, **kwargs)
  gp_Quaternion.Multiply (method) — Multiply(*args, **kwargs)
  gp_Quaternion.Dot (method) — Dot(self
  gp_Quaternion.GetRotationAngle (method) — GetRotationAngle(self
  gp_Quaternion.GetVectorAndAngle (method) — GetVectorAndAngle(self
  gp_Quaternion.GetEulerAngles (method) — GetEulerAngles(self

## gp (3) — `api-gp-3.md`

gp_Trsf (class) [30 members] — Defines a non-persistent transformation in 3D space
  gp_Trsf.__init__ (constructor) — __init__(*args, **kwargs)
  gp_Trsf.SetMirror (method) — SetMirror(*args, **kwargs)
  gp_Trsf.SetRotation (method) — SetRotation(*args, **kwargs)
  gp_Trsf.SetRotationPart (method) — SetRotationPart(self
  gp_Trsf.SetScale (method) — SetScale(self
  gp_Trsf.SetDisplacement (method) — SetDisplacement(self
  gp_Trsf.SetTransformation (method) — SetTransformation(*args, **kwargs)
  gp_Trsf.SetTranslation (method) — SetTranslation(*args, **kwargs)
  gp_Trsf.SetTranslationPart (method) — SetTranslationPart(self
  gp_Trsf.SetScaleFactor (method) — SetScaleFactor(self
  gp_Trsf.SetForm (method) — SetForm(self
  gp_Trsf.SetValues (method) — SetValues(self
  gp_Trsf.IsNegative (method) — IsNegative(self
  gp_Trsf.Form (method) — Form(self
  gp_Trsf.ScaleFactor (method) — ScaleFactor(self
  gp_Trsf.GetRotation (method) — GetRotation(*args, **kwargs)
  gp_Trsf.VectorialPart (method) — VectorialPart(self
  gp_Trsf.Value (method) — Value(*args, **kwargs)
  gp_Trsf.Invert (method) — Invert(self
  gp_Trsf.Inverted (method) — Inverted(self
  gp_Trsf.Multiplied (method) — Multiplied(self
  gp_Trsf.Multiply (method) — Multiply(self
  gp_Trsf.PreMultiply (method) — PreMultiply(self
  gp_Trsf.Power (method) — Power(self
  gp_Trsf.Powered (method) — Powered(self
  gp_Trsf.Transforms (method) — Transforms(*args, **kwargs)
  gp_Trsf.DumpJson (method) — DumpJson(self
  gp_Trsf.InitFromJson (method) — InitFromJson(self
  gp_Trsf.TranslationPart (method) — TranslationPart(self
  gp_Trsf.HVectorialPart (method) — HVectorialPart(self
gp_Vec (class) [49 members] — Defines a non-persistent vector in 3D space
  gp_Vec.__init__ (constructor) — __init__(*args, **kwargs)
  gp_Vec.SetCoord (method) — SetCoord(*args, **kwargs)
  gp_Vec.SetX (method) — SetX(self
  gp_Vec.SetY (method) — SetY(self
  gp_Vec.SetZ (method) — SetZ(self
  gp_Vec.SetXYZ (method) — SetXYZ(self
  gp_Vec.Coord (method) — Coord(*args, **kwargs)
  gp_Vec.X (method) — X(self
  gp_Vec.Y (method) — Y(self
  gp_Vec.Z (method) — Z(self
  gp_Vec.IsEqual (method) — IsEqual(self
  gp_Vec.IsNormal (method) — IsNormal(*args, **kwargs)
  gp_Vec.IsOpposite (method) — IsOpposite(self
  gp_Vec.IsParallel (method) — IsParallel(self
  gp_Vec.Angle (method) — Angle(*args, **kwargs)
  gp_Vec.AngleWithRef (method) — AngleWithRef(*args, **kwargs)
  gp_Vec.Magnitude (method) — Magnitude(self
  gp_Vec.SquareMagnitude (method) — SquareMagnitude(self
  gp_Vec.Add (method) — Add(self
  gp_Vec.Added (method) — Added(self
  gp_Vec.Subtract (method) — Subtract(self
  gp_Vec.Subtracted (method) — Subtracted(self
  gp_Vec.Multiply (method) — Multiply(self
  gp_Vec.Multiplied (method) — Multiplied(self
  gp_Vec.Divide (method) — Divide(self
  gp_Vec.Divided (method) — Divided(self
  gp_Vec.Cross (method) — Cross(self
  gp_Vec.Crossed (method) — Crossed(self
  gp_Vec.CrossMagnitude (method) — CrossMagnitude(self
  gp_Vec.CrossSquareMagnitude (method) — CrossSquareMagnitude(self
  gp_Vec.CrossCross (method) — CrossCross(self
  gp_Vec.CrossCrossed (method) — CrossCrossed(self
  gp_Vec.Dot (method) — Dot(self
  gp_Vec.DotCross (method) — DotCross(self
  gp_Vec.Normalize (method) — Normalize(self
  gp_Vec.Normalized (method) — Normalized(*args, **kwargs)
  gp_Vec.Reverse (method) — Reverse(self
  gp_Vec.Reversed (method) — Reversed(self
  gp_Vec.SetLinearForm (method) — SetLinearForm(*args, **kwargs)
  gp_Vec.Mirror (method) — Mirror(*args, **kwargs)
  gp_Vec.Mirrored (method) — Mirrored(*args, **kwargs)
  gp_Vec.Rotate (method) — Rotate(*args, **kwargs)
  gp_Vec.Rotated (method) — Rotated(self
  gp_Vec.Scale (method) — Scale(self
  gp_Vec.Scaled (method) — Scaled(self
  gp_Vec.Transform (method) — Transform(self
  gp_Vec.Transformed (method) — Transformed(self
  gp_Vec.DumpJson (method) — DumpJson(self
  gp_Vec.XYZ (method) — XYZ(self
gp_XYZ (class) [38 members] — This class describes a cartesian coordinate entity in 3D space…
  gp_XYZ.__init__ (constructor) — __init__(*args, **kwargs)
  gp_XYZ.SetCoord (method) — SetCoord(*args, **kwargs)
  gp_XYZ.SetX (method) — SetX(self
  gp_XYZ.SetY (method) — SetY(self
  gp_XYZ.SetZ (method) — SetZ(self
  gp_XYZ.Coord (method) — Coord(*args, **kwargs)
  gp_XYZ.ChangeCoord (method) — ChangeCoord(self
  gp_XYZ.GetData (method) — GetData(self
  gp_XYZ.ChangeData (method) — ChangeData(self
  gp_XYZ.X (method) — X(self
  gp_XYZ.Y (method) — Y(self
  gp_XYZ.Z (method) — Z(self
  gp_XYZ.Modulus (method) — Modulus(self
  gp_XYZ.SquareModulus (method) — SquareModulus(self
  gp_XYZ.IsEqual (method) — IsEqual(self
  gp_XYZ.Add (method) — Add(self
  gp_XYZ.Added (method) — Added(self
  gp_XYZ.Cross (method) — Cross(*args, **kwargs)
  gp_XYZ.Crossed (method) — Crossed(self
  gp_XYZ.CrossMagnitude (method) — CrossMagnitude(*args, **kwargs)
  gp_XYZ.CrossSquareMagnitude (method) — CrossSquareMagnitude(*args, **kwargs)
  gp_XYZ.CrossCross (method) — CrossCross(*args, **kwargs)
  gp_XYZ.CrossCrossed (method) — CrossCrossed(self
  gp_XYZ.Divide (method) — Divide(self
  gp_XYZ.Divided (method) — Divided(self
  gp_XYZ.Dot (method) — Dot(self
  gp_XYZ.DotCross (method) — DotCross(*args, **kwargs)
  gp_XYZ.Multiply (method) — Multiply(*args, **kwargs)
  gp_XYZ.Multiplied (method) — Multiplied(*args, **kwargs)
  gp_XYZ.Normalize (method) — Normalize(*args, **kwargs)
  gp_XYZ.Normalized (method) — Normalized(self
  gp_XYZ.Reverse (method) — Reverse(self
  gp_XYZ.Reversed (method) — Reversed(self
  gp_XYZ.Subtract (method) — Subtract(self
  gp_XYZ.Subtracted (method) — Subtracted(self
  gp_XYZ.SetLinearForm (method) — SetLinearForm(*args, **kwargs)
  gp_XYZ.DumpJson (method) — DumpJson(self
  gp_XYZ.InitFromJson (method) — InitFromJson(self

## importers — `api-importers.md`

import_brep (function) — Import shape from a BREP file
import_step (function) — import_step
import_stl (function) — import_stl
import_svg (function) — import_svg
import_svg_as_buildline_code (function) — translate_to_buildline_code

## import_dxf — `api-import-dxf.md`

import_dxf (function) — Import shapes from a DXF file

## _minimize — `api-minimize.md`

minimize (function) — Minimization of scalar function of one or more variables

## persistence — `api-persistence.md`

modify_copyreg (function) — Modify the copyreg so that pickle knows what to look…

## pack — `api-pack.md`

pack (function) — Pack objects in a squarish area in Plane.XY

## itertools — `api-itertools.md`

product (class) — Cartesian product of input iterables

## _warnings — `api-warnings.md`

warn (function) — Issue a warning, or maybe ignore it or raise an…
