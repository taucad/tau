// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { collectFinalMessage, collectStreamChunks } from '#testing/stream-consumer.js';
import {
  expectChunkTypesInclude,
  expectHasTextContent,
  expectHasToolCall,
  expectMultipleSteps,
  expectNoErrors,
  expectToolCallSucceeded,
  extractToolCallParts,
} from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, requiresEnv } from '#testing/skip-helpers.js';

const modelId = 'google-gemini-3.5-flash';

const cubeCutoutFiles = Object.fromEntries([
  [
    'package.json',
    `{
  "type": "module"
}
`,
  ],
  [
    'main.kcl',
    `@settings(defaultLengthUnit = mm)

// Define parameters
cubeSize = 40
holeDiameter = 20

// Create the cube solid
cubeSketch = startSketchOn(XY)
  |> rectangle(width = cubeSize, height = cubeSize, center = [0, 0])

cubeSolid = cubeSketch
  |> extrude(length = cubeSize)

// Create the cylinder solid
cylinderSketch = startSketchOn(XY)
  |> circle(center = [0, 0], radius = holeDiameter / 2)

cylinderSolid = cylinderSketch
  |> extrude(length = cubeSize)

// Subtract cylinder from cube to get the final cutout body
finalSolid = subtract([cubeSolid], tools = [cylinderSolid])
`,
  ],
  [
    'main.geospec.ts',
    `import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Cube with cylinder cutout', () => {
  it('should have correct bounding box dimensions and center', async () => {
    const model = await loadModel({ file: 'main.kcl' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 40, y: 40, z: 40 },
      center: { x: 0, y: 0, z: 20 },
      tolerance: 0.1,
    });
  });

  it('should have the expected physical volume', async () => {
    const model = await loadModel({ file: 'main.kcl' });
    expectGeo(model).toHaveVolume({
      value: 51433.63,
      tolerance: 30,
    });
  });

  it('should have the expected physical surface area', async () => {
    const model = await loadModel({ file: 'main.kcl' });
    expectGeo(model).toHaveSurfaceArea({
      value: 11484.95,
      tolerance: 10,
    });
  });

  it('should be a single watertight component', async () => {
    const model = await loadModel({ file: 'main.kcl' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
`,
  ],
  [
    'node_modules/geospec/index.d.ts',
    `export declare const describe: (name: string, fn: () => unknown) => void;
export declare const it: (name: string, fn: () => unknown) => void;
export declare function expectGeo(subject: unknown): {
  toHaveBoundingBox(expectation: unknown): void;
  toHaveVolume(expectation: unknown): void;
  toHaveSurfaceArea(expectation: unknown): void;
  toBeWatertight(): void;
  toHaveConnectedComponents(expectation: unknown): void;
  toBeValidBrep(): void;
  toHaveTopologyCounts(expectation: unknown): void;
  toHaveCylindricalFace(expectation: unknown): void;
  toHaveCircularHole(expectation: unknown): void;
};
`,
  ],
] as const) satisfies Record<string, string>;

describe.skipIf(requiresEnv('GOOGLE_VERTEX_AI_CREDENTIALS'))('Gemini function-call replay (live)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
  });

  it('completes the immediate second provider step after a Gemini tool call', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `gemini-function-call-replay-${Date.now()}`,
        messages: [
          {
            id: 'msg_user_create_file',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'Use the create_file tool exactly once.',
                  'Create main.ts with this exact content:',
                  'export default function main() { return "hello"; }',
                  'After the tool result, reply with one short confirmation sentence.',
                ].join('\n'),
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
    expectMultipleSteps(chunks, 2);

    const finalMessage = await collectFinalMessage(chunks);
    expectHasToolCall(finalMessage, 'create_file');
    expectToolCallSucceeded(finalMessage, 'create_file');
    expect(await testApp.memFs.exists('main.ts')).toBe(true);
  }, 120_000);

  it('streams Gemini thought parts as UI reasoning parts', async () => {
    await testApp.memFs.mkdir('node_modules/geospec', { recursive: true });
    await Promise.all(
      Object.entries(cubeCutoutFiles).map(async ([path, content]) => testApp.memFs.writeFile(path, content)),
    );

    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `gemini-reasoning-parts-${Date.now()}`,
        messages: [
          {
            id: 'msg_user_reasoning',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'a cube with a cylinder cutout, apply maximal geospec coverage',
                  '',
                  'The project already contains main.kcl and main.geospec.ts.',
                  'Read the project files first, think through the BRep coverage gap, then continue with the CAD task.',
                ].join('\n'),
              },
            ],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: {
          ...buildCadAgent(modelId, 'replicad', { testingEnabled: true }),
          snapshot: {
            activeFile: { path: 'main.kcl', name: 'main.kcl' },
            openFiles: [
              { path: 'main.kcl', name: 'main.kcl' },
              { path: 'main.geospec.ts', name: 'main.geospec.ts' },
            ],
          },
        },
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

    const chunks = await collectStreamChunks(response);
    expectNoErrors(chunks);
    expectChunkTypesInclude(chunks, 'reasoning-delta');

    const finalMessage = await collectFinalMessage(chunks);
    const reasoningText = finalMessage.parts
      .filter((part) => part.type === 'reasoning')
      .map((part) => part.text)
      .join('');
    expect(reasoningText.trim().length).toBeGreaterThan(0);
  }, 180_000);

  it('replays parallel project-inspection tool calls without losing Gemini thought signatures', async () => {
    await testApp.memFs.mkdir('node_modules/geospec', { recursive: true });
    await Promise.all(
      Object.entries(cubeCutoutFiles).map(async ([path, content]) => testApp.memFs.writeFile(path, content)),
    );

    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `gemini-parallel-project-inspection-${Date.now()}`,
        messages: [
          {
            id: 'msg_user_add_brep_geospec',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'we need to add brep geospec tests, add these too',
                  '',
                  'The project already contains main.kcl and main.geospec.ts.',
                  'Read the contents of all three files in a single assistant turn so they execute in parallel:',
                  '- main.kcl',
                  '- main.geospec.ts',
                  '- node_modules/geospec/index.d.ts',
                  'Then summarize what BRep GeoSpec coverage is missing.',
                ].join('\n'),
              },
            ],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: {
          ...buildCadAgent(modelId, 'replicad', { testingEnabled: true }),
          snapshot: {
            activeFile: { path: 'main.kcl', name: 'main.kcl' },
            openFiles: [
              { path: 'main.kcl', name: 'main.kcl' },
              { path: 'main.geospec.ts', name: 'main.geospec.ts' },
            ],
          },
        },
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

    const chunks = await collectStreamChunks(response);
    expectNoErrors(chunks);
    expectMultipleSteps(chunks, 2);

    const finalMessage = await collectFinalMessage(chunks);
    const completedReads = extractToolCallParts(finalMessage, 'read_file').filter(
      (part) => part.state === 'output-available',
    );
    const incompleteReads = extractToolCallParts(finalMessage, 'read_file').filter(
      (part) => part.state !== 'output-available',
    );
    expect(
      completedReads.length,
      `Expected Gemini Flash to inspect at least two project files; observed ${completedReads.length}`,
    ).toBeGreaterThanOrEqual(2);
    expect(incompleteReads).toEqual([]);
    expectHasTextContent(finalMessage);
  }, 180_000);
});
