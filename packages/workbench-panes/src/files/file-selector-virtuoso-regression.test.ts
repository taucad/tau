// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const fileSelectorSource = readFileSync(fileURLToPath(new URL('file-selector.tsx', import.meta.url)), 'utf8');

describe('FileBrowser Virtuoso integration', () => {
  it('should not use a custom Virtuoso Scroller that drops children (regression: empty popover when > virtualizationThreshold)', () => {
    expect(fileSelectorSource).toContain('<Virtuoso');
    // oxlint-disable-next-line unicorn-js/better-regex -- explicit regression guard for the dropped-`children` Scroller bug
    expect(fileSelectorSource).not.toMatch(/Scroller:\s*\(\{\s*children/);
  });

  it('should set defaultItemHeight so the list can size without a zero-height probe in flattened layouts', () => {
    // oxlint-disable-next-line unicorn-js/better-regex -- `{40}` is a JSX prop value, not a regex quantifier
    expect(fileSelectorSource).toMatch(/defaultItemHeight=\{40\}/);
  });
});
