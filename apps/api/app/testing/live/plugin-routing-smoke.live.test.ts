import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KernelId } from '@taucad/types/constants';
import { bindEntryFirstPass } from '@taucad/chat/prompts';
import type { BindingKernelRow } from '@taucad/chat/prompts';
import { kernelRoutingRoutingCases } from '#testing/live/kernel-routing.cases.js';
import { loadWorkspaceKernelRows, workspaceRoot } from '#testing/live/workspace-modules.js';

/**
 * AKS-3c's plugin smoke (automatic kernel selection blueprint, Appendix E): headless Claude Code with the Tau plugin
 * loaded from this checkout (`claude --plugin-dir packages/agent-plugin`), in an empty folder, on 15 development cases
 * spread across the families. The threshold is an acceptable kernel bound in at least 12. It also reports how often the
 * `tau` skill was read before the first write. Each case's line, `[plugin-routing-smoke] metric`, is the record.
 *
 * The plugin must be built first (`pnpm nx run agent-plugin:build`) and `claude` must be on `PATH`. The run uses the
 * live Anthropic credential and an isolated `HOME`, so no user setting, hook or other plugin reaches the agent. The
 * agent may edit files and call the Tau tools only: no shell and no web.
 */

const pluginRoot = join(workspaceRoot, 'packages/agent-plugin');
const claudeModel = process.env['TAU_PLUGIN_SMOKE_MODEL'] ?? 'claude-sonnet-5-5';
const credential = process.env['TAU_TEST_ANTHROPIC_API_KEY'] ?? process.env.ANTHROPIC_API_KEY;
const caseTimeout = 900_000;

/*
 * The plugin host has every kernel but Zoo, so a web case's acceptable set gains the desktop-only kernels of its zone.
 * Desktop cases already carry them.
 */
const pluginExtras: Readonly<Partial<Record<KernelId, readonly KernelId[]>>> = {
  replicad: ['build123d', 'smlibpy'],
  picovoxel: ['picogk'],
};

const smokeCaseIds = [
  'u1-shelf-bracket',
  'u1-plant-pot-saucer',
  'u1-customiser-box',
  'u2-battery-housing',
  'u2-python-enclosure',
  'u3-m8-bolt',
  'u4-cast-housing',
  'u5-planetary',
  'u6-smlib-handle',
  'u7-grown-sculpture',
  'u8-cooling-jacket',
  'u9-led-blinker',
  'u9-keypad-pt',
  'u10-bookshelf',
  'u11-learn-openscad',
] as const;

const smokeCases = smokeCaseIds.map((id) => {
  const found = kernelRoutingRoutingCases.find((routingCase) => routingCase.id === id);
  if (found === undefined) {
    throw new Error(`No development case ${id}.`);
  }
  const widened =
    found.host === 'web' && found.tier === 'broad'
      ? found.acceptable.flatMap((kernel) => [kernel, ...(pluginExtras[kernel] ?? [])])
      : found.acceptable;
  return { ...found, acceptable: [...new Set(widened)] };
});

type ToolUse = Readonly<{ name: string; input: Record<string, unknown> }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The tool calls of a `--output-format stream-json` transcript, in order. */
const toolUsesOf = (transcript: string): ToolUse[] =>
  transcript
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .flatMap((line) => {
      const event: unknown = JSON.parse(line);
      const message = isRecord(event) && event['type'] === 'assistant' ? event['message'] : undefined;
      const content = isRecord(message) && Array.isArray(message['content']) ? (message['content'] as unknown[]) : [];
      return content.flatMap((block) =>
        isRecord(block) && block['type'] === 'tool_use' && typeof block['name'] === 'string'
          ? [{ name: block['name'], input: isRecord(block['input']) ? block['input'] : {} }]
          : [],
      );
    });

const resultOf = (transcript: string): Record<string, unknown> | undefined =>
  transcript
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line): unknown => JSON.parse(line))
    .find((event): event is Record<string, unknown> => isRecord(event) && event['type'] === 'result');

const writeTools = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const tauTool = (name: string, tool: string): boolean => name.startsWith('mcp__') && name.endsWith(`__${tool}`);

/** Whether the agent read the `tau` skill (by the Skill tool or by reading its file) before its first write. */
const readTauSkillFirst = (uses: readonly ToolUse[]): boolean => {
  const firstWrite = uses.findIndex(({ name }) => writeTools.has(name));
  const before = firstWrite === -1 ? uses : uses.slice(0, firstWrite);
  return before.some(
    ({ name, input }) =>
      (name === 'Skill' && /(?:^|:)tau$/u.test(text(input['skill']) || text(input['command']))) ||
      (name === 'Read' && text(input['file_path']).endsWith('skills/tau/SKILL.md')),
  );
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const readJson = async (path: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
};

/** The entry to judge: main if it resolves, else the first evaluated file, else the first file written. */
const entryOf = async (projectRoot: string, uses: readonly ToolUse[]): Promise<string | undefined> => {
  const manifest = await readJson(join(projectRoot, 'tau.json'));
  const assets = isRecord(manifest) && isRecord(manifest['assets']) ? manifest['assets'] : {};
  const main = isRecord(assets['main']) ? assets['main']['entryPath'] : undefined;
  const relative = (path: string): string => path.replace(`${projectRoot}/`, '').replace(/^\/+/u, '');
  const candidates = [
    ...(typeof main === 'string' ? [main] : []),
    ...uses.filter(({ name }) => tauTool(name, 'evaluate_model')).map(({ input }) => text(input['targetFile'])),
    ...uses
      .filter(({ name }) => name === 'Write')
      .map(({ input }) => text(input['file_path']))
      .filter((path) => !/(?:\.geospec\.|\.md$|\.json$|\.toml$|\.lock$)/u.test(path)),
  ]
    .filter((path) => path !== '')
    .map((path) => relative(path));
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop -- the first that exists wins
    if (await exists(join(projectRoot, candidate))) {
      return candidate;
    }
  }
  return undefined;
};

const runClaude = async (input: Readonly<{ cwd: string; home: string; prompt: string }>): Promise<string> =>
  new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: input.home, ANTHROPIC_API_KEY: credential, CI: 'true' };
    const child = spawn(
      'claude',
      [
        '-p',
        input.prompt,
        '--plugin-dir',
        pluginRoot,
        '--model',
        claudeModel,
        '--output-format',
        'stream-json',
        '--verbose',
        // File edits inside the case's empty folder and the Tau tools only: no shell, no web.
        '--permission-mode',
        'acceptEdits',
        '--allowedTools',
        'Read,Write,Edit,Glob,Grep,Skill,mcp__plugin_tau_tau__*',
        '--disallowedTools',
        'Bash,WebFetch,WebSearch,Task',
      ],
      {
        cwd: input.cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const decoder = new TextDecoder();
    const errorDecoder = new TextDecoder();
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      stdout += decoder.decode(chunk, { stream: true });
    });
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      stderr += errorDecoder.decode(chunk, { stream: true });
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), caseTimeout - 30_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (stdout === '' && code !== 0) {
        reject(new Error(`claude exited ${String(code)}: ${stderr.slice(0, 2000)}`));
        return;
      }
      resolve(stdout);
    });
  });

type SmokeVerdict = Readonly<{
  case: string;
  family: string;
  entryPath: string | undefined;
  kernel: KernelId | undefined;
  acceptable: boolean;
  tauSkillFirst: boolean;
  tools: readonly string[];
  costUsd: number | undefined;
  turns: number | undefined;
}>;

describe.skipIf(credential === undefined || credential === '')(
  `AKS-3c plugin smoke on Claude Code with ${claudeModel} (set TAU_TEST_ANTHROPIC_API_KEY to run)`,
  () => {
    let root: string;
    let kernels: readonly BindingKernelRow[];
    const verdicts: SmokeVerdict[] = [];

    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), 'tau-plugin-smoke-'));
      kernels = await loadWorkspaceKernelRows();
      expect(await exists(join(pluginRoot, 'dist/launch.mjs')), 'build the plugin first').toBe(true);
    });

    afterAll(async () => {
      const bound = verdicts.filter(({ acceptable }) => acceptable).length;
      const skillFirst = verdicts.filter(({ tauSkillFirst }) => tauSkillFirst).length;
      console.log(
        `[plugin-routing-smoke] summary ${JSON.stringify({ model: claudeModel, bound, skillFirst, of: verdicts.length, threshold: 12 })}`,
      );
      await rm(root, { recursive: true, force: true });
    });

    it.each(smokeCases.map((smokeCase) => [smokeCase.id, smokeCase] as const))(
      'binds an acceptable kernel for %s',
      async (id, smokeCase) => {
        const cwd = join(root, id);
        const home = join(root, `${id}-home`);
        await mkdir(cwd, { recursive: true });
        await mkdir(home, { recursive: true });
        const transcript = await runClaude({ cwd, home, prompt: smokeCase.prompt });
        await writeFile(join(root, `${id}.jsonl`), transcript, 'utf8');
        const uses = toolUsesOf(transcript);
        const entryPath = await entryOf(cwd, uses);
        const source = entryPath === undefined ? '' : await readFile(join(cwd, entryPath), 'utf8').catch(() => '');
        const binding = entryPath === undefined ? undefined : bindEntryFirstPass({ entryPath, source, kernels });
        const kernel = binding?.kind === 'bound' ? binding.kernel : undefined;
        const result = resultOf(transcript);
        const verdict: SmokeVerdict = {
          case: id,
          family: smokeCase.family,
          entryPath,
          kernel,
          acceptable: kernel !== undefined && smokeCase.acceptable.includes(kernel),
          tauSkillFirst: readTauSkillFirst(uses),
          tools: uses.map(({ name }) => name),
          costUsd: typeof result?.['total_cost_usd'] === 'number' ? result['total_cost_usd'] : undefined,
          turns: typeof result?.['num_turns'] === 'number' ? result['num_turns'] : undefined,
        };
        verdicts.push(verdict);
        console.log(`[plugin-routing-smoke] metric ${JSON.stringify(verdict)}`);
        expect(result, 'the turn finished').toBeDefined();
      },
      caseTimeout,
    );
  },
);
