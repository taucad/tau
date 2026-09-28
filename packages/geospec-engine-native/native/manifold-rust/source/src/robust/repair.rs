// robust/repair.rs — Shell-level orientation repair for closed, orientable
// triangle meshes (manifold or soup).
//
// Real-world scans often contain whole bodies wound inside-out. The robust
// engine's solid semantics are {winding >= 1}, so an inverted body bounds no
// material and silently vanishes from every boolean. This module decides,
// per connected shell, whether the shell is wound the way its nesting
// demands — outermost shells wind +1, first-level cavities wind -1, solids
// inside cavities wind +1 again — and reports which shells to flip.
//
// The decisions are made with the exact winding machinery of
// `robust/ray_shoot.rs`, never with heuristics like signed volume:
//   * A shell's *current* orientation comes from the exact winding of a
//     point just off one of its faces, against the shell alone: an
//     outward-wound shell has winding 0 outside / 1 inside its own surface,
//     an inverted one -1 / 0. Anything else (a doubled sheet, a
//     multiply-wrapped surface) is deliberately left alone — the boolean's
//     coincident-stack arithmetic already classifies those correctly, and
//     "repairing" them would destroy information.
//   * A shell's *nesting depth* is the number of other shells that strictly
//     contain a point just off the shell's geometric exterior, measured by
//     the same exact query per shell — orientation-independently (winding
//     != 0), so already-broken neighbors cannot corrupt the count.
//
// Blanket-flipping negative-signed-volume shells would instead turn every
// legitimate cavity inside out; the depth rule is what keeps voids voids.
//
// The depth rule is applied asymmetrically, because only one of its two
// verdicts can restore lost material. Rewinding an *inverted* shell where the
// nesting wants a solid gives material back, so it is always done. Rewinding
// an *outward* shell where the nesting wants a cavity takes material away —
// and a nested outward shell is genuinely ambiguous ({w >= 1} reads its
// interior as solid winding 2, which is a perfectly valid mesh). We only do
// that on strong evidence that the whole stack arrived mirrored: some
// container of the shell is itself inverted at a depth that wants a solid.
// That is a prior, not a proof — {-1 at depth 0, +1 at depth 1} could equally
// be a lone inverted body with a legitimate inner solid — but it is the
// reading that keeps the two shells consistent with each other.
//
// The invariant this buys: every material-*removing* flip requires a
// container with sign -1 at even depth, and such a container always takes the
// unconditional restoring flip. So a removal never happens without a strictly
// larger addition above it in the same containment stack, and the net effect
// of a repair on a stack is never a loss. Thingi10K #61459 — a correctly
// wound body carrying a nested outward shell, 80% of whose material the old
// symmetric rule destroyed — cannot recur.
//
// Known conservative false negative: a mirrored sub-assembly hanging under a
// correctly wound parent ({+1 at depth 0, +1 at depth 1, -1 at depth 2}) is
// read as two nested solids with an inverted island, not as a void containing
// an island, because evidence is only searched *upward* through containers.
// Nothing is destroyed — the mesh keeps all its material — but the intended
// void stays filled. Propagating a descendant-inverted signal downward is the
// fix if that class ever shows up in practice.
//
// `Manifold::repair_orientation` applies the plan by rewinding whole shells
// in place (`apply_flips`), which preserves halfedge pairing exactly because
// a paired edge always joins two triangles of the same shell.

use std::collections::BTreeMap;

use crate::disjoint_sets::DisjointSets;
use crate::impl_mesh::ManifoldImpl;
use crate::linalg::Vec3;
use crate::types::Halfedge;

use super::exact::predicates::tri_normal_r;
use super::exact::rational::R3;
use super::ray_shoot::{piece_centroid, winding_off_surface};

/// Result of [`plan_repair`]: which triangles to rewind, plus shell counts
/// for reporting.
pub struct RepairPlan {
    /// Per-input-triangle flip flag, aligned with the `tris` argument.
    pub flip: Vec<bool>,
    pub num_shells: usize,
    pub flipped_shells: usize,
}

impl RepairPlan {
    pub fn is_noop(&self) -> bool {
        self.flipped_shells == 0
    }
}

/// How many candidate faces per shell to try before declaring the shell's
/// orientation ambiguous. A simple closed shell classifies on its first
/// non-degenerate face; only pathological sheets (every sampled face part of
/// a coincident stack) need retries.
const MAX_CANDIDATE_FACES: usize = 16;

/// Exact-position weld key with -0.0 normalized (same identity `soup.rs`
/// uses, so "connected" means the same thing in both places).
fn pos_key(v: Vec3) -> (u64, u64, u64) {
    let norm = |x: f64| if x == 0.0 { 0.0f64 } else { x }.to_bits();
    (norm(v.x), norm(v.y), norm(v.z))
}

/// Connected shells of a triangle soup: triangles are joined when they share
/// an undirected edge on exactly-welded vertex positions. Returns the shell
/// id (dense, 0-based) per triangle and the shell count.
fn connected_shells(tris: &[[Vec3; 3]]) -> (Vec<usize>, usize) {
    let mut weld: BTreeMap<(u64, u64, u64), u32> = BTreeMap::new();
    let mut vert_id = |v: Vec3, next: &mut u32| -> u32 {
        *weld.entry(pos_key(v)).or_insert_with(|| {
            let id = *next;
            *next += 1;
            id
        })
    };
    let mut next = 0u32;
    let tri_verts: Vec<[u32; 3]> = tris
        .iter()
        .map(|t| [
            vert_id(t[0], &mut next),
            vert_id(t[1], &mut next),
            vert_id(t[2], &mut next),
        ])
        .collect();

    let ds = DisjointSets::new(tris.len().max(1) as u32);
    let mut by_edge: Vec<((u32, u32), u32)> = Vec::with_capacity(3 * tris.len());
    for (t, tv) in tri_verts.iter().enumerate() {
        for e in 0..3 {
            let (a, b) = (tv[e], tv[(e + 1) % 3]);
            if a != b {
                by_edge.push(((a.min(b), a.max(b)), t as u32));
            }
        }
    }
    by_edge.sort_unstable();
    for w in by_edge.windows(2) {
        if w[0].0 == w[1].0 {
            ds.unite(w[0].1, w[1].1);
        }
    }

    let mut remap: BTreeMap<u32, usize> = BTreeMap::new();
    let mut shell = Vec::with_capacity(tris.len());
    for t in 0..tris.len() {
        let root = ds.find(t as u32);
        let next_id = remap.len();
        shell.push(*remap.entry(root).or_insert(next_id));
    }
    let count = remap.len();
    (shell, count)
}

/// Per-shell exact/f64/bbox triangle tables for the winding queries.
struct ShellGeom {
    tris_f64: Vec<[Vec3; 3]>,
    tris_r: Vec<[R3; 3]>,
    boxes: Vec<crate::types::Box>,
}

impl ShellGeom {
    fn new(tris: &[[Vec3; 3]], members: &[usize]) -> Self {
        let tris_f64: Vec<[Vec3; 3]> = members.iter().map(|&t| tris[t]).collect();
        let tris_r = tris_f64
            .iter()
            .map(|t| [R3::from_vec3(t[0]), R3::from_vec3(t[1]), R3::from_vec3(t[2])])
            .collect();
        let boxes = tris_f64
            .iter()
            .map(|t| {
                let mut b = crate::types::Box::from_points(t[0], t[1]);
                b.union_point(t[2]);
                b
            })
            .collect();
        ShellGeom {
            tris_f64,
            tris_r,
            boxes,
        }
    }
}

/// A shell whose orientation the exact queries could pin down.
struct Classified {
    /// +1 = currently outward-wound, -1 = currently inverted.
    sign: i32,
    /// A point on the shell's surface (a face centroid) …
    probe: R3,
    /// … and the direction off that face toward the shell's geometric
    /// exterior (where its own winding is 0).
    exterior: R3,
}

/// Current orientation of one shell, from exact winding just off a face.
///
/// Tries up to [`MAX_CANDIDATE_FACES`] faces: a face inside a coincident
/// stack (doubled sheet, fold) yields winding pairs other than the two clean
/// signatures and is skipped. `None` means no sampled face gave a clean
/// answer — the shell is left untouched.
fn classify_shell(geom: &ShellGeom) -> Option<Classified> {
    for t in geom.tris_r.iter().take(MAX_CANDIDATE_FACES) {
        let n = tri_normal_r(&t[0], &t[1], &t[2]);
        if n.is_zero() {
            continue; // exactly degenerate: no sides to speak of
        }
        let probe = piece_centroid([&t[0], &t[1], &t[2]]);
        let w_out = winding_off_surface(&probe, &n, &geom.tris_r, &geom.tris_f64, &geom.boxes);
        let neg = R3::new(-&n.x, -&n.y, -&n.z);
        let w_in = winding_off_surface(&probe, &neg, &geom.tris_r, &geom.tris_f64, &geom.boxes);
        match (w_out, w_in) {
            // Normal side empty, anti side solid: wound outward.
            (0, 1) => {
                return Some(Classified {
                    sign: 1,
                    probe,
                    exterior: n,
                })
            }
            // Normal side inverted-solid, anti side empty: wound inward.
            (-1, 0) => {
                return Some(Classified {
                    sign: -1,
                    probe,
                    exterior: neg,
                })
            }
            // Coincident stack or multiple wrap at this face: try another.
            _ => continue,
        }
    }
    None
}

/// Shell decomposition plus the two exact verdicts every consumer here needs:
/// each shell's current orientation and the set of other shells containing it.
struct Analysis {
    shell_of: Vec<usize>,
    num_shells: usize,
    classified: Vec<Option<Classified>>,
    containers: Vec<Vec<usize>>,
}

fn analyze(tris: &[[Vec3; 3]]) -> Analysis {
    let (shell_of, num_shells) = connected_shells(tris);
    let mut members: Vec<Vec<usize>> = vec![Vec::new(); num_shells];
    for (t, &s) in shell_of.iter().enumerate() {
        members[s].push(t);
    }

    let geoms: Vec<ShellGeom> = members.iter().map(|m| ShellGeom::new(tris, m)).collect();
    let classified: Vec<Option<Classified>> = geoms.iter().map(classify_shell).collect();

    // Containment: which *other* shells hold the point just off this shell's
    // exterior. Winding != 0 rather than >= 1, so an inverted (not-yet-
    // repaired) container still counts as containing.
    let mut containers: Vec<Vec<usize>> = vec![Vec::new(); num_shells];
    for s in 0..num_shells {
        let Some(c) = &classified[s] else { continue };
        containers[s] = (0..num_shells)
            .filter(|&o| o != s)
            .filter(|&o| {
                let g = &geoms[o];
                winding_off_surface(&c.probe, &c.exterior, &g.tris_r, &g.tris_f64, &g.boxes) != 0
            })
            .collect();
    }

    Analysis {
        shell_of,
        num_shells,
        classified,
        containers,
    }
}

/// True when the soup's surface is *already* the boundary of the solid it
/// denotes: every shell classifies cleanly (no coincident stacks, no multiple
/// wraps) and winds the way its nesting demands — +1 at even containment
/// depth, -1 at odd. That is exactly the condition under which no winding
/// classification can change the surface, for either winding rule: every
/// point is enclosed 0 or 1 times, so {w >= 1} and {w != 0} agree, and every
/// face separates material from void.
///
/// Used by the robust engine to decide whether its bbox-disjoint union may
/// take the concatenating fast path (which classifies nothing) or must go
/// through the full pipeline. Deliberately conservative: `false` only ever
/// costs the pipeline, never correctness.
pub fn shells_well_nested(tris: &[[Vec3; 3]]) -> bool {
    let a = analyze(tris);
    (0..a.num_shells).all(|s| match &a.classified[s] {
        Some(c) => c.sign == if a.containers[s].len() % 2 == 0 { 1 } else { -1 },
        None => false,
    })
}

/// Decide which shells to flip so the mesh's solid reads correctly under
/// {winding >= 1}. The target from containment depth is the classic one —
/// even depth winds outward (+1), odd depth (cavity boundaries) winds inward
/// (-1) — but it is enforced *asymmetrically*: an inverted shell that should
/// be solid is always rewound (that restores material), while an outward
/// shell that a cavity target disagrees with is only rewound on evidence that
/// its containment stack arrived mirrored (that removes material, and a
/// nested outward shell is a legitimate mesh on its own). See the module
/// header for the full rule and the invariant it guarantees.
pub fn plan_repair(tris: &[[Vec3; 3]]) -> RepairPlan {
    let Analysis {
        shell_of,
        num_shells,
        classified,
        containers,
    } = analyze(tris);
    let depth = |s: usize| containers[s].len();

    let mut flip_shell = vec![false; num_shells];
    let mut flipped_shells = 0usize;
    for s in 0..num_shells {
        let Some(c) = &classified[s] else { continue };
        let target = if depth(s) % 2 == 0 { 1 } else { -1 };
        if c.sign == target {
            continue;
        }
        // An outward-wound shell at odd depth is ambiguous: it may be a
        // cavity that was saved inside-out, or a nested solid that simply
        // winds its interior to 2 — both read the same. Rewinding it can only
        // *remove* material that the mesh currently has, so we only do it when
        // the shell sits under demonstrably inside-out geometry: a container
        // that is itself inverted where it should be solid (an even-depth
        // shell with sign -1), i.e. the whole nesting stack arrived mirrored.
        // Without that evidence we leave the nested solid alone — Thingi10K
        // #61459 is a correctly wound body with an inner shell, and flipping
        // it carved away 80% of the model.
        if c.sign == 1 {
            let mirrored_stack = containers[s].iter().any(|&o| {
                classified[o].as_ref().is_some_and(|co| co.sign == -1) && depth(o) % 2 == 0
            });
            if !mirrored_stack {
                continue;
            }
        }
        flip_shell[s] = true;
        flipped_shells += 1;
    }

    RepairPlan {
        flip: shell_of.iter().map(|&s| flip_shell[s]).collect(),
        num_shells,
        flipped_shells,
    }
}

/// Rewind the flagged triangles of `imp` in place: (v0, v1, v2) becomes
/// (v0, v2, v1), with halfedge pairing remapped rather than rebuilt.
///
/// Sound because `flip` comes from a per-shell decision: a paired edge joins
/// two triangles that share an exact-position edge, hence the same shell,
/// hence the same flag — so every pair is either reversed on both sides or
/// untouched, never mixed. Works identically for soup impls (unpaired
/// halfedges stay -1).
pub fn apply_flips(imp: &mut ManifoldImpl, flip: &[bool]) {
    debug_assert_eq!(imp.num_tri(), flip.len());
    // Reversing (v0, v1, v2) to (v0, v2, v1) turns each directed edge into
    // its reverse, relocated within the triangle: e0: v0→v1 reappears as
    // slot 2 (v1→v0), e1: v1→v2 as slot 1 (v2→v1), e2: v2→v0 as slot 0
    // (v0→v2). The prop_vert follows its start corner.
    let new_slot = |he: usize| -> usize {
        let (t, e) = (he / 3, he % 3);
        if flip[t] {
            3 * t + [2, 1, 0][e]
        } else {
            he
        }
    };
    let old = imp.halfedge.clone();
    for t in 0..flip.len() {
        if !flip[t] {
            continue;
        }
        let (e0, e1, e2) = (old[3 * t].clone(), old[3 * t + 1].clone(), old[3 * t + 2].clone());
        imp.halfedge[3 * t] = Halfedge {
            start_vert: e0.start_vert,
            end_vert: e2.start_vert,
            paired_halfedge: -1,
            prop_vert: e0.prop_vert,
        };
        imp.halfedge[3 * t + 1] = Halfedge {
            start_vert: e2.start_vert,
            end_vert: e1.start_vert,
            paired_halfedge: -1,
            prop_vert: e2.prop_vert,
        };
        imp.halfedge[3 * t + 2] = Halfedge {
            start_vert: e1.start_vert,
            end_vert: e0.start_vert,
            paired_halfedge: -1,
            prop_vert: e1.prop_vert,
        };
    }
    // Second pass: remap every pairing through the slot relocation (including
    // pairs between two untouched triangles, whose slots don't move).
    for i in 0..old.len() {
        let p = old[i].paired_halfedge;
        imp.halfedge[new_slot(i)].paired_halfedge = if p < 0 {
            p
        } else {
            new_slot(p as usize) as i32
        };
    }

    if imp.is_soup {
        // Soup impls carry per-face normals only (see soup::soupify).
        for (t, &f) in flip.iter().enumerate() {
            if f && t < imp.face_normal.len() {
                imp.face_normal[t] = -imp.face_normal[t];
            }
        }
        imp.vert_normal.clear();
    } else {
        // Recompute normals and coplanar grouping from the rewound topology.
        imp.set_normals_and_coplanar();
    }
}

#[cfg(test)]
#[path = "repair_tests.rs"]
mod tests;
