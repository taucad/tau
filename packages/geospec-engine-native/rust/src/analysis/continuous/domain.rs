use num_rational::BigRational;

use crate::backend::brep::{Bounds, ContinuousWallShape, SelectedContinuousDomain};

use super::{exact, point_json, ContinuousError, ExactScalar};

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct DomainEvidence {
    pub occurrence: u32,
    pub maximum_topology_tolerance_mm: f64,
    pub minimum: [ExactScalar; 3],
    pub maximum: [ExactScalar; 3],
    pub corners: [[ExactScalar; 3]; 8],
    pub face_indices: [u32; 6],
    pub face_corner_indices: [[u32; 4]; 6],
    pub outward_normals: [[f64; 3]; 6],
    pub opposite_face_pairs: [[u32; 2]; 3],
    pub edge_lengths: [ExactScalar; 3],
    pub domain_face_to_occurrence_face: Vec<u32>,
    pub domain_edge_to_occurrence_edge: Vec<u32>,
}

impl DomainEvidence {
    pub(crate) fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(
                self.minimum
                    .iter()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.maximum
                    .iter()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.corners
                    .iter()
                    .flatten()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.edge_lengths
                    .iter()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.domain_face_to_occurrence_face.capacity() * std::mem::size_of::<u32>(),
            )
            .saturating_add(
                self.domain_edge_to_occurrence_edge.capacity() * std::mem::size_of::<u32>(),
            )
    }

    pub(crate) fn to_json(&self) -> crate::codec::Json {
        crate::codec::Json::object([
            (
                "associations",
                crate::codec::Json::object([
                    (
                        "domainEdgeToOccurrenceEdge",
                        integers(&self.domain_edge_to_occurrence_edge),
                    ),
                    (
                        "domainFaceToOccurrenceFace",
                        integers(&self.domain_face_to_occurrence_face),
                    ),
                ]),
            ),
            (
                "domainCertificate",
                crate::codec::Json::object([
                    (
                        "corners",
                        crate::codec::Json::Array(self.corners.iter().map(point_json).collect()),
                    ),
                    ("edgeLengths", exact_values(&self.edge_lengths)),
                    (
                        "faceCornerIndices",
                        crate::codec::Json::Array(
                            self.face_corner_indices
                                .iter()
                                .map(|values| integers(values))
                                .collect(),
                        ),
                    ),
                    ("faceIndices", integers(&self.face_indices)),
                    ("kind", crate::codec::Json::string("axis-aligned-box")),
                    (
                        "oppositeFacePairs",
                        crate::codec::Json::Array(
                            self.opposite_face_pairs
                                .iter()
                                .map(|values| integers(values))
                                .collect(),
                        ),
                    ),
                    (
                        "outwardNormals",
                        crate::codec::Json::Array(
                            self.outward_normals
                                .iter()
                                .map(|values| numbers(values))
                                .collect(),
                        ),
                    ),
                ]),
            ),
            (
                "extents",
                crate::codec::Json::object([
                    ("maximum", point_json(&self.maximum)),
                    ("minimum", point_json(&self.minimum)),
                ]),
            ),
            (
                "maximumTopologyToleranceMm",
                crate::codec::Json::Number(self.maximum_topology_tolerance_mm),
            ),
            (
                "occurrence",
                crate::codec::Json::Number(self.occurrence.into()),
            ),
        ])
    }
}

#[derive(Clone, Debug)]
pub(super) struct DomainBox {
    pub selected: SelectedContinuousDomain,
    pub minimum: [BigRational; 3],
    pub maximum: [BigRational; 3],
    pub minimum_bits: [u64; 3],
    pub maximum_bits: [u64; 3],
}

#[derive(Clone, Debug)]
pub(super) struct StoredDomain {
    pub selected: SelectedContinuousDomain,
    pub minimum_bits: [u64; 3],
    pub maximum_bits: [u64; 3],
}

impl DomainBox {
    pub fn new(selected: &SelectedContinuousDomain) -> Result<Self, ContinuousError> {
        let ContinuousWallShape::AxisAlignedBox {
            corners,
            face_indices,
            face_corner_indices,
            outward_normals,
            opposite_face_pairs,
            edge_lengths,
        } = &selected.domain.domain
        else {
            return Err(ContinuousError::unsupported(
                "Continuous insertion and void analysis currently requires complete axis-aligned boxes.",
            ));
        };
        validate_associations(selected)?;
        if !selected.domain.maximum_topology_tolerance_mm.is_finite()
            || selected.domain.maximum_topology_tolerance_mm < 0.0
        {
            return Err(ContinuousError::invalid(
                "Continuous box topology tolerance evidence must be finite and nonnegative.",
            ));
        }
        validate_box_certificate(
            *face_indices,
            *face_corner_indices,
            *outward_normals,
            *opposite_face_pairs,
        )?;

        let mut minimum = [f64::INFINITY; 3];
        let mut maximum = [f64::NEG_INFINITY; 3];
        for corner in corners {
            for axis in 0..3 {
                if !corner[axis].is_finite() {
                    return Err(ContinuousError::invalid(
                        "Continuous box corners must be finite.",
                    ));
                }
                minimum[axis] = minimum[axis].min(corner[axis]);
                maximum[axis] = maximum[axis].max(corner[axis]);
            }
        }
        for axis in 0..3 {
            if minimum[axis] >= maximum[axis] {
                return Err(ContinuousError::invalid(
                    "Continuous boxes require three distinct ordered extents.",
                ));
            }
            if !edge_lengths[axis].is_finite()
                || edge_lengths[axis] != maximum[axis] - minimum[axis]
            {
                return Err(ContinuousError::invalid(
                    "Continuous box edge lengths must match its Cartesian extents.",
                ));
            }
        }
        let expected = corners_for(minimum, maximum);
        for expected_corner in expected {
            if corners
                .iter()
                .filter(|corner| **corner == expected_corner)
                .count()
                != 1
            {
                return Err(ContinuousError::invalid(
                    "Continuous box corners must contain each Cartesian extremum exactly once.",
                ));
            }
        }

        Ok(Self {
            selected: selected.clone(),
            minimum: rational_point(minimum)?,
            maximum: rational_point(maximum)?,
            minimum_bits: minimum.map(canonical_bits),
            maximum_bits: maximum.map(canonical_bits),
        })
    }

    pub fn evidence(&self) -> Result<DomainEvidence, ContinuousError> {
        let ContinuousWallShape::AxisAlignedBox {
            corners,
            face_indices,
            face_corner_indices,
            outward_normals,
            opposite_face_pairs,
            edge_lengths,
        } = &self.selected.domain.domain
        else {
            return Err(ContinuousError::unsupported(
                "Continuous evidence requires a complete axis-aligned box.",
            ));
        };
        Ok(DomainEvidence {
            occurrence: self.selected.occurrence,
            maximum_topology_tolerance_mm: self.selected.domain.maximum_topology_tolerance_mm,
            minimum: scalar_point(&self.minimum)?,
            maximum: scalar_point(&self.maximum)?,
            corners: scalar_corners(*corners)?,
            face_indices: *face_indices,
            face_corner_indices: *face_corner_indices,
            outward_normals: *outward_normals,
            opposite_face_pairs: *opposite_face_pairs,
            edge_lengths: scalar_point(&rational_point(*edge_lengths)?)?,
            domain_face_to_occurrence_face: self.selected.domain_face_to_occurrence_face.clone(),
            domain_edge_to_occurrence_edge: self.selected.domain_edge_to_occurrence_edge.clone(),
        })
    }

    pub fn stored(self) -> StoredDomain {
        StoredDomain {
            selected: self.selected,
            minimum_bits: self.minimum_bits,
            maximum_bits: self.maximum_bits,
        }
    }
}

impl StoredDomain {
    pub fn exact(&self) -> Result<DomainBox, ContinuousError> {
        Ok(DomainBox {
            selected: self.selected.clone(),
            minimum: [
                from_bits(self.minimum_bits[0])?,
                from_bits(self.minimum_bits[1])?,
                from_bits(self.minimum_bits[2])?,
            ],
            maximum: [
                from_bits(self.maximum_bits[0])?,
                from_bits(self.maximum_bits[1])?,
                from_bits(self.maximum_bits[2])?,
            ],
            minimum_bits: self.minimum_bits,
            maximum_bits: self.maximum_bits,
        })
    }

    pub fn evidence(&self) -> Result<DomainEvidence, ContinuousError> {
        self.exact()?.evidence()
    }

    pub fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(
                self.selected.domain_face_to_occurrence_face.capacity()
                    * std::mem::size_of::<u32>(),
            )
            .saturating_add(
                self.selected.domain_edge_to_occurrence_edge.capacity()
                    * std::mem::size_of::<u32>(),
            )
    }
}

pub(super) fn exact_bounds(
    bounds: Bounds,
) -> Result<([BigRational; 3], [BigRational; 3]), ContinuousError> {
    for axis in 0..3 {
        if !bounds.min[axis].is_finite()
            || !bounds.max[axis].is_finite()
            || bounds.min[axis] >= bounds.max[axis]
        {
            return Err(ContinuousError::invalid(
                "The continuous void region requires finite strictly ordered extents.",
            ));
        }
    }
    Ok((rational_point(bounds.min)?, rational_point(bounds.max)?))
}

pub(super) fn rational_point(point: [f64; 3]) -> Result<[BigRational; 3], ContinuousError> {
    Ok([
        exact::rational(point[0])?,
        exact::rational(point[1])?,
        exact::rational(point[2])?,
    ])
}

pub(super) fn scalar_point(point: &[BigRational; 3]) -> Result<[ExactScalar; 3], ContinuousError> {
    Ok([
        exact::scalar(&point[0])?,
        exact::scalar(&point[1])?,
        exact::scalar(&point[2])?,
    ])
}

pub(super) fn directed_axis(axis: [f64; 3]) -> Result<(usize, i8), ContinuousError> {
    let mut selected = None;
    for (index, value) in axis.into_iter().enumerate() {
        match value {
            1.0 | -1.0 if selected.is_none() => {
                selected = Some((index, if value > 0.0 { 1 } else { -1 }))
            }
            0.0 => {}
            _ => {
                return Err(ContinuousError::unsupported(
                    "The nominal continuous profile requires an explicit axis of ±X, ±Y or ±Z.",
                ))
            }
        }
    }
    selected.ok_or_else(|| {
        ContinuousError::unsupported(
            "The nominal continuous profile requires an explicit axis of ±X, ±Y or ±Z.",
        )
    })
}

pub(super) fn canonical_bits(value: f64) -> u64 {
    if value == 0.0 {
        0.0_f64.to_bits()
    } else {
        value.to_bits()
    }
}

pub(super) fn from_bits(bits: u64) -> Result<BigRational, ContinuousError> {
    exact::rational(f64::from_bits(bits))
}

fn validate_associations(selected: &SelectedContinuousDomain) -> Result<(), ContinuousError> {
    if selected.domain_face_to_occurrence_face.len() != 6
        || selected.domain_edge_to_occurrence_edge.len() != 12
        || !unique_nonzero(&selected.domain_face_to_occurrence_face)
        || !unique_nonzero(&selected.domain_edge_to_occurrence_edge)
    {
        return Err(ContinuousError::invalid(
            "A complete box requires six distinct face and twelve distinct edge associations.",
        ));
    }
    Ok(())
}

fn scalar_corners(corners: [[f64; 3]; 8]) -> Result<[[ExactScalar; 3]; 8], ContinuousError> {
    Ok([
        scalar_point(&rational_point(corners[0])?)?,
        scalar_point(&rational_point(corners[1])?)?,
        scalar_point(&rational_point(corners[2])?)?,
        scalar_point(&rational_point(corners[3])?)?,
        scalar_point(&rational_point(corners[4])?)?,
        scalar_point(&rational_point(corners[5])?)?,
        scalar_point(&rational_point(corners[6])?)?,
        scalar_point(&rational_point(corners[7])?)?,
    ])
}

fn validate_box_certificate(
    face_indices: [u32; 6],
    face_corner_indices: [[u32; 4]; 6],
    outward_normals: [[f64; 3]; 6],
    opposite_face_pairs: [[u32; 2]; 3],
) -> Result<(), ContinuousError> {
    if !one_based_permutation(&face_indices, 6)
        || face_corner_indices
            .iter()
            .any(|face| !zero_based_subset(face, 8))
        || !one_based_permutation(&opposite_face_pairs.concat(), 6)
    {
        return Err(ContinuousError::invalid(
            "The complete box certificate has invalid local face/corner incidence.",
        ));
    }
    for corner in 0..8 {
        if face_corner_indices
            .iter()
            .flatten()
            .filter(|value| **value == corner)
            .count()
            != 3
        {
            return Err(ContinuousError::invalid(
                "Each complete box corner must belong to exactly three faces.",
            ));
        }
    }
    let expected_normals = [
        [-1.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, -1.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, -1.0],
        [0.0, 0.0, 1.0],
    ];
    if expected_normals.iter().any(|normal| {
        outward_normals
            .iter()
            .filter(|value| *value == normal)
            .count()
            != 1
    }) {
        return Err(ContinuousError::invalid(
            "The complete box certificate requires all six Cartesian outward normals.",
        ));
    }
    Ok(())
}

fn one_based_permutation(values: &[u32], upper: u32) -> bool {
    values.iter().all(|value| (1..=upper).contains(value))
        && values
            .iter()
            .enumerate()
            .all(|(index, value)| !values[..index].contains(value))
}

fn zero_based_subset(values: &[u32], upper: u32) -> bool {
    values.iter().all(|value| *value < upper)
        && values
            .iter()
            .enumerate()
            .all(|(index, value)| !values[..index].contains(value))
}

fn unique_nonzero(values: &[u32]) -> bool {
    values.iter().all(|value| *value != 0)
        && values
            .iter()
            .enumerate()
            .all(|(index, value)| !values[..index].contains(value))
}

fn corners_for(minimum: [f64; 3], maximum: [f64; 3]) -> [[f64; 3]; 8] {
    [
        [minimum[0], minimum[1], minimum[2]],
        [maximum[0], minimum[1], minimum[2]],
        [minimum[0], maximum[1], minimum[2]],
        [maximum[0], maximum[1], minimum[2]],
        [minimum[0], minimum[1], maximum[2]],
        [maximum[0], minimum[1], maximum[2]],
        [minimum[0], maximum[1], maximum[2]],
        [maximum[0], maximum[1], maximum[2]],
    ]
}

fn integers(values: &[u32]) -> crate::codec::Json {
    crate::codec::Json::Array(
        values
            .iter()
            .map(|value| crate::codec::Json::Number((*value).into()))
            .collect(),
    )
}

fn exact_values(values: &[ExactScalar]) -> crate::codec::Json {
    crate::codec::Json::Array(values.iter().map(ExactScalar::to_json).collect())
}

fn numbers(values: &[f64]) -> crate::codec::Json {
    crate::codec::Json::Array(
        values
            .iter()
            .copied()
            .map(crate::codec::Json::Number)
            .collect(),
    )
}
