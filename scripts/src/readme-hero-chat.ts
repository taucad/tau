/**
 * Writes the README hero's showcase chat for the Planetary Gear System example.
 *
 * The chat is a genuine agent-host log: a scripted model transport and scripted
 * tool verdicts run through `createTauAgentHost`, so `events.jsonl` carries
 * exactly the rows a real run writes and the desktop app renders it like any
 * other chat. The files the turn "creates" are the example's own sources.
 *
 * Usage (from the workspace root, Node 24):
 *   node --import @oxc-node/core/register scripts/src/readme-hero-chat.ts \
 *     --project <the project directory whose tau.json the chat belongs to> \
 *     [--chat-id chat_readme_hero] [--revision <revisionId>] [--checkout <checkoutId>] [--at <ISO time>]
 */

import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createTauAgentHost, parseEventLog, reduceEventLog } from '@taucad/agent-host';
import type {
  HostToolDefinition,
  JsonObject,
  JsonValue,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
  ToolRegistry,
  TurnPlacementFact,
  TurnPlacementPort,
} from '@taucad/agent-host';
import { createNodeEventLog } from '@taucad/agent-host/node';
import {
  createFileInputSchema,
  createFileOutputSchema,
  editFileInputSchema,
  editFileOutputSchema,
  evaluateModelInputSchema,
  evaluateModelOutputSchema,
  screenshotInputSchema,
  screenshotOutputSchema,
  serializeChatRecord,
  testModelInputSchema,
  testModelOutputSchema,
  useSkillInputSchema,
  useSkillOutputSchema,
} from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { toProviderToolJsonSchema } from '@taucad/chat/schemas';
import type { ZodType } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const exampleDirectory = join(repoRoot, 'libs/tau-examples/src/kernels/replicad/planetary-gear-system');
const skillDirectory = join(repoRoot, '.agents/skills/brep-design');

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    'chat-id': { type: 'string', default: 'chat_readme_hero' },
    revision: { type: 'string' },
    checkout: { type: 'string', default: 'checkout-live' },
    at: { type: 'string' },
  },
});

if (values.project === undefined) {
  throw new Error('Pass --project <the project directory whose tau.json the chat belongs to>.');
}

const projectDirectory = resolve(values.project);
const chatId = values['chat-id'];
const checkoutId = values.checkout;
const modelId = 'anthropic-claude-fable-5.1';

// ---------------------------------------------------------------------------
// Sources: the example's own files, the skill the agent loads, the capture.
// ---------------------------------------------------------------------------

const mainTs = await readFile(join(exampleDirectory, 'main.ts'), 'utf8');
const geospecTs = await readFile(join(exampleDirectory, 'main.geospec.ts'), 'utf8');
const designMd = await readFile(join(exampleDirectory, 'DESIGN.md'), 'utf8');
const manifest = JSON.parse(await readFile(join(projectDirectory, 'tau.json'), 'utf8')) as { id: string; name: string };
const thumbnail = await readFile(join(exampleDirectory, 'thumbnail.webp'));
const skillMd = await readFile(join(skillDirectory, 'SKILL.md'), 'utf8');
const skillEntries = await readdir(skillDirectory);
const skillFiles = skillEntries.filter((name) => name !== 'SKILL.md').sort();
const skillDescription =
  /^description:\s*>-\n((?:\s{2}.*\n)+)/mu
    .exec(skillMd)?.[1]
    ?.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ') ?? '';

const projectId = manifest.id;

/* The first draft of main.ts meshes the ring at phase 0; GeoSpec catches the clash and the fix phases it by 2.5°. */
const phasedRing =
  "  const ringVoid = toothProfile(72, p.module, true)\n    .rotate(2.5)\n    .sketchOnPlane('XY', -2)";
const unphasedRing = "  const ringVoid = toothProfile(72, p.module, true)\n    .sketchOnPlane('XY', -2)";
if (!mainTs.includes(phasedRing)) {
  throw new Error('main.ts no longer carries the phased ring cut this script edits.');
}
const draftMainTs = mainTs.replace(phasedRing, unphasedRing);

const lineCount = (text: string): number => (text === '' ? 0 : text.split('\n').length);

const dataUrl = `data:image/webp;base64,${thumbnail.toString('base64')}`;

// ---------------------------------------------------------------------------
// The clock the run is recorded on: every row and reasoning timing reads it.
// ---------------------------------------------------------------------------

/** Milliseconds since the epoch on the recorded clock. */
let clock = values.at === undefined ? Date.now() : Date.parse(values.at);
if (Number.isNaN(clock)) {
  throw new TypeError(`--at must be an ISO time, got ${values.at ?? ''}.`);
}
const startedAtMs = clock;
const realNow = Date.now;
Date.now = () => clock;
const advance = (ms: number): void => {
  clock += ms;
};

// ---------------------------------------------------------------------------
// The GeoSpec suite as the runner reports it.
// ---------------------------------------------------------------------------

const suite = 'Planetary Gear System';
const geospecNames = [...geospecTs.matchAll(/^\s{2}it\('([^']+)'/gmu)].map((match) => match[1]!);
if (geospecNames.length !== 10) {
  throw new Error(`Expected the example to declare 10 GeoSpec tests, found ${String(geospecNames.length)}.`);
}
const geospecFile = 'main.geospec.ts';
const interferenceOrdinal = geospecNames.indexOf('has no gear or hardware interference') + 1;

const geospecRun = (failedOrdinals: readonly number[]) => {
  const tests = geospecNames.map((name, index) => {
    const ordinal = index + 1;
    return {
      id: `${geospecFile}:${String(ordinal)}`,
      requirement: `${suite} > ${name}`,
      targetFile: geospecFile,
      status: failedOrdinals.includes(ordinal) ? 'failed' : 'passed',
      ordinal,
    };
  });
  const passes = tests
    .filter((test) => test.status === 'passed')
    .map(({ id, requirement }) => ({ id, requirement, targetFile: 'main.ts' }));
  const failures = tests
    .filter((test) => test.status === 'failed')
    .map(({ id, requirement }) => ({
      id,
      requirement,
      reason:
        'Planet Gear 2 and Internal Ring Gear overlap by 0.21 mm along the tooth flanks near (-24.0, 41.6, 7.0); the tolerance is 0.015 mm.',
      suggestion:
        'Phase the ring tooth space by half a tooth pitch (2.5° for 72 teeth) so every planet engages between ring teeth at the as-built pose, then re-run the interference check.',
      targetFile: 'main.ts',
      diagnostics: [
        {
          code: 'component-interference',
          severity: 'error',
          message: 'Planet Gear 2 intersects Internal Ring Gear (overlap 0.21 mm, tolerance 0.015 mm).',
          suggestion: 'Rotate the internal tooth profile by 2.5° before cutting the ring.',
          spatial: { center: [-24, 41.569, 7] as [number, number, number] },
        },
      ],
    }));
  return {
    failures,
    passes,
    passed: passes.length,
    total: tests.length,
    runStatus: failures.length === 0 ? 'passed' : 'failed',
    tests,
    accounting: {
      discovered: tests.length,
      selected: tests.length,
      completed: tests.length,
      passed: passes.length,
      failed: failures.length,
      unsupported: 0,
      inconclusive: 0,
      skipped: 0,
      notRun: 0,
      requestedFiles: [geospecFile],
      completedFiles: [geospecFile],
      notRunFiles: [],
      discoveryComplete: true,
      cancelled: false,
      bailed: false,
    },
    lineageStatus: 'complete',
  };
};

// ---------------------------------------------------------------------------
// The scripted run: what the model says and calls, and what each tool answers.
// ---------------------------------------------------------------------------

type ScriptedCall = {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  readonly result: unknown;
  /** How long the tool runs on the recorded clock. */
  readonly ms: number;
};

type ScriptedStep = {
  readonly thinking?: string;
  /** Milliseconds the reasoning runs on the recorded clock. */
  readonly thinkingDuration?: number;
  readonly text?: string;
  readonly calls?: readonly ScriptedCall[];
  readonly usage: readonly [input: number, output: number];
};

const evaluated = { status: 'ready', views: ['model'], exports: { stl: 'stl', step: 'step', glb: 'glb' } };

const steps: readonly ScriptedStep[] = [
  {
    thinking: [
      'Fixed-ring planetary with i = 1 + Zr/Zs = 4, so Zr = 3·Zs. Module 2 with Zs = 24 gives Zr = 72 and Zp = (Zr − Zs)/2 = 24: the sun and the planets share one 24-tooth blank and one hob. Three planets need (Zs + Zr)/3 to be an integer: 96/3 = 32, so 120° spacing works.',
      'Pitch radii 24 / 24 / 72 mm put the planet centres at 48 mm. Ring OD 174 mm with a continuous rim and six counterbored M5 holes on a 162 mm PCD. Involute flanks as single B-spline edges rather than polygonal teeth; thin each external gear 0.10 mm tangentially and widen the ring spaces 0.10 mm for 0.20 mm pair backlash; standard addenda, 1.25-module dedenda, 0.5 mm × 45° tip chamfers on both faces.',
      'Carrier: two relieved three-arm spiders on hardened stepped pins, SAE 660 bronze flanged bushings and thrust washers, ISO 4762 M5 socket screws. Keyed Ø16 input shaft with a retaining-screw bore, keyed Ø12 output bore in the front hub.',
      'Mechanism: sun drives; carrier follows at θs/4; planets at −3θs/4 relative to the carrier. Verify envelope, the 22 named parts, the planet pitch circle, interference at the nominal and an advanced pose, and exact millimetre BRep validity. Load the brep-design skill for the feature-tree and DFM checklist first.',
    ].join('\n\n'),
    thinkingDuration: 38_000,
    text: [
      '**Design brief — Planetary Gear System**',
      '',
      '- Single-stage, ring-fixed planetary: module 2, 20° pressure angle, $Z_s = 24$, $Z_p = 24$, $Z_r = Z_s + 2Z_p = 72$; three planets at 120° since $(Z_s + Z_r)/3 = 32$; ratio $i = 1 + Z_r/Z_s = 4$.',
      '- True involute flanks as single B-spline edges, 0.20 mm pair backlash at the pitch circle, 0.5 mm × 45° tip chamfers; the sun and planets share one 24-tooth blank.',
      '- Fixed 72-tooth ring with six counterbored M5 holes, keyed Ø16 input shaft, twin-plate carrier on hardened stepped pins with bronze flanged bushings and thrust washers, keyed Ø12 output hub: 22 named parts.',
    ].join('\n'),
    calls: [
      {
        id: 'call_use_skill_1',
        name: 'use_skill',
        input: {
          skillName: 'brep-design',
          reason:
            'A gear stage with fastened carrier hardware: feature-tree BRep modelling and the DFM checklists apply.',
        },
        result: {
          skillName: 'brep-design',
          resourceUri: 'system:brep-design',
          source: 'system',
          frontmatter: { name: 'brep-design', description: skillDescription },
          content: skillMd,
          supportingFiles: skillFiles,
        },
        ms: 800,
      },
    ],
    usage: [18_400, 1310],
  },
  {
    calls: [
      {
        id: 'call_create_main',
        name: 'create_file',
        input: { targetFile: 'main.ts', content: draftMainTs },
        result: {
          diffStats: {
            linesAdded: lineCount(draftMainTs),
            linesRemoved: 0,
            originalContent: '',
            modifiedContent: draftMainTs,
          },
        },
        ms: 1200,
      },
      {
        id: 'call_create_geospec',
        name: 'create_file',
        input: { targetFile: geospecFile, content: geospecTs },
        result: {
          diffStats: {
            linesAdded: lineCount(geospecTs),
            linesRemoved: 0,
            originalContent: '',
            modifiedContent: geospecTs,
          },
        },
        ms: 600,
      },
    ],
    usage: [31_900, 9840],
  },
  {
    calls: [
      {
        id: 'call_evaluate_1',
        name: 'evaluate_model',
        input: { targetFile: 'main.ts' },
        result: evaluated,
        ms: 41_000,
      },
    ],
    usage: [42_100, 60],
  },
  {
    calls: [
      {
        id: 'call_test_1',
        name: 'test_model',
        input: { files: [geospecFile] },
        result: geospecRun([interferenceOrdinal]),
        ms: 57_000,
      },
    ],
    usage: [42_400, 70],
  },
  {
    thinking:
      'One failure: Planet Gear 2 overlaps the ring by 0.21 mm at the as-built pose. The ring tooth spaces are cut at phase 0 while the planets sit at 7.5° − θs/2, so the planet teeth meet ring teeth instead of spaces. Half a ring tooth pitch is 360/72/2 = 2.5°: rotating the internal profile by 2.5° before the cut phases every mesh. The 0.10 mm space widening stays.',
    thinkingDuration: 6000,
    text: 'GeoSpec caught tooth contact between Planet Gear 2 and the ring at the as-built pose. Phased the ring tooth space by 2.5° so all three meshes engage clear, then re-rendered and re-ran the suite.',
    calls: [
      {
        id: 'call_edit_main',
        name: 'edit_file',
        input: { targetFile: 'main.ts', oldString: unphasedRing, newString: phasedRing },
        result: {
          diffStats: { linesAdded: 1, linesRemoved: 0, originalContent: draftMainTs, modifiedContent: mainTs },
        },
        ms: 400,
      },
    ],
    usage: [44_900, 410],
  },
  {
    calls: [
      {
        id: 'call_evaluate_2',
        name: 'evaluate_model',
        input: { targetFile: 'main.ts' },
        result: evaluated,
        ms: 39_000,
      },
      {
        id: 'call_test_2',
        name: 'test_model',
        input: { files: [geospecFile] },
        result: geospecRun([]),
        ms: 55_000,
      },
    ],
    usage: [45_300, 90],
  },
  {
    calls: [
      {
        id: 'call_screenshot_1',
        name: 'screenshot',
        input: { mode: 'single', targetFile: 'main.ts' },
        result: { images: [{ view: 'model', angle: 'isometric', dataUrl }] },
        ms: 2600,
      },
    ],
    usage: [46_200, 50],
  },
  {
    calls: [
      {
        id: 'call_create_design',
        name: 'create_file',
        input: { targetFile: 'DESIGN.md', content: designMd },
        result: {
          diffStats: {
            linesAdded: lineCount(designMd),
            linesRemoved: 0,
            originalContent: '',
            modifiedContent: designMd,
          },
        },
        ms: 500,
      },
    ],
    usage: [48_000, 1960],
  },
  {
    text: 'All 10 requirements pass. `mechanism()` declares the joints, so the sun drives the carrier at $\\theta_c = \\theta_s/4$ and each planet at $-3\\theta_s/4$; the *Four sun turns* clip runs one carrier revolution in 8 s. Module, face width and input angle are live parameters, and the brief is in DESIGN.md.',
    usage: [50_200, 140],
  },
];

// ---------------------------------------------------------------------------
// Validate every scripted input and verdict against the real tool contracts.
// ---------------------------------------------------------------------------

const contracts: Record<string, { readonly input: ZodType; readonly output: ZodType; readonly description: string }> = {
  [toolName.useSkill]: { input: useSkillInputSchema, output: useSkillOutputSchema, description: 'Activate a skill.' },
  [toolName.createFile]: {
    input: createFileInputSchema,
    output: createFileOutputSchema,
    description: 'Create a file.',
  },
  [toolName.editFile]: { input: editFileInputSchema, output: editFileOutputSchema, description: 'Edit a file.' },
  [toolName.evaluateModel]: {
    input: evaluateModelInputSchema,
    output: evaluateModelOutputSchema,
    description: 'Evaluate a CAD source.',
  },
  [toolName.testModel]: {
    input: testModelInputSchema,
    output: testModelOutputSchema,
    description: 'Run GeoSpec tests.',
  },
  screenshot: { input: screenshotInputSchema, output: screenshotOutputSchema, description: 'Capture the model.' },
};

const calls = new Map<string, ScriptedCall>();
for (const step of steps) {
  for (const call of step.calls ?? []) {
    const contract = contracts[call.name];
    if (contract === undefined) {
      throw new Error(`No contract for ${call.name}.`);
    }
    contract.input.parse(call.input);
    contract.output.parse(call.result);
    calls.set(call.id, call);
  }
}

const definitions: HostToolDefinition[] = Object.entries(contracts).map(([name, contract]) => ({
  name,
  description: contract.description,
  inputSchema: toProviderToolJsonSchema(contract.input) as JsonObject,
}));

// ---------------------------------------------------------------------------
// The transport, the tools and the placement the host runs the turn against.
// ---------------------------------------------------------------------------

const usageEvent = ([input, output]: readonly [number, number]): ModelStreamEvent => ({
  type: 'usage',
  usage: {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
});

class ScriptedTransport implements ModelTransport {
  public readonly funding = { type: 'unfunded' } as const;
  #cursor = 0;

  public async *stream(_request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
    const step = steps[this.#cursor];
    this.#cursor++;
    if (step === undefined) {
      throw new Error(`The script has ${String(steps.length)} model steps; the host asked for more.`);
    }
    let contentIndex = 0;
    advance(900);
    if (step.thinking !== undefined) {
      yield { type: 'thinking-start', contentIndex };
      yield { type: 'thinking-delta', contentIndex, text: step.thinking };
      advance(step.thinkingDuration ?? 3000);
      yield { type: 'thinking-end', contentIndex, content: step.thinking };
      contentIndex++;
    }
    if (step.text !== undefined) {
      yield { type: 'text-start', contentIndex };
      yield { type: 'text-delta', contentIndex, text: step.text };
      advance(Math.round(step.text.length * 9));
      yield { type: 'text-end', contentIndex, content: step.text };
      contentIndex++;
    }
    for (const call of step.calls ?? []) {
      yield {
        type: 'tool-input',
        contentIndex,
        toolCallId: call.id,
        toolName: call.name,
        input: call.input as JsonValue,
      };
      contentIndex++;
    }
    yield usageEvent(step.usage);
    yield { type: 'completed', stopReason: step.calls?.length ? 'toolUse' : 'stop' };
  }
}

const facts: TurnPlacementFact[] = [];
let wake: () => void = () => undefined;
let changedKey: { turnId: string; runId: string; chatId: string; attempt: number } | undefined;
let changeReported = false;

const registry: ToolRegistry = {
  list: () => definitions,
  invoke: async ({ toolCallId, toolName }) => {
    const call = calls.get(toolCallId);
    if (call === undefined || call.name !== toolName) {
      throw new Error(`Unscripted tool call ${toolName} (${toolCallId}).`);
    }
    advance(call.ms);
    if (!changeReported && (toolName === 'create_file' || toolName === 'edit_file') && changedKey !== undefined) {
      changeReported = true;
      facts.push({ kind: 'changed', key: changedKey, checkoutId });
      wake();
    }
    return { content: call.result as JsonValue, isError: false };
  },
};

const placement: TurnPlacementPort = {
  admit: async ({ requestId, key }) => {
    changedKey = key;
    return {
      requestId,
      status: 'applied',
      placement: { checkoutId, mode: 'direct', root: projectDirectory, tools: registry },
    };
  },
  complete: async ({ requestId, key }) => {
    facts.push({
      kind: 'settled',
      key,
      row: {
        type: 'turn.finalized',
        runId: key.runId,
        attempt: key.attempt,
        turnId: key.turnId,
        chatId: key.chatId,
        projectId,
        checkoutId,
        ...(values.revision === undefined ? {} : { revisionId: values.revision }),
        changedPaths: ['DESIGN.md', 'main.geospec.ts', 'main.ts'],
        trigger: 'turn',
        runIds: [key.runId],
      },
    });
    wake();
    return { requestId, status: 'applied' };
  },
  abandon: async ({ requestId }) => ({ requestId, status: 'applied' }),
  reconcile: async ({ requestId }) => ({ requestId, status: 'applied', held: [] }),
  async *settlements({ signal }) {
    let next = 0;
    const nextFact = async (): Promise<void> =>
      new Promise<void>((resolve) => {
        wake = resolve;
        signal.addEventListener('abort', () => {
          resolve();
        });
      });
    while (!signal.aborted) {
      while (next < facts.length) {
        const fact = facts[next];
        next++;
        if (fact !== undefined) {
          yield fact;
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- a listen waits for the next fact.
      await nextFact();
    }
  },
  acknowledge: async ({ requestId }) => ({ requestId, status: 'applied' }),
};

// ---------------------------------------------------------------------------
// Run the turn into `.tau/chats/<chatId>/events.jsonl`, then write chat.json.
// ---------------------------------------------------------------------------

const chatDirectory = join(projectDirectory, '.tau', 'chats', chatId);
await mkdir(chatDirectory, { recursive: true });
const logPath = join(chatDirectory, 'events.jsonl');

let messageSerial = 0;
let epochSerial = 0;
const host = createTauAgentHost({
  systemPrompt: '',
  model: { id: modelId, contextWindow: 200_000, providerKind: 'anthropic', reasoning: { effort: 'xhigh' } },
  modelTransport: new ScriptedTransport(),
  toolRegistry: registry,
  openEventLog: async () => createNodeEventLog({ filePath: logPath, access: 'write' }),
  createId: () => `msg_hero_${String(++messageSerial).padStart(3, '0')}`,
  createLeaderEpoch: () => `epoch_hero_${String(++epochSerial)}`,
  now: () => new Date(clock),
  placement,
});

const prompt = 'an open 4:1 planetary gear stage: fixed ring, keyed input shaft, twin-plate carrier, ready to machine';
try {
  await host.admit({
    chatId,
    runId: 'run_hero_1',
    trigger: 'submit',
    message: { id: 'msg_hero_user_1', role: 'user', content: prompt, metadata: { timestamp: clock } },
    config: {
      systemPrompt: '',
      toolChoice: 'auto',
      model: { id: modelId, contextWindow: 200_000, providerKind: 'anthropic', reasoning: { effort: 'xhigh' } },
    },
  });
} finally {
  await host.close();
  Date.now = realNow;
}

const endedAtMs = clock;
const record: ChatRecord = {
  id: chatId,
  resourceId: projectId,
  name: 'Initial design',
  createdAt: startedAtMs,
  updatedAt: endedAtMs,
  recencyAt: endedAtMs,
  activeExecution: { kind: 'tau', model: modelId, effort: 'xhigh' },
  activeKernel: 'replicad',
  ...(checkoutId === 'checkout-live' ? {} : { checkoutId }),
};
await writeFile(join(chatDirectory, 'chat.json'), serializeChatRecord(record));

// ---------------------------------------------------------------------------
// Report what the log holds, folded the way a reader folds it.
// ---------------------------------------------------------------------------

const text = await readFile(logPath, 'utf8');
const events = parseEventLog(text);
const messages = reduceEventLog(events);
const describe = (content: JsonValue): string => {
  if (typeof content === 'string') {
    return `"${content.slice(0, 60)}"`;
  }
  if (!Array.isArray(content)) {
    return typeof content;
  }
  return content
    .map((block) => {
      if (block === null || typeof block !== 'object' || Array.isArray(block)) {
        return '?';
      }
      const type = String(block['type']);
      if (type === 'toolCall') {
        return `toolCall:${String(block['name'])}`;
      }
      if (type === 'text' || type === 'thinking') {
        return `${type}(${String(String(block[type]).length)})`;
      }
      return type;
    })
    .join(' + ');
};
console.log(`Wrote ${String(events.length)} rows to ${logPath}`);
console.log(`Row types: ${[...new Set(events.map((event) => event.type))].join(', ')}`);
for (const message of messages) {
  const label =
    message.role === 'tool-input' || message.role === 'tool-output'
      ? `${message.role} ${message.toolName}`
      : message.role;
  console.log(`- ${label}: ${describe(message.content)}`);
}
console.log(`Run recorded from ${new Date(startedAtMs).toISOString()} to ${new Date(endedAtMs).toISOString()}`);
