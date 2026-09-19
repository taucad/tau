import type { ReadRevisionsRpcInput, ReadRevisionsRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcRevisionsClient } from '#rpc/rpc-dependencies.js';

/**
 * Answer one read of the project's revision history (S28).
 *
 * Every answer carries the same *Where you are* line the chat card shows, so an
 * agent reading history and a person looking at the pane are never told two
 * different things about where the project is.
 *
 * @param args - Which read, and its arguments.
 * @param revisions - The host's read-only view, absent where the host has none.
 * @returns The rows, the changed paths, or the place.
 * @public
 */
export async function handleReadRevisions(
  args: ReadRevisionsRpcInput,
  revisions: RpcRevisionsClient | undefined,
): Promise<ReadRevisionsRpcResult> {
  if (!revisions) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'This project has no revision history available here.',
    };
  }

  const place = await revisions.describe();
  const where = place.line;

  if (args.action === 'describe') {
    return {
      success: true,
      where,
      ...(place.branch === undefined ? {} : { branch: place.branch }),
      branches: [...place.branches],
    };
  }

  if (args.action === 'log') {
    const rows = await revisions.log({
      ...(args.branch === undefined ? {} : { branch: args.branch }),
      ...(args.limit === undefined ? {} : { limit: args.limit }),
    });
    const branch = args.branch ?? place.branch;
    return {
      success: true,
      where,
      ...(branch === undefined ? {} : { branch }),
      revisions: [...rows],
    };
  }

  if (args.to === undefined) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.validationError,
      message: 'A diff needs the newer revision id in `to`. Run `revisions` with `log` first to find one.',
    };
  }
  return {
    success: true,
    where,
    ...(place.branch === undefined ? {} : { branch: place.branch }),
    changes: [...(await revisions.diff(args.from, args.to))],
  };
}
