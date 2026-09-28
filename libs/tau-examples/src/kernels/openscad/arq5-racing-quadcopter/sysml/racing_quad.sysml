package AeroRacingQuad {
    doc /*
     * ARQ-5 aerodynamic 5-inch FPV racing quadrotor.
     * Frame of reference: +X forward (flight), +Y starboard, +Z up. Millimetres.
     * Process: PA12-CF SLS for printed structure (no bed flats required).
     * Props, motors, cells, and avionics are COTS, not printed.
     */

    // ---- Value types / datums ------------------------------------------------
    attribute def Millimetre :> ScalarValues::Real;
    attribute def Gram :> ScalarValues::Real;
    attribute def Kv :> ScalarValues::Real;
    attribute def Volt :> ScalarValues::Real;

    // ---- Requirements --------------------------------------------------------
    requirement def AeroSurfaces {
        doc /* Exterior printed skins use NACA 4-digit sections or bodies of
             * revolution derived from them. No aerodynamic stagnation flats
             * on the wetted surface. Internal DFM split faces may be planar. */
        require constraint { wettedFlats == 0 }
    }

    requirement def SpeedEnvelope {
        doc /* Level-flight design point 180 km/h; structural limit 220 km/h. */
        attribute minLevelSpeed : Real = 180.0;
    }

    requirement def PropulsionClass {
        doc /* 5-inch class: 220 mm motor diagonal, 127 mm 3-blade props, 2207 motors. */
        attribute motorDiagonal : Millimetre = 220.0;
        attribute propDiameter : Millimetre = 127.0;
    }

    requirement def Printability {
        doc /* PA12-CF SLS. Min wall 2.0 mm. M3 brass inserts at canopy and motor pods.
             * Cable ducts 3.5 mm through every arm. Split keel/canopy at Z = 4 mm. */
        attribute minWall : Millimetre = 2.0;
        attribute insertThread : String = "M3";
    }

    requirement def CoolingFlow {
        doc /* NACA submerged inlet on the belly feeds a through-duct over ESC/FC
             * and exhausts at the trailing edge. */
        attribute inletFamily : String = "NACA submerged";
    }

    requirement def MaterialFrame {
        doc /* Printed structure: PA12-CF, density 1.10 g/cm3, HDT ~170 C. */
        attribute process : String = "SLS";
        attribute alloy : String = "PA12-CF";
    }

    requirement def MaterialProp {
        doc /* Injection GF-nylon props. Printed props are not airworthy at 30k RPM. */
        attribute process : String = "Injection";
        attribute alloy : String = "GF-PA66";
    }

    requirement def DrawingReady {
        doc /* Datums: A = motor plane Z, B = centreline XZ, C = origin XY.
             * Fastener callouts ISO 4762 M3 and ISO 4026 inserts. */
    }

    // ---- Port definitions ----------------------------------------------------
    port def M3BoltPattern {
        attribute spacingX : Millimetre;
        attribute spacingY : Millimetre;
        attribute thread : String = "M3";
    }

    port def Shaft5mm {
        attribute diameter : Millimetre = 5.0;
    }

    port def PowerLead {
        attribute voltage : Volt;
    }

    port def FluidDuct {
        doc /* Internal cooling flow path. */
        attribute family : String = "NACA";
    }

    port def VideoLink {
        attribute band : String = "5.8 GHz";
    }

    // ---- Leaf parts: printed structure --------------------------------------
    part def FuselageKeel {
        doc /* Lower NACA 2425 half-body, battery bay, cooling duct, arm sockets. */
        attribute naca : String = "2425";
        attribute chord : Millimetre = 160.0;
        attribute width : Millimetre = 48.0;
        attribute wall : Millimetre = 2.0;
        port duct : FluidDuct;
        port splitFace;
    }

    part def FuselageCanopy {
        doc /* Upper NACA 2425 shell, avionics access, M3 insert bosses. */
        attribute naca : String = "2425";
        port splitFace;
    }

    part def NoseFairing {
        doc /* Forward NACA nose, gimbal bay, convex optical aperture. */
        attribute naca : String = "2425";
    }

    part def ArmSpar {
        doc /* NACA 0024 beam, chord aligned to flight +X, 3.5 mm cable duct. */
        attribute naca : String = "0024";
        attribute chord : Millimetre = 28.0;
        attribute span : Millimetre = 66.0;
        port cableDuct : FluidDuct;
    }

    part def MotorPod {
        doc /* NACA body-of-revolution pod, 16 x 19 mm M3 motor pattern. */
        attribute naca : String = "0090";
        port motorBolt : M3BoltPattern;
    }

    part def MotorSpinner {
        doc /* NACA spinner, clearance for M5 prop nut. */
        attribute naca : String = "0008";
    }

    part def LandingSkid {
        doc /* NACA 0012 rocker skid. */
        attribute naca : String = "0012";
    }

    part def BatteryLatch {
        doc /* Curved over-centre latch retaining the 6S pack. */
    }

    part def AntennaFairing {
        doc /* NACA 0015 teardrop over the tail antenna stub. */
        attribute naca : String = "0015";
    }

    part def OpticalWindow {
        doc /* Convex spherical camera window, 0.8 mm polycarbonate. */
    }

    part def GimbalPitchCradle {
        doc /* Fork carrying the roll ring, printed PA12-CF. */
    }

    part def GimbalRollRing {
        doc /* Inner roll stator housing. */
    }

    // ---- Leaf parts: propulsion COTS ----------------------------------------
    part def MotorStator {
        doc /* 2207 stator, 22 mm OD, 7 mm stack. */
        attribute od : Millimetre = 22.0;
        attribute stack : Millimetre = 7.0;
    }

    part def MotorMagnetRing {
        doc /* N52 tile ring inside the bell. */
        attribute id : Millimetre = 23.0;
    }

    part def MotorBell {
        doc /* 2207 aluminum bell, 27.8 mm OD. */
        attribute od : Millimetre = 27.8;
        port shaft : Shaft5mm;
    }

    part def MotorShaft {
        attribute diameter : Millimetre = 5.0;
        attribute length : Millimetre = 22.0;
    }

    part def MotorBearing {
        doc /* 5 x 11 x 4 mm radial bearing. */
    }

    part def MotorBase {
        doc /* 16 x 19 mm M3 pattern, 4 mm thick aluminum. */
        port motorBolt : M3BoltPattern;
    }

    part def PropHub {
        attribute diameter : Millimetre = 14.0;
    }

    part def PropBlade {
        doc /* NACA 4412, geometric pitch 5.1 in, root chord 22 mm, tip 9 mm. */
        attribute naca : String = "4412";
        attribute pitch : Millimetre = 129.54;
    }

    part def PropNut {
        doc /* M5 nyloc, 8 mm AF. */
    }

    // ---- Leaf parts: energy / avionics / payload ----------------------------
    part def BatteryPack {
        doc /* 6S 1100 mAh LiPo, 75 x 36 x 28 mm, rounded pouch. */
        port dc : PowerLead;
    }

    part def FlightController {
        doc /* 30.5 mm stack, 20 x 20 / 30.5 x 30.5 M3. */
    }

    part def EscStack {
        doc /* 4-in-1 60 A ESC under the FC. */
        port dc : PowerLead;
    }

    part def VtxModule {
        doc /* 5.8 GHz video transmitter. */
        port rf : VideoLink;
    }

    part def Receiver {
        doc /* 2.4 GHz ELRS receiver. */
    }

    part def CameraBody {
        doc /* Mini HD camera housing, 19 mm class. */
    }

    part def CameraLens {
        doc /* 2.3 mm FPV lens. */
    }

    part def GimbalPitchMotor {
        doc /* 1404 brushless pitch actuator. */
    }

    part def GimbalRollMotor {
        doc /* 1404 brushless roll actuator. */
    }

    part def GimbalDamper {
        doc /* Sorbothane isolation sphere, 8 mm. */
    }

    part def Antenna {
        doc /* 5.8 GHz cloverleaf / stub. */
        port rf : VideoLink;
    }

    part def M3Shcs {
        doc /* ISO 4762 M3 x 10 socket head cap screw. */
    }

    part def HeatInsert {
        doc /* M3 x 4 mm brass insert. */
    }

    // ---- Subassemblies -------------------------------------------------------
    part def MotorAssy {
        part stator : MotorStator;
        part magnets : MotorMagnetRing;
        part bell : MotorBell;
        part shaft : MotorShaft;
        part bearingUpper : MotorBearing;
        part bearingLower : MotorBearing;
        part base : MotorBase;
        connect stator. to magnets.;
        connect shaft. to bell.shaft;
    }

    part def PropellerAssy {
        part hub : PropHub;
        part blade : PropBlade[3];
        part nut : PropNut;
    }

    part def PropulsionUnit {
        part motor : MotorAssy;
        part prop : PropellerAssy;
        part spinner : MotorSpinner;
        connect motor.shaft to prop.hub;
    }

    part def ArmAssy {
        part spar : ArmSpar;
        part pod : MotorPod;
        part propulsion : PropulsionUnit;
        connect spar.cableDuct to pod.;
        connect propulsion.motor.base.motorBolt to pod.motorBolt;
    }

    part def GimbalAssy {
        part pitchMotor : GimbalPitchMotor;
        part rollMotor : GimbalRollMotor;
        part cradle : GimbalPitchCradle;
        part ring : GimbalRollRing;
        part damper : GimbalDamper[4];
    }

    part def CameraAssy {
        part body : CameraBody;
        part lens : CameraLens;
        part window : OpticalWindow;
    }

    part def AvionicsAssy {
        part fc : FlightController;
        part esc : EscStack;
        part vtx : VtxModule;
        part rx : Receiver;
        connect esc.dc to fc.;
        connect vtx.rf to Antenna::rf;
    }

    part def AirframeAssy {
        part keel : FuselageKeel;
        part canopy : FuselageCanopy;
        part nose : NoseFairing;
        part arm : ArmAssy[4];
        part skid : LandingSkid[2];
        part latch : BatteryLatch;
        part antennaFairing : AntennaFairing;
        connect keel.splitFace to canopy.splitFace;
        connect keel.duct to keel.duct;
    }

    part def PowerAssy {
        part pack : BatteryPack;
        part latch : BatteryLatch;
        connect pack.dc to EscStack::dc;
    }

    part def Vehicle {
        doc /* Complete ARQ-5. Motor diagonal 220 mm, AUW target 420 g. */
        part airframe : AirframeAssy;
        part power : PowerAssy;
        part avionics : AvionicsAssy;
        part gimbal : GimbalAssy;
        part camera : CameraAssy;
        part antenna : Antenna;
        attribute motorDiagonal : Millimetre = 220.0;
        attribute auw : Gram = 420.0;
    }

    // ---- Allocations ---------------------------------------------------------
    allocation def StructureToMaterial {
        allocate Vehicle.airframe to MaterialFrame;
    }

    allocation def PropToMaterial {
        allocate PropellerAssy to MaterialProp;
    }

    allocation def AeroToSurfaces {
        allocate Vehicle to AeroSurfaces;
    }
}
