import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TauViewerModel } from '@taucad/mcp/viewer-protocol';
import type { ExportEntryState, ExportSource } from '@taucad/workbench-panes/export/export-source';
// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load this package's own package.json (matches `packages/runtime/src/utils/package-info.ts`).
import packageJson from '../../package.json' with { type: 'json' };
import { ToolCallError } from '#app/host-bridge.js';
import type { HostBridge, HostView } from '#app/host-bridge.js';
import { createExportSource, viewerExportTool } from '#app/sources/export-source.js';

const model: TauViewerModel = {
  id: 'm1',
  title: 'Gear',
  path: '.tau/artifacts/abc/gear.glb',
  sourceFile: 'gear.ts',
  mimeType: 'model/gltf-binary',
  byteLength: 3,
  sha256: 'a'.repeat(64),
};

const listed = {
  kernelId: 'replicad',
  formats: [
    { format: 'step', fidelity: 'brep', direct: true, provider: 'replicad' },
    {
      format: 'stl',
      fidelity: 'mesh',
      direct: true,
      provider: 'replicad',
      exportOptions: {
        schema: { type: 'object', properties: { binary: { type: 'boolean' } } },
        defaults: { binary: true },
      },
    },
    {
      format: 'not-a-catalog-format',
      fidelity: 'mesh',
      direct: true,
      provider: 'replicad',
    },
  ],
};

const exported = (format: string) => ({
  to: format,
  exportId: format,
  files: [
    {
      name: `model.${format}`,
      artifactPath: `.tau/artifacts/x/model.${format}`,
      mimeType: 'model/stl',
      byteLength: 5,
    },
  ],
});

const createBridge = (kind: HostView['kind']) => {
  const callTool = vi.fn<HostBridge['callTool']>(async (name, args) => {
    if (name === viewerExportTool.formats) {
      return listed;
    }
    if (name === 'export_model') {
      return exported(String(args['to']));
    }
    if (name === viewerExportTool.save) {
      return { files: [] };
    }
    if (name === viewerExportTool.readArtifact) {
      return {
        offset: args['offset'],
        byteLength: 5,
        totalBytes: 5,
        data: Buffer.from('solid').toString('base64'),
      };
    }
    throw new Error(`unexpected ${name}`);
  });
  const view: Pick<HostView, 'kind'> = { kind };
  const partial: Pick<HostBridge, 'callTool'> & { view: () => Pick<HostView, 'kind'> } = { view: () => view, callTool };
  const bridge = partial as unknown as HostBridge;
  return { bridge, callTool };
};

/** Render the source's entry hook once, the way the pane calls it. */
const readEntry = (source: ExportSource, entryPath: string): ExportEntryState => {
  let state: ExportEntryState | undefined;
  const probe = () => {
    state = source.useEntry(entryPath);
    return null;
  };
  renderToString(createElement(probe));
  return state!;
};

const request = {
  entryPath: 'gear.ts',
  formatContent: {},
  zipMultiple: false,
} as const;

describe('createExportSource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should offer a download only on the loopback page', () => {
    expect(createExportSource(createBridge('loopback').bridge, model).destinations).toEqual(['download', 'project']);
    expect(createExportSource(createBridge('mcp-app').bridge, model).destinations).toEqual(['project']);
  });

  it("should list the catalog formats of the entry's kernel once", async () => {
    const { bridge, callTool } = createBridge('mcp-app');
    const source = createExportSource(bridge, model);

    expect(readEntry(source, 'gear.ts')).toEqual({
      hasGeometry: true,
      formats: undefined,
    });
    await vi.waitFor(() => {
      expect(readEntry(source, 'gear.ts').formats?.map(({ format }) => format)).toEqual(['step', 'stl']);
    });
    expect(callTool).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledWith(viewerExportTool.formats, {
      modelId: 'm1',
      targetFile: 'gear.ts',
    });
  });

  it('should name the matching CLI when the server has no formats tool, with no retry', async () => {
    const { bridge, callTool } = createBridge('loopback');
    callTool.mockRejectedValueOnce(new ToolCallError('UNKNOWN_TOOL', 'HTTP 404'));
    const source = createExportSource(bridge, model);

    readEntry(source, 'gear.ts');
    const { version } = packageJson;
    await vi.waitFor(() => {
      expect(readEntry(source, 'gear.ts')).toEqual({
        hasGeometry: true,
        formats: undefined,
        unavailable: {
          code: 'UNKNOWN_TOOL',
          message: `This Tau server has no export formats; plugin ${version} needs the same version: npm install -g @taucad/cli@${version}, then restart the Tau server or your agent`,
          retry: undefined,
        },
      });
    });
  });

  it.each([
    { failure: 'NO_KERNEL', thrown: new ToolCallError('NO_KERNEL', 'No kernel exports gear.ts.'), code: 'NO_KERNEL' },
    {
      failure: 'FORMATS_UNAVAILABLE',
      thrown: new ToolCallError('FORMATS_UNAVAILABLE', 'The runtime is still starting.'),
      code: 'FORMATS_UNAVAILABLE',
    },
    { failure: 'an uncoded error', thrown: new Error('Failed to fetch'), code: 'FORMATS_UNAVAILABLE' },
  ])('should show why the formats are missing after $failure and ask again on retry', async ({ thrown, code }) => {
    const { bridge, callTool } = createBridge('mcp-app');
    callTool.mockRejectedValueOnce(thrown);
    const source = createExportSource(bridge, model);

    readEntry(source, 'gear.ts');
    await vi.waitFor(() => {
      expect(readEntry(source, 'gear.ts').unavailable).toMatchObject({ code, message: thrown.message });
    });
    const { hasGeometry, unavailable } = readEntry(source, 'gear.ts');
    expect(hasGeometry).toBe(true);
    expect(unavailable?.retry).toBeTypeOf('function');

    unavailable?.retry?.();
    expect(readEntry(source, 'gear.ts')).toEqual({ hasGeometry: true, formats: undefined });
    await vi.waitFor(() => {
      expect(readEntry(source, 'gear.ts').formats?.map(({ format }) => format)).toEqual(['step', 'stl']);
    });
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it('should report a model file with no bytes as having no geometry, without asking the server', () => {
    const { bridge, callTool } = createBridge('mcp-app');
    const source = createExportSource(bridge, { ...model, byteLength: 0 });

    expect(readEntry(source, 'gear.ts')).toEqual({ hasGeometry: false, formats: undefined });
    expect(callTool).not.toHaveBeenCalled();
  });

  it('should export each format with its admitted options and copy it into exports/', async () => {
    const { bridge, callTool } = createBridge('mcp-app');
    const source = createExportSource(bridge, model);
    readEntry(source, 'gear.ts');
    await vi.waitFor(() => {
      expect(readEntry(source, 'gear.ts').formats).toBeDefined();
    });

    const outcome = await source.export({
      ...request,
      formats: ['stl', 'step'],
      formatOptions: { stl: { binary: false, stale: 1 } },
      download: false,
      saveToProject: true,
    });

    expect(outcome).toEqual({ succeeded: ['stl', 'step'], failed: [] });
    expect(callTool).toHaveBeenCalledWith('export_model', {
      targetFile: 'gear.ts',
      to: 'stl',
      options: { binary: false },
    });
    expect(callTool).toHaveBeenCalledWith('export_model', {
      targetFile: 'gear.ts',
      to: 'step',
    });
    expect(callTool).toHaveBeenCalledWith(viewerExportTool.save, {
      modelId: 'm1',
      directory: 'exports/stl',
      files: [{ artifactPath: '.tau/artifacts/x/model.stl', name: 'model.stl' }],
    });
  });

  it('should download the artifact bytes under the model title', async () => {
    const click = vi.fn();
    const anchor = { href: '', download: '', click };
    vi.stubGlobal('document', { createElement: () => anchor });
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:x'),
        revokeObjectURL: vi.fn(),
      }),
    );
    const { bridge, callTool } = createBridge('loopback');
    const source = createExportSource(bridge, model);

    const outcome = await source.export({
      ...request,
      formats: ['stl'],
      formatOptions: {},
      download: true,
      saveToProject: false,
    });

    expect(outcome).toEqual({ succeeded: ['stl'], failed: [] });
    expect(callTool).toHaveBeenCalledWith(viewerExportTool.readArtifact, {
      modelId: 'm1',
      artifactPath: '.tau/artifacts/x/model.stl',
      offset: 0,
      length: 5,
    });
    expect(callTool).toHaveBeenCalledWith('export_model', { modelId: 'm1', targetFile: 'gear.ts', to: 'stl' });
    expect(anchor.download).toBe('Gear.stl');
    expect(click).toHaveBeenCalledOnce();
  });

  it('should count a format whose export fails without stopping the rest', async () => {
    const { bridge, callTool } = createBridge('mcp-app');
    callTool.mockRejectedValueOnce(new Error('Export failed'));
    const source = createExportSource(bridge, model);

    const outcome = await source.export({
      ...request,
      formats: ['stl', 'step'],
      formatOptions: {},
      download: false,
      saveToProject: false,
    });

    expect(outcome).toEqual({ succeeded: ['step'], failed: ['stl'] });
  });
});
