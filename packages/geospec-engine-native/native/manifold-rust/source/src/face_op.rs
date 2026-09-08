// face_op.rs — Phase 7a: Face normals, coplanarity, vertex normals
//
// Ports src/face_op.cpp, the face-normal and coplanarity portions of
// src/impl.cpp (SetNormalsAndCoplanar, CalculateVertNormals), and the
// GetAxisAlignedProjection utility from src/shared.h.

use std::collections::BTreeMap;

use crate::linalg::{Vec2, Vec3, cross, dot, normalize, length2};
use crate::math;
use crate::types::{next_halfedge, Halfedge, PolyVert, PolygonsIdx};
use crate::impl_mesh::ManifoldImpl;

// -----------------------------------------------------------------------
// Proj2x3 — 2-row, 3-column projection matrix (drops one axis)
//
// Used to project 3D mesh positions onto a 2D plane for CCW tests and
// triangulation. Mirrors `mat2x3` in the C++ linalg.h library.
// -----------------------------------------------------------------------

/// A 2×3 projection matrix: maps Vec3 → Vec2 via dot products with two rows.
#[derive(Clone, Copy, Debug)]
pub struct Proj2x3 {
    pub row0: Vec3,
    pub row1: Vec3,
}

impl Proj2x3 {
    /// Apply the projection: `[dot(row0, v), dot(row1, v)]`.
    #[inline]
    pub fn apply(&self, v: Vec3) -> Vec2 {
        Vec2::new(dot(self.row0, v), dot(self.row1, v))
    }
}

// -----------------------------------------------------------------------
// GetAxisAlignedProjection
// -----------------------------------------------------------------------

/// Returns a projection matrix that drops the largest-magnitude axis of
/// `normal`, producing a 2D view aligned with the face plane.
///
/// Mirrors `GetAxisAlignedProjection` in `src/shared.h`.
pub fn get_axis_aligned_projection(normal: Vec3) -> Proj2x3 {
    let abs = Vec3::new(normal.x.abs(), normal.y.abs(), normal.z.abs());

    // mat3x2 columns (each col is a Vec3); transposed to get mat2x3 rows.
    let (row0, row1, xyz_max) = if abs.z > abs.x && abs.z > abs.y {
        // Drop Z, keep X and Y
        (Vec3::new(1.0, 0.0, 0.0), Vec3::new(0.0, 1.0, 0.0), normal.z)
    } else if abs.y > abs.x {
        // Drop Y, keep Z and X
        (Vec3::new(0.0, 0.0, 1.0), Vec3::new(1.0, 0.0, 0.0), normal.y)
    } else {
        // Drop X, keep Y and Z
        (Vec3::new(0.0, 1.0, 0.0), Vec3::new(0.0, 0.0, 1.0), normal.x)
    };

    // If the dominant axis is negative, flip the first row so that the
    // projected winding order is consistent.
    if xyz_max < 0.0 {
        Proj2x3 { row0: Vec3::new(-row0.x, -row0.y, -row0.z), row1 }
    } else {
        Proj2x3 { row0, row1 }
    }
}

// -----------------------------------------------------------------------
// SetNormalsAndCoplanar
// -----------------------------------------------------------------------

/// Computes face normals and flood-fills coplanar face groups, then
/// calls `calculate_vert_normals` to compute per-vertex normals.
///
/// Mirrors `Manifold::Impl::SetNormalsAndCoplanar()` in `src/impl.cpp`.
pub fn set_normals_and_coplanar(mesh: &mut ManifoldImpl) {
    let num_tri = mesh.num_tri();
    mesh.face_normal.resize(num_tri, Vec3::new(0.0, 0.0, 1.0));

    // Struct for sorting triangles by area
    struct TriPriority {
        area2: f64,
        tri: usize,
    }

    // Compute face normals and priorities (sort largest faces first)
    let mut tri_priority: Vec<TriPriority> = (0..num_tri)
        .map(|tri| {
            // Mark coplanarID as unset
            if tri < mesh.mesh_relation.tri_ref.len() {
                mesh.mesh_relation.tri_ref[tri].coplanar_id = -1;
            }

            if mesh.halfedge[3 * tri].start_vert < 0 {
                return TriPriority { area2: 0.0, tri };
            }
            let v = mesh.vert_pos[mesh.halfedge[3 * tri].start_vert as usize];
            let n = cross(
                mesh.vert_pos[mesh.halfedge[3 * tri].end_vert as usize] - v,
                mesh.vert_pos[mesh.halfedge[3 * tri + 1].end_vert as usize] - v,
            );
            let normal = normalize(n);
            mesh.face_normal[tri] = if normal.x.is_nan() {
                Vec3::new(0.0, 0.0, 1.0)
            } else {
                normal
            };
            TriPriority { area2: length2(n), tri }
        })
        .collect();

    // Sort by area descending (largest triangles first → better coplanar seeds)
    tri_priority.sort_by(|a, b| b.area2.partial_cmp(&a.area2).unwrap_or(std::cmp::Ordering::Equal));

    // Flood-fill coplanar groups from each unassigned face
    let mut interior_halfedges: Vec<usize> = Vec::new();
    for tp in &tri_priority {
        let tri = tp.tri;
        if tri >= mesh.mesh_relation.tri_ref.len() {
            continue;
        }
        if mesh.mesh_relation.tri_ref[tri].coplanar_id >= 0 {
            continue;
        }

        mesh.mesh_relation.tri_ref[tri].coplanar_id = tri as i32;
        if mesh.halfedge[3 * tri].start_vert < 0 {
            continue;
        }

        let base = mesh.vert_pos[mesh.halfedge[3 * tri].start_vert as usize];
        let normal = mesh.face_normal[tri];

        interior_halfedges.clear();
        interior_halfedges.push(3 * tri);
        interior_halfedges.push(3 * tri + 1);
        interior_halfedges.push(3 * tri + 2);

        while let Some(h) = interior_halfedges.pop() {
            let paired = mesh.halfedge[h].paired_halfedge;
            if paired < 0 {
                continue;
            }
            let h2 = next_halfedge(paired) as usize;
            let h2_tri = h2 / 3;
            if h2_tri >= mesh.mesh_relation.tri_ref.len() {
                continue;
            }
            if mesh.mesh_relation.tri_ref[h2_tri].coplanar_id >= 0 {
                continue;
            }

            let v = mesh.vert_pos[mesh.halfedge[h2].end_vert as usize];
            if (dot(v - base, normal)).abs() < mesh.tolerance {
                mesh.mesh_relation.tri_ref[h2_tri].coplanar_id = tri as i32;
                mesh.face_normal[h2_tri] = normal;

                // Avoid re-pushing paired interior halfedges (cancel out)
                let last = interior_halfedges.last().copied();
                if last == Some(mesh.halfedge[h2].paired_halfedge as usize) {
                    interior_halfedges.pop();
                } else {
                    interior_halfedges.push(h2 as usize);
                }
                interior_halfedges.push(next_halfedge(h2 as i32) as usize);
            }
        }
    }

    calculate_vert_normals(mesh);
}

// -----------------------------------------------------------------------
// CalculateVertNormals
// -----------------------------------------------------------------------

/// Computes per-vertex normals as angle-weighted averages of incident face normals.
///
/// Mirrors `Manifold::Impl::CalculateVertNormals()` in `src/impl.cpp`.
pub fn calculate_vert_normals(mesh: &mut ManifoldImpl) {
    let num_vert = mesh.vert_pos.len();
    mesh.vert_normal.resize(num_vert, Vec3::new(0.0, 0.0, 0.0));

    // For each vertex, find the first halfedge that starts there
    let mut vert_first_edge = vec![i32::MAX; num_vert];
    for (i, edge) in mesh.halfedge.iter().enumerate() {
        let sv = edge.start_vert;
        if sv >= 0 && (sv as usize) < num_vert {
            let sv = sv as usize;
            if (i as i32) < vert_first_edge[sv] {
                vert_first_edge[sv] = i as i32;
            }
        }
    }

    // Each vertex's normal reads only shared mesh data and its own walk, so
    // the per-vertex work parallelizes with results identical to sequential
    // (the accumulation order WITHIN a vertex is the fixed ForVert walk).
    let halfedge = &mesh.halfedge;
    let vert_pos = &mesh.vert_pos;
    let face_normal = &mesh.face_normal;
    let normals: Vec<Vec3> = crate::par::maybe_par_map(num_vert, 10_000, |vert| {
        let first_edge = vert_first_edge[vert];
        if first_edge == i32::MAX {
            return Vec3::new(0.0, 0.0, 0.0);
        }

        let mut normal = Vec3::new(0.0, 0.0, 0.0);

        // ForVert equivalent: walk CW around the vertex. C++ ForVert (impl.h)
        // STEPS FIRST and calls func after, so first_edge is processed LAST.
        // The visit order fixes the float accumulation order of the
        // angle-weighted normal sum — it must match C++ bit-for-bit because
        // vertex normals feed the Boolean3 SOS tie-breaks.
        let mut current = first_edge as usize;
        loop {
            let paired = halfedge[current].paired_halfedge;
            if paired < 0 {
                break;
            }
            current = next_halfedge(paired) as usize;
            let h = &halfedge[current];
            let tri_verts = [
                h.start_vert as usize,
                h.end_vert as usize,
                halfedge[next_halfedge(current as i32) as usize].end_vert as usize,
            ];

            // Avoid degenerate triangles
            if tri_verts[0] < vert_pos.len()
                && tri_verts[1] < vert_pos.len()
                && tri_verts[2] < vert_pos.len()
            {
                let curr_edge_dir = vert_pos[tri_verts[1]] - vert_pos[tri_verts[0]];
                let prev_edge_dir = vert_pos[tri_verts[0]] - vert_pos[tri_verts[2]];
                let curr_len = length2(curr_edge_dir).sqrt();
                let prev_len = length2(prev_edge_dir).sqrt();

                if curr_len > 0.0 && prev_len > 0.0 {
                    let curr_norm = curr_edge_dir / curr_len;
                    let prev_norm = prev_edge_dir / prev_len;
                    if curr_norm.x.is_finite() && prev_norm.x.is_finite() {
                        let d = dot(prev_norm, curr_norm).clamp(-1.0, 1.0);
                        // Negate because prevEdge points into vert and currEdge points away
                        let phi = math::acos(-d);
                        if phi.is_finite() && current / 3 < face_normal.len() {
                            normal = normal + face_normal[current / 3] * phi;
                        }
                    }
                }
            }

            if current == first_edge as usize {
                break;
            }
        }

        let len = length2(normal).sqrt();
        if len > 0.0 { normal / len } else { Vec3::new(0.0, 0.0, 0.0) }
    });
    mesh.vert_normal = normals;
}

// -----------------------------------------------------------------------
// GetBarycentric — barycentric coordinates of point in triangle
// -----------------------------------------------------------------------

/// Compute barycentric coordinates of `v` with respect to triangle `tri_pos`.
/// Returns [u, v, w] where vertex i has weight uvw[i].
/// Returns exact 1.0 for vertices within `tolerance` of a triangle vertex,
/// and exact 0.0 for points within tolerance of an edge.
///
/// Mirrors `GetBarycentric` in `src/shared.h`.
pub fn get_barycentric(v: Vec3, tri_pos: [Vec3; 3], tolerance: f64) -> Vec3 {
    let edges = [
        tri_pos[2] - tri_pos[1],
        tri_pos[0] - tri_pos[2],
        tri_pos[1] - tri_pos[0],
    ];
    let d2 = [
        dot(edges[0], edges[0]),
        dot(edges[1], edges[1]),
        dot(edges[2], edges[2]),
    ];
    let long_side = if d2[0] > d2[1] && d2[0] > d2[2] {
        0
    } else if d2[1] > d2[2] {
        1
    } else {
        2
    };
    let cross_p = cross(edges[0], edges[1]);
    let area2 = dot(cross_p, cross_p);
    let tol2 = tolerance * tolerance;

    let mut uvw = Vec3::splat(0.0);
    for i in 0..3 {
        let dv = v - tri_pos[i];
        if dot(dv, dv) < tol2 {
            uvw = Vec3::splat(0.0);
            match i {
                0 => uvw.x = 1.0,
                1 => uvw.y = 1.0,
                _ => uvw.z = 1.0,
            }
            return uvw;
        }
    }

    if d2[long_side] < tol2 {
        // Degenerate point
        return Vec3::new(1.0, 0.0, 0.0);
    } else if area2 > d2[long_side] * tol2 {
        // Triangle case
        for i in 0..3 {
            let j = (i + 1) % 3;
            let cross_pv = cross(edges[i], v - tri_pos[j]);
            let area2v = dot(cross_pv, cross_pv);
            let val = if area2v < d2[i] * tol2 {
                0.0
            } else {
                dot(cross_pv, cross_p)
            };
            match i {
                0 => uvw.x = val,
                1 => uvw.y = val,
                _ => uvw.z = val,
            }
        }
        let sum = uvw.x + uvw.y + uvw.z;
        uvw = uvw / sum;
        return uvw;
    } else {
        // Line case
        let next_v = (long_side + 1) % 3;
        let alpha = dot(v - tri_pos[next_v], edges[long_side]) / d2[long_side];
        uvw = Vec3::splat(0.0);
        let last_v = (next_v + 1) % 3;
        match next_v {
            0 => uvw.x = 1.0 - alpha,
            1 => uvw.y = 1.0 - alpha,
            _ => uvw.z = 1.0 - alpha,
        }
        match last_v {
            0 => uvw.x = alpha,
            1 => uvw.y = alpha,
            _ => uvw.z = alpha,
        }
        return uvw;
    }
}

// -----------------------------------------------------------------------
// AssembleHalfedges — group halfedges into polygon loops
// -----------------------------------------------------------------------

/// Given a slice of halfedges (from a polygonal face), group them into polygon
/// loops by following start_vert → end_vert chains. Returns a vec of polygon
/// loops, where each loop is a vec of halfedge indices (offset by
/// `start_halfedge_idx`).
///
/// Mirrors `AssembleHalfedges` in `src/face_op.cpp`.
pub fn assemble_halfedges(
    halfedges: &[Halfedge],
    start_halfedge_idx: i32,
) -> Vec<Vec<i32>> {
    // Build multimap: start_vert → local edge index
    let mut vert_edge: BTreeMap<i32, Vec<usize>> = BTreeMap::new();
    for (i, he) in halfedges.iter().enumerate() {
        vert_edge.entry(he.start_vert).or_default().push(i);
    }

    let mut polys: Vec<Vec<i32>> = Vec::new();
    let mut start_edge: usize = 0;
    let mut this_edge: usize = start_edge;

    loop {
        if this_edge == start_edge {
            // Find next unvisited edge
            if vert_edge.is_empty() {
                break;
            }
            let (&_vert, edges) = vert_edge.iter().next().unwrap();
            start_edge = edges[0];
            this_edge = start_edge;
            polys.push(Vec::new());
        }
        polys.last_mut().unwrap().push(start_halfedge_idx + this_edge as i32);
        let end_vert = halfedges[this_edge].end_vert;
        let edges = vert_edge.get_mut(&end_vert).expect("non-manifold edge");
        // Remove the first occurrence
        let pos = 0; // take first available
        this_edge = edges.remove(pos);
        if edges.is_empty() {
            vert_edge.remove(&end_vert);
        }
    }
    polys
}

/// Project polygon loops into 2D using projection matrix and vertex positions.
///
/// Mirrors `ProjectPolygons` in `src/face_op.cpp`.
pub fn project_polygons(
    polys: &[Vec<i32>],
    halfedge: &[Halfedge],
    vert_pos: &[Vec3],
    projection: &Proj2x3,
) -> PolygonsIdx {
    let mut polygons: PolygonsIdx = Vec::new();
    for poly in polys {
        let mut simple_poly = Vec::new();
        for &edge in poly {
            let vert = halfedge[edge as usize].start_vert;
            simple_poly.push(PolyVert {
                pos: projection.apply(vert_pos[vert as usize]),
                idx: edge,
            });
        }
        polygons.push(simple_poly);
    }
    polygons
}

// -----------------------------------------------------------------------
// Face2Tri — extracted to face_op_triangulate.rs
// -----------------------------------------------------------------------

#[path = "face_op_triangulate.rs"]
mod face_op_triangulate;
pub use face_op_triangulate::{face2tri, face2tri_ct};

// -----------------------------------------------------------------------
// ReorderHalfedges — canonical ordering within each triangle
// -----------------------------------------------------------------------

/// Reorders halfedges within each face so the one with the smallest start_vert
/// is first, then fixes paired_halfedge references.
///
/// Mirrors `Manifold::Impl::ReorderHalfedges` in `src/sort.cpp`.
pub fn reorder_halfedges(mesh: &mut ManifoldImpl) {
    let num_tri = mesh.halfedge.len() / 3;

    // Step 1: rotate each triangle so smallest start_vert is first
    for tri in 0..num_tri {
        let base = tri * 3;
        let face = [
            mesh.halfedge[base],
            mesh.halfedge[base + 1],
            mesh.halfedge[base + 2],
        ];
        if face[0].start_vert < 0 {
            continue;
        }
        let mut index = 0;
        for i in 1..3 {
            if face[i].start_vert < face[index].start_vert {
                index = i;
            }
        }
        for i in 0..3 {
            mesh.halfedge[base + i] = face[(index + i) % 3];
        }
    }

    // Step 2: fix paired_halfedge references
    for tri in 0..num_tri {
        for i in 0..3 {
            let base = tri * 3 + i;
            let curr = mesh.halfedge[base];
            if curr.start_vert < 0 {
                break; // skip collapsed triangle
            }
            if curr.paired_halfedge < 0 {
                continue; // unpaired halfedge
            }
            let opp_face = curr.paired_halfedge as usize / 3;
            let mut index = -1i32;
            for j in 0..3 {
                if curr.start_vert == mesh.halfedge[opp_face * 3 + j].end_vert {
                    index = j as i32;
                }
            }
            mesh.halfedge[base].paired_halfedge = opp_face as i32 * 3 + index;
        }
    }
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::Mat3x4;
    use crate::impl_mesh::ManifoldImpl;

    #[test]
    fn test_get_axis_aligned_projection_z() {
        // Normal primarily in Z: should project to XY plane
        let proj = get_axis_aligned_projection(Vec3::new(0.0, 0.0, 1.0));
        let v = Vec3::new(3.0, 4.0, 5.0);
        let p = proj.apply(v);
        assert!((p.x - 3.0).abs() < 1e-12);
        assert!((p.y - 4.0).abs() < 1e-12);
    }

    #[test]
    fn test_get_axis_aligned_projection_y() {
        // Normal primarily in Y: should project to ZX plane
        let proj = get_axis_aligned_projection(Vec3::new(0.0, 1.0, 0.0));
        let v = Vec3::new(3.0, 4.0, 5.0);
        let p = proj.apply(v);
        assert!((p.x - 5.0).abs() < 1e-12, "expected z=5, got {}", p.x);
        assert!((p.y - 3.0).abs() < 1e-12, "expected x=3, got {}", p.y);
    }

    #[test]
    fn test_get_axis_aligned_projection_x() {
        // Normal primarily in X: should project to YZ plane
        let proj = get_axis_aligned_projection(Vec3::new(1.0, 0.0, 0.0));
        let v = Vec3::new(3.0, 4.0, 5.0);
        let p = proj.apply(v);
        assert!((p.x - 4.0).abs() < 1e-12, "expected y=4, got {}", p.x);
        assert!((p.y - 5.0).abs() < 1e-12, "expected z=5, got {}", p.y);
    }

    #[test]
    fn test_get_axis_aligned_projection_negative_z() {
        // Normal primarily in -Z: row0 should be flipped
        let proj = get_axis_aligned_projection(Vec3::new(0.0, 0.0, -1.0));
        let v = Vec3::new(3.0, 4.0, 5.0);
        let p = proj.apply(v);
        // Flipped first row: x → -x
        assert!((p.x + 3.0).abs() < 1e-12, "expected -x=-3, got {}", p.x);
        assert!((p.y - 4.0).abs() < 1e-12);
    }

    #[test]
    fn test_set_normals_tetrahedron() {
        let mut m = ManifoldImpl::tetrahedron(&Mat3x4::identity());
        set_normals_and_coplanar(&mut m);
        // Every face normal should be unit length
        for n in &m.face_normal {
            let len = length2(*n).sqrt();
            assert!((len - 1.0).abs() < 1e-10, "face normal not unit: len={}", len);
        }
        // Every vert normal should be nonzero (tetrahedron has no degenerate verts)
        for n in &m.vert_normal {
            let len = length2(*n).sqrt();
            assert!(len > 0.0, "vert normal is zero");
        }
    }

    #[test]
    fn test_set_normals_cube() {
        let mut m = ManifoldImpl::cube(&Mat3x4::identity());
        set_normals_and_coplanar(&mut m);
        assert_eq!(m.face_normal.len(), m.num_tri());
        // Coplanar IDs should be assigned
        let any_coplanar_id_set = m.mesh_relation.tri_ref.iter()
            .any(|r| r.coplanar_id >= 0);
        assert!(any_coplanar_id_set, "no coplanar IDs were set");
    }
}

// -----------------------------------------------------------------------
// Slice & Project — cross-section operations on ManifoldImpl
// -----------------------------------------------------------------------

use crate::types::{Box as BBox, Polygons, SimplePolygon};

/// Worklist traversal of libc++'s integer unordered_set (Emscripten 5.0.2).
/// Slice inserts unique BVH leaves before erasing any. Preserve bucket growth,
/// insertion and rehash order here; never rotate or reorder emitted polygons.
fn slice_triangle_order(triangles: &[usize]) -> Vec<usize> {
    fn insert_before(links: &mut [[usize; 2]], node: usize, before: usize) {
        let previous = links[before][0];
        links[node] = [previous, before];
        links[previous][1] = node;
        links[before][0] = node;
    }

    fn unlink(links: &mut [[usize; 2]], node: usize) {
        let [previous, next] = links[node];
        links[previous][1] = next;
        links[next][0] = previous;
    }

    // Compact linked nodes, with a sentinel, avoid scanning/reordering a vector
    // on every insertion. Integer hashes are the triangle indices themselves.
    let end = triangles.len();
    let mut links = vec![[end, end]; end + 1];
    let mut buckets: Vec<usize> = Vec::new();
    for node in 0..triangles.len() {
        if node == buckets.len() {
            // Default load factor is one: 0 -> 2 -> 5 -> 11 -> 23 ... .
            let mut count = 2 * buckets.len() + 1;
            if count == 1 {
                count = 2;
            } else {
                while (2..).take_while(|d| *d <= count / *d).any(|d| count % d == 0) {
                    count += 2;
                }
            }
            buckets = vec![end; count];
            let mut current = links[end][1];
            let mut previous_bucket = count;
            while current != end {
                let next = links[current][1];
                let bucket = triangles[current] % count;
                if buckets[bucket] == end {
                    buckets[bucket] = current;
                    previous_bucket = bucket;
                } else if bucket != previous_bucket {
                    unlink(&mut links, current);
                    insert_before(&mut links, current, buckets[bucket]);
                    buckets[bucket] = current;
                }
                current = next;
            }
        }
        let bucket = triangles[node] % buckets.len();
        let before = if buckets[bucket] == end { links[end][1] } else { buckets[bucket] };
        insert_before(&mut links, node, before);
        buckets[bucket] = node;
    }

    let mut order = Vec::with_capacity(triangles.len());
    let mut current = links[end][1];
    while current != end {
        order.push(triangles[current]);
        current = links[current][1];
    }
    order
}

impl ManifoldImpl {
    /// Slice the mesh at the given Z height, returning 2D polygon loops.
    /// Mirrors `Manifold::Impl::Slice` in `src/face_op.cpp`.
    pub fn slice(&self, height: f64) -> Polygons {
        let num_tri = self.num_tri();
        if num_tri == 0 {
            return vec![];
        }

        // Build plane query box spanning the full XY extent at the given Z
        let mut plane = self.bbox;
        plane.min.z = height;
        plane.max.z = height;

        // Query the cached face BVH (C++ Slice uses collider_).
        let collider = &self.collider;

        // Find all triangles that straddle the slice plane
        let mut triangles = Vec::new();
        let query = vec![BBox::from_points(plane.min, plane.max)];
        collider.collisions_with_boxes(&query, false, |_query_idx, tri| {
            let mut min_z = f64::INFINITY;
            let mut max_z = f64::NEG_INFINITY;
            for j in 0..3 {
                let z = self.vert_pos[self.halfedge[3 * tri + j].start_vert as usize].z;
                min_z = min_z.min(z);
                max_z = max_z.max(z);
            }
            if min_z <= height && max_z > height {
                triangles.push(tri);
            }
        });

        // Trace polygon loops through intersected triangles
        let mut polys: Polygons = Vec::new();
        let mut remaining: std::collections::BTreeSet<_> = triangles.iter().copied().collect();
        for start_tri in slice_triangle_order(&triangles) {
            if !remaining.contains(&start_tri) {
                continue;
            }
            let mut poly: SimplePolygon = Vec::new();

            // Find the edge where the slice enters (above→below transition)
            let mut k = 0usize;
            for j in 0..3usize {
                let next_j = (j + 1) % 3;
                if self.vert_pos[self.halfedge[3 * start_tri + j].start_vert as usize].z > height
                    && self.vert_pos[self.halfedge[3 * start_tri + next_j].start_vert as usize].z <= height
                {
                    k = next_j;
                    break;
                }
            }

            let mut tri = start_tri;
            loop {
                remaining.remove(&tri);
                if self.vert_pos[self.halfedge[3 * tri + k].end_vert as usize].z <= height {
                    k = (k + 1) % 3;
                }

                let up = &self.halfedge[3 * tri + k];
                let below = self.vert_pos[up.start_vert as usize];
                let above = self.vert_pos[up.end_vert as usize];
                let a = (height - below.z) / (above.z - below.z);
                // lerp: below + a * (above - below)
                let pt = Vec2::new(
                    below.x + a * (above.x - below.x),
                    below.y + a * (above.y - below.y),
                );
                poly.push(pt);

                let pair = up.paired_halfedge;
                tri = pair as usize / 3;
                k = ((pair as usize) % 3 + 1) % 3;

                if tri == start_tri {
                    break;
                }
            }

            polys.push(poly);
        }

        polys
    }

    /// Project the mesh silhouette onto the XY plane, returning 2D polygon loops.
    /// Mirrors `Manifold::Impl::Project` in `src/face_op.cpp`.
    pub fn project(&self) -> Polygons {
        if self.num_tri() == 0 || self.face_normal.is_empty() {
            return vec![];
        }

        let projection = get_axis_aligned_projection(Vec3::new(0.0, 0.0, 1.0));

        // Find cusp edges: silhouette edges where one adjacent face points up
        // and the other points down (z-component of normals)
        let mut cusps: Vec<crate::types::Halfedge> = Vec::new();
        for edge in &self.halfedge {
            let paired_face = self.halfedge[edge.paired_halfedge as usize].paired_halfedge as usize / 3;
            let this_face = edge.paired_halfedge as usize / 3;
            if self.face_normal[paired_face].z >= 0.0 && self.face_normal[this_face].z < 0.0 {
                cusps.push(*edge);
            }
        }

        if cusps.is_empty() {
            return vec![];
        }

        let loops = assemble_halfedges(&cusps, 0);
        let polys_indexed = project_polygons(&loops, &cusps, &self.vert_pos, &projection);

        // Convert PolygonsIdx to Polygons
        let mut polys: Polygons = Vec::new();
        for poly in &polys_indexed {
            let simple: SimplePolygon = poly.iter().map(|pv| pv.pos).collect();
            polys.push(simple);
        }

        polys
    }
}
