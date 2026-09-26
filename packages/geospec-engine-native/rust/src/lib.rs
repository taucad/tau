mod analysis;
mod ancillary;
pub mod backend;
mod budget;
pub mod cache;
pub mod certificates;
mod codec;
mod identity;
mod matchers;
mod mesh;
mod prepared;
mod protocol;
pub mod registry;
mod result;
mod runtime;
mod subject;
pub use identity::{hex, sha256_hex};
pub use runtime::EngineConfig;

pub use protocol::Engine;

use std::error::Error;
use std::fmt;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ErrorKind {
    DuplicateKey,
    InvalidClaim,
    InvalidJson,
    InvalidNumber,
    InvalidRequest,
    InvalidUtf8,
    LimitExceeded,
    UnknownCapability,
    UnsupportedVersion,
    UnsupportedCapability,
    BackendFailure,
}

impl ErrorKind {
    const fn code(self) -> &'static str {
        match self {
            Self::DuplicateKey => "duplicate-key",
            Self::InvalidClaim => "invalid-claim",
            Self::InvalidJson => "invalid-json",
            Self::InvalidNumber => "invalid-number",
            Self::InvalidRequest => "invalid-request",
            Self::InvalidUtf8 => "invalid-utf8",
            Self::LimitExceeded => "limit-exceeded",
            Self::UnknownCapability => "unknown-capability",
            Self::UnsupportedVersion => "unsupported-version",
            Self::UnsupportedCapability => "unsupported-capability",
            Self::BackendFailure => "backend-failure",
        }
    }
}

/// A malformed or unsupported GeoSpec control document.
#[derive(Debug, Eq, PartialEq)]
pub struct ProtocolError {
    kind: ErrorKind,
    message: String,
}

impl ProtocolError {
    pub(crate) fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// Returns the stable machine-readable error code.
    pub const fn code(&self) -> &'static str {
        self.kind.code()
    }
}

impl fmt::Display for ProtocolError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for ProtocolError {}

/// Canonicalizes one strict finite-binary64 JSON value using GeoSpec JCS rules.
pub fn canonicalize(input: &[u8]) -> Result<Vec<u8>, ProtocolError> {
    codec::decode(input).and_then(|value| codec::encode(&value))
}

/// Processes one protocol-3 GeoSpec control request and returns canonical JSON.
pub fn process_request(input: &[u8]) -> Result<Vec<u8>, ProtocolError> {
    Engine::new().process_request(input)
}
