//! Finite prepared-batch component demands; no session-wide tolerance map.

use crate::protocol::{Observations, WorkCounter};
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
    pub(crate) observations: Option<Rc<Observations>>,
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
            observations: None,
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
        let bits = tolerance_bits(tolerance);
        let cell = self
            .components
            .get(&(subject.to_owned(), bits))
            .ok_or_else(|| BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "Connected-component demand was not declared by the prepared batch."
                    .into(),
            })?;
        if let Some(value) = cell.get() {
            if let Some(observations) = &self.observations {
                observations.add(WorkCounter::DerivedHits, 1);
            }
            return Ok(Rc::clone(value));
        }
        // A result an earlier plan accepted skips the build; the exact check
        // below implies the floor, so this plan's accounting is unchanged.
        let value = if let Some(value) = analysis.retained_components(bits) {
            if let Some(observations) = &self.observations {
                observations.add(WorkCounter::DerivedHits, 1);
            }
            value
        } else {
            if let Some(observations) = &self.observations {
                observations.add(WorkCounter::ComponentBuilds, 1);
            }
            let clusters = analysis.component_clusters(tolerance);
            // The floor implies the refusal below, before C(C-1)/2 gaps exist.
            let floor = retained_component_bytes_floor(&clusters);
            if self.retained_bytes.get().saturating_add(floor) > self.byte_limit {
                return Err(retention_refusal());
            }
            Rc::new(ConnectedComponents::from_clusters(clusters))
        };
        let bytes = retained_component_bytes(&value.clusters, &value.gaps);
        let total = self.retained_bytes.get().saturating_add(bytes);
        if total > self.byte_limit {
            return Err(retention_refusal());
        }
        let _ = cell.set(Rc::clone(&value));
        self.retained_bytes.set(total);
        analysis.retain_components(bits, &value);
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

fn retention_refusal() -> BackendError {
    BackendError {
        kind: BackendErrorKind::Unsupported,
        message: "Connected-component results exceed the declared analysis retention byte limit."
            .into(),
    }
}

/// Owned result allocations, including vector capacity and string buffers.
/// This excludes allocator overhead, batch-map metadata and transient work;
/// it is retention accounting, not a peak-RSS or runtime bound.
fn retained_component_bytes(clusters: &Vec<ClusterReport>, gaps: &Vec<ClusterGap>) -> u64 {
    let mut bytes = size_of::<ConnectedComponents>() as u64;
    bytes = bytes.saturating_add(
        (clusters.capacity() as u64).saturating_mul(size_of::<ClusterReport>() as u64),
    );
    bytes = bytes
        .saturating_add((gaps.capacity() as u64).saturating_mul(size_of::<ClusterGap>() as u64));
    for cluster in clusters {
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
    for gap in gaps {
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

/// Never above `retained_component_bytes` of `ConnectedComponents::from_clusters`
/// on these clusters: it pushes exactly one gap per pair, each cloning both
/// labels and one primitive name per side, and capacity is at least length.
/// Every term is exact or smaller, and saturating sums of non-negative terms
/// are order-free and monotone.
fn retained_component_bytes_floor(clusters: &Vec<ClusterReport>) -> u64 {
    let count = clusters.len() as u64;
    let pairs = count.saturating_mul(count.saturating_sub(1)) / 2;
    let text = clusters.iter().fold(0_u64, |sum, cluster| {
        let shortest = cluster
            .primitives
            .iter()
            .map(|primitive| primitive.name.len())
            .min();
        sum.saturating_add(cluster.label.len() as u64)
            .saturating_add(shortest.unwrap_or(0) as u64)
    });
    retained_component_bytes(clusters, &Vec::new())
        .saturating_add(pairs.saturating_mul(size_of::<ClusterGap>() as u64))
        .saturating_add(count.saturating_sub(1).saturating_mul(text))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::mesh::{analyze, MeshAnalysisRecord, Primitive};
    use std::alloc::{GlobalAlloc, Layout, System};

    /// Passes every request to `System`, noting each thread's largest one.
    struct LargestRequest;

    #[global_allocator]
    static ALLOCATOR: LargestRequest = LargestRequest;

    thread_local! {
        static LARGEST: Cell<usize> = const { Cell::new(0) };
    }

    fn note(size: usize) {
        let _ = LARGEST.try_with(|largest| largest.set(largest.get().max(size)));
    }

    unsafe impl GlobalAlloc for LargestRequest {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            note(layout.size());
            System.alloc(layout)
        }

        unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
            note(layout.size());
            System.alloc_zeroed(layout)
        }

        unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, size: usize) -> *mut u8 {
            note(size);
            System.realloc(pointer, layout, size)
        }

        unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
            System.dealloc(pointer, layout);
        }
    }

    fn largest_request<T>(run: impl FnOnce() -> T) -> (T, usize) {
        LARGEST.with(|largest| largest.set(0));
        let value = run();
        (value, LARGEST.with(Cell::get))
    }

    /// Separate clusters, each joining a short-named and a long-named primitive.
    fn scattered_clusters(count: u32) -> MeshAnalysis {
        let mut record = MeshAnalysisRecord {
            positions: Vec::new(),
            triangles: Vec::new(),
            triangle_primitives: Vec::new(),
            primitives: Vec::new(),
        };
        for cluster in 0..count {
            let x = f64::from(cluster) * 10.0;
            for (offset, name) in [
                (0.0, format!("p{cluster}#0")),
                (0.5, format!("primitive-{cluster}#0")),
            ] {
                let vertex_start = record.positions.len() as u32;
                record.positions.extend([
                    [x + offset, offset, 0.0],
                    [x + offset + 1.0, offset, 0.0],
                    [x + offset, offset + 1.0, 0.0],
                ]);
                record
                    .triangles
                    .push([vertex_start, vertex_start + 1, vertex_start + 2]);
                record
                    .triangle_primitives
                    .push(record.primitives.len() as u32);
                record.primitives.push(Primitive {
                    name,
                    vertex_start,
                    vertex_count: 3,
                });
            }
        }
        analyze(&Rc::new(record)).unwrap()
    }

    fn batch(max_mesh_bytes: u64) -> BatchAnalysis {
        let limits = AnalysisRetentionLimits {
            max_mesh_bytes,
            max_mesh_entries: 2,
            max_solid_entries: 0,
        };
        BatchAnalysis::new([("a".to_owned(), 0), ("b".to_owned(), 0)], limits).unwrap()
    }

    #[test]
    fn refuses_unaffordable_gaps_before_building_them() {
        let refusal = Some(BackendError {
            kind: BackendErrorKind::Unsupported,
            message:
                "Connected-component results exceed the declared analysis retention byte limit."
                    .into(),
        });
        let analysis = scattered_clusters(400);
        let clusters = analysis.component_clusters(0.0);
        let floor = retained_component_bytes_floor(&clusters);
        let expected = ConnectedComponents::from_clusters(clusters);
        let exact = retained_component_bytes(&expected.clusters, &expected.gaps);
        let gap_bytes = expected.gaps.len() * size_of::<ClusterGap>();
        assert_eq!((expected.count, expected.gaps.len()), (400, 400 * 399 / 2));
        assert!(floor < exact);

        // The floor fits, so the gaps are built and then refused as before.
        let post_hoc = batch(exact - 1);
        let (result, largest) =
            largest_request(|| post_hoc.connected_components("a", 0.0, &analysis));
        assert_eq!(result.err(), refusal);
        assert!(largest >= gap_bytes);

        // Below the floor, the same refusal comes without a gap-sized request.
        let pre_check = batch(floor - 1);
        let (result, largest) =
            largest_request(|| pre_check.connected_components("a", 0.0, &analysis));
        assert_eq!(result.err(), refusal);
        assert!(largest * 16 < gap_bytes);
        assert_eq!(pre_check.retained_bytes.get(), 0);

        // An exact fit is kept, and retained bytes count toward the next floor.
        let cumulative = batch(exact);
        let value = cumulative
            .connected_components("a", 0.0, &analysis)
            .unwrap();
        assert_eq!(*value, expected);
        assert_eq!(cumulative.retained_bytes.get(), exact);
        let (result, largest) =
            largest_request(|| cumulative.connected_components("b", 0.0, &analysis));
        assert_eq!(result.err(), refusal);
        assert!(largest * 16 < gap_bytes);
        assert_eq!(cumulative.retained_bytes.get(), exact);
    }
}
