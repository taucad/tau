//! Shared lexical/rational syntax only. Producer and checker own separate admission.

use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::Zero;
use sha2::{Digest, Sha256};
use std::str::FromStr;

use super::plate_contract::{
    Box3, PlateError, PlateErrorKind, Point3, RationalText, RawPlate, MAX_INTEGER_BITS,
    MAX_PRIMARY_BYTES, MAX_WINDOWS, PROFILE,
};
use crate::codec::{self, Json};

/// Immutable syntax owner. JSON is parsed and primary bytes hashed once here.
/// Sharing this owner does not share either geometry/admission implementation.
pub struct PlateSource {
    primary: Vec<u8>,
    primary_hash: String,
    raw: RawPlate,
}

impl PlateSource {
    pub fn decode(primary: Vec<u8>) -> Result<Self, PlateError> {
        if primary.len() > MAX_PRIMARY_BYTES {
            return Err(invalid("Rational plate primary exceeds 64 KiB."));
        }
        let value = codec::decode(&primary).map_err(|error| invalid(error.to_string()))?;
        let canonical = codec::encode(&value).map_err(|error| invalid(error.to_string()))?;
        if canonical != primary {
            return Err(invalid("Rational plate primary must use canonical UTF8."));
        }
        let mut root = object(value, &["schema", "unit", "frame", "plate", "windows"])?;
        if text(take(&mut root, "schema")?)? != PROFILE
            || text(take(&mut root, "unit")?)? != "mm"
            || text(take(&mut root, "frame")?)? != "artifact-xyz"
        {
            return Err(PlateError::new(
                PlateErrorKind::UnsupportedDomain,
                "The subject is outside geospec.rational-orthogonal-plate/v1.",
            ));
        }
        let plate = raw_box(take(&mut root, "plate")?)?;
        let Json::Array(values) = take(&mut root, "windows")? else {
            return Err(invalid("Rational plate windows must be an array."));
        };
        if values.len() > MAX_WINDOWS {
            return Err(invalid("Rational plate primary exceeds 16 windows."));
        }
        let windows = values
            .into_iter()
            .map(raw_box)
            .collect::<Result<Vec<_>, _>>()?;
        let primary_hash = format!("{:x}", Sha256::digest(&primary));
        Ok(Self {
            primary,
            primary_hash,
            raw: RawPlate { plate, windows },
        })
    }

    pub fn primary_bytes(&self) -> &[u8] {
        &self.primary
    }
    pub fn primary_hash(&self) -> &str {
        &self.primary_hash
    }
    pub fn raw(&self) -> &RawPlate {
        &self.raw
    }

    /// Owned lexical containers, including spare capacities; no BigInt is retained.
    pub(crate) fn owned_bytes(&self) -> usize {
        fn bounds(value: &Box3) -> usize {
            value
                .min
                .iter()
                .chain(&value.max)
                .map(|v| v.0.capacity())
                .sum()
        }
        std::mem::size_of::<Self>()
            .saturating_add(self.primary.capacity())
            .saturating_add(self.primary_hash.capacity())
            .saturating_add(self.raw.windows.capacity() * std::mem::size_of::<Box3>())
            .saturating_add(bounds(&self.raw.plate))
            .saturating_add(self.raw.windows.iter().map(bounds).sum::<usize>())
    }
}

/// Parse canonical source coordinates without asserting geometric domain membership.
pub fn input_rational(value: &RationalText) -> Result<BigRational, PlateError> {
    let ratio = exact_rational(value)?;
    if ratio.numer().bits() > 63 || ratio.denom().bits() > 63 {
        return Err(invalid(
            "Rational plate input integers must be less than 2^63 in magnitude.",
        ));
    }
    Ok(ratio)
}

/// Exact certificate/intermediate syntax; reduced integer values stay within r2's guard.
pub fn exact_rational(value: &RationalText) -> Result<BigRational, PlateError> {
    let Some((numerator, denominator)) = value.0.split_once('/') else {
        return Err(invalid(
            "Rational coordinates require reduced n/d spelling.",
        ));
    };
    if !integer_spelling(numerator, true)
        || !integer_spelling(denominator, false)
        || denominator == "0"
        || numerator.len() > 5000
        || denominator.len() > 5000
    {
        return Err(invalid(
            "Rational coordinates require reduced n/d spelling.",
        ));
    }
    let numerator = BigInt::from_str(numerator).map_err(|error| invalid(error.to_string()))?;
    let denominator = BigInt::from_str(denominator).map_err(|error| invalid(error.to_string()))?;
    if numerator.bits() > MAX_INTEGER_BITS || denominator.bits() > MAX_INTEGER_BITS {
        return Err(PlateError::new(
            PlateErrorKind::ArithmeticLimit,
            "Rational integer exceeds the declared bit guard.",
        ));
    }
    if denominator.is_zero() {
        return Err(invalid("Rational denominator must be positive."));
    }
    let ratio = BigRational::new(numerator, denominator);
    if format!("{}/{}", ratio.numer(), ratio.denom()) != value.0 {
        return Err(invalid(
            "Rational coordinates require reduced n/d spelling.",
        ));
    }
    Ok(ratio)
}

pub fn rational_text(value: &BigRational) -> Result<RationalText, PlateError> {
    if value.numer().bits() > MAX_INTEGER_BITS || value.denom().bits() > MAX_INTEGER_BITS {
        return Err(PlateError::new(
            PlateErrorKind::ArithmeticLimit,
            "Rational integer exceeds the declared bit guard.",
        ));
    }
    Ok(RationalText(format!("{}/{}", value.numer(), value.denom())))
}

fn integer_spelling(value: &str, signed: bool) -> bool {
    let digits = if signed {
        value.strip_prefix('-').unwrap_or(value)
    } else {
        value
    };
    !digits.is_empty()
        && digits.bytes().all(|byte| byte.is_ascii_digit())
        && (digits == "0" || !digits.starts_with('0'))
        && value != "-0"
}

fn raw_box(value: Json) -> Result<Box3, PlateError> {
    let mut fields = object(value, &["min", "max"])?;
    Ok(Box3 {
        min: point(take(&mut fields, "min")?)?,
        max: point(take(&mut fields, "max")?)?,
    })
}

fn point(value: Json) -> Result<Point3, PlateError> {
    let Json::Array(values) = value else {
        return Err(invalid("Rational point must have three coordinates."));
    };
    let values: [Json; 3] = values
        .try_into()
        .map_err(|_| invalid("Rational point must have three coordinates."))?;
    let mut coordinates = Vec::with_capacity(3);
    for value in values {
        let coordinate = RationalText(text(value)?);
        input_rational(&coordinate)?;
        coordinates.push(coordinate);
    }
    coordinates
        .try_into()
        .map_err(|_| invalid("Rational point must have three coordinates."))
}

fn object(value: Json, required: &[&str]) -> Result<Vec<(String, Json)>, PlateError> {
    let Json::Object(fields) = value else {
        return Err(invalid("Rational plate field must be an object."));
    };
    if fields.len() != required.len()
        || fields
            .iter()
            .any(|(name, _)| !required.contains(&name.as_str()))
    {
        return Err(invalid(
            "Rational plate object fields do not match the fixed schema.",
        ));
    }
    Ok(fields)
}

fn take(fields: &mut Vec<(String, Json)>, name: &str) -> Result<Json, PlateError> {
    let index = fields
        .iter()
        .position(|(key, _)| key == name)
        .ok_or_else(|| invalid("Required rational plate field is absent."))?;
    Ok(fields.remove(index).1)
}

fn text(value: Json) -> Result<String, PlateError> {
    let Json::String(text) = value else {
        return Err(invalid("Rational plate field must be a string."));
    };
    Ok(text)
}

fn invalid(message: impl Into<String>) -> PlateError {
    PlateError::new(PlateErrorKind::InvalidRepresentation, message)
}
