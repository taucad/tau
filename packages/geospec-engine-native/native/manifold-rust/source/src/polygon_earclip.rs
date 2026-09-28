// EarClip triangulator — extracted from polygon.rs
// Port of C++ ear-clipping algorithm with 2D KD-tree acceleration

use std::collections::HashMap;
use crate::linalg::Vec2;
use crate::types::{PolyVert, PolygonsIdx, Rect, K_PRECISION};

use super::{ccw, determinant2x2, safe_normalize_2d, dot2d,
            build_two_d_tree, query_two_d_tree, INVALID, K_BEST, IVec3Out};

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

pub(super) struct Vert {
    pub mesh_idx: i32,
    pub cost: f64,
    pub ear_version: u32,
    pub pos: Vec2,
    pub right_dir: Vec2,
    pub left: usize,
    pub right: usize,
}

impl Clone for Vert {
    fn clone(&self) -> Self {
        Vert {
            mesh_idx: self.mesh_idx,
            cost: self.cost,
            ear_version: self.ear_version,
            pos: self.pos,
            right_dir: self.right_dir,
            left: self.left,
            right: self.right,
        }
    }
}

/// Entry in the min-heap ear queue.
#[derive(Clone, Copy, PartialEq)]
struct EarEntry {
    cost: f64,
    idx: usize,
    version: u32,
    /// Monotonic insertion sequence. C++ uses a std::multiset, which keeps
    /// equal-cost entries in INSERTION order and pops the oldest first —
    /// equal costs are common (kBest = -inf for short ears), so this FIFO
    /// tie-break decides which degenerate ear clips first and must match.
    seq: u64,
}

impl Eq for EarEntry {}

impl PartialOrd for EarEntry {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for EarEntry {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Min-heap: lower cost = higher priority (appears first in pop);
        // ties: lower seq (older insertion) = higher priority.
        // BinaryHeap is max-heap, so "greater" = higher priority.
        other
            .cost
            .partial_cmp(&self.cost)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(other.seq.cmp(&self.seq))
    }
}

struct IdxCollider {
    points: Vec<PolyVert>,
    itr: Vec<usize>, // itr[i] = polygon vert index for points[i].idx
}

// ---------------------------------------------------------------------------
// EarClip
// ---------------------------------------------------------------------------

pub(super) struct EarClip {
    polygon: Vec<Vert>,
    holes: Vec<usize>,
    outers: Vec<usize>,
    simples: Vec<usize>,
    hole2bbox: HashMap<usize, Rect>,
    ears_queue: std::collections::BinaryHeap<EarEntry>,
    /// Monotonic counter for EarEntry::seq (FIFO tie-break among equal costs).
    ear_seq: u64,
    pub triangles: Vec<IVec3Out>,
    bbox: Rect,
    pub epsilon: f64,
}

impl EarClip {
    pub fn new(polys: &PolygonsIdx, epsilon: f64) -> Self {
        let num_vert: usize = polys.iter().map(|p| p.len()).sum();
        let mut ec = EarClip {
            polygon: Vec::with_capacity(num_vert + 2 * polys.len()),
            holes: Vec::new(),
            outers: Vec::new(),
            simples: Vec::new(),
            hole2bbox: HashMap::new(),
            ears_queue: std::collections::BinaryHeap::new(),
            ear_seq: 0,
            triangles: Vec::with_capacity(num_vert + 2 * polys.len()),
            bbox: Rect::new(),
            epsilon,
        };

        let starts = ec.initialize(polys);

        // Clip degenerate verts
        for i in 0..ec.polygon.len() {
            ec.clip_if_degenerate(i);
        }

        // Find start/classify each polygon
        for start in starts {
            ec.find_start(start);
        }
        // C++ stores holes_ in a multiset ordered by MaxX. Keyholing from
        // right to left prevents a later bridge from crossing an earlier one.
        ec.holes.sort_by(|&left, &right| {
            ec.polygon[right]
                .pos
                .x
                .partial_cmp(&ec.polygon[left].pos.x)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        ec
    }

    pub fn triangulate(mut self) -> (Vec<IVec3Out>, f64) {
        // Key-hole all holes into outer polygons
        let holes: Vec<usize> = self.holes.clone();
        for start in holes {
            self.cut_keyhole(start);
        }

        // Ear-clip each simple polygon
        let simples: Vec<usize> = self.simples.clone();
        for start in simples {
            self.triangulate_poly(start);
        }

        let eps = self.epsilon;
        (self.triangles, eps)
    }

    // -----------------------------------------------------------------------
    // Linked-list helpers
    // -----------------------------------------------------------------------

    fn clipped(&self, v: usize) -> bool {
        self.polygon[self.polygon[v].right].left != v
    }

    fn link(&mut self, left: usize, right: usize) {
        self.polygon[left].right = right;
        self.polygon[right].left = left;
        let dir = self.polygon[right].pos - self.polygon[left].pos;
        self.polygon[left].right_dir = safe_normalize_2d(dir);
    }

    /// Apply `f` to each unclipped vert in the polygon ring starting from `first`.
    /// Returns `Some(last_v)` on success (last_v == first), or `None` if degenerate.
    fn loop_verts(&self, first: usize) -> Option<Vec<usize>> {
        let mut result = Vec::new();
        let mut v = first;
        let mut cur_first = first;
        loop {
            if self.clipped(v) {
                cur_first = self.polygon[self.polygon[v].right].left;
                if !self.clipped(cur_first) {
                    v = cur_first;
                    if self.polygon[v].right == self.polygon[v].left {
                        return None;
                    }
                    result.push(v);
                }
            } else {
                if self.polygon[v].right == self.polygon[v].left {
                    return None;
                }
                result.push(v);
            }
            v = self.polygon[v].right;
            if v == cur_first {
                break;
            }
        }
        Some(result)
    }

    // -----------------------------------------------------------------------
    // Vert predicate methods (take vert index `v`)
    // -----------------------------------------------------------------------

    fn vert_is_short(&self, v: usize) -> bool {
        let edge = self.polygon[self.polygon[v].right].pos - self.polygon[v].pos;
        dot2d(edge, edge) * 4.0 < self.epsilon * self.epsilon
    }

    // NOTE: C++ `Vert::Interior` (polygon.cpp) is not ported: it is defined but
    // never called in the upstream reference either.

    /// Returns true if vert `v` is on the inside of the edge tail -> tail.right.
    /// to_left: walk v's polygon edges to the left (vs right).
    fn vert_inside_edge(&self, v: usize, tail: usize, to_left: bool) -> bool {
        let p2 = self.epsilon * self.epsilon;
        let mut next_l = self.polygon[self.polygon[v].left].right;
        let mut next_r = self.polygon[tail].right;
        let mut center = tail;
        let mut last = center;

        let v_stop = if to_left { self.polygon[v].right } else { self.polygon[v].left };

        loop {
            if next_l == next_r || tail == next_r || next_l == v_stop {
                break;
            }

            let edge_l = self.polygon[next_l].pos - self.polygon[center].pos;
            let l2 = dot2d(edge_l, edge_l);
            if l2 <= p2 {
                next_l = if to_left { self.polygon[next_l].left } else { self.polygon[next_l].right };
                continue;
            }

            let edge_r = self.polygon[next_r].pos - self.polygon[center].pos;
            let r2 = dot2d(edge_r, edge_r);
            if r2 <= p2 {
                next_r = self.polygon[next_r].right;
                continue;
            }

            let vec_lr = self.polygon[next_r].pos - self.polygon[next_l].pos;
            let lr2 = dot2d(vec_lr, vec_lr);
            if lr2 <= p2 {
                last = center;
                center = next_l;
                next_l = if to_left { self.polygon[next_l].left } else { self.polygon[next_l].right };
                if next_l == next_r {
                    break;
                }
                next_r = self.polygon[next_r].right;
                continue;
            }

            let mut convexity = ccw(
                self.polygon[next_l].pos,
                self.polygon[center].pos,
                self.polygon[next_r].pos,
                self.epsilon,
            );
            if center != last {
                convexity += ccw(self.polygon[last].pos, self.polygon[center].pos, self.polygon[next_l].pos, self.epsilon)
                    + ccw(self.polygon[next_r].pos, self.polygon[center].pos, self.polygon[last].pos, self.epsilon);
            }
            if convexity != 0 {
                return convexity > 0;
            }

            if l2 < r2 {
                center = next_l;
                next_l = if to_left { self.polygon[next_l].left } else { self.polygon[next_l].right };
            } else {
                center = next_r;
                next_r = self.polygon[next_r].right;
            }
            last = center;
        }
        true
    }

    fn vert_is_convex(&self, v: usize, epsilon: f64) -> bool {
        let left = self.polygon[v].left;
        let right = self.polygon[v].right;
        ccw(self.polygon[left].pos, self.polygon[v].pos, self.polygon[right].pos, epsilon) >= 0
    }

    fn vert_is_reflex(&self, v: usize) -> bool {
        let left = self.polygon[v].left;
        !self.vert_inside_edge(left, self.polygon[left].right, true)
    }

    /// x-value on this vert's right edge at start.y, or NaN if no crossing.
    fn vert_interp_y2x(&self, v: usize, start: Vec2, on_top: i32) -> f64 {
        let pos = self.polygon[v].pos;
        let rpos = self.polygon[self.polygon[v].right].pos;
        let eps = self.epsilon;
        if (pos.y - start.y).abs() <= eps {
            if rpos.y <= start.y + eps || on_top == 1 {
                f64::NAN
            } else {
                pos.x
            }
        } else if pos.y < start.y - eps {
            if rpos.y > start.y + eps {
                pos.x + (start.y - pos.y) * (rpos.x - pos.x) / (rpos.y - pos.y)
            } else if rpos.y < start.y - eps || on_top == -1 {
                f64::NAN
            } else {
                rpos.x
            }
        } else {
            f64::NAN
        }
    }

    /// Signed distance of vert `other` relative to the edge at `v` in direction `unit`.
    fn vert_signed_dist(&self, v: usize, other: usize, unit: Vec2) -> f64 {
        let eps = self.epsilon;
        let d = determinant2x2(unit, self.polygon[other].pos - self.polygon[v].pos);
        if d.abs() < eps {
            let d_r = determinant2x2(unit, self.polygon[self.polygon[other].right].pos - self.polygon[v].pos);
            if d_r.abs() > eps {
                return d_r;
            }
            let d_l = determinant2x2(unit, self.polygon[self.polygon[other].left].pos - self.polygon[v].pos);
            if d_l.abs() > eps {
                return d_l;
            }
        }
        d
    }

    /// Cost of vert `other` within ear `v`, where `open_side` is the unit vector left->right.
    fn vert_cost(&self, v: usize, other: usize, open_side: Vec2) -> f64 {
        let left = self.polygon[v].left;
        let right = self.polygon[v].right;
        let cost = self.vert_signed_dist(v, other, self.polygon[v].right_dir)
            .min(self.vert_signed_dist(left, other, self.polygon[left].right_dir));
        let open_cost = determinant2x2(open_side, self.polygon[other].pos - self.polygon[right].pos);
        cost.min(open_cost)
    }

    fn delaunay_cost(diff: Vec2, scale: f64, epsilon: f64) -> f64 {
        -epsilon - scale * dot2d(diff, diff)
    }

    fn vert_ear_cost(&self, v: usize, collider: &IdxCollider) -> f64 {
        let left = self.polygon[v].left;
        let right = self.polygon[v].right;
        let open_side_vec = self.polygon[left].pos - self.polygon[right].pos;
        let center = (self.polygon[left].pos + self.polygon[right].pos) * 0.5;
        let denom = dot2d(open_side_vec, open_side_vec);
        let scale = if denom > 0.0 { 4.0 / denom } else { 0.0 };
        let radius = denom.sqrt() * 0.5;
        let open_side = safe_normalize_2d(open_side_vec);

        let total_cost = dot2d(self.polygon[left].right_dir, self.polygon[v].right_dir) - 1.0 - self.epsilon;

        // Folded ears: clip first
        if ccw(self.polygon[v].pos, self.polygon[left].pos, self.polygon[right].pos, self.epsilon) == 0 {
            return total_cost;
        }

        // Build ear bounding box, expanded to include pos, then by epsilon
        let cx = center.x;
        let cy = center.y;
        let mut ear_box = Rect::from_points(
            Vec2::new(cx - radius, cy - radius),
            Vec2::new(cx + radius, cy + radius),
        );
        ear_box.union_point(self.polygon[v].pos);
        ear_box.min = ear_box.min - Vec2::splat(self.epsilon);
        ear_box.max = ear_box.max + Vec2::splat(self.epsilon);

        let lid = self.polygon[left].mesh_idx;
        let rid = self.polygon[right].mesh_idx;
        let mid_id = self.polygon[v].mesh_idx;

        let mut tc = total_cost;
        query_two_d_tree(&collider.points, ear_box, |point| {
            let test = collider.itr[point.idx as usize];
            if !self.clipped(test)
                && self.polygon[test].mesh_idx != mid_id
                && self.polygon[test].mesh_idx != lid
                && self.polygon[test].mesh_idx != rid
            {
                let mut cost = self.vert_cost(v, test, open_side);
                if cost < -self.epsilon {
                    cost = Self::delaunay_cost(self.polygon[test].pos - center, scale, self.epsilon);
                }
                if cost > tc {
                    tc = cost;
                }
            }
        });
        tc
    }

    // -----------------------------------------------------------------------
    // Core algorithm methods
    // -----------------------------------------------------------------------

    /// Remove ear vert from polygon and emit a triangle.
    fn clip_ear(&mut self, ear: usize) {
        let left = self.polygon[ear].left;
        let right = self.polygon[ear].right;
        self.link(left, right);
        if self.polygon[left].mesh_idx != self.polygon[ear].mesh_idx
            && self.polygon[ear].mesh_idx != self.polygon[right].mesh_idx
            && self.polygon[right].mesh_idx != self.polygon[left].mesh_idx
        {
            self.triangles.push(IVec3Out::new(
                self.polygon[left].mesh_idx,
                self.polygon[ear].mesh_idx,
                self.polygon[right].mesh_idx,
            ));
        }
    }

    /// Clip degenerate ears (zero-area or very short edges).
    fn clip_if_degenerate(&mut self, ear: usize) {
        if self.clipped(ear) {
            return;
        }
        if self.polygon[ear].left == self.polygon[ear].right {
            return;
        }
        let right = self.polygon[ear].right;
        let left = self.polygon[ear].left;
        let is_short = self.vert_is_short(ear);
        let is_colinear_fold = {
            let lp = self.polygon[left].pos;
            let ep = self.polygon[ear].pos;
            let rp = self.polygon[right].pos;
            let diff_l = lp - ep;
            let diff_r = rp - ep;
            ccw(lp, ep, rp, self.epsilon) == 0 && dot2d(diff_l, diff_r) > 0.0
        };
        if is_short || is_colinear_fold {
            self.clip_ear(ear);
            let l = self.polygon[ear].left;
            let r = self.polygon[ear].right;
            self.clip_if_degenerate(l);
            self.clip_if_degenerate(r);
        }
    }

    /// Build the circular polygon list from input polygons. Returns start indices.
    fn initialize(&mut self, polys: &PolygonsIdx) -> Vec<usize> {
        let mut starts = Vec::new();
        for poly in polys {
            if poly.is_empty() {
                continue;
            }
            let first_idx = self.polygon.len();
            let vert = &poly[0];
            self.polygon.push(Vert {
                mesh_idx: vert.idx,
                cost: 0.0,
                ear_version: 0,
                pos: vert.pos,
                right_dir: Vec2::new(0.0, 0.0),
                left: INVALID,
                right: INVALID,
            });
            self.bbox.union_point(vert.pos);
            let mut last = first_idx;
            starts.push(first_idx);

            for vert in &poly[1..] {
                let next_idx = self.polygon.len();
                self.polygon.push(Vert {
                    mesh_idx: vert.idx,
                    cost: 0.0,
                    ear_version: 0,
                    pos: vert.pos,
                    right_dir: Vec2::new(0.0, 0.0),
                    left: INVALID,
                    right: INVALID,
                });
                self.bbox.union_point(vert.pos);
                self.link(last, next_idx);
                last = next_idx;
            }
            self.link(last, first_idx);
        }

        if self.epsilon < 0.0 {
            self.epsilon = self.bbox.scale() * K_PRECISION;
        }

        starts
    }

    /// Classify a polygon as hole or outer. For holes, find the rightmost reflex vert.
    fn find_start(&mut self, first: usize) {
        let origin = self.polygon[first].pos;
        let mut start = first;
        let mut max_x = f64::NEG_INFINITY;
        let mut bbox = Rect::new();
        // Kahan summation
        let mut area: f64 = 0.0;
        let mut area_comp: f64 = 0.0;

        let verts = match self.loop_verts(first) {
            None => return,
            Some(v) => v,
        };

        for &v in &verts {
            bbox.union_point(self.polygon[v].pos);
            let a1 = determinant2x2(
                self.polygon[v].pos - origin,
                self.polygon[self.polygon[v].right].pos - origin,
            );
            let t1 = area + a1;
            area_comp += (area - t1) + a1;
            area = t1;

            if self.polygon[v].pos.x > max_x && self.vert_is_reflex(v) {
                max_x = self.polygon[v].pos.x;
                start = v;
            }
        }

        area += area_comp;
        let size = bbox.size();
        let min_area = self.epsilon * size.x.max(size.y);

        if max_x.is_finite() && area < -min_area {
            // Hole (negative area)
            // Collected here and sorted by descending max X after classification.
            self.holes.push(start);
            self.hole2bbox.insert(start, bbox);
        } else {
            self.simples.push(start);
            if area > min_area {
                self.outers.push(start);
            }
        }
    }

    /// Attach a hole to an outer polygon via a keyhole.
    fn cut_keyhole(&mut self, start: usize) {
        let bbox = *self.hole2bbox.get(&start).unwrap();
        let start_pos = self.polygon[start].pos;
        let on_top: i32 = if start_pos.y >= bbox.max.y - self.epsilon {
            1
        } else if start_pos.y <= bbox.min.y + self.epsilon {
            -1
        } else {
            0
        };
        let mut connector: usize = INVALID;

        // Port of the C++ CheckEdge lambda: take `edge` as the new connector
        // when the horizontal ray from `start` crosses it (finite x), `start`
        // lies inside THAT edge's wedge, and it beats the current connector —
        // either the crossing point is CCW of the connector edge, or (for any
        // non-CCW result) the vertical-ordering InsideEdge tie-break holds.
        let outers: Vec<usize> = self.outers.clone();
        for outer_start in &outers {
            let verts = match self.loop_verts(*outer_start) {
                None => continue,
                Some(v) => v,
            };
            for &edge in &verts {
                let x = self.vert_interp_y2x(edge, start_pos, on_top);
                if x.is_finite()
                    && self.vert_inside_edge(start, edge, true)
                    && (connector == INVALID
                        || ccw(
                            Vec2::new(x, start_pos.y),
                            self.polygon[connector].pos,
                            self.polygon[self.polygon[connector].right].pos,
                            self.epsilon,
                        ) == 1
                        || (if self.polygon[connector].pos.y < self.polygon[edge].pos.y {
                            self.vert_inside_edge(edge, connector, false)
                        } else {
                            !self.vert_inside_edge(connector, edge, false)
                        }))
                {
                    connector = edge;
                }
            }
        }

        if connector == INVALID {
            self.simples.push(start);
            return;
        }

        connector = self.find_closer_bridge(start, connector);
        self.join_polygons(start, connector);
    }

    /// Refine keyhole connector: find any reflex vert closer to start.
    fn find_closer_bridge(&self, start: usize, edge: usize) -> usize {
        let start_pos = self.polygon[start].pos;
        let edge_right = self.polygon[edge].right;
        let mut connector = if self.polygon[edge].pos.x < start_pos.x {
            edge_right
        } else if self.polygon[edge_right].pos.x < start_pos.x {
            edge
        } else if self.polygon[edge_right].pos.y - start_pos.y > start_pos.y - self.polygon[edge].pos.y {
            edge
        } else {
            edge_right
        };

        if (self.polygon[connector].pos.y - start_pos.y).abs() <= self.epsilon {
            return connector;
        }
        let above: f64 = if self.polygon[connector].pos.y > start_pos.y {
            1.0
        } else {
            -1.0
        };

        let outers: Vec<usize> = self.outers.clone();
        for outer_start in &outers {
            let verts = match self.loop_verts(*outer_start) {
                None => continue,
                Some(v) => v,
            };
            for &vert in &verts {
                let inside = above
                    * ccw(start_pos, self.polygon[vert].pos, self.polygon[connector].pos, self.epsilon) as f64;
                let vp = self.polygon[vert].pos;
                let cp = self.polygon[connector].pos;
                if vp.x > start_pos.x - self.epsilon
                    && vp.y * above > start_pos.y * above - self.epsilon
                    && (inside > 0.0
                        || (inside == 0.0 && vp.x < cp.x && vp.y * above < cp.y * above))
                    && self.vert_inside_edge(vert, edge, true)
                    && self.vert_is_reflex(vert)
                {
                    connector = vert;
                }
            }
        }

        connector
    }

    /// Create a keyhole between hole `start` and outer polygon `connector`.
    fn join_polygons(&mut self, start: usize, connector: usize) {
        let new_start = self.polygon.len();
        self.polygon.push(self.polygon[start].clone());
        let new_connector = self.polygon.len();
        self.polygon.push(self.polygon[connector].clone());

        let start_right = self.polygon[start].right;
        self.polygon[start_right].left = new_start;
        let connector_left = self.polygon[connector].left;
        self.polygon[connector_left].right = new_connector;

        self.link(start, connector);
        self.link(new_connector, new_start);

        self.clip_if_degenerate(start);
        self.clip_if_degenerate(new_start);
        self.clip_if_degenerate(connector);
        self.clip_if_degenerate(new_connector);
    }

    /// Update ear queue entry for vert v.
    fn process_ear(&mut self, v: usize, collider: &IdxCollider) {
        // Lazy-delete existing queue entry
        self.polygon[v].ear_version = self.polygon[v].ear_version.wrapping_add(1);

        if self.vert_is_short(v) {
            self.polygon[v].cost = K_BEST;
            let version = self.polygon[v].ear_version;
            let seq = self.ear_seq;
            self.ear_seq += 1;
            self.ears_queue.push(EarEntry { cost: K_BEST, idx: v, version, seq });
        } else if self.vert_is_convex(v, 2.0 * self.epsilon) {
            let cost = self.vert_ear_cost(v, collider);
            self.polygon[v].cost = cost;
            let version = self.polygon[v].ear_version;
            let seq = self.ear_seq;
            self.ear_seq += 1;
            self.ears_queue.push(EarEntry { cost, idx: v, version, seq });
        } else {
            self.polygon[v].cost = 1.0; // reflex, not an ear
        }
    }

    /// Build a 2D KD-tree collider of all polygon verts for ear cost queries.
    fn vert_collider(&self, start: usize) -> IdxCollider {
        let verts = match self.loop_verts(start) {
            None => return IdxCollider { points: Vec::new(), itr: Vec::new() },
            Some(v) => v,
        };

        let mut itr = Vec::with_capacity(verts.len());
        let mut points = Vec::with_capacity(verts.len());
        for (k, &v) in verts.iter().enumerate() {
            points.push(PolyVert { pos: self.polygon[v].pos, idx: k as i32 });
            itr.push(v);
        }

        build_two_d_tree(&mut points);
        IdxCollider { points, itr }
    }

    /// Main ear-clipping loop for a simple polygon.
    fn triangulate_poly(&mut self, start: usize) {
        let collider = self.vert_collider(start);
        if collider.itr.is_empty() {
            return;
        }

        self.ears_queue.clear();
        let mut num_tri: i32 = -2;

        // Queue all verts and count
        let verts = match self.loop_verts(start) {
            None => return,
            Some(v) => v,
        };

        for &v in &verts {
            self.process_ear(v, &collider);
            num_tri += 1;
        }

        let mut last_v = *verts.last().unwrap();

        while num_tri > 0 {
            // Pop the cheapest valid ear
            let ear = loop {
                match self.ears_queue.pop() {
                    None => {
                        // Fallback: use last_v
                        break last_v;
                    }
                    Some(entry) => {
                        if entry.version == self.polygon[entry.idx].ear_version {
                            break entry.idx;
                        }
                        // Stale entry, try next
                    }
                }
            };

            self.clip_ear(ear);
            num_tri -= 1;

            let ear_left = self.polygon[ear].left;
            let ear_right = self.polygon[ear].right;
            self.process_ear(ear_left, &collider);
            self.process_ear(ear_right, &collider);
            last_v = ear_right;
        }
    }
}

#[cfg(test)]
#[path = "polygon_earclip_tests.rs"]
mod tests;
