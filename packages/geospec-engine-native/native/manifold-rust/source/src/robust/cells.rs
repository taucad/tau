// robust/cells.rs — Arrangement cell complex and combinatorial winding
// propagation (Zhou, Grinspun, Zorin, Jacobson 2016, "Mesh Arrangements for
// Solid Geometry" — the formulation libigl's mesh_boolean uses).
//
// This replaces the per-component winding queries of robust/mod.rs with the
// structure that makes local inconsistency unrepresentable. The pieces of
// robust/intersection_graph.rs already form an intersection-free arrangement
// of both operands; what this module adds is the *dual*:
//
//   1. Every piece has two sides (normal / anti). Around each arrangement
//      edge the incident half-faces are radially sorted (the same exact
//      basis + angle_cmp the ring regularization uses), and the wedge
//      between consecutive radial positions unions the sides it touches.
//      The resulting equivalence classes are the 3D cells of the
//      arrangement.
//   2. Winding numbers are then propagated cell-to-cell by breadth-first
//      search: crossing a piece from its normal side to its anti side enters
//      the solid its operand bounds, so w[mesh] increases by one. Because
//      every cell's winding is *derived from one traversal*, adjacent
//      regions cannot disagree — the failure mode of independent per-region
//      queries (two pieces meeting along a segment both classified "outside",
//      leaving a surface that cannot close) does not exist here.
//
// Coincident duplicate faces fall out correctly: they share a radial
// position, so they form one "wall" whose winding step is the signed sum of
// the stack. A doubled sheet steps the winding by two and a fold cancels to
// zero, without any explicit regularization pass.

use std::cmp::Ordering;
// Fx hashing (unseeded) instead of SipHash: `classes` is probe-only, and
// `by_tri` is iterated but its output is sorted by the unique representative
// piece index right after, so hash order cannot reach the result.
use rustc_hash::FxHashMap as HashMap;

use crate::disjoint_sets::DisjointSets;
use crate::linalg::Vec3;

use super::exact::rational::R3;
use super::exact::Sign;
use super::intersection_graph::{edge_key, EdgeKey, IntersectionGraph};
// The result-extraction half of this module (the containment predicate and
// the boundary walk that turns cell labels into output pieces) lives in
// `cells_extract.rs`; it is re-exported here so callers still say
// `cells::extract` / `cells::in_result`.
pub use super::cells_extract::{extract, in_result};

/// Side of a piece: `NORMAL` is the half-space its outward normal points
/// into, `ANTI` the one behind it (inside the solid its operand bounds).
pub const NORMAL: usize = 0;
pub const ANTI: usize = 1;

/// Node id in the side union-find: two per piece.
#[inline]
fn node(piece: usize, side: usize) -> u32 {
    (2 * piece + side) as u32
}

/// The arrangement's cell decomposition.
pub struct CellComplex {
    /// Compact cell id per (piece, side); index with [`node`].
    pub cell_of: Vec<u32>,
    pub num_cells: usize,
    /// Distinct triangles of the arrangement, each with its coincident stack
    /// collapsed into one winding step. Computed once here because both the
    /// winding propagation and the extraction need it.
    pub walls: Vec<Wall>,
}

impl CellComplex {
    #[inline]
    pub fn cell(&self, piece: usize, side: usize) -> usize {
        self.cell_of[node(piece, side) as usize] as usize
    }
}

/// The vertex tables the radial machinery reads: exact coordinates plus
/// their cached correctly rounded f64 approximations. Passing them
/// explicitly (rather than the whole `IntersectionGraph`) lets the output
/// assembly reuse the fan sort on the extracted boundary, which has the same
/// interned vertex ids but no graph of its own.
#[derive(Clone, Copy)]
pub struct VertTables<'a> {
    pub verts: &'a [R3],
    pub verts_f64: &'a [Vec3],
}

impl<'a> VertTables<'a> {
    pub fn of(graph: &'a IntersectionGraph) -> Self {
        VertTables {
            verts: &graph.verts,
            verts_f64: &graph.verts_f64,
        }
    }
}

/// One half-face incident to an arrangement edge.
pub struct Inc {
    /// Caller-defined id of the half-face. [`build_cells`] passes the
    /// piece index; the output pairing (`robust::pairing`) passes the
    /// half-edge index — the fan sort itself never interprets it.
    pub id: usize,
    /// Traversal runs key.0 → key.1 (the edge's canonical direction).
    pub forward: bool,
    /// Vertex id of the opposite (apex) vertex.
    pub apex: u32,
}

/// The side of a half-face that faces counter-clockwise (increasing radial
/// angle) around its edge.
///
/// A forward-traversing face has normal ∝ w × d, which sits 90° CCW of its
/// apex direction, so its normal side is the CCW one; a backward face's
/// normal is 90° CW, so the relationship inverts.
#[inline]
fn ccw_side(forward: bool) -> usize {
    if forward {
        NORMAL
    } else {
        ANTI
    }
}

#[inline]
fn cw_side(forward: bool) -> usize {
    1 - ccw_side(forward)
}

impl Inc {
    #[inline]
    fn ccw_side(&self) -> usize {
        ccw_side(self.forward)
    }

    #[inline]
    fn cw_side(&self) -> usize {
        cw_side(self.forward)
    }
}

/// Build the cell complex over every piece of the graph.
///
/// Discarded/regularized pieces are deliberately *not* excluded: thin
/// material cancels arithmetically in the winding sum, which is both simpler
/// and more robust than deciding up front which sheets are real.
pub fn build_cells(graph: &IntersectionGraph) -> CellComplex {
    build_cells_with_token(graph, None).expect("uncancellable build_cells cannot cancel")
}

/// [`build_cells`] with cooperative cancellation, checked once per
/// arrangement edge. Returns `None` when the token fires.
pub fn build_cells_with_token(
    graph: &IntersectionGraph,
    token: Option<&crate::cancel::CancelToken>,
) -> Option<CellComplex> {
    build_cells_with_progress(graph, token, None)
}

/// [`build_cells_with_token`] that also reports the arrangement-edge sweep's
/// fraction to `progress`. `None` costs nothing (see [`crate::progress`]).
pub fn build_cells_with_progress(
    graph: &IntersectionGraph,
    token: Option<&crate::cancel::CancelToken>,
    progress: Option<&crate::progress::ProgressReporter>,
) -> Option<CellComplex> {
    let n = graph.pieces.len();
    let vt = VertTables::of(graph);
    let ds = DisjointSets::new((2 * n).max(1) as u32);

    // Incident half-faces per edge, as one flat array sorted by edge rather
    // than a hash entry owning its own Vec: the allocation churn of ~3n tiny
    // Vecs dominated cell construction on large arrangements.
    let mut incident: Vec<(EdgeKey, usize, bool, u32)> = Vec::with_capacity(3 * n);
    for (pi, piece) in graph.pieces.iter().enumerate() {
        let vi = piece.vi;
        for e in 0..3 {
            let (a, b) = (vi[e], vi[(e + 1) % 3]);
            incident.push((edge_key(a, b), pi, a < b, vi[(e + 2) % 3]));
        }
    }
    incident.sort_unstable();

    crate::progress::begin_phase(progress, crate::progress::Phase::Cells, incident.len() as u64);
    let mut at = 0;
    while at < incident.len() {
        if crate::cancel::is_cancelled(token) {
            return None;
        }
        let key = &incident[at].0;
        let mut end = at + 1;
        while end < incident.len() && incident[end].0 == *key {
            end += 1;
        }
        let raw = &incident[at..end];
        if let Some(pr) = progress {
            pr.advance((end - at) as u64);
        }
        at = end;
        if raw.len() < 2 {
            continue; // a boundary edge bounds no wedge
        }
        // Ordinary manifold edge whose two faces are provably in different
        // radial directions: the cyclic order is trivial, so both wedges
        // link with no exact angle work at all. These edges outnumber the
        // rest by a wide margin, and computing rational radial directions
        // for them dominated cell construction. The filter must certify
        // non-coplanarity — a coincident pair has one radial position, not
        // two, and linking it as two would fuse the sheet's own sides.
        if raw.len() == 2 {
            let pt = |v: u32| {
                let p = graph.verts_f64[v as usize];
                [p.x, p.y, p.z]
            };
            let sign =
                super::exact::approx::orient3d_a(pt(key.0), pt(key.1), pt(raw[0].3), pt(raw[1].3));
            if matches!(sign, Some(Sign::Neg) | Some(Sign::Pos)) {
                let (p0, fw0) = (raw[0].1, raw[0].2);
                let (p1, fw1) = (raw[1].1, raw[1].2);
                ds.unite(node(p0, ccw_side(fw0)), node(p1, cw_side(fw1)));
                ds.unite(node(p1, ccw_side(fw1)), node(p0, cw_side(fw0)));
                continue;
            }
        }
        let Some((incs, groups)) = radial_fan(key.0, key.1, raw, vt) else {
            continue;
        };
        for gi in 0..groups.len() {
            let (s, e) = groups[gi];
            // All faces of a wall share the cell on each of its two sides.
            for k in s..e {
                ds.unite(
                    node(incs[s].id, incs[s].ccw_side()),
                    node(incs[k].id, incs[k].ccw_side()),
                );
                ds.unite(
                    node(incs[s].id, incs[s].cw_side()),
                    node(incs[k].id, incs[k].cw_side()),
                );
            }
            // The wedge between this wall and the next: CCW side of this
            // wall meets the CW side of the next.
            let (ns, _) = groups[(gi + 1) % groups.len()];
            if groups.len() > 1 {
                ds.unite(
                    node(incs[s].id, incs[s].ccw_side()),
                    node(incs[ns].id, incs[ns].cw_side()),
                );
            }
        }
    }

    // Compact the union-find roots into dense cell ids. Roots are already
    // node ids, so a flat table beats hashing here.
    let mut cell_of = vec![0u32; 2 * n];
    let mut remap = vec![u32::MAX; 2 * n];
    let mut num_cells = 0u32;
    for i in 0..(2 * n) {
        let root = ds.find(i as u32) as usize;
        if remap[root] == u32::MAX {
            remap[root] = num_cells;
            num_cells += 1;
        }
        cell_of[i] = remap[root];
    }
    Some(CellComplex {
        num_cells: num_cells as usize,
        cell_of,
        walls: walls(graph),
    })
}

/// Filtered orientation of apex `b` against apex `a` around the directed
/// edge `k0 → k1`: `Pos` means `b` sits CCW of `a` by less than a half turn.
/// The f64 filter (on the cached correctly rounded approximations) certifies
/// almost every query; only near-coplanar apex pairs escalate to the exact
/// rational determinant.
fn orient_edge(vt: VertTables, k0: u32, k1: u32, a: u32, b: u32) -> Sign {
    let pt = |v: u32| {
        let p = vt.verts_f64[v as usize];
        [p.x, p.y, p.z]
    };
    match super::exact::approx::orient3d_a(pt(k0), pt(k1), pt(a), pt(b)) {
        Some(s @ (Sign::Pos | Sign::Neg)) => s,
        _ => super::exact::predicates::orient3d_r(
            &vt.verts[k0 as usize],
            &vt.verts[k1 as usize],
            &vt.verts[a as usize],
            &vt.verts[b as usize],
        ),
    }
}

/// Exact radial direction of `a`'s apex about edge `k0 → k1`: the cross
/// product `(k1−k0) × (a−k0)`. Zero iff the apex lies on the edge's axis.
fn radial_cross(vt: VertTables, k0: u32, k1: u32, a: u32) -> R3 {
    let w = vt.verts[k1 as usize].sub(&vt.verts[k0 as usize]);
    let d = vt.verts[a as usize].sub(&vt.verts[k0 as usize]);
    w.cross(&d)
}

/// A value with a rigorous absolute error bound, tracked through the few
/// operations the fan filters need. Inputs are correctly rounded f64
/// approximations of exact rationals (error ≤ 0.5 ulp ≤ u·|x|), and every
/// operation adds its own rounding term — the bound is conservative by
/// construction, so a certified sign is exact. This matters because the fan
/// geometry routinely subtracts nearly equal coordinates, where the input
/// rounding error dwarfs a magnitude bound taken on the *differences*.
#[derive(Clone, Copy)]
struct Approx {
    v: f64,
    err: f64,
}

const U: f64 = f64::EPSILON;

impl Approx {
    /// A correctly rounded approximation of an exact value.
    fn input(v: f64) -> Self {
        Approx { v, err: U * v.abs() }
    }
    fn sub(self, o: Approx) -> Self {
        let v = self.v - o.v;
        Approx { v, err: self.err + o.err + U * v.abs() }
    }
    fn mul(self, o: Approx) -> Self {
        let v = self.v * o.v;
        Approx {
            v,
            err: self.v.abs() * o.err + self.err * o.v.abs() + self.err * o.err + U * v.abs(),
        }
    }
    fn add(self, o: Approx) -> Self {
        let v = self.v + o.v;
        Approx { v, err: self.err + o.err + U * v.abs() }
    }
    fn sign(self) -> Option<Sign> {
        if self.v.abs() > self.err {
            Some(if self.v > 0.0 { Sign::Pos } else { Sign::Neg })
        } else {
            None
        }
    }
}

/// The three components of `(k1−k0) × (a−k0)` with error bounds.
fn radial_cross_a(vt: VertTables, k0: u32, k1: u32, a: u32) -> [Approx; 3] {
    let p = |v: u32| {
        let p = vt.verts_f64[v as usize];
        [Approx::input(p.x), Approx::input(p.y), Approx::input(p.z)]
    };
    let (p0, p1, pa) = (p(k0), p(k1), p(a));
    let w = [p1[0].sub(p0[0]), p1[1].sub(p0[1]), p1[2].sub(p0[2])];
    let d = [pa[0].sub(p0[0]), pa[1].sub(p0[1]), pa[2].sub(p0[2])];
    [
        w[1].mul(d[2]).sub(w[2].mul(d[1])),
        w[2].mul(d[0]).sub(w[0].mul(d[2])),
        w[0].mul(d[1]).sub(w[1].mul(d[0])),
    ]
}

/// Is the apex on the edge's axis (a degenerate sliver with no wedge)?
/// A certifiably nonzero cross component proves off-axis; only near-axis
/// apexes pay for the exact cross.
fn on_axis(vt: VertTables, k0: u32, k1: u32, a: u32) -> bool {
    if radial_cross_a(vt, k0, k1, a)
        .iter()
        .any(|c| c.sign().is_some())
    {
        return false;
    }
    radial_cross(vt, k0, k1, a).is_zero()
}

/// For two apexes whose radial directions are exactly parallel (orient_edge
/// returned Zero), do they point the same way (`Pos`, a coincident stack) or
/// opposite ways (`Neg`, a fold)? Sign of the dot of the two radial crosses;
/// exact fallback only when the error-tracked f64 dot cannot certify.
fn same_ray_sign(vt: VertTables, k0: u32, k1: u32, a: u32, b: u32) -> Sign {
    let ca = radial_cross_a(vt, k0, k1, a);
    let cb = radial_cross_a(vt, k0, k1, b);
    let dot = ca[0]
        .mul(cb[0])
        .add(ca[1].mul(cb[1]))
        .add(ca[2].mul(cb[2]));
    if let Some(s) = dot.sign() {
        return s;
    }
    let ea = radial_cross(vt, k0, k1, a);
    let eb = radial_cross(vt, k0, k1, b);
    let exact = &ea.x * &eb.x + &ea.y * &eb.y + &ea.z * &eb.z;
    Sign::of_rat(&exact)
}

/// Radially sort the incident half-faces of one arrangement edge and group
/// coincident directions, returning `None` when fewer than two off-axis
/// faces remain.
///
/// The cyclic CCW order is derived from filtered orient3d queries against a
/// reference apex (the first off-axis face) instead of exact coordinates in
/// a rational basis: classify every face into {reference ray, CCW half,
/// opposite ray, CW half}, then sort each open half by pairwise orientation.
/// Two faces compare Equal exactly when their radial directions coincide, so
/// the Equal-runs are the coincident walls. The starting point of a cyclic
/// order is immaterial to the wedge links, which lets the whole fan run on
/// the f64 filter in the common case — the rational-basis construction this
/// replaces dominated cell construction on self-intersecting scans.
pub fn radial_fan(
    k0: u32,
    k1: u32,
    raw: &[(EdgeKey, usize, bool, u32)],
    vt: VertTables,
) -> Option<(Vec<Inc>, Vec<(usize, usize)>)> {
    let mut incs: Vec<Inc> = raw
        .iter()
        .filter(|&&(_, _, _, apex)| !on_axis(vt, k0, k1, apex))
        .map(|&(_, id, forward, apex)| Inc { id, forward, apex })
        .collect();
    if incs.len() < 2 {
        return None;
    }
    // Class of each face relative to the reference apex: 0 = on the
    // reference ray, 1 = strictly CCW of it (first half turn), 2 = on the
    // opposite ray, 3 = strictly CW (second half turn).
    let r = incs[0].apex;
    let class = |apex: u32| -> u8 {
        if apex == r {
            return 0;
        }
        match orient_edge(vt, k0, k1, r, apex) {
            Sign::Pos => 1,
            Sign::Neg => 3,
            Sign::Zero => match same_ray_sign(vt, k0, k1, r, apex) {
                Sign::Pos => 0,
                Sign::Neg => 2,
                Sign::Zero => unreachable!("parallel nonzero radial rays have nonzero dot"),
            },
        }
    };
    let classes: HashMap<u32, u8> = incs.iter().map(|i| (i.apex, class(i.apex))).collect();
    incs.sort_by(|a, b| {
        let (ca, cb) = (classes[&a.apex], classes[&b.apex]);
        ca.cmp(&cb)
            .then_with(|| {
                if ca != 1 && ca != 3 || a.apex == b.apex {
                    Ordering::Equal // same ray by class
                } else {
                    // Within an open half turn, Zero means the same ray (the
                    // opposite ray would land in the other class).
                    match orient_edge(vt, k0, k1, a.apex, b.apex) {
                        Sign::Pos => Ordering::Less,
                        Sign::Neg => Ordering::Greater,
                        Sign::Zero => Ordering::Equal,
                    }
                }
            })
            .then_with(|| a.id.cmp(&b.id))
    });

    // Equal-direction runs become the walls.
    let mut groups = Vec::new();
    let mut i = 0;
    while i < incs.len() {
        let mut j = i + 1;
        while j < incs.len() && {
            let (ci, cj) = (classes[&incs[i].apex], classes[&incs[j].apex]);
            ci == cj
                && (ci == 0
                    || ci == 2
                    || incs[i].apex == incs[j].apex
                    || orient_edge(vt, k0, k1, incs[i].apex, incs[j].apex) == Sign::Zero)
        } {
            j += 1;
        }
        groups.push((i, j));
        i = j;
    }
    Some((incs, groups))
}

/// Per-cell winding numbers, one entry per operand.
pub struct Windings {
    /// `w[cell] = [w_P, w_Q]`, valid only where `known[cell]`.
    pub w: Vec<[i32; 2]>,
    pub known: Vec<bool>,
}

impl Windings {
    /// Every cell resolved — no residual point queries needed.
    pub fn complete(&self) -> bool {
        self.known.iter().all(|&k| k)
    }
}

/// Winding numbers for *every* cell.
///
/// The combinatorial BFS only reaches cells connected through shared
/// arrangement edges, so disjoint or nested components need a seed each:
/// exactly the residual ray-shooting libigl's `propagate_winding_numbers`
/// performs. One exact query pair per component, not per surface region.
/// Winding numbers for every cell of the arrangement.
///
/// Each connected component is anchored by one exact point query and the
/// rest of its cells follow combinatorially, so the expensive part scales
/// with the number of components rather than the number of regions.
///
/// The anchor is deliberately measured rather than deduced. Identifying the
/// unbounded cell combinatorially — take the lexicographically extreme
/// vertex, pick the incident face most nearly perpendicular to x, call its
/// outward side unbounded — is wrong whenever that face's outward side holds
/// material, which happens on real scans (a thin shell whose rim reaches the
/// extreme vertex). The failure is silent and total: anchoring an interior
/// cell at zero shifts every winding by a constant, and `w ≥ 1` then
/// excludes almost the whole model. Two Thingi10K unions collapsed from
/// 51372 and 5856 triangles to 4 and 40 that way.
pub fn windings(
    graph: &IntersectionGraph,
    complex: &CellComplex,
    tris: [&[[Vec3; 3]]; 2],
) -> Windings {
    let rat = [to_rational(tris[0]), to_rational(tris[1])];
    let bx = [tri_boxes(tris[0]), tri_boxes(tris[1])];
    let mut out = Windings {
        w: vec![[0i32; 2]; complex.num_cells],
        known: vec![false; complex.num_cells],
    };
    seed_unreached(
        graph,
        complex,
        &mut out,
        tris,
        [&rat[0], &rat[1]],
        [&bx[0], &bx[1]],
    );
    out
}

fn to_rational(tris: &[[Vec3; 3]]) -> Vec<[R3; 3]> {
    tris.iter()
        .map(|t| [R3::from_vec3(t[0]), R3::from_vec3(t[1]), R3::from_vec3(t[2])])
        .collect()
}

fn tri_boxes(tris: &[[Vec3; 3]]) -> Vec<crate::types::Box> {
    tris.iter()
        .map(|t| {
            let mut b = crate::types::Box::from_points(t[0], t[1]);
            b.union_point(t[2]);
            b
        })
        .collect()
}

/// Resolve whatever the outer traversal could not reach — disjoint or nested
/// components — with one exact query pair each.
///
/// Returns immediately when everything is already known, so callers can hold
/// off building the rational and bounding-box tables until this says it
/// needs them.
pub fn seed_unreached(
    graph: &IntersectionGraph,
    complex: &CellComplex,
    out: &mut Windings,
    tris_f64: [&[[Vec3; 3]]; 2],
    tris_r: [&[[R3; 3]]; 2],
    boxes: [&[crate::types::Box]; 2],
) {
    if out.complete() {
        return;
    }
    let adj = cell_adjacency(complex);

    // A representative (piece, side) per cell, for seeding by point query.
    let mut rep: Vec<Option<(usize, usize)>> = vec![None; complex.num_cells];
    for pi in 0..graph.pieces.len() {
        for side in [NORMAL, ANTI] {
            let c = complex.cell(pi, side);
            if rep[c].is_none() {
                rep[c] = Some((pi, side));
            }
        }
    }

    for c in 0..complex.num_cells {
        if out.known[c] {
            continue;
        }
        let Some((pi, side)) = rep[c] else { continue };
        let pv = graph.piece_verts(pi);
        let point = super::ray_shoot::piece_centroid(pv);
        let n = pv[1].sub(pv[0]).cross(&pv[2].sub(pv[0]));
        let outward = if side == NORMAL {
            n
        } else {
            R3::new(-&n.x, -&n.y, -&n.z)
        };
        let mut w = [0i32; 2];
        for m in 0..2 {
            w[m] = super::ray_shoot::winding_off_surface(
                &point,
                &outward,
                tris_r[m],
                tris_f64[m],
                boxes[m],
            );
        }
        seed(out, c, w);
        bfs(&adj, out, c);
    }
}

fn seed(out: &mut Windings, cell: usize, w: [i32; 2]) {
    out.w[cell] = w;
    out.known[cell] = true;
}

/// Winding step between adjacent cells, **summed** over every piece that
/// separates them.
///
/// Aggregation is what gives coincident stacks their multiplicity: a doubled
/// sheet contributes +2 and a fold cancels to 0, so self-overlapping input
/// classifies correctly with no separate regularization pass. Treating the
/// coincident pieces as independent adjacencies would apply only the first
/// and silently lose the rest.
fn cell_adjacency(complex: &CellComplex) -> Vec<Vec<(usize, [i32; 2])>> {
    let mut adj: Vec<Vec<(usize, [i32; 2])>> = vec![Vec::new(); complex.num_cells];
    for &Wall { rep, delta } in &complex.walls {
        let (cn, ca) = (complex.cell(rep, NORMAL), complex.cell(rep, ANTI));
        if cn == ca {
            continue; // both sides in one cell: the sheet bounds nothing
        }
        adj[cn].push((ca, delta));
        adj[ca].push((cn, [-delta[0], -delta[1]]));
    }
    // Every wall stays its own edge — collapsing them by cell pair would let
    // an arbitrary one win, which is both order-dependent and lossy. Sorting
    // makes the traversal deterministic regardless of hash iteration order.
    for a in adj.iter_mut() {
        a.sort_unstable();
        a.dedup();
    }
    adj
}

/// Walls whose winding step disagrees with the cells' resolved windings.
///
/// The difference between two cells is well defined, so a disagreement means
/// the complex merged cells that the geometry keeps apart. Used by tests and
/// diagnostics; a clean arrangement returns an empty list.
pub fn inconsistent_walls(
    complex: &CellComplex,
    wind: &Windings,
) -> Vec<(usize, [i32; 2], [i32; 2])> {
    let mut bad = Vec::new();
    for &Wall { rep, delta } in &complex.walls {
        let (cn, ca) = (complex.cell(rep, NORMAL), complex.cell(rep, ANTI));
        if cn == ca || !wind.known[cn] || !wind.known[ca] {
            continue;
        }
        let actual = [
            wind.w[ca][0] - wind.w[cn][0],
            wind.w[ca][1] - wind.w[cn][1],
        ];
        if actual != delta {
            bad.push((rep, delta, actual));
        }
    }
    bad
}

/// One distinct triangle of the arrangement, with the coincident stack that
/// occupies it collapsed into a single winding step.
#[derive(Clone, Copy)]
pub struct Wall {
    /// Representative piece; its winding fixes the wall's normal side.
    pub rep: usize,
    /// Winding change per operand, crossing the representative's normal side
    /// to its anti side.
    pub delta: [i32; 2],
}

/// Group pieces into walls by exact triangle identity.
///
/// Pieces occupying the same triangle are a coincident stack whose
/// contributions add — a doubled sheet steps by two, a fold cancels to zero.
/// Two *different* triangles between the same pair of cells are alternative
/// crossings of one boundary and are never summed; that distinction is why
/// aggregation keys on the triangle rather than the cell pair.
fn walls(graph: &IntersectionGraph) -> Vec<Wall> {
    let mut by_tri: HashMap<[u32; 3], (usize, bool, [i32; 2])> = HashMap::default();
    for (pi, piece) in graph.pieces.iter().enumerate() {
        let (key, parity) = canonical(piece.vi);
        let m = piece.mesh as usize;
        let entry = by_tri.entry(key).or_insert((pi, parity, [0; 2]));
        // Opposite winding means this piece's normal side is the
        // representative's anti side, so it steps the other way.
        entry.2[m] += if parity == entry.1 { 1 } else { -1 };
    }
    let mut out: Vec<Wall> = by_tri
        .into_values()
        .map(|(rep, _, delta)| Wall { rep, delta })
        .collect();
    // Hash iteration order must not reach the output: sort so extraction
    // emits triangles in a stable order across runs.
    out.sort_unstable_by_key(|w| w.rep);
    out
}

/// Canonical key for a triangle (sorted vertex ids) plus the parity of the
/// piece's winding against that order — the same identity the coincident
/// binding uses, so both agree on what "the same triangle" means.
fn canonical(vi: [u32; 3]) -> ([u32; 3], bool) {
    let mut sorted = vi;
    sorted.sort_unstable();
    let i = (0..3).min_by_key(|&i| vi[i]).unwrap_or(0);
    let rotated = [vi[i], vi[(i + 1) % 3], vi[(i + 2) % 3]];
    (sorted, rotated == sorted)
}

fn bfs(adj: &[Vec<(usize, [i32; 2])>], out: &mut Windings, start: usize) {
    let mut queue = std::collections::VecDeque::from([start]);
    while let Some(c) = queue.pop_front() {
        let base = out.w[c];
        for &(next, d) in &adj[c] {
            if out.known[next] {
                continue;
            }
            seed(out, next, [base[0] + d[0], base[1] + d[1]]);
            queue.push_back(next);
        }
    }
}


#[cfg(test)]
#[path = "cells_tests.rs"]
mod tests;
