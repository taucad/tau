import { Vector2, WebGLRenderer } from 'three';
import { WebGLBackend, WebGPUBackend } from 'three/webgpu';
import type { RendererInstance } from '@taucad/viewer/graphics/three/renderer';

/** A snapshot of the live renderer, independent of the requested backend. */
export type WorkspaceRendererIdentity = Readonly<{
  api: 'webgl' | 'webgpu' | 'unknown';
  effectiveBackend: 'webgl-classic' | 'webgl2-node' | 'webgpu-native' | 'unknown';
  name: string;
  frame: number;
  drawingBuffer: Readonly<{ width: number; height: number }>;
  cssSize: Readonly<{ width: number; height: number }>;
  pixelRatio: number;
}>;

/** Read only on demand; never create a probe context or infer API from the node renderer's class name. */
export function getWorkspaceRendererIdentity(renderer: RendererInstance): WorkspaceRendererIdentity {
  const classic = renderer instanceof WebGLRenderer;
  const effectiveBackend = classic
    ? 'webgl-classic'
    : renderer.backend instanceof WebGPUBackend
      ? 'webgpu-native'
      : renderer.backend instanceof WebGLBackend
        ? 'webgl2-node'
        : 'unknown';
  const api = effectiveBackend === 'webgpu-native' ? 'webgpu' : effectiveBackend === 'unknown' ? 'unknown' : 'webgl';
  const context = classic ? renderer.getContext() : undefined;
  const debug = context?.getExtension('WEBGL_debug_renderer_info');
  const size = renderer.getSize(new Vector2());
  return {
    api,
    effectiveBackend,
    name: debug ? String(context?.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? '') : '',
    frame: classic ? renderer.info.render.frame : renderer.info.frame,
    drawingBuffer: { width: renderer.domElement.width, height: renderer.domElement.height },
    cssSize: { width: size.x, height: size.y },
    pixelRatio: renderer.getPixelRatio(),
  };
}
