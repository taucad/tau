//! Complete retained mesh analysis for owned indexed triangle records.

mod gltf;
#[cfg(test)]
mod reference_tests;

pub use gltf::{decode_glb, decode_gltf};

use std::{
    cell::OnceCell,
    cmp::Ordering,
    collections::{hash_map::Entry, BTreeMap, HashMap, HashSet},
    hash::{BuildHasherDefault, Hash, Hasher},
    rc::Rc,
};

use crate::backend::BackendError;
use crate::codec::compare_utf16;

const SPATIAL_EPSILON: f64 = 1e-5;
const CLUSTER_SAMPLE_LIMIT: usize = 4;

/// Deterministic multiply-fold hasher for internal maps that are only probed,
/// never iterated, so their order cannot reach any result.
// ponytail: fixed seed trades SipHash's flooding resistance for speed; seed
// per engine if hostile inputs ever need collision-cost guarantees.
struct FoldHasher(u64);

impl Default for FoldHasher {
    fn default() -> Self {
        Self(0x243f_6a88_85a3_08d3)
    }
}

impl Hasher for FoldHasher {
    fn write(&mut self, bytes: &[u8]) {
        for chunk in bytes.chunks(8) {
            let mut word = [0; 8];
            word[..chunk.len()].copy_from_slice(chunk);
            self.write_u64(u64::from_le_bytes(word));
        }
    }

    fn write_u32(&mut self, value: u32) {
        self.write_u64(value.into());
    }

    fn write_u64(&mut self, value: u64) {
        let product = u128::from(self.0 ^ value) * 0x9e37_79b9_7f4a_7c15;
        self.0 = product as u64 ^ (product >> 64) as u64;
    }

    fn write_usize(&mut self, value: usize) {
        self.write_u64(value as u64);
    }

    fn finish(&self) -> u64 {
        self.0
    }
}

type FastMap<K, V> = HashMap<K, V, BuildHasherDefault<FoldHasher>>;
type FastSet<K> = HashSet<K, BuildHasherDefault<FoldHasher>>;

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

/// Per-triangle rows share their primitive's name instead of copying it.
#[derive(Clone, Debug, PartialEq)]
pub struct MeshTriangle {
    pub primitive: Rc<str>,
    pub triangle_index: u32,
    pub a: Vec3,
    pub b: Vec3,
    pub c: Vec3,
    pub center: Vec3,
    pub area: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NonFiniteVertex {
    pub primitive: Rc<str>,
    pub vertex_index: u32,
    pub position: Vec3,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DegenerateTriangle {
    pub primitive: Rc<str>,
    pub triangle_index: u32,
    pub area: f64,
    pub center: Vec3,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DuplicateFace {
    pub primitive: Rc<str>,
    pub triangle_index: u32,
    pub first_triangle_index: u32,
}

/// Sums and failure lists only; per-triangle rows are derived on demand.
#[derive(Debug)]
pub struct MeshQuality {
    pub triangle_count: u32,
    pub non_finite_vertices: Vec<NonFiniteVertex>,
    pub degenerate_triangles: Vec<DegenerateTriangle>,
    pub surface_area: f64,
    pub signed_volume: f64,
    pub center_of_mass: Option<Vec3>,
    record: Rc<MeshAnalysisRecord>,
    /// One shared name per primitive for every row that cites it.
    names: Vec<Rc<str>>,
    duplicate_faces: OnceCell<Rc<Vec<DuplicateFace>>>,
}

impl MeshQuality {
    pub fn duplicate_faces(&self) -> Rc<Vec<DuplicateFace>> {
        Rc::clone(
            self.duplicate_faces
                .get_or_init(|| Rc::new(duplicate_faces(&self.record, &self.names))),
        )
    }

    /// Per-triangle rows in source order, for `analyzeMesh` output only.
    // ponytail: streamed rather than cached; no claim reads a row twice.
    pub fn triangles(&self) -> impl Iterator<Item = MeshTriangle> + '_ {
        let record = &self.record;
        record
            .triangles
            .iter()
            .zip(&record.triangle_primitives)
            .enumerate()
            .map(|(index, (&indices, &primitive))| {
                let [a, b, c] = indices.map(|vertex| record.positions[vertex as usize]);
                MeshTriangle {
                    primitive: Rc::clone(&self.names[primitive as usize]),
                    triangle_index: index as u32,
                    a,
                    b,
                    c,
                    center: triangle_center(a, b, c),
                    area: triangle_area(a, b, c),
                }
            })
    }

    /// The centre a triangle's row reports.
    pub fn triangle_center(&self, index: u32) -> Option<Vec3> {
        let indices = *self.record.triangles.get(index as usize)?;
        let [a, b, c] = indices.map(|vertex| self.record.positions[vertex as usize]);
        Some(triangle_center(a, b, c))
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
    /// The first connected-component result a prepared batch accepted, by
    /// normalized tolerance bits; later plans on this subject reuse it.
    // ponytail: one tolerance per subject bounds retention to one result; key a
    // byte-bounded map by tolerance if specs alternate tolerances.
    components: OnceCell<(u64, Rc<ConnectedComponents>)>,
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

    /// Sorted clusters, before their C(C-1)/2 pairwise gaps exist.
    pub(crate) fn component_clusters(&self, tolerance_mm: f64) -> Vec<ClusterReport> {
        component_clusters(self, self.pieces(), tolerance_mm)
    }

    #[cfg(test)]
    pub fn connected_components(&self, tolerance_mm: f64) -> ConnectedComponents {
        ConnectedComponents::from_clusters(self.component_clusters(tolerance_mm))
    }

    /// A result an earlier plan accepted for these tolerance bits.
    pub(crate) fn retained_components(
        &self,
        tolerance_bits: u64,
    ) -> Option<Rc<ConnectedComponents>> {
        self.components
            .get()
            .filter(|(bits, _)| *bits == tolerance_bits)
            .map(|(_, value)| Rc::clone(value))
    }

    /// Retains an accepted result; refusals never reach here (policy §16).
    pub(crate) fn retain_components(&self, tolerance_bits: u64, value: &Rc<ConnectedComponents>) {
        let _ = self.components.set((tolerance_bits, Rc::clone(value)));
    }
}

impl ConnectedComponents {
    pub(crate) fn from_clusters(clusters: Vec<ClusterReport>) -> Self {
        Self {
            count: clusters.len() as u32,
            gaps: cluster_gaps(&clusters),
            clusters,
        }
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

/// One epsilon cell per axis. The floor's bits (zero normalized) identify a
/// finite cell; every NaN floor shares one NaN pattern and each infinity keeps
/// its own, none of which a finite floor can have.
fn cell(value: f64) -> u64 {
    let value = (value / SPATIAL_EPSILON).floor();
    if value.is_nan() {
        f64::NAN.to_bits()
    } else if value == 0.0 {
        0
    } else {
        value.to_bits()
    }
}

/// Non-finite cells are their own neighbours.
fn offset_cell(cell: u64, offset: i32) -> u64 {
    let value = f64::from_bits(cell);
    if !value.is_finite() {
        return cell;
    }
    let value = value + f64::from(offset);
    if value == 0.0 {
        0
    } else {
        value.to_bits()
    }
}

#[derive(Clone, Copy, Eq, PartialEq)]
struct CellKey<const N: usize>([u64; N]);

impl<const N: usize> Hash for CellKey<N> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        for cell in self.0 {
            state.write_u64(cell);
        }
    }
}

fn weld(positions: &[Vec3]) -> Vec<u32> {
    let mut canonical = Vec::with_capacity(positions.len());
    let mut representatives: FastMap<CellKey<3>, u32> = FastMap::default();
    // Exactly the (x, y) projections of the keys above, which are only ever
    // added. An absent column skips three probes that could only miss.
    let mut columns: FastSet<CellKey<2>> = FastSet::default();
    for (index, &[x, y, z]) in positions.iter().enumerate() {
        let cells = [cell(x), cell(y), cell(z)];
        // The 27 neighbour keys, probed in their original first-match order.
        let [xs, ys, zs] = cells.map(|cell| [-1, 0, 1].map(|offset| offset_cell(cell, offset)));
        let mut representative = None;
        'neighbours: for cx in xs {
            for cy in ys {
                if !columns.contains(&CellKey([cx, cy])) {
                    continue;
                }
                for cz in zs {
                    if let Some(&candidate) = representatives.get(&CellKey([cx, cy, cz])) {
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
            representatives.insert(CellKey(cells), representative);
            columns.insert(CellKey([cells[0], cells[1]]));
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

fn triangle_center(a: Vec3, b: Vec3, c: Vec3) -> Vec3 {
    std::array::from_fn(|axis| (a[axis] + b[axis] + c[axis]) / 3.0)
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
    let names: Vec<Rc<str>> = record
        .primitives
        .iter()
        .map(|primitive| Rc::from(primitive.name.as_str()))
        .collect();
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
        let primitive = &names[primitive_index as usize];
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
                    primitive: Rc::clone(primitive),
                    vertex_index: (index * 3 + corner) as u32,
                    position,
                });
            }
        }
        if area == 0.0 {
            degenerate_triangles.push(DegenerateTriangle {
                primitive: Rc::clone(primitive),
                triangle_index: index as u32,
                area: 0.0,
                center: triangle_center(a, b, c),
            });
        }
    }

    MeshQuality {
        triangle_count: record.triangles.len() as u32,
        non_finite_vertices,
        degenerate_triangles,
        surface_area,
        signed_volume,
        center_of_mass: (signed_volume.is_finite() && signed_volume != 0.0)
            .then(|| centroid.map(|value| value / signed_volume)),
        record,
        names,
        duplicate_faces: OnceCell::new(),
    }
}

fn duplicate_faces(record: &MeshAnalysisRecord, names: &[Rc<str>]) -> Vec<DuplicateFace> {
    let mut canonical = Vec::with_capacity(record.positions.len());
    let mut positions = FastMap::default();
    for (index, &point) in record.positions.iter().enumerate() {
        let key = position_key(point);
        let representative = *positions.entry(key).or_insert(index as u32);
        canonical.push(representative);
    }
    let mut seen = FastMap::default();
    let mut duplicate_faces = Vec::new();
    for (index, (&indices, &primitive)) in record
        .triangles
        .iter()
        .zip(&record.triangle_primitives)
        .enumerate()
    {
        let mut corners = indices.map(|vertex| canonical[vertex as usize]);
        corners.sort_unstable();
        match seen.entry((primitive, corners)) {
            Entry::Occupied(first) => duplicate_faces.push(DuplicateFace {
                primitive: Rc::clone(&names[primitive as usize]),
                triangle_index: index as u32,
                first_triangle_index: *first.get(),
            }),
            Entry::Vacant(slot) => {
                slot.insert(index as u32);
            }
        }
    }

    duplicate_faces
}

#[derive(Clone, Debug)]
struct Edge {
    from: u32,
    to: u32,
    incident_triangle_count: u32,
    /// The creating triangle's primitive, then later distinct ones in order.
    primitive: u32,
    later_primitives: Vec<u32>,
}

impl Edge {
    fn primitives(&self) -> impl Iterator<Item = u32> + '_ {
        std::iter::once(self.primitive).chain(self.later_primitives.iter().copied())
    }
}

fn edges(record: &MeshAnalysisRecord, canonical: &[u32]) -> Vec<Edge> {
    // Primitives group by base label content; equal labels share one id.
    let mut labels: FastMap<&str, u32> = FastMap::default();
    let components: Vec<u32> = record
        .primitives
        .iter()
        .map(|primitive| {
            let next = labels.len() as u32;
            *labels
                .entry(base_component_label(&primitive.name))
                .or_insert(next)
        })
        .collect();
    let mut keys: FastMap<(u32, u32, u32), usize> = FastMap::default();
    let mut edges: Vec<Edge> = Vec::new();
    for (&indices, &primitive) in record.triangles.iter().zip(&record.triangle_primitives) {
        let corners = indices.map(|vertex| canonical[vertex as usize]);
        if corners[0] == corners[1] || corners[1] == corners[2] || corners[0] == corners[2] {
            continue;
        }
        for corner in 0..3 {
            let from = corners[corner];
            let to = corners[(corner + 1) % 3];
            let (from, to) = if from < to { (from, to) } else { (to, from) };
            match keys.entry((components[primitive as usize], from, to)) {
                Entry::Occupied(entry) => {
                    let edge = &mut edges[*entry.get()];
                    edge.incident_triangle_count += 1;
                    if edge.primitive != primitive && !edge.later_primitives.contains(&primitive) {
                        edge.later_primitives.push(primitive);
                    }
                }
                Entry::Vacant(entry) => {
                    entry.insert(edges.len());
                    edges.push(Edge {
                        from,
                        to,
                        incident_triangle_count: 1,
                        primitive,
                        later_primitives: Vec::new(),
                    });
                }
            }
        }
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
    let mut owner = FastMap::default();
    for (local_index, &edge_index) in selected.iter().enumerate() {
        let edge = &edges[edge_index];
        for endpoint in [edge.from, edge.to] {
            match owner.entry(endpoint) {
                Entry::Occupied(existing) => {
                    let left = find(&mut parent, *existing.get());
                    let right = find(&mut parent, local_index);
                    if left != right {
                        parent[left] = right;
                    }
                }
                Entry::Vacant(slot) => {
                    slot.insert(local_index);
                }
            }
        }
    }
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut group_indices = FastMap::default();
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
                    let mut primitives: Vec<_> = edge.primitives().collect();
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
    // One pass over `open`: each primitive still sums its own edges in `open`
    // order, once per edge, because an edge lists a primitive at most once.
    let mut boundaries = vec![(0_usize, [0.0; 3]); record.primitives.len()];
    for &edge_index in &open {
        let edge = &edges[edge_index];
        let start = record.positions[edge.from as usize];
        let end = record.positions[edge.to as usize];
        for primitive in edge.primitives() {
            let (count, sum) = &mut boundaries[primitive as usize];
            *count += 1;
            for axis in 0..3 {
                sum[axis] += (start[axis] + end[axis]) / 2.0;
            }
        }
    }
    let per_primitive: Vec<_> = record
        .primitives
        .iter()
        .zip(boundaries)
        .map(|(primitive, (count, sum))| {
            let denominator = count.max(1) as f64;
            WatertightPrimitiveBreakdown {
                name: primitive.name.clone(),
                boundary_edges: count as u32,
                loop_centroid: sum.map(|value| value / denominator),
            }
        })
        .collect();
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
    const UNSET: usize = usize::MAX;
    let mut parent: Vec<usize> = (0..record.triangles.len()).collect();
    // Canonical vertices and union roots are dense indices, so flat tables
    // replace the probing maps.
    let mut owner = vec![UNSET; record.positions.len()];
    for (triangle_index, triangle) in record.triangles.iter().enumerate() {
        for &vertex in triangle {
            let existing = &mut owner[canonical[vertex as usize] as usize];
            if *existing == UNSET {
                *existing = triangle_index;
            } else {
                let left = find(&mut parent, *existing);
                let right = find(&mut parent, triangle_index);
                if left != right {
                    parent[left] = right;
                }
            }
        }
    }
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut group_indices = vec![UNSET; record.triangles.len()];
    for triangle_index in 0..record.triangles.len() {
        let group_index = &mut group_indices[find(&mut parent, triangle_index)];
        if *group_index == UNSET {
            *group_index = groups.len();
            groups.push(Vec::new());
        }
        groups[*group_index].push(triangle_index);
    }
    groups
        .into_iter()
        .map(|members| {
            let mut aabb = empty_aabb();
            let mut primitive_vertices: Vec<(u32, u32)> = Vec::new();
            let mut primitive_indices = FastMap::default();
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

fn cluster_gaps(clusters: &[ClusterReport]) -> Vec<ClusterGap> {
    // Cluster AABBs cover referenced triangles; primitive AABBs can also include
    // unused vertices, so bounds for this search must come from primitives.
    let bounds: Vec<_> = clusters
        .iter()
        .map(|cluster| {
            let mut aabb = empty_aabb();
            for primitive in &cluster.primitives {
                expand(&mut aabb, primitive.aabb.min);
                expand(&mut aabb, primitive.aabb.max);
            }
            aabb
        })
        .collect();
    let mut gaps = Vec::new();
    for left in 0..clusters.len() {
        for right in left + 1..clusters.len() {
            let from = &clusters[left];
            let to = &clusters[right];
            let mut best: Option<ClusterGap> = None;
            for from_primitive in &from.primitives {
                // Every target box lies inside bounds[right]. A later pair can
                // replace the first minimum only with a strictly smaller gap.
                if best.as_ref().is_some_and(|current| {
                    dominant_gap(from_primitive.aabb, bounds[right]).1 >= current.gap_mm
                }) {
                    continue;
                }
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
    gaps
}

fn component_clusters(
    analysis: &MeshAnalysis,
    pieces: &[Piece],
    tolerance_mm: f64,
) -> Vec<ClusterReport> {
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
    clusters
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

/// Every caller passes a record validated at decode (GLB/glTF) or built valid
/// by the engine (GSM1, STEP report soup, interference components), so the
/// check is not repeated here.
pub fn analyze(record: &Rc<MeshAnalysisRecord>) -> Result<MeshAnalysis, BackendError> {
    debug_assert_eq!(record.validate(), Ok(()));
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
        components: OnceCell::new(),
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
    fn cluster_gap_pruning_matches_nested_pair_search() {
        let boxes = [
            [(0.0, 1.0), (-30.0, -29.0), (0.0, 1.0), (30.0, 31.0)],
            [(4.0, 5.0), (40.0, 41.0), (0.5, 1.5), (4.0, 5.0)],
            [(1.0, 2.0), (-20.0, -19.0), (1.0, 2.0), (20.0, 21.0)],
            [(0.0, 1.0), (10.0, 11.0), (-0.0, 1.0), (50.0, 51.0)],
            [(8.0, 9.0), (-40.0, -39.0), (8.0, 9.0), (60.0, 61.0)],
        ];
        let labels = ["Z", "a", "😀", "A", "á"];
        let clusters: Vec<_> = boxes
            .into_iter()
            .enumerate()
            .map(|(index, boxes)| ClusterReport {
                label: labels[index].into(),
                primitives: boxes
                    .into_iter()
                    .enumerate()
                    .map(|(part, (min, max))| PrimitiveRecord {
                        name: format!("{}#{part}", labels[index]),
                        color: None,
                        vertices: 3,
                        aabb: Aabb {
                            min: [min, 0.0, 0.0],
                            max: [max, 1.0, 1.0],
                        },
                    })
                    .collect(),
                // Referenced-triangle bounds need not include every primitive vertex.
                aabb: Aabb {
                    min: [0.0; 3],
                    max: [0.0; 3],
                },
                centroid: [0.0; 3],
                total_vertices: 12,
            })
            .collect();
        let mut old = Vec::new();
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
                old.push(best.unwrap());
            }
        }
        old.sort_by(|left, right| {
            partial_cmp(left.gap_mm, right.gap_mm)
                .then_with(|| compare_utf16(&left.from_label, &right.from_label))
                .then_with(|| compare_utf16(&left.to_label, &right.to_label))
        });
        let actual = cluster_gaps(&clusters);
        assert_eq!(actual.len(), 10);
        assert_eq!(actual, old);
        for (actual, old) in actual.iter().zip(&old) {
            assert_eq!(actual.gap_mm.to_bits(), old.gap_mm.to_bits());
        }
        assert!(actual.iter().any(|gap| gap.gap_mm < 0.0));
        assert!(actual.iter().any(|gap| gap.gap_mm == 0.0));
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
    fn groups_edges_across_primitives_with_the_same_base_label() {
        let record = MeshAnalysisRecord {
            positions: vec![
                [0.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, -1.0, 0.0],
            ],
            triangles: vec![[0, 1, 2], [4, 3, 5]],
            triangle_primitives: vec![0, 1],
            primitives: vec![
                Primitive {
                    name: "fin#0".into(),
                    vertex_start: 0,
                    vertex_count: 3,
                },
                Primitive {
                    name: "fin#1".into(),
                    vertex_start: 3,
                    vertex_count: 3,
                },
            ],
        };
        let canonical = weld(&record.positions);
        let actual: Vec<_> = edges(&record, &canonical)
            .into_iter()
            .map(|edge| {
                (
                    edge.from,
                    edge.to,
                    edge.incident_triangle_count,
                    edge.primitives().collect::<Vec<_>>(),
                )
            })
            .collect();
        assert_eq!(
            actual,
            [
                (0, 1, 2, vec![0, 1]),
                (1, 2, 1, vec![0]),
                (0, 2, 1, vec![0]),
                (0, 5, 1, vec![1]),
                (1, 5, 1, vec![1])
            ]
        );

        let measured = watertight(&record, &canonical);
        assert!(!measured.watertight);
        assert_eq!(
            (
                measured.total_edges,
                measured.irregular_edges,
                measured.open_boundary_edges,
                measured.non_manifold_edges
            ),
            (5, 4, 4, 0)
        );
        assert_eq!(measured.irregular_edge_fraction, 4.0 / 5.0);
        assert_eq!(
            measured.per_primitive,
            vec![
                WatertightPrimitiveBreakdown {
                    name: "fin#0".into(),
                    boundary_edges: 2,
                    loop_centroid: [0.25, 0.5, 0.0]
                },
                WatertightPrimitiveBreakdown {
                    name: "fin#1".into(),
                    boundary_edges: 2,
                    loop_centroid: [0.25, -0.5, 0.0]
                },
            ]
        );
        assert_eq!(measured.irregular_edge_clusters.len(), 1);
        let cluster = &measured.irregular_edge_clusters[0];
        assert_eq!(cluster.kind, IrregularEdgeKind::OpenBoundary);
        assert_eq!(cluster.edge_count, 4);
        assert_eq!(
            cluster.aabb,
            Aabb {
                min: [0.0, -1.0, 0.0],
                max: [1.0, 1.0, 0.0]
            }
        );
        let samples: Vec<_> = cluster
            .samples
            .iter()
            .map(|sample| {
                (
                    sample.start,
                    sample.end,
                    sample.incident_triangle_count,
                    sample.primitives.clone(),
                )
            })
            .collect();
        assert_eq!(
            samples,
            [
                ([0.0, 0.0, 0.0], [0.0, 1.0, 0.0], 1, vec!["fin#0".into()]),
                ([0.0, 0.0, 0.0], [0.0, -1.0, 0.0], 1, vec!["fin#1".into()]),
                ([1.0, 0.0, 0.0], [0.0, 1.0, 0.0], 1, vec!["fin#0".into()]),
                ([1.0, 0.0, 0.0], [0.0, -1.0, 0.0], 1, vec!["fin#1".into()]),
            ]
        );
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
    fn later_plans_reuse_an_accepted_component_result_under_their_own_limits() {
        use crate::{analysis::batch::BatchAnalysis, backend::AnalysisRetentionLimits};
        let mut record = box_record(0.0);
        let right = box_record(2.0);
        record.positions.extend(right.positions);
        record.triangles.extend(
            right
                .triangles
                .into_iter()
                .map(|triangle| triangle.map(|index| index + 8)),
        );
        record.triangle_primitives.extend(vec![1; 12]);
        record.primitives.push(Primitive {
            name: "right#0".into(),
            vertex_start: 8,
            vertex_count: 8,
        });
        let analysis = analyze(&Rc::new(record)).unwrap();
        let plan = |tolerance: f64, max_mesh_bytes| {
            let limits = AnalysisRetentionLimits {
                max_mesh_bytes,
                max_mesh_entries: 1,
                max_solid_entries: 0,
            };
            BatchAnalysis::new([("s".to_owned(), tolerance.to_bits())], limits).unwrap()
        };

        let first = plan(0.0, u64::MAX)
            .connected_components("s", 0.0, &analysis)
            .unwrap();
        let second = plan(-0.0, u64::MAX)
            .connected_components("s", -0.0, &analysis)
            .unwrap();
        assert_eq!(first.count, 2);
        assert!(
            Rc::ptr_eq(&first, &second),
            "a second plan must not rebuild"
        );

        // A plan whose limit the retained result exceeds still refuses it.
        let refusal = plan(0.0, 1)
            .connected_components("s", 0.0, &analysis)
            .unwrap_err();
        assert_eq!(
            refusal.message,
            "Connected-component results exceed the declared analysis retention byte limit."
        );

        // Another tolerance is built, not served from the retained result.
        let joined = plan(1.0, u64::MAX)
            .connected_components("s", 1.0, &analysis)
            .unwrap();
        assert_eq!(joined.count, 1);
        assert!(Rc::ptr_eq(
            &analysis.retained_components(0).unwrap(),
            &first
        ));
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
