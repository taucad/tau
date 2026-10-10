import { base64ToUint8Array } from 'uint8array-extras';
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { exportProjectionProjectClosure, writeProjectionProjectFile } from '#support/filesystem-projection.js';
import { readProjectCheckoutTree, readProjectStorageState, readProjectTree } from '#support/project-storage-state.js';

const manualMode = (import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> }).env[
  'VITE_TAU_E2E_ONE_SHOT_MANUAL'
];
const manualEnabled = manualMode === 'fix' || manualMode === 'linked' || manualMode === 'thumbnail';

const sourcePath = 'public/models/honeycomb.js';
// Match the installed replicad kernel's detectImport contract so the deliberate error executes.
const previousSource = `import { makeBaseBox } from 'replicad';
export default function main() { void makeBaseBox; throw new Error("one-shot-previous-source"); }
`;
const currentSource = `import { makeBaseBox } from 'replicad';
export default function main() { void makeBaseBox; throw new Error("one-shot-current-source"); }
`;

test('Fix with AI reads the current rooted source after an independent persistent replacement', async () => {
  await target.installAgentHostGatewayFixture([
    { text: 'Current source received.', usage: { inputTokens: 10, outputTokens: 4 } },
  ]);
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate('/__e2e/project-file-tree?chat=1');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  const acquiredValue1 = await target.currentUrl();
  const slug = new URL(acquiredValue1).pathname.split('/').at(-1);
  const acquiredValue2 = await readProjectStorageState();
  const config = acquiredValue2.configs.find(
    (candidate) => candidate.providerBasePath.split('/').findLast(Boolean) === slug,
  );
  if (!config) {
    throw new Error('The real seed did not register its project storage.');
  }
  try {
    const composer = selectors.getByCss('[aria-label="Ask Tau to build anything..."]:visible').first();
    await target.expectVisible(composer);
    await target.click(composer);
    await target.keyboardPress('ControlOrMeta+Slash');
    await target.click(selectors.getByRole('button', { name: /^Model: .*\. Change$/u }));
    await target.click(selectors.getByCss('[role="option"][data-value="anthropic-claude-haiku-4.5"]'));
    await target.expectVisible(selectors.getByRole('button', { name: /^Model: .*Haiku.*\. Change$/u }));
    await target.keyboardPress('Escape');
  } catch (error) {
    try {
      const document = await target.evaluate(() => ({
        pathname: location.pathname,
        viewport: { width: innerWidth, height: innerHeight },
        composers: [
          ...globalThis.document.querySelectorAll<HTMLElement>('[aria-label="Ask Tau to build anything..."]'),
        ].map((node) => ({
          rect: {
            x: node.getBoundingClientRect().x,
            y: node.getBoundingClientRect().y,
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
            top: node.getBoundingClientRect().top,
            right: node.getBoundingClientRect().right,
            bottom: node.getBoundingClientRect().bottom,
            left: node.getBoundingClientRect().left,
          },
          display: getComputedStyle(node).display,
          visibility: getComputedStyle(node).visibility,
          ancestor: node.closest<HTMLElement>('[data-slot]')?.dataset['slot'],
        })),
        buttons: [...globalThis.document.querySelectorAll('button[aria-label]')]
          .slice(0, 64)
          .map((node) => node.getAttribute('aria-label')),
        text: globalThis.document.body.textContent.slice(-8000),
      }));
      await target.writeArtifact(
        'projection-one-shot-composer-precondition.json',
        JSON.stringify({ config, originalFailure: String(error), document }, null, 2),
      );
      await target.screenshot(undefined, 'projection-one-shot-composer-precondition.png');
    } catch (captureError) {
      await target
        .writeArtifact(
          'projection-one-shot-composer-capture-error.json',
          JSON.stringify({ originalFailure: String(error), captureFailure: String(captureError) }),
        )
        .catch(() => undefined);
    }
    throw error;
  }
  if (manualEnabled) {
    const identity = await target.evaluate(installOneShotManualControls);
    const digest = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const sourceSha256 = await digest(
      new TextEncoder().encode(
        await target.commands.readFile('../../apps/ui-e2e/src/filesystem-projection-one-shot.spec.ts'),
      ),
    );
    const deadline = Date.now() + 240_000;
    const receipt = {
      identity,
      mode: manualMode,
      config,
      sourceSha256,
      deadline,
      instructions:
        'Principal owns Fix with AI, branch placement/Send and Update thumbnail gestures. Previous/current are explicit independent rooted mutations. Capture reads actual checkout/source/output. End finishes; no driver product gestures after READY.',
    };
    await target.writeArtifact('one-shot-manual-ready.json', JSON.stringify(receipt, null, 2));
    console.info('ONE SHOT MANUAL READY', JSON.stringify(receipt));
    let ended = false;
    let checkpoint = 0;
    while (!ended && Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop -- Only bounded explicit operator requests after READY.
      const requests = await target.evaluate(takeOneShotManualRequests);
      for (const { action, gesture } of requests) {
        if (action === 'end') {
          ended = true;
          break;
        }
        if (action === 'previous' || action === 'current') {
          // oxlint-disable-next-line no-await-in-loop -- Explicit independent rooted source mutation only.
          await writeProjectionProjectFile(config, sourcePath, action === 'previous' ? previousSource : currentSource);
        } else {
          const capturedAt = Date.now();
          const screenshotFile = `one-shot-manual-${++checkpoint}.png`;
          // oxlint-disable-next-line no-await-in-loop -- Principal explicitly names this screenshot checkpoint.
          const bytes = base64ToUint8Array(await target.screenshot(undefined, screenshotFile));
          // oxlint-disable-next-line no-await-in-loop -- Hash exact saved PNG bytes.
          const screenshotSha256 = await digest(bytes);
          // oxlint-disable-next-line no-await-in-loop -- Existing reader observes actual materialized backend checkout trees.
          const checkout = await readProjectCheckoutTree(config);
          // oxlint-disable-next-line no-await-in-loop -- Passive actual rooted source and output receipt.
          const tree = await readProjectTree(config);
          // oxlint-disable-next-line no-await-in-loop -- Actual gateway requests, never synthesized acceptance.
          const requests = await target.readAgentHostGatewayRequests();
          const closure =
            tree['/thumbnail.webp'] === undefined
              ? undefined
              : // oxlint-disable-next-line no-await-in-loop -- Export only after this operator checkpoint's source read settles.
                await exportProjectionProjectClosure(config, ['thumbnail.webp']);
          const thumbnail = closure?.files.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }));
          // oxlint-disable-next-line no-await-in-loop -- Hash actual current rooted source.
          const currentSourceSha256 = await digest(new TextEncoder().encode(tree[`/${sourcePath}`] ?? ''));
          // oxlint-disable-next-line no-await-in-loop -- Pair exact screenshot and output witnesses with source/root/gesture.
          await target.writeArtifact(
            `${screenshotFile}.json`,
            JSON.stringify(
              {
                ...receipt,
                gesture,
                capturedAt,
                screenshotFile,
                screenshotSha256,
                currentSourceSha256,
                checkoutFiles: Object.keys(checkout).slice(0, 128),
                checkoutFileCount: Object.keys(checkout).length,
                checkoutSourceMatches: Object.entries(checkout)
                  .filter(([path]) => path.endsWith(`/${sourcePath}`))
                  .map(([path, source]) => ({ path, matchesProjectSource: source === tree[`/${sourcePath}`] })),
                thumbnail,
                gatewayRequests: requests.length,
                currentSourceInGateway: JSON.stringify(requests).includes('one-shot-current-source'),
                previousSourceInGateway: JSON.stringify(requests).includes('one-shot-previous-source'),
              },
              null,
              2,
            ),
          );
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- Bounded cadence only; Principal owns all product gestures.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
    }
    expect(ended).toBe(true);
    return;
  }
  try {
    await writeProjectionProjectFile(config, sourcePath, previousSource);
    const issues = selectors.getByRole('button', { name: /^Build failed\. Issues:/u }).first();
    await target.expectVisible(issues, 180_000);
    await target.click(issues);
    await target.expectVisible(selectors.getByText('one-shot-previous-source', { exact: false }), 60_000);
    await writeProjectionProjectFile(config, sourcePath, currentSource);
    await target.expectVisible(selectors.getByText('one-shot-current-source', { exact: false }), 180_000);
    const acquiredValue3 = await readProjectTree(config);
    expect(acquiredValue3[`/${sourcePath}`]).toBe(currentSource);
    const acquiredValue4 = await target.readAgentHostGatewayRequests();
    expect(acquiredValue4).toHaveLength(0);
    await target.click(selectors.getByRole('button', { name: 'Fix with AI', exact: true }).first());
    await target.expectVisible(selectors.getByText('Current source received.', { exact: true }), 120_000);
    const requests = await target.readAgentHostGatewayRequests();
    expect(requests).toHaveLength(1);
    const request = requests[0] as { readonly messages?: unknown };
    expect(JSON.stringify(request.messages)).toContain(JSON.stringify(currentSource.trim()).slice(1, -1));
    expect(JSON.stringify(request.messages)).not.toContain('one-shot-previous-source');
  } catch (error) {
    await target.writeArtifact(
      'projection-one-shot-current-source-failure.json',
      JSON.stringify(
        {
          originalFailure: String(error),
          config,
          document: await target.evaluate(() => ({
            href: location.href,
            timeOrigin: performance.timeOrigin,
            text: document.body.textContent.slice(-12_000),
            issues: [...document.querySelectorAll('[aria-label^="Build failed. Issues:"]')].map((node) => ({
              label: node.getAttribute('aria-label'),
              expanded: node.getAttribute('aria-expanded'),
              controls: node.getAttribute('aria-controls'),
            })),
          })),
          physical: await readProjectTree(config),
          requests: await target.readAgentHostGatewayRequests(),
        },
        null,
        2,
      ),
    );
    await target.screenshot(undefined, 'projection-one-shot-current-source-failure.png');
    throw error;
  }
});

type OneShotManualAction = 'previous' | 'current' | 'capture' | 'end';
const installOneShotManualControls = () => {
  const state = { requests: [] as Array<{ action: OneShotManualAction; gesture: string }> };
  Object.assign(globalThis, { __tauOneShotManual: state });
  document.title = 'Tau one-shot manual';
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'One-shot fixture controls');
  panel.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
  const name = document.createElement('input');
  name.setAttribute('aria-label', 'Gesture checkpoint name');
  panel.append(name);
  const actions: OneShotManualAction[] = ['previous', 'current', 'capture', 'end'];
  for (const action of actions) {
    const button = document.createElement('button');
    button.textContent = `Fixture ${action}`;
    button.addEventListener('click', () => {
      if (action === 'capture' && !name.value.trim()) {
        name.focus();
        return;
      }
      if (state.requests.length < 16) {
        state.requests.push({ action, gesture: name.value.trim().slice(0, 160) });
      }
    });
    panel.append(button);
  }
  document.body.append(panel);
  return { href: location.href, title: document.title, timeOrigin: performance.timeOrigin };
};
const takeOneShotManualRequests = () =>
  (
    globalThis as typeof globalThis & {
      __tauOneShotManual: { requests: Array<{ action: OneShotManualAction; gesture: string }> };
    }
  ).__tauOneShotManual.requests.splice(0);
