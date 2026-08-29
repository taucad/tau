/* oxlint-disable max-params, no-await-in-loop, no-restricted-imports, tau-lint/no-bare-time-identifier, typescript/no-restricted-types -- Vitest command callbacks add their context parameter to the explicit external-target contract, and config-time modules cannot use test aliases. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserCommand, BrowserCommandContext } from 'vitest/node';
import type {
  TargetClickOptions,
  TargetCookie,
  TargetDiagnostics,
  TargetMouseOptions,
  TargetReadOptions,
  TargetState,
  TargetSurface,
  TargetViewport,
} from './external-target.ts';
import { testBaseURL } from './base-url.ts';

type ProviderContext = BrowserCommandContext['context'];
type TargetPage = Awaited<ReturnType<ProviderContext['newPage']>>;

type Session = {
  readonly consoleMessages: Array<{ readonly text: string; readonly type: string }>;
  readonly context: ProviderContext;
  readonly pageErrors: string[];
  readonly primary: TargetPage;
  secondary?: TargetPage;
  tracing: boolean;
};

const sessions = new Map<string, Session>();
const outputRoot = resolve('out/test-results/vitest-browser/apps/ui-e2e/test-output');

const sessionFor = (commandContext: BrowserCommandContext): Session => {
  const session = sessions.get(commandContext.sessionId);
  if (!session) {
    throw new Error('UI E2E target session is not open.');
  }
  return session;
};

const pageFor = (session: Session, surface: TargetSurface = 'primary'): TargetPage => {
  if (surface === 'primary') {
    return session.primary;
  }
  if (!session.secondary) {
    throw new Error('UI E2E secondary target page is not open.');
  }
  return session.secondary;
};

const observePage = (session: Session, page: TargetPage): void => {
  page.on('console', (message) => session.consoleMessages.push({ text: message.text(), type: message.type() }));
  page.on('pageerror', (error) => session.pageErrors.push(error.message));
};

const disposeSession = async (session: Session): Promise<void> => {
  const errors: unknown[] = [];
  if (session.tracing) {
    try {
      await session.context.tracing.stop();
    } catch (error) {
      errors.push(error);
    }
    session.tracing = false;
  }
  try {
    await session.context.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'UI E2E target cleanup failed.');
  }
};

export const uiOpenTarget: BrowserCommand = async (commandContext) => {
  if (commandContext.provider.name !== 'playwright') {
    throw new TypeError(`UI E2E requires the Playwright provider, received '${commandContext.provider.name}'.`);
  }
  const existing = sessions.get(commandContext.sessionId);
  if (existing) {
    await disposeSession(existing);
    sessions.delete(commandContext.sessionId);
  }
  const browser = commandContext.context.browser();
  if (!browser) {
    throw new Error('Vitest Playwright browser is unavailable.');
  }
  const context = await browser.newContext();
  context.setDefaultTimeout(10_000);
  const primary = await context.newPage();
  const session: Session = {
    consoleMessages: [],
    context,
    pageErrors: [],
    primary,
    tracing: false,
  };
  observePage(session, primary);
  await context.tracing.start({ screenshots: true, snapshots: true });
  session.tracing = true;
  sessions.set(commandContext.sessionId, session);
};

export const uiCloseTarget: BrowserCommand = async (commandContext) => {
  const session = sessions.get(commandContext.sessionId);
  if (!session) {
    return;
  }
  sessions.delete(commandContext.sessionId);
  await disposeSession(session);
};

export const uiCaptureTargetDiagnostics: BrowserCommand<[], TargetDiagnostics> = async (commandContext) => {
  const session = sessionFor(commandContext);
  const directory = resolve(outputRoot, commandContext.sessionId);
  await mkdir(directory, { recursive: true });
  let screenshot: string | undefined;
  try {
    const screenshotBytes = await session.primary.screenshot({ fullPage: true });
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
    consoleMessages: session.consoleMessages,
    pageErrors: session.pageErrors,
    screenshot,
    tracePath,
    url: session.primary.url(),
  };
};

export const uiNavigateTarget: BrowserCommand<
  [path: string, surface?: TargetSurface],
  Readonly<Record<string, string>>
> = async (commandContext, path, surface) => {
  const response = await pageFor(sessionFor(commandContext), surface).goto(new URL(path, testBaseURL).href);
  if (!response) {
    throw new Error('UI E2E navigation did not return a document response.');
  }
  return response.headers();
};

export const uiReloadTarget: BrowserCommand<[surface?: TargetSurface]> = async (commandContext, surface) => {
  await pageFor(sessionFor(commandContext), surface).reload();
};

export const uiSetViewport: BrowserCommand<[viewport: TargetViewport, surface?: TargetSurface]> = async (
  commandContext,
  viewport,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).setViewportSize(viewport);
};

export const uiEmulateColorScheme: BrowserCommand<
  [colorScheme: 'dark' | 'light' | 'no-preference', surface?: TargetSurface]
> = async (commandContext, colorScheme, surface) => {
  await pageFor(sessionFor(commandContext), surface).emulateMedia({ colorScheme });
};

export const uiEmulateContrast: BrowserCommand<[contrast: 'more' | 'no-preference', surface?: TargetSurface]> = async (
  commandContext,
  contrast,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).emulateMedia({ contrast });
};

export const uiEmulateForcedColors: BrowserCommand<[forcedColors: 'active' | 'none', surface?: TargetSurface]> = async (
  commandContext,
  forcedColors,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).emulateMedia({ forcedColors });
};

export const uiClickTarget: BrowserCommand<
  [selector: string, options?: TargetClickOptions, surface?: TargetSurface]
> = async (commandContext, selector, options, surface) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).click(options);
};

export const uiFillTarget: BrowserCommand<[selector: string, value: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  value,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).fill(value);
};

export const uiPressTarget: BrowserCommand<[selector: string, key: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  key,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).press(key);
};

export const uiHoverTarget: BrowserCommand<[selector: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).hover();
};

export const uiFocusTarget: BrowserCommand<[selector: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).focus();
};

export const uiScrollTarget: BrowserCommand<[selector: string, surface?: TargetSurface]> = async (
  commandContext,
  selector,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).locator(selector).scrollIntoViewIfNeeded();
};

export const uiDragTarget: BrowserCommand<[source: string, target: string, surface?: TargetSurface]> = async (
  commandContext,
  source,
  target,
  surface,
) => {
  const page = pageFor(sessionFor(commandContext), surface);
  await page.locator(source).dragTo(page.locator(target));
};

export const uiReadTarget: BrowserCommand<
  [selector: string, options?: TargetReadOptions, surface?: TargetSurface],
  TargetState
> = async (commandContext, selector, options, surface) => {
  const page = pageFor(sessionFor(commandContext), surface);
  const locator = page.locator(selector);
  const count = await locator.count();
  if (count === 0) {
    return { attributes: {}, className: '', count, focused: false, text: null, visible: false };
  }
  const first = locator.first();
  const attributes = Object.fromEntries(
    await Promise.all((options?.attributes ?? []).map(async (name) => [name, await first.getAttribute(name)] as const)),
  );
  let value: string | undefined;
  try {
    value = await first.inputValue();
  } catch {
    // Non-input elements have no value.
  }
  return {
    attributes,
    boundingBox: (await first.boundingBox()) ?? undefined,
    className: (await first.getAttribute('class')) ?? '',
    count,
    focused: await first.evaluate((element) => element === document.activeElement),
    text: await first.textContent(),
    value,
    visible: await first.isVisible(),
  };
};

export const uiEvaluateTarget: BrowserCommand<
  [source: string, argument?: unknown, surface?: TargetSurface],
  unknown
> = async (commandContext, source, argument, surface) =>
  pageFor(sessionFor(commandContext), surface).evaluate(
    ({ argument: value, source: functionSource }) =>
      (globalThis.eval(`(${functionSource})`) as (input: unknown) => unknown)(value),
    { argument, source },
  );

export const uiEvaluateTargetLocator: BrowserCommand<
  [selector: string, source: string, argument?: unknown, surface?: TargetSurface],
  unknown
> = async (commandContext, selector, source, argument, surface) =>
  pageFor(sessionFor(commandContext), surface)
    .locator(selector)
    .evaluate(
      (element, payload) =>
        (globalThis.eval(`(${payload.source})`) as (target: Element, input: unknown) => unknown)(
          element,
          payload.argument,
        ),
      { argument, source },
    );

export const uiAddInitScript: BrowserCommand<[source: string, argument?: unknown]> = async (
  commandContext,
  source,
  argument,
) => {
  await sessionFor(commandContext).primary.addInitScript({
    content: `(${source})(${JSON.stringify(argument)})`,
  });
};

export const uiWaitForTarget: BrowserCommand<
  [source: string, argument?: unknown, timeout?: number, surface?: TargetSurface]
> = async (commandContext, source, argument, timeout, surface) => {
  await pageFor(sessionFor(commandContext), surface).waitForFunction(
    ({ argument: value, source: functionSource }) =>
      (globalThis.eval(`(${functionSource})`) as (input: unknown) => unknown)(value),
    { argument, source },
    { timeout },
  );
};

export const uiKeyboardPress: BrowserCommand<[key: string, surface?: TargetSurface]> = async (
  commandContext,
  key,
  surface,
) => {
  await pageFor(sessionFor(commandContext), surface).keyboard.press(key);
};

export const uiMouseMove: BrowserCommand<
  [x: number, y: number, options?: TargetMouseOptions, surface?: TargetSurface]
> = async (commandContext, x, y, options, surface) => {
  await pageFor(sessionFor(commandContext), surface).mouse.move(x, y, options);
};

export const uiMouseDown: BrowserCommand<
  [options?: { readonly button?: 'left' | 'middle' | 'right' }, surface?: TargetSurface]
> = async (commandContext, options, surface) => {
  await pageFor(sessionFor(commandContext), surface).mouse.down(options);
};

export const uiMouseUp: BrowserCommand<
  [options?: { readonly button?: 'left' | 'middle' | 'right' }, surface?: TargetSurface]
> = async (commandContext, options, surface) => {
  await pageFor(sessionFor(commandContext), surface).mouse.up(options);
};

export const uiMouseClick: BrowserCommand<
  [x: number, y: number, options?: TargetClickOptions, surface?: TargetSurface]
> = async (commandContext, x, y, options, surface) => {
  await pageFor(sessionFor(commandContext), surface).mouse.click(x, y, options);
};

export const uiScreenshotTarget: BrowserCommand<
  [selector?: string, artifactName?: string, surface?: TargetSurface],
  string
> = async (commandContext, selector, artifactName, surface) => {
  const page = pageFor(sessionFor(commandContext), surface);
  const bytes = selector
    ? await page.locator(selector).screenshot({ animations: 'disabled' })
    : await page.screenshot({ animations: 'disabled', fullPage: true });
  if (artifactName) {
    const safeName = artifactName.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-');
    const path = resolve(outputRoot, commandContext.sessionId, safeName);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes);
  }
  return bytes.toString('base64');
};

export const uiSampleCameraDuringClick: BrowserCommand<[selector: string, frameCount: number], unknown[]> = async (
  commandContext,
  selector,
  frameCount,
) => {
  const page = sessionFor(commandContext).primary;
  const samples = page.evaluate(async (count) => {
    const bridge = (
      globalThis as unknown as {
        __TAU_SECTION_VIEW_TEST__?: { getCamera(): unknown };
      }
    ).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Graphics e2e bridge is not installed.');
    }
    const frames: unknown[] = [];
    for (let index = 0; index < count; index += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      frames.push(bridge.getCamera());
    }
    return frames;
  }, frameCount);
  const box = await page.locator(selector).boundingBox();
  if (!box) {
    throw new Error('Viewport gizmo bounding box is unavailable.');
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return samples;
};

export const uiOpenSecondaryTarget: BrowserCommand<[path: string]> = async (commandContext, path) => {
  const session = sessionFor(commandContext);
  if (session.secondary) {
    await session.secondary.close();
  }
  session.secondary = await session.context.newPage();
  observePage(session, session.secondary);
  await session.secondary.goto(new URL(path, testBaseURL).href);
};

export const uiCloseSecondaryTarget: BrowserCommand = async (commandContext) => {
  const session = sessionFor(commandContext);
  await session.secondary?.close();
  session.secondary = undefined;
};

export const uiCookies: BrowserCommand<[], TargetCookie[]> = async (commandContext) =>
  sessionFor(commandContext).context.cookies();

export const uiAddCookies: BrowserCommand<[cookies: readonly TargetCookie[]]> = async (commandContext, cookies) => {
  await sessionFor(commandContext).context.addCookies([...cookies]);
};

export const uiChooseTargetFile: BrowserCommand<
  [triggerSelector: string, file: { readonly base64: string; readonly mimeType: string; readonly name: string }]
> = async (commandContext, triggerSelector, file) => {
  const page = sessionFor(commandContext).primary;
  const chooser = page.waitForEvent('filechooser');
  await page.locator(triggerSelector).click();
  const fileChooser = await chooser;
  await fileChooser.setFiles({ buffer: Buffer.from(file.base64, 'base64'), mimeType: file.mimeType, name: file.name });
};

export const uiReadTargetEvents: BrowserCommand<
  [],
  {
    readonly consoleMessages: ReadonlyArray<{ readonly text: string; readonly type: string }>;
    readonly pageErrors: readonly string[];
  }
> = (commandContext) => {
  const session = sessionFor(commandContext);
  return { consoleMessages: session.consoleMessages, pageErrors: session.pageErrors };
};

export const uiBrowserCommands = {
  uiAddCookies,
  uiAddInitScript,
  uiCaptureTargetDiagnostics,
  uiChooseTargetFile,
  uiClickTarget,
  uiCloseSecondaryTarget,
  uiCloseTarget,
  uiCookies,
  uiDragTarget,
  uiEmulateColorScheme,
  uiEmulateContrast,
  uiEmulateForcedColors,
  uiEvaluateTarget,
  uiEvaluateTargetLocator,
  uiFillTarget,
  uiFocusTarget,
  uiHoverTarget,
  uiKeyboardPress,
  uiMouseClick,
  uiMouseDown,
  uiMouseMove,
  uiMouseUp,
  uiNavigateTarget,
  uiOpenSecondaryTarget,
  uiOpenTarget,
  uiPressTarget,
  uiReadTarget,
  uiReadTargetEvents,
  uiReloadTarget,
  uiScreenshotTarget,
  uiSampleCameraDuringClick,
  uiScrollTarget,
  uiSetViewport,
  uiWaitForTarget,
};
