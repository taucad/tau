import { describe, expect, it } from 'vitest';
/* oxlint-disable eslint/no-restricted-imports -- This test exercises the build configuration seam directly. */
import {
  resolveServiceWorkerKillSwitch,
  resolveTauBuildRelease,
  resolveTauDeploymentCeiling,
  resolveUiBuildDirectory,
  resolveTauTelemetryHostCloud,
} from './build-environment.js';
/* oxlint-enable eslint/no-restricted-imports */

describe('resolveTauDeploymentCeiling', () => {
  it.each([
    [undefined, 'self-host'],
    ['false', 'self-host'],
    ['true', 'cloud'],
    ['adaptive', 'adaptive'],
  ])('resolves %s to %s', (value, expected) => {
    expect(resolveTauDeploymentCeiling(value)).toBe(expected);
  });

  it('rejects non-canonical values', () => {
    expect(() => resolveTauDeploymentCeiling('1')).toThrow('must be exactly true, false or adaptive');
    expect(() => resolveTauDeploymentCeiling('Adaptive')).toThrow('must be exactly true, false or adaptive');
  });
});

describe('resolveUiBuildDirectory', () => {
  it('defaults to build and takes one directory name', () => {
    expect(resolveUiBuildDirectory(undefined)).toBe('build');
    expect(resolveUiBuildDirectory('build-adaptive')).toBe('build-adaptive');
    expect(() => resolveUiBuildDirectory('../elsewhere')).toThrow('one directory name');
  });
});

describe('resolveTauTelemetryHostCloud', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['true', false],
    ['Cloud', false],
    ['cloud', true],
  ])('resolves %s to %s', (value, expected) => {
    expect(resolveTauTelemetryHostCloud(value)).toBe(expected);
  });
});

/* eslint-disable @typescript-eslint/naming-convention -- the build environment's own variable names. */
describe('resolveTauBuildRelease', () => {
  const commit = 'abcdef0123456789abcdef0123456789abcdef01';

  it('should label a Netlify build by the first 12 hex of its commit', () => {
    expect(resolveTauBuildRelease({ COMMIT_REF: commit, GITHUB_SHA: '1'.repeat(40) })).toBe('abcdef012345');
  });

  it('should fall back to the GitHub Actions commit', () => {
    expect(resolveTauBuildRelease({ GITHUB_SHA: commit.toUpperCase() })).toBe('abcdef012345');
  });

  it.each([{}, { COMMIT_REF: 'HEAD' }, { COMMIT_REF: 'abc123' }])(
    'should leave a local build unlabelled (%o)',
    (env) => {
      expect(resolveTauBuildRelease(env)).toBeUndefined();
    },
  );
});
/* eslint-enable @typescript-eslint/naming-convention -- end of the build environment's variable names. */

describe('resolveServiceWorkerKillSwitch', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['true', true],
  ])('resolves %s to %s', (value, expected) => {
    expect(resolveServiceWorkerKillSwitch(value)).toBe(expected);
  });

  it('rejects non-canonical values, so a typo never ships the worker it meant to retire', () => {
    expect(() => resolveServiceWorkerKillSwitch('1')).toThrow(
      'TAU_SERVICE_WORKER_KILL_SWITCH must be exactly true or false',
    );
  });
});
