// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- pointA/pointB are existing exact-measurement transport fields. */
import { describe, expect, it, vi } from 'vitest';
import { evaluateExactOccurrenceDistance } from './measurement-exact.worker.js';
import type { ExactRequest } from './measurement-exact.worker.js';

type ExactEngine = Awaited<ReturnType<NonNullable<Parameters<typeof evaluateExactOccurrenceDistance>[1]>>>;

const query = vi.hoisted(() => vi.fn());
vi.mock('@taucad/agent-tools/geospec', () => ({ queryDirectAp242MinimumDistance: query }));

const request: ExactRequest = {
  id: 17,
  source: { format: 'ap242', bytes: new TextEncoder().encode('STEP'), coordinateSystem: 'y-up' },
  occurrences: [{ name: 'left' }, { name: 'right' }],
};

describe('isolated exact measurement worker', () => {
  it('should publish native canonical witnesses in metres and close its dedicated engine', async () => {
    const close = vi.fn();
    const engine = { close };
    query.mockResolvedValueOnce({
      status: 'complete',
      fact: {
        source: 'ap242', assurance: 'exact-brep', unit: 'mm', coordinateSystem: 'z-up',
        subjectHash: 'a'.repeat(64), algorithmProfile: 'geospec-minimum-distance-v1',
        occurrences: ['left-path', 'right-path'], distance: 20,
        points: [[10, 5, 15], [30, 5, 15]],
      },
    });

    await expect(evaluateExactOccurrenceDistance(request, async () => engine as unknown as ExactEngine)).resolves.toEqual({
      id: 17, status: 'cad-geometry', source: 'ap242', distanceMeters: 0.02,
      pointAMeters: [0.01, 0.005, 0.015], pointBMeters: [0.03, 0.005, 0.015],
    });
    expect(query).toHaveBeenCalledWith({
      engine, ap242Bytes: request.source.bytes, nameA: 'left', nameB: 'right',
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('should keep native refusal unavailable and close its dedicated engine', async () => {
    const close = vi.fn();
    const engine = { close };
    query.mockResolvedValueOnce({ status: 'refused', code: 'invalid-selection', message: 'Ambiguous occurrence.' });

    await expect(evaluateExactOccurrenceDistance(request, async () => engine as unknown as ExactEngine)).resolves.toEqual({
      id: 17, status: 'unavailable', reason: 'Ambiguous occurrence.',
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
