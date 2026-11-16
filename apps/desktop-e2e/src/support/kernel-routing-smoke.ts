import { copyFileSync, existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from 'playwright';
import { expect } from 'vitest';
import { bindEntryFirstPass } from '@taucad/chat/prompts';
import type { BindingKernelRow } from '@taucad/chat/prompts';
import type { DesktopSession } from '#support/desktop-app.js';
import { currentRun } from '#support/acp-evidence.js';
import {
  activeChatId,
  cancelRun,
  connectPickedFolder,
  expectSignedIn,
  expectVisible,
  parkPointer,
  selectKernel,
  sendPrompt,
  submitPrompt,
} from '#support/scenario.js';

/**
 * AKS-3c's desktop ACP and Grok smokes (automatic kernel selection blueprint, D9 and Appendix E): one development case
 * from `apps/api/app/testing/live/kernel-routing.cases.ts` per test, driven through a vendor agent in the packaged app,
 * judged like the plugin smoke: the first written entry, bound by the runtime's first pass (`bindEntryFirstPass`).
 * Like the gate arm, a turn stops once the entry's kernel is decided: at its first `evaluate_model` result.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../..');

/* Loaded by file URL, as the API's evals load them: a package edge would put the API's test corpus and every kernel
 * in this project's graph. */
const workspaceModule = async (path: string): Promise<Record<string, unknown>> =>
  (await import(pathToFileURL(join(workspaceRoot, path)).href)) as Record<string, unknown>;

type KernelId = string;

/** A kernel's display name, as the kernel selector lists it. */
const kernelName = async (id: KernelId): Promise<string> => {
  const module = await workspaceModule('libs/types/src/constants/kernel.constants.ts');
  const rows = module['kernelConfigurations'] as ReadonlyArray<{ readonly id: string; readonly name: string }>;
  const row = rows.find((kernel) => kernel.id === id);
  if (row === undefined) {
    throw new Error(`No kernel ${id}.`);
  }
  return row.name;
};

/** The fields of a development case a smoke reads. */
export type RoutingCase = {
  readonly id: string;
  readonly prompt: string;
  readonly kind: string;
  readonly family: string;
  readonly preference: KernelId;
  readonly fixture:
    | { readonly kind: 'entry-less' }
    | { readonly kind: 'existing'; readonly owner: KernelId; readonly entryPath: string };
  readonly acceptable: readonly KernelId[];
};

/** The named development cases, in the order given. */
export const loadRoutingCases = async (ids: readonly string[]): Promise<readonly RoutingCase[]> => {
  const module = await workspaceModule('apps/api/app/testing/live/kernel-routing.cases.ts');
  const all = module['kernelRoutingDevelopmentCases'] as readonly RoutingCase[];
  return ids.map((id) => {
    const found = all.find((routingCase) => routingCase.id === id);
    if (found === undefined) {
      throw new Error(`No development case ${id}.`);
    }
    return found;
  });
};

const loadKernelRows = async (): Promise<readonly BindingKernelRow[]> => {
  const module = await workspaceModule('libs/tau-examples/scripts/runtime.ts');
  return (module['workspaceKernelRows'] as () => Promise<readonly BindingKernelRow[]>)();
};

/** One ACP tool call of a run, input and output paired, with the files its edit content names. */
export type ToolCall = {
  readonly id: string;
  readonly name: string;
  readonly kind?: string;
  readonly title: string;
  input?: unknown;
  output?: unknown;
  isError: boolean;
  readonly edits: string[];
};

/** Paths an ACP tool message's content parts name: the files an edit call touched. */
const editedPaths = (content: unknown): readonly string[] =>
  (Array.isArray(content) ? (content as unknown[]) : []).flatMap((part) =>
    typeof part === 'object' && part !== null && 'path' in part && typeof part.path === 'string' ? [part.path] : [],
  );

/** Pair one run's tool inputs and outputs, in order, with the call metadata ACP records. */
export const runToolCalls = (events: string, runId: string): readonly ToolCall[] => {
  const calls = new Map<string, ToolCall>();
  for (const line of events.split('\n').filter((row) => row.trim() !== '')) {
    const event = JSON.parse(line) as {
      type: string;
      runId?: string;
      message?: {
        role?: string;
        toolCallId?: string;
        toolName?: string;
        content?: unknown;
        isError?: boolean;
        call?: { nativeName?: string; kind?: string };
      };
    };
    const { message } = event;
    if (
      event.type !== 'message.appended' ||
      event.runId !== runId ||
      message?.toolCallId === undefined ||
      (message.role !== 'tool-input' && message.role !== 'tool-output')
    ) {
      continue;
    }
    const call = calls.get(message.toolCallId) ?? {
      id: message.toolCallId,
      name: message.call?.nativeName ?? message.toolName ?? '',
      ...(message.call?.kind === undefined ? {} : { kind: message.call.kind }),
      title: message.toolName ?? '',
      isError: false,
      edits: [],
    };
    calls.set(message.toolCallId, call);
    if (message.role === 'tool-input') {
      call.input = message.content;
    } else {
      call.output = message.content;
      call.isError = message.isError === true;
    }
    call.edits.push(...editedPaths(message.content));
  }
  return [...calls.values()];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A file that can be a model entry: not a test, note, manifest or lock. */
const modelFile = (path: string): boolean =>
  !/(?:\.geospec\.|\.md$|\.json$|\.toml$|\.lock$|\.txt$|\.png$)/u.test(path) && !path.includes('.tau/');

const evaluatedFiles = (calls: readonly ToolCall[]): string[] =>
  calls.flatMap((call) => {
    const target = isRecord(call.input) ? call.input['targetFile'] : undefined;
    return call.title === 'evaluate_model' && typeof target === 'string' ? [target] : [];
  });

const written = (calls: readonly ToolCall[]): string[] =>
  calls.flatMap((call) => {
    if (call.edits.length > 0) {
      return call.edits;
    }
    const target = isRecord(call.input) ? call.input['targetFile'] : undefined;
    return ['create_file', 'edit_file', 'write_file'].includes(call.name) && typeof target === 'string' ? [target] : [];
  });

/** A case's result: the kernel bound by its first written entry, and whether the case passes. */
export type RoutingVerdict = {
  readonly case: string;
  readonly kind: string;
  readonly family: string;
  readonly agent: string;
  readonly entryPath: string | undefined;
  readonly kernel: KernelId | undefined;
  /** Every model file the turn wrote or evaluated, with its binding; the existing-project case is judged on all. */
  readonly files: Readonly<Record<string, string>>;
  readonly acceptable: readonly KernelId[];
  readonly pass: boolean;
  readonly reason: string;
  readonly pillBefore: string | undefined;
  readonly pillAfter: string | undefined;
  readonly lifecycle: string | undefined;
  readonly tools: readonly string[];
};

/** Judge a run's writes: the first written entry's kernel, and every model file the run wrote or evaluated. */
const judge = ({
  routingCase,
  root,
  calls,
  kernels,
}: {
  readonly routingCase: RoutingCase;
  readonly root: string;
  readonly calls: readonly ToolCall[];
  readonly kernels: readonly BindingKernelRow[];
}): Pick<RoutingVerdict, 'entryPath' | 'kernel' | 'files' | 'pass' | 'reason'> => {
  const relative = (path: string): string => path.replace(`${root}/`, '').replace(/^\/+/u, '');
  const bind = (path: string): KernelId | undefined => {
    const absolute = join(root, path);
    if (!existsSync(absolute)) {
      return undefined;
    }
    const binding = bindEntryFirstPass({ entryPath: path, source: readFileSync(absolute, 'utf8'), kernels });
    return binding.kind === 'bound' ? binding.kernel : undefined;
  };
  const turnFiles = [...new Set([...evaluatedFiles(calls), ...written(calls)].map((path) => relative(path)))].filter(
    (path) => modelFile(path),
  );
  const files = Object.fromEntries(turnFiles.map((path) => [path, bind(path) ?? 'unbound']));
  const manifest = existsSync(join(root, 'tau.json'))
    ? (JSON.parse(readFileSync(join(root, 'tau.json'), 'utf8')) as { assets?: { main?: { entryPath?: string } } })
    : undefined;
  const main = manifest?.assets?.main?.entryPath;
  // The entry to judge: main if it resolves, else the first evaluated file, else the first model file written.
  const entryPath = [
    ...(main === undefined ? [] : [main]),
    ...evaluatedFiles(calls).map((path) => relative(path)),
    ...turnFiles,
  ].find((path) => existsSync(join(root, path)));
  const kernel = entryPath === undefined ? undefined : bind(entryPath);
  if (routingCase.kind === 'existing') {
    // The corpus's rule: an existing case fails on a write in any kernel but the owner's.
    const others = Object.entries(files).filter(([, bound]) => !routingCase.acceptable.includes(bound));
    const pass = others.length === 0;
    const reason = pass
      ? `kept ${routingCase.acceptable.join('/')}${turnFiles.length === 0 ? ' (no model written)' : ''}`
      : `wrote ${others.map(([path, bound]) => `${path} (${bound})`).join(', ')}`;
    return { entryPath, kernel, files, pass, reason };
  }
  const pass = kernel !== undefined && routingCase.acceptable.includes(kernel);
  const reason =
    entryPath === undefined
      ? 'no model written'
      : kernel === undefined
        ? `${entryPath} did not bind in the first pass`
        : pass
          ? `${kernel} is acceptable`
          : `${kernel} is not in ${routingCase.acceptable.join('/')}`;
  return { entryPath, kernel, files, pass, reason };
};

const kernelPill = (page: Page) => page.getByRole('button', { name: /^Kernel: /u }).first();

/** Leave the kernel selector on Auto, choosing it when the device remembers a concrete kernel. */
const ensureAuto = async (page: Page): Promise<void> => {
  await expectVisible(kernelPill(page));
  const label = await kernelPill(page).getAttribute('aria-label');
  if (!label?.startsWith('Kernel: Auto')) {
    await selectKernel(page, 'Auto');
  }
  await expect.poll(async () => kernelPill(page).getAttribute('aria-label')).toMatch(/^Kernel: Auto/u);
};

/** An OpenSCAD L-bracket: the existing model an existing-project case starts from. */
const existingBracket = `// L-bracket, 60 x 20 mm, 4 mm thick, two 5 mm holes.
difference() {
  union() {
    cube([60, 20, 4]);
    cube([4, 20, 40]);
  }
  translate([35, 10, -1]) cylinder(d = 5, h = 6, $fn = 48);
  translate([-1, 10, 25]) rotate([0, 90, 0]) cylinder(d = 5, h = 6, $fn = 48);
}
`;

/**
 * Run one routing case through a vendor agent and judge it. `options.chooseAgent` selects the agent and model in whichever
 * composer is on screen and returns the selector's label.
 */
export const runRoutingCase = async (
  session: DesktopSession,
  routingCase: RoutingCase,
  options: { readonly signedOut: boolean; readonly chooseAgent: (page: Page) => Promise<string> },
): Promise<RoutingVerdict> => {
  const { page } = session;
  const { chooseAgent } = options;
  const kernels = await loadKernelRows();
  await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
  if (!options.signedOut) {
    await expectSignedIn(page);
  }
  const projectRoot = (): string => {
    const url = new URL(page.url());
    const slug = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
    const own = join(session.pickedDirectory, slug);
    const chat = url.searchParams.get('chat');
    if (existsSync(own) || chat === null) {
      return own;
    }
    /* A release build keeps its folder grants in the person's own profile (its config location is locked), so it can
     * place the project in a folder an earlier case picked: find the one holding this chat. */
    const found = readdirSync(tmpdir())
      .filter((name) => name.startsWith('tau-desktop-e2e-pick-'))
      .map((name) => join(tmpdir(), name, basename(session.pickedDirectory), slug))
      .find((path) => existsSync(join(path, '.tau/chats', chat)));
    return found ?? own;
  };
  const eventsOf = (chatId: string): string => {
    const path = join(projectRoot(), '.tau/chats', chatId, 'events.jsonl');
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  };
  let agent: string;

  const { fixture } = routingCase;
  if (fixture.kind === 'existing') {
    // The existing project: a concrete-kernel project (its template sets the owner), its first turn a cheap one.
    await selectKernel(page, await kernelName(fixture.owner));
    await connectPickedFolder(session);
    await chooseAgent(page);
    await submitPrompt(page, 'Reply only READY. Do not use tools.');
    await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
    const seedChat = activeChatId(page);
    await expect
      .poll(() => currentRun(eventsOf(seedChat))?.lifecycle, { timeout: 300_000, interval: 2000 })
      .toMatch(/^(?:completed|failed|cancelled)$/u);
    const manifest = JSON.parse(readFileSync(join(projectRoot(), 'tau.json'), 'utf8')) as {
      assets?: { main?: { entryPath?: string } };
    };
    expect(manifest.assets?.main?.entryPath).toBe(fixture.entryPath);
    writeFileSync(join(projectRoot(), fixture.entryPath), existingBracket);
    // A new chat in the project, under Auto: the state the case is about.
    await parkPointer(page);
    await page.locator('[data-slot="project-trigger"]').first().hover();
    await page
      .getByRole('button', { name: /^New chat in /u })
      .first()
      .click();
    await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 60_000 }).not.toBe(seedChat);
    await ensureAuto(page);
    agent = await chooseAgent(page);
  } else {
    if (routingCase.preference === 'auto') {
      await ensureAuto(page);
    } else {
      const picked = await kernelName(routingCase.preference);
      await selectKernel(page, picked);
      await expect.poll(async () => kernelPill(page).getAttribute('aria-label')).toBe(`Kernel: ${picked}`);
    }
    await connectPickedFolder(session);
    agent = await chooseAgent(page);
  }

  const pillBefore = (await kernelPill(page).getAttribute('aria-label')) ?? undefined;
  if (routingCase.fixture.kind === 'existing') {
    await sendPrompt(page, routingCase.prompt);
    await expect.poll(() => currentRun(eventsOf(activeChatId(page)))?.runId, { timeout: 120_000 }).toBeTruthy();
  } else {
    await submitPrompt(page, routingCase.prompt);
    await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
  }
  const chatId = activeChatId(page);
  // A run started before this case's prompt (the existing project's seed) is not this case's.
  const settledStates = new Set(['completed', 'failed', 'cancelled']);
  const caseRun = (): ReturnType<typeof currentRun> => currentRun(eventsOf(chatId));
  const decided = (): boolean => {
    const run = caseRun();
    if (run === undefined) {
      return false;
    }
    return (
      settledStates.has(run.lifecycle ?? '') ||
      runToolCalls(eventsOf(chatId), run.runId).some(
        (call) =>
          (call.title === 'evaluate_model' && call.output !== undefined) ||
          // An agent that asks waits for an answer: the case is decided with no model.
          call.title === 'ask_user_question',
      )
    );
  };
  /* A closed page or a quit app answers nothing: the poll below would retry its throwing probe for its whole budget. */
  let closed: string | undefined;
  const pageClosed = (): void => {
    closed ??= 'the page closed';
  };
  const appClosed = (): void => {
    closed ??= 'the app quit';
  };
  page.once('close', pageClosed);
  session.application.once('close', appClosed);
  try {
    await expect
      .poll(
        async () => {
          if (page.isClosed()) {
            pageClosed();
          }
          if (closed !== undefined) {
            return true;
          }
          const approve = page.getByRole('button', { name: /^(?:Yes|Yes, allow once|Allow once)$/iu });
          if (await approve.isVisible()) {
            await approve.click();
          }
          return decided();
        },
        { timeout: 1_200_000, interval: 5000 },
      )
      .toBe(true);
  } finally {
    page.off('close', pageClosed);
    session.application.off('close', appClosed);
  }
  if (closed !== undefined) {
    throw new Error(
      `Routing case ${routingCase.id} stopped: ${closed} while its run was ${caseRun()?.lifecycle ?? 'not started'}.`,
    );
  }
  const run = caseRun()!;
  if (!settledStates.has(run.lifecycle ?? '')) {
    // The entry's kernel is decided: stop spending the turn.
    await cancelRun(page, () => settledStates.has(caseRun()?.lifecycle ?? ''));
  }

  const events = eventsOf(chatId);
  const calls = runToolCalls(events, run.runId);
  const asked = calls.some((call) => call.title === 'ask_user_question');
  const { entryPath, kernel, files, pass, reason } = judge({
    routingCase,
    root: realpathSync(projectRoot()),
    calls,
    kernels,
  });
  const lifecycle = caseRun()?.lifecycle;
  const verdict: RoutingVerdict = {
    case: routingCase.id,
    kind: routingCase.kind,
    family: routingCase.family,
    agent,
    entryPath,
    kernel,
    files,
    acceptable: routingCase.acceptable,
    pass,
    reason:
      entryPath === undefined && routingCase.kind !== 'existing'
        ? `${reason}${asked ? ': asked a question' : ''} (run ${lifecycle ?? 'unknown'})`
        : reason,
    pillBefore,
    pillAfter:
      (await kernelPill(page)
        .getAttribute('aria-label')
        .catch(() => undefined)) ?? undefined,
    lifecycle,
    tools: calls.map(({ title, kind }) => (kind === undefined ? title : `${title} [${kind}]`)),
  };
  const directory = await session.capture(`aks-${routingCase.id}`);
  writeFileSync(join(directory, 'kernel-routing.json'), JSON.stringify(verdict, null, 2));
  copyFileSync(join(projectRoot(), '.tau/chats', chatId, 'events.jsonl'), join(directory, 'events.jsonl'));
  console.log(`[kernel-routing-smoke] metric ${JSON.stringify(verdict)}`);
  return verdict;
};
