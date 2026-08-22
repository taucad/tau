import type { RpcCall, RpcInput, RpcResult, RpcSchemasRegistry } from '#schemas/rpc.schema.js';
import { rpcName } from '#constants/rpc.constants.js';
import type { RpcName } from '#types/rpc.types.js';
import type { RpcDependencies } from '#rpc/rpc-dependencies.js';
import { handleReadFile } from '#rpc/handlers/handle-read-file.js';
import { handleCreateFile } from '#rpc/handlers/handle-create-file.js';
import { handleDeleteFile } from '#rpc/handlers/handle-delete-file.js';
import { handleListDirectory } from '#rpc/handlers/handle-list-directory.js';
import { handleGrep } from '#rpc/handlers/handle-grep.js';
import { handleGlobSearch } from '#rpc/handlers/handle-glob-search.js';
import { handleGetKernelResult } from '#rpc/handlers/handle-get-kernel-result.js';
import { handleCaptureImages } from '#rpc/handlers/handle-capture-images.js';
import { handleRunGeoSpecTests } from '#rpc/handlers/handle-run-geospec-tests.js';
import { handleExportGeometry } from '#rpc/handlers/handle-export-geometry.js';
import { handleAppendFile } from '#rpc/handlers/handle-append-file.js';
import { handleEditFile } from '#rpc/handlers/handle-edit-file.js';
import { handleResolveSkill } from '#rpc/handlers/handle-resolve-skill.js';

type RpcHandlerMap = {
  [K in RpcName]: (args: RpcInput<K>) => Promise<RpcResult<K>>;
};

/** @public */
export type RpcDispatcher = {
  dispatch<K extends keyof RpcSchemasRegistry>(call: RpcCall<K>): Promise<RpcResult<K>>;
};

/**
 * Creates a transport-agnostic RPC dispatcher.
 *
 * Routes RPC calls to the appropriate handler function,
 * passing dependencies from the provided `RpcDependencies`.
 *
 * Used by:
 * - Browser: backed by fileManager, XState actors, WebGL
 * - Headless tests: backed by in-memory filesystem, runtime worker
 * @public
 */
export function createRpcDispatcher(deps: RpcDependencies): RpcDispatcher {
  const handlers: RpcHandlerMap = {
    [rpcName.readFile]: async (args) => handleReadFile(args, deps.fileSystem),
    [rpcName.createFile]: async (args) => handleCreateFile(args, deps.fileSystem),
    [rpcName.deleteFile]: async (args) => handleDeleteFile(args, deps.fileSystem),
    [rpcName.listDirectory]: async (args) => handleListDirectory(args, deps.fileSystem),
    [rpcName.grep]: async (args) => handleGrep(args, deps.fileSystem),
    [rpcName.globSearch]: async (args) => handleGlobSearch(args, deps.fileSystem),
    [rpcName.getKernelResult]: async (args) => handleGetKernelResult(args, deps.kernelClient),
    [rpcName.captureImages]: async (args) => handleCaptureImages(args, deps.images),
    [rpcName.runGeoSpecTests]: async (args) => handleRunGeoSpecTests(args, deps.geospec),
    [rpcName.exportGeometry]: async (args) => handleExportGeometry(args, deps.graphics, deps.fileSystem),
    [rpcName.appendFile]: async (args) => handleAppendFile(args, deps.fileSystem),
    [rpcName.editFile]: async (args) => handleEditFile(args, deps.fileSystem),
    [rpcName.resolveSkill]: async (args) => handleResolveSkill(args, deps.skillResolver),
  };

  const dispatch = async <K extends keyof RpcSchemasRegistry>(call: RpcCall<K>): Promise<RpcResult<K>> => {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- tsgo widens indexed handler; `K` pins rpcName ↔ args on RpcCall<K>
    const run = handlers[call.rpcName] as (args: RpcInput<K>) => Promise<RpcResult<K>>;
    return run(call.args);
  };

  return { dispatch };
}
