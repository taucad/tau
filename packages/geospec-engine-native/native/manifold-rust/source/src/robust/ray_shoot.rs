// robust/ray_shoot.rs — Exact point-in-solid classification for surface
// components no intersection ring reaches (paper §7.4).
//
// A component of mesh P that never meets Q lies entirely inside or entirely
// outside Q; one exact winding-number query at any of its points decides the
// tag (inside → intersection, outside → union). The winding number is the
// signed count of ray crossings against Q's original triangles, evaluated
// with rational Plücker side tests. Rays that graze any edge, vertex, or
// containing plane are detected exactly and retried with the next direction
// from a fixed list — no perturbation, no tolerances.
//
// Complement operands (the flipped Q of a subtraction): a flipped closed
// mesh has winding -1 inside the original and 0 outside, so "inside the
// complement solid" is winding == 0 — the `complement` flag selects that
// interpretation.

use super::exact::backend::rat_new;

use crate::linalg::Vec3;

use super::exact::predicates::orient3d_r;
use super::exact::rational::{rat, rat_to_f64, R3};
use super::exact::Sign;

/// Fixed retry directions; pairwise non-parallel, chosen to make consecutive
/// degeneracies essentially impossible. All integer, so exact.
const DIRS: [[i32; 3]; 12] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
    [1, 2, 3],
    [3, 1, 7],
    [5, 11, 2],
    [7, 3, 13],
    [2, 9, 5],
    [11, 4, 1],
    [3, 17, 8],
    [13, 6, 5],
];

fn dir_r3(d: [i32; 3]) -> R3 {
    R3::new(
        rat(d[0] as f64),
        rat(d[1] as f64),
        rat(d[2] as f64),
    )
}

/// Conservative f64 prefilter for one winding query: triangles whose
/// (inflated) bounding box cannot meet the forward ray are skipped before
/// any exact arithmetic. Sound because a pruned triangle can contribute
/// neither a forward crossing nor a forward grazing hazard: the inflation
/// margin (1e-6, magnitude-scaled) exceeds every f64 rounding error involved
/// by many orders of magnitude, so only provably-clear triangles are pruned.
/// False keeps merely cost an exact test.
struct RayPrefilter {
    origin: crate::linalg::Vec3,
    eps: f64,
}

impl RayPrefilter {
    fn new(point: &R3) -> Self {
        let origin = point.to_vec3_rounded();
        let mag = origin.x.abs().max(origin.y.abs()).max(origin.z.abs());
        RayPrefilter {
            origin,
            eps: 1e-6 * (1.0 + mag),
        }
    }

    /// Could the forward ray from `origin` along integer direction `d` pass
    /// within `eps` of `bbox`? Slab test; conservative on every comparison.
    fn may_hit(&self, d: [i32; 3], bbox: &crate::types::Box) -> bool {
        let mut t0 = f64::NEG_INFINITY;
        let mut t1 = f64::INFINITY;
        for k in 0..3 {
            let (lo, hi) = (bbox.min[k] - self.eps, bbox.max[k] + self.eps);
            let dk = d[k] as f64;
            let pk = self.origin[k];
            if dk == 0.0 {
                if pk < lo || pk > hi {
                    return false;
                }
                continue;
            }
            let (mut ta, mut tb) = ((lo - pk) / dk, (hi - pk) / dk);
            if ta > tb {
                std::mem::swap(&mut ta, &mut tb);
            }
            t0 = t0.max(ta);
            t1 = t1.min(tb);
        }
        t0 <= t1 + self.eps && t1 >= -self.eps
    }
}

fn tri_box_f64(t: &[Vec3; 3]) -> crate::types::Box {
    let mut b = crate::types::Box::from_points(t[0], t[1]);
    b.union_point(t[2]);
    b
}

/// Exact winding number of `point` with respect to the closed oriented
/// triangle soup `tris`. The point must not lie on the surface.
pub fn winding_number(point: &R3, tris: &[[Vec3; 3]]) -> i32 {
    let boxes: Vec<crate::types::Box> = tris.iter().map(tri_box_f64).collect();
    winding_number_boxed(point, tris, &boxes)
}

/// Per-operand acceleration structure for batches of winding queries: a BVH
/// over the triangle boxes, queried with a conservative semi-infinite box
/// around each candidate ray. Build once per operand; thousands of
/// per-component queries then touch only the triangles near their ray
/// instead of scanning the whole soup.
pub struct WindingIndex {
    boxes: Vec<crate::types::Box>,
    collider: crate::collider::Collider,
    order: Vec<usize>,
}

impl WindingIndex {
    pub fn new(tris: &[[Vec3; 3]]) -> Self {
        let boxes: Vec<crate::types::Box> = tris.iter().map(tri_box_f64).collect();
        let scene = boxes
            .iter()
            .fold(crate::types::Box::new(), |acc, b| acc.union_box(b));
        let mut order: Vec<usize> = (0..tris.len()).collect();
        order.sort_by_key(|&i| crate::sort::morton_code(boxes[i].center(), &scene));
        let collider = crate::collider::Collider::new(
            order.iter().map(|&i| boxes[i]).collect(),
            order
                .iter()
                .map(|&i| crate::sort::morton_code(boxes[i].center(), &scene))
                .collect(),
        );
        WindingIndex {
            boxes,
            collider,
            order,
        }
    }

    /// Conservative superset of every triangle `RayPrefilter::may_hit` would
    /// keep for this (origin, direction): a box stretching to infinity along
    /// the ray, inflated past the prefilter's epsilon and backward reach.
    fn candidates(&self, prefilter: &RayPrefilter, d: [i32; 3]) -> Vec<usize> {
        let maxd = d.iter().map(|v| v.abs()).max().unwrap_or(1) as f64;
        let slack = prefilter.eps * (2.0 + maxd);
        let mut lo = crate::linalg::Vec3::new(0.0, 0.0, 0.0);
        let mut hi = crate::linalg::Vec3::new(0.0, 0.0, 0.0);
        for k in 0..3 {
            let o = prefilter.origin[k];
            if d[k] > 0 {
                lo[k] = o - slack;
                hi[k] = f64::INFINITY;
            } else if d[k] < 0 {
                lo[k] = f64::NEG_INFINITY;
                hi[k] = o + slack;
            } else {
                lo[k] = o - slack;
                hi[k] = o + slack;
            }
        }
        let query = crate::types::Box { min: lo, max: hi };
        let mut out = Vec::new();
        self.collider.collisions_one(&query, usize::MAX, |_, leaf| {
            out.push(self.order[leaf]);
        });
        out
    }
}

/// [`winding_number`] against a prebuilt [`WindingIndex`].
pub fn winding_number_indexed(point: &R3, tris: &[[Vec3; 3]], index: &WindingIndex) -> i32 {
    let prefilter = RayPrefilter::new(point);
    let ap = [
        rat_to_f64(&point.x),
        rat_to_f64(&point.y),
        rat_to_f64(&point.z),
    ];
    for d in DIRS {
        let mut cand = index.candidates(&prefilter, d);
        cand.sort_unstable(); // deterministic evaluation order
        if let Some(w) = winding_one_dir(
            point,
            &ap,
            d,
            &prefilter,
            cand.iter().map(|&i| (&tris[i], &index.boxes[i])),
        ) {
            return w;
        }
    }
    unreachable!("all candidate ray directions degenerate — malformed input");
}

/// [`winding_number`] with caller-provided per-triangle boxes — batch query
/// sites build them once per operand instead of once per query.
pub fn winding_number_boxed(
    point: &R3,
    tris: &[[Vec3; 3]],
    boxes: &[crate::types::Box],
) -> i32 {
    let prefilter = RayPrefilter::new(point);
    let ap = [
        rat_to_f64(&point.x),
        rat_to_f64(&point.y),
        rat_to_f64(&point.z),
    ];
    for d in DIRS {
        if let Some(w) = winding_one_dir(point, &ap, d, &prefilter, tris.iter().zip(boxes.iter()))
        {
            return w;
        }
    }
    unreachable!("all candidate ray directions degenerate — malformed input");
}

/// One direction's signed crossing count over the given (triangle, box)
/// pairs; `None` means the ray grazed something and the caller must retry
/// with the next direction. Approx-filtered first, exact on demand.
fn winding_one_dir<'a, I: Iterator<Item = (&'a [Vec3; 3], &'a crate::types::Box)>>(
    point: &R3,
    ap: &[f64; 3],
    d: [i32; 3],
    prefilter: &RayPrefilter,
    tris_boxes: I,
) -> Option<i32> {
    use super::exact::approx::orient3d_a;

    let dir = dir_r3(d);
    let o2 = point.add(&dir);
    let ao2 = [
        ap[0] + d[0] as f64,
        ap[1] + d[1] as f64,
        ap[2] + d[2] as f64,
    ];
    let mut winding = 0i32;
    for (t, bbox) in tris_boxes {
        if !prefilter.may_hit(d, bbox) {
            continue;
        }
            let fa = [t[0].x, t[0].y, t[0].z];
            let fb = [t[1].x, t[1].y, t[1].z];
            let fc = [t[2].x, t[2].y, t[2].z];
            // Plücker side tests of the ray line against the three edges —
            // approx first, exact only when the filter cannot certify.
            let sides = [
                orient3d_a(*ap, ao2, fa, fb),
                orient3d_a(*ap, ao2, fb, fc),
                orient3d_a(*ap, ao2, fc, fa),
            ];
            // Certified miss without touching the bignum tier: two strict opposite
            // signs mean the line cannot pierce the closed triangle.
            if matches!(
                (sides[0], sides[1]),
                (Some(Sign::Pos), Some(Sign::Neg)) | (Some(Sign::Neg), Some(Sign::Pos))
            ) || matches!(
                (sides[1], sides[2]),
                (Some(Sign::Pos), Some(Sign::Neg)) | (Some(Sign::Neg), Some(Sign::Pos))
            ) || matches!(
                (sides[0], sides[2]),
                (Some(Sign::Pos), Some(Sign::Neg)) | (Some(Sign::Neg), Some(Sign::Pos))
            ) {
                continue;
            }
            // Resolve any uncertain side exactly (rational triangle built
            // only when a filter actually missed).
            let (s_ab, s_bc, s_ca) = match (sides[0], sides[1], sides[2]) {
                (Some(x), Some(y), Some(z)) => (x, y, z),
                _ => {
                    let a = R3::from_vec3(t[0]);
                    let b = R3::from_vec3(t[1]);
                    let c = R3::from_vec3(t[2]);
                    let s_ab = sides[0].unwrap_or_else(|| orient3d_r(point, &o2, &a, &b));
                    let s_bc = sides[1].unwrap_or_else(|| orient3d_r(point, &o2, &b, &c));
                    let s_ca = sides[2].unwrap_or_else(|| orient3d_r(point, &o2, &c, &a));
                    if s_ab == Sign::Zero || s_bc == Sign::Zero || s_ca == Sign::Zero {
                        // Might graze an edge or vertex of this triangle —
                        // only a problem if the grazing happens on the
                        // forward ray within the triangle's neighborhood;
                        // retrying is always safe.
                        if could_graze(point, &o2, &a, &b, &c) {
                            return None;
                        }
                        continue;
                    }
                    (s_ab, s_bc, s_ca)
                }
            };
            if s_ab != s_bc || s_bc != s_ca {
                continue; // line misses the triangle
            }
            // Line pierces the triangle interior. Forward (t > 0)?
            let h = orient3d_a(fa, fb, fc, *ap).unwrap_or_else(|| {
                orient3d_r(
                    &R3::from_vec3(t[0]),
                    &R3::from_vec3(t[1]),
                    &R3::from_vec3(t[2]),
                    point,
                )
            });
            if h == Sign::Zero {
                // Point on the triangle's plane while the line pierces the
                // interior ⇒ the point is on the surface — caller violated
                // the precondition, or the ray grazes; retry.
                return None;
            }
            // n·dir sign == common side-sign (all three Pos ⇔ dir on the
            // CCW-normal side).
            let n_dot_dir = s_ab; // s_ab == s_bc == s_ca == sign(n·dir)
            if h != n_dot_dir.flip() {
                continue; // intersection lies behind the ray origin
            }
            winding += match n_dot_dir {
                Sign::Pos => 1, // exits through a front face
                _ => -1,
            };
    }
    Some(winding)
}

/// Exact winding number of `point + ε·outward` for an infinitesimal ε > 0:
/// the winding just off a surface piece through `point`, on the piece's
/// outward side. Used to detect pieces that are interior walls of their own
/// mesh (self-overlapping or nested sheets): a piece lies on the boundary of
/// the solid `{w ≠ 0}` only when this value is 0 (or −1 for an
/// orientation-flipped complement operand).
///
/// `boxes` are per-triangle f64 bounding boxes (rounded vertices are fine —
/// the prefilter inflation covers the rounding) for conservative pruning.
///
/// `tris` may pass through `point` (the piece's own triangle always does).
/// Triangles whose plane contains `point` are resolved by a second-order
/// perturbation argument: the query point is x + ε·outward + ε²·dir, so such
/// a triangle is crossed by the forward ray exactly when the plane's normal
/// separates `outward` from `dir` (sides differ); when `outward` lies in the
/// plane, the ε² term decides and the ray always leaves on the `dir` side —
/// no crossing. Ray directions are restricted to the outward hemisphere so
/// the piece's own plane never counts.
pub fn winding_off_surface(
    point: &R3,
    outward: &R3,
    tris: &[[R3; 3]],
    tris_f64: &[[Vec3; 3]],
    boxes: &[crate::types::Box],
) -> i32 {
    use super::exact::approx::orient3d_a;

    debug_assert_eq!(tris.len(), boxes.len());
    debug_assert_eq!(tris.len(), tris_f64.len());
    let prefilter = RayPrefilter::new(point);
    let ap = [
        rat_to_f64(&point.x),
        rat_to_f64(&point.y),
        rat_to_f64(&point.z),
    ];
    'dirs: for d in DIRS
        .iter()
        .flat_map(|d| [*d, [-d[0], -d[1], -d[2]]])
    {
        let dir = dir_r3(d);
        // Outward hemisphere only: the ε·outward offset must stay on the
        // near side of the piece's own plane relative to the ray.
        if Sign::of_rat(&dir.dot(outward)) != Sign::Pos {
            continue;
        }
        let o2 = point.add(&dir);
        let ao2 = [
            ap[0] + d[0] as f64,
            ap[1] + d[1] as f64,
            ap[2] + d[2] as f64,
        ];
        let mut winding = 0i32;
        for ((t, tf), bbox) in tris.iter().zip(tris_f64.iter()).zip(boxes) {
            if !prefilter.may_hit(d, bbox) {
                continue;
            }
            let fa = [tf[0].x, tf[0].y, tf[0].z];
            let fb = [tf[1].x, tf[1].y, tf[1].z];
            let fc = [tf[2].x, tf[2].y, tf[2].z];
            // Approx-first (certified misses skip all rational work).
            let sides = [
                orient3d_a(ap, ao2, fa, fb),
                orient3d_a(ap, ao2, fb, fc),
                orient3d_a(ap, ao2, fc, fa),
            ];
            if matches!(
                (sides[0], sides[1]),
                (Some(Sign::Pos), Some(Sign::Neg)) | (Some(Sign::Neg), Some(Sign::Pos))
            ) || matches!(
                (sides[1], sides[2]),
                (Some(Sign::Pos), Some(Sign::Neg)) | (Some(Sign::Neg), Some(Sign::Pos))
            ) || matches!(
                (sides[0], sides[2]),
                (Some(Sign::Pos), Some(Sign::Neg)) | (Some(Sign::Neg), Some(Sign::Pos))
            ) {
                continue;
            }
            let (a, b, c) = (&t[0], &t[1], &t[2]);
            let s_ab = sides[0].unwrap_or_else(|| orient3d_r(point, &o2, a, b));
            let s_bc = sides[1].unwrap_or_else(|| orient3d_r(point, &o2, b, c));
            let s_ca = sides[2].unwrap_or_else(|| orient3d_r(point, &o2, c, a));
            if s_ab == Sign::Zero || s_bc == Sign::Zero || s_ca == Sign::Zero {
                if could_graze(point, &o2, a, b, c) {
                    continue 'dirs;
                }
                continue;
            }
            if s_ab != s_bc || s_bc != s_ca {
                continue; // line misses the triangle
            }
            let n_dot_dir = s_ab; // sign(n·dir), n the CCW normal
            let h = orient3d_a(fa, fb, fc, ap).unwrap_or_else(|| orient3d_r(a, b, c, point));
            if h == Sign::Zero {
                // Plane through the query point; the pierce point is `point`
                // itself (the transversal line meets the plane only there).
                // Perturbed crossing exists iff outward and dir are on
                // opposite sides of the plane.
                let n = super::exact::predicates::tri_normal_r(a, b, c);
                let s_out = Sign::of_rat(&n.dot(outward));
                if s_out == n_dot_dir.flip() {
                    winding += match n_dot_dir {
                        Sign::Pos => 1,
                        _ => -1,
                    };
                }
                continue;
            }
            if h != n_dot_dir.flip() {
                continue; // intersection lies behind the ray origin
            }
            winding += match n_dot_dir {
                Sign::Pos => 1,
                _ => -1,
            };
        }
        return winding;
    }
    unreachable!("all candidate ray directions degenerate — malformed input");
}

/// Conservative check whether a zero Plücker sign can affect the crossing
/// count: true when the ray's line meets the triangle's plane inside or on
/// the triangle boundary, or runs inside its plane. False positives only
/// cost a retry.
fn could_graze(o: &R3, o2: &R3, a: &R3, b: &R3, c: &R3) -> bool {
    let s_ab = orient3d_r(o, o2, a, b);
    let s_bc = orient3d_r(o, o2, b, c);
    let s_ca = orient3d_r(o, o2, c, a);
    // The line misses the closed triangle only if two side tests have
    // strictly opposite signs.
    !(matches!((s_ab, s_bc), (Sign::Pos, Sign::Neg) | (Sign::Neg, Sign::Pos))
        || matches!((s_bc, s_ca), (Sign::Pos, Sign::Neg) | (Sign::Neg, Sign::Pos))
        || matches!((s_ab, s_ca), (Sign::Pos, Sign::Neg) | (Sign::Neg, Sign::Pos)))
}

/// Representative interior point of a piece: its centroid (exact).
pub fn piece_centroid(v: [&R3; 3]) -> R3 {
    let third = rat_new(1.into(), 3.into());
    v[0].add(v[1]).add(v[2]).scale(&third)
}

/// Is `point` inside the solid bounded by `tris`? `complement` flips the
/// interpretation for orientation-reversed (subtraction) operands.
pub fn point_inside(point: &R3, tris: &[[Vec3; 3]], complement: bool) -> bool {
    let w = winding_number(point, tris);
    if complement {
        w == 0
    } else {
        w != 0
    }
}

#[cfg(test)]
mod tests {
    use super::super::exact::backend::rat_is_zero;
    use super::*;

    fn v(x: f64, y: f64, z: f64) -> Vec3 {
        Vec3::new(x, y, z)
    }

    /// Unit-ish cube [0,2]³ as 12 outward-wound triangles.
    pub(crate) fn cube_tris(lo: f64, hi: f64) -> Vec<[Vec3; 3]> {
        let p = |x, y, z| v(x, y, z);
        let quads: [([f64; 3], [f64; 3], [f64; 3], [f64; 3]); 6] = [
            // -z (normal 0,0,-1)
            ([0., 0., 0.], [0., 1., 0.], [1., 1., 0.], [1., 0., 0.]),
            // +z
            ([0., 0., 1.], [1., 0., 1.], [1., 1., 1.], [0., 1., 1.]),
            // -y
            ([0., 0., 0.], [1., 0., 0.], [1., 0., 1.], [0., 0., 1.]),
            // +y
            ([0., 1., 0.], [0., 1., 1.], [1., 1., 1.], [1., 1., 0.]),
            // -x
            ([0., 0., 0.], [0., 0., 1.], [0., 1., 1.], [0., 1., 0.]),
            // +x
            ([1., 0., 0.], [1., 1., 0.], [1., 1., 1.], [1., 0., 1.]),
        ];
        let s = hi - lo;
        let m = |q: [f64; 3]| p(lo + q[0] * s, lo + q[1] * s, lo + q[2] * s);
        let mut out = Vec::new();
        for (a, b, c, d) in quads {
            out.push([m(a), m(b), m(c)]);
            out.push([m(a), m(c), m(d)]);
        }
        out
    }

    #[test]
    fn winding_of_cube() {
        let cube = cube_tris(0.0, 2.0);
        let inside = R3::from_vec3(v(1.0, 1.0, 1.0));
        let outside = R3::from_vec3(v(5.0, 0.5, 0.5));
        let near_out = R3::from_vec3(v(-0.25, 1.0, 1.0));
        assert_eq!(winding_number(&inside, &cube), 1);
        assert_eq!(winding_number(&outside, &cube), 0);
        assert_eq!(winding_number(&near_out, &cube), 0);
        assert!(point_inside(&inside, &cube, false));
        assert!(!point_inside(&outside, &cube, false));
        // Complement semantics.
        let flipped: Vec<[Vec3; 3]> = cube.iter().map(|t| [t[0], t[2], t[1]]).collect();
        assert!(!point_inside(&inside, &flipped, true));
        assert!(point_inside(&outside, &flipped, true));
        assert_eq!(winding_number(&inside, &flipped), -1);
    }

    #[test]
    fn winding_survives_degenerate_axis_rays() {
        // Query point aligned with cube vertices/edges on every axis: the
        // first directions all graze; retry logic must still classify.
        let cube = cube_tris(0.0, 2.0);
        let tricky_in = R3::from_vec3(v(1.0, 1.0, 0.5)); // axis rays hit edges
        assert_eq!(winding_number(&tricky_in, &cube), 1);
        let tricky_out = R3::from_vec3(v(0.0, 0.0, 5.0)); // rays through corner
        assert_eq!(winding_number(&tricky_out, &cube), 0);
    }

    #[test]
    fn nested_void_winding() {
        // Outer cube with an inward-oriented inner cube = solid with a void.
        let mut solid = cube_tris(0.0, 6.0);
        let inner: Vec<[Vec3; 3]> = cube_tris(2.0, 4.0)
            .iter()
            .map(|t| [t[0], t[2], t[1]])
            .collect();
        solid.extend(inner);
        let in_wall = R3::from_vec3(v(1.0, 1.0, 1.0));
        let in_void = R3::from_vec3(v(3.0, 3.0, 3.0));
        let outside = R3::from_vec3(v(7.0, 3.0, 3.0));
        assert_eq!(winding_number(&in_wall, &solid), 1);
        assert_eq!(winding_number(&in_void, &solid), 0);
        assert_eq!(winding_number(&outside, &solid), 0);
    }

    #[test]
    fn centroid_is_exact() {
        let p = [
            R3::from_vec3(v(0.0, 0.0, 0.0)),
            R3::from_vec3(v(1.0, 0.0, 0.0)),
            R3::from_vec3(v(0.0, 1.0, 0.0)),
        ];
        let c = piece_centroid([&p[0], &p[1], &p[2]]);
        assert_eq!(c.x, rat_new(1.into(), 3.into()));
        assert!(rat_is_zero(&c.z));
    }
}
