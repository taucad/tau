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
 * listing arrives. The last listing's count and leading names are kept in
 * `localStorage` for the client's first render, and the count alone rides a
 * request cookie so the server reserves the same number of slots, or renders
 * the empty state, before any script runs.
 *
 * The snapshot is presentation only: it never decides what a project is or
 * whether it exists. The real listing replaces it in place and refreshes it.
 */

/** The request cookie carrying only the remembered project count. */
export const projectListCountCookieName = `${metaConfig.cookiePrefix}project-count`;

/** The `localStorage` key holding the whole remembered shape. */
export const projectListShapeStorageKey = `${metaConfig.cookiePrefix}project-list-shape`;

/** How many leading project names are remembered for first paint. */
export const rememberedProjectNameLimit = 20;

/** A count past this is not a list shape any page reserves; it is a corrupt cookie. */
const maxRememberedCount = 100_000;

/** Cookie lifetime in days, below the 400-day cap browsers apply. */
const cookieLifetimeDays = 365;

/** One remembered project: enough to name its placeholder row. */
export type RememberedProject = {
  readonly id: string;
  readonly name: string;
};

/** The remembered list shape. `projects` is empty when only the count is known (the server's view). */
export type ProjectListShape = {
  readonly count: number;
  readonly projects: readonly RememberedProject[];
};

const shapeSchema = z.object({
  count: z.number().int().min(0).max(maxRememberedCount),
  projects: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .max(rememberedProjectNameLimit)
    .readonly(),
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
 * The shape the server can know: the count, with no names.
 *
 * @param count - The remembered count, if any.
 * @returns The shape, or `undefined` when the count is unknown.
 */
export const projectListShapeFromCount = (count: number | undefined): ProjectListShape | undefined =>
  count === undefined ? undefined : { count, projects: [] };

/**
 * Build the shape of a listing: its live projects, most recent first.
 *
 * @param projects - The listing's projects, trashed ones included or not.
 * @returns The shape to remember.
 */
export const projectListShapeOf = (
  projects: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly lastActivityAt: number;
    readonly deletedAt?: number;
  }>,
): ProjectListShape => {
  const live = projects
    .filter((project) => project.deletedAt === undefined)
    .toSorted((left, right) => right.lastActivityAt - left.lastActivityAt || left.id.localeCompare(right.id));
  return {
    count: live.length,
    projects: live.slice(0, rememberedProjectNameLimit).map(({ id, name }) => ({ id, name })),
  };
};

const isSameShape = (left: ProjectListShape | undefined, right: ProjectListShape): boolean =>
  left !== undefined &&
  left.count === right.count &&
  left.projects.length === right.projects.length &&
  left.projects.every(
    (project, index) => project.id === right.projects.at(index)?.id && project.name === right.projects.at(index)?.name,
  );

const readStoredShape = (): ProjectListShape | undefined => {
  try {
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
      Cookies.set(projectListCountCookieName, String(shape.count), {
        path: '/',
        sameSite: 'lax',
        expires: cookieLifetimeDays,
        ...(globalThis.location.protocol === 'https:' ? { secure: true } : {}),
      });
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
