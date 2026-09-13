//! Bounded exact predicates on C1-qualified closed nominal lateral bands.
//! No source query, kernel operation, phase-vector unit assumption, or sampled minimum.

use std::cmp::Ordering;

use num_rational::BigRational as Rational;
use num_traits::{Signed, Zero};

use crate::{
    analysis::node24_hypot3,
    backend::brep::{CylinderBoundaryOrientation, CylinderBoundarySide, NominalCylindricalBand},
    codec::Json,
    matchers::json_owned_bytes,
};

use super::{
    clearance::{checked_cmp, finite_display, ExactRatio},
    exact, ContinuousError, Outcome,
};

const PROFILE: &str = "geospec-nominal-cylindrical-band-clearance-v1";
// A retained-slot resource restriction, not an accuracy tolerance. Arithmetic
// still preflights every unreduced intermediate against the shared 8192-bit guard.
const STORED_BITS: u64 = 2048;
const MAX_JSON_BYTES: usize = 64 * 1024;
// Per band: 92 object entries, 145 array entries, 21-byte maximum
// key, one profile, four orientation/side strings, one root Json. Include
// recursive Json headers as in the shared conservative owned-byte counter.
const RAW_BAND_JSON_BYTES: usize = 92
    * (std::mem::size_of::<(String, Json)>() + std::mem::size_of::<Json>())
    + 145 * 2 * std::mem::size_of::<Json>()
    + 92 * 21
    + PROFILE.len()
    + 4 * (8 + 2)
    + std::mem::size_of::<Json>();
// Outer evidence Vec can grow to 22 entries; generator proof has 13 fields.
// Include both root/field headers, diagnostic and pair-array slots, 27 keys
// bounded by 64 bytes, eight metadata literals bounded by 96, evidence header.
const RAW_JSON_RESERVE: usize = 2 * RAW_BAND_JSON_BYTES
    + (22 + 13) * std::mem::size_of::<(String, Json)>()
    + (14 + 14 + 3 + 12) * std::mem::size_of::<Json>()
    + 27 * 64
    + 8 * 96
    + std::mem::size_of::<CylindricalBandClearanceEvidence>();

// Fixed schedule, not a measured post-call allowance. Pinned num-bigint 0.4.6,
// num-rational 0.4.2 and Rust 1.88 Vec capacity behavior; re-audit on upgrades.
// Retained slots: evaluate 4; Frame 12; generator 28 (six scalars, six
// coefficients, four clip and four source endpoints, four minimum, four values);
// Horner partial/returned pairs 8; Pair expression temporaries 6; enclosing
// comparisons/conversions 6. Sum 64 conservatively overlaps exclusive branches.
// BigInt scratch buffers: rational owned operands/results 8; gcd/Stein copies 4;
// normalized Knuth division 4; product/Karatsuba 8; sign products/cross-products
// and compacting result 8. Sum 32. At 8192 product bits the smaller factor is
// <=4096 bits: <=2 Karatsuba levels on 32-bit digits (one on 64-bit), three
// vectors/level plus output; no Toom-3. Half-Karatsuba recurses on slices.
// Each scratch buffer includes two extra limbs for shifts/carry/padding and
// doubled Vec growth capacity. stored() clones normalized limbs to prevent
// larger unreduced capacities surviving in retained slots. All operands pass
// shared bit-sum preflight before the dependency arithmetic allocation.
// Output construction follows, not overlaps, generator/arithmetic scratch:
// <=25 retained rationals, six conversion scratch buffers and the guarded Json
// construction sum. The reservation is max(arithmetic, output), not their sum.
const RATIONAL_SLOT_BYTES: usize = std::mem::size_of::<Rational>() + 2 * 256;
const INTEGER_SCRATCH_BYTES: usize =
    std::mem::size_of::<num_bigint::BigInt>() + 2 * (8192 / 8 + 2 * 8);
const ARITHMETIC_RESERVATION: usize =
    (4 + 12 + 28 + 8 + 6 + 6) * RATIONAL_SLOT_BYTES + (8 + 4 + 4 + 8 + 8) * INTEGER_SCRATCH_BYTES;
const OUTPUT_RESERVATION: usize =
    25 * RATIONAL_SLOT_BYTES + 6 * INTEGER_SCRATCH_BYTES + MAX_JSON_BYTES;

/// Reserve BEFORE invocation, in addition to all caller-owned live records.
/// Includes this call's rational/surd storage, arithmetic scratch and returned
/// evidence construction. Excludes borrowed C1 records, prior results, caller
/// JSON clones/serialization, allocator metadata and compiler machine frames.
/// This is requested payload capacity accounting, not an RSS/security bound.
pub(crate) const CYLINDRICAL_BAND_PREDICATE_RESERVATION_BYTES: usize =
    if ARITHMETIC_RESERVATION > OUTPUT_RESERVATION {
        ARITHMETIC_RESERVATION
    } else {
        OUTPUT_RESERVATION
    };
/// One caller-owned C1 pair; no dynamic fields occur in the frozen C1 contract.
pub(crate) const CYLINDRICAL_BAND_INPUT_PAIR_BYTES: usize =
    2 * std::mem::size_of::<NominalCylindricalBand>();
/// Returned evidence or one caller clone, separately from the predicate peak.
pub(crate) const CYLINDRICAL_BAND_EVIDENCE_RESERVATION_BYTES: usize = MAX_JSON_BYTES;
/// One growing codec output buffer (maximum 32 KiB payload, doubled capacity).
/// Fixed raw/metadata text <=20 KiB, proof containers <2 KiB, ratio digits
/// <=6 KiB (charged fourfold by the 64 KiB Json preflight). All text is ASCII
/// literals or signed decimal integers: no escaping expansion. Caller wrappers
/// and concatenated earlier results require their own additional reservation.
pub(crate) const CYLINDRICAL_BAND_ENCODING_RESERVATION_BYTES: usize = 2 * 32 * 1024;
const _: () = assert!(super::MAX_INTEGER_BITS == 8192);

pub(crate) struct CylindricalBandClearanceRequest<'a> {
    pub subject: &'a NominalCylindricalBand,
    pub target: &'a NominalCylindricalBand,
    pub minimum: Option<f64>,
    pub maximum: Option<f64>,
    pub tolerance: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct CylindricalBandClearanceEvidence {
    pub distance: f64,
    pub below_minimum: bool,
    /// Located source origin for diagnosis only, never an intersection witness.
    pub diagnostic_point: [f64; 3],
    details: Json,
}

impl CylindricalBandClearanceEvidence {
    pub(crate) fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>().saturating_add(json_owned_bytes(&self.details) as usize)
    }

    pub(crate) fn to_json(&self) -> Json {
        self.details.clone()
    }
}

pub(crate) fn cylindrical_band_clearance(
    request: CylindricalBandClearanceRequest<'_>,
) -> Outcome<CylindricalBandClearanceEvidence> {
    match evaluate(request) {
        Ok((positive, evidence)) => Outcome::Decided { positive, evidence },
        Err(reason) => Outcome::Unsupported {
            reason,
            evidence: None,
        },
    }
}

fn stored(value: Rational) -> Result<Rational, ContinuousError> {
    if value.numer().bits() > STORED_BITS || value.denom().bits() > STORED_BITS {
        return Err(ContinuousError::resource(
            "Cylindrical-band retained rational exceeds its 2048-bit slot reservation.",
        ));
    }
    // Arithmetic can leave capacity from an unreduced larger integer. Clone
    // only AFTER checking bits: BigUint::clone copies the normalized limb slice,
    // so retained slots have at most 256 bytes per integer, not stale capacity.
    Ok(value.clone())
}

fn rat(value: f64) -> Result<Rational, ContinuousError> {
    stored(exact::rational(value)?)
}
fn add(a: &Rational, b: &Rational) -> Result<Rational, ContinuousError> {
    stored(exact::add(a, b)?)
}
fn sub(a: &Rational, b: &Rational) -> Result<Rational, ContinuousError> {
    stored(exact::subtract(a, b)?)
}
fn mul(a: &Rational, b: &Rational) -> Result<Rational, ContinuousError> {
    stored(exact::multiply(a, b)?)
}
fn div(a: &Rational, b: &Rational) -> Result<Rational, ContinuousError> {
    stored(exact::divide(a, b)?)
}
fn square(a: &Rational) -> Result<Rational, ContinuousError> {
    mul(a, a)
}

/// Only a+b*sqrt(N), with one positive rational N shared by the whole proof.
#[derive(Clone, Debug, PartialEq)]
struct Pair {
    a: Rational,
    b: Rational,
}

impl Pair {
    fn rational(a: Rational) -> Self {
        Self {
            a,
            b: Rational::zero(),
        }
    }
    fn add(&self, other: &Self) -> Result<Self, ContinuousError> {
        Ok(Self {
            a: add(&self.a, &other.a)?,
            b: add(&self.b, &other.b)?,
        })
    }
    fn subtract(&self, other: &Self) -> Result<Self, ContinuousError> {
        Ok(Self {
            a: sub(&self.a, &other.a)?,
            b: sub(&self.b, &other.b)?,
        })
    }
    fn multiply(&self, other: &Self, n: &Rational) -> Result<Self, ContinuousError> {
        let a = add(&mul(&self.a, &other.a)?, &mul(&mul(&self.b, &other.b)?, n)?)?;
        let b = add(&mul(&self.a, &other.b)?, &mul(&self.b, &other.a)?)?;
        Ok(Self { a, b })
    }
    fn sign(&self, n: &Rational) -> Result<Ordering, ContinuousError> {
        if self.a.is_zero() {
            return Ok(self.b.cmp(&Rational::zero()));
        }
        if self.b.is_zero() || self.a.is_positive() == self.b.is_positive() {
            return Ok(self.a.cmp(&Rational::zero()));
        }
        // These are temporary comparison products, not retained slots. Each
        // operation AND the cross-product comparison has the 8192-bit preflight.
        let aa = exact::multiply(&self.a, &self.a)?;
        let bb_n = exact::multiply(&exact::multiply(&self.b, &self.b)?, n)?;
        let ordering = checked_cmp(&aa, &bb_n)?;
        Ok(if self.a.is_positive() {
            ordering
        } else {
            ordering.reverse()
        })
    }
    fn cmp(&self, other: &Self, n: &Rational) -> Result<Ordering, ContinuousError> {
        self.subtract(other)?.sign(n)
    }
    fn json(&self) -> Result<Json, ContinuousError> {
        Ok(Json::object([
            ("rational", ratio(&self.a)?),
            ("sqrtCoefficient", ratio(&self.b)?),
        ]))
    }
    fn json_reservation(&self) -> usize {
        ratio_reservation(&self.a) + ratio_reservation(&self.b) + 256
    }
}

// Fixed bounded proof payload is covered by the existing arithmetic reservation;
// boxing changes its allocation behavior without reducing predicate work.
#[allow(clippy::large_enum_variant)]
enum Proof {
    Coaxial {
        radial_gap: Rational,
        axial_gap: Rational,
    },
    Circles {
        separation: Rational,
        lower: Rational,
        upper: Rational,
        overlap: [Rational; 2],
    },
    Generator {
        source_is_subject: bool,
        target_axis: usize,
        transverse_axis: usize,
        generator: usize,
        norm_squared: Rational,
        coefficients: [Pair; 3],
        interval: [Pair; 2],
        minimum_station: Pair,
        minimum_value: Pair,
        endpoint_values: [Pair; 2],
    },
}

impl Proof {
    fn json_reservation(&self) -> usize {
        match self {
            Self::Coaxial {
                radial_gap,
                axial_gap,
            } => ratio_reservation(radial_gap) + ratio_reservation(axial_gap),
            Self::Circles {
                separation,
                lower,
                upper,
                overlap,
            } => [separation, lower, upper, &overlap[0], &overlap[1]]
                .into_iter()
                .map(ratio_reservation)
                .sum(),
            Self::Generator {
                norm_squared,
                coefficients,
                interval,
                minimum_station,
                minimum_value,
                endpoint_values,
                ..
            } => {
                ratio_reservation(norm_squared)
                    + coefficients
                        .iter()
                        .chain(interval)
                        .chain([minimum_station, minimum_value])
                        .chain(endpoint_values)
                        .map(Pair::json_reservation)
                        .sum::<usize>()
            }
        }
    }
    fn json(&self) -> Result<Json, ContinuousError> {
        Ok(match self {
            Self::Coaxial {
                radial_gap,
                axial_gap,
            } => Json::object([
                ("kind", Json::string("coaxial-product-minimum")),
                ("radialGap", ratio(radial_gap)?),
                ("axialGap", ratio(axial_gap)?),
            ]),
            Self::Circles {
                separation,
                lower,
                upper,
                overlap,
            } => Json::object([
                ("kind", Json::string("common-station-circle-intersection")),
                ("transverseSeparationSquared", ratio(separation)?),
                ("radiusDifferenceSquared", ratio(lower)?),
                ("radiusSumSquared", ratio(upper)?),
                (
                    "commonWorldInterval",
                    Json::Array(overlap.iter().map(ratio).collect::<Result<_, _>>()?),
                ),
            ]),
            Self::Generator {
                source_is_subject,
                target_axis,
                transverse_axis,
                generator,
                norm_squared,
                coefficients,
                interval,
                minimum_station,
                minimum_value,
                endpoint_values,
            } => Json::object([
                ("kind", Json::string("finite-band-generator-sign-crossing")),
                (
                    "generatorEndpoint",
                    Json::string(if *source_is_subject {
                        "subject"
                    } else {
                        "target"
                    }),
                ),
                ("targetCartesianAxis", Json::Number(*target_axis as f64)),
                (
                    "sourceTransverseAxis",
                    Json::Number(*transverse_axis as f64),
                ),
                ("generatorOrdinal", Json::Number(*generator as f64)),
                (
                    "generatorOrder",
                    Json::string("derived-u,-derived-u,cartesian-v,-cartesian-v"),
                ),
                ("normSquared", ratio(norm_squared)?),
                ("coefficients", pair_array(coefficients)?),
                ("clippedInterval", pair_array(interval)?),
                ("minimumStation", minimum_station.json()?),
                ("negativeMinimum", minimum_value.json()?),
                ("endpointValues", pair_array(endpoint_values)?),
                (
                    "certificate",
                    Json::string("strict-negative-minimum-and-positive-endpoint"),
                ),
            ]),
        })
    }
}

fn pair_array(values: &[Pair]) -> Result<Json, ContinuousError> {
    Ok(Json::Array(
        values.iter().map(Pair::json).collect::<Result<_, _>>()?,
    ))
}
fn ratio(value: &Rational) -> Result<Json, ContinuousError> {
    Ok(ExactRatio::new(value)?.to_json())
}
fn ratio_reservation(value: &Rational) -> usize {
    // Decimal digit upper bound, including signs; four string buffers cover the
    // formatter, ExactRatio and direct JSON construction's temporary copies.
    let digits = (value.numer().bits() + value.denom().bits()) as usize * 30103 / 100000 + 4;
    512 + 4 * digits
}

fn cartesian(axis: [f64; 3]) -> Option<(usize, bool)> {
    let mut found = None;
    for (index, value) in axis.into_iter().enumerate() {
        if !value.is_finite() {
            return None;
        }
        if value != 0.0 {
            if found.is_some() {
                return None;
            }
            found = Some((index, value > 0.0));
        }
    }
    found
}

fn world_interval(
    band: &NominalCylindricalBand,
    axis: usize,
    positive: bool,
) -> Result<[Rational; 2], ContinuousError> {
    let origin = rat(band.origin[axis])?;
    Ok(if positive {
        [
            add(&origin, &rat(band.from)?)?,
            add(&origin, &rat(band.to)?)?,
        ]
    } else {
        [
            sub(&origin, &rat(band.to)?)?,
            sub(&origin, &rat(band.from)?)?,
        ]
    })
}

fn larger(a: Rational, b: Rational) -> Result<Rational, ContinuousError> {
    Ok(if checked_cmp(&a, &b)? == Ordering::Less {
        b
    } else {
        a
    })
}
fn smaller(a: Rational, b: Rational) -> Result<Rational, ContinuousError> {
    Ok(if checked_cmp(&a, &b)? == Ordering::Greater {
        b
    } else {
        a
    })
}

fn parallel(
    subject: &NominalCylindricalBand,
    target: &NominalCylindricalBand,
    axis: usize,
    subject_positive: bool,
    target_positive: bool,
) -> Result<(Rational, f64, Proof), ContinuousError> {
    let subject_interval = world_interval(subject, axis, subject_positive)?;
    let target_interval = world_interval(target, axis, target_positive)?;
    let overlap = [
        larger(subject_interval[0].clone(), target_interval[0].clone())?,
        smaller(subject_interval[1].clone(), target_interval[1].clone())?,
    ];
    let axial_gap = larger(Rational::zero(), sub(&overlap[0], &overlap[1])?)?;
    let radial_gap = sub(&rat(subject.radius)?, &rat(target.radius)?)?.abs();
    let mut separation = Rational::zero();
    for j in 0..3 {
        if j != axis {
            separation = add(
                &separation,
                &square(&sub(&rat(subject.origin[j])?, &rat(target.origin[j])?)?)?,
            )?;
        }
    }
    if separation.is_zero() {
        let squared = add(&square(&radial_gap)?, &square(&axial_gap)?)?;
        let distance = node24_hypot3([
            finite_display(&radial_gap)?,
            finite_display(&axial_gap)?,
            0.0,
        ]);
        if !distance.is_finite() {
            return Err(ContinuousError::unsupported(
                "Band distance has no finite diagnostic display.",
            ));
        }
        return Ok((
            squared,
            distance,
            Proof::Coaxial {
                radial_gap,
                axial_gap,
            },
        ));
    }
    let lower = square(&radial_gap)?;
    let upper = square(&add(&rat(subject.radius)?, &rat(target.radius)?)?)?;
    if axial_gap.is_zero()
        && checked_cmp(&lower, &separation)? != Ordering::Greater
        && checked_cmp(&separation, &upper)? != Ordering::Greater
    {
        return Ok((
            Rational::zero(),
            0.0,
            Proof::Circles {
                separation,
                lower,
                upper,
                overlap,
            },
        ));
    }
    Err(ContinuousError::unsupported(
        "Offset bands lack a certified common-station circle intersection.",
    ))
}

struct Frame {
    s: Rational,
    c: Rational,
    n: Rational,
    r: Rational,
    radius_squared: Rational,
    delta: [Rational; 3],
    source_interval: [Rational; 2],
    target_interval: [Rational; 2],
}

fn polynomial(coefficients: &[Pair; 3], t: &Pair, n: &Rational) -> Result<Pair, ContinuousError> {
    coefficients[0]
        .multiply(t, n)?
        .add(&coefficients[1])?
        .multiply(t, n)?
        .add(&coefficients[2])
}

type GeneratorCandidate = ([Pair; 3], [Pair; 2], Pair, Pair, [Pair; 2]);

fn generator(frame: &Frame, ordinal: usize) -> Result<Option<GeneratorCandidate>, ContinuousError> {
    let derived_u = ordinal < 2;
    let epsilon = rat(if ordinal % 2 == 0 { 1.0 } else { -1.0 })?;
    let signed_r = mul(&epsilon, &frame.r)?;
    let two = rat(2.0)?;
    let alpha = div(&square(&frame.s)?, &frame.n)?;
    let beta = Pair {
        a: if derived_u {
            div(
                &mul(&mul(&two, &signed_r)?, &mul(&frame.s, &frame.c)?)?,
                &frame.n,
            )?
        } else {
            Rational::zero()
        },
        b: div(&mul(&mul(&two, &frame.delta[1])?, &frame.s)?, &frame.n)?,
    };
    let gamma = if derived_u {
        Pair {
            a: sub(
                &add(
                    &add(&square(&frame.delta[0])?, &square(&frame.delta[1])?)?,
                    &div(&square(&mul(&frame.r, &frame.c)?)?, &frame.n)?,
                )?,
                &frame.radius_squared,
            )?,
            b: div(
                &mul(&mul(&mul(&two, &signed_r)?, &frame.delta[1])?, &frame.c)?,
                &frame.n,
            )?,
        }
    } else {
        Pair::rational(sub(
            &add(
                &square(&add(&frame.delta[0], &signed_r)?)?,
                &square(&frame.delta[1])?,
            )?,
            &frame.radius_squared,
        )?)
    };
    let coefficients = [Pair::rational(alpha.clone()), beta, gamma];
    let offset = if derived_u {
        mul(&signed_r, &frame.s)?
    } else {
        Rational::zero()
    };
    let endpoint = |bound: &Rational| -> Result<Pair, ContinuousError> {
        Ok(Pair {
            a: div(&offset, &frame.c)?,
            b: div(&sub(bound, &frame.delta[2])?, &frame.c)?,
        })
    };
    let mut interval = [
        endpoint(&frame.target_interval[0])?,
        endpoint(&frame.target_interval[1])?,
    ];
    if frame.c.is_negative() {
        interval.swap(0, 1);
    }
    let source_lower = Pair::rational(frame.source_interval[0].clone());
    let source_upper = Pair::rational(frame.source_interval[1].clone());
    if interval[0].cmp(&source_lower, &frame.n)? == Ordering::Less {
        interval[0] = source_lower;
    }
    if interval[1].cmp(&source_upper, &frame.n)? == Ordering::Greater {
        interval[1] = source_upper;
    }
    if interval[0].cmp(&interval[1], &frame.n)? != Ordering::Less {
        return Ok(None);
    }
    let denominator = mul(&two, &alpha)?;
    let mut minimum_station = Pair {
        a: div(&-coefficients[1].a.clone(), &denominator)?,
        b: div(&-coefficients[1].b.clone(), &denominator)?,
    };
    if minimum_station.cmp(&interval[0], &frame.n)? == Ordering::Less {
        minimum_station = interval[0].clone();
    }
    if minimum_station.cmp(&interval[1], &frame.n)? == Ordering::Greater {
        minimum_station = interval[1].clone();
    }
    let minimum_value = polynomial(&coefficients, &minimum_station, &frame.n)?;
    if minimum_value.sign(&frame.n)? != Ordering::Less {
        return Ok(None);
    }
    let endpoint_values = [
        polynomial(&coefficients, &interval[0], &frame.n)?,
        polynomial(&coefficients, &interval[1], &frame.n)?,
    ];
    if endpoint_values[0].sign(&frame.n)? != Ordering::Greater
        && endpoint_values[1].sign(&frame.n)? != Ordering::Greater
    {
        return Ok(None);
    }
    Ok(Some((
        coefficients,
        interval,
        minimum_station,
        minimum_value,
        endpoint_values,
    )))
}

fn tilted(
    subject: &NominalCylindricalBand,
    target: &NominalCylindricalBand,
) -> Result<Proof, ContinuousError> {
    let (source, target, source_is_subject, axis, target_positive) =
        if let Some((axis, sign)) = cartesian(target.axis) {
            (subject, target, true, axis, sign)
        } else if let Some((axis, sign)) = cartesian(subject.axis) {
            (target, subject, false, axis, sign)
        } else {
            return Err(ContinuousError::unsupported(
                "Band intersection requires an exact Cartesian target axis.",
            ));
        };
    let perpendicular = (0..3)
        .find(|j| *j != axis && source.axis[*j] == 0.0)
        .ok_or_else(|| {
            ContinuousError::unsupported(
                "Tilted source axis is outside the certified coordinate-plane expression.",
            )
        })?;
    let transverse = (0..3).find(|j| *j != axis && *j != perpendicular).unwrap();
    if source.axis[axis] == 0.0 || source.axis[transverse] == 0.0 {
        return Err(ContinuousError::unsupported(
            "Tilted band expression requires nonzero axial and transverse components.",
        ));
    }
    let s = rat(source.axis[transverse])?;
    let c = rat(source.axis[axis])?;
    let n = add(&square(&s)?, &square(&c)?)?;
    let difference = |j| sub(&rat(source.origin[j])?, &rat(target.origin[j])?);
    let frame = Frame {
        s,
        c,
        n,
        r: rat(source.radius)?,
        radius_squared: square(&rat(target.radius)?)?,
        delta: [
            difference(perpendicular)?,
            difference(transverse)?,
            difference(axis)?,
        ],
        source_interval: [rat(source.from)?, rat(source.to)?],
        target_interval: if target_positive {
            [rat(target.from)?, rat(target.to)?]
        } else {
            [-rat(target.to)?, -rat(target.from)?]
        },
    };
    for ordinal in 0..4 {
        if let Some((coefficients, interval, minimum_station, minimum_value, endpoint_values)) =
            generator(&frame, ordinal)?
        {
            return Ok(Proof::Generator {
                source_is_subject,
                target_axis: axis,
                transverse_axis: transverse,
                generator: ordinal,
                norm_squared: frame.n,
                coefficients,
                interval,
                minimum_station,
                minimum_value,
                endpoint_values,
            });
        }
    }
    Err(ContinuousError::unsupported(
        "No strict generator crossing was certified inside both finite bands.",
    ))
}

fn evaluate(
    request: CylindricalBandClearanceRequest<'_>,
) -> Result<(bool, CylindricalBandClearanceEvidence), ContinuousError> {
    validate(request.subject)?;
    validate(request.target)?;
    let tolerance = rat(request.tolerance)?;
    if tolerance.is_negative() {
        return Err(ContinuousError::invalid(
            "Clearance tolerance must be nonnegative.",
        ));
    }
    let effective_minimum = request
        .minimum
        .map(|v| sub(&rat(v)?, &tolerance))
        .transpose()?;
    let effective_maximum = request
        .maximum
        .map(|v| add(&rat(v)?, &tolerance))
        .transpose()?;
    let (squared, distance, proof) = match (
        cartesian(request.subject.axis),
        cartesian(request.target.axis),
    ) {
        (Some((a, sa)), Some((b, sb))) if a == b => {
            parallel(request.subject, request.target, a, sa, sb)?
        }
        _ => (
            Rational::zero(),
            0.0,
            tilted(request.subject, request.target)?,
        ),
    };
    let below_minimum = match &effective_minimum {
        Some(limit) if limit.is_positive() => {
            checked_cmp(&squared, &square(limit)?)? == Ordering::Less
        }
        _ => false,
    };
    let below_maximum = match &effective_maximum {
        Some(limit) => {
            !limit.is_negative() && checked_cmp(&squared, &square(limit)?)? != Ordering::Greater
        }
        None => true,
    };
    let reservation = RAW_JSON_RESERVE
        + proof.json_reservation()
        + ratio_reservation(&squared)
        + effective_minimum
            .iter()
            .chain(&effective_maximum)
            .map(ratio_reservation)
            .sum::<usize>();
    if reservation > MAX_JSON_BYTES {
        return Err(ContinuousError::resource(
            "Band proof exceeds the pre-allocation JSON reservation.",
        ));
    }
    let mut details = Json::object([
        ("profile", Json::string(PROFILE)),
        (
            "representation",
            Json::string("associated-complete-nominal-cylindrical-bands"),
        ),
        (
            "assurance",
            Json::string("exact-predicate-on-declared-nominal-band-model"),
        ),
        ("subject", band_json(request.subject)),
        ("target", band_json(request.target)),
        ("proof", proof.json()?),
        ("squaredDistance", ratio(&squared)?),
        (
            "comparison",
            Json::string("inclusive-exact-squared-distance"),
        ),
        (
            "endpointConvention",
            Json::string("closed-lateral-band-including-rim-circles-no-cap-disks"),
        ),
        ("diagnosticPoint", numbers(&request.subject.origin)),
        (
            "diagnosticPointRole",
            Json::string("source-origin-not-intersection-witness"),
        ),
    ]);
    if let Json::Object(fields) = &mut details {
        if let Some(minimum) = &effective_minimum {
            fields.push(("effectiveMinimum".into(), ratio(minimum)?));
        }
        if let Some(maximum) = &effective_maximum {
            fields.push(("effectiveMaximum".into(), ratio(maximum)?));
        }
    }
    let evidence = CylindricalBandClearanceEvidence {
        distance,
        below_minimum,
        diagnostic_point: request.subject.origin,
        details,
    };
    if evidence.owned_bytes() > MAX_JSON_BYTES {
        return Err(ContinuousError::resource(
            "Band evidence exceeds its pre-allocation JSON reservation.",
        ));
    }
    Ok((!below_minimum && below_maximum, evidence))
}

fn validate(band: &NominalCylindricalBand) -> Result<(), ContinuousError> {
    let finite = |v: &[f64]| v.iter().all(|x| x.is_finite());
    if !finite(&band.origin)
        || !finite(&band.axis)
        || !finite(&band.phase_x)
        || !finite(&band.phase_y)
        || !finite(&band.parameter_bounds)
        || !finite(&[
            band.radius,
            band.from,
            band.to,
            band.surface_period,
            band.face_tolerance_mm,
            band.period_residual_mm,
        ])
        || !finite(&band.edge_tolerances_mm)
        || !finite(&band.vertex_tolerances_mm)
        || !finite(&band.seam_origin)
        || !finite(&band.seam_axis)
        || !finite(&band.seam_curve_range)
        || band.axis.iter().all(|x| *x == 0.0)
        || band.radius <= 0.0
        || band.from >= band.to
        || band.surface_period <= 0.0
        || band.private_query_face == 0
        || band.source_face_entity == 0
        || band.source_route_count > 32
    {
        return Err(ContinuousError::unsupported(
            "Band certificate lacks finite associated nominal geometry.",
        ));
    }
    for rim in &band.rims {
        if !finite(&rim.center)
            || !finite(&rim.axis)
            || !finite(&rim.phase_x)
            || !finite(&rim.phase_y)
            || !finite(&rim.curve_range)
            || !finite(&[rim.radius, rim.curve_period])
        {
            return Err(ContinuousError::unsupported(
                "Band rim evidence must remain finite.",
            ));
        }
    }
    for boundary in &band.boundary {
        if !finite(&boundary.curve_range) || !boundary.parameter_endpoints.iter().all(|p| finite(p))
        {
            return Err(ContinuousError::unsupported(
                "Band boundary evidence must remain finite.",
            ));
        }
    }
    if !band.vertices.iter().all(|v| finite(&v.point))
        || band.face_tolerance_mm < 0.0
        || band.period_residual_mm < 0.0
        || band.period_residual_mm > band.face_tolerance_mm
        || band
            .edge_tolerances_mm
            .iter()
            .chain(&band.vertex_tolerances_mm)
            .any(|t| *t < 0.0)
        || !band.boundary_residuals.iter().all(|r| {
            finite(&[
                r.parameter_coverage_mm,
                r.curve_surface_mm,
                r.vertex_attachment_mm,
                r.limit_mm,
            ]) && r.limit_mm >= 0.0
                && [
                    r.parameter_coverage_mm,
                    r.curve_surface_mm,
                    r.vertex_attachment_mm,
                ]
                .iter()
                .all(|v| *v >= 0.0 && *v <= r.limit_mm)
        })
    {
        return Err(ContinuousError::unsupported(
            "Band attachment evidence must remain finite.",
        ));
    }
    Ok(())
}

fn numbers(values: &[f64]) -> Json {
    Json::Array(
        values
            .iter()
            .map(|v| Json::Number(if *v == 0.0 { 0.0 } else { *v }))
            .collect(),
    )
}
fn integers(values: &[u32]) -> Json {
    Json::Array(values.iter().map(|v| Json::Number((*v).into())).collect())
}

fn band_json(b: &NominalCylindricalBand) -> Json {
    Json::object([
        ("profile", Json::string(PROFILE)),
        ("occurrence", Json::Number(b.occurrence.into())),
        (
            "publicFaceOrdinal",
            Json::Number(b.public_face_ordinal.into()),
        ),
        (
            "privateQueryFace",
            Json::Number(b.private_query_face.into()),
        ),
        (
            "sourceFaceEntity",
            Json::Number(b.source_face_entity.into()),
        ),
        (
            "sourceRoute",
            integers(&b.source_route[..b.source_route_count as usize]),
        ),
        ("sourceSameSense", Json::Bool(b.source_same_sense)),
        ("transferredReversed", Json::Bool(b.transferred_reversed)),
        ("origin", numbers(&b.origin)),
        ("axis", numbers(&b.axis)),
        ("phaseX", numbers(&b.phase_x)),
        ("phaseY", numbers(&b.phase_y)),
        ("radius", Json::Number(b.radius)),
        ("from", Json::Number(b.from)),
        ("to", Json::Number(b.to)),
        ("parameterBounds", numbers(&b.parameter_bounds)),
        ("surfacePeriod", Json::Number(b.surface_period)),
        (
            "rims",
            Json::Array(
                b.rims
                    .iter()
                    .map(|r| {
                        Json::object([
                            ("edgeIndex", Json::Number(r.edge_index.into())),
                            ("center", numbers(&r.center)),
                            ("axis", numbers(&r.axis)),
                            ("phaseX", numbers(&r.phase_x)),
                            ("phaseY", numbers(&r.phase_y)),
                            ("radius", Json::Number(r.radius)),
                            ("curveRange", numbers(&r.curve_range)),
                            ("curvePeriod", Json::Number(r.curve_period)),
                            ("vertexIndices", integers(&r.vertex_indices)),
                        ])
                    })
                    .collect(),
            ),
        ),
        ("seamEdgeIndex", Json::Number(b.seam_edge_index.into())),
        ("seamOrigin", numbers(&b.seam_origin)),
        ("seamAxis", numbers(&b.seam_axis)),
        ("seamCurveRange", numbers(&b.seam_curve_range)),
        ("seamVertexIndices", integers(&b.seam_vertex_indices)),
        (
            "boundary",
            Json::Array(
                b.boundary
                    .iter()
                    .map(|u| {
                        Json::object([
                            ("edgeIndex", Json::Number(u.edge_index.into())),
                            (
                                "orientation",
                                Json::string(match u.orientation {
                                    CylinderBoundaryOrientation::Forward => "forward",
                                    CylinderBoundaryOrientation::Reversed => "reversed",
                                }),
                            ),
                            (
                                "side",
                                Json::string(match u.side {
                                    CylinderBoundarySide::U0 => "u0",
                                    CylinderBoundarySide::U1 => "u1",
                                    CylinderBoundarySide::V0 => "v0",
                                    CylinderBoundarySide::V1 => "v1",
                                }),
                            ),
                            ("curveRange", numbers(&u.curve_range)),
                            ("pcurveStored", Json::Bool(u.pcurve_stored)),
                            (
                                "parameterEndpoints",
                                Json::Array(
                                    u.parameter_endpoints.iter().map(|p| numbers(p)).collect(),
                                ),
                            ),
                        ])
                    })
                    .collect(),
            ),
        ),
        (
            "vertices",
            Json::Array(
                b.vertices
                    .iter()
                    .map(|v| {
                        Json::object([
                            ("vertexIndex", Json::Number(v.vertex_index.into())),
                            ("point", numbers(&v.point)),
                        ])
                    })
                    .collect(),
            ),
        ),
        ("faceToleranceMm", Json::Number(b.face_tolerance_mm)),
        ("edgeTolerancesMm", numbers(&b.edge_tolerances_mm)),
        ("vertexTolerancesMm", numbers(&b.vertex_tolerances_mm)),
        ("periodResidualMm", Json::Number(b.period_residual_mm)),
        (
            "boundaryResiduals",
            Json::Array(
                b.boundary_residuals
                    .iter()
                    .map(|r| {
                        Json::object([
                            ("parameterCoverageMm", Json::Number(r.parameter_coverage_mm)),
                            ("curveSurfaceMm", Json::Number(r.curve_surface_mm)),
                            ("vertexAttachmentMm", Json::Number(r.vertex_attachment_mm)),
                            ("limitMm", Json::Number(r.limit_mm)),
                        ])
                    })
                    .collect(),
            ),
        ),
    ])
}

#[cfg(test)]
mod tests {
    use super::super::clearance::CLEARANCE_MAX_OWNED_BYTES;
    use super::*;
    use crate::backend::brep::{
        CylinderBoundaryUse, CylinderVertex, CylindricalBandBoundaryResidual,
        CylindricalBandProfile, CylindricalBandRim,
    };
    use num_bigint::BigInt;

    // Predicate-only associated inputs. C1 attachment admission is independently
    // owned; these records do not claim a new STEP or kernel qualification run.
    fn band(
        radius: f64,
        axis: [f64; 3],
        origin: [f64; 3],
        interval: [f64; 2],
    ) -> NominalCylindricalBand {
        NominalCylindricalBand {
            profile: CylindricalBandProfile::NominalV1,
            occurrence: 1,
            public_face_ordinal: 2,
            private_query_face: 3,
            source_face_entity: 100,
            source_route_count: 1,
            source_route: std::array::from_fn(|i| if i == 0 { 200 } else { 0 }),
            source_same_sense: true,
            transferred_reversed: false,
            origin,
            axis,
            phase_x: [1.0, 0.0, 0.0],
            phase_y: [0.0, 1.0, 0.0],
            radius,
            from: interval[0],
            to: interval[1],
            parameter_bounds: [0.0, std::f64::consts::TAU, interval[0], interval[1]],
            surface_period: std::f64::consts::TAU,
            rims: std::array::from_fn(|i| CylindricalBandRim {
                edge_index: i as u32 + 1,
                center: origin,
                axis,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 1.0, 0.0],
                radius,
                curve_range: [0.0, std::f64::consts::TAU],
                curve_period: std::f64::consts::TAU,
                vertex_indices: [i as u32 + 1; 2],
            }),
            seam_edge_index: 3,
            seam_origin: origin,
            seam_axis: axis,
            seam_curve_range: interval,
            seam_vertex_indices: [1, 2],
            boundary: std::array::from_fn(|i| CylinderBoundaryUse {
                edge_index: [3, 3, 1, 2][i],
                orientation: if i % 2 == 0 {
                    CylinderBoundaryOrientation::Forward
                } else {
                    CylinderBoundaryOrientation::Reversed
                },
                side: [
                    CylinderBoundarySide::U0,
                    CylinderBoundarySide::U1,
                    CylinderBoundarySide::V0,
                    CylinderBoundarySide::V1,
                ][i],
                curve_range: interval,
                pcurve_stored: true,
                parameter_endpoints: [[0.0, 0.0]; 2],
            }),
            vertices: std::array::from_fn(|i| CylinderVertex {
                vertex_index: i as u32 + 1,
                point: origin,
            }),
            face_tolerance_mm: 1e-7,
            edge_tolerances_mm: [1e-7; 3],
            vertex_tolerances_mm: [1e-7; 2],
            period_residual_mm: 0.0,
            boundary_residuals: [CylindricalBandBoundaryResidual {
                parameter_coverage_mm: 0.0,
                curve_surface_mm: 0.0,
                vertex_attachment_mm: 0.0,
                limit_mm: 1e-7,
            }; 4],
        }
    }

    fn request<'a>(
        subject: &'a NominalCylindricalBand,
        target: &'a NominalCylindricalBand,
    ) -> CylindricalBandClearanceRequest<'a> {
        CylindricalBandClearanceRequest {
            subject,
            target,
            minimum: None,
            maximum: None,
            tolerance: 0.0,
        }
    }

    fn decided(
        subject: &NominalCylindricalBand,
        target: &NominalCylindricalBand,
    ) -> CylindricalBandClearanceEvidence {
        match cylindrical_band_clearance(request(subject, target)) {
            Outcome::Decided {
                positive: true,
                evidence,
            } => evidence,
            other => panic!("independent control should decide: {other:?}"),
        }
    }

    fn field<'a>(value: &'a Json, name: &str) -> &'a Json {
        let Json::Object(fields) = value else {
            panic!("expected object")
        };
        &fields.iter().find(|(key, _)| key == name).unwrap().1
    }

    #[test]
    fn c2_independent_equal_opposite_disjoint_circle_controls() {
        // Frozen controls.md/oracle.py values, never fitted to this implementation.
        for (r1, r2, d, z, az, i1, i2, expected) in [
            (2.0, 2.0, 0.0, 6.0, -11.0, [0.0, 4.0], [2.0, 6.0], Some(0.0)),
            (2.0, 5.0, 0.0, 5.0, -3.0, [0.0, 2.0], [1.0, 3.0], Some(9.0)),
            (2.0, 5.0, 0.0, 0.0, 3.0, [0.0, 1.0], [5.0, 7.0], Some(25.0)),
            (2.0, 2.0, 0.0, 0.0, 3.0, [0.0, 1.0], [5.0, 7.0], Some(16.0)),
            (3.0, 2.0, 4.0, 0.0, 3.0, [0.0, 2.0], [1.0, 3.0], Some(0.0)),
            (3.0, 2.0, 5.0, 0.0, 3.0, [0.0, 2.0], [1.0, 3.0], Some(0.0)),
            (3.0, 2.0, 1.0, 0.0, 3.0, [0.0, 2.0], [1.0, 3.0], Some(0.0)),
            (3.0, 2.0, 6.0, 0.0, 3.0, [0.0, 2.0], [1.0, 3.0], None),
            (3.0, 2.0, 0.5, 0.0, 3.0, [0.0, 2.0], [1.0, 3.0], None),
            (3.0, 2.0, 4.0, 0.0, 3.0, [0.0, 1.0], [2.0, 3.0], None),
        ] {
            let source = band(r1, [0.0, 0.0, 2.0], [0.0; 3], i1);
            let target = band(r2, [0.0, 0.0, az], [d, 0.0, z], i2);
            let outcome = cylindrical_band_clearance(request(&source, &target));
            match (expected, outcome) {
                (
                    Some(d),
                    Outcome::Decided {
                        positive: true,
                        evidence,
                    },
                ) => {
                    assert_eq!(
                        field(&evidence.to_json(), "squaredDistance"),
                        &ratio(&rat(d).unwrap()).unwrap()
                    );
                }
                (
                    None,
                    Outcome::Unsupported {
                        reason,
                        evidence: None,
                    },
                ) => assert_eq!(
                    reason.kind,
                    super::super::ContinuousErrorKind::UnsupportedDomain
                ),
                pair => panic!("unexpected C2 control: {pair:?}"),
            }
        }
    }

    #[test]
    fn c3_independent_crossing_clipped_nonintersection_and_irrational_axis() {
        for (axis, source_range, radius, target_range, zero) in [
            ([3.0, 0.0, 4.0], [0.0, 3.0], 2.0, [-1.0, 3.0], true),
            ([3.0, 0.0, 4.0], [0.0, 3.0], 2.0, [-0.6, 0.0], false),
            ([3.0, 0.0, 4.0], [0.0, 1.0], 10.0, [-2.0, 2.0], false),
            ([1.0, 0.0, 1.0], [0.0, 3.0], 2.0, [0.0, 3.0], true),
            ([0.6, 0.0, 0.8], [0.0, 3.0], 2.0, [-1.0, 3.0], true),
        ] {
            let source = band(1.0, axis, [0.0; 3], source_range);
            let target = band(radius, [0.0, 0.0, 7.0], [0.0; 3], target_range);
            if zero {
                let result = decided(&source, &target);
                assert_eq!(result.distance.to_bits(), 0.0_f64.to_bits());
                assert_eq!(
                    field(&result.to_json(), "squaredDistance"),
                    &ratio(&Rational::zero()).unwrap()
                );
                assert_eq!(
                    field(field(&result.to_json(), "proof"), "kind"),
                    &Json::string("finite-band-generator-sign-crossing")
                );
            } else {
                assert!(matches!(
                    cylindrical_band_clearance(request(&source, &target)),
                    Outcome::Unsupported { evidence: None, .. }
                ));
            }
        }
    }

    #[test]
    fn shifted_origins_permuted_directions_signed_axes_and_endpoint_roles() {
        // For S=(0,3,4), d=(1/8,1/16,1/8), U gives f(0)<0<f(3),
        // while z(t) lies in [-19/40,77/40] inside [-1,3]. No root estimate used.
        for axis in 0..3 {
            let shift = |v: [f64; 3]| std::array::from_fn(|j| v[(j + 2 + 3 - axis) % 3]);
            let mut source = band(
                1.0,
                shift([0.0, 3.0, 4.0]),
                shift([0.125, 0.0625, 0.125]),
                [0.0, 3.0],
            );
            let mut target = band(2.0, shift([0.0, 0.0, 7.0]), [0.0; 3], [-1.0, 3.0]);
            assert_eq!(decided(&source, &target).distance, 0.0);
            assert_eq!(decided(&target, &source).distance, 0.0);
            // Reverse both parameter directions without changing either set.
            source.axis = source.axis.map(|x| -x);
            source.from = -3.0;
            source.to = 0.0;
            target.axis = target.axis.map(|x| -x);
            target.from = -3.0;
            target.to = 1.0;
            source.source_same_sense = false;
            source.transferred_reversed = true;
            // Raw phases are provenance, not an exact rational orthonormal basis.
            source.phase_x = [2.0, 1.0, 0.0];
            source.phase_y = [1.0, 3.0, 0.0];
            assert_eq!(decided(&source, &target).distance, 0.0);
        }
    }

    #[test]
    fn signed_inclusive_limits_are_not_squared_without_signs() {
        let source = band(2.0, [0.0, 0.0, 1.0], [0.0; 3], [0.0, 1.0]);
        let target = band(5.0, [0.0, 0.0, 1.0], [0.0; 3], [5.0, 7.0]);
        for (minimum, maximum, tolerance, positive) in [
            (Some(5.0), Some(5.0), 0.0, true),
            (Some(0.0), Some(4.0), 0.0, false),
            (Some(-1.0), Some(5.0), 0.0, true),
            (None, Some(-1.0), 0.0, false),
            (Some(6.0), Some(4.0), 1.0, true),
        ] {
            let outcome = cylindrical_band_clearance(CylindricalBandClearanceRequest {
                subject: &source,
                target: &target,
                minimum,
                maximum,
                tolerance,
            });
            assert!(
                matches!(outcome, Outcome::Decided { positive: actual, .. } if actual == positive)
            );
        }
    }

    #[test]
    fn original_c1_captured_shifted_tilts_preserve_zero_and_signed_limits() {
        // C1 attempt-1 captured binary64 inputs, not reconstructed STEP decimals.
        // Both original tilted subjects have an intersection (frozen inventory);
        // these core controls do not substitute for C1/runtime association tests.
        let target = band(25.04, [0.0, 0.0, 1.0], [0.0; 3], [0.0, 30.0]);
        let observations: Vec<_> = [
            (
                [0.0, 0.65429081048, 0.01427667627213],
                [0.0, -0.043619387365333794, 0.9990482215818579],
            ),
            (
                [0.0, 0.261786096559, 0.002284572654132],
                [0.0, -0.01745240643728683, 0.9998476951563912],
            ),
        ]
        .into_iter()
        .flat_map(|(origin, axis)| {
            let source = band(25.0, axis, origin, [0.0, 30.0]);
            [0.0, 0.01].map(|minimum| {
                cylindrical_band_clearance(CylindricalBandClearanceRequest {
                    minimum: Some(minimum),
                    maximum: Some(0.0),
                    ..request(&source, &target)
                })
            })
        })
        .collect();
        // Capture all four first; no earlier assertion hides the second shape.
        for (index, observation) in observations.iter().enumerate() {
            println!("captured-tilt-{index}: {observation:?}");
        }
        for (index, observation) in observations.into_iter().enumerate() {
            match observation {
                Outcome::Decided { positive, evidence } => {
                    assert_eq!(positive, index % 2 == 0);
                    assert_eq!(evidence.distance, 0.0);
                    assert_eq!(evidence.below_minimum, index % 2 != 0);
                }
                other => panic!("captured tilt {index} must certify zero: {other:?}"),
            }
        }
    }

    #[test]
    fn pre_call_reservation_and_output_bounds() {
        assert_eq!(
            CYLINDRICAL_BAND_PREDICATE_RESERVATION_BYTES,
            ARITHMETIC_RESERVATION.max(OUTPUT_RESERVATION)
        );
        const {
            assert!(
                CYLINDRICAL_BAND_PREDICATE_RESERVATION_BYTES
                    + CYLINDRICAL_BAND_INPUT_PAIR_BYTES
                    + CYLINDRICAL_BAND_EVIDENCE_RESERVATION_BYTES
                    <= CLEARANCE_MAX_OWNED_BYTES
            );
        }
        const {
            assert!(
                2 * CYLINDRICAL_BAND_EVIDENCE_RESERVATION_BYTES
                    + CYLINDRICAL_BAND_ENCODING_RESERVATION_BYTES
                    + CYLINDRICAL_BAND_INPUT_PAIR_BYTES
                    <= CLEARANCE_MAX_OWNED_BYTES
            );
        }
        let mut source = band(1.0, [0.0, 3.0, 4.0], [0.125, 0.0625, 0.125], [0.0, 3.0]);
        source.source_route_count = 32;
        source.source_route = [u32::MAX; 32];
        let mut target = band(2.0, [0.0, 0.0, 1.0], [0.0; 3], [-1.0, 3.0]);
        target.source_route_count = 32;
        target.source_route = [u32::MAX; 32];
        let evidence = decided(&source, &target);
        let output = evidence.to_json();
        assert!(
            json_owned_bytes(&band_json(&source)) as usize
                + json_owned_bytes(&band_json(&target)) as usize
                + 4096
                <= RAW_JSON_RESERVE
        );
        for bits in [1usize, 63, 64, 1024, 2048] {
            let value = Rational::new(
                -(BigInt::from(1) << (bits - 1)),
                (BigInt::from(1) << (bits - 1)) + 1,
            );
            assert!(
                json_owned_bytes(&ratio(&value).unwrap()) as usize <= ratio_reservation(&value)
            );
        }
        assert!(evidence.owned_bytes() <= CYLINDRICAL_BAND_EVIDENCE_RESERVATION_BYTES);
        let encoded = crate::codec::encode(&output).unwrap();
        assert!(encoded.len() <= CYLINDRICAL_BAND_ENCODING_RESERVATION_BYTES / 2);
        println!(
            "reservation={} input_pair={} evidence={} encoded_len={} encoded_capacity={}",
            CYLINDRICAL_BAND_PREDICATE_RESERVATION_BYTES,
            CYLINDRICAL_BAND_INPUT_PAIR_BYTES,
            evidence.owned_bytes(),
            encoded.len(),
            encoded.capacity()
        );
    }

    #[test]
    fn same_field_sign_normalization_and_preallocation_guards() {
        let n = rat(2.0).unwrap();
        for (a, b, expected) in [
            (1.0, -1.0, Ordering::Less),
            (-1.0, 1.0, Ordering::Greater),
            (2.0, -1.0, Ordering::Greater),
            (-2.0, 1.0, Ordering::Less),
            (0.0, -1.0, Ordering::Less),
        ] {
            assert_eq!(
                Pair {
                    a: rat(a).unwrap(),
                    b: rat(b).unwrap()
                }
                .sign(&n)
                .unwrap(),
                expected
            );
        }
        assert_eq!(
            Pair {
                a: rat(2.0).unwrap(),
                b: rat(-1.0).unwrap()
            }
            .sign(&rat(4.0).unwrap())
            .unwrap(),
            Ordering::Equal
        );
        assert!(
            add(
                &square(&rat(0.6).unwrap()).unwrap(),
                &square(&rat(0.8).unwrap()).unwrap()
            )
            .unwrap()
                > rat(1.0).unwrap()
        );
        let large = Rational::from_integer(BigInt::from(1) << 8191usize);
        assert!(matches!(
            exact::multiply(&large, &rat(2.0).unwrap()),
            Err(ContinuousError {
                kind: super::super::ContinuousErrorKind::ArithmeticLimit,
                ..
            })
        ));
        assert!(matches!(
            exact::divide(&large, &rat(0.5).unwrap()),
            Err(ContinuousError {
                kind: super::super::ContinuousErrorKind::ArithmeticLimit,
                ..
            })
        ));
        assert!(exact::divide(&rat(1.0).unwrap(), &Rational::zero()).is_err());
        assert!(matches!(
            stored(Rational::from_integer(BigInt::from(1) << 2048usize)),
            Err(ContinuousError {
                kind: super::super::ContinuousErrorKind::ResourceLimit,
                ..
            })
        ));
    }

    #[test]
    fn nonfinite_degenerate_or_uncertified_frames_refuse_without_evidence() {
        let target = band(2.0, [0.0, 0.0, 1.0], [0.0; 3], [-1.0, 3.0]);
        for axis in [
            [0.0; 3],
            [f64::NAN, 0.0, 1.0],
            [1.0, 1.0, 1.0],
            [1.0, 0.0, 0.0],
        ] {
            let source = band(1.0, axis, [0.0; 3], [0.0, 3.0]);
            assert!(matches!(
                cylindrical_band_clearance(request(&source, &target)),
                Outcome::Unsupported { evidence: None, .. }
            ));
        }
        let mut source = band(1.0, [0.0, 3.0, 4.0], [0.0; 3], [0.0, 3.0]);
        source.boundary_residuals[0].curve_surface_mm = 1.0;
        assert!(matches!(
            cylindrical_band_clearance(request(&source, &target)),
            Outcome::Unsupported { evidence: None, .. }
        ));
    }

    #[test]
    fn complete_raw_provenance_diagnostic_semantics_and_owned_reservation() {
        let source = band(1.0, [0.0, 3.0, 4.0], [0.0; 3], [0.0, 3.0]);
        let target = band(2.0, [0.0, 0.0, 7.0], [0.0; 3], [-1.0, 3.0]);
        let evidence = decided(&source, &target);
        assert!(evidence.owned_bytes() <= MAX_JSON_BYTES);
        assert!(
            4 * evidence.owned_bytes() + 4 * std::mem::size_of::<NominalCylindricalBand>()
                <= CLEARANCE_MAX_OWNED_BYTES
        );
        let details = evidence.to_json();
        assert_eq!(field(&details, "profile"), &Json::string(PROFILE));
        assert_eq!(
            field(&details, "diagnosticPointRole"),
            &Json::string("source-origin-not-intersection-witness")
        );
        let raw = field(&details, "subject");
        assert_eq!(field(raw, "axis"), &numbers(&source.axis));
        assert_eq!(
            field(raw, "boundary"),
            field(&band_json(&source), "boundary")
        );
        assert_eq!(field(raw, "sourceRoute"), &integers(&[200]));
        assert!(2 * json_owned_bytes(raw) as usize + 4096 <= RAW_JSON_RESERVE);
        assert_eq!(
            evidence,
            decided(&source, &target),
            "repeat evaluation retains the same pure proof, without a cache"
        );
    }
}
