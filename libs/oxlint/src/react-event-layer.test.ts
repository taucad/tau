import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactEventLayerSite } from '@taucad/oxlint/react-event-layer';
import {
  checkReactEventLayerCeiling,
  countReactEventLayerSites,
  reactEventLayerManifestProblems,
  reactEventLayerViolations,
} from '@taucad/oxlint/react-event-layer';

function summary(source: string, fileName = 'fixture.tsx'): string[] {
  return countReactEventLayerSites(fileName, source).map((site) =>
    site.kind === 'effect' ? `${site.line} effect ${site.calls.join(' ')}` : `${site.line} getSnapshot`,
  );
}

describe('countReactEventLayerSites', () => {
  it('should count each effect that sends, subscribes or times once', () => {
    expect(
      summary(`import { useEffect, useLayoutEffect } from 'react';
useEffect(() => { actor.send({ type: 'a' }); actor.send({ type: 'b' }); }, [actor]);
useLayoutEffect(() => { const s = store.subscribe(listener); return () => s.unsubscribe(); }, []);
useEffect(() => { const id = window.setTimeout(run, 10); return () => clearTimeout(id); }, []);
useEffect(() => { const id = requestAnimationFrame(run); return () => cancelAnimationFrame(id); }, []);
useEffect(() => { const id = setInterval(run, 10); return () => clearInterval(id); }, []);
useEffect(() => { emitter.on('change', listener); }, []);
useEffect(() => { actor?.send({ type: 'a' }); setTimeout(run); }, []);
useEffect(() => subscribe?.(listener), [subscribe]);
useEffect(() => { send({ type: 'a' }); on('change', listener); }, [send]);
`),
    ).toEqual([
      '2 effect .send',
      '3 effect .subscribe',
      '4 effect setTimeout',
      '5 effect requestAnimationFrame',
      '6 effect setInterval',
      '7 effect .on',
      '8 effect .send setTimeout',
      '9 effect subscribe',
      '10 effect send',
    ]);
  });

  it('should ignore effects that do none of those, and the same calls outside effects', () => {
    expect(
      summary(`import { useEffect } from 'react';
useEffect(() => { document.title = name; }, [name]);
const onClick = () => actor.send({ type: 'click' });
setTimeout(run, 10);
useMemo(() => actor.send({ type: 'x' }), []);
`),
    ).toEqual([]);
  });

  it('should recognize aliased, namespaced and insertion effects', () => {
    expect(
      summary(`import React, { useEffect as effect, useInsertionEffect } from 'react';
effect(() => actor.send({ type: 'a' }), []);
React.useEffect(() => actor.send({ type: 'a' }), []);
useInsertionEffect(() => { setTimeout(run); });
`),
    ).toEqual(['2 effect .send', '3 effect .send', '4 effect setTimeout']);
  });

  it('should follow an effect callback declared as a function in the same file', () => {
    expect(
      summary(`import { useEffect } from 'react';
function start() { return actor.subscribe(listener).unsubscribe; }
const stop = () => { actor.send({ type: 'stop' }); };
useEffect(start, []);
useEffect(stop, []);
useEffect(imported, []);
const flush = useCallback(() => { actor.send({ type: 'flush' }); }, []);
const measure = React.useCallback(() => { requestAnimationFrame(run); }, []);
const idle = useCallback(() => { document.title = name; }, []);
useEffect(flush, [flush]);
useEffect(measure, [measure]);
useEffect(idle, [idle]);
`),
    ).toEqual(['4 effect .subscribe', '5 effect .send', '10 effect .send', '11 effect requestAnimationFrame']);
  });

  it('should count getSnapshot() calls in components and hooks outside module-level select* helpers', () => {
    expect(
      summary(
        `function Panel() { const value = actor.getSnapshot().context.value; }
function selectValue(actor) { return actor.getSnapshot().context.value; }
const selectOther = (actor) => actor.getSnapshot();
const useTab = () => { const selectTab = () => actor.getSnapshot(); };
function useValue() { return actor.getSnapshot(); }
const Row = memo(function (props) { return actor.getSnapshot(); });
const Field = React.forwardRef((props, ref) => actor.getSnapshot());
function Panel2() { const selectFromPanel = selectValue(actor); }
const Card = function render() { return actor.getSnapshot().context.label; };
const useLabel = function readLabel() { return actor.getSnapshot(); };
const format = function Formatter() { return actor.getSnapshot(); };
`,
        'fixture.ts',
      ),
    ).toEqual([
      '1 getSnapshot',
      '4 getSnapshot',
      '5 getSnapshot',
      '6 getSnapshot',
      '7 getSnapshot',
      '9 getSnapshot',
      '10 getSnapshot',
      '11 getSnapshot',
    ]);
  });

  it('should classify reads by where they run', () => {
    expect(
      summary(
        `import { useCallback, useEffect } from 'react';
function ToolRow() { return actor.getSnapshot().context.label; }
function useCutValue() { return actor.getSnapshot().context.cut; }
function attachDrag(element, graphics) { return () => { if (graphics.getSnapshot().status === 'active') graphics.send({ type: 'end' }); }; }
function useClock() { useFrame(() => { tick(actor.getSnapshot().context.playback); }); }
function useFrameReader() { useFrame(() => { tick(selectPlayback(actor)); }); }
function Chip() { const onBlur = useCallback(() => { if (actor.getSnapshot().context.hovered) hover(undefined); }, []); }
function Chip2() { const onBlur = () => { if (selectHovered(actor)) hover(undefined); }; }
const selectPlayback = (actor) => actor.getSnapshot().context.playback;
`,
        'fixture.tsx',
      ),
    ).toEqual(['2 getSnapshot', '3 getSnapshot', '5 getSnapshot', '7 getSnapshot']);
  });

  it('should not count getSnapshot() calls outside React', () => {
    expect(
      summary(
        `const value = actor.getSnapshot().context.value;
const helpers = { selectThird: (actor) => actor.getSnapshot() };
class Store { getSnapshot() { return this.inner.getSnapshot(); } }
const read = getSnapshot();
const bridge = { selectSectionCut(id) { graphicsActor.getSnapshot(); } };
function selection(actor) { return actor.getSnapshot(); }
const createStore = (actor) => ({ context: () => actor.getSnapshot().context });
const machine = setup({ actions: { read: ({ context }) => context.child.getSnapshot() } });
`,
        'fixture.ts',
      ),
    ).toEqual([]);
  });

  it('should resolve a named effect callback in its own scope, not the first binding in the file', () => {
    expect(
      summary(`import { useCallback, useEffect } from 'react';
function First() {
  const cb = useCallback(() => { document.title = 'x'; }, []);
  useEffect(cb, [cb]);
}
function Second() {
  const cb = useCallback(() => { actor.send({ type: 'a' }); }, []);
  useEffect(cb, [cb]);
}
`),
    ).toEqual(['8 effect .send']);
  });
});

describe('reactEventLayerViolations', () => {
  const measured = new Map<string, ReactEventLayerSite[]>([
    [
      'app/a.tsx',
      [
        { kind: 'effect', line: 3, column: 1, calls: ['.send'] },
        { kind: 'getSnapshot', line: 9, column: 5, calls: [] },
      ],
    ],
    ['app/b.tsx', [{ kind: 'effect', line: 1, column: 1, calls: ['setTimeout'] }]],
  ]);

  it('should pass counts at or below the ceiling', () => {
    expect(reactEventLayerViolations(measured, { 'app/a.tsx': 2, 'app/b.tsx': 4 }, 'm.json')).toEqual([]);
  });

  it('should name each site of a file over its ceiling and treat an absent line as 0', () => {
    expect(reactEventLayerViolations(measured, { 'app/a.tsx': 1 }, 'm.json')).toEqual([
      [
        'app/a.tsx: 2 React event-layer site(s) exceeds its ceiling of 1 in m.json. Move the work into an actor.',
        '  3:1 effect calls .send',
        '  9:5 getSnapshot()',
      ].join('\n'),
      [
        'app/b.tsx: 1 React event-layer site(s) has no line in m.json, so its ceiling is 0 (a moved file carries its old line to its new path). Move the work into an actor.',
        '  1:1 effect calls setTimeout',
      ].join('\n'),
    ]);
  });
});

describe('reactEventLayerManifestProblems', () => {
  it('should accept a sorted manifest of positive integers inside its scope', () => {
    expect(reactEventLayerManifestProblems({ 'app/a.tsx': 1, 'app/b/c.tsx': 3 }, ['app'])).toEqual([]);
  });

  it('should reject unsorted, zero, fractional and out-of-scope lines', () => {
    expect(
      reactEventLayerManifestProblems({ 'app/b.tsx': 1, 'app/a.tsx': 0, 'app/c.tsx': 1.5, 'other/d.tsx': 1 }, ['app']),
    ).toEqual([
      'app/a.tsx: ceiling must be a positive integer; delete the line when it reaches 0',
      'app/a.tsx: lines must be sorted by path',
      'app/c.tsx: ceiling must be a positive integer; delete the line when it reaches 0',
      "other/d.tsx: outside this manifest's scope (app)",
    ]);
  });
});

describe('checkReactEventLayerCeiling', () => {
  let workspace: string | undefined;

  afterEach(() => {
    if (workspace !== undefined) {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('should measure production files only and report workspace-relative paths', () => {
    workspace = mkdtempSync(join(tmpdir(), 'react-event-layer-'));
    writeFileSync(join(workspace, 'pnpm-workspace.yaml'), 'packages: []\n');
    const source = join(workspace, 'pkg', 'src');
    mkdirSync(join(source, 'nested'), { recursive: true });
    const effect = "import { useEffect } from 'react';\nuseEffect(() => actor.send({ type: 'a' }), []);\n";
    writeFileSync(join(source, 'nested', 'counted.tsx'), effect);
    writeFileSync(join(source, 'counted.test.tsx'), effect);
    writeFileSync(join(source, 'types.d.ts'), effect);
    writeFileSync(join(source, 'viewer.test-utils.ts'), effect);
    writeFileSync(join(source, 'status.test-harness.ts'), effect);
    writeFileSync(join(source, 'store.test-helpers.ts'), effect);
    writeFileSync(join(source, 'xstate-test.utils.ts'), effect);
    writeFileSync(join(source, 'types.test-d.ts'), effect);
    writeFileSync(join(source, 'data.fixture.ts'), effect);
    writeFileSync(join(source, 'react-event-layer.ceiling.json'), '{}\n');

    expect(
      checkReactEventLayerCeiling({
        manifest: pathToFileURL(join(source, 'react-event-layer.ceiling.json')),
        directories: [pathToFileURL(`${source}/`)],
      }),
    ).toEqual([
      [
        'pkg/src/data.fixture.ts: 1 React event-layer site(s) has no line in pkg/src/react-event-layer.ceiling.json, so its ceiling is 0 (a moved file carries its old line to its new path). Move the work into an actor.',
        '  2:1 effect calls .send',
      ].join('\n'),
      [
        'pkg/src/nested/counted.tsx: 1 React event-layer site(s) has no line in pkg/src/react-event-layer.ceiling.json, so its ceiling is 0 (a moved file carries its old line to its new path). Move the work into an actor.',
        '  2:1 effect calls .send',
      ].join('\n'),
    ]);

    writeFileSync(
      join(source, 'react-event-layer.ceiling.json'),
      '{ "pkg/src/data.fixture.ts": 1, "pkg/src/nested/counted.tsx": 1 }\n',
    );
    expect(
      checkReactEventLayerCeiling({
        manifest: pathToFileURL(join(source, 'react-event-layer.ceiling.json')),
        directories: [pathToFileURL(source)],
      }),
    ).toEqual([]);

    writeFileSync(
      join(source, 'react-event-layer.ceiling.json'),
      '{ "pkg/src/data.fixture.ts": 1, "pkg/src/nested/counted.tsx": 0, "pkg/src/nested/counted.tsx": 1 }\n',
    );
    expect(
      checkReactEventLayerCeiling({
        manifest: pathToFileURL(join(source, 'react-event-layer.ceiling.json')),
        directories: [pathToFileURL(source)],
      }),
    ).toEqual(['pkg/src/nested/counted.tsx: listed more than once']);
  });

  it('should report a ceiling line whose file does not exist', () => {
    workspace = mkdtempSync(join(tmpdir(), 'react-event-layer-'));
    writeFileSync(join(workspace, 'pnpm-workspace.yaml'), 'packages: []\n');
    const source = join(workspace, 'pkg', 'src');
    mkdirSync(source, { recursive: true });
    const effect = "import { useEffect } from 'react';\nuseEffect(() => actor.send({ type: 'a' }), []);\n";
    writeFileSync(join(source, 'kept.tsx'), effect);
    writeFileSync(join(source, 'quiet.tsx'), 'export const quiet = 1;\n');
    const manifest = join(source, 'react-event-layer.ceiling.json');
    writeFileSync(manifest, '{ "pkg/src/gone.tsx": 2, "pkg/src/kept.tsx": 1, "pkg/src/quiet.tsx": 1 }\n');

    expect(
      checkReactEventLayerCeiling({ manifest: pathToFileURL(manifest), directories: [pathToFileURL(source)] }),
    ).toEqual([
      'pkg/src/gone.tsx: a ceiling line whose file does not exist; delete the line, or carry it to the moved path',
    ]);
  });

  it('should hold a zero scope at zero except its named exceptions', () => {
    workspace = mkdtempSync(join(tmpdir(), 'react-event-layer-'));
    writeFileSync(join(workspace, 'pnpm-workspace.yaml'), 'packages: []\n');
    const source = join(workspace, 'pkg', 'src');
    mkdirSync(join(source, 'graphics'), { recursive: true });
    const effect = "import { useEffect } from 'react';\nuseEffect(() => actor.send({ type: 'a' }), []);\n";
    writeFileSync(join(source, 'graphics', 'boundary.tsx'), effect);
    writeFileSync(join(source, 'graphics', 'debt.tsx'), effect);
    writeFileSync(join(source, 'other.tsx'), effect);
    const manifest = join(source, 'react-event-layer.ceiling.json');
    const check = (exceptions: Record<string, { sites: number; reason: string }>): string[] =>
      checkReactEventLayerCeiling({
        manifest: pathToFileURL(manifest),
        directories: [pathToFileURL(source)],
        zero: { scope: [pathToFileURL(join(source, 'graphics'))], exceptions },
      });

    writeFileSync(manifest, '{ "pkg/src/graphics/debt.tsx": 1, "pkg/src/other.tsx": 1 }\n');
    expect(check({ 'pkg/src/graphics/boundary.tsx': { sites: 1, reason: 'the prop boundary' } })).toEqual([
      'pkg/src/graphics/debt.tsx: held at zero, so it takes no ceiling line; a boundary that stays is a named exception',
    ]);

    writeFileSync(manifest, '{ "pkg/src/other.tsx": 1 }\n');
    expect(
      check({
        'pkg/src/graphics/boundary.tsx': { sites: 2, reason: ' ' },
        'pkg/src/graphics/debt.tsx': { sites: 0, reason: 'cleared' },
        'pkg/src/other.tsx': { sites: 1, reason: 'outside' },
      }),
    ).toEqual([
      'pkg/src/graphics/boundary.tsx: a named exception needs its reason',
      'pkg/src/graphics/boundary.tsx: holds 1 site(s), below its exception of 2; lower or remove the exception',
      "pkg/src/graphics/debt.tsx: an exception's sites must be a positive integer; remove it at 0",
      'pkg/src/other.tsx: a named exception must be inside the zero scope',
      [
        'pkg/src/graphics/debt.tsx: 1 React event-layer site(s) exceeds its named exception of 0. Move the work into an actor.',
        '  2:1 effect calls .send',
      ].join('\n'),
    ]);

    writeFileSync(join(source, 'graphics', 'debt.tsx'), 'export const quiet = 1;\n');
    expect(check({ 'pkg/src/graphics/boundary.tsx': { sites: 1, reason: 'the prop boundary' } })).toEqual([]);

    expect(
      checkReactEventLayerCeiling({
        manifest: pathToFileURL(manifest),
        directories: [pathToFileURL(source)],
        zero: { scope: [pathToFileURL(join(source, 'graphics')), pathToFileURL(join(source, 'gone.ts'))] },
      }),
    ).toEqual([
      'pkg/src/gone.ts: a zero-scope path that does not exist; move or remove it',
      [
        'pkg/src/graphics/boundary.tsx: 1 React event-layer site(s) is held at zero; only a named exception may keep a site. Move the work into an actor.',
        '  2:1 effect calls .send',
      ].join('\n'),
    ]);
  });
});
