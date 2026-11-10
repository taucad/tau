import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HostRunSnapshot, HostToolInvocation, HostToolResult, JsonValue } from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import { kernelChoiceCondition, renderKernelGuidance, renderKernelRoutingCard } from '@taucad/chat/prompts';
import type { KernelRoutingProfile } from '@taucad/chat/prompts';
import { isKernelId, resolveKernel } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { bindEntryFirstPass } from '#testing/live/kernel-routing.binding.js';
import type { BindingKernelRow, EntryBinding } from '#testing/live/kernel-routing.binding.js';
import { kernelRoutingHosts } from '#testing/live/kernel-routing.cases.js';
import type { KernelRoutingCase } from '#testing/live/kernel-routing.cases.js';
import type { KernelRoutingObservation } from '#testing/live/kernel-routing.grader.js';
import { textOf, toolCalls } from '#testing/live/live-assertions.js';

/**
 * The in-turn runner of the automatic kernel selection eval (blueprint AKS-S1, Appendix E). It builds a case's
 * project fixture and per-turn kernel text, answers the production toolbelt from an in-memory project, decides the
 * first written entry's kernel with the binding helper, and turns the finished run into a grader observation. The
 * live suite (`kernel-routing.live.test.ts`) drives it; everything here is deterministic and unit-tested.
 */

/**
 * The arms AKS-S1 runs. `in-turn` is the gate arm: the inline card on an entry-less project. `pointer` replaces the
 * card with a pointer to a `kernel-routing` skill that holds it. `template` puts an untouched replicad template under
 * the Auto text (D3's fallback scaffold). `prompt-only` is the Appendix B alternative: one tool-less call that names a
 * kernel from the card.
 */
export type KernelRoutingArm = 'in-turn' | 'pointer' | 'template' | 'prompt-only';

/** The skill the pointer arm points at. */
export const routingSkillName = 'kernel-routing';

/** An in-memory project the scripted tools read and write. */
export type FixtureProject = {
  readonly files: Map<string, string>;
  /** The entry that existed before the turn, if any. */
  readonly owner?: { readonly kernel: KernelId; readonly entryPath: string };
};

const manifest = (entryPath?: string): string =>
  `${JSON.stringify(
    {
      $schema: 'https://tau.new/schemas/tau-v1.json',
      name: 'Untitled',
      ...(entryPath === undefined ? {} : { assets: { main: { entryPath } } }),
    },
    undefined,
    2,
  )}\n`;

/**
 * The project a case starts in.
 *
 * @param testCase - The case.
 * @param arm - The arm, which may swap the fixture (the template arm adds an untouched replicad entry).
 * @returns The files and the owner, when an entry exists.
 */
export const buildFixture = (testCase: KernelRoutingCase, arm: KernelRoutingArm): FixtureProject => {
  const files = new Map<string, string>();
  if (testCase.fixture.kind === 'existing') {
    const { owner, entryPath } = testCase.fixture;
    files.set('tau.json', manifest(entryPath));
    files.set(entryPath, resolveKernel(owner).emptyCode);
    return { files, owner: { kernel: owner, entryPath } };
  }
  for (const path of testCase.fixture.files ?? []) {
    files.set(path, '');
  }
  if (arm === 'template') {
    const replicad = resolveKernel('replicad');
    files.set('tau.json', manifest(replicad.mainFile));
    files.set(replicad.mainFile, replicad.emptyCode);
    return { files };
  }
  files.set('tau.json', manifest());
  return { files };
};

/**
 * The case's host profile with its kernels in a per-case shuffled order, so the eval cannot pass on list position
 * (D1: model-read text names no order preference, and the eval perturbs it). The shuffle is seeded by the case id.
 *
 * @param testCase - The case.
 * @returns The perturbed profile.
 */
export const perturbedProfile = (testCase: KernelRoutingCase): KernelRoutingProfile => {
  const base = kernelRoutingHosts[testCase.host];
  const rank = (kernel: KernelId): string => createHash('sha256').update(`${testCase.id}:${kernel}`).digest('hex');
  const order = [...base.available].sort((left, right) => rank(left).localeCompare(rank(right)));
  return { ...base, available: order };
};

/**
 * The per-turn kernel text the case's arm sends, in place of the prompt's `kernel_skill` section.
 *
 * @param testCase - The case.
 * @param arm - The arm.
 * @returns The `kernel_skill` text.
 */
export const kernelTextFor = (testCase: KernelRoutingCase, arm: KernelRoutingArm): string => {
  const profile = perturbedProfile(testCase);
  const { fixture, preference } = testCase;
  if (arm === 'pointer' && preference === 'auto') {
    return `${kernelChoiceCondition}\n\nBefore writing it, activate the \`${routingSkillName}\` skill with \`${toolName.useSkill}\` and choose the kernel with its rules. After choosing, activate that kernel's \`cad-\` skill before writing.`;
  }
  // The no-entry text over an existing entry: the state that text meets after its own write or a compaction.
  const owner = fixture.kind === 'existing' && fixture.noEntryText !== true ? fixture : undefined;
  return renderKernelGuidance({
    preference,
    profile,
    ...(owner === undefined ? {} : { owner: { kernel: owner.owner, entryPath: owner.entryPath } }),
  });
};

const defaultKernelSkill = (kernel: KernelId): string =>
  `This project uses ${resolveKernel(kernel).name}; activate the cad-${kernel} skill.`;

/**
 * The production CAD prompt with its `kernel_skill` section replaced by the case's kernel text. The prompt is built
 * for replicad, whose only kernel-specific text is that section, and the replacement is checked to have happened.
 *
 * @param prompt - `liveCadSystemPrompt` output built with `kernel: 'replicad'`.
 * @param kernelText - The arm's kernel text.
 * @returns The prompt the case runs with.
 */
export const withKernelText = (prompt: string, kernelText: string): string => {
  const placeholder = defaultKernelSkill('replicad');
  if (!prompt.includes(placeholder)) {
    throw new Error('The CAD prompt no longer carries the replicad kernel_skill sentence the runner replaces.');
  }
  return prompt.replace(placeholder, kernelText);
};

/**
 * The workspace reminder the browser prepends to a turn (`browser-agent-host-snapshot-context.ts`), here the file tree
 * only.
 *
 * @param project - The fixture.
 * @returns The reminder text that precedes the person's message.
 */
export const projectReminder = (project: FixtureProject): string => {
  const paths = [...project.files.keys()].sort();
  return `<system-reminder>
The workspace as it was when the message after this reminder was sent. A newer snapshot later in the conversation supersedes this one.

<project_layout>
Below is a cached/partial snapshot of the current project's file structure. Runner tools such as test_model perform their own recursive project discovery and are not limited to this visible tree:

/project/
${paths.map((path) => `- ${path}`).join('\n')}
</project_layout>
</system-reminder>

`;
};

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../../packages/plugins');
const skillDirectory: Readonly<Partial<Record<KernelId, string>>> = {
  openscad: 'openrscad',
  opencascadejs: 'opencascade',
};

/**
 * A kernel's real `cad-` skill text, read from its plugin package.
 *
 * @param kernel - The catalog kernel.
 * @returns The SKILL.md text.
 */
export const readKernelSkill = async (kernel: KernelId): Promise<string> =>
  readFile(join(pluginRoot, skillDirectory[kernel] ?? kernel, 'agent', `cad-${kernel}`, 'SKILL.md'), 'utf8');

/** Paths that never bind a kernel: the manifest, docs, package files, GeoSpec suites and Tau's own records. */
const isNonModelPath = (path: string): boolean =>
  path === 'tau.json' ||
  path.startsWith('.tau/') ||
  /\.(?:md|json|txt|yaml|yml|toml|lock)$/iu.test(path) ||
  /\.geospec\.[cm]?[jt]s$/iu.test(path);

/** What the scripted project saw during one run. */
export type RunRecord = {
  /** The first written model file's binding, once one decided or the run reached `evaluate_model`. */
  binding?: {
    readonly path: string;
    readonly result: EntryBinding;
    readonly at: 'write' | 'evaluate';
  };
  askedWithTool: boolean;
  /** Skills activated, in order, with whether a model file had been written yet. */
  readonly skills: Array<{
    readonly name: string;
    readonly afterWrite: boolean;
  }>;
  /** Model-file writes the binding left undecided, waiting for `evaluate_model`. */
  readonly pendingWrites: string[];
  toolCount: number;
  stopped: boolean;
};

const stopHere: HostToolResult = {
  content: {
    errorCode: 'LIVE_CHECK_ENDS_HERE',
    message: 'This check ends here. Reply with your one-sentence plan and stop.',
  },
  isError: true,
};

const ok = (content: Record<string, JsonValue>): HostToolResult => ({
  content,
  isError: false,
});

const asObject = (input: JsonValue): Readonly<Record<string, JsonValue>> =>
  input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};

const stringField = (input: JsonValue, field: string): string | undefined => {
  const value = asObject(input)[field];
  return typeof value === 'string' ? value : undefined;
};

const normalise = (path: string): string => path.replace(/^\/?project\//u, '').replace(/^\.?\//u, '');

/** Tool calls past this count end the run, so a looping turn cannot spend without bound. */
export const maximumToolCalls = 30;

/**
 * A scripted tool handler over the fixture. Reads and lists answer from the project, skills answer with the real
 * `cad-` text (and the card for the pointer arm), a model-file write is bound with the first pass and ends the run
 * when it decides, and `ask_questions` ends the run as a question. Anything else that would execute or render
 * answers that the check ends here.
 *
 * @param input - Fixture, arm, kernel rows, the host profile and a callback that stops the session.
 * @returns The handler and the record it fills.
 */
// oxlint-disable-next-line max-lines-per-function -- one branch per tool family the routing decision can meet
export const createRoutingToolHandler = (input: {
  readonly project: FixtureProject;
  readonly kernels: readonly BindingKernelRow[];
  readonly profile: KernelRoutingProfile;
  readonly stop: () => void;
  readonly skillText?: (kernel: KernelId) => Promise<string>;
}): {
  readonly record: RunRecord;
  readonly handle: (invocation: HostToolInvocation) => Promise<HostToolResult>;
} => {
  const { project, kernels } = input;
  const record: RunRecord = {
    askedWithTool: false,
    skills: [],
    pendingWrites: [],
    toolCount: 0,
    stopped: false,
  };
  const skillText = input.skillText ?? readKernelSkill;

  const finish = (): HostToolResult => {
    record.stopped = true;
    input.stop();
    return stopHere;
  };

  const written = (path: string, content: string): HostToolResult => {
    project.files.set(path, content);
    if (record.binding !== undefined || isNonModelPath(path)) {
      return ok({ message: `Wrote ${path}.` });
    }
    const result = bindEntryFirstPass({
      entryPath: path,
      source: content,
      kernels,
    });
    if (result.kind === 'bound') {
      record.binding = { path, result, at: 'write' };
      return finish();
    }
    if (result.kind === 'undecided') {
      record.pendingWrites.push(path);
    }
    return ok({ message: `Wrote ${path}.` });
  };

  // oxlint-disable-next-line complexity -- a flat dispatch over tool names
  const handle = async (invocation: HostToolInvocation): Promise<HostToolResult> => {
    record.toolCount += 1;
    if (record.stopped || record.toolCount > maximumToolCalls) {
      return finish();
    }
    const target = stringField(invocation.input, 'targetFile');
    const path = target === undefined ? undefined : normalise(target);
    switch (invocation.toolName) {
      case toolName.askQuestions: {
        record.askedWithTool = true;
        return finish();
      }
      case toolName.useSkill: {
        const name = stringField(invocation.input, 'skillName') ?? '';
        record.skills.push({
          name,
          afterWrite: record.binding !== undefined || record.pendingWrites.length > 0,
        });
        if (name === routingSkillName) {
          return ok({ name, content: renderKernelRoutingCard(input.profile) });
        }
        const kernel = name.replace(/^cad-/u, '');
        if (isKernelId(kernel) && input.profile.available.includes(kernel)) {
          return ok({ name, content: await skillText(kernel) });
        }
        return {
          content: {
            errorCode: 'SKILL_NOT_FOUND',
            message: `No skill named ${name} here.`,
          },
          isError: true,
        };
      }
      case toolName.readFile: {
        const content = path === undefined ? undefined : project.files.get(path);
        if (content === undefined) {
          return {
            content: {
              errorCode: 'FILE_NOT_FOUND',
              message: `${target ?? ''} does not exist.`,
            },
            isError: true,
          };
        }
        return ok({
          content,
          size: content.length,
          contentKind: 'text',
          totalLines: content.split('\n').length,
        });
      }
      case toolName.listDirectory:
      case toolName.globSearch: {
        return ok({
          entries: [...project.files.keys()].sort().map((name) => ({ name, path: name, isFolder: false })),
        });
      }
      case toolName.grep:
      case toolName.getParameters:
      case toolName.revisions:
      case toolName.webSearch:
      case toolName.updateTodos: {
        return ok({
          success: true,
          message: 'Nothing to report in this project yet.',
        });
      }
      case toolName.createFile: {
        return path === undefined ? finish() : written(path, stringField(invocation.input, 'content') ?? '');
      }
      case toolName.editFile: {
        const current = path === undefined ? undefined : project.files.get(path);
        const oldString = stringField(invocation.input, 'oldString') ?? '';
        if (path === undefined || current === undefined || !current.includes(oldString)) {
          return {
            content: {
              errorCode: 'EDIT_NOT_APPLIED',
              message: `${target ?? ''} does not contain oldString.`,
            },
            isError: true,
          };
        }
        const replaceAll = asObject(invocation.input)['replaceAll'] === true;
        const newString = stringField(invocation.input, 'newString') ?? '';
        const next = replaceAll ? current.replaceAll(oldString, newString) : current.replace(oldString, newString);
        return written(path, next);
      }
      case toolName.evaluateModel: {
        const pending = path ?? record.pendingWrites.at(0);
        if (!record.binding && pending !== undefined && record.pendingWrites.includes(pending)) {
          const source = project.files.get(pending) ?? '';
          record.binding = {
            path: pending,
            result: bindEntryFirstPass({ entryPath: pending, source, kernels }),
            at: 'evaluate',
          };
        }
        return finish();
      }
      default: {
        return finish();
      }
    }
  };

  return { record, handle };
};

/** Words that make a final reply a question or an out-of-scope statement rather than a silent stop. */
const questionPattern = /\?\s*$|\?\s*\n|\bwhich (?:would|do) you\b|\bwould you (?:like|prefer)\b/iu;

/** One case's observation plus what the report and an auditor need. */
export type RoutingRunResult = {
  readonly observation: KernelRoutingObservation;
  readonly bindingPath?: string;
  readonly bindingKind?: EntryBinding['kind'];
  readonly askedInText: boolean;
  readonly finalText: string;
  readonly tools: readonly string[];
  readonly state: HostRunSnapshot['state'];
  readonly failure?: string;
};

/**
 * Turn a finished run into the grader's observation. A question through `ask_questions` or in the reply text counts as
 * asking; a reply with no write and no question counts as an out-of-scope statement (must-ask cases only read it).
 * The reply text is kept so an auditor can check both.
 *
 * @param input - The case id, the record, the snapshot and the profile.
 * @returns The observation and the audit fields.
 */
export const observeRun = (input: {
  readonly caseId: string;
  readonly record: RunRecord;
  readonly snapshot: HostRunSnapshot;
}): RoutingRunResult => {
  const { record, snapshot } = input;
  const binding = record.binding?.result;
  const boundKernel = binding?.kind === 'bound' ? binding.kernel : undefined;
  const assistantTexts = snapshot.messages.filter((message) => message.role === 'assistant').map((m) => textOf(m));
  const finalText = assistantTexts.at(-1) ?? '';
  const wrote = record.binding !== undefined || record.pendingWrites.length > 0;
  const askedInText = !wrote && !record.askedWithTool && questionPattern.test(finalText);
  const asked = record.askedWithTool || askedInText;
  const textBeforeWrite = assistantTexts.join('\n');
  const announced = boundKernel === undefined ? undefined : textBeforeWrite.includes(resolveKernel(boundKernel).name);
  const skillBeforeWrite =
    boundKernel === undefined
      ? undefined
      : record.skills.some(({ name, afterWrite }) => name === `cad-${boundKernel}` && !afterWrite);
  return {
    observation: {
      caseId: input.caseId,
      ...(boundKernel === undefined ? {} : { boundKernel }),
      asked,
      declinedOutOfScope: !wrote && !asked && finalText.trim().length > 0,
      ...(skillBeforeWrite === undefined ? {} : { skillBeforeWrite }),
      ...(announced === undefined ? {} : { announced }),
    },
    ...(record.binding === undefined
      ? {}
      : {
          bindingPath: record.binding.path,
          bindingKind: record.binding.result.kind,
        }),
    askedInText,
    finalText,
    tools: toolCalls(snapshot.messages).map((call) => call.toolName),
    state: snapshot.state,
    ...(snapshot.failure === undefined ? {} : { failure: JSON.stringify(snapshot.failure) }),
  };
};

/**
 * The prompt-only arm's system prompt (Appendix B): the card and an instruction to answer with one kernel id or a
 * question, never a model.
 *
 * @param testCase - The case.
 * @returns The system prompt.
 */
export const promptOnlySystemPrompt = (testCase: KernelRoutingCase): string => {
  const profile = perturbedProfile(testCase);
  const ids = profile.available.map((id) => `\`${id}\` (${resolveKernel(id).name})`).join(', ');
  return [
    'You choose the CAD kernel for a new Tau project from the person’s first message. You do not write the model.',
    renderKernelRoutingCard(profile),
    `Answer on one line: \`KERNEL: <id>\` with one of ${ids}, or \`ASK: <one question>\` when the rules say to ask, or \`NONE: <reason>\` when no kernel fits. Then one sentence of reason.`,
  ].join('\n\n');
};

/**
 * Read the prompt-only arm's answer.
 *
 * @param caseId - The case id.
 * @param text - The model's reply.
 * @returns The observation.
 */
export const observePromptOnly = (caseId: string, text: string): KernelRoutingObservation => {
  const kernel = /KERNEL:\s*`?([a-z0-9]+)`?/iu.exec(text)?.[1]?.toLowerCase();
  const asked = /\bASK:/u.test(text);
  const declined = /\bNONE:/u.test(text);
  return {
    caseId,
    ...(kernel !== undefined && isKernelId(kernel) ? { boundKernel: kernel } : {}),
    asked,
    declinedOutOfScope: declined,
  };
};
