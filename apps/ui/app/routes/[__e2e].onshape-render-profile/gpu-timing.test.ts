import type { WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createFrameGpuTimer } from '#routes/[__e2e].onshape-render-profile/gpu-timing.js';

describe('createFrameGpuTimer', () => {
  it('should collect only completed valid samples, bound pending queries and dispose every owned query', () => {
    const getExtension = vi.fn();
    const getQuery = vi.fn();
    // eslint-disable-next-line @typescript-eslint/naming-convention -- These are the Khronos extension's enum names.
    const extension = { TIME_ELAPSED_EXT: 0x88_bf, GPU_DISJOINT_EXT: 0x8f_bb, QUERY_COUNTER_BITS_EXT: 0x88_64 };
    /* eslint-disable @typescript-eslint/naming-convention -- The WebGL context exposes these Khronos enum names. */
    const gl = mock<WebGL2RenderingContext>({
      CURRENT_QUERY: 0x88_65,
      QUERY_RESULT: 0x88_66,
      QUERY_RESULT_AVAILABLE: 0x88_67,
      // oxlint-disable-next-line typescript/no-unsafe-return -- Preserve WebGL's overloaded extension signatures around the configured Vitest mock.
      getExtension: (name) => getExtension(name),
      // oxlint-disable-next-line typescript/no-unsafe-return -- Preserve WebGL's numeric and query-object overloads around the configured Vitest mock.
      getQuery: (target, parameter) => getQuery(target, parameter),
    });
    /* eslint-enable @typescript-eslint/naming-convention -- End WebGL enum fixture. */
    const renderer = mock<WebGLRenderer>();
    renderer.getContext.mockReturnValue(gl);
    getExtension.mockReturnValue(extension);
    const samples = new Map<WebGLQuery, { available: boolean; nanoseconds: number }>();
    let active: WebGLQuery | undefined;
    let disjoint = false;
    getQuery.mockImplementation((_target: number, parameter: number) =>
      parameter === extension.QUERY_COUNTER_BITS_EXT ? 64 : (active ?? null),
    );
    gl.getParameter.mockImplementation(() => disjoint);
    gl.createQuery.mockImplementation(() => {
      const query = mock<WebGLQuery>();
      samples.set(query, { available: false, nanoseconds: 2_500_000 });
      return query;
    });
    gl.beginQuery.mockImplementation((_target, query) => {
      active = query;
    });
    gl.endQuery.mockImplementation(() => {
      active = undefined;
    });
    gl.getQueryParameter.mockImplementation((query, parameter) => {
      const sample = samples.get(query)!;
      if (parameter === gl.QUERY_RESULT_AVAILABLE) {
        return sample.available;
      }
      expect(sample.available).toBe(true);
      return sample.nanoseconds;
    });

    const timer = createFrameGpuTimer(renderer)!;
    expect(timer.support).toEqual({ extension: 'EXT_disjoint_timer_query_webgl2', counterBits: 64 });
    expect(timer.begin()).toBe(true);
    expect(timer.begin()).toBe(false);
    timer.end();
    expect(timer.poll()).toEqual({ milliseconds: [], pending: 1, disjointDiscarded: 0 });
    for (const sample of samples.values()) {
      sample.available = true;
    }
    expect(timer.poll()).toEqual({ milliseconds: [2.5], pending: 0, disjointDiscarded: 0 });

    for (let index = 0; index < 8; index++) {
      expect(timer.begin()).toBe(true);
      timer.end();
    }
    expect(timer.begin()).toBe(false);
    disjoint = true;
    expect(timer.poll()).toEqual({ milliseconds: [], pending: 0, disjointDiscarded: 8 });
    disjoint = false;

    const externalQuery = mock<WebGLQuery>();
    active = externalQuery;
    expect(timer.begin()).toBe(false);
    expect(active).toBe(externalQuery);
    active = undefined;
    expect(timer.begin()).toBe(true);
    timer.end();
    expect(timer.begin()).toBe(true);
    timer.dispose();
    timer.dispose();
    expect(active).toBeUndefined();
    expect(timer.begin()).toBe(false);
    expect(timer.poll()).toEqual({ milliseconds: [], pending: 0, disjointDiscarded: 8 });
    expect(gl.deleteQuery).toHaveBeenCalledTimes(samples.size);
    for (const query of samples.keys()) {
      expect(gl.deleteQuery.mock.calls.filter(([deleted]) => deleted === query).length).toBe(1);
    }
    expect(gl.finish).not.toHaveBeenCalled();
    expect(gl.clientWaitSync).not.toHaveBeenCalled();
  });

  it('should report unsupported when the extension is unavailable', () => {
    const gl = mock<WebGL2RenderingContext>();
    const renderer = mock<WebGLRenderer>();
    renderer.getContext.mockReturnValue(gl);
    gl.createQuery.mockReturnValue(mock<WebGLQuery>());
    gl.getExtension.mockReturnValue(null);
    expect(createFrameGpuTimer(renderer)).toBeUndefined();
    expect(gl.getExtension).toHaveBeenCalledWith('EXT_disjoint_timer_query_webgl2');
    expect(gl.createQuery).not.toHaveBeenCalled();
  });
});
