package BenchViceSystem {
    private import ScalarValues::*;

    doc /* BV-125: fixed-base, manually operated bench vice. All length attributes
      ending Mm are millimetres, force N, torque Nm. Right-handed CAD frame:
      X opens the jaws; Y spans the jaws; Z is up. Fixed gripping plane X=0,
      bench plane Z=0. Nominal configuration: 55 mm opening, 125 mm jaw width.
      Geometry implementation: main.ts. Verification: main.geospec.ts.
      Textual notation follows the OMG SysML v2 release examples:
      https://github.com/Systems-Modeling/SysML-v2-Release/tree/master/sysml/src/examples/Simple%20Tests
    */

    part def Component {
        attribute material : String;
        attribute quantity : Integer = 1;
    }
    part def Vice {
        attribute jawWidthMm : Real = 125;
        attribute jawHeightMm : Real = 30;
        attribute openingMm : Real = 55;
        attribute maxOpeningMm : Real = 100;
        attribute guideClearanceMm : Real = 0.10;
        attribute leadMm : Real = 4;
        attribute designClampForceN : Real = 3000;
        attribute maximumInputTorqueNm : Real = 15;
        part frame : Component { :>> material = "Ductile iron, painted blue; machined mounting face"; }
        part carriage : Component { :>> material = "Ductile iron, painted blue"; }
        part jaws : Component[2] { :>> material = "Hardened tool steel"; }
        part guides : Component[2] { :>> material = "Ground steel, 20 mm diameter"; }
        part bushes : Component[2] { :>> material = "Bearing bronze"; }
        part spindle : Component { :>> material = "Alloy steel; custom trapezoidal 20 x 4 thread"; }
        part driveNut : Component { :>> material = "Bearing bronze"; }
        part thrustWashers : Component[2] { :>> material = "Hardened bearing steel"; }
        part hub : Component { :>> material = "Steel"; }
        part hubPin : Component { :>> material = "Hardened steel"; }
        part handle : Component { :>> material = "Steel, permanently retained end knobs"; }
        part jawScrews : Component[4] { :>> material = "M6 socket screws, simplified thread envelopes"; }
        part nutScrews : Component[2] { :>> material = "M6 socket screws, simplified thread envelopes"; }
    }
    part vice : Vice;

    requirement <R01> inventory {
        doc /* Exactly 21 named, independently inspectable closed solids; one
          frame, carriage, spindle, nut, hub, pin and handle; two jaws, guides,
          bushes and washers; four jaw screws and two nut screws. */
        subject system : Vice;
    }
    requirement <R02> mounting {
        doc /* Rounded 145 x 176 x 16 base, X=-90..55, Y=-88..88. Four
          vertical 11 mm through holes at X=-72,35 and Y=-70,70, with
          20 mm diameter x 11 mm deep bolt-head counterbores. Installed heads
          shall fit within diameter 19.5 mm and height 10.5 mm, below Z=16.
          Bench front edge shall be at or behind X=55 to clear the handle.
          Bench bolts and bench are installation interfaces, outside the assembly. */
        subject system : Vice;
    }
    requirement <R03> gripping {
        doc /* Two removable 125 x 30 x 6 jaws, Z=82..112, with 0.6 mm-deep
          grooves at 5 mm pitch and two recessed M6 fasteners per jaw.
          Fixed gripping plane X=0; moving gripping plane X=openingMm. */
        subject system : Vice;
        require constraint { system.jawWidthMm >= 100 and system.jawWidthMm <= 150 }
    }
    requirement <R04> travel {
        doc /* Continuous 0..100 mm travel, checked at 0,25,55,100 mm.
          Rear guide shoulders contact the bush flanges at 100 mm as end stops.
          Guide engagement remains at least 59 mm at maximum opening. */
        subject system : Vice;
        require constraint { system.openingMm >= 0 and system.openingMm <= system.maxOpeningMm }
    }
    requirement <R05> guidance {
        doc /* Two 20 mm guide rods, Y=+/-43, Z=50, with 61 mm flanged bronze
          bushes. Radial running clearance adjustable 0.05..0.25 mm. Guide
          ends are pressed 30 mm into carriage blind sockets with 0.02 mm
          radial interference. */
        subject system : Vice;
        require constraint { system.guideClearanceMm >= 0.05 and system.guideClearanceMm <= 0.25 }
    }
    requirement <R06> drive {
        doc /* Custom right-hand trapezoidal lead screw: 20 mm major diameter,
          16 mm root diameter, 4 mm lead. Explicit helical ridge and matching
          bronze nut cavity; axial phase is maintained as the jaw opens.
          Nut barrel X=-65..-18, radius 15, flange X=-71..-65 radius 26.
          This is a custom profile, not a certified standard thread. */
        subject system : Vice;
        require constraint { system.leadMm == 4 }
    }
    requirement <R07> thrustRetention {
        doc /* A 34 mm spindle shoulder, two 34/20.6 x 3 mm thrust washers,
          a separate 32 mm hub and a 4.02 mm transverse retention pin capture
          the carriage in both axial directions. The pin is pressed into a
          4.00 mm hub hole and clears the 4.2 mm spindle cross-hole. */
        subject system : Vice;
    }
    requirement <R08> operation {
        doc /* Sliding 12 mm tommy bar through a 12.3 mm hub bore. Permanent
          20 mm end knobs prevent withdrawal. Handle offset supports +/-60 mm.
          The rotating assembly is clocked horizontal at opening 55 mm;
          rotationDeg = 90 * (openingMm - 55). Handle material stays ahead
          of X=openingMm+59, at least 4 mm clear of the base front edge.
          No bench collision when installed at the required bench edge. */
        subject system : Vice;
    }
    requirement <R09> fastening {
        doc /* Four jaw screws and two flange screws include recessed hex
          sockets, shaft clearances, and positive head bearing surfaces.
          Commodity M6 screw and tapped-hole threads are envelope models. */
        subject system : Vice;
    }
    requirement <R10> quality {
        doc /* Each named component shall be one valid BRep solid, watertight,
          of positive bounded volume. STEP evidence shall be in mm. */
        subject system : Vice;
    }
    requirement <R11> fit {
        doc /* No unintended solid-volume overlap at sampled travel and handle
          positions; allow only guide-to-carriage and hub-pin press fits.
          Touching bearing and fastener faces are intentional. */
        subject system : Vice;
    }
    requirement <R12> variants {
        doc /* Jaw widths 100..150 mm, opening 0..100 mm, handle offsets
          -60..60 mm and guide clearances 0.05..0.25 mm. Reject non-finite
          and out-of-range inputs, and unknown component selections. */
        subject system : Vice;
    }
    requirement <R13> physicalQualification {
        doc /* Before manufacture/release: validate 3 kN clamp capacity at no
          more than 15 Nm input, proof load, jaw parallelism under load,
          fatigue, buckling, pin shear, press-fit retention, lubrication,
          wear, tolerances and mounting substrate. These require analysis
          and/or physical tests and are NOT satisfied by geometric GeoSpec. */
        subject system : Vice;
    }

    satisfy inventory by vice;
    satisfy mounting by vice;
    satisfy gripping by vice;
    satisfy travel by vice;
    satisfy guidance by vice;
    satisfy drive by vice;
    satisfy thrustRetention by vice;
    satisfy operation by vice;
    satisfy fastening by vice;
    satisfy quality by vice;
    satisfy fit by vice;
    satisfy variants by vice;

    verification geometryVerification {
        subject system = vice;
        objective {
            verify inventory; verify mounting; verify gripping; verify travel;
            verify guidance; verify drive; verify thrustRetention;
            verify operation; verify fastening; verify quality;
            verify fit; verify variants;
        }
        doc /* Executable evidence is main.geospec.ts. Exact feature matchers
          verify mounting, bores and bearing planes. Thread topology, volume
          and interference are geometric proxies; pitch/profile metrology
          and physical performance remain separate acceptance activities. */
    }
    verification physicalVerification {
        subject system = vice;
        objective { verify physicalQualification; }
        doc /* Pending engineering analysis and instrumented prototype tests. */
    }
}
