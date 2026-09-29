// linalg.rs — Linear algebra types for manifold-rust
// Ports: include/manifold/linalg.h and the type aliases in include/manifold/common.h
//
// C++ naming:  mat<T, M, N> = M rows, N cols, column-major (N columns of vec<T,M>)
// Rust types use the same naming as the C++ `using` aliases in common.h.
//
// All f64 types match C++ `double`; f32 appears only at the MeshGL boundary.

use std::hash::{Hash, Hasher};
use std::ops::{
    Add, AddAssign, BitAnd, BitOr, Div, DivAssign,
    Index, IndexMut, Mul, MulAssign, Neg, Not,
    Sub, SubAssign,
};

use crate::math;

// ─── Vec2 ────────────────────────────────────────────────────────────────────

/// `la::vec<double, 2>` — 2-component f64 column vector
#[derive(Clone, Copy, Debug, Default, PartialEq)]
#[repr(C)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

impl Vec2 {
    #[inline]
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
    #[inline]
    pub const fn splat(v: f64) -> Self {
        Self { x: v, y: v }
    }
    #[inline]
    pub fn xy(self) -> Vec2 {
        self
    }
}

impl Index<usize> for Vec2 {
    type Output = f64;
    fn index(&self, i: usize) -> &f64 {
        match i {
            0 => &self.x,
            1 => &self.y,
            _ => panic!("Vec2 index out of range: {i}"),
        }
    }
}
impl IndexMut<usize> for Vec2 {
    fn index_mut(&mut self, i: usize) -> &mut f64 {
        match i {
            0 => &mut self.x,
            1 => &mut self.y,
            _ => panic!("Vec2 index out of range: {i}"),
        }
    }
}

// Lexicographic ordering — matches C++ compare(vec<T,2>, vec<T,2>)
impl PartialOrd for Vec2 {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        if self.x != o.x {
            self.x.partial_cmp(&o.x)
        } else {
            self.y.partial_cmp(&o.y)
        }
    }
}

impl From<[f64; 2]> for Vec2 {
    fn from(a: [f64; 2]) -> Self {
        Self::new(a[0], a[1])
    }
}
impl From<Vec2> for [f64; 2] {
    fn from(v: Vec2) -> [f64; 2] {
        [v.x, v.y]
    }
}
impl From<(f64, f64)> for Vec2 {
    fn from((x, y): (f64, f64)) -> Self {
        Self::new(x, y)
    }
}

macro_rules! impl_vec2_ops {
    () => {
        impl Neg for Vec2 {
            type Output = Vec2;
            fn neg(self) -> Vec2 {
                Vec2::new(-self.x, -self.y)
            }
        }
        impl Add for Vec2 {
            type Output = Vec2;
            fn add(self, b: Vec2) -> Vec2 {
                Vec2::new(self.x + b.x, self.y + b.y)
            }
        }
        impl Sub for Vec2 {
            type Output = Vec2;
            fn sub(self, b: Vec2) -> Vec2 {
                Vec2::new(self.x - b.x, self.y - b.y)
            }
        }
        // vec * vec is element-wise (cmul in C++)
        impl Mul for Vec2 {
            type Output = Vec2;
            fn mul(self, b: Vec2) -> Vec2 {
                Vec2::new(self.x * b.x, self.y * b.y)
            }
        }
        impl Div for Vec2 {
            type Output = Vec2;
            fn div(self, b: Vec2) -> Vec2 {
                Vec2::new(self.x / b.x, self.y / b.y)
            }
        }
        impl Mul<f64> for Vec2 {
            type Output = Vec2;
            fn mul(self, s: f64) -> Vec2 {
                Vec2::new(self.x * s, self.y * s)
            }
        }
        impl Mul<Vec2> for f64 {
            type Output = Vec2;
            fn mul(self, v: Vec2) -> Vec2 {
                Vec2::new(self * v.x, self * v.y)
            }
        }
        impl Div<f64> for Vec2 {
            type Output = Vec2;
            fn div(self, s: f64) -> Vec2 {
                Vec2::new(self.x / s, self.y / s)
            }
        }
        impl Add<f64> for Vec2 {
            type Output = Vec2;
            fn add(self, s: f64) -> Vec2 {
                Vec2::new(self.x + s, self.y + s)
            }
        }
        impl Sub<f64> for Vec2 {
            type Output = Vec2;
            fn sub(self, s: f64) -> Vec2 {
                Vec2::new(self.x - s, self.y - s)
            }
        }
        impl AddAssign for Vec2 {
            fn add_assign(&mut self, b: Vec2) {
                *self = *self + b;
            }
        }
        impl SubAssign for Vec2 {
            fn sub_assign(&mut self, b: Vec2) {
                *self = *self - b;
            }
        }
        impl MulAssign for Vec2 {
            fn mul_assign(&mut self, b: Vec2) {
                *self = *self * b;
            }
        }
        impl MulAssign<f64> for Vec2 {
            fn mul_assign(&mut self, s: f64) {
                *self = *self * s;
            }
        }
        impl DivAssign for Vec2 {
            fn div_assign(&mut self, b: Vec2) {
                *self = *self / b;
            }
        }
        impl DivAssign<f64> for Vec2 {
            fn div_assign(&mut self, s: f64) {
                *self = *self / s;
            }
        }
    };
}
impl_vec2_ops!();

// ─── Vec3 ────────────────────────────────────────────────────────────────────

/// `la::vec<double, 3>`
#[derive(Clone, Copy, Debug, Default, PartialEq)]
#[repr(C)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    #[inline]
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }
    #[inline]
    pub const fn splat(v: f64) -> Self {
        Self { x: v, y: v, z: v }
    }
    #[inline]
    pub fn xy(self) -> Vec2 {
        Vec2::new(self.x, self.y)
    }
    #[inline]
    pub fn yz(self) -> Vec2 {
        Vec2::new(self.y, self.z)
    }
}

impl Index<usize> for Vec3 {
    type Output = f64;
    fn index(&self, i: usize) -> &f64 {
        match i {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            _ => panic!("Vec3 index out of range: {i}"),
        }
    }
}
impl IndexMut<usize> for Vec3 {
    fn index_mut(&mut self, i: usize) -> &mut f64 {
        match i {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            _ => panic!("Vec3 index out of range: {i}"),
        }
    }
}

impl PartialOrd for Vec3 {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        if self.x != o.x {
            self.x.partial_cmp(&o.x)
        } else if self.y != o.y {
            self.y.partial_cmp(&o.y)
        } else {
            self.z.partial_cmp(&o.z)
        }
    }
}

impl From<[f64; 3]> for Vec3 {
    fn from(a: [f64; 3]) -> Self {
        Self::new(a[0], a[1], a[2])
    }
}
impl From<Vec3> for [f64; 3] {
    fn from(v: Vec3) -> [f64; 3] {
        [v.x, v.y, v.z]
    }
}
impl From<(f64, f64, f64)> for Vec3 {
    fn from((x, y, z): (f64, f64, f64)) -> Self {
        Self::new(x, y, z)
    }
}
impl From<(Vec2, f64)> for Vec3 {
    fn from((xy, z): (Vec2, f64)) -> Self {
        Self::new(xy.x, xy.y, z)
    }
}

macro_rules! impl_vec3_ops {
    () => {
        impl Neg for Vec3 {
            type Output = Vec3;
            fn neg(self) -> Vec3 {
                Vec3::new(-self.x, -self.y, -self.z)
            }
        }
        impl Add for Vec3 {
            type Output = Vec3;
            fn add(self, b: Vec3) -> Vec3 {
                Vec3::new(self.x + b.x, self.y + b.y, self.z + b.z)
            }
        }
        impl Sub for Vec3 {
            type Output = Vec3;
            fn sub(self, b: Vec3) -> Vec3 {
                Vec3::new(self.x - b.x, self.y - b.y, self.z - b.z)
            }
        }
        impl Mul for Vec3 {
            type Output = Vec3;
            fn mul(self, b: Vec3) -> Vec3 {
                Vec3::new(self.x * b.x, self.y * b.y, self.z * b.z)
            }
        }
        impl Div for Vec3 {
            type Output = Vec3;
            fn div(self, b: Vec3) -> Vec3 {
                Vec3::new(self.x / b.x, self.y / b.y, self.z / b.z)
            }
        }
        impl Mul<f64> for Vec3 {
            type Output = Vec3;
            fn mul(self, s: f64) -> Vec3 {
                Vec3::new(self.x * s, self.y * s, self.z * s)
            }
        }
        impl Mul<Vec3> for f64 {
            type Output = Vec3;
            fn mul(self, v: Vec3) -> Vec3 {
                Vec3::new(self * v.x, self * v.y, self * v.z)
            }
        }
        impl Div<f64> for Vec3 {
            type Output = Vec3;
            fn div(self, s: f64) -> Vec3 {
                Vec3::new(self.x / s, self.y / s, self.z / s)
            }
        }
        impl Add<f64> for Vec3 {
            type Output = Vec3;
            fn add(self, s: f64) -> Vec3 {
                Vec3::new(self.x + s, self.y + s, self.z + s)
            }
        }
        impl Sub<f64> for Vec3 {
            type Output = Vec3;
            fn sub(self, s: f64) -> Vec3 {
                Vec3::new(self.x - s, self.y - s, self.z - s)
            }
        }
        impl AddAssign for Vec3 {
            fn add_assign(&mut self, b: Vec3) {
                *self = *self + b;
            }
        }
        impl SubAssign for Vec3 {
            fn sub_assign(&mut self, b: Vec3) {
                *self = *self - b;
            }
        }
        impl MulAssign for Vec3 {
            fn mul_assign(&mut self, b: Vec3) {
                *self = *self * b;
            }
        }
        impl MulAssign<f64> for Vec3 {
            fn mul_assign(&mut self, s: f64) {
                *self = *self * s;
            }
        }
        impl DivAssign for Vec3 {
            fn div_assign(&mut self, b: Vec3) {
                *self = *self / b;
            }
        }
        impl DivAssign<f64> for Vec3 {
            fn div_assign(&mut self, s: f64) {
                *self = *self / s;
            }
        }
    };
}
impl_vec3_ops!();

// ─── Vec4 ────────────────────────────────────────────────────────────────────

/// `la::vec<double, 4>` / `quat`
#[derive(Clone, Copy, Debug, Default, PartialEq)]
#[repr(C)]
pub struct Vec4 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

impl Vec4 {
    #[inline]
    pub const fn new(x: f64, y: f64, z: f64, w: f64) -> Self {
        Self { x, y, z, w }
    }
    #[inline]
    pub const fn splat(v: f64) -> Self {
        Self {
            x: v,
            y: v,
            z: v,
            w: v,
        }
    }
    #[inline]
    pub fn xy(self) -> Vec2 {
        Vec2::new(self.x, self.y)
    }
    #[inline]
    pub fn xyz(self) -> Vec3 {
        Vec3::new(self.x, self.y, self.z)
    }
}

impl Index<usize> for Vec4 {
    type Output = f64;
    fn index(&self, i: usize) -> &f64 {
        match i {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            3 => &self.w,
            _ => panic!("Vec4 index out of range: {i}"),
        }
    }
}
impl IndexMut<usize> for Vec4 {
    fn index_mut(&mut self, i: usize) -> &mut f64 {
        match i {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            3 => &mut self.w,
            _ => panic!("Vec4 index out of range: {i}"),
        }
    }
}

impl PartialOrd for Vec4 {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        if self.x != o.x {
            self.x.partial_cmp(&o.x)
        } else if self.y != o.y {
            self.y.partial_cmp(&o.y)
        } else if self.z != o.z {
            self.z.partial_cmp(&o.z)
        } else {
            self.w.partial_cmp(&o.w)
        }
    }
}

impl From<[f64; 4]> for Vec4 {
    fn from(a: [f64; 4]) -> Self {
        Self::new(a[0], a[1], a[2], a[3])
    }
}
impl From<Vec4> for [f64; 4] {
    fn from(v: Vec4) -> [f64; 4] {
        [v.x, v.y, v.z, v.w]
    }
}
impl From<(Vec3, f64)> for Vec4 {
    fn from((xyz, w): (Vec3, f64)) -> Self {
        Self::new(xyz.x, xyz.y, xyz.z, w)
    }
}
impl From<(Vec2, f64, f64)> for Vec4 {
    fn from((xy, z, w): (Vec2, f64, f64)) -> Self {
        Self::new(xy.x, xy.y, z, w)
    }
}

macro_rules! impl_vec4_ops {
    () => {
        impl Neg for Vec4 {
            type Output = Vec4;
            fn neg(self) -> Vec4 {
                Vec4::new(-self.x, -self.y, -self.z, -self.w)
            }
        }
        impl Add for Vec4 {
            type Output = Vec4;
            fn add(self, b: Vec4) -> Vec4 {
                Vec4::new(self.x + b.x, self.y + b.y, self.z + b.z, self.w + b.w)
            }
        }
        impl Sub for Vec4 {
            type Output = Vec4;
            fn sub(self, b: Vec4) -> Vec4 {
                Vec4::new(self.x - b.x, self.y - b.y, self.z - b.z, self.w - b.w)
            }
        }
        impl Mul for Vec4 {
            type Output = Vec4;
            fn mul(self, b: Vec4) -> Vec4 {
                Vec4::new(self.x * b.x, self.y * b.y, self.z * b.z, self.w * b.w)
            }
        }
        impl Div for Vec4 {
            type Output = Vec4;
            fn div(self, b: Vec4) -> Vec4 {
                Vec4::new(self.x / b.x, self.y / b.y, self.z / b.z, self.w / b.w)
            }
        }
        impl Mul<f64> for Vec4 {
            type Output = Vec4;
            fn mul(self, s: f64) -> Vec4 {
                Vec4::new(self.x * s, self.y * s, self.z * s, self.w * s)
            }
        }
        impl Mul<Vec4> for f64 {
            type Output = Vec4;
            fn mul(self, v: Vec4) -> Vec4 {
                Vec4::new(self * v.x, self * v.y, self * v.z, self * v.w)
            }
        }
        impl Div<f64> for Vec4 {
            type Output = Vec4;
            fn div(self, s: f64) -> Vec4 {
                Vec4::new(self.x / s, self.y / s, self.z / s, self.w / s)
            }
        }
        impl Add<f64> for Vec4 {
            type Output = Vec4;
            fn add(self, s: f64) -> Vec4 {
                Vec4::new(self.x + s, self.y + s, self.z + s, self.w + s)
            }
        }
        impl Sub<f64> for Vec4 {
            type Output = Vec4;
            fn sub(self, s: f64) -> Vec4 {
                Vec4::new(self.x - s, self.y - s, self.z - s, self.w - s)
            }
        }
        impl AddAssign for Vec4 {
            fn add_assign(&mut self, b: Vec4) {
                *self = *self + b;
            }
        }
        impl SubAssign for Vec4 {
            fn sub_assign(&mut self, b: Vec4) {
                *self = *self - b;
            }
        }
        impl MulAssign for Vec4 {
            fn mul_assign(&mut self, b: Vec4) {
                *self = *self * b;
            }
        }
        impl MulAssign<f64> for Vec4 {
            fn mul_assign(&mut self, s: f64) {
                *self = *self * s;
            }
        }
        impl DivAssign for Vec4 {
            fn div_assign(&mut self, b: Vec4) {
                *self = *self / b;
            }
        }
        impl DivAssign<f64> for Vec4 {
            fn div_assign(&mut self, s: f64) {
                *self = *self / s;
            }
        }
    };
}
impl_vec4_ops!();

/// Quaternion — same bits as Vec4, used where the value represents xi+yj+zk+w
pub type Quat = Vec4;

// ─── IVec2 / IVec3 / IVec4 ───────────────────────────────────────────────────

/// `la::vec<int, 2>`
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(C)]
pub struct IVec2 {
    pub x: i32,
    pub y: i32,
}

impl IVec2 {
    #[inline]
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
    #[inline]
    pub const fn splat(v: i32) -> Self {
        Self { x: v, y: v }
    }
}

impl Index<usize> for IVec2 {
    type Output = i32;
    fn index(&self, i: usize) -> &i32 {
        match i {
            0 => &self.x,
            1 => &self.y,
            _ => panic!("IVec2 index out of range: {i}"),
        }
    }
}
impl IndexMut<usize> for IVec2 {
    fn index_mut(&mut self, i: usize) -> &mut i32 {
        match i {
            0 => &mut self.x,
            1 => &mut self.y,
            _ => panic!("IVec2 index out of range: {i}"),
        }
    }
}

impl PartialOrd for IVec2 {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(o))
    }
}
impl Ord for IVec2 {
    fn cmp(&self, o: &Self) -> std::cmp::Ordering {
        self.x.cmp(&o.x).then(self.y.cmp(&o.y))
    }
}

impl Hash for IVec2 {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.x.hash(state);
        self.y.hash(state);
    }
}

impl From<[i32; 2]> for IVec2 {
    fn from(a: [i32; 2]) -> Self {
        Self::new(a[0], a[1])
    }
}

impl Neg for IVec2 {
    type Output = IVec2;
    fn neg(self) -> IVec2 {
        IVec2::new(-self.x, -self.y)
    }
}
impl Add for IVec2 {
    type Output = IVec2;
    fn add(self, b: IVec2) -> IVec2 {
        IVec2::new(self.x + b.x, self.y + b.y)
    }
}
impl Sub for IVec2 {
    type Output = IVec2;
    fn sub(self, b: IVec2) -> IVec2 {
        IVec2::new(self.x - b.x, self.y - b.y)
    }
}
impl Mul for IVec2 {
    type Output = IVec2;
    fn mul(self, b: IVec2) -> IVec2 {
        IVec2::new(self.x * b.x, self.y * b.y)
    }
}
impl Mul<i32> for IVec2 {
    type Output = IVec2;
    fn mul(self, s: i32) -> IVec2 {
        IVec2::new(self.x * s, self.y * s)
    }
}
impl Mul<IVec2> for i32 {
    type Output = IVec2;
    fn mul(self, v: IVec2) -> IVec2 {
        IVec2::new(self * v.x, self * v.y)
    }
}
impl AddAssign for IVec2 {
    fn add_assign(&mut self, b: IVec2) {
        *self = *self + b;
    }
}

/// `la::vec<int, 3>`
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(C)]
pub struct IVec3 {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

impl IVec3 {
    #[inline]
    pub const fn new(x: i32, y: i32, z: i32) -> Self {
        Self { x, y, z }
    }
    #[inline]
    pub const fn splat(v: i32) -> Self {
        Self { x: v, y: v, z: v }
    }
    #[inline]
    pub fn xy(self) -> IVec2 {
        IVec2::new(self.x, self.y)
    }
}

impl Index<usize> for IVec3 {
    type Output = i32;
    fn index(&self, i: usize) -> &i32 {
        match i {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            _ => panic!("IVec3 index out of range: {i}"),
        }
    }
}
impl IndexMut<usize> for IVec3 {
    fn index_mut(&mut self, i: usize) -> &mut i32 {
        match i {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            _ => panic!("IVec3 index out of range: {i}"),
        }
    }
}

impl PartialOrd for IVec3 {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(o))
    }
}
impl Ord for IVec3 {
    fn cmp(&self, o: &Self) -> std::cmp::Ordering {
        self.x.cmp(&o.x).then(self.y.cmp(&o.y)).then(self.z.cmp(&o.z))
    }
}

impl Hash for IVec3 {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.x.hash(state);
        self.y.hash(state);
        self.z.hash(state);
    }
}

impl From<[i32; 3]> for IVec3 {
    fn from(a: [i32; 3]) -> Self {
        Self::new(a[0], a[1], a[2])
    }
}
impl From<IVec3> for [i32; 3] {
    fn from(v: IVec3) -> [i32; 3] {
        [v.x, v.y, v.z]
    }
}

impl Neg for IVec3 {
    type Output = IVec3;
    fn neg(self) -> IVec3 {
        IVec3::new(-self.x, -self.y, -self.z)
    }
}
impl Add for IVec3 {
    type Output = IVec3;
    fn add(self, b: IVec3) -> IVec3 {
        IVec3::new(self.x + b.x, self.y + b.y, self.z + b.z)
    }
}
impl Sub for IVec3 {
    type Output = IVec3;
    fn sub(self, b: IVec3) -> IVec3 {
        IVec3::new(self.x - b.x, self.y - b.y, self.z - b.z)
    }
}
impl Mul for IVec3 {
    type Output = IVec3;
    fn mul(self, b: IVec3) -> IVec3 {
        IVec3::new(self.x * b.x, self.y * b.y, self.z * b.z)
    }
}
impl Mul<i32> for IVec3 {
    type Output = IVec3;
    fn mul(self, s: i32) -> IVec3 {
        IVec3::new(self.x * s, self.y * s, self.z * s)
    }
}
impl AddAssign for IVec3 {
    fn add_assign(&mut self, b: IVec3) {
        *self = *self + b;
    }
}

/// `la::vec<int, 4>`
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(C)]
pub struct IVec4 {
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub w: i32,
}

impl IVec4 {
    #[inline]
    pub const fn new(x: i32, y: i32, z: i32, w: i32) -> Self {
        Self { x, y, z, w }
    }
    #[inline]
    pub const fn splat(v: i32) -> Self {
        Self {
            x: v,
            y: v,
            z: v,
            w: v,
        }
    }
    #[inline]
    pub fn xyz(self) -> IVec3 {
        IVec3::new(self.x, self.y, self.z)
    }
}

impl Index<usize> for IVec4 {
    type Output = i32;
    fn index(&self, i: usize) -> &i32 {
        match i {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            3 => &self.w,
            _ => panic!("IVec4 index out of range: {i}"),
        }
    }
}
impl IndexMut<usize> for IVec4 {
    fn index_mut(&mut self, i: usize) -> &mut i32 {
        match i {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            3 => &mut self.w,
            _ => panic!("IVec4 index out of range: {i}"),
        }
    }
}

impl PartialOrd for IVec4 {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(o))
    }
}
impl Ord for IVec4 {
    fn cmp(&self, o: &Self) -> std::cmp::Ordering {
        self.x
            .cmp(&o.x)
            .then(self.y.cmp(&o.y))
            .then(self.z.cmp(&o.z))
            .then(self.w.cmp(&o.w))
    }
}

impl Hash for IVec4 {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.x.hash(state);
        self.y.hash(state);
        self.z.hash(state);
        self.w.hash(state);
    }
}

impl From<[i32; 4]> for IVec4 {
    fn from(a: [i32; 4]) -> Self {
        Self::new(a[0], a[1], a[2], a[3])
    }
}

impl Neg for IVec4 {
    type Output = IVec4;
    fn neg(self) -> IVec4 {
        IVec4::new(-self.x, -self.y, -self.z, -self.w)
    }
}
impl Add for IVec4 {
    type Output = IVec4;
    fn add(self, b: IVec4) -> IVec4 {
        IVec4::new(self.x + b.x, self.y + b.y, self.z + b.z, self.w + b.w)
    }
}
impl Sub for IVec4 {
    type Output = IVec4;
    fn sub(self, b: IVec4) -> IVec4 {
        IVec4::new(self.x - b.x, self.y - b.y, self.z - b.z, self.w - b.w)
    }
}
impl Mul<i32> for IVec4 {
    type Output = IVec4;
    fn mul(self, s: i32) -> IVec4 {
        IVec4::new(self.x * s, self.y * s, self.z * s, self.w * s)
    }
}

// ─── BVec4 ───────────────────────────────────────────────────────────────────

/// `la::vec<bool, 4>`
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct BVec4 {
    pub x: bool,
    pub y: bool,
    pub z: bool,
    pub w: bool,
}

impl BVec4 {
    #[inline]
    pub const fn new(x: bool, y: bool, z: bool, w: bool) -> Self {
        Self { x, y, z, w }
    }
    #[inline]
    pub const fn splat(v: bool) -> Self {
        Self {
            x: v,
            y: v,
            z: v,
            w: v,
        }
    }
}

impl Index<usize> for BVec4 {
    type Output = bool;
    fn index(&self, i: usize) -> &bool {
        match i {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            3 => &self.w,
            _ => panic!("BVec4 index out of range: {i}"),
        }
    }
}
impl IndexMut<usize> for BVec4 {
    fn index_mut(&mut self, i: usize) -> &mut bool {
        match i {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            3 => &mut self.w,
            _ => panic!("BVec4 index out of range: {i}"),
        }
    }
}

impl Not for BVec4 {
    type Output = BVec4;
    fn not(self) -> BVec4 {
        BVec4::new(!self.x, !self.y, !self.z, !self.w)
    }
}
impl BitAnd for BVec4 {
    type Output = BVec4;
    fn bitand(self, b: BVec4) -> BVec4 {
        BVec4::new(self.x & b.x, self.y & b.y, self.z & b.z, self.w & b.w)
    }
}
impl BitOr for BVec4 {
    type Output = BVec4;
    fn bitor(self, b: BVec4) -> BVec4 {
        BVec4::new(self.x | b.x, self.y | b.y, self.z | b.z, self.w | b.w)
    }
}

// ─── UVec3 ───────────────────────────────────────────────────────────────────

/// u32 index vector — used for triangle index triples in Morton sorting
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(C)]
pub struct UVec3 {
    pub x: u32,
    pub y: u32,
    pub z: u32,
}

impl UVec3 {
    #[inline]
    pub const fn new(x: u32, y: u32, z: u32) -> Self {
        Self { x, y, z }
    }
}

impl Index<usize> for UVec3 {
    type Output = u32;
    fn index(&self, i: usize) -> &u32 {
        match i {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            _ => panic!("UVec3 index out of range: {i}"),
        }
    }
}

// ─── Matrix types ─────────────────────────────────────────────────────────────
// mat<T, M, N>: M rows, N cols, stored as N column vectors each of length M.
// Named following C++ common.h aliases (mat3x4 = 3 rows, 4 cols).

/// `la::mat<double, 2, 2>` — 2×2 matrix stored as 2 columns of Vec2
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Mat2 {
    pub x: Vec2, // column 0
    pub y: Vec2, // column 1
}

impl Mat2 {
    #[inline]
    pub const fn from_cols(x: Vec2, y: Vec2) -> Self {
        Self { x, y }
    }
    /// Identity matrix
    pub fn identity() -> Self {
        Self {
            x: Vec2::new(1.0, 0.0),
            y: Vec2::new(0.0, 1.0),
        }
    }
    pub fn row(&self, i: usize) -> Vec2 {
        Vec2::new(self.x[i], self.y[i])
    }
    pub fn transpose(&self) -> Self {
        Self {
            x: self.row(0),
            y: self.row(1),
        }
    }
    pub fn determinant(&self) -> f64 {
        self.x.x * self.y.y - self.x.y * self.y.x
    }
}

impl Index<usize> for Mat2 {
    type Output = Vec2;
    fn index(&self, j: usize) -> &Vec2 {
        match j {
            0 => &self.x,
            1 => &self.y,
            _ => panic!("Mat2 column index out of range: {j}"),
        }
    }
}
impl IndexMut<usize> for Mat2 {
    fn index_mut(&mut self, j: usize) -> &mut Vec2 {
        match j {
            0 => &mut self.x,
            1 => &mut self.y,
            _ => panic!("Mat2 column index out of range: {j}"),
        }
    }
}

impl Mul<Vec2> for Mat2 {
    type Output = Vec2;
    fn mul(self, b: Vec2) -> Vec2 {
        self.x * b.x + self.y * b.y
    }
}
impl Mul for Mat2 {
    type Output = Mat2;
    fn mul(self, b: Mat2) -> Mat2 {
        Mat2::from_cols(self * b.x, self * b.y)
    }
}
impl Mul<f64> for Mat2 {
    type Output = Mat2;
    fn mul(self, s: f64) -> Mat2 {
        Mat2::from_cols(self.x * s, self.y * s)
    }
}
impl Add for Mat2 {
    type Output = Mat2;
    fn add(self, b: Mat2) -> Mat2 {
        Mat2::from_cols(self.x + b.x, self.y + b.y)
    }
}
impl Sub for Mat2 {
    type Output = Mat2;
    fn sub(self, b: Mat2) -> Mat2 {
        Mat2::from_cols(self.x - b.x, self.y - b.y)
    }
}
impl Neg for Mat2 {
    type Output = Mat2;
    fn neg(self) -> Mat2 {
        Mat2::from_cols(-self.x, -self.y)
    }
}

/// `la::mat<double, 3, 3>` — 3×3 matrix
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Mat3 {
    pub x: Vec3, // column 0
    pub y: Vec3, // column 1
    pub z: Vec3, // column 2
}

impl Mat3 {
    #[inline]
    pub const fn from_cols(x: Vec3, y: Vec3, z: Vec3) -> Self {
        Self { x, y, z }
    }
    pub fn identity() -> Self {
        Self {
            x: Vec3::new(1.0, 0.0, 0.0),
            y: Vec3::new(0.0, 1.0, 0.0),
            z: Vec3::new(0.0, 0.0, 1.0),
        }
    }
    pub fn row(&self, i: usize) -> Vec3 {
        Vec3::new(self.x[i], self.y[i], self.z[i])
    }
    pub fn transpose(&self) -> Self {
        Self {
            x: self.row(0),
            y: self.row(1),
            z: self.row(2),
        }
    }
    /// C++ adjugate(mat<T,3,3>)
    pub fn adjugate(&self) -> Self {
        let a = self;
        Self {
            x: Vec3::new(
                a.y.y * a.z.z - a.z.y * a.y.z,
                a.z.y * a.x.z - a.x.y * a.z.z,
                a.x.y * a.y.z - a.y.y * a.x.z,
            ),
            y: Vec3::new(
                a.y.z * a.z.x - a.z.z * a.y.x,
                a.z.z * a.x.x - a.x.z * a.z.x,
                a.x.z * a.y.x - a.y.z * a.x.x,
            ),
            z: Vec3::new(
                a.y.x * a.z.y - a.z.x * a.y.y,
                a.z.x * a.x.y - a.x.x * a.z.y,
                a.x.x * a.y.y - a.y.x * a.x.y,
            ),
        }
    }
    pub fn determinant(&self) -> f64 {
        let a = self;
        a.x.x * (a.y.y * a.z.z - a.z.y * a.y.z)
            + a.x.y * (a.y.z * a.z.x - a.z.z * a.y.x)
            + a.x.z * (a.y.x * a.z.y - a.z.x * a.y.y)
    }
    pub fn inverse(&self) -> Self {
        self.adjugate() * (1.0 / self.determinant())
    }
    pub fn diagonal(&self) -> Vec3 {
        Vec3::new(self.x.x, self.y.y, self.z.z)
    }
    pub fn trace(&self) -> f64 {
        self.x.x + self.y.y + self.z.z
    }
}

impl Index<usize> for Mat3 {
    type Output = Vec3;
    fn index(&self, j: usize) -> &Vec3 {
        match j {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            _ => panic!("Mat3 column index out of range: {j}"),
        }
    }
}
impl IndexMut<usize> for Mat3 {
    fn index_mut(&mut self, j: usize) -> &mut Vec3 {
        match j {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            _ => panic!("Mat3 column index out of range: {j}"),
        }
    }
}

impl Mul<Vec3> for Mat3 {
    type Output = Vec3;
    fn mul(self, b: Vec3) -> Vec3 {
        self.x * b.x + self.y * b.y + self.z * b.z
    }
}
impl Mul for Mat3 {
    type Output = Mat3;
    fn mul(self, b: Mat3) -> Mat3 {
        Mat3::from_cols(self * b.x, self * b.y, self * b.z)
    }
}
impl Mul<f64> for Mat3 {
    type Output = Mat3;
    fn mul(self, s: f64) -> Mat3 {
        Mat3::from_cols(self.x * s, self.y * s, self.z * s)
    }
}
impl Add for Mat3 {
    type Output = Mat3;
    fn add(self, b: Mat3) -> Mat3 {
        Mat3::from_cols(self.x + b.x, self.y + b.y, self.z + b.z)
    }
}
impl Sub for Mat3 {
    type Output = Mat3;
    fn sub(self, b: Mat3) -> Mat3 {
        Mat3::from_cols(self.x - b.x, self.y - b.y, self.z - b.z)
    }
}
impl Neg for Mat3 {
    type Output = Mat3;
    fn neg(self) -> Mat3 {
        Mat3::from_cols(-self.x, -self.y, -self.z)
    }
}

/// `la::mat<double, 4, 4>` — 4×4 matrix
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Mat4 {
    pub x: Vec4, // column 0
    pub y: Vec4, // column 1
    pub z: Vec4, // column 2
    pub w: Vec4, // column 3
}

impl Mat4 {
    #[inline]
    pub const fn from_cols(x: Vec4, y: Vec4, z: Vec4, w: Vec4) -> Self {
        Self { x, y, z, w }
    }
    pub fn identity() -> Self {
        Self {
            x: Vec4::new(1.0, 0.0, 0.0, 0.0),
            y: Vec4::new(0.0, 1.0, 0.0, 0.0),
            z: Vec4::new(0.0, 0.0, 1.0, 0.0),
            w: Vec4::new(0.0, 0.0, 0.0, 1.0),
        }
    }
    pub fn row(&self, i: usize) -> Vec4 {
        Vec4::new(self.x[i], self.y[i], self.z[i], self.w[i])
    }
    pub fn transpose(&self) -> Self {
        Self {
            x: self.row(0),
            y: self.row(1),
            z: self.row(2),
            w: self.row(3),
        }
    }
    pub fn determinant(&self) -> f64 {
        let a = self;
        a.x.x
            * (a.y.y * a.z.z * a.w.w
                + a.w.y * a.y.z * a.z.w
                + a.z.y * a.w.z * a.y.w
                - a.y.y * a.w.z * a.z.w
                - a.z.y * a.y.z * a.w.w
                - a.w.y * a.z.z * a.y.w)
            + a.x.y
                * (a.y.z * a.w.w * a.z.x
                    + a.z.z * a.y.w * a.w.x
                    + a.w.z * a.z.w * a.y.x
                    - a.y.z * a.z.w * a.w.x
                    - a.w.z * a.y.w * a.z.x
                    - a.z.z * a.w.w * a.y.x)
            + a.x.z
                * (a.y.w * a.z.x * a.w.y
                    + a.w.w * a.y.x * a.z.y
                    + a.z.w * a.w.x * a.y.y
                    - a.y.w * a.w.x * a.z.y
                    - a.z.w * a.y.x * a.w.y
                    - a.w.w * a.z.x * a.y.y)
            + a.x.w
                * (a.y.x * a.w.y * a.z.z
                    + a.z.x * a.y.y * a.w.z
                    + a.w.x * a.z.y * a.y.z
                    - a.y.x * a.z.y * a.w.z
                    - a.w.x * a.y.y * a.z.z
                    - a.z.x * a.w.y * a.y.z)
    }
    pub fn adjugate(&self) -> Self {
        let a = self;
        Self {
            x: Vec4::new(
                a.y.y * a.z.z * a.w.w
                    + a.w.y * a.y.z * a.z.w
                    + a.z.y * a.w.z * a.y.w
                    - a.y.y * a.w.z * a.z.w
                    - a.z.y * a.y.z * a.w.w
                    - a.w.y * a.z.z * a.y.w,
                a.x.y * a.w.z * a.z.w
                    + a.z.y * a.x.z * a.w.w
                    + a.w.y * a.z.z * a.x.w
                    - a.w.y * a.x.z * a.z.w
                    - a.z.y * a.w.z * a.x.w
                    - a.x.y * a.z.z * a.w.w,
                a.x.y * a.y.z * a.w.w
                    + a.w.y * a.x.z * a.y.w
                    + a.y.y * a.w.z * a.x.w
                    - a.x.y * a.w.z * a.y.w
                    - a.y.y * a.x.z * a.w.w
                    - a.w.y * a.y.z * a.x.w,
                a.x.y * a.z.z * a.y.w
                    + a.y.y * a.x.z * a.z.w
                    + a.z.y * a.y.z * a.x.w
                    - a.x.y * a.y.z * a.z.w
                    - a.z.y * a.x.z * a.y.w
                    - a.y.y * a.z.z * a.x.w,
            ),
            y: Vec4::new(
                a.y.z * a.w.w * a.z.x
                    + a.z.z * a.y.w * a.w.x
                    + a.w.z * a.z.w * a.y.x
                    - a.y.z * a.z.w * a.w.x
                    - a.w.z * a.y.w * a.z.x
                    - a.z.z * a.w.w * a.y.x,
                a.x.z * a.z.w * a.w.x
                    + a.w.z * a.x.w * a.z.x
                    + a.z.z * a.w.w * a.x.x
                    - a.x.z * a.w.w * a.z.x
                    - a.z.z * a.x.w * a.w.x
                    - a.w.z * a.z.w * a.x.x,
                a.x.z * a.w.w * a.y.x
                    + a.y.z * a.x.w * a.w.x
                    + a.w.z * a.y.w * a.x.x
                    - a.x.z * a.y.w * a.w.x
                    - a.w.z * a.x.w * a.y.x
                    - a.y.z * a.w.w * a.x.x,
                a.x.z * a.y.w * a.z.x
                    + a.z.z * a.x.w * a.y.x
                    + a.y.z * a.z.w * a.x.x
                    - a.x.z * a.z.w * a.y.x
                    - a.y.z * a.x.w * a.z.x
                    - a.z.z * a.y.w * a.x.x,
            ),
            z: Vec4::new(
                a.y.w * a.z.x * a.w.y
                    + a.w.w * a.y.x * a.z.y
                    + a.z.w * a.w.x * a.y.y
                    - a.y.w * a.w.x * a.z.y
                    - a.z.w * a.y.x * a.w.y
                    - a.w.w * a.z.x * a.y.y,
                a.x.w * a.w.x * a.z.y
                    + a.z.w * a.x.x * a.w.y
                    + a.w.w * a.z.x * a.x.y
                    - a.x.w * a.z.x * a.w.y
                    - a.w.w * a.x.x * a.z.y
                    - a.z.w * a.w.x * a.x.y,
                a.x.w * a.y.x * a.w.y
                    + a.w.w * a.x.x * a.y.y
                    + a.y.w * a.w.x * a.x.y
                    - a.x.w * a.w.x * a.y.y
                    - a.y.w * a.x.x * a.w.y
                    - a.w.w * a.y.x * a.x.y,
                a.x.w * a.z.x * a.y.y
                    + a.y.w * a.x.x * a.z.y
                    + a.z.w * a.y.x * a.x.y
                    - a.x.w * a.y.x * a.z.y
                    - a.z.w * a.x.x * a.y.y
                    - a.y.w * a.z.x * a.x.y,
            ),
            w: Vec4::new(
                a.y.x * a.w.y * a.z.z
                    + a.z.x * a.y.y * a.w.z
                    + a.w.x * a.z.y * a.y.z
                    - a.y.x * a.z.y * a.w.z
                    - a.w.x * a.y.y * a.z.z
                    - a.z.x * a.w.y * a.y.z,
                a.x.x * a.z.y * a.w.z
                    + a.w.x * a.x.y * a.z.z
                    + a.z.x * a.w.y * a.x.z
                    - a.x.x * a.w.y * a.z.z
                    - a.z.x * a.x.y * a.w.z
                    - a.w.x * a.z.y * a.x.z,
                a.x.x * a.w.y * a.y.z
                    + a.y.x * a.x.y * a.w.z
                    + a.w.x * a.y.y * a.x.z
                    - a.x.x * a.y.y * a.w.z
                    - a.w.x * a.x.y * a.y.z
                    - a.y.x * a.w.y * a.x.z,
                a.x.x * a.y.y * a.z.z
                    + a.z.x * a.x.y * a.y.z
                    + a.y.x * a.z.y * a.x.z
                    - a.x.x * a.z.y * a.y.z
                    - a.y.x * a.x.y * a.z.z
                    - a.z.x * a.y.y * a.x.z,
            ),
        }
    }
    pub fn inverse(&self) -> Self {
        self.adjugate() * (1.0 / self.determinant())
    }
}

impl Index<usize> for Mat4 {
    type Output = Vec4;
    fn index(&self, j: usize) -> &Vec4 {
        match j {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            3 => &self.w,
            _ => panic!("Mat4 column index out of range: {j}"),
        }
    }
}
impl IndexMut<usize> for Mat4 {
    fn index_mut(&mut self, j: usize) -> &mut Vec4 {
        match j {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            3 => &mut self.w,
            _ => panic!("Mat4 column index out of range: {j}"),
        }
    }
}

impl Mul<Vec4> for Mat4 {
    type Output = Vec4;
    fn mul(self, b: Vec4) -> Vec4 {
        self.x * b.x + self.y * b.y + self.z * b.z + self.w * b.w
    }
}
impl Mul for Mat4 {
    type Output = Mat4;
    fn mul(self, b: Mat4) -> Mat4 {
        Mat4::from_cols(self * b.x, self * b.y, self * b.z, self * b.w)
    }
}
impl Mul<f64> for Mat4 {
    type Output = Mat4;
    fn mul(self, s: f64) -> Mat4 {
        Mat4::from_cols(self.x * s, self.y * s, self.z * s, self.w * s)
    }
}
impl Add for Mat4 {
    type Output = Mat4;
    fn add(self, b: Mat4) -> Mat4 {
        Mat4::from_cols(self.x + b.x, self.y + b.y, self.z + b.z, self.w + b.w)
    }
}
impl Sub for Mat4 {
    type Output = Mat4;
    fn sub(self, b: Mat4) -> Mat4 {
        Mat4::from_cols(self.x - b.x, self.y - b.y, self.z - b.z, self.w - b.w)
    }
}
impl Neg for Mat4 {
    type Output = Mat4;
    fn neg(self) -> Mat4 {
        Mat4::from_cols(-self.x, -self.y, -self.z, -self.w)
    }
}

/// `la::mat<double, 3, 4>` — 3 rows, 4 columns (affine transform type)
/// Stored as 4 columns each of Vec3: [x|y|z|translation]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Mat3x4 {
    pub x: Vec3, // column 0
    pub y: Vec3, // column 1
    pub z: Vec3, // column 2
    pub w: Vec3, // column 3 (translation)
}

impl Mat3x4 {
    #[inline]
    pub const fn from_cols(x: Vec3, y: Vec3, z: Vec3, w: Vec3) -> Self {
        Self { x, y, z, w }
    }
    /// Identity: rotation=I, translation=0
    pub fn identity() -> Self {
        Self {
            x: Vec3::new(1.0, 0.0, 0.0),
            y: Vec3::new(0.0, 1.0, 0.0),
            z: Vec3::new(0.0, 0.0, 1.0),
            w: Vec3::new(0.0, 0.0, 0.0),
        }
    }
    pub fn row(&self, i: usize) -> Vec4 {
        Vec4::new(self.x[i], self.y[i], self.z[i], self.w[i])
    }
    /// Extract the 3×3 rotation/scale submatrix (first 3 columns)
    pub fn rotation(&self) -> Mat3 {
        Mat3::from_cols(self.x, self.y, self.z)
    }
    /// Extract the translation column
    pub fn translation(&self) -> Vec3 {
        self.w
    }
}

impl Index<usize> for Mat3x4 {
    type Output = Vec3;
    fn index(&self, j: usize) -> &Vec3 {
        match j {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            3 => &self.w,
            _ => panic!("Mat3x4 column index out of range: {j}"),
        }
    }
}
impl IndexMut<usize> for Mat3x4 {
    fn index_mut(&mut self, j: usize) -> &mut Vec3 {
        match j {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            3 => &mut self.w,
            _ => panic!("Mat3x4 column index out of range: {j}"),
        }
    }
}

/// mat3x4 * vec4 → vec3  (matrix-vector multiplication)
impl Mul<Vec4> for Mat3x4 {
    type Output = Vec3;
    fn mul(self, b: Vec4) -> Vec3 {
        self.x * b.x + self.y * b.y + self.z * b.z + self.w * b.w
    }
}

/// mat3x4 * mat4x4 → mat3x4  (chain transforms)
impl Mul<Mat4> for Mat3x4 {
    type Output = Mat3x4;
    fn mul(self, b: Mat4) -> Mat3x4 {
        Mat3x4::from_cols(self * b.x, self * b.y, self * b.z, self * b.w)
    }
}

/// mat4x4 * mat3x4 — promotes mat3x4 to mat4x4 then multiplies; returns Mat4
impl Mul<Mat3x4> for Mat4 {
    type Output = Mat4;
    fn mul(self, b: Mat3x4) -> Mat4 {
        // Treat mat3x4 as mat4x4 with bottom row [0,0,0,1]
        let b4 = mat3x4_to_mat4(b);
        self * b4
    }
}

impl Mul<f64> for Mat3x4 {
    type Output = Mat3x4;
    fn mul(self, s: f64) -> Mat3x4 {
        Mat3x4::from_cols(self.x * s, self.y * s, self.z * s, self.w * s)
    }
}
impl Add for Mat3x4 {
    type Output = Mat3x4;
    fn add(self, b: Mat3x4) -> Mat3x4 {
        Mat3x4::from_cols(self.x + b.x, self.y + b.y, self.z + b.z, self.w + b.w)
    }
}
impl Sub for Mat3x4 {
    type Output = Mat3x4;
    fn sub(self, b: Mat3x4) -> Mat3x4 {
        Mat3x4::from_cols(self.x - b.x, self.y - b.y, self.z - b.z, self.w - b.w)
    }
}
impl Neg for Mat3x4 {
    type Output = Mat3x4;
    fn neg(self) -> Mat3x4 {
        Mat3x4::from_cols(-self.x, -self.y, -self.z, -self.w)
    }
}

/// `la::mat<double, 4, 3>` — 4 rows, 3 cols
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Mat4x3 {
    pub x: Vec4,
    pub y: Vec4,
    pub z: Vec4,
}

impl Mat4x3 {
    #[inline]
    pub const fn from_cols(x: Vec4, y: Vec4, z: Vec4) -> Self {
        Self { x, y, z }
    }
    pub fn row(&self, i: usize) -> Vec3 {
        Vec3::new(self.x[i], self.y[i], self.z[i])
    }
}

impl Mul<Vec3> for Mat4x3 {
    type Output = Vec4;
    fn mul(self, b: Vec3) -> Vec4 {
        self.x * b.x + self.y * b.y + self.z * b.z
    }
}

/// `la::mat<double, 3, 2>` — 3 rows, 2 cols
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Mat3x2 {
    pub x: Vec3,
    pub y: Vec3,
}

impl Mat3x2 {
    #[inline]
    pub const fn from_cols(x: Vec3, y: Vec3) -> Self {
        Self { x, y }
    }
    pub fn row(&self, i: usize) -> Vec2 {
        Vec2::new(self.x[i], self.y[i])
    }
}

impl Mul<Vec2> for Mat3x2 {
    type Output = Vec3;
    fn mul(self, b: Vec2) -> Vec3 {
        self.x * b.x + self.y * b.y
    }
}

/// `la::mat<double, 2, 3>` — 2 rows, 3 cols
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Mat2x3 {
    pub x: Vec2,
    pub y: Vec2,
    pub z: Vec2,
}

impl Mat2x3 {
    #[inline]
    pub const fn from_cols(x: Vec2, y: Vec2, z: Vec2) -> Self {
        Self { x, y, z }
    }
}

impl Mul<Vec3> for Mat2x3 {
    type Output = Vec2;
    fn mul(self, b: Vec3) -> Vec2 {
        self.x * b.x + self.y * b.y + self.z * b.z
    }
}

// ─── Helper conversions ───────────────────────────────────────────────────────

/// Embed Mat3x4 into Mat4x4 by appending bottom row [0,0,0,1]
pub fn mat3x4_to_mat4(m: Mat3x4) -> Mat4 {
    Mat4::from_cols(
        Vec4::new(m.x.x, m.x.y, m.x.z, 0.0),
        Vec4::new(m.y.x, m.y.y, m.y.z, 0.0),
        Vec4::new(m.z.x, m.z.y, m.z.z, 0.0),
        Vec4::new(m.w.x, m.w.y, m.w.z, 1.0),
    )
}

/// Extract upper-left 3 rows from a Mat4x4 (drops 4th row)
pub fn mat4_to_mat3x4(m: Mat4) -> Mat3x4 {
    Mat3x4::from_cols(m.x.xyz(), m.y.xyz(), m.z.xyz(), m.w.xyz())
}

// ─── Vector algebra functions ─────────────────────────────────────────────────

/// 2D cross product: `a.x*b.y - a.y*b.x`
#[inline]
pub fn cross2(a: Vec2, b: Vec2) -> f64 {
    a.x * b.y - a.y * b.x
}

/// 2D: rotate vector 90° CCW by scalar `a` (scalar × vec2 cross)
#[inline]
pub fn cross_sv(a: f64, b: Vec2) -> Vec2 {
    Vec2::new(-a * b.y, a * b.x)
}

/// 2D: vec2 × scalar
#[inline]
pub fn cross_vs(a: Vec2, b: f64) -> Vec2 {
    Vec2::new(a.y * b, -a.x * b)
}

/// 3D cross product
#[inline]
pub fn cross(a: Vec3, b: Vec3) -> Vec3 {
    Vec3::new(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
    )
}

/// Dot product
#[inline]
pub fn dot2(a: Vec2, b: Vec2) -> f64 {
    a.x * b.x + a.y * b.y
}
#[inline]
pub fn dot(a: Vec3, b: Vec3) -> f64 {
    a.x * b.x + a.y * b.y + a.z * b.z
}
#[inline]
pub fn dot4(a: Vec4, b: Vec4) -> f64 {
    a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
}

#[inline]
pub fn length2_2(a: Vec2) -> f64 {
    dot2(a, a)
}
#[inline]
pub fn length2(a: Vec3) -> f64 {
    dot(a, a)
}
#[inline]
pub fn length2_4(a: Vec4) -> f64 {
    dot4(a, a)
}

#[inline]
pub fn length_2(a: Vec2) -> f64 {
    length2_2(a).sqrt()
}
#[inline]
pub fn length(a: Vec3) -> f64 {
    length2(a).sqrt()
}
#[inline]
pub fn length_4(a: Vec4) -> f64 {
    length2_4(a).sqrt()
}

#[inline]
pub fn normalize2(a: Vec2) -> Vec2 {
    a / length_2(a)
}
#[inline]
pub fn normalize(a: Vec3) -> Vec3 {
    a / length(a)
}
#[inline]
pub fn normalize4(a: Vec4) -> Vec4 {
    a / length_4(a)
}

#[inline]
pub fn distance2_2(a: Vec2, b: Vec2) -> f64 {
    length2_2(b - a)
}
#[inline]
pub fn distance2(a: Vec3, b: Vec3) -> f64 {
    length2(b - a)
}
#[inline]
pub fn distance_2(a: Vec2, b: Vec2) -> f64 {
    length_2(b - a)
}
#[inline]
pub fn distance(a: Vec3, b: Vec3) -> f64 {
    length(b - a)
}

/// Angle between two unit vectors (clamped to [0, π])
#[inline]
pub fn uangle(a: Vec3, b: Vec3) -> f64 {
    let d = dot(a, b);
    if d > 1.0 {
        0.0
    } else {
        math::acos(if d < -1.0 { -1.0 } else { d })
    }
}

/// Angle between two non-unit vectors
#[inline]
pub fn angle(a: Vec3, b: Vec3) -> f64 {
    uangle(normalize(a), normalize(b))
}

/// 2D rotation: rotate `v` CCW by angle `a` (radians)
#[inline]
pub fn rot2(a: f64, v: Vec2) -> Vec2 {
    let (s, c) = (math::sin(a), math::cos(a));
    Vec2::new(v.x * c - v.y * s, v.x * s + v.y * c)
}

/// Rotate `v` CCW around X axis by `a` radians
#[inline]
pub fn rotx(a: f64, v: Vec3) -> Vec3 {
    let (s, c) = (math::sin(a), math::cos(a));
    Vec3::new(v.x, v.y * c - v.z * s, v.y * s + v.z * c)
}

/// Rotate `v` CCW around Y axis by `a` radians
#[inline]
pub fn roty(a: f64, v: Vec3) -> Vec3 {
    let (s, c) = (math::sin(a), math::cos(a));
    Vec3::new(v.x * c + v.z * s, v.y, -v.x * s + v.z * c)
}

/// Rotate `v` CCW around Z axis by `a` radians
#[inline]
pub fn rotz(a: f64, v: Vec3) -> Vec3 {
    let (s, c) = (math::sin(a), math::cos(a));
    Vec3::new(v.x * c - v.y * s, v.x * s + v.y * c, v.z)
}

/// Normalized linear interpolation
#[inline]
pub fn nlerp(a: Vec3, b: Vec3, t: f64) -> Vec3 {
    normalize(lerp3(a, b, t))
}

/// Spherical linear interpolation between unit vectors
#[inline]
pub fn slerp(a: Vec3, b: Vec3, t: f64) -> Vec3 {
    let th = uangle(a, b);
    if th == 0.0 {
        a
    } else {
        a * math::sin(th * (1.0 - t)) / math::sin(th) + b * math::sin(th * t) / math::sin(th)
    }
}

// ─── Component-wise math functions ───────────────────────────────────────────

#[inline]
pub fn abs2(a: Vec2) -> Vec2 {
    Vec2::new(a.x.abs(), a.y.abs())
}
#[inline]
pub fn abs3(a: Vec3) -> Vec3 {
    Vec3::new(a.x.abs(), a.y.abs(), a.z.abs())
}
#[inline]
pub fn abs4(a: Vec4) -> Vec4 {
    Vec4::new(a.x.abs(), a.y.abs(), a.z.abs(), a.w.abs())
}

#[inline]
pub fn floor2(a: Vec2) -> Vec2 {
    Vec2::new(a.x.floor(), a.y.floor())
}
#[inline]
pub fn floor3(a: Vec3) -> Vec3 {
    Vec3::new(a.x.floor(), a.y.floor(), a.z.floor())
}
#[inline]
pub fn floor4(a: Vec4) -> Vec4 {
    Vec4::new(a.x.floor(), a.y.floor(), a.z.floor(), a.w.floor())
}

#[inline]
pub fn ceil2(a: Vec2) -> Vec2 {
    Vec2::new(a.x.ceil(), a.y.ceil())
}
#[inline]
pub fn ceil3(a: Vec3) -> Vec3 {
    Vec3::new(a.x.ceil(), a.y.ceil(), a.z.ceil())
}

#[inline]
pub fn round3(a: Vec3) -> Vec3 {
    Vec3::new(a.x.round(), a.y.round(), a.z.round())
}
#[inline]
pub fn round4(a: Vec4) -> Vec4 {
    Vec4::new(a.x.round(), a.y.round(), a.z.round(), a.w.round())
}

#[inline]
pub fn sqrt3(a: Vec3) -> Vec3 {
    Vec3::new(a.x.sqrt(), a.y.sqrt(), a.z.sqrt())
}
#[inline]
pub fn sqrt4(a: Vec4) -> Vec4 {
    Vec4::new(a.x.sqrt(), a.y.sqrt(), a.z.sqrt(), a.w.sqrt())
}

#[inline]
pub fn isfinite3(a: Vec3) -> bool {
    a.x.is_finite() && a.y.is_finite() && a.z.is_finite()
}
#[inline]
pub fn isfinite4(a: Vec4) -> bool {
    a.x.is_finite() && a.y.is_finite() && a.z.is_finite() && a.w.is_finite()
}

// ─── Component-wise min/max/clamp ─────────────────────────────────────────────

#[inline]
pub fn min2(a: Vec2, b: Vec2) -> Vec2 {
    Vec2::new(a.x.min(b.x), a.y.min(b.y))
}
#[inline]
pub fn min3(a: Vec3, b: Vec3) -> Vec3 {
    Vec3::new(a.x.min(b.x), a.y.min(b.y), a.z.min(b.z))
}
#[inline]
pub fn min4(a: Vec4, b: Vec4) -> Vec4 {
    Vec4::new(a.x.min(b.x), a.y.min(b.y), a.z.min(b.z), a.w.min(b.w))
}

#[inline]
pub fn max2(a: Vec2, b: Vec2) -> Vec2 {
    Vec2::new(a.x.max(b.x), a.y.max(b.y))
}
#[inline]
pub fn max3(a: Vec3, b: Vec3) -> Vec3 {
    Vec3::new(a.x.max(b.x), a.y.max(b.y), a.z.max(b.z))
}
#[inline]
pub fn max4(a: Vec4, b: Vec4) -> Vec4 {
    Vec4::new(a.x.max(b.x), a.y.max(b.y), a.z.max(b.z), a.w.max(b.w))
}

/// Clamp `x` component-wise between `lo` and `hi`
#[inline]
pub fn clamp3(x: Vec3, lo: Vec3, hi: Vec3) -> Vec3 {
    Vec3::new(
        x.x.max(lo.x).min(hi.x),
        x.y.max(lo.y).min(hi.y),
        x.z.max(lo.z).min(hi.z),
    )
}
#[inline]
pub fn clamp4(x: Vec4, lo: Vec4, hi: Vec4) -> Vec4 {
    Vec4::new(
        x.x.max(lo.x).min(hi.x),
        x.y.max(lo.y).min(hi.y),
        x.z.max(lo.z).min(hi.z),
        x.w.max(lo.w).min(hi.w),
    )
}

/// Scalar clamp
#[inline]
pub fn clamp_s(x: f64, lo: f64, hi: f64) -> f64 {
    x.max(lo).min(hi)
}

/// Linear interpolation: `a*(1-t) + b*t`
#[inline]
pub fn lerp2(a: Vec2, b: Vec2, t: f64) -> Vec2 {
    a * (1.0 - t) + b * t
}
#[inline]
pub fn lerp3(a: Vec3, b: Vec3, t: f64) -> Vec3 {
    a * (1.0 - t) + b * t
}
#[inline]
pub fn lerp4(a: Vec4, b: Vec4, t: f64) -> Vec4 {
    a * (1.0 - t) + b * t
}

/// Reductions
#[inline]
pub fn minelem2(a: Vec2) -> f64 {
    a.x.min(a.y)
}
#[inline]
pub fn minelem3(a: Vec3) -> f64 {
    a.x.min(a.y).min(a.z)
}
#[inline]
pub fn minelem4(a: Vec4) -> f64 {
    a.x.min(a.y).min(a.z).min(a.w)
}

#[inline]
pub fn maxelem2(a: Vec2) -> f64 {
    a.x.max(a.y)
}
#[inline]
pub fn maxelem3(a: Vec3) -> f64 {
    a.x.max(a.y).max(a.z)
}
#[inline]
pub fn maxelem4(a: Vec4) -> f64 {
    a.x.max(a.y).max(a.z).max(a.w)
}

#[inline]
pub fn sum3(a: Vec3) -> f64 {
    a.x + a.y + a.z
}
#[inline]
pub fn sum4(a: Vec4) -> f64 {
    a.x + a.y + a.z + a.w
}

/// Index of minimum element (argmin)
#[inline]
pub fn argmin3(a: Vec3) -> usize {
    if a.x <= a.y && a.x <= a.z {
        0
    } else if a.y <= a.z {
        1
    } else {
        2
    }
}
/// Index of maximum element (argmax)
#[inline]
pub fn argmax3(a: Vec3) -> usize {
    if a.x >= a.y && a.x >= a.z {
        0
    } else if a.y >= a.z {
        1
    } else {
        2
    }
}
#[inline]
pub fn argmax4(a: Vec4) -> usize {
    let mut j = 0usize;
    for i in 1..4 {
        if a[i] > a[j] {
            j = i;
        }
    }
    j
}

// ─── Quaternion functions ─────────────────────────────────────────────────────

/// Quaternion conjugate: `{-x, -y, -z, w}`
#[inline]
pub fn qconj(q: Quat) -> Quat {
    Vec4::new(-q.x, -q.y, -q.z, q.w)
}

/// Quaternion inverse
#[inline]
pub fn qinv(q: Quat) -> Quat {
    qconj(q) / length2_4(q)
}

/// Quaternion Hamilton product
#[inline]
pub fn qmul(a: Quat, b: Quat) -> Quat {
    Quat::new(
        a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
        a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
        a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
        a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    )
}

/// X-axis direction from quaternion: `qrot(q, {1,0,0})`
#[inline]
pub fn qxdir(q: Quat) -> Vec3 {
    Vec3::new(
        q.w * q.w + q.x * q.x - q.y * q.y - q.z * q.z,
        (q.x * q.y + q.z * q.w) * 2.0,
        (q.z * q.x - q.y * q.w) * 2.0,
    )
}

/// Y-axis direction from quaternion: `qrot(q, {0,1,0})`
#[inline]
pub fn qydir(q: Quat) -> Vec3 {
    Vec3::new(
        (q.x * q.y - q.z * q.w) * 2.0,
        q.w * q.w - q.x * q.x + q.y * q.y - q.z * q.z,
        (q.y * q.z + q.x * q.w) * 2.0,
    )
}

/// Z-axis direction from quaternion: `qrot(q, {0,0,1})`
#[inline]
pub fn qzdir(q: Quat) -> Vec3 {
    Vec3::new(
        (q.z * q.x + q.y * q.w) * 2.0,
        (q.y * q.z - q.x * q.w) * 2.0,
        q.w * q.w - q.x * q.x - q.y * q.y + q.z * q.z,
    )
}

/// Rotation matrix from quaternion
#[inline]
pub fn qmat(q: Quat) -> Mat3 {
    Mat3::from_cols(qxdir(q), qydir(q), qzdir(q))
}

/// Rotate vector `v` by quaternion `q`
#[inline]
pub fn qrot(q: Quat, v: Vec3) -> Vec3 {
    qxdir(q) * v.x + qydir(q) * v.y + qzdir(q) * v.z
}

/// Rotation angle of a unit quaternion
#[inline]
pub fn qangle(q: Quat) -> f64 {
    math::atan2(length(q.xyz()), q.w) * 2.0
}

/// Rotation axis of a unit quaternion
#[inline]
pub fn qaxis(q: Quat) -> Vec3 {
    normalize(q.xyz())
}

/// Quaternion nlerp — shortest path
#[inline]
pub fn qnlerp(a: Quat, b: Quat, t: f64) -> Quat {
    let b2 = if dot4(a, b) < 0.0 { -b } else { b };
    normalize4(lerp4(a, b2, t))
}

/// Quaternion slerp — shortest path
#[inline]
pub fn qslerp(a: Quat, b: Quat, t: f64) -> Quat {
    let b2 = if dot4(a, b) < 0.0 { -b } else { b };
    // slerp on Vec4 (unit quaternion treated as unit 4D vector)
    let th = {
        let d = dot4(a, b2).max(-1.0).min(1.0);
        if d > 1.0 {
            0.0
        } else {
            math::acos(d)
        }
    };
    if th == 0.0 {
        a
    } else {
        a * math::sin(th * (1.0 - t)) / math::sin(th) + b2 * math::sin(th * t) / math::sin(th)
    }
}

/// Unit quaternion from axis + angle
#[inline]
pub fn rotation_quat_axis_angle(axis: Vec3, angle: f64) -> Quat {
    Quat::new(
        axis.x * math::sin(angle / 2.0),
        axis.y * math::sin(angle / 2.0),
        axis.z * math::sin(angle / 2.0),
        math::cos(angle / 2.0),
    )
}

/// Unit quaternion representing shortest rotation from `orig` to `dest`
pub fn rotation_quat_vec(orig: Vec3, dest: Vec3) -> Quat {
    let cos_theta = dot(orig, dest);
    let eps = f64::EPSILON;
    if cos_theta >= 1.0 - eps {
        return Quat::new(0.0, 0.0, 0.0, 1.0);
    }
    if cos_theta < -1.0 + eps {
        let mut axis = cross(Vec3::new(0.0, 0.0, 1.0), orig);
        if length2(axis) < eps {
            axis = cross(Vec3::new(1.0, 0.0, 0.0), orig);
        }
        return rotation_quat_axis_angle(normalize(axis), std::f64::consts::PI);
    }
    let axis = cross(orig, dest);
    let s = ((1.0 + cos_theta) * 2.0).sqrt();
    Quat::new(axis.x / s, axis.y / s, axis.z / s, s * 0.5)
}

/// Unit quaternion from a rotation matrix
pub fn rotation_quat_mat(m: Mat3) -> Quat {
    let q = Vec4::new(
        m.x.x - m.y.y - m.z.z,
        m.y.y - m.x.x - m.z.z,
        m.z.z - m.x.x - m.y.y,
        m.x.x + m.y.y + m.z.z,
    );
    // s[argmax(q)] gives the sign correction
    let s = [
        Vec4::new(1.0, m.x.y + m.y.x, m.z.x + m.x.z, m.y.z - m.z.y),
        Vec4::new(m.x.y + m.y.x, 1.0, m.y.z + m.z.y, m.z.x - m.x.z),
        Vec4::new(m.x.z + m.z.x, m.y.z + m.z.y, 1.0, m.x.y - m.y.x),
        Vec4::new(m.y.z - m.z.y, m.z.x - m.x.z, m.x.y - m.y.x, 1.0),
    ];
    let idx = argmax4(q);
    // copysign(normalize(sqrt(max(0, 1+q))), s[idx])
    let sq = Vec4::new(
        (0.0f64).max(1.0 + q.x).sqrt(),
        (0.0f64).max(1.0 + q.y).sqrt(),
        (0.0f64).max(1.0 + q.z).sqrt(),
        (0.0f64).max(1.0 + q.w).sqrt(),
    );
    let n = normalize4(sq);
    let si = s[idx];
    Vec4::new(
        n.x.copysign(si.x),
        n.y.copysign(si.y),
        n.z.copysign(si.z),
        n.w.copysign(si.w),
    )
}

// ─── Matrix factory functions ─────────────────────────────────────────────────

pub fn translation_matrix(t: Vec3) -> Mat4 {
    Mat4::from_cols(
        Vec4::new(1.0, 0.0, 0.0, 0.0),
        Vec4::new(0.0, 1.0, 0.0, 0.0),
        Vec4::new(0.0, 0.0, 1.0, 0.0),
        Vec4::new(t.x, t.y, t.z, 1.0),
    )
}

pub fn rotation_matrix(q: Quat) -> Mat4 {
    Mat4::from_cols(
        Vec4::from((qxdir(q), 0.0)),
        Vec4::from((qydir(q), 0.0)),
        Vec4::from((qzdir(q), 0.0)),
        Vec4::new(0.0, 0.0, 0.0, 1.0),
    )
}

pub fn scaling_matrix(s: Vec3) -> Mat4 {
    Mat4::from_cols(
        Vec4::new(s.x, 0.0, 0.0, 0.0),
        Vec4::new(0.0, s.y, 0.0, 0.0),
        Vec4::new(0.0, 0.0, s.z, 0.0),
        Vec4::new(0.0, 0.0, 0.0, 1.0),
    )
}

pub fn pose_matrix(q: Quat, p: Vec3) -> Mat4 {
    Mat4::from_cols(
        Vec4::from((qxdir(q), 0.0)),
        Vec4::from((qydir(q), 0.0)),
        Vec4::from((qzdir(q), 0.0)),
        Vec4::new(p.x, p.y, p.z, 1.0),
    )
}

/// Outer product: vec3 ⊗ vec3 → Mat3
pub fn outerprod(a: Vec3, b: Vec3) -> Mat3 {
    Mat3::from_cols(a * b.x, a * b.y, a * b.z)
}

// ─── Hash impls for f64 vectors (using bit-cast) ──────────────────────────────
// Matches C++ hash: h(v.x) ^ (h(v.y) << 1) ^ ...

fn hash_f64<H: Hasher>(v: f64, state: &mut H) {
    // Use bit representation for hashing (NaN will hash consistently)
    v.to_bits().hash(state);
}

impl Hash for Vec2 {
    fn hash<H: Hasher>(&self, state: &mut H) {
        hash_f64(self.x, state);
        // XOR with shift — mirrors C++ std::hash specialization
        let mut h2 = std::collections::hash_map::DefaultHasher::new();
        hash_f64(self.y, &mut h2);
        state.write_u64(std::hash::BuildHasher::build_hasher(&std::collections::hash_map::RandomState::new()).finish() ^ (std::hash::Hasher::finish(&h2) << 1));
    }
}

// Simpler hash that is consistent: just hash all fields sequentially
impl Hash for Vec3 {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.x.to_bits().hash(state);
        self.y.to_bits().hash(state);
        self.z.to_bits().hash(state);
    }
}

impl Hash for Vec4 {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.x.to_bits().hash(state);
        self.y.to_bits().hash(state);
        self.z.to_bits().hash(state);
        self.w.to_bits().hash(state);
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────


#[cfg(test)]
#[path = "linalg_tests.rs"]
mod tests;
