//! Concrete ST composition. The core/proofs depend only on neutral connectors.
pub use geospec_engine_native_core::{Engine, EngineConfig, ProtocolError};
use geospec_engine_native_csg::ManifoldCsgConnector;
use geospec_engine_native_occt::OcctConnector;

/// Constructs the real OCCT + repaired Rust Manifold engine with named bounds.
pub fn create_engine(config: EngineConfig) -> Engine {
    Engine::with_backends(
        config,
        Box::new(OcctConnector),
        Box::new(ManifoldCsgConnector::new()),
    )
}
