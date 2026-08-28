// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { UIMessage, UIMessageChunk } from 'ai';
import type { GlobSearchRpcSuccess, ListDirectoryRpcSuccess } from '@taucad/chat';
import type { RpcGeoSpecClient } from '@taucad/chat/rpc';
import {
  planetaryGearGeoSpec,
  planetaryGearLibrary,
  planetaryGearMain,
} from '#api/tau-replay/fixtures/planetary-gear-composite.fixture.js';
import { tauReplayCompositeModelId } from '#api/tau-replay/tau-replay.service.js';
import { createTestApp } from '#testing/create-test-app.js';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import { expectToolCallOutput, extractToolCallParts } from '#testing/stream-assertions.js';
import {
  buildTauReplayModelService,
  geospecStub,
  imagesStub,
  postCompositeChat,
  postCubeChat,
  seedCompositeProject,
  seedCubeProject,
} from '#testing/tau-replay-test-support.js';

const usageParts = (message: UIMessage): Array<{ inputTokens: number; outputTokens: number; totalCost: number }> =>
  message.parts.flatMap((part) =>
    part.type === 'data-usage' ? [part.data as { inputTokens: number; outputTokens: number; totalCost: number }] : [],
  );

const partText = (message: UIMessage, type: 'reasoning' | 'text'): string =>
  message.parts.flatMap((part) => (part.type === type && 'text' in part ? [part.text] : [])).join('');

describe('Tau replay provider (hermetic)', () => {
  it('replays one composite chat through successful primary and secondary JSCAD compilation units', async () => {
    const testApp = await createTestApp({
      modelService: buildTauReplayModelService(tauReplayCompositeModelId),
      geospecStub,
      imagesStub,
    });
    const chatId = `tau_replay_composite_${Date.now()}`;

    try {
      await seedCompositeProject(testApp);

      const response = await postCompositeChat(testApp, chatId);
      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks: UIMessageChunk[] = await collectStreamChunks(response);
      expect(chunks.find((chunk) => chunk.type === 'error')).toBeUndefined();

      const message = await collectFinalMessage(chunks);
      expect(await testApp.memFs.readFile('main.ts', 'utf8')).toBe(planetaryGearMain);
      expect(await testApp.memFs.readFile('lib/planetaryGear.ts', 'utf8')).toBe(planetaryGearLibrary);
      expect(await testApp.memFs.readFile('main.geospec.ts', 'utf8')).toBe(planetaryGearGeoSpec);

      const compilationUnits = extractToolCallParts(message, 'get_kernel_result');
      expect(compilationUnits).toHaveLength(2);
      expect(compilationUnits.map(({ input }) => input)).toEqual([
        { targetFile: 'main.ts' },
        { targetFile: 'lib/planetaryGear.ts' },
      ]);
      expect(compilationUnits.map(({ state, output }) => ({ state, output }))).toEqual([
        { state: 'output-available', output: { status: 'ready', kernelIssues: [] } },
        { state: 'output-available', output: { status: 'ready', kernelIssues: [] } },
      ]);
      expectToolCallOutput(message, 'test_model', (output) => {
        expect(output).toMatchObject({ failures: [], passed: 1, total: 1 });
      });
      const screenshots = extractToolCallParts(message, 'screenshot');
      expect(screenshots).toHaveLength(1);
      expect(screenshots[0]).toMatchObject({
        state: 'output-available',
        input: { mode: 'multi_angle', targetFile: 'main.ts' },
      });
      expect((screenshots[0]!.output as { images: Array<{ view: string }> }).images.map(({ view }) => view)).toEqual([
        'front',
        'back',
        'right',
        'left',
        'top',
        'bottom',
      ]);
      expect(partText(message, 'reasoning')).toContain('5,000–80,000 rendered vertices');
      expect(partText(message, 'text')).toContain('multi-file planetary gear system');

      const usage = usageParts(message);
      expect(usage.reduce((sum, part) => sum + part.inputTokens, 0)).toBe(10_700);
      expect(usage.reduce((sum, part) => sum + part.outputTokens, 0)).toBe(870);
      expect(usage.reduce((sum, part) => sum + part.totalCost, 0)).toBeGreaterThan(0);
    } finally {
      await testApp.app.close();
    }
  }, 30_000);

  it('replays the cube-cutout transcript through the real chat pipeline: reasoning, tool calls, files, text, usage', async () => {
    const testApp = await createTestApp({ modelService: buildTauReplayModelService(), geospecStub, imagesStub });
    const chatId = `tau_replay_${Date.now()}`;

    try {
      await seedCubeProject(testApp);
      await testApp.memFs.mkdir('checks', { recursive: true });
      await testApp.memFs.writeFile('checks/existing.geospec.ts', "it('should preserve an existing check');\n");

      const response = await postCubeChat(testApp, chatId);
      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks: UIMessageChunk[] = await collectStreamChunks(response);
      expect(chunks.find((chunk) => chunk.type === 'error')).toBeUndefined();

      const message = await collectFinalMessage(chunks);

      // Reasoning + final text blocks streamed through as the real path does.
      expect(partText(message, 'reasoning')).toContain('Designing geometric primitives');
      expect(partText(message, 'text')).toContain('parametric cube');

      // Root discovery crosses HTTP, the agent tool, RPC dispatch, and the strict
      // headless runtime adapter. Nested entries must stay project-relative.
      expectToolCallOutput(message, 'list_directory', (output) => {
        const listOutput = output as Omit<ListDirectoryRpcSuccess, 'success'>;
        expect(listOutput.entries.every((entry) => typeof entry.modifiedAt === 'string')).toBe(true);
        expect(listOutput).toEqual({
          path: '',
          entries: [
            {
              name: 'tau.json',
              type: 'file',
              size: 31,
              contentKind: 'text',
              lineCount: 1,
              modifiedAt: listOutput.entries[0]!.modifiedAt,
            },
            {
              name: 'package.json',
              type: 'file',
              size: 21,
              contentKind: 'text',
              lineCount: 2,
              modifiedAt: listOutput.entries[1]!.modifiedAt,
            },
            {
              name: 'main.scad',
              type: 'file',
              size: 0,
              contentKind: 'text',
              lineCount: 1,
              modifiedAt: listOutput.entries[2]!.modifiedAt,
            },
            { name: 'checks', type: 'dir', size: 0, modifiedAt: listOutput.entries[3]!.modifiedAt },
            { name: '.tau', type: 'dir', size: 0, modifiedAt: listOutput.entries[4]!.modifiedAt },
          ],
        });
      });
      expectToolCallOutput(message, 'glob_search', (output) => {
        const globOutput = output as Omit<GlobSearchRpcSuccess, 'success'>;
        expect(typeof globOutput.entries[0]?.modifiedAt).toBe('string');
        expect(globOutput).toEqual({
          files: ['checks/existing.geospec.ts'],
          entries: [
            {
              path: 'checks/existing.geospec.ts',
              isDirectory: false,
              size: 41,
              contentKind: 'text',
              lineCount: 2,
              modifiedAt: globOutput.entries[0]!.modifiedAt,
            },
          ],
          totalFiles: 1,
        });
      });

      // The scripted file tools executed for real against memFs.
      expect(await testApp.memFs.readFile('main.geospec.ts', 'utf8')).toContain('toBeWatertight');
      expect(await testApp.memFs.readFile('main.scad', 'utf8')).toContain('cylinder_radius = 5');

      // Per-turn usage summed to the recorded totals, and cost metered > 0.
      const usage = usageParts(message);
      const totalIn = usage.reduce((sum, part) => sum + part.inputTokens, 0);
      const totalOut = usage.reduce((sum, part) => sum + part.outputTokens, 0);
      const totalCost = usage.reduce((sum, part) => sum + part.totalCost, 0);
      expect(totalIn).toBe(25_559);
      expect(totalOut).toBe(1160);
      expect(totalCost).toBeGreaterThan(0);
    } finally {
      await testApp.app.close();
    }
  }, 30_000);

  it('keeps a failed GeoSpec result red in the terminal agent response', async () => {
    const failedGeoSpec: RpcGeoSpecClient = {
      async runTests() {
        return {
          success: true,
          failures: [
            {
              id: 'bounds',
              requirement: 'Cube dimensions',
              reason: 'Expected 20 mm, received 20000 mm.',
              suggestion: 'Correct the source-unit normalization.',
              targetFile: 'main.scad',
            },
          ],
          passes: [],
          passed: 0,
          total: 1,
        };
      },
    };
    const testApp = await createTestApp({
      modelService: buildTauReplayModelService(),
      geospecStub: failedGeoSpec,
      imagesStub,
    });
    const chatId = `tau_replay_failed_${Date.now()}`;

    try {
      await seedCubeProject(testApp);
      const response = await postCubeChat(testApp, chatId);
      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const message = await collectFinalMessage(await collectStreamChunks(response));
      const text = partText(message, 'text');
      expect(text).toContain('GeoSpec validation failed: 1 of 1 tests failed');
      expect(text).not.toContain('passed successfully');
    } finally {
      await testApp.app.close();
    }
  }, 30_000);
});
