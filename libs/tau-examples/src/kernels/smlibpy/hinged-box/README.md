# Hinged box — SMLibPy

An original Tau example (Apache-2.0): a shelled walnut box whose lid opens on a three-knuckle brass hinge, the Python port of the SMLib WebAssembly `hinged-box` example. The model is built closed; the module's `mechanism(params)` function returns Tau's shared kinematics schema (the same as SMLib, Replicad and PicoVoxel) to add the motion.

- Links: `body` (box, two body knuckles, hinge pin) and `lid` (lid, lid knuckle, knob).
- Joint: `hinge`, revolute about the pin axis behind the back wall, from `0` (closed) to `max_opening` degrees.
- Animation: `Open and close`, four seconds, opening fully, holding and closing.

Geometry uses millimetres, Z-up. Drive the joint in the Kinematics pane, then Play, scrub and Reset. GLB and glTF exports carry the mechanism only with `content: { includeTopology: true }`; STL and STEP are static. Expected cost: light.
