import * as Cookies from 'es-cookie';
import { z } from 'zod';
import { Topic } from '@taucad/events';
import { metaConfig } from '#constants/meta.constants.js';

/**
 * The remembered shape of this device's project list (home page loading audit R5).
 *
 * Projects are listed by the browser file-manager worker, which the server cannot
 * reach and which boots after hydration. Without a remembered shape every load
 * reserves a guessed number of rows and cards and the list jumps when the real
 * listing arrives. The last listing's count is kept in `localStorage` for the
 * client's first render and rides a request cookie, so the server reserves the
 * same number of slots, or renders the empty state, before any script runs.
 *
 * Only the count is remembered, never names: placeholders are skeletons until the
 * real listing fills them, so nothing stale (a project renamed or deleted on
 * another device, or a previous user's list) is ever shown as if it were data.
 */

/** The request cookie carrying only the remembered project count. */
export const projectListCountCookieName = `${metaConfig.cookiePrefix}project-count`;

/** The `localStorage` key holding the remembered shape. */
export const projectListShapeStorageKey = `${metaConfig.cookiePrefix}project-list-count`;

/** The key that once also held project names; cleared on first read so no name lingers. */
const legacyProjectListShapeStorageKey = `${metaConfig.cookiePrefix}project-list-shape`;

/** A count past this is not a list shape any page reserves; it is a corrupt cookie. */
const maxRememberedCount = 100_000;

/** Cookie lifetime in days, below the 400-day cap browsers apply. */
const cookieLifetimeDays = 365;

/** The remembered list shape: how many live projects the last listing held. */
export type ProjectListShape = {
  readonly count: number;
};

const shapeSchema = z.object({
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

/**
 * Build the shape of a listing: how many of its projects are live.
 *
 * @param projects - The listing's projects, trashed ones included or not.
 * @returns The shape to remember.
 */
export const projectListShapeOf = (projects: ReadonlyArray<{ readonly deletedAt?: number }>): ProjectListShape => ({
  count: projects.filter((project) => project.deletedAt === undefined).length,
});

const isSameShape = (left: ProjectListShape | undefined, right: ProjectListShape): boolean =>
  left !== undefined && left.count === right.count;

const readStoredShape = (): ProjectListShape | undefined => {
  try {
    globalThis.localStorage.removeItem(legacyProjectListShapeStorageKey);
    const raw = globalThis.localStorage.getItem(projectListShapeStorageKey);
    if (raw === null) {
      return undefined;
    }
    const parsed = shapeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

const readCookieShape = (): ProjectListShape | undefined =>
  typeof document === 'undefined'
    ? undefined
    : projectListShapeFromCount(parseProjectListCount(Cookies.get(projectListCountCookieName)));

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

  const remember = (shape: ProjectListShape): void => {
    if (isSameShape(get(), shape)) {
      return;
    }
    cached = shape;
    isRead = true;
    try {
      globalThis.localStorage.setItem(projectListShapeStorageKey, JSON.stringify(shape));
    } catch {
      // Best effort: the cookie below still carries the count.
    }
    if (typeof document !== 'undefined') {
      const count = String(shape.count);
      if (globalThis.location.protocol === 'https:') {
        Cookies.set(projectListCountCookieName, count, {
          path: '/',
          sameSite: 'lax',
          expires: cookieLifetimeDays,
          secure: true,
        });
      } else {
        Cookies.set(projectListCountCookieName, count, { path: '/', sameSite: 'lax', expires: cookieLifetimeDays });
      }
    }
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

  return { get, remember, subscribe, reset };
};

/** The process-wide remembered shape. @public */
export const projectListShapeStore = createProjectListShapeStore();
