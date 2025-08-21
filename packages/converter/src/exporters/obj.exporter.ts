import type { Object3D } from 'three';
import { OBJExporter } from 'three/addons';
import { BaseExporter } from '#exporters/base.exporter.js';
import type { OutputFile } from '#types.js';

/**
 * Three.js OBJ exporter implementation.
 * Exports 3D objects to Wavefront OBJ format.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- OBJ is a valid abbreviation
export class ObjExporter extends BaseExporter {
  private readonly exporter: OBJExporter;

  public constructor() {
    super();
    this.exporter = new OBJExporter();
  }

  public async parseAsync(object: Object3D, _options?: unknown): Promise<OutputFile[]> {
    const result = this.exporter.parse(object);
    const objData = new TextEncoder().encode(result);
    
    // TODO: In future, could split materials into separate .mtl file
    return [this.createOutputFile('model', 'obj', objData)];
  }
}
