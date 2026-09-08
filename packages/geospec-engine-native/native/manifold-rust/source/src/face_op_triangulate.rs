// face_op_triangulate.rs — Face2Tri: triangulate polygonal faces into
// triangle halfedges.
//
// Ports the Face2Tri portion of src/face_op.cpp (WriteLocalTriangles,
// WriteGeneralTriangulation, Face2Tri). Extracted from face_op.rs, which
// re-exports face2tri/face2tri_ct so callers (boolean_result_assemble.rs)
// keep the crate::face_op::face2tri path. Relies on face_op.rs for the
// polygon-assembly helpers (assemble_halfedges, project_polygons,
// get_axis_aligned_projection) and on polygon.rs for the general
// triangulator.

use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{length2, Vec3};
use crate::polygon::{ccw, triangulate_idx_halfedges, HalfedgeTriangulation};
use crate::types::{Halfedge, TriRef};

use super::{assemble_halfedges, get_axis_aligned_projection, project_polygons};

/// Port of `WriteLocalTriangles` (face_op.cpp): write 1–2 triangles for a
/// tri/quad face. `triangles` entries are face-halfedge indices. Interior
/// edges (the quad diagonal) pair against each other by matching those
/// indices; boundary edges record their output halfedge in
/// `contour2tri[originalFaceHalfedgeIndex]` for the cross-face pairing pass.
fn write_local_triangles(
    output: &mut [Halfedge],
    contour2tri: &mut [i32],
    face_halfedge: &[Halfedge],
    first_tri: usize,
    triangles: &[[i32; 3]],
) {
    debug_assert!(triangles.len() <= 2, "local face path only handles tris/quads");
    let first_out = 3 * first_tri as i32;
    // (start, end, out) — start/end are face-halfedge indices, out is the
    // output halfedge index.
    let mut local_edges: [[i32; 3]; 6] = [[0; 3]; 6];
    let mut num_edge = 0usize;
    for tri in triangles {
        for i in 0..3 {
            let out = first_out + num_edge as i32;
            let start = tri[i];
            let end = tri[(i + 1) % 3];
            local_edges[num_edge] = [start, end, out];
            output[out as usize].start_vert = face_halfedge[start as usize].start_vert;
            // C++ Halfedges derives end verts from triangle adjacency; the
            // Rust Halfedge stores them, so set explicitly.
            output[out as usize].end_vert = face_halfedge[end as usize].start_vert;
            output[out as usize].prop_vert = face_halfedge[start as usize].prop_vert;
            output[out as usize].paired_halfedge = -1;
            num_edge += 1;
        }
    }

    for i in 0..num_edge {
        let edge = local_edges[i];
        let mut pair = -1;
        for j in 0..num_edge {
            if local_edges[j][0] == edge[1] && local_edges[j][1] == edge[0] {
                pair = local_edges[j][2];
                break;
            }
        }
        if pair >= 0 {
            output[edge[2] as usize].paired_halfedge = pair;
        } else {
            contour2tri[edge[0] as usize] = edge[2];
        }
    }
}

/// Port of `WriteGeneralTriangulation` (face_op.cpp): write the triangles of a
/// `HalfedgeTriangulation`. Triangle-halfedge vertex fields hold face-halfedge
/// indices; interior pairs translate directly, while contour pairs record the
/// triangle halfedge lying on each original edge in `contour2tri`.
fn write_general_triangulation(
    output: &mut [Halfedge],
    contour2tri: &mut [i32],
    face_halfedge: &[Halfedge],
    first_tri: usize,
    triangulation: &HalfedgeTriangulation,
) {
    let first_out = 3 * first_tri as i32;
    let contour_end = triangulation.contour_end;
    let num_tri_halfedge = 3 * triangulation.num_tri();

    for local in 0..num_tri_halfedge {
        let out = (first_out as usize) + local;
        let edge = &triangulation.halfedges[contour_end + local];
        output[out].start_vert = face_halfedge[edge.start_vert as usize].start_vert;
        output[out].end_vert = face_halfedge[edge.end_vert as usize].start_vert;
        output[out].prop_vert = face_halfedge[edge.start_vert as usize].prop_vert;
        if edge.paired_halfedge >= contour_end as i32 {
            output[out].paired_halfedge = first_out + edge.paired_halfedge - contour_end as i32;
        } else {
            output[out].paired_halfedge = -1;
        }
    }

    for contour in 0..contour_end {
        let edge = &triangulation.halfedges[contour];
        if edge.paired_halfedge < 0 {
            continue;
        }
        debug_assert!(
            edge.paired_halfedge >= contour_end as i32,
            "contour paired to another contour"
        );
        // Contour halfedges are the input edges reversed, so end_vert holds
        // the original face-halfedge index of the edge's start.
        let boundary = edge.end_vert;
        debug_assert!(
            boundary >= 0 && (boundary as usize) < contour2tri.len(),
            "contour edge index out of bounds"
        );
        contour2tri[boundary as usize] = first_out + edge.paired_halfedge - contour_end as i32;
    }
}

/// Triangulates the faces represented by `face_edge` (polygon boundaries in
/// `mesh.halfedge`) and `halfedge_ref` (per-halfedge TriRef). On entry
/// `mesh.halfedge` holds general polygonal faces with valid cross-face
/// pairing (from boolean result assembly); on return it holds proper
/// triangles and `mesh.mesh_relation.tri_ref` is populated.
///
/// Mirrors `Manifold::Impl::Face2Tri` in `src/face_op.cpp` (v3.5.0): pairing
/// is face-local during triangulation, then boundary edges are paired across
/// faces via the *original* `paired_halfedge` relationships — never re-derived
/// from vertex pairs, which would mispair duplicate edges on degenerate
/// (exactly-coplanar) faces and produce a non-manifold result.
pub fn face2tri(
    mesh: &mut ManifoldImpl,
    face_edge: &[i32],
    halfedge_ref: &[TriRef],
    allow_convex: bool,
) {
    face2tri_ct(mesh, face_edge, halfedge_ref, allow_convex, None);
}

/// [`face2tri`] with cooperative cancellation, returning `false` if `token`
/// fired before the triangulation completed. On `false`, `mesh` is left in a
/// half-built state and must be discarded — the same contract as C++
/// `Face2Tri(..., ctx)`, whose cancel arms `return` mid-way and rely on the
/// caller's `MakeEmpty(Cancelled)` (face_op.cpp:190-366).
pub fn face2tri_ct(
    mesh: &mut ManifoldImpl,
    face_edge: &[i32],
    halfedge_ref: &[TriRef],
    allow_convex: bool,
    token: Option<&crate::cancel::CancelToken>,
) -> bool {
    // C++ gates the whole function on entry (face_op.cpp:192).
    if crate::cancel::is_cancelled(token) {
        return false;
    }
    // C++ passes faceHalfedge as a separate view and writes halfedge_ fresh;
    // the Rust assembly built the polygonal faces in mesh.halfedge, so take it.
    let face_halfedge = std::mem::take(&mut mesh.halfedge);
    let num_faces = face_edge.len() - 1;
    let mut contour2tri = vec![-1i32; face_halfedge.len()];

    // First pass: count triangles per face; run the general triangulator for
    // faces with more than four edges. Each face triangulates independently
    // (C++ spawns a TBB task per general face), so the parallel path yields
    // identical per-face results, merged in face order.
    let face_normal_ref = &mesh.face_normal;
    let vert_pos_ref = &mesh.vert_pos;
    let epsilon = mesh.epsilon;
    let general: Vec<Option<HalfedgeTriangulation>> =
        match crate::par::maybe_par_map_ct(num_faces, 512, token, |face| {
            let num_edge = (face_edge[face + 1] - face_edge[face]) as usize;
            if num_edge <= 4 {
                return None;
            }
            let first_edge = face_edge[face] as usize;
            let last_edge = face_edge[face + 1] as usize;
            let projection = get_axis_aligned_projection(face_normal_ref[face]);
            let polys_loops =
                assemble_halfedges(&face_halfedge[first_edge..last_edge], first_edge as i32);
            let polys = project_polygons(&polys_loops, &face_halfedge, vert_pos_ref, &projection);
            Some(triangulate_idx_halfedges(&polys, epsilon, allow_convex))
        }) {
            Some(general) => general,
            None => return false,
        };

    let mut tri_offset = vec![0usize; face_edge.len()];
    let mut results: std::collections::HashMap<usize, HalfedgeTriangulation> =
        std::collections::HashMap::new();
    for (face, triangulation) in general.into_iter().enumerate() {
        let num_edge = (face_edge[face + 1] - face_edge[face]) as usize;
        if num_edge == 0 {
            continue;
        }
        debug_assert!(num_edge >= 3, "face has less than three edges");
        tri_offset[face] = num_edge - 2;
        if let Some(t) = triangulation {
            tri_offset[face] = t.num_tri();
            results.insert(face, t);
        }
    }

    // Exclusive scan of triangle counts → per-face output offsets.
    let mut acc = 0usize;
    for entry in tri_offset.iter_mut() {
        let count = *entry;
        *entry = acc;
        acc += count;
    }
    let num_tri = acc;

    let mut new_halfedge = vec![
        Halfedge {
            start_vert: -1,
            end_vert: -1,
            paired_halfedge: -1,
            prop_vert: -1,
        };
        3 * num_tri
    ];
    let mut tri_normal = vec![Vec3::new(0.0, 0.0, 0.0); num_tri];
    let mut tri_ref = vec![TriRef::default(); num_tri];

    for face in 0..num_faces {
        let first_edge = face_edge[face] as usize;
        let last_edge = face_edge[face + 1] as usize;
        let num_edge = last_edge - first_edge;
        if num_edge == 0 {
            continue;
        }
        let normal = mesh.face_normal[face];
        let first_tri = tri_offset[face];
        let face_num_tri;

        if num_edge == 3 {
            // Single triangle — sort edges into correct winding order.
            let mut tri_edge = [first_edge as i32, first_edge as i32 + 1, first_edge as i32 + 2];
            let mut tri = [
                face_halfedge[first_edge].start_vert,
                face_halfedge[first_edge + 1].start_vert,
                face_halfedge[first_edge + 2].start_vert,
            ];
            let mut ends = [
                face_halfedge[first_edge].end_vert,
                face_halfedge[first_edge + 1].end_vert,
                face_halfedge[first_edge + 2].end_vert,
            ];
            if ends[0] == tri[2] {
                tri_edge.swap(1, 2);
                tri.swap(1, 2);
                ends.swap(1, 2);
            }
            debug_assert!(
                ends[0] == tri[1] && ends[1] == tri[2] && ends[2] == tri[0],
                "these 3 edges do not form a triangle!"
            );
            write_local_triangles(
                &mut new_halfedge,
                &mut contour2tri,
                &face_halfedge,
                first_tri,
                &[tri_edge],
            );
            face_num_tri = 1;
        } else if num_edge == 4 {
            // Quad — split into two triangles along the better diagonal.
            let projection = get_axis_aligned_projection(normal);
            let tri_ccw = |t: [i32; 3]| -> bool {
                ccw(
                    projection.apply(mesh.vert_pos[face_halfedge[t[0] as usize].start_vert as usize]),
                    projection.apply(mesh.vert_pos[face_halfedge[t[1] as usize].start_vert as usize]),
                    projection.apply(mesh.vert_pos[face_halfedge[t[2] as usize].start_vert as usize]),
                    mesh.epsilon,
                ) >= 0
            };

            let quad_loops =
                assemble_halfedges(&face_halfedge[first_edge..last_edge], first_edge as i32);
            let quad = &quad_loops[0]; // Should be exactly one loop

            let tris0 = [
                [quad[0], quad[1], quad[2]],
                [quad[0], quad[2], quad[3]],
            ];
            let tris1 = [
                [quad[1], quad[2], quad[3]],
                [quad[0], quad[1], quad[3]],
            ];

            let choice = if !(tri_ccw(tris0[0]) && tri_ccw(tris0[1])) {
                1
            } else if tri_ccw(tris1[0]) && tri_ccw(tris1[1]) {
                let diag0 = mesh.vert_pos[face_halfedge[quad[0] as usize].start_vert as usize]
                    - mesh.vert_pos[face_halfedge[quad[2] as usize].start_vert as usize];
                let diag1 = mesh.vert_pos[face_halfedge[quad[1] as usize].start_vert as usize]
                    - mesh.vert_pos[face_halfedge[quad[3] as usize].start_vert as usize];
                if length2(diag0) > length2(diag1) { 1 } else { 0 }
            } else {
                0
            };

            let chosen = if choice == 0 { &tris0 } else { &tris1 };
            write_local_triangles(
                &mut new_halfedge,
                &mut contour2tri,
                &face_halfedge,
                first_tri,
                chosen,
            );
            face_num_tri = 2;
        } else {
            // General triangulation
            let triangulation = results
                .get(&face)
                .expect("general face missing triangulation result");
            write_general_triangulation(
                &mut new_halfedge,
                &mut contour2tri,
                &face_halfedge,
                first_tri,
                triangulation,
            );
            face_num_tri = triangulation.num_tri();
        }

        // WriteTriRefs
        let ref_tri = halfedge_ref[first_edge];
        for t in 0..face_num_tri {
            tri_normal[first_tri + t] = normal;
            tri_ref[first_tri + t] = ref_tri;
        }
    }

    // Cross-face pairing: connect each face-boundary output halfedge to its
    // counterpart via the original assembly pairing.
    for edge in 0..face_halfedge.len() {
        let tri_edge = contour2tri[edge];
        if tri_edge < 0 {
            continue;
        }
        let pair = face_halfedge[edge].paired_halfedge;
        if pair < 0 {
            continue;
        }
        let pair_tri = contour2tri[pair as usize];
        debug_assert!(pair_tri >= 0, "boundary edge did not triangulate with its pair");
        new_halfedge[tri_edge as usize].paired_halfedge = pair_tri;
    }

    mesh.halfedge = new_halfedge;
    mesh.face_normal = tri_normal;
    mesh.mesh_relation.tri_ref = tri_ref;
    true
}
