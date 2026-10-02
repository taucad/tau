// @vitest-environment node
import { deflateSync } from 'node:zlib';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RpcGraphicsClient } from '@taucad/chat/rpc';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import { expectNoErrors, expectHasTextContent, expectToolCallSucceeded } from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, requiresEnv } from '#testing/skip-helpers.js';

/**
 * Live regression for the OpenAI tool-result image fix.
 *
 * Pre-fix, `injectScreenshotImages` emits `text` / `image_url` blocks on a
 * `ToolMessage`. `langchain-openai`'s Responses converter only forwards a tool
 * message's content array as a typed `function_call_output.output` list when
 * every block is `input_text|input_image|input_file`; anything else falls back
 * to `JSON.stringify`, which surfaces base64 image bytes to GPT-5.5 as raw
 * text. The model then either confabulates a generic shape ("a bracket / a
 * mounting fixture") or, when honest, says it can only see "a base64 string".
 *
 * The fix lives in `createCrossProviderContentNormalizerMiddleware`: for
 * `targetProvider === 'openai'`, ToolMessage `image_url` blocks are rewritten
 * to `input_image`, and `text` blocks to `input_text`, so the entire array
 * satisfies `isProviderNativeContent` and is forwarded as a typed list.
 *
 * This test forces the failure scenario from the bug report:
 *  - mid-conversation (one prior user/assistant exchange before the screenshot)
 *  - explicit colour-quadrant prompt that cannot be answered by hallucination
 *  - distinctive 4-quadrant PNG (red / blue / green / yellow) rendered in pure
 *    Node so the test has no native image-encoding dependency
 *
 * Skipped automatically when `OPENAI_API_KEY` is missing.
 */

// ---------------------------------------------------------------------------
// Pure-Node PNG encoder for a 4-quadrant test fixture
// (RGB, no alpha, no native deps; deterministic output)
//
// Bitwise operators are intrinsic to PNG's CRC32 spec and to PNG's binary
// header packing; the rule is disabled for this self-contained block only.
// ---------------------------------------------------------------------------

/* oxlint-disable no-bitwise, unicorn/prefer-math-trunc -- CRC32 needs bitwise unsigned-32 coercion (`>>> 0`); Math.trunc is not equivalent for the negative intermediate values produced by XOR */

const buildCrcTable = (): Uint32Array => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) === 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
};

const crcTable = buildCrcTable();

const crc32 = (buffer: Uint8Array<ArrayBuffer>): number => {
  let crc = 0xff_ff_ff_ff;
  for (const b of buffer) {
    crc = (crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
};

const pngChunk = (type: string, data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crcBytes]);
};

const buildFourQuadrantPng = (size: number): Uint8Array<ArrayBuffer> => {
  const half = size / 2;
  const bytesPerRow = 1 + size * 3; // One filter byte plus three RGB bytes per pixel.
  const raw = Buffer.alloc(bytesPerRow * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // PNG filter type "None"
    for (let x = 0; x < size; x++) {
      const top = y < half;
      const left = x < half;
      let r = 0;
      let g = 0;
      let b = 0;
      if (top && left) {
        r = 255;
      } else if (top && !left) {
        b = 255;
      } else if (!top && left) {
        g = 255;
      } else {
        r = 255;
        g = 255;
      }
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // Bit depth.
  ihdr[9] = 2; // Colour type: RGB.
  ihdr[10] = 0; // Compression method.
  ihdr[11] = 0; // Filter method.
  ihdr[12] = 0; // Interlace method.

  // `deflateSync` returns `Buffer<ArrayBufferLike>`; copy into a fresh `Buffer<ArrayBuffer>`
  // to satisfy the `enforce-uint8array-arraybuffer` typing contract on `pngChunk`.
  const idat = Buffer.from(deflateSync(raw));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
};

/* oxlint-enable no-bitwise, unicorn/prefer-math-trunc -- end of CRC32 / PNG byte-packing block */

const fixturePng = buildFourQuadrantPng(256);
const fixtureDataUrl = `data:image/png;base64,${Buffer.from(fixturePng).toString('base64')}`;

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

const modelId = 'openai-gpt-5.5';

describe.skipIf(requiresEnv('OPENAI_API_KEY'))('OpenAI screenshot vision (live)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    const graphicsStub: RpcGraphicsClient = {
      async captureScreenshot() {
        return {
          success: true,
          images: [{ view: 'current', dataUrl: fixtureDataUrl }],
        };
      },
      async captureObservations() {
        return {
          success: false,
          errorCode: 'IO_ERROR',
          message: 'captureObservations is unused in this scenario',
        };
      },
      async fetchGeometry() {
        return {
          success: false,
          errorCode: 'IO_ERROR',
          message: 'fetchGeometry is unused in this scenario',
        };
      },
      async exportGeometry() {
        return {
          success: false,
          errorCode: 'IO_ERROR',
          message: 'exportGeometry is unused in this scenario',
        };
      },
    };
    testApp = await createTestApp({ graphicsStub });
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
  });

  it('GPT-5.5 sees real screenshot pixels mid-conversation (4-quadrant colour identification)', async () => {
    const threadId = `openai-screenshot-vision-${Date.now()}`;

    // Persist the file the agent will be told to screenshot — the chat
    // controller validates against the runtime filesystem in some paths.
    await testApp.memFs.writeFile('main.ts', '// placeholder for screenshot test\nexport const x = 1;');

    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [
          {
            id: 'msg_user_1',
            role: 'user',
            parts: [{ type: 'text', text: 'I am about to ask you to inspect a screenshot. Reply OK.' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_assistant_1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'OK', state: 'done' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_user_2',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'Take a single screenshot of main.ts using the screenshot tool.',
                  'Then look at the image and tell me which solid colour appears in each of the four quadrants',
                  '(top-left, top-right, bottom-left, bottom-right).',
                  'Be explicit and name each colour by word.',
                ].join(' '),
              },
            ],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

    const chunks = await collectStreamChunks(response);
    expectNoErrors(chunks);

    const message = await collectFinalMessage(chunks);
    expectHasTextContent(message);
    expectToolCallSucceeded(message, 'screenshot');

    const replyText = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join(' ')
      .toLowerCase();

    // If GPT-5.5 only saw a stringified base64 blob (the pre-fix bug), it
    // either honestly says "I can only see base64" or hallucinates a generic
    // CAD shape. Either way it cannot enumerate the four quadrant colours.
    // Post-fix, the typed `function_call_output` list lands as real image
    // input and the model identifies all four colours.
    expect(replyText, `Reply must mention 'red'. Got: ${replyText}`).toContain('red');
    expect(replyText, `Reply must mention 'blue'. Got: ${replyText}`).toContain('blue');
    expect(replyText, `Reply must mention 'green'. Got: ${replyText}`).toContain('green');
    expect(replyText, `Reply must mention 'yellow'. Got: ${replyText}`).toContain('yellow');

    // Negative guard: if base64 leaks into the model context, it tends to
    // surface in the reply ("I see a base64 string", "encoded image", etc.).
    expect(replyText, `Reply suggests model only saw raw base64 text: ${replyText}`).not.toContain('base64');
  }, 180_000);
});
