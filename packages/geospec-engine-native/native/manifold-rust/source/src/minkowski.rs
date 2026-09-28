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

// Phase 17: Minkowski Sum/Difference — ported from C++ minkowski.cpp (175 lines)
//
// Implements the Minkowski sum/difference using:
// - Convex+Convex: pairwise vertex sums → Hull
// - NonConvex+Convex: per-triangle vertex sums → Hull → BatchBoolean (in batches)
// - NonConvex+NonConvex: per-face-pair sums with coplanarity filtering → BatchBoolean

use crate::csg_tree::{CsgLeafNode, CsgNode};
use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{dot, Vec3};
use crate::quickhull;
use crate::types::OpType;

const BATCH_SIZE: usize = 1000;
const REDUCE_THRESHOLD: usize = 200;
const K_COPLANAR_TOL: f64 = 1e-12;

/// Compute the Minkowski sum or difference of two meshes.
/// Port of C++ Manifold::Impl::Minkowski()
///
/// `inset`: if true, computes the Minkowski difference (erosion);
///          if false, computes the Minkowski sum (dilation).
pub fn minkowski(a: &ManifoldImpl, b: &ManifoldImpl, inset: bool) -> ManifoldImpl {
    let mut a_impl = a;
    let mut b_impl = b;

    let mut a_convex = a_impl.is_convex();
    let mut b_convex = b_impl.is_convex();

    // If the convex manifold was supplied first, swap them
    let (a_ref, b_ref);
    if a_convex && !b_convex {
        a_ref = b;
        b_ref = a;
        std::mem::swap(&mut a_convex, &mut b_convex);
        a_impl = a_ref;
        b_impl = b_ref;
    }

    // Early-exit if either input is empty
    if b_impl.is_empty() {
        return a_impl.clone();
    }
    if a_impl.is_empty() {
        return b_impl.clone();
    }

    let mut composed_hulls: Vec<ManifoldImpl> = Vec::new();
    composed_hulls.push(a_impl.clone());

    // Convex-Convex Minkowski: Very Fast
    if !inset && a_convex && b_convex {
        let mut simple_hull: Vec<Vec3> =
            Vec::with_capacity(b_impl.vert_pos.len() * a_impl.vert_pos.len());
        for &a_vert in &a_impl.vert_pos {
            for &b_vert in &b_impl.vert_pos {
                simple_hull.push(a_vert + b_vert);
            }
        }
        composed_hulls.push(quickhull::convex_hull(&simple_hull));

    // Convex + Non-Convex (or inset): Slower
    } else if (inset || !a_convex) && b_convex {
        let num_tri = a_impl.num_tri();

        // Process in batches. Each per-triangle hull is independent (C++ runs
        // this loop via for_each_n); results are collected in index order so
        // the batch content matches sequential. C++ pushes every hull
        // unconditionally — no empty filter here (unlike the
        // non-convex×non-convex branch); filtering would shift BatchBoolean
        // serials and change the reduction order.
        let mut offset = 0;
        while offset < num_tri {
            let num_iter = (num_tri - offset).min(BATCH_SIZE);
            let new_hulls: Vec<ManifoldImpl> =
                crate::par::maybe_par_map(num_iter, 8, |iter| {
                    let tri = offset + iter;
                    let mut simple_hull: Vec<Vec3> =
                        Vec::with_capacity(3 * b_impl.vert_pos.len());
                    for i in 0..3 {
                        let a_vert =
                            a_impl.vert_pos[a_impl.halfedge[tri * 3 + i].start_vert as usize];
                        for &b_vert in &b_impl.vert_pos {
                            simple_hull.push(a_vert + b_vert);
                        }
                    }
                    quickhull::convex_hull(&simple_hull)
                });

            composed_hulls.push(batch_boolean_impls(&new_hulls, OpType::Add));
            offset += BATCH_SIZE;
        }

    // Non-Convex + Non-Convex: Very Slow
    } else if !a_convex && !b_convex {
        let num_tri_a = a_impl.num_tri();
        let num_tri_b = b_impl.num_tri();

        let mut accumulated: Vec<ManifoldImpl> = Vec::new();

        for a_face in 0..num_tri_a {
            let a1 = a_impl.vert_pos[a_impl.halfedge[a_face * 3].start_vert as usize];
            let a2 = a_impl.vert_pos[a_impl.halfedge[a_face * 3 + 1].start_vert as usize];
            let a3 = a_impl.vert_pos[a_impl.halfedge[a_face * 3 + 2].start_vert as usize];
            let n_a = a_impl.face_normal[a_face];

            // Per-B-face hulls are independent (C++ parallel for_each_n over
            // bFace); collect in index order, then filter like C++'s
            // validFaceHulls pass so batch content and order match sequential.
            let hulls: Vec<Option<ManifoldImpl>> =
                crate::par::maybe_par_map(num_tri_b, 8, |b_face| {
                    let n_b = b_impl.face_normal[b_face];
                    let dot_same = dot(n_a, n_b);
                    let dot_opp = dot(n_a, Vec3::new(-n_b.x, -n_b.y, -n_b.z));
                    let coplanar = (dot_same - 1.0).abs() < K_COPLANAR_TOL
                        || (dot_opp - 1.0).abs() < K_COPLANAR_TOL;
                    if coplanar {
                        return None;
                    }

                    let b1 = b_impl.vert_pos[b_impl.halfedge[b_face * 3].start_vert as usize];
                    let b2 =
                        b_impl.vert_pos[b_impl.halfedge[b_face * 3 + 1].start_vert as usize];
                    let b3 =
                        b_impl.vert_pos[b_impl.halfedge[b_face * 3 + 2].start_vert as usize];

                    Some(quickhull::convex_hull(&[
                        a1 + b1, a1 + b2, a1 + b3,
                        a2 + b1, a2 + b2, a2 + b3,
                        a3 + b1, a3 + b2, a3 + b3,
                    ]))
                });
            let mut face_hulls: Vec<ManifoldImpl> = Vec::new();
            for hull in hulls.into_iter().flatten() {
                if !hull.is_empty() {
                    face_hulls.push(hull);
                }
            }

            if !face_hulls.is_empty() {
                accumulated.push(batch_boolean_impls(&face_hulls, OpType::Add));
            }

            // Periodically reduce to limit memory
            if accumulated.len() >= REDUCE_THRESHOLD {
                let reduced = batch_boolean_impls(&accumulated, OpType::Add);
                accumulated.clear();
                accumulated.push(reduced);
            }
        }

        if !accumulated.is_empty() {
            composed_hulls.push(batch_boolean_impls(&accumulated, OpType::Add));
        }
    }

    // Final merge; C++ finishes with AsOriginal() = InitializeOriginal +
    // SetNormalsAndCoplanar.
    let op = if inset { OpType::Subtract } else { OpType::Add };
    let mut out = batch_boolean_impls(&composed_hulls, op);
    out.initialize_original();
    out.set_normals_and_coplanar();
    out
}

/// Helper: BatchBoolean on ManifoldImpl directly via the CSG tree.
fn batch_boolean_impls(meshes: &[ManifoldImpl], op: OpType) -> ManifoldImpl {
    if meshes.is_empty() {
        return ManifoldImpl::new();
    }
    if meshes.len() == 1 {
        return meshes[0].clone();
    }

    let children: Vec<CsgNode> = meshes
        .iter()
        .map(|m| CsgNode::leaf_node(CsgLeafNode::new(m.clone())))
        .collect();
    let tree = CsgNode::op_n(op, children);
    tree.evaluate()
}

/// Convenience wrapper: Minkowski sum (dilation).
pub fn minkowski_sum(a: &ManifoldImpl, b: &ManifoldImpl) -> ManifoldImpl {
    minkowski(a, b, false)
}

/// Convenience wrapper: Minkowski difference (erosion).
pub fn minkowski_difference(a: &ManifoldImpl, b: &ManifoldImpl) -> ManifoldImpl {
    minkowski(a, b, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::{mat4_to_mat3x4, scaling_matrix, translation_matrix, Mat3x4};

    #[test]
    fn test_convex_convex_minkowski_sum() {
        let a = ManifoldImpl::cube(&Mat3x4::identity());
        let b = ManifoldImpl::cube(&Mat3x4::identity());
        let sum = minkowski_sum(&a, &b);
        assert!(sum.num_tri() > 0, "Minkowski sum should produce non-empty mesh");
        // Two unit cubes: Minkowski sum should be a 2×2×2 cube
        let vol = sum.get_property(crate::properties::Property::Volume).abs();
        assert!(
            (vol - 8.0).abs() < 0.5,
            "Minkowski sum of two unit cubes should have volume ~8, got {}",
            vol
        );
    }

    #[test]
    fn test_convex_convex_minkowski_difference() {
        let a = ManifoldImpl::cube(&mat4_to_mat3x4(scaling_matrix(Vec3::splat(2.0))));
        let b = ManifoldImpl::cube(&mat4_to_mat3x4(
            translation_matrix(Vec3::splat(-0.25)) * scaling_matrix(Vec3::splat(0.5)),
        ));
        let diff = minkowski_difference(&a, &b);
        assert!(
            diff.num_tri() > 0,
            "Minkowski difference should produce non-empty mesh"
        );
    }

    #[test]
    fn test_empty_minkowski() {
        let a = ManifoldImpl::cube(&Mat3x4::identity());
        let b = ManifoldImpl::new();
        let sum = minkowski_sum(&a, &b);
        // If b is empty, result should be a
        assert_eq!(sum.num_tri(), a.num_tri());
    }
}
