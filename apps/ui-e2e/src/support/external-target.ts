/* oxlint-disable max-params, tau-lint/no-bare-time-identifier, typescript/consistent-type-definitions, typescript/no-restricted-types, typescript/promise-function-async, unicorn/no-await-expression-member, unicorn/prefer-ternary -- This thin pass-through adapter mirrors stable Vitest selector and external browser evidence fields without inventing replacement shapes or redundant async frames. */
import { expect, inject } from 'vitest';
import type { Locator } from 'vitest/browser';
import { locators, server } from 'vitest/browser';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';

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
export type TargetDownload = { readonly base64: string; readonly suggestedFilename: string };
/** What {@link startPaseoFakeDaemon} is scripted with. @public */
export type FakePaseoDaemonScript = {
  readonly agents?: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly provider: string;
    readonly model: string;
  }>;
  readonly turn?: { readonly items: readonly unknown[] };
};

/** Where the page dials the fake daemon, and the identity it pins. @public */
export type FakePaseoDaemonHandle = {
  readonly endpoint: string;
  readonly serverId: string;
  readonly daemonPublicKeyB64: string;
};

export type TargetPaseoConnection = {
  readonly id: string;
  readonly label: string;
  readonly serverId: string;
  readonly relayEndpoint: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};
export type TargetPaseoAgent = {
  readonly id: string;
  readonly label: string;
  readonly provider: string;
  readonly status: string;
};
export type TargetPaseoProvider = {
  readonly provider: string;
  readonly label: string;
  readonly status: string;
  readonly enabled: boolean;
  readonly modelCount: number;
};
export type TargetPaseoRestFixture = {
  readonly pairedConnection: TargetPaseoConnection;
  /**
   * The pairing material `POST /:id/offer` releases.
   *
   * The page opens the real E2EE session against whatever this names, so
   * the fake daemon supplies it — nothing about the SDK path is stubbed.
   */
  readonly offer: {
    readonly serverId: string;
    readonly daemonPublicKeyB64: string;
    readonly relayEndpoint: string;
  };
};
export type TargetTauTestAccount = {
  readonly email: string;
  readonly name: string;
  readonly password: string;
};
export type TargetWebGpuProfile = 'disabled' | 'hardware' | 'software';
/** The AV-4 daemon fixture: an origin to navigate to, and a directory to read. */
export type TargetTauServeFixture = { readonly origin: string; readonly workspace: string };
export type TargetWebGpuQualificationReport = Readonly<{
  profile: TargetWebGpuProfile;
  secureContext: boolean;
  targetUrl: string;
  browserVersion: string;
  hostPlatform: string;
  userAgent: string;
  hasNavigatorGpu: boolean;
  adapterAvailable: boolean;
  adapter?: Readonly<{
    vendor: string;
    architecture: string;
    device: string;
    description: string;
    fallback: boolean | undefined;
  }>;
  adapterClass: 'ambiguous' | 'hardware' | 'software' | undefined;
  deviceAvailable: boolean;
  validShaderErrors: number;
  invalidShaderErrors: number;
  expectedValidationError: string | undefined;
  computeReadback: number | undefined;
  expectedDeviceLossReason: string | undefined;
  uncapturedErrors: readonly string[];
  qualificationErrors: readonly string[];
  browserGpuDiagnostics: string | undefined;
  launchFingerprint: string;
}>;

declare module 'vitest' {
  export interface ProvidedContext {
    webGpuProfile: TargetWebGpuProfile;
  }
}

declare module 'vitest/browser' {
  interface LocatorSelectors {
    getByCss(selector: string): Locator;
  }

  interface BrowserCommands {
    uiAuthenticateTauTestUser(account: TargetTauTestAccount): Promise<void>;
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
    uiDownloadTarget(triggerSelector: string): Promise<TargetDownload>;
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
    uiGrantPermissions(permissions: readonly string[]): Promise<void>;
    uiHoverTarget(selector: string, surface?: TargetSurface): Promise<void>;
    uiInstallPaseoRestFixture(fixture: TargetPaseoRestFixture): Promise<void>;
    uiStartPaseoFakeDaemon(options: FakePaseoDaemonScript): Promise<FakePaseoDaemonHandle>;
    uiStopPaseoFakeDaemon(): Promise<readonly string[]>;
    uiInstallAgentHostGatewayFixture(script?: readonly GatewayScriptTurn[]): Promise<void>;
    uiKeyboardPress(key: string, surface?: TargetSurface): Promise<void>;
    uiMouseClick(x: number, y: number, options?: TargetClickOptions, surface?: TargetSurface): Promise<void>;
    uiMouseDown(options?: { readonly button?: 'left' | 'middle' | 'right' }, surface?: TargetSurface): Promise<void>;
    uiMouseMove(x: number, y: number, options?: TargetMouseOptions, surface?: TargetSurface): Promise<void>;
    uiMouseUp(options?: { readonly button?: 'left' | 'middle' | 'right' }, surface?: TargetSurface): Promise<void>;
    uiNavigateTarget(path: string, surface?: TargetSurface): Promise<Readonly<Record<string, string>>>;
    uiOpenSecondaryTarget(path: string): Promise<void>;
    uiOpenTarget(): Promise<void>;
    uiPressTarget(selector: string, key: string, surface?: TargetSurface): Promise<void>;
    uiQualifyWebGpu(profile: TargetWebGpuProfile): Promise<TargetWebGpuQualificationReport>;
    uiReadTarget(selector: string, options?: TargetReadOptions, surface?: TargetSurface): Promise<TargetState>;
    uiReadAgentHostApiRequests(): Promise<string[]>;
    uiReadAgentHostGatewayRequests(): Promise<unknown[]>;
    uiReleaseAgentHostGatewayFixture(): Promise<void>;
    uiSetAgentHostGatewayFailure(failure?: { readonly status: number; readonly message: string }): Promise<void>;
    uiReadTargetEvents(): Promise<{
      readonly consoleMessages: ReadonlyArray<{ readonly text: string; readonly type: string }>;
      readonly pageErrors: readonly string[];
    }>;
    uiReloadTarget(surface?: TargetSurface): Promise<void>;
    uiScreenshotTarget(selector?: string, artifactName?: string, surface?: TargetSurface): Promise<string>;
    uiSampleCameraDuringClick(selector: string, frameCount: number): Promise<unknown[]>;
    uiScrollTarget(selector: string, surface?: TargetSurface): Promise<void>;
    uiSetViewport(viewport: TargetViewport, surface?: TargetSurface): Promise<void>;
    uiStartHostFixture(): Promise<string>;
    uiStartTauServeFixture(options?: { readonly externalAgents?: boolean }): Promise<TargetTauServeFixture>;
    uiStopTauServeFixture(): Promise<void>;
    uiReleaseTauServeGateway(): Promise<void>;
    uiReadTauServeFile(relativePath: string): Promise<string | undefined>;
    uiListTauServeChats(): Promise<readonly string[]>;
    uiTypeTarget(selector: string, value: string, surface?: TargetSurface): Promise<void>;
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
export const type = (selector: TargetSelector, value: string, surface?: TargetSurface): Promise<void> =>
  server.commands.uiTypeTarget(selectorFor(selector), value, surface);
export const press = (selector: TargetSelector, key: string, surface?: TargetSurface): Promise<void> =>
  server.commands.uiPressTarget(selectorFor(selector), key, surface);
export const hover = (selector: TargetSelector, surface?: TargetSurface): Promise<void> =>
  server.commands.uiHoverTarget(selectorFor(selector), surface);
export const focus = (selector: TargetSelector, surface?: TargetSurface): Promise<void> =>
  server.commands.uiFocusTarget(selectorFor(selector), surface);
export const grantPermissions = (permissions: readonly string[]): Promise<void> =>
  server.commands.uiGrantPermissions(permissions);
export const scrollIntoView = (selector: TargetSelector, surface?: TargetSurface): Promise<void> =>
  server.commands.uiScrollTarget(selectorFor(selector), surface);
export const drag = (source: TargetSelector, destination: TargetSelector, surface?: TargetSurface): Promise<void> =>
  server.commands.uiDragTarget(selectorFor(source), selectorFor(destination), surface);
export const download = (trigger: TargetSelector): Promise<TargetDownload> =>
  server.commands.uiDownloadTarget(selectorFor(trigger));
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
  server.commands.uiMouseMove(x, y, options ?? {}, surface);
export const mouseDown = (
  options?: { readonly button?: 'left' | 'middle' | 'right' },
  surface?: TargetSurface,
): Promise<void> => server.commands.uiMouseDown(options ?? {}, surface);
export const mouseUp = (
  options?: { readonly button?: 'left' | 'middle' | 'right' },
  surface?: TargetSurface,
): Promise<void> => server.commands.uiMouseUp(options ?? {}, surface);
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
export const authenticateTauTestUser = (account: TargetTauTestAccount): Promise<void> =>
  server.commands.uiAuthenticateTauTestUser(account);
export const chooseFile = (
  trigger: TargetSelector,
  file: { readonly base64: string; readonly mimeType: string; readonly name: string },
): Promise<void> => server.commands.uiChooseTargetFile(selectorFor(trigger), file);
export const events = (): Promise<Pick<TargetDiagnostics, 'consoleMessages' | 'pageErrors'>> =>
  server.commands.uiReadTargetEvents();
export const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
export const writeArtifact = (name: string, content: string): Promise<void> =>
  server.commands.writeFile(`../../out/test-results/vitest-browser/apps/ui-e2e/test-output/${name}`, content);
export const currentUrl = (): Promise<string> => evaluate(() => location.href);
export const currentWebGpuProfile = (): TargetWebGpuProfile => inject('webGpuProfile');
export const qualifyWebGpu = (profile = currentWebGpuProfile()): Promise<TargetWebGpuQualificationReport> =>
  server.commands.uiQualifyWebGpu(profile);
export const expectGraphicsBackend = async (backend: 'webgl' | 'webgpu'): Promise<void> => {
  await expect
    .poll(() =>
      evaluate(() =>
        (
          globalThis as typeof globalThis & {
            __TAU_SECTION_VIEW_TEST__?: { getGraphicsBackend(): 'webgl' | 'webgpu' };
          }
        ).__TAU_SECTION_VIEW_TEST__?.getGraphicsBackend(),
      ),
    )
    .toBe(backend);
};
export const expectGeometryFramed = async (): Promise<void> => {
  try {
    await expect
      .poll(
        () =>
          evaluate(() => {
            const bridges = (
              globalThis as typeof globalThis & {
                __TAU_SECTION_VIEW_TEST_BRIDGES__?: ReadonlyArray<{ isGeometryFramed(): boolean }>;
              }
            ).__TAU_SECTION_VIEW_TEST_BRIDGES__;
            return Boolean(bridges && bridges.length > 0 && bridges.every((bridge) => bridge.isGeometryFramed()));
          }),
        { timeout: 60_000 },
      )
      .toBe(true);
  } catch (error) {
    const [diagnostics, targetEvents] = await Promise.all([
      evaluate(() => {
        const bridges = (
          globalThis as typeof globalThis & {
            __TAU_SECTION_VIEW_TEST_BRIDGES__?: ReadonlyArray<{
              getCamera(): { actorError?: string; actorStatus: string };
              getGraphicsBackend(): 'webgl' | 'webgpu';
              isGeometryFramed(): boolean;
            }>;
          }
        ).__TAU_SECTION_VIEW_TEST_BRIDGES__;
        return bridges?.map((bridge) => ({
          actorError: bridge.getCamera().actorError,
          actorStatus: bridge.getCamera().actorStatus,
          backend: bridge.getGraphicsBackend(),
          isGeometryFramed: bridge.isGeometryFramed(),
        }));
      }),
      events(),
    ]);
    throw new Error(`Geometry did not reach a framed camera state: ${JSON.stringify({ diagnostics, targetEvents })}`, {
      cause: error,
    });
  }
};
export const startHostFixture = (): Promise<string> => server.commands.uiStartHostFixture();

/** AV-4 (rung 1): a real `tau serve` daemon serving the real serve-mode SPA. */
export const startTauServeFixture = (
  options: { readonly externalAgents?: boolean } = {},
): Promise<TargetTauServeFixture> => server.commands.uiStartTauServeFixture(options);
export const stopTauServeFixture = (): Promise<void> => server.commands.uiStopTauServeFixture();
export const releaseTauServeGateway = (): Promise<void> => server.commands.uiReleaseTauServeGateway();
export const readTauServeFile = (relativePath: string): Promise<string | undefined> =>
  server.commands.uiReadTauServeFile(relativePath);
export const listTauServeChats = (): Promise<readonly string[]> => server.commands.uiListTauServeChats();
export const installPaseoRestFixture = (fixture: TargetPaseoRestFixture): Promise<void> =>
  server.commands.uiInstallPaseoRestFixture(fixture);

/** Start the fake Paseo daemon the page opens its real E2EE session against. */
export const startPaseoFakeDaemon = (options: FakePaseoDaemonScript): Promise<FakePaseoDaemonHandle> =>
  server.commands.uiStartPaseoFakeDaemon(options);

/** Stop it, and report every session message it received. */
export const stopPaseoFakeDaemon = (): Promise<readonly string[]> => server.commands.uiStopPaseoFakeDaemon();
/** Installs the Anthropic-wire gateway fixture; omit `script` for the default browser-host script. */
export const installAgentHostGatewayFixture = (script?: readonly GatewayScriptTurn[]): Promise<void> =>
  server.commands.uiInstallAgentHostGatewayFixture(script);
export const readAgentHostGatewayRequests = (): Promise<unknown[]> => server.commands.uiReadAgentHostGatewayRequests();
export const releaseAgentHostGatewayFixture = (): Promise<void> => server.commands.uiReleaseAgentHostGatewayFixture();
/** Every `/v1/chat/...` path the page asked the (absent) API for since the fixture was installed. */
export const readAgentHostApiRequests = (): Promise<string[]> => server.commands.uiReadAgentHostApiRequests();
/** Arms (or disarms, with no argument) a coded provider refusal on the gateway fixture. */
export const setAgentHostGatewayFailure = (failure?: {
  readonly status: number;
  readonly message: string;
}): Promise<void> => server.commands.uiSetAgentHostGatewayFailure(failure);

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
