/** Identifies initialization failures that can retry through Tau's classic WebGL pipeline. */
export class WebGpuInitializationError extends Error {
  public override readonly name = 'WebGpuInitializationError';
}
