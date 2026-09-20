//! Concrete ST composition. The core/proofs depend only on neutral connectors.
use geospec_engine_native_core::cache::{OverlapEvidenceCache, ProducerIdentity};
pub use geospec_engine_native_core::{Engine, EngineConfig, ProtocolError};
use geospec_engine_native_csg::ManifoldCsgConnector;
use geospec_engine_native_occt::OcctConnector;
use std::rc::Rc;

mod build_identity {
    include!(concat!(env!("OUT_DIR"), "/producer_identity.rs"));
}

/// Constructs the real OCCT + repaired Rust Manifold engine with named bounds.
pub fn create_engine(config: EngineConfig) -> Engine {
    Engine::with_backends(
        config,
        Box::new(OcctConnector),
        Box::new(ManifoldCsgConnector::new()),
    )
}

/// Returns the common native producer identity generated from the pinned core
/// and backend build closure.
pub fn producer_identity() -> Result<ProducerIdentity, &'static str> {
    if !build_identity::VERIFIED {
        return Err("Persistent evidence requires the verified release producer profile.");
    }
    Ok(ProducerIdentity {
        core: build_identity::CORE.into(),
        csg: build_identity::CSG.into(),
        brep: build_identity::BREP.into(),
    })
}

/// Reports whether this artifact was built under the supported producer profile.
pub const fn producer_identity_verified() -> bool {
    build_identity::VERIFIED
}

/// Constructs the same engine with one explicit host-owned overlap cache.
pub fn create_engine_with_overlap_cache(
    config: EngineConfig,
    cache: Rc<dyn OverlapEvidenceCache>,
) -> Result<Engine, &'static str> {
    Ok(Engine::with_backends_and_overlap_cache(
        config,
        Box::new(OcctConnector),
        Box::new(ManifoldCsgConnector::new()),
        cache,
        producer_identity()?,
    ))
}

/// Canonical bytes used by host parity checks and cache diagnostics.
pub fn producer_identity_bytes() -> Vec<u8> {
    format!(
        "{{\"brep\":\"{}\",\"core\":\"{}\",\"csg\":\"{}\",\"schema\":\"geospec-producer-build-v2\",\"verified\":{}}}",
        build_identity::BREP,
        build_identity::CORE,
        build_identity::CSG,
        build_identity::VERIFIED,
    )
    .into_bytes()
}
