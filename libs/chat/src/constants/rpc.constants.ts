/**
 * RPC Constants
 *
 * RPC operation names and infrastructure (transport) error codes.
 * Business-level client error codes (`FILE_NOT_FOUND`, etc.) live in
 * `rpcClientErrorCode` / `rpcClientErrorCodeSchema` in `rpc.schema.ts`.
 */

/**
 * RPC operation names.
 * These are the names of remote procedure calls that the server can invoke on the client.
 * @public
 */
export const rpcName = {
  readFile: 'read_file',
  createFile: 'create_file',
  deleteFile: 'delete_file',
  listDirectory: 'list_directory',
  grep: 'grep',
  globSearch: 'glob_search',
  getKernelResult: 'get_kernel_result',
  captureObservations: 'capture_observations',
  runGeoSpecTests: 'run_geospec_tests',
  fetchGeometry: 'fetch_geometry',
  exportGeometry: 'export_geometry',
  captureScreenshot: 'capture_screenshot',
  appendFile: 'append_file',
  editFile: 'edit_file',
} as const satisfies Record<string, string>;

/**
 * Array of all RPC operation names.
 * Used by type guards and validation at runtime.
 * @public
 */
export const rpcNames = Object.values(rpcName) as [(typeof rpcName)[keyof typeof rpcName]];

/**
 * RPC operation names whose execution mutates client-side state (the user's
 * filesystem). Used by the UI's `rpcLedger` to decide which outcomes to
 * record so that `finalizeInterruptedToolParts` can preserve mutations that
 * already settled on the client when an SSE stream is interrupted before
 * the matching `tool-output-available` chunk arrives.
 *
 * Read-only RPCs (`readFile`, `grep`, `globSearch`, `listDirectory`,
 * `getKernelResult`, `captureScreenshot`, etc.) intentionally bypass the
 * ledger — re-issuing them after an interrupt is harmless.
 *
 * Adding a new mutating RPC requires adding it here; the partition invariant
 * test in `rpc.constants.test.ts` enforces that every `rpcName` is classified
 * exactly once.
 * @public
 */
export const mutatingRpcNames = new Set<(typeof rpcName)[keyof typeof rpcName]>([
  rpcName.createFile,
  rpcName.deleteFile,
  rpcName.appendFile,
  rpcName.editFile,
]);

/**
 * RPC operation names that do not mutate client-side state. Complement of
 * {@link mutatingRpcNames}. Authored explicitly (rather than computed) so
 * that mis-categorising a new RPC is a build-time failure of the partition
 * invariant test, not a silent omission.
 * @public
 */
export const readOnlyRpcNames = new Set<(typeof rpcName)[keyof typeof rpcName]>([
  rpcName.readFile,
  rpcName.listDirectory,
  rpcName.grep,
  rpcName.globSearch,
  rpcName.getKernelResult,
  rpcName.captureObservations,
  rpcName.runGeoSpecTests,
  rpcName.fetchGeometry,
  rpcName.exportGeometry,
  rpcName.captureScreenshot,
]);

/**
 * Error codes for RPC infrastructure failures.
 * These represent issues with the RPC transport/execution itself,
 * not business-level errors from the client.
 * @public
 */
export const rpcExecutionErrorCode = {
  /** RPC execution timed out waiting for client response */
  timeout: 'TIMEOUT',
  /** WebSocket client disconnected during RPC execution */
  clientDisconnected: 'CLIENT_DISCONNECTED',
  /** No WebSocket connection available to send RPC request */
  noConnection: 'NO_CONNECTION',
  /** RPC input arguments failed schema validation */
  inputValidationFailed: 'INPUT_VALIDATION_FAILED',
  /** RPC result from client failed schema validation */
  outputValidationFailed: 'OUTPUT_VALIDATION_FAILED',
  /** Client threw an unhandled exception during RPC execution */
  unhandledClientError: 'UNHANDLED_CLIENT_ERROR',
} as const satisfies Record<string, string>;

/**
 * Array of all RPC execution error codes.
 * Used by type guards to validate error codes at runtime.
 * @public
 */
export const rpcExecutionErrorCodes = Object.values(rpcExecutionErrorCode) as [
  (typeof rpcExecutionErrorCode)[keyof typeof rpcExecutionErrorCode],
];
