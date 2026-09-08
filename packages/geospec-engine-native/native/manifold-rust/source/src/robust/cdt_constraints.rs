// robust/cdt_constraints.rs — Constraint recovery for robust/cdt.rs.
//
// The second half of the constrained Delaunay triangulator: forcing a given
// index pair to appear as an edge of the triangulation via Anglada's cavity
// retriangulation. Split out of cdt.rs purely for file size; it is a second
// `impl Cdt` block on the same private arena and shares every helper
// (`rotate_around`, `shared_edge`, `record`, the filtered predicates) with
// its parent module.

use super::{Cdt, Tri};
use crate::robust::exact::Sign;

impl Cdt {
    /// Recover constraint edge (a,b) by Anglada's cavity retriangulation:
    /// walk the corridor of triangles the open segment pierces, delete them,
    /// and re-triangulate the two pseudo-polygon halves flanking the segment
    /// (each necessarily gains edge (a,b)). Edge-flip recovery — flipping
    /// away crossing edges one at a time — is NOT used because it can cycle:
    /// when a flipped diagonal still crosses the segment, the next search can
    /// select it and flip it straight back (observed on Thingi10K 1075458 −
    /// 91115, where two edges alternated forever and the triangle arena grew
    /// without bound). The corridor walk is bounded by the live triangle
    /// count and the retriangulation recursion by the chain length, so this
    /// terminates unconditionally.
    /// Precondition (from robust/arrangement.rs): no vertex lies strictly
    /// inside segment (a,b) and no other constraint properly crosses it.
    pub(super) fn insert_constraint(&mut self, a: usize, b: usize) {
        if self.mark_if_present(a, b) {
            return;
        }
        let (crossed, left, right) = self.collect_corridor(a, b);
        self.retriangulate_corridor(a, b, &crossed, &left, &right);
        assert!(
            self.mark_if_present(a, b),
            "cavity retriangulation did not produce constraint edge ({a},{b})"
        );
    }

    /// The corridor of triangles pierced by open segment (a,b): the triangle
    /// list in walk order plus the chains of corridor vertices strictly left
    /// and strictly right of the directed line a→b, each ordered from a to b.
    /// Chains may repeat a vertex (pseudo-polygon pinch); consecutive
    /// duplicates cannot occur.
    fn collect_corridor(&self, a: usize, b: usize) -> (Vec<usize>, Vec<usize>, Vec<usize>) {
        // Entry: the incident triangle of `a` whose opposite edge the segment
        // leaves through. No vertex lies strictly inside (a,b) and (a,b) is
        // not an edge (mark_if_present said so), so the exit is a strict edge
        // crossing.
        let (t0, e0) = self
            .rotate_around(a, |t| {
                let ia = (0..3).position(|k| self.tris[t].v[k] == a).unwrap();
                let e_opp = (ia + 1) % 3;
                let u = self.tris[t].v[e_opp];
                let v = self.tris[t].v[(e_opp + 1) % 3];
                (u != b && v != b && self.strictly_crosses(a, b, u, v)).then_some((t, e_opp))
            })
            .expect("segment leaves its start vertex through a crossed edge");
        // CCW triangle (a, u, v): u is strictly right of a→b, v strictly left.
        let u = self.tris[t0].v[e0];
        let v = self.tris[t0].v[(e0 + 1) % 3];
        let mut crossed = vec![t0];
        let mut left = vec![v];
        let mut right = vec![u];
        let (mut t, mut e) = (t0, e0);
        loop {
            assert!(
                crossed.len() <= self.tris.len(),
                "corridor walk revisited a triangle — triangulation corrupt"
            );
            let n = self.tris[t].adj[e];
            assert!(
                n >= 0,
                "segment crossed the hull — point outside base triangle"
            );
            let n = n as usize;
            let ne = self.shared_edge(n, t);
            crossed.push(n);
            let w = self.tris[n].v[(ne + 2) % 3];
            if w == b {
                return (crossed, left, right);
            }
            match self.o2(a, b, w) {
                Sign::Pos => left.push(w),
                Sign::Neg => right.push(w),
                Sign::Zero => panic!(
                    "vertex {w} lies on constraint segment ({a},{b}) — precondition violated"
                ),
            }
            // The segment exits `n` through whichever remaining edge it
            // strictly crosses (exactly one, since w is strictly off-line).
            e = (1..3)
                .map(|k| (ne + k) % 3)
                .find(|&e2| {
                    let p = self.tris[n].v[e2];
                    let q = self.tris[n].v[(e2 + 1) % 3];
                    self.strictly_crosses(a, b, p, q)
                })
                .expect("segment must exit the corridor triangle it entered");
            t = n;
        }
    }

    /// Is `v` strictly inside the circumcircle of triangle (a,b,c), whatever
    /// its orientation? Collinear (a,b,c) has no circumcircle: false.
    fn in_circumcircle(&self, a: usize, b: usize, c: usize, v: usize) -> bool {
        match self.o2(a, b, c) {
            Sign::Pos => self.nondelaunay([a, b, c], v),
            Sign::Neg => self.nondelaunay([a, c, b], v),
            Sign::Zero => false,
        }
    }

    /// Anglada's pseudo-polygon triangulation: the region bounded by directed
    /// base edge (a,b) and `chain` (the boundary path from a to b, region on
    /// the left of a→b). Picks the Delaunay apex c — the chain vertex whose
    /// circumcircle with the base is empty of chain vertices — emits CCW
    /// triangle (a,b,c), and recurses on the two sub-chains.
    fn triangulate_pseudo(&self, a: usize, b: usize, chain: &[usize], out: &mut Vec<[usize; 3]>) {
        if chain.is_empty() {
            return;
        }
        let mut ci = 0usize;
        for i in 1..chain.len() {
            // A collinear "apex" has no circumcircle and can never be the
            // Delaunay apex; any candidate supersedes it.
            let replace = self.o2(a, b, chain[ci]) == Sign::Zero
                || self.in_circumcircle(a, b, chain[ci], chain[i]);
            if replace {
                ci = i;
            }
        }
        let c = chain[ci];
        assert!(
            self.o2(a, b, c) == Sign::Pos,
            "pseudo-polygon apex must lie strictly left of its base"
        );
        self.triangulate_pseudo(a, c, &chain[..ci], out);
        self.triangulate_pseudo(c, b, &chain[ci + 1..], out);
        out.push([a, b, c]);
    }

    /// Replace the corridor triangles with the CDTs of the two pseudo-polygon
    /// halves and wire the new patch into the surrounding triangulation.
    fn retriangulate_corridor(
        &mut self,
        a: usize,
        b: usize,
        crossed: &[usize],
        left: &[usize],
        right: &[usize],
    ) {
        // Fx hashing (unseeded): both maps below are probe-only scratch —
        // `boundary` is looked up per patch edge and `open` is a pairing
        // buffer drained by key, neither is ever iterated.
        use rustc_hash::FxHashMap as HashMap;
        // Cavity boundary: edges of corridor triangles whose neighbor is
        // outside the corridor. Keyed by undirected endpoints (each boundary
        // edge has exactly one inside face, so keys are unique). Interior
        // edges shared by two corridor triangles vanish; a constrained one
        // (possible only at a pseudo-polygon pinch) must be re-marked after
        // the rebuild.
        let mut boundary: HashMap<(usize, usize), (i32, bool)> = HashMap::default();
        let mut interior_con: Vec<(usize, usize)> = Vec::new();
        // Corridor membership: the linear `crossed.contains` this replaces made
        // the loop below O(|corridor|²), which long corridors on monster
        // arrangements do reach. The set is only worth its allocation past a
        // handful of triangles, and — being probe-only, never iterated — the
        // unseeded Fx hasher cannot affect determinism.
        let corridor_set: Option<rustc_hash::FxHashSet<usize>> =
            (crossed.len() > 16).then(|| crossed.iter().copied().collect());
        let in_corridor = |t: usize| match &corridor_set {
            Some(s) => s.contains(&t),
            None => crossed.contains(&t),
        };
        for &t in crossed {
            for e in 0..3 {
                let n = self.tris[t].adj[e];
                let u = self.tris[t].v[e];
                let v = self.tris[t].v[(e + 1) % 3];
                let key = (u.min(v), u.max(v));
                if n < 0 || !in_corridor(n as usize) {
                    boundary.insert(key, (n, self.tris[t].con[e]));
                } else if self.tris[t].con[e] {
                    interior_con.push(key);
                }
            }
        }

        // Left half: region left of a→b, chain ordered a to b. Right half:
        // region left of b→a, so its chain must run b to a.
        let mut new_tris: Vec<[usize; 3]> = Vec::new();
        self.triangulate_pseudo(a, b, left, &mut new_tris);
        let right_rev: Vec<usize> = right.iter().rev().copied().collect();
        self.triangulate_pseudo(b, a, &right_rev, &mut new_tris);

        // Push the patch, then wire adjacency: boundary edges reconnect to
        // the outside; the rest pair up patch-internally (including (a,b)
        // between the two halves).
        let base = self.tris.len();
        for &tv in &new_tris {
            self.tris.push(Tri {
                v: tv,
                adj: [-1, -1, -1],
                con: [false, false, false],
                alive: true,
            });
        }
        let mut open: HashMap<(usize, usize), (usize, usize)> = HashMap::default();
        for t in base..self.tris.len() {
            for e in 0..3 {
                let u = self.tris[t].v[e];
                let v = self.tris[t].v[(e + 1) % 3];
                let key = (u.min(v), u.max(v));
                if let Some(&(bn, bcon)) = boundary.get(&key) {
                    self.tris[t].adj[e] = bn;
                    self.tris[t].con[e] = bcon;
                    if bn >= 0 {
                        let n = bn as usize;
                        let ne = (0..3)
                            .find(|&k| {
                                let nu = self.tris[n].v[k];
                                let nv = self.tris[n].v[(k + 1) % 3];
                                (nu.min(nv), nu.max(nv)) == key
                            })
                            .expect("cavity boundary neighbor lost its edge");
                        self.tris[n].adj[ne] = t as i32;
                    }
                } else if let Some((t2, e2)) = open.remove(&key) {
                    self.tris[t].adj[e] = t2 as i32;
                    self.tris[t2].adj[e2] = t as i32;
                } else {
                    open.insert(key, (t, e));
                }
            }
        }
        assert!(
            open.is_empty(),
            "cavity retriangulation left unmatched patch edges"
        );
        // vert_tri invariant: record replacements before killing the corridor.
        for t in base..self.tris.len() {
            self.record(t);
        }
        for &t in crossed {
            self.tris[t].alive = false;
        }
        for (u, v) in interior_con {
            assert!(
                self.mark_if_present(u, v),
                "constrained pinch edge ({u},{v}) was not reproduced by the rebuild"
            );
        }
    }

    /// If edge (a,b) exists, set its constrained flag on both sides and
    /// return true. Rotation around `a` visits every incident triangle, so
    /// absence there is definitive — no global scan.
    fn mark_if_present(&mut self, a: usize, b: usize) -> bool {
        let found = self.rotate_around(a, |t| {
            (0..3).find_map(|e| {
                let u = self.tris[t].v[e];
                let v = self.tris[t].v[(e + 1) % 3];
                ((u, v) == (a, b) || (u, v) == (b, a)).then_some((t, e))
            })
        });
        match found {
            Some((t, e)) => {
                self.tris[t].con[e] = true;
                let n = self.tris[t].adj[e];
                if n >= 0 {
                    let ne = self.shared_edge(n as usize, t);
                    self.tris[n as usize].con[ne] = true;
                }
                true
            }
            None => false,
        }
    }

    /// Strict proper-crossing test of edge (u,v) against segment (a,b).
    fn strictly_crosses(&self, a: usize, b: usize, u: usize, v: usize) -> bool {
        let su = self.o2(a, b, u);
        let sv = self.o2(a, b, v);
        if su == Sign::Zero || sv == Sign::Zero || su == sv {
            return false;
        }
        let sa = self.o2(u, v, a);
        let sb = self.o2(u, v, b);
        sa != Sign::Zero && sb != Sign::Zero && sa != sb
    }
}
