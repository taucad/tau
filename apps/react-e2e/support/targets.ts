/* eslint-disable @typescript-eslint/naming-convention -- E2E is the established project acronym and deployment variables must retain their wire names. */
import { resolve } from 'node:path';

export type ReactE2ECommand = {
  readonly file: string;
  readonly args: readonly string[];
};

export type ReactE2ETargetMetadata = {
  readonly deployment?: 'isolated' | 'non-isolated';
  readonly example?: boolean;
  readonly expectedVersions: Readonly<Record<string, string>>;
  readonly framework: 'electron' | 'nextjs' | 'react-router';
  readonly mode: 'development' | 'production';
  readonly successMessage?: string;
  readonly version: string;
};

export type ReactE2EArtifactInspection =
  | { readonly kind: 'runtime'; readonly root: string; readonly excludedRoot?: string }
  | { readonly kind: 'electron-example'; readonly mainRoot: string; readonly rendererRoot: string };

export type ReactE2ETarget = {
  readonly artifactInspection?: ReactE2EArtifactInspection;
  readonly baseURL: string;
  readonly build?: ReactE2ECommand;
  readonly cdpPort?: number;
  readonly kind: 'electron' | 'electron-development' | 'web';
  readonly id: string;
  readonly metadata: ReactE2ETargetMetadata;
  readonly root: string;
  readonly serve?: ReactE2ECommand;
  readonly spec: string;
  readonly workspaceEntry?: string;
};

const root = resolve(import.meta.dirname, '..');
const nextRoot = resolve(root, 'apps/nextjs');
const reactRouterRoot = resolve(root, 'apps/react-router');
const electronRoot = resolve(root, 'apps/electron');
const nextExampleRoot = resolve(root, '../../examples/nextjs');
const reactRouterExampleRoot = resolve(root, '../../examples/react-router');
const electronExampleRoot = resolve(root, '../../examples/electron');
const bin = (fixtureRoot: string, name: string): string => resolve(fixtureRoot, `node_modules/.bin/${name}`);
const runtimeSuccess = {
  nextjs: 'Replicad rendered through @taucad/runtime in a Next.js Turbopack worker.',
  'react-router': 'Replicad rendered through @taucad/runtime in a React Router Vite worker.',
} as const;

export const reactE2ETargets = [
  {
    id: 'nextjs-isolated',
    kind: 'web',
    spec: 'specs/nextjs.spec.ts',
    root: nextRoot,
    baseURL: 'http://127.0.0.1:3101',
    build: { file: bin(nextRoot, 'next'), args: ['build'] },
    serve: { file: bin(nextRoot, 'next'), args: ['start', '-H', '127.0.0.1', '-p', '3101'] },
    artifactInspection: { kind: 'runtime', root: resolve(nextRoot, '.next-isolated/static/media') },
    metadata: {
      deployment: 'isolated',
      expectedVersions: { next: '15.5.22' },
      framework: 'nextjs',
      mode: 'production',
      version: '15',
    },
  },
  {
    id: 'react-router-isolated',
    kind: 'web',
    spec: 'specs/react-router.spec.ts',
    root: reactRouterRoot,
    baseURL: 'http://127.0.0.1:3102',
    build: { file: bin(reactRouterRoot, 'react-router'), args: ['build'] },
    serve: {
      file: bin(reactRouterRoot, 'vite'),
      args: ['preview', '--outDir', 'build-isolated/client', '--host', '127.0.0.1', '--port', '3102'],
    },
    artifactInspection: { kind: 'runtime', root: resolve(reactRouterRoot, 'build-isolated/client/assets') },
    metadata: {
      deployment: 'isolated',
      expectedVersions: { 'react-router': '7.18.2', '@react-router/dev': '7.18.2', vite: '7.3.6' },
      framework: 'react-router',
      mode: 'production',
      version: '7',
    },
  },
  {
    id: 'nextjs-non-isolated',
    kind: 'web',
    spec: 'specs/nextjs.spec.ts',
    root: nextRoot,
    baseURL: 'http://127.0.0.1:3103',
    build: { file: bin(nextRoot, 'next'), args: ['build'] },
    serve: { file: bin(nextRoot, 'next'), args: ['start', '-H', '127.0.0.1', '-p', '3103'] },
    artifactInspection: { kind: 'runtime', root: resolve(nextRoot, '.next-non-isolated/static/media') },
    metadata: {
      deployment: 'non-isolated',
      expectedVersions: { next: '15.5.22' },
      framework: 'nextjs',
      mode: 'production',
      version: '15',
    },
  },
  {
    id: 'react-router-non-isolated',
    kind: 'web',
    spec: 'specs/react-router.spec.ts',
    root: reactRouterRoot,
    baseURL: 'http://127.0.0.1:3104',
    build: { file: bin(reactRouterRoot, 'react-router'), args: ['build'] },
    serve: {
      file: bin(reactRouterRoot, 'vite'),
      args: ['preview', '--outDir', 'build-non-isolated/client', '--host', '127.0.0.1', '--port', '3104'],
    },
    artifactInspection: { kind: 'runtime', root: resolve(reactRouterRoot, 'build-non-isolated/client/assets') },
    metadata: {
      deployment: 'non-isolated',
      expectedVersions: { 'react-router': '7.18.2', '@react-router/dev': '7.18.2', vite: '7.3.6' },
      framework: 'react-router',
      mode: 'production',
      version: '7',
    },
  },
  {
    id: 'react-router-example',
    kind: 'web',
    spec: 'specs/react-router-example.spec.ts',
    root: reactRouterExampleRoot,
    baseURL: 'http://127.0.0.1:3105',
    build: { file: bin(reactRouterExampleRoot, 'react-router'), args: ['build'] },
    serve: {
      file: bin(reactRouterExampleRoot, 'vite'),
      args: ['preview', '--outDir', 'build/client', '--host', '127.0.0.1', '--port', '3105'],
    },
    artifactInspection: { kind: 'runtime', root: resolve(reactRouterExampleRoot, 'build/client/assets') },
    metadata: {
      example: true,
      expectedVersions: { 'react-router': '8.3.0', '@react-router/dev': '8.3.0', vite: '8.0.10' },
      framework: 'react-router',
      mode: 'production',
      successMessage: runtimeSuccess['react-router'],
      version: '8',
    },
  },
  {
    id: 'nextjs-example',
    kind: 'web',
    spec: 'specs/nextjs-example.spec.ts',
    root: nextExampleRoot,
    baseURL: 'http://127.0.0.1:3106',
    build: { file: bin(nextExampleRoot, 'next'), args: ['build', '--turbopack'] },
    serve: { file: bin(nextExampleRoot, 'next'), args: ['start', '-H', '127.0.0.1', '-p', '3106'] },
    artifactInspection: { kind: 'runtime', root: resolve(nextExampleRoot, '.next/static/media') },
    metadata: {
      example: true,
      expectedVersions: { next: '16.3.0' },
      framework: 'nextjs',
      mode: 'production',
      successMessage: runtimeSuccess.nextjs,
      version: '16',
    },
  },
  {
    id: 'electron',
    kind: 'electron',
    spec: 'specs/electron.spec.ts',
    root: electronRoot,
    baseURL: 'about:blank',
    build: { file: bin(electronRoot, 'electron-vite'), args: ['build'] },
    metadata: {
      expectedVersions: { 'electron-vite': '5.0.0', vite: '7.3.6' },
      framework: 'electron',
      mode: 'production',
      version: '5',
    },
  },
  {
    id: 'electron-example',
    kind: 'electron',
    spec: 'specs/electron-example.spec.ts',
    root: electronExampleRoot,
    baseURL: 'about:blank',
    build: { file: bin(electronExampleRoot, 'electron-vite'), args: ['build'] },
    artifactInspection: {
      kind: 'electron-example',
      mainRoot: resolve(electronExampleRoot, 'dist/main'),
      rendererRoot: resolve(electronExampleRoot, 'dist/renderer'),
    },
    workspaceEntry: resolve(electronExampleRoot, 'workspace/main.scad'),
    metadata: {
      example: true,
      expectedVersions: { 'electron-vite': '6.0.0-beta.1', vite: '8.0.10' },
      framework: 'electron',
      mode: 'production',
      successMessage: 'OpenSCAD rendered through @taucad/runtime in an Electron utility process.',
      version: '6-beta',
    },
  },
  {
    id: 'react-router-development',
    kind: 'web',
    spec: 'specs/framework-development.spec.ts',
    root: reactRouterRoot,
    baseURL: 'http://127.0.0.1:3111',
    serve: {
      file: bin(reactRouterRoot, 'react-router'),
      args: ['dev', '--host', '127.0.0.1', '--port', '3111', '--strictPort'],
    },
    metadata: {
      deployment: 'isolated',
      expectedVersions: { 'react-router': '7.18.2', '@react-router/dev': '7.18.2', vite: '7.3.6' },
      framework: 'react-router',
      mode: 'development',
      version: '7',
    },
  },
  {
    id: 'react-router-example-development',
    kind: 'web',
    spec: 'specs/framework-development.spec.ts',
    root: reactRouterExampleRoot,
    baseURL: 'http://127.0.0.1:3212',
    serve: {
      file: bin(reactRouterExampleRoot, 'react-router'),
      args: ['dev', '--host', '127.0.0.1', '--port', '3212', '--strictPort'],
    },
    metadata: {
      example: true,
      expectedVersions: { 'react-router': '8.3.0', '@react-router/dev': '8.3.0', vite: '8.0.10' },
      framework: 'react-router',
      mode: 'development',
      successMessage: runtimeSuccess['react-router'],
      version: '8',
    },
  },
  {
    id: 'nextjs-development',
    kind: 'web',
    spec: 'specs/framework-development.spec.ts',
    root: nextRoot,
    baseURL: 'http://127.0.0.1:3113',
    serve: { file: bin(nextRoot, 'next'), args: ['dev', '-H', '127.0.0.1', '-p', '3113'] },
    metadata: {
      deployment: 'isolated',
      expectedVersions: { next: '15.5.22' },
      framework: 'nextjs',
      mode: 'development',
      version: '15',
    },
  },
  {
    id: 'nextjs-example-development',
    kind: 'web',
    spec: 'specs/framework-development.spec.ts',
    root: nextExampleRoot,
    baseURL: 'http://127.0.0.1:3114',
    serve: {
      file: bin(nextExampleRoot, 'next'),
      args: ['dev', '--turbopack', '-H', '127.0.0.1', '-p', '3114'],
    },
    metadata: {
      example: true,
      expectedVersions: { next: '16.3.0' },
      framework: 'nextjs',
      mode: 'development',
      successMessage: runtimeSuccess.nextjs,
      version: '16',
    },
  },
  {
    id: 'electron-development',
    kind: 'electron-development',
    spec: 'specs/electron-development.spec.ts',
    root: electronRoot,
    baseURL: 'about:blank',
    cdpPort: 9225,
    metadata: {
      expectedVersions: { 'electron-vite': '5.0.0', vite: '7.3.6' },
      framework: 'electron',
      mode: 'development',
      version: '5',
    },
  },
  {
    id: 'electron-example-development',
    kind: 'electron-development',
    spec: 'specs/electron-development.spec.ts',
    root: electronExampleRoot,
    baseURL: 'about:blank',
    cdpPort: 9226,
    metadata: {
      example: true,
      expectedVersions: { 'electron-vite': '6.0.0-beta.1', vite: '8.0.10' },
      framework: 'electron',
      mode: 'development',
      successMessage: 'OpenSCAD rendered through @taucad/runtime in an Electron utility process.',
      version: '6-beta',
    },
  },
] as const satisfies readonly ReactE2ETarget[];

const targetById = new Map<string, ReactE2ETarget>(reactE2ETargets.map((target) => [target.id, target]));

export const resolveReactE2ETarget = (targetId: string): ReactE2ETarget => {
  const target = targetById.get(targetId);
  if (!target) {
    throw new TypeError(`Unknown React E2E target: ${targetId}`);
  }
  return target;
};

export const selectedReactE2ETargets = (arguments_: readonly string[] = process.argv): readonly ReactE2ETarget[] => {
  const selected = new Set(
    arguments_.flatMap((argument, index, all) => {
      if (argument.startsWith('--project=')) {
        return [argument.slice('--project='.length)];
      }
      const next = all[index + 1];
      return argument === '--project' && next ? [next] : [];
    }),
  );
  return selected.size === 0 ? reactE2ETargets : [...selected].map((id) => resolveReactE2ETarget(id));
};

export const reactE2EEnvironment = (target: ReactE2ETarget): Record<string, string> => ({
  ...Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ),
  FORCE_COLOR: '0',
  NO_COLOR: '1',
  TAU_PROJECT_ROOT: resolve(target.root, 'workspace'),
  ...(target.metadata.deployment ? { TAU_REACT_E2E_DEPLOYMENT: target.metadata.deployment } : {}),
});
