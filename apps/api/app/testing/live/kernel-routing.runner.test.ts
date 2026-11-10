import { describe, expect, it } from 'vitest';
import type { HostRunSnapshot, HostToolInvocation, JsonValue } from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import { kernelChoiceCondition } from '@taucad/chat/prompts';
import { resolveKernel } from '@taucad/types/constants';
import type { BindingKernelRow } from '#testing/live/kernel-routing.binding.js';
import { liveCadSystemPrompt } from '#testing/live/live-gateway.harness.js';
import { kernelRoutingDevelopmentCases, kernelRoutingHosts } from '#testing/live/kernel-routing.cases.js';
import type { KernelRoutingCase } from '#testing/live/kernel-routing.cases.js';
import {
  buildFixture,
  createRoutingToolHandler,
  kernelTextFor,
  observePromptOnly,
  observeRun,
  perturbedProfile,
  readKernelSkill,
  routingSkillName,
  withKernelText,
} from '#testing/live/kernel-routing.runner.js';

/** A small runtime table in the shape `resolveRuntimeDefinition` returns: OpenSCAD by extension, two `.ts` kernels. */
const kernels: readonly BindingKernelRow[] = [
  { id: 'openrscad', extensions: ['scad'] },
  {
    id: 'replicad',
    extensions: ['ts', 'js'],
    detectImport: /from\s+['"]replicad['"]/u,
  },
  {
    id: 'picovoxel',
    extensions: ['ts', 'js'],
    detectImport: /from\s+['"]picovoxel['"]/u,
  },
];

const byId = (id: string): KernelRoutingCase => {
  const found = kernelRoutingDevelopmentCases.find((testCase) => testCase.id === id);
  if (!found) {
    throw new Error(`No case ${id}.`);
  }
  return found;
};

const call = (name: string, input: Record<string, JsonValue>): HostToolInvocation => {
  const invocation: HostToolInvocation = {
    toolCallId: `${name}-1`,
    toolName: name,
    input,
    signal: new AbortController().signal,
    runId: 'run',
  };
  return invocation;
};

const snapshotWith = (texts: readonly string[]): HostRunSnapshot =>
  ({
    state: 'completed',
    messages: texts.map((text, index) => ({
      id: `a${index}`,
      role: 'assistant',
      content: text,
    })),
  }) as unknown as HostRunSnapshot;

const handlerFor = (testCase: KernelRoutingCase, arm: 'in-turn' | 'template' = 'in-turn') => {
  let stops = 0;
  const handler = createRoutingToolHandler({
    project: buildFixture(testCase, arm),
    kernels,
    profile: kernelRoutingHosts[testCase.host],
    stop: () => {
      stops += 1;
    },
    skillText: async (kernel) => `# cad-${kernel}`,
  });
  return { ...handler, stops: () => stops };
};

describe('kernel routing runner', () => {
  it('should replace the kernel_skill sentence and refuse a prompt without it', () => {
    const prompt = 'Static.\n\nThis project uses Replicad; activate the cad-replicad skill.\n\nDynamic.';
    expect(withKernelText(prompt, 'AUTO TEXT')).toBe('Static.\n\nAUTO TEXT\n\nDynamic.');
    expect(() => withKernelText('Static.', 'AUTO TEXT')).toThrow(/kernel_skill/u);
  });

  it('should leave no replicad mention in the production prompt once the kernel text is replaced', () => {
    const prompt = liveCadSystemPrompt({
      chatId: 'c',
      modelId: 'anthropic-claude-sonnet-5.5',
      kernel: 'replicad',
    });
    expect(withKernelText(prompt, 'AUTO TEXT')).not.toMatch(/replicad/iu);
  });

  it('should send the card on an entry-less Auto case, the owner text on an existing one, and the stale text when asked', () => {
    expect(kernelTextFor(byId('u1-wall-hook'), 'in-turn')).toContain('### Kernels available here');
    expect(kernelTextFor(byId('own-openscad-add-fillets'), 'in-turn')).toContain('Keep this kernel');
    expect(kernelTextFor(byId('own-stale-text-openscad'), 'in-turn')).toContain(kernelChoiceCondition);
    expect(kernelTextFor(byId('pick-jscad-gear'), 'in-turn')).toBe(
      'This project uses JSCAD; activate the cad-jscad skill.',
    );
    const pointer = kernelTextFor(byId('u1-wall-hook'), 'pointer');
    expect(pointer).toContain(routingSkillName);
    expect(pointer).not.toContain('### Kernels available here');
  });

  it('should perturb the kernel order per case without changing the set', () => {
    const testCase = byId('u1-wall-hook');
    const perturbed = perturbedProfile(testCase).available;
    expect([...perturbed].sort()).toEqual([...kernelRoutingHosts.web.available].sort());
    expect(perturbedProfile(testCase).available).toEqual(perturbed);
  });

  it('should build entry-less, template and existing fixtures', () => {
    expect([...buildFixture(byId('u1-wall-hook'), 'in-turn').files.keys()]).toEqual(['tau.json']);
    const template = buildFixture(byId('u1-wall-hook'), 'template');
    expect(template.files.get('main.ts')).toBe(resolveKernel('replicad').emptyCode);
    expect(buildFixture(byId('own-openscad-add-fillets'), 'in-turn').owner).toEqual({
      kernel: 'openscad',
      entryPath: 'main.scad',
    });
  });

  it('should bind the first model write, stop, and record a skill read before it', async () => {
    const { record, handle, stops } = handlerFor(byId('u1-wall-hook'));
    await handle(call(toolName.useSkill, { skillName: 'cad-openscad' }));
    await handle(call(toolName.createFile, { targetFile: 'notes.md', content: 'plan' }));
    const result = await handle(
      call(toolName.createFile, {
        targetFile: 'main.scad',
        content: 'cube(1);',
      }),
    );
    expect(result.isError).toBe(true);
    expect(stops()).toBe(1);
    const run = observeRun({
      caseId: 'u1-wall-hook',
      record,
      snapshot: snapshotWith(['I will use OpenSCAD because it is a simple print.']),
    });
    expect(run.observation).toEqual({
      caseId: 'u1-wall-hook',
      boundKernel: 'openscad',
      asked: false,
      declinedOutOfScope: false,
      skillBeforeWrite: true,
      announced: true,
    });
  });

  it('should see a template edit that keeps replicad as replicad and a rewrite to picovoxel as picovoxel', async () => {
    const replicad = resolveKernel('replicad').emptyCode;
    const kept = handlerFor(byId('u8-heat-exchanger'), 'template');
    await kept.handle(
      call(toolName.editFile, {
        targetFile: 'main.ts',
        oldString: replicad,
        newString: `${replicad}\n// more`,
      }),
    );
    expect(kept.record.binding?.result).toMatchObject({
      kind: 'bound',
      kernel: 'replicad',
    });

    const rewritten = handlerFor(byId('u8-heat-exchanger'), 'template');
    await rewritten.handle(
      call(toolName.editFile, {
        targetFile: 'main.ts',
        oldString: replicad,
        newString: "import type { Pico } from 'picovoxel';\nexport default () => 1;",
      }),
    );
    expect(rewritten.record.binding?.result).toMatchObject({
      kind: 'bound',
      kernel: 'picovoxel',
    });
  });

  it('should leave an undecided write for evaluate_model and record it there', async () => {
    const { record, handle } = handlerFor(byId('u1-wall-hook'));
    await handle(
      call(toolName.createFile, {
        targetFile: 'main.ts',
        content: 'export default () => 1;',
      }),
    );
    expect(record.binding).toBeUndefined();
    await handle(call(toolName.evaluateModel, { targetFile: 'main.ts' }));
    expect(record.binding).toMatchObject({
      path: 'main.ts',
      at: 'evaluate',
      result: { kind: 'undecided' },
    });
  });

  it('should count ask_questions and a question in the reply as asking, and a plain reply as declining', async () => {
    const tool = handlerFor(byId('ask-lattice-step'));
    await tool.handle(call(toolName.askQuestions, { questions: [] }));
    expect(
      observeRun({
        caseId: 'ask-lattice-step',
        record: tool.record,
        snapshot: snapshotWith([]),
      }).observation.asked,
    ).toBe(true);

    const text = handlerFor(byId('ask-lattice-step'));
    const asked = observeRun({
      caseId: 'ask-lattice-step',
      record: text.record,
      snapshot: snapshotWith(['A lattice and STEP conflict. Which would you prefer?']),
    });
    expect(asked.observation).toMatchObject({
      asked: true,
      declinedOutOfScope: false,
    });

    const declined = observeRun({
      caseId: 'ask-ifc-building',
      record: handlerFor(byId('ask-ifc-building')).record,
      snapshot: snapshotWith(['Tau cannot write IFC. I can model the massing in replicad instead.']),
    });
    expect(declined.observation).toMatchObject({
      asked: false,
      declinedOutOfScope: true,
    });
  });

  it('should read every available kernel skill from its plugin package', async () => {
    const texts = await Promise.all(
      kernelRoutingHosts.desktop.available.map(async (kernel) => readKernelSkill(kernel)),
    );
    expect(texts.every((text) => text.includes('---'))).toBe(true);
  });

  it('should read the prompt-only answer', () => {
    expect(observePromptOnly('x', 'KERNEL: `picovoxel`\nBecause it is a lattice.')).toEqual({
      caseId: 'x',
      boundKernel: 'picovoxel',
      asked: false,
      declinedOutOfScope: false,
    });
    expect(observePromptOnly('x', 'ASK: lattice or STEP?')).toMatchObject({
      asked: true,
    });
    expect(observePromptOnly('x', 'NONE: out of scope')).toMatchObject({
      declinedOutOfScope: true,
    });
  });
});
