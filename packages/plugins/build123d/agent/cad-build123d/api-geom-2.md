# build123d — Geom (2)

4 top-level symbols. Signatures are verbatim python.

// The root class for bounded surfaces in 3D space
Geom_BoundedSurface

// Initialize self
Geom_BoundedSurface(\*args, \*\*kwargs)

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// DynamicType(self
DynamicType(self: OCP.OCP.Geom.Geom_BoundedSurface) -> OCP.OCP.Standard.Standard_Type

// Describes the common behavior of surfaces which have a simple parametric equation in a local coordinate system
Geom_ElementarySurface

// Initialize self
Geom_ElementarySurface(\*args, \*\*kwargs)

// SetAxis(self
SetAxis(self: OCP.OCP.Geom.Geom_ElementarySurface, theA1: OCP.OCP.gp.gp_Ax1) -> None

// SetLocation(self
SetLocation(self: OCP.OCP.Geom.Geom_ElementarySurface, theLoc: OCP.OCP.gp.gp_Pnt) -> None

// SetPosition(self
SetPosition(self: OCP.OCP.Geom.Geom_ElementarySurface, theAx3: OCP.OCP.gp.gp_Ax3) -> None

// UReverse(self
UReverse(self: OCP.OCP.Geom.Geom_ElementarySurface) -> None

// UReversedParameter(self
UReversedParameter(self: OCP.OCP.Geom.Geom_ElementarySurface, U: float) -> float

// VReverse(self
VReverse(self: OCP.OCP.Geom.Geom_ElementarySurface) -> None

// VReversedParameter(self
VReversedParameter(self: OCP.OCP.Geom.Geom_ElementarySurface, V: float) -> float

// Continuity(self
Continuity(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.GeomAbs.GeomAbs_Shape

// IsCNu(self
IsCNu(self: OCP.OCP.Geom.Geom_ElementarySurface, N: int) -> bool

// IsCNv(self
IsCNv(self: OCP.OCP.Geom.Geom_ElementarySurface, N: int) -> bool

// DumpJson(self
DumpJson(self: OCP.OCP.Geom.Geom_ElementarySurface, theOStream: io.BytesIO, theDepth: int = -1) -> None

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// Axis(self
Axis(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.gp.gp_Ax1

// Location(self
Location(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.gp.gp_Pnt

// Position(self
Position(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.gp.gp_Ax3

// DynamicType(self
DynamicType(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.Standard.Standard_Type

// Describes an infinite line
Geom_Line

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.Geom.Geom_Line, A1: OCP.OCP.gp.gp_Ax1) -> None
**init**(self: OCP.OCP.Geom.Geom_Line, L: OCP.OCP.gp.gp_Lin) -> None
**init**(self: OCP.OCP.Geom.Geom_Line, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None

// SetLin(self
SetLin(self: OCP.OCP.Geom.Geom_Line, L: OCP.OCP.gp.gp_Lin) -> None

// SetDirection(self
SetDirection(self: OCP.OCP.Geom.Geom_Line, V: OCP.OCP.gp.gp_Dir) -> None

// SetLocation(self
SetLocation(self: OCP.OCP.Geom.Geom_Line, P: OCP.OCP.gp.gp_Pnt) -> None

// SetPosition(self
SetPosition(self: OCP.OCP.Geom.Geom_Line, A1: OCP.OCP.gp.gp_Ax1) -> None

// Lin(self
Lin(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.gp.gp_Lin

// Reverse(self
Reverse(self: OCP.OCP.Geom.Geom_Line) -> None

// ReversedParameter(self
ReversedParameter(self: OCP.OCP.Geom.Geom_Line, U: float) -> float

// FirstParameter(self
FirstParameter(self: OCP.OCP.Geom.Geom_Line) -> float

// LastParameter(self
LastParameter(self: OCP.OCP.Geom.Geom_Line) -> float

// IsClosed(self
IsClosed(self: OCP.OCP.Geom.Geom_Line) -> bool

// IsPeriodic(self
IsPeriodic(self: OCP.OCP.Geom.Geom_Line) -> bool

// Continuity(self
Continuity(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.GeomAbs.GeomAbs_Shape

// IsCN(self
IsCN(self: OCP.OCP.Geom.Geom_Line, N: int) -> bool

// D0(self
D0(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt) -> None

// D1(self
D1(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

// D2(self
D2(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

// D3(self
D3(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

// DN(self
DN(self: OCP.OCP.Geom.Geom_Line, U: float, N: int) -> OCP.OCP.gp.gp_Vec

// Transform(self
Transform(self: OCP.OCP.Geom.Geom_Line, T: OCP.OCP.gp.gp_Trsf) -> None

// TransformedParameter(self
TransformedParameter(self: OCP.OCP.Geom.Geom_Line, U: float, T: OCP.OCP.gp.gp_Trsf) -> float

// ParametricTransformation(self
ParametricTransformation(self: OCP.OCP.Geom.Geom_Line, T: OCP.OCP.gp.gp_Trsf) -> float

// Copy(self
Copy(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.Geom.Geom_Geometry

// DumpJson(self
DumpJson(self: OCP.OCP.Geom.Geom_Line, theOStream: io.BytesIO, theDepth: int = -1) -> None

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// Position(self
Position(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.gp.gp_Ax1

// DynamicType(self
DynamicType(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.Standard.Standard_Type

// Describes a plane in 3D space
Geom_Plane

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.Geom.Geom_Plane, A3: OCP.OCP.gp.gp_Ax3) -> None
**init**(self: OCP.OCP.Geom.Geom_Plane, Pl: OCP.OCP.gp.gp_Pln) -> None
**init**(self: OCP.OCP.Geom.Geom_Plane, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None
**init**(self: OCP.OCP.Geom.Geom_Plane, A: float, B: float, C: float, D: float) -> None

// SetPln(self
SetPln(self: OCP.OCP.Geom.Geom_Plane, Pl: OCP.OCP.gp.gp_Pln) -> None

// Pln(self
Pln(self: OCP.OCP.Geom.Geom_Plane) -> OCP.OCP.gp.gp_Pln

// UReverse(self
UReverse(self: OCP.OCP.Geom.Geom_Plane) -> None

// UReversedParameter(self
UReversedParameter(self: OCP.OCP.Geom.Geom_Plane, U: float) -> float

// VReverse(self
VReverse(self: OCP.OCP.Geom.Geom_Plane) -> None

// VReversedParameter(self
VReversedParameter(self: OCP.OCP.Geom.Geom_Plane, V: float) -> float

// ParametricTransformation(self
ParametricTransformation(self: OCP.OCP.Geom.Geom_Plane, T: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_GTrsf2d

// IsUClosed(self
IsUClosed(self: OCP.OCP.Geom.Geom_Plane) -> bool

// IsVClosed(self
IsVClosed(self: OCP.OCP.Geom.Geom_Plane) -> bool

// IsUPeriodic(self
IsUPeriodic(self: OCP.OCP.Geom.Geom_Plane) -> bool

// IsVPeriodic(self
IsVPeriodic(self: OCP.OCP.Geom.Geom_Plane) -> bool

// UIso(self
UIso(self: OCP.OCP.Geom.Geom_Plane, U: float) -> OCP.OCP.Geom.Geom_Curve

// VIso(self
VIso(self: OCP.OCP.Geom.Geom_Plane, V: float) -> OCP.OCP.Geom.Geom_Curve

// D0(self
D0(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt) -> None

// D1(self
D1(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, D1U: OCP.OCP.gp.gp_Vec, D1V: OCP.OCP.gp.gp_Vec) -> None

// D2(self
D2(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, D1U: OCP.OCP.gp.gp_Vec, D1V: OCP.OCP.gp.gp_Vec, D2U: OCP.OCP.gp.gp_Vec, D2V: OCP.OCP.gp.gp_Vec, D2UV: OCP.OCP.gp.gp_Vec) -> None

// D3(self
D3(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, D1U: OCP.OCP.gp.gp_Vec, D1V: OCP.OCP.gp.gp_Vec, D2U: OCP.OCP.gp.gp_Vec, D2V: OCP.OCP.gp.gp_Vec, D2UV: OCP.OCP.gp.gp_Vec, D3U: OCP.OCP.gp.gp_Vec, D3V: OCP.OCP.gp.gp_Vec, D3UUV: OCP.OCP.gp.gp_Vec, D3UVV: OCP.OCP.gp.gp_Vec) -> None

// DN(self
DN(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, Nu: int, Nv: int) -> OCP.OCP.gp.gp_Vec

// Transform(self
Transform(self: OCP.OCP.Geom.Geom_Plane, T: OCP.OCP.gp.gp_Trsf) -> None

// Copy(self
Copy(self: OCP.OCP.Geom.Geom_Plane) -> OCP.OCP.Geom.Geom_Geometry

// DumpJson(self
DumpJson(self: OCP.OCP.Geom.Geom_Plane, theOStream: io.BytesIO, theDepth: int = -1) -> None

// TransformParameters(self
TransformParameters(self: OCP.OCP.Geom.Geom_Plane, T: OCP.OCP.gp.gp_Trsf) -> tuple[float, float]

// Bounds(self
Bounds(self: OCP.OCP.Geom.Geom_Plane) -> tuple[float, float, float, float]

// Coefficients(self
Coefficients(self: OCP.OCP.Geom.Geom_Plane) -> tuple[float, float, float, float]

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// DynamicType(self
DynamicType(self: OCP.OCP.Geom.Geom_Plane) -> OCP.OCP.Standard.Standard_Type
