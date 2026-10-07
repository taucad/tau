// Two layers:
// - Provider-safe parts (tabs, camera, display, view fields, entry settings): no `const`, no `$ref`, no key-constrained
//   records, so the control tool's input schema composes them unchanged (one grammar for files and tool, charter I2).
// - File envelopes (`version`, the recursive lane trees): file-only. A recursive tree needs `$ref`, which no provider
//   accepts in a tool schema; the tool takes a two-level subset instead (control-tool guide).
import { z } from 'zod';
import type { CameraView } from '@taucad/camera';
import { sectionSchema, vectorSchema } from '#section.schema.js';

/**
 * Id of a view or a named layout: a lowercase slug, so it is a safe, case-unique file name (L3 C13). An agent chooses
 * its own ids (`front`, `joint`); the page mints `v-<8 lowercase alphanumerics>` for a view a person opens and keeps
 * the id in the Dockview panel params, so Dockview panel ids stay device facts (V2 gap 8).
 */
/** @public */
export const workbenchIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Use a lowercase slug such as "front" or "review-iso".');

/**
 * The panes a record may name in this cut: the twelve `workbench:<id>` singletons that exist today
 * (`WorkbenchPanelId` minus `files`, which is a sidecar expressed as `filesOpen` on a file tab; V2 §3).
 * `kernel` and `console` render as a placeholder when debug mode is off. Widens to a namespaced slug
 * (`fea.checks`) when the pane registry lands (charter D11); that change is additive (blueprint B4).
 */
/** @public */
export const paneIds = [
  'parameters',
  'model',
  'print',
  'kinematics',
  'revisions',
  'agents',
  'jobs',
  'export',
  'share',
  'details',
  'kernel',
  'console',
] as const;
/** @public */
export const paneIdSchema = z.enum(paneIds);

/** Project-relative path with Tau's canonical filesystem ingress spelling. @public */
/** @public */
export const projectPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(path) &&
      ![...path].some((character) => {
        const code = character.codePointAt(0)!;
        return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
      }) &&
      path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'),
    'Use a canonical project-relative path.',
  );

// ---------------------------------------------------------------------------------------------------------------
// Tabs and the lane trees (layout.json)
// ---------------------------------------------------------------------------------------------------------------

/** @public */
export const viewTabSchema = z.strictObject({ kind: z.enum(['view']), view: workbenchIdSchema });
/** @public */
export const paneTabSchema = z.strictObject({ kind: z.enum(['pane']), pane: paneIdSchema });
/** @public */
export const fileTabSchema = z.strictObject({
  kind: z.enum(['file']),
  path: projectPathSchema,
  /** Markdown's preview or source presentation (today's `EditorPanelParameters.viewId`); other viewers ignore it. */
  presentation: z.enum(['preview', 'source']).optional(),
  /** Whether the tab's file sidebar is open. Its width is pixels, so it stays a device value. */
  filesOpen: z.boolean().optional(),
});

/** Any tab: what the tool's `open` and `close` take. The tab's kind decides its lane (V2 §2). */
/** @public */
export const workbenchTabSchema = z.discriminatedUnion('kind', [viewTabSchema, paneTabSchema, fileTabSchema]);
/** The viewer lane shows views only. */
/** @public */
export const viewerTabSchema = viewTabSchema;
/** The workbench lane shows panes and files; it has no viewer component. */
/** @public */
export const workbenchLaneTabSchema = z.discriminatedUnion('kind', [paneTabSchema, fileTabSchema]);

/** @public */
export type WorkbenchTab = z.output<typeof workbenchTabSchema>;
/** @public */
export type ViewerTab = z.output<typeof viewerTabSchema>;
/** @public */
export type WorkbenchLaneTab = z.output<typeof workbenchLaneTabSchema>;

/**
 * One tab group. `tabs` may be empty: an empty group is the projection of a launcher tab (V2 §3). A view exists while
 * a tab names it: opening a view tab creates its file when missing, and closing the last tab deletes the file, as
 * `removeViewSettings` does today (chat-viewer-dockview.tsx:532; review R7).
 */
/** @public */
export type WorkbenchGroup<Tab = WorkbenchTab> = Readonly<{
  kind: 'group';
  /** Relative weight among its siblings; siblings are normalised, so `1, 1` and `0.5, 0.5` are equal. Default 1. */
  size?: number | undefined;
  tabs: readonly Tab[];
  /** Index of the tab the group shows; defaults to the last tab. */
  active?: number | undefined;
}>;
/** @public */
export type WorkbenchSplit<Tab = WorkbenchTab> = Readonly<{
  kind: 'split';
  size?: number | undefined;
  direction: 'row' | 'column';
  children: ReadonlyArray<WorkbenchNode<Tab>>;
}>;
/** A lane's arrangement: a group, or a split of nodes (recursive; file-only). */
/** @public */
export type WorkbenchNode<Tab = WorkbenchTab> = WorkbenchGroup<Tab> | WorkbenchSplit<Tab>;

const createGroupSchema = <Tab>(tab: z.ZodType<Tab, Tab>) =>
  z
    .strictObject({
      kind: z.enum(['group']),
      size: z.number().positive().optional(),
      tabs: z.array(tab).max(32),
      active: z.number().int().nonnegative().optional(),
    })
    .superRefine((group, context) => {
      if (group.active !== undefined && group.active >= group.tabs.length) {
        context.addIssue({
          code: 'custom',
          path: ['active'],
          message: 'Active tab index must name a tab in this group.',
        });
      }
    });

/** @public */
export const groupSchemaOf: typeof createGroupSchema = createGroupSchema;

/**
 * The recursive lane tree for one tab kind. The converter normalises a stored tree to Dockview's alternating
 * orientation: a `row` directly inside a `row` is flattened into its parent (V2 gap 5).
 */
const nodeSchemaOf = <Tab>(tab: z.ZodType<Tab, Tab>): z.ZodType<WorkbenchNode<Tab>, WorkbenchNode<Tab>> => {
  const node: z.ZodType<WorkbenchNode<Tab>, WorkbenchNode<Tab>> = z.lazy(() =>
    z.discriminatedUnion('kind', [
      groupSchemaOf(tab),
      z.strictObject({
        kind: z.enum(['split']),
        size: z.number().positive().optional(),
        direction: z.enum(['row', 'column']),
        children: z.array(node).min(2).max(8),
      }),
    ]),
  );
  return node;
};

/** @public */
export const viewerNodeSchema = nodeSchemaOf(viewerTabSchema);
/** @public */
export const workbenchLaneNodeSchema = nodeSchemaOf(workbenchLaneTabSchema);
/** Any-kind tree, for converters that handle both lanes. */
/** @public */
export const workbenchNodeSchema = nodeSchemaOf(workbenchTabSchema);

/** @public */
export type ViewerNode = WorkbenchNode<ViewerTab>;
/** @public */
export type WorkbenchLaneNode = WorkbenchNode<WorkbenchLaneTab>;

const tabKey = (tab: WorkbenchTab): string =>
  tab.kind === 'view' ? `view ${tab.view}` : tab.kind === 'pane' ? `pane ${tab.pane}` : `file ${tab.path}`;
const tabsOf = (node: WorkbenchNode): readonly WorkbenchTab[] =>
  node.kind === 'group' ? node.tabs : node.children.flatMap(tabsOf);

/**
 * One tab per view id, pane id or file path in a lane: the owners keep singletons (`editor.machine.ts:772`,
 * `chat-workbench-dockview.tsx:812-829`), so a duplicate would collapse on adoption (V2 gap 6).
 */
const uniqueTabs = (lane: string, node: WorkbenchNode, context: z.RefinementCtx): void => {
  const seen = new Set<string>();
  for (const tab of tabsOf(node)) {
    const key = tabKey(tab);
    if (seen.has(key)) {
      context.addIssue({
        code: 'custom',
        path: [lane],
        message: `${lane} names ${key} twice; a lane shows each view, pane or file once.`,
      });
    }
    seen.add(key);
  }
};

/** Which side lanes are open. The viewer lane is always present. Intent, not visibility: under 1120 px only one auxiliary lane shows (V2 §1). */
/** @public */
export const workbenchLanesSchema = z.strictObject({ chat: z.boolean(), workbench: z.boolean() });

/** `.tau/workbench/layout.json`: lanes and both lane trees. No pixels, no Dockview ids, no focus. */
/** @public */
export const workbenchLayoutSchema = z
  .strictObject({
    version: z.literal(1),
    lanes: workbenchLanesSchema,
    viewer: viewerNodeSchema,
    workbench: workbenchLaneNodeSchema,
  })
  .superRefine((layout, context) => {
    uniqueTabs('viewer', layout.viewer, context);
    uniqueTabs('workbench', layout.workbench, context);
  });

// ---------------------------------------------------------------------------------------------------------------
// One viewer view (views/<id>.json)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Named viewpoints: the screenshot tool's output names (`screenshotViewSchema`) and the capture recipes
 * (`canonicalCaptureViews`), so captures and panels share one vocabulary. The viewer has no preset event: the page
 * runs the recipe as camera `setView` then `frame` (V1 gap 4).
 */
/** @public */
export const cameraPresets = ['isometric', 'front', 'back', 'right', 'left', 'top', 'bottom'] as const;

/**
 * A preset and a look are instructions: the page frames the model from that side and then stores the pose it owns.
 * A look takes a direction from the model toward the camera, any length (`resolveCameraState` normalises it;
 * `[0, -1, 0]` is the front preset, "View From −Y") and an optional up, both in `tau:root`; `up` defaults to the
 * view's `upDirection`, and when the direction is parallel to it the page uses +Y as the top and bottom presets do.
 * A zero vector is refused. A pose is the canonical camera subset (metres, in `frameId`, normally `tau:root`);
 * only the page writes one.
 */
/** @public */
export const viewCameraSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.enum(['preset']), preset: z.enum(cameraPresets) }),
  z.strictObject({
    kind: z.enum(['look']),
    direction: vectorSchema.refine((value) => value.some((axis) => axis !== 0), 'Look direction must not be zero.'),
    up: vectorSchema.optional(),
  }),
  z.strictObject({
    kind: z.enum(['pose']),
    frameId: z.string().min(1).max(128),
    target: vectorSchema,
    direction: vectorSchema,
    up: vectorSchema,
    verticalSpan: z.number().positive(),
    perspectiveZoom: z.number().positive(),
  }),
]);

/** Display toggles, named as the graphics owner names them without the `enable` prefix. */
/** @public */
export const viewDisplaySchema = z.strictObject({
  surfaces: z.boolean().default(true),
  lines: z.boolean().default(true),
  gizmo: z.boolean().default(true),
  grid: z.boolean().default(true),
  axes: z.boolean().default(true),
  matcap: z.boolean().default(false),
  postProcessing: z.boolean().default(false),
});

/** The grid's display unit (`setGridUnit`, `constants/length-units.ts`). Session-only today; persisted from this cut (blueprint B2). */
/** @public */
export const lengthUnits = ['mm', 'cm', 'm', 'in', 'ft', 'yd'] as const;
/** @public */
export const viewGridSchema = z.strictObject({ unit: z.enum(lengthUnits).default('mm') });

/**
 * A pinned measurement, as the owner stores it (`PinnedMeasurement`, editor.constants.ts:59-66). Ids are free strings
 * (existing ids are nanoids); `name` has no UI sender yet but is stored. The tool's patch omits `distance` (the page
 * computes it from the two points) and defaults `frameId` to `tau:root` (review R9).
 */
/** @public */
export const pinnedMeasurementSchema = z.strictObject({
  id: z.string().min(1).max(64),
  frameId: z.string().min(1).max(128),
  /** Metres in `frameId`. */
  startPoint: vectorSchema,
  endPoint: vectorSchema,
  /** Metres; derived from the points. */
  distance: z.number().nonnegative(),
  name: z.string().max(200).optional(),
});

/** The fields of a view, provider-safe. Every field but `entryPath` has a default, so a hand-written view can be short. */
/** @public */
export const viewFieldsSchema = z.strictObject({
  /** The entry file this view renders; `null` shows the file picker (page-only: the tool requires a path). */
  entryPath: projectPathSchema.nullable(),
  /**
   * The label on the view's tab beside the file name ("Front · bracket.ts"), so several views of one file read apart
   * (today every viewer tab shows the file name, chat-viewer-dockview.tsx:108). Absent: the page shows the preset
   * name, or "Look" (review R6).
   */
  name: z.string().min(1).max(40).optional(),
  camera: viewCameraSchema.default({ kind: 'preset', preset: 'isometric' }),
  /** Vertical field of view. Degrees; 0 is orthographic. The viewer's slider spans 0–90 (V1 Table 2). */
  fieldOfView: z.number().min(0).max(90).default(60),
  upDirection: z.enum(['x', 'y', 'z']).default('z'),
  display: viewDisplaySchema.default({
    surfaces: true,
    lines: true,
    gizmo: true,
    grid: true,
    axes: true,
    matcap: false,
    postProcessing: false,
  }),
  grid: viewGridSchema.default({ unit: 'mm' }),
  section: sectionSchema.default({ active: false, cuts: [] }),
  measurements: z.array(pinnedMeasurementSchema).max(64).default([]),
});

/** One authored kernel projection's durable choices. Evaluation-local instance ids never enter this record. */
const kernelViewStateSchema = z.strictObject({
  id: z.string().min(1).max(128),
  options: z.record(z.string().min(1).max(128), z.json()).optional(),
  authoredInstance: z.string().min(1).max(256).optional(),
  camera: viewCameraSchema.optional(),
});

/**
 * `.tau/workbench/views/<id>.json`. Excluded on purpose: `graphicsBackend` (device capability), grid size lock
 * (zoom-derived pixels), measure mode (interaction), selection, focus and hover (transient), the kinematics pose
 * (not persisted today; first addition after this cut, blueprint BQ8) and every code-only tunable (V1 Table 8).
 */
/** @public */
export const workbenchViewSchema = viewFieldsSchema.extend({
  version: z.literal(1),
  /** Absent follows the build's first offered view; a saved id is never silently retargeted. */
  selectedKernelView: z.string().min(1).max(128).optional(),
  /** Options, authored instance and camera are independent for each kernel view id. */
  kernelViews: z
    .array(kernelViewStateSchema)
    .max(32)
    .refine(
      (views) => new Set(views.map((view) => view.id)).size === views.length,
      'Each kernel view id may appear only once.',
    )
    .optional(),
});

// ---------------------------------------------------------------------------------------------------------------
// Per-entry settings (entries.json), named layouts (layouts/<name>.json), the device record (Home)
// ---------------------------------------------------------------------------------------------------------------

const componentIdSchema = z.string().min(1).max(256);

/**
 * Component display for one entry's model tree: the owner's `hiddenComponentIds`, `isolatedComponentIds` and
 * `opacityByComponentId`, project-scoped per unit `file:<entryPath>` and shared by every view of that entry
 * (`model-interaction.machine.ts`; V1 Table 5). The UI isolates one component at a time; the owner accepts a list.
 * Units without a file (`geometry:<hash>`, `anonymous-model`) have no path and are not addressable here.
 */
/** @public */
export const componentDisplaySchema = z.strictObject({
  hidden: z.array(componentIdSchema).max(1024).default([]),
  isolated: z.array(componentIdSchema).max(1024).default([]),
  /** Opacity per component id, 0 to 1; `1` removes the entry. A list, not a record: zod emits `propertyNames` for records, which providers refuse. */
  opacity: z
    .array(z.strictObject({ id: componentIdSchema, opacity: z.number().min(0).max(1) }))
    .max(1024)
    .default([]),
});

/** @public */
export const entrySettingsSchema = z.strictObject({
  /** Rendering timeout in milliseconds; `0` disables it. */
  renderTimeout: z.number().int().min(0).max(600_000).optional(),
  components: componentDisplaySchema.optional(),
});

/** `.tau/workbench/entries.json`, keyed by entry path. */
/** @public */
export const workbenchEntriesSchema = z.strictObject({
  version: z.literal(1),
  entries: z.record(projectPathSchema, entrySettingsSchema),
});

/** `.tau/workbench/layouts/<name>.json`: a saved arrangement, the same fields the control tool takes. Grammar only in this cut (charter Q4). */
/** @public */
export const namedLayoutSchema = z.strictObject({
  version: z.literal(1),
  lanes: workbenchLanesSchema.optional(),
  viewer: viewerNodeSchema.optional(),
  workbench: workbenchLaneNodeSchema.optional(),
  views: z
    .array(viewFieldsSchema.extend({ id: workbenchIdSchema }))
    .max(16)
    .default([]),
});

/**
 * Home `/.tau/workbench/<projectId>.json`: everything that is pixels, focus or this computer's (charter I4). Never
 * agent-visible. Not written in the narrowed cut, where these values stay in the IndexedDB `editor` row
 * (blueprint BQ1); the shape is kept so the charter's full program needs no second grammar.
 */
/** @public */
export const workbenchDeviceSchema = z.strictObject({
  version: z.literal(1),
  focusedChatId: z.string().max(128).optional(),
  /** CSS pixels. */
  laneWidths: z.strictObject({ chat: z.number().positive(), workbench: z.number().positive() }),
  compactAuxiliary: z.enum(['chat', 'workbench']),
  mobileTab: z.string().max(64),
  /** Paneview sections per pane and entry: expansion and height in CSS pixels. */
  sections: z.partialRecord(
    paneIdSchema,
    z.record(projectPathSchema, z.strictObject({ expanded: z.boolean(), size: z.number() })),
  ),
  /** File sidebar width per file tab path. CSS pixels. */
  fileSidebars: z.record(projectPathSchema, z.number().positive()),
  graphicsBackend: z.enum(['webgl', 'webgpu']),
  /** Device-scope pane configuration values, keyed by pane id (panes guide; deferred with charter D12). */
  panes: z.partialRecord(paneIdSchema, z.unknown()),
  /** The arrangement before the last foreign change the page adopted: "Restore previous arrangement" (charter D7). */
  previousLayout: z.unknown().optional(),
});

/** @public */
export type WorkbenchLayout = z.output<typeof workbenchLayoutSchema>;
/** @public */
export type WorkbenchView = z.output<typeof workbenchViewSchema>;
/** @public */
export type WorkbenchEntries = z.output<typeof workbenchEntriesSchema>;
/** @public */
export type EntrySettings = z.output<typeof entrySettingsSchema>;
/** @public */
export type NamedLayout = z.output<typeof namedLayoutSchema>;
/** @public */
export type WorkbenchDevice = z.output<typeof workbenchDeviceSchema>;
/** @public */
export type ViewCamera = z.output<typeof viewCameraSchema>;

// The pose is the camera package's canonical subset: a rename in @taucad/camera breaks this line.
type PoseFields = Omit<Extract<ViewCamera, { kind: 'pose' }>, 'kind'>;
/** @public */
export const toCameraPose = (pose: PoseFields): Pick<CameraView, keyof PoseFields> => pose;
