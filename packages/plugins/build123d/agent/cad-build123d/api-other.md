# build123d — other

60 top-level symbols. Signatures are verbatim python.

AddType: build123d.topology.one_d.Edge | build123d.topology.one_d.Wire | build123d.topology.two_d.Face | build123d.topology.three_d.Solid | build123d.topology.composite.Compound | build123d.build_common.Builder

Align2D: build123d.build_enums.Align | None | tuple[build123d.build_enums.Align | None, build123d.build_enums.Align | None]

Align3D: build123d.build_enums.Align | None | tuple[build123d.build_enums.Align | None, build123d.build_enums.Align | None, build123d.build_enums.Align | None]

B: ~B

CLASS_REGISTRY: {'Axis': <class 'build123d.geometry.Axis'>, 'Color': <class 'build123d.geometry.Color'>, 'Location': <class 'build123d.geometry.Location'>, 'Plane': <class 'build123d.geometry.Plane'>, 'Vector': <class 'build123d.geometry.Vector'>}

// 10
CM: int

ChamferFilletType: build123d.topology.one_d.Edge | build123d.topology.zero_d.Vertex

ClassVar: typing.ClassVar

ColorLike: str | tuple[str, float | int] | tuple[float | int, float | int, float | int] | tuple[float | int, float | int, float | int, float | int] | int | tuple[int, int] | build123d.geometry.Color | OCP.OCP.Quantity.Quantity_ColorRGBA

// Not introspectable
ConvexHull

// 0.017453292519943295
DEG2RAD: float

// 304.79999999999995
FT: float

// 1
G: int

// 5
GEOM_KEY_DIGITS: int

GccEnt_enclosed: GccEnt_Position.GccEnt_enclosed

GccEnt_enclosing: GccEnt_Position.GccEnt_enclosing

GccEnt_outside: GccEnt_Position.GccEnt_outside

GccEnt_unqualified: GccEnt_Position.GccEnt_unqualified

// 25.4
IN: float

// 1000
KG: int

// 453.59237
LB: float

Literal: typing.Literal

// 1000
M: int

// 0.001
MC: float

// 1
MM: int

MirrorType: build123d.topology.one_d.Edge | build123d.topology.one_d.Wire | build123d.topology.two_d.Face | build123d.topology.composite.Compound | build123d.topology.composite.Curve | build123d.topology.composite.Sketch | build123d.topology.composite.Part

OffsetType: build123d.topology.one_d.Edge | build123d.topology.two_d.Face | build123d.topology.three_d.Solid | build123d.topology.composite.Compound

PathDescriptor: build123d.topology.one_d.Wire | build123d.topology.one_d.Edge | list[build123d.geometry.Vector | build123d.topology.zero_d.Vertex | tuple[float, float, float]]

PathSegment: svgpathtools.path.Line | svgpathtools.path.Arc | svgpathtools.path.QuadraticBezier | svgpathtools.path.CubicBezier

PointLike: build123d.geometry.Vector | build123d.topology.zero_d.Vertex | tuple[float, float, float]

ProjectType: build123d.topology.one_d.Edge | build123d.topology.two_d.Face | build123d.topology.one_d.Wire | build123d.geometry.Vector | build123d.topology.zero_d.Vertex

// 57.29577951308232
RAD2DEG: float

RotationLike: build123d.geometry.Rotation | tuple[float, float, float]

Self: typing.Self

ShapeT: ~ShapeT

SplitType: build123d.topology.one_d.Edge | build123d.topology.one_d.Wire | build123d.topology.two_d.Face | build123d.topology.three_d.Solid

SweepType: build123d.topology.composite.Compound | build123d.topology.one_d.Edge | build123d.topology.one_d.Wire | build123d.topology.two_d.Face | build123d.topology.three_d.Solid

T: ~T

T2: ~T2

// 0.0254
THOU: float

// 0.01
TOL: float

// 1e-06
TOLERANCE: float

// 6
TOL_DIGITS: int

// False
TYPE_CHECKING: bool

TopAbs_FACE: TopAbs_ShapeEnum.TopAbs_FACE

Type: typing.Type

TypeAlias: typing.TypeAlias

UNITS_PER_METER: {<Unit.IN>: 39.37007874015748, <Unit.FT>: 3.280839895013124, <Unit.MC>: 1000000.0, <Unit.MM>: 1000.0, <Unit.CM>: 100.0, <Unit.M>: 1}

// Not introspectable
Vec2

VectorLike: build123d.geometry.Vector | tuple[float, float] | tuple[float, float, float] | collections.abc.Sequence[float]

// Not introspectable
Voronoi

XCAFDoc_ColorCurv: XCAFDoc_ColorType.XCAFDoc_ColorCurv

XCAFDoc_ColorGen: XCAFDoc_ColorType.XCAFDoc_ColorGen

XCAFDoc_ColorSurf: XCAFDoc_ColorType.XCAFDoc_ColorSurf

annotations: _Feature((3, 7, 0, 'beta', 1), None, 16777216)

// inf
inf: float

logger: <Logger build123d (WARNING)>

operations_apply_to: {'add': ['BuildPart', 'BuildSketch', 'BuildLine'], 'bounding_box': ['BuildPart', 'BuildSketch', 'BuildLine'], 'chamfer': ['BuildPart', 'BuildSketch', 'BuildLine'], 'draft': ['BuildPart'], 'extrude': ['BuildPart'], 'fillet': ['BuildPart', 'BuildSketch', 'BuildLine'], 'full_round': ['BuildSketch'], 'loft': ['BuildPart'], 'make_brake_formed': ['BuildPart'], 'make_face': ['BuildSketch'], 'make_hull': ['BuildSketch'], 'mirror': ['BuildPart', 'BuildSketch', 'BuildLine'], 'offset': ['BuildPart', 'BuildSketch', 'BuildLine'], 'project': ['BuildPart', 'BuildSketch', 'BuildLine'], 'project_workplane': ['BuildPart'], 'revolve': ['BuildPart'], 'scale': ['BuildPart', 'BuildSketch', 'BuildLine'], 'section': ['BuildPart'], 'split': ['BuildPart', 'BuildSketch', 'BuildLine'], 'sweep': ['BuildPart', 'BuildSketch'], 'thicken': ['BuildPart']}

// 3.141592653589793
pi: float

topods_lut: {<class 'OCP.OCP.TopoDS.TopoDS_Compound'>: <class 'build123d.topology.composite.Compound'>, <class 'OCP.OCP.TopoDS.TopoDS_Edge'>: <class 'build123d.topology.one_d.Edge'>, <class 'OCP.OCP.TopoDS.TopoDS_Face'>: <class 'build123d.topology.two_d.Face'>, <class 'OCP.OCP.TopoDS.TopoDS_Shell'>: <class 'build123d.topology.two_d.Shell'>, <class 'OCP.OCP.TopoDS.TopoDS_Solid'>: <class 'build123d.topology.three_d.Solid'>, <class 'OCP.OCP.TopoDS.TopoDS_Vertex'>: <class 'build123d.topology.zero_d.Vertex'>, <class 'OCP.OCP.TopoDS.TopoDS_Wire'>: <class 'build123d.topology.one_d.Wire'>}
