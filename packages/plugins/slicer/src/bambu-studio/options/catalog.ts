/**
 * Tau-authored descriptors for the Bambu Studio process and filament options people change most.
 *
 * Keys and choice values are Bambu Studio configuration facts, checked against installed presets and
 * the resolved configuration the Bambu Studio CLI writes into sliced archives. Titles and descriptions
 * are Tau's own words. Keys not listed here are still exposed through inferred descriptors.
 *
 * @module
 */

/** Preset scope that owns an option. @public */
export type BambuOptionScope = 'process' | 'filament';

/**
 * Value shape of an option.
 *
 * `percent` values are written with a trailing `%`; `float-or-percent` values are either a plain
 * number or a string such as `"50%"`; `bool` values are written as `"0"`/`"1"`.
 *
 * @public
 */
export type BambuOptionType = 'float' | 'int' | 'percent' | 'float-or-percent' | 'bool' | 'enum' | 'string';

/** One selectable value of an enumerated option. @public */
export type BambuOptionChoice = Readonly<{ value: string; title: string }>;

/** Settings group, ordered like Bambu Studio's tabs. @public */
export type BambuOptionGroup = Readonly<{ id: string; label: string; scope: BambuOptionScope }>;

/** Describes one Bambu Studio option. @public */
export type BambuOptionDescriptor = Readonly<{
  key: string;
  scope: BambuOptionScope;
  /** Group id from {@link bambuOptionGroups}. */
  group: string;
  type: BambuOptionType;
  title: string;
  description: string;
  /** UCUM unit code of numeric values. */
  unit?: string;
  minimum?: number;
  maximum?: number;
  choices?: readonly BambuOptionChoice[];
  /** Accepts `"nil"`, which Bambu Studio reads as "use the printer's value". */
  nullable?: boolean;
  /** Bambu Studio's own default, used when neither resolved preset carries the key. */
  fallback?: string | readonly string[];
  /** True for descriptors inferred from the preset value rather than authored by Tau. */
  inferred?: boolean;
}>;

/** Group id of inferred process options. @public */
export const processFallbackGroup = 'process-all';
/** Group id of inferred filament options. @public */
export const filamentFallbackGroup = 'filament-all';

/** Groups in display order. Groups without options are omitted from built schemas. @public */
export const bambuOptionGroups: readonly BambuOptionGroup[] = [
  { id: 'quality', label: 'Quality', scope: 'process' },
  { id: 'strength', label: 'Strength', scope: 'process' },
  { id: 'speed', label: 'Speed', scope: 'process' },
  { id: 'support', label: 'Support', scope: 'process' },
  { id: 'multimaterial', label: 'Multimaterial', scope: 'process' },
  { id: 'others', label: 'Others', scope: 'process' },
  { id: processFallbackGroup, label: 'All other settings', scope: 'process' },
  { id: 'temperatures', label: 'Temperatures', scope: 'filament' },
  { id: 'cooling', label: 'Cooling', scope: 'filament' },
  { id: 'flow', label: 'Flow and volumetric speed', scope: 'filament' },
  { id: 'retraction', label: 'Retraction', scope: 'filament' },
  { id: 'filament-other', label: 'Other filament settings', scope: 'filament' },
  { id: filamentFallbackGroup, label: 'All other settings', scope: 'filament' },
];

/**
 * Keys that identify, link or template a preset rather than configure the print. They are never
 * exposed or written. Keys ending in `_gcode` are skipped as well.
 *
 * @public
 */
export const bambuSkippedKeys: ReadonlySet<string> = new Set([
  'name',
  'inherits',
  'include',
  'from',
  'type',
  'version',
  'description',
  'instantiation',
  'setting_id',
  'filament_id',
  'filament_ids',
  'base_id',
  'user_id',
  'updated_time',
  'renamed_from',
  'is_custom_defined',
  'print_settings_id',
  'filament_settings_id',
  'compatible_printers',
  'compatible_printers_condition',
  'compatible_prints',
  'compatible_prints_condition',
  'print_compatible_printers',
  'inherits_group',
  'different_settings_to_system',
  'print_extruder_id',
  'print_extruder_variant',
  'filament_extruder_variant',
  'filament_self_index',
  'post_process',
]);

type Options = Partial<Pick<BambuOptionDescriptor, 'unit' | 'minimum' | 'maximum' | 'nullable' | 'fallback'>>;
type ChoiceOptions = Options & { choices: ReadonlyArray<readonly [value: string, title: string]> };
type Entry = Omit<BambuOptionDescriptor, 'scope' | 'group'>;
type Text = readonly [title: string, description: string];

const option =
  (type: BambuOptionType) =>
  (key: string, [title, description]: Text, options: Options = {}): Entry => ({
    key,
    type,
    title,
    description,
    ...options,
  });

const float = option('float');
const int = option('int');
const percent = (key: string, text: Text, options: Options = {}): Entry =>
  option('percent')(key, text, { unit: '%', minimum: 0, ...options });
const floatOrPercent = option('float-or-percent');
const bool = option('bool');
const text = option('string');
const choice = (key: string, [title, description]: Text, { choices, ...options }: ChoiceOptions): Entry => ({
  key,
  type: 'enum',
  title,
  description,
  choices: choices.map(([value, choiceTitle]) => ({ value, title: choiceTitle })),
  ...options,
});

const mm = { unit: 'mm', minimum: 0 } satisfies Options;
const signedMm = { unit: 'mm' } satisfies Options;
const speed = { unit: 'mm/s', minimum: 0 } satisfies Options;
const acceleration = { unit: 'mm/s2', minimum: 0 } satisfies Options;
const degrees = { unit: 'deg' } satisfies Options;
const count = { minimum: 0 } satisfies Options;
const nozzleCelsius = { unit: 'Cel', minimum: 0, maximum: 400 } satisfies Options;
const bedCelsius = { unit: 'Cel', minimum: 0, maximum: 130 } satisfies Options;
const fan = { unit: '%', minimum: 0, maximum: 100 } satisfies Options;
const seconds = { unit: 's', minimum: 0 } satisfies Options;
const printerValue = { nullable: true } satisfies Options;

const section = (scope: BambuOptionScope, group: string, entries: readonly Entry[]): BambuOptionDescriptor[] =>
  entries.map((entry) => ({ ...entry, scope, group }));

const surfacePatterns = [
  ['concentric', 'Concentric'],
  ['zig-zag', 'Rectilinear'],
  ['monotonic', 'Monotonic'],
  ['monotonicline', 'Monotonic line'],
  ['alignedrectilinear', 'Aligned rectilinear'],
  ['hilbertcurve', 'Hilbert curve'],
  ['archimedeanchords', 'Archimedean chords'],
  ['octagramspiral', 'Octagram spiral'],
] as const;

const lockedPatterns = [
  ['zigzag', 'Zig zag'],
  ['crosszag', 'Cross zag'],
  ['lockedzag', 'Locked zag'],
  ['grid', 'Grid'],
] as const;

const quality = section('process', 'quality', [
  float('layer_height', ['Layer height', 'Thickness of every layer after the first.'], { unit: 'mm', minimum: 0.01 }),
  float('initial_layer_print_height', ['First layer height', 'Thickness of the first layer on the plate.'], {
    unit: 'mm',
    minimum: 0.01,
  }),
  float('line_width', ['Default line width', 'Extrusion width used where no specific width is set.'], mm),
  float('initial_layer_line_width', ['First layer line width', 'Extrusion width on the first layer.'], mm),
  float('outer_wall_line_width', ['Outer wall line width', 'Extrusion width of the visible outer wall.'], mm),
  float('inner_wall_line_width', ['Inner wall line width', 'Extrusion width of the walls inside the outer wall.'], mm),
  float('top_surface_line_width', ['Top surface line width', 'Extrusion width of top solid surfaces.'], mm),
  float('sparse_infill_line_width', ['Sparse infill line width', 'Extrusion width of the sparse infill.'], mm),
  float(
    'internal_solid_infill_line_width',
    ['Internal solid infill line width', 'Extrusion width of solid infill hidden inside the part.'],
    mm,
  ),
  float('support_line_width', ['Support line width', 'Extrusion width of support structures.'], mm),
  choice('seam_position', ['Seam position', 'Where each wall loop starts and ends.'], {
    choices: [
      ['nearest', 'Nearest'],
      ['aligned', 'Aligned'],
      ['back', 'Back'],
      ['random', 'Random'],
    ],
    fallback: 'aligned',
  }),
  bool('seam_placement_away_from_overhangs', [
    'Keep seams off overhangs',
    'Avoid placing seams on overhanging wall sections.',
  ]),
  floatOrPercent(
    'seam_gap',
    ['Seam gap', 'How far short of its start a closed loop ends, in mm or % of nozzle size.'],
    { fallback: '15%' },
  ),
  choice('seam_slope_type', ['Scarf joint seam', 'Blend the seam over a sloped section to hide it.'], {
    choices: [
      ['none', 'None'],
      ['external', 'Contour'],
      ['all', 'Contour and hole'],
    ],
    fallback: 'none',
  }),
  bool('seam_slope_conditional', ['Scarf only on smooth walls', 'Use the scarf seam only where walls are smooth.'], {
    fallback: '1',
  }),
  int('scarf_angle_threshold', ['Scarf angle threshold', 'Corner angle above which the scarf seam is used.'], {
    unit: 'deg',
    minimum: 0,
    maximum: 180,
  }),
  floatOrPercent('seam_slope_start_height', [
    'Scarf start height',
    'Height where the scarf slope begins, in mm or % of layer height.',
  ]),
  bool('seam_slope_entire_loop', ['Scarf around entire loop', 'Slope the whole loop instead of a short section.'], {
    fallback: '0',
  }),
  float('seam_slope_min_length', ['Scarf length', 'Length of the sloped seam section.'], mm),
  int('seam_slope_steps', ['Scarf steps', 'Number of height steps along the scarf.'], { minimum: 1, fallback: '10' }),
  bool('seam_slope_inner_walls', ['Scarf on inner walls', 'Apply the scarf seam to inner walls too.'], {
    fallback: '1',
  }),
  floatOrPercent('wipe_speed', ['Wipe speed', 'Speed of the nozzle wipe, in mm/s or % of travel speed.'], {
    fallback: '80%',
  }),
  bool('role_base_wipe_speed', ['Wipe at feature speed', 'Wipe at the speed of the feature just printed.'], {
    fallback: '1',
  }),
  float('slice_closing_radius', ['Slice gap closing radius', 'Close small cracks in the mesh up to this radius.'], {
    ...mm,
    fallback: '0.049',
  }),
  float('resolution', ['Resolution', 'Simplify outlines by dropping detail below this size.'], mm),
  bool('enable_arc_fitting', ['Arc fitting', 'Replace chains of short moves with arc moves.']),
  float(
    'xy_hole_compensation',
    ['X-Y hole compensation', 'Grow (positive) or shrink holes in the X-Y plane.'],
    signedMm,
  ),
  float(
    'xy_contour_compensation',
    ['X-Y contour compensation', 'Grow (positive) or shrink outer contours in the X-Y plane.'],
    signedMm,
  ),
  float(
    'elefant_foot_compensation',
    ['Elephant foot compensation', 'Shrink the first layer to offset squish on the plate.'],
    mm,
  ),
  bool('precise_outer_wall', ['Precise outer wall', 'Keep the outer wall dimensionally accurate.'], { fallback: '0' }),
  bool('precise_z_height', ['Precise Z height', 'Adjust layers so the top matches the model height.'], {
    fallback: '0',
  }),
  bool('enable_circle_compensation', ['Circle compensation', 'Correct the size of printed circular holes.']),
  float(
    'circle_compensation_manual_offset',
    ['Circle compensation offset', 'Manual size correction for circular holes.'],
    signedMm,
  ),
  choice('ironing_type', ['Ironing type', 'Pass the hot nozzle over top surfaces to smooth them.'], {
    choices: [
      ['no ironing', 'No ironing'],
      ['top', 'Top surfaces'],
      ['topmost', 'Topmost surface'],
      ['solid', 'All solid layers'],
    ],
    fallback: 'no ironing',
  }),
  choice('ironing_pattern', ['Ironing pattern', 'Path pattern used for ironing.'], {
    choices: [
      ['zig-zag', 'Rectilinear'],
      ['concentric', 'Concentric'],
      ['monotonic', 'Monotonic'],
      ['monotonicline', 'Monotonic line'],
    ],
    fallback: 'zig-zag',
  }),
  percent('ironing_flow', ['Ironing flow', 'Material extruded while ironing, relative to a normal line.'], {
    maximum: 100,
  }),
  float('ironing_spacing', ['Ironing line spacing', 'Distance between ironing passes.'], mm),
  float('ironing_inset', ['Ironing inset', 'Distance kept from the surface edges while ironing.'], mm),
  float('ironing_direction', ['Ironing angle', 'Direction of the ironing passes.'], { ...degrees, fallback: '45' }),
  float('ironing_speed', ['Ironing speed', 'Nozzle speed while ironing.'], speed),
  choice(
    'wall_generator',
    ['Wall generator', 'Classic uses fixed widths; Arachne varies width to fill thin features.'],
    {
      choices: [
        ['classic', 'Classic'],
        ['arachne', 'Arachne'],
      ],
      fallback: 'arachne',
    },
  ),
  float('wall_transition_angle', ['Wall transition angle', 'Largest angle at which wall counts may change.'], {
    ...degrees,
    minimum: 0,
    fallback: '10',
  }),
  floatOrPercent(
    'wall_transition_filter_deviation',
    ['Wall transition filter margin', 'Width tolerance before an extra wall is added, in mm or % of nozzle size.'],
    { fallback: '25%' },
  ),
  floatOrPercent(
    'wall_transition_length',
    ['Wall transition length', 'Length over which wall counts change, in mm or % of nozzle size.'],
    { fallback: '100%' },
  ),
  int('wall_distribution_count', ['Wall distribution count', 'Walls that share width variation.'], {
    minimum: 1,
    fallback: '1',
  }),
  floatOrPercent(
    'min_bead_width',
    ['Minimum wall width', 'Narrowest wall Arachne prints, in mm or % of nozzle size.'],
    { fallback: '85%' },
  ),
  floatOrPercent(
    'min_feature_size',
    ['Minimum feature size', 'Thinnest feature Arachne keeps, in mm or % of nozzle size.'],
    { fallback: '25%' },
  ),
  choice('wall_sequence', ['Wall order', 'Order in which inner and outer walls print.'], {
    choices: [
      ['inner wall/outer wall', 'Inner then outer'],
      ['outer wall/inner wall', 'Outer then inner'],
      ['inner-outer-inner wall', 'Inner, outer, inner'],
    ],
    fallback: 'inner wall/outer wall',
  }),
  bool('is_infill_first', ['Print infill first', 'Print infill before the walls of each layer.'], { fallback: '0' }),
  float('bridge_flow', ['Bridge flow ratio', 'Flow multiplier for bridges.'], { minimum: 0, maximum: 2 }),
  bool('thick_bridges', ['Thick bridges', 'Print bridges with round, thicker lines.'], { fallback: '0' }),
  float('top_solid_infill_flow_ratio', ['Top surface flow ratio', 'Flow multiplier for top surfaces.'], {
    minimum: 0,
    maximum: 2,
  }),
  float('print_flow_ratio', ['Object flow ratio', 'Flow multiplier for the whole object.'], {
    minimum: 0,
    maximum: 2,
    fallback: '1',
  }),
  bool('only_one_wall_first_layer', ['Single wall on first layer', 'Print only one wall on the first layer.'], {
    fallback: '0',
  }),
  choice(
    'top_one_wall_type',
    ['Single wall on top surfaces', 'Use one wall on top surfaces to give the top skin more room.'],
    {
      choices: [
        ['not apply', 'Off'],
        ['all top', 'All top surfaces'],
        ['topmost', 'Topmost surface'],
      ],
      fallback: 'all top',
    },
  ),
  floatOrPercent(
    'top_area_threshold',
    ['Top surface area threshold', 'Smallest top area that gets a single wall, in mm or % of line width.'],
    { fallback: '200%' },
  ),
  bool('detect_overhang_wall', ['Detect overhang walls', 'Find overhanging walls to slow and cool them.']),
  bool('smooth_speed_discontinuity_area', ['Smooth speed changes', 'Ease speed changes between overhang zones.'], {
    fallback: '1',
  }),
  float('smooth_coefficient', ['Speed smoothing coefficient', 'Strength of speed smoothing.'], count),
  bool('reduce_crossing_wall', ['Avoid crossing walls', 'Route travel moves around walls where possible.']),
  float(
    'max_travel_detour_distance',
    ['Maximum travel detour', 'Longest detour allowed to avoid crossing walls; 0 means no limit.'],
    mm,
  ),
  bool('avoid_crossing_wall_includes_support', ['Avoid crossing support', 'Also route travel moves around supports.']),
  bool('z_direction_outwall_speed_continuous', [
    'Smooth Z outer wall speed',
    'Keep outer wall speed steady between layers.',
  ]),
]);

const strength = section('process', 'strength', [
  int('wall_loops', ['Wall loops', 'Number of walls around each outline.'], { minimum: 0, maximum: 1000 }),
  bool('detect_thin_wall', ['Detect thin walls', 'Print walls too thin for two lines as a single line.']),
  bool('alternate_extra_wall', ['Alternate extra wall', 'Add an extra wall on every other layer.'], { fallback: '0' }),
  choice('top_surface_pattern', ['Top surface pattern', 'Path pattern of the top skin.'], { choices: surfacePatterns }),
  int('top_shell_layers', ['Top shell layers', 'Solid layers under each top surface.'], count),
  float(
    'top_shell_thickness',
    ['Top shell thickness', 'Minimum top skin thickness; adds layers when the count falls short.'],
    mm,
  ),
  float('top_surface_density', ['Top surface density', 'Line density of the top skin.'], {
    unit: '%',
    minimum: 0,
    maximum: 100,
  }),
  choice('bottom_surface_pattern', ['Bottom surface pattern', 'Path pattern of the bottom skin.'], {
    choices: surfacePatterns,
  }),
  int('bottom_shell_layers', ['Bottom shell layers', 'Solid layers over each bottom surface.'], count),
  float(
    'bottom_shell_thickness',
    ['Bottom shell thickness', 'Minimum bottom skin thickness; adds layers when the count falls short.'],
    mm,
  ),
  float('bottom_surface_density', ['Bottom surface density', 'Line density of the bottom skin.'], {
    unit: '%',
    minimum: 0,
    maximum: 100,
  }),
  choice(
    'internal_solid_infill_pattern',
    ['Internal solid infill pattern', 'Path pattern of solid infill inside the part.'],
    { choices: surfacePatterns, fallback: 'zig-zag' },
  ),
  percent('sparse_infill_density', ['Sparse infill density', 'How much of the interior is filled.'], { maximum: 100 }),
  choice('sparse_infill_pattern', ['Sparse infill pattern', 'Pattern of the interior infill.'], {
    choices: [
      ['concentric', 'Concentric'],
      ['zig-zag', 'Rectilinear'],
      ['grid', 'Grid'],
      ['line', 'Line'],
      ['cubic', 'Cubic'],
      ['triangles', 'Triangles'],
      ['tri-hexagon', 'Tri-hexagon'],
      ['gyroid', 'Gyroid'],
      ['honeycomb', 'Honeycomb'],
      ['adaptivecubic', 'Adaptive cubic'],
      ['alignedrectilinear', 'Aligned rectilinear'],
      ['3dhoneycomb', '3D honeycomb'],
      ['hilbertcurve', 'Hilbert curve'],
      ['archimedeanchords', 'Archimedean chords'],
      ['octagramspiral', 'Octagram spiral'],
      ['supportcubic', 'Support cubic'],
      ['lightning', 'Lightning'],
      ['crosshatch', 'Cross hatch'],
      ['zigzag', 'Zig zag'],
      ['crosszag', 'Cross zag'],
      ['lockedzag', 'Locked zag'],
      ['2dlattice', '2D lattice'],
    ],
  }),
  floatOrPercent(
    'sparse_infill_anchor',
    ['Infill anchor length', 'Length of the wall-hugging anchor on infill lines, in mm or % of line width.'],
    { fallback: '400%' },
  ),
  floatOrPercent(
    'sparse_infill_anchor_max',
    ['Maximum infill anchor length', 'Upper limit for infill anchors, in mm or % of line width.'],
    { fallback: '20' },
  ),
  float('infill_direction', ['Infill direction', 'Base angle of the infill lines.'], degrees),
  float('infill_rotate_step', ['Infill rotation step', 'Angle added to the infill direction on each layer.'], degrees),
  float('infill_shift_step', ['Infill shift step', 'Offset added to the infill position on each layer.'], mm),
  bool('infill_combination', ['Combine infill', 'Print sparse infill every few layers at a greater height.']),
  percent('infill_wall_overlap', ['Infill-wall overlap', 'How far infill reaches into the walls.'], { maximum: 100 }),
  float('minimum_sparse_infill_area', ['Minimum sparse infill area', 'Areas smaller than this are filled solid.'], {
    unit: 'mm2',
    minimum: 0,
  }),
  int('fill_multiline', ['Infill line multiplier', 'Print each infill line this many times side by side.'], {
    minimum: 1,
  }),
  bool('symmetric_infill_y_axis', ['Symmetric infill', 'Mirror the infill across the Y axis.']),
  float('sparse_infill_lattice_angle_1', ['Lattice angle 1', 'First line angle of the 2D lattice infill.'], degrees),
  float('sparse_infill_lattice_angle_2', ['Lattice angle 2', 'Second line angle of the 2D lattice infill.'], degrees),
  choice(
    'locked_skeleton_infill_pattern',
    ['Locked zag skeleton pattern', 'Pattern for the core of locked zag infill.'],
    { choices: lockedPatterns },
  ),
  choice(
    'locked_skin_infill_pattern',
    ['Locked zag skin pattern', 'Pattern for the outer band of locked zag infill.'],
    { choices: lockedPatterns },
  ),
  percent('skeleton_infill_density', ['Skeleton infill density', 'Density of the locked zag core.'], { maximum: 100 }),
  percent('skin_infill_density', ['Skin infill density', 'Density of the locked zag outer band.'], { maximum: 100 }),
  float('skin_infill_depth', ['Skin infill depth', 'Thickness of the locked zag outer band.'], mm),
  float('infill_lock_depth', ['Infill lock depth', 'Overlap between the locked zag core and band.'], mm),
  float('skeleton_infill_line_width', ['Skeleton infill line width', 'Extrusion width of the locked zag core.'], mm),
  float('skin_infill_line_width', ['Skin infill line width', 'Extrusion width of the locked zag outer band.'], mm),
  float('bridge_angle', ['Bridge direction', 'Force a bridge angle; 0 lets the slicer choose.'], {
    ...degrees,
    fallback: '0',
  }),
  float(
    'internal_bridge_support_thickness',
    ['Internal bridge support thickness', 'Thickness of the layer that supports internal bridges.'],
    mm,
  ),
  bool('detect_floating_vertical_shell', [
    'Detect floating vertical shells',
    'Find vertical shell areas with nothing below them.',
  ]),
  choice(
    'ensure_vertical_shell_thickness',
    ['Ensure vertical shell thickness', 'Add solid infill near sloped surfaces to keep shells thick.'],
    {
      choices: [
        ['disabled', 'Off'],
        ['partial', 'Partial'],
        ['enabled', 'All'],
      ],
      fallback: 'enabled',
    },
  ),
  bool(
    'detect_narrow_internal_solid_infill',
    ['Detect narrow solid infill', 'Use concentric paths in narrow solid infill areas.'],
    { fallback: '1' },
  ),
  bool('infill_instead_top_bottom_surfaces', [
    'Infill instead of top and bottom skin',
    'Print sparse infill where top and bottom skins would go.',
  ]),
  float('filter_out_gap_fill', ['Filter out small gaps', 'Skip gap fill shorter than this length.'], {
    ...mm,
    fallback: '0',
  }),
]);

const speedGroup = section('process', 'speed', [
  float('initial_layer_speed', ['First layer speed', 'Speed of walls and solid areas on the first layer.'], speed),
  float('initial_layer_infill_speed', ['First layer infill speed', 'Speed of infill on the first layer.'], speed),
  float('outer_wall_speed', ['Outer wall speed', 'Speed of the outer wall.'], speed),
  float('inner_wall_speed', ['Inner wall speed', 'Speed of inner walls.'], speed),
  floatOrPercent('small_perimeter_speed', [
    'Small perimeter speed',
    'Speed of small loops, in mm/s or % of outer wall speed.',
  ]),
  float('small_perimeter_threshold', ['Small perimeter threshold', 'Loops shorter than this count as small.'], mm),
  float('sparse_infill_speed', ['Sparse infill speed', 'Speed of sparse infill.'], speed),
  float(
    'internal_solid_infill_speed',
    ['Internal solid infill speed', 'Speed of solid infill inside the part.'],
    speed,
  ),
  floatOrPercent('vertical_shell_speed', [
    'Vertical shell speed',
    'Speed of vertical shell infill, in mm/s or % of internal solid infill speed.',
  ]),
  float('top_surface_speed', ['Top surface speed', 'Speed of top surfaces.'], speed),
  float('gap_infill_speed', ['Gap infill speed', 'Speed of gap fill.'], speed),
  float('support_speed', ['Support speed', 'Speed of support structures.'], speed),
  float('support_interface_speed', ['Support interface speed', 'Speed of support interface layers.'], speed),
  float('bridge_speed', ['Bridge speed', 'Speed of bridges.'], speed),
  bool('enable_overhang_speed', ['Slow down for overhangs', 'Reduce speed on overhanging walls.']),
  float('overhang_1_4_speed', ['Overhang speed 10-25%', 'Speed for slight overhangs; 0 keeps the wall speed.'], speed),
  float(
    'overhang_2_4_speed',
    ['Overhang speed 25-50%', 'Speed for moderate overhangs; 0 keeps the wall speed.'],
    speed,
  ),
  float('overhang_3_4_speed', ['Overhang speed 50-75%', 'Speed for steep overhangs; 0 keeps the wall speed.'], speed),
  float(
    'overhang_4_4_speed',
    ['Overhang speed 75-100%', 'Speed for very steep overhangs; 0 keeps the wall speed.'],
    speed,
  ),
  float('overhang_totally_speed', ['Full overhang speed', 'Speed for walls with nothing below them.'], speed),
  float('travel_speed', ['Travel speed', 'Speed of non-printing moves.'], speed),
  float('travel_speed_z', ['Z travel speed', 'Vertical travel speed; 0 uses the printer limit.'], speed),
  bool('enable_height_slowdown', ['Slow down by height', 'Change speed and acceleration with print height.']),
  float('slowdown_start_height', ['Slowdown start height', 'Height where the slowdown begins.'], mm),
  float('slowdown_start_speed', ['Slowdown start speed', 'Speed limit at the start height.'], speed),
  float('slowdown_start_acc', ['Slowdown start acceleration', 'Acceleration limit at the start height.'], acceleration),
  float('slowdown_end_height', ['Slowdown end height', 'Height where the slowdown reaches its end values.'], mm),
  float('slowdown_end_speed', ['Slowdown end speed', 'Speed limit at the end height.'], speed),
  float('slowdown_end_acc', ['Slowdown end acceleration', 'Acceleration limit at the end height.'], acceleration),
  float(
    'default_acceleration',
    ['Normal printing acceleration', 'Acceleration where no specific value is set.'],
    acceleration,
  ),
  float('initial_layer_acceleration', ['First layer acceleration', 'Acceleration on the first layer.'], acceleration),
  float('outer_wall_acceleration', ['Outer wall acceleration', 'Acceleration on the outer wall.'], acceleration),
  float(
    'inner_wall_acceleration',
    ['Inner wall acceleration', 'Acceleration on inner walls; 0 uses the default.'],
    acceleration,
  ),
  float('top_surface_acceleration', ['Top surface acceleration', 'Acceleration on top surfaces.'], acceleration),
  floatOrPercent('sparse_infill_acceleration', [
    'Sparse infill acceleration',
    'Acceleration on sparse infill, in mm/s² or % of the default.',
  ]),
  float(
    'initial_layer_travel_acceleration',
    ['First layer travel acceleration', 'Acceleration of travel moves on the first layer.'],
    acceleration,
  ),
  float('travel_acceleration', ['Travel acceleration', 'Acceleration of travel moves.'], acceleration),
  float(
    'travel_short_distance_acceleration',
    ['Short travel acceleration', 'Acceleration of short travel moves.'],
    acceleration,
  ),
  bool('accel_to_decel_enable', ['Limit deceleration', 'Cap deceleration relative to acceleration.'], {
    fallback: '0',
  }),
  percent('accel_to_decel_factor', ['Deceleration factor', 'Deceleration as a share of acceleration.'], {
    maximum: 100,
    fallback: '50%',
  }),
  float('default_jerk', ['Default jerk', 'Jerk where no specific value is set; 0 uses the printer.'], {
    ...speed,
    fallback: '0',
  }),
  float('outer_wall_jerk', ['Outer wall jerk', 'Jerk on the outer wall.'], { ...speed, fallback: '9' }),
  float('inner_wall_jerk', ['Inner wall jerk', 'Jerk on inner walls.'], { ...speed, fallback: '9' }),
  float('infill_jerk', ['Infill jerk', 'Jerk on infill.'], { ...speed, fallback: '9' }),
  float('top_surface_jerk', ['Top surface jerk', 'Jerk on top surfaces.'], { ...speed, fallback: '9' }),
  float('initial_layer_jerk', ['First layer jerk', 'Jerk on the first layer.'], { ...speed, fallback: '9' }),
  float('travel_jerk', ['Travel jerk', 'Jerk on travel moves.'], { ...speed, fallback: '9' }),
]);

const support = section('process', 'support', [
  bool('enable_support', ['Enable support', 'Generate support under overhangs.']),
  choice('support_type', ['Support type', 'Support shape and whether it is placed automatically.'], {
    choices: [
      ['normal(auto)', 'Normal (auto)'],
      ['tree(auto)', 'Tree (auto)'],
      ['normal(manual)', 'Normal (manual)'],
      ['tree(manual)', 'Tree (manual)'],
    ],
  }),
  choice('support_style', ['Support style', 'Structure style of the chosen support type.'], {
    choices: [
      ['default', 'Default'],
      ['grid', 'Grid'],
      ['snug', 'Snug'],
      ['tree_slim', 'Tree slim'],
      ['tree_strong', 'Tree strong'],
      ['tree_hybrid', 'Tree hybrid'],
      ['tree_organic', 'Tree organic'],
    ],
  }),
  int('support_threshold_angle', ['Overhang threshold', 'Surfaces steeper than this from vertical get support.'], {
    unit: 'deg',
    minimum: 0,
    maximum: 90,
  }),
  bool('support_on_build_plate_only', ['On build plate only', 'Only start support on the plate, never on the model.']),
  bool('support_critical_regions_only', ['Critical regions only', 'Only support sharp tips and cantilevers.'], {
    fallback: '0',
  }),
  bool('support_remove_small_overhang', ['Ignore small overhangs', 'Skip support for small overhangs.'], {
    fallback: '1',
  }),
  int('enforce_support_layers', ['Enforced support layers', 'Always support the lowest layers up to this count.'], {
    ...count,
    fallback: '0',
  }),
  int('raft_layers', ['Raft layers', 'Layers of raft printed under the model.'], count),
  float('raft_contact_distance', ['Raft contact distance', 'Gap between the raft and the model.'], {
    ...mm,
    fallback: '0.1',
  }),
  float('raft_expansion', ['Raft expansion', 'How far the raft extends past the model.'], { ...mm, fallback: '1.5' }),
  percent('raft_first_layer_density', ['Raft first layer density', 'Density of the raft layer on the plate.'], {
    maximum: 100,
    fallback: '90%',
  }),
  int('support_filament', ['Support filament', 'Filament slot for support; 0 uses the current filament.'], count),
  int(
    'support_interface_filament',
    ['Support interface filament', 'Filament slot for support interfaces; 0 uses the current filament.'],
    count,
  ),
  bool(
    'support_interface_not_for_body',
    ['Save interface filament', 'Avoid using the interface filament for the support body.'],
    { fallback: '1' },
  ),
  float('support_top_z_distance', ['Top Z distance', 'Gap between the support top and the model.'], mm),
  float('support_bottom_z_distance', ['Bottom Z distance', 'Gap between the model and support standing on it.'], mm),
  float('support_object_xy_distance', ['Support-object X-Y distance', 'Horizontal gap between support and model.'], mm),
  float(
    'support_object_first_layer_gap',
    ['First layer X-Y distance', 'Horizontal gap between support and model on the first layer.'],
    { ...mm, fallback: '0.2' },
  ),
  choice('support_base_pattern', ['Base pattern', 'Fill pattern of the support body.'], {
    choices: [
      ['default', 'Default'],
      ['rectilinear', 'Rectilinear'],
      ['rectilinear-grid', 'Rectilinear grid'],
      ['honeycomb', 'Honeycomb'],
      ['lightning', 'Lightning'],
      ['hollow', 'Hollow'],
    ],
  }),
  float('support_base_pattern_spacing', ['Base pattern spacing', 'Distance between support body lines.'], mm),
  float('support_angle', ['Pattern angle', 'Rotation of the support body pattern.'], { ...degrees, fallback: '0' }),
  int('support_interface_top_layers', ['Top interface layers', 'Dense layers at the top of the support.'], count),
  int(
    'support_interface_bottom_layers',
    ['Bottom interface layers', 'Dense layers where support rests on the model.'],
    { minimum: -1 },
  ),
  choice('support_interface_pattern', ['Interface pattern', 'Fill pattern of support interface layers.'], {
    choices: [
      ['auto', 'Default'],
      ['rectilinear', 'Rectilinear'],
      ['concentric', 'Concentric'],
      ['rectilinear_interlaced', 'Rectilinear interlaced'],
      ['grid', 'Grid'],
    ],
  }),
  float('support_interface_spacing', ['Top interface spacing', 'Distance between top interface lines.'], mm),
  float('support_bottom_interface_spacing', ['Bottom interface spacing', 'Distance between bottom interface lines.'], {
    ...mm,
    fallback: '0.5',
  }),
  bool('support_interface_loop_pattern', ['Interface loops', 'Cover the support top with loops.']),
  float('support_expansion', ['Normal support expansion', 'Grow normal support horizontally.'], signedMm),
  bool('bridge_no_support', ["Don't support bridges", 'Leave bridges unsupported.']),
  float('max_bridge_length', ['Maximum bridge length', 'Longest bridge left unsupported.'], mm),
  bool(
    'independent_support_layer_height',
    ['Independent support layer height', 'Let support use its own layer height.'],
    { fallback: '1' },
  ),
  float('tree_support_branch_angle', ['Tree branch angle', 'Largest angle of tree branches from vertical.'], {
    unit: 'deg',
    minimum: 0,
    maximum: 60,
  }),
  float('tree_support_branch_distance', ['Tree branch distance', 'Spacing of tree branch contact points.'], {
    ...mm,
    fallback: '5',
  }),
  float('tree_support_branch_diameter', ['Tree branch diameter', 'Diameter of the thinnest tree branches.'], mm),
  float(
    'tree_support_branch_diameter_angle',
    ['Tree branch diameter angle', 'How quickly branches thicken toward the base.'],
    { unit: 'deg', minimum: 0, maximum: 15, fallback: '5' },
  ),
  int('tree_support_wall_count', ['Tree support walls', 'Walls around tree branches; -1 chooses automatically.'], {
    minimum: -1,
  }),
  bool('enable_support_ironing', ['Iron support interface', 'Smooth the support top interface by ironing.']),
  choice('support_ironing_pattern', ['Support ironing pattern', 'Path pattern for support ironing.'], {
    choices: [
      ['zig-zag', 'Rectilinear'],
      ['concentric', 'Concentric'],
      ['monotonic', 'Monotonic'],
    ],
  }),
  percent('support_ironing_flow', ['Support ironing flow', 'Material extruded while ironing support.'], {
    maximum: 100,
  }),
  float('support_ironing_spacing', ['Support ironing spacing', 'Distance between support ironing passes.'], mm),
  float('support_ironing_inset', ['Support ironing inset', 'Edge distance kept while ironing support.'], mm),
  float('support_ironing_speed', ['Support ironing speed', 'Nozzle speed while ironing support.'], speed),
  float('support_ironing_direction', ['Support ironing angle', 'Direction of support ironing passes.'], degrees),
]);

const multimaterial = section('process', 'multimaterial', [
  bool('enable_prime_tower', ['Prime tower', 'Print a tower that purges the nozzle on filament changes.']),
  float('prime_tower_width', ['Prime tower width', 'Width of the prime tower.'], mm),
  float('prime_tower_brim_width', ['Prime tower brim width', 'Brim around the prime tower base.'], mm),
  float('prime_tower_max_speed', ['Prime tower maximum speed', 'Speed limit on the prime tower.'], speed),
  float('prime_tower_lift_speed', ['Prime tower lift speed', 'Z speed when moving onto the tower.'], speed),
  float(
    'prime_tower_lift_height',
    ['Prime tower lift height', 'Z lift before moving onto the tower; -1 is automatic.'],
    { unit: 'mm', minimum: -1 },
  ),
  bool('prime_tower_enable_framework', ['Prime tower framework', 'Keep a thin frame on tower layers without purging.']),
  bool('prime_tower_flat_ironing', ['Iron prime tower', 'Smooth the top of each tower layer.']),
  bool('prime_tower_rib_wall', ['Rib wall', 'Stiffen the prime tower with ribs.'], { fallback: '1' }),
  float('prime_tower_rib_width', ['Rib width', 'Width of the prime tower ribs.'], { ...mm, fallback: '8' }),
  float('prime_tower_extra_rib_length', ['Extra rib length', 'Extend ribs past the tower outline.'], {
    ...mm,
    fallback: '0',
  }),
  bool('prime_tower_fillet_wall', ['Fillet wall', 'Round the corners of the tower walls.'], { fallback: '1' }),
  floatOrPercent(
    'prime_tower_infill_gap',
    ['Prime tower infill gap', 'Spacing of the tower infill, in mm or % of line width.'],
    { fallback: '150%' },
  ),
  bool('prime_tower_skip_points', ['Skip tower points', 'Skip tower points that would collide.'], { fallback: '1' }),
  bool('enable_tower_interface_features', ['Tower interface features', 'Add interface features between filaments.']),
  bool('wipe_tower_no_sparse_layers', ['No sparse tower layers', 'Skip tower layers that need no purge.']),
  choice('prime_volume_mode', ['Prime volume mode', 'How much material each filament change purges.'], {
    choices: [
      ['Default', 'Default'],
      ['Saving', 'Saving'],
      ['Fast', 'Fast'],
    ],
    fallback: 'Default',
  }),
  bool('flush_into_infill', ['Flush into infill', 'Use infill to purge filament changes.'], { fallback: '0' }),
  bool('flush_into_objects', ['Flush into objects', 'Use hidden object material to purge filament changes.'], {
    fallback: '0',
  }),
  bool('flush_into_support', ['Flush into support', 'Use support to purge filament changes.'], { fallback: '1' }),
  int('wall_filament', ['Wall filament', 'Filament slot for walls; 0 uses the object filament.'], count),
  int(
    'sparse_infill_filament',
    ['Sparse infill filament', 'Filament slot for sparse infill; 0 uses the object filament.'],
    count,
  ),
  int(
    'solid_infill_filament',
    ['Solid infill filament', 'Filament slot for solid infill; 0 uses the object filament.'],
    count,
  ),
  int('top_color_penetration_layers', ['Top color layers', 'Layers that carry a painted color below the top.'], count),
  int(
    'bottom_color_penetration_layers',
    ['Bottom color layers', 'Layers that carry a painted color above the bottom.'],
    count,
  ),
  bool('interlocking_beam', ['Interlocking beams', 'Join touching filaments with interlocking beams.'], {
    fallback: '0',
  }),
  float('interlocking_beam_width', ['Interlocking beam width', 'Width of the interlocking beams.'], {
    ...mm,
    fallback: '0.8',
  }),
  float('interlocking_orientation', ['Interlocking direction', 'Rotation of the interlocking beams.'], {
    ...degrees,
    fallback: '22.5',
  }),
  int('interlocking_beam_layer_count', ['Interlocking beam layers', 'Layers per interlocking beam.'], {
    minimum: 1,
    fallback: '2',
  }),
  int('interlocking_depth', ['Interlocking depth', 'Beam cells reaching across the boundary.'], {
    minimum: 1,
    fallback: '2',
  }),
  int(
    'interlocking_boundary_avoidance',
    ['Interlocking boundary avoidance', 'Beam cells kept away from the outer surface.'],
    { ...count, fallback: '2' },
  ),
  bool('ooze_prevention', ['Ooze prevention', 'Lower idle nozzle temperatures to limit oozing.'], { fallback: '0' }),
  int('standby_temperature_delta', ['Standby temperature change', 'Temperature change applied to an idle nozzle.'], {
    unit: 'Cel',
  }),
]);

const others = section('process', 'others', [
  int('skirt_loops', ['Skirt loops', 'Loops printed around the model before it starts; 0 disables the skirt.'], count),
  int('skirt_height', ['Skirt height', 'Layers the skirt rises.'], count),
  float('skirt_distance', ['Skirt distance', 'Gap between the skirt and the model.'], mm),
  bool('skirt_per_object', ['Skirt per object', 'Print a separate skirt around each object.']),
  choice('draft_shield', ['Draft shield', 'Grow the skirt into a wall that shields the model from drafts.'], {
    choices: [
      ['disabled', 'Off'],
      ['limited', 'Limited'],
      ['enabled', 'On'],
    ],
    fallback: 'disabled',
  }),
  choice('brim_type', ['Brim type', 'Where a brim is added to help the first layer stick.'], {
    choices: [
      ['auto_brim', 'Auto'],
      ['brim_ears', 'Mouse ears'],
      ['outer_only', 'Outer only'],
      ['inner_only', 'Inner only'],
      ['outer_and_inner', 'Outer and inner'],
      ['no_brim', 'No brim'],
    ],
    fallback: 'auto_brim',
  }),
  float('brim_width', ['Brim width', 'Distance the brim extends from the model.'], mm),
  float('brim_object_gap', ['Brim-object gap', 'Gap between the brim and the model for easier removal.'], mm),
  choice(
    'print_sequence',
    ['Print sequence', 'Print all objects layer by layer, or finish one object before the next.'],
    {
      choices: [
        ['by layer', 'By layer'],
        ['by object', 'By object'],
      ],
    },
  ),
  bool('spiral_mode', ['Spiral vase', 'Print a single wall that rises continuously, with no top.']),
  bool('spiral_mode_smooth', ['Smooth spiral', 'Smooth the spiral wall between layers.'], { fallback: '0' }),
  floatOrPercent(
    'spiral_mode_max_xy_smoothing',
    ['Spiral X-Y smoothing limit', 'Largest X-Y shift smoothing may apply, in mm or % of nozzle size.'],
    { fallback: '200%' },
  ),
  choice('timelapse_type', ['Timelapse', 'How the camera captures a timelapse.'], {
    choices: [
      ['0', 'Traditional'],
      ['1', 'Smooth'],
    ],
    fallback: '0',
  }),
  choice('fuzzy_skin', ['Fuzzy skin', 'Roughen walls with small random movements.'], {
    choices: [
      ['none', 'None'],
      ['external', 'Outer walls'],
      ['all', 'All walls'],
      ['allwalls', 'All walls, including inner'],
    ],
  }),
  float('fuzzy_skin_thickness', ['Fuzzy skin thickness', 'Size of the random movements.'], mm),
  float('fuzzy_skin_point_distance', ['Fuzzy skin point distance', 'Spacing of the random points.'], mm),
  bool('fuzzy_skin_first_layer', ['Fuzzy skin on first layer', 'Apply fuzzy skin to the first layer too.']),
  choice('fuzzy_skin_mode', ['Fuzzy skin mode', 'Move the path, vary the extrusion, or both.'], {
    choices: [
      ['displacement', 'Displacement'],
      ['extrusion', 'Extrusion'],
      ['combined', 'Combined'],
    ],
  }),
  choice('fuzzy_skin_noise_type', ['Fuzzy skin noise', 'Noise function used for the texture.'], {
    choices: [
      ['classic', 'Classic'],
      ['perlin', 'Perlin'],
      ['billow', 'Billow'],
      ['ridgedmulti', 'Ridged multifractal'],
      ['voronoi', 'Voronoi'],
    ],
  }),
  float('fuzzy_skin_scale', ['Fuzzy skin feature size', 'Size of noise features.'], mm),
  int('fuzzy_skin_octaves', ['Fuzzy skin octaves', 'Detail levels in the noise.'], { minimum: 1 }),
  float('fuzzy_skin_persistence', ['Fuzzy skin persistence', 'How strongly each detail level contributes.'], {
    minimum: 0,
  }),
  choice('reduce_infill_retraction_mode', ['Reduce infill retraction', 'Skip retraction on travel inside infill.'], {
    choices: [
      ['Auto', 'Auto'],
      ['Disabled', 'Off'],
      ['Enabled', 'On'],
    ],
  }),
  bool('exclude_object', ['Object labels', 'Label objects so single objects can be skipped on the printer.'], {
    fallback: '1',
  }),
  choice('slicing_mode', ['Slicing mode', 'How overlapping and open mesh regions are interpreted.'], {
    choices: [
      ['regular', 'Regular'],
      ['even_odd', 'Even-odd'],
      ['close_holes', 'Close holes'],
    ],
    fallback: 'regular',
  }),
  choice('counterbore_hole_bridging', ['Counterbore hole bridging', 'Bridge strategy for counterbored holes.'], {
    choices: [
      ['none', 'None'],
      ['partiallybridge', 'Partially bridged'],
      ['sacrificiallayer', 'Sacrificial layer'],
    ],
    fallback: 'none',
  }),
  bool('enable_wrapping_detection', ['Wrapping detection', 'Watch for filament wrapping around the nozzle.']),
  text('filename_format', ['File name format', 'Template for the output file name.']),
]);

const legacy = section('process', processFallbackGroup, [
  text('wall_infill_order', [
    'Wall and infill order (legacy)',
    'Older combined form of Wall order and Print infill first.',
  ]),
  bool('only_one_wall_top', ['Single top wall (legacy)', 'Older form of Single wall on top surfaces.']),
]);

const temperatures = section('filament', 'temperatures', [
  int('nozzle_temperature', ['Nozzle temperature', 'Nozzle temperature after the first layer.'], nozzleCelsius),
  int(
    'nozzle_temperature_initial_layer',
    ['First layer nozzle temperature', 'Nozzle temperature for the first layer.'],
    nozzleCelsius,
  ),
  int(
    'nozzle_temperature_range_low',
    ['Recommended minimum nozzle temperature', 'Lower end of the filament temperature range.'],
    nozzleCelsius,
  ),
  int(
    'nozzle_temperature_range_high',
    ['Recommended maximum nozzle temperature', 'Upper end of the filament temperature range.'],
    nozzleCelsius,
  ),
  int(
    'cool_plate_temp',
    ['Cool Plate temperature', 'Bed temperature on the Cool Plate; 0 means unsupported.'],
    bedCelsius,
  ),
  int(
    'cool_plate_temp_initial_layer',
    ['Cool Plate first layer', 'Bed temperature on the Cool Plate for the first layer.'],
    bedCelsius,
  ),
  int(
    'eng_plate_temp',
    ['Engineering Plate temperature', 'Bed temperature on the Engineering Plate; 0 means unsupported.'],
    bedCelsius,
  ),
  int(
    'eng_plate_temp_initial_layer',
    ['Engineering Plate first layer', 'Bed temperature on the Engineering Plate for the first layer.'],
    bedCelsius,
  ),
  int(
    'hot_plate_temp',
    ['High Temp Plate temperature', 'Bed temperature on the High Temp Plate; 0 means unsupported.'],
    bedCelsius,
  ),
  int(
    'hot_plate_temp_initial_layer',
    ['High Temp Plate first layer', 'Bed temperature on the High Temp Plate for the first layer.'],
    bedCelsius,
  ),
  int(
    'textured_plate_temp',
    ['Textured PEI Plate temperature', 'Bed temperature on the Textured PEI Plate; 0 means unsupported.'],
    bedCelsius,
  ),
  int(
    'textured_plate_temp_initial_layer',
    ['Textured PEI Plate first layer', 'Bed temperature on the Textured PEI Plate for the first layer.'],
    bedCelsius,
  ),
  int(
    'supertack_plate_temp',
    ['SuperTack Plate temperature', 'Bed temperature on the SuperTack Plate; 0 means unsupported.'],
    bedCelsius,
  ),
  int(
    'supertack_plate_temp_initial_layer',
    ['SuperTack Plate first layer', 'Bed temperature on the SuperTack Plate for the first layer.'],
    bedCelsius,
  ),
  int('chamber_temperatures', ['Chamber temperature', 'Target chamber temperature; 0 leaves it unheated.'], {
    unit: 'Cel',
    minimum: 0,
    maximum: 100,
  }),
  int(
    'temperature_vitrification',
    ['Softening temperature', 'Temperature where the filament starts to soften; guides chamber and door advice.'],
    { unit: 'Cel', minimum: 0 },
  ),
]);

const cooling = section('filament', 'cooling', [
  int('fan_min_speed', ['Minimum fan speed', 'Part fan speed for layers that print slowly enough.'], fan),
  int('fan_max_speed', ['Maximum fan speed', 'Part fan speed for the fastest layers.'], fan),
  float(
    'fan_cooling_layer_time',
    ['Fan ramp layer time', 'Layers faster than this ramp the fan toward its maximum.'],
    seconds,
  ),
  int(
    'close_fan_the_first_x_layers',
    ['No cooling for the first layers', 'Keep the part fan off for this many layers.'],
    count,
  ),
  int(
    'full_fan_speed_layer',
    ['Full fan speed at layer', 'Reach full fan speed by this layer; 0 disables the ramp.'],
    count,
  ),
  bool('slow_down_for_layer_cooling', [
    'Slow printing down for cooling',
    'Slow short layers so each has time to cool.',
  ]),
  float('slow_down_layer_time', ['Minimum layer time', 'Layers are slowed to take at least this long.'], seconds),
  float('slow_down_min_speed', ['Minimum print speed', 'Cooling slowdowns never go below this speed.'], speed),
  bool('no_slow_down_for_cooling_on_outwalls', [
    'Keep outer wall speed',
    'Do not slow outer walls when cooling a layer.',
  ]),
  int('overhang_fan_speed', ['Overhang fan speed', 'Part fan speed for overhangs and bridges.'], fan),
  choice(
    'overhang_fan_threshold',
    ['Overhang fan threshold', 'Overhang size at which the overhang fan speed applies.'],
    {
      choices: [
        ['0%', 'Always'],
        ['10%', '10%'],
        ['25%', '25%'],
        ['50%', '50%'],
        ['75%', '75%'],
        ['95%', '95%'],
      ],
    },
  ),
  bool(
    'enable_overhang_bridge_fan',
    ['Overhang and bridge fan', 'Use the overhang fan speed on overhangs and bridges.'],
    { fallback: ['1'] },
  ),
  int('additional_cooling_fan_speed', ['Auxiliary fan speed', 'Speed of the side cooling fan.'], fan),
  int(
    'close_additional_fan_first_x_layers',
    ['Auxiliary fan off for first layers', 'Keep the side fan off for this many layers.'],
    count,
  ),
  bool('reduce_fan_stop_start_freq', ['Keep fan running', 'Avoid switching the part fan off and on between layers.']),
  bool('activate_air_filtration', ['Air filtration', 'Run the exhaust fan for filtration during the print.']),
  int('during_print_exhaust_fan_speed', ['Exhaust fan during print', 'Exhaust fan speed while printing.'], fan),
  int('complete_print_exhaust_fan_speed', ['Exhaust fan after print', 'Exhaust fan speed once the print ends.'], fan),
  float('pre_start_fan_time', ['Fan pre-start time', 'Start the fan this long before it is needed.'], seconds),
]);

const flow = section('filament', 'flow', [
  float('filament_flow_ratio', ['Flow ratio', 'Scale extrusion to match this filament.'], { minimum: 0, maximum: 2 }),
  float(
    'filament_max_volumetric_speed',
    ['Maximum volumetric speed', 'Upper limit on melted plastic per second; caps print speed.'],
    { unit: 'mm3/s', minimum: 0 },
  ),
  bool('filament_adaptive_volumetric_speed', [
    'Adaptive volumetric speed',
    'Adjust the volumetric limit to the line being printed.',
  ]),
  bool('enable_pressure_advance', ['Pressure advance', 'Use a fixed pressure advance value.'], { fallback: ['0'] }),
  float('pressure_advance', ['Pressure advance value', 'Pressure advance factor for this filament.'], {
    minimum: 0,
    maximum: 2,
    fallback: ['0.02'],
  }),
  float('filament_diameter', ['Filament diameter', 'Nominal filament diameter.'], mm),
  float('filament_density', ['Density', 'Used for weight and cost estimates.'], { unit: 'g/cm3', minimum: 0 }),
  percent('filament_shrink', ['Shrinkage', 'Size after cooling as a share of printed size; scales the model.']),
]);

const retraction = section('filament', 'retraction', [
  float(
    'filament_retraction_length',
    ['Retraction length', 'Filament pulled back before travel; empty uses the printer value.'],
    { ...mm, ...printerValue },
  ),
  float('filament_retraction_speed', ['Retraction speed', 'Speed of retraction; empty uses the printer value.'], {
    ...speed,
    ...printerValue,
  }),
  float(
    'filament_deretraction_speed',
    ['Deretraction speed', 'Speed of pushing filament back; empty uses the printer value.'],
    { ...speed, ...printerValue },
  ),
  float(
    'filament_retract_restart_extra',
    ['Extra length on restart', 'Extra filament pushed after travel; empty uses the printer value.'],
    { ...signedMm, ...printerValue },
  ),
  float(
    'filament_retraction_minimum_travel',
    ['Retraction minimum travel', 'Travel shorter than this does not retract; empty uses the printer value.'],
    { ...mm, ...printerValue },
  ),
  bool(
    'filament_retract_when_changing_layer',
    ['Retract on layer change', 'Retract when moving to the next layer; empty uses the printer value.'],
    printerValue,
  ),
  bool(
    'filament_wipe',
    ['Wipe while retracting', 'Move the nozzle while retracting; empty uses the printer value.'],
    printerValue,
  ),
  float('filament_wipe_distance', ['Wipe distance', 'Length of the wipe move; empty uses the printer value.'], {
    ...mm,
    ...printerValue,
  }),
  floatOrPercent(
    'filament_retract_before_wipe',
    ['Retract before wipe', 'Share of retraction done before wiping; empty uses the printer value.'],
    printerValue,
  ),
  float('filament_z_hop', ['Z hop', 'Lift the nozzle during travel; empty uses the printer value.'], {
    ...mm,
    ...printerValue,
  }),
  choice('filament_z_hop_types', ['Z hop type', 'Shape of the lift move; empty uses the printer value.'], {
    choices: [
      ['Auto Lift', 'Auto'],
      ['Normal Lift', 'Normal'],
      ['Slope Lift', 'Slope'],
      ['Spiral Lift', 'Spiral'],
    ],
    ...printerValue,
  }),
  bool(
    'filament_long_retractions_when_cut',
    ['Long retraction when cut', 'Retract further before the filament is cut; empty uses the printer value.'],
    printerValue,
  ),
  float(
    'filament_retraction_distances_when_cut',
    ['Retraction distance when cut', 'Length of the long retraction before a cut; empty uses the printer value.'],
    { ...mm, ...printerValue },
  ),
]);

const filamentOther = section('filament', 'filament-other', [
  text('filament_type', ['Filament type', 'Material family, such as PLA or PETG.']),
  text('filament_vendor', ['Vendor', 'Filament manufacturer.']),
  float('filament_cost', ['Price', 'Price per kilogram, for cost estimates.'], count),
  bool('filament_soluble', ['Soluble', 'The filament dissolves, for example support material.']),
  bool('filament_is_support', ['Support material', 'The filament is meant for supports.']),
  choice('filament_scarf_seam_type', ['Scarf seam type', 'Filament-specific scarf seam setting.'], {
    choices: [
      ['none', 'None'],
      ['external', 'Contour'],
      ['all', 'Contour and hole'],
    ],
  }),
  floatOrPercent('filament_scarf_height', ['Scarf start height', 'Filament-specific scarf start height, in mm or %.']),
  floatOrPercent('filament_scarf_gap', ['Scarf gap', 'Filament-specific scarf gap, in mm or %.']),
  float('filament_scarf_length', ['Scarf length', 'Filament-specific scarf length.'], mm),
  float(
    'filament_minimal_purge_on_wipe_tower',
    ['Minimum prime tower purge', 'Least material purged on the prime tower after a change.'],
    { unit: 'mm3', minimum: 0 },
  ),
  float('filament_prime_volume', ['Prime volume', 'Material purged to prime this filament.'], {
    unit: 'mm3',
    minimum: 0,
  }),
  bool('override_process_overhang_speed', [
    'Override overhang speeds',
    'Use the filament overhang speeds below instead of the process ones.',
  ]),
  bool('filament_enable_overhang_speed', ['Slow down for overhangs', 'Filament-specific overhang slowdown.']),
  float('filament_overhang_1_4_speed', ['Overhang speed 10-25%', 'Filament-specific slight overhang speed.'], speed),
  float('filament_overhang_2_4_speed', ['Overhang speed 25-50%', 'Filament-specific moderate overhang speed.'], speed),
  float('filament_overhang_3_4_speed', ['Overhang speed 50-75%', 'Filament-specific steep overhang speed.'], speed),
  float(
    'filament_overhang_4_4_speed',
    ['Overhang speed 75-100%', 'Filament-specific very steep overhang speed.'],
    speed,
  ),
  float(
    'filament_overhang_totally_speed',
    ['Full overhang speed', 'Filament-specific speed for unsupported walls.'],
    speed,
  ),
  float('filament_bridge_speed', ['Bridge speed', 'Filament-specific bridge speed.'], speed),
]);

/** Every Tau-authored descriptor, in display order. @public */
export const bambuOptionCatalog: readonly BambuOptionDescriptor[] = [
  ...quality,
  ...strength,
  ...speedGroup,
  ...support,
  ...multimaterial,
  ...others,
  ...legacy,
  ...temperatures,
  ...cooling,
  ...flow,
  ...retraction,
  ...filamentOther,
];
