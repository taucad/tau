/**
 * An in-memory project for print intent tests: the slice of `useFileManager` the print intent
 * reads, watches and writes (the working copy's `exists`, `readFile` and `writeFileChecked`, the
 * content service's per-path watch, and the root they are relative to) over one map of files.
 *
 * @module
 */

import { MachineSettingsOwner } from '@taucad/runtime/host';
import { machineSettingsPath } from '@taucad/runtime/machine/settings';
import { bambuSettingsConfiguration } from '@taucad/bambu/settings';
import { slicingPreferences } from '@taucad/slicer/preferences';
import { MachineSettingsStore } from '#components/print/machine-settings-store.js';
import { Topic } from '@taucad/events';
import type { CheckedFileWrite, CheckedFileWriteResult, FileStatEntry, FileWritePrecondition } from '@taucad/types';

type CheckedWrite = Omit<CheckedFileWrite, 'signal'>;

/** The fake project and the knobs its tests turn. */
export type ProjectFiles = Readonly<{
  root: string;
  /** What `useFileManager` hands the print intent. */
  fileManager: Readonly<{
    machineSettings: MachineSettingsStore;
    fileManagerRef: Readonly<{
      getSnapshot: () => Readonly<{ context: Readonly<{ rootDirectory: string }> }>;
      subscribe: () => Readonly<{ unsubscribe: () => void }>;
    }>;
    contentService: Readonly<{ subscribe: (path: string, listener: () => void) => () => void }>;
    /** The project's file index: a case-insensitive path search, and a notice on every change. */
    treeService: Readonly<{
      searchFiles: (query: string) => Promise<FileStatEntry[]>;
      subscribeTree: (listener: () => void) => () => void;
    }>;
    parameterFiles: Readonly<{
      exists: (path: string) => Promise<boolean>;
      readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
      writeFileChecked: (write: CheckedWrite) => Promise<CheckedFileWriteResult>;
    }>;
  }>;
  /** Every checked write the project received, in order. */
  writes: readonly CheckedWrite[];
  /** A project-relative file's text, or `undefined` when it does not exist. */
  read: (path: string) => string | undefined;
  /** Write or delete a project-relative file as another writer does (an agent, git, a hand edit); watchers hear it. */
  write: (path: string, content: string | Uint8Array<ArrayBuffer> | undefined) => void;
  /** Make each of the next checked writes lose a race: another writer puts the text there first. */
  race: (...texts: string[]) => void;
  clear: () => void;
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const holds = (actual: Uint8Array<ArrayBuffer> | undefined, expected: FileWritePrecondition['expected']): boolean => {
  if (expected === null) {
    return actual === undefined;
  }
  const bytes = typeof expected === 'string' ? encoder.encode(expected) : expected;
  return actual !== undefined && decoder.decode(actual) === decoder.decode(bytes);
};

/**
 * Create an in-memory project rooted at `root`.
 *
 * @param root - The absolute project root the working-copy paths start with.
 * @returns The `useFileManager` slice, and the reads, writes and races the tests drive.
 */
export const createProjectFiles = (root = '/projects/project-1'): ProjectFiles => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  /* Each change carries its project-relative path; a watch hears only its own. */
  const changes = new Topic<string>({ name: 'projectFiles.changes' });
  const writes: CheckedWrite[] = [];
  const races: string[] = [];
  const relative = (path: string): string => (path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path);
  const notify = (path: string): void => {
    changes.emit(path);
  };
  const write = (path: string, content: string | Uint8Array<ArrayBuffer> | undefined): void => {
    if (content === undefined) {
      files.delete(path);
    } else {
      files.set(path, typeof content === 'string' ? encoder.encode(content) : content);
    }
    notify(path);
  };

  const fileManager: Omit<ProjectFiles['fileManager'], 'machineSettings'> = {
    fileManagerRef: {
      getSnapshot: () => ({ context: { rootDirectory: root } }),
      subscribe: () => ({
        unsubscribe: () => undefined,
      }),
    },
    contentService: {
      subscribe: (path, listener) =>
        changes.subscribe({ handler: listener, interestedIn: (changed) => changed === path }),
    },
    treeService: {
      searchFiles: async (query) =>
        [...files].flatMap(([path, bytes]): FileStatEntry[] =>
          path.toLowerCase().includes(query.toLowerCase())
            ? [
                {
                  path,
                  name: path.split('/').at(-1) ?? path,
                  type: 'file',
                  size: bytes.byteLength,
                  mtimeMs: 0,
                  contentKind: 'text',
                  lineCount: decoder.decode(bytes).split('\n').length,
                },
              ]
            : [],
        ),
      subscribeTree: (listener) => changes.subscribe({ handler: listener }),
    },
    parameterFiles: {
      exists: async (path) => files.has(relative(path)),
      readFile: async (path) => {
        const bytes = files.get(relative(path));
        if (bytes === undefined) {
          throw new Error(`ENOENT: no such file, ${path}`);
        }
        return bytes;
      },
      writeFileChecked: async (checked) => {
        writes.push(checked);
        const path = relative(checked.path);
        const race = races.shift();
        if (race !== undefined) {
          write(path, race);
        }
        const actual = files.get(path);
        if (!checked.preconditions.every((precondition) => holds(actual, precondition.expected))) {
          return { status: 'conflict', conflicts: [{ path, actual: actual ?? null }] };
        }
        const content = typeof checked.data === 'string' ? encoder.encode(checked.data) : checked.data;
        files.set(path, content);
        // The captured authority suppresses its own origin; the checked receipt supplies the bytes.
        return { status: 'applied', content };
      },
    },
  };
  const createSettings = (): { owner: MachineSettingsOwner; settings: MachineSettingsStore } => {
    const owner = new MachineSettingsOwner({
      definitions: [slicingPreferences, bambuSettingsConfiguration],
      filesystem: {
        readFileStream: (path) =>
          new ReadableStream({
            start(controller) {
              const value = files.get(relative(path));
              if (value) {
                controller.enqueue(value);
                controller.close();
              } else {
                controller.error(
                  Object.assign(new Error('Missing settings'), {
                    code: 'ENOENT',
                  }),
                );
              }
            },
          }),
        writeFileChecked: fileManager.parameterFiles.writeFileChecked,
        watch: (request, handler) =>
          changes.subscribe({
            interestedIn: (path) => request.paths.includes(path),
            handler: () => {
              handler({ type: 'change', path: '' });
            },
          }),
      },
    });
    const captured = owner;
    const settings = new MachineSettingsStore(
      Promise.resolve({
        readMachineSettings: async (typeId) => captured.read({ typeId }),
        editMachineSettings: async (input) => captured.edit(input),
        machineSettingsSettlement: async (id) => captured.settlement(id),
      }),
      (typeId, listener) => fileManager.contentService.subscribe(machineSettingsPath({ typeId }), listener),
      () => undefined,
    );
    return { owner, settings };
  };
  let state = createSettings();
  const resetSettings = (): void => {
    state.settings.dispose();
    state.owner.dispose();
    state = createSettings();
  };
  return {
    root,
    fileManager: {
      ...fileManager,
      get machineSettings() {
        return state.settings;
      },
    },
    writes,
    read: (path) => {
      const bytes = files.get(path);
      return bytes === undefined ? undefined : decoder.decode(bytes);
    },
    write,
    race: (...texts) => {
      races.push(...texts);
    },
    clear: () => {
      files.clear();
      writes.length = 0;
      races.length = 0;
      resetSettings();
    },
  };
};

/** The current project shared by the Print pane fixture and print intent tests. */
let current = createProjectFiles();
export const projectFiles: ProjectFiles = {
  root: current.root,
  get fileManager() {
    return current.fileManager;
  },
  get writes() {
    return current.writes;
  },
  read: (path) => current.read(path),
  write: (path, content) => {
    current.write(path, content);
  },
  race: (...texts) => {
    current.race(...texts);
  },
  clear: () => {
    current.clear();
    current = createProjectFiles();
  },
};
