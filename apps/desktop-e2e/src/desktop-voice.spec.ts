import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';
import type { Locator, Page } from 'playwright';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { expectSignedIn } from '#support/scenario.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import { startTranscriptionStub } from '#support/transcription-stub.js';
import type { TranscriptionStub } from '#support/transcription-stub.js';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const evidenceRoot = join(workspaceRoot, 'out/research/codex-voice');
const live = process.env['TAU_E2E_LIVE_VOICE'] === 'true';
/** Capture start-up, upload and the stub's held stream each outlast the default one-second poll. */
const poll = { timeout: 15_000 };

let session: DesktopSession | undefined;
let stub: TranscriptionStub | undefined;
let seededEmail: string | undefined;
let fixtureRoot: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  await stub?.close();
  stub = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
  if (fixtureRoot) {
    await rm(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = undefined;
  }
});

/** Select the user's on-screen composer; Home also mounts a library-empty-state composer below the fold. */
const visibleComposer = async (page: Page): Promise<Locator> => {
  const composers = page.locator('[data-chat-composer="main"]');
  let visible: number[] = [];
  await expect
    .poll(async () => {
      visible = await composers.evaluateAll((nodes) =>
        nodes.flatMap((node, index) => {
          const bounds = node.getBoundingClientRect();
          return bounds.width > 0 && bounds.top >= 0 && bounds.bottom <= window.innerHeight ? [index] : [];
        }),
      );
      return visible;
    }, poll)
    .toHaveLength(1);
  return composers.nth(visible[0]!);
};

/** Launch signed in with Chromium's file-backed microphone; the OS microphone is untouched. */
const launchWithMicrophone = async (label: string, wavPath: string): Promise<Page> => {
  const account = tauTestAccount(label);
  seededEmail = account.email;
  session = await launchDesktopApp({ token: await seedTauTestUser(account), fakeMicrophonePath: wavPath });
  const { page } = session;
  await page.goto('app://tau');
  await expectSignedIn(page);
  return page;
};

/** Known 440 Hz, mono 16-bit WAV consumed by Chromium's actual capture driver. */
const fakeMicrophoneWav = (): Uint8Array<ArrayBuffer> => {
  const sampleRate = 48_000;
  const sampleCount = sampleRate * 8;
  const wav = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(wav.buffer);
  const text = (offset: number, value: string): void => {
    wav.set(new TextEncoder().encode(value), offset);
  };
  text(0, 'RIFF');
  view.setUint32(4, wav.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index++) {
    view.setInt16(44 + index * 2, Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.35 * 32_767), true);
  }
  return wav;
};

test.skipIf(live)(
  'should capture Chromium file microphone audio, transcribe through the Tau API into the editable draft, and cancel without sending',
  async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'tau-voice-driver-'));
    const wavPath = join(fixtureRoot, 'microphone.wav');
    await writeFile(wavPath, fakeMicrophoneWav());
    stub = await startTranscriptionStub('Build a calibrated bracket.');
    const page = await launchWithMicrophone('voice', wavPath);
    page.setDefaultTimeout(5000);
    try {
      const composerUrl = page.url();
      const projects = async (): Promise<string[]> => {
        const entries = await readdir(session!.homeRoot);
        return entries.filter((name) => !name.startsWith('.'));
      };
      const originalProjects = await projects();
      const composer = await visibleComposer(page);
      const editor = composer.getByRole('textbox');
      await editor.fill('Existing draft.');
      const dictate = composer.getByRole('button', { name: 'Dictate', exact: true });
      const send = composer.getByRole('button', { name: 'Send', exact: true });
      await expect.poll(async () => dictate.isVisible(), { timeout: 30_000 }).toBe(true);
      const [microphoneBounds, sendBounds] = await Promise.all([dictate.boundingBox(), send.boundingBox()]);
      expect(microphoneBounds!.x + microphoneBounds!.width).toBeLessThanOrEqual(sendBounds!.x);
      expect(sendBounds!.x - microphoneBounds!.x - microphoneBounds!.width).toBeLessThan(24);

      await dictate.click();
      await expect.poll(async () => composer.getByRole('status').textContent(), poll).toContain('Recording');
      const waveform = composer.getByRole('img', { name: 'Microphone waveform' });
      await expect.poll(async () => Number(await waveform.getAttribute('data-level')), poll).toBeGreaterThan(0.05);
      await mkdir(evidenceRoot, { recursive: true });
      // Capture at least a second of measured microphone history for visual review.
      await wait(1100);
      await composer.screenshot({ path: join(evidenceRoot, 'recording-composer.png') });
      const stop = composer.getByRole('button', { name: 'Stop dictation', exact: true });
      // Radix keeps a clicked trigger's tooltip closed until the pointer leaves it.
      await editor.hover();
      await stop.hover();
      await expect.poll(async () => page.getByRole('tooltip').textContent(), poll).toContain('Stop dictation');
      stub.hold();
      await stop.click();
      await expect.poll(async () => composer.getByRole('status').textContent(), poll).toContain('Transcribing');
      await expect
        .poll(async () => composer.locator('[data-slot="dictation-transcript"]').textContent(), poll)
        .toContain('Build');
      expect(await send.getAttribute('aria-disabled')).toBe('true');
      await composer.screenshot({ path: join(evidenceRoot, 'transcribing-composer.png') });
      stub.release();
      await expect.poll(async () => editor.textContent(), poll).toBe('Existing draft. Build a calibrated bracket.');

      expect(stub.receipts).toHaveLength(1);
      const [receipt] = stub.receipts;
      expect(receipt).toMatchObject({ model: 'gpt-transcribe', stream: 'true', sampleRate: 24_000 });
      expect(receipt!.samples).toBeGreaterThan(receipt!.sampleRate);
      expect(receipt!.frequency).toBeGreaterThan(435);
      expect(receipt!.frequency).toBeLessThan(445);
      expect(receipt!.rms).toBeGreaterThan(0.23);
      expect(receipt!.rms).toBeLessThan(0.27);
      await writeFile(join(evidenceRoot, 'fake-microphone-receipt.json'), JSON.stringify(receipt, undefined, 2));

      await dictate.click();
      await expect.poll(async () => composer.getByRole('status').textContent(), poll).toContain('Recording');
      await composer.getByRole('button', { name: 'Cancel dictation', exact: true }).click();
      await expect.poll(async () => dictate.isVisible(), poll).toBe(true);
      expect(stub.receipts).toHaveLength(1);
      expect(await editor.textContent()).toBe('Existing draft. Build a calibrated bracket.');
      expect(page.url()).toBe(composerUrl);
      await expect(projects()).resolves.toEqual(originalProjects);
      await page.screenshot({ path: join(evidenceRoot, 'completed.png') });
    } catch (error) {
      await session?.capture('voice-failure');
      throw error;
    }
  },
);

// The operator opts into provider spend; the deterministic stub does not prove recognition accuracy.
test.skipIf(!live || process.platform !== 'darwin')(
  'should recognize fixed synthesized speech through the configured transcription provider',
  async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'tau-voice-speech-'));
    const wavPath = join(fixtureRoot, 'speech.wav');
    const phrase = 'Create a simple bracket with two mounting holes.';
    const speechPath = join(fixtureRoot, 'speech.aiff');
    const execute = promisify(execFile);
    await execute('say', ['-v', 'Samantha', '-o', speechPath, phrase]);
    // Chromium's file capture reads a plain RIFF header; `afconvert` writes one without `say`'s JUNK chunk.
    await execute('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', speechPath, wavPath]);
    const page = await launchWithMicrophone('voice-live', wavPath);
    try {
      const composer = await visibleComposer(page);
      const dictate = composer.getByRole('button', { name: 'Dictate', exact: true });
      await expect.poll(async () => dictate.isVisible(), { timeout: 30_000 }).toBe(true);
      await dictate.click();
      await expect.poll(async () => composer.getByRole('status').textContent(), poll).toContain('Recording');
      // Await the WAV's duration plus capture buffering, then finalize through the real provider.
      const speech = await readFile(wavPath);
      await wait((speech.length / 96_000) * 1000 + 500);
      await composer.getByRole('button', { name: 'Stop dictation', exact: true }).click();
      await expect.poll(async () => dictate.isVisible(), { timeout: 60_000 }).toBe(true);
      const transcript = await composer.getByRole('textbox').textContent();
      expect(
        transcript
          ?.toLowerCase()
          .replaceAll(/[^a-z\s]/gu, '')
          .replaceAll(/\s+/gu, ' '),
      ).toContain('create a simple bracket with two mounting holes');
      await mkdir(evidenceRoot, { recursive: true });
      await writeFile(join(evidenceRoot, 'live-speech-transcript.json'), JSON.stringify({ phrase, transcript }));
      await page.screenshot({ path: join(evidenceRoot, 'live-speech.png') });
    } catch (error) {
      await session?.capture('voice-live-failure');
      throw error;
    }
  },
);
