//! The bridge pins the Watson mesher, so `CSF_MeshAlgo` cannot move the soup
//! (GeoSpec policy §16). This binary holds one test because it mutates the
//! process environment that OCCT reads on every mesh.

use geospec_engine_native_occt::{BrepSubject, Document};
use std::path::PathBuf;

/// The mesh authority fixtures' report soups on M0 (446ff8ba0) with
/// `CSF_MeshAlgo` unset: triangles and FNV-1a 64 of position bits, then
/// indices. With `delabella` exported, M0 gave `0x0df9_ed6e_9c74_92e5` for the
/// PMI source.
const SOUPS: [(&str, usize, u64); 4] = [
    (
        "component-interference/original.step",
        1276,
        0x2134_d11c_0e9a_2ef2,
    ),
    ("nominal-bore-void/guide.step", 520, 0x9688_c217_2ce3_59cd),
    ("ap242-box.step", 12, 0x3f52_dee9_f406_5aa5),
    (
        "parallel-plane-distance-source.step",
        36,
        0x73ee_5e84_7bdd_9225,
    ),
];

/// One fresh document's report soup, so no triangulation is reused.
fn report_soup(name: &str) -> (usize, u64) {
    let bytes = std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable");
    let document = Document::from_step(&bytes).unwrap();
    let mesh = BrepSubject::reported_mesh(&document)
        .unwrap()
        .expect("STEP subjects have a report mesh");
    let positions = mesh.positions.iter().flatten().map(|value| value.to_bits());
    let bytes = positions.flat_map(u64::to_le_bytes).chain(
        mesh.triangles
            .iter()
            .flatten()
            .flat_map(|index| index.to_le_bytes()),
    );
    let hash = bytes.fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    });
    (mesh.triangles.len(), hash)
}

#[test]
fn report_soup_ignores_a_delabella_csf_mesh_algo() {
    let pinned: Vec<_> = SOUPS
        .iter()
        .map(|&(name, triangles, hash)| (name, (triangles, hash)))
        .collect();
    std::env::remove_var("CSF_MeshAlgo");
    let clean: Vec<_> = SOUPS
        .iter()
        .map(|&(name, ..)| (name, report_soup(name)))
        .collect();
    std::env::set_var("CSF_MeshAlgo", "delabella");
    let delabella: Vec<_> = SOUPS
        .iter()
        .map(|&(name, ..)| (name, report_soup(name)))
        .collect();
    std::env::remove_var("CSF_MeshAlgo");
    assert_eq!(clean, pinned);
    assert_eq!(delabella, pinned);
}
