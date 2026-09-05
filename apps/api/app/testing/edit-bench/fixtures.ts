import type { DeterministicEditFileInput, RpcClientErrorCode } from '@taucad/chat';
import type { BenchmarkErrorCode, ReplayCase, ReplayFixture } from './replay-fixture.schema.js';
import { replayFixtureStoreSchema } from './replay-fixture.schema.js';

const encoder = new TextEncoder();
const encode = (content: string): Uint8Array<ArrayBuffer> => encoder.encode(content);

type TextEmission = Readonly<{
  toolName: string;
  argumentsJson: string;
  casConflicts?: readonly string[];
}>;

type TextExpected =
  | Readonly<{ kind: 'success'; files: Readonly<Record<string, string>>; staleRecovered?: boolean }>
  | Readonly<{
      kind: 'error';
      errorCode: RpcClientErrorCode | BenchmarkErrorCode;
      files: Readonly<Record<string, string>>;
    }>;

type TextFixture = Readonly<{
  id: string;
  case: ReplayCase;
  source: ReplayFixture['source'];
  targetFile: string;
  initial: Readonly<Record<string, string>>;
  emissions: readonly TextEmission[];
  grade?: Readonly<{ kind: 'typescript-parse' }>;
  expected: TextExpected;
}>;

const snapshots = (files: Readonly<Record<string, string>>) =>
  Object.entries(files).map(([path, content]) => ({ path, bytes: encode(content) }));

const fixture = (input: TextFixture): ReplayFixture => {
  const expected: ReplayFixture['expected'] =
    input.expected.kind === 'success'
      ? {
          kind: 'success',
          files: snapshots(input.expected.files),
          ...(input.expected.staleRecovered === undefined ? {} : { staleRecovered: input.expected.staleRecovered }),
        }
      : {
          kind: 'error',
          files: snapshots(input.expected.files),
          errorCode: input.expected.errorCode,
        };

  return {
    version: 1,
    id: input.id,
    case: input.case,
    source: input.source,
    targetFile: input.targetFile,
    initial: { files: snapshots(input.initial) },
    emissions: input.emissions.map((emission) => ({
      toolName: emission.toolName,
      argumentsJson: emission.argumentsJson,
      ...(emission.casConflicts ? { casConflicts: emission.casConflicts.map(encode) } : {}),
    })),
    ...(input.grade ? { grade: input.grade } : {}),
    expected,
  };
};

const editEmission = (args: DeterministicEditFileInput, casConflicts?: readonly string[]): TextEmission => ({
  toolName: 'edit_file',
  argumentsJson: JSON.stringify(args),
  ...(casConflicts ? { casConflicts } : {}),
});

const authored = (sourcePath: string): ReplayFixture['source'] => ({ kind: 'authored', sourcePath });

const jscadCubePath = 'libs/tau-examples/src/kernels/jscad/cube/main.ts';
const openScadKitchenSinkPath = 'libs/tau-examples/src/kernels/openscad/kitchen-sink/main.scad';
const foldedUnicodeSourcePath = 'apps/api/app/testing/edit-bench/folded-unicode-source.fixture.txt';
// The prompt-config example was deleted by the KS-5 prompt surgery; the
// execution-verified verbatim copy lives in the KS-2 fixture set.
const kclTeapotPath = 'apps/runtime-e2e/src/prompt-examples/fixtures/zoo.canonical-example/main.kcl.fixture';
const qualificationEvidencePath = 'spikes/stash1-edit-reference/file-edit-interface-qualification.jsonl';

const foldedUnicodeSource =
  '// outside\u00A0“left” — sentinel\u2009\nmaterial\u00A0= “wood”;\uFEFF\n// outside\u2009‘right’ – sentinel\t \n';
const foldedUnicodeSpan = 'material\u00A0= “wood”;';

/** Byte-for-byte copy of the real JSCAD cube main. */
const jscadCube = `import type { geometries } from '@jscad/modeling';
import { primitives } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { cube } = primitives;

export const defaultParams = {
  size: 20,
};

export default function main(p = defaultParams): Geom3 {
  return cube({ size: p.size });
}
`;

/** Byte-for-byte copy of the real OpenSCAD kitchen-sink main. */
const openScadKitchenSink = `// Parameter Kitchen Sink
// Exercises every OpenSCAD Customizer parameter type.

/* [Dimensions] */
// Plain spinbox
height = 50;
// Spinbox with step
width = 25.5; // .5
// Slider with max
depth = 34; // [100]
// Slider with range
length = 50; // [10:200]
// Slider with step
count = 5; // [0:1:20]
// Centered slider
offset = 0; // [-10:0.1:10]

/* [Options] */
// Number dropdown
size = 20; // [10, 20, 30, 40]
// Labeled number dropdown
quality = 20; // [10:Low, 20:Medium, 30:High]
// String dropdown
material = "wood"; // [wood, metal, plastic, glass]
// Labeled string dropdown
finish = "M"; // [M:Matte, G:Glossy, S:Satin]
// Checkbox
show_base = true;
// Text string
label_text = "Hello";
// String with max length
serial = "ABC123"; //8

/* [Colors] */
// Color string
primary_color = "#FF6600";

/* [Vectors] */
// Vector2
position = [10, 20];
// Vector3
rotation = [0, 45, 90];
// Vector4
bounds = [0, 0, 100, 100];
// Vector with range
offsets = [5, 10, 15]; //[0:1:50]

/* [Hidden] */
_internal = 42;
$fn = 48;

module base_plate(w, d, h) {
  color(primary_color)
    translate([0, 0, h / 2])
      cube([w, d, h], center = true);
}

module pillar(r, h, pos) {
  translate([pos[0], pos[1], h / 2])
    cylinder(r = r, h = h, center = true);
}

module label_3d(txt, pos) {
  translate([pos[0], pos[1], height + 2])
    linear_extrude(2)
      text(txt, size = size / 4, halign = "center", valign = "center");
}

pillar_radius = width / 8;
base_h = depth / 10;

if (show_base) {
  base_plate(length, width, base_h);
}

for (i = [0 : 1 : count - 1]) {
  x = -length / 2 + length / (count + 1) * (i + 1) + offset;
  pillar(pillar_radius, height, [x, 0]);
}

rotate(rotation)
  translate(position)
    label_3d(label_text, [0, 0]);
`;

/** Tau's checked-in KCL example; tau-examples currently has no KCL entry. */
const kclTeapot = `// Parametric Teapot
// Comprehensive KCL example demonstrating the full Resilient Modeling Strategy
//
// Features demonstrated:
// - Reference: Parameters with real-world dimensions, @settings for units
// - Core: startSketchOn + startProfile for 2D sketches, revolve for body
// - Surface: tangentialArc for organic curves, sweep for spout/handle
// - Detail: subtract2d for hollow profiles, subtract for cutouts
// - Modify: Boolean operations via subtract
// - Quarantine: appearance for materials/colors

// === REFERENCE: Unit settings and parameters ===
@settings(defaultLengthUnit = mm)

// Body parameters (real-world teapot dimensions)
teapotHeight = 130          // mm - standard teapot height
beltlineDiameter = 160      // mm - widest point diameter
wallThickness = 6           // mm - ceramic-like wall thickness

// Spout parameters
outletHeight = 26           // mm - spout outlet position from base
spoutDiameter = 12          // mm - spout opening diameter

// Handle parameters
handleWidth = 20            // mm - handle cross-section width

// === SURFACE FEATURES: Spout path with tangentialArc ===
// Sketch the curved path for the spout sweep
spoutPath = startSketchOn(XZ)
  |> startProfile(at = [-beltlineDiameter / 2.5, outletHeight])
  |> xLine(length = -15.05)
  |> tangentialArc(angle = -110deg, radius = 30, tag = $seg01)
  |> angledLine(angle = tangentToEnd(seg01), length = 16.84)
  |> tangentialArc(angle = 100deg, radius = 30)

// === DETAIL FEATURES: Hollow spout cross-section ===
// Create hollow spout using subtract2d for wall thickness
spout = startSketchOn(offsetPlane(YZ, offset = -beltlineDiameter / 2.5))
  |> circle(center = [0, outletHeight], diameter = spoutDiameter)
  |> subtract2d(tool = circle(center = [0, outletHeight], diameter = spoutDiameter * 0.8))
  |> sweep(path = spoutPath)

// === CORE FEATURES: Body profile for trimming ===
// Model the perimeter of the teapot body for handle trimming
tools = startSketchOn(YZ)
  |> startProfile(at = [0, 0])
  |> xLine(length = beltlineDiameter / 5)
  |> tangentialArc(endAbsolute = [beltlineDiameter / 2.1, teapotHeight / 2.5])
  |> tangentialArc(endAbsolute = [beltlineDiameter / 3, teapotHeight / 1.1])
  |> tangentialArc(endAbsolute = [beltlineDiameter / 4, teapotHeight])
  |> xLine(endAbsolute = profileStartX(%))
  |> line(endAbsolute = profileStart(%))
  |> close()
  |> revolve(axis = Y)

// === SURFACE FEATURES: Handle path with multiple tangentialArcs ===
// Sketch the curved path for the handle sweep
handlePath = startSketchOn(XZ)
  |> startProfile(at = [0, outletHeight])
  |> xLine(endAbsolute = 76)
  |> tangentialArc(end = [12.98, 6.64])
  |> tangentialArc(end = [28.39, 63.11])
  |> tangentialArc(end = [-10.27, 14.8])
  |> tangentialArc(end = [-48.01, 1.81], tag = $seg02)
  |> angledLine(angle = tangentToEnd(seg02), endAbsoluteX = 0)

// === SURFACE + MODIFY: Handle with boolean trim ===
// Sweep the handle profile and subtract body to trim ends
handle = startSketchOn(YZ)
  |> startProfile(at = [-10, outletHeight + 3.5])
  |> arc(interiorAbsolute = [0, outletHeight + 5], endAbsolute = [10, profileStartY(%)])
  |> tangentialArc(end = [0, -7])
  |> tangentialArc(end = [-20, 0])
  |> tangentialArc(endAbsolute = profileStart())
  |> close()
  |> sweep(path = handlePath)
  |> subtract(tools)

// === DETAIL FEATURES: Spout outlet cutout ===
// Create a cutout in the body for the spout connection
spoutHole = startSketchOn(YZ)
  |> circle(center = [0, outletHeight], diameter = spoutDiameter)
  |> extrude(length = -beltlineDiameter / 2)

// === CORE FEATURES: Main body with hollow interior ===
// Create the body using revolve with wall thickness profile
body = startSketchOn(YZ)
  |> startProfile(at = [0, 0])
  // Outer profile
  |> xLine(length = beltlineDiameter / 5)
  |> tangentialArc(endAbsolute = [beltlineDiameter / 2.1, teapotHeight / 2.5])
  |> tangentialArc(endAbsolute = [beltlineDiameter / 3, teapotHeight / 1.1])
  |> tangentialArc(endAbsolute = [beltlineDiameter / 4, teapotHeight])
  // Rim and inner profile (wall thickness offset)
  |> tangentialArc(angle = 190deg, diameter = wallThickness)
  |> tangentialArc(endAbsolute = [beltlineDiameter / 3 - wallThickness, teapotHeight / 1.1])
  |> tangentialArc(endAbsolute = [beltlineDiameter / 2.1 - wallThickness, teapotHeight / 2.5])
  |> tangentialArc(endAbsolute = [beltlineDiameter / 5, profileStartY() + wallThickness])
  |> xLine(endAbsolute = profileStartX(%))
  |> line(endAbsolute = profileStart(%))
  |> close()
  |> revolve(axis = Y)
  |> subtract(tools = [spoutHole])

// === QUARANTINE FEATURES: Appearance/material ===
// Join components and apply visual appearance
[body, handle, spout]
  |> appearance(color = "#1f9896", metalness = 40, roughness = 30)

`;

const qualificationCube = `// Parametric cube
$fa = 2;
$fs = 0.4;

cube_size = 20;
cube(cube_size, center = true);
`;

const qualificationReplacement = `cylinder_radius = 5;

difference() {
    cube(cube_size, center = true);
    cylinder(h = cube_size + 2, r = cylinder_radius, center = true);
}`;

const qualificationCutout = qualificationCube.replace('cube(cube_size, center = true);', qualificationReplacement);

const legacyQualificationFixtures = Array.from({ length: 5 }, (_, index) =>
  fixture({
    id: `legacy-xai-grok-4-5-${String(index + 1)}`,
    case: 'legacy-qualification',
    source: {
      kind: 'qualification-derived',
      sourceModel: 'xai-grok-4.5',
      provider: 'xai',
      nativeToolName: 'edit_file',
      invocation: index + 1,
      recordedAt: '2026-07-28T07:24:26.041Z',
      argumentsVerbatim: false,
      evidencePath: qualificationEvidencePath,
    },
    targetFile: 'main.scad',
    initial: { 'main.scad': qualificationCube },
    emissions: [
      editEmission({
        targetFile: 'main.scad',
        oldString: 'cube(cube_size, center = true);',
        newString: qualificationReplacement,
      }),
    ],
    expected: { kind: 'success', files: { 'main.scad': qualificationCutout } },
  }),
);

const jscadMain = `export default function main(p = defaultParams): Geom3 {
  return cube({ size: p.size });
}`;
const externalOnce = `// external one\n${jscadCube}`;
const externalTwice = `// external two\n${externalOnce}`;

const authoredFixtures: readonly ReplayFixture[] = [
  fixture({
    id: 'unique-match-jscad-cube-size',
    case: 'unique-match',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube },
    emissions: [editEmission({ targetFile: 'main.ts', oldString: 'size: 20', newString: 'size: 24' })],
    grade: { kind: 'typescript-parse' },
    expected: { kind: 'success', files: { 'main.ts': jscadCube.replace('size: 20', 'size: 24') } },
  }),
  fixture({
    id: 'context-widening-jscad-defaults',
    case: 'context-widening',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube },
    emissions: [
      editEmission({
        targetFile: 'main.ts',
        oldString: `export const defaultParams = {\n  size: 20,\n};`,
        newString: `export const defaultParams = {\n  size: 22,\n};`,
      }),
    ],
    grade: { kind: 'typescript-parse' },
    expected: { kind: 'success', files: { 'main.ts': jscadCube.replace('size: 20', 'size: 22') } },
  }),
  fixture({
    id: 'ambiguous-jscad-geom3-no-write',
    case: 'ambiguous-match',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube },
    emissions: [editEmission({ targetFile: 'main.ts', oldString: 'Geom3', newString: 'Solid' })],
    expected: { kind: 'error', errorCode: 'AMBIGUOUS_MATCH', files: { 'main.ts': jscadCube } },
  }),
  fixture({
    id: 'ordered-pair-jscad-size-and-center',
    case: 'ordered-pair',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube },
    emissions: [
      editEmission({ targetFile: 'main.ts', oldString: 'size: 20', newString: 'size: 22' }),
      editEmission({
        targetFile: 'main.ts',
        oldString: 'return cube({ size: p.size });',
        newString: 'return cube({ size: p.size, center: [0, 0, 0] });',
      }),
    ],
    grade: { kind: 'typescript-parse' },
    expected: {
      kind: 'success',
      files: {
        'main.ts': jscadCube
          .replace('size: 20', 'size: 22')
          .replace('return cube({ size: p.size });', 'return cube({ size: p.size, center: [0, 0, 0] });'),
      },
    },
  }),
  fixture({
    id: 'deletion-openscad-comment',
    case: 'deletion',
    source: authored(openScadKitchenSinkPath),
    targetFile: 'main.scad',
    initial: { 'main.scad': openScadKitchenSink },
    emissions: [
      editEmission({
        targetFile: 'main.scad',
        oldString: '// Plain spinbox\n',
        newString: '',
      }),
    ],
    expected: {
      kind: 'success',
      files: { 'main.scad': openScadKitchenSink.replace('// Plain spinbox\n', '') },
    },
  }),
  fixture({
    id: 'eof-append-jscad-description',
    case: 'eof-append',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube },
    emissions: [
      editEmission({
        targetFile: 'main.ts',
        oldString: jscadMain,
        newString: `${jscadMain}\n\nexport const description = 'Cube';`,
      }),
    ],
    grade: { kind: 'typescript-parse' },
    expected: {
      kind: 'success',
      files: { 'main.ts': jscadCube.replace(jscadMain, `${jscadMain}\n\nexport const description = 'Cube';`) },
    },
  }),
  fixture({
    id: 'stale-reapply-jscad-preserves-external',
    case: 'stale-reapply',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube },
    emissions: [editEmission({ targetFile: 'main.ts', oldString: 'size: 20', newString: 'size: 25' }, [externalOnce])],
    grade: { kind: 'typescript-parse' },
    expected: {
      kind: 'success',
      staleRecovered: true,
      files: { 'main.ts': externalOnce.replace('size: 20', 'size: 25') },
    },
  }),
  fixture({
    id: 'stale-second-conflict-jscad',
    case: 'stale-conflict',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube },
    emissions: [
      editEmission({ targetFile: 'main.ts', oldString: 'size: 20', newString: 'size: 25' }, [
        externalOnce,
        externalTwice,
      ]),
    ],
    expected: { kind: 'error', errorCode: 'EDIT_CONFLICT', files: { 'main.ts': externalTwice } },
  }),
  fixture({
    id: 'wrong-tool-create-file-rejected',
    case: 'wrong-tool-selection',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube },
    emissions: [
      {
        toolName: 'create_file',
        argumentsJson: JSON.stringify({ targetFile: 'main.ts', content: jscadCube.replace('size: 20', 'size: 99') }),
      },
    ],
    expected: { kind: 'error', errorCode: 'WRONG_TOOL_SELECTION', files: { 'main.ts': jscadCube } },
  }),
  fixture({
    id: 'wrong-target-sentinel-rejected',
    case: 'wrong-target',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube, 'sentinel.ts': 'export const sentinel = true;\n' },
    emissions: [editEmission({ targetFile: 'sentinel.ts', oldString: 'true', newString: 'false' })],
    expected: {
      kind: 'error',
      errorCode: 'WRONG_TARGET',
      files: { 'main.ts': jscadCube, 'sentinel.ts': 'export const sentinel = true;\n' },
    },
  }),
  fixture({
    id: 'non-ts-openscad-label',
    case: 'non-ts-scad',
    source: authored(openScadKitchenSinkPath),
    targetFile: 'main.scad',
    initial: { 'main.scad': openScadKitchenSink },
    emissions: [
      editEmission({ targetFile: 'main.scad', oldString: 'label_text = "Hello";', newString: 'label_text = "Tau";' }),
    ],
    expected: {
      kind: 'success',
      files: { 'main.scad': openScadKitchenSink.replace('label_text = "Hello";', 'label_text = "Tau";') },
    },
  }),
  fixture({
    id: 'non-ts-kcl-teapot-height',
    case: 'non-ts-kcl',
    source: authored(kclTeapotPath),
    targetFile: 'main.kcl',
    initial: { 'main.kcl': kclTeapot },
    emissions: [
      editEmission({ targetFile: 'main.kcl', oldString: 'teapotHeight = 130', newString: 'teapotHeight = 140' }),
    ],
    expected: {
      kind: 'success',
      files: { 'main.kcl': kclTeapot.replace('teapotHeight = 130', 'teapotHeight = 140') },
    },
  }),
  fixture({
    id: 'replace-all-jscad-geom3-rename',
    case: 'replace-all-rename',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube },
    emissions: [
      editEmission({ targetFile: 'main.ts', oldString: 'Geom3', newString: 'CubeGeometry', replaceAll: true }),
    ],
    grade: { kind: 'typescript-parse' },
    expected: {
      kind: 'success',
      files: { 'main.ts': jscadCube.replaceAll('Geom3', 'CubeGeometry') },
    },
  }),
  fixture({
    id: 'folded-unicode-openscad-material',
    case: 'folded-match',
    source: authored(foldedUnicodeSourcePath),
    targetFile: 'main.scad',
    initial: { 'main.scad': foldedUnicodeSource },
    emissions: [
      editEmission({ targetFile: 'main.scad', oldString: 'material = "wood";', newString: 'material = "metal";' }),
    ],
    expected: {
      kind: 'success',
      files: { 'main.scad': foldedUnicodeSource.replace(foldedUnicodeSpan, 'material = "metal";') },
    },
  }),
  fixture({
    id: 'wrong-but-valid-jscad-syntax-probe',
    case: 'wrong-but-valid',
    source: authored(jscadCubePath),
    targetFile: 'main.ts',
    initial: { 'main.ts': jscadCube },
    emissions: [
      editEmission({
        targetFile: 'main.ts',
        oldString: 'return cube({ size: p.size });',
        newString: 'return cube({ size: ; });',
      }),
    ],
    grade: { kind: 'typescript-parse' },
    expected: {
      kind: 'error',
      errorCode: 'WRONG_BUT_VALID',
      files: { 'main.ts': jscadCube.replace('return cube({ size: p.size });', 'return cube({ size: ; });') },
    },
  }),
];

export const replayFixtures = replayFixtureStoreSchema.parse([...legacyQualificationFixtures, ...authoredFixtures]);
