import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const omittedPrefixes = ['docs/reference/', 'docs/research/', 'repos/'];
const omittedFiles = new Set(['pnpm-lock.yaml']);

const repositoryFiles = (): readonly string[] => {
  const gitEnvironment = { ...process.env };
  gitEnvironment['GIT_CONFIG_GLOBAL'] = '/dev/null';
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    env: gitEnvironment,
  })
    .split('\0')
    .filter(
      (file) =>
        file.length > 0 && !omittedFiles.has(file) && !omittedPrefixes.some((prefix) => file.startsWith(prefix)),
    );
};

const textFiles = (): ReadonlyArray<readonly [path: string, source: string]> =>
  repositoryFiles().flatMap((path) => {
    const absolutePath = resolve(root, path);
    if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
      return [];
    }
    const source = readFileSync(absolutePath, 'utf8');
    return source.includes('\0') ? [] : [[path, source] as const];
  });

type ForbiddenPattern = readonly [pattern: string, label: string];

const findForbiddenViolations = (
  files: ReadonlyArray<readonly [path: string, source: string]>,
  forbidden: readonly ForbiddenPattern[],
): string[] =>
  files.flatMap(([path, source]) =>
    forbidden.flatMap(([pattern, label]) => (source.includes(pattern) ? [`${path}: ${label} (${pattern})`] : [])),
  );

const facadePatterns = (): readonly ForbiddenPattern[] => [
  [['@taucad/vitest', 'browser', 'test'].join('-'), 'shared facade package'],
  [['e2e', 'Dispatch'].join(''), 'generic dispatch command'],
  [['Locator', 'Step'].join(''), 'locator-step protocol'],
  [['Locator', 'Reference'].join(''), 'locator-reference protocol'],
  [['E2E', 'Action'].join(''), 'generic action protocol'],
  [['Browser', 'Test', 'Target'].join(''), 'facade target type'],
  [['Browser', 'Test', 'Command', 'Session'].join(''), 'facade session type'],
  [['Test', 'Info'].join(''), 'Playwright-shaped test metadata'],
];

const vitestPlaywrightConfigs = (): ReadonlyArray<readonly [path: string, source: string]> =>
  textFiles().filter(
    ([path, source]) =>
      /vitest(?:\.[^.]+)*\.config\.ts$/u.test(path) && source.includes("from '@vitest/browser-playwright'"),
  );

describe('Vitest Browser test-runner ownership', () => {
  it('keeps removed runner packages, configs, commands, and artifacts out of the repository', () => {
    const driverName = ['play', 'wright'].join('');
    const forbidden = [
      [`@${driverName}/test`, 'runner package'],
      [`@nx/${driverName}`, 'Nx runner plugin'],
      [`@axe-core/${driverName}`, 'runner-specific Axe adapter'],
      [`${driverName}.config`, 'runner config'],
      [`${driverName} test`, 'runner command'],
      [`dist/.${driverName}`, 'runner artifact root'],
    ] as const;
    const violations = findForbiddenViolations(textFiles(), forbidden);

    expect(violations).toEqual([]);
  });

  it('keeps the deleted facade protocol out of the repository', () => {
    const forbidden = facadePatterns();

    expect(findForbiddenViolations(textFiles(), forbidden)).toEqual([]);
    for (const [pattern] of forbidden) {
      expect(findForbiddenViolations([['fixture.ts', pattern]], forbidden)).toHaveLength(1);
    }
  });

  it('requires browser specs to import test and expect from Vitest', () => {
    const supportRunnerImport = /import\s*\{[^}]*\b(?:expect|test)\b[^}]*\}\s*from\s*['"][^'"]*support[^'"]*['"]/su;
    const violations = textFiles()
      .filter(([path, source]) => path.endsWith('.spec.ts') && supportRunnerImport.test(source))
      .map(([path]) => path);

    expect(violations).toEqual([]);
    expect(supportRunnerImport.test("import { expect, test } from './support/test';")).toBe(true);
  });

  it('confines the direct browser driver and install command to privileged boundaries', () => {
    const allowedDriverFiles = new Set([
      '.agents/skills/audit-ui/scripts/axe-audit.mjs',
      'apps/react-e2e/browser-command.ts',
      'apps/react-e2e/scripts/benchmark-bundler-products.mts',
      'scripts/src/reference-html.test.ts',
      'scripts/src/reference-html.ts',
    ]);
    const directDriverImport = /from\s+['"]playwright(?:\/test)?['"]/u;
    const driverFiles = textFiles()
      .filter(([, source]) => directDriverImport.test(source))
      .map(([path]) => path)
      .sort();
    const installCommand = `${['play', 'wright'].join('')} install`;
    const installFiles = textFiles()
      .filter(([, source]) => source.includes(installCommand))
      .map(([path]) => path);

    expect(driverFiles).toEqual([...allowedDriverFiles].sort());
    // The create-repo template is CI for generated repositories, not a Tau browser-driver site.
    expect(installFiles.sort()).toEqual(
      ['.agents/skills/create-repo/templates/ci.yml', '.github/workflows/ci.yml'].sort(),
    );
  });

  it('documents every Browser Mode write-access requirement', () => {
    const allowWrite = ['allow', 'Write: true'].join('');
    const documentedAllowWrite = new RegExp(
      String.raw`// Artifact requirement: [^\n]+\n\s*api: \{ ${allowWrite.replace(' ', String.raw`\s*`)} \}`,
      'u',
    );
    const allowWriteFiles = textFiles().filter(([, source]) => source.includes(allowWrite));

    expect(allowWriteFiles.map(([path]) => path).sort()).toEqual(
      [
        'apps/react-e2e/vitest.config.ts',
        'apps/ui-e2e/vitest.config.ts',
        'packages/plugins/rolldown/vitest.browser.benchmark.config.ts',
      ].sort(),
    );
    for (const [, source] of allowWriteFiles) {
      expect(source).toMatch(documentedAllowWrite);
    }
  });

  it('locks the Vitest family to one patched release', () => {
    const catalog = readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8');
    const lockfile = readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8');
    const catalogEntries = [
      "  '@vitest/browser-playwright': 4.1.11",
      "  '@vitest/coverage-v8': 4.1.11",
      "  '@vitest/ui': 4.1.11",
      '  vitest: 4.1.11',
    ];
    const lockedVersions = [
      ...lockfile.matchAll(/^\s{2}'?(?:@vitest\/(?:browser-playwright|coverage-v8|ui)|vitest)@([^':(]+)'?:$/gmu),
    ].map((match) => match[1]);

    for (const entry of catalogEntries) {
      expect(catalog).toContain(entry);
    }
    expect(new Set(lockedVersions)).toEqual(new Set(['4.1.11']));
  });

  it('launches every Vitest Playwright Chromium instance through managed full Chromium', () => {
    const configs = vitestPlaywrightConfigs();
    expect(configs.map(([path]) => path).sort()).toEqual(
      [
        'apps/react-e2e/vitest.bundlers.config.ts',
        'apps/react-e2e/vitest.config.ts',
        'apps/ui-e2e/vitest.config.ts',
        'packages/geospec-engine/e2e/vitest.config.ts',
        'packages/plugins/rolldown/vitest.browser.benchmark.config.ts',
        'packages/plugins/rolldown/vitest.browser.config.ts',
        'packages/plugins/rolldown/vitest.browser.nonisolated.config.ts',
      ].sort(),
    );

    for (const [path, source] of configs) {
      const chromiumInstances = source.match(/browser:\s*['"]chromium['"]/gu)?.length ?? 0;
      const managedChannels = source.match(/channel:\s*['"]chromium['"]/gu)?.length ?? 0;
      expect(chromiumInstances, `${path} must declare at least one Chromium instance`).toBeGreaterThan(0);
      expect(managedChannels, `${path} must select managed full Chromium for every Chromium instance`).toBe(
        chromiumInstances,
      );
      expect(source, `${path} must keep headless ownership at the Vitest Browser level`).toMatch(
        /browser:\s*\{[\s\S]*?headless:\s*true/u,
      );
      expect(source, `${path} must not use ambient branded Chrome`).not.toMatch(/channel:\s*['"]chrome['"]/u);
      expect(source, `${path} must not put headless inside Playwright launchOptions`).not.toMatch(
        /launchOptions:\s*\{[^}]*headless:/u,
      );
    }
  });

  it('forbids capability skips in the required Chromium WebGPU cohort', () => {
    const requiredSpecs = new Set([
      'apps/ui-e2e/src/graphics-backend.spec.ts',
      'apps/ui-e2e/src/section-view-contour-fill.spec.ts',
      'apps/ui-e2e/src/section-view-control-restyle.spec.ts',
      'apps/ui-e2e/src/section-view-overlap-cap-shading.spec.ts',
      'apps/ui-e2e/src/section-view-overlap-performance-diagnostics.spec.ts',
      'apps/ui-e2e/src/shader-fixture.spec.ts',
      'apps/ui-e2e/src/user-project-thumbnail-generation.spec.ts',
    ]);
    const violations = textFiles()
      .filter(([path]) => requiredSpecs.has(path))
      .flatMap(([path, source]) =>
        [
          source.includes('WebGPU is not available in this browser runtime.') ? `${path}: capability skip` : undefined,
          source.includes('isWebGpuAvailable') ? `${path}: property-presence helper` : undefined,
        ].filter((violation): violation is string => violation !== undefined),
      );

    expect(violations).toEqual([]);
  });
});
