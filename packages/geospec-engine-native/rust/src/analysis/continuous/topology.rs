use std::collections::VecDeque;

use num_rational::BigRational;
use num_traits::Zero;

use crate::{
    backend::brep::{Bounds, SelectedContinuousDomain},
    codec::Json,
};

use super::{
    domain::{
        canonical_bits, directed_axis, exact_bounds, from_bits, rational_point, scalar_point,
        DomainBox, StoredDomain,
    },
    exact, point_json, ContinuousError, DomainEvidence, ExactScalar, Outcome, MAX_CELLS,
    MAX_MATERIALS, MAX_OWNED_BYTES, MAX_PLANES_PER_AXIS, PROFILE, REPRESENTATION,
};

const MATERIAL_COMPONENT: u32 = u32::MAX;

pub(crate) struct GridPlan {
    region_minimum_bits: [u64; 3],
    region_maximum_bits: [u64; 3],
    materials: Vec<StoredDomain>,
    planes: [Vec<u64>; 3],
    dimensions: [usize; 3],
}

#[derive(Clone, Debug)]
pub(crate) struct Topology {
    region_minimum_bits: [u64; 3],
    region_maximum_bits: [u64; 3],
    materials: Vec<StoredDomain>,
    planes: [Vec<u64>; 3],
    dimensions: [usize; 3],
    material_masks: Vec<u16>,
    component_ids: Vec<u32>,
    component_count: u32,
}

pub(crate) struct PointRequest<'a> {
    pub waypoints: &'a [[f64; 3]],
    pub isolated_from: &'a [[f64; 3]],
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PointMembership {
    pub kind: &'static str,
    pub index: usize,
    pub point: [ExactScalar; 3],
    pub cell: Option<u32>,
    pub material_occurrences: Vec<u32>,
    pub component: Option<u32>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct CellEvidence {
    pub cell: u32,
    pub material_mask: u16,
    pub component: Option<u32>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PointEvidence {
    pub profile: &'static str,
    pub representation: &'static str,
    pub region_minimum: [ExactScalar; 3],
    pub region_maximum: [ExactScalar; 3],
    pub materials: Vec<DomainEvidence>,
    pub coordinate_planes: [Vec<ExactScalar>; 3],
    pub cells: Vec<CellEvidence>,
    pub waypoint_membership: Vec<PointMembership>,
    pub isolation_membership: Vec<PointMembership>,
    pub path_component: Option<u32>,
}

pub(crate) struct SectionRequest<'a> {
    pub waypoints: &'a [[f64; 3]],
    pub axis: [f64; 3],
    pub minimum: f64,
    pub points: &'a PointEvidence,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct SectionStratum {
    pub kind: &'static str,
    pub axis_coordinate: ExactScalar,
    pub rectangle_minimum: [ExactScalar; 2],
    pub rectangle_maximum: [ExactScalar; 2],
    pub area: ExactScalar,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct SectionEvidence {
    pub profile: &'static str,
    pub representation: &'static str,
    pub directed_axis: [i8; 3],
    pub component: u32,
    pub strata: Vec<SectionStratum>,
    pub attaining_stratum: usize,
    pub minimum_area: ExactScalar,
    pub threshold: ExactScalar,
}

#[derive(Clone)]
struct Rectangle {
    axis_interval: usize,
    transverse: [usize; 2],
    minimum: [usize; 2],
    maximum: [usize; 2],
}

impl GridPlan {
    pub(crate) fn new(
        materials: &[SelectedContinuousDomain],
        region: Bounds,
    ) -> Result<Self, ContinuousError> {
        let (region_minimum, region_maximum) = exact_bounds(region)?;
        let mut distinct = Vec::with_capacity(materials.len().min(MAX_MATERIALS));
        for material in materials {
            if distinct
                .iter()
                .any(|domain: &StoredDomain| domain.selected.occurrence == material.occurrence)
            {
                continue;
            }
            if distinct.len() == MAX_MATERIALS {
                return Err(ContinuousError::unsupported(
                    "The nominal continuous void profile accepts at most 16 distinct materials.",
                ));
            }
            distinct.push(DomainBox::new(material)?.stored());
        }
        if distinct.is_empty() {
            return Err(ContinuousError::invalid(
                "Continuous void analysis requires at least one selected material.",
            ));
        }

        let mut plane_values: [Vec<BigRational>; 3] = [
            vec![region_minimum[0].clone(), region_maximum[0].clone()],
            vec![region_minimum[1].clone(), region_maximum[1].clone()],
            vec![region_minimum[2].clone(), region_maximum[2].clone()],
        ];
        for stored in &distinct {
            let material = stored.exact()?;
            let intersects = (0..3).all(|axis| {
                material.maximum[axis] > region_minimum[axis]
                    && material.minimum[axis] < region_maximum[axis]
            });
            if !intersects {
                continue;
            }
            for axis in 0..3 {
                for boundary in [&material.minimum[axis], &material.maximum[axis]] {
                    if boundary > &region_minimum[axis] && boundary < &region_maximum[axis] {
                        plane_values[axis].push(boundary.clone());
                    }
                }
            }
        }
        for values in &mut plane_values {
            values.sort();
            values.dedup();
            if values.len() > MAX_PLANES_PER_AXIS {
                return Err(ContinuousError::unsupported(
                    "The nominal continuous void arrangement exceeds 34 planes on one axis.",
                ));
            }
        }
        let dimensions = plane_values.each_ref().map(|values| values.len() - 1);
        let cells = checked_product(dimensions)?;
        if cells > MAX_CELLS {
            return Err(ContinuousError::unsupported(
                "The nominal continuous void arrangement exceeds 35937 cells.",
            ));
        }
        let mut planes: [Vec<u64>; 3] =
            std::array::from_fn(|axis| Vec::with_capacity(plane_values[axis].len()));
        for axis in 0..3 {
            for value in &plane_values[axis] {
                planes[axis].push(canonical_bits(exact::scalar(value)?.display));
            }
        }
        Ok(Self {
            region_minimum_bits: region.min.map(canonical_bits),
            region_maximum_bits: region.max.map(canonical_bits),
            materials: distinct,
            planes,
            dimensions,
        })
    }

    pub(crate) fn grid_units(&self) -> Result<u64, ContinuousError> {
        let [nx, ny, nz] = [
            to_u64(self.dimensions[0])?,
            to_u64(self.dimensions[1])?,
            to_u64(self.dimensions[2])?,
        ];
        let cells = nx
            .checked_mul(ny)
            .and_then(|value| value.checked_mul(nz))
            .ok_or_else(count_overflow)?;
        let adjacency = (nx - 1)
            .checked_mul(ny)
            .and_then(|value| value.checked_mul(nz))
            .and_then(|value| value.checked_add(nx.checked_mul(ny - 1)?.checked_mul(nz)?))
            .and_then(|value| value.checked_add(nx.checked_mul(ny)?.checked_mul(nz - 1)?))
            .ok_or_else(count_overflow)?;
        let materials = to_u64(self.materials.len())?;
        cells
            .checked_mul(materials.checked_add(2).ok_or_else(count_overflow)?)
            .and_then(|value| value.checked_add(adjacency))
            .and_then(|value| value.checked_add(1))
            .ok_or_else(count_overflow)
    }

    pub(crate) fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(
                self.materials
                    .iter()
                    .map(StoredDomain::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.materials
                    .capacity()
                    .saturating_sub(self.materials.len())
                    * std::mem::size_of::<StoredDomain>(),
            )
            .saturating_add(
                self.planes
                    .iter()
                    .map(|values| values.capacity() * std::mem::size_of::<u64>())
                    .sum::<usize>(),
            )
    }

    /// Conservative simultaneous plan/build working set. This counts retained
    /// plan capacity, compact topology outputs, the largest BFS queue, and all
    /// bounded rational values live during one cell classification. It is an
    /// owned-payload preflight, not a kernel/process RSS estimate.
    pub(crate) fn projected_owned_build_bytes(&self) -> Result<usize, ContinuousError> {
        let cells = checked_product(self.dimensions)?;
        let queue_capacity = cells
            .checked_next_power_of_two()
            .ok_or_else(byte_overflow)?;
        let exact_values = self
            .planes
            .iter()
            .map(Vec::len)
            .sum::<usize>()
            .checked_add(
                self.materials
                    .len()
                    .checked_mul(6)
                    .ok_or_else(byte_overflow)?,
            )
            // Three cell midpoints plus bounded add/subtract/product scratch.
            .and_then(|value| value.checked_add(19))
            .ok_or_else(byte_overflow)?;
        let exact_value_bytes = std::mem::size_of::<BigRational>()
            .checked_add(
                (super::MAX_INTEGER_BITS as usize / 8)
                    .checked_mul(2)
                    .ok_or_else(byte_overflow)?,
            )
            .ok_or_else(byte_overflow)?;
        checked_bytes([
            self.owned_bytes(),
            cells
                .checked_mul(std::mem::size_of::<u16>())
                .ok_or_else(byte_overflow)?,
            cells
                .checked_mul(std::mem::size_of::<u32>())
                .ok_or_else(byte_overflow)?,
            queue_capacity
                .checked_mul(std::mem::size_of::<usize>())
                .and_then(|value| value.checked_add(std::mem::size_of::<VecDeque<usize>>()))
                .ok_or_else(byte_overflow)?,
            exact_values
                .checked_mul(exact_value_bytes)
                .ok_or_else(byte_overflow)?,
        ])
    }

    pub(crate) fn build(self) -> Result<Topology, ContinuousError> {
        let exact_planes = exact_planes(&self.planes)?;
        let exact_materials = self
            .materials
            .iter()
            .map(StoredDomain::exact)
            .collect::<Result<Vec<_>, _>>()?;
        let cell_count = checked_product(self.dimensions)?;
        let mut material_masks = Vec::with_capacity(cell_count);
        for cell in 0..cell_count {
            let indices = indices(cell, self.dimensions);
            let midpoint = [
                exact::midpoint(
                    &exact_planes[0][indices[0]],
                    &exact_planes[0][indices[0] + 1],
                )?,
                exact::midpoint(
                    &exact_planes[1][indices[1]],
                    &exact_planes[1][indices[1] + 1],
                )?,
                exact::midpoint(
                    &exact_planes[2][indices[2]],
                    &exact_planes[2][indices[2] + 1],
                )?,
            ];
            let mut mask = 0_u16;
            for (material_index, material) in exact_materials.iter().enumerate() {
                if (0..3).all(|axis| {
                    midpoint[axis] >= material.minimum[axis]
                        && midpoint[axis] <= material.maximum[axis]
                }) {
                    mask |= 1 << material_index;
                }
            }
            material_masks.push(mask);
        }

        let mut component_ids = vec![MATERIAL_COMPONENT; cell_count];
        let mut component_count = 0_u32;
        for start in 0..cell_count {
            if material_masks[start] != 0 || component_ids[start] != MATERIAL_COMPONENT {
                continue;
            }
            let component = u32::try_from(start).map_err(|_| count_overflow())?;
            component_count = component_count.checked_add(1).ok_or_else(count_overflow)?;
            component_ids[start] = component;
            let mut queue = VecDeque::from([start]);
            while let Some(cell) = queue.pop_front() {
                for neighbor in neighbors(cell, self.dimensions).into_iter().flatten() {
                    if material_masks[neighbor] == 0
                        && component_ids[neighbor] == MATERIAL_COMPONENT
                    {
                        component_ids[neighbor] = component;
                        queue.push_back(neighbor);
                    }
                }
            }
        }
        let topology = Topology {
            region_minimum_bits: self.region_minimum_bits,
            region_maximum_bits: self.region_maximum_bits,
            materials: self.materials,
            planes: self.planes,
            dimensions: self.dimensions,
            material_masks,
            component_ids,
            component_count,
        };
        if topology.owned_bytes() > MAX_OWNED_BYTES {
            return Err(ContinuousError::resource(
                "The continuous topology exceeds its 32 MiB owned payload ceiling.",
            ));
        }
        Ok(topology)
    }
}

impl Topology {
    pub(crate) fn point_units(
        &self,
        waypoints: usize,
        isolation: usize,
    ) -> Result<u64, ContinuousError> {
        let points = to_u64(waypoints)?
            .checked_add(to_u64(isolation)?)
            .ok_or_else(count_overflow)?;
        points
            .checked_mul(to_u64(self.material_masks.len())?)
            .ok_or_else(count_overflow)
    }

    pub(crate) fn section_units(&self, points: usize, axis: usize) -> Result<u64, ContinuousError> {
        if axis >= 3 || points < 2 {
            return Err(ContinuousError::invalid(
                "Section accounting requires at least two points and a Cartesian axis.",
            ));
        }
        let transverse: Vec<_> = (0..3).filter(|candidate| *candidate != axis).collect();
        let requests = to_u64(points - 1)?
            .checked_mul(
                to_u64(self.dimensions[axis])?
                    .checked_mul(2)
                    .and_then(|value| value.checked_add(1))
                    .ok_or_else(count_overflow)?,
            )
            .and_then(|value| value.checked_mul(to_u64(self.dimensions[transverse[0]]).ok()?))
            .and_then(|value| value.checked_mul(to_u64(self.dimensions[transverse[1]]).ok()?))
            .and_then(|value| value.checked_add(1))
            .ok_or_else(count_overflow)?;
        Ok(requests)
    }

    pub(crate) fn evaluate_points(&self, request: PointRequest<'_>) -> Outcome<PointEvidence> {
        match self.point_evidence(request) {
            Ok((positive, evidence)) => Outcome::Decided { positive, evidence },
            Err((reason, evidence)) => Outcome::Unsupported { reason, evidence },
        }
    }

    pub(crate) fn evaluate_section(&self, request: SectionRequest<'_>) -> Outcome<SectionEvidence> {
        match self.section_evidence(request) {
            Ok((positive, evidence)) => Outcome::Decided { positive, evidence },
            Err(reason) => Outcome::Unsupported {
                reason,
                evidence: None,
            },
        }
    }

    pub(crate) fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(
                self.materials
                    .iter()
                    .map(StoredDomain::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.materials
                    .capacity()
                    .saturating_sub(self.materials.len())
                    * std::mem::size_of::<StoredDomain>(),
            )
            .saturating_add(
                self.planes
                    .iter()
                    .map(|values| values.capacity() * std::mem::size_of::<u64>())
                    .sum::<usize>(),
            )
            .saturating_add(self.material_masks.capacity() * std::mem::size_of::<u16>())
            .saturating_add(self.component_ids.capacity() * std::mem::size_of::<u32>())
    }

    // Return partial evidence inline on refusal; boxing would add an allocation
    // to this bounded, already-accounted evidence transfer.
    #[allow(clippy::result_large_err)]
    fn point_evidence(
        &self,
        request: PointRequest<'_>,
    ) -> Result<(bool, PointEvidence), (ContinuousError, Option<PointEvidence>)> {
        if !(2..=32).contains(&request.waypoints.len()) || request.isolated_from.len() > 32 {
            return Err((
                ContinuousError::invalid(
                    "Continuous void analysis requires 2–32 waypoints and at most 32 isolation points.",
                ),
                None,
            ));
        }
        if self.component_count == 0 {
            return Err((
                ContinuousError::unsupported(
                    "The selected material fills the complete declared region.",
                ),
                None,
            ));
        }
        let mut evidence = self
            .base_point_evidence()
            .map_err(|reason| (reason, None))?;
        for (index, point) in request.waypoints.iter().copied().enumerate() {
            match self.membership("waypoint", index, point) {
                Ok(membership) => evidence.waypoint_membership.push(membership),
                Err(reason) => {
                    if let Ok(membership) = unresolved_membership("waypoint", index, point) {
                        evidence.waypoint_membership.push(membership);
                    }
                    return Err((reason, Some(evidence)));
                }
            }
        }
        if evidence
            .waypoint_membership
            .iter()
            .any(|membership| !membership.material_occurrences.is_empty())
        {
            return Ok((false, evidence));
        }
        let component = evidence.waypoint_membership[0]
            .component
            .expect("fluid waypoint");
        evidence.path_component = Some(component);
        if evidence
            .waypoint_membership
            .iter()
            .any(|membership| membership.component != Some(component))
        {
            return Ok((false, evidence));
        }
        for (index, point) in request.isolated_from.iter().copied().enumerate() {
            let membership = match self.membership("isolation", index, point) {
                Ok(membership) => membership,
                Err(reason) => {
                    if let Ok(membership) = unresolved_membership("isolation", index, point) {
                        evidence.isolation_membership.push(membership);
                    }
                    return Err((reason, Some(evidence)));
                }
            };
            if !membership.material_occurrences.is_empty() || membership.component.is_none() {
                evidence.isolation_membership.push(membership);
                return Err((
                    ContinuousError::unsupported(
                        "An isolation point outside the fluid domain cannot prove non-vacuous isolation.",
                    ),
                    Some(evidence),
                ));
            }
            let same_component = membership.component == Some(component);
            evidence.isolation_membership.push(membership);
            if same_component {
                return Ok((false, evidence));
            }
        }
        if evidence.owned_bytes() > MAX_OWNED_BYTES {
            return Err((
                ContinuousError::resource(
                    "The continuous point evidence exceeds its 32 MiB output ceiling.",
                ),
                None,
            ));
        }
        Ok((true, evidence))
    }

    fn section_evidence(
        &self,
        request: SectionRequest<'_>,
    ) -> Result<(bool, SectionEvidence), ContinuousError> {
        if !(2..=32).contains(&request.waypoints.len()) {
            return Err(ContinuousError::invalid(
                "Section proof requires 2–32 authored waypoints.",
            ));
        }
        let component = request.points.path_component.ok_or_else(|| {
            ContinuousError::unsupported(
                "Section proof requires a successful point/connectivity stage.",
            )
        })?;
        if request.waypoints.len() != request.points.waypoint_membership.len() {
            return Err(ContinuousError::invalid(
                "Section points must match the completed point stage.",
            ));
        }
        let (axis, direction) = directed_axis(request.axis)?;
        let minimum = exact::rational(request.minimum)?;
        if minimum < BigRational::zero() {
            return Err(ContinuousError::invalid(
                "Minimum cross-section must be nonnegative.",
            ));
        }
        let exact_points = request
            .waypoints
            .iter()
            .copied()
            .map(rational_point)
            .collect::<Result<Vec<_>, _>>()?;
        let transverse: Vec<_> = (0..3).filter(|candidate| *candidate != axis).collect();
        for point in &exact_points[1..] {
            if point[transverse[0]] != exact_points[0][transverse[0]]
                || point[transverse[1]] != exact_points[0][transverse[1]]
            {
                return Err(ContinuousError::unsupported(
                    "Minimum cross-section requires collinear Cartesian waypoints.",
                ));
            }
        }
        for pair in exact_points.windows(2) {
            let ordered = if direction > 0 {
                pair[0][axis] < pair[1][axis]
            } else {
                pair[0][axis] > pair[1][axis]
            };
            if !ordered {
                return Err(ContinuousError::unsupported(
                    "Minimum cross-section requires strictly monotone authored waypoints.",
                ));
            }
        }
        for (index, point) in exact_points.iter().enumerate() {
            let membership = &request.points.waypoint_membership[index];
            if membership.component != Some(component) || membership.point != scalar_point(point)? {
                return Err(ContinuousError::invalid(
                    "Section points must exactly match the completed point stage.",
                ));
            }
        }

        let exact_planes = exact_planes(&self.planes)?;
        let transverse_cell = [
            strict_interval(
                &exact_planes[transverse[0]],
                &exact_points[0][transverse[0]],
            )
            .ok_or_else(boundary_point)?,
            strict_interval(
                &exact_planes[transverse[1]],
                &exact_points[0][transverse[1]],
            )
            .ok_or_else(boundary_point)?,
        ];
        let mut rectangles = Vec::new();
        for axis_interval in 0..self.dimensions[axis] {
            if let Some(rectangle) = self.component_rectangle(
                component,
                axis,
                axis_interval,
                [transverse[0], transverse[1]],
            )? {
                let rectangle_center = [
                    exact::midpoint(
                        &exact_planes[transverse[0]][rectangle.minimum[0]],
                        &exact_planes[transverse[0]][rectangle.maximum[0] + 1],
                    )?,
                    exact::midpoint(
                        &exact_planes[transverse[1]][rectangle.minimum[1]],
                        &exact_planes[transverse[1]][rectangle.maximum[1] + 1],
                    )?,
                ];
                if rectangle_center[0] != exact_points[0][transverse[0]]
                    || rectangle_center[1] != exact_points[0][transverse[1]]
                {
                    return Err(serial_refusal());
                }
                rectangles.push(rectangle);
            }
        }
        if rectangles.is_empty()
            || rectangles.windows(2).any(|pair| {
                pair[1].axis_interval != pair[0].axis_interval + 1 || !nested(&pair[0], &pair[1])
            })
        {
            return Err(serial_refusal());
        }
        let first_interval = strict_interval(&exact_planes[axis], &exact_points[0][axis])
            .ok_or_else(boundary_point)?;
        let last_interval = strict_interval(
            &exact_planes[axis],
            &exact_points[exact_points.len() - 1][axis],
        )
        .ok_or_else(boundary_point)?;
        let range = first_interval.min(last_interval)..=first_interval.max(last_interval);
        let selected = rectangles
            .iter()
            .filter(|rectangle| range.contains(&rectangle.axis_interval))
            .cloned()
            .collect::<Vec<_>>();
        if selected.len() != range.clone().count() {
            return Err(ContinuousError::unsupported(
                "The authored path crosses material despite connected endpoint components.",
            ));
        }
        for rectangle in &selected {
            let cell = cell_index_for_axes(
                axis,
                rectangle.axis_interval,
                rectangle.transverse,
                transverse_cell,
                self.dimensions,
            );
            if self.material_masks[cell] != 0 || self.component_ids[cell] != component {
                return Err(ContinuousError::unsupported(
                    "The authored path crosses material despite connected endpoint components.",
                ));
            }
        }

        let mut strata = Vec::new();
        let ordered: Vec<_> = if direction > 0 {
            selected.iter().collect()
        } else {
            selected.iter().rev().collect()
        };
        for (position, rectangle) in ordered.iter().enumerate() {
            strata.push(stratum(
                "interval",
                rectangle,
                &exact_planes,
                if direction > 0 {
                    &exact_planes[axis][rectangle.axis_interval]
                } else {
                    &exact_planes[axis][rectangle.axis_interval + 1]
                },
            )?);
            if let Some(next) = ordered.get(position + 1) {
                let event_axis_index = if direction > 0 {
                    rectangle.axis_interval + 1
                } else {
                    rectangle.axis_interval
                };
                let coordinate = &exact_planes[axis][event_axis_index];
                strata.push(stratum("event-left", rectangle, &exact_planes, coordinate)?);
                let aperture = intersection_rectangle(rectangle, next);
                let aperture_stratum =
                    stratum("event-aperture", &aperture, &exact_planes, coordinate)?;
                if aperture_stratum.area.numerator == "0" {
                    return Err(serial_refusal());
                }
                strata.push(aperture_stratum);
                strata.push(stratum("event-right", next, &exact_planes, coordinate)?);
            }
        }
        let attaining_stratum = strata
            .iter()
            .enumerate()
            .min_by(|(_, left), (_, right)| {
                scalar_ratio(&left.area).cmp(&scalar_ratio(&right.area))
            })
            .map(|(index, _)| index)
            .ok_or_else(serial_refusal)?;
        let minimum_area_ratio = scalar_ratio(&strata[attaining_stratum].area);
        let positive = minimum_area_ratio >= minimum;
        let evidence = SectionEvidence {
            profile: PROFILE,
            representation: REPRESENTATION,
            directed_axis: [0, 1, 2].map(|index| if index == axis { direction } else { 0 }),
            component,
            strata,
            attaining_stratum,
            minimum_area: exact::scalar(&minimum_area_ratio)?,
            threshold: exact::scalar(&minimum)?,
        };
        if evidence.owned_bytes() > MAX_OWNED_BYTES {
            return Err(ContinuousError::resource(
                "The continuous section evidence exceeds its 32 MiB output ceiling.",
            ));
        }
        Ok((positive, evidence))
    }

    fn component_rectangle(
        &self,
        component: u32,
        axis: usize,
        axis_interval: usize,
        transverse: [usize; 2],
    ) -> Result<Option<Rectangle>, ContinuousError> {
        let mut minimum = [usize::MAX; 2];
        let mut maximum = [0; 2];
        let mut count = 0_usize;
        for first in 0..self.dimensions[transverse[0]] {
            for second in 0..self.dimensions[transverse[1]] {
                let cell = cell_index_for_axes(
                    axis,
                    axis_interval,
                    transverse,
                    [first, second],
                    self.dimensions,
                );
                if self.component_ids[cell] == component {
                    minimum[0] = minimum[0].min(first);
                    minimum[1] = minimum[1].min(second);
                    maximum[0] = maximum[0].max(first);
                    maximum[1] = maximum[1].max(second);
                    count += 1;
                }
            }
        }
        if count == 0 {
            return Ok(None);
        }
        let expected = (maximum[0] - minimum[0] + 1)
            .checked_mul(maximum[1] - minimum[1] + 1)
            .ok_or_else(count_overflow)?;
        if count != expected {
            return Err(serial_refusal());
        }
        for first in minimum[0]..=maximum[0] {
            for second in minimum[1]..=maximum[1] {
                let cell = cell_index_for_axes(
                    axis,
                    axis_interval,
                    transverse,
                    [first, second],
                    self.dimensions,
                );
                if self.component_ids[cell] != component {
                    return Err(serial_refusal());
                }
            }
        }
        Ok(Some(Rectangle {
            axis_interval,
            transverse,
            minimum,
            maximum,
        }))
    }

    fn membership(
        &self,
        kind: &'static str,
        index: usize,
        point: [f64; 3],
    ) -> Result<PointMembership, ContinuousError> {
        let point = rational_point(point)?;
        let planes = exact_planes(&self.planes)?;
        let intervals = [
            strict_interval(&planes[0], &point[0]),
            strict_interval(&planes[1], &point[1]),
            strict_interval(&planes[2], &point[2]),
        ];
        if (0..3).any(|axis| {
            point[axis] <= planes[axis][0]
                || point[axis] >= *planes[axis].last().expect("region maximum")
        }) {
            return Err(if kind == "isolation" {
                ContinuousError::unsupported(
                    "An isolation point outside the fluid domain cannot prove non-vacuous isolation.",
                )
            } else {
                ContinuousError::unsupported(
                    "A void waypoint must lie strictly inside the declared region.",
                )
            });
        }
        if intervals.iter().any(Option::is_none) {
            return Err(boundary_point());
        }
        let intervals = intervals.map(Option::unwrap);
        let cell = cell_index(intervals, self.dimensions);
        let mask = self.material_masks[cell];
        let material_occurrences = self
            .materials
            .iter()
            .enumerate()
            .filter(|(material, _)| mask & (1 << material) != 0)
            .map(|(_, material)| material.selected.occurrence)
            .collect();
        Ok(PointMembership {
            kind,
            index,
            point: scalar_point(&point)?,
            cell: Some(u32::try_from(cell).map_err(|_| count_overflow())?),
            material_occurrences,
            component: (mask == 0).then_some(self.component_ids[cell]),
        })
    }

    fn base_point_evidence(&self) -> Result<PointEvidence, ContinuousError> {
        let region_minimum = scalar_point(&[
            from_bits(self.region_minimum_bits[0])?,
            from_bits(self.region_minimum_bits[1])?,
            from_bits(self.region_minimum_bits[2])?,
        ])?;
        let region_maximum = scalar_point(&[
            from_bits(self.region_maximum_bits[0])?,
            from_bits(self.region_maximum_bits[1])?,
            from_bits(self.region_maximum_bits[2])?,
        ])?;
        let materials = self
            .materials
            .iter()
            .map(StoredDomain::evidence)
            .collect::<Result<Vec<_>, _>>()?;
        let mut coordinate_planes: [Vec<ExactScalar>; 3] =
            std::array::from_fn(|axis| Vec::with_capacity(self.planes[axis].len()));
        for (axis, coordinates) in coordinate_planes.iter_mut().enumerate() {
            for bits in &self.planes[axis] {
                coordinates.push(exact::scalar(&from_bits(*bits)?)?);
            }
        }
        let cells = self
            .material_masks
            .iter()
            .copied()
            .zip(self.component_ids.iter().copied())
            .enumerate()
            .map(|(cell, (material_mask, component))| CellEvidence {
                cell: u32::try_from(cell).expect("cell limit fits u32"),
                material_mask,
                component: (component != MATERIAL_COMPONENT).then_some(component),
            })
            .collect();
        Ok(PointEvidence {
            profile: PROFILE,
            representation: REPRESENTATION,
            region_minimum,
            region_maximum,
            materials,
            coordinate_planes,
            cells,
            waypoint_membership: Vec::new(),
            isolation_membership: Vec::new(),
            path_component: None,
        })
    }
}

impl PointEvidence {
    pub(crate) fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(
                self.region_minimum
                    .iter()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.region_maximum
                    .iter()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.materials
                    .iter()
                    .map(DomainEvidence::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.coordinate_planes
                    .iter()
                    .flatten()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(self.cells.capacity() * std::mem::size_of::<CellEvidence>())
            .saturating_add(
                self.waypoint_membership
                    .iter()
                    .chain(&self.isolation_membership)
                    .map(PointMembership::owned_bytes)
                    .sum::<usize>(),
            )
    }

    /// Exhaustive direct projection; these are the stable internal witness keys.
    pub(crate) fn to_json(&self) -> Json {
        Json::object([
            (
                "cells",
                Json::Array(self.cells.iter().map(CellEvidence::to_json).collect()),
            ),
            (
                "coordinatePlanes",
                Json::Array(
                    self.coordinate_planes
                        .iter()
                        .map(|axis| Json::Array(axis.iter().map(ExactScalar::to_json).collect()))
                        .collect(),
                ),
            ),
            (
                "isolationMembership",
                Json::Array(
                    self.isolation_membership
                        .iter()
                        .map(PointMembership::to_json)
                        .collect(),
                ),
            ),
            (
                "materials",
                Json::Array(self.materials.iter().map(DomainEvidence::to_json).collect()),
            ),
            (
                "pathComponent",
                self.path_component
                    .map_or(Json::Null, |value| Json::Number(value.into())),
            ),
            ("profile", Json::string(self.profile)),
            (
                "region",
                Json::object([
                    ("maximum", point_json(&self.region_maximum)),
                    ("minimum", point_json(&self.region_minimum)),
                ]),
            ),
            ("representation", Json::string(self.representation)),
            (
                "waypointMembership",
                Json::Array(
                    self.waypoint_membership
                        .iter()
                        .map(PointMembership::to_json)
                        .collect(),
                ),
            ),
        ])
    }
}

impl PointMembership {
    fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(
                self.point
                    .iter()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(self.material_occurrences.capacity() * std::mem::size_of::<u32>())
    }

    fn to_json(&self) -> Json {
        Json::object([
            (
                "cell",
                self.cell
                    .map_or(Json::Null, |value| Json::Number(value.into())),
            ),
            (
                "component",
                self.component
                    .map_or(Json::Null, |value| Json::Number(value.into())),
            ),
            ("index", Json::Number(self.index as f64)),
            ("kind", Json::string(self.kind)),
            (
                "materialOccurrences",
                Json::Array(
                    self.material_occurrences
                        .iter()
                        .map(|value| Json::Number((*value).into()))
                        .collect(),
                ),
            ),
            ("point", point_json(&self.point)),
        ])
    }
}

impl CellEvidence {
    fn to_json(&self) -> Json {
        Json::object([
            ("cell", Json::Number(self.cell.into())),
            (
                "component",
                self.component
                    .map_or(Json::Null, |value| Json::Number(value.into())),
            ),
            ("materialMask", Json::Number(self.material_mask.into())),
        ])
    }
}

impl SectionEvidence {
    pub(crate) fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(
                self.strata
                    .iter()
                    .map(SectionStratum::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(self.minimum_area.owned_bytes())
            .saturating_add(self.threshold.owned_bytes())
    }

    /// Exhaustive direct projection; these are the stable internal witness keys.
    pub(crate) fn to_json(&self) -> Json {
        Json::object([
            (
                "attainingStratum",
                Json::Number(self.attaining_stratum as f64),
            ),
            ("component", Json::Number(self.component.into())),
            (
                "directedAxis",
                Json::Array(
                    self.directed_axis
                        .iter()
                        .map(|value| Json::Number((*value).into()))
                        .collect(),
                ),
            ),
            ("minimumArea", self.minimum_area.to_json()),
            ("profile", Json::string(self.profile)),
            ("representation", Json::string(self.representation)),
            (
                "strata",
                Json::Array(self.strata.iter().map(SectionStratum::to_json).collect()),
            ),
            ("threshold", self.threshold.to_json()),
        ])
    }
}

impl SectionStratum {
    fn owned_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            .saturating_add(self.axis_coordinate.owned_bytes())
            .saturating_add(
                self.rectangle_minimum
                    .iter()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(
                self.rectangle_maximum
                    .iter()
                    .map(ExactScalar::owned_bytes)
                    .sum::<usize>(),
            )
            .saturating_add(self.area.owned_bytes())
    }

    fn to_json(&self) -> Json {
        Json::object([
            ("area", self.area.to_json()),
            ("axisCoordinate", self.axis_coordinate.to_json()),
            ("kind", Json::string(self.kind)),
            (
                "rectangle",
                Json::object([
                    (
                        "maximum",
                        Json::Array(
                            self.rectangle_maximum
                                .iter()
                                .map(ExactScalar::to_json)
                                .collect(),
                        ),
                    ),
                    (
                        "minimum",
                        Json::Array(
                            self.rectangle_minimum
                                .iter()
                                .map(ExactScalar::to_json)
                                .collect(),
                        ),
                    ),
                ]),
            ),
        ])
    }
}

fn stratum(
    kind: &'static str,
    rectangle: &Rectangle,
    planes: &[Vec<BigRational>; 3],
    coordinate: &BigRational,
) -> Result<SectionStratum, ContinuousError> {
    let minimum = [
        planes[rectangle.transverse[0]][rectangle.minimum[0]].clone(),
        planes[rectangle.transverse[1]][rectangle.minimum[1]].clone(),
    ];
    let maximum = [
        planes[rectangle.transverse[0]][rectangle.maximum[0] + 1].clone(),
        planes[rectangle.transverse[1]][rectangle.maximum[1] + 1].clone(),
    ];
    let first = exact::subtract(&maximum[0], &minimum[0])?;
    let second = exact::subtract(&maximum[1], &minimum[1])?;
    let area = exact::multiply(&first, &second)?;
    Ok(SectionStratum {
        kind,
        axis_coordinate: exact::scalar(coordinate)?,
        rectangle_minimum: [exact::scalar(&minimum[0])?, exact::scalar(&minimum[1])?],
        rectangle_maximum: [exact::scalar(&maximum[0])?, exact::scalar(&maximum[1])?],
        area: exact::scalar(&area)?,
    })
}

fn scalar_ratio(value: &ExactScalar) -> BigRational {
    use std::str::FromStr;
    BigRational::new(
        num_bigint::BigInt::from_str(&value.numerator).expect("internal numerator"),
        num_bigint::BigInt::from_str(&value.denominator).expect("internal denominator"),
    )
}

fn exact_planes(bits: &[Vec<u64>; 3]) -> Result<[Vec<BigRational>; 3], ContinuousError> {
    let mut values: [Vec<BigRational>; 3] =
        std::array::from_fn(|axis| Vec::with_capacity(bits[axis].len()));
    for axis in 0..3 {
        for value in &bits[axis] {
            values[axis].push(from_bits(*value)?);
        }
    }
    Ok(values)
}

fn strict_interval(planes: &[BigRational], point: &BigRational) -> Option<usize> {
    planes
        .windows(2)
        .position(|interval| point > &interval[0] && point < &interval[1])
}

fn unresolved_membership(
    kind: &'static str,
    index: usize,
    point: [f64; 3],
) -> Result<PointMembership, ContinuousError> {
    let point = rational_point(point)?;
    Ok(PointMembership {
        kind,
        index,
        point: scalar_point(&point)?,
        cell: None,
        material_occurrences: Vec::new(),
        component: None,
    })
}

fn nested(left: &Rectangle, right: &Rectangle) -> bool {
    contains(left, right) || contains(right, left)
}

fn contains(outer: &Rectangle, inner: &Rectangle) -> bool {
    (0..2).all(|axis| {
        outer.minimum[axis] <= inner.minimum[axis] && outer.maximum[axis] >= inner.maximum[axis]
    })
}

fn intersection_rectangle(left: &Rectangle, right: &Rectangle) -> Rectangle {
    Rectangle {
        axis_interval: left.axis_interval,
        transverse: left.transverse,
        minimum: [
            left.minimum[0].max(right.minimum[0]),
            left.minimum[1].max(right.minimum[1]),
        ],
        maximum: [
            left.maximum[0].min(right.maximum[0]),
            left.maximum[1].min(right.maximum[1]),
        ],
    }
}

fn checked_product(dimensions: [usize; 3]) -> Result<usize, ContinuousError> {
    dimensions[0]
        .checked_mul(dimensions[1])
        .and_then(|value| value.checked_mul(dimensions[2]))
        .ok_or_else(count_overflow)
}

fn cell_index(indices: [usize; 3], dimensions: [usize; 3]) -> usize {
    (indices[2] * dimensions[1] + indices[1]) * dimensions[0] + indices[0]
}

fn indices(cell: usize, dimensions: [usize; 3]) -> [usize; 3] {
    let x = cell % dimensions[0];
    let rest = cell / dimensions[0];
    [x, rest % dimensions[1], rest / dimensions[1]]
}

fn cell_index_for_axes(
    axis: usize,
    axis_interval: usize,
    transverse: [usize; 2],
    transverse_intervals: [usize; 2],
    dimensions: [usize; 3],
) -> usize {
    let mut value = [0; 3];
    value[axis] = axis_interval;
    value[transverse[0]] = transverse_intervals[0];
    value[transverse[1]] = transverse_intervals[1];
    cell_index(value, dimensions)
}

fn neighbors(cell: usize, dimensions: [usize; 3]) -> [Option<usize>; 6] {
    let value = indices(cell, dimensions);
    let mut result = [None; 6];
    for axis in 0..3 {
        if value[axis] > 0 {
            let mut neighbor = value;
            neighbor[axis] -= 1;
            result[axis * 2] = Some(cell_index(neighbor, dimensions));
        }
        if value[axis] + 1 < dimensions[axis] {
            let mut neighbor = value;
            neighbor[axis] += 1;
            result[axis * 2 + 1] = Some(cell_index(neighbor, dimensions));
        }
    }
    result
}

fn to_u64(value: usize) -> Result<u64, ContinuousError> {
    u64::try_from(value).map_err(|_| count_overflow())
}

fn count_overflow() -> ContinuousError {
    ContinuousError::arithmetic("Continuous logical request accounting overflowed.")
}

fn checked_bytes<const N: usize>(values: [usize; N]) -> Result<usize, ContinuousError> {
    values.into_iter().try_fold(0_usize, |sum, value| {
        sum.checked_add(value).ok_or_else(byte_overflow)
    })
}

fn byte_overflow() -> ContinuousError {
    ContinuousError::arithmetic("Continuous owned-byte accounting overflowed.")
}

fn boundary_point() -> ContinuousError {
    ContinuousError::unsupported(
        "A point on an arrangement plane has no qualified open-cell membership.",
    )
}

fn serial_refusal() -> ContinuousError {
    ContinuousError::unsupported(
        "The path component is not a complete serial chain of nested rectangular sections.",
    )
}
