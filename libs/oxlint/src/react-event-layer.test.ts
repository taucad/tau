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
  it('counts each effect that sends, subscribes or times once', () => {
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

  it('ignores effects that do none of those, and the same calls outside effects', () => {
    expect(
      summary(`import { useEffect } from 'react';
useEffect(() => { document.title = name; }, [name]);
const onClick = () => actor.send({ type: 'click' });
setTimeout(run, 10);
useMemo(() => actor.send({ type: 'x' }), []);
`),
    ).toEqual([]);
  });

  it('recognizes aliased, namespaced and insertion effects', () => {
    expect(
      summary(`import React, { useEffect as effect, useInsertionEffect } from 'react';
effect(() => actor.send({ type: 'a' }), []);
React.useEffect(() => actor.send({ type: 'a' }), []);
useInsertionEffect(() => { setTimeout(run); });
`),
    ).toEqual(['2 effect .send', '3 effect .send', '4 effect setTimeout']);
  });

  it('follows an effect callback declared as a function in the same file', () => {
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

  it('counts getSnapshot() calls outside select* helpers', () => {
    expect(
      summary(
        `const value = actor.getSnapshot().context.value;
function selectValue(actor) { return actor.getSnapshot().context.value; }
const selectOther = (actor) => actor.getSnapshot();
const helpers = { selectThird: (actor) => actor.getSnapshot() };
class Store { getSnapshot() { return this.inner.getSnapshot(); } }
const read = getSnapshot();
`,
        'fixture.ts',
      ),
    ).toEqual(['1 getSnapshot', '5 getSnapshot', '6 getSnapshot']);
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

  it('passes counts at or below the ceiling', () => {
    expect(reactEventLayerViolations(measured, { 'app/a.tsx': 2, 'app/b.tsx': 4 }, 'm.json')).toEqual([]);
  });

  it('names each site of a file over its ceiling, and treats an absent line as 0', () => {
    expect(reactEventLayerViolations(measured, { 'app/a.tsx': 1 }, 'm.json')).toEqual([
      [
        'app/a.tsx: 2 React event-layer site(s) exceeds its ceiling of 1 in m.json. Move the work into an actor (charter I10).',
        '  3:1 effect calls .send',
        '  9:5 getSnapshot()',
      ].join('\n'),
      [
        'app/b.tsx: 1 React event-layer site(s) has no line in m.json, so its ceiling is 0 (a moved file carries its old line, charter D21). Move the work into an actor (charter I10).',
        '  1:1 effect calls setTimeout',
      ].join('\n'),
    ]);
  });
});

describe('reactEventLayerManifestProblems', () => {
  it('accepts a sorted manifest of positive integers inside its scope', () => {
    expect(reactEventLayerManifestProblems({ 'app/a.tsx': 1, 'app/b/c.tsx': 3 }, ['app'])).toEqual([]);
  });

  it('rejects unsorted, zero, fractional and out-of-scope lines', () => {
    expect(
      reactEventLayerManifestProblems({ 'app/b.tsx': 1, 'app/a.tsx': 0, 'app/c.tsx': 1.5, 'other/d.tsx': 1 }, ['app']),
    ).toEqual([
      'app/a.tsx: ceiling must be a positive integer; delete the line when it reaches 0',
      'app/a.tsx: lines must be sorted by path and unique',
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

  it('measures production files only and reports workspace-relative paths', () => {
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
    writeFileSync(join(source, 'react-event-layer.ceiling.json'), '{}\n');

    expect(
      checkReactEventLayerCeiling({
        manifest: pathToFileURL(join(source, 'react-event-layer.ceiling.json')),
        directories: [pathToFileURL(`${source}/`)],
      }),
    ).toEqual([
      [
        'pkg/src/nested/counted.tsx: 1 React event-layer site(s) has no line in pkg/src/react-event-layer.ceiling.json, so its ceiling is 0 (a moved file carries its old line, charter D21). Move the work into an actor (charter I10).',
        '  2:1 effect calls .send',
      ].join('\n'),
    ]);

    writeFileSync(join(source, 'react-event-layer.ceiling.json'), '{ "pkg/src/nested/counted.tsx": 1 }\n');
    expect(
      checkReactEventLayerCeiling({
        manifest: pathToFileURL(join(source, 'react-event-layer.ceiling.json')),
        directories: [pathToFileURL(source)],
      }),
    ).toEqual([]);
  });
});
