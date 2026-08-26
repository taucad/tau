/* oxlint-disable no-await-in-loop -- CDP connection retries and resource teardown are intentionally sequential. */
/* eslint-disable @typescript-eslint/naming-convention -- E2E is the established project acronym. */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, _electron as electron } from 'playwright';
import type { Browser, BrowserContext, ElectronApplication, Page } from 'playwright';
import type { BrowserCommand, BrowserCommandContext } from 'vitest/node';
import { reactE2ELogPath } from './global-setup.ts';
import type { ReactTargetDiagnostics, ReactTargetSession, ReactTargetState } from './support/external-target.js';
import { captureProcessOutput, stopProcess, waitForEndpoint } from './support/process-lifecycle.ts';
import { reactE2EEnvironment, resolveReactE2ETarget } from './support/targets.ts';
import type { ReactE2ETarget } from './support/targets.ts';

type OpenedTarget = {
  readonly context: BrowserContext;
  readonly diagnostics?: () => Promise<string | undefined> | string | undefined;
  readonly dispose: () => Promise<void>;
  readonly page: Page;
  readonly session: ReactTargetSession;
};

type TargetSession = OpenedTarget & {
  readonly cleanups: Array<() => Promise<void>>;
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly target: ReactE2ETarget;
  tracing: boolean;
};

const sessions = new Map<string, TargetSession>();
const outputRoot = resolve(import.meta.dirname, '../../out/test-results/vitest-browser/apps/react-e2e');

const electronSession = async (target: ReactE2ETarget): Promise<OpenedTarget> => {
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      args: [target.root],
      cwd: target.root,
      env: reactE2EEnvironment(target),
    });
    const output: string[] = [];
    captureProcessOutput(application.process(), output);
    const page = await application.firstWindow();
    const windowVisible = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isVisible(),
    );
    return {
      context: page.context(),
      diagnostics: () => output.join(''),
      dispose: async () => application?.close(),
      page,
      session: { windowVisible },
    };
  } catch (error) {
    await application?.close();
    throw error;
  }
};

const connectToCdp = async (endpoint: string): Promise<Browser> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      /* oxlint-disable-next-line typescript/no-deprecated -- Electron exposes its development renderer through CDP. */
      return await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 250);
      });
    }
  }
  throw lastError;
};

const electronDevelopmentSession = async (target: ReactE2ETarget): Promise<OpenedTarget> => {
  if (!target.cdpPort) {
    throw new TypeError(`Electron development target ${target.id} has no CDP port.`);
  }
  const child = spawn(
    resolve(target.root, 'node_modules/.bin/electron-vite'),
    ['--remoteDebuggingPort', String(target.cdpPort)],
    {
      cwd: target.root,
      detached: process.platform !== 'win32',
      env: reactE2EEnvironment(target),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const output: string[] = [];
  captureProcessOutput(child, output);
  let browser: Browser | undefined;
  try {
    const endpoint = `http://127.0.0.1:${target.cdpPort}`;
    await waitForEndpoint({ child, output, url: `${endpoint}/json/version` });
    browser = await connectToCdp(endpoint);
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => !candidate.url().startsWith('devtools://'));
    if (!page) {
      throw new Error(`Electron exposed CDP without a renderer page.\n${output.join('')}`);
    }
    return {
      context: page.context(),
      diagnostics: () => output.join(''),
      dispose: async () => {
        await browser?.close();
        await stopProcess(child);
      },
      page,
      session: {},
    };
  } catch (error) {
    await browser?.close();
    await stopProcess(child);
    throw error;
  }
};

const webSession = async (commandContext: BrowserCommandContext, target: ReactE2ETarget): Promise<OpenedTarget> => {
  const browser = commandContext.context.browser();
  if (!browser) {
    throw new Error('Vitest Playwright browser is unavailable.');
  }
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  context.setDefaultTimeout(120_000);
  return {
    context,
    diagnostics: async () => readFile(reactE2ELogPath(target.id), 'utf8'),
    dispose: async () => context.close(),
    page: await context.newPage(),
    session: {},
  };
};

const openedTarget = async (commandContext: BrowserCommandContext, target: ReactE2ETarget): Promise<OpenedTarget> => {
  if (target.kind === 'electron') {
    return electronSession(target);
  }
  if (target.kind === 'electron-development') {
    return electronDevelopmentSession(target);
  }
  return webSession(commandContext, target);
};

const sessionFor = (commandContext: BrowserCommandContext): TargetSession => {
  const session = sessions.get(commandContext.sessionId);
  if (!session) {
    throw new Error('React E2E target session is not open.');
  }
  return session;
};

const disposeSession = async (session: TargetSession): Promise<void> => {
  const errors: unknown[] = [];
  if (session.tracing) {
    try {
      await session.context.tracing.stop();
    } catch (error) {
      errors.push(error);
    }
    session.tracing = false;
  }
  for (const cleanup of session.cleanups.toReversed()) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await session.dispose();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'React E2E target cleanup failed.');
  }
};

export const reactOpenTarget: BrowserCommand<[targetId: string], ReactTargetSession> = async (
  commandContext,
  targetId,
) => {
  if (commandContext.provider.name !== 'playwright') {
    throw new TypeError(`React E2E requires the Playwright provider, received '${commandContext.provider.name}'.`);
  }
  const existing = sessions.get(commandContext.sessionId);
  if (existing) {
    await disposeSession(existing);
    sessions.delete(commandContext.sessionId);
  }

  const target = resolveReactE2ETarget(targetId);
  const opened = await openedTarget(commandContext, target);
  const session: TargetSession = {
    ...opened,
    cleanups: [],
    consoleErrors: [],
    pageErrors: [],
    target,
    tracing: false,
  };
  opened.page.on('console', (message) => {
    if (message.type() === 'error') {
      session.consoleErrors.push(message.text());
    }
  });
  opened.page.on('pageerror', (error) => session.pageErrors.push(error.message));
  await opened.context.tracing.start({ screenshots: true, snapshots: true });
  session.tracing = true;
  sessions.set(commandContext.sessionId, session);
  return opened.session;
};

export const reactCloseTarget: BrowserCommand = async (commandContext) => {
  const session = sessions.get(commandContext.sessionId);
  if (!session) {
    return;
  }
  sessions.delete(commandContext.sessionId);
  await disposeSession(session);
};

export const reactGetTargetSession: BrowserCommand<never[], ReactTargetSession> = (commandContext) =>
  sessionFor(commandContext).session;

export const reactCaptureTargetDiagnostics: BrowserCommand<never[], ReactTargetDiagnostics> = async (
  commandContext,
) => {
  const session = sessionFor(commandContext);
  const directory = resolve(outputRoot, session.target.id, commandContext.sessionId);
  await mkdir(directory, { recursive: true });
  let screenshot: string | undefined;
  try {
    const screenshotBytes = await session.page.screenshot({ fullPage: true });
    screenshot = screenshotBytes.toString('base64');
  } catch (error) {
    session.pageErrors.push(`Screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  let tracePath: string | undefined;
  if (session.tracing) {
    tracePath = resolve(directory, 'trace.zip');
    await session.context.tracing.stop({ path: tracePath });
    session.tracing = false;
  }
  return {
    consoleErrors: session.consoleErrors,
    pageErrors: session.pageErrors,
    processOutput: await session.diagnostics?.(),
    screenshot,
    tracePath,
    url: session.page.url(),
  };
};

export const reactNavigateTarget: BrowserCommand<[path: string], Readonly<Record<string, string>>> = async (
  commandContext,
  path,
) => {
  const session = sessionFor(commandContext);
  const response = await session.page.goto(new URL(path, session.target.baseURL).href);
  if (!response) {
    throw new Error('React E2E navigation did not return a document response.');
  }
  return response.headers();
};

export const reactClickTarget: BrowserCommand<[selector: string]> = async (commandContext, selector) => {
  await sessionFor(commandContext).page.locator(selector).click();
};

export const reactFillTarget: BrowserCommand<[selector: string, value: string]> = async (
  commandContext,
  selector,
  value,
) => {
  await sessionFor(commandContext).page.locator(selector).fill(value);
};

export const reactReadTarget: BrowserCommand<[selector: string], ReactTargetState> = async (
  commandContext,
  selector,
) => {
  const locator = sessionFor(commandContext).page.locator(selector);
  const count = await locator.count();
  if (count === 0) {
    return { count, text: null, visible: false };
  }
  const first = locator.first();
  let value: string | undefined;
  try {
    value = await first.inputValue();
  } catch {
    // Non-input elements have no value; text remains the observable value.
  }
  return {
    count,
    text: await first.textContent(),
    value,
    visible: await first.isVisible(),
  };
};

export const reactEditExternalElectronWorkspace: BrowserCommand = async (commandContext) => {
  const session = sessionFor(commandContext);
  const { workspaceEntry } = session.target;
  if (!workspaceEntry) {
    throw new TypeError(`Target ${session.target.id} has no externally editable workspace entry.`);
  }
  const original = await readFile(workspaceEntry, 'utf8');
  session.cleanups.push(async () => writeFile(workspaceEntry, original, 'utf8'));
  await writeFile(workspaceEntry, `depth = 7;\n${original}`, 'utf8');
};
