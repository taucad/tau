import { z } from 'zod';
import {
  workbenchPaths,
  workbenchRecords,
  workbenchLayoutSchema,
  workbenchViewSchema,
  workbenchEntriesSchema,
} from '@taucad/workbench';
import type { WorkbenchTab, WorkbenchNode, WorkbenchView, WorkbenchEntries } from '@taucad/workbench';
import { sha256String } from '@taucad/utils/hash';
import type {
  ArrangeWorkbenchInput,
  ArrangeWorkbenchOutput,
  ArrangeWorkbenchErrorCode,
} from '#schemas/tools/arrange-workbench.tool.schema.js';
import type { RpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem, RpcWorkbenchClient } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
// oxlint-disable eslint/no-await-in-loop -- Ordered checked writes and conflict retries require sequential I/O.

type Failure = { success: false; errorCode: ArrangeWorkbenchErrorCode; message: string };
type Result = RpcResult<'arrange_workbench'>;
type Group = { kind: 'group'; size?: number; tabs: WorkbenchTab[]; active?: number };
type Node = Group | { kind: 'split'; size?: number; direction: 'row' | 'column'; children: Node[] };
type Write = { path: string; text?: string; previous?: string };
const encoder = new TextEncoder();
const failure = (errorCode: ArrangeWorkbenchErrorCode, message: string): Failure => ({
  success: false,
  errorCode,
  message,
});
const invalid = (path: string): Failure =>
  failure(
    'INVALID_RECORD',
    `\`${path}\` is not valid. The person can review it from the project's Settings not applied action; do not rewrite it to work around this. Nothing was written.`,
  );
const key = (tab: WorkbenchTab): string =>
  tab.kind === 'view' ? `view:${tab.view}` : tab.kind === 'pane' ? `pane:${tab.pane}` : `file:${tab.path}`;
const empty = (): Node => ({ kind: 'group', tabs: [] });
const toNode = (node: WorkbenchNode): Node =>
  node.kind === 'group'
    ? {
        kind: 'group',
        ...(node.size === undefined ? {} : { size: node.size }),
        tabs: [...node.tabs],
        ...(node.active === undefined ? {} : { active: node.active }),
      }
    : {
        kind: 'split',
        ...(node.size === undefined ? {} : { size: node.size }),
        direction: node.direction,
        children: node.children.map(toNode),
      };
const groups = (node: Node): Group[] => (node.kind === 'group' ? [node] : node.children.flatMap(groups));
const tabs = (node: Node): WorkbenchTab[] => groups(node).flatMap((group) => group.tabs);
const remove = (node: Node, tab: WorkbenchTab): boolean => {
  let removed = false;
  for (const group of groups(node)) {
    const index = group.tabs.findIndex((item) => key(item) === key(tab));
    if (index === -1) {
      continue;
    }
    group.tabs.splice(index, 1);
    if (group.active !== undefined) {
      group.active =
        group.tabs.length === 0
          ? undefined
          : index < group.active
            ? group.active - 1
            : Math.min(group.active, group.tabs.length - 1);
    }
    removed = true;
  }
  return removed;
};
const open = (node: Node, tab: WorkbenchTab): void => {
  const group =
    groups(node).find((item) => item.tabs.some((existing) => key(existing) === key(tab))) ?? groups(node)[0]!;
  const index = group.tabs.findIndex((existing) => key(existing) === key(tab));
  if (index === -1) {
    group.tabs.push(tab);
  } else if (tab.kind === 'file') {
    group.tabs[index] = { ...group.tabs[index], ...tab };
  }
  group.active = index === -1 ? group.tabs.length - 1 : index;
};
const visible = (viewer: Node, workbench: Node, workbenchOpen: boolean): WorkbenchTab[] =>
  (workbenchOpen ? [viewer, workbench] : [viewer]).flatMap((node) =>
    groups(node).flatMap((group) => {
      const tab = group.tabs[group.active ?? group.tabs.length - 1];
      return tab === undefined ? [] : [tab];
    }),
  );
const digest = async (text: string | undefined): Promise<`sha256:${string}` | 'missing'> =>
  text === undefined ? 'missing' : `sha256:${await sha256String(text)}`;
const readOptional = async (fs: RpcFileSystem, path: string): Promise<string | undefined> => {
  if (!(await fs.exists(path))) {
    return undefined;
  }
  const stat = await fs.stat(path);
  if (stat.isDirectory || stat.size > 64 * 1024) {
    throw Object.assign(new Error('invalid record size'), { code: 'INVALID_RECORD', recordPath: path });
  }
  try {
    return await fs.readFile(path);
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'INVALID_TEXT_ENCODING') {
      throw Object.assign(new Error('invalid UTF-8 record'), { code: 'INVALID_RECORD', recordPath: path });
    }
    throw error;
  }
};
const decode = <T>(
  text: string | undefined,
  codec: {
    read(
      bytes: Uint8Array<ArrayBuffer>,
    ):
      | { status: 'current'; record: T }
      | { status: 'invalid-preserved'; code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string };
  },
): T | undefined | 'invalid' | 'newer' => {
  if (text === undefined) {
    return undefined;
  }
  const result = codec.read(encoder.encode(text));
  return result.status === 'current' ? result.record : result.code === 'NEWER_RECORD' ? 'newer' : 'invalid';
};
const newer = (name: string): Failure =>
  failure('INVALID_RECORD', `The ${name} record was written by a newer Tau. Update Tau to use it.`);
const namedViewIds = (input: ArrangeWorkbenchInput): Set<string> =>
  new Set([
    ...(input.views ?? []).map((view) => view.id),
    ...(input.open ?? []).filter((tab) => tab.kind === 'view').map((tab) => tab.view),
    ...(input.close ?? []).filter((tab) => tab.kind === 'view').map((tab) => tab.view),
  ]);
const fileState = async (fileSystem: RpcFileSystem, path: string): Promise<'missing' | 'directory' | 'file'> => {
  if (!(await fileSystem.exists(path))) {
    return 'missing';
  }
  const stat = await fileSystem.stat(path);
  return stat.isDirectory ? 'directory' : 'file';
};
const fileRefusal = ({
  path,
  state,
  field,
  model = false,
}: {
  path: string;
  state: 'missing' | 'directory';
  field: string;
  model?: boolean;
}): Failure =>
  state === 'missing'
    ? failure('FILE_NOT_FOUND', `\`${path}\` does not exist.`)
    : failure(
        'VALIDATION_ERROR',
        `${field}: \`${path}\` is a directory; choose ${model ? 'an existing model file accepted by the current runtime' : 'an existing file'}. Nothing was written.`,
      );
const nonModel = (path: string, field: string): Failure =>
  failure(
    'VALIDATION_ERROR',
    `${field}: \`${path}\` is not a model file accepted by the current runtime. Choose a model file. Nothing was written.`,
  );

/** Merge one checked workbench arrangement at the live project root. @public */
export async function handleArrangeWorkbench(
  input: ArrangeWorkbenchInput,
  fileSystem: RpcFileSystem,
  workbench?: RpcWorkbenchClient,
): Promise<Result> {
  try {
    const attempts = input.basedOn === undefined ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const layoutText = await readOptional(fileSystem, workbenchPaths.layout);
      const layoutDigest = await digest(layoutText);
      if (input.basedOn !== undefined && layoutDigest !== input.basedOn) {
        return failure(
          'RECORD_CONFLICT',
          `The workbench arrangement changed since the digest you passed as basedOn (now ${layoutDigest}). Read this turn's workbench snapshot or .tau/workbench/layout.json and arrange again from it.`,
        );
      }
      // Only an entries patch depends on the entries record; an unrelated arrangement must not refuse over it.
      const entriesText =
        input.entries === undefined ? undefined : await readOptional(fileSystem, workbenchPaths.entries);
      const parsedLayout = decode(layoutText, workbenchRecords.layout);
      const parsedEntries = decode(entriesText, workbenchRecords.entries);
      if (parsedLayout === 'newer') {
        return newer('layout');
      }
      if (parsedEntries === 'newer') {
        return newer('entries');
      }
      if (
        parsedLayout === 'invalid' &&
        (input.viewer === undefined ||
          input.workbench === undefined ||
          input.lanes?.chat === undefined ||
          input.lanes.workbench === undefined)
      ) {
        return invalid(workbenchPaths.layout);
      }
      if (parsedEntries === 'invalid') {
        return invalid(workbenchPaths.entries);
      }
      const prior = parsedLayout === 'invalid' ? undefined : parsedLayout;
      const viewer = toNode(input.viewer ?? prior?.viewer ?? empty());
      const workbenchLane = toNode(input.workbench ?? prior?.workbench ?? empty());
      const lanes = {
        chat: input.lanes?.chat ?? prior?.lanes.chat ?? true,
        workbench: input.lanes?.workbench ?? prior?.lanes.workbench ?? true,
      };
      const previousViewer = prior ? toNode(prior.viewer) : empty();
      const viewIds = namedViewIds(input);
      if (input.viewer !== undefined) {
        for (const tab of [...tabs(previousViewer), ...tabs(viewer)]) {
          if (tab.kind === 'view') {
            viewIds.add(tab.view);
          }
        }
      }
      const viewTexts = new Map<string, string | undefined>();
      const viewRecords = new Map<string, WorkbenchView | undefined>();
      for (const id of viewIds) {
        const path = workbenchPaths.view(id);
        const text = await readOptional(fileSystem, path);
        const record = decode(text, workbenchRecords.view);
        if (record === 'newer') {
          return newer('view');
        }
        if (record === 'invalid') {
          return invalid(path);
        }
        viewTexts.set(id, text);
        viewRecords.set(id, record);
      }
      const inputViews = new Set<string>();
      const viewWrites = new Map<string, string>();
      for (const [index, patch] of (input.views ?? []).entries()) {
        if (inputViews.has(patch.id)) {
          return failure('VALIDATION_ERROR', `views[${index}].id: duplicate view id ${patch.id}. Nothing was written.`);
        }
        inputViews.add(patch.id);
        const base = viewRecords.get(patch.id);
        if (base === undefined && patch.entryPath === undefined) {
          return failure(
            'VALIDATION_ERROR',
            `views[${index}].entryPath: a new view needs a model file. Nothing was written.`,
          );
        }
        const entryPath = patch.entryPath ?? base?.entryPath;
        if (patch.entryPath !== undefined) {
          const entryState = await fileState(fileSystem, patch.entryPath);
          if (entryState !== 'file') {
            return fileRefusal({
              path: patch.entryPath,
              state: entryState,
              field: `views[${index}].entryPath`,
              model: true,
            });
          }
          if (!(await workbench?.isModelFile(patch.entryPath))) {
            return nonModel(patch.entryPath, `views[${index}].entryPath`);
          }
        }
        const measurements = patch.measurements?.map((measurement) => ({
          ...measurement,
          frameId: 'tau:root',
          distance: Math.hypot(...measurement.endPoint.map((value, axis) => value - measurement.startPoint[axis]!)),
        }));
        const { id: _id, ...fields } = patch;
        const candidate = {
          ...base,
          ...fields,
          version: 1,
          entryPath,
          ...(patch.display === undefined ? {} : { display: { ...base?.display, ...patch.display } }),
          ...(measurements === undefined ? {} : { measurements }),
        };
        const parsed = workbenchViewSchema.safeParse(candidate);
        if (!parsed.success) {
          return failure('VALIDATION_ERROR', `views[${index}]: ${z.prettifyError(parsed.error)} Nothing was written.`);
        }
        viewRecords.set(patch.id, parsed.data);
        viewWrites.set(patch.id, workbenchRecords.view.serialize(parsed.data));
        if (
          !tabs(viewer).some((tab) => tab.kind === 'view' && tab.view === patch.id) &&
          !input.close?.some((tab) => tab.kind === 'view' && tab.view === patch.id)
        ) {
          open(viewer, { kind: 'view', view: patch.id });
        }
      }
      for (const tab of input.close ?? []) {
        remove(tab.kind === 'view' ? viewer : workbenchLane, tab);
      }
      if (input.workbench !== undefined && input.lanes?.workbench === false && tabs(workbenchLane).length > 0) {
        return failure(
          'VALIDATION_ERROR',
          'lanes.workbench: cannot hide a lane this call opens into. Nothing was written.',
        );
      }
      for (const [index, tab] of (input.open ?? []).entries()) {
        if (tab.kind === 'view' && viewRecords.get(tab.view) === undefined) {
          return failure(
            'VALIDATION_ERROR',
            `open[${index}].view: view ${tab.view} does not exist. Nothing was written.`,
          );
        }
        if (tab.kind === 'file') {
          const state = await fileState(fileSystem, tab.path);
          if (state !== 'file') {
            return fileRefusal({ path: tab.path, state, field: `open[${index}].path` });
          }
        }
        if (tab.kind !== 'view' && input.lanes?.workbench === false) {
          return failure(
            'VALIDATION_ERROR',
            'lanes.workbench: cannot hide a lane this call opens into. Nothing was written.',
          );
        }
        open(tab.kind === 'view' ? viewer : workbenchLane, tab);
        if (tab.kind !== 'view') {
          lanes.workbench = true;
        }
      }
      for (const tab of tabs(workbenchLane)) {
        if (tab.kind === 'file') {
          const state = await fileState(fileSystem, tab.path);
          if (state !== 'file') {
            return fileRefusal({ path: tab.path, state, field: 'workbench' });
          }
        }
      }
      const priorViewIds = new Set(
        tabs(previousViewer)
          .filter((tab) => tab.kind === 'view')
          .map((tab) => tab.view),
      );
      const currentViewIds = new Set(
        tabs(viewer)
          .filter((tab) => tab.kind === 'view')
          .map((tab) => tab.view),
      );
      for (const id of currentViewIds) {
        if (viewIds.has(id) && viewRecords.get(id) === undefined) {
          return failure('VALIDATION_ERROR', `viewer: view ${id} does not exist. Nothing was written.`);
        }
      }
      const layout = workbenchLayoutSchema.safeParse({ version: 1, lanes, viewer, workbench: workbenchLane });
      if (!layout.success) {
        return failure('VALIDATION_ERROR', `${z.prettifyError(layout.error)} Nothing was written.`);
      }
      const entries: WorkbenchEntries = parsedEntries ?? { version: 1, entries: {} };
      let entriesWrite: string | undefined;
      if (input.entries !== undefined) {
        const next: Record<string, unknown> = { ...entries.entries };
        for (const [index, patch] of input.entries.entries()) {
          const state = await fileState(fileSystem, patch.path);
          if (state !== 'file') {
            return fileRefusal({ path: patch.path, state, field: `entries[${index}].path` });
          }
          const previous = entries.entries[patch.path];
          const { path: _path, ...settings } = patch;
          next[patch.path] = {
            ...previous,
            ...settings,
            ...(patch.components === undefined ? {} : { components: { ...previous?.components, ...patch.components } }),
          };
          if (input.entries.findIndex((item) => item.path === patch.path) !== index) {
            return failure(
              'VALIDATION_ERROR',
              `entries[${index}].path: duplicate entry path ${patch.path}. Nothing was written.`,
            );
          }
        }
        const parsed = workbenchEntriesSchema.safeParse({ version: 1, entries: next });
        if (!parsed.success) {
          return failure('VALIDATION_ERROR', `${z.prettifyError(parsed.error)} Nothing was written.`);
        }
        entriesWrite = workbenchRecords.entries.serialize(parsed.data);
      }
      const writes: Write[] = [];
      for (const [id, text] of viewWrites) {
        if (currentViewIds.has(id)) {
          writes.push({ path: workbenchPaths.view(id), text, previous: viewTexts.get(id) });
        }
      }
      for (const tab of input.close ?? []) {
        if (tab.kind === 'view') {
          priorViewIds.add(tab.view);
        }
      }
      for (const id of priorViewIds) {
        if (!currentViewIds.has(id) && viewTexts.get(id) !== undefined) {
          writes.push({ path: workbenchPaths.view(id), previous: viewTexts.get(id) });
        }
      }
      if (entriesWrite !== undefined) {
        writes.push({ path: workbenchPaths.entries, text: entriesWrite, previous: entriesText });
      }
      writes.push({
        path: workbenchPaths.layout,
        text: workbenchRecords.layout.serialize(layout.data),
        previous: layoutText,
      });
      const revisions: Array<ArrangeWorkbenchOutput['revisions'][number]> = [];
      let conflict = false;
      for (const write of writes) {
        const preconditions = [{ path: write.path, expected: write.previous ?? null }];
        const result =
          write.text === undefined
            ? await fileSystem.deleteFileChecked({ path: write.path, preconditions })
            : await fileSystem.writeFileChecked({ path: write.path, data: write.text, preconditions });
        if (result.status === 'conflict') {
          conflict = true;
          break;
        }
        revisions.push({
          path: write.path,
          digest: await digest(write.text),
          previousDigest: await digest(write.previous),
        });
      }
      if (!conflict) {
        return {
          success: true,
          status: 'written',
          revisions,
          visible: visible(viewer, workbenchLane, lanes.workbench),
        };
      }
      if (input.basedOn !== undefined) {
        const currentDigest = await digest(await readOptional(fileSystem, workbenchPaths.layout));
        return failure(
          'RECORD_CONFLICT',
          `The workbench arrangement changed since the digest you passed as basedOn (now ${currentDigest}). Read this turn's workbench snapshot or .tau/workbench/layout.json and arrange again from it.`,
        );
      }
    }
    return failure(
      'RECORD_CONFLICT',
      'The workbench records kept changing while they were written (three attempts). Read .tau/workbench/layout.json and arrange again.',
    );
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'INVALID_RECORD' &&
      'recordPath' in error &&
      typeof error.recordPath === 'string'
    ) {
      return invalid(error.recordPath);
    }
    return toRpcError(error);
  }
}
// oxlint-enable eslint/no-await-in-loop
