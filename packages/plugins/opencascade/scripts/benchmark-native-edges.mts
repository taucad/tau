/* oxlint-disable no-console, new-cap, no-await-in-loop -- A benchmark prints its timings and drives the raw OCCT API in sequence. */
/**
 * Native B-rep edges against the fallback `GltfEdgeDetection` pass, on one model near 450,000 triangles.
 *
 * The fallback route is what the runtime runs for a kernel that does not claim `includeEdges`: the
 * kernel renders without lines and the middleware detects dihedral edges over every triangle. The
 * native route renders with `includeEdges` and samples the B-rep edges. Informational, not a gate.
 *
 * Usage: pnpm nx run opencascade:benchmark-native-edges [-- --iterations 5]
 */
import process from 'node:process';
import { parseArgs } from 'node:util';
import { Primitive } from '@gltf-transform/core';
import { createNodeIo } from '@taucad/geometry-core';
import { gltfEdgeDetection } from '@taucad/middleware';
import { initOcct, occtExplicitTessellationDefaults } from '@taucad/occt-core';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { OpenCascadeInstance } from 'libcascade/init';
import { renderShapesWithinBudget } from '#opencascade-mesh.js';
import type { ShapeEntry } from '#opencascade.types.js';

const { values } = parseArgs({ options: { iterations: { type: 'string', default: '5' } } });
const iterations = Number(values.iterations);

/** A 12 × 12 plate of bosses, each a cylinder with a coaxial bore and a torus collar: many curved faces and edges. */
const buildModel = (oc: OpenCascadeInstance): ShapeEntry[] => {
  const entries: ShapeEntry[] = [];
  for (let row = 0; row < 12; row++) {
    for (let column = 0; column < 12; column++) {
      const origin = new oc.gp_Pnt(column * 30, row * 30, 0);
      const direction = new oc.gp_Dir(0, 0, 1);
      const axes = new oc.gp_Ax2(origin, direction);
      const boss = new oc.BRepPrimAPI_MakeCylinder(axes, 10, 20);
      const bore = new oc.BRepPrimAPI_MakeCylinder(axes, 4, 20);
      const collar = new oc.BRepPrimAPI_MakeTorus(axes, 10, 2);
      const progress = new oc.Message_ProgressRange();
      const cut = new oc.BRepAlgoAPI_Cut(boss.Shape(), bore.Shape(), progress);
      const fused = new oc.BRepAlgoAPI_Fuse(cut.Shape(), collar.Shape(), progress);
      entries.push({ name: `Boss ${String(row * 12 + column + 1)}`, shape: fused.Shape() });
    }
  }
  return entries;
};

const lineCount = async (glb: Uint8Array<ArrayBuffer>): Promise<number> => {
  const io = await createNodeIo();
  const document = await io.readBinary(glb);
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .filter((primitive) => primitive.getMode() === Primitive.Mode['LINES'])
    .reduce((total, primitive) => total + primitive.getAttribute('POSITION')!.getCount() / 2, 0);
};

const median = (samples: number[]): number => {
  const sorted = [...samples].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/**
 * The median and rounded samples of one timing.
 *
 * @param samples - Durations in milliseconds.
 * @returns The rounded median and samples, in milliseconds.
 */
const summarize = (samples: number[]): { median: number; samples: number[] } => ({
  median: Math.round(median(samples)),
  samples: samples.map((sample) => Math.round(sample)),
});

const main = async (): Promise<void> => {
  const bindings = await import('libcascade/single/init');
  const oc = await initOcct<OpenCascadeInstance>(
    new URL(import.meta.resolve('libcascade/wasm')).href,
    bindings.default,
  );
  const shapes = buildModel(oc);
  const request = {
    tessellation: { linearTolerance: 0.06, angularTolerance: 24 },
    explicitDefaults: occtExplicitTessellationDefaults.preview,
  } as const;
  const detector = await resolveRuntimePluginDefinition('middleware', gltfEdgeDetection());
  const quiet = (): void => undefined;
  // The pass reads only its options and logger; the runtime's other services are not used.
  const runtime = {
    options: { thresholdDegrees: 30 },
    logger: { trace: quiet, debug: quiet, log: quiet, info: quiet, warn: quiet, error: quiet },
  } as unknown as Parameters<NonNullable<typeof detector.wrapRender>>[2];

  const render: number[] = [];
  const detection: number[] = [];
  const native: number[] = [];
  let report = { triangles: 0, fallbackLines: 0, nativeLines: 0 };
  for (let iteration = 0; iteration < iterations; iteration++) {
    let started = performance.now();
    const plain = await renderShapesWithinBudget(oc, shapes, { request, budget: Number.POSITIVE_INFINITY });
    render.push(performance.now() - started);
    started = performance.now();
    const detected = await detector.wrapRender!(
      { view: 'model', mimeType: 'model/gltf-binary', options: {}, content: { includeEdges: true } },
      async () => ({ success: true, data: { mimeType: 'model/gltf-binary', content: plain.content }, issues: [] }),
      runtime,
    );
    detection.push(performance.now() - started);

    started = performance.now();
    const drawn = await renderShapesWithinBudget(oc, shapes, {
      request,
      budget: Number.POSITIVE_INFINITY,
      includeEdges: true,
    });
    native.push(performance.now() - started);

    if (!detected.success || !(detected.data.content instanceof Uint8Array)) {
      throw new Error('GltfEdgeDetection returned no GLB');
    }
    report = {
      triangles: drawn.tessellation.triangles,
      fallbackLines: await lineCount(detected.data.content),
      nativeLines: await lineCount(drawn.content),
    };
  }

  console.log(
    JSON.stringify(
      {
        model: '144 bored bosses with torus collars',
        tessellation: request.tessellation,
        iterations,
        ...report,
        timings: {
          unit: 'milliseconds',
          // The fallback route is a render without lines followed by the detection pass.
          renderWithoutEdges: summarize(render),
          fallbackDetection: summarize(detection),
          fallbackRoute: Math.round(median(render.map((value, index) => value + detection[index]!))),
          // The native route is one render with includeEdges; its edge cost is the difference to a render without.
          nativeRoute: summarize(native),
          nativeEdges: Math.round(median(native.map((value, index) => value - render[index]!))),
        },
      },
      undefined,
      2,
    ),
  );
};

await main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
