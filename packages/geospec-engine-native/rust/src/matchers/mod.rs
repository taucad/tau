//! Typed matcher families, sharing preparation, evidence and effective polarity.

pub(crate) mod brep;
pub(crate) mod diagnostics;
pub(crate) mod mesh;
pub(crate) mod proofs;
pub(crate) mod relationships;

// Direct pending-output accounting; no JSON encoding/parsing round trip.
pub(super) fn json_owned_bytes(value: &crate::codec::Json) -> u64 {
    use crate::codec::Json;
    use std::mem::size_of;
    let nested = match value {
        Json::String(value) => value.capacity() as u64,
        Json::Array(values) => {
            (values.capacity() * size_of::<Json>()) as u64
                + values.iter().map(json_owned_bytes).sum::<u64>()
        }
        Json::Object(values) => {
            (values.capacity() * size_of::<(String, Json)>()) as u64
                + values
                    .iter()
                    .map(|(key, value)| key.capacity() as u64 + json_owned_bytes(value))
                    .sum::<u64>()
        }
        _ => 0,
    };
    (size_of::<Json>() as u64).saturating_add(nested)
}
