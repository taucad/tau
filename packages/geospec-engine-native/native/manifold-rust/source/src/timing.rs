// Lightweight, env-gated phase timing for the boolean pipeline, mirroring the
// C++ MANIFOLD_TIMING instrumentation (Timer::Print in boolean3.cpp /
// boolean_result.cpp). Enabled by setting the MANIFOLD_TIMING environment
// variable to any non-empty value; otherwise every call is a no-op so release
// performance is unaffected. Used to compare per-stage wall-clock against the
// C++ reference when hunting performance gaps (see CLAUDE.md "Instrumentation
// Strategy").

use std::sync::OnceLock;
use std::time::Instant;

fn enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        std::env::var("MANIFOLD_TIMING").map_or(false, |v| !v.is_empty())
    })
}

/// Start a stage timer. Returns None (and times nothing) unless the
/// MANIFOLD_TIMING environment variable is set.
pub(crate) fn start() -> Option<Instant> {
    if enabled() {
        Some(Instant::now())
    } else {
        None
    }
}

/// Platform-safe stopwatch for ALWAYS-ON aggregate instrumentation (hot-path
/// counters that accumulate into atomics). `std::time::Instant::now()`
/// PANICS on wasm32-unknown-unknown ("time not implemented on this
/// platform"), so any unconditional timing in library code must go through
/// this type — on wasm it measures nothing and reports zero.
#[derive(Clone, Copy)]
pub(crate) struct Stopwatch {
    #[cfg(not(target_arch = "wasm32"))]
    t0: Instant,
}

impl Stopwatch {
    #[inline]
    pub fn start() -> Self {
        Stopwatch {
            #[cfg(not(target_arch = "wasm32"))]
            t0: Instant::now(),
        }
    }

    #[inline]
    pub fn elapsed_ns(self) -> u64 {
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.t0.elapsed().as_nanos() as u64
        }
        #[cfg(target_arch = "wasm32")]
        {
            0
        }
    }

    #[inline]
    pub fn elapsed_secs(self) -> f64 {
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.t0.elapsed().as_secs_f64()
        }
        #[cfg(target_arch = "wasm32")]
        {
            0.0
        }
    }
}

/// Optional memory reporter, registered by profiling harnesses (e.g. the
/// mem_profile example's counting allocator). Returns (current bytes, peak
/// bytes since the previous call) — the implementation resets its peak
/// watermark on read so each stage line reports that stage's own peak.
pub type MemHook = fn() -> (usize, usize);

static MEM_HOOK: OnceLock<MemHook> = OnceLock::new();

pub fn set_mem_hook(hook: MemHook) {
    let _ = MEM_HOOK.set(hook);
}

/// Print a counter/diagnostic line, gated on the same MANIFOLD_TIMING
/// switch as the stage timers.
pub(crate) fn print_count(label: &str) {
    if enabled() {
        eprintln!("{label}");
    }
}

/// Print the elapsed time for a stage started with `start`, matching the C++
/// Timer::Print format ("label: N sec") on stderr. If a memory hook is
/// registered, appends current/stage-peak heap use.
pub(crate) fn print(label: &str, t0: Option<Instant>) {
    if let Some(t0) = t0 {
        match MEM_HOOK.get() {
            Some(hook) => {
                let (current, peak) = hook();
                eprintln!(
                    "{}: {} sec, current = {:.1} MB, stage peak = {:.1} MB",
                    label,
                    t0.elapsed().as_secs_f64(),
                    current as f64 / 1048576.0,
                    peak as f64 / 1048576.0
                );
            }
            None => eprintln!("{}: {} sec", label, t0.elapsed().as_secs_f64()),
        }
    }
}
