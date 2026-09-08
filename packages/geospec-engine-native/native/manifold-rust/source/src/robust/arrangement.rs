// robust/arrangement.rs — Per-triangle 2D arrangement (paper §6.3–6.4).
//
// Each input triangle that intersects triangles of the other operand gets an
// arrangement: the exact intersection primitives that landed on it (points,
// segments, coplanar-overlap polygon boundaries) are projected into the
// triangle's dominant-axis plane, split at their mutual crossings, and handed
// to robust/cdt.rs as constraints. The result subdivides the triangle into
// sub-triangles whose edges preserve every intersection segment, with a
// provenance map from constraint edges back to the primitives that created
// them — the edge→triangles incidence the classification stage
// (robust/classify.rs) walks.
//
// Everything here is exact: projection is coordinate dropping (bijective on
// the triangle's plane), crossings are rational constructions, and identity
// is rational equality — no tolerances anywhere.

use std::collections::BTreeMap;

use super::exact::backend::{
    denom, int_from_uint, mul_int_uint, mul_uint, numer, Int, Rational, Signed,
};

use crate::linalg::Vec3;

use super::cdt;
use super::exact::approx::orient2d_a;
use super::exact::predicates::{homog2_of, line_line_intersect_2d, orient2d_h, point_in_tri_2d, tri_normal_r, Homog2, TriLoc};
use super::exact::rational::{int_ratio_to_f64, R2, R2Key, R3};
use super::exact::Sign;
use super::tri_tri::{dominant_axis, lift_to_plane};

/// Intersection primitives to arrange on one triangle, each tagged with a
/// caller-defined provenance id (the robust pipeline uses the index of the
/// opposing triangle pair that produced it).
#[derive(Clone, Debug, Default)]
pub struct ArrangementInput {
    /// Isolated contact points (vertex touches, edge-through-edge points).
    pub points: Vec<(R3, usize)>,
    /// Intersection segments, including coplanar-overlap polygon edges.
    /// Endpoints must be distinct and lie inside or on the triangle.
    pub segments: Vec<(R3, R3, usize)>,
}

/// The subdivided triangle.
#[derive(Clone, Debug)]
pub struct Arrangement {
    /// Dropped coordinate of the projection (0=x, 1=y, 2=z).
    pub axis: usize,
    /// Exact 3D points; indices 0..3 are the triangle corners in input order.
    pub points3: Vec<R3>,
    /// Their exact 2D projections (same indexing).
    pub points2: Vec<R2>,
    /// Sub-triangles (indices into points*), CCW in projection space.
    pub tris: Vec<[usize; 3]>,
    /// Constraint edges as (min,max) index pairs → provenance ids of every
    /// primitive that generated the edge.
    pub constraints: BTreeMap<(usize, usize), Vec<usize>>,
    /// True when the 2D projection mirrors the triangle's 3D winding (the
    /// dropped normal component is negative): consumers must swap two
    /// indices of each sub-triangle to recover outward orientation.
    pub flipped: bool,
}


/// Aggregate phase timers for build(), printed under MANIFOLD_TIMING by the
/// pipeline after the arrangements stage. Relaxed atomics, nanoseconds.
pub mod stats {
    use std::sync::atomic::{AtomicU64, Ordering::Relaxed};

    pub static SETUP_NS: AtomicU64 = AtomicU64::new(0);
    pub static NORM_NS: AtomicU64 = AtomicU64::new(0);
    pub static CROSS_NS: AtomicU64 = AtomicU64::new(0);
    pub static ONSEG_NS: AtomicU64 = AtomicU64::new(0);
    pub static CDT_NS: AtomicU64 = AtomicU64::new(0);
    pub static CALLS: AtomicU64 = AtomicU64::new(0);
    pub static SEGS: AtomicU64 = AtomicU64::new(0);
    pub static PTS: AtomicU64 = AtomicU64::new(0);

    pub fn snapshot_and_reset() -> String {
        let take = |a: &AtomicU64| a.swap(0, Relaxed) as f64 * 1e-9;
        let taken = |a: &AtomicU64| a.swap(0, Relaxed);
        format!(
            "setup {:.3}s (norm {:.3}s), crossings {:.3}s, on-seg {:.3}s, cdt {:.3}s ({} calls, {} segs, {} pts)",
            take(&SETUP_NS),
            take(&NORM_NS),
            take(&CROSS_NS),
            take(&ONSEG_NS),
            take(&CDT_NS),
            taken(&CALLS),
            taken(&SEGS),
            taken(&PTS),
        )
    }
}

/// Conservative 2D box `[min_x, min_y, max_x, max_y]` around exact points
/// from their correctly rounded f64 approximations: inflated past rounding
/// error, so geometry lying exactly on/inside the exact hull is never
/// rejected by a box test on the approximations. Used to prefilter the
/// quadratic sweeps below — Thingi10K's scan-like inputs put hundreds of
/// short segments in one triangle, and paying an (often escalating) exact
/// predicate per pair made 4k-triangle meshes run for minutes.
#[inline]
fn approx_box(pts: &[[f64; 2]]) -> [f64; 4] {
    let (mut b, rest) = ([pts[0][0], pts[0][1], pts[0][0], pts[0][1]], &pts[1..]);
    for p in rest {
        b[0] = b[0].min(p[0]);
        b[1] = b[1].min(p[1]);
        b[2] = b[2].max(p[0]);
        b[3] = b[3].max(p[1]);
    }
    // ~4.5 ulp of slack (rounding error is ≤ 0.5 ulp) plus a subnormal floor.
    let pad = |x: f64| x.abs() * 1e-15 + f64::MIN_POSITIVE;
    [
        b[0] - pad(b[0]),
        b[1] - pad(b[1]),
        b[2] + pad(b[2]),
        b[3] + pad(b[3]),
    ]
}

/// One coordinate of `p − o`, correctly rounded to f64, plus "this f64 is
/// EXACTLY that difference".
///
/// `pn/pd − on/od = (pn·od − on·pd) / (pd·od)`, handed to
/// [`int_ratio_to_f64`] as a raw — deliberately unreduced — big-integer ratio.
/// Correct rounding is a function of the VALUE, not of the representation, so
/// this is bit-identical to subtracting in `Rational` and rounding the result
/// (pinned by
/// `exact::tests::homogeneous_translation_rounds_identically_to_rational_subtraction`),
/// but it skips the gcd that constructing the canonical difference would cost
/// — one reduction per coordinate per point, on arrangements that reach over a
/// million points.
///
/// Deliberately per-coordinate rather than over the `Homog2` values already on
/// hand: homogenizing puts BOTH coordinates' denominators into every `W`, so
/// the homogeneous form of this same difference carries a four-way denominator
/// product and its wider operands cost more in the final division than the gcd
/// ever did.
#[inline]
fn translated_coord(pc: &Rational, oc: &Rational) -> (f64, bool) {
    let (pn, pd) = (numer(pc), denom(pc));
    let (on, od) = (numer(oc), denom(oc));
    let num = mul_int_uint(pn, od) - mul_int_uint(on, pd);
    let den = int_from_uint(mul_uint(pd, od));
    int_ratio_to_f64(&num, &den)
}

/// `p − o` in the projection plane: both coordinates via [`translated_coord`],
/// with the exactness flags combined (the tight filters need the whole point
/// to be exact).
///
/// The flag here is the conversion's own "no rounding occurred", which is the
/// exact-input filters' actual precondition. It is strictly more permissive
/// than cdt.rs's `is_exact` — that one is a cheap syntactic test on a reduced
/// rational and gives up on representable-but-large dyadics — so some points
/// gain the tight filter that the standalone `cdt::triangulate` path would not
/// grant them. Sound either way: both filters certify true signs, and the flag
/// is true only when the f64 really is the translated value.
#[inline]
fn translated_approx(o: &R2, p: &R2) -> ([f64; 2], bool) {
    let (x, x_exact) = translated_coord(&p.x, &o.x);
    let (y, y_exact) = translated_coord(&p.y, &o.y);
    ([x, y], x_exact && y_exact)
}

#[inline]
fn boxes_overlap(a: &[f64; 4], b: &[f64; 4]) -> bool {
    a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
}

#[inline]
fn box_contains(b: &[f64; 4], p: [f64; 2]) -> bool {
    p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]
}

/// Every index pair `i < j` whose conservative boxes overlap, stored as CSR
/// rows: `partners[starts[i]..starts[i + 1]]` holds `i`'s partners in
/// ascending order.
///
/// Iterating rows in index order therefore yields exactly `(i, ascending j)`
/// lexicographic order — the enumeration order of the O(S²) nested loops this
/// replaces. The exact predicate stack downstream sees the identical sequence
/// of surviving pairs and constructs identical points in identical order, so
/// the acceleration is invisible to the output by construction.
///
/// CSR rather than a `Vec<(u32, u32)>`: a monster triangle can produce tens of
/// millions of overlapping pairs, and storing only the partner index halves
/// the peak footprint and removes a global sort of that whole list.
struct BoxPairs {
    starts: Vec<u32>,
    partners: Vec<u32>,
}

impl BoxPairs {
    fn iter(&self) -> impl Iterator<Item = (usize, usize)> + '_ {
        (0..self.starts.len() - 1).flat_map(move |i| {
            self.partners[self.starts[i] as usize..self.starts[i + 1] as usize]
                .iter()
                .map(move |&j| (i, j as usize))
        })
    }
}

/// Interval sweep producing [`BoxPairs`]. Returns `None` only when `token` is
/// cancelled: a monster triangle can hold thousands of segments and the sweep
/// itself must stay interruptible.
fn overlapping_box_pairs(
    boxes: &[[f64; 4]],
    token: Option<&crate::cancel::CancelToken>,
) -> Option<BoxPairs> {
    let n = boxes.len();
    let mut starts = vec![0u32; n + 1];
    // Below this size the sweep's sorts cost more than the scan they save.
    if n <= 64 {
        let mut partners: Vec<u32> = Vec::new();
        for i in 0..n {
            starts[i] = partners.len() as u32;
            for j in (i + 1)..n {
                if boxes_overlap(&boxes[i], &boxes[j]) {
                    partners.push(j as u32);
                }
            }
        }
        starts[n] = partners.len() as u32;
        return Some(BoxPairs { starts, partners });
    }
    // Sweep along whichever axis packs the boxes more thinly: the expected
    // active-list length is (sum of box extents) / (total span).
    let mut lo = [f64::INFINITY; 2];
    let mut hi = [f64::NEG_INFINITY; 2];
    let mut width = [0.0f64; 2];
    for b in boxes {
        for k in 0..2 {
            lo[k] = lo[k].min(b[k]);
            hi[k] = hi[k].max(b[k + 2]);
            width[k] += b[k + 2] - b[k];
        }
    }
    let density = |k: usize| -> f64 {
        let span = hi[k] - lo[k];
        if span > 0.0 && span.is_finite() && width[k].is_finite() {
            width[k] / span
        } else {
            f64::INFINITY
        }
    };
    let axis = if density(1) < density(0) { 1 } else { 0 };
    let (slo, shi) = (axis, axis + 2);
    let (olo, ohi) = (1 - axis, 3 - axis);

    // Ties broken by index so the sweep is a deterministic function of the
    // boxes (NaN coordinates, which the old scan rejected outright, sort to
    // one end under total_cmp and never satisfy an overlap test).
    let mut order: Vec<u32> = (0..n as u32).collect();
    order.sort_unstable_by(|&a, &b| {
        boxes[a as usize][slo]
            .total_cmp(&boxes[b as usize][slo])
            .then(a.cmp(&b))
    });

    // The sweep is run twice — once to size each CSR row, once to fill it —
    // so the pair list is never materialized as (i, j) tuples.
    let mut active: Vec<u32> = Vec::new();
    let mut sweep = |emit: &mut dyn FnMut(u32, u32)| -> Option<()> {
        active.clear();
        for (step, &c) in order.iter().enumerate() {
            if step % 1024 == 0 && crate::cancel::is_cancelled(token) {
                return None;
            }
            let cb = &boxes[c as usize];
            // Retire boxes that ended before this one starts; what survives
            // already overlaps on the sweep axis (their low ends precede
            // cb[slo]), so only the other axis is left to test.
            active.retain(|&a| boxes[a as usize][shi] >= cb[slo]);
            for &a in &active {
                let ab = &boxes[a as usize];
                if ab[olo] <= cb[ohi] && cb[olo] <= ab[ohi] {
                    emit(a.min(c), a.max(c));
                }
            }
            active.push(c);
        }
        Some(())
    };

    sweep(&mut |i, _j| starts[i as usize + 1] += 1)?;
    for i in 0..n {
        starts[i + 1] += starts[i];
    }
    let total = starts[n] as usize;
    let mut partners = vec![0u32; total];
    let mut cursor: Vec<u32> = starts[..n].to_vec();
    sweep(&mut |i, j| {
        partners[cursor[i as usize] as usize] = j;
        cursor[i as usize] += 1;
    })?;
    // The sweep visits each row's partners in sweep order, not index order.
    for i in 0..n {
        partners[starts[i] as usize..starts[i + 1] as usize].sort_unstable();
    }
    Some(BoxPairs { starts, partners })
}

/// Static x-sorted index over the registered points, for the point-on-segment
/// sweep: replaces the O(P) rescan of every point per segment with a range
/// query over the segment's conservative box. Query results are re-sorted
/// into ascending point index, which is the order the old inner loop visited
/// them in, so the filtered predicates run in an unchanged sequence.
struct PointIndex {
    by_x: Vec<u32>,
}

impl PointIndex {
    fn build(apts: &[[f64; 2]]) -> Self {
        let mut by_x: Vec<u32> = (0..apts.len() as u32).collect();
        by_x.sort_unstable_by(|&a, &b| {
            apts[a as usize][0]
                .total_cmp(&apts[b as usize][0])
                .then(a.cmp(&b))
        });
        Self { by_x }
    }

    fn query(&self, apts: &[[f64; 2]], b: &[f64; 4], out: &mut Vec<usize>) {
        out.clear();
        // `by_x` is ordered by `total_cmp`, so partitioning on that same total
        // order is well defined whatever the coordinates are; the rewind then
        // restores plain numeric semantics at the low end (−0.0 and +0.0 are
        // equal to `box_contains` but not to `total_cmp`). The result is a
        // superset of what the old full rescan's `box_contains` accepted,
        // which is all conservativeness requires.
        let mut start = self
            .by_x
            .partition_point(|&i| apts[i as usize][0].total_cmp(&b[0]).is_lt());
        while start > 0 && apts[self.by_x[start - 1] as usize][0] >= b[0] {
            start -= 1;
        }
        for &i in &self.by_x[start..] {
            let p = apts[i as usize];
            // Numeric test at the high end: the slice is numerically
            // non-decreasing (`total_cmp` only reorders values that compare
            // equal), so this never stops early, and a hypothetical NaN
            // simply fails the test and costs a wasted `box_contains`.
            if p[0] > b[2] {
                break;
            }
            if box_contains(b, p) {
                out.push(i as usize);
            }
        }
        out.sort_unstable();
    }
}

/// Build the arrangement of `input` on triangle `tri`. Primitives must
/// already be clipped to the triangle (tri_tri output is), with rational
/// coordinates on its plane.
///
/// Returns `None` only when `token` is cancelled: a single segment-heavy
/// triangle can spend minutes in the quadratic sweeps below, so the
/// per-phase checks in build_graph alone leave a cancel unanswered for
/// however long the worst triangle takes.
pub fn build(
    tri: [Vec3; 3],
    input: &ArrangementInput,
    token: Option<&crate::cancel::CancelToken>,
) -> Option<Arrangement> {
    use std::sync::atomic::Ordering::Relaxed;
    let t0 = crate::timing::Stopwatch::start();
    stats::CALLS.fetch_add(1, Relaxed);
    stats::SEGS.fetch_add(input.segments.len() as u64, Relaxed);
    stats::PTS.fetch_add(input.points.len() as u64, Relaxed);
    let corners: [R3; 3] = [
        R3::from_vec3(tri[0]),
        R3::from_vec3(tri[1]),
        R3::from_vec3(tri[2]),
    ];
    let normal = tri_normal_r(&corners[0], &corners[1], &corners[2]);
    debug_assert!(!normal.is_zero(), "degenerate triangle in arrangement");
    let axis = dominant_axis(&normal);
    stats::NORM_NS.fetch_add(t0.elapsed_ns(), Relaxed);

    let mut points3: Vec<R3> = Vec::new();
    let mut points2: Vec<R2> = Vec::new();
    // Hash-keyed dedup via R2Key: division-free structural hashing of the
    // canonical rationals (a general rational Hash must tolerate unreduced
    // values, and its cross-multiplication dominated this function). Indices
    // are assigned in insertion order, so output stays deterministic.
    // Fx hashing (unseeded, deterministic): the index is probe-only and never
    // iterated, so only insertion order — which is the caller's order — can
    // reach `points3`/`points2`.
    let mut index: rustc_hash::FxHashMap<R2Key, usize> = rustc_hash::FxHashMap::default();
    let mut add_point = |p3: R3, points3: &mut Vec<R3>, points2: &mut Vec<R2>| -> usize {
        let p2 = p3.project_drop(axis);
        let next = points3.len();
        match index.entry(R2Key(p2.clone())) {
            std::collections::hash_map::Entry::Occupied(e) => *e.get(),
            std::collections::hash_map::Entry::Vacant(e) => {
                e.insert(next);
                points3.push(p3);
                points2.push(p2);
                next
            }
        }
    };

    for c in &corners {
        add_point(c.clone(), &mut points3, &mut points2);
    }
    debug_assert_eq!(points3.len(), 3, "corner points must be distinct");

    // Register primitive endpoints / isolated points.
    struct Seg {
        a: usize,
        b: usize,
        prov: usize,
    }
    let mut segs: Vec<Seg> = Vec::with_capacity(input.segments.len());
    for (a3, b3, prov) in &input.segments {
        debug_assert_ne!(a3, b3, "zero-length segment primitive");
        let a = add_point(a3.clone(), &mut points3, &mut points2);
        let b = add_point(b3.clone(), &mut points3, &mut points2);
        debug_assert_ne!(a, b);
        segs.push(Seg {
            a,
            b,
            prov: *prov,
        });
    }
    for (p3, _prov) in &input.points {
        add_point(p3.clone(), &mut points3, &mut points2);
    }

    stats::SETUP_NS.fetch_add(t0.elapsed_ns(), Relaxed);
    let t0 = crate::timing::Stopwatch::start();

    // Mutual proper crossings between segments become new points. Points are
    // homogenized once (Homog2) for the exact fallback, and approximated
    // once (correctly rounded f64) for the semi-static filters that certify
    // generic-position signs without any Int work.
    let mut homogs: Vec<Homog2> = points2.iter().map(homog2_of).collect();
    // Approximations are taken of the points TRANSLATED by points2[0] (the
    // triangle's first corner, so the origin is a deterministic function of
    // the arrangement's own data), with the subtraction done EXACTLY in
    // rationals and only the result rounded — the same lever robust/cdt.rs
    // applies to its filter inputs, and sound here for the same two reasons:
    //
    //  (a) Predicates. Every filtered call below is orient2d_a, whose sign is
    //      translation invariant, with the exact fallback (orient2d_h) still
    //      running on the UNTRANSLATED homogenized rationals. A sign certified
    //      for the translated configuration is therefore the sign of the
    //      original one, while the filter's error bound — which is built from
    //      the coordinate magnitudes |a|+|b|+|c|, not from the determinant —
    //      shrinks from "distance to the world origin" to "extent of this one
    //      triangle". Far-from-origin arrangements stop escalating on every
    //      call.
    //
    //  (b) Box tests. `approx_box`/`boxes_overlap`/`box_contains` are NOT
    //      translation invariant: translating changes the rounding, so the
    //      sweep and the point-index query may admit a DIFFERENT superset of
    //      candidates. That is sound here because both prefilters remain
    //      conservative about the translated exact points (the pad is ~4.5 ulp
    //      of the translated magnitude, and rounding error is ≤ 0.5 ulp of it),
    //      and because every admitted candidate is then fully decided by exact
    //      predicates: a spurious pair fails the strict-crossing test and
    //      constructs nothing, a spurious point fails orient2d_h/the exact
    //      range test and never enters `on_seg`. Enumeration order is unchanged
    //      too: pairs still arrive in (i, ascending j) order, so the surviving
    //      true crossings are constructed in the same sequence regardless of
    //      which spurious pairs sit between them, and `on_seg` is ordered by an
    //      exact rational parameter comparison over a set of distinct points,
    //      which is independent of insertion order. Nothing that DEFINES output
    //      order — point insertion indices, the constraints BTreeMap keys, the
    //      `flipped` rational sign, or cdt::triangulate's untranslated `points2`
    //      input — reads `apts` at all.
    //
    // The translation is computed from the homogeneous coordinates
    // (`translated_approx`), which is the same exact value an R2 subtraction
    // would produce but skips the gcd that constructing the difference as a
    // canonical Rational costs — on million-point arrangements that gcd cost
    // more than the escalations the lever saves.
    let mut apts: Vec<[f64; 2]> = Vec::with_capacity(points2.len());
    // Per-point "this f64 pair is EXACTLY the translated point", the
    // precondition of cdt's tight exact-input filters. Handed to the CDT below
    // so it does not repeat the translation.
    let mut apts_exact: Vec<bool> = Vec::with_capacity(points2.len());
    // A monster arrangement translates over a million points here, each one a
    // pair of exact big-integer divisions, so this loop is long enough that a
    // cancel arriving inside it must not wait it out. Strictly an early
    // return: a run that completes builds the identical vectors.
    for i in 0..points2.len() {
        if i % 1024 == 0 && crate::cancel::is_cancelled(token) {
            return None;
        }
        let (a, e) = translated_approx(&points2[0], &points2[i]);
        apts.push(a);
        apts_exact.push(e);
    }
    let o2 = |apts: &[[f64; 2]], homogs: &[Homog2], i: usize, j: usize, k: usize| -> Sign {
        orient2d_a(apts[i], apts[j], apts[k])
            .unwrap_or_else(|| orient2d_h(&homogs[i], &homogs[j], &homogs[k]))
    };
    let seg_boxes: Vec<[f64; 4]> = segs
        .iter()
        .map(|s| approx_box(&[apts[s.a], apts[s.b]]))
        .collect();
    // A strict crossing lies in both exact boxes, which sit inside these
    // inflated ones, so the box prefilter is conservative; the sweep emits
    // the surviving pairs in the same (i, ascending j) order the old nested
    // loops used, keeping point construction order identical.
    let pairs = overlapping_box_pairs(&seg_boxes, token)?;
    for (k, (i, j)) in pairs.iter().enumerate() {
        if k % 1024 == 0 && crate::cancel::is_cancelled(token) {
            return None;
        }
        let (ia, ib) = (segs[i].a, segs[i].b);
        let (ic, id) = (segs[j].a, segs[j].b);
        let sc = o2(&apts, &homogs, ia, ib, ic);
        let sd = o2(&apts, &homogs, ia, ib, id);
        let sa = o2(&apts, &homogs, ic, id, ia);
        let sb = o2(&apts, &homogs, ic, id, ib);
        // Strict crossing only — endpoint contacts and collinear overlap
        // are handled by the point-on-segment sweep below.
        if sc != Sign::Zero && sd != Sign::Zero && sc != sd
            && sa != Sign::Zero && sb != Sign::Zero && sa != sb
        {
            let x2 = line_line_intersect_2d(
                &points2[segs[i].a],
                &points2[segs[i].b],
                &points2[segs[j].a],
                &points2[segs[j].b],
            )
            .expect("properly crossing segments are not parallel");
            let x3 = lift_to_plane(&x2, axis, &corners[0], &normal);
            add_point(x3, &mut points3, &mut points2);
        }
    }
    // Points added by crossings need homogs and approximations too.
    for p in points2.iter().skip(homogs.len()) {
        homogs.push(homog2_of(p));
    }
    for i in apts.len()..points2.len() {
        if i % 1024 == 0 && crate::cancel::is_cancelled(token) {
            return None;
        }
        let (a, e) = translated_approx(&points2[0], &points2[i]);
        apts.push(a);
        apts_exact.push(e);
    }

    debug_assert!(points2.iter().all(|p| {
        point_in_tri_2d(p, &points2[0], &points2[1], &points2[2]) != TriLoc::Outside
    }), "arrangement primitive escapes its triangle");

    stats::CROSS_NS.fetch_add(t0.elapsed_ns(), Relaxed);
    let t0 = crate::timing::Stopwatch::start();

    // Subdivide each segment at every registered point lying exactly on it;
    // consecutive point pairs become constraint edges carrying provenance.
    let mut constraints: BTreeMap<(usize, usize), Vec<usize>> = BTreeMap::new();
    let pindex = PointIndex::build(&apts);
    let mut cand: Vec<usize> = Vec::new();
    for (si, seg) in segs.iter().enumerate() {
        if crate::cancel::is_cancelled(token) {
            return None;
        }
        let sbox = seg_boxes[si];
        let (ha, hb) = (&homogs[seg.a], &homogs[seg.b]);
        // Segment direction cleared of denominators: v = (pb−pa)·(Bw·Aw).
        let vx = &hb.0 * &ha.2 - &ha.0 * &hb.2;
        let vy = &hb.1 * &ha.2 - &ha.1 * &hb.2;
        let vv = &vx * &vx + &vy * &vy;
        // Parameters as unreduced fractions: for point P (homog (Px,Py,Pw)),
        // u = (p−pa)·(Pw·Aw) and t ∝ (u·v)/Pw — ordered and range-checked by
        // cross-multiplication with the positive denominators, no canonical
        // rationals anywhere.
        let mut on_seg: Vec<(Int, Int, usize)> = Vec::new();
        // A point on the segment lies in its exact box, so the inflated box
        // test cannot reject a true hit; the range query returns exactly the
        // points that pass it, re-sorted into the ascending index order the
        // old full rescan visited.
        pindex.query(&apts, &sbox, &mut cand);
        for &idx in &cand {
            let hp = &homogs[idx];
            // Approx filter next: almost every remaining point is certifiably
            // off the segment's line; only near-collinear candidates pay for
            // Int.
            match orient2d_a(apts[seg.a], apts[seg.b], apts[idx]) {
                Some(_) => continue, // certified nonzero → not collinear
                None => {}
            }
            if orient2d_h(ha, hb, hp) != Sign::Zero {
                continue;
            }
            let ux = &hp.0 * &ha.2 - &ha.0 * &hp.2;
            let uy = &hp.1 * &ha.2 - &ha.1 * &hp.2;
            let uv = &ux * &vx + &uy * &vy;
            // 0 ≤ t  ⇔  0 ≤ u·v;   t ≤ |dir|²  ⇔  (u·v)·Bw ≤ (v·v)·Pw.
            if !uv.is_negative() && &uv * &hb.2 <= &vv * &hp.2 {
                on_seg.push((uv, hp.2.clone(), idx));
            }
        }
        // t_i < t_j  ⇔  uv_i·Pw_j < uv_j·Pw_i (denominators positive).
        on_seg.sort_by(|a, b| (&a.0 * &b.1).cmp(&(&b.0 * &a.1)));
        debug_assert!(on_seg.len() >= 2, "segment lost its own endpoints");
        for w in on_seg.windows(2) {
            let (u, v) = (w[0].2, w[1].2);
            debug_assert_ne!(u, v, "duplicate points on segment");
            let key = (u.min(v), u.max(v));
            let provs = constraints.entry(key).or_default();
            if !provs.contains(&seg.prov) {
                provs.push(seg.prov);
            }
        }
    }

    stats::ONSEG_NS.fetch_add(t0.elapsed_ns(), Relaxed);
    let t0 = crate::timing::Stopwatch::start();

    let constraint_pairs: Vec<(usize, usize)> = constraints.keys().copied().collect();
    // The CDT translates by points2[0] for its own filters, which is exactly
    // what `apts`/`apts_exact` already hold — hand them over rather than let it
    // redo one exact subtraction per point. The token rides along on the same
    // call: a monster triangulation must stay interruptible.
    let tris =
        cdt::triangulate_with_apts(&points2, &constraint_pairs, apts, apts_exact, token)?;
    stats::CDT_NS.fetch_add(t0.elapsed_ns(), Relaxed);

    let axis_comp = match axis {
        0 => &normal.x,
        1 => &normal.y,
        _ => &normal.z,
    };
    let flipped = Sign::of_rat(axis_comp) == Sign::Neg;

    Some(Arrangement {
        axis,
        points3,
        points2,
        tris,
        constraints,
        flipped,
    })
}

/// The exact points this input would register on `tri`, without running the
/// CDT: primitive endpoints, isolated points, and pairwise proper segment
/// crossings. robust/intersection_graph.rs uses this to build the global
/// registries that force a common subdivision on both sides of every shared
/// intersection segment and mesh edge before the real arrangements run.
/// Returns `None` only when `token` is cancelled (see [`build`]).
pub fn candidate_points(
    tri: [Vec3; 3],
    input: &ArrangementInput,
    token: Option<&crate::cancel::CancelToken>,
) -> Option<Vec<R3>> {
    let corners: [R3; 3] = [
        R3::from_vec3(tri[0]),
        R3::from_vec3(tri[1]),
        R3::from_vec3(tri[2]),
    ];
    let normal = tri_normal_r(&corners[0], &corners[1], &corners[2]);
    let axis = dominant_axis(&normal);

    let mut out: Vec<R3> = Vec::new();
    // Membership-only set with division-free R2Key hashing; `out` keeps
    // insertion order so determinism is unaffected (the set itself is never
    // iterated, which is why the Fx hasher is safe here).
    let mut seen: rustc_hash::FxHashSet<R2Key> = rustc_hash::FxHashSet::default();
    let add = |p3: R3, out: &mut Vec<R3>, seen: &mut rustc_hash::FxHashSet<R2Key>| {
        if seen.insert(R2Key(p3.project_drop(axis))) {
            out.push(p3);
        }
    };
    for (p, _) in &input.points {
        add(p.clone(), &mut out, &mut seen);
    }
    for (a, b, _) in &input.segments {
        add(a.clone(), &mut out, &mut seen);
        add(b.clone(), &mut out, &mut seen);
    }
    // Same filtered predicate stack as build(): correctly rounded f64
    // approximations certify almost every non-crossing pair, homogenized
    // exact signs only on near-degeneracies — the all-rational version made
    // this sweep a dominant pipeline stage on segment-heavy meshes.
    let segs2: Vec<(R2, R2)> = input
        .segments
        .iter()
        .map(|(a, b, _)| (a.project_drop(axis), b.project_drop(axis)))
        .collect();
    let homogs: Vec<(Homog2, Homog2)> = segs2
        .iter()
        .map(|(a, b)| (homog2_of(a), homog2_of(b)))
        .collect();
    // Same translated-filter-input lever as `build`, with the same origin
    // (the triangle's first corner, projected) and the same soundness
    // argument: orient2d_a's certified sign is translation invariant and its
    // exact fallback still runs on the untranslated homogs, while the box
    // sweep stays conservative about the translated points and only ever
    // proposes candidates that the exact strict-crossing test then decides.
    // `out` is keyed and ordered by untranslated rationals, so the set and
    // sequence of registered points are unchanged.
    // No CDT runs on this path, so only the filter inputs are needed — no
    // exactness flags.
    let origin = corners[0].project_drop(axis);
    let apts: Vec<([f64; 2], [f64; 2])> = segs2
        .iter()
        .map(|(a, b)| {
            (
                translated_approx(&origin, a).0,
                translated_approx(&origin, b).0,
            )
        })
        .collect();
    let o2 = |a: ([f64; 2], &Homog2), b: ([f64; 2], &Homog2), c: ([f64; 2], &Homog2)| -> Sign {
        orient2d_a(a.0, b.0, c.0).unwrap_or_else(|| orient2d_h(a.1, b.1, c.1))
    };
    let seg_boxes: Vec<[f64; 4]> = apts
        .iter()
        .map(|(a, b)| approx_box(&[*a, *b]))
        .collect();
    // Same order-restoring sweep as build(): pairs come back in (i, ascending
    // j) order, so `out` receives the same crossings in the same sequence.
    let pairs = overlapping_box_pairs(&seg_boxes, token)?;
    for (k, (i, j)) in pairs.iter().enumerate() {
        if k % 1024 == 0 && crate::cancel::is_cancelled(token) {
            return None;
        }
        let (a, b) = (
            (apts[i].0, &homogs[i].0),
            (apts[i].1, &homogs[i].1),
        );
        let (c, d) = (
            (apts[j].0, &homogs[j].0),
            (apts[j].1, &homogs[j].1),
        );
        let sc = o2(a, b, c);
        let sd = o2(a, b, d);
        let sa = o2(c, d, a);
        let sb = o2(c, d, b);
        if sc != Sign::Zero && sd != Sign::Zero && sc != sd
            && sa != Sign::Zero && sb != Sign::Zero && sa != sb
        {
            let x2 = line_line_intersect_2d(&segs2[i].0, &segs2[i].1, &segs2[j].0, &segs2[j].1)
                .expect("properly crossing segments are not parallel");
            add(
                lift_to_plane(&x2, axis, &corners[0], &normal),
                &mut out,
                &mut seen,
            );
        }
    }
    Some(out)
}

#[cfg(test)]
#[path = "arrangement_tests.rs"]
mod tests;
