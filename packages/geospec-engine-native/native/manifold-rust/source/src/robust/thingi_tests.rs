// robust/thingi_tests.rs — Regression tests against real-world Thingi10K
// meshes (checked into src/robust/testdata/). These reproduce failures found
// through the WASM demo's Boolean Gallery: both operands import cleanly via
// `Manifold::from_mesh_gl_robust`, yet a robust boolean of the pair returned
// `Error::NotClosed`. The fixtures follow the demo's exact pipeline: binary
// STL -> f32 triangle soup -> normalize (center at bbox center, max side =
// 2.0, f32 storage with f64 arithmetic, as in JS) -> MeshGL::merge ->
// robust import.

use crate::linalg::Vec3;
use crate::manifold::Manifold;
use crate::types::{BooleanEngine, Error, MeshGL};

/// Parse a binary STL (80-byte header, u32 face count, 50-byte records of
/// 12 f32 = normal + 3 vertices, then u16 attribute count) into a raw f32
/// position soup, one vertex per corner.
fn parse_binary_stl(data: &[u8]) -> Vec<f32> {
    assert!(data.len() >= 84, "STL too short");
    let n_faces = u32::from_le_bytes(data[80..84].try_into().unwrap()) as usize;
    assert!(
        84 + n_faces * 50 <= data.len(),
        "STL truncated: header declares {n_faces} faces"
    );
    let mut positions = Vec::with_capacity(n_faces * 9);
    for f in 0..n_faces {
        let rec = 84 + f * 50;
        // Skip the 12-byte facet normal; read the 3 corner vertices.
        for i in 0..9 {
            let off = rec + 12 + i * 4;
            positions.push(f32::from_le_bytes(data[off..off + 4].try_into().unwrap()));
        }
    }
    positions
}

/// Parse an ASCII STL exactly as the demo does: scan for `vertex x y z`
/// lines, parse each coordinate as a double (JS `parseFloat`), then store
/// into an f32 soup (Float32Array narrowing).
fn parse_ascii_stl(data: &[u8]) -> Vec<f32> {
    let text = std::str::from_utf8(data).expect("ASCII STL is not UTF-8");
    let mut positions = Vec::new();
    for line in text.lines() {
        let mut it = line.split_whitespace();
        if it.next() == Some("vertex") {
            for _ in 0..3 {
                let v: f64 = it
                    .next()
                    .expect("vertex line missing coordinate")
                    .parse()
                    .expect("bad coordinate");
                positions.push(v as f32);
            }
        }
    }
    positions
}

/// The demo's format sniff: ASCII iff the head starts with "solid" and the
/// file mentions "facet" early on.
fn is_ascii_stl(data: &[u8]) -> bool {
    let head = &data[..data.len().min(512)];
    let head = String::from_utf8_lossy(head);
    head.trim_start().starts_with("solid") && head.contains("facet")
}

/// Normalize exactly as the demo's `fetchMesh` does: bbox center to origin,
/// uniform scale so the longest bbox side is 2.0. JS stores positions in a
/// Float32Array but computes in doubles, so: read f32 -> widen to f64 ->
/// (x - c) * s in f64 -> truncate to f32 on store.
fn normalize_positions(positions: &mut [f32]) {
    let n_verts = positions.len() / 3;
    let (mut min, mut max) = ([f64::INFINITY; 3], [f64::NEG_INFINITY; 3]);
    for i in 0..n_verts {
        for k in 0..3 {
            let x = positions[i * 3 + k] as f64;
            if x < min[k] {
                min[k] = x;
            }
            if x > max[k] {
                max[k] = x;
            }
        }
    }
    let center = [
        (min[0] + max[0]) / 2.0,
        (min[1] + max[1]) / 2.0,
        (min[2] + max[2]) / 2.0,
    ];
    let max_side = (max[0] - min[0]).max(max[1] - min[1]).max(max[2] - min[2]);
    let scale = if max_side > 0.0 { 2.0 / max_side } else { 1.0 };
    for i in 0..n_verts {
        for k in 0..3 {
            positions[i * 3 + k] = ((positions[i * 3 + k] as f64 - center[k]) * scale) as f32;
        }
    }
}

/// The demo's import path: soup MeshGL (num_prop = 3, sequential indices),
/// weld with `MeshGL::merge`, import through the robust entry point.
fn import_stl_like_demo(stl: &[u8]) -> Manifold {
    let mut positions = if is_ascii_stl(stl) {
        parse_ascii_stl(stl)
    } else {
        parse_binary_stl(stl)
    };
    normalize_positions(&mut positions);
    let n_verts = (positions.len() / 3) as u32;
    let mut mesh = MeshGL::default();
    mesh.num_prop = 3;
    mesh.vert_properties = positions;
    mesh.tri_verts = (0..n_verts).collect();
    mesh.merge();
    Manifold::from_mesh_gl_robust(&mesh)
}

const CASTLE_STAIRS_59082: &[u8] = include_bytes!("testdata/59082.stl");
const GROUND_1313535: &[u8] = include_bytes!("testdata/1313535.stl");
const TENTACLE_939888: &[u8] = include_bytes!("testdata/939888.stl");
const PICKAXE_93557: &[u8] = include_bytes!("testdata/93557.stl");
const MODEL_92068: &[u8] = include_bytes!("testdata/92068.stl");
const MODEL_39926: &[u8] = include_bytes!("testdata/39926.stl");
const FRAME_1075458: &[u8] = include_bytes!("testdata/1075458.stl");
const TOWER_91115: &[u8] = include_bytes!("testdata/91115.stl");
/// Every wall's winding step must equal the difference between the cells it
/// separates. A violation means the complex merged cells the geometry keeps
/// apart — the condition that previously surfaced only as a hash-order
/// dependent volume. Checked here on real, heavily self-intersecting scans
/// rather than synthetic solids.
fn assert_arrangement_consistent(a: &Manifold, b: &Manifold, what: &str) {
    use crate::robust::{cells, intersection_graph, soup};
    let p = soup::impl_to_tris(a.as_impl());
    let q = soup::impl_to_tris(b.as_impl());
    let graph = intersection_graph::build_graph(&p, &q);
    let complex = cells::build_cells(&graph);
    let wind = cells::windings(&graph, &complex, [&p, &q]);
    let bad = cells::inconsistent_walls(&complex, &wind);
    assert!(
        bad.is_empty(),
        "{what}: {} inconsistent walls of {} cells; first (piece, step, actual) = {:?}",
        bad.len(),
        complex.num_cells,
        bad.first()
    );
}

#[test]
fn thingi_59082_arrangement_is_consistent() {
    let a = import_stl_like_demo(CASTLE_STAIRS_59082);
    let b = import_stl_like_demo(GROUND_1313535)
        .rotate(162.0, 156.0, 337.0)
        .translate(Vec3::new(0.3, 0.0, 0.0));
    assert_arrangement_consistent(&a, &b, "59082 / 1313535");
}

const MODEL_74660: &[u8] = include_bytes!("testdata/74660.stl");
const MODEL_1147177: &[u8] = include_bytes!("testdata/1147177.stl");

#[test]
fn thingi_74660_arrangement_is_consistent() {
    let a = import_stl_like_demo(MODEL_74660);
    let b = import_stl_like_demo(MODEL_1147177).translate(Vec3::new(0.3, 0.0, 0.0));
    assert_arrangement_consistent(&a, &b, "74660 / 1147177");
}

/// Thingi10K #74660 union #1147177 (second demo repro of the same
/// NotClosed family): the demo's default translate(0.3, 0, 0), no rotation.
#[test]
fn thingi_74660_union_1147177_is_closed() {
    let a = import_stl_like_demo(MODEL_74660);
    assert_eq!(a.status(), Error::NoError, "operand A import");

    let b = import_stl_like_demo(MODEL_1147177).translate(Vec3::new(0.3, 0.0, 0.0));
    assert_eq!(b.status(), Error::NoError, "operand B import");

    let result = a.union_with_engine(&b, BooleanEngine::Robust);
    assert_eq!(result.status(), Error::NoError, "robust union status");
    assert!(!result.is_empty(), "robust union should be non-empty");
    assert!(result.volume() > 0.0, "union volume must be positive");
}

/// Thingi10K #92068 union #39926 (demo repro): both operands import as
/// closed manifolds; the robust union returned NotClosed. Reproduces with no
/// rotation at all — just the demo's translate(0.3, 0, 0) on operand B.
#[test]
fn thingi_92068_union_39926_is_closed() {
    let a = import_stl_like_demo(MODEL_92068);
    assert_eq!(a.status(), Error::NoError, "operand A import");
    assert!(!a.as_impl().is_soup, "operand A should weld to a manifold");

    let b = import_stl_like_demo(MODEL_39926).translate(Vec3::new(0.3, 0.0, 0.0));
    assert_eq!(b.status(), Error::NoError, "operand B import");
    assert!(!b.as_impl().is_soup, "operand B should weld to a manifold");

    let result = a.union_with_engine(&b, BooleanEngine::Robust);
    assert_eq!(result.status(), Error::NoError, "robust union status");
    assert!(!result.is_empty(), "robust union should be non-empty");
    assert!(result.volume() > 0.0, "union volume must be positive");
}

/// Thingi10K #1075458 ("frame 1 n") minus #91115 ("castle corner tower"),
/// demo repro: both operands import cleanly, yet the robust difference
/// panicked (surfacing as `RuntimeError: unreachable` in WASM) with B
/// rotated (311, 55, 345) and translated (0.7, -0.2, 0.4).
#[test]
fn thingi_1075458_minus_91115_is_valid() {
    let a = import_stl_like_demo(FRAME_1075458);
    assert_eq!(a.status(), Error::NoError, "operand A import");

    let b = import_stl_like_demo(TOWER_91115)
        .rotate(311.0, 55.0, 345.0)
        .translate(Vec3::new(0.7, -0.2, 0.4));
    assert_eq!(b.status(), Error::NoError, "operand B import");

    let result = a.boolean_with_engine(&b, crate::types::OpType::Subtract, BooleanEngine::Robust);
    assert_eq!(result.status(), Error::NoError, "robust difference status");
    let volume = result.volume();
    assert!(volume.is_finite(), "difference volume must be finite");
    assert!(volume > 0.0, "difference volume must be positive");
}

/// Thingi10K #59082 union #1313535 (demo repro): both operands import
/// cleanly, yet the robust union returns NotClosed with an empty result.
/// Surfaced in the browser as `RuntimeError: unreachable` — that part was the
/// wasm-only `Instant::now()` panic (fixed separately); underneath it the
/// boolean itself still fails, which is what this test pins.
#[test]
fn thingi_59082_union_1313535_is_closed() {
    let a = import_stl_like_demo(CASTLE_STAIRS_59082);
    assert_eq!(a.status(), Error::NoError, "operand A import");

    let b = import_stl_like_demo(GROUND_1313535)
        .rotate(162.0, 156.0, 337.0)
        .translate(Vec3::new(0.3, 0.0, 0.0));
    assert_eq!(b.status(), Error::NoError, "operand B import");

    let result = a.union_with_engine(&b, BooleanEngine::Robust);
    assert_eq!(result.status(), Error::NoError, "robust union status");
    assert!(!result.is_empty(), "robust union should be non-empty");
    assert!(result.volume() > 0.0, "union volume must be positive");
}

/// Thingi10K #939888 union #93557 (demo repro): both operands import as
/// closed manifolds, so the robust union must produce a valid result — the
/// engine returned NotClosed.
#[test]
fn thingi_939888_union_93557_is_closed() {
    let a = import_stl_like_demo(TENTACLE_939888);
    assert_eq!(a.status(), Error::NoError, "operand A import");
    assert!(!a.as_impl().is_soup, "operand A should weld to a manifold");

    let b = import_stl_like_demo(PICKAXE_93557)
        .rotate(356.0, 140.0, 322.0)
        .translate(Vec3::new(0.3, 0.0, 0.0));
    assert_eq!(b.status(), Error::NoError, "operand B import");
    assert!(!b.as_impl().is_soup, "operand B should weld to a manifold");

    let result = a.union_with_engine(&b, BooleanEngine::Robust);
    assert_eq!(result.status(), Error::NoError, "robust union status");
    assert!(!result.is_empty(), "robust union should be non-empty");
    // The union of two closed solids contains at least each operand's
    // volume-maximum and must exceed either operand alone minus overlap;
    // just sanity-check positivity here — status is the regression.
    assert!(result.volume() > 0.0, "union volume must be positive");
}

const RECOGNIZER_68730: &[u8] = include_bytes!("testdata/68730.stl");

/// Sampled volume of `{winding >= 1}` over the mesh's bounding box —
/// stratified Monte Carlo with the exact winding query and a fixed SplitMix64
/// seed, the same independent arbiter `examples/robust_repro.rs` uses
/// (REFEREE_SAMPLES). Returns (estimate, one standard deviation).
fn sampled_material(m: &Manifold, samples: usize) -> (f64, f64) {
    use crate::robust::exact::rational::R3;
    use crate::robust::ray_shoot::{winding_number_indexed, WindingIndex};
    let tris = crate::robust::soup::impl_to_tris(m.as_impl());
    let (mut min, mut max) = ([f64::INFINITY; 3], [f64::NEG_INFINITY; 3]);
    for t in &tris {
        for v in t {
            let c = [v.x, v.y, v.z];
            for k in 0..3 {
                min[k] = min[k].min(c[k]);
                max[k] = max[k].max(c[k]);
            }
        }
    }
    let ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    let idx = WindingIndex::new(&tris);
    let mut state = 0x5EED_CAFE_F00D_D1CEu64;
    let mut rand = move || {
        state = state.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        ((z ^ (z >> 31)) >> 11) as f64 / (1u64 << 53) as f64
    };
    let mut hits = 0usize;
    for _ in 0..samples {
        let pt = R3::from_vec3(Vec3::new(
            min[0] + ext[0] * rand(),
            min[1] + ext[1] * rand(),
            min[2] + ext[2] * rand(),
        ));
        if winding_number_indexed(&pt, &tris, &idx) >= 1 {
            hits += 1;
        }
    }
    let vol_box = ext[0] * ext[1] * ext[2];
    let frac = hits as f64 / samples as f64;
    (
        vol_box * frac,
        vol_box * (frac * (1.0 - frac) / samples as f64).sqrt(),
    )
}

/// Signed divergence-theorem volume (`Manifold::volume` hides the sign).
fn signed_volume(m: &Manifold) -> f64 {
    crate::robust::soup::impl_to_tris(m.as_impl())
        .iter()
        .map(|t| crate::linalg::dot(t[0], crate::linalg::cross(t[1], t[2])) / 6.0)
        .sum()
}

/// Thingi10K #68730 ("recognizer cuerpo repaired"): edge/vertex manifold, but
/// several of its bodies are wound inside-out, so under {w >= 1} semantics
/// most of its geometry is not material and vanishes from booleans (operand
/// overlap ratio ~13x in the demo's repro frames against #486860).
/// `repair_orientation` must rewind those bodies so the mesh's enclosed
/// volume matches what the independent winding sampler measures.
#[test]
fn thingi_68730_repair_orientation_restores_material() {
    let broken = import_stl_like_demo(RECOGNIZER_68730);
    assert_eq!(broken.status(), Error::NoError, "import");

    const SAMPLES: usize = 20_000;
    let (mat_broken, _) = sampled_material(&broken, SAMPLES);
    let div_broken = signed_volume(&broken);
    assert!(
        div_broken.abs() > 5.0 * mat_broken,
        "fixture regressed: divergence volume {div_broken} should dwarf sampled material {mat_broken}"
    );

    let repaired = broken.repair_orientation();
    assert_eq!(repaired.status(), Error::NoError, "repair status");
    assert_eq!(repaired.num_tri(), broken.num_tri());
    assert!(!repaired.as_impl().is_soup, "68730 imports as a manifold");
    assert!(repaired.as_impl().is_manifold(), "pairing must survive repair");

    // Repaired, the divergence volume and the sampled {w >= 1} material must
    // agree: every body now bounds solid material exactly once.
    let (mat_fixed, sigma) = sampled_material(&repaired, SAMPLES);
    let div_fixed = signed_volume(&repaired);
    // Rewinding turns each inverted body's negative contribution positive,
    // so the repaired total must exceed the broken total's magnitude.
    assert!(
        div_fixed >= div_broken.abs(),
        "repair must add enclosed volume ({div_fixed} vs {div_broken})"
    );
    assert!(
        (div_fixed - mat_fixed).abs() < 5.0 * sigma,
        "repaired divergence volume {div_fixed} vs sampled material {mat_fixed} (sigma {sigma})"
    );

    // And the repaired bodies must survive a boolean: union with a probe box
    // through the model keeps at least the mesh's own material.
    let probe = Manifold::cube(Vec3::new(0.5, 0.5, 0.5), true);
    let union = repaired.union_with_engine(&probe, BooleanEngine::Robust);
    assert_eq!(union.status(), Error::NoError, "robust union status");
    assert!(
        union.volume() > div_fixed - 1e-9,
        "union volume {} must contain the repaired material {div_fixed}",
        union.volume()
    );
}

const CUBOCTAHEDRON_61459: &[u8] = include_bytes!("testdata/61459.stl");

/// Thingi10K #61459 ("cuboctahedron less faces"): a valid, correctly wound
/// solid that additionally carries a smaller **nested outward-wound shell**
/// (20 of its 176 triangles) strictly inside the 156-triangle body. Under
/// {w >= 1} that inner shell is harmless — its interior simply winds 2 — so
/// the mesh's material is the outer body's 3.2 units³.
///
/// The depth-parity rule alone read the inner shell as a first-level cavity
/// and rewound it, carving 2.58 units³ of real material out of the model
/// (~80% loss, visible in the demo's Boolean Gallery). Repair must be a
/// material no-op here: nothing is inside-out, so there is nothing to fix.
#[test]
fn thingi_61459_repair_preserves_nested_solid() {
    let m = import_stl_like_demo(CUBOCTAHEDRON_61459);
    assert_eq!(m.status(), Error::NoError, "import");
    assert!(!m.as_impl().is_soup, "61459 welds to manifold connectivity");

    const SAMPLES: usize = 40_000;
    let div_before = signed_volume(&m);
    let (mat_before, _) = sampled_material(&m, SAMPLES);
    assert!(
        mat_before > 3.0,
        "fixture regressed: {mat_before} of material expected before repair"
    );

    // Plan level: nothing here is inside-out, so no shell may be rewound.
    let plan = crate::robust::repair::plan_repair(&crate::robust::soup::impl_to_tris(m.as_impl()));
    assert_eq!(plan.num_shells, 2, "156-tri body plus a 20-tri nested shell");
    assert_eq!(plan.flipped_shells, 0, "repair must be a no-op on 61459");

    let repaired = m.repair_orientation();
    assert_eq!(repaired.status(), Error::NoError, "repair status");
    assert_eq!(repaired.num_tri(), m.num_tri());

    let div_after = signed_volume(&repaired);
    let (mat_after, _) = sampled_material(&repaired, SAMPLES);
    assert!(
        (div_after - div_before).abs() <= 0.01 * div_before.abs(),
        "repair changed divergence volume {div_before} -> {div_after}"
    );
    // The two estimates are paired — same seed, same bounding box (repair
    // never moves a vertex) — so they sample identical points and no
    // Monte-Carlo slack is needed on top of the 1% tolerance.
    assert!(
        (mat_after - mat_before).abs() <= 0.01 * mat_before,
        "repair destroyed material {mat_before} -> {mat_after}"
    );
}

const MODEL_36088: &[u8] = include_bytes!("testdata/36088.stl");
const MODEL_301921: &[u8] = include_bytes!("testdata/301921.stl");

/// Thingi10K #301921 ∪ its rotated copy (the sweep's standard pass): both
/// operands are clean manifolds (self-overlap ratio 1.00), the arrangement
/// is consistent, yet the robust union lost ~7% of its volume (0.4033 vs
/// exact 0.4381; the Monte-Carlo referee sides with exact at 6.5σ). Surface
/// area was almost unchanged — an interior region flipped outside.
///
/// The tolerance is 1e-3 relative, not exact agreement: both engines run a
/// topology cleanup over their own tessellation of the same boundary, and
/// those cleanups legitimately move the volume at the ~1e-4 scale (here the
/// robust result is the raw extraction volume 0.438010 and the exact
/// engine's cleanup moved its own result to 0.438066). Anything larger is a
/// real defect — this gate catches both the original 8% class and the 0.6%
/// `swap_degenerates` class (docs/CPP_DIVERGENCES.md entry 1) — and the
/// Monte-Carlo referee (`examples/volume_referee.rs`) arbitrates disputes.
#[test]
fn thingi_301921_union_rotated_self_matches_exact() {
    let a = import_stl_like_demo(MODEL_301921);
    assert_eq!(a.status(), Error::NoError, "operand A import");
    assert!(!a.as_impl().is_soup, "operand A should weld to a manifold");
    let b = a.rotate(30.0, 45.0, 60.0).translate(Vec3::new(0.3, 0.0, 0.0));
    let robust = a.union_with_engine(&b, BooleanEngine::Robust);
    let exact = a.union_with_engine(&b, BooleanEngine::Exact);
    assert_eq!(robust.status(), Error::NoError, "robust union status");
    let (rv, ev) = (robust.volume(), exact.volume());
    assert!(
        (rv - ev).abs() <= 1e-3 * ev.abs(),
        "robust volume {rv} != exact volume {ev}"
    );
}

const MODEL_36374: &[u8] = include_bytes!("testdata/36374.stl");

/// Thingi10K #36374 ∪ its rotated copy: returned NotClosed before the
/// canonical cocircular tie-break — the downstream failure the understated
/// walls of #36088 only threatened. BFS crossed a split coincident stack,
/// seeded wrong windings, and extraction could not close.
#[test]
fn thingi_36374_union_rotated_self_is_closed() {
    let a = import_stl_like_demo(MODEL_36374);
    assert_eq!(a.status(), Error::NoError, "operand A import");
    let b = a.rotate(30.0, 45.0, 60.0).translate(Vec3::new(0.3, 0.0, 0.0));
    let result = a.union_with_engine(&b, BooleanEngine::Robust);
    assert_eq!(result.status(), Error::NoError, "robust union status");
    assert!(result.volume() > 0.0, "union volume must be positive");
    assert_arrangement_consistent(&a, &b, "36374 ∪ rotated self");
}

/// Thingi10K #36088 ∪ its rotated copy (the sweep's standard pass): found by
/// the full-corpus sweep as the one mesh in its window whose arrangement
/// carried inconsistent walls — winding steps that contradict the resolved
/// cell windings. The union's volume was still right, but an inconsistent
/// complex means cells were merged that the geometry keeps apart.
#[test]
fn thingi_36088_arrangement_is_consistent() {
    let a = import_stl_like_demo(MODEL_36088);
    assert_eq!(a.status(), Error::NoError, "operand A import");
    let b = a.rotate(30.0, 45.0, 60.0).translate(Vec3::new(0.3, 0.0, 0.0));
    assert_arrangement_consistent(&a, &b, "36088 ∪ rotated self");
}

const TOP_WALLS_51360: &[u8] = include_bytes!("testdata/51360.stl");
const MODEL_90225: &[u8] = include_bytes!("testdata/90225.stl");

/// Thingi10K #51360 ("top walls") ∪ #90225, the user's logged demo frame.
///
/// #51360 fuses a correctly wound region with an inside-out region of nearly
/// equal volume into one connected shell — so its divergence volume is ~0
/// (the two halves cancel) and `repair_orientation` correctly declines to
/// rewind a shell that is inverted only in part. Under the default
/// `{w >= 1}` rule the inverted half is simply not material and the union
/// drops it; `WindingRule::Nonzero` keeps it. The bands below are the frame's
/// measured volumes, confirmed against the Monte-Carlo winding referee under
/// each rule (`examples/robust_repro.rs`, REFEREE_RULE): 2.4981 for Positive
/// and 2.8340 ± 0.0064 for Nonzero.
#[test]
fn thingi_51360_nonzero_rule_keeps_the_inverted_half() {
    use crate::types::{OpType, WindingRule};
    let a = import_stl_like_demo(TOP_WALLS_51360);
    assert_eq!(a.status(), Error::NoError, "operand A import");
    let b = import_stl_like_demo(MODEL_90225)
        .rotate(340.0, 202.0, 341.0)
        .translate(Vec3::new(0.7, -0.2, 0.4));
    assert_eq!(b.status(), Error::NoError, "operand B import");

    let positive =
        a.boolean_with_engine_and_rule(&b, OpType::Add, BooleanEngine::Robust, WindingRule::Positive);
    assert_eq!(positive.status(), Error::NoError, "positive-rule status");
    let nonzero =
        a.boolean_with_engine_and_rule(&b, OpType::Add, BooleanEngine::Robust, WindingRule::Nonzero);
    assert_eq!(nonzero.status(), Error::NoError, "nonzero-rule status");

    // The default rule must be untouched by the feature.
    assert_eq!(
        positive.volume(),
        a.union_with_engine(&b, BooleanEngine::Robust).volume(),
        "default engine path must equal the explicit Positive rule"
    );
    assert!(
        (positive.volume() - 2.4981).abs() < 1e-3,
        "positive-rule volume {}",
        positive.volume()
    );
    assert!(
        (nonzero.volume() - 2.8340).abs() < 5e-3,
        "nonzero-rule volume {}",
        nonzero.volume()
    );
    assert!(
        nonzero.num_tri() > positive.num_tri(),
        "nonzero keeps more surface: {} vs {}",
        nonzero.num_tri(),
        positive.num_tri()
    );
}
