import { describe, expect, it, vi } from 'vitest';
import { estimateContextTokens } from '@earendil-works/pi-agent-core';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { ToolRegistry } from '#waist/ports.js';
import { applyHostToolResult, createAgentTools, normalizeToolInput, toPiToolContent } from '#harness/tools.js';
import type { HostToolExecutionDetails } from '#harness/tools.js';
import { MessageIdentities, piMessageToProvider, providerMessageToPi } from '#harness/session-record.js';
import { trimToolResultContext } from '#harness/cad-middleware.js';

describe('ToolInputCompatibility', () => {
  it('heals test_model bracket arrays and rooted project paths before validation', () => {
    expect(
      normalizeToolInput('test_model', {
        'files[0]': '/main.ts',
        'files[1]': './tests/../other.ts',
      }),
    ).toEqual({ files: ['main.ts', 'other.ts'] });
    expect(normalizeToolInput('read_file', { targetFile: '/src/main.ts' })).toEqual({
      targetFile: 'src/main.ts',
    });
  });

  it('leaves canonical collisions unchanged for strict schema validation', () => {
    const input = { files: ['canonical.ts'], 'files[0]': 'alias.ts' };
    expect(normalizeToolInput('test_model', input)).toBe(input);
  });

  it('leaves UNC paths unchanged for strict schema validation', () => {
    const input = { targetFile: '//server/share' };
    expect(normalizeToolInput('read_file', input)).toBe(input);
  });

  it.each(['/../main.ts', String.raw`C:\main.ts`, 'file:///main.ts'])(
    'leaves unsafe path alias %s unchanged',
    (path) => {
      const input = { targetFile: path };
      expect(normalizeToolInput('read_file', input)).toBe(input);
    },
  );

  it('leaves unsupported bracket aliases for strict schema validation', () => {
    const unindexed = { 'files[]': 'main.ts' };
    const leadingZero = { 'files[00]': 'main.ts' };
    expect(normalizeToolInput('test_model', unindexed)).toBe(unindexed);
    expect(normalizeToolInput('test_model', leadingZero)).toBe(leadingZero);
  });
});

describe('EagerDispatch', () => {
  it('ports SP-8 T4 by substituting inside AgentTool.execute', async () => {
    const invoke = vi.fn(async () => ({ content: { real: true }, isError: false }));
    const registry: ToolRegistry = {
      list: () => [
        {
          name: 'read_file',
          description: 'Read a file',
          inputSchema: { type: 'object', properties: { targetFile: { type: 'string' } } },
        },
      ],
      invoke,
    };
    const [tool] = createAgentTools({
      registry,
      substitute: async () => ({ content: { cached: true }, isError: false }),
    });

    const result = await tool!.execute('call-1', { targetFile: 'main.ts' });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.content).toEqual([{ type: 'text', text: '{"cached":true}' }]);
    expect(result.details).toEqual({ content: { cached: true }, isError: false, substituted: true });
    expect(applyHostToolResult({ result })).toEqual({ isError: false });
  });
});

/**
 * Base64 characters one 1600² lossless webp view encodes to.
 *
 * Taken from the measurement in the FIX-SCREENSHOT addendum: six views were
 * ~165 000 tokens against a 200 000-token window, and pi estimates a text block
 * at one token per four characters.
 */
const base64PerView = 110_000;

const captureBase64 = (view: string): string => `${view}${'A'.repeat(base64PerView - view.length)}`;

/** The shape both placements' `screenshot` returns; only the encoder differs. */
const captureResult = (views: readonly string[]) => ({
  success: true,
  images: views.map((view) => ({ view, dataUrl: `data:image/webp;base64,${captureBase64(view)}` })),
});

const multiAngleViews = ['front', 'back', 'right', 'left', 'top', 'bottom'] as const;

const captureRegistry = (views: readonly string[]): ToolRegistry => ({
  list: () => [
    {
      name: 'screenshot',
      description: 'Capture the rendered model',
      inputSchema: { type: 'object', properties: { targetFile: { type: 'string' } } },
    },
  ],
  invoke: async () => ({ content: captureResult(views), isError: false }),
});

const captureToolResult = async (views: readonly string[]): Promise<AgentMessage> => {
  const [tool] = createAgentTools({ registry: captureRegistry(views) });
  const result = await tool!.execute('call-capture', { targetFile: 'main.scad', mode: 'multi_angle' });
  // Restated rather than read off `AgentToolResult`, whose `details` is `any`.
  const details: HostToolExecutionDetails = { content: captureResult(views), isError: false, substituted: false };
  expect(result.details).toEqual(details);
  return {
    role: 'toolResult',
    toolCallId: 'call-capture',
    toolName: 'screenshot',
    content: result.content,
    details,
    isError: false,
    timestamp: 0,
  };
};

const textOf = (message: AgentMessage): string =>
  message.role === 'toolResult'
    ? message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
    : '';

const piModel: Model<Api> = {
  id: 'capture-model',
  name: 'capture-model',
  api: 'anthropic-messages',
  provider: 'anthropic',
  baseUrl: '',
  reasoning: true,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200_000,
  maxTokens: 8192,
};

describe('CaptureToolResults', () => {
  it('gives the model image blocks and a short summary instead of inlined base64', async () => {
    const message = await captureToolResult(multiAngleViews);
    if (message.role !== 'toolResult') {
      throw new TypeError('The capture must produce a tool result.');
    }

    expect(message.content).toHaveLength(multiAngleViews.length + 1);
    expect(message.content[0]).toMatchObject({ type: 'text' });
    expect(message.content.slice(1)).toEqual(
      multiAngleViews.map((view) => ({ type: 'image', mimeType: 'image/webp', data: captureBase64(view) })),
    );
    // The whole point: no text block may carry a payload.
    expect(textOf(message).length).toBeLessThan(500);
  });

  it('keeps a capture inside pi and compaction accounting at the image-block estimate', async () => {
    const single = await captureToolResult(['isometric']);
    const multi = await captureToolResult(multiAngleViews);
    const asText = (views: readonly string[]): AgentMessage => ({
      role: 'toolResult',
      toolCallId: 'call-capture',
      toolName: 'screenshot',
      content: [{ type: 'text', text: JSON.stringify(captureResult(views)) }],
      isError: false,
      timestamp: 0,
    });

    // The defect's own measurement, for the record: stringified, six views are
    // most of a 200 000-token window; as image blocks pi charges 1200 each.
    expect(estimateContextTokens([asText(multiAngleViews)]).tokens).toBeGreaterThan(160_000);
    expect(estimateContextTokens([single]).tokens).toBeLessThan(1400);
    expect(estimateContextTokens([multi]).tokens).toBeLessThan(7500);
  });

  it('records the durable row as the structured capture, never as base64 text', async () => {
    const identities = new MessageIdentities(() => 'message-1');
    const message = await captureToolResult(multiAngleViews);

    const durable = piMessageToProvider(message, identities);

    expect(durable).toMatchObject({ role: 'tool-output', toolName: 'screenshot', isError: false });
    // The transcript's only source of pixels stays structured JSON — one
    // `dataUrl` per view, and no second copy anywhere in the row.
    expect(durable.content).toEqual(captureResult(multiAngleViews));
    const serialized = JSON.stringify(durable);
    for (const view of multiAngleViews) {
      expect(serialized.split(captureBase64(view))).toHaveLength(2);
    }
  });

  it('rehydrates a durable capture back into image blocks', async () => {
    const identities = new MessageIdentities(() => 'message-1');
    const durable = piMessageToProvider(await captureToolResult(multiAngleViews), identities);
    if (durable.role !== 'tool-output') {
      throw new TypeError('The capture must record a tool-output row.');
    }

    const hydrated = providerMessageToPi(durable, piModel, identities);

    expect(hydrated.role === 'toolResult' && hydrated.content.filter((block) => block.type === 'image')).toHaveLength(
      multiAngleViews.length,
    );
    expect(textOf(hydrated).length).toBeLessThan(500);
  });

  it('sends the image blocks over the wire the transport rebuilds from the durable row', async () => {
    const identities = new MessageIdentities(() => 'message-1');
    const trimmed = trimToolResultContext([await captureToolResult(multiAngleViews)]);

    // What `createTransportStreamFunction` puts on the wire, then what pi's
    // codec is handed at the far end (`piContextFor`).
    const onWire = piMessageToProvider(trimmed[0]!, identities);
    if (onWire.role !== 'tool-output') {
      throw new TypeError('The capture must record a tool-output row.');
    }
    const forProvider = providerMessageToPi(onWire, piModel, identities);

    expect(
      forProvider.role === 'toolResult' && forProvider.content.filter((block) => block.type === 'image'),
    ).toHaveLength(multiAngleViews.length);
  });

  it('leaves non-capture tool results as JSON text', async () => {
    const registry: ToolRegistry = {
      list: () => [{ name: 'get_kernel_result', description: 'Render', inputSchema: { type: 'object' } }],
      invoke: async () => ({ content: { success: true, status: 'ready' }, isError: false }),
    };
    const [tool] = createAgentTools({ registry });

    const result = await tool!.execute('call-1', { targetFile: 'main.scad' });

    expect(result.content).toEqual([{ type: 'text', text: '{"success":true,"status":"ready"}' }]);
    expect(toPiToolContent({ images: 'not an array' })).toEqual([{ type: 'text', text: '{"images":"not an array"}' }]);
  });
});
