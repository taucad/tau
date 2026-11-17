import '#components/select.browser.css';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Switch } from '@taucad/ui/components/switch';

afterEach(() => {
  cleanup();
});

/** WCAG 2.5.8 and the design policy's floor: every switch takes a pointer across a 24px-tall target. */
it.each(['sm', 'md', 'lg'] as const)('should take a pointer across a 24px-tall target at size %s', (size) => {
  render(
    <div style={{ padding: 32 }}>
      <Switch size={size} aria-label='Grid' />
    </div>,
  );
  const control = screen.getByRole('switch', { name: 'Grid' });
  const box = control.getBoundingClientRect();
  const centreX = box.left + box.width / 2;
  const centreY = box.top + box.height / 2;
  for (const y of [centreY - 11.5, centreY + 11.5]) {
    expect(document.elementFromPoint(centreX, y)?.closest('[role=switch]'), `${size} at y=${y}`).toBe(control);
  }
});
