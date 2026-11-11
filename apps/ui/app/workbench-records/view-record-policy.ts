/**
 * The view record's policy for `recordSync`: its codec and the field-level patch algebra that lets a person's change
 * land on bytes another window, an agent or sync wrote in the meantime.
 */
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import type { RecordPolicy } from '#workbench-records/record-sync-policy.js';

const fields = [
  'entryPath',
  'name',
  'camera',
  'fieldOfView',
  'upDirection',
  'display',
  'grid',
  'section',
  'measurements',
  'selectedKernelView',
] as const;
type ViewField = (typeof fields)[number];
type KernelView = NonNullable<WorkbenchView['kernelViews']>[number];
type KernelViewOption = NonNullable<KernelView['options']>[string];
type KernelViewChange = Partial<Omit<KernelView, 'id' | 'options'>> & {
  replace?: true;
  options?: Record<string, KernelViewOption | undefined>;
};

/** The fields of a view a person changed: whole fields, single display and grid keys, and per-kernel-view changes. */
export type ViewRecordPatch = Partial<Pick<WorkbenchView, Exclude<ViewField, 'display' | 'grid'>>> & {
  display?: Partial<WorkbenchView['display']>;
  grid?: Partial<WorkbenchView['grid']>;
  // oxlint-disable-next-line typescript/no-restricted-types -- A removed kernel view is recorded as null.
  kernelViews?: Record<string, KernelViewChange | null>;
};

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const combineKernelViews = (
  earlier: ViewRecordPatch['kernelViews'],
  later: ViewRecordPatch['kernelViews'],
): ViewRecordPatch['kernelViews'] => {
  if (!earlier && !later) {
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-restricted-types -- A removed kernel view is recorded as null.
  const combined = new Map<string, KernelViewChange | null>();
  for (const id of new Set([...Object.keys(earlier ?? {}), ...Object.keys(later ?? {})])) {
    const before = earlier && Object.hasOwn(earlier, id) ? earlier[id] : undefined;
    const after = later && Object.hasOwn(later, id) ? later[id] : undefined;
    if (after === undefined) {
      if (before !== undefined) {
        combined.set(id, before);
      }
    } else if (after === null || after.replace === true || before === null) {
      combined.set(id, after);
    } else {
      combined.set(id, { ...before, ...after, options: { ...before?.options, ...after.options } });
    }
  }
  return Object.fromEntries(combined);
};

const mergeKernelViews = (
  current: WorkbenchView['kernelViews'],
  changes: ViewRecordPatch['kernelViews'],
): WorkbenchView['kernelViews'] => {
  if (!changes) {
    return current;
  }
  const byId = new Map((current ?? []).map((view) => [view.id, view]));
  for (const [id, change] of Object.entries(changes)) {
    if (change === null) {
      byId.delete(id);
      continue;
    }
    const prior = change.replace ? undefined : byId.get(id);
    const { replace: _replace, options: optionChanges, ...changed } = change;
    const options = new Map<string, KernelViewOption>(Object.entries(prior?.options ?? {}));
    for (const [key, value] of Object.entries(optionChanges ?? {})) {
      if (value === undefined) {
        options.delete(key);
      } else {
        options.set(key, value);
      }
    }
    byId.set(id, {
      ...prior,
      id,
      ...changed,
      ...(optionChanges ? { options: options.size > 0 ? Object.fromEntries(options) : undefined } : {}),
    });
  }
  return [...byId.values()];
};

const diffKernelViews = (
  base: WorkbenchView['kernelViews'],
  next: WorkbenchView['kernelViews'],
): ViewRecordPatch['kernelViews'] => {
  const baseViews = new Map((base ?? []).map((view) => [view.id, view]));
  const nextViews = new Map((next ?? []).map((view) => [view.id, view]));
  // oxlint-disable-next-line typescript/no-restricted-types -- A removed kernel view is recorded as null.
  const kernelViews = new Map<string, KernelViewChange | null>();
  for (const id of new Set([...baseViews.keys(), ...nextViews.keys()])) {
    const before = baseViews.get(id);
    const after = nextViews.get(id);
    if (!after) {
      kernelViews.set(id, null);
      continue;
    }
    const change: KernelViewChange = {};
    if (!before) {
      change.replace = true;
    }
    for (const field of ['authoredInstance', 'camera'] as const) {
      if (!same(before?.[field], after[field])) {
        Object.assign(change, { [field]: after[field] });
      }
    }
    const beforeOptions = before?.options;
    const afterOptions = after.options;
    const options = Object.fromEntries(
      [...new Set([...Object.keys(beforeOptions ?? {}), ...Object.keys(afterOptions ?? {})])]
        .filter(
          (key) =>
            !same(
              beforeOptions && Object.hasOwn(beforeOptions, key) ? beforeOptions[key] : undefined,
              afterOptions && Object.hasOwn(afterOptions, key) ? afterOptions[key] : undefined,
            ),
        )
        .map((key) => [key, afterOptions && Object.hasOwn(afterOptions, key) ? afterOptions[key] : undefined]),
    );
    if (Object.keys(options).length > 0) {
      change.options = options;
    }
    if (!before || Object.keys(change).length > 0) {
      kernelViews.set(id, change);
    }
  }
  return kernelViews.size > 0 ? Object.fromEntries(kernelViews) : undefined;
};

/** The view record's codec and patch algebra. */
export const viewRecordPolicy: RecordPolicy<WorkbenchView, ViewRecordPatch> = {
  read(bytes) {
    const result = workbenchRecords.view.read(bytes);
    return result.status === 'current'
      ? { status: 'current', record: result.record }
      : {
          status: result.code === 'NEWER_RECORD' ? 'newer' : 'invalid',
          code: result.code,
          message: result.message,
        };
  },
  serialize: (record) => workbenchRecords.view.serialize(record),
  diff(base, next) {
    const patch: ViewRecordPatch = {};
    for (const field of fields) {
      if (field === 'display' || field === 'grid') {
        continue;
      }
      if (!same(base?.[field], next[field])) {
        Object.assign(patch, { [field]: next[field] });
      }
    }
    const display = Object.fromEntries(
      Object.entries(next.display).filter(
        ([key, value]) => !same(base?.display[key as keyof WorkbenchView['display']], value),
      ),
    );
    const grid = Object.fromEntries(
      Object.entries(next.grid).filter(([key, value]) => !same(base?.grid[key as keyof WorkbenchView['grid']], value)),
    );
    if (Object.keys(display).length > 0) {
      patch.display = display;
    }
    if (Object.keys(grid).length > 0) {
      patch.grid = grid;
    }
    const kernelViews = diffKernelViews(base?.kernelViews, next.kernelViews);
    if (kernelViews) {
      patch.kernelViews = kernelViews;
    }
    return patch;
  },
  combine: (earlier, later) => ({
    ...earlier,
    ...later,
    ...((earlier?.display ?? later.display) ? { display: { ...earlier?.display, ...later.display } } : {}),
    ...((earlier?.grid ?? later.grid) ? { grid: { ...earlier?.grid, ...later.grid } } : {}),
    ...((earlier?.kernelViews ?? later.kernelViews)
      ? { kernelViews: combineKernelViews(earlier?.kernelViews, later.kernelViews) }
      : {}),
  }),
  // The schema supplies required defaults when the file is first created, through `next`.
  merge: (current, next, patch) => ({
    ...next,
    ...current,
    ...patch,
    display: { ...next.display, ...current?.display, ...patch.display },
    grid: { ...next.grid, ...current?.grid, ...patch.grid },
    kernelViews: mergeKernelViews(current?.kernelViews, patch.kernelViews),
    version: 1,
    // oxlint-disable-next-line typescript/prefer-nullish-coalescing -- An explicit null entry binding is a value.
    entryPath: patch.entryPath === undefined ? (current?.entryPath ?? null) : patch.entryPath,
    camera: patch.camera ?? current?.camera ?? next.camera,
  }),
  isEmpty: (patch) => Object.keys(patch).length === 0,
};
