import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { ExportFile } from '@taucad/runtime/types';
import type { TranscoderRuntime } from '@taucad/runtime/transcoder';
import { renderSvgPng, svgPngOptionsSchema, svgTranscoder } from '#svg.transcoder.js';

const fixture =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -5 120 60"><path d="M0 0H100V50H0Z" fill="none" stroke="#ef4444" stroke-width="3"/><path d="M10 40L85 8" stroke="#2563eb" stroke-width="5"/></svg>';

const dimensions = (bytes: Uint8Array<ArrayBuffer>): readonly [number, number] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
};

const runtime: TranscoderRuntime = {
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), custom: vi.fn() },
  tracer: { startSpan: () => ({ end: vi.fn(), setAttribute: vi.fn(), addEvent: vi.fn() }) },
  signal: new AbortController().signal,
};

describe('SVG image transcoder', () => {
  it('renders deterministic annotated PNG bytes at the requested dimensions across repeated calls', async () => {
    const options = {
      width: 320,
      height: 240,
      label: 'drawing.ts',
      axes: true,
      scaleBar: true,
      lengthSymbol: 'mm',
    } as const;

    const first = await renderSvgPng(fixture, options);
    const second = await renderSvgPng(fixture, options);

    expect(first.mimeType).toBe('image/png');
    expect(first.bytes.subarray(0, 8)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]));
    expect(dimensions(first.bytes)).toEqual([320, 240]);
    expect(createHash('sha256').update(first.bytes).digest('hex')).toBe(
      createHash('sha256').update(second.bytes).digest('hex'),
    );
  });

  it('requires complete geometry and physical units when a scale bar is requested', async () => {
    await expect(renderSvgPng('<svg/>')).rejects.toMatchObject({ code: 'parse' });
    await expect(renderSvgPng(fixture, { scaleBar: true })).rejects.toThrow('CAD length symbol');
    await expect(
      renderSvgPng('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>', {
        scaleBar: true,
        lengthSymbol: 'mm',
      }),
    ).rejects.toThrow('finite viewBox');
  });

  it('declares one strict svg→png edge and returns a typed runtime failure', async () => {
    const definition = await resolveRuntimePluginDefinition('transcoder', svgTranscoder());
    expect(definition.edges).toEqual([
      expect.objectContaining({ from: 'svg', to: 'png', fidelity: 'mesh', optionsSchema: svgPngOptionsSchema }),
    ]);

    const invalid: ExportFile = {
      name: 'drawing.svg',
      mimeType: 'image/svg+xml',
      bytes: new TextEncoder().encode('<svg/>'),
    };
    const result = await definition.transcode(
      { from: 'svg', to: 'png', files: [invalid], options: {} },
      runtime,
      await definition.initialize({}, runtime),
    );

    expect(result).toMatchObject({
      success: false,
      issues: [{ details: { type: 'render', code: 'parse' } }],
    });
  });
});
