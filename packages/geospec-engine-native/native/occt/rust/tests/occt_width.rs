#![cfg(target_os = "macos")]

use geospec_engine_native_occt::{
    configure_thread_pool_width, BrepConnector, BrepEntity, BrepSubject, ParallelOcctConnector,
    TessellationProfile,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    mem::{size_of, MaybeUninit},
    ptr,
    sync::{
        atomic::{AtomicBool, Ordering},
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

/// Samples threads until at most `expected` remain or one second passes: a joined
/// sampler's Mach thread can outlive `join` briefly, while a leaked worker outlives
/// the deadline and still fails the count.
fn settled_thread_times(expected: usize) -> BTreeMap<u64, u64> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1);
    loop {
        let times = thread_times();
        if times.len() <= expected || std::time::Instant::now() >= deadline {
            return times;
        }
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
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

#[derive(Clone, Copy, Debug)]
enum Operation {
    Mesh,
    ReportMesh,
    Cut,
    Bore,
}

struct Prepared {
    document: Box<dyn BrepSubject>,
    cut: Option<(BrepEntity, BrepEntity)>,
}

fn prepare(connector: &ParallelOcctConnector, operation: Operation) -> Vec<Prepared> {
    // A report mesh is built once per document, so each query needs its own.
    let count = match operation {
        Operation::ReportMesh => 3,
        _ => 1,
    };
    (0..count)
        .map(|_| {
            let input: &[u8] = match operation {
                Operation::Mesh | Operation::ReportMesh => {
                    include_bytes!("fixtures/nist-pmi-bspline.step")
                }
                // Only the obstructed bore's clearance still needs the Common.
                Operation::Bore => {
                    include_bytes!("fixtures/circular-bores/08-obstructed-through.step")
                }
                _ => include_bytes!("fixtures/regular-solid-controls.step"),
            };
            let document = connector.open_step(input).unwrap();
            let cut = matches!(operation, Operation::Cut).then(|| {
                (
                    occurrence(document.as_ref(), "protruding"),
                    occurrence(document.as_ref(), "target"),
                )
            });
            Prepared { document, cut }
        })
        .collect()
}

fn query(prepared: &Prepared, operation: Operation) -> Vec<u8> {
    let document = prepared.document.as_ref();
    match operation {
        Operation::Mesh => {
            let mesh = document
                .tessellate(
                    BrepEntity::Whole,
                    TessellationProfile {
                        linear_deflection_mm: 0.1,
                        angular_deflection_rad: 0.5,
                    },
                )
                .unwrap();
            mesh_bytes(&mesh)
        }
        Operation::ReportMesh => mesh_bytes(&document.reported_mesh().unwrap().unwrap()),
        Operation::Cut => {
            let (subject, target) = prepared.cut.unwrap();
            serde_json::to_vec(&document.regular_solid_containment(subject, target).unwrap())
                .unwrap()
        }
        Operation::Bore => format!("{:?}", document.circular_bores(16).unwrap()).into_bytes(),
    }
}

fn measured<T>(
    label: &str,
    grant_width: usize,
    workers: &BTreeSet<u64>,
    operation: impl FnOnce() -> T,
) -> T {
    let before = thread_times();
    let caller_id = current_thread_id();
    let running = Arc::new(AtomicBool::new(true));
    let ready = Arc::new(Barrier::new(2));
    let monitor = {
        let running = Arc::clone(&running);
        let ready = Arc::clone(&ready);
        let workers = workers.clone();
        std::thread::spawn(move || {
            let mut previous = thread_times();
            let mut peak_threads = 0;
            let mut peak_active = 0;
            let mut active_ids = BTreeSet::new();
            ready.wait();
            while running.load(Ordering::Relaxed) {
                let current = thread_times();
                peak_threads = peak_threads.max(current.len());
                let active = std::iter::once(caller_id)
                    .chain(workers.iter().copied())
                    .filter(|id| {
                        current.get(id).copied().unwrap_or(0)
                            > previous.get(id).copied().unwrap_or(0)
                    })
                    .collect::<Vec<_>>();
                peak_active = peak_active.max(active.len());
                active_ids.extend(active);
                previous = current;
                std::thread::yield_now();
            }
            (peak_threads, peak_active, active_ids)
        })
    };
    ready.wait();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(operation));
    running.store(false, Ordering::Relaxed);
    let (peak_threads, peak_active, sampled_ids) = monitor.join().unwrap();
    let after = settled_thread_times(before.len());
    let active_ids = std::iter::once(caller_id)
        .chain(workers.iter().copied())
        .filter(|id| after.get(id).copied().unwrap_or(0) > before.get(id).copied().unwrap_or(0))
        .collect::<BTreeSet<_>>();
    eprintln!(
        "width-op={label} grant={grant_width} caller={caller_id} active={active_ids:?} sampled={sampled_ids:?} threads={}/{peak_threads} peak-active={peak_active}",
        before.len()
    );
    assert!(
        peak_threads <= before.len() + 1,
        "{label}: only the sampler may start"
    );
    assert_eq!(after.len(), before.len(), "{label}: no worker leak");
    assert!(
        active_ids.contains(&caller_id),
        "{label}: caller must execute"
    );
    assert!(
        active_ids.len() <= grant_width,
        "{label}: worker activity exceeded grant"
    );
    assert!(
        sampled_ids.len() <= grant_width,
        "{label}: sampled workers exceeded grant"
    );
    assert!(
        peak_active <= grant_width,
        "{label}: concurrent activity exceeded grant"
    );
    if grant_width >= 2 {
        assert!(
            active_ids.len() >= 2,
            "{label}: parallel route had no active worker"
        );
    }
    result.unwrap()
}

#[test]
fn one_pool_bounds_width_one_two_four_and_preserves_exact_ordered_results() {
    if std::thread::available_parallelism().unwrap().get() < 4 {
        return;
    }
    // SAFETY: this single test binary owns the static OCCT closure, takes its
    // first-init cap before STEP, and holds an exclusive four-CPU permit.
    let serial = unsafe { ParallelOcctConnector::with_grant(1, 4).unwrap() };
    let two = unsafe { ParallelOcctConnector::with_grant(2, 4).unwrap() };
    let four = unsafe { ParallelOcctConnector::with_grant(4, 4).unwrap() };
    assert_eq!(configure_thread_pool_width(4).unwrap(), 4);

    let before_warm = thread_times();
    let warm = four
        .open_step(include_bytes!("fixtures/nist-pmi-bspline.step"))
        .unwrap();
    warm.tessellate(
        BrepEntity::Whole,
        TessellationProfile {
            linear_deflection_mm: 0.1,
            angular_deflection_rad: 0.5,
        },
    )
    .unwrap();
    let workers = thread_times()
        .keys()
        .filter(|id| !before_warm.contains_key(id))
        .copied()
        .collect::<BTreeSet<_>>();
    assert_eq!(
        workers.len(),
        3,
        "the capped pool must expose exactly three workers"
    );

    let profiles = [(1, &serial), (2, &two), (4, &four)];
    for operation in [
        Operation::Mesh,
        Operation::ReportMesh,
        Operation::Cut,
        Operation::Bore,
    ] {
        let mut baseline = None;
        for index in [0, 1, 2, 2, 1, 0] {
            let (width, connector) = profiles[index];
            let prepared = prepare(connector, operation);
            let count = match operation {
                Operation::ReportMesh => prepared.len(),
                Operation::Mesh => 3,
                _ => 24,
            };
            let bytes = if baseline.is_none() || index != 0 {
                measured(&format!("{operation:?}"), width, &workers, || {
                    (0..count)
                        .map(|iteration| query(&prepared[iteration % prepared.len()], operation))
                        .collect::<Vec<_>>()
                })
            } else {
                vec![query(&prepared[0], operation)]
            };
            assert!(!bytes[0].is_empty());
            for value in &bytes {
                assert_eq!(
                    value, &bytes[0],
                    "{operation:?} width {width} changed across repeats"
                );
            }
            match &baseline {
                Some(expected) => assert_eq!(
                    &bytes[0], expected,
                    "{operation:?} width {width} changed facts"
                ),
                None => baseline = Some(bytes[0].clone()),
            }
        }
        eprintln!(
            "width-op={operation:?} exact-bytes={}",
            baseline.unwrap().len()
        );
    }

    // SAFETY: this test still owns the closure; neither request may run at an
    // unsafe width, and validity still reuses the admission proof.
    assert!(unsafe { ParallelOcctConnector::with_grant(5, 4) }.is_err());
    assert!(configure_thread_pool_width(2).is_err());
    let direct = geospec_engine_native_occt::Document::from_step(include_bytes!(
        "fixtures/regular-solid-controls.step"
    ))
    .unwrap();
    assert!(unsafe {
        direct.regular_solid_containment_dedicated(
            BrepEntity::Occurrence(0),
            BrepEntity::Occurrence(1),
            5,
        )
    }
    .is_err());
    assert!(!unsafe { direct.validity_dedicated(4).unwrap().1 });
}
