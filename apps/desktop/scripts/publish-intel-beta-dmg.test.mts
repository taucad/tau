#!/usr/bin/env node
/**
 * Purpose: Check the Intel Mac beta DMG publication decisions without a bucket.
 * Why: The beta DMG sits outside the qualified catalog, so its own rules (immutable release key, a latest pointer only
 * for the release the Intel feed serves, public readback) are the only guard on what users download.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/publish-intel-beta-dmg.test.mts
 * Exit codes: 0 when every check passes; non-zero on regression.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

// oxlint-disable-next-line no-restricted-imports -- Exercise the script-owned publisher directly.
import { intelFeedTag, publishIntelBetaDmg } from './publish-intel-beta-dmg.mjs';
// oxlint-disable-next-line no-restricted-imports -- Same script-owned publisher types.
import type { IntelBetaDmgDependencies } from './publish-intel-beta-dmg.mjs';

const sha256 = 'a'.repeat(64);
const tag = 'desktop@0.5.0';

const fake = (state: { objects?: Record<string, string>; latest?: string }) => {
  const calls: string[] = [];
  const objects = { ...state.objects };
  const dependencies: IntelBetaDmgDependencies = {
    existing: async (key) => objects[key],
    put: async (key, immutable) => {
      calls.push(`put ${key} ${immutable ? 'immutable' : 'mutable'}`);
      objects[key] = sha256;
    },
    copy: async (source, key) => {
      calls.push(`copy ${source} -> ${key}`);
      objects[key] = objects[source]!;
    },
    latestTag: async () => state.latest ?? tag,
    verify: async (url) => {
      calls.push(`verify ${url}`);
    },
    log: () => undefined,
  };
  return { calls, dependencies };
};

await test('publishes the release DMG once and points latest at it while the Intel feed serves that release', async () => {
  const { calls, dependencies } = fake({});
  assert.deepEqual(await publishIntelBetaDmg({ tag, sha256, size: 1, dependencies }), { latest: true });
  assert.deepEqual(calls, [
    'put releases/desktop@0.5.0/Tau-macos-x64.dmg immutable',
    'verify https://downloads.tau.new/releases/desktop%400.5.0/Tau-macos-x64.dmg',
    'copy releases/desktop@0.5.0/Tau-macos-x64.dmg -> latest/Tau-macos-x64.dmg',
    'verify https://downloads.tau.new/latest/Tau-macos-x64.dmg',
  ]);
});

await test('reuses identical release bytes on a re-run', async () => {
  const { calls, dependencies } = fake({ objects: { 'releases/desktop@0.5.0/Tau-macos-x64.dmg': sha256 } });
  await publishIntelBetaDmg({ tag, sha256, size: 1, dependencies });
  assert.ok(!calls.some((call) => call.startsWith('put ')));
});

await test('refuses to replace different release bytes', async () => {
  const { calls, dependencies } = fake({ objects: { 'releases/desktop@0.5.0/Tau-macos-x64.dmg': 'b'.repeat(64) } });
  await assert.rejects(publishIntelBetaDmg({ tag, sha256, size: 1, dependencies }), /Refusing to replace immutable/u);
  assert.deepEqual(calls, []);
});

await test('leaves latest alone for a release the Intel feed does not serve', async () => {
  const { calls, dependencies } = fake({ latest: 'desktop@0.6.0' });
  assert.deepEqual(await publishIntelBetaDmg({ tag, sha256, size: 1, dependencies }), { latest: false });
  assert.ok(!calls.some((call) => call.includes('latest/')));
});

await test('publishes a staging DMG on the staging origin', async () => {
  const staging = 'desktop-staging@0.1.0-staging.455';
  const { calls, dependencies } = fake({ latest: staging });
  await publishIntelBetaDmg({ tag: staging, sha256, size: 1, dependencies });
  assert.ok(calls.includes('verify https://downloads.taucad.dev/latest/Tau-macos-x64.dmg'));
});

await test('rejects a tag that is not a desktop release', async () => {
  const { dependencies } = fake({});
  await assert.rejects(
    publishIntelBetaDmg({ tag: 'ui@1.0.0', sha256, size: 1, dependencies }),
    /Invalid desktop release tag/u,
  );
});

const feedFetch =
  (status: number, body: unknown, seen: string[] = []): typeof fetch =>
  async (input) => {
    seen.push(input instanceof Request ? input.url : input.toString());
    return Response.json(body, { status });
  };

const entry = (version: string, name: string) => ({ version, updateTo: { version, name } });

await test('reads the Intel feed release from the channel origin', async () => {
  const seen: string[] = [];
  const staging = 'desktop-staging@0.5.0-staging.1499';
  const body = {
    currentRelease: '1.13.72',
    releases: [
      entry('1.13.70', 'desktop-staging@0.4.0-staging.1370'),
      entry('1.13.72', 'desktop-staging@0.4.0-staging.1372'),
    ],
  };
  assert.equal(await intelFeedTag(staging, feedFetch(200, body, seen)), 'desktop-staging@0.4.0-staging.1372');
  assert.deepEqual(seen, ['https://downloads.taucad.dev/latest/desktop-update-darwin-x64.json']);
});

await test('refuses an Intel feed without an entry for its current release', async () => {
  const body = { currentRelease: '0.5.0', releases: [entry('0.4.0', 'desktop@0.4.0')] };
  await assert.rejects(intelFeedTag(tag, feedFetch(200, body)), /no entry for its current release 0\.5\.0/u);
});

await test('refuses an Intel feed that does not answer', async () => {
  await assert.rejects(intelFeedTag(tag, feedFetch(404, {})), /answered 404/u);
});
