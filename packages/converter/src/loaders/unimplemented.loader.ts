import type { Object3D } from 'three';
import type { InputFormat, InputFile } from '#types.js';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

type UnimplementedOptions = {
  format: InputFormat;
};

/**
 * Loader for formats that are not yet implemented or have known issues.
 * Throws descriptive errors when attempting to load these formats.
 */
export class UnimplementedLoader extends ThreeJsBaseLoader<Object3D, UnimplementedOptions> {
  private readonly errorMessage: string;

  /**
   * @param errorMessage - The specific error message to throw when this loader is used
   */
  public constructor(errorMessage: string) {
    super();
    this.errorMessage = errorMessage;
  }

  protected async parseAsync(_files: InputFile[], _options: UnimplementedOptions): Promise<Object3D> {
    throw new Error(this.errorMessage);
  }

  protected mapToObject(parseResult: Object3D): Object3D {
    // This method should never be reached due to parseAsync throwing,
    // but we need to implement it to satisfy the abstract base class
    return parseResult;
  }
}
