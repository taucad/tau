/**
 * The viewer page's camera and component display, kept in the project's `.tau/workbench` records (agent plugin UI
 * blueprint W10, Q14), so Tau opens the project with the view the person left in the page.
 *
 * Only the person's own interaction is kept: until a page's `interactedAt` moves past what it was when that page first
 * reported a model, its reports of that model are ignored, so opening a model or an agent's selection writes nothing.
 * Only what changed since the page's previous report is written, the camera or the component display, so a page that
 * merely keeps polling never reverts what `arrange_workbench` or Tau wrote meanwhile. Writes settle for a moment,
 * then go out view first, then the layout that names a view this writer created, then entries. Each one replaces the
 * file only if it still holds the bytes it was computed from; a record another writer changed meanwhile wins, and the
 * next report computes against it. A view created for a layout write that is refused is removed again. A record that
 * is invalid or from a newer Tau is left untouched, and nothing is written for it.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { TauViewerViewState } from '@taucad/mcp/viewer-protocol';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { ViewerNode, WorkbenchEntries, WorkbenchLayout, WorkbenchView } from '@taucad/workbench';

/** The frame a page reports its camera in when it names none. */
const rootFrame = 'tau:root';

/** The folder Tau keeps view records in, relative to the project. */
const viewsFolder = `${dirname(workbenchPaths.view('v'))}/`;

/** Timing knobs; tests shorten them. */
export type McpViewerWorkbenchOptions = Readonly<{
  /** How long a report waits for the next one before it is written. Milliseconds. */
  settle?: number;
  /** Where a failed write is reported; `tau mcp` passes stderr. */
  onError?: (error: unknown) => void;
}>;

/** Keeps the pages' views in the project's workbench records. */
export type McpViewerWorkbench = Readonly<{
  /** A page reported its view of a model shown from `root`. */
  report(input: Readonly<{ root: string; pageId: string; view: TauViewerViewState }>): void;
  /** Write what is waiting now. */
  flush(): Promise<void>;
  /** Write what is waiting and stop. */
  close(): Promise<void>;
}>;

/** The bytes a record held when it was read; `undefined` when the file was absent. */
type Read = Readonly<{ path: string; text: string | undefined }>;

type Write = Read & Readonly<{ next: string }>;

/** Which parts of a page's view changed since its previous report, and so are the person's to write. */
type Changed = Readonly<{ camera: boolean; components: boolean }>;

const sameList = <Item>(left: readonly Item[], right: readonly Item[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const sameCamera = (left: TauViewerViewState['camera'], right: TauViewerViewState['camera']): boolean =>
  left === undefined || right === undefined
    ? left === right
    : sameList(left.target, right.target) &&
      sameList(left.direction, right.direction) &&
      sameList(left.up, right.up) &&
      left.verticalSpan === right.verticalSpan &&
      left.frameId === right.frameId &&
      left.perspectiveZoom === right.perspectiveZoom;

/**
 * Say which parts of a page's view moved between two of its reports.
 *
 * @param previous - The page's previous report of the model.
 * @param next - Its new report.
 * @returns The parts that changed.
 */
const changedBetween = (previous: TauViewerViewState, next: TauViewerViewState): Changed => ({
  camera: !sameCamera(previous.camera, next.camera),
  components: !sameList(previous.hidden, next.hidden) || !sameList(previous.isolated, next.isolated),
});

const readText = async (root: string, path: string): Promise<string | undefined> => {
  try {
    return await readFile(join(root, path), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

/**
 * Decode a record, or say it must be left alone.
 *
 * @param codec - The record's codec.
 * @param text - The file's text.
 * @returns The record, or `undefined` when the file is invalid or newer.
 */
const decode = <Value>(
  codec: Readonly<{ read(bytes: Uint8Array<ArrayBuffer>): { status: string; record?: Value } }>,
  text: string,
): Value | undefined => {
  const read = codec.read(new TextEncoder().encode(text));
  return read.status === 'current' ? read.record : undefined;
};

const viewIdsOf = (node: ViewerNode): string[] =>
  node.kind === 'group' ? node.tabs.map((tab) => tab.view) : node.children.flatMap(viewIdsOf);

/**
 * Add a view to the viewer lane's first group and show it.
 *
 * @param node - The viewer lane.
 * @param id - The view id.
 * @returns The lane with the tab added.
 */
const withViewTab = (node: ViewerNode, id: string): ViewerNode => {
  if (node.kind === 'group') {
    return { ...node, tabs: [...node.tabs, { kind: 'view', view: id }], active: node.tabs.length };
  }
  const [first, ...rest] = node.children;
  return first === undefined ? node : { ...node, children: [withViewTab(first, id), ...rest] };
};

/**
 * Replace a file only if it still holds the bytes the write was computed from.
 *
 * @param root - The project folder.
 * @param write - The path, its bytes when read, and the new text.
 * @returns Whether the file was replaced.
 */
const writeChecked = async (root: string, write: Write): Promise<boolean> => {
  const absolute = join(root, write.path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporary, write.next, 'utf8');
  try {
    if ((await readText(root, write.path)) !== write.text) {
      return false;
    }
    await rename(temporary, absolute);
    return true;
  } finally {
    await rm(temporary, { force: true });
  }
};

/**
 * A view record's camera from the page's.
 *
 * @param camera - The page's camera.
 * @returns The pose Tau restores.
 */
const poseOf = (camera: NonNullable<TauViewerViewState['camera']>): NonNullable<WorkbenchView['camera']> => ({
  kind: 'pose',
  frameId: camera.frameId ?? rootFrame,
  target: [...camera.target],
  direction: [...camera.direction],
  up: [...camera.up],
  verticalSpan: camera.verticalSpan,
  perspectiveZoom: camera.perspectiveZoom ?? 1,
});

/**
 * The writes that keep one view: the page's pose in a view of its entry, a viewer tab for a view this writer had to
 * create, and its component display in `entries.json`. Only the parts the page changed are written; a view this
 * writer creates takes the page's pose regardless.
 *
 * @param root - The project folder.
 * @param view - What the page reported.
 * @param changed - The parts of the view the person changed.
 * @returns The writes in order, or `undefined` when a record must be left alone.
 */
const plan = async (root: string, view: TauViewerViewState, changed: Changed): Promise<Write[] | undefined> => {
  const entryPath = view.model.sourceFile ?? view.model.path;
  const layoutText = await readText(root, workbenchPaths.layout);
  const layout = layoutText === undefined ? undefined : decode<WorkbenchLayout>(workbenchRecords.layout, layoutText);
  if (layoutText !== undefined && layout === undefined) {
    return undefined;
  }

  /* The first view of this entry the layout shows is the one Tau opens it in. */
  let found: Readonly<{ id: string; read: Read; record: WorkbenchView }> | undefined;
  for (const id of layout === undefined ? [] : viewIdsOf(layout.viewer)) {
    const path = workbenchPaths.view(id);
    // oxlint-disable-next-line eslint/no-await-in-loop -- The layout names few views, and the first match ends the search.
    const text = await readText(root, path);
    const record = text === undefined ? undefined : decode<WorkbenchView>(workbenchRecords.view, text);
    if (record?.entryPath === entryPath) {
      found = { id, read: { path, text }, record };
      break;
    }
  }
  const id = found?.id ?? `v-${randomBytes(4).toString('hex')}`;
  const viewRead: Read = found?.read ?? { path: workbenchPaths.view(id), text: undefined };
  const camera = found === undefined || changed.camera ? view.camera : undefined;
  const nextView = workbenchRecords.view.serialize({
    ...(found?.record ?? { version: 1, entryPath }),
    ...(camera === undefined ? {} : { camera: poseOf(camera) }),
  });

  const entriesText = await readText(root, workbenchPaths.entries);
  const entries =
    entriesText === undefined ? undefined : decode<WorkbenchEntries>(workbenchRecords.entries, entriesText);
  if (entriesText !== undefined && entries === undefined) {
    return undefined;
  }
  const settings = entries?.entries[entryPath];
  const nextEntries = workbenchRecords.entries.serialize({
    version: 1,
    entries: {
      ...entries?.entries,
      [entryPath]: {
        ...settings,
        components: {
          hidden: [...view.hidden],
          isolated: [...view.isolated],
          opacity: settings?.components?.opacity ?? [],
        },
      },
    },
  });

  const writes: Write[] = [{ ...viewRead, next: nextView }];
  /* The layout goes before entries, so a refused entries write leaves no view the layout does not name. */
  if (found === undefined) {
    const nextLayout: WorkbenchLayout = layout ?? {
      version: 1,
      lanes: { chat: true, workbench: true },
      viewer: { kind: 'group', tabs: [] },
      workbench: { kind: 'group', tabs: [] },
    };
    writes.push({
      path: workbenchPaths.layout,
      text: layoutText,
      next: workbenchRecords.layout.serialize({ ...nextLayout, viewer: withViewTab(nextLayout.viewer, id) }),
    });
  }
  if (changed.components) {
    writes.push({ path: workbenchPaths.entries, text: entriesText, next: nextEntries });
  }
  return writes.filter((write) => write.next !== write.text);
};

/**
 * Make one plan's writes in order, stopping at the first that is refused. A view file the plan created is removed again
 * when the layout that would name it is refused, so no view is left that nothing names.
 *
 * @param root - The project folder.
 * @param writes - The plan's writes, in order.
 */
const writeInOrder = async (root: string, writes: readonly Write[]): Promise<void> => {
  let created: string | undefined;
  for (const write of writes) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Tau adopts a view before the layout that names it, so the order holds.
    if (!(await writeChecked(root, write))) {
      if (created !== undefined && write.path === workbenchPaths.layout) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- The loop ends here.
        await rm(join(root, created), { force: true });
      }
      return;
    }
    if (write.text === undefined && write.path.startsWith(viewsFolder)) {
      created = write.path;
    }
  }
};

/**
 * Keep the pages' views in their projects' workbench records.
 *
 * @param options - Timing and where failures go.
 * @returns The keeper.
 */
export const createMcpViewerWorkbench = (options: McpViewerWorkbenchOptions = {}): McpViewerWorkbench => {
  /** Milliseconds. */
  const settle = options.settle ?? 1500;
  const onError = options.onError ?? (() => undefined);
  /** The newest report per project file, waiting to be written. */
  const waiting = new Map<string, Readonly<{ root: string; view: TauViewerViewState; changed: Changed }>>();
  /**
   * Each page's `interactedAt` when it first reported a model (what counts as no interaction yet), and its previous
   * report of that model (what its next report is compared with).
   */
  const pages = new Map<string, Readonly<{ baseline: number; previous: TauViewerViewState }>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  const writeWaiting = async (): Promise<void> => {
    const batch = [...waiting.values()];
    waiting.clear();
    for (const { root, view, changed } of batch) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- One project's records are written in order, one view at a time.
        const writes = await plan(root, view, changed);
        // oxlint-disable-next-line eslint/no-await-in-loop -- Ditto.
        await writeInOrder(root, writes ?? []);
      } catch (error) {
        onError(error);
      }
    }
  };

  const flush = async (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    /* Writes never overlap: a flush waits for the one before it. */
    const previous = running;
    running = (async () => {
      await previous;
      await writeWaiting();
    })();
    await running;
  };

  return {
    report({ root, pageId, view }) {
      const key = `${root}\0${view.model.sourceFile ?? view.model.path}`;
      const page = `${pageId}\0${key}`;
      const seen = pages.get(page);
      if (seen === undefined) {
        pages.set(page, { baseline: view.interactedAt, previous: view });
        return;
      }
      pages.set(page, { baseline: seen.baseline, previous: view });
      const changed = changedBetween(seen.previous, view);
      if (view.interactedAt <= seen.baseline || (!changed.camera && !changed.components)) {
        return;
      }
      /* A report still waiting keeps the parts it changed; this one adds its own. */
      const queued = waiting.get(key)?.changed;
      waiting.set(key, {
        root,
        view,
        changed: {
          camera: changed.camera || (queued?.camera ?? false),
          components: changed.components || (queued?.components ?? false),
        },
      });
      clearTimeout(timer);
      timer = setTimeout(() => {
        void flush();
      }, settle);
      // A waiting write must not keep `tau mcp` running after stdin closes; `close` writes it.
      timer.unref();
    },
    flush,
    close: flush,
  };
};
