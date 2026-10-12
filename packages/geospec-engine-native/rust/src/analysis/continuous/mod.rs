//! Exact nominal orthogonal insertion and void analysis.
//!
//! This module accepts only connector-certified, actual located complete boxes.
//! It does not infer exact geometry from reporting bounds or tessellation.

pub(crate) mod bore_slab_interference;
mod box_interference;
mod clearance;
mod cylindrical_band;
mod domain;
pub(crate) mod exact;
mod finite_contact;
pub(crate) use finite_contact::{
    finite_contact, FiniteContactRequest, FINITE_CONTACT_OUTPUT_BYTES,
    FINITE_CONTACT_RESERVATION_BYTES, FINITE_CONTACT_UNITS,
};
mod insertion;
mod nominal_analytic;
mod topology;

use crate::codec::Json;
#[cfg(test)]
pub(crate) use box_interference::nominal_analytic_box_tests::box_domain as nominal_analytic_box_control;
pub(crate) use box_interference::{
    box_interference, BoxInterferenceEvidence, BoxInterferenceRequest,
    BOX_INTERFERENCE_RESERVATION_BYTES,
};

pub(crate) use nominal_analytic::{
    nominal_analytic, AnalyticKind, NominalAnalyticRequest, NominalSupport, SupportKind,
    NOMINAL_ANALYTIC_OUTPUT_BYTES, NOMINAL_ANALYTIC_RESERVATION_BYTES, NOMINAL_ANALYTIC_UNITS,
};

pub(crate) use clearance::{clearance, ClearanceEvidence, ClearanceRequest, CLEARANCE_PAIR_UNITS};
pub(crate) use cylindrical_band::{
    cylindrical_band_clearance, CylindricalBandClearanceRequest,
    CYLINDRICAL_BAND_ENCODING_RESERVATION_BYTES, CYLINDRICAL_BAND_EVIDENCE_RESERVATION_BYTES,
    CYLINDRICAL_BAND_INPUT_PAIR_BYTES, CYLINDRICAL_BAND_PREDICATE_RESERVATION_BYTES,
};
pub(crate) use domain::DomainEvidence;
pub(crate) use insertion::{
    band_engagement, insertion, insertion_units, BandEngagementRequest, InsertionRequest,
};
pub(crate) use topology::{GridPlan, PointEvidence, PointRequest, SectionRequest, Topology};

pub(crate) const PROFILE: &str = "geospec-nominal-orthogonal-continuous-v1";
pub(crate) const REPRESENTATION: &str = "selected-continuous-domain-axis-aligned-box";
pub(crate) const MAX_INTEGER_BITS: u64 = 8192;
pub(crate) const MAX_MATERIALS: usize = 16;
pub(crate) const MAX_PLANES_PER_AXIS: usize = 34;
pub(crate) const MAX_CELLS: usize = 35_937;
pub(crate) const MAX_OWNED_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ContinuousErrorKind {
    InvalidInput,
    UnsupportedDomain,
    ArithmeticLimit,
    ResourceLimit,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ContinuousError {
    pub kind: ContinuousErrorKind,
    pub message: String,
}

impl ContinuousError {
    pub(crate) fn invalid(message: &str) -> Self {
        Self::new(ContinuousErrorKind::InvalidInput, message)
    }

    pub(crate) fn unsupported(message: &str) -> Self {
        Self::new(ContinuousErrorKind::UnsupportedDomain, message)
    }

    pub(crate) fn arithmetic(message: &str) -> Self {
        Self::new(ContinuousErrorKind::ArithmeticLimit, message)
    }

    pub(crate) fn resource(message: &str) -> Self {
        Self::new(ContinuousErrorKind::ResourceLimit, message)
    }

    fn new(kind: ContinuousErrorKind, message: &str) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Outcome<T> {
    Decided {
        positive: bool,
        evidence: T,
    },
    Unsupported {
        reason: ContinuousError,
        evidence: Option<T>,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ExactScalar {
    pub numerator: String,
    pub denominator: String,
    pub display: f64,
}

impl ExactScalar {
    pub(crate) fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(self.numerator.capacity())
            .saturating_add(self.denominator.capacity())
    }

    pub(crate) fn to_json(&self) -> Json {
        Json::object([
            ("denominator", Json::string(&self.denominator)),
            ("display", Json::Number(self.display)),
            ("numerator", Json::string(&self.numerator)),
        ])
    }
}

pub(super) fn point_json(point: &[ExactScalar; 3]) -> Json {
    Json::Array(point.iter().map(ExactScalar::to_json).collect())
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod clearance_tests;
