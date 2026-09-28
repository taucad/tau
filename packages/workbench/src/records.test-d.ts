// Mistakes the workbench-package option makes unrepresentable.
import { workbenchRecords } from '@taucad/workbench';
import type { ViewerTab, WorkbenchTab, WorkbenchView } from '@taucad/workbench';

declare const bytes: Uint8Array<ArrayBuffer>;
const read = workbenchRecords.layout.read(bytes);

// @ts-expect-error narrow `status` first: invalid bytes carry no record.
void read.record;

export const pixels = workbenchRecords.layout.serialize({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [] },
  workbench: { kind: 'group', tabs: [] },
  // @ts-expect-error lane widths are CSS pixels: device record only (charter I4).
  chatWidth: 320,
});

// @ts-expect-error a tab is a view, a pane or a file; never a Dockview component name.
export const dockviewTab: WorkbenchTab = { kind: 'panel', component: 'parameters' };

// @ts-expect-error `settings` is no pane this cut can show: the twelve pane ids are an enum (blueprint B4).
export const unknownPane: WorkbenchTab = { kind: 'pane', pane: 'settings' };

// @ts-expect-error the viewer lane holds views only; a pane tab belongs in the workbench lane (V2 §2).
export const paneInViewer: ViewerTab = { kind: 'pane', pane: 'parameters' };

// @ts-expect-error `iso` is not a preset; the vocabulary is the screenshot tool's (`isometric`).
export const iso: WorkbenchView['camera'] = { kind: 'preset', preset: 'iso' };

// @ts-expect-error a look direction is three numbers in `tau:root` (from the model toward the camera; any length).
export const flatLook: WorkbenchView['camera'] = { kind: 'look', direction: [0, -1] };

// @ts-expect-error the file's entry field is `entryPath` (library-api §5), not `entry`.
export const entry = workbenchRecords.view.serialize({ version: 1, entry: 'main.ts' });

// @ts-expect-error graphicsBackend is this computer's capability: device record, never the project view.
export const backend = workbenchRecords.view.serialize({ version: 1, entryPath: 'main.ts', graphicsBackend: 'webgpu' });

// @ts-expect-error component display is per entry in entries.json (shared by every view), not a view field.
export const componentsOnView = workbenchRecords.view.serialize({
  version: 1,
  entryPath: 'main.ts',
  components: { hidden: ['lid'] },
});

// @ts-expect-error a view's tab label is `name`, never a `title`: one word across the record, the tool and the snapshot.
export const title = workbenchRecords.view.serialize({ version: 1, entryPath: 'main.ts', title: 'Front' });
