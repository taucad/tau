# Planetary Gear System

## Design Brief

An open, coaxial, three-planet spur-gear stage. The ring is fixed through six mounting holes; the integral sun shaft is the input, and the twin-plate carrier hub is the output. This is an inspectable gear-stage assembly, not an enclosed or load-rated gearbox.

### Assembly Tree

- Internal Ring Gear: 72 teeth, continuous mounting rim, six counterbored M5 clearance holes.
- Sun Gear And Input Shaft: integral 24-tooth gear, rear shaft with a machined keyseat and axial retaining-screw bore.
- Three Planet Gears: 24 teeth each, bronze flanged bushings, lower thrust washers.
- Carrier Rear: relieved three-arm steel spider.
- Carrier Front And Output Hub: matching spider, keyed hollow output interface and radial locking-screw hole.
- Three Planet Pins: hardened stepped pins with threaded axial ends.
- Six M5 Socket Screws: three per carrier face, socket recesses and head edge breaks.

### Parameters And Relationships

- Module $m=2$ mm; pressure angle $\alpha=20^\circ$.
- $Z_s=24$, $Z_p=24$, $Z_r=72=Z_s+2Z_p$.
- $d_s=d_p=48$ mm; $d_r=144$ mm; planet center radius $a=48$ mm.
- Three equally spaced planets satisfy $(Z_s+Z_r)/3=32$.
- Fixed-ring reduction $i=1+Z_r/Z_s=4$; carrier rotates in the same direction as the sun.
- Carrier angle $\theta_c=\theta_s/4$; absolute planet angle $\theta_p=7.5^\circ-\theta_s/2$.
- Ring tooth-space phase $2.5^\circ$.
- Working gear face width 14 mm; ring face width 16 mm.
- Standard full-depth addenda and 1.25-module dedenda; curved 0.6 mm root transitions. Involute flanks interpolated as single B-spline edges, not polygonal teeth.
- Tangential tooth-thickness reduction 0.10 mm per external gear; ring tooth spaces widened by 0.10 mm. Nominal pair backlash 0.20 mm at the pitch circle.
- Ring OD174 mm; 6 x diameter 5.5 mm holes on PCD162 mm, diameter 9.5 x 3 mm counterbores.
- Gear z=0..14 mm; rear carrier z=-8..-3 mm; front carrier z=17..22 mm; output hub to z=40 mm; input shaft to z=-28 mm.
- Input diameter 16 mm with 5 mm keyseat; output bore diameter 12 mm with 4 mm keyway.
- Planet gear bore diameter 14.03 mm; bushing OD14 / ID10.04 mm with an 18 mm flange; pin running diameter 10 mm, with 7.99 mm reduced ends located in reamed carrier bores. Retain the bushings with bearing-retaining compound on assembly. Pin shoulder faces leave 0.20 mm nominal clearance each side of the thrust stack.

### Mechanism

`main.ts` exports `mechanism(params)`, evaluated in the as-built frame for the current `inputAngle`.

| Joint         | Type     | Parent → child     | Axis and origin                                                     | Coupling                        |
| ------------- | -------- | ------------------ | ------------------------------------------------------------------- | ------------------------------- |
| `sun`         | revolute | ring → sun         | +Z through the origin                                               | driver                          |
| `carrier`     | revolute | ring → carrier     | +Z through the origin                                               | $\theta_c = \theta_s/4$         |
| `planet-1..3` | revolute | carrier → planet-i | +Z through pin i at radius $a$, angle $120^\circ(i-1)+\theta_c^{0}$ | $\theta_{p,rel} = -3\theta_s/4$ |

Links: ring (root, Internal Ring Gear); sun (Sun Gear And Input Shaft); carrier (both spiders, pins, thrust washers and spacers, screws and screw washers); planet-i (Planet Gear i and its retained Flanged Bushing i). The `four-sun-turns` clip turns the sun 1440° in 8 s, one carrier revolution, after which every link returns to its as-built pose.

### Materials And Surface Treatments

- Sun, planets, ring: machined 4140 steel; hob external teeth, wire-EDM or shape internal teeth; harden working flanks, finish bearing surfaces after heat treatment. Final heat treatment depends on duty.
- Carrier spiders/hub: 4140 steel, blue protective finish shown.
- Pins: hardened and ground bearing steel.
- Bushings and thrust washers: lubricated SAE 660 bronze.
- Purchased screws: black-oxide steel ISO 4762 M5 x 12, 4 mm hex socket. Threaded regions are nominal smooth envelopes; specify M5 x 0.8 in manufacturing documentation. Pin tapped bores are modeled at major-diameter envelope for assembly interference analysis, not tap-drill size.
- Deburr tooth face edges without altering the involute flank; grease teeth and bushings.

### Assembly Order

Install sun through the rear spider. Fit pins to the rear spider with three screws. Fit lower thrust washers, planet gears and flanged bushings, using the indexed tooth phases. Fit the front spider and three retaining screws. Mount the fixed ring through its six holes. Input/output bearings, supporting housing, seals, external shafts and mounting screws belong to the host installation and are not included.

### Verification Targets

- 174 x 174 x 68 mm overall envelope, z=-28..40 mm.
- Closed, noninterfering solids; all 22 named assembly components.
- Three planet positions at radius 48 mm with 120-degree symmetry.
- Ring mounting pattern, keyed shaft interfaces, bushings, pins, lightening slots and socket recesses.
- Exact BRep validity and units; face-width and kinematic-angle variant.
- No gear interference in the nominal and advanced poses. Static clearance tests do not certify dynamic contact stress, fatigue life, lubrication or load capacity; torque, speed, service life and host bearing loads remain unspecified.
