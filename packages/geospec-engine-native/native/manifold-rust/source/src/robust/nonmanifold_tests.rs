// robust/nonmanifold_tests.rs — Phase 8: end-to-end booleans on genuinely
// non-manifold (but closed, orientable) inputs — the configurations the
// exact engine cannot even import. Volumes are verified against hand
// geometry; `Manifold::volume()` is divergence-theorem-based and valid on
// closed orientable soups independent of connectivity.

use crate::linalg::Vec3;
use crate::manifold::Manifold;
use crate::types::{BooleanEngine, Error, MeshGL64, OpType};

fn v(x: f64, y: f64, z: f64) -> Vec3 {
    Vec3::new(x, y, z)
}

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

fn soup_manifold(tris: &[[Vec3; 3]]) -> Manifold {
    let mut mesh = MeshGL64::default();
    mesh.num_prop = 3;
    for t in tris {
        for p in t {
            mesh.vert_properties.extend([p.x, p.y, p.z]);
        }
    }
    mesh.tri_verts = (0..3 * tris.len() as u64).collect();
    let m = Manifold::from_mesh_gl64_robust(&mesh);
    assert_eq!(m.status(), Error::NoError, "soup import failed");
    m
}

fn assert_vol(m: &Manifold, expect: f64, what: &str) {
    assert_eq!(m.status(), Error::NoError, "{what}: status");
    let vol = m.volume();
    assert!(
        (vol - expect).abs() <= 1e-9 * expect.abs().max(1.0),
        "{what}: volume {vol}, expected {expect}"
    );
}

/// Two cubes sharing exactly one edge — the canonical non-manifold solid.
fn edge_kissing_cubes() -> Manifold {
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    tris.extend(cube_tris([2.0, 2.0, 0.0], [4.0, 4.0, 2.0]));
    soup_manifold(&tris)
}

#[test]
fn edge_shared_cubes_union_with_third_solid() {
    let soup = edge_kissing_cubes();
    assert!(soup.as_impl().is_soup);
    // A third box bridging both cubes across the shared edge.
    let bridge = Manifold::cube(v(2.0, 2.0, 1.0), false).translate(v(1.0, 1.0, 0.5));
    let u = soup.boolean_with_engine(&bridge, OpType::Add, BooleanEngine::Auto);
    // Bridge is 2x2x1 = 4; overlap with each cube is 1x1x1 = 1 each.
    assert_vol(&u, 8.0 + 8.0 + 4.0 - 1.0 - 1.0, "edge cubes + bridge union");
}

#[test]
fn edge_shared_cubes_difference() {
    let soup = edge_kissing_cubes();
    let cutter = Manifold::cube(v(1.0, 1.0, 2.0), false).translate(v(1.0, 1.0, 0.0));
    let d = soup.boolean_with_engine(&cutter, OpType::Subtract, BooleanEngine::Auto);
    // Cutter (volume 2) sits fully in the first cube, corner at the shared edge.
    assert_vol(&d, 16.0 - 2.0, "edge cubes - corner cutter");
    // And intersecting returns just the cutter volume.
    let i = soup.boolean_with_engine(&cutter, OpType::Intersect, BooleanEngine::Auto);
    assert_vol(&i, 2.0, "edge cubes ∩ corner cutter");
}

#[test]
fn six_face_edge_fan() {
    // Three quadrant boxes around the z-axis edge: (+x,+y), (-x,+y), (-x,-y)
    // — the shared edge carries 6 faces, all balanced.
    let mut tris = cube_tris([0.0, 0.0, 0.0], [2.0, 2.0, 2.0]);
    tris.extend(cube_tris([-2.0, 0.0, 0.0], [0.0, 2.0, 2.0]));
    tris.extend(cube_tris([-2.0, -2.0, 0.0], [0.0, 0.0, 2.0]));
    let soup = soup_manifold(&tris);
    assert_vol(&soup, 24.0, "six-face fan import");
    // Cut a hole straight through the fan edge region.
    let cutter = Manifold::cylinder(4.0, 0.5, 0.5, 8).translate(v(0.0, 0.0, -1.0));
    let d = soup.boolean_with_engine(&cutter, OpType::Subtract, BooleanEngine::Auto);
    assert_eq!(d.status(), Error::NoError);
    // Cylinder(8 segs, r=0.5) cross-section area A sits 3/4 inside the solid
    // over height 2 → volume 24 - 2*(3/4)*A.
    let octagon_area = {
        // Inscribed octagon of the tessellated cylinder: 8 * (1/2) r² sin(45°)
        8.0 * 0.5 * 0.25 * (std::f64::consts::PI / 4.0).sin()
    };
    let expect = 24.0 - 2.0 * 0.75 * octagon_area;
    let vol = d.volume();
    assert!(
        (vol - expect).abs() < 1e-6,
        "fan - cylinder volume {vol}, expected ~{expect}"
    );
}

#[test]
fn vertex_pinched_cubes() {
    // Two cubes sharing exactly one vertex (pinched surface point).
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    tris.extend(cube_tris([2.0; 3], [4.0; 3]));
    let soup = soup_manifold(&tris);
    assert_vol(&soup, 16.0, "vertex-pinched import");
    let cutter = Manifold::cube(v(1.0, 1.0, 1.0), false).translate(v(0.5, 0.5, 0.5));
    let d = soup.boolean_with_engine(&cutter, OpType::Subtract, BooleanEngine::Auto);
    assert_vol(&d, 15.0, "vertex-pinched - cutter");
}

#[test]
fn internal_void_cut_open() {
    // Solid [0,6]³ with void [2,4]³; a slab cutter [2.5,3.5]×[2.5,3.5]×[-1,7]
    // drills a square channel through solid and void.
    let mut tris = cube_tris([0.0; 3], [6.0; 3]);
    tris.extend(
        cube_tris([2.0; 3], [4.0; 3])
            .iter()
            .map(|t| [t[0], t[2], t[1]]),
    );
    let soup = soup_manifold(&tris);
    assert_vol(&soup, 216.0 - 8.0, "void import");
    let cutter = Manifold::cube(v(1.0, 1.0, 8.0), false).translate(v(2.5, 2.5, -1.0));
    let d = soup.boolean_with_engine(&cutter, OpType::Subtract, BooleanEngine::Auto);
    // Channel removes 1×1×6 of material minus the 1×1×2 already void.
    assert_vol(&d, 208.0 - (6.0 - 2.0), "void - channel");
    // Intersection keeps only the channel material that existed (4 units).
    let i = soup.boolean_with_engine(&cutter, OpType::Intersect, BooleanEngine::Auto);
    assert_vol(&i, 4.0, "void ∩ channel");
}

#[test]
fn multi_component_soup_boolean() {
    // Three disjoint cubes as one soup, cut by a slab crossing all three.
    let mut tris = Vec::new();
    for k in 0..3 {
        let o = 3.0 * k as f64;
        tris.extend(cube_tris([o, 0.0, 0.0], [o + 2.0, 2.0, 2.0]));
    }
    let soup = soup_manifold(&tris);
    assert_vol(&soup, 24.0, "multi-component import");
    let slab = Manifold::cube(v(9.0, 2.0, 1.0), false).translate(v(-0.5, 0.0, 0.5));
    let i = soup.boolean_with_engine(&slab, OpType::Intersect, BooleanEngine::Auto);
    assert_vol(&i, 12.0, "multi-component ∩ slab");
    let d = soup.boolean_with_engine(&slab, OpType::Subtract, BooleanEngine::Auto);
    assert_vol(&d, 12.0, "multi-component - slab");
}

#[test]
fn doubled_cover_operand() {
    // Every facet listed twice with the same winding — a doubled cover, as
    // some Thingi10K scans ship (#92068 triples every facet). The regularized
    // boolean must emit each surface element once: exactly-coincident
    // pieces share one wall in robust/cells.rs, whose winding step is the
    // sum of the stack, and extraction emits a single representative —
    // otherwise the output surface is multiply covered and stops being
    // closed where it meets the other operand.
    let mut tris = cube_tris([0.0; 3], [2.0; 3]);
    tris.extend(cube_tris([0.0; 3], [2.0; 3]));
    let soup = soup_manifold(&tris);
    assert!(soup.as_impl().is_soup);
    // Divergence-theorem volume counts both covers before regularization.
    assert_vol(&soup, 16.0, "doubled cube import");

    let other = Manifold::cube(v(2.0, 2.0, 2.0), false).translate(v(1.0, 1.0, 1.0));
    let u = soup.boolean_with_engine(&other, OpType::Add, BooleanEngine::Auto);
    assert_vol(&u, 8.0 + 8.0 - 1.0, "doubled cube ∪ cube");
    let i = soup.boolean_with_engine(&other, OpType::Intersect, BooleanEngine::Auto);
    assert_vol(&i, 1.0, "doubled cube ∩ cube");
    let d = soup.boolean_with_engine(&other, OpType::Subtract, BooleanEngine::Auto);
    assert_vol(&d, 7.0, "doubled cube − cube");
}

/// Rotating a soup import must not panic. `soupify` skips `sort_geometry`,
/// which is where the face collider is built, so a soup impl carries a
/// zero-leaf tree; a non-axis-aligned transform used to clone that empty
/// tree and refit it against real face boxes, indexing out of bounds. The
/// debug_assert guarding it is compiled out in release, so this only ever
/// surfaced as a hard crash.
#[test]
fn soup_survives_non_axis_aligned_rotation() {
    let soup = edge_kissing_cubes();
    assert!(soup.as_impl().is_soup, "fixture must import as a soup");
    let rotated = soup.rotate(30.0, 45.0, 60.0);
    assert_eq!(rotated.status(), Error::NoError, "rotated soup status");
    assert_vol(&rotated, 16.0, "rotated soup");
}

#[test]
fn soup_op_soup() {
    // Both operands non-manifold: edge-kissing pairs crossing each other.
    let a = edge_kissing_cubes();
    let mut tris_b = cube_tris([1.0, -1.0, 0.5], [3.0, 1.0, 1.5]);
    tris_b.extend(cube_tris([3.0, 1.0, 0.5], [5.0, 3.0, 1.5]));
    let b = soup_manifold(&tris_b);
    assert!(a.as_impl().is_soup && b.as_impl().is_soup);
    // b's volume: 2*2*1 + 2*2*1 = 8. Overlaps with a:
    //   b1 = [1,3]×[-1,1]×[0.5,1.5] ∩ cube1[0,2]³ = [1,2]×[0,1]×[0.5,1.5] = 1
    //   b2 = [3,5]×[1,3]×[0.5,1.5] ∩ cube2[2,4]×[2,4]×[0,2] = [3,4]×[2,3]×[0.5,1.5] = 1
    let u = a.boolean_with_engine(&b, OpType::Add, BooleanEngine::Auto);
    assert_vol(&u, 16.0 + 8.0 - 2.0, "soup ∪ soup");
    let i = a.boolean_with_engine(&b, OpType::Intersect, BooleanEngine::Auto);
    assert_vol(&i, 2.0, "soup ∩ soup");
    let d = a.boolean_with_engine(&b, OpType::Subtract, BooleanEngine::Auto);
    assert_vol(&d, 14.0, "soup − soup");
}
