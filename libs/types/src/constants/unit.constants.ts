type BaseUnit = {
  baseUnit: string;
  unitSymbol: string;
  dimensionSymbol: string;
  quantityName: string;
  unitVariants: Record<
    string,
    {
      unitSymbol: string;
      conversionFactor: number;
    }
  >;
};

export const standardInternationalBaseUnits = {
  length: {
    baseUnit: 'meter',
    unitSymbol: 'm',
    dimensionSymbol: 'L',
    quantityName: 'length',
    unitVariants: {
      millimeter: {
        unitSymbol: 'mm',
        conversionFactor: 0.001,
      },
      centimeter: {
        unitSymbol: 'cm',
        conversionFactor: 0.01,
      },
      inch: {
        unitSymbol: 'in',
        conversionFactor: 0.0254,
      },
      foot: {
        unitSymbol: 'ft',
        conversionFactor: 0.3048,
      },
      yard: {
        unitSymbol: 'yd',
        conversionFactor: 0.9144,
      },
    },
  },
  mass: {
    baseUnit: 'kilogram',
    unitSymbol: 'kg',
    dimensionSymbol: 'M',
    quantityName: 'mass',
    unitVariants: {
      gram: {
        unitSymbol: 'g',
        conversionFactor: 0.001,
      },
      milligram: {
        unitSymbol: 'mg',
        conversionFactor: 1e-6,
      },
      ton: {
        unitSymbol: 't',
        conversionFactor: 1000,
      },
      pound: {
        unitSymbol: 'lb',
        conversionFactor: 0.453_592_37,
      },
      ounce: {
        unitSymbol: 'oz',
        conversionFactor: 0.028_349_523_125,
      },
    },
  },
  time: {
    baseUnit: 'second',
    unitSymbol: 's',
    dimensionSymbol: 'T',
    quantityName: 'time',
    unitVariants: {
      millisecond: {
        unitSymbol: 'ms',
        conversionFactor: 0.001,
      },
      microsecond: {
        unitSymbol: 'µs',
        conversionFactor: 1e-6,
      },
      nanosecond: {
        unitSymbol: 'ns',
        conversionFactor: 1e-9,
      },
      minute: {
        unitSymbol: 'min',
        conversionFactor: 60,
      },
      hour: {
        unitSymbol: 'h',
        conversionFactor: 3600,
      },
    },
  },
  electricCurrent: {
    baseUnit: 'ampere',
    unitSymbol: 'A',
    dimensionSymbol: 'I',
    quantityName: 'electric current',
    unitVariants: {
      milliampere: {
        unitSymbol: 'mA',
        conversionFactor: 0.001,
      },
      microampere: {
        unitSymbol: 'µA',
        conversionFactor: 1e-6,
      },
    },
  },
  thermodynamicTemperature: {
    baseUnit: 'kelvin',
    unitSymbol: 'K',
    dimensionSymbol: 'Θ',
    quantityName: 'thermodynamic temperature',
    unitVariants: {
      celsius: {
        unitSymbol: '°C',
        conversionFactor: 1,
      },
      fahrenheit: {
        unitSymbol: '°F',
        conversionFactor: 5 / 9,
      },
    },
  },
  amountOfSubstance: {
    baseUnit: 'mole',
    unitSymbol: 'mol',
    dimensionSymbol: 'N',
    quantityName: 'amount of substance',
    unitVariants: {
      millimole: {
        unitSymbol: 'mmol',
        conversionFactor: 0.001,
      },
      micromole: {
        unitSymbol: 'µmol',
        conversionFactor: 1e-6,
      },
    },
  },
  luminousIntensity: {
    baseUnit: 'candela',
    unitSymbol: 'cd',
    dimensionSymbol: 'J',
    quantityName: 'luminous intensity',
    unitVariants: {
      millicandela: {
        unitSymbol: 'mcd',
        conversionFactor: 0.001,
      },
    },
  },
} as const satisfies Record<string, BaseUnit>;

export const standardInternationalDerivedUnits = {
  planeAngle: {
    baseUnit: 'radian',
    unitSymbol: 'rad',
    dimensionSymbol: 'Θ',
    quantityName: 'plane angle',
    unitVariants: {
      degree: {
        unitSymbol: '°',
        conversionFactor: Math.PI / 180,
      },
      gradian: {
        unitSymbol: 'grad',
        conversionFactor: Math.PI / 200,
      },
      arcminute: {
        unitSymbol: '′',
        conversionFactor: Math.PI / 10_800,
      },
      arcsecond: {
        unitSymbol: '″',
        conversionFactor: Math.PI / 648_000,
      },
    },
  },
  solidAngle: {
    baseUnit: 'steradian',
    unitSymbol: 'sr',
    dimensionSymbol: '',
    quantityName: 'solid angle',
    unitVariants: {},
  },
  frequency: {
    baseUnit: 'hertz',
    unitSymbol: 'Hz',
    dimensionSymbol: 's⁻¹',
    quantityName: 'frequency',
    unitVariants: {
      kilohertz: {
        unitSymbol: 'kHz',
        conversionFactor: 1000,
      },
      megahertz: {
        unitSymbol: 'MHz',
        conversionFactor: 1_000_000,
      },
      gigahertz: {
        unitSymbol: 'GHz',
        conversionFactor: 1_000_000_000,
      },
    },
  },
  force: {
    baseUnit: 'newton',
    unitSymbol: 'N',
    dimensionSymbol: 'kg⋅m⋅s⁻²',
    quantityName: 'force',
    unitVariants: {
      kilonewton: {
        unitSymbol: 'kN',
        conversionFactor: 1000,
      },
      meganewton: {
        unitSymbol: 'MN',
        conversionFactor: 1_000_000,
      },
      poundForce: {
        unitSymbol: 'lbf',
        conversionFactor: 4.448_221_615_260_5,
      },
    },
  },
  pressure: {
    baseUnit: 'pascal',
    unitSymbol: 'Pa',
    dimensionSymbol: 'kg⋅m⁻¹⋅s⁻²',
    quantityName: 'pressure, stress',
    unitVariants: {
      kilopascal: {
        unitSymbol: 'kPa',
        conversionFactor: 1000,
      },
      megapascal: {
        unitSymbol: 'MPa',
        conversionFactor: 1_000_000,
      },
      bar: {
        unitSymbol: 'bar',
        conversionFactor: 100_000,
      },
      psi: {
        unitSymbol: 'psi',
        conversionFactor: 6894.757_293_168,
      },
    },
  },
  energy: {
    baseUnit: 'joule',
    unitSymbol: 'J',
    dimensionSymbol: 'kg⋅m²⋅s⁻²',
    quantityName: 'energy, work, amount of heat',
    unitVariants: {
      kilojoule: {
        unitSymbol: 'kJ',
        conversionFactor: 1000,
      },
      megajoule: {
        unitSymbol: 'MJ',
        conversionFactor: 1_000_000,
      },
      wattHour: {
        unitSymbol: 'Wh',
        conversionFactor: 3600,
      },
      kilowattHour: {
        unitSymbol: 'kWh',
        conversionFactor: 3_600_000,
      },
    },
  },
  power: {
    baseUnit: 'watt',
    unitSymbol: 'W',
    dimensionSymbol: 'kg⋅m²⋅s⁻³',
    quantityName: 'power, radiant flux',
    unitVariants: {
      milliwatt: {
        unitSymbol: 'mW',
        conversionFactor: 0.001,
      },
      kilowatt: {
        unitSymbol: 'kW',
        conversionFactor: 1000,
      },
      megawatt: {
        unitSymbol: 'MW',
        conversionFactor: 1_000_000,
      },
    },
  },
  electricCharge: {
    baseUnit: 'coulomb',
    unitSymbol: 'C',
    dimensionSymbol: 's⋅A',
    quantityName: 'electric charge',
    unitVariants: {
      millicoulomb: {
        unitSymbol: 'mC',
        conversionFactor: 0.001,
      },
      microcoulomb: {
        unitSymbol: 'µC',
        conversionFactor: 0.000_001,
      },
    },
  },
  electricPotential: {
    baseUnit: 'volt',
    unitSymbol: 'V',
    dimensionSymbol: 'kg⋅m²⋅s⁻³⋅A⁻¹',
    quantityName: 'electric potential difference',
    unitVariants: {
      millivolt: {
        unitSymbol: 'mV',
        conversionFactor: 0.001,
      },
      microvolt: {
        unitSymbol: 'µV',
        conversionFactor: 0.000_001,
      },
      kilovolt: {
        unitSymbol: 'kV',
        conversionFactor: 1000,
      },
    },
  },
  capacitance: {
    baseUnit: 'farad',
    unitSymbol: 'F',
    dimensionSymbol: 'kg⁻¹⋅m⁻²⋅s⁴⋅A²',
    quantityName: 'capacitance',
    unitVariants: {
      millifarad: {
        unitSymbol: 'mF',
        conversionFactor: 0.001,
      },
      microfarad: {
        unitSymbol: 'µF',
        conversionFactor: 0.000_001,
      },
      nanofarad: {
        unitSymbol: 'nF',
        conversionFactor: 0.000_000_001,
      },
      picofarad: {
        unitSymbol: 'pF',
        conversionFactor: 0.000_000_000_001,
      },
    },
  },
  electricalResistance: {
    baseUnit: 'ohm',
    unitSymbol: 'Ω',
    dimensionSymbol: 'kg⋅m²⋅s⁻³⋅A⁻²',
    quantityName: 'electrical resistance',
    unitVariants: {
      kilohm: {
        unitSymbol: 'kΩ',
        conversionFactor: 1000,
      },
      megohm: {
        unitSymbol: 'MΩ',
        conversionFactor: 1_000_000,
      },
    },
  },
  electricalConductance: {
    baseUnit: 'siemens',
    unitSymbol: 'S',
    dimensionSymbol: 'kg⁻¹⋅m⁻²⋅s³⋅A²',
    quantityName: 'electrical conductance',
    unitVariants: {
      millisiemens: {
        unitSymbol: 'mS',
        conversionFactor: 0.001,
      },
      microsiemens: {
        unitSymbol: 'µS',
        conversionFactor: 0.000_001,
      },
    },
  },
  magneticFlux: {
    baseUnit: 'weber',
    unitSymbol: 'Wb',
    dimensionSymbol: 'kg⋅m²⋅s⁻²⋅A⁻¹',
    quantityName: 'magnetic flux',
    unitVariants: {
      milliweber: {
        unitSymbol: 'mWb',
        conversionFactor: 0.001,
      },
    },
  },
  magneticFluxDensity: {
    baseUnit: 'tesla',
    unitSymbol: 'T',
    dimensionSymbol: 'kg⋅s⁻²⋅A⁻¹',
    quantityName: 'magnetic flux density',
    unitVariants: {
      millitesla: {
        unitSymbol: 'mT',
        conversionFactor: 0.001,
      },
      microtesla: {
        unitSymbol: 'µT',
        conversionFactor: 0.000_001,
      },
    },
  },
  inductance: {
    baseUnit: 'henry',
    unitSymbol: 'H',
    dimensionSymbol: 'kg⋅m²⋅s⁻²⋅A⁻²',
    quantityName: 'inductance',
    unitVariants: {
      millihenry: {
        unitSymbol: 'mH',
        conversionFactor: 0.001,
      },
      microhenry: {
        unitSymbol: 'µH',
        conversionFactor: 0.000_001,
      },
    },
  },
  celsiusTemperature: {
    baseUnit: 'degreeCelsius',
    unitSymbol: '°C',
    dimensionSymbol: 'K',
    quantityName: 'Celsius temperature',
    unitVariants: {},
  },
  luminousFlux: {
    baseUnit: 'lumen',
    unitSymbol: 'lm',
    dimensionSymbol: 'cd⋅sr',
    quantityName: 'luminous flux',
    unitVariants: {
      millilumen: {
        unitSymbol: 'mlm',
        conversionFactor: 0.001,
      },
    },
  },
  illuminance: {
    baseUnit: 'lux',
    unitSymbol: 'lx',
    dimensionSymbol: 'cd⋅sr⋅m⁻²',
    quantityName: 'illuminance',
    unitVariants: {
      millilux: {
        unitSymbol: 'mlx',
        conversionFactor: 0.001,
      },
    },
  },
  activityRadionuclide: {
    baseUnit: 'becquerel',
    unitSymbol: 'Bq',
    dimensionSymbol: 's⁻¹',
    quantityName: 'activity referred to a radionuclide',
    unitVariants: {
      kilobecquerel: {
        unitSymbol: 'kBq',
        conversionFactor: 1000,
      },
      megabecquerel: {
        unitSymbol: 'MBq',
        conversionFactor: 1_000_000,
      },
    },
  },
  absorbedDose: {
    baseUnit: 'gray',
    unitSymbol: 'Gy',
    dimensionSymbol: 'm²⋅s⁻²',
    quantityName: 'absorbed dose, kerma',
    unitVariants: {
      milligray: {
        unitSymbol: 'mGy',
        conversionFactor: 0.001,
      },
      microgray: {
        unitSymbol: 'µGy',
        conversionFactor: 0.000_001,
      },
    },
  },
  doseEquivalent: {
    baseUnit: 'sievert',
    unitSymbol: 'Sv',
    dimensionSymbol: 'm²⋅s⁻²',
    quantityName: 'dose equivalent',
    unitVariants: {
      millisievert: {
        unitSymbol: 'mSv',
        conversionFactor: 0.001,
      },
      microsievert: {
        unitSymbol: 'µSv',
        conversionFactor: 0.000_001,
      },
    },
  },
  catalyticActivity: {
    baseUnit: 'katal',
    unitSymbol: 'kat',
    dimensionSymbol: 'mol⋅s⁻¹',
    quantityName: 'catalytic activity',
    unitVariants: {
      millikatal: {
        unitSymbol: 'mkat',
        conversionFactor: 0.001,
      },
      microkatal: {
        unitSymbol: 'µkat',
        conversionFactor: 0.000_001,
      },
    },
  },
  area: {
    baseUnit: 'squareMeter',
    unitSymbol: 'm²',
    dimensionSymbol: 'm²',
    quantityName: 'area',
    unitVariants: {
      squareMillimeter: {
        unitSymbol: 'mm²',
        conversionFactor: 0.000_001,
      },
      squareCentimeter: {
        unitSymbol: 'cm²',
        conversionFactor: 0.0001,
      },
      squareInch: {
        unitSymbol: 'in²',
        conversionFactor: 0.000_645_16,
      },
      squareFoot: {
        unitSymbol: 'ft²',
        conversionFactor: 0.092_903_04,
      },
    },
  },
  volume: {
    baseUnit: 'cubicMeter',
    unitSymbol: 'm³',
    dimensionSymbol: 'm³',
    quantityName: 'volume',
    unitVariants: {
      cubicMillimeter: {
        unitSymbol: 'mm³',
        conversionFactor: 0.000_000_001,
      },
      cubicCentimeter: {
        unitSymbol: 'cm³',
        conversionFactor: 0.000_001,
      },
      liter: {
        unitSymbol: 'L',
        conversionFactor: 0.001,
      },
      milliliter: {
        unitSymbol: 'mL',
        conversionFactor: 0.000_001,
      },
      cubicInch: {
        unitSymbol: 'in³',
        conversionFactor: 0.000_016_387_064,
      },
      cubicFoot: {
        unitSymbol: 'ft³',
        conversionFactor: 0.028_316_846_592,
      },
      gallon: {
        unitSymbol: 'gal',
        conversionFactor: 0.003_785_411_784,
      },
    },
  },
  velocity: {
    baseUnit: 'meterPerSecond',
    unitSymbol: 'm/s',
    dimensionSymbol: 'm⋅s⁻¹',
    quantityName: 'velocity',
    unitVariants: {
      kilometerPerHour: {
        unitSymbol: 'km/h',
        conversionFactor: 0.277_777_778,
      },
      milePerHour: {
        unitSymbol: 'mph',
        conversionFactor: 0.447_04,
      },
      footPerSecond: {
        unitSymbol: 'ft/s',
        conversionFactor: 0.3048,
      },
    },
  },
  acceleration: {
    baseUnit: 'meterPerSecondSquared',
    unitSymbol: 'm/s²',
    dimensionSymbol: 'm⋅s⁻²',
    quantityName: 'acceleration',
    unitVariants: {
      gravity: {
        unitSymbol: 'g',
        conversionFactor: 9.806_65,
      },
    },
  },
  torque: {
    baseUnit: 'newtonMeter',
    unitSymbol: 'N⋅m',
    dimensionSymbol: 'kg⋅m²⋅s⁻²',
    quantityName: 'torque',
    unitVariants: {
      newtonMillimeter: {
        unitSymbol: 'N⋅mm',
        conversionFactor: 0.001,
      },
      poundFoot: {
        unitSymbol: 'lb⋅ft',
        conversionFactor: 1.355_817_948_331_4,
      },
      poundInch: {
        unitSymbol: 'lb⋅in',
        conversionFactor: 0.112_984_829_027_616_7,
      },
    },
  },
  density: {
    baseUnit: 'kilogramPerCubicMeter',
    unitSymbol: 'kg/m³',
    dimensionSymbol: 'kg⋅m⁻³',
    quantityName: 'density',
    unitVariants: {
      gramPerCubicCentimeter: {
        unitSymbol: 'g/cm³',
        conversionFactor: 1000,
      },
      poundPerCubicFoot: {
        unitSymbol: 'lb/ft³',
        conversionFactor: 16.018_463_373_960_142,
      },
    },
  },
} as const satisfies Record<string, BaseUnit>;

export const standardInternationalConstants = {
  hyperfineFrequency: 9_192_631_770,
  speedOfLight: 299_792_458,
  planckConstant: 6.626_070_15e-34,
  elementaryCharge: 1.602_176_634e-19,
  avogadroConstant: 6.022_140_76e23,
  boltzmannConstant: 1.380_649e-23,
  molarGasConstant: 8.314_462_618_153_24,
} as const;
