import type { ComponentType } from 'react';
import type { PaneviewApi } from 'dockview-react';
import type { ParameterManifest, ParameterSetOutcome, ParameterSetTarget } from '@taucad/parameters';
import type { FileParameterEntry } from '@taucad/types';
import type { ParameterDraft, ParameterValueEdit } from '@taucad/viewer/parameters/parameter-edit';
import type { ParameterCommit } from '@taucad/viewer/parameters/rjsf-context';

/**
 * Why an entry's parameters could not be read, or why the last write could not be confirmed.
 *
 * @public
 */
export type ParametersFailure = Readonly<{
  /** Stable code; `INVALID_RECORD` marks a saved record that cannot be read. */
  code: string;
  message: string;
}>;

/**
 * What the Parameters pane shows for one entry.
 *
 * @public
 */
export type ParametersEntryState = Readonly<{
  /** The admitted manifest, or `undefined` while it is not known yet. */
  manifest: ParameterManifest | undefined;
  /** The entry's current parameter record, or `undefined` before one was read. */
  entry: FileParameterEntry | undefined;
  /** Why the entry cannot be edited right now, when it cannot. */
  failure: ParametersFailure | undefined;
}>;

/**
 * The field one retained editor draft belongs to.
 *
 * @public
 */
export type ParametersDraftKey = Readonly<{ entryPath: string; group: string; pointer: string }>;

/**
 * Where rows keep the text they leave behind when they unmount. Absent, the pane keeps drafts while it is mounted.
 *
 * @public
 */
export type ParametersDrafts = Readonly<{
  draft: (key: ParametersDraftKey) => ParameterDraft | undefined;
  /** Retain or clear one row's draft; `undefined` clears it. */
  setDraft: (key: ParametersDraftKey, draft: Pick<ParameterDraft, 'text' | 'valid'> | undefined) => void;
  /**
   * Observe final settlement and drafts discarded elsewhere.
   *
   * @returns Unsubscribes.
   */
  subscribe: (listener: () => void) => () => void;
}>;

/**
 * Parameter group operations. A rejected promise is shown through {@link ParametersSource.reportError}.
 *
 * @public
 */
export type ParameterGroupOperations = Readonly<{
  select: (entryPath: string, manifest: ParameterManifest, group: string) => Promise<void> | void;
  create: (
    entryPath: string,
    manifest: ParameterManifest,
    input: Readonly<{ group: string; values?: Readonly<Record<string, unknown>> }>,
  ) => Promise<void> | void;
  rename: (
    entryPath: string,
    manifest: ParameterManifest,
    input: Readonly<{ group: string; nextGroup: string }>,
  ) => Promise<void> | void;
  delete: (entryPath: string, manifest: ParameterManifest, group: string) => Promise<void> | void;
}>;

/**
 * Saved expansion and size of the pane's sections.
 *
 * @public
 */
export type ParametersPaneviewPersistence = Readonly<{
  /** Per section id (the entry path): whether it was expanded, and its height. */
  savedState: Readonly<Record<string, Readonly<{ isExpanded: boolean; size?: number }>>>;
  /** Called once the sections exist, so the host can follow their layout. */
  connectApi: (api: PaneviewApi) => void;
}>;

/**
 * What the Parameters pane needs from its host beyond the shared units. Each host (the Tau app, the agent plugin viewer)
 * implements it over its own state. The filter, the sections, the group selector, reset and expand/collapse all are the
 * pane's own; the entry menu shows only the actions the source offers.
 *
 * @public
 */
export type ParametersSource = Readonly<{
  /**
   * The entries that have parameters to show, a subset of the host's units. A hook: it is called during render. Absent,
   * every unit is listed.
   */
  useEntryPaths?: () => readonly string[];
  /** One entry's manifest, record and failure. A hook: it is called during render, once per listed entry. */
  useEntry: (entryPath: string) => ParametersEntryState;
  /** The authority target an edit names. Absent, the pane names the entry under an empty root. */
  target?: (entryPath: string) => ParameterSetTarget;
  /** Commit one field of one group against the entry's current record. */
  commitValue: (
    entryPath: string,
    manifest: ParameterManifest,
    field: ParameterValueEdit & Readonly<{ group: string }>,
  ) => Promise<ParameterSetOutcome>;
  /** Replace the active group's values; `{}` resets the entry to the model defaults. */
  replaceValues: (
    entryPath: string,
    manifest: ParameterManifest,
    values: Readonly<Record<string, unknown>>,
  ) => Promise<void> | void;
  /** Read the entry again after a failure. Absent, a failure offers no retry. */
  retry?: (entryPath: string, manifest: ParameterManifest | undefined) => void;
  /** Replace an unreadable record with an empty one. Absent, an unreadable record offers a retry instead. */
  resetRecord?: (entryPath: string) => Promise<void>;
  /** Show an operation's failure. Absent, the pane shows it above its sections. */
  reportError?: (message: string) => void;
  drafts?: ParametersDrafts;
  /**
   * The entry's drag-time preview lane. A hook: it is called during render, once per listed entry. Absent, a dragged
   * row previews its value alone and the model renders on release.
   */
  useScrub?: (entryPath: string) => Pick<ParameterCommit, 'scrub' | 'endScrub'>;
  /** Group operations. Absent, the pane shows no group selector. */
  groups?: ParameterGroupOperations;
  /** Show the entry in a viewer. Absent, the menu has no "Open in viewer". */
  openInViewer?: (entryPath: string) => void;
  /** Open the entry's source. Absent, the menu has no "Open in editor". */
  openInEditor?: (entryPath: string) => void;
  /** Stop rendering the entry. Absent, the menu has no "Close renderer"; it is disabled for the last entry. */
  closeEntry?: (entryPath: string) => void;
  /** The body of an entry's "Quick export" submenu. Absent, the menu has no "Quick export". */
  QuickExport?: ComponentType<Readonly<{ entryPath: string }>>;
  /** Keeps section expansion and size. A hook: it is called during render. Absent, nothing is kept. */
  usePaneviewPersistence?: () => ParametersPaneviewPersistence;
}>;
