// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { clientFactsScript } from '#lib/client-facts.js';
import { buildFrameHintScript } from '#lib/frame-hint.js';
import { tauInlineScriptHashes } from '#lib/inline-script-hashes.js';
import type { TauInlineScript } from '#lib/inline-script-hashes.js';
import { handOffScript } from '#components/hand-off/hand-off.js';
import { handOffSurfaces } from '#components/hand-off/hand-off-store.js';
import { earlyInputScript } from '#components/chat/chat-early-input.js';
import { focusProjectNameScript } from '#routes/projects_.new/focus-project-name-script.js';
import { buildBootWatchdogScript } from '#lib/boot-watchdog.js';

/** The CSP hash source of a script's text: SHA-256 of its UTF-8 bytes, base64 (CSP3 § 6.7.3.3). */
const hashSource = (source: string): string =>
  `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;

/** Each listed script's source, exactly as it is served. */
const servedSources: Readonly<Record<TauInlineScript, string>> = {
  clientFacts: clientFactsScript,
  frameHint: buildFrameHintScript(),
  handOffProjectComposer: handOffScript('previous-sibling', handOffSurfaces['project-composer']),
  earlyChatInput: earlyInputScript,
  focusProjectName: focusProjectNameScript,
  bootWatchdog: buildBootWatchdogScript() ?? '',
};

describe('tauInlineScriptHashes', () => {
  it.each(Object.entries(servedSources))(
    'should list the hash of the %s script as it is served (update the list when the script changes)',
    (name, source) => {
      expect(tauInlineScriptHashes[name as TauInlineScript]).toBe(hashSource(source));
    },
  );

  it('should list one hash per hand-off surface, so a new surface is listed too', () => {
    expect(Object.keys(handOffSurfaces)).toEqual(['project-composer']);
  });

  it('should list each script once', () => {
    const hashes = Object.values(tauInlineScriptHashes);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
