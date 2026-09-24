import { defineTranscoder } from '@taucad/runtime/transcoder';

/** `slicer` transcoder capability. @public */
export const slicerTranscoder = defineTranscoder({
  id: 'slicer',
  name: 'slicerTranscoder',
  version: '1.0.0',
  edges: [],
  async initialize() {
    return {};
  },
  async transcode() {
    return {
      success: false,
      issues: [{ message: 'TODO: implement slicer transcoding', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
    };
  },
});
