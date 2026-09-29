use std::collections::HashSet;

use serde::de::{DeserializeSeed, MapAccess, SeqAccess, Visitor};

use crate::{ErrorKind, ProtocolError};

/// Locale-independent UTF-16 code-unit ordering used by canonical JSON.
pub(crate) fn compare_utf16(left: &str, right: &str) -> std::cmp::Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_DEPTH: usize = 64;
const MAX_STRING_BYTES: usize = 1024 * 1024;
const MAX_ARRAY_ENTRIES: usize = 65_536;

const DUPLICATE_KEY: &str = "__GEOSPEC_DUPLICATE_KEY__";
const DEPTH_LIMIT: &str = "__GEOSPEC_DEPTH_LIMIT__";
const STRING_LIMIT: &str = "__GEOSPEC_STRING_LIMIT__";
const ARRAY_LIMIT: &str = "__GEOSPEC_ARRAY_LIMIT__";

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Json {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

impl Json {
    pub(crate) fn object<const N: usize>(entries: [(&str, Self); N]) -> Self {
        Self::Object(
            entries
                .into_iter()
                .map(|(key, value)| (key.into(), value))
                .collect(),
        )
    }

    pub(crate) fn string(value: &str) -> Self {
        Self::String(value.into())
    }
}

pub(crate) fn decode(input: &[u8]) -> Result<Json, ProtocolError> {
    if input.len() > MAX_INPUT_BYTES {
        return Err(ProtocolError::new(
            ErrorKind::LimitExceeded,
            "GeoSpec control JSON exceeds the 16 MiB input limit.",
        ));
    }
    let text = std::str::from_utf8(input).map_err(|_| {
        ProtocolError::new(
            ErrorKind::InvalidUtf8,
            "GeoSpec control JSON must be valid UTF-8.",
        )
    })?;
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let value = JsonSeed { depth: 0 }
        .deserialize(&mut deserializer)
        .map_err(map_decode_error)?;
    deserializer.end().map_err(map_decode_error)?;
    Ok(value)
}

pub(crate) fn encode(value: &Json) -> Result<Vec<u8>, ProtocolError> {
    let mut output = Vec::new();
    write_json(value, &mut output)?;
    Ok(output)
}

fn map_decode_error(error: serde_json::Error) -> ProtocolError {
    let message = error.to_string();
    let (kind, public_message) = if message.contains(DUPLICATE_KEY) {
        (
            ErrorKind::DuplicateKey,
            "GeoSpec control JSON contains a duplicate object key.",
        )
    } else if message.contains(DEPTH_LIMIT) {
        (
            ErrorKind::LimitExceeded,
            "GeoSpec control JSON exceeds nesting depth 64.",
        )
    } else if message.contains(STRING_LIMIT) {
        (
            ErrorKind::LimitExceeded,
            "GeoSpec control JSON contains a string larger than 1 MiB.",
        )
    } else if message.contains(ARRAY_LIMIT) {
        (
            ErrorKind::LimitExceeded,
            "GeoSpec control JSON contains more than 65536 array entries.",
        )
    } else if message.contains("number out of range") {
        (
            ErrorKind::InvalidNumber,
            "GeoSpec control JSON numbers must be finite binary64 values.",
        )
    } else {
        (
            ErrorKind::InvalidJson,
            "GeoSpec control input is not valid strict JSON.",
        )
    };
    ProtocolError::new(kind, public_message)
}

fn write_json(value: &Json, output: &mut Vec<u8>) -> Result<(), ProtocolError> {
    match value {
        Json::Null => output.extend_from_slice(b"null"),
        Json::Bool(true) => output.extend_from_slice(b"true"),
        Json::Bool(false) => output.extend_from_slice(b"false"),
        Json::Number(number) => {
            if !number.is_finite() {
                return Err(ProtocolError::new(
                    ErrorKind::InvalidNumber,
                    "GeoSpec control JSON numbers must be finite binary64 values.",
                ));
            }
            if *number == 0.0 {
                output.push(b'0');
            } else {
                output.extend_from_slice(ryu_js::Buffer::new().format_finite(*number).as_bytes());
            }
        }
        Json::String(string) => write_string(string, output)?,
        Json::Array(values) => {
            output.push(b'[');
            for (index, value) in values.iter().enumerate() {
                if index != 0 {
                    output.push(b',');
                }
                write_json(value, output)?;
            }
            output.push(b']');
        }
        Json::Object(entries) => {
            let mut ordered: Vec<_> = entries.iter().collect();
            ordered.sort_unstable_by(|(left, _), (right, _)| compare_utf16(left, right));
            output.push(b'{');
            for (index, (key, value)) in ordered.into_iter().enumerate() {
                if index != 0 {
                    output.push(b',');
                }
                write_string(key, output)?;
                output.push(b':');
                write_json(value, output)?;
            }
            output.push(b'}');
        }
    }
    Ok(())
}

fn write_string(value: &str, output: &mut Vec<u8>) -> Result<(), ProtocolError> {
    serde_json::to_writer(output, value).map_err(|_| {
        ProtocolError::new(
            ErrorKind::InvalidJson,
            "GeoSpec control JSON contains an invalid string.",
        )
    })
}

struct JsonSeed {
    depth: usize,
}

impl<'de> DeserializeSeed<'de> for JsonSeed {
    type Value = Json;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_any(JsonVisitor { depth: self.depth })
    }
}

struct JsonVisitor {
    depth: usize,
}

impl<'de> Visitor<'de> for JsonVisitor {
    type Value = Json;

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("a finite JSON value")
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(Json::Null)
    }

    fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E> {
        Ok(Json::Bool(value))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E> {
        Ok(Json::Number(value as f64))
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E> {
        Ok(Json::Number(value as f64))
    }

    fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        if value.is_finite() {
            Ok(Json::Number(value))
        } else {
            Err(E::custom("number out of range"))
        }
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        checked_string(value.to_owned())
    }

    fn visit_borrowed_str<E>(self, value: &'de str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        checked_string(value.to_owned())
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        checked_string(value)
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        if self.depth >= MAX_DEPTH {
            return Err(serde::de::Error::custom(DEPTH_LIMIT));
        }
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element_seed(JsonSeed {
            depth: self.depth + 1,
        })? {
            if values.len() == MAX_ARRAY_ENTRIES {
                return Err(serde::de::Error::custom(ARRAY_LIMIT));
            }
            values.push(value);
        }
        Ok(Json::Array(values))
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        if self.depth >= MAX_DEPTH {
            return Err(serde::de::Error::custom(DEPTH_LIMIT));
        }
        let mut keys = HashSet::new();
        let mut entries = Vec::new();
        while let Some(key) = map.next_key::<String>()? {
            if key.len() > MAX_STRING_BYTES {
                return Err(serde::de::Error::custom(STRING_LIMIT));
            }
            if !keys.insert(key.clone()) {
                return Err(serde::de::Error::custom(DUPLICATE_KEY));
            }
            let value = map.next_value_seed(JsonSeed {
                depth: self.depth + 1,
            })?;
            entries.push((key, value));
        }
        Ok(Json::Object(entries))
    }
}

fn checked_string<E>(value: String) -> Result<Json, E>
where
    E: serde::de::Error,
{
    if value.len() > MAX_STRING_BYTES {
        Err(E::custom(STRING_LIMIT))
    } else {
        Ok(Json::String(value))
    }
}
