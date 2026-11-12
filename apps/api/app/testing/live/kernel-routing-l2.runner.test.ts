import { describe, expect, it } from 'vitest';
import type { JsonValue, ToolRegistry } from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import { runL2Task } from '#testing/live/kernel-routing-l2.js';
import type { L2Agent } from '#testing/live/kernel-routing-l2.js';
import { l2Tasks } from '#testing/live/kernel-routing-l2.tasks.js';
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
  (file: L2ModelFile): L2Agent =>
  async ({ registry }) => {
    const written = await call(registry, toolName.createFile, { targetFile: file.path, content: file.source });
    expect(written.isError, JSON.stringify(written.content)).toBe(false);
    const evaluated = await call(registry, toolName.evaluateModel, { targetFile: file.path });
    expect(evaluated.isError, JSON.stringify(evaluated.content)).toBe(false);
  };

describe('the L2 runner on tau mcp', () => {
  it.each(l2Tasks.map((task) => [task.id, task] as const))(
    'should pass the %s reference and fail the wrong model',
    async (_id, task) => {
      const reference = await runL2Task({ task, agent: scripted(task.reference) });
      console.info('[l2-runner] reference', JSON.stringify(reference));
      expect(reference).toMatchObject({ passed: true, entryPath: task.reference.path, kernel: task.reference.kernel });
      expect(reference.acceptable).toBe(true);
      expect(reference.failures).toEqual([]);

      const wrong = await runL2Task({ task, agent: scripted(task.wrong) });
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
});
