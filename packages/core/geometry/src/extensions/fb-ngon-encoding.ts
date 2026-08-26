/* eslint-disable @typescript-eslint/naming-convention -- glTF-Transform requires static EXTENSION_NAME. */
import { Extension } from '@gltf-transform/core';

/**
 * The glTF-Transform warning-suppression stub for Blender's `FB_ngon_encoding`.
 *
 * @public
 */
export class FbNgonEncodingExtension extends Extension {
  public static override readonly EXTENSION_NAME = 'FB_ngon_encoding';
  public override readonly extensionName = 'FB_ngon_encoding';

  /**
   */
  public override read(): this {
    return this;
  }

  /**
   */
  public override write(): this {
    return this;
  }
}
