import * as Cookies from 'es-cookie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseProjectListCount,
  projectListCountCookieName,
  projectListShapeOf,
  projectListShapeStorageKey,
  projectListShapeStore,
  readProjectListCountFromHeader,
  rememberedChatLimit,
  rememberedProjectLimit,
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
  it('counts live projects and remembers their rows, most recent first', () => {
    expect(projectListShapeOf([project('a', 1), project('b', 3), project('gone', 9, 10)])).toEqual({
      count: 2,
      projects: [
        { id: 'b', name: 'Name b', lastActivityAt: 3 },
        { id: 'a', name: 'Name a', lastActivityAt: 1 },
      ],
    });
  });

  /* A15g: a remembered Home card names where its project lives, as the listed card will. */
  it('remembers where each project lives, and nothing for a row without a locator', () => {
    const shape = projectListShapeOf([
      { ...project('home', 3), locator: { backend: 'indexeddb' } },
      { ...project('folder', 2), locator: { backend: 'webaccess' }, workspaceName: 'Parts' },
      { ...project('unnamed', 1), locator: { backend: 'webaccess' } },
      project('bare', 0),
    ]);

    expect(shape.projects?.map(({ id, place }) => ({ id, place }))).toEqual([
      { id: 'home', place: { kind: 'home' } },
      { id: 'folder', place: { kind: 'workspace', workspaceName: 'Parts' } },
      { id: 'unnamed', place: { kind: 'workspace' } },
      { id: 'bare', place: undefined },
    ]);
    projectListShapeStore.remember(shape);
    projectListShapeStore.reset();
    expect(projectListShapeStore.get()?.projects?.[1]?.place).toEqual({ kind: 'workspace', workspaceName: 'Parts' });
  });

  it('keeps the most recent projects up to the cap, and counts every live one', () => {
    const many = Array.from({ length: rememberedProjectLimit + 5 }, (_, index) => project(`p${String(index)}`, index));

    const shape = projectListShapeOf(many);

    expect(shape.count).toBe(rememberedProjectLimit + 5);
    expect(shape.projects).toHaveLength(rememberedProjectLimit);
    expect(shape.projects?.[0]?.id).toBe(`p${String(rememberedProjectLimit + 4)}`);
  });
});

describe('projectListShapeStore', () => {
  it('starts unknown in a browser that has never listed its projects', () => {
    expect(projectListShapeStore.get()).toBeUndefined();
  });

  it('persists the snapshot and mirrors only the count into the request cookie', () => {
    const listener = vi.fn();
    const unsubscribe = projectListShapeStore.subscribe(listener);

    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));
    unsubscribe();

    expect(listener).toHaveBeenCalledOnce();
    expect(Cookies.get(projectListCountCookieName)).toBe('1');
    expect(document.cookie).not.toContain('Name');
    expect(JSON.parse(globalThis.localStorage.getItem(projectListShapeStorageKey) ?? 'null')).toEqual({
      v: 1,
      savedAt: expect.any(Number) as number,
      count: 1,
      projects: [{ id: 'a', name: 'Name a', lastActivityAt: 1 }],
    });
  });

  it('does not notify or rewrite when the shape is unchanged', () => {
    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));
    const listener = vi.fn();
    const unsubscribe = projectListShapeStore.subscribe(listener);

    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });

  it("remembers a listed project's newest live chats, and keeps them across a later project listing", () => {
    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));
    const chats = Array.from({ length: rememberedChatLimit + 2 }, (_, index) => ({
      id: `c${String(index)}`,
      resourceId: 'a',
      name: `Chat ${String(index)}`,
      createdAt: index,
      updatedAt: index,
    }));

    projectListShapeStore.rememberChats(
      'a',
      [
        ...chats,
        { id: 'trashed', resourceId: 'a', name: 'Trashed', createdAt: 99, updatedAt: 99, deletedAt: 100 },
        { id: 'hidden', resourceId: 'a', name: 'Hidden', createdAt: 98, updatedAt: 98 },
      ],
      (chatId) => chatId !== 'hidden',
    );
    projectListShapeStore.remember(projectListShapeOf([{ ...project('a', 5), name: 'Renamed' }]));

    const [remembered] = projectListShapeStore.get()?.projects ?? [];
    expect(remembered).toMatchObject({
      id: 'a',
      name: 'Renamed',
      lastActivityAt: 5,
      chatCount: rememberedChatLimit + 2,
    });
    expect(remembered?.chats).toHaveLength(rememberedChatLimit);
    expect(remembered?.chats?.[0]?.id).toBe(`c${String(rememberedChatLimit + 1)}`);
  });

  /* The sidebar orders and groups chats by their recency, a legacy record's own field included (getChatRecencyAt). */
  it('remembers each chat at the recency the sidebar sorts and groups it by', () => {
    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));
    const legacy = { id: 'legacy', resourceId: 'a', name: 'Legacy', createdAt: 1, updatedAt: 1 };
    Reflect.set(legacy, 'lastUserActivityAt', 50);

    projectListShapeStore.rememberChats('a', [
      { id: 'plain', resourceId: 'a', name: 'Plain', createdAt: 10, updatedAt: 10 },
      { id: 'recent', resourceId: 'a', name: 'Recent', createdAt: 2, updatedAt: 2, recencyAt: 40 },
      legacy,
    ]);

    expect(projectListShapeStore.get()?.projects?.[0]?.chats?.map(({ id, recencyAt }) => [id, recencyAt])).toEqual([
      ['legacy', 50],
      ['recent', 40],
      ['plain', 10],
    ]);
  });

  it('ignores a chat listing for a project the snapshot does not hold', () => {
    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));

    projectListShapeStore.rememberChats('elsewhere', [
      { id: 'c', resourceId: 'elsewhere', name: 'C', createdAt: 1, updatedAt: 1 },
    ]);

    expect(projectListShapeStore.get()?.projects).toEqual([{ id: 'a', name: 'Name a', lastActivityAt: 1 }]);
  });

  it('forgets the rows on clear and keeps the count cookie', () => {
    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));
    const listener = vi.fn();
    const unsubscribe = projectListShapeStore.subscribe(listener);

    projectListShapeStore.clear();
    unsubscribe();

    expect(listener).toHaveBeenCalledOnce();
    expect(globalThis.localStorage.getItem(projectListShapeStorageKey)).toBeNull();
    expect(projectListShapeStore.get()).toEqual({ count: 1 });
  });

  it('falls back to the cookie count when local storage holds nothing', () => {
    Cookies.set(projectListCountCookieName, '4', { path: '/' });

    expect(projectListShapeStore.get()).toEqual({ count: 4 });
  });

  it('carries the count a count-only record kept, with no rows', () => {
    globalThis.localStorage.setItem('tau-project-list-count', '{"count":3}');

    expect(projectListShapeStore.get()).toEqual({ count: 3 });

    projectListShapeStore.remember(projectListShapeOf([project('a', 1)]));
    expect(globalThis.localStorage.getItem('tau-project-list-count')).toBeNull();
  });

  it('clears the key an earlier version stored', () => {
    globalThis.localStorage.setItem('tau-project-list-shape', '{"count":1,"projects":[{"id":"a","name":"Name a"}]}');

    projectListShapeStore.get();

    expect(globalThis.localStorage.getItem('tau-project-list-shape')).toBeNull();
  });

  it('ignores a corrupt stored snapshot', () => {
    globalThis.localStorage.setItem(projectListShapeStorageKey, '{"v":1,"savedAt":1,"count":-3,"projects":[]}');

    expect(projectListShapeStore.get()).toBeUndefined();
  });
});
