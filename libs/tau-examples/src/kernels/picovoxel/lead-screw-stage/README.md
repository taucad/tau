# Lead screw stage

An original Tau example (Apache-2.0): a blue frame holds two steel guide rails and a handwheel-driven spindle. A bronze drive nut travels with the carriage. The spindle rotates about X and drives the carriage by `lead / 360` mm per degree. Threads are represented by that kinematic relation; the shaft geometry is smooth. This is a motion demonstration, not a manufactured thread or collision certification.

Geometry uses millimetres, Z-up. `carriagePosition` is the as-built travel position; Reset returns there. `travel` is at most 40 mm and `lead` defaults to 4 mm/revolution. The four-second Traverse clip visits both ends and returns to the initial position. Change the driver in the Kinematics pane, then Play, scrub and Reset. The follower moves automatically.

`voxelSize` defaults to 0.75 mm. Finer grids cost more memory and time. Every part has an explicit shared name and a standard glTF PBR material; the three links carry the frame, spindle assembly and carriage assembly. The kernel receives only plain mechanism data, and the example uses Tau's passed Pico session.

GLB/glTF exports retain motion only when requested with `content: { includeTopology: true }`. Default exports and STL carry static geometry. Preview playback changes transforms without remeshing.

Run geometry acceptance from the Tau root:

```bash
node --import tsx packages/geospec-engine/src/cli/main.ts run libs/tau-examples/src/kernels/picovoxel/lead-screw-stage --test-timeout 300000 --workers 1 --json
```

`libs/tau-examples/src/picovoxel-kinematics.test.ts` checks the delivered topology, materials, parameter-dependent limits, coupled pose and Reset through the public runtime.
