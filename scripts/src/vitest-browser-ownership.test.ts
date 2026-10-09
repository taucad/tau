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

// Scan once before test timeouts start; every assertion uses the same complete Git inventory.
const sourceFiles = textFiles();

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
  sourceFiles.filter(
    ([path, source]) =>
      // Match the provider call, not its import: configs may wrap `playwright()` to retype it for their Vitest copy.
      /vitest(?:\.[^.]+)*\.config\.ts$/u.test(path) && /provider:\s*playwright(?:Provider)?\(/u.test(source),
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
    const violations = findForbiddenViolations(sourceFiles, forbidden);

    expect(violations).toEqual([]);
  });

  it('keeps the deleted facade protocol out of the repository', () => {
    const forbidden = facadePatterns();

    expect(findForbiddenViolations(sourceFiles, forbidden)).toEqual([]);
    for (const [pattern] of forbidden) {
      expect(findForbiddenViolations([['fixture.ts', pattern]], forbidden)).toHaveLength(1);
    }
  });

  it('requires browser specs to import test and expect from Vitest', () => {
    const supportRunnerImport = /import\s*\{[^}]*\b(?:expect|test)\b[^}]*\}\s*from\s*['"][^'"]*support[^'"]*['"]/su;
    const violations = sourceFiles
      .filter(([path, source]) => path.endsWith('.spec.ts') && supportRunnerImport.test(source))
      .map(([path]) => path);

    expect(violations).toEqual([]);
    expect(supportRunnerImport.test("import { expect, test } from './support/test';")).toBe(true);
  });

  it('confines the direct browser driver and install command to privileged boundaries', () => {
    const allowedDriverFiles = new Set([
      '.agents/skills/audit-ui/scripts/axe-audit.mjs',
      // The staging billing harness pays a hosted Stripe Checkout in headless Chromium, which Browser Mode cannot
      // host; its specs reach the driver only through this module.
      'apps/billing-e2e/src/support/checkout.ts',
      'apps/desktop-e2e/src/desktop-assimp.spec.ts',
      'apps/desktop-e2e/src/desktop-build123d.spec.ts',
      'apps/desktop-e2e/src/desktop-chat-acp.spec.ts',
      'apps/desktop-e2e/src/desktop-chat-in-project.spec.ts',
      'apps/desktop-e2e/src/desktop-community-preview.spec.ts',
      'apps/desktop-e2e/src/desktop-converter.spec.ts',
      'apps/desktop-e2e/src/desktop-ephemeral-isolation.spec.ts',
      'apps/desktop-e2e/src/desktop-kernel-utility-cap.spec.ts',
      'apps/desktop-e2e/src/desktop-machine-profiles.spec.ts',
      'apps/desktop-e2e/src/desktop-main-editor-kernels.spec.ts',
      'apps/desktop-e2e/src/desktop-native-payload.spec.ts',
      'apps/desktop-e2e/src/desktop-print-dry-run.spec.ts',
      'apps/desktop-e2e/src/desktop-voice.spec.ts',
      'apps/desktop-e2e/src/support/desktop-app.ts',
      'apps/desktop-e2e/src/support/gateway-fixture.ts',
      'apps/desktop-e2e/src/support/revisions-pane.ts',
      'apps/desktop-e2e/src/support/scenario.ts',
      'apps/desktop-e2e/src/support/two-client/browser-client.ts',
      'apps/desktop-e2e/src/support/two-client/git-faults.test.ts',
      'apps/desktop-e2e/src/support/two-client/git-faults.ts',
      'apps/desktop-e2e/src/two-client.spec.ts',
      'apps/docs/scripts/verify-browser.mts',
      'apps/react-e2e/browser-command.ts',
      'apps/react-e2e/scripts/benchmark-bundler-products.mts',
      'apps/ui-e2e/src/support/open-to-frame.ts',
      'apps/ui/app/components/panes/pane-resize.vitest.browser.config.ts',
      'packages/geospec-engine-native/bindings/browser-conformance/qualify-mt-product.mjs',
      'packages/geospec-engine-native/bindings/browser-conformance/run-browser-conformance.ts',
      'scripts/src/canvas-vite.config.test.ts',
      'scripts/src/check-pack-install.ts',
      // The README hero capture drives the Electron desktop app, which Browser Mode cannot host.
      'scripts/src/readme-hero-capture.ts',
      'scripts/src/reference-html.test.ts',
      'scripts/src/reference-html.ts',
    ]);
    const directDriverImport = /from\s+['"]playwright(?:\/test)?['"]/u;
    const driverFiles = sourceFiles
      .filter(([, source]) => directDriverImport.test(source))
      .map(([path]) => path)
      .sort();
    const installCommand = `${['play', 'wright'].join('')} install`;
    const installFiles = sourceFiles.filter(([, source]) => source.includes(installCommand)).map(([path]) => path);

    expect(driverFiles).toEqual([...allowedDriverFiles].sort());
    // The create-repo template is CI for generated repositories, not a Tau browser-driver site.
    // The docs deployment gate installs Chromium on the Netlify builder unless one is supplied.
    // The staging billing harness workflow installs Chromium for the hosted Checkout its rows pay.
    expect(installFiles.sort()).toEqual(
      [
        '.agents/skills/create-repo/templates/ci.yml',
        '.github/workflows/billing-staging-e2e.yml',
        '.github/workflows/e2e-nightly.yml',
        'apps/docs/project.json',
      ].sort(),
    );
  });

  it('documents every Browser Mode write-access requirement', () => {
    const allowWrite = ['allow', 'Write: true'].join('');
    const documentedAllowWrite = new RegExp(
      String.raw`// Artifact requirement: [^\n]+\n\s*api: \{ ${allowWrite.replace(' ', String.raw`\s*`)} \}`,
      'u',
    );
    const allowWriteFiles = sourceFiles.filter(([, source]) => source.includes(allowWrite));

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
        'apps/ui/app/components/chat/chat-textarea.vitest.browser.config.ts',
        'apps/ui/app/components/code/code-editor.vitest.browser.config.ts',
        'apps/ui/app/components/geometry/graphics/svg/svg-viewer.vitest.browser.config.ts',
        'apps/ui/app/components/geometry/graphics/three/utils/gltf-batches.vitest.browser.config.ts',
        'apps/ui/app/components/geometry/graphics/three/viewer-resize.vitest.browser.config.ts',
        'apps/ui/app/components/panes/editor-layout.vitest.browser.config.ts',
        'apps/ui/app/components/panes/pane-resize.vitest.browser.config.ts',
        'apps/ui/app/components/printer/printer.vitest.browser.config.ts',
        'apps/ui/app/routes/w.$workspace.$project/chat-history.vitest.browser.config.ts',
        'apps/ui/app/routes/w.$workspace.$project/chat-print.vitest.browser.config.ts',
        'apps/ui/app/routes/w.$workspace.$project/chat-viewer.vitest.browser.config.ts',
        'apps/ui/app/workers/agent-host.vitest.browser.config.ts',
        'apps/ui/chat-revision-marker.vitest.browser.config.ts',
        'packages/agent-host/vitest.browser.config.ts',
        'packages/core/bundler/vitest.browser.config.ts',
        'packages/geospec-engine/e2e/vitest.config.ts',
        'packages/plugins/openrscad/e2e/vitest.config.ts',
        'packages/plugins/rolldown/vitest.browser.benchmark.config.ts',
        'packages/plugins/rolldown/vitest.browser.config.ts',
        'packages/plugins/rolldown/vitest.browser.nonisolated.config.ts',
        'packages/ui/vitest.browser.config.ts',
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
    const violations = sourceFiles
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
