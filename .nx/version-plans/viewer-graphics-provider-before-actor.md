---
viewer: minor
---

`GraphicsProvider` takes `graphicsRef: undefined` and presents nothing until the view has a graphics actor, so a host can lay out the content under it before the actor exists and keep that content's identity when it arrives. `useOptionalGraphics` and `useOptionalGraphicsSelector` read the view's graphics, or a fallback, under such a provider.
