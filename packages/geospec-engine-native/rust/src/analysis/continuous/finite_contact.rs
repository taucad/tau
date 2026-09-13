//! Exact existential finite contact on connector-admitted nominal trims.
//! Candidate construction is not a distance oracle: every positive candidate
//! is checked exactly; exhaustion never produces a negative verdict.
use super::{
    exact,
    nominal_analytic::{add, div, dot, in_angle_band, mul, rat, square, sub, vector},
    ContinuousError, ExactScalar, Outcome,
};
use crate::{
    backend::brep::{FiniteContactCircle, FiniteContactFace},
    codec::Json,
};
use num_bigint::BigInt;
use num_rational::BigRational as Rat;
use num_traits::{One, Signed, Zero};

type Point = [Rat; 3];
#[cfg(test)]
mod finite_contact_tests {
    use super::*;
    fn plane(z: f64, reversed: bool) -> FiniteContactFace {
        let mut f = FiniteContactFace {
            source_face_entity: 1,
            private_query_face: 1,
            source_route_count: 1,
            normal: [0., 0., if reversed { -1. } else { 1. }],
            origin: [0., 0., z],
            vertex_count: 4,
            vertices: [
                [-10., -10., z],
                [10., -10., z],
                [10., 10., z],
                [-10., 10., z],
                [0.; 3],
                [0.; 3],
                [0.; 3],
                [0.; 3],
            ],
            wire_count: 1,
            edge_use_count: 4,
            ..Default::default()
        };
        f.source_route[0] = 2;
        for i in 0..4 {
            f.lines[i] = crate::backend::brep::FiniteContactLine {
                edge_index: i as u32 + 1,
                start_vertex: i as u32 + 1,
                end_vertex: ((i + 1) % 4) as u32 + 1,
                origin: f.vertices[i],
                direction: std::array::from_fn(|k| {
                    (f.vertices[(i + 1) % 4][k] - f.vertices[i][k]) / 20.
                }),
                range: [0., 20.],
                ..Default::default()
            };
        }
        f
    }
    fn circle(radius: f64, outer: u32) -> FiniteContactCircle {
        FiniteContactCircle {
            edge_index: 1,
            outer,
            radius,
            axis: [0., 0., 1.],
            period: std::f64::consts::TAU,
            range: [0., std::f64::consts::TAU],
            ..Default::default()
        }
    }
    fn decide(a: &FiniteContactFace, b: &FiniteContactFace) -> Outcome<FiniteContactEvidence> {
        finite_contact(FiniteContactRequest {
            subject: a,
            target: b,
            tolerance: 0.02,
            angular_tolerance_degrees: 0.5,
        })
    }
    #[test]
    fn finite_contact_planes_gaps_and_invalid_support() {
        let a = plane(0., false);
        let b = plane(0., true);
        assert!(matches!(
            decide(&a, &b),
            Outcome::Decided { positive: true, .. }
        ));
        assert!(matches!(
            decide(&a, &plane(0.3, true)),
            Outcome::Decided {
                positive: false,
                ..
            }
        ));
        assert!(matches!(
            decide(&a, &plane(0., false)),
            Outcome::Decided {
                positive: false,
                ..
            }
        ));
        let mut invalid = b;
        invalid.normal = [0.; 3];
        assert!(matches!(decide(&a, &invalid), Outcome::Unsupported { .. }));
    }
    #[test]
    fn finite_contact_holes_annuli_and_disjoint_supports() {
        let mut a = plane(0., false);
        a.circle_count = 1;
        a.circles[0] = circle(4., 0);
        a.wire_count = 2;
        a.edge_use_count = 5;
        assert!(!inside(&a, &vector([0.; 3]).unwrap()).unwrap());
        assert!(matches!(
            decide(&a, &plane(0., true)),
            Outcome::Decided { positive: true, .. }
        ));
        let mut b = plane(0., true);
        for v in &mut b.vertices[..4] {
            v[0] += 30.;
        }
        assert!(matches!(decide(&a, &b), Outcome::Unsupported { .. }));
        let mut ring = plane(0., true);
        ring.vertex_count = 0;
        ring.circle_count = 2;
        ring.wire_count = 2;
        ring.edge_use_count = 2;
        ring.circles[0] = circle(9., 1);
        ring.circles[1] = circle(5., 0);
        ring.circles[1].edge_index = 2;
        assert!(matches!(
            decide(&a, &ring),
            Outcome::Decided { positive: true, .. }
        ));
        ring.circles[1].radius = 10.;
        assert!(matches!(decide(&a, &ring), Outcome::Unsupported { .. }));
    }
    #[test]
    fn finite_contact_boundary_touch_and_attached_rims() {
        let a = plane(0., false);
        let mut b = plane(0., true);
        for v in &mut b.vertices[..4] {
            v[0] += 20.;
            v[1] += 20.;
        }
        assert!(matches!(
            decide(&a, &b),
            Outcome::Decided { positive: true, .. }
        ));
        let mut c = plane(0., false);
        c.kind = 1;
        c.vertex_count = 0;
        c.circle_count = 1;
        c.circles[0] = circle(13., 1);
        let mut d = c;
        d.occurrence = 1;
        d.circles[0].axis = [0., 0., -2.];
        let Outcome::Decided {
            positive: true,
            evidence,
        } = decide(&c, &d)
        else {
            panic!("attached rim must pass")
        };
        assert!(evidence.point.is_none());
        d.source_face_entity = 0;
        assert!(matches!(decide(&c, &d), Outcome::Unsupported { .. }));
    }
    #[test]
    fn finite_contact_placement_raw_direction_and_resource_controls() {
        let transform = |mut f: FiniteContactFace| {
            let placed = |p: [f64; 3]| [p[2] + 7., p[0] - 3., p[1] + 11.];
            f.origin = placed(f.origin);
            f.normal = [7. * f.normal[2], 7. * f.normal[0], 7. * f.normal[1]];
            for i in 0..4 {
                f.vertices[i] = placed(f.vertices[i]);
                f.lines[i].origin = placed(f.lines[i].origin);
                let d = f.lines[i].direction;
                f.lines[i].direction = [d[2], d[0], d[1]];
            }
            f
        };
        let a = transform(plane(0., false));
        let b = transform(plane(0., true));
        assert!(matches!(
            decide(&a, &b),
            Outcome::Decided { positive: true, .. }
        ));
        let mut broken = b;
        broken.lines[0].end_vertex = 99;
        assert!(matches!(decide(&a, &broken), Outcome::Unsupported { .. }));
        let mut enormous = b;
        enormous.normal = [f64::MAX, f64::MAX, 0.];
        assert!(matches!(decide(&a, &enormous), Outcome::Unsupported { .. }));
        assert!(
            FINITE_CONTACT_RESERVATION_BYTES
                + 2 * FINITE_CONTACT_OUTPUT_BYTES
                + 8 * std::mem::size_of::<FiniteContactFace>()
                < 256 * 1024
        );
    }
}
/// Requested payload capacity, not RSS/allocator/OCCT machine-stack security.
/// At most 96 simultaneous rational slots: two supports/projections (30),
/// candidate/membership/polygon checks (42), nested arithmetic (24). Each
/// retained numerator/denominator is guarded at 2048 bits BEFORE the next
/// operation; shared helpers preflight <=8192-bit intermediates. 32 BigInt
/// temporary buffers cover pinned num-bigint 0.4.6 / num-rational 0.4.2
/// multiply/divide/GCD capacity. No rational arrays grow with boundary count.
/// Four scalar outputs have at most eight 617-digit strings; 64 fixed JSON
/// nodes/key buffers cover one projection. Borrowed connector inputs, prior
/// results and caller serialization copies are reserved separately by context.
pub(crate) const FINITE_CONTACT_RESERVATION_BYTES: usize = 96 * (std::mem::size_of::<Rat>() + 512)
    + 32 * (std::mem::size_of::<BigInt>() + 1024)
    + 4 * (std::mem::size_of::<ExactScalar>() + 2048)
    + 64 * (std::mem::size_of::<Json>() + 128);
pub(crate) const FINITE_CONTACT_OUTPUT_BYTES: usize =
    64 * (std::mem::size_of::<Json>() + 128) + 8 * 1024;
/// <=2*8*8 polygon/holes checks, <=2*208*2*16 candidate edge checks
/// and <=64 circle pairs, plus fixed angular work; bounded independent of truth.
pub(crate) const FINITE_CONTACT_UNITS: u64 = 32768;

pub(crate) struct FiniteContactRequest<'a> {
    pub subject: &'a FiniteContactFace,
    pub target: &'a FiniteContactFace,
    pub tolerance: f64,
    pub angular_tolerance_degrees: f64,
}
#[derive(Debug)]
pub(crate) struct FiniteContactEvidence {
    pub method: &'static str,
    pub distance_squared: ExactScalar,
    pub opposition_cosine_squared: Option<ExactScalar>,
    pub opposition_dot_negative: Option<bool>,
    /// Rational point on the admitted nominal subject plane. The target point
    /// is its exact orthogonal projection; circle evidence instead certifies
    /// nonempty sets and intentionally claims no exact point coordinates.
    pub point: Option<[ExactScalar; 3]>,
}
impl FiniteContactEvidence {
    pub(crate) fn to_json(&self) -> Json {
        Json::object([
            ("profile", Json::string("geospec-nominal-finite-contact-v1")),
            ("method", Json::string(self.method)),
            ("distanceSquaredBound", self.distance_squared.to_json()),
            (
                "oppositionCosineSquared",
                self.opposition_cosine_squared
                    .as_ref()
                    .map_or(Json::Null, ExactScalar::to_json),
            ),
            (
                "oppositionDotNegative",
                self.opposition_dot_negative.map_or(Json::Null, Json::Bool),
            ),
            ("unit", Json::string("mm^2")),
            (
                "subjectPoint",
                self.point.as_ref().map_or(Json::Null, |p| {
                    Json::Array(p.iter().map(ExactScalar::to_json).collect())
                }),
            ),
            (
                "pointRole",
                Json::string(if self.point.is_some() {
                    "exact-nominal-plane-point; target=orthogonal-projection"
                } else if self.method == "attached-full-circle-existence-bound" {
                    "nonempty-attached-circle-sets; no point claim"
                } else {
                    "rejecting support/orientation evidence; no point claim"
                }),
            ),
            ("displayRole", Json::string("diagnostic-only")),
        ])
    }
}
fn delta(a: &Point, b: &Point) -> Result<Point, ContinuousError> {
    Ok([sub(&a[0], &b[0])?, sub(&a[1], &b[1])?, sub(&a[2], &b[2])?])
}
fn cross(a: &Point, b: &Point) -> Result<Point, ContinuousError> {
    Ok([
        sub(&mul(&a[1], &b[2])?, &mul(&a[2], &b[1])?)?,
        sub(&mul(&a[2], &b[0])?, &mul(&a[0], &b[2])?)?,
        sub(&mul(&a[0], &b[1])?, &mul(&a[1], &b[0])?)?,
    ])
}
fn norm(a: &Point) -> Result<Rat, ContinuousError> {
    dot(a, a)
}
fn project(p: &Point, f: &FiniteContactFace) -> Result<Point, ContinuousError> {
    let n = vector(f.normal)?;
    let o = vector(f.origin)?;
    let k = div(&dot(&delta(p, &o)?, &n)?, &norm(&n)?)?;
    Ok([
        sub(&p[0], &mul(&k, &n[0])?)?,
        sub(&p[1], &mul(&k, &n[1])?)?,
        sub(&p[2], &mul(&k, &n[2])?)?,
    ])
}
fn vertex(f: &FiniteContactFace, i: usize) -> Result<Point, ContinuousError> {
    project(&vector(f.vertices[i])?, f)
}
fn center(f: &FiniteContactFace, c: &FiniteContactCircle) -> Result<Point, ContinuousError> {
    project(&vector(c.center)?, f)
}
fn side(f: &FiniteContactFace, i: usize, p: &Point) -> Result<Rat, ContinuousError> {
    let a = vertex(f, i)?;
    let b = vertex(f, (i + 1) % f.vertex_count as usize)?;
    dot(&cross(&delta(&b, &a)?, &delta(p, &a)?)?, &vector(f.normal)?)
}
fn sense(f: &FiniteContactFace) -> Result<bool, ContinuousError> {
    let s = side(f, 0, &vertex(f, 2)?)?;
    if s.is_zero() {
        return Err(ContinuousError::unsupported(
            "Finite polygon has a degenerate turn.",
        ));
    }
    Ok(s.is_positive())
}
fn inside(f: &FiniteContactFace, p: &Point) -> Result<bool, ContinuousError> {
    if f.vertex_count > 0 {
        let sign = sense(f)?;
        for i in 0..f.vertex_count as usize {
            let s = side(f, i, p)?;
            if !s.is_zero() && s.is_positive() != sign {
                return Ok(false);
            }
        }
    }
    for c in &f.circles[..f.circle_count as usize] {
        let d = norm(&delta(p, &center(f, c)?)?)?;
        let r = square(&rat(c.radius)?)?;
        if if c.outer == 1 { d > r } else { d < r } {
            return Ok(false);
        }
    }
    Ok(true)
}
fn attached(f: &FiniteContactFace) -> Result<(), ContinuousError> {
    if f.source_face_entity == 0
        || f.private_query_face == 0
        || !(1..=32).contains(&f.source_route_count)
        || f.source_route[..f.source_route_count as usize].contains(&0)
        || f.source_route[f.source_route_count as usize..]
            .iter()
            .any(|x| *x != 0)
        || f.source_same_sense > 1
        || f.transferred_reversed > 1
        || f.kind > 1
        || f.vertex_count > 8
        || f.circle_count > 8
        || f.wire_count == 0
        || f.wire_count > 9
        || f.edge_use_count == 0
        || f.edge_use_count > 24
    {
        return Err(ContinuousError::unsupported(
            "Finite contact has incomplete source/trim identity.",
        ));
    }
    if norm(&vector(f.normal)?)?.is_zero() {
        return Err(ContinuousError::invalid("Finite support has zero normal."));
    }
    for (v, l) in [(f.attachment_residual, f.tolerance)] {
        if rat(v)?.is_negative() || rat(l)?.is_negative() || v > l {
            return Err(ContinuousError::unsupported(
                "Finite attachment residual exceeds its premise.",
            ));
        }
    }
    for c in &f.circles[..f.circle_count as usize] {
        if c.edge_index == 0
            || c.outer > 1
            || rat(c.radius)? <= Rat::zero()
            || norm(&vector(c.axis)?)?.is_zero()
            || !c.range.iter().all(|x| x.is_finite())
            || c.range[0] >= c.range[1]
            || rat(c.period)? <= Rat::zero()
            || rat(c.attachment_residual)?.is_negative()
            || rat(c.tolerance)?.is_negative()
            || c.attachment_residual > c.tolerance
        {
            return Err(ContinuousError::unsupported(
                "Full circular boundary has incomplete attachment evidence.",
            ));
        }
        vector(c.center)?;
    }
    if f.kind != 0 {
        return Ok(());
    }
    let circles = &f.circles[..f.circle_count as usize];
    let outer = circles.iter().filter(|c| c.outer == 1).count();
    if !((f.vertex_count >= 3 && outer == 0) || (f.vertex_count == 0 && outer == 1))
        || f.wire_count != circles.len() as u32 + u32::from(f.vertex_count > 0)
    {
        return Err(ContinuousError::unsupported(
            "Finite plane needs one convex outer region and complete circular holes.",
        ));
    }
    if f.vertex_count > 0 {
        if f.edge_use_count != f.vertex_count + f.circle_count {
            return Err(ContinuousError::unsupported(
                "Finite polygon edge-use inventory is incomplete.",
            ));
        }
        for (i, line) in f.lines[..f.vertex_count as usize].iter().enumerate() {
            let next = &f.lines[(i + 1) % f.vertex_count as usize];
            if line.edge_index == 0
                || line.start_vertex == 0
                || line.end_vertex != next.start_vertex
                || line.reversed > 1
                || !line.range.iter().all(|v| v.is_finite())
                || line.range[0] >= line.range[1]
                || norm(&vector(line.direction)?)?.is_zero()
                || [
                    line.attachment_residual,
                    line.edge_tolerance,
                    line.vertex_tolerances[0],
                    line.vertex_tolerances[1],
                    f.face_tolerance,
                ]
                .iter()
                .any(|v| !v.is_finite() || *v < 0.)
                || line.attachment_residual
                    > line
                        .edge_tolerance
                        .max(line.vertex_tolerances[0])
                        .max(line.vertex_tolerances[1])
                        .max(f.face_tolerance)
            {
                return Err(ContinuousError::unsupported(
                    "Finite line boundary lacks complete directed attachment evidence.",
                ));
            }
            vector(line.origin)?;
        }
        let sign = sense(f)?;
        for i in 0..f.vertex_count as usize {
            for j in 0..f.vertex_count as usize {
                if j == i || j == (i + 1) % f.vertex_count as usize {
                    continue;
                }
                let s = side(f, i, &vertex(f, j)?)?;
                if s.is_zero() || s.is_positive() != sign {
                    return Err(ContinuousError::unsupported(
                        "Finite polygon is not strictly convex.",
                    ));
                }
            }
        }
    }
    // Qualify the nominal hole topology as well as the transferred topology.
    for (i, c) in circles.iter().enumerate().filter(|(_, c)| c.outer == 0) {
        let cp = center(f, c)?;
        let cr = rat(c.radius)?;
        if f.vertex_count > 0 {
            let sign = sense(f)?;
            for j in 0..f.vertex_count as usize {
                let s = side(f, j, &cp)?;
                let e = delta(
                    &vertex(f, (j + 1) % f.vertex_count as usize)?,
                    &vertex(f, j)?,
                )?;
                if s.is_positive() != sign
                    || square(&s)?
                        <= mul(&square(&cr)?, &mul(&norm(&e)?, &norm(&vector(f.normal)?)?)?)?
                {
                    return Err(ContinuousError::unsupported(
                        "A circular hole is not strictly inside its polygon.",
                    ));
                }
            }
        }
        for (j, d) in circles.iter().enumerate() {
            if i == j {
                continue;
            }
            let dd = norm(&delta(&cp, &center(f, d)?)?)?;
            let rr = if d.outer == 1 {
                sub(&rat(d.radius)?, &cr)?
            } else {
                add(&rat(d.radius)?, &cr)?
            };
            if rr <= Rat::zero()
                || (if d.outer == 1 {
                    dd >= square(&rr)?
                } else {
                    dd <= square(&rr)?
                })
            {
                return Err(ContinuousError::unsupported(
                    "Nominal circular boundaries intersect or are ambiguously nested.",
                ));
            }
        }
    }
    Ok(())
}
fn evidence(
    method: &'static str,
    d: &Rat,
    p: Option<&Point>,
) -> Result<FiniteContactEvidence, ContinuousError> {
    Ok(FiniteContactEvidence {
        method,
        distance_squared: exact::scalar(d)?,
        opposition_cosine_squared: None,
        opposition_dot_negative: None,
        point: match p {
            Some(p) => Some([
                exact::scalar(&p[0])?,
                exact::scalar(&p[1])?,
                exact::scalar(&p[2])?,
            ]),
            None => None,
        },
    })
}
fn candidate(
    a: &FiniteContactFace,
    b: &FiniteContactFace,
    raw: [f64; 3],
    limit: &Rat,
) -> Result<Option<FiniteContactEvidence>, ContinuousError> {
    if !raw.iter().all(|v| v.is_finite()) {
        return Ok(None);
    }
    let p = project(&vector(raw)?, a)?;
    let q = project(&p, b)?;
    if inside(a, &p)? && inside(b, &q)? {
        let d = norm(&delta(&p, &q)?)?;
        if d <= *limit {
            return Ok(Some(evidence(
                "exact-finite-plane-point-pair",
                &d,
                Some(&p),
            )?));
        }
    }
    Ok(None)
}
pub(crate) fn finite_contact(r: FiniteContactRequest<'_>) -> Outcome<FiniteContactEvidence> {
    match evaluate(r) {
        Ok((positive, evidence)) => Outcome::Decided { positive, evidence },
        Err(reason) => Outcome::Unsupported {
            reason,
            evidence: None,
        },
    }
}
fn evaluate(r: FiniteContactRequest<'_>) -> Result<(bool, FiniteContactEvidence), ContinuousError> {
    let a = r.subject;
    let b = r.target;
    attached(a)?;
    attached(b)?;
    let tol = rat(r.tolerance)?;
    let angular = rat(r.angular_tolerance_degrees)?;
    if tol.is_negative() || angular.is_negative() {
        return Err(ContinuousError::invalid(
            "Contact tolerances must be nonnegative.",
        ));
    }
    let limit = square(&tol)?;
    if a.kind == 0 && b.kind == 0 {
        let an = vector(a.normal)?;
        let bn = vector(b.normal)?;
        let ab = dot(&an, &bn)?;
        let q = div(&square(&ab)?, &mul(&norm(&an)?, &norm(&bn)?)?)?;
        if angular > rat(90.)? {
            return Err(ContinuousError::unsupported(
                "Finite planar seating supports opposition tolerances through 90 degrees.",
            ));
        }
        if ab.is_positive() || !in_angle_band(&q, &Rat::zero(), &angular)? {
            let mut e = evidence("exact-normal-opposition-rejection", &Rat::zero(), None)?;
            e.opposition_cosine_squared = Some(exact::scalar(&q)?);
            e.opposition_dot_negative = Some(ab.is_negative());
            return Ok((false, e));
        }
        if q == Rat::one() {
            let gap = div(
                &square(&dot(&delta(&vector(b.origin)?, &vector(a.origin)?)?, &an)?)?,
                &norm(&an)?,
            )?;
            if gap > limit {
                return Ok((
                    false,
                    evidence("exact-parallel-support-lower-bound", &gap, None)?,
                ));
            }
        }
        for f in [a, b] {
            // Finite feature-derived candidates; never a sampled false verdict.
            let mut centroid = [0.; 3];
            if f.vertex_count > 0 {
                for v in &f.vertices[..f.vertex_count as usize] {
                    for k in 0..3 {
                        centroid[k] += v[k] / f.vertex_count as f64;
                    }
                }
                if let Some(e) = candidate(a, b, centroid, &limit)? {
                    return Ok((true, e));
                }
                for v in &f.vertices[..f.vertex_count as usize] {
                    for weight in [0., 0.5] {
                        let p =
                            std::array::from_fn(|k| v[k] * (1. - weight) + centroid[k] * weight);
                        if let Some(e) = candidate(a, b, p, &limit)? {
                            return Ok((true, e));
                        }
                    }
                }
            }
            for c in &f.circles[..f.circle_count as usize] {
                // Candidate-only normalized generator. Exact projection and
                // squared-radius tests below establish membership independently.
                let n = f.normal;
                let nn = n.iter().map(|x| x * x).sum::<f64>();
                for axis in 0..3 {
                    let mut u = std::array::from_fn::<_, 3, _>(|k| {
                        if k == axis {
                            1. - n[k] * n[axis] / nn
                        } else {
                            -n[k] * n[axis] / nn
                        }
                    });
                    let length = u.iter().map(|x| x * x).sum::<f64>().sqrt();
                    if !length.is_finite() || length == 0. {
                        continue;
                    }
                    for x in &mut u {
                        *x /= length;
                    }
                    for fraction in [0.5, 0.75, 1., 1.25] {
                        for sign in [-1., 1.] {
                            let p = std::array::from_fn(|k| {
                                c.center[k] + u[k] * c.radius * fraction * sign
                            });
                            if let Some(e) = candidate(a, b, p, &limit)? {
                                return Ok((true, e));
                            }
                        }
                    }
                }
            }
        }
    } else if a.kind == 1 && b.kind == 1 {
        for ca in &a.circles[..a.circle_count as usize] {
            for cb in &b.circles[..b.circle_count as usize] {
                let aa = vector(ca.axis)?;
                let bb = vector(cb.axis)?;
                if !norm(&cross(&aa, &bb)?)?.is_zero() {
                    continue;
                }
                let dc = norm(&delta(&vector(ca.center)?, &vector(cb.center)?)?)?;
                let dr = square(&sub(&rat(ca.radius)?, &rat(cb.radius)?)?)?;
                // Choose corresponding radial directions on the two complete
                // circles. (|center gap|+|radius gap|)^2 <= 2*(dc+dr).
                let bound = mul(&rat(2.)?, &add(&dc, &dr)?)?;
                if bound <= limit {
                    return Ok((
                        true,
                        evidence("attached-full-circle-existence-bound", &bound, None)?,
                    ));
                }
            }
        }
    }
    Err(ContinuousError::unsupported(
        "No exact finite contact witness or sound rejecting bound was established.",
    ))
}
