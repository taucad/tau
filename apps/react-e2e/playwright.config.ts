import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const reactEndToEndRoot = dirname(fileURLToPath(import.meta.url));
const nextAppRoot = resolve(reactEndToEndRoot, 'apps/nextjs');
const reactRouterAppRoot = resolve(reactEndToEndRoot, 'apps/react-router');
const nextExampleRoot = resolve(reactEndToEndRoot, '../../examples/nextjs');
const reactRouterExampleRoot = resolve(reactEndToEndRoot, '../../examples/react-router');
const nextBin = resolve(nextAppRoot, 'node_modules/.bin/next');
const nextExampleBin = resolve(nextExampleRoot, 'node_modules/.bin/next');
const reactRouterBin = resolve(reactRouterAppRoot, 'node_modules/.bin/react-router');
const reactRouterExampleBin = resolve(reactRouterExampleRoot, 'node_modules/.bin/react-router');
const viteBin = resolve(reactRouterAppRoot, 'node_modules/.bin/vite');
const viteExampleBin = resolve(reactRouterExampleRoot, 'node_modules/.bin/vite');
const deploymentEnvironment = 'TAU_REACT_E2E_DEPLOYMENT';

const selectedProjects = new Set(
  process.argv.flatMap((argument, index, args) => {
    if (argument.startsWith('--project=')) {
      return [argument.slice('--project='.length)];
    }

    if (argument === '--project' && args[index + 1]) {
      return [args[index + 1]];
    }

    return [];
  }),
);

const shouldStartWebServer = (projectName: string): boolean =>
  selectedProjects.size === 0 || selectedProjects.has(projectName);

const browserServer = ({
  project,
  command,
  cwd,
  url,
  deployment,
}: {
  readonly project: string;
  readonly command: string;
  readonly cwd: string;
  readonly url: string;
  readonly deployment?: 'isolated' | 'non-isolated';
}) =>
  shouldStartWebServer(project) && {
    command,
    cwd,
    env: deployment ? { [deploymentEnvironment]: deployment } : undefined,
    url,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  };

export default defineConfig({
  testDir: './specs',
  timeout: 180_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  reporter: 'list',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    browserServer({
      project: 'nextjs-isolated',
      command: `${nextBin} build && ${nextBin} start -H 127.0.0.1 -p 3101`,
      cwd: nextAppRoot,
      url: 'http://127.0.0.1:3101',
      deployment: 'isolated',
    }),
    browserServer({
      project: 'react-router-isolated',
      command: `${reactRouterBin} build && ${viteBin} preview --outDir build-isolated/client --host 127.0.0.1 --port 3102`,
      cwd: reactRouterAppRoot,
      url: 'http://127.0.0.1:3102',
      deployment: 'isolated',
    }),
    browserServer({
      project: 'nextjs-non-isolated',
      command: `${nextBin} build && ${nextBin} start -H 127.0.0.1 -p 3103`,
      cwd: nextAppRoot,
      url: 'http://127.0.0.1:3103',
      deployment: 'non-isolated',
    }),
    browserServer({
      project: 'react-router-non-isolated',
      command: `${reactRouterBin} build && ${viteBin} preview --outDir build-non-isolated/client --host 127.0.0.1 --port 3104`,
      cwd: reactRouterAppRoot,
      url: 'http://127.0.0.1:3104',
      deployment: 'non-isolated',
    }),
    browserServer({
      project: 'react-router-example',
      command: `${reactRouterExampleBin} build && ${viteExampleBin} preview --outDir build/client --host 127.0.0.1 --port 3105`,
      cwd: reactRouterExampleRoot,
      url: 'http://127.0.0.1:3105',
    }),
    browserServer({
      project: 'nextjs-example',
      command: `${nextExampleBin} build --turbopack && ${nextExampleBin} start -H 127.0.0.1 -p 3106`,
      cwd: nextExampleRoot,
      url: 'http://127.0.0.1:3106',
    }),
    browserServer({
      project: 'react-router-development',
      command: `${reactRouterBin} dev --host 127.0.0.1 --port 3111 --strictPort`,
      cwd: reactRouterAppRoot,
      url: 'http://127.0.0.1:3111',
      deployment: 'isolated',
    }),
    browserServer({
      project: 'react-router-example-development',
      command: `${reactRouterExampleBin} dev --host 127.0.0.1 --port 3112 --strictPort`,
      cwd: reactRouterExampleRoot,
      url: 'http://127.0.0.1:3112',
    }),
    browserServer({
      project: 'nextjs-development',
      command: `${nextBin} dev -H 127.0.0.1 -p 3113`,
      cwd: nextAppRoot,
      url: 'http://127.0.0.1:3113',
      deployment: 'isolated',
    }),
    browserServer({
      project: 'nextjs-example-development',
      command: `${nextExampleBin} dev --turbopack -H 127.0.0.1 -p 3114`,
      cwd: nextExampleRoot,
      url: 'http://127.0.0.1:3114',
    }),
  ].filter((server) => server !== false),
  projects: [
    {
      name: 'nextjs-isolated',
      testMatch: /nextjs\.spec\.ts/,
      metadata: { deployment: 'isolated', framework: 'nextjs' },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3101',
      },
    },
    {
      name: 'react-router-isolated',
      testMatch: /react-router\.spec\.ts/,
      metadata: { deployment: 'isolated', framework: 'react-router' },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3102',
      },
    },
    {
      name: 'nextjs-non-isolated',
      testMatch: /nextjs\.spec\.ts/,
      metadata: { deployment: 'non-isolated', framework: 'nextjs' },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3103',
      },
    },
    {
      name: 'react-router-non-isolated',
      testMatch: /react-router\.spec\.ts/,
      metadata: { deployment: 'non-isolated', framework: 'react-router' },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3104',
      },
    },
    {
      name: 'react-router-example',
      testMatch: /react-router-example\.spec\.ts/,
      metadata: { framework: 'react-router', version: '8' },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3105',
      },
    },
    {
      name: 'nextjs-example',
      testMatch: /nextjs-example\.spec\.ts/,
      metadata: { framework: 'nextjs', version: '16' },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3106',
      },
    },
    {
      name: 'electron',
      testMatch: /electron\.spec\.ts/,
    },
    {
      name: 'electron-example',
      testMatch: /electron-example\.spec\.ts/,
    },
    {
      name: 'react-router-development',
      testMatch: /framework-development\.spec\.ts/,
      metadata: { deployment: 'isolated', framework: 'react-router', mode: 'development', version: '7' },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3111',
      },
    },
    {
      name: 'react-router-example-development',
      testMatch: /framework-development\.spec\.ts/,
      metadata: { framework: 'react-router', mode: 'development', version: '8' },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3112',
      },
    },
    {
      name: 'nextjs-development',
      testMatch: /framework-development\.spec\.ts/,
      metadata: { deployment: 'isolated', framework: 'nextjs', mode: 'development', version: '15' },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3113',
      },
    },
    {
      name: 'nextjs-example-development',
      testMatch: /framework-development\.spec\.ts/,
      metadata: { framework: 'nextjs', mode: 'development', version: '16' },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3114',
      },
    },
    {
      name: 'electron-development',
      testMatch: /electron-development\.spec\.ts/,
      metadata: { framework: 'electron', mode: 'development', version: '5' },
    },
    {
      name: 'electron-example-development',
      testMatch: /electron-development\.spec\.ts/,
      metadata: { framework: 'electron', mode: 'development', version: '6-beta' },
    },
  ],
});
