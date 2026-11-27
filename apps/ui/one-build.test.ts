// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line no-restricted-imports -- this test reads the build's own chunk rule.
import { cloudCoreModulePattern } from './vite.config.js';
import { zooNeutralCloseMessages } from '#cloud/zoo-close-messages.js';

/*
 * One build (adaptive app deployment mode charter W12): no build variable selects a deployment ceiling, so every web,
 * desktop and `tau serve` bundle is the same adaptive app, and the API's deployment answer is the only switch.
 */

const workspace = join(import.meta.dirname, '../..');

/** The tracked files of the UI and desktop projects (the API keeps its own `TAU_CLOUD_ENABLED`, its funding switch). */
const ownedFiles = (): string[] =>
  execFileSync(
    'git',
    ['ls-files', 'apps/ui', 'apps/desktop', 'apps/libs/billing-ui', 'apps/libs/desktop-services-host'],
    { cwd: workspace, encoding: 'utf8' },
  )
    .split('\n')
    .filter((file) => file !== '');

describe('one build', () => {
  it('should name no deployment ceiling in a file name', () => {
    expect(
      ownedFiles().filter((file) => /\.(?:cloud|self-host|adaptive)(?:\.[\w-]+)*\.[cm]?[jt]sx?$/u.test(file)),
    ).toEqual([]);
  });

  it('should read no ceiling variable and import no ceiling module (a repository search)', () => {
    const named = ownedFiles()
      .filter((file) => /\.(?:[cm]?[jt]sx?|ya?ml|json|toml)$/u.test(file) && file !== 'apps/ui/one-build.test.ts')
      .filter((file) => {
        const source = readFileSync(join(workspace, file), 'utf8');
        return /TAU_CLOUD_ENABLED|deploymentCeiling|deployment-ceiling|resolveTauDeploymentCeiling/u.test(source);
      });
    expect(named).toEqual([]);
  });

  it('should leave no ambient declaration of the deleted define (T-BA15)', () => {
    expect(readFileSync(join(import.meta.dirname, 'vite-environment.d.ts'), 'utf8')).not.toContain(
      'tauCloudBuildEnabled',
    );
  });

  it('should leave main, preload and the services host without the define (T-BA16)', () => {
    for (const file of [
      'apps/desktop/electron.vite.config.ts',
      'apps/desktop/src/build-environment.d.ts',
      'apps/desktop/vitest.config.ts',
      'apps/libs/desktop-services-host/src/build-environment.d.ts',
      'apps/libs/desktop-services-host/vitest.config.ts',
    ]) {
      expect(readFileSync(join(workspace, file), 'utf8'), file).not.toContain('tauCloudBuildEnabled');
    }
  });

  it("should give main's Zoo close-code map the web app's neutral sentences (D11)", () => {
    const desktopMap = readFileSync(
      join(import.meta.dirname, '../libs/desktop-services-host/src/zoo-close-errors.ts'),
      'utf8',
    );
    expect(desktopMap).toContain(`4402: '${zooNeutralCloseMessages.credits}'`);
    expect(desktopMap).toContain(`4403: '${zooNeutralCloseMessages.pro}'`);
  });
});

describe('cloudCoreModulePattern', () => {
  it('should hold the display-mode owner and its utilities only', () => {
    const root = '/repo/apps/ui/app';
    expect(cloudCoreModulePattern.test(`${root}/runtime/deployment.machine.ts`)).toBe(true);
    expect(cloudCoreModulePattern.test(`${root}/runtime/deployment.ts`)).toBe(true);
    expect(cloudCoreModulePattern.test(`${root}/cloud/deployment-mode.ts`)).toBe(true);
    expect(cloudCoreModulePattern.test('/repo/libs/utils/src/origin-answer.utils.ts')).toBe(true);
    expect(cloudCoreModulePattern.test('/repo/libs/types/src/deployment.ts')).toBe(true);
    expect(cloudCoreModulePattern.test(`${root}/runtime/app-runtime.ts`)).toBe(false);
    expect(cloudCoreModulePattern.test(`${root}/cloud/root-billing.tsx`)).toBe(false);
    expect(cloudCoreModulePattern.test('/repo/apps/libs/billing-ui/src/db/billing-snapshot-database.ts')).toBe(false);
  });
});
