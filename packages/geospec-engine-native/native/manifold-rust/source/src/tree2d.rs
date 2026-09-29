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

// Phase 10: tree2d — ported from cpp-reference/manifold/src/tree2d.h/.cpp

use crate::types::{PolyVert, Rect};

fn build_two_d_tree_impl(points: &mut [PolyVert], sort_x: bool) {
    if sort_x {
        points.sort_by(|a, b| a.pos.x.partial_cmp(&b.pos.x).unwrap_or(std::cmp::Ordering::Equal));
    } else {
        points.sort_by(|a, b| a.pos.y.partial_cmp(&b.pos.y).unwrap_or(std::cmp::Ordering::Equal));
    }
    if points.len() < 2 {
        return;
    }

    let mid = points.len() / 2;
    build_two_d_tree_impl(&mut points[..mid], !sort_x);
    if mid + 1 < points.len() {
        build_two_d_tree_impl(&mut points[mid + 1..], !sort_x);
    }
}

pub fn build_two_d_tree(points: &mut [PolyVert]) {
    if points.len() <= 8 {
        return;
    }
    build_two_d_tree_impl(points, true);
}

pub fn query_two_d_tree<F: FnMut(PolyVert)>(points: &[PolyVert], rect: Rect, mut f: F) {
    if points.len() <= 8 {
        for &p in points {
            if rect.contains_point(p.pos) {
                f(p);
            }
        }
        return;
    }

    let mut current = Rect::new();
    current.min = crate::linalg::Vec2::splat(f64::NEG_INFINITY);
    current.max = crate::linalg::Vec2::splat(f64::INFINITY);

    let mut level = 0usize;
    let mut current_range = (0usize, points.len());
    let mut rect_stack: Vec<Rect> = Vec::new();
    let mut range_stack: Vec<(usize, usize)> = Vec::new();
    let mut level_stack: Vec<usize> = Vec::new();

    loop {
        let current_view = &points[current_range.0..current_range.1];
        if current_view.len() <= 8 {
            for &p in current_view {
                if rect.contains_point(p.pos) {
                    f(p);
                }
            }
            if let Some(next_level) = level_stack.pop() {
                level = next_level;
                current_range = range_stack.pop().unwrap();
                current = rect_stack.pop().unwrap();
                continue;
            }
            break;
        }

        let mut left = current;
        let mut right = current;
        let mid = current_view.len() / 2;
        let middle = current_view[mid];
        if level % 2 == 0 {
            left.max.x = middle.pos.x;
            right.min.x = middle.pos.x;
        } else {
            left.max.y = middle.pos.y;
            right.min.y = middle.pos.y;
        }

        if rect.contains_point(middle.pos) {
            f(middle);
        }

        let left_overlaps = left.does_overlap(&rect);
        let right_overlaps = right.does_overlap(&rect);
        if left_overlaps {
            if right_overlaps {
                rect_stack.push(right);
                range_stack.push((current_range.0 + mid + 1, current_range.1));
                level_stack.push(level + 1);
            }
            current = left;
            current_range = (current_range.0, current_range.0 + mid);
            level += 1;
        } else if right_overlaps {
            current = right;
            current_range = (current_range.0 + mid + 1, current_range.1);
            level += 1;
        } else if let Some(next_level) = level_stack.pop() {
            level = next_level;
            current_range = range_stack.pop().unwrap();
            current = rect_stack.pop().unwrap();
        } else {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::Vec2;

    #[test]
    fn test_build_two_d_tree_and_query() {
        let mut points = vec![
            PolyVert { pos: Vec2::new(0.0, 0.0), idx: 0 },
            PolyVert { pos: Vec2::new(1.0, 1.0), idx: 1 },
            PolyVert { pos: Vec2::new(2.0, 2.0), idx: 2 },
            PolyVert { pos: Vec2::new(3.0, 3.0), idx: 3 },
            PolyVert { pos: Vec2::new(4.0, 4.0), idx: 4 },
            PolyVert { pos: Vec2::new(5.0, 5.0), idx: 5 },
            PolyVert { pos: Vec2::new(6.0, 6.0), idx: 6 },
            PolyVert { pos: Vec2::new(7.0, 7.0), idx: 7 },
            PolyVert { pos: Vec2::new(8.0, 8.0), idx: 8 },
        ];
        build_two_d_tree(&mut points);
        let rect = Rect::from_points(Vec2::new(1.5, 1.5), Vec2::new(6.5, 6.5));
        let mut out = Vec::new();
        query_two_d_tree(&points, rect, |p| out.push(p.idx));
        out.sort_unstable();
        assert_eq!(out, vec![2, 3, 4, 5, 6]);
    }

    #[test]
    fn test_query_two_d_tree_small_input() {
        let points = vec![
            PolyVert { pos: Vec2::new(0.0, 0.0), idx: 0 },
            PolyVert { pos: Vec2::new(2.0, 2.0), idx: 1 },
        ];
        let rect = Rect::from_points(Vec2::new(-1.0, -1.0), Vec2::new(1.0, 1.0));
        let mut out = Vec::new();
        query_two_d_tree(&points, rect, |p| out.push(p.idx));
        assert_eq!(out, vec![0]);
    }
}
