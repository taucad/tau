// oxlint-disable-next-line eslint/no-restricted-imports -- Route/build configuration runs before app aliases are installed.
import { isObservabilityHarnessBuild } from './app/lib/observability-harness-gate.js';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import netlifyReactRouter from '@netlify/vite-plugin-react-router';
import devtoolsJson from '@silvenon/vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defaultClientConditions, defaultServerConditions, defineConfig } from 'vite';
import type { EnvironmentOptions, Plugin, UserConfig } from 'vite';
import { tauRuntime } from '@taucad/runtime/vite';
import { base64Loader } from '@taucad/vite/base64-loader';
import { moduleIdManifest } from '@taucad/vite/module-id-manifest';
/* oxlint-disable eslint/no-restricted-imports -- Vite configuration lives outside the app alias root. */
import {
  resolveServiceWorkerKillSwitch,
  resolveTauDeploymentCeiling,
  resolveUiBuildDirectory,
  uiBuildDirectoryVariable,
  serviceWorkerKillSwitchVariable,
  unstampedBuildRelease,
} from './build-environment.js';
import type { TauDeploymentCeiling } from './build-environment.js';
/* oxlint-enable eslint/no-restricted-imports */
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite config cannot use app aliases.
import { createCsharpLanguageAssets } from './csharp-language-assets.vite-plugin.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite config cannot use app aliases.
import { createGeoSpecMtAssets } from './geospec-mt-assets.vite-plugin.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite configuration runs outside the app alias resolver.
import { createPicogkBrowserAssets } from './picogk-browser-assets.vite-plugin.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite configuration runs outside the app alias resolver.
import { createCadmpegEngines } from './cadmpeg-engines.vite-plugin.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite config cannot use app aliases.
import { createOpenscadLanguageAssets } from './openscad-language-assets.vite-plugin.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite config cannot use app aliases.
import { createAssetIntegrity } from './asset-integrity.vite-plugin.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite config lives outside app aliases.
import { createServerOutputAssets } from './server-output-assets.vite-plugin.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite config cannot use app aliases.
import { netlifyFunctionExcludedPaths } from './app/lib/route-classes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testScriptsAlias = '#scripts';
const uiReactCompilerPluginName = 'vite:react-compiler';
/** The web build's service worker seam: `retired` with the kill switch (`TAU_SERVICE_WORKER_KILL_SWITCH=true`). */
const serviceWorkerMode = resolveServiceWorkerKillSwitch(process.env[serviceWorkerKillSwitchVariable])
  ? 'retired'
  : 'enabled';
/** The only specifiers `tau-ui-source-alias` resolves: `#` app aliases. */
const uiSourceAliasIdFilter = /^#/u;

const toOriginOrRaw = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
};

/** Netlify sets `CONTEXT` for builds only; the error tracker's `deploy_context` tag (`resolveDeployContext`). */
const buildDeployContext = (environment: NodeJS.ProcessEnv): string => environment['CONTEXT'] ?? '';

const resolveBuildFrontendUrl = (environment: NodeJS.ProcessEnv): string | undefined => {
  if (environment['TAU_FRONTEND_URL']) {
    return undefined;
  }

  if (environment['NETLIFY'] !== 'true' || environment['CONTEXT'] === 'production') {
    return undefined;
  }

  return (
    toOriginOrRaw(environment['DEPLOY_PRIME_URL']) ??
    toOriginOrRaw(environment['DEPLOY_URL']) ??
    toOriginOrRaw(environment['NETLIFY_AI_GATEWAY_URL'])
  );
};

/**
 * SSR externalisation policy, shared with `desktop/vite.config.ts` so the two
 * builds cannot drift.
 *
 * `external`: only the three packages that emit sibling SSR chunks via static
 * `new URL('./<file>.js', import.meta.url)` patterns (kernel plugins, worker
 * bootstraps, middleware factories). Bundling those re-emits many
 * `build/server/assets/*` chunks SSR never executes. Other `@taucad/*`
 * packages bundle into the SSR output.
 *
 * Audit first-party sources: rg -n "new URL\(['\"]\.\..*\.(?:js|ts)['\"], import\.meta\.url\)" packages/
 *
 * The lists are the server environment's `resolve` options (`environments.ssr.resolve`): under React Router 8's
 * Environment API build the top-level `ssr.external` and `ssr.noExternal` are not honoured, and
 * `@taucad/runtime` was bundled into the server without a warning (React Router 8 migration RR5, round-2 finding 2).
 * `scripts/check-server-output.mts` asserts the external specifiers survive in the built server.
 */
export const uiSsrOptions = {
  noExternal: ['@headless-tree/core', '@headless-tree/react', 'posthog-js'],
  external: ['@taucad/runtime', '@taucad/openrscad', '@taulabs/openrscad-engine'],
} as const satisfies NonNullable<EnvironmentOptions['resolve']>;

/**
 * The build-target seam (charter D2), shared with `desktop/` and `serve/vite.config.ts`.
 *
 * One argument sets both halves so they cannot disagree: the app reads the
 * `import.meta.env.TAU_TARGET` define (`app/lib/build-target.ts`), and the
 * libraries, which may not read `import.meta.env`, resolve
 * `@taucad/ui-core/lib/build-target` by the `tau-desktop` package condition.
 * The web target adds no condition (its conditions are Vite's defaults, which
 * the web config keeps by not setting them), so its libraries resolve the
 * `default` (web) variant. Top-level `resolve` also governs the worker bundles.
 *
 * @param target - The host this bundle is built for.
 * @returns The define entry and the client and server resolve conditions.
 */
export const uiBuildTarget = (
  target: 'web' | 'desktop',
): {
  define: Record<string, string>;
  resolve: { conditions: string[] };
  ssrResolve: { conditions: string[] };
} => {
  // oxlint-disable-next-line @typescript-eslint/naming-convention -- Vite define key is a member expression.
  const define = { 'import.meta.env.TAU_TARGET': JSON.stringify(target) };
  const conditions = target === 'desktop' ? ['tau-desktop'] : [];
  return {
    define,
    resolve: { conditions: [...defaultClientConditions, ...conditions] },
    ssrResolve: { conditions: [...defaultServerConditions, ...conditions] },
  };
};

/**
 * Dependency-optimizer policy, mirrored by `desktop/vite.config.ts`.
 *
 * `@classcad/smlibwasm` (loaded by `@taucad/smlib` in the runtime worker) finds
 * its WebAssembly with `new URL('smlibwasm.wasm', import.meta.url)`; pre-bundling
 * moves the module into `.vite/deps` and the dev server would then miss the file.
 */
const uiOptimizeDepsOptions = {
  exclude: ['@classcad/smlibwasm'],
} as const satisfies UserConfig['optimizeDeps'];

/**
 * Worker modules the dev dependency optimizer crawls at startup, relative to `apps/ui`.
 *
 * React Router's `future.unstable_optimizeDeps` (`react-router.config.ts`) admits the client
 * entry and the route modules; Vite merges these after them. The scanner does not follow
 * `new Worker(new URL(...))`, so without them the kernels, GeoSpec and language servers reach
 * the optimizer only when a worker first starts, and its re-bundle reloads every open page.
 * `app/worker-optimize-deps-entries.node.test.ts` holds every worker the app starts to this list.
 */
export const uiWorkerOptimizeDepsEntries = [
  'app/**/*.worker.ts',
  'app/lib/kcl-language/lsp/kcl-lsp-worker.ts',
  '../libs/*/src/**/*.worker.ts',
  '../libs/lsp/src/typescript-worker/worker.entry.ts',
] as const;

/**
 * Module aliases shared with `desktop/vite.config.ts`.
 *
 * `@resvg/resvg-js`: `@taucad/tscircuit` (composed into the runtime worker)
 * depends on `circuit-json-to-gltf`, whose `svg-to-png` chunk statically imports
 * this native `.node` binding; the kernel never reaches it
 * (`boardTextureResolution: 0`) but the dependency optimizer and the production
 * bundle fail on the binary. See `app/lib/browser-stubs/resvg-js.ts` and the
 * tscircuit EDA kernel charter (T8).
 */
export const uiResolveAlias = [
  { find: '@resvg/resvg-js', replacement: path.resolve(__dirname, 'app/lib/browser-stubs/resvg-js.ts') },
] as const satisfies NonNullable<UserConfig['resolve']>['alias'];

type UiSourceAliasPluginOptions = {
  readonly emitModuleGraph?: boolean;
  readonly observabilityHarnessEnabled?: boolean;
  /**
   * The build's ceiling (adaptive app deployment mode charter D1): which file each `#cloud/X.js` boundary and each
   * self-host override resolves to. `self-host` when omitted, as an unaliased import resolves (I12).
   */
  readonly deploymentCeiling?: TauDeploymentCeiling;
  readonly target?: 'web' | 'desktop';
};

const harnessDisabledOverrides = new Map([
  ['#lib/observability-harness-context.js', '#lib/observability-harness-disabled.js'],
  ['#lib/observability-harness-hydration.js', '#lib/observability-harness-hydration-disabled.js'],
]);

/**
 * The `#cloud/X.js` boundaries. Each resolves to `X.cloud.*` under the `cloud` ceiling and `X.self-host.*` under
 * `self-host`; under `adaptive` to `X.adaptive.*` when that file exists, else `X.self-host.*`, so an adaptive build is
 * valid at every step and each boundary lights up when its facade lands (adaptive app deployment mode D1).
 */
const cloudBoundarySpecifiers = new Set([
  '#cloud/commercial-features.js',
  '#cloud/deployment-ceiling.js',
  '#cloud/deployment-mode.js',
  '#cloud/environment-billing.js',
  '#cloud/financial-purge.js',
  '#cloud/nav-billing.js',
  '#cloud/kernel-commerce.js',
  '#cloud/root-billing.js',
  '#cloud/settings-billing.js',
  '#cloud/zoo-close-errors.js',
  '#cloud/zoo-upgrade-banner.js',
]);

const desktopSourceOverrides = new Map([
  ['#components/cad/ar-usdz-transcode.js', '#components/cad/ar-usdz-transcode.desktop.js'],
  ['#constants/local-kernel-options.js', '#constants/local-kernel-options.desktop.js'],
  ['#constants/ephemeral-kernel-options.js', '#constants/ephemeral-kernel-options.desktop.js'],
  ['#runtime/converter-client-options.js', '#runtime/converter-client-options.desktop.js'],
  ['#services/headless-image-backend.js', '#services/headless-image-backend.desktop.js'],
  ['#services/attachment-image-backend.js', '#services/attachment-image-backend.desktop.js'],
  ['#services/browser-agent-worker.js', '#services/browser-agent-worker.desktop.js'],
  ['#services/browser-geospec-worker.js', '#services/browser-geospec-worker.desktop.js'],
  ['#workers/measurement-exact.transport.js', '#workers/measurement-exact.transport.desktop.js'],
  ['#components/cookie-preferences.js', '#components/cookie-preferences.desktop.js'],
  ['#hooks/use-cookie-consent.js', '#hooks/use-cookie-consent.desktop.js'],
]);

const selfHostSourceOverrides = new Map([
  ['#components/chat/chat-model-selector.js', '#components/chat/chat-model-selector.self-host.js'],
  ['#components/icons/svg-sprite-mount.js', '#components/icons/svg-sprite-mount.self-host.js'],
  ['#hooks/use-credit-preflight.js', '#hooks/use-credit-preflight.self-host.js'],
  ['#offline/offline-shell.js', '#offline/offline-shell.self-host.js'],
  ['#routes/_index/billing-section.js', '#routes/_index/billing-section.self-host.js'],
  [
    '#routes/w.$workspace.$project/chat-details-usage.js',
    '#routes/w.$workspace.$project/chat-details-usage.self-host.js',
  ],
  [
    '#routes/w.$workspace.$project/chat-error-credits.js',
    '#routes/w.$workspace.$project/chat-error-credits.self-host.js',
  ],
  [
    '#routes/w.$workspace.$project/chat-error-provider-account.js',
    '#routes/w.$workspace.$project/chat-error-provider-account.self-host.js',
  ],
  [
    '#routes/w.$workspace.$project/chat-message-data-usage.js',
    '#routes/w.$workspace.$project/chat-message-data-usage.self-host.js',
  ],
]);

/** Whether an `#…` specifier names a source file under `app/` (any of its script extensions). */
const sourceExists = (specifier: string): boolean => {
  const base = path.resolve(__dirname, 'app', specifier.slice(1)).replace(/\.js$/u, '');
  return ['.ts', '.tsx', '.js', '.jsx'].some((extension) => existsSync(`${base}${extension}`));
};

/**
 * The specifier a ceiling selects (D1). `cloud`: the boundary's `.cloud` file; overrides do not apply. `self-host`:
 * the boundary's `.self-host` file, else the self-host override. `adaptive`: the boundary's or the specifier's own
 * `.adaptive` file when it exists, else what `self-host` selects.
 *
 * @param specifier - The requested `#…` specifier.
 * @param ceiling - The build's ceiling.
 * @returns The specifier to resolve.
 */
export const ceilingSpecifier = (specifier: string, ceiling: TauDeploymentCeiling): string => {
  const boundary = cloudBoundarySpecifiers.has(specifier);
  if (ceiling === 'cloud') {
    return boundary ? specifier.replace(/\.js$/u, '.cloud.js') : specifier;
  }
  const override = selfHostSourceOverrides.get(specifier);
  if (ceiling === 'adaptive' && (boundary || override !== undefined)) {
    const adaptive = specifier.replace(/\.js$/u, '.adaptive.js');
    if (sourceExists(adaptive)) {
      return adaptive;
    }
  }
  return boundary ? specifier.replace(/\.js$/u, '.self-host.js') : (override ?? specifier);
};

/** The modules of an adaptive build's `cloud-core` chunk: the display-mode owner and its utilities (gate G1). */
export const cloudCoreModulePattern =
  /[\\/](?:apps[\\/]ui[\\/]app[\\/](?:runtime[\\/]deployment(?:\.machine)?|cloud[\\/]deployment-mode\.adaptive)|libs[\\/](?:types[\\/]src[\\/]deployment|utils[\\/]src[\\/](?:deployment-mode|origin-answer)\.utils))\.ts$/u;

const normalizeProvenancePath = (moduleId: string): string => {
  const normalized = moduleId.replaceAll('\\', '/');
  const workspaceRoot = `${path.resolve(__dirname, '../..').replaceAll('\\', '/')}/`;
  return normalized.startsWith(workspaceRoot) ? normalized.slice(workspaceRoot.length) : normalized;
};

/** Shared with `desktop/vite.config.ts`, which reuses the web plugin list. */
export const createUiSourceAliasPlugin = (options: UiSourceAliasPluginOptions = {}): Plugin => {
  let viteRoot = __dirname;
  let graphFileName: string | undefined;
  let graphAssets: Array<{
    fileName: string;
    sourcePath: string;
    sha256: string;
  }> = [];
  return {
    name: 'tau-ui-source-alias',
    enforce: 'pre',
    configResolved(config) {
      viteRoot = config.root;
    },
    resolveId: {
      // Rolldown skips the JS call for every other specifier; the handler keeps
      // its own checks for hosts that ignore hook filters.
      filter: { id: uiSourceAliasIdFilter },
      handler(source, importer) {
        if (!source.startsWith('#')) {
          return null;
        }

        // Every other package, @taucad/ui included, answers its own `#` specifiers
        // through its package.json imports map in Vite's core resolver.
        const uiRoot = `${path.resolve(__dirname)}${path.sep}`;
        if (importer !== undefined && !path.resolve(importer).startsWith(uiRoot)) {
          return null;
        }

        const [requestedSpecifier, query] = source.split('?', 2);
        const harnessSpecifier =
          options.observabilityHarnessEnabled === true
            ? requestedSpecifier
            : (harnessDisabledOverrides.get(requestedSpecifier ?? '') ?? requestedSpecifier);
        const hostSpecifier =
          options.target === 'desktop' && harnessSpecifier
            ? (desktopSourceOverrides.get(harnessSpecifier) ?? harnessSpecifier)
            : harnessSpecifier;
        const ceiling = options.deploymentCeiling ?? 'self-host';
        const specifier = hostSpecifier === undefined ? undefined : ceilingSpecifier(hostSpecifier, ceiling);
        if (specifier === undefined) {
          return null;
        }

        const sourcePath = path.resolve(__dirname, 'app', specifier.slice(1));
        const candidatePaths = [sourcePath];
        if (specifier.endsWith('.js')) {
          const sourceBasePath = sourcePath.slice(0, -'.js'.length);
          candidatePaths.push(
            `${sourceBasePath}.ts`,
            `${sourceBasePath}.tsx`,
            `${sourceBasePath}.js`,
            `${sourceBasePath}.jsx`,
          );
        }

        for (const candidatePath of candidatePaths) {
          if (existsSync(candidatePath)) {
            return query === undefined ? candidatePath : `${candidatePath}?${query}`;
          }
        }

        return null;
      },
    },
    generateBundle(_outputOptions, bundle) {
      if (options.emitModuleGraph !== true || this.environment.config.consumer !== 'client') {
        return;
      }

      const chunks = Object.values(bundle).filter((output) => output.type === 'chunk');
      if (options.target !== 'desktop') {
        const forbidden = chunks
          .flatMap((chunk) => Object.keys(chunk.modules))
          .find((moduleId) =>
            /apps\/(?:ui\/app|libs\/[^/]+\/src)\/.*\.desktop\.[jt]sx?(?:\?|$)/u.test(normalizeProvenancePath(moduleId)),
          );
        if (forbidden) {
          this.error(`Desktop-only implementation in web bundle: ${normalizeProvenancePath(forbidden)}`);
        }
      }
      const assets = Object.values(bundle).filter((output) => output.type === 'asset');
      const emittedFileNames = new Set(Object.keys(bundle));
      graphAssets = assets.map((asset) => ({
        fileName: asset.fileName,
        sourcePath: asset.originalFileNames[0]
          ? normalizeProvenancePath(path.resolve(viteRoot, asset.originalFileNames[0]))
          : '',
        sha256: createHash('sha256').update(asset.source).digest('hex'),
      }));
      const graphReferenceId = this.emitFile({
        type: 'asset',
        name: 'tau-module-graph.json',
        source: JSON.stringify({
          chunks: chunks.map((chunk) => {
            const importedChunks = chunk.imports
              .map((importPath) => {
                const fromOutputRoot = path.posix.normalize(
                  path.posix.join(path.posix.dirname(chunk.fileName), importPath),
                );
                return emittedFileNames.has(importPath)
                  ? importPath
                  : emittedFileNames.has(fromOutputRoot)
                    ? fromOutputRoot
                    : undefined;
              })
              .filter((fileName): fileName is string => fileName !== undefined);
            const forwardingOnly = this.parse(chunk.code).body.every(
              (statement) =>
                statement.type === 'ImportDeclaration' ||
                statement.type === 'ExportAllDeclaration' ||
                (statement.type === 'ExportNamedDeclaration' && statement.declaration === null),
            );
            return {
              fileName: chunk.fileName,
              // Loaded modules still cross a target boundary when Rolldown inlines
              // their exports and reports renderedLength=0.
              moduleIds: chunk.moduleIds.map(normalizeProvenancePath),
              imports: importedChunks,
              forwardingOnly,
            };
          }),
          assets: graphAssets,
        }),
      });
      graphFileName = this.getFileName(graphReferenceId);
    },
    writeBundle: {
      order: 'post',
      async handler(outputOptions, bundle) {
        if (
          options.emitModuleGraph !== true ||
          this.environment.config.consumer !== 'client' ||
          outputOptions.dir === undefined ||
          graphFileName === undefined
        ) {
          return;
        }

        const outputRoot = path.resolve(outputOptions.dir);
        const chunks = await Promise.all(
          Object.values(bundle)
            .filter((output) => output.type === 'chunk')
            .map(async (chunk) => {
              const chunkPath = path.resolve(outputRoot, chunk.fileName);
              if (!existsSync(chunkPath)) {
                return undefined;
              }

              const code = await readFile(chunkPath, 'utf8');
              const program = this.parse(code);
              const imports = program.body
                .flatMap((statement) => {
                  if (
                    statement.type === 'ImportDeclaration' ||
                    statement.type === 'ExportAllDeclaration' ||
                    statement.type === 'ExportNamedDeclaration'
                  ) {
                    return statement.source?.value && typeof statement.source.value === 'string'
                      ? [statement.source.value]
                      : [];
                  }
                  return [];
                })
                .map((importPath) =>
                  path.posix.normalize(path.posix.join(path.posix.dirname(chunk.fileName), importPath)),
                )
                .filter((fileName) => existsSync(path.resolve(outputRoot, fileName)));
              return {
                fileName: chunk.fileName,
                moduleIds: chunk.moduleIds.map(normalizeProvenancePath),
                imports,
                forwardingOnly: program.body.every(
                  (statement) =>
                    statement.type === 'ImportDeclaration' ||
                    statement.type === 'ExportAllDeclaration' ||
                    (statement.type === 'ExportNamedDeclaration' && statement.declaration === null),
                ),
              };
            }),
        );
        const assets = graphAssets.filter((asset) => existsSync(path.resolve(outputRoot, asset.fileName)));
        await writeFile(
          path.resolve(outputRoot, graphFileName),
          JSON.stringify({
            chunks: chunks.filter((chunk) => chunk !== undefined),
            assets,
          }),
        );
      },
    },
  };
};

/**
 * Applies the native React Compiler without admitting the second JSX and Fast
 * Refresh pipeline returned by the full Vite React plugin. React Router owns
 * those transforms for this framework-mode app.
 */
export const createUiReactCompilerPlugin = (): Plugin => {
  const compilerPlugins = react({
    compiler: { target: '19', logDiagnostics: true },
    // The ui-kit (UI wave A), chat-ui (UI wave B), project-workspace (UI wave C), files-ui, editor-ui, revisions-ui, settings-ui, publish-ui and billing-ui (UI wave D) and ui-core (UI wave E) libraries were cut from apps/ui/app and keep the compilation they had there.
    include: [
      '**/apps/ui/app/**/*.{js,jsx,ts,tsx}',
      '**/apps/libs/ui-kit/src/**/*.{js,jsx,ts,tsx}',
      '**/apps/libs/chat-ui/src/**/*.{js,jsx,ts,tsx}',
      '**/apps/libs/project-workspace/src/**/*.{js,jsx,ts,tsx}',
      '**/apps/libs/files-ui/src/**/*.{js,jsx,ts,tsx}',
      '**/apps/libs/editor-ui/src/**/*.{js,jsx,ts,tsx}',
      '**/apps/libs/revisions-ui/src/**/*.{js,jsx,ts,tsx}',
      '**/apps/libs/settings-ui/src/**/*.{js,jsx,ts,tsx}',
      '**/apps/libs/publish-ui/src/**/*.{js,jsx,ts,tsx}',
      '**/apps/libs/billing-ui/src/**/*.{js,jsx,ts,tsx}',
      '**/apps/libs/ui-core/src/**/*.{js,jsx,ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/*.{test,spec}.{js,jsx,ts,tsx}',
      // Oxc 0.148 cannot reset compiler caches during route-module HMR.
      '**/apps/ui/app/root.{js,jsx,ts,tsx}',
      '**/apps/ui/app/routes/*.{js,jsx,ts,tsx}',
      '**/apps/ui/app/routes/**/route.{js,jsx,ts,tsx}',
    ],
  }).filter((plugin) => plugin.name === uiReactCompilerPluginName);

  const [compilerPlugin] = compilerPlugins;
  if (compilerPlugins.length !== 1 || compilerPlugin === undefined) {
    throw new Error(`Expected one ${uiReactCompilerPluginName} plugin, received ${compilerPlugins.length}.`);
  }
  const compilerTransform = compilerPlugin.transform;
  if (compilerTransform === undefined || typeof compilerTransform === 'function') {
    throw new Error(`Expected a filtered ${uiReactCompilerPluginName} transform.`);
  }

  return {
    ...compilerPlugin,
    transform: {
      ...compilerTransform,
      filter: {
        ...compilerTransform.filter,
        // Oxc 0.148's React compiler emits undefined for BigInt literals, breaking
        // credit arithmetic. Leave these modules to Vite's ordinary TSX transform.
        // A match inside a comment/string only forgoes optional memoization.
        code: { exclude: /\b(?:0[xX][\dA-Fa-f_]+|0[oO][0-7_]+|0[bB][01_]+|[\d_]+)n\b/u },
      },
    },
    applyToEnvironment: (environment) => environment.config.consumer === 'client',
  };
};

/**
 * Record the build's Sentry release beside the build output (never shipped), so the deploy can attach its commits
 * to the exact release every event from this bundle reports (`sentryRelease` in `#lib/sentry-event.lib`).
 *
 * @param buildId - The build id baked into the server graph.
 * @returns The plugin.
 */
/* The web build's output directory: `build`, or CI's second build beside it (gate G1). */
const uiBuildDirectory = resolveUiBuildDirectory(process.env[uiBuildDirectoryVariable]);

const createSentryReleaseRecordPlugin = (buildId: number): Plugin => ({
  name: 'tau-sentry-release-record',
  // Production builds only, like the server's `tauBuildId` (a test build carries no release).
  apply: (_config, { command, mode }) => command === 'build' && mode !== 'test',
  applyToEnvironment: (environment) => environment.config.consumer === 'server',
  async writeBundle() {
    await writeFile(path.resolve(__dirname, uiBuildDirectory, 'sentry-release'), `tau-ui@${String(buildId)}\n`);
  },
});

/** Where the web client build writes its module-id manifest (`@taucad/vite/module-id-manifest`). */
const criticalModuleIdsPath = path.resolve(__dirname, uiBuildDirectory, 'client-module-ids.json');

export default defineConfig(({ command, mode }) => {
  const mtAssets = createGeoSpecMtAssets(process.env['GEOSPEC_MT_STAGED_PACKAGE_ROOT']);
  // Deploys load the pinned host from the digest mirror; development and e2e serve a prepared bundle.
  const picogkAssets = createPicogkBrowserAssets(process.env['PICOGK_BROWSER_ASSETS_ROOT'], {
    base: process.env['PICOGK_BROWSER_MIRROR_BASE'],
    pin: path.resolve(__dirname, '../../packages/plugins/picogk/browser-host.pin.json'),
  });
  const openscadLanguage = createOpenscadLanguageAssets(path.resolve(__dirname, '../../out/openscad-language/stage'));
  const isTest = mode === 'test';
  // Deploys load each engine by digest from their dependency host; the dev server serves the installed package.
  const cadmpegEngines = createCadmpegEngines({
    base: process.env['CADMPEG_ENGINES_BASE'],
    command,
    mode,
    root: __dirname,
  });
  const csharpAssets = createCsharpLanguageAssets(
    isTest ? undefined : path.resolve(__dirname, '../../out/csharp-language/stage'),
  );
  /*
   * Ordered build identity for the stale-tab skew guard (blueprint DF20).
   * Evaluated once per build / dev-server start, which is exactly the
   * granularity at which a tab's app-logic vintage can diverge.
   *
   * A production build defines it for the server only, which publishes it to
   * the page as `window.ENV.TAU_BUILD_ID` (`#lib/build-identity`). Baked into a
   * client chunk, a fresh timestamp changed that chunk's hash on every build,
   * and with it the hash of every chunk importing it: about 3.4 MB of the app
   * shell got new URLs per deploy without a source change.
   */
  const buildId = Date.now();
  const buildIdDefine = { tauBuildId: JSON.stringify(buildId) };
  const isProductionBuild = command === 'build' && !isTest;
  /*
   * The release label runtime telemetry stamps (short commit). Server graph only, like `tauBuildId`: the page reads
   * `window.ENV.TAU_RELEASE`, so client chunk hashes do not change per commit. The build compiles a fixed placeholder
   * and never reads the commit, so `ui:build`'s cache key holds no commit (ST-9): the deploy stamps the release over
   * the placeholder and publishes `/tau-release.json`, the only place the API learns UI releases from, with
   * `scripts/stamp-build-release.mts`.
   */
  const serverDefine = { ...buildIdDefine, tauBuildRelease: JSON.stringify(unstampedBuildRelease) };
  // Netlify's own CI sets NETLIFY=true; `netlify deploy` from GitHub Actions
  // (deploy-ui.yml) builds with NETLIFY_LOCAL=true instead. Both need the SSR function.
  const isNetlify = process.env['NETLIFY'] === 'true' || process.env['NETLIFY_LOCAL'] === 'true';
  const buildFrontendUrl = resolveBuildFrontendUrl(process.env);
  /* Unit tests run under the `cloud` ceiling; the adaptive project runs its own (`vitest.adaptive.config.ts`). */
  const deploymentCeiling = isTest ? 'cloud' : resolveTauDeploymentCeiling(process.env['TAU_CLOUD_ENABLED']);

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/apps/ui',
    define: {
      // oxlint-disable-next-line @typescript-eslint/naming-convention -- Vite define key is a member expression.
      ...(isTest
        ? {}
        : {
            'import.meta.env.TAU_OBSERVABILITY_HARNESS': JSON.stringify(
              isObservabilityHarnessBuild(process.env) ? 'enabled' : 'disabled',
            ),
          }),
      tauBuildFrontendUrl: JSON.stringify(buildFrontendUrl ?? ''),
      tauBuildDeployContext: JSON.stringify(buildDeployContext(process.env)),
      ...(isProductionBuild ? {} : buildIdDefine),
      /*
       * Every web build may report signed-out runtime telemetry; the deployment's own API policy probe is the only
       * gate (unset means off), so a self-hosted UI reports only to an API its operator turned on. Tests stub the module.
       */
      tauTelemetryHostCloudBuild: JSON.stringify(!isTest),
      tauGeoSpecMtReceipts: JSON.stringify(mtAssets.receipts),
      tauPicogkBrowserAssets: picogkAssets.assets ? JSON.stringify(picogkAssets.assets) : 'undefined',
      tauCadmpegEngines: cadmpegEngines.define,
      tauCsharpLanguageAssets: JSON.stringify(csharpAssets.assets ?? null),
      /*
       * Compile-time host seam (charter D2). `desktop/vite.config.ts` sets
       * `"desktop"`. Left undefined under `mode === 'test'` so unit tests can
       * exercise both branches with `vi.stubEnv('TAU_TARGET', …)` — a `define`
       * is a literal substitution `stubEnv` cannot reach.
       */
      ...(isTest ? {} : uiBuildTarget('web').define),
      /*
       * Whether a non-prerelease Tau Desktop exists to download (Q56, DSK-7): every "Get Tau Desktop" offer stays
       * hidden until the release build sets `TAU_DESKTOP_RELEASED=true`. Undefined under `mode === 'test'`.
       */
      // oxlint-disable-next-line @typescript-eslint/naming-convention -- Vite define key is a member expression.
      ...(isTest
        ? {}
        : {
            'import.meta.env.TAU_DESKTOP_RELEASED': JSON.stringify(
              process.env['TAU_DESKTOP_RELEASED'] === 'true' ? 'true' : 'false',
            ),
          }),
      /*
       * Service worker seam (progressive loading PL7). Only this config defines
       * it, so only the web bundle registers the worker: `desktop/vite.config.ts`
       * and `serve/vite.config.ts` have their own `define` blocks and their own
       * `react-router.config.ts` without the `buildEnd` that builds the worker,
       * and both already boot offline from an SPA index fallback. With the
       * kill switch on (`TAU_SERVICE_WORKER_KILL_SWITCH=true`,
       * `build-environment.ts`) it is `retired`: pages register nothing and only
       * ask an existing registration to fetch the retiring worker.
       */
      // oxlint-disable-next-line @typescript-eslint/naming-convention -- Vite define key is a member expression.
      ...(isTest
        ? {}
        : {
            'import.meta.env.TAU_SERVICE_WORKER': JSON.stringify(serviceWorkerMode),
          }),
      /*
       * This bundle is served by the web host, never by a `tau serve` daemon
       * (`serve/vite.config.ts`), so its origin has no agent descriptor. The
       * probe otherwise reached the SSR catch-all, which answered every workspace
       * load with a full HTML page.
       */
      // oxlint-disable-next-line @typescript-eslint/naming-convention -- Vite define key is a member expression.
      ...(isTest ? {} : { 'import.meta.env.TAU_ORIGIN_AGENT_HOST': '"absent"' }),
    },
    plugins: [
      mtAssets.plugin,
      picogkAssets.plugin,
      cadmpegEngines.plugin,
      csharpAssets.plugin,
      openscadLanguage.plugin,
      createUiSourceAliasPlugin({
        emitModuleGraph: true,
        deploymentCeiling,
        observabilityHarnessEnabled: isTest || isObservabilityHarnessBuild(process.env),
      }),
      // WASM `fetch` integrity and the asset receipt (charter D26): build only.
      createAssetIntegrity({ receipt: true }),
      // Browser assets the server build emits belong to the client output only (RR0, RD8): server build only.
      createServerOutputAssets({ clientDirectory: path.resolve(__dirname, uiBuildDirectory, 'client') }),
      createSentryReleaseRecordPlugin(buildId),
      /*
       * Each client chunk's module ids and rendered bytes, beside the build and never published, so the critical
       * budget check (`scripts/check-critical-budget.mts`) can attribute a route's interactive bytes to modules.
       */
      moduleIdManifest({ outFile: criticalModuleIdsPath, root: path.resolve(__dirname, '../..') }),

      /*
       * @taucad/runtime contract: COOP/COEP for SharedArrayBuffer, keep .wasm
       * out of the inline path, and force module-worker output.
       */
      tauRuntime(),

      // Base64 Loader
      base64Loader,

      // oxlint-disable-next-line max-nested-callbacks -- vite config structure
      ...(isTest
        ? []
        : // In non-test mode, include the React Router plugin and the Netlify plugin
          [
            createUiReactCompilerPlugin(),
            reactRouter(),
            /*
             * Netlify plugin is only needed for Netlify builds. Its function is registered at `/*` with
             * `preferStatic`, and Netlify runs functions before redirects, so a static shell's URLs are excluded
             * here for `netlify.toml`'s 200 rewrite to reach them (`app/lib/route-classes.ts`).
             */
            ...(isNetlify ? [netlifyReactRouter({ excludedPaths: netlifyFunctionExcludedPaths() })] : []),
          ]),
      tailwindcss(),
      // RemixPWA(), // TODO: add PWA back after https://github.com/remix-pwa/monorepo/issues/284

      // Browser DevTools JSON plugin.
      devtoolsJson(),

      ...(process.env['STATS'] === '1'
        ? [
            visualizer({
              exclude: [{ file: '**/*?raw' }], // ignore raw files that are used for editor typings
            }),
          ]
        : []),
    ],
    worker: {
      // Workers need their own plugins.
      // https://vite.dev/config/worker-options.html#worker-plugins
      plugins: () => [
        createUiSourceAliasPlugin({
          emitModuleGraph: true,
          deploymentCeiling,
          observabilityHarnessEnabled: isTest || isObservabilityHarnessBuild(process.env),
        }),
        createAssetIntegrity({ receipt: false }),
      ],
    },
    /*
     * React Router 8 builds the client and server environments from this one config (the Environment API, with
     * shared config and plugins), so an option for one graph only is set on its environment.
     */
    environments: {
      /*
       * Chunk grouping (progressive loading PL5): every lucide icon in one chunk. Left to automatic chunking, each icon
       * that two lazy chunks share became a chunk of its own (72 requests of Home's interactive tier, 95 of the
       * project route's, a few hundred bytes each); together the icons are about 18 KB brotli. The client build only:
       * the server build evaluates every icon anyway.
       */
      client: {
        build: {
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [
                  { name: 'icons', test: /[\\/]node_modules[\\/](?:.+[\\/])?lucide-react[\\/]/u },
                  /*
                   * Adaptive app deployment mode D6, gate G1: an adaptive build's display-mode owner and its utilities
                   * go in one named chunk, out of Home's largest chunk. React Router keeps entry signatures exact, so a
                   * group always takes its modules' dependencies too (here xstate and zod, which the shell loads
                   * anyway). The financial session providers, the purge and the facades stay in the chunks automatic
                   * splitting gives them: a group around them took the app runtime with it. Pinned builds keep today's
                   * chunking (I10).
                   */
                  ...(deploymentCeiling === 'adaptive' ? [{ name: 'cloud-core', test: cloudCoreModulePattern }] : []),
                ],
              },
            },
          },
        },
      },
      ssr: {
        // Merged over the shared `define` for the server graph only (see `buildIdDefine`).
        ...(isProductionBuild ? { define: serverDefine } : {}),
        resolve: { ...uiSsrOptions },
      },
    },
    resolve: {
      alias: [
        ...uiResolveAlias,
        ...(isTest ? [{ find: testScriptsAlias, replacement: path.resolve(__dirname, 'scripts') }] : []),
      ],
    },
    optimizeDeps: {
      exclude: [...uiOptimizeDepsOptions.exclude],
      // Test mode (Vitest, the calibration preview) runs without React Router's entries; keep Vite's default crawl.
      ...(isTest ? {} : { entries: [...uiWorkerOptimizeDepsEntries] }),
    },

    server: {
      port: 3000,
      // Permit LAN previews (e.g. `nx dev ui --host`); production deploys terminate TLS upstream.
      // HTTPS is intentionally a `nx serve ui --https` concern (handled by `apps/ui/server.ts`),
      // not a `nx dev ui` concern; dev is plain HTTP regardless of TTY/--host.
      allowedHosts: true,
      // `runtime-ssr-assets.vite-plugin.ts` rewrites package-owned `import.meta.resolve`
      // assets (resvg WASM, Geist fonts, occt WASM) to `/@fs/<abs path>` URLs at
      // serve time, and those paths live in sibling packages. Vite 8 refuses to serve
      // them unless the workspace root is allowed. NOT the skill-read widening it was
      // originally commented as: the skills moved to JSON modules and no longer need it,
      // but the runtime assets always did.
      fs: { allow: [path.resolve(__dirname, '../..')] },
    },
    build: {
      /*
       * Source maps: `ui:build` passes `--sourcemapClient hidden --sourcemapServer hidden`
       * (apps/ui/project.json; Rolldown rejects boolean `false` for the SSR `sourcemap`).
       * Server maps are moved out of `build/server` into `build/server-sourcemaps` and never
       * ship in the function; `ui:sourcemaps` uploads them to Sentry and deletes them (SSR bundle
       * policy rule 5).
       */
      /*
       * SVGs are forced out of the base64 inline path so the icon sprite
       * pipeline can fingerprint them. `tauRuntime()` composes its WASM rule with
       * this application-owned SVG policy.
       */
      assetsInlineLimit(file) {
        if (file.endsWith('.svg')) {
          return false;
        }
        return undefined;
      },
      target: 'es2022',
      /*
       * The service worker's precache list is generated from this manifest
       * (`scripts/build-service-worker.ts`), so hashed filenames are never
       * hand-maintained. It only lists public build outputs.
       */
      manifest: true,
    },

    test: {
      globals: true, // Required by @testing-library/jest-dom, which uses `expect` implicitly
      environment: 'jsdom',
      // Keep mock library matchers on this runner's Vitest instance; externalizing it can load a second peer instance.
      server: { deps: { inline: ['vitest-mock-extended'] } },
      // *.browser.test.ts(x) files need a real browser (OPFS, Web Locks, WebGL) and run
      // under their own vitest browser configs, not the jsdom sweep.
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.browser.test.ts', '**/*.browser.test.tsx'],
      typecheck: {
        enabled: true,
        include: ['**/*.test-d.ts'],
        tsconfig: './tsconfig.spec.json',
        ignoreSourceErrors: true,
      },
      setupFiles: ['./vitest.setup.ts'],
      reporters: ['verbose'],
      coverage: {
        reportsDirectory: '../../out/reports/coverage/apps/ui',
        provider: 'v8',
        include: ['app/**/*'],
        exclude: ['app/**/*.{test,spec}.{ts,tsx}', 'app/**/index.ts'],
      },
    },
  };
});
