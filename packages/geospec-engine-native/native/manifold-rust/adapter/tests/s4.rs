//! Frozen S4 functional controls. Fixtures are unchanged copies of accepted
//! evidence; this harness never runs the old probes or depends on Brain.
use geospec_engine_native_core::backend::{BackendError, BackendErrorKind, TriangleMesh};
use geospec_engine_native_csg::{FillRule, MeshExport, Section, Solid};
use manifold_rust::{linalg::Vec3, manifold::Manifold, types::MeshGL};
use serde_json::{json, Value};

fn bits(v: f64) -> String {
    format!("{:016x}", v.to_bits())
}
fn cube(origin: [f32; 3], s: f32) -> TriangleMesh {
    let [x, y, z] = origin;
    TriangleMesh {
        positions: [
            [x, y, z],
            [x + s, y, z],
            [x + s, y + s, z],
            [x, y + s, z],
            [x, y, z + s],
            [x + s, y, z + s],
            [x + s, y + s, z + s],
            [x, y + s, z + s],
        ]
        .map(|v| v.map(f64::from))
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
fn unit(x: f32) -> Solid {
    Solid::from_mesh(&cube([x, 0., 0.], 1.)).unwrap()
}
fn mesh_value(mesh: &TriangleMesh) -> Value {
    json!({"meshVertexF32Bits":mesh.positions.iter().flatten().map(|v|format!("{:08x}",(*v as f32).to_bits())).collect::<Vec<_>>(),"meshTriangleIndices":mesh.triangles.iter().flatten().collect::<Vec<_>>()})
}
fn polygon_bits(contours: &[Vec<[f64; 2]>]) -> Value {
    json!(contours
        .iter()
        .map(|r| r.iter().map(|v| v.map(bits)).collect::<Vec<_>>())
        .collect::<Vec<_>>())
}
fn section_value(s: &Section) -> Value {
    json!({"sectionAreaF64Bits":bits(s.signed_area),"componentCount":s.components.len(),"componentAreaF64Bits":s.components.iter().map(|p|bits(p.signed_area)).collect::<Vec<_>>(),"sectionContoursF64Bits":polygon_bits(&s.contours)})
}
fn solid_value(result: Result<Solid, BackendError>) -> Value {
    match result {
        Err(error) => {
            assert_eq!(error.kind, BackendErrorKind::InvalidInput);
            // Status category mapping from the owned adapter error to the
            // historical S4 reference spelling; no geometry exists on failure.
            assert_eq!(error.message, "Not Manifold");
            json!({"statusCode":"Not manifold","isEmpty":true})
        }
        Ok(s) => {
            let mesh = s.to_mesh().unwrap();
            let mut min = [f64::INFINITY; 3];
            let mut max = [f64::NEG_INFINITY; 3];
            for p in &mesh.positions {
                for axis in 0..3 {
                    min[axis] = min[axis].min(p[axis]);
                    max[axis] = max[axis].max(p[axis]);
                }
            }
            json!({"statusCode":"NoError","isEmpty":mesh.triangles.is_empty(),"volumeF64Bits":bits(s.signed_volume().unwrap()),"surfaceAreaF64Bits":bits(s.surface_area().unwrap()),"componentCount":s.decompose().unwrap().len(),"boundsF64Bits":min.into_iter().chain(max).map(bits).collect::<Vec<_>>(),"mesh":mesh_value(&mesh)})
        }
    }
}
fn original14() -> Vec<Vec<[f64; 2]>> {
    vec![
        vec![[0., 0.], [6., 0.], [6., 2.], [0., 2.]],
        vec![[2., 3.], [8., 3.], [8., 5.], [2., 5.]],
        vec![[3., 1.], [3., 4.], [4., 4.], [4., 1.]],
    ]
}
fn concave() -> Vec<Vec<[f64; 2]>> {
    vec![
        vec![
            [0., 0.],
            [8., 0.],
            [8., 8.],
            [5., 8.],
            [5., 3.],
            [3., 3.],
            [3., 8.],
            [0., 8.],
        ],
        vec![[1., 1.], [1., 2.], [2., 2.], [2., 1.]],
        vec![[6., 1.], [6., 2.], [7., 2.], [7., 1.]],
    ]
}
fn actual(id: &str, variant: &str, op: &str) -> Value {
    actual_with_near(id, variant, op, f32::EPSILON)
}
fn actual_with_near(id: &str, variant: &str, op: &str, near: f32) -> Value {
    let a = unit(0.);
    let mut result = match id {
        "S4-05" => {
            let shift = f32::from_bits(if variant.starts_with("gap") {
                1f32.to_bits() + 1
            } else {
                1f32.to_bits() - 1
            });
            let b = unit(shift);
            solid_value(if op == "strict-import" {
                Ok(b)
            } else {
                a.intersection(&b)
            })
        }
        "S4-06" => solid_value(a.intersection(&unit(1. - 2f32.powi(-20)))),
        "S4-08" => {
            let mut input = cube([0.; 3], 1.);
            let duplicate = variant == "duplicate-with-merge";
            input
                .positions
                .push([if duplicate { 0. } else { near as f64 }, 0., 0.]);
            let mut gl = MeshGL {
                num_prop: 3,
                vert_properties: input
                    .positions
                    .iter()
                    .flatten()
                    .map(|v| *v as f32)
                    .collect(),
                tri_verts: input.triangles.iter().flatten().copied().collect(),
                ..Default::default()
            };
            if duplicate {
                gl.merge_from_vert.push(8);
                gl.merge_to_vert.push(0);
            }
            let changed = gl.merge();
            assert_eq!(gl.merge_from_vert, if duplicate { vec![8] } else { vec![] });
            assert_eq!(gl.merge_to_vert, if duplicate { vec![0] } else { vec![] });
            if op == "merge" {
                json!({"mergeApplied":changed,"mesh":mesh_value(&input)})
            } else {
                let merges: Vec<_> = gl
                    .merge_from_vert
                    .iter()
                    .zip(gl.merge_to_vert.iter())
                    .map(|(&f, &t)| [f, t])
                    .collect();
                solid_value(Solid::from_mesh_with_merge(&input, &merges))
            }
        }
        "S4-09" => {
            let mut input = cube([0.; 3], 1.);
            if variant == "all-reversed" {
                for tri in &mut input.triangles {
                    tri.swap(1, 2);
                }
            } else {
                input.triangles[0].swap(1, 2);
            }
            solid_value(Solid::from_mesh(&input))
        }
        "S4-10" => {
            let mut input = cube([0.; 3], 1.);
            let b = cube([0.5, 0., 0.], 1.);
            input.positions.extend(b.positions);
            input
                .triangles
                .extend(b.triangles.into_iter().map(|t| t.map(|i| i + 8)));
            let s = Solid::from_mesh(&input).unwrap();
            solid_value(if op == "strict-import" {
                Ok(s)
            } else {
                s.intersection(&a)
            })
        }
        "S4-11" => {
            let size = 2f32.powi(if variant.starts_with("tiny") { -20 } else { 20 });
            let s = Solid::from_mesh(&cube([0.; 3], size)).unwrap();
            if op == "decompose-2d" {
                section_value(&s.slice((size / 2.) as f64).unwrap())
            } else {
                solid_value(Ok(s))
            }
        }
        "S4-12" => {
            let mut inputs = if variant.starts_with("eight") {
                (0..8).map(|i| unit(i as f32 * 2.)).collect::<Vec<_>>()
            } else {
                vec![a.clone(), a.clone(), a.clone()]
            };
            if variant.ends_with("reverse") {
                inputs.reverse();
            }
            if variant == "three-equal-permutation" {
                inputs = vec![inputs[2].clone(), inputs[0].clone(), inputs[1].clone()];
            }
            if variant == "equal-vertex-order-rotated" {
                let mut input = cube([0.; 3], 1.);
                input.positions.rotate_right(3);
                for tri in &mut input.triangles {
                    *tri = tri.map(|i| (i + 3) % 8);
                }
                inputs[1] = Solid::from_mesh(&input).unwrap();
            }
            solid_value(if op == "nary-union" {
                Solid::union_all(&inputs)
            } else {
                Solid::difference_all(&inputs)
            })
        }
        "S4-13" => section_value(&Section::from_contours(&concave(), FillRule::Positive).unwrap()),
        "S4-14" => {
            section_value(&Section::from_contours(&original14(), FillRule::Positive).unwrap())
        }
        "S4-23" => {
            if variant == "after-64-unrelated-allocations" {
                for i in 0..64 {
                    let _ = Manifold::cube(Vec3::new(1., 1., 1.), true)
                        .translate(Vec3::new(i as f64, 0., 0.));
                }
            }
            solid_value(a.intersection(&unit(0.5)))
        }
        _ => panic!("unknown frozen row {id}/{variant}/{op}"),
    };
    let object = result.as_object_mut().unwrap();
    object.insert("fixtureId".into(), json!(id));
    object.insert("variantId".into(), json!(variant));
    object.insert("operation".into(), json!(op));
    object.insert("processRun".into(), json!(0));
    result
}

#[test]
fn frozen_s4_matrix() {
    let frozen: Value = serde_json::from_str(include_str!("fixtures/matrix.json")).unwrap();
    let mut failures = Vec::new();
    for row in frozen["records"].as_array().unwrap() {
        let key = &row["key"];
        let id = key[0].as_str().unwrap();
        let variant = key[1].as_str().unwrap();
        let op = key[2].as_str().unwrap();
        let observed = actual(id, variant, op);
        let expected = &row["wasm"];
        let exploratory = variant == "equal-vertex-order-rotated";
        let mismatched_input =
            id == "S4-08" && variant == "near-duplicate-no-merge" && op == "merge";
        let disposition = if exploratory {
            "exploratory"
        } else if mismatched_input {
            "frozen-input-mismatch"
        } else if observed == *expected {
            "match"
        } else {
            "mismatch"
        };
        println!(
            "S4-RECORD {}",
            json!({"key":key,"disposition":disposition,"expected":expected,"actual":observed})
        );
        if disposition == "mismatch" {
            failures.push(key.clone());
        }
        if mismatched_input {
            assert_eq!(observed, row["rust"]);
        }
    }
    assert!(failures.is_empty(), "frozen row mismatches: {failures:?}");
}

fn fill_value(id: &str, section: &Section) -> Value {
    json!({"id":id,"areaF64Bits":bits(section.signed_area),"normalizedContoursF64Bits":polygon_bits(&section.contours),"componentCount":section.components.len(),"componentAreasF64Bits":section.components.iter().map(|p|bits(p.signed_area)).collect::<Vec<_>>(),"componentContoursF64Bits":section.components.iter().map(|p| {let mut rings=vec![p.outer.clone()];rings.extend(p.holes.clone());polygon_bits(&rings)}).collect::<Vec<_>>()})
}
#[test]
fn frozen_fill_and_polytree_controls() {
    let frozen: Value = serde_json::from_str(include_str!("fixtures/fill.json")).unwrap();
    let bbox = vec![
        vec![[0., 0.], [10., 0.], [0., 10.]],
        vec![[3., 8.], [8., 3.], [9., 9.]],
        vec![[4., 4.], [4., 4.5], [4.5, 4.5], [4.5, 4.]],
    ];
    let mut failures = vec![];
    for (id, contours, rule, expected) in [
        (
            "S4-FILL-01",
            original14(),
            FillRule::NonZero,
            &frozen["records"][0]["wasm"],
        ),
        (
            "S4-FILL-02",
            original14(),
            FillRule::Positive,
            &frozen["referenceDefaultPositive"],
        ),
        (
            "S4-BBOX-01",
            bbox,
            FillRule::Positive,
            &frozen["records"][1]["wasm"],
        ),
    ] {
        let observed = fill_value(id, &Section::from_contours(&contours, rule).unwrap());
        println!(
            "S4-RECORD {}",
            json!({"key":id,"expected":expected,"actual":observed,"disposition":if observed==*expected {"match"} else {"mismatch"}})
        );
        if observed != *expected {
            failures.push(id);
        }
    }
    assert!(failures.is_empty(), "fill/tree mismatches: {failures:?}");
}

#[test]
fn matched_reference_epsilon_control() {
    // Principal ruling execution/w4-s4-08-input-correction.json: predeclared
    // reference input is exactly 2^-52, not the original Rust f32::EPSILON.
    let near = 2f32.powi(-52);
    assert_eq!(near.to_bits(), 0x25800000);
    let frozen: Value = serde_json::from_str(include_str!("fixtures/matrix.json")).unwrap();
    let row = frozen["records"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["key"] == json!(["S4-08", "near-duplicate-no-merge", "merge", 0]))
        .unwrap();
    let observed = actual_with_near("S4-08", "near-duplicate-no-merge", "merge", near);
    println!(
        "S4-RECORD {}",
        json!({"key":"W4-S4-08-matched-reference-epsilon","expected":row["wasm"],"actual":observed,"disposition":if observed==row["wasm"] {"match"} else {"mismatch"}})
    );
    assert_eq!(observed, row["wasm"]);
}

#[test]
fn owned_adapter_rejects_invalid_mesh_without_successful_geometry() {
    let mut input = cube([0.; 3], 1.);
    input.triangles[0][0] = 99;
    let error = Solid::from_mesh(&input).err().unwrap();
    assert_eq!(
        error,
        BackendError {
            kind: BackendErrorKind::InvalidInput,
            message: "Vertex Out of Bounds".into()
        }
    );
    assert_eq!(
        Solid::from_mesh_with_merge(&cube([0.; 3], 1.), &[[8, 0]])
            .err()
            .unwrap()
            .message,
        "Merge Index Out of Bounds"
    );
}

#[test]
fn export_and_reimport_keep_mesh_and_merge_order() {
    let s = unit(0.);
    let first = s.export().unwrap();
    assert_eq!(first.merge_from, Vec::<u32>::new());
    assert_eq!(first.merge_to, Vec::<u32>::new());
    let second = Solid::from_mesh(&first.mesh).unwrap().export().unwrap();
    assert_eq!(first, second);
    let MeshExport { mesh, .. } = first;
    assert_eq!(mesh.triangles.len(), 12);
}
