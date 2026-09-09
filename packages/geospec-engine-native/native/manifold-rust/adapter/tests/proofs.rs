use geospec_engine_native_core::backend::{
    csg::{BooleanOp, CsgConnector, FillRule, Section, SectionOp, SolidProperties},
    BackendErrorKind, TriangleMesh,
};
use geospec_engine_native_csg::ManifoldCsgConnector;
use serde_json::{json, Value};

const TOLERANCE: f64 = 1e-12;

fn cuboid(origin: [f32; 3], size: [f32; 3]) -> TriangleMesh {
    let [x, y, z] = origin;
    let [width, depth, height] = size;
    TriangleMesh {
        positions: [
            [x, y, z],
            [x + width, y, z],
            [x + width, y + depth, z],
            [x, y + depth, z],
            [x, y, z + height],
            [x + width, y, z + height],
            [x + width, y + depth, z + height],
            [x, y + depth, z + height],
        ]
        .map(|point| point.map(f64::from))
        .to_vec(),
        triangles: vec![
            [0, 2, 1],
            [0, 3, 2],
            [4, 5, 6],
            [4, 6, 7],
            [0, 1, 5],
            [0, 5, 4],
            [1, 2, 6],
            [1, 6, 5],
            [2, 3, 7],
            [2, 7, 6],
            [3, 0, 4],
            [3, 4, 7],
        ],
    }
}

fn triangle_soup(mesh: &TriangleMesh) -> TriangleMesh {
    let mut positions = Vec::with_capacity(mesh.triangles.len() * 3);
    let mut triangles = Vec::with_capacity(mesh.triangles.len());
    for triangle in &mesh.triangles {
        let start = positions.len() as u32;
        positions.extend(triangle.map(|index| mesh.positions[index as usize]));
        triangles.push([start, start + 1, start + 2]);
    }
    TriangleMesh {
        positions,
        triangles,
    }
}

fn square(min: f64, max: f64) -> Vec<[f64; 2]> {
    vec![[min, min], [max, min], [max, max], [min, max]]
}

fn rectangle(min: [f64; 2], max: [f64; 2]) -> Vec<[f64; 2]> {
    vec![min, [max[0], min[1]], max, [min[0], max[1]]]
}

fn close(actual: f64, expected: f64) -> bool {
    (actual - expected).abs() <= TOLERANCE
}

fn properties_value(properties: SolidProperties) -> Value {
    json!({
        "signedVolume": properties.signed_volume,
        "surfaceArea": properties.surface_area,
        "bounds": properties.bounds.map(|bounds| json!({"min":bounds.min,"max":bounds.max})),
        "isEmpty": properties.is_empty,
    })
}

fn section_value(section: &Section) -> Value {
    json!({
        "signedArea": section.signed_area,
        "contours": section.contours,
        "components": section.components.iter().map(|component| json!({
            "outer": component.outer,
            "holes": component.holes,
            "signedArea": component.signed_area,
        })).collect::<Vec<_>>(),
    })
}

fn record(id: &str, expected: Value, actual: Value, passed: bool) -> bool {
    println!(
        "A1-RECORD {}",
        json!({
            "id": id,
            "expected": expected,
            "actual": actual,
            "disposition": if passed { "match" } else { "mismatch" },
        })
    );
    passed
}

#[test]
#[ignore = "held S10 lifetime and misuse scope"]
fn opaque_arena_rejects_released_ids_and_reuses_the_slot_with_a_new_generation() {
    let mut connector = ManifoldCsgConnector::new();
    let released = connector.admit(&cuboid([0.0; 3], [1.0; 3]), &[]).unwrap();
    connector.release(released).unwrap();
    let error = connector.properties(released).unwrap_err();
    let reused = connector.admit(&cuboid([0.0; 3], [1.0; 3]), &[]).unwrap();
    let actual = json!({
        "releasedIdRejected": error.kind == BackendErrorKind::InvalidInput
            && error.message == "Unknown or Released Solid",
        "slotReused": reused.slot() == released.slot(),
        "generationIncremented": reused.generation() == released.generation() + 1,
    });
    let expected = json!({
        "releasedIdRejected": true,
        "slotReused": true,
        "generationIncremented": true,
    });
    assert!(record(
        "A1-ARENA-01",
        expected.clone(),
        actual.clone(),
        actual == expected,
    ));
}

#[test]
fn exact_nary_booleans_transform_properties_decompose_and_slice_match_controls() {
    let mut connector = ManifoldCsgConnector::new();
    let mut matched = true;

    let union_operands = [4.0, 0.0, 2.0].map(|x| {
        connector
            .admit(&cuboid([x, 0.0, 0.0], [1.0; 3]), &[])
            .unwrap()
    });
    let union = connector
        .boolean(BooleanOp::Union, &union_operands)
        .unwrap();
    let union_properties = connector.properties(union).unwrap();
    let union_parts = connector.decompose(union).unwrap();
    let component_bounds: Vec<_> = union_parts
        .iter()
        .map(|&part| connector.properties(part).unwrap().bounds.unwrap().min[0])
        .collect();
    let expected = json!({
        "signedVolume": 3.0,
        "bounds": {"min":[0.0,0.0,0.0],"max":[5.0,1.0,1.0]},
        "componentBoundsMinXInNativeOrder": [0.0,2.0,4.0],
    });
    let actual = json!({
        "signedVolume": union_properties.signed_volume,
        "bounds": union_properties.bounds.map(|bounds| json!({"min":bounds.min,"max":bounds.max})),
        "componentBoundsMinXInNativeOrder": component_bounds,
    });
    let passed = close(union_properties.signed_volume, 3.0)
        && union_properties.bounds.unwrap().min == [0.0, 0.0, 0.0]
        && union_properties.bounds.unwrap().max == [5.0, 1.0, 1.0]
        && component_bounds == [0.0, 2.0, 4.0];
    matched &= record("A1-UNION-01", expected, actual, passed);

    let outer = connector.admit(&cuboid([0.0; 3], [3.0; 3]), &[]).unwrap();
    let inner = connector.admit(&cuboid([1.0; 3], [1.0; 3]), &[]).unwrap();
    let difference = connector
        .boolean(BooleanOp::Difference, &[outer, inner])
        .unwrap();
    let difference_properties = connector.properties(difference).unwrap();
    let difference_slice = connector.slice(difference, 1.5).unwrap();
    let expected_contours = vec![
        vec![
            [3.0, 1.5],
            [3.0, 3.0],
            [1.5, 3.0],
            [0.0, 3.0],
            [0.0, 1.5],
            [0.0, 0.0],
            [1.5, 0.0],
            [3.0, 0.0],
        ],
        vec![
            [1.0, 1.5],
            [1.0, 2.0],
            [1.5, 2.0],
            [2.0, 2.0],
            [2.0, 1.5],
            [2.0, 1.0],
            [1.5, 1.0],
            [1.0, 1.0],
        ],
    ];
    let expected = json!({
        "properties": {
            "signedVolume":26.0,
            "surfaceArea":60.0,
            "bounds":{"min":[0.0,0.0,0.0],"max":[3.0,3.0,3.0]},
            "isEmpty":false,
        },
        "sliceAtZ1_5": {
            "signedArea":8.0,
            "componentCount":1,
            "holeCounts":[1],
            "contours":expected_contours,
        },
    });
    let actual = json!({
        "properties": properties_value(difference_properties),
        "sliceAtZ1_5": {
            "signedArea":difference_slice.signed_area,
            "componentCount":difference_slice.components.len(),
            "holeCounts":difference_slice.components.iter().map(|component|component.holes.len()).collect::<Vec<_>>(),
            "contours":difference_slice.contours,
        },
    });
    let passed = close(difference_properties.signed_volume, 26.0)
        && close(difference_properties.surface_area, 60.0)
        && difference_properties.bounds.unwrap().min == [0.0; 3]
        && difference_properties.bounds.unwrap().max == [3.0; 3]
        && close(difference_slice.signed_area, 8.0)
        && difference_slice.components.len() == 1
        && difference_slice.components[0].holes.len() == 1
        && difference_slice.contours == expected_contours;
    matched &= record("A1-DIFFERENCE-01", expected, actual, passed);

    let first = connector.admit(&cuboid([0.0; 3], [1.0; 3]), &[]).unwrap();
    let second = connector.admit(&cuboid([0.0; 3], [1.0; 3]), &[]).unwrap();
    let overlap = 2f64.powi(-20);
    let translated = connector
        .transform(
            second,
            [
                1.0,
                0.0,
                0.0,
                1.0 - overlap,
                0.0,
                1.0,
                0.0,
                0.0,
                0.0,
                0.0,
                1.0,
                0.0,
            ],
        )
        .unwrap();
    let intersection = connector
        .boolean(BooleanOp::Intersection, &[first, translated, first])
        .unwrap();
    let intersection_properties = connector.properties(intersection).unwrap();
    let expected = json!({
        "signedVolume":overlap,
        "bounds":{"min":[1.0-overlap,0.0,0.0],"max":[1.0,1.0,1.0]},
    });
    let actual = json!({
        "signedVolume":intersection_properties.signed_volume,
        "bounds":intersection_properties.bounds.map(|bounds|json!({"min":bounds.min,"max":bounds.max})),
    });
    let passed = close(intersection_properties.signed_volume, overlap)
        && intersection_properties.bounds.unwrap().min == [1.0 - overlap, 0.0, 0.0]
        && intersection_properties.bounds.unwrap().max == [1.0, 1.0, 1.0];
    matched &= record("A1-INTERSECTION-01", expected, actual, passed);

    let transformed = connector
        .transform(
            first,
            [2.0, 0.0, 0.0, 0.5, 0.0, 3.0, 0.0, -1.0, 0.0, 0.0, 4.0, 2.0],
        )
        .unwrap();
    let transformed_properties = connector.properties(transformed).unwrap();
    let expected = json!({
        "signedVolume":24.0,
        "surfaceArea":52.0,
        "bounds":{"min":[0.5,-1.0,2.0],"max":[2.5,2.0,6.0]},
        "isEmpty":false,
    });
    let actual = properties_value(transformed_properties);
    let passed = close(transformed_properties.signed_volume, 24.0)
        && close(transformed_properties.surface_area, 52.0)
        && transformed_properties.bounds.unwrap().min == [0.5, -1.0, 2.0]
        && transformed_properties.bounds.unwrap().max == [2.5, 2.0, 6.0];
    matched &= record("A1-TRANSFORM-01", expected, actual, passed);

    let distant = connector
        .admit(&cuboid([2.0, 0.0, 0.0], [1.0; 3]), &[])
        .unwrap();
    let empty = connector
        .boolean(BooleanOp::Intersection, &[first, distant])
        .unwrap();
    let empty_properties = connector.properties(empty).unwrap();
    let expected = json!({
        "signedVolume":0.0,
        "surfaceArea":0.0,
        "bounds":null,
        "isEmpty":true,
    });
    let actual = properties_value(empty_properties);
    matched &= record(
        "A1-EMPTY-01",
        expected.clone(),
        actual.clone(),
        actual == expected,
    );
    assert!(matched, "one or more A1 solid controls mismatched");
}

#[test]
fn mesh_export_keeps_native_order_and_reports_merge_output() {
    let mut connector = ManifoldCsgConnector::new();
    let mut input = cuboid([0.0; 3], [1.0; 3]);
    input.positions.push([0.0; 3]);
    let solid = connector.admit(&input, &[[8, 0]]).unwrap();
    let export = connector.export(solid).unwrap();
    let expected_positions = vec![
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 1.0],
        [0.0, 1.0, 0.0],
        [0.0, 1.0, 1.0],
        [1.0, 0.0, 0.0],
        [1.0, 0.0, 1.0],
        [1.0, 1.0, 0.0],
        [1.0, 1.0, 1.0],
    ];
    let expected_triangles = vec![
        [2, 0, 1],
        [0, 5, 1],
        [0, 2, 6],
        [6, 2, 3],
        [2, 1, 3],
        [1, 7, 3],
        [0, 4, 5],
        [0, 6, 4],
        [1, 5, 7],
        [4, 7, 5],
        [4, 6, 7],
        [6, 3, 7],
    ];
    let expected = json!({
        "mesh":{"positions":expected_positions,"triangles":expected_triangles},
        "mergeFrom":[],
        "mergeTo":[],
        "signedVolume":1.0,
    });
    let volume = connector.properties(solid).unwrap().signed_volume;
    let actual = json!({
        "mesh":{"positions":export.mesh.positions,"triangles":export.mesh.triangles},
        "mergeFrom":export.merge_from,
        "mergeTo":export.merge_to,
        "signedVolume":volume,
    });
    let passed = export.mesh.positions == expected_positions
        && export.mesh.triangles == expected_triangles
        && export.merge_from.is_empty()
        && export.merge_to.is_empty()
        && close(volume, 1.0);
    assert!(record("A1-MESH-01", expected, actual, passed));

    let soup_input = triangle_soup(&cuboid([0.0; 3], [1.0; 3]));
    let soup = connector.admit(&soup_input, &[]).unwrap();
    let soup_export = connector.export(soup).unwrap();
    let soup_properties = connector.properties(soup).unwrap();
    let expected = json!({
        "inputPositionCount":36,
        "mesh":{"positions":expected_positions,"triangles":expected_triangles},
        "mergeFrom":[],
        "mergeTo":[],
        "properties":{
            "signedVolume":1.0,
            "surfaceArea":6.0,
            "bounds":{"min":[0.0,0.0,0.0],"max":[1.0,1.0,1.0]},
            "isEmpty":false,
        },
    });
    let actual = json!({
        "inputPositionCount":soup_input.positions.len(),
        "mesh":{"positions":soup_export.mesh.positions,"triangles":soup_export.mesh.triangles},
        "mergeFrom":soup_export.merge_from,
        "mergeTo":soup_export.merge_to,
        "properties":properties_value(soup_properties),
    });
    assert!(record(
        "A1-MESH-SOUP-01",
        expected.clone(),
        actual.clone(),
        actual == expected,
    ));
}

#[test]
fn section_constructor_and_precision_six_booleans_preserve_membership_and_order() {
    let connector = ManifoldCsgConnector::new();
    let mut matched = true;
    let outer = square(0.0, 4.0);
    let hole = vec![[1.0, 1.0], [1.0, 3.0], [3.0, 3.0], [3.0, 1.0]];
    let expected_constructor_contours = vec![
        vec![[4.0, 4.0], [0.0, 4.0], [0.0, 0.0], [4.0, 0.0]],
        vec![[1.0, 3.0], [3.0, 3.0], [3.0, 1.0], [1.0, 1.0]],
    ];
    let donut = connector
        .section(&[outer.clone(), hole.clone()], FillRule::Positive)
        .unwrap();
    let expected = json!({
        "signedArea":12.0,
        "contours":expected_constructor_contours,
        "components":[{
            "outer":expected_constructor_contours[0],
            "holes":[expected_constructor_contours[1]],
            "signedArea":12.0,
        }],
    });
    let actual = section_value(&donut);
    let passed = close(donut.signed_area, 12.0)
        && donut.components.len() == 1
        && donut.components[0].holes.len() == 1
        && donut.contours == expected_constructor_contours;
    matched &= record("A1-SECTION-01", expected, actual, passed);

    let left = connector
        .section(&[square(0.0, 2.0)], FillRule::Positive)
        .unwrap();
    let right = connector
        .section(&[square(1.0, 3.0)], FillRule::Positive)
        .unwrap();
    let union = connector
        .section_boolean(SectionOp::Union, &left, &right)
        .unwrap();
    let expected_union_contours = vec![vec![
        [2.0, 1.0],
        [3.0, 1.0],
        [3.0, 3.0],
        [1.0, 3.0],
        [1.0, 2.0],
        [0.0, 2.0],
        [0.0, 0.0],
        [2.0, 0.0],
    ]];
    let expected = json!({
        "signedArea":7.0,
        "contours":expected_union_contours,
        "components":[{
            "outer":expected_union_contours[0],
            "holes":[],
            "signedArea":7.0,
        }],
    });
    let actual = section_value(&union);
    let passed = close(union.signed_area, 7.0)
        && union.components.len() == 1
        && union.contours == expected_union_contours;
    matched &= record("A1-SECTION-UNION-01", expected, actual, passed);

    let thin_left = connector
        .section(&[rectangle([0.0, 0.0], [2.0, 1.0])], FillRule::Positive)
        .unwrap();
    let thin_right = connector
        .section(
            &[rectangle([2.0 - 9e-7, 0.0], [3.0, 1.0])],
            FillRule::Positive,
        )
        .unwrap();
    let thin = connector
        .section_boolean(SectionOp::Intersection, &thin_left, &thin_right)
        .unwrap();
    let expected_thin_contours = vec![vec![
        [2.0, 1.0],
        [1.9999990984797478, 1.0],
        [1.9999990984797478, 0.0],
        [2.0, 0.0],
    ]];
    let expected = json!({
        "signedArea":9.015202522277832e-7,
        "contours":expected_thin_contours,
        "components":[{
            "outer":expected_thin_contours[0],
            "holes":[],
            "signedArea":9.015202522277832e-7,
        }],
    });
    let actual = section_value(&thin);
    let thin_x_bounds = thin.contours[0]
        .iter()
        .fold([f64::INFINITY, f64::NEG_INFINITY], |bounds, point| {
            [bounds[0].min(point[0]), bounds[1].max(point[0])]
        });
    let passed = thin.signed_area == 9.015202522277832e-7
        && thin.components.len() == 1
        && thin_x_bounds == [1.9999990984797478, 2.0]
        && thin.contours == expected_thin_contours;
    matched &= record("A1-SECTION-INTERSECTION-01", expected, actual, passed);

    let full = connector
        .section(&[outer.clone()], FillRule::Positive)
        .unwrap();
    let cut = connector
        .section(&[square(1.0, 3.0)], FillRule::Positive)
        .unwrap();
    let difference = connector
        .section_boolean(SectionOp::Difference, &full, &cut)
        .unwrap();
    let expected_difference_contours = vec![
        vec![[4.0, 4.0], [0.0, 4.0], [0.0, 0.0], [4.0, 0.0]],
        hole.clone(),
    ];
    let expected = json!({
        "signedArea":12.0,
        "contours":expected_difference_contours,
        "components":[{
            "outer":expected_difference_contours[0],
            "holes":[expected_constructor_contours[1]],
            "signedArea":12.0,
        }],
    });
    let actual = section_value(&difference);
    let passed = close(difference.signed_area, 12.0)
        && difference.components.len() == 1
        && difference.components[0].holes.len() == 1
        && difference.contours == expected_difference_contours;
    matched &= record("A1-SECTION-DIFFERENCE-01", expected, actual, passed);

    let rightmost = connector
        .section(&[rectangle([4.0, 0.0], [5.0, 1.0])], FillRule::Positive)
        .unwrap();
    let leftmost = connector
        .section(&[square(0.0, 1.0)], FillRule::Positive)
        .unwrap();
    let disjoint = connector
        .section_boolean(SectionOp::Union, &rightmost, &leftmost)
        .unwrap();
    let expected_contours = vec![
        vec![[1.0, 1.0], [0.0, 1.0], [0.0, 0.0], [1.0, 0.0]],
        vec![[5.0, 1.0], [4.0, 1.0], [4.0, 0.0], [5.0, 0.0]],
    ];
    let component_order: Vec<_> = disjoint
        .components
        .iter()
        .map(|component| {
            component
                .outer
                .iter()
                .map(|point| point[0])
                .fold(f64::INFINITY, f64::min)
        })
        .collect();
    let expected = json!({
        "section":{
            "signedArea":2.0,
            "contours":expected_contours,
            "components":[
                {
                    "outer":expected_contours[1],
                    "holes":[],
                    "signedArea":1.0,
                },
                {
                    "outer":expected_contours[0],
                    "holes":[],
                    "signedArea":1.0,
                },
            ],
        },
        "componentBoundsMinXInNativeOrder":[4.0,0.0],
    });
    let actual = json!({
        "section":section_value(&disjoint),
        "componentBoundsMinXInNativeOrder":component_order,
    });
    let passed = disjoint.contours == expected_contours && component_order == [4.0, 0.0];
    matched &= record("A1-SECTION-ORDER-01", expected, actual, passed);
    assert!(matched, "one or more A1 section controls mismatched");
}
