use std::cmp::Ordering;

use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{ToPrimitive, Zero};

use crate::{analysis::node24_hypot3, backend::brep::SelectedContinuousDomain, codec::Json};

use super::{
    domain::{scalar_point, DomainBox},
    exact, point_json, ContinuousError, DomainEvidence, ExactScalar, Outcome, MAX_INTEGER_BITS,
    REPRESENTATION,
};

pub(crate) const CLEARANCE_PAIR_UNITS: u64 = 1;
pub(crate) const CLEARANCE_MAX_OWNED_BYTES: usize = 256 * 1024;

const PROFILE: &str = "geospec-nominal-box-clearance-v1";
const ASSURANCE: &str = "exact-nominal-closed-box";
const COMPARISON: &str = "inclusive-exact-squared-distance";
const ENDPOINT_CONVENTION: &str = "closed-solid";

pub(crate) struct ClearanceRequest<'a> {
    pub subject: &'a SelectedContinuousDomain,
    pub target: &'a SelectedContinuousDomain,
    pub minimum: Option<f64>,
    pub maximum: Option<f64>,
    pub tolerance: f64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ExactRatio {
    numerator: String,
    denominator: String,
}

impl ExactRatio {
    pub(super) fn new(value: &BigRational) -> Result<Self, ContinuousError> {
        exact::checked(value.clone())?;
        Ok(Self {
            numerator: value.numer().to_string(),
            denominator: value.denom().to_string(),
        })
    }

    pub(super) fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(self.numerator.capacity())
            .saturating_add(self.denominator.capacity())
    }

    pub(super) fn to_json(&self) -> Json {
        Json::object([
            ("denominator", Json::string(&self.denominator)),
            ("numerator", Json::string(&self.numerator)),
        ])
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ClearanceEvidence {
    pub distance: f64,
    pub below_minimum: bool,
    pub diagnostic_point: [f64; 3],
    subject: DomainEvidence,
    target: DomainEvidence,
    closest_points: [[ExactScalar; 3]; 2],
    squared_distance: ExactRatio,
    effective_minimum: Option<ExactRatio>,
    effective_maximum: Option<ExactRatio>,
}

impl ClearanceEvidence {
    pub(crate) fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(self.subject.owned_bytes())
            .saturating_add(self.target.owned_bytes())
            .saturating_add(
                self.closest_points
                    .iter()
                    .flatten()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(self.squared_distance.owned_bytes())
            .saturating_add(
                self.effective_minimum
                    .as_ref()
                    .map_or(0, ExactRatio::owned_bytes),
            )
            .saturating_add(
                self.effective_maximum
                    .as_ref()
                    .map_or(0, ExactRatio::owned_bytes),
            )
    }

    pub(crate) fn to_json(&self) -> Json {
        let mut fields = vec![
            ("profile".into(), Json::string(PROFILE)),
            ("representation".into(), Json::string(REPRESENTATION)),
            ("assurance".into(), Json::string(ASSURANCE)),
            ("subject".into(), self.subject.to_json()),
            ("target".into(), self.target.to_json()),
            (
                "closestPoints".into(),
                Json::Array(self.closest_points.iter().map(point_json).collect()),
            ),
            ("squaredDistance".into(), self.squared_distance.to_json()),
        ];
        if let Some(minimum) = &self.effective_minimum {
            fields.push(("effectiveMinimum".into(), minimum.to_json()));
        }
        if let Some(maximum) = &self.effective_maximum {
            fields.push(("effectiveMaximum".into(), maximum.to_json()));
        }
        fields.extend([
            ("comparison".into(), Json::string(COMPARISON)),
            (
                "endpointConvention".into(),
                Json::string(ENDPOINT_CONVENTION),
            ),
        ]);
        Json::Object(fields)
    }
}

pub(crate) fn clearance(request: ClearanceRequest<'_>) -> Outcome<ClearanceEvidence> {
    match evaluate(request) {
        Ok((positive, evidence)) => Outcome::Decided { positive, evidence },
        Err(reason) => Outcome::Unsupported {
            reason,
            evidence: None,
        },
    }
}

fn evaluate(request: ClearanceRequest<'_>) -> Result<(bool, ClearanceEvidence), ContinuousError> {
    let subject = DomainBox::new(request.subject)?;
    let target = DomainBox::new(request.target)?;
    let tolerance = exact::rational(request.tolerance)?;
    if checked_cmp(&tolerance, &BigRational::zero())? == Ordering::Less {
        return Err(ContinuousError::invalid(
            "Clearance tolerance must be nonnegative.",
        ));
    }
    let minimum = request.minimum.map(exact::rational).transpose()?;
    let maximum = request.maximum.map(exact::rational).transpose()?;
    let effective_minimum = minimum
        .as_ref()
        .map(|value| exact::subtract(value, &tolerance))
        .transpose()?;
    let effective_maximum = maximum
        .as_ref()
        .map(|value| exact::add(value, &tolerance))
        .transpose()?;

    let mut subject_point = subject.minimum.clone();
    let mut target_point = target.minimum.clone();
    let mut gaps: [BigRational; 3] = std::array::from_fn(|_| BigRational::zero());
    let mut squared_distance = BigRational::zero();
    for axis in 0..3 {
        match checked_cmp(&subject.maximum[axis], &target.minimum[axis])? {
            Ordering::Less => {
                subject_point[axis] = subject.maximum[axis].clone();
                target_point[axis] = target.minimum[axis].clone();
            }
            _ if checked_cmp(&target.maximum[axis], &subject.minimum[axis])? == Ordering::Less => {
                subject_point[axis] = subject.minimum[axis].clone();
                target_point[axis] = target.maximum[axis].clone();
            }
            _ => {
                let coordinate = if checked_cmp(&subject.minimum[axis], &target.minimum[axis])?
                    == Ordering::Less
                {
                    target.minimum[axis].clone()
                } else {
                    subject.minimum[axis].clone()
                };
                subject_point[axis] = coordinate.clone();
                target_point[axis] = coordinate;
            }
        }
        gaps[axis] = exact::subtract(&target_point[axis], &subject_point[axis])?;
        squared_distance = exact::add(
            &squared_distance,
            &exact::multiply(&gaps[axis], &gaps[axis])?,
        )?;
    }

    let zero = BigRational::zero();
    let below_minimum = if let Some(limit) = &effective_minimum {
        checked_cmp(limit, &zero)? == Ordering::Greater
            && checked_cmp(&squared_distance, &exact::multiply(limit, limit)?)? == Ordering::Less
    } else {
        false
    };
    let below_maximum = if let Some(limit) = &effective_maximum {
        checked_cmp(limit, &zero)? != Ordering::Less
            && checked_cmp(&squared_distance, &exact::multiply(limit, limit)?)? != Ordering::Greater
    } else {
        true
    };

    let gap_display = [
        finite_display(&gaps[0])?,
        finite_display(&gaps[1])?,
        finite_display(&gaps[2])?,
    ];
    let distance = node24_hypot3(gap_display);
    if !distance.is_finite() {
        return Err(ContinuousError::unsupported(
            "The exact clearance has no finite binary64 diagnostic distance.",
        ));
    }
    let midpoint = [
        exact::midpoint(&subject_point[0], &target_point[0])?,
        exact::midpoint(&subject_point[1], &target_point[1])?,
        exact::midpoint(&subject_point[2], &target_point[2])?,
    ];
    let evidence = ClearanceEvidence {
        distance,
        below_minimum,
        diagnostic_point: [
            finite_display(&midpoint[0])?,
            finite_display(&midpoint[1])?,
            finite_display(&midpoint[2])?,
        ],
        subject: subject.evidence()?,
        target: target.evidence()?,
        closest_points: [scalar_point(&subject_point)?, scalar_point(&target_point)?],
        squared_distance: ExactRatio::new(&squared_distance)?,
        effective_minimum: effective_minimum
            .as_ref()
            .map(ExactRatio::new)
            .transpose()?,
        effective_maximum: effective_maximum
            .as_ref()
            .map(ExactRatio::new)
            .transpose()?,
    };
    if evidence.owned_bytes() > CLEARANCE_MAX_OWNED_BYTES {
        return Err(ContinuousError::resource(
            "The nominal box clearance evidence exceeds its 256 KiB output ceiling.",
        ));
    }
    Ok((!below_minimum && below_maximum, evidence))
}

pub(super) fn finite_display(value: &BigRational) -> Result<f64, ContinuousError> {
    exact::checked(value.clone())?;
    let value = value.to_f64().ok_or_else(|| {
        ContinuousError::unsupported("The exact clearance has no finite binary64 diagnostic value.")
    })?;
    if value.is_finite() {
        Ok(if value == 0.0 { 0.0 } else { value })
    } else {
        Err(ContinuousError::unsupported(
            "The exact clearance has no finite binary64 diagnostic value.",
        ))
    }
}

pub(super) fn checked_cmp(left: &BigRational, right: &BigRational) -> Result<Ordering, ContinuousError> {
    exact::checked(left.clone())?;
    exact::checked(right.clone())?;
    let left_bits = left.numer().bits().saturating_add(right.denom().bits());
    let right_bits = right.numer().bits().saturating_add(left.denom().bits());
    if left_bits > MAX_INTEGER_BITS || right_bits > MAX_INTEGER_BITS {
        return Err(ContinuousError::arithmetic(
            "Continuous-domain arithmetic exceeds the 8192-bit guard.",
        ));
    }
    let left_product: BigInt = left.numer() * right.denom();
    let right_product: BigInt = right.numer() * left.denom();
    if left_product.bits() > MAX_INTEGER_BITS || right_product.bits() > MAX_INTEGER_BITS {
        return Err(ContinuousError::arithmetic(
            "Continuous-domain arithmetic exceeds the 8192-bit guard.",
        ));
    }
    Ok(left_product.cmp(&right_product))
}
