//! S13 re-pin gate for the circular-bore inventory (O4-1): seventeen adversarial
//! plates, each 40 x 40 x 20 with a through bore of radius 5 and material placed
//! just outside or inside the bore cylinder (fixture provenance in
//! `fixtures/circular-bores-adversarial/provenance.json`). A bore-interior
//! certificate, a Boolean option or an OCCT re-pin must keep every disposition
//! the exact Common decided, including the four hanging pins that stay
//! OBSTRUCTED_INTERIOR, and every candidate byte of the pinned bridge.
use geospec_engine_native_core::backend::brep::{
    BrepSubject, CircularBoreDisposition, CircularBoreInventory, CircularBoreNonMember,
    CircularBoreUnqualified,
};
use geospec_engine_native_occt::Document;
use std::fmt::Write;
use std::path::PathBuf;

#[derive(Debug, PartialEq)]
enum Expected {
    Qualified,
    NonMember(CircularBoreNonMember),
    Unqualified(CircularBoreUnqualified),
}

use CircularBoreNonMember::{ExteriorCylinder, ObstructedInterior};
use CircularBoreUnqualified::{IncompleteBand, InvalidSolid, UnsupportedTermination};
use Expected::{NonMember, Qualified, Unqualified};

// Dispositions are the exact bridge Common's verdicts recorded by O4
// (`adv_bores.jsonl`, bridge rows); the digest is FNV-1a 64 over `serialize`
// on the M0 bridge (446ff8ba0, prefix delivery-n10-20260926). The tilted far
// pin (review W1 R3) is pinned on the W2B authored-healing profile.
// c-parallel-hole-wall-1e-7 is re-pinned on the authored-healing profile (A1, ruling 1):
// without repair its 1e-7 mm wall leaves an invalid solid, so no bore reaches the Common.
const CASES: [(&str, &[Expected], u64); 17] = [
    ("a0-clean-through.step", &[Qualified], 0x778a_5cdd_697a_605e),
    ("a1-blind.step", &[Qualified], 0xdc94_c957_5c4e_68c4),
    ("b-pocket-wall-1.step", &[Qualified], 0x778a_5cdd_697a_605e),
    (
        "b-pocket-wall-1e-2.step",
        &[Qualified],
        0x778a_5cdd_697a_605e,
    ),
    (
        "b-pocket-wall-1e-4.step",
        &[Qualified],
        0x778a_5cdd_697a_605e,
    ),
    (
        "b-pocket-wall-1e-6.step",
        &[Qualified],
        0x778a_5cdd_697a_605e,
    ),
    (
        "b-pocket-wall-1e-7.step",
        &[Unqualified(IncompleteBand)],
        0xa6c8_9933_c0db_ddd1,
    ),
    (
        "c-parallel-hole-wall-1.step",
        &[Qualified, Qualified],
        0x2761_2417_04bc_39b8,
    ),
    (
        "c-parallel-hole-wall-1e-2.step",
        &[Qualified, Qualified],
        0xd123_7b17_719b_a0f3,
    ),
    (
        "c-parallel-hole-wall-1e-4.step",
        &[Qualified, Qualified],
        0x9cc0_a29e_e15f_9241,
    ),
    (
        "c-parallel-hole-wall-1e-6.step",
        &[Qualified, Qualified],
        0x9b2b_6930_66e9_1ad2,
    ),
    (
        "c-parallel-hole-wall-1e-7.step",
        &[
            Unqualified(InvalidSolid),
            Unqualified(InvalidSolid),
            Unqualified(InvalidSolid),
        ],
        0x9a7f_5c17_9e9a_ef20,
    ),
    (
        "d-counterbore.step",
        &[Unqualified(UnsupportedTermination), Qualified],
        0x15e4_a596_c56d_2574,
    ),
    (
        "e-pin-gap-1.step",
        &[NonMember(ExteriorCylinder), NonMember(ObstructedInterior)],
        0x371c_ecf6_47e5_4baa,
    ),
    (
        "e-pin-gap-1e-2.step",
        &[NonMember(ExteriorCylinder), NonMember(ObstructedInterior)],
        0x371c_ecf6_47e5_4baa,
    ),
    (
        "e-pin-gap-1e-4.step",
        &[NonMember(ExteriorCylinder), NonMember(ObstructedInterior)],
        0x371c_ecf6_47e5_4baa,
    ),
    (
        "f-tilted-far-pin.step",
        &[NonMember(ExteriorCylinder), NonMember(ObstructedInterior)],
        0x3b68_1b35_d300_6dfc,
    ),
];

/// Every field the adapter transfers, doubles as exact bits, in public-face order.
fn serialize(inventory: &CircularBoreInventory) -> String {
    let mut out = String::new();
    for candidate in &inventory.candidates {
        write!(
            out,
            "{},{},",
            candidate.public_face_ordinal, candidate.private_query_face
        )
        .unwrap();
        match &candidate.disposition {
            CircularBoreDisposition::Qualified(value) => {
                write!(out, "Q{},", value.owning_solid_ordinal).unwrap();
                let band = &value.band;
                for number in
                    band.origin
                        .iter()
                        .chain(&band.axis)
                        .chain([&band.radius, &band.from, &band.to])
                {
                    write!(out, "{:016x},", number.to_bits()).unwrap();
                }
                for end in &value.ends {
                    write!(
                        out,
                        "{},{},{:?},",
                        end.owning_solid_edge_ordinal,
                        end.adjacent_public_face_ordinal,
                        end.termination
                    )
                    .unwrap();
                }
                write!(
                    out,
                    "{:016x},{};",
                    value.maximum_topology_tolerance_mm.to_bits(),
                    value.interior_residual_solid_count
                )
                .unwrap();
            }
            CircularBoreDisposition::NonMember(reason) => write!(out, "N{reason:?};").unwrap(),
            CircularBoreDisposition::Unqualified(reason) => write!(out, "U{reason:?};").unwrap(),
        }
    }
    out
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

fn open(name: &str) -> Result<Document, String> {
    let bytes = std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/circular-bores-adversarial")
            .join(name),
    )
    .map_err(|error| format!("fixture: {error}"))?;
    Document::from_step(&bytes).map_err(|error| format!("admission: {error:?}"))
}

fn observe(name: &str) -> Result<CircularBoreInventory, String> {
    open(name)?
        .circular_bores(16)
        .map_err(|error| format!("query: {error:?}"))
}

/// Dispositions in public-face order.
fn dispositions(inventory: &CircularBoreInventory) -> Vec<Expected> {
    inventory
        .candidates
        .iter()
        .map(|candidate| match &candidate.disposition {
            CircularBoreDisposition::Qualified(_) => Qualified,
            CircularBoreDisposition::NonMember(reason) => NonMember(*reason),
            CircularBoreDisposition::Unqualified(reason) => Unqualified(*reason),
        })
        .collect()
}

#[test]
fn adversarial_bores_keep_the_exact_common_dispositions_and_candidate_bytes() {
    // Observe every fixture before asserting, so one failure cannot hide the rest.
    let observations: Vec<_> = CASES.iter().map(|(name, ..)| observe(name)).collect();
    let mut failures = Vec::new();
    for ((name, expected, digest), observation) in CASES.iter().zip(observations) {
        let inventory = match observation {
            Ok(value) => value,
            Err(error) => {
                failures.push(format!("{name}: {error}"));
                continue;
            }
        };
        // The digest pins every other transferred byte.
        let actual = dispositions(&inventory);
        if actual != *expected {
            failures.push(format!(
                "{name}: dispositions {actual:?}, exact Common decided {expected:?}"
            ));
        }
        // A qualified bore's successful Common holds no residual solid.
        for candidate in &inventory.candidates {
            if let CircularBoreDisposition::Qualified(value) = &candidate.disposition {
                if value.interior_residual_solid_count != 0 {
                    failures.push(format!(
                        "{name}: qualified with a residual solid: {value:?}"
                    ));
                }
            }
        }
        let serialized = serialize(&inventory);
        let observed = fnv1a64(serialized.as_bytes());
        if observed != *digest {
            failures.push(format!(
                "{name}: candidate bytes {observed:#018x} != pinned {digest:#018x} ({serialized})"
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn the_certificate_clears_a_clean_bore_and_leaves_the_tilted_far_pin_to_the_common() {
    // A certificate that never proves clearance fails on the clean through
    // bore. The pin hangs 4 mm off the bore axis, its own axis tilted 9e-7 rad
    // with the surface Location 1.4e6 mm down it: measured at that Location it
    // sat 5.26 mm off and the bore certified clear; only the Common finds it.
    for (name, expected, certified) in [
        ("a0-clean-through.step", vec![Qualified], 1),
        (
            "f-tilted-far-pin.step",
            vec![NonMember(ExteriorCylinder), NonMember(ObstructedInterior)],
            0,
        ),
    ] {
        let document = open(name).unwrap();
        let inventory = document.circular_bores(16).unwrap();
        assert_eq!(dispositions(&inventory), expected, "{name}");
        assert_eq!(document.certified_clear_bores(), certified, "{name}");
    }
}
