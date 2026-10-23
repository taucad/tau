import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { startHost } from './host.mts';
import { createFixtureRuntime } from './runtime.mts';

const output = new URL('../../out/research/native-renderer/', import.meta.url);
await mkdir(output, { recursive: true });
const runtime = await createFixtureRuntime();
const host = await startHost({ geometry: runtime.geometry, runtimeMetrics: runtime.metrics, onClose: runtime.close });
const results = [];
try {
  for (const backend of (process.env.SPIKE_BACKENDS ?? 'webgl,webgpu').split(',').filter(Boolean)) {
    const initial = await (
      await fetch(host.url + '/scene', { headers: { authorization: `Bearer ${host.token}` } })
    ).json();
    await fetch(host.url + '/view', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${host.token}` },
      body: JSON.stringify({ revision: initial.revision, view: { angle: 0.4, intensity: 1 } }),
    });
    const browser = await chromium.launch({
      headless: process.env.SPIKE_HEADED !== '1',
      executablePath: process.env.SPIKE_CHROMIUM,
      args:
        process.env.SPIKE_SOFTWARE === '1'
          ? [
              '--use-angle=swiftshader',
              '--enable-unsafe-swiftshader',
              '--enable-unsafe-webgpu',
              ...(backend === 'webgpu' ? ['--disable-vulkan-surface', '--enable-features=Vulkan'] : []),
            ]
          : [],
    });
    let sampler;
    let sampling = false;
    let peakRssBytes = 0;
    const system = await browser.newBrowserCDPSession();
    const sample = async () => {
      if (sampling) return;
      sampling = true;
      try {
        const { processInfo } = await system.send('SystemInfo.getProcessInfo');
        const resident = await Promise.all(
          processInfo.map(async (entry) => {
            try {
              const status = await readFile(`/proc/${entry.id}/status`, 'utf8');
              return Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) * 1024;
            } catch {
              return 0;
            }
          }),
        );
        peakRssBytes = Math.max(
          peakRssBytes,
          resident.reduce((a, b) => a + b, 0),
        );
      } finally {
        sampling = false;
      }
    };
    sampler = setInterval(() => sample().catch(() => {}), 100);
    try {
      const page = await browser.newPage({ viewport: { width: 720, height: 780 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') console.error(backend, message.text());
      });
      await page.goto(`${host.url}/?backend=${backend}#${host.token}`);
      await page.waitForFunction(() => window.spike?.ready || window.spikeError, {}, { timeout: 60000 });
      const error = await page.evaluate(() => window.spikeError);
      if (error) throw new Error(error);
      await page.locator('canvas').evaluate((canvas) => {
        canvas.style.cssText = 'position:fixed;left:0;top:0;margin:0;width:640px;height:480px;max-width:none';
      });
      await page.locator('canvas').screenshot({ path: new URL(`${backend}.png`, output).pathname });
      const pixelStart = await page.evaluate(() => performance.now());
      const pixels = await page.evaluate(() => window.spike.pixels());
      await writeFile(new URL(`${backend}.rgba`, output), Buffer.from(pixels));
      const firstCaptureFrameMs = await page.evaluate(() => performance.now());
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 20)
          colored++;
      if (colored < 10000 || colored > 160000) throw new Error('Readback visibility witness failed');
      const statsBefore = await page.evaluate(() => window.spike.stats());
      const metrics = await page.evaluate(() => window.spike.benchmark());
      const revision = await page.evaluate(() => window.spike.update({ angle: 0.65, intensity: 0.6 }));
      const statsAfter = await page.evaluate(() => window.spike.stats());
      const session = await page.context().newCDPSession(page);
      await session.send('Performance.enable');
      const idleBefore = await session.send('Performance.getMetrics');
      const framesBefore = await page.evaluate(() => window.spike.frames());
      await new Promise((resolve) => setTimeout(resolve, 250));
      const idleAfter = await session.send('Performance.getMetrics');
      const value = (report, name) => report.metrics.find((metric) => metric.name === name)?.value;
      const adapter = await page.evaluate(async () => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        if (gl) {
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
        }
        const a = await navigator.gpu?.requestAdapter();
        return a?.info
          ? {
              vendor: a.info.vendor,
              architecture: a.info.architecture,
              device: a.info.device,
              description: a.info.description,
            }
          : null;
      });
      results.push({
        ...metrics,
        firstCaptureFrameMs,
        visibilityPixels: colored,
        validation: 'offscreen visibility readback; parity evaluated separately',
        adapter,
        softwareGpu: process.env.SPIKE_SOFTWARE === '1' || /swiftshader|llvmpipe/i.test(JSON.stringify(adapter)),
        softwareGpuReason:
          process.env.SPIKE_SOFTWARE === '1'
            ? 'explicit Chromium SwiftShader flags'
            : 'inspect recorded adapter; hardware checkpoint still needs device verification',
        revision,
        ...{ revisionGeometryBytes: statsAfter.assetBytes - statsBefore.assetBytes },
        idleFrames: (await page.evaluate(() => window.spike.frames())) - framesBefore,
        idleIntervalMs: 250,
        idleCpuTaskMs: 1000 * (value(idleAfter, 'TaskDuration') - value(idleBefore, 'TaskDuration')),
        jsHeapBytes: value(idleAfter, 'JSHeapUsedSize'),
        peakRssBytes: peakRssBytes || null,
        peakRssLimitation:
          'Linux /proc sampled every 100ms; sum of Chromium process RSS double-counts shared pages, unlike native process RSS',
        errors,
      });
    } catch (error) {
      results.push({ backend, status: 'failed', error: String(error) });
      console.error(backend, String(error));
    } finally {
      clearInterval(sampler);
      await browser.close();
    }
  }
  for (const split of process.env.SPIKE_NATIVE === '0' ? [] : [true, false]) {
    const state = JSON.parse(
      await (await fetch(host.url + '/scene', { headers: { authorization: `Bearer ${host.token}` } })).text(),
    );
    await fetch(host.url + '/view', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${host.token}` },
      body: JSON.stringify({ revision: state.revision, view: { angle: 0.4, intensity: 1 } }),
    });
    const mode = split ? 'split' : 'batched';
    const result = await new Promise((resolve) => {
      const child = spawn(
        process.env.SPIKE_PYTHON ?? 'python',
        [
          'scripts/native-renderer-spike/native.py',
          ...(split ? ['--split'] : []),
          '--output',
          new URL(`native-${mode}`, output).pathname,
        ],
        {
          env: {
            ...process.env,
            ...Object.fromEntries([
              ['SPIKE_URL', host.url],
              ['SPIKE_TOKEN', host.token],
            ]),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (data) => (stdout += data));
      child.stderr.on('data', (data) => (stderr += data));
      child.on('error', (error) => resolve({ backend: 'native-wgpu', mode, status: 'failed', error: String(error) }));
      child.on('close', (code) => {
        writeFile(new URL(`native-${mode}.stderr.log`, output), stderr);
        try {
          resolve(
            code === 0 ? JSON.parse(stdout) : { backend: 'native-wgpu', mode, status: 'failed', code, error: stderr },
          );
        } catch {
          resolve({ backend: 'native-wgpu', mode, status: 'failed', error: stderr });
        }
      });
    });
    results.push(result);
  }
  await writeFile(
    new URL('results.json', output),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        base: 'faecc9ac8f456b7fa5639fc0eb146012e3e499c8',
        runtime: runtime.metrics,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      results.map(({ samplesMs, ...result }) => result),
      null,
      2,
    ),
  );
} finally {
  await host.close();
}
