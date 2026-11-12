---
viewer: minor
camera: minor
---

The viewer's React event-layer ceiling is empty, with three named exceptions (G12); the helper-hidden effects the React policy records as debt remain. The SVG view's panzoom, resize and fit run in an adapter its `<svg>` ref callback hands graphics (`svgViewAttached`), and Fit sends it `fit`. A presented glTF scene's pose composer, playback demand frame and visibility listener run in an adapter its ref callback hands graphics (`kinematicsSceneAttached`). Graphics loads each committed unit's mechanism into its kinematics child, clears the unit it replaces and clears the mechanism when the artifact clears or becomes a drawing. The presentation host subscribes to matcap loads and analyses a presented scene's section topology on `analyse`, which graphics sends when a section is armed or a scene commits under one. The measure tool stamps measurements with the pose revision graphics folds.

Every graphics owner machine, and the camera, now declares a root `onError` that records the first defect it catches in a `fault` context field and stays in place. Such a defect no longer reaches XState's unhandled-error reporting, and the camera actor (with the `@taucad/three` rig that follows it) stays `active` after a defect, such as a failed host update, where it used to stop with `status: 'error'`.

Behaviour changes: unmounting the glTF mesh ends a part drag (`interruptGesture`) and keeps the mechanism and its coordinates, where it used to clear them. A new 2D drawing starts a new pan and zoom adapter that resumes the view, so a pan or pinch in progress when it arrives ends. Some camera validation messages are shorter.

Breaking: `GraphicsEvent` adds `svgViewAttached`, `svgViewDetached`, `kinematicsSceneAttached` and `kinematicsSceneDetached`; `PresentationHostCommand` and `PresentationEvent` add `analyse`; `GraphicsContext` adds `svgView`, `kinematicsScene` and `kinematicsUnitId`; every exported owner-machine context, `GraphicsContext` and `PresentationContext` among them, adds an optional `fault`.
