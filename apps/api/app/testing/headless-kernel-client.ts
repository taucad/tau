import type { KernelIssue } from '@taucad/kernels';
import type { GetKernelResultRpcResult } from '@taucad/chat';
import type { RpcKernelClient } from '@taucad/chat/rpc';

export type KernelWorkerLike = {
  createGeometry(entry: {
    file: { path: string; basePath: string };
    parameters: Record<string, unknown>;
  }): Promise<{ success: boolean; issues?: KernelIssue[] }>;
};

/**
 * Headless RpcKernelClient that drives a real kernel worker
 * backed by an in-memory filesystem.
 *
 * When getKernelResult is called:
 * 1. Reads the file from the memory filesystem
 * 2. Calls worker.createGeometry() with the file
 * 3. Returns kernel issues (the geometry result can be validated separately)
 */
export function createHeadlessKernelClient(worker: KernelWorkerLike): RpcKernelClient {
  return {
    async getKernelResult(targetFile: string): Promise<GetKernelResultRpcResult> {
      try {
        const result = await worker.createGeometry({
          file: { path: targetFile, basePath: '/' },
          parameters: {},
        });

        const hasErrors = !result.success;
        const issues = result.success ? [] : result.issues;

        return {
          success: true,
          status: hasErrors ? 'error' : 'ready',
          kernelIssues: issues,
        };
      } catch (error) {
        return {
          success: false,
          errorCode: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Unknown kernel error',
        };
      }
    },
  };
}
