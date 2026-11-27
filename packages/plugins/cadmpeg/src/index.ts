/* oxlint-disable no-barrel-files/no-barrel-files -- public package entry */
export { cadmpeg, cadmpeg as plugin } from '#cadmpeg.plugin.js';

export { cadmpegKernel } from '#cadmpeg.kernel.js';

export { cadmpegTranscoder } from '#cadmpeg.transcoder.js';

export type {
  CadmpegEngineFailure,
  CadmpegEngineIntegrityCheck,
  CadmpegEngineIssueDetails,
  CadmpegEngines,
  CadmpegOptions,
} from '#cadmpeg-engines.js';
