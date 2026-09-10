import { getErrno } from '@taucad/utils/error';
import { VirtualPathError } from '@taucad/utils/path';
import type { RpcClientErrorCode } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode, rpcClientErrorCodeSchema } from '#schemas/rpc.schema.js';
import type { RpcHandlerError } from '#rpc/rpc-dependencies.js';

/**
 * Canonical mapping from POSIX errno codes to RPC client error codes.
 * The only classification signal: `code` is set by every filesystem Tau
 * speaks to, and nothing is inferred from an error's message.
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
  if (error instanceof VirtualPathError) {
    return rpcClientErrorCode.validationError;
  }

  if (error instanceof Error) {
    const errno = getErrno(error);
    const typedCode = rpcClientErrorCodeSchema.safeParse(errno);
    if (typedCode.success) {
      return typedCode.data;
    }
    if (errno && errno in errnoToRpcCode) {
      return errnoToRpcCode[errno]!;
    }

    /* A message is prose, not a classification: substring matching read
     * `PARSE_ERROR` out of any failure whose path ended in `.json`, and
     * `FILE_NOT_FOUND` out of any sentence containing "not found". Every
     * filesystem Tau speaks to — ZenFS, Node and the kernel bridge — sets
     * `code`, so an error without one is simply an I/O failure. */
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
