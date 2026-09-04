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
  '@taucad/image',
  '@taucad/jscad',
  '@taucad/manifold',
  '@taucad/middleware',
  '@taucad/opencascade',
  '@taucad/openrscad',
  '@taucad/openrscad-native',
  '@taucad/picogk',
  '@taucad/replicad',
  '@taucad/rhino',
  '@taucad/runtime',
  '@taucad/zoo',
  'zod',
] as const;

/*
 * No `renderer` section, deliberately: the renderer is `ui:build:desktop`'s
 * SPA, served over `app://` in production and by `ui:dev:desktop` (port 3001)
 * in development. Ruling D3 forbids source-importing `apps/ui` from here, so
 * the shell consumes that build output as an artifact and nothing else.
 *
 * `electronRuntimeConfig` re-applies Tau's electron-vite invariants. Workspace
 * packages are bundled into the distributable ASAR. Only the runtime-loaded
 * N-API package stays external so its adjacent `.node` binary remains
 * discoverable.
 */
export default defineConfig(
  electronRuntimeConfig({
    main: {
      build: {
        externalizeDeps: {
          exclude: [...bundledWorkspaceDependencies],
          include: ['@taulabs/openrscad-engine-native', 'libassimp'],
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
