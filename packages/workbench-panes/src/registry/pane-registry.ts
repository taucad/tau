import { Box, Download, Rotate3d, Share2, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The workbench panes this package draws, in menu order.
 *
 * @public
 */
export const workbenchPaneIds = ['parameters', 'model', 'kinematics', 'export', 'share'] as const;

/**
 * One of {@link workbenchPaneIds}.
 *
 * @public
 */
export type WorkbenchPaneId = (typeof workbenchPaneIds)[number];

/**
 * A key combination a pane opens with; the shape `useKeybinding` from `@taucad/ui/components/keyboard` takes.
 *
 * @public
 */
export type WorkbenchPaneShortcut = Readonly<{ key: string; ctrlKey: true }>;

/**
 * How a pane is listed in a workbench's pane menu.
 *
 * @public
 */
export type WorkbenchPaneDefinition = Readonly<{
  id: WorkbenchPaneId;
  title: string;
  icon: LucideIcon;
  /** The menu group: what the design is, or what to do with the project. */
  group: 'design' | 'project';
  shortcut?: WorkbenchPaneShortcut;
}>;

/**
 * The shared panes' titles, icons, groups and shortcuts. The Tau app's workbench menu and the agent plugin viewer's
 * pane lane both read them, so the two list the same panes the same way.
 *
 * @public
 */
export const workbenchPanes: Readonly<Record<WorkbenchPaneId, WorkbenchPaneDefinition>> = {
  parameters: {
    id: 'parameters',
    title: 'Parameters',
    icon: SlidersHorizontal,
    group: 'design',
    shortcut: { key: 'x', ctrlKey: true },
  },
  model: { id: 'model', title: 'Model', icon: Box, group: 'design', shortcut: { key: 'a', ctrlKey: true } },
  kinematics: {
    id: 'kinematics',
    title: 'Kinematics',
    icon: Rotate3d,
    group: 'design',
    shortcut: { key: 'm', ctrlKey: true },
  },
  export: { id: 'export', title: 'Export', icon: Download, group: 'project', shortcut: { key: 'd', ctrlKey: true } },
  share: { id: 'share', title: 'Share', icon: Share2, group: 'project' },
};
