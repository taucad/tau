//! Concrete OCCT composition with process-local engine admission.
use geospec_engine_native_core::backend::{
    brep::{BrepConnector, BrepIdentityProfile, BrepSubject},
    BackendError,
};
use geospec_engine_native_core::cache::{OverlapEvidenceCache, ProducerIdentity};
pub use geospec_engine_native_core::{Engine, EngineConfig, ProtocolError};
use geospec_engine_native_csg::ManifoldCsgConnector;
use geospec_engine_native_occt::{OcctConnector, ParallelOcctConnector};
use std::{rc::Rc, sync::Mutex};

mod build_identity {
    include!(concat!(env!("OUT_DIR"), "/producer_identity.rs"));
}

#[derive(Default)]
struct AdmissionState {
    serial_engines: usize,
    parallel_engine: bool,
}

static ADMISSION: Mutex<AdmissionState> = Mutex::new(AdmissionState {
    serial_engines: 0,
    parallel_engine: false,
});

struct Admission {
    permits: u32,
}

impl Admission {
    fn acquire(permits: u32) -> Result<Self, &'static str> {
        let mut state = ADMISSION
            .lock()
            .map_err(|_| "OCCT admission state is unavailable.")?;
        match permits {
            1 if !state.parallel_engine => {
                state.serial_engines = state
                    .serial_engines
                    .checked_add(1)
                    .ok_or("Too many serial OCCT engines.")?;
            }
            _ if state.parallel_engine || state.serial_engines != 0 => {
                return Err("OCCT engine execution grant conflicts with an active engine.");
            }
            2.. => {
                let host_cap = std::thread::available_parallelism()
                    .map(|n| n.get())
                    .unwrap_or(1);
                if permits as usize > host_cap {
                    return Err("OCCT dedicated execution exceeds host-supported permits.");
                }
                state.parallel_engine = true;
            }
            _ => return Err("Execution permits must be positive."),
        }
        Ok(Self { permits })
    }
}

impl Drop for Admission {
    fn drop(&mut self) {
        let mut state = ADMISSION
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if self.permits == 1 {
            state.serial_engines -= 1;
        } else {
            state.parallel_engine = false;
        }
    }
}

struct AdmittedConnector {
    inner: Box<dyn BrepConnector>,
    _admission: Admission,
}

impl BrepConnector for AdmittedConnector {
    fn identity_profile(&self) -> BrepIdentityProfile {
        self.inner.identity_profile()
    }

    fn open_step(&self, bytes: &[u8]) -> Result<Box<dyn BrepSubject>, BackendError> {
        self.inner.open_step(bytes)
    }
}

fn admitted_connector(permits: u32) -> Result<Box<dyn BrepConnector>, &'static str> {
    let admission = Admission::acquire(permits)?;
    let inner: Box<dyn BrepConnector> = match permits {
        1 => Box::new(OcctConnector),
        2.. => Box::new(
            // SAFETY: The product host owns this process-private OCCT closure;
            // admission excludes every other runtime engine until this connector
            // and its retained documents drop. Direct wrapper callers are outside
            // this host contract.
            unsafe { ParallelOcctConnector::with_grant(permits, permits) }.map_err(|_| {
                "OCCT dedicated pool width is unavailable or conflicts with prior initialization."
            })?,
        ),
        _ => unreachable!("admission validates the grant"),
    };
    Ok(Box::new(AdmittedConnector {
        inner,
        _admission: admission,
    }))
}

/// Constructs the real OCCT + repaired Rust Manifold engine with named bounds.
pub fn create_engine(config: EngineConfig) -> Result<Engine, &'static str> {
    let brep = admitted_connector(config.execution_permits)?;
    Ok(Engine::with_backends(
        config,
        brep,
        Box::new(ManifoldCsgConnector::new()),
    ))
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
    let producer = producer_identity()?;
    let brep = admitted_connector(config.execution_permits)?;
    Ok(Engine::with_backends_and_overlap_cache(
        config,
        brep,
        Box::new(ManifoldCsgConnector::new()),
        cache,
        producer,
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
