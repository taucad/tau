import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { HostToolInvocation, HostToolResult, JsonValue, ToolRegistry } from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import { testModelLoadedModels } from '@taucad/chat/schemas/tools/test-model-summary';
import type { KernelId } from '@taucad/types/constants';
import { bindEntryFirstPass } from '@taucad/chat/prompts';
import type { EntryBinding } from '@taucad/chat/prompts';
import { loadHostToolRegistry, loadWorkspaceKernelRows, workspaceRoot } from '#testing/live/workspace-modules.js';
import { renderL2Oracle } from '#testing/live/kernel-routing-l2.tasks.js';
import type { L2Task } from '#testing/live/kernel-routing-l2.tasks.js';

/**
 * The L2 runner (blueprint AKS-3b, Appendix E): one full turn per task on the host tool registry `tau mcp` builds, then
 * a GeoSpec verdict from an oracle the agent never sees.
 *
 * The agent's tools are a plugin host's: the file and skill tools of `createHostToolRegistry` over the task's own
 * folder, with the system skill bundles `tau mcp` serves, and every CAD tool answered by a real `tau mcp` process
 * started on that folder over stdio, which evaluates every local kernel. The runner owns no CAD path of its own, so a
 * verdict is the shipped host's.
 */

const cliEntry = resolve(workspaceRoot, 'packages/cli/src/bin.ts');

/** Milliseconds one CAD call may take before the runner gives up on it. */
const cadCallTimeout = 280_000;

/** The oracle's file, written into the project only after the turn ends. */
export const l2OraclePath = 'l2-oracle.geospec.ts';

/** A running `tau mcp` on one folder. */
export type TauMcpProcess = Readonly<{
  tools: ReadonlySet<string>;
  call: (name: string, input: JsonValue, signal?: AbortSignal) => Promise<HostToolResult>;
  close: () => Promise<void>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Start `tau mcp` from source on one folder, as the plugin's `.mcp.json` starts the published binary.
 *
 * @param projectRoot - The folder it serves.
 * @returns The process's CAD tools.
 * @public
 */
export const startTauMcp = async (projectRoot: string): Promise<TauMcpProcess> => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', '@oxc-node/core/register', cliEntry, 'mcp', `--project=${projectRoot}`],
    cwd: workspaceRoot,
    stderr: 'pipe',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable
    env: { ...(process.env as Record<string, string>), CI: 'true' },
  });
  const client = new Client({ name: 'tau-kernel-routing-l2', version: '1' });
  await client.connect(transport);
  const { tools } = await client.listTools();
  return {
    tools: new Set(tools.map(({ name }) => name)),
    call: async (name, input, signal) => {
      const result = await client.callTool({ name, arguments: isRecord(input) ? input : {} }, undefined, {
        timeout: cadCallTimeout,
        ...(signal === undefined ? {} : { signal }),
      });
      const text = (Array.isArray(result.content) ? result.content : [])
        .map((part: unknown) => (isRecord(part) && typeof part['text'] === 'string' ? part['text'] : ''))
        .join('\n');
      return {
        content: (result.structuredContent as JsonValue | undefined) ?? { message: text },
        isError: result.isError === true,
      };
    },
    close: async () => client.close(),
  };
};

/** A CAD call a turn made through `tau mcp`, with its answer. */
export type L2CadCall = Readonly<{ invocation: HostToolInvocation; result: HostToolResult }>;

/**
 * The plugin host's tool list: file and skill tools in process, CAD tools forwarded to `tau mcp`. GeoSpec is listed
 * by the in-process registry only so that `test_model` carries its canonical schema; every call to it goes to `tau mcp`.
 *
 * @param input - The folder and its `tau mcp`.
 * @returns The registry an L2 turn runs on, and every CAD call it made.
 * @public
 */
export const createL2ToolRegistry = async (
  input: Readonly<{ projectRoot: string; mcp: TauMcpProcess }>,
): Promise<Readonly<{ registry: ToolRegistry; cadCalls: L2CadCall[] }>> => {
  const { createHostToolRegistry, systemSkillBundles } = await loadHostToolRegistry();
  const files = createHostToolRegistry({
    workspaceRoot: input.projectRoot,
    systemSkillBundles,
    geospecRunner: async () => {
      throw new Error('test_model runs in tau mcp.');
    },
  });
  const cadCalls: L2CadCall[] = [];
  return {
    cadCalls,
    registry: {
      list: () => files.list(),
      invoke: async (invocation) => {
        if (!input.mcp.tools.has(invocation.toolName)) {
          return files.invoke(invocation);
        }
        const result = await input.mcp.call(invocation.toolName, invocation.input, invocation.signal);
        cadCalls.push({ invocation, result });
        return result;
      },
    },
  };
};

/** The entry-less manifest an L2 project starts from (blueprint D3): a name and no main. */
const entryLessManifest = { $schema: 'https://tau.new/schemas/tau-v1.json', name: 'L2 task', assets: {} };

/**
 * A fresh entry-less project for one task.
 *
 * @param task - The task.
 * @returns The project's folder.
 * @public
 */
export const createL2Project = async (task: Pick<L2Task, 'id'>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), `tau-l2-${task.id}-`));
  await writeFile(join(root, 'tau.json'), `${JSON.stringify(entryLessManifest, undefined, 2)}\n`, 'utf8');
  return root;
};

const stringField = (value: unknown, key: string): string | undefined => {
  const field = isRecord(value) ? value[key] : undefined;
  return typeof field === 'string' ? field : undefined;
};

/**
 * The entry a turn wrote: the last file its own `evaluate_model` rendered, else the first model its own `test_model`
 * loaded, else the manifest's main.
 *
 * @param input - The folder and the turn's CAD calls.
 * @returns The entry's path relative to the folder, or undefined when the turn rendered nothing and declared no main.
 * @public
 */
export const findL2Entry = async (
  input: Readonly<{ projectRoot: string; cadCalls: readonly L2CadCall[] }>,
): Promise<string | undefined> => {
  const rendered = input.cadCalls
    .filter(({ invocation, result }) => invocation.toolName === toolName.evaluateModel && !result.isError)
    .map(({ invocation }) => stringField(invocation.input, 'targetFile'))
    .findLast((path) => path !== undefined);
  if (rendered !== undefined) {
    return rendered;
  }
  /* An agent that proves its model with GeoSpec may never call `evaluate_model`; the host adopts the first model a
   * complete `test_model` load rendered, as it adopts an `evaluate_model` target (blueprint D3). */
  const loaded = input.cadCalls
    .filter(({ invocation, result }) => invocation.toolName === toolName.testModel && !result.isError)
    .flatMap(({ result }) => testModelLoadedModels(result.content))
    .find((path) => path !== l2OraclePath);
  if (loaded !== undefined) {
    return loaded;
  }
  try {
    const manifest: unknown = JSON.parse(await readFile(join(input.projectRoot, 'tau.json'), 'utf8'));
    const assets = isRecord(manifest) ? manifest['assets'] : undefined;
    const main = isRecord(assets) ? assets['main'] : undefined;
    const entryPath = isRecord(main) ? main['entryPath'] : undefined;
    return typeof entryPath === 'string' ? entryPath : undefined;
  } catch {
    return undefined;
  }
};

/** One task's outcome. */
export type L2Verdict = Readonly<{
  task: string;
  entryPath: string | undefined;
  binding: EntryBinding | undefined;
  /** The catalog kernel the entry binds, when the runtime's first pass decides it. */
  kernel: KernelId | undefined;
  /** Whether that kernel is in the task's acceptable set; undefined when the first pass leaves it undecided. */
  acceptable: boolean | undefined;
  /** GeoSpec's answer: every claim passed. False also when there was no entry to judge. */
  passed: boolean;
  passes: number;
  failures: readonly string[];
}>;

/** Each claim's requirement; one GeoSpec could not decide also carries its reason, since it is not a geometry verdict. */
const requirementsOf = (value: JsonValue | undefined, key: string): string[] => {
  const list: unknown = isRecord(value) ? value[key] : undefined;
  return Array.isArray(list)
    ? list.map((item: unknown) => {
        const requirement = stringField(item, 'requirement') ?? JSON.stringify(item);
        return stringField(item, 'status') === 'inconclusive'
          ? `${requirement} (inconclusive: ${stringField(item, 'reason') ?? 'no reason given'})`
          : requirement;
      })
    : [];
};

/**
 * Judge what a turn left in its folder: bind the entry, write the oracle beside it and run it through `tau mcp`.
 *
 * @param input - The task, its folder, its `tau mcp` and the entry to judge.
 * @returns The verdict.
 * @public
 */
export const gradeL2Task = async (
  input: Readonly<{ task: L2Task; projectRoot: string; mcp: TauMcpProcess; entryPath: string | undefined }>,
): Promise<L2Verdict> => {
  const { task, entryPath } = input;
  if (entryPath === undefined) {
    return {
      task: task.id,
      entryPath,
      binding: undefined,
      kernel: undefined,
      acceptable: undefined,
      passed: false,
      passes: 0,
      failures: ['no entry: the turn rendered no model and declared no main'],
    };
  }
  const source = await readFile(join(input.projectRoot, entryPath), 'utf8').catch(() => '');
  const binding = bindEntryFirstPass({ entryPath, source, kernels: await loadWorkspaceKernelRows() });
  const kernel = binding.kind === 'bound' ? binding.kernel : undefined;
  await writeFile(
    join(input.projectRoot, l2OraclePath),
    renderL2Oracle({ id: task.id, oracle: task.oracle, entryPath }),
    'utf8',
  );
  const result = await input.mcp.call(toolName.testModel, { files: [l2OraclePath] });
  const passes = requirementsOf(result.content, 'passes');
  const failures = result.isError
    ? [stringField(result.content, 'message') ?? JSON.stringify(result.content)]
    : requirementsOf(result.content, 'failures');
  return {
    task: task.id,
    entryPath,
    binding,
    kernel,
    acceptable: kernel === undefined ? undefined : task.acceptable.includes(kernel),
    passed: !result.isError && failures.length === 0 && passes.length > 0,
    passes: passes.length,
    failures,
  };
};

/** What drives one turn: a live model, or the instrument's own scripted writer. */
export type L2Agent = (
  context: Readonly<{ task: L2Task; registry: ToolRegistry; projectRoot: string }>,
) => Promise<void>;

/**
 * Run one task end to end: a fresh entry-less folder, its own `tau mcp`, the turn, then the verdict.
 *
 * @param input - The task and the agent that takes the turn.
 * @returns The verdict.
 * @public
 */
export const runL2Task = async (input: Readonly<{ task: L2Task; agent: L2Agent }>): Promise<L2Verdict> => {
  const projectRoot = await createL2Project(input.task);
  const mcp = await startTauMcp(projectRoot);
  try {
    const { registry, cadCalls } = await createL2ToolRegistry({ projectRoot, mcp });
    await input.agent({ task: input.task, registry, projectRoot });
    const entryPath = await findL2Entry({ projectRoot, cadCalls });
    return await gradeL2Task({ task: input.task, projectRoot, mcp, entryPath });
  } finally {
    await mcp.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
};
