import type { idPrefix } from '#/constants/id.constants.js';

export type IdPrefix = (typeof idPrefix)[keyof typeof idPrefix];
