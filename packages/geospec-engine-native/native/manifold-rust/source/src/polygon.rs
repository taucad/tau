// Phase 3: Polygon Triangulation — ported from src/polygon.cpp, src/tree2d.h/cpp, src/utils.h
//
// Key algorithm: ear-clipping with 2D KD-tree acceleration, convex fast-path,
// hole key-holing. Must produce identical triangulations to the C++ version.

use std::collections::HashMap;
use crate::linalg::{Vec2, IVec3};
use crate::types::{Halfedge, PolyVert, PolygonsIdx, SimplePolygonIdx, Polygons, Rect};

#[path = "polygon_earclip.rs"]
mod polygon_earclip;
use polygon_earclip::EarClip;

type IVec3Out = IVec3;

const INVALID: usize = usize::MAX;
const K_BEST: f64 = f64::NEG_INFINITY;

// ---------------------------------------------------------------------------
// CCW (from utils.h)
// ---------------------------------------------------------------------------

/// Determines if p0, p1, p2 are wound CCW, CW, or colinear within tolerance.
/// Returns 1 (CCW), -1 (CW), or 0 (colinear within tol).
pub fn ccw(p0: Vec2, p1: Vec2, p2: Vec2, tol: f64) -> i32 {
    let v1 = p1 - p0;
    let v2 = p2 - p0;
    let area = v1.x * v2.y - v1.y * v2.x;
    let base2 = (v1.x * v1.x + v1.y * v1.y).max(v2.x * v2.x + v2.y * v2.y);
    if area * area * 4.0 <= base2 * tol * tol {
        0
    } else if area > 0.0 {
        1
    } else {
        -1
    }
}

#[inline]
fn determinant2x2(a: Vec2, b: Vec2) -> f64 {
    a.x * b.y - a.y * b.x
}

#[inline]
fn safe_normalize_2d(v: Vec2) -> Vec2 {
    let len = (v.x * v.x + v.y * v.y).sqrt();
    if len == 0.0 || !len.is_finite() {
        Vec2::new(0.0, 0.0)
    } else {
        Vec2::new(v.x / len, v.y / len)
    }
}

#[inline]
fn dot2d(a: Vec2, b: Vec2) -> f64 {
    a.x * b.x + a.y * b.y
}

// ---------------------------------------------------------------------------
// 2D KD-tree (from tree2d.h/cpp)
// ---------------------------------------------------------------------------

/// Recursive in-place kd-tree construction on a PolyVert slice.
/// Alternates between sorting by x and y.
fn build_two_d_tree_impl(points: &mut [PolyVert], sort_x: bool) {
    if sort_x {
        points.sort_by(|a, b| a.pos.x.partial_cmp(&b.pos.x).unwrap_or(std::cmp::Ordering::Equal));
    } else {
        points.sort_by(|a, b| a.pos.y.partial_cmp(&b.pos.y).unwrap_or(std::cmp::Ordering::Equal));
    }
    if points.len() < 2 {
        return;
    }
    let mid = points.len() / 2;
    build_two_d_tree_impl(&mut points[..mid], !sort_x);
    build_two_d_tree_impl(&mut points[mid + 1..], !sort_x);
}

fn build_two_d_tree(points: &mut Vec<PolyVert>) {
    if points.len() <= 8 {
        return;
    }
    build_two_d_tree_impl(points.as_mut_slice(), true);
}

/// Query the 2D kd-tree, calling `f` for every point inside rect `r`.
fn query_two_d_tree<F: FnMut(PolyVert)>(points: &[PolyVert], r: Rect, mut f: F) {
    if points.len() <= 8 {
        for p in points {
            if r.contains_point(p.pos) {
                f(*p);
            }
        }
        return;
    }

    // Stack-based traversal
    let mut stack: Vec<(Rect, usize, usize, i32)> = Vec::with_capacity(64); // (current_rect, start, len, level)

    // Initial rect: infinite
    let inf_rect = Rect {
        min: Vec2::new(f64::NEG_INFINITY, f64::NEG_INFINITY),
        max: Vec2::new(f64::INFINITY, f64::INFINITY),
    };
    stack.push((inf_rect, 0, points.len(), 0));

    while let Some((current, start, len, level)) = stack.pop() {
        if len <= 8 {
            for p in &points[start..start + len] {
                if r.contains_point(p.pos) {
                    f(*p);
                }
            }
            continue;
        }

        let mid = len / 2;
        let middle = points[start + mid];

        let mut left = current;
        let mut right = current;
        if level % 2 == 0 {
            left.max.x = middle.pos.x;
            right.min.x = middle.pos.x;
        } else {
            left.max.y = middle.pos.y;
            right.min.y = middle.pos.y;
        }

        if r.contains_point(middle.pos) {
            f(middle);
        }

        if left.does_overlap(&r) {
            stack.push((left, start, mid, level + 1));
        }
        if right.does_overlap(&r) {
            stack.push((right, start + mid + 1, len - mid - 1, level + 1));
        }
    }
}

// ---------------------------------------------------------------------------
// IsConvex fast-path check
// ---------------------------------------------------------------------------

fn is_convex(polys: &PolygonsIdx, epsilon: f64) -> bool {
    for poly in polys {
        if poly.is_empty() {
            continue;
        }
        let first_edge = poly[0].pos - poly[poly.len() - 1].pos;
        let mut last_edge = safe_normalize_2d(first_edge);
        for v in 0..poly.len() {
            let edge = if v + 1 < poly.len() {
                poly[v + 1].pos - poly[v].pos
            } else {
                first_edge
            };
            let det = determinant2x2(last_edge, edge);
            if det <= 0.0 || (det.abs() < epsilon && dot2d(last_edge, edge) < 0.0) {
                return false;
            }
            last_edge = safe_normalize_2d(edge);
        }
    }
    true
}

// ---------------------------------------------------------------------------
// TriangulateConvex — fast alternating triangulation for convex polygons
// ---------------------------------------------------------------------------

fn triangulate_convex(polys: &PolygonsIdx) -> Vec<IVec3Out> {
    let num_tri: usize = polys.iter().map(|p| p.len().saturating_sub(2)).sum();
    let mut triangles = Vec::with_capacity(num_tri);
    for poly in polys {
        let mut i = 0usize;
        let mut k = poly.len().saturating_sub(1);
        let mut right = true;
        while i + 1 < k {
            let j = if right { i + 1 } else { k - 1 };
            triangles.push(IVec3Out::new(poly[i].idx, poly[j].idx, poly[k].idx));
            if right {
                i = j;
            } else {
                k = j;
            }
            right = !right;
        }
    }
    triangles
}

// ---------------------------------------------------------------------------
// HalfedgeTriangulation — triangulation result as paired halfedges
// ---------------------------------------------------------------------------

/// Triangulation result represented directly as halfedges, ported from
/// `HalfedgeTriangulation` in C++ `polygon_internal.h`.
///
/// `halfedges[0..contour_end]` are the *exterior* contour halfedges (the
/// input edges reversed, so their `end_vert` holds the original `idx` of the
/// edge's start point). `halfedges[contour_end..]` hold three halfedges per
/// output triangle. All vertex fields are original `idx` values.
///
/// Pairing happens incrementally with a LIFO multimap keyed on `(start, end)`,
/// so duplicate vertex pairs (from degenerate/overlapping polygons) still pair
/// one-to-one within the triangulation. This is what `Face2Tri` relies on to
/// keep boolean results manifold on exactly-coplanar faces — re-deriving pairs
/// from vertex positions after the fact cannot distinguish duplicates.
pub struct HalfedgeTriangulation {
    pub halfedges: Vec<Halfedge>,
    pub contour_end: usize,
}

impl HalfedgeTriangulation {
    pub fn num_tri(&self) -> usize {
        (self.halfedges.len() - self.contour_end) / 3
    }
}

/// Mirrors `HalfedgeTriangulation::AddHalfedge`: pair against the most
/// recently added unpaired opposite edge, else record as unpaired.
fn add_halfedge(
    halfedges: &mut Vec<Halfedge>,
    edge2halfedge: &mut HashMap<(i32, i32), Vec<i32>>,
    start: i32,
    end: i32,
) {
    let idx = halfedges.len() as i32;
    let mut data = Halfedge {
        start_vert: start,
        end_vert: end,
        paired_halfedge: -1,
        prop_vert: -1,
    };
    if let Some(reverse) = edge2halfedge.get_mut(&(end, start)) {
        if let Some(pair) = reverse.pop() {
            data.paired_halfedge = pair;
            halfedges[pair as usize].paired_halfedge = idx;
            if reverse.is_empty() {
                edge2halfedge.remove(&(end, start));
            }
            halfedges.push(data);
            return;
        }
    }
    edge2halfedge.entry((start, end)).or_default().push(idx);
    halfedges.push(data);
}

/// Triangulates indexed polygons, returning both the triangle halfedges and
/// the contour halfedges with their pairing. Port of C++
/// `TriangulateIdxHalfedges` (polygon.cpp): the C++ triangulators build the
/// `HalfedgeTriangulation` incrementally via `AddTriangle`; here we replay the
/// triangle list (which `triangulate_idx` emits in exactly that call order)
/// through the same `AddHalfedge` sequence, which yields identical pairing.
pub fn triangulate_idx_halfedges(
    polys: &PolygonsIdx,
    epsilon: f64,
    allow_convex: bool,
) -> HalfedgeTriangulation {
    let triangles = triangulate_idx(polys, epsilon, allow_convex);

    let mut result = HalfedgeTriangulation {
        halfedges: Vec::new(),
        contour_end: 0,
    };
    let mut edge2halfedge: HashMap<(i32, i32), Vec<i32>> = HashMap::new();

    // AddContours: store the exterior contour halfedge, opposite the filled
    // contour, so each triangle edge on the boundary pairs against it.
    for poly in polys {
        for i in 0..poly.len() {
            let start = poly[i].idx;
            let end = poly[if i + 1 < poly.len() { i + 1 } else { 0 }].idx;
            add_halfedge(&mut result.halfedges, &mut edge2halfedge, end, start);
        }
    }
    result.contour_end = result.halfedges.len();

    for tri in &triangles {
        add_halfedge(&mut result.halfedges, &mut edge2halfedge, tri.x, tri.y);
        add_halfedge(&mut result.halfedges, &mut edge2halfedge, tri.y, tri.z);
        add_halfedge(&mut result.halfedges, &mut edge2halfedge, tri.z, tri.x);
    }

    // Mirror of C++ Finalize() MANIFOLD_DEBUG checks.
    #[cfg(debug_assertions)]
    {
        debug_assert!(
            edge2halfedge.is_empty(),
            "triangulation has unpaired halfedges"
        );
        for (i, he) in result.halfedges.iter().enumerate() {
            let pair = he.paired_halfedge;
            debug_assert!(
                pair >= 0 && (pair as usize) < result.halfedges.len(),
                "invalid paired halfedge"
            );
            let other = &result.halfedges[pair as usize];
            debug_assert!(
                other.paired_halfedge == i as i32,
                "halfedge pair is not reciprocal"
            );
            debug_assert!(
                he.start_vert == other.end_vert && he.end_vert == other.start_vert,
                "halfedge pair endpoints do not match"
            );
        }
    }

    result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Triangulates indexed polygons. Returns triangle indices referencing original vertex indices.
pub fn triangulate_idx(polys: &PolygonsIdx, epsilon: f64, allow_convex: bool) -> Vec<IVec3Out> {
    if polys.is_empty() || polys.iter().all(|p| p.is_empty()) {
        return Vec::new();
    }
    if allow_convex && is_convex(polys, epsilon) {
        return triangulate_convex(polys);
    }
    let (triangles, _updated_eps) = EarClip::new(polys, epsilon).triangulate();
    triangles
}

/// Triangulates unindexed polygons. Vertices are indexed sequentially across all contours.
pub fn triangulate(polygons: &Polygons, epsilon: f64, allow_convex: bool) -> Vec<IVec3Out> {
    let mut idx = 0i32;
    let mut polygons_indexed: PolygonsIdx = Vec::new();
    for poly in polygons {
        let simple: SimplePolygonIdx = poly
            .iter()
            .map(|&pos| {
                let v = PolyVert { pos, idx };
                idx += 1;
                v
            })
            .collect();
        polygons_indexed.push(simple);
    }
    triangulate_idx(&polygons_indexed, epsilon, allow_convex)
}

#[cfg(test)]
#[path = "polygon_tests.rs"]
mod tests;
