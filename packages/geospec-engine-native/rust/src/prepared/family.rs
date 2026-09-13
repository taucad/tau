//! Typed family preparation, shared by canonical plans and batch evaluation.

use crate::{
    analysis::{
        interference,
        selection::{EcmaRegexEngine, EcmaRegexError},
    },
    codec::Json,
    matchers::{brep, diagnostics, mesh, proofs, relationships},
    registry::Capability,
    result::{Diagnostic, Evaluation},
    subject::{backend_refusal, EvaluationContext, Subject},
    ErrorKind, ProtocolError,
};

use super::AnalysisDemand;

pub(crate) enum PreparedFamily {
    Mesh(mesh::Prepared),
    Brep(brep::Prepared),
    Relationships(relationships::Prepared),
    Proofs(proofs::Prepared),
    Diagnostics(diagnostics::Prepared),
}

impl PreparedFamily {
    /// Pure argument lowering. No subject, kernel, or geometric facts are read.
    pub(crate) fn prepare(capability: Capability, payload: &Json) -> Result<Self, ProtocolError> {
        use Capability::*;
        match capability {
            ToHaveBoundingBox
            | ToHaveConnectedComponents
            | ToBeWatertight
            | ToHaveMeshIntegrity
            | ToHaveSurfaceArea
            | ToHaveVolume
            | ToHaveMass
            | ToHaveCenterOfMass => mesh::prepare(capability, payload).map(Self::Mesh),
            ToHaveAssemblyOccurrences
            | ToBeValidBrep
            | ToHaveTopologyCounts
            | ToHaveStepUnits
            | ToHaveProductStructure
            | ToHavePlanarFace
            | ToHaveCylindricalFace
            | ToHaveCircularHole
            | ToHaveCircularHolePattern
            | ToHaveChamferFeature
            | ToHaveFilletFeature => brep::prepare(capability, payload).map(Self::Brep),
            ToHaveSpatialRelationships => relationships::prepare(payload).map(Self::Relationships),
            ToHaveNoComponentInterference | ToHaveMinimumWallThickness | ToHaveVoidContinuity => {
                proofs::prepare(capability, payload).map(Self::Proofs)
            }
            ToHaveNoDiagnostics => diagnostics::prepare(capability, payload).map(Self::Diagnostics),
            ToSatisfyRationalPlate | ToSatisfyParallelPlaneDistance
            | AnalyzeBrep
            | AnalyzeMesh
            | InspectGeometry
            | AnalyzeMeshOverlap => Err(ProtocolError::new(
                ErrorKind::InvalidClaim,
                "Ancillary operations require query preparation rather than a matcher payload.",
            )),
        }
    }

    pub(crate) fn normalized_payload(&self) -> Json {
        match self {
            Self::Mesh(value) => value.normalized_payload(),
            Self::Brep(value) => value.normalized_payload(),
            Self::Relationships(value) => value.normalized_payload(),
            Self::Proofs(value) => value.normalized_payload(),
            Self::Diagnostics(value) => value.normalized_payload(),
        }
    }

    pub(crate) fn demand(&self) -> AnalysisDemand {
        match self {
            Self::Mesh(value) => value.demand(),
            Self::Brep(value) => value.demand(),
            Self::Relationships(value) => value.demand(),
            Self::Proofs(value) => value.demand(),
            Self::Diagnostics(value) => value.demand(),
        }
    }

    /// Whole-batch phase one validates every pattern before phase two reads facts.
    /// Valid unsupported syntax remains distinct from malformed syntax.
    pub(crate) fn validate_regexes(
        &self,
        engine: &dyn EcmaRegexEngine,
    ) -> Result<(), EcmaRegexError> {
        match self {
            Self::Brep(value) => value.validate_regexes(engine),
            Self::Relationships(value) => value.validate_regexes(engine),
            Self::Proofs(value) => value.validate_regexes(engine),
            Self::Mesh(_) | Self::Diagnostics(_) => Ok(()),
        }
    }

    /// Phase two runs for every claim before any family evaluator is invoked.
    /// It reads retained structure and exact selector queries, never CSG proofs.
    pub(crate) fn resolve_selectors(
        &mut self,
        subject: &Subject,
        regex: &dyn EcmaRegexEngine,
        budget: &crate::budget::Budget,
    ) -> Result<(), Evaluation> {
        match self {
            Self::Relationships(value) => {
                if let Some(index) = subject.selector_index().map_err(backend_refusal)? {
                    value.resolve_selectors(&index, regex, subject.brep.as_deref(), budget);
                }
            }
            Self::Proofs(value) => match value {
                proofs::Prepared::ComponentInterference(_) => {
                    let labels =
                        interference::component_labels(subject).map_err(backend_refusal)?;
                    value
                        .resolve_component_patterns(&labels, regex)
                        .map_err(regex_refusal)?;
                    if let Some(refusal) =
                        value.required_pair_refusal(Capability::ToHaveNoComponentInterference)
                    {
                        return Err(refusal);
                    }
                }
                proofs::Prepared::VoidContinuity(_) => {
                    if let Some(index) = subject.selector_index().map_err(backend_refusal)? {
                        value.resolve_void(&index);
                    }
                }
                proofs::Prepared::MinimumWallThickness(_) => {}
            },
            Self::Mesh(_) | Self::Brep(_) | Self::Diagnostics(_) => {}
        }
        Ok(())
    }

    /// Called after the complete batch has passed syntax and selector preparation.
    pub(crate) fn evaluate(&self, context: &mut EvaluationContext<'_>) -> Evaluation {
        match self {
            Self::Mesh(value) => mesh::evaluate(value, context),
            Self::Brep(value) => brep::evaluate(value, context),
            Self::Relationships(value) => relationships::evaluate(value, context),
            Self::Proofs(value) => proofs::evaluate(value, context),
            Self::Diagnostics(value) => diagnostics::evaluate(value, context),
        }
    }
}

pub(crate) fn regex_refusal(error: EcmaRegexError) -> Evaluation {
    let (code, message) = match error {
        EcmaRegexError::InvalidSyntax(message) => ("GEOSPEC_INVALID_SELECTOR", message),
        EcmaRegexError::Unsupported(message) => ("GEOSPEC_UNSUPPORTED_SELECTOR", message),
    };
    Evaluation::Refused {
        diagnostics: vec![Diagnostic::error(code, message)],
    }
}
