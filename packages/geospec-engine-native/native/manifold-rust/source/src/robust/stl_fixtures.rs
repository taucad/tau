// robust/stl_fixtures.rs — Test-only STL fixture loading for the robust
// engine's test modules.
//
// Reproduces the WASM demo's import pipeline exactly, because the fixtures in
// `testdata/` are regressions found through that demo: parse an ASCII or
// binary STL into an f32 position soup, normalize it (bbox center to origin,
// longest side scaled to 2.0, f32 storage with f64 arithmetic as in JS),
// weld with `MeshGL::merge`, then import through `from_mesh_gl_robust`.
//
// Declared as a child module of the test modules that use it (see
// `engine_tests.rs`), so it needs no entry in `robust/mod.rs`.
//
// `thingi_tests.rs` still carries its own copy of this pipeline; folding it
// onto this module is a follow-up, deliberately not done here to avoid
// touching that file.

use crate::manifold::Manifold;
use crate::types::MeshGL;

/// Parse a binary STL (80-byte header, u32 face count, 50-byte records of
/// 12 f32 = normal + 3 vertices, then a u16 attribute count).
fn parse_binary(data: &[u8]) -> Vec<f32> {
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

/// Parse an ASCII STL as the demo does: scan for `vertex x y z` lines, parse
/// each coordinate as a double (JS `parseFloat`), store into f32.
fn parse_ascii(data: &[u8]) -> Vec<f32> {
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

/// The demo's format sniff: ASCII iff the head starts with "solid" and
/// mentions "facet" early on.
fn is_ascii(data: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&data[..data.len().min(512)]);
    head.trim_start().starts_with("solid") && head.contains("facet")
}

/// Normalize as the demo's `fetchMesh` does: bbox center to the origin,
/// uniform scale so the longest bbox side is 2.0. JS holds positions in a
/// Float32Array but computes in doubles: read f32 -> widen to f64 ->
/// (x - c) * s in f64 -> truncate to f32 on store.
fn normalize(positions: &mut [f32]) {
    let n_verts = positions.len() / 3;
    let (mut min, mut max) = ([f64::INFINITY; 3], [f64::NEG_INFINITY; 3]);
    for i in 0..n_verts {
        for k in 0..3 {
            let x = positions[i * 3 + k] as f64;
            min[k] = min[k].min(x);
            max[k] = max[k].max(x);
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

/// Import an STL fixture through the demo's pipeline.
pub fn import_stl_like_demo(stl: &[u8]) -> Manifold {
    let mut positions = if is_ascii(stl) {
        parse_ascii(stl)
    } else {
        parse_binary(stl)
    };
    normalize(&mut positions);
    let n_verts = (positions.len() / 3) as u32;
    let mut mesh = MeshGL::default();
    mesh.num_prop = 3;
    mesh.vert_properties = positions;
    mesh.tri_verts = (0..n_verts).collect();
    mesh.merge();
    Manifold::from_mesh_gl_robust(&mesh)
}
