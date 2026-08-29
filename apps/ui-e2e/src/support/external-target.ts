/* oxlint-disable max-params, tau-lint/no-bare-time-identifier, typescript/consistent-type-definitions, typescript/no-restricted-types, typescript/promise-function-async, unicorn/no-await-expression-member, unicorn/prefer-ternary -- This thin pass-through adapter mirrors stable Vitest selector and external browser evidence fields without inventing replacement shapes or redundant async frames. */
import { expect } from 'vitest';
import type { Locator } from 'vitest/browser';
import { locators, server } from 'vitest/browser';

export type TargetSurface = 'primary' | 'secondary';
export type TargetSelector = Locator | string;
export type TargetViewport = { readonly height: number; readonly width: number };
export type TargetClickOptions = {
  readonly button?: 'left' | 'middle' | 'right';
  readonly force?: boolean;
  readonly position?: { readonly x: number; readonly y: number };
  readonly timeout?: number;
};
export type TargetMouseOptions = { readonly steps?: number };
export type TargetCookie = {
  readonly domain?: string;
  readonly expires?: number;
  readonly httpOnly?: boolean;
  readonly name: string;
  readonly path?: string;
  readonly sameSite?: 'Lax' | 'None' | 'Strict';
  readonly secure?: boolean;
  readonly url?: string;
  readonly value: string;
};
export type TargetReadOptions = { readonly attributes?: readonly string[] };
export type TargetState = {
  readonly attributes: Readonly<Record<string, string | null>>;
  readonly boundingBox?: { readonly height: number; readonly width: number; readonly x: number; readonly y: number };
  readonly className: string;
  readonly count: number;
  readonly focused: boolean;
  readonly text: string | null;
  readonly value?: string;
  readonly visible: boolean;
};
export type TargetDiagnostics = {
  readonly consoleMessages: ReadonlyArray<{ readonly text: string; readonly type: string }>;
  readonly pageErrors: readonly string[];
  readonly screenshot?: string;
  readonly tracePath?: string;
  readonly url: string;
};

declare module 'vitest/browser' {
  interface LocatorSelectors {
    getByCss(selector: string): Locator;
  }

  interface BrowserCommands {
    uiAddCookies(cookies: readonly TargetCookie[]): Promise<void>;
    uiAddInitScript(source: string, argument?: unknown): Promise<void>;
    uiCaptureTargetDiagnostics(): Promise<TargetDiagnostics>;
    uiChooseTargetFile(
      triggerSelector: string,
      file: { readonly base64: string; readonly mimeType: string; readonly name: string },
    ): Promise<void>;
    uiClickTarget(selector: string, options?: TargetClickOptions, surface?: TargetSurface): Promise<void>;
    uiCloseSecondaryTarget(): Promise<void>;
    uiCloseTarget(): Promise<void>;
    uiCookies(): Promise<TargetCookie[]>;
    uiDragTarget(source: string, target: string, surface?: TargetSurface): Promise<void>;
    uiEmulateColorScheme(colorScheme: 'dark' | 'light' | 'no-preference', surface?: TargetSurface): Promise<void>;
    uiEmulateContrast(contrast: 'more' | 'no-preference', surface?: TargetSurface): Promise<void>;
    uiEmulateForcedColors(forcedColors: 'active' | 'none', surface?: TargetSurface): Promise<void>;
    uiEvaluateTarget(source: string, argument?: unknown, surface?: TargetSurface): Promise<unknown>;
    uiEvaluateTargetLocator(
      selector: string,
      source: string,
      argument?: unknown,
      surface?: TargetSurface,
    ): Promise<unknown>;
    uiFillTarget(selector: string, value: string, surface?: TargetSurface): Promise<void>;
    uiFocusTarget(selector: string, surface?: TargetSurface): Promise<void>;
    uiHoverTarget(selector: string, surface?: TargetSurface): Promise<void>;
    uiKeyboardPress(key: string, surface?: TargetSurface): Promise<void>;
    uiMouseClick(x: number, y: number, options?: TargetClickOptions, surface?: TargetSurface): Promise<void>;
    uiMouseDown(options?: { readonly button?: 'left' | 'middle' | 'right' }, surface?: TargetSurface): Promise<void>;
    uiMouseMove(x: number, y: number, options?: TargetMouseOptions, surface?: TargetSurface): Promise<void>;
    uiMouseUp(options?: { readonly button?: 'left' | 'middle' | 'right' }, surface?: TargetSurface): Promise<void>;
    uiNavigateTarget(path: string, surface?: TargetSurface): Promise<Readonly<Record<string, string>>>;
    uiOpenSecondaryTarget(path: string): Promise<void>;
    uiOpenTarget(): Promise<void>;
    uiPressTarget(selector: string, key: string, surface?: TargetSurface): Promise<void>;
    uiReadTarget(selector: string, options?: TargetReadOptions, surface?: TargetSurface): Promise<TargetState>;
    uiReadTargetEvents(): Promise<{
      readonly consoleMessages: ReadonlyArray<{ readonly text: string; readonly type: string }>;
      readonly pageErrors: readonly string[];
    }>;
    uiReloadTarget(surface?: TargetSurface): Promise<void>;
    uiScreenshotTarget(selector?: string, artifactName?: string, surface?: TargetSurface): Promise<string>;
    uiSampleCameraDuringClick(selector: string, frameCount: number): Promise<unknown[]>;
    uiScrollTarget(selector: string, surface?: TargetSurface): Promise<void>;
    uiSetViewport(viewport: TargetViewport, surface?: TargetSurface): Promise<void>;
    uiWaitForTarget(source: string, argument?: unknown, timeout?: number, surface?: TargetSurface): Promise<void>;
  }
}

locators.extend({
  getByCss(selector: string) {
    return `css=${selector}`;
  },
});

const selectorFor = (selector: TargetSelector): string => (typeof selector === 'string' ? selector : selector.selector);

export const navigate = (path: string, surface?: TargetSurface): Promise<Readonly<Record<string, string>>> =>
  server.commands.uiNavigateTarget(path, surface);
export const reload = (surface?: TargetSurface): Promise<void> => server.commands.uiReloadTarget(surface);
export const setViewport = (viewport: TargetViewport, surface?: TargetSurface): Promise<void> =>
  server.commands.uiSetViewport(viewport, surface);
export const emulateColorScheme = (
  colorScheme: 'dark' | 'light' | 'no-preference',
  surface?: TargetSurface,
): Promise<void> => server.commands.uiEmulateColorScheme(colorScheme, surface);
export const emulateContrast = (contrast: 'more' | 'no-preference', surface?: TargetSurface): Promise<void> =>
  server.commands.uiEmulateContrast(contrast, surface);
export const emulateForcedColors = (forcedColors: 'active' | 'none', surface?: TargetSurface): Promise<void> =>
  server.commands.uiEmulateForcedColors(forcedColors, surface);
export const click = (selector: TargetSelector, options?: TargetClickOptions, surface?: TargetSurface): Promise<void> =>
  server.commands.uiClickTarget(selectorFor(selector), options ?? {}, surface);
export const fill = (selector: TargetSelector, value: string, surface?: TargetSurface): Promise<void> =>
  server.commands.uiFillTarget(selectorFor(selector), value, surface);
export const press = (selector: TargetSelector, key: string, surface?: TargetSurface): Promise<void> =>
  server.commands.uiPressTarget(selectorFor(selector), key, surface);
export const hover = (selector: TargetSelector, surface?: TargetSurface): Promise<void> =>
  server.commands.uiHoverTarget(selectorFor(selector), surface);
export const focus = (selector: TargetSelector, surface?: TargetSurface): Promise<void> =>
  server.commands.uiFocusTarget(selectorFor(selector), surface);
export const scrollIntoView = (selector: TargetSelector, surface?: TargetSurface): Promise<void> =>
  server.commands.uiScrollTarget(selectorFor(selector), surface);
export const drag = (source: TargetSelector, destination: TargetSelector, surface?: TargetSurface): Promise<void> =>
  server.commands.uiDragTarget(selectorFor(source), selectorFor(destination), surface);
export const read = (
  selector: TargetSelector,
  options?: TargetReadOptions,
  surface?: TargetSurface,
): Promise<TargetState> => server.commands.uiReadTarget(selectorFor(selector), options ?? {}, surface);
export const textContent = async (selector: TargetSelector, surface?: TargetSurface): Promise<string | null> =>
  (await read(selector, undefined, surface)).text;
export const getAttribute = async (
  selector: TargetSelector,
  name: string,
  surface?: TargetSurface,
): Promise<string | null> => (await read(selector, { attributes: [name] }, surface)).attributes[name] ?? null;
export const boundingBox = async (
  selector: TargetSelector,
  surface?: TargetSurface,
): Promise<TargetState['boundingBox']> => (await read(selector, undefined, surface)).boundingBox;
export const isVisible = async (selector: TargetSelector, surface?: TargetSurface): Promise<boolean> =>
  (await read(selector, undefined, surface)).visible;
export const evaluate = async <Result, Argument = undefined>(
  callback: (argument: Argument) => Result | Promise<Result>,
  argument?: Argument,
  surface?: TargetSurface,
): Promise<Result> =>
  server.commands.uiEvaluateTarget(
    callback.toString(),
    argument ?? (surface ? null : undefined),
    surface,
  ) as Promise<Result>;
export const evaluateLocator = async <Result, Argument = undefined>(
  selector: TargetSelector,
  callback: (element: Element, argument: Argument) => Result | Promise<Result>,
  argument?: Argument,
  surface?: TargetSurface,
): Promise<Result> =>
  server.commands.uiEvaluateTargetLocator(
    selectorFor(selector),
    callback.toString(),
    argument ?? (surface ? null : undefined),
    surface,
  ) as Promise<Result>;
export const addInitScript = <Argument>(
  callback: (argument: Argument) => unknown,
  argument?: Argument,
): Promise<void> => server.commands.uiAddInitScript(callback.toString(), argument);
export const waitFor = <Argument>(
  callback: (argument: Argument) => unknown,
  argument?: Argument,
  options?: { readonly surface?: TargetSurface; readonly timeout?: number },
): Promise<void> => server.commands.uiWaitForTarget(callback.toString(), argument, options?.timeout, options?.surface);
export const keyboardPress = (key: string, surface?: TargetSurface): Promise<void> =>
  server.commands.uiKeyboardPress(key, surface);
export const mouseMove = (x: number, y: number, options?: TargetMouseOptions, surface?: TargetSurface): Promise<void> =>
  server.commands.uiMouseMove(x, y, options, surface);
export const mouseDown = (
  options?: { readonly button?: 'left' | 'middle' | 'right' },
  surface?: TargetSurface,
): Promise<void> => server.commands.uiMouseDown(options, surface);
export const mouseUp = (
  options?: { readonly button?: 'left' | 'middle' | 'right' },
  surface?: TargetSurface,
): Promise<void> => server.commands.uiMouseUp(options, surface);
export const mouseClick = (
  x: number,
  y: number,
  options?: TargetClickOptions,
  surface?: TargetSurface,
): Promise<void> => server.commands.uiMouseClick(x, y, options, surface);
export const screenshot = (
  selector?: TargetSelector,
  artifactName?: string,
  surface?: TargetSurface,
): Promise<string> =>
  server.commands.uiScreenshotTarget(
    selector && selectorFor(selector),
    artifactName ?? (surface ? '' : undefined),
    surface,
  );
export const sampleCameraDuringClick = <Camera>(selector: TargetSelector, frameCount: number): Promise<Camera[]> =>
  server.commands.uiSampleCameraDuringClick(selectorFor(selector), frameCount) as Promise<Camera[]>;
export const openSecondary = (path: string): Promise<void> => server.commands.uiOpenSecondaryTarget(path);
export const closeSecondary = (): Promise<void> => server.commands.uiCloseSecondaryTarget();
export const cookies = (): Promise<TargetCookie[]> => server.commands.uiCookies();
export const addCookies = (values: readonly TargetCookie[]): Promise<void> => server.commands.uiAddCookies(values);
export const chooseFile = (
  trigger: TargetSelector,
  file: { readonly base64: string; readonly mimeType: string; readonly name: string },
): Promise<void> => server.commands.uiChooseTargetFile(selectorFor(trigger), file);
export const events = (): ReturnType<typeof server.commands.uiReadTargetEvents> => server.commands.uiReadTargetEvents();
export const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
export const writeArtifact = (name: string, content: string): Promise<void> =>
  server.commands.writeFile(`../../out/test-results/vitest-browser/apps/ui-e2e/test-output/${name}`, content);
export const currentUrl = (): Promise<string> => evaluate(() => location.href);

export const expectVisible = async (
  selector: TargetSelector,
  timeout = 10_000,
  surface?: TargetSurface,
): Promise<void> => {
  await expect.poll(async () => (await read(selector, undefined, surface)).visible, { timeout }).toBe(true);
};
export const expectHidden = async (
  selector: TargetSelector,
  timeout = 10_000,
  surface?: TargetSurface,
): Promise<void> => {
  await expect.poll(async () => (await read(selector, undefined, surface)).visible, { timeout }).toBe(false);
};
export const expectCount = async (
  selector: TargetSelector,
  count: number,
  timeout = 10_000,
  surface?: TargetSurface,
): Promise<void> => {
  await expect.poll(async () => (await read(selector, undefined, surface)).count, { timeout }).toBe(count);
};
export const expectText = async (
  selector: TargetSelector,
  expected: string | RegExp,
  timeout = 10_000,
): Promise<void> => {
  const assertion = expect.poll(async () => (await read(selector)).text, { timeout });
  if (typeof expected === 'string') {
    await assertion.toBe(expected);
  } else {
    await assertion.toMatch(expected);
  }
};
export const expectContainingText = async (
  selector: TargetSelector,
  expected: string,
  timeout = 10_000,
): Promise<void> => {
  await expect.poll(async () => (await read(selector)).text, { timeout }).toContain(expected);
};
export const expectAttribute = async (
  selector: TargetSelector,
  name: string,
  expected: string | RegExp,
  timeout = 10_000,
): Promise<void> => {
  const assertion = expect.poll(async () => getAttribute(selector, name), { timeout });
  if (typeof expected === 'string') {
    await assertion.toBe(expected);
  } else {
    await assertion.toMatch(expected);
  }
};
export const expectClass = async (selector: TargetSelector, expected: RegExp, timeout = 10_000): Promise<void> => {
  await expect.poll(async () => (await read(selector)).className, { timeout }).toMatch(expected);
};
export const expectFocused = async (selector: TargetSelector, timeout = 10_000): Promise<void> => {
  await expect.poll(async () => (await read(selector)).focused, { timeout }).toBe(true);
};
export const expectValue = async (selector: TargetSelector, expected: string, timeout = 10_000): Promise<void> => {
  await expect.poll(async () => (await read(selector)).value, { timeout }).toBe(expected);
};
export const expectUrl = async (expected: string | RegExp, timeout = 10_000): Promise<void> => {
  const assertion = expect.poll(currentUrl, { timeout });
  if (typeof expected === 'string') {
    await assertion.toBe(expected);
  } else {
    await assertion.toMatch(expected);
  }
};
