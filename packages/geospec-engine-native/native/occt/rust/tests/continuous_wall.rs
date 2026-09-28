use geospec_engine_native_core::backend::BackendErrorKind;
use geospec_engine_native_occt::{
    BrepEntity, BrepSubject, ContinuousWallDomain, ContinuousWallShape, Document,
};
use std::path::PathBuf;

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("preserved AP242 fixture")
}

// Complete numeric/ordinal certificate observations; no serializer dependency
// or public evidence schema is added by this adapter test.
fn observe(name: &str, value: &ContinuousWallDomain) {
    let tolerance = value.maximum_topology_tolerance_mm;
    let body = match &value.domain {
        ContinuousWallShape::AxisAlignedBox {
            corners,
            face_indices,
            face_corner_indices,
            outward_normals,
            opposite_face_pairs,
            edge_lengths,
        } => {
            eprintln!(
                "BITS {name} tolerance={} corners={:?} normals={:?} lengths={:?}",
                tolerance.to_bits(),
                corners.map(|p| p.map(f64::to_bits)),
                outward_normals.map(|p| p.map(f64::to_bits)),
                edge_lengths.map(f64::to_bits)
            );
            format!(
                concat!(
                    "{{\"kind\":\"axis-aligned-box\",\"corners\":{:?},",
                    "\"faceIndices\":{:?},\"faceCornerIndices\":{:?},\"outwardNormals\":{:?},",
                    "\"oppositeFacePairs\":{:?},\"edgeLengths\":{:?}}}"
                ),
                corners,
                face_indices,
                face_corner_indices,
                outward_normals,
                opposite_face_pairs,
                edge_lengths
            )
        }
        ContinuousWallShape::RightCircularCylinder {
            origin,
            axis,
            radius,
            from,
            to,
            lateral_face,
            cap_faces,
            lateral_parameter_bounds,
            rim_centers,
            rim_radii,
            rim_edge_indices,
            seam_edge_index,
            periodic_attachment,
        } => {
            eprintln!("PERIODIC_ATTACHMENT {name} {periodic_attachment:?}");
            eprintln!("BITS {name} tolerance={} origin={:?} axis={:?} radius={} from={} to={} uv={:?} centers={:?} radii={:?}",
                tolerance.to_bits(), origin.map(f64::to_bits), axis.map(f64::to_bits),
                radius.to_bits(), from.to_bits(), to.to_bits(), lateral_parameter_bounds.map(f64::to_bits),
                rim_centers.map(|p| p.map(f64::to_bits)), rim_radii.map(f64::to_bits));
            format!(concat!("{{\"kind\":\"right-circular-cylinder\",\"origin\":{:?},",
                "\"axis\":{:?},\"radius\":{:?},\"from\":{:?},\"to\":{:?},",
                "\"lateralFace\":{},\"capFaces\":{:?},\"lateralParameterBounds\":{:?},",
                "\"rimCenters\":{:?},\"rimRadii\":{:?},\"rimEdgeIndices\":{:?},\"seamEdgeIndex\":{}}}"),
                origin, axis, radius, from, to, lateral_face, cap_faces, lateral_parameter_bounds,
                rim_centers, rim_radii, rim_edge_indices, seam_edge_index)
        }
    };
    eprintln!(
        "CERTIFICATE {name} {{\"maximumTopologyToleranceMm\":{tolerance:?},\"domain\":{body}}}"
    );
}

#[test]
fn authored_box_has_complete_directed_rectangle_certificate() {
    // Frozen from export_ap242.py: centered build123d Box(10,20,30).
    let doc = Document::from_step(&fixture("ap242-box.step")).unwrap();
    let faces = doc.faces().unwrap();
    let value = doc.continuous_wall_domain(BrepEntity::Whole).unwrap();
    observe("ap242-box.step", &value);
    assert_eq!(
        Some(value.maximum_topology_tolerance_mm),
        doc.validity().unwrap().max_tolerance
    );
    assert_eq!(
        value,
        doc.continuous_wall_domain(BrepEntity::Whole).unwrap()
    );
    let ContinuousWallShape::AxisAlignedBox {
        corners,
        face_indices,
        face_corner_indices,
        outward_normals,
        opposite_face_pairs,
        edge_lengths,
    } = value.domain
    else {
        panic!("authored box must qualify as a box")
    };
    assert_eq!(edge_lengths, [10.0, 20.0, 30.0]);
    assert_eq!(
        corners,
        [
            [-5.0, -10.0, -15.0],
            [-5.0, -10.0, 15.0],
            [-5.0, 10.0, -15.0],
            [-5.0, 10.0, 15.0],
            [5.0, -10.0, -15.0],
            [5.0, -10.0, 15.0],
            [5.0, 10.0, -15.0],
            [5.0, 10.0, 15.0],
        ]
    );
    assert_eq!(face_indices, [1, 2, 3, 4, 5, 6]);
    let mut incidence = std::collections::BTreeMap::<[u32; 2], Vec<[u32; 2]>>::new();
    for (row, cycle) in face_corner_indices.iter().enumerate() {
        assert_eq!(Some(&cycle[0]), cycle.iter().min());
        for i in 0..4 {
            let edge = [cycle[i], cycle[(i + 1) % 4]];
            let mut key = edge;
            key.sort();
            incidence.entry(key).or_default().push(edge);
        }
        assert_eq!(faces[row].entity, BrepEntity::WholeFace(face_indices[row]));
        let geospec_engine_native_occt::SurfaceFacts::Plane { origin, normal } =
            faces[row].facts.surface
        else {
            panic!("each box face must be planar")
        };
        for &corner in cycle {
            let point = corners[corner as usize];
            let offset: f64 = (0..3)
                .map(|axis| (point[axis] - origin[axis]) * normal[axis])
                .sum();
            assert_eq!(offset, 0.0);
        }
    }
    assert_eq!(incidence.len(), 12);
    for uses in incidence.values() {
        assert_eq!(uses.len(), 2);
        assert_eq!(uses[0], [uses[1][1], uses[1][0]]);
    }
    for axis in 0..3 {
        for side in 0..2 {
            let index = opposite_face_pairs[axis][side] as usize - 1;
            let mut expected = [0.0; 3];
            expected[axis] = if side == 0 { -1.0 } else { 1.0 };
            assert_eq!(outward_normals[index], expected);
        }
    }
    // Whole faces leave their boxes unmeasured (NaN); Debug text compares them.
    assert_eq!(format!("{faces:?}"), format!("{:?}", doc.faces().unwrap()));
    eprintln!("NOMINAL ap242-box.step unchanged {faces:?}");
}

#[test]
fn preserved_cylinder_records_unqualified_period_obligation() {
    let doc = Document::from_step(&fixture("ap242-radius1-height10.step")).unwrap();
    // The intended positive cylinder certificate remains an OPEN obligation in
    // intent-before-query.json. The first failed positive run is preserved.
    // STEP #66 authors U=6.28318530718; no fitted angular tolerance is permitted.
    // (F10: faces no longer carry UV bounds; the refusal below is the evidence.)
    let error = doc.continuous_wall_domain(BrepEntity::Whole).unwrap_err();
    eprintln!("REFUSAL ap242-radius1-height10.step {error:?}");
    assert_eq!(error.kind, BackendErrorKind::Unsupported);
    assert_eq!(error.message,
        "Continuous cylinder requires a finite increasing axial interval and an exact full analytic U period.");
}

#[test]
fn ordinary_multiple_solid_and_cavity_subjects_are_unsupported() {
    for name in [
        "regular-solid-controls.step",
        "subject-and-cavity-target.step",
    ] {
        let doc = Document::from_step(&fixture(name)).unwrap();
        assert!(doc.validity().unwrap().valid);
        let error = doc.continuous_wall_domain(BrepEntity::Whole).unwrap_err();
        eprintln!("REFUSAL {name} {error:?}");
        assert_eq!(error.kind, BackendErrorKind::Unsupported);
        assert!(!error.message.is_empty());
    }
}
