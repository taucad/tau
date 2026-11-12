import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { createSectionStore } from '#preferences/section-store.js';
import {
  emptyViewExceptions,
  exceptionsForView,
  maxExceptionViews,
  mergeViewExceptions,
  viewExceptions,
  viewExceptionsSection,
  viewExceptionsStore,
} from '#workbench-records/view-exceptions.js';
import type { ViewExceptions } from '#workbench-records/view-exceptions.js';

const key = `tau-${cookieName.viewExceptions}`;

const stored = (): ViewExceptions | undefined => {
  const raw = globalThis.localStorage.getItem(key);
  return raw === null ? undefined : (JSON.parse(raw) as { value: ViewExceptions }).value;
};

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe('view exceptions', () => {
  it('adds and removes a leaf for one view (V7)', () => {
    expect(viewExceptions.add('p1', 'v1', 'display.grid')).toBe('saved');
    expect(viewExceptions.add('p1', 'v1', 'display.grid')).toBe('saved');
    expect(exceptionsForView(viewExceptionsStore.read(), 'p1', 'v1')).toEqual(['display.grid']);
    expect(exceptionsForView(viewExceptionsStore.read(), 'p1', 'v2')).toEqual([]);
    viewExceptions.remove('p1', 'v1', 'display.grid');
    expect(stored()).toEqual({ version: 1, byProject: {} });
  });

  it('copies a view’s exceptions to a new view id (V8)', () => {
    viewExceptions.add('p1', 'v1', 'display.grid');
    viewExceptions.add('p1', 'v1', 'fieldOfView');
    viewExceptions.copy('p1', 'v1', 'v2');
    expect(exceptionsForView(viewExceptionsStore.read(), 'p1', 'v2')).toEqual(['display.grid', 'fieldOfView']);
    // Copying from a view with none clears the target.
    viewExceptions.copy('p1', 'v3', 'v2');
    expect(exceptionsForView(viewExceptionsStore.read(), 'p1', 'v2')).toEqual([]);
  });

  it('drops a deleted view and a deleted project', () => {
    viewExceptions.add('p1', 'v1', 'display.grid');
    viewExceptions.add('p1', 'v2', 'display.axes');
    viewExceptions.add('p2', 'v1', 'display.grid');
    viewExceptions.clearView('p1', 'v1');
    expect(stored()?.byProject).toEqual({ p1: { v2: ['display.axes'] }, p2: { v1: ['display.grid'] } });
    viewExceptions.dropProject('p1');
    expect(stored()?.byProject).toEqual({ p2: { v1: ['display.grid'] } });
  });

  it(`caps at ${maxExceptionViews} views, dropping the project written longest ago by key order`, () => {
    let value = emptyViewExceptions;
    for (let project = 0; project < 3; project++) {
      for (let view = 0; view < 100; view++) {
        value = mergeViewExceptions(value, {
          kind: 'add',
          projectId: `p${project}`,
          viewId: `v${view}`,
          leaf: 'display.grid',
        });
      }
    }
    // Project p0 was written longest ago, so it went when p2 passed the cap.
    expect(Object.keys(value.byProject)).toEqual(['p1', 'p2']);
    // Writing p1 again moves it to the end: the next overflow drops p2.
    value = mergeViewExceptions(value, { kind: 'add', projectId: 'p1', viewId: 'v0', leaf: 'display.axes' });
    expect(Object.keys(value.byProject)).toEqual(['p2', 'p1']);
    value = mergeViewExceptions(value, { kind: 'add', projectId: 'p3', viewId: 'v0', leaf: 'display.axes' });
    expect(Object.keys(value.byProject)).toEqual(['p1', 'p3']);
    const views = Object.values(value.byProject).reduce((total, each) => total + Object.keys(each).length, 0);
    expect(views).toBeLessThanOrEqual(maxExceptionViews);
  });

  it("merges a stale tab's write into what another tab stored (read-merge-write)", () => {
    const staleTab = createSectionStore(cookieName.viewExceptions, viewExceptionsSection);
    expect(staleTab.read()).toEqual(emptyViewExceptions);
    // Another tab stores an exception; no storage event reaches this tab.
    const otherTab = createSectionStore(cookieName.viewExceptions, viewExceptionsSection);
    otherTab.write({ kind: 'add', projectId: 'p1', viewId: 'v1', leaf: 'display.grid' });

    expect(staleTab.write({ kind: 'add', projectId: 'p1', viewId: 'v2', leaf: 'display.axes' })).toBe('saved');
    expect(stored()?.byProject).toEqual({ p1: { v1: ['display.grid'], v2: ['display.axes'] } });
  });

  it('reads an unreadable or newer section as empty and never overwrites a newer one', () => {
    globalThis.localStorage.setItem(key, JSON.stringify({ value: { version: 2, byProject: {} } }));
    expect(viewExceptionsStore.read()).toEqual(emptyViewExceptions);
    expect(viewExceptions.add('p1', 'v1', 'display.grid')).toBe('newer');
    expect(globalThis.localStorage.getItem(key)).toBe(JSON.stringify({ value: { version: 2, byProject: {} } }));
  });
});
