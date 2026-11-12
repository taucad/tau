/**
 * The device's view exceptions (onboarding blueprint, Finding 6): the leaves this person set, in one view, to the file
 * format's own value. A view file cannot tell such a leaf from one it inherits, so the device keeps the list. It is
 * personal, never synced and never server-visible; it changes what its owner sees and nothing else.
 *
 * Stored as one section under `view-exceptions` through the section store, so every write reads what is stored,
 * merges and writes in one step, and two tabs never lose each other's entries. No clock is written: when more than
 * {@link maxExceptionViews} views hold exceptions, whole projects are dropped in key order, and a project's key moves
 * to the end whenever it is written, so the first key is the project written longest ago. When the project just written
 * alone holds more, its own views are dropped the same way, by key order, and the view just written stays.
 */
import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { viewFieldPaths } from '@taucad/workbench';
import type { ViewFieldPath } from '@taucad/workbench';
import type { SectionDefinition } from '@taucad/preferences';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { createSectionStore } from '#preferences/section-store.js';
import type { SectionStore, SectionWriteResult } from '#preferences/section-store.js';

/** The most views that may hold exceptions on one device. */
export const maxExceptionViews = 200;

const viewFieldPathSchema = z.enum(viewFieldPaths as [ViewFieldPath, ...ViewFieldPath[]]);

/** The `view-exceptions` section. */
export const viewExceptionsSchema = z.strictObject({
  version: z.literal(1),
  byProject: z.record(z.string().min(1), z.record(z.string().min(1), z.array(viewFieldPathSchema))),
});

/** The leaves set to the format value, per project and view, on this device. */
export type ViewExceptions = z.infer<typeof viewExceptionsSchema>;

/** One change to the exceptions list. */
export type ViewExceptionsWrite =
  | Readonly<{ kind: 'add'; projectId: string; viewId: string; leaf: ViewFieldPath }>
  | Readonly<{ kind: 'remove'; projectId: string; viewId: string; leaf: ViewFieldPath }>
  | Readonly<{ kind: 'clearView'; projectId: string; viewId: string }>
  | Readonly<{ kind: 'copy'; projectId: string; from: string; to: string }>
  | Readonly<{ kind: 'dropProject'; projectId: string }>;

/** No exceptions. */
export const emptyViewExceptions: ViewExceptions = Object.freeze({ version: 1, byProject: {} });

type Views = Record<string, ViewFieldPath[]>;

/* A record's own entry: a project or view id such as `constructor` never reads `Object.prototype`. */
const own = <Value>(record: Readonly<Record<string, Value>>, key: string): Value | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/* The project's views moved to the end of the key order, so the first key is the project written longest ago. */
const withProject = (byProject: ViewExceptions['byProject'], projectId: string, views: Views): ViewExceptions => {
  const { [projectId]: _previous, ...others } = byProject;
  const next: ViewExceptions['byProject'] =
    Object.keys(views).length === 0 ? others : { ...others, [projectId]: views };
  return { version: 1, byProject: capped(next, projectId) };
};

const countViews = (value: ViewExceptions['byProject']): number =>
  Object.values(value).reduce((total, views) => total + Object.keys(views).length, 0);

/* Drops whole projects in key order until at most `maxExceptionViews` views remain. The project just written goes
 * last: when it alone holds more, its views are dropped in key order, and a view's key moves to the end whenever it is
 * written, so the view just written stays. */
const capped = (byProject: ViewExceptions['byProject'], keep: string): ViewExceptions['byProject'] => {
  let next = byProject;
  for (const projectId of Object.keys(byProject)) {
    if (countViews(next) <= maxExceptionViews) {
      return next;
    }
    if (projectId !== keep) {
      const { [projectId]: _dropped, ...rest } = next;
      next = rest;
    }
  }
  const kept = own(next, keep);
  const excess = countViews(next) - maxExceptionViews;
  if (kept === undefined || excess <= 0) {
    return next;
  }
  return { ...next, [keep]: Object.fromEntries(Object.entries(kept).slice(excess)) };
};

const withView = (views: Views, viewId: string, leaves: readonly ViewFieldPath[]): Views => {
  const { [viewId]: _previous, ...others } = views;
  return leaves.length === 0 ? others : { ...others, [viewId]: [...leaves] };
};

/**
 * Merge one write into what is stored.
 *
 * @param stored - The exceptions stored right now.
 * @param write - The change.
 * @returns The exceptions after the change.
 */
export const mergeViewExceptions = (stored: ViewExceptions, write: ViewExceptionsWrite): ViewExceptions => {
  const { byProject } = stored;
  const views: Views = own(byProject, write.projectId) ?? {};
  switch (write.kind) {
    case 'add': {
      const leaves = own(views, write.viewId) ?? [];
      return leaves.includes(write.leaf)
        ? withProject(byProject, write.projectId, views)
        : withProject(byProject, write.projectId, withView(views, write.viewId, [...leaves, write.leaf]));
    }
    case 'remove': {
      const leaves = own(views, write.viewId);
      if (!leaves?.includes(write.leaf)) {
        return stored;
      }
      const next = withView(
        views,
        write.viewId,
        leaves.filter((leaf) => leaf !== write.leaf),
      );
      return withProject(byProject, write.projectId, next);
    }
    case 'clearView': {
      return own(views, write.viewId) === undefined
        ? stored
        : withProject(byProject, write.projectId, withView(views, write.viewId, []));
    }
    case 'copy': {
      const leaves = own(views, write.from);
      if (leaves === undefined && own(views, write.to) === undefined) {
        return stored;
      }
      return withProject(byProject, write.projectId, withView(views, write.to, leaves ?? []));
    }
    case 'dropProject': {
      if (own(byProject, write.projectId) === undefined) {
        return stored;
      }
      const { [write.projectId]: _dropped, ...rest } = byProject;
      return { version: 1, byProject: rest };
    }
    default: {
      return stored;
    }
  }
};

/** The `view-exceptions` section definition for the section store. */
export const viewExceptionsSection: SectionDefinition<ViewExceptions, ViewExceptionsWrite> = {
  name: 'view-exceptions',
  version: 1,
  schema: viewExceptionsSchema,
  empty: emptyViewExceptions,
  merge: mergeViewExceptions,
};

/** This device's view exceptions. */
export const viewExceptionsStore: SectionStore<ViewExceptions, ViewExceptionsWrite> = createSectionStore(
  cookieName.viewExceptions,
  viewExceptionsSection,
);

const noLeaves: readonly ViewFieldPath[] = Object.freeze([]);

/**
 * The leaves listed for one view.
 *
 * @param exceptions - The exceptions.
 * @param projectId - The project.
 * @param viewId - The view.
 * @returns The listed leaves; the same empty array when there are none.
 */
export const exceptionsForView = (
  exceptions: ViewExceptions,
  projectId: string,
  viewId: string,
): readonly ViewFieldPath[] => {
  const views = own(exceptions.byProject, projectId);
  return (views === undefined ? undefined : own(views, viewId)) ?? noLeaves;
};

/** Writers over {@link viewExceptionsStore}. Each returns what the section store did. */
export const viewExceptions = {
  add: (projectId: string, viewId: string, leaf: ViewFieldPath): SectionWriteResult =>
    viewExceptionsStore.write({ kind: 'add', projectId, viewId, leaf }),
  remove: (projectId: string, viewId: string, leaf: ViewFieldPath): SectionWriteResult =>
    viewExceptionsStore.write({ kind: 'remove', projectId, viewId, leaf }),
  clearView: (projectId: string, viewId: string): SectionWriteResult =>
    viewExceptionsStore.write({ kind: 'clearView', projectId, viewId }),
  copy: (projectId: string, from: string, to: string): SectionWriteResult =>
    viewExceptionsStore.write({ kind: 'copy', projectId, from, to }),
  dropProject: (projectId: string): SectionWriteResult => viewExceptionsStore.write({ kind: 'dropProject', projectId }),
} as const;

/**
 * This device's exceptions, refreshed when this tab or another changes them.
 *
 * @returns The exceptions.
 */
export const useViewExceptions = (): ViewExceptions =>
  useSyncExternalStore(viewExceptionsStore.subscribe, viewExceptionsStore.read, viewExceptionsStore.readInitial);
