import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, createServer } from 'vite';
import type { UserConfig } from 'vite';
import { chromium } from 'playwright';

import { createCanvasConfig, resolveCanvasRoot } from '#canvas-vite.config.js';

const temporaryPaths: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('canvas Vite config', () => {
  it('should listen on the backend port allocated by Portless', () => {
    const artifacts = mkdtempSync(resolve(tmpdir(), 'tau-canvas-artifacts-'));
    temporaryPaths.push(artifacts);
    writeFileSync(resolve(artifacts, 'index.html'), '');
    writeFileSync(resolve(artifacts, 'main.tsx'), '');
    vi.stubEnv('PORT', '4819');
    expect(createCanvasConfig(artifacts, artifacts, artifacts).server?.port).toBe(4819);
    vi.stubEnv('PORT', undefined);
    expect(createCanvasConfig(artifacts, artifacts, artifacts).server?.port).toBeUndefined();
  });

  it('should reject paths outside the allowed artifacts root', () => {
    const artifacts = mkdtempSync(resolve(tmpdir(), 'tau-canvas-artifacts-'));
    temporaryPaths.push(artifacts);
    expect(() => resolveCanvasRoot(tmpdir(), artifacts)).toThrow(
      'TAU_CANVAS_PATH must be under docs/research/artifacts',
    );
  });

  it('should give each canvas its own dependency cache', () => {
    const artifacts = mkdtempSync(resolve(tmpdir(), 'tau-canvas-artifacts-'));
    temporaryPaths.push(artifacts);
    const cacheDirectories = ['first', 'second'].map((name) => {
      const canvas = resolve(artifacts, name);
      mkdirSync(canvas);
      writeFileSync(resolve(canvas, 'index.html'), '');
      writeFileSync(resolve(canvas, 'main.tsx'), '');
      return createCanvasConfig(resolveCanvasRoot(canvas, artifacts), artifacts, artifacts).cacheDir;
    });

    expect(cacheDirectories[0]).not.toBe(cacheDirectories[1]);
  });

  it('should accept fixture aliases in a Brain outside a linked worktree and refuse ones escaping it', () => {
    // A linked worktree's `docs/research` symlinks into the owning checkout's Brain, outside the worktree.
    const repoRoot = resolve(import.meta.dirname, '../..');
    const brain = mkdtempSync(resolve(tmpdir(), 'tau-canvas-brain-'));
    const outside = mkdtempSync(resolve(tmpdir(), 'tau-canvas-outside-'));
    const fixtureParent = resolve(repoRoot, 'out/research');
    mkdirSync(fixtureParent, { recursive: true });
    const worktreeDocs = mkdtempSync(resolve(fixtureParent, 'canvas-worktree-'));
    temporaryPaths.push(brain, outside, worktreeDocs);
    symlinkSync(brain, resolve(worktreeDocs, 'research'));
    const artifacts = resolve(worktreeDocs, 'research/artifacts');
    const canvas = resolve(artifacts, 'canvas');
    mkdirSync(canvas, { recursive: true });
    for (const entry of ['index.html', 'main.tsx', 'fixtures.tsx']) {
      writeFileSync(resolve(canvas, entry), '');
    }
    writeFileSync(resolve(outside, 'secret.tsx'), '');
    symlinkSync(resolve(outside, 'secret.tsx'), resolve(canvas, 'escape.tsx'));
    const root = resolveCanvasRoot(canvas, artifacts);
    const withAlias = (target: string): UserConfig => {
      writeFileSync(
        resolve(canvas, 'canvas.aliases.json'),
        JSON.stringify({ '#hooks/use-graphics.js': relative(repoRoot, resolve(canvas, target)) }),
      );
      return createCanvasConfig(root, outside, artifacts);
    };

    expect(withAlias('fixtures.tsx').root).toBe(realpathSync(canvas));
    expect(() => withAlias('escape.tsx')).toThrow('Canvas fixture aliases must remain inside the Tau checkout');
  });

  it('should compile React, Tau components, tokens, Tailwind, and Geist fonts', { timeout: 30_000 }, async () => {
    const artifacts = mkdtempSync(resolve(tmpdir(), 'tau-canvas-artifacts-'));
    const canvas = resolve(artifacts, 'canvas');
    const output = mkdtempSync(resolve(tmpdir(), 'tau-canvas-output-'));
    const repoRoot = resolve(import.meta.dirname, '../..');
    const fixtureParent = resolve(repoRoot, 'out/research');
    mkdirSync(fixtureParent, { recursive: true });
    const fixtureDirectory = mkdtempSync(resolve(fixtureParent, 'canvas-fixture-'));
    const fixturePath = resolve(fixtureDirectory, 'button.tsx');
    temporaryPaths.push(artifacts, output, fixtureDirectory);
    writeFileSync(
      fixturePath,
      "import {Button} from '@taucad/ui/components/button'; export const CanvasButton=()=> <Button className='grid grid-cols-[137px_1fr] bg-primary font-mono'>Canvas</Button>;",
    );
    mkdirSync(canvas);
    writeFileSync(
      resolve(canvas, 'index.html'),
      '<div id="root"></div><script type="module" src="/main.tsx"></script>',
    );
    writeFileSync(
      resolve(canvas, 'main.tsx'),
      "import React from 'react'; import {createRoot} from 'react-dom/client'; import {CanvasButton} from '#components/canvas-fixture.js'; createRoot(document.getElementById('root')!).render(<CanvasButton/>);",
    );
    writeFileSync(
      resolve(canvas, 'canvas.aliases.json'),
      JSON.stringify({
        '#components/canvas-fixture.js': relative(repoRoot, fixturePath),
      }),
    );

    const root = resolveCanvasRoot(canvas, artifacts);
    await build({ ...createCanvasConfig(root, output, artifacts), logLevel: 'silent' });

    const assets = resolve(output, 'canvas/assets');
    const css = readFileSync(resolve(assets, readdirSync(assets).find((file) => file.endsWith('.css'))!), 'utf8');
    const javascript = readFileSync(resolve(assets, readdirSync(assets).find((file) => file.endsWith('.js'))!), 'utf8');
    expect(css).toContain('font-family:Geist Sans');
    expect(css).toContain('--primary:');
    expect(css).toContain('.bg-primary');
    expect(css).toContain('grid-template-columns:137px 1fr');
    expect(javascript).toContain('Canvas');

    const server = await createServer({
      ...createCanvasConfig(root, output, artifacts),
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, fs: { allow: [root, resolve(import.meta.dirname, '../..')] } },
    });
    try {
      await server.listen();
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(server.resolvedUrls!.local[0]!);
        const button = page.getByRole('button', { name: 'Canvas', exact: true });
        await button.waitFor();
        expect(await button.evaluate((element) => getComputedStyle(element).display)).toBe('grid');
        expect(await button.evaluate((element) => getComputedStyle(element).height)).toBe('32px');
        expect(await button.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Geist Mono');
        expect(await button.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).toMatch(/^137px /);
      } finally {
        await browser.close();
      }
    } finally {
      await server.close();
    }

    writeFileSync(resolve(canvas, 'canvas.aliases.json'), JSON.stringify({ react: '/tmp/fixture.ts' }));
    expect(() => createCanvasConfig(root, output, artifacts)).toThrow(
      'Canvas aliases require # imports and repository-relative fixture paths',
    );
  });

  it(
    'should let a reviewer pin a comment, keep it across reloads and commit it on Finish',
    { timeout: 60_000 },
    async () => {
      const repository = realpathSync(mkdtempSync(resolve(tmpdir(), 'tau-canvas-review-')));
      temporaryPaths.push(repository);
      const artifacts = resolve(repository, 'artifacts');
      const canvas = resolve(artifacts, 'demo');
      mkdirSync(canvas, { recursive: true });
      writeFileSync(
        resolve(canvas, 'index.html'),
        '<div id="root"></div><script type="module" src="/main.tsx"></script>',
      );
      writeFileSync(
        resolve(canvas, 'main.tsx'),
        "document.getElementById('root')!.innerHTML = `<section data-review-scenario='s1'><h1>Board</h1><button onclick='document.title=\"clicked\"'>Save</button></section>`;",
      );
      const git = (...arguments_: string[]): string =>
        execFileSync('git', arguments_, { cwd: repository, encoding: 'utf8' }).trim();
      git('init', '--quiet');
      git('config', 'user.name', 'Reviewer');
      git('config', 'user.email', 'reviewer@example.com');
      git('config', 'commit.gpgsign', 'false');
      git('add', '.');
      git('commit', '--quiet', '-m', 'init');

      const output = mkdtempSync(resolve(tmpdir(), 'tau-canvas-output-'));
      temporaryPaths.push(output);
      const server = await createServer({
        ...createCanvasConfig(resolveCanvasRoot(canvas, artifacts), output, artifacts),
        configFile: false,
        logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0, fs: { allow: [repository, resolve(import.meta.dirname, '../..')] } },
      });
      try {
        await server.listen();
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await page.goto(server.resolvedUrls!.local[0]!);
          await page.getByRole('button', { name: 'Feedback · 0 open' }).waitFor();

          await page.keyboard.press('c');
          await page.getByRole('button', { name: 'Save', exact: true }).click();
          expect(await page.title()).not.toBe('clicked');
          await page.getByRole('textbox', { name: 'Comment' }).fill('Say what is saved.');
          // The canvas reloads when its source changes mid-review; the unsent draft survives.
          await page.reload();
          await expect
            .poll(async () => page.getByRole('textbox', { name: 'Comment' }).inputValue())
            .toBe('Say what is saved.');
          await page.getByRole('textbox', { name: 'Comment' }).press('Control+Enter');
          await page.getByRole('button', { name: 'Comment 1: Save' }).waitFor();

          const [file] = readdirSync(resolve(canvas, 'review'));
          const event: unknown = JSON.parse(readFileSync(resolve(canvas, 'review', file!), 'utf8'));
          expect(event).toMatchObject({
            type: 'comment',
            author: { kind: 'person', name: 'Reviewer' },
            body: 'Say what is saved.',
            anchor: { target: { kind: 'role', role: 'button', name: 'Save' }, excerpt: 'Save' },
            context: { canvas: 'demo', scenario: 's1' },
          });
          expect(JSON.stringify(event)).toMatch(/"source":"sha256:[\da-f]{64}"/);

          await page.reload();
          await page.getByRole('button', { name: 'Comment 1: Save' }).click();
          await page.getByRole('dialog', { name: 'Comment 1' }).getByText('Say what is saved.').waitFor();
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: 'Feedback · 1 open' }).click();
          await page.getByRole('button', { name: 'Finish review' }).click();
          await page.getByText(/^Committed 1 events as /).waitFor();
          expect(git('log', '-1', '--format=%s')).toBe('docs(research): Record review feedback on demo');
          expect(git('status', '--porcelain')).toBe('');
        } finally {
          await browser.close();
        }
      } finally {
        await server.close();
      }
    },
  );

  it(
    'should let a reviewer decide API guide questions by keyboard and commit the decisions on Finish',
    { timeout: 90_000 },
    async () => {
      const repository = realpathSync(mkdtempSync(resolve(tmpdir(), 'tau-canvas-guide-')));
      temporaryPaths.push(repository);
      const artifacts = resolve(repository, 'artifacts');
      const canvas = resolve(artifacts, 'guide');
      mkdirSync(canvas, { recursive: true });
      writeFileSync(
        resolve(canvas, 'index.html'),
        '<div id="root"></div><script type="module" src="/main.tsx"></script>',
      );
      const question = (id: string, [recommended, other]: readonly [string, string]): Record<string, unknown> => ({
        id,
        question: `Which ${id}?`,
        context: 'What hangs on it.',
        options: [
          { label: `\`${recommended}\``, consequence: 'The first.', recommended: true },
          { label: other, consequence: 'The second.' },
        ],
        recommendation: 'Because it is simpler.',
      });
      const guide = {
        title: 'Demo',
        status: 'in-review',
        revision: 1,
        owner: 'demo',
        oneLine: 'Demo.',
        problem: { summary: 'None.', today: [], pains: [] },
        contract: [],
        options: [],
        shared: [],
        failures: [],
        questions: [question('q1', ['alpha', 'beta']), question('q2', ['gamma', 'delta'])],
        blastRadius: [],
        decisions: [],
        evidence: { typescript: '5.9', project: 'demo', files: {} },
      };
      writeFileSync(
        resolve(canvas, 'main.tsx'),
        `import { mountApiGuide } from '@tau/api-guide'; mountApiGuide(${JSON.stringify(guide)});`,
      );
      const git = (...arguments_: string[]): string =>
        execFileSync('git', arguments_, { cwd: repository, encoding: 'utf8' }).trim();
      git('init', '--quiet');
      git('config', 'user.name', 'Reviewer');
      git('config', 'user.email', 'reviewer@example.com');
      git('config', 'commit.gpgsign', 'false');
      git('add', '.');
      git('commit', '--quiet', '-m', 'init');

      const output = mkdtempSync(resolve(tmpdir(), 'tau-canvas-output-'));
      temporaryPaths.push(output);
      const server = await createServer({
        ...createCanvasConfig(resolveCanvasRoot(canvas, artifacts), output, artifacts),
        configFile: false,
        logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0, fs: { allow: [repository, resolve(import.meta.dirname, '../..')] } },
      });
      try {
        await server.listen();
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await page.goto(server.resolvedUrls!.local[0]!);
          const alpha = page.getByRole('radio', { name: 'alpha Recommended' });
          await expect.poll(async () => alpha.getAttribute('aria-checked')).toBe('true');

          // Enter confirms the preselected recommendation and moves to the next open question.
          await alpha.focus();
          await page.keyboard.press('Enter');
          const focused = async (): Promise<string | undefined> => page.evaluate(() => document.activeElement?.id);
          await expect.poll(focused).toBe('question-q2-option-1');
          // A digit picks another choice; after the last question, focus lands on Finish review.
          await page.keyboard.press('2');
          await page.keyboard.press('Enter');
          await expect.poll(focused).toBe('finish-review');
          await page.getByRole('status').getByText('2 of 2 decided').waitFor();

          const bodies = readdirSync(resolve(canvas, 'review')).map(
            (file) => (JSON.parse(readFileSync(resolve(canvas, 'review', file), 'utf8')) as { body: string }).body,
          );
          expect(bodies.toSorted()).toEqual(['Decision q1: `alpha` (recommended)', 'Decision q2: delta']);
          // The cards show the decisions, so the review layer draws no pins for them.
          const pins = await page
            .locator('tau-review-layer')
            .evaluate((host) => host.shadowRoot?.querySelectorAll('.pin').length);
          expect(pins).toBe(0);

          await page.keyboard.press('Enter');
          await page.getByText(/^Committed 2 events as /).waitFor();
          expect(git('log', '-1', '--format=%s')).toBe('docs(research): Record review feedback on guide');
          expect(git('status', '--porcelain')).toBe('');
        } finally {
          await browser.close();
        }
      } finally {
        await server.close();
      }
    },
  );
});
