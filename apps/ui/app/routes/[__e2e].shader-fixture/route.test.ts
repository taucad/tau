import { describe, expect, it } from 'vitest';
import { resolveShaderFixtureBackend } from '#routes/[__e2e].shader-fixture/route.js';

describe('shader fixture backend detection', () => {
  it('uses Three backend semantics when constructor names are minified', () => {
    expect(resolveShaderFixtureBackend({ constructor: { name: 'a' }, isWebGPUBackend: true })).toBe('webgpu');
    expect(resolveShaderFixtureBackend({ constructor: { name: 'WebGPUBackend' }, isWebGPUBackend: false })).toBe(
      'common-webgl',
    );
  });
});
