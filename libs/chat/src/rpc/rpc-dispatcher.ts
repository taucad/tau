import type { RpcCall } from '#schemas/rpc.schema.js';
import { rpcName } from '#constants/rpc.constants.js';
import type { RpcDependencies } from '#rpc/rpc-dependencies.js';
import { handleReadFile } from '#rpc/handlers/handle-read-file.js';
import { handleCreateFile } from '#rpc/handlers/handle-create-file.js';
import { handleDeleteFile } from '#rpc/handlers/handle-delete-file.js';
import { handleListDirectory } from '#rpc/handlers/handle-list-directory.js';
import { handleGrep } from '#rpc/handlers/handle-grep.js';
import { handleGlobSearch } from '#rpc/handlers/handle-glob-search.js';
import { handleGetKernelResult } from '#rpc/handlers/handle-get-kernel-result.js';
import { handleCaptureObservations } from '#rpc/handlers/handle-capture-observations.js';
import { handleFetchGeometry } from '#rpc/handlers/handle-fetch-geometry.js';
import { handleCaptureScreenshot } from '#rpc/handlers/handle-capture-screenshot.js';

export type RpcDispatcher = {
  dispatch(rpcCall: RpcCall): Promise<unknown>;
};

/**
 * Creates a transport-agnostic RPC dispatcher.
 *
 * Routes RPC calls to the appropriate handler function,
 * passing dependencies from the provided `RpcDependencies`.
 *
 * Used by:
 * - Browser: backed by fileManager, XState actors, WebGL
 * - Headless tests: backed by in-memory filesystem, kernel worker
 */
export function createRpcDispatcher(deps: RpcDependencies): RpcDispatcher {
  return {
    async dispatch(rpcCall: RpcCall): Promise<unknown> {
      switch (rpcCall.rpcName) {
        case rpcName.readFile: {
          return handleReadFile(rpcCall.args, deps.fileSystem);
        }

        case rpcName.createFile: {
          return handleCreateFile(rpcCall.args, deps.fileSystem);
        }

        case rpcName.deleteFile: {
          return handleDeleteFile(rpcCall.args, deps.fileSystem);
        }

        case rpcName.listDirectory: {
          return handleListDirectory(rpcCall.args, deps.fileSystem);
        }

        case rpcName.grep: {
          return handleGrep(rpcCall.args, deps.fileSystem);
        }

        case rpcName.globSearch: {
          return handleGlobSearch(rpcCall.args, deps.fileSystem);
        }

        case rpcName.getKernelResult: {
          return handleGetKernelResult(rpcCall.args, deps.kernelClient);
        }

        case rpcName.captureObservations: {
          return handleCaptureObservations(rpcCall.args, deps.graphics);
        }

        case rpcName.fetchGeometry: {
          return handleFetchGeometry(rpcCall.args, deps.graphics, deps.fileSystem);
        }

        case rpcName.captureScreenshot: {
          return handleCaptureScreenshot(rpcCall.args, deps.graphics);
        }
      }
    },
  };
}
