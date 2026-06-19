/**
 * Centralized configuration constants for the kernel framework.
 *
 * All timing, debounce, timeout, polling, and buffer-size constants live here
 * so they can be adjusted in a single place. Time-valued constants are in
 * milliseconds (documented per-export).
 */

/** Debounce delay for parameter-change re-renders. Milliseconds. */
export const parameterDebounce = 0;

/** Debounce delay for file-change re-renders. Milliseconds. */
export const fileChangeDebounce = 200;

/** Debounce delay for flushing batched worker logs to the main thread. Milliseconds. */
export const logFlushDebounce = 250;

/** Polling interval used when `Atomics.waitAsync` is unavailable. Matches one frame at 60 fps. Milliseconds. */
export const waitAsyncPollInterval = 16;

/** Byte length of the SharedArrayBuffer signal channel (2 Int32 slots x 4 bytes). */
export const signalBufferByteLength = 8;

/** Maximum byte length the growable SharedArrayBuffer can expand to. */
export const signalBufferMaxByteLength = 16;
