use super::*;
#[test]
fn overlap_observation_metadata_never_promises_interior_or_error_bound() {
    let evidence = Evidence {
        exact: false,
        component_count: 2,
        components: vec![],
        selected_pairs: None,
        checked_pairs: 1,
        tolerance: 0.001,
        overlaps: vec![Overlap {
            left_component_id: 0,
            right_component_id: 1,
            left_label: "a".into(),
            right_label: "b".into(),
            intersection_volume: 0.49999997,
            witness_point: Some([0., 0., 15.]),
        }],
    };
    let json: serde_json::Value =
        serde_json::from_slice(&crate::codec::encode(&evidence_json(&evidence)).unwrap()).unwrap();
    assert_eq!(json["profile"], "M3-CSG-OBSERVATION-01");
    assert_eq!(json["assurance"], "approximate-polyhedral-observation");
    assert_eq!(json["reportingCutoff"], 0.001_f64.powi(3));
    let overlap = &json["overlaps"][0];
    assert!(overlap.get("witnessPoint").is_none());
    assert_eq!(overlap["diagnosticPoint"], serde_json::json!([0, 0, 15]));
    assert_eq!(overlap["intersectionVolume"], 0.49999997);
}
