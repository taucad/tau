//! Give the suspended shell exactly the environment its launch named.
//!
//! For a registered AppContainer, `CreateProcess` rewrites the environment block it is given: `LOCALAPPDATA`
//! becomes `<LOCALAPPDATA>\Packages\<package name>\AC` and `TEMP` and `TMP` become `…\AC\Temp` (WIN-X64 run
//! 44019164917). Those folders sit inside whatever root held the given `LOCALAPPDATA`, often a readable-only one,
//! and usually do not exist, while the given `TEMP` is a granted, journaled, writable location. PowerShell needs
//! a writable `TEMP` (Windows PowerShell 5.1 probes it for its script policy, `Add-Type` compiles there), so the
//! launch's environment is the contract and Windows' rewrite is undone.
//!
//! `CreateProcess` builds the block in the new process's parameters before the first instruction runs, and the
//! shell is still suspended here. The runner reads the block back through the process parameters
//! (`PEB.ProcessParameters`, `RTL_USER_PROCESS_PARAMETERS.Environment` and `.EnvironmentSize`, the layout every
//! 64-bit Windows since Vista uses and Windows' own debuggers read), and when any variable differs from the
//! launch's, writes the launch's own block into fresh memory of the shell's process and points the parameters
//! at it. Nothing is written unless the block read back parses and its parameters are large enough to hold both
//! fields; the result is read back and compared. Any failure refuses the launch.

use std::collections::BTreeMap;
use std::ffi::c_void;

use windows_sys::Win32::Foundation::{HANDLE, NTSTATUS};
use windows_sys::Win32::System::Diagnostics::Debug::{ReadProcessMemory, WriteProcessMemory};
use windows_sys::Win32::System::Memory::{MEM_COMMIT, MEM_RESERVE, PAGE_READWRITE, VirtualAllocEx};

use super::util::{Error, Result};
use crate::cmdline::{changed_environment_names, environment_block, parse_environment_block};

const _: () = assert!(size_of::<usize>() == 8, "the process-parameter offsets below are the 64-bit layout");

/// `PEB.ProcessParameters`.
const PEB_PROCESS_PARAMETERS: usize = 0x20;
/// `RTL_USER_PROCESS_PARAMETERS.MaximumLength`.
const PARAMETERS_MAXIMUM_LENGTH: usize = 0x00;
/// `RTL_USER_PROCESS_PARAMETERS.Environment`.
const PARAMETERS_ENVIRONMENT: usize = 0x80;
/// `RTL_USER_PROCESS_PARAMETERS.EnvironmentSize`, in bytes.
const PARAMETERS_ENVIRONMENT_SIZE: usize = 0x3F0;
/// Larger than any environment Windows accepts (32767 characters per variable, a few hundred variables).
const MAXIMUM_ENVIRONMENT_BYTES: usize = 4 << 20;

#[repr(C)]
struct ProcessBasicInformation {
    exit_status: NTSTATUS,
    peb: *mut c_void,
    affinity_mask: usize,
    base_priority: i32,
    unique_process_id: usize,
    inherited_from_unique_process_id: usize,
}

#[link(name = "ntdll", kind = "raw-dylib")]
unsafe extern "system" {
    fn NtQueryInformationProcess(
        process: HANDLE,
        class: u32,
        information: *mut c_void,
        length: u32,
        returned: *mut u32,
    ) -> NTSTATUS;
}

fn read<T: Copy + Default>(process: HANDLE, address: usize, what: &str) -> Result<T> {
    let mut value = T::default();
    let mut done = 0usize;
    let ok = unsafe {
        ReadProcessMemory(
            process,
            address as *const c_void,
            &mut value as *mut T as *mut c_void,
            size_of::<T>(),
            &mut done,
        )
    };
    if ok == 0 || done != size_of::<T>() {
        return Err(Error::last(format!("ReadProcessMemory({what})")));
    }
    Ok(value)
}

fn read_units(process: HANDLE, address: usize, bytes: usize, what: &str) -> Result<Vec<u16>> {
    let mut units = vec![0u16; bytes / 2];
    let mut done = 0usize;
    let ok = unsafe {
        ReadProcessMemory(
            process,
            address as *const c_void,
            units.as_mut_ptr() as *mut c_void,
            units.len() * 2,
            &mut done,
        )
    };
    if ok == 0 || done != units.len() * 2 {
        return Err(Error::last(format!("ReadProcessMemory({what})")));
    }
    Ok(units)
}

fn write(process: HANDLE, address: usize, bytes: &[u8], what: &str) -> Result<()> {
    let mut done = 0usize;
    let ok = unsafe {
        WriteProcessMemory(process, address as *const c_void, bytes.as_ptr() as *const c_void, bytes.len(), &mut done)
    };
    if ok == 0 || done != bytes.len() {
        return Err(Error::last(format!("WriteProcessMemory({what})")));
    }
    Ok(())
}

/// The suspended process's environment block address, its size in bytes, and the parameters' address.
fn locate(process: HANDLE) -> Result<(usize, usize, usize)> {
    let mut info: ProcessBasicInformation = unsafe { std::mem::zeroed() };
    let status = unsafe {
        NtQueryInformationProcess(
            process,
            0, // ProcessBasicInformation
            &mut info as *mut _ as *mut c_void,
            size_of::<ProcessBasicInformation>() as u32,
            std::ptr::null_mut(),
        )
    };
    if status < 0 || info.peb.is_null() {
        return Err(Error::msg(format!("NtQueryInformationProcess(basic) (NTSTATUS {:#010x})", status as u32)));
    }
    let parameters: usize = read(process, info.peb as usize + PEB_PROCESS_PARAMETERS, "PEB.ProcessParameters")?;
    let maximum: u32 = read(process, parameters + PARAMETERS_MAXIMUM_LENGTH, "ProcessParameters.MaximumLength")?;
    if (maximum as usize) < PARAMETERS_ENVIRONMENT_SIZE + size_of::<usize>() {
        return Err(Error::msg(format!(
            "the shell's process parameters are {maximum} bytes, too small to hold its environment size"
        )));
    }
    let environment: usize = read(process, parameters + PARAMETERS_ENVIRONMENT, "ProcessParameters.Environment")?;
    let size: usize = read(process, parameters + PARAMETERS_ENVIRONMENT_SIZE, "ProcessParameters.EnvironmentSize")?;
    if environment == 0 || !(4..=MAXIMUM_ENVIRONMENT_BYTES).contains(&size) || !size.is_multiple_of(2) {
        return Err(Error::msg(format!(
            "the shell's environment block is implausible ({size} bytes at {environment:#x})"
        )));
    }
    Ok((environment, size, parameters))
}

fn read_block(process: HANDLE) -> Result<(Vec<(String, String)>, usize)> {
    let (environment, size, parameters) = locate(process)?;
    let units = read_units(process, environment, size, "the shell's environment")?;
    let entries =
        parse_environment_block(&units).ok_or_else(|| Error::msg("the shell's environment block does not parse"))?;
    Ok((entries, parameters))
}

/// Make the suspended `process` see exactly `given`. Returns a line for the runner's log naming (never
/// valuing) what Windows had changed.
pub fn enforce(process: HANDLE, given: &BTreeMap<String, String>) -> Result<String> {
    let (actual, parameters) = read_block(process)?;
    let changed = changed_environment_names(given, &actual);
    if changed.is_empty() {
        return Ok("environment: as given".to_owned());
    }
    let block = environment_block(given);
    let bytes: Vec<u8> = block.iter().flat_map(|unit| unit.to_le_bytes()).collect();
    let address =
        unsafe { VirtualAllocEx(process, std::ptr::null(), bytes.len(), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE) };
    if address.is_null() {
        return Err(Error::last("VirtualAllocEx(environment)"));
    }
    write(process, address as usize, &bytes, "the launch's environment")?;
    write(
        process,
        parameters + PARAMETERS_ENVIRONMENT_SIZE,
        &bytes.len().to_le_bytes(),
        "ProcessParameters.EnvironmentSize",
    )?;
    write(
        process,
        parameters + PARAMETERS_ENVIRONMENT,
        &(address as usize).to_le_bytes(),
        "ProcessParameters.Environment",
    )?;
    let (now, _) = read_block(process)?;
    let left = changed_environment_names(given, &now);
    if !left.is_empty() {
        return Err(Error::msg(format!("the shell's environment still differs after the rewrite: {}", left.join(","))));
    }
    Ok(format!("environment: restored what Windows changed ({})", changed.join(",")))
}
