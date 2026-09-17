import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openTelemetryFileSink, telemetryDirectory, telemetryFormat } from '#framework/telemetry-file-sink.js';
import type { TelemetryBatch } from '#types/runtime-protocol.types.js';

const batch = (name: string, size = 1): TelemetryBatch => ({
  origin: { label: 'utility', instance: 'instance-a' },
  epoch: 1_700_000_000_000,
  entries: Array.from({ length: size }, (_unused, index) => ({
    name,
    startTime: index,
    duration: 1,
    detail: { spanId: String(index) },
    workerTimeOrigin: 0,
  })),
});

/** The stream writes on its own turns; wait until the file holds the expected line count. */
const readLines = async (path: string, expected: number): Promise<string[]> =>
  vi.waitFor(async () => {
    const text = await readFile(path, 'utf8').catch(() => '');
    const lines = text.split('\n').filter(Boolean);
    if (lines.length < expected) {
      throw new Error(`Expected ${expected} lines in ${path}, saw ${lines.length}`);
    }
    return lines;
  });

describe('telemetryDirectory', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env['TAU_TELEMETRY'] = saved['TAU_TELEMETRY'];
    process.env['TAU_TELEMETRY_DIR'] = saved['TAU_TELEMETRY_DIR'];
    process.env['TAU_DESKTOP_LOG_DIR'] = saved['TAU_DESKTOP_LOG_DIR'];
    process.env['TAU_TELEMETRY_FORMAT'] = saved['TAU_TELEMETRY_FORMAT'];
    for (const key of ['TAU_TELEMETRY', 'TAU_TELEMETRY_DIR', 'TAU_DESKTOP_LOG_DIR', 'TAU_TELEMETRY_FORMAT']) {
      if (saved[key] === undefined) {
        Reflect.deleteProperty(process.env, key);
      }
    }
  });

  it('defaults a desktop session on through the diagnostics directory it already exports', () => {
    Reflect.deleteProperty(process.env, 'TAU_TELEMETRY');
    Reflect.deleteProperty(process.env, 'TAU_TELEMETRY_DIR');
    process.env['TAU_DESKTOP_LOG_DIR'] = '/logs';

    expect(telemetryDirectory()).toBe('/logs/traces');
  });

  it('prefers an explicit telemetry directory and honours an explicit off switch', () => {
    process.env['TAU_DESKTOP_LOG_DIR'] = '/logs';
    process.env['TAU_TELEMETRY_DIR'] = '/elsewhere';
    expect(telemetryDirectory()).toBe('/elsewhere/traces');

    process.env['TAU_TELEMETRY'] = '0';
    expect(telemetryDirectory()).toBeUndefined();
  });

  it('emits OTLP JSON only where the operator asked for it', () => {
    Reflect.deleteProperty(process.env, 'TAU_TELEMETRY_FORMAT');
    expect(telemetryFormat()).toBe('jsonl');
    process.env['TAU_TELEMETRY_FORMAT'] = 'otlp';
    expect(telemetryFormat()).toBe('otlp');
  });

  it('is off where no directory is named', () => {
    Reflect.deleteProperty(process.env, 'TAU_TELEMETRY');
    Reflect.deleteProperty(process.env, 'TAU_TELEMETRY_DIR');
    Reflect.deleteProperty(process.env, 'TAU_DESKTOP_LOG_DIR');

    expect(telemetryDirectory()).toBeUndefined();
  });
});

describe('openTelemetryFileSink', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-traces-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes one JSONL line per span, folding the batch origin and epoch in', async () => {
    const sink = await openTelemetryFileSink({ directory, fileName: 'utility-a.jsonl' });
    expect(sink).toBeDefined();

    sink!.write(batch('kernel.render', 2));
    const lines = await readLines(join(directory, 'utility-a.jsonl'), 2);

    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(first).toMatchObject({
      name: 'kernel.render',
      workerTimeOrigin: 0,
      origin: { label: 'utility', instance: 'instance-a' },
      epoch: 1_700_000_000_000,
    });
    sink!.close();
  });

  it('writes one OTLP payload per batch when the sink is asked for the collector shape', async () => {
    const sink = await openTelemetryFileSink({ directory, fileName: 'utility-otlp.jsonl', format: 'otlp' });

    sink!.write(batch('kernel.render', 2));
    const lines = await readLines(join(directory, 'utility-otlp.jsonl'), 1);

    // D8: the collector's `otlpjsonfile` receiver reads one OTLP payload per line, and no SDK runs
    // in the emitting process — the translation happens here, after the render turn has returned.
    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0]!) as {
      resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ name: string }> }> }>;
    };
    expect(payload.resourceSpans[0]!.scopeSpans[0]!.spans.map(({ name }) => name)).toEqual([
      'kernel.render',
      'kernel.render',
    ]);
    sink!.close();
  });

  it('returns without blocking the caller: nothing is on disk in the write turn', async () => {
    const sink = await openTelemetryFileSink({ directory, fileName: 'utility-b.jsonl' });
    sink!.write(batch('kernel.render'));

    // The emitting thread is the render response turn; a sink that touched the
    // filesystem synchronously would put that I/O on the render path. The stream
    // has not even opened the file yet when `write` returns.
    await expect(readFile(join(directory, 'utility-b.jsonl'), 'utf8').catch(() => 'not yet')).resolves.toBe('not yet');

    await readLines(join(directory, 'utility-b.jsonl'), 1);
    sink!.close();
  });

  it('rotates to a single previous file once the size bound is passed', async () => {
    const sink = await openTelemetryFileSink({ directory, fileName: 'utility-c.jsonl', maxBytes: 256 });

    sink!.write(batch('kernel.render', 8));
    await readLines(join(directory, 'utility-c.jsonl.1'), 8);
    sink!.write(batch('kernel.export', 1));
    await readLines(join(directory, 'utility-c.jsonl'), 1);

    const written = await readdir(directory);
    expect(written.sort()).toEqual(['utility-c.jsonl', 'utility-c.jsonl.1']);
    sink!.close();
  });

  it('disables itself rather than throwing when the writer fails', async () => {
    const sink = await openTelemetryFileSink({ directory, fileName: 'utility-d.jsonl' });
    await readLines(join(directory, 'utility-d.jsonl'), 0);

    // A `WriteStream` reports disk-full or EACCES as an 'error' event, which Node
    // rethrows out of the event loop when nothing listens. Telemetry must not be
    // able to take a kernel process down.
    await rm(directory, { recursive: true, force: true });
    expect(() => {
      sink!.write(batch('kernel.render'));
      sink!.close();
    }).not.toThrow();
  });

  it('reports no sink when its directory cannot be created', async () => {
    const blocker = join(directory, 'not-a-directory');
    await writeFile(blocker, 'occupied', 'utf8');

    await expect(
      openTelemetryFileSink({ directory: join(blocker, 'traces'), fileName: 'y.jsonl' }),
    ).resolves.toBeUndefined();
  });
});
