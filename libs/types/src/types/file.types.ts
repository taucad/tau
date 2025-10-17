import type { exportFormats } from '#constants/file.constants.js';

export type ExportFormat = (typeof exportFormats)[number];
