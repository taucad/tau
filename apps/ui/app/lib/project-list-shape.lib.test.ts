import * as Cookies from 'es-cookie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseProjectListCount,
  projectListCountCookieName,
  projectListShapeOf,
  projectListShapeStorageKey,
  projectListShapeStore,
  readProjectListCountFromHeader,
} from '#lib/project-list-shape.lib.js';

const project = (id: string, lastActivityAt: number, deletedAt?: number) => ({
  id,
  name: `Name ${id}`,
  lastActivityAt,
  ...(deletedAt === undefined ? {} : { deletedAt }),
});

afterEach(() => {
  globalThis.localStorage.clear();
  Cookies.remove(projectListCountCookieName, { path: '/' });
  projectListShapeStore.reset();
});

describe('project list count cookie', () => {
  it('reads the count a request carried', () => {
    expect(readProjectListCountFromHeader(`a=1; ${projectListCountCookieName}=12`)).toBe(12);
  });

  it('treats an absent or malformed count as unknown', () => {
    expect(readProjectListCountFromHeader(undefined)).toBeUndefined();
    expect(readProjectListCountFromHeader('a=1')).toBeUndefined();
    expect(parseProjectListCount('-1')).toBeUndefined();
    expect(parseProjectListCount('3.5')).toBeUndefined();
    expect(parseProjectListCount('99999999')).toBeUndefined();
  });

  it('keeps zero, so the server can render the empty state', () => {
    expect(parseProjectListCount('0')).toBe(0);
  });
});

describe('projectListShapeOf', () => {
  it('counts live projects and remembers no names', () => {
    expect(projectListShapeOf([project('a', 1), project('b', 3), project('gone', 9, 10)])).toEqual({ count: 2 });
  });
});

describe('projectListShapeStore', () => {
  it('starts unknown in a browser that has never listed its projects', () => {
    expect(projectListShapeStore.get()).toBeUndefined();
  });

  it('persists the shape and mirrors only the count into the request cookie', () => {
    const listener = vi.fn();
    const unsubscribe = projectListShapeStore.subscribe(listener);

    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));
    unsubscribe();

    expect(listener).toHaveBeenCalledOnce();
    expect(Cookies.get(projectListCountCookieName)).toBe('1');
    expect(JSON.parse(globalThis.localStorage.getItem(projectListShapeStorageKey) ?? 'null')).toEqual({ count: 1 });
  });

  it('does not notify or rewrite when the shape is unchanged', () => {
    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));
    const listener = vi.fn();
    const unsubscribe = projectListShapeStore.subscribe(listener);

    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });

  it('falls back to the cookie count when local storage holds nothing', () => {
    Cookies.set(projectListCountCookieName, '4', { path: '/' });

    expect(projectListShapeStore.get()).toEqual({ count: 4 });
  });

  it('clears the names an earlier version stored', () => {
    globalThis.localStorage.setItem('tau-project-list-shape', '{"count":1,"projects":[{"id":"a","name":"Name a"}]}');

    projectListShapeStore.get();

    expect(globalThis.localStorage.getItem('tau-project-list-shape')).toBeNull();
  });

  it('ignores a corrupt stored shape', () => {
    globalThis.localStorage.setItem(projectListShapeStorageKey, '{"count":-3}');

    expect(projectListShapeStore.get()).toBeUndefined();
  });
});
