// robust/cdt.rs — Constrained Delaunay triangulation on exact 2D points.
//
// Triangulates the interior of one input triangle after robust/arrangement.rs
// has collected every intersection point and constraint segment that lands on
// it (paper §6.4). All predicates are exact (robust/exact), so there are no
// epsilon decisions anywhere: point location, edge flips, and constraint
// recovery all reason on true signs. Delaunay-ness itself is not load-bearing
// for the boolean — validity and constraint preservation are — but Delaunay
// flips avoid the near-degenerate sub-triangles that would otherwise stress
// downstream float code.
//
// Scale note: an arrangement usually holds one mesh triangle's intersections
// and its point count is small (tens), but heavily self-intersecting
// Thingi10K meshes routinely push thousands — and occasionally >10⁴ — points
// through a single call, so nothing here may be O(n) per insertion. Point
// location is a visibility walk seeded from the newest triangle,
// `mark_if_present`/`collect_corridor` rotate around a vertex via `vert_tri`,
// and `fix_split_pairs` looks only at the halves it just created. What
// remains superlinear is per-operation and bounded by local complexity
// (corridor length, pseudo-polygon chain length), not by the arena size.

use super::exact::approx::{incircle_a, incircle_a_exact, orient2d_a, orient2d_a_exact};
use super::exact::backend::{denom, numer, Rational, ToPrimitive};
use super::exact::predicates::{homog2_of, incircle_h, orient2d_h, Homog2, TriLoc};
use super::exact::rational::{rat_to_f64, R2};
use super::exact::Sign;

/// One triangle of the CDT. Vertices are CCW; edge i runs v[i] → v[i+1],
/// adj[i] is the triangle index across that edge (-1 on the hull), con[i]
/// marks a constrained edge that flips must never cross.
#[derive(Clone, Debug)]
struct Tri {
    v: [usize; 3],
    adj: [i32; 3],
    con: [bool; 3],
    alive: bool,
}

struct Cdt {
    /// Homogenized once per triangulation; exact predicates reuse these.
    pts: Vec<Homog2>,
    /// Correctly rounded f64 approximations (relative error ≤ ε) of the points
    /// TRANSLATED by `points[0]`, computed once; the semi-static filters in
    /// exact/approx.rs certify most predicate signs from these alone,
    /// escalating to `pts` only on near-degeneracies. See `triangulate` for
    /// why translating first is both sound and the difference between a
    /// usable and a useless filter on arrangements far from the origin.
    apts: Vec<[f64; 2]>,
    /// True where `apts[i]` is EXACTLY the translated point (both coordinates
    /// round-trip), which lets the predicates use the far tighter exact-input
    /// filters in exact/approx.rs — those assume zero input perturbation, so
    /// it is the TRANSLATED value that must be exact, since that is what the
    /// filters see.
    exact: Vec<bool>,
    tris: Vec<Tri>,
    /// Suspect triangles for queue-based Lawson legalization.
    suspects: Vec<usize>,
    /// For each vertex, the most recently created triangle containing it.
    /// Invariant: always alive — every operation that kills a triangle
    /// containing v pushes (and records) a replacement containing v first.
    /// Constraint recovery uses this to rotate around a vertex instead of
    /// scanning the whole triangulation.
    vert_tri: Vec<u32>,
    /// Rank of each point in exact lexicographic (x, y) coordinate order.
    /// Cocircular-tie flips key on this so the triangulation is a function
    /// of the point coordinates, not of construction history — coincident
    /// coplanar triangles must tile their shared region identically or the
    /// cell complex sees one physical sheet crossing as several
    /// vi-distinct walls with understated winding steps.
    rank: Vec<u32>,
}

/// Constrained Delaunay triangulation of `points` inside the triangle formed
/// by `points[0..3]` (any winding). Every other point must lie inside that
/// triangle or on its boundary, all points must be pairwise distinct, and
/// every constraint (index pair) must be free of interior points and proper
/// crossings with other constraints — robust/arrangement.rs guarantees all
/// three. Returns CCW index triangles exactly covering the input triangle.
pub fn triangulate(points: &[R2], constraints: &[(usize, usize)]) -> Vec<[usize; 3]> {
    triangulate_with_token(points, constraints, None)
        .expect("uncancellable triangulate cannot cancel")
}

/// [`triangulate`] with cooperative cancellation. Returns `None` when the
/// token fires.
///
/// A single monster arrangement pushes >10⁶ points and constraints through one
/// call and can run for minutes, so the per-arrangement check in
/// robust/intersection_graph.rs is not enough on its own: a cancel that only
/// the enclosing map notices waits out the worst triangulation in the mesh.
/// The checks are strictly early returns — they never touch the insertion
/// order, the arena, or any predicate — so a run that completes produces
/// exactly the triangles [`triangulate`] produces.
pub fn triangulate_with_token(
    points: &[R2],
    constraints: &[(usize, usize)],
    token: Option<&crate::cancel::CancelToken>,
) -> Option<Vec<[usize; 3]>> {
    let (apts, exact) = translated_filter_inputs(points);
    triangulate_with_apts(points, constraints, apts, exact, token)
}

/// The translated filter inputs [`triangulate_with_token`] would build for
/// `points`: each point minus `points[0]`, the subtraction exact in rationals
/// and only the result rounded, plus a flag per point saying whether that f64
/// is EXACTLY the translated value (see [`triangulate_with_apts`] for why
/// translating is sound and why it matters).
fn translated_filter_inputs(points: &[R2]) -> (Vec<[f64; 2]>, Vec<bool>) {
    let origin = &points[0];
    let (mut apts, mut exact) = (
        Vec::with_capacity(points.len()),
        Vec::with_capacity(points.len()),
    );
    for p in points {
        let t = p.sub(origin);
        apts.push([rat_to_f64(&t.x), rat_to_f64(&t.y)]);
        exact.push(is_exact(&t.x) && is_exact(&t.y));
    }
    (apts, exact)
}

/// [`triangulate_with_token`] with the translated filter inputs supplied by
/// the caller, so the per-point exact translation is paid once per arrangement
/// instead of twice — robust/arrangement.rs derives exactly these values, from
/// exactly this origin, for its own filtered sweeps.
///
/// `apts[i]` must be a correctly rounded f64 pair of `points[i] − points[0]`
/// and `exact[i]` must be true only when that pair is EXACTLY that difference.
/// Nothing else may be passed: the semi-static filters are sound for any
/// inputs meeting those two conditions and unsound for any others. The exact
/// fallbacks are unaffected either way — they run on `points`' own homogenized
/// rationals, untranslated.
pub(crate) fn triangulate_with_apts(
    points: &[R2],
    constraints: &[(usize, usize)],
    apts: Vec<[f64; 2]>,
    exact: Vec<bool>,
    token: Option<&crate::cancel::CancelToken>,
) -> Option<Vec<[usize; 3]>> {
    assert!(points.len() >= 3, "need the three corner points");
    debug_assert_eq!(apts.len(), points.len(), "one filter input per point");
    debug_assert_eq!(exact.len(), points.len(), "one exactness flag per point");
    let hom: Vec<Homog2> = points.iter().map(homog2_of).collect();
    let mut corners = [0usize, 1, 2];
    let orient = orient2d_h(&hom[0], &hom[1], &hom[2]);
    assert!(
        orient != Sign::Zero,
        "degenerate base triangle in CDT input"
    );
    if orient == Sign::Neg {
        corners.swap(1, 2);
    }

    // Approximations are taken of the points TRANSLATED by points[0], with the
    // subtraction done exactly in rationals and only the result rounded.
    //
    // Both filters (orient2d, incircle) are translation invariant, so the sign
    // they certify for the translated configuration is the sign of the
    // original one — but their error bounds are not: a rounded coordinate
    // carries a perturbation proportional to its own magnitude, so for an
    // arrangement sitting far from the world origin the untranslated bound is
    // built from |p| while the determinant is built from the (tiny) spacing
    // within the cluster, and every call escalates to the bignum tier.
    // Translating first replaces |p| by the cluster extent: a third of the
    // exact-tier incircle escalations disappear on the #42322 family, and
    // #1716279 (1.44M arrangement points) spends 127s in this stage instead
    // of 491s.
    // The exact-input path stays sound under the same argument: what it
    // requires is that the f64 it sees be exactly the value whose determinant
    // it is bounding, which after translation is the translated rational.
    //
    // `apts`/`exact` arrive from the caller (see `translated_filter_inputs`
    // for the values they must hold) because robust/arrangement.rs derives the
    // identical pair, from the identical origin, for its own sweeps.
    let mut by_coord: Vec<usize> = (0..points.len()).collect();
    by_coord.sort_by(|&i, &j| {
        points[i]
            .x
            .cmp(&points[j].x)
            .then_with(|| points[i].y.cmp(&points[j].y))
    });
    let mut rank = vec![0u32; points.len()];
    for (r, &i) in by_coord.iter().enumerate() {
        rank[i] = r as u32;
    }
    let mut cdt = Cdt {
        pts: hom,
        apts,
        exact,
        tris: vec![Tri {
            v: corners,
            adj: [-1, -1, -1],
            con: [false, false, false],
            alive: true,
        }],
        suspects: Vec::new(),
        vert_tri: vec![0; points.len()],
        rank,
    };

    // One point insertion is a located split plus a bounded flip cascade, so
    // batching the check keeps it off the hot path; one constraint recovery is
    // a whole corridor walk plus two pseudo-polygon retriangulations, which is
    // expensive enough to check every time.
    for p in 3..cdt.pts.len() {
        if p % 64 == 0 && crate::cancel::is_cancelled(token) {
            return None;
        }
        let first_new = cdt.tris.len();
        cdt.insert_point(p);
        cdt.seed_suspects(first_new);
        cdt.legalize_suspects();
    }
    for &(a, b) in constraints {
        if crate::cancel::is_cancelled(token) {
            return None;
        }
        debug_assert_ne!(a, b, "zero-length constraint");
        let first_new = cdt.tris.len();
        cdt.insert_constraint(a, b);
        cdt.seed_suspects(first_new);
        cdt.legalize_suspects();
    }

    Some(cdt.tris.iter().filter(|t| t.alive).map(|t| t.v).collect())
}

/// Is `r` exactly representable in f64 — i.e. is `rat_to_f64(r)` equal to `r`?
/// Only then may the exact-input filters run: they assume zero input
/// perturbation.
///
/// Deliberately CONSERVATIVE and allocation-free: rationals are stored fully
/// reduced, so `n/d` is exactly representable whenever `|n| < 2⁵³` and `d` is
/// a power of two (the value then has ≤ 53 significant bits and, with both
/// parts inside 64 bits, an exponent nowhere near the f64 range limits). Any
/// value that fails this test — including the representable-but-huge ones like
/// 2⁶⁰ — is simply reported inexact, which costs an optimization, never
/// correctness. The two `to_*` conversions reject on word count alone, so
/// constructed intersection points (huge numerators) bail in a few
/// instructions with no bignum work at all; this precompute runs once per
/// point per triangulation, against O(n log n) predicate calls.
#[inline]
fn is_exact(r: &Rational) -> bool {
    match (numer(r).to_i64(), denom(r).to_u64()) {
        (Some(n), Some(d)) => d.is_power_of_two() && n.unsigned_abs() < (1u64 << 53),
        _ => false,
    }
}

impl Cdt {
    /// orient2d with the approx filter first, exact fallback. All CDT sign
    /// tests funnel through here (and `nondelaunay`) so generic-position
    /// queries never touch the bignum tier.
    #[inline]
    fn o2(&self, i: usize, j: usize, k: usize) -> Sign {
        if self.exact[i] && self.exact[j] && self.exact[k] {
            if let Some(s) = orient2d_a_exact(self.apts[i], self.apts[j], self.apts[k]) {
                return s;
            }
        }
        orient2d_a(self.apts[i], self.apts[j], self.apts[k])
            .unwrap_or_else(|| orient2d_h(&self.pts[i], &self.pts[j], &self.pts[k]))
    }

    /// Incircle sign with the approx filter first, exact fallback. `Pos`
    /// means `d` is strictly inside the circumcircle of the (CCW) triangle;
    /// `Zero` is an exact cocircular tie.
    #[inline]
    fn incircle(&self, tri: [usize; 3], d: usize) -> Sign {
        if self.exact[tri[0]] && self.exact[tri[1]] && self.exact[tri[2]] && self.exact[d] {
            // Tight arithmetic-only bound; neither filter dominates the other
            // (their permanents differ), so fall through to the general one.
            if let Some(s) = incircle_a_exact(
                self.apts[tri[0]],
                self.apts[tri[1]],
                self.apts[tri[2]],
                self.apts[d],
            ) {
                return s;
            }
        }
        match incircle_a(
            self.apts[tri[0]],
            self.apts[tri[1]],
            self.apts[tri[2]],
            self.apts[d],
        ) {
            Some(s) => s,
            None => incircle_h(
                &self.pts[tri[0]],
                &self.pts[tri[1]],
                &self.pts[tri[2]],
                &self.pts[d],
            ),
        }
    }

    /// Strict Delaunay violation (see [`Cdt::incircle`]).
    #[inline]
    fn nondelaunay(&self, tri: [usize; 3], d: usize) -> bool {
        self.incircle(tri, d) == Sign::Pos
    }

    /// Canonical identity of the diagonal {u, v}: the pair of coordinate
    /// ranks, low first. Ranks order points by exact coordinates, so two
    /// coincident coplanar triangles — which project into the same
    /// dominant-axis plane and therefore hand this CDT the same coordinates
    /// for shared points — agree on this key even though their local point
    /// indices differ.
    #[inline]
    fn diag_key(&self, u: usize, v: usize) -> (u32, u32) {
        let (ru, rv) = (self.rank[u], self.rank[v]);
        (ru.min(rv), ru.max(rv))
    }

    /// `point_in_tri_2d` over the filtered predicate (same TriLoc semantics
    /// as `predicates::point_in_tri_2d_h`; triangle is CCW by construction).
    fn loc_in_tri(&self, p: usize, v: [usize; 3]) -> TriLoc {
        let s0 = self.o2(v[0], v[1], p);
        let s1 = self.o2(v[1], v[2], p);
        let s2 = self.o2(v[2], v[0], p);
        if s0 == Sign::Neg || s1 == Sign::Neg || s2 == Sign::Neg {
            return TriLoc::Outside;
        }
        match (s0 == Sign::Zero, s1 == Sign::Zero, s2 == Sign::Zero) {
            (false, false, false) => TriLoc::Inside,
            (true, false, false) => TriLoc::OnEdge(0),
            (false, true, false) => TriLoc::OnEdge(1),
            (false, false, true) => TriLoc::OnEdge(2),
            (true, false, true) => TriLoc::OnVertex(0),
            (true, true, false) => TriLoc::OnVertex(1),
            (false, true, true) => TriLoc::OnVertex(2),
            (true, true, true) => TriLoc::Outside,
        }
    }

    /// Record `t` as the latest triangle containing each of its vertices.
    #[inline]
    fn record(&mut self, t: usize) {
        for v in self.tris[t].v {
            self.vert_tri[v] = t as u32;
        }
    }

    /// A live triangle containing vertex `a`. The `vert_tri` invariant makes
    /// the recorded entry always alive; the scan is a defensive fallback.
    fn live_tri_with(&self, a: usize) -> usize {
        let cand = self.vert_tri[a] as usize;
        if cand < self.tris.len() && self.tris[cand].alive && self.tris[cand].v.contains(&a) {
            return cand;
        }
        debug_assert!(false, "vert_tri invariant broken for vertex {a}");
        (0..self.tris.len())
            .rev()
            .find(|&i| self.tris[i].alive && self.tris[i].v.contains(&a))
            .expect("vertex not in any live triangle")
    }

    /// Rotate around vertex `a` (both directions from its recorded triangle,
    /// so boundary fans are fully covered) applying `f` to each incident
    /// triangle until it returns Some.
    fn rotate_around<T>(&self, a: usize, mut f: impl FnMut(usize) -> Option<T>) -> Option<T> {
        let seed = self.live_tri_with(a);
        for dirn in 0..2 {
            let mut cur = seed;
            loop {
                if dirn == 0 || cur != seed {
                    if let Some(out) = f(cur) {
                        return Some(out);
                    }
                }
                let t = &self.tris[cur];
                let ia = (0..3)
                    .position(|k| t.v[k] == a)
                    .expect("rotation left the vertex fan");
                // dir 0 crosses the edge leaving `a`; dir 1 the edge entering.
                let e_step = if dirn == 0 { ia } else { (ia + 2) % 3 };
                let n = t.adj[e_step];
                if n < 0 || n as usize == seed {
                    break;
                }
                cur = n as usize;
            }
        }
        None
    }

    /// Index of `t`'s edge shared with triangle `n` (panics if not adjacent —
    /// an internal-consistency violation, not an input condition).
    fn shared_edge(&self, t: usize, n: usize) -> usize {
        (0..3)
            .find(|&e| self.tris[t].adj[e] == n as i32)
            .expect("adjacency tables out of sync")
    }

    /// Point back the neighbor across `(t, e)` (if any) to `new_t`.
    fn rewire(&mut self, t: usize, e: usize, new_t: usize) {
        let n = self.tris[t].adj[e];
        if n >= 0 {
            let ne = self.shared_edge(n as usize, t);
            self.tris[n as usize].adj[ne] = new_t as i32;
        }
    }

    fn insert_point(&mut self, p: usize) {
        let (t, loc) = self.locate(p);
        match loc {
            TriLoc::Inside => self.split_interior(t, p),
            TriLoc::OnEdge(e) => self.split_edge(t, e as usize, p),
            TriLoc::OnVertex(_) => {
                debug_assert!(false, "duplicate point reached CDT: {p}");
            }
            TriLoc::Outside => unreachable!("point outside base triangle"),
        }
    }

    fn locate(&self, p: usize) -> (usize, TriLoc) {
        // Visibility walk from the most recent live triangle: step across any
        // edge whose line strictly separates the point (points are inserted
        // before constraints, so the triangulation is Delaunay here and the
        // walk terminates — Edelsbrunner). The step cap is a safety net; on
        // overrun the exhaustive scan below still answers.
        if let Some(start) = (0..self.tris.len()).rev().find(|&i| self.tris[i].alive) {
            let mut cur = start;
            let mut steps = 0usize;
            let cap = 4 * self.tris.len() + 16;
            'walk: while steps < cap {
                steps += 1;
                let t = &self.tris[cur];
                let loc = self.loc_in_tri(p, t.v);
                if loc != TriLoc::Outside {
                    return (cur, loc);
                }
                for e in 0..3 {
                    // CCW triangle: strictly outside edge e ⇔ orient2d neg.
                    if self.o2(t.v[e], t.v[(e + 1) % 3], p) == Sign::Neg {
                        let n = t.adj[e];
                        if n >= 0 {
                            cur = n as usize;
                            continue 'walk;
                        }
                    }
                }
                break; // no separating edge with a neighbor — fall through
            }
        }
        for (i, t) in self.tris.iter().enumerate() {
            if !t.alive {
                continue;
            }
            if self.loc_in_tri(p, t.v) != TriLoc::Outside {
                return (i, self.loc_in_tri(p, t.v));
            }
        }
        unreachable!("point {p} not located in any live triangle");
    }

    /// Split triangle `t` = (a,b,c) at interior point `p` into (a,b,p),
    /// (b,c,p), (c,a,p).
    fn split_interior(&mut self, t: usize, p: usize) {
        let Tri { v, adj, con, .. } = self.tris[t].clone();
        let base = self.tris.len();
        // New triangle k (k=0,1,2) covers edge k of the old triangle; its
        // inner edges connect to the cyclic neighbors.
        for k in 0..3 {
            let next = base + (k + 1) % 3;
            let prev = base + (k + 2) % 3;
            self.tris.push(Tri {
                v: [v[k], v[(k + 1) % 3], p],
                adj: [adj[k], next as i32, prev as i32],
                con: [con[k], false, false],
                alive: true,
            });
        }
        for k in 0..3 {
            self.rewire(t, k, base + k);
            self.record(base + k);
        }
        self.tris[t].alive = false;
    }

    /// Split edge `e` of triangle `t` at point `p` lying exactly on it —
    /// two new triangles per side of the edge.
    fn split_edge(&mut self, t: usize, e: usize, p: usize) {
        let n = self.tris[t].adj[e];
        self.split_edge_one_side(t, e, p);
        if n >= 0 {
            let ne = self.shared_edge(n as usize, t);
            // split_edge_one_side left dangling adjacency into the dead
            // triangle t; splitting the neighbor rewires everything below.
            self.split_edge_one_side(n as usize, ne, p);
            // The four halves now flank the split point: wire them to each
            // other. The two t-halves still point at n and vice versa.
            self.fix_split_pairs(p);
        }
    }

    /// Replace `t` = (a,b,c) with (a,p,c) and (p,b,c), where p lies on edge
    /// e=(a,b). The two halves keep the old adjacency indices toward the
    /// (possibly split) neighbor across e; `fix_split_pairs` repairs those
    /// when both sides exist.
    fn split_edge_one_side(&mut self, t: usize, e: usize, p: usize) {
        let Tri { v, adj, con, .. } = self.tris[t].clone();
        let (a, b, c) = (v[e], v[(e + 1) % 3], v[(e + 2) % 3]);
        let (adj_ab, adj_bc, adj_ca) = (adj[e], adj[(e + 1) % 3], adj[(e + 2) % 3]);
        let (con_ab, con_bc, con_ca) = (con[e], con[(e + 1) % 3], con[(e + 2) % 3]);
        let t1 = self.tris.len();
        let t2 = t1 + 1;
        // (a, p, c): edges (a,p) toward old neighbor, (p,c) inner, (c,a) old.
        self.tris.push(Tri {
            v: [a, p, c],
            adj: [adj_ab, t2 as i32, adj_ca],
            con: [con_ab, false, con_ca],
            alive: true,
        });
        // (p, b, c): edges (p,b) toward old neighbor, (b,c) old, (c,p) inner.
        self.tris.push(Tri {
            v: [p, b, c],
            adj: [adj_ab, adj_bc, t1 as i32],
            con: [con_ab, con_bc, false],
            alive: true,
        });
        self.rewire(t, (e + 1) % 3, t2);
        self.rewire(t, (e + 2) % 3, t1);
        self.record(t1);
        self.record(t2);
        self.tris[t].alive = false;
    }

    /// After both sides of a split edge have been divided, adjacency across
    /// the split still names the two dead triangles. Match the four live
    /// halves incident to `p` whose cross-split edges contain `p`, pairing
    /// edges with identical endpoint sets.
    ///
    /// Only the four halves the two `split_edge_one_side` calls just pushed
    /// can still name a dead triangle — every other neighbor of the two dead
    /// triangles was repaired by `rewire` — so the search is confined to the
    /// tail of the arena. The old full-arena scan made every on-edge
    /// insertion O(arena) and the whole triangulation quadratic on monster
    /// arrangements. The tail is visited in ascending index order, the same
    /// relative order the full scan used, so the pairing decisions are
    /// unchanged.
    fn fix_split_pairs(&mut self, p: usize) {
        // Collect (tri, edge) pairs whose adjacency points at a dead triangle.
        let first = self.tris.len().saturating_sub(4);
        let mut dangling: Vec<(usize, usize)> = Vec::new();
        for i in first..self.tris.len() {
            if !self.tris[i].alive {
                continue;
            }
            for e in 0..3 {
                let n = self.tris[i].adj[e];
                if n >= 0 && !self.tris[n as usize].alive {
                    debug_assert!(
                        self.tris[i].v[e] == p || self.tris[i].v[(e + 1) % 3] == p,
                        "dangling edge must touch the split point"
                    );
                    dangling.push((i, e));
                }
            }
        }
        debug_assert_eq!(
            dangling.len(),
            (0..first)
                .filter(|&i| self.tris[i].alive)
                .flat_map(|i| (0..3).map(move |e| (i, e)))
                .filter(|&(i, e)| {
                    let n = self.tris[i].adj[e];
                    n >= 0 && !self.tris[n as usize].alive
                })
                .count()
                + dangling.len(),
            "dangling adjacency outside the four freshly split halves"
        );
        for i in 0..dangling.len() {
            for j in (i + 1)..dangling.len() {
                let (ti, ei) = dangling[i];
                let (tj, ej) = dangling[j];
                let vi = [self.tris[ti].v[ei], self.tris[ti].v[(ei + 1) % 3]];
                let vj = [self.tris[tj].v[ej], self.tris[tj].v[(ej + 1) % 3]];
                if vi[0] == vj[1] && vi[1] == vj[0] {
                    self.tris[ti].adj[ei] = tj as i32;
                    self.tris[tj].adj[ej] = ti as i32;
                }
            }
        }
    }

    /// Enqueue every triangle from `first_new` onward (the ones an insert or
    /// constraint pass just created) as legalization suspects.
    fn seed_suspects(&mut self, first_new: usize) {
        for t in first_new..self.tris.len() {
            self.suspects.push(t);
        }
    }

    /// Queue-based Lawson legalization: flip every non-constrained, strictly
    /// non-Delaunay, flippable edge reachable from the suspect set. A flip
    /// enqueues the two replacement triangles, and their neighbors get
    /// re-tested through the shared edges when those triangles are examined,
    /// so the worklist reaches everything the old global fixpoint rescan
    /// reached. Termination is argued at [`Cdt::try_flip`].
    fn legalize_suspects(&mut self) {
        while let Some(t) = self.suspects.pop() {
            if t >= self.tris.len() || !self.tris[t].alive {
                continue;
            }
            for e in 0..3 {
                if self.try_flip(t, e) {
                    // t is dead; its replacements are the last two triangles,
                    // and the flipped neighbor's replacement edges are on them.
                    let n = self.tris.len();
                    self.suspects.push(n - 2);
                    self.suspects.push(n - 1);
                    break;
                }
            }
        }
    }

    /// Flip edge `e` of `t` if it is internal, unconstrained, its quad is
    /// strictly convex, and the flip either repairs a strict Delaunay
    /// violation or resolves an exact cocircular tie toward the canonical
    /// (lowest [`Cdt::diag_key`]) diagonal. Returns whether a flip happened.
    ///
    /// Tie flips make the triangulation of a cocircular quad a function of
    /// its point coordinates instead of its construction history, so
    /// coincident coplanar triangles tile shared regions identically (found
    /// on Thingi10K #36088, where a doubled sheet's two copies picked
    /// opposite diagonals of an exact square and the cell complex saw four
    /// [1,0]-step walls where the geometry has [2,0]-step stacks).
    ///
    /// Termination: a strict flip strictly lowers the lifted-paraboloid
    /// volume; a tie flip keeps it equal (that is what cocircular means for
    /// the lift) while strictly lowering the multiset of diagonal keys. The
    /// pair (lift volume, key multiset) therefore strictly decreases
    /// lexicographically on every flip.
    fn try_flip(&mut self, t: usize, e: usize) -> bool {
        if self.tris[t].con[e] {
            return false;
        }
        let n = self.tris[t].adj[e];
        if n < 0 {
            return false;
        }
        let n = n as usize;
        let ne = self.shared_edge(n, t);
        let (a, b, c) = (
            self.tris[t].v[e],
            self.tris[t].v[(e + 1) % 3],
            self.tris[t].v[(e + 2) % 3],
        );
        let d = self.tris[n].v[(ne + 2) % 3];
        match self.incircle(self.tris[t].v, d) {
            Sign::Neg => return false,
            Sign::Zero => {
                // Cocircular: flip only toward the canonical diagonal.
                if self.diag_key(c, d) >= self.diag_key(a, b) {
                    return false;
                }
            }
            Sign::Pos => {}
        }
        // Strictly convex quad a-d-b-c (new triangles must be CCW)?
        if self.o2(a, d, c) != Sign::Pos || self.o2(d, b, c) != Sign::Pos {
            return false;
        }
        self.flip(t, e, n, ne);
        true
    }

    /// Replace triangles t=(a,b,c) and n=(b,a,d) with (a,d,c) and (d,b,c).
    fn flip(&mut self, t: usize, e: usize, n: usize, ne: usize) {
        let (a, b, c) = (
            self.tris[t].v[e],
            self.tris[t].v[(e + 1) % 3],
            self.tris[t].v[(e + 2) % 3],
        );
        let d = self.tris[n].v[(ne + 2) % 3];
        debug_assert_eq!(self.tris[n].v[ne], b);
        debug_assert_eq!(self.tris[n].v[(ne + 1) % 3], a);

        let adj_bc = self.tris[t].adj[(e + 1) % 3];
        let con_bc = self.tris[t].con[(e + 1) % 3];
        let adj_ca = self.tris[t].adj[(e + 2) % 3];
        let con_ca = self.tris[t].con[(e + 2) % 3];
        let adj_ad = self.tris[n].adj[(ne + 1) % 3];
        let con_ad = self.tris[n].con[(ne + 1) % 3];
        let adj_db = self.tris[n].adj[(ne + 2) % 3];
        let con_db = self.tris[n].con[(ne + 2) % 3];

        let t1 = self.tris.len();
        let t2 = t1 + 1;
        // (a, d, c): edges (a,d) old, (d,c) diagonal, (c,a) old.
        self.tris.push(Tri {
            v: [a, d, c],
            adj: [adj_ad, t2 as i32, adj_ca],
            con: [con_ad, false, con_ca],
            alive: true,
        });
        // (d, b, c): edges (d,b) old, (b,c) old, (c,d) diagonal.
        self.tris.push(Tri {
            v: [d, b, c],
            adj: [adj_db, adj_bc, t1 as i32],
            con: [con_db, con_bc, false],
            alive: true,
        });
        self.rewire(t, (e + 1) % 3, t2);
        self.rewire(t, (e + 2) % 3, t1);
        self.rewire(n, (ne + 1) % 3, t1);
        self.rewire(n, (ne + 2) % 3, t2);
        self.record(t1);
        self.record(t2);
        self.tris[t].alive = false;
        self.tris[n].alive = false;
    }
}

#[path = "cdt_constraints.rs"]
mod constraints;

#[cfg(test)]
#[path = "cdt_tests.rs"]
mod tests;
