// robust/graph_self_cut.rs — Same-mesh narrow phase: decides whether a
// triangle pair from one operand is ordinary adjacency or a genuine
// self-intersection that must cut the surface.
//
// Split out of robust/intersection_graph.rs, whose self-intersection phase
// calls `real_self_contact` per box pair and prints the `SelfCutStats`
// counters; robust/soup.rs reuses the same predicate to decide engine
// dispatch (both reach it through the `intersection_graph` re-exports). The
// exact tests come from robust/tri_tri.rs and robust/exact/*, and the plain
// segment/degeneracy helpers from robust/graph_geom.rs.

use crate::linalg::Vec3;

use super::exact::rational::R3;
use super::exact::Sign;
use super::graph_geom::point_on_segment;
use super::tri_tri::{tri_tri_intersect, TriTriIsect};

/// orient3d(t[0], t[1], t[2], v): float filter first, exact integer
/// determinant on escalation. This replaced a cached exact-plane structure
/// (TriPlane) — with intpred's division-free fallback, building planes
/// eagerly per triangle cost more than it ever saved.
fn orient3d_plane(t: &[Vec3; 3], v: Vec3) -> Sign {
    if let Some(s) = super::exact::approx::orient3d_a(
        [t[0].x, t[0].y, t[0].z],
        [t[1].x, t[1].y, t[1].z],
        [t[2].x, t[2].y, t[2].z],
        [v.x, v.y, v.z],
    ) {
        return s;
    }
    super::exact::intpred::orient3d_i(
        [t[0].x, t[0].y, t[0].z],
        [t[1].x, t[1].y, t[1].z],
        [t[2].x, t[2].y, t[2].z],
        [v.x, v.y, v.z],
    )
}

/// Axis of the largest |component| of the (f64) triangle normal. Only a
/// projection *choice*: when the exact normal's chosen component happens to
/// be zero, the projected points go collinear, the exact 2D signs come back
/// Zero, and every shortcut below falls through — sound, just unoptimized.
fn dominant_axis_f64(t: [Vec3; 3]) -> usize {
    let n = crate::linalg::cross(t[1] - t[0], t[2] - t[0]);
    let (ax, ay, az) = (n.x.abs(), n.y.abs(), n.z.abs());
    if az >= ax && az >= ay {
        2
    } else if ay >= ax {
        1
    } else {
        0
    }
}

/// `R3::project_drop` for raw f64 points (same cyclic axis convention).
fn project_f64(v: Vec3, axis: usize) -> crate::linalg::Vec2 {
    match axis {
        0 => crate::linalg::Vec2::new(v.y, v.z),
        1 => crate::linalg::Vec2::new(v.z, v.x),
        _ => crate::linalg::Vec2::new(v.x, v.y),
    }
}

/// Per-path counters for the self-cut narrow phase, printed under
/// MANIFOLD_TIMING to show where box-pair time goes (shortcut hits vs full
/// tri_tri calls and their outcomes).
#[derive(Default, Debug)]
pub(super) struct SelfCutStats {
    pub(super) identical: usize,
    pub(super) edge_benign: usize,
    pub(super) vert_benign: usize,
    pub(super) full: usize,
    pub(super) full_none: usize,
    pub(super) full_point: usize,
    pub(super) full_seg_benign: usize,
    pub(super) full_secs: f64,
}

impl SelfCutStats {
    /// Merge a worker's counters. Only diagnostics — `full_secs` summed
    /// across workers reports aggregate CPU seconds, not wall time.
    pub(super) fn add(&mut self, o: &SelfCutStats) {
        self.identical += o.identical;
        self.edge_benign += o.edge_benign;
        self.vert_benign += o.vert_benign;
        self.full += o.full;
        self.full_none += o.full_none;
        self.full_point += o.full_point;
        self.full_seg_benign += o.full_seg_benign;
        self.full_secs += o.full_secs;
    }
}

/// Real self-intersection of one triangle pair from the same mesh: the
/// contact of `t1` and `t2` reduced by ordinary mesh adjacency. Shared-vertex
/// point contacts and (sub-)segments of a shared edge are the normal way
/// neighboring triangles of a closed mesh touch and yield `None`; anything
/// else is a genuine self-intersection whose segments must cut the surface,
/// so that every emitted piece lies on a single sheet level of its own mesh
/// (robust/mod.rs classifies own-mesh winding per component).
///
/// The self-cut narrow phase: `Some(segments)` when `t1` and `t2` genuinely
/// intersect (a crossing or a positive-area coplanar overlap), `None` when
/// their only contact is ordinary adjacency — a shared edge, a shared
/// vertex, an isolated point, or an exactly duplicated triangle. Also used
/// by `soup::has_self_intersections` to decide engine dispatch.
pub(super) fn real_self_contact(
    t1: [Vec3; 3],
    t2: [Vec3; 3],
    stats: &mut SelfCutStats,
) -> Option<Vec<(R3, R3)>> {
    // Shared vertex positions (exact f64 identity) between the pair. Kept in
    // f64: hundreds of thousands of benign pairs pass through here, and the
    // rational form is only needed by the final Segment-benign check.
    //
    // Exactly identical triangles (all three vertices coincide — doubled
    // surfaces, which some scans apply to their whole mesh) need no cut:
    // both emit whole pieces with identical interned ids, so they land on
    // one wall in robust/cells.rs and their winding steps add (a doubled
    // sheet steps by two, a fold cancels to zero). Cutting them instead
    // would drag every such triangle through the full arrangement pipeline
    // along its own boundary, for nothing.

    // Adjacency fast paths — the overwhelming bulk of same-mesh box-overlap
    // pairs are edge- or vertex-neighbors whose only contact is that shared
    // simplex, which never needs a cut. All shortcuts are exact (filtered
    // predicates escalate to rationals when uncertain); flat triangulated
    // regions make the *coplanar* neighbor cases as common as the generic
    // ones, and without their 2D shortcuts every such pair pays for a full
    // rational coplanar-overlap clip.
    // Stack-allocated shared-vertex list: this runs per box pair (hundreds
    // of thousands on dense meshes) and a heap Vec here is measurable.
    let mut shared_f = [Vec3::default(); 3];
    let mut n_shared = 0usize;
    for &v in &t1 {
        if t2.contains(&v) {
            shared_f[n_shared] = v;
            n_shared += 1;
        }
    }
    let shared_f = &shared_f[..n_shared];
    if shared_f.len() == 3 {
        stats.identical += 1;
        return None;
    }
    if shared_f.len() == 2 {
        if let Some(&opp) = t2.iter().find(|v| !t1.contains(v)) {
            // Non-coplanar edge-neighbors only meet along the shared edge.
            if orient3d_plane(&t1, opp) != Sign::Zero {
                stats.edge_benign += 1;
                return None;
            }
            // Coplanar edge-neighbors: benign exactly when the two opposite
            // corners strictly straddle the shared edge's line within the
            // plane (the flat-plate case) — then the closed half-plane
            // intersection is the shared edge itself.
            if let Some(&own) = t1.iter().find(|v| !t2.contains(v)) {
                let axis = dominant_axis_f64(t1);
                let p2 = |v: Vec3| project_f64(v, axis);
                let s_own =
                    super::exact::filtered::orient2d(p2(shared_f[0]), p2(shared_f[1]), p2(own));
                let s_opp =
                    super::exact::filtered::orient2d(p2(shared_f[0]), p2(shared_f[1]), p2(opp));
                if s_own != Sign::Zero && s_opp != Sign::Zero && s_own != s_opp {
                    stats.edge_benign += 1;
                    return None;
                }
            }
        }
    } else if shared_f.len() == 1 {
        // Vertex-adjacent: if t2's two non-shared corners lie strictly on
        // one side of t1's plane, the contact is exactly the shared vertex —
        // an isolated point, no cut.
        let mut others = [(Vec3::default(), Sign::Zero); 3];
        let mut n_others = 0usize;
        for &v in &t2 {
            if !t1.contains(&v) {
                others[n_others] = (v, orient3d_plane(&t1, v));
                n_others += 1;
            }
        }
        let others = &others[..n_others];
        if others.len() == 2 && others[0].1 != Sign::Zero && others[0].1 == others[1].1 {
            stats.vert_benign += 1;
            return None;
        }
        // Fully coplanar vertex-neighbors (triangle fans on flat regions):
        // an edge through the shared vertex that strictly separates the two
        // triangles certifies the contact is exactly that vertex.
        if others.len() == 2 && others[0].1 == Sign::Zero && others[1].1 == Sign::Zero {
            let axis = dominant_axis_f64(t1);
            let p2 = |v: Vec3| project_f64(v, axis);
            let v0 = shared_f[0];
            let mut own = [Vec3::default(); 3];
            let mut n_own = 0usize;
            for &v in &t1 {
                if !t2.contains(&v) {
                    own[n_own] = v;
                    n_own += 1;
                }
            }
            let own = &own[..n_own];
            let other = [others[0].0, others[1].0];
            // Candidate separators: each triangle's two edges through v0,
            // tested against its own third corner vs the other triangle's
            // two corners.
            let separated = |ea: Vec3, third: Vec3, far: [Vec3; 2]| -> bool {
                let s_t = super::exact::filtered::orient2d(p2(v0), p2(ea), p2(third));
                if s_t == Sign::Zero {
                    return false;
                }
                far.iter().all(|&f| {
                    let s = super::exact::filtered::orient2d(p2(v0), p2(ea), p2(f));
                    s != Sign::Zero && s != s_t
                })
            };
            if own.len() == 2
                && (separated(own[0], own[1], other)
                    || separated(own[1], own[0], other)
                    || separated(other[0], other[1], [own[0], own[1]])
                    || separated(other[1], other[0], [own[0], own[1]]))
            {
                stats.vert_benign += 1;
                return None;
            }
        }
    }

    stats.full += 1;
    let t_full = crate::timing::Stopwatch::start();
    let isect = tri_tri_intersect(t1, t2);
    stats.full_secs += t_full.elapsed_secs();
    match isect {
        TriTriIsect::None => {
            stats.full_none += 1;
            None
        }
        // Isolated point contacts (vertex-on-face, edge-through-edge) have
        // zero area on both sides: they never change which sheet a region
        // is on, so they need no cut.
        TriTriIsect::Point(_) => {
            stats.full_point += 1;
            None
        }
        TriTriIsect::Segment(x, y) => {
            let benign = shared_f.len() >= 2 && {
                let s0 = R3::from_vec3(shared_f[0]);
                let s1 = R3::from_vec3(shared_f[1]);
                point_on_segment(&x, &s0, &s1) && point_on_segment(&y, &s0, &s1)
            };
            if benign {
                stats.full_seg_benign += 1;
            }
            (!benign).then(|| vec![(x, y)])
        }
        // Positive-area coplanar overlap (a fold or doubled patch): cut both
        // triangles along the overlap region's boundary.
        TriTriIsect::Coplanar { polygon, .. } => Some(
            (0..polygon.len())
                .map(|i| {
                    (
                        polygon[i].clone(),
                        polygon[(i + 1) % polygon.len()].clone(),
                    )
                })
                .collect(),
        ),
    }
}
