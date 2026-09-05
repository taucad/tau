# Geometry UI

This subtree renders CAD geometry and coordinates viewport interaction. Geometry state belongs to the sibling graphics and editor machines; runtime artifacts are inputs, not mutable UI-owned geometry.

## Rendering Rules

- Consume `resolvedGraphicsBackend`. Public interactive viewers resolve to WebGL; WebGPU remains an internal validation path.
- Create renderers through `graphics/three/renderer.ts`. Key `ThreeCanvasInstance` by backend so a backend change recreates renderer-owned state.
- Keep synchronous base capability checks separate from exact asynchronous diagnostics. Do not advertise a capability from a heuristic that the renderer has not verified.
- Preserve reversed-depth transparent sorting for the WebGPU viewport. Keep highlight and ghost materials explicit about depth writes.
- Keep one camera, controls, and gizmo lifecycle per canvas. Schedule renderer work through the existing demand-frame invalidation path.
- Isolate offscreen capture state, clone shared materials before mutation, and dispose renderer-owned resources on every teardown path.
- Put pointer and gesture transitions in the owning XState machine; keep raycast helpers deterministic and free of hidden global state.

The complete shader, renderer, capture, cache, lifecycle, and parity contract is [Graphics Backend Policy](../../../../../docs/policy/graphics-backend-policy.md).

## Checks

Run targeted UI tests for the changed renderer or interaction module, then `pnpm nx lint ui` and `pnpm nx typecheck ui`. Validate renderer changes in each affected backend and browser path.
