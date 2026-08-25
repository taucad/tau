/**
 * Runtime environment detection for the module VM.
 */

/**
 * The environment a VM module is executing in.
 *
 * @public
 */
export type VmEnvironment = 'node' | 'browser' | 'worker';

/**
 * Detect the current JavaScript environment.
 *
 * @returns the detected VM environment.
 * @public
 */
export function getEnvironment(): VmEnvironment {
  // oxlint-disable-next-line n/prefer-global/process, @typescript-eslint/no-unnecessary-condition -- process may be undefined in browser/worker
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }

  // @ts-expect-error - WorkerGlobalScope is not defined in every global scope.
  if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
    return 'worker';
  }

  return 'browser';
}

/**
 * Return true when running in Node.js.
 *
 * @returns whether the current VM environment is Node.js.
 * @public
 */
export function isNode(): boolean {
  return getEnvironment() === 'node';
}
