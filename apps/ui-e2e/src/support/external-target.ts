/* oxlint-disable max-params, tau-lint/no-bare-time-identifier, typescript/consistent-type-definitions, typescript/no-restricted-types, typescript/promise-function-async, unicorn/no-await-expression-member, unicorn/prefer-ternary -- This thin pass-through adapter mirrors stable Vitest selector and external browser evidence fields without inventing replacement shapes or redundant async frames. */
import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import { expect, inject } from 'vitest';
import type { Locator } from 'vitest/browser';
import { locators, server as vitestServer } from 'vitest/browser';
import type { ProjectionFixtureProof } from '#support/projection-fixture-validation.js';
import type { GatewayScriptTurn, GatewayTurnCount } from '#support/agent-host-gateway-script.js';

export type TargetSurface = 'primary' | 'secondary';
export type TargetWorkerFlowEvidence = {
  readonly url: string;
  readonly available: boolean;
  readonly streams: ReadonlyArray<{
    readonly id: string;
    readonly chatId: string;
    fa: number;
    fw: number;
    su: number;
    lb: number;
    credits: number;
    sn: number;
    sc: number;
    se: number;
    lastIncomingAt?: number;
    lastOutgoingAt?: number;
    lastCursor?: number;
  }>;
};

export type TargetSelector = Locator | string;
export type TargetViewport = {
  readonly height: number;
  readonly width: number;
};
export type TargetClickOptions = {
  readonly button?: 'left' | 'middle' | 'right';
  /** `2` for a double-click; passed straight to Playwright's `locator.click`. */
  readonly clickCount?: number;
  readonly force?: boolean;
  readonly position?: { readonly x: number; readonly y: number };
  readonly touch?: boolean;
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
/** Where one gateway request is parked, and the turn it asks for. */
export type TargetGatewayGate = {
  readonly kind: 'request' | 'stream';
  readonly turn: string;
};

/** What the agent-host gateway fixture holds and has been asked, right now. */
export type TargetGatewayState = {
  /** Bounded actual SSE writes, for correlating held provider output with channel delivery. */
  readonly emitted: ReadonlyArray<{
    readonly request: number;
    readonly turn: string;
    readonly event: string;
    readonly at: number;
    readonly text?: string;
  }>;
  /** Every request parked at a gate, oldest first. Its length is the pending count. */
  readonly parked: readonly TargetGatewayGate[];
  /** Per-turn provider-call counts, in the order the turns were first asked. */
  readonly turns: readonly GatewayTurnCount[];
};

export type TargetReadOptions = { readonly attributes?: readonly string[] };
export type TargetState = {
  readonly attributes: Readonly<Record<string, string | null>>;
  readonly boundingBox?: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly className: string;
  readonly count: number;
  readonly focused: boolean;
  readonly text: string | null;
  readonly value?: string;
  readonly visible: boolean;
};
export type TargetWorker = Readonly<{ identity: string; url: string }>;
export type TargetDiagnostics = {
  readonly geospecFault?: { readonly kind: 'missing' | 'corrupt'; readonly url: string; readonly requests: number };
  readonly geospecWasm?: {
    readonly url: string;
    readonly status: number;
    readonly byteLength: number;
    readonly sha256: string;
    readonly sourceSha256: string;
    readonly sourceByteLength: number;
    readonly expectedSha256?: string;
    readonly expectedByteLength?: number;
  };
  readonly consoleMessages: ReadonlyArray<{
    readonly text: string;
    readonly type: string;
  }>;
  readonly pageErrors: readonly string[];
  readonly screenshot?: string;
  readonly tracePath?: string;
  readonly url: string;
};
export type TargetDownload = {
  readonly base64: string;
  readonly suggestedFilename: string;
};
export type TargetTauTestAccount = {
  readonly creditAtoms?: string;
  readonly email: string;
  readonly name: string;
  readonly password: string;
};
export type TargetTauBillingOperation = {
  readonly customerState: string;
  readonly executionStatus: string | null;
  readonly meteringStatus: string | null;
  readonly operationId: string;
  readonly outputTokens: string | null;
  readonly reasoningTokens: string | null;
  readonly terminalRevision: string | null;
};
export type TargetWebGpuProfile = 'disabled' | 'hardware' | 'software';
/** What the scripted gateway fixture needs beyond its turn script. */
export type AgentHostGatewayFixtureOptions = {
  /** Fail the first ST initialization, including internal fetch retries, until its terminal chat turn. */
  readonly geospecFault?: 'missing' | 'corrupt';
  /** Replaces the context window every catalog row advertises, so scripted usage can cross the compaction threshold. */
  readonly contextWindow?: number;
  /** Answers the host's compaction summary call (the one request it sends with no tools); `''` fails it. */
  readonly summary?: string;
};
/** The AV-4 daemon fixture: an origin to navigate to, and a directory to read. */
export type TargetTauServeFixture = {
  readonly origin: string;
  readonly workspace: string;
};
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
    acpLiveEnabled: boolean;
    /** False when the server was started without COOP/COEP (`TAU_E2E_DISABLE_COI`). */
    crossOriginIsolation: boolean;
    /** DP18: the exact STL and GLB of `picovoxel.sphere-minus-beams` every host exports (tau-examples `exact-pins.json`). */
    picovoxelExactPins: Readonly<Record<'stl' | 'glb', { readonly sha256: string; readonly bytes: number }>>;
  }
}

declare module 'vitest/browser' {
  interface LocatorSelectors {
    getByCss(selector: string): Locator;
  }
}

export type UiBrowserCommands = {
  uiAuthenticateTauTestUser(account: TargetTauTestAccount): Promise<void>;
  uiAddCookies(cookies: readonly TargetCookie[]): Promise<void>;
  uiAddContextInitScript(source: string, argument?: unknown): Promise<void>;
  uiAddInitScript(source: string, argument?: unknown): Promise<void>;
  uiCaptureTargetDiagnostics(): Promise<TargetDiagnostics>;
  uiChooseTargetFile(
    triggerSelector: string,
    file: {
      readonly base64: string;
      readonly mimeType: string;
      readonly name: string;
    },
  ): Promise<void>;
  uiClickTarget(selector: string, options?: TargetClickOptions, surface?: TargetSurface): Promise<void>;
  uiCloseSecondaryTarget(): Promise<void>;
  uiCloseTarget(): Promise<void>;
  uiCookies(): Promise<TargetCookie[]>;
  uiCpuProfile(
    action: 'start' | 'stop' | 'snapshot',
    artifactName?: string,
    surface?: TargetSurface,
  ): Promise<string | undefined>;
  uiDragTarget(source: string, target: string, surface?: TargetSurface): Promise<void>;
  uiDownloadTarget(triggerSelector: string): Promise<TargetDownload>;
  uiWriteArtifactChunk(name: string, base64: string, offset: number, finalSha256?: string): Promise<void>;
  uiValidateProjectionFixture(
    path: string,
    expected?: { fixtureSha256: string; historySha256: string; turns: number },
  ): Promise<ProjectionFixtureProof>;
  uiReadFixtureChunk(path: string, offset: number): Promise<{ readonly base64: string; readonly eof: boolean }>;
  uiStartObservedDownloads(): Promise<void>;
  uiReadObservedDownloads(): Promise<readonly TargetDownload[]>;
  uiEmulateColorScheme(colorScheme: 'dark' | 'light' | 'no-preference', surface?: TargetSurface): Promise<void>;
  uiEmulateContrast(contrast: 'more' | 'no-preference', surface?: TargetSurface): Promise<void>;
  uiEmulateForcedColors(forcedColors: 'active' | 'none', surface?: TargetSurface): Promise<void>;
  uiEmulateReducedMotion(reducedMotion: 'no-preference' | 'reduce', surface?: TargetSurface): Promise<void>;
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
  uiInstallAgentHostGatewayFixture(
    script?: readonly GatewayScriptTurn[],
    options?: AgentHostGatewayFixtureOptions,
  ): Promise<void>;
  uiInstallPostHogFixture(apiKey: string): Promise<void>;
  uiKeyboardPress(key: string, surface?: TargetSurface): Promise<void>;
  uiMouseClick(x: number, y: number, options?: TargetClickOptions, surface?: TargetSurface): Promise<void>;
  uiMouseDown(options?: { readonly button?: 'left' | 'middle' | 'right' }, surface?: TargetSurface): Promise<void>;
  uiMouseMove(x: number, y: number, options?: TargetMouseOptions, surface?: TargetSurface): Promise<void>;
  uiMouseUp(options?: { readonly button?: 'left' | 'middle' | 'right' }, surface?: TargetSurface): Promise<void>;
  uiNavigateTarget(path: string, surface?: TargetSurface): Promise<Readonly<Record<string, string>>>;
  uiOpenSecondaryTarget(path: string): Promise<void>;
  uiOpenTarget(options?: { readonly deviceScaleFactor?: number }): Promise<void>;
  uiPressTarget(selector: string, key: string, surface?: TargetSurface): Promise<void>;
  uiQualifyWebGpu(profile: TargetWebGpuProfile): Promise<TargetWebGpuQualificationReport>;
  uiReadTarget(selector: string, options?: TargetReadOptions, surface?: TargetSurface): Promise<TargetState>;
  uiReadTauVertexOperations(email: string): Promise<TargetTauBillingOperation[]>;
  uiReadAgentHostApiRequests(): Promise<string[]>;
  uiReadPostHogSummary(sentinels: readonly string[]): Promise<{
    readonly events: string[];
    readonly requests: string[];
    readonly present: Record<string, boolean>;
  }>;
  uiHoldNextAgentHostGatewayRequest(): Promise<void>;
  uiReadAgentHostGatewayRequests(): Promise<unknown[]>;
  uiReadAgentHostGatewayState(): Promise<TargetGatewayState>;
  uiReleaseAgentHostGatewayFixture(turn?: string): Promise<void>;
  uiReleaseAgentHostGatewayRequest(turn?: string): Promise<void>;
  uiWaitForAgentHostGatewayGate(
    match?: { readonly kind?: 'request' | 'stream'; readonly turn?: string },
    timeoutMilliseconds?: number,
  ): Promise<TargetGatewayGate>;
  uiSetAgentHostGatewayFailure(failure?: {
    readonly status: number;
    readonly message: string;
    readonly type?: string;
  }): Promise<void>;
  uiReadTargetEvents(): Promise<{
    readonly geospecWasm?: TargetDiagnostics['geospecWasm'];
    readonly geospecFault?: TargetDiagnostics['geospecFault'];
    readonly consoleMessages: ReadonlyArray<{
      readonly text: string;
      readonly type: string;
    }>;
    readonly pageErrors: readonly string[];
  }>;
  uiReloadTarget(surface?: TargetSurface): Promise<void>;
  uiScreenshotTarget(selector?: string | null, artifactName?: string, surface?: TargetSurface): Promise<string>;
  uiSampleCameraDuringClick(selector: string, frameCount: number): Promise<unknown[]>;
  uiScrollTarget(selector: string, surface?: TargetSurface): Promise<void>;
  uiSetTargetOffline(offline: boolean): Promise<void>;
  uiSetViewport(viewport: TargetViewport, surface?: TargetSurface): Promise<void>;
  uiStartHostFixture(): Promise<string>;
  uiStartTauServeFixture(options?: { readonly externalAgents?: boolean | 'codex' }): Promise<TargetTauServeFixture>;
  uiStopTauServeFixture(): Promise<void>;
  uiReleaseTauServeGateway(): Promise<void>;
  uiIsTauServeGatewayHeld(): Promise<boolean>;
  uiReadTauServeFile(relativePath: string): Promise<string | undefined>;
  uiListTauServeChats(): Promise<readonly string[]>;
  uiWorkerCatchUpFlow(install: boolean, surface?: TargetSurface): Promise<readonly TargetWorkerFlowEvidence[]>;
  uiTargetWorkers(urlSubstring?: string, surface?: TargetSurface): Promise<readonly TargetWorker[]>;
  uiTypeTarget(selector: string, value: string, surface?: TargetSurface): Promise<void>;
  uiWaitForTarget(source: string, argument?: unknown, timeout?: number, surface?: TargetSurface): Promise<void>;
};

locators.extend({
  getByCss(selector: string) {
    return `css=${selector}`;
  },
});

const server = vitestServer as typeof vitestServer & { readonly commands: UiBrowserCommands };
const selectorFor = (selector: TargetSelector): string => (typeof selector === 'string' ? selector : selector.selector);
export const { commands } = server;

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
export const emulateReducedMotion = (
  reducedMotion: 'no-preference' | 'reduce',
  surface?: TargetSurface,
): Promise<void> => server.commands.uiEmulateReducedMotion(reducedMotion, surface);
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
): Promise<void> =>
  server.commands.uiWaitForTarget(
    callback.toString(),
    // The command transport drops `undefined` positions, so a later option needs a `null` placeholder.
    argument ?? (options?.timeout === undefined && !options?.surface ? undefined : null),
    options?.timeout,
    options?.surface,
  );
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
    // The command transport drops `undefined` positions, so a page screenshot with a name sends `null`.
    selector ? selectorFor(selector) : artifactName === undefined && surface === undefined ? undefined : null,
    artifactName ?? (surface ? '' : undefined),
    surface,
  );
export const sampleCameraDuringClick = <Camera>(selector: TargetSelector, frameCount: number): Promise<Camera[]> =>
  server.commands.uiSampleCameraDuringClick(selectorFor(selector), frameCount) as Promise<Camera[]>;
export const openSecondary = (path: string): Promise<void> => server.commands.uiOpenSecondaryTarget(path);
export const closeSecondary = (): Promise<void> => server.commands.uiCloseSecondaryTarget();
/** Install or read bounded catch-up flow evidence from page-visible resident agent-host workers. */
export const workerCatchUpFlow = (
  install: boolean,
  surface?: TargetSurface,
): Promise<readonly TargetWorkerFlowEvidence[]> => server.commands.uiWorkerCatchUpFlow(install, surface);

/** The dedicated workers the page is running, by stable instance identity and script URL (V21). */
export const workers = (urlSubstring?: string, surface?: TargetSurface): Promise<readonly TargetWorker[]> =>
  server.commands.uiTargetWorkers(urlSubstring, surface);
export const cookies = (): Promise<TargetCookie[]> => server.commands.uiCookies();
/** Save intrusive diagnostic heap snapshots through the active page/worker profiler sessions. */
export const snapshotProjectionHeap = async (artifactName: string, surface?: TargetSurface): Promise<string> =>
  (await server.commands.uiCpuProfile('snapshot', artifactName, surface)) ?? artifactName;

/** Begin a CPU profile of one page; see {@link stopCpuProfile}. */
export const startCpuProfile = async (surface?: TargetSurface): Promise<void> => {
  await server.commands.uiCpuProfile('start', undefined, surface);
};
/** End the page's CPU profile and write it as `artifactName`; resolves to its path. */
export const stopCpuProfile = async (artifactName: string, surface?: TargetSurface): Promise<string> =>
  (await server.commands.uiCpuProfile('stop', artifactName, surface)) ?? artifactName;
export const addCookies = (values: readonly TargetCookie[]): Promise<void> => server.commands.uiAddCookies(values);
export const authenticateTauTestUser = (account: TargetTauTestAccount): Promise<void> =>
  server.commands.uiAuthenticateTauTestUser(account);
export const readTauVertexOperations = (email: string): Promise<TargetTauBillingOperation[]> =>
  server.commands.uiReadTauVertexOperations(email);
export const chooseFile = (
  trigger: TargetSelector,
  file: {
    readonly base64: string;
    readonly mimeType: string;
    readonly name: string;
  },
): Promise<void> => server.commands.uiChooseTargetFile(selectorFor(trigger), file);
export const events = (): Promise<
  Pick<TargetDiagnostics, 'consoleMessages' | 'pageErrors' | 'geospecWasm' | 'geospecFault'>
> => server.commands.uiReadTargetEvents();
export const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
export const writeArtifact = async (name: string, content: string): Promise<void> => {
  const bytes = new TextEncoder().encode(content);
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  for (let offset = 0; offset < bytes.length || offset === 0; offset += 65_536) {
    const chunk = bytes.subarray(offset, offset + 65_536);
    // oxlint-disable-next-line no-await-in-loop -- Exact binary chunks must arrive in physical file order.
    await server.commands.uiWriteArtifactChunk(
      name,
      uint8ArrayToBase64(chunk),
      offset,
      offset + chunk.length === bytes.length ? sha256 : undefined,
    );
  }
};

export const validateProjectionFixture = (
  path: string,
  expected?: { fixtureSha256: string; historySha256: string; turns: number },
): Promise<ProjectionFixtureProof> => server.commands.uiValidateProjectionFixture(path, expected);

/** Read exact immutable fixture UTF8 through bounded binary replies. */
export const readFixtureText = async (path: string): Promise<string> => {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parts: string[] = [];
  let offset = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Decode exact ordered chunks across multibyte character boundaries.
    const chunk = await server.commands.uiReadFixtureChunk(path, offset);
    const bytes = base64ToUint8Array(chunk.base64);
    parts.push(decoder.decode(bytes, { stream: !chunk.eof }));
    offset += bytes.length;
    if (chunk.eof) {
      return parts.join('');
    }
    if (bytes.length === 0) {
      throw new Error('Fixture read made no progress.');
    }
  }
};
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
            __TAU_SECTION_VIEW_TEST__?: {
              getGraphicsBackend(): 'webgl' | 'webgpu';
            };
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
                __TAU_SECTION_VIEW_TEST_BRIDGES__?: ReadonlyArray<{
                  isGeometryFramed(): boolean;
                }>;
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
  options: { readonly externalAgents?: boolean | 'codex' } = {},
): Promise<TargetTauServeFixture> => server.commands.uiStartTauServeFixture(options);
export const stopTauServeFixture = (): Promise<void> => server.commands.uiStopTauServeFixture();
export const releaseTauServeGateway = (): Promise<void> => server.commands.uiReleaseTauServeGateway();
export const isTauServeGatewayHeld = (): Promise<boolean> => server.commands.uiIsTauServeGatewayHeld();
export const readTauServeFile = (relativePath: string): Promise<string | undefined> =>
  server.commands.uiReadTauServeFile(relativePath);
export const listTauServeChats = (): Promise<readonly string[]> => server.commands.uiListTauServeChats();
/** Installs the Anthropic-wire gateway fixture; omit `script` for the default browser-host script. */
export const installAgentHostGatewayFixture = (
  script?: readonly GatewayScriptTurn[],
  options?: AgentHostGatewayFixtureOptions,
): Promise<void> => server.commands.uiInstallAgentHostGatewayFixture(script, options);
export const readAgentHostGatewayRequests = (): Promise<unknown[]> => server.commands.uiReadAgentHostGatewayRequests();
/** Releases a response parked mid-stream; omit `turn` for the newest gate. */
export const releaseAgentHostGatewayFixture = (turn?: string): Promise<void> =>
  server.commands.uiReleaseAgentHostGatewayFixture(turn);
/** Holds the next provider request at its entry — the turn stays in `queued.dispatched` (F1). */
export const holdNextAgentHostGatewayRequest = (): Promise<void> => server.commands.uiHoldNextAgentHostGatewayRequest();
/** Releases a request parked at its entry; omit `turn` for the newest gate. */
export const releaseAgentHostGatewayRequest = (turn?: string): Promise<void> =>
  server.commands.uiReleaseAgentHostGatewayRequest(turn);
/** What the gateway holds and what it has been asked: parked gates and per-turn call counts (F5). */
export const readAgentHostGatewayState = (): Promise<TargetGatewayState> =>
  server.commands.uiReadAgentHostGatewayState();
/** Waits until a request is parked at a matching gate, and answers which one (F2). */
export const waitForAgentHostGatewayGate = (
  match?: { readonly kind?: 'request' | 'stream'; readonly turn?: string },
  timeoutMilliseconds?: number,
): Promise<TargetGatewayGate> => server.commands.uiWaitForAgentHostGatewayGate(match, timeoutMilliseconds);
/** Every `/v1/chat/...` path the page asked the (absent) API for since the fixture was installed. */
export const readAgentHostApiRequests = (): Promise<string[]> => server.commands.uiReadAgentHostApiRequests();
/** Intercepts first-party PostHog requests and serves the installed recorder locally. */
export const installPostHogFixture = (apiKey: string): Promise<void> => server.commands.uiInstallPostHogFixture(apiKey);
export const readPostHogSummary = (
  sentinels: readonly string[],
): Promise<{
  readonly events: string[];
  readonly requests: string[];
  readonly present: Record<string, boolean>;
}> => server.commands.uiReadPostHogSummary(sentinels);

/** The two points a row can park a chat's turn at; see {@link holdChatTurn}. */
export type ChatTurnHold = 'admission' | 'settlement';

/**
 * Park this chat's next admission or settlement.
 *
 * The gateway fixture cannot hold either: `run.queued.admitting` is over before
 * a provider call exists, and `run.finishing.settling` runs after the stream
 * the row is watching has closed. The page's own `TAU_DEBUG` probe holds them
 * (`apps/ui/app/chat-clients/debug-probes.tsx`, mounted by `focused-chat-gate.tsx`
 * only under `ENV.TAU_DEBUG`, which `global-setup.ts` sets for this suite).
 *
 * Waits for the probe rather than racing the focused chat's mount. Arming twice
 * is a no-op, and the probe releases both holds when it unmounts.
 *
 * @param hold - Which point to park at.
 * @returns Nothing.
 */
export const holdChatTurn = async (hold: ChatTurnHold): Promise<void> => {
  await expect
    .poll(
      async () => evaluate(() => typeof (globalThis as Record<string, unknown>)['__tauHoldChatTurn'] === 'function'),
      { timeout: 60_000 },
    )
    .toBe(true);
  await evaluate((which: ChatTurnHold) => {
    (globalThis as unknown as { __tauHoldChatTurn: (value: ChatTurnHold) => void }).__tauHoldChatTurn(which);
  }, hold);
};

/**
 * Let a parked admission or settlement carry on; releasing an unarmed hold is a no-op.
 *
 * @param hold - The point to release.
 * @returns Nothing.
 */
export const releaseChatTurn = async (hold: ChatTurnHold): Promise<void> => {
  await evaluate((which: ChatTurnHold) => {
    (globalThis as unknown as { __tauReleaseChatTurn?: (value: ChatTurnHold) => void }).__tauReleaseChatTurn?.(which);
  }, hold);
};
/**
 * Arms (or disarms, with no argument) a provider refusal on the gateway fixture.
 *
 * `type` is the wire error type and is what decides whether the refused run can
 * be continued: omit it and the fixture answers the upstream provider's own
 * `api_error`, which the gateway maps to `UNKNOWN_GATEWAY_ERROR` — a failure no
 * resume can continue, so the card reads *Try again* and re-admits. Name one of
 * the gateway's own codes (`INVALID_REQUEST`, `INSUFFICIENT_CREDIT`, …) for the
 * refusal a resume *can* continue under the same run.
 */
export const setAgentHostGatewayFailure = (failure?: {
  readonly status: number;
  readonly message: string;
  readonly type?: string;
}): Promise<void> => server.commands.uiSetAgentHostGatewayFailure(failure);

export const expectVisible = async (
  selector: TargetSelector,
  timeout = 10_000,
  surface?: TargetSurface,
): Promise<void> => {
  await expect
    .poll(async () => (await read(selector, undefined, surface)).visible, {
      timeout,
    })
    .toBe(true);
};
export const expectHidden = async (
  selector: TargetSelector,
  timeout = 10_000,
  surface?: TargetSurface,
): Promise<void> => {
  await expect
    .poll(async () => (await read(selector, undefined, surface)).visible, {
      timeout,
    })
    .toBe(false);
};
export const expectCount = async (
  selector: TargetSelector,
  count: number,
  timeout = 10_000,
  surface?: TargetSurface,
): Promise<void> => {
  await expect
    .poll(async () => (await read(selector, undefined, surface)).count, {
      timeout,
    })
    .toBe(count);
};
export const expectText = async (
  selector: TargetSelector,
  expected: string | RegExp,
  timeout = 10_000,
): Promise<void> => {
  const assertion = expect.poll(async () => (await read(selector)).text, {
    timeout,
  });
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
  const assertion = expect.poll(async () => getAttribute(selector, name), {
    timeout,
  });
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

/** Start passive per-page download capture before the Principal's product gestures. */
export const startObservedDownloads = (): Promise<void> => server.commands.uiStartObservedDownloads();
/** Read exact bytes of actual operator-triggered downloads without a product click. */
export const readObservedDownloads = (): Promise<readonly TargetDownload[]> =>
  server.commands.uiReadObservedDownloads();
