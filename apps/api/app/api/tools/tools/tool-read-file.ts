import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import type { BaseStore } from '@langchain/langgraph';
import { readFileInputSchema, rpcClientErrorCode } from '@taucad/chat';
import { assertRpcSuccess } from '@taucad/chat/utils';
import type { ChatTool, ReadFileInput, ReadFileOutput } from '@taucad/chat';
import { rpcName, toolName, fileUnchangedMarker } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';
import { buildReadFingerprint } from '#api/tools/tools/read-file-fingerprint.js';
import { recentReadsRootNamespace } from '#api/chat/recent-reads-namespace.js';

/**
 * `cat -n` gutter for LLM display only (mirrors claude-code's FileReadTool).
 * RPC `readFile` returns raw bytes; the chat tool adds this prefix.
 */
const formatReadFileOutputForDisplay = (rawContent: string, startLine: number): string => {
  const lines = rawContent.split('\n');
  return lines.map((line, index) => `   ${startLine + index}\t${line}`).join('\n');
};

export const readFileToolDefinition = {
  name: toolName.readFile,
  description: `Read the contents of a file from the project filesystem.

You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters.

Lines in the output are prefixed with a cat -n gutter ("   <line>\\t<content>"). Files >2000 lines require explicit \`offset\` and \`limit\`.

Use this tool when you need to:
- Examine the contents of a specific file
- Understand existing code before making modifications
- Review configuration files or documentation`,
  schema: readFileInputSchema,
} as const;

type DedupValue = { priorToolCallId: string; modifiedAt: string };

/**
 * Returns a plain {@link ReadFileOutput} so LangGraph's `ToolNode` auto-wraps
 * it into a `ToolMessage` with the correct stream semantics — no `Command`
 * indirection, no manual `ToolMessage` construction. The dedup pointer is
 * persisted to the LangGraph auxiliary store
 * (see {@link import('#api/chat/redis-read-dedup-store.js').RedisReadDedupStore})
 * as a side effect, keyed by `(recent_reads, chatId, fingerprint)`.
 *
 * LangChain core's `ToolRuntime.store` is typed as `BaseStore<string, unknown>`
 * (the legacy KV interface), while LangGraph's checkpoint+store layer threads
 * its own `BaseStore` (namespaced) onto the runtime — the single cast at the
 * call site bridges the two type ecosystems without leaking the mismatch into
 * the dedup helpers.
 */
export const readFileTool: ChatTool<
  typeof readFileInputSchema,
  ReadFileInput,
  ReadFileOutput,
  typeof toolName.readFile
> = tool(async (args, runtime: ToolRuntime) => {
  const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;

  const result = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.readFile,
    args,
  });

  assertRpcSuccess(result, {
    toolName: toolName.readFile,
    toolCallId,
    clientErrorMessage(error) {
      if (error.errorCode === rpcClientErrorCode.fileNotFound) {
        return `File not found: ${args.targetFile}`;
      }

      return `Cannot read file "${args.targetFile}"`;
    },
  });

  const store = (runtime.store ?? undefined) as BaseStore | undefined;
  const namespace = [...recentReadsRootNamespace, chatId];
  const fingerprint = buildReadFingerprint({
    targetFile: args.targetFile,
    offset: args.offset,
    limit: args.limit,
  });

  if (store && result.modifiedAt) {
    const prior = await store.get(namespace, fingerprint);
    if (prior && (prior.value as DedupValue).modifiedAt === result.modifiedAt) {
      return {
        content: fileUnchangedMarker.build((prior.value as DedupValue).priorToolCallId),
        totalLines: result.totalLines,
        modifiedAt: result.modifiedAt,
      };
    }
  }

  const displayStartLine = result.startLine ?? args.offset ?? 1;
  const output: ReadFileOutput = {
    content: formatReadFileOutputForDisplay(result.content, displayStartLine),
    totalLines: result.totalLines,
    ...(result.modifiedAt !== undefined && { modifiedAt: result.modifiedAt }),
  };

  if (store && result.modifiedAt) {
    const next: DedupValue = { priorToolCallId: toolCallId, modifiedAt: result.modifiedAt };
    await store.put(namespace, fingerprint, next);
  }

  return output;
}, readFileToolDefinition) as unknown as ChatTool<
  typeof readFileInputSchema,
  ReadFileInput,
  ReadFileOutput,
  typeof toolName.readFile
>;
