//! Pairwise component overlap. Mesh subjects: an approximate observation of
//! f32-merged polyhedral Boolean output, never a material-overlap proof. STEP
//! subjects (S10, INTERFERENCE-EXACT-01): the exact regular-solid Common of
//! each candidate pair of leaf occurrences.

use crate::protocol::WorkCounter;
use std::{
    cell::RefCell,
    collections::{BTreeMap, HashMap, VecDeque},
    mem::size_of,
    rc::{Rc, Weak},
};

use crate::{
    analysis::mesh::{analyze, MeshAnalysisRecord, Primitive},
    backend::{
        brep::{
            Bounds, BrepSubject, OccurrenceFacts, OccurrenceOverlap, OperandMemo,
            TessellationProfile,
        },
        csg::{BooleanOp, SolidId},
        csg_scope::CsgScope,
        BackendError, BackendErrorKind, TriangleMesh,
    },
    budget::{Budget, BudgetExceeded},
    codec::Json,
    result::Diagnostic,
    subject::Subject,
};

mod cache;

pub(crate) const DEFAULT_TOLERANCE_MM: f64 = 0.001;
pub(crate) const TESSELLATION_PROFILE: TessellationProfile = TessellationProfile {
    linear_deflection_mm: 0.01,
    angular_deflection_rad: 15.0_f64.to_radians(),
};

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Component {
    pub id: u32,
    pub label: String,
    /// The polyhedral operand of a mesh partition; an exact STEP leaf has none.
    pub mesh: Option<Rc<TriangleMesh>>,
    /// Mesh bounds, or a STEP leaf's exact `AddOptimal` occurrence box.
    pub bounds: Bounds,
}

impl Component {
    fn mesh(&self) -> &Rc<TriangleMesh> {
        self.mesh
            .as_ref()
            .expect("a mesh partition component owns its operand")
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ComponentIdentity {
    pub id: u32,
    pub label: String,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct SelectedPair {
    pub left: u32,
    pub right: u32,
    pub left_label: String,
    pub right_label: String,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Overlap {
    pub left_component_id: u32,
    pub right_component_id: u32,
    pub left_label: String,
    pub right_label: String,
    pub intersection_volume: f64,
    pub witness_point: Option<[f64; 3]>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Evidence {
    /// INTERFERENCE-EXACT-01 (STEP leaves) rather than the mesh observation.
    pub exact: bool,
    pub component_count: usize,
    pub components: Vec<ComponentEvidence>,
    pub selected_pairs: Option<Vec<SelectedPair>>,
    pub checked_pairs: usize,
    pub tolerance: f64,
    pub overlaps: Vec<Overlap>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ComponentEvidence {
    pub id: u32,
    pub label: String,
    pub bounds: Bounds,
}

pub(crate) enum Analysis {
    Complete(Evidence),
    Refused(Vec<Diagnostic>),
    /// S10: the claim's budget cannot afford this pair's counted work, so its
    /// Boolean never ran; shared budget exhaustion is `MATCHER_TIMEOUT` (§16).
    PairBudget {
        exceeded: BudgetExceeded,
        pair: SelectedPair,
        work: u64,
    },
}

/// Identities and labels are retained admission facts. Lead uses this before
/// proof execution to expand pair and allowance patterns at the batch barrier.
pub(crate) fn component_labels(
    subject: &Subject,
) -> Result<Rc<Vec<ComponentIdentity>>, BackendError> {
    subject.component_labels()
}

pub(crate) fn build_component_labels(
    subject: &Subject,
) -> Result<Vec<ComponentIdentity>, BackendError> {
    if let Some(record) = subject.mesh_record() {
        if let Some(identities) = named_identities(record) {
            if identities.len() >= 2 {
                return Ok(identities);
            }
        }
    }
    // Labels are source occurrence structure; the report bundle is not built.
    let Some(occurrences) = subject.source_occurrence_structure()? else {
        return Ok(Vec::new());
    };
    Ok(leaf_components(&occurrences)
        .into_iter()
        .map(|id| ComponentIdentity {
            id,
            label: occurrence_label(&occurrences[id as usize], id as usize),
        })
        .collect())
}

/// C2 (rulings 6 and 32): the component partition is the leaves (occurrences
/// no other occurrence names as parent) that own at least one face. A parent
/// is assembly structure, and a zero-face leaf stays a selector occurrence.
pub(crate) fn leaf_components(occurrences: &[OccurrenceFacts]) -> Vec<u32> {
    let mut parents = vec![false; occurrences.len()];
    for occurrence in occurrences {
        if let Some(slot) = occurrence
            .parent
            .and_then(|parent| parents.get_mut(parent as usize))
        {
            *slot = true;
        }
    }
    (0..occurrences.len())
        .filter(|&index| !parents[index] && occurrences[index].face_count > 0)
        .map(|index| index as u32)
        .collect()
}

pub(crate) enum PreparedComponents {
    Ready(PreparedOverlap),
    Refused(Vec<Diagnostic>),
}

pub(crate) struct PreparedOverlap {
    components: Vec<Component>,
    operand_identity: String,
    retained_bytes: u64,
    completed: RefCell<Option<CompletedOverlap>>,
}

/// Physical retention only: this ceiling never changes admission or verdicts.
const MAX_RESIDENT_OVERLAP_BYTES: u64 = 8 * 1024 * 1024;

/// One engine-wide LRU over the existing subject-owned completed values. Weak
/// entries neither keep subjects alive nor copy their evidence/mesh allocations.
pub(crate) struct ResidentOverlaps {
    max_bytes: u64,
    // ponytail: linear scans are bounded by the engine's retained subject count
    // (32 at entry); use an indexed queue only if that bound grows materially.
    entries: VecDeque<(Weak<PreparedComponents>, u64)>,
}

impl ResidentOverlaps {
    pub(crate) fn new(analysis_limit: u64) -> Self {
        Self {
            max_bytes: analysis_limit.min(MAX_RESIDENT_OVERLAP_BYTES),
            entries: VecDeque::new(),
        }
    }

    pub(crate) fn prune(&mut self) {
        self.entries.retain(|(owner, _)| owner.strong_count() != 0);
    }

    fn forget(&mut self, owner: &Rc<PreparedComponents>) {
        let key = Rc::downgrade(owner);
        self.entries
            .retain(|(entry, _)| entry.strong_count() != 0 && !entry.ptr_eq(&key));
    }

    fn touch(&mut self, owner: &Rc<PreparedComponents>) {
        let key = Rc::downgrade(owner);
        if let Some(index) = self
            .entries
            .iter()
            .position(|(entry, _)| entry.ptr_eq(&key))
        {
            let entry = self.entries.remove(index).expect("located resident entry");
            self.entries.push_back(entry);
        }
    }

    fn insert(&mut self, owner: &Rc<PreparedComponents>, completed: CompletedOverlap) {
        let PreparedComponents::Ready(prepared) = owner.as_ref() else {
            return;
        };
        self.forget(owner);
        *prepared.completed.borrow_mut() = None;
        let bytes = completed.allocated_bytes();
        if bytes > self.max_bytes {
            return;
        }
        let mut retained: u64 = self.entries.iter().map(|(_, bytes)| bytes).sum();
        while retained > self.max_bytes - bytes {
            let (evicted, size) = self
                .entries
                .pop_front()
                .expect("resident bytes have an owner");
            if let Some(evicted) = evicted.upgrade() {
                if let PreparedComponents::Ready(value) = evicted.as_ref() {
                    *value.completed.borrow_mut() = None;
                }
            }
            retained -= size;
        }
        *prepared.completed.borrow_mut() = Some(completed);
        self.entries.push_back((Rc::downgrade(owner), bytes));
    }
}

// Owned data only: no source or temporary backend handles enter this cell.
#[derive(Clone)]
struct CompletedOverlap {
    evidence: Evidence,
    requests: Vec<OverlapRequest>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum OverlapRequest {
    // Identity is the enclosing PreparedOverlap's immutable operand_identity.
    Source {
        component: u32,
        units: u64,
    },
    Boolean,
    Properties,
    /// One exact pair's counted work (S10), replayed in order on a hit.
    Pair {
        left: u32,
        right: u32,
        work: u64,
    },
}

impl CompletedOverlap {
    fn matches(&self, tolerance: f64, selected: Option<&[SelectedPair]>) -> bool {
        normalized_bits(self.evidence.tolerance) == normalized_bits(tolerance)
            && self.evidence.selected_pairs.as_deref() == selected
    }

    // Inline record storage is already counted in PreparedComponents. Count
    // every retained allocation's capacity, including the owned selection key.
    fn allocated_bytes(&self) -> u64 {
        let evidence = &self.evidence;
        let mut bytes = allocation_bytes::<OverlapRequest>(self.requests.capacity())
            .saturating_add(allocation_bytes::<ComponentEvidence>(
                evidence.components.capacity(),
            ))
            .saturating_add(allocation_bytes::<Overlap>(evidence.overlaps.capacity()));
        for component in &evidence.components {
            bytes = bytes.saturating_add(component.label.capacity() as u64);
        }
        for overlap in &evidence.overlaps {
            bytes = bytes
                .saturating_add(overlap.left_label.capacity() as u64)
                .saturating_add(overlap.right_label.capacity() as u64);
        }
        if let Some(pairs) = &evidence.selected_pairs {
            bytes = bytes.saturating_add(allocation_bytes::<SelectedPair>(pairs.capacity()));
            for pair in pairs {
                bytes = bytes
                    .saturating_add(pair.left_label.capacity() as u64)
                    .saturating_add(pair.right_label.capacity() as u64);
            }
        }
        bytes
    }
}

const fn normalized_bits(value: f64) -> u64 {
    if value == 0.0 {
        0
    } else {
        value.to_bits()
    }
}

fn allocation_bytes<T>(capacity: usize) -> u64 {
    (capacity as u64).saturating_mul(size_of::<T>() as u64)
}

fn operand_identity(subject: &Subject) -> Result<String, BackendError> {
    Ok(format!(
        "{}:overlap-partition-v1:{:016x}:{:016x}",
        subject.cache_identity()?,
        TESSELLATION_PROFILE.linear_deflection_mm.to_bits(),
        TESSELLATION_PROFILE.angular_deflection_rad.to_bits()
    ))
}

pub(crate) fn prepare_components(subject: &Subject) -> Result<PreparedComponents, BackendError> {
    let mut components = match components(subject)? {
        Partition::Components(value) => value,
        Partition::Inconclusive(primitive_count) => {
            let mut diagnostic = Diagnostic::error(
                "GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE",
                "GeoSpec could not partition this subject into two or more components.",
            );
            diagnostic.suggestion = Some("Name the parts in the source model (one glTF node per part) so component interference has identifiable components.".into());
            diagnostic.details = Some(Json::object([(
                "primitiveCount",
                Json::Number(primitive_count as f64),
            )]));
            return Ok(PreparedComponents::Refused(vec![diagnostic]));
        }
    };

    // Exact STEP leaves carry no mesh; their operands qualify per candidate pair.
    for component in components.iter_mut().filter(|value| value.mesh.is_some()) {
        if let Some(diagnostic) = closure_refusal(component) {
            return Ok(PreparedComponents::Refused(vec![diagnostic]));
        }
    }

    let operand_identity = operand_identity(subject)?;
    let meshes = components
        .iter()
        .filter(|value| value.mesh.is_some())
        .count();
    let bytes = components.iter().fold(
        (size_of::<PreparedComponents>() as u64)
            .saturating_add(allocation_bytes::<usize>(2)) // PreparedComponents Rc counters.
            .saturating_add(allocation_bytes::<Component>(components.capacity()))
            .saturating_add(operand_identity.capacity() as u64),
        |sum, component| {
            let sum = sum.saturating_add(component.label.capacity() as u64);
            let Some(mesh) = &component.mesh else {
                return sum;
            };
            sum.saturating_add(size_of::<TriangleMesh>() as u64)
                .saturating_add(allocation_bytes::<usize>(2)) // Mesh Rc counters.
                .saturating_add(allocation_bytes::<[f64; 3]>(mesh.positions.capacity()))
                .saturating_add(allocation_bytes::<[u32; 3]>(mesh.triangles.capacity()))
        },
    );
    if bytes > subject.retention_limits.max_mesh_bytes
        || meshes as u64 > u64::from(subject.retention_limits.max_mesh_entries)
    {
        return Err(BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "Component partition exceeds the configured analysis retention limit.".into(),
        });
    }
    Ok(PreparedComponents::Ready(PreparedOverlap {
        components,
        operand_identity,
        retained_bytes: bytes,
        completed: RefCell::new(None),
    }))
}

/// C3(a): the closure guard of one mesh component reads the component's own
/// vectors, moved into the analysis record and back rather than copied.
fn closure_refusal(component: &mut Component) -> Option<Diagnostic> {
    let mesh = component.mesh.take().expect("a mesh partition component");
    let TriangleMesh {
        positions,
        triangles,
    } = Rc::try_unwrap(mesh).unwrap_or_else(|shared| (*shared).clone());
    let record = Rc::new(MeshAnalysisRecord {
        triangle_primitives: vec![0; triangles.len()],
        primitives: vec![Primitive {
            name: component.label.clone(),
            vertex_start: 0,
            vertex_count: positions.len() as u32,
        }],
        positions,
        triangles,
    });
    let watertight = analyze(&record).watertight();
    let MeshAnalysisRecord {
        positions,
        triangles,
        ..
    } = Rc::try_unwrap(record).unwrap_or_else(|shared| (*shared).clone());
    let triangle_count = triangles.len();
    component.mesh = Some(Rc::new(TriangleMesh {
        positions,
        triangles,
    }));
    if watertight.watertight {
        return None;
    }
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_MANIFOLD_COMPONENT_INVALID",
        format!(
            "Component '{}' is not a closed oriented polyhedron, so the overlap observation is unavailable.",
            component.label
        ),
    );
    diagnostic.suggestion = Some("Repair the operand mesh to a closed oriented polyhedron; this ancillary operation reports an approximate observation, not an interference verdict.".into());
    diagnostic.spatial = Some(bounds_spatial(component.bounds));
    diagnostic.details = Some(Json::object([
        ("label", Json::string(&component.label)),
        ("triangleCount", Json::Number(triangle_count as f64)),
        (
            "watertight",
            Json::object([
                ("watertight", Json::Bool(watertight.watertight)),
                (
                    "irregularEdges",
                    Json::Number(watertight.irregular_edges as f64),
                ),
                (
                    "openBoundaryEdges",
                    Json::Number(watertight.open_boundary_edges as f64),
                ),
                (
                    "nonManifoldEdges",
                    Json::Number(watertight.non_manifold_edges as f64),
                ),
                ("totalEdges", Json::Number(watertight.total_edges as f64)),
                (
                    "irregularEdgeFraction",
                    Json::Number(watertight.irregular_edge_fraction),
                ),
            ]),
        ),
    ]));
    Some(diagnostic)
}

/// The mesh route: Manifold Booleans of a mesh subject's named components.
pub(crate) fn analyze_overlap(
    subject: &Subject,
    csg: &mut CsgScope<'_>,
    tolerance: f64,
    selected: Option<&[SelectedPair]>,
) -> Result<Analysis, BackendError> {
    if subject.brep.is_some() {
        return Err(BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "STEP overlap is the exact route; Manifold observes mesh subjects only."
                .into(),
        });
    }
    let prepared_owner = subject.overlap_components()?;
    let prepared = match prepared_owner.as_ref() {
        PreparedComponents::Ready(value) => value,
        PreparedComponents::Refused(diagnostics) => {
            return Ok(Analysis::Refused(diagnostics.clone()))
        }
    };

    // Subject verifies its semantic identity before returning this owner; bind
    // this partition/profile explicitly before any completed-result lookup.
    let operand_identity = operand_identity(subject)?;
    if prepared.operand_identity != operand_identity {
        return Err(BackendError {
            kind: BackendErrorKind::ComputationFailed,
            message: "Component partition identity differs from its immutable owner.".into(),
        });
    }
    let components = &prepared.components;
    {
        let completed = prepared.completed.borrow();
        if let Some(cached) = completed
            .as_ref()
            .filter(|value| value.matches(tolerance, selected))
        {
            for request in &cached.requests {
                match request {
                    OverlapRequest::Source { component, units } => {
                        csg.charge_cached_source(&operand_identity, *component, *units)?;
                    }
                    OverlapRequest::Boolean | OverlapRequest::Properties => csg.charge(1)?,
                    OverlapRequest::Pair { work, .. } => csg.charge(*work)?,
                }
            }
            if let Some(resident) = &subject.resident_overlaps {
                resident.borrow_mut().touch(&prepared_owner);
            }
            subject
                .observations
                .add(WorkCounter::OverlapResidentHits, 1);
            return Ok(Analysis::Complete(cached.evidence.clone()));
        }
    }
    // One most-recent success only. An obsolete retained result must not overlap
    // the next demand's retained allocations, including on a refused demand.
    *prepared.completed.borrow_mut() = None;
    if let Some(resident) = &subject.resident_overlaps {
        resident.borrow_mut().forget(&prepared_owner);
    }

    let selected_pairs = selected.map(|pairs| pairs.to_vec());
    let candidates = overlap_candidates(components, selected, tolerance);
    if let (Some(store), Some(producer)) = (&subject.overlap_cache, &subject.producer_identity) {
        let context = cache::EvidenceContext {
            subject,
            producer,
            tolerance,
            selected,
            components,
            candidates: &candidates,
        };
        if let Some(cached) = cache::load(&context, store.as_ref()) {
            if prepared
                .retained_bytes
                .saturating_add(cached.allocated_bytes())
                <= subject.retention_limits.max_mesh_bytes
            {
                for request in &cached.requests {
                    match request {
                        OverlapRequest::Source { component, units } => {
                            csg.charge_cached_source(&operand_identity, *component, *units)?;
                        }
                        OverlapRequest::Boolean | OverlapRequest::Properties => csg.charge(1)?,
                        OverlapRequest::Pair { work, .. } => csg.charge(*work)?,
                    }
                }
                subject.observations.add(WorkCounter::OverlapDiskHits, 1);
                let evidence = cached.evidence.clone();
                if let Some(resident) = &subject.resident_overlaps {
                    resident.borrow_mut().insert(&prepared_owner, cached);
                }
                return Ok(Analysis::Complete(evidence));
            }
        }
    }

    let volume_epsilon = tolerance.powi(3).max(1e-12);
    let mut admitted = BTreeMap::<u32, SolidId>::new();
    let mut requests = Vec::new();
    let mut overlaps = Vec::new();
    for (left_index, right_index) in &candidates {
        let left = &components[*left_index];
        let right = &components[*right_index];
        let left_solid = match admitted.get(&left.id).copied() {
            Some(value) => value,
            None => {
                requests.push(OverlapRequest::Source {
                    component: left.id,
                    units: CsgScope::mesh_cost(left.mesh()),
                });
                let value = match csg.admit_cached(&operand_identity, left.id, left.mesh(), &[]) {
                    Ok(value) => value,
                    Err(error) if error.kind == BackendErrorKind::InvalidInput => {
                        return Ok(Analysis::Refused(vec![admission_diagnostic(left, &error)]));
                    }
                    Err(error) => return Err(error),
                };
                admitted.insert(left.id, value);
                value
            }
        };
        let right_solid = match admitted.get(&right.id).copied() {
            Some(value) => value,
            None => {
                requests.push(OverlapRequest::Source {
                    component: right.id,
                    units: CsgScope::mesh_cost(right.mesh()),
                });
                let value = match csg.admit_cached(&operand_identity, right.id, right.mesh(), &[]) {
                    Ok(value) => value,
                    Err(error) if error.kind == BackendErrorKind::InvalidInput => {
                        return Ok(Analysis::Refused(vec![admission_diagnostic(right, &error)]));
                    }
                    Err(error) => return Err(error),
                };
                admitted.insert(right.id, value);
                value
            }
        };
        requests.push(OverlapRequest::Boolean);
        let intersection = csg.boolean(BooleanOp::Intersection, &[left_solid, right_solid])?;
        requests.push(OverlapRequest::Properties);
        let properties = csg.properties(intersection);
        csg.release_temporary(intersection)?;
        let properties = properties?;
        let volume = properties.signed_volume.abs();
        if volume > volume_epsilon {
            overlaps.push(Overlap {
                left_component_id: left.id,
                right_component_id: right.id,
                left_label: left.label.clone(),
                right_label: right.label.clone(),
                intersection_volume: volume,
                witness_point: properties.bounds.map(bounds_center),
            });
        }
    }
    let evidence = Evidence {
        exact: false,
        component_count: components.len(),
        components: component_evidence(components),
        selected_pairs,
        checked_pairs: candidates.len(),
        tolerance,
        overlaps,
    };
    subject.observations.add(WorkCounter::OverlapBuilds, 1);
    let completed = CompletedOverlap {
        evidence: evidence.clone(),
        requests,
    };
    if prepared
        .retained_bytes
        .saturating_add(completed.allocated_bytes())
        <= subject.retention_limits.max_mesh_bytes
    {
        if let (Some(store), Some(producer)) = (&subject.overlap_cache, &subject.producer_identity)
        {
            let context = cache::EvidenceContext {
                subject,
                producer,
                tolerance,
                selected,
                components,
                candidates: &candidates,
            };
            cache::publish(&context, &completed, store.as_ref());
        }
        if let Some(resident) = &subject.resident_overlaps {
            resident.borrow_mut().insert(&prepared_owner, completed);
        }
    }
    Ok(Analysis::Complete(evidence))
}

/// S10 (ruling 23, INTERFERENCE-EXACT-01): each candidate pair of leaf
/// occurrences, from their exact boxes, answers with the exact regular-solid
/// Common. The claim's memo qualifies an occurrence once (C7), and only for a
/// candidate pair, so an invalid non-candidate never refuses (ruling 10).
pub(crate) fn analyze_exact_overlap(
    subject: &Subject,
    brep: &dyn BrepSubject,
    memo: &mut OperandMemo,
    budget: &Budget,
    tolerance: f64,
    selected: Option<&[SelectedPair]>,
) -> Result<Analysis, BackendError> {
    // Every occurrence's exact box is requested, on warm replay too; the BRep
    // demand was already charged by the claim owner.
    if let Some(occurrences) = subject.source_occurrence_structure()? {
        if occurrences.len() >= 2 {
            charge(budget, occurrences.len() as u64)?;
        }
    }
    let prepared_owner = subject.overlap_components()?;
    let prepared = match prepared_owner.as_ref() {
        PreparedComponents::Ready(value) => value,
        PreparedComponents::Refused(diagnostics) => {
            return Ok(Analysis::Refused(diagnostics.clone()))
        }
    };
    if prepared.operand_identity != operand_identity(subject)? {
        return Err(BackendError {
            kind: BackendErrorKind::ComputationFailed,
            message: "Component partition identity differs from its immutable owner.".into(),
        });
    }
    let components = &prepared.components;
    {
        let completed = prepared.completed.borrow();
        if let Some(cached) = completed
            .as_ref()
            .filter(|value| value.evidence.exact && value.matches(tolerance, selected))
        {
            for request in &cached.requests {
                if let OverlapRequest::Pair { left, right, work } = request {
                    if let Some(exhausted) = afford(budget, components, *left, *right, *work)? {
                        return Ok(exhausted);
                    }
                }
            }
            if let Some(resident) = &subject.resident_overlaps {
                resident.borrow_mut().touch(&prepared_owner);
            }
            subject
                .observations
                .add(WorkCounter::OverlapResidentHits, 1);
            return Ok(Analysis::Complete(cached.evidence.clone()));
        }
    }
    *prepared.completed.borrow_mut() = None;
    if let Some(resident) = &subject.resident_overlaps {
        resident.borrow_mut().forget(&prepared_owner);
    }

    let candidates = overlap_candidates(components, selected, tolerance);
    let volume_epsilon = tolerance.powi(3).max(1e-12);
    let mut requests = Vec::with_capacity(candidates.len());
    let mut overlaps = Vec::new();
    for (left_index, right_index) in &candidates {
        let left = &components[*left_index];
        let right = &components[*right_index];
        let remaining = budget.limit().saturating_sub(budget.used());
        let (work, volume, bounds) = match brep
            .occurrence_overlap_memoized(left.id, right.id, tolerance, remaining, memo)?
        {
            OccurrenceOverlap::WorkExceeded { work } => {
                return afford(budget, components, left.id, right.id, work)?
                    .map(Ok)
                    .unwrap_or_else(|| {
                        Err(BackendError {
                            kind: BackendErrorKind::ComputationFailed,
                            message: "Exact overlap work exceeded an affordable limit.".into(),
                        })
                    });
            }
            OccurrenceOverlap::Unqualified {
                left: is_left,
                reason,
            } => {
                let component = if is_left { left } else { right };
                return Ok(Analysis::Refused(vec![exact_component_diagnostic(
                    component, &reason,
                )]));
            }
            OccurrenceOverlap::Residual {
                work,
                volume,
                bounds,
                ..
            } => (work, volume, bounds),
        };
        if let Some(exhausted) = afford(budget, components, left.id, right.id, work)? {
            return Ok(exhausted);
        }
        requests.push(OverlapRequest::Pair {
            left: left.id,
            right: right.id,
            work,
        });
        if volume > volume_epsilon {
            overlaps.push(Overlap {
                left_component_id: left.id,
                right_component_id: right.id,
                left_label: left.label.clone(),
                right_label: right.label.clone(),
                intersection_volume: volume,
                witness_point: bounds.map(bounds_center),
            });
        }
    }
    let evidence = Evidence {
        exact: true,
        component_count: components.len(),
        components: component_evidence(components),
        selected_pairs: selected.map(<[SelectedPair]>::to_vec),
        checked_pairs: candidates.len(),
        tolerance,
        overlaps,
    };
    subject.observations.add(WorkCounter::OverlapBuilds, 1);
    let completed = CompletedOverlap {
        evidence: evidence.clone(),
        requests,
    };
    // ponytail: resident reuse only; the authenticated disk family is the
    // Manifold route's. Add an exact family when cross-process reuse matters.
    if prepared
        .retained_bytes
        .saturating_add(completed.allocated_bytes())
        <= subject.retention_limits.max_mesh_bytes
    {
        if let Some(resident) = &subject.resident_overlaps {
            resident.borrow_mut().insert(&prepared_owner, completed);
        }
    }
    Ok(Analysis::Complete(evidence))
}

/// Charge one pair's counted work, or name the pair the budget cannot afford
/// without charging it, so the refusal keeps the pair (cold and warm alike).
fn afford(
    budget: &Budget,
    components: &[Component],
    left: u32,
    right: u32,
    work: u64,
) -> Result<Option<Analysis>, BackendError> {
    if work <= budget.limit().saturating_sub(budget.used()) {
        charge(budget, work)?;
        return Ok(None);
    }
    let label = |id: u32| {
        components
            .iter()
            .find(|component| component.id == id)
            .map(|component| component.label.clone())
            .unwrap_or_default()
    };
    Ok(Some(Analysis::PairBudget {
        exceeded: BudgetExceeded {
            limit: budget.limit(),
            used: budget.used().saturating_add(work),
        },
        pair: SelectedPair {
            left,
            right,
            left_label: label(left),
            right_label: label(right),
        },
        work,
    }))
}

fn charge(budget: &Budget, units: u64) -> Result<(), BackendError> {
    budget.charge(units).map_err(|error| BackendError {
        kind: BackendErrorKind::BudgetExceeded {
            limit: error.limit,
            used: error.used,
        },
        message: "The claim exhausted its logical request budget.".into(),
    })
}

fn component_evidence(components: &[Component]) -> Vec<ComponentEvidence> {
    components
        .iter()
        .map(|component| ComponentEvidence {
            id: component.id,
            label: component.label.clone(),
            bounds: component.bounds,
        })
        .collect()
}

fn exact_component_diagnostic(component: &Component, reason: &str) -> Diagnostic {
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_EXACT_COMPONENT_INVALID",
        format!(
            "Component '{}' is not one regular solid, so its exact overlap is unavailable.",
            component.label
        ),
    );
    diagnostic.suggestion = Some("Repair or re-export the part as one closed, valid solid; the exact overlap needs a regular-solid operand for every candidate pair.".into());
    diagnostic.spatial = Some(bounds_spatial(component.bounds));
    diagnostic.details = Some(Json::object([
        ("label", Json::string(&component.label)),
        ("componentId", Json::Number(f64::from(component.id))),
        ("reason", Json::string(reason)),
    ]));
    diagnostic
}

fn overlap_candidates(
    components: &[Component],
    selected: Option<&[SelectedPair]>,
    tolerance: f64,
) -> Vec<(usize, usize)> {
    if let Some(pairs) = selected {
        let mut candidates = Vec::with_capacity(pairs.len());
        for pair in pairs {
            let left_id = pair.left.min(pair.right);
            let right_id = pair.left.max(pair.right);
            let (Ok(left), Ok(right)) = (
                components.binary_search_by_key(&left_id, |component| component.id),
                components.binary_search_by_key(&right_id, |component| component.id),
            ) else {
                continue;
            };
            if left < right
                && overlaps_within(components[left].bounds, components[right].bounds, tolerance)
            {
                candidates.push((left, right));
            }
        }
        candidates.sort_unstable();
        candidates.dedup();
        return candidates;
    }

    let mut candidates = Vec::new();
    for left in 0..components.len() {
        for right in left + 1..components.len() {
            if overlaps_within(components[left].bounds, components[right].bounds, tolerance) {
                candidates.push((left, right));
            }
        }
    }
    candidates
}

fn admission_diagnostic(component: &Component, error: &BackendError) -> Diagnostic {
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_MANIFOLD_COMPONENT_INVALID",
        format!(
            "Manifold rejected component '{}' as not a closed oriented solid.",
            component.label
        ),
    );
    diagnostic.suggestion =
        Some("Repair the source geometry so every component is a closed oriented solid.".into());
    diagnostic.details = Some(Json::object([
        ("backendReason", Json::string(&error.message)),
        ("label", Json::string(&component.label)),
        (
            "triangleCount",
            Json::Number(component.mesh().triangles.len() as f64),
        ),
    ]));
    diagnostic
}

enum Partition {
    Components(Vec<Component>),
    /// Fewer than two components; the count found, from structure (C3).
    Inconclusive(usize),
}

fn components(subject: &Subject) -> Result<Partition, BackendError> {
    let Some(brep) = subject.brep.as_deref() else {
        let record = subject.mesh_record();
        if let Some(value) = record.and_then(named_partition) {
            return Ok(Partition::Components(value));
        }
        let count = record
            .and_then(named_identities)
            .map_or(0, |identities| identities.len());
        return Ok(Partition::Inconclusive(count));
    };
    // C2/C3/S10: the leaves with faces and their exact occurrence boxes; no
    // tessellation. An occurrence-free document is one body when it has faces.
    let Some(occurrences) = subject.source_occurrence_structure()? else {
        return Ok(Partition::Inconclusive(0));
    };
    if occurrences.is_empty() {
        return Ok(Partition::Inconclusive(usize::from(
            !brep.faces()?.is_empty(),
        )));
    }
    let leaves = leaf_components(&occurrences);
    if leaves.len() < 2 {
        return Ok(Partition::Inconclusive(leaves.len()));
    }
    let occurrences = subject
        .source_occurrences()?
        .expect("a BRep subject has source occurrences");
    Ok(Partition::Components(
        leaves
            .into_iter()
            .map(|id| {
                let occurrence = &occurrences[id as usize];
                Component {
                    id,
                    label: occurrence_label(occurrence, id as usize),
                    mesh: None,
                    bounds: occurrence.bounds,
                }
            })
            .collect(),
    ))
}

fn named_identities(record: &MeshAnalysisRecord) -> Option<Vec<ComponentIdentity>> {
    let mut has_triangles = vec![false; record.primitives.len()];
    for &primitive in &record.triangle_primitives {
        *has_triangles.get_mut(primitive as usize)? = true;
    }
    record
        .primitives
        .iter()
        .enumerate()
        .filter(|(index, _)| has_triangles[*index])
        .map(|(id, primitive)| {
            let label = primitive.name.trim();
            (!label.is_empty()).then(|| ComponentIdentity {
                id: id as u32,
                label: label.to_owned(),
            })
        })
        .collect()
}

fn named_partition(record: &MeshAnalysisRecord) -> Option<Vec<Component>> {
    let identities = named_identities(record)?;
    if identities.len() < 2 {
        return None;
    }
    let groups: BTreeMap<_, _> = identities
        .iter()
        .enumerate()
        .map(|(group, identity)| (identity.id, group))
        .collect();
    let mut positions = vec![Vec::<[f64; 3]>::new(); identities.len()];
    let mut triangles = vec![Vec::<[u32; 3]>::new(); identities.len()];
    // Remap authored indices, not coordinates: distinct coincident vertices
    // remain distinct until the connector's declared merge operation.
    let mut remaps = vec![HashMap::<u32, u32>::new(); identities.len()];
    for (triangle_index, triangle) in record.triangles.iter().enumerate() {
        let primitive = *record.triangle_primitives.get(triangle_index)?;
        let group = *groups.get(&primitive)?;
        let mut mapped = [0_u32; 3];
        for (corner, vertex) in triangle.iter().copied().enumerate() {
            mapped[corner] = match remaps[group].get(&vertex) {
                Some(index) => *index,
                None => {
                    let index = u32::try_from(positions[group].len()).ok()?;
                    positions[group].push(*record.positions.get(vertex as usize)?);
                    remaps[group].insert(vertex, index);
                    index
                }
            };
        }
        triangles[group].push(mapped);
    }
    identities
        .into_iter()
        .enumerate()
        .map(|(group, identity)| {
            let mesh = Rc::new(TriangleMesh {
                positions: std::mem::take(&mut positions[group]),
                triangles: std::mem::take(&mut triangles[group]),
            });
            Some(Component {
                id: identity.id,
                label: identity.label,
                bounds: mesh_bounds(&mesh).ok()?,
                mesh: Some(mesh),
            })
        })
        .collect()
}

fn occurrence_label(occurrence: &OccurrenceFacts, index: usize) -> String {
    for value in [
        Some(occurrence.path.as_str()),
        occurrence.instance_name.as_deref(),
        Some(occurrence.product_name.as_str()),
    ] {
        if let Some(trimmed) = value.map(str::trim).filter(|value| !value.is_empty()) {
            return trimmed.to_owned();
        }
    }
    format!("step-occurrence-{index}")
}

fn mesh_bounds(mesh: &TriangleMesh) -> Result<Bounds, BackendError> {
    if mesh.positions.is_empty() {
        return Err(BackendError {
            kind: BackendErrorKind::InvalidInput,
            message: "A component mesh has no positions.".into(),
        });
    }
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for point in &mesh.positions {
        for axis in 0..3 {
            min[axis] = min[axis].min(point[axis]);
            max[axis] = max[axis].max(point[axis]);
        }
    }
    Ok(Bounds { min, max })
}

fn overlaps_within(left: Bounds, right: Bounds, tolerance: f64) -> bool {
    (0..3).all(|axis| {
        left.min[axis] <= right.max[axis] + tolerance
            && right.min[axis] <= left.max[axis] + tolerance
    })
}

fn bounds_center(bounds: Bounds) -> [f64; 3] {
    std::array::from_fn(|axis| (bounds.min[axis] + bounds.max[axis]) / 2.0)
}

fn point_json(point: [f64; 3]) -> Json {
    Json::Array(point.into_iter().map(Json::Number).collect())
}

fn bounds_spatial(bounds: Bounds) -> Json {
    Json::object([
        ("min", point_json(bounds.min)),
        ("max", point_json(bounds.max)),
        ("center", point_json(bounds_center(bounds))),
    ])
}

pub(crate) fn evidence_json(evidence: &Evidence) -> Json {
    let mut fields = if evidence.exact {
        vec![
            ("profile".into(), Json::string("INTERFERENCE-EXACT-01")),
            ("assurance".into(), Json::string("exact-brep-boolean")),
            ("representation".into(), Json::string("source-step-leaf-occurrence-solids")),
            ("conformanceBasis".into(), Json::string("OCCT BRepAlgoAPI_Common of each candidate pair's regular-solid leaf operands; GProp volume of the residual")),
            ("accuracyLimit".into(), Json::string("Exact within the source BRep tolerances; the residual volume is OCCT's GProp integration, not an allowance proof.")),
            ("volumeUnit".into(), Json::string("mm^3")),
            ("reportingCutoff".into(), Json::Number(evidence.tolerance.powi(3).max(1e-12))),
            ("cutoffMeaning".into(), Json::string("reporting-only; an omitted pair's exact residual volume is at most the cutoff")),
            ("diagnosticPointMeaning".into(), Json::string("residual-bounds midpoint; not an interior witness")),
            ("componentSource".into(), Json::string("leaf-occurrences")),
        ]
    } else {
        vec![
        ("profile".into(), Json::string("M3-CSG-OBSERVATION-01")),
        ("assurance".into(), Json::string("approximate-polyhedral-observation")),
        ("representation".into(), Json::string("legacy-f32-v1-merged-polyhedral-operands")),
        ("conformanceBasis".into(), Json::string("pinned-Manifold-Rust-Boolean-output; source STEP tessellation or primary mesh")),
        ("accuracyLimit".into(), Json::string("No certified source-material or Boolean-volume error bound; not an allowance proof.")),
        ("volumeUnit".into(), Json::string("mm^3")),
        ("reportingCutoff".into(), Json::Number(evidence.tolerance.powi(3).max(1e-12))),
        ("cutoffMeaning".into(), Json::string("reporting-only; omitted pairs are not certified zero")),
        ("diagnosticPointMeaning".into(), Json::string("output-bounds midpoint; not an interior witness")),
        ("componentSource".into(), Json::string("named")),
        ]
    };
    fields.extend([
        (
            "componentCount".into(),
            Json::Number(evidence.component_count as f64),
        ),
        (
            "checkedPairs".into(),
            Json::Number(evidence.checked_pairs as f64),
        ),
        ("tolerance".into(), Json::Number(evidence.tolerance)),
        (
            "overlaps".into(),
            Json::Array(
                evidence
                    .overlaps
                    .iter()
                    .map(|overlap| overlap_json(overlap, evidence.exact))
                    .collect(),
            ),
        ),
    ]);
    if let Some(pairs) = &evidence.selected_pairs {
        fields.push((
            "selectedPairs".into(),
            Json::Array(
                pairs
                    .iter()
                    .map(|pair| {
                        Json::object([
                            ("leftLabel", Json::string(&pair.left_label)),
                            ("rightLabel", Json::string(&pair.right_label)),
                        ])
                    })
                    .collect(),
            ),
        ));
    }
    Json::Object(fields)
}

fn overlap_json(overlap: &Overlap, exact: bool) -> Json {
    let mut fields = vec![
        (
            "leftComponentId".into(),
            Json::Number(overlap.left_component_id as f64),
        ),
        (
            "rightComponentId".into(),
            Json::Number(overlap.right_component_id as f64),
        ),
        ("leftLabel".into(), Json::string(&overlap.left_label)),
        ("rightLabel".into(), Json::string(&overlap.right_label)),
        (
            "intersectionVolume".into(),
            Json::Number(overlap.intersection_volume),
        ),
        (
            "penetration".into(),
            Json::string(if exact {
                "exact-positive-residual-volume"
            } else {
                "observed-positive-polyhedral-volume"
            }),
        ),
    ];
    if let Some(point) = overlap.witness_point {
        fields.push(("diagnosticPoint".into(), point_json(point)));
    }
    Json::Object(fields)
}

#[cfg(test)]
#[path = "../../../tests/overlap_resident_lru.rs"]
mod resident_lru_tests;

#[cfg(test)]
#[path = "../../../tests/overlap_observation.rs"]
mod overlap_observation_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::brep::BrepEntity;

    fn occurrence(
        path: &str,
        parent: Option<u32>,
        face_count: u32,
    ) -> crate::backend::brep::OccurrenceFacts {
        crate::backend::brep::OccurrenceFacts {
            name: path.into(),
            placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            bounds: Bounds {
                min: [0.0; 3],
                max: [1.0; 3],
            },
            path: path.into(),
            parent,
            product: 0,
            product_name: path.into(),
            instance_name: None,
            ordinal_path: Vec::new(),
            face_count,
        }
    }

    #[test]
    fn indexed_partition_preserves_authored_indices_and_triangle_visitation() {
        let record = MeshAnalysisRecord {
            positions: vec![
                [0.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0],
            ],
            triangles: vec![[0, 1, 2], [3, 2, 1], [0, 2, 1]],
            triangle_primitives: vec![0, 0, 1],
            primitives: vec![
                Primitive {
                    name: "left".into(),
                    vertex_start: 0,
                    vertex_count: 4,
                },
                Primitive {
                    name: "right".into(),
                    vertex_start: 0,
                    vertex_count: 4,
                },
            ],
        };
        let components = named_partition(&record).unwrap();
        assert_eq!(
            components[0].mesh().positions.len(),
            4,
            "equal coordinates with distinct authored indices are not merged"
        );
        assert_eq!(components[0].mesh().triangles, [[0, 1, 2], [3, 2, 1]]);
        assert_eq!(components[1].mesh().positions.len(), 3);
        for component in components {
            let mesh = component.mesh();
            let observed: Vec<_> = mesh
                .triangles
                .iter()
                .map(|triangle| triangle.map(|vertex| mesh.positions[vertex as usize]))
                .collect();
            let expected: Vec<_> = record
                .triangles
                .iter()
                .zip(&record.triangle_primitives)
                .filter(|(_, primitive)| **primitive == component.id)
                .map(|(triangle, _)| triangle.map(|vertex| record.positions[vertex as usize]))
                .collect();
            assert_eq!(
                observed, expected,
                "every corner coordinate and winding stays in authored order"
            );
        }
    }

    #[test]
    fn components_are_leaves_with_faces_and_keep_occurrence_ids() {
        let occurrences = [
            occurrence("asm", None, 0),
            occurrence("asm/a", Some(0), 6),
            occurrence("asm/empty", Some(0), 0),
            occurrence("asm/sub", Some(0), 0),
            occurrence("asm/sub/b", Some(3), 6),
            occurrence("loose", None, 6),
        ];
        assert_eq!(leaf_components(&occurrences), [1, 4, 5]);
    }

    #[test]
    fn named_partition_uses_sparse_primitive_ids_with_duplicate_labels() {
        let record = MeshAnalysisRecord {
            positions: vec![
                [0.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.5, 0.0, 0.0],
                [1.5, 0.0, 0.0],
                [0.5, 1.0, 0.0],
            ],
            triangles: vec![[0, 1, 2], [3, 4, 5]],
            triangle_primitives: vec![1, 2],
            primitives: vec![
                Primitive {
                    name: "empty#0".into(),
                    vertex_start: 0,
                    vertex_count: 0,
                },
                Primitive {
                    name: "A#0".into(),
                    vertex_start: 0,
                    vertex_count: 3,
                },
                Primitive {
                    name: "A#0".into(),
                    vertex_start: 3,
                    vertex_count: 3,
                },
            ],
        };
        let identities = named_identities(&record).unwrap();
        assert_eq!(
            identities
                .iter()
                .map(|identity| (identity.id, identity.label.as_str()))
                .collect::<Vec<_>>(),
            [(1, "A#0"), (2, "A#0")]
        );
        let components = named_partition(&record).unwrap();
        assert_eq!(
            components
                .iter()
                .map(|component| (component.id, component.label.as_str()))
                .collect::<Vec<_>>(),
            [(1, "A#0"), (2, "A#0")]
        );
        assert_eq!(components[0].bounds.max, [1.0, 1.0, 0.0]);
        assert_eq!(components[1].bounds.min, [0.5, 0.0, 0.0]);
    }

    #[test]
    fn aabb_is_only_a_candidate_filter() {
        let a = Bounds {
            min: [0.0; 3],
            max: [1.0; 3],
        };
        let b = Bounds {
            min: [1.001, 0.0, 0.0],
            max: [2.0, 1.0, 1.0],
        };
        assert!(overlaps_within(a, b, 0.001));
        assert!(!overlaps_within(a, b, 0.0009));
    }

    #[test]
    fn sparse_selected_pairs_preserve_canonical_candidates_and_evidence_bytes() {
        let components: Vec<_> = (0..256)
            .map(|index| Component {
                id: (index + 1) * 2,
                label: format!("part-{index}"),
                mesh: Some(Rc::new(TriangleMesh {
                    positions: Vec::new(),
                    triangles: Vec::new(),
                })),
                bounds: Bounds {
                    min: if index == 49 { [10.0; 3] } else { [0.0; 3] },
                    max: if index == 49 { [11.0; 3] } else { [1.0; 3] },
                },
            })
            .collect();
        let selected: Vec<_> = [
            (400, 4),
            (350, 12),
            (512, 2),
            (4, 400),
            (100, 102),
            (4, 4),
            (999, 2),
        ]
        .into_iter()
        .map(|(left, right)| SelectedPair {
            left,
            right,
            left_label: format!("selected-{left}"),
            right_label: format!("selected-{right}"),
        })
        .collect();
        let allowed: BTreeMap<_, _> = selected
            .iter()
            .map(|pair| ((pair.left.min(pair.right), pair.left.max(pair.right)), pair))
            .collect();
        let baseline: Vec<_> = (0..components.len())
            .flat_map(|left| (left + 1..components.len()).map(move |right| (left, right)))
            .filter(|&(left, right)| {
                allowed.contains_key(&(components[left].id, components[right].id))
                    && overlaps_within(components[left].bounds, components[right].bounds, 0.001)
            })
            .collect();
        let actual = overlap_candidates(&components, Some(&selected), 0.001);
        assert_eq!(actual, [(0, 255), (1, 199), (5, 174)]);
        assert_eq!(actual, baseline);

        let evidence_for = |candidates: &[(usize, usize)]| Evidence {
            exact: false,
            component_count: components.len(),
            components: components
                .iter()
                .map(|component| ComponentEvidence {
                    id: component.id,
                    label: component.label.clone(),
                    bounds: component.bounds,
                })
                .collect(),
            selected_pairs: Some(selected.clone()),
            checked_pairs: candidates.len(),
            tolerance: 0.001,
            overlaps: candidates
                .iter()
                .map(|&(left, right)| Overlap {
                    left_component_id: components[left].id,
                    right_component_id: components[right].id,
                    left_label: components[left].label.clone(),
                    right_label: components[right].label.clone(),
                    intersection_volume: 1.0,
                    witness_point: None,
                })
                .collect(),
        };
        assert_eq!(
            crate::codec::encode(&evidence_json(&evidence_for(&actual))).unwrap(),
            crate::codec::encode(&evidence_json(&evidence_for(&baseline))).unwrap()
        );
        assert_eq!(
            overlap_candidates(&components, None, 0.001).len(),
            255 * 254 / 2
        );
    }

    /// Occurrence structure only; any tessellation would be a failure.
    struct Occurrences(Rc<[crate::backend::brep::OccurrenceFacts]>);

    impl crate::backend::brep::BrepSubject for Occurrences {
        fn source_occurrences(
            &self,
        ) -> Result<Rc<[crate::backend::brep::OccurrenceFacts]>, BackendError> {
            Ok(Rc::clone(&self.0))
        }
        fn faces(&self) -> Result<Rc<[crate::backend::brep::LocatedFace]>, BackendError> {
            unreachable!()
        }
        fn validity(&self) -> Result<Rc<crate::backend::brep::ValidityFacts>, BackendError> {
            unreachable!()
        }
        fn classify_face_points(
            &self,
            _: BrepEntity,
            _: &[[f64; 3]],
            _: f64,
        ) -> Result<Vec<crate::backend::brep::PointState>, BackendError> {
            unreachable!()
        }
        fn tessellate(
            &self,
            _: BrepEntity,
            _: TessellationProfile,
        ) -> Result<Rc<TriangleMesh>, BackendError> {
            unreachable!("a STEP partition is structure and exact boxes only")
        }
    }

    fn step_subject(occurrences: Vec<crate::backend::brep::OccurrenceFacts>) -> Subject {
        let mut subject = Subject::new(
            "leaves".into(),
            crate::subject::SubjectFormat::Step,
            "mm".into(),
        );
        subject.brep = Some(Box::new(Occurrences(Rc::from(occurrences))));
        subject
    }

    #[test]
    fn step_partition_is_leaf_structure_and_exact_boxes_without_tessellating() {
        let subject = step_subject(vec![
            occurrence("asm", None, 0),
            occurrence("asm/a", Some(0), 6),
            occurrence("asm/empty", Some(0), 0),
            occurrence("asm/b", Some(0), 6),
        ]);
        let Partition::Components(leaves) = components(&subject).unwrap() else {
            panic!("two leaves with faces partition the assembly");
        };
        assert_eq!(
            leaves
                .iter()
                .map(|component| (
                    component.id,
                    component.label.as_str(),
                    component.mesh.is_none()
                ))
                .collect::<Vec<_>>(),
            [(1, "asm/a", true), (3, "asm/b", true)]
        );

        // componentCount is structure (C3): one leaf with faces is one component.
        let subject = step_subject(vec![
            occurrence("asm", None, 0),
            occurrence("asm/a", Some(0), 6),
            occurrence("asm/empty", Some(0), 0),
        ]);
        assert!(matches!(
            components(&subject).unwrap(),
            Partition::Inconclusive(1)
        ));
    }
}
