---
viewer: minor
---

The section handles' pointer input is a gesture machine. `sectionInputMachine` (`idle → hovering → pressed → dragging`, context `hovered`, `hoveredTile`, `press`) decides what each press, move, release and cut change means, and invokes one DOM adapter per surface (`createSectionInputAdapter`), a callback actor that holds the surface, the drawing, the plane picker, R3F's root and the camera rig in its closure and registers the handles' nine pointer listeners once. `SectionHandles` keeps no effect that sends, subscribes or times: it builds the drawing, lays it out each frame and starts the section input keyed by its host objects.

A render-frame rebase or a bounds change mid-drag no longer ends the drag: the adapter re-lays the drawing in place, at the next frame or at the first press, hover pick, drag step or tile click before it, and keeps the drag's anchor in metres. A hovered handle that is no longer drawn unlinks its cut's chip. The plane picker's click reads the view direction from the Three camera. An unmount gives the pointer and the camera controls back a microtask later, as every `useActorRef` actor stops.
