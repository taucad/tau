import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { glbToDocument, validateGlbData } from '@taucad/runtime-testing';
import type { ExportFile } from '@taucad/runtime/types';
import type { TranscoderRuntime } from '@taucad/runtime/transcoder';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createAssimp } from 'libassimp';
import type { Assimp, AssimpFile } from 'libassimp';

import { assimpTranscoder } from '#assimp.transcoder.js';

const runtime: TranscoderRuntime = {
  logger: {
    log: () => undefined,
    debug: () => undefined,
    trace: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    custom: () => undefined,
  },
  tracer: { startSpan: () => ({ end: () => undefined }) },
  signal: new AbortController().signal,
};

const definition = await resolveRuntimePluginDefinition('transcoder', assimpTranscoder());
let fullAssimp!: Assimp;
let context!: Awaited<ReturnType<typeof definition.initialize>>;
let sources!: Readonly<Record<'glb' | 'gltf', ExportFile[]>>;

const toExportFiles = (files: readonly AssimpFile[]): ExportFile[] =>
  files.map(({ name, bytes }) => ({
    name,
    bytes: new Uint8Array(bytes),
    mimeType: 'application/octet-stream',
  }));

const triangleCount = async (bytes: Uint8Array<ArrayBuffer>): Promise<number> => {
  const document = await glbToDocument(bytes);
  let count = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indexCount = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
      count += indexCount / 3;
    }
  }
  return count;
};

beforeAll(async () => {
  [fullAssimp, context] = await Promise.all([createAssimp(), definition.initialize({}, runtime)]);
  const objectBytes = new Uint8Array(readFileSync(new URL('fixtures/cube.obj', import.meta.url)));
  const glb = await fullAssimp.convert([{ name: 'cube.obj', bytes: objectBytes }], { to: 'glb' });
  const gltf = await fullAssimp.convert(glb.files, { to: 'gltf' });
  sources = { glb: toExportFiles(glb.files), gltf: toExportFiles(gltf.files) };
}, 120_000);

afterAll(async () => {
  await definition.cleanup?.(context);
  fullAssimp.dispose();
});

describe('assimp transcoder integration', () => {
  it('preserves cube topology through every advertised edge', async () => {
    await Promise.all(
      definition.edges.map(async (edge) => {
        if (edge.from !== 'glb' && edge.from !== 'gltf') {
          throw new Error(`Unexpected Assimp source edge: ${edge.from}`);
        }
        const result = await definition.transcode(
          { from: edge.from, to: edge.to, files: sources[edge.from], options: {} },
          runtime,
          context,
        );
        if (!result.success) {
          throw new Error(`${edge.from} -> ${edge.to}: ${result.issues.map(({ message }) => message).join('; ')}`);
        }

        if (edge.to === 'step') {
          const step = result.data.find(({ name }) => name.endsWith('.step'));
          if (step === undefined) {
            throw new Error(`${edge.from} -> step: no normalized STEP file`);
          }
          const text = new TextDecoder().decode(step.bytes);
          expect(text.startsWith('ISO-10303-21;\nHEADER;'), `${edge.from} -> step header`).toBe(true);
          expect(text.match(/^#\d+=FACE_SURFACE/gmu), `${edge.from} -> step faces`).toHaveLength(12);
          expect(text).toContain('CLOSED_SHELL');
          return;
        }

        let roundTrip: { readonly files: readonly AssimpFile[] };
        try {
          roundTrip =
            edge.to === 'glb'
              ? { files: result.data }
              : await fullAssimp.convert(
                  result.data.map(({ name, bytes }) => ({ name, bytes })),
                  { to: 'glb' },
                );
        } catch (error) {
          throw new Error(`${edge.from} -> ${edge.to}: re-import failed`, { cause: error });
        }
        const glb = roundTrip.files.find(({ name }) => name.endsWith('.glb'));
        if (glb === undefined) {
          throw new Error(`${edge.from} -> ${edge.to}: round trip returned no GLB`);
        }
        const glbBytes = new Uint8Array(glb.bytes);
        validateGlbData(glbBytes);
        expect(await triangleCount(glbBytes), `${edge.from} -> ${edge.to}`).toBe(12);
      }),
    );
  }, 120_000);
});
