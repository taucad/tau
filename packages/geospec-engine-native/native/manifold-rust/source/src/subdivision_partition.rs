// Partition — cached topological triangulation for subdivision
// Split from subdivision.rs
// Port of C++ Partition class (lines 31-380)

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;

use crate::linalg::{BVec4, IVec3, IVec4, Vec4};

// ---------------------------------------------------------------------------
// BaryIndices — maps halfedge to triangle + 4D index pair
// Port of C++ Manifold::Impl::BaryIndices
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
pub(crate) struct BaryIndices {
    pub tri: i32,
    pub start4: i32,
    pub end4: i32,
}

// ---------------------------------------------------------------------------
// Partition — cached topological triangulation
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub(crate) struct Partition {
    pub idx: IVec4,
    pub sorted_divisions: IVec4,
    pub vert_bary: Vec<Vec4>,
    pub tri_vert: Vec<IVec3>,
}

impl Partition {
    pub fn new() -> Self {
        Self {
            idx: IVec4::default(),
            sorted_divisions: IVec4::default(),
            vert_bary: Vec::new(),
            tri_vert: Vec::new(),
        }
    }

    pub fn interior_offset(&self) -> i32 {
        self.sorted_divisions[0] + self.sorted_divisions[1]
            + self.sorted_divisions[2] + self.sorted_divisions[3]
    }

    pub fn num_interior(&self) -> i32 {
        self.vert_bary.len() as i32 - self.interior_offset()
    }

    /// Port of C++ Partition::GetPartition(ivec4 divisions)
    pub fn get_partition(divisions: IVec4) -> Partition {
        if divisions[0] == 0 {
            return Partition::new(); // skip wrong side of quad
        }

        let mut sorted_div = divisions;
        let mut tri_idx = IVec4::new(0, 1, 2, 3);

        if divisions[3] == 0 {
            // triangle: sort descending
            if sorted_div[2] > sorted_div[1] {
                swap_i32(&mut sorted_div, &mut tri_idx, 2, 1);
            }
            if sorted_div[1] > sorted_div[0] {
                swap_i32(&mut sorted_div, &mut tri_idx, 1, 0);
                if sorted_div[2] > sorted_div[1] {
                    swap_i32(&mut sorted_div, &mut tri_idx, 2, 1);
                }
            }
        } else {
            // quad: rotate to canonical form
            let mut min_idx = 0;
            let mut min = divisions[0];
            let mut next = divisions[1];
            for i in 1..4 {
                let n = divisions[(i + 1) % 4];
                if divisions[i] < min || (divisions[i] == min && n < next) {
                    min_idx = i;
                    min = divisions[i];
                    next = n;
                }
            }
            let tmp = sorted_div;
            for i in 0..4 {
                tri_idx[i] = ((i + min_idx) % 4) as i32;
                sorted_div[i] = tmp[tri_idx[i] as usize];
            }
        }

        let mut partition = Self::get_cached_partition(sorted_div);
        partition.idx = tri_idx;
        partition
    }

    /// Port of C++ Partition::Reindex()
    pub fn reindex(
        &self,
        tri_verts: IVec4,
        edge_offsets: IVec4,
        mut edge_fwd: BVec4,
        interior_offset: i32,
    ) -> Vec<IVec3> {
        let mut new_verts: Vec<i32> = Vec::with_capacity(self.vert_bary.len());
        let mut tri_idx = self.idx;
        let mut out_tri = IVec4::new(0, 1, 2, 3);

        if tri_verts[3] < 0 && self.idx[1] != next3(self.idx[0]) {
            tri_idx = IVec4::new(self.idx[2], self.idx[0], self.idx[1], self.idx[3]);
            edge_fwd = !edge_fwd;
            // swap outTri[0] and outTri[1]
            let tmp = out_tri[0];
            out_tri[0] = out_tri[1];
            out_tri[1] = tmp;
        }

        for i in 0..4 {
            if tri_verts[tri_idx[i] as usize] >= 0 {
                new_verts.push(tri_verts[tri_idx[i] as usize]);
            }
        }

        for i in 0..4 {
            let n = self.sorted_divisions[i] - 1;
            let mut offset = edge_offsets[self.idx[i] as usize]
                + if edge_fwd[self.idx[i] as usize] { 0 } else { n - 1 };
            for _ in 0..n {
                new_verts.push(offset);
                offset += if edge_fwd[self.idx[i] as usize] { 1 } else { -1 };
            }
        }

        let offset = interior_offset - new_verts.len() as i32;
        let old = new_verts.len();
        new_verts.resize(self.vert_bary.len(), 0);
        for (j, slot) in new_verts[old..].iter_mut().enumerate() {
            *slot = (old + j) as i32 + offset;
        }

        let num_tri = self.tri_vert.len();
        let mut new_tri_vert = vec![IVec3::default(); num_tri];
        for tri in 0..num_tri {
            for j in 0..3 {
                new_tri_vert[tri][out_tri[j] as usize] =
                    new_verts[self.tri_vert[tri][j] as usize];
            }
        }
        new_tri_vert
    }

    /// Port of C++ Partition::GetCachedPartition(ivec4 n)
    fn get_cached_partition(n: IVec4) -> Partition {
        // Check cache
        {
            let cache = partition_cache().lock().unwrap();
            if let Some(cached) = cache.get(&(n.x, n.y, n.z, n.w)) {
                return cached.clone();
            }
        }

        let mut partition = Partition::new();
        partition.sorted_divisions = n;

        if n[3] > 0 {
            // quad
            partition.vert_bary.push(Vec4::new(1.0, 0.0, 0.0, 0.0));
            partition.vert_bary.push(Vec4::new(0.0, 1.0, 0.0, 0.0));
            partition.vert_bary.push(Vec4::new(0.0, 0.0, 1.0, 0.0));
            partition.vert_bary.push(Vec4::new(0.0, 0.0, 0.0, 1.0));

            let mut edge_offsets = IVec4::default();
            edge_offsets[0] = 4;
            for i in 0..4 {
                if i > 0 {
                    edge_offsets[i] = edge_offsets[i - 1] + n[i - 1] - 1;
                }
                let next_bary = partition.vert_bary[(i + 1) % 4];
                for j in 1..n[i] {
                    partition.vert_bary.push(lerp_vec4(
                        partition.vert_bary[i],
                        next_bary,
                        j as f64 / n[i] as f64,
                    ));
                }
            }
            let n_minus_1 = IVec4::new(n[0] - 1, n[1] - 1, n[2] - 1, n[3] - 1);
            partition_quad(
                &mut partition.tri_vert,
                &mut partition.vert_bary,
                IVec4::new(0, 1, 2, 3),
                edge_offsets,
                n_minus_1,
                BVec4::splat(true),
            );
        } else {
            // triangle
            partition.vert_bary.push(Vec4::new(1.0, 0.0, 0.0, 0.0));
            partition.vert_bary.push(Vec4::new(0.0, 1.0, 0.0, 0.0));
            partition.vert_bary.push(Vec4::new(0.0, 0.0, 1.0, 0.0));

            for i in 0..3 {
                let next_bary = partition.vert_bary[(i + 1) % 3];
                for j in 1..n[i] {
                    partition.vert_bary.push(lerp_vec4(
                        partition.vert_bary[i],
                        next_bary,
                        j as f64 / n[i] as f64,
                    ));
                }
            }
            let edge_offsets = IVec4::new(3, 3 + n[0] - 1, 3 + n[0] - 1 + n[1] - 1, 0);

            let f = (n[2] * n[2] + n[0] * n[0]) as f64;
            if n[1] == 1 {
                if n[0] == 1 {
                    partition.tri_vert.push(IVec3::new(0, 1, 2));
                } else {
                    partition_fan(
                        &mut partition.tri_vert,
                        IVec3::new(0, 1, 2),
                        n[0] - 1,
                        edge_offsets[0],
                    );
                }
            } else if (n[1] * n[1]) as f64 > f - (2.0_f64).sqrt() * n[0] as f64 * n[2] as f64 {
                // acute-ish
                partition.tri_vert.push(IVec3::new(
                    edge_offsets[1] - 1,
                    1,
                    edge_offsets[1],
                ));
                partition_quad(
                    &mut partition.tri_vert,
                    &mut partition.vert_bary,
                    IVec4::new(edge_offsets[1] - 1, edge_offsets[1], 2, 0),
                    IVec4::new(-1, edge_offsets[1] + 1, edge_offsets[2], edge_offsets[0]),
                    IVec4::new(0, n[1] - 2, n[2] - 1, n[0] - 2),
                    BVec4::splat(true),
                );
            } else {
                // obtuse -> split into two acute
                let ns = (n[0] - 2).min(
                    ((f - (n[1] * n[1]) as f64) / (2.0 * n[0] as f64)).round() as i32,
                );
                let nh = 1.0_f64
                    .max(((n[2] * n[2] - ns * ns) as f64).sqrt().round())
                    as i32;

                let h_offset = partition.vert_bary.len() as i32;
                let middle_bary = partition.vert_bary[(edge_offsets[0] + ns - 1) as usize];
                for j in 1..nh {
                    partition.vert_bary.push(lerp_vec4(
                        partition.vert_bary[2],
                        middle_bary,
                        j as f64 / nh as f64,
                    ));
                }

                partition.tri_vert.push(IVec3::new(
                    edge_offsets[1] - 1,
                    1,
                    edge_offsets[1],
                ));
                partition_quad(
                    &mut partition.tri_vert,
                    &mut partition.vert_bary,
                    IVec4::new(
                        edge_offsets[1] - 1,
                        edge_offsets[1],
                        2,
                        edge_offsets[0] + ns - 1,
                    ),
                    IVec4::new(-1, edge_offsets[1] + 1, h_offset, edge_offsets[0] + ns),
                    IVec4::new(0, n[1] - 2, nh - 1, n[0] - ns - 2),
                    BVec4::splat(true),
                );

                if n[2] == 1 {
                    partition_fan(
                        &mut partition.tri_vert,
                        IVec3::new(0, edge_offsets[0] + ns - 1, 2),
                        ns - 1,
                        edge_offsets[0],
                    );
                } else if ns == 1 {
                    partition.tri_vert.push(IVec3::new(
                        h_offset,
                        2,
                        edge_offsets[2],
                    ));
                    partition_quad(
                        &mut partition.tri_vert,
                        &mut partition.vert_bary,
                        IVec4::new(h_offset, edge_offsets[2], 0, edge_offsets[0]),
                        IVec4::new(-1, edge_offsets[2] + 1, -1, h_offset + nh - 2),
                        IVec4::new(0, n[2] - 2, ns - 1, nh - 2),
                        BVec4::new(true, true, true, false),
                    );
                } else {
                    partition.tri_vert.push(IVec3::new(
                        h_offset - 1,
                        0,
                        edge_offsets[0],
                    ));
                    partition_quad(
                        &mut partition.tri_vert,
                        &mut partition.vert_bary,
                        IVec4::new(
                            h_offset - 1,
                            edge_offsets[0],
                            edge_offsets[0] + ns - 1,
                            2,
                        ),
                        IVec4::new(
                            -1,
                            edge_offsets[0] + 1,
                            h_offset + nh - 2,
                            edge_offsets[2],
                        ),
                        IVec4::new(0, ns - 2, nh - 1, n[2] - 2),
                        BVec4::new(true, true, false, true),
                    );
                }
            }
        }

        // Store in cache
        let mut cache = partition_cache().lock().unwrap();
        cache.insert((n.x, n.y, n.z, n.w), partition.clone());
        partition
    }
}

// Global partition cache
fn partition_cache() -> &'static Mutex<HashMap<(i32, i32, i32, i32), Partition>> {
    static CACHE: OnceLock<Mutex<HashMap<(i32, i32, i32, i32), Partition>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

#[inline]
pub(crate) fn next3(i: i32) -> i32 {
    if i == 2 { 0 } else { i + 1 }
}

#[inline]
pub(crate) fn lerp_vec4(a: Vec4, b: Vec4, t: f64) -> Vec4 {
    Vec4::new(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t,
        a.w + (b.w - a.w) * t,
    )
}

fn swap_i32(sorted_div: &mut IVec4, tri_idx: &mut IVec4, a: usize, b: usize) {
    let tmp = sorted_div[a];
    sorted_div[a] = sorted_div[b];
    sorted_div[b] = tmp;
    let tmp = tri_idx[a];
    tri_idx[a] = tri_idx[b];
    tri_idx[b] = tmp;
}

/// Port of C++ Partition::PartitionFan()
fn partition_fan(tri_vert: &mut Vec<IVec3>, corner_verts: IVec3, added: i32, edge_offset: i32) {
    let mut last = corner_verts[0];
    for i in 0..added {
        let next = edge_offset + i;
        tri_vert.push(IVec3::new(last, next, corner_verts[2]));
        last = next;
    }
    tri_vert.push(IVec3::new(last, corner_verts[1], corner_verts[2]));
}

/// Port of C++ Partition::PartitionQuad()
fn partition_quad(
    tri_vert: &mut Vec<IVec3>,
    vert_bary: &mut Vec<Vec4>,
    corner_verts: IVec4,
    edge_offsets: IVec4,
    edge_added: IVec4,
    edge_fwd: BVec4,
) {
    let get_edge_vert = |edge: usize, idx: i32| -> i32 {
        edge_offsets[edge] + if edge_fwd[edge] { 1 } else { -1 } * idx
    };

    debug_assert!(
        edge_added[0] >= 0 && edge_added[1] >= 0 && edge_added[2] >= 0 && edge_added[3] >= 0,
        "negative divisions!"
    );

    let mut corner: i32 = -1;
    let mut last = 3_usize;
    let mut max_edge: i32 = -1;
    for i in 0..4 {
        if corner == -1 && edge_added[i] == 0 && edge_added[last] == 0 {
            corner = i as i32;
        }
        if edge_added[i] > 0 {
            max_edge = if max_edge == -1 { i as i32 } else { -2 };
        }
        last = i;
    }

    if corner >= 0 {
        // terminate
        if max_edge >= 0 {
            let mut edge = IVec4::default();
            for j in 0..4 {
                edge[j] = ((j as i32 + max_edge) % 4) as i32;
            }
            let middle = edge_added[max_edge as usize] / 2;
            tri_vert.push(IVec3::new(
                corner_verts[edge[2] as usize],
                corner_verts[edge[3] as usize],
                get_edge_vert(max_edge as usize, middle),
            ));
            let mut last_v = corner_verts[edge[0] as usize];
            for i in 0..=middle {
                let next = get_edge_vert(max_edge as usize, i);
                tri_vert.push(IVec3::new(
                    corner_verts[edge[3] as usize],
                    last_v,
                    next,
                ));
                last_v = next;
            }
            last_v = corner_verts[edge[1] as usize];
            for i in (middle..edge_added[max_edge as usize]).rev() {
                let next = get_edge_vert(max_edge as usize, i);
                tri_vert.push(IVec3::new(
                    corner_verts[edge[2] as usize],
                    next,
                    last_v,
                ));
                last_v = next;
            }
        } else {
            let corner_u = corner as usize;
            let mut side_vert = corner_verts[0]; // initial value unused
            for j in 1..=2 {
                let side = (corner_u + j) % 4;
                if j == 2 && edge_added[side] > 0 {
                    tri_vert.push(IVec3::new(
                        corner_verts[side],
                        get_edge_vert(side, 0),
                        side_vert,
                    ));
                } else {
                    side_vert = corner_verts[side];
                }
                for i in 0..edge_added[side] {
                    let next_vert = get_edge_vert(side, i);
                    tri_vert.push(IVec3::new(
                        corner_verts[corner_u],
                        side_vert,
                        next_vert,
                    ));
                    side_vert = next_vert;
                }
                if j == 2 || edge_added[side] == 0 {
                    tri_vert.push(IVec3::new(
                        corner_verts[corner_u],
                        side_vert,
                        corner_verts[(corner_u + j + 1) % 4],
                    ));
                }
            }
        }
        return;
    }

    // recursively partition
    let partitions = 1 + edge_added[1].min(edge_added[3]);
    let mut new_corner_verts = IVec4::new(corner_verts[1], -1, -1, corner_verts[0]);
    let mut new_edge_offsets = IVec4::new(
        edge_offsets[1],
        -1,
        get_edge_vert(3, edge_added[3] + 1),
        edge_offsets[0],
    );
    let mut new_edge_added = IVec4::new(0, -1, 0, edge_added[0]);
    let mut new_edge_fwd = BVec4::new(edge_fwd[1], true, edge_fwd[3], edge_fwd[0]);

    for i in 1..partitions {
        let corner_offset1 = (edge_added[1] * i) / partitions;
        let corner_offset3 = edge_added[3] - 1 - (edge_added[3] * i) / partitions;
        let next_offset1 = get_edge_vert(1, corner_offset1 + 1);
        let next_offset3 = get_edge_vert(3, corner_offset3 + 1);
        let added = ((edge_added[0] as f64)
            + (edge_added[2] as f64 - edge_added[0] as f64) * (i as f64 / partitions as f64))
            .round() as i32;

        new_corner_verts[1] = get_edge_vert(1, corner_offset1);
        new_corner_verts[2] = get_edge_vert(3, corner_offset3);
        new_edge_added[0] = (next_offset1 - new_edge_offsets[0]).abs() - 1;
        new_edge_added[1] = added;
        new_edge_added[2] = (next_offset3 - new_edge_offsets[2]).abs() - 1;
        new_edge_offsets[1] = vert_bary.len() as i32;
        new_edge_offsets[2] = next_offset3;

        for j in 0..added {
            vert_bary.push(lerp_vec4(
                vert_bary[new_corner_verts[1] as usize],
                vert_bary[new_corner_verts[2] as usize],
                (j + 1) as f64 / (added + 1) as f64,
            ));
        }

        partition_quad(
            tri_vert,
            vert_bary,
            new_corner_verts,
            new_edge_offsets,
            new_edge_added,
            new_edge_fwd,
        );

        new_corner_verts[0] = new_corner_verts[1];
        new_corner_verts[3] = new_corner_verts[2];
        new_edge_added[3] = new_edge_added[1];
        new_edge_offsets[0] = next_offset1;
        new_edge_offsets[3] = new_edge_offsets[1] + new_edge_added[1] - 1;
        new_edge_fwd[3] = false;
    }

    new_corner_verts[1] = corner_verts[2];
    new_corner_verts[2] = corner_verts[3];
    new_edge_offsets[1] = edge_offsets[2];
    new_edge_added[0] = edge_added[1] - (new_edge_offsets[0] - edge_offsets[1]).abs();
    new_edge_added[1] = edge_added[2];
    new_edge_added[2] = (new_edge_offsets[2] - edge_offsets[3]).abs() - 1;
    new_edge_offsets[2] = edge_offsets[3];
    new_edge_fwd[1] = edge_fwd[2];

    partition_quad(
        tri_vert,
        vert_bary,
        new_corner_verts,
        new_edge_offsets,
        new_edge_added,
        new_edge_fwd,
    );
}
