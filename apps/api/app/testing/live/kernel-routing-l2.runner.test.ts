import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JsonValue, ToolRegistry } from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import { createL2Project, findL2Entry, runL2Task } from '#testing/live/kernel-routing-l2.js';
import type { L2Agent, L2CadCall } from '#testing/live/kernel-routing-l2.js';
import { l2Tasks, renderL2Oracle } from '#testing/live/kernel-routing-l2.tasks.js';
import type { L2ModelFile } from '#testing/live/kernel-routing-l2.tasks.js';

/*
 * The L2 instrument end to end without a model (AKS-3b): each task runs on its own entry-less folder and `tau mcp`
 * process, a scripted writer takes the turn through the same registry a live turn uses (`create_file`, then
 * `evaluate_model` through `tau mcp`), and the oracle runs through `tau mcp`'s `test_model`. The reference model must
 * pass and the wrong model must fail, so a live verdict measures the kernel, not the oracle.
 */

const call = async (registry: ToolRegistry, name: string, input: JsonValue) =>
  registry.invoke({ toolCallId: `scripted-${name}`, toolName: name, input, signal: new AbortController().signal });

const scripted =
  (file: L2ModelFile, library?: L2ModelFile): L2Agent =>
  async ({ registry }) => {
    if (library !== undefined) {
      const used = await call(registry, toolName.createFile, { targetFile: library.path, content: library.source });
      expect(used.isError, JSON.stringify(used.content)).toBe(false);
    }
    const written = await call(registry, toolName.createFile, { targetFile: file.path, content: file.source });
    expect(written.isError, JSON.stringify(written.content)).toBe(false);
    const evaluated = await call(registry, toolName.evaluateModel, { targetFile: file.path });
    expect(evaluated.isError, JSON.stringify(evaluated.content)).toBe(false);
  };

describe('the L2 runner on tau mcp', () => {
  it.each(l2Tasks.map((task) => [task.id, task] as const))(
    'should pass the %s reference and fail the wrong model',
    async (_id, task) => {
      const reference = await runL2Task({ task, agent: scripted(task.reference, task.library) });
      console.info('[l2-runner] reference', JSON.stringify(reference));
      expect(reference).toMatchObject({ passed: true, entryPath: task.reference.path, kernel: task.reference.kernel });
      expect(reference.acceptable).toBe(true);
      expect(reference.failures).toEqual([]);

      const wrong = await runL2Task({ task, agent: scripted(task.wrong, task.library) });
      console.info('[l2-runner] wrong', JSON.stringify(wrong));
      expect(wrong.passed).toBe(false);
      expect(wrong.failures.length).toBeGreaterThan(0);
    },
  );

  it('should fail a turn that renders nothing and declares no main', async () => {
    const [task] = l2Tasks;
    const verdict = await runL2Task({ task: task!, agent: async () => undefined });
    expect(verdict).toMatchObject({ passed: false, entryPath: undefined });
  });

  it('should judge the model a turn proved with test_model alone, as the host adopts it (D3)', async () => {
    const [task] = l2Tasks;
    const model = { ...task!.reference, path: `parts/${task!.reference.path}` };
    const verdict = await runL2Task({
      task: task!,
      agent: async ({ registry, projectRoot }) => {
        await call(registry, toolName.createFile, { targetFile: model.path, content: model.source });
        await call(registry, toolName.createFile, {
          targetFile: 'parts/check.geospec.ts',
          content: renderL2Oracle({ id: task!.id, oracle: task!.oracle, entryPath: model.path }),
        });
        const tested = await call(registry, toolName.testModel, { files: ['parts/check.geospec.ts'] });
        expect(tested.isError, JSON.stringify(tested.content)).toBe(false);
        /* The host's own adoption, not only the grader's reading of the result: a compact result omits its lineage. */
        const manifest: unknown = JSON.parse(await readFile(join(projectRoot, 'tau.json'), 'utf8'));
        expect(manifest).toMatchObject({ assets: { main: { entryPath: model.path } } });
      },
    });
    expect(verdict).toMatchObject({ passed: true, entryPath: model.path, kernel: model.kernel });
  });

  describe('a suite that loads the library before the entry', () => {
    const task = l2Tasks.find(({ library }) => library !== undefined)!;
    const library = task.library!;
    const suitePath = 'comb.geospec.ts';
    /* The turn's own suite: the library's tooth first, then the comb, as the task asks. */
    const suite = [
      "import { describe, expectGeo, it } from 'geospec';",
      "import { loadModel } from 'geospec/model';",
      '',
      "describe('comb', () => {",
      "  it('has one tooth', async () => {",
      `    expectGeo(await loadModel({ file: ${JSON.stringify(library.path)} })).toHaveBoundingBox({ size: { x: 4, y: 4, z: 15 }, tolerance: 0.3 });`,
      '  });',
      "  it('has the comb', async () => {",
      `    expectGeo(await loadModel({ file: ${JSON.stringify(task.reference.path)} })).toHaveBoundingBox(${JSON.stringify(task.oracle.boundingBox)});`,
      '  });',
      '});',
      '',
    ].join('\n');
    const checking =
      (renderEntryFirst: boolean): L2Agent =>
      async ({ registry }) => {
        await Promise.all(
          [library, task.reference, { path: suitePath, source: suite }].map(async (file) =>
            call(registry, toolName.createFile, { targetFile: file.path, content: file.source }),
          ),
        );
        if (renderEntryFirst) {
          const evaluated = await call(registry, toolName.evaluateModel, { targetFile: task.reference.path });
          expect(evaluated.isError, JSON.stringify(evaluated.content)).toBe(false);
        }
        const tested = await call(registry, toolName.testModel, { files: [suitePath] });
        expect(tested.isError, JSON.stringify(tested.content)).toBe(false);
      };

    it('should judge the library when the turn checks it before rendering the entry', async () => {
      const verdict = await runL2Task({ task, agent: checking(false) });
      expect(verdict).toMatchObject({ passed: false, entryPath: library.path });
      expect(verdict.failures.length).toBeGreaterThan(0);
    });

    it('should judge the entry when the turn renders it before checking the library', async () => {
      const verdict = await runL2Task({ task, agent: checking(true) });
      expect(verdict).toMatchObject({ passed: true, entryPath: task.reference.path, kernel: task.reference.kernel });
    });
  });
});

describe('findL2Entry', () => {
  /* A compact `test_model` result, as the registry returns one over 128 KB: no `lineage`, the run's `lineageStatus` and
   * each loaded model's source revision kept. */
  const compactTestModel = (lineageStatus: 'complete' | 'unavailable'): L2CadCall => ({
    invocation: {
      toolCallId: 'compact-test-model',
      toolName: toolName.testModel,
      input: { files: ['parts/check.geospec.ts'] },
      signal: new AbortController().signal,
    },
    result: {
      content: {
        success: true,
        passed: 4,
        total: 4,
        runStatus: lineageStatus === 'complete' ? 'passed' : 'inconclusive',
        lineageStatus,
        failures: [],
        passes: [],
        sourceRevisions: [
          { entry: 'parts/spacer.scad', files: { 'parts/spacer.scad': `sha256:${'a'.repeat(64)}` } },
          { entry: 'parts/washer.scad', files: { 'parts/washer.scad': `sha256:${'b'.repeat(64)}` } },
        ],
        omittedFailures: 0,
        omittedPasses: 4,
        omittedSourceRevisions: 0,
        omittedTests: 0,
        omittedLineage: 1,
        fullResult: {
          path: '.tau/records/compact-test-model/result.json',
          mimeType: 'application/json',
          byteLength: 200_000,
          sha256: 'c'.repeat(64),
        },
      },
      isError: false,
    },
  });

  it('should keep the first model a turn loaded when it renders another file afterwards, as the host does', async () => {
    const projectRoot = await createL2Project({ id: 'first-adopted' });
    const evaluate: L2CadCall = {
      invocation: {
        toolCallId: 'evaluate-after-load',
        toolName: toolName.evaluateModel,
        input: { targetFile: 'main.scad' },
        signal: new AbortController().signal,
      },
      result: { content: { success: true, status: 'ready' }, isError: false },
    };
    try {
      await expect(findL2Entry({ projectRoot, cadCalls: [compactTestModel('complete'), evaluate] })).resolves.toBe(
        'parts/spacer.scad',
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('should take the first model a compact test_model result loaded when its lineage was dropped', async () => {
    const projectRoot = await createL2Project({ id: 'compact-entry' });
    try {
      await expect(findL2Entry({ projectRoot, cadCalls: [compactTestModel('complete')] })).resolves.toBe(
        'parts/spacer.scad',
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('should not take a compact result as adoption evidence when its lineage was not complete', async () => {
    const projectRoot = await createL2Project({ id: 'compact-entry-unavailable' });
    try {
      await expect(findL2Entry({ projectRoot, cadCalls: [compactTestModel('unavailable')] })).resolves.toBeUndefined();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
