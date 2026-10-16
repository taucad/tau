/**
 * Ending the process without waiting for V8's background work.
 *
 * `process.exit()` joins every V8 platform thread before the process ends. A WebAssembly tier-up compile running on
 * one of them cannot be cancelled, and a kernel's largest functions take seconds to optimize on a loaded machine: one
 * started by the last call still holds the exit after every kernel thread has stopped (5 s on CI for `tau mcp`).
 * WASI's `proc_exit` ends the process through libc `exit` instead, which does not wait for those threads.
 */

/** A string as a WebAssembly name: its byte length, then its UTF-8 bytes. */
const name = (value: string): number[] => {
  const bytes = new TextEncoder().encode(value);
  return [bytes.length, ...bytes];
};

/** One WebAssembly section: its id, its byte length (every section here is under 128 bytes), then its bytes. */
const section = (id: number, bytes: readonly number[]): number[] => [id, bytes.length, ...bytes];

/**
 * `(module (import "wasi_snapshot_preview1" "proc_exit" (func (param i32))) (memory (export "memory") 1)
 *  (func (export "exit") (param i32) local.get 0 call 0))`
 */
const procExitModule = Uint8Array.from([
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00,
  /* Types: (i32) -> (). */
  ...section(1, [1, 0x60, 1, 0x7f, 0]),
  /* Imports: proc_exit, a function of type 0. */
  ...section(2, [1, ...name('wasi_snapshot_preview1'), ...name('proc_exit'), 0, 0]),
  /* Functions: one, of type 0. */
  ...section(3, [1, 0]),
  /* Memories: one, of one page, which WASI requires. */
  ...section(5, [1, 0, 1]),
  /* Exports: the memory, and function 1 (after the import) as `exit`. */
  ...section(7, [2, ...name('memory'), 2, 0, ...name('exit'), 0, 1]),
  /* Code: `local.get 0; call 0; end`, with no locals. */
  ...section(10, [1, 6, 0, 0x20, 0, 0x10, 0, 0x0b]),
]);

/**
 * End the process with `code` now, as `process.exit` would but without joining V8's background threads.
 *
 * The `exit` event still fires first, so its listeners (a keep-awake child's kill) run. Falls back to `process.exit`
 * where WASI is unavailable.
 *
 * @param code - The exit code.
 * @returns Never.
 */
export const exitNow = async (code: number): Promise<never> => {
  process.exitCode = code;
  process.emit('exit', code);
  process.removeAllListeners('exit');
  try {
    /* Importing `node:wasi` warns that it is experimental; the protocol is closed and nothing reads that warning. */
    process.removeAllListeners('warning');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Node's own class name.
    const { WASI } = await import('node:wasi');
    const wasi = new WASI({ version: 'preview1', returnOnExit: false });
    const instance = new WebAssembly.Instance(new WebAssembly.Module(procExitModule), {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- the WASI import module's own name.
      wasi_snapshot_preview1: wasi.wasiImport,
    });
    wasi.initialize(instance);
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the module above exports `exit(i32)`.
    (instance.exports['exit'] as (code: number) => void)(code);
  } catch {
    // ponytail: no WASI here; `process.exit` still exits, waiting for V8's threads.
  }
  // oxlint-disable-next-line unicorn/no-process-exit -- reached only where WASI cannot end the process.
  process.exit(code);
};
