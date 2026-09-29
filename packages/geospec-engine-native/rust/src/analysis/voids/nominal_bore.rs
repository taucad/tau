//! Positive-only certificate inside a complete selected material's clear bore.
use num_rational::BigRational;
use num_traits::ToPrimitive;

use super::Claim;
use crate::{
    backend::brep::{CircularBoreTermination, SelectedBoreVoid},
    codec::Json,
};

pub(crate) const MAX_WAYPOINTS: usize = 16;
pub(crate) const RESERVATION_BYTES: u64 = 256 * 1024;

// Finite binary64 inputs lift with at most 2099-bit numerators/denominators.
// This fixed expression uses differences and one square, never elimination or
// iterative products: intermediate bit lengths are below the existing 8192 cap.
fn rational(value: f64) -> Result<BigRational, &'static str> {
    BigRational::from_float(value).ok_or("Nonfinite nominal bore input.")
}

pub(crate) fn prove(claim: &Claim, bore: &SelectedBoreVoid) -> Result<Json, &'static str> {
    if claim.materials.as_slice() != [bore.band.occurrence]
        || claim.material_paths.len() != 1
        || !claim.isolated_from.is_empty()
    {
        return Err(
            "The bore certificate requires one complete selected material and no unproved isolation constraint.",
        );
    }
    if !(2..=MAX_WAYPOINTS).contains(&claim.waypoints.len()) {
        return Err("The bore certificate requires 2..16 axial waypoints.");
    }
    let band = &bore.band;
    if !band.transferred_reversed
        || band.source_face_entity == 0
        || band.source_route_count == 0
        || band.source_route_count > 32
        || band.private_query_face == 0
        || bore
            .ends
            .iter()
            .any(|e| e.termination != CircularBoreTermination::Mouth)
    {
        return Err("Complete associated two-mouth selected-material evidence is required.");
    }
    let axis = (0..3)
        .find(|&i| band.axis[i].abs() == 1.0 && (0..3).all(|j| i == j || band.axis[j] == 0.0))
        .ok_or("The initial bore void domain requires a Cartesian raw axis.")?;
    let origin = band
        .origin
        .map(rational)
        .into_iter()
        .collect::<Result<Vec<_>, _>>()?;
    let from = rational(band.from)?;
    let to = rational(band.to)?;
    let radius = rational(band.radius)?;
    if from >= to || band.radius <= 0.0 {
        return Err("Invalid finite bore band.");
    }
    let mut stations = Vec::new();
    for point in &claim.waypoints {
        let coordinates = point
            .map(rational)
            .into_iter()
            .collect::<Result<Vec<_>, _>>()?;
        if (0..3).any(|i| i != axis && coordinates[i] != origin[i]) {
            return Err("The path is not on the certified bore axis.");
        }
        let station = (&coordinates[axis] - &origin[axis]) * rational(band.axis[axis])?;
        if station <= from || station >= to {
            return Err("The full axial path must be strictly between the certified mouths.");
        }
        if (0..3).any(|i| {
            !claim.region.min[i].is_finite()
                || !claim.region.max[i].is_finite()
                || point[i] <= claim.region.min[i]
                || point[i] >= claim.region.max[i]
        }) {
            return Err("The path is not inside its unchanged region context.");
        }
        stations.push(station);
    }
    let increasing = stations[0] < stations[1];
    if stations.windows(2).any(|pair| {
        if increasing {
            pair[0] >= pair[1]
        } else {
            pair[0] <= pair[1]
        }
    }) {
        return Err("The initial certificate requires a strictly monotone axial path.");
    }
    // The square of side r centered on the axis lies strictly inside the disk:
    // its corner squared distance is r²/2 < r², at EVERY station in the band.
    // Region clipping must not remove any of that square.
    let half = &radius / BigRational::from_integer(2.into());
    for i in (0..3).filter(|&i| i != axis) {
        if &origin[i] - &half <= rational(claim.region.min[i])?
            || &origin[i] + &half >= rational(claim.region.max[i])?
        {
            return Err("The inscribed section is not wholly inside the region.");
        }
    }
    let area = &radius * &radius;
    if let Some(minimum) = claim.min_cross_section {
        if rational(minimum)? > area {
            return Err(
                "The uniform section lower bound does not prove the requested minimum; no negative conclusion is certified.",
            );
        }
    }
    let display = area
        .to_f64()
        .filter(|n| n.is_finite())
        .ok_or("The section bound has no finite display.")?;
    Ok(Json::object([
        (
            "method",
            Json::string("nominal-selected-bore-void-lower-bound"),
        ),
        (
            "scope",
            Json::string("complete-single-selected-material-solid"),
        ),
        ("material", Json::string(&claim.material_paths[0])),
        ("occurrence", Json::Number(band.occurrence as f64)),
        (
            "publicFaceOrdinal",
            Json::Number(band.public_face_ordinal as f64),
        ),
        (
            "sourceFaceEntity",
            Json::Number(band.source_face_entity as f64),
        ),
        ("origin", Json::Array(band.origin.map(Json::Number).into())),
        ("rawAxis", Json::Array(band.axis.map(Json::Number).into())),
        ("radius", Json::Number(band.radius)),
        ("from", Json::Number(band.from)),
        ("to", Json::Number(band.to)),
        ("clearInteriorResidualSolidCount", Json::Number(0.0)),
        (
            "mouths",
            Json::Array(
                bore.ends
                    .iter()
                    .map(|end| {
                        Json::object([
                            (
                                "owningSolidEdgeOrdinal",
                                Json::Number(end.owning_solid_edge_ordinal as f64),
                            ),
                            (
                                "adjacentPublicFaceOrdinal",
                                Json::Number(end.adjacent_public_face_ordinal as f64),
                            ),
                        ])
                    })
                    .collect(),
            ),
        ),
        (
            "sourceRoute",
            Json::Array(
                band.source_route[..band.source_route_count as usize]
                    .iter()
                    .map(|&x| Json::Number(x as f64))
                    .collect(),
            ),
        ),
        (
            "uniformSectionAreaLowerBound",
            Json::object([
                ("numerator", Json::string(&area.numer().to_string())),
                ("denominator", Json::string(&area.denom().to_string())),
                ("display", Json::Number(display)),
                ("unit", Json::string("mm2")),
                (
                    "construction",
                    Json::string("axis-centered-inscribed-square-side-radius"),
                ),
            ]),
        ),
        ("globalMinimumClaimed", Json::Bool(false)),
        (
            "stations",
            Json::Array(
                stations
                    .iter()
                    .map(|s| {
                        Json::object([
                            ("numerator", Json::string(&s.numer().to_string())),
                            ("denominator", Json::string(&s.denom().to_string())),
                        ])
                    })
                    .collect(),
            ),
        ),
    ]))
}

#[cfg(test)]
#[path = "../../../tests/nominal_bore_void.rs"]
mod tests;
