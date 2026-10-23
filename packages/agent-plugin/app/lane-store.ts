/**
 * What the page remembers of its lane per project, as the Tau app keeps the same facts per device (`WorkbenchDevice`
 * in `@taucad/workbench`): the lane's width, whether it is open, its tabs, the paneview sections each pane laid out,
 * and pane options such as an export format's.
 *
 * It lives in the frame's `localStorage` under one key per project. An MCP Apps host may refuse the frame storage, so
 * every read and write is guarded and the store then keeps its values in memory for the page's lifetime. The viewer
 * state that matters across devices (camera, section, hidden parts) lives in `.tau/workbench` on the server instead.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ModelPanelLayout } from '@taucad/workbench-panes/model/model-source';
import type { PaneLaneLayout } from '@taucad/workbench-panes/lane/pane-lane';
import { workbenchPaneIds } from '@taucad/workbench-panes/registry/pane-registry';
import type { WorkbenchPaneId } from '@taucad/workbench-panes/registry/pane-registry';

/** The paneview a Model or Parameters pane hands its layout hook. */
type PaneviewApi = Parameters<ModelPanelLayout['connectApi']>[0];

/** The lane's open state and tabs; the width is `laneWidths.workbench`, as desktop keeps it. */
type LaneState = Readonly<{ isOpen?: boolean; open?: readonly WorkbenchPaneId[]; active?: WorkbenchPaneId }>;

/** One paneview section: whether it is expanded and its height in CSS pixels (`WorkbenchDevice.sections`). */
type SectionState = Readonly<{ expanded: boolean; size: number }>;

/** The panes whose paneview sections the store keeps. */
export type LaneSectionPane = 'model' | 'parameters';

/** A per-project store of the lane's device facts. */
export type LaneStore = Readonly<{
  /** The lane's saved layout, as `PaneLane` restores it, and whether it was open. */
  readLane(): Readonly<Partial<PaneLaneLayout> & { isOpen?: boolean }>;
  /** Save whether the lane is open. */
  writeLaneOpen(isOpen: boolean): void;
  /** Save the lane's tabs and width. */
  writeLaneLayout(layout: PaneLaneLayout): void;
  /** A pane's saved paneview sections, by section id (an entry path, or `properties`). */
  readSections(pane: LaneSectionPane): Readonly<Record<string, SectionState>>;
  /** Save a pane's paneview sections. */
  writeSections(pane: LaneSectionPane, sections: Readonly<Record<string, SectionState>>): void;
  /** A pane option, such as `export/stl/options`; `undefined` when none is saved. */
  readOption(key: string): unknown;
  /** Save a pane option; `undefined` removes it. */
  writeOption(key: string, value: unknown): void;
}>;

/** The record one project's key holds. */
type StoredRecord = {
  laneWidths?: { workbench?: number };
  lane?: LaneState;
  sections?: Partial<Record<LaneSectionPane, Record<string, SectionState>>>;
  panes?: Record<string, unknown>;
};

/** The storage the store reads, as `localStorage` offers it. */
type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const storageKeyPrefix = 'tau-viewer:lane:';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const paneIdSet: ReadonlySet<string> = new Set(workbenchPaneIds);
const isPaneId = (value: unknown): value is WorkbenchPaneId => typeof value === 'string' && paneIdSet.has(value);

const isSection = (value: unknown): value is SectionState =>
  isRecord(value) && typeof value['expanded'] === 'boolean' && Number.isFinite(value['size']);

/**
 * The frame's `localStorage`, or `undefined` when the host refuses it: reading the property can throw in a sandbox.
 *
 * @returns The storage, if any.
 */
const frameStorage = (): KeyValueStorage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * Create the lane store for one project.
 *
 * @param projectKey - The shown model's `projectKey`; an older `tau` names none, and every project then shares one key.
 * @param storage - Where values persist; the frame's `localStorage` by default. Tests pass their own.
 * @returns The store.
 */
export function createLaneStore(
  projectKey: string | undefined,
  storage: KeyValueStorage | undefined = frameStorage(),
): LaneStore {
  const key = `${storageKeyPrefix}${projectKey ?? 'default'}`;
  /* The memory copy is the record; storage is its best-effort mirror. */
  let record: StoredRecord = {};
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? '{}');
    record = isRecord(parsed) ? (parsed as StoredRecord) : {};
  } catch {
    record = {};
  }
  const update = (change: (current: StoredRecord) => StoredRecord): void => {
    record = change(record);
    try {
      storage?.setItem(key, JSON.stringify(record));
    } catch {
      /* Refused or full: the memory copy keeps the value for this page. */
    }
  };

  return {
    readLane() {
      const lane = isRecord(record.lane) ? record.lane : {};
      const width = record.laneWidths?.workbench;
      return {
        ...(typeof lane.isOpen === 'boolean' ? { isOpen: lane.isOpen } : {}),
        ...(Array.isArray(lane.open) ? { open: lane.open.filter(isPaneId) } : {}),
        ...(isPaneId(lane.active) ? { active: lane.active } : {}),
        ...(typeof width === 'number' && Number.isFinite(width) ? { width } : {}),
      };
    },
    writeLaneOpen(isOpen) {
      update((current) => ({ ...current, lane: { ...current.lane, isOpen } }));
    },
    writeLaneLayout({ open, active, width }) {
      update((current) => ({
        ...current,
        laneWidths: { ...current.laneWidths, workbench: width },
        lane: { ...current.lane, open: [...open], ...(active === undefined ? {} : { active }) },
      }));
    },
    readSections(pane) {
      const sections = record.sections?.[pane];
      return isRecord(sections)
        ? Object.fromEntries(Object.entries(sections).filter((entry) => isSection(entry[1])))
        : {};
    },
    writeSections(pane, sections) {
      update((current) => ({ ...current, sections: { ...current.sections, [pane]: { ...sections } } }));
    },
    readOption(optionKey) {
      return record.panes?.[optionKey];
    },
    writeOption(optionKey, value) {
      update((current) => {
        const { [optionKey]: _removed, ...rest } = current.panes ?? {};
        return { ...current, panes: value === undefined ? rest : { ...rest, [optionKey]: value } };
      });
    },
  };
}

/**
 * A paneview's saved section layout over the lane store, in the shape `ModelSource.usePanelLayout` returns: the
 * saved sections on mount, and every later layout change written back, as desktop's `usePaneviewPersistence` does.
 *
 * @param store - The project's lane store.
 * @param pane - Whose sections these are.
 * @returns The saved state and the hook to connect the paneview.
 */
export function useStoredPanelLayout(store: LaneStore, pane: LaneSectionPane): ModelPanelLayout {
  const [savedState] = useState(() =>
    Object.fromEntries(
      Object.entries(store.readSections(pane)).map(([id, { expanded, size }]) => [id, { isExpanded: expanded, size }]),
    ),
  );
  const [api, setApi] = useState<PaneviewApi | undefined>(undefined);
  const connectApi = useCallback((paneviewApi: PaneviewApi) => {
    setApi(paneviewApi);
  }, []);
  useEffect(() => {
    if (api === undefined) {
      return;
    }
    const disposable = api.onDidLayoutChange(() => {
      store.writeSections(
        pane,
        Object.fromEntries(
          api.panels.map((panel) => [panel.id, { expanded: panel.api.isExpanded, size: panel.height }]),
        ),
      );
    });
    return () => {
      disposable.dispose();
    };
  }, [api, pane, store]);
  return { savedState, connectApi };
}
