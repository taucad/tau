import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useSelector } from '@xstate/react';
import type { ProjectManifest } from '@taucad/types';
import type { ComputeBinding } from '@taucad/runtime';
import type {
  AuthoredAssembly,
  PublishedPartAsset,
  PublishedPartReference,
  PublishAssemblyOutcome,
} from '@taucad/runtime/types';
import type { FileSystemBridgeConnection, RootedBridgeConsumer } from '@taucad/fs-bridge';
import { createFileSystemBridgeProxy } from '@taucad/fs-bridge';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import { digestContent } from '@taucad/cache-core';
import { sha256String } from '@taucad/utils/hash';
import { Loader } from '#components/ui/loader.js';
import { getEnvironment } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { CreateProjectOptions } from '#hooks/use-project-manager.js';
import { selectProjectCreation } from '#hooks/project-manager.machine.js';
import { HomeFileManagerProvider, useFileManager } from '#hooks/use-file-manager.js';
import { createAssemblyPublicationAuthority } from '#runtime/assembly-display-admission.js';
import { localKernelOptions } from '#constants/local-kernel-options.js';
import { getComputeReuseMode } from '#lib/compute-reuse-preference.js';
import type { PageKernelOptionsFactory } from '#types/runtime-client.alias.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import { createScaleFixture, isScaleFixtureName } from '#routes/[__e2e].project-file-tree/scale-fixture.js';
import { createMovingLinksFixture } from '#routes/[__e2e].project-file-tree/moving-links-fixture.js';

/** Same shape the project-creation-location fixture accepts: one OPFS directory name. */
const validWorkspaceFixture = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

/** The Anthropic-wire model the agent-host gateway fixture answers for. */
const seededModel = 'anthropic-claude-haiku-4.5';

const encoder = new TextEncoder();

const encode = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);

const honeycombModel = `import { makeBaseBox } from 'replicad';

export const defaultParams = {
  dimensions: { width: 20, height: 14, depth: 4, rotationAngle: 45 },
  pattern: { cellSize: 3, wallThickness: 1 },
};

export default function main(params = defaultParams) {
  const { width, height, depth } = params.dimensions;
  return makeBaseBox(width, height, depth);
}
`;

const previewMixedModel = `import { makeBaseBox } from 'replicad';

const checker = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAw0lEQVR4nO3QMQ1CURTA0CeFGQlYQwlOcAcO/nZzLqFDxyZNz+35+lzxvj8u+XX/6ADtN0AHaL8BOkD7DdAB2j/bA6f9BugA7TdAB2i/ATpA+w3YHjjtN0AHaL8BOkD7DdAB2m/A9sBpvwE6QPsN0AHab4AO0H4DtgdO+w3QAdpvgA7QfgN0gPYbsD1w2m+ADtB+A3SA9hugA7TfgO2B034DdID2G6ADtN8AHaD9BmwPnPYboAO03wAdoP0G6ADt//2AL5XAcf/TCc2WAAAAAElFTkSuQmCC';
const image = Uint8Array.from(atob(checker), (character) => character.charCodeAt(0));
const materials = [
  { name: 'Brushed copper', pbrMetallicRoughness: { baseColorFactor: [0.96, 0.62, 0.48, 1], metallicFactor: 1, roughnessFactor: 0.18 } },
  { name: 'Optical glass', pbrMetallicRoughness: { baseColorFactor: [0.9, 0.97, 1, 1], metallicFactor: 0, roughnessFactor: 0.06 }, extensions: { KHR_materials_transmission: { transmissionFactor: 1 }, KHR_materials_ior: { ior: 1.52 } } },
  { name: 'Woven texture', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8 } },
  { name: 'Matte polymer', pbrMetallicRoughness: { baseColorFactor: [0.18, 0.52, 0.23, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
];

export default function main() {
  return {
    images: [{ data: image, mimeType: 'image/png' }],
    textures: [{ source: 0 }],
    shapes: Array.from({ length: 12 }, (_, index) => ({
      shape: makeBaseBox(8 + (index % 3), 7 + (index % 4), 5 + (index % 2))
        .translate([(index % 4) * 14 - 21, Math.floor(index / 4) * 14 - 21, 0]),
      name: 'Preview part ' + String(index + 1),
      material: materials[index % materials.length],
    })),
  };
}
`;

const previewShellModel = `import { draw } from 'replicad';
export default function main() {
  return draw().hLine(50).vLine(30).hLine(-50).close();
}
`;

const physicalInspectionModel = `import { makeBaseBox, drawRectangle } from 'replicad';

export const defaultParams = { width: 26 };

export default function main(params = defaultParams) {
  return [
    { shape: makeBaseBox(params.width, 20, 24), name: 'Known housing', density: 1.55 },
    { shape: makeBaseBox(10, 8, 6).translate([40, 0, 0]), name: 'Unknown density' },
    { shape: drawRectangle(10, 8).sketchOnPlane().face().translate([0, 40, 0]), name: 'Open face' },
  ];
}
`;

const stressParameters = Object.fromEntries(
  Array.from({ length: 96 }, (_, index) => [`stressValue${String(index + 1)}`, index + 1]),
);

const boxCornerModel = `import { makeBaseBox } from 'replicad';

export const defaultParams = {
  dimensions: { width: 16, height: 12, depth: 6 },
  corner: { cornerRadius: 2, rounded: true },
  stress: ${JSON.stringify(stressParameters)},
};

export default function main(params = defaultParams) {
  const { width, height, depth } = params.dimensions;
  if (params.stress.stressValue96 > 1000) {
    throw new Error('parameter stress preview failure');
  }
  return makeBaseBox(width, height, depth);
}
`;

const packageJson = JSON.stringify(
  {
    type: 'module',
  },
  null,
  2,
);

const seedFiles = Object.fromEntries([
  ['package.json', { content: encode(packageJson) }],
  ['public/models/honeycomb.js', { content: encode(honeycombModel) }],
  ['public/models/preview-mixed.js', { content: encode(previewMixedModel) }],
  ['public/models/preview-virtual.js', { content: encode(previewMixedModel.replace('length: 12', 'length: 48')) }],
  ['public/models/preview-shell.js', { content: encode(previewShellModel) }],
  ['public/models/physical-inspection.js', { content: encode(physicalInspectionModel) }],
  ['public/models/box-corner.js', { content: encode(boxCornerModel) }],
  ['public/models/nested/strainer.js', { content: encode(honeycombModel) }],
  ['src/readme.md', { content: encode('# File tree e2e fixture\n') }],
]) as Record<string, { content: Uint8Array<ArrayBuffer> }>;

/** Finite test-only native source/placement matrix; host publication owns all records and GLBs. */
const createBatchingParityFixture = (): Record<string, { content: Uint8Array<ArrayBuffer> }> => ({
  'parity/parts/opaque.js': {
    content: encode(
      "import { makeBaseBox } from 'replicad';\nexport default function main() { return { shape: makeBaseBox(20,14,4), name: 'Parity opaque', material: { name:'Matte polymer',pbrMetallicRoughness:{baseColorFactor:[0.18,0.52,0.23,1],metallicFactor:0,roughnessFactor:0.9} } }; }\n",
    ),
  },
  'parity/parts/glass.js': {
    content: encode(
      "import { makeBaseBox } from 'replicad';\nexport default function main() { return { shape: makeBaseBox(20,14,4), name: 'Parity transmission', material: { name:'Optical glass',pbrMetallicRoughness:{baseColorFactor:[0.9,0.97,1,1],metallicFactor:0,roughnessFactor:0.06},extensions:{KHR_materials_transmission:{transmissionFactor:1},KHR_materials_ior:{ior:1.52}} } }; }\n",
    ),
  },
  'parity/parts/alpha.js': {
    content: encode(
      "import { makeBaseBox } from 'replicad';\nexport default function main() { return { shape: makeBaseBox(20,14,4), name: 'Parity source alpha', material: { alphaMode:'BLEND',pbrMetallicRoughness:{baseColorFactor:[0.18,0.52,0.23,0.45],metallicFactor:0,roughnessFactor:0.9} } }; }\n",
    ),
  },
  'parity/assembly.json': {
    content: encode(
      JSON.stringify({
        schemaVersion: 1,
        parts: {
          opaque: { source: { path: 'parity/parts/opaque.js' } },
          glass: { source: { path: 'parity/parts/glass.js' } },
          alpha: { source: { path: 'parity/parts/alpha.js' } },
        },
        occurrences: [
          {
            id: 'opaque-positive',
            transform: [1.4, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 1.2, 0, 0, 0, 0, 1],
            children: [
              { id: 'left', part: 'opaque', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
              { id: 'right', part: 'opaque', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.007, 0.001, 0.002, 1] },
            ],
          },
          {
            id: 'effective-ancestor-opacity',
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.05, 0, 0, 1],
            children: [
              { id: 'left', part: 'opaque', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
              { id: 'right', part: 'opaque', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.007, 0.001, 0.002, 1] },
            ],
          },
          {
            id: 'source-transmission',
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0, 0, 1],
            children: [
              { id: 'left', part: 'glass', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
              { id: 'right', part: 'glass', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.007, 0.001, 0.002, 1] },
            ],
          },
          {
            id: 'source-transparent',
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.15000000000000002, 0, 0, 1],
            children: [
              { id: 'left', part: 'alpha', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
              { id: 'right', part: 'alpha', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.007, 0.001, 0.002, 1] },
            ],
          },
          {
            id: 'composed-shear',
            transform: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.2, 0, 0, 1],
            children: [
              {
                id: 'left',
                part: 'opaque',
                transform: [
                  0.7071067811865476, 0.7071067811865476, 0, 0, -0.7071067811865476, 0.7071067811865476, 0, 0, 0, 0, 1,
                  0, 0, 0, 0, 1,
                ],
              },
              {
                id: 'right',
                part: 'opaque',
                transform: [
                  0.7071067811865476, 0.7071067811865476, 0, 0, -0.7071067811865476, 0.7071067811865476, 0, 0, 0, 0, 1,
                  0, 0.007, 0.001, 0.002, 1,
                ],
              },
            ],
          },
          {
            id: 'mirror',
            transform: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.25, 0, 0, 1],
            children: [
              { id: 'left', part: 'opaque', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
              { id: 'right', part: 'opaque', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.007, 0.001, 0.002, 1] },
            ],
          },
        ],
      } satisfies AuthoredAssembly),
    ),
  },
});

/** Select a real main producer for the file-tree and preview probes. */
const mainEntryPathFor = (fixture: string | undefined): string =>
  fixture === 's13-parity'
    ? 'parity/assembly.json'
    : fixture === 'moving-links-100'
      ? 'motion/assembly.json'
      : fixture === 'physical-assembly'
        ? 'physical/assembly.json'
        : fixture === 'box-corner'
          ? 'public/models/box-corner.js'
          : fixture === 'physical-inspection'
            ? 'public/models/physical-inspection.js'
            : fixture === 'preview-secondary' || fixture === 'preview-assembly-secondary'
              ? 'public/models/preview-shell.js'
              : fixture === 'preview-mixed'
                ? 'public/models/preview-mixed.js'
                : 'public/models/honeycomb.js';

const mebibyte = 1024 * 1024;

/**
 * The same seed, at a size a latency budget is measured against (B1).
 *
 * `?files=` adds that many small source files and `?binaryMib=` one binary of
 * that size, because W6's ceilings are stated for a project with real bulk in
 * it — a cut over five files says nothing about the one a person actually has.
 * Both default to nothing, so every existing fixture URL seeds exactly what it
 * seeded before.
 *
 * @param fileCount - Extra source files to seed.
 * @param binaryMib - Size of the single binary asset, in MiB.
 * @returns The seed map `createProject` is given.
 */
const buildSeedFiles = (fileCount: number, binaryMib: number): Record<string, { content: Uint8Array<ArrayBuffer> }> => {
  const files = { ...seedFiles };
  for (let index = 0; index < fileCount; index += 1) {
    files[`public/models/bulk/part-${String(index).padStart(4, '0')}.js`] = {
      content: encode(boxCornerModel.replace('width, height, depth', `width + ${String(index)}, height, depth`)),
    };
  }
  if (binaryMib > 0) {
    /* Incompressible bytes: a run of zeroes would be deflated away and measure
     * the compressor rather than the export it stands in for. */
    const bytes = new Uint8Array(binaryMib * mebibyte);
    crypto.getRandomValues(bytes.subarray(0, 65_536));
    for (let offset = 65_536; offset < bytes.length; offset += 65_536) {
      bytes.set(bytes.subarray(0, Math.min(65_536, bytes.length - offset)), offset);
    }
    files['public/exports/bulk.stl'] = { content: bytes };
  }
  return files;
};

/** A bounded, non-negative integer from one search parameter. */
// oxlint-disable-next-line typescript/no-restricted-types -- URLSearchParams.get answers null for a missing key.
const readCount = (value: string | null, limit: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, limit) : 0;
};

const createSeedProject = (mainFixture: string | undefined): Omit<ProjectManifest, '$schema' | 'id'> => ({
  name: 'sgenoud/models file-tree e2e',
  description: 'Deterministic local seed for the project file tree e2e surface.',
  tags: ['e2e', 'replicad'],
  assets: {
    main: {
      entryPath: isScaleFixtureName(mainFixture) ? 'scale/assembly.json' : mainEntryPathFor(mainFixture),
    },
  },
});

/**
 * The worker that holds one OPFS file's exclusive access handle until the page goes.
 *
 * A held `FileSystemSyncAccessHandle` refuses every other writer with
 * `NoModificationAllowedError` while reads still succeed, which is what a second
 * tab or a full disk does to the revision store. It is a real refusal from the
 * platform, reached by the real machines; nothing on the page is painted.
 */
const holderSource = `onmessage = async ({ data }) => {
  try {
    const parts = data.split('/');
    const name = parts.pop();
    let directory = await navigator.storage.getDirectory();
    for (const part of parts) directory = await directory.getDirectoryHandle(part);
    self.held = await (await directory.getFileHandle(name)).createSyncAccessHandle();
    postMessage({ held: true });
  } catch (error) {
    postMessage({ held: false, error: String(error) });
  }
};`;

/** Holders stay referenced for the page's life, so a collected worker never lets its handle go. */
const holders: Worker[] = [];

/**
 * Hold one file of the open project (S19 in `revision-ux-visual-matrix.spec.ts`).
 *
 * A home-location project lives at the OPFS root under its URL slug.
 *
 * @param path - The project-relative path, e.g. `.git/refs/heads/main`.
 * @returns Once the handle is held.
 */
const holdProjectFile = async (path: string): Promise<void> => {
  const projectSlug = location.pathname.split('/').pop() ?? '';
  const holder = new Worker(URL.createObjectURL(new Blob([holderSource], { type: 'text/javascript' })));
  holders.push(holder);
  await new Promise<void>((resolve, reject) => {
    holder.addEventListener('message', ({ data }: MessageEvent<{ held: boolean; error?: string }>) => {
      if (data.held) {
        resolve();
      } else {
        reject(new Error(`Could not hold ${projectSlug}/${path}: ${data.error ?? 'unknown'}`));
      }
    });
    holder.postMessage(`${projectSlug}/${path}`);
  });
};

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();

  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses thrown Response objects for route control-flow.
    throw new Response('Not found', { status: 404 });
  }

  return Response.json({ ok: true });
};

type CompletedScaleCorpus = {
  root: PublishedPartAsset;
  definitions: number;
  occurrences: number;
  closureAssets: number;
};

type WarehousePreparationObservation = {
  readonly phase:
    | 'services'
    | 'services-ready'
    | 'authority'
    | 'publication'
    | 'closure'
    | 'shutdown'
    | 'source-retirement';
  readonly root?: PublishedPartAsset;
  readonly failure?: Extract<PublishAssemblyOutcome, { status: 'commit-unknown' }>['failure'];
};

type WarehousePreparationDiagnostic =
  | { readonly phase: 'transport-rejection'; readonly error: unknown; readonly evidence: unknown }
  | {
      readonly phase: 'pre-close-root';
      readonly snapshot: Awaited<
        ReturnType<Extract<PublishAssemblyOutcome, { status: 'commit-unknown' }>['readCurrent']>
      >;
    }
  | { readonly phase: 'pre-close-refusal' | 'fresh-root-refusal'; readonly error: unknown; readonly evidence: unknown }
  | { readonly phase: 'fresh-root'; readonly status: 'absent' | 'present'; readonly root?: PublishedPartAsset };

/** Prepare one real complete corpus through the captured project evaluator and checked host writer. */
export const prepareScaleCorpus = async ({
  fixture,
  publicationPath,
  openProjectBridge,
  kernelOptions,
  signal,
  isCurrent,
  onPhase,
  onDiagnostic,
}: {
  fixture: ReturnType<typeof createScaleFixture>;
  publicationPath: string;
  openProjectBridge: (consumer: RootedBridgeConsumer) => FileSystemBridgeConnection;
  kernelOptions: PageKernelOptionsFactory;
  signal: AbortSignal;
  isCurrent: () => boolean;
  onPhase?: (observation: WarehousePreparationObservation) => void;
  onDiagnostic?: (diagnostic: WarehousePreparationDiagnostic) => void;
}): Promise<CompletedScaleCorpus> => {
  const assertCurrent = (): void => {
    signal.throwIfAborted();
    if (!isCurrent()) {
      throw new Error('The captured warehouse preparation owner was replaced.');
    }
  };
  assertCurrent();
  if (Object.keys(fixture.files).some((path) => !path.startsWith('scale/'))) {
    throw new Error('Warehouse preparation may retire only its owned scale fixture sources.');
  }
  let observedRoot: PublishedPartAsset | undefined;
  let observedFailure: WarehousePreparationObservation['failure'];
  const errorEvidence = (origin: unknown): unknown => {
    const seen = new Set<unknown>();
    let remainingVisits = 96;
    let remainingFields = 128;
    let remainingCharacters = 65_536;
    const intrinsicByteLength = (subject: unknown, prototype: unknown): number | undefined => {
      if ((typeof prototype !== 'object' || prototype === null) && typeof prototype !== 'function') {
        return undefined;
      }
      const getter = Object.getOwnPropertyDescriptor(prototype, 'byteLength')?.get;
      if (!getter) {
        return undefined;
      }
      try {
        const length: unknown = Reflect.apply(getter, subject, []);
        return typeof length === 'number' && Number.isSafeInteger(length) && length >= 0 ? length : undefined;
      } catch {
        return undefined;
      }
    };
    const visit = (value: unknown, depth: number): unknown => {
      if (remainingVisits <= 0) {
        return { kind: 'visit-budget-exhausted' };
      }
      remainingVisits -= 1;
      if (value === null || typeof value === 'number' || typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        const retained = Math.min(value.length, remainingCharacters, 16_384);
        remainingCharacters -= retained;
        return retained === value.length ? value : { text: value.slice(0, retained), originalLength: value.length };
      }
      if (typeof value === 'bigint') {
        return { kind: 'bigint' };
      }
      if (typeof value === 'symbol') {
        return { kind: 'symbol', description: visit(value.description ?? '', depth + 1) };
      }
      if (typeof value !== 'object' && typeof value !== 'function') {
        return { kind: typeof value };
      }
      if (seen.has(value)) {
        return { kind: 'cycle' };
      }
      if (depth >= 6) {
        return { kind: 'depth-limit' };
      }
      seen.add(value);
      if (ArrayBuffer.isView(value)) {
        const type =
          value instanceof DataView
            ? 'DataView'
            : value instanceof Uint8Array
              ? 'Uint8Array'
              : value instanceof Int8Array
                ? 'Int8Array'
                : value instanceof Uint16Array
                  ? 'Uint16Array'
                  : value instanceof Int16Array
                    ? 'Int16Array'
                    : value instanceof Uint32Array
                      ? 'Uint32Array'
                      : value instanceof Int32Array
                        ? 'Int32Array'
                        : value instanceof Float32Array
                          ? 'Float32Array'
                          : value instanceof Float64Array
                            ? 'Float64Array'
                            : 'ArrayBufferView';
        const prototype: unknown =
          value instanceof DataView ? DataView.prototype : Object.getPrototypeOf(Uint8Array.prototype);
        const byteLength = intrinsicByteLength(value, prototype);
        return byteLength === undefined
          ? { kind: 'binary-view', type, status: 'refused' }
          : { kind: 'binary-view', type, byteLength };
      }
      if (value instanceof ArrayBuffer) {
        const byteLength = intrinsicByteLength(value, ArrayBuffer.prototype);
        return byteLength === undefined
          ? { kind: 'array-buffer', status: 'refused' }
          : { kind: 'array-buffer', byteLength };
      }
      if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
        const byteLength = intrinsicByteLength(value, SharedArrayBuffer.prototype);
        return byteLength === undefined
          ? { kind: 'shared-array-buffer', status: 'refused' }
          : { kind: 'shared-array-buffer', byteLength };
      }
      if (Array.isArray(value)) {
        let length: unknown;
        try {
          length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
        } catch {
          return { kind: 'array', status: 'refused' };
        }
        if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
          return { kind: 'array', status: 'refused' };
        }
        const items: unknown[] = [];
        for (let index = 0; index < length && index < 32 && remainingFields > 0; index += 1) {
          remainingFields -= 1;
          try {
            const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
            items.push(
              descriptor
                ? 'value' in descriptor
                  ? visit(descriptor.value, depth + 1)
                  : { kind: 'accessor' }
                : { kind: 'hole' },
            );
          } catch {
            items.push({ kind: 'refused' });
          }
        }
        return { kind: 'array', length, items, truncated: items.length < length };
      }
      const field = (name: string): unknown => {
        let subject: unknown = value;
        for (let parent = 0; parent < 4; parent += 1) {
          if ((typeof subject !== 'object' || subject === null) && typeof subject !== 'function') {
            return null;
          }
          try {
            const descriptor = Object.getOwnPropertyDescriptor(subject, name);
            if (descriptor) {
              return 'value' in descriptor ? visit(descriptor.value, depth + 1) : { kind: 'accessor' };
            }
            const inherited: unknown = Object.getPrototypeOf(subject);
            subject = inherited;
          } catch {
            return { kind: 'refused' };
          }
        }
        return null;
      };
      try {
        const own: Record<string, unknown> = {};
        let truncated = false;
        const record = (name: string): void => {
          if (Object.hasOwn(own, name)) {
            return;
          }
          if (Object.keys(own).length >= 32 || remainingFields <= 0) {
            truncated = true;
            return;
          }
          const descriptor = Object.getOwnPropertyDescriptor(value, name);
          if (descriptor) {
            remainingFields -= 1;
            own[name] = 'value' in descriptor ? visit(descriptor.value, depth + 1) : { kind: 'accessor' };
          }
        };
        for (const name of ['name', 'code', 'message', 'stack', 'cause', 'details', 'issues']) {
          record(name);
        }
        for (const name in value) {
          if (Object.hasOwn(value, name)) {
            if (remainingFields <= 0 || Object.keys(own).length >= 32) {
              truncated = true;
              break;
            }
            record(name);
          }
        }
        return {
          kind: 'object',
          name: field('name'),
          code: field('code'),
          message: field('message'),
          stack: field('stack'),
          own,
          truncated,
        };
      } catch {
        return { kind: 'uninspectable', name: field('name'), code: field('code'), message: field('message') };
      }
    };
    return visit(origin, 0);
  };
  const observe = (phase: WarehousePreparationObservation['phase']): void => {
    try {
      onPhase?.({
        phase,
        root: observedRoot ? { ...observedRoot } : undefined,
        ...(observedFailure === undefined ? {} : { failure: observedFailure }),
      });
    } catch {
      // An observation cannot interrupt checked publication or its owned cleanup.
    }
  };
  const diagnose = (diagnostic: WarehousePreparationDiagnostic): void => {
    try {
      onDiagnostic?.(diagnostic);
    } catch {
      // Private evidence cannot change checked publication or cleanup.
    }
  };
  observe('authority');
  const authority = await createAssemblyPublicationAuthority(() => {
    assertCurrent();
    return openProjectBridge('user');
  }, signal);
  try {
    assertCurrent();
    if (!authority.fileSystem) {
      throw new Error('The checked warehouse publication authority is unavailable.');
    }
    const fileSystem = fromFileSystemBridge(() => {
      assertCurrent();
      return openProjectBridge('agent');
    });
    const options = kernelOptions({ fileSystem, publicationFileSystem: authority.fileSystem });
    const selectedTransport = options.transport;
    const client = createRuntimeClient({
      ...options,
      transport: {
        ...selectedTransport,
        materialize: () => {
          const selected = selectedTransport.materialize();
          return {
            ...selected,
            open: async () => {
              const ready = await selected.open();
              return {
                ...ready,
                channel: new Proxy(ready.channel, {
                  get(channel, property, receiver) {
                    if (property !== 'call') {
                      const inherited: unknown = Reflect.get(channel, property, receiver);
                      return inherited;
                    }
                    return new Proxy(channel.call, {
                      apply(call, _receiver, args: unknown[]) {
                        let result: unknown;
                        try {
                          result = Reflect.apply(call, channel, args);
                        } catch (error) {
                          if (args[0] === 'publishAuthoredAssemblyRoot') {
                            diagnose({ phase: 'transport-rejection', error, evidence: errorEvidence(error) });
                          }
                          throw error;
                        }
                        if (args[0] !== 'publishAuthoredAssemblyRoot' || !(result instanceof Promise)) {
                          return result;
                        }
                        return result.catch((error: unknown) => {
                          diagnose({ phase: 'transport-rejection', error, evidence: errorEvidence(error) });
                          throw error;
                        });
                      },
                    });
                  },
                }),
              };
            },
          };
        },
      },
    });
    let completed: CompletedScaleCorpus;
    try {
      observe('publication');
      const published = await client.publishAssembly({ authoredPath: fixture.entryPath, publicationPath, signal });
      if (published.status === 'commit-unknown') {
        observedFailure = published.failure;
        try {
          const current = await published.readCurrent();
          diagnose({ phase: 'pre-close-root', snapshot: current });
          if (current.status === 'present') {
            observedRoot = current.root;
          }
        } catch (error) {
          diagnose({ phase: 'pre-close-refusal', error, evidence: errorEvidence(error) });
          let rootReader: ReturnType<typeof createFileSystemBridgeProxy> | undefined;
          try {
            rootReader = createFileSystemBridgeProxy(openProjectBridge('user'));
            await rootReader.ready;
            const bytes = await rootReader.readFile(publicationPath).catch((readError: unknown) => {
              if (
                typeof readError === 'object' &&
                readError !== null &&
                'code' in readError &&
                (readError.code === 'ENOENT' || readError.code === 'ENOTDIR')
              ) {
                return undefined;
              }
              throw readError;
            });
            if (bytes) {
              const root = {
                path: publicationPath,
                digest: await digestContent({ bytes }),
                byteLength: bytes.byteLength,
              };
              const reader = createRuntimeClient(
                kernelOptions({ fileSystem, publicationFileSystem: authority.fileSystem }),
              );
              try {
                await reader.openAssembly({ root });
                observedRoot = root;
                diagnose({ phase: 'fresh-root', status: 'present', root });
              } finally {
                await reader.shutdown();
              }
            } else {
              diagnose({ phase: 'fresh-root', status: 'absent' });
            }
          } catch (recoveryError) {
            diagnose({ phase: 'fresh-root-refusal', error: recoveryError, evidence: errorEvidence(recoveryError) });
          } finally {
            rootReader?.dispose();
          }
        }
      }
      assertCurrent();
      if (published.status !== 'published') {
        throw new Error(`Completed warehouse publication is unavailable: ${published.status}`);
      }
      observedRoot = published.root;
      observe('closure');
      const { publication } = published.admitted;
      const authoredFile = fixture.files[fixture.entryPath];
      if (!authoredFile) {
        throw new Error('The actual warehouse authored corpus is missing.');
      }
      const authored: unknown = JSON.parse(new TextDecoder().decode(authoredFile.content));
      if (
        typeof authored !== 'object' ||
        authored === null ||
        !('parts' in authored) ||
        typeof authored.parts !== 'object' ||
        authored.parts === null ||
        !('occurrences' in authored) ||
        !Array.isArray(authored.occurrences) ||
        Object.keys(published.partRecords).length !== fixture.denominator.definitions ||
        Object.keys(publication.parts).length !== fixture.denominator.definitions ||
        publication.occurrences.length !== fixture.denominator.occurrences ||
        authored.occurrences.length !== publication.occurrences.length ||
        Object.keys(authored.parts).length !== fixture.denominator.definitions ||
        Object.keys(authored.parts).some(
          (part) => !Object.hasOwn(publication.parts, part) || !Object.hasOwn(published.partRecords, part),
        )
      ) {
        throw new Error('The completed warehouse corpus is missing definitions or placements.');
      }
      for (let index = 0; index < authored.occurrences.length; index++) {
        const expected: unknown = authored.occurrences[index];
        const actual = publication.occurrences[index];
        if (
          typeof expected !== 'object' ||
          expected === null ||
          !('id' in expected) ||
          !('part' in expected) ||
          !('transform' in expected) ||
          !Array.isArray(expected.transform) ||
          !actual ||
          actual.id !== expected.id ||
          actual.part !== expected.part ||
          actual.variant !== 'default' ||
          JSON.stringify(actual.transform) !== JSON.stringify(expected.transform)
        ) {
          throw new Error('The completed warehouse placements differ from the authored corpus.');
        }
      }
      const assets = new Map<string, PublishedPartAsset | PublishedPartReference>();
      for (const asset of [
        published.root,
        ...Object.values(published.partRecords),
        ...Object.values(publication.parts).flatMap((record) =>
          Object.values(record.variants).flatMap(({ glb, exact }) => (exact ? [glb, exact.asset] : [glb])),
        ),
      ]) {
        const previous = assets.get(asset.path);
        if (
          previous &&
          (previous.digest !== asset.digest ||
            ('byteLength' in previous && 'byteLength' in asset && previous.byteLength !== asset.byteLength))
        ) {
          throw new Error('The completed warehouse closure has conflicting immutable assets.');
        }
        assets.set(asset.path, asset);
      }
      assertCurrent();
      const reader = createFileSystemBridgeProxy(openProjectBridge('user'));
      try {
        await reader.ready;
        assertCurrent();
        const rootBytes = await reader.readFile(published.root.path);
        assertCurrent();
        if (
          rootBytes.byteLength !== published.root.byteLength ||
          (await digestContent({ bytes: rootBytes })) !== published.root.digest
        ) {
          throw new Error('The completed warehouse pointer changed before closure collection.');
        }
        const pointer = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rootBytes)) as {
          schemaVersion: number;
          generation: number;
          manifest: PublishedPartAsset;
        };
        const parent = published.root.path.slice(0, published.root.path.lastIndexOf('/') + 1);
        const storagePath = (digest: string, extension: string): string =>
          `${parent}roots/sha256/${digest.slice('sha256:'.length)}.${extension}`;
        if (
          pointer.schemaVersion !== 2 ||
          pointer.generation !== published.generation ||
          pointer.manifest.path !== storagePath(pointer.manifest.digest, 'json') ||
          pointer.manifest.byteLength > 1_048_576
        ) {
          throw new Error('The completed warehouse pointer has no bounded manifest.');
        }
        const manifestBytes = await reader.readFile(pointer.manifest.path);
        assertCurrent();
        if (
          manifestBytes.byteLength !== pointer.manifest.byteLength ||
          (await digestContent({ bytes: manifestBytes })) !== pointer.manifest.digest
        ) {
          throw new Error('The completed warehouse manifest changed before closure collection.');
        }
        const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)) as {
          schemaVersion: number;
          content: { byteLength: number };
          chunks: PublishedPartAsset[];
        };
        if (
          manifest.schemaVersion !== 1 ||
          manifest.content.byteLength < 1 ||
          manifest.content.byteLength > 32 * 1_048_576 ||
          manifest.chunks.length !== Math.ceil(manifest.content.byteLength / 1_048_576)
        ) {
          throw new Error('The completed warehouse manifest has no bounded ordered content.');
        }
        assets.set(pointer.manifest.path, pointer.manifest);
        let offset = 0;
        for (const chunk of manifest.chunks) {
          if (
            chunk.path !== storagePath(chunk.digest, 'chunk') ||
            chunk.byteLength !== Math.min(1_048_576, manifest.content.byteLength - offset)
          ) {
            throw new Error('The completed warehouse manifest has an invalid ordered chunk.');
          }
          const previous = assets.get(chunk.path);
          if (
            previous &&
            (('byteLength' in previous && previous.byteLength !== chunk.byteLength) || previous.digest !== chunk.digest)
          ) {
            throw new Error('The completed warehouse has conflicting chunk identities.');
          }
          assets.set(chunk.path, chunk);
          offset += chunk.byteLength;
        }
        for (const asset of assets.values()) {
          assertCurrent();
          // eslint-disable-next-line no-await-in-loop -- Finish each real immutable closure member before exposing the destination.
          const bytes = await reader.readFile(asset.path);
          assertCurrent();
          // eslint-disable-next-line no-await-in-loop -- This digest belongs to the exact bytes and declared length read above.
          const digest = await digestContent({ bytes });
          assertCurrent();
          if (('byteLength' in asset && bytes.byteLength !== asset.byteLength) || digest !== asset.digest) {
            throw new Error('The completed warehouse asset bytes do not match their admitted pin.');
          }
        }
      } finally {
        reader.dispose();
      }
      completed = {
        root: published.root,
        definitions: Object.keys(publication.parts).length,
        occurrences: publication.occurrences.length,
        closureAssets: assets.size,
      };
    } finally {
      observe('shutdown');
      await client.shutdown();
    }
    assertCurrent();
    observe('source-retirement');
    // The producer is closed before its authored files disappear; no watcher can republish a partial root.
    const retiredSourceWriter = createFileSystemBridgeProxy(openProjectBridge('user'));
    try {
      await retiredSourceWriter.ready;
      for (const path of Object.keys(fixture.files)) {
        assertCurrent();
        // eslint-disable-next-line no-await-in-loop -- Retire only each newly created fixture source after closing the real producer.
        await retiredSourceWriter.unlink(path);
        assertCurrent();
        // eslint-disable-next-line no-await-in-loop -- Actual source absence is a source-free viewer prerequisite, not a cache assumption.
        if (await retiredSourceWriter.exists(path)) {
          throw new Error('A warehouse producer source survived retirement.');
        }
      }
      const rootBytes = await retiredSourceWriter.readFile(completed.root.path);
      assertCurrent();
      if (
        rootBytes.byteLength !== completed.root.byteLength ||
        (await digestContent({ bytes: rootBytes })) !== completed.root.digest
      ) {
        throw new Error('The completed warehouse root changed during source retirement.');
      }
      assertCurrent();
    } finally {
      retiredSourceWriter.dispose();
    }
    return completed;
  } finally {
    authority.dispose();
  }
};

type WarehousePreparation = {
  projectId: string;
  destination: string;
  publicationPath: string;
  fixture: ReturnType<typeof createScaleFixture>;
  started: number;
};

const WarehouseCorpusPreparation = ({ preparation }: { preparation: WarehousePreparation }): React.JSX.Element => {
  const { fileManagerRef, whenServicesReady } = useFileManager();
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [observation, setObservation] = React.useState<WarehousePreparationObservation>({ phase: 'services' });
  const [completedWarehouse, setCompletedWarehouse] = React.useState<
    | {
        destination: string;
        corpus: CompletedScaleCorpus;
        preparationMilliseconds: number;
      }
    | undefined
  >(undefined);
  React.useEffect(() => {
    const abort = new AbortController();
    let mounted = true;
    let rejectionObserved = false;
    let transportRejection: unknown;
    const rootChecks: WarehousePreparationDiagnostic[] = [];
    const diagnosticHost = globalThis as typeof globalThis & {
      __TAU_WAREHOUSE_PREPARATION_TEST__?: { snapshot: () => unknown };
    };
    const privateDiagnostic = {
      snapshot: (): unknown => ({
        transportRejection: rejectionObserved
          ? { status: 'observed', error: transportRejection }
          : { status: 'not-observed' },
        rootChecks: rootChecks.map((diagnostic) =>
          diagnostic.phase === 'pre-close-refusal' || diagnostic.phase === 'fresh-root-refusal'
            ? { phase: diagnostic.phase, error: diagnostic.evidence }
            : diagnostic,
        ),
      }),
    };
    diagnosticHost.__TAU_WAREHOUSE_PREPARATION_TEST__ = privateDiagnostic;
    const prepare = async (): Promise<void> => {
      try {
        await whenServicesReady();
        abort.signal.throwIfAborted();
        const snapshot = fileManagerRef.getSnapshot();
        const { openFileSystemBridge: opener, openComputeBinding } = snapshot.context;
        if (!snapshot.matches('ready') || !opener) {
          throw new Error('The actual warehouse project filesystem is unavailable.');
        }
        const isCurrent = (): boolean => {
          const current = fileManagerRef.getSnapshot();
          return current.matches('ready') && current.context.openFileSystemBridge === opener;
        };
        const subscription = fileManagerRef.subscribe(() => {
          if (!isCurrent()) {
            abort.abort(new Error('The captured warehouse project owner was replaced.'));
          }
        });
        const onPhase = (next: WarehousePreparationObservation): void => {
          try {
            if (mounted && isCurrent()) {
              setObservation(next);
            }
          } catch {
            // A retired view's observation cannot change preparation or cleanup.
          }
        };
        onPhase({ phase: 'services-ready' });
        const computeMode = getComputeReuseMode();
        let computeConnection: { compute: ComputeBinding; dispose: () => void } | undefined;
        let corpus: CompletedScaleCorpus;
        try {
          computeConnection = computeMode === 'durable' ? openComputeBinding?.(preparation.projectId) : undefined;
          const options = await localKernelOptions(preparation.projectId, undefined, computeMode)();
          corpus = await prepareScaleCorpus({
            fixture: preparation.fixture,
            publicationPath: preparation.publicationPath,
            signal: abort.signal,
            isCurrent,
            onPhase,
            onDiagnostic: (diagnostic) => {
              if (!mounted) {
                return;
              }
              if (diagnostic.phase === 'transport-rejection') {
                rejectionObserved = true;
                transportRejection = diagnostic.evidence;
              } else {
                rootChecks.push(diagnostic);
              }
            },
            openProjectBridge: (consumer) => opener(`/projects/${preparation.projectId}`, consumer),
            kernelOptions: (deps) => options({ ...deps, compute: computeConnection?.compute }),
          });
        } finally {
          subscription.unsubscribe();
          computeConnection?.dispose();
        }
        abort.signal.throwIfAborted();
        if (!isCurrent()) {
          throw new Error('The completed warehouse project owner was replaced before handoff.');
        }
        setCompletedWarehouse({
          destination: preparation.destination,
          corpus,
          preparationMilliseconds: performance.now() - preparation.started,
        });
      } catch (preparationError) {
        // Unmount revokes the attempt; a live owner replacement remains an explicit preparation failure.
        if (mounted) {
          setError(
            abort.signal.aborted
              ? 'Warehouse preparation was cancelled.'
              : preparationError instanceof Error
                ? preparationError.message
                : String(preparationError),
          );
        }
      }
    };
    void prepare();
    return () => {
      mounted = false;
      abort.abort();
      if (diagnosticHost.__TAU_WAREHOUSE_PREPARATION_TEST__ === privateDiagnostic) {
        delete diagnosticHost.__TAU_WAREHOUSE_PREPARATION_TEST__;
      }
    };
  }, [fileManagerRef, preparation, whenServicesReady]);

  if (error) {
    return (
      <>
        <output aria-label='Warehouse preparation phase'>{JSON.stringify(observation)}</output>
        <div role='alert'>{error}</div>
      </>
    );
  }

  if (completedWarehouse) {
    return (
      <main className='flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6'>
        <output aria-label='Completed warehouse corpus'>{JSON.stringify(completedWarehouse)}</output>
        <Link to={completedWarehouse.destination}>Open completed warehouse</Link>
      </main>
    );
  }

  return (
    <>
      <output aria-label='Warehouse preparation phase'>{JSON.stringify(observation)}</output>
      <Loader />
    </>
  );
};

const ProjectFileTreeDebugRoute = (): React.JSX.Element => {
  const { connectWorkspace, createProject, projectManagerRef } = useProjectManager();
  const navigate = useNavigate();
  const [searchParameters] = useSearchParams();
  const workspaceFixture = searchParameters.get('workspace') ?? undefined;
  /**
   * Seeds the project the way the home composer does: a pending first message
   * plus the one-shot `startupRequest` that hydration replays. That dispatch is
   * the only one that never runs `withWorkspace`, so it is the only way to
   * exercise the seeded-turn admission path end to end. Browser-host placement
   * is seeded with it because the e2e stack has no API runner (and the agent
   * picker cannot offer browser-host from the homepage, where no project exists).
   */
  const seededPrompt = searchParameters.get('prompt') ?? undefined;
  const mainFixture = searchParameters.get('main') ?? undefined;
  const prepareWarehouse = mainFixture === 'scale-100k' && searchParameters.get('prepare') === '1';
  const requestedBackend = searchParameters.get('graphicsBackend');
  const graphicsBackend = requestedBackend === 'webgl' || requestedBackend === 'webgpu' ? requestedBackend : undefined;
  const bulkFileCount = readCount(searchParameters.get('files'), 2000);
  const binaryMib = readCount(searchParameters.get('binaryMib'), 64);
  /* The composer without a seeded turn: the branch picker is the only
   * always-reachable *New branch* in a one-branch project (W7 review R1), so a
   * fixture that needs branches has to be able to open the composer without
   * also starting an agent run. */
  const chatOpen = searchParameters.get('chat') === '1';
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [warehousePreparation, setWarehousePreparation] = React.useState<WarehousePreparation | undefined>(undefined);
  const seedStarted = React.useRef(false);
  const [creationOwner, setCreationOwner] = React.useState<CreateProjectOptions | undefined>(undefined);
  const [seedFailure, setSeedFailure] = React.useState<
    | {
        reason: 'workspace-unavailable' | 'filesystem-error' | 'identity-conflict' | 'local-state-error' | 'unknown';
        cause:
          | 'AbortError'
          | 'NotFoundError'
          | 'QuotaExceededError'
          | 'InvalidStateError'
          | 'SecurityError'
          | 'NotAllowedError'
          | 'error'
          | 'non-error'
          | 'missing';
      }
    | undefined
  >(undefined);
  const creation = useSelector(projectManagerRef, (snapshot) => selectProjectCreation(snapshot, creationOwner));
  const creationUnavailable = useSelector(
    projectManagerRef,
    (snapshot) => snapshot.status === 'active' && snapshot.context.creationUnavailable,
  );
  const seedObservation = {
    status: creation ? 'pending' : creationUnavailable ? 'overlap-unavailable' : 'unavailable',
    ...(creation
      ? {
          phase: creation.phase,
          projectId: creation.projectId,
          operationId: creation.operationId,
          backend: creation.backend,
        }
      : {}),
    ...(seedFailure ? { lateFailure: seedFailure } : {}),
  };

  React.useEffect(() => {
    if (seedStarted.current) {
      return;
    }
    seedStarted.current = true;

    // An OPFS subdirectory handle *is* a FileSystemDirectoryHandle, so it seeds
    // a genuine webaccess workspace through production APIs without a picker.
    const resolveLocation = async (): Promise<ProjectCreationLocation> => {
      if (!workspaceFixture) {
        return homeProjectCreationLocation;
      }
      if (!validWorkspaceFixture.test(workspaceFixture)) {
        throw new Error(`Invalid workspace fixture: ${workspaceFixture}`);
      }
      const root = await navigator.storage.getDirectory();
      const connected = await connectWorkspace(await root.getDirectoryHandle(workspaceFixture, { create: true }));
      if (!connected) {
        throw new Error(`Workspace fixture ${workspaceFixture} did not connect`);
      }
      return { kind: 'workspace', workspaceId: connected.workspace.workspaceId };
    };

    /* S19's fault, reachable after the seed navigates into the project. */
    Object.assign(globalThis, { __tauE2eHoldProjectFile: holdProjectFile });

    const seed = async (): Promise<void> => {
      try {
        const started = performance.now();
        const scale = isScaleFixtureName(mainFixture) ? createScaleFixture(mainFixture) : undefined;
        const publicationPath =
          prepareWarehouse && scale
            ? `.tau/artifacts/reusable-parts/${await sha256String(scale.entryPath)}/scene.json`
            : undefined;
        const movingLinks = mainFixture === 'moving-links-100' ? createMovingLinksFixture() : undefined;
        const files =
          mainFixture === 's13-parity'
            ? createBatchingParityFixture()
            : (movingLinks?.files ?? scale?.files ?? buildSeedFiles(bulkFileCount, binaryMib));
        if (mainFixture === 'physical-assembly') {
          // The existing host produces the immutable records and native/display assets.
          const assembly = {
            schemaVersion: 1,
            parts: { inspection: { source: { path: 'public/models/physical-inspection.js' } } },
            occurrences: [
              { id: 'inspection', part: 'inspection', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
            ],
          } satisfies AuthoredAssembly;
          files['physical/assembly.json'] = { content: encode(JSON.stringify(assembly)) };
        }
        if (mainFixture === 'preview-assembly-secondary') {
          // Keep the SVG main asset cold; both reusable definitions belong to the secondary pin.
          files['preview/body.js'] = {
            content: encode(`import { makeBaseBox } from 'replicad';
export default function main() {
  return [
    { shape: makeBaseBox(26, 20, 24), name: 'Known housing', density: 1.55 },
    { shape: makeBaseBox(10, 8, 6).translate([40, 0, 0]), name: 'Unknown density' },
  ];
}
`),
          };
          files['preview/face.js'] = {
            content: encode(`import { drawRectangle } from 'replicad';
export default function main() {
  return { shape: drawRectangle(10, 8).sketchOnPlane().face(), name: 'Open face' };
}
`),
          };
          const assembly = {
            schemaVersion: 1,
            parts: {
              body: { source: { path: 'preview/body.js' } },
              face: { source: { path: 'preview/face.js' } },
            },
            occurrences: [
              { id: 'body-left', part: 'body', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
              { id: 'body-right', part: 'body', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.08, 0, 0, 1] },
              { id: 'face-left', part: 'face', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.04, 0, 1] },
              { id: 'face-right', part: 'face', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.08, 0.04, 0, 1] },
            ],
          } satisfies AuthoredAssembly;
          files['preview/assembly.json'] = { content: encode(JSON.stringify(assembly)) };
        }
        const creationInput = {
          location: await resolveLocation(),
          project: publicationPath
            ? { ...createSeedProject(mainFixture), assets: { main: { entryPath: publicationPath } } }
            : createSeedProject(mainFixture),
          activeKernel: scale ? 'jscad' : 'replicad',
          files,
          ...(seededPrompt === undefined
            ? {}
            : {
                initialMessage: { content: seededPrompt },
                activeExecution: { kind: 'tau', model: seededModel },
              }),
          editorState: {
            panelState: {
              desktopLayout: {
                chatOpen: seededPrompt !== undefined || chatOpen,
                workbenchOpen: true,
                workbenchWidth: 460,
                compactAuxiliary: 'workbench',
              },
            },
          },
        } satisfies CreateProjectOptions;
        if (prepareWarehouse) {
          setCreationOwner(creationInput);
        }
        const project = await createProject(creationInput);

        const destination = projectUrl(project.slugs);
        if (publicationPath && scale) {
          setWarehousePreparation({
            projectId: project.id,
            fixture: scale,
            publicationPath,
            started,
            destination: graphicsBackend ? `${destination}?graphicsBackend=${graphicsBackend}` : destination,
          });
          return;
        }
        void navigate(graphicsBackend ? `${destination}?graphicsBackend=${graphicsBackend}` : destination);
      } catch (seedError) {
        if (prepareWarehouse) {
          let reason: NonNullable<typeof seedFailure>['reason'] = 'unknown';
          if (seedError instanceof Error && seedError.name === 'PendingProjectRecoveryError') {
            switch (seedError.message) {
              case 'workspace-unavailable':
              case 'filesystem-error':
              case 'identity-conflict':
              case 'local-state-error': {
                reason = seedError.message;
                break;
              }
              default: {
                break;
              }
            }
          }
          let cause: NonNullable<typeof seedFailure>['cause'] = 'missing';
          if (seedError instanceof Error && seedError.cause !== undefined) {
            cause = seedError.cause instanceof Error ? 'error' : 'non-error';
            if (seedError.cause instanceof DOMException) {
              switch (seedError.cause.name) {
                case 'AbortError':
                case 'NotFoundError':
                case 'QuotaExceededError':
                case 'InvalidStateError':
                case 'SecurityError':
                case 'NotAllowedError': {
                  cause = seedError.cause.name;
                  break;
                }
                default: {
                  break;
                }
              }
            }
          }
          setSeedFailure({ reason, cause });
        }
        setError(seedError instanceof Error ? seedError.message : String(seedError));
      }
    };

    void seed();
  }, [connectWorkspace, createProject, graphicsBackend, mainFixture, navigate, prepareWarehouse, workspaceFixture]);

  if (error) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-background p-6'>
        {prepareWarehouse ? (
          <output aria-label='Warehouse preparation phase'>{JSON.stringify(seedObservation)}</output>
        ) : undefined}
        <div role='alert' className='max-w-lg rounded-md border bg-card p-4 text-sm text-card-foreground shadow-sm'>
          {error}
        </div>
      </main>
    );
  }

  if (warehousePreparation) {
    return (
      <HomeFileManagerProvider
        key={warehousePreparation.projectId}
        projectId={warehousePreparation.projectId}
        rootDirectory={`/projects/${warehousePreparation.projectId}`}
      >
        <WarehouseCorpusPreparation preparation={warehousePreparation} />
      </HomeFileManagerProvider>
    );
  }

  return (
    <main className='flex min-h-screen items-center justify-center bg-background'>
      {prepareWarehouse ? (
        <output aria-label='Warehouse preparation phase'>{JSON.stringify(seedObservation)}</output>
      ) : undefined}
      <Loader />
    </main>
  );
};

export default ProjectFileTreeDebugRoute;
