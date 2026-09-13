//! Complete retained mesh analysis for owned indexed triangle records.

mod gltf;

pub use gltf::{decode_glb, decode_gltf};

use std::{
    cell::OnceCell,
    cmp::Ordering,
    collections::{BTreeMap, HashMap},
    rc::Rc,
};

use crate::backend::{BackendError, BackendErrorKind};
use crate::codec::compare_utf16;

const SPATIAL_EPSILON: f64 = 1e-5;
const CLUSTER_SAMPLE_LIMIT: usize = 4;

pub type Vec3 = [f64; 3];

#[derive(Clone, Debug, PartialEq)]
pub struct Primitive {
    pub name: String,
    pub vertex_start: u32,
    pub vertex_count: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MeshAnalysisRecord {
    pub positions: Vec<Vec3>,
    pub triangles: Vec<[u32; 3]>,
    pub triangle_primitives: Vec<u32>,
    pub primitives: Vec<Primitive>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aabb {
    pub min: Vec3,
    pub max: Vec3,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PrimitiveRecord {
    pub name: String,
    pub color: Option<String>,
    pub vertices: u32,
    pub aabb: Aabb,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MeshTriangle {
    pub primitive: String,
    pub triangle_index: u32,
    pub a: Vec3,
    pub b: Vec3,
    pub c: Vec3,
    pub center: Vec3,
    pub area: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NonFiniteVertex {
    pub primitive: String,
    pub vertex_index: u32,
    pub position: Vec3,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DegenerateTriangle {
    pub primitive: String,
    pub triangle_index: u32,
    pub area: f64,
    pub center: Vec3,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DuplicateFace {
    pub primitive: String,
    pub triangle_index: u32,
    pub first_triangle_index: u32,
}

#[derive(Debug)]
pub struct MeshQuality {
    pub triangle_count: u32,
    pub non_finite_vertices: Vec<NonFiniteVertex>,
    pub degenerate_triangles: Vec<DegenerateTriangle>,
    pub triangles: Vec<MeshTriangle>,
    pub surface_area: f64,
    pub signed_volume: f64,
    pub center_of_mass: Option<Vec3>,
    record: Rc<MeshAnalysisRecord>,
    duplicate_faces: OnceCell<Rc<Vec<DuplicateFace>>>,
}

impl MeshQuality {
    pub fn duplicate_faces(&self) -> Rc<Vec<DuplicateFace>> {
        Rc::clone(
            self.duplicate_faces
                .get_or_init(|| Rc::new(duplicate_faces(&self.record, &self.triangles))),
        )
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IrregularEdgeKind {
    OpenBoundary,
    NonManifold,
}

#[derive(Clone, Debug, PartialEq)]
pub struct IrregularEdgeSample {
    pub start: Vec3,
    pub end: Vec3,
    pub center: Vec3,
    pub incident_triangle_count: u32,
    pub primitives: Vec<String>,
    pub color: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct IrregularEdgeCluster {
    pub kind: IrregularEdgeKind,
    pub edge_count: u32,
    pub aabb: Aabb,
    pub center: Vec3,
    pub samples: Vec<IrregularEdgeSample>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WatertightPrimitiveBreakdown {
    pub name: String,
    pub boundary_edges: u32,
    pub loop_centroid: Vec3,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct IrregularEdgeKindCounts {
    pub open_boundary: u32,
    pub non_manifold: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Watertight {
    pub watertight: bool,
    pub irregular_edges: u32,
    pub open_boundary_edges: u32,
    pub non_manifold_edges: u32,
    pub irregular_edge_kind_counts: IrregularEdgeKindCounts,
    pub irregular_edge_clusters: Vec<IrregularEdgeCluster>,
    pub total_edges: u32,
    pub irregular_edge_fraction: f64,
    pub per_primitive: Vec<WatertightPrimitiveBreakdown>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BoundingBox {
    pub size: Vec3,
    pub center: Vec3,
    pub primitives: Vec<PrimitiveRecord>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ClusterReport {
    pub label: String,
    pub primitives: Vec<PrimitiveRecord>,
    pub aabb: Aabb,
    pub centroid: Vec3,
    pub total_vertices: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ClusterGap {
    pub from_label: String,
    pub to_label: String,
    pub axis: char,
    pub gap_mm: f64,
    pub from_primitive: String,
    pub to_primitive: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ConnectedComponents {
    pub count: u32,
    pub clusters: Vec<ClusterReport>,
    pub gaps: Vec<ClusterGap>,
}

#[derive(Clone, Debug, PartialEq)]
struct Piece {
    primitive_vertices: Vec<(u32, u32)>,
    aabb: Aabb,
    vertices: u32,
}

#[derive(Debug)]
pub struct MeshAnalysis {
    pub vertex_count: u32,
    pub mesh_count: u32,
    pub triangle_count: u32,
    record: Rc<MeshAnalysisRecord>,
    indexed_bounds: bool,
    primitive_records: OnceCell<Rc<Vec<PrimitiveRecord>>>,
    bounding_box: OnceCell<Rc<BoundingBox>>,
    canonical: OnceCell<Rc<Vec<u32>>>,
    mesh_quality: OnceCell<Rc<MeshQuality>>,
    watertight: OnceCell<Rc<Watertight>>,
    pieces: OnceCell<Rc<Vec<Piece>>>,
}

impl MeshAnalysis {
    fn primitive_records(&self) -> &Rc<Vec<PrimitiveRecord>> {
        self.primitive_records
            .get_or_init(|| Rc::new(primitive_records(&self.record)))
    }

    pub fn bounding_box(&self) -> Rc<BoundingBox> {
        Rc::clone(self.bounding_box.get_or_init(|| {
            let mut aabb = empty_aabb();
            if self.indexed_bounds {
                for triangle in &self.record.triangles {
                    for &index in triangle {
                        expand(&mut aabb, self.record.positions[index as usize]);
                    }
                }
            } else {
                for &point in &self.record.positions {
                    expand(&mut aabb, point);
                }
            }
            let aabb = finite_aabb(aabb);
            Rc::new(BoundingBox {
                size: std::array::from_fn(|axis| aabb.max[axis] - aabb.min[axis]),
                center: center(aabb),
                primitives: self.primitive_records().as_ref().clone(),
            })
        }))
    }

    fn canonical(&self) -> &Rc<Vec<u32>> {
        self.canonical
            .get_or_init(|| Rc::new(weld(&self.record.positions)))
    }

    pub fn mesh_quality(&self) -> Rc<MeshQuality> {
        Rc::clone(
            self.mesh_quality
                .get_or_init(|| Rc::new(mesh_quality(Rc::clone(&self.record)))),
        )
    }

    pub fn watertight(&self) -> Rc<Watertight> {
        Rc::clone(
            self.watertight
                .get_or_init(|| Rc::new(watertight(&self.record, self.canonical()))),
        )
    }

    fn pieces(&self) -> &Rc<Vec<Piece>> {
        self.pieces
            .get_or_init(|| Rc::new(sub_meshes(&self.record, self.canonical())))
    }

    pub fn connected_components(&self, tolerance_mm: f64) -> ConnectedComponents {
        connected_components(self, self.pieces(), tolerance_mm)
    }
}

impl MeshAnalysisRecord {
    pub(crate) fn validate(&self) -> Result<(), &'static str> {
        if self.triangles.len() != self.triangle_primitives.len() {
            return Err("triangle and primitive index counts differ");
        }
        for triangle in &self.triangles {
            if triangle
                .iter()
                .any(|&index| index as usize >= self.positions.len())
            {
                return Err("triangle index is outside the position buffer");
            }
        }
        for &primitive in &self.triangle_primitives {
            if primitive as usize >= self.primitives.len() {
                return Err("triangle primitive is outside the primitive table");
            }
        }
        for primitive in &self.primitives {
            let end = primitive
                .vertex_start
                .checked_add(primitive.vertex_count)
                .ok_or("primitive vertex range overflows")?;
            if end as usize > self.positions.len() {
                return Err("primitive vertex range is outside the position buffer");
            }
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum Cell {
    Finite(u64),
    PositiveInfinity,
    NegativeInfinity,
    Nan,
}

fn cell(value: f64) -> Cell {
    let value = (value / SPATIAL_EPSILON).floor();
    if value.is_nan() {
        Cell::Nan
    } else if value == f64::INFINITY {
        Cell::PositiveInfinity
    } else if value == f64::NEG_INFINITY {
        Cell::NegativeInfinity
    } else {
        Cell::Finite(if value == 0.0 { 0 } else { value.to_bits() })
    }
}

fn offset_cell(value: Cell, offset: i32) -> Cell {
    match value {
        Cell::Finite(bits) => {
            let value = f64::from_bits(bits) + f64::from(offset);
            Cell::Finite(if value == 0.0 { 0 } else { value.to_bits() })
        }
        other => other,
    }
}

fn weld(positions: &[Vec3]) -> Vec<u32> {
    let mut canonical = Vec::with_capacity(positions.len());
    let mut representatives: HashMap<[Cell; 3], u32> = HashMap::new();
    for (index, &[x, y, z]) in positions.iter().enumerate() {
        let cells = [cell(x), cell(y), cell(z)];
        let mut representative = None;
        'neighbours: for ox in -1..=1 {
            for oy in -1..=1 {
                for oz in -1..=1 {
                    let key = [
                        offset_cell(cells[0], ox),
                        offset_cell(cells[1], oy),
                        offset_cell(cells[2], oz),
                    ];
                    if let Some(&candidate) = representatives.get(&key) {
                        let point = positions[candidate as usize];
                        if (point[0] - x).abs() <= SPATIAL_EPSILON
                            && (point[1] - y).abs() <= SPATIAL_EPSILON
                            && (point[2] - z).abs() <= SPATIAL_EPSILON
                        {
                            representative = Some(candidate);
                            break 'neighbours;
                        }
                    }
                }
            }
        }
        let representative = representative.unwrap_or(index as u32);
        if representative == index as u32 {
            representatives.insert(cells, representative);
        }
        canonical.push(representative);
    }
    canonical
}

fn base_component_label(label: &str) -> &str {
    let Some((base, suffix)) = label.rsplit_once('#') else {
        return label;
    };
    if !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit()) {
        base
    } else {
        label
    }
}

fn js_min(left: f64, right: f64) -> f64 {
    if left.is_nan() || right.is_nan() {
        f64::NAN
    } else {
        left.min(right)
    }
}

fn js_max(left: f64, right: f64) -> f64 {
    if left.is_nan() || right.is_nan() {
        f64::NAN
    } else {
        left.max(right)
    }
}

fn empty_aabb() -> Aabb {
    Aabb {
        min: [f64::INFINITY; 3],
        max: [f64::NEG_INFINITY; 3],
    }
}

fn expand(aabb: &mut Aabb, point: Vec3) {
    for (axis, value) in point.into_iter().enumerate() {
        aabb.min[axis] = js_min(aabb.min[axis], value);
        aabb.max[axis] = js_max(aabb.max[axis], value);
    }
}

fn finite_aabb(aabb: Aabb) -> Aabb {
    if aabb.min[0].is_finite() {
        aabb
    } else {
        Aabb {
            min: [0.0; 3],
            max: [0.0; 3],
        }
    }
}

fn center(aabb: Aabb) -> Vec3 {
    std::array::from_fn(|axis| (aabb.min[axis] + aabb.max[axis]) / 2.0)
}

fn primitive_records(record: &MeshAnalysisRecord) -> Vec<PrimitiveRecord> {
    record
        .primitives
        .iter()
        .map(|primitive| {
            let mut aabb = empty_aabb();
            let start = primitive.vertex_start as usize;
            let end = start + primitive.vertex_count as usize;
            for &point in &record.positions[start..end] {
                expand(&mut aabb, point);
            }
            PrimitiveRecord {
                name: primitive.name.clone(),
                color: None,
                vertices: primitive.vertex_count,
                aabb: finite_aabb(aabb),
            }
        })
        .collect()
}

fn triangle_area(a: Vec3, b: Vec3, c: Vec3) -> f64 {
    let ux = b[0] - a[0];
    let uy = b[1] - a[1];
    let uz = b[2] - a[2];
    let vx = c[0] - a[0];
    let vy = c[1] - a[1];
    let vz = c[2] - a[2];
    let x = uy * vz - uz * vy;
    let y = uz * vx - ux * vz;
    let z = ux * vy - uy * vx;
    hypot3(x, y, z) / 2.0
}

fn hypot3(x: f64, y: f64, z: f64) -> f64 {
    let values = [x.abs(), y.abs(), z.abs()];
    if values.contains(&f64::INFINITY) {
        return f64::INFINITY;
    }
    if values.iter().any(|value| value.is_nan()) {
        return f64::NAN;
    }
    let mut maximum = 0.0;
    let mut sum = 0.0;
    let mut compensation = 0.0;
    for value in values {
        if value > maximum {
            if maximum != 0.0 {
                let scale = maximum / value;
                sum *= scale * scale;
                compensation *= scale * scale;
            }
            maximum = value;
        }
        if value != 0.0 {
            let ratio = value / maximum;
            let summand = ratio * ratio - compensation;
            let preliminary = sum + summand;
            compensation = (preliminary - sum) - summand;
            sum = preliminary;
        }
    }
    maximum * sum.sqrt()
}

fn position_key(point: Vec3) -> [u64; 3] {
    point.map(|value| {
        if value == 0.0 {
            0
        } else if value.is_nan() {
            f64::NAN.to_bits()
        } else {
            value.to_bits()
        }
    })
}

fn mesh_quality(record: Rc<MeshAnalysisRecord>) -> MeshQuality {
    let mut triangles = Vec::with_capacity(record.triangles.len());
    let mut non_finite_vertices = Vec::new();
    let mut degenerate_triangles = Vec::new();
    let mut surface_area = 0.0;
    let mut signed_volume = 0.0;
    let mut centroid = [0.0; 3];
    for (index, (&indices, &primitive_index)) in record
        .triangles
        .iter()
        .zip(&record.triangle_primitives)
        .enumerate()
    {
        let a = record.positions[indices[0] as usize];
        let b = record.positions[indices[1] as usize];
        let c = record.positions[indices[2] as usize];
        let area = triangle_area(a, b, c);
        let triangle = MeshTriangle {
            primitive: record.primitives[primitive_index as usize].name.clone(),
            triangle_index: index as u32,
            a,
            b,
            c,
            center: std::array::from_fn(|axis| (a[axis] + b[axis] + c[axis]) / 3.0),
            area,
        };
        surface_area += area;
        let contribution = (a[0] * (b[1] * c[2] - b[2] * c[1])
            - a[1] * (b[0] * c[2] - b[2] * c[0])
            + a[2] * (b[0] * c[1] - b[1] * c[0]))
            / 6.0;
        signed_volume += contribution;
        for axis in 0..3 {
            centroid[axis] += contribution * (a[axis] + b[axis] + c[axis]) / 4.0;
        }
        for (corner, position) in [a, b, c].into_iter().enumerate() {
            if !position.into_iter().all(f64::is_finite) {
                non_finite_vertices.push(NonFiniteVertex {
                    primitive: triangle.primitive.clone(),
                    vertex_index: (index * 3 + corner) as u32,
                    position,
                });
            }
        }
        if area == 0.0 {
            degenerate_triangles.push(DegenerateTriangle {
                primitive: triangle.primitive.clone(),
                triangle_index: index as u32,
                area: 0.0,
                center: triangle.center,
            });
        }
        triangles.push(triangle);
    }

    MeshQuality {
        triangle_count: triangles.len() as u32,
        non_finite_vertices,
        degenerate_triangles,
        triangles,
        surface_area,
        signed_volume,
        center_of_mass: (signed_volume.is_finite() && signed_volume != 0.0)
            .then(|| centroid.map(|value| value / signed_volume)),
        record,
        duplicate_faces: OnceCell::new(),
    }
}

fn duplicate_faces(record: &MeshAnalysisRecord, triangles: &[MeshTriangle]) -> Vec<DuplicateFace> {
    let mut canonical = Vec::with_capacity(record.positions.len());
    let mut positions = HashMap::new();
    for (index, &point) in record.positions.iter().enumerate() {
        let key = position_key(point);
        let representative = *positions.entry(key).or_insert(index as u32);
        canonical.push(representative);
    }
    let mut seen = HashMap::new();
    let mut duplicate_faces = Vec::new();
    for (index, (&indices, &primitive)) in record
        .triangles
        .iter()
        .zip(&record.triangle_primitives)
        .enumerate()
    {
        let mut corners = indices.map(|vertex| canonical[vertex as usize]);
        corners.sort_unstable();
        let key = (primitive, corners);
        if let Some(&first_triangle_index) = seen.get(&key) {
            duplicate_faces.push(DuplicateFace {
                primitive: triangles[index].primitive.clone(),
                triangle_index: index as u32,
                first_triangle_index,
            });
        } else {
            seen.insert(key, index as u32);
        }
    }

    duplicate_faces
}

#[derive(Clone, Debug)]
struct Edge {
    from: u32,
    to: u32,
    incident_triangle_count: u32,
    primitives: Vec<u32>,
}

fn edges(record: &MeshAnalysisRecord, canonical: &[u32]) -> Vec<Edge> {
    let mut keys: HashMap<(String, u32, u32), usize> = HashMap::new();
    let mut edges: Vec<Edge> = Vec::new();
    for (index, (&indices, &primitive)) in record
        .triangles
        .iter()
        .zip(&record.triangle_primitives)
        .enumerate()
    {
        let corners = indices.map(|vertex| canonical[vertex as usize]);
        if corners[0] == corners[1] || corners[1] == corners[2] || corners[0] == corners[2] {
            continue;
        }
        for corner in 0..3 {
            let from = corners[corner];
            let to = corners[(corner + 1) % 3];
            let (from, to) = if from < to { (from, to) } else { (to, from) };
            let component =
                base_component_label(&record.primitives[primitive as usize].name).to_owned();
            let key = (component, from, to);
            if let Some(&edge_index) = keys.get(&key) {
                let edge = &mut edges[edge_index];
                edge.incident_triangle_count += 1;
                if !edge.primitives.contains(&primitive) {
                    edge.primitives.push(primitive);
                }
            } else {
                keys.insert(key, edges.len());
                edges.push(Edge {
                    from,
                    to,
                    incident_triangle_count: 1,
                    primitives: vec![primitive],
                });
            }
        }
        let _ = index;
    }
    edges
}

fn find(parent: &mut [usize], value: usize) -> usize {
    let mut current = value;
    while parent[current] != current {
        parent[current] = parent[parent[current]];
        current = parent[current];
    }
    current
}

fn irregular_clusters(
    record: &MeshAnalysisRecord,
    edges: &[Edge],
    selected: &[usize],
    kind: IrregularEdgeKind,
) -> Vec<IrregularEdgeCluster> {
    let mut parent: Vec<usize> = (0..selected.len()).collect();
    let mut owner = HashMap::new();
    for (local_index, &edge_index) in selected.iter().enumerate() {
        let edge = &edges[edge_index];
        for endpoint in [edge.from, edge.to] {
            if let Some(&existing) = owner.get(&endpoint) {
                let left = find(&mut parent, existing);
                let right = find(&mut parent, local_index);
                if left != right {
                    parent[left] = right;
                }
            } else {
                owner.insert(endpoint, local_index);
            }
        }
    }
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut group_indices = HashMap::new();
    for (local_index, &edge_index) in selected.iter().enumerate() {
        let root = find(&mut parent, local_index);
        let group_index = *group_indices.entry(root).or_insert_with(|| {
            groups.push(Vec::new());
            groups.len() - 1
        });
        groups[group_index].push(edge_index);
    }
    let mut clusters: Vec<_> = groups
        .into_iter()
        .map(|group| {
            let mut aabb = empty_aabb();
            for &edge_index in &group {
                let edge = &edges[edge_index];
                expand(&mut aabb, record.positions[edge.from as usize]);
                expand(&mut aabb, record.positions[edge.to as usize]);
            }
            let mut ordered = group;
            ordered.sort_by_key(|&index| (edges[index].from, edges[index].to));
            let samples = ordered
                .iter()
                .take(CLUSTER_SAMPLE_LIMIT)
                .map(|&edge_index| {
                    let edge = &edges[edge_index];
                    let start = record.positions[edge.from as usize];
                    let end = record.positions[edge.to as usize];
                    let mut primitives = edge.primitives.clone();
                    primitives.sort_unstable();
                    IrregularEdgeSample {
                        start,
                        end,
                        center: std::array::from_fn(|axis| (start[axis] + end[axis]) / 2.0),
                        incident_triangle_count: edge.incident_triangle_count,
                        primitives: primitives
                            .into_iter()
                            .map(|index| record.primitives[index as usize].name.clone())
                            .collect(),
                        color: None,
                    }
                })
                .collect();
            IrregularEdgeCluster {
                kind,
                edge_count: ordered.len() as u32,
                aabb,
                center: center(aabb),
                samples,
            }
        })
        .collect();
    clusters.sort_by(|left, right| {
        right
            .edge_count
            .cmp(&left.edge_count)
            .then_with(|| partial_cmp(left.aabb.min[0], right.aabb.min[0]))
    });
    clusters
}

fn watertight(record: &MeshAnalysisRecord, canonical: &[u32]) -> Watertight {
    let edges = edges(record, canonical);
    let open: Vec<_> = edges
        .iter()
        .enumerate()
        .filter_map(|(index, edge)| (edge.incident_triangle_count == 1).then_some(index))
        .collect();
    let non_manifold: Vec<_> = edges
        .iter()
        .enumerate()
        .filter_map(|(index, edge)| (edge.incident_triangle_count > 2).then_some(index))
        .collect();
    let mut per_primitive = Vec::with_capacity(record.primitives.len());
    for (primitive_index, primitive) in record.primitives.iter().enumerate() {
        let owned: Vec<_> = open
            .iter()
            .filter(|&&edge| edges[edge].primitives.contains(&(primitive_index as u32)))
            .collect();
        let mut sum = [0.0; 3];
        for &&edge_index in &owned {
            let edge = &edges[edge_index];
            let start = record.positions[edge.from as usize];
            let end = record.positions[edge.to as usize];
            for axis in 0..3 {
                sum[axis] += (start[axis] + end[axis]) / 2.0;
            }
        }
        let count = owned.len().max(1) as f64;
        per_primitive.push(WatertightPrimitiveBreakdown {
            name: primitive.name.clone(),
            boundary_edges: owned.len() as u32,
            loop_centroid: sum.map(|value| value / count),
        });
    }
    let total_edges = edges.len() as u32;
    let open_boundary_edges = open.len() as u32;
    let non_manifold_edges = non_manifold.len() as u32;
    let irregular_edges = open_boundary_edges + non_manifold_edges;
    let mut irregular_edge_clusters =
        irregular_clusters(record, &edges, &open, IrregularEdgeKind::OpenBoundary);
    irregular_edge_clusters.extend(irregular_clusters(
        record,
        &edges,
        &non_manifold,
        IrregularEdgeKind::NonManifold,
    ));
    Watertight {
        watertight: total_edges > 0 && irregular_edges == 0,
        irregular_edges,
        open_boundary_edges,
        non_manifold_edges,
        irregular_edge_kind_counts: IrregularEdgeKindCounts {
            open_boundary: open_boundary_edges,
            non_manifold: non_manifold_edges,
        },
        irregular_edge_clusters,
        total_edges,
        irregular_edge_fraction: if total_edges == 0 {
            0.0
        } else {
            f64::from(irregular_edges) / f64::from(total_edges)
        },
        per_primitive,
    }
}

fn sub_meshes(record: &MeshAnalysisRecord, canonical: &[u32]) -> Vec<Piece> {
    let mut parent: Vec<usize> = (0..record.triangles.len()).collect();
    let mut owner = HashMap::new();
    for (triangle_index, triangle) in record.triangles.iter().enumerate() {
        for &vertex in triangle {
            let vertex = canonical[vertex as usize];
            if let Some(&existing) = owner.get(&vertex) {
                let left = find(&mut parent, existing);
                let right = find(&mut parent, triangle_index);
                if left != right {
                    parent[left] = right;
                }
            } else {
                owner.insert(vertex, triangle_index);
            }
        }
    }
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut group_indices = HashMap::new();
    for triangle_index in 0..record.triangles.len() {
        let root = find(&mut parent, triangle_index);
        let group_index = *group_indices.entry(root).or_insert_with(|| {
            groups.push(Vec::new());
            groups.len() - 1
        });
        groups[group_index].push(triangle_index);
    }
    groups
        .into_iter()
        .map(|members| {
            let mut aabb = empty_aabb();
            let mut primitive_vertices: Vec<(u32, u32)> = Vec::new();
            let mut primitive_indices = HashMap::new();
            for triangle_index in &members {
                for &vertex in &record.triangles[*triangle_index] {
                    expand(&mut aabb, record.positions[vertex as usize]);
                }
                let primitive = record.triangle_primitives[*triangle_index];
                let entry = *primitive_indices.entry(primitive).or_insert_with(|| {
                    primitive_vertices.push((primitive, 0));
                    primitive_vertices.len() - 1
                });
                primitive_vertices[entry].1 += 3;
            }
            Piece {
                primitive_vertices,
                aabb: finite_aabb(aabb),
                vertices: (members.len() * 3) as u32,
            }
        })
        .collect()
}

fn sweep_axis(pieces: &[Piece]) -> usize {
    if pieces.is_empty() {
        return 0;
    }
    let mut sums = [0.0; 3];
    let mut squares = [0.0; 3];
    for piece in pieces {
        let center = center(piece.aabb);
        for axis in 0..3 {
            sums[axis] += center[axis];
            squares[axis] += center[axis] * center[axis];
        }
    }
    let count = pieces.len() as f64;
    let variance =
        std::array::from_fn::<_, 3, _>(|axis| squares[axis] / count - (sums[axis] / count).powi(2));
    if variance[0] >= variance[1] && variance[0] >= variance[2] {
        0
    } else if variance[1] >= variance[2] {
        1
    } else {
        2
    }
}

fn overlaps_within(left: Aabb, right: Aabb, tolerance: f64) -> bool {
    (0..3).all(|axis| {
        left.min[axis] <= right.max[axis] + tolerance
            && right.min[axis] <= left.max[axis] + tolerance
    })
}

fn dominant_gap(left: Aabb, right: Aabb) -> (usize, f64) {
    let mut best = (0, f64::NEG_INFINITY);
    for axis in 0..3 {
        let gap = js_max(
            right.min[axis] - left.max[axis],
            left.min[axis] - right.max[axis],
        );
        if gap > best.1 {
            best = (axis, gap);
        }
    }
    best
}

fn partial_cmp(left: f64, right: f64) -> Ordering {
    left.partial_cmp(&right).unwrap_or(Ordering::Equal)
}

fn connected_components(
    analysis: &MeshAnalysis,
    pieces: &[Piece],
    tolerance_mm: f64,
) -> ConnectedComponents {
    let mut parent: Vec<usize> = (0..pieces.len()).collect();
    let axis = sweep_axis(pieces);
    let mut order: Vec<usize> = (0..pieces.len()).collect();
    order.sort_by(|&left, &right| {
        partial_cmp(pieces[left].aabb.min[axis], pieces[right].aabb.min[axis])
            .then_with(|| left.cmp(&right))
    });
    for index in 0..order.len() {
        let current_index = order[index];
        let current = &pieces[current_index];
        for &candidate_index in &order[index + 1..] {
            let candidate = &pieces[candidate_index];
            if candidate.aabb.min[axis] > current.aabb.max[axis] + tolerance_mm {
                break;
            }
            if !overlaps_within(current.aabb, candidate.aabb, tolerance_mm) {
                continue;
            }
            let left = find(&mut parent, current_index);
            let right = find(&mut parent, candidate_index);
            if left != right {
                parent[left] = right;
            }
        }
    }

    let mut merged: Vec<Vec<usize>> = Vec::new();
    let mut merged_indices = HashMap::new();
    for piece_index in 0..pieces.len() {
        let root = find(&mut parent, piece_index);
        let group_index = *merged_indices.entry(root).or_insert_with(|| {
            merged.push(Vec::new());
            merged.len() - 1
        });
        merged[group_index].push(piece_index);
    }

    struct Draft {
        label: String,
        members: BTreeMap<u32, (u32, Aabb)>,
        aabb: Aabb,
        total_vertices: u32,
    }
    let drafts: Vec<_> = merged
        .into_iter()
        .map(|group| {
            let mut aabb = empty_aabb();
            let mut total_vertices = 0;
            let mut members: BTreeMap<u32, (u32, Aabb)> = BTreeMap::new();
            for piece_index in group {
                let piece = &pieces[piece_index];
                expand(&mut aabb, piece.aabb.min);
                expand(&mut aabb, piece.aabb.max);
                total_vertices += piece.vertices;
                for &(primitive, vertices) in &piece.primitive_vertices {
                    let member = members.entry(primitive).or_insert((0, empty_aabb()));
                    member.0 += vertices;
                    expand(&mut member.1, piece.aabb.min);
                    expand(&mut member.1, piece.aabb.max);
                }
            }
            let (&heaviest, _) = members
                .iter()
                .max_by(|left, right| left.1 .0.cmp(&right.1 .0).then_with(|| right.0.cmp(left.0)))
                .expect("a component contains a triangle");
            Draft {
                label: base_component_label(&analysis.primitive_records()[heaviest as usize].name)
                    .to_owned(),
                members,
                aabb: finite_aabb(aabb),
                total_vertices,
            }
        })
        .collect();

    let mut cluster_count_by_primitive = HashMap::new();
    for draft in &drafts {
        for &primitive in draft.members.keys() {
            *cluster_count_by_primitive.entry(primitive).or_insert(0_u32) += 1;
        }
    }
    let mut part_ordinals = HashMap::new();
    let mut clusters: Vec<_> = drafts
        .into_iter()
        .map(|draft| {
            let primitives = draft
                .members
                .into_iter()
                .map(|(primitive, (vertices, aabb))| {
                    let whole = &analysis.primitive_records()[primitive as usize];
                    let label = base_component_label(&whole.name);
                    if cluster_count_by_primitive[&primitive] < 2 {
                        PrimitiveRecord {
                            name: label.to_owned(),
                            ..whole.clone()
                        }
                    } else {
                        let ordinal = part_ordinals.entry(primitive).or_insert(0_u32);
                        let name = format!("{label}#part{ordinal}");
                        *ordinal += 1;
                        PrimitiveRecord {
                            name,
                            color: whole.color.clone(),
                            vertices,
                            aabb: finite_aabb(aabb),
                        }
                    }
                })
                .collect();
            ClusterReport {
                label: draft.label,
                primitives,
                aabb: draft.aabb,
                centroid: center(draft.aabb),
                total_vertices: draft.total_vertices,
            }
        })
        .collect();
    clusters.sort_by(|left, right| {
        right
            .total_vertices
            .cmp(&left.total_vertices)
            .then_with(|| compare_utf16(&left.label, &right.label))
    });

    let mut gaps = Vec::new();
    for left in 0..clusters.len() {
        for right in left + 1..clusters.len() {
            let from = &clusters[left];
            let to = &clusters[right];
            let mut best: Option<ClusterGap> = None;
            for from_primitive in &from.primitives {
                for to_primitive in &to.primitives {
                    let (axis, gap) = dominant_gap(from_primitive.aabb, to_primitive.aabb);
                    if best.as_ref().is_none_or(|current| gap < current.gap_mm) {
                        best = Some(ClusterGap {
                            from_label: from.label.clone(),
                            to_label: to.label.clone(),
                            axis: ['x', 'y', 'z'][axis],
                            gap_mm: gap,
                            from_primitive: from_primitive.name.clone(),
                            to_primitive: to_primitive.name.clone(),
                        });
                    }
                }
            }
            gaps.push(best.expect("clusters contain primitives"));
        }
    }
    gaps.sort_by(|left, right| {
        partial_cmp(left.gap_mm, right.gap_mm)
            .then_with(|| compare_utf16(&left.from_label, &right.from_label))
            .then_with(|| compare_utf16(&left.to_label, &right.to_label))
    });
    ConnectedComponents {
        count: clusters.len() as u32,
        clusters,
        gaps,
    }
}

/// GSM1 bounds use only referenced positions, while other analysis retains the
/// complete admitted record. Other source formats keep their own bounds scope.
pub(crate) fn analyze_indexed(
    record: &Rc<MeshAnalysisRecord>,
) -> Result<MeshAnalysis, BackendError> {
    let mut analysis = analyze(record)?;
    analysis.indexed_bounds = true;
    Ok(analysis)
}

pub fn analyze(record: &Rc<MeshAnalysisRecord>) -> Result<MeshAnalysis, BackendError> {
    record.validate().map_err(|message| BackendError {
        kind: BackendErrorKind::InvalidInput,
        message: format!("Invalid retained mesh analysis record: {message}."),
    })?;
    Ok(MeshAnalysis {
        vertex_count: record.positions.len() as u32,
        mesh_count: record.primitives.len() as u32,
        triangle_count: record.triangles.len() as u32,
        record: Rc::clone(record),
        indexed_bounds: false,
        primitive_records: OnceCell::new(),
        bounding_box: OnceCell::new(),
        canonical: OnceCell::new(),
        mesh_quality: OnceCell::new(),
        watertight: OnceCell::new(),
        pieces: OnceCell::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn box_record(offset: f64) -> MeshAnalysisRecord {
        let positions = vec![
            [offset, 0.0, 0.0],
            [offset + 1.0, 0.0, 0.0],
            [offset + 1.0, 1.0, 0.0],
            [offset, 1.0, 0.0],
            [offset, 0.0, 1.0],
            [offset + 1.0, 0.0, 1.0],
            [offset + 1.0, 1.0, 1.0],
            [offset, 1.0, 1.0],
        ];
        let triangles = vec![
            [0, 2, 1],
            [0, 3, 2],
            [4, 5, 6],
            [4, 6, 7],
            [0, 1, 5],
            [0, 5, 4],
            [3, 7, 6],
            [3, 6, 2],
            [0, 4, 7],
            [0, 7, 3],
            [1, 2, 6],
            [1, 6, 5],
        ];
        MeshAnalysisRecord {
            positions,
            triangle_primitives: vec![0; triangles.len()],
            triangles,
            primitives: vec![Primitive {
                name: "box#0".into(),
                vertex_start: 0,
                vertex_count: 8,
            }],
        }
    }

    #[test]
    fn analyzes_closed_asymmetric_translated_box() {
        let analysis = analyze(&Rc::new(box_record(3.0))).unwrap();
        assert!(analysis.mesh_quality.get().is_none());
        assert!(analysis.canonical.get().is_none());
        assert!(analysis.watertight.get().is_none());
        assert!(analysis.pieces.get().is_none());
        let quality = analysis.mesh_quality();
        assert!(analysis.bounding_box.get().is_none());
        let bounding_box = analysis.bounding_box();
        assert_eq!(bounding_box.size, [1.0, 1.0, 1.0]);
        assert_eq!(bounding_box.center, [3.5, 0.5, 0.5]);
        assert_eq!(quality.surface_area, 6.0);
        assert!((quality.signed_volume - 1.0).abs() < 1e-12);
        let center = quality.center_of_mass.unwrap();
        assert!((center[0] - 3.5).abs() < 1e-12);
        assert!((center[1] - 0.5).abs() < 1e-12);
        assert!((center[2] - 0.5).abs() < 1e-12);
        assert!(analysis.watertight().watertight);
    }

    #[test]
    fn orders_equal_weight_component_labels_by_utf16_code_units() {
        let labels = ["a", "A", "á", "ä", "Z", "Ω", "", "😀", "𐀀"];
        let mut record = MeshAnalysisRecord {
            positions: Vec::new(),
            triangles: Vec::new(),
            triangle_primitives: Vec::new(),
            primitives: Vec::new(),
        };
        for (index, label) in labels.into_iter().enumerate() {
            let vertex_start = record.positions.len() as u32;
            let x = index as f64 * 10.0;
            record
                .positions
                .extend([[x, 0.0, 0.0], [x + 1.0, 0.0, 0.0], [x, 1.0, 0.0]]);
            record
                .triangles
                .push([vertex_start, vertex_start + 1, vertex_start + 2]);
            record.triangle_primitives.push(index as u32);
            record.primitives.push(Primitive {
                name: format!("{label}#0"),
                vertex_start,
                vertex_count: 3,
            });
        }
        let analysis = analyze(&Rc::new(record)).unwrap();
        let components = analysis.connected_components(0.0);
        let actual: Vec<_> = components
            .clusters
            .iter()
            .map(|cluster| cluster.label.as_str())
            .collect();
        assert_eq!(actual, ["A", "Z", "a", "á", "ä", "Ω", "𐀀", "😀", ""]);
        let equal_gap_pairs: Vec<_> = components
            .gaps
            .iter()
            .take(8)
            .map(|gap| {
                assert_eq!(gap.gap_mm, 9.0);
                (gap.from_label.as_str(), gap.to_label.as_str())
            })
            .collect();
        assert_eq!(
            equal_gap_pairs,
            [
                ("A", "a"),
                ("A", "á"),
                ("Z", "ä"),
                ("Z", "Ω"),
                ("á", "ä"),
                ("Ω", ""),
                ("𐀀", "😀"),
                ("😀", ""),
            ]
        );
    }

    #[test]
    fn preserves_unused_vertices_in_bounds_but_not_topology() {
        let mut record = box_record(0.0);
        record.positions.push([100.0, 100.0, 100.0]);
        record.primitives[0].vertex_count += 1;
        let analysis = analyze(&Rc::new(record)).unwrap();
        assert_eq!(analysis.vertex_count, 9);
        assert_eq!(analysis.bounding_box().size, [100.0, 100.0, 100.0]);
        assert!(analysis.watertight().watertight);
    }

    #[test]
    fn localizes_open_non_manifold_duplicate_and_degenerate_evidence() {
        let record = MeshAnalysisRecord {
            positions: vec![
                [0.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, -1.0, 0.0],
            ],
            triangles: vec![[0, 1, 2], [2, 1, 0], [0, 1, 3], [0, 0, 1]],
            triangle_primitives: vec![0; 4],
            primitives: vec![Primitive {
                name: "fin#0".into(),
                vertex_start: 0,
                vertex_count: 4,
            }],
        };
        let analysis = analyze(&Rc::new(record)).unwrap();
        let quality = analysis.mesh_quality();
        let watertight = analysis.watertight();
        assert!(quality.duplicate_faces.get().is_none());
        assert_eq!(quality.duplicate_faces().len(), 1);
        assert_eq!(quality.degenerate_triangles.len(), 1);
        assert_eq!(watertight.non_manifold_edges, 1);
        assert!(watertight
            .irregular_edge_clusters
            .iter()
            .any(|cluster| cluster.kind == IrregularEdgeKind::NonManifold));
    }

    #[test]
    fn joins_components_at_the_declared_tolerance_boundary() {
        let mut record = box_record(0.0);
        let right = box_record(2.0);
        let vertex_start = record.positions.len() as u32;
        record.positions.extend(right.positions);
        record.triangles.extend(
            right
                .triangles
                .into_iter()
                .map(|triangle| triangle.map(|index| index + vertex_start)),
        );
        record.triangle_primitives.extend(vec![1; 12]);
        record.primitives.push(Primitive {
            name: "right#0".into(),
            vertex_start,
            vertex_count: 8,
        });
        let analysis = analyze(&Rc::new(record)).unwrap();
        assert_eq!(analysis.connected_components(0.999_999).count, 2);
        assert_eq!(analysis.connected_components(1.0).count, 1);
    }

    #[test]
    fn welds_adjacent_cells_away_from_origin_only_within_epsilon() {
        let canonical = weld(&[
            [123.000_009, 45.0, -67.0],
            [123.000_011, 45.0, -67.0],
            [123.000_021_5, 45.0, -67.0],
        ]);
        assert_eq!(canonical, [0, 0, 2]);
    }

    #[test]
    fn hypot_matches_the_node24_source_runtime() {
        assert_eq!(hypot3(0.1, 0.2, 0.3).to_bits(), 0x3fd7_f254_dab9_cc3b);
        assert_eq!(
            hypot3(1e200, 1e200, 1e-200).to_bits(),
            0x697d_8f98_1133_5b57
        );
    }
}
