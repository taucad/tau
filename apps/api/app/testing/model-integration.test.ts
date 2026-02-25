import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import {
  expectHasTextContent,
  expectHasReasoningParts,
  expectHasToolCall,
  expectToolCallSucceeded,
  expectChunkTypesInclude,
  expectIncrementalToolInput,
  expectNoErrors,
  expectMultipleSteps,
} from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';

const modelId = process.env['TEST_MODEL_ID'] ?? 'anthropic-claude-sonnet-4.6';

describe(`Model Integration: ${modelId}`, () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    if (testApp?.app) {
      await testApp.app.close();
    }
  });

  it('should stream SSE response with text content', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `test-thread-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'Create a 2mm cube centered on the origin in main.ts using Replicad. Use the create_file tool to write the file.',
              },
            ],
            metadata: {
              model: modelId,
              kernel: 'replicad',
            },
          },
        ],
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const chunks = await collectStreamChunks(response);
    expect(chunks.length).toBeGreaterThan(0);

    expectChunkTypesInclude(chunks, 'text-start');

    const message = await collectFinalMessage(chunks);
    expect(message.role).toBe('assistant');
    expectHasTextContent(message);
  });

  it('should stream reasoning tokens when the model supports thinking', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `test-thread-reasoning-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'What is the sum of 127 and 354? Think step by step.',
              },
            ],
            metadata: {
              model: modelId,
              kernel: 'replicad',
            },
          },
        ],
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

    const chunks = await collectStreamChunks(response);
    expect(chunks.length).toBeGreaterThan(0);

    expectChunkTypesInclude(chunks, 'reasoning-start');

    const message = await collectFinalMessage(chunks);
    expect(message.role).toBe('assistant');
    expectHasReasoningParts(message);
    expectHasTextContent(message);
  });

  it('should use tool calls when requested', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `test-thread-tools-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'Create a file called main.ts with the following content: export default function main() { return "hello"; }',
              },
            ],
            metadata: {
              model: modelId,
              kernel: 'replicad',
            },
          },
        ],
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

    const chunks = await collectStreamChunks(response);
    const message = await collectFinalMessage(chunks);

    expectHasToolCall(message, 'create_file');
    expectToolCallSucceeded(message, 'create_file');

    // The model may write to 'main.ts' or '/main.ts' - check both
    const fileExists =
      (await testApp.memFs.exists('main.ts')) || (await testApp.memFs.exists('/main.ts'));
    expect(fileExists, 'Expected main.ts to exist in the in-memory filesystem').toBe(true);

    const path = (await testApp.memFs.exists('main.ts')) ? 'main.ts' : '/main.ts';
    const mainTs = await testApp.memFs.readFile(path, 'utf8');
    expect(mainTs).toBeTruthy();
  });

  it('should complete multi-turn tool execution without errors', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `test-thread-multiturn-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'Create a simple cube in main.ts using Replicad.',
                  'Think through the approach first using the reasoning tool, then create the file.',
                  'The file should contain:',
                  '',
                  'import { makeBaseBox } from "replicad";',
                  '',
                  'export const defaultParams = { size: 20 };',
                  '',
                  'export default function main(p = defaultParams) {',
                  '  return makeBaseBox(p.size, p.size, p.size);',
                  '}',
                ].join('\n'),
              },
            ],
            metadata: {
              model: modelId,
              kernel: 'replicad',
            },
          },
        ],
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

    const chunks = await collectStreamChunks(response);
    const chunkTypes = chunks.map((c) => c.type);
    console.log('Multi-turn chunk types:', JSON.stringify(chunkTypes));

    // No error chunks should be present (catches 400s on second model invocation)
    expectNoErrors(chunks);

    // The agent should complete multiple steps: reasoning → create_file → text response
    expectMultipleSteps(chunks, 2);

    // Should have completed the tool call
    expectHasToolCall(await collectFinalMessage(chunks), 'create_file');
  }, 120_000);

  it('should handle parallel tool calls without errors', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `test-thread-parallel-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'I need you to do two things at once:',
                  '1. Think through your approach using the reasoning tool',
                  '2. Create a file called main.ts with this content:',
                  '',
                  'import { makeBaseBox } from "replicad";',
                  '',
                  'export const defaultParams = { size: 10 };',
                  '',
                  'export default function main(p = defaultParams) {',
                  '  return makeBaseBox(p.size, p.size, p.size);',
                  '}',
                  '',
                  'Use both tools in the same response.',
                ].join('\n'),
              },
            ],
            metadata: {
              model: modelId,
              kernel: 'replicad',
            },
          },
        ],
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

    const chunks = await collectStreamChunks(response);
    const chunkTypes = chunks.map((c) => c.type);
    console.log('Parallel tool call chunk types:', JSON.stringify(chunkTypes));

    expectNoErrors(chunks);

    const message = await collectFinalMessage(chunks);
    expectHasToolCall(message, 'create_file');

    // Verify tool-input-available chunks have non-empty input
    const toolInputAvailable = chunks.filter((c) => c.type === 'tool-input-available');
    for (const chunk of toolInputAvailable) {
      if ('input' in chunk) {
        expect(
          chunk.input,
          'Expected tool-input-available to have non-empty input',
        ).toBeTruthy();
      }
    }
  }, 120_000);

  it('should stream tool call arguments incrementally', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `test-thread-incremental-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'Create a file called main.ts with the following Replicad code.',
                  'The file content should be multi-line and non-trivial so it streams incrementally:',
                  '',
                  'import { draw, drawCircle } from "replicad";',
                  '',
                  'export const defaultParams = {};',
                  '',
                  'export default function main() {',
                  '  const base = draw()',
                  '    .hLine(50)',
                  '    .vLine(30)',
                  '    .hLine(-50)',
                  '    .close()',
                  '    .sketchOnPlane("XY")',
                  '    .extrude(20);',
                  '',
                  '  const hole = drawCircle(8)',
                  '    .sketchOnPlane("XY", 20)',
                  '    .extrude(-20);',
                  '',
                  '  return base.cut(hole);',
                  '}',
                  '',
                  'Use the create_file tool to write this exact content.',
                ].join('\n'),
              },
            ],
            metadata: {
              model: modelId,
              kernel: 'replicad',
            },
          },
        ],
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

    const chunks = await collectStreamChunks(response);
    const message = await collectFinalMessage(chunks);

    expectHasToolCall(message, 'create_file');
    expectIncrementalToolInput(chunks, 'create_file');
  });
});
