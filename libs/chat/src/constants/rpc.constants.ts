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
  evaluateModel: 'evaluate_model',
  captureImages: 'capture_images',
  runGeoSpecTests: 'run_geospec_tests',
  exportModel: 'export_model',
  getParameters: 'get_parameters',
  applyParameterOperation: 'apply_parameter_operation',
  appendFile: 'append_file',
  editFile: 'edit_file',
  arrangeWorkbench: 'arrange_workbench',
  resolveSkill: 'resolve_skill',
  readRevisions: 'read_revisions',
  writeTodos: 'write_todos',
  askQuestions: 'ask_questions',
  installPackages: 'install_packages',
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
 * `evaluateModel`, `captureImages`, etc.) intentionally bypass the
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
  rpcName.arrangeWorkbench,
  rpcName.applyParameterOperation,
  rpcName.writeTodos,
  rpcName.askQuestions,
  rpcName.installPackages,
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
  rpcName.evaluateModel,
  rpcName.captureImages,
  rpcName.runGeoSpecTests,
  rpcName.exportModel,
  rpcName.getParameters,
  rpcName.resolveSkill,
  rpcName.readRevisions,
]);

/**
 * How long a server-relayed RPC waits for its client to answer, in milliseconds.
 *
 * It bounds only an RPC the API relays to a browser client over Socket.IO
 * (see the chat RPC error-handling policy). No host in this tree relays tool
 * calls that way: the browser-placed agent host's tool registry dispatches
 * each call in process, and nothing between `packages/agent-host` and the RPC
 * dispatcher bounds it besides the turn's own abort signal. `test_model` there
 * is bounded by {@link geoSpecDefaultRunBudget} instead.
 *
 * @public
 */
export const rpcExecutionTimeout = 60_000;

/**
 * The browser GeoSpec run budget when the call names no `testTimeout`, in
 * milliseconds. A run that outlives it is reported as `OPERATION_TIMEOUT`
 * with the requirements it completed.
 *
 * @public
 */
export const geoSpecDefaultRunBudget = 180_000;

/**
 * The default longest browser GeoSpec run budget, in milliseconds, and so the
 * default largest `test_model.testTimeout`. Host policy, not a ceiling: a host
 * provisioned for longer verification raises it with `maxRunBudget`.
 *
 * @public
 */
export const geoSpecDefaultMaxRunBudget = 300_000;

/**
 * Milliseconds added to a `testTimeout` when it sets the browser run budget,
 * for discovery, bundling and model loads around the slowest test.
 *
 * @public
 */
export const geoSpecRunBudgetHeadroom = 30_000;

/**
 * The default largest `test_model.workUnitLimit`: GeoSpec's default bound on
 * one claim's authored engine work budget (`geoSpecMaximumWorkUnitLimit` in
 * `geospec`), restated here because chat contracts do not depend on the engine
 * package. Host policy, not a ceiling: a host raises it with `maxWorkUnitLimit`.
 *
 * @public
 */
export const geoSpecDefaultMaxWorkUnitLimit = 512_000_000;

/**
 * A host's GeoSpec maxima. Both are positive safe integers.
 *
 * @public
 */
export type GeoSpecHostLimits = {
  /** The longest run budget and largest `testTimeout`. Milliseconds. */
  readonly maxRunBudget: number;
  /** The largest `workUnitLimit` a call may request. */
  readonly maxWorkUnitLimit: number;
};

/**
 * Resolve a host's GeoSpec maxima from its configuration.
 *
 * @param overrides - The host's configured maxima; omitted ones take the defaults.
 * @returns The validated maxima.
 * @throws TypeError when a configured maximum is not a positive safe integer.
 * @public
 */
export const resolveGeoSpecHostLimits = (overrides: Partial<GeoSpecHostLimits> = {}): GeoSpecHostLimits => {
  const limits = {
    maxRunBudget: overrides.maxRunBudget ?? geoSpecDefaultMaxRunBudget,
    maxWorkUnitLimit: overrides.maxWorkUnitLimit ?? geoSpecDefaultMaxWorkUnitLimit,
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`GeoSpec ${name} must be a positive safe integer; received ${String(value)}.`);
    }
  }
  return limits;
};

/**
 * Why a `test_model` call asks for more than this host provides, or
 * `undefined` when it fits. The call is refused, never silently clamped.
 *
 * @param args - The call's `testTimeout` and `workUnitLimit`.
 * @param limits - The host's maxima.
 * @returns The refusal message.
 * @public
 */
export const geoSpecHostLimitProblem = (
  args: { readonly testTimeout?: number | undefined; readonly workUnitLimit?: number | undefined },
  limits: GeoSpecHostLimits,
): string | undefined => {
  const checks = [
    ['testTimeout', args.testTimeout, limits.maxRunBudget, 'maxRunBudget'],
    ['workUnitLimit', args.workUnitLimit, limits.maxWorkUnitLimit, 'maxWorkUnitLimit'],
  ] as const;
  for (const [name, value, maximum, option] of checks) {
    if (value !== undefined && value > maximum) {
      return `test_model ${name} ${value} exceeds this host's maximum of ${maximum}. The claims were not run, so nothing is decided; a host provisioned for more raises ${option}.`;
    }
  }
  return undefined;
};

/**
 * The browser GeoSpec run budget for one call: the host's budget, raised to
 * cover the call's `testTimeout` plus {@link geoSpecRunBudgetHeadroom}, never
 * above the host's maximum.
 *
 * @param hostBudget - The host's run budget. Milliseconds.
 * @param testTimeout - The call's per-test timeout, when given. Milliseconds.
 * @param maxRunBudget - The host's longest run budget. Milliseconds.
 * @returns The run budget. Milliseconds.
 * @public
 */
export const resolveGeoSpecRunBudget = (
  hostBudget: number,
  testTimeout?: number,
  maxRunBudget: number = geoSpecDefaultMaxRunBudget,
): number =>
  Math.min(maxRunBudget, Math.max(hostBudget, testTimeout === undefined ? 0 : testTimeout + geoSpecRunBudgetHeadroom));

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
