// Tests for the Properties suite that rely on the StretchyBracelet sample.
// The bracelet sample is a sizable exercise of extrude + CrossSection +
// boolean composition, so it lives here rather than next to the primitive
// min_gap tests in advanced.rs (which is close to the line-count cap).

use super::*;
use crate::cross_section::CrossSection;
use std::f64::consts::PI;

/// Port of C++ samples/bracelet.cpp `Base` helper.
fn bracelet_base(
    width: f64,
    radius: f64,
    decor_radius: f64,
    twist_radius: f64,
    n_decor: i32,
    inner_radius: f64,
    outer_radius: f64,
    cut: f64,
    n_cut: i32,
    n_division: i32,
) -> Manifold {
    let mut base = Manifold::cylinder(width, radius + twist_radius / 2.0, -1.0, 0);

    let circle = CrossSection::circle(decor_radius, n_division)
        .translate(Vec2::new(twist_radius, 0.0));
    let decor = Manifold::extrude(&circle.to_polygons(), width, n_division, 180.0, Vec2::new(1.0, 1.0))
        .scale(Vec3::new(1.0, 0.5, 1.0))
        .translate(Vec3::new(0.0, radius, 0.0));

    for i in 0..n_decor {
        let angle_deg = (360.0 / n_decor as f64) * i as f64;
        base = base.union(&decor.rotate(0.0, 0.0, angle_deg));
    }

    let d_phi_rad = 2.0 * PI / n_cut as f64;
    let p0 = Vec2::new(outer_radius, 0.0);
    let p1 = Vec2::new(inner_radius, -cut);
    let p2 = Vec2::new(inner_radius, cut);
    let rot = |theta: f64, v: Vec2| -> Vec2 {
        let c = theta.cos();
        let s = theta.sin();
        Vec2::new(c * v.x - s * v.y, s * v.x + c * v.y)
    };
    let mut ring: Vec<Vec2> = Vec::with_capacity(n_cut as usize * 4);
    for i in 0..n_cut {
        let t = d_phi_rad * i as f64;
        ring.push(rot(t, p0));
        ring.push(rot(t, p1));
        ring.push(rot(t, p2));
        ring.push(rot(t, p0));
    }
    let stretch: Polygons = vec![ring];

    base = Manifold::extrude(&stretch, width, 0, 0.0, Vec2::new(1.0, 1.0))
        .intersection(&base);
    base.as_original()
}

/// Port of C++ samples/bracelet.cpp `StretchyBracelet`.
fn stretchy_bracelet() -> Manifold {
    let radius: f64 = 30.0;
    let height: f64 = 8.0;
    let width: f64 = 15.0;
    let thickness: f64 = 0.4;
    let n_decor: i32 = 20;
    let n_cut: i32 = 27;
    let n_division: i32 = 30;

    let twist_radius = PI * radius / n_decor as f64;
    let decor_radius = twist_radius * 1.5;
    let outer_radius = radius + (decor_radius + twist_radius) * 0.5;
    let inner_radius = outer_radius - height;
    let cut = 0.5 * (PI * 2.0 * inner_radius / n_cut as f64 - thickness);
    let adj_thickness = 0.5 * thickness * height / cut;

    let outer = bracelet_base(
        width,
        radius,
        decor_radius,
        twist_radius,
        n_decor,
        inner_radius + thickness,
        outer_radius + adj_thickness,
        cut - adj_thickness,
        n_cut,
        n_division,
    );
    let inner = bracelet_base(
        width,
        radius - thickness,
        decor_radius,
        twist_radius,
        n_decor,
        inner_radius,
        outer_radius + 3.0 * adj_thickness,
        cut,
        n_cut,
        n_division,
    );
    outer.difference(&inner)
}

/// C++ TEST(Properties, MingapStretchyBracelet) — two stacked bracelets 20 apart.
/// Width is 15, so gap along z is 20 - 15 = 5.
///
/// Heavy boolean composition: 3.8s release (matching sequential C++ at 3.83s;
/// 3.1s with the `parallel` feature), ~41s debug — enabled like the other
/// roughly-one-minute debug tests.
#[test]
fn test_cpp_properties_mingap_stretchy_bracelet() {
    let a = stretchy_bracelet();
    let b = stretchy_bracelet().translate(Vec3::new(0.0, 0.0, 20.0));
    let distance = a.min_gap(&b, 10.0);
    assert!((distance - 5.0).abs() < 0.001,
        "MingapStretchyBracelet: distance={}, expected ~5", distance);
}
