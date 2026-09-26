//! Exact STEP connected components (M2; rulings 5 and 28). Bodies come from
//! the retained BRep and exact boxes plus tolerance are only the broad phase.
//! The O3-07 narrow phase decides each candidate pair: face-box separation,
//! then face pairs nearest first with an early exit on contact, then a
//! whole-body distance only where one solid's box holds the other's, since
//! a nested body is at distance zero with no face near it. Union-find skips
//! joined pairs, and pairs run in cost order (face pairs first, whole bodies
//! after), so a costly near miss inside an already joined component never
//! runs. Every evaluation is charged before it runs: one unit per face pair
//! and faces x faces per whole-body distance.

use super::{
    center, compare_utf16, empty_aabb, expand, find, overlaps_within, partial_cmp, sweep_axis,
    Aabb, ClusterReport, PrimitiveRecord,
};
use crate::{
    backend::{
        brep::{Bounds, ComponentBodies, ComponentBody},
        BackendError,
    },
    budget::{Budget, BudgetExceeded},
};

/// Why exact components stopped: a charge that would pass the budget, with
/// the body pair it was for, or a kernel failure.
#[derive(Debug)]
pub(crate) enum ExactError {
    Budget {
        exceeded: BudgetExceeded,
        left: usize,
        right: usize,
    },
    Backend(BackendError),
}

impl From<BackendError> for ExactError {
    fn from(error: BackendError) -> Self {
        Self::Backend(error)
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
    let mut pairs = candidate_pairs(list, tolerance);
    pairs.sort_unstable();
    let mut nested = Vec::new();
    for (_, left, right) in pairs {
        if find(&mut parent, left) == find(&mut parent, right) {
            continue;
        }
        if faces_touch(bodies, left, right, tolerance, budget)? {
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
        charge(budget, units, left, right)?;
        if bodies.bodies_within(left, right, tolerance)? {
            union(&mut parent, left, right);
        }
    }
    Ok(clusters(list, labels, &mut parent))
}

fn union(parent: &mut [usize], left: usize, right: usize) {
    let left = find(parent, left);
    let right = find(parent, right);
    parent[left] = right;
}

/// Checked before charging, so a refused pair never leaves the budget
/// spent past its limit, where the plan would refuse without the pair.
fn charge(budget: &Budget, units: u64, left: usize, right: usize) -> Result<(), ExactError> {
    let refused = |exceeded| ExactError::Budget {
        exceeded,
        left,
        right,
    };
    let used = budget.used().saturating_add(units);
    if used > budget.limit() {
        return Err(refused(BudgetExceeded {
            limit: budget.limit(),
            used,
        }));
    }
    budget.charge(units).map_err(refused)
}

fn aabb(bounds: Bounds) -> Aabb {
    Aabb {
        min: bounds.min,
        max: bounds.max,
    }
}

/// Broad-phase pairs whose boxes overlap within `tolerance`, each with the
/// count of its face pairs, which orders the narrow phase cheapest first.
fn candidate_pairs(list: &[ComponentBody], tolerance: f64) -> Vec<(usize, usize, usize)> {
    let axis = sweep_axis(list.iter().map(|body| aabb(body.bounds)));
    let mut order: Vec<usize> = (0..list.len()).collect();
    order.sort_by(|&left, &right| {
        partial_cmp(list[left].bounds.min[axis], list[right].bounds.min[axis])
            .then_with(|| left.cmp(&right))
    });
    let mut pairs = Vec::new();
    for (position, &current) in order.iter().enumerate() {
        let bounds = aabb(list[current].bounds);
        for &candidate in &order[position + 1..] {
            let other = aabb(list[candidate].bounds);
            if other.min[axis] > bounds.max[axis] + tolerance {
                break;
            }
            if overlaps_within(bounds, other, tolerance) {
                let (left, right) = (current.min(candidate), current.max(candidate));
                let count = face_pairs(&list[left], &list[right], tolerance).len();
                pairs.push((count, left, right));
            }
        }
    }
    pairs
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

/// Face pairs whose memo boxes lie within `tolerance`, nearest first. The
/// boxes enclose their faces, so any other pair is proven apart.
fn face_pairs(
    left: &ComponentBody,
    right: &ComponentBody,
    tolerance: f64,
) -> Vec<(f64, usize, usize)> {
    let near = |faces: &[Bounds], other: Bounds| -> Vec<usize> {
        (0..faces.len())
            .filter(|&face| box_distance(faces[face], other) <= tolerance)
            .collect()
    };
    let left_faces = near(&left.faces, right.bounds);
    let right_faces = near(&right.faces, left.bounds);
    let mut pairs = Vec::new();
    for &left_face in &left_faces {
        for &right_face in &right_faces {
            let distance = box_distance(left.faces[left_face], right.faces[right_face]);
            if distance <= tolerance {
                pairs.push((distance, left_face, right_face));
            }
        }
    }
    pairs.sort_by(|a, b| {
        partial_cmp(a.0, b.0)
            .then_with(|| a.1.cmp(&b.1))
            .then_with(|| a.2.cmp(&b.2))
    });
    pairs
}

fn faces_touch(
    bodies: &dyn ComponentBodies,
    left: usize,
    right: usize,
    tolerance: f64,
    budget: &Budget,
) -> Result<bool, ExactError> {
    let list = bodies.bodies();
    for (_, left_face, right_face) in face_pairs(&list[left], &list[right], tolerance) {
        charge(budget, 1, left, right)?;
        if bodies.faces_within(left, left_face, right, right_face, tolerance)? {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Whether `inner` can lie inside the solid `outer`'s material.
fn holds(outer: &ComponentBody, inner: &ComponentBody, tolerance: f64) -> bool {
    outer.solid
        && (0..3).all(|axis| {
            outer.bounds.min[axis] - tolerance <= inner.bounds.min[axis]
                && inner.bounds.max[axis] <= outer.bounds.max[axis] + tolerance
        })
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
    use std::{cell::RefCell, collections::HashSet};

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

    /// Verdicts by body pair; every evaluation is recorded.
    struct Fake {
        bodies: Vec<ComponentBody>,
        touching: HashSet<(usize, usize)>,
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
            _: usize,
            right: usize,
            _: usize,
            _: f64,
        ) -> Result<bool, BackendError> {
            self.calls.borrow_mut().push(("faces", left, right));
            Ok(self.touching.contains(&(left, right)))
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
    /// a near miss that a joined component never evaluates.
    fn chain(touching: &[(usize, usize)]) -> Fake {
        let unit = |x: f64| slab([x, 0.0, 0.0], [x + 1.0, 1.0, 1.0]);
        Fake {
            bodies: vec![
                body(vec![unit(0.0), unit(0.0)], true, 8),
                body(vec![unit(1.0)], true, 4),
                // A shell, so its box holding body 1 asks for no whole-body distance.
                body(vec![slab([0.5, 0.0, 0.0], [2.5, 1.0, 1.0]); 3], false, 8),
            ],
            touching: touching.iter().copied().collect(),
            nested: HashSet::new(),
            calls: RefCell::new(Vec::new()),
        }
    }

    #[test]
    fn joined_pairs_skip_their_costlier_near_misses_in_cost_order() {
        let fake = chain(&[(0, 1), (1, 2)]);
        let budget = Budget::new(100);
        let clusters = exact_clusters(&fake, &labels(3), 0.001, &budget).unwrap();
        assert_eq!(clusters.len(), 1);
        assert_eq!(*fake.calls.borrow(), [("faces", 0, 1), ("faces", 1, 2)]);
        assert_eq!(budget.used(), 2);
        // Heaviest body names the cluster; ties keep the first body.
        assert_eq!(clusters[0].label, "b0");
        assert_eq!(clusters[0].total_vertices, 20);
    }

    #[test]
    fn a_near_miss_evaluates_every_face_pair_and_stays_apart() {
        let fake = chain(&[(0, 1)]);
        let budget = Budget::new(100);
        let clusters = exact_clusters(&fake, &labels(3), 0.001, &budget).unwrap();
        // 1-2 (3 pairs) runs before 0-2 (6 pairs); both miss every face pair.
        assert_eq!(fake.calls.borrow().len(), 1 + 3 + 6);
        assert_eq!(budget.used(), 10);
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
        let fake = chain(&[(0, 1), (1, 2)]);
        let budget = Budget::new(1);
        let Err(ExactError::Budget {
            exceeded,
            left,
            right,
        }) = exact_clusters(&fake, &labels(3), 0.001, &budget)
        else {
            panic!("expected a budget refusal");
        };
        assert_eq!((left, right), (1, 2));
        assert_eq!((exceeded.limit, exceeded.used), (1, 2));
        // Nothing is spent past the limit, so the plan keeps this refusal.
        assert_eq!(budget.used(), 1);
    }

    #[test]
    fn only_a_solid_holding_the_other_box_runs_the_whole_body_distance() {
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
        for (solid, nested, count, calls) in
            [(true, true, 1, 1), (true, false, 2, 1), (false, true, 2, 0)]
        {
            let fake = Fake {
                bodies: vec![
                    body(cube(0.0, 10.0), solid, 8),
                    body(cube(4.0, 6.0), true, 8),
                ],
                touching: HashSet::new(),
                nested: if nested {
                    HashSet::from([(0, 1)])
                } else {
                    HashSet::new()
                },
                calls: RefCell::new(Vec::new()),
            };
            let budget = Budget::new(100);
            let clusters = exact_clusters(&fake, &labels(2), 0.001, &budget).unwrap();
            assert_eq!(clusters.len(), count);
            // Face boxes 4 mm apart prove the boundaries apart without a call.
            assert_eq!(fake.calls.borrow().len(), calls);
            assert_eq!(budget.used(), 36 * calls as u64);
        }
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
            touching: HashSet::new(),
            nested: HashSet::new(),
            calls: RefCell::new(Vec::new()),
        };
        let budget = Budget::new(1);
        let clusters = exact_clusters(&fake, &labels(64), 0.001, &budget).unwrap();
        assert_eq!(clusters.len(), 64);
        assert!(fake.calls.borrow().is_empty());
        assert_eq!(budget.used(), 0);
    }
}
