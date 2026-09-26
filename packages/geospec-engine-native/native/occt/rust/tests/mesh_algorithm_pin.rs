//! The bridge pins the Watson mesher, so `CSF_MeshAlgo` cannot move the soup
//! (GeoSpec policy §16). This binary holds one test because it mutates the
//! process environment that OCCT reads on every mesh.

use geospec_engine_native_occt::{BrepSubject, Document};

const M3_PMI: &[u8] = include_bytes!("../../../../bench/fixtures/performance-lab/m3-pmi.step");

/// The m3-pmi soup at M0 (446ff8ba0) with `CSF_MeshAlgo` unset; M0 gave
/// `0x0df9_ed6e_9c74_92e5` with it set to `delabella`.
const WATSON_SOUP: u64 = 0x73ee_5e84_7bdd_9225;

/// FNV-1a 64 of one fresh document's report soup: positions by bits, then indices.
fn report_soup_hash() -> u64 {
    let document = Document::from_step(M3_PMI).unwrap();
    let mesh = BrepSubject::reported_mesh(&document)
        .unwrap()
        .expect("STEP subjects have a report mesh");
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    let positions = mesh.positions.iter().flatten().map(|value| value.to_bits());
    let bytes = positions.flat_map(u64::to_le_bytes).chain(
        mesh.triangles
            .iter()
            .flatten()
            .flat_map(|index| index.to_le_bytes()),
    );
    for byte in bytes {
        hash = (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

#[test]
fn report_soup_ignores_a_delabella_csf_mesh_algo() {
    std::env::remove_var("CSF_MeshAlgo");
    let clean = report_soup_hash();
    std::env::set_var("CSF_MeshAlgo", "delabella");
    let delabella = report_soup_hash();
    std::env::remove_var("CSF_MeshAlgo");
    assert_eq!([clean, delabella], [WATSON_SOUP; 2]);
}
