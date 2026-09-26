//! GLB/glTF flattening with caller-owned resource closure and no host I/O.

use std::{borrow::Cow, collections::HashSet, error::Error, fmt};

use gltf::{
    buffer::Source,
    mesh::{Mode, Semantic},
};

use crate::backend::resources::ResourceBundle;

use super::{MeshAnalysisRecord, Primitive};

#[derive(Clone, Debug, PartialEq)]
pub struct DecodedMesh {
    pub record: MeshAnalysisRecord,
    pub consumed_resources: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MeshDecodeErrorKind {
    InvalidDocument,
    MissingResource,
    InvalidResource,
    LimitExceeded,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MeshDecodeError {
    pub kind: MeshDecodeErrorKind,
    pub message: String,
}

impl MeshDecodeError {
    fn new(kind: MeshDecodeErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl fmt::Display for MeshDecodeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for MeshDecodeError {}

struct ParsedGltf<'a> {
    document: gltf::Document,
    blob: Option<Cow<'a, [u8]>>,
}

enum BufferBytes<'a> {
    Borrowed(&'a [u8]),
    Owned(Vec<u8>),
}

impl BufferBytes<'_> {
    fn as_slice(&self) -> &[u8] {
        match self {
            Self::Borrowed(bytes) => bytes,
            Self::Owned(bytes) => bytes,
        }
    }
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn percent_decode(value: &str) -> Result<Vec<u8>, MeshDecodeError> {
    let input = value.as_bytes();
    let mut output = Vec::with_capacity(input.len());
    let mut index = 0;
    while index < input.len() {
        if input[index] != b'%' {
            output.push(input[index]);
            index += 1;
            continue;
        }
        if index + 2 >= input.len() {
            return Err(MeshDecodeError::new(
                MeshDecodeErrorKind::InvalidResource,
                "A data URI contains an incomplete percent escape.",
            ));
        }
        let (Some(high), Some(low)) = (hex(input[index + 1]), hex(input[index + 2])) else {
            return Err(MeshDecodeError::new(
                MeshDecodeErrorKind::InvalidResource,
                "A data URI contains an invalid percent escape.",
            ));
        };
        output.push(high << 4 | low);
        index += 3;
    }
    Ok(output)
}

fn base64_value(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

fn base64_decode(value: &str) -> Result<Vec<u8>, MeshDecodeError> {
    let input = value.as_bytes();
    if input.len() % 4 != 0 {
        return Err(MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidResource,
            "A base64 data URI has invalid padding.",
        ));
    }
    let mut output = Vec::with_capacity(input.len() / 4 * 3);
    for (block_index, block) in input.chunks_exact(4).enumerate() {
        let final_block = block_index + 1 == input.len() / 4;
        let padding = usize::from(block[3] == b'=') + usize::from(block[2] == b'=');
        if (padding > 0 && !final_block) || (padding == 1 && block[2] == b'=') {
            return Err(MeshDecodeError::new(
                MeshDecodeErrorKind::InvalidResource,
                "A base64 data URI has misplaced padding.",
            ));
        }
        let values = [
            base64_value(block[0]),
            base64_value(block[1]),
            if block[2] == b'=' {
                Some(0)
            } else {
                base64_value(block[2])
            },
            if block[3] == b'=' {
                Some(0)
            } else {
                base64_value(block[3])
            },
        ];
        let [Some(a), Some(b), Some(c), Some(d)] = values else {
            return Err(MeshDecodeError::new(
                MeshDecodeErrorKind::InvalidResource,
                "A base64 data URI contains an invalid character.",
            ));
        };
        let bits = (u32::from(a) << 18) | (u32::from(b) << 12) | (u32::from(c) << 6) | u32::from(d);
        output.push((bits >> 16) as u8);
        if padding < 2 {
            output.push((bits >> 8) as u8);
        }
        if padding == 0 {
            output.push(bits as u8);
        }
    }
    Ok(output)
}

fn data_uri(uri: &str) -> Result<Option<Vec<u8>>, MeshDecodeError> {
    let Some(value) = uri.strip_prefix("data:") else {
        return Ok(None);
    };
    let Some((metadata, payload)) = value.split_once(',') else {
        return Err(MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidResource,
            "A data URI has no payload separator.",
        ));
    };
    if metadata.split(';').any(|part| part == "base64") {
        base64_decode(payload).map(Some)
    } else {
        percent_decode(payload).map(Some)
    }
}

fn resolve_buffers<'a>(
    gltf: &'a ParsedGltf<'_>,
    resources: &'a ResourceBundle,
) -> Result<(Vec<BufferBytes<'a>>, Vec<String>), MeshDecodeError> {
    let mut buffers = Vec::new();
    let mut consumed_resources = Vec::new();
    let mut consumed = HashSet::new();
    for buffer in gltf.document.buffers() {
        let bytes = match buffer.source() {
            Source::Bin => BufferBytes::Borrowed(gltf.blob.as_deref().ok_or_else(|| {
                MeshDecodeError::new(
                    MeshDecodeErrorKind::MissingResource,
                    format!(
                        "Buffer {} requires a missing GLB BIN chunk.",
                        buffer.index()
                    ),
                )
            })?),
            Source::Uri(uri) => match data_uri(uri)? {
                Some(bytes) => BufferBytes::Owned(bytes),
                None => {
                    let bytes = resources
                        .entries
                        .get(uri)
                        .map(Vec::as_slice)
                        .ok_or_else(|| {
                            MeshDecodeError::new(
                                MeshDecodeErrorKind::MissingResource,
                                format!("Caller resource bundle does not contain '{uri}'."),
                            )
                        })?;
                    if consumed.insert(uri.to_owned()) {
                        consumed_resources.push(uri.to_owned());
                    }
                    BufferBytes::Borrowed(bytes)
                }
            },
        };
        if bytes.as_slice().len() < buffer.length() {
            return Err(MeshDecodeError::new(
                MeshDecodeErrorKind::InvalidResource,
                format!(
                    "Buffer {} declares {} bytes but only {} are available.",
                    buffer.index(),
                    buffer.length(),
                    bytes.as_slice().len()
                ),
            ));
        }
        buffers.push(bytes);
    }
    Ok((buffers, consumed_resources))
}

type Matrix = [f64; 16];

fn json_numbers<const N: usize>(
    value: Option<&serde_json::Value>,
    default: [f64; N],
    label: &str,
) -> Result<[f64; N], MeshDecodeError> {
    let Some(value) = value else {
        return Ok(default);
    };
    let values = value.as_array().ok_or_else(|| {
        MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidDocument,
            format!("{label} must be a numeric array."),
        )
    })?;
    if values.len() != N {
        return Err(MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidDocument,
            format!("{label} must contain {N} numbers."),
        ));
    }
    let mut output = [0.0; N];
    for (index, value) in values.iter().enumerate() {
        output[index] = value
            .as_f64()
            .filter(|value| value.is_finite())
            .ok_or_else(|| {
                MeshDecodeError::new(
                    MeshDecodeErrorKind::InvalidDocument,
                    format!("{label} contains a non-finite number."),
                )
            })?;
    }
    Ok(output)
}

fn determinant(matrix: Matrix) -> f64 {
    let [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = matrix;
    let b0 = a00 * a11 - a01 * a10;
    let b1 = a00 * a12 - a02 * a10;
    let b2 = a01 * a12 - a02 * a11;
    let b3 = a20 * a31 - a21 * a30;
    let b4 = a20 * a32 - a22 * a30;
    let b5 = a21 * a32 - a22 * a31;
    let b6 = a00 * b5 - a01 * b4 + a02 * b3;
    let b7 = a10 * b5 - a11 * b4 + a12 * b3;
    let b8 = a20 * b2 - a21 * b1 + a22 * b0;
    let b9 = a30 * b2 - a31 * b1 + a32 * b0;
    a13 * b6 - a03 * b7 + a33 * b8 - a23 * b9
}

fn quaternion(matrix: Matrix) -> [f64; 4] {
    let scale = [
        f64::from(
            (matrix[0] * matrix[0] + matrix[1] * matrix[1] + matrix[2] * matrix[2]).sqrt() as f32,
        ),
        f64::from(
            (matrix[4] * matrix[4] + matrix[5] * matrix[5] + matrix[6] * matrix[6]).sqrt() as f32,
        ),
        f64::from(
            (matrix[8] * matrix[8] + matrix[9] * matrix[9] + matrix[10] * matrix[10]).sqrt() as f32,
        ),
    ];
    let [is1, is2, is3] = scale.map(|value| 1.0 / value);
    let (sm11, sm12, sm13) = (matrix[0] * is1, matrix[1] * is2, matrix[2] * is3);
    let (sm21, sm22, sm23) = (matrix[4] * is1, matrix[5] * is2, matrix[6] * is3);
    let (sm31, sm32, sm33) = (matrix[8] * is1, matrix[9] * is2, matrix[10] * is3);
    let trace = sm11 + sm22 + sm33;
    if trace > 0.0 {
        let s = (trace + 1.0).sqrt() * 2.0;
        [
            (sm23 - sm32) / s,
            (sm31 - sm13) / s,
            (sm12 - sm21) / s,
            0.25 * s,
        ]
    } else if sm11 > sm22 && sm11 > sm33 {
        let s = (1.0 + sm11 - sm22 - sm33).sqrt() * 2.0;
        [
            0.25 * s,
            (sm12 + sm21) / s,
            (sm31 + sm13) / s,
            (sm23 - sm32) / s,
        ]
    } else if sm22 > sm33 {
        let s = (1.0 + sm22 - sm11 - sm33).sqrt() * 2.0;
        [
            (sm12 + sm21) / s,
            0.25 * s,
            (sm23 + sm32) / s,
            (sm31 - sm13) / s,
        ]
    } else {
        let s = (1.0 + sm33 - sm11 - sm22).sqrt() * 2.0;
        [
            (sm31 + sm13) / s,
            (sm23 + sm32) / s,
            0.25 * s,
            (sm12 - sm21) / s,
        ]
    }
}

fn compose(translation: [f64; 3], rotation: [f64; 4], scale: [f64; 3]) -> Matrix {
    let [x, y, z, w] = rotation;
    let (x2, y2, z2) = (x + x, y + y, z + z);
    let (xx, xy, xz) = (x * x2, x * y2, x * z2);
    let (yy, yz, zz) = (y * y2, y * z2, z * z2);
    let (wx, wy, wz) = (w * x2, w * y2, w * z2);
    let [sx, sy, sz] = scale;
    [
        (1.0 - (yy + zz)) * sx,
        (xy + wz) * sx,
        (xz - wy) * sx,
        0.0,
        (xy - wz) * sy,
        (1.0 - (xx + zz)) * sy,
        (yz + wx) * sy,
        0.0,
        (xz + wy) * sz,
        (yz - wx) * sz,
        (1.0 - (xx + yy)) * sz,
        0.0,
        translation[0],
        translation[1],
        translation[2],
        1.0,
    ]
}

fn recompose(matrix: Matrix) -> Matrix {
    let mut scale = [
        (matrix[0] * matrix[0] + matrix[1] * matrix[1] + matrix[2] * matrix[2]).sqrt(),
        (matrix[4] * matrix[4] + matrix[5] * matrix[5] + matrix[6] * matrix[6]).sqrt(),
        (matrix[8] * matrix[8] + matrix[9] * matrix[9] + matrix[10] * matrix[10]).sqrt(),
    ];
    if determinant(matrix) < 0.0 {
        scale[0] = -scale[0];
    }
    let mut normalized = matrix;
    for (start, divisor) in [(0, scale[0]), (4, scale[1]), (8, scale[2])] {
        normalized[start] *= 1.0 / divisor;
        normalized[start + 1] *= 1.0 / divisor;
        normalized[start + 2] *= 1.0 / divisor;
    }
    compose(
        [matrix[12], matrix[13], matrix[14]],
        quaternion(normalized),
        scale,
    )
}

fn parsed_document<'a>(
    json: &[u8],
    blob: Option<Cow<'a, [u8]>>,
) -> Result<(ParsedGltf<'a>, serde_json::Value), MeshDecodeError> {
    use serde::Deserialize;
    let invalid = |message: String| {
        MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidDocument,
            format!("Invalid glTF document: {message}"),
        )
    };
    // One lexical JSON parse. Typed glTF validation deserializes the retained
    // value, while authored transforms read its original binary64 numbers.
    let value: serde_json::Value =
        serde_json::from_slice(json).map_err(|error| invalid(error.to_string()))?;
    let root = gltf::json::Root::deserialize(&value).map_err(|error| invalid(error.to_string()))?;
    let document = gltf::Document::from_json(root).map_err(|error| invalid(error.to_string()))?;
    Ok((ParsedGltf { document, blob }, value))
}

fn authored_matrices(
    json: &serde_json::Value,
    node_count: usize,
) -> Result<Vec<Matrix>, MeshDecodeError> {
    let nodes = json
        .get("nodes")
        .and_then(serde_json::Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    if nodes.len() != node_count {
        return Err(MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidDocument,
            "Typed glTF nodes differ from the retained JSON node table.",
        ));
    }
    nodes
        .iter()
        .enumerate()
        .map(|(index, node)| {
            let node = node.as_object().ok_or_else(|| {
                MeshDecodeError::new(
                    MeshDecodeErrorKind::InvalidDocument,
                    format!("Node {index} is not an object."),
                )
            })?;
            if node.contains_key("matrix") {
                Ok(recompose(json_numbers(
                    node.get("matrix"),
                    [0.0; 16],
                    "node matrix",
                )?))
            } else {
                Ok(compose(
                    json_numbers(node.get("translation"), [0.0; 3], "node translation")?,
                    json_numbers(node.get("rotation"), [0.0, 0.0, 0.0, 1.0], "node rotation")?,
                    json_numbers(node.get("scale"), [1.0; 3], "node scale")?,
                ))
            }
        })
        .collect()
}

fn multiply(left: Matrix, right: Matrix) -> Matrix {
    let mut output = [0.0; 16];
    for column in 0..4 {
        for row in 0..4 {
            let offset = column * 4;
            output[offset + row] = right[offset] * left[row]
                + right[offset + 1] * left[4 + row]
                + right[offset + 2] * left[8 + row]
                + right[offset + 3] * left[12 + row];
        }
    }
    output
}

fn world_matrices(
    nodes: &[gltf::Node<'_>],
    local: &[Matrix],
) -> Result<Vec<Matrix>, MeshDecodeError> {
    let mut parents = vec![None; nodes.len()];
    for node in nodes {
        for child in node.children() {
            let entry = &mut parents[child.index()];
            if entry.is_some_and(|parent| parent != node.index()) {
                return Err(MeshDecodeError::new(
                    MeshDecodeErrorKind::InvalidDocument,
                    format!("Node {} has more than one parent.", child.index()),
                ));
            }
            *entry = Some(node.index());
        }
    }
    let mut world = vec![None; nodes.len()];
    for start in 0..nodes.len() {
        if world[start].is_some() {
            continue;
        }
        let mut chain = Vec::new();
        let mut seen = std::collections::HashSet::new();
        let mut current = start;
        while world[current].is_none() {
            if !seen.insert(current) {
                return Err(MeshDecodeError::new(
                    MeshDecodeErrorKind::InvalidDocument,
                    "The glTF node graph contains a cycle.",
                ));
            }
            chain.push(current);
            let Some(parent) = parents[current] else {
                break;
            };
            current = parent;
        }
        let mut matrix = world[current].unwrap_or(local[current]);
        if world[current].is_none() {
            world[current] = Some(matrix);
            let root = chain.pop().expect("the unresolved root is in its chain");
            debug_assert_eq!(root, current);
        }
        while let Some(index) = chain.pop() {
            matrix = multiply(matrix, local[index]);
            world[index] = Some(matrix);
        }
    }
    Ok(world
        .into_iter()
        .map(|matrix| matrix.expect("every node world matrix was resolved"))
        .collect())
}

fn transform(matrix: Matrix, point: [f32; 3], scale: f64) -> [f64; 3] {
    let [x, y, z] = point.map(f64::from);
    [
        (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * scale,
        (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * scale,
        (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * scale,
    ]
}

fn flatten(
    gltf: &ParsedGltf<'_>,
    json: &serde_json::Value,
    resources: &ResourceBundle,
    scale: f64,
) -> Result<DecodedMesh, MeshDecodeError> {
    if !scale.is_finite() || scale <= 0.0 {
        return Err(MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidDocument,
            "Mesh unit scale must be positive and finite.",
        ));
    }
    let (buffers, consumed_resources) = resolve_buffers(gltf, resources)?;
    let nodes: Vec<_> = gltf.document.nodes().collect();
    let local = authored_matrices(json, nodes.len())?;
    let world = world_matrices(&nodes, &local)?;
    let mut positions = Vec::new();
    let mut triangles = Vec::new();
    let mut triangle_primitives = Vec::new();
    let mut primitives = Vec::new();
    for (node_ordinal, node) in nodes.into_iter().enumerate() {
        let Some(mesh) = node.mesh() else {
            continue;
        };
        let name = node
            .name()
            .filter(|name| !name.is_empty())
            .or_else(|| mesh.name().filter(|name| !name.is_empty()))
            .map(str::to_owned)
            .unwrap_or_else(|| format!("Shape {}", node_ordinal + 1));
        let matrix = world[node.index()];
        let mut position_segments = std::collections::HashMap::new();
        for (primitive_ordinal, primitive) in mesh.primitives().enumerate() {
            if primitive.mode() != Mode::Triangles {
                continue;
            }
            let Some(attribute) = primitive.get(&Semantic::Positions) else {
                continue;
            };
            let (vertex_start, vertex_count) =
                if let Some(&segment) = position_segments.get(&attribute.index()) {
                    segment
                } else {
                    let reader = primitive
                        .reader(|buffer| buffers.get(buffer.index()).map(BufferBytes::as_slice));
                    let source = reader.read_positions().ok_or_else(|| {
                        MeshDecodeError::new(
                            MeshDecodeErrorKind::InvalidResource,
                            "A POSITION accessor could not be read from its supplied buffer.",
                        )
                    })?;
                    let vertex_start = u32::try_from(positions.len()).map_err(|_| {
                        MeshDecodeError::new(
                            MeshDecodeErrorKind::LimitExceeded,
                            "Mesh position count exceeds the retained u32 index profile.",
                        )
                    })?;
                    positions.extend(source.map(|point| transform(matrix, point, scale)));
                    let vertex_count = u32::try_from(positions.len() - vertex_start as usize)
                        .map_err(|_| {
                            MeshDecodeError::new(
                                MeshDecodeErrorKind::LimitExceeded,
                                "A POSITION accessor exceeds the retained u32 count profile.",
                            )
                        })?;
                    vertex_start.checked_add(vertex_count).ok_or_else(|| {
                        MeshDecodeError::new(
                            MeshDecodeErrorKind::LimitExceeded,
                            "Mesh position count exceeds the retained u32 index profile.",
                        )
                    })?;
                    position_segments.insert(attribute.index(), (vertex_start, vertex_count));
                    (vertex_start, vertex_count)
                };
            let primitive_index = u32::try_from(primitives.len()).map_err(|_| {
                MeshDecodeError::new(
                    MeshDecodeErrorKind::LimitExceeded,
                    "Primitive count exceeds the retained u32 index profile.",
                )
            })?;
            primitives.push(Primitive {
                name: format!("{name}#{primitive_ordinal}"),
                vertex_start,
                vertex_count,
            });
            let reader =
                primitive.reader(|buffer| buffers.get(buffer.index()).map(BufferBytes::as_slice));
            let segment = (vertex_start, vertex_count, primitive_index);
            let rows = (&mut triangles, &mut triangle_primitives);
            match reader.read_indices() {
                Some(values) => push_triangles(values.into_u32(), segment, rows),
                None => push_triangles(0..vertex_count, segment, rows),
            }?;
        }
    }
    let record = MeshAnalysisRecord {
        positions,
        triangles,
        triangle_primitives,
        primitives,
    };
    record.validate().map_err(|message| {
        MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidDocument,
            format!("Invalid flattened mesh record: {message}."),
        )
    })?;
    Ok(DecodedMesh {
        record,
        consumed_resources,
    })
}

/// Appends each complete index triple without buffering the index stream; a
/// trailing partial triple is ignored.
fn push_triangles(
    mut indices: impl Iterator<Item = u32>,
    (vertex_start, vertex_count, primitive): (u32, u32, u32),
    (triangles, triangle_primitives): (&mut Vec<[u32; 3]>, &mut Vec<u32>),
) -> Result<(), MeshDecodeError> {
    while let (Some(a), Some(b), Some(c)) = (indices.next(), indices.next(), indices.next()) {
        let triangle = [a, b, c];
        if triangle.iter().any(|&index| index >= vertex_count) {
            return Err(MeshDecodeError::new(
                MeshDecodeErrorKind::InvalidResource,
                "A primitive index is outside its POSITION accessor.",
            ));
        }
        triangles.push(triangle.map(|index| vertex_start + index));
        triangle_primitives.push(primitive);
    }
    Ok(())
}

pub fn decode_glb(
    bytes: &[u8],
    resources: &ResourceBundle,
    scale: f64,
) -> Result<DecodedMesh, MeshDecodeError> {
    if !bytes.starts_with(b"glTF") {
        return Err(MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidDocument,
            "GLB input is missing its binary glTF header.",
        ));
    }
    let container = gltf::binary::Glb::from_slice(bytes).map_err(|error| {
        MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidDocument,
            format!("Invalid GLB input: {error}"),
        )
    })?;
    let (gltf, value) = parsed_document(&container.json, container.bin)?;
    flatten(&gltf, &value, resources, scale)
}

pub fn decode_gltf(
    json: &[u8],
    resources: &ResourceBundle,
    scale: f64,
) -> Result<DecodedMesh, MeshDecodeError> {
    if json.starts_with(b"glTF") {
        return Err(MeshDecodeError::new(
            MeshDecodeErrorKind::InvalidDocument,
            "glTF JSON input cannot use the GLB container.",
        ));
    }
    let (gltf, value) = parsed_document(json, None)?;
    flatten(&gltf, &value, resources, scale)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::rc::Rc;

    use super::*;
    use crate::analysis::mesh::analyze;

    fn resource_fixture(uri: Option<&str>) -> (Vec<u8>, Vec<u8>) {
        let mut buffer = Vec::new();
        for point in [
            [0.0_f32, 0.0, 0.0],
            [0.1, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [9.0, 9.0, 9.0],
        ] {
            for value in point {
                buffer.extend_from_slice(&value.to_le_bytes());
            }
        }
        for index in [0_u16, 1, 2] {
            buffer.extend_from_slice(&index.to_le_bytes());
        }
        let uri = uri.map_or(String::new(), |uri| format!(r#", "uri":"{uri}""#));
        let json = format!(
            r#"{{"asset":{{"version":"2.0"}},"buffers":[{{"byteLength":54{uri}}}],"bufferViews":[{{"buffer":0,"byteOffset":0,"byteLength":48}},{{"buffer":0,"byteOffset":48,"byteLength":6}}],"accessors":[{{"bufferView":0,"componentType":5126,"count":4,"type":"VEC3","min":[0,0,0],"max":[9,9,9]}},{{"bufferView":1,"componentType":5123,"count":3,"type":"SCALAR"}}],"meshes":[{{"name":"fallback","primitives":[{{"attributes":{{"POSITION":0}},"indices":1}},{{"attributes":{{"POSITION":0}},"indices":1}}]}}],"nodes":[{{"name":"assembly","children":[1],"matrix":[0,1,0,0,-1,0,0,0,0,0,1,0,10,20,30,1]}},{{"name":"part","mesh":0,"translation":[1,0,0]}}],"scenes":[{{"nodes":[0]}}],"scene":0}}"#
        );
        (json.into_bytes(), buffer)
    }

    fn glb(json: &[u8], binary: &[u8]) -> Vec<u8> {
        let mut json = json.to_vec();
        while json.len() % 4 != 0 {
            json.push(b' ');
        }
        let mut binary = binary.to_vec();
        while binary.len() % 4 != 0 {
            binary.push(0);
        }
        let length = 12 + 8 + json.len() + 8 + binary.len();
        let mut output = b"glTF".to_vec();
        output.extend_from_slice(&2_u32.to_le_bytes());
        output.extend_from_slice(&(length as u32).to_le_bytes());
        output.extend_from_slice(&(json.len() as u32).to_le_bytes());
        output.extend_from_slice(&0x4E4F534A_u32.to_le_bytes());
        output.extend_from_slice(&json);
        output.extend_from_slice(&(binary.len() as u32).to_le_bytes());
        output.extend_from_slice(&0x004E4942_u32.to_le_bytes());
        output.extend_from_slice(&binary);
        output
    }

    #[test]
    fn flattens_external_resources_world_transforms_precision_and_order() {
        let (json, buffer) = resource_fixture(Some("mesh.bin"));
        let resources = ResourceBundle {
            entries: BTreeMap::from([("mesh.bin".into(), buffer)]),
        };
        let decoded = decode_gltf(&json, &resources, 1_000.0).unwrap();
        assert_eq!(decoded.consumed_resources, ["mesh.bin"]);
        let record = decoded.record;
        assert_eq!(record.positions.len(), 4);
        assert_eq!(record.triangles, [[0, 1, 2], [0, 1, 2]]);
        assert_eq!(record.triangle_primitives, [0, 1]);
        assert_eq!(record.primitives[0].name, "part#0");
        assert_eq!(record.primitives[1].name, "part#1");
        assert_eq!(record.primitives[0].vertex_start, 0);
        assert_eq!(record.primitives[1].vertex_start, 0);
        assert_eq!(record.positions[0], [10_000.0, 21_000.0, 30_000.0]);
        assert_eq!(
            record.positions[1],
            [10_000.0, (21.0 + f64::from(0.1_f32)) * 1_000.0, 30_000.0]
        );
        let size = analyze(&Rc::new(record)).bounding_box().size;
        assert!(size.into_iter().all(|axis| (axis - 9_000.0).abs() < 1e-10));
    }

    #[test]
    fn flattens_glb_bin_bytes_through_the_same_record() {
        let (json, buffer) = resource_fixture(None);
        let decoded = decode_glb(&glb(&json, &buffer), &ResourceBundle::default(), 1.0).unwrap();
        assert!(decoded.consumed_resources.is_empty());
        let record = decoded.record;
        assert_eq!(record.positions.len(), 4);
        assert_eq!(record.triangles.len(), 2);
        assert_eq!(
            record
                .primitives
                .iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            ["part#0", "part#1"]
        );
    }

    #[test]
    fn preserves_authored_binary64_node_translation() {
        let json = br#"{"accessors":[{"bufferView":0,"componentType":5126,"count":4,"max":[4,2,0],"min":[0,0,0],"type":"VEC3"},{"bufferView":1,"componentType":5123,"count":3,"type":"SCALAR"}],"asset":{"version":"2.0"},"bufferViews":[{"buffer":0,"byteLength":48,"byteOffset":0},{"buffer":0,"byteLength":6,"byteOffset":48}],"buffers":[{"byteLength":54,"uri":"mesh.bin"}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":1,"mode":4}]}],"nodes":[{"mesh":0,"translation":[16777217,0,0]}],"scene":0,"scenes":[{"nodes":[0]}]}"#;
        let mut buffer = Vec::new();
        for point in [
            [0.0_f32, 0.0, 0.0],
            [4.0, 0.0, 0.0],
            [0.0, 2.0, 0.0],
            [1.0, 2.0, 0.0],
        ] {
            for value in point {
                buffer.extend_from_slice(&value.to_le_bytes());
            }
        }
        for index in [0_u16, 1, 2] {
            buffer.extend_from_slice(&index.to_le_bytes());
        }
        let resources = ResourceBundle {
            entries: BTreeMap::from([("mesh.bin".into(), buffer)]),
        };
        let decoded = decode_gltf(json, &resources, 1.0).unwrap();
        assert_eq!(
            decoded.record.positions,
            [
                [16_777_217.0, 0.0, 0.0],
                [16_777_221.0, 0.0, 0.0],
                [16_777_217.0, 2.0, 0.0],
                [16_777_218.0, 2.0, 0.0],
            ]
        );
        let analysis = analyze(&Rc::new(decoded.record));
        let bounds = analysis.bounding_box();
        assert_eq!(bounds.size, [4.0, 2.0, 0.0]);
        assert_eq!(bounds.center, [16_777_219.0, 1.0, 0.0]);
        assert_eq!(analysis.mesh_quality().surface_area, 4.0);
    }

    /// One primitive over four positions; `indices` of `None` omits the accessor.
    fn index_fixture(indices: Option<&[u16]>) -> (Vec<u8>, ResourceBundle) {
        let mut buffer = Vec::new();
        for value in [
            0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0,
        ] {
            buffer.extend_from_slice(&value.to_le_bytes());
        }
        let (view, accessor, primitive) = match indices {
            Some(values) => {
                for index in values {
                    buffer.extend_from_slice(&index.to_le_bytes());
                }
                (
                    format!(
                        r#",{{"buffer":0,"byteOffset":48,"byteLength":{}}}"#,
                        values.len() * 2
                    ),
                    format!(
                        r#",{{"bufferView":1,"componentType":5123,"count":{},"type":"SCALAR"}}"#,
                        values.len()
                    ),
                    r#","indices":1"#,
                )
            }
            None => (String::new(), String::new(), ""),
        };
        let json = format!(
            r#"{{"asset":{{"version":"2.0"}},"buffers":[{{"byteLength":{},"uri":"mesh.bin"}}],"bufferViews":[{{"buffer":0,"byteOffset":0,"byteLength":48}}{view}],"accessors":[{{"bufferView":0,"componentType":5126,"count":4,"type":"VEC3","min":[0,0,0],"max":[1,1,0]}}{accessor}],"meshes":[{{"primitives":[{{"attributes":{{"POSITION":0}}{primitive}}}]}}],"nodes":[{{"mesh":0}}],"scenes":[{{"nodes":[0]}}],"scene":0}}"#,
            buffer.len(),
        );
        let resources = ResourceBundle {
            entries: BTreeMap::from([("mesh.bin".into(), buffer)]),
        };
        (json.into_bytes(), resources)
    }

    #[test]
    fn streams_complete_index_triples_and_refuses_out_of_range_indices() {
        let decode = |indices: Option<&[u16]>| {
            let (json, resources) = index_fixture(indices);
            decode_gltf(&json, &resources, 1.0)
        };
        // A trailing partial triple is ignored, indexed or not.
        let indexed = decode(Some([2, 1, 0, 3].as_slice())).unwrap().record;
        assert_eq!(indexed.triangles, [[2, 1, 0]]);
        assert_eq!(indexed.triangle_primitives, [0]);
        let unindexed = decode(None).unwrap().record;
        assert_eq!(unindexed.triangles, [[0, 1, 2]]);
        assert_eq!(unindexed.positions.len(), 4);

        let error = decode(Some([0, 1, 4].as_slice())).unwrap_err();
        assert_eq!(error.kind, MeshDecodeErrorKind::InvalidResource);
        assert_eq!(
            error.message,
            "A primitive index is outside its POSITION accessor."
        );
    }

    #[test]
    fn refuses_missing_caller_resource_without_host_io() {
        let (json, _) = resource_fixture(Some("mesh.bin"));
        let error = decode_gltf(&json, &ResourceBundle::default(), 1.0).unwrap_err();
        assert_eq!(error.kind, MeshDecodeErrorKind::MissingResource);
        assert!(error.message.contains("mesh.bin"));
    }
}
