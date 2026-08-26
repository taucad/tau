/* eslint-disable @typescript-eslint/naming-convention -- assertions read LangChain's snake_case usage_metadata / tool_call_id fields. */
import { describe, expect, it } from 'vitest';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { AIMessage as AIMessageType, BaseMessage } from '@langchain/core/messages';
import { toolName } from '@taucad/chat/constants';
import { TauReplayChatModel } from '#api/tau-replay/tau-replay-chat-model.js';
import type { ReplayFixture } from '#api/tau-replay/replay-fixture.schema.js';

const fixture: ReplayFixture = {
  id: 'test-fixture',
  sourceModel: 'source-model',
  turns: [
    {
      toolCalls: [{ name: 'list_directory', args: { path: '' } }],
      usage: { inputTokens: 100, outputTokens: 10 },
    },
    {
      reasoning: 'Thinking about the design.',
      toolCalls: [{ name: 'create_file', args: { targetFile: 'main.scad', content: 'cube(10);' } }],
      usage: { inputTokens: 200, outputTokens: 20 },
    },
    {
      text: 'All done.',
      usage: { inputTokens: 300, outputTokens: 30 },
    },
  ],
};
const modelId = 'tau-replay-composite';

// The model derives its step from the number of assistant turns already in the
// history; `invoke` routes through `_generate` and returns the assistant message.
const replayStep = async (priorAiTurns: number, latestToolResult = 'ok'): Promise<AIMessageType> => {
  const model = new TauReplayChatModel(fixture, modelId);
  const history: BaseMessage[] = [new SystemMessage('system'), new HumanMessage('a cube')];
  for (let index = 0; index < priorAiTurns; index += 1) {
    history.push(
      new AIMessage({ content: `turn ${index}` }),
      new ToolMessage({
        content: index === priorAiTurns - 1 ? latestToolResult : 'ok',
        tool_call_id: 'x',
        ...(index === priorAiTurns - 1 ? { name: toolName.testModel } : {}),
      }),
    );
  }
  return model.invoke(history);
};

describe('TauReplayChatModel', () => {
  it('should emit the first turn tool call when no assistant turn has run yet', async () => {
    const message = await replayStep(0);

    expect(message.tool_calls).toHaveLength(1);
    expect(message.tool_calls?.[0]).toMatchObject({ name: 'list_directory', args: { path: '' } });
    expect(message.response_metadata).toMatchObject({ model: modelId, model_provider: 'tau' });
    expect(message.usage_metadata).toMatchObject({ input_tokens: 100, output_tokens: 10, total_tokens: 110 });
  });

  it('should report the selected model in streaming response metadata', async () => {
    const chunks = [];
    const model = new TauReplayChatModel(fixture, modelId);

    for await (const chunk of await model.stream([new HumanMessage('a cube')])) {
      chunks.push(chunk);
    }

    expect(chunks.some((chunk) => chunk.response_metadata['model'] === modelId)).toBe(true);
    expect(chunks.some((chunk) => chunk.response_metadata.model_provider === 'tau')).toBe(true);
  });

  it('should advance to the reasoning + create_file turn after one assistant turn', async () => {
    const message = await replayStep(1);

    expect(message.tool_calls?.[0]).toMatchObject({ name: 'create_file' });
    const reasoning = (Array.isArray(message.content) ? message.content : []).find(
      (block) => typeof block === 'object' && block.type === 'reasoning',
    );
    expect(reasoning).toMatchObject({ type: 'reasoning', reasoning: 'Thinking about the design.' });
  });

  it('should emit the terminal text turn with no tool calls, ending the loop', async () => {
    const message = await replayStep(2);

    expect(message.tool_calls ?? []).toHaveLength(0);
    expect(message.text).toContain('All done.');
    expect(message.usage_metadata).toMatchObject({ input_tokens: 300, output_tokens: 30 });
  });

  it('should not replay a green terminal claim after a failed GeoSpec result', async () => {
    const message = await replayStep(2, JSON.stringify({ failures: [{ id: 'bounds' }], total: 1 }));

    expect(message.text).toContain('GeoSpec validation failed: 1 of 1 tests failed');
    expect(message.text).not.toContain('All done.');
  });

  it('should return an empty message with no tool calls when the script is exhausted', async () => {
    const message = await replayStep(3);

    expect(message.tool_calls ?? []).toHaveLength(0);
    expect(message.text).toBe('');
  });
});
