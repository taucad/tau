import { describe, expect, it } from 'vitest';

import { createRuntimeWorker } from '@taucad/runtime/worker';
import { runtime } from './runtime-definition.js';

describe('Electron utility kernel host runtime', () => {
  it('owns the OpenSCAD runtime definition in the utility process', () => {
    const worker = createRuntimeWorker({ runtime });

    expect(runtime.kernels.map((kernel) => kernel.id)).toEqual(['openscad']);
    expect(runtime.middleware).toEqual([]);
    expect(runtime.bundlers).toEqual([]);
    expect(worker).toMatchObject({
      name: 'KernelRuntimeWorker',
    });
  });
});
