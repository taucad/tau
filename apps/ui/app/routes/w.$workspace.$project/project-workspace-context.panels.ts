/**
 * The Workbench surfaces a pane intent can name, and the phone surface each opens as. Kept apart from the workspace
 * provider so the project runtime's layout bridge, which sets the phone's tab for an intent (A8b), reads it without
 * React.
 *
 * @module
 */
import type { MobilePanelId } from '@taucad/ui-core/constants/editor.constants';

export type WorkbenchPanelId =
  | 'browser'
  | 'parameters'
  | 'kinematics'
  | 'files'
  | 'model'
  | 'print'
  | 'revisions'
  | 'agents'
  | 'jobs'
  | 'export'
  | 'share'
  | 'details'
  | 'kernel'
  | 'console'
  | 'terminal';
export type WorkbenchUtilityPanelId = Exclude<WorkbenchPanelId, 'files'>;

/**
 * The phone surface each Workbench surface opens as. Total over `WorkbenchPanelId`, so a pane added to the desktop
 * registry does not compile until it has a phone surface, and `openPanel` never no-ops on a phone (I1). A surface the
 * desktop gates (Print behind Machines, Telemetry and Console behind debug mode) still opens: its body shows the same
 * refusal the desktop pane does.
 */
export const mobilePanelByWorkbenchPanel = {
  browser: 'browser',
  parameters: 'parameters',
  kinematics: 'kinematics',
  files: 'files',
  model: 'model-tree',
  print: 'print',
  revisions: 'revisions',
  agents: 'agents',
  jobs: 'jobs',
  export: 'converter',
  share: 'share',
  details: 'details',
  kernel: 'kernel',
  console: 'console',
  terminal: 'terminal',
} as const satisfies Record<WorkbenchPanelId, MobilePanelId>;
