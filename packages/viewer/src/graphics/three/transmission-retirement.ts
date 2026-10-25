import type { RenderTarget } from 'three';
import { ViewportTextureNode } from 'three/webgpu';
import { viewportOpaqueMipTexture } from 'three/tsl';

/**
 * Release the front-side transmission copy owned by a retired scene target.
 * @param target - Retiring scene target.
 */
export function retireTransmissionCopy(target: RenderTarget): void {
  // Three r184 keeps this copy in the viewport singleton after PassNode disposal.
  // The accessor is public; source guards bind the shared front-side contract.
  // An unused copy has no GPU allocation. Other target references remain intact.
  const node = viewportOpaqueMipTexture();
  if (!(node instanceof ViewportTextureNode)) {
    throw new Error('Unsupported Three viewport-copy ownership');
  }
  node.getTextureForReference(target).dispose();
}
