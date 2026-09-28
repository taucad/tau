//! Bounded exact producer for the fixed rational plate contract.
//!
//! Every source/requirement boundary is a grid plane, so interval containment
//! classifies entire open cells. This is complete refinement, not sampling.

use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::Zero;

use super::plate_contract::{
    required_windows, target_bounds, AdmittedPlate, Box3, MaterialWitnesses, PlaneLists,
    PlateAnalysis, PlateCertificate, PlateError, PlateErrorKind, Point3, PredicateValues,
    RationalText, RawPlate, MAX_GRID_CELLS, MAX_INTEGER_BITS, MAX_WINDOWS,
};
use super::plate_syntax::{input_rational, rational_text};

/// Admit the actual plate/window intervals and derive the complete fixed-target grid.
pub fn admit(raw: &RawPlate) -> Result<AdmittedPlate, PlateError> {
    let grid = Grid::from_raw(raw)?;
    Ok(AdmittedPlate {
        raw: raw.clone(),
        planes: grid.plane_text()?,
        cell_count: grid.cell_count,
    })
}

/// Produce all four values and the complete occupied-cell certificate in one sweep.
///
/// Re-establish admission because the shared admitted type has public fields. No
/// caller-supplied plane, count or partial coverage can select the work performed.
pub fn produce(admitted: &AdmittedPlate) -> Result<PlateAnalysis, PlateError> {
    let grid = Grid::from_raw(&admitted.raw)?;
    let planes = grid.plane_text()?;
    if admitted.cell_count != grid.cell_count || admitted.planes != planes {
        return Err(PlateError::new(
            PlateErrorKind::InvalidRepresentation,
            "Admitted plate grid does not match its defining source.",
        ));
    }

    let mut material = BigRational::zero();
    let mut in_a = BigRational::zero();
    let mut in_b = BigRational::zero();
    let mut witnesses = MaterialWitnesses { a: None, b: None };
    let mut occupied_cells = Vec::with_capacity(grid.cell_count as usize);
    let mut cell_id = 0;

    // At most 38/38/4 planes: 4107 cells and thus <=4107 terms per sum.
    // R2 allows <=8192 terms. Only leaf axis differences are multiplied;
    // accumulators are added to, never multiplied or used as divisors.
    for x in grid.planes[0].windows(2) {
        for y in grid.planes[1].windows(2) {
            for z in grid.planes[2].windows(2) {
                let cell = [x, y, z];
                if grid.plate.contains_cell(&cell)
                    && !grid
                        .windows
                        .iter()
                        .any(|window| window.contains_cell(&cell))
                {
                    let volume = cell_volume(&cell)?;
                    occupied_cells.push(cell_id);
                    add_volume(&mut material, &volume)?;
                    if grid.targets[0].contains_cell(&cell) {
                        add_volume(&mut in_a, &volume)?;
                        if witnesses.a.is_none() {
                            witnesses.a = Some(midpoint(&cell)?);
                        }
                    }
                    if grid.targets[1].contains_cell(&cell) {
                        add_volume(&mut in_b, &volume)?;
                        if witnesses.b.is_none() {
                            witnesses.b = Some(midpoint(&cell)?);
                        }
                    }
                }
                cell_id += 1;
            }
        }
    }
    if cell_id != grid.cell_count {
        return Err(limit(
            "Rational plate traversal did not cover the complete grid.",
        ));
    }

    let predicates = [
        admitted.raw.plate == target_bounds(),
        material == BigRational::from_integer(BigInt::from(196)),
        in_a.is_zero(),
        in_b.is_zero(),
    ];
    Ok(PlateAnalysis {
        window_count: grid.windows.len() as u32,
        cell_count: grid.cell_count,
        measured: PredicateValues {
            // Interior through-windows cannot remove any outer plate face.
            bounds: admitted.raw.plate.clone(),
            material_volume: rational_text(&material)?,
            material_in_a: rational_text(&in_a)?,
            material_in_b: rational_text(&in_b)?,
        },
        predicates,
        certificate: PlateCertificate {
            planes,
            occupied_cells,
            material_witnesses: witnesses,
        },
    })
}

// All exact numbers in these private structs are per-call scratch, never retained
// in AdmittedPlate or PlateAnalysis. Lead owns retained-container byte accounting.
struct ExactBox {
    min: [BigRational; 3],
    max: [BigRational; 3],
}

impl ExactBox {
    fn parse(value: &Box3) -> Result<Self, PlateError> {
        let min = parse_point(&value.min)?;
        let max = parse_point(&value.max)?;
        if (0..3).any(|axis| min[axis] >= max[axis]) {
            return Err(outside_domain());
        }
        Ok(Self { min, max })
    }

    fn contains_cell(&self, cell: &[&[BigRational]; 3]) -> bool {
        (0..3).all(|axis| self.min[axis] <= cell[axis][0] && cell[axis][1] <= self.max[axis])
    }
}

struct Grid {
    plate: ExactBox,
    windows: Vec<ExactBox>,
    targets: [ExactBox; 2],
    planes: [Vec<BigRational>; 3],
    cell_count: u32,
}

impl Grid {
    fn from_raw(raw: &RawPlate) -> Result<Self, PlateError> {
        if raw.windows.len() > MAX_WINDOWS {
            return Err(PlateError::new(
                PlateErrorKind::InvalidRepresentation,
                "Rational plate source exceeds 16 windows.",
            ));
        }
        let plate = ExactBox::parse(&raw.plate)?;
        let windows = raw
            .windows
            .iter()
            .map(ExactBox::parse)
            .collect::<Result<Vec<_>, _>>()?;
        for (index, window) in windows.iter().enumerate() {
            if window.min[2] != plate.min[2]
                || window.max[2] != plate.max[2]
                || (0..2).any(|axis| {
                    window.min[axis] <= plate.min[axis] || window.max[axis] >= plate.max[axis]
                })
            {
                return Err(outside_domain());
            }
            for previous in &windows[..index] {
                if !(0..2).any(|axis| {
                    previous.max[axis] < window.min[axis] || window.max[axis] < previous.min[axis]
                }) {
                    return Err(outside_domain());
                }
            }
        }

        let required = required_windows();
        let targets = [
            ExactBox::parse(&required[0])?,
            ExactBox::parse(&required[1])?,
        ];
        let mut planes: [Vec<BigRational>; 3] = std::array::from_fn(|_| Vec::new());
        for bounds in std::iter::once(&plate).chain(&windows).chain(&targets) {
            for (axis, values) in planes.iter_mut().enumerate() {
                values.push(bounds.min[axis].clone());
                values.push(bounds.max[axis].clone());
            }
        }
        let mut cell_count = 1_u32;
        for (axis, values) in planes.iter_mut().enumerate() {
            values.sort();
            values.dedup();
            let max_planes = if axis == 2 { 4 } else { 38 };
            if values.len() < 2 || values.len() > max_planes {
                return Err(limit("Rational plate grid exceeds its plane bounds."));
            }
            cell_count = cell_count
                .checked_mul((values.len() - 1) as u32)
                .ok_or_else(|| limit("Rational plate grid count overflowed."))?;
        }
        if cell_count > MAX_GRID_CELLS {
            return Err(limit("Rational plate grid exceeds 5000 cells."));
        }
        Ok(Self {
            plate,
            windows,
            targets,
            planes,
            cell_count,
        })
    }

    fn plane_text(&self) -> Result<PlaneLists, PlateError> {
        let convert = |axis: usize| {
            self.planes[axis]
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
}

fn parse_point(value: &Point3) -> Result<[BigRational; 3], PlateError> {
    Ok([
        input_rational(&value[0])?,
        input_rational(&value[1])?,
        input_rational(&value[2])?,
    ])
}

fn cell_volume(cell: &[&[BigRational]; 3]) -> Result<BigRational, PlateError> {
    let dx = guarded(&cell[0][1] - &cell[0][0])?;
    let dy = guarded(&cell[1][1] - &cell[1][0])?;
    let dz = guarded(&cell[2][1] - &cell[2][0])?;
    let area = guarded(dx * dy)?;
    guarded(area * dz)
}

fn add_volume(sum: &mut BigRational, volume: &BigRational) -> Result<(), PlateError> {
    *sum += volume;
    check_bits(sum)
}

fn midpoint(cell: &[&[BigRational]; 3]) -> Result<Point3, PlateError> {
    let coordinate = |axis: usize| -> Result<RationalText, PlateError> {
        let sum = guarded(&cell[axis][0] + &cell[axis][1])?;
        let middle = guarded(sum / BigInt::from(2))?;
        rational_text(&middle)
    };
    Ok([coordinate(0)?, coordinate(1)?, coordinate(2)?])
}

fn guarded(value: BigRational) -> Result<BigRational, PlateError> {
    check_bits(&value)?;
    Ok(value)
}

fn check_bits(value: &BigRational) -> Result<(), PlateError> {
    // B57 r2 restricts this producer's arithmetic: <=114 coordinate occurrences,
    // leaf products only, bounded sums, and midpoint division only by integer 2.
    // Reduced values stay below 7388/7183 bits and unreduced operations below
    // 14572 bits. This guard supplements that proof; it is not a truncation rule.
    if value.numer().bits() > MAX_INTEGER_BITS || value.denom().bits() > MAX_INTEGER_BITS {
        return Err(limit(
            "Rational plate arithmetic exceeds its integer bit guard.",
        ));
    }
    Ok(())
}

fn outside_domain() -> PlateError {
    PlateError::new(
        PlateErrorKind::UnsupportedDomain,
        "The subject is outside geospec.rational-orthogonal-plate/v1.",
    )
}

fn limit(message: &str) -> PlateError {
    PlateError::new(PlateErrorKind::ArithmeticLimit, message)
}
