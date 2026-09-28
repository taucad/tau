// Unit tests for robust/pairing.rs — the geometric half-edge pairing of the
// extracted boundary, exercised in isolation on hand-built closed meshes
// whose correct answer is known by construction.
//
// The load-bearing cases are: two solids meeting along one edge (the k = 2
// fan the arrangement produces at a pinch, where the pairing must keep each
// solid's own two faces together), the k = 3 generalization, the rejection
// paths, and — the guarantee every clean mesh depends on — that an ordinary
// closed mesh is left entirely alone.

use std::collections::HashSet;

use crate::linalg::Vec3;
use crate::robust::cells::VertTables;
use crate::robust::exact::rational::R3;

use super::plan_vertex_splits;

/// Deduplicating vertex table, mirroring the graph's interned ids: two
/// solids that touch share the id of every point they share.
#[derive(Default)]
struct Verts {
    pts: Vec<Vec3>,
}

impl Verts {
    fn id(&mut self, x: f64, y: f64, z: f64) -> u32 {
        let p = Vec3::new(x, y, z);
        if let Some(i) = self.pts.iter().position(|q| *q == p) {
            return i as u32;
        }
        self.pts.push(p);
        (self.pts.len() - 1) as u32
    }

    fn tables(&self) -> (Vec<R3>, Vec<Vec3>) {
        (
            self.pts.iter().map(|p| R3::from_vec3(*p)).collect(),
            self.pts.clone(),
        )
    }
}

/// The 12 outward-wound triangles of an axis-aligned box.
fn box_tris(v: &mut Verts, lo: [f64; 3], hi: [f64; 3]) -> Vec<[u32; 3]> {
    let c = [
        v.id(lo[0], lo[1], lo[2]),
        v.id(hi[0], lo[1], lo[2]),
        v.id(hi[0], hi[1], lo[2]),
        v.id(lo[0], hi[1], lo[2]),
        v.id(lo[0], lo[1], hi[2]),
        v.id(hi[0], lo[1], hi[2]),
        v.id(hi[0], hi[1], hi[2]),
        v.id(lo[0], hi[1], hi[2]),
    ];
    [
        [0, 3, 2],
        [0, 2, 1], // -z
        [4, 5, 6],
        [4, 6, 7], // +z
        [0, 1, 5],
        [0, 5, 4], // -y
        [1, 2, 6],
        [1, 6, 5], // +x
        [2, 3, 7],
        [2, 7, 6], // +y
        [3, 0, 4],
        [3, 4, 7], // -x
    ]
    .iter()
    .map(|t| [c[t[0]], c[t[1]], c[t[2]]])
    .collect()
}

/// The 8 outward-wound triangles of a triangular prism whose cross-section
/// is the wedge from angle `a` to angle `b` (degrees, `b - a < 180`) of the
/// unit circle, extruded along z from 0 to 1. Its apex edge is the z axis,
/// so several of these share that edge.
fn wedge_tris(v: &mut Verts, a: f64, b: f64) -> Vec<[u32; 3]> {
    let pt = |deg: f64, z: f64| {
        let r = deg.to_radians();
        (r.cos(), r.sin(), z)
    };
    let mut ring = |z: f64| {
        let (ax, ay, _) = (0.0, 0.0, z);
        let (px, py, _) = pt(a, z);
        let (qx, qy, _) = pt(b, z);
        [v.id(ax, ay, z), v.id(px, py, z), v.id(qx, qy, z)]
    };
    let bot = ring(0.0);
    let top = ring(1.0);
    let mut tris = vec![
        [bot[0], bot[2], bot[1]], // -z cap (reversed cross-section)
        [top[0], top[1], top[2]], // +z cap
    ];
    for i in 0..3 {
        let j = (i + 1) % 3;
        tris.push([bot[i], bot[j], top[j]]);
        tris.push([bot[i], top[j], top[i]]);
    }
    tris
}

fn plan(tris: &[[u32; 3]], v: &Verts) -> Option<Vec<u32>> {
    let (verts, verts_f64) = v.tables();
    plan_vertex_splits(
        tris,
        VertTables {
            verts: &verts,
            verts_f64: &verts_f64,
        },
    )
}

/// The distinct fan copies assigned to `vid`'s corners among `group`'s
/// triangles.
fn copies_at(
    tris: &[[u32; 3]],
    plan: &[u32],
    vid: u32,
    group: impl Fn(usize) -> bool,
) -> HashSet<u32> {
    let mut out = HashSet::new();
    for (t, tri) in tris.iter().enumerate() {
        if !group(t) {
            continue;
        }
        for c in 0..3 {
            if tri[c] == vid {
                out.insert(plan[3 * t + c]);
            }
        }
    }
    out
}

/// An ordinary closed mesh must not be touched at all: every undirected
/// edge already has exactly two half-edges, so the import's own pairing is
/// already the geometric one and assembly has to stay byte-identical.
#[test]
fn ordinary_closed_mesh_needs_no_split() {
    let mut v = Verts::default();
    let tris = box_tris(&mut v, [0.0; 3], [1.0; 3]);
    assert_eq!(plan(&tris, &v), None);
}

/// Two cubes meeting along one edge: that edge carries four half-edges, and
/// the pairing must join each cube's *own* two faces (across the material
/// wedge), not one cube's face to the other's. The split then gives each
/// cube its own copy of the two shared vertices.
#[test]
fn two_cubes_sharing_an_edge_pair_within_each_cube() {
    let mut v = Verts::default();
    let mut tris = box_tris(&mut v, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]);
    let n_a = tris.len();
    tris.extend(box_tris(&mut v, [-1.0, -1.0, 0.0], [0.0, 0.0, 1.0]));
    let (lo, hi) = (v.id(0.0, 0.0, 0.0), v.id(0.0, 0.0, 1.0));

    let plan = plan(&tris, &v).expect("four half-edges on the shared edge");
    for shared in [lo, hi] {
        let a = copies_at(&tris, &plan, shared, |t| t < n_a);
        let b = copies_at(&tris, &plan, shared, |t| t >= n_a);
        assert_eq!(a.len(), 1, "cube A's corners at {shared} must be one fan");
        assert_eq!(b.len(), 1, "cube B's corners at {shared} must be one fan");
        assert!(a != b, "the two cubes must not share a copy of {shared}");
    }
    // Only the two shared vertices split; everything else keeps copy 0.
    for (t, tri) in tris.iter().enumerate() {
        for c in 0..3 {
            if tri[c] != lo && tri[c] != hi {
                assert_eq!(plan[3 * t + c], 0, "unpinched vertex {} split", tri[c]);
            }
        }
    }
}

/// The k = 3 generalization: three wedges around one edge, six half-edges,
/// three material wedges. Each wedge's two faces must stay paired together.
#[test]
fn three_wedges_around_an_edge_pair_within_each_wedge() {
    let mut v = Verts::default();
    let mut tris = Vec::new();
    let mut spans = Vec::new();
    for (a, b) in [(0.0, 60.0), (120.0, 180.0), (240.0, 300.0)] {
        let start = tris.len();
        tris.extend(wedge_tris(&mut v, a, b));
        spans.push(start..tris.len());
    }
    let (lo, hi) = (v.id(0.0, 0.0, 0.0), v.id(0.0, 0.0, 1.0));

    let plan = plan(&tris, &v).expect("six half-edges on the axis edge");
    for axis in [lo, hi] {
        let mut seen = HashSet::new();
        for span in &spans {
            let c = copies_at(&tris, &plan, axis, |t| span.contains(&t));
            assert_eq!(c.len(), 1, "a wedge's corners at {axis} must be one fan");
            seen.extend(c);
        }
        assert_eq!(seen.len(), 3, "each wedge needs its own copy of {axis}");
    }
}

/// A surface where the traversals around a fan do not alternate is not a
/// consistently oriented boundary, so no wedge pairing exists: reversing
/// one cube's winding leaves every other edge well formed but breaks the
/// alternation on the shared edge.
#[test]
fn non_alternating_fan_is_rejected() {
    let mut v = Verts::default();
    let mut tris = box_tris(&mut v, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]);
    for t in box_tris(&mut v, [-1.0, -1.0, 0.0], [0.0, 0.0, 1.0]) {
        tris.push([t[0], t[2], t[1]]);
    }
    assert_eq!(plan(&tris, &v), None);
}

/// An odd number of half-edges on an edge cannot be a closed surface.
#[test]
fn odd_fan_is_rejected() {
    let mut v = Verts::default();
    let mut tris = box_tris(&mut v, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]);
    tris.extend(box_tris(&mut v, [-1.0, -1.0, 0.0], [0.0, 0.0, 1.0]));
    let (lo, hi) = (v.id(0.0, 0.0, 0.0), v.id(0.0, 0.0, 1.0));
    let loose = v.id(2.0, 2.0, 2.0);
    tris.push([lo, hi, loose]);
    assert_eq!(plan(&tris, &v), None);
}
