import { describe, expect, it } from 'vitest';
import type { HostRunSnapshot, HostToolInvocation, JsonValue, ProviderMessage } from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import { kernelChoiceCondition, renderPersonBlock } from '@taucad/chat/prompts';
import { resolveKernel } from '@taucad/types/constants';
import type { BindingKernelRow } from '@taucad/chat/prompts';
import { liveCadSystemPrompt } from '#testing/live/live-gateway.harness.js';
import { kernelRoutingDevelopmentCases, kernelRoutingHosts } from '#testing/live/kernel-routing.cases.js';
import type { KernelRoutingCase } from '#testing/live/kernel-routing.cases.js';
import {
  buildFixture,
  comparePersonArm,
  createRoutingToolHandler,
  exampleRoutingCase,
  kernelTextFor,
  observePromptOnly,
  observeRun,
  personFor,
  personProfileArms,
  personProfiles,
  perturbedProfile,
  readKernelSkill,
  routingSkillName,
  summarizeExampleRuns,
  withKernelText,
} from '#testing/live/kernel-routing.runner.js';
import type { KernelRoutingObservation } from '#testing/live/kernel-routing.grader.js';

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

const assistant = (text: string, index: number): ProviderMessage => ({
  id: `a${index}`,
  role: 'assistant',
  content: text,
});

const snapshotOf = (messages: readonly ProviderMessage[]): HostRunSnapshot => ({
  chatId: 'c',
  runId: 'run',
  turnId: 't',
  state: 'completed',
  messages,
});

const snapshotWith = (texts: readonly string[]): HostRunSnapshot =>
  snapshotOf(texts.map((text, index) => assistant(text, index)));

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

  it('should read the announcement only from text before the first model write', async () => {
    const { record, handle } = handlerFor(byId('u1-wall-hook'));
    await handle(
      call(toolName.createFile, {
        targetFile: 'main.scad',
        content: 'cube(1);',
      }),
    );
    const run = observeRun({
      caseId: 'u1-wall-hook',
      record,
      snapshot: snapshotOf([
        assistant('Here is a wall hook.', 0),
        {
          id: 'w',
          role: 'tool-input',
          toolCallId: `${toolName.createFile}-1`,
          toolName: toolName.createFile,
          content: {},
        },
        assistant('Done in OpenSCAD.', 1),
      ]),
    });
    expect(run.observation.announced).toBe(false);
  });

  it('should keep an unbound first write as the write and not rebind a later one', async () => {
    const { record, handle } = handlerFor(byId('u1-wall-hook'));
    await handle(call(toolName.createFile, { targetFile: 'main.py', content: 'print(1)' }));
    expect(record.binding?.result.kind).toBe('unbound');
    await handle(
      call(toolName.createFile, {
        targetFile: 'main.scad',
        content: 'cube(1);',
      }),
    );
    expect(record.binding?.path).toBe('main.py');
    expect(
      observeRun({
        caseId: 'u1-wall-hook',
        record,
        snapshot: snapshotWith(['Which would you like?']),
      }).observation,
    ).toMatchObject({ asked: false, declinedOutOfScope: false });
  });

  it('should refuse a skill the host profile lists without one', async () => {
    let stops = 0;
    const { handle } = createRoutingToolHandler({
      project: buildFixture(byId('u1-wall-hook'), 'in-turn'),
      kernels,
      profile: {
        available: ['openscad', 'opencascadejs'],
        withoutSkill: ['opencascadejs'],
      },
      stop: () => {
        stops += 1;
      },
      skillText: async (kernel) => `# cad-${kernel}`,
    });
    const withoutSkill = await handle(call(toolName.useSkill, { skillName: 'cad-opencascadejs' }));
    const withSkill = await handle(call(toolName.useSkill, { skillName: 'cad-openscad' }));
    expect(withoutSkill.isError).toBe(true);
    expect(withSkill.isError).toBe(false);
    expect(stops).toBe(0);
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
      snapshot: snapshotWith(['A lattice and STEP conflict? Tell me which matters more.']),
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
    expect(observePromptOnly('x', 'ASK: lattice or STEP?\nKERNEL: `picovoxel` if lattice.')).toEqual({
      caseId: 'x',
      asked: true,
      declinedOutOfScope: false,
    });
  });
});

describe('the person-profile arms', () => {
  const promptFor = (testCase: KernelRoutingCase, arm: (typeof personProfileArms)[number] | 'in-turn'): string => {
    const person = personFor(arm);
    return withKernelText(
      liveCadSystemPrompt({
        chatId: 'c',
        modelId: 'anthropic-claude-sonnet-5.5',
        kernel: 'replicad',
        ...(person === undefined ? {} : { person }),
      }),
      kernelTextFor(testCase, arm),
    );
  };

  it('should send the four setup profiles the comparison names', () => {
    expect(personProfiles).toEqual({
      'person-printing': { makes: ['printing'], reads: ['none'] },
      'person-mechanical': { makes: ['mechanical'], reads: ['typescript'] },
      'person-electronics': { makes: ['electronics'], reads: ['python'] },
      'person-art': { makes: ['art'], reads: ['none'] },
    });
    expect(personFor('in-turn')).toBeUndefined();
    expect(personFor('pointer')).toBeUndefined();
  });

  it.each(personProfileArms)('should change only the person option on the %s arm', (arm) => {
    for (const testCase of [byId('u1-wall-hook'), byId('own-openscad-add-fillets'), byId('pick-jscad-gear')]) {
      const block = renderPersonBlock(personProfiles[arm]);
      const kernelText = kernelTextFor(testCase, arm);
      expect(kernelText).toBe(kernelTextFor(testCase, 'in-turn'));
      expect(buildFixture(testCase, arm)).toEqual(buildFixture(testCase, 'in-turn'));
      const prompt = promptFor(testCase, arm);
      expect(block).not.toBe('');
      expect(prompt.replace(`\n\n${block}`, '')).toBe(promptFor(testCase, 'in-turn'));
      expect(prompt.indexOf(block)).toBeGreaterThan(prompt.indexOf(kernelText));
    }
  });
});

describe('comparing a person-profile arm with the no-block arm', () => {
  const narrow = byId('u1-customiser-box');
  const broad = byId('u1-wall-hook');
  const mustAsk = byId('ask-lattice-step');
  const cases = [narrow, broad, mustAsk];
  const wrote = (testCase: KernelRoutingCase, kernel: 'openscad' | 'replicad' | 'jscad'): KernelRoutingObservation => ({
    caseId: testCase.id,
    boundKernel: kernel,
    asked: false,
  });
  const asked = (testCase: KernelRoutingCase): KernelRoutingObservation => ({ caseId: testCase.id, asked: true });
  const runs = (entries: ReadonlyArray<readonly [KernelRoutingCase, readonly KernelRoutingObservation[]]>) =>
    new Map(entries.map(([testCase, observations]) => [testCase.id, observations]));

  const baseline = runs([
    [narrow, Array.from({ length: 5 }, () => wrote(narrow, 'openscad'))],
    [broad, Array.from({ length: 5 }, () => wrote(broad, 'replicad'))],
    [mustAsk, Array.from({ length: 5 }, () => asked(mustAsk))],
  ]);

  it('should pass a profile arm that matches the no-block arm', () => {
    const result = comparePersonArm(cases, baseline, baseline);
    expect(result).toMatchObject({ met: true, regressions: [] });
    expect(result.strata.narrow).toMatchObject({ baseline: { passed: 5, runs: 5 }, profile: { passed: 5, runs: 5 } });
  });

  it('should not meet a comparison with no runs', () => {
    expect(comparePersonArm([], new Map(), new Map()).met).toBe(false);
  });

  it('should fail a tier whose pass rate drops by more than five points', () => {
    const profile = runs([
      [narrow, [...Array.from({ length: 4 }, () => wrote(narrow, 'openscad')), wrote(narrow, 'replicad')]],
      [broad, Array.from({ length: 5 }, () => wrote(broad, 'openscad'))],
      [mustAsk, Array.from({ length: 5 }, () => asked(mustAsk))],
    ]);
    const result = comparePersonArm(cases, baseline, profile);
    expect(result.strata.narrow.met).toBe(false);
    expect(result.strata.broad.met).toBe(true);
    expect(result.met).toBe(false);
  });

  it('should list a must-ask case that always passed without the block and fails once with it', () => {
    const profile = runs([
      [narrow, Array.from({ length: 5 }, () => wrote(narrow, 'openscad'))],
      [broad, Array.from({ length: 5 }, () => wrote(broad, 'replicad'))],
      [mustAsk, [...Array.from({ length: 4 }, () => asked(mustAsk)), wrote(mustAsk, 'jscad')]],
    ]);
    expect(comparePersonArm(cases, baseline, profile)).toMatchObject({ met: false, regressions: [mustAsk.id] });
  });
});

describe('the examples arm', () => {
  it('should accept every browser kernel for a suggestion with no need and forbid the rest', () => {
    const testCase = exampleRoutingCase({ id: 'wall-hook', prompt: 'A wall hook.', goals: ['printing'] });
    expect(testCase).toMatchObject({ id: 'example-wall-hook', host: 'web', preference: 'auto', kind: 'routing' });
    expect(testCase.acceptable).toEqual(kernelRoutingHosts.web.available);
    expect(testCase.forbidden).toEqual(expect.arrayContaining(['zoo', 'build123d', 'smlibpy', 'picogk']));
    expect(testCase.forbidden).not.toEqual(expect.arrayContaining(['replicad']));
  });

  it('should accept only the kernels that provide what a suggestion needs', () => {
    const testCase = exampleRoutingCase({
      id: '555-blinker',
      prompt: 'A 555 blinker board.',
      goals: ['electronics'],
      needs: 'electronics',
    });
    expect(testCase.acceptable).toEqual(['tscircuit']);
  });

  it('should meet a suggestion that resolves in four of five runs and never misroutes', () => {
    const testCase = exampleRoutingCase({
      id: 'led',
      prompt: 'An LED board.',
      goals: ['electronics'],
      needs: 'electronics',
    });
    const bound = (kernel?: 'tscircuit' | 'replicad'): KernelRoutingObservation => ({
      caseId: testCase.id,
      asked: kernel === undefined,
      ...(kernel === undefined ? {} : { boundKernel: kernel }),
    });
    const verdict = (observations: readonly KernelRoutingObservation[]) =>
      summarizeExampleRuns([testCase], new Map([[testCase.id, observations]]))[0];
    expect(verdict([...Array.from({ length: 4 }, () => bound('tscircuit')), bound()])).toMatchObject({
      resolved: 4,
      misrouted: 0,
      met: true,
    });
    expect(verdict([...Array.from({ length: 4 }, () => bound('tscircuit')), bound('replicad')])).toMatchObject({
      misrouted: 1,
      met: false,
    });
    expect(verdict([...Array.from({ length: 3 }, () => bound('tscircuit')), bound(), bound()])).toMatchObject({
      met: false,
    });
  });
});
