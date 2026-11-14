import * as Cookies from 'es-cookie';
import { z } from 'zod';
import { Topic } from '@taucad/events';
import { metaConfig } from '#constants/meta.constants.js';

/**
 * The listing snapshot: the remembered shape of this device's project list (home page loading audit R5; loading-states
 * blueprint, A13).
 *
 * Projects are listed by the browser file-manager worker, which the server cannot reach and which boots after
 * hydration. So the last listing is kept in `localStorage`: each project's id, name, slugs and activity, and its newest
 * chat rows, which the sidebar renders as real rows in the first client commit; the listing reconciles them by id in
 * place when it arrives. Only the count rides a request cookie, so the server reserves the Home grid's height. Names
 * never leave the device, and the rows are cleared on sign-out.
 */

/** The request cookie carrying only the remembered project count. */
export const projectListCountCookieName = `${metaConfig.cookiePrefix}project-count`;

/** The `localStorage` key holding the listing snapshot. */
export const projectListShapeStorageKey = `${metaConfig.cookiePrefix}project-listing`;

/** The count-only record the snapshot replaces: its count is carried over once, then it is removed. */
const countOnlyStorageKey = `${metaConfig.cookiePrefix}project-list-count`;

/** An older key; cleared on first read. */
const legacyProjectListShapeStorageKey = `${metaConfig.cookiePrefix}project-list-shape`;

/** The snapshot record's version. */
const snapshotVersion = 1;

/** The snapshot keeps the most recent projects, and each project's newest chats, up to these caps. @public */
export const rememberedProjectLimit = 100;
/** @public */
export const rememberedChatLimit = 20;

/** A count past this is not a list shape any page reserves; it is a corrupt cookie. */
const maxRememberedCount = 100_000;

/** Cookie lifetime in days, below the 400-day cap browsers apply. */
const cookieLifetimeDays = 365;

/** A remembered chat row: what the sidebar draws and sorts it by. @public */
export type RememberedChat = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly recencyAt?: number;
};

/** A remembered project row, with its newest chats once its chat listing has answered. @public */
export type RememberedProject = {
  readonly id: string;
  readonly name: string;
  readonly lastActivityAt: number;
  readonly slugs?: { readonly workspaceSlug: string; readonly projectSlug: string };
  /** How many live chats the project's last chat listing held; absent until one answered. */
  readonly chatCount?: number;
  readonly chats?: readonly RememberedChat[];
};

/**
 * The remembered list shape: how many live projects the last listing held and, on the client, the snapshot's rows.
 * A shape read from the cookie, as the server and the hydrating render have it, carries the count only.
 */
export type ProjectListShape = {
  readonly count: number;
  readonly projects?: readonly RememberedProject[];
};

const timestampSchema = z.number();

const rememberedChatSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  recencyAt: timestampSchema.optional(),
});

const rememberedProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastActivityAt: timestampSchema,
  slugs: z.object({ workspaceSlug: z.string(), projectSlug: z.string() }).optional(),
  chatCount: z.number().int().min(0).optional(),
  chats: z.array(rememberedChatSchema).max(rememberedChatLimit).optional(),
});

const snapshotSchema = z.object({
  v: z.literal(snapshotVersion),
  savedAt: timestampSchema,
  count: z.number().int().min(0).max(maxRememberedCount),
  projects: z.array(rememberedProjectSchema).max(rememberedProjectLimit),
});

const countOnlySchema = z.object({
  count: z.number().int().min(0).max(maxRememberedCount),
});

/**
 * Parse a remembered count from its cookie value.
 *
 * @param value - The raw cookie value.
 * @returns The count, or `undefined` when absent or malformed.
 */
export const parseProjectListCount = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^\d+$/u.test(value)) {
    return undefined;
  }
  const count = Number(value);
  return count <= maxRememberedCount ? count : undefined;
};

/**
 * The remembered count a document request carried, for the server render.
 *
 * @param header - The request's `Cookie` header.
 * @returns The count, or `undefined` when this browser has never listed its projects.
 */
export const readProjectListCountFromHeader = (header: string | undefined): number | undefined =>
  header ? parseProjectListCount(Cookies.parse(header)[projectListCountCookieName]) : undefined;

/**
 * The shape for a remembered count.
 *
 * @param count - The remembered count, if any.
 * @returns The shape, or `undefined` when the count is unknown.
 */
export const projectListShapeFromCount = (count: number | undefined): ProjectListShape | undefined =>
  count === undefined ? undefined : { count };

/** What a listing's project rows carry that the snapshot remembers. */
type ListedProject = {
  readonly id?: string;
  readonly name?: string;
  readonly lastActivityAt?: number;
  readonly deletedAt?: number;
  readonly slugs?: { readonly workspaceSlug: string; readonly projectSlug: string };
};

/** What a chat listing's rows carry that the snapshot remembers. @public */
export type ListedChat = RememberedChat & {
  readonly deletedAt?: number;
  readonly purgedAt?: number;
};

type RowOf<T> = T & { readonly id: string; readonly name: string; readonly lastActivityAt: number };

const isRow = <T extends ListedProject>(project: T): project is RowOf<T> =>
  project.id !== undefined && project.name !== undefined && project.lastActivityAt !== undefined;

/**
 * Build the shape of a listing: how many of its projects are live and, for the snapshot, the live rows, most recent
 * first, up to {@link rememberedProjectLimit}.
 *
 * @param projects - The listing's projects, trashed ones included or not.
 * @returns The shape to remember.
 */
export const projectListShapeOf = (projects: readonly ListedProject[]): ProjectListShape => {
  const live = projects.filter((project) => project.deletedAt === undefined);
  const rows = live
    .filter((project) => isRow(project))
    .sort((left, right) => right.lastActivityAt - left.lastActivityAt || left.id.localeCompare(right.id))
    .slice(0, rememberedProjectLimit)
    .map(
      ({ id, name, lastActivityAt, slugs }): RememberedProject => ({
        id,
        name,
        lastActivityAt,
        ...(slugs === undefined
          ? {}
          : { slugs: { workspaceSlug: slugs.workspaceSlug, projectSlug: slugs.projectSlug } }),
      }),
    );
  return { count: live.length, projects: rows };
};

const recencyOf = (chat: RememberedChat): number => chat.recencyAt ?? chat.createdAt;

const isLiveChat = (chat: ListedChat): boolean => chat.deletedAt === undefined && chat.purgedAt === undefined;

const isSameShape = (left: ProjectListShape | undefined, right: ProjectListShape): boolean =>
  left !== undefined && JSON.stringify(left) === JSON.stringify(right);

const readStoredShape = (): ProjectListShape | undefined => {
  try {
    globalThis.localStorage.removeItem(legacyProjectListShapeStorageKey);
    const raw = globalThis.localStorage.getItem(projectListShapeStorageKey);
    if (raw !== null) {
      const parsed = snapshotSchema.safeParse(JSON.parse(raw));
      return parsed.success ? { count: parsed.data.count, projects: parsed.data.projects } : undefined;
    }
    /* A device that kept only the count before the snapshot: carry the count; its rows come with the next listing. */
    const countOnly = globalThis.localStorage.getItem(countOnlyStorageKey);
    if (countOnly === null) {
      return undefined;
    }
    const parsed = countOnlySchema.safeParse(JSON.parse(countOnly));
    return parsed.success ? { count: parsed.data.count } : undefined;
  } catch {
    return undefined;
  }
};

const readCookieShape = (): ProjectListShape | undefined =>
  typeof document === 'undefined'
    ? undefined
    : projectListShapeFromCount(parseProjectListCount(Cookies.get(projectListCountCookieName)));

const writeCountCookie = (count: number): void => {
  if (typeof document === 'undefined') {
    return;
  }
  const value = String(count);
  if (globalThis.location.protocol === 'https:') {
    Cookies.set(projectListCountCookieName, value, {
      path: '/',
      sameSite: 'lax',
      expires: cookieLifetimeDays,
      secure: true,
    });
  } else {
    Cookies.set(projectListCountCookieName, value, { path: '/', sameSite: 'lax', expires: cookieLifetimeDays });
  }
};

const createProjectListShapeStore = () => {
  /* Read once and kept, so the snapshot identity is stable between writes. */
  let isRead = false;
  let cached: ProjectListShape | undefined;
  const changes = new Topic<void>({ name: 'project-list-shape' });
  const notify = (): void => {
    changes.emit();
  };

  const get = (): ProjectListShape | undefined => {
    if (!isRead) {
      cached = readStoredShape() ?? readCookieShape();
      isRead = true;
    }
    return cached;
  };

  const write = (shape: ProjectListShape): void => {
    cached = shape;
    isRead = true;
    try {
      globalThis.localStorage.setItem(
        projectListShapeStorageKey,
        JSON.stringify({ v: snapshotVersion, savedAt: Date.now(), count: shape.count, projects: shape.projects ?? [] }),
      );
      globalThis.localStorage.removeItem(countOnlyStorageKey);
    } catch {
      // Best effort: the cookie still carries the count, and this page keeps the rows in memory.
    }
    notify();
  };

  /**
   * Remember a project listing. A project keeps the chat rows already remembered for it, so a project listing does not
   * forget what that project's chat listing said.
   *
   * @param shape - The listing's shape, from {@link projectListShapeOf}.
   */
  const remember = (shape: ProjectListShape): void => {
    const previous = get();
    const kept = new Map((previous?.projects ?? []).map((project) => [project.id, project]));
    const next: ProjectListShape = {
      count: shape.count,
      projects: (shape.projects ?? []).map((project) => {
        const earlier = kept.get(project.id);
        return earlier?.chats === undefined
          ? project
          : { ...project, chatCount: earlier.chatCount, chats: earlier.chats };
      }),
    };
    if (previous?.count !== next.count) {
      writeCountCookie(next.count);
    }
    if (!isSameShape(previous, next)) {
      write(next);
    }
  };

  /**
   * Remember a project's chat listing, for a project the snapshot holds: the live chats it shows, newest first, up to
   * {@link rememberedChatLimit}, and how many there are.
   *
   * @param projectId - The project whose chats were listed.
   * @param chats - The chat listing's rows, trashed ones included or not.
   * @param isShown - Whether the sidebar lists a live chat at all.
   */
  const rememberChats = (
    projectId: string,
    chats: readonly ListedChat[],
    isShown: (chatId: string) => boolean = () => true,
  ): void => {
    const previous = get();
    if (previous?.projects?.some((project) => project.id === projectId) !== true) {
      return;
    }
    const listed = chats.filter((chat) => isLiveChat(chat) && isShown(chat.id));
    const remembered = listed
      .map(
        ({ id, name, createdAt, updatedAt, recencyAt }): RememberedChat => ({
          id,
          name,
          createdAt,
          updatedAt,
          ...(recencyAt === undefined ? {} : { recencyAt }),
        }),
      )
      .sort(
        (left, right) =>
          recencyOf(right) - recencyOf(left) || right.createdAt - left.createdAt || left.id.localeCompare(right.id),
      )
      .slice(0, rememberedChatLimit);
    const next: ProjectListShape = {
      count: previous.count,
      projects: previous.projects.map((project) =>
        project.id === projectId ? { ...project, chatCount: listed.length, chats: remembered } : project,
      ),
    };
    if (!isSameShape(previous, next)) {
      write(next);
    }
  };

  /** Forget the snapshot's rows (sign-out). The count cookie stays: it names nothing. */
  const clear = (): void => {
    try {
      globalThis.localStorage.removeItem(projectListShapeStorageKey);
      globalThis.localStorage.removeItem(countOnlyStorageKey);
    } catch {
      // Best effort: a store that cannot be read holds nothing to clear.
    }
    isRead = false;
    notify();
  };

  const subscribe = (listener: () => void): (() => void) => changes.subscribe(listener);

  /* Another tab's listing: drop the cached shape so the next read sees it. */
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('storage', (event: StorageEvent) => {
      if (event.key === null || event.key === projectListShapeStorageKey) {
        isRead = false;
        notify();
      }
    });
  }

  /* Forget the cached read; tests reset storage between cases. */
  const reset = (): void => {
    isRead = false;
  };

  return { get, remember, rememberChats, clear, subscribe, reset };
};

/** The process-wide remembered shape. @public */
export const projectListShapeStore = createProjectListShapeStore();
