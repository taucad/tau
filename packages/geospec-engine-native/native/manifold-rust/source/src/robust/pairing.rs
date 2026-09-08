// robust/pairing.rs — Geometrically correct half-edge pairing for the
// extracted boundary (used by robust/assemble.rs).
//
// `cells::extract` can legitimately emit a boundary that touches itself
// along an edge: the solid occupies two separate wedges around one
// arrangement edge, so that undirected vertex-id edge carries four (in
// general 2k) half-edges. `ManifoldImpl::create_halfedges` pairs half-edges
// by vertex ids alone, which on such an edge picks an arbitrary
// forward/backward partner. A crosslinked guess fuses the two geometric
// fans into one combinatorial orbit, and `edge_op::cleanup_topology` then
// "repairs" the fused orbit by repointing corners of unrelated faces onto
// another vertex's position — moving geometry and destroying volume (on
// Thingi10K #301921 ∪ its rotated copy, one `dedupe_edge` call cost 7% of
// the model).
//
// This module removes the guess. It radially sorts the half-faces around
// every such edge with the same filtered orient3d machinery the cell
// complex uses (`cells::radial_fan`), pairs each half-edge with the
// radially adjacent one bounding the *same solid wedge*, and reports the
// split of each pinched vertex into one copy per fan that the pairing
// implies. The assembly emits those copies as distinct output vertices, so
// every undirected edge carries exactly two half-edges again and the
// import's id-based pairing reproduces the geometric one — leaving
// `cleanup_topology` with nothing to repair.
//
// An accepted plan splits *every* pinched vertex orbit in the mesh, not
// only the ones a multi-edge fan touches: the copy index comes from the
// connected components of the corner graph induced by the whole pairing, so
// a vertex whose star is two cones meeting at a single point, far from any
// multi-edge, is separated as well.
//
// Only meshes that actually carry such an edge take this path; everything
// else keeps using the generic MeshGL import unchanged. Anything the fan
// cannot certify (odd fans, coincident radial directions, apexes on the
// edge axis, traversals that do not alternate, a split that fails to
// separate the fans) yields `None`, and the caller falls back to that same
// generic import.

// Fx hashing (unseeded): every map here is probe-only — fan-copy ordinals are
// assigned walking half-edges in index order, and the edge-count table is only
// ever looked up — so hash order cannot reach the split plan.
use rustc_hash::FxHashMap as HashMap;

use crate::disjoint_sets::DisjointSets;

use super::cells::{radial_fan, VertTables};
use super::intersection_graph::{edge_key, EdgeKey};

/// Half-face record consumed by [`radial_fan`]: (edge key, half-edge index,
/// forward traversal, apex vertex id).
type Half = (EdgeKey, usize, bool, u32);

/// Per-corner copy index for each triangle corner (`3 * tri + corner`).
/// `0` for every corner of an unpinched vertex.
pub type SplitPlan = Vec<u32>;

/// One arrangement edge carrying more than two half-edges.
struct Fan {
    key: EdgeKey,
    halfs: Vec<Half>,
    /// Pair across the empty wedges instead of the solid ones. Only set when
    /// the geometric pairing leaves the fans inseparable — see
    /// [`plan_vertex_splits`].
    flip: bool,
}

/// Plan the vertex splits that make id-based half-edge pairing reproduce the
/// geometric pairing of `tris` (triangles of interned vertex ids, wound
/// outward).
///
/// Returns `None` when no split is needed (no edge carries more than two
/// half-edges — the overwhelmingly common case, which must stay on the
/// untouched import path) and also when the geometry cannot be certified,
/// so callers get today's behavior rather than a guess.
///
/// The geometric pairing ([`pair_fan`]) is preferred everywhere. It is not
/// always expressible through vertex ids: when the two sheets meeting along
/// an edge reconnect around *both* of its endpoints, no vertex split can
/// separate them, and leaving the duplicate id-edge in place hands the mesh
/// to `dedupe_edge`, which splits the pinched *start* vertex onto the end
/// vertex's position (upstream `Impl::DedupeEdge`) and wrecks the geometry.
/// Such a fan falls back to the other radially adjacent pairing — also a
/// closed, consistently oriented surface over the identical triangles,
/// differing only in which sheets are joined — and the plan is rejected
/// outright if even that leaves the edge duplicated.
pub fn plan_vertex_splits(tris: &[[u32; 3]], vt: VertTables) -> Option<SplitPlan> {
    let mut incident: Vec<Half> = Vec::with_capacity(3 * tris.len());
    for (t, vi) in tris.iter().enumerate() {
        for c in 0..3 {
            let (a, b) = (vi[c], vi[(c + 1) % 3]);
            if a == b {
                return None; // degenerate corner: no radial direction
            }
            incident.push((edge_key(a, b), 3 * t + c, a < b, vi[(c + 2) % 3]));
        }
    }
    incident.sort_unstable();

    // Partner half-edge of every half-edge on an ordinary (two half-edge)
    // arrangement edge; the fans fill in the rest on each attempt.
    let mut base = vec![usize::MAX; 3 * tris.len()];
    let mut fans: Vec<Fan> = Vec::new();
    let mut at = 0;
    while at < incident.len() {
        let key = incident[at].0;
        let mut end = at + 1;
        while end < incident.len() && incident[end].0 == key {
            end += 1;
        }
        let raw = &incident[at..end];
        at = end;
        if raw.len() == 2 {
            // An ordinary edge: the two half-edges must run opposite ways.
            if raw[0].2 == raw[1].2 {
                return None;
            }
            base[raw[0].1] = raw[1].1;
            base[raw[1].1] = raw[0].1;
            continue;
        }
        if raw.len() % 2 != 0 {
            return None; // a boundary or odd fan: not a closed surface
        }
        fans.push(Fan {
            key,
            halfs: raw.to_vec(),
            flip: false,
        });
    }
    if fans.is_empty() {
        return None;
    }

    // Whole attempts (one radial pass over every fan plus one split) are
    // bounded by a small constant rather than by the fan count: the fan
    // predicates are the expensive part of assembly, and a mesh that needs
    // more rounds than this is better served by degrading to the untouched
    // import path than by paying O(fans) passes to maybe salvage it.
    const MAX_ATTEMPTS: usize = 4;
    let mut budget = MAX_ATTEMPTS;
    loop {
        let Some(a) = attempt(tris, &base, &fans, vt, &mut budget) else {
            return None;
        };
        if a.separated.iter().all(|&s| s) {
            return settle(tris, &base, &mut fans, vt, &mut budget, a);
        }
        // Flip the fans the geometric pairing could not separate. Flips
        // latch within this loop — a fan flipped to unblock one round is
        // not reconsidered here even if a later round would have separated
        // it geometrically — which is what `settle` exists to undo.
        let mut progress = false;
        for (i, fan) in fans.iter_mut().enumerate() {
            if !a.separated[i] && !fan.flip {
                fan.flip = true;
                progress = true;
            }
        }
        if !progress {
            return None;
        }
    }
}

/// The outcome of one pairing pass: the split it implies and which fans it
/// managed to separate.
struct Attempt {
    plan: SplitPlan,
    separated: Vec<bool>,
    /// Every edge of the split mesh is an ordinary one (exactly one
    /// half-edge each way) — the condition the caller must hand the import.
    edges_ok: bool,
}

/// One pairing pass over every fan plus the split it implies. Consumes one
/// unit of `budget`; `None` once that runs out or when a fan cannot be
/// certified.
fn attempt(
    tris: &[[u32; 3]],
    base: &[usize],
    fans: &[Fan],
    vt: VertTables,
    budget: &mut usize,
) -> Option<Attempt> {
    if *budget == 0 {
        return None;
    }
    *budget -= 1;
    let mut partner = base.to_vec();
    for fan in fans {
        pair_fan(fan, vt, &mut partner)?;
    }
    let plan = split_from_partners(tris, &partner);
    let counts = split_edge_counts(tris, &plan)?;
    Some(Attempt {
        separated: fans
            .iter()
            .map(|fan| fan_separated(fan, tris, &plan, &counts))
            .collect(),
        edges_ok: counts.values().all(|&(f, b)| f == 1 && b == 1),
        plan,
    })
}

/// Drop flips that are no longer needed.
///
/// A fan flipped early can owe its flip to another fan that has since been
/// flipped too, so re-test each flipped fan geometrically and keep the
/// geometric pairing wherever it now separates. Best effort within the
/// remaining attempt budget: an un-flip that cannot be re-tested stays.
fn settle(
    tris: &[[u32; 3]],
    base: &[usize],
    fans: &mut [Fan],
    vt: VertTables,
    budget: &mut usize,
    accepted: Attempt,
) -> Option<SplitPlan> {
    let mut accepted = accepted;
    for i in 0..fans.len() {
        if !fans[i].flip || *budget == 0 {
            continue;
        }
        fans[i].flip = false;
        match attempt(tris, base, fans, vt, budget) {
            Some(a) if a.separated.iter().all(|&s| s) => accepted = a,
            _ => fans[i].flip = true,
        }
    }
    accepted.edges_ok.then_some(accepted.plan)
}

/// Pair the half-edges of one fan across their shared solid wedges.
///
/// [`radial_fan`] orders the half-faces counter-clockwise about the
/// canonical edge direction `k0 → k1`. A forward-traversing face is wound
/// `(k0, k1, apex)`, so its normal sits 90° counter-clockwise of its apex
/// direction (`cells::ccw_side`), and the extracted boundary's normals point
/// *away* from material (`cells::extract`) — so a forward face has material
/// in the wedge clockwise of it and a backward face in the wedge
/// counter-clockwise of it. Traversals therefore alternate around the fan,
/// and the wedge between radial positions `i` and `i + 1` is solid exactly
/// when face `i` is backward. Those two faces bound one solid wedge, which
/// makes them the adjacent pair of the surface enclosing it — for two cubes
/// meeting along an edge, exactly the two faces of the same cube.
///
/// `fan.flip` pairs across the empty wedges instead; see
/// [`plan_vertex_splits`] for when that is used.
fn pair_fan(fan: &Fan, vt: VertTables, partner: &mut [usize]) -> Option<()> {
    let (incs, groups) = radial_fan(fan.key.0, fan.key.1, &fan.halfs, vt)?;
    // Every half-face must survive the fan (none on the edge axis) and hold
    // its own radial direction (no coincident pair to disambiguate).
    if incs.len() != fan.halfs.len() || groups.len() != incs.len() {
        return None;
    }
    let n = incs.len();
    for i in 0..n {
        if incs[i].forward != fan.flip {
            continue;
        }
        let j = (i + 1) % n;
        if incs[j].forward == fan.flip {
            return None; // traversals must alternate around the fan
        }
        partner[incs[i].id] = incs[j].id;
        partner[incs[j].id] = incs[i].id;
    }
    if fan.halfs.iter().any(|h| partner[h.1] == usize::MAX) {
        return None;
    }
    Some(())
}

/// Corners that the pairing keeps in one fan become one output vertex.
fn split_from_partners(tris: &[[u32; 3]], partner: &[usize]) -> SplitPlan {
    let n = 3 * tris.len();
    let ds = DisjointSets::new(n.max(1) as u32);
    for h in 0..n {
        let p = partner[h];
        if p == usize::MAX || p < h {
            continue;
        }
        // `h` runs a→b inside its triangle and `p` runs b→a inside its own,
        // so they meet at a via corners (h, p+1) and at b via (h+1, p).
        let (ht, hc) = (h / 3, h % 3);
        let (pt, pc) = (p / 3, p % 3);
        ds.unite(h as u32, (3 * pt + (pc + 1) % 3) as u32);
        ds.unite((3 * ht + (hc + 1) % 3) as u32, p as u32);
    }

    let mut ordinal: HashMap<u32, u32> = HashMap::default();
    let mut next: HashMap<u32, u32> = HashMap::default();
    let mut plan = vec![0u32; n];
    for h in 0..n {
        let root = ds.find(h as u32);
        let vid = tris[h / 3][h % 3];
        plan[h] = *ordinal.entry(root).or_insert_with(|| {
            let slot = next.entry(vid).or_insert(0);
            let id = *slot;
            *slot += 1;
            id
        });
    }
    plan
}

/// Identity of one corner after splitting: its vertex id and fan copy.
#[inline]
fn split_vert(tris: &[[u32; 3]], plan: &SplitPlan, h: usize) -> (u32, u32) {
    (tris[h / 3][h % 3], plan[h])
}

/// Forward/backward half-edge counts per undirected edge of the split mesh.
/// `None` if a corner pair collapsed, which would make the counts
/// meaningless. That is belt and braces: `plan_vertex_splits` already
/// rejects a triangle with a repeated vertex id up front, and splitting only
/// refines vertex identity, so it cannot merge two distinct corners.
fn split_edge_counts(
    tris: &[[u32; 3]],
    plan: &SplitPlan,
) -> Option<HashMap<((u32, u32), (u32, u32)), (u32, u32)>> {
    let mut counts = HashMap::default();
    for t in 0..tris.len() {
        for c in 0..3 {
            let a = split_vert(tris, plan, 3 * t + c);
            let b = split_vert(tris, plan, 3 * t + (c + 1) % 3);
            if a == b {
                return None;
            }
            let e = counts.entry(if a < b { (a, b) } else { (b, a) }).or_insert((0, 0));
            if a < b {
                e.0 += 1;
            } else {
                e.1 += 1;
            }
        }
    }
    Some(counts)
}

/// Did the split actually separate this fan into ordinary edges?
fn fan_separated(
    fan: &Fan,
    tris: &[[u32; 3]],
    plan: &SplitPlan,
    counts: &HashMap<((u32, u32), (u32, u32)), (u32, u32)>,
) -> bool {
    fan.halfs.iter().all(|&(_, h, _, _)| {
        let a = split_vert(tris, plan, h);
        let b = split_vert(tris, plan, 3 * (h / 3) + (h % 3 + 1) % 3);
        counts.get(&if a < b { (a, b) } else { (b, a) }) == Some(&(1, 1))
    })
}

#[cfg(test)]
#[path = "pairing_tests.rs"]
mod tests;
