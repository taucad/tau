//! A launch's executable pinned for its digest (README "Native workers"). `launch` opens the file once, sharing
//! read only, refuses a link anywhere on its path, hashes that very handle and keeps it open until the launch
//! ends. While it is open nobody can open the file for writing or deleting, rename it, or rename a folder above
//! it, so the image `CreateProcessAsUserW` maps by name is the one that was hashed.

use std::fs::File;
use std::io::{ErrorKind, Read};
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::os::windows::io::AsRawHandle;

use windows_sys::Win32::Foundation::{ERROR_SHARING_VIOLATION, NTSTATUS};
use windows_sys::Win32::Security::Cryptography::{
    BCRYPT_ALG_HANDLE, BCRYPT_HASH_HANDLE, BCRYPT_SHA256_ALGORITHM, BCryptCloseAlgorithmProvider, BCryptCreateHash,
    BCryptDestroyHash, BCryptFinishHash, BCryptHashData, BCryptOpenAlgorithmProvider,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_FLAG_OPEN_REPARSE_POINT, FILE_FLAG_SEQUENTIAL_SCAN, FILE_NAME_NORMALIZED, FILE_SHARE_READ,
    GetFinalPathNameByHandleW, VOLUME_NAME_DOS,
};

use crate::paths::{extended, same_final_path};
use crate::protocol::Refused;
use crate::spec::{format_digest, requirement};

const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

/// The open executable. Dropping it lets the file change again.
pub struct Pinned {
    _file: File,
}

fn executable(message: String) -> Refused {
    Refused::unsupported(requirement::EXECUTABLE, message)
}

/// Open `path` sharing read only, check it is the plain file it names, and require its SHA-256 to be `expected`.
pub fn pin(path: &str, expected: &[u8; 32]) -> Result<Pinned, Refused> {
    let file = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_SEQUENTIAL_SCAN)
        .open(extended(path))
        .map_err(|err| match err.kind() {
            ErrorKind::NotFound => executable(format!("the executable {path:?} does not exist")),
            _ if err.raw_os_error() == Some(ERROR_SHARING_VIOLATION as i32) => {
                executable(format!("the executable {path:?} is open for writing or deleting elsewhere"))
            }
            _ => executable(format!("the executable {path:?} cannot be opened: {err}")),
        })?;
    let metadata =
        file.metadata().map_err(|err| executable(format!("the executable {path:?} cannot be read: {err}")))?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 || !metadata.is_file() {
        return Err(executable(format!("the executable {path:?} must be a plain file, not a link")));
    }
    let final_path = final_path(&file).map_err(|err| executable(format!("{path:?}: {err}")))?;
    if !same_final_path(&final_path, path) {
        return Err(executable(format!(
            "the executable {path:?} resolves to {final_path:?}: its path must be resolved, with no link or junction"
        )));
    }
    let actual = sha256(&file).map_err(|err| executable(format!("the executable {path:?} cannot be hashed: {err}")))?;
    if &actual != expected {
        return Err(Refused::unsupported(
            requirement::EXECUTABLE_DIGEST,
            format!(
                "the executable {path:?} is {}, not the {} the launch names",
                format_digest(&actual),
                format_digest(expected)
            ),
        ));
    }
    Ok(Pinned { _file: file })
}

fn final_path(file: &File) -> Result<String, String> {
    let mut buffer = vec![0u16; 1024];
    loop {
        let length = unsafe {
            GetFinalPathNameByHandleW(
                file.as_raw_handle(),
                buffer.as_mut_ptr(),
                buffer.len() as u32,
                FILE_NAME_NORMALIZED | VOLUME_NAME_DOS,
            )
        } as usize;
        if length == 0 {
            return Err(format!("GetFinalPathNameByHandleW failed: {}", std::io::Error::last_os_error()));
        }
        if length < buffer.len() {
            return Ok(String::from_utf16_lossy(&buffer[..length]));
        }
        buffer.resize(length + 1, 0);
    }
}

struct Algorithm(BCRYPT_ALG_HANDLE);

impl Drop for Algorithm {
    fn drop(&mut self) {
        unsafe { BCryptCloseAlgorithmProvider(self.0, 0) };
    }
}

struct Hash(BCRYPT_HASH_HANDLE);

impl Drop for Hash {
    fn drop(&mut self) {
        unsafe { BCryptDestroyHash(self.0) };
    }
}

fn status(status: NTSTATUS, what: &str) -> Result<(), String> {
    if status < 0 { Err(format!("{what} failed with NTSTATUS {:#010x}", status as u32)) } else { Ok(()) }
}

/// SHA-256 of everything read from `file` (Windows CNG).
fn sha256(mut file: &File) -> Result<[u8; 32], String> {
    let mut algorithm: BCRYPT_ALG_HANDLE = std::ptr::null_mut();
    status(
        unsafe { BCryptOpenAlgorithmProvider(&mut algorithm, BCRYPT_SHA256_ALGORITHM, std::ptr::null(), 0) },
        "BCryptOpenAlgorithmProvider(SHA256)",
    )?;
    let algorithm = Algorithm(algorithm);
    let mut hash: BCRYPT_HASH_HANDLE = std::ptr::null_mut();
    status(
        unsafe { BCryptCreateHash(algorithm.0, &mut hash, std::ptr::null_mut(), 0, std::ptr::null(), 0, 0) },
        "BCryptCreateHash",
    )?;
    let hash = Hash(hash);
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let read = file.read(&mut buffer).map_err(|err| err.to_string())?;
        if read == 0 {
            break;
        }
        status(unsafe { BCryptHashData(hash.0, buffer.as_ptr(), read as u32, 0) }, "BCryptHashData")?;
    }
    let mut digest = [0u8; 32];
    status(unsafe { BCryptFinishHash(hash.0, digest.as_mut_ptr(), digest.len() as u32, 0) }, "BCryptFinishHash")?;
    Ok(digest)
}
