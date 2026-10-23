#!/usr/bin/env node
/**
 * S3 renderer comparison driver (Q3, D18): xterm.js + WebGL against ghostty-web
 * in Electron under Tau's real `app://` protocol and CSP.
 *
 * Usage: node apps/ui/scripts/s3-renderer/run.mts --suite <r01|r02|r03|r04|r05|r06|r07|all> [--rounds 5]
 *        [--out DIR] [--scale 1] [--skip-build] [--electron-arg=--flag ...]
 * Writes `<suite>.json` (every run, environment identity) and PNG screenshots to --out.
 * Recorded streams only: the echo stub stands in for the S2 admitted PTY and is not a shell.
 * Exit codes: 0 suite completed (results may still record failed assertions); 1 harness failure.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';

type Kind = 'xterm' | 'ghostty';
type Sample = { at: number; cpuPercent: number; workingSetKiB: number; byType: Record<string, number> };
type Latency = { kind: 'key' | 'paste' | 'interrupt'; ms: number; found: boolean; underLoad: boolean };
type S3Api = Record<string, (...arguments_: never[]) => unknown>;
type Session = { app: ElectronApplication; page: Page; kind: Kind };

const { values } = parseArgs({
  options: {
    suite: { type: 'string', default: 'all' },
    rounds: { type: 'string', default: '5' },
    out: { type: 'string' },
    scale: { type: 'string', default: '1' },
    'skip-build': { type: 'boolean', default: false },
    'electron-arg': { type: 'string', multiple: true, default: [] },
  },
});

const root = path.resolve(import.meta.dirname, '../../../..');
const outRoot = path.join(root, 'out/s3-renderer');
const clientRoot = path.join(outRoot, 'app');
const fixtureMain = path.join(outRoot, 'fixture/main.cjs');
const resultsDirectory = path.resolve(values.out ?? path.join(outRoot, 'results'));
const rounds = Number(values.rounds);
const kinds: readonly Kind[] = ['xterm', 'ghostty'];
const pane = { width: 960, height: 540 };
const flow = { chunkBytes: 16_384, highWater: 262_144 };
const sampleIntervalMs = 250;
const electronPath = createRequire(path.join(root, 'apps/desktop/package.json'))('electron') as unknown as string;

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const sha256 = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');
const sh = (command: string, arguments_: string[]): string => {
  try {
    return execFileSync(command, arguments_, { encoding: 'utf8' }).trim();
  } catch {
    return 'unavailable';
  }
};

/** Nearest-rank percentile. */
const percentile = (data: readonly number[], p: number): number => {
  if (data.length === 0) {
    return Number.NaN;
  }
  const sorted = [...data].toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
};
const mean = (data: readonly number[]): number => data.reduce((sum, value) => sum + value, 0) / data.length;
const summary = (data: readonly number[]) => {
  const average = mean(data);
  const sd = Math.sqrt(data.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(1, data.length - 1));
  return {
    n: data.length,
    median: percentile(data, 50),
    p95: percentile(data, 95),
    min: Math.min(...data),
    max: Math.max(...data),
    mean: average,
    cv: average === 0 ? 0 : sd / average,
  };
};

const prepare = async (): Promise<void> => {
  if (!values['skip-build']) {
    execFileSync('pnpm', ['exec', 'vite', 'build', '--config', 'apps/ui/vite.s3-renderer.config.ts'], {
      cwd: root,
      stdio: 'inherit',
    });
    await rename(path.join(clientRoot, 's3-renderer-harness.html'), path.join(clientRoot, 'index.html'));
    await mkdir(path.join(clientRoot, 'fonts'), { recursive: true });
    await copyFile(
      path.join(root, 'node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2'),
      path.join(clientRoot, 'fonts/GeistMono-Variable.woff2'),
    );
    execFileSync('node', [path.join(import.meta.dirname, 'fixtures.mts')], { cwd: root, stdio: 'ignore' });
    await mkdir(path.join(clientRoot, 'fixtures'), { recursive: true });
    for (const file of await readdir(path.join(outRoot, 'fixtures'))) {
      await copyFile(path.join(outRoot, 'fixtures', file), path.join(clientRoot, 'fixtures', file));
    }
    await build({
      entryPoints: [path.join(root, 'apps/desktop/scripts/s3-renderer-fixture/main.ts')],
      outfile: fixtureMain,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      external: ['electron'],
      absWorkingDir: path.join(root, 'apps/desktop'),
      logLevel: 'warning',
    });
  }
  await mkdir(resultsDirectory, { recursive: true });
};

const launch = async (kind: Kind, extraArguments: readonly string[] = []): Promise<Session> => {
  const scale = Number(values.scale);
  const arguments_ = [
    fixtureMain,
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    '--js-flags=--expose-gc',
    ...(scale === 1 ? [] : [`--force-device-scale-factor=${scale}`]),
    ...values['electron-arg'],
    ...extraArguments,
  ];
  const app = await electron.launch({
    executablePath: electronPath,
    args: arguments_,
    env: { ...process.env, S3_CLIENT_ROOT: clientRoot },
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  await page.waitForSelector('body[data-ready="true"]', { timeout: 30_000 });
  return { app, page, kind };
};

const call = async <T,>(session: Session, method: string, ...arguments_: unknown[]): Promise<T> =>
  session.page.evaluate(
    async ([name, parameters]) =>
      (globalThis as unknown as { s3: Record<string, (...values: unknown[]) => unknown> }).s3[name]!(...parameters),
    [method, arguments_] as const,
  ) as Promise<T>;
const main = async <T,>(session: Session, body: string, argument?: unknown): Promise<T> =>
  // eslint-disable-next-line no-new-func -- the body runs in the fixture's main process via Playwright, never here.
  session.app.evaluate(new Function('electron', 'argument', body) as never, argument) as Promise<T>;

const mount = async (session: Session, overrides: Record<string, unknown> = {}) =>
  call<{ cols: number; rows: number; renderer: string; mountMs: number }>(session, 'mount', {
    kind: session.kind,
    theme: 'dark',
    webgl: true,
    screenReaderMode: false,
    scrollback: 10_000,
    ...pane,
    ...overrides,
  });
const startSampling = async (session: Session): Promise<void> =>
  main(session, `globalThis.s3Main.startSampling(${sampleIntervalMs})`);
const stopSampling = async (session: Session) => {
  const samples = await main<Sample[]>(session, 'return globalThis.s3Main.stopSampling()');
  const cpu = samples.slice(1).map((sample) => sample.cpuPercent);
  return {
    samples: samples.length,
    cpuMeanPercent: cpu.length === 0 ? Number.NaN : mean(cpu),
    peakWorkingSetMiB: Math.max(...samples.map((sample) => sample.workingSetKiB)) / 1024,
    peakByTypeMiB: Object.fromEntries(
      [...new Set(samples.flatMap((sample) => Object.keys(sample.byType)))].map((type) => [
        type,
        Math.max(...samples.map((sample) => sample.byType[type] ?? 0)) / 1024,
      ]),
    ),
  };
};
const events = async (session: Session): Promise<string[]> => main(session, 'return [...globalThis.s3Main.events]');
const screenshot = async (session: Session, name: string): Promise<string> => {
  const file = path.join(resultsDirectory, `${name}.png`);
  const rect = await call<{ x: number; y: number; width: number; height: number }>(session, 'paneRect');
  await session.page.screenshot({ path: file, clip: rect });
  return path.relative(resultsDirectory, file);
};
/** Distinct-color count and luminance spread over the pane: a blank pane has one color. */
const paneInk = async (session: Session) => {
  const rect = await call<{ x: number; y: number; width: number; height: number }>(session, 'paneRect');
  const png = await session.page.screenshot({ clip: rect });
  return main<{ colors: number; nonBackground: number }>(
    session,
    `const image = electron.nativeImage.createFromBuffer(Buffer.from(argument.png, 'base64'));
     const bitmap = image.toBitmap();
     const colors = new Map();
     for (let index = 0; index < bitmap.length; index += 4) {
       const key = (bitmap[index] << 16) | (bitmap[index + 1] << 8) | bitmap[index + 2];
       colors.set(key, (colors.get(key) ?? 0) + 1);
     }
     const top = Math.max(...colors.values());
     return { colors: colors.size, nonBackground: (bitmap.length / 4 - top) / (bitmap.length / 4) };`,
    { png: png.toString('base64') },
  );
};
const pasteFromClipboard = async (session: Session, text: string): Promise<void> => {
  await main(session, `electron.clipboard.writeText(argument);`, text);
  /* X11 clipboard ownership settles asynchronously under Xvfb. */
  await sleep(100);
  await main(session, `electron.BrowserWindow.getAllWindows()[0].webContents.paste();`);
};

const environment = async () => {
  const session = await launch('xterm');
  try {
    const gpu = await main<Record<string, unknown>>(session, `return electron.app.getGPUFeatureStatus()`);
    const gpuInfo = await main<Record<string, unknown>>(session, `return electron.app.getGPUInfo('basic')`);
    const versions = await main<Record<string, string>>(session, `return process.versions`);
    const page = await session.page.evaluate(() => ({
      userAgent: navigator.userAgent,
      devicePixelRatio,
      webgl2: (() => {
        const context = document.createElement('canvas').getContext('webgl2');
        const info = context?.getExtension('WEBGL_debug_renderer_info');
        return context
          ? {
              vendor: info ? context.getParameter(info.UNMASKED_VENDOR_WEBGL) : 'unknown',
              renderer: info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown',
            }
          : 'unavailable';
      })(),
    }));
    const lock = await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8');
    const integrity = (name: string, version: string): string =>
      new RegExp(
        `\\n  '?${name.replace('/', '\\/')}@${version.replaceAll('.', '\\.')}'?:\\n    resolution: \\{integrity: ([^}]+)\\}`,
      ).exec(lock)?.[1] ?? 'not found';
    const packageDigest = async (relative: string): Promise<string> =>
      sha256(await readFile(path.join(root, 'apps/ui/node_modules', relative)));
    return {
      capturedAt: new Date().toISOString(),
      tauCommit: sh('git', ['-C', root, 'rev-parse', 'HEAD']),
      tauDirty: sh('git', ['-C', root, 'status', '--porcelain']).split('\n').filter(Boolean).length,
      node: process.version,
      electron: versions['electron'],
      chrome: versions['chrome'],
      v8: versions['v8'],
      os: `${os.type()} ${os.release()} ${os.arch()}`,
      osRelease: sh('sh', ['-c', '. /etc/os-release && echo "$PRETTY_NAME"']),
      cpu: `${os.cpus()[0]?.model ?? 'unknown'} x${os.cpus().length}`,
      memoryGiB: Math.round(os.totalmem() / 2 ** 30),
      display: process.env['DISPLAY'] ?? 'none',
      xvfb: sh('sh', ['-c', 'ps -o args= -C Xvfb | head -1']),
      chromiumSandbox: process.getuid?.() !== 0,
      runAsUid: process.getuid?.(),
      deviceScaleFactor: Number(values.scale),
      gpuFeatureStatus: gpu,
      gpuInfo,
      page,
      font: 'Geist Mono variable (geist package), 13px',
      paneCss: pane,
      flow,
      candidates: {
        '@xterm/xterm': {
          version: '6.0.0',
          integrity: integrity('@xterm/xterm', '6.0.0'),
          sha256Lib: await packageDigest('@xterm/xterm/lib/xterm.mjs'),
        },
        '@xterm/addon-fit': { version: '0.11.0', integrity: integrity('@xterm/addon-fit', '0.11.0') },
        '@xterm/addon-webgl': {
          version: '0.19.0',
          integrity: integrity('@xterm/addon-webgl', '0.19.0'),
          sha256Lib: await packageDigest('@xterm/addon-webgl/lib/addon-webgl.mjs'),
        },
        'ghostty-web': {
          version: '0.4.0',
          integrity: integrity('ghostty-web', '0.4.0'),
          sha256Lib: await packageDigest('ghostty-web/dist/ghostty-web.js'),
          sha256Wasm: await packageDigest('ghostty-web/ghostty-vt.wasm'),
        },
      },
      fixtures: JSON.parse(await readFile(path.join(outRoot, 'fixtures/manifest.json'), 'utf8')) as unknown,
      harnessDigest: sha256(
        (
          await Promise.all(
            (
              await readdir(path.join(clientRoot, 'assets'))
            )
              .toSorted()
              .map(async (file) => sha256(await readFile(path.join(clientRoot, 'assets', file)))),
          )
        ).join(''),
      ),
    };
  } finally {
    await session.app.close();
  }
};

const r01Lines = async (): Promise<number> =>
  (JSON.parse(await readFile(path.join(outRoot, 'fixtures/manifest.json'), 'utf8')) as { r01Lines: number }).r01Lines;

/** Order and loss check: the retained tail must be consecutive `seq=` values ending at the last fixture line. */
const sequenceCheck = (lines: readonly string[], expectedLast: number) => {
  const seqs = lines.flatMap((line) => {
    const match = /seq=(\d{7})/.exec(line);
    return match ? [Number(match[1])] : [];
  });
  let gaps = 0;
  const gapExamples: string[] = [];
  for (let index = 1; index < seqs.length; index++) {
    if (seqs[index] !== seqs[index - 1]! + 1) {
      gaps++;
      if (gapExamples.length < 5) {
        gapExamples.push(`${seqs[index - 1]}→${seqs[index]}`);
      }
    }
  }
  return {
    checked: seqs.length,
    gaps,
    gapExamples,
    last: seqs.at(-1),
    expectedLast,
    ok: gaps === 0 && seqs.at(-1) === expectedLast,
  };
};

const r01Run = async (kind: Kind, round: number) => {
  const session = await launch(kind);
  try {
    const mounted = await mount(session);
    await call(session, 'loadFixture', 'r01-colored-log');
    await call(session, 'settle', 1000);
    await startSampling(session);
    const idleFramesPerSecond = await call<number>(session, 'idleFrames', 3000);
    const idle = await stopSampling(session);

    await startSampling(session);
    const throughput = await call<Record<string, number>>(session, 'play', 'r01-colored-log', flow);
    const load = await stopSampling(session);
    const afterStreamScreenshot = await screenshot(session, `r01-after-stream-${kind}-round${round}`);
    const retained = await call<string[]>(session, 'tail', 3000);
    const sequence = { ...sequenceCheck(retained, (await r01Lines()) - 1), lastLines: retained.slice(-8) };

    /* Interactive phase: replay the stream continuously while typing, pasting and interrupting. */
    await call(session, 'clearLog');
    await call(session, 'focus');
    await startSampling(session);
    const play = call<Record<string, number>>(session, 'play', 'r01-colored-log', {
      ...flow,
      maxBytes: 64 * 1024 * 1024,
    });
    await sleep(300);
    const letters = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmn';
    for (const letter of letters) {
      await session.page.keyboard.press(letter);
      await sleep(50);
    }
    await pasteFromClipboard(session, 'echo s3-paste-payload');
    await sleep(300);
    await session.page.keyboard.press('Control+c');
    const interactivePlay = await play;
    await call(session, 'settle', 500);
    const interactive = await stopSampling(session);
    const latencies = await call<Latency[]>(session, 'latencies');
    const keys = latencies.filter((entry) => entry.kind === 'key');
    const after = await call<string[]>(session, 'tail', 8);
    return {
      kind,
      round,
      mounted,
      idle: { ...idle, idleFramesPerSecond },
      throughput: {
        ...throughput,
        mibPerSecond: throughput['bytes']! / 2 ** 20 / (throughput['elapsedMs']! / 1000),
        ...load,
      },
      sequence,
      afterStreamScreenshot,
      interactive: {
        afterInterruptScreenshot: await screenshot(session, `r01-after-interrupt-${kind}-round${round}`),
        play: interactivePlay,
        ...interactive,
        keysSent: letters.length,
        keysEchoed: keys.length,
        keysFound: keys.filter((entry) => entry.found).length,
        keysUnderLoad: keys.filter((entry) => entry.underLoad).length,
        keyMs: keys.map((entry) => entry.ms),
        keySummary: keys.length > 0 ? summary(keys.map((entry) => entry.ms)) : undefined,
        paste: latencies.filter((entry) => entry.kind === 'paste'),
        interrupt: latencies.filter((entry) => entry.kind === 'interrupt'),
        tailAfterInterrupt: after,
        promptAfterInterrupt: after.some((line) => line.startsWith('S3$')),
        streamAfterInterrupt: after
          .slice(after.findIndex((line) => line.includes('^C')) + 1)
          .some((line) => line.includes('seq=')),
      },
      events: await events(session),
    };
  } finally {
    await session.app.close();
  }
};

/** One warmup + `rounds` measured paired runs, alternating which candidate goes first. */
const paired = async <T,>(name: string, run: (kind: Kind, round: number) => Promise<T>) => {
  const runs: Array<T & { warmup: boolean; order: number }> = [];
  for (let round = 0; round <= rounds; round++) {
    const order = round % 2 === 0 ? kinds : [...kinds].toReversed();
    for (const [index, kind] of order.entries()) {
      process.stdout.write(`${name} round ${round}${round === 0 ? ' (warmup)' : ''} ${kind}\n`);
      runs.push({ ...(await run(kind, round)), warmup: round === 0, order: index });
    }
  }
  return runs;
};

const r01 = async () => {
  const runs = await paired('R01', r01Run);
  const measured = runs.filter((run) => !run.warmup);
  const aggregate = Object.fromEntries(
    kinds.map((kind) => {
      const mine = measured.filter((run) => run.kind === kind);
      return [
        kind,
        {
          perRunKeyP95: summary(mine.map((run) => run.interactive.keySummary?.p95 ?? Number.NaN)),
          pooledKeyMs: summary(mine.flatMap((run) => run.interactive.keyMs)),
          interruptMs: summary(mine.flatMap((run) => run.interactive.interrupt.map((entry) => entry.ms))),
          pasteMs: summary(mine.flatMap((run) => run.interactive.paste.map((entry) => entry.ms))),
          throughputMiBps: summary(mine.map((run) => run.throughput.mibPerSecond)),
          idleCpuPercent: summary(mine.map((run) => run.idle.cpuMeanPercent)),
          idleFramesPerSecond: summary(mine.map((run) => run.idle.idleFramesPerSecond)),
          loadCpuPercent: summary(mine.map((run) => run.throughput.cpuMeanPercent)),
          peakWorkingSetMiB: summary(
            mine.map((run) => Math.max(run.throughput.peakWorkingSetMiB, run.interactive.peakWorkingSetMiB)),
          ),
          sequenceOk: mine.every((run) => run.sequence.ok),
          allKeysEchoedAndFound: mine.every((run) => run.interactive.keysFound === run.interactive.keysSent),
          interruptStopsStream: mine.every(
            (run) => run.interactive.promptAfterInterrupt && !run.interactive.streamAfterInterrupt,
          ),
        },
      ];
    }),
  );
  return { runs, aggregate };
};

const r02Run = async (kind: Kind) => {
  const session = await launch(kind);
  const result: Record<string, unknown> = { kind };
  try {
    const mounted = await mount(session);
    result['mounted'] = mounted;
    await call(session, 'setEcho', false);

    const widths: Record<string, number> = {};
    for (const text of ['ascii', '漢字かな', '한국어', 'é', '👍🏽', '👨‍👩‍👧', '🇳🇿', 'Ω≈ç√∫', '​']) {
      await call(session, 'write', '\r\n');
      await call(session, 'write', text);
      widths[text] = (await call<{ cursorX: number }>(session, 'buffer')).cursorX;
    }
    result['unicodeCursorWidths'] = {
      observed: widths,
      expectedUnicode15Graphemes: {
        ascii: 5,
        漢字かな: 8,
        한국어: 6,
        é: 1,
        '👍🏽': 2,
        '👨‍👩‍👧': 2,
        '🇳🇿': 2,
        'Ω≈ç√∫': 5,
        '​': 0,
      },
    };
    await call(session, 'loadFixture', 'r02-unicode');
    await call(session, 'play', 'r02-unicode', flow);
    result['unicodeScreenshot'] = await screenshot(session, `r02-unicode-${kind}`);
    const unicodeCursor = await call<{ baseY: number; cursorY: number }>(session, 'buffer');
    result['unicodeTail'] = await call(
      session,
      'lines',
      unicodeCursor.baseY + unicodeCursor.cursorY - 10,
      unicodeCursor.baseY + unicodeCursor.cursorY,
    );

    await call(session, 'loadFixture', 'r02-tui');
    await call(session, 'loadFixture', 'r02-tui-exit');
    await call(session, 'write', '\r\nBEFORE-TUI-MARKER');
    await call(session, 'play', 'r02-tui', flow);
    const altBuffer = await call<{ type: string }>(session, 'buffer');
    const altLines = await call<string[]>(session, 'lines', 0, 3);
    result['tuiScreenshot'] = await screenshot(session, `r02-tui-${kind}`);
    await call(session, 'play', 'r02-tui-exit', flow);
    const restored = await call<{ type: string }>(session, 'buffer');
    const restoredTail = await call<string[]>(session, 'tail', 30);
    result['altScreen'] = {
      enteredAlternate: altBuffer.type === 'alternate',
      headerDrawn: altLines.some((line) => line.includes('TUI-HEADER')),
      restoredNormal: restored.type === 'normal',
      normalContentRestored: restoredTail.some((line) => line.includes('BEFORE-TUI-MARKER')),
    };

    await call(session, 'loadFixture', 'r02-scrollback');
    await call(session, 'play', 'r02-scrollback', flow);
    const scrollBuffer = await call<{ length: number }>(session, 'buffer');
    const scrollLines = await call<string[]>(session, 'lines', 0, scrollBuffer.length);
    const numbers = scrollLines.flatMap((line) => {
      const match = /^scroll (\d{6})$/.exec(line);
      return match ? [Number(match[1])] : [];
    });
    result['scrollback'] = {
      bufferLength: scrollBuffer.length,
      retainedNumbered: numbers.length,
      first: numbers[0],
      last: numbers.at(-1),
      contiguous: numbers.every((value, index) => index === 0 || value === numbers[index - 1]! + 1),
      capRespected: scrollBuffer.length <= 10_000 + 200,
    };

    await call(session, 'resize', 80, 24);
    await call(session, 'write', `\r\n${'R'.repeat(200)}\r\n`);
    const countRows = async (): Promise<number> =>
      (await call<string[]>(session, 'tail', 30)).filter((line) => /^R+$/.test(line)).length;
    const at80 = await countRows();
    await call(session, 'resize', 40, 24);
    const at40 = await countRows();
    await call(session, 'resize', 120, 24);
    const at120 = await countRows();
    for (let index = 0; index < 60; index++) {
      await call(session, 'setPaneSize', 400 + ((index * 97) % 560), 200 + ((index * 53) % 340));
    }
    const finalSize = await call<{ cols: number; rows: number }>(session, 'setPaneSize', pane.width, pane.height);
    await call(session, 'write', '\r\nAFTER-RESIZE-MARKER');
    result['reflow'] = {
      rowsAt80: at80,
      rowsAt40: at40,
      rowsAt120: at120,
      expected: { rowsAt80: 3, rowsAt40: 5, rowsAt120: 2 },
      rapidResizeFinal: finalSize,
      writableAfterRapidResize: (await call<string[]>(session, 'tail', 3)).some((line) =>
        line.includes('AFTER-RESIZE-MARKER'),
      ),
    };
    await call(session, 'settle', 500);
    result['resizeScreenshot'] = await screenshot(session, `r02-resize-${kind}`);

    /* Selection, paste, keys, mouse and IME start from a fresh terminal so earlier resize state cannot skew coordinates. */
    await mount(session);
    await call(session, 'setEcho', false);

    await call(session, 'write', '\r\nSELECT-ME-PLEASE tail');
    const buffer = await call<{ baseY: number; cursorY: number }>(session, 'buffer');
    const row = buffer.baseY + buffer.cursorY;
    await call(session, 'select', 0, row, 16);
    const apiSelection = await call<string>(session, 'selection');
    await main(session, `electron.clipboard.writeText('S3-CLIPBOARD-BEFORE-COPY');`);
    await main(session, `electron.BrowserWindow.getAllWindows()[0].webContents.copy();`);
    await sleep(200);
    const copied = await main<string>(session, `return electron.clipboard.readText();`);
    const rect = await call<{ x: number; y: number; width: number; height: number }>(session, 'paneRect');
    const size = await call<{ cols: number; rows: number }>(session, 'fit');
    const cell = { width: rect.width / size.cols, height: rect.height / size.rows };
    const viewportRow = buffer.cursorY;
    await session.page.mouse.move(rect.x + cell.width * 0.5, rect.y + cell.height * (viewportRow + 0.5));
    await session.page.mouse.down();
    await session.page.mouse.move(rect.x + cell.width * 15.5, rect.y + cell.height * (viewportRow + 0.5), { steps: 8 });
    await session.page.mouse.up();
    const mouseSelection = await call<string>(session, 'selection');
    result['selection'] = {
      apiSelection,
      copiedFromWebContentsCopy: copied,
      copyMatchesSelection: copied === apiSelection,
      mouseSelection,
      search: 'not verified: no search addon is pinned for xterm and ghostty-web 0.4.0 exposes no search API',
    };

    await call(session, 'clearLog');
    await call(session, 'write', '\u001B[?2004h');
    await call(session, 'focus');
    await pasteFromClipboard(session, 'line-one\nline-two');
    await sleep(300);
    const pasteLog = await call<string[]>(session, 'dataLog');
    const pasteProbe = await call<{ pastedTexts: string[] }>(session, 'probe');
    result['bracketedPaste'] = {
      log: pasteLog,
      clipboardEventTexts: pasteProbe.pastedTexts,
      wrapped: pasteLog.some((data) => data.startsWith('\u001B[200~') && data.endsWith('\u001B[201~')),
      newlineAsCarriageReturn: pasteLog.some((data) => data.includes('line-one\rline-two')),
    };
    await call(session, 'write', '\u001B[?2004l');

    const keys: Array<[string, string]> = [
      ['ArrowUp', '\u001B[A'],
      ['ArrowLeft', '\u001B[D'],
      ['Home', '\u001B[H'],
      ['End', '\u001B[F'],
      ['PageUp', '\u001B[5~'],
      ['Delete', '\u001B[3~'],
      ['F1', '\u001BOP'],
      ['F5', '\u001B[15~'],
      ['Backspace', '\u007F'],
      ['Tab', '\t'],
      ['Enter', '\r'],
      ['Escape', '\u001B'],
      ['Control+a', '\u0001'],
      ['Control+c', '\u0003'],
      ['Alt+b', '\u001Bb'],
      ['Shift+Tab', '\u001B[Z'],
    ];
    const keyResults: Record<string, { expected: string; observed: string; ok: boolean }> = {};
    for (const [key, expected] of keys) {
      await call(session, 'clearLog');
      await session.page.keyboard.press(key);
      await sleep(60);
      const observed = (await call<string[]>(session, 'dataLog')).join('');
      keyResults[key] = {
        expected: JSON.stringify(expected),
        observed: JSON.stringify(observed),
        ok: observed === expected,
      };
    }
    await call(session, 'write', '\u001B[?1h');
    await call(session, 'clearLog');
    await session.page.keyboard.press('ArrowUp');
    await sleep(60);
    const applicationCursor = (await call<string[]>(session, 'dataLog')).join('');
    await call(session, 'write', '\u001B[?1l');
    result['keys'] = {
      results: keyResults,
      passed: Object.values(keyResults).filter((entry) => entry.ok).length,
      total: keys.length,
      applicationCursorArrowUp: { expected: JSON.stringify('\u001BOA'), observed: JSON.stringify(applicationCursor) },
    };

    await call(session, 'write', '\u001B[?1000h\u001B[?1006h');
    await call(session, 'clearLog');
    await session.page.mouse.click(rect.x + cell.width * 5.5, rect.y + cell.height * 3.5);
    await sleep(100);
    const mouseLog = (await call<string[]>(session, 'dataLog')).join('');
    await call(session, 'write', '\u001B[?1000l\u001B[?1006l');
    result['mouse'] = {
      expected: JSON.stringify('\u001B[<0;6;4M\u001B[<0;6;4m'),
      observed: JSON.stringify(mouseLog),
      ok: mouseLog === '\u001B[<0;6;4M\u001B[<0;6;4m',
    };

    await call(session, 'clearLog');
    await call(session, 'focus');
    const cdp = await session.page.context().newCDPSession(session.page);
    await cdp.send('Input.imeSetComposition', { text: 'かんじ', selectionStart: 3, selectionEnd: 3 });
    await sleep(100);
    await cdp.send('Input.insertText', { text: '漢字' });
    await sleep(200);
    const imeLog = (await call<string[]>(session, 'dataLog')).join('');
    result['ime'] = {
      method: 'CDP Input.imeSetComposition + Input.insertText (synthetic; not an OS IME)',
      observed: JSON.stringify(imeLog),
      committedOnce: imeLog === '漢字',
      leakedComposition: imeLog.includes('かんじ'),
    };
    result['events'] = await events(session);
    return result;
  } catch (error) {
    result['error'] = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    return result;
  } finally {
    await session.app.close();
  }
};

const r03Run = async (kind: Kind) => {
  const result: Record<string, unknown> = { kind };
  for (const theme of ['dark', 'light'] as const) {
    const session = await launch(kind);
    try {
      await mount(session, { theme });
      await call(session, 'loadFixture', 'r02-unicode');
      await call(session, 'play', 'r02-unicode', flow);
      await call(session, 'settle', 500);
      result[`theme-${theme}`] = {
        screenshot: await screenshot(session, `r03-theme-${theme}-${kind}`),
        ink: await paneInk(session),
        canvasScales: await call(session, 'canvasScales'),
        idleFramesPerSecond: await call<number>(session, 'idleFrames', 2000),
      };
    } finally {
      await session.app.close();
    }
  }

  const session = await launch(kind);
  try {
    await mount(session);
    await call(session, 'loadFixture', 'r02-unicode');
    await call(session, 'play', 'r02-unicode', flow);
    await main(session, `electron.BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2)`);
    await sleep(500);
    const zoomed = await call<{ cols: number; rows: number }>(session, 'fit');
    await call(session, 'settle', 300);
    result['zoom200'] = {
      fit: zoomed,
      canvasScales: await call(session, 'canvasScales'),
      screenshot: await screenshot(session, `r03-zoom200-${kind}`),
      ink: await paneInk(session),
    };
    await main(session, `electron.BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)`);
    await sleep(300);
    await call(session, 'fit');

    await call(session, 'focus');
    const focusedBefore = await call<boolean>(session, 'activeElementInPane');
    await call(session, 'setHidden', true);
    const hiddenFramesPerSecond = await call<number>(session, 'idleFrames', 2000);
    await call(session, 'write', '\r\nWRITTEN-WHILE-HIDDEN');
    await call(session, 'setHidden', false);
    await call(session, 'fit');
    await call(session, 'focus');
    await call(session, 'settle', 300);
    result['hiddenRestored'] = {
      focusedBefore,
      hiddenFramesPerSecond,
      focusedAfterRestoreAndFocusCall: await call<boolean>(session, 'activeElementInPane'),
      hiddenWriteRetained: (await call<string[]>(session, 'aroundCursor', 4)).some((line) =>
        line.includes('WRITTEN-WHILE-HIDDEN'),
      ),
      ink: await paneInk(session),
      screenshot: await screenshot(session, `r03-restored-${kind}`),
    };

    await session.page.evaluate(() => (globalThis as unknown as { gc: () => void }).gc());
    const heapBefore = await call<number>(session, 'heap');
    const nodesBefore = (await call<{ domNodes: number }>(session, 'probe')).domNodes;
    const cycleHeapMiB: number[] = [];
    result['mountDisposeCyclesCompleted'] = 0;
    for (let cycle = 0; cycle < 30; cycle++) {
      await mount(session);
      await call(session, 'play', 'r02-unicode', flow);
      cycleHeapMiB.push((await call<number>(session, 'heap')) / 2 ** 20);
      result['mountDisposeCyclesCompleted'] = cycle + 1;
      result['mountDisposeHeapMiB'] = cycleHeapMiB;
    }
    await call(session, 'unmount');
    await call(session, 'settle', 500);
    await session.page.evaluate(() => (globalThis as unknown as { gc: () => void }).gc());
    await sleep(300);
    const heapAfter = await call<number>(session, 'heap');
    result['mountDispose30'] = {
      heapBeforeMiB: heapBefore / 2 ** 20,
      heapAfterMiB: heapAfter / 2 ** 20,
      heapGrowthMiB: (heapAfter - heapBefore) / 2 ** 20,
      domNodesBefore: nodesBefore,
      domNodesAfterDispose: (await call<{ domNodes: number }>(session, 'probe')).domNodes,
      canvasesAfterDispose: await call<number>(session, 'canvasCount'),
      framesPerSecondAfterDispose: await call<number>(session, 'idleFrames', 2000),
    };
    result['events'] = await events(session);
  } catch (error) {
    result['error'] = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  } finally {
    await session.app.close();
  }
  return result;
};

const r04Run = async (kind: Kind) => {
  const session = await launch(kind, ['--force-renderer-accessibility']);
  try {
    await mount(session, { screenReaderMode: true });
    await call(session, 'setEcho', false);
    await call(session, 'write', '\r\nS3-A11Y-LINE-ONE\r\nS3-A11Y-LINE-TWO 漢字');
    await call(session, 'settle', 500);
    const cdp = await session.page.context().newCDPSession(session.page);
    const tree = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: Array<{
        role?: { value?: string };
        name?: { value?: string };
        ignored?: boolean;
        properties?: Array<{ name: string; value: { value?: unknown } }>;
      }>;
    };
    const visible = tree.nodes.filter((node) => !node.ignored);
    const text = visible.map((node) => `${node.role?.value ?? ''}:${node.name?.value ?? ''}`);
    const live = visible.filter((node) => node.properties?.some((property) => property.name === 'live'));
    return {
      kind,
      kindOfEvidence:
        'Chromium accessibility tree via CDP (supplementary DOM/AX evidence, not an assistive-technology receipt)',
      outputLineInTree: text.some((entry) => entry.includes('S3-A11Y-LINE-ONE')),
      outputLineInPaneDomText: (await call<string>(session, 'paneText')).includes('S3-A11Y-LINE-ONE'),
      cjkLineInTree: text.some((entry) => entry.includes('S3-A11Y-LINE-TWO')),
      liveRegions: live.map((node) => `${node.role?.value}:${node.name?.value ?? ''}`),
      focusableRoles: visible
        .filter((node) =>
          node.properties?.some((property) => property.name === 'focusable' && property.value.value === true),
        )
        .map((node) => `${node.role?.value}:${node.name?.value ?? ''}`),
      sampleNodes: text.filter((entry) => !entry.startsWith('none:') && !entry.startsWith('generic:')).slice(0, 60),
    };
  } finally {
    await session.app.close();
  }
};

const r05Run = async (kind: Kind, round: number) => {
  const session = await launch(kind);
  try {
    await mount(session);
    await call(session, 'loadFixture', 'r01-colored-log');
    await call(session, 'startCad');
    await sleep(3000);
    const baseline = await call<{ intervals: number[] }>(session, 'stopCad');
    await call(session, 'startCad');
    await startSampling(session);
    const stream = await call<Record<string, number>>(session, 'play', 'r01-colored-log', flow);
    const load = await stopSampling(session);
    const underLoad = await call<{ intervals: number[] }>(session, 'stopCad');
    return {
      kind,
      round,
      proxy: 'three.js TorusKnot (600x96 segments) WebGL scene beside the pane; not the Tau CAD viewport',
      baselineFrameMs: summary(baseline.intervals),
      loadFrameMs: summary(underLoad.intervals),
      framesOver50ms: underLoad.intervals.filter((interval) => interval > 50).length,
      streamMiBps: stream['bytes']! / 2 ** 20 / (stream['elapsedMs']! / 1000),
      stream,
      ...load,
    };
  } finally {
    await session.app.close();
  }
};

const r05 = async () => {
  const runs = await paired('R05', r05Run);
  const measured = runs.filter((run) => !run.warmup);
  const aggregate = Object.fromEntries(
    kinds.map((kind) => {
      const mine = measured.filter((run) => run.kind === kind);
      return [
        kind,
        {
          loadFrameP95Ms: summary(mine.map((run) => run.loadFrameMs.p95)),
          loadFrameMedianMs: summary(mine.map((run) => run.loadFrameMs.median)),
          baselineFrameP95Ms: summary(mine.map((run) => run.baselineFrameMs.p95)),
          streamMiBps: summary(mine.map((run) => run.streamMiBps)),
        },
      ];
    }),
  );
  return { runs, aggregate };
};

const r06Run = async (kind: Kind) => {
  const result: Record<string, unknown> = { kind };
  const noWebgl = await launch(kind);
  try {
    const mounted = await mount(noWebgl, { webglUnavailable: true });
    await call(noWebgl, 'loadFixture', 'r02-unicode');
    await call(noWebgl, 'play', 'r02-unicode', flow);
    await call(noWebgl, 'settle', 300);
    result['webglUnavailable'] = {
      renderer: mounted.renderer,
      ink: await paneInk(noWebgl),
      screenshot: await screenshot(noWebgl, `r06-no-webgl-${kind}`),
      probe: await call(noWebgl, 'probe'),
    };
  } finally {
    await noWebgl.app.close();
  }

  const session = await launch(kind);
  try {
    const mounted = await mount(session);
    await call(session, 'loadFixture', 'r02-unicode');
    await call(session, 'play', 'r02-unicode', flow);
    const lost = await call<number>(session, 'loseWebglContexts');
    await call(session, 'settle', 500);
    const halfSecond = {
      renderer: await call(session, 'renderer'),
      ink: await paneInk(session),
      screenshot: await screenshot(session, `r06-context-loss-0.5s-${kind}`),
    };
    await call(session, 'settle', 4000);
    await call(session, 'write', '\r\nAFTER-CONTEXT-LOSS');
    await call(session, 'settle', 300);
    result['contextLoss'] = {
      rendererBefore: mounted.renderer,
      webglContextsLost: lost,
      halfSecond,
      rendererAfter: await call(session, 'renderer'),
      textRetained: (await call<string[]>(session, 'aroundCursor', 4)).some((line) =>
        line.includes('AFTER-CONTEXT-LOSS'),
      ),
      ink: await paneInk(session),
      screenshot: await screenshot(session, `r06-context-loss-${kind}`),
    };

    const gpuPids = await main<number[]>(
      session,
      `return electron.app.getAppMetrics().filter((metric) => metric.type === 'GPU').map((metric) => metric.pid)`,
    );
    for (const pid of gpuPids) {
      process.kill(pid, 'SIGKILL');
    }
    await sleep(3000);
    await call(session, 'write', '\r\nAFTER-GPU-PROCESS-KILL');
    await call(session, 'settle', 500);
    result['gpuProcessKill'] = {
      killedPids: gpuPids,
      newGpuPids: await main<number[]>(
        session,
        `return electron.app.getAppMetrics().filter((metric) => metric.type === 'GPU').map((metric) => metric.pid)`,
      ),
      rendererAfter: await call(session, 'renderer'),
      textRetained: (await call<string[]>(session, 'aroundCursor', 4)).some((line) =>
        line.includes('AFTER-GPU-PROCESS-KILL'),
      ),
      ink: await paneInk(session),
      screenshot: await screenshot(session, `r06-gpu-kill-${kind}`),
    };
    result['csp'] = { probe: await call(session, 'probe'), events: await events(session) };
  } catch (error) {
    result['error'] = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  } finally {
    await session.app.close();
  }
  return result;
};

const r07Run = async (kind: Kind) => {
  const session = await launch(kind);
  try {
    await mount(session);
    await call(session, 'setEcho', false);
    await main(session, `electron.clipboard.writeText('S3-CLIPBOARD-SENTINEL')`);
    const titleBefore = await session.page.title();
    await call(session, 'resetProbe');
    await call(session, 'clearLog');
    await call(session, 'loadFixture', 'r07-hostile');
    const played = await call<Record<string, number>>(session, 'play', 'r07-hostile', flow);
    await call(session, 'settle', 1000);
    const outputOnly = {
      played,
      clipboardAfter: await main<string>(session, `return electron.clipboard.readText()`),
      titleBefore,
      titleAfter: await session.page.title(),
      probe: await call(session, 'probe'),
      eventsAfterOutput: await events(session),
      terminalReplies: (await call<string[]>(session, 'dataLog')).map((data) => JSON.stringify(data)),
      endMarkerRendered: (await call<string[]>(session, 'tail', 4)).some((line) => line.includes('S3-HOSTILE-END')),
    };
    await call(session, 'unmount');
    await mount(session);
    await call(session, 'setEcho', false);
    await call(
      session,
      'write',
      '\u001B[2J\u001B[H\u001B]8;;https://evil.example/s3\u0007EVIL-OSC8-LINK\u001B]8;;\u0007\r\n\u001B]8;;javascript:globalThis.s3Injected=1\u0007JS-OSC8-LINK\u001B]8;;\u0007\r\nhttps://evil.example/plain-url\r\n',
    );
    await call(session, 'settle', 300);
    await main(session, `electron.clipboard.writeText('S3-CLIPBOARD-SENTINEL')`);
    const rect = await call<{ x: number; y: number; width: number; height: number }>(session, 'paneRect');
    const size = await call<{ cols: number; rows: number }>(session, 'fit');
    const cell = { width: rect.width / size.cols, height: rect.height / size.rows };
    const clicks: Record<string, string[]> = {};
    for (const [label, row] of [
      ['osc8-https', 0],
      ['osc8-javascript', 1],
      ['plain-url', 2],
    ] as const) {
      for (const modifier of ['none', 'Control'] as const) {
        const before = (await events(session)).length;
        const x = rect.x + cell.width * 3.5;
        const y = rect.y + cell.height * (row + 0.5);
        await session.page.mouse.move(x, y);
        await sleep(150);
        if (modifier === 'Control') {
          await session.page.keyboard.down('Control');
        }
        await session.page.mouse.click(x, y);
        if (modifier === 'Control') {
          await session.page.keyboard.up('Control');
        }
        await sleep(300);
        clicks[`${label}:${modifier}`] = (await events(session)).slice(before);
      }
    }
    return {
      kind,
      outputOnly,
      userClicks: clicks,
      injectedAfterClicks: (await call<{ injected: boolean }>(session, 'probe')).injected,
      clipboardAfterClicks: await main<string>(session, `return electron.clipboard.readText()`),
      screenshot: await screenshot(session, `r07-links-${kind}`),
    };
  } finally {
    await session.app.close();
  }
};

/** Retained R01 lines per ghostty-web `scrollback` value: its option is Ghostty's byte limit, not xterm's line count. */
const calibrate = async () => {
  const results = [];
  for (const scrollback of [6, 571, 2286, 4571, 9143, 10_000]) {
    const session = await launch('ghostty');
    try {
      await mount(session, { scrollback });
      await call(session, 'loadFixture', 'r01-colored-log');
      await call(session, 'play', 'r01-colored-log', flow);
      const buffer = await call<{ length: number }>(session, 'buffer');
      results.push({
        scrollbackLines: scrollback,
        ghosttyBytes: Math.round(scrollback * 1750),
        retainedLines: buffer.length,
        cols: (await call<{ cols: number }>(session, 'fit')).cols,
      });
    } finally {
      await session.app.close();
    }
  }
  return results;
};

/** R01 integrity across scrollback and chunk sizes, to localize an ordering/loss failure. */
const integrity = async () => {
  const results = [];
  for (const kind of kinds) {
    for (const [scrollback, chunkBytes] of [
      [10_000, 16_384],
      [10_000, 4096],
      [10_000, 65_536],
      [1000, 16_384],
      [57, 16_384],
    ] as const) {
      const session = await launch(kind);
      try {
        await mount(session, { scrollback });
        await call(session, 'loadFixture', 'r01-colored-log');
        await call(session, 'play', 'r01-colored-log', { ...flow, chunkBytes });
        const retained = await call<string[]>(session, 'tail', 3000);
        const { lastLines: _lastLines, ...check } = {
          ...sequenceCheck(retained, (await r01Lines()) - 1),
          lastLines: [],
        };
        results.push({
          kind,
          scrollback,
          chunkBytes,
          ...check,
          bufferLength: (await call<{ length: number }>(session, 'buffer')).length,
        });
      } finally {
        await session.app.close();
      }
    }
  }
  return results;
};

/** Locate the ghostty-web repeated mount/dispose renderer crash: which cycle, by GC, host reuse and scrollback size. */
const disposal = async () => {
  const results = [];
  for (const kind of kinds) {
    for (const variant of ['plain', 'gc-first', 'reuse-host', 'default-scrollback'] as const) {
      const session = await launch(kind, ['--enable-logging=stderr']);
      const stderr: string[] = [];
      session.app.process().stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
      let cycles = 0;
      let error: string | undefined;
      try {
        await mount(session);
        await call(session, 'loadFixture', 'r02-unicode');
        if (variant === 'gc-first') {
          await session.page.evaluate(() => (globalThis as unknown as { gc: () => void }).gc());
        }
        for (let cycle = 0; cycle < 30; cycle++) {
          /* 6 lines maps to ~10 KB, ghostty-web's own default limit. */
          await mount(
            session,
            variant === 'default-scrollback' ? { scrollback: 6 } : variant === 'reuse-host' ? { reuseHost: true } : {},
          );
          await call(session, 'play', 'r02-unicode', flow);
          cycles = cycle + 1;
        }
      } catch (caught) {
        error = caught instanceof Error ? caught.message.split('\n')[0] : String(caught);
      }
      let mainEvents: string[] = [];
      try {
        mainEvents = await events(session);
      } catch {
        mainEvents = ['main unavailable'];
      }
      await session.app.close().catch(() => undefined);
      const log = stderr
        .join('')
        .split('\n')
        .filter((line) => /FATAL|ERROR|Check failed|OOM|out of memory|crash/i.test(line) && !line.includes('dbus'));
      results.push({ kind, variant, cycles, error, events: mainEvents, stderr: log.slice(0, 12) });
    }
  }
  return results;
};

const suites: Record<string, () => Promise<unknown>> = {
  disposal,
  integrity,
  calibrate,
  r01,
  r02: async () => Promise.all(kinds.map(async (kind) => r02Run(kind))),
  r03: async () => {
    const results = [];
    for (const kind of kinds) {
      results.push(await r03Run(kind));
    }
    return results;
  },
  r04: async () => {
    const results = [];
    for (const kind of kinds) {
      results.push(await r04Run(kind));
    }
    return results;
  },
  r05,
  r06: async () => {
    const results = [];
    for (const kind of kinds) {
      results.push(await r06Run(kind));
    }
    return results;
  },
  r07: async () => {
    const results = [];
    for (const kind of kinds) {
      results.push(await r07Run(kind));
    }
    return results;
  },
};

await prepare();
const identity = await environment();
await writeFile(path.join(resultsDirectory, 'environment.json'), `${JSON.stringify(identity, undefined, 2)}\n`);
const selected = values.suite === 'all' ? Object.keys(suites) : values.suite.split(',');
for (const name of selected) {
  const suite = suites[name];
  if (!suite) {
    throw new Error(`Unknown suite ${name}`);
  }
  const started = Date.now();
  const result = await suite();
  await writeFile(
    path.join(resultsDirectory, `${name}.json`),
    `${JSON.stringify({ suite: name, command: process.argv.slice(1), startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, environmentDigest: sha256(JSON.stringify(identity)), result }, undefined, 2)}\n`,
  );
  process.stdout.write(`${name} done in ${Math.round((Date.now() - started) / 1000)} s\n`);
}
