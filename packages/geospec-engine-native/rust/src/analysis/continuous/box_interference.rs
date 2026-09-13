//! Intersection of connector-certified complete nominal boxes. Reporting bounds
//! and general OCCT common-volume scalars are not admitted by this predicate.
use super::{domain::DomainBox, exact, ContinuousError, DomainEvidence, ExactScalar, Outcome};
use crate::{backend::brep::SelectedContinuousDomain, codec::Json};
use num_rational::BigRational as Rat;
use num_traits::{One, Signed, Zero};

/// Two DomainBoxes, <=48 retained rational slots, one guarded operation with
/// <=32 8192-bit temporary integer buffers, and <=72 output ExactScalars with
/// 1024-byte decimal capacities. Domain JSON/keys use <=512 fixed slots. This
/// bounds requested capacity for one pair and its source certificate, not RSS;
/// caller prior rows/projections/encoding and borrowed transfers are additional.
pub(crate) const BOX_INTERFERENCE_RESERVATION_BYTES: usize = 48
    * (std::mem::size_of::<Rat>() + 512)
    + 32 * (std::mem::size_of::<num_bigint::BigInt>() + 1024)
    + 72 * (std::mem::size_of::<ExactScalar>() + 2048)
    + 512 * (std::mem::size_of::<Json>() + 64);

pub(crate) struct BoxInterferenceRequest<'a> {
    pub subject: &'a SelectedContinuousDomain,
    pub target: &'a SelectedContinuousDomain,
    pub minimum: f64,
    pub maximum: f64,
}
pub(crate) struct BoxInterferenceEvidence {
    pub volume: ExactScalar,
    pub center: Option<[ExactScalar; 3]>,
    raw_volume: Rat,
    subject: DomainEvidence,
    target: DomainEvidence,
}
impl BoxInterferenceEvidence {
    pub(crate) fn greater_than(&self, other: &Self) -> bool {
        self.raw_volume > other.raw_volume
    }
    pub(crate) fn to_json(&self) -> Json {
        Json::object([
            (
                "profile",
                Json::string("geospec-nominal-complete-box-interference-v1"),
            ),
            (
                "criterion",
                Json::string("maximum-selected-pair-intersection-volume"),
            ),
            (
                "comparison",
                Json::string("inclusive-exact-volume-no-epsilon"),
            ),
            ("volumeUnit", Json::string("mm^3")),
            ("volume", self.volume.to_json()),
            (
                "intersectionCentroid",
                self.center.as_ref().map_or(Json::Null, super::point_json),
            ),
            ("subject", self.subject.to_json()),
            ("target", self.target.to_json()),
        ])
    }
}
pub(crate) fn box_interference(r: BoxInterferenceRequest<'_>) -> Outcome<BoxInterferenceEvidence> {
    match evaluate(r) {
        Ok((positive, evidence)) => Outcome::Decided { positive, evidence },
        Err(reason) => Outcome::Unsupported {
            reason,
            evidence: None,
        },
    }
}
fn stored(value: Rat) -> Result<Rat, ContinuousError> {
    if value.numer().bits() > 2048 || value.denom().bits() > 2048 {
        return Err(ContinuousError::resource(
            "Nominal box intersection exceeds its 2048-bit retained-slot limit.",
        ));
    }
    Ok(value.clone())
}
fn evaluate(
    r: BoxInterferenceRequest<'_>,
) -> Result<(bool, BoxInterferenceEvidence), ContinuousError> {
    let minimum = stored(exact::rational(r.minimum)?)?;
    let maximum = stored(exact::rational(r.maximum)?)?;
    if minimum.is_negative() || maximum.is_negative() || minimum > maximum {
        return Err(ContinuousError::invalid(
            "Box interference needs ordered nonnegative volume limits.",
        ));
    }
    let a = DomainBox::new(r.subject)?;
    let b = DomainBox::new(r.target)?;
    let mut volume = Rat::one();
    let mut center = [Rat::zero(), Rat::zero(), Rat::zero()];
    for (axis, coordinate) in center.iter_mut().enumerate() {
        let lo = std::cmp::max(&a.minimum[axis], &b.minimum[axis]);
        let hi = std::cmp::min(&a.maximum[axis], &b.maximum[axis]);
        let width = stored(exact::subtract(hi, lo)?)?.max(Rat::zero());
        volume = stored(exact::multiply(&volume, &width)?)?;
        *coordinate = stored(exact::midpoint(lo, hi)?)?;
    }
    let positive = volume >= minimum && volume <= maximum;
    let center = if volume.is_zero() {
        None
    } else {
        Some([
            exact::scalar(&center[0])?,
            exact::scalar(&center[1])?,
            exact::scalar(&center[2])?,
        ])
    };
    Ok((
        positive,
        BoxInterferenceEvidence {
            volume: exact::scalar(&volume)?,
            raw_volume: volume,
            center,
            subject: a.evidence()?,
            target: b.evidence()?,
        },
    ))
}

#[cfg(test)]
pub(super) mod nominal_analytic_box_tests {
    use super::*;
    use crate::backend::brep::{ContinuousWallDomain, ContinuousWallShape};
    pub(crate) fn box_domain(
        occurrence: u32,
        lo: [f64; 3],
        hi: [f64; 3],
    ) -> SelectedContinuousDomain {
        SelectedContinuousDomain {
            occurrence,
            domain: ContinuousWallDomain {
                maximum_topology_tolerance_mm: 0.,
                domain: ContinuousWallShape::AxisAlignedBox {
                    corners: std::array::from_fn(|i| {
                        [
                            if i & 4 == 0 { lo[0] } else { hi[0] },
                            if i & 2 == 0 { lo[1] } else { hi[1] },
                            if i & 1 == 0 { lo[2] } else { hi[2] },
                        ]
                    }),
                    face_indices: [1, 2, 3, 4, 5, 6],
                    face_corner_indices: [
                        [0, 1, 3, 2],
                        [4, 6, 7, 5],
                        [0, 4, 5, 1],
                        [2, 3, 7, 6],
                        [0, 2, 6, 4],
                        [1, 5, 7, 3],
                    ],
                    outward_normals: [
                        [-1., 0., 0.],
                        [1., 0., 0.],
                        [0., -1., 0.],
                        [0., 1., 0.],
                        [0., 0., -1.],
                        [0., 0., 1.],
                    ],
                    opposite_face_pairs: [[1, 2], [3, 4], [5, 6]],
                    edge_lengths: std::array::from_fn(|i| hi[i] - lo[i]),
                },
            },
            domain_face_to_occurrence_face: (1..=6).collect(),
            domain_edge_to_occurrence_edge: (1..=12).collect(),
        }
    }
    fn check(
        a: &SelectedContinuousDomain,
        b: &SelectedContinuousDomain,
        min: f64,
        max: f64,
    ) -> (bool, BoxInterferenceEvidence) {
        match box_interference(BoxInterferenceRequest {
            subject: a,
            target: b,
            minimum: min,
            maximum: max,
        }) {
            Outcome::Decided { positive, evidence } => (positive, evidence),
            Outcome::Unsupported { reason, .. } => panic!("{reason:?}"),
        }
    }
    #[test]
    fn original_two_hundred_equality_and_zero_allowance() {
        let a = box_domain(0, [0.; 3], [10.; 3]);
        let b = box_domain(1, [8., 0., 0.], [12., 10., 10.]);
        let (pass, evidence) = check(&a, &b, 200., 200.);
        assert!(pass);
        assert_eq!(evidence.volume.numerator, "200");
        assert_eq!(evidence.volume.denominator, "1");
        assert_eq!(evidence.center.unwrap().map(|s| s.display), [9., 5., 5.]);
        assert!(!check(&a, &b, 0., 0.).0);
    }
    #[test]
    fn positive_sub_epsilon_sliver_touching_disjoint_and_max_pair() {
        let a = box_domain(0, [0.; 3], [1.; 3]);
        let b = box_domain(1, [1. - 2f64.powi(-40), 0., 0.], [2., 1., 1.]);
        let (pass, sliver) = check(&a, &b, 0., 0.);
        assert!(!pass);
        assert_eq!(sliver.volume.display, 2f64.powi(-40));
        for start in [1., 2.] {
            let b = box_domain(1, [start, 0., 0.], [start + 1., 1., 1.]);
            let (pass, e) = check(&a, &b, 0., 0.);
            assert!(pass);
            assert_eq!(e.volume.numerator, "0");
            assert!(e.center.is_none());
        }
        let (_, full) = check(&a, &a, 1., 1.);
        assert!(full.greater_than(&sliver));
    }
    #[test]
    fn invalid_admission_and_guarded_arithmetic_refuse() {
        let a = box_domain(0, [0.; 3], [1.; 3]);
        let mut bad = a.clone();
        bad.domain_face_to_occurrence_face[0] = bad.domain_face_to_occurrence_face[1];
        assert!(matches!(
            box_interference(BoxInterferenceRequest {
                subject: &bad,
                target: &a,
                minimum: 0.,
                maximum: 0.
            }),
            Outcome::Unsupported { .. }
        ));
        assert!(matches!(
            box_interference(BoxInterferenceRequest {
                subject: &a,
                target: &a,
                minimum: f64::NAN,
                maximum: 0.
            }),
            Outcome::Unsupported { .. }
        ));
        assert!(stored(Rat::from_integer(num_bigint::BigInt::one() << 2048)).is_err());
        let tiny = box_domain(0, [0.; 3], [f64::MIN_POSITIVE; 3]);
        assert!(matches!(
            box_interference(BoxInterferenceRequest {
                subject: &tiny,
                target: &tiny,
                minimum: 0.,
                maximum: 0.
            }),
            Outcome::Unsupported { .. }
        ));
    }
}
