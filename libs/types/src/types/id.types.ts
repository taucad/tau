import type { idPrefix } from '#constants/id.constants.js';

/** @public */
export type IdPrefix = (typeof idPrefix)[keyof typeof idPrefix];
