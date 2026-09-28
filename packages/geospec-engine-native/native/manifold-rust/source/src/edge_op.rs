// edge_op.rs — Phase 7b: Edge collapse, degenerate removal, topology cleanup
//
// Ports src/edge_op.cpp from the Manifold C++ library.
// All algorithms are sequential (rayon deferred to later).

use crate::linalg::{Vec2, Vec3, dot, dot2, length2_2};
use crate::types::{next_halfedge, Halfedge};
use crate::impl_mesh::ManifoldImpl;
use crate::face_op::{get_axis_aligned_projection, calculate_vert_normals};
use crate::polygon::ccw;

// -----------------------------------------------------------------------
// Private helpers (mirrors anonymous-namespace functions in edge_op.cpp)
// -----------------------------------------------------------------------

/// Returns the 3 halfedge indices forming the triangle containing `edge`.
/// tri_of(e) = [e, next(e), next(next(e))]
fn tri_of(edge: usize) -> [usize; 3] {
    let e1 = next_halfedge(edge as i32) as usize;
    let e2 = next_halfedge(e1 as i32) as usize;
    [edge, e1, e2]
}

/// Returns true if edge 0–1 is longer than 0–2 and 1–2.
fn is_01_longest(v0: Vec2, v1: Vec2, v2: Vec2) -> bool {
    let e = [v1 - v0, v2 - v1, v0 - v2];
    let l = [dot2(e[0], e[0]), dot2(e[1], e[1]), dot2(e[2], e[2])];
    l[0] > l[1] && l[0] > l[2]
}

// -----------------------------------------------------------------------
// pair_up / update_vert / form_loop / collapse_tri / remove_if_folded
// -----------------------------------------------------------------------

/// Pairs two halfedges bidirectionally.
pub fn pair_up(halfedge: &mut Vec<Halfedge>, e0: usize, e1: usize) {
    halfedge[e0].paired_halfedge = e1 as i32;
    halfedge[e1].paired_halfedge = e0 as i32;
}

/// Traverses CW from `start_edge` to `end_edge` (exclusive) around
/// `start_edge.endVert`, repointing all traversed halfedges to `vert`.
pub fn update_vert(mesh: &mut ManifoldImpl, vert: i32, start_edge: usize, end_edge: usize) {
    // C++ UpdateVert: start_edge == end_edge is a legitimate no-op; the
    // infinite-loop check is against *start_edge* after stepping (i.e. we
    // wrapped all the way around without hitting end_edge).
    let mut current = start_edge;
    while current != end_edge {
        mesh.halfedge[current].end_vert = vert;
        let next = next_halfedge(current as i32) as usize;
        mesh.halfedge[next].start_vert = vert;
        current = mesh.halfedge[next].paired_halfedge as usize;
        debug_assert_ne!(current, start_edge, "infinite loop in update_vert!");
    }
}

/// When an edge collapse would create a non-manifold edge, instead duplicate
/// both endpoints and re-attach the manifold the other way across this edge.
pub fn form_loop(mesh: &mut ManifoldImpl, current: usize, end: usize) {
    let start_vert = mesh.vert_pos.len() as i32;
    mesh.vert_pos.push(mesh.vert_pos[mesh.halfedge[current].start_vert as usize]);
    let end_vert = mesh.vert_pos.len() as i32;
    mesh.vert_pos.push(mesh.vert_pos[mesh.halfedge[current].end_vert as usize]);

    let old_match = mesh.halfedge[current].paired_halfedge as usize;
    let new_match = mesh.halfedge[end].paired_halfedge as usize;

    update_vert(mesh, start_vert, old_match, new_match);
    update_vert(mesh, end_vert, end, current);

    mesh.halfedge[current].paired_halfedge = new_match as i32;
    mesh.halfedge[new_match].paired_halfedge = current as i32;
    mesh.halfedge[end].paired_halfedge = old_match as i32;
    mesh.halfedge[old_match].paired_halfedge = end as i32;

    remove_if_folded(mesh, end);
}

/// Collapse the two non-`edge`-index halfedges of a triangle by linking their
/// paired partners directly. Marks the three halfedges as removed.
pub fn collapse_tri(halfedge: &mut Vec<Halfedge>, tri_edge: [usize; 3]) {
    if halfedge[tri_edge[1]].paired_halfedge == -1 {
        return;
    }
    let pair1 = halfedge[tri_edge[1]].paired_halfedge as usize;
    let pair2 = halfedge[tri_edge[2]].paired_halfedge as usize;
    halfedge[pair1].paired_halfedge = pair2 as i32;
    halfedge[pair2].paired_halfedge = pair1 as i32;
    for i in 0..3 {
        let prop_vert = halfedge[tri_edge[i]].prop_vert;
        halfedge[tri_edge[i]] = Halfedge { start_vert: -1, end_vert: -1, paired_halfedge: -1, prop_vert };
    }
}

/// Removes a pair of triangles that have folded onto each other (degenerate),
/// by patching their external paired halfedges together.
pub fn remove_if_folded(mesh: &mut ManifoldImpl, edge: usize) {
    let tri0edge = tri_of(edge);
    let pair0 = mesh.halfedge[edge].paired_halfedge;
    if pair0 < 0 {
        return;
    }
    let tri1edge = tri_of(pair0 as usize);
    if mesh.halfedge[tri0edge[1]].paired_halfedge == -1 {
        return;
    }
    if mesh.halfedge[tri0edge[1]].end_vert == mesh.halfedge[tri1edge[1]].end_vert {
        if mesh.halfedge[tri0edge[1]].paired_halfedge == tri1edge[2] as i32 {
            if mesh.halfedge[tri0edge[2]].paired_halfedge == tri1edge[1] as i32 {
                // Both outer edges are paired: degenerate two-triangle island — mark all verts NaN
                for i in 0..3 {
                    let sv = mesh.halfedge[tri0edge[i]].start_vert;
                    if sv >= 0 {
                        mesh.vert_pos[sv as usize] = Vec3::new(f64::NAN, f64::NAN, f64::NAN);
                    }
                }
            } else {
                let sv = mesh.halfedge[tri0edge[1]].start_vert;
                if sv >= 0 {
                    mesh.vert_pos[sv as usize] = Vec3::new(f64::NAN, f64::NAN, f64::NAN);
                }
            }
        } else if mesh.halfedge[tri0edge[2]].paired_halfedge == tri1edge[1] as i32 {
            let sv = mesh.halfedge[tri1edge[1]].start_vert;
            if sv >= 0 {
                mesh.vert_pos[sv as usize] = Vec3::new(f64::NAN, f64::NAN, f64::NAN);
            }
        } else {
            return;
        }
        let p01 = mesh.halfedge[tri0edge[1]].paired_halfedge as usize;
        let p02 = mesh.halfedge[tri0edge[2]].paired_halfedge as usize;
        let p11 = mesh.halfedge[tri1edge[1]].paired_halfedge as usize;
        let p12 = mesh.halfedge[tri1edge[2]].paired_halfedge as usize;
        pair_up(&mut mesh.halfedge, p01, p12);
        pair_up(&mut mesh.halfedge, p02, p11);
        for i in 0..3 {
            mesh.halfedge[tri0edge[i]] = Halfedge { start_vert: -1, end_vert: -1, paired_halfedge: -1, prop_vert: -1 };
            mesh.halfedge[tri1edge[i]] = Halfedge { start_vert: -1, end_vert: -1, paired_halfedge: -1, prop_vert: -1 };
        }
    }
}

// -----------------------------------------------------------------------
// CollapseEdge
// -----------------------------------------------------------------------

/// Collapses the given edge by merging `startVert` into `endVert`.
/// Returns false if the collapse cannot be done safely.
/// May form loops (topological splits) to avoid non-manifold configurations.
pub fn collapse_edge(mesh: &mut ManifoldImpl, edge: usize, scratch: &mut Vec<usize>, tol: f64, first_new_vert: i32) -> bool {
    // Per #1671: `tol` defaults to epsilon when negative. In a Boolean
    // (first_new_vert != 0) callers pass tolerance_ so newly-created verts may
    // move up to tolerance, but an edge whose far end is an *old* vert is still
    // limited to epsilon (old verts may only move by epsilon — avoids error
    // stacking).
    let tol = if tol < 0.0 { mesh.epsilon } else { tol };
    let to_remove = mesh.halfedge[edge];
    if to_remove.paired_halfedge < 0 {
        return false;
    }

    let end_vert = to_remove.end_vert as usize;
    let tri0edge = tri_of(edge);
    let paired = to_remove.paired_halfedge as usize;
    let tri1edge = tri_of(paired);

    let p_new = mesh.vert_pos[end_vert];
    let p_old = mesh.vert_pos[to_remove.start_vert as usize];
    let delta = p_new - p_old;
    let max_len = if (end_vert as i32) < first_new_vert {
        tol * tol
    } else {
        mesh.epsilon * mesh.epsilon
    };
    let short_edge = dot(delta, delta) < max_len;

    // Orbit startVert: check that collapse does not invert any triangle
    let start_orb = mesh.halfedge[tri1edge[1]].paired_halfedge;
    if start_orb < 0 {
        return false;
    }
    let mut start = start_orb as usize;
    let mut current;

    if !short_edge {
        current = start;
        let mut ref_check = mesh.mesh_relation.tri_ref[paired / 3];
        let mut p_last = mesh.vert_pos[mesh.halfedge[tri1edge[1]].end_vert as usize];

        while current != tri1edge[0] {
            current = next_halfedge(current as i32) as usize;
            let p_next = mesh.vert_pos[mesh.halfedge[current].end_vert as usize];
            let tri = current / 3;
            let ref_tri = mesh.mesh_relation.tri_ref[tri];
            let projection = get_axis_aligned_projection(mesh.face_normal[tri]);

            // Don't collapse if the edge is not redundant (this may have changed
            // due to the collapse of neighbors).
            if !ref_tri.same_face(&ref_check) {
                let old_ref = ref_check;
                ref_check = mesh.mesh_relation.tri_ref[edge / 3];
                if !ref_tri.same_face(&ref_check) {
                    return false;
                }
                // Restrict collapse to colinear edges when the edge separates
                // faces or the edge is sharp.
                if ref_tri.mesh_id != old_ref.mesh_id
                    || ref_tri.face_id != old_ref.face_id
                    || dot(mesh.face_normal[paired / 3], mesh.face_normal[tri]) < -0.5
                {
                    let p_p_last = projection.apply(p_last);
                    let p_p_old = projection.apply(p_old);
                    let p_p_new = projection.apply(p_new);
                    // Per #1671: this colinear-restrict check uses `tol` (the
                    // triangle-inversion CCW below stays at epsilon).
                    if ccw(p_p_last, p_p_old, p_p_new, tol) != 0 {
                        return false;
                    }
                }
            }

            // Don't collapse edge if it would cause a triangle to invert.
            if ccw(projection.apply(p_next), projection.apply(p_last),
                   projection.apply(p_new), mesh.epsilon) < 0 {
                return false;
            }

            p_last = p_next;
            let pair = mesh.halfedge[current].paired_halfedge;
            if pair < 0 {
                break;
            }
            current = pair as usize;
        }
    }

    // Orbit endVert: collect edges that share endVert (for loop detection)
    {
        let mut cur = mesh.halfedge[tri0edge[1]].paired_halfedge as usize;
        while cur != tri1edge[2] {
            cur = next_halfedge(cur as i32) as usize;
            scratch.push(cur);
            let pair = mesh.halfedge[cur].paired_halfedge;
            if pair < 0 {
                break;
            }
            cur = pair as usize;
        }
    }

    // Remove startVert: mark position NaN
    mesh.vert_pos[to_remove.start_vert as usize] = Vec3::new(f64::NAN, f64::NAN, f64::NAN);
    collapse_tri(&mut mesh.halfedge, tri1edge);

    // Orbit startVert and update to endVert; detect and break loops
    current = start;
    while current != tri0edge[2] {
        current = next_halfedge(current as i32) as usize;

        // Update propVert for property meshes. C++ is an else-if chain: when a
        // triangle matches BOTH tri0's and tri1's face group, only tri0's prop
        // is taken.
        if mesh.num_prop > 0 && !mesh.mesh_relation.tri_ref.is_empty() {
            let tri = current / 3;
            if tri < mesh.mesh_relation.tri_ref.len() {
                let ref_tri = mesh.mesh_relation.tri_ref[tri];
                if ref_tri.same_face(&mesh.mesh_relation.tri_ref[edge / 3]) {
                    let prop_v = mesh.halfedge[next_halfedge(edge as i32) as usize].prop_vert;
                    mesh.halfedge[current].prop_vert = prop_v;
                } else if ref_tri.same_face(&mesh.mesh_relation.tri_ref[paired / 3]) {
                    let prop_v = mesh.halfedge[paired].prop_vert;
                    mesh.halfedge[current].prop_vert = prop_v;
                }
            }
        }

        let vert = mesh.halfedge[current].end_vert;
        let next_pair = mesh.halfedge[current].paired_halfedge;
        let next_edge = if next_pair >= 0 { next_pair as usize } else { break };

        // Check if this creates a loop (edge to an already-encountered vert)
        let mut formed_loop = false;
        for k in 0..scratch.len() {
            if vert == mesh.halfedge[scratch[k]].end_vert {
                form_loop(mesh, scratch[k], current);
                start = next_edge;
                scratch.truncate(k);
                current = next_edge;
                formed_loop = true;
                break;
            }
        }
        if formed_loop {
            continue;
        }

        current = next_edge;
    }

    update_vert(mesh, end_vert as i32, start, tri0edge[2]);
    collapse_tri(&mut mesh.halfedge, tri0edge);
    remove_if_folded(mesh, start);
    true
}

// -----------------------------------------------------------------------
// RecursiveEdgeSwap
// -----------------------------------------------------------------------

/// Swaps the long edge of a degenerate triangle with its neighbor, propagating
/// the swap recursively as needed.
pub fn recursive_edge_swap(
    mesh: &mut ManifoldImpl,
    edge: i32,
    // C++ takes `int& tag` and increments it in the facing-degenerates branch;
    // the increment must persist into the caller's stack-drain loop so edges
    // visited before a collapse can be re-processed after it.
    tag: &mut i32,
    visited: &mut Vec<i32>,
    edge_swap_stack: &mut Vec<i32>,
    scratch: &mut Vec<usize>,
) {
    // C++ guards `if (edge < 0) return;` first — the normal-swap path pushes
    // paired-halfedge values that can legitimately be -1, and the stack stores
    // them as-is (int). Keeping the stack/param as i32 preserves that sentinel
    // instead of wrapping -1 to usize::MAX and indexing out of bounds.
    if edge < 0 {
        return;
    }
    let edge = edge as usize;
    if mesh.halfedge[edge].paired_halfedge < 0 {
        return;
    }
    let pair = mesh.halfedge[edge].paired_halfedge as usize;

    // Avoid infinite recursion via visited tag
    if visited.get(edge) == Some(&*tag) && visited.get(pair) == Some(&*tag) {
        return;
    }

    let tri0edge = tri_of(edge);
    let tri1edge = tri_of(pair);

    if edge / 3 >= mesh.face_normal.len() || pair / 3 >= mesh.face_normal.len() {
        return;
    }

    let proj0 = get_axis_aligned_projection(mesh.face_normal[edge / 3]);
    let mut v = [Vec2::new(0.0, 0.0); 4];
    for i in 0..3 {
        let sv = mesh.halfedge[tri0edge[i]].start_vert as usize;
        if sv < mesh.vert_pos.len() {
            v[i] = proj0.apply(mesh.vert_pos[sv]);
        }
    }

    // Only operate on the long edge of a degenerate triangle
    if ccw(v[0], v[1], v[2], mesh.tolerance) > 0 || !is_01_longest(v[0], v[1], v[2]) {
        return;
    }

    // Switch to neighbor's projection
    let proj1 = get_axis_aligned_projection(mesh.face_normal[pair / 3]);
    for i in 0..3 {
        let sv = mesh.halfedge[tri0edge[i]].start_vert as usize;
        if sv < mesh.vert_pos.len() {
            v[i] = proj1.apply(mesh.vert_pos[sv]);
        }
    }
    let sv3 = mesh.halfedge[tri1edge[2]].start_vert as usize;
    if sv3 < mesh.vert_pos.len() {
        v[3] = proj1.apply(mesh.vert_pos[sv3]);
    }

    // Swap edge logic
    let do_swap = |mesh: &mut ManifoldImpl| {
        let v0 = mesh.halfedge[tri0edge[2]].start_vert;
        let v1 = mesh.halfedge[tri1edge[2]].start_vert;
        mesh.halfedge[tri0edge[0]].start_vert = v1;
        mesh.halfedge[tri0edge[2]].end_vert = v1;
        mesh.halfedge[tri1edge[0]].start_vert = v0;
        mesh.halfedge[tri1edge[2]].end_vert = v0;
        let tri1e2_paired = mesh.halfedge[tri1edge[2]].paired_halfedge as usize;
        let tri0e2_paired = mesh.halfedge[tri0edge[2]].paired_halfedge as usize;
        pair_up(&mut mesh.halfedge, tri0edge[0], tri1e2_paired);
        pair_up(&mut mesh.halfedge, tri1edge[0], tri0e2_paired);
        pair_up(&mut mesh.halfedge, tri0edge[2], tri1edge[2]);

        let tri0 = tri0edge[0] / 3;
        let tri1 = tri1edge[0] / 3;
        if tri1 < mesh.face_normal.len() && tri0 < mesh.face_normal.len() {
            mesh.face_normal[tri0] = mesh.face_normal[tri1];
        }
        if tri1 < mesh.mesh_relation.tri_ref.len() && tri0 < mesh.mesh_relation.tri_ref.len() {
            mesh.mesh_relation.tri_ref[tri0] = mesh.mesh_relation.tri_ref[tri1];
        }
        // Update properties if applicable. Mirrors the C++ assignment order:
        // tri0's props are copied from tri1's ORIGINAL props first, then the
        // interpolated new prop vert replaces tri1edge[0]/tri0edge[2].
        if !mesh.properties.is_empty() {
            let num_prop = mesh.num_prop;
            let l01 = length2_2(v[1] - v[0]).sqrt();
            let l02 = length2_2(v[2] - v[0]).sqrt();
            let a = (l02 / l01).clamp(0.0, 1.0);
            mesh.halfedge[tri0edge[1]].prop_vert = mesh.halfedge[tri1edge[0]].prop_vert;
            mesh.halfedge[tri0edge[0]].prop_vert = mesh.halfedge[tri1edge[2]].prop_vert;
            mesh.halfedge[tri0edge[2]].prop_vert = mesh.halfedge[tri1edge[2]].prop_vert;
            let new_prop = (mesh.properties.len() / num_prop) as i32;
            let idx0 = mesh.halfedge[tri1edge[0]].prop_vert as usize;
            let idx1 = mesh.halfedge[tri1edge[1]].prop_vert as usize;
            for p in 0..num_prop {
                let val = a * mesh.properties[num_prop * idx0 + p]
                    + (1.0 - a) * mesh.properties[num_prop * idx1 + p];
                mesh.properties.push(val);
            }
            mesh.halfedge[tri1edge[0]].prop_vert = new_prop;
            mesh.halfedge[tri0edge[2]].prop_vert = new_prop;
        }

        // If the new (swapped) edge already exists elsewhere, the swap has
        // created a duplicate edge. Duplicate the verts and split the mesh the
        // other way so the result stays manifold. Omitting this (as the Rust
        // port previously did) leaves a non-manifold edge that later trips
        // collapse_edge/update_vert into walking an unpaired (-1) halfedge.
        // `current` is kept as i32 to mirror the C++ `int` orbit exactly.
        let end_vert = mesh.halfedge[tri1edge[1]].end_vert;
        let mut current = mesh.halfedge[tri1edge[0]].paired_halfedge;
        while current != tri0edge[1] as i32 {
            current = next_halfedge(current);
            if mesh.halfedge[current as usize].end_vert == end_vert {
                form_loop(mesh, tri0edge[2], current as usize);
                remove_if_folded(mesh, tri0edge[2]);
                return;
            }
            current = mesh.halfedge[current as usize].paired_halfedge;
        }
    };

    if ccw(v[1], v[0], v[3], mesh.tolerance) <= 0 {
        if !is_01_longest(v[1], v[0], v[3]) {
            return;
        }
        // Two facing long-edge degenerates can swap
        do_swap(mesh);
        let e23 = v[3] - v[2];
        if dot2(e23, e23) < mesh.tolerance * mesh.tolerance {
            // Also collapse the resulting short edge. C++ bumps the tag here so
            // previously-visited edges become re-processable after the mesh
            // changed under them.
            *tag += 1;
            let _ = collapse_edge(mesh, tri0edge[2], scratch, -1.0, 0);
            scratch.clear();
        } else {
            if edge < visited.len() { visited[edge] = *tag; }
            if pair < visited.len() { visited[pair] = *tag; }
            for &e in &[tri1edge[1], tri1edge[0], tri0edge[1], tri0edge[0]] {
                edge_swap_stack.push(e as i32);
            }
        }
    } else if ccw(v[0], v[3], v[2], mesh.tolerance) <= 0
        || ccw(v[1], v[2], v[3], mesh.tolerance) <= 0
    {
        return;
    } else {
        // Normal swap path
        do_swap(mesh);
        if edge < visited.len() { visited[edge] = *tag; }
        if pair < visited.len() { visited[pair] = *tag; }
        // These pair lookups can be -1; C++ pushes them as-is and relies on the
        // `edge < 0` guard at the top of the next call to skip them.
        let p1 = mesh.halfedge[tri1edge[0]].paired_halfedge;
        let p2 = mesh.halfedge[tri0edge[1]].paired_halfedge;
        edge_swap_stack.push(p1);
        edge_swap_stack.push(p2);
    }
}

// -----------------------------------------------------------------------
// SplitPinchedVerts
// -----------------------------------------------------------------------

/// Finds vertices where multiple halfedge cycles meet (pinched verts) and
/// splits them into separate vertices — one per cycle.
pub fn split_pinched_verts(mesh: &mut ManifoldImpl) {
    let n_edges = mesh.halfedge.len();
    let mut vert_processed = vec![false; mesh.vert_pos.len()];
    let mut halfedge_processed = vec![false; n_edges];

    let mut i = 0;
    while i < n_edges {
        if halfedge_processed[i] {
            i += 1;
            continue;
        }
        let vert = mesh.halfedge[i].start_vert;
        if vert < 0 {
            i += 1;
            continue;
        }
        let vert = vert as usize;
        if vert_processed.get(vert) == Some(&true) {
            // Pinched: create a new vertex for this cycle.
            // ForVert(i, ...) visits all edges in the orbit using the step:
            //   current = next_halfedge(halfedge[current].paired_halfedge)
            let new_pos = mesh.vert_pos[vert];
            mesh.vert_pos.push(new_pos);
            let new_vert = (mesh.vert_pos.len() - 1) as i32;
            let mut current = i;
            loop {
                let paired = mesh.halfedge[current].paired_halfedge;
                if paired < 0 { break; }
                current = next_halfedge(paired) as usize;
                if current >= halfedge_processed.len() { break; }
                halfedge_processed[current] = true;
                mesh.halfedge[current].start_vert = new_vert;
                let curr_paired = mesh.halfedge[current].paired_halfedge;
                if curr_paired >= 0 {
                    mesh.halfedge[curr_paired as usize].end_vert = new_vert;
                }
                if current == i { break; }
            }
        } else {
            // First time seeing this vert: mark cycle as processed.
            if vert < vert_processed.len() {
                vert_processed[vert] = true;
            }
            let mut current = i;
            loop {
                let paired = mesh.halfedge[current].paired_halfedge;
                if paired < 0 { break; }
                current = next_halfedge(paired) as usize;
                if current >= halfedge_processed.len() { break; }
                halfedge_processed[current] = true;
                if current == i { break; }
            }
        }
        i += 1;
    }
}

// -----------------------------------------------------------------------
// DedupeEdges / DedupeEdge
// -----------------------------------------------------------------------

/// Fixes 4-manifold edges (where two pairs of triangles share the same edge)
/// by duplicating one endpoint vertex and splitting the topology.
pub fn dedupe_edge(mesh: &mut ManifoldImpl, edge: usize) {
    let start_vert = mesh.halfedge[edge].start_vert;
    let end_vert = mesh.halfedge[edge].end_vert;
    let end_prop = mesh.halfedge[next_halfedge(edge as i32) as usize].prop_vert;

    let paired = mesh.halfedge[edge].paired_halfedge;
    if paired < 0 {
        return;
    }
    let next_paired = mesh.halfedge[next_halfedge(edge as i32) as usize].paired_halfedge;
    if next_paired < 0 {
        return;
    }
    let mut current = next_paired as usize;

    while current != edge {
        let vert = mesh.halfedge[current].start_vert;
        if vert == start_vert {
            // Single topological unit: need to add 2 triangles
            let new_vert = mesh.vert_pos.len() as i32;
            mesh.vert_pos.push(mesh.vert_pos[end_vert as usize]);
            // C++ advances current BEFORE building triangles:
            // current = halfedge_[NextHalfedge(current)].pairedHalfedge;
            let next_p = mesh.halfedge[next_halfedge(current as i32) as usize].paired_halfedge;
            if next_p < 0 { break; }
            current = next_p as usize;
            let opp_p = mesh.halfedge[next_halfedge(edge as i32) as usize].paired_halfedge;
            if opp_p < 0 { break; }
            let opposite = opp_p as usize;

            update_vert(mesh, new_vert, current, opposite);

            let new_he = mesh.halfedge.len();
            let old_face = current / 3;
            let outside_vert = mesh.halfedge[current].start_vert;
            mesh.halfedge.push(Halfedge { start_vert: end_vert, end_vert: new_vert, paired_halfedge: -1, prop_vert: end_prop });
            mesh.halfedge.push(Halfedge { start_vert: new_vert, end_vert: outside_vert, paired_halfedge: -1, prop_vert: end_prop });
            let curr_prop_vert = mesh.halfedge[current].prop_vert;
            let curr_paired = mesh.halfedge[current].paired_halfedge as usize;
            mesh.halfedge.push(Halfedge { start_vert: outside_vert, end_vert: end_vert, paired_halfedge: -1, prop_vert: curr_prop_vert });
            pair_up(&mut mesh.halfedge, new_he + 2, curr_paired);
            pair_up(&mut mesh.halfedge, new_he + 1, current);
            if !mesh.mesh_relation.tri_ref.is_empty() {
                let tri_ref_copy = mesh.mesh_relation.tri_ref[old_face];
                mesh.mesh_relation.tri_ref.push(tri_ref_copy);
            }
            if !mesh.face_normal.is_empty() {
                let fn_copy = mesh.face_normal[old_face];
                mesh.face_normal.push(fn_copy);
            }

            let new_he2 = new_he + 3;
            let old_face2 = opposite / 3;
            let outside_vert2 = mesh.halfedge[opposite].start_vert;
            mesh.halfedge.push(Halfedge { start_vert: new_vert, end_vert: end_vert, paired_halfedge: -1, prop_vert: end_prop });
            mesh.halfedge.push(Halfedge { start_vert: end_vert, end_vert: outside_vert2, paired_halfedge: -1, prop_vert: end_prop });
            let opp_prop_vert = mesh.halfedge[opposite].prop_vert;
            let opp_paired = mesh.halfedge[opposite].paired_halfedge as usize;
            mesh.halfedge.push(Halfedge { start_vert: outside_vert2, end_vert: new_vert, paired_halfedge: -1, prop_vert: opp_prop_vert });
            pair_up(&mut mesh.halfedge, new_he2 + 2, opp_paired);
            pair_up(&mut mesh.halfedge, new_he2 + 1, opposite);
            pair_up(&mut mesh.halfedge, new_he2, new_he);
            if !mesh.mesh_relation.tri_ref.is_empty() {
                let tri_ref_copy = mesh.mesh_relation.tri_ref[old_face2];
                mesh.mesh_relation.tri_ref.push(tri_ref_copy);
            }
            if !mesh.face_normal.is_empty() {
                let fn_copy = mesh.face_normal[old_face2];
                mesh.face_normal.push(fn_copy);
            }
            break;
        }
        let orbit_p = mesh.halfedge[next_halfedge(current as i32) as usize].paired_halfedge;
        if orbit_p < 0 { break; }
        current = orbit_p as usize;
    }

    if current == edge {
        // Separate topological unit: no new faces needed, just duplicate the vert
        let new_vert = mesh.vert_pos.len() as i32;
        mesh.vert_pos.push(mesh.vert_pos[end_vert as usize]);
        // ForVert(NextHalfedge(current), ...) to update all orbit halfedges to new_vert
        let start = next_halfedge(current as i32) as usize;
        let mut cur = start;
        loop {
            mesh.halfedge[cur].start_vert = new_vert;
            let paired_cur = mesh.halfedge[cur].paired_halfedge;
            if paired_cur < 0 { break; }
            mesh.halfedge[paired_cur as usize].end_vert = new_vert;
            // ForVert step: next_halfedge(halfedge[cur].paired_halfedge)
            cur = next_halfedge(paired_cur) as usize;
            if cur == start { break; }
        }
    }

    // Orbit startVert - check if endVert is pinched
    let pair = mesh.halfedge[edge].paired_halfedge;
    if pair < 0 { return; }
    let pair = pair as usize;
    let cur = mesh.halfedge[next_halfedge(pair as i32) as usize].paired_halfedge;
    if cur < 0 { return; }
    let mut cur = cur as usize;
    while cur != pair {
        let v = mesh.halfedge[cur].start_vert;
        if v == end_vert {
            return; // Connected: not a pinched vert
        }
        let p = mesh.halfedge[next_halfedge(cur as i32) as usize].paired_halfedge;
        if p < 0 { break; }
        cur = p as usize;
    }

    if cur == pair {
        // Split the new pinched vert using ForVert
        let new_vert2 = mesh.vert_pos.len() as i32;
        mesh.vert_pos.push(mesh.vert_pos[end_vert as usize]);
        let s2 = next_halfedge(cur as i32) as usize;
        let mut c2 = s2;
        loop {
            mesh.halfedge[c2].start_vert = new_vert2;
            let paired_c2 = mesh.halfedge[c2].paired_halfedge;
            if paired_c2 < 0 { break; }
            mesh.halfedge[paired_c2 as usize].end_vert = new_vert2;
            c2 = next_halfedge(paired_c2) as usize;
            if c2 == s2 { break; }
        }
    }
}

/// Finds and fixes all duplicate edges (4-manifold conditions).
pub fn dedupe_edges(mesh: &mut ManifoldImpl) {
    let max_iterations = mesh.halfedge.len(); // safety bound
    for _iteration in 0..max_iterations {
        let n_edges = mesh.halfedge.len();
        let mut processed = vec![false; n_edges];
        let mut duplicates: Vec<usize> = Vec::new();

        for i in 0..n_edges {
            if processed[i] { continue; }
            let sv = mesh.halfedge[i].start_vert;
            let ev = mesh.halfedge[i].end_vert;
            if sv < 0 || ev < 0 { continue; }

            // Track all endVerts seen in this vertex's orbit, keeping smallest edge idx.
            // Uses ForVert traversal: current = next_halfedge(halfedge[current].paired_halfedge)
            let mut end_verts: Vec<(i32, usize)> = Vec::new(); // (endVert, min_edge_idx)
            // Process i itself first
            processed[i] = true;
            let c_ev0 = mesh.halfedge[i].end_vert;
            if c_ev0 >= 0 { end_verts.push((c_ev0, i)); }
            // Then orbit (with safety bound to prevent infinite loops)
            let mut current = i;
            let mut orbit_steps = 0;
            loop {
                let pair = mesh.halfedge[current].paired_halfedge;
                if pair < 0 { break; }
                current = next_halfedge(pair) as usize;
                if current == i { break; }
                orbit_steps += 1;
                if orbit_steps > n_edges { break; } // safety
                processed[current] = true;
                let c_sv = mesh.halfedge[current].start_vert;
                let c_ev = mesh.halfedge[current].end_vert;
                if c_sv >= 0 && c_ev >= 0 {
                    if let Some(entry) = end_verts.iter_mut().find(|(v, _)| *v == c_ev) {
                        if current < entry.1 { entry.1 = current; }
                    } else {
                        end_verts.push((c_ev, current));
                    }
                }
            }

            // Second pass: find edges that aren't the minimum for their endVert
            let c_ev0 = mesh.halfedge[i].end_vert;
            if c_ev0 >= 0 {
                if let Some(&(_, min_edge)) = end_verts.iter().find(|(v, _)| *v == c_ev0) {
                    if min_edge != i { duplicates.push(i); }
                }
            }
            current = i;
            orbit_steps = 0;
            loop {
                let pair = mesh.halfedge[current].paired_halfedge;
                if pair < 0 { break; }
                current = next_halfedge(pair) as usize;
                if current == i { break; }
                orbit_steps += 1;
                if orbit_steps > n_edges { break; } // safety
                let c_ev = mesh.halfedge[current].end_vert;
                if c_ev >= 0 {
                    if let Some(&(_, min_edge)) = end_verts.iter().find(|(v, _)| *v == c_ev) {
                        if min_edge != current {
                            duplicates.push(current);
                        }
                    }
                }
            }
        }

        if duplicates.is_empty() { break; }
        for &dup in &duplicates {
            dedupe_edge(mesh, dup);
        }
    }
}

// -----------------------------------------------------------------------
// CleanupTopology / SimplifyTopology / RemoveDegenerates
// -----------------------------------------------------------------------

/// Coerces an even-manifold into a proper 2-manifold by splitting
/// non-manifold verts and deduplicating edges.
pub fn cleanup_topology(mesh: &mut ManifoldImpl) {
    if mesh.halfedge.is_empty() { return; }
    split_pinched_verts(mesh);
    dedupe_edges(mesh);
}

/// Collapses short edges and colinear edges, and swaps degenerate edge diagonals.
/// `first_new_vert` constrains which verts can be collapsed.
pub fn simplify_topology(mesh: &mut ManifoldImpl, first_new_vert: i32) {
    if mesh.halfedge.is_empty() { return; }
    cleanup_topology(mesh);
    collapse_short_edges(mesh, first_new_vert);
    collapse_colinear_edges(mesh, first_new_vert);
    swap_degenerates(mesh, first_new_vert);
    calculate_vert_normals(mesh);
}

/// Like simplify_topology but without colinear-edge collapse.
pub fn remove_degenerates(mesh: &mut ManifoldImpl, first_new_vert: i32) {
    if mesh.halfedge.is_empty() { return; }
    cleanup_topology(mesh);
    collapse_short_edges(mesh, first_new_vert);
    swap_degenerates(mesh, first_new_vert);
    calculate_vert_normals(mesh);
}

/// Collapses edges shorter than epsilon_ when at least one endpoint is new.
pub fn collapse_short_edges(mesh: &mut ManifoldImpl, first_new_vert: i32) {
    let mut scratch = Vec::with_capacity(10);
    let n = mesh.halfedge.len();
    let mut flagged: Vec<usize> = Vec::new();

    // Manifold 3.4.1 restricts short-edge collapse to epsilon even inside a
    // Boolean. Tolerance is larger for float input and controls degeneracy
    // predicates; using it here can remove a thin, valid solid.
    let tol = mesh.epsilon;

    for i in 0..n {
        let h = &mesh.halfedge[i];
        if h.paired_halfedge < 0 { continue; }
        if h.start_vert < first_new_vert && h.end_vert < first_new_vert { continue; }
        if h.start_vert < 0 || h.end_vert < 0 { continue; }
        let delta = mesh.vert_pos[h.end_vert as usize] - mesh.vert_pos[h.start_vert as usize];
        let len_sq = dot(delta, delta);
        if len_sq < tol * tol {
            flagged.push(i);
        }
    }

    for &i in &flagged {
        scratch.clear();
        collapse_edge(mesh, i, &mut scratch, tol, first_new_vert);
    }
}

/// Collapses redundant colinear edges (edges where the start vertex touches only
/// two distinct face groups).
pub fn collapse_colinear_edges(mesh: &mut ManifoldImpl, first_new_vert: i32) {
    let mut scratch = Vec::with_capacity(10);
    loop {
        let n = mesh.halfedge.len();
        let mut flagged: Vec<usize> = Vec::new();

        for i in 0..n {
            let h = &mesh.halfedge[i];
            if h.paired_halfedge < 0 || h.start_vert < first_new_vert { continue; }
            if h.start_vert < 0 { continue; }
            if mesh.mesh_relation.tri_ref.is_empty() { continue; }
            if i / 3 >= mesh.mesh_relation.tri_ref.len() { continue; }

            let ref0 = mesh.mesh_relation.tri_ref[i / 3];
            let mut current = next_halfedge(mesh.halfedge[i].paired_halfedge) as usize;
            if current >= mesh.halfedge.len() { continue; }
            let mut ref1 = if current / 3 < mesh.mesh_relation.tri_ref.len() {
                mesh.mesh_relation.tri_ref[current / 3]
            } else {
                continue
            };
            let mut ref1_updated = !ref0.same_face(&ref1);

            let mut is_redundant = true;
            let max_orbit = mesh.halfedge.len(); // orbit can't exceed total halfedges
            let mut orbit_count = 0;
            while current != i {
                orbit_count += 1;
                if orbit_count > max_orbit {
                    is_redundant = false;
                    break;
                }
                // FlagEdge traversal: current = NextHalfedge(halfedge[current].pairedHalfedge)
                let pair = mesh.halfedge[current].paired_halfedge;
                if pair < 0 { is_redundant = false; break; }
                current = next_halfedge(pair) as usize;
                if current >= mesh.halfedge.len() { is_redundant = false; break; }
                let tri = current / 3;
                if tri >= mesh.mesh_relation.tri_ref.len() { is_redundant = false; break; }
                let ref_cur = mesh.mesh_relation.tri_ref[tri];
                if !ref_cur.same_face(&ref0) && !ref_cur.same_face(&ref1) {
                    if !ref1_updated {
                        ref1 = ref_cur;
                        ref1_updated = true;
                    } else {
                        is_redundant = false;
                        break;
                    }
                }
            }
            if is_redundant {
                flagged.push(i);
            }
        }

        if flagged.is_empty() { break; }
        let mut num_collapsed = 0;
        for &i in &flagged {
            scratch.clear();
            if collapse_edge(mesh, i, &mut scratch, -1.0, 0) {
                num_collapsed += 1;
            }
        }
        if num_collapsed == 0 { break; }
    }
}

/// Swaps long edges of degenerate triangles.
pub fn swap_degenerates(mesh: &mut ManifoldImpl, first_new_vert: i32) {
    if mesh.face_normal.is_empty() { return; }

    let n = mesh.halfedge.len();
    let mut flagged: Vec<usize> = Vec::new();

    for i in 0..n {
        let h = &mesh.halfedge[i];
        if h.paired_halfedge < 0 { continue; }
        // Skip edges where all 4 involved verts are old
        let tri0edge = tri_of(i);
        let pair = h.paired_halfedge as usize;
        let tri1edge = tri_of(pair);
        if mesh.halfedge[i].start_vert < first_new_vert
            && mesh.halfedge[i].end_vert < first_new_vert
            && mesh.halfedge[next_halfedge(i as i32) as usize].end_vert < first_new_vert
            && mesh.halfedge[next_halfedge(pair as i32) as usize].end_vert < first_new_vert
        {
            continue;
        }
        let tri = i / 3;
        if tri >= mesh.face_normal.len() { continue; }
        let proj = get_axis_aligned_projection(mesh.face_normal[tri]);
        let mut v = [Vec2::new(0.0, 0.0); 3];
        for j in 0..3 {
            let sv = mesh.halfedge[tri0edge[j]].start_vert;
            if sv >= 0 && (sv as usize) < mesh.vert_pos.len() {
                v[j] = proj.apply(mesh.vert_pos[sv as usize]);
            }
        }
        if ccw(v[0], v[1], v[2], mesh.tolerance) > 0 || !is_01_longest(v[0], v[1], v[2]) {
            continue;
        }
        // Switch to the neighbor's projection — C++ projects the PAIR
        // triangle's verts (pairTriEdge), not tri0's.
        let tri_p = pair / 3;
        if tri_p >= mesh.face_normal.len() { continue; }
        let proj_p = get_axis_aligned_projection(mesh.face_normal[tri_p]);
        for j in 0..3 {
            let sv = mesh.halfedge[tri1edge[j]].start_vert;
            if sv >= 0 && (sv as usize) < mesh.vert_pos.len() {
                v[j] = proj_p.apply(mesh.vert_pos[sv as usize]);
            }
        }
        if ccw(v[0], v[1], v[2], mesh.tolerance) > 0 || is_01_longest(v[0], v[1], v[2]) {
            flagged.push(i);
        }
    }

    let mut visited = vec![-1i32; n];
    let mut edge_swap_stack: Vec<i32> = Vec::new();
    let mut scratch: Vec<usize> = Vec::new();
    let mut tag = 0i32;

    for &i in &flagged {
        tag += 1;
        recursive_edge_swap(mesh, i as i32, &mut tag, &mut visited, &mut edge_swap_stack, &mut scratch);
        while let Some(e) = edge_swap_stack.pop() {
            recursive_edge_swap(mesh, e, &mut tag, &mut visited, &mut edge_swap_stack, &mut scratch);
        }
    }
}

// -----------------------------------------------------------------------
#[cfg(test)]
#[path = "edge_op_tests.rs"]
mod tests;
