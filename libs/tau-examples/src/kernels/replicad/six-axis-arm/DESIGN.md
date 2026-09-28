# Six-Axis Arm

## Design Brief

A compact six-revolute articulated arm of the common industrial layout: base yaw, shoulder pitch, elbow pitch, forearm roll, wrist pitch and flange roll, with the last three axes intersecting at the wrist centre (spherical wrist). It is a kinematic demonstrator and inverse-kinematics fixture, not a load-rated manipulator: motors, gearboxes, bearings and cabling are represented by housings only.

### Assembly Tree

- Base pedestal: one revolved section, Ø220 foot flange, Ø160 column to z = 110 mm, Ø60 cable bore, four Ø13.5 mm M12 anchor holes on PCD 196 mm.
- Turret: revolved Ø180 turntable (z = 111–150 mm) with a two-cheek clevis around the shoulder axis; Shoulder motor housing on the +Y cheek.
- Upper arm: Ø110 shoulder hub between the clevis cheeks and two tapered 20 mm side plates with a lightening window; Elbow motor housing on the +Y plate.
- Forearm: Ø80 elbow boss between the upper-arm plates and the fixed half of the Ø56 roll tube.
- Wrist housing: rolling half of the tube, Ø64 roll collar and a wrist clevis around the wrist centre.
- Wrist pitch body: Ø40 pitch hub between the wrist cheeks and a stepped nose (Ø28, Ø44) to the tool flange.
- Tool flange (Ø60 × 10 mm) and Gripper (body and two parallel fingers).

### Parameters And Relationships

- `height` = shoulder-axis height $h$ (200–400 mm, default 300).
- `reach` = shoulder-to-elbow plus elbow-to-wrist-centre length (480–720 mm, default 560), split equally: $L_2 = L_3 = reach/2$.
- Wrist centre to tool-flange face: 70 mm.
- `j1`–`j6`: joint angles in degrees that pose the as-built model (default 0, the home pose: upper arm vertical, forearm and tool along +X). Each must lie within its limit.
- Running gaps of 1–2 mm separate each rotating hub from its clevis cheeks and each roll pair along its axis.

### Mechanism

`main.ts` exports `mechanism(params)`. Axes and origins below are in the home frame; the mechanism carries each joint through its ancestors' parameter angles so origins and axes are expressed in the as-built frame, and each link's reference pose is identity. Coordinates are deltas from the as-built angles, so each exported limit is the absolute travel minus that joint's parameter angle.

| Joint | Motion         | Parent → child      | Axis | Origin (home)          | Travel        |
| ----- | -------------- | ------------------- | ---- | ---------------------- | ------------- |
| `j1`  | base yaw       | base → turret       | +Z   | (0, 0, 0)              | −170° … +170° |
| `j2`  | shoulder pitch | turret → upper-arm  | +Y   | (0, 0, $h$)            | −90° … +120°  |
| `j3`  | elbow pitch    | upper-arm → forearm | +Y   | (0, 0, $h+L_2$)        | −150° … +150° |
| `j4`  | forearm roll   | forearm → wrist     | +X   | (0, 0, $h+L_2$)        | −180° … +180° |
| `j5`  | wrist pitch    | wrist → hand        | +Y   | ($L_3$, 0, $h+L_2$)    | −120° … +120° |
| `j6`  | flange roll    | hand → tool         | +X   | ($L_3+70$, 0, $h+L_2$) | −360° … +360° |

Positive `j2`, `j3` and `j5` pitch forward and down (right-hand rule about +Y). Links: base (Base pedestal), turret (Turret, Shoulder motor), upper-arm (Upper arm, Elbow motor), forearm (Forearm), wrist (Wrist housing), hand (Wrist pitch body), tool (Tool flange, Gripper). The `wave` clip rises out of the as-built pose (`j2` −15°, `j3` −45°), swings the turret ±35° and flicks the wrist, ping-ponging over 3 s.

### Materials And Surface Treatments

- Pedestal, turret and arm castings: cast aluminium, powder coated (graphite, orange, amber, teal, blue and violet per link for legibility).
- Motor housings: black anodised; tool flange: machined steel; gripper: painted aluminium.

### Verification Targets

- Home envelope x −110…411, y −110…126, z 0…620 mm.
- Closed solids; ten uniquely named occurrences.
- Tool flange centre at (346, 0, 580) mm at home and (−66, 560, 300) mm for `j1` 90°, `j2` 90°, `j3` −90°, `j4` 90°, `j5` 90°, which checks the sign and origin of five joints against forward kinematics.
- No component interference at either pose; four-hole anchor pattern; valid millimetre BRep.
- Static geometry checks only: reach under load, stiffness, joint torques and collision-free motion across the full travel are not certified.
