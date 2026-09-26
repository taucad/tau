use geospec_engine_native_occt::{
    configure_thread_pool_width, BrepConnector, BrepSubject, Document, OcctConnector,
    ParallelOcctConnector,
};

#[test]
fn adapter_refuses_a_pool_first_initialized_for_serial_calls() {
    assert_eq!(configure_thread_pool_width(1).unwrap(), 1);
    // SAFETY: this test owns the private closure; the constructor must reject
    // the pre-existing width-one initialization before opening a STEP document.
    assert!(unsafe { ParallelOcctConnector::new() }.is_err());

    let input = include_bytes!("fixtures/regular-solid-controls.step");
    let direct = Document::from_step(input).unwrap();
    let via_unit = OcctConnector.open_step(input).unwrap();
    assert_eq!(direct.validity().unwrap(), via_unit.validity().unwrap());
}
