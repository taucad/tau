use std::rc::Rc;

/// Common native producer identities used to bind persisted evidence to its
/// complete geometry implementation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProducerIdentity {
    pub core: String,
    pub csg: String,
    pub brep: String,
}

/// Address supplied to an optional host-owned authenticated evidence store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceAddress {
    pub action_sha256: String,
    pub family: &'static str,
    pub codec: &'static str,
    pub producer_profile_sha256: String,
}

/// Narrow host seam for successful overlap evidence. Implementations treat
/// every I/O or authentication failure as a cache miss.
pub trait OverlapEvidenceCache {
    fn load(&self, address: &EvidenceAddress) -> Option<Vec<u8>>;
    fn publish(&self, address: &EvidenceAddress, payload: &[u8]);
}

pub(crate) type SharedOverlapEvidenceCache = Rc<dyn OverlapEvidenceCache>;

pub(crate) mod exact_clusters;
