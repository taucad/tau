import { diffLines } from 'diff';
import type { DiffStatsWithContent } from '#schemas/tools/diff.schema.js';
import type { RpcClientErrorCode } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { editFileMaxBytes } from '#schemas/tools/edit-file.tool.schema.js';
import type { RpcFileStat } from '#rpc/rpc-dependencies.js';
import { assertRootedPath } from '@taucad/utils/path';

const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf]);

/** Authoritative decoded text snapshot passed to a pure edit planner. @public */
export type ClientTextSnapshot = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  content: string;
  bom: boolean;
}>;

/** Pure planner output; filesystem concerns remain in {@link applyClientTextMutation}. @public */
export type ClientTextPlan =
  | Readonly<{
      ok: true;
      content: string;
      occurrences: number;
    }>
  | Readonly<{
      ok: false;
      errorCode: RpcClientErrorCode;
      message: string;
    }>;

/** Exact-byte compare/write/readback transaction supplied by the filesystem authority adapter. @public */
export type ClientTextMutationFileSystem = Readonly<{
  stat(path: string): Promise<RpcFileStat>;
  readFileBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
  writeFileIfUnchanged(
    path: string,
    expected: Uint8Array<ArrayBuffer>,
    replacement: Uint8Array<ArrayBuffer>,
  ): Promise<
    | Readonly<{ status: 'committed'; committedBytes: Uint8Array<ArrayBuffer> }>
    | Readonly<{ status: 'conflict'; currentBytes: Uint8Array<ArrayBuffer> }>
  >;
}>;

/** Shared client-mutation result used by deterministic text edits. @public */
export type ClientTextMutationResult =
  | Readonly<{
      ok: true;
      occurrences: number;
      staleRecovered?: true;
      diffStats: DiffStatsWithContent;
    }>
  | Readonly<{ ok: false; errorCode: RpcClientErrorCode; message: string }>;

const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const startsWith = (value: Uint8Array<ArrayBuffer>, prefix: Uint8Array<ArrayBuffer>): boolean =>
  value.byteLength >= prefix.byteLength && prefix.every((byte, index) => value[index] === byte);

const unsupportedBom = (bytes: Uint8Array<ArrayBuffer>): boolean =>
  startsWith(bytes, new Uint8Array([0xff, 0xfe, 0x00, 0x00])) ||
  startsWith(bytes, new Uint8Array([0x00, 0x00, 0xfe, 0xff])) ||
  startsWith(bytes, new Uint8Array([0xff, 0xfe])) ||
  startsWith(bytes, new Uint8Array([0xfe, 0xff]));

/** Decode one bounded UTF-8 file without normalizing its text. @public */
export const decodeClientText = (
  bytes: Uint8Array<ArrayBuffer>,
): { ok: true; snapshot: ClientTextSnapshot } | { ok: false; errorCode: RpcClientErrorCode; message: string } => {
  if (bytes.byteLength > editFileMaxBytes) {
    return {
      ok: false,
      errorCode: rpcClientErrorCode.resultTooLarge,
      message: `Target file exceeds the ${editFileMaxBytes}-byte limit.`,
    };
  }
  if (unsupportedBom(bytes)) {
    return {
      ok: false,
      errorCode: rpcClientErrorCode.unsupportedTextEncoding,
      message: 'Only UTF-8 text files are supported.',
    };
  }

  const bom = startsWith(bytes, utf8Bom);
  const payload = bom ? bytes.slice(utf8Bom.byteLength) : bytes;
  try {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- `ignoreBOM` is the native TextDecoder option name.
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload);
    return {
      ok: true,
      snapshot: {
        bytes: new Uint8Array(bytes),
        content,
        bom,
      },
    };
  } catch {
    return {
      ok: false,
      errorCode: rpcClientErrorCode.invalidTextEncoding,
      message: 'Target file is not valid UTF-8.',
    };
  }
};

/** Encode text using the authoritative snapshot's UTF-8 BOM convention. @public */
export const encodeClientText = (content: string, bom: boolean): Uint8Array<ArrayBuffer> => {
  const encoded = new TextEncoder().encode(content);
  if (!bom) {
    return encoded;
  }
  const bytes = new Uint8Array(utf8Bom.byteLength + encoded.byteLength);
  bytes.set(utf8Bom);
  bytes.set(encoded, utf8Bom.byteLength);
  return bytes;
};

/** Build line-level evidence for one file mutation. @public */
export const createFileEditDiffStats = (originalContent: string, modifiedContent: string): DiffStatsWithContent => {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const change of diffLines(originalContent, modifiedContent)) {
    if (change.added) {
      linesAdded += change.count;
    } else if (change.removed) {
      linesRemoved += change.count;
    }
  }
  return { linesAdded, linesRemoved, originalContent, modifiedContent };
};

const failure = (errorCode: RpcClientErrorCode, message: string): ClientTextMutationResult => ({
  ok: false,
  errorCode,
  message,
});

const planSnapshot = (
  bytes: Uint8Array<ArrayBuffer>,
  plan: (snapshot: ClientTextSnapshot) => ClientTextPlan,
):
  | Readonly<{
      ok: true;
      snapshot: ClientTextSnapshot;
      replacementBytes: Uint8Array<ArrayBuffer>;
      plan: Extract<ClientTextPlan, { ok: true }>;
    }>
  | Readonly<{ ok: false; errorCode: RpcClientErrorCode; message: string }> => {
  const decoded = decodeClientText(bytes);
  if (!decoded.ok) {
    return decoded;
  }
  const planned = plan(decoded.snapshot);
  if (!planned.ok) {
    return planned;
  }
  const replacementBytes = encodeClientText(planned.content, decoded.snapshot.bom);
  if (replacementBytes.byteLength > editFileMaxBytes) {
    return {
      ok: false,
      errorCode: rpcClientErrorCode.resultTooLarge,
      message: `Edited file exceeds the ${editFileMaxBytes}-byte limit.`,
    };
  }
  return { ok: true, snapshot: decoded.snapshot, replacementBytes, plan: planned };
};

const success = (
  planned: Extract<ReturnType<typeof planSnapshot>, { ok: true }>,
  staleRecovered: boolean,
): ClientTextMutationResult => ({
  ok: true,
  occurrences: planned.plan.occurrences,
  ...(staleRecovered ? { staleRecovered: true } : {}),
  diffStats: createFileEditDiffStats(planned.snapshot.content, planned.plan.content),
});

const verifyCommit = (
  commit: Readonly<{ status: 'committed'; committedBytes: Uint8Array<ArrayBuffer> }>,
  planned: Extract<ReturnType<typeof planSnapshot>, { ok: true }>,
): ClientTextMutationResult | undefined => {
  return bytesEqual(commit.committedBytes, planned.replacementBytes)
    ? undefined
    : failure(rpcClientErrorCode.writeVerificationFailed, 'Committed bytes did not match the planned edit.');
};

/**
 * Apply one pure text plan through Tau's client filesystem authority.
 * Owns bounds, fatal decode, byte CAS, one stale replan, and exact readback.
 * @public
 */
export const applyClientTextMutation = async ({
  targetFile,
  fileSystem,
  plan,
}: {
  targetFile: string;
  fileSystem: ClientTextMutationFileSystem;
  plan: (snapshot: ClientTextSnapshot) => ClientTextPlan;
}): Promise<ClientTextMutationResult> => {
  const path = assertRootedPath(targetFile);
  const stat = await fileSystem.stat(path);
  if (stat.isDirectory || stat.contentKind !== 'text') {
    return failure(rpcClientErrorCode.validationError, 'The edit target must be a text file.');
  }
  if (stat.size > editFileMaxBytes) {
    return failure(rpcClientErrorCode.resultTooLarge, `Target file exceeds the ${editFileMaxBytes}-byte limit.`);
  }

  const first = planSnapshot(await fileSystem.readFileBytes(path), plan);
  if (!first.ok) {
    return first;
  }
  if (bytesEqual(first.snapshot.bytes, first.replacementBytes)) {
    return success(first, false);
  }

  const firstCommit = await fileSystem.writeFileIfUnchanged(path, first.snapshot.bytes, first.replacementBytes);
  if (firstCommit.status === 'committed') {
    const verification = verifyCommit(firstCommit, first);
    return verification ?? success(first, false);
  }

  const recovered = planSnapshot(firstCommit.currentBytes, plan);
  if (!recovered.ok) {
    return failure(rpcClientErrorCode.editConflict, 'The file changed and the edit no longer applies. Read it again.');
  }
  if (bytesEqual(recovered.snapshot.bytes, recovered.replacementBytes)) {
    return success(recovered, true);
  }

  const recoveredCommit = await fileSystem.writeFileIfUnchanged(
    path,
    recovered.snapshot.bytes,
    recovered.replacementBytes,
  );
  if (recoveredCommit.status === 'conflict') {
    return failure(
      rpcClientErrorCode.editConflict,
      'The file changed again before the edit could commit. Read it again.',
    );
  }
  const verification = verifyCommit(recoveredCommit, recovered);
  return verification ?? success(recovered, true);
};
