/**
 * Audit Public Surface
 *
 * CI gate that enforces two complementary invariants against the runtime
 * package's public surface.
 *
 *  1. **`RuntimeClient` member allowlist** — introspect the canonical
 *     `RuntimeClient` type literal in `packages/runtime/src/client/runtime-client-core.ts`.
 *     CI fails on drift: an unknown member appearing (regression — a removed
 *     legacy verb came back) or a required member disappearing (accidental
 *     deletion).
 *  2. **Sibling-export allowlist on `packages/runtime/src/index.ts`** —
 *     enumerate every named export on the public barrel. CI fails when an
 *     unknown export name appears OR when a forbidden internal symbol
 *     (e.g. `RuntimeWorkerClient`) is re-exported. Wildcard `export *`
 *     re-exports are tolerated because they are typed re-exports from the
 *     `#types/*` modules and adding/removing members there is part of routine
 *     type evolution.
 *
 * Run with: `pnpm tsx packages/runtime/scripts/audit-public-surface.mts`
 * (or `node --import @oxc-node/core/register packages/runtime/scripts/audit-public-surface.mts`,
 * or via the Nx target: `pnpm nx audit-public-surface runtime`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const runtimeClientPath = resolve(here, '..', 'src', 'client', 'runtime-client-core.ts');
const packageBarrelPath = resolve(here, '..', 'src', 'index.ts');
const viteBarrelPath = resolve(here, '..', 'src', 'vite', 'index.ts');

/**
 * Canonical `RuntimeClient` interface members. The set must match
 * exactly — extra members fail the audit (regressions), missing members
 * fail the audit (accidental deletion).
 */
const allowedMembers: ReadonlySet<string> = new Set([
  'lifecycleState',
  'renderStatus',
  'activeKernelId',
  'capabilities',
  'connect',
  'render',
  'updateParameters',
  'setOptions',
  'setRenderTimeout',
  'export',
  'on',
  'terminate',
  'shutdown',
  'transport',
  'routesFor',
  'bestRouteFor',
]);

/**
 * Members that were part of the pre-cutover surface and must NEVER appear
 * again. The current redesign collapsed these verbs into the event-driven
 * render-intent methods plus typed errors;
 * reintroducing any of them silently regresses the public contract.
 */
const forbiddenMembers: ReadonlySet<string> = new Set([
  'openFile',
  'setFile',
  'setParameters',
  'notifyFileChanged',
  'cancelPendingRender',
  'geometryPool',
  'lastRequestedGeneration',
  'incrementAbortGeneration',
]);

const source = readFileSync(runtimeClientPath, 'utf8');
const sourceFile = ts.createSourceFile(runtimeClientPath, source, ts.ScriptTarget.Latest, true);

let runtimeClientType: ts.TypeAliasDeclaration | undefined;
sourceFile.forEachChild((node) => {
  if (
    ts.isTypeAliasDeclaration(node) &&
    node.name.text === 'RuntimeClient' &&
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    runtimeClientType = node;
  }
});

if (!runtimeClientType) {
  console.error('FAIL: could not locate exported `RuntimeClient` type alias in runtime-client-core.ts');
  process.exit(1);
}

const literal = runtimeClientType.type;
if (!ts.isTypeLiteralNode(literal)) {
  console.error('FAIL: `RuntimeClient` is not declared as a type literal — audit cannot inspect members.');
  process.exit(1);
}

const observedMembers = new Set<string>();
for (const member of literal.members) {
  let name: string | undefined;
  if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
    name = member.name.text;
  } else if (ts.isMethodSignature(member) && ts.isIdentifier(member.name)) {
    name = member.name.text;
  } else if (ts.isGetAccessorDeclaration(member) && ts.isIdentifier(member.name)) {
    name = member.name.text;
  }
  if (name) {
    observedMembers.add(name);
  }
}

const failures: string[] = [];

for (const observed of observedMembers) {
  if (forbiddenMembers.has(observed)) {
    failures.push(`forbidden member \`${observed}\` reappeared on RuntimeClient — the v5 surface requires it deleted.`);
  }
  if (!allowedMembers.has(observed) && !forbiddenMembers.has(observed)) {
    failures.push(
      `unexpected member \`${observed}\` on RuntimeClient — add it to the allowlist if it is part of the public surface, or remove it from the type.`,
    );
  }
}

for (const required of allowedMembers) {
  if (!observedMembers.has(required)) {
    failures.push(`missing member \`${required}\` on RuntimeClient — every public surface member must be present.`);
  }
}

/**
 * Public-barrel sibling exports.
 *
 * Every named symbol re-exported from `packages/runtime/src/index.ts` must
 * appear in this allowlist. Add a new entry deliberately when growing the
 * public surface — dropping a member here without removing the export will
 * fail the audit.
 *
 * Wildcard re-exports (`export *` / `export type *`) are tolerated and not
 * enumerated (they propagate `#types/*` which evolve independently).
 */
const allowedBarrelExports: ReadonlySet<string> = new Set([
  // Client + factory
  'createRuntimeClient',
  'RuntimeClient',
  'RuntimeClientOptions',
  'FilesystemRuntimeSource',
  'InlineRuntimeSource',
  'RuntimeExportOptions',
  'RuntimeRenderInput',
  'RuntimeSetOptionsInput',
  'RuntimeSource',
  'RuntimeSourceContent',
  'RuntimeSourceFiles',
  'ExportResult',
  'RenderOutcome',
  'RenderStatus',
  'RuntimeLifecycleState',
  'RuntimeConnectionCause',
  'RuntimeTerminatedCause',
  'RuntimeFromTransport',

  // Lifecycle errors + guards
  'NoRenderOutcomeError',
  'isNoRenderOutcomeError',
  'RuntimeNotConnectedError',
  'isRuntimeNotConnectedError',
  'RuntimeConnectionError',
  'isRuntimeConnectionError',
  'RuntimeTerminatedError',
  'isRuntimeTerminatedError',

  // Render-path errors + guards (re-exported from runtime-worker-client.js)
  'RenderTimeoutError',
  'isRenderTimeoutError',
  'RenderAbortedError',
  'isRenderAbortedError',

  // Shared-pool errors + guards
  'SharedPoolEntryNotFoundError',
  'isSharedPoolEntryNotFoundError',

  // Plugin types
  'KernelPlugin',
  'MiddlewarePlugin',
  'BundlerPlugin',
  'TranscoderPlugin',
  'CollectExportFormats',
  'CollectFormatMap',
  'CollectKernelIds',
  'CollectRenderOptions',
  'CollectTranscodeMap',
  'CollectTranscoderTargets',
  'ExportFormatsFor',
  'ExportContentFor',
  'ExportOptionsFor',
  'KnownSourceFormats',
  'KnownTargetFormats',
  'KnownTranscoderIds',
  'MergeExportMap',
  'RenderOptionsFor',
  'RenderContentFor',

  // Plugin authoring helpers
  'defineKernel',
  'defineMiddleware',
  'defineBundler',
  'defineTranscoder',

  // Filesystem (browser-safe opaque RuntimeFileSystem + factories)
  'RuntimeFileSystem',
  'FsLike',
  'fromMemoryFs',
  'fromFsLike',
  'fromBrowserFs',
  'fromFileSystemBridge',
  'isRuntimeFileSystem',

  // Transport author API only. Concrete transports are intentionally
  // excluded from the package barrel — each ships behind its own
  // topology-tagged subpath:
  //
  //   - `@taucad/runtime/transport/in-process`
  //   - `@taucad/runtime/transport/web`
  //   - `@taucad/runtime/transport/node`
  //
  // See `transport-browser-safe.test.ts` for the runtime-level
  // contract pin.
  'defineRuntimeTransport',
  'TransportPlugin',
  'RuntimeTransportClient',
  'RuntimeTransportCloseResult',
  'RuntimeTransportPreviewReservation',
  'RuntimeTransportRenderTarget',
  'RuntimeTransportTimeoutRecovery',
  'RuntimeTransportHost',
  'TransportClientReady',
  'TransportHostReady',

  // Cache primitives consumed by middleware authors
  'lruCache',
  'sharedPoolCache',
  'FileContentCache',
  'LruCacheOptions',

  // Helpers
  'createKernelSuccess',
  'createKernelError',
]);

/**
 * Internal symbols that must NEVER be re-exported from the package barrel.
 * `RuntimeWorkerClient` is the layer-3 main-thread wrapper used by
 * `RuntimeClient`; consumers must reach for the high-level facade instead.
 */
const forbiddenBarrelExports: ReadonlySet<string> = new Set(['RuntimeWorkerClient']);

const barrelSource = readFileSync(packageBarrelPath, 'utf8');
const barrelSourceFile = ts.createSourceFile(packageBarrelPath, barrelSource, ts.ScriptTarget.Latest, true);

const allowedViteBarrelExports: ReadonlySet<string> = new Set([
  'crossOriginIsolation',
  'tauRuntime',
  'RuntimePluginOptions',
  'RuntimeVitePlugin',
]);
const viteBarrelSource = readFileSync(viteBarrelPath, 'utf8');
const viteBarrelSourceFile = ts.createSourceFile(viteBarrelPath, viteBarrelSource, ts.ScriptTarget.Latest, true);
const observedViteBarrelExports = new Set<string>();
viteBarrelSourceFile.forEachChild((node) => {
  if (!ts.isExportDeclaration(node) || !node.exportClause || !ts.isNamedExports(node.exportClause)) {
    return;
  }
  for (const element of node.exportClause.elements) {
    observedViteBarrelExports.add(element.name.text);
  }
});

for (const observed of observedViteBarrelExports) {
  if (!allowedViteBarrelExports.has(observed)) {
    failures.push(`unexpected export \`${observed}\` from @taucad/runtime/vite`);
  }
}
for (const required of allowedViteBarrelExports) {
  if (!observedViteBarrelExports.has(required)) {
    failures.push(`missing export \`${required}\` from @taucad/runtime/vite`);
  }
}

const observedBarrelExports = new Set<string>();

barrelSourceFile.forEachChild((node) => {
  // `export { A, B as C } from '...';` and `export { A, B };`
  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const specifier of node.exportClause.elements) {
      observedBarrelExports.add(specifier.name.text);
    }
    return;
  }
  // `export const foo = ...;` / `export function foo(...)` / `export class Foo`
  if (
    (ts.isVariableStatement(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node)) &&
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          observedBarrelExports.add(declaration.name.text);
        }
      }
    } else if (node.name && ts.isIdentifier(node.name)) {
      observedBarrelExports.add(node.name.text);
    }
  }
});

for (const observed of observedBarrelExports) {
  if (forbiddenBarrelExports.has(observed)) {
    failures.push(
      `forbidden export \`${observed}\` re-appeared on the package barrel (\`src/index.ts\`) — internal layer-3 symbols must not be exposed.`,
    );
    continue;
  }
  if (!allowedBarrelExports.has(observed)) {
    failures.push(
      `unexpected export \`${observed}\` on the package barrel (\`src/index.ts\`) — add it to \`allowedBarrelExports\` if it is part of the public surface, or drop the export.`,
    );
  }
}

for (const required of allowedBarrelExports) {
  if (!observedBarrelExports.has(required)) {
    failures.push(
      `missing export \`${required}\` on the package barrel (\`src/index.ts\`) — every entry in \`allowedBarrelExports\` must be present.`,
    );
  }
}

if (failures.length > 0) {
  console.error('audit-public-surface.mts FAILED:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `audit-public-surface.mts OK — RuntimeClient, package barrel, and Vite subpath surfaces match their allowlists (${observedBarrelExports.size} package-barrel exports).`,
);
