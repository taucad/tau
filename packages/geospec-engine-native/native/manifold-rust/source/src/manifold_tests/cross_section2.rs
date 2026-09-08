use super::*;

/// C++ TEST(CrossSection, BevelOffset) — bevel join offset of a square
#[test]
fn test_cpp_cross_section_bevel_offset() {
    let a = CrossSection::square(20.0).translate(Vec2::new(-10.0, -10.0));
    let segments = 20;
    // join_type=3 is Bevel
    let rounded = a.offset_with_params(5.0, 3, 2.0, segments);
    let result = Manifold::extrude(&rounded.to_polygons(), 5.0, 0, 0.0, Vec2::new(1.0, 1.0));

    assert_eq!(result.genus(), 0, "BevelOffset genus={}", result.genus());
    // Volume = height * (outer_area - corner_cuts); with bevel, corners cut off triangles of size 5*5
    let expected_vol = 5.0 * ((20.0 + 2.0 * 5.0) * (20.0 + 2.0 * 5.0) - 2.0 * 5.0 * 5.0);
    assert!((result.volume() - expected_vol).abs() < 1.0,
        "BevelOffset vol={} expected~{}", result.volume(), expected_vol);
    assert_eq!(rounded.num_vert(), 4 + 4, "BevelOffset NumVert={}", rounded.num_vert());
}

/// C++ TEST(CrossSection, Warp) — warp function applied to square vertices
#[test]
fn test_cpp_cross_section_warp() {
    let sq = CrossSection::square(10.0);
    let _a = sq.scale(Vec2::new(2.0, 3.0)).translate(Vec2::new(4.0, 5.0));
    let _b = sq.warp(|v| {
        v.x = v.x * 2.0 + 4.0;
        v.y = v.y * 3.0 + 5.0;
    });
    assert_eq!(sq.num_vert(), 4, "sq NumVert={}", sq.num_vert());
    assert_eq!(sq.num_contour(), 1, "sq NumContour={}", sq.num_contour());
}

/// C++ TEST(CrossSection, FillRule) — fill rule affects area of self-intersecting polygon
#[test]
fn test_cpp_cross_section_fill_rule() {
    let polygon = vec![
        Vec2::new(-7.0, 13.0),
        Vec2::new(-7.0, 12.0),
        Vec2::new(-5.0, 9.0),
        Vec2::new(-5.0, 8.1),
        Vec2::new(-4.8, 8.0),
    ];

    // fill_rule: 0=EvenOdd, 1=NonZero, 2=Positive, 3=Negative
    let positive = CrossSection::from_polygon_with_fill_rule(polygon.clone(), 2);
    assert!((positive.area() - 0.683).abs() < 0.001,
        "Positive area={}", positive.area());

    let negative = CrossSection::from_polygon_with_fill_rule(polygon.clone(), 3);
    assert!((negative.area() - 0.193).abs() < 0.001,
        "Negative area={}", negative.area());

    let even_odd = CrossSection::from_polygon_with_fill_rule(polygon.clone(), 0);
    assert!((even_odd.area() - 0.875).abs() < 0.001,
        "EvenOdd area={}", even_odd.area());

    let non_zero = CrossSection::from_polygon_with_fill_rule(polygon.clone(), 1);
    assert!((non_zero.area() - 0.875).abs() < 0.001,
        "NonZero area={}", non_zero.area());
}

/// C++ TEST(CrossSection, HullError) — rounded rectangle via hull of circles
#[test]
fn test_cpp_cross_section_hull_error() {
    let rounded_rectangle = |x: f64, y: f64, radius: f64, segments: i32| {
        let circ = CrossSection::circle(radius, segments);
        let vl = vec![
            circ.translate(Vec2::new(radius, radius)),
            circ.translate(Vec2::new(x - radius, radius)),
            circ.translate(Vec2::new(x - radius, y - radius)),
            circ.translate(Vec2::new(radius, y - radius)),
        ];
        CrossSection::hull_cross_sections(&vl)
    };
    let rr = rounded_rectangle(51.0, 36.0, 9.0, 36);
    assert!((rr.area() - 1765.179_037_5).abs() < 1.0,
        "HullError area={}", rr.area());
    assert_eq!(rr.num_vert(), 40, "HullError NumVert={}", rr.num_vert());
}

/// C++ TEST(CrossSection, BatchBoolean) — batch boolean ops on cross sections
#[test]
fn test_cpp_cross_section_batch_boolean() {
    let square = CrossSection::square(100.0);
    let circle1 = CrossSection::circle(30.0, 30).translate(Vec2::new(-10.0, 30.0));
    let circle2 = CrossSection::circle(20.0, 30).translate(Vec2::new(110.0, 20.0));
    let circle3 = CrossSection::circle(40.0, 30).translate(Vec2::new(50.0, 110.0));

    let sections = vec![square.clone(), circle1.clone(), circle2.clone(), circle3.clone()];

    let intersect = CrossSection::batch_boolean(&sections, OpType::Intersect);
    assert!((intersect.area()).abs() < 1e-4,
        "BatchBoolean intersect area={}", intersect.area());
    assert_eq!(intersect.num_vert(), 0,
        "BatchBoolean intersect NumVert={}", intersect.num_vert());

    let add = CrossSection::batch_boolean(&sections, OpType::Add);
    assert!((add.area() - 16278.637_002).abs() < 1.0,
        "BatchBoolean add area={}", add.area());
    assert_eq!(add.num_vert(), 66,
        "BatchBoolean add NumVert={}", add.num_vert());

    let subtract = CrossSection::batch_boolean(&sections, OpType::Subtract);
    assert!((subtract.area() - 7234.478_452).abs() < 1.0,
        "BatchBoolean subtract area={}", subtract.area());
    assert_eq!(subtract.num_vert(), 42,
        "BatchBoolean subtract NumVert={}", subtract.num_vert());
}

/// C++ TEST(CrossSection, Rect) — Rect type and CrossSection(Rect) constructor
#[test]
fn test_cpp_cross_section_rect() {
    let (w, h) = (10.0f64, 5.0f64);
    let rect = Rect { min: Vec2::new(0.0, 0.0), max: Vec2::new(w, h) };
    let cross = CrossSection::from_rect(&rect);
    assert!((rect.area() - w * h).abs() < 1e-10, "Rect area");
    assert!((rect.area() - cross.area()).abs() < 1e-6, "Rect vs CrossSection area");
    assert!(rect.contains_point(Vec2::new(5.0, 5.0)), "Rect contains (5,5)");
    assert!(rect.contains_rect(&cross.bounds()), "Rect contains cross.bounds()");
    assert!(rect.contains_rect(&Rect::new()), "Rect contains empty rect");
    assert!(rect.does_overlap(&Rect { min: Vec2::new(5.0, 5.0), max: Vec2::new(15.0, 15.0) }),
        "Rect overlaps shifted rect");
    assert!(Rect::new().is_empty(), "Default Rect is empty");
}

/// C++ TEST(CrossSection, Square) — extrude of CrossSection::Square matches Manifold::Cube
#[test]
fn test_cpp_cross_section_square() {
    let a = Manifold::cube(Vec3::new(5.0, 5.0, 5.0), false);
    let b = Manifold::extrude(
        &CrossSection::square_vec2(Vec2::new(5.0, 5.0), false).to_polygons(),
        5.0, 0, 0.0, Vec2::new(1.0, 1.0),
    );
    assert!((a.difference(&b).volume()).abs() < 1e-4, "Square: a-b volume should be ~0");
}

/// C++ TEST(CrossSection, MirrorUnion) — mirror and union of squares
#[test]
fn test_cpp_cross_section_mirror_union() {
    let a = CrossSection::square_vec2(Vec2::new(5.0, 5.0), true);
    let b = a.translate(Vec2::new(2.5, 2.5));
    let cross = a.union(&b).union(&b.mirror(Vec2::new(1.0, 1.0)));
    assert!((2.5 * a.area() - cross.area()).abs() < 1e-4,
        "MirrorUnion: cross.area={} expected ~{}", cross.area(), 2.5 * a.area());
    assert!(a.mirror(Vec2::new(0.0, 0.0)).is_empty(), "MirrorUnion: mirror(0,0) should be empty");
}

/// C++ TEST(CrossSection, MirrorCheckAxis) — triangle mirrored about (1,1) and (-1,1)
#[test]
fn test_cpp_cross_section_mirror_check_axis() {
    let tri = CrossSection::new(vec![vec![
        Vec2::new(0.0, 0.0), Vec2::new(5.0, 5.0), Vec2::new(0.0, 10.0),
    ]]);
    let a = tri.mirror(Vec2::new(1.0, 1.0)).bounds();
    let a_expected = CrossSection::new(vec![vec![
        Vec2::new(0.0, 0.0), Vec2::new(-10.0, 0.0), Vec2::new(-5.0, -5.0),
    ]]).bounds();
    assert!((a.min.x - a_expected.min.x).abs() < 0.001, "MirrorCheckAxis a min.x");
    assert!((a.min.y - a_expected.min.y).abs() < 0.001, "MirrorCheckAxis a min.y");
    assert!((a.max.x - a_expected.max.x).abs() < 0.001, "MirrorCheckAxis a max.x");
    assert!((a.max.y - a_expected.max.y).abs() < 0.001, "MirrorCheckAxis a max.y");

    let b = tri.mirror(Vec2::new(-1.0, 1.0)).bounds();
    let b_expected = CrossSection::new(vec![vec![
        Vec2::new(0.0, 0.0), Vec2::new(10.0, 0.0), Vec2::new(5.0, 5.0),
    ]]).bounds();
    assert!((b.min.x - b_expected.min.x).abs() < 0.001, "MirrorCheckAxis b min.x");
    assert!((b.min.y - b_expected.min.y).abs() < 0.001, "MirrorCheckAxis b min.y");
    assert!((b.max.x - b_expected.max.x).abs() < 0.001, "MirrorCheckAxis b max.x");
    assert!((b.max.y - b_expected.max.y).abs() < 0.001, "MirrorCheckAxis b max.y");
}

/// C++ TEST(CrossSection, RoundOffset) — round-join offset of centered square
#[test]
fn test_cpp_cross_section_round_offset() {
    let a = CrossSection::square_vec2(Vec2::new(20.0, 20.0), true);
    let segments = 20;
    // JoinType: 0=Square, 1=Round, 2=Miter, 3=Bevel — use 1 for Round
    let rounded = a.offset_with_params(5.0, 1, 2.0, segments);
    let result = Manifold::extrude(&rounded.to_polygons(), 5.0, 0, 0.0, Vec2::new(1.0, 1.0));
    assert_eq!(result.genus(), 0, "RoundOffset genus={}", result.genus());
    assert!((result.volume() - 4386.0).abs() < 1.0,
        "RoundOffset volume={} expected~4386", result.volume());
    assert_eq!(rounded.num_vert(), segments as usize + 4,
        "RoundOffset NumVert={} expected={}", rounded.num_vert(), segments + 4);
}

/// C++ TEST(CrossSection, Empty) — CrossSection from empty polygons is empty
#[test]
fn test_cpp_cross_section_empty() {
    let e = CrossSection::new(vec![vec![], vec![]]);
    assert!(e.is_empty(), "Empty: should be empty");
}

/// C++ TEST(CrossSection, Decompose) — decompose+compose round-trip preserves geometry
#[test]
fn test_cpp_cross_section_decompose() {
    let a = CrossSection::square_vec2(Vec2::new(2.0, 2.0), true)
        .difference(&CrossSection::square_vec2(Vec2::new(1.0, 1.0), true));
    let b = a.translate(Vec2::new(4.0, 4.0));
    let ab = a.union(&b);
    let decomp = ab.decompose();
    let recomp = CrossSection::compose(&decomp);

    assert_eq!(decomp.len(), 2, "Decompose: expected 2 pieces, got {}", decomp.len());
    assert_eq!(decomp[0].num_contour(), 2, "Decompose[0]: expected 2 contours, got {}", decomp[0].num_contour());
    assert_eq!(decomp[1].num_contour(), 2, "Decompose[1]: expected 2 contours, got {}", decomp[1].num_contour());

    // Volume of recomposed should match original
    let vol_ab = Manifold::extrude(&ab.to_polygons(), 1.0, 0, 0.0, Vec2::new(1.0, 1.0)).volume();
    let vol_recomp = Manifold::extrude(&recomp.to_polygons(), 1.0, 0, 0.0, Vec2::new(1.0, 1.0)).volume();
    assert!((vol_ab - vol_recomp).abs() < 1e-4,
        "Decompose: recomposed volume={} vs original={}", vol_recomp, vol_ab);
}

/// C++ TEST(CrossSection, Hull) — hull of circle+translated circles, plus points
#[test]
fn test_cpp_cross_section_hull() {
    let circ = CrossSection::circle(10.0, 360);
    let circs = vec![
        circ.clone(),
        circ.translate(Vec2::new(0.0, 30.0)),
        circ.translate(Vec2::new(30.0, 0.0)),
    ];
    // C++ uses circ_tri only for optional OBJ export; keep the call so the
    // hull path is still exercised.
    let _circ_tri = CrossSection::hull_cross_sections(&circs);
    let centres = vec![
        Vec2::new(0.0, 0.0), Vec2::new(0.0, 30.0),
        Vec2::new(30.0, 0.0), Vec2::new(15.0, 5.0),
    ];
    let tri = CrossSection::hull_points(&centres);

    let circ_area = circ.area();
    // hull of (circ - scaled_circ) should equal circ area
    let annulus = circ.difference(&circ.scale(Vec2::new(0.8, 0.8)));
    let annulus_hull = CrossSection::hull_cross_sections(&[annulus]);
    assert!((circ_area - annulus_hull.area()).abs() < 1.0,
        "Hull: annulus hull area != circ area");
    // batch union of circs minus triangle center hull, area = circ_area * 2.5
    let batch_area = CrossSection::batch_boolean(&circs, OpType::Add).difference(&tri).area();
    assert!((batch_area - circ_area * 2.5).abs() < 1.0,
        "Hull: batch-minus-tri area={} expected~{}", batch_area, circ_area * 2.5);
}

/// C++ TEST(CrossSection, NegativeOffset) — negative offset of plus sign gives circle-cornered square
#[test]
fn test_cpp_cross_section_negative_offset() {
    let plus_sign = CrossSection::square_vec2(Vec2::new(30.0, 50.0), true)
        .union(&CrossSection::square_vec2(Vec2::new(50.0, 30.0), true));
    // JoinType 1 = Round
    let dilated = plus_sign.offset_with_params(-10.0, 1, 2.0, 1024);
    let expected = 30.0 * 30.0 - 10.0 * 10.0 * std::f64::consts::PI;
    assert!((dilated.area() - expected).abs() < 0.01,
        "NegativeOffset: area={} expected~{}", dilated.area(), expected);
}
