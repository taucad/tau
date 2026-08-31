import { describe, expect, it } from 'vitest';
import { createCameraView } from '@taucad/camera';
import type { RenderFrame } from '@taucad/spatial';
import { createThreeCameraRig } from '#camera.js';

const percentile = (sorted: readonly number[], fraction: number): number =>
  sorted[Math.ceil(sorted.length * fraction) - 1]!;

const summarize = (values: readonly number[]): Readonly<{ mad: number; medianMs: number; p95Ms: number }> => {
  const sorted = [...values].sort((left, right) => left - right);
  const medianMs = percentile(sorted, 0.5);
  const deviations = values.map((value) => Math.abs(value - medianMs)).sort((left, right) => left - right);
  return { mad: percentile(deviations, 0.5), medianMs, p95Ms: percentile(sorted, 0.95) };
};

describe('Three render-frame update benchmark', () => {
  it('records camera synchronization median/p95/MAD without, with far-only, and with all-angle clipping', () => {
    const initialView = createCameraView({
      frameId: 'benchmark-root',
      requestedVerticalFieldOfView: 60,
      perspectiveZoom: 1,
      target: [10, 20, 0],
      direction: [1, -1, 0.5],
      up: [0, 0, 1],
      verticalSpan: 100,
      viewport: { width: 1536, height: 900, pixelRatio: 2 },
      bounds: { min: [-50, -25, -10], max: [50, 25, 10] },
    });
    const frames: readonly [RenderFrame, RenderFrame] = [
      { anchorFrameId: initialView.frameId, originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
      { anchorFrameId: initialView.frameId, originMeters: [10, 20, 0], metersPerRenderUnit: 1e-3 },
    ];
    const operations = [
      {
        name: 'actorUpdate',
        run: (rig: ReturnType<typeof createThreeCameraRig>, sample: number): void => {
          rig.actorRef.send({
            type: 'setView',
            target: sample % 2 === 0 ? initialView.target : [11, 20, 0],
            direction: sample % 2 === 0 ? initialView.direction : [1, -1, -0.5],
            up: initialView.up,
            verticalSpan: initialView.verticalSpan,
            perspectiveZoom: initialView.perspectiveZoom,
          });
        },
      },
      {
        name: 'viewportUpdate',
        run: (rig: ReturnType<typeof createThreeCameraRig>, sample: number): void => {
          rig.actorRef.send({
            type: 'setViewport',
            viewport: { width: 1536 + (sample % 2), height: 900, pixelRatio: 2 },
          });
        },
      },
      {
        name: 'orthographicCrossingUpdate',
        run: (rig: ReturnType<typeof createThreeCameraRig>, sample: number): void => {
          rig.actorRef.send({
            type: 'setView',
            target: initialView.target,
            direction: sample % 2 === 0 ? [1, -1, 0.01] : [1, -1, -0.01],
            up: initialView.up,
            verticalSpan: initialView.verticalSpan,
            perspectiveZoom: initialView.perspectiveZoom,
          });
        },
      },
      {
        name: 'renderFrameUpdate',
        run: (rig: ReturnType<typeof createThreeCameraRig>, sample: number): void => {
          rig.setRenderFrame(frames[sample % 2]!);
        },
      },
    ] as const;
    const results = Object.fromEntries(
      operations.map((operation) => {
        const cases = [
          { name: 'withoutPolicy', rig: createThreeCameraRig({ initialView }), timings: [] as number[] },
          {
            name: 'farOnly',
            rig: createThreeCameraRig({ initialView, clipPlanes: { farPaddingVerticalSpans: 4 } }),
            timings: [] as number[],
          },
          {
            name: 'allAngle',
            rig: createThreeCameraRig({
              initialView,
              clipPlanes: { farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 },
            }),
            timings: [] as number[],
          },
        ] as const;
        for (const benchmarkCase of cases) {
          benchmarkCase.rig.actorRef.start();
        }
        for (let warmup = 0; warmup < 100; warmup++) {
          for (const benchmarkCase of cases) {
            operation.run(benchmarkCase.rig, warmup);
          }
        }
        for (let sample = 0; sample < 1000; sample++) {
          for (let offset = 0; offset < cases.length; offset++) {
            const benchmarkCase = cases[(sample + offset) % cases.length]!;
            const started = performance.now();
            operation.run(benchmarkCase.rig, sample);
            benchmarkCase.timings.push(performance.now() - started);
          }
        }
        const operationResults = Object.fromEntries(cases.map(({ name, timings }) => [name, summarize(timings)]));
        for (const benchmarkCase of cases) {
          operation.run(benchmarkCase.rig, 1000);
          expect(benchmarkCase.rig.readState().target).toEqual(initialView.target);
          benchmarkCase.rig.dispose();
        }
        return [operation.name, operationResults];
      }),
    );
    console.log(
      JSON.stringify({
        case: 'three-render-frame-camera-update-v4',
        results,
        samples: 1000,
        warmups: 100,
      }),
    );
    expect(
      Object.values(results).every((operation) =>
        Object.values(operation).every(({ mad, medianMs, p95Ms }) => Number.isFinite(mad + medianMs + p95Ms)),
      ),
    ).toBe(true);
  });
});
