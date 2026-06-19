import type { ReadFileRpcInput, ReadFileRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileMetadata, RpcFileStat, RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';

/**
 * Default cap for omitted `limit` and ceiling for explicit `limit`.
 * Mirrors claude-code's `FileReadTool.MAX_LINES_TO_READ`.
 */
const maxReadLines = 2000;

/**
 * Bytes ceiling for whole-file reads. Triggers the directive `RESULT_TOO_LARGE`
 * error path when neither `offset` nor `limit` is provided. Mirrors
 * claude-code's `FileReadTool.MaxFileReadTokenExceededError` precheck and
 * keeps massive `.d.ts` / lockfile reads out of the prompt cache by default.
 */
const maxUnboundedReadBytes = 256 * 1024;

const toFileMetadata = (stat: Extract<RpcFileStat, { isDirectory: false }>): RpcFileMetadata =>
  stat.contentKind === 'text'
    ? { type: 'file', size: stat.size, contentKind: 'text', lineCount: stat.lineCount }
    : { type: 'file', size: stat.size, contentKind: 'binary' };

/** @public */
export async function handleReadFile(input: ReadFileRpcInput, fileSystem: RpcFileSystem): Promise<ReadFileRpcResult> {
  const offset: number = input.offset ?? 1;
  const requestedLimit = input.limit ?? maxReadLines;
  const limit = Math.min(requestedLimit, maxReadLines);

  try {
    let fileStat: RpcFileStat | undefined;
    try {
      fileStat = await fileSystem.stat(input.targetFile);
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
        fileMetadata: toFileMetadata(fileStat),
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
          `File is ${kilobytes} KB with ${fileStat.lineCount} lines. ` +
          `Use offset and limit to read in ${maxReadLines}-line chunks, ` +
          `or grep for specific content.`,
        fileMetadata: toFileMetadata(fileStat),
      };
    }

    const text = await fileSystem.readFile(input.targetFile);
    const lines = text.split('\n');
    const totalLines = lines.length;

    const startIndex = Math.max(0, offset - 1);
    const endIndex = Math.min(lines.length, startIndex + limit);
    const selectedLines = lines.slice(startIndex, endIndex);
    const content = selectedLines.join('\n');
    const truncated = totalLines - startIndex > limit;

    return {
      success: true,
      content,
      size: fileStat?.isDirectory === false ? fileStat.size : new TextEncoder().encode(text).byteLength,
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
