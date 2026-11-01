#!/usr/bin/env node

/**
 * Purpose: Inventory desktop payloads and reject CAD execution in the renderer.
 * Why: Client and utility builds are separate graphs; both need byte-level checks.
 * Environment: None required. Paths default to this checkout's desktop build.
 * Usage: pnpm nx run desktop:check-renderer-payload --args='[--report-only] [--app PATH] [--archive PATH] [--output PATH] [--source-revision REV]'
 * Exit codes: 0 for a valid inventory, 1 for invalid arguments or an ownership violation.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { extractFile, listPackage, statFile } from '@electron/asar';
import { parseAstAsync } from 'rolldown/parseAst';

type PayloadScope = 'renderer' | 'host' | 'app' | 'asar' | 'archive';
type PayloadFile = {
  scope: PayloadScope;
  path: string;
  bytes: number;
  allocatedBytes: number;
  sha256: string;
  kind: 'wasm' | 'native' | 'javascript' | 'map' | 'other';
  group: string;
};

type ModuleChunk = { fileName: string; moduleIds: string[]; imports: string[]; forwardingOnly: boolean };
type ModuleAsset = { fileName: string; sourcePath: string; sha256: string };

/** Physical files and emitted ownership evidence, with ASAR counted once. */
export type PayloadInventory = {
  files: PayloadFile[];
  chunks: ModuleChunk[];
  assets: ModuleAsset[];
  graphManifests: string[];
  violations: string[];
  totals: Record<string, { bytes: number; allocatedBytes: number; files: number }>;
};

// Renderer-owned WASM: the KCL editor, the viewer's Clipper section caps and the desktop Terminal's VT engine
// (`@aurigax-ai/ghostty-web`, declared by `apps/ui`). None of them runs CAD.
const allowedWasm = /^(?:kcl_wasm_lib_bg|clipper2z|ghostty-vt)(?:-[\w-]+)?\.wasm$/u;
const approvedWasmProducers = [
  { specifier: '@taucad/kcl-wasm-lib/kcl.wasm', manifest: 'package.json' },
  { specifier: 'clipper2-wasm/dist/es/clipper2z.wasm', manifest: 'package.json' },
  { specifier: '@aurigax-ai/ghostty-web/ghostty-vt.wasm', manifest: 'apps/ui/package.json' },
] as const;
/*
 * JavaScript that writes WASM bytes itself. ghostty-web builds an import-and-re-export trampoline module from a byte
 * array literal (`lib/abi.ts` `trampolineBytes`) to put JavaScript callbacks in libghostty-vt's function table; it
 * carries no code section. A chunk is classified only when every module in it comes from the installed package next to
 * `anchor` (resolved from its owning manifest) and its only marker is that byte-array header: base64 or data-URL WASM
 * stays a violation even there.
 */
const embeddedWasmProducers = [
  { anchor: '@aurigax-ai/ghostty-web/ghostty-vt.wasm', manifest: 'apps/ui/package.json' },
] as const;
/*
 * Editor language servers built in this repository from pinned toolchains rather than installed from a package:
 * `csharp-language:prepare` (Roslyn on the .NET browser-wasm runtime) and `openscad-language:prepare` (Rust and
 * tree-sitter). Each writes a stage with a content manifest, and the UI's asset plugin emits exactly those bytes at a
 * path derived from the manifest. A renderer file at one of those paths is admitted only when its bytes match the
 * manifest entry, and the manifest entry matches the staged file, so the stage is the producer provenance. The emitted
 * JavaScript of the .NET runtime (`dotnet.js` and its native loader) is covered the same way: it is the runtime's own
 * loader, so it is not in the module graph. Paths mirror `apps/ui/{csharp,openscad}-language-assets.vite-plugin.ts`.
 */
export type StagedLanguageServers = { csharp?: string; openscad?: string };
const defaultStagedLanguageServers = (workspaceRoot: string): StagedLanguageServers => ({
  csharp: resolve(workspaceRoot, 'out/csharp-language/stage'),
  openscad: resolve(workspaceRoot, 'out/openscad-language/stage'),
});
const stagedManifestName = 'assets-manifest.json';
const isStagedPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[\w./-]+$/u.test(value) &&
  value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
type StagedEntry = { path?: unknown; sha256?: unknown; byteLength?: unknown };

/** Map each emitted renderer path of a staged language server to the sha256 its stage manifest records. */
const readStagedLanguageServers = async (
  stages: StagedLanguageServers,
): Promise<{ files: Map<string, string>; wasmBytes: number; violations: string[] }> => {
  const files = new Map<string, string>();
  const violations: string[] = [];
  let wasmBytes = 0;
  const digest = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
  const readManifest = async (
    stage: string,
  ): Promise<{ bytes: Uint8Array<ArrayBuffer>; value: unknown } | undefined> => {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = Uint8Array.from(await readFile(resolve(stage, stagedManifestName)));
    } catch {
      return undefined;
    }
    try {
      return { bytes, value: JSON.parse(Buffer.from(bytes).toString()) as unknown };
    } catch {
      violations.push(`Staged language server manifest is not JSON: ${stage}`);
      return undefined;
    }
  };
  // Admit one staged file at its emitted path, only when the staged bytes still match the manifest.
  const admit = async (
    stage: string,
    entry: StagedEntry,
    emittedPath: (path: string, sha256: string) => string,
  ): Promise<boolean> => {
    if (!isStagedPath(entry.path) || typeof entry.sha256 !== 'string' || typeof entry.byteLength !== 'number') {
      violations.push(`Staged language server manifest lists an invalid file: ${stage}`);
      return false;
    }
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = Uint8Array.from(await readFile(resolve(stage, entry.path)));
    } catch {
      violations.push(`Staged language server file is missing: ${stage}/${entry.path}`);
      return false;
    }
    if (bytes.byteLength !== entry.byteLength || digest(bytes) !== entry.sha256) {
      violations.push(`Staged language server file does not match its manifest: ${stage}/${entry.path}`);
      return false;
    }
    files.set(emittedPath(entry.path, entry.sha256), entry.sha256);
    if (entry.path.endsWith('.wasm')) {
      wasmBytes += bytes.byteLength;
    }
    return true;
  };
  if (stages.csharp) {
    const manifest = await readManifest(stages.csharp);
    if (manifest) {
      const value = manifest.value as
        | { format?: unknown; bootstrap?: unknown; references?: unknown; files?: unknown }
        | undefined;
      const listed = Array.isArray(value?.files) ? (value.files as StagedEntry[]).map((entry) => entry.path) : [];
      // The shape the UI asset plugin accepts: a bootstrap and a reference bundle, both among the listed files.
      if (
        value?.format !== 'tau-csharp-language-v1' ||
        listed.length === 0 ||
        !isStagedPath(value.bootstrap) ||
        !isStagedPath(value.references) ||
        !listed.includes(value.bootstrap) ||
        !listed.includes(value.references)
      ) {
        violations.push(`Staged C# language server manifest is invalid: ${stages.csharp}`);
      } else {
        const identity = digest(manifest.bytes);
        const prefix = `csharp-language/${identity}/`;
        // The plugin emits the staged manifest unchanged; its digest names the directory.
        files.set(`${prefix}${stagedManifestName}`, identity);
        for (const entry of value.files as StagedEntry[]) {
          // oxlint-disable-next-line no-await-in-loop -- one staged file's bytes at a time.
          await admit(stages.csharp, entry, (path) => `${prefix}${path}`);
        }
      }
    }
  }
  if (stages.openscad) {
    const manifest = await readManifest(stages.openscad);
    if (manifest) {
      const value = manifest.value as { format?: unknown; module?: StagedEntry } | undefined;
      if (value?.format !== 'tau-openscad-language-v1' || value.module === undefined) {
        violations.push(`Staged OpenSCAD language server manifest is invalid: ${stages.openscad}`);
      } else {
        const { module } = value;
        let moduleName = '';
        const admitted = await admit(stages.openscad, module, (path, sha256) => {
          moduleName = `${basename(path, '.wasm')}-${sha256.slice(0, 16)}.wasm`;
          return `assets/${moduleName}`;
        });
        if (admitted) {
          // The plugin serves the manifest rewritten to name the emitted module, under that manifest's digest.
          const served = digest(
            new TextEncoder().encode(JSON.stringify({ ...value, module: { ...module, path: moduleName } })),
          );
          files.set(`assets/openscad-language-${served.slice(0, 16)}.json`, served);
        }
      }
    }
  }
  return { files, wasmBytes, violations };
};
const embeddedWasmMarker = /(?:AGFzbQ|data:application\/wasm|\\x00asm|0,97,115,109)/u;
const encodedWasmMarker = /(?:AGFzbQ|data:application\/wasm|\\x00asm)/u;
const browserExecutionEntry =
  /(?:^|\/)(?:runtime(?:-debug)?|converter-runtime|image-runtime|agent-host|geospec-runner)\.worker(?:[-.]|$)/u;
const nativeMagic = new Set([
  'cffaedfe',
  'cefaedfe',
  'feedfacf',
  'feedface',
  'cafebabe',
  'bebafeca',
  'cafebabf',
  'bfbafeca',
  '7f454c46',
]);

const graphFileName = /(?:^|\/)tau-module-graph(?:-[\w-]+)?\.json$/u;
const isBuildDiagnostic = (path: string): boolean => path.endsWith('.map') || graphFileName.test(path);

// React Router writes this JSON assignment after Vite's generateBundle hook.
// Verify its complete grammar and content fingerprint, not only the filename.
const isReactRouterManifest = (path: string, source: string): boolean => {
  const file = /^assets\/manifest-([a-f0-9]{8})\.js$/u.exec(path);
  const assignment = /^window\.__reactRouterManifest=(\{.*\});\s*$/su.exec(source);
  if (!file || !assignment) {
    return false;
  }
  try {
    const value: unknown = JSON.parse(assignment[1]!);
    if (!value || typeof value !== 'object' || !('entry' in value) || !('routes' in value)) {
      return false;
    }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ entry: value.entry, routes: value.routes }))
      .digest('hex')
      .slice(0, 8);
    return (
      fingerprint === file[1] &&
      'version' in value &&
      value.version === fingerprint &&
      'url' in value &&
      value.url === `/${path}`
    );
  } catch {
    return false;
  }
};

// Renderer data assets are not execution payloads. Inspect signatures before
// decoding text; filenames alone must not bless renamed binary content.
const isUnclassifiedBinary = (content: Uint8Array<ArrayBuffer>): boolean => {
  const header = Buffer.from(content.subarray(0, 12));
  const magic = header.subarray(0, 4).toString('hex');
  if (
    [
      '89504e47',
      '47494638',
      '00000100',
      '774f4646',
      '774f4632',
      '00010000',
      '4f54544f',
      '74746366',
      '676c5446',
    ].includes(magic) ||
    magic.startsWith('ffd8ff') ||
    (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') ||
    header.toString('ascii', 4, 8) === 'ftyp'
  ) {
    return false;
  }
  try {
    // oxlint-disable-next-line no-control-regex -- binary classification intentionally detects non-text control bytes.
    return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(new TextDecoder('utf-8', { fatal: true }).decode(content));
  } catch {
    return true;
  }
};

/** Identify implementation modules, while retaining pure editor/image contracts. */
export const isRendererExecutionModule = (moduleId: string): boolean => {
  const path = moduleId.replaceAll('\\', '/');
  if (/packages\/plugins\/image\/src\/(?:nanoraster-camera|image-label|label)\.ts$/u.test(path)) {
    return false;
  }
  // Print viewer data: G-code and 3MF parsing, sparse settings schemas and plate
  // descriptors. None of them load a kernel, a worker or WASM.
  if (
    /packages\/plugins\/(?:slicer\/src\/(?:toolpath|container|hashes|preferences|slicer-options)|bambu\/src\/bambu\.(?:plate|settings))\.ts$/u.test(
      path,
    )
  ) {
    return false;
  }
  if (
    /packages\/runtime\/src\/(?:client\/runtime-document-client-core|framework\/(?:runtime-framework\.constants|runtime-operation-errors)|plugins\/plugin-types)\.ts$/u.test(
      path,
    )
  ) {
    return false;
  }
  if (/node_modules\/nanoraster\/dist\/(?:options|render-error)\.mjs$/u.test(path)) {
    return false;
  }
  return (
    /apps\/ui\/app\/(?:runtime\/(?:ui-runtime\.definition|.*\.worker)|workers\/(?:agent-host\.impl|geospec-runner\.impl)|constants\/kernel-worker\.constants)/u.test(
      path,
    ) ||
    /apps\/libs\/converter\/src\/(?:runtime|index)\.[cm]?[jt]s/u.test(path) ||
    /packages\/runtime\/src\/(?:framework|worker|plugins)\//u.test(path) ||
    /packages\/plugins\/[^/]+\/src\//u.test(path) ||
    /packages\/plugins\/image\/src\/(?:image-backend|image\.transcoder|svg(?:-renderer|\.transcoder)?|resvg)/u.test(
      path,
    ) ||
    /(?:node_modules\/|\.pnpm\/)(?:[^/]*\/node_modules\/)?(?:@taulabs\/openrscad-engine|libassimp|nanoraster\/dist\/(?:renderer|native|wasm|create|render)|@resvg\/resvg-wasm|esbuild-wasm)/u.test(
      path,
    )
  );
};

/** Web document, marketing, consent and session-replay modules forbidden in Electron. */
export const isForbiddenDesktopSurfaceModule = (moduleId: string): boolean => {
  const path = moduleId.replaceAll('\\', '/');
  return (
    /apps\/ui\/app\/root\.tsx(?:\?|$)/u.test(path) ||
    /apps\/ui\/app\/components\/(?:build-skew-banner|cookie-consent|layout\/(?:page-footer|route-footer))\.tsx(?:\?|$)/u.test(
      path,
    ) ||
    /apps\/ui\/app\/(?:hooks\/use-cookie-consent|lib\/cookie-consent\.lib|lib\/web-posthog\.lib|providers\/web-analytics-provider)\.tsx?(?:\?|$)/u.test(
      path,
    ) ||
    /apps\/ui\/app\/(?:offline\/|routes\/legal(?:\.|\/)|routes\/_index\/(?:route|legacy-landing|marketing-landing)\.tsx(?:\?|$))/u.test(
      path,
    ) ||
    /* Desktop runs PostHog analytics but never session replay, so its recorder must not ship. */
    /(?:node_modules\/|\.pnpm\/)(?:[^/]+\/node_modules\/)?(?:rrweb|@rrweb\/[^/]+)(?:\/|$)/u.test(path)
  );
};

const payloadGroup = (scope: PayloadScope, path: string): string => {
  if (scope === 'asar') {
    return 'asar-logical';
  }
  if (scope !== 'app') {
    return scope;
  }
  if (path.includes('TauQuickLookPreview.appex/')) {
    return 'quick-look-preview';
  }
  if (path.includes('TauQuickLookThumbnail.appex/')) {
    return 'quick-look-thumbnail';
  }
  if (path.includes('/Resources/python/')) {
    return 'python';
  }
  if (path.includes('/Resources/picogk/')) {
    return 'dotnet';
  }
  if (path.includes('/Resources/ui/')) {
    return 'packaged-ui';
  }
  if (path.includes('/app.asar.unpacked/')) {
    return 'asar-unpacked';
  }
  if (path.endsWith('/app.asar')) {
    return 'asar';
  }
  return 'app-shell';
};

const fileKind = (path: string, bytes: Uint8Array<ArrayBuffer>): PayloadFile['kind'] => {
  const magic = Buffer.from(bytes.subarray(0, 4)).toString('hex');
  if (magic === '0061736d' || path.endsWith('.wasm')) {
    return 'wasm';
  }
  if (nativeMagic.has(magic) || magic.startsWith('4d5a') || /\.(?:node|dylib|dll|so)$/u.test(path)) {
    return 'native';
  }
  if (/\.[cm]?js$/u.test(path)) {
    return 'javascript';
  }
  return path.endsWith('.map') ? 'map' : 'other';
};

const maxInflatedBytes = 256 * 1024 * 1024;
const maxGzipLayers = 4;
const wasmPreamble = Buffer.from('0061736d01000000', 'hex');
const isGzip = (bytes: Uint8Array<ArrayBuffer>): boolean => bytes[0] === 0x1f && bytes[1] === 0x8b;

// Gzip is a transport encoding, not a content type: inflate it within a bound
// and refuse inner WASM, native code or archives. Other inner bytes are data.
const compressedPayloadViolation = (path: string, content: Uint8Array<ArrayBuffer>): string | undefined => {
  let inner: Uint8Array<ArrayBuffer> = content;
  for (let layer = 0; isGzip(inner); layer += 1) {
    if (layer === maxGzipLayers) {
      return `Unreadable compressed payload in renderer: ${path}`;
    }
    try {
      inner = Uint8Array.from(gunzipSync(inner, { maxOutputLength: maxInflatedBytes }));
    } catch {
      return `Unreadable compressed payload in renderer: ${path}`;
    }
  }
  const view = Buffer.from(inner.buffer, inner.byteOffset, inner.byteLength);
  const kind = fileKind('', Uint8Array.from(view.subarray(0, 4)));
  const archive = view.toString('hex', 0, 4) === '504b0304' || view.toString('ascii', 257, 262) === 'ustar';
  if (kind === 'wasm' || kind === 'native' || archive || view.includes(wasmPreamble)) {
    return `Compressed executable or archive in renderer: ${path}`;
  }
  return undefined;
};

const readGraph = (content: string): { chunks: ModuleChunk[]; assets: ModuleAsset[] } => {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== 'object' || !('chunks' in value) || !Array.isArray(value.chunks)) {
    throw new TypeError('Invalid desktop module graph: expected chunks');
  }
  const readEntries = (entries: unknown[]): ModuleChunk[] =>
    entries.map((chunk: unknown) => {
      if (
        !chunk ||
        typeof chunk !== 'object' ||
        !('fileName' in chunk) ||
        typeof chunk.fileName !== 'string' ||
        !('moduleIds' in chunk) ||
        !Array.isArray(chunk.moduleIds) ||
        !chunk.moduleIds.every((id: unknown) => typeof id === 'string')
      ) {
        throw new TypeError('Invalid desktop module graph chunk');
      }
      const imports: unknown = 'imports' in chunk ? chunk.imports : [];
      const forwardingOnly: unknown = 'forwardingOnly' in chunk ? chunk.forwardingOnly : false;
      if (
        !Array.isArray(imports) ||
        !imports.every((fileName: unknown) => typeof fileName === 'string') ||
        typeof forwardingOnly !== 'boolean'
      ) {
        throw new TypeError('Invalid desktop module graph forwarding metadata');
      }
      return {
        fileName: chunk.fileName,
        moduleIds: chunk.moduleIds,
        imports,
        forwardingOnly,
      };
    });
  const assets = ('assets' in value && Array.isArray(value.assets) ? value.assets : []).map((asset: unknown) => {
    if (
      !asset ||
      typeof asset !== 'object' ||
      !('fileName' in asset) ||
      typeof asset.fileName !== 'string' ||
      !('sourcePath' in asset) ||
      typeof asset.sourcePath !== 'string' ||
      !('sha256' in asset) ||
      typeof asset.sha256 !== 'string'
    ) {
      throw new TypeError('Invalid desktop module graph asset');
    }
    return { fileName: asset.fileName, sourcePath: asset.sourcePath.replaceAll('\\', '/'), sha256: asset.sha256 };
  });
  return {
    chunks: readEntries(value.chunks),
    assets,
  };
};

const inspectForwardingChunk = async (options: {
  rendererRoot: string;
  chunk: ModuleChunk;
  rendererJs: ReadonlySet<string>;
}): Promise<{ forwardingOnly: boolean; imports: string[] }> => {
  const { rendererRoot, chunk, rendererJs } = options;
  if (!rendererJs.has(chunk.fileName)) {
    return { forwardingOnly: false, imports: [] };
  }
  try {
    const source = await readFile(resolve(rendererRoot, chunk.fileName), 'utf8');
    const { body } = await parseAstAsync(source);
    const forwardingOnly = body.every(
      (statement) =>
        statement.type === 'ImportDeclaration' ||
        statement.type === 'ExportAllDeclaration' ||
        (statement.type === 'ExportNamedDeclaration' && statement.declaration === null),
    );
    const imports = body
      .flatMap((statement) =>
        'source' in statement && statement.source?.value && typeof statement.source.value === 'string'
          ? [statement.source.value]
          : [],
      )
      .map((importPath) =>
        importPath.startsWith('.')
          ? relative(rendererRoot, resolve(rendererRoot, dirname(chunk.fileName), importPath)).replaceAll('\\', '/')
          : importPath,
      );
    return { forwardingOnly, imports };
  } catch {
    return { forwardingOnly: false, imports: [] };
  }
};

/** Inventory files without traversing symlinks, and collect renderer violations. */
// oxlint-disable-next-line complexity -- one bounded pass classifies each payload boundary and its cross-scope invariants.
export const inspectDesktopPayload = async (options: {
  renderer: string;
  host: string;
  app?: string;
  archive?: string;
  /** Language server stages; defaults to this checkout's `out/` stages. */
  stagedLanguageServers?: StagedLanguageServers;
}): Promise<PayloadInventory> => {
  const workspaceRoot = resolve(import.meta.dirname, '../../..');
  const inventory: PayloadInventory = {
    files: [],
    chunks: [],
    assets: [],
    graphManifests: [],
    violations: [],
    totals: {},
  };
  const require = createRequire(import.meta.url);
  const approvedWasm = new Map<string, string>();
  const embeddedWasm: Array<{ path: string; encoded: boolean }> = [];
  const embeddedWasmPackages = embeddedWasmProducers.map(({ anchor, manifest }) => {
    const anchorPath = realpathSync(createRequire(resolve(workspaceRoot, manifest)).resolve(anchor));
    return `${relative(workspaceRoot, dirname(anchorPath)).replaceAll('\\', '/')}/`;
  });
  // Each producer resolves from the manifest that declares it, so provenance is the installed, pinned copy.
  const approvedWasmSizes = await Promise.all(
    approvedWasmProducers.map(async ({ specifier, manifest }) => {
      const sourcePath = realpathSync(createRequire(resolve(workspaceRoot, manifest)).resolve(specifier)).replaceAll(
        '\\',
        '/',
      );
      const content = await readFile(sourcePath);
      approvedWasm.set(sourcePath, createHash('sha256').update(content).digest('hex'));
      return content.byteLength;
    }),
  );
  // The budget is one copy of each approved producer at its installed version:
  // a KCL upgrade moves it, while a second copy still exceeds it.
  const staged = await readStagedLanguageServers(
    options.stagedLanguageServers ?? defaultStagedLanguageServers(workspaceRoot),
  );
  inventory.violations.push(...staged.violations);
  // Renderer paths whose bytes matched a language server's stage manifest.
  const stagedAdmitted = new Set<string>();
  const approvedWasmBytes = approvedWasmSizes.reduce((total, bytes) => total + bytes, 0) + staged.wasmBytes;
  // oxlint-disable-next-line complexity, max-params -- hot file-walk callback avoids allocating a second descriptor for every payload entry.
  const recordContent = (
    scope: PayloadScope,
    path: string,
    content: Uint8Array<ArrayBuffer>,
    bytes: number,
    allocatedBytes: number,
  ): void => {
    const kind = fileKind(path, content);
    const sha256 = createHash('sha256').update(content).digest('hex');
    inventory.files.push({
      scope,
      path,
      bytes,
      allocatedBytes,
      sha256,
      kind,
      group: payloadGroup(scope, path),
    });
    if (scope !== 'renderer' && scope !== 'asar' && scope !== 'app') {
      return;
    }
    const rendererPath = path.replace(/^(?:resources\/ui\/client|Contents\/Resources\/ui\/client)\//u, '');
    if (scope !== 'renderer' && rendererPath === path) {
      return;
    }
    if (rendererPath === 'index.html') {
      const html = Buffer.from(content).toString();
      for (const marker of ['manifest.webmanifest', 'apple-mobile-web-app', 'application/ld+json']) {
        if (html.includes(marker)) {
          inventory.violations.push(`Web-only metadata in desktop HTML: ${marker}`);
        }
      }
    }
    const stagedSha256 = staged.files.get(rendererPath);
    if (stagedSha256 !== undefined) {
      if (stagedSha256 === sha256) {
        stagedAdmitted.add(rendererPath);
      } else {
        inventory.violations.push(`Renderer file differs from its language server stage: ${rendererPath}`);
      }
    }
    const admittedFromStage = stagedSha256 === sha256;
    if (kind === 'wasm' && !admittedFromStage && !allowedWasm.test(rendererPath.split('/').at(-1) ?? '')) {
      inventory.violations.push(`Renderer WASM is not editor/viewer-owned: ${rendererPath}`);
    }
    if (kind === 'wasm' && Buffer.from(content.subarray(0, 4)).toString('hex') !== '0061736d') {
      inventory.violations.push(`Invalid WASM header: ${rendererPath}`);
    }
    if (kind === 'native') {
      inventory.violations.push(`Native executable in renderer: ${rendererPath}`);
    }
    const gzipped = kind === 'other' && isGzip(content);
    const compressedViolation = gzipped ? compressedPayloadViolation(rendererPath, content) : undefined;
    if (compressedViolation) {
      inventory.violations.push(compressedViolation);
    }
    if (kind === 'other' && !gzipped && isUnclassifiedBinary(content)) {
      inventory.violations.push(`Unclassified binary in renderer: ${rendererPath}`);
    }
    if (browserExecutionEntry.test(rendererPath)) {
      inventory.violations.push(`Browser execution worker in renderer: ${rendererPath}`);
    }
    if (kind === 'javascript' && !admittedFromStage) {
      const source = Buffer.from(content).toString();
      if (embeddedWasmMarker.test(source)) {
        embeddedWasm.push({ path: rendererPath, encoded: encodedWasmMarker.test(source) });
      }
    }
    if (scope === 'renderer' && graphFileName.test(rendererPath)) {
      inventory.graphManifests.push(rendererPath);
      const graph = readGraph(Buffer.from(content).toString());
      inventory.chunks.push(...graph.chunks);
      inventory.assets.push(...graph.assets);
    }
    if (
      scope === 'renderer' &&
      kind === 'javascript' &&
      isReactRouterManifest(rendererPath, Buffer.from(content).toString())
    ) {
      inventory.chunks.push({
        fileName: rendererPath,
        moduleIds: ['@react-router/dev/vite:generated-manifest'],
        imports: [],
        forwardingOnly: false,
      });
    }
  };
  const collectFile = async (scope: PayloadScope, root: string, absolutePath: string): Promise<void> => {
    const stats = await lstat(absolutePath);
    if (!stats.isFile()) {
      return;
    }
    const path = relative(root, absolutePath).replaceAll('\\', '/');
    const content = Uint8Array.from(await readFile(absolutePath));
    recordContent(scope, path, content, stats.size, stats.blocks * 512);
  };
  const collectDirectory = async (scope: PayloadScope, root: string, directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      // Symlinks are deliberately not followed: native SDK links can point outside a package.
      if (entry.isDirectory()) {
        // oxlint-disable-next-line no-await-in-loop -- bounded-memory traversal of multi-gigabyte app payloads.
        await collectDirectory(scope, root, path);
      } else if (entry.isFile()) {
        // oxlint-disable-next-line no-await-in-loop -- retain only one file's bytes while hashing.
        await collectFile(scope, root, path);
      }
    }
  };
  await collectDirectory('renderer', options.renderer, options.renderer);
  await collectDirectory('host', options.host, options.host);
  if (options.app) {
    await collectDirectory('app', options.app, options.app);
    const asarPath = resolve(options.app, 'Contents/Resources/app.asar');
    try {
      for (const entry of listPackage(asarPath, { isPack: false })) {
        const path = entry.replace(/^\//u, '');
        const stats = statFile(asarPath, path, true);
        if ('files' in stats || 'link' in stats) {
          continue;
        }
        const content = Uint8Array.from(extractFile(asarPath, path));
        recordContent('asar', path, content, content.byteLength, 0);
      }
    } catch (error) {
      inventory.violations.push(
        `Packaged ASAR could not be inspected: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (options.archive) {
    await collectFile('archive', dirname(options.archive), options.archive);
  }
  const hostHashes = new Set(
    inventory.files
      .filter(
        (file) =>
          (file.scope === 'host' ||
            ((file.scope === 'app' || file.scope === 'asar') &&
              !['packaged-ui', 'quick-look-preview', 'quick-look-thumbnail'].includes(file.group))) &&
          file.kind === 'wasm',
      )
      .map((file) => file.sha256),
  );
  /* The KCL WASM is the one engine both sides own: the editor parses KCL in
   * the renderer, and the Zoo kernel host evaluates it. Any other shared hash
   * still means a kernel leaked into the renderer. */
  const kclWasmHash = approvedWasm.get(
    realpathSync(require.resolve('@taucad/kcl-wasm-lib/kcl.wasm')).replaceAll('\\', '/'),
  );
  for (const file of inventory.files) {
    if (
      file.scope === 'renderer' &&
      file.kind === 'wasm' &&
      hostHashes.has(file.sha256) &&
      file.sha256 !== kclWasmHash
    ) {
      inventory.violations.push(`Renderer/host WASM overlap: ${file.path} (${file.sha256})`);
    }
    if (file.scope === 'asar') {
      continue;
    }
    const key = `${file.scope}/${file.group}/${file.kind}`;
    const total = inventory.totals[key] ?? { bytes: 0, allocatedBytes: 0, files: 0 };
    total.bytes += file.bytes;
    total.allocatedBytes += file.allocatedBytes;
    total.files += 1;
    inventory.totals[key] = total;
  }
  if (options.app) {
    const looseRenderer = new Map(
      inventory.files.filter((file) => file.scope === 'renderer').map((file) => [file.path, file.sha256]),
    );
    const packagedRenderer = new Map(
      inventory.files
        .filter((file) => file.scope === 'app' && file.group === 'packaged-ui')
        .map((file) => [file.path.replace(/^Contents\/Resources\/ui\/client\//u, ''), file.sha256]),
    );
    for (const file of inventory.files.filter(
      (entry) => entry.scope === 'renderer' && !isBuildDiagnostic(entry.path),
    )) {
      if (packagedRenderer.get(file.path) !== file.sha256) {
        inventory.violations.push(`Packaged renderer differs from loose build: ${file.path}`);
      }
    }
    for (const [path, sha256] of packagedRenderer) {
      if (looseRenderer.get(path) !== sha256) {
        inventory.violations.push(`Packaged renderer has no matching loose build file: ${path}`);
      }
    }
  }
  // Independent worker builds can emit the same shared chunk or asset. Only
  // identical provenance is redundant; conflicting records remain failures.
  inventory.chunks = [...new Map(inventory.chunks.map((chunk) => [JSON.stringify(chunk), chunk])).values()];
  inventory.assets = [...new Map(inventory.assets.map((asset) => [JSON.stringify(asset), asset])).values()];
  for (const { path, encoded } of embeddedWasm) {
    const chunks = inventory.chunks.filter((chunk) => chunk.fileName === path);
    const classified =
      !encoded &&
      chunks.length > 0 &&
      chunks.every(
        (chunk) =>
          chunk.moduleIds.length > 0 &&
          embeddedWasmPackages.some((packageRoot) =>
            chunk.moduleIds.every((moduleId) => moduleId.replaceAll('\\', '/').startsWith(packageRoot)),
          ),
      );
    if (!classified) {
      inventory.violations.push(`Embedded WASM requires producer classification: ${path}`);
    }
  }
  for (const chunk of inventory.chunks) {
    for (const moduleId of chunk.moduleIds.filter(isRendererExecutionModule)) {
      inventory.violations.push(`Renderer execution module in ${chunk.fileName}: ${moduleId}`);
    }
    for (const moduleId of chunk.moduleIds.filter(isForbiddenDesktopSurfaceModule)) {
      inventory.violations.push(`Forbidden web surface in ${chunk.fileName}: ${moduleId}`);
    }
  }
  if (inventory.graphManifests.length === 0) {
    inventory.violations.push('Desktop emitted module graph is missing');
  }
  const rendererJs = new Set(
    inventory.files
      .filter((file) => file.scope === 'renderer' && file.kind === 'javascript' && !stagedAdmitted.has(file.path))
      .map((file) => file.path),
  );
  const chunkNames = inventory.chunks.map((chunk) => chunk.fileName);
  const chunkNameSet = new Set(chunkNames);
  if (inventory.chunks.length === 0) {
    inventory.violations.push('Desktop emitted module graph has no chunks');
  }
  if (new Set(chunkNames).size !== chunkNames.length) {
    inventory.violations.push('Desktop emitted module graph has duplicate chunks');
  }
  const forwardingEvidence = new Map(
    await Promise.all(
      inventory.chunks
        .filter((chunk) => chunk.moduleIds.length === 0)
        .map(
          async (chunk) =>
            [
              chunk.fileName,
              await inspectForwardingChunk({
                rendererRoot: options.renderer,
                chunk,
                rendererJs,
              }),
            ] as const,
        ),
    ),
  );
  for (const chunk of inventory.chunks) {
    if (chunk.moduleIds.length === 0) {
      const evidence = forwardingEvidence.get(chunk.fileName) ?? { forwardingOnly: false, imports: [] };
      const declaredImports = [...new Set(chunk.imports)].sort();
      const parsedImports = [...new Set(evidence.imports)].sort();
      if (
        !chunk.forwardingOnly ||
        !evidence.forwardingOnly ||
        JSON.stringify(declaredImports) !== JSON.stringify(parsedImports)
      ) {
        inventory.violations.push(`Desktop emitted module graph chunk has no modules: ${chunk.fileName}`);
      }
      for (const importedFileName of chunk.imports) {
        if (!chunkNameSet.has(importedFileName)) {
          inventory.violations.push(
            `Desktop forwarding chunk references uncovered import: ${chunk.fileName} -> ${importedFileName}`,
          );
        }
      }
    }
    if (!rendererJs.has(chunk.fileName)) {
      inventory.violations.push(`Desktop emitted module graph references missing chunk: ${chunk.fileName}`);
    }
  }
  for (const path of rendererJs) {
    if (!chunkNames.includes(path)) {
      inventory.violations.push(`Renderer JavaScript is absent from module graph: ${path}`);
    }
  }
  for (const file of inventory.files.filter(
    (entry) => entry.scope === 'renderer' && entry.kind === 'wasm' && !stagedAdmitted.has(entry.path),
  )) {
    const provenance = inventory.assets.filter((asset) => asset.fileName === file.path);
    let approvedHash: string | undefined;
    try {
      approvedHash = approvedWasm.get(
        realpathSync(resolve(workspaceRoot, provenance[0]?.sourcePath ?? '')).replaceAll('\\', '/'),
      );
    } catch {
      // Missing provenance is reported below without aborting the rest of the inventory.
    }
    if (provenance.length !== 1 || approvedHash !== file.sha256 || provenance[0]!.sha256 !== file.sha256) {
      inventory.violations.push(
        `Renderer WASM lacks allowed producer provenance: ${file.path} (${provenance.map((entry) => `${entry.sourcePath}:${entry.sha256}`).join(', ') || 'missing'})`,
      );
    }
  }
  const wasmBytes = inventory.files
    .filter((file) => file.scope === 'renderer' && file.kind === 'wasm')
    .reduce((total, file) => total + file.bytes, 0);
  if (wasmBytes > approvedWasmBytes) {
    inventory.violations.push(`Renderer WASM budget exceeded: ${wasmBytes} bytes`);
  }
  inventory.files.sort((left, right) => `${left.scope}/${left.path}`.localeCompare(`${right.scope}/${right.path}`));
  inventory.violations = [...new Set(inventory.violations)].sort();
  return inventory;
};

const main = async (): Promise<void> => {
  const root = resolve(import.meta.dirname, '../../..');
  const { values } = parseArgs({
    options: {
      renderer: { type: 'string', default: resolve(root, 'apps/ui/desktop/build/client') },
      host: { type: 'string', default: resolve(root, 'apps/desktop/dist') },
      app: { type: 'string' },
      archive: { type: 'string' },
      output: { type: 'string' },
      'source-revision': { type: 'string' },
      'report-only': { type: 'boolean', default: false },
    },
  });
  const inventory = await inspectDesktopPayload({
    renderer: resolve(values.renderer),
    host: resolve(values.host),
    ...(values.app ? { app: resolve(values.app) } : {}),
    ...(values.archive ? { archive: resolve(values.archive) } : {}),
  });
  const report = JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      sourceRevision:
        values['source-revision'] ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      ...inventory,
    },
    undefined,
    2,
  );
  if (values.output) {
    await mkdir(dirname(resolve(values.output)), { recursive: true });
    await writeFile(resolve(values.output), `${report}\n`);
  }
  process.stdout.write(
    `${JSON.stringify({ totals: inventory.totals, violations: inventory.violations }, undefined, 2)}\n`,
  );
  if (!values['report-only'] && inventory.violations.length > 0) {
    process.exitCode = 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`Desktop payload check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
