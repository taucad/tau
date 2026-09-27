use super::*;

fn completed() -> CompletedOverlap {
    // Ordinary B48 two-cube observation; no geometric expectation is changed.
    CompletedOverlap {
        evidence: Evidence {
            exact: false,
            component_count: 2,
            components: ["A#0", "B#0"]
                .into_iter()
                .enumerate()
                .map(|(id, label)| ComponentEvidence {
                    id: id as u32,
                    label: label.into(),
                    bounds: Bounds {
                        min: [id as f64 * 0.5, 0.0, 0.0],
                        max: [1.0 + id as f64 * 0.5, 1.0, 1.0],
                    },
                })
                .collect(),
            selected_pairs: None,
            checked_pairs: 1,
            tolerance: DEFAULT_TOLERANCE_MM,
            overlaps: vec![Overlap {
                left_component_id: 0,
                right_component_id: 1,
                left_label: "A#0".into(),
                right_label: "B#0".into(),
                intersection_volume: 0.49999999999999994,
                witness_point: None,
            }],
        },
        requests: vec![
            OverlapRequest::Source {
                component: 0,
                units: 45,
            },
            OverlapRequest::Source {
                component: 1,
                units: 45,
            },
            OverlapRequest::Boolean,
            OverlapRequest::Properties,
        ],
    }
}

fn owner() -> Rc<PreparedComponents> {
    Rc::new(PreparedComponents::Ready(PreparedOverlap {
        components: Vec::new(),
        operand_identity: String::new(),
        retained_bytes: 0,
        completed: RefCell::new(None),
    }))
}

fn cell(owner: &PreparedComponents) -> &RefCell<Option<CompletedOverlap>> {
    let PreparedComponents::Ready(prepared) = owner else {
        unreachable!()
    };
    &prepared.completed
}

fn allocated(owners: &[Rc<PreparedComponents>]) -> u64 {
    owners
        .iter()
        .map(|owner| {
            cell(owner)
                .borrow()
                .as_ref()
                .map_or(0, CompletedOverlap::allocated_bytes)
        })
        .sum()
}

#[test]
fn resident_lru_bounds_aggregate_and_touch_selects_eviction() {
    let bytes = completed().allocated_bytes();
    let mut resident = ResidentOverlaps::new(2 * bytes);
    let owners = [owner(), owner(), owner()];
    resident.insert(&owners[0], completed());
    resident.insert(&owners[1], completed());
    assert_eq!(allocated(&owners), 2 * bytes);
    resident.touch(&owners[0]);
    resident.insert(&owners[2], completed());
    assert!(
        cell(&owners[0]).borrow().is_some(),
        "touch protects the most recent entry"
    );
    assert!(
        cell(&owners[1]).borrow().is_none(),
        "eviction clears the actual subject cell"
    );
    assert!(cell(&owners[2]).borrow().is_some());
    assert_eq!(allocated(&owners), 2 * bytes);
    assert_eq!(resident.entries.len(), 2);

    if let Some(root) = std::env::var_os("GEOSPEC_LRU_EVIDENCE_DIR") {
        let root = std::path::PathBuf::from(root);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("resident-bytes.json"), serde_json::to_vec_pretty(&serde_json::json!({
            "entryAllocatedBytes": bytes,
            "capBytes": resident.max_bytes,
            "liveCompletedAllocatedBytes": allocated(&owners),
            "trackedEntries": resident.entries.len(),
            "indexCapacityBytes": resident.entries.capacity() * size_of::<(Weak<PreparedComponents>, u64)>(),
            "evictedSubjectCellEmpty": cell(&owners[1]).borrow().is_none()
        })).unwrap()).unwrap();
    }
}

#[test]
fn resident_lru_replacement_and_oversized_value_never_bypass_cap() {
    let bytes = completed().allocated_bytes();
    let mut resident = ResidentOverlaps::new(bytes);
    let owners = [owner(), owner()];
    resident.insert(&owners[0], completed());
    resident.insert(&owners[0], completed());
    assert_eq!(resident.entries.len(), 1);
    assert_eq!(allocated(&owners), bytes);
    let mut larger = completed();
    larger.evidence.components[0]
        .label
        .push_str("-a-larger-owned-label");
    assert!(larger.allocated_bytes() > bytes);
    resident.insert(&owners[1], larger);
    assert!(cell(&owners[1]).borrow().is_none());
    assert!(cell(&owners[0]).borrow().is_some());
    assert_eq!(allocated(&owners), bytes);
}

#[test]
fn resident_lru_owned_output_and_reinsert_preserve_canonical_evidence_and_trace() {
    let original = completed();
    let canonical = crate::codec::encode(&evidence_json(&original.evidence)).unwrap();
    let trace = original.requests.clone();
    let mut resident = ResidentOverlaps::new(original.allocated_bytes());
    let owners = [owner(), owner()];
    resident.insert(&owners[0], original);
    let mut output = cell(&owners[0]).borrow().as_ref().unwrap().evidence.clone();
    output.components[0].label.clear();
    assert_eq!(
        crate::codec::encode(&evidence_json(
            &cell(&owners[0]).borrow().as_ref().unwrap().evidence
        ))
        .unwrap(),
        canonical
    );
    resident.insert(&owners[1], completed());
    assert!(cell(&owners[0]).borrow().is_none());
    resident.insert(&owners[0], completed());
    let retained = cell(&owners[0]).borrow();
    let retained = retained.as_ref().unwrap();
    assert_eq!(
        crate::codec::encode(&evidence_json(&retained.evidence)).unwrap(),
        canonical
    );
    assert_eq!(retained.requests, trace);
    assert_eq!(allocated(&owners), resident.max_bytes);
}
