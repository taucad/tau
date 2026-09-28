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

// Phase 16: SDF Mesh Generation — ported from C++ sdf.cpp (538 lines)
//
// Implements Marching Tetrahedra on a body-centered cubic (BCC) grid with:
// - ITP root-finding for precise surface location
// - GridVert snapping to avoid short edges
// - A faithful port of the C++ open-addressing HashTable (hashtable.h):
//   ComputeVerts/BuildTris iterate the table in SLOT order, so the hash
//   function, probing, sizing and resize protocol all determine the output
//   vertex numbering and triangle order. A std HashMap iterates in a random
//   order per process, which made the output nondeterministic.
// - TetTri lookup tables for tetrahedra triangulation

use crate::edge_op::cleanup_topology;
use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{IVec3, IVec4, Vec3};
use crate::types::Box as BBox;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const K_CROSSING: i32 = -2;
const K_NONE: i32 = -1;
const K_VOXEL_OFFSET: IVec4 = IVec4 { x: 1, y: 1, z: 1, w: 0 };
/// Maximum fraction of spacing that a vert can move.
const K_S: f64 = 0.25;
/// Corresponding approximate distance ratio bound.
const K_D: f64 = 1.0 / K_S - 1.0;
/// Maximum number of opposed verts (of 7) to allow collapse.
const K_MAX_OPPOSED: i32 = 3;

// ---------------------------------------------------------------------------
// Lookup tables — TetTri0, TetTri1
// ---------------------------------------------------------------------------

fn tet_tri0(i: usize) -> IVec3 {
    const TABLE: [IVec3; 16] = [
        IVec3 { x: -1, y: -1, z: -1 },
        IVec3 { x: 0, y: 3, z: 4 },
        IVec3 { x: 0, y: 1, z: 5 },
        IVec3 { x: 1, y: 5, z: 3 },
        IVec3 { x: 1, y: 4, z: 2 },
        IVec3 { x: 1, y: 0, z: 3 },
        IVec3 { x: 2, y: 5, z: 0 },
        IVec3 { x: 5, y: 3, z: 2 },
        IVec3 { x: 2, y: 3, z: 5 },
        IVec3 { x: 0, y: 5, z: 2 },
        IVec3 { x: 3, y: 0, z: 1 },
        IVec3 { x: 2, y: 4, z: 1 },
        IVec3 { x: 3, y: 5, z: 1 },
        IVec3 { x: 5, y: 1, z: 0 },
        IVec3 { x: 4, y: 3, z: 0 },
        IVec3 { x: -1, y: -1, z: -1 },
    ];
    TABLE[i]
}

fn tet_tri1(i: usize) -> IVec3 {
    const TABLE: [IVec3; 16] = [
        IVec3 { x: -1, y: -1, z: -1 },
        IVec3 { x: -1, y: -1, z: -1 },
        IVec3 { x: -1, y: -1, z: -1 },
        IVec3 { x: 3, y: 4, z: 1 },
        IVec3 { x: -1, y: -1, z: -1 },
        IVec3 { x: 3, y: 2, z: 1 },
        IVec3 { x: 0, y: 4, z: 2 },
        IVec3 { x: -1, y: -1, z: -1 },
        IVec3 { x: -1, y: -1, z: -1 },
        IVec3 { x: 2, y: 4, z: 0 },
        IVec3 { x: 1, y: 2, z: 3 },
        IVec3 { x: -1, y: -1, z: -1 },
        IVec3 { x: 1, y: 4, z: 3 },
        IVec3 { x: -1, y: -1, z: -1 },
        IVec3 { x: -1, y: -1, z: -1 },
        IVec3 { x: -1, y: -1, z: -1 },
    ];
    TABLE[i]
}

// ---------------------------------------------------------------------------
// BCC grid neighbor offsets
// ---------------------------------------------------------------------------

fn neighbor(base: IVec4, i: usize) -> IVec4 {
    const NEIGHBORS: [IVec4; 14] = [
        IVec4 { x: 0, y: 0, z: 0, w: 1 },
        IVec4 { x: 1, y: 0, z: 0, w: 0 },
        IVec4 { x: 0, y: 1, z: 0, w: 0 },
        IVec4 { x: 0, y: 0, z: 1, w: 0 },
        IVec4 { x: -1, y: 0, z: 0, w: 1 },
        IVec4 { x: 0, y: -1, z: 0, w: 1 },
        IVec4 { x: 0, y: 0, z: -1, w: 1 },
        IVec4 { x: -1, y: -1, z: -1, w: 1 },
        IVec4 { x: -1, y: 0, z: 0, w: 0 },
        IVec4 { x: 0, y: -1, z: 0, w: 0 },
        IVec4 { x: 0, y: 0, z: -1, w: 0 },
        IVec4 { x: 0, y: -1, z: -1, w: 1 },
        IVec4 { x: -1, y: 0, z: -1, w: 1 },
        IVec4 { x: -1, y: -1, z: 0, w: 1 },
    ];
    let mut neighbor_index = ivec4_add(base, NEIGHBORS[i]);
    if neighbor_index.w == 2 {
        neighbor_index.x += 1;
        neighbor_index.y += 1;
        neighbor_index.z += 1;
        neighbor_index.w = 0;
    }
    neighbor_index
}

// ---------------------------------------------------------------------------
// Grid encoding/decoding
// ---------------------------------------------------------------------------

fn encode_index(grid_pos: IVec4, grid_pow: IVec3) -> u64 {
    (grid_pos.w as u64)
        | (grid_pos.z as u64) << 1
        | (grid_pos.y as u64) << (1 + grid_pow.z)
        | (grid_pos.x as u64) << (1 + grid_pow.z + grid_pow.y)
}

fn decode_index(mut idx: u64, grid_pow: IVec3) -> IVec4 {
    let w = (idx & 1) as i32;
    idx >>= 1;
    let z = (idx & ((1u64 << grid_pow.z) - 1)) as i32;
    idx >>= grid_pow.z;
    let y = (idx & ((1u64 << grid_pow.y) - 1)) as i32;
    idx >>= grid_pow.y;
    let x = (idx & ((1u64 << grid_pow.x) - 1)) as i32;
    IVec4::new(x, y, z, w)
}

fn position(grid_index: IVec4, origin: Vec3, spacing: Vec3) -> Vec3 {
    let offset = if grid_index.w == 1 { 0.0 } else { -0.5 };
    origin + Vec3::new(
        spacing.x * (grid_index.x as f64 + offset),
        spacing.y * (grid_index.y as f64 + offset),
        spacing.z * (grid_index.z as f64 + offset),
    )
}

fn bound(pos: Vec3, origin: Vec3, spacing: Vec3, grid_size: IVec3) -> Vec3 {
    let max_bound = Vec3::new(
        origin.x + spacing.x * (grid_size.x as f64 - 1.0),
        origin.y + spacing.y * (grid_size.y as f64 - 1.0),
        origin.z + spacing.z * (grid_size.z as f64 - 1.0),
    );
    Vec3::new(
        pos.x.max(origin.x).min(max_bound.x),
        pos.y.max(origin.y).min(max_bound.y),
        pos.z.max(origin.z).min(max_bound.z),
    )
}

fn bounded_sdf(
    grid_index: IVec4,
    origin: Vec3,
    spacing: Vec3,
    grid_size: IVec3,
    level: f64,
    sdf: &(dyn Fn(Vec3) -> f64 + Sync),
) -> f64 {
    let xyz = IVec3::new(grid_index.x, grid_index.y, grid_index.z);
    let lower_bound_dist = xyz.x.min(xyz.y).min(xyz.z);
    let upper_bound_dist = (grid_size.x - xyz.x).min(grid_size.y - xyz.y).min(grid_size.z - xyz.z);
    let bound_dist = lower_bound_dist.min(upper_bound_dist - grid_index.w);

    if bound_dist < 0 {
        return 0.0;
    }
    let d = sdf(position(grid_index, origin, spacing)) - level;
    if bound_dist == 0 { d.min(0.0) } else { d }
}

// ---------------------------------------------------------------------------
// ITP root-finding
// ---------------------------------------------------------------------------

fn find_surface(
    mut pos0: Vec3,
    mut d0: f64,
    mut pos1: Vec3,
    mut d1: f64,
    tol: f64,
    level: f64,
    sdf: &(dyn Fn(Vec3) -> f64 + Sync),
) -> Vec3 {
    if d0 == 0.0 {
        return pos0;
    } else if d1 == 0.0 {
        return pos1;
    }

    let k = 0.1;
    let diff = pos0 - pos1;
    let len = (diff.x * diff.x + diff.y * diff.y + diff.z * diff.z).sqrt();
    let check = 2.0 * tol / len;
    let mut frac = 1.0;
    let mut bi_frac = 1.0;
    while frac > check {
        let t_raw = d0 / (d0 - d1);
        let t = t_raw * (1.0 - k) + 0.5 * k; // la::lerp(t_raw, 0.5, k) = a*(1-t)+b*t
        let r = bi_frac / frac - 0.5;
        let x = if (t - 0.5).abs() < r {
            t
        } else {
            0.5 - r * if t < 0.5 { 1.0 } else { -1.0 }
        };

        let mid = lerp_vec3(pos0, pos1, x);
        let d = sdf(mid) - level;

        if (d > 0.0) == (d0 > 0.0) {
            d0 = d;
            pos0 = mid;
            frac *= 1.0 - x;
        } else {
            d1 = d;
            pos1 = mid;
            frac *= x;
        }
        bi_frac /= 2.0;
    }

    lerp_vec3(pos0, pos1, d0 / (d0 - d1))
}

// ---------------------------------------------------------------------------
// GridVert
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct GridVert {
    distance: f64,
    moved_vert: i32,
    edge_verts: [i32; 7],
}

impl Default for GridVert {
    fn default() -> Self {
        Self {
            distance: f64::NAN,
            moved_vert: K_NONE,
            edge_verts: [K_NONE; 7],
        }
    }
}

impl GridVert {
    fn has_moved(&self) -> bool {
        self.moved_vert >= 0
    }

    fn same_side(&self, dist: f64) -> bool {
        (dist > 0.0) == (self.distance > 0.0)
    }

    fn inside(&self) -> i32 {
        if self.distance > 0.0 { 1 } else { -1 }
    }

    fn neighbor_inside(&self, i: usize) -> i32 {
        self.inside() * if self.edge_verts[i] == K_NONE { 1 } else { -1 }
    }
}

// ---------------------------------------------------------------------------
// Helper math
// ---------------------------------------------------------------------------

#[inline]
fn ivec4_add(a: IVec4, b: IVec4) -> IVec4 {
    IVec4::new(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w)
}

/// C++ `la::lerp(a, b, t)` is `a*(1-t) + b*t` — NOT `a + (b-a)*t`. The two
/// differ in float association, which shifts the ITP midpoints and hence the
/// refined surface verts; keep the C++ form bit-for-bit.
#[inline]
fn lerp_vec3(a: Vec3, b: Vec3, t: f64) -> Vec3 {
    Vec3::new(
        a.x * (1.0 - t) + b.x * t,
        a.y * (1.0 - t) + b.y * t,
        a.z * (1.0 - t) + b.z * t,
    )
}

#[inline]
fn next3(i: i32) -> i32 {
    if i == 2 { 0 } else { i + 1 }
}

#[inline]
fn prev3(i: i32) -> i32 {
    if i == 0 { 2 } else { i - 1 }
}

// ---------------------------------------------------------------------------
// HashTable — port of C++ hashtable.h (open addressing, linear probing)
// ---------------------------------------------------------------------------

const K_OPEN: u64 = u64::MAX;

/// C++ `hash64bit` (utils.h) — splitmix64-style finalizer.
#[inline]
fn hash64bit(mut x: u64) -> u64 {
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d049bb133111eb);
    x ^ (x >> 31)
}

#[inline]
fn ceil_log2_usize(v: usize) -> u32 {
    if v <= 1 { 0 } else { usize::BITS - (v - 1).leading_zeros() }
}

/// Open-addressing hash table matching C++ `HashTable<GridVert>`: capacity is
/// the next power of two, probing is linear (step 1), `Full()` is used*2 >
/// size, and lookups of absent keys return the default value sitting in the
/// first open slot — all of which the marching phases depend on for their
/// SLOT-ORDER iteration.
struct GridHashTable {
    keys: Vec<u64>,
    values: Vec<GridVert>,
    used: usize,
}

impl GridHashTable {
    fn new(size: usize) -> Self {
        let n = if size == 0 { 0 } else { 1usize << ceil_log2_usize(size) };
        GridHashTable {
            keys: vec![K_OPEN; n],
            values: vec![GridVert::default(); n],
            used: 0,
        }
    }

    #[inline]
    fn size(&self) -> usize {
        self.keys.len()
    }

    #[inline]
    fn full(&self) -> bool {
        self.used * 2 > self.size()
    }

    fn insert(&mut self, key: u64, val: GridVert) {
        let mask = self.size() - 1;
        let mut idx = (hash64bit(key) as usize) & mask;
        loop {
            if self.full() {
                return;
            }
            let k = self.keys[idx];
            if k == K_OPEN {
                self.keys[idx] = key;
                self.used += 1;
                self.values[idx] = val;
                return;
            }
            if k == key {
                return;
            }
            idx = (idx + 1) & mask;
        }
    }

    /// Probe for `key`; stops at the key's slot or the first open slot (whose
    /// default-initialized value serves as the "missing" GridVert, matching
    /// C++ operator[] semantics).
    #[inline]
    fn slot_of(&self, key: u64) -> usize {
        let mask = self.size() - 1;
        let mut idx = (hash64bit(key) as usize) & mask;
        loop {
            let k = self.keys[idx];
            if k == key || k == K_OPEN {
                return idx;
            }
            idx = (idx + 1) & mask;
        }
    }

    #[inline]
    fn get(&self, key: u64) -> &GridVert {
        &self.values[self.slot_of(key)]
    }
}

// ---------------------------------------------------------------------------
// Main level_set function — port of C++ Manifold::LevelSet()
// ---------------------------------------------------------------------------

/// Generate a mesh from a signed distance function using Marching Tetrahedra
/// on a body-centered cubic (BCC) grid.
///
/// `sdf`: Signed-distance function. Positive values are inside, negative outside.
/// `bounds`: Axis-aligned box defining the grid extent.
/// `edge_length`: Approximate maximum edge length of output triangles.
/// `level`: Extract surface at this SDF value (default 0).
/// `tolerance`: Max distance from true surface per vertex. Negative = use interpolation only.
pub fn level_set<F: Fn(Vec3) -> f64 + Sync>(
    sdf: F,
    bounds: BBox,
    edge_length: f64,
    level: f64,
    tolerance: f64,
) -> ManifoldImpl {
    if edge_length <= 0.0 {
        return ManifoldImpl::new();
    }

    let tol = if tolerance <= 0.0 { f64::INFINITY } else { tolerance };

    let dim = bounds.size();
    let grid_size = IVec3::new(
        (dim.x / edge_length + 1.0) as i32,
        (dim.y / edge_length + 1.0) as i32,
        (dim.z / edge_length + 1.0) as i32,
    );
    let spacing = Vec3::new(
        dim.x / (grid_size.x as f64 - 1.0).max(1.0),
        dim.y / (grid_size.y as f64 - 1.0).max(1.0),
        dim.z / (grid_size.z as f64 - 1.0).max(1.0),
    );

    // C++ ComputeGridPow: axisPow(n) = CeilLog2(n + 2 + 1) — the bit widths
    // feed the index ENCODING, and encoded indices are the hash-table keys, so
    // this must match C++ exactly for slot order to match.
    let axis_pow = |n: i32| -> i32 { ceil_log2_usize((n as usize) + 3) as i32 };
    let grid_pow = IVec3::new(
        axis_pow(grid_size.x),
        axis_pow(grid_size.y),
        axis_pow(grid_size.z),
    );
    let max_index = encode_index(
        IVec4::new(grid_size.x + 2, grid_size.y + 2, grid_size.z + 2, 1),
        grid_pow,
    );

    let origin = bounds.min;

    // Evaluate SDF at all grid points into a flat dense array indexed directly
    // by the encoded index, matching C++ `Vec<double> voxels(maxIndex)`. The
    // encoded indices are contiguous in [0, max_index), so a Vec gives O(1)
    // direct access; the previous HashMap<u64,f64> paid SipHash on millions of
    // keys (both inserts and the 14-neighbor lookups per grid vert), which
    // dominated runtime on fine grids (sdf_blobs/sdf_sphere_shell).
    // Each voxel is an independent SDF evaluation with an indexed write, so
    // the parallel path is bit-identical to sequential.
    let voxels: Vec<f64> = crate::par::maybe_par_map(max_index as usize, 10_000, |idx| {
        let gi = decode_index(idx as u64, grid_pow);
        let gi_shifted = ivec4_add(
            gi,
            IVec4::new(-K_VOXEL_OFFSET.x, -K_VOXEL_OFFSET.y, -K_VOXEL_OFFSET.z, -K_VOXEL_OFFSET.w),
        );
        bounded_sdf(gi_shifted, origin, spacing, grid_size, level, &sdf)
    });

    let get_voxel = |gi: IVec4| -> f64 {
        let key = encode_index(ivec4_add(gi, K_VOXEL_OFFSET), grid_pow);
        voxels.get(key as usize).copied().unwrap_or(0.0)
    };

    // Table sizing per C++ LevelSet: dense cap of 2*maxIndex, sparse heuristic
    // of 10*sqrt(maxIndex); on overflow the whole NearSurface pass reruns with
    // a bigger table (sizing from the last vert's grid position).
    let table_size_cap = usize::MAX as u64;
    let dense_table_size = if max_index > table_size_cap / 2 {
        table_size_cap
    } else {
        2 * max_index
    };
    let sparse_table_size =
        table_size_cap.min((10.0 * (max_index as f64).sqrt()) as u64);
    let mut table_size = dense_table_size.min(sparse_table_size).max(1) as usize;
    let mut grid_verts = GridHashTable::new(table_size);
    let mut vert_pos: Vec<Vec3> = Vec::new();

    let surface_max = encode_index(IVec4::new(grid_size.x, grid_size.y, grid_size.z, 1), grid_pow);
    loop {
        // Phase 1: NearSurface — identify grid verts near the surface
        for index in 0..surface_max {
            if grid_verts.full() {
                break;
            }
            let grid_index = decode_index(index, grid_pow);
            if grid_index.x > grid_size.x
                || grid_index.y > grid_size.y
                || grid_index.z > grid_size.z
            {
                continue;
            }

            let mut grid_vert = GridVert::default();
            grid_vert.distance = get_voxel(grid_index);

            let mut keep = false;
            let mut v_max: f64 = 0.0;
            let mut closest_neighbor: i32 = -1;
            let mut opposed_verts = 0;

            for i in 0..7 {
                let val = get_voxel(neighbor(grid_index, i));
                let val_op = get_voxel(neighbor(grid_index, i + 7));

                if !grid_vert.same_side(val) {
                    grid_vert.edge_verts[i] = K_CROSSING;
                    keep = true;
                    if !grid_vert.same_side(val_op) {
                        opposed_verts += 1;
                    }
                    if val.abs() > K_D * grid_vert.distance.abs() && val.abs() > v_max.abs() {
                        v_max = val;
                        closest_neighbor = i as i32;
                    }
                } else if !grid_vert.same_side(val_op)
                    && val_op.abs() > K_D * grid_vert.distance.abs()
                    && val_op.abs() > v_max.abs()
                {
                    v_max = val_op;
                    closest_neighbor = (i + 7) as i32;
                }
            }

            // Snap to surface if possible
            if closest_neighbor >= 0 && opposed_verts <= K_MAX_OPPOSED {
                let grid_pos = position(grid_index, origin, spacing);
                let neighbor_index = neighbor(grid_index, closest_neighbor as usize);
                let pos = find_surface(
                    grid_pos,
                    grid_vert.distance,
                    position(neighbor_index, origin, spacing),
                    v_max,
                    tol,
                    level,
                    &sdf,
                );
                let delta = Vec3::new(
                    (pos.x - grid_pos.x).abs(),
                    (pos.y - grid_pos.y).abs(),
                    (pos.z - grid_pos.z).abs(),
                );
                if delta.x < K_S * spacing.x
                    && delta.y < K_S * spacing.y
                    && delta.z < K_S * spacing.z
                {
                    let idx = vert_pos.len() as i32;
                    vert_pos.push(bound(pos, origin, spacing, grid_size));
                    grid_vert.moved_vert = idx;
                    for j in 0..7 {
                        if grid_vert.edge_verts[j] == K_CROSSING {
                            grid_vert.edge_verts[j] = idx;
                        }
                    }
                    keep = true;
                }
            } else {
                for j in 0..7 {
                    grid_vert.edge_verts[j] = K_NONE;
                }
            }

            if keep {
                grid_verts.insert(index, grid_vert);
            }
        }

        if grid_verts.full() {
            // Resize per C++: estimate the fill ratio from how far through the
            // grid the last allocated vert got, then rerun from scratch.
            let last_vert = *vert_pos.last().expect("table full before any vert");
            let last_index = encode_index(
                IVec4::new(
                    ((last_vert.x - origin.x) / spacing.x) as i32,
                    ((last_vert.y - origin.y) / spacing.y) as i32,
                    ((last_vert.z - origin.z) / spacing.z) as i32,
                    1,
                ),
                grid_pow,
            );
            let ratio = max_index as f64 / last_index as f64;
            if ratio > 1000.0 {
                table_size *= 2;
            } else {
                table_size = (table_size as f64 * ratio) as usize;
            }
            grid_verts = GridHashTable::new(table_size);
            vert_pos.clear();
        } else {
            break;
        }
    }

    // Phase 2: ComputeVerts — create edge-crossing vertices, iterating the
    // hash table in SLOT order (this fixes the output vert numbering).
    for slot in 0..grid_verts.size() {
        if grid_verts.keys[slot] == K_OPEN {
            continue;
        }
        let base_key = grid_verts.keys[slot];
        let grid_vert_clone = grid_verts.values[slot].clone();
        if grid_vert_clone.has_moved() {
            continue;
        }

        let grid_index = decode_index(base_key, grid_pow);
        let pos = position(grid_index, origin, spacing);

        let mut updates = Vec::new();
        for i in 0..7 {
            let neighbor_index = neighbor(grid_index, i);
            let neighbor_key = encode_index(neighbor_index, grid_pow);
            let nv = grid_verts.get(neighbor_key);

            let val = if nv.distance.is_finite() {
                nv.distance
            } else {
                get_voxel(neighbor_index)
            };

            if grid_vert_clone.same_side(val) {
                continue;
            }

            if nv.has_moved() {
                updates.push((i, nv.moved_vert));
                continue;
            }

            let new_pos = find_surface(
                pos,
                grid_vert_clone.distance,
                position(neighbor_index, origin, spacing),
                val,
                tol,
                level,
                &sdf,
            );
            let idx = vert_pos.len() as i32;
            vert_pos.push(bound(new_pos, origin, spacing, grid_size));
            updates.push((i, idx));
        }

        for (i, idx) in updates {
            grid_verts.values[slot].edge_verts[i] = idx;
        }
    }

    // Phase 3: BuildTris — generate triangles from tetrahedra, in slot order.
    let mut tri_verts: Vec<IVec3> = Vec::new();

    let get_grid_vert = |key: u64| -> GridVert { grid_verts.get(key).clone() };

    for slot in 0..grid_verts.size() {
        let base_key = grid_verts.keys[slot];
        if base_key == K_OPEN {
            continue;
        }
        let base = grid_verts.values[slot].clone();
        let base_index = decode_index(base_key, grid_pow);

        let mut lead_index = base_index;
        if lead_index.w == 0 {
            lead_index.w = 1;
        } else {
            lead_index.x += 1;
            lead_index.y += 1;
            lead_index.z += 1;
            lead_index.w = 0;
        }

        // 6 tetrahedra around the (1,1,1) edge
        let mut tet = IVec4::new(base.neighbor_inside(0), base.inside(), -2, -2);
        let mut this_index = base_index;
        this_index.x += 1;
        let mut this_vert = get_grid_vert(encode_index(this_index, grid_pow));

        tet[2] = base.neighbor_inside(1);
        for i in 0..3 {
            this_index = lead_index;
            this_index[prev3(i as i32) as usize] -= 1;

            let next_vert = if this_index[prev3(i as i32) as usize] < 0 {
                GridVert::default()
            } else {
                get_grid_vert(encode_index(this_index, grid_pow))
            };
            tet[3] = base.neighbor_inside((prev3(i as i32) + 4) as usize);

            let edges1 = [
                base.edge_verts[0],
                base.edge_verts[i + 1],
                next_vert.edge_verts[(next3(i as i32) + 4) as usize],
                next_vert.edge_verts[(prev3(i as i32) + 1) as usize],
                this_vert.edge_verts[(i as i32 + 4) as usize],
                base.edge_verts[(prev3(i as i32) + 4) as usize],
            ];
            this_vert = next_vert;
            create_tris(&mut tri_verts, tet, &edges1);

            this_index = base_index;
            this_index[next3(i as i32) as usize] += 1;
            let next_vert = get_grid_vert(encode_index(this_index, grid_pow));
            tet[2] = tet[3];
            tet[3] = base.neighbor_inside((next3(i as i32) + 1) as usize);

            let edges2 = [
                base.edge_verts[0],
                edges1[5],
                this_vert.edge_verts[(i as i32 + 4) as usize],
                next_vert.edge_verts[(next3(i as i32) + 4) as usize],
                edges1[3],
                base.edge_verts[(next3(i as i32) + 1) as usize],
            ];
            this_vert = next_vert;
            create_tris(&mut tri_verts, tet, &edges2);

            tet[2] = tet[3];
        }
    }

    // Build the mesh
    if tri_verts.is_empty() || vert_pos.is_empty() {
        return ManifoldImpl::new();
    }

    let mut result = ManifoldImpl::new();
    result.vert_pos = vert_pos;
    result.create_halfedges(&tri_verts, &[]);
    cleanup_topology(&mut result);
    result.remove_unreferenced_verts();
    result.initialize_original();
    result.calculate_bbox();
    result.set_epsilon(-1.0, false);
    result.sort_geometry();
    result.set_normals_and_coplanar();
    result
}

fn create_tri(tri_verts: &mut Vec<IVec3>, tri: IVec3, edges: &[i32; 6]) {
    if tri[0] < 0 {
        return;
    }
    let verts = IVec3::new(
        edges[tri[0] as usize],
        edges[tri[1] as usize],
        edges[tri[2] as usize],
    );
    if verts[0] == verts[1] || verts[1] == verts[2] || verts[2] == verts[0] {
        return;
    }
    tri_verts.push(verts);
}

fn create_tris(tri_verts: &mut Vec<IVec3>, tet: IVec4, edges: &[i32; 6]) {
    let i = (if tet[0] > 0 { 1 } else { 0 })
        + (if tet[1] > 0 { 2 } else { 0 })
        + (if tet[2] > 0 { 4 } else { 0 })
        + (if tet[3] > 0 { 8 } else { 0 });
    create_tri(tri_verts, tet_tri0(i), edges);
    create_tri(tri_verts, tet_tri1(i), edges);
}

// ---------------------------------------------------------------------------
// Convenience wrapper matching old API
// ---------------------------------------------------------------------------

/// Simple wrapper that calls level_set with default level=0 and tolerance=-1.
pub fn level_set_simple<F: Fn(Vec3) -> f64 + Sync>(
    sdf: F,
    bounds: BBox,
    edge_length: f64,
) -> ManifoldImpl {
    level_set(sdf, bounds, edge_length, 0.0, -1.0)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_level_set_sphere() {
        let bounds =
            BBox::from_points(Vec3::new(-2.0, -2.0, -2.0), Vec3::new(2.0, 2.0, 2.0));
        let mesh = level_set(
            |p| 1.0 - (p.x * p.x + p.y * p.y + p.z * p.z).sqrt(),
            bounds,
            0.5,
            0.0,
            -1.0,
        );
        assert!(mesh.num_tri() > 0, "Sphere SDF should produce triangles");
        assert!(mesh.num_vert() > 0, "Sphere SDF should produce vertices");
    }

    #[test]
    fn test_level_set_cube_sdf() {
        let bounds =
            BBox::from_points(Vec3::new(-2.0, -2.0, -2.0), Vec3::new(2.0, 2.0, 2.0));
        let mesh = level_set(
            |p| {
                // SDF of a unit cube centered at origin
                let d = Vec3::new(p.x.abs() - 1.0, p.y.abs() - 1.0, p.z.abs() - 1.0);
                let outside =
                    (d.x.max(0.0) * d.x.max(0.0) + d.y.max(0.0) * d.y.max(0.0) + d.z.max(0.0) * d.z.max(0.0)).sqrt();
                let inside = d.x.max(d.y).max(d.z).min(0.0);
                -(outside + inside) // negate: C++ convention is positive inside
            },
            bounds,
            0.5,
            0.0,
            -1.0,
        );
        assert!(mesh.num_tri() > 0, "Cube SDF should produce triangles");
    }

    #[test]
    fn test_encode_decode_roundtrip() {
        let grid_pow = IVec3::new(4, 4, 4);
        let pos = IVec4::new(3, 5, 7, 1);
        let encoded = encode_index(pos, grid_pow);
        let decoded = decode_index(encoded, grid_pow);
        assert_eq!(decoded, pos);
    }

    #[test]
    fn test_level_set_empty() {
        let bounds =
            BBox::from_points(Vec3::new(-1.0, -1.0, -1.0), Vec3::new(1.0, 1.0, 1.0));
        // SDF that is always negative (outside) — should produce empty mesh
        let mesh = level_set(|_| -1.0, bounds, 0.5, 0.0, -1.0);
        assert_eq!(mesh.num_tri(), 0, "Negative SDF should produce no triangles");
    }

    #[test]
    fn test_level_set_simple_wrapper() {
        let bounds =
            BBox::from_points(Vec3::new(-2.0, -2.0, -2.0), Vec3::new(2.0, 2.0, 2.0));
        let mesh = level_set_simple(
            |p| 1.0 - (p.x * p.x + p.y * p.y + p.z * p.z).sqrt(),
            bounds,
            0.5,
        );
        assert!(mesh.num_tri() > 0);
    }
}
