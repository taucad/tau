import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { decide, lockfile, lockfileChange, lockfileSections, select, workflow } from '#desktop-packaging-select.js';

const root = resolve(import.meta.dirname, '../..');

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

const lock = (
  importers: Record<string, string>,
  packages = '  foo@1.0.0:\n    resolution: {integrity: sha512-a}',
): string =>
  [
    "lockfileVersion: '9.0'",
    '',
    'settings:',
    '  autoInstallPeers: true',
    '',
    'importers:',
    '',
    ...Object.entries(importers).flatMap(([name, body]) => [`  ${name}:`, body, '']),
    'packages:',
    '',
    packages,
    '',
  ].join('\n');

const desktop = '    dependencies:\n      foo:\n        specifier: ^1.0.0\n        version: 1.0.0';
const gateway = '    dependencies:\n      foo:\n        specifier: ^1.0.0\n        version: 1.0.0';
const gatewayWithBar = `${gateway}\n      bar:\n        specifier: ^2.0.0\n        version: 2.0.0`;

const triggers = [
  'apps/desktop/**',
  'libs/types/src/desktop-updates.ts',
  lockfile,
  '.github/workflows/desktop-packaging.yml',
];

describe('lockfile sections', () => {
  it('should split importer blocks, quoted or not, from the rest', () => {
    const sections = lockfileSections(
      lock({ '.': desktop, 'apps/desktop': desktop, "'apps/libs/api-llm-gateway'": gateway }),
    );
    expect([...sections.importers.keys()]).toEqual(['.', 'apps/desktop', 'apps/libs/api-llm-gateway']);
    expect(sections.importers.get('apps/desktop')).toBe(desktop.trim());
    expect(sections.rest).toContain('autoInstallPeers');
    expect(sections.rest).toContain('foo@1.0.0');
    expect(sections.rest).not.toContain('specifier');
  });

  it('should name the changed, added and removed importers and a change outside them', () => {
    const base = lock({ 'apps/desktop': desktop, 'apps/libs/api-llm-gateway': gateway, 'libs/old': gateway });
    expect(
      lockfileChange(
        base,
        lock({ 'apps/desktop': desktop, 'apps/libs/api-llm-gateway': gatewayWithBar, 'libs/new': gateway }),
      ),
    ).toEqual({
      importers: ['apps/libs/api-llm-gateway', 'libs/new', 'libs/old'],
      rest: false,
    });
    expect(
      lockfileChange(
        base,
        lock({ 'apps/desktop': desktop, 'apps/libs/api-llm-gateway': gateway, 'libs/old': gateway }, '  bar@2.0.0:'),
      ),
    ).toEqual({
      importers: [],
      rest: true,
    });
  });
});

describe('desktop packaging selection', () => {
  const base = lock({ '.': desktop, 'apps/desktop': desktop, 'apps/libs/api-llm-gateway': gateway });
  const input = (changed: readonly string[], head: string, affected: readonly string[] = []) => {
    const queried: string[][] = [];
    const decision = decide({
      changed,
      triggers,
      lockfiles: () => ({ base, head }),
      affected: (files) => {
        queried.push([...files]);
        return affected;
      },
    });
    return { ...decision, queried };
  };

  it('should skip a lockfile change confined to importers outside the desktop closure (#1605)', () => {
    const result = input(
      ['apps/libs/api-llm-gateway/src/index.ts', lockfile],
      lock({ '.': desktop, 'apps/desktop': desktop, 'apps/libs/api-llm-gateway': gatewayWithBar }),
      ['api-llm-gateway', 'api'],
    );
    expect(result.run).toBe(false);
    expect(result.queried).toEqual([['apps/libs/api-llm-gateway/package.json']]);
  });

  it('should run when the changed importers affect desktop', () => {
    const result = input(
      [lockfile],
      lock({ '.': desktop, 'apps/desktop': desktop, 'apps/libs/api-llm-gateway': gatewayWithBar }),
      ['api-llm-gateway', 'desktop'],
    );
    expect(result.run).toBe(true);
  });

  it.each([
    ['another trigger path', ['apps/desktop/src/main.ts', lockfile], base],
    ['the workflow itself', ['.github/workflows/desktop-packaging.yml'], base],
    ['no matching path at all', ['apps/ui/app/root.tsx'], base],
    [
      'a change outside the importers section',
      [lockfile],
      lock({ '.': desktop, 'apps/desktop': desktop, 'apps/libs/api-llm-gateway': gateway }, '  bar@2.0.0:'),
    ],
    [
      'a root importer change',
      [lockfile],
      lock({ '.': gatewayWithBar, 'apps/desktop': desktop, 'apps/libs/api-llm-gateway': gateway }),
    ],
    ['a lockfile change with no importer change', [lockfile], base],
  ])('should run, failing open, for %s', (_name, changed, head) => {
    const result = input(changed, head);
    expect(result.run).toBe(true);
    expect(result.queried).toEqual([]);
  });

  it('should run when the selection itself fails', () => {
    expect(select('0000000000000000000000000000000000000000', 'HEAD').run).toBe(true);
  });
});

describe('the desktop packaging workflow', () => {
  type Job = {
    readonly if?: string;
    readonly needs?: readonly string[];
    readonly steps?: ReadonlyArray<{
      readonly id?: string;
      readonly run?: string;
      readonly env?: Record<string, string>;
    }>;
  };
  const parsed = load(readFileSync(resolve(root, workflow), 'utf8')) as {
    readonly on: { readonly pull_request: { readonly paths: readonly string[] } };
    readonly jobs: Record<string, Job>;
  };

  it('should keep the lockfile as a trigger path and select on pull requests only', () => {
    expect(parsed.on.pull_request.paths).toContain(lockfile);
    const { select: job } = parsed.jobs;
    expect(job?.if).toBe("github.event_name == 'pull_request'");
    const step = job?.steps?.find(({ id }) => id === 'select');
    expect(step?.run).toBe('node scripts/src/desktop-packaging-select.ts "$BASE_SHA" "$HEAD_SHA"');
    expect(step?.env).toEqual(
      Object.fromEntries([
        ['BASE_SHA', expression('github.event.pull_request.base.sha')],
        ['HEAD_SHA', expression('github.event.pull_request.head.sha')],
      ]),
    );
  });

  // The DMG preview also needs a macOS runner, so it skips a draft pull request as well (AF-2).
  it.each([
    ['assembly', "!cancelled() && needs.select.outputs.run != 'false'"],
    ['dmg-window-preview', "!cancelled() && needs.select.outputs.run != 'false' && !github.event.pull_request.draft"],
  ])('should run %s unless the selection said false', (name, condition) => {
    const job = parsed.jobs[name];
    expect(job?.needs).toEqual(['select']);
    // A dispatch skips the selection, and a failed selection sets nothing: both run packaging.
    expect(job?.if).toBe(expression(condition));
  });
});
