#![cfg(target_os = "macos")]

use geospec_engine_native_core::backend::{csg::*, BackendError, TriangleMesh};
use geospec_engine_native_core::{Engine, EngineConfig};
use geospec_engine_native_occt::{
    BrepConnector, BrepEntity, BrepSubject, OcctConnector, ParallelOcctConnector,
    TessellationProfile,
};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    mem::{size_of, MaybeUninit},
    ptr,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Barrier,
    },
};

struct NoCsg;
impl CsgConnector for NoCsg {
    fn release(&mut self, _: SolidId) -> Result<(), BackendError> {
        panic!("unexpected CSG")
    }
    fn admit(&mut self, _: &TriangleMesh, _: &[[u32; 2]]) -> Result<SolidId, BackendError> {
        panic!("unexpected CSG")
    }
    fn boolean(&mut self, _: BooleanOp, _: &[SolidId]) -> Result<SolidId, BackendError> {
        panic!("unexpected CSG")
    }
    fn transform(&mut self, _: SolidId, _: [f64; 12]) -> Result<SolidId, BackendError> {
        panic!("unexpected CSG")
    }
    fn decompose(&mut self, _: SolidId) -> Result<Vec<SolidId>, BackendError> {
        panic!("unexpected CSG")
    }
    fn properties(&self, _: SolidId) -> Result<SolidProperties, BackendError> {
        panic!("unexpected CSG")
    }
    fn export(&self, _: SolidId) -> Result<MeshExport, BackendError> {
        panic!("unexpected CSG")
    }
    fn slice(&self, _: SolidId, _: f64) -> Result<Section, BackendError> {
        panic!("unexpected CSG")
    }
    fn section(&self, _: &[Vec<[f64; 2]>], _: FillRule) -> Result<Section, BackendError> {
        panic!("unexpected CSG")
    }
    fn section_boolean(
        &self,
        _: SectionOp,
        _: &Section,
        _: &Section,
    ) -> Result<Section, BackendError> {
        panic!("unexpected CSG")
    }
}

#[repr(C)]
#[derive(Clone, Copy)]
struct TimeValue {
    seconds: i32,
    microseconds: i32,
}

#[repr(C)]
struct ThreadBasicInfo {
    user: TimeValue,
    system: TimeValue,
    cpu_usage: i32,
    policy: i32,
    run_state: i32,
    flags: i32,
    suspend_count: i32,
    sleep_time: i32,
}

#[repr(C)]
struct ThreadIdentifierInfo {
    id: u64,
    handle: u64,
    dispatch_queue: u64,
}

unsafe extern "C" {
    static mach_task_self_: u32;
    fn task_threads(task: u32, list: *mut *mut u32, count: *mut u32) -> i32;
    fn thread_info(thread: u32, flavor: i32, info: *mut i32, count: *mut u32) -> i32;
    fn mach_port_deallocate(task: u32, port: u32) -> i32;
    fn vm_deallocate(task: u32, address: usize, size: usize) -> i32;
    fn pthread_threadid_np(thread: *mut std::ffi::c_void, id: *mut u64) -> i32;
}

fn current_thread_id() -> u64 {
    let mut id = 0;
    assert_eq!(unsafe { pthread_threadid_np(ptr::null_mut(), &mut id) }, 0);
    id
}

fn thread_times() -> BTreeMap<u64, u64> {
    let task = unsafe { mach_task_self_ };
    let mut list = ptr::null_mut();
    let mut count = 0;
    assert_eq!(unsafe { task_threads(task, &mut list, &mut count) }, 0);
    let mut times = BTreeMap::new();
    for &port in unsafe { std::slice::from_raw_parts(list, count as usize) } {
        let mut identity = MaybeUninit::<ThreadIdentifierInfo>::uninit();
        let mut identity_count = (size_of::<ThreadIdentifierInfo>() / size_of::<i32>()) as u32;
        let identity_status =
            unsafe { thread_info(port, 4, identity.as_mut_ptr().cast(), &mut identity_count) };
        let mut basic = MaybeUninit::<ThreadBasicInfo>::uninit();
        let mut basic_count = (size_of::<ThreadBasicInfo>() / size_of::<i32>()) as u32;
        let basic_status =
            unsafe { thread_info(port, 3, basic.as_mut_ptr().cast(), &mut basic_count) };
        assert_eq!(unsafe { mach_port_deallocate(task, port) }, 0);
        if identity_status == 0 && basic_status == 0 {
            let identity = unsafe { identity.assume_init() };
            let basic = unsafe { basic.assume_init() };
            let micros =
                |value: TimeValue| value.seconds as u64 * 1_000_000 + value.microseconds as u64;
            times.insert(identity.id, micros(basic.user) + micros(basic.system));
        }
    }
    assert_eq!(
        unsafe { vm_deallocate(task, list as usize, count as usize * size_of::<u32>()) },
        0
    );
    times
}

fn occurrence(document: &dyn BrepSubject, name: &str) -> BrepEntity {
    let facts = document.facts().unwrap();
    let index = facts
        .occurrences
        .iter()
        .position(|row| {
            row.name == name
                || row.product_name == name
                || row.instance_name.as_deref() == Some(name)
                || row.path == name
        })
        .unwrap();
    BrepEntity::Occurrence(index as u32)
}

fn mesh_bytes(mesh: &geospec_engine_native_core::backend::TriangleMesh) -> Vec<u8> {
    let mut bytes = Vec::new();
    for point in &mesh.positions {
        for coordinate in point {
            bytes.extend_from_slice(&coordinate.to_bits().to_le_bytes());
        }
    }
    for triangle in &mesh.triangles {
        for index in triangle {
            bytes.extend_from_slice(&index.to_le_bytes());
        }
    }
    bytes
}

fn measured<T>(name: &str, worker_id: u64, operation: impl FnOnce() -> T) -> T {
    let baseline = thread_times();
    assert!(baseline.contains_key(&worker_id));
    let caller_id = current_thread_id();
    let running = Arc::new(AtomicBool::new(true));
    let peak_threads = Arc::new(AtomicUsize::new(0));
    let peak_active = Arc::new(AtomicUsize::new(0));
    let ready = Arc::new(Barrier::new(2));
    let monitor = {
        let running = Arc::clone(&running);
        let peak_threads = Arc::clone(&peak_threads);
        let peak_active = Arc::clone(&peak_active);
        let ready = Arc::clone(&ready);
        std::thread::spawn(move || {
            let mut previous = thread_times();
            ready.wait();
            while running.load(Ordering::Relaxed) {
                let current = thread_times();
                peak_threads.fetch_max(current.len(), Ordering::Relaxed);
                let active = [caller_id, worker_id]
                    .into_iter()
                    .filter(|id| {
                        current.get(id).copied().unwrap_or(0)
                            > previous.get(id).copied().unwrap_or(0)
                    })
                    .count();
                peak_active.fetch_max(active, Ordering::Relaxed);
                previous = current;
                std::thread::yield_now();
            }
        })
    };
    ready.wait();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(operation));
    running.store(false, Ordering::Relaxed);
    monitor.join().unwrap();
    let after = thread_times();
    let active = BTreeSet::from([caller_id, worker_id])
        .into_iter()
        .filter(|id| after.get(id).copied().unwrap_or(0) > baseline.get(id).copied().unwrap_or(0))
        .collect::<Vec<_>>();
    eprintln!(
        "inner-op={name} caller-id={caller_id} worker-id={worker_id} active-ids={active:?} baseline-threads={} peak-threads={} peak-active={}",
        baseline.len(),
        peak_threads.load(Ordering::Relaxed),
        peak_active.load(Ordering::Relaxed)
    );
    assert!(
        peak_threads.load(Ordering::Relaxed) <= baseline.len() + 1,
        "{name} exceeded one caller, one worker, and one sampler"
    );
    assert_eq!(after.len(), baseline.len(), "{name} left extra threads");
    assert_eq!(active.len(), 2, "{name} needs actual caller and worker CPU");
    assert_eq!(
        peak_active.load(Ordering::Relaxed),
        2,
        "{name} needs concurrent caller/worker progress"
    );
    result.unwrap()
}

#[test]
fn connector_trait_dispatch_keeps_exact_facts_and_uses_the_bounded_worker() {
    if std::thread::available_parallelism().unwrap().get() < 2 {
        return;
    }
    // SAFETY: this single test binary owns the static OCCT closure, initializes
    // its pool before STEP, and reserves both CPUs through every query.
    let connector = unsafe { ParallelOcctConnector::new().unwrap() };
    let serial_connector = OcctConnector;
    assert_eq!(
        connector.identity_profile().ingest_profile,
        serial_connector.identity_profile().ingest_profile
    );

    let regular_input = include_bytes!("fixtures/regular-solid-controls.step");
    let admission_serial = serial_connector.open_step(regular_input).unwrap();
    let admission_parallel = connector.open_step(regular_input).unwrap();
    let before_admission = thread_times();
    let reused = admission_parallel.validity().unwrap();
    assert_eq!(reused, admission_serial.validity().unwrap());
    assert!(std::rc::Rc::ptr_eq(
        &reused,
        &admission_parallel.validity().unwrap()
    ));
    assert_eq!(
        thread_times().len(),
        before_admission.len(),
        "admission reuse must not start a worker"
    );

    let serial = serial_connector.open_step(regular_input).unwrap();
    let parallel = connector.open_step(regular_input).unwrap();
    let expected_cut = serial
        .regular_solid_containment(
            occurrence(serial.as_ref(), "protruding"),
            occurrence(serial.as_ref(), "target"),
        )
        .unwrap();
    let before_worker = thread_times();
    let warm_cut = parallel
        .regular_solid_containment(
            occurrence(parallel.as_ref(), "protruding"),
            occurrence(parallel.as_ref(), "target"),
        )
        .unwrap();
    assert_eq!(warm_cut, expected_cut);
    let after_worker = thread_times();
    let workers = after_worker
        .keys()
        .filter(|id| !before_worker.contains_key(id))
        .copied()
        .collect::<Vec<_>>();
    assert_eq!(workers.len(), 1, "one OCCT worker must start lazily");
    let worker_id = workers[0];

    let serial_validity = serial.validity().unwrap();
    let parallel_validity = parallel.validity().unwrap();
    assert_eq!(parallel_validity, serial_validity);
    let validity_bytes = format!("{serial_validity:?}").into_bytes();
    assert_eq!(
        format!("{parallel_validity:?}").into_bytes(),
        validity_bytes
    );
    assert!(std::rc::Rc::ptr_eq(
        &parallel_validity,
        &parallel.validity().unwrap()
    ));

    let mesh_input = include_bytes!("fixtures/nist-pmi-bspline.step");
    let serial_mesh = serial_connector.open_step(mesh_input).unwrap();
    let parallel_mesh = connector.open_step(mesh_input).unwrap();
    let profile = TessellationProfile {
        linear_deflection_mm: 0.1,
        angular_deflection_rad: 0.5,
    };
    let expected_mesh = serial_mesh.tessellate(BrepEntity::Whole, profile).unwrap();
    let mesh = measured("adapter-mesh", worker_id, || {
        parallel_mesh
            .tessellate(BrepEntity::Whole, profile)
            .unwrap()
    });
    assert_eq!(mesh_bytes(&mesh), mesh_bytes(&expected_mesh));
    eprintln!("adapter-mesh bytes={}", mesh_bytes(&mesh).len());

    let serial_cut = serial_connector.open_step(regular_input).unwrap();
    let parallel_cut = connector.open_step(regular_input).unwrap();
    let serial_subject = occurrence(serial_cut.as_ref(), "protruding");
    let serial_target = occurrence(serial_cut.as_ref(), "target");
    let parallel_subject = occurrence(parallel_cut.as_ref(), "protruding");
    let parallel_target = occurrence(parallel_cut.as_ref(), "target");
    let expected_cut = serial_cut
        .regular_solid_containment(serial_subject, serial_target)
        .unwrap();
    let cuts = measured("adapter-cut", worker_id, || {
        (0..24)
            .map(|_| parallel_cut.regular_solid_containment(parallel_subject, parallel_target))
            .collect::<Result<Vec<_>, _>>()
    })
    .unwrap();
    for value in cuts {
        assert_eq!(
            serde_json::to_vec(&value).unwrap(),
            serde_json::to_vec(&expected_cut).unwrap()
        );
    }

    // The obstructed bore is the one whose clearance only the Common decides.
    let bore_input = include_bytes!("fixtures/circular-bores/08-obstructed-through.step");
    let serial_bore = serial_connector.open_step(bore_input).unwrap();
    let parallel_bore = connector.open_step(bore_input).unwrap();
    let expected_bores = serial_bore.circular_bores(16).unwrap();
    let bores = measured("adapter-bore-common", worker_id, || {
        (0..24)
            .map(|_| parallel_bore.circular_bores(16))
            .collect::<Result<Vec<_>, _>>()
    })
    .unwrap();
    for value in bores {
        assert_eq!(value, expected_bores);
        assert_eq!(
            format!("{value:?}").as_bytes(),
            format!("{expected_bores:?}").as_bytes()
        );
    }

    assert!(parallel_bore.circular_bores(0).is_err());
    assert_eq!(parallel_bore.circular_bores(16).unwrap(), expected_bores);

    let mut engine =
        Engine::with_backends(EngineConfig::entry(), Box::new(connector), Box::new(NoCsg));
    let request = serde_json::to_vec(&json!({
        "method": "ingestSubject", "requestId": "parallel-adapter",
        "protocolVersion": 3, "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1", "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": {}, "primaryByteLength": regular_input.len(), "resources": []
    }))
    .unwrap();
    let admission: Value = serde_json::from_slice(
        &engine
            .ingest_subject(&request, regular_input.to_vec(), vec![])
            .unwrap(),
    )
    .unwrap();
    assert_eq!(admission["requestId"], "parallel-adapter");
    assert_eq!(admission["result"]["subject"]["format"], "step");
}
