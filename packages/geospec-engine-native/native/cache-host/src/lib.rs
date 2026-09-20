//! Authenticated filesystem storage for the one native B48 overlap family.

use std::{
    cell::{Cell, RefCell},
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

use geospec_engine_native_core::{
    cache::{EvidenceAddress, OverlapEvidenceCache},
    canonicalize,
};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const ENVELOPE_SCHEMA: &str = "geospec-authenticated-evidence-v1";
const SECRET_BYTES: usize = 32;
const MAX_PAYLOAD_BYTES: usize = 16 * 1024 * 1024;
const MAX_ACTION_BYTES: usize = 64 * 1024;
type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Diagnostics {
    reads: u64,
    hits: u64,
    misses: u64,
    writes: u64,
    io_failures: u64,
    authentication_failures: u64,
    rejected_writes: u64,
    sealed: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Envelope {
    schema: String,
    authority_id: String,
    key_id: String,
    action_sha256: String,
    family: String,
    codec: String,
    producer_profile_sha256: String,
    content_sha256: String,
    content_byte_length: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ActionRecord {
    envelope: Envelope,
    hmac_sha256: String,
}

/// One explicit, process-local adapter over an authenticated filesystem root.
pub struct AuthenticatedOverlapCache {
    root: PathBuf,
    secret: [u8; SECRET_BYTES],
    authority_id: String,
    key_id: String,
    diagnostics: RefCell<Diagnostics>,
    sealed: Cell<bool>,
    flush_result: RefCell<Option<Vec<u8>>>,
}

impl AuthenticatedOverlapCache {
    /// Opens a cache outside the project tree and creates its installation key
    /// with exclusive atomic first publication when needed.
    pub fn open(root: impl AsRef<Path>, project_root: impl AsRef<Path>) -> io::Result<Self> {
        fs::create_dir_all(root.as_ref())?;
        let root = fs::canonicalize(root)?;
        let project = fs::canonicalize(project_root)?;
        if root.starts_with(&project) || project.starts_with(&root) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "GeoSpec cache root must not overlap the project tree.",
            ));
        }
        let secret = load_or_create_secret(&root)?;
        fs::create_dir_all(root.join("content"))?;
        fs::create_dir_all(root.join("actions"))?;
        Ok(Self {
            authority_id: domain_id(b"geospec-cache-authority-v1\0", &secret),
            key_id: domain_id(b"geospec-cache-key-v1\0", &secret),
            root,
            secret,
            diagnostics: RefCell::new(Diagnostics::default()),
            sealed: Cell::new(false),
            flush_result: RefCell::new(None),
        })
    }

    /// Seals publication and returns the same canonical diagnostics on every
    /// later call.
    pub fn flush(&self) -> Vec<u8> {
        if let Some(result) = self.flush_result.borrow().as_ref() {
            return result.clone();
        }
        self.sealed.set(true);
        self.diagnostics.borrow_mut().sealed = true;
        let bytes = canonicalize(
            &serde_json::to_vec(&*self.diagnostics.borrow()).expect("diagnostics serialize"),
        )
        .expect("diagnostics canonicalize");
        *self.flush_result.borrow_mut() = Some(bytes.clone());
        bytes
    }

    /// Removes this family's evidence while preserving the installation key.
    pub fn clear(&self) -> bool {
        if self.sealed.get() {
            return false;
        }
        let result = (|| {
            remove_if_present(&self.root.join("content"))?;
            remove_if_present(&self.root.join("actions"))?;
            fs::create_dir_all(self.root.join("content"))?;
            fs::create_dir_all(self.root.join("actions"))
        })();
        if result.is_err() {
            self.diagnostics.borrow_mut().io_failures += 1;
        }
        result.is_ok()
    }
}

impl OverlapEvidenceCache for AuthenticatedOverlapCache {
    fn load(&self, address: &EvidenceAddress) -> Option<Vec<u8>> {
        self.diagnostics.borrow_mut().reads += 1;
        let result = self.load_inner(address);
        let mut diagnostics = self.diagnostics.borrow_mut();
        if result.is_some() {
            diagnostics.hits += 1;
        } else {
            diagnostics.misses += 1;
        }
        result
    }

    fn publish(&self, address: &EvidenceAddress, payload: &[u8]) {
        if self.sealed.get() || payload.len() > MAX_PAYLOAD_BYTES {
            self.diagnostics.borrow_mut().rejected_writes += 1;
            return;
        }
        if self.publish_inner(address, payload).is_ok() {
            self.diagnostics.borrow_mut().writes += 1;
        } else {
            self.diagnostics.borrow_mut().io_failures += 1;
        }
    }
}

impl AuthenticatedOverlapCache {
    fn load_inner(&self, address: &EvidenceAddress) -> Option<Vec<u8>> {
        let action_path = self
            .root
            .join("actions")
            .join(format!("{}.json", address.action_sha256));
        let action = read_bounded(&action_path, MAX_ACTION_BYTES).ok()?;
        if canonicalize(&action).ok()? != action {
            return None;
        }
        let record: ActionRecord = serde_json::from_slice(&action).ok()?;
        let envelope_bytes = canonicalize(&serde_json::to_vec(&record.envelope).ok()?).ok()?;
        let mut mac = HmacSha256::new_from_slice(&self.secret).ok()?;
        mac.update(&envelope_bytes);
        let supplied = decode_hex_32(&record.hmac_sha256)?;
        if mac.verify_slice(&supplied).is_err() {
            self.diagnostics.borrow_mut().authentication_failures += 1;
            return None;
        }
        let envelope = record.envelope;
        if envelope.schema != ENVELOPE_SCHEMA
            || envelope.authority_id != self.authority_id
            || envelope.key_id != self.key_id
            || envelope.action_sha256 != address.action_sha256
            || envelope.family != address.family
            || envelope.codec != address.codec
            || envelope.producer_profile_sha256 != address.producer_profile_sha256
            || envelope.content_byte_length > MAX_PAYLOAD_BYTES as u64
        {
            return None;
        }
        let payload = read_bounded(
            &self
                .root
                .join("content")
                .join(format!("{}.json", envelope.content_sha256)),
            envelope.content_byte_length as usize,
        )
        .ok()?;
        if payload.len() as u64 != envelope.content_byte_length
            || digest(&payload) != envelope.content_sha256
        {
            return None;
        }
        Some(payload)
    }

    fn publish_inner(&self, address: &EvidenceAddress, payload: &[u8]) -> io::Result<()> {
        let content_sha256 = digest(payload);
        let content = self
            .root
            .join("content")
            .join(format!("{content_sha256}.json"));
        atomic_write(&content, payload)?;
        let envelope = Envelope {
            schema: ENVELOPE_SCHEMA.into(),
            authority_id: self.authority_id.clone(),
            key_id: self.key_id.clone(),
            action_sha256: address.action_sha256.clone(),
            family: address.family.into(),
            codec: address.codec.into(),
            producer_profile_sha256: address.producer_profile_sha256.clone(),
            content_sha256,
            content_byte_length: payload.len() as u64,
        };
        let envelope_bytes =
            canonicalize(&serde_json::to_vec(&envelope).map_err(io::Error::other)?)
                .map_err(io::Error::other)?;
        let mut mac = HmacSha256::new_from_slice(&self.secret)
            .map_err(|_| io::Error::other("invalid HMAC key"))?;
        mac.update(&envelope_bytes);
        let record = ActionRecord {
            envelope,
            hmac_sha256: encode_hex(&mac.finalize().into_bytes()),
        };
        let bytes = canonicalize(&serde_json::to_vec(&record).map_err(io::Error::other)?)
            .map_err(io::Error::other)?;
        atomic_write(
            &self
                .root
                .join("actions")
                .join(format!("{}.json", address.action_sha256)),
            &bytes,
        )
    }
}

fn load_or_create_secret(root: &Path) -> io::Result<[u8; SECRET_BYTES]> {
    let authority = root.join("authority");
    fs::create_dir_all(&authority)?;
    let key = authority.join("install-secret-v1");
    match read_bounded(&key, SECRET_BYTES) {
        Ok(bytes) => {
            return bytes
                .try_into()
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid cache secret"));
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    let mut secret = [0_u8; SECRET_BYTES];
    fill_random(&mut secret)?;
    let mut suffix = [0_u8; 8];
    fill_random(&mut suffix)?;
    let temporary = authority.join(format!(".install-secret-{}", encode_hex(&suffix)));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary)?;
    file.write_all(&secret)?;
    file.sync_all()?;
    match fs::hard_link(&temporary, &key) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }
    }
    let _ = fs::remove_file(&temporary);
    let bytes = read_bounded(&key, SECRET_BYTES)?;
    bytes
        .try_into()
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid cache secret"))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut suffix = [0_u8; 8];
    fill_random(&mut suffix)?;
    let temporary = path.with_extension(format!("tmp-{}", encode_hex(&suffix)));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    fs::rename(&temporary, path).inspect_err(|_| {
        let _ = fs::remove_file(&temporary);
    })
}

fn read_bounded(path: &Path, limit: usize) -> io::Result<Vec<u8>> {
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    if metadata.len() > limit as u64 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "cache record too large",
        ));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(limit as u64 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "cache record too large",
        ));
    }
    Ok(bytes)
}

fn remove_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn domain_id(domain: &[u8], secret: &[u8]) -> String {
    let mut hash = Sha256::new();
    hash.update(domain);
    hash.update(secret);
    format!("sha256:{:x}", hash.finalize())
}

fn fill_random(bytes: &mut [u8]) -> io::Result<()> {
    getrandom::getrandom(bytes)
        .map_err(|error| io::Error::other(format!("operating-system randomness failed: {error}")))
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode_hex_32(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let mut result = [0_u8; 32];
    for (index, output) in result.iter_mut().enumerate() {
        *output = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn roots(name: &str) -> (PathBuf, PathBuf) {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let cache = std::env::temp_dir().join(format!(
            "geospec-cache-host-{name}-{}-{nonce}",
            std::process::id()
        ));
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let project = manifest.ancestors().nth(4).unwrap().to_path_buf();
        (cache, project)
    }

    fn address() -> EvidenceAddress {
        EvidenceAddress {
            action_sha256: "11".repeat(32),
            family: "native-b48-overlap-evidence-v1",
            codec: "geospec-overlap-evidence-json-v1",
            producer_profile_sha256: "22".repeat(32),
        }
    }

    #[test]
    fn authentication_digest_and_seal_fail_closed() {
        let (root, project) = roots("integrity");
        let cache = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        let address = address();
        let payload = br#"{"schema":"payload"}"#;
        cache.publish(&address, payload);
        assert_eq!(cache.load(&address).as_deref(), Some(payload.as_slice()));

        let action_path = root
            .join("actions")
            .join(format!("{}.json", address.action_sha256));
        let mut action: serde_json::Value =
            serde_json::from_slice(&fs::read(&action_path).unwrap()).unwrap();
        action["envelope"]["codec"] = serde_json::Value::String("mutated-codec".into());
        fs::write(&action_path, serde_json::to_vec(&action).unwrap()).unwrap();
        assert_eq!(
            cache.load(&address),
            None,
            "mutated envelope authentication"
        );

        cache.publish(&address, payload);
        let action: ActionRecord =
            serde_json::from_slice(&fs::read(&action_path).unwrap()).unwrap();
        let content_path = root
            .join("content")
            .join(format!("{}.json", action.envelope.content_sha256));
        fs::write(content_path, b"mutated payload").unwrap();
        assert_eq!(cache.load(&address), None, "mutated content digest");

        let sealed = cache.flush();
        cache.publish(&address, b"replacement");
        assert_eq!(cache.flush(), sealed, "sealed flush result is stable");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sealed_store_does_not_publish() {
        let (root, project) = roots("sealed");
        let cache = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        let address = address();
        cache.flush();
        cache.publish(&address, b"payload");
        assert!(!root
            .join("actions")
            .join(format!("{}.json", address.action_sha256))
            .exists());
        fs::remove_dir_all(root).unwrap();
    }
}
