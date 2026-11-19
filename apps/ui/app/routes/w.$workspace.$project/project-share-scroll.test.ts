// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Share pane scrolls as one (`@taucad/workbench-panes`' `share-scroll.test.ts` holds the frame's half): the
 * sections this app draws inside it — the cloud link body, link access, the email field and Collaborators — never
 * scroll on their own, bound their height or pin a row. The phone sheet leaves the pane under 300 px with the keyboard
 * open, so each of those takes height from the one region that scrolls. Overlays keep their primitive's scroll.
 */
const sectionModules = [
  '../../../../libs/publish-ui/src/components/publish/project-share-panel.tsx',
  './project-share-action.tsx',
  './revision-collaborators.tsx',
  '../../../../libs/publish-ui/src/components/publish/publication-access-panel.tsx',
  '../../../../libs/publish-ui/src/components/publish/publication-email-tags.tsx',
];

/** Class tokens that scroll, bound a height, or pin. `scroll-shadows-*` sets `overflow: auto` on both axes. */
const scrollToken =
  /(?<![\w-])(?:[\w-]+:)*(?:overflow(?:-[xy])?-(?:auto|scroll)|max-h-[\w[\]./%-]+|sticky|fixed|scroll-shadows(?:-[xy])?)(?![\w-])/gu;

/** The source without its comments, so prose about a fix is not read as a `fixed` class. */
const codeOf = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/^\s*\/\/.*$/gmu, '');

describe('Share pane sections', () => {
  it('should neither scroll, bound their height nor pin a row', () => {
    const offenders = sectionModules.flatMap((path) =>
      [...codeOf(path).matchAll(scrollToken)].map((match) => `${path}: ${match[0]}`),
    );

    expect(offenders).toEqual([]);
  });
});
