use geospec_engine_native_core::backend::brep::{
    BrepEntity, BrepSubject, CircularBoreDisposition, CircularBoreInventory, CircularBoreNonMember,
    CircularBoreTermination, SurfaceFacts,
};
use geospec_engine_native_occt::Document;
use std::collections::BTreeSet;
use std::path::PathBuf;

// These intentions were frozen independently before candidate query execution.
// Imported metric observations are not exact-real or target-wide goldens.
const CASES: [&str; 8] = [
    "01-through.step",
    "02-blind.step",
    "03-sealed-cavity.step",
    "04-edge-notch.step",
    "05-unrelated-assembly.step",
    "06-rigid-transformed.step",
    "07-shared-instance.step",
    "08-obstructed-through.step",
];

fn observe(name: &str) -> Result<CircularBoreInventory, String> {
    let bytes = std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/circular-bores")
            .join(name),
    )
    .map_err(|error| format!("fixture: {error}"))?;
    let document = Document::from_step(&bytes).map_err(|error| format!("admission: {error:?}"))?;
    let faces = document
        .faces()
        .map_err(|error| format!("faces: {error:?}"))?;
    let expected: Vec<_> = faces
        .iter()
        .filter(|face| !matches!(face.facts.surface, SurfaceFacts::Plane { .. }))
        .map(|face| (face.facts.index, face.entity))
        .collect();
    let result = document
        .circular_bores(expected.len())
        .map_err(|error| format!("query: {error:?}"))?;
    eprintln!("CIRCULAR_BORES fixture={name} faces={expected:?} actual={result:#?}");
    let actual: Vec<_> = result
        .candidates
        .iter()
        .map(|candidate| {
            (
                candidate.public_face_ordinal,
                BrepEntity::WholeFace(candidate.private_query_face),
            )
        })
        .collect();
    if actual != expected {
        return Err(format!(
            "complete public/private candidate join: {actual:?} != {expected:?}"
        ));
    }
    Ok(result)
}

#[test]
fn circular_bores_preserve_local_topology_and_reject_incomplete_or_obstructed_interiors() {
    // Capture every ordinary cell before assertions. A failure is retained and
    // cannot turn the other successfully observed cells into missing evidence.
    let observations: Vec<_> = CASES
        .iter()
        .map(|name| {
            let result = observe(name);
            if let Err(error) = &result {
                eprintln!("CIRCULAR_BORES fixture={name} error={error}");
            }
            (*name, result)
        })
        .collect();
    let mut failures = Vec::new();
    for (index, (name, result)) in observations.into_iter().enumerate() {
        let inventory = match result {
            Ok(value) => value,
            Err(error) => {
                failures.push(format!("{name}: {error}"));
                continue;
            }
        };
        let qualified: Vec<_> = inventory
            .candidates
            .iter()
            .filter_map(|candidate| match &candidate.disposition {
                CircularBoreDisposition::Qualified(value) => Some(value),
                _ => None,
            })
            .collect();
        let expected_count = match index {
            0 | 1 | 4 | 5 => 1,
            6 => 2,
            _ => 0,
        };
        if qualified.len() != expected_count {
            failures.push(format!(
                "{name}: expected {expected_count} qualified bores, got {}",
                qualified.len()
            ));
        }
        for value in &qualified {
            let mouths = value
                .ends
                .iter()
                .filter(|end| end.termination == CircularBoreTermination::Mouth)
                .count();
            let expected_mouths = if index == 1 { 1 } else { 2 };
            if mouths != expected_mouths || value.interior_residual_solid_count != 0 {
                failures.push(format!(
                    "{name}: expected {expected_mouths} mouths and no residual solid: {value:?}"
                ));
            }
            if value.band.radius != 1.0 {
                failures.push(format!(
                    "{name}: independently authored nominal radius1, observed {}",
                    value.band.radius
                ));
            }
        }
        let expected_nonmember = match index {
            2 => Some(CircularBoreNonMember::SealedCavity),
            7 => Some(CircularBoreNonMember::ObstructedInterior),
            _ => None,
        };
        if let Some(reason) = expected_nonmember {
            if !inventory.candidates.iter().any(|candidate| {
                candidate.disposition == CircularBoreDisposition::NonMember(reason)
            }) {
                failures.push(format!("{name}: expected explicit {reason:?} disposition"));
            }
        }
        if index == 3
            && !inventory.candidates.iter().any(|candidate| {
                matches!(
                    candidate.disposition,
                    CircularBoreDisposition::Unqualified(_)
                )
            })
        {
            failures.push(format!(
                "{name}: partial band must remain explicitly unqualified"
            ));
        }
        if index == 6 {
            let owners: BTreeSet<_> = qualified
                .iter()
                .map(|value| value.owning_solid_ordinal)
                .collect();
            if owners.len() != 2 {
                failures.push(format!(
                    "{name}: two located instances require distinct owning solids: {owners:?}"
                ));
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
