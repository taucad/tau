use geospec_engine_native_occt::{configure_thread_pool_width, Document};

#[test]
fn should_keep_serial_facts_identical_after_one_time_pool_initialization() {
    assert!(configure_thread_pool_width(0).is_err());
    assert_eq!(configure_thread_pool_width(1).unwrap(), 1);
    let bytes = include_bytes!("fixtures/ap242-box.step");
    let first = Document::from_step(bytes).unwrap();
    let second = Document::from_step(bytes).unwrap();
    assert_eq!(
        serde_json::to_vec(first.facts().unwrap().as_ref()).unwrap(),
        serde_json::to_vec(second.facts().unwrap().as_ref()).unwrap()
    );
    let error = configure_thread_pool_width(2).unwrap_err();
    assert!(
        error.message.contains("different width") || error.message.contains("logical CPU count")
    );
}
