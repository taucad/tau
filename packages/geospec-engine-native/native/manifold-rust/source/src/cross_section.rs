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

use crate::types::OpType;
pub use clipper2_rust::FillRule;
use clipper2_rust::{
    area, inflate_paths_d, minkowski_sum_d, simplify_paths, union_d, ClipType, ClipperD, EndType,
    JoinType, PathD, PathsD, Point, PolyTreeD,
};

use crate::linalg::Vec2;
use crate::math;
use crate::types::{Polygons, Rect};

// Manifold 3.4.1 uses this precision for construction, booleans, and decomposition.
const PRECISION: i32 = 8;

#[derive(Clone, Copy)]
enum BooleanOperation {
    Union,
    Intersection,
    Difference,
}

/// A checked CrossSection conversion or clipping failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CrossSectionError {
    /// A coordinate cannot be represented on the operation's integer grid.
    CoordinateOutOfRange,
    /// Clipper could not complete the requested operation.
    ClipperFailure,
}

impl std::fmt::Display for CrossSectionError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::CoordinateOutOfRange => {
                formatter.write_str("CrossSection coordinate out of range")
            }
            Self::ClipperFailure => formatter.write_str("CrossSection clipping failed"),
        }
    }
}

impl std::error::Error for CrossSectionError {}

#[derive(Clone, Debug, Default)]
pub struct CrossSection {
    polygons: Polygons,
}

fn to_paths(polygons: &Polygons) -> PathsD {
    polygons
        .iter()
        .map(|poly| poly.iter().map(|p| Point::new(p.x, p.y)).collect::<PathD>())
        .collect()
}

fn from_paths(paths: &PathsD) -> Polygons {
    paths
        .iter()
        .map(|path| path.iter().map(|p| Vec2::new(p.x, p.y)).collect())
        .collect()
}

fn validate_paths(paths: &PathsD) -> Result<(), CrossSectionError> {
    if paths
        .iter()
        .flatten()
        .any(|point| !point.x.is_finite() || !point.y.is_finite())
    {
        return Err(CrossSectionError::CoordinateOutOfRange);
    }
    Ok(())
}

fn boolean_paths(
    subjects: &Polygons,
    clips: &Polygons,
    operation: BooleanOperation,
    fill_rule: FillRule,
    precision: i32,
) -> Result<Polygons, CrossSectionError> {
    let subjects = to_paths(subjects);
    let clips = to_paths(clips);
    validate_paths(&subjects)?;
    validate_paths(&clips)?;
    let clip_type = match operation {
        BooleanOperation::Union => ClipType::Union,
        BooleanOperation::Intersection => ClipType::Intersection,
        BooleanOperation::Difference => ClipType::Difference,
    };
    let mut clipper = ClipperD::new(precision);
    clipper.add_subject(&subjects);
    clipper.add_clip(&clips);
    if clipper.error_code() != 0 {
        return Err(CrossSectionError::CoordinateOutOfRange);
    }
    let mut result = PathsD::new();
    if !clipper.execute(clip_type, fill_rule, &mut result, None) || clipper.error_code() != 0 {
        return Err(CrossSectionError::ClipperFailure);
    }
    Ok(from_paths(&result))
}

fn signed_area(poly: &[Vec2]) -> f64 {
    let mut area = 0.0;
    for i in 0..poly.len() {
        let j = (i + 1) % poly.len();
        area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    }
    area * 0.5
}

impl CrossSection {
    pub fn new(polygons: Polygons) -> Self {
        Self { polygons }
    }

    /// Create a CrossSection from polygons, normalizing via Clipper2 Union.
    /// Mirrors C++ CrossSection(Polygons, FillRule) constructor which runs
    /// the polygons through C2::Union to merge overlapping regions.
    pub fn from_polygons_fill(polygons: Polygons) -> Self {
        Self::from_polygons_with_fill_rule(polygons, FillRule::NonZero)
    }

    /// Normalize all contours together with an explicit winding rule.
    pub fn from_polygons_with_fill_rule(polygons: Polygons, fill_rule: FillRule) -> Self {
        Self::try_from_polygons_with_fill_rule(polygons, fill_rule)
            .expect("CrossSection construction failed")
    }

    /// Normalize contours while preserving conversion and clipping failures.
    pub fn try_from_polygons_with_fill_rule(
        polygons: Polygons,
        fill_rule: FillRule,
    ) -> Result<Self, CrossSectionError> {
        if polygons.is_empty() {
            return Ok(Self::default());
        }
        Ok(Self::new(boolean_paths(
            &polygons,
            &Vec::new(),
            BooleanOperation::Union,
            fill_rule,
            PRECISION,
        )?))
    }

    /// Create a CrossSection from a Rect (axis-aligned rectangle).
    /// Matches C++ CrossSection(Rect) constructor.
    pub fn from_rect(rect: &Rect) -> Self {
        if rect.is_empty() {
            return Self::default();
        }
        Self::new(vec![vec![
            Vec2::new(rect.min.x, rect.min.y),
            Vec2::new(rect.max.x, rect.min.y),
            Vec2::new(rect.max.x, rect.max.y),
            Vec2::new(rect.min.x, rect.max.y),
        ]])
    }

    pub fn square(size: f64) -> Self {
        if size <= 0.0 {
            return Self { polygons: vec![] };
        }
        Self::new(vec![vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(size, 0.0),
            Vec2::new(size, size),
            Vec2::new(0.0, size),
        ]])
    }

    /// Create a rectangle of size (w, h), optionally centered at origin.
    /// Matches C++ CrossSection::Square(vec2, center).
    pub fn square_vec2(size: Vec2, center: bool) -> Self {
        let (w, h) = (size.x, size.y);
        if w <= 0.0 || h <= 0.0 {
            return Self { polygons: vec![] };
        }
        let (x0, y0, x1, y1) = if center {
            (-w / 2.0, -h / 2.0, w / 2.0, h / 2.0)
        } else {
            (0.0, 0.0, w, h)
        };
        Self::new(vec![vec![
            Vec2::new(x0, y0),
            Vec2::new(x1, y0),
            Vec2::new(x1, y1),
            Vec2::new(x0, y1),
        ]])
    }

    pub fn circle(radius: f64, segments: i32) -> Self {
        if radius <= 0.0 {
            return Self { polygons: vec![] };
        }
        let segments = segments.max(3) as usize;
        let poly = (0..segments)
            .map(|i| {
                let a = (i as f64 / segments as f64) * std::f64::consts::TAU;
                Vec2::new(radius * math::cos(a), radius * math::sin(a))
            })
            .collect();
        Self::new(vec![poly])
    }

    pub fn to_polygons(&self) -> Polygons {
        self.polygons.clone()
    }

    pub fn translate(&self, v: Vec2) -> Self {
        Self::new(
            self.polygons
                .iter()
                .map(|poly| poly.iter().map(|p| *p + v).collect())
                .collect(),
        )
    }

    pub fn area(&self) -> f64 {
        self.polygons.iter().map(|p| signed_area(p)).sum()
    }

    pub fn bounds(&self) -> Rect {
        let mut rect = Rect::new();
        for poly in &self.polygons {
            for &p in poly {
                rect.union_point(p);
            }
        }
        rect
    }

    pub fn union(&self, other: &Self) -> Self {
        self.try_union(other).expect("CrossSection union failed")
    }

    /// Union two sections while preserving conversion and clipping failures.
    pub fn try_union(&self, other: &Self) -> Result<Self, CrossSectionError> {
        Ok(Self::new(boolean_paths(
            &self.polygons,
            &other.polygons,
            BooleanOperation::Union,
            FillRule::Positive,
            PRECISION,
        )?))
    }

    pub fn intersection(&self, other: &Self) -> Self {
        self.try_intersection(other)
            .expect("CrossSection intersection failed")
    }

    /// Intersect two sections while preserving conversion and clipping failures.
    pub fn try_intersection(&self, other: &Self) -> Result<Self, CrossSectionError> {
        Ok(Self::new(boolean_paths(
            &self.polygons,
            &other.polygons,
            BooleanOperation::Intersection,
            FillRule::Positive,
            PRECISION,
        )?))
    }

    pub fn difference(&self, other: &Self) -> Self {
        self.try_difference(other)
            .expect("CrossSection difference failed")
    }

    /// Subtract a section while preserving conversion and clipping failures.
    pub fn try_difference(&self, other: &Self) -> Result<Self, CrossSectionError> {
        Ok(Self::new(boolean_paths(
            &self.polygons,
            &other.polygons,
            BooleanOperation::Difference,
            FillRule::Positive,
            PRECISION,
        )?))
    }

    pub fn scale(&self, v: Vec2) -> Self {
        Self::new(
            self.polygons
                .iter()
                .map(|poly| {
                    poly.iter()
                        .map(|p| Vec2::new(p.x * v.x, p.y * v.y))
                        .collect()
                })
                .collect(),
        )
    }

    pub fn rotate(&self, degrees: f64) -> Self {
        let rad = degrees.to_radians();
        let c = math::cos(rad);
        let s = math::sin(rad);
        Self::new(
            self.polygons
                .iter()
                .map(|poly| {
                    poly.iter()
                        .map(|p| Vec2::new(p.x * c - p.y * s, p.x * s + p.y * c))
                        .collect()
                })
                .collect(),
        )
    }

    /// Mirror through a line perpendicular to the given axis vector.
    /// Matches C++ `CrossSection::Mirror(ax)` which uses `I - 2*n*n^T`.
    pub fn mirror(&self, axis: Vec2) -> Self {
        let len_sq = axis.x * axis.x + axis.y * axis.y;
        if len_sq < 1e-20 {
            return Self::default();
        }
        // Reflection matrix: R = I - 2*n*n^T where n = normalize(axis)
        let nx = axis.x / len_sq.sqrt();
        let ny = axis.y / len_sq.sqrt();
        let r00 = 1.0 - 2.0 * nx * nx;
        let r01 = -2.0 * nx * ny;
        let r10 = -2.0 * nx * ny;
        let r11 = 1.0 - 2.0 * ny * ny;
        Self::new(
            self.polygons
                .iter()
                .map(|poly| {
                    // Mirror reverses winding, so reverse the polygon
                    poly.iter()
                        .rev()
                        .map(|p| Vec2::new(r00 * p.x + r01 * p.y, r10 * p.x + r11 * p.y))
                        .collect()
                })
                .collect(),
        )
    }

    pub fn is_empty(&self) -> bool {
        self.polygons.is_empty() || self.polygons.iter().all(|p| p.len() < 3)
    }

    pub fn num_vert(&self) -> usize {
        self.polygons.iter().map(|p| p.len()).sum()
    }

    pub fn num_contour(&self) -> usize {
        self.polygons.iter().filter(|p| p.len() >= 3).count()
    }

    /// Decompose into connected components. Each component maintains its
    /// contours (outer boundary + holes).
    pub fn decompose(&self) -> Vec<Self> {
        self.try_decompose()
            .expect("CrossSection decomposition failed")
    }

    /// Decompose into connected components while preserving Clipper failures.
    pub fn try_decompose(&self) -> Result<Vec<Self>, CrossSectionError> {
        // Let Clipper's polygon tree own exact containment, including nested
        // islands. A containing bounding box does not establish hole membership.
        let paths = to_paths(&self.polygons);
        validate_paths(&paths)?;
        let mut clipper = ClipperD::new(PRECISION);
        clipper.add_subject(&paths);
        if clipper.error_code() != 0 {
            return Err(CrossSectionError::CoordinateOutOfRange);
        }
        let mut tree = PolyTreeD::new();
        if !clipper.execute_tree(
            ClipType::Union,
            FillRule::Positive,
            &mut tree,
            &mut PathsD::new(),
        ) || clipper.error_code() != 0
        {
            return Err(CrossSectionError::ClipperFailure);
        }
        let mut pending = tree.nodes[0].children().to_vec();
        let mut components = Vec::new();
        while let Some(outer) = pending.pop() {
            let mut paths = vec![tree.nodes[outer].polygon().clone()];
            for &hole in tree.nodes[outer].children() {
                paths.push(tree.nodes[hole].polygon().clone());
                pending.extend_from_slice(tree.nodes[hole].children());
            }
            components.push(Self::new(from_paths(&paths)));
        }
        Ok(components)
    }

    /// Simplify contours by removing near-collinear vertices.
    /// Mirrors C++ CrossSection::Simplify(epsilon=1e-6): normalizes via union,
    /// filters tiny polygons, then applies SimplifyPaths with epsilon.
    pub fn simplify(&self, epsilon: f64) -> Self {
        if self.polygons.is_empty() {
            return Self::default();
        }
        // Normalize via union (removes overlaps/inversions).
        let paths = to_paths(&self.polygons);
        let unified = union_d(&paths, &PathsD::new(), FillRule::Positive, 6);
        // Filter out contours smaller than epsilon (area vs bounding box).
        let filtered: PathsD = unified
            .into_iter()
            .filter(|poly| {
                let a = area(poly).abs();
                // Compute bounding box max extent
                let (mut min_x, mut min_y) = (f64::MAX, f64::MAX);
                let (mut max_x, mut max_y) = (f64::MIN, f64::MIN);
                for p in poly {
                    if p.x < min_x {
                        min_x = p.x;
                    }
                    if p.x > max_x {
                        max_x = p.x;
                    }
                    if p.y < min_y {
                        min_y = p.y;
                    }
                    if p.y > max_y {
                        max_y = p.y;
                    }
                }
                let max_size = (max_x - min_x).max(max_y - min_y);
                a > max_size * epsilon
            })
            .collect();
        let simplified = simplify_paths(&filtered, epsilon, true);
        Self::new(from_paths(&simplified))
    }

    pub fn offset(&self, delta: f64) -> Self {
        Self::new(from_paths(&inflate_paths_d(
            &to_paths(&self.polygons),
            delta,
            JoinType::Round,
            EndType::Polygon,
            2.0,
            6,
            0.0,
        )))
    }

    /// Offset with explicit join type and segment count.
    /// join_type: 0=Square, 1=Round, 2=Miter
    pub fn offset_with_params(
        &self,
        delta: f64,
        join_type: i32,
        miter_limit: f64,
        circular_segments: i32,
    ) -> Self {
        let jt = match join_type {
            0 => JoinType::Square,
            2 => JoinType::Miter,
            3 => JoinType::Bevel,
            _ => JoinType::Round,
        };
        // For round joins, compute arc_tolerance from circular_segments to get the
        // exact segment count. Matches C++ CrossSection::Offset:
        //   arc_tol = (cos(π/n) - 1) * -|delta|
        let arc_tol = if jt == JoinType::Round && circular_segments > 2 {
            let n = circular_segments as f64;
            let abs_delta = delta.abs();
            ((std::f64::consts::PI / n).cos() - 1.0) * -abs_delta
        } else {
            0.0
        };
        Self::new(from_paths(&inflate_paths_d(
            &to_paths(&self.polygons),
            delta,
            jt,
            EndType::Polygon,
            miter_limit,
            6,
            arc_tol,
        )))
    }

    pub fn minkowski_sum(&self, other: &Self) -> Self {
        let mut result = Vec::new();
        for a in to_paths(&self.polygons) {
            for b in to_paths(&other.polygons) {
                result.extend(minkowski_sum_d(&a, &b, true, 6));
            }
        }
        Self::new(from_paths(&result))
    }

    /// Create CrossSection from a simple polygon with a specified fill rule.
    /// fill_rule: 0=EvenOdd, 1=NonZero, 2=Positive, 3=Negative
    pub fn from_polygon_with_fill_rule(polygon: Vec<Vec2>, fill_rule: i32) -> Self {
        let fr = match fill_rule {
            0 => FillRule::EvenOdd,
            1 => FillRule::NonZero,
            2 => FillRule::Positive,
            3 => FillRule::Negative,
            _ => FillRule::Positive,
        };
        let path: PathD = polygon.iter().map(|v| Point::new(v.x, v.y)).collect();
        let paths = PathsD::from(vec![path]);
        let empty = PathsD::new();
        let result = union_d(&paths, &empty, fr, 6);
        Self {
            polygons: from_paths(&result),
        }
    }

    /// Apply a function to every vertex in-place.
    pub fn warp<F: FnMut(&mut Vec2)>(&self, mut f: F) -> Self {
        let polys = self
            .polygons
            .iter()
            .map(|poly| {
                poly.iter()
                    .map(|&v| {
                        let mut v2 = v;
                        f(&mut v2);
                        v2
                    })
                    .collect()
            })
            .collect();
        Self { polygons: polys }
    }

    /// Batch boolean operation on a slice of CrossSections.
    /// OpType::Add = union, Subtract = difference, Intersect = intersection.
    pub fn batch_boolean(sections: &[Self], op: OpType) -> Self {
        if sections.is_empty() {
            return Self::default();
        }
        match op {
            OpType::Add => {
                let mut paths = PathsD::new();
                for s in sections {
                    for p in to_paths(&s.polygons) {
                        paths.push(p);
                    }
                }
                let empty = PathsD::new();
                Self {
                    polygons: from_paths(&union_d(&paths, &empty, FillRule::NonZero, 6)),
                }
            }
            OpType::Subtract => {
                let mut result = sections[0].clone();
                for s in &sections[1..] {
                    result = result.difference(s);
                }
                result
            }
            OpType::Intersect => {
                let mut result = sections[0].clone();
                for s in &sections[1..] {
                    result = result.intersection(s);
                }
                result
            }
        }
    }

    /// Compute convex hull of all vertices in a slice of CrossSections.
    pub fn hull_cross_sections(sections: &[Self]) -> Self {
        let points: Vec<Vec2> = sections
            .iter()
            .flat_map(|s| s.polygons.iter().flat_map(|p| p.iter().cloned()))
            .collect();
        Self::hull_points(&points)
    }

    /// Compute convex hull of a set of 2D points (Andrew's monotone chain).
    pub fn hull_points(points: &[Vec2]) -> Self {
        if points.len() < 3 {
            return Self::default();
        }
        let mut pts: Vec<Vec2> = points.to_vec();
        pts.sort_by(|a, b| {
            a.x.partial_cmp(&b.x)
                .unwrap()
                .then(a.y.partial_cmp(&b.y).unwrap())
        });
        pts.dedup_by(|a, b| (a.x - b.x).abs() < 1e-10 && (a.y - b.y).abs() < 1e-10);

        let cross = |o: Vec2, a: Vec2, b: Vec2| -> f64 {
            (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
        };

        let n = pts.len();
        if n < 3 {
            return Self::default();
        }
        let mut hull: Vec<Vec2> = Vec::with_capacity(2 * n);
        // Lower hull
        for &p in &pts {
            while hull.len() >= 2 && cross(hull[hull.len() - 2], hull[hull.len() - 1], p) <= 0.0 {
                hull.pop();
            }
            hull.push(p);
        }
        // Upper hull
        let lower_len = hull.len();
        for &p in pts.iter().rev() {
            while hull.len() > lower_len
                && cross(hull[hull.len() - 2], hull[hull.len() - 1], p) <= 0.0
            {
                hull.pop();
            }
            hull.push(p);
        }
        hull.pop(); // last point == first
        if hull.len() < 3 {
            return Self::default();
        }
        Self::new(vec![hull])
    }

    /// Compose (merge) multiple CrossSections by combining all their contours.
    /// Matches C++ CrossSection::Compose(vector<CrossSection>) which unions all polygons.
    pub fn compose(sections: &[Self]) -> Self {
        let all: Vec<Vec<Vec2>> = sections
            .iter()
            .flat_map(|s| s.polygons.iter().cloned())
            .collect();
        if all.is_empty() {
            return Self::default();
        }
        Self::from_polygons_fill(all)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cross_section_area_bounds() {
        let cs = CrossSection::square(2.0);
        assert!((cs.area() - 4.0).abs() < 1e-10);
        let b = cs.bounds();
        assert!((b.max.x - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_cross_section_boolean() {
        let a = CrossSection::square(2.0);
        let b = CrossSection::square(2.0).translate(Vec2::new(1.0, 0.0));
        assert!(a.intersection(&b).area() > 0.9);
        assert!(a.union(&b).area() > a.area());
        assert!(a.difference(&b).area() < a.area());
    }

    #[test]
    fn test_cross_section_boolean_uses_pinned_precision() {
        let rectangle = |min_x: f64, max_x: f64| {
            CrossSection::new(vec![vec![
                Vec2::new(min_x, 0.0),
                Vec2::new(max_x, 0.0),
                Vec2::new(max_x, 1.0),
                Vec2::new(min_x, 1.0),
            ]])
        };
        let left = CrossSection::from_polygons_with_fill_rule(
            rectangle(0.0, 2.0).to_polygons(),
            FillRule::Positive,
        );
        let right = CrossSection::from_polygons_with_fill_rule(
            rectangle(2.0 - 9e-7, 3.0).to_polygons(),
            FillRule::Positive,
        );
        let intersection = left.intersection(&right);
        let lower = 1.9999990984797478;
        assert_eq!(
            intersection.to_polygons(),
            vec![vec![
                Vec2::new(2.0, 1.0),
                Vec2::new(lower, 1.0),
                Vec2::new(lower, 0.0),
                Vec2::new(2.0, 0.0),
            ]]
        );
        assert_eq!(intersection.area(), 9.015202522277832e-7);
        let decomposed = intersection.decompose();
        assert_eq!(
            decomposed[0].to_polygons(),
            vec![vec![
                Vec2::new(2.0, 1.0),
                Vec2::new(lower, 1.0),
                Vec2::new(lower, 0.0),
                Vec2::new(2.0, 0.0),
            ]]
        );

        assert_eq!(right.bounds().min.x, lower);
    }

    #[test]
    fn test_cross_section_offset() {
        let a = CrossSection::square(1.0);
        let b = a.offset(0.25);
        assert!(b.area() > a.area());
    }

    /// C++ TEST(CrossSection, Square) — cube from extrusion matches cube
    #[test]
    fn test_cpp_cross_section_square() {
        let cs = CrossSection::square(5.0);
        let a = crate::manifold::Manifold::cube(crate::linalg::Vec3::new(5.0, 5.0, 5.0), false);
        let b = crate::manifold::Manifold::extrude(
            &cs.to_polygons(),
            5.0,
            0,
            0.0,
            crate::linalg::Vec2::new(1.0, 1.0),
        );
        let diff = a.difference(&b);
        assert!(
            diff.volume().abs() < 1e-6,
            "CrossSection square extrusion should match cube, diff volume: {}",
            diff.volume()
        );
    }

    /// C++ TEST(CrossSection, Empty) — empty cross section from empty polygons
    #[test]
    fn test_cpp_cross_section_empty() {
        let polys: crate::types::Polygons = vec![vec![], vec![]];
        let cs = CrossSection::new(polys);
        assert!(
            cs.area().abs() < 1e-10,
            "CrossSection from empty polygons should have zero area"
        );
    }
}
