//! Wave 0 report-soup goldens for the mesh authority fixtures: the STEP
//! fixtures of the performance-lab authority set that live in this crate. The
//! six m3 mesh-family authority cases (`toBeWatertight`, `toHaveMeshIntegrity`
//! and `toHaveConnectedComponents`, positive and negative) all measure the
//! `component-interference/original.step` report soup. Pinned on the M0 bridge
//! (446ff8ba0) and the delivery-n10-20260926 prefix in a clean environment;
//! `CSF_MeshAlgo` moves every soup until the mesh algorithm is pinned (S1).
use geospec_engine_native_core::backend::brep::BrepSubject;
use geospec_engine_native_core::backend::TriangleMesh;
use geospec_engine_native_occt::Document;
use std::path::PathBuf;

/// (fixture, performance-lab fixture id, triangles, FNV-1a 64 of the soup)
const CASES: [(&str, &str, usize, u64); 4] = [
    (
        "component-interference/original.step",
        "m3-control-step",
        1276,
        0x2134_d11c_0e9a_2ef2,
    ),
    (
        "nominal-bore-void/guide.step",
        "bore-guide-step",
        520,
        0x9688_c217_2ce3_59cd,
    ),
    ("ap242-box.step", "box-step", 12, 0x3f52_dee9_f406_5aa5),
    (
        "parallel-plane-distance-source.step",
        "m3-pmi-step",
        36,
        0x73ee_5e84_7bdd_9225,
    ),
];

fn fnv1a64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

/// The `report_bundle` mesh hash: position bits, then triangle indices, little-endian.
fn soup_hash(mesh: &TriangleMesh) -> u64 {
    let mut bytes = Vec::with_capacity(mesh.positions.len() * 24 + mesh.triangles.len() * 12);
    for value in mesh.positions.iter().flatten() {
        bytes.extend_from_slice(&value.to_bits().to_le_bytes());
    }
    for value in mesh.triangles.iter().flatten() {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    fnv1a64(&bytes)
}

#[test]
fn report_soup_matches_the_pinned_generation_on_the_mesh_authority_fixtures() {
    let mut failures = Vec::new();
    for (name, id, triangles, digest) in CASES {
        let bytes = std::fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures")
                .join(name),
        )
        .expect("retained fixture must be readable");
        let report = Document::from_step(&bytes)
            .and_then(|document| BrepSubject::reported_facts_and_mesh(&document));
        match report {
            Ok(report) => {
                let observed = (report.mesh.triangles.len(), soup_hash(&report.mesh));
                if observed != (triangles, digest) {
                    failures.push(format!(
                        "{id} ({name}): soup {} triangles {:#018x} != pinned {triangles} {digest:#018x}",
                        observed.0, observed.1
                    ));
                }
            }
            Err(error) => failures.push(format!("{id} ({name}): {error:?}")),
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
