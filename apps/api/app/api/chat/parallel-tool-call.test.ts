/* eslint-disable @typescript-eslint/naming-convention -- LangChain message constructors expose snake_case tool fields. */
import { describe, expect, it } from 'vitest';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { createAgent, FakeToolCallingModel } from 'langchain';
import { z } from 'zod';

/**
 * Builds a deterministic `createAgent` (the production agent constructor) whose first
 * model turn emits two parallel `tool_calls` and whose second turn emits a plain text
 * reply. This exercises the same `tool_calls.map(call => new Send('tools', ...))`
 * fan-out path used at runtime, where each parallel tool becomes its own Pregel task.
 */
function buildParallelAgent(): ReturnType<typeof createAgent> {
  const lookupCity = tool(async ({ name }: { name: string }) => `city:${name}`, {
    name: 'lookup_city',
    description: 'Look up a city by name.',
    schema: z.object({ name: z.string() }),
  });

  const lookupWeather = tool(async ({ name }: { name: string }) => `weather:${name}`, {
    name: 'lookup_weather',
    description: 'Look up weather by city name.',
    schema: z.object({ name: z.string() }),
  });

  const llm = new FakeToolCallingModel({
    toolCalls: [
      [
        { id: 'call_city', name: 'lookup_city', args: { name: 'sf' } },
        { id: 'call_weather', name: 'lookup_weather', args: { name: 'sf' } },
      ],
      [],
    ],
  });

  return createAgent({
    model: llm,
    tools: [lookupCity, lookupWeather],
  });
}

/**
 * Drives the agent and returns the ToolMessages it emitted, in arrival order.
 */
async function runAgent(
  agent: ReturnType<typeof createAgent>,
  config: { maxConcurrency?: number } = {},
): Promise<ToolMessage[]> {
  const result = (await agent.invoke(
    { messages: [new HumanMessage('What is the weather in SF?')] },
    { recursionLimit: 10, ...config },
  )) as { messages: unknown[] };

  const toolMessages: ToolMessage[] = [];
  for (const message of result.messages) {
    if (message instanceof ToolMessage) {
      // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- ToolMessage's generic parameter widens to `any` after instanceof narrowing; the value is already runtime-validated.
      toolMessages.push(message as ToolMessage);
    }
  }

  return toolMessages;
}

describe('LangGraph parallel tool dispatch', () => {
  it('runs both parallel tools when no concurrency cap is set (production config)', async () => {
    const agent = buildParallelAgent();

    const toolMessages = await runAgent(agent);

    const toolCallIds = toolMessages.map((message) => message.tool_call_id).sort();
    expect(toolCallIds).toEqual(['call_city', 'call_weather']);
  });

  // Documents an upstream off-by-one in @langchain/langgraph 1.1.5
  // `PregelRunner._executeTasksWithRetry`: when `maxConcurrency` is below
  // `tasks.length`, the outer `while` loop terminates after the first task
  // resolves and the remaining tasks are silently dropped from the superstep.
  // If this test starts passing in a future LangGraph release, the cap is safe
  // to reintroduce as a durability lever; until then, the chat controller must
  // run parallel tool calls unthrottled (see `chat.controller.ts`).
  it.fails('drops second parallel tool call when maxConcurrency is below task count (upstream bug)', async () => {
    const agent = buildParallelAgent();

    const toolMessages = await runAgent(agent, { maxConcurrency: 1 });

    const toolCallIds = toolMessages.map((message) => message.tool_call_id).sort();
    expect(toolCallIds).toEqual(['call_city', 'call_weather']);
  });

  it('runs a current tool call when history contains an old deterministic Gemini tool id', async () => {
    let invocationCount = 0;
    const historicalToolCallId = 'call_ad6083d2';
    const currentToolCallId = 'lc-tool-call-current-stream-0';

    const readFile = tool(
      async ({ targetFile }: { targetFile: string }) => {
        invocationCount += 1;
        return `read:${targetFile}`;
      },
      {
        name: 'read_file',
        description: 'Read a file.',
        schema: z.object({ targetFile: z.string() }),
      },
    );

    const llm = new FakeToolCallingModel({
      toolCalls: [[{ id: currentToolCallId, name: 'read_file', args: { targetFile: 'main.scad' } }], []],
    });

    const agent = createAgent({
      model: llm,
      tools: [readFile],
    });

    const result = (await agent.invoke(
      {
        messages: [
          new HumanMessage('read the old file'),
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: historicalToolCallId,
                name: 'read_file',
                args: { targetFile: 'old.scad' },
                type: 'tool_call',
              },
            ],
          }),
          new ToolMessage({
            content: 'read:old.scad',
            name: 'read_file',
            tool_call_id: historicalToolCallId,
          }),
          new HumanMessage('continue'),
        ],
      },
      { recursionLimit: 10 },
    )) as { messages: unknown[] };

    const toolMessages: ToolMessage[] = [];
    for (const message of result.messages) {
      if (message instanceof ToolMessage) {
        // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- ToolMessage's generic parameter widens to `any` after instanceof narrowing; the value is already runtime-validated.
        toolMessages.push(message as ToolMessage);
      }
    }

    expect(invocationCount).toBe(1);
    expect(toolMessages.map((message) => message.tool_call_id)).toContain(currentToolCallId);
  });
});
