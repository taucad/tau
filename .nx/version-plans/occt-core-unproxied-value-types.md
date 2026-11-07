---
occt-core: patch
---

`wrapOcForExceptions` and `wrapOcWithTracing` return OCCT `gp` value types (`gp_Pnt`, `gp_Vec`, `gp_Dir`, `gp_XYZ`, `gp_XY`, their 2D forms, `gp_Trsf`, `gp_Trsf2d`, `gp_Ax1`, `gp_Ax2`, `gp_Ax3`, `gp_Ax2d`, `gp_Mat` and `gp_Quaternion`) without an exception proxy, so hot loops that read points and vectors stop paying a proxy, a method map and a try/catch per call. Calls on every other OCCT object still convert a thrown C++ exception to a named `OcKernelError`; a method of a `gp` value type that throws now surfaces the raw `WebAssembly.Exception`.
