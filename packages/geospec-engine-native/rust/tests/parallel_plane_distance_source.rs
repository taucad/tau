mod backend {
    pub use geospec_engine_native_core::backend::*;
}

mod codec {
    #[derive(Clone, Debug, PartialEq)]
    pub(crate) enum Json {
        Bool(bool),
        Number(f64),
        String(String),
        Array(Vec<Json>),
        Object(Vec<(String, Json)>),
    }

    impl Json {
        pub(crate) fn object<const N: usize>(entries: [(&str, Self); N]) -> Self {
            Self::Object(
                entries
                    .into_iter()
                    .map(|(key, value)| (key.into(), value))
                    .collect(),
            )
        }

        pub(crate) fn string(value: &str) -> Self {
            Self::String(value.into())
        }
    }
}

#[path = "../src/analysis/parallel_plane_distance.rs"]
mod parallel_plane_distance;

use backend::brep::ResolvedSourceFace;
use codec::Json;
use parallel_plane_distance::{admit, F2Error};
use std::path::PathBuf;

fn fixture() -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../native/occt/rust/tests/fixtures/parallel-plane-distance-source.step"),
    )
    .expect("F2 AP242 fixture")
}

fn same_occurrence_fixture() -> Vec<u8> {
    std::fs::read(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(
        "../native/occt/rust/tests/fixtures/parallel-plane-distance-same-occurrence-source.step",
    ))
    .expect("same-occurrence F2 AP242 fixture")
}

fn associations(admitted: &parallel_plane_distance::AdmittedDimension) -> [ResolvedSourceFace; 2] {
    let keys = admitted.source_keys();
    [
        ResolvedSourceFace {
            key: keys[0].clone(),
            occurrence: 0,
            public_face_ordinal: 1,
            private_query_face: 2,
            source_same_sense: true,
            transferred_reversed: false,
        },
        ResolvedSourceFace {
            key: keys[1].clone(),
            occurrence: 2,
            public_face_ordinal: 1,
            private_query_face: 2,
            source_same_sense: true,
            transferred_reversed: false,
        },
    ]
}

#[test]
fn should_prove_the_exact_source_distance_inside_the_authored_band() {
    let admitted = admit(&fixture(), None).expect("valid F2 source");
    let admission_work = admitted.work_counts();
    assert!(admission_work.decimals <= 2_048);
    assert!(admission_work.rational_operations <= 8_192);
    assert!(admission_work.projected_temporary_peak_bytes > 0);
    assert_eq!(
        admitted
            .source_keys()
            .map(|key| (key.source_face_entity, key.occurrence_route)),
        [(1110, vec![600]), (1110, vec![620])]
    );
    let evidence = admitted
        .evaluate(&associations(&admitted))
        .expect("matching forward associations");
    assert!(evidence.geometric_pass);
    assert_eq!(evidence.work_counts(), admission_work);
    assert!(evidence.owned_bytes() <= 32 * 1024 * 1024);
    let json = evidence.to_json();
    assert_eq!(
        field(field(&json, "distanceSquaredMillimeters"), "numerator"),
        &Json::String("100".into())
    );
    assert_eq!(
        field(field(field(&json, "band"), "lower"), "spelling"),
        &Json::String("0.95".into())
    );
    let Json::Array(roles) = field(&json, "roles") else {
        panic!("roles array")
    };
    let Json::Array(route) = field(&roles[1], "occurrenceRoute") else {
        panic!("route array")
    };
    assert_eq!(route, &[Json::Number(620.0)]);
}

fn field<'a>(value: &'a Json, name: &str) -> &'a Json {
    let Json::Object(entries) = value else {
        panic!("object")
    };
    entries
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value)
        .expect("field")
}

#[test]
fn should_return_a_geometric_false_for_a_parallel_distance_outside_the_band() {
    let source = String::from_utf8(fixture())
        .unwrap()
        .replace("1.05),#405", "0.99),#405");
    let admitted = admit(source.as_bytes(), None).expect("valid narrower F2 band");
    let evidence = admitted.evaluate(&associations(&admitted)).unwrap();
    assert!(!evidence.geometric_pass);
}

#[test]
fn should_reject_a_source_placement_that_makes_the_planes_nonparallel() {
    let source = String::from_utf8(fixture()).unwrap().replace(
        "#627=DIRECTION('',(0.,0.,1.));",
        "#627=DIRECTION('',(1.,0.,0.));",
    );
    let error = admit(source.as_bytes(), None).unwrap_err();
    assert!(matches!(error, F2Error::UnsupportedDomain(_)));
    assert_eq!(error.code(), "unsupported-domain");
    assert!(error.to_string().contains("not parallel"));
}

#[test]
fn should_admit_distinct_source_faces_in_one_occurrence() {
    let admitted =
        admit(&same_occurrence_fixture(), None).expect("valid same-occurrence F2 source");
    let keys = admitted.source_keys();
    assert_eq!(
        keys.clone()
            .map(|key| (key.source_face_entity, key.occurrence_route)),
        [(1100, vec![600]), (1110, vec![600])]
    );
    let evidence = admitted
        .evaluate(&[
            ResolvedSourceFace {
                key: keys[0].clone(),
                occurrence: 0,
                public_face_ordinal: 0,
                private_query_face: 1,
                source_same_sense: false,
                transferred_reversed: false,
            },
            ResolvedSourceFace {
                key: keys[1].clone(),
                occurrence: 0,
                public_face_ordinal: 1,
                private_query_face: 2,
                source_same_sense: true,
                transferred_reversed: false,
            },
        ])
        .expect("two faces in one occurrence remain distinct");
    assert!(evidence.geometric_pass);
    assert_eq!(
        field(
            field(&evidence.to_json(), "distanceSquaredMillimeters"),
            "numerator"
        ),
        &Json::String("100".into())
    );
}

#[test]
fn should_reject_an_identical_composite_source_key() {
    let source = String::from_utf8(same_occurrence_fixture())
        .unwrap()
        .replace(
            "#703=GEOMETRIC_ITEM_SPECIFIC_USAGE('','',#702,#10,#1110);",
            "#703=GEOMETRIC_ITEM_SPECIFIC_USAGE('','',#702,#10,#1100);",
        );
    let error = admit(source.as_bytes(), None).unwrap_err();
    assert!(matches!(error, F2Error::UnsupportedSource(_)));
    assert!(error.to_string().contains("distinct source faces"));
}
