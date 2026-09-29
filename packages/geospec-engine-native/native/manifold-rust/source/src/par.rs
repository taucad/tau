// par.rs — determinism-preserving parallel execution helpers
//
// Mirrors the C++ `autoPolicy` pattern (parallel.h): each site opts into
// parallelism above a size threshold, staying sequential for small inputs.
// Unlike upstream MANIFOLD_PAR (which allows nondeterministic vertex order in
// some phases), only sites whose output is provably identical to the
// sequential build are parallelized — per-index maps with indexed writes, and
// collect-then-sort pipelines whose final sort is a total order. This keeps
// the `parallel` feature bit-exact with the sequential reference.

/// Map `f` over `0..n`, in parallel when the `parallel` feature is enabled and
/// `n >= threshold`. Results are returned in index order either way.
#[cfg(feature = "parallel")]
pub fn maybe_par_map<T, F>(n: usize, threshold: usize, f: F) -> Vec<T>
where
    T: Send,
    F: Fn(usize) -> T + Sync + Send,
{
    use rayon::prelude::*;
    if n >= threshold {
        (0..n).into_par_iter().map(f).collect()
    } else {
        (0..n).map(f).collect()
    }
}

/// Sequential fallback: identical output to the parallel version.
#[cfg(not(feature = "parallel"))]
pub fn maybe_par_map<T, F>(n: usize, _threshold: usize, f: F) -> Vec<T>
where
    F: Fn(usize) -> T,
{
    (0..n).map(f).collect()
}

/// [`maybe_par_map`] with cooperative cancellation: `None` means the token was
/// cancelled and the (necessarily incomplete) results were discarded.
///
/// Mirrors the ctx-aware `for_each` overload in C++ `parallel.h:400-437`, whose
/// contract is the same — "only safe when *skip the rest of the range* produces
/// a result the caller will discard via a post-loop `IsCancelled` check".
///
/// Two deliberate differences from the C++:
/// - A `None` token dispatches straight to [`maybe_par_map`], so the
///   uncancellable path is byte-for-byte the code that ran before cancellation
///   existed — stricter than C++, which still branches on `ctx != nullptr`
///   inside the loop.
/// - With a token we check the flag on *every* element rather than once per
///   `kSeqCancelChunk` (1024) elements. The flag is written at most once, so its
///   cache line stays shared and the relaxed load is an L1 hit; paying it per
///   element buys strictly better cancellation latency than the C++ chunking.
#[cfg(feature = "parallel")]
pub fn maybe_par_map_ct<T, F>(
    n: usize,
    threshold: usize,
    token: Option<&crate::cancel::CancelToken>,
    f: F,
) -> Option<Vec<T>>
where
    T: Send,
    F: Fn(usize) -> T + Sync + Send,
{
    use rayon::prelude::*;
    let Some(token) = token else {
        return Some(maybe_par_map(n, threshold, f));
    };
    // Collecting `Option<T>` into `Option<Vec<T>>` short-circuits on the first
    // `None` in both rayon and std, so a cancel stops the remaining work
    // instead of merely skipping each element's body.
    if n >= threshold {
        (0..n)
            .into_par_iter()
            .map(|i| if token.is_cancelled() { None } else { Some(f(i)) })
            .collect()
    } else {
        (0..n)
            .map(|i| if token.is_cancelled() { None } else { Some(f(i)) })
            .collect()
    }
}

/// Sequential fallback: identical output to the parallel version.
#[cfg(not(feature = "parallel"))]
pub fn maybe_par_map_ct<T, F>(
    n: usize,
    threshold: usize,
    token: Option<&crate::cancel::CancelToken>,
    f: F,
) -> Option<Vec<T>>
where
    F: Fn(usize) -> T,
{
    let Some(token) = token else {
        return Some(maybe_par_map(n, threshold, f));
    };
    (0..n)
        .map(|i| if token.is_cancelled() { None } else { Some(f(i)) })
        .collect()
}
