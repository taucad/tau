/* oxlint-disable tau-lint/no-bare-time-identifier, typescript/consistent-type-definitions, typescript/no-restricted-types, typescript/promise-function-async, unicorn/no-await-expression-member -- Module augmentation and null DOM evidence mirror stable upstream contracts; direct command returns avoid redundant async frames. */
import { expect, inject } from 'vitest';
import type { Locator } from 'vitest/browser';
import { server } from 'vitest/browser';
import type { ReactE2ETargetMetadata } from './targets.js';

export type ReactProvidedTarget = {
  readonly baseURL: string;
  readonly id: string;
  readonly metadata: ReactE2ETargetMetadata;
};

export type ReactTargetInspection = {
  readonly electronExampleArtifacts?: {
    readonly mainIndex: boolean;
    readonly mainKernelHosts: number;
    readonly rendererKernelHosts: number;
  };
  readonly externalization?: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
  readonly runtimeArtifacts?: Readonly<Record<string, { readonly emitted: number; readonly excluded: number }>>;
  readonly versions: Readonly<Record<string, string>>;
};

export type ReactTargetState = {
  readonly count: number;
  readonly text: string | null;
  readonly value?: string;
  readonly visible: boolean;
};

export type ReactTargetDiagnostics = {
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly processOutput?: string;
  readonly screenshot?: string;
  readonly tracePath?: string;
  readonly url?: string;
};

export type ReactTargetSession = {
  readonly windowVisible?: boolean;
};

declare module 'vitest' {
  export interface ProvidedContext {
    reactE2ETarget: ReactProvidedTarget;
    reactTargetInspections: Readonly<Record<string, ReactTargetInspection>>;
  }
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    reactCaptureTargetDiagnostics(): Promise<ReactTargetDiagnostics>;
    reactClickTarget(selector: string): Promise<void>;
    reactCloseTarget(): Promise<void>;
    reactEditExternalElectronWorkspace(): Promise<void>;
    reactFillTarget(selector: string, value: string): Promise<void>;
    reactGetTargetSession(): Promise<ReactTargetSession>;
    reactNavigateTarget(path: string): Promise<Readonly<Record<string, string>>>;
    reactOpenTarget(targetId: string): Promise<ReactTargetSession>;
    reactReadTarget(selector: string): Promise<ReactTargetState>;
  }
}

const selectorFor = (locator: Locator | string): string => (typeof locator === 'string' ? locator : locator.selector);

export const currentReactTarget = (): ReactProvidedTarget => inject('reactE2ETarget');

export const currentTargetSession = (): Promise<ReactTargetSession> => server.commands.reactGetTargetSession();

export const clickTarget = async (locator: Locator | string): Promise<void> => {
  await server.commands.reactClickTarget(selectorFor(locator));
};

export const fillTarget = async (locator: Locator | string, value: string): Promise<void> => {
  await server.commands.reactFillTarget(selectorFor(locator), value);
};

export const navigateTarget = (path = '/'): Promise<Readonly<Record<string, string>>> =>
  server.commands.reactNavigateTarget(path);

export const readTarget = (locator: Locator | string): Promise<ReactTargetState> =>
  server.commands.reactReadTarget(selectorFor(locator));

export const expectTargetCount = async (locator: Locator | string, count: number): Promise<void> => {
  await expect.poll(async () => (await readTarget(locator)).count).toBe(count);
};

export const expectTargetText = async (locator: Locator | string, text: string, timeout = 120_000): Promise<void> => {
  await expect.poll(async () => (await readTarget(locator)).text, { timeout }).toBe(text);
};

export const expectTargetValue = async (locator: Locator | string, value: string, timeout = 120_000): Promise<void> => {
  await expect.poll(async () => (await readTarget(locator)).value, { timeout }).toBe(value);
};

export const expectTargetVisible = async (locator: Locator | string, timeout = 120_000): Promise<void> => {
  await expect.poll(async () => (await readTarget(locator)).visible, { timeout }).toBe(true);
};

export const expectTargetInspection = (): void => {
  const target = currentReactTarget();
  const { metadata } = target;
  const report = inject('reactTargetInspections')[target.id];
  if (!report) {
    throw new TypeError(`React E2E target '${target.id}' has no setup inspection report.`);
  }
  expect(report.versions).toStrictEqual(metadata.expectedVersions);
  for (const [asset, counts] of Object.entries(report.runtimeArtifacts ?? {})) {
    expect(counts.emitted, `${asset} emitted once`).toBe(1);
    expect(counts.excluded, `${asset} excluded from renderer`).toBe(0);
  }
  if (report.electronExampleArtifacts) {
    expect(report.electronExampleArtifacts).toStrictEqual({
      mainIndex: true,
      mainKernelHosts: 1,
      rendererKernelHosts: 0,
    });
  }
  for (const processReport of Object.values(report.externalization ?? {})) {
    expect(processReport).toStrictEqual({
      '@taucad/esbuild': !metadata.example,
      '@taucad/middleware': true,
      '@taucad/replicad': !metadata.example,
      '@taucad/runtime': false,
      '@taucad/runtime/electron/main': false,
      '@taucad/openrscad': Boolean(metadata.example),
      'replicad-opencascadejs': false,
      react: true,
      'react/jsx-runtime': true,
      electron: true,
      'node:fs': true,
    });
  }
};

export const editExternalElectronWorkspace = async (): Promise<void> => {
  await server.commands.reactEditExternalElectronWorkspace();
};
