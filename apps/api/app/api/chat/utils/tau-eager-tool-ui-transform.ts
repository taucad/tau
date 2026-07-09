import type { UIMessageChunk } from 'ai';

const tauEagerInputDataType = 'data-tau-eager-tool-input-available';
const tauEagerOutputDataType = 'data-tau-eager-tool-output-available';

type TauEagerInputPayload = {
  type: 'tau-eager-tool-input-available';
  toolCallId: string;
  toolName: string;
  input: unknown;
};

type TauEagerOutputPayload = {
  type: 'tau-eager-tool-output-available';
  toolCallId: string;
  output: unknown;
};

type ToolInputChunk = UIMessageChunk & {
  type: 'tool-input-start' | 'tool-input-delta' | 'tool-input-available';
  toolCallId: string;
};

type ToolOutputChunk = UIMessageChunk & {
  type: 'tool-output-available' | 'tool-output-error';
  toolCallId: string;
};

function isToolInputChunk(chunk: UIMessageChunk): chunk is ToolInputChunk {
  return (
    chunk.type === 'tool-input-start' || chunk.type === 'tool-input-delta' || chunk.type === 'tool-input-available'
  );
}

function isToolOutputChunk(chunk: UIMessageChunk): chunk is ToolOutputChunk {
  return chunk.type === 'tool-output-available' || chunk.type === 'tool-output-error';
}

/**
 * Maps LangGraph `custom` writer payloads from `{@link EagerToolDispatchHandler}` into canonical
 * `tool-input-available` / `tool-output-available` chunks, then **first-wins dedupes** the late
 * `@ai-sdk/langchain` `values` / `messages` emissions for the same `toolCallId`.
 */
export function createTauEagerToolUiTransform(): TransformStream<UIMessageChunk, UIMessageChunk> {
  const inputAvailableFirst = new Set<string>();
  const outputAvailableFirst = new Set<string>();

  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === tauEagerInputDataType) {
        const payload = chunk.data as TauEagerInputPayload;
        if (inputAvailableFirst.has(payload.toolCallId)) {
          return;
        }

        inputAvailableFirst.add(payload.toolCallId);
        controller.enqueue({
          type: 'tool-input-available',
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          input: payload.input,
          dynamic: true,
        });
        return;
      }

      if (chunk.type === tauEagerOutputDataType) {
        const payload = chunk.data as TauEagerOutputPayload;
        if (outputAvailableFirst.has(payload.toolCallId)) {
          return;
        }

        outputAvailableFirst.add(payload.toolCallId);
        controller.enqueue({
          type: 'tool-output-available',
          toolCallId: payload.toolCallId,
          output: payload.output,
        });
        return;
      }

      if (
        isToolInputChunk(chunk) &&
        (inputAvailableFirst.has(chunk.toolCallId) || outputAvailableFirst.has(chunk.toolCallId))
      ) {
        return;
      }

      if (isToolOutputChunk(chunk) && outputAvailableFirst.has(chunk.toolCallId)) {
        return;
      }

      controller.enqueue(chunk);
    },
  });
}
