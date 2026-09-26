//! The pre-C4 mesh analysis, kept verbatim as a test oracle. SipHash maps,
//! per-cell probes and per-primitive rescans define the exact results that the
//! optimized producer must reproduce bit for bit.

use std::{cell::OnceCell, collections::HashMap, fmt::Write as _, rc::Rc};

use super::{
    analyze, base_component_label, center, empty_aabb, expand, find, finite_aabb, partial_cmp,
    position_key, triangle_area, Aabb, DegenerateTriangle, DuplicateFace, IrregularEdgeCluster,
    IrregularEdgeKind, IrregularEdgeKindCounts, IrregularEdgeSample, MeshAnalysisRecord,
    MeshQuality, MeshTriangle, NonFiniteVertex, Piece, Primitive, Vec3, Watertight,
    WatertightPrimitiveBreakdown, CLUSTER_SAMPLE_LIMIT, SPATIAL_EPSILON,
};

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

/// The reference quality and, separately, its per-triangle rows.
fn mesh_quality(record: Rc<MeshAnalysisRecord>) -> (MeshQuality, Vec<MeshTriangle>) {
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
            // Only the name's representation differs from the original String.
            primitive: record.primitives[primitive_index as usize]
                .name
                .clone()
                .into(),
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

    let quality = MeshQuality {
        triangle_count: triangles.len() as u32,
        non_finite_vertices,
        degenerate_triangles,
        surface_area,
        signed_volume,
        center_of_mass: (signed_volume.is_finite() && signed_volume != 0.0)
            .then(|| centroid.map(|value| value / signed_volume)),
        names: record
            .primitives
            .iter()
            .map(|primitive| primitive.name.as_str().into())
            .collect(),
        record,
        duplicate_faces: OnceCell::new(),
    };
    (quality, triangles)
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
    let components: Vec<_> = record
        .primitives
        .iter()
        .map(|primitive| base_component_label(&primitive.name))
        .collect();
    let mut keys: HashMap<(&str, u32, u32), usize> = HashMap::new();
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
            let key = (components[primitive as usize], from, to);
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

/// Exact comparison text: floats by bit pattern, everything else by value.
trait Bits {
    fn bits(&self, out: &mut String);
}

impl Bits for f64 {
    fn bits(&self, out: &mut String) {
        write!(out, "{:x},", self.to_bits()).unwrap();
    }
}

macro_rules! debug_bits {
    ($($ty:ty),*) => {$(
        impl Bits for $ty {
            fn bits(&self, out: &mut String) {
                write!(out, "{self:?},").unwrap();
            }
        }
    )*};
}

debug_bits!(
    bool,
    u32,
    String,
    Rc<str>,
    IrregularEdgeKind,
    IrregularEdgeKindCounts
);

impl<T: Bits> Bits for [T] {
    fn bits(&self, out: &mut String) {
        out.push('[');
        for item in self {
            item.bits(out);
        }
        out.push(']');
    }
}

impl<T: Bits> Bits for Vec<T> {
    fn bits(&self, out: &mut String) {
        self.as_slice().bits(out);
    }
}

impl<T: Bits, const N: usize> Bits for [T; N] {
    fn bits(&self, out: &mut String) {
        self.as_slice().bits(out);
    }
}

impl<T: Bits> Bits for Option<T> {
    fn bits(&self, out: &mut String) {
        match self {
            Some(value) => value.bits(out),
            None => out.push_str("None,"),
        }
    }
}

impl<A: Bits, B: Bits> Bits for (A, B) {
    fn bits(&self, out: &mut String) {
        self.0.bits(out);
        self.1.bits(out);
    }
}

macro_rules! struct_bits {
    ($($ty:ty { $($field:ident),* })*) => {$(
        impl Bits for $ty {
            fn bits(&self, out: &mut String) {
                out.push('{');
                $(self.$field.bits(out);)*
                out.push('}');
            }
        }
    )*};
}

struct_bits! {
    Aabb { min, max }
    IrregularEdgeSample { start, end, center, incident_triangle_count, primitives, color }
    IrregularEdgeCluster { kind, edge_count, aabb, center, samples }
    WatertightPrimitiveBreakdown { name, boundary_edges, loop_centroid }
    Watertight {
        watertight, irregular_edges, open_boundary_edges, non_manifold_edges,
        irregular_edge_kind_counts, irregular_edge_clusters, total_edges,
        irregular_edge_fraction, per_primitive
    }
    MeshTriangle { primitive, triangle_index, a, b, c, center, area }
    NonFiniteVertex { primitive, vertex_index, position }
    DegenerateTriangle { primitive, triangle_index, area, center }
    DuplicateFace { primitive, triangle_index, first_triangle_index }
    MeshQuality {
        triangle_count, non_finite_vertices, degenerate_triangles, surface_area, signed_volume,
        center_of_mass
    }
    Piece { primitive_vertices, aabb, vertices }
}

fn text<T: Bits + ?Sized>(value: &T) -> String {
    let mut out = String::new();
    value.bits(&mut out);
    out
}

/// Compares every retained analysis product with the reference, bit for bit.
fn assert_matches_reference(record: MeshAnalysisRecord, label: &str) {
    record.validate().unwrap();
    let record = Rc::new(record);
    let canonical = weld(&record.positions);
    assert_eq!(super::weld(&record.positions), canonical, "{label}: weld");
    let expected: Vec<_> = edges(&record, &canonical)
        .into_iter()
        .map(|edge| {
            let key = (edge.from, edge.to, edge.incident_triangle_count);
            (key, edge.primitives)
        })
        .collect();
    let actual: Vec<_> = super::edges(&record, &canonical)
        .iter()
        .map(|edge| {
            let key = (edge.from, edge.to, edge.incident_triangle_count);
            (key, edge.primitives().collect::<Vec<_>>())
        })
        .collect();
    assert_eq!(actual, expected, "{label}: edges");

    let analysis = analyze(&record).unwrap();
    assert_eq!(
        text(&*analysis.watertight()),
        text(&watertight(&record, &canonical)),
        "{label}: watertight"
    );
    let quality = analysis.mesh_quality();
    let (expected_quality, expected_rows) = mesh_quality(Rc::clone(&record));
    assert_eq!(text(&*quality), text(&expected_quality), "{label}: quality");
    let rows: Vec<_> = quality.triangles().collect();
    assert_eq!(text(&rows), text(&expected_rows), "{label}: rows");
    for row in &expected_rows {
        assert_eq!(
            text(&quality.triangle_center(row.triangle_index)),
            text(&Some(row.center)),
            "{label}: row centre"
        );
    }
    assert_eq!(
        text(&*quality.duplicate_faces()),
        text(&duplicate_faces(&record, &expected_rows)),
        "{label}: duplicate faces"
    );
    // Pieces are the only changed input of the unchanged component analysis.
    assert_eq!(
        text(&**analysis.pieces()),
        text(&sub_meshes(&record, &canonical)),
        "{label}: pieces"
    );
}

/// SplitMix64: a fixed, dependency-free source for reproducible corpora.
struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.0;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }

    fn below(&mut self, bound: usize) -> usize {
        (self.next() % bound as u64) as usize
    }

    fn pick<T: Copy>(&mut self, values: &[T]) -> T {
        values[self.below(values.len())]
    }
}

// 3e12 and its next float share a cell without welding, which exercises cell
// overwrites; near 2^53 cells, adding one can round back to the same cell.
const ANCHORS: [f64; 7] = [0.0, 1.0, -2.5, 37.125, 3e12, 90_071_992_547.409_92, 1e-7];
const NUDGES: [f64; 14] = [
    0.0,
    0.0,
    -0.0,
    3e-6,
    -6e-6,
    9.999_999e-6,
    1e-5,
    -1e-5,
    1.000_000_1e-5,
    1.5e-5,
    -2e-5,
    4.882_812_5e-4,
    1e-12,
    1.0,
];
const SPECIAL: [f64; 6] = [
    f64::NAN,
    f64::INFINITY,
    f64::NEG_INFINITY,
    1e300,
    -1e-300,
    5e-324,
];
const NAMES: [&str; 9] = [
    "part#0", "part#1", "part#12", "other", "other#x", "", "#3", "a#b#2", "😀#1",
];

fn coordinate(random: &mut Random, anchor: f64) -> f64 {
    match random.below(40) {
        0 => random.pick(&SPECIAL),
        1..=4 => random.below(2_000) as f64 * SPATIAL_EPSILON,
        _ => anchor + random.pick(&NUDGES) + random.below(3) as f64,
    }
}

fn random_record(
    random: &mut Random,
    max_vertices: usize,
    max_triangles: usize,
) -> MeshAnalysisRecord {
    let vertex_count = random.below(max_vertices + 1);
    let anchors: [f64; 3] = std::array::from_fn(|_| random.pick(&ANCHORS));
    let mut positions: Vec<Vec3> = Vec::with_capacity(vertex_count);
    for index in 0..vertex_count {
        let point = match (index > 0).then(|| random.below(10)) {
            Some(0..=3) => positions[random.below(index)],
            Some(4..=6) => {
                let mut point = positions[random.below(index)];
                point[random.below(3)] += random.pick(&NUDGES);
                point
            }
            _ => std::array::from_fn(|axis| coordinate(random, anchors[axis])),
        };
        positions.push(point);
    }
    let primitive_count = if vertex_count == 0 {
        random.below(2)
    } else {
        1 + random.below(5)
    };
    let primitives = (0..primitive_count)
        .map(|_| {
            let start = random.below(vertex_count + 1);
            Primitive {
                name: random.pick(&NAMES).into(),
                vertex_start: start as u32,
                vertex_count: random.below(vertex_count - start + 1) as u32,
            }
        })
        .collect();
    let mut triangles: Vec<[u32; 3]> = Vec::new();
    let mut triangle_primitives = Vec::new();
    if vertex_count > 0 && primitive_count > 0 {
        // A small index pool yields shared, open, non-manifold and repeated
        // corners; copies yield duplicate and reversed faces.
        let pool = 1 + random.below(vertex_count);
        for _ in 0..random.below(max_triangles + 1) {
            let triangle = if !triangles.is_empty() && random.below(8) == 0 {
                let mut copy = triangles[random.below(triangles.len())];
                copy.rotate_left(random.below(3));
                if random.below(2) == 0 {
                    copy.swap(0, 1);
                }
                copy
            } else {
                std::array::from_fn(|_| random.below(pool) as u32)
            };
            triangles.push(triangle);
            triangle_primitives.push(random.below(primitive_count) as u32);
        }
    }
    MeshAnalysisRecord {
        positions,
        triangles,
        triangle_primitives,
        primitives,
    }
}

/// A report-style soup: a closed n-by-n-per-face box surface with three
/// positions per triangle, some nudged across epsilon.
fn soup(random: &mut Random, n: usize, offset: f64) -> MeshAnalysisRecord {
    let mut positions = Vec::new();
    let grid = |u: usize, v: usize, face: usize| -> Vec3 {
        let (u, v) = (u as f64 / n as f64, v as f64 / n as f64);
        let point = match face {
            0 => [u, v, 0.0],
            1 => [v, u, 1.0],
            2 => [v, 0.0, u],
            3 => [u, 1.0, v],
            4 => [0.0, u, v],
            _ => [1.0, v, u],
        };
        point.map(|value| value * 3.0 + offset)
    };
    for face in 0..6 {
        for u in 0..n {
            for v in 0..n {
                let corners = [
                    grid(u, v, face),
                    grid(u + 1, v, face),
                    grid(u + 1, v + 1, face),
                    grid(u, v + 1, face),
                ];
                for [a, b, c] in [[0, 1, 2], [0, 2, 3]] {
                    for corner in [a, b, c] {
                        let mut point = corners[corner];
                        if random.below(10) == 0 {
                            point[random.below(3)] += random.pick(&NUDGES);
                        }
                        positions.push(point);
                    }
                }
            }
        }
    }
    let count = positions.len() / 3;
    MeshAnalysisRecord {
        triangles: (0..count as u32)
            .map(|triangle| [3 * triangle, 3 * triangle + 1, 3 * triangle + 2])
            .collect(),
        triangle_primitives: vec![0; count],
        primitives: vec![Primitive {
            name: "subject#0".into(),
            vertex_start: 0,
            vertex_count: positions.len() as u32,
        }],
        positions,
    }
}

fn record(
    positions: Vec<Vec3>,
    triangles: Vec<([u32; 3], u32)>,
    primitives: &[(&str, u32, u32)],
) -> MeshAnalysisRecord {
    MeshAnalysisRecord {
        positions,
        triangle_primitives: triangles.iter().map(|&(_, primitive)| primitive).collect(),
        triangles: triangles
            .into_iter()
            .map(|(triangle, _)| triangle)
            .collect(),
        primitives: primitives
            .iter()
            .map(|&(name, vertex_start, vertex_count)| Primitive {
                name: name.into(),
                vertex_start,
                vertex_count,
            })
            .collect(),
    }
}

#[test]
fn crafted_meshes_match_the_reference() {
    let fan = vec![
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, -1.0, 0.0],
        [0.0, 0.0, 1.0],
        [0.000_004, 1.0, 0.0],
        [f64::NAN, 0.0, 0.0],
        [f64::INFINITY, 1.0, 0.0],
        [2.0, 0.0, 0.0],
    ];
    let cases = [
        ("empty", record(Vec::new(), Vec::new(), &[])),
        (
            "empty primitive",
            record(Vec::new(), Vec::new(), &[("x#0", 0, 0)]),
        ),
        (
            "unused vertices",
            record(fan.clone(), Vec::new(), &[("x#0", 0, 9)]),
        ),
        (
            // One edge in three triangles, across equal and distinct labels,
            // plus a welded twin vertex and a reversed duplicate face.
            "shared open non-manifold",
            record(
                fan.clone(),
                vec![
                    ([0, 1, 2], 0),
                    ([1, 0, 3], 1),
                    ([0, 1, 4], 2),
                    ([1, 0, 5], 0),
                    ([2, 1, 0], 0),
                    ([4, 2, 0], 3),
                ],
                &[
                    ("fin#0", 0, 3),
                    ("fin#1", 3, 2),
                    ("rib#0", 0, 9),
                    ("", 2, 3),
                ],
            ),
        ),
        (
            "degenerate and non-finite",
            record(
                fan,
                vec![
                    ([0, 0, 1], 0),
                    ([0, 1, 8], 0),
                    ([6, 1, 2], 1),
                    ([7, 1, 2], 1),
                    ([6, 7, 0], 0),
                    ([2, 5, 1], 1),
                ],
                &[("a#0", 0, 9), ("a#x", 4, 5)],
            ),
        ),
    ];
    for (label, case) in cases {
        assert_matches_reference(case, label);
    }
}

#[test]
fn seeded_random_meshes_match_the_reference() {
    let mut random = Random(0x6765_6f73_7065_6334);
    for case in 0..3_000 {
        assert_matches_reference(random_record(&mut random, 48, 64), &format!("case {case}"));
    }
    for case in 0..12 {
        let record = random_record(&mut random, 4_000, 6_000);
        assert_matches_reference(record, &format!("large case {case}"));
    }
    for (case, offset) in [0.0, -1.5, 3e12, 90_071_992_547.409_92]
        .into_iter()
        .enumerate()
    {
        let record = soup(&mut random, 12, offset);
        assert_matches_reference(record, &format!("soup {case}"));
    }
}
