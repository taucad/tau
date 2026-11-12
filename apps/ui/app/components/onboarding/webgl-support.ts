/**
 * Whether this browser can create a WebGL context. The probe's context is released at once, so setup never holds one
 * of the browser's limited contexts for it.
 *
 * @returns Whether WebGL is available.
 */
export const canCreateWebGl = (): boolean => {
  if (typeof WebGLRenderingContext === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== null;
  } catch {
    return false;
  }
};
