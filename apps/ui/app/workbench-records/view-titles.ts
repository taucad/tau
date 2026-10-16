import type { WorkbenchView } from '@taucad/workbench';

/*
 * Kept apart from `projection.ts`, whose camera maths imports three.js. The home
 * composer reaches these titles through the chat snapshot, and sharing a module
 * with the camera maths preloaded three.js on every home page load.
 */

/** Camera name shown when a hand-written view did not supply one. */
export const viewName = (record: WorkbenchView): string =>
  record.name ??
  (record.camera.kind === 'preset'
    ? `${record.camera.preset[0]?.toUpperCase()}${record.camera.preset.slice(1)}`
    : 'Look');

/** Tab title of a view: its entry file name, or its camera name when it has no entry. */
export const viewTabTitle = (record: WorkbenchView): string =>
  record.entryPath === null ? viewName(record) : (record.entryPath.split('/').at(-1) ?? record.entryPath);
