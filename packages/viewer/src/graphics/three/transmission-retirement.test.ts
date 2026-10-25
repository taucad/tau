import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { RenderTarget } from 'three';
import { ViewportTextureNode } from 'three/webgpu';
import { viewportOpaqueMipTexture } from 'three/tsl';
import { expect, it, vi } from 'vitest';
import { retireTransmissionCopy } from '#graphics/three/transmission-retirement.js';

it('should retire only the viewport copy belonging to the disposed scene pass', () => {
  const retired = new RenderTarget();
  const surviving = new RenderTarget();
  const node = viewportOpaqueMipTexture();
  expect(node).toBeInstanceOf(ViewportTextureNode);
  if (!(node instanceof ViewportTextureNode)) {
    throw new Error('Unexpected viewport texture implementation');
  }
  const retiredCopy = node.getTextureForReference(retired);
  const survivingCopy = node.getTextureForReference(surviving);
  const released = vi.fn();
  const untouched = vi.fn();
  retiredCopy.addEventListener('dispose', released);
  survivingCopy.addEventListener('dispose', untouched);
  retireTransmissionCopy(retired);
  expect(released).toHaveBeenCalledOnce();
  expect(untouched).not.toHaveBeenCalled();
  expect(node.getTextureForReference(surviving)).toBe(survivingCopy);
  survivingCopy.removeEventListener('dispose', untouched);
  survivingCopy.dispose();
  retiredCopy.removeEventListener('dispose', released);
  retired.dispose();
  surviving.dispose();
});

it('should pin the upstream viewport-copy and transmission ownership contract', () => {
  const require = createRequire(import.meta.url);
  expect(
    createHash('sha256')
      .update(readFileSync(require.resolve('three/src/nodes/display/ViewportTextureNode.js')))
      .digest('hex'),
  ).toBe('81ad0e0845f9144fc42f1bdb1605c2ac537bbf15db62e30f66d15a0f5e437194');
  expect(
    createHash('sha256')
      .update(readFileSync(require.resolve('three/src/nodes/functions/PhysicalLightingModel.js')))
      .digest('hex'),
  ).toBe('54d0110e6433551a4c5dda746c2ff665fba1c260c98c04bfeb044736a01154f8');
});
