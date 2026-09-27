//! Exact STEP connected components (M2; rulings 5 and 28). Bodies come from
//! the retained BRep and exact boxes plus tolerance are only the broad phase.
//! The O3-07 narrow phase decides each candidate pair: face-box separation,
//! then the vertex, edge and face pairs of the faces in near face pairs,
//! nearest first with an early exit on contact. Bodies whose boundaries stay
//! apart meet only when one lies inside the other solid; one classified
//! vertex per vertex-connected face set decides that as the whole-body
//! distance's solid treatment does, and the whole-body distance runs only
//! where a vertex classifies on a boundary. Union-find skips joined pairs,
//! and pairs run in cost order (face pairs first, nested bodies after), so a
//! costly near miss inside an already joined component never runs. Every
//! step is charged before it runs (ruling 28): sweep comparisons and
//! face-box tests by the 4,096, the native steps as the bridge prices them,
//! and faces x faces per whole-body distance.

use super::{
    center, compare_utf16, empty_aabb, expand, find, overlaps_within, partial_cmp, sweep_axis,
    Aabb, ClusterReport, PrimitiveRecord,
};
use crate::{
    backend::{
        brep::{Bounds, Charge, ComponentBodies, ComponentBody, PointState},
        BackendError, BackendErrorKind,
    },
    budget::{Budget, BudgetExceeded},
};

/// Face-box tests per work unit.
pub(crate) const BOX_TESTS_PER_UNIT: u64 = 4096;

/// Why exact components stopped: a charge that would pass the budget, with
/// the body pair it was for (none while measuring the bodies), or a kernel
/// failure.
#[derive(Debug)]
pub(crate) enum ExactError {
    Budget {
        exceeded: BudgetExceeded,
        pair: Option<(usize, usize)>,
    },
    Backend(BackendError),
}

impl From<BackendError> for ExactError {
    fn from(error: BackendError) -> Self {
        Self::Backend(error)
    }
}

/// Runs a native step whose charges refuse past the budget; a stopped step
/// becomes the refusal for `pair`.
pub(crate) fn ask<T>(
    budget: &Budget,
    pair: Option<(usize, usize)>,
    step: impl FnOnce(&mut Charge<'_>) -> Result<Option<T>, BackendError>,
) -> Result<T, ExactError> {
    let mut refused = None;
    let answer = step(&mut |units| match charge(budget, units) {
        Ok(()) => true,
        Err(exceeded) => {
            refused = Some(exceeded);
            false
        }
    })?;
    match (answer, refused) {
        (_, Some(exceeded)) => Err(ExactError::Budget { exceeded, pair }),
        (Some(answer), None) => Ok(answer),
        (None, None) => Err(ExactError::Backend(BackendError {
            kind: BackendErrorKind::ComputationFailed,
            message: "A native step stopped without a refused charge.".into(),
        })),
    }
}

/// The clusters of bodies within `tolerance` of each other, in the mesh
/// clusters' order; `labels[i]` names body `i`.
pub(crate) fn exact_clusters(
    bodies: &dyn ComponentBodies,
    labels: &[String],
    tolerance: f64,
    budget: &Budget,
) -> Result<Vec<ClusterReport>, ExactError> {
    let list = bodies.bodies();
    let mut parent: Vec<usize> = (0..list.len()).collect();
    let mut pairs = candidate_pairs(list, tolerance, budget)?;
    pairs.sort_unstable_by_key(|pair| (pair.count, pair.left, pair.right));
    let mut nested = Vec::new();
    for pair in pairs {
        let (left, right) = (pair.left, pair.right);
        if find(&mut parent, left) == find(&mut parent, right) {
            continue;
        }
        let touching = pair.count > 0
            && ask(budget, Some((left, right)), |charge| {
                bodies.faces_within(
                    left,
                    &pair.left_faces,
                    right,
                    &pair.right_faces,
                    tolerance,
                    charge,
                )
            })?;
        if touching {
            union(&mut parent, left, right);
        } else if holds(&list[left], &list[right], tolerance)
            || holds(&list[right], &list[left], tolerance)
        {
            let units =
                (list[left].faces.len() as u64).saturating_mul(list[right].faces.len() as u64);
            nested.push((units, left, right));
        }
    }
    nested.sort_unstable();
    for (units, left, right) in nested {
        if find(&mut parent, left) == find(&mut parent, right) {
            continue;
        }
        if nested_within(bodies, left, right, tolerance, units, budget)? {
            union(&mut parent, left, right);
        }
    }
    Ok(clusters(list, labels, &mut parent))
}

/// Boundaries farther apart than `tolerance` meet only where one body lies
/// inside the other solid. Each vertex-connected face set then lies wholly
/// inside or wholly outside, so one vertex per set classifies all of its
/// vertices exactly as the whole-body distance classifies each; that
/// distance, charged faces x faces, runs only where a vertex classifies on
/// a boundary.
fn nested_within(
    bodies: &dyn ComponentBodies,
    left: usize,
    right: usize,
    tolerance: f64,
    units: u64,
    budget: &Budget,
) -> Result<bool, ExactError> {
    let list = bodies.bodies();
    let mut unsure = false;
    for (outer, inner) in [(left, right), (right, left)] {
        if !list[outer].solid {
            continue;
        }
        match ask(budget, Some((left, right)), |charge| {
            bodies.body_inside(outer, inner, charge)
        })? {
            PointState::In => return Ok(true),
            PointState::On => unsure = true,
            PointState::Out => {}
        }
    }
    if !unsure {
        return Ok(false);
    }
    charge(budget, units).map_err(|exceeded| ExactError::Budget {
        exceeded,
        pair: Some((left, right)),
    })?;
    Ok(bodies.bodies_within(left, right, tolerance)?)
}

fn union(parent: &mut [usize], left: usize, right: usize) {
    let left = find(parent, left);
    let right = find(parent, right);
    parent[left] = right;
}

/// Checked before charging, so a refused step never leaves the budget spent
/// past its limit, where the plan would refuse without the pair.
fn charge(budget: &Budget, units: u64) -> Result<(), BudgetExceeded> {
    let used = budget.used().saturating_add(units);
    if used > budget.limit() {
        return Err(BudgetExceeded {
            limit: budget.limit(),
            used,
        });
    }
    budget.charge(units)
}

fn aabb(bounds: Bounds) -> Aabb {
    Aabb {
        min: bounds.min,
        max: bounds.max,
    }
}

/// A broad-phase pair: its near face pairs' count, which orders the narrow
/// phase cheapest first, and the faces those pairs use on each side.
struct Candidate {
    count: usize,
    left: usize,
    right: usize,
    left_faces: Vec<u32>,
    right_faces: Vec<u32>,
}

/// Broad-phase pairs whose reaches overlap within `tolerance`: a body's
/// reach is the fold of its face boxes, which grow by each face's
/// tolerances, where `bounds` is the exact fold (review R5-4). Every sweep
/// comparison is charged, a unit per `BOX_TESTS_PER_UNIT` before each batch
/// runs, and each pair's face-box tests (by their faces x faces bound)
/// before they run.
fn candidate_pairs(
    list: &[ComponentBody],
    tolerance: f64,
    budget: &Budget,
) -> Result<Vec<Candidate>, ExactError> {
    let reaches: Vec<Aabb> = list.iter().map(|body| aabb(reach(body))).collect();
    let axis = sweep_axis(reaches.iter().copied());
    let mut order: Vec<usize> = (0..list.len()).collect();
    order.sort_by(|&left, &right| {
        partial_cmp(reaches[left].min[axis], reaches[right].min[axis])
            .then_with(|| left.cmp(&right))
    });
    let mut pairs = Vec::new();
    let mut comparisons = 0_u64;
    for (position, &current) in order.iter().enumerate() {
        let bounds = reaches[current];
        for &candidate in &order[position + 1..] {
            if comparisons % BOX_TESTS_PER_UNIT == 0 {
                charge(budget, 1).map_err(|exceeded| ExactError::Budget {
                    exceeded,
                    pair: None,
                })?;
            }
            comparisons += 1;
            let other = reaches[candidate];
            if other.min[axis] > bounds.max[axis] + tolerance {
                break;
            }
            if overlaps_within(bounds, other, tolerance) {
                let (left, right) = (current.min(candidate), current.max(candidate));
                let tests =
                    (list[left].faces.len() as u64).saturating_mul(list[right].faces.len() as u64);
                charge(budget, 1 + tests / BOX_TESTS_PER_UNIT).map_err(|exceeded| {
                    ExactError::Budget {
                        exceeded,
                        pair: Some((left, right)),
                    }
                })?;
                pairs.push(face_pairs(
                    &list[left],
                    &list[right],
                    left,
                    right,
                    tolerance,
                ));
            }
        }
    }
    Ok(pairs)
}

/// Euclidean distance between two boxes, zero when they meet.
fn box_distance(left: Bounds, right: Bounds) -> f64 {
    let squares: f64 = (0..3)
        .map(|axis| {
            let gap = (left.min[axis] - right.max[axis])
                .max(right.min[axis] - left.max[axis])
                .max(0.0);
            gap * gap
        })
        .sum();
    squares.sqrt()
}

/// The fold of a body's grown face boxes: as far as its faces' tolerances
/// let the exact distances reach, where `bounds` is the exact fold.
fn reach(body: &ComponentBody) -> Bounds {
    let mut reach = empty_aabb();
    for face in &body.faces {
        expand(&mut reach, face.min);
        expand(&mut reach, face.max);
    }
    Bounds {
        min: reach.min,
        max: reach.max,
    }
}

/// The face pairs whose grown boxes lie within `tolerance`. The boxes enclose
/// what the exact distances measure, so any other face pair is proven apart.
fn face_pairs(
    left: &ComponentBody,
    right: &ComponentBody,
    left_index: usize,
    right_index: usize,
    tolerance: f64,
) -> Candidate {
    let near = |faces: &[Bounds], other: Bounds| -> Vec<usize> {
        (0..faces.len())
            .filter(|&face| box_distance(faces[face], other) <= tolerance)
            .collect()
    };
    let mut left_used = vec![false; left.faces.len()];
    let mut right_used = vec![false; right.faces.len()];
    let mut count = 0;
    let right_near = near(&right.faces, reach(left));
    for left_face in near(&left.faces, reach(right)) {
        for &right_face in &right_near {
            if box_distance(left.faces[left_face], right.faces[right_face]) <= tolerance {
                count += 1;
                left_used[left_face] = true;
                right_used[right_face] = true;
            }
        }
    }
    let used = |flags: Vec<bool>| -> Vec<u32> {
        (0..flags.len() as u32)
            .filter(|&face| flags[face as usize])
            .collect()
    };
    Candidate {
        count,
        left: left_index,
        right: right_index,
        left_faces: used(left_used),
        right_faces: used(right_used),
    }
}

/// Whether `inner` can lie inside the solid `outer`'s material, which
/// reaches as far as its grown face boxes.
fn holds(outer: &ComponentBody, inner: &ComponentBody, tolerance: f64) -> bool {
    outer.solid && {
        let reach = reach(outer);
        (0..3).all(|axis| {
            reach.min[axis] - tolerance <= inner.bounds.min[axis]
                && inner.bounds.max[axis] <= reach.max[axis] + tolerance
        })
    }
}

/// Clusters in body order, labelled by their body with the most vertices
/// (the first on ties), then sorted as the mesh clusters are.
fn clusters(list: &[ComponentBody], labels: &[String], parent: &mut [usize]) -> Vec<ClusterReport> {
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut group_of = vec![usize::MAX; list.len()];
    for body in 0..list.len() {
        let root = find(parent, body);
        if group_of[root] == usize::MAX {
            group_of[root] = groups.len();
            groups.push(Vec::new());
        }
        groups[group_of[root]].push(body);
    }
    let mut clusters: Vec<ClusterReport> = groups
        .into_iter()
        .map(|members| {
            let mut bounds = empty_aabb();
            let mut total_vertices = 0_u32;
            let mut heaviest = members[0];
            let primitives = members
                .iter()
                .map(|&body| {
                    let value = &list[body];
                    let box_ = aabb(value.bounds);
                    expand(&mut bounds, box_.min);
                    expand(&mut bounds, box_.max);
                    total_vertices = total_vertices.saturating_add(value.vertices);
                    if value.vertices > list[heaviest].vertices {
                        heaviest = body;
                    }
                    PrimitiveRecord {
                        name: labels[body].clone(),
                        color: None,
                        vertices: value.vertices,
                        aabb: box_,
                    }
                })
                .collect();
            ClusterReport {
                label: labels[heaviest].clone(),
                primitives,
                aabb: bounds,
                centroid: center(bounds),
                total_vertices,
            }
        })
        .collect();
    clusters.sort_by(|left, right| {
        right
            .total_vertices
            .cmp(&left.total_vertices)
            .then_with(|| compare_utf16(&left.label, &right.label))
    });
    clusters
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        cell::RefCell,
        collections::{HashMap, HashSet},
    };

    fn slab(min: [f64; 3], max: [f64; 3]) -> Bounds {
        Bounds { min, max }
    }

    fn body(faces: Vec<Bounds>, solid: bool, vertices: u32) -> ComponentBody {
        let mut bounds = slab([f64::INFINITY; 3], [f64::NEG_INFINITY; 3]);
        for face in &faces {
            for axis in 0..3 {
                bounds.min[axis] = bounds.min[axis].min(face.min[axis]);
                bounds.max[axis] = bounds.max[axis].max(face.max[axis]);
            }
        }
        ComponentBody {
            occurrence: None,
            solid,
            vertices,
            bounds,
            faces,
        }
    }

    /// Verdicts by body pair; every evaluation is recorded. A face query
    /// charges one unit per listed face pair and a classification one unit.
    #[derive(Default)]
    struct Fake {
        bodies: Vec<ComponentBody>,
        touching: HashSet<(usize, usize)>,
        inside: HashMap<(usize, usize), PointState>,
        nested: HashSet<(usize, usize)>,
        calls: RefCell<Vec<(&'static str, usize, usize)>>,
    }

    impl ComponentBodies for Fake {
        fn bodies(&self) -> &[ComponentBody] {
            &self.bodies
        }
        fn faces_within(
            &self,
            left: usize,
            left_faces: &[u32],
            right: usize,
            right_faces: &[u32],
            _: f64,
            charge: &mut Charge<'_>,
        ) -> Result<Option<bool>, BackendError> {
            self.calls.borrow_mut().push(("faces", left, right));
            if !charge((left_faces.len() * right_faces.len()) as u64) {
                return Ok(None);
            }
            Ok(Some(self.touching.contains(&(left, right))))
        }
        fn body_inside(
            &self,
            outer: usize,
            inner: usize,
            charge: &mut Charge<'_>,
        ) -> Result<Option<PointState>, BackendError> {
            self.calls.borrow_mut().push(("inside", outer, inner));
            if !charge(1) {
                return Ok(None);
            }
            Ok(Some(
                self.inside
                    .get(&(outer, inner))
                    .copied()
                    .unwrap_or(PointState::Out),
            ))
        }
        fn bodies_within(&self, left: usize, right: usize, _: f64) -> Result<bool, BackendError> {
            self.calls.borrow_mut().push(("bodies", left, right));
            Ok(self.nested.contains(&(left, right)))
        }
    }

    fn labels(count: usize) -> Vec<String> {
        (0..count).map(|index| format!("b{index}")).collect()
    }

    /// Three bodies on x: 0-1 (2 face pairs) and 1-2 (3) touch, 0-2 (6) is
    /// a near miss that a joined component never evaluates. Each broad-phase
    /// pair costs one unit.
    fn chain(touching: &[(usize, usize)]) -> Fake {
        let unit = |x: f64| slab([x, 0.0, 0.0], [x + 1.0, 1.0, 1.0]);
        Fake {
            bodies: vec![
                body(vec![unit(0.0), unit(0.0)], true, 8),
                body(vec![unit(1.0)], true, 4),
                // A shell, so its box holding body 1 asks for no classification.
                body(vec![slab([0.5, 0.0, 0.0], [2.5, 1.0, 1.0]); 3], false, 8),
            ],
            touching: touching.iter().copied().collect(),
            ..Fake::default()
        }
    }

    #[test]
    fn joined_pairs_skip_their_costlier_near_misses_in_cost_order() {
        let fake = chain(&[(0, 1), (1, 2)]);
        let budget = Budget::new(100);
        let clusters = exact_clusters(&fake, &labels(3), 0.001, &budget).unwrap();
        assert_eq!(clusters.len(), 1);
        assert_eq!(*fake.calls.borrow(), [("faces", 0, 1), ("faces", 1, 2)]);
        // The sweep's one batch, the three broad-phase pairs, then the faces.
        assert_eq!(budget.used(), 1 + 3 + 2 + 3);
        // Heaviest body names the cluster; ties keep the first body.
        assert_eq!(clusters[0].label, "b0");
        assert_eq!(clusters[0].total_vertices, 20);
    }

    #[test]
    fn a_near_miss_evaluates_its_faces_and_stays_apart() {
        let fake = chain(&[(0, 1)]);
        let budget = Budget::new(100);
        let clusters = exact_clusters(&fake, &labels(3), 0.001, &budget).unwrap();
        // 1-2 (3 face pairs) runs before 0-2 (6); both miss.
        assert_eq!(
            *fake.calls.borrow(),
            [("faces", 0, 1), ("faces", 1, 2), ("faces", 0, 2)]
        );
        assert_eq!(budget.used(), 1 + 3 + 2 + 3 + 6);
        assert_eq!(
            clusters
                .iter()
                .map(|cluster| cluster.label.as_str())
                .collect::<Vec<_>>(),
            ["b0", "b2"]
        );
    }

    #[test]
    fn the_refusal_names_the_pair_whose_charge_would_pass_the_budget() {
        for (limit, pair, used) in [(2, (0, 1), 3), (6, (1, 2), 9)] {
            let fake = chain(&[(0, 1), (1, 2)]);
            let budget = Budget::new(limit);
            let Err(ExactError::Budget { exceeded, pair: at }) =
                exact_clusters(&fake, &labels(3), 0.001, &budget)
            else {
                panic!("expected a budget refusal");
            };
            // After the sweep's batch, the broad phase refuses its second
            // pair at 2 units; the narrow phase refuses 1-2's faces after
            // 0-1 joined at 6.
            assert_eq!(at, Some(pair));
            assert_eq!((exceeded.limit, exceeded.used), (limit, used));
            // Nothing is spent past the limit, so the plan keeps this refusal.
            assert_eq!(budget.used(), limit);
        }
    }

    #[test]
    fn a_nested_pair_is_decided_by_classification_before_any_whole_body_distance() {
        let cube = |min: f64, max: f64| {
            let (lo, hi) = ([min; 3], [max; 3]);
            (0..3)
                .flat_map(|axis| {
                    [lo[axis], hi[axis]].map(|value| {
                        let (mut a, mut b) = (lo, hi);
                        a[axis] = value;
                        b[axis] = value;
                        slab(a, b)
                    })
                })
                .collect::<Vec<_>>()
        };
        let inside = |states: &[((usize, usize), PointState)]| -> HashMap<_, _> {
            states.iter().copied().collect()
        };
        let cases: [(bool, HashMap<_, _>, bool, usize, &[_], u64); 5] = [
            // A point of the inner body inside: joined, no distance.
            (
                true,
                inside(&[((0, 1), PointState::In)]),
                false,
                1,
                &[("inside", 0, 1)],
                1 + 1 + 1,
            ),
            // Every point outside, both ways: apart, no distance.
            (
                true,
                HashMap::new(),
                false,
                2,
                &[("inside", 0, 1), ("inside", 1, 0)],
                1 + 1 + 2,
            ),
            // A point on a boundary: the whole-body distance decides, charged
            // faces x faces.
            (
                true,
                inside(&[((0, 1), PointState::On)]),
                true,
                1,
                &[("inside", 0, 1), ("inside", 1, 0), ("bodies", 0, 1)],
                1 + 1 + 2 + 36,
            ),
            (
                true,
                inside(&[((0, 1), PointState::On)]),
                false,
                2,
                &[("inside", 0, 1), ("inside", 1, 0), ("bodies", 0, 1)],
                1 + 1 + 2 + 36,
            ),
            // No solid holds the other's box: nothing is asked.
            (false, HashMap::new(), false, 2, &[], 1 + 1),
        ];
        for (solid, states, nested, count, calls, units) in cases {
            let fake = Fake {
                bodies: vec![
                    body(cube(0.0, 10.0), solid, 8),
                    body(cube(4.0, 6.0), true, 8),
                ],
                inside: states,
                nested: if nested {
                    HashSet::from([(0, 1)])
                } else {
                    HashSet::new()
                },
                ..Fake::default()
            };
            let budget = Budget::new(100);
            let clusters = exact_clusters(&fake, &labels(2), 0.001, &budget).unwrap();
            assert_eq!(clusters.len(), count);
            // Face boxes 4 mm apart prove the boundaries apart without a call.
            assert_eq!(*fake.calls.borrow(), calls);
            assert_eq!(budget.used(), units);
        }
    }

    #[test]
    fn the_filters_reach_as_far_as_the_grown_face_boxes() {
        // Face boxes grow by their faces' tolerances; `bounds` folds them
        // ungrown. Body 0's second face (x 0.3-0.95) lies beyond the tolerance
        // of body 1's exact bounds (x from 1.0005) but meets its grown face
        // (x from 0.9005), so it joins the pair's faces.
        let span = |min: f64, max: f64| slab([min, 0.0, 0.0], [max, 1.0, 1.0]);
        let left = body(vec![span(0.0, 1.0), span(0.3, 0.95)], true, 8);
        let right = ComponentBody {
            bounds: span(1.0005, 2.0),
            ..body(vec![span(0.9005, 2.1)], true, 8)
        };
        let pair = face_pairs(&left, &right, 0, 1, 0.001);
        assert_eq!(
            (pair.count, pair.left_faces, pair.right_faces),
            (2, vec![0, 1], vec![0])
        );
        // A solid's material reaches its grown faces: a body there, beyond
        // the exact bounds, may lie inside it; one beyond the reach may not.
        let outer = ComponentBody {
            bounds: slab([0.0; 3], [10.0; 3]),
            ..body(vec![slab([-0.5; 3], [10.5; 3])], true, 8)
        };
        let within = body(vec![slab([9.0; 3], [10.4; 3])], true, 8);
        let beyond = body(vec![slab([9.0; 3], [10.6; 3])], true, 8);
        assert!(holds(&outer, &within, 0.001));
        assert!(!holds(&outer, &beyond, 0.001));
    }

    #[test]
    fn separated_boxes_answer_from_the_broad_phase_alone() {
        let bodies: Vec<_> = (0..64)
            .map(|index| {
                let x = f64::from(index) * 2.0;
                body(vec![slab([x, 0.0, 0.0], [x + 1.0, 1.0, 1.0])], true, 8)
            })
            .collect();
        let fake = Fake {
            bodies,
            ..Fake::default()
        };
        let budget = Budget::new(1);
        let clusters = exact_clusters(&fake, &labels(64), 0.001, &budget).unwrap();
        assert_eq!(clusters.len(), 64);
        assert!(fake.calls.borrow().is_empty());
        // 63 sweep comparisons, each ending its body's scan: one batch.
        assert_eq!(budget.used(), 1);
    }

    /// Review R5-3: bars whose x extents all overlap but which lie apart in
    /// y make the sweep compare every pair and find none; the comparisons
    /// are charged by the batch before they run.
    #[test]
    fn a_sweep_charges_every_comparison_before_it_runs() {
        const BARS: usize = 128;
        let bodies: Vec<_> = (0..BARS)
            .map(|index| {
                let (x, y) = (3.0 * index as f64, 2.0 * index as f64);
                body(
                    vec![slab([x, y, 0.0], [x + 3.0 * BARS as f64, y + 1.0, 1.0])],
                    true,
                    8,
                )
            })
            .collect();
        let fake = Fake {
            bodies,
            ..Fake::default()
        };
        // 128 x 127 / 2 = 8,128 comparisons, two batches of 4,096.
        let budget = Budget::new(2);
        let clusters = exact_clusters(&fake, &labels(BARS), 0.001, &budget).unwrap();
        assert_eq!(clusters.len(), BARS);
        assert!(fake.calls.borrow().is_empty());
        assert_eq!(budget.used(), 2);
        let budget = Budget::new(1);
        let Err(ExactError::Budget { exceeded, pair }) =
            exact_clusters(&fake, &labels(BARS), 0.001, &budget)
        else {
            panic!("the second batch passes the budget");
        };
        assert_eq!((pair, exceeded.limit, exceeded.used), (None, 1, 2));
        assert_eq!(budget.used(), 1);
    }

    /// Review R5-4: the broad phase pairs bodies by their reach, the fold of
    /// their face boxes, which grow by the faces' tolerances. Body 1's exact
    /// bounds lie 0.5 beyond body 0, but its grown face meets it.
    #[test]
    fn the_broad_phase_pairs_bodies_by_their_reach() {
        let bodies = vec![
            body(vec![slab([0.0; 3], [1.0; 3])], true, 8),
            ComponentBody {
                bounds: slab([1.5, 0.0, 0.0], [2.5, 1.0, 1.0]),
                ..body(vec![slab([0.9995, 0.0, 0.0], [2.5, 1.0, 1.0])], true, 8)
            },
        ];
        let budget = Budget::new(2);
        let pairs = candidate_pairs(&bodies, 0.001, &budget).unwrap();
        assert_eq!(pairs.len(), 1);
        assert_eq!((pairs[0].left, pairs[0].right), (0, 1));
        // The sweep's batch, then the pair's face-box tests.
        assert_eq!(budget.used(), 1 + 1);
    }
}
