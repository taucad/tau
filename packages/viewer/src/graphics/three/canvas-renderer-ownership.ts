import type { RendererInstance } from '#graphics/three/renderer.js';

type CanvasOwner = {
  renderer: RendererInstance | undefined;
  invalidate: () => void;
  disposed: boolean;
  previous: CanvasOwner | undefined;
};
type RendererLease = ((renderer: RendererInstance) => void) & { cancel: () => void };
type ExtensionLookup = { get: (name: string) => unknown };
const owners = new WeakMap<HTMLCanvasElement, CanvasOwner>();

type FallbackState = {
  currentBlendingEnabled: boolean;
  currentClippingPlanes: number;
  currentDepthReversed: boolean;
  currentDrawbuffers: WeakMap<WebGLFramebuffer, unknown>;
  resetVertexState: () => void;
  setReversedDepth: (reversed: boolean) => void;
};

function isFallbackState(value: unknown): value is FallbackState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'currentBlendingEnabled' in value &&
    typeof value.currentBlendingEnabled === 'boolean' &&
    'currentClippingPlanes' in value &&
    typeof value.currentClippingPlanes === 'number' &&
    'currentDepthReversed' in value &&
    typeof value.currentDepthReversed === 'boolean' &&
    'currentDrawbuffers' in value &&
    value.currentDrawbuffers instanceof WeakMap &&
    'resetVertexState' in value &&
    typeof value.resetVertexState === 'function' &&
    'setReversedDepth' in value &&
    typeof value.setReversedDepth === 'function'
  );
}

function resetFallbackState(renderer: RendererInstance, canvas: HTMLCanvasElement): void {
  if (!('backend' in renderer)) {
    return;
  }
  const { backend } = renderer;
  if (!('isWebGLBackend' in backend) || !backend.isWebGLBackend) {
    return;
  }
  if (!('state' in backend) || !isFallbackState(backend.state)) {
    throw new Error('Expected initialized Three WebGL fallback state.');
  }
  const previousState = backend.state;
  // Three r184 has no public fallback reset. Recreate only its state cache with
  // the installed backend's own constructor; GPU resources and utilities stay
  // owned by that backend. Utilities read backend.state on each operation.
  const state: unknown = Reflect.construct(previousState.constructor, [backend]);
  if (!isFallbackState(state)) {
    throw new Error('Unexpected Three WebGL fallback state contract.');
  }
  const context = canvas.getContext('webgl2');
  if (!context) {
    throw new Error('Expected a WebGL fallback context.');
  }
  // These caches have non-null initial values. Match the driver before letting
  // subsequent draws repopulate the remaining program/binding/material caches.
  context.disable(context.BLEND);
  state.currentBlendingEnabled = false;
  state.currentClippingPlanes = -1;
  // Draw-buffer selections belong to each framebuffer, not the shared context.
  // Three sets these before rebinding an existing target, so retain that table.
  state.currentDrawbuffers = previousState.currentDrawbuffers;
  state.resetVertexState();
  if (context.getExtension('EXT_clip_control')) {
    state.currentDepthReversed = !previousState.currentDepthReversed;
    state.setReversedDepth(previousState.currentDepthReversed);
  }
  backend.state = state;
}

function isExtensionLookup(value: unknown): value is ExtensionLookup {
  return typeof value === 'object' && value !== null && 'get' in value && typeof value.get === 'function';
}

function resetSurvivor(canvas: HTMLCanvasElement, retired: CanvasOwner): void {
  let survivor = owners.get(canvas);
  // Pending leases retain context-loss authority, but the preceding ready
  // renderer can still draw until their replacement is initialized.
  while (survivor && (survivor.disposed || !survivor.renderer)) {
    survivor = survivor.previous;
  }
  if (survivor?.renderer && survivor !== retired) {
    if ('resetState' in survivor.renderer) {
      survivor.renderer.resetState();
    } else {
      resetFallbackState(survivor.renderer, canvas);
    }
    survivor.invalidate();
  }
}

/**
 * Claims a canvas before asynchronous construction starts. The lease, rather than
 * completion order, decides which renderer may release the shared WebGL context.
 * @param canvas - The actual canvas shared by successive owners.
 * @param invalidate - Requests a frame after restoring a surviving renderer's state.
 * @returns An attachment function for the constructed renderer.
 */
export function claimCanvasRenderer(canvas: HTMLCanvasElement, invalidate: () => void): RendererLease {
  const previous = owners.get(canvas);
  const owner: CanvasOwner = { renderer: undefined, invalidate, disposed: false, previous };
  owners.set(canvas, owner);
  const attach = (renderer: RendererInstance): void => {
    owner.renderer = renderer;
    const canLoseContext = (): boolean => !owners.has(canvas) || owners.get(canvas) === owner;
    let contextLost = false;
    if ('forceContextLoss' in renderer) {
      const forceContextLoss = renderer.forceContextLoss.bind(renderer);
      renderer.forceContextLoss = () => {
        if (!contextLost && canLoseContext()) {
          contextLost = true;
          forceContextLoss();
        }
      };
    }
    const dispose: () => unknown = renderer.dispose.bind(renderer);
    let disposal: void | Promise<unknown>;
    renderer.dispose = (): void | Promise<unknown> => {
      if (owner.disposed) {
        return disposal;
      }
      owner.disposed = true;
      if (owners.get(canvas) === owner) {
        owners.delete(canvas);
      }
      // Three r184's initialized WebGL fallback releases its context *inside*
      // backend.dispose(). Keep that implementation (and all resource cleanup),
      // gating only this backend's lookup, never the shared native extension.
      const backend = 'backend' in renderer ? renderer.backend : undefined;
      const extensions =
        backend && 'isWebGLBackend' in backend && backend.isWebGLBackend && 'extensions' in backend
          ? backend.extensions
          : undefined;
      const lookup = isExtensionLookup(extensions) ? extensions : undefined;
      const originalGet = lookup?.get;
      const getDescriptor = lookup ? Object.getOwnPropertyDescriptor(lookup, 'get') : undefined;
      if (lookup && originalGet) {
        lookup.get = (name) => {
          const extension = originalGet.call(lookup, name);
          if (
            name !== 'WEBGL_lose_context' ||
            typeof extension !== 'object' ||
            extension === null ||
            !('loseContext' in extension) ||
            typeof extension.loseContext !== 'function'
          ) {
            return extension;
          }
          const { loseContext } = extension;
          return {
            loseContext: () => {
              if (canLoseContext()) {
                Reflect.apply(loseContext, extension, []);
              }
            },
          };
        };
      }
      const finish = (): void => {
        owner.renderer = undefined;
        if (lookup && originalGet) {
          if (getDescriptor) {
            Object.defineProperty(lookup, 'get', getDescriptor);
          } else {
            Reflect.deleteProperty(lookup, 'get');
          }
        }
        resetSurvivor(canvas, owner);
      };
      try {
        const result: unknown = dispose();
        if (typeof result === 'object' && result !== null && 'then' in result && typeof result.then === 'function') {
          const settleDisposal = async (): Promise<unknown> => {
            try {
              return await Promise.resolve(result);
            } finally {
              finish();
            }
          };
          disposal = settleDisposal();
          return disposal;
        }
      } catch (error) {
        finish();
        throw error;
      }
      finish();
    };
    // A late constructor can reset shared GL defaults before its factory settles.
    resetSurvivor(canvas, owner);
  };
  return Object.assign(attach, {
    cancel: () => {
      owner.disposed = true;
      if (owners.get(canvas) === owner) {
        let survivor = owner.previous;
        while (survivor?.disposed) {
          survivor = survivor.previous;
        }
        owner.previous = survivor;
        if (survivor) {
          owners.set(canvas, survivor);
        } else {
          owners.delete(canvas);
        }
      }
      resetSurvivor(canvas, owner);
    },
  });
}
