import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { electronRuntimeConfig } from '@taucad/runtime/electron/vite';

const bundledWorkspaceDependencies = [
  '@taucad/agent-host',
  '@taucad/agent-tools',
  '@taucad/assimp',
  '@taucad/brep',
  '@taucad/build123d',
  '@taucad/esbuild',
  '@taucad/filesystem',
  '@taucad/gltf',
  '@taucad/host',
  '@taucad/image',
  '@taucad/jscad',
  '@taucad/manifold',
  '@taucad/middleware',
  '@taucad/opencascade',
  '@taucad/openrscad',
  '@taucad/picogk',
  '@taucad/replicad',
  '@taucad/rhino',
  '@taucad/runtime',
  '@taucad/skills',
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
  'esbuild',
  'libassimp',
  'nanoraster',
] as const;

export default defineConfig(
  electronRuntimeConfig({
    main: {
      build: {
        externalizeDeps: {
          exclude: [...bundledWorkspaceDependencies],
          include: [...desktopExternalizedDependencies],
        },
        outDir: 'dist/main',
      },
    },
    preload: {
      build: {
        outDir: 'dist/preload',
        lib: {
          entry: resolve(import.meta.dirname, 'src/preload/preload.ts'),
          formats: ['es'],
        },
      },
    },
  }),
);
