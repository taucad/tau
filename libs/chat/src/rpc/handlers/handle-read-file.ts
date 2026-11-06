import type { ReadFileRpcInput, ReadFileRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileMetadata, RpcFileStat, RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { assertRootedPath } from '@taucad/utils/path';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';

/**
 * Default cap for omitted `limit` and ceiling for explicit `limit`.
 * Mirrors claude-code's `FileReadTool.MAX_LINES_TO_READ`.
 */
const maxReadLines = 2000;

/** Byte ceiling for paginated text returned in one RPC result. */
const maxPaginatedReadBytes = 50 * 1024;
const continuationHintReserveBytes = 64;
const maxPaginatedContentBytes = maxPaginatedReadBytes - continuationHintReserveBytes;
const textEncoder = new TextEncoder();

/**
 * Bytes ceiling for whole-file reads. Triggers the directive `RESULT_TOO_LARGE`
 * error path when neither `offset` nor `limit` is provided. Mirrors
 * claude-code's `FileReadTool.MaxFileReadTokenExceededError` precheck and
 * keeps massive `.d.ts` / lockfile reads out of the prompt cache by default.
 */
const maxUnboundedReadBytes = 256 * 1024;

/* A stat that could not measure a large file within its cap reports its size alone (D4): no metadata then. */
const toFileMetadata = (stat: Extract<RpcFileStat, { isDirectory: false }>): RpcFileMetadata | undefined =>
  stat.contentKind === 'binary'
    ? { type: 'file', size: stat.size, contentKind: 'binary' }
    : stat.contentKind === 'text' && stat.lineCount !== undefined
      ? { type: 'file', size: stat.size, contentKind: 'text', lineCount: stat.lineCount }
      : undefined;
const fileMetadataOf = (
  stat: Extract<RpcFileStat, { isDirectory: false }>,
): Readonly<{ fileMetadata?: RpcFileMetadata }> => {
  const fileMetadata = toFileMetadata(stat);
  return fileMetadata === undefined ? {} : { fileMetadata };
};

/** @public */
export async function handleReadFile(input: ReadFileRpcInput, fileSystem: RpcFileSystem): Promise<ReadFileRpcResult> {
  const offset: number = input.offset ?? 1;
  const requestedLimit = input.limit ?? maxReadLines;
  const limit = Math.min(requestedLimit, maxReadLines);

  try {
    const targetFile = assertRootedPath(input.targetFile);
    let fileStat: RpcFileStat | undefined;
    try {
      fileStat = await fileSystem.stat(targetFile);
    } catch {
      // `stat` may not be available in all environments — fall through to
      // unbounded `readFile`. Without a stat we cannot enforce the 256 KB
      // precheck, but this is rare and the line-count clamp below still applies.
    }

    if (fileStat?.isDirectory === false && fileStat.contentKind === 'binary') {
      return {
        success: false,
        errorCode: rpcClientErrorCode.ioError,
        message: `File is binary (${fileStat.size} bytes) and cannot be read as text.`,
        ...fileMetadataOf(fileStat),
      };
    }

    if (
      fileStat?.isDirectory === false &&
      fileStat.size > maxUnboundedReadBytes &&
      input.offset === undefined &&
      input.limit === undefined
    ) {
      const kilobytes = Math.round(fileStat.size / 1024);
      return {
        success: false,
        errorCode: rpcClientErrorCode.resultTooLarge,
        message:
          `File is ${kilobytes} KB${fileStat.lineCount === undefined ? '' : ` with ${fileStat.lineCount} lines`}. ` +
          `Use offset and limit to read in ${maxReadLines}-line chunks, ` +
          `or grep for specific content.`,
        ...fileMetadataOf(fileStat),
      };
    }

    const text = await fileSystem.readFile(targetFile);
    const lines = text.split('\n');
    const totalLines = lines.length;

    const startIndex = Math.max(0, offset - 1);
    const endIndex = Math.min(lines.length, startIndex + limit);
    const selectedLines: string[] = [];
    let selectedBytes = 0;
    for (let index = startIndex; index < endIndex; index += 1) {
      const line = lines[index] ?? '';
      const lineBytes = textEncoder.encode(`${selectedLines.length > 0 ? '\n' : ''}${line}`).byteLength;
      if (selectedBytes + lineBytes > maxPaginatedContentBytes) {
        if (selectedLines.length === 0) {
          const bytes = textEncoder.encode(line).subarray(0, maxPaginatedContentBytes);
          selectedLines.push(new TextDecoder().decode(bytes, { stream: true }));
        }
        break;
      }
      selectedLines.push(line);
      selectedBytes += lineBytes;
    }

    const nextOffset = startIndex + selectedLines.length + 1;
    const truncated = nextOffset <= totalLines;
    const continuationHint = truncated ? `\n\ntruncated; continue with offset=${nextOffset}` : '';
    const content = `${selectedLines.join('\n')}${continuationHint}`;

    return {
      success: true,
      content,
      size: fileStat?.isDirectory === false ? fileStat.size : textEncoder.encode(text).byteLength,
      contentKind: 'text',
      totalLines,
      startLine: startIndex + 1,
      ...(truncated && { truncated: true }),
      ...(fileStat?.createdAt !== undefined && { createdAt: fileStat.createdAt }),
      ...(fileStat?.modifiedAt !== undefined && { modifiedAt: fileStat.modifiedAt }),
    };
  } catch (error) {
    return toRpcError(error);
  }
}
