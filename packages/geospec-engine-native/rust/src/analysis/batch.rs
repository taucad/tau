//! Finite prepared-batch component demands; no session-wide tolerance map.

use crate::protocol::{Observations, WorkCounter};
use std::{
    cell::{Cell, OnceCell},
    collections::BTreeMap,
    mem::size_of,
    rc::Rc,
};

use super::mesh::{
    exact::{atomic_steps, charge, logical_steps, ChargeRun, ChargeTrace},
    ClusterGap, ClusterReport, ConnectedComponents, MeshAnalysis, PrimitiveRecord,
};
use crate::{
    backend::{AnalysisRetentionLimits, BackendError, BackendErrorKind},
    budget::Budget,
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
        budget: &Budget,
        slot: &OnceCell<(u64, Rc<ExactClusters>)>,
    ) -> Result<Rc<ConnectedComponents>, BackendError> {
        let clusters = self.exact_clusters(
            slot,
            tolerance,
            budget,
            |trace| {
                analysis
                    .component_clusters_traced(tolerance, budget, self.byte_limit, trace)
                    .map(|clusters| (clusters, Vec::new()))
            },
            |error, _, _| BackendError {
                kind: BackendErrorKind::BudgetExceeded {
                    limit: error.limit,
                    used: error.used,
                },
                message: "Material component work exceeds the declared budget.".into(),
            },
        )?;
        let bits = tolerance_bits(tolerance);
        let cell = self.cell(subject, bits)?;
        if let Some(value) = cell.get() {
            return Ok(Rc::clone(value));
        }
        let value = if let Some(value) = analysis.retained_components(bits) {
            value
        } else {
            self.gaps(clusters.clusters.clone())?
        };
        if self.keep(cell, &value)? {
            analysis.retain_components(bits, &value);
        }
        Ok(value)
    }

    /// M2 exact STEP clusters, retained by the subject's `slot` at the first
    /// tolerance a claim built them for, as a mesh analysis retains its
    /// result, with each accepted cold charge in order. A refused build is
    /// never retained (policy §16). Replaying one charge at a time preserves
    /// the cold refusal boundary and its body pair on a warm claim.
    pub(crate) fn exact_clusters<E>(
        &self,
        slot: &OnceCell<(u64, Rc<ExactClusters>)>,
        tolerance: f64,
        budget: &Budget,
        build: impl FnOnce(&mut ChargeTrace) -> Result<(Vec<ClusterReport>, Vec<String>), E>,
        on_exceeded: impl Fn(crate::budget::BudgetExceeded, Option<(usize, usize)>, &[String]) -> E,
    ) -> Result<Rc<ExactClusters>, E> {
        let bits = tolerance_bits(tolerance);
        if let Some((_, value)) = slot.get().filter(|(key, _)| *key == bits) {
            if trace_matches(value) {
                for step in atomic_steps(&value.trace) {
                    charge(budget, step.units)
                        .map_err(|exceeded| on_exceeded(exceeded, step.pair, &value.labels))?;
                }
                self.observe(WorkCounter::DerivedHits);
                return Ok(Rc::clone(value));
            }
        }
        self.observe(WorkCounter::ComponentBuilds);
        let before = budget.used();
        let mut trace = ChargeTrace::default();
        let (clusters, labels) = build(&mut trace)?;
        let value = Rc::new(ExactClusters {
            units: budget.used() - before,
            clusters,
            labels,
            trace: trace.steps,
            trace_complete: trace.complete,
            stage_calls: trace.stage_calls,
            stage_units: trace.stage_units,
        });
        // ponytail: one tolerance per subject, as the mesh slot; key a
        // byte-bounded map by tolerance if specs alternate tolerances.
        if retained_exact_bytes(&value) <= self.byte_limit && trace_matches(&value) {
            let _ = slot.set((bits, Rc::clone(&value)));
        }
        Ok(value)
    }

    /// The complete profile's STEP result from exact clusters, under the
    /// mesh route's accounting: the floor before any of the C(C-1)/2 gaps
    /// exists, then the exact retained bytes of the declared batch cell.
    pub(crate) fn step_components(
        &self,
        subject: &str,
        tolerance: f64,
        clusters: &ExactClusters,
    ) -> Result<Rc<ConnectedComponents>, BackendError> {
        let cell = self.cell(subject, tolerance_bits(tolerance))?;
        if let Some(value) = cell.get() {
            self.observe(WorkCounter::DerivedHits);
            return Ok(Rc::clone(value));
        }
        let value = self.gaps(clusters.clusters.clone())?;
        self.keep(cell, &value)?;
        Ok(value)
    }

    fn cell(
        &self,
        subject: &str,
        bits: u64,
    ) -> Result<&OnceCell<Rc<ConnectedComponents>>, BackendError> {
        self.components
            .get(&(subject.to_owned(), bits))
            .ok_or_else(|| BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "Connected-component demand was not declared by the prepared batch."
                    .into(),
            })
    }

    fn observe(&self, counter: WorkCounter) {
        if let Some(observations) = &self.observations {
            observations.add(counter, 1);
        }
    }

    /// The floor implies the refusal in `keep`, before C(C-1)/2 gaps exist.
    fn gaps(&self, clusters: Vec<ClusterReport>) -> Result<Rc<ConnectedComponents>, BackendError> {
        if retained_component_bytes_floor(&clusters) > self.byte_limit {
            return Err(retention_refusal());
        }
        Ok(Rc::new(ConnectedComponents::from_clusters(clusters)))
    }

    /// C8 (ruling 12): a result refuses only when it alone exceeds the limit,
    /// whatever other claims of the plan retained. It is retained, and
    /// `keep` answers `true`, only while the batch stays within the limit; a
    /// later demand of an unretained cell rebuilds it, having paid for it as
    /// a cold claim does.
    fn keep(
        &self,
        cell: &OnceCell<Rc<ConnectedComponents>>,
        value: &Rc<ConnectedComponents>,
    ) -> Result<bool, BackendError> {
        let bytes = retained_component_bytes(&value.clusters, &value.gaps);
        if bytes > self.byte_limit {
            return Err(retention_refusal());
        }
        let total = self.retained_bytes.get().saturating_add(bytes);
        if total > self.byte_limit {
            return Ok(false);
        }
        let _ = cell.set(Rc::clone(value));
        self.retained_bytes.set(total);
        Ok(true)
    }
}

/// M2 exact STEP clusters and the work units their build charged.
pub(crate) struct ExactClusters {
    pub(crate) clusters: Vec<ClusterReport>,
    pub(crate) units: u64,
    pub(crate) labels: Vec<String>,
    pub(crate) trace: Vec<ChargeRun>,
    pub(crate) trace_complete: bool,
    pub(crate) stage_calls: [u64; 6],
    pub(crate) stage_units: [u64; 6],
}

fn trace_units(trace: &[ChargeRun]) -> Option<u64> {
    trace.iter().try_fold(0_u64, |sum, step| {
        sum.checked_add(step.step.units.checked_mul(step.repetitions)?)
    })
}

fn trace_matches(value: &ExactClusters) -> bool {
    value.trace_complete
        && trace_units(&value.trace) == Some(value.units)
        && value
            .stage_units
            .iter()
            .try_fold(0_u64, |sum, units| sum.checked_add(*units))
            == Some(value.units)
        && value
            .stage_calls
            .iter()
            .try_fold(0u64, |sum, calls| sum.checked_add(*calls))
            == logical_steps(&value.trace)
}

fn retained_exact_bytes(value: &ExactClusters) -> u64 {
    let mut bytes = retained_component_bytes(&value.clusters, &Vec::new());
    bytes = bytes.saturating_add((2 * size_of::<[u64; 6]>()) as u64);
    bytes = bytes.saturating_add((value.trace.capacity() * size_of::<ChargeRun>()) as u64);
    bytes = bytes.saturating_add((value.labels.capacity() * size_of::<String>()) as u64);
    for label in &value.labels {
        bytes = bytes.saturating_add(label.capacity() as u64);
    }
    bytes
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
    use crate::analysis::mesh::exact::ChargeStep;
    use crate::analysis::mesh::{exact::ChargeStage, Aabb};
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
    fn scattered_clusters(count: u32) -> Vec<ClusterReport> {
        (0..count)
            .map(|cluster| {
                let x = f64::from(cluster) * 10.0;
                let primitives = [
                    (0.0, format!("p{cluster}#0")),
                    (0.5, format!("primitive-{cluster}#0")),
                ]
                .into_iter()
                .map(|(offset, name)| PrimitiveRecord {
                    name,
                    color: None,
                    vertices: 3,
                    aabb: Aabb {
                        min: [x + offset, offset, 0.0],
                        max: [x + offset + 1.0, offset + 1.0, 0.0],
                    },
                })
                .collect();
                ClusterReport {
                    label: format!("p{cluster}"),
                    primitives,
                    aabb: Aabb {
                        min: [x, 0.0, 0.0],
                        max: [x + 1.5, 1.5, 0.0],
                    },
                    centroid: [x + 0.75, 0.75, 0.0],
                    total_vertices: 6,
                }
            })
            .collect()
    }

    fn exact_fixture(clusters: Vec<ClusterReport>) -> ExactClusters {
        ExactClusters {
            clusters,
            units: 0,
            labels: Vec::new(),
            trace: Vec::new(),
            trace_complete: true,
            stage_calls: [0; 6],
            stage_units: [0; 6],
        }
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
    fn exact_clusters_spend_and_answer_warm_as_cold() {
        // W2-COMP open issue 3: a later claim reuses the subject's exact STEP
        // clusters, charging what their build charged, and rebuilds when its
        // budget cannot cover that total, refusing exactly as a cold claim.
        let clusters = scattered_clusters(2);
        let batch = batch(u64::MAX);
        let slot = OnceCell::new();
        let builds = Cell::new(0);
        let build = |budget: &Budget, trace: &mut ChargeTrace| {
            builds.set(builds.get() + 1);
            charge(budget, 1)?;
            trace.record(ChargeStep {
                units: 1,
                pair: None,
                stage: ChargeStage::BodySetup,
            });
            charge(budget, 2)?;
            trace.record(ChargeStep {
                units: 2,
                pair: Some((0, 1)),
                stage: ChargeStage::FaceDistance,
            });
            Ok::<_, crate::budget::BudgetExceeded>((clusters.clone(), vec!["a".into(), "b".into()]))
        };
        let claim = |limit: u64| {
            let budget = Budget::new(limit);
            let result = batch
                .exact_clusters(
                    &slot,
                    0.0,
                    &budget,
                    |trace| build(&budget, trace),
                    |error, _, _| error,
                )
                .map(|value| value.clusters.clone());
            (result, budget.used())
        };
        let cold = claim(100);
        assert_eq!((builds.get(), cold.1), (1, 3));
        assert_eq!(cold.0.as_ref().unwrap(), &clusters);
        let stages = &slot.get().unwrap().1;
        assert_eq!(stages.stage_calls, [1, 0, 0, 1, 0, 0]);
        assert_eq!(stages.stage_units, [1, 0, 0, 2, 0, 0]);
        // Warm: no build, the same three units, the same clusters.
        assert_eq!(claim(100), cold);
        assert_eq!(builds.get(), 1);
        // Exactly the total still answers warm; one unit less refuses at
        // the same charge as a cold claim without rebuilding.
        assert_eq!(claim(3), cold);
        assert_eq!(builds.get(), 1);
        let short = claim(2);
        assert_eq!(builds.get(), 1);
        let fresh = OnceCell::new();
        let budget = Budget::new(2);
        let cold_short = batch
            .exact_clusters(
                &fresh,
                0.0,
                &budget,
                |trace| build(&budget, trace),
                |error, _, _| error,
            )
            .map(|value| value.clusters.clone());
        assert_eq!(short, (cold_short, budget.used()));
        assert!(
            short.0.is_err() && fresh.get().is_none(),
            "a refusal is never retained"
        );
        // Another tolerance builds without replacing the retained one.
        let other = Budget::new(100);
        batch
            .exact_clusters(
                &slot,
                1.0,
                &other,
                |trace| build(&other, trace),
                |error, _, _| error,
            )
            .unwrap();
        assert_eq!((builds.get(), slot.get().unwrap().0), (3, 0));
    }

    #[test]
    fn exact_clusters_replay_refusal_prefix_and_prior_spend() {
        let batch = batch(u64::MAX);
        let slot = OnceCell::new();
        let builds = Cell::new(0);
        let claim = |slot: &OnceCell<(u64, Rc<ExactClusters>)>, limit, prior| {
            let budget = Budget::new(limit);
            charge(&budget, prior).unwrap();
            let result = batch.exact_clusters(
                slot,
                0.0,
                &budget,
                |trace| {
                    builds.set(builds.get() + 1);
                    for (units, pair) in [(1, None), (0, None), (2, Some((0, 1)))] {
                        charge(&budget, units)
                            .map_err(|error| (error, pair, vec!["a".into(), "b".into()]))?;
                        trace.record(ChargeStep {
                            units,
                            pair,
                            stage: ChargeStage::FaceDistance,
                        });
                    }
                    Ok((Vec::new(), vec!["a".into(), "b".into()]))
                },
                |error, pair, labels| (error, pair, labels.to_vec()),
            );
            (result.map(|value| value.clusters.clone()), budget.used())
        };
        assert!(claim(&slot, 3, 0).0.is_ok());
        for (limit, prior) in [(0, 0), (1, 0), (2, 0), (3, 0), (3, 1), (4, 1)] {
            let fresh = OnceCell::new();
            let cold = claim(&fresh, limit, prior);
            let warm = claim(&slot, limit, prior);
            assert_eq!(warm, cold, "limit {limit}, prior {prior}");
        }
        assert_eq!(builds.get(), 1 + 6);
    }

    #[test]
    fn incomplete_trace_is_not_retained() {
        let mut overflow = ChargeTrace::default();
        overflow.record(ChargeStep {
            units: u64::MAX,
            pair: None,
            stage: ChargeStage::BodySetup,
        });
        overflow.record(ChargeStep {
            units: 1,
            pair: None,
            stage: ChargeStage::BodySetup,
        });
        assert!(!overflow.complete);
        assert!(overflow.steps.is_empty());

        let mut trace = ChargeTrace::with_limit(2);
        for index in 0..3 {
            trace.record(ChargeStep {
                units: 0,
                pair: None,
                stage: if index % 2 == 0 {
                    ChargeStage::BodySetup
                } else {
                    ChargeStage::FaceDistance
                },
            });
        }
        assert!(!trace.complete);
        assert!(trace.steps.is_empty());
        assert_eq!(trace.stage_calls, [0; 6]);
        assert_eq!(trace.stage_units, [0; 6]);
        trace.record(ChargeStep {
            units: 1,
            pair: None,
            stage: ChargeStage::BodySetup,
        });
        assert!(trace.steps.is_empty());

        let batch = batch(u64::MAX);
        let slot = OnceCell::new();
        let budget = Budget::new(0);
        let callbacks = 4 * 1024 * 1024 / size_of::<ChargeStep>() + 1;
        batch
            .exact_clusters(
                &slot,
                0.0,
                &budget,
                |trace| {
                    for index in 0..callbacks {
                        trace.record(ChargeStep {
                            units: 0,
                            pair: None,
                            stage: if index % 2 == 0 {
                                ChargeStage::BodySetup
                            } else {
                                ChargeStage::FaceDistance
                            },
                        });
                    }
                    Ok::<_, crate::budget::BudgetExceeded>((Vec::new(), Vec::new()))
                },
                |error, _, _| error,
            )
            .unwrap();
        assert!(slot.get().is_none(), "a truncated trace cannot be replayed");
    }

    #[test]
    fn refuses_unaffordable_gaps_before_building_them() {
        let refusal = Some(BackendError {
            kind: BackendErrorKind::Unsupported,
            message:
                "Connected-component results exceed the declared analysis retention byte limit."
                    .into(),
        });
        let input = exact_fixture(scattered_clusters(400));
        let clusters = input.clusters.clone();
        let floor = retained_component_bytes_floor(&clusters);
        let expected = ConnectedComponents::from_clusters(clusters);
        let exact = retained_component_bytes(&expected.clusters, &expected.gaps);
        let gap_bytes = expected.gaps.len() * size_of::<ClusterGap>();
        assert_eq!((expected.count, expected.gaps.len()), (400, 400 * 399 / 2));
        assert!(floor < exact);

        // The floor fits, so the gaps are built and then refused as before.
        let post_hoc = batch(exact - 1);
        let (result, largest) = largest_request(|| post_hoc.step_components("a", 0.0, &input));
        assert_eq!(result.err(), refusal);
        assert!(largest >= gap_bytes);

        // Below the floor, the same refusal comes without a gap-sized request.
        let pre_check = batch(floor - 1);
        let (result, largest) = largest_request(|| pre_check.step_components("a", 0.0, &input));
        assert_eq!(result.err(), refusal);
        assert!(largest * 16 < gap_bytes);
        assert_eq!(pre_check.retained_bytes.get(), 0);

        // An exact fit is kept. Ruling 12: another claim's cell of the same
        // size answers too, as it does alone, but is not retained, by the
        // batch or by its analysis, so neither holds more than the limit.
        let two_claims = batch(exact);
        let value = two_claims.step_components("a", 0.0, &input).unwrap();
        assert_eq!(*value, expected);
        assert_eq!(two_claims.retained_bytes.get(), exact);
        let value = two_claims.step_components("b", 0.0, &input).unwrap();
        assert_eq!(*value, expected);
        assert_eq!(two_claims.retained_bytes.get(), exact);
        assert!(two_claims.cell("b", 0).unwrap().get().is_none());
        let fresh = exact_fixture(scattered_clusters(400));
        let value = two_claims.step_components("b", 0.0, &fresh).unwrap();
        assert_eq!(*value, expected);
        assert!(two_claims.cell("b", 0).unwrap().get().is_none());
    }

    #[test]
    fn a_step_claim_answers_as_alone_beside_a_retained_one() {
        // Ruling 12: two complete-profile STEP claims on different
        // cells, each B bytes with B <= limit < 2B, both answer in one plan
        // as each does alone; only the first is retained.
        let clusters = scattered_clusters(40);
        let expected = ConnectedComponents::from_clusters(clusters.clone());
        let bytes = retained_component_bytes(&expected.clusters, &expected.gaps);
        let exact = ExactClusters {
            clusters,
            units: 0,
            labels: Vec::new(),
            trace: Vec::new(),
            trace_complete: true,
            stage_calls: [0; 6],
            stage_units: [0; 6],
        };
        let plan = batch(2 * bytes - 1);
        let alone = batch(2 * bytes - 1);
        assert_eq!(*plan.step_components("a", 0.0, &exact).unwrap(), expected);
        let second = plan.step_components("b", 0.0, &exact).unwrap();
        assert_eq!(second, alone.step_components("b", 0.0, &exact).unwrap());
        assert_eq!(*second, expected);
        assert_eq!(plan.retained_bytes.get(), bytes);
        assert!(plan.cell("b", 0).unwrap().get().is_none());
        // A result above the limit alone still refuses.
        let small = batch(bytes - 1);
        assert_eq!(
            small
                .step_components("a", 0.0, &exact)
                .err()
                .map(|error| error.message),
            Some(retention_refusal().message)
        );
    }
}
