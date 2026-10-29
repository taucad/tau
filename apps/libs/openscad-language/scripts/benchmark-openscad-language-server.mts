#!/usr/bin/env node
/**
 * Purpose: Measure the staged OpenSCAD language server module: boot, workspace load and per-request latency.
 * Why: The integration test holds the same warm-request budget as the C# language server's; this reports the full
 *   distribution on a project far larger than a typical model, so regressions show before they reach the budget.
 * Environment: Node 24+, after `pnpm nx run openscad-language:prepare`.
 * Usage: node --import @oxc-node/core/register apps/libs/openscad-language/scripts/benchmark-openscad-language-server.mts
 *   [--files=200] [--iterations=200]
 *   Prints a table and writes out/openscad-language/benchmark.json.
 * Exit codes: 0 when every method's p95 is within budget; 1 otherwise.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { loadOpenscadServer, sha256Hex } from '../src/wasm-host.ts';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const stage = resolve(workspaceRoot, 'out/openscad-language/stage');
const option = (name: string, fallback: number): number => {
  const value = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split('=')[1];
  return value ? Number(value) : fallback;
};
const fileCount = option('files', 200);
const iterations = option('iterations', 200);
/** Per-request p95 budget in milliseconds, far below the C# integration test's 2 s warm-request budget. */
const budget = 50;

const library = (index: number): string =>
  Array.from({ length: 10 }, (_, item) =>
    [
      '/**',
      ` * Part ${String(index)}.${String(item)}, see {@link part_${String(index)}_${String((item + 1) % 10)}}.`,
      ' * @param size Overall size',
      ' * @param holes Hole count',
      ' */',
      `module part_${String(index)}_${String(item)}(size = 10, holes = 2, center = false) {`,
      '  difference() {',
      '    cube([size, size, size / 4], center = center);',
      `    for (i = [0:holes - 1]) translate([i * size / holes, 0, 0]) cylinder(h = size, r = radius_${String(index)}(size));`,
      '  }',
      '}',
      '',
    ].join('\n'),
  ).join('\n') + `\nfunction radius_${String(index)}(size) = size / 10;\nspacing_${String(index)} = 4;\n`;

const main = (): string => {
  const lines = Array.from({ length: Math.min(fileCount, 50) }, (_, index) => `use <lib/part_${String(index)}.scad>`);
  lines.push('', 'module assembly(count = 4) {');
  for (let row = 0; row < 400; row++) {
    const index = row % Math.min(fileCount, 50);
    lines.push(
      `  translate([${String(row)}, 0, 0]) part_${String(index)}_${String(row % 10)}(size = ${String(row % 7)} + 2, holes = count);`,
    );
  }
  lines.push('}', '', 'assembly();', 'part_0_0(si');
  return lines.join('\n');
};

const percentile = (sorted: readonly number[], fraction: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;

const run = async (): Promise<void> => {
  const manifestPath = resolve(stage, 'assets-manifest.json');
  const fileFetch: typeof fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return new Response(new Uint8Array(await readFile(url)));
  };
  const bootStarted = performance.now();
  const manifest = new Uint8Array(await readFile(manifestPath));
  const server = await loadOpenscadServer({
    assets: { url: pathToFileURL(manifestPath).href, sha256: await sha256Hex(manifest) },
    fetch: fileFetch,
  });
  const bootMilliseconds = performance.now() - bootStarted;
  let nextId = 0;
  const send = (method: string, params: unknown, notification = false): void => {
    const message = notification
      ? { jsonrpc: '2.0', method, params }
      : { jsonrpc: '2.0', id: ++nextId, method, params };
    const response = server.handle(JSON.stringify(message));
    if (response?.includes('"error"')) {
      throw new Error(`${method} failed: ${response}`);
    }
  };
  send('initialize', { capabilities: {} });
  const mainText = main();
  const files = Array.from({ length: fileCount - 1 }, (_, index) => ({
    uri: `file:///lib/part_${String(index)}.scad`,
    text: library(index),
  }));
  const loadStarted = performance.now();
  send('tau/workspaceFiles', { replace: true, files: [...files, { uri: 'file:///main.scad', text: mainText }] }, true);
  send(
    'textDocument/didOpen',
    { textDocument: { uri: 'file:///main.scad', languageId: 'openscad', version: 1, text: mainText } },
    true,
  );
  const loadMilliseconds = performance.now() - loadStarted;
  const lines = mainText.split('\n');
  const last = lines.length - 1;
  const document = { uri: 'file:///main.scad' };
  const at = (line: number, character: number): unknown => ({ textDocument: document, position: { line, character } });
  const callLine = lines.findIndex((line) => line.includes('part_3_3('));
  const callColumn = lines[callLine]!.indexOf('part_3_3') + 2;
  let version = 1;
  const cases: Array<[string, () => void]> = [
    ['completion (statement)', () => send('textDocument/completion', at(last, 3))],
    ['completion (arguments)', () => send('textDocument/completion', at(last, 11))],
    ['hover', () => send('textDocument/hover', at(callLine, callColumn))],
    ['signatureHelp', () => send('textDocument/signatureHelp', at(last, 11))],
    ['definition', () => send('textDocument/definition', at(callLine, callColumn))],
    [
      'references (workspace)',
      () =>
        send('textDocument/references', {
          ...(at(callLine, callColumn) as object),
          context: { includeDeclaration: true },
        }),
    ],
    ['diagnostic', () => send('textDocument/diagnostic', { textDocument: document })],
    ['semanticTokens/full', () => send('textDocument/semanticTokens/full', { textDocument: document })],
    ['documentSymbol', () => send('textDocument/documentSymbol', { textDocument: document })],
    [
      'keystroke (didChange + diagnostic)',
      () => {
        version += 1;
        const insert = version % 2 === 0 ? 'z' : '';
        const remove = version % 2 === 0 ? 0 : 1;
        send(
          'textDocument/didChange',
          {
            textDocument: { ...document, version },
            contentChanges: [
              {
                range: { start: { line: last, character: 11 }, end: { line: last, character: 11 + remove } },
                text: insert,
              },
            ],
          },
          true,
        );
        send('textDocument/diagnostic', { textDocument: document });
      },
    ],
  ];
  const results = cases.map(([name, work]) => {
    for (let warm = 0; warm < 5; warm++) {
      work();
    }
    const samples: number[] = [];
    for (let index = 0; index < iterations; index++) {
      const started = performance.now();
      work();
      samples.push(performance.now() - started);
    }
    samples.sort((left, right) => left - right);
    return { name, median: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: samples.at(-1) ?? 0 };
  });
  const report = {
    files: fileCount,
    mainLines: lines.length,
    iterations,
    moduleBytes: JSON.parse(new TextDecoder().decode(manifest)).module.byteLength as number,
    bootMilliseconds,
    workspaceLoadMilliseconds: loadMilliseconds,
    budgetMilliseconds: budget,
    results,
  };
  await writeFile(
    resolve(workspaceRoot, 'out/openscad-language/benchmark.json'),
    `${JSON.stringify(report, undefined, 2)}\n`,
  );
  const format = (value: number): string => value.toFixed(2).padStart(8);
  console.log(`OpenSCAD language server: ${String(fileCount)} files, ${String(lines.length)}-line open document`);
  console.log(`boot ${bootMilliseconds.toFixed(1)} ms, workspace load ${loadMilliseconds.toFixed(1)} ms`);
  console.log(`${'request'.padEnd(36)}  median ms    p95 ms    max ms`);
  for (const result of results) {
    console.log(`${result.name.padEnd(36)}${format(result.median)}  ${format(result.p95)}  ${format(result.max)}`);
  }
  const over = results.filter((result) => result.p95 > budget);
  if (over.length > 0) {
    console.error(`Over the ${String(budget)} ms p95 budget: ${over.map((result) => result.name).join(', ')}`);
    process.exitCode = 1;
  }
};

await run();
