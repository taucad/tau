pub mod backend;
pub mod registry;
pub mod certificates;
mod analysis;
mod subject;
mod matchers;
mod budget;
mod prepared;
mod result;
mod codec;
mod identity;
mod ancillary;
mod mesh;
mod protocol;
mod runtime;
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
