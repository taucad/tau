//! Pure Rust port of the [Manifold](https://github.com/elalish/manifold) 3D
//! geometry library: guaranteed-manifold boolean operations (union,
//! intersection, difference) on triangle meshes, plus constructors, convex
//! hull, Minkowski sum/difference, SDF meshing, smoothing and 2D
//! cross-sections.
//!
//! The port targets **exact numerical match** with the C++ reference
//! (v3.5.0): same algorithms, same floating-point results, same triangle
//! topology. The optional `parallel` feature adds rayon parallelism that is
//! restricted to determinism-preserving sites, so its results remain
//! bit-identical to the sequential build.
//!
//! # Example
//!
//! ```
//! use manifold_rust::manifold::Manifold;
//! use manifold_rust::linalg::Vec3;
//!
//! let cube = Manifold::cube(Vec3::new(1.0, 1.0, 1.0), true);
//! let sphere = Manifold::sphere(0.6, 32);
//!
//! let difference = cube.difference(&sphere);
//! assert!(difference.volume() > 0.0);
//! assert_eq!(difference.status(), manifold_rust::types::Error::NoError);
//! ```
//!
//! The main entry point is [`manifold::Manifold`]; meshes move in and out via
//! [`types::MeshGL`] / [`types::MeshGL64`]. Lower-level modules mirror the C++
//! source layout and are public primarily for testing and advanced use — their
//! APIs may change before 1.0.

pub mod cancel;
pub mod progress;
pub mod linalg;
pub mod types;
pub mod polygon;
pub mod impl_mesh;
pub mod sort;
pub mod constructors;
pub mod face_op;
pub mod edge_op;
pub mod properties;
pub mod svd;
pub mod smoothing;
pub mod collider;
pub mod tree2d;
pub mod boolean3;
pub mod boolean_result;
pub mod csg_tree;
pub mod manifold;
pub mod cross_section;
pub mod subdivision;
pub mod sdf;
pub mod minkowski;
pub mod robust;
pub mod quickhull;
pub mod disjoint_sets;
pub mod math;
pub mod timing;
pub mod interp_tri;
pub mod par;
