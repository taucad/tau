import type { AgentChannelAdmissionConfig } from '@taucad/agent-host/wire';
import { contextMemoryMaxBytes, contextMemoryMaxLines } from '@taucad/chat/schemas';
import type { FileSystemProvider } from '@taucad/filesystem';

/**
 * Read bounded canonical project instructions through the host's project authority.
 * @param filesystem - The host-owned canonical project view, independent of candidate code placement.
 * @param signal - Cancellation of this bounded context read.
 * @returns Current instruction bytes in the existing memory payload.
 * @internal
 */
export const readProjectTaskContext = async (
  filesystem: Required<Pick<FileSystemProvider, 'exists' | 'readFileStream'>>,
  signal: AbortSignal,
): Promise<NonNullable<AgentChannelAdmissionConfig['contextPayload']>> => {
  const path = '.tau/AGENTS.md';
  signal.throwIfAborted();
  if (!(await filesystem.exists(path))) {
    return {};
  }
  const reader = filesystem.readFileStream(path, { length: contextMemoryMaxBytes + 1, signal }).getReader();
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let size = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- bounded stream consumption.
      const next = await reader.read();
      if (next.done) {
        break;
      }
      chunks.push(next.value);
      size += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  const decoded = new TextDecoder().decode(bytes.subarray(0, contextMemoryMaxBytes), {
    stream: size > contextMemoryMaxBytes,
  });
  const lines = decoded.split('\n');
  const content = lines.slice(0, contextMemoryMaxLines).join('\n');
  const truncated = size > contextMemoryMaxBytes || lines.length > contextMemoryMaxLines;
  return {
    memory: {
      [path]: truncated
        ? `${content}\n[AGENTS.md truncated: first ${contextMemoryMaxLines} lines / ${contextMemoryMaxBytes} bytes retained]`
        : content,
    },
  };
};
