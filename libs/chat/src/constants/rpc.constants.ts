/**
 * RPC Constants
 *
 * Constants for RPC operation names and infrastructure error codes.
 * These are distinct from RPC client errors (business errors like FILE_NOT_FOUND)
 * which are defined in rpc.schema.ts.
 */

/**
 * RPC operation names.
 * These are the names of remote procedure calls that the server can invoke on the client.
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
  fetchGeometry: 'fetch_geometry',
  captureScreenshot: 'capture_screenshot',
} as const satisfies Record<string, string>;

/**
 * Array of all RPC operation names.
 * Used by type guards and validation at runtime.
 */
export const rpcNames = Object.values(rpcName) as [(typeof rpcName)[keyof typeof rpcName]];

/**
 * Error codes for RPC infrastructure failures.
 * These represent issues with the RPC transport/execution itself,
 * not business-level errors from the client.
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
 */
export const rpcExecutionErrorCodes = Object.values(rpcExecutionErrorCode) as [
  (typeof rpcExecutionErrorCode)[keyof typeof rpcExecutionErrorCode],
];
