//! Machine-scope DPAPI for the sandbox account password. Machine scope means any local process can
//! decrypt the blob, so the file's DACL (SYSTEM, Administrators, the `--for-user` person) is the guard.

use std::ffi::c_void;

use windows_sys::Win32::Security::Cryptography::{
    CRYPT_INTEGER_BLOB, CRYPTPROTECT_LOCAL_MACHINE, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
};

use super::util::{Local, Result, check, wide, wipe};

fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
    CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
}

fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
    let _free = Local(out.pbData as *mut c_void);
    let bytes = unsafe { std::slice::from_raw_parts_mut(out.pbData, out.cbData as usize) };
    let copy = bytes.to_vec();
    wipe(bytes);
    copy
}

pub fn protect(secret: &[u8]) -> Result<Vec<u8>> {
    let input = blob(secret);
    let description = wide("Tau sandbox account");
    let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    check(
        unsafe {
            CryptProtectData(
                &input,
                description.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN | CRYPTPROTECT_LOCAL_MACHINE,
                &mut out,
            )
        },
        "CryptProtectData",
    )?;
    Ok(take(out))
}

/// The plaintext; the caller wipes it after use.
pub fn unprotect(blob_bytes: &[u8]) -> Result<Vec<u8>> {
    let input = blob(blob_bytes);
    let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    check(
        unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        },
        "CryptUnprotectData",
    )?;
    Ok(take(out))
}
