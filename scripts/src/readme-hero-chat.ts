/**
 * Writes the README hero's showcase chat for the Planetary Gear System example.
 *
 * The chat is a genuine agent-host log: a scripted model transport and scripted
 * tool verdicts run through `createTauAgentHost`, so `events.jsonl` carries
 * exactly the rows a real run writes and the desktop app renders it like any
 * other chat. The files the turn "creates" are the example's own sources, and
 * `--mint` records the turn's revision through the native git port with the
 * placement's own provenance, so the turn's card reads `Rev N saved · 3 files`.
 *
 * Usage (from the workspace root, Node 24):
 *   node --import @oxc-node/core/register scripts/src/readme-hero-chat.ts \
 *     --project <project directory the app created> \
 *     [--chat-id <chat id>] [--mint | --revision <revisionId>] [--checkout <checkoutId>] \
 *     [--step-file <a STEP export of the model>] [--at <ISO time>]
 */

import { createHash } from 'node:crypto';
import { readdir, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createTauAgentHost, parseEventLog, reduceEventLog } from '../../packages/agent-host/src/index.ts';
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
} from '../../packages/agent-host/src/index.ts';
import { createNodeEventLog } from '../../packages/agent-host/src/node.ts';
import { classify } from '../../packages/filesystem/src/path-registry.ts';
import { ImmutableRevisionTree } from '../../packages/revisions/src/algorithms/index.ts';
import type { RevisionTreeInput } from '../../packages/revisions/src/algorithms/revision-tree.ts';
import { createNativeGitRevisionPort } from '../../packages/revisions/src/node/index.ts';
import { revisionId } from '../../packages/core/project/src/revision-id.ts';
import type { RevisionId } from '../../packages/core/project/src/revision-id.ts';
import type { ViewerNode } from '../../packages/workbench/src/records.schema.ts';
import type { RevisionProvenance } from '../../packages/revisions/src/revision-authority.ts';
import type { RevisionPort } from '../../packages/revisions/src/revision-port.ts';
import { workbenchPaths, workbenchRecords } from '../../packages/workbench/src/records.ts';
import { serializeChatRecord } from '../../libs/chat/src/schemas/chat-record.schema.ts';
import { toProviderToolJsonSchema } from '../../libs/chat/src/schemas/provider-tool-schemas.ts';
import {
  arrangeWorkbenchInputSchema,
  arrangeWorkbenchOutputSchema,
} from '../../libs/chat/src/schemas/tools/arrange-workbench.tool.schema.ts';
import {
  createFileInputSchema,
  createFileOutputSchema,
} from '../../libs/chat/src/schemas/tools/create-file.tool.schema.ts';
import { editFileInputSchema, editFileOutputSchema } from '../../libs/chat/src/schemas/tools/edit-file.tool.schema.ts';
import {
  evaluateModelInputSchema,
  evaluateModelOutputSchema,
} from '../../libs/chat/src/schemas/tools/evaluate-model.tool.schema.ts';
import {
  exportModelInputSchema,
  exportModelOutputSchema,
} from '../../libs/chat/src/schemas/tools/export-model.tool.schema.ts';
import {
  screenshotInputSchema,
  screenshotOutputSchema,
} from '../../libs/chat/src/schemas/tools/screenshot.tool.schema.ts';
import {
  testModelInputSchema,
  testModelOutputSchema,
} from '../../libs/chat/src/schemas/tools/test-model.tool.schema.ts';
import { useSkillInputSchema, useSkillOutputSchema } from '../../libs/chat/src/schemas/tools/use-skill.tool.schema.ts';
import type { ZodType } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const exampleDir = join(repoRoot, 'libs/tau-examples/src/kernels/replicad/planetary-gear-system');

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    'chat-id': { type: 'string' },
    revision: { type: 'string' },
    mint: { type: 'boolean', default: false },
    checkout: { type: 'string', default: 'checkout-live' },
    'step-file': { type: 'string' },
    at: { type: 'string' },
  },
});

if (values.project === undefined) {
  throw new Error('Pass --project <directory holding the project tau.json>.');
}
if (values.mint && values.revision !== undefined) {
  throw new Error('Pass either --mint or --revision, not both.');
}

const projectDir = resolve(values.project);
const checkoutId = values.checkout;
const modelId = 'anthropic-claude-fable-5.1';

// ---------------------------------------------------------------------------
// Sources: the project, the example's own files, the skills the agent loads.
// ---------------------------------------------------------------------------

const projectManifest = JSON.parse(await readFile(join(projectDir, 'tau.json'), 'utf8')) as {
  id: string;
  name: string;
};
const projectId = projectManifest.id;

const mainTs = await readFile(join(exampleDir, 'main.ts'), 'utf8');
const geospecTs = await readFile(join(exampleDir, 'main.geospec.ts'), 'utf8');
const designMd = await readFile(join(exampleDir, 'DESIGN.md'), 'utf8');
const thumbnail = await readFile(join(exampleDir, 'thumbnail.webp'));
const stepBytes = values['step-file'] === undefined ? undefined : await readFile(resolve(values['step-file']));

/* The same djb2 digest the skill resolver records, so the card never says the bundle changed. */
const fingerprintOf = (content: string): string => {
  let hash = 5381;
  for (let index = 0; index < content.length; index++) {
    // oxlint-disable-next-line unicorn/prefer-math-trunc, no-bitwise -- unsigned 32-bit wraparound is the resolver's own.
    hash = (hash * 33 + content.codePointAt(index)!) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/* A shipped system skill, read back the way `use_skill` answers for one. */
const systemSkill = async (slug: string, directory: string) => {
  const content = await readFile(join(directory, 'SKILL.md'), 'utf8');
  const baseDirectory = `.agents/skills/${slug}`;
  const supportingFiles = (await readdir(directory))
    .filter((name) => name !== 'SKILL.md')
    .sort()
    .map((name) => `${baseDirectory}/${name}`);
  const frontmatter: Record<string, string> = {};
  for (const line of (/^---\n([\S\s]*?)\n---/u.exec(content)?.[1] ?? '').split('\n')) {
    const separator = line.indexOf(':');
    if (separator !== -1) {
      frontmatter[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  return {
    skillName: slug,
    resourceUri: `system:skills/${slug}/SKILL.md`,
    skillPath: `${baseDirectory}/SKILL.md`,
    baseDirectory,
    source: 'system',
    fingerprint: fingerprintOf(content),
    frontmatter,
    content,
    supportingFiles,
  };
};
const replicadSkill = await systemSkill('cad-replicad', join(repoRoot, 'packages/plugins/replicad/agent/cad-replicad'));
const geospecSkill = await systemSkill('geospec-authoring', join(repoRoot, 'packages/geospec/agent/geospec-authoring'));

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
const geospecFile = 'main.geospec.ts';
/* What the turn leaves in the checkout: the result revision records exactly these. */
const turnFiles: ReadonlyArray<readonly [path: string, content: string]> = [
  ['main.ts', mainTs],
  [geospecFile, geospecTs],
  ['DESIGN.md', designMd],
];

// ---------------------------------------------------------------------------
// The chat: an existing one of the project's (the app seeds "Initial design"), or a fresh id.
// ---------------------------------------------------------------------------

const chatsDir = join(projectDir, '.tau', 'chats');
const existingChats = await readdir(chatsDir, { withFileTypes: true })
  .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
  .catch((): string[] => []);
let chatId = values['chat-id'];
if (chatId === undefined) {
  if (existingChats.length > 1) {
    throw new Error(`The project has ${String(existingChats.length)} chats; pass --chat-id.`);
  }
  chatId = existingChats[0] ?? 'chat_readme_hero';
}

// ---------------------------------------------------------------------------
// The workbench the agent arranges: the project's view, then Model, Kinematics and Parameters stacked.
// ---------------------------------------------------------------------------

const digestOf = (bytes: Uint8Array | string): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const layoutFile = join(projectDir, workbenchPaths.layout);
const existingLayout = await readFile(layoutFile).catch((): undefined => undefined);
const firstView = (node: ViewerNode): string | undefined =>
  node.kind === 'group' ? node.tabs[0]?.view : node.children.map(firstView).find((id) => id !== undefined);
let viewId: string;
let newViewRecord: { path: string; bytes: string } | undefined;
if (existingLayout === undefined) {
  viewId = `v-${createHash('sha256').update(projectId).digest('hex').slice(0, 8)}`;
  newViewRecord = {
    path: join(projectDir, workbenchPaths.view(viewId)),
    bytes: workbenchRecords.view.serialize({ version: 1, entryPath: 'main.ts' }),
  };
} else {
  const read = workbenchRecords.layout.read(new Uint8Array(existingLayout));
  if (read.status !== 'current') {
    throw new Error(`The project's layout.json is not readable: ${read.message}`);
  }
  const found = firstView(read.record.viewer);
  if (found === undefined) {
    throw new Error("The project's layout.json shows no view.");
  }
  viewId = found;
}
const arrangedWorkbench = {
  kind: 'split' as const,
  direction: 'column' as const,
  children: [
    { kind: 'group' as const, size: 2, tabs: [{ kind: 'pane' as const, pane: 'model' as const }] },
    { kind: 'group' as const, size: 2, tabs: [{ kind: 'pane' as const, pane: 'kinematics' as const }] },
    { kind: 'group' as const, size: 1, tabs: [{ kind: 'pane' as const, pane: 'parameters' as const }] },
  ],
};
const arrangedLayout = workbenchRecords.layout.serialize({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [{ kind: 'view', view: viewId }] },
  workbench: arrangedWorkbench,
});
const arrangeOutput = {
  status: 'written' as const,
  revisions: [
    ...(newViewRecord === undefined
      ? []
      : [
          {
            path: workbenchPaths.view(viewId),
            digest: digestOf(newViewRecord.bytes),
            previousDigest: 'missing' as const,
          },
        ]),
    {
      path: workbenchPaths.layout,
      digest: digestOf(arrangedLayout),
      previousDigest: existingLayout === undefined ? ('missing' as const) : digestOf(existingLayout),
    },
  ],
  visible: [
    { kind: 'view' as const, view: viewId },
    { kind: 'pane' as const, pane: 'model' as const },
    { kind: 'pane' as const, pane: 'kinematics' as const },
    { kind: 'pane' as const, pane: 'parameters' as const },
  ],
};

const stepArtifactPath = '.tau/artifacts/exports/main.step';

// ---------------------------------------------------------------------------
// The clock the run is recorded on: every row and reasoning timing reads it.
// ---------------------------------------------------------------------------

let nowMs = values.at === undefined ? Date.now() : Date.parse(values.at);
if (Number.isNaN(nowMs)) {
  throw new Error(`--at must be an ISO time, got ${values.at ?? ''}.`);
}
const startedAtMs = nowMs;
const realNow = Date.now;
Date.now = () => nowMs;
const advance = (ms: number): void => {
  nowMs += ms;
};

// ---------------------------------------------------------------------------
// The GeoSpec suite as the runner reports it.
// ---------------------------------------------------------------------------

const suite = 'Planetary Gear System';
const geospecNames = [...geospecTs.matchAll(/^\s{2}it\('([^']+)'/gmu)].map((match) => match[1]!);
if (geospecNames.length !== 10) {
  throw new Error(`Expected the example to declare 10 GeoSpec tests, found ${String(geospecNames.length)}.`);
}
const interferenceOrdinal = geospecNames.indexOf('has no gear or hardware interference') + 1;

const geospecRun = (failedOrdinals: readonly number[]) => {
  const tests = geospecNames.map((name, index) => {
    const ordinal = index + 1;
    return {
      id: `${geospecFile}:${String(ordinal)}`,
      requirement: `${suite} > ${name}`,
      targetFile: geospecFile,
      status: failedOrdinals.includes(ordinal) ? ('failed' as const) : ('passed' as const),
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
          severity: 'error' as const,
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
    runStatus: failures.length === 0 ? ('passed' as const) : ('failed' as const),
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
    lineageStatus: 'complete' as const,
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
  readonly thinkingMs?: number;
  readonly text?: string;
  readonly calls?: readonly ScriptedCall[];
  readonly usage: readonly [input: number, output: number];
};

const evaluated = { status: 'ready' as const, views: ['model'], exports: { stl: 'stl', step: 'step', glb: 'glb' } };

const exportStep: ScriptedStep[] =
  stepBytes === undefined
    ? []
    : [
        {
          calls: [
            {
              id: 'call_export_step',
              name: 'export_model',
              input: { targetFile: 'main.ts', to: 'step' },
              result: {
                to: 'step',
                exportId: 'step',
                files: [
                  {
                    name: 'main.step',
                    artifactPath: stepArtifactPath,
                    mimeType: 'application/step',
                    byteLength: stepBytes.byteLength,
                  },
                ],
              },
              ms: 6_400,
            },
          ],
          usage: [49_600, 60],
        },
      ];

const steps: readonly ScriptedStep[] = [
  {
    thinking: [
      'Fixed-ring planetary with i = 1 + Zr/Zs = 4, so Zr = 3·Zs. Module 2 with Zs = 24 gives Zr = 72 and Zp = (Zr − Zs)/2 = 24: the sun and the planets share one 24-tooth blank and one hob. Three planets need (Zs + Zr)/3 to be an integer: 96/3 = 32, so 120° spacing works.',
      'Pitch radii 24 / 24 / 72 mm put the planet centres at 48 mm. Ring OD 174 mm with a continuous rim and six counterbored M5 holes on a 162 mm PCD. Involute flanks as single B-spline edges rather than polygonal teeth; thin each external gear 0.10 mm tangentially and widen the ring spaces 0.10 mm for 0.20 mm pair backlash; standard addenda, 1.25-module dedenda, 0.5 mm × 45° tip chamfers on both faces.',
      'Carrier: two relieved three-arm spiders on hardened stepped pins, SAE 660 bronze flanged bushings and thrust washers, ISO 4762 M5 socket screws. Keyed Ø16 input shaft with a retaining-screw bore, keyed Ø12 output bore in the front hub.',
      'Mechanism: sun drives; carrier follows at θs/4; planets at −3θs/4 relative to the carrier. Verify envelope, the 22 named parts, the planet pitch circle, interference at the nominal and an advanced pose, and exact millimetre BRep validity. Load the cad-replicad skill for the model envelope and mechanism contract, and geospec-authoring for the test shape, first.',
    ].join('\n\n'),
    thinkingMs: 38_000,
    text: [
      '**Design brief — Planetary Gear System**',
      '',
      '- Ring-fixed stage, module 2, 20° pressure angle: $Z_s = 24$, $Z_p = 24$, $Z_r = 72$, so $i = 1 + Z_r/Z_s = 4$ with three planets at 120°.',
      '- True involute flanks as single B-spline edges, 0.20 mm pair backlash, 0.5 mm × 45° tip chamfers; the sun and planets share one 24-tooth blank.',
      '- Fixed ring on six counterbored M5 holes, keyed Ø16 input shaft, twin-plate carrier on hardened pins with bronze bushings, keyed Ø12 output hub: 22 named parts.',
    ].join('\n'),
    calls: [
      {
        id: 'call_use_skill_replicad',
        name: 'use_skill',
        input: {
          skillName: 'cad-replicad',
          reason: 'A Replicad assembly with named parts, materials and a declared mechanism.',
        },
        result: replicadSkill,
        ms: 700,
      },
      {
        id: 'call_use_skill_geospec',
        name: 'use_skill',
        input: {
          skillName: 'geospec-authoring',
          reason: 'The stage is proven with a GeoSpec suite before it ships.',
        },
        result: geospecSkill,
        ms: 500,
      },
    ],
    usage: [18_400, 1_310],
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
        ms: 1_200,
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
    usage: [31_900, 9_840],
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
    thinkingMs: 6_000,
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
        ms: 2_600,
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
    usage: [48_000, 1_960],
  },
  {
    calls: [
      {
        id: 'call_arrange_workbench',
        name: 'arrange_workbench',
        input: { workbench: arrangedWorkbench, lanes: { chat: true, workbench: true } },
        result: arrangeOutput,
        ms: 300,
      },
    ],
    usage: [48_900, 210],
  },
  ...exportStep,
  {
    text: [
      'All 10 requirements pass. `mechanism()` declares the joints, so the sun drives the carrier at $\\theta_c = \\theta_s/4$ and each planet at $-3\\theta_s/4$; press Play in Kinematics to run *Four sun turns*.',
      `Module, face width and input angle are live parameters, and the brief is in DESIGN.md${stepBytes === undefined ? '.' : '; main.step is ready for the shop.'}`,
    ].join(' '),
    usage: [50_200, 140],
  },
];

// ---------------------------------------------------------------------------
// Validate every scripted input and verdict against the real tool contracts.
// ---------------------------------------------------------------------------

const contracts: Record<string, { readonly input: ZodType; readonly output: ZodType; readonly description: string }> = {
  use_skill: { input: useSkillInputSchema, output: useSkillOutputSchema, description: 'Activate a skill.' },
  create_file: { input: createFileInputSchema, output: createFileOutputSchema, description: 'Create a file.' },
  edit_file: { input: editFileInputSchema, output: editFileOutputSchema, description: 'Edit a file.' },
  evaluate_model: {
    input: evaluateModelInputSchema,
    output: evaluateModelOutputSchema,
    description: 'Evaluate a CAD source.',
  },
  test_model: { input: testModelInputSchema, output: testModelOutputSchema, description: 'Run GeoSpec tests.' },
  screenshot: { input: screenshotInputSchema, output: screenshotOutputSchema, description: 'Capture the model.' },
  arrange_workbench: {
    input: arrangeWorkbenchInputSchema,
    output: arrangeWorkbenchOutputSchema,
    description: 'Arrange the workbench.',
  },
  export_model: { input: exportModelInputSchema, output: exportModelOutputSchema, description: 'Export the model.' },
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
// The revision the placement mints: the pre-turn tree when the line is unborn, then the turn's result.
// ---------------------------------------------------------------------------

const turnKey = { turnId: 'msg_hero_user_1', runId: 'run_hero_1', attempt: 1 } as const;
const port: RevisionPort | undefined = values.mint
  ? createNativeGitRevisionPort({ repositoryPath: projectDir })
  : undefined;
let baseHead: RevisionId | undefined;
/** Where `main` stood when the run was admitted; a re-run replaces the showcase revision it minted last time. */
let mainHead: RevisionId | undefined;
let minted: { revisionId: string; treeId: string | undefined } | undefined;

const provenanceOf = (turnCut: 'base' | 'result'): RevisionProvenance => ({
  source: 'agent',
  actorId: projectId,
  runId: turnKey.runId,
  attempt: turnKey.attempt,
  turnCut,
  turnId: turnKey.turnId,
  trigger: 'turn',
  createdAt: nowMs,
});
const revisionSummary = { generated: `Agent turn ${turnKey.turnId}` };

/* The checkout's versioned files, as the registry classifies them: the first revision of a new project. */
const versionedFilesOnDisk = async (): Promise<RevisionTreeInput[]> => {
  const files: RevisionTreeInput[] = [];
  for (const entry of await readdir(projectDir, { withFileTypes: true })) {
    if (entry.isFile() && classify(entry.name).versioned) {
      files.push([entry.name, new Uint8Array(await readFile(join(projectDir, entry.name)))]);
    }
  }
  return files;
};

const publish = async (store: RevisionPort, expectedHead: RevisionId | undefined, head: RevisionId): Promise<void> => {
  const moved = await store.updateRef({ name: 'main', expectedHead, head });
  if (moved.status !== 'updated') {
    throw new Error(`main did not move to ${head}: ${moved.status}.`);
  }
};

const mintBase = async (store: RevisionPort): Promise<RevisionId> => {
  await store.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  const receipt = await store.writeRevision({
    parents: [],
    tree: new ImmutableRevisionTree(await versionedFilesOnDisk()),
    provenance: provenanceOf('base'),
    summary: revisionSummary,
  });
  const base = revisionId(receipt.commitId);
  await publish(store, undefined, base);
  await store.setHead('main');
  return base;
};

const mintResult = async (
  store: RevisionPort,
  base: RevisionId,
  expectedHead: RevisionId,
): Promise<{ revisionId: RevisionId; treeId: string | undefined }> => {
  const baseTree = await store.readTree(base);
  if (baseTree === undefined) {
    throw new Error(`The base revision ${base} has no tree.`);
  }
  const turnPaths = new Set(turnFiles.map(([path]) => path));
  const entries: RevisionTreeInput[] = [
    ...baseTree
      .entries()
      .filter((entry) => !turnPaths.has(entry.path))
      .map((entry): RevisionTreeInput => [entry.path, entry.content, entry.mode]),
    ...turnFiles.map(([path, content]): RevisionTreeInput => [path, content]),
  ];
  const receipt = await store.writeRevision({
    parents: [base],
    tree: new ImmutableRevisionTree(entries),
    provenance: provenanceOf('result'),
    summary: revisionSummary,
  });
  const result = revisionId(receipt.commitId);
  await publish(store, expectedHead, result);
  const record = await store.readRevision(result);
  return { revisionId: result, treeId: record?.treeId };
};

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
      advance(step.thinkingMs ?? 3_000);
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

/* What each tool leaves on disk: the files the turn writes, the records it arranges, the export it keeps. */
const applyToolEffect = async (call: ScriptedCall): Promise<void> => {
  const input = call.input as { targetFile?: string; content?: string };
  switch (call.name) {
    case 'create_file': {
      await writeFile(join(projectDir, input.targetFile!), input.content!);
      return;
    }
    case 'edit_file': {
      await writeFile(join(projectDir, 'main.ts'), mainTs);
      return;
    }
    case 'arrange_workbench': {
      if (newViewRecord !== undefined) {
        await mkdir(dirname(newViewRecord.path), { recursive: true });
        await writeFile(newViewRecord.path, newViewRecord.bytes);
      }
      await mkdir(dirname(layoutFile), { recursive: true });
      await writeFile(layoutFile, arrangedLayout);
      return;
    }
    case 'export_model': {
      const artifact = join(projectDir, stepArtifactPath);
      await mkdir(dirname(artifact), { recursive: true });
      await writeFile(artifact, stepBytes!);
      return;
    }
    default: {
      return;
    }
  }
};

const registry: ToolRegistry = {
  list: () => definitions,
  invoke: async ({ toolCallId, toolName }) => {
    const call = calls.get(toolCallId);
    if (call === undefined || call.name !== toolName) {
      throw new Error(`Unscripted tool call ${toolName} (${toolCallId}).`);
    }
    advance(call.ms);
    await applyToolEffect(call);
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
    if (port !== undefined) {
      mainHead = await port.readRef('main');
      if (mainHead === undefined) {
        baseHead = await mintBase(port);
        mainHead = baseHead;
      } else {
        const head = await port.readRevision(mainHead);
        const minted = head?.provenance.turnId === 'msg_hero_user_1' && head.provenance.turnCut === 'result';
        baseHead = minted ? (head.parents[0] ?? mainHead) : mainHead;
      }
    }
    return {
      requestId,
      status: 'applied',
      placement: { checkoutId, mode: 'direct', root: projectDir, tools: registry },
    };
  },
  complete: async ({ requestId, key }) => {
    if (port !== undefined && baseHead !== undefined && mainHead !== undefined) {
      minted = await mintResult(port, baseHead, mainHead);
    }
    const revision =
      minted === undefined
        ? values.revision === undefined
          ? {}
          : { revisionId: values.revision }
        : {
            revisionId: minted.revisionId,
            branch: 'main',
            ...(minted.treeId === undefined ? {} : { treeId: minted.treeId }),
          };
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
        ...revision,
        changedPaths: turnFiles.map(([path]) => path).toSorted(),
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
      new Promise<void>((resolveWait) => {
        wake = resolveWait;
        signal.addEventListener('abort', () => {
          resolveWait();
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

const chatDir = join(chatsDir, chatId);
await mkdir(chatDir, { recursive: true });
const logPath = join(chatDir, 'events.jsonl');
/* A staged fixture replaces whatever the app or an earlier run logged for this chat. */
for (const stale of ['events.jsonl', 'events', 'authority.writer.lock']) {
  await rm(join(chatDir, stale), { recursive: true, force: true });
}

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
  now: () => new Date(nowMs),
  placement,
});

const prompt = [
  'Design an open 4:1 planetary stage in @main.ts: fixed 72T ring, 24T sun on a keyed input shaft, three planets on a twin-plate carrier.',
  `Declare the mechanism and prove it with GeoSpec${stepBytes === undefined ? '.' : ', then export a STEP.'}`,
].join(' ');
try {
  await host.admit({
    chatId,
    runId: turnKey.runId,
    trigger: 'submit',
    message: { id: turnKey.turnId, role: 'user', content: prompt, metadata: { timestamp: nowMs } },
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

const endedAtMs = nowMs;
const record = {
  id: chatId,
  resourceId: projectId,
  name: 'Initial design',
  createdAt: startedAtMs,
  updatedAt: endedAtMs,
  recencyAt: endedAtMs,
  activeExecution: { kind: 'tau' as const, model: modelId, effort: 'xhigh' as const },
  activeKernel: 'replicad' as const,
  ...(checkoutId === 'checkout-live' ? {} : { checkoutId }),
};
await writeFile(join(chatDir, 'chat.json'), serializeChatRecord(record));

// ---------------------------------------------------------------------------
// Report what the log holds, folded the way a reader folds it.
// ---------------------------------------------------------------------------

const events = parseEventLog(await readFile(logPath, 'utf8'));
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
console.log(`Project ${projectId}, chat ${chatId}, view ${viewId}`);
if (minted !== undefined) {
  console.log(`Minted the turn's revision ${minted.revisionId} on main (base ${baseHead ?? 'none'})`);
}
console.log(`Run recorded from ${new Date(startedAtMs).toISOString()} to ${new Date(endedAtMs).toISOString()}`);
