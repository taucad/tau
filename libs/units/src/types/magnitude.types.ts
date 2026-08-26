import type { siMagnitudes } from '#constants/magnitude.constants.js';

/** @public */
export type UnitMagnitude = (typeof siMagnitudes)[number];

/** @public */
export type UnitMagnitudeSymbol = UnitMagnitude['symbol'];

/** @public */
export type UnitMagnitudeFactor = UnitMagnitude['factor'];

/** @public */
export type UnitMagnitudeName = UnitMagnitude['name'];
