"""Python projection of the canonical GeoSpec matcher/selector option schema.

Nested fields retain their canonical spelling. Selector IDs and metadata remain
literal values; this module performs no dictionary-key conversion or geometry.
"""

from __future__ import annotations

from typing import Literal, Protocol, Required, Sequence, TYPE_CHECKING, TypedDict, TypeAlias, Unpack, overload

if TYPE_CHECKING:
    from ._api import GeoSpecAssertionReport, GeoSpecRegex

__all__ = [
    "GeoSpecMatchers", "GeoSpecAxisExpectation", "GeoSpecNumericExpectation",
    "GeoSpecBoundingBoxExpectation", "GeoSpecConnectedComponentsExpectation",
    "GeoSpecComponentInterferenceExpectation", "GeoSpecAssemblyOccurrencesExpectation",
    "GeoSpecSpatialRelationshipsExpectation", "GeoSpecMeshIntegrityExpectation",
    "GeoSpecNoDiagnosticsExpectation", "GeoSpecSurfaceAreaExpectation", "GeoSpecVolumeExpectation",
    "GeoSpecMassExpectation", "GeoSpecCenterOfMassExpectation", "GeoSpecValidBrepExpectation",
    "GeoSpecTopologyCountsExpectation", "GeoSpecStepUnitsExpectation", "GeoSpecProductStructureExpectation",
    "GeoSpecPlanarFaceExpectation", "GeoSpecCylindricalFaceExpectation", "GeoSpecCircularHoleExpectation",
    "GeoSpecCircularHolePatternExpectation", "GeoSpecChamferFeatureExpectation", "GeoSpecFilletFeatureExpectation",
    "GeoSpecMinimumWallThicknessExpectation", "GeoSpecVoidContinuityExpectation", "GeoSpecGeometrySelector",
]

GeoSpecVector: TypeAlias = tuple[float, float, float] | list[float]


class GeoSpecAxisExpectation(TypedDict, total=False):
    x: float
    y: float
    z: float


class _NumericConditions(TypedDict, total=False):
    value: float
    greaterThan: float
    greaterThanOrEqual: float
    lessThan: float
    lessThanOrEqual: float


GeoSpecNumericExpectation: TypeAlias = float | _NumericConditions
GeoSpecPointExpectation: TypeAlias = GeoSpecVector | GeoSpecAxisExpectation


class _NumericAxes(TypedDict, total=False):
    x: GeoSpecNumericExpectation
    y: GeoSpecNumericExpectation
    z: GeoSpecNumericExpectation


class GeoSpecBoundingBoxExpectation(TypedDict, total=False):
    min: GeoSpecVector | _NumericAxes
    max: GeoSpecVector | _NumericAxes
    size: GeoSpecVector | _NumericAxes
    center: GeoSpecVector | _NumericAxes
    tolerance: float


class GeoSpecConnectedComponentsExpectation(TypedDict, total=False):
    count: Required[int]
    tolerance: float
    toleranceMm: float


GeoSpecComponentSelector: TypeAlias = "str | GeoSpecRegex"


class _Pair(TypedDict):
    left: GeoSpecComponentSelector
    right: GeoSpecComponentSelector


class _Allowance(_Pair, total=False):
    kind: Literal["intentionalInterference"]
    maxVolume: float
    reason: Required[str]


class GeoSpecComponentInterferenceExpectation(TypedDict, total=False):
    tolerance: float
    pairs: Sequence[_Pair]
    allowances: Sequence[_Allowance]


class GeoSpecVolumeExpectation(TypedDict, total=False):
    value: Required[GeoSpecNumericExpectation]
    tolerance: float


class GeoSpecSurfaceAreaExpectation(GeoSpecVolumeExpectation):
    pass


class GeoSpecMassExpectation(GeoSpecVolumeExpectation, total=False):
    density: float


class GeoSpecCenterOfMassExpectation(TypedDict, total=False):
    point: Required[GeoSpecPointExpectation]
    tolerance: float


class GeoSpecPlanarFaceExpectation(TypedDict, total=False):
    normal: Required[GeoSpecPointExpectation]
    offset: Required[float]
    area: GeoSpecNumericExpectation
    tolerance: float


class GeoSpecCylindricalFaceExpectation(TypedDict, total=False):
    radius: Required[float]
    axis: Required[Literal["x", "y", "z"]]
    tolerance: float


class GeoSpecCircularHoleExpectation(TypedDict, total=False):
    diameter: Required[float]
    through: bool
    axis: Literal["x", "y", "z"]
    center: GeoSpecPointExpectation
    tolerance: float


class GeoSpecChamferFeatureExpectation(TypedDict, total=False):
    distance: Required[float]
    selection: str
    tolerance: float


class GeoSpecFilletFeatureExpectation(TypedDict, total=False):
    radius: Required[float]
    selection: str
    tolerance: float


class GeoSpecMinimumWallThicknessExpectation(GeoSpecVolumeExpectation):
    pass


class _VoidOccurrence(TypedDict):
    occurrence: str


class _Bounds(TypedDict):
    min: GeoSpecVector
    max: GeoSpecVector


class GeoSpecVoidContinuityExpectation(TypedDict, total=False):
    path: Required[Sequence[GeoSpecVector | _VoidOccurrence]]
    material: Sequence[str]
    minCrossSection: float
    isolatedFrom: Sequence[GeoSpecVector]
    bounds: _Bounds


class GeoSpecTopologyCountsExpectation(TypedDict, total=False):
    vertices: GeoSpecNumericExpectation
    edges: GeoSpecNumericExpectation
    wires: GeoSpecNumericExpectation
    faces: GeoSpecNumericExpectation
    shells: GeoSpecNumericExpectation
    solids: GeoSpecNumericExpectation
    compounds: GeoSpecNumericExpectation
    tolerance: float


class GeoSpecStepUnitsExpectation(TypedDict):
    unit: Literal["mm", "cm", "m", "in", "ft"]


class GeoSpecProductStructureExpectation(TypedDict, total=False):
    names: Sequence[str]
    count: GeoSpecNumericExpectation


class GeoSpecCircularHolePatternExpectation(TypedDict, total=False):
    count: Required[int]
    holeDiameter: Required[float]
    boltCircleDiameter: float
    axis: Literal["x", "y", "z"]
    center: GeoSpecPointExpectation
    tolerance: float


class _CardinalityCount(TypedDict):
    exactly: int


class _CardinalityMinimum(TypedDict):
    atLeast: int


_Cardinality: TypeAlias = Literal["one", "many"] | _CardinalityCount | _CardinalityMinimum


class _Range(TypedDict, total=False):
    min: float
    max: float


class _Direction(TypedDict, total=False):
    direction: Required[GeoSpecVector]
    angularToleranceDegrees: float


class _Near(GeoSpecAxisExpectation, total=False):
    tolerance: float


class _Ray(TypedDict):
    origin: GeoSpecVector
    direction: GeoSpecVector


# "not" is a schema field, not a Python identifier; preserve its literal key.
_FaceQuery = TypedDict("_FaceQuery", {
    "surfaceType": Literal["plane", "cylinder", "cone", "sphere", "torus", "bspline", "other"],
    "normal": _Direction, "axis": _Direction,
    "radius": float | _Range, "area": float | _Range, "offset": float | _Range,
    "near": _Near, "containsPoint": GeoSpecVector, "nearestTo": GeoSpecVector,
    "hitByRay": _Ray, "within": "GeoSpecGeometrySelector",
    "orderBy": Literal["area", "radius", "offsetAlong"], "along": GeoSpecVector,
    "pick": Literal["first", "last"] | int,
    "allOf": "Sequence[_FaceQuery]", "anyOf": "Sequence[_FaceQuery]", "not": "_FaceQuery",
}, total=False)

_BodyQuery = TypedDict("_BodyQuery", {
    "area": float | _Range, "near": _Near, "nearestTo": GeoSpecVector,
    "within": "GeoSpecGeometrySelector", "orderBy": Literal["area", "offsetAlong"],
    "along": GeoSpecVector, "pick": Literal["first", "last"] | int,
    "allOf": "Sequence[_BodyQuery]", "anyOf": "Sequence[_BodyQuery]", "not": "_BodyQuery",
}, total=False)


class _OccurrenceSelector(TypedDict, total=False):
    kind: Required[Literal["occurrence"]]
    name: GeoSpecComponentSelector
    path: GeoSpecComponentSelector
    expect: _Cardinality


class _BodySelector(TypedDict, total=False):
    kind: Required[Literal["body"]]
    of: GeoSpecComponentSelector
    query: _BodyQuery
    expect: _Cardinality


class _FaceSelector(TypedDict, total=False):
    kind: Required[Literal["face"]]
    of: GeoSpecComponentSelector
    query: _FaceQuery
    expect: _Cardinality


class _AxisSelector(TypedDict, total=False):
    kind: Required[Literal["axis"]]
    name: GeoSpecComponentSelector
    axis: Literal["x", "y", "z"]
    center: GeoSpecVector
    direction: GeoSpecVector
    radius: float
    tolerance: float


class _PlaneSelector(TypedDict, total=False):
    kind: Required[Literal["plane"]]
    name: GeoSpecComponentSelector
    normal: GeoSpecVector
    offset: float
    tolerance: float


class _NamedSelector(TypedDict, total=False):
    kind: Required[Literal["datum", "interface", "group"]]
    name: Required[str]
    of: GeoSpecComponentSelector
    expect: _Cardinality


GeoSpecGeometrySelector: TypeAlias = "GeoSpecComponentSelector | _OccurrenceSelector | _BodySelector | _FaceSelector | _AxisSelector | _PlaneSelector | _NamedSelector"


class _OccurrenceBounds(TypedDict, total=False):
    within: GeoSpecComponentSelector
    min: GeoSpecPointExpectation
    max: GeoSpecPointExpectation
    center: GeoSpecPointExpectation
    tolerance: float


class _Occurrence(TypedDict, total=False):
    name: Required[GeoSpecComponentSelector]
    count: GeoSpecNumericExpectation
    bounds: _OccurrenceBounds


class GeoSpecAssemblyOccurrencesExpectation(TypedDict, total=False):
    occurrences: Required[Sequence[_Occurrence]]
    uniqueNames: bool


class _Relationship(TypedDict, total=False):
    id: str
    kind: Required[Literal["contact", "clearance", "coaxial", "concentric", "coplanar", "parallel", "perpendicular", "angle", "containment", "insertion", "interference"]]
    subject: Required[GeoSpecGeometrySelector]
    target: Required[GeoSpecGeometrySelector]
    tolerance: float
    angularToleranceDegrees: float
    angleDegrees: float
    axis: GeoSpecVector
    min: float
    max: float
    minVolume: float
    maxVolume: float
    reason: str


class GeoSpecSpatialRelationshipsExpectation(TypedDict):
    relationships: Sequence[_Relationship]


class _CountRule(TypedDict, total=False):
    count: int
    maxCount: int


class _DegenerateRule(_CountRule, total=False):
    areaTolerance: float


class GeoSpecMeshIntegrityExpectation(TypedDict, total=False):
    finitePositions: bool
    degenerateTriangles: _DegenerateRule
    duplicateFaces: _CountRule
    watertight: bool
    triangleCount: GeoSpecNumericExpectation


class GeoSpecNoDiagnosticsExpectation(TypedDict, total=False):
    severities: Sequence[Literal["error", "warning", "info"]]


class _FreeBounds(TypedDict, total=False):
    count: GeoSpecNumericExpectation


class GeoSpecValidBrepExpectation(TypedDict, total=False):
    maxTolerance: float
    freeBounds: _FreeBounds
    minEdgeLength: float
    sameParameter: bool
    closedShells: bool
    closedWires: bool


class GeoSpecMatchers(Protocol):
    """All 26 canonical assertions, synchronous on an admitted owner-thread subject."""

    @property
    def not_(self) -> GeoSpecMatchers: ...
    @overload
    def to_have_bounding_box(self, first: GeoSpecVector, second: GeoSpecVector, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_bounding_box(self, expected: GeoSpecBoundingBoxExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_bounding_box(self, **expected: Unpack[GeoSpecBoundingBoxExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_connected_components(self, expected: GeoSpecConnectedComponentsExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_connected_components(self, **expected: Unpack[GeoSpecConnectedComponentsExpectation]) -> GeoSpecAssertionReport: ...
    def to_be_watertight(self) -> GeoSpecAssertionReport: ...
    def to_have_no_component_interference(self, expected: GeoSpecComponentInterferenceExpectation | None = None, /, **fields: Unpack[GeoSpecComponentInterferenceExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_assembly_occurrences(self, expected: GeoSpecAssemblyOccurrencesExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_assembly_occurrences(self, **expected: Unpack[GeoSpecAssemblyOccurrencesExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_spatial_relationships(self, expected: GeoSpecSpatialRelationshipsExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_spatial_relationships(self, **expected: Unpack[GeoSpecSpatialRelationshipsExpectation]) -> GeoSpecAssertionReport: ...
    def to_have_mesh_integrity(self, expected: GeoSpecMeshIntegrityExpectation | None = None, /, **fields: Unpack[GeoSpecMeshIntegrityExpectation]) -> GeoSpecAssertionReport: ...
    def to_have_no_diagnostics(self, expected: GeoSpecNoDiagnosticsExpectation | None = None, /, **fields: Unpack[GeoSpecNoDiagnosticsExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_surface_area(self, expected: GeoSpecSurfaceAreaExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_surface_area(self, **expected: Unpack[GeoSpecSurfaceAreaExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_volume(self, expected: GeoSpecVolumeExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_volume(self, **expected: Unpack[GeoSpecVolumeExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_mass(self, expected: GeoSpecMassExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_mass(self, **expected: Unpack[GeoSpecMassExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_center_of_mass(self, expected: GeoSpecCenterOfMassExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_center_of_mass(self, **expected: Unpack[GeoSpecCenterOfMassExpectation]) -> GeoSpecAssertionReport: ...
    def to_be_valid_brep(self, expected: GeoSpecValidBrepExpectation | None = None, /, **fields: Unpack[GeoSpecValidBrepExpectation]) -> GeoSpecAssertionReport: ...
    def to_have_topology_counts(self, expected: GeoSpecTopologyCountsExpectation | None = None, /, **fields: Unpack[GeoSpecTopologyCountsExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_step_units(self, expected: GeoSpecStepUnitsExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_step_units(self, **expected: Unpack[GeoSpecStepUnitsExpectation]) -> GeoSpecAssertionReport: ...
    def to_have_product_structure(self, expected: GeoSpecProductStructureExpectation | None = None, /, **fields: Unpack[GeoSpecProductStructureExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_planar_face(self, expected: GeoSpecPlanarFaceExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_planar_face(self, **expected: Unpack[GeoSpecPlanarFaceExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_cylindrical_face(self, expected: GeoSpecCylindricalFaceExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_cylindrical_face(self, **expected: Unpack[GeoSpecCylindricalFaceExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_circular_hole(self, expected: GeoSpecCircularHoleExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_circular_hole(self, **expected: Unpack[GeoSpecCircularHoleExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_circular_hole_pattern(self, expected: GeoSpecCircularHolePatternExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_circular_hole_pattern(self, **expected: Unpack[GeoSpecCircularHolePatternExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_chamfer_feature(self, expected: GeoSpecChamferFeatureExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_chamfer_feature(self, **expected: Unpack[GeoSpecChamferFeatureExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_fillet_feature(self, expected: GeoSpecFilletFeatureExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_fillet_feature(self, **expected: Unpack[GeoSpecFilletFeatureExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_minimum_wall_thickness(self, expected: GeoSpecMinimumWallThicknessExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_minimum_wall_thickness(self, **expected: Unpack[GeoSpecMinimumWallThicknessExpectation]) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_void_continuity(self, expected: GeoSpecVoidContinuityExpectation, /) -> GeoSpecAssertionReport: ...
    @overload
    def to_have_void_continuity(self, **expected: Unpack[GeoSpecVoidContinuityExpectation]) -> GeoSpecAssertionReport: ...
    def to_satisfy_rational_plate(self) -> GeoSpecAssertionReport: ...
    def to_satisfy_parallel_plane_distance(self) -> GeoSpecAssertionReport: ...
