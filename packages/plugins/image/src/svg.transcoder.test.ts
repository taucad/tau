import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type * as Nanoraster from 'nanoraster';
import type { encodeRgbaWebp } from 'nanoraster';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { ExportFile } from '@taucad/runtime/types';
import type { TranscoderRuntime } from '@taucad/runtime/transcoder';
import * as svgPublic from '#svg.js';
import {
  renderSvgPng,
  renderSvgWebp,
  svgPngOptionsSchema,
  svgTranscoder,
  svgWebpOptionsSchema,
} from '#svg.transcoder.js';

const backendMock = vi.hoisted(() => ({ encodeRgbaWebp: vi.fn<typeof encodeRgbaWebp>() }));

vi.mock('#image-backend.js', () => ({
  loadImageBackend: async () => ({ encodeRgbaWebp: backendMock.encodeRgbaWebp }),
}));

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

  it('passes the shared annotated RGBA pixels to WebP encoding with explicit premultiplied alpha', async () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    backendMock.encodeRgbaWebp.mockResolvedValue(webp);

    const rendered = await renderSvgWebp(fixture, {
      width: 320,
      height: 240,
      background: '#00000000',
      label: 'drawing.ts',
      axes: true,
      scaleBar: true,
      lengthSymbol: 'mm',
      quality: 0.85,
    });

    expect(rendered).toEqual({ name: 'render.webp', mimeType: 'image/webp', bytes: webp });
    expect(backendMock.encodeRgbaWebp).toHaveBeenCalledOnce();
    const [rgba, options] = backendMock.encodeRgbaWebp.mock.calls[0]!;
    expect(rgba).toBeInstanceOf(Uint8Array);
    expect(rgba).toHaveLength(320 * 240 * 4);
    expect(options).toEqual({ width: 320, height: 240, quality: 0.85, alpha: 'premultiplied' });
    expect(svgWebpOptionsSchema.parse({}).quality).toBe(1);
    expect(svgPublic.renderSvgWebp).toBe(renderSvgWebp);
    expect(svgPublic.svgWebpOptionsSchema).toBe(svgWebpOptionsSchema);

    const definition = await resolveRuntimePluginDefinition('transcoder', svgTranscoder());
    const source: ExportFile = {
      name: 'drawing.svg',
      mimeType: 'image/svg+xml',
      bytes: new TextEncoder().encode(fixture),
    };
    await expect(
      definition.transcode(
        { from: 'svg', to: 'webp', files: [source], options: { width: 320, height: 240 } },
        runtime,
        await definition.initialize({}, runtime),
      ),
    ).resolves.toEqual({
      success: true,
      data: [{ name: 'render.webp', mimeType: 'image/webp', bytes: webp }],
      issues: [],
    });
  });

  it('encodes the shared rendered pixels through the installed native WebP backend', async () => {
    const { encodeRgbaWebp } = await vi.importActual<typeof Nanoraster>('nanoraster');
    backendMock.encodeRgbaWebp.mockImplementationOnce(encodeRgbaWebp);

    const rendered = await renderSvgWebp(fixture, {
      width: 320,
      height: 240,
      background: '#00000000',
      axes: true,
      scaleBar: true,
      lengthSymbol: 'mm',
    });

    expect(rendered.mimeType).toBe('image/webp');
    expect(new TextDecoder().decode(rendered.bytes.subarray(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(rendered.bytes.subarray(8, 12))).toBe('WEBP');
    expect(rendered.bytes.byteLength).toBeGreaterThan(100);
  });

  it('lets resvg parse the document and requires physical units when a scale bar is requested', async () => {
    await expect(renderSvgPng('<svg')).rejects.toMatchObject({ code: 'parse' });
    await expect(renderSvgPng(fixture, { scaleBar: true })).rejects.toThrow('CAD length symbol');
    await expect(
      renderSvgPng('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', {
        scaleBar: true,
        lengthSymbol: 'mm',
      }),
    ).resolves.toMatchObject({ mimeType: 'image/png' });
  });

  it('ignores nested symbol viewBox values when resolving the root drawing dimensions', async () => {
    const source = (viewBox: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><symbol id="unused" viewBox="${viewBox}"/><rect width="100" height="50" fill="#2563eb"/></svg>`;
    const options = { width: 320, height: 240, scaleBar: true, lengthSymbol: 'mm' } as const;

    const tallSymbol = await renderSvgPng(source('0 0 1 100'), options);
    const wideSymbol = await renderSvgPng(source('0 0 100 1'), options);

    expect(tallSymbol.bytes).toEqual(wideSymbol.bytes);
  });

  it('declares strict svg image edges and returns a typed runtime failure', async () => {
    const definition = await resolveRuntimePluginDefinition('transcoder', svgTranscoder());
    expect(definition.edges).toEqual([
      expect.objectContaining({ from: 'svg', to: 'png', fidelity: 'mesh', optionsSchema: svgPngOptionsSchema }),
      expect.objectContaining({ from: 'svg', to: 'webp', fidelity: 'mesh', optionsSchema: svgWebpOptionsSchema }),
    ]);

    const invalid: ExportFile = {
      name: 'drawing.svg',
      mimeType: 'image/svg+xml',
      bytes: new TextEncoder().encode('<svg'),
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
