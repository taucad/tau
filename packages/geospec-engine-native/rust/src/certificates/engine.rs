//! Thread-confined F1 admission, one verified geometry cell and typed evidence.

use std::{
    cell::{Cell, OnceCell},
    mem::size_of,
    rc::Rc,
};

use super::{plate_contract::*, plate_syntax::PlateSource, plate_verifier, rational_plate};
use crate::{
    budget::Budget,
    codec::Json,
    protocol::{invalid_claim, object, require_fields, string_field},
    registry::Capability,
    result::{Diagnostic, Evaluation},
    ProtocolError,
};

pub(crate) struct Retention {
    used: Cell<usize>,
    limit: u64,
}

impl Retention {
    pub(crate) fn new(limit: u64) -> Self {
        Self {
            used: Cell::new(0),
            limit,
        }
    }

    fn reserve(&self, bytes: usize) -> Result<(), PlateError> {
        let next = self
            .used
            .get()
            .checked_add(bytes)
            .ok_or_else(retention_error)?;
        if next as u64 > self.limit {
            return Err(retention_error());
        }
        self.used.set(next);
        Ok(())
    }
}

pub(crate) struct RationalSubject {
    source: PlateSource,
    verified: OnceCell<PlateAnalysis>,
    bytes: Cell<usize>,
    retention: OnceCell<Rc<Retention>>,
}

impl RationalSubject {
    pub(crate) fn new(source: PlateSource) -> Result<Self, PlateError> {
        let bytes = source.owned_bytes().saturating_add(size_of::<Self>());
        if bytes > MAX_OWNED_BYTES {
            return Err(retention_error());
        }
        Ok(Self {
            source,
            verified: OnceCell::new(),
            bytes: Cell::new(bytes),
            retention: OnceCell::new(),
        })
    }

    /// Called once after engine duplicate/count admission checks. Failed or
    /// duplicate admissions therefore cannot spend retained capacity.
    pub(crate) fn attach(
        &self,
        retention: &Rc<Retention>,
        metadata_bytes: usize,
    ) -> Result<(), PlateError> {
        let bytes = self
            .bytes
            .get()
            .saturating_add(metadata_bytes)
            .saturating_add(size_of::<Retention>() + 2 * size_of::<usize>());
        if bytes > MAX_OWNED_BYTES {
            return Err(retention_error());
        }
        retention.reserve(bytes)?;
        self.bytes.set(bytes);
        let _ = self.retention.set(Rc::clone(retention));
        Ok(())
    }

    fn geometry(&self, budget: &Budget) -> Result<&PlateAnalysis, Evaluation> {
        let charge = |units| {
            budget.charge(units).map_err(|error| {
                Evaluation::budget_exceeded(Capability::ToSatisfyRationalPlate, error)
            })
        };
        charge(1)?;
        if let Some(analysis) = self.verified.get() {
            for units in &request_charges(analysis.cell_count, analysis.window_count)[1..] {
                charge(*units)?;
            }
            return Ok(analysis);
        }
        let admitted = rational_plate::admit(self.source.raw()).map_err(refusal)?;
        let charges = request_charges(admitted.cell_count, admitted.raw.windows.len() as u32);
        charge(charges[1])?;
        let analysis = rational_plate::produce(&admitted).map_err(refusal)?;
        drop(admitted);
        for units in &charges[2..] {
            charge(*units)?;
        }
        let verified = plate_verifier::verify_geometry(&self.source, &analysis).map_err(refusal)?;
        // The checker validates all values/certificate. Keep one geometry object,
        // not the checker's duplicate values or any claim/plan/result document.
        drop(verified);
        let additional = analysis_bytes(&analysis);
        let total = self.bytes.get().saturating_add(additional);
        if total > MAX_OWNED_BYTES {
            return Err(refusal(retention_error()));
        }
        let retention = self
            .retention
            .get()
            .ok_or_else(|| refusal(retention_error()))?;
        retention.reserve(additional).map_err(refusal)?;
        self.bytes.set(total);
        let _ = self.verified.set(analysis);
        Ok(self
            .verified
            .get()
            .expect("the ST owner published verified geometry"))
    }

    /// Engine has prepared the complete immutable batch. It owns the fresh
    /// subject/claim binding and computes this full-envelope hash once; the
    /// standalone verifier still independently parses and checks external plans.
    pub(crate) fn evaluate(
        &self,
        subject_hash: &str,
        plan_hash: &str,
        budget: &Budget,
    ) -> Evaluation {
        let binding = VerificationBinding {
            subject_content_hash: self.source.primary_hash().into(),
            subject_hash: subject_hash.into(),
            plan_hash: plan_hash.into(),
            verifier_source_hash: super::definition::VERIFIER_SOURCE_HASH.into(),
        };
        match self.geometry(budget) {
            Ok(analysis) => evaluation(analysis, &binding),
            Err(value) => value,
        }
    }
}

impl Drop for RationalSubject {
    fn drop(&mut self) {
        if let Some(retention) = self.retention.get() {
            retention.used.set(
                retention
                    .used
                    .get()
                    .checked_sub(self.bytes.get())
                    .expect("An attached F1 subject owns its reserved bytes"),
            );
        }
    }
}

pub(crate) fn prepare(payload: &Json) -> Result<(), ProtocolError> {
    let fields = object(payload, "rational plate payload")?;
    require_fields(
        fields,
        &["contract"],
        &["contract"],
        "rational plate payload",
    )?;
    if string_field(fields, "contract")? != CONTRACT {
        return invalid_claim("Rational plate requires geospec.plate-two-windows/v1.");
    }
    Ok(())
}

pub(crate) fn payload() -> Json {
    Json::object([("contract", Json::string(CONTRACT))])
}

pub(crate) fn profile() -> Json {
    Json::object([
        ("id", Json::string(PROFILE)),
        ("contract", Json::string(CONTRACT)),
        ("subjectFormat", Json::string("rational-plate")),
        ("ingestProfile", Json::string(INGEST_PROFILE)),
        ("backendProfile", Json::string(BACKEND_PROFILE)),
        (
            "limits",
            Json::object([
                ("maxPrimaryBytes", Json::Number(MAX_PRIMARY_BYTES as f64)),
                ("maxWindows", Json::Number(MAX_WINDOWS as f64)),
                ("maxGridCells", Json::Number(MAX_GRID_CELLS.into())),
                ("maxInputIntegerBits", Json::Number(63.0)),
                (
                    "maxArithmeticIntegerBits",
                    Json::Number(MAX_INTEGER_BITS as f64),
                ),
                (
                    "maxRetainedOwnedBytes",
                    Json::Number(MAX_OWNED_BYTES as f64),
                ),
            ]),
        ),
    ])
}

fn retention_error() -> PlateError {
    PlateError::new(
        PlateErrorKind::ArithmeticLimit,
        "F1 retained owned containers exceed the declared byte ceiling.",
    )
}

pub(crate) fn refusal(error: PlateError) -> Evaluation {
    let (code, message) = if error.kind == PlateErrorKind::UnsupportedDomain {
        (
            "GEOSPEC_EVIDENCE_UNSUPPORTED",
            "The subject is outside geospec.rational-orthogonal-plate/v1.",
        )
    } else {
        (
            "GEOSPEC_CERTIFICATE_UNVERIFIED",
            "The independent rational plate verification did not establish the certificate.",
        )
    };
    Evaluation::Refused {
        diagnostics: vec![Diagnostic::error(code, message)],
    }
}

pub(crate) fn outside_domain() -> Evaluation {
    refusal(PlateError::new(PlateErrorKind::UnsupportedDomain, ""))
}

fn point(value: &Point3) -> Json {
    Json::Array(value.iter().map(|v| Json::string(&v.0)).collect())
}
fn bounds(value: &Box3) -> Json {
    Json::object([("min", point(&value.min)), ("max", point(&value.max))])
}
fn plane(value: &[RationalText]) -> Json {
    Json::Array(value.iter().map(|v| Json::string(&v.0)).collect())
}

fn evaluation(analysis: &PlateAnalysis, binding: &VerificationBinding) -> Evaluation {
    let ids = ["P1", "P2", "P3", "P4"];
    let satisfied = analysis.predicates.iter().all(|value| *value);
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_RATIONAL_PLATE_MISMATCH",
        "The rational plate does not satisfy geospec.plate-two-windows/v1.",
    );
    diagnostic.details = Some(Json::object([
        ("matcher", Json::string("toSatisfyRationalPlate")),
        ("contract", Json::string(CONTRACT)),
        (
            "failedPredicates",
            Json::Array(
                ids.iter()
                    .zip(analysis.predicates)
                    .filter(|(_, holds)| !holds)
                    .map(|(id, _)| Json::string(id))
                    .collect(),
            ),
        ),
    ]));
    let certificate = &analysis.certificate;
    let evidence = Json::object([
        ("profile", Json::string(PROFILE)),
        (
            "subjectContentHash",
            Json::string(&binding.subject_content_hash),
        ),
        ("subjectHash", Json::string(&binding.subject_hash)),
        ("planHash", Json::string(&binding.plan_hash)),
        (
            "verifierSourceHash",
            Json::string(&binding.verifier_source_hash),
        ),
        (
            "normalizedExpected",
            Json::object([
                ("contract", Json::string(CONTRACT)),
                ("bounds", bounds(&target_bounds())),
                ("materialVolume", Json::string("196/1")),
                (
                    "requiredWindows",
                    Json::Array(required_windows().iter().map(bounds).collect()),
                ),
                (
                    "predicates",
                    Json::Array(ids.iter().map(|id| Json::string(id)).collect()),
                ),
            ]),
        ),
        (
            "measured",
            Json::object([
                ("bounds", bounds(&analysis.measured.bounds)),
                (
                    "materialVolume",
                    Json::string(&analysis.measured.material_volume.0),
                ),
                (
                    "materialInA",
                    Json::string(&analysis.measured.material_in_a.0),
                ),
                (
                    "materialInB",
                    Json::string(&analysis.measured.material_in_b.0),
                ),
            ]),
        ),
        (
            "witnesses",
            Json::object([
                (
                    "admission",
                    Json::object([
                        ("schema", Json::string(PROFILE)),
                        ("unit", Json::string("mm")),
                        ("frame", Json::string("artifact-xyz")),
                        ("windowCount", Json::Number(analysis.window_count.into())),
                        ("boundary", Json::string("regularized-solid")),
                        (
                            "separation",
                            Json::string("strict-positive-closed-footprint"),
                        ),
                    ]),
                ),
                (
                    "predicates",
                    Json::Array(
                        ids.iter()
                            .zip(analysis.predicates)
                            .map(|(id, holds)| {
                                Json::object([
                                    ("id", Json::string(id)),
                                    ("satisfied", Json::Bool(holds)),
                                ])
                            })
                            .collect(),
                    ),
                ),
                (
                    "certificate",
                    Json::object([
                        ("schema", Json::string(CERTIFICATE_SCHEMA)),
                        (
                            "planes",
                            Json::object([
                                ("x", plane(&certificate.planes.x)),
                                ("y", plane(&certificate.planes.y)),
                                ("z", plane(&certificate.planes.z)),
                            ]),
                        ),
                        (
                            "occupiedCells",
                            Json::Array(
                                certificate
                                    .occupied_cells
                                    .iter()
                                    .map(|v| Json::Number((*v).into()))
                                    .collect(),
                            ),
                        ),
                        (
                            "materialWitnesses",
                            Json::object([
                                (
                                    "A",
                                    certificate
                                        .material_witnesses
                                        .a
                                        .as_ref()
                                        .map_or(Json::Null, point),
                                ),
                                (
                                    "B",
                                    certificate
                                        .material_witnesses
                                        .b
                                        .as_ref()
                                        .map_or(Json::Null, point),
                                ),
                            ]),
                        ),
                    ]),
                ),
                (
                    "verification",
                    Json::object([
                        (
                            "method",
                            Json::string("independent-box-intersection-and-row-sweep-v1"),
                        ),
                        ("verified", Json::Bool(true)),
                    ]),
                ),
            ]),
        ),
    ]);
    Evaluation::Geometric {
        positive_satisfied: satisfied,
        diagnostics: if satisfied { vec![] } else { vec![diagnostic] },
        evidence,
        negated_diagnostic: None,
    }
}

fn analysis_bytes(value: &PlateAnalysis) -> usize {
    fn point(value: &Point3) -> usize {
        value.iter().map(|v| v.0.capacity()).sum()
    }
    fn plane(value: &Vec<RationalText>) -> usize {
        value.capacity() * size_of::<RationalText>()
            + value.iter().map(|v| v.0.capacity()).sum::<usize>()
    }
    size_of::<PlateAnalysis>()
        + point(&value.measured.bounds.min)
        + point(&value.measured.bounds.max)
        + value.measured.material_volume.0.capacity()
        + value.measured.material_in_a.0.capacity()
        + value.measured.material_in_b.0.capacity()
        + plane(&value.certificate.planes.x)
        + plane(&value.certificate.planes.y)
        + plane(&value.certificate.planes.z)
        + value.certificate.occupied_cells.capacity() * size_of::<u32>()
        + value
            .certificate
            .material_witnesses
            .a
            .as_ref()
            .map_or(0, point)
        + value
            .certificate
            .material_witnesses
            .b
            .as_ref()
            .map_or(0, point)
}

#[cfg(test)]
#[path = "../../tests/f1_budget_batch.rs"]
mod ordinary_budget_batch;

#[cfg(test)]
#[path = "../../tests/f1_release_m1.rs"]
mod ordinary_release;
