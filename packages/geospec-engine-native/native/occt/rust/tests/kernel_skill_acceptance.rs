//! Ordinary kernel-authored parts from the 2026-10-08 acceptance runs: their
//! fillets, mitred chamfers and bolt patterns must be decidable, not refused,
//! while a hole that is not a cylinder keeps hole-absence claims refused.

use geospec_engine_native_core::backend::brep::{
    BrepSubject, CircularBoreDisposition, CircularBoreNonMember, CircularBoreTermination,
    CircularBoreUnqualified, EdgeTreatmentDisposition, EdgeTreatmentKind, EdgeTreatmentReason,
    SurfaceFacts,
};
use geospec_engine_native_occt::Document;
use std::path::PathBuf;

/// Certificates report a 1e-7 mm topology tolerance; residuals sit near 1e-15.
const ACCURACY_MM: f64 = 1e-7;

fn document(name: &str) -> Document {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/kernel-skill-acceptance")
        .join(name);
    Document::from_step(&std::fs::read(&path).expect(name)).expect(name)
}

/// Diameters of the qualified through holes, sorted, after checking that every
/// other candidate is a typed non-member: a blend face beside a bore must not
/// leave the inventory partial.
fn through_hole_diameters(file: &str, document: &Document) -> Vec<f64> {
    let faces = BrepSubject::faces(document).expect(file);
    let inventory = document.circular_bores(faces.len()).expect(file);
    let mut diameters: Vec<f64> = inventory
        .candidates
        .iter()
        .filter_map(|candidate| {
            let surface = &faces[candidate.public_face_ordinal as usize].facts.surface;
            let CircularBoreDisposition::Qualified(topology) = &candidate.disposition else {
                let expected = if matches!(surface, SurfaceFacts::Torus { .. }) {
                    CircularBoreNonMember::ExteriorBlend
                } else {
                    CircularBoreNonMember::ExteriorCylinder
                };
                assert_eq!(
                    candidate.disposition,
                    CircularBoreDisposition::NonMember(expected),
                    "{file}: {surface:?}"
                );
                return None;
            };
            assert!(
                topology
                    .ends
                    .iter()
                    .all(|end| end.termination == CircularBoreTermination::Mouth),
                "{file}: {topology:?}"
            );
            let SurfaceFacts::Cylinder { radius, .. } = surface else {
                panic!("{file}: qualified bore on {surface:?}")
            };
            Some(radius * 2.0)
        })
        .collect();
    diameters.sort_by(f64::total_cmp);
    diameters
}

/// Qualified (kind, metric) rows.
type Qualified = Vec<(EdgeTreatmentKind, f64)>;
/// (face, reason) rows left unqualified.
type Unknown = Vec<(u32, EdgeTreatmentReason)>;

fn edge_treatments(file: &str, document: &Document, chamfer: bool) -> (Qualified, Unknown) {
    let faces = BrepSubject::faces(document).expect(file);
    let inventory = document.edge_treatments(faces.len()).expect(file);
    let mut qualified = Vec::new();
    let mut unknown = Vec::new();
    for row in &inventory.rows {
        match if chamfer { &row.chamfer } else { &row.fillet } {
            EdgeTreatmentDisposition::Qualified(certificate) => {
                qualified.push((certificate.kind, certificate.metric_value_mm));
            }
            EdgeTreatmentDisposition::Unqualified(reason) => {
                unknown.push((row.public_face_ordinal, *reason));
            }
            EdgeTreatmentDisposition::NonMember(_) => {}
        }
    }
    (qualified, unknown)
}

#[test]
fn coupling_rim_fillets_leave_the_bolt_pattern_and_fillets_decidable() {
    for file in ["replicad-coupling.step", "build123d-coupling.step"] {
        let document = document(file);
        let diameters = through_hole_diameters(file, &document);
        assert_eq!(diameters.len(), 7, "{file}: {diameters:?}");
        for (index, expected) in [5.0; 6].into_iter().chain([20.0]).enumerate() {
            assert!(
                (diameters[index] - expected).abs() <= ACCURACY_MM,
                "{file}: hole {index} is {} not {expected}",
                diameters[index]
            );
        }

        // The seams of both rim tori are B-spline pcurves after the STEP round trip.
        let (fillets, unknown) = edge_treatments(file, &document, false);
        assert!(unknown.is_empty(), "{file}: {unknown:?}");
        assert_eq!(fillets.len(), 2, "{file}: {fillets:?}");
        for (kind, radius) in fillets {
            assert_eq!(kind, EdgeTreatmentKind::ToroidalFillet, "{file}");
            assert!((radius - 1.0).abs() <= ACCURACY_MM, "{file}: {radius}");
        }
    }
}

#[test]
fn mitred_top_chamfers_qualify() {
    let file = "build123d-chamfer-block.step";
    let document = document(file);
    let (chamfers, unknown) = edge_treatments(file, &document, true);
    assert_eq!(chamfers.len(), 4, "{chamfers:?}");
    for (kind, distance) in chamfers {
        assert_eq!(kind, EdgeTreatmentKind::PlanarChamfer);
        assert!((distance - 1.0).abs() <= ACCURACY_MM, "{distance}");
    }
    // Only the top face stays unknown: the counterbore perforates it, and a
    // perforated transition is never admitted as a chamfer.
    let faces = BrepSubject::faces(&document).expect(file);
    let [(top, reason)] = unknown[..] else {
        panic!("{unknown:?}")
    };
    assert_eq!(reason, EdgeTreatmentReason::UnsupportedTrim);
    let SurfaceFacts::Plane { origin, normal } = faces[top as usize].facts.surface else {
        panic!("{:?}", faces[top as usize].facts.surface)
    };
    let offset: f64 = normal.iter().zip(origin).map(|(n, o)| n * o).sum();
    assert!((normal[2] - 1.0).abs() <= ACCURACY_MM, "{normal:?}");
    assert!((offset - 7.5).abs() <= ACCURACY_MM, "{offset}");
}

#[test]
fn flat_crown_between_two_chamfers_stays_unknown() {
    // Negative control: the flat top between two equal chamfers has planar
    // supports meeting in a virtual ridge at equal offsets (width / sqrt 2),
    // so every rail residual passes. Only the strips' depth separates it from
    // a chamfer of that ridge: a support shallower than the chamfer distance
    // leaves the candidate unknown, while the two real chamfers still qualify.
    // The parallelogram plan exercises the non-perpendicular ends that mitred
    // chamfers rely on.
    for file in ["rect-two-chamfers.step", "para-two-chamfers.step"] {
        let document = document(file);
        let (chamfers, unknown) = edge_treatments(file, &document, true);
        assert_eq!(chamfers.len(), 2, "{file}: {chamfers:?}");
        for (kind, distance) in chamfers {
            assert_eq!(kind, EdgeTreatmentKind::PlanarChamfer, "{file}");
            assert!((distance - 1.0).abs() <= ACCURACY_MM, "{file}: {distance}");
        }
        let faces = BrepSubject::faces(&document).expect(file);
        let [(top, reason)] = unknown[..] else {
            panic!("{file}: {unknown:?}")
        };
        assert_eq!(reason, EdgeTreatmentReason::ShallowSupport, "{file}");
        let SurfaceFacts::Plane { origin, normal } = faces[top as usize].facts.surface else {
            panic!("{file}: {:?}", faces[top as usize].facts.surface)
        };
        assert!((normal[2] - 1.0).abs() <= ACCURACY_MM, "{file}: {normal:?}");
        assert!((origin[2] - 5.0).abs() <= ACCURACY_MM, "{file}: {origin:?}");
    }
}

#[test]
fn non_cylindrical_hole_walls_keep_the_bore_inventory_partial() {
    // A drafted hole is a cone and an O-ring's eye is the inner half of a
    // torus. Neither is a circular bore, but both bound a hole, so they stay
    // unknown and hole-absence claims are refused rather than decided (§5).
    for (file, is_expected) in [
        (
            "drafted-hole-plate.step",
            (|surface: &SurfaceFacts| matches!(surface, SurfaceFacts::Cone { .. }))
                as fn(&_) -> bool,
        ),
        ("o-ring.step", |surface| {
            matches!(surface, SurfaceFacts::Torus { .. })
        }),
    ] {
        let document = document(file);
        let faces = BrepSubject::faces(&document).expect(file);
        let inventory = document.circular_bores(faces.len()).expect(file);
        let unknown: Vec<_> = inventory
            .candidates
            .iter()
            .filter(|candidate| {
                matches!(
                    candidate.disposition,
                    CircularBoreDisposition::Unqualified(
                        CircularBoreUnqualified::UnsupportedSurface
                    )
                )
            })
            .map(|candidate| &faces[candidate.public_face_ordinal as usize].facts.surface)
            .collect();
        assert!(!unknown.is_empty(), "{file}: {:?}", inventory.candidates);
        assert!(
            unknown.iter().all(|found| is_expected(found)),
            "{file}: {unknown:?}"
        );
        assert!(
            !inventory.candidates.iter().any(|candidate| matches!(
                candidate.disposition,
                CircularBoreDisposition::Qualified(_)
            )),
            "{file}: {:?}",
            inventory.candidates
        );
    }
}
