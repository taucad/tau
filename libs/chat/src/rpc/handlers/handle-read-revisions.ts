import type { ReadRevisionsRpcInput, ReadRevisionsRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcRevisionsClient } from '#rpc/rpc-dependencies.js';

/** Characters of file text one `conflict` answer carries, about `read_file`'s 50 KB page. */
const maxConflictTextLength = 48 * 1024;

/**
 * Read one conflict's files, bounded: text past the budget is cut with a marker saying how much is missing.
 *
 * @param revisions - The host's read-only view.
 * @param args - The conflicted revision and, optionally, one of its files.
 * @param where - The *Where you are* line.
 * @returns The files, or a refusal naming what to ask instead.
 */
const readConflict = async (
  revisions: RpcRevisionsClient,
  args: ReadRevisionsRpcInput,
  where: string,
): Promise<ReadRevisionsRpcResult> => {
  const conflict = await revisions.conflict(args.revision);
  if (conflict === undefined) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.validationError,
      message: 'No conflict is waiting on this branch. Pass the conflicted revision id in `revision`.',
    };
  }
  const files = args.path === undefined ? conflict.files : conflict.files.filter((file) => file.path === args.path);
  if (files.length === 0) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.fileNotFound,
      message: `${String(args.path)} is not one of this conflict's files: ${conflict.files.map((file) => file.path).join(', ')}.`,
    };
  }
  let budget = maxConflictTextLength;
  const clip = (text: string | undefined): string | undefined => {
    if (text === undefined || text.length <= budget) {
      budget -= text?.length ?? 0;
      return text;
    }
    const kept = text.slice(0, budget);
    budget = 0;
    const narrower = args.path === undefined ? ' Pass `path` to read one file.' : '';
    return `${kept}\n[truncated: ${String(text.length - kept.length)} more characters.${narrower}]`;
  };
  return {
    success: true,
    where,
    conflict: {
      revisionId: conflict.revisionId,
      labels: { ...conflict.labels },
      files: files.map((file) => {
        const [base, ours, theirs] = [clip(file.base), clip(file.ours), clip(file.theirs)];
        return {
          path: file.path,
          chooseOne: file.chooseOne,
          ...(base === undefined ? {} : { base }),
          ...(ours === undefined ? {} : { ours }),
          ...(theirs === undefined ? {} : { theirs }),
        };
      }),
    },
  };
};

/**
 * Answer one read of the project's revision history (S28).
 *
 * Every answer carries the same *Where you are* line the chat card shows, so an
 * agent reading history and a person looking at the pane are never told two
 * different things about where the project is.
 *
 * @param args - Which read, and its arguments.
 * @param revisions - The host's read-only view, absent where the host has none.
 * @returns The rows, the changed paths, the place, or a conflict's files.
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

  if (args.action === 'conflict') {
    return readConflict(revisions, args, where);
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
