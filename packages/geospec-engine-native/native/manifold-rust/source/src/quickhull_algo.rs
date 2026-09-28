// QuickHull algorithm internals — extracted from quickhull.rs
// Contains MeshBuilder, Pool, FaceData, and QuickHull struct/impl

use std::collections::VecDeque;
use crate::linalg::{dot, Vec3};
use crate::types::Halfedge;

use super::{squared_distance, squared_distance_point_ray, triangle_normal,
            Plane, signed_distance_to_plane};

// ---------------------------------------------------------------------------
// MeshBuilder — internal half-edge mesh used during construction
// ---------------------------------------------------------------------------

struct Face {
    he: i32,
    plane: Plane,
    most_distant_point_dist: f64,
    most_distant_point: usize,
    visibility_checked_on_iteration: usize,
    is_visible_face_on_current_iteration: bool,
    in_face_stack: bool,
    horizon_edges_on_current_iteration: u8,
    points_on_positive_side: Option<Vec<usize>>,
}

impl Face {
    fn new(he: i32) -> Self {
        Self {
            he,
            plane: Plane::default(),
            most_distant_point_dist: 0.0,
            most_distant_point: 0,
            visibility_checked_on_iteration: 0,
            is_visible_face_on_current_iteration: false,
            in_face_stack: false,
            horizon_edges_on_current_iteration: 0,
            points_on_positive_side: None,
        }
    }

    fn disabled() -> Self {
        Self::new(-1)
    }

    fn disable(&mut self) {
        self.he = -1;
    }

    fn is_disabled(&self) -> bool {
        self.he == -1
    }
}

/// The internal half-edge used during quickhull construction.
/// Only uses `end_vert` and `paired_halfedge` -- `start_vert` is set at the end.
#[derive(Clone, Default)]
struct QHEdge {
    end_vert: i32,
    paired_halfedge: i32,
}

struct MeshBuilder {
    faces: Vec<Face>,
    halfedges: Vec<QHEdge>,
    halfedge_to_face: Vec<i32>,
    halfedge_next: Vec<i32>,
    disabled_faces: Vec<usize>,
    disabled_halfedges: Vec<usize>,
}

impl MeshBuilder {
    fn new() -> Self {
        Self {
            faces: Vec::new(),
            halfedges: Vec::new(),
            halfedge_to_face: Vec::new(),
            halfedge_next: Vec::new(),
            disabled_faces: Vec::new(),
            disabled_halfedges: Vec::new(),
        }
    }

    fn add_face(&mut self) -> usize {
        if let Some(index) = self.disabled_faces.pop() {
            let f = &mut self.faces[index];
            debug_assert!(f.is_disabled());
            f.most_distant_point_dist = 0.0;
            f.he = -1; // will be set by caller
            f.is_visible_face_on_current_iteration = false;
            f.in_face_stack = false;
            f.horizon_edges_on_current_iteration = 0;
            f.points_on_positive_side = None;
            return index;
        }
        self.faces.push(Face::disabled());
        self.faces.len() - 1
    }

    fn add_halfedge(&mut self) -> usize {
        if let Some(index) = self.disabled_halfedges.pop() {
            return index;
        }
        self.halfedges.push(QHEdge::default());
        self.halfedge_to_face.push(0);
        self.halfedge_next.push(0);
        self.halfedges.len() - 1
    }

    fn setup(&mut self, a: i32, b: i32, c: i32, d: i32) {
        self.faces.clear();
        self.halfedges.clear();
        self.halfedge_to_face.clear();
        self.halfedge_next.clear();
        self.disabled_faces.clear();
        self.disabled_halfedges.clear();

        // Create 12 halfedges for 4 faces (tetrahedron)
        // Face 0: AB, BC, CA
        self.push_he(0, b, 6, 0, 1); // 0: AB
        self.push_he(0, c, 9, 0, 2); // 1: BC
        self.push_he(0, a, 3, 0, 0); // 2: CA
        // Face 1: AC, CD, DA
        self.push_he(0, c, 2, 1, 4); // 3: AC
        self.push_he(0, d, 11, 1, 5); // 4: CD
        self.push_he(0, a, 7, 1, 3); // 5: DA
        // Face 2: BA, AD, DB
        self.push_he(0, a, 0, 2, 7); // 6: BA
        self.push_he(0, d, 5, 2, 8); // 7: AD
        self.push_he(0, b, 10, 2, 6); // 8: DB
        // Face 3: CB, BD, DC
        self.push_he(0, b, 1, 3, 10); // 9: CB
        self.push_he(0, d, 8, 3, 11); // 10: BD
        self.push_he(0, c, 4, 3, 9); // 11: DC

        self.faces.push(Face::new(0));
        self.faces.push(Face::new(3));
        self.faces.push(Face::new(6));
        self.faces.push(Face::new(9));
    }

    fn push_he(&mut self, _start: i32, end: i32, paired: i32, face: i32, next: i32) {
        self.halfedges.push(QHEdge { end_vert: end, paired_halfedge: paired });
        self.halfedge_to_face.push(face);
        self.halfedge_next.push(next);
    }

    /// Returns vertex indices of a face given its index. Does not borrow &Face.
    fn get_vertex_indices_of_face_by_index(&self, face_index: usize) -> [i32; 3] {
        let i0 = self.faces[face_index].he as usize;
        let i1 = self.halfedge_next[i0] as usize;
        let i2 = self.halfedge_next[i1] as usize;
        [
            self.halfedges[i0].end_vert,
            self.halfedges[i1].end_vert,
            self.halfedges[i2].end_vert,
        ]
    }

    fn get_vertex_indices_of_halfedge(&self, he_idx: usize) -> [i32; 2] {
        let paired = self.halfedges[he_idx].paired_halfedge as usize;
        [self.halfedges[paired].end_vert, self.halfedges[he_idx].end_vert]
    }

    /// Returns halfedge indices of a face given its index. Does not borrow &Face.
    fn get_halfedge_indices_of_face_by_index(&self, face_index: usize) -> [i32; 3] {
        let i0 = self.faces[face_index].he;
        let i1 = self.halfedge_next[i0 as usize];
        let i2 = self.halfedge_next[i1 as usize];
        [i0, i1, i2]
    }

    fn disable_face(&mut self, face_index: usize) -> Option<Vec<usize>> {
        let f = &mut self.faces[face_index];
        f.disable();
        self.disabled_faces.push(face_index);
        f.points_on_positive_side.take()
    }

    fn disable_halfedge(&mut self, he_index: usize) {
        self.halfedges[he_index].paired_halfedge = -1;
        self.disabled_halfedges.push(he_index);
    }
}

// ---------------------------------------------------------------------------
// Pool for recycling point index vectors
// ---------------------------------------------------------------------------

struct Pool {
    data: Vec<Vec<usize>>,
}

impl Pool {
    fn new() -> Self {
        Self { data: Vec::new() }
    }

    fn get(&mut self) -> Vec<usize> {
        match self.data.pop() {
            Some(mut v) => {
                v.clear();
                v
            }
            None => Vec::new(),
        }
    }

    fn reclaim(&mut self, v: Vec<usize>) {
        self.data.push(v);
    }

    fn clear(&mut self) {
        self.data.clear();
    }
}

// ---------------------------------------------------------------------------
// FaceData for traversal
// ---------------------------------------------------------------------------

struct FaceData {
    face_index: usize,
    entered_from_halfedge: i32,
}

// ---------------------------------------------------------------------------
// QuickHull algorithm
// ---------------------------------------------------------------------------

pub(super) struct QuickHull {
    epsilon: f64,
    epsilon_squared: f64,
    scale: f64,
    planar: bool,
    planar_point_cloud_temp: Vec<Vec3>,
    verts: Vec<Vec3>,
    original_vertex_count: usize,
    mesh: MeshBuilder,
    extreme_values: [usize; 6],
    failed_horizon_edges: usize,

    // Temporary variables used during iteration
    new_face_indices: Vec<usize>,
    new_halfedge_indices: Vec<usize>,
    visible_faces: Vec<usize>,
    horizon_edges_data: Vec<usize>,
    possibly_visible_faces: Vec<FaceData>,
    disabled_face_point_vectors: Vec<Vec<usize>>,
    face_list: VecDeque<usize>,
    index_vector_pool: Pool,
}

impl QuickHull {
    pub fn new(vertex_data: &[Vec3]) -> Self {
        Self {
            epsilon: 0.0,
            epsilon_squared: 0.0,
            scale: 0.0,
            planar: false,
            planar_point_cloud_temp: Vec::new(),
            verts: vertex_data.to_vec(),
            original_vertex_count: vertex_data.len(),
            mesh: MeshBuilder::new(),
            extreme_values: [0; 6],
            failed_horizon_edges: 0,
            new_face_indices: Vec::new(),
            new_halfedge_indices: Vec::new(),
            visible_faces: Vec::new(),
            horizon_edges_data: Vec::new(),
            possibly_visible_faces: Vec::new(),
            disabled_face_point_vectors: Vec::new(),
            face_list: VecDeque::new(),
            index_vector_pool: Pool::new(),
        }
    }

    pub fn build_mesh(mut self, eps: f64) -> (Vec<Halfedge>, Vec<Vec3>) {
        if self.verts.is_empty() {
            return (Vec::new(), Vec::new());
        }

        self.extreme_values = self.get_extreme_values();
        let ev = self.extreme_values;
        self.scale = self.get_scale(&ev);
        self.epsilon = eps * self.scale;
        self.epsilon_squared = self.epsilon * self.epsilon;

        self.planar = false;
        self.create_convex_halfedge_mesh();

        if self.planar {
            // Reset the synthetic extra point back to coincide with verts[0] so
            // the final hull vertices lie on the input plane. Matches C++
            // `planarPointCloudTemp.back() = planarPointCloudTemp.front();`
            // where `originalVertexData` is a view sharing that storage.
            let last = self.verts.len() - 1;
            self.verts[last] = self.verts[0];
            if !self.planar_point_cloud_temp.is_empty() {
                let tlast = self.planar_point_cloud_temp.len() - 1;
                self.planar_point_cloud_temp[tlast] = self.planar_point_cloud_temp[0];
            }
        }

        // Reorder halfedges into 3-consecutive-per-face layout
        let mesh = &self.mesh;
        let he_count = mesh.halfedges.len();
        let mut halfedges = vec![Halfedge { start_vert: 0, end_vert: 0, paired_halfedge: -1, prop_vert: 0 }; he_count];
        let mut mapping = vec![0i32; he_count];
        let mut counts = vec![0i32; he_count.max(1)];
        let mut j = 0i32;

        for i in 0..he_count {
            if mesh.halfedges[i].paired_halfedge < 0 {
                continue;
            }
            let face_idx = mesh.halfedge_to_face[i] as usize;
            if face_idx < mesh.faces.len() && mesh.faces[face_idx].is_disabled() {
                continue;
            }
            if counts[face_idx] > 0 {
                continue;
            }
            counts[face_idx] += 1;

            let curr_index = j;
            j += 3;

            // First halfedge of the face
            mapping[i] = curr_index;
            halfedges[curr_index as usize].end_vert = mesh.halfedges[i].end_vert;
            halfedges[curr_index as usize].paired_halfedge = mesh.halfedges[i].paired_halfedge;

            // Second
            let k1 = mesh.halfedge_next[i] as usize;
            mapping[k1] = curr_index + 1;
            halfedges[(curr_index + 1) as usize].end_vert = mesh.halfedges[k1].end_vert;
            halfedges[(curr_index + 1) as usize].paired_halfedge = mesh.halfedges[k1].paired_halfedge;

            // Third
            let k2 = mesh.halfedge_next[k1] as usize;
            mapping[k2] = curr_index + 2;
            halfedges[(curr_index + 2) as usize].end_vert = mesh.halfedges[k2].end_vert;
            halfedges[(curr_index + 2) as usize].paired_halfedge = mesh.halfedges[k2].paired_halfedge;

            // Set start_vert from the previous halfedge's end_vert
            halfedges[curr_index as usize].start_vert = halfedges[(curr_index + 2) as usize].end_vert;
            halfedges[(curr_index + 1) as usize].start_vert = halfedges[curr_index as usize].end_vert;
            halfedges[(curr_index + 2) as usize].start_vert = halfedges[(curr_index + 1) as usize].end_vert;
        }
        halfedges.truncate(j as usize);

        // Fix paired_halfedge IDs
        for he in &mut halfedges {
            if he.paired_halfedge >= 0 {
                he.paired_halfedge = mapping[he.paired_halfedge as usize];
            }
        }

        // Remove unused vertices
        let vert_data = &self.verts;
        let vert_count = vert_data.len();
        let mut vert_used = vec![0i32; vert_count + 1];
        for i in 0..halfedges.len() / 3 {
            vert_used[halfedges[3 * i].start_vert as usize] += 1;
            vert_used[halfedges[3 * i + 1].start_vert as usize] += 1;
            vert_used[halfedges[3 * i + 2].start_vert as usize] += 1;
        }

        // Exclusive scan with saturation
        let mut prefix = vec![0i32; vert_count + 1];
        let mut running = 0;
        for i in 0..vert_count {
            prefix[i] = running;
            if vert_used[i] > 0 {
                running += 1;
            }
        }
        prefix[vert_count] = running;

        let mut vertices = vec![Vec3::new(0.0, 0.0, 0.0); running as usize];
        for i in 0..vert_count {
            if prefix[i + 1] - prefix[i] > 0 {
                vertices[prefix[i] as usize] = vert_data[i];
            }
        }

        // Remap vertex indices in halfedges
        for he in &mut halfedges {
            he.start_vert = prefix[he.start_vert as usize];
            he.end_vert = prefix[he.end_vert as usize];
            // prop_vert mirrors start_vert for hull output (no properties)
            he.prop_vert = he.start_vert;
        }

        (halfedges, vertices)
    }

    fn create_convex_halfedge_mesh(&mut self) {
        self.visible_faces.clear();
        self.horizon_edges_data.clear();
        self.possibly_visible_faces.clear();

        self.setup_initial_tetrahedron();
        debug_assert_eq!(self.mesh.faces.len(), 4);

        // Init face stack
        self.face_list.clear();
        for i in 0..4 {
            let has_points = self.mesh.faces[i].points_on_positive_side.as_ref().map_or(false, |v| !v.is_empty());
            if has_points {
                self.face_list.push_back(i);
                self.mesh.faces[i].in_face_stack = true;
            }
        }

        let mut iter: usize = 0;
        while let Some(top_face_index) = self.face_list.pop_front() {
            iter = iter.wrapping_add(1);
            if iter == usize::MAX {
                iter = 0;
            }

            self.mesh.faces[top_face_index].in_face_stack = false;

            let has_points = self.mesh.faces[top_face_index]
                .points_on_positive_side.as_ref()
                .map_or(false, |v| !v.is_empty());
            if !has_points || self.mesh.faces[top_face_index].is_disabled() {
                continue;
            }

            let active_point_index = self.mesh.faces[top_face_index].most_distant_point;
            let active_point = self.verts[active_point_index];

            // Find visible faces and horizon edges
            self.horizon_edges_data.clear();
            self.possibly_visible_faces.clear();
            self.visible_faces.clear();
            self.possibly_visible_faces.push(FaceData {
                face_index: top_face_index,
                entered_from_halfedge: -1,
            });

            while let Some(face_data) = self.possibly_visible_faces.pop() {
                let fi = face_data.face_index;
                debug_assert!(!self.mesh.faces[fi].is_disabled());

                if self.mesh.faces[fi].visibility_checked_on_iteration == iter {
                    if self.mesh.faces[fi].is_visible_face_on_current_iteration {
                        continue;
                    }
                } else {
                    let plane_n = self.mesh.faces[fi].plane.n;
                    let plane_d = self.mesh.faces[fi].plane.d;
                    self.mesh.faces[fi].visibility_checked_on_iteration = iter;
                    let d = dot(plane_n, active_point) + plane_d;
                    if d > 0.0 {
                        self.mesh.faces[fi].is_visible_face_on_current_iteration = true;
                        self.mesh.faces[fi].horizon_edges_on_current_iteration = 0;
                        self.visible_faces.push(fi);
                        let he_indices = self.mesh.get_halfedge_indices_of_face_by_index(fi);
                        for &he_index in &he_indices {
                            let paired = self.mesh.halfedges[he_index as usize].paired_halfedge;
                            if paired != face_data.entered_from_halfedge {
                                let neighbor_face = self.mesh.halfedge_to_face[paired as usize];
                                self.possibly_visible_faces.push(FaceData {
                                    face_index: neighbor_face as usize,
                                    entered_from_halfedge: he_index,
                                });
                            }
                        }
                        continue;
                    }
                    debug_assert!(fi != top_face_index);
                }

                // Face is not visible -- the halfedge we came from is a horizon edge
                self.mesh.faces[fi].is_visible_face_on_current_iteration = false;
                self.horizon_edges_data.push(face_data.entered_from_halfedge as usize);

                // Mark which halfedge of the source face is the horizon edge
                let source_face_idx = self.mesh.halfedge_to_face[face_data.entered_from_halfedge as usize] as usize;
                let half_edges_mesh = self.mesh.get_halfedge_indices_of_face_by_index(source_face_idx);
                let ind = if half_edges_mesh[0] == face_data.entered_from_halfedge {
                    0u8
                } else if half_edges_mesh[1] == face_data.entered_from_halfedge {
                    1u8
                } else {
                    2u8
                };
                self.mesh.faces[source_face_idx].horizon_edges_on_current_iteration |= 1 << ind;
            }

            let horizon_edge_count = self.horizon_edges_data.len();

            // Reorder horizon edges to form a loop
            if !self.reorder_horizon_edges() {
                self.failed_horizon_edges += 1;
                // Remove the active point from the face's point list
                let pts = self.mesh.faces[top_face_index].points_on_positive_side.as_mut();
                if let Some(pts) = pts {
                    if let Some(pos) = pts.iter().position(|&p| p == active_point_index) {
                        pts.remove(pos);
                    }
                    if pts.is_empty() {
                        let v = self.mesh.faces[top_face_index].points_on_positive_side.take().unwrap();
                        self.index_vector_pool.reclaim(v);
                    }
                }
                continue;
            }

            // Disable visible faces and reclaim their halfedges
            self.new_face_indices.clear();
            self.new_halfedge_indices.clear();
            self.disabled_face_point_vectors.clear();
            let mut disable_counter = 0usize;

            let visible_faces_copy = self.visible_faces.clone();
            for &face_index in &visible_faces_copy {
                let half_edges_mesh = self.mesh.get_halfedge_indices_of_face_by_index(face_index);
                let horizon_bits = self.mesh.faces[face_index].horizon_edges_on_current_iteration;
                for j in 0..3u8 {
                    if (horizon_bits & (1 << j)) == 0 {
                        if disable_counter < horizon_edge_count * 2 {
                            self.new_halfedge_indices.push(half_edges_mesh[j as usize] as usize);
                            disable_counter += 1;
                        } else {
                            self.mesh.disable_halfedge(half_edges_mesh[j as usize] as usize);
                        }
                    }
                }
                let pts = self.mesh.disable_face(face_index);
                if let Some(v) = pts {
                    if !v.is_empty() {
                        self.disabled_face_point_vectors.push(v);
                    }
                }
            }

            if disable_counter < horizon_edge_count * 2 {
                let needed = horizon_edge_count * 2 - disable_counter;
                for _ in 0..needed {
                    let idx = self.mesh.add_halfedge();
                    self.new_halfedge_indices.push(idx);
                }
            }

            // Create new faces using the horizon edge loop
            for i in 0..horizon_edge_count {
                let ab = self.horizon_edges_data[i];
                let [a_vert, b_vert] = self.mesh.get_vertex_indices_of_halfedge(ab);
                let a = a_vert;
                let b = b_vert;
                let c = active_point_index as i32;

                let new_face_index = self.mesh.add_face();
                self.new_face_indices.push(new_face_index);

                let ca = self.new_halfedge_indices[2 * i];
                let bc = self.new_halfedge_indices[2 * i + 1];

                self.mesh.halfedge_next[ab] = bc as i32;
                self.mesh.halfedge_next[bc] = ca as i32;
                self.mesh.halfedge_next[ca] = ab as i32;

                self.mesh.halfedge_to_face[bc] = new_face_index as i32;
                self.mesh.halfedge_to_face[ca] = new_face_index as i32;
                self.mesh.halfedge_to_face[ab] = new_face_index as i32;

                self.mesh.halfedges[ca].end_vert = a;
                self.mesh.halfedges[bc].end_vert = c;

                let plane_normal = triangle_normal(self.verts[a as usize], self.verts[b as usize], active_point);
                self.mesh.faces[new_face_index].plane = Plane::new(plane_normal, active_point);
                self.mesh.faces[new_face_index].he = ab as i32;

                // Set paired halfedge links for the new edges
                self.mesh.halfedges[ca].paired_halfedge =
                    self.new_halfedge_indices[if i > 0 { i * 2 - 1 } else { 2 * horizon_edge_count - 1 }] as i32;
                self.mesh.halfedges[bc].paired_halfedge =
                    self.new_halfedge_indices[((i + 1) * 2) % (horizon_edge_count * 2)] as i32;
            }

            // Assign points from disabled faces to new faces
            let mut dfpv = std::mem::take(&mut self.disabled_face_point_vectors);
            let nfi_copy = self.new_face_indices.clone();
            for disabled_points in dfpv.drain(..) {
                for &point in &disabled_points {
                    if point == active_point_index {
                        continue;
                    }
                    for &nfi in &nfi_copy {
                        if self.add_point_to_face(nfi, point) {
                            break;
                        }
                    }
                }
                self.index_vector_pool.reclaim(disabled_points);
            }
            self.disabled_face_point_vectors = dfpv;

            // Add new faces to the face list if they have points
            for &new_face_index in &self.new_face_indices {
                let has_points = self.mesh.faces[new_face_index].points_on_positive_side.as_ref().map_or(false, |v| !v.is_empty());
                let in_stack = self.mesh.faces[new_face_index].in_face_stack;
                if has_points && !in_stack {
                    self.face_list.push_back(new_face_index);
                    self.mesh.faces[new_face_index].in_face_stack = true;
                }
            }
        }

        self.index_vector_pool.clear();
    }

    fn get_extreme_values(&self) -> [usize; 6] {
        let verts = &self.verts;
        let mut out = [0usize; 6];
        let mut extreme_vals = [
            verts[0].x, verts[0].x,
            verts[0].y, verts[0].y,
            verts[0].z, verts[0].z,
        ];
        for i in 1..verts.len() {
            let pos = verts[i];
            if pos.x > extreme_vals[0] { extreme_vals[0] = pos.x; out[0] = i; }
            else if pos.x < extreme_vals[1] { extreme_vals[1] = pos.x; out[1] = i; }
            if pos.y > extreme_vals[2] { extreme_vals[2] = pos.y; out[2] = i; }
            else if pos.y < extreme_vals[3] { extreme_vals[3] = pos.y; out[3] = i; }
            if pos.z > extreme_vals[4] { extreme_vals[4] = pos.z; out[4] = i; }
            else if pos.z < extreme_vals[5] { extreme_vals[5] = pos.z; out[5] = i; }
        }
        out
    }

    fn get_scale(&self, extreme_values: &[usize; 6]) -> f64 {
        let verts = &self.verts;
        let mut s = 0.0f64;
        for i in 0..6 {
            let v = verts[extreme_values[i]];
            let val = match i {
                0 | 1 => v.x.abs(),
                2 | 3 => v.y.abs(),
                4 | 5 => v.z.abs(),
                _ => unreachable!(),
            };
            if val > s {
                s = val;
            }
        }
        s
    }

    fn reorder_horizon_edges(&mut self) -> bool {
        let n = self.horizon_edges_data.len();
        for i in 0..n.saturating_sub(1) {
            let end_vertex = self.mesh.halfedges[self.horizon_edges_data[i]].end_vert;
            let mut found = false;
            for j in (i + 1)..n {
                let paired = self.mesh.halfedges[self.horizon_edges_data[j]].paired_halfedge;
                let begin_vertex = self.mesh.halfedges[paired as usize].end_vert;
                if begin_vertex == end_vertex {
                    self.horizon_edges_data.swap(i + 1, j);
                    found = true;
                    break;
                }
            }
            if !found {
                return false;
            }
        }
        // Verify loop closure
        if n > 0 {
            let last_end = self.mesh.halfedges[self.horizon_edges_data[n - 1]].end_vert;
            let first_paired = self.mesh.halfedges[self.horizon_edges_data[0]].paired_halfedge;
            let first_begin = self.mesh.halfedges[first_paired as usize].end_vert;
            debug_assert_eq!(last_end, first_begin);
        }
        true
    }

    fn setup_initial_tetrahedron(&mut self) {
        let vertex_count = self.verts.len();

        if vertex_count <= 4 {
            if vertex_count < 4 {
                let mut temp: Vec<Vec3> = self.verts.clone();
                while temp.len() < 4 {
                    temp.push(*temp.last().unwrap());
                }
                self.planar_point_cloud_temp = temp.clone();
                self.verts = temp;
            }
            let mut v = [0usize, 1, 2, 3];
            let n = triangle_normal(self.verts[v[0]], self.verts[v[1]], self.verts[v[2]]);
            let plane = Plane::new(n, self.verts[v[0]]);
            if plane.is_point_on_positive_side(self.verts[v[3]]) {
                v.swap(0, 1);
            }
            self.mesh.setup(v[0] as i32, v[1] as i32, v[2] as i32, v[3] as i32);
            return;
        }

        // Find two most distant extreme points
        let mut max_d = self.epsilon_squared;
        let mut selected = (0usize, 0usize);
        for i in 0..6 {
            for j in (i + 1)..6 {
                let d = squared_distance(self.verts[self.extreme_values[i]], self.verts[self.extreme_values[j]]);
                if d > max_d {
                    max_d = d;
                    selected = (self.extreme_values[i], self.extreme_values[j]);
                }
            }
        }
        if max_d == self.epsilon_squared {
            // Degenerate: single point
            self.mesh.setup(0, 1, 2, 3);
            return;
        }

        // Find most distant point from the line
        let ray_s = self.verts[selected.0];
        let ray_v = self.verts[selected.1] - self.verts[selected.0];
        let v_inv_len_sq = 1.0 / dot(ray_v, ray_v);
        max_d = self.epsilon_squared;
        let mut max_i = usize::MAX;
        for i in 0..vertex_count {
            let d = squared_distance_point_ray(self.verts[i], ray_s, ray_v, v_inv_len_sq);
            if d > max_d {
                max_d = d;
                max_i = i;
            }
        }
        if max_d == self.epsilon_squared {
            // 1D degenerate
            let mut third = 0;
            while third == selected.0 || third == selected.1 { third += 1; }
            let mut fourth = third + 1;
            while fourth == selected.0 || fourth == selected.1 { fourth += 1; }
            self.mesh.setup(selected.0 as i32, selected.1 as i32, third as i32, fourth as i32);
            return;
        }

        debug_assert!(selected.0 != max_i && selected.1 != max_i);
        let mut base_triangle = [selected.0, selected.1, max_i];
        let base_verts = [self.verts[base_triangle[0]], self.verts[base_triangle[1]], self.verts[base_triangle[2]]];

        // Find 4th vertex farthest from the triangle plane
        let n = triangle_normal(base_verts[0], base_verts[1], base_verts[2]);
        let triangle_plane = Plane::new(n, base_verts[0]);
        max_d = self.epsilon;
        max_i = 0;
        for i in 0..vertex_count {
            let d = signed_distance_to_plane(self.verts[i], &triangle_plane).abs();
            if d > max_d {
                max_d = d;
                max_i = i;
            }
        }

        if max_d == self.epsilon {
            // 2D planar case: add an extra point above the plane
            self.planar = true;
            let n1 = triangle_normal(base_verts[1], base_verts[2], base_verts[0]);
            let mut temp: Vec<Vec3> = self.verts.clone();
            let extra_point = n1 + self.verts[0];
            temp.push(extra_point);
            max_i = temp.len() - 1;
            self.planar_point_cloud_temp = temp.clone();
            self.verts = temp;
        }

        // Enforce CCW orientation
        let tri_plane = Plane::new(n, base_verts[0]);
        if tri_plane.is_point_on_positive_side(self.verts[max_i]) {
            base_triangle.swap(0, 1);
        }

        // Create tetrahedron and compute face planes
        self.mesh.setup(
            base_triangle[0] as i32,
            base_triangle[1] as i32,
            base_triangle[2] as i32,
            max_i as i32,
        );

        for fi in 0..self.mesh.faces.len() {
            let v = self.mesh.get_vertex_indices_of_face_by_index(fi);
            let n1 = triangle_normal(self.verts[v[0] as usize], self.verts[v[1] as usize], self.verts[v[2] as usize]);
            let plane = Plane::new(n1, self.verts[v[0] as usize]);
            self.mesh.faces[fi].plane = plane;
        }

        // Assign points to initial faces
        let v_count = self.original_vertex_count; // Only original points, not the extra planar point
        for i in 0..v_count {
            for fi in 0..self.mesh.faces.len() {
                if self.add_point_to_face(fi, i) {
                    break;
                }
            }
        }
    }

    fn add_point_to_face(&mut self, face_index: usize, point_index: usize) -> bool {
        let d = signed_distance_to_plane(self.verts[point_index], &self.mesh.faces[face_index].plane);
        if d > 0.0 && d * d > self.epsilon_squared * self.mesh.faces[face_index].plane.sqr_n_length {
            let f = &mut self.mesh.faces[face_index];
            if f.points_on_positive_side.is_none() {
                f.points_on_positive_side = Some(self.index_vector_pool.get());
            }
            f.points_on_positive_side.as_mut().unwrap().push(point_index);
            if d > f.most_distant_point_dist {
                f.most_distant_point_dist = d;
                f.most_distant_point = point_index;
            }
            return true;
        }
        false
    }
}
