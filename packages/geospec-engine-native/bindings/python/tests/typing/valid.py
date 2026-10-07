"""Published-shaped positive consumer fixture; compile, do not run geometry."""

from geospec import (
    GeoSpecAssertionReport, GeoSpecBoundingBoxExpectation, GeoSpecLoadModelOptions,
    GeoSpecModelArtifact, GeoSpecSubject, expect_geo, load_model,
)


def host(request: GeoSpecLoadModelOptions) -> GeoSpecModelArtifact:
    return GeoSpecModelArtifact(b"export", request.get("format", "glb"), "mm", consumed_sources=(("main.ts", b"source"),))


def author(subject: GeoSpecSubject) -> GeoSpecAssertionReport:
    load_model(file="main.ts", code={"main.ts": "model"}, parameters={"part_id": "literal"}, format="step", mesh=False)
    load_model(source=b"geometry", format="gltf", source_unit="cm", resources=[{"name": "mesh.bin", "source": b"mesh"}])
    expected: GeoSpecBoundingBoxExpectation = {"size": {"x": {"greaterThan": 1}}, "tolerance": 0.1}
    match = expect_geo(subject)
    match.to_have_bounding_box(expected)
    match.to_have_bounding_box((0, 0, 0), (1, 1, 1))
    match.to_have_bounding_box(size={"x": 1}, tolerance=0.1)
    match.not_.to_have_connected_components(count=1, toleranceMm=0.1)
    match.to_be_watertight()
    match.to_have_no_component_interference(allowances=[{"left": "shaft_id", "right": "bore_id", "reason": "press_fit", "maxVolume": 1}])
    match.to_have_assembly_occurrences(occurrences=[{"name": "part_id", "bounds": {"within": "envelope_id"}}], uniqueNames=True)
    match.to_have_spatial_relationships(relationships=[{"kind": "clearance", "subject": {"kind": "face", "of": "part_id", "query": {"surfaceType": "plane", "normal": {"direction": [0, 0, 1]}}}, "target": {"kind": "interface", "name": "seat_id"}, "min": 1}])
    match.to_have_mesh_integrity(finitePositions=True, degenerateTriangles={"count": 0, "areaTolerance": 0.01}, duplicateFaces={"maxCount": 0}, triangleCount={"greaterThan": 0})
    match.to_have_no_diagnostics(severities=["error", "warning"])
    match.to_have_surface_area(value={"greaterThan": 0})
    match.to_have_volume(value=10, tolerance=0.1)
    match.to_have_mass(value=10, density=1, tolerance=0.1)
    match.to_have_center_of_mass(point={"x": 1})
    match.to_be_valid_brep(maxTolerance=0.1, closedShells=True, freeBounds={"count": 0})
    match.to_have_topology_counts(solids=1, faces={"greaterThan": 0})
    match.to_have_step_units(unit="mm")
    match.to_have_product_structure(names=["part_id"], count=1)
    match.to_have_planar_face(normal=[0, 0, 1], offset=1, area={"lessThanOrEqual": 20})
    match.to_have_cylindrical_face(radius=1, axis="x")
    match.to_have_circular_hole(diameter=1, through=True, center={"x": 1})
    match.to_have_circular_hole_pattern(count=4, holeDiameter=1, boltCircleDiameter=5)
    match.to_have_chamfer_feature(distance=1, selection="edge_id")
    match.to_have_fillet_feature(radius=1, selection="edge_id")
    match.to_have_minimum_wall_thickness(value={"greaterThan": 1})
    match.to_have_void_continuity(path=[[0, 0, 0], {"occurrence": "port_id"}], minCrossSection=1, isolatedFrom=[[1, 1, 1]])
    match.to_satisfy_rational_plate()
    return match.to_satisfy_parallel_plane_distance()
