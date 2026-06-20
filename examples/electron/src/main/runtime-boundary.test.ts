import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readLocal = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('Electron runtime boundary', () => {
  it('uses public runtime Electron helpers and selected kernel subpaths', () => {
    const mainSource = readLocal('./index.ts');
    const hostSource = readLocal('./kernel-host.ts');
    const runtimeSource = readLocal('./runtime-definition.ts');
    const preloadSource = readLocal('../preload/index.ts');
    const rendererSource = readLocal('../renderer/app.tsx');
    const viteSource = readLocal('../../electron.vite.config.ts');
    const packageJson = readLocal('../../package.json');
    const readme = readLocal('../../README.md');
    const combined = [mainSource, hostSource, runtimeSource, preloadSource, rendererSource, viteSource].join('\n');

    expect(mainSource).toContain("from '@taucad/runtime/electron/main'");
    expect(preloadSource).toContain("from '@taucad/runtime/electron/preload'");
    expect(rendererSource).toContain("from '@taucad/runtime/electron/renderer'");
    expect(hostSource).toContain("from '@taucad/runtime/electron/utility'");
    expect(runtimeSource).toContain("from '@taucad/openscad/kernel'");
    expect(runtimeSource).not.toContain("from '@taucad/openscad'");
    expect(viteSource).toContain("from '@taucad/runtime/vite'");
    expect(viteSource).not.toContain('@taucad/vite/ts-module-url');
    expect(packageJson).not.toContain('"@taucad/vite"');
    expect(combined).not.toContain('@taucad/runtime/worker-internals');
    expect(combined).not.toContain('@taucad/runtime/transport-internals');
    expect(combined).not.toContain('src/transport');
    expect(readme).toContain('## Commands');
    expect(readme).toContain('```mermaid');
    expect(readme).toContain('## Runtime Boundary');
    expect(readme).toContain('@taucad/runtime/electron/utility');
    expect(readme).toContain('@taucad/openscad/kernel');
  });
});
