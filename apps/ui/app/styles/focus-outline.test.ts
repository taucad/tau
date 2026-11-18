import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The app half of the focus-outline entry point (Page Composition Policy, Rule 8). `@taucad/ui`'s
 * `focus-outline.test.ts` owns the tokens, the utility and the design system's components; this test
 * scans the app and the UI libraries it depends on. It lives in `ui` so that `ui:test` re-runs on any
 * change to these files through `ui`'s own files and its dependency edges, without a workspace-root
 * input that would mark the design system affected by every app edit.
 */
const appDirectory = join(import.meta.dirname, '..');
const librariesDirectory = join(import.meta.dirname, '../../../libs');

/* App code cut from `apps/ui/app` into UI libraries stays in the scan. Each is a dependency of `ui`. */
const uiLibraries = [
  'ui-kit',
  'chat-ui',
  'project-workspace',
  'files-ui',
  'editor-ui',
  'revisions-ui',
  'settings-ui',
  'publish-ui',
  'billing-ui',
  'ui-core',
] as const;

const sourcesIn = (directory: string) =>
  readdirSync(directory, { recursive: true })
    .map(String)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => [name, readFileSync(join(directory, name), 'utf8')] as const);

const appSources = [
  ...sourcesIn(appDirectory),
  ...uiLibraries.flatMap((library) => sourcesIn(join(librariesDirectory, library, 'src'))),
];

/**
 * Any focus-state utility that restates indicator geometry instead of composing `focus-outline`.
 * `outline-none` and `outline-hidden` are excluded: suppressing a delegated control is legitimate.
 * Keep in step with `packages/ui/src/styles/focus-outline.test.ts`.
 */
const restatedGeometry =
  /[^\s"'`]*focus[a-z-]*]?:(?:ring-\d|ring-ring|ring-inset|ring-offset-\d|outline-\d|outline-solid|outline-ring|outline-sidebar-ring|-?outline-offset-\d)/g;

describe('focus outline in the app', () => {
  it('scans the app and every UI library it was cut into', () => {
    /* An unresolved path would pass vacuously. */
    expect(appSources.length).toBeGreaterThan(100);
    for (const library of uiLibraries) {
      expect(sourcesIn(join(librariesDirectory, library, 'src')).length, library).toBeGreaterThan(0);
    }
  });

  it('routes every app focus indicator through the utility', () => {
    const offenders = appSources.flatMap(([name, source]) =>
      [...source.matchAll(restatedGeometry)].map((match) => `${name}: ${match[0]}`),
    );

    expect(offenders).toEqual([]);
  });
});
