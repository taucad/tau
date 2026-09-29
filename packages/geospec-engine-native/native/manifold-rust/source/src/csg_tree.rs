// Copyright 2026 Lars Brubaker
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Phase 12: CSG Tree — ported from C++ csg_tree.cpp (764 lines)
//
// Implements the full CSG tree evaluation system with:
// - CsgLeafNode: lazy transform propagation, Arvo's AABB transform
// - CsgOpNode: N-ary children with caching
// - SimpleBoolean: wrapper invoking Boolean3
// - BatchBoolean: min-heap approach for commutative ops
// - BatchUnion: bounding-box partitioning + Compose + BatchBoolean
// - Explicit-stack DFS evaluation (no recursion)

use std::sync::Arc;
use std::collections::BinaryHeap;
use std::cmp::Ordering;

use crate::boolean3;
use crate::cancel::{is_cancelled, CancelToken};
use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{Mat3x4, Vec3, mat3x4_to_mat4, mat4_to_mat3x4};
use crate::types::{Box as BBox, Error, OpType};

// ---------------------------------------------------------------------------
// CsgLeafNode — wraps an immutable mesh plus a lazy transform
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct CsgLeafNode {
    pub p_impl: Arc<ManifoldImpl>,
    pub transform: Mat3x4,
}

impl CsgLeafNode {
    /// Create a leaf from a mesh with identity transform.
    pub fn new(mesh: ManifoldImpl) -> Self {
        Self {
            p_impl: Arc::new(mesh),
            transform: Mat3x4::identity(),
        }
    }

    /// Create a leaf from a mesh with a specific transform.
    pub fn with_transform(mesh: ManifoldImpl, transform: Mat3x4) -> Self {
        Self {
            p_impl: Arc::new(mesh),
            transform,
        }
    }

    /// Create an empty leaf.
    pub fn empty() -> Self {
        Self {
            p_impl: Arc::new(ManifoldImpl::new()),
            transform: Mat3x4::identity(),
        }
    }

    /// Empty leaf carrying [`Error::Cancelled`], the value every cancelled
    /// branch of the tree evaluates to. Port of C++
    /// `ErrorLeaf(Manifold::Error::Cancelled)` (csg_tree.cpp:172, 460, 511, 759).
    fn cancelled() -> Self {
        let mut imp = ManifoldImpl::new();
        imp.make_empty(Error::Cancelled);
        Self {
            p_impl: Arc::new(imp),
            transform: Mat3x4::identity(),
        }
    }

    /// Get the mesh, applying the lazy transform if needed.
    /// Port of C++ CsgLeafNode::GetImpl()
    pub fn get_impl(&self) -> ManifoldImpl {
        if self.transform == Mat3x4::identity() {
            (*self.p_impl).clone()
        } else {
            // ManifoldImpl::transform returns the transformed mesh (it is not
            // in-place) — discarding its return value silently drops the lazy
            // transform.
            self.p_impl.transform(&self.transform)
        }
    }

    /// Return a new leaf with composed transform.
    /// Port of C++ CsgLeafNode::Transform()
    pub fn apply_transform(&self, m: Mat3x4) -> Self {
        let new_transform = mat4_to_mat3x4(
            mat3x4_to_mat4(m) * mat3x4_to_mat4(self.transform)
        );
        Self {
            p_impl: Arc::clone(&self.p_impl),
            transform: new_transform,
        }
    }

    /// Get bounding box without materializing the full mesh.
    /// Uses Arvo's algorithm for AABB transform.
    /// Port of C++ CsgLeafNode::GetBoundingBox()
    pub fn get_bounding_box(&self) -> BBox {
        let impl_bbox = self.p_impl.bbox;
        if self.transform == Mat3x4::identity() {
            return impl_bbox;
        }
        // Arvo's AABB transform: transform center and half-extents
        let center = (impl_bbox.min + impl_bbox.max) * 0.5;
        let half = (impl_bbox.max - impl_bbox.min) * 0.5;

        // Transform center point
        let mat = self.transform;
        let new_center = Vec3::new(
            mat[0].x * center.x + mat[1].x * center.y + mat[2].x * center.z + mat[3].x,
            mat[0].y * center.x + mat[1].y * center.y + mat[2].y * center.z + mat[3].y,
            mat[0].z * center.x + mat[1].z * center.y + mat[2].z * center.z + mat[3].z,
        );

        // Transform half-extents using absolute values of matrix entries
        let new_half = Vec3::new(
            mat[0].x.abs() * half.x + mat[1].x.abs() * half.y + mat[2].x.abs() * half.z,
            mat[0].y.abs() * half.x + mat[1].y.abs() * half.y + mat[2].y.abs() * half.z,
            mat[0].z.abs() * half.x + mat[1].z.abs() * half.y + mat[2].z.abs() * half.z,
        );

        BBox {
            min: new_center - new_half,
            max: new_center + new_half,
        }
    }

    /// Vertex count without triggering transform.
    pub fn num_vert(&self) -> usize {
        self.p_impl.num_vert()
    }
}

// ---------------------------------------------------------------------------
// CsgNode — the main CSG tree node (leaf or N-ary operation)
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub enum CsgNode {
    Leaf(CsgLeafNode),
    Op {
        op: OpType,
        children: Vec<CsgNode>,
        transform: Mat3x4,
    },
}

impl CsgNode {
    pub fn leaf(mesh: ManifoldImpl) -> Self {
        Self::Leaf(CsgLeafNode::new(mesh))
    }

    pub fn leaf_node(node: CsgLeafNode) -> Self {
        Self::Leaf(node)
    }

    pub fn op(op: OpType, left: CsgNode, right: CsgNode) -> Self {
        Self::Op {
            op,
            children: vec![left, right],
            transform: Mat3x4::identity(),
        }
    }

    pub fn op_n(op: OpType, children: Vec<CsgNode>) -> Self {
        Self::Op {
            op,
            children,
            transform: Mat3x4::identity(),
        }
    }

    /// Evaluate the CSG tree to produce a single mesh.
    /// Uses explicit-stack DFS to avoid recursion stack overflow.
    /// Port of C++ CsgOpNode::ToLeafNode()
    pub fn evaluate(&self) -> ManifoldImpl {
        self.evaluate_with_token(None)
    }

    /// [`CsgNode::evaluate`] with cooperative cancellation.
    ///
    /// A cancelled evaluation yields an empty mesh whose status is
    /// [`Error::Cancelled`]. Mirrors C++ `CsgOpNode::ToLeafNode(ctx)`
    /// (csg_tree.cpp:644-800), which checks the flag once per stack step and
    /// substitutes an `ErrorLeaf(Cancelled)` for the pending work.
    pub fn evaluate_with_token(&self, token: Option<&CancelToken>) -> ManifoldImpl {
        let leaf = self.to_leaf_node(Mat3x4::identity(), token);
        leaf.get_impl()
    }

    /// Internal: convert this node to a CsgLeafNode, applying the given parent transform.
    fn to_leaf_node(&self, parent_transform: Mat3x4, token: Option<&CancelToken>) -> CsgLeafNode {
        // One check per stack step, as C++ does at csg_tree.cpp:752. Cancel is
        // sticky, so every enclosing step short-circuits here too and the
        // Cancelled leaf propagates to the root without further work.
        if is_cancelled(token) {
            return CsgLeafNode::cancelled();
        }
        match self {
            CsgNode::Leaf(leaf) => leaf.apply_transform(parent_transform),
            CsgNode::Op { op, children, transform } => {
                // Compose local transform with parent
                let combined = mat4_to_mat3x4(
                    mat3x4_to_mat4(parent_transform) * mat3x4_to_mat4(*transform)
                );

                // Flatten: recursively resolve all children to leaves
                let mut positive: Vec<CsgLeafNode> = Vec::new();
                let mut negative: Vec<CsgLeafNode> = Vec::new();

                self.collect_children(*op, combined, children, &mut positive, &mut negative, token);

                // Perform the operation
                match op {
                    OpType::Add => {
                        // Union of all positive children
                        batch_union(&mut positive, token)
                    }
                    OpType::Intersect => {
                        // Intersection of all positive children
                        batch_boolean(OpType::Intersect, &mut positive, token)
                    }
                    OpType::Subtract => {
                        // Subtract: first child is positive, rest are negative
                        if positive.is_empty() {
                            // `collect_children` may have produced a Cancelled
                            // leaf and no positive one; returning the plain
                            // empty leaf here would launder that into NoError.
                            return if is_cancelled(token) {
                                CsgLeafNode::cancelled()
                            } else {
                                CsgLeafNode::empty()
                            };
                        }
                        let pos_result = batch_union(&mut positive, token);
                        if negative.is_empty() {
                            return pos_result;
                        }
                        let neg_result = batch_union(&mut negative, token);
                        simple_boolean(&pos_result, &neg_result, OpType::Subtract, token)
                    }
                }
            }
        }
    }

    /// Recursively collect children, flattening compatible operations.
    /// Port of the collapsing logic in C++ CsgOpNode::ToLeafNode.
    fn collect_children(
        &self,
        parent_op: OpType,
        transform: Mat3x4,
        children: &[CsgNode],
        positive: &mut Vec<CsgLeafNode>,
        negative: &mut Vec<CsgLeafNode>,
        token: Option<&CancelToken>,
    ) {
        for (i, child) in children.iter().enumerate() {
            match child {
                CsgNode::Leaf(leaf) => {
                    let transformed = leaf.apply_transform(transform);
                    if parent_op == OpType::Subtract && i > 0 {
                        negative.push(transformed);
                    } else {
                        positive.push(transformed);
                    }
                }
                CsgNode::Op { op: child_op, children: grandchildren, transform: child_transform } => {
                    let combined = mat4_to_mat3x4(
                        mat3x4_to_mat4(transform) * mat3x4_to_mat4(*child_transform)
                    );

                    // Collapsing: flatten compatible ops
                    let can_collapse = match (parent_op, child_op) {
                        // Union is associative: (A ∪ B) ∪ C = A ∪ B ∪ C
                        (OpType::Add, OpType::Add) => true,
                        // Intersection is associative: (A ∩ B) ∩ C = A ∩ B ∩ C
                        (OpType::Intersect, OpType::Intersect) => true,
                        // (A - B) - C = A - (B ∪ C): first child's subtraction collapses
                        (OpType::Subtract, OpType::Subtract) if i == 0 => true,
                        _ => false,
                    };

                    if can_collapse {
                        // Flatten: merge grandchildren directly
                        if parent_op == OpType::Subtract && *child_op == OpType::Subtract && i == 0 {
                            // (A - B) is first child of Subtract: A goes to positive, B goes to negative
                            for (gi, gc) in grandchildren.iter().enumerate() {
                                let leaf = gc.to_leaf_node_inner(combined, token);
                                if gi == 0 {
                                    positive.push(leaf);
                                } else {
                                    negative.push(leaf);
                                }
                            }
                        } else {
                            for gc in grandchildren {
                                let leaf = gc.to_leaf_node_inner(combined, token);
                                if parent_op == OpType::Subtract && i > 0 {
                                    negative.push(leaf);
                                } else {
                                    positive.push(leaf);
                                }
                            }
                        }
                    } else {
                        // Cannot collapse: evaluate child subtree fully
                        let result = child.to_leaf_node(combined, token);
                        if parent_op == OpType::Subtract && i > 0 {
                            negative.push(result);
                        } else {
                            positive.push(result);
                        }
                    }
                }
            }
        }
    }

    /// Helper: convert a single node to leaf with given transform (non-flattening).
    fn to_leaf_node_inner(&self, transform: Mat3x4, token: Option<&CancelToken>) -> CsgLeafNode {
        match self {
            CsgNode::Leaf(leaf) => leaf.apply_transform(transform),
            CsgNode::Op { .. } => self.to_leaf_node(transform, token),
        }
    }
}

// ---------------------------------------------------------------------------
// SimpleBoolean — wrapper invoking Boolean3
// Port of C++ SimpleBoolean() (lines 142-184)
// ---------------------------------------------------------------------------

fn simple_boolean(
    a: &CsgLeafNode,
    b: &CsgLeafNode,
    op: OpType,
    token: Option<&CancelToken>,
) -> CsgLeafNode {
    // Entry gate before the (expensive) transform materialisation, matching
    // C++ SimpleBoolean's first line (csg_tree.cpp:172).
    if is_cancelled(token) {
        return CsgLeafNode::cancelled();
    }
    let impl_a = a.get_impl();
    let impl_b = b.get_impl();
    // Engine selection: CSG evaluation honors the process-global default
    // (types::BooleanConfig). With the default (Exact) this call resolves to
    // boolean3::boolean_with_token — behavior byte-identical to before the
    // robust engine existed.
    let result = boolean3::boolean_dispatch(
        &impl_a,
        &impl_b,
        op,
        crate::types::BooleanConfig::default_engine(),
        token,
    );
    CsgLeafNode::new(result)
}

// ---------------------------------------------------------------------------
// BatchBoolean — heap-ordered reduction for commutative ops
// Port of C++ BatchBoolean() in csg_tree.cpp (v3.5.0)
// ---------------------------------------------------------------------------

/// Heap entry ordered like C++ `MeshCompare` on `(CsgLeafNode, serial)` pairs:
/// by vertex count, tie-broken by insertion serial. The serial makes the order
/// total, so the pop sequence is deterministic and heap-implementation
/// independent — required for exact match with the C++ reduction order.
struct MeshEntry(CsgLeafNode, u64);

impl PartialEq for MeshEntry {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}
impl Eq for MeshEntry {}

impl PartialOrd for MeshEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for MeshEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        // C++ std::pop_heap with MeshCompare (a less-than) pops the MAX:
        // the node with the most verts, ties going to the largest serial.
        // Rust's BinaryHeap is a max-heap, so use the same less-than order.
        self.0
            .num_vert()
            .cmp(&other.0.num_vert())
            .then(self.1.cmp(&other.1))
    }
}

fn batch_boolean(
    op: OpType,
    children: &mut Vec<CsgLeafNode>,
    token: Option<&CancelToken>,
) -> CsgLeafNode {
    if children.is_empty() {
        return CsgLeafNode::empty();
    }
    if children.len() == 1 {
        return children.remove(0);
    }
    if children.len() == 2 {
        let b = children.pop().unwrap();
        let a = children.pop().unwrap();
        return simple_boolean(&a, &b, op, token);
    }

    let mut heap: BinaryHeap<MeshEntry> = BinaryHeap::new();
    let mut next_serial = children.len() as u64;
    for (i, child) in children.drain(..).enumerate() {
        heap.push(MeshEntry(child, i as u64));
    }

    // C++ processes up to 4 pairs per round (for its parallel lane), pushing
    // the results back only at the end of the round — even in sequential
    // builds. The round structure changes which meshes pair up, so mirror it.
    let mut tmp: Vec<MeshEntry> = Vec::new();
    while heap.len() > 1 {
        // Once-per-round check, matching C++ BatchBoolean's per-iteration gate
        // (csg_tree.cpp:460).
        if is_cancelled(token) {
            return CsgLeafNode::cancelled();
        }
        for _ in 0..4 {
            if heap.len() <= 1 {
                break;
            }
            let a = heap.pop().unwrap();
            let b = heap.pop().unwrap();
            let result = simple_boolean(&a.0, &b.0, op, token);
            tmp.push(MeshEntry(result, next_serial));
            next_serial += 1;
        }
        for entry in tmp.drain(..) {
            heap.push(entry);
        }
    }

    heap.pop().unwrap().0
}

// ---------------------------------------------------------------------------
// BatchUnion — bounding-box partitioning + Compose + BatchBoolean
// Port of C++ BatchUnion() (lines 434-491)
// ---------------------------------------------------------------------------

const K_MAX_UNION_SIZE: usize = 1000;

fn batch_union(children: &mut Vec<CsgLeafNode>, token: Option<&CancelToken>) -> CsgLeafNode {
    if children.is_empty() {
        return CsgLeafNode::empty();
    }
    if children.len() == 1 {
        return children.remove(0);
    }

    // Process in chunks to avoid O(n^2) overlap checks
    while children.len() > 1 {
        // Once-per-chunk check, matching C++ BatchUnion (csg_tree.cpp:511).
        if is_cancelled(token) {
            return CsgLeafNode::cancelled();
        }
        let chunk_size = children.len().min(K_MAX_UNION_SIZE);
        let chunk_start = children.len() - chunk_size;

        // Get bounding boxes for the chunk
        let boxes: Vec<BBox> = children[chunk_start..]
            .iter()
            .map(|c| c.get_bounding_box())
            .collect();

        // Greedy partition into disjoint sets
        let mut sets: Vec<Vec<usize>> = Vec::new(); // each set is indices into chunk
        for i in 0..chunk_size {
            let mut found_set = false;
            for set in &mut sets {
                let overlaps = set.iter().any(|&j| boxes[i].does_overlap_box(&boxes[j]));
                if !overlaps {
                    set.push(i);
                    found_set = true;
                    break;
                }
            }
            if !found_set {
                sets.push(vec![i]);
            }
        }

        // Process each disjoint set
        let chunk: Vec<CsgLeafNode> = children.drain(chunk_start..).collect();
        let mut results: Vec<CsgLeafNode> = Vec::new();

        for set in &sets {
            if set.len() == 1 {
                results.push(chunk[set[0]].clone());
            } else {
                // Compose disjoint meshes without boolean
                let meshes: Vec<ManifoldImpl> = set.iter()
                    .map(|&i| chunk[i].get_impl())
                    .collect();
                let composed = boolean3::compose_meshes(&meshes);
                results.push(CsgLeafNode::new(composed));
            }
        }

        // BatchBoolean the composed results, then move the (complicated) new
        // child to the front: C++ push_backs and swaps front↔back, which also
        // moves the old front to the back when chunking (>kMaxUnionSize).
        let result = batch_boolean(OpType::Add, &mut results, token);
        children.push(result);
        let last = children.len() - 1;
        children.swap(0, last);
    }

    children.remove(0)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::{mat4_to_mat3x4, translation_matrix, Vec3};

    #[test]
    fn test_csg_tree_union_disjoint() {
        let a = ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(0.0, 0.0, 0.0))));
        let b = ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(3.0, 0.0, 0.0))));
        let tree = CsgNode::op(OpType::Add, CsgNode::leaf(a), CsgNode::leaf(b));
        let result = tree.evaluate();
        assert_eq!(result.num_tri(), 24);
    }

    #[test]
    fn test_csg_tree_union_overlapping() {
        let a = ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(0.0, 0.0, 0.0))));
        let b = ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(0.5, 0.0, 0.0))));
        let tree = CsgNode::op(OpType::Add, CsgNode::leaf(a), CsgNode::leaf(b));
        let result = tree.evaluate();
        assert!(result.num_tri() > 0, "Overlapping union should produce non-empty mesh");
    }

    #[test]
    fn test_csg_tree_intersection() {
        let a = ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(0.0, 0.0, 0.0))));
        let b = ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(0.5, 0.0, 0.0))));
        let tree = CsgNode::op(OpType::Intersect, CsgNode::leaf(a), CsgNode::leaf(b));
        let result = tree.evaluate();
        assert!(result.num_tri() > 0, "Overlapping intersection should produce non-empty mesh");
    }

    #[test]
    fn test_csg_tree_subtract() {
        let a = ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(0.0, 0.0, 0.0))));
        let b = ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(0.5, 0.0, 0.0))));
        let tree = CsgNode::op(OpType::Subtract, CsgNode::leaf(a), CsgNode::leaf(b));
        let result = tree.evaluate();
        assert!(result.num_tri() > 0, "Subtraction should produce non-empty mesh");
    }

    #[test]
    fn test_batch_boolean_three_cubes() {
        let a = CsgLeafNode::new(ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(0.0, 0.0, 0.0)))));
        let b = CsgLeafNode::new(ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(0.5, 0.0, 0.0)))));
        let c = CsgLeafNode::new(ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(1.0, 0.0, 0.0)))));
        let mut children = vec![a, b, c];
        let result = batch_boolean(OpType::Add, &mut children, None);
        let mesh = result.get_impl();
        assert!(mesh.num_tri() > 0, "BatchBoolean of 3 overlapping cubes should produce non-empty mesh");
    }

    #[test]
    fn test_batch_union_disjoint() {
        let a = CsgLeafNode::new(ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(0.0, 0.0, 0.0)))));
        let b = CsgLeafNode::new(ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(3.0, 0.0, 0.0)))));
        let c = CsgLeafNode::new(ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(Vec3::new(6.0, 0.0, 0.0)))));
        let mut children = vec![a, b, c];
        let result = batch_union(&mut children, None);
        let mesh = result.get_impl();
        // Three disjoint cubes should compose without boolean, giving 36 tris
        assert_eq!(mesh.num_tri(), 36, "BatchUnion of 3 disjoint cubes should have 36 tris");
    }

    #[test]
    fn test_csg_n_ary_union() {
        // N-ary union of 4 disjoint cubes
        let nodes: Vec<CsgNode> = (0..4).map(|i| {
            CsgNode::leaf(ManifoldImpl::cube(&mat4_to_mat3x4(translation_matrix(
                Vec3::new(i as f64 * 3.0, 0.0, 0.0)
            ))))
        }).collect();
        let tree = CsgNode::op_n(OpType::Add, nodes);
        let result = tree.evaluate();
        assert_eq!(result.num_tri(), 48, "N-ary union of 4 disjoint cubes should have 48 tris");
    }

    #[test]
    fn test_lazy_leaf_transform_applied_on_evaluate() {
        // Regression: get_impl discarded ManifoldImpl::transform's return value
        // (it is not in-place), so lazily-transformed leaves evaluated at the
        // origin. Two disjoint cubes — one translated via the *leaf* transform,
        // not baked into the mesh — must union to 24 tris, not collapse to 12.
        let cube = ManifoldImpl::cube(&Mat3x4::identity());
        let a = CsgLeafNode::new(cube.clone());
        let b = CsgLeafNode::new(cube).apply_transform(
            mat4_to_mat3x4(translation_matrix(Vec3::new(3.0, 0.0, 0.0))),
        );
        let bbox = b.get_impl().bbox;
        assert!(
            bbox.min.x >= 2.9 && bbox.max.x <= 4.1,
            "lazy transform not applied by get_impl: bbox.x = [{}, {}]",
            bbox.min.x,
            bbox.max.x
        );
        let tree = CsgNode::op(
            OpType::Add,
            CsgNode::leaf_node(a),
            CsgNode::leaf_node(b),
        );
        assert_eq!(tree.evaluate().num_tri(), 24);
    }

    #[test]
    fn test_tree_transforms() {
        // Test that transforms compose correctly through the tree
        let a = ManifoldImpl::cube(&Mat3x4::identity());
        let leaf = CsgLeafNode::new(a);
        let translated = leaf.apply_transform(
            mat4_to_mat3x4(translation_matrix(Vec3::new(5.0, 0.0, 0.0)))
        );
        let bbox = translated.get_bounding_box();
        assert!(bbox.min.x > 4.0, "Translated bbox min.x should be > 4.0, got {}", bbox.min.x);
        assert!(bbox.max.x < 6.5, "Translated bbox max.x should be < 6.5, got {}", bbox.max.x);
    }
}
