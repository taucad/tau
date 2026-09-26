#![cfg(target_os = "macos")]

use geospec_engine_native_occt::{
    configure_thread_pool_width, BrepEntity, BrepSubject, Document, TessellationProfile,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    mem::{size_of, MaybeUninit},
    ptr,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Barrier,
    },
};

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

fn occurrence(document: &Document, name: &str) -> BrepEntity {
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
fn should_keep_dedicated_inner_operations_bounded_and_byte_identical() {
    if std::thread::available_parallelism().unwrap().get() < 2 {
        return;
    }
    let before_pool = thread_times();
    assert_eq!(configure_thread_pool_width(2).unwrap(), 2);
    let warm = Document::from_step(include_bytes!("fixtures/regular-solid-controls.step")).unwrap();
    let (subject, target) = (occurrence(&warm, "protruding"), occurrence(&warm, "target"));
    // SAFETY: this single GeoSpec test binary owns its static OCCT closure and
    // the caller-inclusive two-CPU pool throughout the test.
    assert!(
        unsafe { warm.regular_solid_containment_dedicated(subject, target, 2) }
            .unwrap()
            .1
    );
    let after_warm = thread_times();
    let workers = after_warm
        .keys()
        .filter(|id| !before_pool.contains_key(id))
        .copied()
        .collect::<Vec<_>>();
    assert_eq!(workers.len(), 1);
    let worker_id = workers[0];

    let mesh_input = include_bytes!("fixtures/nist-pmi-bspline.step");
    let mesh_serial = Document::from_step(mesh_input).unwrap();
    let mesh_parallel = Document::from_step(mesh_input).unwrap();
    let profile = TessellationProfile {
        linear_deflection_mm: 0.1,
        angular_deflection_rad: 0.5,
    };
    let expected_mesh = BrepSubject::tessellate(&mesh_serial, BrepEntity::Whole, profile).unwrap();
    let expected_mesh_bytes = mesh_bytes(&expected_mesh);
    let meshes = measured("mesh", worker_id, || {
        (0..3)
            .map(|_| unsafe { mesh_parallel.tessellate_dedicated(BrepEntity::Whole, profile, 2) })
            .collect::<Result<Vec<_>, _>>()
    })
    .unwrap();
    for (mesh, parallel) in meshes {
        assert!(parallel);
        assert_eq!(mesh.as_ref(), expected_mesh.as_ref());
        assert_eq!(mesh_bytes(&mesh), expected_mesh_bytes);
    }
    eprintln!("inner-op=mesh exact-bytes={}", expected_mesh_bytes.len());

    let regular_input = include_bytes!("fixtures/regular-solid-controls.step");
    let cut_serial = Document::from_step(regular_input).unwrap();
    let cut_parallel = Document::from_step(regular_input).unwrap();
    let serial_subject = occurrence(&cut_serial, "protruding");
    let serial_target = occurrence(&cut_serial, "target");
    let parallel_subject = occurrence(&cut_parallel, "protruding");
    let parallel_target = occurrence(&cut_parallel, "target");
    let expected_cut = cut_serial
        .regular_solid_containment(serial_subject, serial_target)
        .unwrap();
    let expected_cut_bytes = serde_json::to_vec(&expected_cut).unwrap();
    let cuts = measured("cut", worker_id, || {
        (0..24)
            .map(|_| unsafe {
                cut_parallel.regular_solid_containment_dedicated(
                    parallel_subject,
                    parallel_target,
                    2,
                )
            })
            .collect::<Result<Vec<_>, _>>()
    })
    .unwrap();
    for (value, parallel) in cuts {
        assert!(parallel);
        assert_eq!(value, expected_cut);
        assert_eq!(serde_json::to_vec(&value).unwrap(), expected_cut_bytes);
    }
    eprintln!("inner-op=cut exact-fact-bytes={}", expected_cut_bytes.len());

    // The obstructed bore is the one whose clearance only the Common decides.
    let bore_input = include_bytes!("fixtures/circular-bores/08-obstructed-through.step");
    let bore_serial = Document::from_step(bore_input).unwrap();
    let bore_parallel = Document::from_step(bore_input).unwrap();
    let expected_bores = bore_serial.circular_bores(16).unwrap();
    assert!(!expected_bores.candidates.is_empty());
    let expected_bore_bytes = format!("{expected_bores:?}").into_bytes();
    let bores = measured("bore-common", worker_id, || {
        (0..24)
            .map(|_| unsafe { bore_parallel.circular_bores_dedicated(16, 2) })
            .collect::<Result<Vec<_>, _>>()
    })
    .unwrap();
    for (value, parallel) in bores {
        assert!(parallel);
        assert_eq!(value, expected_bores);
        assert_eq!(format!("{value:?}").into_bytes(), expected_bore_bytes);
    }
    eprintln!(
        "inner-op=bore-common exact-fact-bytes={}",
        expected_bore_bytes.len()
    );

    assert!(unsafe { mesh_parallel.tessellate_dedicated(BrepEntity::Whole, profile, 0) }.is_err());
    assert!(unsafe {
        cut_parallel.regular_solid_containment_dedicated(parallel_subject, parallel_target, 3)
    }
    .is_err());
    assert!(unsafe {
        cut_parallel.regular_solid_containment_dedicated(
            BrepEntity::Occurrence(u32::MAX),
            parallel_target,
            2,
        )
    }
    .is_err());
    assert!(unsafe { bore_parallel.circular_bores_dedicated(0, 2) }.is_err());
    assert_eq!(bore_parallel.circular_bores(16).unwrap(), expected_bores);
}
