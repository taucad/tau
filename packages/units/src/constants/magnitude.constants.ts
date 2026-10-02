type UnitMagnitude = {
  name: string;
  symbol: string;
  factor: number;
};

export const siMagnitudes = [
  {
    name: 'quetta',
    symbol: 'Q',
    factor: 1e30,
  },
  {
    name: 'ronna',
    symbol: 'R',
    factor: 1e27,
  },
  {
    name: 'yotta',
    symbol: 'Y',
    factor: 1e24,
  },
  {
    name: 'zetta',
    symbol: 'Z',
    factor: 1e21,
  },
  {
    name: 'exa',
    symbol: 'E',
    factor: 1e18,
  },
  {
    name: 'peta',
    symbol: 'P',
    factor: 1e15,
  },
  {
    name: 'tera',
    symbol: 'T',
    factor: 1e12,
  },
  {
    name: 'giga',
    symbol: 'G',
    factor: 1e9,
  },
  {
    name: 'mega',
    symbol: 'M',
    factor: 1e6,
  },
  {
    name: 'kilo',
    symbol: 'k',
    factor: 1e3,
  },
  {
    name: 'hecto',
    symbol: 'h',
    factor: 1e2,
  },
  {
    name: 'deca',
    symbol: 'da',
    factor: 1e1,
  },
  {
    name: '',
    symbol: '',
    factor: 1,
  },
  {
    name: 'deci',
    symbol: 'd',
    factor: 1e-1,
  },
  {
    name: 'centi',
    symbol: 'c',
    factor: 1e-2,
  },
  {
    name: 'milli',
    symbol: 'm',
    factor: 1e-3,
  },
  {
    name: 'micro',
    symbol: 'μ',
    factor: 1e-6,
  },
  {
    name: 'nano',
    symbol: 'n',
    factor: 1e-9,
  },
  {
    name: 'pico',
    symbol: 'p',
    factor: 1e-12,
  },
  {
    name: 'femto',
    symbol: 'f',
    factor: 1e-15,
  },
  {
    name: 'atto',
    symbol: 'a',
    factor: 1e-18,
  },
  {
    name: 'zepto',
    symbol: 'z',
    factor: 1e-21,
  },
  {
    name: 'yocto',
    symbol: 'y',
    factor: 1e-24,
  },
  {
    name: 'ronto',
    symbol: 'r',
    factor: 1e-27,
  },
  {
    name: 'quecto',
    symbol: 'q',
    factor: 1e-30,
  },
] as const satisfies UnitMagnitude[];
