use super::*;
// These are used only by the test modules; the parent `manifold` module no
// longer imports them, so pull them in here where `use super::*` in each
// test file can see them.
use crate::linalg::Vec2;
use crate::types::{MeshGL, Polygons, Rect};

/// Helper: square with a square hole, offset along x
fn square_hole(x_offset: f64) -> Polygons {
    vec![
        vec![
            Vec2::new(2.0 + x_offset, 2.0),
            Vec2::new(-2.0 + x_offset, 2.0),
            Vec2::new(-2.0 + x_offset, -2.0),
            Vec2::new(2.0 + x_offset, -2.0),
        ],
        vec![
            Vec2::new(-1.0 + x_offset, 1.0),
            Vec2::new(1.0 + x_offset, 1.0),
            Vec2::new(1.0 + x_offset, -1.0),
            Vec2::new(-1.0 + x_offset, -1.0),
        ],
    ]
}

/// Port of C++ Gyroid() — gyroid surface via SDF.
pub(super) fn gyroid() -> Manifold {
    use std::f64::consts::PI;
    let two_pi = 2.0 * PI;
    Manifold::level_set(
        move |p: Vec3| {
            let min3 = p.x.min(p.y).min(p.z);
            let max3 = (two_pi - p.x).min((two_pi - p.y).min(two_pi - p.z));
            let bound = min3.min(max3);
            let gyroid = p.x.cos() * p.y.sin() + p.y.cos() * p.z.sin() + p.z.cos() * p.x.sin();
            gyroid.min(bound)
        },
        crate::types::Box {
            min: Vec3::new(0.0, 0.0, 0.0),
            max: Vec3::new(two_pi, two_pi, two_pi),
        },
        0.5,
    )
}

/// Port of C++ WithPositionColors(m) — adds normalized position as 3 extra properties.
pub(super) fn with_position_colors(m: &Manifold) -> Manifold {
    let bb = m.bounding_box();
    let size = bb.size();
    m.set_properties(3, move |props, pos, _old| {
        props[0] = if size.x > 0.0 { (pos.x - bb.min.x) / size.x } else { 0.0 };
        props[1] = if size.y > 0.0 { (pos.y - bb.min.y) / size.y } else { 0.0 };
        props[2] = if size.z > 0.0 { (pos.z - bb.min.z) / size.z } else { 0.0 };
    })
}

/// Port of C++ RelatedGL() — verifies output triangles trace to valid input triangles.
///
/// For each run in the output MeshGL, finds the matching original mesh by `run_original_id`,
/// then verifies that each output vertex position lies within the (transformed) input triangle
/// identified by `face_id`. Matches C++ test helper exactly.
///
/// When `check_normals` is true, also verifies that vertex normals at property offset 3 are
/// unit vectors pointing in the same direction as the output face normal (matches C++ with
/// checkNormals=true). Set `update_normals` to also call MeshGL::update_normals(3) first
/// (C++ updateNormals=true).
fn related_gl(out: &Manifold, originals: &[&MeshGL]) {
    related_gl_impl(out, originals, false, false);
}

fn related_gl_check_normals(out: &Manifold, originals: &[&MeshGL]) {
    related_gl_impl(out, originals, true, true);
}

fn related_gl_impl(out: &Manifold, originals: &[&MeshGL], check_normals: bool, update_normals: bool) {
    assert!(!out.is_empty(), "RelatedGL: output should not be empty");
    // Match C++ RelatedGL: GetMeshGL() (= -1) auto-substitutes slot 0 only when
    // every meshID recorded normals; mixed outputs keep raw slots for the
    // per-run normalization below.
    let mut output = out.get_mesh_gl(-1);
    let num_run = output.run_original_id.len();
    // Base tolerance from the output manifold; per-run tolerance also includes in_mesh.tolerance
    let base_tolerance = 3.0 * out.get_tolerance().max(output.tolerance as f64);

    // Save transforms before update_normals clears them
    let run_transforms: Vec<Option<[f32; 12]>> = (0..num_run).map(|run| {
        let offset = 12 * run;
        if offset + 12 <= output.run_transform.len() {
            let mut arr = [0f32; 12];
            arr.copy_from_slice(&output.run_transform[offset..offset + 12]);
            Some(arr)
        } else {
            None
        }
    }).collect();

    if update_normals {
        // Per C++ #1718 RelatedGL: bring slot 3..5 into world frame and
        // normalize. hasNormals runs (run_flags bit 1) are already world-frame
        // (identity); others need the inverse-transpose of the per-run linear
        // transform (with a backside sign flip). Replaces the removed
        // MeshGL::UpdateNormals.
        use crate::linalg::{Mat3, Vec3};
        let out_np = output.num_prop as usize;
        let mut vert_updated = vec![false; output.num_vert()];
        for run in 0..num_run {
            let nt: Option<Mat3> = if output.has_normals(run) {
                None
            } else {
                let sign = if output.backside(run) { -1.0 } else { 1.0 };
                run_transforms[run].map(|t| {
                    let col = |j: usize| Vec3::new(t[3 * j] as f64, t[3 * j + 1] as f64, t[3 * j + 2] as f64);
                    Mat3::from_cols(col(0), col(1), col(2)).transpose().inverse() * sign
                })
            };
            let start = output.run_index[run] as usize;
            let end = output.run_index[run + 1] as usize;
            for k in start..end {
                let v = output.tri_verts[k] as usize;
                if vert_updated[v] { continue; }
                vert_updated[v] = true;
                let base = v * out_np + 3;
                let mut n = Vec3::new(
                    output.vert_properties[base] as f64,
                    output.vert_properties[base + 1] as f64,
                    output.vert_properties[base + 2] as f64,
                );
                if let Some(m) = nt { n = m * n; }
                let len = (n.x * n.x + n.y * n.y + n.z * n.z).sqrt();
                if len > 0.0 { n = n / len; }
                output.vert_properties[base] = n.x as f32;
                output.vert_properties[base + 1] = n.y as f32;
                output.vert_properties[base + 2] = n.z as f32;
            }
        }
    }

    for run in 0..num_run {
        let out_id = output.run_original_id[run];
        let in_mesh = originals.iter()
            .find(|m| m.run_original_id.len() == 1 && m.run_original_id[0] == out_id)
            .unwrap_or_else(|| panic!("RelatedGL: no original with runOriginalID={}", out_id));

        // Per-run tolerance: max of output tolerance and this run's input mesh tolerance
        let tolerance = base_tolerance.max(3.0 * in_mesh.tolerance as f64);

        // Use saved transform (before update_normals may have cleared run_transform)
        let has_transform = run_transforms[run].is_some();
        let t_owned: [f32; 12] = run_transforms[run].unwrap_or([0f32; 12]);
        let t: &[f32] = if has_transform { &t_owned } else { &[] };

        let start_tri = (output.run_index[run] / 3) as usize;
        let end_tri = (output.run_index[run + 1] / 3) as usize;
        let in_np = in_mesh.num_prop as usize;
        let out_np = output.num_prop as usize;

        for tri in start_tri..end_tri {
            let in_tri_idx = if output.face_id.is_empty() { tri as u32 } else { output.face_id[tri] } as usize;
            let in_tri_count = in_mesh.tri_verts.len() / 3;
            assert!(in_tri_idx < in_tri_count,
                "RelatedGL: faceID {} out of range (original has {} tris)", in_tri_idx, in_tri_count);

            // Get original triangle vertices and apply transform
            let mut in_tri_pos = [[0.0f64; 3]; 3];
            for j in 0..3 {
                let vert = in_mesh.tri_verts[3 * in_tri_idx + j] as usize;
                let x = in_mesh.vert_properties[vert * in_np] as f64;
                let y = in_mesh.vert_properties[vert * in_np + 1] as f64;
                let z = in_mesh.vert_properties[vert * in_np + 2] as f64;
                if has_transform {
                    // Column-major mat3x4: col0=[t0,t1,t2], col1=[t3,t4,t5], col2=[t6,t7,t8], col3=[t9,t10,t11]
                    in_tri_pos[j] = [
                        t[0] as f64 * x + t[3] as f64 * y + t[6] as f64 * z + t[9] as f64,
                        t[1] as f64 * x + t[4] as f64 * y + t[7] as f64 * z + t[10] as f64,
                        t[2] as f64 * x + t[5] as f64 * y + t[8] as f64 * z + t[11] as f64,
                    ];
                } else {
                    in_tri_pos[j] = [x, y, z];
                }
            }

            // Compute triangle normal and area
            let e0 = [in_tri_pos[1][0]-in_tri_pos[0][0], in_tri_pos[1][1]-in_tri_pos[0][1], in_tri_pos[1][2]-in_tri_pos[0][2]];
            let e1 = [in_tri_pos[2][0]-in_tri_pos[0][0], in_tri_pos[2][1]-in_tri_pos[0][1], in_tri_pos[2][2]-in_tri_pos[0][2]];
            let in_cross = [e0[1]*e1[2]-e0[2]*e1[1], e0[2]*e1[0]-e0[0]*e1[2], e0[0]*e1[1]-e0[1]*e1[0]];
            let area = (in_cross[0]*in_cross[0]+in_cross[1]*in_cross[1]+in_cross[2]*in_cross[2]).sqrt();
            if area == 0.0 { continue; }
            let in_normal = [in_cross[0]/area, in_cross[1]/area, in_cross[2]/area];

            // Compute output triangle positions for normal check
            let mut out_tri_pos = [[0.0f64; 3]; 3];
            for j in 0..3 {
                let vert = output.tri_verts[3 * tri + j] as usize;
                out_tri_pos[j] = [
                    output.vert_properties[vert * out_np] as f64,
                    output.vert_properties[vert * out_np + 1] as f64,
                    output.vert_properties[vert * out_np + 2] as f64,
                ];
            }
            let oe0 = [out_tri_pos[1][0]-out_tri_pos[0][0], out_tri_pos[1][1]-out_tri_pos[0][1], out_tri_pos[1][2]-out_tri_pos[0][2]];
            let oe1 = [out_tri_pos[2][0]-out_tri_pos[0][0], out_tri_pos[2][1]-out_tri_pos[0][1], out_tri_pos[2][2]-out_tri_pos[0][2]];
            let out_normal_unnorm = [oe0[1]*oe1[2]-oe0[2]*oe1[1], oe0[2]*oe1[0]-oe0[0]*oe1[2], oe0[0]*oe1[1]-oe0[1]*oe1[0]];

            // For each output vertex, check it's within the input triangle
            for j in 0..3 {
                let vert = output.tri_verts[3 * tri + j] as usize;
                let out_pos = out_tri_pos[j];
                // edges[k] = in_tri_pos[k] - out_pos
                let edges: [[f64; 3]; 3] = std::array::from_fn(|k| [
                    in_tri_pos[k][0] - out_pos[0],
                    in_tri_pos[k][1] - out_pos[1],
                    in_tri_pos[k][2] - out_pos[2],
                ]);
                // Triple product = dot(edges[0], cross(edges[1], edges[2]))
                let c = [
                    edges[1][1]*edges[2][2]-edges[1][2]*edges[2][1],
                    edges[1][2]*edges[2][0]-edges[1][0]*edges[2][2],
                    edges[1][0]*edges[2][1]-edges[1][1]*edges[2][0],
                ];
                let volume = edges[0][0]*c[0] + edges[0][1]*c[1] + edges[0][2]*c[2];
                assert!(volume <= area * tolerance,
                    "RelatedGL: run={} tri={} vert={}: volume={:.6} > area*tol={:.6} (in_tri={})",
                    run, tri, j, volume, area * tolerance, in_tri_idx);

                if check_normals && out_np >= 6 {
                    let nx = output.vert_properties[vert * out_np + 3] as f64;
                    let ny = output.vert_properties[vert * out_np + 4] as f64;
                    let nz = output.vert_properties[vert * out_np + 5] as f64;
                    let len = (nx*nx + ny*ny + nz*nz).sqrt();
                    assert!((len - 1.0).abs() < 0.0001,
                        "RelatedGL: run={} tri={} vert={}: normal length={:.6} != 1", run, tri, j, len);
                    // Normal must point in same half-space as output face normal
                    let dot = nx*out_normal_unnorm[0] + ny*out_normal_unnorm[1] + nz*out_normal_unnorm[2];
                        assert!(dot > 0.0,
                        "RelatedGL: run={} tri={} vert={}: normal dot face_normal={:.6} <= 0", run, tri, j, dot);
                    let _ = in_normal; // used for reference but normals validated against output face
                }
            }
        }
    }
}

/// Port of C++ CubeSTL() — a unit cube with 6 properties per vertex (xyz + face-normal xyz).
/// Every triangle has 3 unique vertices (no sharing), so each vertex carries the flat face normal.
/// Matches C++ CubeSTL() exactly, including a reserved run_original_id.
fn cube_stl() -> MeshGL {
    let cube_manifold = Manifold::cube(Vec3::splat(1.0), true);
    let cube_in = cube_manifold.get_mesh_gl(0);
    let in_np = cube_in.num_prop as usize;
    let num_tri = cube_in.tri_verts.len() / 3;

    let mut cube = MeshGL::default();
    cube.num_prop = 6;

    let mut vert = 0u32;
    for tri in 0..num_tri {
        // Collect per-tri positions
        let mut tri_pos = [[0.0f64; 3]; 3];
        for i in 0..3 {
            cube.tri_verts.push(vert);
            vert += 1;
            let v = cube_in.tri_verts[3 * tri + i] as usize;
            for j in 0..3 {
                tri_pos[i][j] = cube_in.vert_properties[v * in_np + j] as f64;
            }
        }
        // Compute flat face normal
        let e0 = [tri_pos[1][0]-tri_pos[0][0], tri_pos[1][1]-tri_pos[0][1], tri_pos[1][2]-tri_pos[0][2]];
        let e1 = [tri_pos[2][0]-tri_pos[0][0], tri_pos[2][1]-tri_pos[0][1], tri_pos[2][2]-tri_pos[0][2]];
        let cross = [e0[1]*e1[2]-e0[2]*e1[1], e0[2]*e1[0]-e0[0]*e1[2], e0[0]*e1[1]-e0[1]*e1[0]];
        let len = (cross[0]*cross[0]+cross[1]*cross[1]+cross[2]*cross[2]).sqrt();
        let normal = if len > 0.0 { [cross[0]/len, cross[1]/len, cross[2]/len] } else { [0.0, 0.0, 1.0] };

        for i in 0..3 {
            for j in 0..3 { cube.vert_properties.push(tri_pos[i][j] as f32); }
            for j in 0..3 { cube.vert_properties.push(normal[j] as f32); }
        }
    }

    cube.run_original_id.push(Manifold::reserve_ids(1));
    cube
}

/// Read a C++ test source file from the pinned submodule. Used to
/// single-source large inline mesh literals (InterpolatedNormals, Ring)
/// instead of transcribing hundreds of lines of numbers into Rust.
fn read_cpp_test_source(filename: &str) -> String {
    let path = format!(
        "{}/cpp-reference/manifold/test/{}",
        env!("CARGO_MANIFEST_DIR"),
        filename
    );
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("Failed to read C++ test source {}: {}", path, e))
}

/// Extract the `occurrence`-th (0-based) initializer list assigned as
/// `<assign> = { ... };` in C++ source, parsed as numbers. The arrays this is
/// used on are flat brace lists of plain decimal literals with optional `//`
/// line comments — no nested braces or expressions.
fn cpp_inline_array(source: &str, assign: &str, occurrence: usize) -> Vec<f64> {
    let mut search_from = 0usize;
    let mut at = None;
    for _ in 0..=occurrence {
        let idx = source[search_from..]
            .find(assign)
            .unwrap_or_else(|| panic!("C++ assignment `{}` not found", assign))
            + search_from;
        at = Some(idx);
        search_from = idx + assign.len();
    }
    let idx = at.unwrap();
    let open = source[idx..].find('{').expect("no opening brace") + idx;
    let close = source[open..].find('}').expect("no closing brace") + open;
    source[open + 1..close]
        .lines()
        .map(|line| line.split("//").next().unwrap())
        .flat_map(|line| {
            line.split(',')
                .map(str::trim)
                .filter(|tok| !tok.is_empty())
                .map(|tok| {
                    tok.parse::<f64>()
                        .unwrap_or_else(|e| panic!("bad number `{}` in `{}`: {}", tok, assign, e))
                })
                .collect::<Vec<f64>>()
        })
        .collect()
}

/// `cpp_inline_array` narrowed to unsigned indices.
fn cpp_inline_array_u32(source: &str, assign: &str, occurrence: usize) -> Vec<u32> {
    cpp_inline_array(source, assign, occurrence)
        .into_iter()
        .map(|v| v as u32)
        .collect()
}

/// Load an OBJ file from the C++ test models directory.
fn read_test_obj(filename: &str) -> Manifold {
    let path = format!(
        "{}/cpp-reference/manifold/test/models/{}",
        env!("CARGO_MANIFEST_DIR"),
        filename
    );
    let contents = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("Failed to read OBJ file {}: {}", path, e));
    let mut verts: Vec<f32> = Vec::new();
    let mut tri_verts: Vec<u32> = Vec::new();
    for line in contents.lines() {
        let line = line.trim();
        if line.starts_with("v ") {
            let parts: Vec<f64> = line[2..]
                .split_whitespace()
                .filter_map(|s| s.parse().ok())
                .collect();
            if parts.len() >= 3 {
                verts.push(parts[0] as f32);
                verts.push(parts[1] as f32);
                verts.push(parts[2] as f32);
            }
        } else if line.starts_with("f ") {
            let indices: Vec<u32> = line[2..]
                .split_whitespace()
                .filter_map(|s| s.split('/').next()?.parse::<u32>().ok().map(|i| i - 1))
                .collect();
            for i in 1..indices.len() - 1 {
                tri_verts.push(indices[0]);
                tri_verts.push(indices[i]);
                tri_verts.push(indices[i + 1]);
            }
        }
    }
    let mut mesh = MeshGL::default();
    mesh.num_prop = 3;
    mesh.vert_properties = verts;
    mesh.tri_verts = tri_verts;
    Manifold::from_mesh_gl(&mesh)
}

mod basic;
mod boolean;
mod complex;
mod advanced;
mod hull;
mod api;
mod sdf;
mod validation;
mod smooth;
mod cross_section2;
mod mesh_ops;
mod raycast;
mod error_propagation;
mod properties;
mod normals;
