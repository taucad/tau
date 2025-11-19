import type { siMagnitudes } from '#constants/magnitude.constants.js';

export type UnitMagnitude = (typeof siMagnitudes)[number];

export type UnitMagnitudeSymbol = UnitMagnitude['symbol'];

export type UnitMagnitudeFactor = UnitMagnitude['factor'];

export type UnitMagnitudeName = UnitMagnitude['name'];
