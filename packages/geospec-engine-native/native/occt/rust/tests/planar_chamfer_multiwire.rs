use geospec_engine_native_core::backend::brep::{
    BrepSubject, EdgeTreatmentDisposition as D, EdgeTreatmentKind as K, EdgeTreatmentReason as R,
    SurfaceFacts,
};
use geospec_engine_native_occt::Document;
use std::path::PathBuf;

fn inputs() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/nominal-bore-void")
}

#[test]
fn original_multiwire_caps_are_source_bound_nonmembers() {
    let d = Document::from_step(&std::fs::read(inputs().join("original-chamfer.step")).unwrap())
        .unwrap();
    let inventory = d.edge_treatments(100).unwrap();
    for (key, public, private) in [("#306/#468", 3, 4), ("#368/#468", 4, 5)] {
        let rows: Vec<_> = inventory
            .rows
            .iter()
            .filter(|r| r.source_face_key.as_deref() == Some(key))
            .collect();
        assert_eq!(rows.len(), 1);
        let row = rows[0];
        eprintln!("ORIGINAL_CHAMFER {row:?}");
        assert_eq!(row.occurrence_path, "housing");
        assert_eq!(
            (row.public_face_ordinal, row.private_query_face),
            (public, private)
        );
        assert_eq!(row.chamfer, D::NonMember(R::OutsideTopology));
    }
}

#[test]
fn perforated_genuine_chamfer_with_surviving_rails_remains_unknown() {
    for (file, perforated) in [
        ("chamfer-base.step", false),
        ("chamfer-perforated.step", true),
    ] {
        let d = Document::from_step(&std::fs::read(inputs().join(file)).unwrap()).unwrap();
        let mut faces = d.reported_faces(false).unwrap().occurrence_faces;
        assert_eq!(faces.len(), 1);
        let faces = faces.remove(0);
        // Independent authored strip: x+z=28, swept along Y. The bore does not
        // touch either length-30 rail. This identifies geometry, not a label.
        let selected: Vec<_> = faces
            .iter()
            .filter(|f| {
                matches!(f.facts.surface,
            SurfaceFacts::Plane {normal, ..} if normal[0].abs()>0.5 && normal[2].abs()>0.5)
            })
            .collect();
        assert_eq!(selected.len(), 1);
        let inventory = d.edge_treatments(100).unwrap();
        let row = inventory
            .rows
            .iter()
            .find(|r| r.occurrence == Some(0) && r.public_face_ordinal == selected[0].facts.index)
            .unwrap();
        eprintln!("CHAMFER_CONTROL {file} {row:?}");
        if perforated {
            assert_eq!(row.chamfer, D::Unqualified(R::UnsupportedTrim));
        } else {
            let D::Qualified(c) = &row.chamfer else {
                panic!("base strip is not qualified: {row:?}")
            };
            assert_eq!(c.kind, K::PlanarChamfer);
            assert_eq!(c.wire_count, 1);
            assert_eq!(c.boundary_uses.len(), 4);
        }
    }
}

#[test]
fn existing_selected_one_wire_families_and_negative_controls_remain() {
    for (file, kind) in [
        ("01-planar-chamfer.step", Some(K::PlanarChamfer)),
        ("02-cylindrical-fillet.step", Some(K::CylindricalFillet)),
        ("03-conical-chamfer.step", Some(K::ConicalChamfer)),
        ("04-toroidal-fillet.step", Some(K::ToroidalFillet)),
        ("07-rotated-planar-chamfer.step", Some(K::PlanarChamfer)),
        ("05-plain-box.step", None),
        ("08-rotated-plain-box.step", None),
    ] {
        let bytes = std::fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/edge-treatments")
                .join(file),
        )
        .unwrap();
        let d = Document::from_step(&bytes).unwrap();
        let inventory = d.edge_treatments(100).unwrap();
        let mut qualified = Vec::new();
        for row in &inventory.rows {
            for disposition in [&row.chamfer, &row.fillet] {
                match disposition {
                    D::Qualified(c) => {
                        assert_eq!(c.wire_count, 1);
                        qualified.push(c.kind);
                    }
                    D::NonMember(_) => (),
                    D::Unqualified(reason) => panic!("{file}: unexpected refusal {reason:?}"),
                }
            }
        }
        eprintln!("EXISTING_EDGE_CONTROL {file} {qualified:?}");
        assert_eq!(qualified, kind.into_iter().collect::<Vec<_>>(), "{file}");
    }
}
