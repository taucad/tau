use geospec_engine_native_occt::configure_thread_pool_width;
use geospec_engine_native_runtime::{create_engine, EngineConfig};

fn config(permits: u32) -> EngineConfig {
    let mut config = EngineConfig::entry();
    config.execution_permits = permits;
    config
}

#[test]
fn serial_and_dedicated_engines_hold_and_release_process_grants() {
    let serial_a = create_engine(config(1)).unwrap();
    let serial_b = create_engine(config(1)).unwrap();
    assert_eq!(
        create_engine(config(2)).err(),
        Some("OCCT engine execution grant conflicts with an active engine.")
    );
    drop(serial_a);
    drop(serial_b);

    if std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        < 2
    {
        assert_eq!(
            create_engine(config(2)).err(),
            Some("OCCT dedicated execution exceeds host-supported permits.")
        );
        return;
    }

    let dedicated = create_engine(config(2)).unwrap();
    assert_eq!(configure_thread_pool_width(2).unwrap(), 2);
    for permits in [1, 2, 4] {
        assert_eq!(
            create_engine(config(permits)).err(),
            Some("OCCT engine execution grant conflicts with an active engine.")
        );
    }
    drop(dedicated);
    let serial_after = create_engine(config(1)).unwrap();
    drop(serial_after);
    let dedicated_after = create_engine(config(2)).unwrap();
    drop(dedicated_after);
}
