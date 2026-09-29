use geospec_engine_native_occt::configure_thread_pool_width;
use geospec_engine_native_runtime::{create_engine, EngineConfig};

#[test]
fn prior_one_thread_pool_refuses_dedicated_engine_and_releases_admission() {
    if std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        < 2
    {
        return;
    }
    assert_eq!(configure_thread_pool_width(1).unwrap(), 1);
    let mut config = EngineConfig::entry();
    config.execution_permits = 2;
    assert_eq!(
        create_engine(config).err(),
        Some("OCCT dedicated pool width is unavailable or conflicts with prior initialization.")
    );
    let serial = create_engine(EngineConfig::entry()).unwrap();
    drop(serial);
}
