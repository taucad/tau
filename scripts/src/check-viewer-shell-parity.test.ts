import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkViewerShellParity,
  listHostSources,
  readHostSources,
  requiredImports,
  runViewerShellParity,
} from '#check-viewer-shell-parity.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures/viewer-shell-parity', `${name}.txt`), 'utf8');

const paths = {
  chatViewer: 'apps/ui/app/routes/w.$workspace.$project/chat-viewer.tsx',
  actions: 'apps/ui/app/routes/w.$workspace.$project/project-workspace-actions.tsx',
  dockviewTab: 'apps/ui/app/components/panes/dockview-tab.tsx',
  viewerPage: 'packages/agent-plugin/app/viewer-page.tsx',
  lane: 'packages/agent-plugin/app/workbench-lane.tsx',
} as const;

/** The checkout's host sources with one file swapped for its text before the adoption. */
const reverted = (path: string, source: string): Map<string, string> => {
  const sources = readHostSources(repoRoot);
  sources.set(path, source);
  return sources;
};

const temporaryRoots: string[] = [];
const temporaryRoot = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), 'tau-viewer-shell-parity-'));
  temporaryRoots.push(root);
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('viewer shell parity guard', () => {
  it('should pass the checkout, where every host draws the shared shell', () => {
    const sources = readHostSources(repoRoot);

    expect(checkViewerShellParity(sources)).toEqual([]);
    for (const path of Object.keys(requiredImports)) {
      expect(sources.has(path), path).toBe(true);
    }
  });

  it('should fail when the desktop stage goes back to its own gesture, hover label and name lookup', () => {
    expect(checkViewerShellParity(reverted(paths.chatViewer, fixture('chat-viewer')))).toEqual([
      `${paths.chatViewer}: does not import @taucad/workbench-panes/shell/viewer-stage`,
      `${paths.chatViewer}: does not import @taucad/workbench-panes/component-menu/use-viewer-part-menu`,
      `${paths.chatViewer}: carries the hover label custom properties (--viewer-hover-label-*)`,
      `${paths.chatViewer}: carries beginViewerSecondaryGesture (the part menu gesture driver)`,
      `${paths.chatViewer}: carries completeViewerSecondaryGesture (the part menu gesture driver)`,
      `${paths.chatViewer}: carries getModelInteractionUnitState(…).manifest?.nodesById[…].name (the hover name lookup)`,
    ]);
  });

  it('should fail when the desktop header draws its own Share and Export', () => {
    expect(checkViewerShellParity(reverted(paths.actions, fixture('project-workspace-actions')))).toEqual([
      `${paths.actions}: does not import @taucad/workbench-panes/shell/viewer-header-actions`,
      `${paths.actions}: carries a PaneAction for Share or Export (ViewerHeaderActions draws them)`,
    ]);
  });

  it('should fail when the dockview tab goes back to its own fade-row markup', () => {
    expect(checkViewerShellParity(reverted(paths.dockviewTab, fixture('dockview-tab')))).toEqual([
      `${paths.dockviewTab}: does not import @taucad/workbench-panes/components/workbench-tab`,
      `${paths.dockviewTab}: carries fade-row tab markup (WorkbenchTab draws the tab leaf)`,
    ]);
  });

  it('should fail when the plugin page goes back to its own header, chip and part menu', () => {
    expect(checkViewerShellParity(reverted(paths.viewerPage, fixture('viewer-page')))).toEqual([
      `${paths.viewerPage}: does not import @taucad/workbench-panes/shell/viewer-stage`,
      `${paths.viewerPage}: does not import @taucad/workbench-panes/component-menu/use-viewer-part-menu`,
      `${paths.viewerPage}: does not import @taucad/workbench-panes/shell/viewer-header-actions`,
      `${paths.viewerPage}: does not import @taucad/workbench-panes/components/workbench-tab`,
      `${paths.viewerPage}: carries a PaneAction for Share or Export (ViewerHeaderActions draws them)`,
    ]);
  });

  it('should fail when the plugin lane stops drawing PaneLane, and name a host file that moved', () => {
    const sources = reverted(paths.lane, "import { Tabs } from '@taucad/ui/components/tabs';\n");
    sources.delete(paths.dockviewTab);

    expect(checkViewerShellParity(sources)).toEqual([
      `${paths.dockviewTab}: missing; the guard names it, so move the guard with the file`,
      `${paths.lane}: does not import @taucad/workbench-panes/lane/pane-lane`,
    ]);
  });

  it('should fail when a copy appears in any other host file, and leave tests and other trees alone', () => {
    const sources = reverted('apps/ui/app/components/geometry/cad/stray-label.tsx', fixture('chat-viewer'));

    expect(checkViewerShellParity(sources)).toHaveLength(4);
    /* A commented-out import is not an import. */
    expect(
      checkViewerShellParity(
        reverted(paths.lane, "// import { PaneLane } from '@taucad/workbench-panes/lane/pane-lane';\n"),
      ),
    ).toEqual([`${paths.lane}: does not import @taucad/workbench-panes/lane/pane-lane`]);

    const root = temporaryRoot({
      'apps/ui/app/a.tsx': 'export {};\n',
      'apps/ui/app/a.test.tsx': '--viewer-hover-label-x',
      'apps/ui/app/e2e/b.ts': 'beginViewerSecondaryGesture',
      'apps/ui/app/node_modules/c/index.js': 'beginViewerSecondaryGesture',
      'apps/ui/app/notes.md': 'beginViewerSecondaryGesture',
      'apps/ui/app/styles/d.css': '.x { left: var(--viewer-hover-label-x); }',
    });

    expect(listHostSources(root, 'apps/ui/app')).toEqual(['apps/ui/app/a.tsx', 'apps/ui/app/styles/d.css']);
  });

  it('should report the outcome and exit 1 on drift, 0 on a pass', () => {
    const log = { error: vi.fn(), info: vi.fn() };

    expect(runViewerShellParity(repoRoot, log)).toBe(0);
    expect(log.info).toHaveBeenCalledWith(
      expect.stringMatching(/^Every viewer host draws the shared shell \(\d+ files checked\)\.$/u),
    );

    const files: Record<string, string> = { 'packages/agent-plugin/app/x.tsx': 'export {};\n' };
    for (const path of Object.keys(requiredImports)) {
      files[path] = readFileSync(join(repoRoot, path), 'utf8');
    }
    files[paths.dockviewTab] = fixture('dockview-tab');
    const root = temporaryRoot(files);

    expect(runViewerShellParity(root, log)).toBe(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining(`${paths.dockviewTab}: carries fade-row tab markup`),
    );
  });
});
