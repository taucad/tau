use num_rational::BigRational;
use num_traits::Zero;

use crate::{backend::brep::SelectedContinuousDomain, codec::Json};

use super::{
    domain::{directed_axis, scalar_point, DomainBox},
    exact, point_json, ContinuousError, DomainEvidence, ExactScalar, Outcome, MAX_OWNED_BYTES,
    PROFILE, REPRESENTATION,
};

pub(crate) struct InsertionRequest<'a> {
    pub subject: &'a SelectedContinuousDomain,
    pub target: &'a SelectedContinuousDomain,
    pub axis: [f64; 3],
    pub minimum: f64,
    pub maximum: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ClipEvent {
    pub kind: &'static str,
    pub coordinate: ExactScalar,
    pub directed_distance: ExactScalar,
}

impl ClipEvent {
    fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(self.coordinate.owned_bytes())
            .saturating_add(self.directed_distance.owned_bytes())
    }

    fn to_json(&self) -> Json {
        Json::object([
            ("coordinate", self.coordinate.to_json()),
            ("directedDistance", self.directed_distance.to_json()),
            ("kind", Json::string(self.kind)),
        ])
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct InsertionEvidence {
    pub profile: &'static str,
    pub representation: &'static str,
    pub subject: DomainEvidence,
    pub target: DomainEvidence,
    pub directed_axis: [i8; 3],
    pub centerline: [ExactScalar; 3],
    pub window: [[ExactScalar; 3]; 2],
    pub clip_events: Vec<ClipEvent>,
    pub occupied_interval: Option<[ExactScalar; 2]>,
    pub depth: ExactScalar,
    pub minimum: ExactScalar,
    pub maximum: Option<ExactScalar>,
    pub endpoint_convention: &'static str,
}

impl InsertionEvidence {
    pub(crate) fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(self.subject.owned_bytes())
            .saturating_add(self.target.owned_bytes())
            .saturating_add(
                self.centerline
                    .iter()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.window
                    .iter()
                    .flatten()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.clip_events.capacity() * std::mem::size_of::<ClipEvent>()
                    + self
                        .clip_events
                        .iter()
                        .map(ClipEvent::owned_bytes)
                        .sum::<usize>(),
            )
            .saturating_add(
                self.occupied_interval
                    .iter()
                    .flatten()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(self.depth.owned_bytes())
            .saturating_add(self.minimum.owned_bytes())
            .saturating_add(self.maximum.as_ref().map_or(0, ExactScalar::owned_bytes))
    }

    /// Exhaustive direct projection; these are the stable internal witness keys.
    pub(crate) fn to_json(&self) -> Json {
        Json::object([
            ("centerline", point_json(&self.centerline)),
            (
                "clipEvents",
                Json::Array(self.clip_events.iter().map(ClipEvent::to_json).collect()),
            ),
            ("depth", self.depth.to_json()),
            (
                "directedAxis",
                Json::Array(
                    self.directed_axis
                        .iter()
                        .map(|value| Json::Number((*value).into()))
                        .collect(),
                ),
            ),
            ("endpointConvention", Json::string(self.endpoint_convention)),
            (
                "maximum",
                self.maximum
                    .as_ref()
                    .map_or(Json::Null, ExactScalar::to_json),
            ),
            ("minimum", self.minimum.to_json()),
            (
                "occupiedInterval",
                self.occupied_interval
                    .as_ref()
                    .map_or(Json::Null, |interval| {
                        Json::Array(interval.iter().map(ExactScalar::to_json).collect())
                    }),
            ),
            ("profile", Json::string(self.profile)),
            ("representation", Json::string(self.representation)),
            ("subject", self.subject.to_json()),
            ("target", self.target.to_json()),
            (
                "window",
                Json::Array(self.window.iter().map(point_json).collect()),
            ),
        ])
    }
}

pub(crate) fn insertion_units(distinct_occurrences: usize) -> Result<u64, ContinuousError> {
    let count = u64::try_from(distinct_occurrences)
        .map_err(|_| ContinuousError::arithmetic("Insertion request count overflowed."))?;
    count
        .checked_mul(6)
        .and_then(|value| value.checked_add(1))
        .ok_or_else(|| ContinuousError::arithmetic("Insertion request count overflowed."))
}

pub(crate) fn insertion(request: InsertionRequest<'_>) -> Outcome<InsertionEvidence> {
    match evaluate(request) {
        Ok((positive, evidence)) => Outcome::Decided { positive, evidence },
        Err(reason) => Outcome::Unsupported {
            reason,
            evidence: None,
        },
    }
}

fn evaluate(request: InsertionRequest<'_>) -> Result<(bool, InsertionEvidence), ContinuousError> {
    let subject = DomainBox::new(request.subject)?;
    let target = DomainBox::new(request.target)?;
    let (axis, direction) = directed_axis(request.axis)?;
    let minimum = exact::rational(request.minimum)?;
    let maximum = request.maximum.map(exact::rational).transpose()?;
    if minimum < BigRational::zero() || maximum.as_ref().is_some_and(|value| value < &minimum) {
        return Err(ContinuousError::invalid(
            "Insertion limits require 0 <= minimum <= maximum.",
        ));
    }

    let mut centerline = subject.minimum.clone();
    centerline[axis] = if direction > 0 {
        subject.minimum[axis].clone()
    } else {
        subject.maximum[axis].clone()
    };
    for transverse in (0..3).filter(|index| *index != axis) {
        centerline[transverse] =
            exact::midpoint(&subject.minimum[transverse], &subject.maximum[transverse])?;
    }
    let mut window_end = centerline.clone();
    window_end[axis] = if direction > 0 {
        subject.maximum[axis].clone()
    } else {
        subject.minimum[axis].clone()
    };

    let transverse_hit = (0..3).filter(|index| *index != axis).all(|index| {
        centerline[index] >= target.minimum[index] && centerline[index] <= target.maximum[index]
    });
    let overlap_min = subject.minimum[axis]
        .clone()
        .max(target.minimum[axis].clone());
    let overlap_max = subject.maximum[axis]
        .clone()
        .min(target.maximum[axis].clone());
    let occupied = transverse_hit && overlap_min <= overlap_max;
    let depth = if occupied {
        exact::subtract(&overlap_max, &overlap_min)?
    } else {
        BigRational::zero()
    };
    let directed_start = if direction > 0 {
        subject.minimum[axis].clone()
    } else {
        subject.maximum[axis].clone()
    };
    let directed_coordinate = |value: &BigRational| {
        if direction > 0 {
            exact::subtract(value, &directed_start)
        } else {
            exact::subtract(&directed_start, value)
        }
    };
    let ordered = if direction > 0 {
        [overlap_min.clone(), overlap_max.clone()]
    } else {
        [overlap_max.clone(), overlap_min.clone()]
    };
    let (clip_events, occupied_interval) = if occupied {
        (
            vec![
                ClipEvent {
                    kind: "enter",
                    coordinate: exact::scalar(&ordered[0])?,
                    directed_distance: exact::scalar(&directed_coordinate(&ordered[0])?)?,
                },
                ClipEvent {
                    kind: "exit",
                    coordinate: exact::scalar(&ordered[1])?,
                    directed_distance: exact::scalar(&directed_coordinate(&ordered[1])?)?,
                },
            ],
            Some([exact::scalar(&ordered[0])?, exact::scalar(&ordered[1])?]),
        )
    } else {
        (Vec::new(), None)
    };
    let positive = depth >= minimum && maximum.as_ref().is_none_or(|limit| depth <= *limit);
    let directed_axis = [0, 1, 2].map(|index| if index == axis { direction } else { 0 });
    let evidence = InsertionEvidence {
        profile: PROFILE,
        representation: REPRESENTATION,
        subject: subject.evidence()?,
        target: target.evidence()?,
        directed_axis,
        centerline: scalar_point(&centerline)?,
        window: [scalar_point(&centerline)?, scalar_point(&window_end)?],
        clip_events,
        occupied_interval,
        depth: exact::scalar(&depth)?,
        minimum: exact::scalar(&minimum)?,
        maximum: maximum.as_ref().map(exact::scalar).transpose()?,
        endpoint_convention: "closed-target-length",
    };
    if evidence.owned_bytes() > MAX_OWNED_BYTES {
        return Err(ContinuousError::resource(
            "The continuous insertion evidence exceeds its 32 MiB output ceiling.",
        ));
    }
    Ok((positive, evidence))
}
