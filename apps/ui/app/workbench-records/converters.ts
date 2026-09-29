import type { SerializedDockview } from 'dockview-react';
import { Orientation } from 'dockview-react';
import type { WorkbenchLaneNode, WorkbenchLaneTab, WorkbenchNode, ViewerNode, ViewerTab } from '@taucad/workbench';
import { paneIds, workbenchIdSchema, workbenchLaneNodeSchema, viewerNodeSchema } from '@taucad/workbench';
import { generatePrefixedId, randomUuid } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';

type Lane = 'viewer' | 'workbench';
type LaneNode<L extends Lane> = L extends 'viewer' ? ViewerNode : WorkbenchLaneNode;
type GridNode = SerializedDockview['grid']['root'];
type Dimensions = Readonly<{ width: number; height: number }>;
type FileDeviceState = Readonly<{ paneId: string; filesWidth?: number }>;
type BuildPosition = Readonly<{ orientation: Orientation; size: number; bounds: Dimensions; path: string }>;

/** The editor machine owns file pane ids; widths remain in this device's editor row. */
export type DockviewProjectionOptions = Readonly<{
  dimensions: Dimensions;
  files?: Readonly<Record<string, FileDeviceState>>;
}>;

/** The view record id is portable; the Dockview panel id remains an implementation detail. */
export const mintViewRecordId = (): string => `v-${randomUuid().replaceAll('-', '').slice(0, 8)}`;

const directionOf = (orientation: Orientation): 'row' | 'column' =>
  orientation === Orientation.HORIZONTAL ? 'row' : 'column';
const orientationOf = (direction: 'row' | 'column'): Orientation =>
  direction === 'row' ? Orientation.HORIZONTAL : Orientation.VERTICAL;
const flipped = (orientation: Orientation): Orientation =>
  orientation === Orientation.HORIZONTAL ? Orientation.VERTICAL : Orientation.HORIZONTAL;
const dimensionOf = (direction: 'row' | 'column', dimensions: Dimensions): number =>
  direction === 'row' ? dimensions.width : dimensions.height;

function normalize<Tab>(node: WorkbenchNode<Tab>): WorkbenchNode<Tab> {
  if (node.kind === 'group') {
    return node;
  }
  const children = node.children.flatMap((child): Array<WorkbenchNode<Tab>> => {
    const normalized = normalize(child);
    if (normalized.kind !== 'split' || normalized.direction !== node.direction) {
      return [normalized];
    }
    return normalized.children.map((grandchild) => ({
      ...grandchild,
      size:
        ((normalized.size ?? 1) * (grandchild.size ?? 1)) /
        normalized.children.reduce((sum, sibling) => sum + (sibling.size ?? 1), 0),
    }));
  });
  return { ...node, children };
}

/** Convert one validated lane tree to Dockview's pixel grid for this container. */
export function toDockview<L extends Lane>(
  lane: L,
  node: LaneNode<L>,
  options: DockviewProjectionOptions,
): SerializedDockview {
  const { dimensions } = options;
  if (!(dimensions.width > 0 && dimensions.height > 0)) {
    throw new Error('Dockview dimensions must be positive.');
  }
  const parsed: WorkbenchNode = lane === 'viewer' ? viewerNodeSchema.parse(node) : workbenchLaneNodeSchema.parse(node);
  const tree = normalize(parsed);
  const panels: SerializedDockview['panels'] = {};
  let firstGroup: string | undefined;

  function build(current: WorkbenchNode, { orientation, size, bounds, path }: BuildPosition): GridNode {
    if (current.kind === 'split') {
      if (orientationOf(current.direction) !== orientation) {
        // A root leaf has no orientation; every branch below a split alternates.
        throw new Error('Dockview split orientation must alternate.');
      }
      const total = current.children.reduce((sum, child) => sum + (child.size ?? 1), 0);
      const children = current.children.map((child, index) => {
        const childSize = (dimensionOf(current.direction, bounds) * (child.size ?? 1)) / total;
        const childBounds =
          current.direction === 'row'
            ? { width: childSize, height: bounds.height }
            : { width: bounds.width, height: childSize };
        return build(child, {
          orientation: flipped(orientation),
          size: childSize,
          bounds: childBounds,
          path: `${path}-${index}`,
        });
      });
      return { type: 'branch', data: children, size };
    }
    const groupId = `workbench-group-${path}`;
    firstGroup ??= groupId;
    const views: string[] = [];
    for (const tab of current.tabs) {
      let id: string;
      if (tab.kind === 'view') {
        id = tab.view;
        panels[id] = { id, contentComponent: 'viewer', title: tab.view, params: { viewId: tab.view } };
      } else if (tab.kind === 'pane') {
        id = `workbench:${tab.pane}`;
        panels[id] = { id, contentComponent: tab.pane, title: tab.pane };
      } else {
        const device = options.files?.[tab.path];
        if (!device) {
          throw new Error(`Missing editor pane id for ${tab.path}`);
        }
        id = device.paneId;
        panels[id] = {
          id,
          contentComponent: 'editor',
          tabComponent: 'editor',
          title: tab.path.split('/').at(-1),
          params: {
            filePath: tab.path,
            paneId: id,
            ...(tab.presentation ? { viewId: tab.presentation } : {}),
            ...(tab.filesOpen === undefined ? {} : { filesOpen: tab.filesOpen }),
            ...(device.filesWidth === undefined ? {} : { filesWidth: device.filesWidth }),
          },
        };
      }
      if (views.includes(id)) {
        throw new Error(`Duplicate Dockview panel id: ${id}`);
      }
      views.push(id);
    }
    if (views.length === 0) {
      const id = generatePrefixedId(idPrefix.pane);
      panels[id] = {
        id,
        contentComponent: 'newTab',
        title: lane === 'viewer' ? 'Viewer' : 'New tab',
        params: { mode: 'launcher' },
      };
      views.push(id);
    }
    const group = { id: groupId, views, activeView: views[current.active ?? views.length - 1] };
    return { type: 'leaf', data: group, size };
  }

  const orientation = tree.kind === 'split' ? orientationOf(tree.direction) : Orientation.HORIZONTAL;
  const rootSize = dimensionOf(orientation === Orientation.HORIZONTAL ? 'column' : 'row', dimensions);
  const built = build(tree, {
    orientation,
    size: tree.kind === 'group' ? dimensionOf(directionOf(orientation), dimensions) : rootSize,
    bounds: dimensions,
    path: 'root',
  });
  const root: GridNode = built.type === 'branch' ? built : { type: 'branch', data: [built], size: rootSize };
  return { grid: { root, orientation, ...dimensions }, panels, activeGroup: firstGroup };
}

/** Read the portable lane tree from a Dockview snapshot, refusing unsupported group modes. */
export function fromDockview<L extends Lane>(
  lane: L,
  layout: SerializedDockview,
  legacyViewIds: Map<string, string> = new Map<string, string>(),
): LaneNode<L> {
  if ((layout.floatingGroups?.length ?? 0) > 0 || (layout.popoutGroups?.length ?? 0) > 0 || layout.edgeGroups) {
    throw new Error('Floating, popout and edge groups cannot be represented in a workbench record.');
  }
  const used = new Set<string>();
  function read(current: GridNode, orientation: Orientation): WorkbenchNode {
    if (current.type === 'branch') {
      if (!Array.isArray(current.data)) {
        throw new TypeError('Invalid Dockview branch.');
      }
      if (current.data.length === 1) {
        const only = current.data[0];
        if (!only) {
          throw new Error('Missing Dockview group.');
        }
        return read(only, flipped(orientation));
      }
      return {
        kind: 'split',
        direction: directionOf(orientation),
        size: current.size,
        children: current.data.map((child) => read(child, flipped(orientation))),
      };
    }
    if (Array.isArray(current.data)) {
      throw new TypeError('Invalid Dockview leaf.');
    }
    const group = current.data;
    const tabs: Array<ViewerTab | WorkbenchLaneTab> = [];
    let active: number | undefined;
    for (const id of group.views) {
      const panel = layout.panels[id];
      if (!panel) {
        throw new Error(`Missing Dockview panel: ${id}`);
      }
      if (used.has(id)) {
        throw new Error(`Duplicate Dockview panel: ${id}`);
      }
      used.add(id);
      const { params } = panel;
      const { contentComponent: component } = panel;
      if (component === 'newTab' || (lane === 'workbench' && id === 'workbench:files')) {
        continue;
      }
      if (lane === 'viewer' && component === 'viewer') {
        const view: unknown = params?.['viewId'];
        if (typeof view !== 'string') {
          throw new TypeError(`Missing view id: ${id}`);
        }
        let recordId = view;
        if (!workbenchIdSchema.safeParse(view).success) {
          recordId = legacyViewIds.get(id) ?? mintViewRecordId();
          legacyViewIds.set(id, recordId);
        }
        tabs.push({ kind: 'view', view: recordId });
      } else if (lane === 'workbench' && component === 'editor') {
        const path: unknown = params?.['filePath'];
        if (typeof path !== 'string') {
          throw new TypeError(`Missing file path: ${id}`);
        }
        const presentation: unknown = params?.['viewId'];
        const filesOpen: unknown = params?.['filesOpen'];
        tabs.push({
          kind: 'file',
          path,
          ...(presentation === 'preview' || presentation === 'source' ? { presentation } : {}),
          ...(typeof filesOpen === 'boolean' ? { filesOpen } : {}),
        });
      } else if (lane === 'workbench') {
        const pane =
          component === 'machines' || id === 'workbench:machines'
            ? 'print'
            : id.startsWith('workbench:')
              ? id.slice('workbench:'.length)
              : component;
        if (!paneIds.some((candidate) => candidate === pane)) {
          throw new Error(`Unsupported workbench panel: ${id}`);
        }
        tabs.push({ kind: 'pane', pane: pane as (typeof paneIds)[number] });
      } else {
        throw new Error(`Unsupported viewer panel: ${id}`);
      }
      if (id === group.activeView) {
        active = tabs.length - 1;
      }
    }
    const last = tabs.length - 1;
    return { kind: 'group', size: current.size, tabs, ...(active !== undefined && active !== last ? { active } : {}) };
  }
  const tree = normalize(read(layout.grid.root, layout.grid.orientation));
  // Strip the root's pixel size and turn sibling pixels into proportional weights.
  function weights<Tab>(node: WorkbenchNode<Tab>, root = false): WorkbenchNode<Tab> {
    if (node.kind === 'group') {
      return { ...node, size: root ? undefined : node.size };
    }
    const children = node.children.map((child) => weights(child));
    const total = children.reduce((sum, child) => sum + (child.size ?? 1), 0);
    return {
      ...node,
      size: root ? undefined : node.size,
      children: children.map((child) => ({ ...child, size: (child.size ?? 1) / total })),
    };
  }
  const portable = weights(tree, true);
  return (
    lane === 'viewer' ? viewerNodeSchema.parse(portable) : workbenchLaneNodeSchema.parse(portable)
  ) as LaneNode<L>;
}
