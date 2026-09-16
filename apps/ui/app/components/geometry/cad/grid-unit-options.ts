import { displayLengthUnits } from '#utils/length-unit.utils.js';

/**
 * Maximum digits for formatting grid size values in engineering notation.
 */
export const maxGridDigits = 3;

/**
 * Ordered list of supported grid unit symbols for the unit selector.
 */
export const gridUnitOrder = ['mm', 'cm', 'm', 'in', 'ft', 'yd'] as const;

/**
 * Grid unit options derived from SI base units, suitable for rendering in a unit selector.
 */
export const gridUnitOptions = displayLengthUnits.map(({ label, symbol }) => ({ label, value: symbol }));
