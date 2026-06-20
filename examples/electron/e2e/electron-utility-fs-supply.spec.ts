/**
 * Playwright coverage for host-local filesystem supply in Topology C:
 * disk-seeded entry file, editor → disk persistence, and no Vitest strings
 * in the production renderer bundle.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect, _electron as electron } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const MAIN_ENTRY = resolve(APP_ROOT, 'dist/main/index.js');
const PROJECT_DIR = join(APP_ROOT, '.tau-project');
const SEEDED_FILE = join(PROJECT_DIR, 'seeded.scad');
const MAIN_SCAD = join(PROJECT_DIR, 'main.scad');

test.describe('Electron utility FS supply (host-local)', () => {
  test.beforeAll(() => {
    mkdirSync(PROJECT_DIR, { recursive: true });
    writeFileSync(SEEDED_FILE, '// e2e-disk-seed\ncube(10);\n', 'utf8');
  });

  test('Open disk-seeded model via debug control updates geometry', async () => {
    const app = await electron.launch({
      args: [MAIN_ENTRY],
      cwd: APP_ROOT,
      env: { ...process.env, TAU_ELECTRON_DEBUG: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    try {
      const window = await app.firstWindow();
      await window.waitForSelector('[data-testid="app-root"]');
      await expect(window.getByTestId('open-seeded')).toBeVisible();
      await window.getByTestId('open-seeded').click();
      await expect(window.getByTestId('bbox-size')).toHaveText('[0.010, 0.010, 0.010]');
    } finally {
      await app.close();
    }
  });

  test('Editor updates persist to the utility project directory on disk', async () => {
    const marker = `e2e-disk-write-${Date.now()}`;
    const app = await electron.launch({
      args: [MAIN_ENTRY],
      cwd: APP_ROOT,
      env: { ...process.env, TAU_ELECTRON_DEBUG: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    try {
      const window = await app.firstWindow();
      await window.waitForSelector('[data-testid="app-root"]');
      const editor = window.getByTestId('editor');
      await editor.fill(`${marker}\nlength=200;\ncube(length);\n`);
      await expect.poll(() => existsSync(MAIN_SCAD) && readFileSync(MAIN_SCAD, 'utf8').includes(marker)).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('built renderer chunks do not import vitest (`from "vitest"`)', () => {
    const assetsDirectory = join(APP_ROOT, 'dist/renderer/assets');
    const vitestImport = /\bfrom\s+["']vitest["']/;
    const vitestRequire = /\brequire\s*\(\s*["']vitest["']\s*\)/;
    const entries = readdirSync(assetsDirectory).filter((name) => name.endsWith('.js'));
    expect(entries.length).toBeGreaterThan(0);
    for (const name of entries) {
      const text = readFileSync(join(assetsDirectory, name), 'utf8');
      expect(vitestImport.test(text)).toBe(false);
      expect(vitestRequire.test(text)).toBe(false);
    }
  });
});
