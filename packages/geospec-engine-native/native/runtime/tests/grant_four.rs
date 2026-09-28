use geospec_engine_native_occt::configure_thread_pool_width;
use geospec_engine_native_runtime::{create_engine, EngineConfig};

#[test]
fn four_permits_configure_one_bounded_private_pool() {
    if std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        < 4
    {
        return;
    }
    let mut config = EngineConfig::entry();
    config.execution_permits = 4;
    let dedicated = create_engine(config).unwrap();
    assert_eq!(configure_thread_pool_width(4).unwrap(), 4);
    drop(dedicated);
    let serial = create_engine(EngineConfig::entry()).unwrap();
    drop(serial);
}
