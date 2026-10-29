import type { WorkbenchLaneTab } from '@taucad/workbench';

type PaneId = Extract<WorkbenchLaneTab, { kind: 'pane' }>['pane'];

const titles = {
  browser: 'Browser',
  parameters: 'Parameters',
  model: 'Model tree',
  print: 'Print',
  kinematics: 'Kinematics',
  revisions: 'Revisions',
  agents: 'Agents',
  jobs: 'Jobs',
  export: 'Export',
  share: 'Share',
  details: 'Details',
  kernel: 'Telemetry',
  console: 'Console',
  terminal: 'Terminal',
} as const satisfies Record<PaneId, string>;

/** Display title for a built-in workbench pane; record IDs remain lowercase. */
export const paneTitle = (pane: PaneId): string => titles[pane];
