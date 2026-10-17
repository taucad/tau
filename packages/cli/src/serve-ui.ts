// The Tau UI `tau serve` serves (charter W18, Q51, D29): a Tau-authored layer, the first one that is not a kernel. Its
// archive is pinned by digest in `serve-ui-layer.json`, which ships inside the CLI, and the preparation host downloads,
// verifies, unpacks and seals it into the shared payload store like any closure (D4, D8, I1, I2). The daemon serves the
// sealed `client/` directory read-only (I6): a run-time client environment is staged beside it, never written into it.
// A pin that is still the fail-closed placeholder (ruling X20's precedent) makes no request at all.
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { defaultPayloadStore } from '@taucad/host';
import { createPreparationHost, PreparationError, readManagedPreparation } from '@taucad/runtime/preparation/node';
import type {
  DependencyTarget,
  HostIndicators,
  PluginDeployment,
  PreparationPlugin,
} from '@taucad/runtime/preparation/node';

// oxlint-disable-next-line no-restricted-imports -- the pin sits beside package.json so the release job can rewrite it; `#` reaches only src.
import pinnedLayer from '../serve-ui-layer.json' with { type: 'json' };

/** The package the layer's receipts name, and the dependency it prepares. */
export const serveUiSelection = { package: '@taucad/cli', dependencies: ['ui'] } as const;

/** The directory of the layer's closure that holds the UI build. */
const clientDirectory = 'client';

/** One published serve UI layer, as `serve-ui-layer.json` pins it. */
export type ServeUiLayerPin = {
  /** SRI sha256 of the `tar.gz` archive. */
  readonly integrity: `sha256-${string}`;
  /** Archive size. Bytes. */
  readonly byteLength: number;
  /** What the archive unpacks to, the extraction cap. Bytes. */
  readonly unpackedByteLength: number;
  /** The CDN blob first, then the GitHub Release asset; empty only for the placeholder. */
  readonly urls: readonly string[];
};

/** The SRI of zero bytes: the fail-closed placeholder no published layer can match. */
const placeholderIntegrity = `sha256-${createHash('sha256').digest('base64')}`;

const sriSha256 = /^sha256-[\d+/A-Za-z]{43}=$/u;

/**
 * Validate a serve UI layer pin.
 * @param value - The parsed `serve-ui-layer.json`.
 * @returns The pin.
 * @throws {TypeError} When a field is missing or malformed, or a URL is not https without credentials.
 */
export const readServeUiPin = (value: unknown): ServeUiLayerPin => {
  const pin = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<string, unknown>>;
  const { integrity, byteLength, unpackedByteLength, urls } = pin;
  const positive = (field: unknown): field is number => Number.isSafeInteger(field) && (field as number) > 0;
  if (
    pin['schemaVersion'] !== 1 ||
    typeof integrity !== 'string' ||
    !sriSha256.test(integrity) ||
    !positive(byteLength) ||
    !positive(unpackedByteLength) ||
    !Array.isArray(urls)
  ) {
    throw new TypeError('serve-ui-layer.json is not a schema v1 serve UI layer pin.');
  }
  for (const url of urls) {
    const parsed = typeof url === 'string' && URL.canParse(url) ? new URL(url) : undefined;
    if (parsed?.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
      throw new TypeError(`serve-ui-layer.json pins ${JSON.stringify(url)}, which is not an https URL.`);
    }
  }
  if (integrity !== placeholderIntegrity && urls.length === 0) {
    throw new TypeError('serve-ui-layer.json pins a layer with no URL to download it from.');
  }
  return {
    integrity: integrity as ServeUiLayerPin['integrity'],
    byteLength,
    unpackedByteLength,
    urls: urls as string[],
  };
};

/**
 * Whether a pin is the fail-closed placeholder carried until the first layer is published.
 * @param pin - A pin.
 * @returns True for the digest of zero bytes.
 */
export const isPlaceholderPin = (pin: ServeUiLayerPin): boolean => pin.integrity === placeholderIntegrity;

/* One archive serves every host: the layer is a browser build. It is declared once per native target the store
 * prepares on, and one closure is sealed whatever the target, because a closure is keyed by its payloads. */
const layerTargets: readonly DependencyTarget[] = [
  { runtime: 'native', os: 'darwin', arch: 'arm64' },
  { runtime: 'native', os: 'darwin', arch: 'x64' },
  { runtime: 'native', os: 'linux', arch: 'x64', libc: 'glibc' },
  { runtime: 'native', os: 'linux', arch: 'arm64', libc: 'glibc' },
  { runtime: 'native', os: 'linux', arch: 'x64', libc: 'musl' },
  { runtime: 'native', os: 'linux', arch: 'arm64', libc: 'musl' },
];

/**
 * The layer as a preparation host deployment: one `ui` dependency, unpacked into `client/`, and no kernel.
 * @param pin - The published layer.
 * @returns The deployment.
 */
export const serveUiDeployment = (pin: ServeUiLayerPin): PluginDeployment => {
  const [firstTarget, ...otherTargets] = layerTargets.map((target) => ({
    target,
    payloads: [
      {
        name: clientDirectory,
        integrity: pin.integrity,
        byteLength: pin.byteLength,
        format: 'tar.gz',
        origin: { kind: 'url', urls: pin.urls as [string, ...string[]] },
        destination: clientDirectory,
        unpackedByteLength: pin.unpackedByteLength,
      },
    ] as const,
  }));
  return { schemaVersion: 1, kernels: {}, dependencies: { ui: [firstTarget!, ...otherTargets] } };
};

/** Where the served UI comes from, or why there is none. */
export type ServeUi =
  | {
      readonly status: 'ready';
      /** The sealed `client/` directory to serve. */
      readonly root: string;
      readonly closureIntegrity: string;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'unpublished' | 'unsupported-target' | 'offline-miss' | 'cancelled' | 'failed';
      readonly message: string;
    };

/** One progress report while the layer is prepared. */
export type ServeUiProgress = { readonly completedBytes: number; readonly totalBytes: number };

/**
 * Prepare the pinned serve UI layer into the payload store and say where its build is. A sealed layer answers at once
 * with no request; otherwise its archive is downloaded once, verified against the pin while it is written, unpacked
 * and sealed. A missing UI is an answer, never a throw: the caller decides whether to serve agents without one.
 * @param options - Cancellation, progress, and the pin, store, environment, host indicators and transport (for tests).
 * @returns The sealed UI directory, or why there is none.
 * @throws {Error} When the managed profile in the environment is malformed (`readManagedPreparation`).
 */
export const prepareServeUi = async (options: {
  readonly signal: AbortSignal;
  readonly onProgress?: (progress: ServeUiProgress) => void;
  readonly pin?: ServeUiLayerPin;
  readonly store?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly indicators?: HostIndicators;
  readonly fetch?: typeof fetch;
}): Promise<ServeUi> => {
  const pin = options.pin ?? readServeUiPin(pinnedLayer);
  if (isPlaceholderPin(pin)) {
    return {
      status: 'unavailable',
      reason: 'unpublished',
      message: 'This release of the Tau CLI pins no published Tau UI yet.',
    };
  }
  /* A malformed managed profile is the caller's usage error, as it is for every other command. */
  const managed = readManagedPreparation(options.environment ?? process.env);
  const plugin: PreparationPlugin = { package: serveUiSelection.package, deployment: serveUiDeployment(pin) };
  const host = createPreparationHost({
    plugins: [plugin],
    store: options.store ?? defaultPayloadStore(),
    /* Absent, the host reads this machine's own indicators. */
    ...(options.indicators === undefined ? {} : { indicators: options.indicators }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(managed.mirror === undefined ? {} : { mirror: managed.mirror }),
    ...(managed.seed === undefined ? {} : { seed: managed.seed }),
    selection: managed.selection,
  });
  const unsubscribe = host.on('preparation', ({ state }) => {
    if (state.status === 'preparing') {
      options.onProgress?.({ completedBytes: state.completedBytes, totalBytes: state.totalBytes });
    }
  });
  try {
    const outcome = await host.prepare({ ...serveUiSelection, offline: managed.offline, signal: options.signal });
    if (outcome.status === 'cancelled') {
      return { status: 'unavailable', reason: 'cancelled', message: 'Preparing the Tau UI was cancelled.' };
    }
    if (outcome.status === 'blocked') {
      /* The host's own wording for an unsupported target speaks of kernels; the layer is a browser build. */
      return outcome.reason === 'offline-miss'
        ? { status: 'unavailable', reason: 'offline-miss', message: outcome.message }
        : {
            status: 'unavailable',
            reason: 'unsupported-target',
            message: `The Tau UI layer is not prepared on ${process.platform}-${process.arch} yet.`,
          };
    }
    /* A ready preparation carries a receipt for every dependency it selected. */
    const receipt = outcome.receipts['ui']!;
    return {
      status: 'ready',
      root: join(receipt.root, clientDirectory),
      closureIntegrity: receipt.closureIntegrity,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: 'failed',
      message: error instanceof PreparationError ? `${error.code}: ${error.message}` : String(error),
    };
  } finally {
    unsubscribe();
    host.dispose();
  }
};
