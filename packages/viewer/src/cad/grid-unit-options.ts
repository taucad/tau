import { lengthUnitOptions } from '#constants/length-units.js';

/**
 * Maximum digits for formatting grid size values in engineering notation.
 */
export const maxGridDigits = 3;

/**
 * Ordered list of supported grid unit symbols for the unit selector.
 */
export const gridUnitOrder = lengthUnitOptions.map(({ symbol }) => symbol);

/**
 * Grid unit options derived from SI base units, suitable for rendering in a unit selector.
 */
export const gridUnitOptions = lengthUnitOptions.map(({ label, symbol }) => ({ label, value: symbol }));
