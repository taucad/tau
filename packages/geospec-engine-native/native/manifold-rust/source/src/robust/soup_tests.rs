// robust/soup_tests.rs — Tests for the robust (triangle-soup) import path:
// manifold input matches the strict import, non-manifold-but-closed input is
// retained as a soup, open/imbalanced input is rejected with NotClosed, the
// strict path is unchanged, and every public Manifold operation either works
// or degrades gracefully (no panics) on a soup — the "all-ops checklist".

use crate::linalg::Vec3;
use crate::manifold::Manifold;
use crate::types::{Error, MeshGL, OpType};

fn v(x: f64, y: f64, z: f64) -> Vec3 {
    Vec3::new(x, y, z)
}

/// Cube [lo,hi]³ as 12 outward triangles.
fn cube_tris(lo: [f64; 3], hi: [f64; 3]) -> Vec<[Vec3; 3]> {
    let (x0, y0, z0) = (lo[0], lo[1], lo[2]);
    let (x1, y1, z1) = (hi[0], hi[1], hi[2]);
    let quads = [
        [v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), v(x1, y0, z0)],
        [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)],
        [v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1)],
        [v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0)],
        [v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)],
        [v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1)],
    ];
    let mut out = Vec::new();
    for q in quads {
        out.push([q[0], q[1], q[2]]);
        out.push([q[0], q[2], q[3]]);
    }
    out
}

/// Fully disconnected triangle-soup MeshGL (3 duplicated verts per tri) —
/// guaranteed to fail strict halfedge pairing while staying geometrically
/// identical to the source.
fn soup_mesh_gl(tris: &[[Vec3; 3]]) -> MeshGL {
    let mut mesh = MeshGL::default();
    mesh.num_prop = 3;
    for t in tris {
        for p in t {
            mesh.vert_properties
                .extend([p.x as f32, p.y as f32, p.z as f32]);
        }
    }
    mesh.tri_verts = (0..3 * tris.len() as u32).collect();
    mesh
}

fn soup_cube() -> Manifold {
    Manifold::from_mesh_gl_robust(&soup_mesh_gl(&cube_tris([0.0; 3], [2.0; 3])))
}

#[test]
fn robust_import_of_manifold_mesh_matches_strict() {
    let strict = Manifold::cube(v(2.0, 2.0, 2.0), false);
    let gl = strict.get_mesh_gl(-1);
    let a = Manifold::from_mesh_gl(&gl);
    let b = Manifold::from_mesh_gl_robust(&gl);
    assert_eq!(a.status(), Error::NoError);
    assert_eq!(b.status(), Error::NoError);
    assert_eq!(a.num_vert(), b.num_vert());
    assert_eq!(a.num_tri(), b.num_tri());
    assert_eq!(a.volume(), b.volume());
    assert!(!b.as_impl().is_soup, "manifold input must not become a soup");
}

#[test]
fn duplicated_vert_soup_is_retained() {
    let m = soup_cube();
    assert_eq!(m.status(), Error::NoError);
    assert!(m.as_impl().is_soup);
    assert_eq!(m.num_tri(), 12);
    // Volume/area work from triangles alone.
    assert_eq!(m.volume(), 8.0);
    assert_eq!(m.surface_area(), 24.0);
    // Strict import of the same mesh still refuses.
    let strict = Manifold::from_mesh_gl(&soup_mesh_gl(&cube_tris([0.0; 3], [2.0; 3])));
    assert_eq!(strict.status(), Error::NotManifold);
    assert!(strict.is_empty());
}

#[test]
fn edge_sharing_cubes_import_as_soup() {
    // Two cubes sharing exactly one edge — a genuinely non-manifold closed
    // solid no strict import can represent.
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    tris.extend(cube_tris([2.0, 2.0, 0.0], [4.0, 4.0, 2.0]));
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert_eq!(m.status(), Error::NoError);
    assert!(m.as_impl().is_soup);
    assert_eq!(m.num_tri(), 24);
    assert_eq!(m.volume(), 16.0);
}

#[test]
fn internal_void_imports_as_soup() {
    let mut tris = cube_tris([0.0; 3], [6.0; 3]);
    // Inner cube flipped inward = void.
    tris.extend(
        cube_tris([2.0; 3], [4.0; 3])
            .iter()
            .map(|t| [t[0], t[2], t[1]]),
    );
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert_eq!(m.status(), Error::NoError);
    assert_eq!(m.volume(), 6.0 * 6.0 * 6.0 - 8.0);
}

#[test]
fn open_mesh_is_rejected_not_closed() {
    // Cube missing one triangle → open.
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    tris.pop();
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert_eq!(m.status(), Error::NotClosed);
    assert!(m.is_empty());
}

#[test]
fn unbalanced_orientation_is_rejected_not_closed() {
    // Cube with one triangle flipped → directed edges unbalanced.
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    let t = tris[0];
    tris[0] = [t[0], t[2], t[1]];
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert_eq!(m.status(), Error::NotClosed);
}

#[test]
fn degenerate_triangles_are_dropped_on_soup_import() {
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    // Add an exactly-degenerate triangle (collinear); must be ignored.
    tris.push([v(5.0, 5.0, 5.0), v(6.0, 6.0, 6.0), v(7.0, 7.0, 7.0)]);
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert_eq!(m.status(), Error::NoError);
    assert_eq!(m.num_tri(), 12);
    assert_eq!(m.volume(), 8.0);
}

#[test]
fn tiny_or_empty_meshes() {
    let empty = MeshGL::default();
    assert_eq!(Manifold::from_mesh_gl_robust(&empty).status(), Error::NoError);
    let two_tris = soup_mesh_gl(&cube_tris([0.0; 3], [1.0; 3])[..2].to_vec());
    assert_eq!(
        Manifold::from_mesh_gl_robust(&two_tris).status(),
        Error::NotClosed
    );
}

// ---------------------------------------------------------------------------
// Geometric self-intersection detection (drives Auto engine dispatch)
// ---------------------------------------------------------------------------

#[test]
fn clean_shapes_have_no_self_intersections() {
    // A strict cube: every same-mesh triangle contact is an ordinary shared
    // edge or shared vertex, which must not count as a self-intersection.
    let cube = Manifold::cube(v(2.0, 2.0, 2.0), false);
    assert!(!cube.has_self_intersections());
    // A denser mesh with fans of coplanar and non-coplanar neighbors.
    let sphere = Manifold::sphere(1.0, 16);
    assert!(!sphere.has_self_intersections());
    // Same geometry imported as an unpaired soup: detection works off
    // positions, not halfedge pairing, so the answer is unchanged.
    assert!(!soup_cube().has_self_intersections());
}

#[test]
fn overlapping_shells_are_self_intersecting() {
    // Two cubes whose interiors overlap, concatenated into one closed soup:
    // triangles of the second shell cross faces of the first.
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    tris.extend(cube_tris([1.0; 3], [3.0; 3]));
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert_eq!(m.status(), Error::NoError);
    assert!(m.has_self_intersections());
    // Repeat queries hit the cache and stay consistent.
    assert!(m.has_self_intersections());
}

#[test]
fn edge_only_contacts_are_not_self_intersections() {
    // Two cubes sharing exactly one edge: non-manifold connectivity, but the
    // only same-mesh contacts are that shared edge and ordinary adjacency —
    // no geometric self-intersection.
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    tris.extend(cube_tris([2.0, 2.0, 0.0], [4.0, 4.0, 2.0]));
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert_eq!(m.status(), Error::NoError);
    assert!(!m.has_self_intersections());
}

#[test]
fn coincident_sheets_count_as_self_intersecting() {
    // Doubled surface: every triangle has an exact duplicate. The robust
    // engine needs no cut there (both copies emit the same pieces and the
    // winding arithmetic resolves them), but the surface is coincident, and
    // that is exactly what the exact engine mis-integrates — so the dispatch
    // detector must report it.
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    let doubled = tris.clone();
    tris.extend(doubled.iter().map(|t| [t[0], t[2], t[1]]));
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert_eq!(m.status(), Error::NoError);
    assert!(m.has_self_intersections());
}

#[test]
fn self_intersection_is_recomputed_after_transform() {
    // The verdict is deliberately not carried across a transform (rounded
    // positions can create coincidences the source lacked), so each result
    // is a fresh scan — and each must still be right.
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    tris.extend(cube_tris([1.0; 3], [3.0; 3]));
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert!(m.has_self_intersections());
    assert!(m
        .translate(v(3.0, -1.0, 0.5))
        .scale(v(2.0, 2.0, 2.0))
        .has_self_intersections());
    let clean = Manifold::cube(v(2.0, 2.0, 2.0), false);
    assert!(!clean.has_self_intersections());
    assert!(!clean.rotate(10.0, 20.0, 30.0).has_self_intersections());
}

#[test]
fn warp_invalidates_the_cached_verdict() {
    // Settle a `false` verdict, then fold the cube onto itself: the warped
    // copy must be scanned afresh, not inherit the clone's answer.
    let cube = Manifold::cube(v(2.0, 2.0, 2.0), false);
    assert!(!cube.has_self_intersections());
    // Mirror the top half down through the bottom half — every triangle
    // above z = 1 crosses the material below it.
    let folded = cube.warp(|p| {
        if p.z > 1.0 {
            p.z = 2.0 - p.z;
        }
    });
    assert!(folded.has_self_intersections(), "warp must re-run the scan");
    // simplify() also clones-then-mutates; its verdict must be re-derived.
    assert!(!cube.simplify(0.0).has_self_intersections());
}

#[test]
fn non_finite_positions_report_self_intersecting_without_panicking() {
    // A warp to NaN survives every import check but has no exact rational
    // form, so the detector cannot evaluate it. "Self-intersecting" is the
    // safe answer (route to the robust engine) and, above all, not a panic.
    let cube = Manifold::cube(v(2.0, 2.0, 2.0), false);
    let nan_y = cube.warp(|p| {
        if p.y > 1.0 {
            p.y = f64::NAN;
        }
    });
    assert!(!nan_y.is_empty(), "NaN survives the warp pipeline");
    assert!(nan_y.has_self_intersections());
    // Infinities are a different story: the bbox becomes non-finite and the
    // warp pipeline empties the mesh, so the detector never sees them.
    let inf_x = cube.warp(|p| {
        if p.x > 1.0 {
            p.x = f64::INFINITY;
        }
    });
    assert!(inf_x.is_empty());
    assert!(!inf_x.has_self_intersections());
}

#[test]
fn same_winding_duplicates_cannot_reach_the_detector() {
    // The detector's duplicate-triangle test is winding-agnostic (it
    // compares vertex sets), so a same-winding duplicate would report true
    // exactly like the reversed one in the test above. It cannot arise from
    // any import, though: duplicating a triangle without flipping it leaves
    // its three directed edges doubled in the same direction, which is
    // precisely what soupify's closed-and-orientable check rejects.
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    let dup = tris[0];
    tris.push(dup);
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert_eq!(m.status(), Error::NotClosed);
}

#[test]
fn half_offset_face_contact_reports_self_intersecting() {
    // Pin test for the boundary case: two shells whose touching faces
    // overlap in a rectangle (positive area) but do not coincide. That is a
    // coplanar overlap, so the detector reports true — the same verdict it
    // gives fully coincident sheets, and for the same reason (the exact
    // engine cannot integrate shared surface). Contrast with the
    // edge-and-vertex-only contacts above, which report false.
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    tris.extend(cube_tris([1.0, 0.0, 2.0], [3.0, 2.0, 4.0]));
    let m = Manifold::from_mesh_gl_robust(&soup_mesh_gl(&tris));
    assert_eq!(m.status(), Error::NoError);
    assert!(m.has_self_intersections());
}

#[test]
fn soup_export_round_trips() {
    let m = soup_cube();
    let gl = m.get_mesh_gl(-1);
    assert_eq!(gl.num_tri(), 12);
    let re = Manifold::from_mesh_gl_robust(&gl);
    assert_eq!(re.status(), Error::NoError);
    assert_eq!(re.volume(), 8.0);
    // 64-bit export too.
    let gl64 = m.get_mesh_gl64(-1);
    let re64 = Manifold::from_mesh_gl64_robust(&gl64);
    assert_eq!(re64.status(), Error::NoError);
    assert_eq!(re64.volume(), 8.0);
}

#[test]
fn soup_transforms_work_and_stay_soup() {
    let m = soup_cube();
    let t = m.translate(v(10.0, 0.0, 0.0));
    assert_eq!(t.status(), Error::NoError);
    // Transformed coordinates change the f64 summation order in the volume
    // accumulation — allow last-ulp wobble on all transform volumes.
    assert!((t.volume() - 8.0).abs() < 1e-12);
    assert_eq!(t.bounding_box().min.x, 10.0);
    assert!(t.as_impl().is_soup, "transform must preserve soup-ness");
    let s = m.scale(v(2.0, 1.0, 1.0));
    assert!((s.volume() - 16.0).abs() < 1e-12);
    let r = m.rotate(0.0, 0.0, 90.0);
    assert_eq!(r.status(), Error::NoError);
    let mi = m.mirror(v(1.0, 0.0, 0.0));
    assert_eq!(mi.status(), Error::NoError);
    // Mirrored coordinates change the f64 summation order in the volume
    // accumulation — allow the last-ulp wobble.
    assert!((mi.volume() - 8.0).abs() < 1e-12);
}

/// The all-ops checklist: every pairing-dependent public operation on a soup
/// must return a graceful empty result (status NotManifold), never panic;
/// the always-safe queries must keep working.
#[test]
fn all_ops_checklist_on_soup() {
    let m = soup_cube();
    let other = Manifold::cube(v(1.0, 1.0, 1.0), false);

    // Safe queries.
    assert_eq!(m.status(), Error::NoError);
    assert!(!m.is_empty());
    assert_eq!(m.num_tri(), 12);
    let _ = m.num_vert();
    let _ = m.num_edge();
    let _ = m.bounding_box();
    let _ = m.volume();
    let _ = m.surface_area();
    let _ = m.get_tolerance();
    let _ = m.get_epsilon();
    let _ = m.original_id();
    let _ = m.matches_tri_normals();
    let _ = m.num_degenerate_tris();

    // Hulls work from vertices alone.
    let hull = m.convex_hull();
    assert_eq!(hull.status(), Error::NoError);
    assert_eq!(hull.volume(), 8.0);

    // Exact-engine booleans refuse soups.
    for op in [OpType::Add, OpType::Subtract, OpType::Intersect] {
        let r = m.boolean(&other, op);
        assert_eq!(r.status(), Error::NotManifold, "op {op:?}");
        assert!(r.is_empty());
        let r2 = other.boolean(&m, op);
        assert_eq!(r2.status(), Error::NotManifold);
    }
    assert_eq!(m.union(&other).status(), Error::NotManifold);
    assert_eq!(m.difference(&other).status(), Error::NotManifold);
    assert_eq!(m.intersection(&other).status(), Error::NotManifold);
    assert_eq!(
        Manifold::batch_boolean(&[m.clone(), other.clone()], OpType::Add).status(),
        Error::NotManifold
    );

    // Split family goes through booleans → empty NotManifold results.
    let (a, b) = m.split(&other);
    assert_eq!(a.status(), Error::NotManifold);
    assert_eq!(b.status(), Error::NotManifold);
    let (a, b) = m.split_by_plane(v(0.0, 0.0, 1.0), 1.0);
    assert!(a.is_empty() && b.is_empty());
    assert!(m.trim_by_plane(v(0.0, 0.0, 1.0), 1.0).is_empty());

    // Pairing-dependent unary ops refuse gracefully.
    assert_eq!(m.as_original().status(), Error::NotManifold);
    assert_eq!(m.set_tolerance(0.1).status(), Error::NotManifold);
    assert_eq!(m.simplify(0.1).status(), Error::NotManifold);
    assert_eq!(m.warp(|_| {}).status(), Error::NotManifold);
    assert_eq!(m.warp_batch(|_| {}).status(), Error::NotManifold);
    assert_eq!(m.refine(2).status(), Error::NotManifold);
    assert_eq!(m.refine_to_length(0.5).status(), Error::NotManifold);
    assert_eq!(m.refine_to_tolerance(0.5).status(), Error::NotManifold);
    assert_eq!(m.smooth_out(60.0, 0.0).status(), Error::NotManifold);
    assert_eq!(m.smooth_by_normals(0).status(), Error::NotManifold);
    assert_eq!(m.calculate_normals(0, 60.0).status(), Error::NotManifold);
    assert_eq!(m.calculate_curvature(-1, -1).status(), Error::NotManifold);
    assert_eq!(
        m.set_properties(1, |p, _, _| p[0] = 1.0).status(),
        Error::NotManifold
    );
    let parts = m.decompose();
    assert_eq!(parts.len(), 1);
    assert_eq!(parts[0].status(), Error::NotManifold);
    assert_eq!(m.minkowski_sum(&other).status(), Error::NotManifold);
    assert_eq!(m.minkowski_difference(&other).status(), Error::NotManifold);

    // Cross-section ops return empty sections.
    assert!(m.slice(1.0).is_empty());
    assert!(m.project().is_empty());
}
