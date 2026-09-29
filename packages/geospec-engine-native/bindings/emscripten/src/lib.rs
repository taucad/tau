//! Synchronous wasm32 C ABI for the configured GeoSpec native engine.

use std::{cell::RefCell, collections::BTreeMap, mem::MaybeUninit};

use geospec_engine_native_core::canonicalize as core_canonicalize;
use geospec_engine_native_runtime::{create_engine, Engine, EngineConfig, ProtocolError};

#[derive(Debug)]
struct Failure {
    code: Vec<u8>,
    message: Vec<u8>,
}

impl From<ProtocolError> for Failure {
    fn from(error: ProtocolError) -> Self {
        Self {
            code: error.code().as_bytes().to_vec(),
            message: error.to_string().into_bytes(),
        }
    }
}

#[derive(Debug)]
struct AbiResult(Result<Vec<u8>, Failure>);

#[derive(Debug)]
struct Arena<T> {
    next: u32,
    entries: BTreeMap<u32, T>,
}

impl<T> Arena<T> {
    fn new() -> Self {
        Self {
            next: 1,
            entries: BTreeMap::new(),
        }
    }

    fn insert(&mut self, value: T) -> Option<u32> {
        let handle = (self.next != 0).then_some(self.next)?;
        self.next = handle.checked_add(1).unwrap_or(0);
        self.entries.insert(handle, value);
        Some(handle)
    }

    fn get(&self, handle: u32) -> Option<&T> {
        self.entries.get(&handle)
    }

    fn get_mut(&mut self, handle: u32) -> Option<&mut T> {
        self.entries.get_mut(&handle)
    }

    fn remove(&mut self, handle: u32) -> Option<T> {
        self.entries.remove(&handle)
    }
}

/// Registered input regions, uninitialized until the private JS caller writes every
/// byte (`copyInput`, the resource table). Engine calls read an input only after
/// that write; `geospec_engine_native_input_free` drops a region without reading it.
#[derive(Debug)]
struct InputAllocations {
    entries: BTreeMap<u32, Box<[MaybeUninit<u8>]>>,
}

impl InputAllocations {
    fn new() -> Self {
        Self {
            entries: BTreeMap::new(),
        }
    }

    fn allocate(&mut self, length: u32) -> Option<u32> {
        let mut bytes = Box::<[u8]>::new_uninit_slice(length as usize);
        let pointer = u32::try_from(bytes.as_mut_ptr() as usize).ok()?;
        if pointer == 0 || self.entries.contains_key(&pointer) {
            return None;
        }
        self.entries.insert(pointer, bytes);
        Some(pointer)
    }

    fn get(&self, pointer: u32, length: u32) -> Option<&[u8]> {
        match (pointer, length) {
            (0, 0) => Some(&[]),
            (0, _) => None,
            _ => {
                let bytes = self.entries.get(&pointer)?;
                if bytes.len() == length as usize {
                    // SAFETY: the ABI caller wrote all `length` bytes before this engine call.
                    Some(unsafe {
                        std::slice::from_raw_parts(bytes.as_ptr().cast::<u8>(), bytes.len())
                    })
                } else {
                    None
                }
            }
        }
    }

    fn take(&mut self, pointer: u32, length: u32) -> Option<Box<[MaybeUninit<u8>]>> {
        match (pointer, length) {
            (0, 0) => Some(Box::new_uninit_slice(0)),
            (0, _) => None,
            _ => {
                if self.entries.get(&pointer)?.len() != length as usize {
                    return None;
                }
                self.entries.remove(&pointer)
            }
        }
    }
}

thread_local! {
    // Handles crossing the ABI are checked one-based arena indices. The arenas
    // stay thread-local because the configured engine is single-thread confined.
    static ENGINES: RefCell<Arena<Engine>> = RefCell::new(Arena::new());
    static RESULTS: RefCell<Arena<AbiResult>> = RefCell::new(Arena::new());
    // Pointers are accepted only while their exact Rust-owned allocation is
    // registered here. Private callers cannot transfer arbitrary malloc memory.
    static INPUTS: RefCell<InputAllocations> = RefCell::new(InputAllocations::new());
}

#[derive(Clone, Copy)]
struct InputBuffer {
    pointer: u32,
    length: u32,
}

fn result(value: Result<Vec<u8>, ProtocolError>) -> u32 {
    result_handle(AbiResult(value.map_err(Failure::from)))
}

fn failure(code: &str, message: &str) -> u32 {
    result_handle(AbiResult(Err(Failure {
        code: code.as_bytes().to_vec(),
        message: message.as_bytes().to_vec(),
    })))
}

fn result_handle(value: AbiResult) -> u32 {
    RESULTS.with(|results| results.borrow_mut().insert(value).unwrap_or(0))
}

fn with_input<R>(pointer: u32, length: u32, operation: impl FnOnce(&[u8]) -> R) -> Option<R> {
    INPUTS.with(|inputs| {
        let inputs = inputs.borrow();
        Some(operation(inputs.get(pointer, length)?))
    })
}

fn adopt(pointer: u32, length: u32) -> Option<Vec<u8>> {
    let bytes = INPUTS.with(|inputs| inputs.borrow_mut().take(pointer, length))?;
    // SAFETY: the ABI caller wrote all `length` bytes before transferring the input.
    Some(unsafe { bytes.assume_init() }.into_vec())
}

fn input_table(pointer: u32, count: u32) -> Option<Vec<InputBuffer>> {
    let byte_length = count.checked_mul(8)?;
    with_input(pointer, byte_length, |bytes| {
        bytes
            .chunks_exact(8)
            .map(|entry| InputBuffer {
                pointer: u32::from_le_bytes(entry[0..4].try_into().expect("exact chunk")),
                length: u32::from_le_bytes(entry[4..8].try_into().expect("exact chunk")),
            })
            .collect()
    })
}

fn adopt_inputs(descriptors: Option<&[InputBuffer]>) -> Option<Vec<Vec<u8>>> {
    let descriptors = descriptors?;
    let mut inputs = Vec::with_capacity(descriptors.len());
    let mut valid = true;
    for descriptor in descriptors {
        match adopt(descriptor.pointer, descriptor.length) {
            Some(input) => inputs.push(input),
            None => valid = false,
        }
    }
    valid.then_some(inputs)
}

fn invoke_engine(
    engine: u32,
    input: u32,
    input_length: u32,
    operation: impl FnOnce(&Engine, &[u8]) -> Result<Vec<u8>, ProtocolError>,
) -> u32 {
    with_input(input, input_length, |input| {
        ENGINES.with(|engines| {
            let engines = engines.borrow();
            let Some(engine) = engines.get(engine) else {
                return failure("invalid-request", "GeoSpec engine handle is missing.");
            };
            result(operation(engine, input))
        })
    })
    .unwrap_or_else(|| {
        failure(
            "invalid-request",
            "GeoSpec control input allocation is missing.",
        )
    })
}

/// Allocate one exact-length Rust-owned binary input region.
#[no_mangle]
pub extern "C" fn geospec_engine_native_input_alloc(length: u32) -> u32 {
    if length == 0 {
        return 0;
    }
    INPUTS.with(|inputs| inputs.borrow_mut().allocate(length).unwrap_or(0))
}

/// Release an allocated input that was not transferred to an ingest call.
///
/// The private caller must return the exact registered pointer and length from
/// `geospec_engine_native_input_alloc` exactly once. Unknown pairs are ignored.
#[no_mangle]
pub extern "C" fn geospec_engine_native_input_free(pointer: u32, length: u32) {
    INPUTS.with(|inputs| drop(inputs.borrow_mut().take(pointer, length)));
}

/// Create the configured OCCT + Rust Manifold engine.
#[no_mangle]
pub extern "C" fn geospec_engine_native_engine_new() -> u32 {
    geospec_engine_native_engine_new_with_execution_permits(1)
}

/// Create an engine with a validated caller-inclusive allocation. No inner MT is enabled.
/// Zero reports invalid configuration without allocating an engine handle.
#[no_mangle]
pub extern "C" fn geospec_engine_native_engine_new_with_execution_permits(permits: u32) -> u32 {
    let Ok(config) = EngineConfig::entry().with_execution_permits(f64::from(permits)) else {
        return 0;
    };
    let Ok(engine) = create_engine(config) else {
        return 0;
    };
    ENGINES.with(|engines| engines.borrow_mut().insert(engine).unwrap_or(0))
}

/// Drop one retained engine.
#[no_mangle]
pub extern "C" fn geospec_engine_native_engine_drop(engine: u32) {
    ENGINES.with(|engines| {
        let _ = engines.borrow_mut().remove(engine);
    });
}

/// Canonicalize one borrowed control buffer.
#[no_mangle]
pub extern "C" fn geospec_engine_native_canonicalize(input: u32, input_length: u32) -> u32 {
    with_input(input, input_length, |input| {
        result(core_canonicalize(input))
    })
    .unwrap_or_else(|| {
        failure(
            "invalid-request",
            "GeoSpec control input allocation is missing.",
        )
    })
}

/// Non-mutating cumulative engine diagnostics. Snapshot copy traffic is excluded.
#[no_mangle]
pub extern "C" fn geospec_engine_native_observations(engine: u32) -> u32 {
    ENGINES.with(|engines| {
        let engines = engines.borrow();
        match engines.get(engine) {
            Some(engine) => result(Ok(engine.observations())),
            None => failure("invalid-request", "GeoSpec engine handle is missing."),
        }
    })
}

/// Admit one transferred legacy GSM1 buffer.
#[no_mangle]
pub extern "C" fn geospec_engine_native_ingest_mesh(
    engine: u32,
    request: u32,
    request_length: u32,
    mesh: u32,
    mesh_length: u32,
) -> u32 {
    let mesh = adopt(mesh, mesh_length);
    let Some(mesh) = mesh else {
        return failure(
            "invalid-request",
            "GeoSpec mesh input allocation is missing.",
        );
    };
    with_input(request, request_length, |request| {
        ENGINES.with(|engines| {
            let mut engines = engines.borrow_mut();
            let Some(engine) = engines.get_mut(engine) else {
                return failure("invalid-request", "GeoSpec engine handle is missing.");
            };
            result(engine.ingest_mesh(request, &mesh))
        })
    })
    .unwrap_or_else(|| {
        failure(
            "invalid-request",
            "GeoSpec control input allocation is missing.",
        )
    })
}

/// Admit transferred primary and ordered resource buffers.
#[no_mangle]
pub extern "C" fn geospec_engine_native_ingest_subject(
    engine: u32,
    request: u32,
    request_length: u32,
    primary: u32,
    primary_length: u32,
    resources: u32,
    resource_count: u32,
) -> u32 {
    let primary = adopt(primary, primary_length);
    let descriptors = input_table(resources, resource_count);
    let adopted = adopt_inputs(descriptors.as_deref());
    let (Some(primary), Some(resources)) = (primary, adopted) else {
        return failure(
            "invalid-request",
            "GeoSpec binary input allocation is missing.",
        );
    };
    with_input(request, request_length, |request| {
        ENGINES.with(|engines| {
            let mut engines = engines.borrow_mut();
            let Some(engine) = engines.get_mut(engine) else {
                return failure("invalid-request", "GeoSpec engine handle is missing.");
            };
            result(engine.ingest_subject(request, &primary, resources))
        })
    })
    .unwrap_or_else(|| {
        failure(
            "invalid-request",
            "GeoSpec control input allocation is missing.",
        )
    })
}

/// Acquire the stable owner/generation token for one admitted subject.
#[no_mangle]
pub extern "C" fn geospec_engine_native_subject_handle(
    engine: u32,
    request: u32,
    request_length: u32,
) -> u32 {
    invoke_engine(engine, request, request_length, Engine::subject_handle)
}

/// Release one generation-checked subject and its retained analysis.
#[no_mangle]
pub extern "C" fn geospec_engine_native_release_subject(
    engine: u32,
    request: u32,
    request_length: u32,
) -> u32 {
    with_input(request, request_length, |request| {
        ENGINES.with(|engines| {
            let mut engines = engines.borrow_mut();
            let Some(engine) = engines.get_mut(engine) else {
                return failure("invalid-request", "GeoSpec engine handle is missing.");
            };
            result(engine.release_subject(request))
        })
    })
    .unwrap_or_else(|| {
        failure(
            "invalid-request",
            "GeoSpec control input allocation is missing.",
        )
    })
}

/// Process one borrowed request through a retained engine.
#[no_mangle]
pub extern "C" fn geospec_engine_native_process_request(
    engine: u32,
    request: u32,
    request_length: u32,
) -> u32 {
    invoke_engine(engine, request, request_length, Engine::process_request)
}

/// Reserved ST binding control; never routed through the public GeoSpec parser.
#[no_mangle]
pub extern "C" fn geospec_engine_native_exact_cluster_candidate_control(
    engine: u32,
    request: u32,
    request_length: u32,
) -> u32 {
    invoke_engine(
        engine,
        request,
        request_length,
        Engine::process_exact_cluster_candidate_control,
    )
}

/// Normalize one borrowed request through a retained engine.
#[no_mangle]
pub extern "C" fn geospec_engine_native_canonical_plan(
    engine: u32,
    request: u32,
    request_length: u32,
) -> u32 {
    invoke_engine(engine, request, request_length, Engine::canonical_plan)
}

/// Evaluate one borrowed canonical plan through a retained engine.
#[no_mangle]
pub extern "C" fn geospec_engine_native_evaluate_plan(
    engine: u32,
    plan: u32,
    plan_length: u32,
) -> u32 {
    invoke_engine(engine, plan, plan_length, Engine::evaluate_plan)
}

/// Canonicalize and evaluate one borrowed one-claim request through a retained engine.
#[no_mangle]
pub extern "C" fn geospec_engine_native_evaluate_claim(
    engine: u32,
    request: u32,
    request_length: u32,
) -> u32 {
    invoke_engine(engine, request, request_length, Engine::evaluate_claim)
}

/// Return one when a result owns an error.
#[no_mangle]
pub extern "C" fn geospec_engine_native_result_is_error(result: u32) -> u32 {
    RESULTS.with(|results| {
        results
            .borrow()
            .get(result)
            .is_some_and(|result| result.0.is_err())
            .into()
    })
}

fn success_bytes(result: &AbiResult) -> Option<&[u8]> {
    result.0.as_ref().ok().map(Vec::as_slice)
}

fn failure_code(result: &AbiResult) -> Option<&[u8]> {
    result.0.as_ref().err().map(|error| error.code.as_slice())
}

fn failure_message(result: &AbiResult) -> Option<&[u8]> {
    result
        .0
        .as_ref()
        .err()
        .map(|error| error.message.as_slice())
}

fn result_length(result: u32, access: fn(&AbiResult) -> Option<&[u8]>) -> u32 {
    RESULTS.with(|results| {
        results
            .borrow()
            .get(result)
            .and_then(access)
            .and_then(|bytes| u32::try_from(bytes.len()).ok())
            .unwrap_or(0)
    })
}

/// Private synchronous wasm32 borrow, valid until the result is dropped.
/// The pointer does not transfer ownership and must never be freed as an input.
fn result_pointer(result: u32, access: fn(&AbiResult) -> Option<&[u8]>) -> u32 {
    RESULTS.with(|results| {
        results
            .borrow()
            .get(result)
            .and_then(access)
            .filter(|bytes| !bytes.is_empty())
            .and_then(|bytes| u32::try_from(bytes.as_ptr() as usize).ok())
            .unwrap_or(0)
    })
}

#[no_mangle]
pub extern "C" fn geospec_engine_native_result_length(result: u32) -> u32 {
    result_length(result, success_bytes)
}

#[no_mangle]
pub extern "C" fn geospec_engine_native_result_pointer(result: u32) -> u32 {
    result_pointer(result, success_bytes)
}

#[no_mangle]
pub extern "C" fn geospec_engine_native_result_code_length(result: u32) -> u32 {
    result_length(result, failure_code)
}

#[no_mangle]
pub extern "C" fn geospec_engine_native_result_code_pointer(result: u32) -> u32 {
    result_pointer(result, failure_code)
}

#[no_mangle]
pub extern "C" fn geospec_engine_native_result_message_length(result: u32) -> u32 {
    result_length(result, failure_message)
}

#[no_mangle]
pub extern "C" fn geospec_engine_native_result_message_pointer(result: u32) -> u32 {
    result_pointer(result, failure_message)
}

/// Drop one owned success/error result.
#[no_mangle]
pub extern "C" fn geospec_engine_native_result_drop(result: u32) {
    RESULTS.with(|results| {
        let _ = results.borrow_mut().remove(result);
    });
}
