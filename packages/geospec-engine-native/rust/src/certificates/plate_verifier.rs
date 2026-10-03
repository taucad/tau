//! Independent F1 domain admission, direct box formulas and complete row coverage.
//! No producer admission, occupancy or accumulated value is an input authority.

use num_rational::BigRational;
use num_traits::Zero;
use std::collections::{BTreeMap, BTreeSet};

use super::plate_contract::{
    required_windows, target_bounds, Box3, MaterialWitnesses, PlaneLists, PlateAnalysis,
    PlateCandidate, PlateError, PlateErrorKind, Point3, PredicateValues, RawPlate,
    VerificationRequest, VerifiedPlate, CONTRACT, MAX_GRID_CELLS, MAX_INTEGER_BITS, MAX_WINDOWS,
};
use super::plate_syntax::{input_rational, rational_text, PlateSource};
use crate::codec::{self, Json};

struct ExactBox {
    min: [BigRational; 3],
    max: [BigRational; 3],
}

struct Geometry {
    plate: ExactBox,
    windows: Vec<ExactBox>,
    required: [ExactBox; 2],
    planes: [Vec<BigRational>; 3],
    cell_count: u32,
}

fn unsupported(message: &str) -> PlateError {
    PlateError::new(PlateErrorKind::UnsupportedDomain, message)
}

fn unverified(message: &str) -> PlateError {
    PlateError::new(PlateErrorKind::Unverified, message)
}

// B57r2 bounds all unreduced intermediates of the restricted operations below
// by 14572 bits. This guard checks values, not allocator workspace or RSS.
fn bounded(value: BigRational) -> Result<BigRational, PlateError> {
    if value.numer().bits() > MAX_INTEGER_BITS || value.denom().bits() > MAX_INTEGER_BITS {
        return Err(PlateError::new(
            PlateErrorKind::ArithmeticLimit,
            "F1 verifier rational exceeds the declared integer guard.",
        ));
    }
    Ok(value)
}

fn point(value: &Point3) -> Result<[BigRational; 3], PlateError> {
    Ok([
        input_rational(&value[0])?,
        input_rational(&value[1])?,
        input_rational(&value[2])?,
    ])
}

fn exact_box(value: &Box3) -> Result<ExactBox, PlateError> {
    Ok(ExactBox {
        min: point(&value.min)?,
        max: point(&value.max)?,
    })
}

fn positive(value: &ExactBox) -> bool {
    (0..3).all(|axis| value.min[axis] < value.max[axis])
}

fn geometry(raw: &RawPlate) -> Result<Geometry, PlateError> {
    let plate = exact_box(&raw.plate)?;
    if !positive(&plate) || raw.windows.len() > MAX_WINDOWS {
        return Err(unsupported(
            "F1 requires a positive plate and at most16 windows.",
        ));
    }
    let windows = raw
        .windows
        .iter()
        .map(exact_box)
        .collect::<Result<Vec<_>, _>>()?;
    for (index, window) in windows.iter().enumerate() {
        if !positive(window)
            || window.min[2] != plate.min[2]
            || window.max[2] != plate.max[2]
            || !(0..2).all(|axis| {
                plate.min[axis] < window.min[axis] && window.max[axis] < plate.max[axis]
            })
        {
            return Err(unsupported(
                "F1 windows must be positive, through and strictly interior in XY.",
            ));
        }
        for prior in &windows[..index] {
            if !(0..2).any(|axis| {
                prior.max[axis] < window.min[axis] || window.max[axis] < prior.min[axis]
            }) {
                return Err(unsupported(
                    "F1 closed window footprints require a strict positive separating gap.",
                ));
            }
        }
    }
    let fixed = required_windows();
    let required = [exact_box(&fixed[0])?, exact_box(&fixed[1])?];
    let mut planes: [Vec<BigRational>; 3] = std::array::from_fn(|_| Vec::new());
    for value in std::iter::once(&plate)
        .chain(windows.iter())
        .chain(required.iter())
    {
        for (axis, list) in planes.iter_mut().enumerate() {
            list.push(value.min[axis].clone());
            list.push(value.max[axis].clone());
        }
    }
    let mut cell_count = 1u32;
    for (axis, list) in planes.iter_mut().enumerate() {
        list.sort();
        list.dedup();
        if list.len() < 2 || list.len() > if axis == 2 { 4 } else { 38 } {
            return Err(unsupported(
                "F1 boundary planes exceed the adopted refinement bound.",
            ));
        }
        cell_count = cell_count
            .checked_mul((list.len() - 1) as u32)
            .ok_or_else(|| unsupported("F1 cell count exceeds its bounded domain."))?;
    }
    if cell_count > MAX_GRID_CELLS {
        return Err(unsupported(
            "F1 refinement exceeds the admitted cell limit.",
        ));
    }
    Ok(Geometry {
        plate,
        windows,
        required,
        planes,
        cell_count,
    })
}

// Only three coordinate differences may be multiplied. An accumulated volume
// or a midpoint is never supplied to this leaf formula.
fn volume(value: &ExactBox) -> Result<BigRational, PlateError> {
    if !positive(value) {
        return Ok(BigRational::zero());
    }
    let x = bounded(&value.max[0] - &value.min[0])?;
    let y = bounded(&value.max[1] - &value.min[1])?;
    let z = bounded(&value.max[2] - &value.min[2])?;
    let xy = bounded(x * y)?;
    bounded(xy * z)
}

fn intersection_volume(a: &ExactBox, b: &ExactBox) -> Result<BigRational, PlateError> {
    volume(&ExactBox {
        min: std::array::from_fn(|axis| std::cmp::max(&a.min[axis], &b.min[axis]).clone()),
        max: std::array::from_fn(|axis| std::cmp::min(&a.max[axis], &b.max[axis]).clone()),
    })
}

fn material_in(query: &ExactBox, geometry: &Geometry) -> Result<BigRational, PlateError> {
    // Exactly W+1 geometric intersection terms, including empty intersections.
    let mut value = intersection_volume(query, &geometry.plate)?;
    for window in &geometry.windows {
        value = bounded(value - intersection_volume(query, window)?)?;
    }
    Ok(value)
}

fn plane_text(planes: &[Vec<BigRational>; 3]) -> Result<PlaneLists, PlateError> {
    let convert = |axis: usize| {
        planes[axis]
            .iter()
            .map(rational_text)
            .collect::<Result<Vec<_>, _>>()
    };
    Ok(PlaneLists {
        x: convert(0)?,
        y: convert(1)?,
        z: convert(2)?,
    })
}

fn covers(value: &ExactBox, axis: usize, lo: &BigRational, hi: &BigRational) -> bool {
    &value.min[axis] <= lo && hi <= &value.max[axis]
}

fn midpoint(planes: &[Vec<BigRational>; 3], indices: [usize; 3]) -> Result<Point3, PlateError> {
    let mut coordinates = Vec::with_capacity(3);
    for axis in 0..3 {
        let sum = bounded(&planes[axis][indices[axis]] + &planes[axis][indices[axis] + 1])?;
        let value = bounded(sum / BigRational::from_integer(2.into()))?;
        coordinates.push(rational_text(&value)?);
    }
    coordinates
        .try_into()
        .map_err(|_| unverified("F1 midpoint must have three coordinates."))
}

fn check_rows(
    geometry: &Geometry,
    candidate: &PlateAnalysis,
) -> Result<MaterialWitnesses, PlateError> {
    let [xs, ys, zs] = &geometry.planes;
    let mut submitted = candidate.certificate.occupied_cells.iter();
    let mut witnesses: [Option<Point3>; 2] = [None, None];
    for ix in 0..xs.len() - 1 {
        // In an exact x strip the active window rectangles produce separated
        // y intervals. Sweep those intervals once across this strip's rows.
        let mut holes: Vec<_> = geometry
            .windows
            .iter()
            .filter(|window| covers(window, 0, &xs[ix], &xs[ix + 1]))
            .collect();
        holes.sort_by(|a, b| a.min[1].cmp(&b.min[1]));
        let mut hole = 0;
        for iy in 0..ys.len() - 1 {
            while hole < holes.len() && holes[hole].max[1] <= ys[iy] {
                hole += 1;
            }
            let removed = hole < holes.len() && covers(holes[hole], 1, &ys[iy], &ys[iy + 1]);
            let row_inside = covers(&geometry.plate, 0, &xs[ix], &xs[ix + 1])
                && covers(&geometry.plate, 1, &ys[iy], &ys[iy + 1])
                && !removed;
            for iz in 0..zs.len() - 1 {
                let id = ((ix * (ys.len() - 1) + iy) * (zs.len() - 1) + iz) as u32;
                if !row_inside || !covers(&geometry.plate, 2, &zs[iz], &zs[iz + 1]) {
                    continue;
                }
                if submitted.next().copied() != Some(id) {
                    return Err(unverified(
                        "F1 occupied cells do not provide complete ordered row coverage.",
                    ));
                }
                for (query, witness) in geometry.required.iter().zip(witnesses.iter_mut()) {
                    if witness.is_none()
                        && covers(query, 0, &xs[ix], &xs[ix + 1])
                        && covers(query, 1, &ys[iy], &ys[iy + 1])
                        && covers(query, 2, &zs[iz], &zs[iz + 1])
                    {
                        *witness = Some(midpoint(&geometry.planes, [ix, iy, iz])?);
                    }
                }
            }
        }
    }
    if submitted.next().is_some() {
        return Err(unverified(
            "F1 occupied cells contain trailing, duplicate or out-of-domain IDs.",
        ));
    }
    let [a, b] = witnesses;
    Ok(MaterialWitnesses { a, b })
}

/// Independently admit original-byte-bound syntax and check all fixed predicates.
/// A verified geometric countermodel returns its four derived false/true values.
pub fn verify_geometry(
    source: &PlateSource,
    candidate: &PlateAnalysis,
) -> Result<VerifiedPlate, PlateError> {
    let geometry = geometry(source.raw())?;
    if candidate.window_count != geometry.windows.len() as u32
        || candidate.cell_count != geometry.cell_count
        || candidate.certificate.occupied_cells.len() > geometry.cell_count as usize
        || candidate.certificate.planes != plane_text(&geometry.planes)?
    {
        return Err(unverified(
            "F1 certificate counts or exact boundary planes disagree with original geometry.",
        ));
    }
    let mut material_volume = volume(&geometry.plate)?;
    for window in &geometry.windows {
        material_volume = bounded(material_volume - volume(window)?)?;
    }
    let in_a = material_in(&geometry.required[0], &geometry)?;
    let in_b = material_in(&geometry.required[1], &geometry)?;
    let measured = PredicateValues {
        bounds: source.raw().plate.clone(),
        material_volume: rational_text(&material_volume)?,
        material_in_a: rational_text(&in_a)?,
        material_in_b: rational_text(&in_b)?,
    };
    let predicates = [
        measured.bounds == target_bounds(),
        material_volume == BigRational::from_integer(196.into()),
        in_a.is_zero(),
        in_b.is_zero(),
    ];
    let witnesses = check_rows(&geometry, candidate)?;
    if witnesses.a.is_some() == in_a.is_zero()
        || witnesses.b.is_some() == in_b.is_zero()
        || witnesses != candidate.certificate.material_witnesses
        || measured != candidate.measured
        || predicates != candidate.predicates
    {
        return Err(unverified(
            "F1 exact values, complete predicates or first-midpoint witnesses disagree.",
        ));
    }
    Ok(VerifiedPlate {
        measured,
        predicates,
    })
}

fn fields<'a>(value: &'a Json, names: &[&str]) -> Result<&'a [(String, Json)], PlateError> {
    let Json::Object(fields) = value else {
        return Err(unverified("F1 plan requires an object."));
    };
    if fields.len() != names.len()
        || fields
            .iter()
            .any(|(name, _)| !names.contains(&name.as_str()))
    {
        return Err(unverified(
            "F1 plan object fields do not match the canonical envelope contract.",
        ));
    }
    Ok(fields)
}

fn field<'a>(fields: &'a [(String, Json)], name: &str) -> Result<&'a Json, PlateError> {
    fields
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value)
        .ok_or_else(|| unverified("F1 canonical plan is missing a required field."))
}

fn text(value: &Json) -> Result<&str, PlateError> {
    match value {
        Json::String(value) => Ok(value),
        _ => Err(unverified("F1 plan requires a string.")),
    }
}

fn array(value: &Json) -> Result<&[Json], PlateError> {
    match value {
        Json::Array(value) => Ok(value),
        _ => Err(unverified("F1 plan requires an array.")),
    }
}

fn hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn check_plan(request: &VerificationRequest<'_>) -> Result<(), PlateError> {
    let envelope = codec::decode(request.canonical_plan)
        .map_err(|_| unverified("F1 plan is not strict JSON."))?;
    if codec::encode(&envelope).map_err(|_| unverified("F1 plan cannot be canonicalized."))?
        != request.canonical_plan
    {
        return Err(unverified(
            "F1 plan bytes must be the complete canonical envelope.",
        ));
    }
    let root = fields(
        &envelope,
        &[
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
            "numericProfile",
            "plan",
        ],
    )?;
    if field(root, "protocolVersion")? != &Json::Number(3.0)
        || field(root, "registryVersion")? != &Json::Number(5.0)
        || text(field(root, "canonicalProfile")?)? != "geospec-jcs-v1"
        || text(field(root, "numericProfile")?)? != "geospec-demand-v6"
        || request.claim_id.is_empty()
        || request.subject_slot.is_empty()
        || !hash(request.expected_subject_hash)
        || !hash(request.expected_verifier_source_hash)
    {
        return Err(unverified(
            "F1 plan profile or trusted binding metadata is invalid.",
        ));
    }
    let plan = fields(field(root, "plan")?, &["subjects", "claims"])?;
    let mut subjects = BTreeMap::new();
    for value in array(field(plan, "subjects")?)? {
        let Json::Object(row) = value else {
            return Err(unverified("F1 plan subject must be an object."));
        };
        let semantic = row.iter().any(|(name, _)| name == "subjectHash");
        let hash_key = if semantic {
            "subjectHash"
        } else {
            "contentHash"
        };
        let row = fields(value, &["slot", hash_key])?;
        let slot = text(field(row, "slot")?)?;
        let subject_hash = text(field(row, hash_key)?)?;
        if slot.is_empty()
            || !hash(subject_hash)
            || subjects.insert(slot, (subject_hash, semantic)).is_some()
        {
            return Err(unverified(
                "F1 plan has an invalid or duplicate subject binding.",
            ));
        }
    }
    if subjects.get(request.subject_slot) != Some(&(request.expected_subject_hash, true)) {
        return Err(unverified(
            "F1 subject slot does not bind the trusted semantic subject hash.",
        ));
    }
    let claims = array(field(plan, "claims")?)?;
    if claims.len() > 4096 {
        return Err(unverified(
            "F1 plan exceeds the existing claim-count limit.",
        ));
    }
    let mut ids = BTreeSet::new();
    let mut selected = false;
    for value in claims {
        let row = fields(
            value,
            &[
                "claimId",
                "capability",
                "subjectSlots",
                "payload",
                "polarity",
                "workUnitBudget",
            ],
        )?;
        let id = text(field(row, "claimId")?)?;
        let capability = text(field(row, "capability")?)?;
        let slots = array(field(row, "subjectSlots")?)?;
        let [Json::String(slot)] = slots else {
            return Err(unverified("F1 claims require one existing subject slot."));
        };
        let polarity = text(field(row, "polarity")?)?;
        let budget = field(row, "workUnitBudget")?;
        if id.is_empty()
            || !ids.insert(id)
            || capability.is_empty()
            || !subjects.contains_key(slot.as_str())
            || !matches!(polarity, "positive" | "negative")
            || !matches!(budget, Json::Number(n) if *n >= 1.0 && *n <= 9_007_199_254_740_991.0 && n.fract() == 0.0)
        {
            return Err(unverified(
                "F1 plan has an invalid claim ID, slot, polarity or exact budget.",
            ));
        }
        if capability == "toSatisfyRationalPlate" {
            let payload = fields(field(row, "payload")?, &["contract"])?;
            if text(field(payload, "contract")?)? != CONTRACT {
                return Err(unverified(
                    "F1 requires the complete fixed four-predicate contract.",
                ));
            }
        }
        if id == request.claim_id {
            if capability != "toSatisfyRationalPlate" || slot != request.subject_slot {
                return Err(unverified(
                    "F1 requested claim does not bind the fixed capability and source slot.",
                ));
            }
            selected = true;
        }
    }
    if !selected {
        return Err(unverified(
            "F1 requested fixed claim is absent from the canonical plan.",
        ));
    }
    Ok(())
}

/// Check the exact full-envelope binding, then independently verify the geometry.
/// Definition-hash binding is not a compiled-artifact or trusted-runner attestation.
pub fn verify(
    request: VerificationRequest<'_>,
    candidate: PlateCandidate<'_>,
) -> Result<VerifiedPlate, PlateError> {
    check_plan(&request)?;
    let plan_hash = crate::identity::sha256_hex(request.canonical_plan);
    let binding = candidate.binding;
    if binding.subject_content_hash != request.source.primary_hash()
        || binding.subject_hash != request.expected_subject_hash
        || binding.plan_hash != plan_hash
        || binding.verifier_source_hash != request.expected_verifier_source_hash
    {
        return Err(unverified(
            "F1 certificate does not bind the original source and exact canonical plan envelope.",
        ));
    }
    verify_geometry(request.source, candidate.analysis)
}
