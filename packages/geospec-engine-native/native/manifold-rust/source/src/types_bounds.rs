// types_bounds.rs — axis-aligned bounding volumes: Box (3D) and Rect (2D).
//
// Ported from include/manifold/common.h. Extracted from types.rs, which
// re-exports both types so external paths (`crate::types::Box`,
// `crate::types::Rect`) are unchanged. The collider (collider.rs) and the
// broadphase queries in boolean3.rs are the main consumers of Box; Rect
// backs the 2D cross-section pipeline (cross_section.rs, tree2d.rs).

use crate::linalg::{Vec2, Vec3, Mat3x4};

// ---------------------------------------------------------------------------
// Box (3D axis-aligned bounding box)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Box {
    pub min: Vec3,
    pub max: Vec3,
}

impl Default for Box {
    fn default() -> Self {
        Box {
            min: Vec3::splat(f64::INFINITY),
            max: Vec3::splat(f64::NEG_INFINITY),
        }
    }
}

impl Box {
    /// Default is an infinite box containing all space.
    pub fn new() -> Self {
        Self::default()
    }

    /// Box containing the two given points.
    pub fn from_points(p1: Vec3, p2: Vec3) -> Self {
        Box {
            min: Vec3::new(p1.x.min(p2.x), p1.y.min(p2.y), p1.z.min(p2.z)),
            max: Vec3::new(p1.x.max(p2.x), p1.y.max(p2.y), p1.z.max(p2.z)),
        }
    }

    /// A box containing a single point.
    pub fn from_point(p: Vec3) -> Self {
        Box { min: p, max: p }
    }

    /// True when the box has no volume (min > max on any axis).
    pub fn is_empty(&self) -> bool {
        self.min.x > self.max.x || self.min.y > self.max.y || self.min.z > self.max.z
    }

    pub fn size(&self) -> Vec3 {
        self.max - self.min
    }

    pub fn center(&self) -> Vec3 {
        (self.max + self.min) * 0.5
    }

    /// Absolute-largest coordinate value.
    pub fn scale(&self) -> f64 {
        let abs_min = Vec3::new(self.min.x.abs(), self.min.y.abs(), self.min.z.abs());
        let abs_max = Vec3::new(self.max.x.abs(), self.max.y.abs(), self.max.z.abs());
        let m = Vec3::new(
            abs_min.x.max(abs_max.x),
            abs_min.y.max(abs_max.y),
            abs_min.z.max(abs_max.z),
        );
        m.x.max(m.y).max(m.z)
    }

    pub fn contains_point(&self, p: Vec3) -> bool {
        p.x >= self.min.x && p.x <= self.max.x
            && p.y >= self.min.y && p.y <= self.max.y
            && p.z >= self.min.z && p.z <= self.max.z
    }

    pub fn contains_box(&self, other: &Box) -> bool {
        other.min.x >= self.min.x && other.max.x <= self.max.x
            && other.min.y >= self.min.y && other.max.y <= self.max.y
            && other.min.z >= self.min.z && other.max.z <= self.max.z
    }

    /// Expand in-place to include the given point.
    pub fn union_point(&mut self, p: Vec3) {
        self.min.x = self.min.x.min(p.x);
        self.min.y = self.min.y.min(p.y);
        self.min.z = self.min.z.min(p.z);
        self.max.x = self.max.x.max(p.x);
        self.max.y = self.max.y.max(p.y);
        self.max.z = self.max.z.max(p.z);
    }

    /// Return the union of this box with another.
    pub fn union_box(&self, other: &Box) -> Box {
        Box {
            min: Vec3::new(
                self.min.x.min(other.min.x),
                self.min.y.min(other.min.y),
                self.min.z.min(other.min.z),
            ),
            max: Vec3::new(
                self.max.x.max(other.max.x),
                self.max.y.max(other.max.y),
                self.max.z.max(other.max.z),
            ),
        }
    }

    /// Transform by axis-aligned affine transform (Mat3x4 * vec4(pt, 1)).
    pub fn transform(&self, t: &Mat3x4) -> Box {
        use crate::linalg::Vec4 as V4;
        let min_t = *t * V4::new(self.min.x, self.min.y, self.min.z, 1.0);
        let max_t = *t * V4::new(self.max.x, self.max.y, self.max.z, 1.0);
        Box {
            min: Vec3::new(min_t.x.min(max_t.x), min_t.y.min(max_t.y), min_t.z.min(max_t.z)),
            max: Vec3::new(min_t.x.max(max_t.x), min_t.y.max(max_t.y), min_t.z.max(max_t.z)),
        }
    }

    pub fn does_overlap_box(&self, other: &Box) -> bool {
        self.min.x <= other.max.x && self.min.y <= other.max.y && self.min.z <= other.max.z
            && self.max.x >= other.min.x && self.max.y >= other.min.y && self.max.z >= other.min.z
    }

    /// Does the given point project within the XY extent (including equality)?
    pub fn does_overlap_point_xy(&self, p: Vec3) -> bool {
        p.x >= self.min.x && p.x <= self.max.x && p.y >= self.min.y && p.y <= self.max.y
    }

    pub fn is_finite(&self) -> bool {
        self.min.x.is_finite() && self.min.y.is_finite() && self.min.z.is_finite()
            && self.max.x.is_finite() && self.max.y.is_finite() && self.max.z.is_finite()
    }
}

impl std::ops::Add<Vec3> for Box {
    type Output = Box;
    fn add(self, shift: Vec3) -> Box {
        Box { min: self.min + shift, max: self.max + shift }
    }
}
impl std::ops::AddAssign<Vec3> for Box {
    fn add_assign(&mut self, shift: Vec3) {
        self.min = self.min + shift;
        self.max = self.max + shift;
    }
}
impl std::ops::Mul<Vec3> for Box {
    type Output = Box;
    fn mul(self, scale: Vec3) -> Box {
        Box { min: self.min * scale, max: self.max * scale }
    }
}
impl std::ops::MulAssign<Vec3> for Box {
    fn mul_assign(&mut self, scale: Vec3) {
        self.min = self.min * scale;
        self.max = self.max * scale;
    }
}

// ---------------------------------------------------------------------------
// Rect (2D axis-aligned bounding box)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub min: Vec2,
    pub max: Vec2,
}

impl Default for Rect {
    fn default() -> Self {
        Rect {
            min: Vec2::splat(f64::INFINITY),
            max: Vec2::splat(f64::NEG_INFINITY),
        }
    }
}

impl Rect {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_points(a: Vec2, b: Vec2) -> Self {
        Rect {
            min: Vec2::new(a.x.min(b.x), a.y.min(b.y)),
            max: Vec2::new(a.x.max(b.x), a.y.max(b.y)),
        }
    }

    pub fn size(&self) -> Vec2 {
        self.max - self.min
    }

    pub fn area(&self) -> f64 {
        let sz = self.size();
        sz.x * sz.y
    }

    pub fn scale(&self) -> f64 {
        let abs_min = Vec2::new(self.min.x.abs(), self.min.y.abs());
        let abs_max = Vec2::new(self.max.x.abs(), self.max.y.abs());
        let m = Vec2::new(abs_min.x.max(abs_max.x), abs_min.y.max(abs_max.y));
        m.x.max(m.y)
    }

    pub fn center(&self) -> Vec2 {
        (self.max + self.min) * 0.5
    }

    pub fn contains_point(&self, p: Vec2) -> bool {
        p.x >= self.min.x && p.x <= self.max.x && p.y >= self.min.y && p.y <= self.max.y
    }

    pub fn contains_rect(&self, other: &Rect) -> bool {
        other.min.x >= self.min.x && other.max.x <= self.max.x
            && other.min.y >= self.min.y && other.max.y <= self.max.y
    }

    pub fn does_overlap(&self, other: &Rect) -> bool {
        self.min.x <= other.max.x && self.min.y <= other.max.y
            && self.max.x >= other.min.x && self.max.y >= other.min.y
    }

    pub fn is_empty(&self) -> bool {
        self.max.y <= self.min.y || self.max.x <= self.min.x
    }

    pub fn is_finite(&self) -> bool {
        self.min.x.is_finite() && self.min.y.is_finite()
            && self.max.x.is_finite() && self.max.y.is_finite()
    }

    pub fn union_point(&mut self, p: Vec2) {
        self.min.x = self.min.x.min(p.x);
        self.min.y = self.min.y.min(p.y);
        self.max.x = self.max.x.max(p.x);
        self.max.y = self.max.y.max(p.y);
    }

    pub fn union_rect(&self, other: &Rect) -> Rect {
        Rect {
            min: Vec2::new(self.min.x.min(other.min.x), self.min.y.min(other.min.y)),
            max: Vec2::new(self.max.x.max(other.max.x), self.max.y.max(other.max.y)),
        }
    }
}

impl std::ops::Add<Vec2> for Rect {
    type Output = Rect;
    fn add(self, shift: Vec2) -> Rect {
        Rect { min: self.min + shift, max: self.max + shift }
    }
}
impl std::ops::AddAssign<Vec2> for Rect {
    fn add_assign(&mut self, shift: Vec2) {
        self.min = self.min + shift;
        self.max = self.max + shift;
    }
}
impl std::ops::Mul<Vec2> for Rect {
    type Output = Rect;
    fn mul(self, scale: Vec2) -> Rect {
        Rect { min: self.min * scale, max: self.max * scale }
    }
}
impl std::ops::MulAssign<Vec2> for Rect {
    fn mul_assign(&mut self, scale: Vec2) {
        self.min = self.min * scale;
        self.max = self.max * scale;
    }
}
