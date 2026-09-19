import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { build, createServer } from 'vite';
import { chromium } from 'playwright';

import { createCanvasConfig, resolveCanvasRoot } from '#canvas-vite.config.js';

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('canvas Vite config', () => {
  it('should reject paths outside the allowed artifacts root', () => {
    const artifacts = mkdtempSync(resolve(tmpdir(), 'tau-canvas-artifacts-'));
    temporaryPaths.push(artifacts);
    expect(() => resolveCanvasRoot(tmpdir(), artifacts)).toThrow(
      'TAU_CANVAS_PATH must be under docs/research/artifacts',
    );
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
});
