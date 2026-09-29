package TF2000 {
    private import ScalarValues::*;
    doc /* Generic geometric reference assembly. Millimetres throughout. Terminal definitions denote one manufactured part. Integral airfoil surfaces, holes, leading/trailing edges and root regions are features, not additional parts. No claim of engine performance or certification. */
    part def ManufacturedPart {
        attribute cadSelector : String;
        attribute geometryKind : String;
        attribute nacaSection : String default "none";
        attribute process : String default "concept geometry";
    }
    part def Inlet {
        part lip : ManufacturedPart[1] {
            attribute :>> cadSelector = "inlet/lip";
            attribute :>> geometryKind = "ring";
        }
    }
    part def Nacelle {
        part forwardCowl : ManufacturedPart[1] {
            attribute :>> cadSelector = "nacelle/forwardCowl";
            attribute :>> geometryKind = "ring";
        }
        part aftCowl : ManufacturedPart[1] {
            attribute :>> cadSelector = "nacelle/aftCowl";
            attribute :>> geometryKind = "ring";
        }
    }
    part def Fan {
        part containment : ManufacturedPart[1] {
            attribute :>> cadSelector = "fan/containment";
            attribute :>> geometryKind = "ring";
        }
        part spinner : ManufacturedPart[1] {
            attribute :>> cadSelector = "fan/spinner";
            attribute :>> geometryKind = "ring";
        }
        part disk : ManufacturedPart[1] {
            attribute :>> cadSelector = "fan/disk";
            attribute :>> geometryKind = "ring";
        }
        part blades : ManufacturedPart[24] {
            attribute :>> cadSelector = "fan/blades";
            attribute :>> geometryKind = "blade";
            attribute :>> nacaSection = "4412";
        }
        part frontRetainer : ManufacturedPart[1] {
            attribute :>> cadSelector = "fan/frontRetainer";
            attribute :>> geometryKind = "ring";
        }
        part rearRetainer : ManufacturedPart[1] {
            attribute :>> cadSelector = "fan/rearRetainer";
            attribute :>> geometryKind = "ring";
        }
        part hubBolts : ManufacturedPart[24] {
            attribute :>> cadSelector = "fan/hubBolts";
            attribute :>> geometryKind = "ring";
        }
    }
    part def Bypass {
        part outletGuideVanes : ManufacturedPart[36] {
            attribute :>> cadSelector = "bypass/outletGuideVanes";
            attribute :>> geometryKind = "blade";
            attribute :>> nacaSection = "2412";
        }
        part splitter : ManufacturedPart[1] {
            attribute :>> cadSelector = "bypass/splitter";
            attribute :>> geometryKind = "ring";
        }
    }
    part def Booster {
        part stage1 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage1/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[30] {
                attribute :>> cadSelector = "booster/stage1/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2412";
            }
            part statorVanes : ManufacturedPart[34] {
                attribute :>> cadSelector = "booster/stage1/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage1/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage1/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage1/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part stage2 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage2/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[34] {
                attribute :>> cadSelector = "booster/stage2/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2412";
            }
            part statorVanes : ManufacturedPart[38] {
                attribute :>> cadSelector = "booster/stage2/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage2/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage2/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage2/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part stage3 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage3/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[38] {
                attribute :>> cadSelector = "booster/stage3/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2412";
            }
            part statorVanes : ManufacturedPart[42] {
                attribute :>> cadSelector = "booster/stage3/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage3/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage3/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "booster/stage3/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
    }
    part def Compressor {
        part stage1 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage1/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[40] {
                attribute :>> cadSelector = "compressor/stage1/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorVanes : ManufacturedPart[44] {
                attribute :>> cadSelector = "compressor/stage1/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage1/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage1/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage1/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part stage2 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage2/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[44] {
                attribute :>> cadSelector = "compressor/stage2/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorVanes : ManufacturedPart[48] {
                attribute :>> cadSelector = "compressor/stage2/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage2/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage2/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage2/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part stage3 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage3/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[48] {
                attribute :>> cadSelector = "compressor/stage3/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorVanes : ManufacturedPart[52] {
                attribute :>> cadSelector = "compressor/stage3/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage3/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage3/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage3/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part stage4 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage4/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[52] {
                attribute :>> cadSelector = "compressor/stage4/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorVanes : ManufacturedPart[56] {
                attribute :>> cadSelector = "compressor/stage4/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage4/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage4/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage4/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part stage5 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage5/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[56] {
                attribute :>> cadSelector = "compressor/stage5/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorVanes : ManufacturedPart[60] {
                attribute :>> cadSelector = "compressor/stage5/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage5/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage5/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage5/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part stage6 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage6/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[60] {
                attribute :>> cadSelector = "compressor/stage6/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorVanes : ManufacturedPart[64] {
                attribute :>> cadSelector = "compressor/stage6/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "2410";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage6/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage6/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "compressor/stage6/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part case : ManufacturedPart[1] {
            attribute :>> cadSelector = "compressor/case";
            attribute :>> geometryKind = "ring";
        }
    }
    part def HighTurbine {
        part stage1 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "highTurbine/stage1/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[48] {
                attribute :>> cadSelector = "highTurbine/stage1/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "4415";
            }
            part statorVanes : ManufacturedPart[52] {
                attribute :>> cadSelector = "highTurbine/stage1/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "4415";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "highTurbine/stage1/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "highTurbine/stage1/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "highTurbine/stage1/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part nozzleGuideVanes : ManufacturedPart[52] {
            attribute :>> cadSelector = "highTurbine/nozzleGuideVanes";
            attribute :>> geometryKind = "blade";
            attribute :>> nacaSection = "4415";
        }
    }
    part def LowTurbine {
        part stage1 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage1/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[48] {
                attribute :>> cadSelector = "lowTurbine/stage1/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "4415";
            }
            part statorVanes : ManufacturedPart[52] {
                attribute :>> cadSelector = "lowTurbine/stage1/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "4415";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage1/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage1/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage1/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part stage2 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage2/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[52] {
                attribute :>> cadSelector = "lowTurbine/stage2/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "4415";
            }
            part statorVanes : ManufacturedPart[56] {
                attribute :>> cadSelector = "lowTurbine/stage2/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "4415";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage2/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage2/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage2/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
        part stage3 {
            part disk : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage3/disk";
                attribute :>> geometryKind = "ring";
            }
            part rotorBlades : ManufacturedPart[56] {
                attribute :>> cadSelector = "lowTurbine/stage3/rotorBlades";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "4415";
            }
            part statorVanes : ManufacturedPart[60] {
                attribute :>> cadSelector = "lowTurbine/stage3/statorVanes";
                attribute :>> geometryKind = "blade";
                attribute :>> nacaSection = "4415";
            }
            part statorShroud : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage3/statorShroud";
                attribute :>> geometryKind = "ring";
            }
            part spacer : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage3/spacer";
                attribute :>> geometryKind = "ring";
            }
            part lockRing : ManufacturedPart[1] {
                attribute :>> cadSelector = "lowTurbine/stage3/lockRing";
                attribute :>> geometryKind = "ring";
            }
        }
    }
    part def Combustor {
        part diffuserOuter : ManufacturedPart[1] {
            attribute :>> cadSelector = "combustor/diffuserOuter";
            attribute :>> geometryKind = "ring";
        }
        part diffuserInner : ManufacturedPart[1] {
            attribute :>> cadSelector = "combustor/diffuserInner";
            attribute :>> geometryKind = "ring";
        }
        part pressureCase : ManufacturedPart[1] {
            attribute :>> cadSelector = "combustor/pressureCase";
            attribute :>> geometryKind = "ring";
        }
        part outerLiner : ManufacturedPart[1] {
            attribute :>> cadSelector = "combustor/outerLiner";
            attribute :>> geometryKind = "perforated";
        }
        part innerLiner : ManufacturedPart[1] {
            attribute :>> cadSelector = "combustor/innerLiner";
            attribute :>> geometryKind = "perforated";
        }
        part dome : ManufacturedPart[1] {
            attribute :>> cadSelector = "combustor/dome";
            attribute :>> geometryKind = "ring";
        }
        part fuelManifold : ManufacturedPart[1] {
            attribute :>> cadSelector = "combustor/fuelManifold";
            attribute :>> geometryKind = "ring";
        }
        part injectorBodies : ManufacturedPart[20] {
            attribute :>> cadSelector = "combustor/injectorBodies";
            attribute :>> geometryKind = "ring";
        }
        part injectorTips : ManufacturedPart[20] {
            attribute :>> cadSelector = "combustor/injectorTips";
            attribute :>> geometryKind = "ring";
        }
        part swirlerVanes : ManufacturedPart[60] {
            attribute :>> cadSelector = "combustor/swirlerVanes";
            attribute :>> geometryKind = "blade";
            attribute :>> nacaSection = "2412";
        }
        part igniterBodies : ManufacturedPart[2] {
            attribute :>> cadSelector = "combustor/igniterBodies";
            attribute :>> geometryKind = "ring";
        }
        part exitOuter : ManufacturedPart[1] {
            attribute :>> cadSelector = "combustor/exitOuter";
            attribute :>> geometryKind = "ring";
        }
        part exitInner : ManufacturedPart[1] {
            attribute :>> cadSelector = "combustor/exitInner";
            attribute :>> geometryKind = "ring";
        }
        part igniterElectrodes : ManufacturedPart[2] {
            attribute :>> cadSelector = "combustor/igniterElectrodes";
            attribute :>> geometryKind = "ring";
        }
        part igniterInsulators : ManufacturedPart[2] {
            attribute :>> cadSelector = "combustor/igniterInsulators";
            attribute :>> geometryKind = "ring";
        }
    }
    part def Turbine {
        part case : ManufacturedPart[1] {
            attribute :>> cadSelector = "turbine/case";
            attribute :>> geometryKind = "ring";
        }
    }
    part def Exhaust {
        part coreNozzle : ManufacturedPart[1] {
            attribute :>> cadSelector = "exhaust/coreNozzle";
            attribute :>> geometryKind = "ring";
        }
        part plug : ManufacturedPart[1] {
            attribute :>> cadSelector = "exhaust/plug";
            attribute :>> geometryKind = "ring";
        }
        part struts : ManufacturedPart[8] {
            attribute :>> cadSelector = "exhaust/struts";
            attribute :>> geometryKind = "blade";
            attribute :>> nacaSection = "0012";
        }
    }
    part def Shafts {
        part lowPressure : ManufacturedPart[1] {
            attribute :>> cadSelector = "shafts/lowPressure";
            attribute :>> geometryKind = "ring";
        }
        part highPressure : ManufacturedPart[1] {
            attribute :>> cadSelector = "shafts/highPressure";
            attribute :>> geometryKind = "ring";
        }
    }
    part def Bearings {
        part front {
            part innerRace : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/front/innerRace";
                attribute :>> geometryKind = "ring";
            }
            part outerRace : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/front/outerRace";
                attribute :>> geometryKind = "ring";
            }
            part rollers : ManufacturedPart[18] {
                attribute :>> cadSelector = "bearings/front/rollers";
                attribute :>> geometryKind = "ring";
            }
            part frontCage : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/front/frontCage";
                attribute :>> geometryKind = "ring";
            }
            part rearCage : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/front/rearCage";
                attribute :>> geometryKind = "ring";
            }
            part seal : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/front/seal";
                attribute :>> geometryKind = "ring";
            }
        }
        part intermediate {
            part innerRace : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/intermediate/innerRace";
                attribute :>> geometryKind = "ring";
            }
            part outerRace : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/intermediate/outerRace";
                attribute :>> geometryKind = "ring";
            }
            part rollers : ManufacturedPart[18] {
                attribute :>> cadSelector = "bearings/intermediate/rollers";
                attribute :>> geometryKind = "ring";
            }
            part frontCage : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/intermediate/frontCage";
                attribute :>> geometryKind = "ring";
            }
            part rearCage : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/intermediate/rearCage";
                attribute :>> geometryKind = "ring";
            }
            part seal : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/intermediate/seal";
                attribute :>> geometryKind = "ring";
            }
        }
        part highFront {
            part innerRace : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/highFront/innerRace";
                attribute :>> geometryKind = "ring";
            }
            part outerRace : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/highFront/outerRace";
                attribute :>> geometryKind = "ring";
            }
            part rollers : ManufacturedPart[18] {
                attribute :>> cadSelector = "bearings/highFront/rollers";
                attribute :>> geometryKind = "ring";
            }
            part frontCage : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/highFront/frontCage";
                attribute :>> geometryKind = "ring";
            }
            part rearCage : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/highFront/rearCage";
                attribute :>> geometryKind = "ring";
            }
            part seal : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/highFront/seal";
                attribute :>> geometryKind = "ring";
            }
        }
        part highRear {
            part innerRace : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/highRear/innerRace";
                attribute :>> geometryKind = "ring";
            }
            part outerRace : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/highRear/outerRace";
                attribute :>> geometryKind = "ring";
            }
            part rollers : ManufacturedPart[18] {
                attribute :>> cadSelector = "bearings/highRear/rollers";
                attribute :>> geometryKind = "ring";
            }
            part frontCage : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/highRear/frontCage";
                attribute :>> geometryKind = "ring";
            }
            part rearCage : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/highRear/rearCage";
                attribute :>> geometryKind = "ring";
            }
            part seal : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/highRear/seal";
                attribute :>> geometryKind = "ring";
            }
        }
        part rear {
            part innerRace : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/rear/innerRace";
                attribute :>> geometryKind = "ring";
            }
            part outerRace : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/rear/outerRace";
                attribute :>> geometryKind = "ring";
            }
            part rollers : ManufacturedPart[18] {
                attribute :>> cadSelector = "bearings/rear/rollers";
                attribute :>> geometryKind = "ring";
            }
            part frontCage : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/rear/frontCage";
                attribute :>> geometryKind = "ring";
            }
            part rearCage : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/rear/rearCage";
                attribute :>> geometryKind = "ring";
            }
            part seal : ManufacturedPart[1] {
                attribute :>> cadSelector = "bearings/rear/seal";
                attribute :>> geometryKind = "ring";
            }
        }
    }
    part def Structure {
        part frontFrameStruts : ManufacturedPart[8] {
            attribute :>> cadSelector = "structure/frontFrameStruts";
            attribute :>> geometryKind = "blade";
            attribute :>> nacaSection = "0018";
        }
        part rearFrameStruts : ManufacturedPart[8] {
            attribute :>> cadSelector = "structure/rearFrameStruts";
            attribute :>> geometryKind = "blade";
            attribute :>> nacaSection = "0018";
        }
    }
    part def Fasteners {
        part flange0 {
            part ring : ManufacturedPart[1] {
                attribute :>> cadSelector = "fasteners/flange0/ring";
                attribute :>> geometryKind = "ring";
            }
            part boltHeads : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange0/boltHeads";
                attribute :>> geometryKind = "ring";
            }
            part nuts : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange0/nuts";
                attribute :>> geometryKind = "ring";
            }
        }
        part flange1 {
            part ring : ManufacturedPart[1] {
                attribute :>> cadSelector = "fasteners/flange1/ring";
                attribute :>> geometryKind = "ring";
            }
            part boltHeads : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange1/boltHeads";
                attribute :>> geometryKind = "ring";
            }
            part nuts : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange1/nuts";
                attribute :>> geometryKind = "ring";
            }
        }
        part flange2 {
            part ring : ManufacturedPart[1] {
                attribute :>> cadSelector = "fasteners/flange2/ring";
                attribute :>> geometryKind = "ring";
            }
            part boltHeads : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange2/boltHeads";
                attribute :>> geometryKind = "ring";
            }
            part nuts : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange2/nuts";
                attribute :>> geometryKind = "ring";
            }
        }
        part flange3 {
            part ring : ManufacturedPart[1] {
                attribute :>> cadSelector = "fasteners/flange3/ring";
                attribute :>> geometryKind = "ring";
            }
            part boltHeads : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange3/boltHeads";
                attribute :>> geometryKind = "ring";
            }
            part nuts : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange3/nuts";
                attribute :>> geometryKind = "ring";
            }
        }
        part flange4 {
            part ring : ManufacturedPart[1] {
                attribute :>> cadSelector = "fasteners/flange4/ring";
                attribute :>> geometryKind = "ring";
            }
            part boltHeads : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange4/boltHeads";
                attribute :>> geometryKind = "ring";
            }
            part nuts : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange4/nuts";
                attribute :>> geometryKind = "ring";
            }
        }
        part flange5 {
            part ring : ManufacturedPart[1] {
                attribute :>> cadSelector = "fasteners/flange5/ring";
                attribute :>> geometryKind = "ring";
            }
            part boltHeads : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange5/boltHeads";
                attribute :>> geometryKind = "ring";
            }
            part nuts : ManufacturedPart[24] {
                attribute :>> cadSelector = "fasteners/flange5/nuts";
                attribute :>> geometryKind = "ring";
            }
        }
    }
    part def Accessories {
        part gearbox {
            part housing : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/gearbox/housing";
                attribute :>> geometryKind = "box";
            }
            part cover : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/gearbox/cover";
                attribute :>> geometryKind = "box";
            }
            part gear0 : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/gearbox/gear0";
                attribute :>> geometryKind = "ring";
            }
            part shaft0 : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/gearbox/shaft0";
                attribute :>> geometryKind = "ring";
            }
            part gear1 : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/gearbox/gear1";
                attribute :>> geometryKind = "ring";
            }
            part shaft1 : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/gearbox/shaft1";
                attribute :>> geometryKind = "ring";
            }
            part gear2 : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/gearbox/gear2";
                attribute :>> geometryKind = "ring";
            }
            part shaft2 : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/gearbox/shaft2";
                attribute :>> geometryKind = "ring";
            }
        }
        part starter {
            part body : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/starter/body";
                attribute :>> geometryKind = "ring";
            }
            part statorCore : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/starter/statorCore";
                attribute :>> geometryKind = "ring";
            }
            part fieldWinding : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/starter/fieldWinding";
                attribute :>> geometryKind = "ring";
            }
            part armature : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/starter/armature";
                attribute :>> geometryKind = "ring";
            }
            part shaft : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/starter/shaft";
                attribute :>> geometryKind = "ring";
            }
            part frontEndBell : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/starter/frontEndBell";
                attribute :>> geometryKind = "ring";
            }
            part rearEndBell : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/starter/rearEndBell";
                attribute :>> geometryKind = "ring";
            }
            part frontBearing {
                part innerRace : ManufacturedPart[1] {
                    attribute :>> cadSelector = "accessories/starter/frontBearing/innerRace";
                    attribute :>> geometryKind = "ring";
                }
                part outerRace : ManufacturedPart[1] {
                    attribute :>> cadSelector = "accessories/starter/frontBearing/outerRace";
                    attribute :>> geometryKind = "ring";
                }
                part rollers : ManufacturedPart[12] {
                    attribute :>> cadSelector = "accessories/starter/frontBearing/rollers";
                    attribute :>> geometryKind = "ring";
                }
            }
            part rearBearing {
                part innerRace : ManufacturedPart[1] {
                    attribute :>> cadSelector = "accessories/starter/rearBearing/innerRace";
                    attribute :>> geometryKind = "ring";
                }
                part outerRace : ManufacturedPart[1] {
                    attribute :>> cadSelector = "accessories/starter/rearBearing/outerRace";
                    attribute :>> geometryKind = "ring";
                }
                part rollers : ManufacturedPart[12] {
                    attribute :>> cadSelector = "accessories/starter/rearBearing/rollers";
                    attribute :>> geometryKind = "ring";
                }
            }
        }
        part generator {
            part body : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/generator/body";
                attribute :>> geometryKind = "ring";
            }
            part statorCore : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/generator/statorCore";
                attribute :>> geometryKind = "ring";
            }
            part fieldWinding : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/generator/fieldWinding";
                attribute :>> geometryKind = "ring";
            }
            part armature : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/generator/armature";
                attribute :>> geometryKind = "ring";
            }
            part shaft : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/generator/shaft";
                attribute :>> geometryKind = "ring";
            }
            part frontEndBell : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/generator/frontEndBell";
                attribute :>> geometryKind = "ring";
            }
            part rearEndBell : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/generator/rearEndBell";
                attribute :>> geometryKind = "ring";
            }
            part frontBearing {
                part innerRace : ManufacturedPart[1] {
                    attribute :>> cadSelector = "accessories/generator/frontBearing/innerRace";
                    attribute :>> geometryKind = "ring";
                }
                part outerRace : ManufacturedPart[1] {
                    attribute :>> cadSelector = "accessories/generator/frontBearing/outerRace";
                    attribute :>> geometryKind = "ring";
                }
                part rollers : ManufacturedPart[12] {
                    attribute :>> cadSelector = "accessories/generator/frontBearing/rollers";
                    attribute :>> geometryKind = "ring";
                }
            }
            part rearBearing {
                part innerRace : ManufacturedPart[1] {
                    attribute :>> cadSelector = "accessories/generator/rearBearing/innerRace";
                    attribute :>> geometryKind = "ring";
                }
                part outerRace : ManufacturedPart[1] {
                    attribute :>> cadSelector = "accessories/generator/rearBearing/outerRace";
                    attribute :>> geometryKind = "ring";
                }
                part rollers : ManufacturedPart[12] {
                    attribute :>> cadSelector = "accessories/generator/rearBearing/rollers";
                    attribute :>> geometryKind = "ring";
                }
            }
        }
        part fuelPump {
            part body : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/body";
                attribute :>> geometryKind = "ring";
            }
            part driveRotor : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/driveRotor";
                attribute :>> geometryKind = "ring";
            }
            part driveShaft : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/driveShaft";
                attribute :>> geometryKind = "ring";
            }
            part driveFrontBush : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/driveFrontBush";
                attribute :>> geometryKind = "ring";
            }
            part driveRearBush : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/driveRearBush";
                attribute :>> geometryKind = "ring";
            }
            part idlerRotor : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/idlerRotor";
                attribute :>> geometryKind = "ring";
            }
            part idlerShaft : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/idlerShaft";
                attribute :>> geometryKind = "ring";
            }
            part idlerFrontBush : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/idlerFrontBush";
                attribute :>> geometryKind = "ring";
            }
            part idlerRearBush : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/idlerRearBush";
                attribute :>> geometryKind = "ring";
            }
            part frontPlate : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/frontPlate";
                attribute :>> geometryKind = "ring";
            }
            part rearPlate : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/fuelPump/rearPlate";
                attribute :>> geometryKind = "ring";
            }
        }
        part oilPump {
            part body : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/body";
                attribute :>> geometryKind = "ring";
            }
            part driveRotor : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/driveRotor";
                attribute :>> geometryKind = "ring";
            }
            part driveShaft : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/driveShaft";
                attribute :>> geometryKind = "ring";
            }
            part driveFrontBush : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/driveFrontBush";
                attribute :>> geometryKind = "ring";
            }
            part driveRearBush : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/driveRearBush";
                attribute :>> geometryKind = "ring";
            }
            part idlerRotor : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/idlerRotor";
                attribute :>> geometryKind = "ring";
            }
            part idlerShaft : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/idlerShaft";
                attribute :>> geometryKind = "ring";
            }
            part idlerFrontBush : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/idlerFrontBush";
                attribute :>> geometryKind = "ring";
            }
            part idlerRearBush : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/idlerRearBush";
                attribute :>> geometryKind = "ring";
            }
            part frontPlate : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/frontPlate";
                attribute :>> geometryKind = "ring";
            }
            part rearPlate : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilPump/rearPlate";
                attribute :>> geometryKind = "ring";
            }
        }
        part oilTank {
            part shell : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilTank/shell";
                attribute :>> geometryKind = "box";
            }
            part filler : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilTank/filler";
                attribute :>> geometryKind = "ring";
            }
            part baffle : ManufacturedPart[1] {
                attribute :>> cadSelector = "accessories/oilTank/baffle";
                attribute :>> geometryKind = "ring";
            }
        }
    }
    part def Controls {
        part fadec {
            part enclosure : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/enclosure";
                attribute :>> geometryKind = "box";
            }
            part lid : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/lid";
                attribute :>> geometryKind = "box";
            }
            part connector0 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/connector0";
                attribute :>> geometryKind = "ring";
            }
            part connector1 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/connector1";
                attribute :>> geometryKind = "ring";
            }
            part connector2 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/connector2";
                attribute :>> geometryKind = "ring";
            }
            part connector3 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/connector3";
                attribute :>> geometryKind = "ring";
            }
            part connector4 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/connector4";
                attribute :>> geometryKind = "ring";
            }
            part connector5 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/connector5";
                attribute :>> geometryKind = "ring";
            }
            part circuitBoard : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/circuitBoard";
                attribute :>> geometryKind = "box";
            }
            part processor0 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/processor0";
                attribute :>> geometryKind = "box";
            }
            part processor1 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/processor1";
                attribute :>> geometryKind = "box";
            }
            part processor2 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/processor2";
                attribute :>> geometryKind = "box";
            }
            part processor3 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/processor3";
                attribute :>> geometryKind = "box";
            }
            part processor4 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/processor4";
                attribute :>> geometryKind = "box";
            }
            part processor5 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/processor5";
                attribute :>> geometryKind = "box";
            }
            part capacitor0 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/capacitor0";
                attribute :>> geometryKind = "box";
            }
            part capacitor1 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/capacitor1";
                attribute :>> geometryKind = "box";
            }
            part capacitor2 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/capacitor2";
                attribute :>> geometryKind = "box";
            }
            part capacitor3 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/capacitor3";
                attribute :>> geometryKind = "box";
            }
            part capacitor4 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/capacitor4";
                attribute :>> geometryKind = "box";
            }
            part capacitor5 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/capacitor5";
                attribute :>> geometryKind = "box";
            }
            part capacitor6 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/capacitor6";
                attribute :>> geometryKind = "box";
            }
            part capacitor7 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/capacitor7";
                attribute :>> geometryKind = "box";
            }
            part boardStandoff0 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/boardStandoff0";
                attribute :>> geometryKind = "ring";
            }
            part boardStandoff1 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/boardStandoff1";
                attribute :>> geometryKind = "ring";
            }
            part boardStandoff2 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/boardStandoff2";
                attribute :>> geometryKind = "ring";
            }
            part boardStandoff3 : ManufacturedPart[1] {
                attribute :>> cadSelector = "controls/fadec/boardStandoff3";
                attribute :>> geometryKind = "ring";
            }
        }
    }
    part def Services {
        part fuelSupply : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/fuelSupply";
            attribute :>> geometryKind = "ring";
        }
        part fuelSupplyClamps0 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/fuelSupplyClamps0";
            attribute :>> geometryKind = "ring";
        }
        part fuelSupplyClamps1 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/fuelSupplyClamps1";
            attribute :>> geometryKind = "ring";
        }
        part fuelSupplyClamps2 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/fuelSupplyClamps2";
            attribute :>> geometryKind = "ring";
        }
        part fuelSupplyClamps3 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/fuelSupplyClamps3";
            attribute :>> geometryKind = "ring";
        }
        part oilSupply : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/oilSupply";
            attribute :>> geometryKind = "ring";
        }
        part oilSupplyClamps0 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/oilSupplyClamps0";
            attribute :>> geometryKind = "ring";
        }
        part oilSupplyClamps1 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/oilSupplyClamps1";
            attribute :>> geometryKind = "ring";
        }
        part oilSupplyClamps2 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/oilSupplyClamps2";
            attribute :>> geometryKind = "ring";
        }
        part oilSupplyClamps3 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/oilSupplyClamps3";
            attribute :>> geometryKind = "ring";
        }
        part oilScavenge : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/oilScavenge";
            attribute :>> geometryKind = "ring";
        }
        part oilScavengeClamps0 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/oilScavengeClamps0";
            attribute :>> geometryKind = "ring";
        }
        part oilScavengeClamps1 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/oilScavengeClamps1";
            attribute :>> geometryKind = "ring";
        }
        part oilScavengeClamps2 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/oilScavengeClamps2";
            attribute :>> geometryKind = "ring";
        }
        part oilScavengeClamps3 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/oilScavengeClamps3";
            attribute :>> geometryKind = "ring";
        }
        part bleedAir : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/bleedAir";
            attribute :>> geometryKind = "ring";
        }
        part bleedAirClamps0 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/bleedAirClamps0";
            attribute :>> geometryKind = "ring";
        }
        part bleedAirClamps1 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/bleedAirClamps1";
            attribute :>> geometryKind = "ring";
        }
        part bleedAirClamps2 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/bleedAirClamps2";
            attribute :>> geometryKind = "ring";
        }
        part bleedAirClamps3 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/bleedAirClamps3";
            attribute :>> geometryKind = "ring";
        }
        part wiringHarness : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/wiringHarness";
            attribute :>> geometryKind = "ring";
        }
        part wiringHarnessClamps0 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/wiringHarnessClamps0";
            attribute :>> geometryKind = "ring";
        }
        part wiringHarnessClamps1 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/wiringHarnessClamps1";
            attribute :>> geometryKind = "ring";
        }
        part wiringHarnessClamps2 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/wiringHarnessClamps2";
            attribute :>> geometryKind = "ring";
        }
        part wiringHarnessClamps3 : ManufacturedPart[1] {
            attribute :>> cadSelector = "services/wiringHarnessClamps3";
            attribute :>> geometryKind = "ring";
        }
    }
    part def Mounts {
        part frontLug : ManufacturedPart[1] {
            attribute :>> cadSelector = "mounts/frontLug";
            attribute :>> geometryKind = "box";
        }
        part rearLug : ManufacturedPart[1] {
            attribute :>> cadSelector = "mounts/rearLug";
            attribute :>> geometryKind = "box";
        }
        part pylonFairing : ManufacturedPart[1] {
            attribute :>> cadSelector = "mounts/pylonFairing";
            attribute :>> geometryKind = "blade";
            attribute :>> nacaSection = "0018";
        }
    }
    part def Turbofan {
        attribute lengthMm : Real = 3600.0;
        attribute inletDiameterMm : Real = 2000.0;
        part inlet : Inlet;
        part nacelle : Nacelle;
        part fan : Fan;
        part bypass : Bypass;
        part booster : Booster;
        part compressor : Compressor;
        part highTurbine : HighTurbine;
        part lowTurbine : LowTurbine;
        part combustor : Combustor;
        part turbine : Turbine;
        part exhaust : Exhaust;
        part shafts : Shafts;
        part bearings : Bearings;
        part structure : Structure;
        part fasteners : Fasteners;
        part accessories : Accessories;
        part controls : Controls;
        part services : Services;
        part mounts : Mounts;
    }
    part engine : Turbofan;
}
