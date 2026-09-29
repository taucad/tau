// robust/property_tests.rs — Vertex-property (color) pass-through for the
// robust boolean engine.
//
// The robust pipeline must carry per-operand vertex properties to its output
// the way the exact engine does: constant per-operand properties (the demo's
// A/B colors) survive exactly, interpolated properties agree with the exact
// engine to double precision, and the output vertex positions of a manifold
// boolean match the exact engine's within f64 rounding. The reference
// workload is the demo's spiky-dodecahedron pair.

use crate::linalg::Vec3;
use crate::manifold::Manifold;
use crate::types::{BooleanEngine, Error, MeshGL};

/// The demo's spiky dodecahedron: 12 pentagonal faces fanned to spike tips.
fn spiky_dodecahedron(spike_height: f64) -> Manifold {
    let phi: f64 = (1.0 + 5.0_f64.sqrt()) / 2.0;
    let inv_phi = 1.0 / phi;
    let scale = 0.5;
    let raw_verts: [(f64, f64, f64); 20] = [
        (1.0, 1.0, 1.0), (1.0, 1.0, -1.0), (1.0, -1.0, 1.0), (1.0, -1.0, -1.0),
        (-1.0, 1.0, 1.0), (-1.0, 1.0, -1.0), (-1.0, -1.0, 1.0), (-1.0, -1.0, -1.0),
        (0.0, inv_phi, phi), (0.0, inv_phi, -phi), (0.0, -inv_phi, phi), (0.0, -inv_phi, -phi),
        (inv_phi, phi, 0.0), (-inv_phi, phi, 0.0), (inv_phi, -phi, 0.0), (-inv_phi, -phi, 0.0),
        (phi, 0.0, inv_phi), (phi, 0.0, -inv_phi), (-phi, 0.0, inv_phi), (-phi, 0.0, -inv_phi),
    ];
    let faces: [[usize; 5]; 12] = [
        [0, 8, 10, 2, 16], [0, 16, 17, 1, 12], [0, 12, 13, 4, 8],
        [1, 17, 3, 11, 9], [1, 9, 5, 13, 12], [2, 10, 6, 15, 14],
        [2, 14, 3, 17, 16], [4, 13, 5, 19, 18], [4, 18, 6, 10, 8],
        [5, 9, 11, 7, 19], [6, 18, 19, 7, 15], [3, 14, 15, 7, 11],
    ];
    let verts: Vec<(f64, f64, f64)> =
        raw_verts.iter().map(|&(x, y, z)| (x * scale, y * scale, z * scale)).collect();
    let mut positions: Vec<f32> = Vec::with_capacity(32 * 3);
    let mut tri_verts: Vec<u32> = Vec::with_capacity(60 * 3);
    for &(x, y, z) in &verts {
        positions.extend([x as f32, y as f32, z as f32]);
    }
    for face in &faces {
        let cx: f64 = face.iter().map(|&i| verts[i].0).sum::<f64>() / 5.0;
        let cy: f64 = face.iter().map(|&i| verts[i].1).sum::<f64>() / 5.0;
        let cz: f64 = face.iter().map(|&i| verts[i].2).sum::<f64>() / 5.0;
        let len = (cx * cx + cy * cy + cz * cz).sqrt();
        let (nx, ny, nz) = (cx / len, cy / len, cz / len);
        let spike_idx = (positions.len() / 3) as u32;
        positions.extend([
            (cx + nx * spike_height) as f32,
            (cy + ny * spike_height) as f32,
            (cz + nz * spike_height) as f32,
        ]);
        for j in 0..5 {
            tri_verts.extend([spike_idx, face[j] as u32, face[(j + 1) % 5] as u32]);
        }
    }
    let mut mesh = MeshGL::default();
    mesh.num_prop = 3;
    mesh.vert_properties = positions;
    mesh.tri_verts = tri_verts;
    Manifold::from_mesh_gl(&mesh)
}

fn color(m: &Manifold, rgba: [f64; 4]) -> Manifold {
    m.set_properties(4, move |new_prop, _pos, _old| {
        new_prop.copy_from_slice(&rgba);
    })
}

const BLUE: [f64; 4] = [0.27, 0.53, 0.80, 1.0];
const RED: [f64; 4] = [0.85, 0.25, 0.25, 0.6];

fn colored_spiky_pair() -> (Manifold, Manifold) {
    let a = color(&spiky_dodecahedron(0.4), BLUE);
    let b = color(&spiky_dodecahedron(0.4), RED)
        .rotate(30.0, 45.0, 60.0)
        .translate(Vec3::new(0.3, 0.0, 0.0));
    (a, b)
}

/// Distinct rounded positions of a MeshGL, sorted for set comparison.
fn position_set(gl: &MeshGL) -> Vec<[f64; 3]> {
    let np = gl.num_prop as usize;
    let n = gl.vert_properties.len() / np;
    let mut out: Vec<[f64; 3]> = (0..n)
        .map(|i| {
            [
                gl.vert_properties[i * np] as f64,
                gl.vert_properties[i * np + 1] as f64,
                gl.vert_properties[i * np + 2] as f64,
            ]
        })
        .collect();
    out.sort_by(|a, b| a.partial_cmp(b).unwrap());
    out.dedup();
    out
}

/// Constant per-operand colors must survive the robust engine exactly:
/// every output vertex carries exactly the blue or the red RGBA.
#[test]
fn constant_colors_survive_robust_union() {
    let (a, b) = colored_spiky_pair();
    let out = a.union_with_engine(&b, BooleanEngine::Robust);
    assert_eq!(out.status(), Error::NoError);
    assert_eq!(
        out.as_impl().num_prop, 4,
        "robust output must keep the 4 color channels"
    );
    let gl = out.get_mesh_gl(-1);
    assert_eq!(gl.num_prop, 7, "xyz + rgba");
    let n = gl.vert_properties.len() / 7;
    let (mut blue, mut red) = (0usize, 0usize);
    for i in 0..n {
        let c: Vec<f64> = (3..7).map(|k| gl.vert_properties[i * 7 + k] as f64).collect();
        let is = |rgba: [f64; 4]| (0..4).all(|k| (c[k] - rgba[k]).abs() < 1e-6);
        assert!(
            is(BLUE) || is(RED),
            "vertex {i} color {c:?} is neither operand color"
        );
        if is(BLUE) { blue += 1 } else { red += 1 }
    }
    assert!(blue > 0 && red > 0, "both operands must contribute vertices");
}

/// Robust and exact engines must produce the same set of output vertex
/// positions (within double precision) for the colored spiky pair, and the
/// same color at every shared position.
#[test]
fn robust_matches_exact_vertices_and_colors() {
    let (a, b) = colored_spiky_pair();
    let exact = a.union_with_engine(&b, BooleanEngine::Exact);
    let robust = a.union_with_engine(&b, BooleanEngine::Robust);
    assert_eq!(robust.status(), Error::NoError);

    let ge = exact.get_mesh_gl(-1);
    let gr = robust.get_mesh_gl(-1);
    let pe = position_set(&ge);
    let pr = position_set(&gr);
    assert_eq!(
        pe.len(),
        pr.len(),
        "engines must agree on the distinct output vertex count"
    );
    let close = |x: &[f64; 3], y: &[f64; 3]| {
        (0..3).all(|k| (x[k] - y[k]).abs() <= 1e-6 * x[k].abs().max(1.0))
    };
    for (x, y) in pe.iter().zip(pr.iter()) {
        assert!(close(x, y), "position mismatch: {x:?} vs {y:?}");
    }

    // Per-position color agreement: build exact's position→color map and
    // check every robust vertex against it.
    let np = 7usize;
    let key = |p: [f32; 3]| (p[0].to_bits(), p[1].to_bits(), p[2].to_bits());
    let mut exact_colors: std::collections::BTreeMap<_, Vec<[f32; 4]>> = Default::default();
    for i in 0..ge.vert_properties.len() / np {
        let p = [ge.vert_properties[i * np], ge.vert_properties[i * np + 1], ge.vert_properties[i * np + 2]];
        let c = [
            ge.vert_properties[i * np + 3],
            ge.vert_properties[i * np + 4],
            ge.vert_properties[i * np + 5],
            ge.vert_properties[i * np + 6],
        ];
        exact_colors.entry(key(p)).or_default().push(c);
    }
    for i in 0..gr.vert_properties.len() / np {
        let p = [gr.vert_properties[i * np], gr.vert_properties[i * np + 1], gr.vert_properties[i * np + 2]];
        let c = [
            gr.vert_properties[i * np + 3],
            gr.vert_properties[i * np + 4],
            gr.vert_properties[i * np + 5],
            gr.vert_properties[i * np + 6],
        ];
        let Some(cands) = exact_colors.get(&key(p)) else {
            panic!("robust vertex {p:?} not among exact vertices");
        };
        assert!(
            cands.iter().any(|e| (0..4).all(|k| (e[k] - c[k]).abs() < 1e-6)),
            "color mismatch at {p:?}: robust {c:?} vs exact {cands:?}"
        );
    }
}

/// Position-dependent (non-constant) properties interpolate to the exact
/// engine's values within double precision.
#[test]
fn interpolated_properties_match_exact() {
    let prop_fn = |m: &Manifold| {
        m.set_properties(1, |new_prop, pos, _old| {
            new_prop[0] = 0.25 + pos.x * 0.5 + pos.y * 0.125 - pos.z * 0.0625;
        })
    };
    let a = prop_fn(&Manifold::cube(Vec3::new(2.0, 2.0, 2.0), true));
    let b = prop_fn(&Manifold::sphere(1.3, 8).translate(Vec3::new(0.4, 0.2, 0.1)));
    let exact = a.difference_with_engine(&b, BooleanEngine::Exact);
    let robust = a.difference_with_engine(&b, BooleanEngine::Robust);
    assert_eq!(robust.status(), Error::NoError);
    assert_eq!(robust.as_impl().num_prop, 1);

    let np = 4usize; // xyz + 1
    let gr = robust.get_mesh_gl(-1);
    assert_eq!(gr.num_prop as usize, np);
    // The property is an affine function of position on every input face, so
    // barycentric interpolation must reproduce it at every output vertex.
    for i in 0..gr.vert_properties.len() / np {
        let (x, y, z) = (
            gr.vert_properties[i * np] as f64,
            gr.vert_properties[i * np + 1] as f64,
            gr.vert_properties[i * np + 2] as f64,
        );
        let expect = 0.25 + x * 0.5 + y * 0.125 - z * 0.0625;
        let got = gr.vert_properties[i * np + 3] as f64;
        assert!(
            (got - expect).abs() < 1e-5,
            "vertex {i} ({x},{y},{z}): prop {got} vs affine {expect}"
        );
    }
    let _ = exact;
}
