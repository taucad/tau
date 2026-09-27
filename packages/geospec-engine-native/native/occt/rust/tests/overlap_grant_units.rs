//! S10's charges are a pure function of the input (§16). This binary owns
//! its OCCT closure's pool, so its first-init cap of four is taken here.

use geospec_engine_native_core::backend::brep::OccurrenceOverlap;
use geospec_engine_native_occt::{BrepConnector, ParallelOcctConnector};

/// One exact overlap pair charges the same steps, and answers the same
/// volume, at grants 1 and 4.
#[test]
fn exact_overlap_charges_the_same_steps_at_grants_one_and_four() {
    if std::thread::available_parallelism().unwrap().get() < 4 {
        return;
    }
    let source = String::from_utf8(include_bytes!("fixtures/two-cube-assembly.step").to_vec())
        .unwrap()
        .replace(
            "#615=CARTESIAN_POINT('',(30.,0.,0.));",
            "#615=CARTESIAN_POINT('',(5.,0.,0.));",
        );
    let pair = |width: u32| {
        // SAFETY: this test binary owns the static OCCT closure and its
        // first-init cap of four, and each document stays on this thread.
        let connector = unsafe { ParallelOcctConnector::with_grant(width, 4).unwrap() };
        let document = connector.open_step(source.as_bytes()).unwrap();
        let rows = document.source_occurrence_structure().unwrap();
        let leaves: Vec<u32> = (0..rows.len() as u32)
            .filter(|&index| {
                rows[index as usize].face_count > 0
                    && !rows.iter().any(|row| row.parent == Some(index))
            })
            .collect();
        assert_eq!(leaves.len(), 2);
        let mut memo = document.operand_memo();
        let mut charges = Vec::new();
        let answer = document
            .occurrence_overlap_memoized(leaves[0], leaves[1], 0.001, &mut memo, &mut |units| {
                charges.push(units);
                true
            })
            .unwrap();
        let Some(OccurrenceOverlap::Residual { volume, .. }) = answer else {
            panic!("the cubes overlap: {answer:?}");
        };
        (charges, volume.to_bits())
    };
    let serial = pair(1);
    // The pre-count, each operand's first qualification, then the Common.
    assert_eq!(serial.0.len(), 4, "{serial:?}");
    assert_eq!(pair(4), serial);
}
