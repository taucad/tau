use crate::{ErrorKind, ProtocolError};

/// Owned mesh-buffer-v1 data, narrowed through Float32 at admission.
pub(crate) struct Mesh {
    pub(crate) positions: Vec<[f64; 3]>,
    pub(crate) indices: Vec<usize>,
}

impl Mesh {
    /// Moves all admitted f32 positions into the mesh analysis record. GSM1
    /// bounds remain indexed through the subject's format-specific bounds scope.
    pub(crate) fn analysis_record(self) -> crate::analysis::mesh::MeshAnalysisRecord {
        use crate::analysis::mesh::{MeshAnalysisRecord, Primitive};
        let vertex_count =
            u32::try_from(self.positions.len()).expect("GSM1 vertex count was admitted as u32");
        MeshAnalysisRecord {
            triangles: self
                .indices
                .chunks_exact(3)
                .map(|triangle| {
                    std::array::from_fn(|axis| {
                        u32::try_from(triangle[axis]).expect("GSM1 index was admitted as u32")
                    })
                })
                .collect(),
            triangle_primitives: vec![0; self.indices.len() / 3],
            primitives: vec![Primitive {
                name: "mesh-buffer#0".into(),
                vertex_start: 0,
                vertex_count,
            }],
            positions: self.positions,
        }
    }

    pub(crate) fn decode(bytes: &[u8]) -> Result<Self, ProtocolError> {
        if bytes.len() > 16 * 1024 * 1024 {
            return Err(ProtocolError::new(
                ErrorKind::LimitExceeded,
                "Mesh bytes exceed the 16 MiB mesh-buffer-v1 limit.",
            ));
        }
        let invalid = || {
            ProtocolError::new(
                ErrorKind::InvalidRequest,
                "Invalid mesh-buffer-v1 bytes, counts, coordinates or indices.",
            )
        };
        if bytes.len() < 12 || &bytes[..4] != b"GSM1" {
            return Err(invalid());
        }
        let vertex_count =
            u32::from_le_bytes(bytes[4..8].try_into().map_err(|_| invalid())?) as usize;
        let triangle_count =
            u32::from_le_bytes(bytes[8..12].try_into().map_err(|_| invalid())?) as usize;
        if vertex_count == 0 || triangle_count == 0 {
            return Err(invalid());
        }
        let position_bytes = vertex_count.checked_mul(24).ok_or_else(invalid)?;
        let index_count = triangle_count.checked_mul(3).ok_or_else(invalid)?;
        let index_start = 12_usize.checked_add(position_bytes).ok_or_else(invalid)?;
        let length = index_count
            .checked_mul(4)
            .and_then(|n| index_start.checked_add(n))
            .ok_or_else(invalid)?;
        if length != bytes.len() {
            return Err(invalid());
        }
        let mut positions = Vec::with_capacity(vertex_count);
        for vertex in bytes[12..index_start].chunks_exact(24) {
            let mut point = [0.0; 3];
            for (axis, coordinate) in vertex.chunks_exact(8).enumerate() {
                let input = f64::from_le_bytes(coordinate.try_into().map_err(|_| invalid())?);
                let narrowed = input as f32;
                if !input.is_finite() || !narrowed.is_finite() {
                    return Err(invalid());
                }
                point[axis] = f64::from(narrowed);
            }
            positions.push(point);
        }
        let mut indices = Vec::with_capacity(index_count);
        for index in bytes[index_start..].chunks_exact(4) {
            let index = u32::from_le_bytes(index.try_into().map_err(|_| invalid())?) as usize;
            if index >= vertex_count {
                return Err(invalid());
            }
            indices.push(index);
        }
        Ok(Self { positions, indices })
    }
}
