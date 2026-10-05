/* eslint-disable no-await-in-loop -- Preflight and owned filesystem writes precede the actual utility admission. */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { afterEach, expect, test } from 'vitest';
import { areUint8ArraysEqual, base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import type { createRuntimeClient, RuntimeClient } from '@taucad/runtime/client';
import type { createElectronClientOptions, ElectronRuntimeRendererBridge } from '@taucad/runtime/electron/renderer';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import type {
  PublishedAssembly,
  PublishedPartAsset,
  PublishedPartReference,
  TelemetryBatch,
} from '@taucad/runtime/types';
import { assertRootedPath } from '@taucad/utils/path';
import { canonicalJson } from '@taucad/utils/hash';
import { contentDigest } from '@taucad/cache-core';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { desktopE2ECompletedArtifact, desktopE2EPackagedExecutable } from '#support/config.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, startGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  connectPickedFolder,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

// Data-only handoff consumed by the existing browser-pin cases, with no replacement producer.
type BrowserClosure = Readonly<{
  root: PublishedPartAsset;
  publication: PublishedAssembly;
  partRecords: Readonly<Record<string, PublishedPartReference>>;
  files: ReadonlyArray<Readonly<{ path: string; digest: string; byteLength: number; base64: string }>>;
  servedAssets: ReadonlyArray<Readonly<{ name: string; digest: string; byteLength: number }>>;
  sourceFree: Readonly<{ removed: readonly string[] }>;
}>;
const digest = (bytes: Uint8Array<ArrayBuffer>): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** Preflight the complete data handoff before the first consumer project write. Actual runtime admission follows. */
const preflight = (closure: BrowserClosure): ReadonlyMap<string, Uint8Array<ArrayBuffer>> => {
  const parent = closure.root.path.slice(0, closure.root.path.lastIndexOf('/') + 1);
  if (!/^\.tau\/artifacts\/reusable-parts\/[0-9a-f]{64}\/$/u.test(parent)) {
    throw new Error('Browser pin has no managed canonical parent.');
  }
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const file of closure.files) {
    const path = assertRootedPath(file.path);
    const bytes = base64ToUint8Array(file.base64);
    if (
      !path.startsWith(parent) ||
      files.has(path) ||
      bytes.byteLength !== file.byteLength ||
      digest(bytes) !== file.digest
    ) {
      throw new Error(`Browser closure identity/path failed: ${path}`);
    }
    files.set(path, bytes);
  }
  const root = files.get(closure.root.path);
  if (!root || digest(root) !== closure.root.digest || root.byteLength !== closure.root.byteLength) {
    throw new Error('Browser root pin bytes are missing.');
  }
  if (root.byteLength > 4096) {
    throw new Error('Browser root pointer exceeds its bounded metadata limit.');
  }
  const pointer = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(root)) as {
    schemaVersion: number;
    generation: number;
    manifest: PublishedPartAsset;
  };
  const storagePath = (assetDigest: string, extension: string): string =>
    `${parent}roots/sha256/${assetDigest.slice('sha256:'.length)}.${extension}`;
  if (
    pointer.schemaVersion !== 2 ||
    !Number.isSafeInteger(pointer.generation) ||
    pointer.manifest.path !== storagePath(pointer.manifest.digest, 'json') ||
    pointer.manifest.byteLength > 1_048_576
  ) {
    throw new Error('Browser root pointer has an invalid bounded manifest.');
  }
  const manifestBytes = files.get(pointer.manifest.path);
  if (
    !manifestBytes ||
    manifestBytes.byteLength !== pointer.manifest.byteLength ||
    digest(manifestBytes) !== pointer.manifest.digest
  ) {
    throw new Error('Browser root manifest pin bytes are missing.');
  }
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)) as {
    schemaVersion: number;
    content: { digest: string; byteLength: number };
    chunks: PublishedPartAsset[];
  };
  if (
    manifest.schemaVersion !== 1 ||
    !Number.isSafeInteger(manifest.content.byteLength) ||
    manifest.content.byteLength < 1 ||
    manifest.content.byteLength > 32 * 1_048_576 ||
    !Array.isArray(manifest.chunks) ||
    manifest.chunks.length !== Math.ceil(manifest.content.byteLength / 1_048_576)
  ) {
    throw new Error('Browser root manifest has invalid bounded content.');
  }
  const content = new Uint8Array(manifest.content.byteLength);
  let offset = 0;
  const storagePaths = new Set([closure.root.path, pointer.manifest.path]);
  for (const chunk of manifest.chunks) {
    const bytes = files.get(chunk.path);
    const length = Math.min(1_048_576, content.byteLength - offset);
    if (
      chunk.path !== storagePath(chunk.digest, 'chunk') ||
      chunk.byteLength !== length ||
      !bytes ||
      bytes.byteLength !== length ||
      digest(bytes) !== chunk.digest
    ) {
      throw new Error('Browser root ordered chunk is missing or corrupt.');
    }
    content.set(bytes, offset);
    offset += length;
    storagePaths.add(chunk.path);
  }
  if (digest(content) !== manifest.content.digest) {
    throw new Error('Browser root reconstructed content differs from its manifest.');
  }
  const logical = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)) as {
    schemaVersion: number;
    generation: number;
    parts: unknown;
  };
  if (
    logical.schemaVersion !== 1 ||
    logical.generation !== pointer.generation ||
    logical.parts === null ||
    typeof logical.parts !== 'object' ||
    Array.isArray(logical.parts)
  ) {
    throw new Error('Browser root logical content differs from its checked pointer.');
  }
  const references = logical.parts as Readonly<Record<string, PublishedPartReference>>;
  const names = Object.keys(closure.publication.parts);
  if (
    canonicalJson(references) !== canonicalJson(closure.partRecords) ||
    names.length !== Object.keys(references).length ||
    names.some((name) => !Object.hasOwn(references, name))
  ) {
    throw new Error('Browser closure does not cover its complete part set.');
  }
  const expected = storagePaths;
  const requireAsset = (asset: PublishedPartAsset): void => {
    const bytes = files.get(asset.path);
    if (!bytes || bytes.byteLength !== asset.byteLength || digest(bytes) !== asset.digest) {
      throw new Error(`Browser asset missing: ${asset.path}`);
    }
    expected.add(asset.path);
  };
  for (const name of names) {
    const reference = references[name]!;
    const record = closure.publication.parts[name]!;
    const bytes = files.get(reference.path);
    if (!bytes || digest(bytes) !== reference.digest || new TextDecoder().decode(bytes) !== canonicalJson(record)) {
      throw new Error(`Browser completed-part record differs: ${name}`);
    }
    expected.add(reference.path);
    for (const variant of Object.values(record.variants)) {
      requireAsset(variant.glb);
      if (!variant.exact) {
        throw new Error('Actual browser physical pin has no native evidence.');
      }
      requireAsset(variant.exact.asset);
    }
  }
  if (expected.size !== files.size || [...files.keys()].some((path) => !expected.has(path))) {
    throw new Error('Browser handoff contains unrelated files.');
  }
  if (
    canonicalJson(closure.sourceFree.removed) !==
    canonicalJson(['public/models/physical-inspection.js', 'physical/assembly.json'])
  ) {
    throw new Error('Browser source scrub receipt is incomplete.');
  }
  return files;
};

// Existing packaged bundles expose these modules; locate them privately without a new renderer verb.
const rendererChunkUrl = (clientRoot: string, prefix: string, diagnostic: string): string => {
  const directory = join(clientRoot, 'assets');
  const matches = readdirSync(directory).filter(
    (name) =>
      name.startsWith(prefix) &&
      name.endsWith('.js') &&
      readFileSync(join(directory, name), 'utf8').includes(diagnostic),
  );
  expect(matches, `unique packaged ${prefix} chunk`).toHaveLength(1);
  return `app://tau/assets/${matches[0]!}`;
};

/** Exclude only OCCT's generated NAUO argument zero; retain every other literal DATA byte. */
const stepDataWithoutGeneratedUsageIds = (data: string): string => {
  const generatedIds: string[] = [];
  const recordCount = [...data.matchAll(/^#[1-9]\d*\s*=\s*NEXT_ASSEMBLY_USAGE_OCCURRENCE\(/gmu)].length;
  const retained = data.replaceAll(
    /(^#[1-9]\d*\s*=\s*NEXT_ASSEMBLY_USAGE_OCCURRENCE\()'([1-9]\d*)'(?=,)/gmu,
    (_record, prefix: string, generatedId: string) => {
      generatedIds.push(generatedId);
      return `${prefix}'generated-usage-id'`;
    },
  );
  if (recordCount !== 3 || generatedIds.length !== 3 || new Set(generatedIds).size !== 3) {
    throw new Error('STEP DATA requires exactly three positive unique generated NAUO usage IDs.');
  }
  return retained;
};

/** Compare complete literal DATA sections with that one generated field excluded. */
const sameStepDataExceptGeneratedUsageIds = (first: string, second: string): boolean =>
  stepDataWithoutGeneratedUsageIds(first) === stepDataWithoutGeneratedUsageIds(second);

const usageIdControlData = `DATA;
#1 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('1','body','',$,#8,#9);
#2 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('2','face','',$,#8,#10);
#3 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('3','root','',$,#7,#8);
#4 = SHAPE_REPRESENTATION('shape',(#5),#6);
#5 = LENGTH_UNIT('millimeter');
#6 = DENSITY('1.55');
ENDSEC;`;

test('should compare STEP DATA with only generated NAUO usage IDs excluded', () => {
  const later = usageIdControlData.replace("('1',", "('11',").replace("('2',", "('12',").replace("('3',", "('13',");
  expect(later).not.toBe(usageIdControlData);
  expect(sameStepDataExceptGeneratedUsageIds(usageIdControlData, later)).toBe(true);
});

test.each([
  ['other argument', usageIdControlData.replace("'body',''", "'body','changed'")],
  ['name', usageIdControlData.replace("'body'", "'changed'")],
  ['product reference', usageIdControlData.replace('#8,#9', '#8,#10')],
  ['shape', usageIdControlData.replace("'shape'", "'changed-shape'")],
  ['unit', usageIdControlData.replace("'millimeter'", "'meter'")],
  ['density', usageIdControlData.replace("'1.55'", "'2.1'")],
  ['entity count', `${usageIdControlData}\n#7 = EXTRA_ENTITY();`],
  [
    'entity order',
    usageIdControlData.replace(
      "#5 = LENGTH_UNIT('millimeter');\n#6 = DENSITY('1.55');",
      "#6 = DENSITY('1.55');\n#5 = LENGTH_UNIT('millimeter');",
    ),
  ],
  ['entity ID', usageIdControlData.replace('#4 =', '#40 =')],
])('should reject STEP DATA drift in %s', (_name, changed) => {
  expect(sameStepDataExceptGeneratedUsageIds(usageIdControlData, changed)).toBe(false);
});

test.each([
  ['zero', usageIdControlData.replace("('1',", "('0',")],
  ['negative', usageIdControlData.replace("('1',", "('-1',")],
  ['nonnumeric', usageIdControlData.replace("('1',", "('abc',")],
  ['duplicate', usageIdControlData.replace("('2',", "('1',")],
  ['missing record', usageIdControlData.replace("#3 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('3','root','',$,#7,#8);\n", '')],
  ['extra record', `${usageIdControlData}\n#7 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('4','extra','',$,#8,#9);`],
])('should refuse malformed STEP generated usage IDs: %s', (_name, changed) => {
  expect(() => sameStepDataExceptGeneratedUsageIds(usageIdControlData, changed)).toThrow(Error);
  expect(() => sameStepDataExceptGeneratedUsageIds(usageIdControlData, changed)).toThrow(
    'STEP DATA requires exactly three positive unique generated NAUO usage IDs.',
  );
});

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;
afterEach(async ({ task }) => {
  try {
    if (task.result?.state === 'fail') {
      await session?.capture(`browser-pin-electron-failure-${task.id}`);
    }
  } finally {
    await session?.close();
    session = undefined;
    await fixture?.close();
    fixture = undefined;
    if (seededEmail) {
      await deleteTauTestUser(seededEmail);
    }
    seededEmail = undefined;
  }
});

test.skipIf(!desktopE2ECompletedArtifact || process.env['TAU_E2E_DESKTOP_STARTUP_DIAGNOSTIC'] !== '1')(
  '[startup-diagnostic] observes installed startup through the original tracing call only',
  async () => {
    if (!desktopE2ECompletedArtifact) {
      throw new Error('Startup diagnostic requires the selected completed desktop artifact.');
    }
    const account = tauTestAccount('published-part-startup');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    fixture = await startGatewayFixture();
    session = await launchDesktopApp({
      token,
      packaged: true,
      startupDiagnostic: true,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Native launch environment uses these external keys.
      env: { TAU_DEBUG: 'true', TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1' },
    });
    expect(session.page.isClosed()).toBe(false);
  },
  60_000,
);

const packaged = desktopE2ECompletedArtifact || process.env['TAU_E2E_PUBLISHED_PACKAGED'] === 'true';
test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')(
  `${packaged ? '[completed-artifact]' : '[unpackaged-interim]'} reopens the browser custom native pin through a fresh trusted Electron lease`,
  async () => {
    const artifact = process.env['TAU_E2E_BROWSER_PHYSICAL_CLOSURE'];
    if (!artifact || !artifact.startsWith('/')) {
      throw new Error(
        'Set TAU_E2E_BROWSER_PHYSICAL_CLOSURE to the absolute actual browser closure artifact; no replacement producer is permitted.',
      );
    }
    const closure = JSON.parse(readFileSync(artifact, 'utf8')) as BrowserClosure;
    const files = preflight(closure);
    const clientRoot = packaged
      ? join(resolve(dirname(desktopE2EPackagedExecutable()), '../..'), 'Contents/Resources/ui/client')
      : resolve(import.meta.dirname, '../../ui/desktop/build/client');
    const resourceRoot = packaged
      ? join(
          resolve(dirname(desktopE2EPackagedExecutable()), '../..'),
          'Contents/Resources/engines/replicad/density-single-v1',
        )
      : resolve(import.meta.dirname, '../../ui/desktop/build/host-assets/engines/replicad/density-single-v1');
    expect(closure.servedAssets.map(({ name }) => name)).toEqual(['replicad_single.wasm', 'replicad_single.mjs']);
    for (const asset of closure.servedAssets) {
      const bytes = new Uint8Array(readFileSync(join(resourceRoot, asset.name)));
      expect(bytes.byteLength).toBe(asset.byteLength);
      expect(digest(bytes)).toBe(asset.digest);
    }
    const account = tauTestAccount('published-part');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    fixture = await startGatewayFixture();
    const desktopEnvironment: Record<string, string> = {};
    desktopEnvironment['TAU_DEBUG'] = 'true';
    desktopEnvironment['TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE'] = '1';
    session = await launchDesktopApp({
      token,
      packaged,
      env: desktopEnvironment,
    });
    const { page } = session;
    await fixture.routeThrough(page);
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await authenticatePackagedDesktop(session, token);
    await expectSignedIn(page);
    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);
    // Only establish a real registered project root. This scaffold is not the reusable part producer.
    const slug = await submitPrompt(page, 'Create the empty project used to reopen the browser publication.');
    const scaffold = await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' });
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 420_000);
    const projectRoot = dirname(scaffold);
    unlinkSync(scaffold);
    for (const [path, bytes] of files) {
      const destination = join(projectRoot, assertRootedPath(path));
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes, { flag: 'wx' });
    }
    const clientUrl = rendererChunkUrl(clientRoot, 'client-', 'createRuntimeClient: `transport` is required');
    const rendererUrl = rendererChunkUrl(
      clientRoot,
      'renderer-',
      'requestElectronRuntimePort: preload relay omitted the runtime host ID',
    );
    const result = await page.evaluate(
      async ({ clientUrl, rendererUrl, projectRoot, root }) => {
        type Client = RuntimeClient;
        type Bridge = ElectronRuntimeRendererBridge;
        // Keep imports native to the packaged page, matching the existing Assimp transport test.
        // oxlint-disable-next-line eslint/no-new-func -- Vitest's rewritten SSR import helper is absent in the packaged renderer.
        const importModule = new Function('specifier', 'return import(specifier)') as (
          specifier: string,
        ) => Promise<Record<string, unknown>>;
        const clientModule = await importModule(clientUrl);
        const rendererModule = await importModule(rendererUrl);
        const candidates = Object.values(clientModule).filter(
          (value): value is typeof createRuntimeClient =>
            typeof value === 'function' && value.toString().includes('createRuntimeClient: `transport` is required'),
        );
        if (candidates.length !== 1) {
          throw new Error('Packaged runtime client export is ambiguous.');
        }
        const renderer = Object.values(rendererModule).find(
          (
            value,
          ): value is {
            createElectronClientOptions: typeof createElectronClientOptions;
          } =>
            typeof value === 'object' &&
            value !== null &&
            'createElectronClientOptions' in value &&
            typeof value.createElectronClientOptions === 'function',
        );
        if (!renderer) {
          throw new Error('Packaged Electron client options owner is unavailable.');
        }
        const environment = (globalThis as typeof globalThis & { ENV: Record<string, string> }).ENV;
        const bridge = (globalThis as typeof globalThis & { taucad: Bridge }).taucad;
        let requestedId: string | undefined;
        let leasedHostId: string | undefined;
        const onRuntimePort = (event: MessageEvent): void => {
          const data = event.data as Record<string, unknown> | undefined;
          if (
            event.source === globalThis.window &&
            data?.['taucadRelay'] === bridge.relayTag.runtime &&
            data['requestId'] === requestedId &&
            typeof data['hostId'] === 'string'
          ) {
            leasedHostId = data['hostId'];
          }
        };
        globalThis.addEventListener('message', onRuntimePort);
        const observedBridge: Bridge = {
          relayTag: bridge.relayTag,
          requestRuntimePort(requestId, context) {
            requestedId = requestId;
            bridge.requestRuntimePort(requestId, context);
          },
          releaseRuntimeHost(hostId, reason) {
            bridge.releaseRuntimeHost(hostId, reason);
          },
        };
        // The bundled registry is opaque here; the selected utility still validates its real required config schema.
        const provideOptions = renderer.createElectronClientOptions<AnyRuntimeDefinition>({
          bridge: observedBridge,
          config: { tauApiUrl: environment['TAU_API_URL'], tauWebSocketUrl: environment['TAU_WEBSOCKET_URL'] },
          context: { definition: 'default', projectRoot },
        });
        const client = candidates[0]!(await provideOptions());
        const scope = globalThis as typeof globalThis & { __tauPublishedPartConsumer?: Client };
        if (scope.__tauPublishedPartConsumer) {
          throw new Error('Prior test consumer lease remains live.');
        }
        scope.__tauPublishedPartConsumer = client;
        try {
          await client.connect();
          globalThis.removeEventListener('message', onRuntimePort);
          if (!leasedHostId) {
            throw new Error('Actual preload runtime port omitted the correlated consumer lease.');
          }
          const admitted = await client.openAssembly({ root });
          const exported = await client.exportPublished({ format: 'step', publishedAssembly: { root } });
          if (!exported.success) {
            throw new Error(`Source-free Electron STEP export denied: ${JSON.stringify(exported.issues)}`);
          }
          if (exported.files.length !== 1) {
            throw new Error('Electron STEP export did not produce exactly one file.');
          }
          const file = exported.files[0];
          return {
            hostId: leasedHostId,
            publication: admitted.admitted.publication,
            name: file.name,
            mimeType: file.mimeType,
            bytes: [...file.bytes],
          };
        } catch (error) {
          globalThis.removeEventListener('message', onRuntimePort);
          client.terminate();
          delete scope.__tauPublishedPartConsumer;
          throw error;
        }
      },
      { clientUrl, rendererUrl, projectRoot, root: closure.root },
    );
    expect(result.publication).toEqual(closure.publication);
    const exportedBytes = new Uint8Array(result.bytes);
    expect(new TextDecoder().decode(exportedBytes)).toContain('ISO-10303-21');
    expect(result.name).toBe('assembly');
    expect(result.mimeType).toBe('application/step');
    for (const [path, bytes] of files) {
      expect(areUint8ArraysEqual(readFileSync(join(projectRoot, path)), bytes)).toBe(true);
    }
    const variant = result.publication.parts['inspection']!.variants['default']!;
    const descriptor = JSON.parse(variant.exact!.providerVersion) as { wasmVariant: string; assets: string[] };
    expect(descriptor.wasmVariant).toBe('custom');
    expect(descriptor.assets).toEqual(closure.servedAssets.map(({ digest }) => digest));
    const leaseFork = readFileSync(session.logPath, 'utf8')
      .split('\n')
      .filter((line) => line.includes(' kernel.fork ') && line.includes(`"hostId":"${result.hostId}"`));
    expect(leaseFork, 'actual consumer lease adoption, including a matching pooled spare').toHaveLength(1);
    await page.evaluate(() => {
      const scope = globalThis as typeof globalThis & { __tauPublishedPartConsumer?: { terminate(): void } };
      scope.__tauPublishedPartConsumer?.terminate();
      delete scope.__tauPublishedPartConsumer;
    });
    await expect
      .poll(() =>
        readFileSync(session!.logPath, 'utf8')
          .split('\n')
          .some((line) => {
            const separator = ' kernel.exit ';
            const index = line.indexOf(separator);
            if (index === -1) {
              return false;
            }
            const exit = JSON.parse(line.slice(index + separator.length)) as { hostId: string; released: boolean };
            return exit.hostId === result.hostId && exit.released;
          }),
      )
      .toBe(true);
    const capture = await session.capture('browser-pin-electron-source-free');
    writeFileSync(join(capture, 'browser-pin-electron-source-free.step'), exportedBytes);
  },
);

// Registered project ownership, not a renderer role, admits this producer's private writer.
test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64' || !packaged)(
  '[completed-artifact] publishes native authored parts and reopens both assemblies through fresh source-free leases',
  async () => {
    const account = tauTestAccount('native-authored-publication');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    fixture = await startGatewayFixture();
    session = await launchDesktopApp({
      token,
      packaged: true,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- These external environment wire keys retain their required names.
      env: { TAU_DEBUG: 'true', TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1' },
    });
    const { page } = session;
    await fixture.routeThrough(page);
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await authenticatePackagedDesktop(session, token);
    await expectSignedIn(page);
    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);
    // The real agent-host project remains mounted, retaining main's registered-root grant.
    const slug = await submitPrompt(page, 'Create the empty registered project for native part publication.');
    const scaffold = await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' });
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 420_000);
    const projectRoot = dirname(scaffold);
    unlinkSync(scaffold);
    const clientRoot = join(resolve(dirname(desktopE2EPackagedExecutable()), '../..'), 'Contents/Resources/ui/client');
    const resourceRoot = join(
      resolve(dirname(desktopE2EPackagedExecutable()), '../..'),
      'Contents/Resources/engines/replicad/density-single-v1',
    );
    const servedAssets = ['replicad_single.wasm', 'replicad_single.mjs'].map((name) => {
      const bytes = new Uint8Array(readFileSync(join(resourceRoot, name)));
      return { name, digest: digest(bytes), byteLength: bytes.byteLength };
    });
    const clientUrl = rendererChunkUrl(clientRoot, 'client-', 'createRuntimeClient: `transport` is required');
    const rendererUrl = rendererChunkUrl(
      clientRoot,
      'renderer-',
      'requestElectronRuntimePort: preload relay omitted the runtime host ID',
    );
    const sourcePath = 'public/models/physical-inspection.js';
    const firstAuthoredPath = 'physical/assembly.json';
    const secondAuthoredPath = 'physical/shared-assembly.json';
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const source = `import { makeBaseBox, drawRectangle } from 'replicad';
export const defaultParams = { width: 26 };
export default function main(params = defaultParams) {
  return [
    { shape: makeBaseBox(params.width, 20, 24), name: 'Known housing', density: 1.55 },
    { shape: makeBaseBox(10, 8, 6).translate([40, 0, 0]), name: 'Unknown density' },
    { shape: drawRectangle(10, 8).sketchOnPlane().face().translate([0, 40, 0]), name: 'Open face' },
  ];
}
`;
    for (const path of [sourcePath, firstAuthoredPath]) {
      mkdirSync(dirname(join(projectRoot, path)), { recursive: true });
    }
    writeFileSync(join(projectRoot, sourcePath), source, { flag: 'wx' });
    writeFileSync(
      join(projectRoot, firstAuthoredPath),
      JSON.stringify({
        schemaVersion: 1,
        parts: { inspection: { source: { path: sourcePath } } },
        occurrences: [{ id: 'inspection', part: 'inspection', transform: identity }],
      }),
      { flag: 'wx' },
    );
    const originalSource = new Uint8Array(readFileSync(join(projectRoot, sourcePath)));
    const publicationPathFor = (authoredPath: string): string =>
      `.tau/artifacts/reusable-parts/${createHash('sha256').update(authoredPath).digest('hex')}/scene.json`;
    const runLease = async (
      operation:
        | { type: 'publish'; authoredPath: string; publicationPath: string }
        | { type: 'consume'; roots: readonly PublishedPartAsset[] },
    ) =>
      page.evaluate(
        async ({ clientUrl, rendererUrl, projectRoot, operation, foreignDigest }) => {
          // Native imports resolve the actual package chunks, not Vitest's Node import shim.
          // oxlint-disable-next-line eslint/no-new-func -- The packaged renderer has no Vitest SSR import helper.
          const importModule = new Function('specifier', 'return import(specifier)') as (
            specifier: string,
          ) => Promise<Record<string, unknown>>;
          const clientModule = await importModule(clientUrl);
          const rendererModule = await importModule(rendererUrl);
          const clients = Object.values(clientModule).filter(
            (value): value is typeof createRuntimeClient =>
              typeof value === 'function' && value.toString().includes('createRuntimeClient: `transport` is required'),
          );
          const renderer = Object.values(rendererModule).find(
            (value): value is { createElectronClientOptions: typeof createElectronClientOptions } =>
              value !== null &&
              typeof value === 'object' &&
              'createElectronClientOptions' in value &&
              typeof value.createElectronClientOptions === 'function',
          );
          const [createClient] = clients;
          if (clients.length !== 1 || !createClient || !renderer) {
            throw new Error('Actual packaged client composition is unavailable or ambiguous.');
          }
          const scope = globalThis as typeof globalThis & {
            ENV: Record<string, string>;
            taucad: ElectronRuntimeRendererBridge;
          };
          const bridge = scope.taucad;
          let requestId: string | undefined;
          let hostId: string | undefined;
          const onPort = (event: MessageEvent): void => {
            const data: unknown = event.data;
            if (
              event.source === globalThis.window &&
              data !== null &&
              typeof data === 'object' &&
              'taucadRelay' in data &&
              data.taucadRelay === bridge.relayTag.runtime &&
              'requestId' in data &&
              data.requestId === requestId &&
              'hostId' in data &&
              typeof data.hostId === 'string'
            ) {
              hostId = data.hostId;
            }
          };
          globalThis.addEventListener('message', onPort);
          const batches: TelemetryBatch[] = [];
          let client: RuntimeClient | undefined;
          let stopTelemetry: (() => void) | undefined;
          const cleanupErrors: unknown[] = [];
          const outcome = await (async () => {
            try {
              const options = renderer.createElectronClientOptions<AnyRuntimeDefinition>({
                bridge: {
                  relayTag: bridge.relayTag,
                  requestRuntimePort(id, context) {
                    requestId = id;
                    bridge.requestRuntimePort(id, context);
                  },
                  releaseRuntimeHost(id, reason) {
                    bridge.releaseRuntimeHost(id, reason);
                  },
                },
                config: { tauApiUrl: scope.ENV['TAU_API_URL'], tauWebSocketUrl: scope.ENV['TAU_WEBSOCKET_URL'] },
                context: { definition: 'default', projectRoot },
              });
              client = createClient(await options());
              stopTelemetry = client.on('telemetry', (batch) => {
                batches.push(batch);
              });
              await client.connect();
              if (!hostId || !requestId) {
                throw new Error('Actual registered-project lease has no correlated identity.');
              }
              if (operation.type === 'publish') {
                const result = await client.publishAssembly({
                  authoredPath: operation.authoredPath,
                  publicationPath: operation.publicationPath,
                });
                if (result.status !== 'published') {
                  throw new Error(`Actual native publication refused: ${result.status}`);
                }
                const published = {
                  root: result.root,
                  generation: result.generation,
                  partRecords: result.partRecords,
                  publication: result.admitted.publication,
                };
                result.document.close();
                await client.shutdown();
                client = undefined;
                return { status: 'succeeded', value: { hostId, requestId, batches, published } } as const;
              }
              const exports = [];
              for (const root of operation.roots) {
                const document = await client.openAssembly({ root });
                try {
                  // A different pin cannot borrow this document's admission or acquire native work.
                  let foreignPinDenied = false;
                  try {
                    await document.exportPublished({
                      format: 'step',
                      publishedAssembly: { root: { ...root, digest: foreignDigest } },
                    });
                  } catch (error) {
                    if (
                      !(error instanceof Error) ||
                      error.message !== "Published export must use this document's admitted root."
                    ) {
                      throw error;
                    }
                    foreignPinDenied = true;
                  }
                  if (!foreignPinDenied) {
                    throw new Error('Pinned document accepted a foreign root identity.');
                  }
                  const result = await document.exportPublished({ format: 'step', publishedAssembly: { root } });
                  if (!result.success || result.files.length !== 1) {
                    throw new Error('Actual source-free native export refused.');
                  }
                  const [file] = result.files;
                  exports.push({
                    root,
                    publication: document.admitted.publication,
                    name: file.name,
                    mimeType: file.mimeType,
                    bytes: [...file.bytes],
                    foreignPinDenied,
                  });
                } finally {
                  document.close();
                }
              }
              await client.shutdown();
              client = undefined;
              return { status: 'succeeded', value: { hostId, requestId, batches, exports } } as const;
            } catch (error) {
              return { status: 'failed', error } as const;
            } finally {
              globalThis.removeEventListener('message', onPort);
              try {
                await client?.shutdown();
              } catch (error) {
                cleanupErrors.push(error);
              }
              try {
                stopTelemetry?.();
              } catch (error) {
                cleanupErrors.push(error);
              }
            }
          })();
          if (outcome.status === 'failed') {
            if (cleanupErrors.length > 0) {
              console.warn('Actual native lease cleanup also failed.', { failureCount: cleanupErrors.length });
            }
            throw outcome.error;
          }
          if (cleanupErrors.length > 0) {
            throw new AggregateError(cleanupErrors, 'Actual native lease cleanup failed.');
          }
          return outcome.value;
        },
        {
          clientUrl,
          rendererUrl,
          projectRoot,
          operation,
          foreignDigest: contentDigest({ value: `sha256:${'0'.repeat(64)}`, name: 'foreign assembly root' }),
        },
      );
    const first = await runLease({
      type: 'publish',
      authoredPath: firstAuthoredPath,
      publicationPath: publicationPathFor(firstAuthoredPath),
    });
    if (!first.published) {
      throw new Error('First native lease returned no genuine publication.');
    }
    const { published: firstPin } = first;
    const reference = firstPin.partRecords['inspection'];
    const record = firstPin.publication.parts['inspection'];
    const variant = record?.variants['default'];
    if (!reference || !record || !variant?.exact) {
      throw new Error('Native producer has no admitted exact record.');
    }
    expect(Object.keys(firstPin.partRecords)).toEqual(['inspection']);
    expect(Object.keys(record.variants)).toEqual(['default']);
    expect(firstPin.publication.occurrences).toHaveLength(1);
    expect(firstPin.generation).toBe(1);
    expect(variant.source.files[sourcePath]).toBe(digest(originalSource));
    expect(variant.exact).toMatchObject({
      kernelId: 'replicad',
      provider: '@taucad/replicad',
      codec: 'replicad.native-handle-msgpack',
      codecVersion: '2',
      unit: 'millimeter',
      linearToleranceMm: 0,
      angularToleranceRad: 0,
    });
    const provider: unknown = JSON.parse(variant.exact.providerVersion);
    expect(provider).toMatchObject({
      wasmVariant: 'custom',
      kernelVersion: '1.4.2',
      assets: servedAssets.map(({ digest }) => digest),
    });
    const firstFiles = new Map<string, Uint8Array<ArrayBuffer>>();
    const retain = (asset: PublishedPartAsset): void => {
      const bytes = new Uint8Array(readFileSync(join(projectRoot, assertRootedPath(asset.path))));
      expect(bytes.byteLength).toBe(asset.byteLength);
      expect(digest(bytes)).toBe(asset.digest);
      firstFiles.set(asset.path, bytes);
    };
    retain(firstPin.root);
    const recordBytes = new Uint8Array(readFileSync(join(projectRoot, reference.path)));
    expect(digest(recordBytes)).toBe(reference.digest);
    expect(new TextDecoder().decode(recordBytes)).toBe(canonicalJson(firstPin.publication.parts['inspection']));
    firstFiles.set(reference.path, recordBytes);
    retain(variant.glb);
    retain(variant.exact.asset);
    writeFileSync(
      join(projectRoot, secondAuthoredPath),
      JSON.stringify({
        schemaVersion: 1,
        parts: { inspection: { publishedPart: reference } },
        occurrences: [{ id: 'inspection', part: 'inspection', transform: identity }],
      }),
      { flag: 'wx' },
    );
    const second = await runLease({
      type: 'publish',
      authoredPath: secondAuthoredPath,
      publicationPath: publicationPathFor(secondAuthoredPath),
    });
    if (!second.published) {
      throw new Error('Second assembly returned no genuine publication.');
    }
    expect(second.published.partRecords['inspection']).toEqual(reference);
    expect(second.published.generation).toBe(1);
    expect(second.published.publication.parts['inspection']).toEqual(firstPin.publication.parts['inspection']);
    expect(second.published.root.path).not.toBe(firstPin.root.path);
    const secondRootBytes = new Uint8Array(readFileSync(join(projectRoot, second.published.root.path)));
    expect(digest(secondRootBytes)).toBe(second.published.root.digest);
    expect(secondRootBytes.byteLength).toBe(second.published.root.byteLength);
    expect(areUint8ArraysEqual(new Uint8Array(readFileSync(join(projectRoot, sourcePath))), originalSource)).toBe(true);
    for (const path of [sourcePath, firstAuthoredPath, secondAuthoredPath]) {
      unlinkSync(join(projectRoot, path));
      expect(existsSync(join(projectRoot, path))).toBe(false);
    }
    const cachePath = join(projectRoot, '.tau/cache');
    rmSync(cachePath, { recursive: true, force: true });
    expect(existsSync(cachePath)).toBe(false);
    await page.context().setOffline(true);
    let consumer;
    try {
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);
      consumer = await runLease({ type: 'consume', roots: [firstPin.root, second.published.root] });
    } finally {
      await page.context().setOffline(false);
    }
    if (!consumer.exports) {
      throw new Error('Fresh source-free lease returned no native exports.');
    }
    const capture = await session.capture('native-authored-source-free');
    writeFileSync(join(capture, 'native-authored-leases.json'), JSON.stringify({ first, second, consumer }, null, 2));
    for (const [index, exported] of consumer.exports.entries()) {
      writeFileSync(join(capture, `native-authored-source-free-${index}.step`), new Uint8Array(exported.bytes));
    }
    expect(new Set([first.hostId, second.hostId, consumer.hostId]).size).toBe(3);
    expect(new Set([first.requestId, second.requestId, consumer.requestId]).size).toBe(3);
    expect(consumer.exports).toHaveLength(2);
    const sourceWorkNames = [
      'kernel.evaluate-model',
      'kernel.extract-params',
      'kernel.compute',
      'kernel.compute.reuse',
      'kernel.bundle',
      'kernel.mesh',
      'kernel.mesh-compute',
      'kernel.export-reheat',
    ];
    const counts = (batches: readonly TelemetryBatch[]): Record<string, number> => {
      const result: Record<string, number> = {};
      for (const batch of batches) {
        expect(batch.origin.instance.length).toBeGreaterThan(0);
        expect(batch.origin.label.length).toBeGreaterThan(0);
        expect(Number.isFinite(batch.epoch)).toBe(true);
        for (const entry of batch.entries) {
          expect(Number.isFinite(entry.workerTimeOrigin)).toBe(true);
          expect(Number.isFinite(entry.startTime)).toBe(true);
          expect(Number.isFinite(entry.duration)).toBe(true);
          result[entry.name] = (result[entry.name] ?? 0) + 1;
        }
      }
      return result;
    };
    const producerCounts = counts(first.batches);
    const referenceCounts = counts(second.batches);
    const consumerCounts = counts(consumer.batches);
    expect(first.batches.length).toBeGreaterThan(0);
    expect(second.batches.length).toBeGreaterThan(0);
    expect(consumer.batches.length).toBeGreaterThan(0);
    expect(producerCounts['kernel.evaluate-model']).toBeGreaterThan(0);
    expect(producerCounts['kernel.mesh']).toBeGreaterThan(0);
    const publicationSpans = first.batches
      .flatMap(({ entries }) => entries)
      .filter(({ name, detail }) => name === 'kernel.render' && detail?.['file'] === firstAuthoredPath);
    expect(publicationSpans).toHaveLength(1);
    expect(typeof publicationSpans.at(0)?.detail?.['spanId']).toBe('string');
    for (const name of sourceWorkNames) {
      expect(referenceCounts[name] ?? 0, `pinned-reference source work: ${name}`).toBe(0);
      expect(consumerCounts[name] ?? 0, `source-free consumer work: ${name}`).toBe(0);
    }
    const stepBodies: string[] = [];
    for (const exported of consumer.exports) {
      expect(exported.publication.parts['inspection']).toEqual(firstPin.publication.parts['inspection']);
      expect(exported.name).toBe('assembly');
      expect(exported.mimeType).toBe('application/step');
      const bytes = new Uint8Array(exported.bytes);
      const text = new TextDecoder().decode(bytes);
      expect(text).toContain('ISO-10303-21');
      expect(text).toContain('DATA;');
      stepBodies.push(text.slice(text.indexOf('DATA;')));
    }
    // Preserve reached native inputs even when the STEP comparison assertion fails.
    const closure: BrowserClosure = {
      root: firstPin.root,
      publication: firstPin.publication,
      partRecords: firstPin.partRecords,
      files: [...firstFiles].map(([path, bytes]) => ({
        path,
        digest: digest(bytes),
        byteLength: bytes.byteLength,
        base64: uint8ArrayToBase64(bytes),
      })),
      servedAssets,
      sourceFree: { removed: [sourcePath, firstAuthoredPath] },
    };
    writeFileSync(join(capture, 'native-authored-closure.json'), JSON.stringify(closure, null, 2));
    writeFileSync(
      join(capture, 'native-authored-leases.json'),
      JSON.stringify(
        {
          first,
          second,
          consumer,
          producerCounts,
          referenceCounts,
          consumerCounts,
          stepComparisonEvidence: consumer.exports.map((exported, index) => ({
            fullStepSha256: digest(new Uint8Array(exported.bytes)),
            generatedUsageIdHashes: [
              ...stepBodies[index]!.matchAll(/^#[1-9]\d*\s*=\s*NEXT_ASSEMBLY_USAGE_OCCURRENCE\('([^']*)'(?=,)/gmu),
            ].map((match) => digest(new TextEncoder().encode(match[1]))),
            rawDataEqualToFirst: stepBodies[index] === stepBodies[0],
            comparisonRule:
              'Only generated positive-decimal NAUO argument zero is excluded; every other literal DATA byte is retained.',
          })),
          qualification: {
            capturePhase: 'before-step-comparison',
            stepComparisonAssertion: 'not-yet-evaluated',
            postExportProjectByteChecks: 'not-yet-evaluated',
            nativeLeaseReleaseChecks: 'not-yet-evaluated',
            successfulCaseClaimed: false,
          },
          sourceRemoved: [sourcePath, firstAuthoredPath, secondAuthoredPath],
          denominators: {
            assemblyFiles: 2,
            sharedPartRecords: 1,
            variants: 1,
            occurrencesPerAssembly: 1,
            sourceComponents: 3,
            measurableSolids: 2,
            openFaces: 1,
            nativeStepFiles: 2,
          },
          limits:
            'Completed outer source work is counted separately from initialization/restoration. Inner native restoration counts and independent NEW STEP geometry/unit/density readback remain separate gates; no zero-native-work or pixel/performance claim.',
        },
        null,
        2,
      ),
    );
    expect(sameStepDataExceptGeneratedUsageIds(stepBodies[0]!, stepBodies[1]!)).toBe(true);
    for (const [path, bytes] of firstFiles) {
      expect(areUint8ArraysEqual(new Uint8Array(readFileSync(join(projectRoot, path))), bytes)).toBe(true);
    }
    expect(
      areUint8ArraysEqual(new Uint8Array(readFileSync(join(projectRoot, second.published.root.path))), secondRootBytes),
    ).toBe(true);
    const { logPath } = session;
    for (const hostId of [first.hostId, second.hostId, consumer.hostId]) {
      await expect
        .poll(() =>
          readFileSync(logPath, 'utf8')
            .split('\n')
            .some((line) => {
              const separator = ' kernel.exit ';
              const index = line.indexOf(separator);
              if (index === -1) {
                return false;
              }
              const exit: unknown = JSON.parse(line.slice(index + separator.length));
              return (
                exit !== null &&
                typeof exit === 'object' &&
                'hostId' in exit &&
                exit.hostId === hostId &&
                'released' in exit &&
                exit.released === true
              );
            }),
        )
        .toBe(true);
    }
  },
);

// This separate trusted-main fixture proves missing publication authority, not the product resolver's policy.
test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64' || packaged)(
  '[unpackaged-utility-control] should reopen the exact browser pin without a publication writer and deny authored publication',
  async () => {
    const artifact = process.env['TAU_E2E_BROWSER_PHYSICAL_CLOSURE'];
    if (!artifact?.startsWith('/')) {
      throw new Error('Actual missing-writer control requires the absolute browser closure artifact.');
    }
    const closure = JSON.parse(readFileSync(artifact, 'utf8')) as BrowserClosure;
    const files = preflight(closure);
    const workspace = resolve(import.meta.dirname, '../../..');
    const resourceRoot = join(workspace, 'apps/ui/desktop/build/host-assets/engines/replicad/density-single-v1');
    expect(closure.servedAssets.map(({ name }) => name)).toEqual(['replicad_single.wasm', 'replicad_single.mjs']);
    for (const asset of closure.servedAssets) {
      const bytes = new Uint8Array(readFileSync(join(resourceRoot, asset.name)));
      expect(bytes.byteLength).toBe(asset.byteLength);
      expect(digest(bytes)).toBe(asset.digest);
    }
    const directory = mkdtempSync(join(tmpdir(), 'tau-published-pin-missing-writer-'));
    const projectRoot = join(directory, 'project');
    const helperPath = join(directory, 'desktop-readonly-utility.cjs');
    const ordinaryPath = 'ordinary/read-control.txt';
    const ordinaryText = 'Ordinary evaluator read control: τ\n';
    const ordinaryBytes = new TextEncoder().encode(ordinaryText);
    const ordinary = {
      path: ordinaryPath,
      text: ordinaryText,
      digest: digest(ordinaryBytes),
      byteLength: ordinaryBytes.byteLength,
    };
    let primaryError: unknown;
    let primaryFailed = false;
    const cleanupErrors: unknown[] = [];
    try {
      mkdirSync(projectRoot);
      for (const [path, bytes] of files) {
        const destination = join(projectRoot, path);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, bytes, { flag: 'wx' });
      }
      expect(files.has(ordinaryPath)).toBe(false);
      expect(closure.sourceFree.removed).not.toContain(ordinaryPath);
      mkdirSync(join(projectRoot, 'ordinary'));
      writeFileSync(join(projectRoot, ordinaryPath), ordinaryBytes, { flag: 'wx' });
      for (const path of closure.sourceFree.removed) {
        expect(existsSync(join(projectRoot, path))).toBe(false);
      }
      // Test-only loader packaging; the actual kernel host is the CURRENT desktop build, not this helper.
      await build({
        entryPoints: [resolve(import.meta.dirname, 'support/desktop-readonly-utility.ts')],
        outfile: helperPath,
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node24',
        external: ['electron'],
      });
      const desktopEnvironment: Record<string, string> = {};
      desktopEnvironment['TAU_DEBUG'] = 'true';
      desktopEnvironment['TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE'] = '1';
      const account = tauTestAccount('published-pin-missing-writer');
      seededEmail = account.email;
      const token = await seedTauTestUser(account);
      session = await launchDesktopApp({ packaged: false, env: desktopEnvironment, token });
      const options = {
        entry: join(workspace, 'apps/desktop/dist/main/kernel-host.js'),
        projectRoot,
        root: closure.root,
        assets: closure.files.map(({ path, digest, byteLength }) => ({ path, digest, byteLength })),
        ordinary,
        resourceRoot,
        pythonRoot: join(workspace, 'apps/desktop/resources/python'),
        picoGkRoot: join(workspace, 'apps/desktop/resources/picogk'),
        apiUrl: 'http://localhost:4014',
        webSocketUrl: 'ws://localhost:4014',
      };
      // Node's builtin module loader avoids Vite rewriting and Electron eval's missing dynamic-import callback.
      const result = await session.application.evaluate<unknown>(`(async () => {
        const module = globalThis.process.getBuiltinModule('module');
        if (!module || typeof module.createRequire !== 'function') {
          throw new Error('Trusted Node main has no builtin module loader.');
        }
        const loadHelper = module.createRequire(${JSON.stringify(pathToFileURL(helperPath).href)});
        const helper = loadHelper(${JSON.stringify(helperPath)});
        if (!helper || typeof helper !== 'object' || typeof helper.runMissingWriterUtility !== 'function') {
          throw new Error('Compiled public-helper fixture has no callable utility control.');
        }
        return await Reflect.apply(helper.runMissingWriterUtility, undefined, [${JSON.stringify(options)}]);
      })()`);
      expect(result).toMatchObject({
        root: closure.root,
        admittedPublication: closure.publication,
        evaluatorWritable: true,
        publicationPortTransferred: false,
        assetBytesUnchanged: true,
        agentProtectedWriteDenied: true,
        ordinaryRead: {
          path: ordinary.path,
          digest: ordinary.digest,
          byteLength: ordinary.byteLength,
          unchanged: true,
        },
        publication: { status: 'invalid' },
        exact: closure.publication.parts['inspection']!.variants['default']!.exact,
      });
      if (!result || typeof result !== 'object' || !('stepBase64' in result) || typeof result.stepBase64 !== 'string') {
        throw new Error('Actual utility returned no STEP bytes.');
      }
      const bytes = base64ToUint8Array(result.stepBase64);
      expect(new TextDecoder().decode(bytes)).toContain('ISO-10303-21');
      for (const [path, original] of files) {
        expect(areUint8ArraysEqual(new Uint8Array(readFileSync(join(projectRoot, path))), original)).toBe(true);
      }
      for (const path of closure.sourceFree.removed) {
        expect(existsSync(join(projectRoot, path))).toBe(false);
      }
      expect(areUint8ArraysEqual(new Uint8Array(readFileSync(join(projectRoot, ordinaryPath))), ordinaryBytes)).toBe(
        true,
      );
      const capture = await session.capture('browser-pin-missing-writer-actual-utility');
      writeFileSync(join(capture, 'public-helper.cjs'), readFileSync(helperPath));
      writeFileSync(join(capture, 'public-helper.sha256'), digest(new Uint8Array(readFileSync(helperPath))));
      writeFileSync(join(capture, 'missing-writer-utility.json'), JSON.stringify(result, null, 2));
      writeFileSync(join(capture, 'browser-pin-missing-writer.step'), bytes);
    } catch (error) {
      primaryFailed = true;
      primaryError = error;
    } finally {
      try {
        await session?.close();
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        session = undefined;
      }
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (primaryFailed) {
      if (cleanupErrors.length > 0) {
        console.warn('Actual utility fixture cleanup also failed', cleanupErrors);
      }
      throw primaryError;
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Actual utility fixture cleanup failed.');
    }
  },
);
