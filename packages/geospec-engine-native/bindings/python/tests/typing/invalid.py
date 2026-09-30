"""Every statement below must fail a static checker (negative consumer fixture)."""

from geospec import GeoSpecSubject, expect_geo, load_model


def author(subject: GeoSpecSubject) -> None:
    match = expect_geo(subject)
    match.to_have_bouding_box({})
    match.to_have_bounding_box(size_x=1)
    match.to_have_bounding_box(size={"xx": 1})
    match.to_have_step_units(unit="millimetrs")
    match.to_have_spatial_relationships(relationships=[{"kind": "clearence", "subject": "shaft", "target": "bore"}])
    match.to_have_spatial_relationships(relationships=[{"kind": "clearance", "subject": {"kind": "body", "query": {"radius": 2}}, "target": "bore"}])
    match.to_have_circular_hole_pattern(count=4, hole_diameter=1)
    match.to_satisfy_rational_plate({})
    load_model(file="main.ts", source_unit="millimetrs")
    load_model(file="main.ts", mesh_linear_tolernce=0.1)
