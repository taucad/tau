//! The framed launch protocol: `type: u8`, `length: u32` little-endian, then `length` payload bytes.
//!
//! The same framing carries the host ↔ `launch` protocol (README "Launch protocol") and the internal
//! `launch` ↔ `runner` channel.

use std::io::{self, Read, Write};

/// Host to helper.
pub const SPEC: u8 = 0x01;
pub const START: u8 = 0x02;
pub const INPUT: u8 = 0x03;
pub const RESIZE: u8 = 0x04;
pub const TERMINATE: u8 = 0x05;
/// Empty: end the child's stdin (`pipes` with `input: true` only).
pub const CLOSE_INPUT: u8 = 0x06;

/// Helper to host.
pub const READY: u8 = 0x81;
pub const STDOUT: u8 = 0x82;
pub const STDERR: u8 = 0x83;
pub const OUTPUT: u8 = 0x84;
pub const EXIT: u8 = 0x85;
pub const REFUSED: u8 = 0x86;
pub const STARTED: u8 = 0x87;
pub const CLEANUP_FAILED: u8 = 0x88;

/// Runner to launcher only, never forwarded to the host: the runner could not prepare or start the shell.
pub const RUNNER_ERROR: u8 = 0xC1;
/// Runner to launcher only: a UTF-8 diagnostic line for the launcher's stderr (the host log).
pub const RUNNER_LOG: u8 = 0xC2;

/// The largest payload either side accepts. A spec or an I/O chunk is far smaller; a larger length is a
/// corrupt or hostile stream, refused before any allocation.
pub const MAX_PAYLOAD: u32 = 16 * 1024 * 1024;

/// Largest chunk the helper puts in one output frame.
pub const IO_CHUNK: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frame {
    pub kind: u8,
    pub payload: Vec<u8>,
}

impl Frame {
    pub fn new(kind: u8, payload: impl Into<Vec<u8>>) -> Self {
        Self { kind, payload: payload.into() }
    }

    #[cfg(test)]
    pub fn empty(kind: u8) -> Self {
        Self { kind, payload: Vec::new() }
    }

    pub fn json<T: serde::Serialize>(kind: u8, value: &T) -> Self {
        // Serialising the helper's own payload structs cannot fail.
        Self { kind, payload: serde_json::to_vec(value).unwrap_or_default() }
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(5 + self.payload.len());
        out.push(self.kind);
        out.extend_from_slice(&(self.payload.len() as u32).to_le_bytes());
        out.extend_from_slice(&self.payload);
        out
    }
}

/// Write one frame and flush, so a frame is never left half in a buffer.
pub fn write_frame<W: Write>(writer: &mut W, frame: &Frame) -> io::Result<()> {
    if frame.payload.len() > MAX_PAYLOAD as usize {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "frame payload too large"));
    }
    writer.write_all(&frame.encode())?;
    writer.flush()
}

/// Read one frame. `Ok(None)` is a clean end of stream at a frame boundary; a stream that ends inside a
/// frame, or a length over [`MAX_PAYLOAD`], is an error.
pub fn read_frame<R: Read>(reader: &mut R) -> io::Result<Option<Frame>> {
    let mut header = [0u8; 5];
    let mut filled = 0;
    while filled < header.len() {
        match reader.read(&mut header[filled..]) {
            Ok(0) if filled == 0 => return Ok(None),
            Ok(0) => return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "stream ended inside a frame header")),
            Ok(n) => filled += n,
            Err(err) if err.kind() == io::ErrorKind::Interrupted => {}
            Err(err) => return Err(err),
        }
    }
    let kind = header[0];
    let length = u32::from_le_bytes([header[1], header[2], header[3], header[4]]);
    if length > MAX_PAYLOAD {
        return Err(io::Error::new(io::ErrorKind::InvalidData, format!("frame length {length} exceeds the limit")));
    }
    let mut payload = vec![0u8; length as usize];
    reader.read_exact(&mut payload).map_err(|err| {
        if err.kind() == io::ErrorKind::UnexpectedEof {
            io::Error::new(io::ErrorKind::UnexpectedEof, "stream ended inside a frame payload")
        } else {
            err
        }
    })?;
    Ok(Some(Frame { kind, payload }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn encodes_type_then_little_endian_length_then_payload() {
        let frame = Frame::new(STDOUT, b"hi".to_vec());
        assert_eq!(frame.encode(), vec![0x82, 2, 0, 0, 0, b'h', b'i']);
        assert_eq!(Frame::empty(START).encode(), vec![0x02, 0, 0, 0, 0]);
    }

    #[test]
    fn round_trips_a_sequence_and_ends_cleanly() {
        let frames = vec![
            Frame::new(SPEC, br#"{"version":1}"#.to_vec()),
            Frame::empty(START),
            Frame::new(INPUT, vec![0u8; 70_000]),
            Frame::empty(TERMINATE),
        ];
        let mut bytes = Vec::new();
        for frame in &frames {
            write_frame(&mut bytes, frame).unwrap();
        }
        let mut cursor = Cursor::new(bytes);
        let mut read = Vec::new();
        while let Some(frame) = read_frame(&mut cursor).unwrap() {
            read.push(frame);
        }
        assert_eq!(read, frames);
    }

    #[test]
    fn reads_across_short_reads() {
        struct OneByte(Cursor<Vec<u8>>);
        impl Read for OneByte {
            fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
                let len = buf.len().min(1);
                self.0.read(&mut buf[..len])
            }
        }
        let mut reader = OneByte(Cursor::new(Frame::new(RESIZE, b"{}".to_vec()).encode()));
        assert_eq!(read_frame(&mut reader).unwrap(), Some(Frame::new(RESIZE, b"{}".to_vec())));
        assert_eq!(read_frame(&mut reader).unwrap(), None);
    }

    #[test]
    fn a_truncated_header_or_payload_is_an_error() {
        assert!(read_frame(&mut Cursor::new(vec![0x01, 5, 0])).is_err());
        assert!(read_frame(&mut Cursor::new(vec![0x01, 5, 0, 0, 0, b'a'])).is_err());
    }

    #[test]
    fn an_oversized_length_is_refused_before_allocating() {
        let mut bytes = vec![0x03];
        bytes.extend_from_slice(&(MAX_PAYLOAD + 1).to_le_bytes());
        let err = read_frame(&mut Cursor::new(bytes)).unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::InvalidData);
    }

    #[test]
    fn json_frames_carry_utf8_json() {
        let frame = Frame::json(EXIT, &serde_json::json!({ "exitCode": 3 }));
        assert_eq!(frame.payload, br#"{"exitCode":3}"#);
    }
}
