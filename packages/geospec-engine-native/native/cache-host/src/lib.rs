//! Authenticated filesystem storage for native completed evidence families.

use std::{
    cell::{Cell, RefCell},
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

use geospec_engine_native_core::{
    cache::{EvidenceAddress, OverlapEvidenceCache},
    canonicalize, hex, sha256_hex,
};
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const ENVELOPE_SCHEMA: &str = "geospec-authenticated-evidence-v1";
const SECRET_BYTES: usize = 32;
const MAX_PAYLOAD_BYTES: usize = 16 * 1024 * 1024;
const MAX_ACTION_BYTES: usize = 64 * 1024;
const OVERLAP_FAMILY: &str = "native-b48-overlap-evidence-v1";
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

    /// Removes authenticated B48 action records. Content and poison markers
    /// remain until a pin-aware collector can prove they are disposable.
    pub fn clear(&self) -> bool {
        if self.sealed.get() {
            return false;
        }
        let result = (|| {
            let actions = self.root.join("actions");
            let mut overlap_actions = Vec::new();
            for entry in fs::read_dir(&actions)? {
                let entry = entry?;
                let path = entry.path();
                if path.extension().is_none_or(|extension| extension != "json") {
                    continue;
                }
                let bytes = read_bounded(&path, MAX_ACTION_BYTES)?;
                if canonicalize(&bytes).map_err(io::Error::other)? != bytes {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "noncanonical cache action",
                    ));
                }
                let record: ActionRecord =
                    serde_json::from_slice(&bytes).map_err(io::Error::other)?;
                let name = path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .unwrap_or_default();
                if !valid_digest(name)
                    || record.envelope.action_sha256 != name
                    || record.envelope.schema != ENVELOPE_SCHEMA
                    || record.envelope.authority_id != self.authority_id
                    || record.envelope.key_id != self.key_id
                    || !valid_digest(&record.envelope.content_sha256)
                    || record.envelope.content_byte_length > MAX_PAYLOAD_BYTES as u64
                {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "invalid cache action name",
                    ));
                }
                let envelope_bytes =
                    canonicalize(&serde_json::to_vec(&record.envelope).map_err(io::Error::other)?)
                        .map_err(io::Error::other)?;
                let mut mac = HmacSha256::new_from_slice(&self.secret)
                    .map_err(|_| io::Error::other("invalid HMAC key"))?;
                mac.update(&envelope_bytes);
                let supplied = decode_hex_32(&record.hmac_sha256).ok_or_else(|| {
                    io::Error::new(io::ErrorKind::InvalidData, "invalid cache action HMAC")
                })?;
                mac.verify_slice(&supplied).map_err(|_| {
                    io::Error::new(
                        io::ErrorKind::InvalidData,
                        "cache action authentication failed",
                    )
                })?;
                if record.envelope.family == OVERLAP_FAMILY {
                    overlap_actions.push(path);
                }
            }
            for path in overlap_actions {
                fs::remove_file(path)?;
            }
            File::open(actions)?.sync_all()
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
        if !valid_address(address) {
            return None;
        }
        let action_path = self
            .root
            .join("actions")
            .join(format!("{}.json", address.action_sha256));
        if action_path.with_extension("poison").exists() {
            return None;
        }
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
            || !valid_digest(&envelope.content_sha256)
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
            || sha256_hex(&payload) != envelope.content_sha256
            || action_path.with_extension("poison").exists()
        {
            return None;
        }
        Some(payload)
    }

    fn publish_inner(&self, address: &EvidenceAddress, payload: &[u8]) -> io::Result<()> {
        if !valid_address(address) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid evidence address",
            ));
        }
        let content_sha256 = sha256_hex(payload);
        let content = self
            .root
            .join("content")
            .join(format!("{content_sha256}.json"));
        publish_immutable(&content, payload)?;
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
            hmac_sha256: hex(&mac.finalize().into_bytes()),
        };
        let bytes = canonicalize(&serde_json::to_vec(&record).map_err(io::Error::other)?)
            .map_err(io::Error::other)?;
        let action = self
            .root
            .join("actions")
            .join(format!("{}.json", address.action_sha256));
        if action.with_extension("poison").exists() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "poisoned evidence action",
            ));
        }
        if let Err(error) = publish_immutable(&action, &bytes) {
            if error.kind() == io::ErrorKind::AlreadyExists {
                let poison = action.with_extension("poison");
                publish_immutable(&poison, b"divergent action\n")?;
            }
            return Err(error);
        }
        Ok(())
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
    let temporary = authority.join(format!(".install-secret-{}", hex(&suffix)));
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
        Ok(()) => File::open(&authority)?.sync_all()?,
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

fn publish_immutable(path: &Path, bytes: &[u8]) -> io::Result<()> {
    publish_immutable_with(path, bytes, |file, bytes| {
        file.write_all(bytes)?;
        file.sync_all()
    })
}

fn publish_immutable_with(
    path: &Path,
    bytes: &[u8],
    write: impl FnOnce(&mut File, &[u8]) -> io::Result<()>,
) -> io::Result<()> {
    let mut suffix = [0_u8; 8];
    fill_random(&mut suffix)?;
    let temporary = path.with_extension(format!("tmp-{}", hex(&suffix)));
    publish_immutable_with_temporary(path, &temporary, bytes, write)
}

fn publish_immutable_with_temporary(
    path: &Path,
    temporary: &Path,
    bytes: &[u8],
    write: impl FnOnce(&mut File, &[u8]) -> io::Result<()>,
) -> io::Result<()> {
    let mut created = false;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(temporary)?;
        created = true;
        write(&mut file, bytes)?;
        drop(file);
        match fs::hard_link(temporary, path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                if !read_bounded(path, bytes.len()).is_ok_and(|existing| existing == bytes) {
                    return Err(error);
                }
            }
            Err(error) => return Err(error),
        }
        File::open(path.parent().expect("published file has a parent"))?.sync_all()
    })();
    if created {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn valid_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn valid_address(address: &EvidenceAddress) -> bool {
    valid_digest(&address.action_sha256)
        && valid_digest(&address.producer_profile_sha256)
        && !address.family.is_empty()
        && !address.codec.is_empty()
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

fn domain_id(domain: &[u8], secret: &[u8]) -> String {
    let mut hash = Sha256::new();
    hash.update(domain);
    hash.update(secret);
    format!("sha256:{}", hex(&hash.finalize()))
}

fn fill_random(bytes: &mut [u8]) -> io::Result<()> {
    getrandom::getrandom(bytes)
        .map_err(|error| io::Error::other(format!("operating-system randomness failed: {error}")))
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
    use std::{
        process::Command,
        time::{SystemTime, UNIX_EPOCH},
    };

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

        let mut second_address = address.clone();
        second_address.action_sha256 = "33".repeat(32);
        cache.publish(&second_address, payload);
        let second_action_path = root
            .join("actions")
            .join(format!("{}.json", second_address.action_sha256));
        let action: ActionRecord =
            serde_json::from_slice(&fs::read(&second_action_path).unwrap()).unwrap();
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

    #[test]
    fn clearing_overlap_preserves_exact_fact_and_poison() {
        let (root, project) = roots("family-clear");
        let cache = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        let overlap = address();
        let mut exact = address();
        exact.action_sha256 = "44".repeat(32);
        exact.family = "native-exact-step-clusters-v1";
        exact.codec = "geospec-exact-clusters-json-v1";
        cache.publish(&overlap, b"shared-content");
        cache.publish(&exact, b"shared-content");
        let mut poisoned = address();
        poisoned.action_sha256 = "55".repeat(32);
        cache.publish(&poisoned, b"first");
        cache.publish(&poisoned, b"second");
        let poison = root
            .join("actions")
            .join(format!("{}.poison", poisoned.action_sha256));
        assert!(poison.exists());

        assert!(cache.clear());
        assert_eq!(cache.load(&overlap), None);
        drop(cache);
        let reopened = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        assert_eq!(
            reopened.load(&exact).as_deref(),
            Some(b"shared-content".as_slice())
        );
        assert!(poison.exists(), "a conflict must stay poisoned after clear");
        assert!(root.join("authority").join("install-secret-v1").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn clear_refuses_ambiguous_action_before_removing_any_family() {
        let (root, project) = roots("ambiguous-clear");
        let cache = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        let overlap = address();
        let mut exact = address();
        exact.action_sha256 = "44".repeat(32);
        exact.family = "native-exact-step-clusters-v1";
        exact.codec = "geospec-exact-clusters-json-v1";
        cache.publish(&overlap, b"overlap");
        cache.publish(&exact, b"exact");
        fs::write(
            root.join("actions")
                .join(format!("{}.json", exact.action_sha256)),
            b"invalid",
        )
        .unwrap();
        assert!(!cache.clear());
        assert_eq!(cache.load(&overlap).as_deref(), Some(b"overlap".as_slice()));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn completed_family_reopens_in_fresh_process() {
        let (root, project) = roots("fresh-process");
        let mut address = address();
        address.family = "native-exact-step-clusters-v1";
        address.codec = "geospec-exact-clusters-json-v1";
        let cache = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        cache.publish(&address, b"completed-fact");
        drop(cache);

        let status = Command::new(std::env::current_exe().unwrap())
            .arg("--exact")
            .arg("tests::cache_reopen_child")
            .env("GEOSPEC_CACHE_REOPEN_ROOT", &root)
            .env("GEOSPEC_CACHE_REOPEN_PROJECT", &project)
            .status()
            .unwrap();
        assert!(status.success());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cache_reopen_child() {
        let Ok(root) = std::env::var("GEOSPEC_CACHE_REOPEN_ROOT") else {
            return;
        };
        let project = std::env::var("GEOSPEC_CACHE_REOPEN_PROJECT").unwrap();
        let mut address = address();
        address.family = "native-exact-step-clusters-v1";
        address.codec = "geospec-exact-clusters-json-v1";
        let cache = AuthenticatedOverlapCache::open(root, project).unwrap();
        assert_eq!(
            cache.load(&address).as_deref(),
            Some(b"completed-fact".as_slice())
        );
    }

    #[test]
    fn rejects_unsafe_digests_and_poisoned_divergent_action() {
        let (root, project) = roots("conflict");
        let cache = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        let address = address();
        cache.publish(&address, b"one");
        assert_eq!(cache.load(&address).as_deref(), Some(b"one".as_slice()));

        let mut invalid = address.clone();
        invalid.action_sha256 = "../outside".into();
        cache.publish(&invalid, b"unsafe");
        assert_eq!(cache.load(&invalid), None);
        invalid.action_sha256 = "AA".repeat(32);
        cache.publish(&invalid, b"uppercase");
        assert_eq!(cache.load(&invalid), None);
        invalid = address.clone();
        invalid.producer_profile_sha256 = "bb/../".into();
        cache.publish(&invalid, b"unsafe producer");
        assert_eq!(cache.load(&invalid), None);

        cache.publish(&address, b"different");
        assert_eq!(cache.load(&address), None, "divergent action is poisoned");
        assert!(root
            .join("actions")
            .join(format!("{}.poison", address.action_sha256))
            .exists());
        drop(cache);
        let reopened = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        assert_eq!(reopened.load(&address), None, "poison survives reopen");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn concurrent_divergent_writers_poison_action() {
        let (root, project) = roots("concurrent-conflict");
        let first = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        let second = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        let address = address();
        let gate = std::sync::Barrier::new(3);
        std::thread::scope(|scope| {
            let first_gate = &gate;
            let first_address = &address;
            scope.spawn(move || {
                first_gate.wait();
                first.publish(first_address, b"first");
            });
            let second_gate = &gate;
            let second_address = &address;
            scope.spawn(move || {
                second_gate.wait();
                second.publish(second_address, b"second");
            });
            gate.wait();
        });
        let reopened = AuthenticatedOverlapCache::open(&root, &project).unwrap();
        assert_eq!(reopened.load(&address), None);
        assert!(root
            .join("actions")
            .join(format!("{}.poison", address.action_sha256))
            .exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn temporary_file_is_removed_after_write_or_sync_failure() {
        let (root, _) = roots("temporary-cleanup");
        fs::create_dir_all(&root).unwrap();
        let target = root.join("action.json");
        for after_sync in [false, true] {
            let result = publish_immutable_with(&target, b"payload", |file, bytes| {
                file.write_all(bytes)?;
                if after_sync {
                    file.sync_all()?;
                }
                Err(io::Error::other("simulated publication failure"))
            });
            assert_eq!(
                result.unwrap_err().to_string(),
                "simulated publication failure"
            );
            assert!(!target.exists());
            assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn temporary_collision_does_not_remove_other_writers_file() {
        let (root, _) = roots("temporary-collision");
        fs::create_dir_all(&root).unwrap();
        let target = root.join("action.json");
        let temporary = root.join("action.tmp-existing");
        fs::write(&temporary, b"other writer").unwrap();
        let result = publish_immutable_with_temporary(&target, &temporary, b"payload", |_, _| {
            panic!("collision must not invoke writer")
        });
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read(&temporary).unwrap(), b"other writer");
        assert!(!target.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
