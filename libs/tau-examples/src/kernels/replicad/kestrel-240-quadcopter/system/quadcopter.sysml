package RacingQuadcopter {
    private import ScalarValues::*;
    doc /*
      Revision A, 2026-09-20. Nominal units are encoded by attribute suffixes:
      mm, deg, V, A, N, Nm, rpm, kg and mps. Nose=-X, right=+Y, up=+Z.
      Textual notation follows OMG SysML 2.0:
      https://www.omg.org/spec/SysML/2.0/Language/PDF
      This is a reviewable architecture; no semantic parser has been run.
      CAD/BOM trace: the bill of materials in DESIGN.md.
      Purchased internals are mechanical envelopes, not supplier manufacturing data.
      The productionReleased attribute is deliberately false until release gates close.
    */

    item def DCPower { attribute voltageV : Real; attribute currentA : Real; }
    item def PhasePower { attribute phaseVoltageV : Real[3] ordered nonunique; attribute phaseCurrentA : Real[3] ordered nonunique; }
    item def ControlCommand { attribute protocol : String; attribute payload : String; }
    item def VideoFrame { attribute protocol : String; attribute frameRateHz : Real; }
    port def DCSource { out item power : DCPower; }
    port def PhaseSource { out item phases : PhasePower; }
    port def CommandSource { out item command : ControlCommand; }
    port def VideoSource { out item frame : VideoFrame; }
    port def MechanicalMount {
        attribute datum : String;
        attribute interfaceXmm : Real;
        attribute interfaceYmm : Real;
        attribute interfaceZmm : Real;
    }
    port def ShaftMount { attribute axis : String; attribute diameterMm : Real; }
    interface def DCPowerLink {
        end supply : DCSource;
        end load : ~DCSource;
        flow supply.power to load.power;
    }
    interface def PhaseLink {
        end drive : PhaseSource;
        end motor : ~PhaseSource;
        flow drive.phases to motor.phases;
    }
    interface def CommandLink {
        end sourceCommand : CommandSource;
        end sinkCommand : ~CommandSource;
        flow sourceCommand.command to sinkCommand.command;
    }
    interface def VideoLink {
        end cameraOutput : VideoSource;
        end videoInput : ~VideoSource;
        flow cameraOutput.frame to videoInput.frame;
    }
    interface def MechanicalJoint { end firstMount : MechanicalMount; end secondMount : MechanicalMount; }

    // Separately modeled physical leaves. Material fields are procurement proposals.
    part def UpperShell {
        doc /* AF-001: Upper aerodynamic fuselage shell. */
        attribute cadSource : String = "parts/airframe/upper-shell.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
    }
    part def LowerShell {
        doc /* AF-002: Lower fuselage shell with integral support features. */
        attribute cadSource : String = "parts/airframe/lower-shell.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
    }
    part def ArmFairing {
        doc /* AF-003: NACA 0024 parent; q=0.9 truncation and round cap. */
        attribute cadSource : String = "parts/airframe/arm.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
    }
    part def CarbonSpar {
        doc /* AF-004: 8 OD x 5 ID x 64; laminate and joint qualification pending. */
        attribute cadSource : String = "parts/airframe/spar.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        attribute material : String = "Continuous carbon composite";
        port root : MechanicalMount; port tip : MechanicalMount;
    }
    part def RootClamp {
        doc /* AF-005: Spar root socket and fuselage attachment. */
        attribute cadSource : String = "parts/airframe/root-clamp.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
        port spar : MechanicalMount; port body : MechanicalMount;
    }
    part def MotorPad {
        doc /* AF-006: Motor mount; qualify heat, creep and bonded retention. */
        attribute cadSource : String = "parts/airframe/motor-pad.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
        port motor : MechanicalMount; port spar : MechanicalMount;
    }
    part def BatterySaddle {
        doc /* AF-007: Battery location and strap slots. */
        attribute cadSource : String = "parts/airframe/battery-saddle.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
    }
    part def AirframeScrew {
        doc /* AF-008: M2.5 x 8 reference; complete thread specification pending. */
        attribute cadSource : String = "parts/airframe/shell-screw.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        attribute material : String = "Steel, grade TBD";
    }
    part def AirframeInsert {
        doc /* AF-009: M2.5 insert reference; OD3.5 x4, modeled bore2.05. */
        attribute cadSource : String = "parts/airframe/heat-set-insert.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        attribute material : String = "Brass, supplier TBD";
    }
    part def BatteryStrap {
        doc /* AF-010: Battery restraint envelope; rating and buckle/closure selection pending. */
        attribute cadSource : String = "parts/airframe/battery-strap.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        attribute material : String = "Woven nylon / hook-and-loop";
    }
    part def CameraFront {
        doc /* GIM-001: Front camera shell. */
        attribute cadSource : String = "parts/gimbal/camera-front.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
    }
    part def CameraRear {
        doc /* GIM-002: Rear camera shell and pitch interface. */
        attribute cadSource : String = "parts/gimbal/camera-rear.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
    }
    part def OpticalDome {
        doc /* GIM-003: Optical envelope only; prescription and finish unselected. */
        attribute cadSource : String = "parts/gimbal/optical-dome.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "Optical glass, supplier TBD";
    }
    part def LensRetainer {
        doc /* GIM-004: Optical dome retaining ring. */
        attribute cadSource : String = "parts/gimbal/lens-retainer.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
    }
    part def CameraPCB {
        doc /* GIM-005: Opaque camera/sensor board reservation. */
        attribute cadSource : String = "parts/gimbal/camera-pcb.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "Supplier electronics";
        port power : ~DCSource; port video : VideoSource;
    }
    part def PitchYoke {
        doc /* GIM-006: Camera carrier and perpendicular joint seats. */
        attribute cadSource : String = "parts/gimbal/pitch-yoke.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
    }
    part def GimbalMount {
        doc /* GIM-007: Fixed mount with M2 clearance holes. */
        attribute cadSource : String = "parts/gimbal/fixed-mount.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "EOS PA 2200 / PA12";
    }
    part def GimbalBearing {
        doc /* GIM-008: 3 x 8 x 3 bearing envelope; internal elements opaque. */
        attribute cadSource : String = "parts/gimbal/bearing.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "Bearing steel, supplier TBD";
    }
    part def ShoulderAxle {
        doc /* GIM-009: Pitch support shoulder spindle; fit and retention pending. */
        attribute cadSource : String = "parts/gimbal/shoulder-axle.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "Stainless steel, grade TBD";
    }
    part def ActuatorBody {
        doc /* GIM-010: Pitch/yaw actuator body reservations; rated supplier unselected. */
        attribute cadSource : String = "parts/gimbal/actuator-body.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "Supplier actuator";
        port power : ~DCSource; port command : ~CommandSource; port drive : ShaftMount;
    }
    part def ActuatorShaft {
        doc /* GIM-011: Pitch/yaw shaft variants included in actuator procurement. */
        attribute cadSource : String = "parts/gimbal/actuator-shaft.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "Supplier drive shaft";
    }
    part def CameraScrew {
        doc /* GIM-012: M2 x 10 reference. */
        attribute cadSource : String = "parts/gimbal/shell-screw.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "Steel, grade TBD";
    }
    part def CameraNut {
        doc /* GIM-013: M2 nut reference. */
        attribute cadSource : String = "parts/gimbal/shell-nut.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "Steel, grade TBD";
    }
    part def GimbalScrew {
        doc /* GIM-014: M2 x 8 mount reference. */
        attribute cadSource : String = "parts/gimbal/mount-screw.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "Steel, grade TBD";
    }
    part def GimbalInsert {
        doc /* GIM-015: M2 insert envelope; OD3.2 x4 with bore2.2. */
        attribute cadSource : String = "parts/gimbal/threaded-insert.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        attribute material : String = "Brass, supplier TBD";
    }
    part def MotorBase {
        doc /* PR-001: Base/hub envelope; included in complete motor purchase. */
        attribute cadSource : String = "parts/propulsion/motor-base.ts";
        attribute geospecSource : String = "tests/propulsion.geospec.ts";
        attribute material : String = "Vendor motor assembly";
    }
    part def MotorStator {
        doc /* PR-002: Combined stator/windings; laminations and insulation opaque. */
        attribute cadSource : String = "parts/propulsion/motor-stator.ts";
        attribute geospecSource : String = "tests/propulsion.geospec.ts";
        attribute material : String = "Vendor motor assembly";
        port phases : ~PhaseSource;
    }
    part def MotorBell {
        doc /* PR-003: Combined bell/magnets; retention and magnetic circuit opaque. */
        attribute cadSource : String = "parts/propulsion/motor-bell.ts";
        attribute geospecSource : String = "tests/propulsion.geospec.ts";
        attribute material : String = "Vendor motor assembly";
    }
    part def MotorShaft {
        doc /* PR-004: 5 mm shaft reference; actual supplier thread/fit required. */
        attribute cadSource : String = "parts/propulsion/motor-shaft.ts";
        attribute geospecSource : String = "tests/propulsion.geospec.ts";
        attribute material : String = "Vendor motor assembly";
    }
    part def MotorBearing {
        doc /* PR-005: 5 x 9 x 3 reference; bearing races/balls/seals opaque. */
        attribute cadSource : String = "parts/propulsion/motor-bearing.ts";
        attribute geospecSource : String = "tests/propulsion.geospec.ts";
        attribute material : String = "Vendor motor assembly";
    }
    part def MotorScrew {
        doc /* PR-006: Four M3 mounting screws per motor; length verified against actual motor. */
        attribute cadSource : String = "parts/propulsion/motor-screw.ts";
        attribute geospecSource : String = "tests/propulsion.geospec.ts";
        attribute material : String = "Steel, grade TBD";
    }
    part def Propeller {
        doc /* PR-007: Two CW and two CCW 127 mm envelopes; no flight-print approval. */
        attribute cadSource : String = "parts/propulsion/propeller.ts";
        attribute geospecSource : String = "tests/propulsion.geospec.ts";
        attribute material : String = "Rated supplier propeller";
    }
    part def PropNut {
        doc /* PR-008: Propeller retention envelope; thread and locking method TBD. */
        attribute cadSource : String = "parts/propulsion/prop-nut.ts";
        attribute geospecSource : String = "tests/propulsion.geospec.ts";
        attribute material : String = "Supplier nut";
    }
    part def Battery {
        doc /* AV-001: 70 x 32 x 34 reservation; capacity/current/supplier unselected. */
        attribute cadSource : String = "parts/avionics/battery.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        attribute material : String = "Supplier 6S battery";
        port output : DCSource;
    }
    part def ESC {
        doc /* AV-002: Four-channel ESC reservation; 20 mm square mounting. */
        attribute cadSource : String = "parts/avionics/esc.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        attribute material : String = "Supplier electronics";
        port input : ~DCSource; port commands : ~CommandSource; port phases : PhaseSource[4] ordered;
    }
    part def FlightController {
        doc /* AV-003: Flight-controller reservation; 20 mm square mounting. */
        attribute cadSource : String = "parts/avionics/flight-controller.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        attribute material : String = "Supplier electronics";
        port power : ~DCSource; port radio : ~CommandSource; port motorCommands : CommandSource; port gimbalCommands : CommandSource;
    }
    part def Receiver {
        doc /* AV-004: Radio receiver reservation. */
        attribute cadSource : String = "parts/avionics/receiver.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        attribute material : String = "Supplier electronics";
        port power : ~DCSource; port commands : CommandSource;
    }
    part def BoardStandoff {
        doc /* AV-005: Four 3.4 mm lower and four 7.4 mm interboard spacers. */
        attribute cadSource : String = "parts/avionics/standoff.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        attribute material : String = "Metal, supplier TBD";
    }
    part def BoardScrew {
        doc /* AV-006: Board-stack screw reference; final engagement pending. */
        attribute cadSource : String = "parts/avionics/board-screw.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        attribute material : String = "Steel, grade TBD";
    }
    part def BoardIsolator {
        doc /* AV-007: Four board isolation washers. */
        attribute cadSource : String = "parts/avionics/board-isolator.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        attribute material : String = "Silicone, hardness TBD";
    }
    part def PowerConnector {
        doc /* AV-008: Opaque 10 x 10 x 5 connector reservation. */
        attribute cadSource : String = "parts/avionics/power-connector.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        attribute material : String = "Supplier connector";
        port input : ~DCSource; port output : DCSource;
    }
    part def PowerWire {
        doc /* AV-009: Positive and negative lead envelopes; actual gauge and terminals TBD. */
        attribute cadSource : String = "parts/avionics/power-wire.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        attribute material : String = "Copper / rated insulation";
    }
    part def Antenna {
        doc /* AV-010: RF reservation; connector/cable/radiator details opaque. */
        attribute cadSource : String = "parts/avionics/antenna.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        attribute material : String = "Supplier antenna";
    }

    part def ArmModule {
        attribute cadSource : String = "assemblies/arm-module.ts";
        attribute geospecSource : String = "tests/arm-module.geospec.ts";
        attribute quadrant : String;
        part fairing : ArmFairing;
        part spar : CarbonSpar;
        part clamp : RootClamp;
        part pad : MotorPad;
        port bodyMount : MechanicalMount;
        port motorMount : MechanicalMount;
        connect bodyMount to clamp.body;
        connect motorMount to pad.motor;
        interface rootBond : MechanicalJoint connect spar.root to clamp.spar;
        interface tipBond : MechanicalJoint connect spar.tip to pad.spar;
        doc /* rootBond and tipBond identify required load paths. Adhesive, preparation,
          retention, cure, bond-line geometry and proof data are unreleased. */
    }
    part def AirframeAssembly {
        attribute cadSource : String = "assemblies/airframe.ts";
        attribute geospecSource : String = "tests/airframe.geospec.ts";
        part upperShell : UpperShell;
        part lowerShell : LowerShell;
        part arms : ArmModule[4] ordered;
        part saddle : BatterySaddle;
        part straps : BatteryStrap[2];
        part shellScrews : AirframeScrew[4];
        part shellInserts : AirframeInsert[4];
        port gimbalMount : MechanicalMount;
        port avionicsMount : MechanicalMount;
        attribute serviceSeamMm : Real = 0.4;
        attribute bodyChordMm : Real = 176.0;
        attribute bodyThicknessRatio : Real = 0.36;
        attribute bodyMinimumWallTargetMm : Real = 2.4;
        attribute armChordMm : Real = 48.0;
        attribute armThicknessRatio : Real = 0.24;
        attribute armCutoffFraction : Real = 0.9;
    }
    part def CameraCartridge {
        attribute cadSource : String = "assemblies/camera-cartridge.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        part front : CameraFront;
        part rear : CameraRear;
        part dome : OpticalDome;
        part retainer : LensRetainer;
        part board : CameraPCB;
        part screws : CameraScrew[2];
        part nuts : CameraNut[2];
        port power : ~DCSource;
        port video : VideoSource;
        port pitchMount : MechanicalMount;
        connect power to board.power;
        connect video to board.video;
    }
    part def GimbalAssembly {
        attribute cadSource : String = "assemblies/gimbal.ts";
        attribute geospecSource : String = "tests/gimbal.geospec.ts";
        part cartridge : CameraCartridge;
        part yoke : PitchYoke;
        part mount : GimbalMount;
        part bearings : GimbalBearing[2];
        part supportAxle : ShoulderAxle;
        part actuators : ActuatorBody[2] ordered;
        part drives : ActuatorShaft[2] ordered;
        part mountScrews : GimbalScrew[2];
        part mountInserts : GimbalInsert[2];
        port bodyMount : MechanicalMount;
        port power : ~DCSource;
        port command : ~CommandSource;
        port video : VideoSource;
        attribute cameraXmm : Real = -94.0;
        attribute cameraYmm : Real = 0.0;
        attribute cameraZmm : Real = -4.0;
        attribute pitchAxisXmm : Real = -89.0;
        attribute yawAxisXmm : Real = -70.0;
        attribute pitchMinimumDeg : Real = -25.0;
        attribute pitchMaximumDeg : Real = 25.0;
        attribute yawMinimumDeg : Real = -12.0;
        attribute yawMaximumDeg : Real = 12.0;
        attribute pitchDeg : Real = 0.0;
        attribute yawDeg : Real = 0.0;
        connect power to cartridge.power;
        connect power to actuators[1].power;
        connect power to actuators[2].power;
        connect command to actuators[1].command;
        connect command to actuators[2].command;
        connect video to cartridge.video;
        doc /* Pitch rotates about +Y at (-89,0,-4); yaw about +Z at (-70,0,-4).
          Camera follows pitch then yaw; yoke follows yaw; fixed mount stays on body.
          Actuator/control electronics and cable loops require supplier selection.
          Connections reserve required electrical services, not a completed harness. */
    }
    part def MotorModule {
        attribute cadSource : String = "assemblies/motor-module.ts";
        attribute geospecSource : String = "tests/propulsion.geospec.ts";
        attribute stationXmm : Real;
        attribute stationYmm : Real;
        attribute handedness : String;
        part base : MotorBase;
        part stator : MotorStator;
        part bell : MotorBell;
        part shaft : MotorShaft;
        part bearings : MotorBearing[2];
        part screws : MotorScrew[4];
        part propeller : Propeller;
        part propellerNut : PropNut;
        port phases : ~PhaseSource;
        port mount : MechanicalMount;
        attribute mountTopZmm : Real = 7.0;
        attribute rotorZmm : Real = 38.0;
        attribute propellerDiameterMm : Real = 127.0;
        connect phases to stator.phases;
        doc /* Base, stator, bell, shaft and two bearings illustrate one complete
          purchased motor. Do not procure these reference internals separately.
          Propeller is a supplier envelope; exact pitch/blade and RPM are unresolved. */
    }
    part def PropulsionAssembly {
        attribute cadSource : String = "assemblies/propulsion.ts";
        attribute geospecSource : String = "tests/propulsion.geospec.ts";
        part motors : MotorModule[4] ordered;
        // Order is front-left, front-right, rear-left, rear-right.
        attribute stationXmm : Real[4] ordered nonunique = (-85.0, -85.0, 85.0, 85.0);
        attribute stationYmm : Real[4] ordered nonunique = (-85.0, 85.0, -85.0, 85.0);
        attribute rotorHandedness : String[4] ordered nonunique = ("CW", "CCW", "CCW", "CW");
        bind motors[1].stationXmm = stationXmm[1];
        bind motors[2].stationXmm = stationXmm[2];
        bind motors[3].stationXmm = stationXmm[3];
        bind motors[4].stationXmm = stationXmm[4];
        bind motors[1].stationYmm = stationYmm[1];
        bind motors[2].stationYmm = stationYmm[2];
        bind motors[3].stationYmm = stationYmm[3];
        bind motors[4].stationYmm = stationYmm[4];
        bind motors[1].handedness = rotorHandedness[1];
        bind motors[2].handedness = rotorHandedness[2];
        bind motors[3].handedness = rotorHandedness[3];
        bind motors[4].handedness = rotorHandedness[4];
    }
    part def AvionicsAssembly {
        attribute cadSource : String = "assemblies/avionics.ts";
        attribute geospecSource : String = "tests/avionics.geospec.ts";
        part battery : Battery;
        part esc : ESC;
        part flightController : FlightController;
        part receiver : Receiver;
        part standoffs : BoardStandoff[8];
        part boardScrews : BoardScrew[4];
        part isolators : BoardIsolator[4];
        part connector : PowerConnector;
        part powerLeads : PowerWire[2];
        part antenna : Antenna;
        port bodyMount : MechanicalMount;
        port auxiliaryPower : DCSource;
        port gimbalCommand : CommandSource;
        port cameraVideo : ~VideoSource;
        attribute batteryXmm : Real = -27.0;
        attribute batteryLengthMm : Real = 70.0;
        attribute batteryWidthMm : Real = 32.0;
        attribute batteryHeightMm : Real = 34.0;
        attribute controllerStackXmm : Real = 24.0;
        attribute stackHolePitchMm : Real = 20.0;
        interface batteryConnection : DCPowerLink connect battery.output to connector.input;
        interface escSupply : DCPowerLink connect connector.output to esc.input;
        interface fcSupply : DCPowerLink connect auxiliaryPower to flightController.power;
        interface receiverSupply : DCPowerLink connect auxiliaryPower to receiver.power;
        interface radioCommands : CommandLink connect receiver.commands to flightController.radio;
        interface motorCommands : CommandLink connect flightController.motorCommands to esc.commands;
        connect gimbalCommand to flightController.gimbalCommands;
        doc /* auxiliaryPower is a required regulated rail. A suitable on-board BEC or
          separate regulator must be selected and rated; no unmodeled regulator is claimed.
          cameraVideo terminates the reserved video interface; transport/recording hardware
          and the complete low-voltage/motor/gimbal harness are not yet selected. */
    }
    part def Quadcopter {
        attribute cadSource : String = "main.ts";
        attribute geospecSource : String = "main.geospec.ts";
        part airframe : AirframeAssembly;
        part gimbal : GimbalAssembly;
        part propulsion : PropulsionAssembly;
        part avionics : AvionicsAssembly;
        attribute motorCentreCoordinateMm : Real = 85.0;
        attribute propellerDiameterMm : Real = 127.0;
        attribute adjacentRotorGapMm : Real = 43.0;
        attribute modeledLeafCount : Integer = 123;
        attribute modeledLeafTypes : Integer = 43;
        attribute productionReleased : Boolean = false;
        attribute targetSpeedMps : Real;
        attribute targetFlightMassKg : Real;
        attribute targetEnduranceSeconds : Real;
        attribute maximumManoeuvreAccelerationMps2 : Real;
        interface cameraMount : MechanicalJoint connect airframe.gimbalMount to gimbal.bodyMount;
        interface boardMount : MechanicalJoint connect airframe.avionicsMount to avionics.bodyMount;
        interface gimbalSupply : DCPowerLink connect avionics.auxiliaryPower to gimbal.power;
        interface gimbalCommands : CommandLink connect avionics.gimbalCommand to gimbal.command;
        interface cameraVideo : VideoLink connect gimbal.video to avionics.cameraVideo;
        interface motorMountFL : MechanicalJoint connect airframe.arms[1].motorMount to propulsion.motors[1].mount;
        interface motorMountFR : MechanicalJoint connect airframe.arms[2].motorMount to propulsion.motors[2].mount;
        interface motorMountRL : MechanicalJoint connect airframe.arms[3].motorMount to propulsion.motors[3].mount;
        interface motorMountRR : MechanicalJoint connect airframe.arms[4].motorMount to propulsion.motors[4].mount;
        interface motorPhaseFL : PhaseLink connect avionics.esc.phases[1] to propulsion.motors[1].phases;
        interface motorPhaseFR : PhaseLink connect avionics.esc.phases[2] to propulsion.motors[2].phases;
        interface motorPhaseRL : PhaseLink connect avionics.esc.phases[3] to propulsion.motors[3].phases;
        interface motorPhaseRR : PhaseLink connect avionics.esc.phases[4] to propulsion.motors[4].phases;
    }

    part referenceVehicle : Quadcopter[1];

    requirement <'R-SYS-001'> SourceDecomposition {
        subject vehicle = referenceVehicle;
        doc /* Every modeled leaf and physical subassembly shall have independent native CAD,
          SysML and BOM trace and executable GeoSpec references. Vendor-opaque internals
          and unreleased production details shall be identified explicitly. */
        attribute traceComplete : Boolean;
        require constraint { traceComplete }
    }
    requirement <'R-GEO-001'> ClosedExactSolids {
        subject vehicle = referenceVehicle;
        doc /* Each modeled leaf shall be one connected watertight solid and one valid BRep.
          Current-source GeoSpec execution, not this declaration, supplies the result. */
        attribute allLeavesPass : Boolean;
        require constraint { allLeavesPass }
    }
    requirement <'R-AERO-001'> NominalNACALaw {
        subject vehicle = referenceVehicle;
        doc /* Nominated unmodified profile regions shall use the original symmetric
          four-digit thickness law, coefficient -0.1015, as degree-eight Bezier geometry.
          Manufactured caps, q=0.9 arm truncation, openings and seams shall be identified. */
        attribute maximumFormulaDeviationMm : Real;
        require constraint { maximumFormulaDeviationMm <= 0.00000001 }
    }
    requirement <'R-AERO-002'> CurvedFairings {
        subject vehicle = referenceVehicle;
        doc /* Exposed aerodynamic fairings shall use curved surfaces. Planar mounting
          seats and internal datums are permitted. Fluid performance needs validation. */
        attribute reviewed : Boolean;
        require constraint { reviewed }
    }
    requirement <'R-FIT-001'> MechanicalInterfaces {
        subject vehicle = referenceVehicle;
        doc /* Nominal motor, spar, camera and electronics interfaces shall meet their
          GeoSpec checks and released tolerance stacks and first-article fit criteria. */
        attribute geometryPass : Boolean;
        attribute fitQualificationPass : Boolean;
        require constraint { geometryPass and fitQualificationPass }
    }
    requirement <'R-PROP-001'> RotorLayout {
        subject vehicle = referenceVehicle;
        doc /* Four handed propellers shall occupy the specified stations. The nominal
          disc-to-disc gap is not a dynamic clearance or RPM approval. */
        require constraint { vehicle.motorCentreCoordinateMm == 85.0 }
        require constraint { vehicle.propellerDiameterMm == 127.0 }
        require constraint { vehicle.adjacentRotorGapMm > 0.0 }
    }
    requirement <'R-GIM-001'> CameraArticulation {
        subject vehicle = referenceVehicle;
        doc /* Camera shall articulate through pitch -25..25deg and yaw -12..12deg,
          with positive worst-case continuous clearance including flex cables and deflection. */
        attribute continuousClearanceProved : Boolean;
        require constraint { vehicle.gimbal.pitchDeg >= vehicle.gimbal.pitchMinimumDeg }
        require constraint { vehicle.gimbal.pitchDeg <= vehicle.gimbal.pitchMaximumDeg }
        require constraint { vehicle.gimbal.yawDeg >= vehicle.gimbal.yawMinimumDeg }
        require constraint { vehicle.gimbal.yawDeg <= vehicle.gimbal.yawMaximumDeg }
        require constraint { continuousClearanceProved }
    }
    requirement <'R-PRINT-001'> QualifiedPrintProcess {
        subject vehicle = referenceVehicle;
        doc /* PA2200 SLS parts shall pass approved process, conditioned strength and
          dimensional qualification. Minimum normal fuselage wall target is 2.4mm. */
        attribute measuredMinimumFuselageWallMm : Real;
        attribute processQualified : Boolean;
        require constraint { measuredMinimumFuselageWallMm >= 2.4 }
        require constraint { processQualified }
    }
    requirement <'R-ELEC-001'> ElectricalCompleteness {
        subject vehicle = referenceVehicle;
        doc /* Selected supplier electronics, regulation, harness, camera and gimbal
          control shall meet voltage, current, thermal, radio and functional requirements. */
        attribute verified : Boolean;
        require constraint { verified }
    }
    requirement <'R-PERF-001'> SpeedAndEndurance {
        subject vehicle = referenceVehicle;
        doc /* Owner-approved speed, mass, manoeuvre and endurance requirements shall
          be established before validated aerodynamic/structural/thermal and flight tests.
          No numerical racing speed or endurance is currently a verified capability. */
        attribute measuredSpeedMps : Real;
        attribute measuredEnduranceSeconds : Real;
        require constraint { vehicle.targetSpeedMps > 0.0 }
        require constraint { measuredSpeedMps >= vehicle.targetSpeedMps }
        require constraint { measuredEnduranceSeconds >= vehicle.targetEnduranceSeconds }
    }
    requirement <'R-DFM-001'> ManufacturingRelease {
        subject vehicle = referenceVehicle;
        doc /* Close G01..G10 in DESIGN.md, semantically validate this SysML
          model, and approve revision-controlled BOM, drawings and first article before release. */
        require constraint { vehicle.productionReleased }
    }
}
