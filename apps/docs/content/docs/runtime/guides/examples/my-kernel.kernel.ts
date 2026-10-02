import {
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  nonemptyExportFiles,
} from '@taucad/runtime/kernel';

const toSvg = (source: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text>${source.length}</text></svg>`;

export const myKernel = defineKernel({
  id: 'my-kernel',
  extensions: ['myformat'],
  name: 'MyKernel',
  version: '1.0.0',
  views: { drawing: { title: 'Drawing', mimeType: 'image/svg+xml' } },
  exports: { drawing: { title: 'Drawing', mimeType: 'image/svg+xml', extension: 'svg' } },

  async initialize() {
    return {};
  },
  async resolve({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async describe() {
    return createKernelSuccess({
      parameters: createKernelParameterDeclaration(
        {},
        { type: 'object', properties: {}, additionalProperties: false },
        { id: 'urn:taucad:docs:my-kernel', name: 'MyKernelParameters' },
      ),
    });
  },
  async evaluate({ entryPath }, services) {
    const source = await services.filesystem.readFile(entryPath, 'utf8');
    return { handle: { source }, views: ['drawing'], exports: ['drawing'] };
  },
  async render({ handle }) {
    return { content: toSvg(handle.source) };
  },
  async export({ handle }) {
    return {
      files: nonemptyExportFiles([
        {
          name: 'model.svg',
          mimeType: 'image/svg+xml',
          bytes: new TextEncoder().encode(toSvg(handle.source)),
        },
      ]),
    };
  },
});
