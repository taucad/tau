# STEP reader regression

`intersecting-cylinders.step` is an original Replicad AP242 export of the warehouse eye bolt at diameter `4.800000000000001`, length `24`, head diameter `24`, and bore `14` millimetres. It joins a chamfered shaft to a transverse annulus.

The saved interchange bytes reproduce a native stack overflow inside `BSplCLib::Interpolate` during `ShapeFix::SameParameter` with Emscripten's default 64 KiB stack. An unchecked build reports a later misleading libc++ numeric-formatting trap. The reader regression loads these exact bytes without requiring a CAD authoring runtime.

The independent expected envelope is 24 × 4.8 × 43.2 mm, with one solid. The original authoring source is `packages/warehouse/parts/eye-bolt/main.ts`; the fixture remains fixed when that family changes.
