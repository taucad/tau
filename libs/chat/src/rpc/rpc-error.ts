import { getErrno } from '@taucad/utils/error';
import type { RpcClientErrorCode } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcHandlerError } from '#rpc/rpc-dependencies.js';

/**
 * Canonical mapping from POSIX errno codes to RPC client error codes.
 * Used as the primary classification signal — checked before message matching.
 *
 * ZenFS (kerium Exception), Node.js (ErrnoException), and the kernel filesystem
 * bridge all set `error.code` to these POSIX strings.
 */
/* eslint-disable @typescript-eslint/naming-convention -- POSIX errno codes are uppercase by convention */
const errnoToRpcCode: Record<string, RpcClientErrorCode> = {
  ENOENT: rpcClientErrorCode.fileNotFound,
  EACCES: rpcClientErrorCode.permissionDenied,
  EPERM: rpcClientErrorCode.permissionDenied,
};
/* eslint-enable @typescript-eslint/naming-convention -- end POSIX errno block */

/** @public */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

/** @public */
export function getErrorCode(error: unknown): RpcClientErrorCode {
  if (error instanceof Error) {
    const errno = getErrno(error);
    if (errno && errno in errnoToRpcCode) {
      return errnoToRpcCode[errno]!;
    }

    const message = error.message.toLowerCase();
    if (message.includes('not found') || message.includes('enoent') || message.includes('no such file')) {
      return rpcClientErrorCode.fileNotFound;
    }

    if (message.includes('permission') || message.includes('eacces')) {
      return rpcClientErrorCode.permissionDenied;
    }

    if (message.includes('parse') || message.includes('json')) {
      return rpcClientErrorCode.parseError;
    }

    return rpcClientErrorCode.ioError;
  }

  return rpcClientErrorCode.unknown;
}

/** @public */
export function toRpcError(error: unknown): RpcHandlerError {
  return {
    success: false,
    errorCode: getErrorCode(error),
    message: getErrorMessage(error),
  };
}
