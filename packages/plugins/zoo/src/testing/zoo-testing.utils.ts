/**
 * Zoo/KCL Kernel Testing Utilities
 *
 * Shared helper functions for testing Zoo kernel error handling.
 */

import type { KclError as WasmKclError } from '@taucad/kcl-wasm-lib/bindings/KclError';

/**
 * Creates a mock WasmKclError for Zoo/KCL error handling tests.
 *
 * @param overrides - Partial overrides for the default error shape
 * @returns A WasmKclError with sensible defaults
 */
export function createMockWasmKclError(overrides?: Partial<WasmKclError>): WasmKclError {
  const base: WasmKclError = {
    kind: 'semantic',
    details: {
      msg: 'test error',
      sourceRanges: [[10, 20, 0]],
      backtrace: [],
    },
  };

  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- WasmKclError has complex union shape
  return { ...base, ...overrides } as WasmKclError;
}
