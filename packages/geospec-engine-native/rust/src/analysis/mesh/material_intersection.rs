//! Scalar material intersection of independently qualified primitive boundaries.

use super::exact::{ChargeRun, ChargeStage, ChargeStep, ChargeTrace};
use num_rational::BigRational as Q;
use num_traits::{Signed, Zero};
use std::{cell::RefCell, cmp::Ordering, mem::size_of, rc::Rc};

use super::{
    material::{self, Point},
    MeshAnalysisRecord,
};
use crate::{
    analysis::continuous::exact as arithmetic,
    backend::{BackendError, BackendErrorKind},
    budget::Budget,
};

// Eight halfspaces, at most56 vertices, one face ordering and one running
// accumulator. Each8192-bit rational has two1024-byte integers; comparison
// and checked arithmetic can transiently hold twice that integer width.
// Four MiB reserves these bounded simultaneous limb/object/vector capacities.
pub(crate) const WORKSPACE_BYTES: u64 = 4 * 1024 * 1024;
type Result<T> = std::result::Result<T, BackendError>;

struct Work<'a>(&'a Budget, RefCell<&'a mut ChargeTrace>);
impl Work<'_> {
    fn charge(&self, units: u64) -> Result<()> {
        super::exact::charge(self.0, units).map_err(|e| BackendError {
            kind: BackendErrorKind::BudgetExceeded {
                limit: e.limit,
                used: e.used,
            },
            message: "Exact material scalar work exceeds the declared budget.".into(),
        })?;
        self.1.borrow_mut().record(ChargeStep {
            units,
            pair: None,
            stage: ChargeStage::WholeBodyDistance,
        });
        Ok(())
    }
    fn add(&self, a: &Q, b: &Q) -> Result<Q> {
        self.charge(1)?;
        material::add(a, b)
    }
    fn sub(&self, a: &Q, b: &Q) -> Result<Q> {
        self.charge(1)?;
        material::sub(a, b)
    }
    fn mul(&self, a: &Q, b: &Q) -> Result<Q> {
        self.charge(1)?;
        material::mul(a, b)
    }
    fn div(&self, a: &Q, b: &Q) -> Result<Q> {
        self.charge(1)?;
        material::div(a, b)
    }
    fn difference(&self, a: &Point, b: &Point) -> Result<Point> {
        self.charge(3)?;
        material::difference(a, b)
    }
    fn dot(&self, a: &Point, b: &Point) -> Result<Q> {
        self.charge(5)?;
        material::dot(a, b)
    }
    fn cross(&self, a: &Point, b: &Point) -> Result<Point> {
        self.charge(9)?;
        material::cross(a, b)
    }
    fn compare(&self, a: &Q, b: &Q) -> Result<Ordering> {
        self.charge(1)?;
        Ok(a.cmp(b))
    }
}

#[derive(Clone, PartialEq, Eq)]
struct Plane {
    normal: Point,
    offset: Q,
}

fn planes(tetra: &[Point; 4], work: &Work<'_>) -> Result<Vec<Plane>> {
    let mut result = Vec::with_capacity(4);
    for opposite in 0..4 {
        let face: Vec<_> = (0..4).filter(|&i| i != opposite).collect();
        let a = &tetra[face[0]];
        let mut normal = work.cross(
            &work.difference(&tetra[face[1]], a)?,
            &work.difference(&tetra[face[2]], a)?,
        )?;
        let mut offset = work.dot(&normal, a)?;
        if work
            .dot(&normal, &work.difference(&tetra[opposite], a)?)?
            .is_positive()
        {
            normal = normal.map(|v| -v);
            offset = -offset;
        }
        // Positive scaling canonicalizes coincident supporting halfspaces;
        // opposite-facing planes remain different constraints.
        let scale = normal
            .iter()
            .find(|v| !v.is_zero())
            .ok_or_else(|| {
                material::invalid("A nondegenerate tetrahedron needs nonzero face planes.")
            })?
            .abs();
        for n in &mut normal {
            *n = work.div(n, &scale)?;
        }
        offset = work.div(&offset, &scale)?;
        result.push(Plane { normal, offset });
    }
    Ok(result)
}

fn vertex(a: &Plane, b: &Plane, c: &Plane, work: &Work<'_>) -> Result<Option<Point>> {
    let bc = work.cross(&b.normal, &c.normal)?;
    let determinant = work.dot(&a.normal, &bc)?;
    if determinant.is_zero() {
        return Ok(None);
    }
    let ca = work.cross(&c.normal, &a.normal)?;
    let ab = work.cross(&a.normal, &b.normal)?;
    let mut point = std::array::from_fn(|_| Q::zero());
    for axis in 0..3 {
        point[axis] = work.div(
            &work.add(
                &work.add(
                    &work.mul(&bc[axis], &a.offset)?,
                    &work.mul(&ca[axis], &b.offset)?,
                )?,
                &work.mul(&ab[axis], &c.offset)?,
            )?,
            &determinant,
        )?;
    }
    Ok(Some(point))
}

fn convex_volume(a: &[Point; 4], b: &[Point; 4], work: &Work<'_>) -> Result<Q> {
    let mut constraints = planes(a, work)?;
    for plane in planes(b, work)? {
        work.charge(constraints.len() as u64)?;
        if !constraints.contains(&plane) {
            constraints.push(plane);
        }
    }
    let mut points = Vec::<Point>::with_capacity(56);
    for i in 0..constraints.len() {
        for j in i + 1..constraints.len() {
            for k in j + 1..constraints.len() {
                work.charge(1)?;
                let Some(point) = vertex(&constraints[i], &constraints[j], &constraints[k], work)?
                else {
                    continue;
                };
                let mut inside = true;
                for plane in &constraints {
                    if work.compare(&work.dot(&plane.normal, &point)?, &plane.offset)?
                        == Ordering::Greater
                    {
                        inside = false;
                        break;
                    }
                }
                if inside {
                    work.charge(points.len() as u64 * 3)?;
                    if !points.contains(&point) {
                        points.push(point);
                    }
                }
            }
        }
    }
    if points.len() < 4 {
        return Ok(Q::zero());
    }
    let mut center: Point = std::array::from_fn(|_| Q::zero());
    for p in &points {
        for axis in 0..3 {
            center[axis] = work.add(&center[axis], &p[axis])?;
        }
    }
    let count = Q::from_integer(points.len().into());
    for c in &mut center {
        *c = work.div(c, &count)?;
    }
    let mut volume = Q::zero();
    for plane in constraints {
        let mut face = Vec::<usize>::with_capacity(points.len());
        for (index, p) in points.iter().enumerate() {
            if work.compare(&work.dot(&plane.normal, p)?, &plane.offset)? == Ordering::Equal {
                face.push(index);
            }
        }
        if face.len() < 3 {
            continue;
        }
        let mut face_center: Point = std::array::from_fn(|_| Q::zero());
        for &index in &face {
            for (axis, coordinate) in face_center.iter_mut().enumerate() {
                *coordinate = work.add(coordinate, &points[index][axis])?;
            }
        }
        let count = Q::from_integer(face.len().into());
        for c in &mut face_center {
            *c = work.div(c, &count)?;
        }
        let drop = plane
            .normal
            .iter()
            .position(|n| !n.is_zero())
            .expect("qualified nonzero plane");
        let axes: Vec<_> = (0..3).filter(|&axis| axis != drop).collect();
        // Bounded insertion sort propagates exact-arithmetic/budget refusal;
        // atan2 and an infallible comparator would hide those failure paths.
        let compare = |left: usize, right: usize| -> Result<Ordering> {
            let a = work.difference(&points[left], &face_center)?;
            let b = work.difference(&points[right], &face_center)?;
            let half = |p: &Point| {
                p[axes[1]].is_negative() || (p[axes[1]].is_zero() && p[axes[0]].is_negative())
            };
            if half(&a) != half(&b) {
                return Ok(half(&a).cmp(&half(&b)));
            }
            let cross = work.sub(
                &work.mul(&a[axes[0]], &b[axes[1]])?,
                &work.mul(&a[axes[1]], &b[axes[0]])?,
            )?;
            Ok(if cross.is_positive() {
                Ordering::Less
            } else if cross.is_negative() {
                Ordering::Greater
            } else {
                Ordering::Equal
            })
        };
        for i in 1..face.len() {
            let mut j = i;
            while j > 0 && compare(face[j], face[j - 1])? == Ordering::Less {
                face.swap(j, j - 1);
                j -= 1;
            }
        }
        for i in 1..face.len() - 1 {
            let p = work.difference(&points[face[0]], &center)?;
            let q = work.difference(&points[face[i]], &center)?;
            let r = work.difference(&points[face[i + 1]], &center)?;
            // Interior center makes every face pyramid nonnegative. Unique
            // constraints prevent duplicate coincident face integration.
            volume = work.add(
                &volume,
                &work.div(
                    &work.dot(&p, &work.cross(&q, &r)?)?.abs(),
                    &Q::from_integer(6.into()),
                )?,
            )?;
        }
    }
    Ok(volume)
}

fn tetra(
    record: &MeshAnalysisRecord,
    index: usize,
    anchor: &Point,
    work: &Work<'_>,
) -> Result<[Point; 4]> {
    let mut result = [
        anchor.clone(),
        anchor.clone(),
        anchor.clone(),
        anchor.clone(),
    ];
    for (corner, &vertex) in record.triangles[index].iter().enumerate() {
        for axis in 0..3 {
            work.charge(1)?;
            result[corner + 1][axis] =
                arithmetic::rational(record.positions[vertex as usize][axis])
                    .map_err(material::exact)?;
        }
    }
    Ok(result)
}
fn determinant(t: &[Point; 4], work: &Work<'_>) -> Result<Q> {
    work.dot(
        &work.difference(&t[1], &t[0])?,
        &work.cross(
            &work.difference(&t[2], &t[0])?,
            &work.difference(&t[3], &t[0])?,
        )?,
    )
}
fn disjoint(a: &[Point; 4], b: &[Point; 4], work: &Work<'_>) -> Result<bool> {
    for axis in 0..3 {
        let mut amin = &a[0][axis];
        let mut amax = amin;
        let mut bmin = &b[0][axis];
        let mut bmax = bmin;
        for p in &a[1..] {
            if work.compare(&p[axis], amin)? == Ordering::Less {
                amin = &p[axis];
            }
            if work.compare(&p[axis], amax)? == Ordering::Greater {
                amax = &p[axis];
            }
        }
        for p in &b[1..] {
            if work.compare(&p[axis], bmin)? == Ordering::Less {
                bmin = &p[axis];
            }
            if work.compare(&p[axis], bmax)? == Ordering::Greater {
                bmax = &p[axis];
            }
        }
        if work.compare(amax, bmin)? != Ordering::Greater
            || work.compare(bmax, amin)? != Ordering::Greater
        {
            return Ok(true);
        }
    }
    Ok(false)
}

pub(crate) struct QualifiedMaterial {
    pub(crate) record: Rc<MeshAnalysisRecord>,
    orientation: Vec<bool>,
    pub(crate) regions: Vec<Vec<usize>>,
    pub(crate) trace: ChargeTrace,
    bounds: crate::backend::brep::Bounds,
}
impl QualifiedMaterial {
    pub(crate) fn allocated_bytes(&self) -> u64 {
        (size_of::<Self>() + size_of::<MeshAnalysisRecord>() + 2 * size_of::<usize>()) as u64
            + self.record.positions.capacity() as u64 * size_of::<[f64; 3]>() as u64
            + self.record.triangles.capacity() as u64 * size_of::<[u32; 3]>() as u64
            + self.record.triangle_primitives.capacity() as u64 * size_of::<u32>() as u64
            + self.record.primitives.capacity() as u64 * size_of::<super::Primitive>() as u64
            + self
                .record
                .primitives
                .iter()
                .map(|p| p.name.capacity() as u64)
                .sum::<u64>()
            + self.orientation.capacity() as u64
            + self.regions.capacity() as u64 * size_of::<Vec<usize>>() as u64
            + self
                .regions
                .iter()
                .map(|value| value.capacity() as u64 * size_of::<usize>() as u64)
                .sum::<u64>()
            + self.trace.steps.capacity() as u64 * size_of::<ChargeRun>() as u64
    }
}
pub(crate) fn qualify(
    record: Rc<MeshAnalysisRecord>,
    budget: &Budget,
    byte_limit: u64,
) -> Result<QualifiedMaterial> {
    let mut trace = ChargeTrace::default();
    super::exact::charge(budget, record.positions.len() as u64).map_err(|error| BackendError {
        kind: BackendErrorKind::BudgetExceeded {
            limit: error.limit,
            used: error.used,
        },
        message: "Material operand bounds exceed the declared work budget.".into(),
    })?;
    trace.record(ChargeStep {
        units: record.positions.len() as u64,
        pair: None,
        stage: ChargeStage::BodySetup,
    });
    let mut bounds = crate::backend::brep::Bounds {
        min: [f64::INFINITY; 3],
        max: [f64::NEG_INFINITY; 3],
    };
    for point in &record.positions {
        for (axis, &coordinate) in point.iter().enumerate() {
            bounds.min[axis] = bounds.min[axis].min(coordinate);
            bounds.max[axis] = bounds.max[axis].max(coordinate);
        }
    }
    let (orientation, regions) =
        material::regular_orientation_traced(&record, budget, byte_limit, &mut trace)?;
    Ok(QualifiedMaterial {
        record,
        orientation,
        regions,
        trace,
        bounds,
    })
}

#[cfg(test)]
pub(crate) fn intersection(
    left: &MeshAnalysisRecord,
    right: &MeshAnalysisRecord,
    budget: &Budget,
    byte_limit: u64,
) -> Result<Q> {
    let left = qualify(Rc::new(left.clone()), budget, byte_limit)?;
    let right = qualify(
        Rc::new(right.clone()),
        budget,
        byte_limit.saturating_sub(left.allocated_bytes()),
    )?;
    intersection_qualified(
        &left,
        &right,
        budget,
        byte_limit,
        &mut ChargeTrace::disabled(),
    )
}

pub(crate) fn intersection_qualified(
    left: &QualifiedMaterial,
    right: &QualifiedMaterial,
    budget: &Budget,
    byte_limit: u64,
    trace: &mut ChargeTrace,
) -> Result<Q> {
    intersection_selected(left, None, right, None, budget, byte_limit, trace)
}

pub(crate) fn intersection_selected(
    left: &QualifiedMaterial,
    left_members: Option<&[usize]>,
    right: &QualifiedMaterial,
    right_members: Option<&[usize]>,
    budget: &Budget,
    byte_limit: u64,
    trace: &mut ChargeTrace,
) -> Result<Q> {
    let required = WORKSPACE_BYTES
        .saturating_add(left.allocated_bytes())
        .saturating_add(if std::ptr::eq(left, right) {
            0
        } else {
            right.allocated_bytes()
        });
    if byte_limit < required {
        return Err(material::unresolved(
            "Exact material scalar workspace exceeds the declared byte limit.",
        ));
    }
    trace.limit_to_bytes(byte_limit.saturating_sub(required));
    let left_orientation = &left.orientation;
    let right_orientation = &right.orientation;
    let left_bounds = left.bounds;
    let right_bounds = right.bounds;
    let left = left.record.as_ref();
    let right = right.record.as_ref();
    let work = Work(budget, RefCell::new(trace));
    // This is only a zero-interior certificate after both regular-material
    // premises completed. Exact binary64 extrema cannot prove positive contact.
    for axis in 0..3 {
        work.charge(2)?;
        if left_bounds.max[axis] <= right_bounds.min[axis]
            || right_bounds.max[axis] <= left_bounds.min[axis]
        {
            return Ok(Q::zero());
        }
    }
    // Each operand's existing first retained vertex is a finite local anchor.
    // It need not be in material; zero/exterior fan terms stay in signed sum.
    let anchor = |record: &MeshAnalysisRecord| -> Result<Point> {
        let p = record
            .positions
            .first()
            .ok_or_else(|| material::invalid("A scalar operand needs a nonempty boundary."))?;
        Ok([
            arithmetic::rational(p[0]).map_err(material::exact)?,
            arithmetic::rational(p[1]).map_err(material::exact)?,
            arithmetic::rational(p[2]).map_err(material::exact)?,
        ])
    };
    let aa = anchor(left)?;
    let ba = anchor(right)?;
    let mut total = Q::zero();
    let left_indices = (0..left_orientation.len())
        .take(if left_members.is_some() {
            0
        } else {
            left_orientation.len()
        })
        .chain(left_members.into_iter().flatten().copied());
    for i in left_indices {
        let reverse_a = left_orientation[i];
        let a = tetra(left, i, &aa, &work)?;
        let ad = determinant(&a, &work)?;
        if ad.is_zero() {
            continue;
        }
        let right_indices = (0..right_orientation.len())
            .take(if right_members.is_some() {
                0
            } else {
                right_orientation.len()
            })
            .chain(right_members.into_iter().flatten().copied());
        for j in right_indices {
            let reverse_b = right_orientation[j];
            work.charge(1)?;
            let b = tetra(right, j, &ba, &work)?;
            let bd = determinant(&b, &work)?;
            if bd.is_zero() || disjoint(&a, &b, &work)? {
                continue;
            }
            let cell = convex_volume(&a, &b, &work)?;
            let negative = ad.is_negative() ^ reverse_a ^ bd.is_negative() ^ reverse_b;
            total = if negative {
                work.sub(&total, &cell)?
            } else {
                work.add(&total, &cell)?
            };
        }
    }
    if total.is_negative() {
        return Err(material::invalid(
            "A complete qualified material intersection cannot have negative volume.",
        ));
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::super::Primitive;
    use super::*;
    use num_rational::BigRational;
    use num_traits::Zero;

    #[test]
    fn representative_material_admission_reports_trace_capacity() {
        let specs: Vec<_> = (0..400)
            .map(|index| {
                let x = index as f64 * 2.0;
                ([x, 0.0, 0.0], [x + 1.0, 1.0, 1.0], false)
            })
            .collect();
        let record = Rc::new(boxes(&specs));
        let budget = Budget::new(10_000_000);
        let value = qualify(record, &budget, 256 * 1024 * 1024).unwrap();
        assert_eq!(value.regions.len(), 400);
        println!("material-admission {{\"triangles\":4800,\"regions\":400,\"work\":{},\"traceComplete\":{},\"traceRuns\":{},\"traceAtomicSteps\":{:?},\"traceCapacityBytes\":{},\"traceRequestBytes\":{},\"retainedOperandBytes\":{}}}",budget.used(),value.trace.complete,value.trace.steps.len(),super::super::exact::logical_steps(&value.trace.steps),value.trace.steps.capacity()*size_of::<ChargeRun>(),value.trace.reservation_bytes(),value.allocated_bytes());
        assert!(value.trace.complete);
        let analysis = super::super::analyze(&value.record);
        let limits = crate::backend::AnalysisRetentionLimits {
            max_mesh_bytes: 256 * 1024 * 1024,
            max_mesh_entries: 1,
            max_solid_entries: 0,
        };
        let batch = crate::analysis::batch::BatchAnalysis::new(
            [("representative".into(), 0.0f64.to_bits())],
            limits,
        )
        .unwrap();
        let slot = std::cell::OnceCell::new();
        let cold = Budget::new(10_000_000);
        let first = batch
            .connected_components("representative", 0.0, &analysis, &cold, &slot)
            .unwrap();
        let warm = Budget::new(10_000_000);
        let second = batch
            .connected_components("representative", 0.0, &analysis, &warm, &slot)
            .unwrap();
        assert_eq!(first.count, 400);
        assert!(Rc::ptr_eq(&first, &second));
        assert_eq!(cold.used(), warm.used());
        let trace = &slot.get().unwrap().1;
        assert!(trace.trace_complete);
        println!("material-cache {{\"coldWork\":{},\"warmWork\":{},\"runs\":{},\"atomicSteps\":{:?},\"traceCapacityBytes\":{},\"sameCompletedFact\":true}}",cold.used(),warm.used(),trace.trace.len(),super::super::exact::logical_steps(&trace.trace),trace.trace.capacity()*size_of::<ChargeRun>());
    }

    #[test]
    fn optional_trace_cannot_refuse_small_valid_geometry_and_left_capacity_is_live() {
        let record = Rc::new(boxes(&[([0.0; 3], [1.0; 3], false)]));
        let base = (record.positions.len() as u64) * 6 * (2 * 136 + 64)
            + (record.triangles.len() as u64) * 2048
            + 640 * 1024
            + 3;
        let cold = Budget::new(1_000_000);
        let small = qualify(Rc::clone(&record), &cold, base).unwrap();
        assert!(
            !small.trace.complete,
            "no optional trace storage fits after required geometry"
        );
        let full_budget = Budget::new(1_000_000);
        let full = qualify(Rc::clone(&record), &full_budget, 256 * 1024 * 1024).unwrap();
        assert!(full.trace.complete);
        assert_eq!(cold.used(), full_budget.used());
        assert_eq!(small.orientation, full.orientation);
        assert_eq!(small.regions, full.regions);
        let total = base
            .saturating_add(full.allocated_bytes())
            .saturating_sub(1);
        assert!(qualify(Rc::clone(&record), &Budget::new(1_000_000), total).is_ok());
        let Err(error) = qualify(
            record,
            &Budget::new(1_000_000),
            total.saturating_sub(full.allocated_bytes()),
        ) else {
            panic!("live left capacity must be debited before right admission")
        };
        assert_eq!(error.kind, BackendErrorKind::Unsupported);
    }

    #[test]
    fn caller_output_and_material_workspace_share_the_subject_byte_limit() {
        let record = Rc::new(boxes(&[([0.0; 3], [1.0; 3], false)]));
        let mut subject = crate::subject::Subject::new(
            "private-capacity".into(),
            crate::subject::SubjectFormat::MeshBufferV1,
            "mm".into(),
        );
        assert!(subject.mesh_record.set(record).is_ok());
        let regions = subject.material_regions(&Budget::new(1_000_000)).unwrap();
        let index = subject
            .selector_index(&Budget::new(1_000_000))
            .unwrap()
            .unwrap();
        let live = subject.demanded_material_bytes();
        assert!(live >= crate::analysis::selection::mesh_index_owned_bytes(&index));
        let pending = 64 * 1024;
        subject.retention_limits.max_mesh_bytes = live + WORKSPACE_BYTES + pending - 1;
        assert!(subject
            .region_overlap(&regions[0], &regions[0], &Budget::new(1_000_000), 0)
            .is_ok());
        let error = subject
            .region_overlap(&regions[0], &regions[0], &Budget::new(1_000_000), pending)
            .unwrap_err();
        assert_eq!(error.kind, BackendErrorKind::Unsupported);
        let live = subject.demanded_material_bytes();
        subject.retention_limits.max_mesh_bytes = live + 640 * 1024 + pending - 1;
        assert!(subject
            .region_boundary_distance(&regions[0], &regions[0], &Budget::new(1_000_000), 0)
            .is_ok());
        let error = subject
            .region_boundary_distance(&regions[0], &regions[0], &Budget::new(1_000_000), pending)
            .unwrap_err();
        assert_eq!(error.kind, BackendErrorKind::Unsupported);
    }

    fn boxes(specs: &[([f64; 3], [f64; 3], bool)]) -> MeshAnalysisRecord {
        let mut result = MeshAnalysisRecord {
            positions: Vec::new(),
            triangles: Vec::new(),
            triangle_primitives: Vec::new(),
            primitives: Vec::new(),
        };
        for &(min, max, inward) in specs {
            let cube = super::super::tests::box_record(0.0);
            let start = result.positions.len() as u32;
            result.positions.extend(cube.positions.iter().map(|p| {
                std::array::from_fn(|axis| min[axis] + p[axis] * (max[axis] - min[axis]))
            }));
            result.triangles.extend(cube.triangles.iter().map(|t| {
                let mut t = t.map(|i| i + start);
                if inward {
                    t.swap(1, 2);
                }
                t
            }));
            result
                .triangle_primitives
                .extend(std::iter::repeat_n(0, cube.triangles.len()));
        }
        result.primitives.push(Primitive {
            name: "same-label".into(),
            vertex_start: 0,
            vertex_count: result.positions.len() as u32,
        });
        result
    }
    fn cube(min: [f64; 3], max: [f64; 3]) -> MeshAnalysisRecord {
        boxes(&[(min, max, false)])
    }
    fn q(n: i64, d: i64) -> BigRational {
        BigRational::new(n.into(), d.into())
    }
    fn volume(a: &MeshAnalysisRecord, b: &MeshAnalysisRecord) -> BigRational {
        intersection(a, b, &Budget::new(8_000_000), 256 * 1024 * 1024).unwrap()
    }
    fn l_prism() -> MeshAnalysisRecord {
        let ring = [[0., 0.], [2., 0.], [2., 1.], [1., 1.], [1., 2.], [0., 2.]];
        let mut positions = Vec::new();
        for z in [0., 1.] {
            positions.extend(ring.map(|p| [p[0], p[1], z]));
        }
        let mut triangles = Vec::new();
        for i in 1..5 {
            triangles.push([0, i + 1, i]);
            triangles.push([6, 6 + i, 7 + i]);
        }
        for i in 0..6 {
            let j = (i + 1) % 6;
            triangles.push([i, j, j + 6]);
            triangles.push([i, j + 6, i + 6]);
        }
        MeshAnalysisRecord {
            positions,
            triangle_primitives: vec![0; triangles.len()],
            triangles,
            primitives: vec![Primitive {
                name: "L".into(),
                vertex_start: 0,
                vertex_count: 12,
            }],
        }
    }
    #[test]
    fn independent_nonconvex_and_cavity_intersection_scalars() {
        assert_eq!(
            volume(&l_prism(), &cube([0.5, 0.5, 0.], [1.5, 1.5, 1.])),
            q(3, 4)
        );
        let housing = boxes(&[([-3.; 3], [3.; 3], false), ([-2.; 3], [2.; 3], true)]);
        assert_eq!(
            volume(&housing, &cube([-1.; 3], [1.; 3])),
            BigRational::zero()
        );
        assert_eq!(
            volume(&housing, &cube([2., -1., -1.], [4., 1., 1.])),
            q(4, 1)
        );
    }
    #[test]
    fn tangent_zero_and_tiny_positive_are_distinct() {
        let a = cube([-1.; 3], [1.; 3]);
        for shift in [[2., 0., 0.], [2., 2., 0.], [2., 2., 2.]] {
            assert_eq!(
                volume(&a, &cube(shift.map(|v| v - 1.), shift.map(|v| v + 1.))),
                BigRational::zero()
            );
        }
        let epsilon = 2f64.powi(-44);
        assert_eq!(
            volume(&a, &cube([1. - epsilon, -1., -1.], [3. - epsilon, 1., 1.])),
            BigRational::new(1.into(), (1u64 << 42).into())
        );
    }
    #[test]
    fn overlapping_positive_roots_are_not_union_operands() {
        let a = boxes(&[
            ([0.; 3], [1.; 3], false),
            ([0.5, 0., 0.], [1.5, 1., 1.], false),
        ]);
        let b = cube([0.5, 0., 0.], [1., 1., 1.]);
        let error = intersection(&a, &b, &Budget::new(8_000_000), 256 * 1024 * 1024).unwrap_err();
        assert!(matches!(error.kind, BackendErrorKind::Unsupported));
        assert_eq!(
            volume(&cube([0.; 3], [1.; 3]), &cube([0.5, 0., 0.], [1.5, 1., 1.])),
            q(1, 2)
        );
    }
}
