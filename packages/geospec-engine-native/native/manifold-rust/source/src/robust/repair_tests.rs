// robust/repair_tests.rs — Unit tests for shell-level orientation repair
// (`robust/repair.rs`), on constructed fixtures where the correct flip set
// is known exactly: inverted bodies must rewind, legitimate cavities must
// survive, doubled sheets must be left to the boolean's stack arithmetic.

use super::*;
use crate::linalg::Vec3;
use crate::manifold::Manifold;
use crate::types::MeshGL;

fn v(x: f64, y: f64, z: f64) -> Vec3 {
    Vec3::new(x, y, z)
}

/// Axis-aligned cube [lo,hi]³ as 12 outward-wound triangles.
fn cube_tris(lo: f64, hi: f64) -> Vec<[Vec3; 3]> {
    let quads: [([f64; 3], [f64; 3], [f64; 3], [f64; 3]); 6] = [
        ([0., 0., 0.], [0., 1., 0.], [1., 1., 0.], [1., 0., 0.]), // -z
        ([0., 0., 1.], [1., 0., 1.], [1., 1., 1.], [0., 1., 1.]), // +z
        ([0., 0., 0.], [1., 0., 0.], [1., 0., 1.], [0., 0., 1.]), // -y
        ([0., 1., 0.], [0., 1., 1.], [1., 1., 1.], [1., 1., 0.]), // +y
        ([0., 0., 0.], [0., 0., 1.], [0., 1., 1.], [0., 1., 0.]), // -x
        ([1., 0., 0.], [1., 1., 0.], [1., 1., 1.], [1., 0., 1.]), // +x
    ];
    let s = hi - lo;
    let m = |q: [f64; 3]| v(lo + q[0] * s, lo + q[1] * s, lo + q[2] * s);
    let mut out = Vec::new();
    for (a, b, c, d) in quads {
        out.push([m(a), m(b), m(c)]);
        out.push([m(a), m(c), m(d)]);
    }
    out
}

fn flipped(tris: &[[Vec3; 3]]) -> Vec<[Vec3; 3]> {
    tris.iter().map(|t| [t[0], t[2], t[1]]).collect()
}

fn mesh_from_tris(tris: &[[Vec3; 3]]) -> Manifold {
    let mut mesh = MeshGL::default();
    mesh.num_prop = 3;
    for t in tris {
        for p in t {
            mesh.vert_properties
                .extend([p.x as f32, p.y as f32, p.z as f32]);
        }
    }
    mesh.tri_verts = (0..(tris.len() * 3) as u32).collect();
    mesh.merge();
    Manifold::from_mesh_gl_robust(&mesh)
}

/// Signed (divergence-theorem) volume of a Manifold — `volume()` takes the
/// absolute value, which hides exactly the inversions these tests are about.
fn signed_volume(m: &Manifold) -> f64 {
    let tris = crate::robust::soup::impl_to_tris(m.as_impl());
    tris.iter()
        .map(|t| {
            crate::linalg::dot(t[0], crate::linalg::cross(t[1], t[2])) / 6.0
        })
        .sum()
}

#[test]
fn correctly_wound_cube_is_untouched() {
    let plan = plan_repair(&cube_tris(0.0, 2.0));
    assert_eq!(plan.num_shells, 1);
    assert_eq!(plan.flipped_shells, 0);
    assert!(plan.flip.iter().all(|&f| !f));
}

#[test]
fn inverted_cube_is_flipped() {
    let plan = plan_repair(&flipped(&cube_tris(0.0, 2.0)));
    assert_eq!(plan.num_shells, 1);
    assert_eq!(plan.flipped_shells, 1);
    assert!(plan.flip.iter().all(|&f| f));
}

#[test]
fn legitimate_cavity_is_preserved() {
    // Outer [0,6] outward + inner [2,4] inward = solid with a void: correct
    // as-is, and the classic failure case for signed-volume blanket flips.
    let mut tris = cube_tris(0.0, 6.0);
    tris.extend(flipped(&cube_tris(2.0, 4.0)));
    let plan = plan_repair(&tris);
    assert_eq!(plan.num_shells, 2);
    assert_eq!(plan.flipped_shells, 0, "cavity must not be flipped");
}

#[test]
fn fully_inverted_nested_pair_is_repaired() {
    // Outer inverted + inner outward: both wrong for a solid-with-void.
    let mut tris = flipped(&cube_tris(0.0, 6.0));
    tris.extend(cube_tris(2.0, 4.0));
    let plan = plan_repair(&tris);
    assert_eq!(plan.num_shells, 2);
    assert_eq!(plan.flipped_shells, 2);
    assert!(plan.flip.iter().all(|&f| f));
}

/// The other half of the ambiguity table above: same nesting, but the outer
/// shell is *correct*. Two outward-wound shells, one inside the other, are a
/// valid solid whose inner region simply winds 2 — there is no inversion to
/// undo, and rewinding the inner one would carve real material out (the
/// Thingi10K #61459 failure). Evidence of a mirrored stack is required before
/// a material-removing flip, and there is none here.
#[test]
fn nested_outward_solid_is_not_turned_into_a_cavity() {
    let mut tris = cube_tris(0.0, 6.0);
    tris.extend(cube_tris(2.0, 4.0));
    let plan = plan_repair(&tris);
    assert_eq!(plan.num_shells, 2);
    assert_eq!(
        plan.flipped_shells, 0,
        "a nested outward solid must keep its material"
    );
}

#[test]
fn solid_nested_inside_cavity_winds_positive_again() {
    // Depth 0 solid [0,10], depth 1 cavity [2,8], depth 2 solid [4,6] — the
    // innermost body must wind +1; here it arrives inverted.
    let mut tris = cube_tris(0.0, 10.0);
    tris.extend(flipped(&cube_tris(2.0, 8.0)));
    tris.extend(flipped(&cube_tris(4.0, 6.0)));
    let plan = plan_repair(&tris);
    assert_eq!(plan.num_shells, 3);
    assert_eq!(plan.flipped_shells, 1);
    // Only the innermost 12 triangles (last shell appended) flip.
    assert!(plan.flip[..24].iter().all(|&f| !f));
    assert!(plan.flip[24..].iter().all(|&f| f));
}

#[test]
fn disjoint_bodies_flip_independently() {
    // Body 1 correct, body 2 inverted, disjoint in x.
    let mut tris = cube_tris(0.0, 2.0);
    tris.extend(flipped(&cube_tris(5.0, 7.0)));
    let plan = plan_repair(&tris);
    assert_eq!(plan.num_shells, 2);
    assert_eq!(plan.flipped_shells, 1);
    assert!(plan.flip[..12].iter().all(|&f| !f));
    assert!(plan.flip[12..].iter().all(|&f| f));
}

#[test]
fn doubled_sheet_is_left_alone() {
    // A cube plus a coincident fully-doubled copy of itself (forward +
    // reversed = zero-thickness stack everywhere). The stack shell has no
    // clean orientation; repair must not touch it.
    let mut tris = cube_tris(0.0, 2.0);
    tris.extend(flipped(&cube_tris(5.0, 7.0)));
    tris.extend(cube_tris(5.0, 7.0));
    // Shells: [0,2] cube; the doubled [5,7] pair welds into one shell.
    let plan = plan_repair(&tris);
    assert_eq!(plan.num_shells, 2);
    assert_eq!(
        plan.flipped_shells, 0,
        "a doubled sheet has no orientation to repair"
    );
}

#[test]
fn manifold_repair_orientation_inverted_cube() {
    let m = mesh_from_tris(&flipped(&cube_tris(0.0, 2.0)));
    assert_eq!(m.status(), crate::types::Error::NoError);
    assert!(signed_volume(&m) < 0.0, "fixture must import inverted");
    let repaired = m.repair_orientation();
    assert_eq!(repaired.status(), crate::types::Error::NoError);
    assert!(
        (signed_volume(&repaired) - 8.0).abs() < 1e-9,
        "repaired cube must enclose +8 units³, got {}",
        signed_volume(&repaired)
    );
    assert_eq!(repaired.num_tri(), m.num_tri());
    // Repairing again is a no-op (and returns a clone, not a rebuild).
    let again = repaired.repair_orientation();
    assert!((signed_volume(&again) - signed_volume(&repaired)).abs() == 0.0);
}

#[test]
fn manifold_repair_preserves_cavity_and_pairing() {
    let mut tris = flipped(&cube_tris(0.0, 6.0));
    tris.extend(cube_tris(2.0, 4.0));
    let m = mesh_from_tris(&tris);
    assert_eq!(m.status(), crate::types::Error::NoError);
    let repaired = m.repair_orientation();
    // Solid [0,6] minus void [2,4]: 216 - 8 = 208.
    assert!(
        (signed_volume(&repaired) - 208.0).abs() < 1e-9,
        "expected 208, got {}",
        signed_volume(&repaired)
    );
    // The rewound impl must still be a valid manifold (pairing intact).
    assert!(!repaired.as_impl().is_soup);
    assert!(repaired.as_impl().is_manifold());
    // And it must boolean correctly as a standalone repaired solid.
    let probe = Manifold::cube(Vec3::new(1.0, 1.0, 1.0), false)
        .translate(Vec3::new(2.5, 2.5, 2.5));
    let inter = repaired.intersection_with_engine(&probe, crate::types::BooleanEngine::Robust);
    assert!(
        inter.volume() < 1e-9,
        "probe inside the cavity must intersect nothing, got {}",
        inter.volume()
    );
}

#[test]
fn repair_is_available_before_any_boolean_and_fixes_union() {
    // Union of a solid with an inverted neighbor: without repair the
    // inverted body contributes no material.
    let a = mesh_from_tris(&cube_tris(0.0, 2.0));
    let b = mesh_from_tris(&flipped(&cube_tris(1.0, 3.0)));
    let engine = crate::types::BooleanEngine::Robust;
    let broken = a.union_with_engine(&b, engine);
    let fixed = a.union_with_engine(&b.repair_orientation(), engine);
    assert!((broken.volume() - 8.0).abs() < 1e-9, "inverted B adds nothing");
    assert!(
        (fixed.volume() - 15.0).abs() < 1e-9,
        "8 + 8 - 1 overlap = 15, got {}",
        fixed.volume()
    );
}
