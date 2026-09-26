#![cfg(target_os = "macos")]

use geospec_engine_native_occt::{configure_thread_pool_width, BrepSubject, Document};
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

#[test]
fn should_use_one_active_occt_worker_with_two_thread_grant_and_identical_validity_bytes() {
    if std::thread::available_parallelism().unwrap().get() < 2 {
        return;
    }
    assert_eq!(configure_thread_pool_width(2).unwrap(), 2);

    let bytes = include_bytes!("fixtures/regular-solid-controls.step");
    let document = Document::from_step(bytes).unwrap();
    assert!(document.facts().unwrap().occurrences.len() >= 2);
    document.common_volume(0, 1).unwrap(); // Invalidates admission validity.
    let serial = BrepSubject::validity(&document).unwrap();
    let serial_bytes = format!("{serial:?}").into_bytes();
    // SAFETY: the private closure is initialized and this call cannot launch
    // a worker with a caller-only grant.
    let (fallback, used_parallel) = unsafe { document.validity_dedicated(1).unwrap() };
    assert!(!used_parallel);
    assert_eq!(fallback, *serial);
    assert_eq!(format!("{fallback:?}").into_bytes(), serial_bytes);

    let before_validation = thread_times();
    let caller_id = current_thread_id();
    let running = Arc::new(AtomicBool::new(true));
    let peak_threads = Arc::new(AtomicUsize::new(0));
    let peak_active = Arc::new(AtomicUsize::new(0));
    let worker_id = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let ready = Arc::new(Barrier::new(2));
    let monitor = {
        let running = Arc::clone(&running);
        let peak_threads = Arc::clone(&peak_threads);
        let peak_active = Arc::clone(&peak_active);
        let worker_id = Arc::clone(&worker_id);
        let ready = Arc::clone(&ready);
        let baseline_ids = before_validation.keys().copied().collect::<BTreeSet<_>>();
        std::thread::spawn(move || {
            let monitor_id = current_thread_id();
            let mut previous = thread_times();
            ready.wait();
            while running.load(Ordering::Relaxed) {
                let current = thread_times();
                peak_threads.fetch_max(current.len(), Ordering::Relaxed);
                let workers = current
                    .keys()
                    .filter(|id| !baseline_ids.contains(id) && **id != monitor_id)
                    .copied()
                    .collect::<Vec<_>>();
                if let Some(&id) = workers.first() {
                    worker_id.store(id, Ordering::Relaxed);
                }
                let active = [caller_id, worker_id.load(Ordering::Relaxed)]
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
    // SAFETY: this test binary links one private OCCT closure, initializes its
    // pool before STEP, and runs one document operation with a two-CPU grant.
    let (parallel, used_parallel) = unsafe { document.validity_dedicated(2).unwrap() };
    running.store(false, Ordering::Relaxed);
    monitor.join().unwrap();
    let after_validation = thread_times();
    let worker_id = worker_id.load(Ordering::Relaxed);
    assert_ne!(worker_id, 0, "validation must start an OCCT worker");
    let new_threads = after_validation
        .keys()
        .filter(|id| !before_validation.contains_key(id))
        .copied()
        .collect::<Vec<_>>();
    assert_eq!(new_threads, [worker_id], "grant must create one worker");
    assert!(used_parallel, "the admission proof must be invalidated");
    assert_eq!(
        parallel, *serial,
        "every returned validity field must match"
    );
    assert_eq!(format!("{parallel:?}").into_bytes(), serial_bytes);

    let active = BTreeSet::from([caller_id, worker_id])
        .into_iter()
        .filter(|id| {
            after_validation.get(id).copied().unwrap_or(0)
                > before_validation.get(id).copied().unwrap_or(0)
        })
        .collect::<Vec<_>>();
    assert_eq!(
        active.len(),
        2,
        "caller and OCCT worker must both do CPU work"
    );
    assert_eq!(
        peak_active.load(Ordering::Relaxed),
        2,
        "caller and OCCT worker must make progress in the same sample interval"
    );
    assert!(
        peak_threads.load(Ordering::Relaxed) <= before_validation.len() + 2,
        "validation spawned threads beyond the governed pool and monitor"
    );
    eprintln!(
        "occt-grant=2 caller-id={caller_id} worker-id={worker_id} active-ids={active:?} baseline-process-threads={} peak-process-threads={} validity-bytes={}",
        before_validation.len(),
        peak_threads.load(Ordering::Relaxed),
        serial_bytes.len()
    );
}
