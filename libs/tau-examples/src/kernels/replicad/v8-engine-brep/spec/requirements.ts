import { defaultParams, crankStations, type Params } from '../lib/params.js';

type GeoSpecComponentSelector = string | RegExp;

type GeoSpecComponentInterferencePairExpectation = {
  left: GeoSpecComponentSelector;
  right: GeoSpecComponentSelector;
};

type GeoSpecComponentInterferenceAllowance = {
  kind: 'intentionalInterference';
  left: GeoSpecComponentSelector;
  right: GeoSpecComponentSelector;
  maxVolume?: number;
  reason: string;
};

type GeoSpecSpatialRelationshipExpectation = {
  id?: string;
  kind:
    | 'contact'
    | 'clearance'
    | 'coaxial'
    | 'coplanar'
    | 'parallel'
    | 'perpendicular'
    | 'containment'
    | 'interference';
  subject: GeoSpecComponentSelector;
  target: GeoSpecComponentSelector;
  tolerance?: number;
  angularToleranceDegrees?: number;
  min?: number;
  max?: number;
  minVolume?: number;
  maxVolume?: number;
  reason?: string;
};

export const requirementIds = {
  structure: 'REQ-V8-STRUCT-001',
  brep: 'REQ-V8-BREP-001',
  clearance: 'REQ-V8-CLEAR-001',
  rotating: 'REQ-V8-ROT-001',
  reciprocating: 'REQ-V8-RECIP-001',
  valvetrain: 'REQ-V8-VALVE-001',
  induction: 'REQ-V8-INDUCTION-001',
  lubrication: 'REQ-V8-LUBE-001',
  fastening: 'REQ-V8-FASTEN-001',
} as const;

export const tolerances = {
  coarse: 5,
  medium: 1,
  fine: 0.1,
  overlap: 0.05,
  distanceSamples: 8000,
} as const;

export const expectedCounts = {
  cylinders: defaultParams.bores * 2,
  pistons: defaultParams.bores * 2,
  pistonRings: defaultParams.bores * 2 * 3,
  wristPins: defaultParams.bores * 2,
  connectingRods: defaultParams.bores * 2,
  mainBearings: defaultParams.bores + 1,
  rodBearings: defaultParams.bores,
  valves: defaultParams.bores * 2 * 2,
  valveSprings: defaultParams.bores * 2 * 2,
  pushrods: defaultParams.bores * 2 * 2,
  rockerArms: defaultParams.bores * 2 * 2,
  sparkPlugs: defaultParams.bores * 2,
  injectors: defaultParams.bores * 2,
  exhaustRunners: defaultParams.bores * 2,
  intakeRunners: defaultParams.bores * 2,
} as const;

export const requiredAssemblyNames = [
  'Block',
  'Crankshaft',
  'Harmonic Damper',
  'Flywheel',
  'Oil Pan',
  'Camshaft',
  'Timing Chain',
  'Front Timing Cover',
  'Oil Pump',
  'Oil Pickup Tube',
  'Oil Filter',
  'Water Pump',
  'Thermostat Housing',
  'Coolant Outlet',
  'Intake Plenum',
  'Throttle Body',
  'Fuel Rail L',
  'Fuel Rail R',
  'Exhaust Collector L',
  'Exhaust Collector R',
  'Cylinder Head L',
  'Cylinder Head R',
  'Valve Cover L',
  'Valve Cover R',
  'Head Gasket L',
  'Head Gasket R',
  'Valve Cover Gasket L',
  'Valve Cover Gasket R',
] as const;

export const repeatedNamePatterns = [
  /^Piston \d+$/,
  /^Piston Ring \d+\.\d+$/,
  /^Wrist Pin \d+$/,
  /^Con Rod \d+$/,
  /^Spark Plug \d+$/,
  /^(Intake|Exhaust) Valve \d+$/,
  /^(Intake|Exhaust) Valve Spring \d+$/,
  /^(Intake|Exhaust) Pushrod \d+$/,
  /^(Intake|Exhaust) Rocker Arm \d+$/,
  /^(Intake|Exhaust) Lifter \d+$/,
  /^(Intake|Exhaust) Valve Retainer \d+$/,
  /^Fuel Injector [LR]\d+$/,
  /^Exhaust Runner [LR]\d+$/,
  /^Intake Runner [LR]\d+ (Upper|Lower)$/,
] as const;

export const expectedAssemblyProductNames = (
  p: Params = defaultParams,
): string[] => {
  const names = [...requiredAssemblyNames, 'Oil Pan Gasket'];

  for (let index = 1; index <= p.bores * 2; index++) {
    names.push(`Piston ${index}`);
    names.push(`Wrist Pin ${index}`);
    names.push(`Con Rod ${index}`);
    names.push(`Spark Plug ${index}`);
    for (let ring = 1; ring <= 3; ring++) {
      names.push(`Piston Ring ${index}.${ring}`);
    }
  }

  for (let index = 1; index <= p.bores + 1; index++) {
    names.push(`Main Bearing ${index}`);
    names.push(`Main Bearing Cap ${index}`);
  }

  for (let index = 1; index <= p.bores; index++) {
    names.push(`Rod Bearing ${index}`);
  }

  for (const sideName of ['L', 'R'] as const) {
    for (let bore = 1; bore <= p.bores; bore++) {
      names.push(`Fuel Injector ${sideName}${bore}`);
      names.push(`Exhaust Runner ${sideName}${bore}`);
      names.push(`Intake Runner ${sideName}${bore} Upper`);
      names.push(`Intake Runner ${sideName}${bore} Lower`);
    }
  }

  for (let cylinderIndex = 0; cylinderIndex < p.bores * 2; cylinderIndex++) {
    for (const [slot, ordinal] of [
      ['Intake', cylinderIndex * 2 + 1],
      ['Exhaust', cylinderIndex * 2 + 2],
    ] as const) {
      names.push(`${slot} Valve ${ordinal}`);
      names.push(`${slot} Valve Spring ${ordinal}`);
      names.push(`${slot} Rocker Arm ${ordinal}`);
      names.push(`${slot} Lifter ${ordinal}`);
      names.push(`${slot} Pushrod ${ordinal}`);
      names.push(`${slot} Valve Retainer ${ordinal}`);
    }
  }

  return names;
};

export const engineEnvelope = (p: Params = defaultParams) => {
  const st = crankStations(p);
  return {
    size: {
      x: st.totalLen + p.damperThk + p.flywheelThk + 80,
      y: p.deckHeight * 3.1,
      z: p.deckHeight + p.headThk + p.valveCoverHeight + 120,
    },
    center: {
      x: st.totalLen / 2,
      y: 0,
      z: 70,
    },
  };
};

export const featureExpectations = (p: Params = defaultParams) => ({
  mainJournalRadius: p.mainJournalDia / 2,
  crankpinRadius: p.crankpinDia / 2,
  pistonRadius: p.crownDia / 2,
  pinBoreDiameter: p.pinBoreDia,
  sparkPlugDiameter: p.plugThreadDia,
  flywheelBoltDiameter: p.flangeBoltDia,
  minimumWallThickness: Math.min(
    p.blockWallThk,
    p.gasketThk,
    p.ringGrooveWidth,
  ),
});

export const expectedIntentionalInterferenceAllowances =
  (): GeoSpecComponentInterferenceAllowance[] => [];

export const expectedGrossInterfacePairs =
  (): GeoSpecComponentInterferencePairExpectation[] => [
    { left: 'Crankshaft', right: 'Block' },
    { left: 'Block', right: 'Flywheel' },
    { left: 'Block', right: 'Oil Filter' },
    { left: 'Block', right: 'Piston 1' },
    { left: 'Block', right: 'Piston 3' },
    { left: 'Block', right: 'Piston 7' },
    { left: 'Block', right: 'Piston 8' },
    { left: 'Valve Cover L', right: 'Cylinder Head L' },
    { left: 'Valve Cover R', right: 'Cylinder Head R' },
    { left: 'Cylinder Head L', right: 'Exhaust Runner L1' },
    { left: 'Cylinder Head R', right: 'Exhaust Runner R1' },
  ];

export const expectedProductionSpatialRelationships = (
  p: Params = defaultParams,
): GeoSpecSpatialRelationshipExpectation[] => {
  const relationships: GeoSpecSpatialRelationshipExpectation[] = [
    {
      id: 'damper seats on crank snout',
      kind: 'contact',
      subject: 'Harmonic Damper',
      target: 'Crankshaft',
      tolerance: tolerances.medium,
    },
    {
      id: 'flywheel seats on rear crank flange',
      kind: 'contact',
      subject: 'Flywheel',
      target: 'Crankshaft',
      tolerance: tolerances.medium,
    },
    {
      id: 'throttle body attaches to intake plenum',
      kind: 'contact',
      subject: 'Throttle Body',
      target: 'Intake Plenum',
      tolerance: tolerances.medium,
    },
    {
      id: 'left head gasket is seated between block and left head',
      kind: 'contact',
      subject: 'Head Gasket L',
      target: 'Cylinder Head L',
      tolerance: tolerances.medium,
    },
    {
      id: 'right head gasket is seated between block and right head',
      kind: 'contact',
      subject: 'Head Gasket R',
      target: 'Cylinder Head R',
      tolerance: tolerances.medium,
    },
    {
      id: 'left valve cover gasket seats on left cover',
      kind: 'contact',
      subject: 'Valve Cover Gasket L',
      target: 'Valve Cover L',
      tolerance: tolerances.medium,
    },
    {
      id: 'right valve cover gasket seats on right cover',
      kind: 'contact',
      subject: 'Valve Cover Gasket R',
      target: 'Valve Cover R',
      tolerance: tolerances.medium,
    },
  ];

  for (let cylinder = 1; cylinder <= p.bores * 2; cylinder++) {
    relationships.push(
      {
        id: `piston ${cylinder} contains wrist pin ${cylinder}`,
        kind: 'containment',
        subject: `Wrist Pin ${cylinder}`,
        target: `Piston ${cylinder}`,
        tolerance: tolerances.medium,
      },
      {
        id: `connecting rod ${cylinder} engages wrist pin ${cylinder}`,
        kind: 'contact',
        subject: `Con Rod ${cylinder}`,
        target: `Wrist Pin ${cylinder}`,
        tolerance: tolerances.medium,
      },
      {
        id: `connecting rod ${cylinder} engages crankshaft`,
        kind: 'contact',
        subject: `Con Rod ${cylinder}`,
        target: 'Crankshaft',
        tolerance: tolerances.medium,
      },
    );

    for (let ring = 1; ring <= 3; ring++) {
      relationships.push({
        id: `piston ring ${cylinder}.${ring} seats in piston ${cylinder}`,
        kind: 'contact',
        subject: `Piston Ring ${cylinder}.${ring}`,
        target: `Piston ${cylinder}`,
        tolerance: tolerances.medium,
      });
    }
  }

  for (const sideName of ['L', 'R'] as const) {
    for (let bore = 1; bore <= p.bores; bore++) {
      relationships.push(
        {
          id: `intake runner ${sideName}${bore} upper attaches to plenum`,
          kind: 'clearance',
          subject: `Intake Runner ${sideName}${bore} Upper`,
          target: 'Intake Plenum',
          tolerance: tolerances.medium,
          min: 0,
          max: 10,
        },
        {
          id: `intake runner ${sideName}${bore} lower attaches to upper`,
          kind: 'clearance',
          subject: `Intake Runner ${sideName}${bore} Lower`,
          target: `Intake Runner ${sideName}${bore} Upper`,
          tolerance: tolerances.medium,
          min: 0,
          max: 12,
        },
        {
          id: `intake runner ${sideName}${bore} lower attaches to cylinder head`,
          kind: 'contact',
          subject: `Intake Runner ${sideName}${bore} Lower`,
          target: `Cylinder Head ${sideName}`,
          tolerance: tolerances.medium,
        },
        {
          id: `fuel injector ${sideName}${bore} connects fuel rail to intake runner`,
          kind: 'clearance',
          subject: `Fuel Injector ${sideName}${bore}`,
          target: `Fuel Rail ${sideName}`,
          tolerance: tolerances.medium,
          min: 0,
          max: 6,
        },
        {
          id: `exhaust runner ${sideName}${bore} attaches to cylinder head`,
          kind: 'clearance',
          subject: `Exhaust Runner ${sideName}${bore}`,
          target: `Cylinder Head ${sideName}`,
          tolerance: tolerances.medium,
          min: 0,
          max: 92,
        },
        {
          id: `exhaust runner ${sideName}${bore} attaches to collector`,
          kind: 'contact',
          subject: `Exhaust Runner ${sideName}${bore}`,
          target: `Exhaust Collector ${sideName}`,
          tolerance: tolerances.medium,
        },
      );
    }
  }

  return relationships;
};
