use crate::{ErrorKind, ProtocolError};

/// Owned mesh-buffer-v1 data, narrowed through Float32 at admission.
pub(crate) struct Mesh {
    pub(crate) positions: Vec<[f64; 3]>,
    pub(crate) indices: Vec<usize>,
}

#[cfg(test)]
thread_local! {
    pub(crate) static BOUNDS_CALLS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

impl Mesh {
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

    /// The reference computes size/center first and reconstructs min/max.
    pub(crate) fn bounds(&self) -> [[f64; 3]; 4] {
        #[cfg(test)]
        BOUNDS_CALLS.with(|count| count.set(count.get() + 1));
        let mut min = [f64::INFINITY; 3];
        let mut max = [f64::NEG_INFINITY; 3];
        for &index in &self.indices {
            for axis in 0..3 {
                let value = self.positions[index][axis];
                min[axis] = min[axis].min(value);
                max[axis] = max[axis].max(value);
            }
        }
        let size = std::array::from_fn(|axis| max[axis] - min[axis]);
        let center = std::array::from_fn(|axis| (min[axis] + max[axis]) / 2.0);
        let min = std::array::from_fn(|axis| center[axis] - size[axis] / 2.0);
        let max = std::array::from_fn(|axis| center[axis] + size[axis] / 2.0);
        [min, max, size, center]
    }
}
