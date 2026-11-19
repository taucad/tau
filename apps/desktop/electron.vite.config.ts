import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { electronRuntimeConfig } from '@taucad/runtime/electron/vite';

const cloudValue = process.env['TAU_CLOUD_ENABLED'];
if (cloudValue !== undefined && cloudValue !== 'true' && cloudValue !== 'false') {
  throw new Error('TAU_CLOUD_ENABLED must be exactly true or false.');
}
/* Launch gate OBS-7: the release workflow passes the DSN from the `desktop` environment; other builds report nothing. */
const define = {
  tauCloudBuildEnabled: JSON.stringify(cloudValue === 'true'),
  /* Runtime telemetry's own Cloud-host signal for main, never derived from the billing gate above. */
  tauTelemetryHostCloudBuild: JSON.stringify(process.env['TAU_TELEMETRY_HOST'] === 'cloud'),
  tauSentryDsn: JSON.stringify(process.env['SENTRY_DSN'] ?? ''),
  /* The release workflow names one Sentry release per tag (`tau-desktop@<version>`); empty keeps the SDK default. */
  tauSentryRelease: JSON.stringify(process.env['SENTRY_RELEASE'] ?? ''),
  /* The release workflow passes the PostHog project key; without one the renderer's analytics stay inert. */
  tauPostHogClientKey: JSON.stringify(process.env['POSTHOG_CLIENT_KEY'] ?? ''),
  /*
   * LW8's build id (the commit) is not compiled in, so `desktop:build`'s cache key holds no commit (ST-9). Packaging
   * records it beside the bundles instead (`src/shared/desktop-host-build.ts`).
   */
} as const;

const bundledWorkspaceDependencies = [
  '@sentry/electron',
  '@taucad/agent-host',
  '@taucad/agent-observability',
  '@taucad/agent-tools',
  '@taucad/assimp',
  '@taucad/bambu',
  '@taucad/brep',
  '@taucad/build123d',
  '@taucad/cadmpeg',
  '@taucad/carvera',
  '@taucad/converter',
  '@taucad/desktop-services-host',
  '@taucad/desktop-terminal',
  '@taucad/esbuild',
  '@taucad/events',
  '@taucad/filesystem',
  '@taucad/gltf',
  '@taucad/grbl',
  '@taucad/heif',
  '@taucad/host',
  '@taucad/image',
  '@taucad/jscad',
  '@taucad/manifold',
  '@taucad/middleware',
  '@taucad/native-process-core',
  '@taucad/opencascade',
  '@taucad/openrscad',
  '@taucad/picogk',
  '@taucad/picovoxel',
  '@taucad/replicad',
  '@taucad/rpc',
  '@taucad/runtime',
  '@taucad/sandbox',
  '@taucad/shell-service',
  '@taucad/skills',
  '@taucad/slicer',
  '@taucad/smlib',
  '@taucad/smlibpy',
  '@taucad/tscircuit',
  '@taucad/types',
  '@taucad/zoo',
  'pino-pretty',
  'zod',
] as const;

/*
 * No `renderer` section, deliberately: the renderer is `ui:build:desktop`'s
 * SPA, served over `app://` in production and by `ui:dev:desktop` (port 3001)
 * in development. Ruling D3 forbids source-importing `apps/ui` from here, so
 * the shell consumes that build output as an artifact and nothing else.
 *
 * `electronRuntimeConfig` re-applies Tau's electron-vite invariants. Workspace
 * packages are bundled into the distributable ASAR. The runtime-loaded engines
 * stay external: `@taulabs/openrscad-engine` resolves its own `node` entry and
 * its optional platform package from `node_modules` at runtime, and `libassimp`
 * likewise, so their `.node` binaries remain discoverable.
 */
/**
 * Packages the main/utility bundles load from `node_modules` at run time.
 *
 * Each must also be a declared `apps/desktop` dependency: the unpackaged build
 * resolves them from `apps/desktop/node_modules`, and the packaging script
 * copies them into the app. `electron-vite-externalization.test.ts` pins that.
 */
export const desktopExternalizedDependencies = [
  '@agentclientprotocol/claude-agent-acp',
  '@agentclientprotocol/codex-acp',
  /* Resolves its vendored seccomp/srt-win helpers relative to its own module file. */
  '@anthropic-ai/sandbox-runtime',
  '@taulabs/openrscad-engine',
  /* Its `node` condition loads a NAPI `.node` addon from its optional platform package. */
  'cadmpeg-ts',
  'electron-updater',
  'esbuild',
  'geospec-engine',
  'libassimp',
  'nanoraster',
  /* Loads `pty.node` relative to its own module file (`lib/utils.js`); inlined into a chunk, it finds none (Q9). */
  'node-pty',
] as const;

/*
 * The recovery window's static page (D0, R12) ships beside `index.js` as `recovery/index.html`, inside the app's own
 * files, so main loads it with `loadFile` and needs neither `app://`, the renderer bundle nor a packaging step of its
 * own. Its source is `resources/recovery/index.html`.
 */
const recoveryPage = {
  name: 'tau-recovery-page',
  buildStart(this: { addWatchFile(path: string): void }): void {
    this.addWatchFile(resolve(import.meta.dirname, 'resources/recovery/index.html'));
  },
  generateBundle(this: { emitFile(file: { type: 'asset'; fileName: string; source: string }): string }): void {
    this.emitFile({
      type: 'asset',
      fileName: 'recovery/index.html',
      source: readFileSync(resolve(import.meta.dirname, 'resources/recovery/index.html'), 'utf8'),
    });
  },
};

export default defineConfig(
  electronRuntimeConfig({
    main: {
      define,
      plugins: [recoveryPage],
      build: {
        sourcemap: 'hidden',
        externalizeDeps: {
          exclude: [...bundledWorkspaceDependencies],
          include: [...desktopExternalizedDependencies],
        },
        outDir: 'dist/main',
        /* One graph for main and the processes it starts, so the chunks they
         * share are bundled once. Each input is emitted as `<name>.js` in
         * `dist/main`, where `main.ts` (bundled into `index.js`) starts it. */
        rolldownOptions: {
          input: {
            index: resolve(import.meta.dirname, 'src/main/index.ts'),
            'kernel-host': resolve(import.meta.dirname, 'src/utility/kernel-host.entry.ts'),
            'services-host': resolve(import.meta.dirname, 'src/utility/services-host.entry.ts'),
            'geometry-host': resolve(import.meta.dirname, 'src/utility/geometry-host.entry.ts'),
            'compute-store.worker': resolve(import.meta.dirname, 'src/main/compute-store.worker.ts'),
            /* One per shell launch, started by the shell provider beside `services-host.js` (desktop shell W4). */
            'shell-supervisor': resolve(import.meta.dirname, '../../libs/sandbox/src/shell/srt-supervisor.ts'),
          },
        },
      },
    },
    preload: {
      define,
      build: {
        sourcemap: 'hidden',
        outDir: 'dist/preload',
        // Sandboxed preloads can require Electron, but cannot resolve application dependencies.
        externalizeDeps: false,
        /* The app's preload, and the recovery window's minimal one (D0). */
        lib: {
          entry: {
            preload: resolve(import.meta.dirname, 'src/preload/preload.ts'),
            'recovery-preload': resolve(import.meta.dirname, 'src/preload/recovery-preload.ts'),
          },
          formats: ['cjs'],
          fileName: (_format, entryName) => `${entryName}.cjs`,
        },
      },
    },
  }),
);
