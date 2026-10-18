# Hinged box

An original Tau example (Apache-2.0): a shelled walnut box whose lid opens on a three-knuckle brass hinge. The SMLib model is built closed; the module's `mechanism` export (Tau's shared kinematics schema, the same as Replicad and PicoVoxel) adds the motion.

- Links: `body` (box, two body knuckles, hinge pin) and `lid` (lid, lid knuckle, knob).
- Joint: `hinge`, revolute about the pin axis behind the back wall, from `0` (closed) to `maxOpening` degrees.
- Animation: `Open and close`, four seconds, opening fully, holding and closing.

Geometry uses millimetres, Z-up. Parameters size the box (`length`, `width`, `height`, `wall`, `lidThickness`), the hinge barrel (`hingeRadius`) and the opening limit (`maxOpening`). Drive the joint in the Kinematics pane, then Play, scrub and Reset. GLB/glTF exports carry the mechanism only with `content: { includeTopology: true }`; STL and STEP are static.

`libs/tau-examples/src/smlib-examples.test.ts` checks the delivered part names, the admitted mechanism and the open pose through the public runtime. Expected cost: light.
