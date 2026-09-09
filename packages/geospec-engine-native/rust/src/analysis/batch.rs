//! Finite prepared-batch component demands; no session-wide tolerance map.

use std::{
    cell::{Cell, OnceCell},
    collections::BTreeMap,
    mem::size_of,
    rc::Rc,
};

use super::mesh::{ClusterGap, ClusterReport, ConnectedComponents, MeshAnalysis, PrimitiveRecord};
use crate::{
    backend::{AnalysisRetentionLimits, BackendError, BackendErrorKind},
    ErrorKind, ProtocolError,
};

/// Result storage exists only for keys declared by the complete prepared batch.
pub(crate) struct BatchAnalysis {
    components: BTreeMap<(String, u64), OnceCell<Rc<ConnectedComponents>>>,
    retained_bytes: Cell<u64>,
    byte_limit: u64,
}

impl BatchAnalysis {
    pub(crate) fn new(
        demands: impl IntoIterator<Item = (String, u64)>,
        limits: AnalysisRetentionLimits,
    ) -> Result<Self, ProtocolError> {
        let mut components = BTreeMap::new();
        for (subject, bits) in demands {
            let tolerance = f64::from_bits(bits);
            if !tolerance.is_finite() || tolerance < 0.0 {
                return Err(ProtocolError::new(
                    ErrorKind::InvalidClaim,
                    "Connected-component tolerance must be finite and non-negative.",
                ));
            }
            components
                .entry((subject, tolerance_bits(tolerance)))
                .or_insert_with(OnceCell::new);
            if components.len() as u64 > u64::from(limits.max_mesh_entries) {
                return Err(ProtocolError::new(ErrorKind::LimitExceeded, "Prepared connected-component demands exceed the declared analysis entry limit."));
            }
        }
        Ok(Self {
            components,
            retained_bytes: Cell::new(0),
            byte_limit: limits.max_mesh_bytes,
        })
    }

    /// Caller pays requested work before reaching this cache, warm or cold.
    pub(crate) fn connected_components(
        &self,
        subject: &str,
        tolerance: f64,
        analysis: &MeshAnalysis,
    ) -> Result<Rc<ConnectedComponents>, BackendError> {
        let cell = self
            .components
            .get(&(subject.to_owned(), tolerance_bits(tolerance)))
            .ok_or_else(|| BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "Connected-component demand was not declared by the prepared batch."
                    .into(),
            })?;
        if let Some(value) = cell.get() {
            return Ok(Rc::clone(value));
        }
        let value = analysis.connected_components(tolerance);
        let bytes = retained_component_bytes(&value);
        let total = self.retained_bytes.get().saturating_add(bytes);
        if total > self.byte_limit {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message:
                    "Connected-component results exceed the declared analysis retention byte limit."
                        .into(),
            });
        }
        let value = Rc::new(value);
        let _ = cell.set(Rc::clone(&value));
        self.retained_bytes.set(total);
        Ok(value)
    }
}

fn tolerance_bits(value: f64) -> u64 {
    if value == 0.0 {
        0
    } else {
        value.to_bits()
    }
}

/// Owned result allocations, including vector capacity and string buffers.
/// This excludes allocator overhead, batch-map metadata and transient work;
/// it is retention accounting, not a peak-RSS or runtime bound.
fn retained_component_bytes(value: &ConnectedComponents) -> u64 {
    let mut bytes = size_of::<ConnectedComponents>() as u64;
    bytes = bytes.saturating_add(
        (value.clusters.capacity() as u64).saturating_mul(size_of::<ClusterReport>() as u64),
    );
    bytes = bytes.saturating_add(
        (value.gaps.capacity() as u64).saturating_mul(size_of::<ClusterGap>() as u64),
    );
    for cluster in &value.clusters {
        bytes = bytes.saturating_add(cluster.label.capacity() as u64);
        bytes = bytes.saturating_add(
            (cluster.primitives.capacity() as u64)
                .saturating_mul(size_of::<PrimitiveRecord>() as u64),
        );
        for primitive in &cluster.primitives {
            bytes = bytes.saturating_add(primitive.name.capacity() as u64);
            if let Some(color) = &primitive.color {
                bytes = bytes.saturating_add(color.capacity() as u64);
            }
        }
    }
    for gap in &value.gaps {
        for text in [
            &gap.from_label,
            &gap.to_label,
            &gap.from_primitive,
            &gap.to_primitive,
        ] {
            bytes = bytes.saturating_add(text.capacity() as u64);
        }
    }
    bytes
}
